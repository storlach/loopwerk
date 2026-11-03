// Eigene Instrumente und Live-Spielen (Krachwerk Scheibe 4, Spec krachwerk-4-kit §5, ADR 012): project.instruments als
// Sampler-Instrumente mit einer Zone aus einem eigenen Sound (gebackener Klang), Grundton per YIN, Pads und Tasten jetzt
// spielen über den Eingang der Spur. Gerendert wird weiter über renderPattern → pat-… → startVoice (eine Signalkette).

import { registerInstrument, unregisterInstrument, loadInstrument, loadedInstrument, playSampled } from './sampler.js';
import { previewDrum } from './instruments.js';
import { normalizeInstrument } from './model.js';
import { recipeKey, normalizeRecipe } from './recipe.js';
import { detectPitch, toMono, midiOf } from './dsp/pitch.js';

// Vorlauf eines Live-Anschlags auf der Audio-Uhr: klingt sofort und gleichmäßig (nicht „so bald wie möglich“)
export const LIVE_LEAD = 0.005;
const WORKER_SECONDS = 3; // ab hier Tonhöhe im Rechen-Worker
const SURE = 0.8; // Sicherheit eines YIN-Rahmens
const MIN_SURE = 0.1; // Anteil sicherer Rahmen, sonst „kein klarer Ton“
export const FALLBACK_ROOT = 60;

// Schlüssel eines Instruments: Definition + Zustand und Rezept seines Sounds (Patterns rendern bei Änderung neu)
export function instrumentKey(project, id, library) {
  const inst = normalizeInstrument(project?.instruments?.[id]);
  if (!inst) return '';
  const s = library?.get(inst.sampleId);
  return `${JSON.stringify(inst)}|${s && !s.missing ? 1 : 0}|${recipeKey(normalizeRecipe(project?.recipes?.[inst.sampleId]))}`;
}

const known = new Map(); // id → Schlüssel der registrierten Fassung

// Instrumente des Projekts in der Sampler-Registry: neu bei geändertem Schlüssel, entfernte austragen
export function syncInstruments(project, library) {
  const list = project?.instruments && typeof project.instruments === 'object' ? project.instruments : {};
  for (const [id, raw] of Object.entries(list)) {
    const inst = normalizeInstrument(raw);
    if (!inst) continue;
    const key = instrumentKey(project, id, library);
    if (known.get(id) === key) continue;
    known.set(id, key);
    registerInstrument({
      id, label: inst.name, category: 'own', own: true, fallback: 'pluck', gain: 1, sustain: false, release: inst.release, library,
      zones: [{ midi: inst.root, cents: inst.cents, sampleId: inst.sampleId }],
    });
  }
  for (const id of [...known.keys()]) if (!list[id]) { unregisterInstrument(id); known.delete(id); }
}

// Grundton eines Klangs (AudioBuffer): Median der sicheren YIN-Rahmen (≥ 0,8) unter den hörbaren, gerundet, Rest in Cent.
// Unter 10 % sicheren Rahmen: { root 60, cents 0, sure false } („Kein klarer Ton – spielt als C4.“)
export async function detectRoot(buffer) {
  const chs = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let track;
  if (buffer.duration >= WORKER_SECONDS) {
    const { runJob } = await import('./dsp/run.js');
    track = await runJob('pitch', { chs, sampleRate: buffer.sampleRate });
  } else track = detectPitch(toMono(chs), buffer.sampleRate);
  const { f0, conf, rms } = track;
  let max = 0;
  for (let i = 0; i < rms.length; i++) if (rms[i] > max) max = rms[i];
  let loud = 0;
  const sure = [];
  for (let i = 0; i < f0.length; i++) {
    if (!(rms[i] > max * 0.1) || rms[i] < 1e-4) continue;
    loud++;
    if (conf[i] >= SURE && f0[i] > 0) sure.push(midiOf(f0[i]));
  }
  if (!loud || sure.length < loud * MIN_SURE) return { root: FALLBACK_ROOT, cents: 0, sure: false };
  sure.sort((a, b) => a - b);
  const m = sure.length % 2 ? sure[sure.length >> 1] : (sure[sure.length / 2 - 1] + sure[sure.length / 2]) / 2;
  const root = Math.min(96, Math.max(36, Math.round(m)));
  const cents = Math.min(50, Math.max(-50, Math.round((m - root) * 100)));
  return { root, cents, sure: true };
}

// „Als Instrument“: Grundton auf dem gebackenen Sound messen (gemerkt am Sound je Rezept, außerhalb von Rückgängig)
// und das Instrument anlegen (ein Schritt). Rückgabe { id, root, cents, sure } | null
export async function instrumentFromSound({ store, library, sampleId, name = null }) {
  await library.applyRecipes?.(store.project);
  const s = await library.ensure(sampleId);
  const buf = s && !s.missing ? library.source(s) : null;
  if (!buf) return null;
  const rk = recipeKey(normalizeRecipe(store.project.recipes?.[sampleId]));
  let found = s.learnedRoot?.key === rk ? s.learnedRoot : null;
  if (!found) {
    found = { key: rk, ...(await detectRoot(buf)) };
    s.learnedRoot = found;
  }
  const id = store.addInstrument({ name: name || s.name || 'Instrument', sampleId, root: found.root, cents: found.cents });
  return id ? { id, root: found.root, cents: found.cents, sure: found.sure } : null;
}

// Eingang der Spur (Effekte hörbar), sonst die Summe
const inputOf = (engine, trackId) => engine.trackInput(trackId) ?? engine.mix.master;

// Pad jetzt spielen (Kit-Werkbank, Pad-Wand): map = Kit-Map eines Projekt-Kits oder Synth-Kit-ID.
// Rückgabe { when, now, dest } (Kontextzeit des Anschlags = now + LIVE_LEAD)
export async function playPad({ engine, library, map, row, trackId = null, vel = 1 }) {
  await engine._ensure();
  if (map && typeof map === 'object' && map[row]) await library.ensure?.(map[row]);
  const ctx = engine.ctx;
  const now = ctx.currentTime;
  const when = now + LIVE_LEAD;
  const dest = inputOf(engine, trackId);
  previewDrum(ctx, dest, map, row, library, when, vel);
  return { when, now, dest };
}

// Taste jetzt spielen (Instrument-Werkbank): dur in Sekunden, ohne dur klingt sie bis stop().
// Rückgabe { when, now, dest, stop } bzw. null (Instrument nicht spielbar)
export async function playKey({ engine, store, library, instrumentId, pitch, trackId = null, vel = 1, dur = null }) {
  await engine._ensure();
  syncInstruments(store.project, library);
  const loaded = loadedInstrument(instrumentId) ?? await loadInstrument(instrumentId).catch(() => null);
  if (!loaded) return null;
  const ctx = engine.ctx;
  const now = ctx.currentTime;
  const when = now + LIVE_LEAD;
  const dest = inputOf(engine, trackId);
  const voice = playSampled(ctx, dest, loaded, pitch, when, dur, vel);
  return { when, now, dest, stop: () => voice.release(ctx.currentTime) };
}
