// Pattern-Editor: Stepsequencer und Drumpad für Beats, Piano-Roll und Klaviatur für Melodien.
// Eingabe per Maus/Finger, Computertastatur (A–K wie Klaviertasten, Pfeil hoch/runter = Oktave) oder MIDI-Keyboard.
// „Live“: das Pattern läuft im Loop, Gespieltes wird ins Raster quantisiert.

import {
  DRUM_ROWS, KITS, drumLabel, SYNTH_PRESETS, STEPS_PER_BEAT, PITCH_LOW, PITCH_HIGH,
  noteName, resizeDrumRows, previewNote, previewDrum, startNote,
} from '../instruments.js';
import { patternSampleId } from '../patterns.js';
import { trackToNotes, fitOctaves, SCALES } from '../dsp/pitch.js';
import { runJob } from '../dsp/run.js';
import { startMicCapture } from '../recorder.js';
import { decodeAudio } from '../samples.js';
import { continueMelody, designSound } from '../ai.js';
import { clamp, el, trackPointer } from '../util.js';
import { place } from './place.js';

// Breite der Tastenspalte links in der Piano-Roll; am Handy breiter (spielbare Tasten)
const keyW = () => (narrow.matches ? 72 : 46);
// Am Handy größere Zeilen und Felder, damit Noten mit dem Finger treffbar sind
const narrow = window.matchMedia('(max-width: 760px)');
const rowH = () => (narrow.matches ? 34 : 14);
// Computertastatur → Halbton über dem Grundton (deutsches und englisches Layout: Z und Y)
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, z: 8, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14 };
const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);
const KEY_OF = Object.fromEntries(Object.entries(KEYMAP).filter(([k]) => k !== 'y').map(([k, v]) => [v, k.toUpperCase()]));
// Drumpad: Pads in der Reihenfolge der Zeilen, Tasten der mittleren Buchstabenreihe
const PAD_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];

