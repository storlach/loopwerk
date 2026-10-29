// Effekte: festes Rack pro Kanal (Verzerrer → Filter → EQ → Kompressor → Pumpen → Echo → Hall), wie im Music-Maker-Mixer.
// Jeder Effekt funktioniert mit AudioContext und OfflineAudioContext (gleiche Signalkette für Export und Tests).
// set(p, t, spb, grid): grid ist die Kontextzeit von Schlag 0 des Songs – daran richten sich LFOs im Takt aus.

import { mulberry32 } from './util.js';

export const ECHO_TIMES = [
  { id: '1/4', label: '1/4', beats: 1 },
  { id: '1/8d', label: '1/8 punktiert', beats: 0.75 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '1/16', label: '1/16', beats: 0.25 },
  { id: '1/4d', label: '1/4 punktiert', beats: 1.5 },
];

export const LFO_RATES = [
  { id: 'off', label: 'aus', beats: 0 },
  { id: '4bar', label: '4 Takte', beats: 16 },
  { id: '1bar', label: '1 Takt', beats: 4 },
  { id: '1/2', label: '1/2', beats: 2 },
  { id: '1/4', label: '1/4', beats: 1 },
  { id: '1/8', label: '1/8', beats: 0.5 },
];

export const PUMP_RATES = [
  { id: '1/4', label: 'jeder Schlag', beats: 1 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '1/2', label: 'jeder 2. Schlag', beats: 2 },
];

const DRIVE_TYPES = [
  { id: 'soft', label: 'Warm' },
  { id: 'hard', label: 'Hart' },
  { id: 'fuzz', label: 'Fuzz' },
  { id: 'crush', label: 'Bitcrusher' },
];

const FILTER_TYPES = [
  { id: 'lowpass', label: 'Tiefpass' },
  { id: 'highpass', label: 'Hochpass' },
  { id: 'bandpass', label: 'Bandpass' },
];

