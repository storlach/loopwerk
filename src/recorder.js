// Aufnahme über das Mikrofon: ein Takt Vorzähler, dann läuft der Song ab der Abspielmarke mit.
// Beim Stopp wird die Aufnahme um die Latenz korrigiert, als eigener Sound gespeichert und als Clip eingesetzt.

import { Emitter } from './util.js';
import { channelsToBuffer } from './own-sounds.js';
import { cleanTake, features, classify, describe, mixMono } from './dsp/clean.js';

// Modus „sound“ (Krachwerk): ohne Vorzähler und ohne Song-Mitlauf; endet von selbst nach 1,2 s Stille nach dem Klang
const SOUND_SILENCE = 1.2, SOUND_MAX = 10, SOUND_WAIT = 8;

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
    engine.on((what) => { if (what === 'state' && !engine.playing && this.state === 'recording' && this.mode === 'song') this.finish(); });
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
  }

  // mode: 'song' (Loopwerk: Vorzähler, Song läuft mit, Clip an der Marke) oder 'sound' (Krachwerk, s. o.)
  // silence / maxSeconds: Stille nach dem Klang bzw. längste Aufnahme (Klatsch dein Kit: 2 s / 10 s); tag: Kennung für die Ablage
  async start({ trackId, startBeat, mode = 'song', silence = null, maxSeconds = null, tag = null }) {
    if (this.state !== 'idle') return;
    this.mode = mode;
    this.tag = tag;
    this.silenceSec = silence ?? SOUND_SILENCE;
    this.maxSec = maxSeconds ?? SOUND_MAX;
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
    const auto = { heard: false, loudest: 0, quiet: 0, total: 0 };
    this.node.port.onmessage = (e) => {
      if (e.data.done) { this._done?.(); return; }
      this.chunks.push(e.data);
      if (this.mode !== 'sound' || this.state !== 'recording') return;
      // Reaktion auf Daten (Pegel je Block), kein Timing: Stille nach dem Klang beendet die Aufnahme
      const c = e.data;
      let p = 0;
      for (let i = 0; i < c.l.length; i++) { const v = Math.abs(c.l[i]); if (v > p) p = v; }
      const dt = c.l.length / ctx.sampleRate;
      auto.total += dt;
      auto.loudest = Math.max(auto.loudest, p);
      if (p > 0.03) auto.heard = true;
      auto.quiet = auto.heard && p < Math.max(0.012, auto.loudest * 0.06) ? auto.quiet + dt : 0;
      this.emit('level', p);
      if ((auto.heard && auto.quiet >= this.silenceSec) || auto.total >= this.maxSec || (!auto.heard && auto.total >= SOUND_WAIT)) this.finish();
    };
    // Latenz: Ausgabe (bis der Klick zu hören ist) plus Eingabe (bis das Mikrofon-Signal ankommt)
    const inputLatency = this.stream.getAudioTracks()[0]?.getSettings?.().latency || 0;
    this.latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + inputLatency;
    if (mode === 'song') {
      await engine.play(startBeat, { countIn: this.store.project.beatsPerBar });
      this.songStartTime = engine.anchors[0].time;
    }
    this.state = 'recording';
    this.emit('state');
  }

  stop() {
    if (this.state !== 'recording') return;
    if (this.mode === 'sound') this.finish(); else this.engine.stop();
  }

  async finish() {
    if (this.state !== 'recording') return null;
    this.state = 'saving';
    this.emit('state');
    const ctx = this.engine.ctx;
    await new Promise((resolve) => { this._done = resolve; this.node.port.postMessage('stop'); setTimeout(resolve, 500); });
    this.source.disconnect();
    this.node.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    releaseOutput(this.engine);
    try {
      if (!this.chunks.length) throw new RecorderError('empty', 'Die Aufnahme ist leer.');
      const sr = ctx.sampleRate;
      const first = this.chunks[0].frame;
      const total = this.chunks.reduce((n, c) => n + c.l.length, 0);
      const l = new Float32Array(total);
      const r = new Float32Array(total);
      let o = 0;
      for (const c of this.chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
      if (this.mode === 'sound') return this._finishSound([l, r], sr);
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

  // Krachwerk: säubern (Stille weg, Start auf dem Anschlag, Pegel), einordnen, benennen. Platzieren macht die UI.
  async _finishSound(chs, sr) {
    const t0 = performance.now();
    const c = cleanTake(chs, sr, { maxSeconds: this.maxSec ?? SOUND_MAX });
    if (!c) throw new RecorderError('silent', 'Nichts gehört – nochmal?');
    const f = features(mixMono(c.chs), sr);
    const cls = classify(f);
    const taken = this.own.library.list().filter((s) => s.category === 'own').map((s) => s.name);
    const { name, tags } = describe(f, cls, taken);
    this.cleanMs = performance.now() - t0;
    const sample = await this.own.create({ name, buffer: channelsToBuffer(c.chs, sr), source: 'Aufnahme', cls, tags, from: 'mic' });
    this.state = 'idle';
    this.emit('state');
    this.emit('recorded', { sample, clipId: null, mode: 'sound', tag: this.tag ?? null });
    return { sample, clipId: null };
  }
}

// Android schaltet die Tonausgabe bei offenem Mikrofon in den Gesprächsmodus (rauscht) und erst beim nächsten
// Öffnen der Ausgabe zurück – darum nach dem Schließen des Mikrofons die Ausgabe kurz anhalten und neu starten
async function releaseOutput(engine) {
  const ctx = engine.ctx;
  if (!ctx || ctx.state !== 'running' || engine.playing) return;
  try { await ctx.suspend(); } catch { /* egal */ }
  if (!engine.playing && ctx.state === 'suspended') await ctx.resume().catch(() => {});
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
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { clickSrc.stop(); } catch { /* schon aus */ }
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    releaseOutput(engine);
  };
  return {
    startTime: t0,
    // Abbrechen ohne Ergebnis (Fach geschlossen): Mikrofon und Klick sofort aus
    cancel: close,
    async stop() {
      try { clickSrc.stop(); } catch { /* schon aus */ }
      await new Promise((resolve) => { doneFn = resolve; node.port.postMessage('stop'); setTimeout(resolve, 500); });
      close();
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
