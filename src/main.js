// Einstieg: Bibliothek erzeugen, Projekt laden, Oberfläche verdrahten.

import { buildLibrary } from './samples.js';
import { Store, createDemoProject, isValidProject, keyOf, keySemis, DEFAULT_TRACK_NAME } from './model.js';
import { Engine, renderProject } from './engine.js';
import { Emitter } from './util.js';
import { encodeWav } from './wav.js';
import { mountLibrary } from './ui/library.js';
import { mountArranger } from './ui/arranger.js';
import { mountTransport } from './ui/transport.js';
import { mountProjectIO } from './ui/project-io.js';
import { createSplash } from './ui/splash.js';
import { mountLayout } from './ui/layout.js';
import { mountInspector } from './ui/inspector.js';
import { mountCreate } from './ui/create.js';
import { mountSheets } from './ui/sheets.js';
import { mountTips } from './ui/tips.js';
import { mountBrandMeter } from './ui/brand-meter.js';
import { mountGlow } from './ui/glow.js';
import { mountWish } from './ui/wish.js';
import { mountKeySelects } from './ui/key-select.js';
import { mountMixer } from './ui/mixer.js';
import { mountEditor } from './ui/editor.js';
import { mountExport } from './ui/export-dock.js';
import { mountPatternEditor } from './ui/pattern-editor.js';
import { mountMobile, narrow } from './ui/mobile.js';
import { Patterns, patternSampleId } from './patterns.js';
import { newDrumPattern, newSynthPattern } from './instruments.js';
import { OwnSounds } from './own-sounds.js';
import { Recorder } from './recorder.js';
import { mountLinkImport } from './ui/link-import.js';
import { touch } from './ui/place.js';
import { doubleTapRanges } from './ui/touch.js';

const STORAGE_KEY = 'loopwerk.project.v1';

async function loadSaved(library, patterns) {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!isValidProject(p)) return null;
    await patterns.sync(p);
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
    snapBeats: 1,
    selectedClipId: null,
    selectedTrackId: null,
    armedSampleId: null,
    statusText: null,
    flashText: null,
    dock: null,
    setDock(name) { if (ui.dock !== name) { ui.dock = name; ui.emit(); } },
    // Mehrfachauswahl: multi enthält alle ausgewählten Clips (ab zwei); selectedClipId ist der zuletzt gewählte
    multi: [],
    select(id) {
      if (ui.selectedClipId === id && !ui.multi.length && (!id || !ui.selectedTrackId)) return;
      ui.multi = [];
      ui.selectedClipId = id;
      if (id) ui.selectedTrackId = null;
      ui.emit();
    },
    // Spur im Inspektor zeigen (hebt die Clip-Auswahl auf)
    selectTrack(id) {
      if (ui.selectedTrackId === id && !ui.selectedClipId) return;
      ui.selectedTrackId = id;
      ui.selectedClipId = null;
      ui.multi = [];
      ui.emit();
    },
    selectMany(ids) {
      const list = [...new Set(ids)];
      ui.multi = list.length > 1 ? list : [];
      ui.selectedClipId = list.length ? list[list.length - 1] : null;
      if (list.length) ui.selectedTrackId = null;
      ui.emit();
    },
    selectedIds() { return ui.multi.length ? ui.multi.slice() : ui.selectedClipId ? [ui.selectedClipId] : []; },
    arm(id) {
      if (ui.armedSampleId === id) return;
      ui.armedSampleId = id;
      if (id) ui.selecting = false;
      ui.emit();
    },
    // Finger: „Auswählen“ – jedes Antippen nimmt einen Clip zur Auswahl hinzu oder heraus (statt Umschalt-Klick)
    selecting: false,
    setSelecting(on) {
      if (ui.selecting === !!on) return;
      ui.selecting = !!on;
      if (on) ui.armedSampleId = null;
      ui.emit();
    },
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

