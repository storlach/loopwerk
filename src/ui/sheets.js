// Schubladen: Fächer (Mixer, Editoren, am Handy auch Sounds und „Mehr“) liegen über den Spuren.
// Drei Haltepunkte: zu (unter dem Rand), Mitte (50 %) und oben (ganze Arranger-Höhe).
// Jede Bewegung läuft über eine kritisch gedämpfte Feder: Öffnen, Schließen, Einrasten und Wechseln.
// Beim Ziehen folgt die Schublade dem Finger 1:1, die Geschwindigkeit beim Loslassen fließt in die Feder,
// eine laufende Bewegung lässt sich jederzeit greifen. Ein Schubs springt zum nächsten Haltepunkt in Wischrichtung.
// Jede Schublade merkt sich ihren Haltepunkt; am Handy öffnen Mixer, Sample- und Melodie-Editor oben, Beat-Editor in der Mitte.
// Der Arranger bekommt unten so viel Platz, dass die letzten Spuren über das Fach gescrollt werden können.

import { clamp, el, trackPointer } from '../util.js';
import { narrow, touch } from './place.js';

const KEY = 'loopwerk.sheetH';
const MID = 0.5;
const TOP = 1;
const FLICK = 0.35; // px/ms: ab hier zählt die Bewegung als Schubs
const HIDE = -84; // zu: Oberkante samt Schatten unter dem Rand
const GONE = -64; // ab hier ist nichts mehr zu sehen (auch kein Schatten)
const RUBBER = 72; // Gummiband über oben: höchstens so viele px
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
// Federkonstante (rad/s): 18 ≈ iOS-Sheet (Antwortzeit 0,35 s), reduzierte Bewegung kürzer, aber sichtbar
const omega = () => (reduced.matches ? 26 : 18);

function loadSnaps() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function swallowClick() {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 60);
}

// Haltepunkt nach dem Loslassen: f = Anteil der Höhe, v = Geschwindigkeit (positiv = nach unten)
export function snapTarget(f, v) {
  const points = [0, MID, TOP];
  if (v < -FLICK) return points.find((p) => p > f + 0.02) ?? TOP;
  if (v > FLICK) return [...points].reverse().find((p) => p < f - 0.02) ?? 0;
  if (f < MID / 2) return 0;
  return points.slice(1).reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a));
}

// Kritisch gedämpfte Feder, exakt gelöst: x = Abstand zum Ziel, v = Geschwindigkeit (px/s)
export function springStep(x, v, w, dt) {
  const e = Math.exp(-w * dt);
  const c = v + w * x;
  const xn = (x + c * dt) * e;
  return [xn, (c - w * (x + c * dt)) * e];
}

// Gummiband: folgt anfangs 1:1, bleibt dann zurück (nie mehr als RUBBER)
const rubber = (d) => (d * RUBBER) / (d + RUBBER);

