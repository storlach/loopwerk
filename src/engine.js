// Audio-Engine: plant Clips mit Vorlauf auf der AudioContext-Uhr ein (nicht per setTimeout),
// damit alles samplegenau im Takt bleibt. Dieselbe Signalkette dient auch dem Offline-Rendern.

import { clipSignature, clipEnvelope, clipGain, totalBeats, audibleMap, audibleSegments, sampleFor, trackState, anySoloOf, keyChangesOf, keySpans, harmonySpans, keyDelta, EPS } from './model.js';
import { Emitter } from './util.js';
import { FxPad, measureLoopExtra } from './fxpad.js';
import { buildFxChain, fxKey, updateFxParams } from './effects.js';
import { styleOf, masterLatency } from './dsp/master-core.js';

const LOOKAHEAD = 0.15;   // Sekunden, die der Scheduler vorausplant
const TICK_MS = 25;
const START_DELAY = 0.05;

export function trackLevel(track, anySolo) {
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

// Kanalzug: Eingang (Lautstärke/Mute/Solo) → Effektkette (austauschbar) → Überblend-Gain → Einschleifpunkt
// fürs Effekt-Pad (pre → dry, das Pad hängt sich parallel dazu) → Panorama → Ziel
function createStrip(ctx, dest, { pan = true } = {}) {
  const input = ctx.createGain();
  const out = pan ? ctx.createStereoPanner() : ctx.createGain();
  const pre = ctx.createGain();
  const dry = ctx.createGain();
  pre.connect(dry).connect(out);
  out.connect(dest);
  return { input, gain: input, pan: pan ? out : null, out, pre, dry, chain: null, xf: null };
}

// AudioWorklet-Modul (Mastering, Lo-Fi) einmal je Kontext laden; false, wenn es nicht geht
const FX_WORKLET = new URL('./dsp/fx-worklet.js', import.meta.url);
const workletLoads = new WeakMap();
export function loadFxWorklet(ctx) {
  if (!ctx.audioWorklet) return Promise.resolve(false);
  if (!workletLoads.has(ctx)) workletLoads.set(ctx, ctx.audioWorklet.addModule(FX_WORKLET).then(() => true, () => false));
  return workletLoads.get(ctx);
}

export const masteringOf = (project) => ({ on: false, style: 'balanced', ...(project.master?.mastering || {}) });
const dbGain = (db) => Math.pow(10, db / 20);
// Verstärkungen fürs Mastering, solange die Analyse des Songs noch fehlt („Vorhalt“)
export const defaultMasterGains = (style) => ({ pre: 0, drive: styleOf(style).drive });

// Neue Effektkette einsetzen; live wird in 30 ms von der alten auf die neue Kette überblendet.
function installChain(ctx, strip, fx, spb, live, grid) {
  const chain = buildFxChain(ctx, fx, spb, grid);
  const xf = ctx.createGain();
  chain.output.connect(xf).connect(strip.pre);
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
// Summe: post → A (ohne Mastering: Schutz-Limiter) bzw. B (Mastering-Kette mit eigenem Limiter) → final → Ziel.
// worklets: das Worklet-Modul ist geladen (sonst kein Mastering); mastering: false = nie, { pre, drive } in dB.
// monitor: { ab: null | 'A' | 'B', aDb, bDb } – A/B-Vergleich mit Lautheitsausgleich (nur zum Abhören).
export function buildMix(ctx, project, { limiter = true, grid = 0, dest = ctx.destination, worklets = false, mastering, monitor = null } = {}) {
  const post = ctx.createGain();
  const final = ctx.createGain();
  const aGain = ctx.createGain();
  const bBus = ctx.createGain();
  post.connect(aGain);
  if (limiter) aGain.connect(createLimiter(ctx)).connect(final);
  else aGain.connect(final);
  bBus.connect(final);
  final.connect(dest);
  const masterStrip = createStrip(ctx, post, { pan: false });
  const style = masteringOf(project).style;
  const mix = {
    master: masterStrip.input, masterStrip, post, output: final, aGain, bBus, tracks: new Map(), grid,
    canMaster: worklets && mastering !== false, mst: null,
    gains: mastering && typeof mastering === 'object' ? { ...mastering } : defaultMasterGains(style),
    monitor: { ab: null, aDb: 0, bDb: 0, ...(monitor || {}) },
  };
  syncMix(ctx, project, mix, 60 / project.bpm, false);
  return mix;
}

export function mixLatency(sampleRate, mix) {
  return mix?.mst ? masterLatency(sampleRate) : 0;
}

// Mastering-Knoten einsetzen, Stil wechseln (live mit Überblendung), A/B-Pegel setzen
function syncMastering(ctx, project, mix, live) {
  const m = masteringOf(project);
  const want = mix.canMaster && !!m.on;
  const t = ctx.currentTime;
  const fade = (param, v) => { if (live) param.setTargetAtTime(v, t, 0.012); else param.value = v; };
  const drop = (old) => {
    if (!old) return;
    if (live) {
      fade(old.g.gain, 0);
      setTimeout(() => { try { mix.post.disconnect(old.node); } catch { /* schon getrennt */ } old.g.disconnect(); }, 200);
    } else {
      mix.post.disconnect(old.node);
      old.g.disconnect();
    }
  };
  if (want && mix.mst?.style !== m.style) {
    let node = null;
    try {
      node = new AudioWorkletNode(ctx, 'loopwerk-master', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
        processorOptions: { style: m.style },
      });
    } catch { mix.canMaster = false; }
    if (node) {
      const g = ctx.createGain();
      node.parameters.get('pre').value = dbGain(mix.gains.pre);
      node.parameters.get('drive').value = dbGain(mix.gains.drive);
      mix.post.connect(node);
      node.connect(g).connect(mix.bBus);
      if (live && mix.mst) { g.gain.value = 0; g.gain.setTargetAtTime(1, t, 0.012); }
      drop(mix.mst);
      mix.mst = { node, g, style: m.style };
    }
  } else if (!want && mix.mst) {
    drop(mix.mst);
    mix.mst = null;
  }
  const on = !!mix.mst;
  const ab = on ? mix.monitor.ab : null;
  fade(mix.aGain.gain, !on || ab === 'A' ? dbGain(ab === 'A' ? mix.monitor.aDb : 0) : 0);
  fade(mix.bBus.gain, on && ab !== 'A' ? dbGain(ab === 'B' ? mix.monitor.bDb : 0) : 0);
}

// Verstärkungen aus der Analyse übernehmen (live in einer halben Sekunde)
export function setMasterGains(ctx, mix, gains, live = true) {
  mix.gains = { ...mix.gains, ...gains };
  if (!mix.mst) return;
  for (const k of ['pre', 'drive']) {
    const p = mix.mst.node.parameters.get(k);
    if (live) p.setTargetAtTime(dbGain(mix.gains[k]), ctx.currentTime, 0.15); else p.value = dbGain(mix.gains[k]);
  }
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
  syncMastering(ctx, project, mix, live && mix.masterStrip.chain != null && mix.synced === true);
  mix.synced = true;
}

// Automation der Clip-Hüllkurve (Lautstärke, Fades) für den Ausschnitt [fromBeat, toBeat] ab Kontextzeit `when`:
// { v0, ops } mit ['ramp', t, v] für gerade Stücke und ['curve', t, dauer, Werte] für gekrümmte Fades
// (setValueCurveAtTime, vorab aus clipEnvelope berechnet). Realtime und Offline nutzen dieselbe Rechnung; wer mitten im
// Fade einsteigt, beginnt genau auf der Kurve. null, wenn der Clip unverändert laut ist.
const CURVE_RATE = 500; // Stützwerte je Sekunde (dazwischen interpoliert die Web Audio API linear)
export function envelopeAutomation(clip, fromBeat, toBeat, when, spb) {
  const fi = clip.fadeInBeats || 0;
  const fo = clip.fadeOutBeats || 0;
  if (!fi && !fo && clipGain(clip) === 1) return null;
  const L = clip.lengthBeats;
  const x0 = fromBeat - clip.startBeat;
  const x1 = toBeat - clip.startBeat;
  const xs = [x0];
  for (const k of [fi, L - fo]) if (k > x0 + EPS && k < x1 - EPS && !xs.includes(k)) xs.push(k);
  xs.push(x1);
  xs.sort((a, b) => a - b);
  const at = (x) => when + (x - x0) * spb;
  const ops = [];
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1];
    const b = xs[i];
    const m = (a + b) / 2;
    const c = fi > 0 && m < fi ? clip.fadeInCurve || 0 : fo > 0 && m > L - fo ? clip.fadeOutCurve || 0 : 0;
    const dur = (b - a) * spb;
    if (c && dur > 1e-4) {
      const n = Math.min(4096, Math.max(16, Math.ceil(dur * CURVE_RATE) + 1));
      const values = new Float32Array(n);
      for (let k = 0; k < n; k++) values[k] = clipEnvelope(clip, a + ((b - a) * k) / (n - 1));
      ops.push(['curve', at(a), dur, values]);
    } else {
      ops.push(['ramp', at(b), clipEnvelope(clip, b)]);
    }
  }
  return { t0: when, v0: clipEnvelope(clip, x0), ops };
}

