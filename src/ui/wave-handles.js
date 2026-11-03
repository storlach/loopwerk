// Welle mit Griffen (Sound-Werkbank, Krachwerk 2a): Anfang und Ende als senkrechte Linien, Anschlag und Ausklang als
// Punkte auf der Hüllkurven-Linie. Innerhalb von Anfang/Ende zeichnet die gebackene Welle als Lichtstrich, außerhalb
// steht das Original als Korn. Die Darstellung folgt der Abspielrichtung; gespeichert wird in Originalzeit.
// Schreibt nur über store.setRecipe (ein Rückgängig-Schritt je Ziehen), alle Griffe sind role="slider".

import { el, trackPointer } from '../util.js';
import { MIN_SPAN, recipeGesture } from '../recipe.js';

const BUCKETS = 1200;
const peakCache = new WeakMap();

// Spitzenwerte über den ganzen Puffer (einmal je Puffer)
export function peaksOf(buf) {
  let p = peakCache.get(buf);
  if (p) return p;
  p = new Float32Array(BUCKETS);
  const n = buf.length;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let k = 0; k < BUCKETS; k++) {
      const a = Math.floor((k * n) / BUCKETS);
      const b = Math.max(a + 1, Math.floor(((k + 1) * n) / BUCKETS));
      let m = p[k];
      for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
      p[k] = m;
    }
  }
  peakCache.set(buf, p);
  return p;
}

