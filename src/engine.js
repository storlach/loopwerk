// Audio-Engine: plant Clips mit Vorlauf auf der AudioContext-Uhr ein (nicht per setTimeout),
// damit alles samplegenau im Takt bleibt. Dieselbe Signalkette dient auch dem Offline-Rendern.

import { clipSegments, clipSignature, clipEnvelope, clipGain, totalBeats, EPS } from './model.js';
import { Emitter } from './util.js';
import { buildFxChain, fxKey, updateFxParams } from './effects.js';

const LOOKAHEAD = 0.15;   // Sekunden, die der Scheduler vorausplant
const TICK_MS = 25;
const START_DELAY = 0.05;

export function trackLevel(track, anySolo) {
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

// Kanalzug: Eingang (Lautstärke/Mute/Solo) → Effektkette (austauschbar) → Überblend-Gain → Panorama → Ziel
function createStrip(ctx, dest, { pan = true } = {}) {
  const input = ctx.createGain();
  const out = pan ? ctx.createStereoPanner() : ctx.createGain();
  out.connect(dest);
  return { input, gain: input, pan: pan ? out : null, out, chain: null, xf: null };
}

// Neue Effektkette einsetzen; live wird in 30 ms von der alten auf die neue Kette überblendet.
function installChain(ctx, strip, fx, spb, live) {
  const chain = buildFxChain(ctx, fx, spb);
  const xf = ctx.createGain();
  chain.output.connect(xf).connect(strip.out);
  strip.input.connect(chain.input);
  const old = strip.chain;
  const oldXf = strip.xf;
  if (old) {
    if (live) {
      const t = ctx.currentTime;
      xf.gain.setValueAtTime(0, t);
      xf.gain.linearRampToValueAtTime(1, t + 0.03);
      oldXf.gain.setValueAtTime(oldXf.gain.value, t);
      oldXf.gain.linearRampToValueAtTime(0, t + 0.03);
      setTimeout(() => { try { strip.input.disconnect(old.input); } catch { /* schon getrennt */ } oldXf.disconnect(); }, 120);
    } else {
      strip.input.disconnect(old.input);
      oldXf.disconnect();
    }
  }
  strip.chain = chain;
  strip.xf = xf;
}

function syncStrip(ctx, strip, level, panValue, fx, spb, live) {
  const t = live ? ctx.currentTime : null;
  if (live) strip.gain.gain.setTargetAtTime(level, t, 0.012); else strip.gain.gain.value = level;
  if (strip.pan) { if (live) strip.pan.pan.setTargetAtTime(panValue, t, 0.012); else strip.pan.pan.value = panValue; }
  if (!strip.chain || strip.chain.key !== fxKey(fx || {})) installChain(ctx, strip, fx, spb, live);
  else updateFxParams(strip.chain, fx, t, spb);
}

export const masterOf = (project) => ({ volume: 0.85, fx: null, ...(project.master || {}) });

export function buildMix(ctx, project, { limiter = true } = {}) {
  const post = ctx.createGain();
  let output = post;
  if (limiter) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 4;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    post.connect(comp);
    output = comp;
  }
  output.connect(ctx.destination);
  const masterStrip = createStrip(ctx, post, { pan: false });
  const mix = { master: masterStrip.input, masterStrip, output, tracks: new Map() };
  syncMix(ctx, project, mix, 60 / project.bpm, false);
  return mix;
}

// Bringt Pegel, Panorama und Effekte aller Kanäle auf den Stand des Projekts.
export function syncMix(ctx, project, mix, spb, live = true) {
  const anySolo = project.tracks.some((t) => t.solo);
  const ids = new Set(project.tracks.map((t) => t.id));
  for (const [id, strip] of mix.tracks) {
    if (!ids.has(id)) { strip.out.disconnect(); mix.tracks.delete(id); }
  }
  for (const track of project.tracks) {
    let strip = mix.tracks.get(track.id);
    if (!strip) {
      strip = createStrip(ctx, mix.master);
      mix.tracks.set(track.id, strip);
      mix.onStrip?.(track.id, strip);
    }
    syncStrip(ctx, strip, trackLevel(track, anySolo), track.pan || 0, track.fx, spb, live && strip.chain != null);
  }
  const m = masterOf(project);
  syncStrip(ctx, mix.masterStrip, m.volume, 0, m.fx, spb, live && mix.masterStrip.chain != null);
}

