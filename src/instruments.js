// Instrumente: Beat-Patterns (Stepsequencer) und Melodie-Patterns (Piano-Roll) werden zu Loops gerendert.
// So laufen sie durch dieselbe Engine wie jeder andere Clip (Fades, Effekte, Export, Rückgängig).

import { createKit } from './samples.js';
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

export const KITS = [
  { id: 'elektro', label: 'Elektro (synthetisch)' },
  {
    id: 'techno', label: 'Techno (909-artig)',
    labels: { snare: 'Rim', tomLo: 'Rumble', tomHi: 'Clang', crash: 'Ride' },
  },
  {
    id: 'akustik', label: 'Akustik (Sonic Pi)',
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
  { id: 'pad', label: 'Fläche', category: 'chords' },
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
  lead: (k, p, b, len) => k.lead(b, p, len),
  bass: (k, p, b, len, v) => k.bass(b, p, len, v),
  pad: (k, p, b, len) => k.pad(b, [p], len),
  piano: (k, p, b, len, v) => k.piano(b, p, len, v),
  organ: (k, p, b, len, v) => k.organ(b, p, len, v),
  flute: (k, p, b, len, v) => k.flute(b, p, len, v),
  bell: (k, p, b, len, v) => k.bell(b, p, len, v),
  strings: (k, p, b, len, v) => k.strings(b, p, len, v),
  brass: (k, p, b, len, v) => k.brass(b, p, len, v),
  acid: (k, p, b, len, v) => k.acid(b, p, len * 0.9, { accent: v > 0.9 }),
};
export function playNote(kit, preset, pitch, beat, len, vel, spb) {
  const fn = PLAY[preset];
  if (fn) fn(kit, pitch, beat, len, vel);
  else kit.pluck(beat, pitch, vel, Math.min(0.6, Math.max(0.12, len * spb)));
}

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
export const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const drumLabel = (kitId, rowId) => KITS.find((k) => k.id === kitId)?.labels?.[rowId] ?? DRUM_ROWS.find((r) => r.id === rowId)?.label ?? rowId;

// Synthetische Kits: welche Stimme des Klangbaukastens eine Zeile spielt (b = Schlag, v = Stärke)
const SYNTH_DRUMS = {
  elektro: {
    kick: (k, b, v) => k.kick(b, v), snare: (k, b, v) => k.snare(b, v), clap: (k, b, v) => k.clap(b, v),
    hat: (k, b, v) => k.hat(b, v), open: (k, b, v) => k.hat(b, v, true), tomLo: (k, b, v) => k.tom(b, 95, v),
    tomHi: (k, b, v) => k.tom(b, 150, v), crash: (k, b) => k.crash(b),
  },
  techno: {
    kick: (k, b, v) => k.kick909(b, v), snare: (k, b, v) => k.rim(b, v), clap: (k, b, v) => k.clap(b, v),
    hat: (k, b, v) => k.hat909(b, v), open: (k, b, v) => k.hat909(b, v, true), tomLo: (k, b, v) => k.rumble(b, 33, 0.5, v),
    tomHi: (k, b, v) => k.clang(b, 310, v), crash: (k, b, v) => k.ride(b, v),
  },
};
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

  if (pattern.type === 'drums') {
    const map = KITS.find((k) => k.id === pattern.kit)?.map;
    for (const row of DRUM_ROWS) {
      const steps = pattern.rows?.[row.id] || [];
      steps.forEach((v, i) => {
        if (!v || i >= beats * STEPS_PER_BEAT) return;
        const b = i / STEPS_PER_BEAT;
        if (map) {
          const s = library?.get(map[row.id]);
          if (!s?.orig) return;
          const src = ctx.createBufferSource();
          src.buffer = s.orig;
          const g = ctx.createGain();
          g.gain.value = v;
          src.connect(g).connect(bus);
          src.start(b * spb);
          return;
        }
        (SYNTH_DRUMS[pattern.kit] || SYNTH_DRUMS.elektro)[row.id]?.(kit, b, v);
      });
    }
  } else {
    const preset = sampled(pattern.preset) ? fallbackPreset(getInstrument(pattern.preset)) : pattern.preset;
    for (const n of pattern.notes || []) {
      if (n.start >= beats) continue;
      const len = Math.max(0.05, Math.min(n.len, beats - n.start));
      if (inst) playSampled(ctx, bus, inst, n.pitch, n.start * spb, len * spb, n.vel ?? 1);
      else playNote(kit, preset, n.pitch, n.start, len, n.vel ?? 1, spb);
    }
  }

  const rendered = await ctx.startRendering();
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = buffer.getChannelData(c);
    dst.set(src.subarray(0, frames));
    // Ausklang an den Anfang falten: das Pattern läuft als Loop nahtlos
    for (let i = frames; i < src.length; i++) dst[i % frames] += src[i];
  }
  return { buffer, lengthBeats: beats };
}

