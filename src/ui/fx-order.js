// Effekt-Reihenfolge per Ziehen (2.14, ADR 008): Inspektor-Liste `.fxl` und Handy-Karten `.fx-cards`.
// Maus: ab 4 px senkrecht hebt sich die Zeile; Finger: 350 ms halten, dann ziehen (Wischen scrollt). Ein Klick ohne
// Bewegung bleibt ein Klick (schaltet). Der Ton ändert sich erst beim Loslassen (ein Rückgängig-Schritt).

import { EFFECTS, fxOrderOf, isDefaultOrder } from '../effects.js';
import { el } from '../util.js';
import { pressHold, holdArea } from './touch.js';

const LABEL = Object.fromEntries(EFFECTS.map((e) => [e.id, e.label]));
const HOLD = 350;
const SLOP = 4;

// Kinder in die Reihenfolge `order` bringen (nur, was sich bewegt; der Fokus bleibt erhalten)
export function applyOrder(container, order, nodeOf) {
  const focus = document.activeElement;
  let moved = false;
  let prev = null;
  for (const n of order.map(nodeOf)) {
    if (!n) continue;
    const want = prev ? prev.nextElementSibling : container.firstElementChild;
    if (want !== n) { container.insertBefore(n, want); moved = true; }
    prev = n;
  }
  if (moved && focus && focus !== document.activeElement && container.contains(focus)) focus.focus({ preventScroll: true });
}

// Ziel-Index in der ganzen Reihenfolge, wenn fxId vor die sichtbare Zeile `beforeId` kommt (null = ans Ende der sichtbaren)
function targetIndex(order, fxId, visible, beforeId) {
  const rest = order.filter((id) => id !== fxId);
  if (beforeId) return rest.indexOf(beforeId);
  const lastVis = [...visible].reverse().find((id) => id !== fxId);
  return lastVis ? rest.indexOf(lastVis) + 1 : rest.length;
}

// „Filter vor Verzerrer“ bzw. „Hall nach Echo“ (ans Ende)
export function orderText(order, fxId, visible = order) {
  const vis = order.filter((id) => visible.includes(id));
  const i = vis.indexOf(fxId);
  if (i < 0) return '';
  if (i + 1 < vis.length) return `${LABEL[fxId]} vor ${LABEL[vis[i + 1]]}`;
  if (i > 0) return `${LABEL[fxId]} nach ${LABEL[vis[i - 1]]}`;
  return LABEL[fxId];
}

