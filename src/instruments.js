// Instrumente: Beat-Patterns (Stepsequencer) und Melodie-Patterns (Piano-Roll) werden zu Loops gerendert.
// So laufen sie durch dieselbe Engine wie jeder andere Clip (Fades, Effekte, Export, Rückgängig).

import { createKit, biteStage, chokeVoice } from './samples.js';
import { isGuitarPreset, renderGuitarNotes } from './dsp/guitar.js';
import { kitLevel, presetLevel, PATTERN_PEAK_MAX } from './levels.js';
import {
  sampledInstruments, isSampled, getInstrument, loadInstrument, loadedInstrument, playSampled, fallbackPreset, releaseTail,
} from './sampler.js';

export const STEPS_PER_BEAT = 4; // 16tel-Raster

export const DRUM_ROWS = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'clap', label: 'Clap' },
  { id: 'hat', label: 'Hi-Hat zu' },
  { id: 'open', label: 'Hi-Hat offen' },
  { id: 'tomLo', label: 'Tom tief' },
  { id: 'tomHi', label: 'Tom hoch' },
  { id: 'crash', label: 'Becken' },
];

// MIDI-Anschlag (1–127) → Anschlag der Note (0,1–1): leicht gekrümmt, damit auch leises Spiel hörbar bleibt
export const midiVelocity = (v) => Math.min(1, Math.max(0.1, (Math.max(0, v) / 127) ** 0.8));

// General-MIDI-Schlagzeug → Zeile des Beat-Editors (Kanal egal; unbekannte Noten gibt es nicht)
export const GM_DRUMS = {
  35: 'kick', 36: 'kick',
  37: 'snare', 38: 'snare', 40: 'snare',
  39: 'clap',
  42: 'hat', 44: 'hat',
  46: 'open',
  41: 'tomLo', 43: 'tomLo', 45: 'tomLo',
  47: 'tomHi', 48: 'tomHi', 50: 'tomHi',
  49: 'crash', 51: 'crash', 52: 'crash', 55: 'crash', 57: 'crash', 59: 'crash',
};

export const KITS = [
  { id: 'elektro', label: 'Elektro (synthetisch)' },
  {
    id: 'techno', label: 'Techno (909-artig)',
    labels: { snare: 'Rim', tomLo: 'Rumble', tomHi: 'Clang', crash: 'Ride' },
  },
  // Melodic Techno: lange Kick mit Klick und Biss, knappe Hats für Offbeats, breite Clap, Rim (synthetisch)
  {
    id: 'druck', label: 'Techno (Druck)',
    labels: { snare: 'Rim', tomHi: 'Perc', crash: 'Ride' },
  },
  {
    id: 'akustik', label: 'Akustik (Sonic Pi)', kickHz: 58,
    map: {
      kick: 'sp-bd-haus', snare: 'sp-drum-snare-hard', clap: 'sp-perc-snap', hat: 'sp-drum-cymbal-closed',
      open: 'sp-drum-cymbal-open', tomLo: 'sp-drum-tom-lo-hard', tomHi: 'sp-drum-tom-mid-hard', crash: 'sp-drum-cymbal-hard',
    },
  },
];

export const SYNTH_PRESETS = [
  { id: 'pluck', label: 'Pluck', category: 'synth' },
  { id: 'lead', label: 'Lead', category: 'synth' },
  { id: 'piano', label: 'E-Piano', category: 'chords' },
  { id: 'organ', label: 'Orgel', category: 'chords' },
  { id: 'flute', label: 'Flöte', category: 'synth' },
  { id: 'bell', label: 'Glocke', category: 'synth' },
  { id: 'strings', label: 'Streicher', category: 'chords' },
  { id: 'brass', label: 'Blech', category: 'synth' },
  { id: 'bass', label: 'Bass', category: 'bass' },
  { id: 'acid', label: 'Acid-Bass', category: 'bass' },
  { id: 'rollbass', label: 'Rollbass', category: 'bass' },
  { id: 'pad', label: 'Fläche', category: 'chords' },
  // E-Gitarre: Saiten, Verstärker und Effekte selbst gerechnet (src/dsp/guitar.js)
  { id: 'guitar', label: 'E-Gitarre clean', category: 'chords' },
  { id: 'guitarDrive', label: 'E-Gitarre verzerrt', category: 'chords' },
  { id: 'guitarCrunch', label: 'E-Gitarre Crunch', category: 'chords' },
  { id: 'guitarMetal', label: 'E-Gitarre Metal', category: 'chords' },
  { id: 'guitarFuzz', label: 'E-Gitarre Fuzz', category: 'chords' },
];

