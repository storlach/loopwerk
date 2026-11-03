// Festhalten (Krachwerk 3a, Spec krachwerk-3-festhalten §6): einen Bereich des Songs als neuen Sound „Schleife N“.
// Gerendert wird mit derselben Kette wie der Export (renderProject → buildMix, clipPieces, Kurven), nur ohne Summe
// (master: false), weil das Ergebnis wieder durch die Summe läuft. Eigener Offline-Kontext: der Song spielt weiter.

import { renderProject } from './engine.js';
import { EPS } from './model.js';
import { lsKey } from './edition.js';

export const MAX_TAIL = 8;           // Sekunden Ausklang höchstens
const TAIL_WIN = 0.05;               // Fenster für das Ende des Ausklangs
const TAIL_FLOOR = 10 ** (-60 / 20); // −60 dBFS RMS
const MAX_SRC = 16;

// Was gerendert wird: bei clipIds nur diese Clips, bei fx:false ohne Spur-Effekte; Solo/Stumm wie im Song
export function freezeView(project, { clipIds = null, fx = true } = {}) {
  const keep = clipIds ? new Set(clipIds) : null;
  return {
    ...project,
    tracks: project.tracks.map((t) => ({ ...t, clips: keep ? t.clips.filter((c) => keep.has(c.id)) : t.clips, ...(fx ? {} : { fx: null }) })),
  };
}

// Bereich einer Auswahl: frühester Anfang bis spätestes Ende
export function selectionRange(project, clipIds) {
  const ids = new Set(clipIds);
  let from = Infinity, to = -Infinity;
  for (const t of project.tracks) for (const c of t.clips) if (ids.has(c.id)) { from = Math.min(from, c.startBeat); to = Math.max(to, c.startBeat + c.lengthBeats); }
  return from < to ? { fromBeat: from, toBeat: to } : null;
}

// Ende des Ausklangs ab Frame n0: nach dem letzten 50-ms-Fenster mit RMS ≥ −60 dBFS (Pausen zwischen Echos zählen mit)
export function tailEnd(chs, n0, sampleRate) {
  const w = Math.max(1, Math.round(TAIL_WIN * sampleRate));
  const len = chs[0].length;
  let last = n0;
  for (let a = n0; a < len; a += w) {
    const z = Math.min(len, a + w);
    for (const d of chs) {
      let e = 0;
      for (let i = a; i < z; i++) e += d[i] * d[i];
      if (Math.sqrt(e / (z - a)) >= TAIL_FLOOR) { last = z; break; }
    }
  }
  return last;
}

// Ausklang an den Anfang falten (wie renderPattern): out[i % N] += out[i] für i ≥ N
export function foldInto(d, N, end) {
  const out = d.slice(0, N);
  for (let i = N; i < end; i++) out[i % N] += d[i];
  return out;
}

// Rendert [fromBeat, toBeat) ohne Summe. fold: Ausklang an den Anfang (Ergebnis genau N Frames), sonst angehängt.
// Rückgabe { buffer, frames: N, tail: Frames Ausklang (vor dem Falten), peak }
export async function renderFreeze(project, library, { fromBeat, toBeat, clipIds = null, fx = true, fold = true, sampleRate = 44100, maxTail = MAX_TAIL, onProgress } = {}) {
  const spb = 60 / project.bpm;
  const N = Math.max(1, Math.round((toBeat - fromBeat) * spb * sampleRate));
  const view = freezeView(project, { clipIds, fx });
  const raw = await renderProject(view, library, { sampleRate, fromBeat, toBeat, tailSeconds: maxTail, master: false, onProgress });
  const chs = [raw.getChannelData(0), raw.getChannelData(1)];
  const end = tailEnd(chs, N, sampleRate);
  const length = fold ? N : end;
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  let peak = 0;
  chs.forEach((d, c) => {
    const out = fold ? foldInto(d, N, end) : d.slice(0, end);
    for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
    buffer.copyToChannel(out, c);
  });
  return { buffer, frames: N, tail: end - N, peak };
}