function mountHints({ root, ui, library, store, engine }) {
  const text = root.querySelector('#hint-text');
  const done = root.querySelector('#hint-done');
  // Nur Rückmeldungen und der Einsetz-Modus erscheinen – erklärt wird über die Tipps
  const sync = () => {
    const armed = ui.armedSampleId && library.get(ui.armedSampleId);
    const finger = narrow.matches || touch.matches;
    const app = document.getElementById('app');
    app.classList.toggle('armed-mode', !!armed);
    app.classList.toggle('selecting', ui.selecting);
    done.hidden = !armed && !ui.selecting;
    const n = ui.selectedIds().length;
    const msg = ui.statusText
      ?? ui.flashText
      ?? (ui.selecting ? (n ? `${n} ${n === 1 ? 'Clip' : 'Clips'} ausgewählt` : 'Clips antippen zum Auswählen') : null)
      ?? (armed ? (finger ? `„${armed.name}“ ausgewählt. Tippe in eine Spur.` : `„${armed.name}“ ausgewählt – in eine Spur klicken setzt ihn ein, Esc beendet`) : '');
    text.textContent = msg;
    root.classList.toggle('show', !!msg);
  };
  done.addEventListener('click', () => {
    if (ui.selecting) { ui.setSelecting(false); return; }
    ui.arm(null);
    engine.stopPreview();
  });
  ui.on(sync);
  store.on(sync);
  narrow.addEventListener('change', sync);
  touch.addEventListener('change', sync);
  sync();
}

