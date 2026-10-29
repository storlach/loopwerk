// AudioWorklet für Aufnahmen: sammelt den Eingang in Blöcken zu 4096 Frames und überträgt sie an den Hauptthread.
// Speicher wird nur pro Block (≈ 93 ms) angelegt, nicht pro process()-Aufruf, und per Transfer ohne Kopie übergeben.

const CHUNK = 4096;

class LoopwerkRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.fill = 0;
    this.startFrame = 0;
    this.l = new Float32Array(CHUNK);
    this.r = new Float32Array(CHUNK);
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.flush(); this.active = false; this.port.postMessage({ done: true }); } };
  }

  flush() {
    if (!this.fill) return;
    const l = this.l.subarray(0, this.fill).slice();
    const r = this.r.subarray(0, this.fill).slice();
    this.port.postMessage({ frame: this.startFrame, l, r }, [l.buffer, r.buffer]);
    this.fill = 0;
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    if (!input || !input.length) return true;
    const a = input[0];
    const b = input[1] || input[0];
    for (let i = 0; i < a.length; i++) {
      if (this.fill === 0) this.startFrame = currentFrame + i;
      this.l[this.fill] = a[i];
      this.r[this.fill] = b[i];
      if (++this.fill === CHUNK) {
        this.port.postMessage({ frame: this.startFrame, l: this.l, r: this.r }, [this.l.buffer, this.r.buffer]);
        this.l = new Float32Array(CHUNK);
        this.r = new Float32Array(CHUNK);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor('loopwerk-recorder', LoopwerkRecorder);
