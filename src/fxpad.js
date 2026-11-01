// Effekt-Pad: live auf die Summe oder eine Spur einwirken, solange der Finger drückt. Nichts davon landet im Projekt.
// Jede Berührung baut eine eigene Kette (Effekt → Bandstopp-Stufe → wet) parallel zum Einschleifpunkt des Kanalzugs
// (strip.pre → strip.dry). Ein- und Aussteigen überblendet dry ↔ wet; alle Effekte geben das volle Signal aus,
// in Ruhestellung unverändert – die Überblendung bleibt dadurch unhörbar.
// Zeiten immer als Kontextzeit (ctx.currentTime bzw. im Test fest vorgegeben); Taktbezug über mix.grid.

export const PAD_MODES = [
  { id: 'filter', label: 'Filter', x: 'Tiefpass · aus · Hochpass', y: 'Resonanz' },
  { id: 'echo', label: 'Echo', x: 'Notenwert', y: 'Rückkopplung' },
  { id: 'stutter', label: 'Stutter', x: 'Länge', y: 'Wiederholen' },
  { id: 'crush', label: 'Lo-Fi', x: 'Bits', y: 'Abtastrate' },
];

export const ECHO_STEPS = [
  { label: '1/16', beats: 0.25 }, { label: '1/8', beats: 0.5 }, { label: '1/8 punktiert', beats: 0.75 },
  { label: '1/4', beats: 1 }, { label: '1/2', beats: 2 },
];
export const STUTTER_STEPS = [
  { label: '1/4', beats: 1 }, { label: '1/8', beats: 0.5 }, { label: '1/16', beats: 0.25 }, { label: '1/32', beats: 0.125 },
];
export const stepAt = (steps, x) => steps[Math.max(0, Math.min(steps.length - 1, Math.floor(x * steps.length)))];

const XF = 0.012; // Überblendung beim Ein- und Aussteigen (s)
const EDGE = 0.003; // Kanten der Stutter-Wiederholungen (s)

// Filter-Abbildung: Mitte (± Totzone) aus, links Tiefpass bis 80 Hz, rechts Hochpass bis 8 kHz
export function padFilter(x, y) {
  const d = x - 0.5;
  const dead = 0.04;
  const u = Math.min(1, Math.max(0, (Math.abs(d) - dead) / (0.5 - dead)));
  const amount = Math.min(1, Math.max(0, (Math.abs(d) - dead) / 0.12));
  return {
    lp: d < 0 ? 20000 * Math.pow(80 / 20000, u) : 20000,
    hp: d > 0 ? 20 * Math.pow(8000 / 20, u) : 10,
    q: -3 + y * 21 * amount, // dB (Web Audio): −3 ≈ ohne Überhöhung
  };
}
export const padBits = (x) => 16 - x * 13;
export const padHold = (y) => 1 + y * y * 31;

// Gain-Automation, deren Wert zu jeder Zeit bekannt ist: neue Rampen setzen genau am aktuellen Wert an.
// Läuft gerade eine Rampe, beginnt die neue an ihrem Ende (höchstens einige Millisekunden später) – ein Abbruch
// mitten in der Rampe würde in Web Audio springen.
class Lane {
  constructor(param, v) {
    this.p = param;
    param.value = v;
    this.seg = { t1: 0, v1: v, t2: 0, v2: v };
  }

  at(t) {
    const s = this.seg;
    if (t <= s.t1) return s.v1;
    if (t >= s.t2) return s.v2;
    return s.v1 + ((s.v2 - s.v1) * (t - s.t1)) / (s.t2 - s.t1);
  }

  ramp(v, t, dur) {
    const s = this.seg;
    const busy = t > s.t1 && t < s.t2;
    const t0 = busy ? s.t2 + 1e-6 : t;
    const v0 = this.at(t0);
    this.p.cancelScheduledValues(t0);
    this.p.setValueAtTime(v0, t0);
    this.p.linearRampToValueAtTime(v, t0 + dur);
    this.seg = { t1: t0, v1: v0, t2: t0 + dur, v2: v };
    return t0 + dur;
  }
}