// Stützpunkte der Clip-Hüllkurve (Lautstärke, Fades) für den Ausschnitt [fromBeat, toBeat],
// als [Kontextzeit, Wert]. null, wenn der Clip unverändert laut ist.
export function envelopePoints(clip, fromBeat, toBeat, when, spb) {
  const fi = clip.fadeInBeats || 0;
  const fo = clip.fadeOutBeats || 0;
  if (!fi && !fo && clipGain(clip) === 1) return null;
  const x0 = fromBeat - clip.startBeat;
  const x1 = toBeat - clip.startBeat;
  const xs = [x0];
  for (const k of [fi, clip.lengthBeats - fo]) if (k > x0 + EPS && k < x1 - EPS) xs.push(k);
  xs.push(x1);
  xs.sort((a, b) => a - b);
  return xs.map((x) => [when + (x - x0) * spb, clipEnvelope(clip, x)]);
}

// Spielt ein Stück eines Samples. An Schnittkanten (Einstieg mitten im Sample, Abschneiden vor dem Ende)
// überlappen sich benachbarte Stimmen um ±XF mit linearen Rampen. Ist der Inhalt durchgehend (z. B. ein
// geteilter Clip), ergänzen sich beide Rampen zu exakt 1 – das Teilen bleibt unhörbar.
// `env` formt die Clip-Lautstärke (Gain, Fades).
export function startVoice(ctx, dest, buffer, when, offset, stopAt, env = null) {
  const XF = 96 / ctx.sampleRate;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  src.connect(g);
  if (env) {
    const e = ctx.createGain();
    e.gain.value = env[0][1];
    e.gain.setValueAtTime(env[0][1], env[0][0]);
    for (const [t, v] of env.slice(1)) e.gain.linearRampToValueAtTime(v, t);
    g.connect(e).connect(dest);
  } else {
    g.connect(dest);
  }
  const naturalEnd = when + buffer.duration - offset;
  const cut = stopAt < naturalEnd - 1e-4;
  let start = when;
  if (offset > 1e-6) {
    const now = ctx instanceof OfflineAudioContext ? 0 : ctx.currentTime;
    const pre = Math.max(0, Math.min(XF, offset, when - now));
    start = when - pre;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, when + XF);
  }
  if (cut) {
    g.gain.setValueAtTime(1, Math.max(start + 1e-4, when + (offset > 1e-6 ? XF : 0), stopAt - XF));
    g.gain.linearRampToValueAtTime(0, stopAt + XF);
  }
  src.start(start, offset - (when - start));
  if (cut) src.stop(stopAt + XF + 0.001);
  return { src, g };
}

