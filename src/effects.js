// Effekte: festes Rack pro Kanal (EQ → Kompressor → Echo → Hall), wie im Music-Maker-Mixer.
// Jeder Effekt funktioniert mit AudioContext und OfflineAudioContext (gleiche Signalkette für Export und Tests).

import { mulberry32 } from './util.js';

export const ECHO_TIMES = [
  { id: '1/4', label: '1/4', beats: 1 },
  { id: '1/8d', label: '1/8 punktiert', beats: 0.75 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '1/16', label: '1/16', beats: 0.25 },
  { id: '1/4d', label: '1/4 punktiert', beats: 1.5 },
];

export const EFFECTS = [
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
    },
    create(ctx) {
      const comp = ctx.createDynamicsCompressor();
      comp.knee.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return {
        input: comp, output: makeup,
        set(p, t) {
          ramp(comp.threshold, -p.amount * 30, t);
          ramp(comp.ratio, 1 + p.amount * 7, t);
          ramp(makeup.gain, Math.pow(10, (p.amount * 9) / 20), t);
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
export function buildFxChain(ctx, fxState, spb) {
  const fx = withFx(fxState);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const units = {};
  let last = input;
  for (const e of EFFECTS) {
    if (!fx[e.id].on) continue;
    const u = e.create(ctx);
    u.set(fx[e.id], null, spb);
    last.connect(u.input);
    last = u.output;
    units[e.id] = u;
  }
  last.connect(output);
  return { input, output, units, key: fxKey(fx) };
}

export const fxKey = (fx) => EFFECT_IDS.filter((id) => fx?.[id]?.on).join('+');

export function updateFxParams(chain, fxState, t, spb) {
  const fx = withFx(fxState);
  for (const [id, u] of Object.entries(chain.units)) u.set(fx[id], t, spb);
}
