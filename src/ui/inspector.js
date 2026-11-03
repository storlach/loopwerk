// Inspektor (Desktop, rechts): zeigt immer das Ausgewählte.
// Clip → Abschnitt „CLIP · Name“ (Clip-Lautstärke, Ein-/Ausblenden, Werkzeuge), darunter getrennt „SPUR · Name“
// (Spur-Lautstärke, Panorama, Verlauf, Effekte). Spur → nur der Spur-Abschnitt.
// Nichts → Song: Tempo, Tonart, Länge, Master und Master-Effekte. Effekte haben damit genau einen Ort.

import { EFFECTS, EFFECT_IDS, withFx, fxOrderOf, BUSES, busOf, sendOf, busParamDef } from '../effects.js';
import { applyOrder, mountFxDrag, orderText, resetLink } from './fx-order.js';
import { clipGain, gainToSlider, sliderToGain, GAIN_SLIDER_MAX, MIN_BPM, MAX_BPM, keyChangesOf } from '../model.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatCurve, formatDb } from './arranger.js';
import { formatParam } from './mixer.js';
import { narrow } from './place.js';
import { place } from './place.js';
import { bindKeySelect } from './key-select.js';
import { hasOwnTempo, soundBpm, fmtBpm, setSoundBpm as setSoundBpmOf, useAsSongTempo } from './sound-tempo.js';
import { mountSoundKey } from './sound-key.js';
import { mountMasteringControls } from './mastering.js';
import { mountClipSpeed } from './clip-speed.js';
import { mountTakeRow } from './take-row.js';
import { autoLock, lockedValue, templateControls, MASTER_TEMPLATES } from './auto-lane.js';
import { AUTO_PARAMS, autoKeys, busUsed, isAutomated, laneOf, sendKey } from '../automation.js';
import { lsKey } from '../edition.js';

// Laufzeit-Stufen für − und +
const RUN_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export function stepRun(f, dir) {
  if (dir > 0) return RUN_STEPS.find((x) => x > f + 1e-6) ?? 4;
  return [...RUN_STEPS].reverse().find((x) => x < f - 1e-6) ?? 0.25;
}

const fmtBeats = (b) => (b <= 0 ? 'aus' : `${String(Math.round(b * 100) / 100).replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`);
const MASTER = '__master';

// Kurzbeschreibung eines eingeschalteten Effekts (die ein, zwei wichtigsten Werte)
function fxSummary(e, f) {
  if (!f.on) return 'aus';
  const parts = [];
  for (const [k, p] of Object.entries(e.params).slice(0, 2)) {
    parts.push(p.options ? p.options.find((o) => o.id === f[k])?.label ?? f[k] : formatParam(p, f[k]));
  }
  return parts.join(', ');
}

