// „Erstellen“: Karten für Beat, Melodie, Einsingen, Aufnahme und Import. Wie im Original sind sie Objekte:
// Klick legt an der Abspielmarke an, Ziehen auf eine Spur legt genau dort ab.

import { el, trackPointer } from '../util.js';

const LABELS = { beat: 'Beat', melody: 'Melodie', sing: 'Einsingen', record: 'Aufnahme', import: 'Import', link: 'Link' };
const CATS = { beat: 'drums', melody: 'synth', sing: 'own', record: 'fx', import: 'bass', link: 'chords' };

// actions: { beat(target), melody(target), sing(target), record(target), import(target) } – target = { trackId, startBeat } oder null
export function mountCreate({ root, arranger, actions }) {
  for (const card of root.querySelectorAll('.ccard')) {
    const kind = card.dataset.create;
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      let target = null;
      const probe = { category: CATS[kind], lengthBeats: kind === 'melody' || kind === 'sing' ? 8 : 4 };
      trackPointer(e, (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = el('div', `drag-ghost cat-${CATS[kind]}`, LABELS[kind]);
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        target = arranger.dropTargetAt(ev.clientX, ev.clientY, probe);
      }, () => {
        if (!ghost) { actions[kind]?.(null); return; }
        ghost.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
        if (target) actions[kind]?.(target);
      }, () => {
        ghost?.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
      });
    });
    // Tastatur (Enter/Leertaste): Klick ohne Zeiger
    card.addEventListener('click', (e) => { if (e.detail === 0) actions[kind]?.(null); });
  }
}