// Echte Instrumente (Sampler, src/sampler.js) als weitere Klänge; Kennung = Instrument-id.
// Farbe im Arranger nach Familie: Bass, Tasten/Streicher/Flächen wie Akkorde, sonst Synth.
function colorCat(inst) {
  const t = `${inst.id} ${inst.category}`;
  if (/bass/i.test(t)) return 'bass';
  if (/key|tast|piano|klavier|fl[üu]gel|orgel|organ|string|streich|pad|chord/i.test(t)) return 'chords';
  return 'synth';
}
const synthIds = new Set(SYNTH_PRESETS.map((p) => p.id));
export function sampledPresets() {
  return sampledInstruments().filter((i) => !synthIds.has(i.id))
    .map((i) => ({ id: i.id, label: i.label, category: colorCat(i), sampled: true }));
}
export const allPresets = () => [...SYNTH_PRESETS, ...sampledPresets()];
export const presetInfo = (id) => SYNTH_PRESETS.find((p) => p.id === id) ?? sampledPresets().find((p) => p.id === id);
const sampled = (preset) => !synthIds.has(preset) && isSampled(preset);

// Instrument im Hintergrund laden (Auswahl im Editor, Öffnen einer Melodie); Fehler nur melden
export function preparePreset(preset) {
  if (!sampled(preset)) return null;
  return loadInstrument(preset).catch((err) => { console.warn(`Instrument ${preset}: ${err.message}`); return null; });
}

// Wie ein Klang eine Note spielt (b = Schlag, len = Länge in Schlägen, v = Stärke)
const PLAY = {
  lead: (k, p, b, len, v) => k.lead(b, p, len, v),
  bass: (k, p, b, len, v) => k.bass(b, p, len, v),
  pad: (k, p, b, len, v) => k.pad(b, [p], len, v),
  piano: (k, p, b, len, v) => k.piano(b, p, len, v),
  organ: (k, p, b, len, v) => k.organ(b, p, len, v),
  flute: (k, p, b, len, v) => k.flute(b, p, len, v),
  bell: (k, p, b, len, v) => k.bell(b, p, len, v),
  strings: (k, p, b, len, v) => k.strings(b, p, len, v),
  brass: (k, p, b, len, v) => k.brass(b, p, len, v),
  acid: (k, p, b, len, v) => k.acid(b, p, len * 0.9, { accent: v > 0.9 }),
  rollbass: (k, p, b, len, v) => k.rollBass(b, p, len * 0.9, v),
};
export function playNote(kit, preset, pitch, beat, len, vel, spb) {
  const fn = PLAY[preset];
  if (fn) fn(kit, pitch, beat, len, vel);
  else kit.pluck(beat, pitch, vel, Math.min(0.6, Math.max(0.12, len * spb)));
}

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
export const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const drumLabel = (kitId, rowId) => KITS.find((k) => k.id === kitId)?.labels?.[rowId] ?? DRUM_ROWS.find((r) => r.id === rowId)?.label ?? rowId;

