// AudioWorklet-Prozessoren für die Summe: Mastering-Kette und Lo-Fi (Effekt-Pad).
// Geladen mit ctx.audioWorklet.addModule() – für AudioContext und OfflineAudioContext.
// In process(): keine Speicherreservierung, keine Closures, kein Logging.

import { MasterTone, TruePeakLimiter } from './master-core.js';

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
