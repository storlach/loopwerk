// Instrumente: Beat-Patterns (Stepsequencer) und Melodie-Patterns (Piano-Roll) werden zu Loops gerendert.
// So laufen sie durch dieselbe Engine wie jeder andere Clip (Fades, Effekte, Export, Rückgängig).

import { createKit } from './samples.js';

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
  { id: 'bass', label: 'Bass', category: 'bass' },
  { id: 'pad', label: 'Fläche', category: 'chords' },
];

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
  const ctx = new OfflineAudioContext(2, frames + TAIL * SR, SR);
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
    for (const n of pattern.notes || []) {
      if (n.start >= beats) continue;
      const len = Math.max(0.05, Math.min(n.len, beats - n.start));
      const v = n.vel ?? 1;
      if (pattern.preset === 'lead') kit.lead(n.start, n.pitch, len);
      else if (pattern.preset === 'bass') kit.bass(n.start, n.pitch, len, v);
      else if (pattern.preset === 'pad') kit.pad(n.start, [n.pitch], len);
      else kit.pluck(n.start, n.pitch, v, Math.min(0.6, Math.max(0.12, len * spb)));
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
    entry = { kit: createKit(ctx, out, 1) }; // spb = 1: Schlag = Sekunde
    previewKits.set(ctx, entry);
  }
  return entry.kit;
}

export function previewNote(ctx, dest, preset, pitch) {
  const k = previewKit(ctx, dest);
  const t = ctx.currentTime + 0.01;
  if (preset === 'lead') k.lead(t, pitch, 0.4);
  else if (preset === 'bass') k.bass(t, pitch, 0.4);
  else if (preset === 'pad') k.pad(t, [pitch], 0.6);
  else k.pluck(t, pitch, 1, 0.3);
}

export function previewDrum(ctx, dest, kitId, rowId, library) {
  const map = KITS.find((k) => k.id === kitId)?.map;
  if (map) {
    const s = library.get(map[rowId]);
    if (!s?.orig) return;
    const src = ctx.createBufferSource();
    src.buffer = s.orig;
    src.connect(dest);
    src.start();
    return;
  }
  const k = previewKit(ctx, dest);
  const t = ctx.currentTime + 0.01;
  (SYNTH_DRUMS[kitId] || SYNTH_DRUMS.elektro)[rowId]?.(k, t, 1);
}