function mountClipTools({ store, engine, ui, arranger }) {
  const splitBtn = document.getElementById('split-btn');
  const dupBtn = document.getElementById('dup-btn');
  const editBtn = document.getElementById('edit-btn');
  const delBtn = document.getElementById('del-btn');
  const selectBtn = document.getElementById('select-btn');
  const selectAllBtn = document.getElementById('select-all-btn');

  const tools = {
    split() {
      const beat = Math.round(engine.heardBeat() * 64) / 64;
      const ids = ui.selectedClipId ? [ui.selectedClipId] : null;
      const created = store.splitAt(beat, ids);
      if (!created.length) {
        // Steht die Abspielmarke nicht im Clip: Schere – die Stelle per Klick wählen (am Handy wie bisher)
        if (ids && !narrow.matches) { arranger.armScissors((ok) => { if (ok) ui.flash('Clip geteilt.'); }); return; }
        ui.flash(ids ? 'Die Abspielmarke steht nicht im ausgewählten Clip. Setze sie im Lineal an die Stelle, an der geteilt werden soll.' : 'Unter der Abspielmarke liegt kein Clip.');
        return;
      }
      if (ids) arranger.select(created[0]);
      ui.flash(created.length === 1 ? 'Clip geteilt.' : `${created.length} Clips geteilt.`);
    },
    duplicate() {
      const ids = ui.selectedIds();
      if (ids.length > 1) {
        const made = store.duplicateClips(ids);
        if (made.length) ui.selectMany(made); else ui.flash('Hinter den Clips ist kein Platz mehr im Song.');
        return;
      }
      if (!ui.selectedClipId) return;
      const id = store.duplicateClip(ui.selectedClipId);
      if (id) arranger.select(id); else ui.flash('Hinter diesem Clip ist kein Platz mehr im Song.');
    },
    remove() {
      const ids = ui.selectedIds();
      if (!ids.length) return;
      if (ids.length > 1) store.deleteClips(ids); else store.deleteClip(ids[0]);
      ui.select(null);
    },
    edit() {
      if (ui.selectedClipId) tools.onEdit?.(ui.selectedClipId);
    },
    selectAll() {
      ui.selectMany(store.project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    },
  };
  editBtn.addEventListener('click', () => tools.edit());
  splitBtn.addEventListener('click', tools.split);
  dupBtn.addEventListener('click', tools.duplicate);
  delBtn.addEventListener('click', tools.remove);
  // Finger: Auswählen-Modus und „Alle“ als Knöpfe (statt Umschalt-Klick, Rahmen und Strg+A)
  selectBtn.addEventListener('click', () => ui.setSelecting(!ui.selecting));
  selectAllBtn.addEventListener('click', () => { ui.setSelecting(true); tools.selectAll(); });
  const sync = () => {
    dupBtn.disabled = delBtn.disabled = editBtn.disabled = !ui.selectedClipId;
    selectBtn.setAttribute('aria-pressed', String(ui.selecting));
  };
  ui.on(sync);
  sync();
  return tools;
}

// Tempo oder Tonart ändern: Sounds neu vorbereiten, Wiedergabe an derselben Stelle fortsetzen.
function mountTempo({ store, engine, library, ui, arranger }) {
  let running = null;
  const keyOff = () => library.semis !== keySemis(keyOf(store.project));
  async function apply() {
    if (running) return running;
    running = (async () => {
      while (library.bpm !== store.project.bpm || keyOff()) {
        const wasPlaying = engine.playing;
        const pos = engine.heardBeat();
        if (wasPlaying) engine.stop();
        if (library.bpm !== store.project.bpm) {
          ui.flash(`Tempo ${store.project.bpm} BPM – Sounds werden angepasst …`);
          await library.setTempo(store.project.bpm);
          ui.flash(`Tempo ${store.project.bpm} BPM.`);
        } else {
          const key = keyOf(store.project);
          ui.flash(`Tonart ${key} – Loops werden umgestimmt …`);
          await library.setKey(keySemis(key));
          ui.flash(`Tonart ${key}.`);
        }
        arranger.render();
        if (wasPlaying) engine.play(pos);
      }
    })();
    try { await running; } finally { running = null; }
  }
  store.on(() => { if (library.bpm !== store.project.bpm || keyOff()) apply(); });
  return { apply, get busy() { return !!running; } };
}

// Aufnahme-Knopf: Spur der Auswahl, sonst die erste freie Spur ab der Abspielmarke
function mountRecording({ store, engine, ui, arranger, recorder }) {
  const btn = document.getElementById('rec-btn');
  const label = btn.querySelector('.rec-label');
  const freeTrack = (from, to) => store.project.tracks.find((t) => !t.clips.some((c) => c.startBeat < to && c.startBeat + c.lengthBeats > from));
  btn.addEventListener('click', () => start(null));
  async function start(target) {
    if (recorder.state === 'recording') { recorder.stop(); return; }
    if (recorder.state !== 'idle') return;
    const bpb = store.project.beatsPerBar;
    const startBeat = target ? Math.floor(target.startBeat / bpb) * bpb : Math.floor(engine.heardBeat() / bpb) * bpb;
    if (engine.playing) engine.stop();
    const sel = ui.selectedClipId && store.findClip(ui.selectedClipId);
    let trackId = target?.trackId ?? sel?.track.id ?? freeTrack(startBeat, startBeat + 16)?.id;
    if (!trackId) trackId = store.addTrack();
    if (!trackId) { ui.flash('Keine freie Spur für die Aufnahme.'); return; }
    try {
      await recorder.start({ trackId, startBeat });
      ui.flash('Aufnahme läuft – ein Takt Vorzähler. Nochmal klicken oder Leertaste beendet.');
    } catch (err) {
      ui.flash(err.code === 'denied'
        ? 'Kein Zugriff auf das Mikrofon. Erlaube den Zugriff im Browser oder importiere eine Aufnahme als Datei.'
        : 'Aufnahmen sind in dieser Ansicht nicht möglich (z. B. in claude.ai). Nimm mit einer anderen App auf und importiere die Datei („Datei importieren“).');
    }
  }
  recorder.on((what, payload) => {
    const rec = recorder.state === 'recording' || recorder.state === 'arming';
    btn.classList.toggle('recording', recorder.state === 'recording');
    btn.setAttribute('aria-pressed', String(rec));
    label.textContent = recorder.state === 'recording' ? 'Stopp' : recorder.state === 'saving' ? 'Speichert …' : 'Aufnahme';
    if (what === 'recorded') { arranger.select(payload.clipId); ui.flash(`„${payload.sample.name}“ aufgenommen und auf die Spur gelegt.`); }
    if (what === 'error') ui.flash(payload.message);
  });
  return { start };
}

function mountImport({ store, ui, arranger, own, shelf }) {
  const btn = document.getElementById('import-btn');
  const input = document.getElementById('import-input');
  const app = document.getElementById('app');
  async function importFiles(files, target) {
    let placed = null;
    let at = target?.startBeat ?? 0;
    for (const file of files) {
      try {
        const sample = await own.importFile(file);
        if (target) {
          placed = store.addClip(target.trackId, sample.id, at, sample.lengthBeats);
          at += sample.lengthBeats;
        } else ui.arm(sample.id);
        // Im Regal aufklappen und hinscrollen, sonst übersieht man den neuen Sound in der zugeklappten Gruppe
        shelf.reveal(sample.id);
        ui.flash(`„${sample.name}“ importiert${target ? ' und eingesetzt' : ' – steht unter „Eigene“. Tippe oder klicke in eine Spur, um ihn einzusetzen'}.`);
      } catch (err) {
        ui.flash(err.message);
      }
    }
    if (placed) arranger.select(placed);
  }
  // Manche Apps (eingebettete Browser) öffnen keine Dateiauswahl. Merkt die Seite nichts davon
  // (kein Fokuswechsel, keine Auswahl), erklärt ein Hinweis den Ausweg.
  let picking = null;
  const pickerSeen = () => { if (picking) { clearTimeout(picking); picking = null; } };
  window.addEventListener('blur', pickerSeen);
  document.addEventListener('visibilitychange', pickerSeen);
  input.addEventListener('cancel', pickerSeen);
  btn.addEventListener('click', () => {
    input.click();
    clearTimeout(picking);
    picking = setTimeout(() => {
      picking = null;
      if (document.hasFocus()) ui.flash('Keine Dateiauswahl geöffnet? In manchen Apps ist das Hochladen gesperrt – öffne Loopwerk im Browser (Chrome, Safari, Firefox) oder ziehe die Datei direkt auf eine Spur.');
    }, 2500);
  });
  let pendingTarget = null; // Spur/Schlag, wenn die Import-Karte auf eine Spur gezogen wurde
  input.addEventListener('change', () => { pickerSeen(); const files = [...input.files]; input.value = ''; const t = pendingTarget; pendingTarget = null; importFiles(files, t); });
  // Dateien direkt auf eine Spur ziehen
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const probe = { category: 'own', lengthBeats: 4 };
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    app.classList.add('file-over');
    arranger.dropTargetAt(e.clientX, e.clientY, probe);
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) { app.classList.remove('file-over'); arranger.clearDropPreview(); } });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    app.classList.remove('file-over');
    const target = arranger.dropTargetAt(e.clientX, e.clientY, probe);
    arranger.clearDropPreview();
    importFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)), target);
  });
  return { importFiles, pick(target) { pendingTarget = target; btn.click(); } };
}