// Ziehen einrichten. container: Liste; itemOf(fxId) → Zeile; handleOf(fxId) → Griff (Name bzw. Kartenkopf);
// getOrder() → aktuelle Reihenfolge; onMove(fxId, toIndex) → Store; grid: Karten in Spalten (Einfügelinie senkrecht).
export function mountFxDrag(container, { ids, itemOf, handleOf, getOrder, onMove, grid = false }) {
  holdArea(container);
  const line = el('div', 'fx-drop-line');
  line.hidden = true;
  line.setAttribute('aria-hidden', 'true');
  let suppressClick = false;
  // Klick direkt nach einem Ziehen schluckt der Griff (sonst schaltet er den Effekt)
  container.addEventListener('click', (ev) => {
    if (!suppressClick) return;
    suppressClick = false;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);

  for (const id of ids) {
    const handle = handleOf(id);
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || itemOf(id).hidden) return;
      suppressClick = false;
      if (e.pointerType === 'touch') {
        pressHold(e, { ms: HOLD, onHold: (down) => start(id, down) });
        return;
      }
      const y0 = e.clientY;
      const pid = e.pointerId;
      const move = (ev) => {
        if (ev.pointerId !== pid) return;
        if (Math.abs(ev.clientY - y0) < SLOP && (!grid || Math.abs(ev.clientX - e.clientX) < SLOP)) return;
        cleanup();
        start(id, e, ev);
      };
      const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cleanup); window.removeEventListener('pointercancel', cleanup); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
    });
  }

  function scrollerOf(n) {
    for (let p = n.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }

  function start(fxId, down, first = null) {
    const order = getOrder();
    const visible = order.filter((id) => !itemOf(id).hidden);
    if (visible.length < 2) return;
    const item = itemOf(fxId);
    const others = visible.filter((id) => id !== fxId);
    const scroller = scrollerOf(container);
    // Ausgangslage relativ zur Liste (bleibt beim Scrollen gleich)
    const c0 = container.getBoundingClientRect();
    const rel = (n) => { const r = n.getBoundingClientRect(); return { l: r.left - c0.left, t: r.top - c0.top, w: r.width, h: r.height }; };
    const R = Object.fromEntries(visible.map((id) => [id, rel(itemOf(id))]));
    const me = R[fxId];
    const gap = parseFloat(getComputedStyle(container).rowGap) || 0;
    const lift = me.h + gap;
    const iFrom = visible.indexOf(fxId);
    const gx = down.clientX - c0.left;
    const gy = down.clientY - c0.top;
    let iTo = iFrom; // Platz unter den übrigen
    let lastPt = { x: down.clientX, y: down.clientY };
    let raf = 0;
    item.classList.add('fx-lifted');
    container.classList.add('fx-sorting');
    container.append(line);
    line.hidden = false;
    line.classList.toggle('grid', grid);
    const pid = down.pointerId;

    const place = () => {
      const c = container.getBoundingClientRect();
      const dx = grid ? lastPt.x - c.left - gx : 0;
      const dy = lastPt.y - c.top - gy;
      item.style.transform = `translate(${dx}px, ${dy}px)`;
      const cx = me.l + me.w / 2 + dx;
      const cy = me.t + me.h / 2 + dy;
      // Liste: nach oben zählt die Oberkante, nach unten die Unterkante der gezogenen Zeile (Zeilen sind verschieden hoch)
      const edgeY = dy < 0 ? me.t + dy : me.t + me.h + dy;
      iTo = others.length;
      for (let k = 0; k < others.length; k++) {
        const r = R[others[k]];
        const ahead = grid ? cy < r.t || (cy < r.t + r.h && cx < r.l + r.w / 2) : edgeY < r.t + r.h / 2;
        if (ahead) { iTo = k; break; }
      }
      // Liste: die anderen rücken weg
      others.forEach((id, k) => {
        let shift = 0;
        if (!grid) {
          const vi = k >= iFrom ? k + 1 : k; // Platz in der alten Liste
          if (vi > iFrom && k < iTo) shift = -lift;
          else if (vi < iFrom && k >= iTo) shift = lift;
        }
        itemOf(id).style.transform = shift ? `translateY(${shift}px)` : '';
      });
      // Einfügelinie am Platz, an dem die Zeile landet
      if (grid) {
        const ref = R[others[Math.min(iTo, others.length - 1)]];
        const x = Math.max(0, Math.min(c.width - 2, iTo < others.length ? ref.l - 5 : ref.l + ref.w + 3));
        Object.assign(line.style, { left: `${x}px`, top: `${ref.t}px`, height: `${ref.h}px` });
      } else {
        const top = iTo <= iFrom ? (iTo < others.length ? R[others[iTo]].t : me.t) : R[others[iTo - 1]].t + R[others[iTo - 1]].h - lift + gap;
        Object.assign(line.style, { top: `${top - gap / 2 - 1}px`, left: '0px', height: '' });
      }
    };
    // Am Rand der Scrollfläche weiterscrollen
    const edge = () => {
      raf = 0;
      if (!scroller) return;
      const r = scroller.getBoundingClientRect();
      const zone = 40;
      const v = lastPt.y < r.top + zone ? -(r.top + zone - lastPt.y) / 4 : lastPt.y > r.bottom - zone ? (lastPt.y - (r.bottom - zone)) / 4 : 0;
      if (!v) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += Math.max(-14, Math.min(14, v));
      if (scroller.scrollTop === before) return;
      place();
      raf = requestAnimationFrame(edge);
    };
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      if (ev.cancelable) ev.preventDefault();
      lastPt = { x: ev.clientX, y: ev.clientY };
      place();
      if (!raf) raf = requestAnimationFrame(edge);
    };
    const end = (ev, commit) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelAnimationFrame(raf);
      item.classList.remove('fx-lifted');
      container.classList.remove('fx-sorting');
      item.style.transform = '';
      for (const id of others) itemOf(id).style.transform = '';
      line.hidden = true;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      if (!commit) return;
      const to = targetIndex(order, fxId, visible, iTo < others.length ? others[iTo] : null);
      if (to !== order.indexOf(fxId)) onMove(fxId, to);
    };
    const up = (ev) => end(ev, true);
    const cancel = (ev) => end(ev, false);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    if (first) move(first); else place();
  }

  // Alt+↑/↓ am Schalter: einen sichtbaren Platz weiter
  return {
    step(fxId, dir) {
      const order = getOrder();
      const visible = order.filter((id) => !itemOf(id).hidden);
      const i = visible.indexOf(fxId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= visible.length) return false;
      const before = dir < 0 ? visible[j] : visible[j + 1] ?? null;
      onMove(fxId, targetIndex(order, fxId, visible, before));
      return true;
    },
  };
}

// Link „Reihenfolge zurücksetzen“: nur sichtbar, wenn die Reihenfolge abweicht
export function resetLink(onReset) {
  const b = el('button', 'insp-link fx-order-reset', 'Reihenfolge zurücksetzen');
  b.type = 'button';
  b.hidden = true;
  b.addEventListener('click', onReset);
  return { node: b, update(owner) { b.hidden = isDefaultOrder(fxOrderOf(owner)); } };
}
