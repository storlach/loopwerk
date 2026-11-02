// Krachwerk (Edition „make“, Adresse /werkstatt/): Pad-Wand mit Aufnahme und Auto-Säubern, „Klatsch dein Kit“, Groove aus eigenen Klängen.
// Gemeinsamer Kern mit Loopwerk (DSP, Aufnahme-Worklet, Synth-Kits), eigener Speicher, keine mitgelieferten Samples.

import { EDITION } from '../edition.js';
import { previewDrum } from '../instruments.js';
import { cleanTake, features, classify, describe, mixMono } from './clean.js';
import { sliceTake, pickKit } from './slice.js';
import { Groove, chooseRoles, stepHits, stepOffset, STEPS } from './groove.js';
import { Bank, PAD_COUNT, wavToChannels } from './bank.js';
import { Mic } from './mic.js';
import { timeStretch } from '../dsp/stretch.js';
import { buildHandoff, repeatToBars } from './handoff.js';
import { encodeWav } from '../wav.js';
import { saveFile, safeName } from '../ui/save-file.js';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
const KEY_LABELS = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Y', 'X', 'C', 'V'];

// Synth-Kit-Stimmen (Klangerzeuger aus instruments.js) mit Klasse für die Groove-Rollen
const SYNTH_ROWS = [
  { row: 'kick', name: 'Kick', cls: 'tief', centroid: 90 },
  { row: 'snare', name: 'Snare', cls: 'mittel', centroid: 1600 },
  { row: 'hat', name: 'Hi-Hat', cls: 'hell', centroid: 9000 },
  { row: 'clap', name: 'Clap', cls: 'mittel', centroid: 1500 },
  { row: 'tomLo', name: 'Tom tief', cls: 'tief', centroid: 200 },
  { row: 'tomHi', name: 'Tom hoch', cls: 'mittel', centroid: 500 },
  { row: 'open', name: 'Hi-Hat offen', cls: 'hell', centroid: 8000 },
  { row: 'crash', name: 'Becken', cls: 'hell', centroid: 7000 },
];
const KIT_TAG = { elektro: 'erzeugt', techno: 'erzeugt 909' };
// Tastenleiste: Tonleiter der Song-Tonart über eine Oktave; Klänge ohne Tonhöhe spielen auf A3 im Original
const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B', 'H'];
const MODES = { moll: [0, 2, 3, 5, 7, 8, 10, 12], dur: [0, 2, 4, 5, 7, 9, 11, 12] };
const BPM_MIN = 60, BPM_MAX = 160;
const SONG_KEY = 'loopwerk.make.song.v1';
const DEFAULT_ROOT = 57;
const RENDER_SR = 44100;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const bank = new Bank(EDITION);
let ctx = null, out = null;
const pads = Array(PAD_COUNT).fill(null);
let arm = null;          // null | 'rec' | 'clear'
let take = null;         // laufende Aufnahme { pad | 'kit', session, t0 }
let kitTurn = 0;
let selected = -1;       // zuletzt gespieltes Pad (Ziel der Tastenleiste)
let keysOn = false;
const live = new Map();  // laufende Schleifen: Pad → { b0, voice }
let pendingSwap = null;  // Festgehaltenes ersetzt am nächsten Taktanfang, was gerade läuft
const song = loadSong(); // { bpm, root (0–11), mode }

function loadSong() {
  const def = { bpm: EDITION.bpm, root: 9, mode: 'moll' };
  try {
    const v = JSON.parse(localStorage.getItem(SONG_KEY) || 'null');
    if (v && v.bpm >= BPM_MIN && v.bpm <= BPM_MAX && v.root >= 0 && v.root < 12 && MODES[v.mode]) return { bpm: v.bpm, root: v.root, mode: v.mode };
  } catch { /* Voreinstellung */ }
  return def;
}
const saveSong = () => { try { localStorage.setItem(SONG_KEY, JSON.stringify(song)); } catch { /* egal */ } };
const keyLabel = () => `${NOTE[song.root]}-${song.mode === 'moll' ? 'Moll' : 'Dur'}`;
// Grundton der Leiste zwischen F3 und E4, damit sie in der Mitte liegt
const scaleNotes = () => { const base = (song.root >= 5 ? 48 : 60) + song.root; return MODES[song.mode].map((d) => base + d); };
const timing = { cleanMs: [] };

// Summe: sanft verdichten, damit leise und laute Funde zusammen klingen. Echtzeit und Festhalten nutzen dieselbe Kette.
function makeBus(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.15;
  const g = c.createGain();
  g.gain.value = 0.9;
  g.connect(comp).connect(c.destination);
  return g;
}

async function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    out = makeBus(ctx);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

const mic = new Mic(audio);
const groove = { g: null };
function grooveOf() {
  if (!groove.g) {
    groove.g = new Groove(ctx, (i, when, v) => trigger(i, when, v));
    groove.g.bpm = song.bpm;
    groove.g.onBar = onBar;
    groove.g.on((g) => {
      if (!g.playing) stopLoops();
      const on = g.playing && g.drums;
      $('wgroove').textContent = on ? '■ Groove' : '▶ Groove';
      $('wgroove').setAttribute('aria-pressed', String(on));
    });
  }
  return groove.g;
}

