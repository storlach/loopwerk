// Kit- und Instrument-Werkbank (Krachwerk Scheibe 4, Spec docs/specs/krachwerk-4-kit.md §2, ADR 012).
// Kit: Pads 2×4 (Name des Sounds, Herkunftsfarbe), Schritt-Zeile für das gewählte Pad, Reiter Kit · Clip. Groß gezogen
// (Handy: Schublade oben, Desktop: ⤢) wird daraus die Pad-Wand zum Live-Spielen. Instrument: Tasten 2×4 in der Song-Tonart.
// Pad und Taste klingen beim Zeiger-Herunter (pointerdown) über die Spur des Clips; ● nimmt Pads oder Tasten ins Raster auf.
// Geschrieben wird nur über Store-Aktionen (setKit, setKitPad, setInstrument, updatePattern, padHit, keyHit, placeKit …).
// Knoten bleiben stehen: Pads, Schritte und Tasten werden nur umbeschriftet, nie ersetzt.

import { kitOf, instrumentOf, keyOf, tonicOf, clipGain } from '../model.js';
import { PAD_IDS, grooveOf, nextGroove, stepInClip, STEPS_PER_BAR } from '../grooves.js';
import { DRUM_ROWS, SWING_OPTIONS, swingOf, resizeDrumRows } from '../instruments.js';
import { playPad, playKey } from '../own-instruments.js';
import { SCALES } from '../dsp/pitch.js';
import { clamp, el, trackPointer } from '../util.js';
import { lsKey } from '../edition.js';
import { narrow } from './place.js';
import { mountSoundBench, noteName } from './sound-bench.js';

const PAD_KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', 'ö'];
const LONG = 520; // ms: Pad lang drücken = Sound-Werkbank
const HOLD = 420; // ms: Schritt halten = Anschlag 50 %
const SNAP_KEY = lsKey('loopwerk.kbSnap');
const OCT_KEY = lsKey('loopwerk.kbOct');
const SCALE_KEY = lsKey('loopwerk.kbScale');
const fmtBeats = (b) => (b <= 0 ? 'aus' : `${String(Math.round(b * 100) / 100).replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`);
const comma = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const read = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* egal */ } };
const patOf = (project, clip) => { const m = clip && /^pat-(.+)$/.exec(clip.sampleId); return m ? { pid: m[1], pat: project.patterns?.[m[1]] } : { pid: null, pat: null }; };

// Sound-Werkbank und Kit-/Instrument-Werkbank in einem Fach: wer das Ausgewählte „besitzt“, zeigt sich, die andere schweigt
export function mountBenches(box, deps) {
  const back = { cur: null };
  const sb = mountSoundBench(box, { ...deps, back });
  const kb = mountKitBench(box, { ...deps, back });
  return {
    root: box,
    kb,
    choose: sb.choose,
    render() {
      if (back.cur && (deps.ui.benchSoundId !== back.cur.sampleId || deps.ui.selectedClipId)) back.cur = null;
      if (kb.render()) { sb.root.hidden = true; sb.root.querySelector('.wb-back').hidden = true; for (const p of sb.root.querySelectorAll('[role=tabpanel]')) p.hidden = true; return; }
      sb.root.hidden = false;
      sb.render();
    },
  };
}