export function mountSheets({ ui, arranger }) {
  const app = document.getElementById('app');
  const arr = document.querySelector('.arranger');
  const snaps = loadSnaps();
  const mode = () => (narrow.matches ? 'narrow' : 'wide');
  // Beat- und Melodie-Editor merken sich ihre Höhe getrennt: Pads brauchen weniger Platz als die Klaviatur
  const keyOf = (s) => (s.id === 'pattern' && s.dataset.type ? `pattern-${s.dataset.type}` : s.id || 'sounds');
  const stored = () => { const m = snaps[mode()]; return m && typeof m === 'object' ? m : (snaps[mode()] = {}); };
  const openFrac = (s) => {
    const v = s && stored()[keyOf(s)];
    if (v === TOP || v === MID) return v;
    if (narrow.matches && s && ['pattern-synth', 'editor', 'mixer'].includes(keyOf(s))) return TOP;
    // Tablet (Finger): Piano-Roll und Klaviatur brauchen fingergroße Zeilen – die Melodie öffnet ganz
    return touch.matches && s && keyOf(s) === 'pattern-synth' ? TOP : MID;
  };

  const sheets = [];
  // „Mehr“ und Tempo am Handy sind so hoch wie ihr Inhalt: dort verschiebt Ziehen nur
  const autoHeight = (s) => s.classList.contains('more-panel');
  const shown = (s) => {
    if (s.classList.contains('shelf')) return narrow.matches && ui.dock === 'sounds';
    if (s.id === 'export' && !narrow.matches) return false;
    return !s.hidden;
  };
  const current = () => sheets.find((s) => shown(s) && !s.classList.contains('leaving') && getComputedStyle(s).display !== 'none') ?? null;

  // Zustand je Schublade: p = Höhe über dem Arranger-Rand (px; über oben wird sie als Gummiband gezeigt),
  // v = Geschwindigkeit (px/s, nach oben positiv),
  // base = Layout-Höhe während der Bewegung: wird die Schublade kleiner, wird nur verschoben (transform, kein Layout);
  // nur beim Wachsen rechnet der Inhalt mit, im Gummiband in beide Richtungen. In Ruhe passt die Höhe wieder genau.
  const state = new Map();
  const S = (s) => state.get(s);
  const full = () => arr.getBoundingClientRect().height;
  // p und Layout-Höhe zählen mit Rahmen (wie zu sehen), --sheet-h ohne (bd = Rahmen oben + unten)
  const restP = (s, h) => (autoHeight(s) ? s.offsetHeight : openFrac(s) * h + S(s).bd);
  const measure = (s, m) => {
    m.bd = autoHeight(s) ? 0 : s.offsetHeight - (parseFloat(getComputedStyle(s).height) || 0);
    return s.offsetHeight;
  };
  let lastAb = null; // Arranger-Unterkante beim letzten Bild

  // Platz im Arranger = Höhe der offenen Schublade; nur in Ruhe messen, nicht pro Frame
  let pad = -1;
  const setPad = (px) => {
    const v = Math.max(0, Math.round(px));
    if (v !== pad) { pad = v; app.style.setProperty('--sheet-pad', `${v}px`); }
  };
  function syncPad() {
    const s = current();
    setPad(s ? s.getBoundingClientRect().height : 0);
  }
  const busy = () => sheets.some((s) => S(s).mode !== 'rest');
  const ro = new ResizeObserver(() => {
    if (busy()) return;
    for (const s of sheets) { const m = S(s); if (m.open) m.p = m.target = measure(s, m); }
    lastAb = arr.getBoundingClientRect().bottom;
    syncPad();
  });

  // Zeichnen: nur transform, außer die Schublade wird größer als ihre eingefrorene Höhe
  function apply(s, m, h) {
    let ty;
    if (autoHeight(s)) ty = Math.max(0, m.H - m.p);
    else {
      const hT = h + m.bd;
      const p = m.p > hT ? hT + rubber(m.p - hT) : m.p;
      m.base = Math.max(m.base, Math.min(p, hT));
      const lay = Math.max(p, m.base, 0);
      if (!(Math.abs(lay - m.lay) <= 0.01)) { m.lay = lay; s.style.setProperty('--sheet-h', `${lay - m.bd}px`); }
      s.style.maxHeight = lay > hT + 0.5 ? 'none' : '';
      ty = lay - p;
    }
    s.style.transform = `translate3d(0, ${ty}px, 0)`;
    // Desktop: was unter den Arranger-Rand rutscht, blitzt sonst unter der Fachleiste hervor (Schatten bleibt).
    // Am Handy deckt die Leiste bis zum Rand ab, dort spart das Malen.
    s.style.clipPath = ty > 0.5 && !narrow.matches ? `inset(-80px -80px ${ty}px -80px)` : '';
  }

  function toRest(s, m) {
    m.mode = 'rest';
    m.v = 0;
    delete s.dataset.motion;
    s.classList.remove('entering');
    if (!autoHeight(s)) {
      m.base = m.p;
      m.lay = NaN;
      s.style.setProperty('--sheet-h', `${openFrac(s) * 100}%`);
      s.style.maxHeight = '';
    }
    s.style.transform = '';
    s.style.clipPath = '';
    lastAb = arr.getBoundingClientRect().bottom;
    syncPad();
    reveal();
  }

  function toHidden(s, m) {
    Object.assign(m, { mode: 'rest', open: false, p: HIDE, v: 0, cover: null, lay: NaN });
    delete s.dataset.motion;
    s.classList.remove('entering', 'leaving', 'dragging');
    s.style.transform = '';
    s.style.clipPath = '';
    s.style.maxHeight = '';
    s.style.zIndex = '';
    s.style.removeProperty('--sheet-h');
    if (!busy()) syncPad();
  }

  // Ein Feder-Takt für alle bewegten Schubladen: erst messen, dann schreiben (kein Layout-Hin-und-Her)
  let raf = 0;
  let last = 0;
  function kick() {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    // Erstes Bild nach dem Anstoßen (z. B. Loslassen): ein Bild weiter rechnen, damit nichts stockt
    const dt = last ? clamp((now - last) / 1000, 0, 0.1) : 1 / 60;
    last = now;
    const moving = sheets.filter((s) => S(s).mode === 'spring');
    if (!moving.length) return;
    const ar = arr.getBoundingClientRect();
    const h = ar.height;
    const w = omega();
    lastAb = ar.bottom;
    for (const s of moving) {
      const m = S(s);
      // Rutscht der Arranger-Rand (z. B. Clip-Leiste am Handy), bleibt die Schublade, wo sie zu sehen ist
      if (m.ab != null && m.p > GONE) m.p += ar.bottom - m.ab;
      m.ab = ar.bottom;
      if (autoHeight(s)) m.H = s.offsetHeight;
      if (m.open) m.target = restP(s, h);
      else if (m.cover && !S(m.cover).open) { m.cover = null; m.target = HIDE; }
    }
    for (const s of moving) {
      const m = S(s);
      // Frisch geöffnet: das erste Bild zeichnet den Inhalt (teuer) noch unsichtbar, dann geht es los
      if (m.fresh === 2) { m.fresh = 1; apply(s, m, h); continue; }
      const x0 = m.p - m.target;
      const [x, v] = springStep(x0, m.v, w, m.fresh ? 1 / 60 : dt);
      m.fresh = 0;
      m.p = m.target + x;
      m.v = v;
      // Reduzierte Bewegung: nicht über das Ziel hinaus
      if (reduced.matches && Math.sign(x) !== Math.sign(x0)) { m.p = m.target; m.v = 0; }
      // In Ruhe, sobald nichts mehr zu sehen ist; bei reduzierter Bewegung ohne langen Ausklang
      const settled = reduced.matches ? Math.abs(m.p - m.target) < 1.5 && Math.abs(m.v) < 60 : Math.abs(m.p - m.target) < 0.25 && Math.abs(m.v) < 15;
      if (!m.open) {
        // Liegt sie unter der neuen, verschwindet sie erst, wenn die neue sie ganz bedeckt
        const covered = m.cover && S(m.cover).p >= m.p - 0.5;
        if ((settled && !m.cover) || covered || m.p <= GONE) { toHidden(s, m); continue; }
      } else if (settled) {
        m.p = m.target;
        apply(s, m, h);
        toRest(s, m);
        continue;
      }
      apply(s, m, h);
      // Beim Hochfahren schiebt die Kante den ausgewählten Clip mit nach oben
      if (m.open && m.v > 0 && m.target < h - 1 && s === current()) pushClip(ar.bottom - m.p);
    }
    if (moving.some((s) => S(s).mode === 'spring')) raf = requestAnimationFrame(frame);
  }

  function spring(s, m) {
    m.mode = 'spring';
    s.dataset.motion = 'spring';
    m.ab = arr.getBoundingClientRect().bottom;
    kick();
  }

  function open(s) {
    const m = S(s);
    s.classList.remove('leaving', 'dragging');
    s.classList.add('entering');
    for (const o of sheets) if (o !== s) o.style.zIndex = '';
    s.style.zIndex = '21'; // die neue Schublade fährt über die alte
    const h = full();
    m.open = true;
    m.cover = null;
    m.drag = null;
    if (autoHeight(s)) m.H = s.offsetHeight;
    else if (m.p <= GONE) { s.style.setProperty('--sheet-h', `${openFrac(s) * 100}%`); measure(s, m); }
    m.target = restP(s, h);
    if (m.p <= GONE) {
      // Von zu: Layout gleich in Zielhöhe, die Bewegung ist reines Verschieben
      Object.assign(m, { p: HIDE, v: 0, base: m.target, lay: NaN, fresh: 2 });
    }
    apply(s, m, h); // noch vor dem ersten Bild an den Startpunkt
    setPad(Math.max(pad, m.target));
    spring(s, m);
  }

  function close(s, cover) {
    const m = S(s);
    if (!m.open) return;
    m.open = false;
    m.drag = null; // ein laufendes Ziehen endet hier
    s.classList.remove('entering', 'dragging');
    s.classList.add('leaving');
    if (m.p <= GONE) { toHidden(s, m); return; }
    if (!autoHeight(s)) m.base = Math.max(m.p, m.base); // Layout einfrieren, ab jetzt nur verschieben
    else m.H = s.offsetHeight;
    // Aus der Ruhe: ist der Arranger-Rand gerade gerutscht (Clip-Leiste am Handy), bleibt die Oberkante stehen
    const ab = arr.getBoundingClientRect().bottom;
    if (m.mode === 'rest' && lastAb != null) m.p += ab - lastAb;
    // Kommt eine andere Schublade, die diese ganz verdeckt: liegen lassen, bis sie bedeckt ist
    m.cover = cover ?? null;
    const coverTarget = cover ? S(cover).target : -Infinity;
    m.target = coverTarget >= m.p - 1 ? m.p : HIDE;
    spring(s, m);
  }

  // Ein- und Ausfahren, sobald ein Fach auf- oder zugeht – egal ob per Reiter, Taste oder Wischen
  const was = new Map();
  function watch() {
    const opened = [];
    const closed = [];
    for (const s of sheets) {
      const now = shown(s);
      if (now === (was.get(s) ?? false)) continue;
      was.set(s, now);
      (now ? opened : closed).push(s);
    }
    for (const s of opened) open(s);
    const cover = opened[opened.length - 1] ?? null;
    for (const s of closed) close(s, cover);
    if (!opened.length && !closed.length) requestAnimationFrame(reveal);
  }

  function attach(sheet) {
    if (sheet.querySelector(':scope > .sheet-grip')) return;
    sheet.classList.add('sheet');
    sheets.push(sheet);
    const isOpen = shown(sheet);
    was.set(sheet, isOpen);
    state.set(sheet, { mode: 'rest', open: isOpen, p: HIDE, v: 0, base: 0, lay: NaN, target: HIDE, cover: null, drag: null, ab: null, H: 0, fresh: 0, bd: 0 });
    const grip = el('div', 'sheet-grip');
    grip.title = 'Ziehen oder schubsen: Mitte, oben – nach unten wischen schließt';
    sheet.prepend(grip);
    ro.observe(sheet);
    const head = sheet.querySelector(':scope > .dock-head');

    const startDrag = (e) => {
      if (e.button !== 0) return;
      // Auf Knöpfen und Feldern im Kopf nicht ziehen
      if (e.target.closest('button, input, select, label, a') && !e.target.closest('.sheet-grip')) return;
      const m = S(sheet);
      if (!m.open) return;
      e.preventDefault();
      const h = full();
      if (m.mode === 'rest') {
        // Aus der Ruhe: aktuelle Lage übernehmen
        m.p = measure(sheet, m);
        m.base = m.p;
        m.lay = NaN;
      }
      if (autoHeight(sheet)) m.H = sheet.offsetHeight;
      // Eine laufende Bewegung wird gegriffen, wo sie gerade ist
      m.mode = 'drag';
      m.v = 0;
      sheet.dataset.motion = 'drag';
      const token = {};
      m.drag = token;
      const p0 = m.p;
      const y0 = e.clientY;
      const t0 = e.timeStamp;
      // Geschwindigkeit aus den letzten ~100 ms Bewegung; ruht der Finger vor dem Loslassen, klingt sie ab
      let trail = [{ y: y0, t: e.timeStamp }];
      const velocity = (tUp) => {
        const b = trail[trail.length - 1];
        const a = trail.find((p) => b.t - p.t <= 100);
        const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
        return v * clamp(1 - (tUp - b.t - 40) / 80, 0, 1);
      };
      const track = (ev) => {
        if (ev.clientY === trail[trail.length - 1].y) return;
        trail.push({ y: ev.clientY, t: ev.timeStamp });
        if (trail.length > 12) trail.shift();
      };
      const place = (ev) => {
        m.p = p0 - (ev.clientY - y0);
        if (autoHeight(sheet)) m.p = Math.min(m.p, m.H);
        apply(sheet, m, h);
      };
      sheet.classList.add('dragging');
      trackPointer(e, (ev) => {
        if (m.drag !== token) return;
        track(ev);
        place(ev);
      }, (ev) => {
        if (m.drag !== token) return;
        m.drag = null;
        track(ev);
        place(ev);
        sheet.classList.remove('dragging');
        const dy = ev.clientY - y0;
        // Nach einer Wischbewegung keinen Klick dort auslösen, wo der Finger endet (z. B. auf „Sounds“)
        if (Math.abs(dy) > 8) swallowClick();
        const vel = Math.abs(dy) > 12 ? velocity(ev.timeStamp) : 0;
        // Kurze, schnelle Geste zählt als Schubs, auch wenn die letzten Millisekunden ruhig waren
        const quick = ev.timeStamp - t0 < 250 && Math.abs(dy) > 16;
        const v = quick ? Math.sign(dy) * Math.max(FLICK * 2, Math.abs(vel)) : vel;
        // Die echte Geschwindigkeit geht in die Feder
        m.v = clamp(-vel * 1000, -8000, 8000);
        // Erst nach dem Ende der Berührung schließen: verschwindet das Element mitten im Touch-Ablauf,
        // erkennt der Browser den nächsten Tipp nicht als Klick
        const shut = () => { close(sheet, null); setTimeout(() => ui.setDock(null), 0); };
        if (autoHeight(sheet)) {
          if (v > FLICK || dy > m.H * 0.3) shut();
          else { m.target = m.H; spring(sheet, m); }
          return;
        }
        const target = snapTarget(clamp(m.p, 0, h) / h, v);
        if (target === 0) { shut(); return; }
        stored()[keyOf(sheet)] = target;
        try { localStorage.setItem(KEY, JSON.stringify(snaps)); } catch { /* egal */ }
        m.target = target * h + m.bd;
        setPad(Math.max(pad, m.target));
        spring(sheet, m);
      }, () => {
        if (m.drag !== token) return;
        m.drag = null;
        sheet.classList.remove('dragging');
        m.target = restP(sheet, h);
        spring(sheet, m);
      });
    };
    grip.addEventListener('pointerdown', startDrag);
    // Berührung am Griff gehört ganz der Schublade: sonst hält der Browser ein schnelles Wischen für Scrollen
    // mit Nachlauf und verschluckt den nächsten Tipp (z. B. auf „Sounds“)
    grip.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    head?.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.target === head || e.target.tagName === 'H2') startDrag(e); });
  }

  // Den ausgewählten Clip über der Schublade sichtbar halten
  function pushClip(limitTop) {
    if (ui.selectedClipId) arranger.revealClip?.(ui.selectedClipId, limitTop);
  }
  function reveal() {
    const s = current();
    if (!s || S(s).mode !== 'rest') return;
    pushClip(s.getBoundingClientRect().top);
  }

  // In Ruhe: offen in gemerkter Höhe oder ganz weg, ohne Reste von Bewegung
  function settleAll() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    for (const s of sheets) {
      const m = S(s);
      const isOpen = shown(s);
      was.set(s, isOpen);
      toHidden(s, m);
      if (isOpen) {
        m.open = true;
        s.style.setProperty('--sheet-h', `${openFrac(s) * 100}%`);
        m.p = m.target = measure(s, m);
        m.base = m.p;
        toRest(s, m);
      }
    }
    requestAnimationFrame(syncPad);
  }

  ro.observe(arr);
  for (const n of document.querySelectorAll('.dock')) attach(n);
  attach(document.querySelector('.shelf'));
  settleAll();

  ui.on(() => queueMicrotask(watch));
  narrow.addEventListener('change', settleAll);
  return { syncPad, reveal, snapTarget };
}