// ---------- Klang ----------

function toBuffer(chs, sampleRate) {
  const b = new AudioBuffer({ numberOfChannels: chs.length, length: Math.max(1, chs[0].length), sampleRate });
  chs.forEach((d, c) => b.copyToChannel(d, c));
  return b;
}

// Eine Stimme: Pad-Klang zur Zeit when, Stärke vel, um semis Halbtöne versetzt (plus Feinstimmung des Pads)
function voice(c, dest, p, when, vel = 1, semis = 0) {
  const g = c.createGain();
  g.gain.value = vel;
  g.connect(dest);
  if (!p.buffer) { // Synth-Stimme, noch nicht vorgerechnet
    if (p.kind === 'synth') previewDrum(c, g, p.kit, p.row, null, when);
    return { g, src: null };
  }
  const src = c.createBufferSource();
  src.buffer = p.cls === 'loop' ? loopBuffer(p) : p.buffer;
  src.playbackRate.value = 2 ** ((semis + (p.tune || 0)) / 12);
  src.connect(g);
  src.start(when);
  return { g, src };
}

function trigger(i, when, vel = 1, semis = 0) {
  const p = pads[i];
  if (!p || !ctx) return null;
  const t = when ?? ctx.currentTime + 0.005;
  const v = voice(ctx, out, p, t, vel, semis);
  // Licht zur hörbaren Zeit (nur Anzeige)
  const delay = Math.max(0, (t - ctx.currentTime) * 1000);
  setTimeout(() => flash(i), delay);
  return v;
}

// ---------- Schleifen und Festhalten ----------

const loopBars = (i) => pads[i]?.bars || 1;

// Schleife im Song-Tempo: gleiche Tonhöhe, andere Länge (WSOLA aus dem Loopwerk-Kern); je Tempo gemerkt
function loopBuffer(p) {
  const from = p.bpm || EDITION.bpm;
  if (from === song.bpm) return p.buffer;
  if (p.stretched?.bpm === song.bpm) return p.stretched.buffer;
  const b = p.buffer;
  const outLen = Math.round((p.bars || 1) * 4 * (60 / song.bpm) * b.sampleRate);
  const chs = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const buffer = toBuffer(timeStretch(chs, outLen / b.length, b.sampleRate, outLen, { loop: true }), b.sampleRate);
  p.stretched = { bpm: song.bpm, buffer };
  return buffer;
}

function fadeOut(v, at) {
  if (!v) return;
  v.g.gain.setTargetAtTime(0, Math.max(at, ctx.currentTime), 0.006);
  try { v.src?.stop(Math.max(at, ctx.currentTime) + 0.06); } catch { /* schon aus */ }
}

function stopLoops(at = ctx?.currentTime ?? 0) {
  for (const l of live.values()) fadeOut(l.voice, at);
  live.clear();
  pendingSwap = null;
  if ($('wpads')) for (const b of $('wpads').children) b.classList.remove('live');
}

// Taktanfang (vom Groove, vor dessen Schlägen): Festgehaltenes einwechseln, Schleifen neu anstoßen
function onBar(when, bar) {
  const g = groove.g;
  if (pendingSwap && [...live.values()].every((l) => (bar - l.b0) % pendingSwap.bars === 0)) {
    const { pad } = pendingSwap;
    for (const [i, l] of live) { fadeOut(l.voice, when); $('wpads').children[i].classList.remove('live'); }
    live.clear();
    pendingSwap = null;
    g.drums = false;
    g.emit();
    if (pads[pad]) { live.set(pad, { b0: bar, voice: null }); $('wpads').children[pad].classList.add('live'); }
  }
  for (const [i, l] of live) {
    if (!pads[i]) { live.delete(i); continue; }
    if ((bar - l.b0) % loopBars(i) === 0) {
      fadeOut(l.voice, when); // nach einem Tempowechsel kann die alte Fassung länger sein
      l.voice = trigger(i, when);
    }
  }
}

async function toggleLoop(i) {
  await audio();
  const g = grooveOf();
  const b = $('wpads').children[i];
  if (live.has(i)) {
    fadeOut(live.get(i).voice, ctx.currentTime);
    live.delete(i);
    b.classList.remove('live');
    if (!g.drums && !live.size) g.stop();
    return;
  }
  if (!g.playing) { g.drums = false; g.start(); }
  live.set(i, { b0: g.bar, voice: null }); // ab dem nächsten Taktanfang
  b.classList.add('live');
}