export function mountKitBench(box, { store, ui, library, engine, tools, back, recorder = null, rec = null }) {
  const app = document.getElementById('app');
  const root = el('div', 'wb kb');
  root.hidden = true;
  box.append(root);
  let cur = null; // { kind: 'kit' | 'instrument', id, pid, pat, clip, track }
  let sel = 'kick'; // gewähltes Pad
  let selStep = 0;
  let snap = read(SNAP_KEY, 16) === 8 ? 8 : 16;
  let oct = clamp(Number(read(OCT_KEY, 0)) || 0, -2, 2);
  let scale = read(SCALE_KEY, 'minor') === 'major' ? 'major' : 'minor';
  let recOn = false;
  let pass = 0;
  let tab = 'kit';

  const kitNow = () => (cur?.kind === 'kit' ? kitOf(store.project, cur.id) : null);
  const instNow = () => (cur?.kind === 'instrument' ? instrumentOf(store.project, cur.id) : null);
  const patNow = () => (cur?.pid ? store.project.patterns?.[cur.pid] : null);
  const nameOf = (id) => library.get(id)?.name;
  const trackId = () => cur?.track?.id ?? null;
  const bpb = () => store.project.beatsPerBar;

  function targetOf() {
    const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
    if (found) {
      const { pid, pat } = patOf(store.project, found.clip);
      if (pat?.type === 'drums' && kitOf(store.project, pat.kit)) return { kind: 'kit', id: pat.kit, pid, pat, clip: found.clip, track: found.track };
      if (pat?.type === 'synth' && instrumentOf(store.project, pat.preset)) return { kind: 'instrument', id: pat.preset, pid, pat, clip: found.clip, track: found.track };
      return null;
    }
    if (ui.selectedTrackId || !ui.benchSoundId) return null;
    if (kitOf(store.project, ui.benchSoundId)) return { kind: 'kit', id: ui.benchSoundId, pid: null, pat: null, clip: null, track: null };
    if (instrumentOf(store.project, ui.benchSoundId)) return { kind: 'instrument', id: ui.benchSoundId, pid: null, pat: null, clip: null, track: null };
    return null;
  }

  // ---------- Kopf ----------
  const head = el('header', 'wb-head');
  const dot = el('span', 'kb-dot');
  dot.append(el('span', 'wb-dot-i'));
  const nameBtn = el('button', 'wb-name');
  nameBtn.type = 'button';
  nameBtn.id = 'kb-name';
  nameBtn.title = 'Antippen zum Umbenennen';
  const nameIn = document.createElement('input');
  Object.assign(nameIn, { type: 'text', maxLength: 30, id: 'kb-name-in', className: 'wb-name-in', hidden: true });
  nameIn.setAttribute('aria-label', 'Name');
  const count = el('span', 'wb-count');
  count.id = 'kb-count';
  head.append(dot, nameBtn, nameIn, count);
  const rename = (on) => {
    nameBtn.hidden = on;
    nameIn.hidden = !on;
    if (on) { nameIn.value = kitNow()?.name ?? instNow()?.name ?? ''; nameIn.focus(); nameIn.select(); }
  };
  const setName = (v) => {
    const name = String(v).trim();
    if (!cur || !name) return;
    if (cur.kind === 'kit') store.setKit(cur.id, { name }); else store.setInstrument(cur.id, { name });
  };
  nameBtn.addEventListener('click', () => rename(true));
  let keepName = true;
  nameIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); keepName = false; nameIn.blur(); }
  });
  nameIn.addEventListener('blur', () => { const keep = keepName; keepName = true; rename(false); if (keep) setName(nameIn.value); });

  // ---------- Pads (Kit) ----------
  const pads = el('div', 'kb-pads');
  pads.setAttribute('role', 'group');
  pads.setAttribute('aria-label', 'Pads');
  const padEls = PAD_IDS.map((row, i) => {
    const b = el('button', 'kb-pad');
    b.type = 'button';
    b.dataset.row = row;
    b.dataset.padDrop = '';
    const lab = el('span', 'kb-pad-row', DRUM_ROWS.find((r) => r.id === row)?.label ?? row);
    const nm = el('span', 'kb-pad-name');
    const key = el('span', 'kb-pad-key', PAD_KEYS[i].toUpperCase());
    b.append(lab, nm, key);
    b.addEventListener('pointerdown', (e) => padDown(e, row, b));
    b.addEventListener('click', (e) => { if (e.detail === 0) { hit(row, b); } });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('animationend', () => b.classList.remove('hit'));
    b.addEventListener('pad-drop', (e) => dropOn(row, e.detail?.sampleId));
    return b;
  });
  pads.append(...padEls);

  function flashPad(b) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }

  function select(row) {
    if (sel === row) return;
    sel = row;
    syncPads();
    syncSteps();
  }

  function dropOn(row, sampleId) {
    const s = sampleId && library.get(sampleId);
    if (!cur || cur.kind !== 'kit' || !s || /^pat-/.test(s.id)) return;
    store.setKitPad(cur.id, row, sampleId);
    select(row);
    ui.flash(`„${s.name}“ liegt auf dem Pad.`);
  }

  function padDown(e, row, b) {
    if (e.button !== 0 || cur?.kind !== 'kit') return;
    const armed = ui.armedSampleId && library.get(ui.armedSampleId);
    if (armed && !/^pat-/.test(armed.id)) {
      dropOn(row, armed.id);
      ui.arm(null);
      engine.stopPreview?.();
      return;
    }
    const sx = e.clientX, sy = e.clientY;
    const filled = !!kitNow()?.map[row];
    let long = false, moved = false;
    hit(row, b);
    const timer = filled ? setTimeout(() => { long = true; openPadSound(row); }, LONG) : 0;
    trackPointer(e, (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { moved = true; clearTimeout(timer); } },
      () => { clearTimeout(timer); if (!filled && !long && !moved) rec?.recordPad?.(cur?.id, row); },
      () => clearTimeout(timer));
  }

  // Anschlag: nimmt auf (●), wählt, spielt über die Spur des Clips
  function hit(row, b) {
    if (cur?.kind !== 'kit') return;
    select(row);
    if (recOn && cur.clip) recordHit(row);
    flashPad(b ?? padEls[PAD_IDS.indexOf(row)]);
    const map = kitNow()?.map;
    if (map?.[row]) playPad({ engine, library, map, row, trackId: trackId() }).catch(() => {});
  }

  function recordHit(row) {
    const pat = patNow();
    if (!pat) return;
    const n = pat.bars * STEPS_PER_BAR;
    let step = stepInClip(cur.clip, engine.heardBeat(), pat.bars);
    if (step == null) return;
    if (snap === 8) step = (Math.round(step / 2) * 2) % n;
    store.padHit(cur.pid, row, step, 1, pass);
  }

  function openPadSound(row) {
    const sid = kitNow()?.map[row];
    if (!sid || !library.get(sid) || !back) return;
    const clipId = cur.clip?.id, kitId = cur.id;
    back.cur = { label: 'Kit', sampleId: sid, go() { back.cur = null; if (clipId && store.findClip(clipId)) ui.select(clipId); else ui.openSound(kitId); } };
    ui.openSound(sid);
  }

  // ---------- Schritt-Zeile (Kit mit Clip) ----------
  const stepsBox = el('div', 'kb-steps');
  stepsBox.setAttribute('role', 'grid');
  stepsBox.setAttribute('aria-label', 'Schritte des gewählten Pads');
  const stepRows = [0, 1].map(() => { const r = el('div', 'kb-steprow'); r.setAttribute('role', 'row'); stepsBox.append(r); return r; });
  const cells = [];
  for (let i = 0; i < 2 * STEPS_PER_BAR; i++) {
    const c = el('div', `kb-step${Math.floor((i % STEPS_PER_BAR) / 4) % 2 ? ' alt' : ''}`);
    c.setAttribute('role', 'gridcell');
    c.tabIndex = i === 0 ? 0 : -1;
    c.dataset.step = String(i);
    c.addEventListener('pointerdown', (e) => stepDown(e, i));
    c.addEventListener('keydown', (e) => stepKey(e, i));
    c.addEventListener('focus', () => { selStep = i; syncVel(); });
    stepRows[Math.floor(i / STEPS_PER_BAR)].append(c);
    cells.push(c);
  }
  const stepVal = (i) => Number(patNow()?.rows?.[sel]?.[i]) || 0;
  function setStep(i, v) {
    if (!cur?.pid) return;
    const row = sel;
    store.updatePattern(cur.pid, (q) => { q.rows = resizeDrumRows(q.rows, q.bars); q.rows[row][i] = v; });
    if (v > 0 && stepVal(i) === v) { const m = kitNow()?.map; if (m?.[row]) playPad({ engine, library, map: m, row, trackId: trackId(), vel: v }).catch(() => {}); }
  }
  function stepDown(e, i) {
    if (e.button !== 0) return;
    cells[i].focus({ preventScroll: true });
    selStep = i;
    let held = false, moved = false;
    const sx = e.clientX, sy = e.clientY;
    const timer = setTimeout(() => { held = true; setStep(i, 0.5); }, HOLD);
    trackPointer(e, (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { moved = true; clearTimeout(timer); } },
      () => { clearTimeout(timer); if (!held && !moved) setStep(i, stepVal(i) > 0 ? 0 : 1); },
      () => clearTimeout(timer));
  }
  function stepKey(e, i) {
    const n = (patNow()?.bars ?? 1) * STEPS_PER_BAR;
    let to = null;
    if (e.key === 'ArrowRight') to = Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to != null) { e.preventDefault(); e.stopPropagation(); cells[i].tabIndex = -1; cells[to].tabIndex = 0; cells[to].focus(); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setStep(i, stepVal(i) > 0 ? 0 : 1); }
  }

  // ---------- Tasten (Instrument) ----------
  const keys = el('div', 'kb-keys');
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', 'Tasten');
  const keyEls = Array.from({ length: 8 }, (_, i) => {
    const b = el('button', 'kb-key');
    b.type = 'button';
    b.dataset.degree = String(i + 1);
    b.append(el('span', 'kb-key-note'), el('span', 'kb-key-deg', String(i + 1)));
    b.addEventListener('pointerdown', (e) => keyDown(e, i, b));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); tapKey(i, b); } });
    keys.append(b);
    return b;
  });
  // Stufen 1–8 der Song-Tonart; Oktave so, dass der Grundton des Instruments in der Mitte liegt
  function pitches() {
    const inst = instNow();
    const tonic = tonicOf(keyOf(store.project));
    const steps = SCALES[scale].steps;
    const root = inst?.root ?? 60;
    const base = tonic + 12 * Math.round((root - tonic) / 12) + 12 * oct;
    return Array.from({ length: 8 }, (_, i) => (i < 7 ? base + steps[i] : base + 12));
  }
  function keyDown(e, i, b) {
    if (e.button !== 0 || cur?.kind !== 'instrument') return;
    const end = startKey(i, b);
    trackPointer(e, () => {}, () => end(), () => end());
  }
  function tapKey(i, b) { const end = startKey(i, b); setTimeout(end, 250); }
  function startKey(i, b) {
    const pitch = pitches()[i];
    const start = recOn && cur.clip ? { beat: engine.heardBeat(), pid: cur.pid } : null;
    let rel = false, voice = null;
    if (start) {
      const pat = patNow();
      const step = pat ? stepInClip(cur.clip, start.beat, pat.bars) : null;
      start.at = step == null ? null : step / 4;
      if (start.at != null) store.keyHit(cur.pid, { pitch, start: start.at, len: 0.25, vel: 1 }, pass);
    }
    b.classList.add('on');
    playKey({ engine, store, library, instrumentId: cur.id, pitch, trackId: trackId() }).then((v) => { voice = v; if (rel) v?.stop(); }).catch(() => {});
    return () => {
      if (rel) return;
      rel = true;
      b.classList.remove('on');
      voice?.stop();
      if (start?.at != null) {
        const len = Math.max(0.25, Math.round((engine.heardBeat() - start.beat) * 4) / 4);
        store.keyHit(cur?.pid ?? start.pid, { pitch, start: start.at, len: len > 16 ? 0.25 : len, vel: 1 }, pass);
      }
    };
  }

  // ---------- Reiter und Flächen ----------
  const tabs = el('div', 'kb-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Werkbank');
  const TABS = [['kit', 'Kit'], ['inst', 'Instrument'], ['clip', 'Clip']];
  const panels = {};
  const tabBtns = {};
  const fineOpen = read(lsKey('loopwerk.kbFine'), {});
  for (const [id, label] of TABS) {
    const b = el('button', 'kb-tab', label);
    b.type = 'button';
    b.id = `kb-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `kb-panel-${id}`);
    b.addEventListener('click', () => { tab = id; syncTabs(); });
    tabs.append(b);
    tabBtns[id] = b;
    const p = el('div', 'wb-panel kb-panel');
    p.id = `kb-panel-${id}`;
    p.hidden = true;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `kb-tab-${id}`);
    const grund = el('div', 'wb-grund');
    const fineBtn = el('button', 'wb-fine-btn', 'Feinheiten');
    fineBtn.type = 'button';
    fineBtn.id = `kb-fine-btn-${id}`;
    const fine = el('div', 'wb-fine');
    const setFine = (on) => { fine.hidden = !on; fineBtn.setAttribute('aria-expanded', String(on)); };
    setFine(!!fineOpen[id]);
    fineBtn.addEventListener('click', () => { fineOpen[id] = fine.hidden; setFine(fine.hidden); write(lsKey('loopwerk.kbFine'), fineOpen); });
    p.append(grund, fineBtn, fine);
    panels[id] = { p, grund, fine };
  }
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const vis = TABS.map(([i]) => i).filter((i) => !tabBtns[i].hidden);
    const next = vis[(vis.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + vis.length) % vis.length];
    e.preventDefault();
    tab = next;
    syncTabs();
    tabBtns[next].focus();
  });
  root.append(head, pads, keys, stepsBox, tabs, ...TABS.map(([i]) => panels[i].p));

  // Bausteine (wie in der Sound-Werkbank)
  const updaters = [];
  const btn = (parent, label, id, fn, cls = '') => {
    const b = el('button', `wb-btn ${cls}`.trim(), label);
    b.type = 'button';
    if (id) b.id = id;
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  };
  const row = (parent, label) => {
    const r = el('label', 'insp-row wb-row');
    const out = el('output');
    r.append(el('span', null, label), out);
    parent.append(r);
    return { r, out };
  };
  const range = (r, id, min, max, step) => {
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), id });
    r.append(input);
    return input;
  };
  const setVal = (input, v) => { if (document.activeElement !== input) input.value = String(v); };
  const stepper = (parent, label, ids, fn, aria) => {
    const r = el('div', 'insp-row wb-row wb-step');
    const out = el('output');
    out.id = ids[2];
    const minus = btn(r, '−', ids[0], () => fn(-1), 'wb-step-btn');
    const plus = btn(r, '+', ids[1], () => fn(1), 'wb-step-btn');
    minus.setAttribute('aria-label', aria[0]);
    plus.setAttribute('aria-label', aria[1]);
    r.insertBefore(el('span', null, label), minus);
    r.insertBefore(out, plus);
    parent.append(r);
    return { r, out, minus, plus };
  };
  const toggleBtn = (parent, label, id, fn) => btn(parent, label, id, fn, 'wb-toggle');
  const placeBeat = () => Math.floor(engine.heardBeat() / bpb()) * bpb();

  // --- Kit: Grund ---
  const K = panels.kit;
  const setBars = (n) => {
    const pat = patNow();
    if (!pat || pat.bars === n) return;
    const clip = cur.clip;
    store.batch('Takte', () => {
      store.updatePattern(cur.pid, (q) => { q.bars = n; q.rows = resizeDrumRows(q.rows, n); });
      if (clip && Math.abs(clip.lengthBeats - n * 4) > 1e-6) {
        const l = store.project.loop;
        const wasLoop = l.on && Math.abs(l.startBeat - clip.startBeat) < 1e-6 && Math.abs(l.endBeat - (clip.startBeat + clip.lengthBeats)) < 1e-6;
        store.resizeClip(clip.id, n * 4);
        if (wasLoop) store.setLoop({ on: true, startBeat: clip.startBeat, endBeat: clip.startBeat + n * 4 });
      }
    });
  };
  // Länge des Musters: ein Knopf, der zwischen 1 Takt und 2 Takten wechselt (wie „Muster“)
  const barsBtn = btn(K.grund, '1 Takt', 'kb-bars', () => setBars(patNow()?.bars === 1 ? 2 : 1));
  barsBtn.title = 'Wechselt zwischen 1 Takt und 2 Takten';
  const sw = row(K.grund, 'Swing');
  const swIn = range(sw.r, 'kb-swing', 0, SWING_OPTIONS.length - 1, 1);
  swIn.setAttribute('aria-label', 'Swing');
  swIn.addEventListener('input', () => { const v = SWING_OPTIONS[Number(swIn.value)].value; store.updatePattern(cur.pid, (q) => { q.swing = v; }, `kb-swing-${cur.pid}`); });
  const grooveBtn = btn(K.grund, 'Muster', 'kb-groove', () => {
    const pat = patNow();
    if (!pat) return;
    store.setGroove(cur.pid, pat.groove ? nextGroove(pat.groove) : 'gerade');
  });
  grooveBtn.title = 'Wechselt das Muster (Gerade, Halb, Breaks) und ersetzt die Schritte';
  const placeKitBtn = btn(K.grund, 'Auf die Spur', 'kb-place-kit', () => {
    const kit = kitNow();
    if (!kit || cur.clip) return;
    const at = placeBeat();
    const res = store.placeKit(cur.id, { atBeat: at });
    if (!res) { ui.flash('Keine freie Spur für das Kit.'); return; }
    ui.select(res.clipId);
    if (!engine.playing) engine.play(at);
  });
  // --- Kit: Feinheiten ---
  const velRow = row(K.fine, 'Anschlag des Schritts');
  const velIn = range(velRow.r, 'kb-vel', 5, 100, 1);
  velIn.setAttribute('aria-label', 'Anschlag des gewählten Schritts');
  velIn.addEventListener('input', () => {
    if (!cur?.pid || !stepVal(selStep)) return;
    const row_ = sel, i = selStep, v = Number(velIn.value) / 100;
    store.updatePattern(cur.pid, (q) => { q.rows = resizeDrumRows(q.rows, q.bars); q.rows[row_][i] = v; }, `kb-vel-${cur.pid}-${row_}-${i}`);
  });
  const snapRow = el('div', 'insp-row wb-row wb-count-row');
  snapRow.append(el('span', null, 'Einrasten'));
  const snapSeg = el('div', 'wb-seg');
  snapSeg.setAttribute('role', 'group');
  snapSeg.setAttribute('aria-label', 'Einrasten beim Aufnehmen');
  snapRow.append(snapSeg);
  K.fine.append(snapRow);
  const snapBtns = [16, 8].map((n) => toggleBtn(snapSeg, `1/${n}`, `kb-snap-${n}`, () => { snap = n; write(SNAP_KEY, n); syncAll(); }));
  const renRow = el('label', 'insp-row wb-row');
  renRow.append(el('span', null, 'Kit umbenennen'));
  const renIn = document.createElement('input');
  Object.assign(renIn, { type: 'text', id: 'kb-rename', maxLength: 30 });
  renIn.setAttribute('aria-label', 'Name des Kits');
  renIn.addEventListener('change', () => setName(renIn.value));
  renIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') renIn.blur(); });
  renRow.append(renIn);
  K.fine.append(renRow);
  const clearBtn = btn(K.fine, 'Pad leeren', 'kb-pad-clear', () => { if (cur?.kind === 'kit') store.setKitPad(cur.id, sel, null); });

  // --- Instrument ---
  const I = panels.inst;
  const octS = stepper(I.grund, 'Oktave', ['kb-oct-minus', 'kb-oct-plus', 'kb-oct'], (d) => { oct = clamp(oct + d, -2, 2); write(OCT_KEY, oct); syncAll(); }, ['Eine Oktave tiefer', 'Eine Oktave höher']);
  const rel = row(I.grund, 'Ausklang');
  const relIn = range(rel.r, 'kb-release', 0, 2, 0.05);
  relIn.setAttribute('aria-label', 'Ausklang');
  relIn.addEventListener('input', () => { if (cur) store.setInstrument(cur.id, { release: Number(relIn.value) }, { coalesce: `kb-rel-${cur.id}` }); });
  const placeInstBtn = btn(I.grund, 'Auf die Spur', 'kb-place-inst', () => {
    if (!instNow() || cur.clip) return;
    const res = store.placeInstrument(cur.id, { atBeat: placeBeat(), bars: 1 });
    if (!res) { ui.flash('Keine freie Spur für das Instrument.'); return; }
    ui.select(res.clipId);
  });
  const rollBtn = btn(I.grund, 'Rolle ▸', 'kb-roll', () => { if (cur?.clip) tools.edit(); });
  rollBtn.title = 'Öffnet die Melodie-Rolle, um Töne zu setzen';
  const rootS = stepper(I.fine, 'Grundton', ['kb-root-minus', 'kb-root-plus', 'kb-root'], (d) => { const inst = instNow(); if (inst) store.setInstrument(cur.id, { root: clamp(inst.root + d, 36, 96) }, { coalesce: `kb-root-${cur.id}` }); }, ['Einen Halbton tiefer', 'Einen Halbton höher']);
  const cents = row(I.fine, 'Feinstimmung');
  const centsIn = range(cents.r, 'kb-cents', -50, 50, 1);
  centsIn.setAttribute('aria-label', 'Feinstimmung');
  centsIn.addEventListener('input', () => { if (cur) store.setInstrument(cur.id, { cents: Number(centsIn.value) }, { coalesce: `kb-cents-${cur.id}` }); });
  const scaleRow = el('div', 'insp-row wb-row wb-count-row');
  scaleRow.append(el('span', null, 'Tonleiter'));
  const scaleSeg = el('div', 'wb-seg');
  scaleSeg.setAttribute('role', 'group');
  scaleSeg.setAttribute('aria-label', 'Tonleiter der Tasten');
  scaleRow.append(scaleSeg);
  I.fine.append(scaleRow);
  const scaleBtns = ['minor', 'major'].map((k) => toggleBtn(scaleSeg, SCALES[k].label, `kb-scale-${k}`, () => { scale = k; write(SCALE_KEY, k); syncAll(); }));

  // --- Clip ---
  const C = panels.clip;
  const cslider = (parent, label, id, min, max, step, get, set, fmt, key) => {
    const r = row(parent, label);
    const input = range(r.r, id, min, max, step);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { const c = cur?.clip; if (c) set(c, Number(input.value), `${key}-${c.id}`); });
    updaters.push(() => {
      const c = cur?.clip;
      if (!c) return;
      if (id !== 'kb-clip-gain') input.max = String(c.lengthBeats);
      const v = get(c);
      setVal(input, v);
      r.out.textContent = fmt(v);
    });
  };
  cslider(C.grund, 'Clip-Lautstärke', 'kb-clip-gain', 0, 1, 0.01, (c) => clipGain(c), (c, v, k) => store.setClip(c.id, { gain: v }, k), (v) => `${Math.round(v * 100)} %`, 'kb-gain');
  cslider(C.grund, 'Einblenden', 'kb-clip-in', 0, 4, 0.25, (c) => c.fadeInBeats || 0, (c, v, k) => store.setClip(c.id, { fadeInBeats: clamp(v, 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, k), fmtBeats, 'kb-in');
  cslider(C.grund, 'Ausblenden', 'kb-clip-out', 0, 4, 0.25, (c) => c.fadeOutBeats || 0, (c, v, k) => store.setClip(c.id, { fadeOutBeats: clamp(v, 0, c.lengthBeats - (c.fadeInBeats || 0)) }, k), fmtBeats, 'kb-out');
  const muteBtn = toggleBtn(C.fine, 'Stumm', 'kb-clip-mute', () => { const c = cur?.clip; if (c) store.setClip(c.id, { mute: !c.mute }); });

  // ---------- Anzeige ----------
  function syncTabs() {
    const kit = cur?.kind === 'kit';
    tabBtns.kit.hidden = !kit;
    tabBtns.inst.hidden = kit || !cur;
    tabBtns.clip.hidden = !cur?.clip;
    const main = kit ? 'kit' : 'inst';
    if (tab === 'clip' ? !cur?.clip : tab !== main) tab = main;
    for (const [id] of TABS) {
      const on = id === tab && !tabBtns[id].hidden;
      tabBtns[id].setAttribute('aria-selected', String(on));
      tabBtns[id].tabIndex = on ? 0 : -1;
      panels[id].p.hidden = !on;
    }
    tabs.hidden = [...Object.values(tabBtns)].filter((b) => !b.hidden).length < 2;
  }
  function syncPads() {
    const kit = kitNow();
    padEls.forEach((b, i) => {
      const row_ = PAD_IDS[i];
      const sid = kit?.map[row_];
      const s = sid ? library.get(sid) : null;
      b.className = `kb-pad${s ? ` full cat-${s.colorCat ?? s.category ?? 'own'}` : sid ? ' full missing' : ' free'}${b.classList.contains('hit') ? ' hit' : ''}${b.classList.contains('rec') ? ' rec' : ''}`;
      b.querySelector('.kb-pad-name').textContent = s ? s.name : sid ? 'fehlt' : '';
      b.setAttribute('aria-pressed', String(row_ === sel));
      b.setAttribute('aria-label', `${DRUM_ROWS[i].label}${s ? `: ${s.name}` : ', leer – antippen und ins Mikro machen'} (Taste ${PAD_KEYS[i].toUpperCase()})`);
    });
  }
  function syncSteps() {
    const pat = patNow();
    const show = cur?.kind === 'kit' && !!pat;
    stepsBox.hidden = !show;
    if (!show) return;
    const n = pat.bars * STEPS_PER_BAR;
    const s = library.get(kitNow()?.map[sel]);
    stepsBox.className = `kb-steps cat-${s?.colorCat ?? s?.category ?? 'own'}`;
    stepRows[1].hidden = pat.bars < 2;
    cells.forEach((c, i) => {
      const v = Number(pat.rows?.[sel]?.[i]) || 0;
      c.hidden = i >= n;
      c.setAttribute('aria-selected', String(v > 0));
      c.classList.toggle('half', v > 0 && v < 0.95);
      c.setAttribute('aria-label', `Schritt ${i + 1}, ${v > 0 ? (v < 0.95 ? `an, ${Math.round(v * 100)} %` : 'an') : 'aus'}`);
    });
    stepsBox.setAttribute('aria-label', `Schritte: ${DRUM_ROWS[PAD_IDS.indexOf(sel)].label}`);
    selStep = Math.min(selStep, n - 1);
  }
  function syncVel() {
    const v = stepVal(selStep);
    setVal(velIn, Math.round(v * 100) || 100);
    velIn.disabled = !(cur?.kind === 'kit' && cur.pid && v > 0);
    velRow.out.textContent = v > 0 ? `${Math.round(v * 100)} %` : 'aus';
  }
  function syncKeys() {
    const inst = instNow();
    if (!inst) return;
    const ps = pitches();
    keyEls.forEach((b, i) => {
      b.querySelector('.kb-key-note').textContent = noteName(ps[i]);
      b.classList.toggle('root', ps[i] % 12 === inst.root % 12);
      b.setAttribute('aria-label', `Stufe ${i + 1}: ${noteName(ps[i])}${ps[i] % 12 === inst.root % 12 ? ', Grundton' : ''}`);
    });
  }
  function syncAll() {
    if (!cur) return;
    const kit = cur.kind === 'kit';
    const pat = patNow();
    root.className = `wb kb cat-${kit ? 'drums' : 'synth'} kb-${cur.kind}${root.classList.contains('wall') ? ' wall' : ''}${recOn ? ' recording' : ''}`;
    pads.hidden = !kit;
    keys.hidden = kit;
    if (nameIn.hidden) nameBtn.textContent = kitNow()?.name ?? instNow()?.name ?? '';
    const n = store.project.tracks.flatMap((t) => t.clips).filter((c) => { const p = patOf(store.project, c).pat; return p && (kit ? p.kit === cur.id : p.preset === cur.id); }).length;
    count.textContent = `in ${n} ${n === 1 ? 'Clip' : 'Clips'}`;
    syncTabs();
    if (kit) {
      syncPads();
      syncSteps();
      syncVel();
      barsBtn.hidden = !pat;
      barsBtn.textContent = pat?.bars === 2 ? '2 Takte' : '1 Takt';
      sw.r.hidden = !pat;
      if (pat) {
        const sv = swingOf(pat);
        const idx = SWING_OPTIONS.reduce((a, b, i) => (Math.abs(b.value - sv) < Math.abs(SWING_OPTIONS[a].value - sv) ? i : a), 0);
        setVal(swIn, idx);
        sw.out.textContent = SWING_OPTIONS[idx].label;
      }
      grooveBtn.hidden = !pat;
      grooveBtn.textContent = pat?.groove ? `Muster: ${grooveOf(pat.groove).label}` : 'Muster';
      placeKitBtn.hidden = !!cur.clip;
      velRow.r.hidden = !pat;
      snapRow.hidden = !pat;
      snapBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(snap === [16, 8][i])));
      setVal(renIn, kitNow()?.name ?? '');
      clearBtn.disabled = !kitNow()?.map[sel];
    } else {
      stepsBox.hidden = true;
      syncKeys();
      const inst = instNow();
      octS.out.textContent = oct > 0 ? `+${oct}` : oct < 0 ? `−${-oct}` : '0';
      octS.minus.disabled = oct <= -2;
      octS.plus.disabled = oct >= 2;
      setVal(relIn, inst.release);
      rel.out.textContent = `${comma(inst.release, 2)} s`;
      placeInstBtn.hidden = !!cur.clip;
      rollBtn.hidden = !cur.clip;
      rootS.out.textContent = noteName(inst.root);
      rootS.minus.disabled = inst.root <= 36;
      rootS.plus.disabled = inst.root >= 96;
      setVal(centsIn, inst.cents);
      cents.out.textContent = `${inst.cents > 0 ? '+' : inst.cents < 0 ? '−' : ''}${Math.abs(inst.cents)} Cent`;
      scaleBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(scale === ['minor', 'major'][i])));
    }
    muteBtn.setAttribute('aria-pressed', String(!!cur.clip?.mute));
    for (const fn of updaters) fn();
  }

  // Pad-Wand (nur Kit): Handy = Schublade ganz oben, Desktop = ⤢ (breite Werkbank); Grund klappt zu, Pads werden groß
  const werk = document.getElementById('werkbank');
  const arrEl = document.querySelector('.arranger');
  function sizeWall() {
    const on = cur?.kind === 'kit' && (narrow.matches
      ? !!werk && !werk.hidden && !!arrEl && werk.getBoundingClientRect().height >= arrEl.getBoundingClientRect().height * 0.9
      : app.classList.contains('wb-wide'));
    if (root.classList.contains('wall') !== on) root.classList.toggle('wall', on);
  }
  if (werk && typeof ResizeObserver === 'function') new ResizeObserver(sizeWall).observe(werk);
  new MutationObserver(sizeWall).observe(app, { attributes: true, attributeFilter: ['class'] });
  narrow.addEventListener('change', sizeWall);

  // ---------- ● Pads/Tasten aufnehmen ----------
  const recContext = () => (cur?.clip && !root.hidden ? (cur.kind === 'kit' ? 'pads' : 'keys') : null);
  function stopRec() { if (!recOn) return; recOn = false; root.classList.remove('recording'); ui.emit(); }
  function toggleRec() {
    if (recOn) { stopRec(); ui.flash('Aufnahme beendet.'); return; }
    if (!recContext()) return;
    recOn = true;
    pass++;
    root.classList.add('recording');
    if (!engine.playing) {
      const l = store.project.loop;
      engine.play(l.on ? l.startBeat : cur.clip.startBeat);
    }
    ui.flash(cur.kind === 'kit' ? 'Pads nehmen auf – ● beendet.' : 'Tasten nehmen auf – ● beendet.');
    ui.emit();
  }
  engine.on((what) => { if (what === 'state' && !engine.playing) stopRec(); });

  // Mikrofon-Aufnahme in ein leeres Pad: rote Form am Pad, Ring atmet mit dem Pegel
  recorder?.on((what, p) => {
    const padRow = recorder.tag?.kind === 'pad' ? recorder.tag.row : null;
    padEls.forEach((b) => {
      const on = padRow === b.dataset.row && (recorder.state === 'recording' || recorder.state === 'arming');
      if (b.classList.contains('rec') !== on) { b.classList.toggle('rec', on); if (!on) b.style.removeProperty('--lvl'); }
    });
    if (what === 'level' && padRow) padEls[PAD_IDS.indexOf(padRow)]?.style.setProperty('--lvl', String(Math.min(1, Math.sqrt(p) * 1.4).toFixed(2)));
  });

  // Computertastatur: A S D F J K L Ö spielen die Pads (nur, solange das Kit offen ist und nichts getippt wird)
  document.addEventListener('keydown', (e) => {
    if (root.hidden || cur?.kind !== 'kit' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
    const i = PAD_KEYS.indexOf(e.key.toLowerCase());
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    hit(PAD_IDS[i], padEls[i]);
  }, true);

  function render() {
    const t = targetOf();
    if (!t) {
      if (cur) { cur = null; stopRec(); sizeWall(); }
      root.hidden = true;
      for (const [id] of TABS) panels[id].p.hidden = true;
      rec?.sync?.();
      return false;
    }
    if (!cur || cur.id !== t.id || cur.kind !== t.kind || cur.clip?.id !== t.clip?.id) {
      if (cur && recOn) stopRec();
      if (!cur || cur.id !== t.id || cur.kind !== t.kind) { sel = PAD_IDS.find((r) => kitOf(store.project, t.id)?.map[r]) ?? 'kick'; selStep = 0; if (!nameIn.hidden) rename(false); }
    }
    cur = t;
    root.hidden = false;
    syncAll();
    sizeWall();
    rec?.sync?.(); // ● nennt die Quelle (Pads, Tasten), sobald die Werkbank steht
    return true;
  }

  return { render, root, recContext, toggleRec, get recording() { return recOn; }, get label() { return recContext() === 'pads' ? 'Pads' : recContext() === 'keys' ? 'Tasten' : null; } };
}
