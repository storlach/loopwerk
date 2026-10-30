// Inspektor (Desktop, rechts): zeigt immer das Ausgewählte.
// Clip → Lautstärke, Ein-/Ausblenden, Werkzeuge, darunter seine Spur. Spur → Lautstärke, Panorama, Effekte.
// Nichts → Song: Tempo, Tonart, Länge, Master und Master-Effekte. Effekte haben damit genau einen Ort.

import { EFFECTS, withFx } from '../effects.js';
import { clipGain, MIN_BPM, MAX_BPM } from '../model.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatDb } from './arranger.js';
import { formatParam } from './mixer.js';
import { narrow } from './place.js';
import { place } from './place.js';

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

export function mountInspector({ root, store, ui, library, tools }) {
  const app = document.getElementById('app');
  root.innerHTML = '';

  // Eingeklappt (kleinere Laptops): senkrechter Knopf, klappt über den Arranger auf
  const toggle = el('button', 'insp-toggle', 'Eigenschaften');
  toggle.type = 'button';
  toggle.addEventListener('click', () => app.classList.toggle('insp-open'));
  root.append(toggle);

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
  const btns = el('div', 'insp-btns');
  btns.id = 'insp-clip-btns';
  clipSec.append(clipKind, clipTitle, clipMeta, gain.row, fin.row, fout.row, run, btns);

  const selClip = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);
  gain.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { gain: Number(gain.input.value) }, 'insp-gain-' + c.id); });
  fin.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeInBeats: clamp(Number(fin.input.value), 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, 'insp-in-' + c.id); });
  fout.input.addEventListener('input', () => { const c = selClip(); if (c) store.setClip(c.id, { fadeOutBeats: clamp(Number(fout.input.value), 0, c.lengthBeats - (c.fadeInBeats || 0)) }, 'insp-out-' + c.id); });

  // Die Clip-Knöpfe (Bearbeiten, Teilen, Duplizieren, Löschen) ziehen vom Deck hierher
  const clipGroup = document.querySelector('.deck .group[aria-label="Clip"]');
  for (const id of ['edit-btn', 'split-btn', 'dup-btn', 'del-btn']) place(document.getElementById(id), { wide: btns });
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
  const mixerLink = el('button', 'insp-link', 'Alle Spuren im Mixer vergleichen →');
  mixerLink.type = 'button';
  mixerLink.addEventListener('click', () => ui.setDock('mixer'));
  trackSec.append(trackKind, trackTitle, trackSub, vol.row, pan.row);

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
      params.append(row);
      ctl.set(k, { input, out });
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
  const keyNote = el('p', 'insp-note', 'Tonart: A-Moll – die mitgelieferten Loops stehen in A-Moll.');
  const lenRow = el('label', 'insp-row');
  const lenOut = el('output');
  const lenIn = document.createElement('input');
  Object.assign(lenIn, { type: 'range', min: '4', max: '128', step: '4', id: 'insp-length' });
  lenIn.addEventListener('change', () => store.setLength(Number(lenIn.value)));
  lenIn.addEventListener('input', () => { lenOut.textContent = `${lenIn.value} Takte`; });
  lenRow.append(el('span', null, 'Länge'), lenOut, lenIn);
  const masterSub = el('p', 'insp-sub', 'Master');
  songSec.append(songTitle, el('span', 'insp-kind', 'Tempo (BPM)'), tempoRow, keyNote, lenRow, masterSub);

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
      const f = clip.stretch || 1;
      runOut.textContent = `×${String(f).replace('.', ',')}${f === 1 ? '' : f > 1 ? ' · langsamer' : ' · schneller'}`;
      for (const b of runBtns.querySelectorAll('[data-run]')) b.setAttribute('aria-pressed', String(Number(b.dataset.run) === f));
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
      pan.row.hidden = false;
      if (document.activeElement !== pan.input) pan.input.value = String(track.pan || 0);
      const pv = track.pan || 0;
      pan.out.textContent = Math.abs(pv) < 0.01 ? 'Mitte' : `${Math.round(Math.abs(pv) * 100)} % ${pv < 0 ? 'links' : 'rechts'}`;
      if (fxl.parentElement !== trackSec) trackSec.append(fxl, mixerLink);
    } else {
      trackId = MASTER;
      songName.textContent = store.project.name || 'Song';
      tval.textContent = String(store.project.bpm);
      if (document.activeElement !== lenIn) lenIn.value = String(store.project.lengthBars);
      lenOut.textContent = `${store.project.lengthBars} Takte`;
      // Master-Lautstärke und Master-Effekte unter „Master“
      const m = masterOf(store.project);
      if (vol.row.parentElement !== songSec) songSec.append(vol.row, fxl);
      if (document.activeElement !== vol.input) vol.input.value = String(m.volume);
      vol.out.textContent = formatDb(m.volume);
    }
    if (mode !== 'song' && vol.row.parentElement !== trackSec) { trackSec.insertBefore(vol.row, pan.row); }

    const fx = fxOf();
    for (const e of EFFECTS) {
      const it = items.get(e.id);
      const f = fx[e.id];
      it.item.classList.toggle('on', !!f.on);
      it.sw.setAttribute('aria-pressed', String(!!f.on));
      it.sum.textContent = fxSummary(e, f);
      for (const [k, c] of it.ctl) {
        if (document.activeElement !== c.input) c.input.value = String(f[k]);
        if (c.out) c.out.textContent = formatParam(e.params[k], f[k]);
      }
    }
  }

  ui.on(render);
  store.on(render);
  render();
  return { render };
}