// Eine Rückkopplungsschleife mit DelayNode verzögert in manchen Browsern um einen Block mehr als eingestellt
// (Chrome: 128 Abtastwerte je Umlauf). Einmal je Abtastrate messen, damit Wiederholungen taktgenau bleiben.
const loopCache = new Map();
export function measureLoopExtra(sampleRate) {
  if (!loopCache.has(sampleRate)) {
    loopCache.set(sampleRate, (async () => {
      const d = Math.round(sampleRate * 0.01);
      const ctx = new OfflineAudioContext(1, 8 * d + 2048, sampleRate);
      const b = ctx.createBuffer(1, 1, sampleRate);
      b.getChannelData(0)[0] = 1;
      const src = ctx.createBufferSource();
      src.buffer = b;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = d / sampleRate;
      const fb = ctx.createGain();
      fb.gain.value = 0.5;
      src.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(ctx.destination);
      src.start(0);
      const x = (await ctx.startRendering()).getChannelData(0);
      const peaks = [];
      for (let i = 0; i < x.length && peaks.length < 2; i++) if (Math.abs(x[i]) > 0.2) peaks.push(i);
      return peaks.length === 2 ? Math.max(0, peaks[1] - peaks[0] - d) : 0;
    })().catch(() => 0));
  }
  return loopCache.get(sampleRate);
}

// Verzögerung mit Rückkopplung, deren Wiederholungen genau `len` Sekunden auseinanderliegen:
// Eingang → Vorlauf (Blockausgleich) → Schleife (len − Blockausgleich). Gibt { input, output, fb, setTime }.
function feedbackDelay(ctx, maxLen, extraFrames) {
  const ex = extraFrames / ctx.sampleRate;
  const pre = ctx.createDelay(1);
  pre.delayTime.value = ex;
  const loop = ctx.createDelay(maxLen + 0.1);
  const fb = ctx.createGain();
  pre.connect(loop);
  loop.connect(fb).connect(loop);
  return {
    input: pre, output: loop, fb,
    setTime(len, t, tau) {
      if (t == null) loop.delayTime.value = Math.max(0, len - ex);
      else target(loop.delayTime, Math.max(0, len - ex), t, tau);
    },
  };
}

function target(param, v, t, tau = 0.02) {
  param.setTargetAtTime(v, t, tau);
}

export class FxPad {
  // spb(): Sekunden je Schlag (aktuelles Tempo)
  constructor(ctx, mix, { spb, worklets = false, loopExtra = 0 }) {
    this.ctx = ctx;
    this.loopExtra = loopExtra;
    this.mix = mix;
    this.spb = spb;
    this.worklets = worklets;
    this.cur = null;
    this.lanes = new WeakMap();
  }

  get active() { return this.cur; }

  strip(targetId) {
    return targetId === 'master' ? this.mix.masterStrip : this.mix.tracks.get(targetId);
  }

  bypass(strip) {
    if (!this.lanes.has(strip)) this.lanes.set(strip, new Lane(strip.dry.gain, 1));
    return this.lanes.get(strip);
  }

  // Nächste Rastergrenze (Länge in Schlägen) ab Zeit t
  nextGrid(t, beats) {
    const len = beats * this.spb();
    const g = this.mix.grid ?? 0;
    return g + Math.ceil((t - g) / len - 1e-9) * len;
  }

