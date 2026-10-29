// Audio-Engine: plant Clips mit Vorlauf auf der AudioContext-Uhr ein (nicht per setTimeout),
// damit alles samplegenau im Takt bleibt. Dieselbe Signalkette dient auch dem Offline-Rendern.

import { clipSegments, clipSignature, totalBeats, EPS } from './model.js';
import { Emitter } from './util.js';

const LOOKAHEAD = 0.15;   // Sekunden, die der Scheduler vorausplant
const TICK_MS = 25;
const START_DELAY = 0.05;

export function trackLevel(track, anySolo) {
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

function createTrackChain(ctx, dest) {
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  gain.connect(pan).connect(dest);
  return { input: gain, gain, pan };
}

export function buildMix(ctx, project, { limiter = true } = {}) {
  const master = ctx.createGain();
  master.gain.value = 0.85;
  let output = master;
  if (limiter) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 4;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    output = comp;
  }
  output.connect(ctx.destination);
  const mix = { master, output, tracks: new Map() };
  applyLevels(ctx, project, mix, true);
  return mix;
}

export function applyLevels(ctx, project, mix, immediate = false) {
  const anySolo = project.tracks.some((t) => t.solo);
  for (const track of project.tracks) {
    let node = mix.tracks.get(track.id);
    if (!node) {
      node = createTrackChain(ctx, mix.master);
      mix.tracks.set(track.id, node);
      immediate = true;
    }
    const level = trackLevel(track, anySolo);
    if (immediate) {
      node.gain.gain.value = level;
      node.pan.pan.value = track.pan;
    } else {
      node.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.012);
      node.pan.pan.setTargetAtTime(track.pan, ctx.currentTime, 0.012);
    }
  }
}

// Spielt ein Stück eines Samples. Kurze Rampen verhindern Knackser, wenn mitten im Sample
// begonnen oder vor seinem Ende abgeschnitten wird.
export function startVoice(ctx, dest, buffer, when, offset, stopAt) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  src.connect(g).connect(dest);
  const naturalEnd = when + buffer.duration - offset;
  const cut = stopAt < naturalEnd - 1e-4;
  if (offset > 1e-6) {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + 0.003);
  }
  if (cut) {
    g.gain.setValueAtTime(1, Math.max(when + 0.003, stopAt - 0.004));
    g.gain.linearRampToValueAtTime(0, stopAt);
  }
  src.start(when, offset);
  if (cut) src.stop(stopAt + 0.002);
  return { src, g };
}

// Rendert das Projekt komplett offline (für Tests und später für den WAV-Export).
export async function renderProject(project, library, { sampleRate = 44100, limiter = true, toBeat } = {}) {
  const spb = 60 / project.bpm;
  const end = toBeat ?? totalBeats(project);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(end * spb * sampleRate)), sampleRate);
  const mix = buildMix(ctx, project, { limiter });
  for (const track of project.tracks) {
    const dest = mix.tracks.get(track.id).input;
    for (const clip of track.clips) {
      const sample = library.get(clip.sampleId);
      if (!sample) continue;
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (seg.start >= end - EPS) continue;
        startVoice(ctx, dest, sample.buffer, seg.start * spb, seg.offset * spb, Math.min(seg.end, end) * spb);
      }
    }
  }
  return ctx.startRendering();
}

// Takt-Geber in einem Worker, damit er in Hintergrund-Tabs nicht gedrosselt wird.
function createTicker(fn) {
  let interval = null;
  let worker = null;
  let running = false;
  const fallback = () => { worker = null; if (running) { clearInterval(interval); interval = setInterval(fn, TICK_MS); } };
  try {
    const code = `let id=null;onmessage=(e)=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),${TICK_MS});};`;
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = fn;
    worker.onerror = fallback;
  } catch {
    worker = null;
  }
  return {
    start() { running = true; if (worker) worker.postMessage('start'); else fallback(); },
    stop() { running = false; worker?.postMessage('stop'); clearInterval(interval); },
  };
}

export class Engine extends Emitter {
  constructor(store, library) {
    super();
    this.store = store;
    this.library = library;
    this.ctx = null;
    this.playing = false;
    this.positionBeat = 0;
    this.startBeat = 0;
    this.metronome = false;
    this.voices = new Set();
    this.anchors = [];
    this.knownSigs = new Map();
    this.preview = null;
    this.ticker = createTicker(() => this._tick());
    store.on((project, reason) => this._onChange(reason));
  }

