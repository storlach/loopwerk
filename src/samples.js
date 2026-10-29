// Bibliothek: synthetische Loops (per OfflineAudioContext erzeugt, A-Moll) und mitgelieferte CC0-Sounds.
// Bei jedem Tempowechsel wird jeder Sound passend zum Projekttempo vorbereitet:
// synthetische Loops neu gerendert, echte Loops gestreckt (WSOLA), One-Shots auf ganze Schläge aufgefüllt.

import { mulberry32, Emitter } from './util.js';
import { CATALOG, PEAK_TARGET } from './catalog.js';
import { timeStretch } from './dsp/stretch.js';

export const CATEGORIES = [
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'chords', label: 'Akkorde' },
  { id: 'synth', label: 'Synth' },
  { id: 'fx', label: 'FX' },
  { id: 'own', label: 'Eigene' },
];

export const LIBRARY_BPM = 120;
export const LIBRARY_KEY = 'Am';
const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 2;
const PEAKS_PER_BEAT = 64;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Klangbausteine. Alle Zeiten werden in Schlägen übergeben.
function createKit(ctx, out, spb) {
  const rand = mulberry32(1234);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;
  const T = (beat) => beat * spb;

  const osc = (type, freq) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  };
  const biquad = (type, freq, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  const noiseSource = (t, dur) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, (t * 0.731) % 1);
    s.stop(t + dur);
    return s;
  };
  const decayGain = (t, peak, decay, attack = 0.001) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  };
  // Hüllkurve mit Halten: Anschlag, gehaltener Pegel, Ausklang nach Notenende.
  const holdGain = (t, dur, level, attack, release) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, Math.max(t + attack, t + dur - release * 0.5));
    g.gain.linearRampToValueAtTime(0, t + dur + release * 0.5);
    g.connect(out);
    return g;
  };

  const kit = {
    kick(beat, vel = 1) {
      const t = T(beat);
      const o = osc('sine', 165);
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      o.connect(decayGain(t, vel, 0.42));
      o.start(t);
      o.stop(t + 0.5);
    },
    snare(beat, vel = 1) {
      const t = T(beat);
      noiseSource(t, 0.3).connect(biquad('highpass', 1100)).connect(decayGain(t, 0.8 * vel, 0.18));
      const o = osc('triangle', 220);
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      o.connect(decayGain(t, 0.6 * vel, 0.09));
      o.start(t);
      o.stop(t + 0.2);
    },
    clap(beat, vel = 1) {
      const t = T(beat);
      const g = ctx.createGain();
      g.connect(out);
      g.gain.setValueAtTime(0, t);
      for (const d of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(0.9 * vel, t + d);
        g.gain.exponentialRampToValueAtTime(0.15 * vel, t + d + 0.009);
      }
      g.gain.setValueAtTime(0.7 * vel, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      noiseSource(t, 0.3).connect(biquad('bandpass', 1500, 1.4)).connect(g);
    },
    hat(beat, vel = 1, open = false) {
      const t = T(beat);
      noiseSource(t, open ? 0.45 : 0.08)
        .connect(biquad('highpass', 7600))
        .connect(decayGain(t, 0.45 * vel, open ? 0.32 : 0.045));
    },
    bass(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc('sawtooth', mtof(midi));
      const lp = biquad('lowpass', 220, 7);
      lp.frequency.setValueAtTime(220, t);
      lp.frequency.linearRampToValueAtTime(1500, t + 0.008);
      lp.frequency.exponentialRampToValueAtTime(260, t + 0.22);
      o.connect(lp).connect(holdGain(t, d, 0.7 * vel, 0.005, 0.04));
      o.start(t);
      o.stop(t + d + 0.05);
    },
    sub(beat, midi, lenBeats) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc('sine', mtof(midi));
      o.connect(holdGain(t, d, 0.9, 0.01, 0.08));
      o.start(t);
      o.stop(t + d + 0.1);
    },
    pad(beat, midis, lenBeats) {
      const t = T(beat);
      const d = T(lenBeats);
      const lp = biquad('lowpass', 1400, 0.8);
      lp.connect(holdGain(t, d, 0.3, 0.35, 0.6));
      for (const m of midis) {
        for (const det of [-9, 9]) {
          const o = osc('sawtooth', mtof(m));
          o.detune.value = det;
          o.connect(lp);
          o.start(t);
          o.stop(t + d + 0.5);
        }
      }
    },
    pluck(beat, midi, vel = 1, decay = 0.22) {
      const t = T(beat);
      const o = osc('square', mtof(midi));
      const lp = biquad('lowpass', 4200, 3);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + decay);
      o.connect(lp).connect(decayGain(t, 0.35 * vel, decay + 0.1));
      o.start(t);
      o.stop(t + decay + 0.15);
    },
    stab(beat, midis, vel = 1) {
      for (const m of midis) kit.pluck(beat, m, vel * 0.7, 0.16);
    },
    lead(beat, midi, lenBeats) {
      const t = T(beat);
      const d = T(lenBeats);
      const o1 = osc('sawtooth', mtof(midi));
      const o2 = osc('square', mtof(midi));
      o2.detune.value = 5;
      const lfo = osc('sine', 5.5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14, t + Math.min(d, 0.5));
      lfo.connect(depth);
      depth.connect(o1.detune);
      depth.connect(o2.detune);
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      o1.connect(mix);
      o2.connect(mix);
      mix.connect(biquad('lowpass', 2600, 2)).connect(holdGain(t, d, 0.45, 0.012, 0.1));
      for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + d + 0.1); }
    },
    riser(beat, lenBeats) {
      const t = T(beat);
      const d = T(lenBeats);
      const bp = biquad('bandpass', 300, 5);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(8000, t + d);
      const g = ctx.createGain();
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + d - 0.02);
      g.gain.linearRampToValueAtTime(0, t + d);
      noiseSource(t, d).connect(bp).connect(g);
      const o = osc('sawtooth', 110);
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + d);
      const og = ctx.createGain();
      og.connect(out);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.12, t + d - 0.02);
      og.gain.linearRampToValueAtTime(0, t + d);
      o.connect(og);
      o.start(t);
      o.stop(t + d);
    },
    crash(beat) {
      const t = T(beat);
      noiseSource(t, 2).connect(biquad('highpass', 3800)).connect(decayGain(t, 0.5, 1.9));
    },
    impact(beat) {
      const t = T(beat);
      const o = osc('sine', 75);
      o.frequency.setValueAtTime(75, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
      o.connect(decayGain(t, 1, 1.5));
      o.start(t);
      o.stop(t + 1.6);
      noiseSource(t, 0.5).connect(biquad('lowpass', 700)).connect(decayGain(t, 0.6, 0.35));
    },
  };
  return kit;
}