// Nächster freier Name „Schleife N“
export function nextLoopName(library, project = null) {
  let n = 0;
  const names = [...library.list().map((s) => s.name), ...Object.values(project?.recipes || {}).map((r) => r?.name)];
  for (const x of names) { const m = /^Schleife (\d+)$/.exec(String(x || '')); if (m) n = Math.max(n, +m[1]); }
  return `Schleife ${n + 1}`;
}

// Gemerkte Voreinstellungen (Feinheiten im Reiter Clip): mit Spur-Effekten, Ausklang falten (bei Loop-Bereich), Quellen stumm
const PREFS_KEY = () => lsKey('loopwerk.freeze');
export const FREEZE_DEFAULTS = { fx: true, fold: true, mute: true };
export function freezePrefs() {
  try { return { ...FREEZE_DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY())) || {}) }; } catch { return { ...FREEZE_DEFAULTS }; }
}
export function setFreezePrefs(patch) {
  const next = { ...freezePrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY(), JSON.stringify(next)); } catch { /* egal */ }
  return next;
}

// Ganze Handlung: Quellen bestimmen, rendern, Sound anlegen (own: IndexedDB; ohne own nur in der Library), store.freeze.
// Loop-Bereich: { fromBeat, toBeat }; Auswahl: { clipIds } (Bereich = frühester Anfang bis spätestes Ende, Ausklang
// angehängt). Rückgabe { sampleId, trackId, clipId, name } oder { error: 'empty' | 'silent' | 'tracks' }.
export async function freezeRange({ store, library, own = null, fromBeat, toBeat, clipIds = null, fx, fold, mute, onProgress } = {}) {
  const prefs = freezePrefs();
  fx ??= prefs.fx;
  mute ??= prefs.mute;
  fold ??= clipIds ? false : prefs.fold;
  if (clipIds) ({ fromBeat, toBeat } = selectionRange(store.project, clipIds) ?? {});
  if (!(toBeat > fromBeat + EPS)) return { error: 'empty' };
  if (store.project.tracks.length >= 16) return { error: 'tracks' };
  const sources = clipIds ? clipIds.filter((id) => store.findClip(id)) : store.audibleClipsIn(fromBeat, toBeat);
  if (!sources.length) return { error: 'empty' };
  const project = store.project;
  const spb = 60 / project.bpm;
  const r = await renderFreeze(project, library, { fromBeat, toBeat, clipIds: sources, fx, fold, onProgress });
  if (r.peak < 1e-4) return { error: 'silent' };
  const src = [];
  for (const id of sources) { const c = store.findClip(id)?.clip; if (c && !src.includes(c.sampleId) && src.length < MAX_SRC) src.push(c.sampleId); }
  const name = nextLoopName(library, store.project);
  const beats = toBeat - fromBeat;
  const kind = fold ? 'loop' : 'oneshot';
  const opts = { name, buffer: r.buffer, kind, beats: fold ? beats : null, source: 'Festhalten', from: 'freeze', src, bits: r.peak > 1 ? 32 : 16 };
  if (fold) opts.cls = 'loop';
  let sample;
  if (own) sample = await own.create(opts);
  else {
    const id = 'own-fz' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sample = await library.add({
      id, name, category: 'own', kind, beats: opts.beats, origin: 'Eigene', source: 'Festhalten', license: null, created: Date.now(),
      made: { cls: opts.cls ?? null, tags: [], from: 'freeze', src }, orig: r.buffer, duration: r.buffer.duration,
      ...(fold ? { bpm: Math.round((beats * 60 / r.buffer.duration) * 100) / 100 } : {}),
    });
  }
  // Angehängter Ausklang: Clip so lang wie der Sound (auf ganze Schläge, wie padOneShot)
  const lengthBeats = fold ? beats : Math.max(beats, Math.ceil(r.buffer.duration / spb - 1e-6));
  const res = store.freeze({ fromBeat, toBeat, sampleId: sample.id, clipIds: sources, mute, lengthBeats, loop: fold, name });
  if (!res) return { error: 'tracks', sampleId: sample.id };
  return { sampleId: sample.id, name, ...res };
}