const splash = createSplash();

async function boot() {
  splash.set(0.03, 'Starte …');
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
  // Sounds machen den Großteil der Ladezeit aus: 5–80 %
  // Nur die Katalog-Sounds, die das Projekt benutzt, vor dem Start laden – der Rest kommt im Hintergrund
  const need = new Set((isValidProject(saved) ? saved : createDemoProject()).tracks.flatMap((t) => t.clips.map((c) => c.sampleId)));
  const library = await buildLibrary({
    need,
    semis: keySemis(keyOf(isValidProject(saved) ? saved : null)),
    bpm: isValidProject(saved) ? saved.bpm : 120,
    onProgress: (done, total) => splash.set(0.05 + 0.75 * (done / total), `Sounds werden geladen – ${done} von ${total}`),
  });
  splash.set(0.82, 'Eigene Sounds …');
  const own = new OwnSounds(library);
  await own.loadAll();
  splash.set(0.88, 'Projekt wird geöffnet …');
  const patterns = new Patterns(library);
  const store = new Store((await loadSaved(library, patterns)) ?? createDemoProject(), {
    sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4,
    sampleName: (id) => library.get(id)?.name,
  });
  const engine = new Engine(store, library);
  const ui = createUi();

  const arranger = mountArranger({ root: document.getElementById('arr-scroll'), store, engine, library, ui });
  const shelf = mountLibrary({
    root: document.getElementById('library'), library, store, engine, ui, arranger,
    onDeleteOwn: async (id) => {
      if (store.project.tracks.some((t) => t.clips.some((c) => c.sampleId === id))) {
        ui.flash('Dieser Sound wird im Projekt benutzt. Entferne erst die Clips.');
        return;
      }
      if (ui.armedSampleId === id) ui.arm(null);
      const pat = library.get(id)?.patternId;
      if (pat) { store.removePattern(pat); ui.flash('Pattern gelöscht (Strg+Z holt es zurück).'); return; }
      await own.remove(id);
      ui.flash('Eigener Sound gelöscht.');
    },
  });
  mountTransport({ store, engine, ui, arranger });
  mountProjectIO({ store, engine, ui, library, own, patterns });
  const tools = mountClipTools({ store, engine, ui, arranger });
  const mixer = mountMixer({ root: document.getElementById('mixer'), store, engine, ui });
  const editor = mountEditor({ root: document.getElementById('editor'), store, engine, library, ui, own });
  const patternEditor = mountPatternEditor({ root: document.getElementById('pattern'), store, engine, library, ui });
  // Pattern-Clips öffnen den Pattern-Editor, alle anderen den Sample-Editor
  const openClip = (clipId) => {
    const c = store.findClip(clipId)?.clip;
    const pid = c && library.get(c.sampleId)?.patternId;
    if (pid) patternEditor.open(pid); else editor.open(clipId);
  };
  tools.onEdit = openClip;
  document.getElementById('arr-scroll').addEventListener('dblclick', (e) => {
    const clip = e.target.closest('.clip');
    // Beim Auswählen mit dem Finger ist zweimal Antippen ab- und wieder anwählen, kein Doppelklick
    if (clip && !e.target.closest('.clip-grip') && !ui.selecting) openClip(clip.dataset.clipId);
  });

  // Patterns synchron halten; geänderte Pattern-Sounds sofort hörbar und sichtbar
  let redraw = 0;
  patterns.onChange = () => {
    engine.refresh();
    cancelAnimationFrame(redraw);
    redraw = requestAnimationFrame(() => arranger.render());
  };
  store.on(() => patterns.sync(store.project));
  await patterns.sync(store.project);

  // Neues Pattern: auf eine freie Spur an der Abspielmarke legen und Editor öffnen
  // Neues Pattern: an der Ablagestelle oder an der Abspielmarke, bevorzugt auf einer leeren Spur
  // (die dann wie das Pattern heißt), sonst auf einer neuen Spur. Editor öffnen.
  async function createPattern(make, target = null) {
    const n = 1 + Object.values(store.project.patterns || {}).filter((p) => p.type === make().type).length;
    const pattern = make(n);
    const pid = store.addPattern(pattern);
    await patterns.sync(store.project);
    const len = pattern.bars * 4;
    const bpb = store.project.beatsPerBar;
    const at = target ? Math.floor(target.startBeat / bpb) * bpb : Math.floor(engine.heardBeat() / bpb) * bpb;
    const empty = store.project.tracks.find((t) => !t.clips.length && DEFAULT_TRACK_NAME.test(t.name));
    const trackId = target?.trackId ?? empty?.id ?? store.addTrack()
      ?? store.project.tracks.find((t) => !t.clips.some((c) => c.startBeat < at + len && c.startBeat + c.lengthBeats > at))?.id;
    if (trackId) arranger.select(store.addClip(trackId, patternSampleId(pid), at, len));
    patternEditor.open(pid);
    return pid;
  }
  document.getElementById('new-beat-btn').addEventListener('click', () => createPattern(newDrumPattern));
  document.getElementById('new-melody-btn').addEventListener('click', () => createPattern(newSynthPattern));
  library.on(() => { cancelAnimationFrame(redraw); redraw = requestAnimationFrame(() => arranger.render()); });
  // Clips mit geänderter Laufzeit: gedehnte Fassung im Hintergrund rechnen (auch nach Tempowechsel), dann neu einplanen
  // Sounds des Projekts laden bzw. erzeugen (auf Abruf) und gedehnte Fassungen bereitstellen
  const ensureStretch = () => library.ensureProject(store.project).then(() => engine.refresh()).catch((err) => ui.flash(`Sounds: ${err.message}`));
  store.on(ensureStretch);
  library.on(ensureStretch);
  ui.on(() => document.getElementById('app').classList.toggle('dock-open', !!ui.dock));
  const recorder = new Recorder({ engine, store, own });
  const recording = mountRecording({ store, engine, ui, arranger, recorder });
  const importer = mountImport({ store, ui, arranger, own, shelf });
  mountBrandMeter(engine);
  const glow = mountGlow({ engine, store, library, ui });
  doubleTapRanges();
  const linkImport = mountLinkImport({ ui, importer, engine, own, store, arranger, shelf });
  const tempo = mountTempo({ store, engine, library, ui, arranger });
  mountExport({ root: document.getElementById('export'), store, library, ui, engine, tempo });
  splash.set(0.94, 'Oberfläche wird aufgebaut …');
  if (library.bpm !== store.project.bpm || library.semis !== keySemis(keyOf(store.project))) { splash.set(0.95, 'Sounds werden angepasst …'); await tempo.apply(); }
  mountHints({ root: document.getElementById('hint'), ui, library, store, engine });
  const inspector = mountInspector({ root: document.getElementById('insp'), store, ui, library, tools });
  const layout = mountLayout({
    store, ui, library,
    editName: (dock) => (dock === 'pattern' ? store.project.patterns?.[patternEditor.id]?.name : editor.state?.src?.name),
  });
  layout.onEditorTab(() => {
    if (ui.dock === 'editor' || ui.dock === 'pattern') ui.setDock(null);
    else tools.edit();
  });
  mountCreate({
    root: document.getElementById('create-panel'), arranger,
    actions: {
      beat: (t) => createPattern(newDrumPattern, t),
      melody: (t) => createPattern(newSynthPattern, t),
      sing: async (t) => { await createPattern(newSynthPattern, t); patternEditor.openSing(); },
      record: (t) => recording.start(t),
      import: (t) => importer.pick(t),
      link: (t) => linkImport.open(t),
    },
  });
  const wish = mountWish({ store, library, ui });
  mountKeySelects(store);
  mountMobile({ store, ui, tools });
  const sheets = mountSheets({ ui, arranger });
  const tips = mountTips({ ui, store });

  let saveTimer = null;
  const saveNow = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.project)); } catch { /* Speicher nicht verfügbar */ }
  };
  store.on(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  });
  // Beim Verlassen oder Neuladen sofort sichern, sonst ginge die letzte Änderung verloren
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });

  const typing = (t) => (t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  document.addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) (engine.playing ? engine.pause() : engine.play());
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedClipId) {
      e.preventDefault();
      tools.remove();
    } else if (e.key === 'Escape') {
      if (arranger.cancelScissors()) return;
      if (ui.selecting) { ui.setSelecting(false); return; }
      if (ui.dock) { ui.setDock(null); return; }
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
    } else if (mod && key === 'a') {
      // Alle Clips auswählen
      e.preventDefault();
      tools.selectAll();
    } else if (!mod && !e.altKey && key === 't') {
      e.preventDefault();
      tools.split();
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (arranger.nudge(e.key === 'ArrowLeft' ? -1 : 1, e)) e.preventDefault();
    } else if (e.key === 'Home') {
      engine.setPosition(0);
    }
  });
  // Leertaste soll keinen fokussierten Button zusätzlich auslösen.
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing(e.target)) e.preventDefault(); });

  splash.done();
  document.getElementById('app').classList.add('ready');

  // Zugang für automatische Tests und spätere Werkzeuge.
  window.loopwerk = { store, engine, library, ui, arranger, tools, tempo, mixer, editor, own, recorder, importer, linkImport, patterns, patternEditor, inspector, layout, sheets, tips, renderProject, encodeWav, glow, wish, ready: true };
}

boot().catch((err) => {
  splash.fail(`Loopwerk konnte nicht starten: ${err.message}`);
  console.error(err);
});