// Synthetische Kits: welche Stimme des Klangbaukastens eine Zeile spielt (b = Schlag, v = Stärke). Hats und Rim spielen
// im Kit lauter als in den Bibliotheks-Loops (dort pegelt die Spitze ein): lagen 13–23 LU unter der Kick.
const HAT_BOOST = 1.5;
const RIM_BOOST = 1.7;
const SYNTH_DRUMS = {
  elektro: {
    kick: (k, b, v) => k.kick(b, v), snare: (k, b, v) => k.snare(b, v), clap: (k, b, v) => k.clap(b, v),
    hat: (k, b, v) => k.hat(b, v * HAT_BOOST), open: (k, b, v) => k.hat(b, v * HAT_BOOST, true), tomLo: (k, b, v) => k.tom(b, 95, v),
    tomHi: (k, b, v) => k.tom(b, 150, v), crash: (k, b, v) => k.crash(b, v),
  },
  techno: {
    kick: (k, b, v) => k.kick909(b, v), snare: (k, b, v) => k.rim(b, v * RIM_BOOST), clap: (k, b, v) => k.clap(b, v),
    hat: (k, b, v) => k.hat909(b, v * HAT_BOOST * 1.2), open: (k, b, v) => k.hat909(b, v * HAT_BOOST * 1.2, true),
    tomLo: (k, b, v) => k.rumble(b, 33, 0.5, v),
    tomHi: (k, b, v) => k.clang(b, 310, v), crash: (k, b, v) => k.ride(b, v),
  },
  druck: {
    kick: (k, b, v) => k.kickPro(b, v, { ...KICK_VOICES.druck.shape, ...KICK_VOICES.druck.defaults }),
    snare: (k, b, v) => k.rim(b, v * RIM_BOOST), clap: (k, b, v) => k.clapDruck(b, v),
    hat: (k, b, v) => k.hatDruck(b, v), open: (k, b, v) => k.hatDruck(b, v, true), tomLo: (k, b, v) => k.tom(b, 82, v),
    tomHi: (k, b, v) => k.conga(b, 330, v, { decay: 0.12, slap: 0.4 }), crash: (k, b, v) => k.ride(b, v),
  },
};

// ---------- Kick-Regler (Druck) ----------
// pattern.kick = { pitch (Hz), length (s), click (0–1), bite (0–1) } ist optional. Ohne das Feld klingt jedes Kit wie
// bisher (gleicher Code-Weg); mit dem Feld spielt die Kick-Zeile eine einstellbare Fassung: synthetische Kits über
// kit.kickPro mit dem Charakter des Kits, Sample-Kits über Tonhöhe (playbackRate), Länge (Fade), Biss (Shaper) und
// Klick (zusätzliche Schicht). defaults: so stehen die Regler, solange das Feld fehlt (nahe am Klang des Kits).
export const KICK_RANGE = { pitch: [40, 70], length: [0.15, 1.5], click: [0, 1], bite: [0, 1] };
export const KICK_VOICES = {
  elektro: { defaults: { pitch: 46, length: 0.42, click: 0, bite: 0 }, shape: { ratio: 165 / 46, sweep: 0.12, hold: false } },
  techno: { defaults: { pitch: 48, length: 0.5, click: 0.3, bite: 0.3 }, shape: { ratio: 290 / 48, sweep: 0.06, hold: false } },
  druck: { defaults: { pitch: 49, length: 0.9, click: 0.6, bite: 0.35 }, shape: { ratio: 7, sweep: 0.08, hold: true } },
};
const kitDef = (kitId) => KITS.find((k) => k.id === kitId);
// Regler-Stand ohne eigenes Feld: Synth-Kits aus KICK_VOICES, Sample-Kits aus dem Sample (Grundton kickHz, Länge)
export function kickDefaults(kitId, library) {
  const k = kitDef(kitId);
  if (k?.map) {
    const dur = library?.get(k.map.kick)?.orig?.duration ?? 0.4;
    return { pitch: k.kickHz ?? 55, length: clampTo(dur, KICK_RANGE.length), click: 0, bite: 0 };
  }
  return { ...(KICK_VOICES[kitId] ?? KICK_VOICES.elektro).defaults };
}
const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
// Eingestellte Werte des Patterns (vollständig, in den Grenzen) oder null = Kit-Kick wie bisher
export function kickParams(pattern, library) {
  if (!pattern?.kick || typeof pattern.kick !== 'object') return null;
  const base = kickDefaults(pattern.kit, library);
  const out = {};
  for (const [key, range] of Object.entries(KICK_RANGE)) {
    const v = Number(pattern.kick[key]);
    out[key] = clampTo(Number.isFinite(v) ? v : base[key], range);
  }
  return out;
}
// Eine Kick mit Reglerwerten; beat in Schlägen des Kits (Vorhören: spb = 1, beat = Kontextzeit). → Stimme mit choke(t)
const samplePeaks = new WeakMap();
function peakOf(buf) {
  let p = samplePeaks.get(buf);
  if (p == null) {
    p = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) for (const x of buf.getChannelData(c)) p = Math.max(p, Math.abs(x));
    samplePeaks.set(buf, p);
  }
  return p;
}
function playKick(ctx, out, kit, kitId, beat, spb, vel, kp, library) {
  const k = kitDef(kitId);
  if (k?.map) {
    const s = library?.get(k.map.kick);
    if (!s?.orig) return null;
    const t = beat * spb;
    const src = ctx.createBufferSource();
    src.buffer = library.source?.(s) ?? s.orig;
    src.playbackRate.value = kp.pitch / (k.kickHz ?? 55);
    const voice = chokeVoice(ctx, out);
    const g = ctx.createGain();
    // Platz für den Klick wie bei kickPro
    const level = vel * (1 - 0.3 * kp.click);
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(level, t + kp.length * 0.6);
    g.gain.linearRampToValueAtTime(0, t + kp.length);
    let node = src;
    if (kp.bite > 0) {
      // Biss auf das auf ±1 gebrachte Sample, danach zurück: die Spitze bleibt höchstens, wo sie war
      const pk = Math.max(1e-6, peakOf(src.buffer));
      const pre = ctx.createGain();
      pre.gain.value = 1 / pk;
      const b = biteStage(ctx, kp.bite);
      const post = ctx.createGain();
      post.gain.value = pk;
      src.connect(pre).connect(b.input);
      node = b.output.connect(post);
    }
    node.connect(g).connect(voice.input);
    src.start(t);
    src.stop(t + kp.length + 0.01);
    if (kp.click > 0) kit.kickClick(beat, vel * kp.click);
    return voice;
  }
  const voice = KICK_VOICES[kitId] ?? KICK_VOICES.elektro;
  return kit.kickPro(beat, vel, { ...voice.shape, ...kp });
}
// Tonhöhe als Note (Anzeige am Regler): nächster Halbton, z. B. 49 Hz → „G1“
export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const PITCH_LOW = 36; // C2
export const PITCH_HIGH = 84; // C6

