// Handy-Bedienung: Leiste unten (Sounds, Mixer, Rückgängig, Mehr), darüber ein Fach für Regal oder Dock,
// Werkzeuge für den ausgewählten Clip. Auf breiten Bildschirmen bleibt alles, wie es ist.

import { clipGain } from '../model.js';
import { clamp } from '../util.js';
import { formatDb } from './arranger.js';

export const narrow = window.matchMedia('(max-width: 760px)');
// Diese Fächer gibt es nur am Handy; Mixer, Editoren und Export sind die gewöhnlichen Docks.
const PHONE_DOCKS = ['sounds', 'more'];

const formatBeats = (b) => (b <= 0 ? 'aus' : `${String(Math.round(b * 100) / 100).replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`);

export function mountMobile({ store, ui, tools }) {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const deck = document.querySelector('.deck');
  const more = $('more');

  // Seltener gebrauchte Deck-Knöpfe wandern am Handy ins Fach „Mehr“; ein Platzhalter merkt sich die Herkunft.
  const moves = [
    [$('rec-btn'), 'play'],
    [$('metro-btn'), 'play'],
    [deck.querySelector('.group[aria-label="Bearbeiten"]'), 'edit'],
    [deck.querySelector('.group[aria-label="Projekt"]'), 'project'],
    [deck.querySelector('.brand'), 'about'],
  ].map(([node, slot]) => {
    const home = document.createComment(node.id || slot);
    node.before(home);
    return { node, home, slot: more.querySelector(`[data-slot="${slot}"]`) };
  });

  function layout() {
    for (const m of moves) {
      if (narrow.matches) m.slot.append(m.node);
      else m.home.after(m.node);
    }
    if (!narrow.matches && PHONE_DOCKS.includes(ui.dock)) ui.setDock(null);
  }

  // ---------- Leiste unten ----------

  const tabs = [['tab-sounds', 'sounds'], ['tab-mixer', 'mixer'], ['tab-more', 'more']];
  for (const [id, dock] of tabs) $(id).addEventListener('click', () => ui.setDock(ui.dock === dock ? null : dock));
  $('tab-undo').addEventListener('click', () => store.undo());
  $('more-close').addEventListener('click', () => ui.setDock(null));

  function syncTabs() {
    app.dataset.dock = ui.dock || '';
    more.hidden = ui.dock !== 'more';
    for (const [id, dock] of tabs) $(id).setAttribute('aria-pressed', String(ui.dock === dock));
    $('tab-undo').disabled = !store.canUndo;
  }

  // ---------- Werkzeuge für den ausgewählten Clip ----------

  const bar = $('clipbar');
  const levels = $('clip-levels');
  const levelsBtn = $('cb-levels');
  const gainIn = $('lvl-gain');
  const fadeIn = $('lvl-in');
  const fadeOut = $('lvl-out');
  let showLevels = false;

  $('cb-edit').addEventListener('click', () => tools.edit());
  $('cb-split').addEventListener('click', () => tools.split());
  $('cb-dup').addEventListener('click', () => tools.duplicate());
  $('cb-del').addEventListener('click', () => tools.remove());
  levelsBtn.addEventListener('click', () => { showLevels = !showLevels; syncBar(); });

  const selected = () => (ui.selectedClipId ? store.findClip(ui.selectedClipId)?.clip : null);
  gainIn.addEventListener('input', () => {
    const c = selected();
    if (c) store.setClip(c.id, { gain: Number(gainIn.value) }, 'lvl-gain-' + c.id);
  });
  fadeIn.addEventListener('input', () => {
    const c = selected();
    if (c) store.setClip(c.id, { fadeInBeats: clamp(Number(fadeIn.value), 0, c.lengthBeats - (c.fadeOutBeats || 0)) }, 'lvl-in-' + c.id);
  });
  fadeOut.addEventListener('input', () => {
    const c = selected();
    if (c) store.setClip(c.id, { fadeOutBeats: clamp(Number(fadeOut.value), 0, c.lengthBeats - (c.fadeInBeats || 0)) }, 'lvl-out-' + c.id);
  });

  // Der ausgewählte Clip soll nicht hinter der Werkzeugleiste verschwinden
  let shownFor = null;
  const reveal = () => requestAnimationFrame(() => {
    const node = document.querySelector('.clip.selected');
    const box = document.getElementById('arr-scroll');
    if (!node) return;
    const r = node.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    else if (r.top < b.top + 34) box.scrollTop -= b.top + 34 - r.top;
  });

  function syncBar() {
    const c = selected();
    // Beim Einsetzen eines Sounds und bei offenem Fach stören die Clip-Werkzeuge; der Arranger braucht den Platz
    bar.hidden = !c || !!ui.armedSampleId || !!ui.dock;
    const key = bar.hidden ? null : `${c.id}|${showLevels}`;
    if (key && key !== shownFor && narrow.matches) reveal();
    shownFor = key;
    if (bar.hidden) return;
    levels.hidden = !showLevels;
    levelsBtn.setAttribute('aria-pressed', String(showLevels));
    if (!showLevels) return;
    const set = (input, value, max) => {
      input.max = String(max);
      if (document.activeElement !== input) input.value = String(value);
    };
    set(gainIn, clipGain(c), 1);
    set(fadeIn, c.fadeInBeats || 0, c.lengthBeats);
    set(fadeOut, c.fadeOutBeats || 0, c.lengthBeats);
    $('lvl-gain-out').textContent = formatDb(clipGain(c));
    $('lvl-in-out').textContent = formatBeats(c.fadeInBeats || 0);
    $('lvl-out-out').textContent = formatBeats(c.fadeOutBeats || 0);
  }

  const sync = () => { syncTabs(); syncBar(); };
  ui.on(sync);
  store.on(sync);
  narrow.addEventListener('change', layout);
  layout();
  sync();
}
