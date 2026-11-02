// Zoom-Leisten des Arrangers: unten waagrecht (Zeit), rechts senkrecht (Spuren).
// Der Daumen zeigt den sichtbaren Ausschnitt; Ziehen scrollt, ein Klick in die Bahn springt dorthin.
// An beiden Enden des Daumens sitzt ein Greifer: Ziehen ändert die Größe des Daumens und damit den Zoom
// (waagrecht Schläge je Pixel, senkrecht Spurhöhe); die gegenüberliegende Kante bleibt stehen.
// Die Leisten lesen nur aus dem Arranger (metrics) und schreiben über dessen Zoom – nichts davon liegt im Undo-Verlauf.

import { clamp, el, trackPointer } from '../util.js';
import { touch, narrow } from './place.js';
import { MIN_PPB, MAX_PPB, MIN_TRACK_ZOOM, MAX_TRACK_ZOOM } from './arranger.js';
import { lsKey } from '../edition.js';

const KEY = lsKey('loopwerk.zoom');

// Zoom-Stufe pro Gerät merken (kein Projektinhalt)
export function loadZoom() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    const num = (x, lo, hi) => (Number.isFinite(x) ? clamp(x, lo, hi) : undefined);
    return { ppb: num(v?.ppb, MIN_PPB, MAX_PPB), trackZoom: num(v?.trackZoom, MIN_TRACK_ZOOM, MAX_TRACK_ZOOM) };
  } catch {
    return {};
  }
}

