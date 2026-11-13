// Mixer: ein Kanalzug pro Spur plus Master. Fader, Panorama, Mute/Solo, Effekt-Zusammenfassung, Pegel.
// Effekte des gewählten Kanals: am Desktop im Inspektor, am Handy als eigene Seite im Mixer (mit Zurück).
// Layout „reiter“ (Desktop): kein Fach unten; dieselben Kanalzüge hängen als Zeilen neben den Spuren, jede in dem Platz (.mix-slot), den der
// Arranger ihrer Spur gibt (Höhe, Rollen, Umsortieren, Gruppen laufen damit mit); Summe und Busse in .mix-bus unter den Spuren.
// Ein Klick auf die Effekt-Kurzinfo öffnet die Karte (mixcol.js, hooks.open).

import { EFFECTS, EFFECT_IDS, withFx, fxOrderOf, BUSES, busDef, busOf, busParamDef, sendOf } from '../effects.js';
import { applyOrder, gripEl, mountFxDrag, orderText, resetLink } from './fx-order.js';
import { masterOf } from '../engine.js';
import { clamp, el } from '../util.js';
import { formatDb } from './arranger.js';
import { narrow } from './place.js';
import { makeKnob, relativeDrag } from './knob.js';
import { autoLock, lockedValue } from './auto-lane.js';
import { AUTO_PARAMS, busUsed, sendKey } from '../automation.js';
import { W } from './words.js';

const MASTER = '__master';
// Rückkanäle (Send-Busse) haben im Mixer eigene Kennungen neben den Spuren
const BUS_PREFIX = '__bus:';
const busKey = (id) => (typeof id === 'string' && id.startsWith(BUS_PREFIX) ? id.slice(BUS_PREFIX.length) : null);
const SEND_SHORT = { hall: 'H', echo: 'E' };
const SHORT = { drive: 'Zerr', filter: 'Filter', eq: 'EQ', comp: 'Komp', pump: 'Pump', echo: 'Echo', hall: 'Hall' };

export const formatParam = (p, v) => {
  if (p.format) return p.format(v);
  if (p.unit === 'ms') return `${Math.round(v)} ms`;
  if (p.unit === 'dB') return `${v > 0 ? '+' : ''}${String(v).replace('.', ',').replace('-', '−')} dB`;
  if (p.unit === '%') return `${Math.round(v * 100)} %`;
  return String(v);
};

