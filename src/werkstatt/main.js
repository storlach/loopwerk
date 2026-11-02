// Krachwerk (Edition „make“, Adresse /werkstatt/): Pad-Wand mit Aufnahme und Auto-Säubern, „Klatsch dein Kit“, Groove aus eigenen Klängen.
// Gemeinsamer Kern mit Loopwerk (DSP, Aufnahme-Worklet, Synth-Kits), eigener Speicher, keine mitgelieferten Samples.

import { EDITION } from '../edition.js';
import { previewDrum } from '../instruments.js';
import { cleanTake, features, classify, describe, mixMono } from './clean.js';
import { sliceTake, pickKit } from './slice.js';
import { Groove, chooseRoles } from './groove.js';
import { Bank, PAD_COUNT, wavToChannels } from './bank.js';
import { Mic } from './mic.js';

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

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const bank = new Bank(EDITION);
let ctx = null, out = null;
const pads = Array(PAD_COUNT).fill(null);
let arm = null;          // null | 'rec' | 'clear'
let take = null;         // laufende Aufnahme { pad | 'kit', session, t0 }
let kitTurn = 0;
const timing = { cleanMs: [] };

async function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    // Sanft verdichten, damit leise und laute Funde zusammen klingen
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.15;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp).connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

const mic = new Mic(audio);
const groove = { g: null };
function grooveOf() {
  if (!groove.g) {
    groove.g = new Groove(ctx, (i, when, v) => trigger(i, when, v));
    groove.g.bpm = EDITION.bpm;
    groove.g.on((g) => {
      $('wgroove').textContent = g.playing ? '■ Groove' : '▶ Groove';
      $('wgroove').setAttribute('aria-pressed', String(g.playing));
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

function trigger(i, when, vel = 1) {
  const p = pads[i];
  if (!p || !ctx) return;
  const t = when ?? ctx.currentTime + 0.005;
  if (p.kind === 'synth') {
    const g = ctx.createGain();
    g.gain.value = vel;
    g.connect(out);
    previewDrum(ctx, g, p.kit, p.row, null, t);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    const g = ctx.createGain();
    g.gain.value = vel;
    src.connect(g).connect(out);
    src.start(t);
  }
  // Licht zur hörbaren Zeit (nur Anzeige)
  const delay = Math.max(0, (t - ctx.currentTime) * 1000);
  setTimeout(() => flash(i), delay);
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

function padLabel(i) {
  const p = pads[i];
  if (!p) return `Pad ${i + 1}: leer, tippen zum Aufnehmen`;
  return `Pad ${i + 1}: ${p.name}, ${p.tags.join(', ')}`;
}

function renderPad(i) {
  const b = $('wpads').children[i];
  const p = pads[i];
  b.className = 'wpad' + (p ? ' full' : ' free');
  b.dataset.cat = p ? catOf(p) : '';
  b.setAttribute('aria-label', padLabel(i));
  b.querySelector('.wpad-name').textContent = p ? p.name : '';
  b.querySelector('.wpad-tags').textContent = p ? p.tags.slice(0, 2).join(' · ') : '';
  const wave = b.querySelector('.wpad-wave');
  wave.replaceChildren();
  if (p?.peaks) for (const v of p.peaks) { const s = el('i'); s.style.height = `${Math.max(6, v * 100)}%`; wave.append(s); }
}

function renderAll() {
  for (let i = 0; i < PAD_COUNT; i++) renderPad(i);
  $('wgroove').disabled = !pads.some(Boolean);
  $('wagain').disabled = !pads.some(Boolean);
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
  pads[i] = { kind: 'own', id: rec.id, name, tags, cls, centroid: f.centroid, buffer: toBuffer(chs, sampleRate), peaks: peaksOf(chs) };
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
  $('wpads').children[i].classList.add('fresh');
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
  for (const i of used) $('wpads').children[i].classList.add('fresh');
  await audio();
  const g = grooveOf();
  g.stop();
  g.roles = roles();
  g.start();
  hint(`${pieces.length} ${pieces.length === 1 ? 'Klang' : 'Klänge'} auf den Pads – Groove läuft`);
  return used;
}

function roles(rng) {
  const list = pads.map((p, index) => (p ? { index, cls: p.cls, centroid: p.centroid } : null)).filter(Boolean);
  return chooseRoles(list, rng);
}

// Synth-Stimme als Pad; Wellenform einmal offline gerechnet (gleicher Klangerzeuger wie beim Spielen)
const synthPeaks = new Map();
function synthPad(kit, r) {
  const p = { kind: 'synth', kit, row: r.row, name: r.name, tags: [KIT_TAG[kit]], cls: r.cls, centroid: r.centroid, peaks: synthPeaks.get(`${kit}/${r.row}`) ?? null };
  if (!p.peaks) {
    const off = new OfflineAudioContext(1, 22050, 44100);
    previewDrum(off, off.destination, kit, r.row, null, 0);
    off.startRendering().then((b) => {
      p.peaks = peaksOf([b.getChannelData(0)]);
      synthPeaks.set(`${kit}/${r.row}`, p.peaks);
      const i = pads.indexOf(p);
      if (i >= 0) renderPad(i);
    }).catch(() => {});
  }
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
  $('whint').hidden = true;
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
  $('whint').hidden = true;
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

function hint(text) {
  const h = $('whint');
  h.textContent = text;
  h.hidden = false;
  clearTimeout(hint.t);
  hint.t = setTimeout(() => { h.hidden = true; }, 2600);
}

async function padDown(i) {
  await audio();
  if (take) {
    if (take.pad === i) take.session?.stop();
    else if (pads[i]) trigger(i);
    return;
  }
  if (arm === 'clear') {
    if (pads[i]) { pads[i] = null; savePads(); renderAll(); refreshGroove(); }
    setArm(null);
    return;
  }
  if (arm === 'rec' || !pads[i]) {
    if (arm === 'rec') setArm(null);
    startPadTake(i);
    return;
  }
  trigger(i);
}

function refreshGroove() {
  const g = groove.g;
  if (!g) return;
  g.roles = roles();
  if (!g.roles) g.stop();
}

async function toggleGroove() {
  await audio();
  const g = grooveOf();
  if (g.playing) { g.stop(); return; }
  g.roles = roles();
  if (!g.roles) { hint('Erst ein Pad füllen'); return; }
  g.start();
}

async function again() {
  await audio();
  const g = grooveOf();
  g.variant++;
  g.roles = roles();
  if (!g.roles) return;
  if (!g.playing) g.start();
  hint(`Groove „${g.pattern.name}“`);
}

function buildUi() {
  const app = $('app');
  app.innerHTML = `
    <header class="wtop">
      <h1 class="wmark"><span>Krach</span><b>werk</b></h1>
      <button class="wmic" id="wmic" type="button" hidden aria-label="Mikrofon schließen">Mikro offen</button>
      <span class="wbpm" aria-label="Tempo">${EDITION.bpm}<small>BPM</small></span>
    </header>
    <main class="wmain">
      <div class="wpads" id="wpads" role="group" aria-label="Pads"></div>
      <section class="wkit" id="wkit" hidden aria-live="polite">
        <div class="wkit-light" aria-hidden="true"></div>
        <p class="wkit-time" id="wkit-time">0,0 s</p>
      </section>
    </main>
    <nav class="wbar" aria-label="Werkzeuge">
      <button class="wbtn primary" id="wkit-btn" type="button">Klatsch dein Kit</button>
      <button class="wbtn" id="wgroove" type="button" aria-pressed="false">▶ Groove</button>
      <button class="wbtn" id="wagain" type="button">Nochmal</button>
      <button class="wbtn arm-rec" id="warm-rec" type="button" aria-pressed="false"><i aria-hidden="true"></i>Ins Pad</button>
      <button class="wbtn arm-clear" id="warm-clear" type="button" aria-pressed="false">✕ Leeren</button>
      <button class="wbtn" id="wsynth" type="button" aria-label="Synth-Kit auf freie Pads">◇ Synth</button>
    </nav>
    <p class="whint" id="whint" role="status" hidden></p>`;
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
      pads[i] = { kind: 'own', id: rec.id, name: rec.name, tags: rec.tags || [], cls: rec.cls, centroid: rec.centroid ?? 1000, buffer: toBuffer(chs, sampleRate), peaks: peaksOf(chs) };
    }
  }));
}

async function boot() {
  document.title = EDITION.title;
  buildUi();
  await restore();
  renderAll();
  if (!pads.some(Boolean)) hint('Tippe ein Pad und mach ein Geräusch');
  window.werkstatt = {
    ready: true, edition: EDITION, bank, timing, mic,
    get pads() { return pads.map((p) => p && { kind: p.kind, name: p.name, tags: p.tags, cls: p.cls, length: p.buffer?.length ?? 0, sampleRate: p.buffer?.sampleRate ?? 0, channels: p.buffer?.numberOfChannels ?? 0 }); },
    get groove() { return groove.g; },
    padBuffer: (i) => pads[i]?.buffer ?? null,
    audio, ingestPad, ingestKit, trigger,
  };
}

boot();