// Spielt einen Clip-Ausschnitt [fromBeat, toBeat] eines Segments ab Kontextzeit `when`.
function playSegment(ctx, dest, clip, sample, seg, fromBeat, toBeat, when, spb) {
  const offset = (fromBeat - seg.start + seg.offset) * spb;
  const stopAt = when + (toBeat - fromBeat) * spb;
  return startVoice(ctx, dest, sample.buffer, when, offset, stopAt, envelopePoints(clip, fromBeat, toBeat, when, spb));
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
      if (!sample?.buffer) continue;
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (seg.start >= end - EPS) continue;
        playSegment(ctx, dest, clip, sample, seg, seg.start, Math.min(seg.end, end), seg.start * spb, spb);
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
      // Pegelmesser je Kanal für den Mixer
      this.meters = new Map();
      const tapStrip = (id, strip) => {
        const a = this.ctx.createAnalyser();
        a.fftSize = 512;
        strip.out.connect(a);
        this.meters.set(id, { analyser: a, data: new Float32Array(a.fftSize) });
      };
      this.mix.onStrip = tapStrip;
      for (const [id, strip] of this.mix.tracks) tapStrip(id, strip);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.mix.output.connect(this.analyser);
      this.meterData = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  // ---------- Transport ----------

  // countIn: Vorzähler in Schlägen (Metronom-Klicks vor dem eigentlichen Start, z. B. für Aufnahmen)
  async play(fromBeat = this.positionBeat, { countIn = 0 } = {}) {
    await this._ensure();
    if (this.playing) this._halt();
    const pre = this.ctx.currentTime + START_DELAY;
    if (countIn > 0) this._metronome(0, countIn, pre, true);
    const t0 = pre + countIn * this.spb;
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
        if (sample?.buffer && node) fn(track, clip, sample, node);
      }
    }
  }

  // Alle Wiederholungen, die im Bereich [b0, b1) beginnen.
  _scheduleSpan(b0, b1, t0, limit, filter) {
    const spb = this.spb;
    this._forEachClip(filter, (track, clip, sample, node) => {
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (seg.start < b0 - EPS || seg.start >= b1 - EPS || seg.start >= limit - EPS) continue;
        this._voice(track, clip, sample, node, seg, seg.start, Math.min(seg.end, limit), t0 + (seg.start - b0) * spb);
      }
    });
  }

  // Wiederholungen, die bei Schlag b bereits laufen: mitten im Sample einsteigen.
  _scheduleActiveAt(b, t, limit, filter) {
    this._forEachClip(filter, (track, clip, sample, node) => {
      for (const seg of clipSegments(clip, sample.lengthBeats)) {
        if (!(seg.start < b - EPS && seg.end > b + EPS)) continue;
        this._voice(track, clip, sample, node, seg, b, Math.min(seg.end, limit), t);
      }
    });
  }

  _voice(track, clip, sample, node, seg, fromBeat, toBeat, when) {
    if (toBeat - fromBeat <= 1e-4) return;
    const { src, g } = playSegment(this.ctx, node.input, clip, sample, seg, fromBeat, toBeat, when, this.spb);
    const voice = { clipId: clip.id, sig: this._sig(track, clip), src, g };
    this.voices.add(voice);
    src.onended = () => this.voices.delete(voice);
  }

  _kill(v, t = this.ctx.currentTime) {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0, t + 0.01);
    try { v.src.stop(t + 0.012); } catch { /* bereits gestoppt */ }
  }

  _metronome(b0, b1, t0, countIn = false) {
    const bpb = countIn ? b1 : this.project.beatsPerBar;
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

  // Signatur enthält die Version des Sounds: wird er neu erzeugt (Tempo, Editor, Pattern), plant die Engine neu.
  _sig(track, clip) {
    return clipSignature(track.id, clip) + '|' + (this.library.get(clip.sampleId)?.rev ?? 0);
  }

  _signatures() {
    const sigs = new Map();
    for (const track of this.project.tracks) for (const clip of track.clips) sigs.set(clip.id, this._sig(track, clip));
    return sigs;
  }

  // Von außen anstoßen, wenn sich Sounds geändert haben, ohne dass sich das Projekt geändert hat.
  refresh() {
    if (this.ctx && this.playing) this._resync();
  }

  // ---------- Änderungen während der Wiedergabe ----------

  _onChange(reason) {
    if (!this.ctx) return;
    syncMix(this.ctx, this.project, this.mix, this.spb, true);
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

  // Beliebigen Puffer vorhören (Sample-Editor). Gibt Startzeit und Dauer zurück.
  async previewBuffer(buffer, offset = 0, duration = buffer.duration - offset) {
    await this._ensure();
    this.stopPreview();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(this.mix.master);
    const when = this.ctx.currentTime + 0.02;
    src.start(when, offset, duration);
    const preview = { sampleId: null, src, g, when, offset, duration };
    src.onended = () => { if (this.preview === preview) { this.preview = null; this.emit('preview'); } };
    this.preview = preview;
    this.emit('preview');
    return preview;
  }

  stopPreview() {
    if (!this.preview) return;
    const p = this.preview;
    this.preview = null;
    this._kill(p, this.ctx.currentTime);
    this.emit('preview');
  }

  trackPeak(trackId) {
    const m = this.meters?.get(trackId);
    if (!m) return 0;
    m.analyser.getFloatTimeDomainData(m.data);
    let p = 0;
    for (const v of m.data) { const a = Math.abs(v); if (a > p) p = a; }
    return p;
  }

  peakLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.meterData);
    let m = 0;
    for (const v of this.meterData) { const a = Math.abs(v); if (a > m) m = a; }
    return m;
  }
}
