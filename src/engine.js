// Audio-Engine: plant Clips mit Vorlauf auf der AudioContext-Uhr ein (nicht per setTimeout),
// damit alles samplegenau im Takt bleibt. Dieselbe Signalkette dient auch dem Offline-Rendern.

import { clipSignature, clipEnvelope, clipGain, totalBeats, audibleMap, audibleSegments, sampleFor, trackState, anySoloOf, EPS } from './model.js';
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
function installChain(ctx, strip, fx, spb, live, grid) {
  const chain = buildFxChain(ctx, fx, spb, grid);
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

function syncStrip(ctx, strip, level, panValue, fx, spb, live, grid) {
  const t = live ? ctx.currentTime : null;
  if (live) strip.gain.gain.setTargetAtTime(level, t, 0.012); else strip.gain.gain.value = level;
  if (strip.pan) { if (live) strip.pan.pan.setTargetAtTime(panValue, t, 0.012); else strip.pan.pan.value = panValue; }
  if (!strip.chain || strip.chain.key !== fxKey(fx || {})) installChain(ctx, strip, fx, spb, live, grid);
  else updateFxParams(strip.chain, fx, t, spb, grid);
}

export const masterOf = (project) => ({ volume: 0.85, fx: null, ...(project.master || {}) });

function createLimiter(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 4;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  return comp;
}

// Der Limiter verzögert um einige Millisekunden (Vorausschau). Einmal messen, beim Export ausgleichen.
const latencyCache = new Map();
export async function limiterLatency(sampleRate) {
  if (latencyCache.has(sampleRate)) return latencyCache.get(sampleRate);
  const ctx = new OfflineAudioContext(1, 4096, sampleRate);
  const b = ctx.createBuffer(1, 1, sampleRate);
  b.getChannelData(0)[0] = 0.5;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(createLimiter(ctx)).connect(ctx.destination);
  src.start(0);
  const d = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  let at = 0;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); at = i; }
  latencyCache.set(sampleRate, at);
  return at;
}

// grid: Kontextzeit, zu der Schlag 0 des Songs läge – Bezug für taktsynchrone Effekte (Filter-LFO, Pumpen)
export function buildMix(ctx, project, { limiter = true, grid = 0, dest = ctx.destination } = {}) {
  const post = ctx.createGain();
  let output = post;
  if (limiter) {
    const comp = createLimiter(ctx);
    post.connect(comp);
    output = comp;
  }
  output.connect(dest);
  const masterStrip = createStrip(ctx, post, { pan: false });
  const mix = { master: masterStrip.input, masterStrip, output, tracks: new Map(), grid };
  syncMix(ctx, project, mix, 60 / project.bpm, false);
  return mix;
}

// Bringt Pegel, Panorama und Effekte aller Kanäle auf den Stand des Projekts.
export function syncMix(ctx, project, mix, spb, live = true) {
  const anySolo = anySoloOf(project);
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
    syncStrip(ctx, strip, trackLevel({ ...track, ...trackState(project, track) }, anySolo), track.pan || 0, track.fx, spb, live && strip.chain != null, mix.grid);
  }
  const m = masterOf(project);
  syncStrip(ctx, mix.masterStrip, m.volume, 0, m.fx, spb, live && mix.masterStrip.chain != null, mix.grid);
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

