// Aufteilung der Oberfläche: Desktop mit Deck in einer Zeile, Sounds|Erstellen links, Inspektor rechts,
// Leiste unten; am Handy wandern dieselben Knöpfe ins Fach „Mehr“. Menüs, Reiter und Export-Klappfeld.

import { place, narrow } from './place.js';

export function mountLayout({ store, ui, library, editName = () => '' }) {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const more = $('more');
  const slot = (name) => more.querySelector(`[data-slot="${name}"]`);

  // ---------- Plätze: Desktop (wide) und Handy (narrow) ----------
  place($('rec-btn'), { narrow: slot('play') });
  place($('metro-btn'), { narrow: slot('play') });
  for (const id of ['undo-btn', 'redo-btn']) place($(id), { wide: $('deck-edit'), narrow: slot('edit') });
  for (const id of ['zoom-out', 'zoom-in', 'snap-sel']) place($(id), { wide: $('arr-bar-view'), narrow: slot('edit') });
  for (const id of ['project-name', 'open-btn', 'save-btn']) place($(id), { wide: $('project-menu-body'), narrow: slot('project') });
  place($('export-btn'), { wide: $('deck-export'), narrow: slot('project') });
  for (const id of ['demo-btn', 'new-btn']) place($(id), { wide: $('project-menu-body'), narrow: slot('project') });
  place($('tips-reset'), { narrow: slot('project') });
  place(document.querySelector('.deck .brand'), { narrow: slot('about') });
  place($('mixer-btn'), { wide: $('deskbar-tabs') });
  // Editor-Reiter hinter den Mixer-Knopf
  place($('editor-tab'), { wide: $('deskbar-tabs') });
  place($('hint'), { wide: $('deskbar-hint') });

  // ---------- Aufklappfelder: eins zur Zeit, Klick daneben oder Esc schließt ----------
  const pops = [];
  function popup(btn, pop, { onOpen } = {}) {
    const set = (open) => {
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) { for (const p of pops) if (p.pop !== pop) p.set(false); onOpen?.(); }
    };
    btn.addEventListener('click', () => set(pop.hidden));
    pops.push({ btn, pop, set });
    return set;
  }
  document.addEventListener('pointerdown', (e) => {
    for (const p of pops) if (!p.pop.hidden && !p.pop.contains(e.target) && !p.btn.contains(e.target)) p.set(false);
  }, true);
  // Esc schließt ein offenes Feld – Eingabefelder darin verarbeiten Esc zuerst selbst (Eingabe verwerfen)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = pops.find((p) => !p.pop.hidden);
    if (!open) return;
    // Eingabefeld im Feld: erst verwirft das Feld seine Eingabe, danach schließt das Menü
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && open.pop.contains(e.target)) {
      e.target.addEventListener('keydown', () => { open.set(false); open.btn.focus(); }, { once: true });
      return;
    }
    open.set(false);
    open.btn.focus();
    e.stopPropagation();
  }, true);
  const closePops = () => pops.forEach((p) => p.set(false));

  // Projekt-Menü: Name sichtbar im Knopf
  const setProject = popup($('project-menu-btn'), $('project-menu'), { onOpen: () => requestAnimationFrame(() => $('project-name').select?.()) });
  const showName = () => { $('project-menu-name').textContent = store.project.name || 'Projekt'; };
  store.on(showName);
  showName();
  // Öffnen, Beispiel und Leeren schließen das Menü (Leeren erst nach der Bestätigung)
  $('open-btn').addEventListener('click', () => setProject(false));
  $('save-btn').addEventListener('click', () => setProject(false));
  $('project-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') setProject(false); });

  popup($('keys-btn'), $('keys-pop'));
  const setPatMore = popup($('pat-more-btn'), $('pat-more'));
  ui.on(() => { if (ui.dock !== 'pattern') setPatMore(false); });

  // Export am Desktop als Klappfeld unter seinem Knopf
  const deck = document.querySelector('.deck');
  const syncDeckBottom = () => app.style.setProperty('--deck-bottom', `${Math.round(deck.getBoundingClientRect().bottom + 6)}px`);
  new ResizeObserver(syncDeckBottom).observe(deck);
  window.addEventListener('resize', syncDeckBottom);
  document.addEventListener('pointerdown', (e) => {
    if (narrow.matches || ui.dock !== 'export') return;
    if (!$('export').contains(e.target) && !$('export-btn').contains(e.target)) ui.setDock(null);
  }, true);

  // ---------- Linke Spalte: Sounds | Erstellen ----------
  const shelf = document.querySelector('.shelf');
  function setLeft(which) {
    shelf.dataset.left = which;
    for (const b of document.querySelectorAll('.ltab')) b.setAttribute('aria-selected', String(b.dataset.left === which));
  }
  for (const b of document.querySelectorAll('.ltab')) b.addEventListener('click', () => setLeft(b.dataset.left));

  // ---------- Leiste unten: Editor-Reiter für den ausgewählten Clip ----------
  const editorTab = $('editor-tab');
  function syncTabs() {
    const sel = ui.selectedClipId && store.findClip(ui.selectedClipId);
    const name = sel ? (library.get(sel.clip.sampleId)?.name ?? 'Clip') : null;
    const editing = ui.dock === 'editor' || ui.dock === 'pattern';
    editorTab.disabled = !sel && !editing;
    editorTab.setAttribute('aria-pressed', String(editing));
    $('editor-tab-label').textContent = editing ? `Editor · ${editName(ui.dock) || name || ''}` : name ? `Editor · ${name}` : 'Editor';
  }
  ui.on(syncTabs);
  store.on(syncTabs);
  syncTabs();

  return { setLeft, closePops, onEditorTab: (fn) => editorTab.addEventListener('click', fn) };
}
