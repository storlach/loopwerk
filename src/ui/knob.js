// Regler für Finger und Maus: relativ ziehen statt springen, Drehregler mit Skalenbogen (Look „Werkstück“).

import { clamp, el } from '../util.js';

// Ziehen ändert einen Regler relativ – kein Sprung an die Antippstelle. Am Handy zählt nur senkrechtes Ziehen;
// waagrechtes Wischen bleibt dem Browser (touch-action: pan-x) und scrollt die Kanäle.
export function relativeDrag(handle, input, { span, touchOnly = false }) {
  handle.addEventListener('pointerdown', (e) => {
    if (touchOnly && e.pointerType !== 'touch') return; // Maus am Fader: wie gewohnt
    if (e.button !== 0) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const y0 = e.clientY;
    const v0 = Number(input.value);
    let active = false;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dy = ev.clientY - y0;
      if (!active && Math.abs(dy) < 4) return;
      active = true;
      const v = clamp(v0 - (dy / span()) * (max - min), min, max);
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
}

// Drehregler (Panorama, Spurlautstärke): senkrecht ziehen, Doppelklick setzt zurück. Das Eingabefeld bleibt
// für Tastatur und Vorleser. center: Mittelstellung (Panorama) wird als neutral gezeigt.
export function makeKnob(input, { wrapClass = 'knob-wrap', center = false } = {}) {
  const knob = el('div', 'knob');
  knob.setAttribute('aria-hidden', 'true');
  knob.append(el('span', 'knob-ind'));
  const update = () => {
    const t = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    knob.style.setProperty('--turn', `${Math.round(-135 + t * 270)}deg`);
    knob.classList.toggle('center', center && Math.abs(Number(input.value)) < 0.01);
  };
  input.addEventListener('input', update);
  relativeDrag(knob, input, { span: () => 140 });
  knob.addEventListener('dblclick', () => input.dispatchEvent(new MouseEvent('dblclick')));
  const wrap = el('div', wrapClass);
  wrap.prepend(input);
  wrap.append(knob);
  return { wrap, update };
}
