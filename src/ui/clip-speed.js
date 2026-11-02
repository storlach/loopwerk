// Geschwindigkeit eines Clips (50–200 %), gemeinsam für Inspektor (Desktop) und Clip-Leiste (Handy).
// Aus = gleiche Tonhöhe (Dehnen, WSOLA im Worker); „wie Tonband“ = Tonhöhe ändert sich mit (playbackRate, sofort).
// Im Modell steckt die Laufzeit (clip.stretch = 1 / Geschwindigkeit) und der Schalter clip.varispeed.

import { canVarispeed, clipSpeed } from '../model.js';
import { el } from '../util.js';

export const MIN_SPEED = 50;
export const MAX_SPEED = 200;
const STEP = 5;
const CHIPS = [[0.5, '½×', 'Halbe Geschwindigkeit'], [1, '1×', 'Originalgeschwindigkeit'], [2, '2×', 'Doppelte Geschwindigkeit']];
// Rasche Folgegesten (Tippen, Doppeltipp) zählen als ein Rückgängig-Schritt
const GESTURE_GAP = 600;

export const speedPercent = (clip) => Math.round(clipSpeed(clip) * 100);
const fmtSemis = (speed) => {
  const st = Math.round(12 * Math.log2(speed) * 10) / 10;
  return `${st > 0 ? '+' : st < 0 ? '−' : '±'}${String(Math.abs(st)).replace('.', ',')} Halbtöne`;
};

// variant: 'insp' (rechte Spalte) oder 'phone' (Clip-Leiste, Bereich „Pegel“)
export function mountClipSpeed(container, { store, ui, library, variant = 'insp' }) {
  const phone = variant === 'phone';
  const pre = phone ? 'lvl-speed' : 'insp-speed';
  const row = el('div', phone ? 'lvl lvl-speed' : 'insp-row insp-run insp-speed');
  const out = el('output');
  out.id = `${pre}-out`;
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: String(MIN_SPEED), max: String(MAX_SPEED), step: String(STEP), id: pre, value: '100' });
  input.setAttribute('aria-label', 'Geschwindigkeit');
  input.title = 'Doppelklick: 100 %';
  const tape = el('button', 'key speed-tape', 'wie Tonband');
  tape.type = 'button';
  tape.id = `${pre}-tape`;
  tape.setAttribute('aria-pressed', 'false');
  const chips = [];
  if (phone) {
    row.append(el('span', null, 'Geschwindigkeit'), tape, out, input);
  } else {
    const btns = el('div', 'insp-run-btns');
    for (const [v, label, title] of CHIPS) {
      const b = el('button', 'key', label);
      b.type = 'button';
      b.title = title;
      b.dataset.speed = String(v);
      b.addEventListener('click', () => { const c = sel(); if (c) store.setClipSpeed(c.id, v); });
      btns.append(b);
      chips.push(b);
    }
    btns.append(tape);
    row.append(el('span', null, 'Geschwindigkeit'), out, input, btns);
  }
  container.append(row);

  const sel = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);

  // Ziehen: ein Rückgängig-Schritt, Länge immer vom Stand zu Beginn gerechnet (das Song-Ende kappt sonst bleibend)
  let gesture = { key: null, from: null, clipId: null, ended: 0 };
  const apply = (percent) => {
    const c = sel();
    if (!c) return;
    const now = performance.now();
    if (gesture.clipId !== c.id || (gesture.ended && now - gesture.ended > GESTURE_GAP)) {
      gesture = { key: `${pre}-${c.id}-${now}`, from: { ...c }, clipId: c.id, ended: 0 };
    }
    store.setClipSpeed(c.id, percent / 100, { coalesce: gesture.key, from: gesture.from });
  };
  input.addEventListener('input', () => apply(Number(input.value)));
  input.addEventListener('change', () => { gesture.ended = performance.now(); });
  input.addEventListener('dblclick', () => { input.value = '100'; apply(100); gesture.ended = performance.now(); });
  tape.addEventListener('click', () => { const c = sel(); if (c) store.setClipVarispeed(c.id, !c.varispeed); });

  function render() {
    const c = sel();
    if (!c) return;
    const pct = speedPercent(c);
    const can = canVarispeed(library, c.sampleId);
    const on = !!c.varispeed && can;
    if (document.activeElement !== input || gesture.clipId !== c.id) input.value = String(Math.min(MAX_SPEED, Math.max(MIN_SPEED, pct)));
    out.textContent = phone || pct === 100 ? `${pct} %` : `${pct} % · ${on ? fmtSemis(clipSpeed(c)) : 'gleiche Tonhöhe'}`;
    tape.setAttribute('aria-pressed', String(on));
    tape.disabled = !can;
    tape.title = can ? 'An: Tonhöhe ändert sich mit (wie ein Tonband). Aus: gleiche Tonhöhe' : 'Folgt der Tonart – Geschwindigkeit nur mit gleicher Tonhöhe';
    for (const b of chips) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.speed) * 100 - pct) < 0.5));
  }
  store.on(render);
  ui.on(render);
  library.on?.(render);
  render();
  return { render, row, input, tape };
}
