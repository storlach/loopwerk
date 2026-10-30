// Sampler: echte Instrumente aus Einzelaufnahmen (Zonen). Eine Note nimmt die nächste Zone und wird über
// playbackRate umgestimmt. Gleiche Signalkette für AudioContext und OfflineAudioContext:
// BufferSource (Umstimmung, ggf. Schleife) → Gain (Anschlag, Lautstärke, Ende) → Ziel.

import { SAMPLED_INSTRUMENTS } from './instruments-vcsl.js';

const SR = 44100;
const BASE = 'assets/samples/vcsl/inst/';
export const ATTACK = 0.003; // Anschlag-Fade gegen Klicks
const END_TAU = 0.008; // weiches Ende nicht gehaltener Klänge nach Notenende + release
const HOLD_MAX = 12; // Sicherung für gehaltene Schleifen ohne Notenende

const registry = new Map();
for (const inst of SAMPLED_INSTRUMENTS) registry.set(inst.id, inst);
const pending = new Map(); // id → Promise des Ladens
const ready = new Map(); // id → geladenes Instrument (synchron abfragbar)

export const sampledInstruments = () => [...registry.values()];
export const getInstrument = (id) => registry.get(id);
export const isSampled = (id) => registry.has(id);
export const isLoaded = (id) => ready.has(id);
export const loadedInstrument = (id) => ready.get(id) ?? null;
export const loadState = (id) => (ready.has(id) ? 'ready' : pending.has(id) ? 'loading' : 'idle');

// Weitere Instrumente zur Laufzeit (Tests, später eigene Instrumente)
export function registerInstrument(def) {
  registry.set(def.id, def);
  pending.delete(def.id);
  ready.delete(def.id);
}

// Dateiname allein → Ordner des Instruments; mit Pfad oder als URL → unverändert
export function zoneUrl(inst, file) {
  return file.includes('/') || file.includes(':') ? file : `${BASE}${inst.id}/${file}`;
}

let decoder = null;
function decodeCtx() {
  decoder ??= new OfflineAudioContext(1, 1, SR);
  return decoder;
}

// Abtastrate aus dem WAV-Kopf (für Schleifenpunkte in Frames)
function wavRate(ab) {
  const v = new DataView(ab);
  if (ab.byteLength < 28 || v.getUint32(0, false) !== 0x52494646) return null; // „RIFF“
  let p = 12;
  while (p + 8 <= ab.byteLength) {
    const id = v.getUint32(p, false);
    const size = v.getUint32(p + 4, true);
    if (id === 0x666d7420) return v.getUint32(p + 12, true); // „fmt “
    p += 8 + size + (size & 1);
  }
  return null;
}

// Stille vor dem Einsatz überspringen (bis 1 ms vor −40 dB unter dem Spitzenwert), damit Noten pünktlich klingen
function onsetOffset(buffer) {
  const d = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const thr = peak * 0.01;
  let i = 0;
  while (i < d.length && Math.abs(d[i]) <= thr) i++;
  return Math.max(0, i - Math.round(0.001 * buffer.sampleRate)) / buffer.sampleRate;
}

async function loadZone(inst, zone) {
  const res = await fetch(zoneUrl(inst, zone.file));
  if (!res.ok) throw new Error(`${zone.file}: ${res.status}`);
  const ab = await res.arrayBuffer();
  const rate = wavRate(ab);
  const buffer = await decodeCtx().decodeAudioData(ab);
  const out = { midi: zone.midi, buffer, offset: onsetOffset(buffer), loopStart: 0, loopEnd: 0 };
  if (zone.loopEnd > zone.loopStart) {
    // Schleifenpunkte in Sekunden; Werte jenseits der Dauer sind Frames der Datei
    const frames = zone.loopEnd > buffer.duration + 1e-3;
    const k = frames ? 1 / (rate || buffer.sampleRate) : 1;
    out.loopStart = zone.loopStart * k;
    out.loopEnd = Math.min(buffer.duration, zone.loopEnd * k);
  }
  return out;
}

