// Mixer: ein Kanalzug pro Spur plus Master. Fader, Panorama, Mute/Solo, Effekt-Zusammenfassung, Pegel.
// Effekte des gewählten Kanals: am Desktop im Inspektor, am Handy als eigene Seite im Mixer (mit Zurück).

import { EFFECTS, EFFECT_IDS, withFx, fxOrderOf } from '../effects.js';
import { applyOrder, mountFxDrag, orderText, resetLink } from './fx-order.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatDb } from './arranger.js';
import { narrow } from './place.js';
import { makeKnob, relativeDrag } from './knob.js';
import { autoLock, lockedValue } from './auto-lane.js';
import { AUTO_PARAMS } from '../automation.js';

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
  let detailReset = null; // „Reihenfolge zurücksetzen“ auf der Effekt-Seite

  const fxOf = (id) => (id === MASTER ? withFx(masterOf(store.project).fx) : withFx(store.track(id)?.fx));
  const setFx = (id, fxId, patch, key) => (id === MASTER ? store.setMasterFx(fxId, patch, key) : store.setTrackFx(id, fxId, patch, key));
  const nameOf = (id) => (id === MASTER ? 'Master' : store.track(id)?.name ?? '');
  // Besitzer der Kurven eines Kanals (Master: Summen-Kurven, Ziel 'master')
  const ownerOf = (id) => (id === MASTER ? masterOf(store.project) : store.track(id));

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
    const knob = pan ? makeKnob(pan, { wrapClass: 'strip-pan-wrap', center: true }) : null;
    // Panorama mit Kurve: Regler folgt ihr, Klick öffnet die Kurvenzeile (am Handy macht der Mixer dafür Platz)
    const lock = pan ? autoLock({ ui, key: 'pan', wrap: knob.wrap, input: pan, getTrackId: () => id, onOpen: () => { if (narrow.matches) ui.setDock(null); } }) : null;
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
    // Finger: relativ ziehen auf der ganzen Fader-Zeile, Wischen zur Seite scrollt
    faderRow.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') e.preventDefault(); });
    relativeDrag(faderRow, fader, { span: () => fader.getBoundingClientRect().height || 120, touchOnly: true });
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
    if (pan) strip.append(knob.wrap);
    strip.append(faderRow, value, ms);
    const s = { strip, name, sum, fxBtns, fxMap, pan, knob, lock, locked: false, fader, meter, value, mute, solo, peak: 0 };
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
      applyOrder(s.fxBtns, fxOrderOf(ownerOf(id)), (fxId) => s.fxMap.get(fxId));
      const nOn = EFFECTS.filter((e) => fx[e.id].on).length;
      s.sum.textContent = nOn ? `${nOn} ${nOn === 1 ? 'Effekt' : 'Effekte'}` : 'keine Effekte';
      s.sum.classList.toggle('on', nOn > 0);
      const vol = id === MASTER ? masterOf(store.project).volume : store.track(id).volume;
      if (document.activeElement !== s.fader) s.fader.value = String(vol);
      s.fader.setAttribute('aria-label', `Lautstärke ${nameOf(id)}`);
      s.value.textContent = formatDb(vol);
      if (s.pan) {
        const t = store.track(id);
        s.locked = s.lock.update(t);
        if (s.locked) showPan(s, t);
        else if (document.activeElement !== s.pan) s.pan.value = String(t.pan || 0);
        s.knob.update();
        s.pan.setAttribute('aria-label', `Panorama ${t.name}`);
        s.mute.setAttribute('aria-pressed', String(t.mute));
        s.solo.setAttribute('aria-pressed', String(t.solo));
      }
    });
    if (selected && !ids.includes(selected)) selected = null;
    renderDetail();
  }

  // Gesperrtes Panorama: Wert der Kurve an der Marke
  function showPan(s, t) {
    const v = Math.round(lockedValue(t, 'pan', engine) * 100) / 100;
    if (Number(s.pan.value) === v) return;
    s.pan.value = String(v);
    s.knob.update();
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
    applyOrder(detailEl.querySelector('.fx-cards'), fxOrderOf(ownerOf(selected)), (fxId) => detailControls.get(fxId)?.card);
    detailReset?.update(ownerOf(selected));
    for (const e of EFFECTS) {
      const c = detailControls.get(e.id);
      c.toggle.setAttribute('aria-pressed', String(fx[e.id].on));
      c.card.classList.toggle('off', !fx[e.id].on);
      for (const [k, p] of Object.entries(e.params)) {
        const ctl = c.params.get(k);
        if (ctl.lock && ctl.lock.update(ownerOf(selected))) { showFx(ctl, p); continue; }
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
      // Der ganze Kartenkopf ist Griff: kurz antippen schaltet, lange drücken ordnet um
      head.addEventListener('click', (ev) => { if (ev.target === head) toggle.click(); });
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
        // Effekt-Wert mit Kurve: gedimmt, folgt der Kurve; Antippen öffnet die Kurvenzeile (der Mixer macht Platz).
        // Master: Summen-Kurve
        const key = `${e.id}.${k}`;
        let lock = null;
        if (AUTO_PARAMS[key]?.fx) {
          const box = el('div', 'fx-param-box');
          box.append(row);
          lock = autoLock({ ui, key, wrap: box, input, getTrackId: () => (id === MASTER ? 'master' : id), onOpen: () => { if (narrow.matches) ui.setDock(null); } });
          card.append(box);
        } else card.append(row);
        params.set(k, { input, out, key, lock });
      }
      grid.append(card);
      detailControls.set(e.id, { card, toggle, params });
    }
    // Reihenfolge: Kartenkopf lange drücken, dann ziehen; kurz antippen schaltet
    const target = id === MASTER ? 'master' : id;
    mountFxDrag(grid, {
      ids: EFFECT_IDS,
      grid: true,
      itemOf: (fxId) => detailControls.get(fxId).card,
      handleOf: (fxId) => detailControls.get(fxId).card.querySelector('.fx-card-head'),
      getOrder: () => fxOrderOf(ownerOf(id)),
      onMove: (fxId, to) => {
        store.moveFx(target, fxId, to);
        ui.flash?.(orderText(fxOrderOf(ownerOf(id)), fxId));
      },
    });
    detailReset = resetLink(() => store.resetFxOrder(target));
    detailEl.append(grid, detailReset.node);
  }

  // Gesperrter Effekt-Regler: Wert der Kurve an der Marke
  function showFx(ctl, p) {
    const t = ownerOf(detailFor);
    if (!t) return;
    const v = Math.round(lockedValue(t, ctl.key, engine) / p.step) * p.step;
    if (Math.abs(Number(ctl.input.value) - v) > 1e-9) ctl.input.value = String(v);
    const text = formatParam(p, v);
    if (ctl.out && ctl.out.textContent !== text) ctl.out.textContent = text;
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
        if (s.locked) { const t = store.track(id); if (t) showPan(s, t); }
      }
      if (detailFor) {
        for (const e of EFFECTS) {
          for (const [k, ctl] of detailControls.get(e.id)?.params ?? []) if (ctl.lock && !ctl.lock.btn.hidden) showFx(ctl, e.params[k]);
        }
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
  store.on(sync);
  ui.on(() => {
    // Auswahl im Arranger/Inspektor im Mixer markieren
    const t = !narrow.matches ? (ui.selectedTrackId || (ui.selectedClipId && store.findClip(ui.selectedClipId)?.track.id) || null) : selected;
    for (const [id, s] of strips) s.strip.classList.toggle('selected', t === id);
  });
  narrow.addEventListener('change', () => { detailFor = null; sync(); });
  return { setOpen, select, MASTER };
}