export function newDrumPattern(n = 1) {
  const steps = 16;
  const row = (on) => Array.from({ length: steps }, (_, i) => (on.includes(i) ? 1 : 0));
  return {
    type: 'drums', name: `Beat ${n}`, bars: 1, kit: 'elektro',
    rows: {
      kick: row([0, 4, 8, 12]), snare: row([4, 12]), clap: row([]), hat: row([2, 6, 10, 14]),
      open: row([]), tomLo: row([]), tomHi: row([]), crash: row([]),
    },
  };
}

// Bass-Muster (Melodie-Editor, Song-Starter): Grundton der Grundtonart in der Bass-Lage C2…H2 – der Rollbass legt seinen
// Sub eine Oktave tiefer (33–62 Hz). Wechselt die Tonart je Takt, spielt die Engine die verschobene Fassung (key-bars).
// Beide lassen die Viertel frei: dort schlägt die Kick, Sub und Kick überdecken sich nicht.
export const BASS_TEMPLATES = [
  { id: 'offbeat', label: 'Offbeat' },
  { id: 'roll', label: 'Sechzehntel (rollend)' },
];
export const bassRoot = (tonic) => 36 + (((Math.round(tonic) % 12) + 12) % 12);
export function bassTemplateNotes(id, tonic, bars = 1) {
  const pitch = bassRoot(tonic);
  const notes = [];
  for (let beat = 0; beat < bars * 4; beat++) {
    if (id === 'offbeat') notes.push({ pitch, start: beat + 0.5, len: 0.3, vel: 1 });
    else for (const [s, vel] of [[1, 0.8], [2, 1], [3, 0.85]]) notes.push({ pitch, start: beat + s / 4, len: 0.2, vel });
  }
  return notes;
}

export function newSynthPattern(n = 1) {
  return { type: 'synth', name: `Melodie ${n}`, bars: 2, preset: 'pluck', notes: [] };
}

// Schrittzahl an die Taktzahl anpassen (verlängern füllt mit Wiederholung des ersten Takts nicht auf – bleibt leer)
export function resizeDrumRows(rows, bars) {
  const n = bars * 4 * STEPS_PER_BEAT;
  const out = {};
  for (const r of DRUM_ROWS) {
    const src = rows?.[r.id] || [];
    out[r.id] = Array.from({ length: n }, (_, i) => src[i] || 0);
  }
  return out;
}

