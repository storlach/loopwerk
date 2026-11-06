// Aufnahme über das Mikrofon: ein Takt Vorzähler, dann läuft der Song ab der Abspielmarke mit.
// Beim Stopp wird die Aufnahme um die Latenz korrigiert, als eigener Sound gespeichert und als Clip eingesetzt.

import { Emitter } from './util.js';
import { channelsToBuffer } from './own-sounds.js';
import { cleanTake, features, classify, describe, mixMono } from './dsp/clean.js';
import { clickTemplate, findClicks, summarize, CLICK } from './dsp/loopback.js';
import { effectiveLatency, deviceKey, saveLatency, loadDevice, rememberDevice, resolveInputs, INPUT_LABELS } from './rec-settings.js';

// Modus „sound“ (Krachwerk): ohne Vorzähler und ohne Song-Mitlauf; endet von selbst nach 1,2 s Stille nach dem Klang
const SOUND_SILENCE = 1.2, SOUND_MAX = 10, SOUND_WAIT = 8;
// Takes im Loop: höchstens so viele bleiben (die letzten)
const MAX_TAKES = 16;
const MIC = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

// Mikrofon öffnen (Spec 2.13 C): das gewählte Gerät (deviceId exact), bis zu 2 Kanäle. Fehlt das Gerät, das
// Standard-Mikrofon (missing = sein Name). Name und Kanäle werden je Gerät gemerkt. Ablehnung wirft wie getUserMedia.
export async function openMic() {
  const dev = loadDevice();
  const audio = { ...MIC, channelCount: { ideal: 2 } };
  let stream = null, missing = null;
  if (dev.id) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: dev.id } } });
    } catch (err) {
      if (err?.name !== 'OverconstrainedError' && err?.name !== 'NotFoundError') throw err;
      missing = dev.label || 'Das gewählte Gerät';
    }
  }
  stream ??= await navigator.mediaDevices.getUserMedia({ audio });
  const track = stream.getAudioTracks()[0];
  const cc = track?.getSettings?.().channelCount;
  // Unbekannt (manche Browser melden es nicht) zählt als 2: dann wie bisher beide Kanäle
  const channels = cc === 1 ? 1 : 2;
  const chosen = missing ? '' : dev.id;
  rememberDevice(chosen, { label: (track?.label || '').trim(), channels: cc || null });
  return { stream, missing, channels, chosen };
}

// Kanäle eines Ziels aus dem Mitschnitt: 'L' → [l], 'R' → [r], 'LR' → [l, r]; ein 1-Kanal-Gerät immer [l]
export function pickChannels(l, r, input, channels) {
  if (channels === 1 || input === 'L') return [l];
  if (input === 'R') return [r];
  return [l, r];
}

export const CAL_MESSAGES = {
  silent: 'Kein Klick gehört – Lautsprecher lauter, Kopfhörer ab (oder ans Mikrofon halten), nochmal.',
  unsteady: 'Unruhig gemessen – leiser Raum, nochmal.',
  denied: 'Kein Zugriff auf das Mikrofon.',
  unavailable: 'Aufnahmen gehen in dieser Ansicht nicht.',
};

// Durchgänge einer Loop-Aufnahme (Spec 2.13 B): anchors = [Song-Start, …Loop-Sprünge] in Kontextzeit.
// from_k = round((anchor_k.time + latency) · sr) − first, jede Länge genau `frames`; ein Rest unter minFrames entfällt,
// ein längerer wird beim Ausschneiden mit Stille aufgefüllt (complete: false)
export function splitPasses({ total, first, sr, anchors, latency, frames, minFrames }) {
  const out = [];
  for (const a of anchors) {
    const from = Math.round((a.time + latency) * sr) - first;
    const avail = total - from;
    if (avail <= 0) break;
    const complete = avail >= frames;
    if (!complete && avail < minFrames) continue;
    out.push({ from, to: from + frames, complete });
  }
  return out;
}