export function mountMixer({ root, store, engine, ui, arranger = null }) {
  const app = document.getElementById('app');
  const stripsEl = root.querySelector('#mixer-strips');
  // Spalte neben den Spuren (Layout „reiter“, Desktop) statt Fach; hooks setzt mixcol.js (Karte öffnen, Reiter zeigen)
  const column = () => !!arranger?.mixHead && !narrow.matches;
  const colShown = () => app.dataset.side === 'mixer';
  const live = () => (column() ? colShown() : !root.hidden);
  const hooks = { open: null, show: null };
  const detailEl = root.querySelector('#mixer-detail');
  const strips = new Map();
  // Pegel: Maße je Leinwand vom ResizeObserver, Farben einmal gelesen
  const meterBox = new WeakMap();
  const meterSeen = new WeakSet();
  let meterColors = null;
  const meterSize = new ResizeObserver((list) => {
    for (const e of list) meterBox.set(e.target, { w: e.target.clientWidth, h: e.target.clientHeight });
  });
  let selected = null;
  let detailFor = null;
  let detailControls = new Map();
  let detailReset = null; // „Reihenfolge zurücksetzen“ auf der Effekt-Seite
  let detailSends = []; // Karte „Busse“: [[Bus, { input, out }]]
  let detailBus = []; // Bus-Seite: [{ key, input, out, def }], mute
  let detailMute = null;

  const fxOf = (id) => (id === MASTER ? withFx(masterOf(store.project).fx) : withFx(store.track(id)?.fx));
  const setFx = (id, fxId, patch, key) => (id === MASTER ? store.setMasterFx(fxId, patch, key) : store.setTrackFx(id, fxId, patch, key));
  const labelOf = (id) => (id === MASTER ? W('Summe') : nameOf(id));
  // Kurzinfo eines Rückkanals: seine ein, zwei wichtigsten Werte
  const busSummary = (bk) => {
    const cfg = busOf(store.project, bk);
    return busDef(bk).params.slice(0, 2).map((k) => { const p = busParamDef(bk, k); return p.options ? p.options.find((o) => o.id === cfg[k])?.label ?? cfg[k] : formatParam(p, cfg[k]); }).join(' · ');
  };
  const nameOf = (id) => (id === MASTER ? W('Master') : busKey(id) ? W(busDef(busKey(id))?.label ?? '') : store.track(id)?.name ?? '');
  // Besitzer der Kurven eines Kanals (Master: Summen-Kurven, Ziel 'master')
  const ownerOf = (id) => (id === MASTER ? masterOf(store.project) : store.track(id));

  function makeStrip(id) {
    const bk = busKey(id);
    const strip = el('div', `strip${id === MASTER ? ' strip-master' : bk ? ' strip-bus' : ''}`);
    strip.dataset.stripId = id;
    const name = el('button', 'strip-name');
    name.type = 'button';
    name.title = bk ? 'Einstellungen dieses Rückkanals zeigen' : 'Effekte dieses Kanals bearbeiten';
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
    if (id !== MASTER && !bk) {
      pan = document.createElement('input');
      pan.type = 'range';
      pan.min = '-1';
      pan.max = '1';
      pan.step = '0.05';
      pan.className = 'strip-pan';
      pan.id = `pan-${id}`;
      pan.title = W('Panorama (Doppelklick = Mitte)');
      pan.addEventListener('input', () => store.setTrack(id, { pan: Number(pan.value) }, 'pan-' + id));
      pan.addEventListener('dblclick', () => store.setTrack(id, { pan: 0 }));
    }
    const knob = pan ? makeKnob(pan, { wrapClass: 'strip-pan-wrap', center: true }) : null;
    // Panorama mit Kurve: Regler folgt ihr, Klick öffnet die Kurvenzeile (am Handy macht der Mixer dafür Platz)
    const lock = pan ? autoLock({ ui, key: 'pan', wrap: knob.wrap, input: pan, getTrackId: () => id, onOpen: () => { if (narrow.matches) ui.setDock(null); } }) : null;
    // Anteil zu Hall- und Echo-Bus („→H“, „→E“): kleine Drehregler über dem Panorama (am Handy ausgeblendet, dort steht
    // die Karte „Busse“ auf der Effekt-Seite)
    const sends = [];
    const sendsEl = el('div', 'strip-sends');
    if (!bk && id !== MASTER) {
      for (const b of BUSES) {
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min: '0', max: '1', step: '0.01', id: `send-${id}-${b.id}`, className: 'strip-send-in' });
        input.title = W(`Anteil zum ${b.label} (Doppelklick = aus)`);
        input.addEventListener('input', () => store.setSend(id, b.id, Number(input.value), `send-${id}-${b.id}`));
        input.addEventListener('dblclick', () => { input.value = '0'; store.setSend(id, b.id, 0); });
        const sk = makeKnob(input, { wrapClass: 'strip-send-wrap' });
        const cell = el('div', 'strip-send');
        cell.append(sk.wrap, el('span', 'strip-send-label', W(`→${SEND_SHORT[b.id]}`)));
        sendsEl.append(cell);
        // Send mit Kurve: Regler folgt ihr, ein Klick öffnet die Kurvenzeile
        const lock = autoLock({ ui, key: sendKey(b.id), wrap: sk.wrap, input, getTrackId: () => id, onOpen: () => { if (narrow.matches) ui.setDock(null); } });
        sends.push({ b, input, knob: sk, cell, lock, locked: false });
      }
    }
    const faderRow = el('div', 'strip-fader-row');
    const fader = document.createElement('input');
    fader.type = 'range';
    fader.min = '0';
    fader.max = '1';
    fader.step = '0.01';
    fader.className = 'strip-fader';
    fader.id = bk ? `fader-bus-${bk}` : `fader-${id}`;
    fader.addEventListener('input', () => {
      const v = Number(fader.value);
      if (id === MASTER) store.setMaster({ volume: v }, 'master-vol');
      else if (bk) store.setBus(bk, { volume: v }, `bus-vol-${bk}`);
      else store.setTrack(id, { volume: v }, 'vol-' + id);
    });
    const meter = el('canvas', 'strip-meter');
    faderRow.append(fader, meter);
    // Finger: relativ ziehen auf der ganzen Fader-Zeile, Wischen zur Seite scrollt
    faderRow.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') e.preventDefault(); });
    relativeDrag(faderRow, fader, { span: () => (column() ? fader.getBoundingClientRect().width : fader.getBoundingClientRect().height) || 120, touchOnly: true, horizontal: column });
    const value = el('div', 'strip-value');
    const ms = el('div', 'strip-ms');
    let mute = null;
    let solo = null;
    if (bk) {
      // Rückkanal: nur Stumm (Solo gilt für Spuren, der Hall der Solo-Spur bleibt hörbar)
      mute = el('button', 'tbtn tbtn-mute', 'M');
      mute.type = 'button';
      mute.title = 'Stumm';
      mute.addEventListener('click', () => store.setBus(bk, { mute: !busOf(store.project, bk).mute }));
      ms.append(mute);
    } else if (id !== MASTER) {
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
    // Zwei Zeilen (oben Kurzinfo und Regler, unten Fader, Wert, M/S); im Fach unten sind die Hüllen unsichtbar (display: contents)
    const l1 = el('div', 'strip-l1');
    const l2 = el('div', 'strip-l2');
    l1.append(name, sum);
    if (!bk) l1.append(fxBtns);
    if (sends.length) l1.append(sendsEl);
    if (pan) l1.append(knob.wrap);
    l2.append(faderRow, value, ms);
    strip.append(l1, l2);
    const s = { strip, name, sum, fxBtns, fxMap, pan, knob, lock, locked: false, sends, fader, meter, value, mute, solo, peak: 0 };
    strips.set(id, s);
    return s;
  }

  // Hervorgehobene Zeile: am Desktop die gewählte Spur (oder die Spur des gewählten Clips), bei offener Summen-Karte die Summe bzw. der Bus
  const highlighted = () => {
    if (narrow.matches) return selected;
    if (ui.selectedClipId) return store.findClip(ui.selectedClipId)?.track.id ?? null;
    if (ui.selectedTrackId) return ui.selectedTrackId;
    return app.dataset.mixcard === 'summe' ? (selected === MASTER || busKey(selected) ? selected : MASTER) : null;
  };
  function markSelection() {
    const t = highlighted();
    for (const [id, s] of strips) s.strip.classList.toggle('selected', t === id);
  }

  function sync() {
    if (!live()) return;
    const col = column();
    const ids = [...store.project.tracks.map((t) => t.id), ...BUSES.map((b) => BUS_PREFIX + b.id), MASTER];
    for (const [id, s] of strips) if (!ids.includes(id)) { s.strip.remove(); meterSize.unobserve(s.meter); strips.delete(id); }
    ids.forEach((id, i) => {
      const s = strips.get(id) || makeStrip(id);
      if (col) {
        // Spalte: Spuren in den Platz ihrer Zeile, Summe und Busse unter die Spuren (Summe, Hall, Echo)
        const host = id === MASTER || busKey(id) ? arranger.mixBus : arranger.rowSlot(id);
        if (host && s.strip.parentElement !== host) host.append(s.strip);
      } else if (stripsEl.children[i] !== s.strip) stripsEl.insertBefore(s.strip, stripsEl.children[i] || null);
      const bk = busKey(id);
      if (bk) { syncBusStrip(s, id, bk); return; }
      const fx = fxOf(id);
      s.name.textContent = col ? labelOf(id) : nameOf(id);
      s.strip.classList.toggle('selected', highlighted() === id);
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
        s.pan.setAttribute('aria-label', W(`Panorama ${t.name}`));
        s.mute.setAttribute('aria-pressed', String(t.mute));
        s.solo.setAttribute('aria-pressed', String(t.solo));
        for (const sd of s.sends) {
          sd.input.setAttribute('aria-label', W(`Anteil zum ${sd.b.label} ${t.name}`));
          sd.locked = sd.lock.update(t);
          if (sd.locked) { showSend(sd, t); continue; }
          const v = sendOf(t, sd.b.id);
          if (document.activeElement !== sd.input) sd.input.value = String(v);
          sd.cell.classList.toggle('on', v > 0);
          sd.knob.update();
        }
      }
    });
    if (col && arranger.mixBus) {
      const order = [MASTER, ...BUSES.map((b) => BUS_PREFIX + b.id)].map((id) => strips.get(id)?.strip).filter(Boolean);
      order.forEach((n, i) => { if (arranger.mixBus.children[i] !== n) arranger.mixBus.insertBefore(n, arranger.mixBus.children[i] || null); });
    }
    if (selected && !ids.includes(selected)) selected = null;
    markSelection();
    renderDetail();
  }

  // Gesperrter Send-Regler: Wert der Kurve an der Marke
  function showSend(sd, t) {
    const v = Math.round(lockedValue(t, sendKey(sd.b.id), engine) * 100) / 100;
    sd.cell.classList.toggle('on', v > 0);
    if (Number(sd.input.value) === v) return;
    sd.input.value = String(v);
    sd.knob.update();
  }

  // Rückkanal: Fader, Stumm, gedimmt, solange keine Spur zu ihm sendet
  function syncBusStrip(s, id, bk) {
    const cfg = busOf(store.project, bk);
    s.name.textContent = nameOf(id);
    const info = busSummary(bk);
    if (s.sum.textContent !== info) s.sum.textContent = info;
    s.sum.classList.toggle('on', busUsed(store.project, bk));
    s.strip.classList.toggle('idle', !busUsed(store.project, bk));
    if (document.activeElement !== s.fader) s.fader.value = String(cfg.volume);
    s.fader.setAttribute('aria-label', `Lautstärke ${nameOf(id)}`);
    s.value.textContent = formatDb(cfg.volume);
    s.mute.setAttribute('aria-pressed', String(!!cfg.mute));
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
    const bk = busKey(id);
    if (!narrow.matches) {
      if (bk) { ui.select(null); ui.selectTrack?.(null); if (column()) hooks.open?.(id); showBusSettings(bk); }
      else if (id === MASTER) { ui.select(null); ui.selectTrack?.(null); if (column()) hooks.open?.(id); } else { ui.selectTrack?.(id); if (column()) hooks.open?.(id); }
    }
    sync();
  }

  // Desktop: Klick auf einen Rückkanal zeigt den Song-Block „Busse“ im Inspektor (er erscheint, sobald eine Spur sendet)
  function showBusSettings(bk) {
    const box = document.getElementById(`insp-bus-${bk}`);
    if (box && box.offsetParent) box.scrollIntoView({ block: 'nearest' });
    else ui.flash?.(`Noch sendet keine Spur zum ${busDef(bk).label}.`);
  }

  // ---------- Effekt-Details ----------

  function renderDetail() {
    root.dataset.view = narrow.matches && selected ? 'detail' : 'strips';
    if (!narrow.matches || !selected) { detailFor = null; detailEl.innerHTML = ''; return; }
    if (detailFor !== selected) buildDetail(selected);
    if (busKey(selected)) { renderBusDetail(busKey(selected)); return; }
    const fx = fxOf(selected);
    detailEl.querySelector('.detail-title').textContent = `Effekte: ${nameOf(selected)}`;
    applyOrder(detailEl.querySelector('.fx-cards'), fxOrderOf(ownerOf(selected)), (fxId) => detailControls.get(fxId)?.card);
    detailReset?.update(ownerOf(selected));
    for (const [b, c] of detailSends) {
      if (c.lock.update(store.track(selected))) { showDetailSend(b, c); continue; }
      const v = sendOf(store.track(selected), b.id);
      if (document.activeElement !== c.input) c.input.value = String(v);
      c.out.textContent = v > 0 ? `${Math.round(v * 100)} %` : 'aus';
    }
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

  // Effekt-Seite eines Rückkanals (Handy): Lautstärke, Stumm und die Einstellungen des Busses – der einzige Ort dafür am Handy
  function buildBusDetail(id, bk) {
    detailFor = id;
    detailControls = new Map();
    detailSends = [];
    detailReset = null;
    detailBus = [];
    detailEl.innerHTML = '';
    const back = el('button', 'detail-back', '‹ Alle Kanäle');
    back.type = 'button';
    back.addEventListener('click', () => select(null));
    const head = el('div', 'detail-head');
    head.append(back, el('h3', 'detail-title'));
    detailEl.append(head);
    const b = busDef(bk);
    const grid = el('div', 'fx-cards fx-bus-page');
    const card = el('section', 'fx-card fx-bus-card');
    const ch = el('div', 'fx-card-head');
    detailMute = el('button', 'fx-switch', 'Stumm');
    detailMute.type = 'button';
    detailMute.id = `fx-bus-${bk}-mute`;
    detailMute.addEventListener('click', () => store.setBus(bk, { mute: !busOf(store.project, bk).mute }));
    ch.append(el('span', 'fx-card-title', b.label), detailMute);
    card.append(ch);
    const add = (key, label, input, out, def) => {
      const row = el('label', 'fx-param');
      input.id = `fx-bus-${bk}-${key}`;
      row.append(el('span', 'fx-param-label', label), input);
      if (out) row.append(out);
      card.append(row);
      detailBus.push({ key, input, out, def });
    };
    const vol = document.createElement('input');
    Object.assign(vol, { type: 'range', min: '0', max: '1', step: '0.01' });
    vol.addEventListener('input', () => store.setBus(bk, { volume: Number(vol.value) }, `bus-${bk}-volume`));
    vol.addEventListener('dblclick', () => { vol.value = String(b.defaults.volume); store.setBus(bk, { volume: b.defaults.volume }); });
    add('volume', 'Lautstärke', vol, el('span', 'fx-param-value'), null);
    for (const key of b.params) {
      const p = busParamDef(bk, key);
      let input;
      let out = null;
      if (p.options) {
        input = document.createElement('select');
        for (const o of p.options) { const op = el('option', null, o.label); op.value = o.id; input.append(op); }
        input.addEventListener('change', () => store.setBus(bk, { [key]: input.value }));
      } else {
        input = document.createElement('input');
        Object.assign(input, { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step) });
        input.addEventListener('input', () => store.setBus(bk, { [key]: clamp(Number(input.value), p.min, p.max) }, `bus-${bk}-${key}`));
        input.addEventListener('dblclick', () => { input.value = String(b.defaults[key]); store.setBus(bk, { [key]: b.defaults[key] }); });
        out = el('span', 'fx-param-value');
      }
      add(key, p.label, input, out, p);
    }
    grid.append(card);
    detailEl.append(grid);
  }

  function renderBusDetail(bk) {
    const cfg = busOf(store.project, bk);
    detailEl.querySelector('.detail-title').textContent = busDef(bk).label;
    detailMute.setAttribute('aria-pressed', String(!!cfg.mute));
    for (const c of detailBus) {
      const v = cfg[c.key];
      if (document.activeElement !== c.input) c.input.value = String(v);
      if (c.out) c.out.textContent = c.key === 'volume' ? formatDb(v) : formatParam(c.def, v);
    }
  }

  function buildDetail(id) {
    if (busKey(id)) { buildBusDetail(id, busKey(id)); return; }
    detailFor = id;
    detailControls = new Map();
    detailBus = [];
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
      head.append(toggle, gripEl());
      // Der ganze Kartenkopf ist Griff: kurz antippen schaltet, lange drücken ordnet um; am ⠿ sofort ziehen
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
    // Busse der Spur (nach dem Rack): je ein Anteil zum Hall- und Echo-Bus
    detailSends = [];
    if (id !== MASTER) {
      const card = el('section', 'fx-card fx-bus-card');
      const head = el('div', 'fx-card-head');
      head.append(el('span', 'fx-card-title', W('Busse')));
      card.append(head);
      for (const b of BUSES) {
        const row = el('label', 'fx-param');
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min: '0', max: '1', step: '0.01', id: `fx-send-${b.id}` });
        input.addEventListener('input', () => store.setSend(id, b.id, Number(input.value), `send-${id}-${b.id}`));
        input.addEventListener('dblclick', () => { input.value = '0'; store.setSend(id, b.id, 0); });
        const out = el('span', 'fx-param-value');
        row.append(el('span', 'fx-param-label', W(`→ ${b.label}`)), input, out);
        const box = el('div', 'fx-param-box');
        box.append(row);
        const lock = autoLock({ ui, key: sendKey(b.id), wrap: box, input, getTrackId: () => id, onOpen: () => { if (narrow.matches) ui.setDock(null); } });
        card.append(box);
        detailSends.push([b, { input, out, lock }]);
      }
      grid.append(card);
    }
    detailEl.append(grid, detailReset.node);
  }

  // Gesperrter Send-Regler der Effekt-Seite: Wert der Kurve an der Marke
  function showDetailSend(b, c) {
    const t = store.track(detailFor);
    if (!t) return;
    const v = Math.round(lockedValue(t, sendKey(b.id), engine) * 100) / 100;
    if (Number(c.input.value) !== v) c.input.value = String(v);
    const text = v > 0 ? `${Math.round(v * 100)} %` : 'aus';
    if (c.out.textContent !== text) c.out.textContent = text;
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
    if (live()) {
      for (const [id, s] of strips) {
        const level = id === MASTER ? engine.peakLevel() : busKey(id) ? engine.busPeak(busKey(id)) : engine.trackPeak(id);
        const db = level > 0 ? 20 * Math.log10(level) : -60;
        const frac = clamp((db + 48) / 48, 0, 1);
        s.peak = Math.max(frac, s.peak - 0.015);
        // Nur bei geändertem Ausschlag zeichnen; Maße kommen vom ResizeObserver, Farben einmal gelesen
        const c = s.meter;
        if (!meterSeen.has(c)) { meterSeen.add(c); meterSize.observe(c); }
        const box = meterBox.get(c);
        const key = box && `${s.peak}|${box.w}|${box.h}`;
        if (box && box.w > 0 && s.drawn !== key) { // Leinwand ohne Fläche (Zeile in eingeklappter Gruppe) bleibt ungezeichnet
          s.drawn = key;
          const dpr = window.devicePixelRatio || 1;
          const { w, h } = box;
          if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
          const g = c.getContext('2d');
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          meterColors ??= ((css) => Object.fromEntries(['--meter-off', '--meter-hot', '--meter-warm', '--meter-ok'].map((k) => [k, css.getPropertyValue(k).trim()])))(getComputedStyle(c));
          g.fillStyle = meterColors['--meter-off'];
          g.fillRect(0, 0, w, h);
          g.fillStyle = meterColors[s.peak > 0.92 ? '--meter-hot' : s.peak > 0.75 ? '--meter-warm' : '--meter-ok'];
          if (w > h * 2) g.fillRect(0, 0, w * s.peak, h); // Zeile neben den Spuren: Streifen füllt von links
          else { const top = h * (1 - s.peak); g.fillRect(0, top, w, h - top); }
        }
        if (s.locked) { const t = store.track(id); if (t) showPan(s, t); }
        for (const sd of s.sends || []) if (sd.locked) { const t = store.track(id); if (t) showSend(sd, t); }
      }
      if (detailFor) {
        for (const [b, c] of detailSends) if (!c.lock.btn.hidden) showDetailSend(b, c);
        for (const e of EFFECTS) {
          for (const [k, ctl] of detailControls.get(e.id)?.params ?? []) if (ctl.lock && !ctl.lock.btn.hidden) showFx(ctl, e.params[k]);
        }
      }
    }
    requestAnimationFrame(drawMeters);
  }
  requestAnimationFrame(drawMeters);

  function setOpen(open) {
    if (column()) { if (open) hooks.show?.(); return; }
    ui.setDock(open ? 'mixer' : ui.dock === 'mixer' ? null : ui.dock);
  }
  ui.on(() => {
    // Spalte statt Fach: „Mixer öffnen“ (ui.setDock('mixer')) zeigt den Reiter Mixer
    if (column() && ui.dock === 'mixer') { ui.setDock(null); hooks.show?.(); return; }
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
  ui.on(markSelection); // Auswahl im Arranger/Inspektor im Mixer markieren
  narrow.addEventListener('change', () => { detailFor = null; sync(); });
  if (arranger) {
    // Zeilen und Spalte: nach jedem Aufbau der Spuren und beim Wechsel des Reiters nachziehen
    document.getElementById('arr-scroll')?.addEventListener('arr-layout', () => { if (column() && colShown()) sync(); });
    new MutationObserver(() => { if (column() && colShown()) { sync(); markSelection(); } }).observe(app, { attributes: true, attributeFilter: ['data-side', 'data-mixcard'] });
  }
  return { setOpen, select, MASTER, hooks };
}