const SR = 44100;
const TAIL = 2;

// ---------- Gleiten (Portamento) ----------
// pattern.glide: 0 = aus (Töne springen), sonst Anteil der längsten Gleitzeit. Folgt ein Ton direkt (legato) oder
// überlappend auf einen anderen, spielt eine Stimme weiter und ihre Tonhöhe gleitet zum neuen Ton.
export const GLIDE_MAX = 0.3; // Sekunden bei glide = 1
export const GLIDE_OPTIONS = [{ value: 0, label: 'Aus' }, { value: 0.25, label: 'Kurz' }, { value: 1, label: 'Lang' }];
export const glideOf = (pattern) => Math.min(1, Math.max(0, Number(pattern?.glide) || 0));

// Swing: jede zweite Sechzehntel (der Offbeat im Achtel) kommt später. swing = Anteil der ersten Sechzehntel
// am Achtel: 0,5 gerade, 0,667 Triole, 0,75 maximal (wie MPC-Swing 50–75 %).
export const SWING_OPTIONS = [
  { value: 0.5, label: 'Aus' }, { value: 0.54, label: 'Leicht' }, { value: 0.58, label: 'Mittel' },
  { value: 0.667, label: 'Triole' }, { value: 0.71, label: 'Stark' },
];
export const swingOf = (pattern) => Math.min(0.75, Math.max(0.5, Number(pattern?.swing) || 0.5));
export function swingBeat(beat, swing) {
  if (swing <= 0.5) return beat;
  const s = beat * STEPS_PER_BEAT;
  const r = Math.round(s);
  if (Math.abs(s - r) > 1e-6 || r % 2 === 0) return beat;
  return beat + (swing - 0.5) * (2 / STEPS_PER_BEAT);
}
// Noten auf geraden Offbeat-Sechzehnteln verschieben; ihr Ende bleibt, wo es war (keine Überlappung mit der nächsten)
export function swingNotes(notes, swing) {
  if (swing <= 0.5 || !notes) return notes;
  return notes.map((n) => {
    const start = swingBeat(n.start, swing);
    return start === n.start ? n : { ...n, start, len: Math.max(0.05, n.len - (start - n.start)) };
  });
}