// Ausschnitt [from, to) eines Kanals, außerhalb der Aufnahme Stille
export function cutPass(ch, { from, to }) {
  const out = new Float32Array(to - from);
  const a = Math.max(0, from);
  const b = Math.min(ch.length, to);
  if (b > a) out.set(ch.subarray(a, b), a - from);
  return out;
}

// Mitschnitt-Blöcke des Worklets zu zwei Kanälen
function joinChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.l.length, 0);
  const l = new Float32Array(total);
  const r = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { l.set(c.l, o); r.set(c.r, o); o += c.l.length; }
  return { l, r, total, first: chunks[0]?.frame ?? 0 };
}

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
    this.calibrating = false;
    engine.on((what, payload) => {
      if (what === 'wrap' && this.loopRec) this.loopRec.wraps.push(payload);
      if (what === 'state' && !engine.playing && this.state === 'recording' && this.mode === 'song') this.finish();
    });
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
  }

  // mode: 'song' (Loopwerk: Vorzähler, Song läuft mit, Clip an der Marke) oder 'sound' (Krachwerk, s. o.)
  // Loop an (nur Modus „song“): die Aufnahme beginnt am Loop-Anfang, jeder Durchgang wird ein Take
  // targets = [{ trackId, input }] (Mehrspur, 2.13 C; input fehlt = Auto); { trackId } ist die Kurzform für ein Ziel
  async start({ targets, trackId, startBeat, mode = 'song' }) {
    if (this.state !== 'idle' || this.calibrating) return;
    this.mode = mode;
    if (!this.supported) throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
    this.state = 'arming';
    this.emit('state');
    let mic;
    try {
      mic = await openMic();
    } catch (err) {
      this.state = 'idle';
      this.emit('state');
      throw new RecorderError('denied', 'Kein Zugriff auf das Mikrofon.');
    }
    this.stream = mic.stream;
    this.channels = mic.channels;
    this.missingDevice = mic.missing;
    this.targets = resolveInputs(targets?.length ? targets : [{ trackId, input: null }], mic.channels);
    this.emit('device', mic);
    const engine = this.engine;
    try {
      await engine._ensure();
      if (!this.workletLoaded) {
        await engine.ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
        this.workletLoaded = true;
      }
    } catch (err) {
      // Mikrofon sofort wieder zu, Ausgabe zurücksetzen
      this.stream.getTracks().forEach((t) => t.stop());
      releaseOutput(engine);
      this.state = 'idle';
      this.emit('state');
      throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
    }
    const ctx = engine.ctx;
    const loop = this.store.project.loop;
    this.loopRec = null;
    if (mode === 'song' && loop.on && loop.endBeat > loop.startBeat) {
      startBeat = loop.startBeat;
      const beats = loop.endBeat - loop.startBeat;
      const bar = this.store.project.beatsPerBar * engine.spb * ctx.sampleRate;
      this.loopRec = { startBeat, beats, frames: Math.round(beats * engine.spb * ctx.sampleRate), bar: Math.round(bar), wraps: [] };
      // Loop und Tempo bleiben während der Aufnahme fest
      this.store.lock = () => this.emit('locked');
    }
    this.chunks = [];
    this.trackId = this.targets[0].trackId;
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
      if ((auto.heard && auto.quiet >= SOUND_SILENCE) || auto.total >= SOUND_MAX || (!auto.heard && auto.total >= SOUND_WAIT)) this.finish();
    };
    try {
      // Latenz: gemessener (oder geschätzter) Rundweg + Handkorrektur; der Song kommt zusätzlich um die Summe verzögert an
      const eff = await effectiveLatency(ctx, this.stream, { song: mode === 'song' ? engine.playbackDelay() : 0 });
      this.latency = eff.seconds;
      this.latencyInfo = eff;
      if (mode === 'song') {
        await engine.play(startBeat, { countIn: this.store.project.beatsPerBar });
        this.songStartTime = engine.anchors[0].time;
      }
    } catch (err) {
      // Mikrofon zu, auch wenn der Start scheitert
      this.loopRec = null;
      this.store.lock = null;
      this.source.disconnect();
      this.node.disconnect();
      this.stream.getTracks().forEach((t) => t.stop());
      releaseOutput(engine);
      this.state = 'idle';
      this.emit('state');
      throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
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
    const stopTime = ctx.currentTime; // ab hier spielt der Song nicht mehr
    const loopRec = this.loopRec;
    this.loopRec = null;
    this.store.lock = null;
    await new Promise((resolve) => { this._done = resolve; this.node.port.postMessage('stop'); setTimeout(resolve, 500); });
    this.source.disconnect();
    this.node.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    releaseOutput(this.engine);
    try {
      if (!this.chunks.length) throw new RecorderError('empty', 'Die Aufnahme ist leer.');
      const sr = ctx.sampleRate;
      const { l, r, total, first } = joinChunks(this.chunks);
      if (this.mode === 'sound') return this._finishSound(pickChannels(l, r, this.targets[0].input, this.channels), sr);
      if (loopRec) return await this._finishLoop({ l, r, total, first, sr, stopTime, loopRec });
      // Ab dem Song-Start (nach dem Vorzähler) plus Latenz behalten; je Ziel ein Sound mit seinen Kanälen
      const from = Math.max(0, Math.round((this.songStartTime + this.latency) * sr) - first);
      if (total - from < sr * 0.1) throw new RecorderError('short', 'Die Aufnahme ist zu kurz.');
      const n = this._recNumber();
      const samples = [];
      for (const t of this.targets) {
        const chs = pickChannels(l.subarray(from), r.subarray(from), t.input, this.channels);
        samples.push(await this.own.create({ name: this._recName(n, t), buffer: channelsToBuffer(chs, sr), source: 'Aufnahme', from: 'mic' }));
      }
      const clipIds = this.store.addRecordings(this.targets.map((t, i) => ({ trackId: t.trackId, startBeat: this.startBeat, lengthBeats: samples[i].lengthBeats, sampleIds: [samples[i].id] })));
      this.state = 'idle';
      this.emit('state');
      this.emit('recorded', { sample: samples[0], samples, clipId: clipIds[0], clipIds, takes: 1, tracks: this.targets.length });
      return { sample: samples[0], clipId: clipIds[0], samples, clipIds };
    } catch (err) {
      this.state = 'idle';
      this.emit('state');
      this.emit('error', err);
      return null;
    }
  }

  // Nächste Nummer: eine Aufnahme auf mehreren Spuren zählt einmal („Aufnahme 3 · Links“, „Aufnahme 3 · Rechts“)
  _recNumber() {
    const clips = this.store.project.tracks.flatMap((t) => t.clips.filter((c) => c.sampleId.startsWith('own-')));
    const nums = clips.map((c) => Number(/^Aufnahme (\d+)/.exec(this.own.library.get(c.sampleId)?.name ?? '')?.[1]) || 0);
    const distinct = nums.filter((x) => !x).length + new Set(nums.filter(Boolean)).size;
    return 1 + Math.max(distinct, ...nums);
  }

  // „Aufnahme 5“; bei mehreren Spuren mit Eingang: „Aufnahme 5 · Links“
  _recName(n, target) {
    return this.targets.length > 1 ? `Aufnahme ${n} · ${INPUT_LABELS[target.input] ?? 'Mono'}` : `Aufnahme ${n}`;
  }

  // Loop-Aufnahme: je Durchgang ein Take (gleich viele Frames), ein Clip über den Loop, der letzte volle Take spielt
  async _finishLoop({ l, r, total, first, sr, stopTime, loopRec }) {
    const end = Math.min(total, Math.round((stopTime + this.latency) * sr) - first);
    const anchors = [{ time: this.songStartTime }, ...loopRec.wraps.filter((w) => w.time > this.songStartTime + 1e-6 && w.time < stopTime)];
    const passes = splitPasses({ total: end, first, sr, anchors, latency: this.latency, frames: loopRec.frames, minFrames: loopRec.bar }).slice(-MAX_TAKES);
    if (!passes.length) throw new RecorderError('short', 'Die Aufnahme ist zu kurz.');
    const n = this._recNumber();
    // Je Ziel dieselben Durchgänge (gleich viele Takes, gleich lang), nur die Kanäle unterscheiden sich
    const samples = [];
    const perTarget = [];
    for (const t of this.targets) {
      const ids = [];
      for (const [i, p] of passes.entries()) {
        const chs = pickChannels(l, r, t.input, this.channels).map((ch) => cutPass(ch, p));
        const base = this._recName(n, t);
        const name = passes.length > 1 ? `${base} · Take ${i + 1}` : base;
        const s = await this.own.create({ name, buffer: channelsToBuffer(chs, sr), source: 'Aufnahme', from: 'mic' });
        samples.push(s);
        ids.push(s.id);
      }
      perTarget.push(ids);
    }
    let take = passes.length - 1;
    while (take > 0 && !passes[take].complete) take--;
    const clipIds = this.store.addRecordings(this.targets.map((t, i) => ({ trackId: t.trackId, startBeat: loopRec.startBeat, lengthBeats: loopRec.beats, sampleIds: perTarget[i], take })));
    const sample = samples.find((s) => s.id === perTarget[0][take]);
    this.state = 'idle';
    this.emit('state');
    this.emit('recorded', { sample, samples, clipId: clipIds[0], clipIds, takes: passes.length, take, tracks: this.targets.length });
    return { sample, clipId: clipIds[0], samples, clipIds };
  }

  // Latenz einmessen (Spec 2.13 A): Song stoppt, Mikrofon auf, 6 Klicks über engine.out (an Summe und Limiter vorbei),
  // Mitschnitt über das Aufnahme-Worklet auf derselben Uhr. Ergebnis { ms } oder RecorderError. Das Mikrofon geht immer
  // wieder zu (auch bei Abbruch und Fehler), danach wird die Ausgabe zurückgesetzt (releaseOutput).
  async calibrate() {
    if (this.state !== 'idle' || this.calibrating) return null;
    if (!this.supported) throw new RecorderError('unavailable', CAL_MESSAGES.unavailable);
    const engine = this.engine;
    if (engine.playing) engine.stop();
    this.calibrating = true;
    this.emit('state');
    let stream = null, source = null, node = null, watchdog = 0;
    const clicks = [];
    const cal = { abort: null, cancelled: false };
    this._cal = cal;
    try {
      try {
        const mic = await openMic();
        stream = mic.stream;
        this.missingDevice = mic.missing;
        this.emit('device', mic);
      } catch {
        throw new RecorderError('denied', CAL_MESSAGES.denied);
      }
      if (cal.cancelled) throw new RecorderError('cancelled', '');
      await engine._ensure();
      if (engine.playing) engine.stop();
      const ctx = engine.ctx;
      if (!this.workletLoaded) {
        await ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
        this.workletLoaded = true;
      }
      if (cal.cancelled) throw new RecorderError('cancelled', '');
      const sr = ctx.sampleRate;
      const chunks = [];
      source = ctx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(ctx, 'loopwerk-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(node).connect(sink).connect(ctx.destination);
      const tpl = clickTemplate(sr);
      const buf = new AudioBuffer({ numberOfChannels: 1, length: tpl.length, sampleRate: sr });
      buf.copyToChannel(tpl, 0);
      // Nur über die Kontextuhr geplant: +0,3 s, dann alle 0,6 s
      const t0 = ctx.currentTime + CLICK.first;
      const times = Array.from({ length: CLICK.count }, (_, k) => t0 + k * CLICK.gap);
      for (const t of times) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(engine.out ?? ctx.destination);
        src.start(t);
        clicks.push(src);
      }
      const endFrame = Math.round((times[times.length - 1] + 0.5) * sr);
      await new Promise((resolve, reject) => {
        cal.abort = () => reject(new RecorderError('cancelled', ''));
        // Nur wenn keine Daten mehr kommen (Mikrofon hängt): nach 2 s aufgeben
        const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => reject(new RecorderError('silent', CAL_MESSAGES.silent)), 2000); };
        arm();
        node.port.onmessage = (e) => {
          if (e.data.done) return;
          chunks.push(e.data);
          arm();
          // Datengesteuert: fertig, sobald ein Block hinter dem letzten Klick + 0,5 s liegt
          if (e.data.frame + e.data.l.length >= endFrame) resolve();
        };
      });
      const { l, r, first } = joinChunks(chunks);
      const mono = new Float32Array(l.length);
      for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
      const offsets = findClicks(mono, sr, times.map((t) => t * sr - first), { maxLatency: 0.5 });
      const res = summarize(offsets, sr);
      this.lastCalibration = { offsets, ...res };
      if (res.error) throw new RecorderError(res.error, CAL_MESSAGES[res.error]);
      const key = await deviceKey(stream, ctx);
      const entry = saveLatency(key, { ms: Math.round(res.ms * 10) / 10, nudge: 0 });
      this.emit('latency', { key, entry });
      return { ms: res.ms, key, entry, offsets };
    } finally {
      clearTimeout(watchdog);
      for (const c of clicks) { try { c.stop(); } catch { /* schon aus */ } c.disconnect(); }
      if (node) { node.port.onmessage = null; node.port.postMessage('stop'); node.disconnect(); }
      source?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      if (stream) releaseOutput(engine);
      if (this._cal === cal) this._cal = null;
      this.calibrating = false;
      this.emit('state');
    }
  }

  // Gerät kurz öffnen (Auswahl im Feld „Aufnahme“): Freigabe holen, Name und Kanäle lernen, sofort wieder zu
  async probe() {
    if (this.state !== 'idle' || this.calibrating || !this.supported) return null;
    let mic = null;
    try {
      mic = await openMic();
      this.missingDevice = mic.missing;
      this.emit('device', mic);
      return mic;
    } catch (err) {
      throw new RecorderError('denied', CAL_MESSAGES.denied);
    } finally {
      mic?.stream.getTracks().forEach((t) => t.stop());
      if (mic) releaseOutput(this.engine);
    }
  }

  // Einmessen abbrechen (Feld zu, Fach zu): Mikrofon sofort aus
  cancelCalibrate() {
    const cal = this._cal;
    if (!cal) return;
    cal.cancelled = true;
    cal.abort?.();
  }

  // Krachwerk: säubern (Stille weg, Start auf dem Anschlag, Pegel), einordnen, benennen. Platzieren macht die UI.
  async _finishSound(chs, sr) {
    const t0 = performance.now();
    const c = cleanTake(chs, sr, { maxSeconds: SOUND_MAX });
    if (!c) throw new RecorderError('silent', 'Nichts gehört – nochmal?');
    const f = features(mixMono(c.chs), sr);
    const cls = classify(f);
    const taken = this.own.library.list().filter((s) => s.category === 'own').map((s) => s.name);
    const { name, tags } = describe(f, cls, taken);
    this.cleanMs = performance.now() - t0;
    const sample = await this.own.create({ name, buffer: channelsToBuffer(c.chs, sr), source: 'Aufnahme', cls, tags, from: 'mic' });
    this.state = 'idle';
    this.emit('state');
    this.emit('recorded', { sample, clipId: null, mode: 'sound' });
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
    stream = (await openMic()).stream; // das gewählte Gerät, wie bei der Aufnahme
  } catch {
    throw new RecorderError('denied', 'Kein Zugriff auf das Mikrofon.');
  }
  try {
    await engine._ensure();
    engine.stop();
    if (!micWorklet.has(engine.ctx)) {
      await engine.ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
      micWorklet.add(engine.ctx);
    }
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    releaseOutput(engine);
    throw new RecorderError('unavailable', 'Aufnahmen gehen in dieser Ansicht nicht.');
  }
  const ctx = engine.ctx;
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
  // Der Klick läuft an der Summe vorbei: Rundweg (gemessen oder geschätzt) + Handkorrektur, ohne Verzögerung der Summe
  let latency = 0;
  try { latency = (await effectiveLatency(ctx, stream)).seconds; } catch { latency = 0; }
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