  get project() { return this.store.project; }
  get spb() { return 60 / this.project.bpm; }

  async _ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.mix = buildMix(this.ctx, this.project, { limiter: true });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.mix.output.connect(this.analyser);
      this.meterData = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  // ---------- Transport ----------

  async play(fromBeat = this.positionBeat) {
    await this._ensure();
    if (this.playing) this._halt();
    const t0 = this.ctx.currentTime + START_DELAY;
    this.playing = true;
    this.startBeat = fromBeat;
    this.anchors = [{ time: t0, beat: fromBeat }];
    this.cursorBeat = fromBeat;
    this.cursorTime = t0;
    this.knownSigs = this._signatures();
    this._scheduleActiveAt(fromBeat, t0, this._limitFor(fromBeat));
    this._tick();
    this.ticker.start();
    this.emit('state');
  }

  stop() {
    if (!this.playing) return;
    this._halt();
    this.positionBeat = this.startBeat;
    this.emit('state');
  }

  setPosition(beat) {
    if (this.playing) this.play(beat);
    else { this.positionBeat = beat; this.emit('state'); }
  }

  currentBeat() {
    if (!this.playing || !this.ctx) return this.positionBeat;
    const now = this.ctx.currentTime;
    let a = this.anchors[0];
    for (const x of this.anchors) if (x.time <= now) a = x;
    return Math.max(a.beat, a.beat + (now - a.time) / this.spb);
  }

  timeAtBeat(beat) {
    const now = this.ctx.currentTime;
    let a = this.anchors[0];
    for (const x of this.anchors) if (x.time <= now) a = x;
    return a.time + (beat - a.beat) * this.spb;
  }

  _halt() {
    this.ticker.stop();
    const t = this.ctx.currentTime;
    for (const v of this.voices) this._kill(v, t);
    this.voices.clear();
    this.playing = false;
    this.anchors = [];
  }

  _limitFor(beat) {
    const loop = this.project.loop;
    if (loop.on && loop.endBeat > loop.startBeat && beat < loop.endBeat - EPS) return loop.endBeat;
    return totalBeats(this.project);
  }

