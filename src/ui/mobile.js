// Handy-Bedienung: Fachleiste unten (Sounds, Mixer, Editor, Mehr), darüber ein Fach für Regal oder Dock,
// Werkzeuge für den ausgewählten Clip. Auf breiten Bildschirmen bleibt alles, wie es ist.

import { clipGain } from '../model.js';
import { clamp } from '../util.js';
import { formatDb } from './arranger.js';

import { narrow } from './place.js';

export { narrow };
// Diese Fächer gibt es nur am Handy; Mixer, Editoren und Export sind die gewöhnlichen Docks.
const PHONE_DOCKS = ['sounds', 'more', 'tempo'];
const TEMPO_PRESETS = [80, 90, 100, 120, 128, 140];

const formatBeats = (b) => (b <= 0 ? 'aus' : `${String(Math.round(b * 100) / 100).replace('.', ',')} ${b === 1 ? 'Schlag' : 'Schläge'}`);

export function mountMobile({ store, ui, tools }) {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const more = $('more');

  // Die Deck-Knöpfe verteilt layout.js (am Handy ins Fach „Mehr“). Hier nur: Handy-Fächer am Desktop schließen.
  function layout() {
    if (!narrow.matches && PHONE_DOCKS.includes(ui.dock)) ui.setDock(null);
  }

  // ---------- Leiste unten ----------

  // Mixer und Editor bedienen mixer.js und layout.js – dieselben Reiter wie am Desktop
  const tabs = [['tab-sounds', 'sounds'], ['tab-more', 'more']];
  for (const [id, dock] of tabs) $(id).addEventListener('click', () => ui.setDock(ui.dock === dock ? null : dock));
  $('more-close').addEventListener('click', () => ui.setDock(null));

  function syncTabs() {
    app.dataset.dock = ui.dock || '';
    more.hidden = ui.dock !== 'more';
    for (const [id, dock] of tabs) $(id).setAttribute('aria-pressed', String(ui.dock === dock));
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

  // ---------- Tempo ohne Bildschirmtastatur ----------

  const bpmInput = $('bpm-input');
  const tempoPanel = $('tempo');
  const tempoValue = $('tempo-value');
  const slider = $('tempo-slider');
  let pending = null;
  let applyTimer = null;

  function setInputMode() {
    // Am Handy öffnet das Tempo-Feld das Tempo-Fach statt der Tastatur
    bpmInput.readOnly = narrow.matches;
    bpmInput.inputMode = narrow.matches ? 'none' : 'numeric';
  }
  bpmInput.addEventListener('click', () => {
    if (!narrow.matches) return;
    bpmInput.blur();
    ui.setDock(ui.dock === 'tempo' ? null : 'tempo');
  });

  const presets = $('tempo-presets');
  for (const v of TEMPO_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.textContent = String(v);
    b.dataset.bpm = String(v);
    b.addEventListener('click', () => choose(v, true));
    presets.append(b);
  }

  // Anzeige folgt sofort; die Sounds werden erst nach einer kurzen Pause angepasst (das dauert einige Sekunden)
  function choose(v, now = false) {
    pending = clamp(Math.round(v), 60, 200);
    showTempo();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => { store.setBpm(pending); pending = null; showTempo(); }, now ? 0 : 700);
  }
  const step = (d) => () => choose((pending ?? store.project.bpm) + d);
  $('tempo-m5').addEventListener('click', step(-5));
  $('tempo-m1').addEventListener('click', step(-1));
  $('tempo-p1').addEventListener('click', step(1));
  $('tempo-p5').addEventListener('click', step(5));
  slider.addEventListener('input', () => { pending = Number(slider.value); showTempo(); });
  slider.addEventListener('change', () => choose(Number(slider.value), true));
  $('tempo-close').addEventListener('click', () => ui.setDock(null));

  function showTempo() {
    const v = pending ?? store.project.bpm;
    tempoValue.textContent = String(v);
    if (document.activeElement !== slider) slider.value = String(v);
    for (const b of presets.children) b.setAttribute('aria-pressed', String(Number(b.dataset.bpm) === v));
  }

  // ---------- Bildschirmtastatur ----------

  const isText = (n) => !!n && !n.readOnly && (n.tagName === 'TEXTAREA'
    || (n.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'file', 'submit'].includes(n.type)));
  let kbdTimer = null;
  const fitViewport = () => {
    const vv = window.visualViewport;
    if (vv) app.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  document.addEventListener('focusin', (e) => {
    if (!narrow.matches || !isText(e.target)) return;
    clearTimeout(kbdTimer);
    app.classList.add('kbd');
    app.dataset.kbdIn = e.target.closest('.arranger') ? 'arr' : 'dock';
    fitViewport();
    requestAnimationFrame(() => e.target.scrollIntoView({ block: 'nearest' }));
  });
  const endKbd = () => { if (!isText(document.activeElement)) { app.classList.remove('kbd'); delete app.dataset.kbdIn; } };
  // „blur“ in der Capture-Phase: kommt auch an, wenn das Feld beim Verlassen sofort entfernt wird
  // (Spurname: Tipp daneben speichert und entfernt das Eingabefeld – „focusout“ erreicht das Dokument dann nicht mehr)
  document.addEventListener('blur', (e) => {
    if (!isText(e.target)) return;
    // Kurz warten: ein Tipp auf einen Treffer soll noch auf dem Element landen, auf das gezielt wurde
    clearTimeout(kbdTimer);
    kbdTimer = setTimeout(endKbd, 250);
  }, true);
  window.visualViewport?.addEventListener('resize', () => {
    fitViewport();
    // Sicherheitsnetz: Tastatur zu und kein Textfeld mehr aktiv → Leiste wieder zeigen
    if (app.classList.contains('kbd')) { clearTimeout(kbdTimer); kbdTimer = setTimeout(endKbd, 250); }
  });
  // Enter in der Suche schließt die Tastatur, die Treffer bleiben
  $('shelf-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.currentTarget.blur(); });

  const sync = () => { syncTabs(); syncBar(); tempoPanel.hidden = ui.dock !== 'tempo'; if (!tempoPanel.hidden) showTempo(); };
  ui.on(sync);
  store.on(sync);
  narrow.addEventListener('change', () => { layout(); setInputMode(); });
  layout();
  setInputMode();
  sync();
}