// Regler 0…1 auf Frequenzen (logarithmisch) abbilden
export const cutoffHz = (v) => 40 * Math.pow(2, v * 8.81); // 40 Hz … 18 kHz
const toneHz = (v) => 400 * Math.pow(2, v * 5.5); // 400 Hz … 18 kHz
const formatHz = (hz) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1).replace('.', ',')} kHz` : `${Math.round(hz)} Hz`);
export const crushBits = (drive) => Math.round(16 - drive * 13);

// Kennlinien der Verzerrung; k = Vorverstärkung
const curveCache = new Map();
export function driveCurve(type, drive) {
  const key = `${type}|${Math.round(drive * 100)}`;
  if (curveCache.has(key)) return curveCache.get(key);
  const n = 4096;
  const c = new Float32Array(n);
  const k = 1 + drive * 30;
  const levels = Math.pow(2, crushBits(drive) - 1);
  const knee = (y) => (Math.abs(y) < 0.9 ? y : Math.sign(y) * (0.9 + 0.1 * Math.tanh((Math.abs(y) - 0.9) / 0.1)));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    if (type === 'hard') c[i] = knee(Math.max(-1.2, Math.min(1.2, k * x)));
    else if (type === 'fuzz') { const y = k * 1.5 * x; c[i] = y > 0 ? Math.tanh(y) : 0.75 * Math.tanh(0.45 * y); }
    else if (type === 'crush') c[i] = Math.round(x * levels) / levels;
    else c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  curveCache.set(key, c);
  return c;
}

// Pegelausgleich: ein mittlerer Pegel (0,3) soll nach der Verzerrung etwa gleich laut bleiben
function driveMakeup(type, drive) {
  if (type === 'crush') return 1;
  const c = driveCurve(type, drive);
  const at = (x) => Math.abs(c[Math.round(((x + 1) / 2) * (c.length - 1))]);
  return Math.pow(0.3 / Math.max(1e-6, (at(0.3) + at(-0.3)) / 2), 0.8);
}

// Tieffrequenz-Oszillator, dessen Phase an Schlag 0 (grid) ausgerichtet ist. Neustart bei Tempo-/Rasteränderung.
function beatLfo(ctx, target, wave) {
  let osc = null;
  let key = null;
  return {
    set(beats, spb, grid, live) {
      const k = `${beats}|${spb}|${grid}`;
      if (k === key) return;
      key = k;
      const now = live ? ctx.currentTime + 0.01 : ctx.currentTime;
      const old = osc;
      osc = null;
      if (beats > 0) {
        const period = beats * spb;
        const start = (grid ?? 0) + Math.ceil(((now - (grid ?? 0)) / period) - 1e-9) * period;
        osc = ctx.createOscillator();
        if (wave) osc.setPeriodicWave(wave); else osc.type = 'sine';
        osc.frequency.value = 1 / period;
        osc.connect(target);
        osc.start(Math.max(now, start));
        old?.stop(Math.max(now, start));
      } else {
        old?.stop(now);
      }
    },
  };
}

// Sägezahn, der bei Phase 0 von −1 startet und bis +1 ansteigt (Ducking: tief auf dem Schlag, dann zurück)
const rampWaves = new WeakMap();
function rampWave(ctx) {
  if (!rampWaves.has(ctx)) {
    const n = 4096; // viele Obertöne: der Sprung auf dem Schlag bleibt steil (< 1 ms)
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) imag[i] = -2 / (Math.PI * i);
    rampWaves.set(ctx, ctx.createPeriodicWave(real, imag, { disableNormalization: true }));
  }
  return rampWaves.get(ctx);
}

export const EFFECTS = [
  {
    id: 'drive', label: 'Verzerrer',
    params: {
      type: { label: 'Art', options: DRIVE_TYPES, default: 'soft' },
      drive: { label: 'Stärke', min: 0, max: 1, step: 0.01, default: 0.4, unit: '%' },
      tone: { label: 'Ton', min: 0, max: 1, step: 0.01, default: 0.75, format: (v) => formatHz(toneHz(v)) },
      mix: { label: 'Anteil', min: 0, max: 1, step: 0.01, default: 1, unit: '%' },
    },
    create(ctx) {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dry = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const dc = ctx.createBiquadFilter();
      dc.type = 'highpass';
      dc.frequency.value = 25;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.Q.value = 0.5;
      const post = ctx.createGain();
      const wet = ctx.createGain();
      input.connect(dry).connect(output);
      input.connect(shaper).connect(dc).connect(tone).connect(post).connect(wet).connect(output);
      let shape = null;
      return {
        input, output,
        set(p, t) {
          const key = `${p.type}|${Math.round(p.drive * 100)}`;
          if (key !== shape) {
            shape = key;
            shaper.curve = driveCurve(p.type, p.drive);
            shaper.oversample = p.type === 'crush' ? 'none' : '4x';
          }
          ramp(post.gain, driveMakeup(p.type, p.drive), t);
          ramp(tone.frequency, toneHz(p.tone), t);
          ramp(wet.gain, p.mix, t);
          ramp(dry.gain, 1 - p.mix, t);
        },
      };
    },
  },
  {
    id: 'filter', label: 'Filter',
    params: {
      type: { label: 'Art', options: FILTER_TYPES, default: 'lowpass' },
      cutoff: { label: 'Frequenz', min: 0, max: 1, step: 0.005, default: 0.7, format: (v) => formatHz(cutoffHz(v)) },
      reso: { label: 'Resonanz', min: 0, max: 1, step: 0.01, default: 0.2, unit: '%' },
      lfo: { label: 'Bewegung', options: LFO_RATES, default: 'off' },
      depth: { label: 'Tiefe', min: 0, max: 1, step: 0.01, default: 0.5, unit: '%' },
    },
    create(ctx) {
      const f = ctx.createBiquadFilter();
      const lfoAmt = ctx.createGain();
      lfoAmt.connect(f.detune);
      const lfo = beatLfo(ctx, lfoAmt);
      return {
        input: f, output: f,
        set(p, t, spb, grid) {
          f.type = p.type;
          ramp(f.frequency, cutoffHz(p.cutoff), t);
          ramp(f.Q, 0.7 + Math.pow(p.reso, 1.5) * 17, t);
          ramp(lfoAmt.gain, p.depth * 3600, t); // bis ±3 Oktaven
          lfo.set(LFO_RATES.find((r) => r.id === p.lfo)?.beats ?? 0, spb, grid, t != null);
        },
      };
    },
  },
  {
    id: 'eq', label: 'EQ',
    params: {
      low: { label: 'Tiefen', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
      mid: { label: 'Mitten', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
      high: { label: 'Höhen', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
    },
    create(ctx) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 200;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.9;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 5000;
      low.connect(mid).connect(high);
      return {
        input: low, output: high,
        set(p, t) { ramp(low.gain, p.low, t); ramp(mid.gain, p.mid, t); ramp(high.gain, p.high, t); },
      };
    },
  },
  {
    id: 'comp', label: 'Kompressor',
    params: {
      amount: { label: 'Stärke', min: 0, max: 1, step: 0.01, default: 0.5, unit: '%' },
      attack: { label: 'Ansprache', min: 1, max: 100, step: 1, default: 5, unit: 'ms' },
      release: { label: 'Ausklang', min: 30, max: 1000, step: 10, default: 150, unit: 'ms' },
      gain: { label: 'Pegel', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB' },
    },
    create(ctx) {
      const comp = ctx.createDynamicsCompressor();
      comp.knee.value = 6;
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return {
        input: comp, output: makeup,
        set(p, t) {
          ramp(comp.threshold, -p.amount * 30, t);
          ramp(comp.ratio, 1 + p.amount * 7, t);
          ramp(comp.attack, p.attack / 1000, t);
          ramp(comp.release, p.release / 1000, t);
          // Automatischer Ausgleich je nach Stärke, dazu der eigene Pegel
          ramp(makeup.gain, Math.pow(10, (p.amount * 9 + p.gain) / 20), t);
        },
      };
    },
  },
  {
    // „Sidechain“-Pumpen: der Pegel taucht auf jedem Schlag ab und kommt wieder hoch (wie unter einer Kick)
    id: 'pump', label: 'Pumpen',
    params: {
      rate: { label: 'Takt', options: PUMP_RATES, default: '1/4' },
      depth: { label: 'Tiefe', min: 0, max: 1, step: 0.01, default: 0.6, unit: '%' },
      release: { label: 'Rückkehr', min: 0, max: 1, step: 0.01, default: 0.5, unit: '%' },
    },
    create(ctx) {
      const vca = ctx.createGain();
      vca.gain.value = 0;
      const shaper = ctx.createWaveShaper();
      shaper.connect(vca.gain);
      const lfo = beatLfo(ctx, shaper, rampWave(ctx));
      let shape = null;
      return {
        input: vca, output: vca,
        set(p, t, spb, grid) {
          const key = `${p.depth}|${p.release}`;
          if (key !== shape) {
            shape = key;
            shaper.curve = pumpCurve(p.depth, p.release);
          }
          lfo.set(PUMP_RATES.find((r) => r.id === p.rate)?.beats ?? 1, spb, grid, t != null);
        },
      };
    },
  },
  {
    id: 'echo', label: 'Echo',
    params: {
      time: { label: 'Zeit', options: ECHO_TIMES, default: '1/8d' },
      feedback: { label: 'Wiederholungen', min: 0, max: 0.85, step: 0.01, default: 0.35, unit: '%' },
      mix: { label: 'Anteil', min: 0, max: 1, step: 0.01, default: 0.3, unit: '%' },
    },
    create(ctx) {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const delay = ctx.createDelay(4);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5000;
      const fb = ctx.createGain();
      const wet = ctx.createGain();
      input.connect(output);
      input.connect(delay);
      delay.connect(tone);
      tone.connect(fb).connect(delay);
      tone.connect(wet).connect(output);
      return {
        input, output,
        set(p, t, spb) {
          const beats = ECHO_TIMES.find((x) => x.id === p.time)?.beats ?? 0.75;
          ramp(delay.delayTime, Math.min(4, beats * spb), t);
          ramp(fb.gain, p.feedback, t);
          ramp(wet.gain, p.mix, t);
        },
      };
    },
  },
  {
    id: 'hall', label: 'Hall',
    params: {
      size: { label: 'Raumgröße', min: 0, max: 1, step: 0.01, default: 0.5, unit: '%' },
      mix: { label: 'Anteil', min: 0, max: 1, step: 0.01, default: 0.25, unit: '%' },
    },
    create(ctx) {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const conv = ctx.createConvolver();
      const wet = ctx.createGain();
      input.connect(output);
      input.connect(conv).connect(wet).connect(output);
      let size = null;
      return {
        input, output,
        set(p, t) {
          ramp(wet.gain, p.mix, t);
          const s = Math.round(p.size * 20) / 20; // Impulsantwort nur in 5-%-Schritten neu erzeugen
          if (s !== size) { size = s; conv.buffer = hallImpulse(ctx.sampleRate, s); }
        },
      };
    },
  },
];

export const EFFECT_IDS = EFFECTS.map((e) => e.id);

// Hüllkurve des Pumpens über die Phase u (0 = Schlag): sofort abtauchen, mit Potenzkurve zurück
export function pumpCurve(depth, release) {
  const n = 1024;
  const c = new Float32Array(n);
  const k = 5 - 4 * release;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    c[i] = 1 - depth * Math.pow(1 - u, k);
  }
  return c;
}

function ramp(param, value, t) {
  if (t == null) param.value = value;
  else param.setTargetAtTime(value, t, 0.015);
}

// Künstliche Impulsantwort: Rauschen mit exponentiellem Abklingen, Höhen klingen schneller ab.
const irCache = new Map();
export function hallImpulse(sampleRate, size) {
  const key = `${sampleRate}|${size}`;
  if (irCache.has(key)) return irCache.get(key);
  const decay = 0.5 + size * 3.5; // Sekunden bis −60 dB
  const length = Math.round(sampleRate * (decay + 0.1));
  const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(17 + c);
    const d = buf.getChannelData(c);
    let lp = 0;
    const pre = Math.round(sampleRate * 0.012); // kurze Vorverzögerung
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      const env = Math.pow(10, (-3 * t) / decay); // −60 dB nach `decay`
      const damp = Math.min(0.95, 0.15 + t / decay); // zunehmende Dämpfung der Höhen
      lp = lp * damp + (rand() * 2 - 1) * (1 - damp);
      d[i] = lp * env;
    }
  }
  // Energie normieren, damit „Anteil“ bei jeder Raumgröße ähnlich laut ist
  let e = 0;
  for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) e += v * v;
  const g = 0.7 / Math.sqrt(e / 2 + 1e-12);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  irCache.set(key, buf);
  return buf;
}

export function defaultFx() {
  const fx = {};
  for (const e of EFFECTS) {
    fx[e.id] = { on: false };
    for (const [k, p] of Object.entries(e.params)) fx[e.id][k] = p.default;
  }
  return fx;
}

// Fehlende Effekte/Parameter mit Standardwerten auffüllen (ältere Projekte)
export function withFx(fx) {
  const base = defaultFx();
  for (const id of EFFECT_IDS) base[id] = { ...base[id], ...(fx?.[id] || {}) };
  return base;
}

// Baut die Effektkette für den aktuellen Zustand. Nur eingeschaltete Effekte liegen im Signalweg.
export function buildFxChain(ctx, fxState, spb, grid = 0) {
  const fx = withFx(fxState);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const units = {};
  let last = input;
  for (const e of EFFECTS) {
    if (!fx[e.id].on) continue;
    const u = e.create(ctx);
    u.set(fx[e.id], null, spb, grid);
    last.connect(u.input);
    last = u.output;
    units[e.id] = u;
  }
  last.connect(output);
  return { input, output, units, key: fxKey(fx) };
}

export const fxKey = (fx) => EFFECT_IDS.filter((id) => fx?.[id]?.on).join('+');

export function updateFxParams(chain, fxState, t, spb, grid = 0) {
  const fx = withFx(fxState);
  for (const [id, u] of Object.entries(chain.units)) u.set(fx[id], t, spb, grid);
}
