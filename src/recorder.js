// Aufnahme über das Mikrofon: ein Takt Vorzähler, dann läuft der Song ab der Abspielmarke mit.
// Beim Stopp wird die Aufnahme um die Latenz korrigiert, als eigener Sound gespeichert und als Clip eingesetzt.

import { Emitter } from './util.js';
import { channelsToBuffer } from './own-sounds.js';

export class RecorderError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class Recorder extends Emitter {
  constructor({ engine, store, own }) {
    super();
    this.engine = engine;
    this.store = store;
    this.own = own;
    this.state = 'idle'; // idle | arming | recording | saving
    this.workletLoaded = false;
    engine.on((what) => { if (what === 'state' && !engine.playing && this.state === 'recording') this.finish(); });
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
  }

  async start({ trackId, startBeat }) {
    if (this.state !== 'idle') return;
    if (!this.supported) throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
    this.state = 'arming';
    this.emit('state');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      this.state = 'idle';
      this.emit('state');
      throw new RecorderError('denied', 'Kein Zugriff auf das Mikrofon.');
    }
    const engine = this.engine;
    await engine._ensure();
    const ctx = engine.ctx;
    if (!this.workletLoaded) {
      await ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
      this.workletLoaded = true;
    }
    this.chunks = [];
    this.trackId = trackId;
    this.startBeat = startBeat;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'loopwerk-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node).connect(this.sink).connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      if (e.data.done) { this._done?.(); return; }
      this.chunks.push(e.data);
    };
    // Latenz: Ausgabe (bis der Klick zu hören ist) plus Eingabe (bis das Mikrofon-Signal ankommt)
    const inputLatency = this.stream.getAudioTracks()[0]?.getSettings?.().latency || 0;
    this.latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + inputLatency;
    await engine.play(startBeat, { countIn: this.store.project.beatsPerBar });
    this.songStartTime = engine.anchors[0].time;
    this.state = 'recording';
    this.emit('state');
  }

  stop() {
    if (this.state === 'recording') this.engine.stop();
  }

  async finish() {
    this.state = 'saving';
    this.emit('state');
    const ctx = this.engine.ctx;
    await new Promise((resolve) => { this._done = resolve; this.node.port.postMessage('stop'); setTimeout(resolve, 500); });
    this.source.disconnect();
    this.node.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    try {
      if (!this.chunks.length) throw new RecorderError('empty', 'Die Aufnahme ist leer.');
      const sr = ctx.sampleRate;
      const first = this.chunks[0].frame;
      const total = this.chunks.reduce((n, c) => n + c.l.length, 0);
      const l = new Float32Array(total);
      const r = new Float32Array(total);
      let o = 0;
      for (const c of this.chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
      // Ab dem Song-Start (nach dem Vorzähler) plus Latenz behalten
      const from = Math.max(0, Math.round((this.songStartTime + this.latency) * sr) - first);
      if (total - from < sr * 0.1) throw new RecorderError('short', 'Die Aufnahme ist zu kurz.');
      const buffer = channelsToBuffer([l.subarray(from), r.subarray(from)], sr);
      const n = 1 + this.store.project.tracks.reduce((k, t) => k + t.clips.filter((c) => c.sampleId.startsWith('own-')).length, 0);
      const sample = await this.own.create({ name: `Aufnahme ${n}`, buffer, source: 'Aufnahme' });
      const clipId = this.store.addClip(this.trackId, sample.id, this.startBeat, sample.lengthBeats);
      this.state = 'idle';
      this.emit('state');
      this.emit('recorded', { sample, clipId });
      return { sample, clipId };
    } catch (err) {
      this.state = 'idle';
      this.emit('state');
      this.emit('error', err);
      return null;
    }
  }
}
