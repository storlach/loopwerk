// AudioWorklet-Prozessoren für die Summe: Mastering-Kette und Lo-Fi (Effekt-Pad).
// Geladen mit ctx.audioWorklet.addModule() – für AudioContext und OfflineAudioContext.
// In process(): keine Speicherreservierung, keine Closures, kein Logging.

import { MasterTone, TruePeakLimiter } from './master-core.js';
import { kFilters } from './loudness.js';

const BLOCK = 128;

class MasterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pre', defaultValue: 1, minValue: 0, maxValue: 64, automationRate: 'k-rate' },
      { name: 'drive', defaultValue: 1, minValue: 0, maxValue: 64, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const style = options?.processorOptions?.style ?? 'balanced';
    this.tone = new MasterTone(sampleRate, style);
    this.lim = new TruePeakLimiter(sampleRate, style);
    this.tl = new Float32Array(BLOCK);
    this.tr = new Float32Array(BLOCK);
    this.zero = new Float32Array(BLOCK);
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    const inp = inputs[0];
    const n = out[0].length;
    const l = inp.length ? inp[0] : this.zero;
    const r = inp.length > 1 ? inp[1] : l;
    this.tone.process(l, r, this.tl, this.tr, n, params.pre[0]);
    this.lim.process(this.tl, this.tr, out[0], out.length > 1 ? out[1] : this.tl, n, params.drive[0]);
    return true;
  }
}

// Schutz-Limiter der Summe ohne Mastering: nur der True-Peak-Limiter (Grenze wie beim Mastering, Spitze < −1 dBTP).
// Die feste Anhebung davor ist ein GainNode in der Engine (createLimiter).
class LimiterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.lim = new TruePeakLimiter(sampleRate, 'balanced');
    this.lim.setRelease(options?.processorOptions?.release ?? 0.2);
    this.zero = new Float32Array(BLOCK);
    this.spare = new Float32Array(BLOCK);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const inp = inputs[0];
    const l = inp.length ? inp[0] : this.zero;
    const r = inp.length > 1 ? inp[1] : l;
    this.lim.process(l, r, out[0], out.length > 1 ? out[1] : this.spare, out[0].length, 1);
    return true;
  }
}

// Gemessener Pegelausgleich (Verzerrer, Fassung 2): Eingang 0 = Bezug (trocken), Eingang 1 = Signal (verzerrt).
// Ausgang = Signal · √(Bezug / Signal), beide Leistungen K-gewichtet (wie LUFS) und zweimal geglättet (tau). Gleicht
// nur den langsamen Pegel an; die Verdichtung innerhalb eines Schlags bleibt.
const MATCH_EPS = 1e-10; // ≈ −100 dBFS: darunter kein Ausgleich nach oben
const MATCH_MAX = 16;
class MatchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const tau = options?.processorOptions?.tau ?? 0.2;
    this.a = 1 - Math.exp(-1 / (tau * sampleRate));
    const [f1, f2] = kFilters(sampleRate);
    this.c = new Float64Array([...f1, ...f2]);
    this.s = new Float64Array(16); // 4 Kanäle (Bezug L/R, Signal L/R) × 2 Stufen × 2 Zustände
    this.m = new Float64Array(4); // Glättung: Bezug 2 Pole, Signal 2 Pole
    this.zero = new Float32Array(BLOCK);
    this.spare = new Float32Array(BLOCK);
  }

  // ein Abtastwert durch das K-Filter von Kanal ch
  k(ch, x) {
    const c = this.c;
    const s = this.s;
    const o = ch * 4;
    const y1 = c[0] * x + s[o];
    s[o] = c[1] * x - c[3] * y1 + s[o + 1];
    s[o + 1] = c[2] * x - c[4] * y1;
    const y2 = c[5] * y1 + s[o + 2];
    s[o + 2] = c[6] * y1 - c[8] * y2 + s[o + 3];
    s[o + 3] = c[7] * y1 - c[9] * y2;
    return y2;
  }

  process(inputs, outputs) {
    const ref = inputs[0];
    const sig = inputs[1];
    const out = outputs[0];
    const n = out[0].length;
    const rl = ref.length ? ref[0] : this.zero;
    const rr = ref.length > 1 ? ref[1] : rl;
    const sl = sig.length ? sig[0] : this.zero;
    const sr = sig.length > 1 ? sig[1] : sl;
    const ol = out[0];
    const or = out.length > 1 ? out[1] : this.spare;
    const a = this.a;
    const m = this.m;
    for (let i = 0; i < n; i++) {
      const a0 = this.k(0, rl[i]);
      const a1 = this.k(1, rr[i]);
      const b0 = this.k(2, sl[i]);
      const b1 = this.k(3, sr[i]);
      m[0] += a * ((a0 * a0 + a1 * a1) * 0.5 - m[0]);
      m[1] += a * (m[0] - m[1]);
      m[2] += a * ((b0 * b0 + b1 * b1) * 0.5 - m[2]);
      m[3] += a * (m[2] - m[3]);
      let g = Math.sqrt((m[1] + MATCH_EPS) / (m[3] + MATCH_EPS));
      if (g > MATCH_MAX) g = MATCH_MAX;
      ol[i] = sl[i] * g;
      or[i] = sr[i] * g;
    }
    return true;
  }
}

// Bitcrusher mit Abtastraten-Reduktion: bits (auch gebrochen), hold = Faktor der Reduktion (1 = aus)
class CrushProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = new Float64Array(2);
    this.val = new Float64Array(2);
  }

  process(inputs, outputs, params) {
    const inp = inputs[0];
    const out = outputs[0];
    const levels = Math.pow(2, params.bits[0] - 1);
    const step = 1 / params.hold[0];
    for (let c = 0; c < out.length; c++) {
      const x = inp.length ? inp[Math.min(c, inp.length - 1)] : null;
      const y = out[c];
      let ph = this.phase[c];
      let v = this.val[c];
      for (let i = 0; i < y.length; i++) {
        ph += step;
        if (ph >= 1) { ph -= 1; v = x ? Math.round(x[i] * levels) / levels : 0; }
        y[i] = v;
      }
      this.phase[c] = ph;
      this.val[c] = v;
    }
    return true;
  }
}

registerProcessor('loopwerk-master', MasterProcessor);
registerProcessor('loopwerk-crush', CrushProcessor);
registerProcessor('loopwerk-limiter', LimiterProcessor);
registerProcessor('loopwerk-match', MatchProcessor);