export function mountZoomBars({ root, arranger, ui }) {
  const wrap = root.parentElement;
  const app = document.getElementById('app');
  const grip = (axis, which) => {
    const g = el('div', `zbar-grip zbar-grip-${which}`);
    g.title = axis === 'x' ? 'Ziehen: Zeit zoomen' : 'Ziehen: Spurhöhe ändern';
    return g;
  };

  function makeBar(axis) {
    const vertical = axis === 'y';
    const bar = el('div', `zbar zbar-${axis}`);
    const thumb = el('div', 'zbar-thumb');
    thumb.tabIndex = 0;
    thumb.setAttribute('role', 'scrollbar');
    thumb.setAttribute('aria-controls', root.id);
    thumb.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    thumb.setAttribute('aria-label', vertical ? 'Spuren scrollen – Plus und Minus ändern die Spurhöhe' : 'Zeit scrollen – Plus und Minus zoomen');
    thumb.setAttribute('aria-valuemin', '0');
    thumb.setAttribute('aria-valuemax', '100');
    const a = grip(axis, 'a');
    const b = grip(axis, 'b');
    thumb.append(a, b);
    bar.append(thumb);
    wrap.append(bar);
    return { axis, vertical, bar, thumb, a, b, T: 0, L: 0, S: 0 };
  }
  const X = makeBar('x');
  const Y = makeBar('y');

  // Kleinste Länge des Daumens: Greifer und mindestens ein Stück Körper müssen draufpassen (Finger: je 44 px)
  const minLen = () => (narrow.matches ? 56 : touch.matches ? 132 : 44);
  const lenOf = (f, T) => clamp(Math.min(1, f) * T, Math.min(minLen(), T), T);

  // Je Richtung: sichtbar, Inhalt, aktuelle Position, Position setzen
  const view = (ax, m) => (ax.vertical ? m.vy : m.vx);
  const content = (ax, m) => (ax.vertical ? m.cy : m.cx);
  const pos = (ax) => (ax.vertical ? root.scrollTop : root.scrollLeft);
  const setPos = (ax, v) => { if (ax.vertical) root.scrollTop = v; else root.scrollLeft = v; };
  const trackLen = (ax) => (ax.vertical ? ax.bar.clientHeight : ax.bar.clientWidth);
  const coord = (ax, ev) => {
    const r = ax.bar.getBoundingClientRect();
    return ax.vertical ? ev.clientY - r.top : ev.clientX - r.left;
  };

  // Daumen an den Arranger anpassen
  function paint(ax, m) {
    const T = trackLen(ax);
    const v = view(ax, m);
    const c = content(ax, m);
    const f = c > 0 ? v / c : 1;
    const range = Math.max(0, c - v);
    const L = lenOf(f, T);
    const S = range > 0 && T > L ? clamp(pos(ax) / range, 0, 1) * (T - L) : 0;
    Object.assign(ax, { T, L, S });
    const st = ax.thumb.style;
    if (ax.vertical) { st.top = S + 'px'; st.height = L + 'px'; } else { st.left = S + 'px'; st.width = L + 'px'; }
    ax.thumb.classList.toggle('full', range <= 0.5);
    ax.thumb.setAttribute('aria-valuenow', String(range > 0 ? Math.round((clamp(pos(ax), 0, range) / range) * 100) : 0));
  }

  let raf = 0;
  function update() {
    raf = 0;
    const m = arranger.metrics();
    wrap.style.setProperty('--zhead', m.headW + 'px');
    wrap.style.setProperty('--zruler', m.ruler + 'px');
    // Ein offenes Fach deckt den unteren Rand: die Leisten enden darüber
    wrap.style.setProperty('--zpad', (app?.classList.contains('dock-open') ? m.pad : 0) + 'px');
    paint(X, m);
    paint(Y, m);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  root.addEventListener('scroll', schedule, { passive: true });
  root.addEventListener('arr-layout', schedule);
  const ro = new ResizeObserver(schedule);
  ro.observe(wrap);
  ro.observe(root.firstElementChild || root);
  narrow.addEventListener('change', schedule);
  touch.addEventListener('change', schedule);

  // ---------- Daumen ziehen (scrollt) und in die Bahn klicken (springt) ----------

  function dragThumb(e, ax, start) {
    const m = arranger.metrics();
    const range = Math.max(0, content(ax, m) - view(ax, m));
    const p0 = coord(ax, e);
    const free = ax.T - ax.L;
    let S0 = ax.S;
    if (start === 'center') {
      S0 = clamp(p0 - ax.L / 2, 0, free);
    }
    const apply = (s) => { setPos(ax, free > 0 ? clamp(s / free, 0, 1) * range : 0); paint(ax, arranger.metrics()); };
    if (start === 'center') apply(S0);
    ax.bar.classList.add('active');
    trackPointer(e, (ev) => apply(clamp(S0 + coord(ax, ev) - p0, 0, free)),
      () => ax.bar.classList.remove('active'), () => ax.bar.classList.remove('active'));
  }

  // ---------- Greifer ziehen (zoomt, Gegenkante bleibt) ----------

  function dragGrip(e, ax, which) {
    const m0 = arranger.metrics();
    const { T, L: L0, S: S0 } = ax;
    const f0 = Math.min(1, view(ax, m0) / Math.max(1, content(ax, m0)));
    const fixedEdge = which === 'a' ? S0 + L0 : S0; // Kante, die stehen bleibt
    const grabbed = which === 'a' ? S0 : S0 + L0;
    const off = coord(ax, e) - grabbed;
    // Auch unter die Mindestlänge ziehen darf man (weiter hineinzoomen); der Daumen bleibt dann bei seiner Mindestlänge
    const floor = 4;
    ax.bar.classList.add('active', 'zooming');
    trackPointer(e, (ev) => {
      const edge = coord(ax, ev) - off;
      const newL = which === 'a' ? fixedEdge - clamp(edge, 0, fixedEdge - floor) : clamp(edge, fixedEdge + floor, T) - fixedEdge;
      const f = Math.max(1e-4, f0 * (newL / L0));
      // Ziel-Zoom aus dem Anteil, den der Ausschnitt am Inhalt haben soll
      const m = arranger.metrics();
      const want = ax.vertical
        ? { tz: ((m.vy / f - m.fixed) / Math.max(1, m.n)) / m.base }
        : { ppb: m.vx / (f * m.beats) };
      // Danach so scrollen, dass die Gegenkante des Daumens am selben Pixel steht
      arranger.setView(want, { after: () => {
        const m2 = arranger.metrics();
        const L2 = lenOf(view(ax, m2) / Math.max(1, content(ax, m2)), T);
        const range = Math.max(0, content(ax, m2) - view(ax, m2));
        const r = T - L2 > 0 ? (which === 'a' ? fixedEdge - L2 : fixedEdge) / (T - L2) : 0;
        setPos(ax, clamp(r, 0, 1) * range);
      } });
      paint(ax, arranger.metrics());
    }, () => ax.bar.classList.remove('active', 'zooming'), () => ax.bar.classList.remove('active', 'zooming'));
  }

  for (const ax of [X, Y]) {
    ax.bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      paint(ax, arranger.metrics());
      if (e.target === ax.a) dragGrip(e, ax, 'a');
      else if (e.target === ax.b) dragGrip(e, ax, 'b');
      else if (e.target === ax.thumb) dragThumb(e, ax, 'thumb');
      else dragThumb(e, ax, 'center');
    });
    // Mausrad über der Leiste scrollt den Arranger mit
    ax.bar.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (ax.vertical) root.scrollTop += e.deltaY; else root.scrollLeft += e.deltaX || e.deltaY;
    }, { passive: false });
    // Tastatur: Pfeile und Bild-Tasten scrollen, Plus und Minus zoomen
    ax.thumb.addEventListener('keydown', (e) => {
      const m = arranger.metrics();
      const page = Math.max(40, view(ax, m) - 40);
      const key = e.key;
      const back = ax.vertical ? 'ArrowUp' : 'ArrowLeft';
      const fwd = ax.vertical ? 'ArrowDown' : 'ArrowRight';
      let delta = null;
      if (key === back) delta = -40;
      else if (key === fwd) delta = 40;
      else if (key === 'PageUp') delta = -page;
      else if (key === 'PageDown') delta = page;
      if (delta != null) setPos(ax, pos(ax) + delta);
      else if (key === 'Home') setPos(ax, 0);
      else if (key === 'End') setPos(ax, 1e9);
      else if (key === '+' || key === '=') { if (ax.vertical) arranger.zoomY(1.25); else arranger.zoom(1.25); }
      else if (key === '-' || key === '_') { if (ax.vertical) arranger.zoomY(0.8); else arranger.zoom(0.8); }
      else return;
      e.preventDefault();
    });
  }

  // Zoom-Stufe merken
  let saved = '';
  const save = () => {
    const s = JSON.stringify({ ppb: ui.pxPerBeat, trackZoom: ui.trackZoom });
    if (s === saved) return;
    saved = s;
    try { localStorage.setItem(KEY, s); } catch { /* ohne Speicher gilt die Voreinstellung */ }
  };
  ui.on(save);

  update();
  return { update };
}
