// Einstieg: Bibliothek erzeugen, Projekt laden, Oberfläche verdrahten.

import { buildLibrary } from './samples.js';
import { Store, createDemoProject, isValidProject } from './model.js';
import { Engine, renderProject } from './engine.js';
import { Emitter } from './util.js';
import { encodeWav } from './wav.js';
import { mountLibrary } from './ui/library.js';
import { mountArranger } from './ui/arranger.js';
import { mountTransport } from './ui/transport.js';
import { mountProjectIO } from './ui/project-io.js';

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
  let flashTimer = null;
  Object.assign(ui, {
    pxPerBeat: 24,
    snapBeats: 4,
    selectedClipId: null,
    armedSampleId: null,
    statusText: null,
    flashText: null,
    select(id) { if (ui.selectedClipId !== id) { ui.selectedClipId = id; ui.emit(); } },
    arm(id) { if (ui.armedSampleId !== id) { ui.armedSampleId = id; ui.emit(); } },
    // Laufende Anzeige beim Ziehen (z. B. „Fade-In: 1,5 Schläge“)
    status(text) { if (ui.statusText !== text) { ui.statusText = text; ui.emit(); } },
    // Kurze Rückmeldung nach einer Aktion
    flash(text) {
      clearTimeout(flashTimer);
      ui.flashText = text;
      ui.emit();
      flashTimer = setTimeout(() => { ui.flashText = null; ui.emit(); }, 3500);
    },
  });
  return ui;
}

function mountHints({ root, ui, library, store }) {
  const base = 'Leertaste: Start/Stopp · Lineal: klicken setzt die Position, ziehen setzt den Loop · Alt+Ziehen: kopieren · T: teilen · Strg+D: duplizieren · Strg+Z: rückgängig';
  const sync = () => {
    const armed = ui.armedSampleId && library.get(ui.armedSampleId);
    const sel = ui.selectedClipId && store.findClip(ui.selectedClipId);
    const selName = sel && (library.get(sel.clip.sampleId)?.name ?? 'Clip');
    root.classList.toggle('armed', !!(armed || ui.statusText || ui.flashText));
    document.getElementById('app').classList.toggle('armed-mode', !!armed);
    root.textContent = ui.statusText
      ?? ui.flashText
      ?? (armed ? `„${armed.name}“ ist ausgewählt. Klick in eine Spur setzt ihn ein. Esc beendet.`
        : sel ? `„${selName}“ ausgewählt · Griffe oben: Fade-In, Lautstärke, Fade-Out · Ränder: kürzen/verlängern · T: an der Abspielmarke teilen · Entf: löschen`
          : base);
  };
  ui.on(sync);
  store.on(sync);
  sync();
}

function mountClipTools({ store, engine, ui, arranger }) {
  const splitBtn = document.getElementById('split-btn');
  const dupBtn = document.getElementById('dup-btn');
  const delBtn = document.getElementById('del-btn');

  const tools = {
    split() {
      const beat = Math.round(engine.currentBeat() * 64) / 64;
      const ids = ui.selectedClipId ? [ui.selectedClipId] : null;
      const created = store.splitAt(beat, ids);
      if (!created.length) {
        ui.flash(ids ? 'Die Abspielmarke steht nicht im ausgewählten Clip.' : 'Unter der Abspielmarke liegt kein Clip.');
        return;
      }
      if (ids) arranger.select(created[0]);
      ui.flash(created.length === 1 ? 'Clip geteilt.' : `${created.length} Clips geteilt.`);
    },
    duplicate() {
      if (!ui.selectedClipId) return;
      const id = store.duplicateClip(ui.selectedClipId);
      if (id) arranger.select(id); else ui.flash('Hinter diesem Clip ist kein Platz mehr im Song.');
    },
    remove() {
      if (!ui.selectedClipId) return;
      store.deleteClip(ui.selectedClipId);
      ui.select(null);
    },
  };
  splitBtn.addEventListener('click', tools.split);
  dupBtn.addEventListener('click', tools.duplicate);
  delBtn.addEventListener('click', tools.remove);
  const sync = () => { dupBtn.disabled = delBtn.disabled = !ui.selectedClipId; };
  ui.on(sync);
  sync();
  return tools;
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
  mountProjectIO({ store, engine, ui, library });
  const tools = mountClipTools({ store, engine, ui, arranger });
  mountHints({ root: document.getElementById('hint'), ui, library, store });

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
    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) (engine.playing ? engine.stop() : engine.play());
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedClipId) {
      e.preventDefault();
      tools.remove();
    } else if (e.key === 'Escape') {
      ui.arm(null);
      ui.select(null);
      engine.stopPreview();
      arranger.render();
    } else if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo(); else store.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      store.redo();
    } else if (mod && key === 'd') {
      e.preventDefault();
      tools.duplicate();
    } else if (!mod && !e.altKey && key === 't') {
      e.preventDefault();
      tools.split();
    } else if (e.key === 'Home') {
      engine.setPosition(0);
    }
  });
  // Leertaste soll keinen fokussierten Button zusätzlich auslösen.
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });

  bootEl.hidden = true;
  document.getElementById('app').classList.add('ready');

  // Zugang für automatische Tests und spätere Werkzeuge.
  window.loopwerk = { store, engine, library, ui, arranger, tools, renderProject, encodeWav, ready: true };
}

boot().catch((err) => {
  const bootEl = document.getElementById('boot');
  bootEl.textContent = `Loopwerk konnte nicht starten: ${err.message}`;
  bootEl.classList.add('error');
  console.error(err);
});
