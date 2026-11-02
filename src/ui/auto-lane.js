// Kurvenzeile (Automation, Spec v2.12): eine eigene Zeile unter der Spur, in der man die Lautstärke-Kurve zeichnet.
// Maus: Klick setzt einen Punkt, Ziehen verschiebt, Doppelklick und Entf löschen. Finger: Antippen setzt, Ziehen nur auf
// einem Punkt (sonst scrollt Wischen), Halten löscht. Geschlossen liegt die Kurve als dünne Linie über den Clips.
// Alle Änderungen laufen über Store-Aktionen; die Knoten der Punkte bleiben beim Ziehen stehen (Abgleich nach Index).

import { AUTO_PARAMS, AUTO_TEMPLATES, TEMPLATE_BARS, autoBreaks, autoKeys, autoValueAt, formatAutoValue, laneOf } from '../automation.js';
import { totalBeats } from '../model.js';
import { clamp, el, trackPointer } from '../util.js';
import { touch } from './place.js';
import { holdArea, pressHold } from './touch.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, cls) => { const n = document.createElementNS(SVGNS, tag); if (cls) n.setAttribute('class', cls); return n; };
const PAD = 9; // Rand oben und unten, damit Punkte am Anschlag nicht abgeschnitten werden
const DRAG_PX = 3; // Maus: erst ab so viel Bewegung wird aus dem Klick ein Ziehen
const TOUCH_SLOP = 6; // Finger: dasselbe, aber der Finger zittert mehr
const round2 = (v) => Math.round(v * 100) / 100;
const typing = (t) => (t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';

// Höhe der Zeile: 0,6 × Spurhöhe, mindestens 44 px (Finger 56 px)
export const autoRowHeight = (rowH) => Math.max(touch.matches ? 56 : 44, Math.round(rowH * 0.6));

// Polygonzug einer Kurve als SVG-Pfad (Stufen und Sprünge stecken schon in autoBreaks)
function curvePath(points, key, total, ppb, yOf) {
  const def = AUTO_PARAMS[key].def;
  return autoBreaks(points, 0, total, def).map(([b, v], i) => `${i ? 'L' : 'M'}${(b * ppb).toFixed(2)} ${yOf(v).toFixed(2)}`).join('');
}

// ---------- Vorlagen-Knöpfe (Inspektor „Spur“ und Spur-Menü am Handy) ----------

// Vorlage anwenden (Länge: zuletzt gewählte Takte, Vorgabe 4), Zeile öffnen, Einblender; auch direkt aus dem Spur-Menü
export function applyTemplate({ store, ui, engine, id, name }) {
  if (!id || id === 'master') return false;
  const res = store.applyAutoTemplate(id, name, { bars: ui.autoBars ?? 4, playheadBeat: engine?.heardBeat?.() ?? 0 });
  if (!res) { ui.flash?.('Hier ist kein Platz für diesen Verlauf.'); return false; }
  ui.autoLane?.open(id, res.key);
  const n = Math.round(((res.toBeat - res.fromBeat) / store.project.beatsPerBar) * 10) / 10;
  ui.flash?.(`${AUTO_TEMPLATES[name].label} über ${String(n).replace('.', ',')} ${n === 1 ? 'Takt' : 'Takte'}.`);
  return true;
}

// getTarget() liefert die Spur-ID (oder null); onDone() läuft nach einer Vorlage (z. B. Menü schließen)
export function templateControls({ store, ui, engine, getTarget, onDone, variant = 'insp' }) {
  const node = el('div', `auto-tpl auto-tpl-${variant}`);
  const btns = el('div', variant === 'menu' ? 'auto-tpl-btns' : 'insp-btns');
  const bars = el('div', 'insp-run-btns auto-bars');
  bars.setAttribute('role', 'group');
  bars.setAttribute('aria-label', 'Länge in Takten');
  const cap = el('span', 'auto-cap', 'Länge in Takten');
  node.append(btns, cap, bars);

  function apply(name) {
    if (applyTemplate({ store, ui, engine, id: getTarget(), name })) onDone?.();
  }
  for (const name of ['fadeIn', 'fadeOut']) {
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

  const ownerOf = (t) => (t === 'master' ? store.project.master : store.track(t));
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
    const head = el('div', 'auto-head');
    const chip = el('span', 'auto-chip');
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
    const curve = svgEl('path', 'auto-curve');
    svg.append(base, curve);
    const flag = el('div', 'auto-flag');
    flag.hidden = true;
    body.append(svg, flag);
    row.append(head, body);
    L = { target, key: openKeys.get(target) || 'volume', row, head, chip, close, body, svg, base, curve, flag, nodes: [], h: 44, sig: '' };
    lanes.set(target, L);
    close.addEventListener('click', () => closeLane(target));
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
    const name = store.track(L.target)?.name ?? 'Summe';
    const sig = `${L.key}|${Math.round(total * ppb)}|${L.h}|${total}|${ppb}|${JSON.stringify(pts)}|${name}`;
    if (sig === L.sig) return;
    L.sig = sig;
    const w = Math.max(1, Math.round(total * ppb));
    L.row.style.height = `${full}px`;
    L.svg.setAttribute('width', String(w));
    L.svg.setAttribute('height', String(L.h));
    L.chip.textContent = spec.label;
    L.chip.title = `Kurve: ${spec.label}`;
    L.body.setAttribute('aria-label', `${spec.label}-Kurve von ${name}: Enter setzt einen Punkt an der Abspielmarke`);
    const yTop = yOf(L, spec.max).toFixed(2);
    const yBot = yOf(L, spec.min).toFixed(2);
    L.base.setAttribute('d', `M0 ${yTop}H${w}M0 ${yBot}H${w}`);
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
      n.setAttribute('aria-valuetext', `${formatAutoValue(L.key, p.value)}, ${view.formatPos(p.beat)}`);
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
      const sig = `${w}|${h}|${ppb}|${JSON.stringify(keys.map((k) => laneOf(track, k)))}`;
      if (sig === o.sig) continue;
      o.sig = sig;
      o.svg.setAttribute('width', String(w));
      o.svg.setAttribute('height', String(h));
      o.svg.replaceChildren(...keys.map((k) => {
        const s = AUTO_PARAMS[k];
        const p = svgEl('path');
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
    drawOverlays();
  }

  function paintSel() {
    for (const L of lanes.values()) L.nodes.forEach((n, i) => n.classList.toggle('sel', !!sel && sel.target === L.target && sel.key === L.key && sel.i === i));
  }

  function setSel(L, i) {
    sel = i == null ? null : { target: L.target, key: L.key, i };
    if (sel) ui.selectTrack?.(L.target); // wählt die Spur (hebt die Clip-Auswahl auf); sel steht schon, bleibt also erhalten
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
    if (hit) setSel(L, i); else i = addAt(L, lx, ly, e);
    (L.nodes[i] || L.body).focus({ preventScroll: true });
    const d = i >= 0 && makeDrag(L, i, e);
    if (d) trackPointer(e, d.move, d.end, d.end);
  }

  // Finger: auf einem Punkt ziehen oder halten (löscht); auf freier Fläche setzt Antippen einen Punkt, Wischen scrollt
  function touchDown(e, L, hit, lx, ly) {
    if (!hit) { pressHold(e, { onTap: () => addAt(L, lx, ly, e) }); return; }
    setSel(L, hit.i);
    const d = makeDrag(L, hit.i, e);
    let held = false;
    let active = false;
    const stopHold = pressHold(e, { onHold: () => { held = true; d?.end(); removePoint(L, hit.i, true); } });
    const end = () => { stopHold(); d?.end(); };
    trackPointer(e, (ev) => {
      if (held || !d) return;
      if (!active) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < TOUCH_SLOP) return;
        active = true;
        stopHold();
      }
      d.move(ev);
    }, end, end);
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
      const v = round2(autoValueAt(pointsOf(L), beat, AUTO_PARAMS[L.key].def));
      const i = store.addAutoPoint(L.target, L.key, beat, v);
      if (i >= 0) { setSel(L, i); L.nodes[i]?.focus({ preventScroll: true }); }
      return;
    }
    const i = L.nodes.indexOf(node);
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
    if (!sel || (e.key !== 'Delete' && e.key !== 'Backspace') || typing(e.target) || e.ctrlKey || e.metaKey) return;
    const L = lanes.get(sel.target);
    if (!L || !openKeys.has(sel.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removePoint(L, sel.i, false);
  });

  ui.on(() => {
    if (sel && (ui.selectedClipId || ui.selectedTrackId !== sel.target)) { sel = null; paintSel(); }
  });
  store.on((_, reason) => { if (sel && (reason === 'undo' || reason === 'redo' || reason === 'replace')) { sel = null; paintSel(); } });

  // ---------- Öffnen und Schließen ----------
  function open(target, key = lastKey.get(target) || 'volume') {
    if (!autoKeys(target).includes(key) || !ownerOf(target)) return false;
    lastKey.set(target, key);
    openKeys.set(target, key);
    const L = ensure(target);
    L.key = key;
    view.relayout();
    requestAnimationFrame(() => view.reveal(L.row));
    ui.emit?.();
    return true;
  }

  function closeLane(target) {
    if (!openKeys.has(target)) return;
    openKeys.delete(target);
    if (sel?.target === target) sel = null;
    const L = lanes.get(target);
    L?.row.remove();
    lanes.delete(target);
    view.relayout();
    ui.emit?.();
  }

  const toggle = (target, key) => (openKeys.has(target) ? (closeLane(target), false) : open(target, key));

  // Taste A: Kurve der gewählten Spur (oder der Spur des gewählten Clips) auf- oder zuklappen
  function toggleSelected() {
    const c = ui.selectedClipId && store.findClip(ui.selectedClipId);
    const id = c?.track.id ?? ui.selectedTrackId;
    if (!id || !store.track(id)) { ui.flash?.('Wähle erst eine Spur aus – dann zeigt A ihre Kurve.'); return false; }
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
    }
  }

  const api = {
    open, close: closeLane, toggle, toggleSelected, isOpen: (t) => openKeys.has(t), rowNode, prune, render,
    get selected() { return sel ? { ...sel } : null; },
    keyOf: (t) => openKeys.get(t) ?? null,
  };
  ui.autoLane = api;
  return api;
}
