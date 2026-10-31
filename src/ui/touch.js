// Fingergesten: langes Drücken unterscheidet sich von Antippen und Wischen. Nach dem Halten gehört die
// Bewegung der App – der Browser scrollt dann nicht mehr, bis der Finger losgelassen wird.

import { touch } from './place.js';

export const HOLD_MS = 450;
const SLOP = 8; // so weit darf der Finger zittern, ohne dass es als Wischen gilt

// Scrollen sperren, solange der Finger nach dem Halten liegt. Das geht nur über einen nicht-passiven touchmove-Hörer,
// der schon beim Aufsetzen des Fingers da war – darum meldet holdArea() die Flächen vorher an.
let locks = 0;
function lockScroll(pointerId) {
  locks++;
  const end = (ev) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    locks--;
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
}

// e: pointerdown. onTap(ev) beim Loslassen ohne Bewegung vor Ablauf der Zeit; onHold(e) nach HOLD_MS Ruhe.
// Wischt der Finger vorher, passiert nichts (der Browser scrollt). Gibt eine Funktion zum Abbrechen zurück.
export function pressHold(e, { onTap, onHold, ms = HOLD_MS }) {
  const id = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let state = 'wait';
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  const timer = setTimeout(() => {
    if (state !== 'wait') return;
    state = 'held';
    cleanup();
    lockScroll(id);
    try { navigator.vibrate?.(12); } catch { /* ohne Vibration */ }
    onHold?.(e);
  }, ms);
  const move = (ev) => {
    if (ev.pointerId !== id || state !== 'wait') return;
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) { state = 'gone'; cleanup(); }
  };
  const up = (ev) => {
    if (ev.pointerId !== id) return;
    const tap = state === 'wait';
    state = 'done';
    cleanup();
    if (tap) onTap?.(ev);
  };
  const cancel = (ev) => { if (ev.pointerId === id) { state = 'done'; cleanup(); } };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  return () => { state = 'done'; cleanup(); };
}

// Fläche für langes Drücken: nach dem Halten scrollt sie nicht; Kontextmenü und Text-Lupe des Browsers bleiben aus
export function holdArea(node) {
  node.addEventListener('touchmove', (e) => { if (locks && e.cancelable) e.preventDefault(); }, { passive: false });
  node.addEventListener('contextmenu', (e) => { if (e.pointerType === 'touch' || touch.matches) e.preventDefault(); });
}