  _tick() {
    if (!this.playing) return;
    const spb = this.spb;
    const loop = this.project.loop;
    const songEnd = totalBeats(this.project);
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this.cursorTime < horizon && guard++ < 32) {
      const looping = loop.on && loop.endBeat > loop.startBeat && this.cursorBeat < loop.endBeat - EPS;
      const limit = looping ? loop.endBeat : songEnd;
      if (!looping && this.cursorBeat >= songEnd - EPS) break;
      const spanEndTime = Math.min(horizon, this.cursorTime + (limit - this.cursorBeat) * spb);
      const spanEndBeat = this.cursorBeat + (spanEndTime - this.cursorTime) / spb;
      this._scheduleSpan(this.cursorBeat, spanEndBeat, this.cursorTime, limit);
      if (this.metronome) this._metronome(this.cursorBeat, spanEndBeat, this.cursorTime);
      this.cursorBeat = spanEndBeat;
      this.cursorTime = spanEndTime;
      if (looping && this.cursorBeat >= limit - EPS) {
        this.cursorBeat = loop.startBeat;
        this.anchors.push({ time: this.cursorTime, beat: loop.startBeat });
        this._scheduleActiveAt(loop.startBeat, this.cursorTime, loop.endBeat);
      }
    }
    // Alte Ankerpunkte aufräumen (einer vor "jetzt" bleibt für die Positionsberechnung).
    const now = this.ctx.currentTime;
    while (this.anchors.length > 1 && this.anchors[1].time <= now) this.anchors.shift();
    if (this.currentBeat() >= songEnd - EPS) this.stop();
  }

  // ---------- Einplanen ----------

  _forEachClip(filter, fn) {
    for (const track of this.project.tracks) {
      const node = this.mix.tracks.get(track.id);
      for (const clip of track.clips) {
        if (filter && !filter(clip)) continue;
        const sample = this.library.get(clip.sampleId);
        if (sample && node) fn(track, clip, sample, node);
      }
    }
  }

  // Alle Wiederholungen, die im Bereich [b0, b1) beginnen.
  _scheduleSpan(b0, b1, t0, limit, filter) {
    const spb = this.spb;
    this._forEachClip(filter, (track, clip, sample, node) => {
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (seg.start < b0 - EPS || seg.start >= b1 - EPS || seg.start >= limit - EPS) continue;
        const end = Math.min(seg.end, limit);
        this._voice(track, clip, sample, node, t0 + (seg.start - b0) * spb, seg.offset * spb, t0 + (end - b0) * spb);
      }
    });
  }

  // Wiederholungen, die bei Schlag b bereits laufen: mitten im Sample einsteigen.
  _scheduleActiveAt(b, t, limit, filter) {
    const spb = this.spb;
    this._forEachClip(filter, (track, clip, sample, node) => {
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (!(seg.start < b - EPS && seg.end > b + EPS)) continue;
        const end = Math.min(seg.end, limit);
        this._voice(track, clip, sample, node, t, (b - seg.start + seg.offset) * spb, t + (end - b) * spb);
      }
    });
  }

  _voice(track, clip, sample, node, when, offset, stopAt) {
    if (stopAt <= when + 1e-4) return;
    const { src, g } = startVoice(this.ctx, node.input, sample.buffer, when, offset, stopAt);
    const voice = { clipId: clip.id, sig: clipSignature(track.id, clip), src, g };
    this.voices.add(voice);
    src.onended = () => this.voices.delete(voice);
  }

  _kill(v, t = this.ctx.currentTime) {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0, t + 0.01);
    try { v.src.stop(t + 0.012); } catch { /* bereits gestoppt */ }
  }

  _metronome(b0, b1, t0) {
    const bpb = this.project.beatsPerBar;
    for (let k = Math.ceil(b0 - EPS); k < b1 - EPS; k++) {
      const t = t0 + (k - b0) * this.spb;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = k % bpb === 0 ? 1760 : 1175;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.05);
    }
  }

  _signatures() {
    const sigs = new Map();
    for (const track of this.project.tracks) for (const clip of track.clips) sigs.set(clip.id, clipSignature(track.id, clip));
    return sigs;
  }

  // ---------- Änderungen während der Wiedergabe ----------

  _onChange(reason) {
    if (!this.ctx) return;
    applyLevels(this.ctx, this.project, this.mix);
    if (this.playing) this._resync();
  }

  // Nur geänderte Clips werden neu eingeplant, der Rest läuft unterbrechungsfrei weiter.
  _resync() {
    const sigs = this._signatures();
    const now = this.ctx.currentTime;
    for (const v of [...this.voices]) {
      if (sigs.get(v.clipId) !== v.sig) { this._kill(v, now); this.voices.delete(v); }
    }
    const changed = new Set();
    for (const [id, sig] of sigs) if (this.knownSigs.get(id) !== sig) changed.add(id);
    this.knownSigs = sigs;
    if (!changed.size) return;
    const filter = (clip) => changed.has(clip.id);
    const spb = this.spb;
    let t = Math.max(now + 0.02, this.anchors[0].time);
    let i = 0;
    while (i + 1 < this.anchors.length && this.anchors[i + 1].time <= t) i++;
    while (t < this.cursorTime - 1e-9) {
      const a = this.anchors[i];
      const next = this.anchors[i + 1];
      const tEnd = next ? Math.min(next.time, this.cursorTime) : this.cursorTime;
      const b0 = a.beat + (t - a.time) / spb;
      const b1 = a.beat + (tEnd - a.time) / spb;
      const limit = this._limitFor(b0);
      this._scheduleActiveAt(b0, t, limit, filter);
      this._scheduleSpan(b0, b1, t, limit, filter);
      t = tEnd;
      i++;
    }
  }

  // ---------- Vorhören und Pegel ----------

  async previewSample(sampleId) {
    await this._ensure();
    this.stopPreview();
    const sample = this.library.get(sampleId);
    if (!sample) return;
    let when = this.ctx.currentTime + 0.02;
    if (this.playing) {
      // Im laufenden Song startet die Vorschau auf der nächsten Taktgrenze.
      const bpb = this.project.beatsPerBar;
      when = Math.max(when, this.timeAtBeat(Math.ceil((this.currentBeat() + 0.05) / bpb) * bpb));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = sample.buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(this.mix.master);
    src.start(when);
    const preview = { sampleId, src, g };
    src.onended = () => { if (this.preview === preview) { this.preview = null; this.emit('preview'); } };
    this.preview = preview;
    this.emit('preview');
  }

  stopPreview() {
    if (!this.preview) return;
    const p = this.preview;
    this.preview = null;
    this._kill(p, this.ctx.currentTime);
    this.emit('preview');
  }

  peakLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.meterData);
    let m = 0;
    for (const v of this.meterData) { const a = Math.abs(v); if (a > m) m = a; }
    return m;
  }
}