// Noten zu Ketten verbinden: [{ pitch, start, len, vel, steps: [{ beat, pitch, len }] }]. Bei Akkorden gleitet jede
// Stimme zum nächstgelegenen Ton; derselbe Ton noch einmal wird neu angeschlagen.
export function glideChains(notes, beats) {
  const TOL = 1e-3;
  const list = (notes || []).filter((n) => n.start < beats)
    .map((n) => ({ pitch: n.pitch, start: n.start, len: Math.max(0.05, Math.min(n.len, beats - n.start)), vel: n.vel ?? 1 }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const chains = [];
  for (const n of list) {
    const open = chains.filter((c) => c.lastStart < n.start - TOL && c.end >= n.start - TOL);
    let best = null;
    if (!open.some((c) => c.lastPitch === n.pitch)) {
      for (const c of open) if (!best || Math.abs(c.lastPitch - n.pitch) < Math.abs(best.lastPitch - n.pitch)) best = c;
    }
    if (best) {
      best.steps.push({ beat: n.start, pitch: n.pitch, len: n.len });
      Object.assign(best, { end: n.start + n.len, lastStart: n.start, lastPitch: n.pitch });
    } else {
      chains.push({ pitch: n.pitch, start: n.start, vel: n.vel, steps: [], end: n.start + n.len, lastStart: n.start, lastPitch: n.pitch });
    }
  }
  return chains.map(({ pitch, start, vel, steps, end }) => ({ pitch, start, len: end - start, vel, steps }));
}

// Eine Kette spielt der Klang wie eine lange Note auf dem ersten Ton; alle Ton-Oszillatoren dieser Note
// (bzw. die Sampler-Quelle) hängen an einer gemeinsamen Tonhöhenkurve in Cent.
function renderGlide(ctx, bus, pattern, beats, spb, inst, preset) {
  const secs = glideOf(pattern) * GLIDE_MAX;
  const made = [];
  const create = ctx.createOscillator;
  ctx.createOscillator = () => { const o = create.call(ctx); made.push(o); return o; };
  const kit = createKit(ctx, bus, spb);
  for (const c of glideChains(pattern.notes, beats)) {
    made.length = 0;
    const t = c.start * spb;
    let sources;
    if (inst) sources = [playSampled(ctx, bus, inst, c.pitch, t, c.len * spb, c.vel).src];
    else {
      playNote(kit, preset, c.pitch, c.start, c.len, c.vel, spb);
      sources = made.filter((o) => o.frequency.value >= 20); // Vibrato-LFOs bleiben, wie sie sind
    }
    if (!c.steps.length) continue;
    const bend = ctx.createConstantSource();
    bend.offset.setValueAtTime(0, t);
    let prev = c.pitch;
    for (const s of c.steps) {
      const at = s.beat * spb;
      bend.offset.setValueAtTime((prev - c.pitch) * 100, at);
      bend.offset.linearRampToValueAtTime((s.pitch - c.pitch) * 100, at + Math.min(secs, s.len * spb * 0.8));
      prev = s.pitch;
    }
    for (const o of sources) bend.connect(o.detune);
    bend.start(t);
    bend.stop((c.start + c.len) * spb + TAIL);
  }
  delete ctx.createOscillator;
}

export async function renderPattern(pattern, bpm, library) {
  const spb = 60 / bpm;
  const beats = pattern.bars * 4;
  const frames = Math.round(beats * spb * SR);
  // Echtes Instrument: vor dem Rendern laden; klappt das nicht, spielt der passende Synth-Klang
  const inst = pattern.type === 'synth' && sampled(pattern.preset) && pattern.notes?.length
    ? await preparePreset(pattern.preset) : null;
  const tail = inst ? Math.max(TAIL, releaseTail(inst.inst)) : TAIL;
  const ctx = new OfflineAudioContext(2, frames + Math.ceil(tail * SR), SR);
  const bus = ctx.createGain();
  bus.gain.value = pattern.type === 'drums' ? 0.85 : 0.9;
  bus.connect(ctx.destination);
  const kit = createKit(ctx, bus, spb);

  const sw = swingOf(pattern);
  if (pattern.type !== 'drums' && sw > 0.5) pattern = { ...pattern, notes: swingNotes(pattern.notes, sw) };
  if (pattern.type === 'drums') {
    const map = KITS.find((k) => k.id === pattern.kit)?.map;
    // Kick mit Reglern (Feld am Pattern, beim Kit „Druck“ immer): eine Stimme, die nächste würgt die vorige ab – auch über
    // die Loop-Grenze (die letzte endet, wo die erste der nächsten Runde anschlägt)
    const kp = kickParams(pattern, library) ?? (pattern.kit === 'druck' ? kickDefaults('druck') : null);
    let lastKick = null;
    let firstKick = null;
    for (const row of DRUM_ROWS) {
      const steps = pattern.rows?.[row.id] || [];
      steps.forEach((v, i) => {
        if (!v || i >= beats * STEPS_PER_BEAT) return;
        const b = swingBeat(i / STEPS_PER_BEAT, sw);
        if (kp && row.id === 'kick') {
          lastKick?.choke(b * spb);
          lastKick = playKick(ctx, bus, kit, pattern.kit, b, spb, v, kp, library);
          if (firstKick == null) firstKick = b;
          return;
        }
        if (map) {
          const s = library?.get(map[row.id]);
          if (!s?.orig) return;
          const src = ctx.createBufferSource();
          src.buffer = library.source?.(s) ?? s.orig;
          const g = ctx.createGain();
          g.gain.value = v;
          src.connect(g).connect(bus);
          src.start(b * spb);
          return;
        }
        (SYNTH_DRUMS[pattern.kit] || SYNTH_DRUMS.elektro)[row.id]?.(kit, b, v);
      });
    }
    if (lastKick && firstKick != null) lastKick.choke((firstKick + beats) * spb);
  } else {
    const preset = sampled(pattern.preset) ? fallbackPreset(getInstrument(pattern.preset)) : pattern.preset;
    if (!inst && isGuitarPreset(preset)) {
      // Gitarre: alle Noten zusammen durch Verstärker und Effekte, als nahtloser Loop gerechnet
      const notes = (pattern.notes || []).filter((n) => n.start < beats)
        .map((n) => ({ ...n, len: Math.max(0.05, Math.min(n.len, beats - n.start)) }));
      if (notes.length) kit.pcm(0, (sr) => renderGuitarNotes(preset, notes, { sr, spb, loopFrames: frames }));
    } else if (glideOf(pattern) > 0) renderGlide(ctx, bus, pattern, beats, spb, inst, preset);
    else {
      for (const n of pattern.notes || []) {
        if (n.start >= beats) continue;
        const len = Math.max(0.05, Math.min(n.len, beats - n.start));
        if (inst) playSampled(ctx, bus, inst, n.pitch, n.start * spb, len * spb, n.vel ?? 1);
        else playNote(kit, preset, n.pitch, n.start, len, n.vel ?? 1, spb);
      }
    }
  }

  const rendered = await ctx.startRendering();
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: SR });
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = buffer.getChannelData(c);
    dst.set(src.subarray(0, frames));
    // Ausklang an den Anfang falten: das Pattern läuft als Loop nahtlos
    for (let i = frames; i < src.length; i++) dst[i % frames] += src[i];
    for (let i = 0; i < frames; i++) { const v = Math.abs(dst[i]); if (v > peak) peak = v; }
  }
  // Lautheit je Kit bzw. Klang (ADR 013), nie über die Spitzen-Obergrenze: ein neuer Beat spitzt höchstens bei −0,5 dBFS
  let level = pattern.type === 'drums' ? kitLevel(pattern.kit) : presetLevel(inst ? pattern.preset : sampled(pattern.preset) ? fallbackPreset(getInstrument(pattern.preset)) : pattern.preset);
  if (peak * level > PATTERN_PEAK_MAX) level = PATTERN_PEAK_MAX / peak;
  if (level !== 1) for (let c = 0; c < 2; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < frames; i++) d[i] *= level; }
  return { buffer, lengthBeats: beats, level };
}