// Was gerade läuft (Groove + Schleifen) offline mit derselben Kette rechnen; Ausklang an den Anfang falten
async function renderNow(bars) {
  const g = groove.g;
  const frames = Math.round(bars * g.barDur * RENDER_SR);
  const off = new OfflineAudioContext(2, frames + RENDER_SR * 2, RENDER_SR);
  const bus = makeBus(off);
  if (g.drums) {
    const p = g.pattern;
    for (let s = 0; s < bars * STEPS; s++) {
      const t = s * g.stepDur + stepOffset(p, s, g.stepDur);
      for (const h of stepHits(p, g.roles, s)) if (pads[h.pad]) voice(off, bus, pads[h.pad], t, h.vel);
    }
  }
  for (const i of live.keys()) for (let b = 0; b < bars; b += loopBars(i)) voice(off, bus, pads[i], b * g.barDur);
  const r = await off.startRendering();
  const chs = [0, 1].map((c) => {
    const src = r.getChannelData(c);
    const d = src.slice(0, frames);
    for (let k = frames; k < src.length; k++) d[k % frames] += src[k];
    return d;
  });
  let peak = 0;
  for (const d of chs) for (let k = 0; k < d.length; k++) peak = Math.max(peak, Math.abs(d[k]));
  if (peak > 0.89) for (const d of chs) for (let k = 0; k < d.length; k++) d[k] *= 0.89 / peak;
  return { chs, sampleRate: RENDER_SR, bars };
}

async function freeze() {
  const g = groove.g;
  if (!g?.playing || (!g.drums && !live.size)) { hint('Erst Groove oder Schleife starten'); return null; }
  const free = pads.findIndex((p) => !p);
  if (free < 0) { hint('Alle Pads voll – erst eins leeren'); return null; }
  const bars = Math.max(1, ...[...live.keys()].map(loopBars));
  const { chs, sampleRate } = await renderNow(bars);
  const used = new Set(namesInUse());
  let n = 1;
  while (used.has(`Schleife ${n}`)) n++;
  const name = `Schleife ${n}`;
  const tags = [`${bars} ${bars === 1 ? 'takt' : 'takte'}`];
  const rec = await bank.put(chs, sampleRate, { name, tags, cls: 'loop', bars, bpm: song.bpm, centroid: 0, source: 'Festhalten' });
  keepSafe();
  pads[free] = { kind: 'own', id: rec.id, name, tags, cls: 'loop', bars, bpm: song.bpm, centroid: 0, buffer: toBuffer(chs, sampleRate), peaks: peaksOf(chs) };
  savePads();
  renderAll();
  formed(free);
  pendingSwap = { pad: free, bars };
  hint(`Festgehalten: „${name}“`);
  return free;
}

// ---------- Pads ----------

function peaksOf(chs, n = 28) {
  const d = mixMono(chs);
  const step = Math.max(1, Math.floor(d.length / n));
  const out = new Float32Array(n);
  let max = 0;
  for (let k = 0; k < n; k++) {
    let p = 0;
    for (let i = k * step; i < Math.min(d.length, (k + 1) * step); i++) p = Math.max(p, Math.abs(d[i]));
    out[k] = p;
    max = Math.max(max, p);
  }
  return out.map((v) => (max ? v / max : 0));
}

const catOf = (p) => (p.kind === 'synth' ? 'synth' : p.cls);
const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);
// Grundton und Feinstimmung: tonale Klänge landen auf dem nächsten Halbton
function tuning(pitch) {
  if (!pitch) return { root: DEFAULT_ROOT, tune: 0 };
  const m = midiOf(pitch);
  return { root: Math.round(m), tune: Math.round(m) - m };
}

function padLabel(i) {
  const p = pads[i];
  if (!p) return `Pad ${i + 1}: leer, tippen zum Aufnehmen`;
  return `Pad ${i + 1}: ${p.name}, ${p.tags.join(', ')}`;
}

function renderPad(i) {
  const b = $('wpads').children[i];
  const p = pads[i];
  b.className = 'wpad' + (p ? ' full' : ' free') + (live.has(i) ? ' live' : '') + (keysOn && i === selected ? ' sel' : '');
  b.dataset.cat = p ? catOf(p) : '';
  b.setAttribute('aria-label', padLabel(i));
  b.querySelector('.wpad-name').textContent = p ? p.name : '';
  b.querySelector('.wpad-tags').textContent = p ? p.tags.slice(0, 2).join(' · ') : '';
  const wave = b.querySelector('.wpad-wave');
  wave.replaceChildren();
  if (p?.peaks) for (const v of p.peaks) {
    const s = el('i');
    s.style.height = `${Math.max(6, v * 100)}%`;
    s.style.setProperty('--j', (Math.random() * 2 - 1).toFixed(2));
    wave.append(s);
  }
}

function renderAll() {
  for (let i = 0; i < PAD_COUNT; i++) renderPad(i);
  $('wgroove').disabled = !pads.some(Boolean);
  $('wagain').disabled = !pads.some(Boolean);
  renderKeys();
}

// Roh → geformt: frische Klänge erscheinen als unruhige Wolke und ordnen sich zur Wellenform
function formed(i) {
  const b = $('wpads').children[i];
  b.classList.add('raw', 'fresh');
  void b.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('raw')));
}

function flash(i) {
  const b = $('wpads').children[i];
  b.classList.remove('hit');
  void b.offsetWidth;
  b.classList.add('hit');
}

function savePads() {
  bank.savePads(pads.map((p) => (!p ? null : p.kind === 'synth' ? { synth: { kit: p.kit, row: p.row } } : { sound: p.id })));
}

const namesInUse = () => pads.filter(Boolean).map((p) => p.name);

