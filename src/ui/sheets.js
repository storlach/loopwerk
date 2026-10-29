// Schubladen: Fächer (Mixer, Editoren, am Handy auch Sounds und „Mehr“) liegen über den Spuren.
// Oben ein Griff: nach oben ziehen zeigt mehr, nach unten wischen schließt. Die Höhe wird gemerkt.
// Der Arranger bekommt unten so viel Platz, dass die letzten Spuren über das Fach gescrollt werden können.

import { clamp, el, trackPointer } from '../util.js';
import { narrow } from './place.js';

const KEY = 'loopwerk.sheetH';
// Rastpunkte als Anteil der Arranger-Höhe
const SNAPS = [0.45, 0.72, 1];

function loadFrac() {
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

export function mountSheets({ ui, arranger }) {
  const app = document.getElementById('app');
  const arr = document.querySelector('.arranger');
  const fracs = loadFrac();
  const mode = () => (narrow.matches ? 'narrow' : 'wide');

  const setFrac = (f) => app.style.setProperty('--sheet-h', `${Math.round(f * 1000) / 10}%`);
  const applyStored = () => { const f = fracs[mode()]; if (f) setFrac(f); else app.style.removeProperty('--sheet-h'); };
  applyStored();
  narrow.addEventListener('change', applyStored);

  // Sichtbare Schublade (Fach oder am Handy das Regal)
  const current = () => {
    for (const n of document.querySelectorAll('.dock, .shelf')) {
      if (n.hidden || !n.classList.contains('sheet')) continue;
      if (n.classList.contains('shelf') && (!narrow.matches || ui.dock !== 'sounds')) continue;
      if (n.id === 'export' && !narrow.matches) continue;
      if (getComputedStyle(n).display === 'none') continue;
      return n;
    }
    return null;
  };

  // Platz im Arranger = Höhe der offenen Schublade
  const ro = new ResizeObserver(() => syncPad());
  function syncPad() {
    const s = current();
    app.style.setProperty('--sheet-pad', s ? `${Math.round(s.getBoundingClientRect().height)}px` : '0px');
  }

  function close() {
    ui.setDock(null);
  }

  function attach(sheet) {
    if (sheet.querySelector(':scope > .sheet-grip')) return;
    sheet.classList.add('sheet');
    const grip = el('div', 'sheet-grip');
    grip.title = 'Ziehen: größer oder kleiner – nach unten wischen schließt';
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
      let last = { y: y0, t: e.timeStamp };
      let v = 0;
      sheet.classList.add('dragging');
      trackPointer(e, (ev) => {
        const h = clamp(h0 - (ev.clientY - y0), 40, max);
        app.style.setProperty('--sheet-h', `${h}px`);
        const dt = Math.max(1, ev.timeStamp - last.t);
        v = (ev.clientY - last.y) / dt; // px/ms, positiv = nach unten
        last = { y: ev.clientY, t: ev.timeStamp };
      }, (ev) => {
        sheet.classList.remove('dragging');
        // Nach einer Wischbewegung keinen Klick dort auslösen, wo der Finger endet (z. B. auf „Sounds“)
        if (Math.abs(ev.clientY - y0) > 8) swallowClick();
        const h = clamp(h0 - (ev.clientY - y0), 0, max);
        // Schnell nach unten gewischt oder fast zu: schließen
        if ((v > 0.6 && ev.clientY - y0 > 30) || h < max * 0.22) {
          // Erst nach dem Ende der Berührung schließen: verschwindet das Element mitten im Touch-Ablauf,
          // erkennt der Browser den nächsten Tipp nicht als Klick
          setTimeout(() => { applyStored(); close(); }, 0);
          return;
        }
        const f = h / max;
        const snap = SNAPS.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a));
        fracs[mode()] = snap;
        try { localStorage.setItem(KEY, JSON.stringify(fracs)); } catch { /* egal */ }
        setFrac(snap);
        requestAnimationFrame(() => { syncPad(); reveal(); });
      }, () => { sheet.classList.remove('dragging'); applyStored(); });
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

  let lastDock = null;
  ui.on(() => {
    if (ui.dock === lastDock) return;
    lastDock = ui.dock;
    requestAnimationFrame(() => { syncPad(); reveal(); });
  });
  narrow.addEventListener('change', () => requestAnimationFrame(syncPad));
  return { syncPad, reveal };
}