// Vorhören (Piano-Roll, Tastatur, MIDI, Stepsequencer): ein Kit je AudioContext, Ziel und Pegel, Zeiten relativ zu „jetzt“.
// level: derselbe Faktor wie beim Rendern des Patterns (ADR 013), damit Vorhören und Song gleich laut sind
const previewKits = new WeakMap();
function previewKit(ctx, dest, level = 1) {
  let map = previewKits.get(ctx);
  if (!map) previewKits.set(ctx, (map = new Map()));
  const key = `${level}`;
  let byDest = map.get(dest);
  if (!byDest) map.set(dest, (byDest = new Map()));
  let entry = byDest.get(key);
  if (!entry) {
    const out = ctx.createGain();
    out.gain.value = 0.8 * level;
    out.connect(dest);
    entry = { kit: createKit(ctx, out, 1), out }; // spb = 1: Schlag = Sekunde
    byDest.set(key, entry);
  }
  return entry;
}
const previewLevel = (preset) => presetLevel(sampled(preset) && !loadedInstrument(preset) ? fallbackPreset(getInstrument(preset)) : preset);

// Echtes Instrument fürs Vorhören: geladen → Sampler; sonst Laden anstoßen und den Synth-Ersatz nennen
function liveSampler(preset) {
  if (!sampled(preset)) return { preset };
  const loaded = loadedInstrument(preset);
  if (loaded) return { loaded };
  preparePreset(preset);
  return { preset: fallbackPreset(getInstrument(preset)) };
}

// Gitarren-Ton als fertiger Puffer (gleiche Rechnung wie beim Rendern der Melodie); je Klang, Ton und Länge gemerkt
const guitarCache = new Map();
function guitarNote(preset, pitch, seconds) {
  const key = `${preset}|${pitch}|${seconds}`;
  let buf = guitarCache.get(key);
  if (!buf) {
    const frames = Math.round((seconds + 0.6) * SR);
    const chans = renderGuitarNotes(preset, [{ start: 0, pitch, len: seconds, vel: 1 }], { sr: SR, spb: 1, frames });
    buf = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: SR });
    chans.forEach((d, c) => buf.copyToChannel(d, c));
    if (guitarCache.size > 96) guitarCache.delete(guitarCache.keys().next().value);
    guitarCache.set(key, buf);
  }
  return buf;
}
function playGuitar(ctx, dest, preset, pitch, seconds, when) {
  const src = ctx.createBufferSource();
  src.buffer = guitarNote(preset, pitch, seconds);
  src.connect(dest);
  src.start(when);
  return src;
}