// Gesäuberten Klang ablegen und aufs Pad legen
async function storeOnPad(i, chs, sampleRate, source, f = null) {
  f ??= features(mixMono(chs), sampleRate);
  const cls = classify(f);
  const { name, tags } = describe(f, cls, namesInUse());
  const rec = await bank.put(chs, sampleRate, { name, tags, cls, centroid: f.centroid, pitch: f.pitch, source });
  keepSafe();
  pads[i] = { kind: 'own', id: rec.id, name, tags, cls, centroid: f.centroid, ...tuning(f.pitch), buffer: toBuffer(chs, sampleRate), peaks: peaksOf(chs) };
  selected = i;
  renderPad(i);
  return pads[i];
}

// Rohaufnahme → Pad (auch Testeinstieg)
async function ingestPad(i, chs, sampleRate) {
  const t0 = performance.now();
  const c = cleanTake(chs, sampleRate);
  if (!c) { hint('Nichts gehört – tippe und mach ein Geräusch'); renderPad(i); return null; }
  const f = features(mixMono(c.chs), sampleRate);
  timing.cleanMs.push(performance.now() - t0);
  const p = await storeOnPad(i, c.chs, sampleRate, 'Mikrofon', f);
  savePads();
  renderAll();
  formed(i);
  trigger(i);
  return p;
}

// Rohaufnahme → mehrere Pads + Groove (auch Testeinstieg)
async function ingestKit(chs, sampleRate) {
  const free = pads.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  const pieces = pickKit(sliceTake(chs, sampleRate), Math.min(8, free.length));
  if (!pieces.length) { hint('Keine Schläge gehört – klatsch oder klopf deutlich'); return []; }
  const used = [];
  for (let k = 0; k < pieces.length; k++) {
    await storeOnPad(free[k], pieces[k].chs, sampleRate, 'Klatsch-Kit', pieces[k].f);
    used.push(free[k]);
  }
  savePads();
  renderAll();
  for (const i of used) formed(i);
  await audio();
  const g = grooveOf();
  g.stop();
  g.roles = roles();
  g.drums = true;
  g.start();
  hint(`${pieces.length} ${pieces.length === 1 ? 'Klang' : 'Klänge'} auf den Pads – Groove läuft`);
  return used;
}

function roles(rng) {
  const list = pads.map((p, index) => (p && p.cls !== 'loop' ? { index, cls: p.cls, centroid: p.centroid } : null)).filter(Boolean);
  return chooseRoles(list, rng);
}

// Synth-Stimme als Pad: einmal offline vorgerechnet (gleicher Klangerzeuger), danach wie jeder Klang spielbar –
// mit Stärke, auf der Tastenleiste und beim Festhalten. Bis dahin spielt der Klangerzeuger direkt.
const synthCache = new Map();
function synthPad(kit, r) {
  const key = `${kit}/${r.row}`;
  const p = { kind: 'synth', kit, row: r.row, name: r.name, tags: [KIT_TAG[kit]], cls: r.cls, centroid: r.centroid, root: DEFAULT_ROOT, tune: 0, buffer: null, peaks: null };
  let job = synthCache.get(key);
  if (!job) {
    const off = new OfflineAudioContext(1, Math.round(RENDER_SR * 1.5), RENDER_SR);
    previewDrum(off, off.destination, kit, r.row, null, 0);
    job = off.startRendering().then((b) => {
      const d = b.getChannelData(0);
      let end = d.length;
      while (end > 1 && Math.abs(d[end - 1]) < 1e-4) end--;
      const cut = toBuffer([d.slice(0, Math.max(64, end))], RENDER_SR);
      return { buffer: cut, peaks: peaksOf([cut.getChannelData(0)]) };
    });
    synthCache.set(key, job);
  }
  job.then(({ buffer, peaks }) => {
    p.buffer = buffer;
    p.peaks = peaks;
    const i = pads.indexOf(p);
    if (i >= 0) renderPad(i);
  }).catch(() => {});
  return p;
}

function fillSynthKit() {
  const kit = EDITION.synthKits[kitTurn++ % EDITION.synthKits.length];
  const free = pads.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) { hint('Alle Pads voll – erst eins leeren'); return; }
  SYNTH_ROWS.slice(0, free.length).forEach((r, k) => {
    pads[free[k]] = synthPad(kit, r);
  });
  savePads();
  renderAll();
}

// ---------- Aufnahme ----------

const fmtTime = (s) => `${s.toFixed(1).replace('.', ',')} s`;

async function startPadTake(i) {
  if (take) return;
  groove.g?.stop(); // kein Übersprechen aus dem Lautsprecher
  $('whint').classList.add('off');
  const b = $('wpads').children[i];
  take = { pad: i, t0: 0 };
  b.classList.add('rec');
  b.querySelector('.wpad-name').textContent = '…';
  try {
    take.session = await mic.capture({ onLevel: (p) => level(p, b), silence: 0.6, max: 6, wait: 6 });
  } catch (err) {
    take = null;
    b.classList.remove('rec');
    renderPad(i);
    hint(err.message);
    return;
  }
  take.t0 = performance.now();
  const res = await take.session.done;
  take = null;
  b.classList.remove('rec');
  b.style.removeProperty('--lvl');
  setLight(0);
  if (!res.heard) { renderPad(i); hint('Nichts gehört – tippe und mach ein Geräusch'); return; }
  await ingestPad(i, res.chs, res.sampleRate);
}