// Vorhören (Piano-Roll, Tastatur, MIDI, Stepsequencer): ein Kit pro AudioContext, Zeiten relativ zu „jetzt“
const previewKits = new WeakMap();
function previewKit(ctx, dest) {
  let entry = previewKits.get(ctx);
  if (!entry) {
    const out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(dest);
    entry = { kit: createKit(ctx, out, 1), out }; // spb = 1: Schlag = Sekunde
    previewKits.set(ctx, entry);
  }
  return entry;
}

// Echtes Instrument fürs Vorhören: geladen → Sampler; sonst Laden anstoßen und den Synth-Ersatz nennen
function liveSampler(preset) {
  if (!sampled(preset)) return { preset };
  const loaded = loadedInstrument(preset);
  if (loaded) return { loaded };
  preparePreset(preset);
  return { preset: fallbackPreset(getInstrument(preset)) };
}

export function previewNote(ctx, dest, preset, pitch) {
  const { kit, out } = previewKit(ctx, dest);
  const t = ctx.currentTime + 0.01;
  const s = liveSampler(preset);
  if (s.loaded) { playSampled(ctx, out, s.loaded, pitch, t, 0.4, 1); return; }
  playNote(kit, s.preset, pitch, t, s.preset === 'pad' || s.preset === 'strings' ? 0.6 : 0.4, 1, 0.75);
}

// Gehaltener Ton (Klaviatur, Tasten, Finger): klingt bis stop(), höchstens 12 s. Eigener Ausgang je Ton,
// damit sich ein einzelner Ton weich beenden lässt.
const HOLD_MAX = 12;
export function startNote(ctx, dest, preset, pitch) {
  const s = liveSampler(preset);
  if (s.loaded) {
    const voice = playSampled(ctx, previewKit(ctx, dest).out, s.loaded, pitch, ctx.currentTime + 0.005, null, 1);
    return { stop: () => voice.release(ctx.currentTime) };
  }
  preset = s.preset;
  const g = ctx.createGain();
  g.connect(dest);
  g.gain.value = 0.8;
  const t = ctx.currentTime + 0.005;
  playNote(createKit(ctx, g, 1), preset, pitch, t, HOLD_MAX, 1, 1);
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

// when: Kontextzeit für den Schlag (Wiederholung beim Halten); ohne Angabe sofort
export function previewDrum(ctx, dest, kitId, rowId, library, when) {
  const map = KITS.find((k) => k.id === kitId)?.map;
  if (map) {
    const s = library.get(map[rowId]);
    if (!s?.orig) return;
    const src = ctx.createBufferSource();
    src.buffer = s.orig;
    src.connect(dest);
    src.start(when ?? 0);
    return;
  }
  const k = previewKit(ctx, dest).kit;
  const t = when ?? ctx.currentTime + 0.01;
  (SYNTH_DRUMS[kitId] || SYNTH_DRUMS.elektro)[rowId]?.(k, t, 1);
}
