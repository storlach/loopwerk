// Bibliothek: synthetische Loops (per OfflineAudioContext erzeugt, A-Moll) und mitgelieferte CC0-Sounds.
// Bei jedem Tempowechsel wird jeder Sound passend zum Projekttempo vorbereitet:
// synthetische Loops neu gerendert, echte Loops gestreckt (WSOLA), One-Shots auf ganze Schläge aufgefüllt.

import { mulberry32, Emitter } from './util.js';
import { CATALOG, PEAK_TARGET } from './catalog.js';
import { VCSL_CATALOG } from './catalog-vcsl.js';
import { fetchAsset } from './fetch-asset.js';
import { MORE_LOOP_DEFS, MORE_GENRES } from './loops-more.js';
import { timeStretch } from './dsp/stretch.js';

export const CATEGORIES = [
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'chords', label: 'Akkorde' },
  { id: 'synth', label: 'Synth' },
  { id: 'fx', label: 'FX' },
  { id: 'own', label: 'Eigene' },
];

// Genres sind Vorschläge zum Stöbern; ein Sound kann in mehreren stehen.
export const GENRES = [
  { id: 'techno', label: 'Techno' },
  { id: 'house', label: 'House' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'breaks', label: 'Breakbeat & DnB' },
  { id: 'pop', label: 'Pop' },
  { id: 'ambient', label: 'Ambient & Film' },
];
// Neue Genres aus dem großen Loop-Paket
GENRES.push(...MORE_GENRES.filter((g) => !GENRES.some((x) => x.id === g.id)));

export const LIBRARY_BPM = 120;
export const LIBRARY_KEY = 'Am';
const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 2;
const PEAKS_PER_BEAT = 64;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Frequenzen der sechs Rechteck-Oszillatoren eines 808/909-Beckens (metallischer Klang)
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

// Rauschen einmal je Kontext erzeugen (gleich bei jedem Laden), auch wenn viele Kits entstehen (gehaltene Töne)
const noiseCache = new WeakMap();
function noiseFor(ctx) {
  let noise = noiseCache.get(ctx);
  if (!noise) {
    const rand = mulberry32(1234);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;
    noiseCache.set(ctx, noise);
  }
  return noise;
}

// Plattenknistern: seltene, kurze Knackser (fester Seed). AudioBuffer gehören keinem Kontext:
// einmal je Abtastrate erzeugen und in allen Renderings nutzen.
const crackleCache = new Map();
function crackleFor(ctx) {
  let buf = crackleCache.get(ctx.sampleRate);
  if (!buf) {
    const rand = mulberry32(4321);
    buf = new AudioBuffer({ numberOfChannels: 1, length: ctx.sampleRate * 2, sampleRate: ctx.sampleRate });
    const d = buf.getChannelData(0);
    for (let k = 0; k < 70; k++) {
      const pos = Math.floor(rand() * (d.length - 16));
      const amp = (rand() < 0.15 ? 1 : 0.3) * (rand() < 0.5 ? -1 : 1);
      for (let j = 0; j < 12; j++) d[pos + j] += amp * Math.exp(-j / 2.5) * (j % 2 ? -0.6 : 1);
    }
    crackleCache.set(ctx.sampleRate, buf);
  }
  return buf;
}

// Raumklang: Impulsantwort aus abklingendem Rauschen (Höhen klingen schneller ab), mono und 0,6 s lang –
// Faltung kostet bei Dauersignal viel Rechenzeit, stereo und lang etwa das Doppelte.
const spaceCache = new Map();
function spaceFor(ctx) {
  let ir = spaceCache.get(ctx.sampleRate);
  if (!ir) {
    const rand = mulberry32(777);
    const sr = ctx.sampleRate;
    const len = Math.round(sr * 0.6);
    ir = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
    for (let c = 0; c < 1; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        lp += (rand() * 2 - 1 - lp) * (0.9 - 0.75 * x);
        d[i] = i < sr * 0.012 ? 0 : lp * Math.exp(-i / (sr * 0.16)) * Math.min(1, 4 * (1 - x));
      }
    }
    spaceCache.set(ctx.sampleRate, ir);
  }
  return ir;
}

// Obertonspektren für Oszillatoren (ein Oszillator statt mehrerer Sinus/FM), je Kontext
const WAVES = {
  organ: [0, 1, 0.7, 0.45, 0.3, 0, 0.18],
  keysBright: [0, 1, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05, 0.03],
  keysWarm: [0, 1, 0.22, 0.07],
  epBody: [0, 1, 0.06, 0.02],
  epBark: [0, 1, 0.7, 0.45, 0.28, 0.15, 0.08],
  pipe: [0, 1, 0.1, 0.04],
};
const waveCache = new WeakMap();
function waveFor(ctx, name) {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  let w = m.get(name);
  if (!w) {
    const imag = Float32Array.from(WAVES[name]);
    w = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    m.set(name, w);
  }
  return w;
}

// ---------- Bau auf Abruf beim Offline-Rendern (kit.defer) ----------
// Jeder Knoten im Graphen kostet in jedem Render-Quantum Rechenzeit, auch wenn er schweigt (Biquads besonders).
// Bei vielen kurzen Noten baut defer() deshalb die Knoten erst kurz vor ihrem Einsatz (ctx.suspend) und trennt
// sie nach dem Ausklang wieder ab. Klang und Signalkette bleiben gleich; nur der Zeitpunkt des Aufbaus ändert sich.
const JIT_SLOT = 0.25; // s
const jitSlots = new WeakMap();
function jitAt(ctx, slot, fn) {
  if (slot * JIT_SLOT >= ctx.length / ctx.sampleRate) return false; // liegt hinter dem Ende: nichts zu tun
  let slots = jitSlots.get(ctx);
  if (!slots) { slots = new Map(); jitSlots.set(ctx, slots); }
  let list = slots.get(slot);
  if (!list) {
    list = [];
    slots.set(slot, list);
    ctx.suspend(slot * JIT_SLOT).then(() => {
      try { for (const f of list) f(); } finally { slots.delete(slot); ctx.resume(); }
    });
  }
  list.push(fn);
  return true;
}
// Wie lange ein Kit-Aufruf klingt (s ab Start), für das Abtrennen danach; unbekannt = bis zum Ende
function lifeOf(name, args, T) {
  const o = (i) => (args[i] && typeof args[i] === 'object' ? args[i] : {});
  const len = (i) => T(args[i] ?? 0);
  switch (name) {
    case 'kick': case 'hat': case 'hat909': case 'tom': case 'clang': return 0.55;
    case 'snare': case 'clap': case 'cowbell': return 0.35;
    case 'rim': case 'clave': case 'snap': return 0.15;
    case 'ride': return 1.2;
    case 'crash': return 2.05;
    case 'impact': return 1.65;
    case 'kick909': return (args[2] ?? 0.5) + 0.06;
    case 'kickDeep': return (o(2).decay ?? 0.45) + 0.06;
    case 'snare2': return Math.max(0.15, (o(2).decay ?? 0.17) + 0.06);
    case 'shaker': return (o(2).len ?? 0.06) + 0.06;
    case 'conga': return (o(3).decay ?? 0.22) + 0.06;
    case 'pluck': return (args[3] ?? 0.22) + 0.16;
    case 'stab': return 0.32;
    case 'pluckSaw': return (o(3).decay ?? 0.25) + 0.13;
    case 'mallet': return (o(3).decay ?? 0.5) + 0.06;
    case 'bell': return 1.9;
    case 'bass': case 'acid': case 'synthBass': case 'bass808': case 'rumble': return len(2) + 0.07;
    case 'sub': case 'lead': case 'organ': case 'flute': case 'brass': return len(2) + 0.11;
    case 'strings': return len(2) + 0.5;
    case 'piano': return Math.max(len(2), 0.25) + 0.41;
    case 'rhodes': return Math.max(len(2), 0.12) + 0.61 + T(o(3).strum ?? 0) * 6;
    case 'keys': return Math.max(len(2), 0.1) + 0.33 + T(o(3).strum ?? 0) * 6;
    case 'organ2': return len(2) + 0.06;
    case 'chime': return (o(3).decay ?? 1.2) + 0.02;
    case 'pipe': case 'lead2': return len(2) + 0.11;
    case 'logDrum': return Math.min(len(2), 0.9) + 0.11;
    case 'reese': return len(2) + (o(3).release ?? 0.06) + 0.01;
    case 'supersaw': case 'vox': return len(2) + (o(3).release ?? 0.5) + 0.01;
    case 'riser': case 'sweep': case 'swell': case 'subDrop': case 'zap': return len(1) + 0.03;
    case 'vinyl': return len(1) + 0.06;
    case 'wind': return len(1) + 0.61;
    default: return Infinity;
  }
}