// Akkordfolge Am – F – C – G mit enger Stimmführung, dazu die Grundtöne.
const CHORDS = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];
const LEAD = [
  [0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 71, 1],
  [4, 72, 1.5], [5.5, 69, 0.5], [6, 72, 1], [7, 74, 1],
  [8, 76, 2], [10, 79, 1], [11, 76, 1],
  [12, 74, 1.5], [13.5, 71, 0.5], [14, 74, 2],
];

export const LOOP_DEFS = [
  {
    id: 'drums-four', name: 'Four to the Floor', category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) { k.kick(b); k.hat(b + 0.5, 0.9); }
      k.clap(1); k.clap(3);
    },
  },
  {
    id: 'drums-break', name: 'Breakbeat', category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      [0, 1.75, 2.5, 4, 6.25, 6.5].forEach((b) => k.kick(b));
      [1, 3, 5, 7, 7.75].forEach((b) => k.snare(b, b % 1 ? 0.45 : 1));
      for (let b = 0; b < 8; b += 0.5) k.hat(b, b % 1 ? 0.6 : 0.9);
    },
  },
  {
    id: 'drums-halftime', name: 'Halftime', category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      k.kick(0); k.kick(2.75, 0.8); k.snare(2);
      for (let b = 0; b < 4; b += 0.5) k.hat(b, b % 1 ? 0.55 : 0.85);
    },
  },
  {
    id: 'drums-hats16', name: 'Hi-Hats 16tel', category: 'drums', bars: 1, peak: 0.42,
    render(k) {
      for (let i = 0; i < 15; i++) {
        if (i === 14) k.hat(i / 4, 0.8, true);
        else k.hat(i / 4, i % 4 === 0 ? 1 : i % 2 === 0 ? 0.7 : 0.45);
      }
    },
  },
  {
    id: 'bass-pulse', name: 'Pulse Bass A', category: 'bass', bars: 1, peak: 0.5,
    render(k) { for (let i = 0; i < 8; i++) k.bass(i / 2, i % 4 === 3 ? 45 : 33, 0.45); },
  },
  {
    id: 'bass-prog', name: 'Bass Am–F–C–G', category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      ROOTS.forEach((r, bar) => {
        [r, r, r + 12, r, r, r + 12, r, r + 7].forEach((m, i) => k.bass(bar * 4 + i / 2, m, 0.45));
      });
    },
  },
  {
    id: 'bass-sub', name: 'Sub Am–F–C–G', category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      ROOTS.forEach((r, bar) => { k.sub(bar * 4, r, 1.5); k.sub(bar * 4 + 2, r, 1.25); k.sub(bar * 4 + 3.5, r, 0.4); });
    },
  },
  {
    id: 'chords-pad', name: 'Pad Am–F–C–G', category: 'chords', bars: 4, peak: 0.42,
    render(k) { CHORDS.forEach((c, bar) => k.pad(bar * 4, c, 4)); },
  },
  {
    id: 'chords-stabs', name: 'Stabs Am–F–C–G', category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      CHORDS.forEach((c, bar) => {
        for (const b of [0.5, 1.5, 2.5, 3.25]) k.stab(bar * 4 + b, c.map((m) => m + 12));
      });
    },
  },
  {
    id: 'synth-arp', name: 'Arp Am', category: 'synth', bars: 1, peak: 0.4,
    render(k) {
      [69, 72, 76, 81, 76, 72, 69, 72, 69, 72, 76, 81, 84, 81, 76, 72]
        .forEach((m, i) => k.pluck(i / 4, m, i % 4 === 0 ? 1 : 0.75, 0.16));
    },
  },
  {
    id: 'synth-arp-prog', name: 'Arp Am–F–C–G', category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      CHORDS.forEach((c, bar) => {
        const notes = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24];
        for (let i = 0; i < 16; i++) k.pluck(bar * 4 + i / 4, notes[order[i % 8]], i % 4 === 0 ? 1 : 0.7, 0.15);
      });
    },
  },
  {
    id: 'synth-lead', name: 'Melodie Am–F–C–G', category: 'synth', bars: 4, peak: 0.42,
    render(k) { LEAD.forEach(([b, m, d]) => k.lead(b, m, d)); },
  },
  { id: 'fx-riser', name: 'Riser', category: 'fx', bars: 2, peak: 0.45, oneShot: true, render(k) { k.riser(0, 8); } },
  { id: 'fx-crash', name: 'Crash', category: 'fx', bars: 1, peak: 0.42, oneShot: true, render(k) { k.crash(0); } },
  { id: 'fx-impact', name: 'Impact', category: 'fx', bars: 1, peak: 0.6, oneShot: true, render(k) { k.impact(0); } },
];