async function startKitTake() {
  if (take) { take.session?.stop(); return; }
  if (!pads.some((p) => !p)) { hint('Alle Pads voll – erst eins leeren'); return; }
  groove.g?.stop();
  setArm(null);
  $('whint').classList.add('off');
  take = { pad: 'kit', t0: 0 };
  const panel = $('wkit');
  panel.hidden = false;
  $('wkit-btn').classList.add('on');
  $('wkit-btn').textContent = 'Fertig';
  try {
    take.session = await mic.capture({ onLevel: (p) => level(p, panel), silence: 1.6, max: 12, wait: 8 });
  } catch (err) {
    take = null;
    endKitUi();
    hint(err.message);
    return;
  }
  take.t0 = performance.now();
  const res = await take.session.done;
  take = null;
  endKitUi();
  if (!res.heard) { hint('Nichts gehört – klatsch oder klopf deutlich'); return; }
  await ingestKit(res.chs, res.sampleRate);
}

function endKitUi() {
  $('wkit').hidden = true;
  $('wkit-btn').classList.remove('on');
  $('wkit-btn').textContent = 'Klatsch dein Kit';
  setLight(0);
}

function level(p, node) {
  const v = Math.min(1, Math.sqrt(p) * 1.2);
  node.style.setProperty('--lvl', v.toFixed(3));
  setLight(v);
  if (take?.t0) {
    const s = (performance.now() - take.t0) / 1000;
    if (take.pad === 'kit') $('wkit-time').textContent = fmtTime(s);
    else node.querySelector('.wpad-name').textContent = fmtTime(s);
  }
}

// Das Mikrofon ist die Lichtquelle: der Raum hinter den Pads leuchtet mit dem Pegel
function setLight(v) { $('app').style.setProperty('--mic', v.toFixed(3)); }

// ---------- Bedienung ----------

function setArm(mode) {
  arm = arm === mode ? null : mode;
  $('warm-rec').setAttribute('aria-pressed', String(arm === 'rec'));
  $('warm-clear').setAttribute('aria-pressed', String(arm === 'clear'));
  $('app').dataset.arm = arm || '';
}

function hint(text, ms = 2600) {
  const h = $('whint');
  h.textContent = text;
  h.classList.remove('off');
  clearTimeout(hint.t);
  hint.t = setTimeout(() => h.classList.add('off'), ms);
}

// ---------- Als App am Handy: Offline-Start, dauerhafter Speicher, Home-Bildschirm ----------

const TIP_KEY = 'loopwerk.make.tips.v1';
const app = { persisted: null, installable: false };
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function setupApp() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('werkstatt/sw.js', { scope: 'werkstatt/' })
      .catch((err) => console.warn('Offline-Start nicht verfügbar:', err?.message || err));
  }
  // Android/Chrome: eigener Knopf statt Browser-Leiste
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; app.installable = true; $('winstall').hidden = false; });
  addEventListener('appinstalled', () => { installEvt = null; app.installable = false; $('winstall').hidden = true; });
  $('winstall').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* abgebrochen */ }
    installEvt = null;
    $('winstall').hidden = true;
  });
}

// Beim ersten eigenen Klang: Speicher dauerhaft anfragen; iOS räumt Seiten-Speicher sonst nach Tagen ohne Besuch,
// Apps auf dem Home-Bildschirm nicht – daher dort einmal der Tipp.
async function keepSafe() {
  if (app.persisted !== null) return;
  app.persisted = false;
  try { app.persisted = !!(await navigator.storage?.persist?.()); } catch { /* nicht unterstützt */ }
  let tips = {};
  try { tips = JSON.parse(localStorage.getItem(TIP_KEY) || '{}'); } catch { /* leer */ }
  if (!tips.home && !standalone() && isIos()) {
    tips.home = true;
    try { localStorage.setItem(TIP_KEY, JSON.stringify(tips)); } catch { /* egal */ }
    setTimeout(() => hint('Tipp: Teilen → „Zum Home-Bildschirm“ – dann bleiben deine Klänge sicher', 5000), 2700);
  }
}

async function padDown(i) {
  await audio();
  if (take) {
    if (take.pad === i) take.session?.stop();
    else if (pads[i]) trigger(i);
    return;
  }
  if (arm === 'clear') {
    if (pads[i]) {
      if (live.has(i)) { fadeOut(live.get(i).voice, ctx.currentTime); live.delete(i); }
      if (pendingSwap?.pad === i) pendingSwap = null;
      pads[i] = null;
      if (selected === i) selected = -1;
      savePads(); renderAll(); refreshGroove();
    }
    setArm(null);
    return;
  }
  if (arm === 'rec' || !pads[i]) {
    if (arm === 'rec') setArm(null);
    startPadTake(i);
    return;
  }
  select(i);
  if (pads[i].cls === 'loop') toggleLoop(i);
  else trigger(i);
}

