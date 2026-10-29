// Kleine Helfer ohne Abhängigkeiten.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deterministischer Zufall, damit synthetische Sounds bei jedem Laden gleich klingen.
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Verfolgt einen Zeiger (Maus, Stift, Finger) ab pointerdown bis zum Loslassen.
export function trackPointer(down, onMove, onUp, onCancel) {
  const id = down.pointerId;
  const move = (ev) => { if (ev.pointerId === id) onMove(ev); };
  const up = (ev) => { if (ev.pointerId !== id) return; cleanup(); onUp(ev); };
  const cancel = (ev) => { if (ev.pointerId !== id) return; cleanup(); onCancel?.(ev); };
  function cleanup() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

export class Emitter {
  constructor() { this.listeners = new Set(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(...args) { for (const fn of this.listeners) fn(...args); }
}
