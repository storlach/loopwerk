// Schubladen: Fächer (Mixer, Editoren, am Handy auch Sounds und „Mehr“) liegen über den Spuren.
// Drei Haltepunkte: zu (unter dem Rand), Mitte (50 %) und oben (80 % der Arranger-Höhe).
// Öffnen, Schließen und Einrasten sind immer animiert. Ein Schubs am Griff springt zum nächsten Haltepunkt
// in Wischrichtung, langsames Ziehen rastet am nächstgelegenen ein. Der zuletzt benutzte Haltepunkt wird gemerkt.
// Der Arranger bekommt unten so viel Platz, dass die letzten Spuren über das Fach gescrollt werden können.

import { clamp, el, trackPointer } from '../util.js';
import { narrow } from './place.js';

const KEY = 'loopwerk.sheetH';
const MID = 0.5;
const TOP = 0.8;
const FLICK = 0.35; // px/ms: ab hier zählt die Bewegung als Schubs

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

function afterTransition(node, fn) {
  let done = false;
  const finish = () => { if (done) return; done = true; node.removeEventListener('transitionend', onEnd); fn(); };
  const onEnd = (e) => { if (e.target === node) finish(); };
  node.addEventListener('transitionend', onEnd);
  setTimeout(finish, 520);
}

export function mountSheets({ ui, arranger }) {
  const app = document.getElementById('app');
  const arr = document.querySelector('.arranger');
  const snaps = loadSnaps();
  const mode = () => (narrow.matches ? 'narrow' : 'wide');
  const openFrac = () => (snaps[mode()] === TOP ? TOP : MID);
  const setFrac = (f) => app.style.setProperty('--sheet-h', `${f * 100}%`);
  setFrac(openFrac());
  narrow.addEventListener('change', () => setFrac(openFrac()));

  const sheets = [];
  // „Mehr“ und Tempo am Handy sind so hoch wie ihr Inhalt: dort verschiebt Ziehen nur
  const autoHeight = (s) => s.classList.contains('more-panel');
  const shown = (s) => {
    if (s.classList.contains('shelf')) return narrow.matches && ui.dock === 'sounds';
    if (s.id === 'export' && !narrow.matches) return false;
    return !s.hidden;
  };
  const current = () => sheets.find((s) => shown(s) && !s.classList.contains('leaving') && getComputedStyle(s).display !== 'none') ?? null;

  // Platz im Arranger = Höhe der offenen Schublade
  const ro = new ResizeObserver(() => syncPad());
  function syncPad() {
    const s = current();
    app.style.setProperty('--sheet-pad', s ? `${Math.round(s.getBoundingClientRect().height)}px` : '0px');
  }

  const pending = new Map();
  function play(s, cls, done) {
    pending.get(s)?.(); // laufende Animation (z. B. Hinausfahren) ablösen
    s.classList.remove('entering', 'leaving');
    void s.offsetWidth; // Animation neu starten
    s.classList.add(cls);
    const stop = () => { s.removeEventListener('animationend', end); pending.delete(s); };
    const end = (e) => {
      if (e.target !== s) return;
      stop();
      s.classList.remove(cls);
      done?.();
    };
    s.addEventListener('animationend', end);
    pending.set(s, stop);
  }

  // Ein- und Ausfahren, sobald ein Fach auf- oder zugeht – egal ob per Knopf, Taste oder Wischen
  const was = new Map();
  function watch() {
    for (const s of sheets) {
      const now = shown(s);
      if (now === (was.get(s) ?? false)) continue;
      was.set(s, now);
      if (now) {
        s.style.transform = '';
        s.style.removeProperty('--leave-from');
        if (!sheets.some((o) => o !== s && o.classList.contains('dragging'))) setFrac(openFrac());
        play(s, 'entering', () => { syncPad(); reveal(); });
      } else {
        // Weggewischt: von der aktuellen Lage aus weiterfahren
        s.style.setProperty('--leave-from', s.style.transform || 'translateY(0)');
        play(s, 'leaving', () => {
          s.style.transform = '';
          s.style.removeProperty('--leave-from');
          if (!current()) setFrac(openFrac());
          syncPad();
        });
      }
    }
    syncPad();
    requestAnimationFrame(reveal);
  }

  function attach(sheet) {
    if (sheet.querySelector(':scope > .sheet-grip')) return;
    sheet.classList.add('sheet');
    sheets.push(sheet);
    was.set(sheet, shown(sheet));
    const grip = el('div', 'sheet-grip');
    grip.title = 'Ziehen oder schubsen: Mitte, oben – nach unten wischen schließt';
    sheet.prepend(grip);
    ro.observe(sheet);
    const head = sheet.querySelector(':scope > .dock-head');

    const startDrag = (e) => {
      if (e.button !== 0) return;
      // Auf Knöpfen und Feldern im Kopf nicht ziehen
      if (e.target.closest('button, input, select, label, a') && !e.target.closest('.sheet-grip')) return;
      e.preventDefault();
      const max = arr.getBoundingClientRect().height;
      const h0 = sheet.getBoundingClientRect().height;
      const y0 = e.clientY;
      const t0 = e.timeStamp;
      // Geschwindigkeit aus den letzten ~80 ms
      let trail = [{ y: y0, t: e.timeStamp }];
      const velocity = () => {
        const a = trail[0], b = trail[trail.length - 1];
        return b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
      };
      const track = (ev) => {
        trail.push({ y: ev.clientY, t: ev.timeStamp });
        trail = trail.filter((p) => ev.timeStamp - p.t <= 80);
      };
      sheet.classList.add('dragging');
      trackPointer(e, (ev) => {
        track(ev);
        const dy = ev.clientY - y0;
        if (autoHeight(sheet)) sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
        else app.style.setProperty('--sheet-h', `${clamp(h0 - dy, 0, max)}px`);
      }, (ev) => {
        track(ev);
        const dy = ev.clientY - y0;
        // Nach einer Wischbewegung keinen Klick dort auslösen, wo der Finger endet (z. B. auf „Sounds“)
        if (Math.abs(dy) > 8) swallowClick();
        // Kurze, schnelle Geste zählt als Schubs, auch wenn die letzten Millisekunden ruhig waren
        const quick = ev.timeStamp - t0 < 250 && Math.abs(dy) > 16;
        const v = quick ? Math.sign(dy) * Math.max(FLICK * 2, Math.abs(velocity())) : Math.abs(dy) > 12 ? velocity() : 0;
        sheet.classList.remove('dragging');
        // Erst nach dem Ende der Berührung schließen: verschwindet das Element mitten im Touch-Ablauf,
        // erkennt der Browser den nächsten Tipp nicht als Klick
        const close = () => setTimeout(() => ui.setDock(null), 0);
        if (autoHeight(sheet)) {
          if (v > FLICK || dy > h0 * 0.3) close();
          else sheet.style.transform = '';
          return;
        }
        const target = snapTarget(clamp(h0 - dy, 0, max) / max, v);
        if (target === 0) { close(); return; }
        snaps[mode()] = target;
        try { localStorage.setItem(KEY, JSON.stringify(snaps)); } catch { /* egal */ }
        setFrac(target);
        afterTransition(sheet, () => { syncPad(); reveal(); });
      }, () => {
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
        setFrac(openFrac());
      });
    };
    grip.addEventListener('pointerdown', startDrag);
    // Berührung am Griff gehört ganz der Schublade: sonst hält der Browser ein schnelles Wischen für Scrollen
    // mit Nachlauf und verschluckt den nächsten Tipp (z. B. auf „Sounds“)
    grip.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    head?.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.target === head || e.target.tagName === 'H2') startDrag(e); });
  }

  // Den ausgewählten Clip über der Schublade sichtbar halten
  function reveal() {
    const s = current();
    if (!s || !ui.selectedClipId) return;
    arranger.revealClip?.(ui.selectedClipId, s.getBoundingClientRect().top);
  }

  for (const n of document.querySelectorAll('.dock')) attach(n);
  attach(document.querySelector('.shelf'));

  ui.on(() => queueMicrotask(watch));
  narrow.addEventListener('change', () => {
    for (const s of sheets) { was.set(s, shown(s)); pending.get(s)?.(); s.classList.remove('entering', 'leaving'); }
    requestAnimationFrame(syncPad);
  });
  return { syncPad, reveal, snapTarget };
}