// Optionen (Krachwerk, Spec Scheibe 2a §6): clipPanel(container, deps) ersetzt den Clip-Abschnitt (Sound-Werkbank);
// trackOnClip: false = die Spur zeigt sich nur bei eigener Spurwahl; fxCompact = nur eingeschaltete Effekte und „+ Effekt“
export function mountInspector({ root, store, ui, library, tools, engine, mastering, clipPanel = null, trackOnClip = true, fxCompact = false }) {
  const app = document.getElementById('app');
  root.innerHTML = '';

  // Dichte „calm“ (Werkbank): Desktop rechts, ohne Auswahl eingeklappt; Handy als Schublade #werkbank
  const calm = app.dataset.density === 'calm';
  let pinned = false; // Song zeigen, obwohl nichts gewählt ist (Klick auf den Streifen)
  const WIDE_KEY = lsKey('loopwerk.wbWide');
  place(root, { calm: { narrow: document.getElementById('werkbank-body') } });

  // Eingeklappt (kleinere Laptops): senkrechter Knopf, klappt über den Arranger auf
  const toggle = el('button', 'insp-toggle', calm ? 'Werkbank' : 'Eigenschaften');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    if (!calm) { app.classList.toggle('insp-open'); return; }
    // Offen: schließen (Auswahl aufheben); zu: den Song zeigen
    pinned = !app.classList.contains('insp-open');
    if (!pinned) { ui.select(null); ui.selectTrack(null); ui.openSound?.(null); }
    render();
  });
  root.append(toggle);
  if (calm) {
    const wide = el('button', 'insp-wide', '⤢');
    wide.type = 'button';
    wide.id = 'wb-wide';
    wide.title = 'Werkbank breiter oder schmaler';
    wide.setAttribute('aria-label', 'Werkbank breiter');
    const setWide = (on) => { app.classList.toggle('wb-wide', on); wide.setAttribute('aria-pressed', String(on)); wide.setAttribute('aria-label', on ? 'Werkbank schmaler' : 'Werkbank breiter'); };
    try { setWide(localStorage.getItem(WIDE_KEY) === '1'); } catch { setWide(false); }
    wide.addEventListener('click', () => {
      const on = !app.classList.contains('wb-wide');
      setWide(on);
      try { localStorage.setItem(WIDE_KEY, on ? '1' : '0'); } catch { /* egal */ }
    });
    root.append(wide);
  }

  // ---------- Clip ----------
  // Zwei klar getrennte Abschnitte: „CLIP · Name“ (gilt nur für diesen Clip) und „SPUR · Name“ (gilt für alle Clips der Spur)
  const clipSec = el('section', 'insp-sec insp-clip');
  clipSec.setAttribute('aria-label', 'Clip-Einstellungen');
  const clipHead = el('header', 'insp-head');
  const clipTitle = el('h2', 'insp-title');
  const clipSw = el('span', 'swatch');
  const clipName = el('span');
  clipTitle.append(el('span', 'insp-kind', 'Clip'), el('span', 'insp-sep', '·'), clipSw, clipName);
  const clipMeta = el('p', 'insp-meta');
  clipHead.append(clipTitle, clipMeta);
  const slider = (label, id, min, max, step) => {
    const row = el('label', 'insp-row');
    const out = el('output');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), id });
    row.append(el('span', null, label), out, input);
    return { row, input, out };
  };
  const gain = slider('Clip-Lautstärke', 'insp-gain', 0, 1, 0.01);
  const fin = slider('Einblenden', 'insp-fadein', 0, 4, 0.25);
  const fout = slider('Ausblenden', 'insp-fadeout', 0, 4, 0.25);
  // Krümmung der Fades (wie der Bézier-Griff am Clip); nur sichtbar, wenn es den Fade gibt
  const cin = slider('Kurve', 'insp-curvein', -1, 1, 0.05);
  const cout = slider('Kurve', 'insp-curveout', -1, 1, 0.05);
  for (const c of [cin, cout]) c.row.classList.add('insp-sub-row');
  // Geschwindigkeit (früher „Laufzeit“): Regler 50–200 % und „wie Tonband“, eigenes Modul
  const run = el('div', 'insp-clip-speed');
  if (!clipPanel) mountClipSpeed(run, { store, ui, library, engine });
  const speedSlot = run;
  // Tempo des Sounds: wie schnell die Aufnahme ist. Mit Tempo wird ein Einzelklang zum Loop, der sich dem Song anpasst.
  const stempo = el('div', 'insp-row insp-stempo');
  const stOut = el('output');
  stOut.id = 'insp-stempo-out';
  const stBtns = el('div', 'insp-run-btns');
  const stIn = document.createElement('input');
  Object.assign(stIn, { type: 'number', id: 'insp-stempo', min: '20', max: '400', step: '0.1', inputMode: 'decimal', placeholder: '–' });
  stIn.setAttribute('aria-label', 'Tempo des Sounds (BPM)');
  const selSample = () => { const c = selClip(); return c ? library.get(c.sampleId) : null; };
  const setSoundBpm = (bpm) => setSoundBpmOf(store, selSample(), bpm);
  stIn.addEventListener('change', () => setSoundBpm(Number(String(stIn.value).replace(',', '.'))));
  stIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') stIn.blur(); });
  const stBtn = (label, title, fn) => { const b = el('button', 'key', label); b.type = 'button'; b.title = title; b.addEventListener('click', fn); stBtns.append(b); return b; };
  stBtn('÷2', 'Halbes Tempo (Aufnahme zählt doppelt so viele Schläge)', () => { const v = soundBpm(selSample()); if (v) setSoundBpm(v / 2); }).id = 'insp-stempo-half';
  stBtn('×2', 'Doppeltes Tempo', () => { const v = soundBpm(selSample()); if (v) setSoundBpm(v * 2); }).id = 'insp-stempo-double';
  const stSong = stBtn('Als Song-Tempo', 'Song-Tempo auf das Tempo dieses Sounds setzen', () => useAsSongTempo(store, selSample()));
  stSong.id = 'insp-stempo-song';
  stSong.classList.add('wide');
  const stReset = stBtn('Wie geliefert', 'Eigenes Tempo für diesen Sound entfernen', () => { const smp = selSample(); if (smp) store.setSampleTempo(smp.id, null); });
  stReset.id = 'insp-stempo-reset';
  stReset.classList.add('wide');
  stempo.append(el('span', null, 'Sound-Tempo'), stOut, stIn, stBtns);
  const btns = el('div', 'insp-btns');
  btns.id = 'insp-clip-btns';
  // Tonart eigener Sounds (erkannt oder gewählt) und „Folgt Song“
  const skey = mountSoundKey({ store, prefix: 'insp', className: 'insp-row insp-skey' });
  // Mit clipPanel (Sound-Werkbank) entfällt der alte Clip-Abschnitt ganz; Teilen/Kopie/Löschen sind Werkzeug am Clip
  const panel = clipPanel ? clipPanel(clipSec, { store, ui, library, engine, tools }) : null;
  // Takes einer Loop-Aufnahme (2.13): 1 2 3 ×, nur bei Take-Clips
  const takeRow = mountTakeRow({ store, library, ui });
  if (!panel) clipSec.append(clipHead, takeRow.row, gain.row, fin.row, cin.row, fout.row, cout.row, speedSlot, stempo, skey.row, btns);

  const selClip = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);
  gain.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { gain: sliderToGain(Number(gain.input.value)) }, 'insp-gain-' + c.id); });
  fin.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeInBeats: clamp(Number(fin.input.value), 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, 'insp-in-' + c.id); });
  fout.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeOutBeats: clamp(Number(fout.input.value), 0, c.lengthBeats - (c.fadeInBeats || 0)) }, 'insp-out-' + c.id); });
  for (const [r, key] of [[cin, 'fadeInCurve'], [cout, 'fadeOutCurve']]) {
    r.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { [key]: Number(r.input.value) }, `insp-${key}-${c.id}`); });
    r.input.addEventListener('dblclick', () => { const c = selClip(); if (c) store.setClip(c.id, { [key]: 0 }); });
  }

  // Die Clip-Knöpfe (Bearbeiten, Teilen, Duplizieren, Löschen) ziehen vom Deck hierher
  const clipGroup = document.querySelector('.deck .group[aria-label="Clip"]');
  if (!panel) for (const id of ['edit-btn', 'split-btn', 'dup-btn', 'del-btn']) place(document.getElementById(id), { wide: btns, calm: id === 'edit-btn' ? { narrow: btns } : null });
  void clipGroup;

  // ---------- Spur ----------
  const trackSec = el('section', 'insp-sec insp-track');
  trackSec.setAttribute('aria-label', 'Spur-Einstellungen');
  const trackHead = el('header', 'insp-head');
  const trackTitle = el('h2', 'insp-title');
  const trackName = el('span');
  // Spur-Einstellungen neutral, ohne Farbe – die Clip-Farbe gehört nur dem Clip-Abschnitt
  trackTitle.append(el('span', 'insp-kind', 'Spur'), el('span', 'insp-sep', '·'), trackName);
  const trackSub = el('p', 'insp-meta');
  trackHead.append(trackTitle, trackSub);
  const vol = slider('Spur-Lautstärke', 'insp-vol', 0, 1, 0.01);
  const volLabel = vol.row.firstChild;
  const pan = slider('Panorama', 'insp-pan', -1, 1, 0.05);
  // Panorama mit Kurve: gedimmt, folgt der Kurve; Klick öffnet die Kurvenzeile
  const panBox = el('div', 'insp-pan-box');
  panBox.append(pan.row);
  const panLock = autoLock({ ui, key: 'pan', wrap: panBox, input: pan.input, getTrackId: () => (trackId && trackId !== MASTER ? trackId : null) });
  let follow = 0;
  const mixerLink = el('button', 'insp-link', 'Alle Spuren im Mixer vergleichen →');
  mixerLink.type = 'button';
  mixerLink.addEventListener('click', () => ui.setDock('mixer'));
  // Verlauf: Ein-/Ausblenden der Spur als Kurve, ohne Zeichnen (Automation)
  const autoBlock = el('div', 'insp-auto');
  const tpl = templateControls({ store, ui, engine, getTarget: () => (trackId === MASTER ? null : trackId) });
  const curveBtn = el('button', 'insp-link', 'Kurve zeigen');
  curveBtn.type = 'button';
  curveBtn.id = 'insp-auto-toggle';
  curveBtn.addEventListener('click', () => { if (trackId && trackId !== MASTER) ui.autoLane?.toggle(trackId); });
  autoBlock.append(el('span', 'insp-kind', 'Verlauf'), tpl.node, curveBtn);
  // Kompakt: Verlauf und Kurven erst unter „Feinheiten“
  let autoOpen = false;
  const fineBtn = el('button', 'wb-fine-btn', 'Feinheiten');
  fineBtn.type = 'button';
  fineBtn.id = 'insp-fine';
  fineBtn.setAttribute('aria-expanded', 'false');
  fineBtn.hidden = !fxCompact;
  fineBtn.addEventListener('click', () => { autoOpen = !autoOpen; render(); });
  trackSec.append(trackHead, vol.row, panBox, fineBtn, autoBlock);
  // Stumm und Solo der Spur (in „calm“ am Handy nicht mehr im Spurkopf)
  let msBtns = null;
  if (calm) {
    const ms = el('div', 'insp-ms');
    msBtns = ['mute', 'solo'].map((k) => {
      const b = el('button', 'key', k === 'mute' ? 'M' : 'S');
      b.type = 'button';
      b.id = `insp-${k}`;
      b.title = k === 'mute' ? 'Spur stumm schalten' : 'Spur solo hören';
      b.setAttribute('aria-label', k === 'mute' ? 'Stumm' : 'Solo');
      b.addEventListener('click', () => { const t = store.track(trackId); if (t && trackId !== MASTER) store.setTrack(t.id, { [k]: !t[k] }); });
      ms.append(b);
      return [k, b];
    });
    trackSec.insertBefore(ms, vol.row);
  }

  let trackId = null; // Spur, deren Einstellungen gerade gezeigt werden
  vol.input.addEventListener('input', () => {
    if (trackId === MASTER) store.setMaster({ volume: Number(vol.input.value) }, 'master-vol');
    else if (trackId) store.setTrack(trackId, { volume: Number(vol.input.value) }, 'vol-' + trackId);
  });
  pan.input.addEventListener('input', () => { if (trackId && trackId !== MASTER) store.setTrack(trackId, { pan: Number(pan.input.value) }, 'pan-' + trackId); });
  pan.input.addEventListener('dblclick', () => { if (trackId && trackId !== MASTER) store.setTrack(trackId, { pan: 0 }); });

  // ---------- Effekte: eine Liste, die der gezeigten Spur (oder dem Master) folgt ----------
  const fxl = el('div', 'fxl');
  const fxOf = () => (trackId === MASTER ? withFx(masterOf(store.project).fx) : withFx(store.track(trackId)?.fx));
  const setFx = (fxId, patch, key) => (trackId === MASTER ? store.setMasterFx(fxId, patch, key) : store.setTrackFx(trackId, fxId, patch, key));
  const items = new Map();
  for (const e of EFFECTS) {
    const item = el('div', 'fxl-item');
    const head = el('div', 'fxl-head');
    const sw = el('button', 'fxl-switch');
    sw.type = 'button';
    sw.setAttribute('aria-label', `${e.label} ein/aus`);
    sw.addEventListener('click', () => setFx(e.id, { on: !fxOf()[e.id].on }));
    // Alt+↑/↓: einen Platz weiter (wie Alt+Pfeil bei Clips)
    sw.addEventListener('keydown', (ev) => {
      if (!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
      ev.preventDefault();
      ev.stopPropagation();
      fxDrag.step(e.id, ev.key === 'ArrowUp' ? -1 : 1);
    });
    const name = el('span', 'fxl-name', e.label);
    name.addEventListener('click', () => sw.click());
    const sum = el('span', 'fxl-sum');
    head.append(sw, name, sum);
    const params = el('div', 'fxl-params');
    const ctl = new Map();
    for (const [k, p] of Object.entries(e.params)) {
      const row = el('label', 'fx-param');
      let input;
      let out = null;
      if (p.options) {
        input = document.createElement('select');
        for (const o of p.options) { const op = el('option', null, o.label); op.value = o.id; input.append(op); }
        input.addEventListener('change', () => setFx(e.id, { [k]: input.value, on: true }));
      } else {
        input = document.createElement('input');
        Object.assign(input, { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step) });
        input.addEventListener('input', () => setFx(e.id, { [k]: clamp(Number(input.value), p.min, p.max), on: true }, `fx-${trackId}-${e.id}-${k}`));
        input.addEventListener('dblclick', () => setFx(e.id, { [k]: p.default }));
        out = el('span', 'fx-param-value');
      }
      row.append(el('span', 'fx-param-label', p.label), input);
      if (out) row.append(out);
      // Effekt-Wert mit Kurve (Filter-Frequenz, Anteile): gedimmt, folgt der Kurve, Klick öffnet die Kurvenzeile
      const key = `${e.id}.${k}`;
      let lock = null;
      if (AUTO_PARAMS[key]?.fx) {
        const box = el('div', 'fx-param-box');
        box.append(row);
        lock = autoLock({ ui, key, wrap: box, input, getTrackId: () => (trackId === MASTER ? 'master' : trackId) });
        params.append(box);
      } else params.append(row);
      ctl.set(k, { input, out, key, lock });
    }
    item.append(head, params);
    fxl.append(item);
    items.set(e.id, { item, sw, sum, ctl });
  }
  // Reihenfolge: oben ist der Eingang; am Namen ziehen ordnet um (ADR 008)
  const fxOwner = () => (trackId === MASTER ? masterOf(store.project) : store.track(trackId));
  const fxTarget = () => (trackId === MASTER ? 'master' : trackId);
  const fxDrag = mountFxDrag(fxl, {
    ids: EFFECT_IDS,
    itemOf: (id) => items.get(id).item,
    handleOf: (id) => items.get(id).item.querySelector('.fxl-name'),
    getOrder: () => fxOrderOf(fxOwner()),
    onMove: (id, to) => {
      if (!trackId) return;
      store.moveFx(fxTarget(), id, to);
      const order = fxOrderOf(fxOwner());
      ui.flash?.(orderText(order, id, order.filter((x) => !items.get(x).item.hidden)));
    },
  });
  const fxReset = resetLink(() => { if (trackId) store.resetFxOrder(fxTarget()); });
  fxReset.node.id = 'insp-fx-reset';

  // Busse der Spur (hinter Fader und Panorama abgegriffen): je ein Anteil zum Hall- und Echo-Bus, 0 = aus
  const busBlock = el('div', 'insp-buses');
  busBlock.append(el('span', 'insp-kind', 'Busse'));
  const sendRows = BUSES.map((b) => {
    const r = slider(`→ ${b.label}`, `insp-send-${b.id}`, 0, 1, 0.01);
    r.input.title = `Anteil zum ${b.label} (Doppelklick = aus)`;
    r.input.addEventListener('input', () => { if (trackId && trackId !== MASTER) store.setSend(trackId, b.id, Number(r.input.value), `send-${trackId}-${b.id}`); });
    // Doppelklick = aus; der Regler hat dann den Fokus, also den Wert selbst setzen
    r.input.addEventListener('dblclick', () => { if (trackId && trackId !== MASTER) { r.input.value = '0'; store.setSend(trackId, b.id, 0); } });
    // Send mit Kurve: gedimmt, folgt der Kurve, Klick öffnet die Kurvenzeile (wie die Effekt-Werte)
    const box = el('div', 'insp-send-box');
    box.append(r.row);
    const lock = autoLock({ ui, key: sendKey(b.id), wrap: box, input: r.input, getTrackId: () => (trackId && trackId !== MASTER ? trackId : null) });
    busBlock.append(box);
    return [b, r, lock];
  });
  const sendText = (v) => (v > 0 ? `${Math.round(v * 100)} %` : 'aus');

  // Kompakt (Krachwerk): nur eingeschaltete Effekte, die übrigen über „+ Effekt“
  const addFx = el('button', 'wb-fine-btn', '+ Effekt');
  addFx.type = 'button';
  addFx.id = 'insp-add-fx';
  addFx.setAttribute('aria-expanded', 'false');
  const fxPick = el('div', 'wb-fx-pick');
  fxPick.hidden = true;
  for (const e of EFFECTS) {
    const b = el('button', 'wb-btn', e.label);
    b.type = 'button';
    b.dataset.fx = e.id;
    b.addEventListener('click', () => { setFx(e.id, { on: true }); fxPick.hidden = true; addFx.setAttribute('aria-expanded', 'false'); });
    fxPick.append(b);
  }
  addFx.addEventListener('click', () => { fxPick.hidden = !fxPick.hidden; addFx.setAttribute('aria-expanded', String(!fxPick.hidden)); });
  // IDs (für Tastatur-Fokus und Tests) gibt es nur einmal: am Desktop hier, am Handy im Mixer-Detail
  function syncIds() {
    for (const e of EFFECTS) {
      const it = items.get(e.id);
      it.sw.id = narrow.matches ? '' : `fx-${e.id}-on`;
      for (const [k, c] of it.ctl) c.input.id = narrow.matches ? '' : `fx-${e.id}-${k}`;
    }
  }
  narrow.addEventListener('change', syncIds);
  syncIds();

  // ---------- Song ----------
  const songSec = el('section', 'insp-sec');
  songSec.append(el('span', 'insp-kind', 'Song'));
  const songTitle = el('h2', 'insp-title');
  const songName = el('span');
  songTitle.append(songName);
  const tempoRow = el('div', 'insp-tempo');
  const tminus = el('button', 'key', '−');
  const tplus = el('button', 'key', '+');
  const tval = el('output');
  tval.id = 'insp-tempo';
  for (const b of [tminus, tplus]) { b.type = 'button'; b.classList.add('insp-step'); }
  tminus.setAttribute('aria-label', 'Tempo langsamer');
  tplus.setAttribute('aria-label', 'Tempo schneller');
  tminus.addEventListener('click', () => store.setBpm(clamp(store.project.bpm - 1, MIN_BPM, MAX_BPM)));
  tplus.addEventListener('click', () => store.setBpm(clamp(store.project.bpm + 1, MIN_BPM, MAX_BPM)));
  tempoRow.append(tminus, tval, tplus);
  // Tonart des Songs: die mitgelieferten Loops werden umgestimmt, Melodien wandern mit
  const keyNote = el('label', 'insp-row insp-key');
  const keySel = document.createElement('select');
  keySel.className = 'key-sel';
  keySel.id = 'insp-key';
  keyNote.append(el('span', null, 'Tonart'), keySel);
  bindKeySelect(keySel, store);
  // Tonartwechsel ab einem Takt (gesetzt in der Tonart-Zeile unter dem Lineal): Liste, × entfernt den Wechsel
  const keyChg = el('div', 'insp-keychg');
  keyChg.id = 'insp-keychg';
  function renderKeyChanges() {
    const list = keyChangesOf(store.project);
    keyChg.hidden = !list.length;
    keyChg.replaceChildren(...(list.length ? [el('span', 'insp-keychg-label', 'Tonartwechsel')] : []), ...list.map((c) => {
      const row = el('div', 'insp-keychg-row');
      const rm = el('button', 'insp-keychg-rm', '×');
      rm.type = 'button';
      rm.title = `Wechsel ab Takt ${c.bar} entfernen`;
      rm.setAttribute('aria-label', `Tonartwechsel ab Takt ${c.bar} entfernen`);
      rm.addEventListener('click', () => store.clearKeyAt(c.bar));
      row.append(el('span', null, `ab Takt ${c.bar}`), el('output', null, c.key), rm);
      return row;
    }));
  }
  const songTools = el('div', 'insp-song-tools'); // Klick (Metronom) in „calm“: layout.js bringt den Knopf hierher
  songTools.id = 'insp-song-tools';
  const lenRow = el('label', 'insp-row');
  const lenOut = el('output');
  const lenIn = document.createElement('input');
  Object.assign(lenIn, { type: 'range', min: '4', max: '128', step: '4', id: 'insp-length' });
  lenIn.addEventListener('change', () => store.setLength(Number(lenIn.value)));
  lenIn.addEventListener('input', () => { lenOut.textContent = `${lenIn.value} Takte`; });
  lenRow.append(el('span', null, 'Länge'), lenOut, lenIn);
  const masterSub = el('p', 'insp-sub', 'Master');
  // Verlauf der Summe: Ein-/Ausblenden über alle Clips (Ausblenden endet am letzten Clip bzw. Songende), Summen-Zeile
  const masterAuto = el('div', 'insp-auto');
  masterAuto.id = 'insp-master-auto';
  const masterTpl = templateControls({ store, ui, engine, getTarget: () => 'master', names: MASTER_TEMPLATES });
  const masterCurve = el('button', 'insp-link', 'Summen-Kurve zeigen (A)');
  masterCurve.type = 'button';
  masterCurve.id = 'insp-master-curve';
  masterCurve.addEventListener('click', () => ui.autoLane?.toggle('master'));
  masterAuto.append(el('span', 'insp-kind', 'Verlauf der Summe'), masterTpl.node, masterCurve);
  // Song-Leiste in Blöcken nach dem Signalweg: Song · Master (Lautstärke, Effekte) · Verlauf der Summe · Mastering
  const grp = (cls) => el('div', `insp-grp ${cls}`);
  const songGrp = grp('insp-grp-song');
  songGrp.append(songTitle, el('span', 'insp-kind', 'Tempo (BPM)'), tempoRow, keyNote, keyChg, lenRow, songTools);
  const masterGrp = grp('insp-grp-master');
  masterGrp.append(masterSub);
  const autoGrp = grp('insp-grp-auto');
  autoGrp.append(masterAuto);
  // Busse: Rückkanal-Lautstärke und Effekt-Einstellungen (der einzige Ort dafür am Desktop)
  const busGrp = grp('insp-grp-buses');
  busGrp.id = 'insp-buses';
  busGrp.append(el('p', 'insp-sub', 'Busse'));
  const busCtl = [];
  const busBoxes = new Map();
  for (const b of BUSES) {
    const box = el('div', 'insp-bus');
    box.id = `insp-bus-${b.id}`;
    busBoxes.set(b.id, box);
    box.append(el('span', 'insp-kind', b.label));
    const add = (key, input, out, def) => busCtl.push({ b, key, input, out, def });
    const v = slider('Lautstärke', `insp-bus-${b.id}-volume`, 0, 1, 0.01);
    v.input.addEventListener('input', () => store.setBus(b.id, { volume: Number(v.input.value) }, `bus-${b.id}-volume`));
    v.input.addEventListener('dblclick', () => { v.input.value = String(b.defaults.volume); store.setBus(b.id, { volume: b.defaults.volume }); });
    box.append(v.row);
    add('volume', v.input, v.out, null);
    for (const key of b.params) {
      const p = busParamDef(b.id, key);
      if (p.options) {
        const row = el('label', 'insp-row');
        const sel = document.createElement('select');
        sel.id = `insp-bus-${b.id}-${key}`;
        for (const o of p.options) { const op = el('option', null, o.label); op.value = o.id; sel.append(op); }
        sel.addEventListener('change', () => store.setBus(b.id, { [key]: sel.value }));
        row.append(el('span', null, p.label), sel);
        box.append(row);
        add(key, sel, null, p);
      } else {
        const r = slider(p.label, `insp-bus-${b.id}-${key}`, p.min, p.max, p.step);
        r.input.addEventListener('input', () => store.setBus(b.id, { [key]: Number(r.input.value) }, `bus-${b.id}-${key}`));
        r.input.addEventListener('dblclick', () => { r.input.value = String(b.defaults[key]); store.setBus(b.id, { [key]: b.defaults[key] }); });
        box.append(r.row);
        add(key, r.input, r.out, p);
      }
    }
    busGrp.append(box);
  }
  const mstSlot = grp('insp-mst');
  songSec.append(songGrp, masterGrp, busGrp, autoGrp, mstSlot);
  if (mastering) mountMasteringControls(mstSlot, { store, engine, analysis: mastering, prefix: 'insp-mst' });

  const hintSec = el('p', 'insp-empty', 'Klick auf einen Clip oder einen Spurnamen zeigt hier seine Einstellungen. Klick ins Leere zeigt den Song.');

  root.append(clipSec, trackSec, songSec, hintSec);

  // ---------- Anzeige ----------
  function render() {
    const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
    const track = found?.track ?? (ui.selectedTrackId ? store.track(ui.selectedTrackId) : null);
    // „sound“: Werkbank für einen Sound aus der Kiste, ohne Clip (nur mit clipPanel)
    const benchId = !found && !track && panel && ui.benchSoundId && library.get(ui.benchSoundId) ? ui.benchSoundId : null;
    const mode = found ? 'clip' : track ? 'track' : benchId ? 'sound' : 'song';
    clipSec.hidden = mode !== 'clip' && mode !== 'sound';
    trackSec.hidden = mode === 'song' || mode === 'sound' || (mode === 'clip' && !trackOnClip);
    songSec.hidden = mode !== 'song';
    hintSec.hidden = mode !== 'song';
    root.dataset.mode = mode;
    if (calm) {
      if (mode !== 'song') pinned = false;
      app.classList.toggle('insp-open', mode !== 'song' || pinned);
      toggle.setAttribute('aria-expanded', String(app.classList.contains('insp-open')));
    }

    if (panel) panel.render();
    if (found && !panel) {
      const { clip } = found;
      const s = library.get(clip.sampleId);
      const cat = s?.colorCat ?? s?.category ?? 'fx';
      clipSec.className = `insp-sec insp-clip cat-${cat}`;
      clipName.textContent = s?.name ?? 'Clip';
      const bpb = store.project.beatsPerBar;
      const from = Math.floor(clip.startBeat / bpb) + 1;
      const to = Math.ceil((clip.startBeat + clip.lengthBeats) / bpb - 1e-9);
      const bars = clip.lengthBeats / bpb;
      takeRow.update(clip);
      clipMeta.textContent = `Takt ${from}${to > from ? `–${to}` : ''} · ${Number.isInteger(bars) ? `${bars} ${bars === 1 ? 'Takt' : 'Takte'}` : fmtBeats(clip.lengthBeats)}`;
      const setR = (r, v, max, text) => { r.input.max = String(max); if (document.activeElement !== r.input) r.input.value = String(v); r.out.textContent = text; };
      setR(gain, gainToSlider(clipGain(clip)), GAIN_SLIDER_MAX, formatDb(clipGain(clip)));
      setR(fin, clip.fadeInBeats || 0, clip.lengthBeats, fmtBeats(clip.fadeInBeats || 0));
      setR(fout, clip.fadeOutBeats || 0, clip.lengthBeats, fmtBeats(clip.fadeOutBeats || 0));
      setR(cin, clip.fadeInCurve || 0, 1, formatCurve(clip.fadeInCurve || 0));
      setR(cout, clip.fadeOutCurve || 0, 1, formatCurve(clip.fadeOutCurve || 0));
      cin.row.hidden = !clip.fadeInBeats;
      cout.row.hidden = !clip.fadeOutBeats;
      // Sound-Tempo: nur Aufnahmen; erzeugte Loops und Patterns folgen ohnehin dem Song
      const own = hasOwnTempo(s);
      stIn.hidden = !own;
      stBtns.hidden = !own;
      stempo.hidden = calm && !(own && soundBpm(s)); // Einzelklang hat kein Sound-Tempo: Block weglassen
      const sb = own ? soundBpm(s) : null;
      const fixed = store.project.sampleTempo?.[s?.id] != null;
      stOut.textContent = !s ? '' : !own ? (s.def || s.make ? 'folgt dem Song' : '–') : sb ? `${fmtBpm(sb)} BPM · ${fmtBeats(s.beats)}` : 'Einzelklang · Tempo eingeben';
      if (document.activeElement !== stIn) stIn.value = sb ? String(Math.round(sb * 10) / 10) : '';
      for (const b of [stBtns.querySelector('#insp-stempo-half'), stBtns.querySelector('#insp-stempo-double'), stSong]) b.disabled = !sb;
      stSong.setAttribute('aria-pressed', String(!!sb && Math.abs(sb - store.project.bpm) < 0.05));
      stReset.hidden = !fixed;
      skey.update(s);
    }

    if (mode === 'clip' || mode === 'track') {
      trackId = track.id;
      trackName.textContent = track.name;
      const n = track.clips.length;
      trackSub.textContent = `Gilt für alle Clips der Spur · ${n} ${n === 1 ? 'Clip' : 'Clips'}`;
      volLabel.textContent = 'Spur-Lautstärke';
      if (document.activeElement !== vol.input) vol.input.value = String(track.volume);
      vol.out.textContent = formatDb(track.volume);
      for (const [k, b] of msBtns || []) b.setAttribute('aria-pressed', String(!!track[k]));
      pan.row.hidden = false;
      autoBlock.hidden = false;
      tpl.update();
      curveBtn.textContent = ui.autoLane?.isOpen(trackId) ? 'Kurve schließen (A)' : 'Kurve zeigen (A)';
      if (panLock.update(track)) showPan(track);
      else {
        if (document.activeElement !== pan.input) pan.input.value = String(track.pan || 0);
        pan.out.textContent = panText(track.pan || 0);
      }
      if (fxl.parentElement !== trackSec) trackSec.append(fxl, fxReset.node, addFx, fxPick, busBlock, mixerLink);
      for (const [b, r, lock] of sendRows) {
        if (lock.update(track)) { showSend(track, b, r); continue; }
        const v = sendOf(track, b.id);
        if (document.activeElement !== r.input) r.input.value = String(v);
        r.out.textContent = sendText(v);
        r.row.classList.toggle('on', v > 0);
      }
      mixerLink.hidden = fxCompact; // Stufe 3: „Mischen“ steht im Song-Fach
      autoBlock.hidden = fxCompact && !autoOpen;
      fineBtn.setAttribute('aria-expanded', String(autoOpen));
    } else if (mode === 'sound') {
      trackId = null;
      autoBlock.hidden = true;
    } else {
      trackId = MASTER;
      autoBlock.hidden = true;
      volLabel.textContent = 'Master-Lautstärke';
      songName.textContent = store.project.name || 'Song';
      renderKeyChanges();
      tval.textContent = String(store.project.bpm);
      if (document.activeElement !== lenIn) lenIn.value = String(store.project.lengthBars);
      lenOut.textContent = `${store.project.lengthBars} Takte`;
      // Master-Lautstärke und Master-Effekte unter „Master“
      const m = masterOf(store.project);
      if (vol.row.parentElement !== masterGrp) masterGrp.append(vol.row, fxl, fxReset.node);
      masterTpl.update();
      const open = !!ui.autoLane?.isOpen('master');
      const has = autoKeys('master').some((k) => laneOf(m, k).length);
      masterCurve.textContent = open ? 'Summen-Kurve schließen (A)' : 'Summen-Kurve zeigen (A)';
      masterCurve.classList.toggle('lit', has);
      if (document.activeElement !== vol.input) vol.input.value = String(m.volume);
      vol.out.textContent = formatDb(m.volume);
      // Ein Bus zeigt seine Einstellungen, sobald eine Spur zu ihm sendet (vorher kommt nichts hinzu)
      const used = (id) => busUsed(store.project, id);
      for (const [id, box] of busBoxes) box.hidden = !used(id);
      busGrp.hidden = ![...busBoxes.values()].some((box) => !box.hidden);
      for (const c of busCtl) {
        const v = busOf(store.project, c.b.id)[c.key];
        if (document.activeElement !== c.input) c.input.value = String(v);
        if (c.out) c.out.textContent = c.key === 'volume' ? formatDb(v) : formatParam(c.def, v);
      }
    }
    if ((mode === 'clip' || mode === 'track') && vol.row.parentElement !== trackSec) { trackSec.insertBefore(vol.row, panBox); }

    const fx = fxOf();
    const owner = mode === 'sound' ? null : fxOwner();
    applyOrder(fxl, fxOrderOf(owner), (id) => items.get(id).item);
    fxReset.update(owner);
    const compact = fxCompact && mode === 'track';
    addFx.hidden = !compact;
    if (!compact) fxPick.hidden = true;
    for (const b of fxPick.children) b.hidden = !!fx[b.dataset.fx]?.on;
    addFx.disabled = compact && EFFECTS.every((e) => fx[e.id].on);
    for (const e of EFFECTS) {
      const it = items.get(e.id);
      const f = fx[e.id];
      it.item.hidden = compact && !f.on;
      it.item.classList.toggle('on', !!f.on);
      it.sw.setAttribute('aria-pressed', String(!!f.on));
      it.sum.textContent = fxSummary(e, shownFx(e, f));
      for (const [k, c] of it.ctl) {
        if (c.lock && c.lock.update(lockTrack())) { showFx(c, e.params[k]); continue; }
        if (document.activeElement !== c.input) c.input.value = String(f[k]);
        if (c.out) c.out.textContent = formatParam(e.params[k], f[k]);
      }
    }
    if (!follow && anyLocked()) follow = requestAnimationFrame(followLocked);
  }

  // Gesperrte Regler (Panorama, Effekt-Werte mit Kurve) zeigen den Kurvenwert an der hörbaren Marke; im Song die Summe
  const songMode = () => root.dataset.mode === 'song';
  const lockTrack = () => (songMode() ? (trackId === MASTER ? masterOf(store.project) : null) : trackId && trackId !== MASTER ? store.track(trackId) : null);
  const fxCtl = () => EFFECTS.flatMap((e) => [...items.get(e.id).ctl].filter(([, c]) => c.lock).map(([k, c]) => [c, e.params[k]]));
  const anyLocked = () => {
    if (!lockTrack()) return false;
    const fx = fxCtl().some(([c]) => !c.lock.btn.hidden);
    return songMode() ? !songSec.hidden && fx : !trackSec.hidden && (!panLock.btn.hidden || fx || sendRows.some(([, , l]) => !l.btn.hidden));
  };
  // Gesperrter Send: Wert der Kurve an der Marke
  function showSend(track, b, r) {
    const v = Math.round(lockedValue(track, sendKey(b.id), engine) * 100) / 100;
    if (Number(r.input.value) !== v) r.input.value = String(v);
    const text = sendText(v);
    if (r.out.textContent !== text) r.out.textContent = text;
    r.row.classList.toggle('on', v > 0);
  }
  function showFx(c, p) {
    const track = lockTrack();
    if (!track) return;
    const v = Math.round(lockedValue(track, c.key, engine) / p.step) * p.step;
    if (Math.abs(Number(c.input.value) - v) > 1e-9) c.input.value = String(v);
    const text = formatParam(p, v);
    if (c.out && c.out.textContent !== text) c.out.textContent = text;
  }
  // Werte eines Effekts, wie sie gerade klingen (Kurven an der Marke statt Reglerwert) – für die Kurzbeschreibung
  function shownFx(e, f) {
    const track = lockTrack();
    const keys = track ? Object.keys(e.params).filter((k) => isAutomated(track, `${e.id}.${k}`)) : [];
    if (!keys.length) return f;
    const g = { ...f };
    for (const k of keys) g[k] = lockedValue(track, `${e.id}.${k}`, engine);
    return g;
  }
  function followLocked() {
    const track = lockTrack();
    if (!track || !anyLocked()) { follow = 0; return; }
    if (!songMode() && panLock.update(track)) showPan(track);
    if (!songMode()) for (const [b, r, lock] of sendRows) if (lock.update(track)) showSend(track, b, r);
    for (const [c, p] of fxCtl()) if (c.lock.update(track)) showFx(c, p);
    const fx = fxOf();
    for (const e of EFFECTS) {
      if (!fx[e.id].on) continue;
      const text = fxSummary(e, shownFx(e, fx[e.id]));
      const sum = items.get(e.id).sum;
      if (sum.textContent !== text) sum.textContent = text;
    }
    follow = requestAnimationFrame(followLocked);
  }

  // Gesperrtes Panorama folgt beim Abspielen der Kurve (Wert an der hörbaren Marke)
  function panText(pv) {
    return Math.abs(pv) < 0.01 ? 'Mitte' : `${Math.round(Math.abs(pv) * 100)} % ${pv < 0 ? 'links' : 'rechts'}`;
  }
  function showPan(track) {
    const v = Math.round(lockedValue(track, 'pan', engine) * 100) / 100;
    if (Number(pan.input.value) !== v) pan.input.value = String(v);
    const text = panText(v);
    if (pan.out.textContent !== text) pan.out.textContent = text;
  }

  ui.on(render);
  store.on(render);
  // Erkannte Tonart kommt im Hintergrund: nur die Zeile nachziehen
  library.on(() => { if (ui.selectedClipId) skey.update(selSample()); });
  render();
  return { render };
}
