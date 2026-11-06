// Werkzeug am Clip (Dichte „calm“): eine kleine Leiste über dem gewählten Clip – Teilen · Kopie · Löschen, am Handy dazu Werkbank.
// Bei Mehrfachauswahl steht „Festhalten“ statt „Kopie“ (onFreeze).
// Passt sie nicht darüber, sitzt sie darunter; immer innerhalb von #arr-wrap, nie auf dem Clip. Folgt Scrollen und Zoom.
// Schreibt nur über die Werkzeuge (tools.split/duplicate/remove), jedes ist ein Undo-Schritt.

import { el } from '../util.js';
import { narrow } from './place.js';
import { stepTake } from './take-row.js';

const GAP = 6;

export function mountClipFloat({ store, ui, tools, library, onFreeze = null }) {
  const wrap = document.getElementById('arr-wrap');
  const scroll = document.getElementById('arr-scroll');
  const bar = el('div', 'clip-float');
  bar.id = 'clip-float';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Werkzeug am Clip');
  bar.hidden = true;

  const add = (id, label, title, fn, cls = '') => {
    const b = el('button', `cf-btn ${cls}`.trim(), label);
    b.type = 'button';
    b.id = id;
    b.title = title;
    b.addEventListener('click', fn);
    bar.append(b);
    return b;
  };
  const wbBtn = add('cf-werkbank', 'Werkbank', 'Werkbank für diesen Clip öffnen', () => ui.setDock('werkbank'));
  // Take-Clip (2.13): schaltet zum nächsten Take
  const takeBtn = add('cf-take', 'Take', 'Nächster Take (Alt+↓)', () => { const id = ui.selectedClipId; if (id && library) stepTake(store, library, id, 1); });
  const splitBtn = add('cf-split', 'Teilen', 'Clip an der Abspielmarke teilen (T)', () => tools.split());
  const dupBtn = add('cf-dup', 'Kopie', 'Kopie direkt dahinter legen (Strg+D)', () => tools.duplicate());
  // Bei Mehrfachauswahl nimmt „Festhalten“ den Platz von „Kopie“ (Krachwerk, Scheibe 3a)
  const fzBtn = onFreeze ? add('cf-freeze', 'Festhalten', 'Die gewählten Clips als neue Schleife festhalten (F)', () => onFreeze(ui.multi.slice())) : null;
  add('cf-del', 'Löschen', 'Clip löschen (Entf) – Rückgängig holt ihn zurück', () => tools.remove(), 'cf-del');
  wrap.append(bar);

  let raf = 0;
  let held = false; // Finger oder Maus sind in den Spuren: nichts nachführen, nichts anfassen
  const schedule = () => { if (!raf) raf = requestAnimationFrame(position); };

  function position() {
    raf = 0;
    const id = ui.selectedClipId;
    const node = id ? scroll.querySelector(`.clip[data-clip-id="${CSS.escape(id)}"]`) : null;
    const show = !!node && !held && !ui.armedSampleId && !ui.selecting && !(narrow.matches && ui.dock);
    bar.hidden = !show;
    if (!show) return;
    const many = ui.multi.length > 1;
    splitBtn.disabled = many;
    if (fzBtn) { fzBtn.hidden = !many; dupBtn.hidden = many; }
    wbBtn.hidden = !narrow.matches;
    const tc = store.findClip(id)?.clip;
    takeBtn.hidden = many || !tc?.takes || !library;
    if (!takeBtn.hidden) takeBtn.textContent = `Take ${tc.take + 1}/${tc.takes.length}`;
    const w = wrap.getBoundingClientRect();
    const c = node.getBoundingClientRect();
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    // Sichtbare Spuren beginnen unter Lineal, Tonart- und Akkordzeile
    const top = [...scroll.querySelectorAll('.ruler-row, .key-row, .chord-row')].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), w.top);
    const outside = c.bottom <= top || c.top >= w.bottom || c.right <= w.left || c.left >= w.right;
    let y = c.top - bh - GAP;
    if (y < top + 2) y = c.bottom + GAP;
    if (outside || y + bh > w.bottom - 2) { bar.hidden = true; return; }
    // Nur im Spurbereich: nie links der Kante der Spurköpfe; passt es nicht, bündig am rechten Rand
    const minX = Math.max(w.left + 4, (scroll.querySelector('.corner')?.getBoundingClientRect().right ?? 0) + 2);
    const x = Math.max(minX, Math.min(c.left, w.right - bw - 4));
    bar.style.left = `${Math.round(x - w.left)}px`;
    bar.style.top = `${Math.round(y - w.top)}px`;
  }

  ui.on(schedule);
  store.on(schedule);
  scroll.addEventListener('scroll', schedule, { passive: true });
  scroll.addEventListener('pointerdown', () => { held = true; schedule(); }, true);
  const release = () => { if (held) { held = false; schedule(); } };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('resize', schedule);
  narrow.addEventListener('change', schedule);
  new ResizeObserver(schedule).observe(scroll);
  // Spuren neu gezeichnet (Zoom, Einfügen, Rückgängig): Clip-Knoten sind neu
  new MutationObserver(schedule).observe(scroll, { childList: true, subtree: true });
  schedule();
  return { position, el: bar };
}
