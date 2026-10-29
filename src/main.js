// Einstieg: Bibliothek erzeugen, Projekt laden, Oberfläche verdrahten.

import { buildLibrary } from './samples.js';
import { Store, createDemoProject, isValidProject } from './model.js';
import { Engine, renderProject } from './engine.js';
import { Emitter } from './util.js';
import { encodeWav } from './wav.js';
import { mountLibrary } from './ui/library.js';
import { mountArranger } from './ui/arranger.js';
import { mountTransport } from './ui/transport.js';

const STORAGE_KEY = 'loopwerk.project.v1';

function loadSaved(library) {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!isValidProject(p)) return null;
    for (const t of p.tracks) t.clips = t.clips.filter((c) => library.get(c.sampleId));
    return p;
  } catch {
    return null;
  }
}

function createUi() {
  const ui = new Emitter();
  Object.assign(ui, {
    pxPerBeat: 24,
    snapBeats: 4,
    selectedClipId: null,
    armedSampleId: null,
    select(id) { if (ui.selectedClipId !== id) { ui.selectedClipId = id; ui.emit(); } },
    arm(id) { if (ui.armedSampleId !== id) { ui.armedSampleId = id; ui.emit(); } },
  });
  return ui;
}

function mountHints({ root, ui, library }) {
  const base = 'Leertaste: Start/Stopp · Lineal: klicken setzt die Position, ziehen setzt den Loop · Entf: Clip löschen · Alt+Ziehen: kopieren · Strg+Z: rückgängig';
  const sync = () => {
    const armed = ui.armedSampleId && library.get(ui.armedSampleId);
    root.classList.toggle('armed', !!armed);
    document.getElementById('app').classList.toggle('armed-mode', !!armed);
    root.textContent = armed
      ? `„${armed.name}“ ist ausgewählt. Klick in eine Spur setzt ihn ein. Esc beendet.`
      : base;
  };
  ui.on(sync);
  sync();
}

async function boot() {
  const bootEl = document.getElementById('boot');
  const library = await buildLibrary();
  const store = new Store(loadSaved(library) ?? createDemoProject(), {
    sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4,
  });
  const engine = new Engine(store, library);
  const ui = createUi();

  const arranger = mountArranger({ root: document.getElementById('arr-scroll'), store, engine, library, ui });
  mountLibrary({ root: document.getElementById('library'), library, store, engine, ui, arranger });
  mountTransport({ store, engine, ui, arranger });
  mountHints({ root: document.getElementById('hint'), ui, library });

  let saveTimer = null;
  store.on(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.project)); } catch { /* Speicher nicht verfügbar */ }
    }, 300);
  });

  const typing = (t) => (t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  document.addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) (engine.playing ? engine.stop() : engine.play());
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedClipId) {
      e.preventDefault();
      store.deleteClip(ui.selectedClipId);
      ui.select(null);
    } else if (e.key === 'Escape') {
      ui.arm(null);
      ui.select(null);
      engine.stopPreview();
      arranger.render();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo(); else store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
    } else if (e.key === 'Home') {
      engine.setPosition(0);
    }
  });
  // Leertaste soll keinen fokussierten Button zusätzlich auslösen.
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });

  bootEl.hidden = true;
  document.getElementById('app').classList.add('ready');

  // Zugang für automatische Tests und spätere Werkzeuge.
  window.loopwerk = { store, engine, library, ui, arranger, renderProject, encodeWav, ready: true };
}

boot().catch((err) => {
  const bootEl = document.getElementById('boot');
  bootEl.textContent = `Loopwerk konnte nicht starten: ${err.message}`;
  bootEl.classList.add('error');
  console.error(err);
});
