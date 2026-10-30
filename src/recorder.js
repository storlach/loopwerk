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

// Einfache Mikrofon-Aufnahme mit Klick im Projekttempo (ein Takt Vorzähler), z. B. zum Einsingen einer Melodie.
// Gibt die Aufnahme ab dem ersten Schlag nach dem Vorzähler zurück, um die Latenz korrigiert.
let micWorklet = new WeakSet();
export async function startMicCapture(engine, { beatsPerBar = 4 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    throw new RecorderError('denied', 'Kein Zugriff auf das Mikrofon.');
  }
  await engine._ensure();
  engine.stop();
  const ctx = engine.ctx;
  if (!micWorklet.has(ctx)) {
    await ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
    micWorklet.add(ctx);
  }
  const chunks = [];
  let doneFn = null;
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'loopwerk-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(node).connect(sink).connect(ctx.destination);
  node.port.onmessage = (e) => { if (e.data.done) doneFn?.(); else chunks.push(e.data); };
  // Klick als Schleife (ein Takt), der erste Takt ist Vorzähler
  const spb = engine.spb;
  const bar = beatsPerBar * spb;
  const click = new AudioBuffer({ numberOfChannels: 1, length: Math.round(bar * ctx.sampleRate), sampleRate: ctx.sampleRate });
  const cd = click.getChannelData(0);
  for (let b = 0; b < beatsPerBar; b++) {
    const f = b === 0 ? 1760 : 1175;
    const at = Math.round(b * spb * ctx.sampleRate);
    for (let i = 0; i < 0.03 * ctx.sampleRate && at + i < cd.length; i++) cd[at + i] = 0.16 * Math.sign(Math.sin((2 * Math.PI * f * i) / ctx.sampleRate)) * Math.exp(-i / (0.008 * ctx.sampleRate));
  }
  const clickSrc = ctx.createBufferSource();
  clickSrc.buffer = click;
  clickSrc.loop = true;
  clickSrc.connect(engine.out ?? ctx.destination);
  const t0 = ctx.currentTime + 0.1 + bar;
  clickSrc.start(t0 - bar);
  const inputLatency = stream.getAudioTracks()[0]?.getSettings?.().latency || 0;
  const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + inputLatency;
  return {
    startTime: t0,
    async stop() {
      try { clickSrc.stop(); } catch { /* schon aus */ }
      await new Promise((resolve) => { doneFn = resolve; node.port.postMessage('stop'); setTimeout(resolve, 500); });
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      if (!chunks.length) throw new RecorderError('empty', 'Die Aufnahme ist leer.');
      const sr = ctx.sampleRate;
      const first = chunks[0].frame;
      const total = chunks.reduce((n, c) => n + c.l.length, 0);
      const l = new Float32Array(total);
      const r = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
      const from = Math.max(0, Math.round((t0 + latency) * sr) - first);
      if (total - from < sr * 0.3) throw new RecorderError('short', 'Die Aufnahme ist zu kurz.');
      return { chs: [l.slice(from), r.slice(from)], sampleRate: sr };
    },
  };
}

// Ton aus einem anderen Tab (oder Fenster) aufnehmen – z. B. ein Video, das sich nicht herunterladen lässt.
// Geht in Chrome und Edge am Computer: im Teilen-Dialog einen Tab wählen und „Tab-Audio teilen“ anhaken.
// Stille am Anfang und Ende wird abgeschnitten.
export async function startTabCapture(engine) {
  if (!navigator.mediaDevices?.getDisplayMedia || !window.AudioWorkletNode) {
    throw new RecorderError('unavailable', 'Ton aus einem Tab aufnehmen geht hier nicht – am Computer in Chrome oder Edge klappt es.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include', selfBrowserSurface: 'exclude', preferCurrentTab: false,
    });
  } catch {
    throw new RecorderError('denied', 'Kein Tab freigegeben.');
  }
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new RecorderError('noaudio', 'Kein Ton freigegeben – wähle einen Tab und hake „Tab-Audio teilen“ an.');
  }
  stream.getVideoTracks().forEach((t) => t.stop()); // nur der Ton zählt
  await engine._ensure();
  const ctx = engine.ctx;
  if (!micWorklet.has(ctx)) {
    await ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
    micWorklet.add(ctx);
  }
  const chunks = [];
  let doneFn = null;
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'loopwerk-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(node).connect(sink).connect(ctx.destination);
  node.port.onmessage = (e) => { if (e.data.done) doneFn?.(); else chunks.push(e.data); };
  let ended = null;
  const endedPromise = new Promise((resolve) => { ended = resolve; });
  stream.getAudioTracks()[0].addEventListener('ended', () => ended());
  return {
    ended: endedPromise,
    async stop() {
      await new Promise((resolve) => { doneFn = resolve; node.port.postMessage('stop'); setTimeout(resolve, 500); });
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const total = chunks.reduce((n, c) => n + c.l.length, 0);
      const l = new Float32Array(total);
      const r = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
      // Stille an den Rändern weg (unter etwa −50 dB)
      const loud = (i) => Math.abs(l[i]) > 0.003 || Math.abs(r[i]) > 0.003;
      let a = 0;
      while (a < total && !loud(a)) a++;
      let b = total;
      while (b > a && !loud(b - 1)) b--;
      if (b - a < ctx.sampleRate * 0.3) throw new RecorderError('empty', 'Im Tab lief kein Ton – starte die Wiedergabe dort und nimm noch einmal auf.');
      return { chs: [l.slice(a, b), r.slice(a, b)], sampleRate: ctx.sampleRate };
    },
  };
}
