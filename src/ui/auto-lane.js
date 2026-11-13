// Kurvenzeile (Automation, Spec v2.12): eine eigene Zeile unter der Spur, in der man Lautstärke, Panorama oder einen
// Effekt-Wert zeichnet (Parameter-Chip wählt; Parameter mit Punkten leuchten; ist der Effekt aus, ist die Kurve
// gestrichelt). Maus: Klick setzt einen Punkt, Ziehen verschiebt, Doppelklick und Entf löschen, Klick auf den gewählten
// Punkt oder Rechtsklick zeigt die Mini-Leiste „Linear · Stufe · Löschen“. Finger: Antippen setzt, Antippen eines Punkts zeigt die Mini-Leiste, Ziehen nur auf einem Punkt (sonst scrollt
// Wischen), Halten löscht. Geschlossen liegt die Kurve als dünne Linie über den Clips.
// Alle Änderungen laufen über Store-Aktionen; die Knoten der Punkte bleiben beim Ziehen stehen (Abgleich nach Index).
// Summen-Zeile (Ziel 'master'): unter allen Spuren, Lautstärke und Master-Effekte; Taste A ohne Spurauswahl öffnet sie.

import { AUTO_PARAMS, AUTO_TEMPLATES, TEMPLATE_BARS, autoActive, autoBreaks, autoKeys, autoRest, autoValueAt, formatAutoValue, laneOf } from '../automation.js';
import { totalBeats } from '../model.js';
import { masterOf } from '../engine.js';
import { clamp, el, trackPointer } from '../util.js';
import { touch } from './place.js';
import { holdArea, pressHold } from './touch.js';
import { W } from './words.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, cls) => { const n = document.createElementNS(SVGNS, tag); if (cls) n.setAttribute('class', cls); return n; };
const PAD = 9; // Rand oben und unten, damit Punkte am Anschlag nicht abgeschnitten werden
const DRAG_PX = 3; // Maus: erst ab so viel Bewegung wird aus dem Klick ein Ziehen
const TOUCH_SLOP = 6; // Finger: dasselbe, aber der Finger zittert mehr
const round2 = (v) => Math.round(v * 100) / 100;
const CARET = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg>';
const typing = (t) => (t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';

// Höhe der Zeile: 0,6 × Spurhöhe, mindestens 44 px (Finger 56 px)
export const autoRowHeight = (rowH) => Math.max(touch.matches ? 56 : 44, Math.round(rowH * 0.6));

// Polygonzug einer Kurve als SVG-Pfad (Stufen und Sprünge stecken schon in autoBreaks)
function curvePath(points, key, total, ppb, yOf) {
  const def = AUTO_PARAMS[key].def;
  return autoBreaks(points, 0, total, def).map(([b, v], i) => `${i ? 'L' : 'M'}${(b * ppb).toFixed(2)} ${yOf(v).toFixed(2)}`).join('');
}

// ---------- Gesperrte Regler (Mixer, Inspektor) ----------
// Ein Regler, dessen Wert eine Kurve bestimmt (Panorama, Effekt-Werte), ist gedimmt; darüber liegt ein Knopf mit
// Kurven-Zeichen, der die Kurvenzeile mit diesem Parameter öffnet. update(owner) zeigt/verbirgt die Sperre und liefert,
// ob gesperrt ist (owner = Spur oder masterOf(project); getTrackId liefert die Spur-ID bzw. 'master').
export function autoLock({ ui, key, wrap, input, getTrackId, onOpen }) {
  const btn = el('button', 'auto-lock');
  btn.type = 'button';
  btn.hidden = true;
  btn.innerHTML = '<svg viewBox="0 0 16 12" aria-hidden="true"><path d="M1 10c3 0 3-8 7-8s4 6 7 6"/></svg>';
  btn.addEventListener('click', () => {
    const id = getTrackId();
    if (id && ui.autoLane?.open(id, key)) onOpen?.();
  });
  wrap.classList.add('auto-lockable');
  wrap.append(btn);
  return {
    btn,
    update(track) {
      const on = !!track && laneOf(track, key).length > 0;
      btn.hidden = !on;
      wrap.classList.toggle('auto-locked', on);
      input.disabled = on;
      if (on) {
        const label = `${AUTO_PARAMS[key].label} folgt der Kurve – Kurve zeigen`;
        btn.title = label;
        btn.setAttribute('aria-label', label);
      }
      return on;
    },
  };
}

// Wert eines gesperrten Reglers an der Marke (beim Abspielen die hörbare Position)
export const lockedValue = (track, key, engine) => autoValueAt(laneOf(track, key), engine?.heardBeat?.() ?? 0, autoRest(track, key));

// ---------- Vorlagen-Knöpfe (Inspektor „Spur“ und Spur-Menü am Handy) ----------

// Vorlage anwenden (Länge: zuletzt gewählte Takte, sonst die Vorgabe der Vorlage – 4, „Filter öffnen“ 8), Zeile öffnen,
// Einblender; auch direkt aus dem Spur-Menü. id = Spur-ID oder 'master' (Summe: Ein-/Ausblenden über alle Clips)
export function applyTemplate({ store, ui, engine, id, name }) {
  if (!id) return false;
  const res = store.applyAutoTemplate(id, name, { bars: ui.autoBars ?? AUTO_TEMPLATES[name].bars, playheadBeat: engine?.heardBeat?.() ?? 0 });
  if (!res) { ui.flash?.('Hier ist kein Platz für diesen Verlauf.'); return false; }
  ui.autoLane?.open(id, res.key);
  const n = Math.round(((res.toBeat - res.fromBeat) / store.project.beatsPerBar) * 10) / 10;
  ui.flash?.(`${id === 'master' ? W('Summe') + ': ' : ''}${AUTO_TEMPLATES[name].label} über ${String(n).replace('.', ',')} ${n === 1 ? 'Takt' : 'Takte'}.`);
  return true;
}

export const TEMPLATE_ORDER = ['fadeIn', 'fadeOut', 'filterOpen', 'filterClose'];
export const MASTER_TEMPLATES = ['fadeIn', 'fadeOut'];

// getTarget() liefert die Spur-ID, 'master' oder null; onDone() läuft nach einer Vorlage (z. B. Menü schließen).
// names: welche Vorlagen (Summe: Ein-/Ausblenden); bars = false: ohne Längen-Chips (Handy-Fach „Song“, zwei Tipps)
export function templateControls({ store, ui, engine, getTarget, onDone, variant = 'insp', names = TEMPLATE_ORDER, bars: withBars = true }) {
  const node = el('div', `auto-tpl auto-tpl-${variant}`);
  const btns = el('div', variant === 'insp' ? 'insp-btns' : 'auto-tpl-btns');
  const bars = el('div', 'insp-run-btns auto-bars');
  bars.setAttribute('role', 'group');
  bars.setAttribute('aria-label', 'Länge in Takten');
  const cap = el('span', 'auto-cap', 'Länge in Takten');
  node.append(btns);
  if (withBars) node.append(cap, bars);

  function apply(name) {
    if (applyTemplate({ store, ui, engine, id: getTarget(), name })) onDone?.();
  }
  for (const name of names) {
    const b = el('button', variant === 'menu' ? 'track-menu-item' : 'key', AUTO_TEMPLATES[name].label);
    b.type = 'button';
    b.dataset.template = name;
    b.addEventListener('click', () => apply(name));
    btns.append(b);
  }
  for (const n of TEMPLATE_BARS) {
    const b = el('button', 'key', String(n));
    b.type = 'button';
    b.dataset.bars = String(n);
    b.title = `${n} ${n === 1 ? 'Takt' : 'Takte'}`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => { ui.autoBars = n; update(); ui.emit?.(); });
    bars.append(b);
  }
  function update() {
    for (const b of bars.children) b.setAttribute('aria-pressed', String(Number(b.dataset.bars) === (ui.autoBars ?? 4)));
  }
  update();
  return { node, update };
}

