// Wunsch-Feld unter „Erstellen“: Satz eingeben, Enter – der Plan wird als ein Rückgängig-Schritt ausgeführt.

import { runWish } from '../wish.js';

export function mountWish({ store, library, ui }) {
  const $ = (id) => document.getElementById(id);
  const form = $('wish-form');
  const input = $('wish-input');
  const state = $('wish-state');
  const go = $('wish-go');
  if (!form) return null;
  let busy = false;

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    form.classList.add('busy');
    go.disabled = true;
    state.textContent = 'denkt …';
    try {
      const r = await runWish(text, { store, library });
      if (!r?.done?.length) {
        state.textContent = '';
        ui.flash('Dazu fällt mir nichts ein. Nenne Sounds (Beat, Bass, Pad, Melodie), Tempo, Takte oder Effekte.');
      } else {
        state.textContent = r.by === 'claude' ? 'Claude' : 'Regeln';
        ui.flash(`${r.summary || 'Umgesetzt'}${r.skipped.length ? ` (${r.skipped.length} ging nicht)` : ''}. Rückgängig nimmt alles zurück.`);
        input.value = '';
      }
    } catch (e) {
      state.textContent = '';
      if (e?.code !== 'cancelled') ui.flash(`Das hat nicht geklappt: ${e?.message || e}`);
    } finally {
      busy = false;
      form.classList.remove('busy');
      go.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    e.stopPropagation(); // Tastenkürzel der App (Leertaste, Entf …) nicht auslösen
  });
  return { submit };
}
