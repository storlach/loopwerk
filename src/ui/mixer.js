// Mixer: ein Kanalzug pro Spur plus Master. Fader, Panorama, Mute/Solo, Effekt-Zusammenfassung, Pegel.
// Effekte des gewählten Kanals: am Desktop im Inspektor, am Handy als eigene Seite im Mixer (mit Zurück).

import { EFFECTS, withFx } from '../effects.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatDb } from './arranger.js';
import { narrow } from './place.js';

const MASTER = '__master';
const SHORT = { drive: 'Zerr', filter: 'Filter', eq: 'EQ', comp: 'Komp', pump: 'Pump', echo: 'Echo', hall: 'Hall' };

export const formatParam = (p, v) => {
  if (p.format) return p.format(v);
  if (p.unit === 'ms') return `${Math.round(v)} ms`;
  if (p.unit === 'dB') return `${v > 0 ? '+' : ''}${String(v).replace('.', ',').replace('-', '−')} dB`;
  if (p.unit === '%') return `${Math.round(v * 100)} %`;
  return String(v);
};

export function mountMixer({ root, store, engine, ui }) {
  const stripsEl = root.querySelector('#mixer-strips');
  const detailEl = root.querySelector('#mixer-detail');
  const strips = new Map();
  let selected = null;
  let detailFor = null;
  let detailControls = new Map();

  const fxOf = (id) => (id === MASTER ? withFx(masterOf(store.project).fx) : withFx(store.track(id)?.fx));
  const setFx = (id, fxId, patch, key) => (id === MASTER ? store.setMasterFx(fxId, patch, key) : store.setTrackFx(id, fxId, patch, key));
  const nameOf = (id) => (id === MASTER ? 'Master' : store.track(id)?.name ?? '');

  function makeStrip(id) {
    const strip = el('div', `strip${id === MASTER ? ' strip-master' : ''}`);
    strip.dataset.stripId = id;
    const name = el('button', 'strip-name');
    name.type = 'button';
    name.title = 'Effekte dieses Kanals bearbeiten';
    name.addEventListener('click', () => select(id));
    // Zusammenfassung statt sieben Schalter; Klick zeigt die Effekte der Spur (Inspektor bzw. Effekt-Seite)
    const sum = el('button', 'strip-sum');
    sum.type = 'button';
    sum.addEventListener('click', () => select(id));
    const fxBtns = el('div', 'strip-fx');
    const fxMap = new Map();
    for (const e of EFFECTS) {
      const b = el('button', 'fx-toggle', SHORT[e.id]);
      b.type = 'button';
      b.title = `${e.label} ein/aus`;
      b.addEventListener('click', () => { setFx(id, e.id, { on: !fxOf(id)[e.id].on }); select(id); });
      fxBtns.append(b);
      fxMap.set(e.id, b);
    }
    let pan = null;
    if (id !== MASTER) {
      pan = document.createElement('input');
      pan.type = 'range';
      pan.min = '-1';
      pan.max = '1';
      pan.step = '0.05';
      pan.className = 'strip-pan';
      pan.id = `pan-${id}`;
      pan.title = 'Panorama (Doppelklick = Mitte)';
      pan.addEventListener('input', () => store.setTrack(id, { pan: Number(pan.value) }, 'pan-' + id));
      pan.addEventListener('dblclick', () => store.setTrack(id, { pan: 0 }));
    }
    const faderRow = el('div', 'strip-fader-row');
    const fader = document.createElement('input');
    fader.type = 'range';
    fader.min = '0';
    fader.max = '1';
    fader.step = '0.01';
    fader.className = 'strip-fader';
    fader.id = `fader-${id}`;
    fader.addEventListener('input', () => {
      const v = Number(fader.value);
      if (id === MASTER) store.setMaster({ volume: v }, 'master-vol'); else store.setTrack(id, { volume: v }, 'vol-' + id);
    });
    const meter = el('canvas', 'strip-meter');
    faderRow.append(fader, meter);
    const value = el('div', 'strip-value');
    const ms = el('div', 'strip-ms');
    let mute = null;
    let solo = null;
    if (id !== MASTER) {
      mute = el('button', 'tbtn tbtn-mute', 'M');
      mute.type = 'button';
      mute.title = 'Stumm';
      mute.addEventListener('click', () => store.setTrack(id, { mute: !store.track(id).mute }));
      solo = el('button', 'tbtn tbtn-solo', 'S');
      solo.type = 'button';
      solo.title = 'Solo';
      solo.addEventListener('click', () => store.setTrack(id, { solo: !store.track(id).solo }));
      ms.append(mute, solo);
    }
    strip.append(name, sum, fxBtns);
    if (pan) strip.append(pan);
    strip.append(faderRow, value, ms);
    const s = { strip, name, sum, fxMap, pan, fader, meter, value, mute, solo, peak: 0 };
    strips.set(id, s);
    return s;
  }

  function sync() {
    if (root.hidden) return;
    const ids = [...store.project.tracks.map((t) => t.id), MASTER];
    for (const [id, s] of strips) if (!ids.includes(id)) { s.strip.remove(); strips.delete(id); }
    ids.forEach((id, i) => {
      const s = strips.get(id) || makeStrip(id);
      if (stripsEl.children[i] !== s.strip) stripsEl.insertBefore(s.strip, stripsEl.children[i] || null);
      const fx = fxOf(id);
      s.name.textContent = nameOf(id);
      s.strip.classList.toggle('selected', selected === id);
      for (const [fxId, b] of s.fxMap) b.setAttribute('aria-pressed', String(fx[fxId].on));
      const nOn = EFFECTS.filter((e) => fx[e.id].on).length;
      s.sum.textContent = nOn ? `${nOn} ${nOn === 1 ? 'Effekt' : 'Effekte'}` : 'keine Effekte';
      s.sum.classList.toggle('on', nOn > 0);
      const vol = id === MASTER ? masterOf(store.project).volume : store.track(id).volume;
      if (document.activeElement !== s.fader) s.fader.value = String(vol);
      s.fader.setAttribute('aria-label', `Lautstärke ${nameOf(id)}`);
      s.value.textContent = formatDb(vol);
      if (s.pan) {
        const t = store.track(id);
        if (document.activeElement !== s.pan) s.pan.value = String(t.pan || 0);
        s.pan.setAttribute('aria-label', `Panorama ${t.name}`);
        s.mute.setAttribute('aria-pressed', String(t.mute));
        s.solo.setAttribute('aria-pressed', String(t.solo));
      }
    });
    if (selected && !ids.includes(selected)) selected = null;
    renderDetail();
  }

  // Am Desktop zeigt der Inspektor die Effekte der gewählten Spur (Master: Song-Ansicht);
  // am Handy das Detail im Mixer
  function select(id) {
    selected = id;
    if (!narrow.matches) {
      if (id === MASTER) { ui.select(null); ui.selectTrack?.(null); } else ui.selectTrack?.(id);
    }
    sync();
  }

  // ---------- Effekt-Details ----------

  function renderDetail() {
    root.dataset.view = narrow.matches && selected ? 'detail' : 'strips';
    if (!narrow.matches || !selected) { detailFor = null; detailEl.innerHTML = ''; return; }
    if (detailFor !== selected) buildDetail(selected);
    const fx = fxOf(selected);
    detailEl.querySelector('.detail-title').textContent = `Effekte: ${nameOf(selected)}`;
    for (const e of EFFECTS) {
      const c = detailControls.get(e.id);
      c.toggle.setAttribute('aria-pressed', String(fx[e.id].on));
      c.card.classList.toggle('off', !fx[e.id].on);
      for (const [k, p] of Object.entries(e.params)) {
        const ctl = c.params.get(k);
        if (document.activeElement !== ctl.input) ctl.input.value = String(fx[e.id][k]);
        if (ctl.out) ctl.out.textContent = formatParam(p, fx[e.id][k]);
      }
    }
  }

  function buildDetail(id) {
    detailFor = id;
    detailControls = new Map();
    detailEl.innerHTML = '';
    const back = el('button', 'detail-back', '‹ Alle Kanäle');
    back.type = 'button';
    back.addEventListener('click', () => select(null));
    const head = el('div', 'detail-head');
    head.append(back, el('h3', 'detail-title'));
    detailEl.append(head);
    const grid = el('div', 'fx-cards');
    for (const e of EFFECTS) {
      const card = el('section', 'fx-card');
      const head = el('div', 'fx-card-head');
      const toggle = el('button', 'fx-switch', e.label);
      toggle.type = 'button';
      toggle.id = `fx-${e.id}-on`;
      toggle.addEventListener('click', () => setFx(id, e.id, { on: !fxOf(id)[e.id].on }));
      head.append(toggle);
      card.append(head);
      const params = new Map();
      for (const [k, p] of Object.entries(e.params)) {
        const row = el('label', 'fx-param');
        const lab = el('span', 'fx-param-label', p.label);
        let input;
        let out = null;
        if (p.options) {
          input = document.createElement('select');
          for (const o of p.options) { const op = el('option', null, o.label); op.value = o.id; input.append(op); }
          input.addEventListener('change', () => setFx(id, e.id, { [k]: input.value, on: true }));
        } else {
          input = document.createElement('input');
          input.type = 'range';
          input.min = String(p.min);
          input.max = String(p.max);
          input.step = String(p.step);
          input.addEventListener('input', () => setFx(id, e.id, { [k]: clamp(Number(input.value), p.min, p.max), on: true }, `fx-${id}-${e.id}-${k}`));
          input.addEventListener('dblclick', () => setFx(id, e.id, { [k]: p.default }));
          out = el('span', 'fx-param-value');
        }
        input.id = `fx-${e.id}-${k}`;
        row.append(lab, input);
        if (out) row.append(out);
        card.append(row);
        params.set(k, { input, out });
      }
      grid.append(card);
      detailControls.set(e.id, { card, toggle, params });
    }
    detailEl.append(grid);
  }

  // ---------- Pegel ----------

  function drawMeters() {
    if (!root.hidden) {
      for (const [id, s] of strips) {
        const level = id === MASTER ? engine.peakLevel() : engine.trackPeak(id);
        const db = level > 0 ? 20 * Math.log10(level) : -60;
        const frac = clamp((db + 48) / 48, 0, 1);
        s.peak = Math.max(frac, s.peak - 0.015);
        const c = s.meter;
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const css = getComputedStyle(c);
        g.fillStyle = css.getPropertyValue('--meter-off').trim();
        g.fillRect(0, 0, w, h);
        const top = h * (1 - s.peak);
        g.fillStyle = css.getPropertyValue(s.peak > 0.92 ? '--meter-hot' : s.peak > 0.75 ? '--meter-warm' : '--meter-ok').trim();
        g.fillRect(0, top, w, h - top);
      }
    }
    requestAnimationFrame(drawMeters);
  }
  requestAnimationFrame(drawMeters);

  function setOpen(open) {
    ui.setDock(open ? 'mixer' : ui.dock === 'mixer' ? null : ui.dock);
  }
  ui.on(() => {
    const show = ui.dock === 'mixer';
    document.getElementById('mixer-btn').setAttribute('aria-pressed', String(show));
    if (root.hidden === !show) return;
    root.hidden = !show;
    // Am Handy öffnet der Mixer immer mit allen Kanälen
    if (show && narrow.matches) selected = null;
    if (show) sync();
  });
  document.getElementById('mixer-btn').addEventListener('click', () => setOpen(ui.dock !== 'mixer'));
  root.querySelector('#mixer-close').addEventListener('click', () => setOpen(false));
  store.on(sync);
  ui.on(() => {
    // Auswahl im Arranger/Inspektor im Mixer markieren
    const t = !narrow.matches ? (ui.selectedTrackId || (ui.selectedClipId && store.findClip(ui.selectedClipId)?.track.id) || null) : selected;
    for (const [id, s] of strips) s.strip.classList.toggle('selected', t === id);
  });
  narrow.addEventListener('change', () => { detailFor = null; sync(); });
  return { setOpen, select, MASTER };
}