// Hüllkurve auf einen Gain-Parameter legen. Eine Werteliste darf sich mit keinem anderen Ereignis überschneiden:
// der Startwert wird nur gesetzt, wenn nicht sofort eine Kurve beginnt.
function applyEnvelope(param, env) {
  param.value = env.v0;
  if (env.ops[0]?.[0] !== 'curve') param.setValueAtTime(env.v0, env.t0);
  for (const op of env.ops) {
    if (op[0] === 'curve') param.setValueCurveAtTime(op[3], op[1], op[2]);
    else param.linearRampToValueAtTime(op[2], op[1]);
  }
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
    applyEnvelope(e.gain, env);
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

// Hörbare Stücke eines Clips samt dem Sound, der dort klingt: [{ seg, from, to, sample }]. Tonale Sounds klingen in
// der Tonart des jeweiligen Takts – läuft ein Segment über einen Tonartwechsel, wird es an der Taktgrenze geteilt und
// mit derselben Position in der umgestimmten Fassung fortgesetzt (Schnittkante überblendet startVoice).
// Fehlt eine Fassung noch, klingt der Grund-Sound; die Signatur ändert sich, sobald sie da ist (Live-Resync).
export function clipPieces(project, library, clip, ranges, { stale = false } = {}) {
  const base = sampleFor(library, clip);
  if (!base?.buffer) return [];
  const segs = audibleSegments(clip, base.lengthBeats, ranges);
  // Begleit-Patterns folgen zusätzlich dem Akkord-Streifen: je Abschnitt die Fassung auf der dortigen Stufe, Pause = still
  const chords = !!library.followsChords?.(clip.sampleId);
  if (!chords && !(keyChangesOf(project).length && library.followsKey?.(clip.sampleId))) return segs.map((x) => ({ ...x, sample: base }));
  const out = [];
  for (const x of segs) {
    for (const span of chords ? harmonySpans(project, x.from, x.to) : keySpans(project, x.from, x.to)) {
      if (chords && span.chord === '-') continue;
      const delta = keyDelta(project, span.key);
      const chord = chords && span.chord !== 'i' ? span.chord : null;
      const v = delta || chord ? library.variant(clip.sampleId, { delta, chord, stretch: clip.stretch || 1, stale }) : base;
      const sample = v?.buffer && Math.abs(v.lengthBeats - base.lengthBeats) < EPS ? v : base;
      const last = out[out.length - 1];
      if (last && last.seg === x.seg && last.sample === sample && Math.abs(last.to - span.from) < EPS) last.to = span.to;
      else out.push({ seg: x.seg, from: span.from, to: span.to, sample });
    }
  }
  return out;
}

// Spielt einen Clip-Ausschnitt [fromBeat, toBeat] eines Segments ab Kontextzeit `when`.
function playSegment(ctx, dest, clip, sample, seg, fromBeat, toBeat, when, spb) {
  const offset = (fromBeat - seg.start + seg.offset) * spb;
  const stopAt = when + (toBeat - fromBeat) * spb;
  return startVoice(ctx, dest, sample.buffer, when, offset, stopAt, envelopeAutomation(clip, fromBeat, toBeat, when, spb));
}

// Rendert das Projekt offline (Tests, Export). Tonart- und Akkord-Fassungen werden vorher bereitgestellt. Bereich [fromBeat, toBeat] plus Ausklang in Sekunden;
// onProgress(0…1) wird etwa alle 2 s Audio gemeldet.
// compensate: Limiter-Verzögerung herausrechnen (für Export, damit Loops exakt am Dateianfang beginnen).
// mastering: false = ohne Mastering, { pre, drive } = Verstärkungen aus der Analyse (sonst Vorhalt des Stils).
// analysis: Kanäle für die Mastering-Analyse – { x: Summe vor dem Mastering, a: Ausgang ohne Mastering }.
// monitor: A/B-Abhörzustand wie in der Wiedergabe (Tests). pad(ctx, mix): Effekt-Pad einplanen (Tests).
export async function renderProject(project, library, { sampleRate = 44100, limiter = true, fromBeat = 0, toBeat, tailSeconds = 0, onProgress, compensate = false, mastering, analysis = false, monitor = null, pad = null } = {}) {
  const spb = 60 / project.bpm;
  const end = toBeat ?? totalBeats(project);
  const duration = (end - fromBeat) * spb + tailSeconds;
  const frames = Math.max(1, Math.ceil(duration * sampleRate));
  const wantMaster = !analysis && mastering !== false && masteringOf(project).on;
  // Tonart je Takt und Akkord-Streifen: Fassungen vorher bereitstellen, damit Offline genauso klingt wie Realtime
  await library.ensureKeyVariants?.(project);
  const lat = !compensate ? 0 : wantMaster ? masterLatency(sampleRate) : limiter ? await limiterLatency(sampleRate) : 0;
  const ctx = new OfflineAudioContext(analysis ? 4 : 2, frames + lat, sampleRate);
  const worklets = wantMaster || pad ? await loadFxWorklet(ctx) : false;
  let dest = ctx.destination;
  let taps = null;
  if (analysis) {
    ctx.destination.channelInterpretation = 'discrete';
    const merger = ctx.createChannelMerger(4);
    merger.connect(ctx.destination);
    dest = ctx.createGain();
    taps = merger;
  }
  const mix = buildMix(ctx, project, { limiter, grid: -fromBeat * spb, dest, worklets, mastering: wantMaster ? mastering : false, monitor });
  if (analysis) {
    const sx = ctx.createChannelSplitter(2);
    const sa = ctx.createChannelSplitter(2);
    for (const [node, sp, base] of [[mix.post, sx, 0], [dest, sa, 2]]) {
      sp.channelCount = 2;
      sp.channelCountMode = 'explicit';
      node.connect(sp);
      sp.connect(taps, 0, base);
      sp.connect(taps, 1, base + 1);
    }
  }
  if (pad) pad(ctx, mix, { worklets, loopExtra: await measureLoopExtra(sampleRate) });
  const audible = audibleMap(project);
  for (const track of project.tracks) {
    const dest = mix.tracks.get(track.id).input;
    for (const clip of track.clips) {
      for (const { seg, from, to, sample } of clipPieces(project, library, clip, audible.get(clip.id))) {
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
  if (analysis) return { x: [out.getChannelData(0), out.getChannelData(1)], a: [out.getChannelData(2), out.getChannelData(3)], sampleRate };
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

  // Ton-Kontext einmal aufbauen; gleichzeitige Aufrufe warten auf denselben Aufbau (Worklet laden ist asynchron)
  async _ensure() {
    // Noch synchron in der Geste fortsetzen (iOS: nach einer Unterbrechung „interrupted“)
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    if (!this._building) this._building = this._build();
    await this._building;
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async _build() {
    {
      // Erst laden, dann alles auf einmal setzen: wer this.ctx sieht, findet auch Mischung und Pad vor
      // iOS: als Musik-App spielen – sonst schaltet der Stummschalter am iPhone Web Audio ab
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* älteres Safari */ }
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      // Noch innerhalb der Geste starten (iOS), bevor das Laden wartet
      ctx.resume().catch(() => {});
      // Nach Anruf, Sperrbildschirm oder App-Wechsel (iOS: „interrupted“) beim nächsten Tippen weiterlaufen
      const wake = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); };
      for (const type of ['pointerup', 'touchend', 'keydown']) document.addEventListener(type, wake, { capture: true, passive: true });
      const worklets = await loadFxWorklet(ctx);
      const loopExtra = await measureLoopExtra(ctx.sampleRate);
      this.ctx = ctx;
      this.worklets = worklets;
      // Gemeinsamer Ausgang für alles Hörbare (Song, Vorhören, Pads, Klick) – dort misst die Bildmarke den Pegel
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      this.outAnalyser = this.ctx.createAnalyser();
      this.outAnalyser.fftSize = 2048;
      this.outAnalyser.smoothingTimeConstant = 0.55;
      this.outAnalyser.minDecibels = -78;
      this.outAnalyser.maxDecibels = -18;
      this.out.connect(this.outAnalyser);
      this.mix = buildMix(this.ctx, this.project, { limiter: true, dest: this.out, worklets: this.worklets, mastering: this.masterGains, monitor: this.monitor });
      this.pad = new FxPad(this.ctx, this.mix, { spb: () => this.spb, worklets: this.worklets, loopExtra });
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

  _pieces(clip) {
    return clipPieces(this.project, this.library, clip, this._audible().get(clip.id), { stale: true });
  }

  _forEachClip(filter, fn) {
    for (const track of this.project.tracks) {
      const node = this.mix.tracks.get(track.id);
      if (!node) continue;
      for (const clip of track.clips) {
        if (filter && !filter(clip)) continue;
        const pieces = this._pieces(clip);
        if (pieces.length) fn(track, clip, pieces, node);
      }
    }
  }

  // Alle (hörbaren) Stücke, die im Bereich [b0, b1) beginnen.
  _scheduleSpan(b0, b1, t0, limit, filter) {
    const spb = this.spb;
    this._forEachClip(filter, (track, clip, pieces, node) => {
      for (const { seg, from, to, sample } of pieces) {
        if (from < b0 - EPS || from >= b1 - EPS || from >= limit - EPS) continue;
        this._voice(track, clip, sample, node, seg, from, Math.min(to, limit), t0 + (from - b0) * spb);
      }
    });
  }

  // Stücke, die bei Schlag b bereits laufen: mitten im Sample einsteigen.
  _scheduleActiveAt(b, t, limit, filter) {
    this._forEachClip(filter, (track, clip, pieces, node) => {
      for (const { seg, from, to, sample } of pieces) {
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
  // Tonart je Takt: welche Stücke in welcher Fassung klingen – ändert sich ein Wechsel oder wird eine Fassung fertig,
  // plant die Engine den Clip ohne Stopp neu.
  _sig(track, clip) {
    const ranges = this._audible().get(clip.id) ?? [];
    const base = sampleFor(this.library, clip);
    let sig = clipSignature(track.id, clip) + '|' + (base?.rev ?? 0) + '|' + ranges.map((r) => r.join('-')).join(',');
    if (this.library.followsChords?.(clip.sampleId)) {
      // Akkord-Streifen: auch Pausen und Abschnitte auf Stufe i gehören dazu
      sig += '|' + this._pieces(clip).map((p) => `${p.from}-${p.to}:${p.sample.id}.${p.sample.rev}`).join(',');
    } else if (keyChangesOf(this.project).length && this.library.followsKey?.(clip.sampleId)) {
      sig += '|' + this._pieces(clip).filter((p) => p.sample !== base).map((p) => `${p.from}-${p.to}:${p.sample.id}.${p.sample.rev}`).join(',');
    }
    return sig;
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

  // ---------- Mastering ----------

  // Verstärkungen aus der Analyse des Songs ({ pre, drive } in dB); gelten auch für später gebaute Mischungen
  setMasterGains(gains) {
    this.masterGains = { ...(this.masterGains || {}), ...gains };
    if (this.mix) setMasterGains(this.ctx, this.mix, this.masterGains, true);
  }

  // A/B-Vergleich: ab = null (normal), 'A' (vorher) oder 'B' (nachher); beide gleich laut (aDb/bDb ≤ 0)
  setMonitor(monitor) {
    this.monitor = { ab: null, aDb: 0, bDb: 0, ...(this.monitor || {}), ...monitor };
    if (this.mix) { Object.assign(this.mix.monitor, this.monitor); syncMix(this.ctx, this.project, this.mix, this.spb, true); }
    this.emit('monitor');
  }

  get masteringActive() { return !!this.mix?.mst; }

  // ---------- Effekt-Pad (live, nicht im Projekt) ----------

  // target: Spur-ID oder 'master'. Kommt das Loslassen, bevor der Ton-Kontext bereit ist, wird es nachgeholt.
  async padDown(target, mode, x, y) {
    const token = (this._padToken = {});
    await this._ensure();
    if (this._padToken !== token) return null;
    return this.pad.engage(target, mode, x, y, this.ctx.currentTime + 0.005);
  }

  padMove(x, y) {
    if (this.pad?.active) this.pad.move(x, y, this.ctx.currentTime);
  }

  padUp(opts = {}) {
    this._padToken = null;
    if (this.pad?.active) this.pad.release(this.ctx.currentTime + 0.005, opts);
  }

  // ---------- Vorhören und Pegel ----------

  // loop: bis stopPreview() wiederholen (Länge = Sound-Länge in Schlägen); at: Einstieg in s (nahtlos weiterspielen)
  async previewSample(sampleId, { loop = false, at = 0 } = {}) {
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
    let duration = sample.buffer.duration;
    if (loop) {
      duration = Math.min(sample.buffer.duration, (sample.lengthBeats || 4) * this.spb);
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = duration;
      at %= duration;
      src.start(when, at);
    } else src.start(when);
    const preview = { sampleId, src, g, when: when - (loop ? at : 0), duration, loop, rev: sample.rev };
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
