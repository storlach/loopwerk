// Aufteilung der Oberfläche: Desktop mit Deck in einer Zeile, Sounds|Erstellen links, Inspektor rechts,
// Fachleiste unter dem Arranger; am Handy wandern dieselben Knöpfe an ihren Ort (Deck, Kopfzeile über den Spuren,
// Fach „Song“). Menüs, Reiter und Export-Klappfeld.

import { place, narrow } from './place.js';
import { lsKey } from '../edition.js';

export function mountLayout({ store, ui, library, editName = () => '' }) {
  const $ = (id) => document.getElementById(id);
  const app = $('app');

  // ---------- Plätze: Desktop (wide) und Handy (narrow). Die Reihenfolge der Anmeldung ist die Reihenfolge im Ziel ----------
  // Aufnahme sitzt in beiden Fällen im Deck (am Handy als runder Punkt neben ▶), darum ohne Platz.
  // Raster, Klick und Loop wandern über die Spuren (so bleibt im Deck Platz für Aufnahme, Wiederholen und die Anzeige); Zoomen geht am Handy mit zwei Fingern (die Knöpfe bleiben unsichtbar im Deck)
  for (const id of ['zoom-out', 'zoom-in', 'zoomy-out', 'zoomy-in']) place($(id), { wide: $('arr-bar-view') });
  place($('snap-sel'), { wide: $('arr-bar-view'), narrow: $('arr-pills') });
  // Layout „reiter“: das Tempo-Feld wohnt neben dem Raster in der Kopfzeile über den Spuren
  place(document.querySelector('.lcd-song'), { reiter: $('arr-bar-view') });
  place($('metro-btn'), { narrow: $('arr-pills'), calm: { narrow: $('song-links'), wide: $('insp-song-tools') } });
  place($('loop-btn'), { narrow: $('arr-pills') }); // der Loop-Bereich liegt im Lineal darunter
  // Rückgängig und Wiederholen: am Handy beide im Deck
  place($('undo-btn'), { wide: $('deck-edit'), narrow: $('deck-undo') });
  place($('redo-btn'), { wide: $('deck-edit'), narrow: $('deck-undo') });
  // Song: Name oben, Speichern und Exportieren als Hauptknöpfe, der Rest als ruhige Textzeile
  place($('project-name'), { wide: $('project-menu-body'), narrow: $('song-name'), reiter: $('side-datei-name') });
  place($('open-btn'), { wide: $('project-menu-body'), narrow: $('song-links'), reiter: $('side-datei-act') });
  place($('save-btn'), { wide: $('project-menu-body'), narrow: $('song-main'), reiter: $('side-datei-act') });
  place($('export-btn'), { wide: $('deck-export'), narrow: $('song-main'), reiter: $('side-datei-export') });
  place($('demo-btn'), { wide: $('project-menu-start'), narrow: $('song-links'), reiter: $('side-datei-start') });
  place(document.querySelector('.tabbar-end'), { calm: { wide: $('insp-song-tools') }, reiter: $('side-datei-help') }); // Tastenkürzel: Song-Werkbank bzw. Befehlsliste in Datei
  place($('tips-reset'), { narrow: $('song-links'), reiter: $('side-datei-help') });
  place($('pop-about'), { reiter: $('side-datei-foot') });
  place($('new-btn'), { wide: $('project-menu-start'), narrow: $('song-links'), reiter: $('side-datei-start') });
  place(document.querySelector('.deck .brand'), { narrow: $('song-foot') });
  // Am Handy scrollt das ganze Regal: die Suche sitzt dann in einer eigenen, klebenden Zeile
  place($('shelf-find'), { narrow: $('shelf-sticky') });
  place($('shelf-filters'), { narrow: $('shelf-sticky') });
  // Dichte „calm“: Daumenleiste am Handy (Kiste · ▶ · ● · Werkbank), Mischen und FX-Pad im Fach „Song“, „+ Neu“ neben der Suche
  place($('play-btn'), { calm: { narrow: $('tabbar') } });
  place($('rec-btn'), { calm: { narrow: $('tabbar') } });
  place($('mixer-btn'), { calm: { narrow: $('song-links'), wide: $('insp-song-tools') } }); // Layout „reiter“: kein Fach, die Zeilen neben den Spuren sind der Mixer
  place($('fxpad-btn'), { calm: { narrow: $('song-links'), wide: $('insp-song-tools') }, reiter: $('mix-head') }); // Layout „reiter“: Kopf der Mixer-Spalte
  place($('shelf-new'), { calm: { narrow: $('shelf-sticky') }, reiter: $('shelf-find') }); // Layout „reiter“: „+ Neu“ neben der Suche
  // Layout „reiter“: die Abläufe (flow.js) nehmen das Erstellen-Panel und das Export-Fach auf
  place($('create-panel'), { reiter: $('flow-park') });
  place($('export'), { reiter: $('flow-park') });

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
  const showName = () => { $('project-menu-name').textContent = store.project.name || 'Projekt'; $('deck-name').textContent = store.project.name || 'Song'; };
  store.on(showName);
  // Leere Spuren: leise Zeile in Spur 1 (CSS, nur calm)
  const syncEmpty = () => app.classList.toggle('song-empty', store.project.tracks.every((t) => !t.clips.length));
  store.on(syncEmpty);
  syncEmpty();
  showName();
  // Öffnen, Beispiel und Leeren schließen das Menü (Leeren erst nach der Bestätigung)
  $('open-btn').addEventListener('click', () => setProject(false));
  $('save-btn').addEventListener('click', () => setProject(false));
  $('project-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') setProject(false); });

  popup($('keys-btn'), $('keys-pop'));
  popup($('rec-more'), $('rec-pop')); // Feld „Aufnahme“ am ● (Inhalt: rec-setup.js)
  const setPatMore = popup($('pat-more-btn'), $('pat-more'));
  // Ein Knopf im Menü (Schritt-Eingabe, Weiterführen, Einsingen, Leeren) erledigt seine Sache und schließt es
  $('pat-more').addEventListener('click', (e) => { if (e.target.closest('button')) setPatMore(false); });
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

  // ---------- Dichte „calm“: Kiste mit „+ Neu“, einklappbar; Namen der Fächer ----------
  const calm = app.dataset.density === 'calm';
  const newBtn = $('shelf-new');
  newBtn.addEventListener('click', () => {
    if (app.dataset.layout === 'reiter' && !narrow.matches) return; // dort öffnet „+ Neu“ den Ablauf „Neuer Sound“ (flows.js)
    const create = shelf.dataset.left !== 'create';
    setLeft(create ? 'create' : 'sounds');
    newBtn.setAttribute('aria-pressed', String(create));
    newBtn.textContent = create ? 'Fertig' : '+ Neu';
  });
  const foldKey = lsKey('loopwerk.kiste');
  const fold = (zu) => {
    app.classList.toggle('kiste-zu', zu);
    $('kiste-toggle').setAttribute('aria-expanded', String(!zu));
    $('kiste-toggle').setAttribute('aria-label', zu ? 'Kiste ausklappen' : 'Kiste einklappen');
    $('kiste-toggle').textContent = zu ? '›' : '‹';
  };
  try { if (calm && localStorage.getItem(foldKey) === '1') fold(true); } catch { /* Standard */ }
  $('kiste-toggle').addEventListener('click', () => {
    const zu = !app.classList.contains('kiste-zu');
    fold(zu);
    try { localStorage.setItem(foldKey, zu ? '1' : '0'); } catch { /* egal */ }
  });
  if (calm) {
    document.querySelector('.left-title').textContent = 'Kiste';
    $('tab-sounds').querySelector('.tab-label').textContent = 'Kiste';
    const labels = () => { $('mixer-btn').querySelector('.tab-label').textContent = narrow.matches ? 'Mischen' : 'Mixer'; };
    narrow.addEventListener('change', labels);
    labels();
  }

  // ---------- Fachleiste: Editor-Reiter für den ausgewählten Clip (am Handy nur „Editor“) ----------
  const editorTab = $('editor-tab');
  function syncTabs() {
    const sel = ui.selectedClipId && store.findClip(ui.selectedClipId);
    const name = sel ? (library.get(sel.clip.sampleId)?.name ?? 'Clip') : null;
    const editing = ui.dock === 'editor' || ui.dock === 'pattern';
    editorTab.disabled = !sel && !editing;
    editorTab.setAttribute('aria-pressed', String(editing));
    const label = editing ? editName(ui.dock) || name : name;
    $('editor-tab-label').textContent = label && !narrow.matches ? `Editor · ${label}` : 'Editor';
    editorTab.title = label ? `Editor · ${label}` : 'Wähle einen Clip, um ihn zu bearbeiten';
  }
  ui.on(syncTabs);
  store.on(syncTabs);
  narrow.addEventListener('change', syncTabs);
  syncTabs();

  return { setLeft, closePops, onEditorTab: (fn) => editorTab.addEventListener('click', fn) };
}