export function mountPatternEditor({ root, store, engine, library, ui }) {
  const $ = (id) => root.querySelector('#' + id);
  const nameIn = $('pat-name');
  const barsSel = $('pat-bars');
  const kitSel = $('pat-kit');
  const presetSel = $('pat-preset');
  const lenSel = $('pat-len');
  const recBtn = $('pat-rec');
  const drumsEl = $('pat-drums');
  const rollWrap = $('pat-roll-wrap');
  const canvas = $('pat-roll');
  const hint = $('pat-hint');
  const liveBtn = $('pat-live');
  const quantSel = $('pat-quant');
  const padsEl = $('pat-pads');
  const keysEl = $('pat-keys');
  const keybed = $('pat-keybed');
  const viewBtns = [...root.querySelectorAll('#pat-view .seg')];
  const singBtn = $('pat-sing-btn');
  const singEl = $('pat-sing');
  const singStatus = $('sing-status');
  let singOpen = false;
  let view = 'grid';
  let id = null;
  let rec = false;
  let cursor = 0;
  let octave = 60; // C4
  let drag = null; // Vorschau beim Ziehen in der Piano-Roll
  let midiTried = false;

  for (const k of KITS) { const o = el('option', null, k.label); o.value = k.id; kitSel.append(o); }
  // Am Desktop stehen Seltenes und Einstellungen unter „Mehr“, damit die Kopfzeile ruhig bleibt
  const moreEl = $('pat-more');
  for (const node of [nameIn, $('pat-len-field'), $('pat-quant-field'), recBtn, $('pat-clear')]) place(node, { wide: moreEl });
  // Nach einer Auswahl den Fokus vom Auswahlfeld nehmen: sonst „frisst“ es die Buchstabentasten
  // (A springt z. B. zum Kit „Akustik“), statt dass sie Pads oder Klaviatur spielen
  root.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.blur(); });
  for (const p of SYNTH_PRESETS) { const o = el('option', null, p.label); o.value = p.id; presetSel.append(o); }

  const pat = () => (id ? store.project.patterns?.[id] : null);
  const steps = () => pat().bars * 4 * STEPS_PER_BEAT;
  const update = (fn, key) => store.updatePattern(id, fn, key);

  async function audio() {
    await engine._ensure();
    return engine.ctx;
  }

  function open(patternId) {
    if (id !== patternId) { page = 0; looper.stop(); }
    id = patternId;
    cursor = 0;
    ui.setDock('pattern');
    render();
    if (pat()?.type === 'synth') {
      setupMidi();
      requestAnimationFrame(() => reveal(octave + 7));
    }
  }

  // ---------- Kopfzeile ----------

  nameIn.addEventListener('change', () => { const v = nameIn.value.trim(); if (v) update((p) => { p.name = v.slice(0, 30); }); });
  barsSel.addEventListener('change', () => {
    const bars = Number(barsSel.value);
    update((p) => {
      p.bars = bars;
      if (p.type === 'drums') p.rows = resizeDrumRows(p.rows, bars);
      else p.notes = p.notes.filter((n) => n.start < bars * 4);
    });
    fitClips(bars);
  });
  // Clips dieses Patterns auf die neue Länge bringen
  function fitClips(bars) {
    const sid = patternSampleId(id);
    for (const t of store.project.tracks) for (const c of t.clips) if (c.sampleId === sid && c.lengthBeats < bars * 4) store.resizeClip(c.id, bars * 4);
  }
  kitSel.addEventListener('change', () => update((p) => { p.kit = kitSel.value; }));
  presetSel.addEventListener('change', () => update((p) => { p.preset = presetSel.value; }));
  recBtn.addEventListener('click', () => { rec = !rec; render(); });
  liveBtn.addEventListener('click', () => (looper.running ? looper.stop() : looper.start()));
  for (const b of viewBtns) b.addEventListener('click', () => { view = b.dataset.view; render(); });
  $('pat-play').addEventListener('click', () => {
    if (engine.preview?.sampleId === patternSampleId(id)) engine.stopPreview();
    else engine.previewSample(patternSampleId(id));
  });
  $('pat-clear').addEventListener('click', () => update((p) => {
    if (p.type === 'drums') p.rows = resizeDrumRows({}, p.bars);
    else p.notes = [];
  }));
  $('pattern-close').addEventListener('click', () => ui.setDock(null));

  // ---------- Stepsequencer ----------

  // Am Handy zeigt das Raster einen halben Takt (8 Schritte); der Umschalter darüber blättert.
  const PAGE = 8;
  const pagesEl = $('pat-pages');
  let page = 0;
  const pageCount = () => steps() / PAGE;

  function pageLabel(i, bars) {
    const beat = (i % 2) * 2 + 1;
    const half = `Schlag ${beat}–${beat + 1}`;
    return bars > 1 ? [`Takt ${Math.floor(i / 2) + 1}`, half] : [null, half];
  }

  function renderPages(p) {
    const n = pageCount();
    pagesEl.hidden = !narrow.matches;
    if (!narrow.matches) return;
    if (pagesEl.dataset.key !== `${id}|${n}`) {
      pagesEl.dataset.key = `${id}|${n}`;
      pagesEl.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const b = el('button', 'pat-page');
        b.type = 'button';
        b.dataset.page = String(i);
        const [top, main] = pageLabel(i, p.bars);
        if (top) b.append(el('span', 'pat-page-top', top));
        b.append(el('span', 'pat-page-main', main), el('span', 'pat-page-dot'));
        b.addEventListener('click', () => { page = i; render(); });
        pagesEl.append(b);
      }
    }
    for (const b of pagesEl.children) {
      const i = Number(b.dataset.page);
      const active = DRUM_ROWS.some((r) => (p.rows?.[r.id] || []).slice(i * PAGE, i * PAGE + PAGE).some(Boolean));
      b.setAttribute('aria-pressed', String(i === page));
      b.classList.toggle('has-hits', active);
      b.setAttribute('aria-label', `${pageLabel(i, p.bars).filter(Boolean).join(', ')}${active ? ', mit Schlägen' : ''}`);
    }
  }

  function renderDrums(p) {
    const total = steps();
    if (page >= pageCount()) page = 0;
    const paged = narrow.matches;
    const from = paged ? page * PAGE : 0;
    const n = paged ? PAGE : total;
    renderPages(p);
    if (drumsEl.dataset.key !== `${id}|${total}|${from}|${n}|${p.kit}`) {
      drumsEl.dataset.key = `${id}|${total}|${from}|${n}|${p.kit}`;
      drumsEl.innerHTML = '';
      drumsEl.style.setProperty('--steps', n);
      for (const row of DRUM_ROWS) {
        const rowLabel = drumLabel(p.kit, row.id);
        const label = el('button', 'pat-row-label', rowLabel);
        label.type = 'button';
        label.title = 'Anhören';
        label.addEventListener('click', async () => previewDrum(await audio(), engine.mix.master, pat().kit, row.id, library));
        drumsEl.append(label);
        for (let i = from; i < from + n; i++) {
          const cell = el('button', `pat-cell${Math.floor(i / 4) % 2 ? ' alt' : ''}${i % 16 === 0 ? ' bar' : ''}`);
          cell.type = 'button';
          cell.dataset.row = row.id;
          cell.dataset.step = String(i);
          cell.setAttribute('aria-label', `${rowLabel}, Schritt ${i + 1}`);
          drumsEl.append(cell);
        }
      }
    }
    for (const cell of drumsEl.querySelectorAll('.pat-cell')) {
      const on = !!p.rows?.[cell.dataset.row]?.[Number(cell.dataset.step)];
      cell.setAttribute('aria-pressed', String(on));
    }
  }

  // Wischen nach links/rechts blättert zur nächsten/vorigen Takthälfte
  let swipe = null;
  let swiped = false;
  drumsEl.addEventListener('pointerdown', (e) => { swipe = narrow.matches ? { x: e.clientX, y: e.clientY } : null; swiped = false; });
  drumsEl.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const next = clamp(page + (dx < 0 ? 1 : -1), 0, pageCount() - 1);
    swiped = true;
    if (next !== page) { page = next; render(); }
  });

  // Klick setzt oder löscht einen Schlag. Gedrückt halten und über die Zeile ziehen malt weiter (gleicher Zustand).
  let painting = null;
  drumsEl.addEventListener('pointerdown', async (e) => {
    const cell = e.target.closest('.pat-cell');
    if (!cell || e.button !== 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    const row = cell.dataset.row;
    const on = !pat().rows?.[row]?.[Number(cell.dataset.step)];
    painting = { row, on, done: new Set() };
    const paint = async (c) => {
      const i = Number(c.dataset.step);
      if (painting.done.has(i)) return;
      painting.done.add(i);
      update((p) => { p.rows = resizeDrumRows(p.rows, p.bars); p.rows[row][i] = on ? 1 : 0; }, `paint-${id}-${e.timeStamp}`);
      if (on) previewDrum(await audio(), engine.mix.master, pat().kit, row, library);
    };
    paint(cell);
    trackPointer(e, (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.pat-cell');
      if (over && over.dataset.row === row) paint(over);
    }, () => { painting = null; }, () => { painting = null; });
  });
  drumsEl.addEventListener('click', async (e) => {
    const cell = e.target.closest('.pat-cell');
    if (!cell || swiped) { swiped = false; return; }
    // Maus/Stift erledigt pointerdown (malen); hier nur Finger und Tastatur (Enter/Leertaste)
    if (e.pointerType && e.pointerType !== 'touch') return;
    if (e.detail !== 0 && !lastTouch) return;
    lastTouch = false;
    const row = cell.dataset.row;
    const i = Number(cell.dataset.step);
    const on = !pat().rows?.[row]?.[i];
    update((p) => { p.rows = resizeDrumRows(p.rows, p.bars); p.rows[row][i] = on ? 1 : 0; });
    if (on) previewDrum(await audio(), engine.mix.master, pat().kit, row, library);
  });
  let lastTouch = false;
  drumsEl.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') lastTouch = true; }, true);

  // ---------- Piano-Roll ----------

  function rollGeometry() {
    const n = steps();
    const cellW = Math.max(narrow.matches ? 28 : 12, Math.floor((rollWrap.clientWidth - keyW() - 2) / n));
    return { n, cellW, w: keyW() + n * cellW, h: (PITCH_HIGH - PITCH_LOW + 1) * rowH() };
  }

  function drawRoll(p, notes = p.notes) {
    const { n, cellW, w, h } = rollGeometry();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(canvas);
    const col = (v) => css.getPropertyValue(v).trim();
    for (let m = PITCH_HIGH; m >= PITCH_LOW; m--) {
      const y = (PITCH_HIGH - m) * rowH();
      c.fillStyle = col(isBlack(m) ? '--lane-alt' : '--lane');
      c.fillRect(keyW(), y, w - keyW(), rowH());
      // Wie ein Klavier: weiße Tasten laufen hinter den (kürzeren) schwarzen durch
      c.fillStyle = col('--key-white');
      c.fillRect(0, y, keyW() - 1, rowH());
      if (isBlack(m)) { c.fillStyle = col('--key-black'); c.fillRect(0, y, Math.round(keyW() * 0.62), rowH()); }
      if (m % 12 === 0) {
        c.fillStyle = col(isBlack(m) ? '--key-black-ink' : '--key-white-ink');
        c.font = '10px ' + col('--font-mono');
        c.fillText(noteName(m), 4, y + rowH() - 3);
        c.fillStyle = col('--grid-bar');
        c.fillRect(keyW(), y + rowH() - 1, w - keyW(), 1);
      }
    }
    for (let i = 0; i <= n; i++) {
      c.fillStyle = col(i % 16 === 0 ? '--grid-bar' : i % 4 === 0 ? '--grid-beat' : '--line');
      c.globalAlpha = i % 4 === 0 ? 1 : 0.35;
      c.fillRect(keyW() + i * cellW, 0, 1, h);
    }
    c.globalAlpha = 1;
    if (rec) {
      c.fillStyle = col('--amber');
      c.globalAlpha = 0.25;
      c.fillRect(keyW() + cursor * cellW, 0, cellW, h);
      c.globalAlpha = 1;
    }
    const noteCol = col('--cat-own');
    for (const note of notes) {
      const x = keyW() + note.start * STEPS_PER_BEAT * cellW;
      const y = (PITCH_HIGH - note.pitch) * rowH();
      c.fillStyle = noteCol;
      c.fillRect(x + 1, y + 1, Math.max(3, note.len * STEPS_PER_BEAT * cellW - 2), rowH() - 2);
    }
  }

  const noteAt = (notes, pitch, beat) => notes.findIndex((n) => n.pitch === pitch && beat >= n.start && beat < n.start + n.len);

  canvas.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0 || !pat()) return;
    e.preventDefault();
    const { cellW } = rollGeometry();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pitch = clamp(PITCH_HIGH - Math.floor((e.clientY - rect.top) / rowH()), PITCH_LOW, PITCH_HIGH);
    const p = pat();
    if (x < keyW()) {
      // Tasten am Rand: Ton klingt, solange gedrückt
      noteOn(pitch);
      trackPointer(e, () => {}, () => noteOff(pitch), () => noteOff(pitch));
      return;
    }
    const total = p.bars * 4;
    const stepAt = (cx) => clamp(Math.floor((cx - rect.left - keyW()) / cellW), 0, steps() - 1);
    const beat = stepAt(e.clientX) / STEPS_PER_BEAT;
    const notes = p.notes.map((n) => ({ ...n }));
    const hit = noteAt(notes, pitch, beat);
    let moved = false;
    // Finger: Wischen scrollt die Piano-Roll, Antippen setzt eine Note (Länge aus „Notenlänge“) oder löscht sie
    if (e.pointerType === 'touch') {
      trackPointer(e, () => {}, async () => {
        if (hit >= 0) notes.splice(hit, 1);
        else {
          notes.push({ pitch, start: beat, len: Math.min(Number(lenSel.value), total - beat), vel: 1 });
          previewNote(await audio(), engine.mix.master, p.preset, pitch);
        }
        update((q) => { q.notes = notes; });
      });
      return;
    }
    if (hit >= 0) {
      const n = notes[hit];
      const right = keyW() + (n.start + n.len) * STEPS_PER_BEAT * cellW;
      const resize = right - x <= 6;
      const start0 = n.start;
      const pitch0 = n.pitch;
      trackPointer(e, (ev) => {
        const dx = Math.round((ev.clientX - e.clientX) / cellW) / STEPS_PER_BEAT;
        const dy = Math.round((ev.clientY - e.clientY) / rowH());
        if (!moved && !dx && !dy) return;
        moved = true;
        if (resize) n.len = clamp(Math.round((ev.clientX - rect.left - keyW()) / cellW) / STEPS_PER_BEAT - n.start, 0.25, total - n.start);
        else {
          n.start = clamp(start0 + dx, 0, total - n.len);
          n.pitch = clamp(pitch0 - dy, PITCH_LOW, PITCH_HIGH);
        }
        drawRoll(p, notes);
      }, () => {
        if (!moved) notes.splice(hit, 1);
        update((q) => { q.notes = notes; });
      }, () => render());
      return;
    }
    const len = Math.min(Number(lenSel.value), total - beat);
    const note = { pitch, start: beat, len, vel: 1 };
    notes.push(note);
    previewNote(await audio(), engine.mix.master, p.preset, pitch);
    drawRoll(p, notes);
    trackPointer(e, (ev) => {
      const end = (stepAt(ev.clientX) + 1) / STEPS_PER_BEAT;
      note.len = clamp(Math.max(len, end - note.start), 0.25, total - note.start);
      drawRoll(p, notes);
    }, () => update((q) => { q.notes = notes; }), () => render());
  });

  // ---------- Tastatur und MIDI ----------

  // Gespielte Tonhöhe in den sichtbaren Bereich der Piano-Roll holen
  function reveal(pitch) {
    const y = (PITCH_HIGH - pitch) * rowH();
    const top = rollWrap.scrollTop;
    const h = rollWrap.clientHeight;
    if (y < top + rowH() || y > top + h - 2 * rowH()) rollWrap.scrollTop = Math.max(0, y - h / 2);
  }

  // Schritt-Eingabe: Taste setzt eine Note an der Marke; wer länger hält, bekommt eine längere Note
  let stepHold = new Map(); // Tonhöhe → { start, len, time }
  function stepPress(pitch) {
    const p = pat();
    if (!p || p.type !== 'synth' || !rec) return;
    const len = Number(lenSel.value);
    const start = cursor / STEPS_PER_BEAT;
    if (start + len > p.bars * 4 + 1e-9) return;
    update((q) => { q.notes = [...q.notes.filter((n) => !(n.pitch === pitch && n.start === start)), { pitch, start, len, vel: 1 }]; }, `step-${id}-${start}`);
    stepHold.set(pitch, { start, len, time: engine.ctx?.currentTime ?? 0 });
    cursor = (cursor + len * STEPS_PER_BEAT) % steps();
    render();
  }
  function stepRelease(pitch) {
    const h = stepHold.get(pitch);
    stepHold.delete(pitch);
    if (!h || !engine.ctx) return;
    const heldBeats = (engine.ctx.currentTime - h.time) / engine.spb;
    const total = pat().bars * 4;
    const len = Math.min(total - h.start, Math.max(h.len, Math.round(heldBeats * STEPS_PER_BEAT) / STEPS_PER_BEAT));
    if (len <= h.len + 1e-9) return;
    update((q) => { const n = q.notes.find((x) => x.pitch === pitch && x.start === h.start); if (n) n.len = len; }, `step-${id}-${h.start}`);
    cursor = Math.round(((h.start + len) * STEPS_PER_BEAT)) % steps();
    render();
  }

  // Nur echte Texteingaben behalten ihre Tasten; auf Auswahlfeldern und Reglern spielen die Buchstaben das Instrument
  const typingIn = (t) => (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.isContentEditable;
  document.addEventListener('keydown', (e) => {
    if (root.hidden || !pat() || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
    const key = e.key.toLowerCase();
    // Buchstaben auf einem Auswahlfeld im Editor nicht als Schnellwahl nutzen (sonst springt z. B. „T“ zum Techno-Kit)
    if (e.target.tagName === 'SELECT' && root.contains(e.target) && /^[a-zäöüß]$/.test(key)) e.preventDefault();
    if (pat().type === 'drums') {
      const i = PAD_KEYS.indexOf(key);
      if (i < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) padDown(DRUM_ROWS[i].id);
      return;
    }
    if (key === 'arrowup' || key === 'arrowdown') {
      octave = clamp(octave + (key === 'arrowup' ? 12 : -12), PITCH_LOW, PITCH_HIGH - 12);
      e.preventDefault();
      e.stopPropagation();
      render();
      return;
    }
    if (key in KEYMAP && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      noteOn(clamp(octave + KEYMAP[key], PITCH_LOW, PITCH_HIGH));
    }
  }, true);
  document.addEventListener('keyup', (e) => {
    if (root.hidden || !pat()) return;
    const key = e.key.toLowerCase();
    if (pat().type === 'drums') {
      const i = PAD_KEYS.indexOf(key);
      if (i >= 0) padUp(DRUM_ROWS[i].id);
      return;
    }
    if (key in KEYMAP) noteOff(clamp(octave + KEYMAP[key], PITCH_LOW, PITCH_HIGH));
  }, true);

  async function setupMidi() {
    if (midiTried || !navigator.requestMIDIAccess) return;
    midiTried = true;
    try {
      const access = await navigator.requestMIDIAccess();
      const attach = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (m) => {
            const [status, note, vel] = m.data;
            if (root.hidden) return;
            const pitch = clamp(note, PITCH_LOW, PITCH_HIGH);
            const type = status & 0xf0;
            if (type === 0x90 && vel > 0) noteOn(pitch);
            else if (type === 0x80 || type === 0x90) noteOff(pitch);
          };
        }
      };
      attach();
      access.onstatechange = attach;
      if (access.inputs.size) ui.flash(`MIDI-Keyboard verbunden (${[...access.inputs.values()].map((i) => i.name).join(', ')}).`);
    } catch {
      // Kein MIDI in dieser Ansicht (z. B. im Artifact) – Tastatur und Maus funktionieren weiter.
    }
  }

  // ---------- Live-Aufnahme im Loop ----------

  // Das Pattern läuft als Schleife (mit Klick und einem Takt Vorzähler). Geänderte Pattern-Sounds
  // werden an der nächsten Loop-Grenze nahtlos ausgetauscht.
  const looper = {
    running: false,
    srcs: [],
    t0: 0,
    rev: null,
    async start() {
      const p = pat();
      if (!p) return;
      const ctx = await audio();
      engine.stop();
      engine.stopPreview();
      const spb = engine.spb;
      this.spb = spb;
      this.len = p.bars * 4 * spb;
      this.t0 = ctx.currentTime + 0.1 + 4 * spb;
      this.running = true;
      this.held = new Map();
      this.last = new Map();
      // Klick: ein Takt als Puffer, im Loop ab dem Vorzähler
      const bar = 4 * spb;
      const click = new AudioBuffer({ numberOfChannels: 1, length: Math.round(bar * ctx.sampleRate), sampleRate: ctx.sampleRate });
      const cd = click.getChannelData(0);
      for (let b = 0; b < 4; b++) {
        const f = b === 0 ? 1760 : 1175;
        const at = Math.round(b * spb * ctx.sampleRate);
        for (let i = 0; i < 0.03 * ctx.sampleRate && at + i < cd.length; i++) cd[at + i] = 0.16 * Math.sign(Math.sin(2 * Math.PI * f * i / ctx.sampleRate)) * Math.exp(-i / (0.008 * ctx.sampleRate));
      }
      const cs = ctx.createBufferSource();
      cs.buffer = click;
      cs.loop = true;
      cs.connect(ctx.destination);
      cs.start(this.t0 - bar);
      this.click = cs;
      this.srcs = [];
      this._schedule(this.t0);
      render();
    },
    // Pattern-Sound ab `when` (eine Loop-Grenze) im Loop spielen; bisherigen dort beenden
    _schedule(when) {
      const s = library.get(patternSampleId(id));
      if (!s?.buffer || !this.running) return;
      const ctx = engine.ctx;
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.loop = true;
      src.connect(engine.mix.master);
      src.start(when);
      for (const old of this.srcs) old.stop(when);
      this.srcs = [src];
      this.rev = s.rev;
    },
    refresh() {
      if (!this.running) return;
      const s = library.get(patternSampleId(id));
      if (!s || s.rev === this.rev) return;
      const now = engine.ctx.currentTime + 0.03;
      const k = Math.max(0, Math.ceil((now - this.t0) / this.len));
      this._schedule(this.t0 + k * this.len);
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      for (const x of [...this.srcs, this.click]) { try { x.stop(); } catch { /* schon beendet */ } }
      this.srcs = [];
      render();
    },
    // Schritt für einen geplanten Schlag (Kontextzeit, liegt schon auf dem Raster)
    stepAt(when) {
      const x = ((when - this.t0) / this.spb) * STEPS_PER_BEAT;
      if (x < -0.5) return null;
      const n = steps();
      return ((Math.round(x) % n) + n) % n;
    },
    // Schritt (16tel) für den Moment, den man gerade hört; null im Vorzähler
    // Zwei schnelle Schläge auf derselben Spur, die aufs gleiche Raster fallen würden, verschmelzen nicht:
    // liegt der vorige schon dort und mindestens ein halbes Raster zurück, rückt der neue einen Platz weiter.
    stepNow(lane = null) {
      const heard = engine.heardTime();
      const q = Number(quantSel.value);
      const x = ((heard - this.t0) / this.spb) * STEPS_PER_BEAT;
      if (x < -q / 2) return null;
      let k = Math.round(x / q) * q;
      const last = lane != null ? this.last?.get(lane) : null;
      if (last && k <= last.k && x - last.x >= q / 2) k = last.k + q;
      if (lane != null) (this.last ||= new Map()).set(lane, { k, x });
      const n = steps();
      return ((k % n) + n) % n;
    },
  };
  library.on?.(() => looper.refresh());

  // ---------- Drumpad ----------

  function renderPads(p) {
    const key = `${p.kit}`;
    if (padsEl.dataset.key !== key) {
      padsEl.dataset.key = key;
      padsEl.innerHTML = '';
      DRUM_ROWS.forEach((row, i) => {
        const pad = el('button', 'pat-pad');
        pad.type = 'button';
        pad.dataset.row = row.id;
        pad.append(el('span', 'pat-pad-name', drumLabel(p.kit, row.id)), el('span', 'pat-pad-key', PAD_KEYS[i].toUpperCase()));
        pad.setAttribute('aria-label', `${drumLabel(p.kit, row.id)} (Taste ${PAD_KEYS[i].toUpperCase()})`);
        padsEl.append(pad);
      });
    }
  }

  // when: Kontextzeit des Schlags (Wiederholung beim Halten); ohne Angabe sofort
  async function hitPad(rowId, when) {
    const p = pat();
    if (!p || p.type !== 'drums') return;
    const ctx = await audio();
    previewDrum(ctx, engine.mix.master, p.kit, rowId, library, when);
    const pad = padsEl.querySelector(`[data-row="${rowId}"]`);
    if (pad) {
      // Jeder Schlag leuchtet neu auf, auch wenn der vorige noch leuchtet
      const flash = () => {
        clearTimeout(pad.hitTimer);
        pad.classList.remove('hit');
        void pad.offsetWidth;
        pad.classList.add('hit');
        pad.hitTimer = setTimeout(() => pad.classList.remove('hit'), 110);
      };
      if (when == null) flash(); else setTimeout(flash, Math.max(0, (when - engine.heardTime()) * 1000));
    }
    if (!looper.running) return;
    const step = when == null ? looper.stepNow(rowId) : looper.stepAt(when);
    if (step == null) return;
    update((q) => { q.rows = resizeDrumRows(q.rows, q.bars); q.rows[rowId][step] = 1; }, 'live-' + id);
  }

  // Pad halten = Wirbel: der Schlag wiederholt sich im Raster (1/16 oder 1/8), solange man hält.
  // Geplant auf der Audio-Uhr mit kurzem Vorlauf, in der Live-Aufnahme genau auf den Loop-Schritten.
  // Erst bewusstes Halten gibt einen Wirbel; normales Antippen (bis gut 300 ms) bleibt ein einzelner Schlag
  const HOLD_DELAY = 0.35;
  const held = new Map(); // Zeile → { from, next }
  let rollTimer = null;
  function rollTick() {
    if (!held.size || !engine.ctx) { clearInterval(rollTimer); rollTimer = null; return; }
    const ctx = engine.ctx;
    const iv = (Number(quantSel.value) / STEPS_PER_BEAT) * engine.spb;
    // Kurzer Vorlauf und nur einplanen, wenn schon lange genug gehalten wird: so erklingt nach dem Loslassen nichts mehr
    const horizon = ctx.currentTime + 0.03;
    for (const [rowId, h] of held) {
      if (h.from == null || ctx.currentTime - h.from < HOLD_DELAY - 0.03) continue;
      if (h.next == null) {
        // Erster Wiederholungsschlag: nächster Rasterpunkt nach der Haltezeit
        const base = looper.running ? looper.t0 : h.from;
        const after = h.from + HOLD_DELAY;
        h.next = base + Math.ceil((after - base) / iv - 1e-9) * iv;
      }
      while (h.next <= horizon) {
        if (h.next > ctx.currentTime) hitPad(rowId, h.next);
        h.next += iv;
      }
    }
  }
  async function padDown(rowId) {
    if (held.has(rowId)) return;
    // Sofort als gedrückt merken: ein schnelles Loslassen während des Startens beendet den Halt sicher
    const h = { from: null, next: null };
    held.set(rowId, h);
    hitPad(rowId);
    const ctx = await audio();
    if (held.get(rowId) !== h) return;
    h.from = ctx.currentTime;
    if (!rollTimer) rollTimer = setInterval(rollTick, 20);
  }
  function padUp(rowId) { held.delete(rowId); }
  function padsUpAll() { held.clear(); }
  window.addEventListener('blur', padsUpAll);

  // Auf pointerdown reagieren (nicht click): kürzeste Verzögerung beim Trommeln
  padsEl.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest('.pat-pad');
    if (!pad) return;
    e.preventDefault();
    const rowId = pad.dataset.row;
    padDown(rowId);
    trackPointer(e, () => {}, () => padUp(rowId), () => padUp(rowId));
  });
  padsEl.addEventListener('click', (e) => { const pad = e.target.closest('.pat-pad'); if (pad && e.detail === 0) hitPad(pad.dataset.row); });

  // ---------- Klaviatur (Desktop) ----------

  function renderKeys() {
    const base = octave;
    if (keybed.dataset.key === String(base)) return;
    keybed.dataset.key = String(base);
    keybed.innerHTML = '';
    const whites = [];
    for (let m = base; m <= Math.min(base + 24, PITCH_HIGH); m++) if (!isBlack(m)) whites.push(m);
    const w = 100 / whites.length;
    for (let m = base; m <= Math.min(base + 24, PITCH_HIGH); m++) {
      const black = isBlack(m);
      const k = el('button', `pat-key${black ? ' black' : ''}${m % 12 === 0 ? ' c' : ''}`);
      k.type = 'button';
      k.dataset.pitch = String(m);
      k.setAttribute('aria-label', noteName(m));
      if (KEY_OF[m - base]) k.append(el('span', null, KEY_OF[m - base]));
      if (m % 12 === 0) k.append(el('span', 'pat-key-name', noteName(m)));
      if (black) {
        const i = whites.filter((x) => x < m).length;
        k.style.left = `calc(${i * w}% - ${w * 0.3}%)`;
        k.style.width = `${w * 0.6}%`;
      }
      keybed.append(k);
    }
  }
  const keyEl = (pitch) => keybed.querySelector(`[data-pitch="${pitch}"]`);
  keybed.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.pat-key');
    if (!k) return;
    e.preventDefault();
    const pitch = Number(k.dataset.pitch);
    noteOn(pitch);
    trackPointer(e, () => {}, () => noteOff(pitch), () => noteOff(pitch));
  });
  $('pat-oct-down').addEventListener('click', () => { octave = clamp(octave - 12, PITCH_LOW, PITCH_HIGH - 12); render(); });
  $('pat-oct-up').addEventListener('click', () => { octave = clamp(octave + 12, PITCH_LOW, PITCH_HIGH - 12); render(); });

  // Taste gedrückt: Ton klingt, solange gehalten wird. Live-Aufnahme: Startschritt merken, beim Loslassen Länge setzen.
  // Schritt-Eingabe: Note an der Marke, Haltedauer bestimmt die Länge.
  const voices = new Map(); // Tonhöhe → gehaltener Ton
  function noteOn(pitch) {
    const p = pat();
    if (!p || p.type !== 'synth' || voices.has(pitch)) return;
    keyEl(pitch)?.classList.add('down');
    vkeyEl(pitch)?.classList.add('down');
    reveal(pitch);
    const token = {};
    voices.set(pitch, token);
    audio().then((ctx) => {
      const still = voices.get(pitch) === token;
      // Schon wieder losgelassen (sehr kurzer Tipp): kurz anspielen und trotzdem eintragen
      if (still) voices.set(pitch, startNote(ctx, engine.mix.master, pat().preset, pitch));
      else previewNote(ctx, engine.mix.master, pat().preset, pitch);
      if (looper.running) {
        const step = looper.stepNow();
        if (step != null) {
          looper.held.set(pitch, { step, time: ctx.currentTime });
          if (!still) finishLive(pitch);
        }
      } else {
        stepPress(pitch);
        if (!still) stepRelease(pitch);
      }
    });
  }
  function noteOff(pitch) {
    keyEl(pitch)?.classList.remove('down');
    vkeyEl(pitch)?.classList.remove('down');
    voices.get(pitch)?.stop?.();
    voices.delete(pitch);
    stepRelease(pitch);
    finishLive(pitch);
  }
  function finishLive(pitch) {
    const h = looper.held?.get(pitch);
    if (!h) return;
    looper.held.delete(pitch);
    const q = Number(quantSel.value);
    const heldSteps = ((engine.ctx.currentTime - h.time) / looper.spb) * STEPS_PER_BEAT;
    const lenSteps = Math.max(q, Math.round(heldSteps / q) * q);
    const start = h.step / STEPS_PER_BEAT;
    update((p) => {
      const len = Math.min(lenSteps / STEPS_PER_BEAT, p.bars * 4 - start);
      p.notes = [...p.notes.filter((n) => !(n.pitch === pitch && n.start === start)), { pitch, start, len, vel: 1 }];
    }, 'live-' + id);
  }
  const notesOffAll = () => { for (const pitch of [...voices.keys()]) noteOff(pitch); };
  window.addEventListener('blur', notesOffAll);

  // ---------- Senkrechte Klaviertasten (Handy): links neben der Piano-Roll, spielbar mit Halten und Gleiten ----------

  const vkeys = $('pat-vkeys');
  const vkeyEl = (pitch) => vkeys.querySelector(`[data-pitch="${pitch}"]`);
  function renderVkeys() {
    const key = `${rowH()}`;
    if (vkeys.dataset.key === key) return;
    vkeys.dataset.key = key;
    vkeys.innerHTML = '';
    vkeys.style.height = (PITCH_HIGH - PITCH_LOW + 1) * rowH() + 'px';
    rollWrap.style.setProperty('--vk-h', vkeys.style.height);
    for (let m = PITCH_HIGH; m >= PITCH_LOW; m--) {
      const k = el('div', `vkey${isBlack(m) ? ' black' : ''}${m % 12 === 0 ? ' c' : ''}`);
      k.dataset.pitch = String(m);
      k.style.height = rowH() + 'px';
      if (m % 12 === 0) k.textContent = noteName(m);
      vkeys.append(k);
    }
  }
  vkeys.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.vkey');
    if (!k) return;
    e.preventDefault();
    let pitch = Number(k.dataset.pitch);
    noteOn(pitch);
    // Mit dem Finger über die Tasten gleiten spielt die nächste Taste
    trackPointer(e, (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.vkey');
      const next = over ? Number(over.dataset.pitch) : pitch;
      if (next !== pitch) { noteOff(pitch); pitch = next; noteOn(pitch); }
    }, () => noteOff(pitch), () => noteOff(pitch));
  });

  // ---------- Einsingen: Melodie aus Gesang oder Datei ----------

  const keySel = $('sing-key');
  keySel.append(el('option', null, 'genau wie gesungen'));
  keySel.lastChild.value = '';
  const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
  for (const scale of ['minor', 'major']) {
    for (let r = 0; r < 12; r++) {
      const o = el('option', null, `${ROOTS[r]}-${SCALES[scale].label}`);
      o.value = `${r}:${scale}`;
      keySel.append(o);
    }
  }
  singBtn.addEventListener('click', () => { singOpen = !singOpen; render(); });
  function openSing() { singOpen = true; render(); }

  const say = (text) => { singStatus.textContent = text; };
  async function transcribe(chs, sampleRate, { fromFirst }) {
    const lead = $('sing-lead').checked;
    let voice = chs;
    if (lead) {
      say('Trenne die Lead-Stimme vom Rest … (bei ganzen Songs etwas Geduld)');
      const stems = await runJob('separate', { chs, sampleRate }, { onProgress: (p) => say(`Trenne die Lead-Stimme vom Rest … ${Math.round(p * 100)} %`) });
      voice = stems.vocals;
    }
    say('Erkenne die Töne …');
    const track = await runJob('pitch', { chs: voice, sampleRate });
    const [root, scale] = keySel.value ? keySel.value.split(':') : [];
    const res = trackToNotes(track, { bpm: store.project.bpm, grid: 0.25, fromFirst, key: keySel.value ? { root: Number(root), scale } : null, minConf: lead ? 0.7 : 0.8 });
    if (!res.notes.length) {
      say('Keine klaren Töne gefunden. Tipp: gleichmäßig summen oder auf „la“ singen, nah am Mikrofon, ohne Musik im Hintergrund.');
      return;
    }
    const bars = [1, 2, 4, 8, 16].find((b) => b * 4 >= res.beats) ?? 16;
    const notes = fitOctaves(res.notes, PITCH_LOW, PITCH_HIGH)
      .filter((n) => n.start < bars * 4)
      .map((n) => ({ ...n, len: Math.min(n.len, bars * 4 - n.start) }));
    update((p) => { p.notes = notes; p.bars = bars; });
    fitClips(bars);
    say(`${notes.length} Töne erkannt (${bars} ${bars === 1 ? 'Takt' : 'Takte'}). Hör sie dir mit „▶ Anhören“ an und wähle oben den Klang.`);
    requestAnimationFrame(() => reveal(notes[0].pitch));
    if ($('sing-desc').value.trim()) await buildSound();
  }

  // ---------- Klang aus Beschreibung ----------

  const FX_NAMES = { drive: 'Verzerrer', filter: 'Filter', eq: 'EQ', comp: 'Kompressor', pump: 'Pumpen', echo: 'Echo', hall: 'Hall' };
  async function buildSound() {
    const desc = $('sing-desc').value.trim();
    if (!desc || !pat()) { if (!desc) say('Beschreibe zuerst, wie es klingen soll – z. B. „warmes E-Piano mit Echo“.'); return; }
    const btn = $('sing-sound');
    btn.disabled = true;
    const prev = singStatus.textContent;
    say(`${prev ? prev + ' ' : ''}Baue den Klang …`);
    try {
      const res = await designSound(desc, SYNTH_PRESETS);
      const sid = patternSampleId(id);
      const trackIds = store.project.tracks.filter((t) => t.clips.some((c) => c.sampleId === sid)).map((t) => t.id);
      const fxOn = Object.entries(res.fx).filter(([, f]) => f.on).map(([k]) => FX_NAMES[k]);
      if (!res.preset && !fxOn.length) { say(`${prev ? prev + ' ' : ''}Zu „${desc}“ fällt mir nichts ein – nenne ein Instrument (Flöte, Klavier, Streicher …) oder eine Eigenschaft (warm, verzerrt, Hall).`); return; }
      store.applySound(id, { preset: res.preset, name: res.name, fx: res.fx }, trackIds);
      const label = SYNTH_PRESETS.find((x) => x.id === (res.preset || pat().preset))?.label;
      say(`${prev ? prev + ' ' : ''}Klang: ${label}${fxOn.length ? ` mit ${fxOn.join(', ')}` : ''}${trackIds.length ? '' : ' (Effekte wirken, sobald das Pattern auf einer Spur liegt)'}${res.source === 'claude' ? ' – von Claude eingestellt.' : ' – nach Stichworten eingestellt.'}`);
    } finally {
      btn.disabled = false;
    }
  }
  $('sing-sound').addEventListener('click', buildSound);
  $('sing-desc').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buildSound(); } });

  // ---------- Melodie weiterführen ----------

  let lastCont = null; // { id, from, beats, seed, notesKey }
  const notesKey = (notes) => JSON.stringify(notes.map((n) => [n.pitch, n.start, n.len]));
  $('pat-continue').addEventListener('click', async () => {
    const btn = $('pat-continue');
    const p = pat();
    if (!p || btn.getAttribute('aria-busy') === 'true') return;
    let base = p.notes;
    let from;
    let beats;
    let seed = 1;
    // Nochmal klicken ohne Änderung dazwischen: die letzte Fortsetzung durch eine neue Idee ersetzen
    if (lastCont && lastCont.id === id && lastCont.notesKey === notesKey(p.notes)) {
      ({ from, beats } = lastCont);
      seed = lastCont.seed + 1;
      base = p.notes.filter((n) => n.start < from);
    } else {
      if (!p.notes.length) { ui.flash('Erst ein paar Töne setzen oder einsingen – dann führt „Weiterführen“ sie fort.'); return; }
      const end = Math.max(...p.notes.map((n) => n.start + n.len));
      from = Math.ceil(end / 4 - 1e-9) * 4;
      beats = Math.min(from, 64 - from);
    }
    if (beats <= 0) { ui.flash('Das Pattern ist schon 16 Takte lang – mehr passt nicht hinein.'); return; }
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = '✨ Denkt nach …';
    try {
      const res = await continueMelody(base, { from, beats, seed });
      const bars = [1, 2, 4, 8, 16].find((b) => b * 4 >= from + beats) ?? 16;
      const all = [...base, ...res.notes];
      update((q) => { q.notes = all; q.bars = Math.max(q.bars, bars); });
      fitClips(Math.max(p.bars, bars));
      lastCont = { id, from, beats, seed, notesKey: notesKey(all) };
      ui.flash(`${res.notes.length} Töne angehängt (${res.key.label}, ${res.source === 'claude' ? 'Idee von Claude' : 'nach Regeln: Motiv variiert'}). Nochmal klicken für eine andere Idee.`);
    } catch (err) {
      if (err?.code !== 'cancelled') ui.flash(`Weiterführen hat nicht geklappt: ${err?.message || err}`);
    } finally {
      btn.removeAttribute('aria-busy');
      btn.textContent = '✨ Weiterführen';
    }
  });

  let mic = null;
  $('sing-rec').addEventListener('click', async () => {
    const btn = $('sing-rec');
    if (mic) {
      const m = mic;
      mic = null;
      btn.classList.remove('recording');
      btn.textContent = '● Aufnehmen';
      try {
        const { chs, sampleRate } = await m.stop();
        await transcribe(chs, sampleRate, { fromFirst: false });
      } catch (err) { say(err.message); }
      return;
    }
    try {
      looper.stop();
      mic = await startMicCapture(engine, { beatsPerBar: store.project.beatsPerBar });
      btn.classList.add('recording');
      btn.textContent = '■ Fertig';
      say('Ein Takt Vorzähler, dann singen. Mit „■ Fertig“ beenden.');
    } catch (err) {
      say(err.code === 'unavailable' || err.code === 'denied'
        ? 'Das Mikrofon ist hier nicht verfügbar (in claude.ai gesperrt). Nimm die Melodie mit der Sprachmemo-App auf und wähle die Datei – oder öffne Loopwerk im Browser.'
        : err.message);
    }
  });
  $('sing-file').addEventListener('click', () => $('sing-input').click());
  $('sing-input').addEventListener('change', async () => {
    const file = $('sing-input').files[0];
    $('sing-input').value = '';
    if (!file) return;
    say(`Lese „${file.name}“ …`);
    try {
      const buffer = await decodeAudio(await file.arrayBuffer());
      const chs = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      await transcribe(chs, buffer.sampleRate, { fromFirst: true });
    } catch (err) {
      say(err?.message?.includes('decode') || err?.name === 'EncodingError' ? `„${file.name}“ kann dieser Browser nicht lesen.` : `Das hat nicht geklappt: ${err.message}`);
    }
  });

  // ---------- Darstellung ----------

  function render() {
    const p = pat();
    if (!p || root.hidden) return;
    const drums = p.type === 'drums';
    root.dataset.type = p.type;
    $('pat-title').textContent = drums ? 'Beat-Editor' : 'Melodie-Editor';
    $('pat-view').hidden = !drums;
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    liveBtn.setAttribute('aria-pressed', String(looper.running));
    singBtn.hidden = drums;
    $('pat-continue').hidden = drums;
    singBtn.setAttribute('aria-pressed', String(singOpen && !drums));
    singEl.hidden = drums || !singOpen;
    root.dataset.sing = singOpen && !drums ? '1' : '0';
    liveBtn.textContent = looper.running ? '■ Live stoppen' : '● Live';
    const pads = drums && view === 'pads';
    if (document.activeElement !== nameIn) nameIn.value = p.name;
    barsSel.value = String(p.bars);
    $('pat-kit-field').hidden = !drums;
    $('pat-preset-field').hidden = drums;
    $('pat-len-field').hidden = drums;
    recBtn.hidden = drums;
    recBtn.setAttribute('aria-pressed', String(rec));
    kitSel.value = p.kit || 'elektro';
    presetSel.value = p.preset || 'pluck';
    drumsEl.hidden = !drums || pads;
    padsEl.hidden = !pads;
    $('pat-pages').hidden = !drums || pads || !narrow.matches;
    rollWrap.hidden = drums;
    keysEl.hidden = drums;
    // Erklärungen stehen in den Tipps; hier nur, was gerade läuft
    hint.textContent = !looper.running ? '' : pads || drums
      ? 'Live-Aufnahme läuft: nach einem Takt Vorzähler landet alles, was du spielst, im Raster.'
      : 'Live-Aufnahme läuft: gespielte Töne landen mit ihrer Länge im Raster.';
    hint.hidden = !hint.textContent;
    if (pads) renderPads(p);
    else if (drums) renderDrums(p);
    else {
      drawRoll(p);
      renderKeys();
      if (narrow.matches) renderVkeys();
    }
  }

  ui.on(() => {
    const show = ui.dock === 'pattern';
    if (root.hidden === !show) return;
    root.hidden = !show;
    if (show) requestAnimationFrame(render);
    else { rec = false; looper.stop(); }
  });
  store.on(() => {
    if (id && !store.project.patterns?.[id]) { id = null; if (ui.dock === 'pattern') ui.setDock(null); return; }
    render();
  });
  window.addEventListener('resize', () => render());

  return { open, openSing, transcribe, buildSound, get id() { return id; }, get looper() { return looper; } };
}
