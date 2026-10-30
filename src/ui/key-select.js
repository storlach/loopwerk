// Tonart-Auswahl (Anzeige, Inspektor, Tempo-Fach am Handy): alle Felder mit data-key-select zeigen dieselbe Songtonart.

import { KEYS, KEY_MAJOR, keyOf } from '../model.js';

// short: nur das Kürzel (Anzeige oben), sonst mit paralleler Dur-Tonart
export function bindKeySelect(sel, store, { short = sel.classList.contains('lcd-value') } = {}) {
  if (!sel || sel.dataset.bound) return;
  sel.dataset.bound = '1';
  sel.setAttribute('aria-label', 'Tonart des Songs');
  KEYS.forEach((k, i) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = short ? k : `${k}  ·  ${KEY_MAJOR[i]}-Dur`;
    o.title = `${k} (parallel ${KEY_MAJOR[i]}-Dur)`;
    sel.append(o);
  });
  const sync = () => { if (document.activeElement !== sel) sel.value = keyOf(store.project); };
  sel.addEventListener('change', () => { store.setKey(sel.value); sel.blur(); });
  store.on(sync);
  sync();
}

export function mountKeySelects(store, root = document) {
  for (const sel of root.querySelectorAll('[data-key-select]')) bindKeySelect(sel, store);
}
