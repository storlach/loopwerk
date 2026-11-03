// Takes am Clip (Spec 2.13 B, ADR 009): Zeile „Take 1 2 3 ×“ für Inspektor (Desktop) und Pegel-Fach (Handy),
// dazu die gemeinsamen Schritte. Inaktive Takes sind nach dem Neuladen nur Stubs: erst laden, dann wechseln.

import { el } from '../util.js';

export async function chooseTake(store, library, clipId, index) {
  const c = store.findClip(clipId)?.clip;
  const id = c?.takes?.[index];
  if (!id) return false;
  await library.ensure?.(id)?.catch?.(() => null);
  store.setClipTake(clipId, index);
  return true;
}

export function stepTake(store, library, clipId, dir) {
  const c = store.findClip(clipId)?.clip;
  if (!c?.takes) return false;
  const n = c.takes.length;
  chooseTake(store, library, clipId, (((c.take + dir) % n) + n) % n);
  return true;
}

// variant: 'insp' (Desktop) oder 'phone' (Handy, Tippziele 44 px)
export function mountTakeRow({ store, library, ui, variant = 'insp', idPrefix = 'insp' }) {
  const row = el('div', variant === 'phone' ? 'lvl lvl-takes' : 'insp-row insp-takes');
  row.hidden = true;
  row.id = `${idPrefix}-takes`;
  const btns = el('div', 'take-btns');
  btns.setAttribute('role', 'group');
  btns.setAttribute('aria-label', 'Takes');
  const del = el('button', 'key take-del', '×');
  del.type = 'button';
  del.id = `${idPrefix}-take-del`;
  del.title = 'Aktiven Take löschen (der Sound bleibt unter „Eigene“)';
  del.setAttribute('aria-label', 'Aktiven Take löschen');
  row.append(el('span', null, 'Take'), btns, del);
  const clip = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);
  btns.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-take]');
    const c = clip();
    if (b && c) chooseTake(store, library, c.id, Number(b.dataset.take));
  });
  del.addEventListener('click', async () => {
    const c = clip();
    if (!c?.takes) return;
    const rest = c.takes.length - 1;
    const keep = c.takes.filter((_, i) => i !== c.take);
    await library.ensure?.(keep[keep.length - 1])?.catch?.(() => null);
    store.removeTake(c.id, c.take);
    ui.flash?.(rest > 1 ? `Take gelöscht – noch ${rest}.` : 'Take gelöscht – der Clip spielt jetzt die letzte Fassung.');
  });

  function update(c = clip()) {
    const takes = c?.takes;
    row.hidden = !takes;
    if (!takes) return;
    if (btns.children.length !== takes.length) {
      btns.replaceChildren(...takes.map((_, i) => {
        const b = el('button', 'key take-n', String(i + 1));
        b.type = 'button';
        b.dataset.take = String(i);
        b.id = `${idPrefix}-take-${i + 1}`;
        return b;
      }));
    }
    [...btns.children].forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === c.take));
      b.title = library.get(takes[i])?.name ?? `Take ${i + 1}`;
    });
  }
  return { row, update };
}
