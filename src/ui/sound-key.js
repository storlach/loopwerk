// Tonart eines eigenen Sounds: gemeinsam für Inspektor (Desktop) und Clip-Leiste (Handy).
// Auswahl „Tonart“ (erkannt, geändert oder keine) und Schalter „Folgt Song“; gespeichert im Projekt (store.setSoundKey).

import { SOUND_KEYS, keyName } from '../keys.js';
import { el } from '../util.js';

// Nur eigene Aufnahmen, Importe und bearbeitete Sounds; Patterns und erzeugte Loops folgen ohnehin dem Song
export const hasSoundKey = (s) => !!s && s.category === 'own' && !s.def && !s.make && !s.missing && !s.patternId;

// prefix: Kennung der Bedienelemente („insp“, „lvl“); className: Zeile wie die Nachbarn
export function mountSoundKey({ store, prefix, className }) {
  const row = el('div', className);
  row.id = `${prefix}-skey`;
  const sel = document.createElement('select');
  sel.id = `${prefix}-skey-sel`;
  sel.className = 'skey-sel';
  sel.setAttribute('aria-label', 'Tonart des Sounds');
  const none = el('option', null, 'keine');
  none.value = '';
  sel.append(none);
  const opts = new Map();
  for (const k of SOUND_KEYS) {
    const o = el('option', null, keyName(k));
    o.value = k;
    opts.set(k, o);
    sel.append(o);
  }
  const follow = el('button', 'key skey-follow', 'Folgt Song');
  follow.type = 'button';
  follow.id = `${prefix}-skey-follow`;
  follow.title = 'Sound in die Tonart des Songs umstimmen';
  // Zustand neben dem Namen: „erkannt“ (wie erkannt), „…“ (Erkennung läuft); sonst leer
  const state = el('output', 'skey-state');
  state.id = `${prefix}-skey-state`;
  const label = el('span', 'skey-label', 'Tonart');
  label.append(state);
  row.append(label, sel, follow);

  let sound = null;
  sel.addEventListener('change', () => {
    if (!sound) return;
    const v = sel.value || null;
    // Die erkannte Tonart wählen heißt: wie erkannt (keine eigene Angabe im Projekt)
    store.setSoundKey(sound.id, { key: v === (sound.keyAuto ?? null) ? undefined : v });
    sel.blur();
  });
  follow.addEventListener('click', () => {
    if (sound) store.setSoundKey(sound.id, { follow: !(store.project.soundKeys?.[sound.id]?.follow) });
  });

  function update(s) {
    sound = hasSoundKey(s) ? s : null;
    row.hidden = !sound;
    if (!sound) return;
    const e = store.project.soundKeys?.[sound.id] || {};
    const key = 'key' in e ? e.key : sound.keyAuto ?? null;
    const st = !sound.keyDone && !('key' in e) ? 'pending' : key && key === sound.keyAuto ? 'auto' : key ? 'set' : 'none';
    // In der Liste steht die erkannte Tonart dabei, solange eine andere gewählt ist (gewählt zeigt es „erkannt“ daneben)
    for (const [k, o] of opts) o.textContent = k === sound.keyAuto && k !== key ? `${keyName(k)} (erkannt)` : keyName(k);
    if (document.activeElement !== sel) sel.value = key ?? '';
    row.dataset.state = st;
    state.textContent = st === 'auto' ? 'erkannt' : st === 'pending' ? '…' : '';
    follow.hidden = !key; // ohne Tonart gibt es nichts zu folgen
    follow.setAttribute('aria-pressed', String(!!key && !!e.follow));
  }

  return { row, update };
}