// Laden auf Abruf, einmal je Instrument. AudioBuffer gelten in jedem Kontext.
export function loadInstrument(id) {
  if (ready.has(id)) return Promise.resolve(ready.get(id));
  if (pending.has(id)) return pending.get(id);
  const inst = registry.get(id);
  if (!inst) return Promise.reject(new Error(`Instrument ${id} unbekannt`));
  const job = Promise.all(inst.zones.map((z) => loadZone(inst, z))).then((zones) => {
    zones.sort((a, b) => a.midi - b.midi);
    const loaded = { inst, zones };
    if (registry.get(id) === inst) ready.set(id, loaded);
    pending.delete(id);
    return loaded;
  }, (err) => {
    pending.delete(id); // später erneut versuchen
    throw err;
  });
  pending.set(id, job);
  return job;
}

// Nächste Zone; bei Gleichstand die tiefere
export function nearestZone(zones, pitch) {
  let best = zones[0];
  for (const z of zones) if (Math.abs(z.midi - pitch) < Math.abs(best.midi - pitch)) best = z;
  return best;
}

// Eine Note spielen. when, dur in Sekunden Kontextzeit; ohne dur klingt sie bis voice.release(at).
// Ende: gehaltene Instrumente (sustain) klingen bis Notenende und verklingen über `release`;
// die übrigen klingen natürlich aus und werden nach Notenende + release weich beendet.
export function playSampled(ctx, dest, loaded, pitch, when, dur = null, vel = 1) {
  const { inst, zones } = loaded;
  const z = nearestZone(zones, pitch);
  const src = ctx.createBufferSource();
  src.buffer = z.buffer;
  src.playbackRate.value = 2 ** ((pitch - z.midi) / 12);
  const looped = !!inst.sustain && z.loopEnd > z.loopStart;
  if (looped) {
    src.loop = true;
    src.loopStart = z.loopStart;
    src.loopEnd = z.loopEnd;
  }
  const g = ctx.createGain();
  const amp = (inst.gain ?? 1) * vel;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + ATTACK);
  src.connect(g).connect(dest);
  src.onended = () => g.disconnect();
  src.start(when, z.offset);
  if (looped && dur == null) src.stop(when + HOLD_MAX); // release() setzt später das eigentliche Ende
  const rel = Math.max(0.01, inst.release ?? 0.3);
  let released = false;
  const voice = {
    release(at) {
      if (released) return;
      released = true;
      at = Math.max(at, when + ATTACK);
      const fadeAt = inst.sustain ? at : at + rel;
      // Der Ausklang beginnt nie vor dem Ende der Anschlagsrampe: dort steht der Pegel auf amp.
      // sustain: nach `release` bei −60 dB; sonst nach 50 ms bei −54 dB
      g.gain.setValueAtTime(amp, fadeAt);
      g.gain.setTargetAtTime(0, fadeAt, inst.sustain ? rel / 7 : END_TAU);
      src.stop(inst.sustain ? at + rel + 0.06 : fadeAt + 0.08);
    },
  };
  if (dur != null) voice.release(when + dur);
  return voice;
}

// Wie lange eine Note nach ihrem Ende höchstens nachklingt
export const releaseTail = (inst) => Math.max(0.01, inst.release ?? 0.3) + 0.1;

// Synth-Ersatz, solange ein Instrument noch lädt: nach Name, Familie und Kennung
const FALLBACK = [
  [/harf|harp|gitar|guitar|zupf|pluck|banjo|ukul|mandolin|zither|psalter|strum|koto|plucked/i, 'pluck'],
  [/fl[öo]te|flute|recorder|blockfl|pfeif|whistle|okarin|ocarin|pan/i, 'flute'],
  [/orgel|organ|harmonium|akkordeon|accordion|harmonika|harmonica/i, 'organ'],
  [/glock|bell|marimba|vibra|xylo|celest|kalimba|balafon|mallet/i, 'bell'],
  [/streich|string|geige|violin|viola|cello/i, 'strings'],
  [/bl[äa]s|blech|brass|trompete|trumpet|horn|posaune|trombone|tuba|sax/i, 'brass'],
  [/bass/i, 'bass'],
];
export function fallbackPreset(inst) {
  if (!inst) return 'piano';
  if (inst.fallback) return inst.fallback;
  const text = `${inst.id} ${inst.label} ${inst.category}`;
  return FALLBACK.find(([re]) => re.test(text))?.[1] ?? 'piano';
}