function select(i) {
  const prev = selected;
  selected = i;
  if (keysOn && prev !== i) { if (prev >= 0) renderPad(prev); renderPad(i); renderKeys(); }
}

// ---------- Tastenleiste: jeder Klang wird Instrument ----------

const noteName = (m) => `${NOTE[m % 12]}${Math.floor(m / 12) - 1}`;

function renderKeys() {
  const strip = $('wkeys');
  strip.hidden = !keysOn;
  $('wkeys-btn').setAttribute('aria-pressed', String(keysOn));
  const p = pads[selected];
  strip.dataset.cat = p ? catOf(p) : '';
  $('wkeys-name').textContent = p ? `${p.name} · ${keyLabel()}` : '';
  const notes = scaleNotes();
  document.querySelectorAll('.wkey').forEach((k, n) => { k.dataset.midi = notes[n]; k.textContent = noteName(notes[n]); });
}

// ---------- Tempo und Tonart ----------

function renderSong() {
  $('wsong-bpm').textContent = song.bpm;
  $('wsong-key').textContent = keyLabel();
  $('wbpm-val').textContent = `${song.bpm} BPM`;
  for (const b of document.querySelectorAll('.wset [data-root]')) b.setAttribute('aria-pressed', String(Number(b.dataset.root) === song.root));
  for (const b of document.querySelectorAll('.wset [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === song.mode));
  renderKeys();
}

function setBpm(v) {
  song.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));
  if (groove.g) groove.g.bpm = song.bpm; // wirkt ab dem nächsten Schritt, Schleifen ab dem nächsten Takt
  saveSong();
  renderSong();
}

function setKey(root, mode = song.mode) {
  song.root = root;
  song.mode = mode;
  saveSong();
  renderSong();
}

// Tempo antippen: Mittel der letzten Abstände; nach 2 s Pause beginnt es neu (nur Messung, keine Planung)
const taps = [];
function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now);
  if (taps.length > 5) taps.shift();
  if (taps.length < 3) return;
  const gaps = taps.slice(1).map((t, k) => t - taps[k]);
  setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
}

function toggleSet(open = $('wset').hidden) {
  $('wset').hidden = !open;
  $('wsong').setAttribute('aria-expanded', String(open));
  if (open) toggleTake(false);
}

// ---------- Mitnehmen: als Loopwerk-Projekt oder als WAV ----------

function toggleTake(open = $('wtake').hidden) {
  $('wtake').hidden = !open;
  $('wtake-btn').setAttribute('aria-expanded', String(open));
  if (open) toggleSet(false);
}