// ---------- Zeilen ----------
// view: { ppb(), rowH(), snap(beat, ev), step(ev), formatPos(beat), relayout(), reveal(node) } aus dem Arranger
export function mountAutoLanes({ rowsEl, store, ui, engine, view }) {
  const lanes = new Map(); // Ziel (Spur-ID) → Zeile
  const openKeys = new Map(); // Ziel → Parameter der geöffneten Zeile
  const lastKey = new Map(); // zuletzt gewählter Parameter je Ziel (nur UI-Zustand)
  const overlays = new Map(); // Spur-ID → { svg, sig }
  let sel = null; // { target, key, i }: gewählter Punkt
  let dragSeq = 0;
  let keySeq = 0;
  let keyAt = 0;
  let lastType = 'mouse';
  let flagTimer = null;

  const ownerOf = (t) => (t === 'master' ? masterOf(store.project) : store.track(t));
  const pointsOf = (L) => laneOf(ownerOf(L.target), L.key);
  const spanOf = (L) => AUTO_PARAMS[L.key].max - AUTO_PARAMS[L.key].min;
  const yOf = (L, v) => PAD + (1 - (v - AUTO_PARAMS[L.key].min) / spanOf(L)) * (L.h - 2 * PAD);
  const valueAtY = (L, y) => {
    const s = AUTO_PARAMS[L.key];
    return clamp(s.min + (1 - (y - PAD) / (L.h - 2 * PAD)) * spanOf(L), s.min, s.max);
  };

  // ---------- Aufbau ----------
  function ensure(target) {
    let L = lanes.get(target);
    if (L) return L;
    const row = el('div', 'auto-row');
    row.dataset.trackId = target;
    if (target === 'master') row.classList.add('auto-master');
    const head = el('div', 'auto-head');
    // Summe: Beschriftung vor dem Chip (am Handy nur als Leuchtstrich, die Beschriftung trägt aria-label)
    if (target === 'master') head.append(el('span', 'auto-sum', W('Summe')));
    const chip = el('button', 'auto-chip');
    chip.type = 'button';
    chip.setAttribute('aria-haspopup', 'menu');
    chip.setAttribute('aria-expanded', 'false');
    const chipLabel = el('span', 'auto-chip-label');
    chip.append(chipLabel);
    chip.insertAdjacentHTML('beforeend', CARET);
    const close = el('button', 'auto-close');
    close.type = 'button';
    close.title = 'Kurve schließen';
    close.setAttribute('aria-label', 'Kurve schließen');
    close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    head.append(chip, close);
    const body = el('div', 'auto-body');
    body.tabIndex = 0;
    body.setAttribute('role', 'group');
    const svg = svgEl('svg', 'auto-svg');
    svg.setAttribute('aria-hidden', 'true');
    const base = svgEl('path', 'auto-base');
    const mid = svgEl('path', 'auto-mid');
    const curve = svgEl('path', 'auto-curve');
    svg.append(base, mid, curve);
    const flag = el('div', 'auto-flag');
    flag.hidden = true;
    body.append(svg, flag);
    row.append(head, body);
    L = { target, key: openKeys.get(target) || 'volume', row, head, chip, chipLabel, close, body, svg, base, mid, curve, flag, nodes: [], h: 44, sig: '' };
    lanes.set(target, L);
    close.addEventListener('click', () => closeLane(target));
    chip.addEventListener('click', () => (keyMenu.for === L ? closeKeyMenu() : openKeyMenu(L)));
    body.addEventListener('contextmenu', (e) => ctxMenu(e, L));
    body.addEventListener('pointerdown', (e) => down(e, L));
    body.addEventListener('dblclick', (e) => dbl(e, L));
    body.addEventListener('keydown', (e) => keys(e, L));
    body.addEventListener('focusin', (e) => {
      const i = L.nodes.indexOf(e.target.closest?.('.auto-pt'));
      if (i >= 0 && !(sel && sel.target === L.target && sel.i === i)) setSel(L, i);
    });
    holdArea(body);
    return L;
  }

  function makePoint(L) {
    const n = el('div', 'auto-pt');
    n.tabIndex = 0;
    n.setAttribute('role', 'slider');
    n.setAttribute('aria-orientation', 'vertical');
    L.body.insertBefore(n, L.flag);
    return n;
  }

  // ---------- Zeichnen ----------
  function draw(L) {
    const total = totalBeats(store.project);
    const ppb = view.ppb();
    const spec = AUTO_PARAMS[L.key];
    const full = autoRowHeight(view.rowH());
    L.h = full - 1; // ohne die Trennlinie unten
    const pts = pointsOf(L);
    const name = store.track(L.target)?.name ?? W('Summe');
    const lit = autoKeys(L.target).filter((k) => laneOf(ownerOf(L.target), k).length).join();
    const active = autoActive(ownerOf(L.target), L.key);
    const sig = `${L.key}|${Math.round(total * ppb)}|${L.h}|${total}|${ppb}|${JSON.stringify(pts)}|${name}|${lit}|${active}`;
    if (sig === L.sig) return;
    L.sig = sig;
    const w = Math.max(1, Math.round(total * ppb));
    L.row.style.height = `${full}px`;
    L.svg.setAttribute('width', String(w));
    L.svg.setAttribute('height', String(L.h));
    L.chipLabel.textContent = spec.label;
    L.chip.title = 'Parameter der Kurve wählen';
    L.chip.setAttribute('aria-label', W(`${L.target === 'master' ? 'Summen-Kurve' : 'Kurve'}: ${spec.label} – Parameter wählen`));
    L.chip.classList.toggle('lit', lit.length > 0);
    L.row.dataset.key = L.key;
    // Effekt aus: die Kurve wirkt nicht und ist gestrichelt (der erste Punkt schaltet den Effekt ein)
    L.row.classList.toggle('inactive', !active);
    L.body.setAttribute('aria-label', `${spec.label}-Kurve von ${name}${active ? '' : ' (Effekt aus, wirkt nicht)'}: Enter setzt einen Punkt an der Abspielmarke`);
    const yTop = yOf(L, spec.max).toFixed(2);
    const yBot = yOf(L, spec.min).toFixed(2);
    L.base.setAttribute('d', `M0 ${yTop}H${w}M0 ${yBot}H${w}`);
    // Panorama: Mittellinie (Mitte = 0)
    L.mid.setAttribute('d', spec.center != null ? `M0 ${yOf(L, spec.center).toFixed(2)}H${w}` : '');
    L.curve.setAttribute('d', pts.length ? curvePath(pts, L.key, total, ppb, (v) => yOf(L, v)) : '');
    while (L.nodes.length < pts.length) L.nodes.push(makePoint(L));
    while (L.nodes.length > pts.length) L.nodes.pop().remove();
    pts.forEach((p, i) => {
      const n = L.nodes[i];
      n.style.left = `${(p.beat * ppb).toFixed(2)}px`;
      n.style.top = `${yOf(L, p.value).toFixed(2)}px`;
      n.setAttribute('aria-label', `Punkt ${i + 1}`);
      n.setAttribute('aria-valuemin', String(spec.min));
      n.setAttribute('aria-valuemax', String(spec.max));
      n.setAttribute('aria-valuenow', String(p.value));
      n.setAttribute('aria-valuetext', `${formatAutoValue(L.key, p.value)}, ${view.formatPos(p.beat)}${p.curve === 'step' ? ', Stufe' : ''}`);
      n.classList.toggle('step', p.curve === 'step');
    });
  }

  // Geschlossene Zeile: Kurve als dünne Linie über den Clips (nur Anzeige)
  function drawOverlays() {
    const total = totalBeats(store.project);
    const ppb = view.ppb();
    const h = view.rowH();
    const w = Math.max(1, Math.round(total * ppb));
    const seen = new Set();
    for (const lane of rowsEl.querySelectorAll('.lane[data-track-id]')) {
      const id = lane.dataset.trackId;
      const track = store.track(id);
      const keys = track && !openKeys.has(id) ? autoKeys(id).filter((k) => laneOf(track, k).length) : [];
      let o = overlays.get(id);
      if (!keys.length) { if (o) { o.svg.remove(); overlays.delete(id); } continue; }
      seen.add(id);
      if (!o || o.svg.parentElement !== lane) {
        o?.svg.remove();
        o = { svg: svgEl('svg', 'auto-over'), sig: '' };
        o.svg.setAttribute('aria-hidden', 'true');
        lane.append(o.svg);
        overlays.set(id, o);
      }
      const sig = `${w}|${h}|${ppb}|${JSON.stringify(keys.map((k) => laneOf(track, k)))}|${keys.map((k) => autoActive(track, k)).join()}`;
      if (sig === o.sig) continue;
      o.sig = sig;
      o.svg.setAttribute('width', String(w));
      o.svg.setAttribute('height', String(h));
      o.svg.replaceChildren(...keys.map((k) => {
        const s = AUTO_PARAMS[k];
        const p = svgEl('path', autoActive(track, k) ? null : 'off');
        const y = (v) => 6 + (1 - (v - s.min) / (s.max - s.min)) * (h - 12);
        p.setAttribute('d', curvePath(laneOf(track, k), k, total, ppb, y));
        return p;
      }));
    }
    for (const [id, o] of overlays) if (!seen.has(id)) { o.svg.remove(); overlays.delete(id); }
  }

  function render() {
    for (const [target, L] of lanes) {
      if (!openKeys.has(target)) continue;
      L.key = openKeys.get(target);
      draw(L);
    }
    if (sel) {
      const L = lanes.get(sel.target);
      if (!L || sel.i >= pointsOf(L).length) sel = null;
    }
    paintSel();
    placeBar();
    drawOverlays();
  }

  const isSel = (L, i) => !!sel && sel.target === L.target && sel.key === L.key && sel.i === i;

  function paintSel() {
    for (const L of lanes.values()) L.nodes.forEach((n, i) => n.classList.toggle('sel', !!sel && sel.target === L.target && sel.key === L.key && sel.i === i));
  }

  function setSel(L, i) {
    if (!sel || !L || sel.target !== L.target || sel.key !== L.key || sel.i !== i) hideBar();
    sel = i == null ? null : { target: L.target, key: L.key, i };
    // wählt die Spur (hebt die Clip-Auswahl auf); Summe: nichts gewählt = Inspektor „Song“ mit Master. sel steht schon,
    // bleibt also erhalten
    if (sel && L.target === 'master') { ui.select?.(null); ui.selectTrack?.(null); } else if (sel) ui.selectTrack?.(L.target);
    paintSel();
  }

  // ---------- Fähnchen ----------
  function showFlag(L, i, hideAfter = 0) {
    const p = pointsOf(L)[i];
    const n = L.nodes[i];
    if (!p || !n) return;
    L.flag.textContent = `${formatAutoValue(L.key, p.value)} · ${view.formatPos(p.beat)}`;
    L.flag.hidden = false;
    const y = yOf(L, p.value);
    const lift = touch.matches ? 34 : 12; // am Finger höher, damit der Finger das Fähnchen nicht verdeckt
    const below = !touch.matches && y < 30;
    L.flag.classList.toggle('below', below);
    L.flag.style.left = `${Math.max(48, p.beat * view.ppb())}px`;
    L.flag.style.top = `${below ? y + 14 : y - lift}px`;
    clearTimeout(flagTimer);
    if (hideAfter) flagTimer = setTimeout(() => { L.flag.hidden = true; }, hideAfter);
  }
  const hideFlag = (L) => { clearTimeout(flagTimer); L.flag.hidden = true; };

  // ---------- Punkte ----------
  // Treffer: nächster Punkt innerhalb eines Quadrats um ihn (Maus 20 px, Finger 44 px Kantenlänge)
  function hitAt(L, lx, ly, type) {
    const r = type === 'mouse' ? 10 : type === 'pen' ? 16 : 22;
    const ppb = view.ppb();
    let best = null;
    pointsOf(L).forEach((p, i) => {
      const dx = Math.abs(p.beat * ppb - lx);
      const dy = Math.abs(yOf(L, p.value) - ly);
      if (dx > r || dy > r) return;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { i, d };
    });
    return best;
  }

  function addAt(L, lx, ly, ev) {
    const beat = clamp(view.snap(lx / view.ppb(), ev), 0, totalBeats(store.project));
    const i = store.addAutoPoint(L.target, L.key, beat, round2(valueAtY(L, ly)));
    if (i >= 0) setSel(L, i);
    return i;
  }

  function removePoint(L, i, announce) {
    hideBar();
    store.deleteAutoPoint(L.target, L.key, i);
    if (sel && sel.target === L.target) { sel = null; paintSel(); }
    if (announce) ui.flash?.('Punkt gelöscht');
  }

  // Ziehen eines Punkts: relativ zum Griffpunkt, rastet auf das Arranger-Raster (Umschalt: frei), bleibt zwischen den
  // Nachbarn; alle Bewegungen eines Ziehvorgangs sind ein Rückgängig-Schritt
  function makeDrag(L, i, e) {
    const p0 = pointsOf(L)[i];
    if (!p0) return null;
    const co = `auto-drag-${++dragSeq}`;
    const spec = AUTO_PARAMS[L.key];
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    return {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
        if (!moved) { moved = true; L.row.classList.add('dragging'); L.nodes[i]?.classList.add('drag'); }
        const pts = pointsOf(L);
        const total = totalBeats(store.project);
        const st = view.step(ev);
        let beat = clamp(view.snap(p0.beat + (ev.clientX - x0) / view.ppb(), ev), 0, total);
        const lo = i > 0 ? pts[i - 1].beat + st : 0;
        const hi = i < pts.length - 1 ? pts[i + 1].beat - st : total;
        if (lo <= hi) beat = clamp(beat, lo, hi);
        const v = round2(clamp(p0.value - ((ev.clientY - y0) / (L.h - 2 * PAD)) * (spec.max - spec.min), spec.min, spec.max));
        store.moveAutoPoint(L.target, L.key, i, beat, v, co);
        showFlag(L, i);
      },
      end() {
        L.row.classList.remove('dragging');
        L.nodes[i]?.classList.remove('drag');
        hideFlag(L);
      },
      get moved() { return moved; },
    };
  }

  function down(e, L) {
    if (e.button !== 0) return;
    lastType = e.pointerType;
    const rect = L.body.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const hit = hitAt(L, lx, ly, e.pointerType);
    if (e.pointerType === 'touch') { touchDown(e, L, hit, lx, ly); return; }
    e.preventDefault();
    let i = hit ? hit.i : -1;
    const again = !!hit && isSel(L, i);
    if (hit) setSel(L, i); else i = addAt(L, lx, ly, e);
    (L.nodes[i] || L.body).focus({ preventScroll: true });
    const d = i >= 0 && makeDrag(L, i, e);
    if (!d) return;
    if (!again) hideBar();
    // Klick (ohne Ziehen) auf den schon gewählten Punkt: Mini-Leiste
    trackPointer(e, (ev) => { d.move(ev); if (d.moved) hideBar(); }, () => { d.end(); if (again && !d.moved) showBar(L, i); }, d.end);
  }

  // Rechtsklick auf einen Punkt: wählen und Mini-Leiste zeigen
  function ctxMenu(e, L) {
    const rect = L.body.getBoundingClientRect();
    const hit = hitAt(L, e.clientX - rect.left, e.clientY - rect.top, lastType === 'touch' ? 'touch' : 'mouse');
    e.preventDefault();
    if (!hit) return;
    setSel(L, hit.i);
    showBar(L, hit.i);
  }

  // Finger: auf einem Punkt ziehen oder halten (löscht); auf freier Fläche setzt Antippen einen Punkt, Wischen scrollt
  function touchDown(e, L, hit, lx, ly) {
    if (!hit) { pressHold(e, { onTap: () => addAt(L, lx, ly, e) }); return; }
    setSel(L, hit.i);
    const d = makeDrag(L, hit.i, e);
    let held = false;
    let active = false;
    const stopHold = pressHold(e, { onHold: () => { held = true; hideBar(); d?.end(); removePoint(L, hit.i, true); } });
    const end = () => { stopHold(); d?.end(); };
    hideBar();
    trackPointer(e, (ev) => {
      if (held || !d) return;
      if (!active) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < TOUCH_SLOP) return;
        active = true;
        stopHold();
      }
      d.move(ev);
    }, () => { end(); if (!held && !active) showBar(L, hit.i); }, end);
  }

  function dbl(e, L) {
    if (lastType === 'touch') return;
    const rect = L.body.getBoundingClientRect();
    const hit = hitAt(L, e.clientX - rect.left, e.clientY - rect.top, 'mouse');
    if (hit) removePoint(L, hit.i, false);
  }

  // Tastatur: Pfeile bewegen den gewählten Punkt (Umschalt fein), Enter auf der Zeile setzt einen Punkt an der Abspielmarke
  function keys(e, L) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const node = e.target.closest?.('.auto-pt');
    if (!node) {
      if (e.key !== 'Enter' || e.target !== L.body) return;
      e.preventDefault();
      const beat = clamp(view.snap(engine.heardBeat(), e), 0, totalBeats(store.project));
      const v = round2(autoValueAt(pointsOf(L), beat, autoRest(ownerOf(L.target), L.key)));
      const i = store.addAutoPoint(L.target, L.key, beat, v);
      if (i >= 0) { setSel(L, i); L.nodes[i]?.focus({ preventScroll: true }); }
      return;
    }
    const i = L.nodes.indexOf(node);
    if (i >= 0 && e.key === 'Enter') {
      e.preventDefault();
      setSel(L, i);
      showBar(L, i);
      bar.node.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      return;
    }
    const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
    const dy = { ArrowUp: 1, ArrowDown: -1 }[e.key] ?? 0;
    if (i < 0 || (!dx && !dy)) return;
    e.preventDefault();
    const pts = pointsOf(L);
    const p = pts[i];
    if (!p) return;
    const spec = AUTO_PARAMS[L.key];
    const total = totalBeats(store.project);
    const st = view.step(e);
    const lo = i > 0 ? pts[i - 1].beat + st : 0;
    const hi = i < pts.length - 1 ? pts[i + 1].beat - st : total;
    const beat = lo <= hi ? clamp(p.beat + dx * st, lo, hi) : p.beat;
    const v = round2(clamp(p.value + dy * (e.shiftKey ? 0.01 : 0.05) * (spec.max - spec.min), spec.min, spec.max));
    const now = performance.now();
    if (now - keyAt > 800) keySeq++;
    keyAt = now;
    store.moveAutoPoint(L.target, L.key, i, beat, v, `auto-key-${keySeq}`);
    showFlag(L, i, 1000);
  }

  // Entf löscht den gewählten Punkt (vor dem Clip-Löschen im Hauptfenster)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (bar.L || keyMenu.for)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const back = bar.L && sel ? bar.L.nodes[sel.i] : keyMenu.for?.chip;
      hideBar();
      closeKeyMenu();
      back?.focus({ preventScroll: true });
      return;
    }
    if (!sel || (e.key !== 'Delete' && e.key !== 'Backspace') || typing(e.target) || e.ctrlKey || e.metaKey) return;
    const L = lanes.get(sel.target);
    if (!L || !openKeys.has(sel.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removePoint(L, sel.i, false);
  });

  ui.on(() => {
    const other = sel && (sel.target === 'master' ? !!ui.selectedTrackId : ui.selectedTrackId !== sel.target);
    if (sel && (ui.selectedClipId || other)) { sel = null; paintSel(); hideBar(); }
  });
  store.on((_, reason) => { if (sel && (reason === 'undo' || reason === 'redo' || reason === 'replace' || reason === 'open')) { sel = null; paintSel(); hideBar(); } });

  // ---------- Mini-Leiste am gewählten Punkt: Linear · Stufe · Löschen ----------
  const bar = { node: el('div', 'auto-bar'), L: null, btns: {} };
  bar.node.setAttribute('role', 'toolbar');
  bar.node.setAttribute('aria-label', 'Punkt');
  bar.node.hidden = true;
  for (const [id, label] of [['linear', 'Linear'], ['step', 'Stufe'], ['delete', 'Löschen']]) {
    const b = el('button', `auto-bar-btn auto-bar-${id}`, label);
    b.type = 'button';
    b.dataset.act = id;
    if (id !== 'delete') b.title = id === 'step' ? 'Wert halten, am nächsten Punkt springen' : 'Gerade zum nächsten Punkt';
    bar.btns[id] = b;
    bar.node.append(b);
  }
  // Die Leiste darf weder Punkte setzen noch die Auswahl verlieren
  bar.node.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.node.addEventListener('dblclick', (e) => e.stopPropagation());
  bar.node.addEventListener('contextmenu', (e) => e.stopPropagation());
  bar.node.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const L = bar.L;
    if (!act || !L || !sel) return;
    const i = sel.i;
    if (act === 'delete') { removePoint(L, i, true); L.body.focus({ preventScroll: true }); return; }
    store.setAutoCurve(L.target, L.key, i, act === 'step' ? 'step' : null);
    showBar(L, i);
  });

  function showBar(L, i) {
    const p = pointsOf(L)[i];
    if (!p) { hideBar(); return; }
    if (bar.node.parentElement !== L.body) L.body.append(bar.node);
    bar.L = L;
    bar.node.hidden = false;
    const step = p.curve === 'step';
    bar.btns.linear.setAttribute('aria-pressed', String(!step));
    bar.btns.step.setAttribute('aria-pressed', String(step));
    placeBar();
  }

  // Über dem Punkt (in der oberen Hälfte darunter), nie links aus der Zeile hinaus
  function placeBar() {
    const L = bar.L;
    if (!L || bar.node.hidden) return;
    const p = sel && sel.target === L.target && sel.key === L.key ? pointsOf(L)[sel.i] : null;
    if (!p || !openKeys.has(L.target) || lanes.get(L.target) !== L) { hideBar(); return; }
    const x = p.beat * view.ppb();
    const y = yOf(L, p.value);
    const gap = touch.matches ? 26 : 14;
    const above = y > L.h / 2;
    bar.node.classList.toggle('below', !above);
    bar.node.style.left = `${Math.max(x, (bar.node.offsetWidth || 160) / 2 + 4)}px`;
    bar.node.style.top = `${above ? y - gap : y + gap}px`;
  }

  function hideBar() {
    if (!bar.L) return;
    bar.L = null;
    bar.node.hidden = true;
  }
  document.addEventListener('pointerdown', (e) => {
    if (bar.L && !bar.node.contains(e.target) && !e.target.closest?.('.auto-pt')) hideBar();
    if (keyMenu.for && !keyMenu.node.contains(e.target) && !keyMenu.for.chip.contains(e.target)) closeKeyMenu();
  }, true);

  // ---------- Parameter-Auswahl (Chip): Lautstärke, Panorama, Effekt-Werte; Kurven mit Punkten leuchten ----------
  const keyMenu = { node: el('div', 'auto-keys'), for: null };
  keyMenu.node.setAttribute('role', 'menu');
  keyMenu.node.hidden = true;
  document.body.append(keyMenu.node);

  function openKeyMenu(L) {
    hideBar();
    const owner = ownerOf(L.target);
    const items = autoKeys(L.target).map((k) => {
      const b = el('button', 'auto-key');
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(k === L.key));
      b.dataset.key = k;
      const has = laneOf(owner, k).length > 0;
      b.append(el('span', `auto-dot${has ? ' on' : ''}`), el('span', null, AUTO_PARAMS[k].label));
      if (has) b.title = 'Hat eine Kurve';
      b.addEventListener('click', () => { closeKeyMenu(); open(L.target, k); lanes.get(L.target)?.chip.focus({ preventScroll: true }); });
      return b;
    });
    if (laneOf(owner, L.key).length) {
      const del = el('button', 'auto-key auto-key-del', 'Kurve löschen');
      del.type = 'button';
      del.setAttribute('role', 'menuitem');
      del.addEventListener('click', () => { closeKeyMenu(); clearCurve(L.target, L.key); L.chip.focus({ preventScroll: true }); });
      items.push(del);
    }
    keyMenu.node.replaceChildren(...items);
    keyMenu.for = L;
    keyMenu.node.hidden = false;
    L.chip.setAttribute('aria-expanded', 'true');
    const r = L.chip.getBoundingClientRect();
    const mw = keyMenu.node.offsetWidth;
    const mh = keyMenu.node.offsetHeight;
    keyMenu.node.style.left = `${clamp(r.left, 8, innerWidth - mw - 8)}px`;
    keyMenu.node.style.top = `${r.bottom + 4 + mh > innerHeight - 8 ? r.top - mh - 4 : r.bottom + 4}px`;
    (keyMenu.node.querySelector('[aria-checked="true"]') || keyMenu.node.firstChild)?.focus({ preventScroll: true });
  }

  function closeKeyMenu() {
    if (!keyMenu.for) return;
    keyMenu.for.chip.setAttribute('aria-expanded', 'false');
    keyMenu.for = null;
    keyMenu.node.hidden = true;
  }
  keyMenu.node.addEventListener('keydown', (e) => {
    const items = [...keyMenu.node.querySelectorAll('button')];
    const k = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length]?.focus(); }
  });
  window.addEventListener('scroll', () => closeKeyMenu(), { passive: true, capture: true });

  // Kurve des Parameters löschen (Chip-Menü, Spur-Menü): Panorama- und Effekt-Regler bekommen ihren alten Wert zurück
  function clearCurve(target, key) {
    hideBar();
    if (sel?.target === target && sel.key === key) { sel = null; paintSel(); }
    store.clearAutomation(target, key);
    ui.flash?.(`${AUTO_PARAMS[key].label}-Kurve gelöscht`);
  }

  // ---------- Öffnen und Schließen ----------
  function open(target, key = lastKey.get(target) || 'volume') {
    if (!autoKeys(target).includes(key) || !ownerOf(target)) return false;
    if (sel?.target === target && sel.key !== key) { sel = null; hideBar(); }
    lastKey.set(target, key);
    openKeys.set(target, key);
    const L = ensure(target);
    L.key = key;
    view.relayout();
    view.reveal(L.row);
    requestAnimationFrame(() => view.reveal(L.row));
    ui.emit?.();
    return true;
  }

  function closeLane(target) {
    if (!openKeys.has(target)) return;
    openKeys.delete(target);
    if (sel?.target === target) sel = null;
    hideBar();
    if (keyMenu.for?.target === target) closeKeyMenu();
    const L = lanes.get(target);
    L?.row.remove();
    lanes.delete(target);
    view.relayout();
    ui.emit?.();
  }

  const toggle = (target, key) => (openKeys.has(target) ? (closeLane(target), false) : open(target, key));

  // Taste A: Kurve der gewählten Spur (oder der Spur des gewählten Clips) auf- oder zuklappen; ohne Auswahl die Summe
  function toggleSelected() {
    const c = ui.selectedClipId && store.findClip(ui.selectedClipId);
    const id = c?.track.id ?? ui.selectedTrackId;
    if (!id || !store.track(id)) return toggle('master');
    return toggle(id);
  }

  // Für den Arranger: Zeilen in die Reihenfolge einhängen, verwaiste entfernen
  const rowNode = (target) => (openKeys.has(target) ? ensure(target).row : null);
  function prune(ids) {
    for (const t of [...lanes.keys()]) {
      if (t === 'master' || ids.has(t)) continue;
      lanes.get(t).row.remove();
      lanes.delete(t);
      openKeys.delete(t);
      lastKey.delete(t);
      if (sel?.target === t) sel = null;
      if (bar.L?.target === t) hideBar();
      if (keyMenu.for?.target === t) closeKeyMenu();
    }
  }

  const api = {
    open, close: closeLane, toggle, toggleSelected, isOpen: (t) => openKeys.has(t), rowNode, prune, render,
    get selected() { return sel ? { ...sel } : null; },
    get barOpen() { return !!bar.L; },
    keyOf: (t) => openKeys.get(t) ?? null,
    // zuletzt gewählter Parameter (auch bei geschlossener Zeile, z. B. für „Kurve löschen“ im Spur-Menü)
    lastKeyOf: (t) => openKeys.get(t) ?? lastKey.get(t) ?? 'volume',
    clear: clearCurve,
  };
  ui.autoLane = api;
  return api;
}