// vel (0–1): Anschlag; leiser gespielt klingt es auch beim Vorhören leiser
export function previewNote(ctx, dest, preset, pitch, vel = 1) {
  const { kit, out } = previewKit(ctx, dest, previewLevel(preset));
  const t = ctx.currentTime + 0.01;
  const s = liveSampler(preset);
  if (s.loaded) { playSampled(ctx, out, s.loaded, pitch, t, 0.4, vel); return; }
  // Eigener Ausgang für leisere Töne: die Stärke gilt dann für jeden Klang gleich
  let bus = out;
  let k = kit;
  if (vel < 0.999) {
    bus = ctx.createGain();
    bus.gain.value = vel;
    bus.connect(out);
    k = createKit(ctx, bus, 1);
    setTimeout(() => bus.disconnect(), 2500);
  }
  if (isGuitarPreset(s.preset)) { playGuitar(ctx, bus, s.preset, pitch, 0.4, t); return; }
  playNote(k, s.preset, pitch, t, s.preset === 'pad' || s.preset === 'strings' ? 0.6 : 0.4, 1, 0.75);
}

// Gehaltener Ton (Klaviatur, Tasten, Finger): klingt bis stop(), höchstens 12 s. Eigener Ausgang je Ton,
// damit sich ein einzelner Ton weich beenden lässt.
const HOLD_MAX = 12;
const GUITAR_HOLD = 3; // Gitarre klingt ohnehin aus
export function startNote(ctx, dest, preset, pitch, vel = 1) {
  const level = previewLevel(preset);
  const s = liveSampler(preset);
  if (s.loaded) {
    const voice = playSampled(ctx, previewKit(ctx, dest, level).out, s.loaded, pitch, ctx.currentTime + 0.005, null, vel);
    return { stop: () => voice.release(ctx.currentTime) };
  }
  preset = s.preset;
  const g = ctx.createGain();
  g.connect(dest);
  g.gain.value = 0.8 * vel * level;
  const t = ctx.currentTime + 0.005;
  if (isGuitarPreset(preset)) playGuitar(ctx, g, preset, pitch, GUITAR_HOLD, t);
  else playNote(createKit(ctx, g, 1), preset, pitch, t, HOLD_MAX, 1, 1);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.setTargetAtTime(0, now, preset === 'pad' || preset === 'strings' ? 0.12 : 0.04);
      setTimeout(() => g.disconnect(), 1500);
    },
  };
}

// when: Kontextzeit für den Schlag (Wiederholung beim Halten); ohne Angabe sofort. kp: Kick-Regler (kickParams)
export function previewDrum(ctx, dest, kitId, rowId, library, when, vel = 1, kp = null) {
  const level = kitLevel(kitId);
  if (kp && rowId === 'kick') {
    const { kit, out } = previewKit(ctx, dest, level);
    playKick(ctx, out, kit, kitId, when ?? ctx.currentTime + 0.01, 1, vel, kp, library);
    return;
  }
  const map = KITS.find((k) => k.id === kitId)?.map;
  if (map) {
    const s = library.get(map[rowId]);
    if (!s?.orig) return;
    const src = ctx.createBufferSource();
    src.buffer = library.source?.(s) ?? s.orig;
    const k = vel * level;
    if (Math.abs(k - 1) > 1e-3) {
      const g = ctx.createGain();
      g.gain.value = k;
      src.connect(g).connect(dest);
    } else src.connect(dest);
    src.start(when ?? 0);
    return;
  }
  const k = previewKit(ctx, dest, level).kit;
  const t = when ?? ctx.currentTime + 0.01;
  (SYNTH_DRUMS[kitId] || SYNTH_DRUMS.elektro)[rowId]?.(k, t, vel);
}