  engage(targetId, mode, x, y, t = this.ctx.currentTime) {
    const strip = this.strip(targetId);
    if (!strip) return null;
    if (this.cur) this._drop(this.cur, t);
    const ctx = this.ctx;
    const unit = this._make(mode);
    const tape = ctx.createDelay(3);
    tape.delayTime.value = 0;
    const wetG = ctx.createGain();
    strip.pre.connect(unit.input);
    unit.output.connect(tape).connect(wetG).connect(strip.out);
    const wet = new Lane(wetG.gain, 0);
    const s = { targetId, mode, strip, unit, tape, wetG, wet, x, y };
    unit.set(x, y, t, true);
    wet.ramp(1, t, XF);
    this.bypass(strip).ramp(0, t, XF);
    this.cur = s;
    return s;
  }

  move(x, y, t = this.ctx.currentTime) {
    const s = this.cur;
    if (!s) return;
    s.x = x;
    s.y = y;
    s.unit.set(x, y, t, false);
  }

  // Loslassen: weich zurück. tape: Bandstopp (Tonhöhe sinkt bis zum Stillstand), danach Einsatz auf dem nächsten Schlag
  release(t = this.ctx.currentTime, { tape = false } = {}) {
    const s = this.cur;
    if (!s) return;
    this.cur = null;
    let back;
    if (tape) {
      const T = Math.max(0.35, Math.min(1, this.spb()));
      const n = 64;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * T; curve[i] = (u * u) / (2 * T); }
      s.tape.delayTime.setValueCurveAtTime(curve, t, T);
      s.wet.ramp(0, t + T - 0.08, 0.08);
      back = this.nextGrid(t + T, 1);
      this.bypass(s.strip).ramp(1, back, 0.006);
    } else {
      back = s.unit.release(t);
      s.wet.ramp(0, back, XF * 2);
      this.bypass(s.strip).ramp(1, back, XF * 2);
    }
    this._dispose(s, back + 0.2);
  }

  // Sofort ersetzen (neue Berührung, anderes Ziel)
  _drop(s, t) {
    s.wet.ramp(0, t, XF);
    this._dispose(s, t + 0.2);
  }

  _dispose(s, at) {
    s.dead = true;
    if (this.ctx instanceof OfflineAudioContext) return;
    const ms = Math.max(0, (at - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      try { s.strip.pre.disconnect(s.unit.input); } catch { /* schon getrennt */ }
      s.wetG.disconnect();
      s.unit.dispose?.();
    }, ms);
  }

  _make(mode) {
    if (mode === 'echo') return this._echo();
    if (mode === 'stutter') return this._stutter();
    if (mode === 'crush') return this._crush();
    return this._filter();
  }

  _filter() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    lp.Q.value = -3;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 10;
    hp.Q.value = -3;
    lp.connect(hp);
    const apply = (f, t, tau) => {
      target(lp.frequency, f.lp, t, tau);
      target(hp.frequency, f.hp, t, tau);
      target(lp.Q, f.q, t, tau);
      target(hp.Q, f.q, t, tau);
    };
    return {
      input: lp, output: hp,
      set(x, y, t, first) {
        const f = padFilter(x, y);
        if (first) { lp.frequency.value = f.lp; hp.frequency.value = f.hp; lp.Q.value = f.q; hp.Q.value = f.q; }
        apply(f, t, 0.02);
      },
      // Zurück in die Ruhestellung gleiten, dann übergeben
      release(t) { apply({ lp: 20000, hp: 10, q: -3 }, t, 0.05); return t + 0.3; },
    };
  }

  _echo() {
    const ctx = this.ctx;
    const pad = this;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const sendG = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5000;
    const dl = feedbackDelay(ctx, 4, this.loopExtra);
    const fb = dl.fb;
    input.connect(output);
    input.connect(sendG).connect(tone).connect(dl.input);
    dl.output.connect(output);
    const send = new Lane(sendG.gain, 0);
    let time = 0.5;
    let feed = 0;
    return {
      input, output,
      set(x, y, t, first) {
        time = Math.min(4, stepAt(ECHO_STEPS, x).beats * pad.spb());
        feed = y * 0.85;
        if (first) { dl.setTime(time); fb.gain.value = feed; send.ramp(1, t, XF); }
        dl.setTime(time, t, 0.03);
        target(fb.gain, feed, t, 0.03);
      },
      // Eingang zu, die Wiederholungen klingen aus; übergeben, wenn sie unter −60 dB sind
      release(t) {
        send.ramp(0, t, 0.02);
        const f = Math.min(feed, 0.5);
        target(fb.gain, f, t, 0.05);
        const repeats = f > 0.01 ? Math.ceil(Math.log(0.001) / Math.log(f)) : 1;
        return t + Math.min(8, (repeats + 1) * time);
      },
    };
  }

  // Beat-Repeat: auf der nächsten Rastergrenze ein Stück der Länge L festhalten und wiederholen (Verzögerung mit
  // Rückkopplung). Kanten des Stücks überlappen um EDGE mit linearen Rampen – auch der Übergang vom Live-Signal.
  _stutter() {
    const ctx = this.ctx;
    const pad = this;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryG = ctx.createGain();
    input.connect(dryG).connect(output);
    const dry = new Lane(dryG.gain, 1);
    let voices = [];
    let beats = 0;
    let feed = 1;
    const capture = (L, t) => {
      const tb = pad.nextGrid(t + 0.004, L);
      const len = L * pad.spb();
      const sendG = ctx.createGain();
      const dl = feedbackDelay(ctx, Math.max(1, len), pad.loopExtra);
      dl.setTime(len);
      const fb = dl.fb;
      fb.gain.value = feed;
      const voutG = ctx.createGain();
      input.connect(sendG).connect(dl.input);
      dl.output.connect(voutG).connect(output);
      const send = new Lane(sendG.gain, 0);
      send.ramp(1, tb, EDGE);
      send.ramp(0, tb + len, EDGE);
      const vout = new Lane(voutG.gain, 1);
      const v = { tb, len, fb, vout, sendG, voutG };
      // Erste Wiederholung: Live-Signal bzw. vorige Wiederholung blenden genau dort aus
      const first = tb + len;
      dry.ramp(0, first, EDGE);
      for (const o of voices) o.vout.ramp(0, first, EDGE);
      voices.push(v);
      return v;
    };
    return {
      input, output,
      set(x, y, t, first) {
        feed = 0.5 + 0.5 * y;
        for (const v of voices) target(v.fb.gain, feed, t, 0.02);
        const L = stepAt(STUTTER_STEPS, x).beats;
        if (first || L !== beats) { beats = L; capture(L, t); }
      },
      release(t) {
        dry.ramp(1, t, 0.015);
        for (const v of voices) v.vout.ramp(0, t, 0.015);
        return t + 0.03;
      },
      dispose() { for (const v of voices) { v.voutG.disconnect(); try { input.disconnect(v.sendG); } catch { /* weg */ } } },
    };
  }

  _crush() {
    const ctx = this.ctx;
    let node = null;
    if (this.worklets) {
      try { node = new AudioWorkletNode(ctx, 'loopwerk-crush', { outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' }); } catch { node = null; }
    }
    if (node) {
      const bits = node.parameters.get('bits');
      const hold = node.parameters.get('hold');
      return {
        input: node, output: node,
        set(x, y, t, first) {
          if (first) { bits.value = padBits(x); hold.value = padHold(y); }
          target(bits, padBits(x), t, 0.02);
          target(hold, padHold(y), t, 0.02);
        },
        release(t) { return t; },
      };
    }
    // Ohne Worklet: nur Bit-Reduktion über eine Kennlinie
    const shaper = ctx.createWaveShaper();
    const curve = (b) => { const n = 4096; const c = new Float32Array(n); const lv = Math.pow(2, b - 1); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * lv) / lv; } return c; };
    return {
      input: shaper, output: shaper,
      set(x) { shaper.curve = curve(Math.round(padBits(x))); },
      release(t) { return t; },
    };
  }
}
