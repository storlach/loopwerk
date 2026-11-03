// Startkarte (Krachwerk Scheibe 4, Spec krachwerk-4-kit §2): nur im leeren Song, auf Spur 1 groß „● Mach ein Geräusch“,
// darunter klein „Klatsch dein Kit“ und „Ohne Mikro: Strom“. Ohne Mikrofon (z. B. claude.ai) heißt die große Karte
// „Datei holen“. Sie verschwindet mit dem ersten Clip. Die Karte schwebt über Spur 1 (Knoten bleiben stehen).

import { el } from '../util.js';

export function mountStartCard({ store, ui, recorder, actions }) {
  const arranger = document.querySelector('.arranger');
  const scroll = document.getElementById('arr-scroll');
  const card = el('div', 'start-card');
  card.id = 'start-card';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', 'Los geht’s');
  const big = el('button', 'start-big');
  big.type = 'button';
  big.id = 'start-record';
  const row = el('div', 'start-small');
  const clap = el('button', 'start-link', 'Klatsch dein Kit');
  clap.type = 'button';
  clap.id = 'start-clap';
  const strom = el('button', 'start-link', 'Ohne Mikro: Strom');
  strom.type = 'button';
  strom.id = 'start-strom';
  row.append(clap, strom);
  card.append(big, row);
  arranger.append(card);

  big.addEventListener('click', () => (recorder.supported ? actions.record() : actions.file()));
  clap.addEventListener('click', () => actions.clap());
  strom.addEventListener('click', () => actions.strom());
  // Karte sitzt auf der Spur, nicht im Lineal: Zeiger zum Lineal oder zu den Spuren gehören ihr nicht
  card.addEventListener('pointerdown', (e) => e.stopPropagation());

  const empty = () => store.project.tracks.every((t) => !t.clips.length);
  let raf = 0;
  function place() {
    raf = 0;
    const on = empty();
    card.hidden = !on;
    document.getElementById('app').classList.toggle('start-card-on', on);
    if (!on) return;
    big.textContent = recorder.supported ? '● Mach ein Geräusch' : 'Datei holen';
    const lane = scroll.querySelector('.track-row .lane');
    if (!lane) return;
    const a = arranger.getBoundingClientRect();
    const l = lane.getBoundingClientRect();
    card.style.top = `${Math.round(l.top - a.top + 6)}px`;
    card.style.left = `${Math.round(l.left - a.left + 8)}px`;
    card.style.width = `${Math.max(120, Math.round(Math.min(l.width, a.width - (l.left - a.left)) - 16))}px`;
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
  store.on(schedule);
  ui.on(schedule);
  window.addEventListener('resize', schedule);
  scroll.addEventListener('scroll', schedule, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(arranger);
  place();
  return { place, card };
}