export function computePeaks(buffer, beats) {
  const n = Math.max(1, Math.round(beats * PEAKS_PER_BEAT));
  const peaks = new Float32Array(n);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const per = buffer.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const end = Math.min(buffer.length, Math.floor((i + 1) * per));
    for (let j = Math.floor(i * per); j < end; j++) {
      for (const d of chans) { const v = Math.abs(d[j]); if (v > m) m = v; }
    }
    peaks[i] = m;
  }
  return peaks;
}

const scale = (buffer, gain) => {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
};

export function bufferPeak(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  return peak;
}

async function renderLoop(def, bpm) {
  const spb = 60 / bpm;
  const beats = def.bars * 4;
  const loopFrames = Math.round(beats * spb * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, loopFrames + TAIL_SECONDS * SAMPLE_RATE, SAMPLE_RATE);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  def.render(createKit(ctx, bus, spb));
  const rendered = await ctx.startRendering();

  const buffer = new AudioBuffer({ numberOfChannels: 2, length: loopFrames, sampleRate: SAMPLE_RATE });
  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = buffer.getChannelData(ch);
    dst.set(src.subarray(0, loopFrames));
    // Ausklang an den Anfang falten: so läuft die Schleife ohne Bruch durch.
    if (!def.oneShot) for (let i = loopFrames; i < src.length; i++) dst[i % loopFrames] += src[i];
  }
  const peak = bufferPeak(buffer);
  if (peak > 0) scale(buffer, (def.peak ?? 0.5) / peak);
  return { buffer, lengthBeats: beats };
}

// Echte Loops auf das Projekttempo strecken (Länge exakt in Schlägen).
function stretchLoop(orig, beats, bpm) {
  const outLength = Math.round(beats * (60 / bpm) * orig.sampleRate);
  if (outLength === orig.length) return orig;
  const chans = Array.from({ length: orig.numberOfChannels }, (_, c) => orig.getChannelData(c));
  const out = timeStretch(chans, outLength / orig.length, orig.sampleRate, outLength, { loop: true });
  const buffer = new AudioBuffer({ numberOfChannels: out.length, length: outLength, sampleRate: orig.sampleRate });
  out.forEach((d, c) => buffer.copyToChannel(d, c));
  return buffer;
}

// One-Shots auf ganze Schläge auffüllen: ein verlängerter Clip wiederholt den Sound dann im Schlagraster.
export function padOneShot(orig, bpm) {
  const spb = 60 / bpm;
  const beats = Math.max(1, Math.ceil(orig.duration / spb - 1e-6));
  const length = Math.round(beats * spb * orig.sampleRate);
  const buffer = new AudioBuffer({ numberOfChannels: orig.numberOfChannels, length, sampleRate: orig.sampleRate });
  for (let c = 0; c < orig.numberOfChannels; c++) buffer.copyToChannel(orig.getChannelData(c).subarray(0, length), c);
  return { buffer, lengthBeats: beats };
}