// Klangbausteine. Alle Zeiten werden in Schlägen übergeben.
// semis: Halbtöne, um die alle Töne verschoben werden (Tonartwechsel des Songs)
export function createKit(ctx, out, spb, semis = 0) {
  const tf = (m) => mtof(m + semis);
  const noise = noiseFor(ctx);
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

  // Sanfte Sättigung (tanh); drive 1 = fast linear
  const shaperCurves = new Map();
  const shaper = (drive) => {
    let curve = shaperCurves.get(drive);
    if (!curve) {
      curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
      }
      shaperCurves.set(drive, curve);
    }
    const w = ctx.createWaveShaper();
    w.curve = curve;
    w.oversample = '2x';
    return w;
  };
  const metal = (t, dur, level, hp, bp) => {
    const mix = ctx.createGain();
    mix.gain.value = 1 / METAL.length;
    mix.connect(biquad('bandpass', bp, 0.8)).connect(biquad('highpass', hp)).connect(decayGain(t, level, dur));
    for (const f of METAL) {
      const o = osc('square', f);
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };
  // Hüllkurven wie decayGain/holdGain, aber auf ein beliebiges Ziel (Panner, Filter)
  const decayTo = (dest, t, peak, decay, attack = 0.001) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  };
  const holdTo = (dest, t, dur, level, attack, release) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, Math.max(t + attack, t + dur - release * 0.5));
    g.gain.linearRampToValueAtTime(0, t + dur + release * 0.5);
    g.connect(dest);
    return g;
  };
  const panTo = (pan) => {
    if (!pan) return out;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    return p;
  };
  const notesOf = (m) => (Array.isArray(m) ? m : [m]);

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
      const o = osc('sawtooth', tf(midi));
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
      const o = osc('sine', tf(midi));
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
          const o = osc('sawtooth', tf(m));
          o.detune.value = det;
          o.connect(lp);
          o.start(t);
          o.stop(t + d + 0.5);
        }
      }
    },
    pluck(beat, midi, vel = 1, decay = 0.22) {
      const t = T(beat);
      const o = osc('square', tf(midi));
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
      const o1 = osc('sawtooth', tf(midi));
      const o2 = osc('square', tf(midi));
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
    tom(beat, freq = 110, vel = 1) {
      const t = T(beat);
      const o = osc('sine', freq * 1.6);
      o.frequency.setValueAtTime(freq * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      o.connect(decayGain(t, 0.8 * vel, 0.35));
      o.start(t);
      o.stop(t + 0.45);
    },
    crash(beat) {
      const t = T(beat);
      noiseSource(t, 2).connect(biquad('highpass', 3800)).connect(decayGain(t, 0.5, 1.9));
    },
    // ---------- Instrumente für Melodien (Piano-Roll, Einsingen) ----------
    // E-Piano per FM: Modulator im Verhältnis 1:1, dessen Anteil schnell abnimmt (heller Anschlag, weicher Ausklang)
    piano(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = Math.max(T(lenBeats), 0.25);
      const f = tf(midi);
      const car = osc('sine', f);
      const mod = osc('sine', f);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 2.2 * vel, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.7);
      mod.connect(idx).connect(car.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.6);
      g.gain.setValueAtTime(0.12 * vel, t + d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      g.connect(out);
      car.connect(g);
      for (const o of [car, mod]) { o.start(t); o.stop(t + d + 0.4); }
    },
    organ(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const g = holdGain(t, d, 0.22 * vel, 0.006, 0.06);
      for (const [h, a] of [[1, 1], [2, 0.7], [3, 0.45], [4, 0.3], [6, 0.18]]) {
        const o = osc('sine', tf(midi) * h);
        const og = ctx.createGain();
        og.gain.value = a / 2.6;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + d + 0.1);
      }
    },
    flute(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const g = holdGain(t, d, 0.35 * vel, 0.06, 0.08);
      const o = osc('sine', f);
      const o2 = osc('sine', f * 2);
      const g2 = ctx.createGain();
      g2.gain.value = 0.12;
      const vib = osc('sine', 5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(12, t + Math.min(d, 0.5));
      vib.connect(depth);
      depth.connect(o.detune);
      depth.connect(o2.detune);
      o.connect(g);
      o2.connect(g2).connect(g);
      const breath = ctx.createGain();
      breath.gain.value = 0.06;
      noiseSource(t, d + 0.1).connect(biquad('bandpass', f * 2, 2)).connect(breath).connect(g);
      for (const x of [o, o2, vib]) { x.start(t); x.stop(t + d + 0.1); }
    },
    bell(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const f = tf(midi);
      const car = osc('sine', f);
      const mod = osc('sine', f * 3.5);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 3 * vel, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.5);
      mod.connect(idx).connect(car.frequency);
      car.connect(decayGain(t, 0.32 * vel, 1.8, 0.002));
      for (const o of [car, mod]) { o.start(t); o.stop(t + 1.9); }
    },
    strings(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const lp = biquad('lowpass', 2400, 0.7);
      lp.connect(holdGain(t, d, 0.2 * vel, 0.18, 0.45));
      for (const det of [-12, 0, 11]) {
        const o = osc('sawtooth', tf(midi));
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + d + 0.5);
      }
    },
    brass(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc('sawtooth', tf(midi));
      const lp = biquad('lowpass', 500, 1.5);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(2800 * vel, t + 0.07);
      lp.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
      o.connect(lp).connect(holdGain(t, d, 0.3 * vel, 0.035, 0.08));
      o.start(t);
      o.stop(t + d + 0.1);
    },

    // ---------- Techno (909-artig, Industrial) ----------
    kick909(beat, vel = 1, decay = 0.5) {
      const t = T(beat);
      const o = osc('sine', 290);
      o.frequency.setValueAtTime(290, t);
      o.frequency.exponentialRampToValueAtTime(54, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(43, t + decay);
      o.connect(shaper(2.4)).connect(decayGain(t, 0.95 * vel, decay));
      o.start(t);
      o.stop(t + decay + 0.05);
      noiseSource(t, 0.02).connect(biquad('highpass', 2500)).connect(decayGain(t, 0.3 * vel, 0.012));
    },
    hat909(beat, vel = 1, open = false) {
      const t = T(beat);
      metal(t, open ? 0.32 : 0.05, 1.4 * vel, 7000, 10000);
      noiseSource(t, open ? 0.4 : 0.06).connect(biquad('highpass', 8000)).connect(decayGain(t, 0.2 * vel, open ? 0.28 : 0.035));
    },
    ride(beat, vel = 1) {
      const t = T(beat);
      metal(t, 1.1, 0.9 * vel, 4500, 6500);
      noiseSource(t, 1).connect(biquad('bandpass', 9000, 1.5)).connect(decayGain(t, 0.12 * vel, 0.9));
    },
    rim(beat, vel = 1) {
      const t = T(beat);
      for (const [f, l] of [[1700, 0.45], [820, 0.35]]) {
        const o = osc('triangle', f);
        o.connect(biquad('bandpass', f, 2)).connect(decayGain(t, l * vel, 0.03));
        o.start(t);
        o.stop(t + 0.06);
      }
    },
    // Industrial: metallischer Schlag per FM, angezerrt
    clang(beat, freq = 300, vel = 1) {
      const t = T(beat);
      const car = osc('sine', freq);
      const mod = osc('sine', freq * 1.414);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(freq * 6, t);
      idx.gain.exponentialRampToValueAtTime(freq * 0.2, t + 0.25);
      mod.connect(idx).connect(car.frequency);
      car.connect(shaper(4)).connect(biquad('highpass', 300)).connect(decayGain(t, 0.45 * vel, 0.28));
      for (const o of [car, mod]) { o.start(t); o.stop(t + 0.35); }
      noiseSource(t, 0.08).connect(biquad('bandpass', 3000, 3)).connect(decayGain(t, 0.4 * vel, 0.05));
    },
    // Rumble: tiefe, verwaschene Bassfläche zwischen den Kicks (schwillt an, bricht vor der nächsten Kick ab)
    rumble(beat, midi, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.85 * vel, t + d * 0.45);
      g.gain.linearRampToValueAtTime(0, t + d);
      g.connect(out);
      const lp = biquad('lowpass', 150, 1.2);
      lp.connect(g);
      const o = osc('sine', tf(midi));
      o.connect(shaper(3)).connect(lp);
      o.start(t);
      o.stop(t + d + 0.02);
      const ng = ctx.createGain();
      ng.gain.value = 0.7;
      noiseSource(t, d).connect(biquad('lowpass', 170, 0.9)).connect(ng).connect(lp);
    },
    // Acid: Sägezahn durch resonanten Tiefpass mit Hüllkurve, Akzent und Slide wie bei der TB-303
    acid(beat, midi, lenBeats, { accent = false, slideFrom = null, cutoff = 420, env = 2200, res = 14 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc('sawtooth', tf(slideFrom ?? midi));
      if (slideFrom != null) o.frequency.exponentialRampToValueAtTime(tf(midi), t + 0.06);
      const lp = biquad('lowpass', cutoff, res);
      lp.frequency.setValueAtTime(cutoff + env * (accent ? 1.7 : 1), t);
      lp.frequency.exponentialRampToValueAtTime(cutoff, t + (accent ? 0.2 : 0.13));
      o.connect(lp).connect(shaper(accent ? 2.6 : 1.6)).connect(holdGain(t, d, accent ? 0.5 : 0.34, 0.003, 0.02));
      o.start(t);
      o.stop(t + d + 0.05);
    },
    // Dub-Stab: kurzer Mollakkord mit Filterschließung und Echo
    dubStab(beat, midis, vel = 1) {
      const t = T(beat);
      const lp = biquad('lowpass', 2600, 4);
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(450, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      lp.connect(g);
      g.connect(out);
      const delay = ctx.createDelay(2);
      delay.delayTime.value = T(0.75);
      const fb = ctx.createGain();
      fb.gain.value = 0.42;
      const dlp = biquad('lowpass', 1600);
      g.connect(delay).connect(dlp).connect(fb).connect(delay);
      dlp.connect(out);
      for (const m of midis) {
        for (const det of [-8, 8]) {
          const o = osc('sawtooth', tf(m));
          o.detune.value = det;
          o.connect(lp);
          o.start(t);
          o.stop(t + 0.4);
        }
      }
    },
    // Rauschen mit wanderndem Filter: aufwärts (Riser) oder abwärts (Downlifter)
    sweep(beat, lenBeats, down = false) {
      const t = T(beat);
      const d = T(lenBeats);
      const bp = biquad('bandpass', down ? 9000 : 250, 3);
      bp.frequency.setValueAtTime(down ? 9000 : 250, t);
      bp.frequency.exponentialRampToValueAtTime(down ? 180 : 10000, t + d);
      const g = ctx.createGain();
      g.connect(out);
      if (down) {
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      } else {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.8, t + d - 0.02);
        g.gain.linearRampToValueAtTime(0, t + d);
      }
      noiseSource(t, d).connect(bp).connect(g);
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

    // ---------- Erweiterung für die weiteren Loops (src/loops-more.js) ----------
    // Gleiches Kit, aber im OfflineAudioContext entstehen die Knoten erst kurz vor dem Einsatz (siehe jitAt).
    // Im Echtzeit-Kontext unverändert sofort.
    defer() {
      if (typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext)) return kit;
      // Stille Dauerquelle: Ohne sie hätte das Ziel zwischen zwei Gruppen keinen Eingang, Chromium schaltet es samt
      // nachfolgender Kette ab und Echos brechen ab.
      const keep = ctx.createConstantSource();
      keep.offset.value = 0;
      keep.connect(out);
      keep.start(0);
      const groups = new Map(); // Slot → { sink, kit, refs }
      const groupFor = (slot) => {
        let g = groups.get(slot);
        if (!g) {
          const sink = ctx.createGain();
          sink.connect(out);
          g = { sink, kit: createKit(ctx, sink, spb, semis), refs: 0 };
          groups.set(slot, g);
        }
        return g;
      };
      const run = (slot, name, args) => {
        const g = groupFor(slot);
        g.kit[name](...args);
        g.refs++;
        const end = T(args[0]) + lifeOf(name, args, T);
        const done = () => { if (--g.refs === 0) { g.sink.disconnect(); groups.delete(slot); } };
        if (Number.isFinite(end)) jitAt(ctx, Math.ceil(end / JIT_SLOT + 1e-9), done);
      };
      const dk = {};
      for (const name of Object.keys(kit)) {
        dk[name] = (...args) => {
          const slot = Math.max(0, Math.floor((T(args[0]) - 0.006) / JIT_SLOT));
          if (slot === 0 || !jitAt(ctx, slot, () => run(slot, name, args))) run(slot, name, args);
        };
      }
      dk.bus = (opts) => kit.bus(opts).defer();
      dk.defer = () => dk;
      return dk;
    },
    // Untergruppe mit eigener Kette (Filter, Sättigung, Pumpen, Echo, Raum, Panorama); liefert ein Kit, das dort hineinspielt.
    // pump: Anzahl Schläge, auf denen geduckt wird (Ausklang wird mitgepumpt)
    bus({ gain = 1, lowpass = 0, highpass = 0, drive = 0, pan = 0, pump = 0, pumpDepth = 0.55,
      echo = 0, feedback = 0.35, wet = 0.3, echoTone = 2600, space = 0 } = {}) {
      const input = ctx.createGain();
      input.gain.value = gain;
      // Fest stereo: sonst hinge die Kanalzahl davon ab, welche Quellen gerade verbunden sind (defer), und Panner
      // (Pan-Gesetz mono/stereo) und Filter (Zustand bei Kanalwechsel) verhielten sich unterschiedlich
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      let node = input;
      if (highpass) node = node.connect(biquad('highpass', highpass));
      if (lowpass) node = node.connect(biquad('lowpass', lowpass));
      if (drive) node = node.connect(shaper(drive));
      if (pump) {
        const pg = ctx.createGain();
        const n = pump + Math.ceil(TAIL_SECONDS / spb);
        for (let b = 0; b < n; b++) {
          pg.gain.setValueAtTime(1, T(b));
          pg.gain.linearRampToValueAtTime(1 - pumpDepth, T(b) + 0.006);
          pg.gain.linearRampToValueAtTime(1, T(b + 0.6));
        }
        node = node.connect(pg);
      }
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      node.connect(panner).connect(out);
      if (echo) {
        // Echo mit genau einer Verzögerung in der Rückkopplung (zwei Verzögerungen in einer Schleife rendert Chromium
        // nicht deterministisch); Breite über eine um 12 ms versetzte Kopie rechts, Wiederholungen gedämpft
        const send = ctx.createGain();
        send.gain.value = wet;
        const tone = biquad('lowpass', echoTone);
        const dl = ctx.createDelay(4);
        dl.delayTime.value = T(echo);
        const fb = ctx.createGain();
        fb.gain.value = feedback;
        const pl = ctx.createStereoPanner();
        const pr = ctx.createStereoPanner();
        pl.pan.value = -0.6;
        pr.pan.value = 0.6;
        const haas = ctx.createDelay(0.05);
        haas.delayTime.value = 0.012;
        node.connect(send).connect(tone).connect(dl);
        dl.connect(fb).connect(dl);
        dl.connect(pl).connect(out);
        dl.connect(haas).connect(pr).connect(out);
      }
      if (space) {
        // Faltung in Mono, Breite über eine um 17 ms versetzte Kopie auf der rechten Seite
        const conv = ctx.createConvolver();
        conv.channelCountMode = 'explicit';
        conv.channelCount = 1;
        conv.buffer = spaceFor(ctx);
        const sg = ctx.createGain();
        sg.gain.value = space;
        const pl = ctx.createStereoPanner();
        const pr = ctx.createStereoPanner();
        pl.pan.value = -0.6;
        pr.pan.value = 0.6;
        const haas = ctx.createDelay(0.05);
        haas.delayTime.value = 0.017;
        node.connect(conv).connect(sg);
        sg.connect(pl).connect(out);
        sg.connect(haas).connect(pr).connect(out);
      }
      return createKit(ctx, input, spb, semis);
    },
    // Kick mit wählbarer Tiefe und Länge (Boom-Bap kurz und trocken, Trap lang und tief)
    kickDeep(beat, vel = 1, { decay = 0.45, tone = 52, punch = 150, click = 0.25, drive = 1.4 } = {}) {
      const t = T(beat);
      const o = osc('sine', punch);
      o.frequency.setValueAtTime(punch, t);
      o.frequency.exponentialRampToValueAtTime(tone, t + 0.07);
      o.connect(shaper(drive)).connect(decayGain(t, 0.95 * vel, decay, 0.002));
      o.start(t);
      o.stop(t + decay + 0.05);
      if (click) noiseSource(t, 0.02).connect(biquad('bandpass', 3200, 1)).connect(decayGain(t, click * vel, 0.008));
    },
    // Snare mit einstellbarem Körper und Teppich
    snare2(beat, vel = 1, { tone = 190, decay = 0.17, noiseHp = 1500, body = 0.5, bright = 0.7, pan = 0 } = {}) {
      const t = T(beat);
      const dest = panTo(pan);
      const o = osc('triangle', tone * 1.5);
      o.frequency.setValueAtTime(tone * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(tone, t + 0.04);
      o.connect(decayTo(dest, t, body * vel, 0.08));
      o.start(t);
      o.stop(t + 0.15);
      noiseSource(t, decay + 0.05).connect(biquad('highpass', noiseHp)).connect(decayTo(dest, t, bright * vel, decay));
    },
    snap(beat, vel = 1, pan = 0) {
      const t = T(beat);
      const dest = panTo(pan);
      noiseSource(t, 0.1).connect(biquad('bandpass', 2300, 2.2)).connect(decayTo(dest, t, 1.1 * vel, 0.055, 0.0015));
      noiseSource(t, 0.03).connect(biquad('highpass', 6000)).connect(decayTo(dest, t, 0.25 * vel, 0.012));
    },
    shaker(beat, vel = 1, { len = 0.06, pan = 0, tone = 7200 } = {}) {
      const t = T(beat);
      noiseSource(t, len + 0.04).connect(biquad('bandpass', tone, 1.1)).connect(biquad('highpass', 4200))
        .connect(decayTo(panTo(pan), t, 0.42 * vel, len, 0.01));
    },
    // Conga/Bongo/Timbal: gestimmte Fellsine mit kurzem Pitch-Knick, Slap als Rauschanteil
    conga(beat, freq = 220, vel = 1, { decay = 0.22, slap = 0.25, pan = 0 } = {}) {
      const t = T(beat);
      const dest = panTo(pan);
      const o = osc('sine', freq * 1.3);
      o.frequency.setValueAtTime(freq * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
      o.connect(decayTo(dest, t, 0.75 * vel, decay, 0.002));
      o.start(t);
      o.stop(t + decay + 0.05);
      if (slap) noiseSource(t, 0.04).connect(biquad('bandpass', freq * 6, 1.5)).connect(decayTo(dest, t, slap * vel, 0.02));
    },
    cowbell(beat, vel = 1, pan = 0) {
      const t = T(beat);
      const bp = biquad('bandpass', 1050, 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      bp.connect(g).connect(panTo(pan));
      for (const f of [540, 800]) {
        const o = osc('square', f);
        o.connect(bp);
        o.start(t);
        o.stop(t + 0.32);
      }
    },
    clave(beat, vel = 1, { freq = 2500, pan = 0 } = {}) {
      const t = T(beat);
      const o = osc('triangle', freq);
      o.connect(decayTo(panTo(pan), t, 0.55 * vel, 0.045));
      o.start(t);
      o.stop(t + 0.07);
    },
    // Plattenknistern mit leisem Rauschen (Lo-Fi)
    vinyl(beat, lenBeats, level = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const g = holdGain(t, d, 0.5 * level, 0.02, 0.04);
      const s = ctx.createBufferSource();
      s.buffer = crackleFor(ctx);
      s.loop = true;
      s.start(t, (t * 0.37) % 2);
      s.stop(t + d + 0.05);
      s.connect(biquad('bandpass', 2600, 0.5)).connect(g);
      const hiss = ctx.createGain();
      hiss.gain.value = 0.05;
      noiseSource(t, d + 0.05).connect(biquad('bandpass', 4000, 0.4)).connect(hiss).connect(g);
    },
    // Wind: Rauschen durch langsam wanderndes Bandpassfilter
    wind(beat, lenBeats, level = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const bp = biquad('bandpass', 700, 4);
      bp.frequency.automationRate = 'k-rate';
      const lfo = osc('sine', 0.5 / (spb * 4));
      const depth = ctx.createGain();
      depth.gain.value = 450;
      lfo.connect(depth).connect(bp.frequency);
      lfo.start(t);
      lfo.stop(t + d + 0.6);
      noiseSource(t, d + 0.6).connect(bp).connect(holdGain(t, d, 0.9 * level, 0.5, 1));
    },
    // 808-Bass: Sinus mit kurzem Anschlagknick, langer Ausklang, Glide vom vorigen Ton, leicht angezerrt
    bass808(beat, midi, lenBeats, { vel = 1, glideFrom = null, glide = 0.09, drive = 1.8 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const o = osc('sine', f);
      o.frequency.setValueAtTime(glideFrom != null ? tf(glideFrom) : f * 1.9, t);
      o.frequency.exponentialRampToValueAtTime(f, t + (glideFrom != null ? glide : 0.035));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.8 * vel, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.8 * vel * Math.max(0.25, Math.exp(-d / 1.6)), t + Math.max(d, 0.01));
      g.gain.linearRampToValueAtTime(0, t + d + 0.04);
      g.connect(out);
      o.connect(shaper(drive)).connect(g);
      o.start(t);
      o.stop(t + d + 0.06);
    },
    // Reese: zwei gegeneinander verstimmte Sägezähne, wanderndes Filter, Sub darunter
    reese(beat, midi, lenBeats, { vel = 1, cutoff = 700, rate = 0.5, sub = 0.5, attack = 0.01, release = 0.06 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const g = holdGain(t, d, 0.4 * vel, attack, release);
      const lp = biquad('lowpass', cutoff, 1.6);
      lp.frequency.automationRate = 'k-rate';
      const lfo = osc('sine', rate / spb);
      const depth = ctx.createGain();
      depth.gain.value = cutoff * 0.45;
      lfo.connect(depth).connect(lp.frequency);
      lp.connect(shaper(1.8)).connect(g);
      const saws = [-17, 13].map((det) => { const o = osc('sawtooth', f); o.detune.value = det; o.connect(lp); return o; });
      const s = osc('sine', f);
      const sg = ctx.createGain();
      sg.gain.value = sub;
      s.connect(sg).connect(g);
      for (const o of [...saws, s, lfo]) { o.start(t); o.stop(t + d + release); }
    },
    // Synth-Bass mit Filterhüllkurve (Sägezahn, Rechteck oder Dreieck), wahlweise Sinus-Sub
    synthBass(beat, midi, lenBeats, { vel = 1, type = 'sawtooth', cutoff = 300, env = 1600, res = 4, decay = 0.16, sub = 0 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const g = holdGain(t, d, 0.55 * vel, 0.004, 0.03);
      const o = osc(type, f);
      const lp = biquad('lowpass', cutoff, res);
      lp.frequency.automationRate = 'k-rate';
      lp.frequency.setValueAtTime(cutoff + env * vel, t);
      lp.frequency.exponentialRampToValueAtTime(cutoff, t + decay);
      o.connect(lp).connect(g);
      const oscs = [o];
      if (sub) {
        const s = osc('sine', f);
        const sg = ctx.createGain();
        sg.gain.value = sub;
        s.connect(sg).connect(g);
        oscs.push(s);
      }
      for (const x of oscs) { x.start(t); x.stop(t + d + 0.05); }
    },
    // E-Piano (Rhodes-artig): weicher Körper plus kurzer heller Anschlag, Stereo-Tremolo; midis = Ton oder Akkord
    rhodes(beat, midis, lenBeats, { vel = 1, tremolo = 0.35, strum = 0 } = {}) {
      const t0 = T(beat);
      const d = Math.max(T(lenBeats), 0.12);
      const pan = ctx.createStereoPanner();
      pan.connect(out);
      const lfo = osc('sine', 4.2);
      const depth = ctx.createGain();
      depth.gain.value = tremolo;
      lfo.connect(depth).connect(pan.pan);
      lfo.start(t0);
      lfo.stop(t0 + d + 0.6);
      const n = notesOf(midis);
      const lvl = vel / Math.sqrt(n.length);
      n.forEach((m, i) => {
        const t = t0 + T(strum) * i;
        const f = tf(m);
        const body = osc('sine', f);
        body.setPeriodicWave(waveFor(ctx, 'epBody'));
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3 * lvl, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.3 * lvl * Math.max(0.25, Math.exp(-d / 1.4)), t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
        g.connect(pan);
        body.connect(g);
        body.start(t);
        body.stop(t + d + 0.4);
        const bark = osc('sine', f);
        bark.setPeriodicWave(waveFor(ctx, 'epBark'));
        const bd = 0.15 + 0.25 * vel;
        bark.connect(decayTo(pan, t, 0.14 * lvl * vel, bd, 0.002));
        bark.start(t);
        bark.stop(t + bd + 0.01);
      });
    },
    // Klavier: heller Hammeranschlag, der schnell abklingt, darunter warmer Ton; midis = Ton oder Akkord
    keys(beat, midis, lenBeats, { vel = 1, strum = 0, pan = 0 } = {}) {
      const t0 = T(beat);
      const d = Math.max(T(lenBeats), 0.1);
      const dest = panTo(pan);
      const n = notesOf(midis);
      const lvl = vel / Math.sqrt(n.length);
      n.forEach((m, i) => {
        const t = t0 + T(strum) * i;
        const f = tf(m);
        const bright = osc('sine', f);
        bright.setPeriodicWave(waveFor(ctx, 'keysBright'));
        bright.connect(decayTo(dest, t, 0.2 * lvl * (0.5 + 0.5 * vel), 0.3, 0.002));
        bright.start(t);
        bright.stop(t + 0.31);
        const warm = osc('sine', f);
        warm.setPeriodicWave(waveFor(ctx, 'keysWarm'));
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.28 * lvl, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.28 * lvl * Math.max(0.15, Math.exp(-d / 1.2)), t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
        g.connect(dest);
        warm.connect(g);
        warm.start(t);
        warm.stop(t + d + 0.32);
      });
    },
    // Orgel mit Zugriegel-Mischung als ein Oszillator je Ton; midis = Ton oder Akkord
    organ2(beat, midis, lenBeats, { vel = 1, pan = 0 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const n = notesOf(midis);
      const g = holdTo(panTo(pan), t, d, 0.3 * vel / Math.sqrt(n.length), 0.005, 0.05);
      for (const m of n) {
        const o = osc('sine', tf(m));
        o.setPeriodicWave(waveFor(ctx, 'organ'));
        o.connect(g);
        o.start(t);
        o.stop(t + d + 0.05);
      }
    },
    // Glocke/Glockenspiel: drei unharmonische Teiltöne, die höheren klingen schneller ab
    chime(beat, midi, vel = 1, { decay = 1.2, pan = 0 } = {}) {
      const t = T(beat);
      const f = tf(midi);
      const dest = panTo(pan);
      for (const [r, a, k] of [[1, 0.4, 1], [2.76, 0.16, 0.45], [5.4, 0.08, 0.2]]) {
        const o = osc('sine', f * r);
        o.connect(decayTo(dest, t, a * vel, decay * k, 0.002));
        o.start(t);
        o.stop(t + decay * k + 0.01);
      }
    },
    // Flöte/Pfeife: weicher Ton mit Vibrato, kurzer Atemstoß zu Beginn
    pipe(beat, midi, lenBeats, { vel = 1 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const o = osc('sine', f);
      o.setPeriodicWave(waveFor(ctx, 'pipe'));
      o.detune.automationRate = 'k-rate';
      const vib = osc('sine', 5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(12, t + Math.min(d, 0.5));
      vib.connect(depth).connect(o.detune);
      o.connect(holdGain(t, d, 0.35 * vel, 0.05, 0.08));
      for (const x of [o, vib]) { x.start(t); x.stop(t + d + 0.1); }
      noiseSource(t, 0.08).connect(biquad('bandpass', f * 2, 1.5)).connect(decayGain(t, 0.05 * vel, 0.06, 0.01));
    },
    // Lead: Sägezahn und Rechteck, Vibrato setzt verzögert ein; glideFrom gleitet vom vorigen Ton
    lead2(beat, midi, lenBeats, { vel = 1, cutoff = 2600, glideFrom = null } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const f = tf(midi);
      const o1 = osc('sawtooth', f);
      const o2 = osc('square', f);
      o2.detune.value = 5;
      const vib = osc('sine', 5.5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14, t + Math.min(d, 0.5));
      vib.connect(depth);
      for (const o of [o1, o2]) {
        o.detune.automationRate = 'k-rate';
        depth.connect(o.detune);
        if (glideFrom != null) {
          o.frequency.setValueAtTime(tf(glideFrom), t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        }
      }
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      o1.connect(mix);
      o2.connect(mix);
      mix.connect(biquad('lowpass', cutoff, 2)).connect(holdGain(t, d, 0.45 * vel, 0.012, 0.1));
      for (const o of [o1, o2, vib]) { o.start(t); o.stop(t + d + 0.1); }
    },
    // Gezupfter Sägezahn mit Filterhüllkurve; Einzelton mit zwei leicht verstimmten Stimmen,
    // Akkord (midi als Liste) mit einer Stimme je Ton und einem Filter für alle
    pluckSaw(beat, midi, vel = 1, { decay = 0.25, cutoff = 3200, pan = 0 } = {}) {
      const t = T(beat);
      const n = notesOf(midi);
      const f = tf(Math.min(...n));
      const lp = biquad('lowpass', cutoff, 2);
      lp.frequency.automationRate = 'k-rate';
      lp.frequency.setValueAtTime(cutoff, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(cutoff, f * 1.5 + 200), t + decay);
      lp.connect(decayTo(panTo(pan), t, 0.28 * vel / Math.sqrt(n.length), decay + 0.08, 0.002));
      const voices = n.length === 1 ? [[n[0], -7], [n[0], 7]] : n.map((m, i) => [m, i % 2 ? 6 : -6]);
      for (const [m, det] of voices) {
        const o = osc('sawtooth', tf(m));
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + decay + 0.12);
      }
    },
    // Supersaw: je Ton drei (voices = 2: zwei) verstimmte Sägezähne (Mitte auf beiden Seiten), links und rechts verteilt;
    // ein Filter je Seite für den ganzen Akkord; sweep = [von, nach] Hz über die Note
    supersaw(beat, midis, lenBeats, { vel = 1, cutoff = 3000, attack = 0.02, release = 0.25, sweep = null, width = 0.6, voices = 3 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const n = notesOf(midis);
      const level = 0.12 * vel / Math.sqrt(n.length);
      const sides = [-width, width].map((side) => {
        const lp = biquad('lowpass', sweep ? sweep[0] : cutoff, 0.8);
        if (sweep) {
          lp.frequency.automationRate = 'k-rate';
          lp.frequency.setValueAtTime(sweep[0], t);
          lp.frequency.exponentialRampToValueAtTime(sweep[1], t + d);
        }
        lp.connect(holdTo(panTo(side), t, d, level, attack, release));
        return lp;
      });
      for (const m of n) {
        (voices === 2 ? [[-14, [0]], [14, [1]]] : [[-22, [0]], [0, [0, 1]], [22, [1]]]).forEach(([det, to]) => {
          const o = osc('sawtooth', tf(m));
          o.detune.value = det;
          for (const s of to) o.connect(sides[s]);
          o.start(t);
          o.stop(t + d + release);
        });
      }
    },
    // Chor-Fläche: Sägezähne durch drei Formantfilter (Vokal a/o/u)
    vox(beat, midis, lenBeats, { vel = 1, vowel = 'a', attack = 0.25, release = 0.5 } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const FORMANTS = { a: [[800, 1], [1150, 0.5], [2900, 0.25]], o: [[450, 1], [800, 0.45], [2830, 0.15]], u: [[325, 1], [700, 0.3], [2530, 0.1]] };
      const g = holdGain(t, d, 0.5 * vel, attack, release);
      const input = ctx.createGain();
      input.gain.value = 1 / Math.sqrt(notesOf(midis).length);
      for (const [ff, a] of FORMANTS[vowel] || FORMANTS.a) {
        const fg = ctx.createGain();
        fg.gain.value = a;
        input.connect(biquad('bandpass', ff, 6)).connect(fg).connect(g);
      }
      const vib = osc('sine', 5);
      const depth = ctx.createGain();
      depth.gain.value = 8;
      vib.connect(depth);
      vib.start(t);
      vib.stop(t + d + release);
      for (const m of notesOf(midis)) {
        for (const det of [-8, 8]) {
          const o = osc('sawtooth', tf(m));
          o.detune.value = det;
          o.detune.automationRate = 'k-rate';
          depth.connect(o.detune);
          o.connect(input);
          o.start(t);
          o.stop(t + d + release);
        }
      }
    },
    // Marimba/Kalimba: Grundton plus schnell abklingender Oberton (ratio)
    mallet(beat, midi, vel = 1, { decay = 0.5, ratio = 3.99, bright = 0.3, pan = 0 } = {}) {
      const t = T(beat);
      const f = tf(midi);
      const dest = panTo(pan);
      const o1 = osc('sine', f);
      o1.connect(decayTo(dest, t, 0.42 * vel, decay, 0.002));
      o1.start(t);
      o1.stop(t + decay + 0.05);
      const o2 = osc('sine', f * ratio);
      o2.connect(decayTo(dest, t, 0.42 * vel * bright, decay * 0.22, 0.001));
      o2.start(t);
      o2.stop(t + decay * 0.22 + 0.01);
    },
    // Amapiano-Log-Drum: angezerrter Sinus mit Pitch-Knick, holziger Bass
    logDrum(beat, midi, lenBeats, { vel = 1, bend = 1.5, drive = 3, tone = 1100 } = {}) {
      const t = T(beat);
      const d = Math.min(T(lenBeats), 0.9);
      const f = tf(midi);
      const o = osc('sine', f * bend);
      o.frequency.setValueAtTime(f * bend, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6 * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.22 * vel, t + d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
      g.connect(out);
      o.connect(shaper(drive)).connect(biquad('lowpass', tone, 1)).connect(g);
      o.start(t);
      o.stop(t + d + 0.1);
    },
    // Tonhöhen-Sweep (Laser, Abwärts-Zap, tonaler Riser); Frequenzen in Hz, fest
    zap(beat, lenBeats, from, to, { vel = 1, type = 'sawtooth', cutoff = 4000, fadeIn = false } = {}) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc(type, from);
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + d);
      const g = ctx.createGain();
      g.connect(out);
      if (fadeIn) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3 * vel, t + d - 0.02);
        g.gain.linearRampToValueAtTime(0, t + d);
      } else {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      }
      o.connect(biquad('lowpass', cutoff, 1)).connect(g);
      o.start(t);
      o.stop(t + d + 0.01);
    },
    // Rückwärts-Becken: Rauschen schwillt an, bricht am Ende ab
    swell(beat, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const hp = biquad('highpass', 2500, 0.7);
      hp.frequency.automationRate = 'k-rate';
      hp.frequency.setValueAtTime(2500, t);
      hp.frequency.exponentialRampToValueAtTime(6000, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7 * vel, t + d - 0.015);
      g.gain.linearRampToValueAtTime(0, t + d);
      g.connect(out);
      noiseSource(t, d).connect(hp).connect(g);
    },
    // Sub-Drop: tiefer Sinus, der nach unten gleitet
    subDrop(beat, lenBeats, vel = 1) {
      const t = T(beat);
      const d = T(lenBeats);
      const o = osc('sine', 95);
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(28, t + d);
      o.connect(shaper(1.5)).connect(decayGain(t, 0.95 * vel, d, 0.004));
      o.start(t);
      o.stop(t + d + 0.02);
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
    id: 'drums-four', name: 'Four to the Floor', genres: ['house', 'techno', 'pop'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) { k.kick(b); k.hat(b + 0.5, 0.9); }
      k.clap(1); k.clap(3);
    },
  },
  {
    id: 'drums-break', name: 'Breakbeat', genres: ['breaks', 'hiphop'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      [0, 1.75, 2.5, 4, 6.25, 6.5].forEach((b) => k.kick(b));
      [1, 3, 5, 7, 7.75].forEach((b) => k.snare(b, b % 1 ? 0.45 : 1));
      for (let b = 0; b < 8; b += 0.5) k.hat(b, b % 1 ? 0.6 : 0.9);
    },
  },
  {
    id: 'drums-halftime', name: 'Halftime', genres: ['hiphop', 'pop'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      k.kick(0); k.kick(2.75, 0.8); k.snare(2);
      for (let b = 0; b < 4; b += 0.5) k.hat(b, b % 1 ? 0.55 : 0.85);
    },
  },
  {
    id: 'drums-hats16', name: 'Hi-Hats 16tel', genres: ['house', 'hiphop', 'pop'], category: 'drums', bars: 1, peak: 0.42,
    render(k) {
      for (let i = 0; i < 15; i++) {
        if (i === 14) k.hat(i / 4, 0.8, true);
        else k.hat(i / 4, i % 4 === 0 ? 1 : i % 2 === 0 ? 0.7 : 0.45);
      }
    },
  },
  {
    id: 'bass-pulse', name: 'Pulse Bass A', genres: ['techno', 'house'], category: 'bass', bars: 1, peak: 0.5,
    render(k) { for (let i = 0; i < 8; i++) k.bass(i / 2, i % 4 === 3 ? 45 : 33, 0.45); },
  },
  {
    id: 'bass-prog', name: 'Bass Am–F–C–G', genres: ['pop', 'house'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      ROOTS.forEach((r, bar) => {
        [r, r, r + 12, r, r, r + 12, r, r + 7].forEach((m, i) => k.bass(bar * 4 + i / 2, m, 0.45));
      });
    },
  },
  {
    id: 'bass-sub', name: 'Sub Am–F–C–G', genres: ['hiphop', 'pop'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      ROOTS.forEach((r, bar) => { k.sub(bar * 4, r, 1.5); k.sub(bar * 4 + 2, r, 1.25); k.sub(bar * 4 + 3.5, r, 0.4); });
    },
  },
  {
    id: 'chords-pad', name: 'Pad Am–F–C–G', genres: ['pop', 'ambient', 'house'], category: 'chords', bars: 4, peak: 0.42,
    render(k) { CHORDS.forEach((c, bar) => k.pad(bar * 4, c, 4)); },
  },
  {
    id: 'chords-stabs', name: 'Stabs Am–F–C–G', genres: ['house', 'pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      CHORDS.forEach((c, bar) => {
        for (const b of [0.5, 1.5, 2.5, 3.25]) k.stab(bar * 4 + b, c.map((m) => m + 12));
      });
    },
  },
  {
    id: 'synth-arp', name: 'Arp Am', genres: ['house', 'techno', 'pop'], category: 'synth', bars: 1, peak: 0.4,
    render(k) {
      [69, 72, 76, 81, 76, 72, 69, 72, 69, 72, 76, 81, 84, 81, 76, 72]
        .forEach((m, i) => k.pluck(i / 4, m, i % 4 === 0 ? 1 : 0.75, 0.16));
    },
  },
  {
    id: 'synth-arp-prog', name: 'Arp Am–F–C–G', genres: ['pop', 'house'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      CHORDS.forEach((c, bar) => {
        const notes = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24];
        for (let i = 0; i < 16; i++) k.pluck(bar * 4 + i / 4, notes[order[i % 8]], i % 4 === 0 ? 1 : 0.7, 0.15);
      });
    },
  },
  {
    id: 'synth-lead', name: 'Melodie Am–F–C–G', genres: ['pop'], category: 'synth', bars: 4, peak: 0.42,
    render(k) { LEAD.forEach(([b, m, d]) => k.lead(b, m, d)); },
  },
  { id: 'fx-riser', name: 'Riser', genres: ['techno', 'house', 'pop', 'breaks'], category: 'fx', bars: 2, peak: 0.45, oneShot: true, render(k) { k.riser(0, 8); } },
  { id: 'fx-crash', name: 'Crash', genres: ['pop', 'house', 'breaks', 'hiphop', 'techno'], category: 'fx', bars: 1, peak: 0.42, oneShot: true, render(k) { k.crash(0); } },
  { id: 'fx-impact', name: 'Impact', genres: ['ambient', 'techno', 'hiphop'], category: 'fx', bars: 1, peak: 0.6, oneShot: true, render(k) { k.impact(0); } },
  // ---------- Techno-Paket (A-Moll, 909-artig) ----------
  {
    id: 'techno-kick', name: 'Techno-Kick', genres: ['techno'], category: 'drums', bars: 1, peak: 0.66,
    render(k) { for (let b = 0; b < 4; b++) k.kick909(b); },
  },
  {
    id: 'techno-groove', name: 'Techno-Groove', genres: ['techno'], category: 'drums', bars: 1, peak: 0.64,
    render(k) {
      for (let b = 0; b < 4; b++) { k.kick909(b); k.hat909(b + 0.5, 0.9, true); k.hat909(b + 0.25, 0.35); k.hat909(b + 0.75, 0.45); }
      k.clap(1, 0.8); k.clap(3, 0.8); k.rim(3.75, 0.6);
    },
  },
  {
    id: 'techno-hats', name: 'Offbeat-Hats', genres: ['techno', 'house'], category: 'drums', bars: 1, peak: 0.45,
    render(k) { for (let b = 0; b < 4; b++) { k.hat909(b + 0.5, 1, true); k.hat909(b + 0.75, 0.4); } },
  },
  {
    id: 'techno-ride', name: 'Ride 8tel', genres: ['techno'], category: 'drums', bars: 1, peak: 0.4,
    render(k) { for (let b = 0; b < 4; b += 0.5) k.ride(b, b % 1 ? 1 : 0.6); },
  },
  {
    id: 'techno-perc', name: 'Industrial-Perc', genres: ['techno'], category: 'drums', bars: 2, peak: 0.5,
    render(k) {
      [[0.75, 310], [1.5, 220], [2.25, 410], [3.5, 260], [4.75, 310], [5.25, 520], [6.5, 220], [7.25, 410]].forEach(([b, f], i) => k.clang(b, f, i % 2 ? 0.7 : 1));
      [1.75, 3.25, 5.75, 7.75].forEach((b) => k.rim(b, 0.7));
    },
  },
  {
    id: 'techno-rumble', name: 'Rumble-Bass A', genres: ['techno'], category: 'bass', bars: 1, peak: 0.55,
    render(k) { for (let b = 0; b < 4; b++) k.rumble(b + 0.12, 33, 0.86); },
  },
  {
    id: 'techno-offbass', name: 'Offbeat-Bass A', genres: ['techno', 'house'], category: 'bass', bars: 1, peak: 0.5,
    render(k) { for (let b = 0; b < 4; b++) k.bass(b + 0.5, b === 3 ? 36 : 33, 0.35); },
  },
  {
    id: 'techno-acid', name: 'Acid-Linie A', genres: ['techno'], category: 'bass', bars: 2, peak: 0.5,
    render(k) {
      // [Schritt (16tel), Ton, Akzent, Slide vom vorigen Ton]
      const line = [[0, 33, 1], [2, 45], [3, 33], [4, 36, 0, 1], [6, 33, 1], [7, 43], [8, 45, 1], [10, 33], [11, 40, 0, 1], [12, 33], [14, 45, 1], [15, 43],
        [16, 33, 1], [18, 45], [19, 48, 0, 1], [20, 45], [22, 33, 1], [23, 31], [24, 33], [26, 45, 1], [27, 43, 0, 1], [28, 40], [30, 36, 1], [31, 33]];
      line.forEach(([st, m, acc, slide], i) => {
        const next = line[i + 1]?.[0] ?? 32;
        k.acid(st / 4, m, Math.min(next - st, 2) / 4 * 0.85, { accent: !!acc, slideFrom: slide ? line[i - 1][1] : null, cutoff: 380 + (st % 16) * 25 });
      });
    },
  },
  {
    id: 'techno-squelch', name: 'Acid-Squelch', genres: ['techno'], category: 'synth', bars: 1, peak: 0.42,
    render(k) {
      [45, 45, 57, 45, 48, 45, 55, 45, 45, 52, 45, 57, 45, 48, 45, 60].forEach((m, i) => {
        k.acid(i / 4, m, 0.2, { accent: i % 3 === 0, cutoff: 700 + 120 * Math.sin(i / 2.5), env: 3200, res: 18 });
      });
    },
  },
  {
    id: 'techno-stab', name: 'Dub-Stab Am', genres: ['techno', 'house'], category: 'chords', bars: 2, peak: 0.42,
    render(k) { [0.75, 2.5, 4.75, 6.25].forEach((b) => k.dubStab(b, [57, 60, 64, 67])); },
  },
  {
    id: 'techno-seq', name: 'Hypno-Sequenz', genres: ['techno'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const notes = [57, 57, 69, 57, 60, 57, 64, 57];
      for (let i = 0; i < 32; i++) k.pluck(i / 4, notes[i % 8] - 12, i % 4 === 0 ? 1 : 0.65, 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(i / 5)));
    },
  },
  { id: 'techno-sweep', name: 'Noise-Sweep', genres: ['techno', 'house'], category: 'fx', bars: 4, peak: 0.45, oneShot: true, render(k) { k.sweep(0, 16); } },
  { id: 'techno-down', name: 'Downlifter', genres: ['techno', 'house', 'breaks'], category: 'fx', bars: 2, peak: 0.45, oneShot: true, render(k) { k.sweep(0, 8, true); } },
  { id: 'techno-hit', name: 'Industrial-Hit', genres: ['techno', 'ambient'], category: 'fx', bars: 1, peak: 0.6, oneShot: true, render(k) { k.impact(0); k.clang(0, 180); k.clang(0.02, 260, 0.7); } },
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

async function renderLoop(def, bpm, semis = 0) {
  const spb = 60 / bpm;
  const beats = def.bars * 4;
  const loopFrames = Math.round(beats * spb * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, loopFrames + TAIL_SECONDS * SAMPLE_RATE, SAMPLE_RATE);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  def.render(createKit(ctx, bus, spb, def.category === 'drums' || def.category === 'fx' ? 0 : semis));
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
    this.variants = new Map(); // „id@faktor“ → gedehnte Fassung (Clip-Laufzeit)
    this.pendingVariants = new Map();
    this.coreIds = []; // Grundausstattung (Tests warten darauf über catalogReady)
    this.semis = 0; // Tonart des Songs relativ zu A-Moll (die synthetischen Loops werden darin gerendert)
    this.pending = new Map(); // id → laufendes Laden auf Abruf
  }

  // Gedehnte Fassung eines Sounds: faktor-fache Länge, gleiche Tonhöhe (WSOLA im Rechen-Worker).
  // Gilt nur, solange der Grund-Sound unverändert ist (gleiche rev, z. B. nach Tempowechsel neu).
  stretched(id, factor) {
    const base = this.samples.get(id);
    if (!base || !factor || factor === 1) return base;
    const v = this.variants.get(`${id}@${factor}`);
    return v && v.baseRev === base.rev ? v : null;
  }

  async ensureStretched(id, factor) {
    const base = this.samples.get(id);
    if (!base?.buffer || !factor || factor === 1) return base;
    const ready = this.stretched(id, factor);
    if (ready) return ready;
    const key = `${id}@${factor}`;
    const pendingKey = `${key}#${base.rev}`;
    if (this.pendingVariants.has(pendingKey)) return this.pendingVariants.get(pendingKey);
    const job = (async () => {
      const { runJob } = await import('./dsp/run.js');
      const chs = Array.from({ length: base.buffer.numberOfChannels }, (_, c) => base.buffer.getChannelData(c));
      const out = await runJob('stretch', { chs, sampleRate: base.buffer.sampleRate, ratio: factor, loop: base.kind === 'loop' });
      const buffer = new AudioBuffer({ numberOfChannels: out.length, length: out[0].length, sampleRate: base.buffer.sampleRate });
      out.forEach((d, c) => buffer.copyToChannel(d, c));
      const lengthBeats = base.lengthBeats * factor;
      const v = {
        id: key, baseId: id, factor, baseRev: base.rev, rev: base.rev * 1000 + Math.round(factor * 100),
        name: base.name, category: base.category, colorCat: base.colorCat, kind: base.kind, patternId: base.patternId,
        buffer, lengthBeats, peaks: computePeaks(buffer, lengthBeats),
      };
      this.variants.set(key, v);
      this.pendingVariants.delete(pendingKey);
      this.emit();
      return v;
    })();
    this.pendingVariants.set(pendingKey, job);
    return job;
  }

  // Alle gedehnten Fassungen eines Projekts bereitstellen (vor Export und Offline-Rendering)
  async ensureProject(project) {
    await this.ensureMany(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)));
    const jobs = [];
    for (const t of project.tracks) for (const c of t.clips) if (c.stretch && c.stretch !== 1) jobs.push(this.ensureStretched(c.sampleId, c.stretch));
    await Promise.all(jobs);
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

  // Sound auf Abruf: steht sofort mit Name und Länge im Regal, der Klang wird erst beim ersten Gebrauch
  // geladen (Katalog-Datei) bzw. erzeugt (synthetischer Loop) – so bleibt der Start schnell, egal wie groß die Bibliothek ist
  stub(sample, load = null) {
    sample.lazy = true;
    sample._load = load;
    sample.lengthBeats ??= sample.beats ?? 4;
    this.samples.set(sample.id, sample);
    return sample;
  }

  async ensure(id) {
    const s = this.samples.get(id);
    if (!s || !s.lazy) return s;
    if (!this.pending.has(id)) {
      this.pending.set(id, (async () => {
        try {
          if (s._load) await s._load(s);
          await this._prepare(s, this.bpm);
          // Tempo oder Tonart haben sich währenddessen geändert: gleich passend nachziehen
          if (this.prepared.get(id) !== this._tag(s, this.bpm)) await this._prepare(s, this.bpm);
          s.lazy = false;
          this.emit();
        } finally {
          this.pending.delete(id);
        }
      })());
    }
    await this.pending.get(id);
    return s;
  }

  // Grundausstattung vollständig laden (Tests); die App selbst lädt auf Abruf
  get catalogReady() { return this.ensureMany(this.coreIds); }

  ensureMany(ids) {
    return Promise.all([...new Set(ids)].map((id) => this.ensure(id).catch((err) => console.warn(`Sound ${id}: ${err.message}`))));
  }

  // Tonale synthetische Loops hängen auch von der Tonart ab
  _tag(s, bpm) { return s.def && s.key ? `${bpm}|${this.semis}` : bpm; }

  async _prepare(s, bpm) {
    const tag = this._tag(s, bpm);
    if (this.prepared.get(s.id) === tag && s.buffer) return;
    let r;
    if (s.def) r = await renderLoop(s.def, bpm, this.semis);
    else if (s.make) r = await s.make(bpm);
    else if (s.kind === 'loop' && s.orig) r = { buffer: stretchLoop(s.orig, s.beats, bpm), lengthBeats: s.beats };
    else if (s.orig) r = padOneShot(s.orig, bpm);
    else return; // fester Puffer ohne Original (z. B. Testsignal)
    s.buffer = r.buffer;
    s.lengthBeats = r.lengthBeats;
    s.peaks = computePeaks(s.buffer, s.lengthBeats);
    s.rev = (s.rev ?? 0) + 1;
    this.prepared.set(s.id, tag);
  }

  // Tonart wechseln: nur die tonalen synthetischen Loops werden neu gerendert
  async setKey(semis) {
    this.semis = semis;
    for (const s of this.samples.values()) {
      if (!(s.def && s.key) || s.lazy) continue;
      await this._prepare(s, this.bpm);
      if (this.semis !== semis) return;
    }
    this.emit();
  }

  // Tempo einzelner Sounds aus dem Projekt (sampleId → Schläge): Aufnahme gilt dann als Loop dieser Länge.
  // Nur Sounds mit Originalaufnahme; Rückgabe: true, wenn sich etwas geändert hat.
  async applySampleTempo(map = {}) {
    let changed = false;
    const ids = new Set([...Object.keys(map), ...[...this.samples.values()].filter((s) => s.tempoBase).map((s) => s.id)]);
    for (const id of ids) {
      const s = this.samples.get(id);
      if (!s || s.def || s.make) continue;
      if (s.lazy) await this.ensure(id);
      if (!s.orig) continue;
      const beats = map[id] ?? null;
      s.tempoBase ??= { kind: s.kind, beats: s.beats, bpm: s.bpm };
      const want = beats == null ? s.tempoBase : { kind: 'loop', beats, bpm: Math.round((beats * 60 / s.orig.duration) * 100) / 100 };
      if (s.kind === want.kind && s.beats === want.beats) { if (beats == null) delete s.tempoBase; continue; }
      Object.assign(s, want);
      if (beats == null) delete s.tempoBase;
      this.prepared.delete(id);
      await this._prepare(s, this.bpm);
      changed = true;
    }
    if (changed) this.emit();
    return changed;
  }

  async setTempo(bpm) {
    this.bpm = bpm;
    for (const s of this.samples.values()) {
      if (s.lazy) continue; // wird beim ersten Gebrauch im passenden Tempo erzeugt
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
    const orig = await decode(await fetchAsset(entry.file));
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

// Synthetische Loops und die Katalog-Sounds, die das Projekt braucht, vor dem Start; die übrigen Katalog-Sounds
// (zusammen viele MB) lädt `library.catalogReady` im Hintergrund nach – am Handy startet Loopwerk sonst ewig nicht.
// Gesamte Bibliothek: eigene synthetische Loops und freie Katalog-Sounds (CC0)
const ALL_LOOP_DEFS = [...LOOP_DEFS, ...MORE_LOOP_DEFS];
const ALL_CATALOG = [...CATALOG, ...VCSL_CATALOG];

// Alle Sounds als Einträge sofort im Regal; geladen bzw. erzeugt wird nur, was das Projekt braucht (need) –
// der Rest beim ersten Anhören oder Einsetzen (library.ensure).
export async function buildLibrary({ bpm = LIBRARY_BPM, semis = 0, onProgress, need = null } = {}) {
  const lib = new Library();
  lib.bpm = bpm;
  lib.semis = semis;
  for (const def of ALL_LOOP_DEFS) {
    lib.stub({
      id: def.id, name: def.name, category: def.category, kind: def.oneShot ? 'oneshot' : 'loop',
      beats: def.bars * 4, bpm: null, key: def.category === 'drums' || def.category === 'fx' ? null : LIBRARY_KEY,
      oneShot: !!def.oneShot, origin: 'Loopwerk', license: 'CC0', genres: def.genres || [], def,
    });
  }
  for (const entry of ALL_CATALOG) {
    lib.stub({ ...entry, key: entry.key === 'keine' ? null : entry.key ?? null }, async (s) => {
      const loaded = await loadCatalogEntry(entry);
      if (!loaded) throw new Error('nicht geladen');
      Object.assign(s, { orig: loaded.orig, duration: loaded.duration, bpm: loaded.bpm ?? s.bpm });
    });
  }
  lib.coreIds = [...LOOP_DEFS.map((d) => d.id), ...CATALOG.map((e) => e.id)];
  const first = need ? [...need].filter((id) => lib.samples.has(id)) : [];
  let done = 0;
  await Promise.all(first.map((id) => lib.ensure(id).catch(() => {}).then(() => onProgress?.(++done, first.length))));
  if (!first.length) onProgress?.(1, 1);
  return lib;
}
