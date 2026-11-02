// Mikrofon der Werkstatt: öffnet nur nach einem Tipp, bleibt kurz offen (schnelle zweite Aufnahme) und schließt
// sich nach einer Pause selbst. Eine Aufnahme endet von allein, wenn nach dem Geräusch Stille kommt.

import { RecorderError } from '../recorder.js';

const IDLE_CLOSE_MS = 20000;

export class Mic {
  constructor(getCtx) {
    this.getCtx = getCtx;
    this.stream = null;
    this.source = null;
    this.idle = null;
    this.onchange = null;
    this.worklets = new WeakSet();
  }

  get open() { return !!this.stream; }

  async ensure() {
    clearTimeout(this.idle);
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
    const ctx = await this.getCtx();
    if (!this.worklets.has(ctx)) {
      await ctx.audioWorklet.addModule(new URL('../dsp/recorder-worklet.js', import.meta.url));
      this.worklets.add(ctx);
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      throw new RecorderError('denied', 'Kein Zugriff auf das Mikrofon.');
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.onchange?.(true);
  }

  close() {
    clearTimeout(this.idle);
    if (!this.stream) return;
    this.source?.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.onchange?.(false);
  }

  // Aufnahme. auto: { silence, max, wait } in Sekunden. onLevel(peak 0…1) je Block (~90 ms).
  // Rückgabe { stop(), done } – done liefert { chs, sampleRate, heard }.
  async capture({ onLevel, silence = 0.7, max = 8, wait = 6 } = {}) {
    await this.ensure();
    const ctx = await this.getCtx();
    const node = new AudioWorkletNode(ctx, 'loopwerk-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.source.connect(node).connect(sink).connect(ctx.destination);
    const chunks = [];
    let heard = false, loudest = 0, quiet = 0, total = 0, stopped = false, doneFn = null;
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    const stop = async () => {
      if (stopped) return done;
      stopped = true;
      await new Promise((r) => { doneFn = r; node.port.postMessage('stop'); setTimeout(r, 400); });
      try { this.source?.disconnect(node); } catch { /* schon getrennt */ }
      node.disconnect();
      const n = chunks.reduce((k, c) => k + c.l.length, 0);
      const l = new Float32Array(n), r = new Float32Array(n);
      let o = 0;
      for (const c of chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
      clearTimeout(this.idle);
      this.idle = setTimeout(() => this.close(), IDLE_CLOSE_MS);
      resolveDone({ chs: [l, r], sampleRate: ctx.sampleRate, heard });
      return done;
    };
    node.port.onmessage = (e) => {
      if (e.data.done) { doneFn?.(); return; }
      if (stopped) return;
      const c = e.data;
      chunks.push(c);
      let p = 0;
      for (let i = 0; i < c.l.length; i++) { const v = Math.abs(c.l[i]); if (v > p) p = v; }
      const dt = c.l.length / ctx.sampleRate;
      total += dt;
      loudest = Math.max(loudest, p);
      onLevel?.(p);
      if (p > 0.03) heard = true;
      if (heard && p < Math.max(0.012, loudest * 0.06)) quiet += dt; else quiet = 0;
      if ((heard && silence && quiet >= silence) || total >= max || (!heard && total >= wait)) stop();
    };
    return { stop, done };
  }
}