// Rendert das Projekt offline (Tests, Export). Bereich [fromBeat, toBeat] plus Ausklang in Sekunden;
// onProgress(0…1) wird etwa alle 2 s Audio gemeldet.
// compensate: Limiter-Verzögerung herausrechnen (für Export, damit Loops exakt am Dateianfang beginnen).
export async function renderProject(project, library, { sampleRate = 44100, limiter = true, fromBeat = 0, toBeat, tailSeconds = 0, onProgress, compensate = false } = {}) {
  const spb = 60 / project.bpm;
  const end = toBeat ?? totalBeats(project);
  const duration = (end - fromBeat) * spb + tailSeconds;
  const frames = Math.max(1, Math.ceil(duration * sampleRate));
  const lat = limiter && compensate ? await limiterLatency(sampleRate) : 0;
  const ctx = new OfflineAudioContext(2, frames + lat, sampleRate);
  const mix = buildMix(ctx, project, { limiter, grid: -fromBeat * spb });
  const audible = audibleMap(project);
  for (const track of project.tracks) {
    const dest = mix.tracks.get(track.id).input;
    for (const clip of track.clips) {
      const sample = sampleFor(library, clip);
      if (!sample?.buffer) continue;
      for (const { seg, from, to } of audibleSegments(clip, sample.lengthBeats, audible.get(clip.id))) {
        if (from >= end - EPS || to <= fromBeat + EPS) continue;
        const f = Math.max(from, fromBeat);
        playSegment(ctx, dest, clip, sample, seg, f, Math.min(to, end), (f - fromBeat) * spb, spb);
      }
    }
  }
  if (onProgress) {
    for (let t = 2; t < duration; t += 2) {
      ctx.suspend(t).then(() => { onProgress(t / duration); ctx.resume(); });
    }
  }
  let out = await ctx.startRendering();
  if (lat) {
    const trimmed = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate });
    for (let c = 0; c < 2; c++) trimmed.copyToChannel(out.getChannelData(c).subarray(lat, lat + frames), c);
    out = trimmed;
  }
  onProgress?.(1);
  return out;
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
      // Gemeinsamer Ausgang für alles Hörbare (Song, Vorhören, Pads, Klick) – dort misst die Bildmarke den Pegel
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      this.outAnalyser = this.ctx.createAnalyser();
      this.outAnalyser.fftSize = 2048;
      this.outAnalyser.smoothingTimeConstant = 0.55;
      this.outAnalyser.minDecibels = -78;
      this.outAnalyser.maxDecibels = -18;
      this.out.connect(this.outAnalyser);
      this.mix = buildMix(this.ctx, this.project, { limiter: true, dest: this.out });
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
    // Taktsynchrone Effekte auf den neuen Start ausrichten
    this.mix.grid = t0 - fromBeat * this.spb;
    syncMix(this.ctx, this.project, this.mix, this.spb, true);
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

  // Pause: anhalten und an derselben Stelle stehen bleiben (Start spielt dort weiter)
  pause() {
    if (!this.playing) return;
    const beat = this.heardBeat();
    this._halt();
    this.positionBeat = beat;
    this.emit('state');
  }

  setPosition(beat) {
    if (this.playing) this.play(beat);
    else { this.positionBeat = beat; this.emit('state'); }
  }

  // Songposition zu einer Kontextzeit (Standard: jetzt, also die Planungszeit)
  currentBeat(at = this.ctx?.currentTime) {
    if (!this.playing || !this.ctx || !this.anchors.length) return this.positionBeat;
    let a = this.anchors[0];
    for (const x of this.anchors) if (x.time <= at) a = x;
    return Math.max(a.beat, a.beat + (at - a.time) / this.spb);
  }

  // Kontextzeit, die gerade aus dem Lautsprecher kommt. Die Uhr läuft der Ausgabe um die Ausgabelatenz voraus
  // (Bluetooth und Handys oft 100–250 ms). getOutputTimestamp liefert das genau und gleichmäßig je Bild;
  // sonst Latenz abziehen.
  heardTime() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    let t = now - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      const est = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      // Plausibel halten: nie vor der Planungszeit, nie mehr als 1 s dahinter
      if (est <= now + 0.005 && est > now - 1) t = est;
    }
    return Math.min(now, t);
  }

  // Songposition, die man gerade hört – für Abspielmarke, Anzeige und alles Sichtbare
  heardBeat() {
    if (!this.playing || !this.ctx) return this.positionBeat;
    return this.currentBeat(this.heardTime());
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
    // Anker eine Weile behalten: die hörbare Position (heardBeat) liegt um die Ausgabelatenz zurück
    while (this.anchors.length > 1 && this.anchors[1].time <= now - 1) this.anchors.shift();
    if (this.currentBeat() >= songEnd - EPS) this.stop();
  }

  // ---------- Einplanen ----------

  // Hörbare Bereiche aller Clips (übereinanderliegende Clips: nur der obere klingt); gilt bis zur nächsten Änderung
  _audible() {
    if (!this._aud || this._audFor !== this.project) { this._aud = audibleMap(this.project); this._audFor = this.project; }
    return this._aud;
  }

  _forEachClip(filter, fn) {
    const audible = this._audible();
    for (const track of this.project.tracks) {
      const node = this.mix.tracks.get(track.id);
      for (const clip of track.clips) {
        if (filter && !filter(clip)) continue;
        const sample = sampleFor(this.library, clip);
        if (sample?.buffer && node) fn(track, clip, sample, node, audible.get(clip.id));
      }
    }
  }

  // Alle (hörbaren) Stücke, die im Bereich [b0, b1) beginnen.
  _scheduleSpan(b0, b1, t0, limit, filter) {
    const spb = this.spb;
    this._forEachClip(filter, (track, clip, sample, node, ranges) => {
      for (const { seg, from, to } of audibleSegments(clip, sample.lengthBeats, ranges)) {
        if (from < b0 - EPS || from >= b1 - EPS || from >= limit - EPS) continue;
        this._voice(track, clip, sample, node, seg, from, Math.min(to, limit), t0 + (from - b0) * spb);
      }
    });
  }

  // Stücke, die bei Schlag b bereits laufen: mitten im Sample einsteigen.
  _scheduleActiveAt(b, t, limit, filter) {
    this._forEachClip(filter, (track, clip, sample, node, ranges) => {
      for (const { seg, from, to } of audibleSegments(clip, sample.lengthBeats, ranges)) {
        if (!(from < b - EPS && to > b + EPS)) continue;
        this._voice(track, clip, sample, node, seg, b, Math.min(to, limit), t);
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
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.05);
    }
  }

  // Signatur enthält die Version des Sounds: wird er neu erzeugt (Tempo, Editor, Pattern), plant die Engine neu.
  // Auch die hörbaren Bereiche gehören dazu: wird ein Clip verdeckt oder frei, plant die Engine ihn neu.
  _sig(track, clip) {
    const ranges = this._audible().get(clip.id) ?? [];
    return clipSignature(track.id, clip) + '|' + (sampleFor(this.library, clip)?.rev ?? 0) + '|' + ranges.map((r) => r.join('-')).join(',');
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
    this._aud = null;
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
    // Sound auf Abruf: beim ersten Anhören laden bzw. erzeugen
    const sample = await this.library.ensure?.(sampleId) ?? this.library.get(sampleId);
    if (!sample?.buffer) return;
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
    const preview = { sampleId, src, g, when, duration: sample.buffer.duration };
    src.onended = () => { if (this.preview === preview) { this.preview = null; this.emit('preview'); } };
    this.preview = preview;
    this.emit('preview');
  }

  // Beliebigen Puffer vorhören (Sample-Editor). Gibt Startzeit und Dauer zurück.
  // loop: Bereich wiederholen, bis stopPreview(); at: Einstieg im Bereich (s ab offset) – zum nahtlosen Weiterspielen
  async previewBuffer(buffer, offset = 0, duration = buffer.duration - offset, { loop = false, at = 0 } = {}) {
    await this._ensure();
    this.stopPreview();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(this.mix.master);
    const when = this.ctx.currentTime + 0.02;
    if (loop) {
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = offset + duration;
      src.start(when, offset + (at % duration));
    } else src.start(when, offset, duration);
    const preview = { sampleId: null, src, g, when: when - (loop ? at % duration : 0), offset, duration, loop };
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

  // Pegel laufen über einen kurzen Verlauf, damit die Anzeige zum Gehörten passt und nicht der Ausgabe vorauseilt
  _lagged(key, measure) {
    const now = this.ctx.currentTime;
    const hist = (this.levelHist ||= new Map());
    let h = hist.get(key);
    if (!h) hist.set(key, (h = []));
    h.push([now, measure()]);
    while (h.length > 2 && h[1][0] <= now - 1.2) h.shift();
    const heard = this.heardTime();
    let v = h[0][1];
    for (const [t, x] of h) { if (t <= heard) v = x; else break; }
    return v;
  }

  trackPeak(trackId) {
    const m = this.meters?.get(trackId);
    if (!m) return 0;
    return this._lagged(trackId, () => {
      m.analyser.getFloatTimeDomainData(m.data);
      let p = 0;
      for (const v of m.data) { const a = Math.abs(v); if (a > p) p = a; }
      return p;
    });
  }

  // Pegel des gesamten Ausgangs in n Frequenzbändern (60 Hz … 12 kHz, logarithmisch), je 0…1; null ohne Ton-Kontext
  outputBands(n) {
    if (!this.outAnalyser || this.ctx.state !== 'running') return null;
    const a = this.outAnalyser;
    if (!this._fft) this._fft = new Uint8Array(a.frequencyBinCount);
    a.getByteFrequencyData(this._fft);
    const hz = this.ctx.sampleRate / 2 / this._fft.length;
    const out = [];
    for (let k = 0; k < n; k++) {
      const lo = Math.max(1, Math.floor((60 * 200 ** (k / n)) / hz));
      const hi = Math.max(lo + 1, Math.ceil((60 * 200 ** ((k + 1) / n)) / hz));
      let m = 0;
      for (let i = lo; i < hi && i < this._fft.length; i++) if (this._fft[i] > m) m = this._fft[i];
      out.push(m / 255);
    }
    return out;
  }

  peakLevel() {
    if (!this.analyser) return 0;
    return this._lagged('__master', () => {
      this.analyser.getFloatTimeDomainData(this.meterData);
      let m = 0;
      for (const v of this.meterData) { const a = Math.abs(v); if (a > m) m = a; }
      return m;
    });
  }
}
