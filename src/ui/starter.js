// Song-Starter im Fach „Erstellen“: Genre antippen → Grundgerüst. Ist das Lied nicht leer, fragt der Knopf selbst
// („Sicher?“, zweites Antippen ersetzt; Rückgängig holt das alte Lied zurück). „Nochmal“ würfelt eine andere Fassung.

import { STARTER_GENRES, runStarter, starterGenre } from '../starter.js';
import { el } from '../util.js';
import { place } from './place.js';

const CONFIRM_MS = 4000;

export function mountStarter({ root, store, library, ui, onAccomp }) {
  const genres = root.querySelector('#starter-genres');
  const again = root.querySelector('#starter-again');
  const box = root.querySelector('#starter');
  // Handy: „Erstellen“ gibt es dort nicht – der Starter zieht ins Fach „Song“ (unter Tempo/Tonart/Länge),
  // samt Knopf „Begleitung“
  const songBody = document.querySelector('#song .song-body');
  if (songBody) {
    const sec = el('div', 'starter-sec');
    sec.append(el('h3', 'create-sec', 'Song-Starter'));
    const slot = el('div', 'song-starter');
    sec.append(slot);
    const tiles = songBody.querySelector('.song-tiles');
    if (tiles) tiles.after(sec); else songBody.prepend(sec);
    place(box, { narrow: slot });
  }
  const accompBtn = el('button', 'key starter-accomp', '+ Begleitung');
  accompBtn.type = 'button';
  accompBtn.id = 'starter-accomp';
  accompBtn.title = 'Fläche, Bass und Arp, die dem Akkord-Streifen folgen';
  accompBtn.addEventListener('click', () => onAccomp?.(null));
  box.append(accompBtn);
  let last = null; // { genre, variant, json }
  let busy = false;
  let armed = null; // Knopf, der gerade „Sicher?“ zeigt
  let armTimer = null;

  const empty = () => store.project.tracks.every((t) => !t.clips.length);
  const label = (btn) => btn.dataset.label;

  function disarm() {
    clearTimeout(armTimer);
    if (!armed) return;
    armed.textContent = label(armed);
    armed.removeAttribute('data-confirm');
    armed.removeAttribute('aria-describedby');
    armed = null;
  }

  function arm(btn) {
    disarm();
    armed = btn;
    btn.dataset.confirm = '1';
    btn.textContent = 'Sicher?';
    btn.title = 'Ersetzt das aktuelle Lied – Rückgängig holt es zurück';
    armTimer = setTimeout(disarm, CONFIRM_MS);
  }

  async function build(genre, variant) {
    if (busy) return null;
    busy = true;
    root.classList.add('busy');
    try {
      const res = await runStarter(genre, { store, library, variant });
      last = { genre, variant, json: JSON.stringify(store.project) };
      ui.select?.(null);
      ui.flash?.(`${res.summary}. Rückgängig holt das alte Lied zurück.`);
      return res;
    } catch (err) {
      ui.flash?.(`Song-Starter: ${err.message}`);
      return null;
    } finally {
      busy = false;
      root.classList.remove('busy');
      sync();
    }
  }

  // Ohne Rückfrage nur, wenn nichts verloren geht: leeres Lied oder unverändert seit dem letzten Starter
  const safe = () => empty() || (last && JSON.stringify(store.project) === last.json);

  for (const g of STARTER_GENRES) {
    const b = el('button', 'starter-genre', g.label);
    b.type = 'button';
    b.dataset.genre = g.id;
    b.dataset.label = g.label;
    b.addEventListener('click', () => {
      if (!safe() && armed !== b) { arm(b); return; }
      disarm();
      build(g.id, last?.genre === g.id ? last.variant + 1 : 0);
    });
    genres.append(b);
  }
  again.dataset.label = 'Nochmal';
  again.addEventListener('click', () => {
    if (!last) return;
    if (!safe() && armed !== again) { arm(again); return; }
    disarm();
    build(last.genre, last.variant + 1);
  });

  function sync() {
    again.disabled = !last || busy;
    if (armed !== again) again.textContent = last ? `Nochmal · ${starterGenre(last.genre)?.label}` : 'Nochmal';
    again.dataset.label = again.textContent;
    for (const b of genres.children) b.setAttribute('aria-pressed', String(last?.genre === b.dataset.genre && safe()));
  }
  store.on(() => { if (!busy) { disarm(); sync(); } });
  sync();

  return { build, get last() { return last; } };
}