async function decode(arrayBuffer) {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  if (decoded.numberOfChannels === 2) return decoded;
  // Mono auf Stereo verdoppeln, damit alle Puffer gleich aufgebaut sind
  const st = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: decoded.sampleRate });
  st.copyToChannel(decoded.getChannelData(0), 0);
  st.copyToChannel(decoded.getChannelData(0), 1);
  return st;
}
export { decode as decodeAudio };

export class Library extends Emitter {
  constructor() {
    super();
    this.samples = new Map();
    this.bpm = LIBRARY_BPM;
    this.prepared = new Map(); // id → bpm, für das der Puffer vorbereitet ist
  }
  get(id) { return this.samples.get(id); }
  list() { return [...this.samples.values()]; }

  // Fertigen Puffer übernehmen (Tests, erzeugte Sounds)
  register(sample) {
    sample.rev = (sample.rev ?? 0) + 1;
    if (!sample.peaks) sample.peaks = computePeaks(sample.buffer, sample.lengthBeats);
    this.samples.set(sample.id, sample);
    this.emit();
    return sample;
  }

  // Sound mit Original-Puffer aufnehmen; Länge in Schlägen ergibt sich aus dem aktuellen Tempo.
  async add(sample) {
    this.samples.set(sample.id, sample);
    await this._prepare(sample, this.bpm);
    this.emit();
    return sample;
  }

  async _prepare(s, bpm) {
    if (this.prepared.get(s.id) === bpm && s.buffer) return;
    let r;
    if (s.def) r = await renderLoop(s.def, bpm);
    else if (s.make) r = await s.make(bpm);
    else if (s.kind === 'loop' && s.orig) r = { buffer: stretchLoop(s.orig, s.beats, bpm), lengthBeats: s.beats };
    else if (s.orig) r = padOneShot(s.orig, bpm);
    else return; // fester Puffer ohne Original (z. B. Testsignal)
    s.buffer = r.buffer;
    s.lengthBeats = r.lengthBeats;
    s.peaks = computePeaks(s.buffer, s.lengthBeats);
    s.rev = (s.rev ?? 0) + 1;
    this.prepared.set(s.id, bpm);
  }

  async setTempo(bpm) {
    this.bpm = bpm;
    for (const s of this.samples.values()) {
      await this._prepare(s, bpm);
      if (this.bpm !== bpm) return; // inzwischen neues Tempo angefordert
    }
    this.emit();
  }

  remove(id) {
    this.samples.delete(id);
    this.prepared.delete(id);
    this.emit();
  }
}

async function loadCatalogEntry(entry) {
  try {
    const res = await fetch(entry.file);
    if (!res.ok) throw new Error(res.status);
    const orig = await decode(await res.arrayBuffer());
    const peak = bufferPeak(orig);
    if (peak > 0) scale(orig, (PEAK_TARGET[entry.category] ?? 0.5) / peak);
    const sample = { ...entry, orig, duration: orig.duration };
    if (entry.kind === 'loop') sample.bpm = Math.round((entry.beats * 60 / orig.duration) * 100) / 100;
    return sample;
  } catch (err) {
    console.warn(`Sound „${entry.name}“ konnte nicht geladen werden (${err.message}).`);
    return null;
  }
}

export async function buildLibrary({ bpm = LIBRARY_BPM, onProgress } = {}) {
  const lib = new Library();
  lib.bpm = bpm;
  let done = 0;
  const total = LOOP_DEFS.length + CATALOG.length;
  const tick = () => onProgress?.(++done, total);
  const synth = LOOP_DEFS.map(async (def) => {
    const s = {
      id: def.id, name: def.name, category: def.category, kind: def.oneShot ? 'oneshot' : 'loop',
      beats: def.bars * 4, bpm: null, key: def.category === 'drums' || def.category === 'fx' ? null : LIBRARY_KEY,
      oneShot: !!def.oneShot, origin: 'Loopwerk', license: 'CC0', def,
    };
    await lib.add(s);
    tick();
    return s;
  });
  const real = CATALOG.map(async (entry) => {
    const s = await loadCatalogEntry(entry);
    if (s) await lib.add(s);
    tick();
  });
  await Promise.all([...synth, ...real]);
  // Reihenfolge stabil halten: erst synthetisch, dann Katalog
  const order = [...LOOP_DEFS.map((d) => d.id), ...CATALOG.map((e) => e.id)];
  lib.samples = new Map(order.filter((id) => lib.samples.has(id)).map((id) => [id, lib.samples.get(id)]));
  return lib;
}
