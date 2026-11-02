// Inspektor (Desktop, rechts): zeigt immer das Ausgewählte.
// Clip → Lautstärke, Ein-/Ausblenden, Werkzeuge, darunter seine Spur. Spur → Lautstärke, Panorama, Effekte.
// Nichts → Song: Tempo, Tonart, Länge, Master und Master-Effekte. Effekte haben damit genau einen Ort.

import { EFFECTS, withFx } from '../effects.js';
import { clipGain, MIN_BPM, MAX_BPM, keyChangesOf } from '../model.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatCurve, formatDb } from './arranger.js';
import { formatParam } from './mixer.js';
import { narrow } from './place.js';
import { place } from './place.js';
import { bindKeySelect } from './key-select.js';
import { hasOwnTempo, soundBpm, fmtBpm, setSoundBpm as setSoundBpmOf, useAsSongTempo } from './sound-tempo.js';
import { mountMasteringControls } from './mastering.js';
import { autoLock, lockedValue, templateControls, MASTER_TEMPLATES } from './auto-lane.js';
import { AUTO_PARAMS, autoKeys, isAutomated, laneOf } from '../automation.js';
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

export function mountInspector({ root, store, ui, library, tools, engine, mastering }) {
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
    if (!pinned) { ui.select(null); ui.selectTrack(null); }
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
  const clipSec = el('section', 'insp-sec');
  const clipKind = el('span', 'insp-kind', 'Clip');
  const clipTitle = el('h2', 'insp-title');
  const clipSw = el('span', 'swatch');
  const clipName = el('span');
  clipTitle.append(clipSw, clipName);
  const clipMeta = el('p', 'insp-meta');
  const slider = (label, id, min, max, step) => {
    const row = el('label', 'insp-row');
    const out = el('output');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), id });
    row.append(el('span', null, label), out, input);
    return { row, input, out };
  };
  const gain = slider('Lautstärke', 'insp-gain', 0, 1, 0.01);
  const fin = slider('Einblenden', 'insp-fadein', 0, 4, 0.25);
  const fout = slider('Ausblenden', 'insp-fadeout', 0, 4, 0.25);
  // Krümmung der Fades (wie der Bézier-Griff am Clip); nur sichtbar, wenn es den Fade gibt
  const cin = slider('Kurve', 'insp-curvein', -1, 1, 0.05);
  const cout = slider('Kurve', 'insp-curveout', -1, 1, 0.05);
  for (const c of [cin, cout]) c.row.classList.add('insp-sub-row');
  // Laufzeit: der Clip spielt länger oder kürzer, ohne dass sich die Tonhöhe ändert (×2 = halbes Tempo)
  const run = el('div', 'insp-row insp-run');
  const runOut = el('output');
  runOut.id = 'insp-run-out';
  const runBtns = el('div', 'insp-run-btns');
  const runBtn = (label, title, fn) => { const b = el('button', 'key', label); b.type = 'button'; b.title = title; b.addEventListener('click', fn); runBtns.append(b); return b; };
  const setRun = (f) => { const c = selClip(); if (c) store.setClipStretch(c.id, f); };
  const curRun = () => selClip()?.stretch || 1;
  runBtn('−', 'Kürzer (schneller)', () => setRun(stepRun(curRun(), -1))).id = 'insp-run-down';
  for (const [f, label] of [[0.5, '½'], [1, '1'], [2, '2']]) runBtn(label, `Laufzeit ×${String(f).replace('.', ',')}`, () => setRun(f)).dataset.run = String(f);
  runBtn('+', 'Länger (langsamer, gleiche Tonhöhe)', () => setRun(stepRun(curRun(), 1))).id = 'insp-run-up';
  run.append(el('span', null, 'Laufzeit'), runOut, runBtns);
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
  clipSec.append(clipKind, clipTitle, clipMeta, gain.row, fin.row, cin.row, fout.row, cout.row, run, stempo, btns);

  const selClip = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);
  gain.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { gain: Number(gain.input.value) }, 'insp-gain-' + c.id); });
  fin.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeInBeats: clamp(Number(fin.input.value), 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, 'insp-in-' + c.id); });
  fout.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeOutBeats: clamp(Number(fout.input.value), 0, c.lengthBeats - (c.fadeInBeats || 0)) }, 'insp-out-' + c.id); });
  for (const [r, key] of [[cin, 'fadeInCurve'], [cout, 'fadeOutCurve']]) {
    r.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { [key]: Number(r.input.value) }, `insp-${key}-${c.id}`); });
    r.input.addEventListener('dblclick', () => { const c = selClip(); if (c) store.setClip(c.id, { [key]: 0 }); });
  }

  // Die Clip-Knöpfe (Bearbeiten, Teilen, Duplizieren, Löschen) ziehen vom Deck hierher
  const clipGroup = document.querySelector('.deck .group[aria-label="Clip"]');
  for (const id of ['edit-btn', 'split-btn', 'dup-btn', 'del-btn']) place(document.getElementById(id), { wide: btns, calm: id === 'edit-btn' ? { narrow: btns } : null });
  void clipGroup;

  // ---------- Spur ----------
  const trackSec = el('section', 'insp-sec');
  const trackKind = el('span', 'insp-kind', 'Spur');
  const trackTitle = el('h2', 'insp-title');
  const trackSw = el('span', 'swatch');
  const trackName = el('span');
  trackTitle.append(trackSw, trackName);
  const trackSub = el('p', 'insp-sub');
  const vol = slider('Lautstärke', 'insp-vol', 0, 1, 0.01);
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
  trackSec.append(trackKind, trackTitle, trackSub, vol.row, panBox, autoBlock);
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
  songSec.append(songTitle, el('span', 'insp-kind', 'Tempo (BPM)'), tempoRow, keyNote, keyChg, lenRow, songTools, masterSub);
  // Mastering der Summe: direkt unter „Master“, vor Lautstärke und Effekten
  const mstSlot = el('div', 'insp-mst');
  songSec.append(mstSlot);
  if (mastering) mountMasteringControls(mstSlot, { store, engine, analysis: mastering, prefix: 'insp-mst' });

  const hintSec = el('p', 'insp-empty', 'Klick auf einen Clip oder einen Spurnamen zeigt hier seine Einstellungen. Klick ins Leere zeigt den Song.');

  root.append(clipSec, trackSec, songSec, hintSec);

  // ---------- Anzeige ----------
  function render() {
    const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
    const track = found?.track ?? (ui.selectedTrackId ? store.track(ui.selectedTrackId) : null);
    const mode = found ? 'clip' : track ? 'track' : 'song';
    clipSec.hidden = mode !== 'clip';
    trackSec.hidden = mode === 'song';
    songSec.hidden = mode !== 'song';
    hintSec.hidden = mode !== 'song';
    root.dataset.mode = mode;
    if (calm) {
      if (mode !== 'song') pinned = false;
      app.classList.toggle('insp-open', mode !== 'song' || pinned);
      toggle.setAttribute('aria-expanded', String(app.classList.contains('insp-open')));
    }

    if (found) {
      const { clip } = found;
      const s = library.get(clip.sampleId);
      const cat = s?.colorCat ?? s?.category ?? 'fx';
      clipSec.className = `insp-sec cat-${cat}`;
      clipName.textContent = s?.name ?? 'Clip';
      const bpb = store.project.beatsPerBar;
      const from = Math.floor(clip.startBeat / bpb) + 1;
      const to = Math.ceil((clip.startBeat + clip.lengthBeats) / bpb - 1e-9);
      const bars = clip.lengthBeats / bpb;
      clipMeta.textContent = `Spur „${track.name}“ · Takt ${from}${to > from ? `–${to}` : ''} · ${Number.isInteger(bars) ? `${bars} ${bars === 1 ? 'Takt' : 'Takte'}` : fmtBeats(clip.lengthBeats)}`;
      const setR = (r, v, max, text) => { r.input.max = String(max); if (document.activeElement !== r.input) r.input.value = String(v); r.out.textContent = text; };
      setR(gain, clipGain(clip), 1, formatDb(clipGain(clip)));
      setR(fin, clip.fadeInBeats || 0, clip.lengthBeats, fmtBeats(clip.fadeInBeats || 0));
      setR(fout, clip.fadeOutBeats || 0, clip.lengthBeats, fmtBeats(clip.fadeOutBeats || 0));
      setR(cin, clip.fadeInCurve || 0, 1, formatCurve(clip.fadeInCurve || 0));
      setR(cout, clip.fadeOutCurve || 0, 1, formatCurve(clip.fadeOutCurve || 0));
      cin.row.hidden = !clip.fadeInBeats;
      cout.row.hidden = !clip.fadeOutBeats;
      const f = clip.stretch || 1;
      runOut.textContent = `×${String(f).replace('.', ',')}${f === 1 ? '' : f > 1 ? ' · langsamer' : ' · schneller'}`;
      for (const b of runBtns.querySelectorAll('[data-run]')) b.setAttribute('aria-pressed', String(Number(b.dataset.run) === f));
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
    }

    if (mode !== 'song') {
      trackId = track.id;
      trackKind.textContent = mode === 'clip' ? '' : 'Spur';
      trackKind.hidden = mode === 'clip';
      trackTitle.hidden = mode === 'clip';
      trackName.textContent = track.name;
      trackSub.textContent = mode === 'clip' ? `Spur „${track.name}“ · Klang` : 'Klang';
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
      if (fxl.parentElement !== trackSec) trackSec.append(fxl, mixerLink);
    } else {
      trackId = MASTER;
      autoBlock.hidden = true;
      songName.textContent = store.project.name || 'Song';
      renderKeyChanges();
      tval.textContent = String(store.project.bpm);
      if (document.activeElement !== lenIn) lenIn.value = String(store.project.lengthBars);
      lenOut.textContent = `${store.project.lengthBars} Takte`;
      // Master-Lautstärke und Master-Effekte unter „Master“
      const m = masterOf(store.project);
      if (vol.row.parentElement !== songSec) songSec.append(vol.row, masterAuto, fxl);
      masterTpl.update();
      const open = !!ui.autoLane?.isOpen('master');
      const has = autoKeys('master').some((k) => laneOf(m, k).length);
      masterCurve.textContent = open ? 'Summen-Kurve schließen (A)' : 'Summen-Kurve zeigen (A)';
      masterCurve.classList.toggle('lit', has);
      if (document.activeElement !== vol.input) vol.input.value = String(m.volume);
      vol.out.textContent = formatDb(m.volume);
    }
    if (mode !== 'song' && vol.row.parentElement !== trackSec) { trackSec.insertBefore(vol.row, panBox); }

    const fx = fxOf();
    for (const e of EFFECTS) {
      const it = items.get(e.id);
      const f = fx[e.id];
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
    return songMode() ? !songSec.hidden && fx : !trackSec.hidden && (!panLock.btn.hidden || fx);
  };
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
  render();
  return { render };
}