const stamp = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}-${z(d.getMinutes())}`;
};

// Ohne Schleife: den Groove (1 Takt) als Schleife rechnen, damit im Projekt etwas klingt
async function grooveAsLoop() {
  await audio();
  const g = grooveOf();
  const r = roles();
  if (!r) return null;
  const keep = { drums: g.drums, roles: g.roles };
  g.drums = true;
  g.roles = g.roles || r;
  const saved = new Map(live);
  live.clear();
  try {
    const { chs, sampleRate } = await renderNow(1);
    return { id: 'mk-groove-' + Date.now().toString(36), name: 'Groove', buffer: toBuffer(chs, sampleRate), loop: true, bars: 1 };
  } finally {
    for (const [k, v] of saved) live.set(k, v);
    Object.assign(g, keep);
  }
}

function handoffSounds() {
  return pads.filter((p) => p?.buffer).map((p) => ({
    id: p.id || `mk-${p.kit}-${p.row}`, name: p.name, loop: p.cls === 'loop', bars: p.bars || 1,
    buffer: p.cls === 'loop' ? loopBuffer(p) : p.buffer,
  }));
}

// Am Handy über das Teilen-Menü (Dateien, AirDrop, Nachricht), sonst als Download
async function deliver(filename, blob) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; } catch (err) { if (err?.name === 'AbortError') return false; }
  }
  await saveFile(filename, blob);
  return true;
}

async function takeProject() {
  toggleTake(false);
  const sounds = handoffSounds();
  if (!sounds.some((x) => x.loop)) { const g = await grooveAsLoop(); if (g) sounds.push(g); }
  if (!sounds.length) { hint('Erst ein Pad füllen'); return null; }
  const name = `Krachwerk ${stamp()}`;
  const data = await buildHandoff({ name, bpm: song.bpm, root: song.root, mode: song.mode, sounds });
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (await deliver(`${safeName(name)}.json`, blob)) hint('Gespeichert – in Loopwerk über „Öffnen“ laden', 4000);
  return data;
}

async function takeWav() {
  toggleTake(false);
  let src = pads[selected]?.cls === 'loop' ? pads[selected] : [...pads].reverse().find((p) => p?.cls === 'loop');
  let buffer = src ? loopBuffer(src) : null;
  let bars = src?.bars || 1;
  let name = src?.name;
  if (!buffer) {
    const g = await grooveAsLoop();
    if (!g) { hint('Erst ein Pad füllen'); return null; }
    ({ buffer, bars, name } = g);
  }
  const blob = encodeWav(repeatToBars(buffer, bars));
  if (await deliver(`${safeName(`Krachwerk ${name} ${song.bpm} BPM`)}.wav`, blob)) hint(`„${name}“ als WAV gespeichert`);
  return blob;
}

function toggleKeys() {
  if (!keysOn && !pads[selected]) {
    const first = pads.findIndex((p) => p && p.cls !== 'loop');
    if (first < 0) { hint('Erst ein Pad füllen'); return; }
    selected = first;
  }
  keysOn = !keysOn;
  renderAll();
}

async function playKey(midi) {
  await audio();
  const p = pads[selected];
  if (!p) return null;
  // Tonale Klänge auf ihrem Grundton, alle anderen liegen im Original auf der ersten Taste
  const root = p.cls === 'ton' ? p.root : scaleNotes()[0];
  return trigger(selected, null, 1, midi - root);
}

function refreshGroove() {
  const g = groove.g;
  if (!g) return;
  g.roles = roles();
  if (!g.roles) g.drums = false;
  if (!g.drums && !live.size) g.stop();
  g.emit();
}

// Groove-Knopf schaltet das Schlagzeug; laufende Schleifen bleiben, bis man sie antippt
async function toggleGroove() {
  await audio();
  const g = grooveOf();
  if (g.playing && g.drums) {
    g.drums = false;
    if (!live.size) g.stop();
    g.emit();
    return;
  }
  g.roles = roles();
  if (!g.roles) { hint('Erst ein Pad füllen'); return; }
  g.drums = true;
  if (!g.playing) g.start();
  g.emit();
}

async function again() {
  await audio();
  const g = grooveOf();
  g.variant++;
  g.roles = roles();
  if (!g.roles) return;
  g.drums = true;
  if (!g.playing) g.start();
  g.emit();
  hint(`Groove „${g.pattern.name}“`);
}

function buildUi() {
  const app = $('app');
  app.innerHTML = `
    <header class="wtop">
      <h1 class="wmark"><span>Krach</span><b>werk</b></h1>
      <button class="wmic" id="wmic" type="button" hidden aria-label="Mikrofon schließen">Mikro offen</button>
      <button class="winstall" id="winstall" type="button" hidden>Installieren</button>
      <button class="wbpm" id="wsong" type="button" aria-expanded="false" aria-controls="wset" aria-label="Tempo und Tonart"><span id="wsong-bpm"></span><small>BPM</small><span class="wkeylbl" id="wsong-key"></span></button>
    </header>
    <section class="wset" id="wset" hidden aria-label="Tempo und Tonart">
      <div class="wset-row">
        <button class="wbtn" id="wbpm-down" type="button" aria-label="Langsamer">−</button>
        <output class="wset-bpm" id="wbpm-val" aria-live="polite"></output>
        <button class="wbtn" id="wbpm-up" type="button" aria-label="Schneller">+</button>
        <button class="wbtn" id="wtap" type="button" aria-label="Tempo antippen">Tippen</button>
      </div>
      <div class="wset-keys" role="group" aria-label="Grundton">${NOTE.map((n, pc) => `<button class="wchip" type="button" data-root="${pc}" aria-pressed="false">${n}</button>`).join('')}</div>
      <div class="wset-mode" role="group" aria-label="Tongeschlecht"><button class="wchip" type="button" data-mode="moll" aria-pressed="false">Moll</button><button class="wchip" type="button" data-mode="dur" aria-pressed="false">Dur</button></div>
    </section>
    <main class="wmain">
      <p class="whint off" id="whint" role="status"></p>
      <div class="wpads" id="wpads" role="group" aria-label="Pads"></div>
      <section class="wkit" id="wkit" hidden aria-live="polite">
        <div class="wkit-light" aria-hidden="true"></div>
        <p class="wkit-time" id="wkit-time">0,0 s</p>
      </section>
    </main>
    <section class="wkeys" id="wkeys" hidden aria-label="Tasten">
      <p class="wkeys-name" id="wkeys-name"></p>
      <div class="wkeys-row">${Array.from({ length: 8 }, () => '<button class="wkey" type="button"></button>').join('')}</div>
    </section>
    <nav class="wbar" aria-label="Werkzeuge">
      <button class="wbtn primary" id="wkit-btn" type="button">Klatsch dein Kit</button>
      <button class="wbtn" id="wgroove" type="button" aria-pressed="false">▶ Groove</button>
      <button class="wbtn" id="wagain" type="button">Nochmal</button>
      <button class="wbtn" id="wfreeze" type="button" aria-label="Was läuft als neue Schleife festhalten">Festhalten</button>
      <button class="wbtn" id="wkeys-btn" type="button" aria-pressed="false">♪ Tasten</button>
      <button class="wbtn" id="wsynth" type="button" aria-label="Synth-Kit auf freie Pads">◇ Synth</button>
      <button class="wbtn arm-rec" id="warm-rec" type="button" aria-pressed="false"><i aria-hidden="true"></i>Ins Pad</button>
      <button class="wbtn arm-clear" id="warm-clear" type="button" aria-pressed="false">✕ Leeren</button>
      <button class="wbtn half" id="wtake-btn" type="button" aria-expanded="false" aria-controls="wtake">⇪ Mitnehmen</button>
      <section class="wset wtake" id="wtake" hidden aria-label="Mitnehmen">
        <button class="wbtn" id="wtake-project" type="button">Als Loopwerk-Projekt</button>
        <button class="wbtn" id="wtake-wav" type="button">Schleife als WAV</button>
      </section>
    </nav>`;
  const grid = $('wpads');
  for (let i = 0; i < PAD_COUNT; i++) {
    const b = el('button', 'wpad free');
    b.type = 'button';
    b.dataset.pad = i;
    b.append(el('span', 'wpad-wave'), el('span', 'wpad-name'), el('span', 'wpad-tags'), el('span', 'wpad-key', KEY_LABELS[i]));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); padDown(i); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); padDown(i); } });
    b.addEventListener('animationend', () => b.classList.remove('hit', 'fresh'));
    grid.append(b);
  }
  $('wkit-btn').addEventListener('click', startKitTake);
  $('wgroove').addEventListener('click', toggleGroove);
  $('wagain').addEventListener('click', again);
  $('warm-rec').addEventListener('click', () => setArm('rec'));
  $('warm-clear').addEventListener('click', () => setArm('clear'));
  $('wsynth').addEventListener('click', fillSynthKit);
  $('wfreeze').addEventListener('click', freeze);
  $('wkeys-btn').addEventListener('click', toggleKeys);
  $('wsong').addEventListener('click', () => toggleSet());
  // Schubladen schließen beim Spielen oder Tippen daneben
  addEventListener('pointerdown', (e) => {
    if (!$('wset').hidden && !e.target.closest('#wset, #wsong')) toggleSet(false);
    if (!$('wtake').hidden && !e.target.closest('#wtake, #wtake-btn')) toggleTake(false);
  }, true);
  $('wtake-btn').addEventListener('click', () => toggleTake());
  $('wtake-project').addEventListener('click', takeProject);
  $('wtake-wav').addEventListener('click', takeWav);
  $('wbpm-down').addEventListener('click', () => setBpm(song.bpm - 5));
  $('wbpm-up').addEventListener('click', () => setBpm(song.bpm + 5));
  $('wtap').addEventListener('pointerdown', (e) => { e.preventDefault(); tapTempo(); });
  for (const b of document.querySelectorAll('.wset [data-root]')) b.addEventListener('click', () => setKey(Number(b.dataset.root)));
  for (const b of document.querySelectorAll('.wset [data-mode]')) b.addEventListener('click', () => setKey(song.root, b.dataset.mode));
  for (const k of document.querySelectorAll('.wkey')) {
    k.addEventListener('pointerdown', (e) => { e.preventDefault(); k.classList.remove('hit'); void k.offsetWidth; k.classList.add('hit'); playKey(Number(k.dataset.midi)); });
    k.addEventListener('animationend', () => k.classList.remove('hit'));
  }
  addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = KEYS.indexOf(e.code);
    if (i >= 0 && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); padDown(i); }
  });
  mic.onchange = (open) => { $('wmic').hidden = !open; };
  $('wmic').addEventListener('click', () => { if (!take) mic.close(); });
}

async function restore() {
  const saved = bank.loadPads();
  await Promise.all(saved.map(async (s, i) => {
    if (s?.synth) {
      const r = SYNTH_ROWS.find((x) => x.row === s.synth.row);
      if (r && KIT_TAG[s.synth.kit]) pads[i] = synthPad(s.synth.kit, r);
    } else if (s?.sound) {
      const rec = await bank.get(s.sound);
      if (!rec) return;
      const { chs, sampleRate } = wavToChannels(rec.wav);
      pads[i] = { kind: 'own', id: rec.id, name: rec.name, tags: rec.tags || [], cls: rec.cls, centroid: rec.centroid ?? 1000, bars: rec.bars, bpm: rec.bpm, ...tuning(rec.pitch), buffer: toBuffer(chs, sampleRate), peaks: peaksOf(chs) };
    }
  }));
}

async function boot() {
  document.title = EDITION.title;
  buildUi();
  setupApp();
  await restore();
  renderAll();
  renderSong();
  if (!pads.some(Boolean)) hint('Tippe ein Pad und mach ein Geräusch');
  window.werkstatt = {
    ready: true, edition: EDITION, bank, timing, mic, app,
    get pads() { return pads.map((p) => p && { kind: p.kind, name: p.name, tags: p.tags, cls: p.cls, bars: p.bars, root: p.root, tune: p.tune, length: p.buffer?.length ?? 0, sampleRate: p.buffer?.sampleRate ?? 0, channels: p.buffer?.numberOfChannels ?? 0 }); },
    get groove() { return groove.g; },
    get live() { return [...live.keys()]; },
    get selected() { return selected; },
    takeProject, takeWav, song, loopBuffer: (i) => (pads[i] ? loopBuffer(pads[i]) : null), setBpm, setKey,
    padBuffer: (i) => pads[i]?.buffer ?? null,
    audio, ingestPad, ingestKit, trigger, freeze, renderNow, playKey,
  };
}

boot();