const fmtS = (v) => `${v.toFixed(2).replace('.', ',')} s`;
const fmtMs = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2).replace('.', ',')} s` : `${Math.round(v)} ms`);

// Dauer des gebackenen Klangs aus dem Rezept (für die Lage der Punkte; unabhängig davon, ob schon fertig gebacken ist)
export function cookedSeconds(r, dur) {
  const len = Math.max(MIN_SPAN, (r.end ?? dur) - (r.start ?? 0));
  const pf = 2 ** (((r.semis ?? 0) + (r.cents ?? 0) / 100) / 12);
  return Math.max(MIN_SPAN, (len * (r.stretch ?? 1)) / pf);
}

export function mountWaveHandles(container, { store, library, engine, ui }) {
  const box = el('div', 'wb-wave');
  const canvas = el('canvas', 'wb-wave-cv');
  const mark = el('span', 'wb-wave-mark');
  mark.hidden = true;
  const mk = (cls, label) => {
    const h = el('div', `wb-h ${cls}`);
    h.setAttribute('role', 'slider');
    h.tabIndex = 0;
    h.setAttribute('aria-label', label);
    h.setAttribute('aria-orientation', 'horizontal');
    h.title = `${label}: ziehen, Pfeiltasten verschieben (Umschalt: grob), Doppelklick: Standard`;
    return h;
  };
  const hStart = mk('wb-h-start', 'Anfang');
  const hEnd = mk('wb-h-end', 'Ende');
  const hAtk = mk('wb-h-atk', 'Anschlag');
  const hRel = mk('wb-h-rel', 'Ausklang');
  box.append(canvas, mark, hStart, hEnd, hAtk, hRel);
  container.append(box);

  const gesture = recipeGesture();
  let soundId = null;
  let view = null; // zuletzt gezeichneter Stand (Pixel und Zeiten)

  const recipeOf = (id) => store.project.recipes?.[id] ?? {};
  const durOf = (s) => s?.orig?.duration ?? s?.duration ?? 0;

  // Anzeigezeit (d) ↔ Rezept: bei „rückwärts“ liegt der Anfang, den man hört, am Ende des Originals
  function bounds(r, dur) {
    const st = r.start ?? 0;
    const en = Math.min(dur, r.end ?? dur);
    return r.reverse ? { ds: dur - en, de: dur - st } : { ds: st, de: en };
  }
  const nullIf = (v, test) => (test(v) ? null : Math.round(v * 1e5) / 1e5);

  function setBound(which, d) {
    const s = library.get(soundId);
    const dur = durOf(s);
    if (!dur) return;
    const r = recipeOf(soundId);
    const { ds, de } = bounds(r, dur);
    const key = gesture(soundId, which);
    let patch;
    if (which === 'start') {
      const v = Math.min(Math.max(0, d), de - MIN_SPAN);
      patch = r.reverse ? { end: nullIf(dur - v, (x) => x >= dur - 1e-4) } : { start: nullIf(v, (x) => x <= 1e-4) };
    } else {
      const v = Math.max(Math.min(dur, d), ds + MIN_SPAN);
      patch = r.reverse ? { start: nullIf(dur - v, (x) => x <= 1e-4) } : { end: nullIf(v, (x) => x >= dur - 1e-4) };
    }
    store.setRecipe(soundId, patch, { coalesce: key });
  }
  function setEnv(which, ms) {
    const r = recipeOf(soundId);
    const s = library.get(soundId);
    const total = cookedSeconds(r, durOf(s)) * 1000;
    const other = which === 'attack' ? r.release ?? 0 : r.attack ?? 0;
    const max = Math.min(which === 'attack' ? 2000 : 5000, Math.max(0, total - other));
    const v = Math.round(Math.min(Math.max(0, ms), max));
    store.setRecipe(soundId, { [which]: v || null }, { coalesce: gesture(soundId, which) });
  }

  // x (Pixel in der Welle) → Anzeigezeit in Sekunden
  const toTime = (clientX) => {
    const rect = box.getBoundingClientRect();
    return ((clientX - rect.left) / Math.max(1, rect.width)) * view.dur;
  };
  const centerX = (h) => { const r = h.getBoundingClientRect(); return r.left + r.width / 2; };

  function bind(h, which) {
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !view) return;
      e.preventDefault();
      e.stopPropagation();
      h.focus({ preventScroll: true });
      const grab = e.clientX - centerX(h);
      h.classList.add('drag');
      trackPointer(e, (ev) => {
        if (!view) return;
        const d = toTime(ev.clientX - grab);
        if (which === 'start' || which === 'end') setBound(which, d);
        else if (which === 'attack') setEnv('attack', ((d - view.ds) / Math.max(1e-6, view.de - view.ds)) * view.cooked * 1000);
        else setEnv('release', ((view.de - d) / Math.max(1e-6, view.de - view.ds)) * view.cooked * 1000);
      }, () => { h.classList.remove('drag'); gesture.end(); }, () => { h.classList.remove('drag'); gesture.end(); });
    });
    h.addEventListener('keydown', (e) => {
      if (!view || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
      const step = e.shiftKey ? 0.1 : 0.01;
      if (which === 'start') setBound('start', view.ds + dir * step);
      else if (which === 'end') setBound('end', view.de + dir * step);
      else {
        const r = recipeOf(soundId);
        setEnv(which, (r[which] ?? 0) + dir * step * 1000);
      }
      gesture.end();
    });
    h.addEventListener('dblclick', () => {
      if (!soundId) return;
      // Bei „rückwärts“ liegt der Anfang, den man hört, am Ende des Originals
      const rev = !!recipeOf(soundId).reverse;
      const field = which === 'start' ? (rev ? 'end' : 'start') : which === 'end' ? (rev ? 'start' : 'end') : which;
      store.setRecipe(soundId, { [field]: null });
    });
  }
  bind(hStart, 'start');
  bind(hEnd, 'end');
  bind(hAtk, 'attack');
  bind(hRel, 'release');

  // Ein Tipp auf die Welle außerhalb der Griffe: Sound einmal vorhören
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !soundId) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const id = soundId;
    trackPointer(e, () => {}, (ev) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) engine.previewSample?.(id);
    });
  });

  // ---------- Zeichnen ----------
  function draw(s, r, W, H, color) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const orig = s.orig;
    if (!orig) return null;
    const dur = orig.duration;
    const { ds, de } = bounds(r, dur);
    const cookedT = cookedSeconds(r, dur);
    const x0 = (ds / dur) * W;
    const x1 = (de / dur) * W;
    const mid = H / 2;
    const op = peaksOf(orig);
    const cp = s.cooked ? peaksOf(s.cooked) : null;
    const norm = Math.max(0.1, ...op);
    const amp = (p) => Math.max(0.5, Math.min(mid - 3, (p / norm) * (mid - 6)));
    c.fillStyle = color;
    for (let x = 0; x < W; x += 3) {
      const inside = x >= x0 && x < x1;
      if (inside) {
        // gebackene Welle über die Breite des Ausschnitts (folgt schon der Abspielrichtung)
        const u = (x - x0) / Math.max(1, x1 - x0);
        const src = cp ?? op;
        const k0 = Math.floor(u * BUCKETS);
        let m = 0;
        if (cp) { for (let k = k0; k <= Math.min(BUCKETS - 1, Math.floor(((x + 3 - x0) / Math.max(1, x1 - x0)) * BUCKETS)); k++) m = Math.max(m, src[k]); }
        else {
          // ohne Rezept: das Original an dieser Stelle (bei Rückwärts gespiegelt)
          const t = (x / W) * dur;
          const ot = r.reverse ? dur - t : t;
          const k = Math.min(BUCKETS - 1, Math.floor((ot / dur) * BUCKETS));
          m = src[k];
        }
        const a = amp(m);
        c.globalAlpha = 0.9;
        c.fillRect(x, Math.round(mid - a), 2, Math.max(1, Math.round(2 * a)));
      } else {
        const t = (x / W) * dur;
        const ot = r.reverse ? dur - t : t;
        const a = amp(op[Math.min(BUCKETS - 1, Math.floor((ot / dur) * BUCKETS))]);
        c.globalAlpha = 0.3;
        c.fillRect(x, Math.round(mid - a), 2, 1);
        c.fillRect(x, Math.round(mid + a) - 1, 2, 1);
      }
    }
    // Hüllkurve: Anschlag linear, Ausklang (1−x)²
    const top = 12;
    const bot = H - 6;
    const aPx = Math.min(x1 - x0, ((r.attack ?? 0) / 1000 / cookedT) * (x1 - x0));
    const rPx = Math.min(x1 - x0 - aPx, ((r.release ?? 0) / 1000 / cookedT) * (x1 - x0));
    c.globalAlpha = 0.95;
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x0, bot);
    c.lineTo(x0 + aPx, top);
    c.lineTo(x1 - rPx, top);
    const n = Math.max(2, Math.ceil(rPx / 3));
    for (let i = 1; i <= n; i++) { const f = i / n; c.lineTo(x1 - rPx + f * rPx, top + (bot - top) * (1 - (1 - f) ** 2)); }
    c.stroke();
    c.globalAlpha = 1;
    return { dur, ds, de, x0, x1, aPx, rPx, cooked: cookedT, top, W, H };
  }

  function render(id, cat) {
    soundId = id;
    const s = id && library.get(id);
    if (!s || !s.orig) { view = null; box.classList.add('empty'); if (id && s?.lazy) library.ensure?.(id).then(() => library.emit?.()); return; }
    box.classList.remove('empty');
    const W = Math.round(box.clientWidth);
    const H = Math.round(box.clientHeight);
    if (W < 20 || H < 20) { view = null; return; }
    const r = recipeOf(id);
    const color = getComputedStyle(box).color;
    view = draw(s, r, W, H, color);
    if (!view) return;
    const place = (h, x, y) => { h.style.left = `${x}px`; if (y != null) h.style.top = `${y}px`; };
    place(hStart, view.x0);
    place(hEnd, view.x1);
    place(hAtk, view.x0 + view.aPx, view.top);
    place(hRel, view.x1 - view.rPx, view.top);
    const set = (h, now, min, max, text) => {
      h.setAttribute('aria-valuemin', String(min));
      h.setAttribute('aria-valuemax', String(max));
      h.setAttribute('aria-valuenow', String(Math.round(now * 1000) / 1000));
      h.setAttribute('aria-valuetext', text);
    };
    set(hStart, view.ds, 0, view.de - MIN_SPAN, fmtS(view.ds));
    set(hEnd, view.de, view.ds + MIN_SPAN, view.dur, fmtS(view.de));
    set(hAtk, r.attack ?? 0, 0, 2000, fmtMs(r.attack ?? 0));
    set(hRel, r.release ?? 0, 0, 5000, fmtMs(r.release ?? 0));
    updateMark();
  }

  // Marke: läuft beim Spielen durch die Welle (Phase des Sounds im Clip)
  let raf = 0;
  function updateMark() {
    const found = ui.selectedClipId ? store.findClip(ui.selectedClipId) : null;
    const s = found && library.get(found.clip.sampleId);
    const show = !!(view && found && s && engine.playing && s.lengthBeats > 0 && box.offsetParent);
    mark.hidden = !show;
    if (!show) { raf = 0; return; }
    const { clip } = found;
    const len = (s.lengthBeats || 1) * (clip.stretch || 1);
    const ph = ((((engine.heardBeat() - clip.startBeat + (clip.offsetBeats || 0)) % len) + len) % len) / len;
    mark.style.left = `${view.x0 + ph * (view.x1 - view.x0)}px`;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateMark(); });
  }
  engine.on?.(() => { if (!raf) updateMark(); });

  const ro = new ResizeObserver(() => { if (soundId) render(soundId); });
  ro.observe(box);
  return { render, el: box, redraw: () => render(soundId) };
}
