// Sound-Regal: Loops nach Kategorie. Klick = anhören und auswählen, Ziehen = auf eine Spur legen.

import { CATEGORIES } from '../samples.js';
import { el, trackPointer } from '../util.js';

export function mountLibrary({ root, library, store, engine, ui, arranger }) {
  root.innerHTML = '';
  const items = new Map();

  for (const cat of CATEGORIES) {
    const samples = library.list().filter((s) => s.category === cat.id);
    if (!samples.length) continue;
    const group = el('section', `shelf-group cat-${cat.id}`);
    const head = el('h3', 'shelf-cat');
    head.append(el('span', 'swatch'), el('span', null, cat.label), el('span', 'shelf-count', String(samples.length)));
    const list = el('div', 'shelf-items');
    for (const s of samples) {
      const item = el('button', 'loop-item');
      item.type = 'button';
      item.dataset.sampleId = s.id;
      const bars = s.lengthBeats / 4;
      item.append(
        el('span', 'loop-play'),
        el('span', 'loop-name', s.name),
        el('span', 'loop-len', `${bars} ${bars === 1 ? 'Takt' : 'Takte'}`),
      );
      item.title = `${s.name} · ${s.bpm} BPM · ${s.key}`;
      bindItem(item, s);
      items.set(s.id, item);
      list.append(item);
    }
    group.append(head, list);
    root.append(group);
  }

  function activate(sample) {
    if (ui.armedSampleId === sample.id) {
      ui.arm(null);
      engine.stopPreview();
    } else {
      ui.arm(sample.id);
      engine.previewSample(sample.id);
    }
  }

  function bindItem(item, sample) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      let target = null;
      trackPointer(e, (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = el('div', `drag-ghost cat-${sample.category}`, sample.name);
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        target = arranger.dropTargetAt(ev.clientX, ev.clientY, sample);
      }, () => {
        if (!ghost) { activate(sample); return; }
        ghost.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
        if (target) store.addClip(target.trackId, sample.id, target.startBeat, sample.lengthBeats);
      }, () => {
        ghost?.remove();
        document.body.classList.remove('is-dragging');
        arranger.clearDropPreview();
      });
    });
    // Tastatur (Enter): click ohne Zeigerbewegung
    item.addEventListener('click', (e) => { if (e.detail === 0) activate(sample); });
  }

  function sync() {
    for (const [id, item] of items) {
      item.classList.toggle('armed', ui.armedSampleId === id);
      item.classList.toggle('previewing', engine.preview?.sampleId === id);
      item.setAttribute('aria-pressed', String(ui.armedSampleId === id));
    }
  }
  ui.on(sync);
  engine.on(sync);
  sync();
}
