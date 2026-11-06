// Einstieg: Bibliothek erzeugen, Projekt laden, Oberfläche verdrahten.

import { buildLibrary } from './samples.js';
import { Store, createDemoProject, createEmptyProject, isValidProject, keyOf, keySemis, DEFAULT_TRACK_NAME, chordsOf, soundKeysOf, clipSampleIds } from './model.js';
import { accompanimentPlan, applyPlan } from './starter.js';
import { mountStarter } from './ui/starter.js';
import { Engine, renderProject } from './engine.js';
import { Emitter } from './util.js';
import { encodeWav } from './wav.js';
import { mountLibrary } from './ui/library.js';
import { mountArranger, headW } from './ui/arranger.js';
import { mountZoomBars, loadZoom } from './ui/zoombars.js';
import { mountTransport } from './ui/transport.js';
import { mountProjectIO } from './ui/project-io.js';
import { createSplash } from './ui/splash.js';
import { mountLayout } from './ui/layout.js';
import { mountInspector } from './ui/inspector.js';
import { mountSoundBench } from './ui/sound-bench.js';
import { mountCreate } from './ui/create.js';
import { mountSheets } from './ui/sheets.js';
import { mountTips } from './ui/tips.js';
import { mountBrandMeter } from './ui/brand-meter.js';
import { mountGlow } from './ui/glow.js';
import { mountKeySelects } from './ui/key-select.js';
import { mountMixer } from './ui/mixer.js';
import { mountEditor } from './ui/editor.js';
import { mountExport } from './ui/export-dock.js';
import { mountMasteringAnalysis } from './mastering.js';
import { mountMasteringControls } from './ui/mastering.js';
import { mountFxPad } from './ui/fxpad.js';
import { mountPatternEditor } from './ui/pattern-editor.js';
import { mountMobile, narrow } from './ui/mobile.js';
import { Patterns, patternSampleId } from './patterns.js';
import { newDrumPattern, newSynthPattern } from './instruments.js';
import { OwnSounds } from './own-sounds.js';
import { Recorder } from './recorder.js';
import { mountLinkImport } from './ui/link-import.js';
import { touch, place } from './ui/place.js';
import { doubleTapRanges } from './ui/touch.js';
import { EDITION, lsKey } from './edition.js';
import { applySurfaces } from './ui/surfaces.js';
import { clearInstruments } from './sampler.js';
import { mountPwa } from './pwa.js';
import { mountClipFloat } from './ui/clip-float.js';
import { mountRecSetup } from './ui/rec-setup.js';
import { stepTake } from './ui/take-row.js';

// iOS-Safari zoomt beim Antippen eines Felds mit Schrift unter 16 px in die Seite. maximum-scale=1 verhindert das;
// Zoomen mit zwei Fingern bleibt erlaubt (Safari ignoriert die Grenze dafür). Für Gerüste, die wir nicht selbst schreiben.
{
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1';
}

const STORAGE_KEY = lsKey('loopwerk.project.v1');

// Edition (ADR 007): Kennzeichen am Wurzelelement, abgeschaltete Flächen ausblenden – vor allem anderen
{
  const app = document.getElementById('app');
  if (app) { app.dataset.edition = EDITION.id; app.dataset.density = EDITION.density; }
  applySurfaces(EDITION.surfaces);
  if (!EDITION.catalogs) clearInstruments();
}
const startProject = () => (EDITION.demo ? createDemoProject() : createEmptyProject(EDITION));

const missingSound = (library, clip) => library.placeholder(clip);

async function loadSaved(library, patterns) {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!isValidProject(p)) return null;
    await patterns.sync(p);
    library.syncVariants(p); // Varianten (Klang-Rezept) vor dem Platzhalter-Check
    // Fehlt ein Sound (z. B. vom Browser gelöscht), bleibt der Clip als stummer Platzhalter „Sound fehlt“ –
    // sonst wäre das Arrangement beim nächsten Speichern für immer weg. Eine Projektdatei bringt den Klang zurück.
    for (const t of p.tracks) for (const c of t.clips) for (const id of clipSampleIds(c)) if (!library.get(id)) missingSound(library, { ...c, sampleId: id });
    return p;
  } catch {
    return null;
  }
}

function createUi() {
  const ui = new Emitter();
  const zoom0 = loadZoom();
  let flashTimer = null;
  Object.assign(ui, {
    pxPerBeat: zoom0.ppb ?? 24,
    trackZoom: zoom0.trackZoom ?? 1, // Spurhöhe als Faktor auf die Grundhöhe
    snapBeats: 1,
    selectedClipId: null,
    selectedTrackId: null,
    benchSoundId: null, // Krachwerk: Werkbank für einen Sound aus der Kiste (ohne Clip)
    armedSampleId: null,
    statusText: null,
    flashText: null,
    dock: null,
    setDock(name) {
      if (ui.dock === name) return;
      ui.dock = name;
      if (name !== 'werkbank' && ui.benchSoundId && narrow.matches) ui.benchSoundId = null; // Handy: Schublade zu = Sound-Werkbank zu
      ui.emit();
    },
    // Mehrfachauswahl: multi enthält alle ausgewählten Clips (ab zwei); selectedClipId ist der zuletzt gewählte
    multi: [],
    select(id) {
      if (ui.selectedClipId === id && !ui.multi.length && (!id || !ui.selectedTrackId) && !ui.benchSoundId) return;
      ui.multi = [];
      ui.selectedClipId = id;
      ui.benchSoundId = null;
      if (id) ui.selectedTrackId = null;
      ui.emit();
    },
    // Werkbank für einen Sound aus der Kiste (Doppelklick/lange drücken); null schließt sie
    openSound(id) {
      if (ui.benchSoundId === (id || null) && !ui.selectedClipId && !ui.selectedTrackId) return;
      ui.benchSoundId = id || null;
      if (id) { ui.selectedClipId = null; ui.selectedTrackId = null; ui.multi = []; }
      ui.emit();
    },
    // Spur im Inspektor zeigen (hebt die Clip-Auswahl auf)
    selectTrack(id) {
      if (ui.selectedTrackId === id && !ui.selectedClipId && !ui.benchSoundId) return;
      ui.selectedTrackId = id;
      ui.selectedClipId = null;
      ui.benchSoundId = null;
      ui.multi = [];
      ui.emit();
    },
    selectMany(ids) {
      const list = [...new Set(ids)];
      ui.multi = list.length > 1 ? list : [];
      ui.selectedClipId = list.length ? list[list.length - 1] : null;
      if (list.length) { ui.selectedTrackId = null; ui.benchSoundId = null; }
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
    // Scharf für die Aufnahme (2.13 C): Spur-IDs in der Reihenfolge des Scharfschaltens. UI-Zustand, nicht im Projekt
    recTracks: [],
    setRecArm(id, on) {
      const has = ui.recTracks.includes(id);
      if (!id || has === !!on) return;
      ui.recTracks = on ? [...ui.recTracks, id] : ui.recTracks.filter((x) => x !== id);
      ui.emit();
    },
    toggleRecArm(id) { ui.setRecArm(id, !ui.recTracks.includes(id)); },
    isRecArmed(id) { return ui.recTracks.includes(id); },
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

// Tempo oder Tonart ändern: Sounds neu vorbereiten.
// Tempo: die Wiedergabe läuft ohne Pause weiter (die Engine setzt im neuen Tempo an und gleicht Sounds im alten Tempo
// wie Tonband aus). Zuerst die Sounds des Songs, dann der Rest im Hintergrund; ein neuer Wert verwirft den alten Auftrag.
// Tonart: anhalten, umstimmen, an derselben Stelle weiter.
function mountTempo({ store, engine, library, ui, arranger }) {
  let running = null;
  let tempoJob = null; // läuft, bis alle geladenen Sounds im neuen Tempo vorliegen
  let usedBusy = false; // bis die Sounds des Songs im neuen Tempo vorliegen
  let keyBusy = false;
  let gen = 0;
  const keyOff = () => library.semis !== keySemis(keyOf(store.project));
  const usedIds = () => [...new Set(store.project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)))];
  function startTempo() {
    const bpm = store.project.bpm;
    const my = ++gen;
    usedBusy = true;
    const job = library.setTempo(bpm, { first: usedIds() });
    tempoJob = (async () => {
      if (!(await job.first) || my !== gen) return;
      // Tonart je Takt: umgestimmte Fassungen im neuen Tempo
      await library.ensureKeyVariants(store.project).catch(() => {});
      if (my !== gen) return;
      usedBusy = false;
      engine.refresh();
      ui.flash(`Tempo ${bpm} BPM.`);
      await job;
    })().catch((err) => console.warn('Tempo:', err?.message || err)).finally(() => {
      if (my === gen) { tempoJob = null; usedBusy = false; }
    });
  }
  async function apply() {
    if (library.bpm !== store.project.bpm) startTempo();
    if (running) return running;
    running = (async () => {
      while (library.bpm !== store.project.bpm || keyOff() || tempoJob) {
        if (library.bpm !== store.project.bpm) startTempo();
        if (tempoJob) { await tempoJob; continue; }
        keyBusy = true;
        const wasPlaying = engine.playing;
        const pos = engine.heardBeat();
        if (wasPlaying) engine.stop();
        const key = keyOf(store.project);
        ui.flash(`Tonart ${key} – Loops werden umgestimmt …`);
        await library.setKey(keySemis(key));
        ui.flash(`Tonart ${key}.`);
        // Tonart je Takt: umgestimmte Fassungen passend zum neuen Stand, bevor es weitergeht
        await library.ensureKeyVariants(store.project).catch(() => {});
        arranger.render();
        if (wasPlaying) engine.play(pos);
        keyBusy = false;
      }
    })();
    try { await running; } finally { running = null; keyBusy = false; }
  }
  store.on(() => {
    if (library.bpm !== store.project.bpm) startTempo();
    if (keyOff()) apply();
  });
  return {
    apply,
    // busy: bis alles im neuen Tempo bzw. in der neuen Tonart vorliegt; usedBusy: bis die Sounds des Songs so weit sind
    get busy() { return !!running || !!tempoJob; },
    get usedBusy() { return usedBusy || keyBusy; },
  };
}

// Klang eines Sounds aus dem Projekt, in einer Kette: erst Klang-Rezepte (ADR 010: backen, live ohne Stopp neu einplanen),
// dann Sound-Tempo (Aufnahme neu einpassen, Wiedergabe an derselben Stelle fortsetzen)
function mountSoundState({ store, engine, library, ui, arranger }) {
  let last = '';
  let chain = Promise.resolve();
  const run = (initial = false) => {
    chain = chain.then(async () => {
      if (await library.applyRecipes(store.project)) {
        library.emit();
        arranger.render();
        engine.refresh();
        ui.emit?.();
      }
    }).catch((err) => console.warn('Klang-Rezept:', err?.message || err));
    if (initial === true) return; // Sound-Tempo wie bisher erst ab der ersten Änderung
    const map = store.project.sampleTempo || {};
    const key = JSON.stringify(map);
    if (key === last) return;
    last = key;
    chain = chain.then(async () => {
      const changed = await library.applySampleTempo(map);
      if (!changed) return;
      arranger.render();
      if (engine.playing) { const pos = engine.heardBeat(); engine.stop(); engine.play(pos); }
      ui.emit?.();
    }).catch((err) => console.warn('Sound-Tempo:', err?.message || err));
  };
  store.on(() => run());
  run(true);
}

// Tonart eigener Sounds (Inspektor): Projekt-Einstellungen an die Bibliothek; folgende Sounds werden umgestimmt
// (gleiche Länge, die Wiedergabe zieht über die Signatur nach)
function mountSoundKeys({ store, library }) {
  let last = null;
  let chain = Promise.resolve();
  const sync = () => {
    const map = soundKeysOf(store.project);
    const key = JSON.stringify(map);
    if (key === last) return;
    last = key;
    chain = chain.then(() => library.applySoundKeys(map)).catch((err) => console.warn('Sound-Tonart:', err?.message || err));
  };
  store.on(sync);
  sync();
}

// Aufnahme-Knopf: Spur der Auswahl, sonst die erste freie Spur ab der Abspielmarke
// mode 'sound' (Krachwerk): ohne Vorzähler; der gesäuberte Klang kommt als Clip ab dem Takt der Marke in den Loop
function mountRecording({ store, engine, ui, arranger, recorder, mode = 'song' }) {
  const btn = document.getElementById('rec-btn');
  const label = btn.querySelector('.rec-label');
  const freeTrack = (from, to) => store.project.tracks.find((t) => !t.clips.some((c) => c.startBeat < to && c.startBeat + c.lengthBeats > from));
  btn.addEventListener('click', () => start(null));
  let pending = null;
  // Krachwerk: Clip ab dem Takt der Marke, auf ganze Takte, Loop darum, losspielen – ein Rückgängig-Schritt
  function place(sample) {
    const bpb = store.project.beatsPerBar;
    const { startBeat } = pending;
    const len = Math.max(bpb, Math.ceil((sample.lengthBeats || 1) / bpb - 1e-6) * bpb);
    let clipId = null;
    store.batch('Aufnahme', () => {
      const free = store.project.tracks.find((t) => t.id === pending.trackId)
        ?? store.project.tracks.find((t) => !t.clips.some((c) => c.startBeat < startBeat + len && c.startBeat + c.lengthBeats > startBeat));
      const trackId = free?.id ?? store.addTrack();
      if (!trackId) return;
      clipId = store.addClip(trackId, sample.id, startBeat, len);
      store.setLoop({ on: true, startBeat, endBeat: startBeat + len });
    });
    if (!clipId) { ui.flash('Keine freie Spur für die Aufnahme.'); return null; }
    arranger.select(clipId);
    if (!engine.playing) engine.play(startBeat);
    return clipId;
  }
  async function start(target) {
    if (recorder.state === 'recording') { recorder.stop(); return; }
    if (recorder.state !== 'idle') return;
    const bpb = store.project.beatsPerBar;
    // Loop an: die Aufnahme beginnt am Loop-Anfang (Takes, recorder.js), egal wo die Marke steht
    const loop = store.project.loop;
    const inLoop = mode === 'song' && loop.on && loop.endBeat > loop.startBeat;
    const startBeat = inLoop ? loop.startBeat : target ? Math.floor(target.startBeat / bpb) * bpb : Math.floor(engine.heardBeat() / bpb) * bpb;
    if (engine.playing && mode === 'song') engine.stop();
    // Scharfe Spuren (Mehrspur, 2.13 C): alle bekommen die Aufnahme, jede mit ihrem Eingang; sonst die alte Regel
    const armed = mode === 'song' && !target ? ui.recTracks.map((id) => store.track(id)).filter(Boolean) : [];
    const sel = ui.selectedClipId && store.findClip(ui.selectedClipId);
    let trackId = armed[0]?.id ?? target?.trackId ?? sel?.track.id ?? freeTrack(startBeat, inLoop ? loop.endBeat : startBeat + (mode === 'sound' ? bpb : 16))?.id;
    if (!trackId && mode === 'song') trackId = store.addTrack();
    if (!trackId && mode === 'song') { ui.flash('Keine freie Spur für die Aufnahme.'); return; }
    const targets = armed.length ? armed.map((t) => ({ trackId: t.id, input: t.recInput ?? null })) : [{ trackId, input: store.track(trackId)?.recInput ?? null }];
    pending = { trackId, startBeat };
    try {
      await recorder.start({ targets, startBeat, mode });
      const many = targets.length > 1 ? ` auf ${targets.length} Spuren` : '';
      ui.flash(recorder.missingDevice ? `„${recorder.missingDevice}“ fehlt – Aufnahme mit dem Standard-Mikrofon.`
        : mode === 'sound' ? 'Aufnahme läuft – mach ein Geräusch.'
          : inLoop ? `Aufnahme im Loop${many} – ein Takt Vorzähler, jeder Durchgang wird ein Take. ●, R oder Leertaste beendet.`
            : `Aufnahme läuft${many} – ein Takt Vorzähler. Nochmal klicken oder Leertaste beendet.`);
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
    if (what === 'recorded' && payload.mode === 'sound') { if (place(payload.sample)) ui.flash(`„${payload.sample.name}“ – läuft im Loop.`); }
    else if (what === 'recorded') {
      arranger.select(payload.clipId);
      const n = payload.tracks || 1;
      ui.flash(n > 1 ? `${n} Spuren aufgenommen.${payload.takes > 1 ? ` Je ${payload.takes} Takes – der letzte spielt. Wechseln: Alt+↑/↓.` : ''}`
        : payload.takes > 1 ? `${payload.takes} Takes – der letzte spielt. Wechseln: Alt+↑/↓.` : `„${payload.sample.name}“ aufgenommen und auf die Spur gelegt.`);
      // Tipp „Einmessen“ (tips.js), solange auf diesem Gerät nicht gemessen wurde
      document.getElementById('app').classList.toggle('rec-unmeasured', !recorder.latencyInfo?.measured);
    }
    if (what === 'latency') document.getElementById('app').classList.remove('rec-unmeasured');
    if (what === 'locked') ui.flash('Während der Aufnahme nicht änderbar.');
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
  const need = new Set((isValidProject(saved) ? saved : startProject()).tracks.flatMap((t) => t.clips.flatMap(clipSampleIds)));
  const library = await buildLibrary({
    need,
    semis: keySemis(keyOf(isValidProject(saved) ? saved : null)),
    bpm: isValidProject(saved) ? saved.bpm : EDITION.bpm,
    catalogs: EDITION.catalogs,
    onProgress: (done, total) => splash.set(0.05 + 0.75 * (done / total), `Sounds werden geladen – ${done} von ${total}`),
  });
  library.materialColors = EDITION.materialColors; // Herkunftsfarbe in Kiste und Song (Krachwerk)
  splash.set(0.82, 'Eigene Sounds …');
  const own = new OwnSounds(library, { db: EDITION.db });
  await own.loadAll();
  splash.set(0.88, 'Projekt wird geöffnet …');
  const patterns = new Patterns(library);
  const store = new Store((await loadSaved(library, patterns)) ?? startProject(), {
    sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4,
    sampleName: (id) => library.get(id)?.name,
    soundDuration: (id) => library.get(id)?.orig?.duration ?? library.get(id)?.duration ?? null,
  });
  mountSoundKeys({ store, library });
  const engine = new Engine(store, library);
  const ui = createUi();

  // Spuren scharf schalten (2.13 C; Krachwerk ohne: surfaces.recArm). busy setzt die Aufnahme weiter unten
  const recArm = EDITION.surfaces.recArm === false ? null : {
    busy: () => false,
    toggle(id) {
      if (recArm.busy()) { ui.flash('Während der Aufnahme nicht änderbar.'); return false; }
      ui.toggleRecArm(id);
      return true;
    },
  };
  // Beim Öffnen (und „Neu“) ist nichts scharf; gelöschte Spuren fallen heraus
  store.on((p, reason) => {
    const keep = reason === 'replace' ? [] : ui.recTracks.filter((id) => store.track(id));
    if (keep.length !== ui.recTracks.length) { ui.recTracks = keep; ui.emit(); }
  });

  // Ruhige Dichte (Krachwerk) schaltet Tonart und Akkorde über das Song-Fach, nicht über den Schalter im Arranger
  const arranger = mountArranger({ root: document.getElementById('arr-scroll'), store, engine, library, ui, grainWave: EDITION.grainWave, harmonyToggle: EDITION.density !== 'calm', recArm });
  mountZoomBars({ root: document.getElementById('arr-scroll'), arranger, ui });
  const shelf = mountLibrary({
    root: document.getElementById('library'), library, store, engine, ui, arranger, groupBy: EDITION.shelfGroups,
    onBench: EDITION.workbench === 'sound' ? (id) => { ui.openSound(id); if (narrow.matches) ui.setDock('werkbank'); } : null,
    onDeleteOwn: async (id) => {
      if (store.project.recipes?.[id]?.parent) {
        // Variante: nur ohne Clips entfernen
        const n = store.clipsOf(id);
        if (!store.removeVariant(id)) ui.flash(`Wird noch in ${n} ${n === 1 ? 'Clip' : 'Clips'} benutzt.`);
        else ui.flash('Variante gelöscht (Strg+Z holt sie zurück).');
        return;
      }
      if (store.project.tracks.some((t) => t.clips.some((c) => clipSampleIds(c).includes(id)))) { // auch inaktive Takes
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
  mountTransport({ store, engine, ui, arranger, emptyProject: () => createEmptyProject(EDITION) });
  mountProjectIO({ store, engine, ui, library, own, patterns, keepUnknown: EDITION.keepUnknownClips, appName: EDITION.title });
  const tools = mountClipTools({ store, engine, ui, arranger });
  const mixer = mountMixer({ root: document.getElementById('mixer'), store, engine, ui });
  const editor = mountEditor({ root: document.getElementById('editor'), store, engine, library, ui, own });
  const patternEditor = mountPatternEditor({ root: document.getElementById('pattern'), store, engine, library, ui, kits: EDITION.synthKits ?? null });
  // Wird der Clip des offenen Editors gelöscht, schließt sich der Editor (Pattern: sobald kein Clip es mehr spielt)
  let patUsed = false;
  const patInSong = () => {
    if (ui.dock !== 'pattern' || !patternEditor.id) return false;
    const sid = patternSampleId(patternEditor.id);
    return store.project.tracks.some((t) => t.clips.some((c) => c.sampleId === sid));
  };
  // Beim Öffnen merken; das Löschen selbst ändert auch die Auswahl (ui) – der Merker darf dabei nicht zurückfallen
  ui.on(() => { if (ui.dock !== 'pattern') patUsed = false; else if (patInSong()) patUsed = true; });
  store.on(() => {
    if (ui.dock === 'editor' && editor.state?.clipId && !store.findClip(editor.state.clipId)) editor.close();
    const used = patInSong();
    if (patUsed && !used && ui.dock === 'pattern') ui.setDock(null);
    patUsed = used;
  });
  // Pattern-Clips öffnen den Pattern-Editor, alle anderen den Sample-Editor
  const openClip = (clipId) => {
    const c = store.findClip(clipId)?.clip;
    const pid = c && library.get(c.sampleId)?.patternId;
    if (pid) patternEditor.open(pid);
    else if (EDITION.surfaces.editor !== false) editor.open(clipId);
    else if (narrow.matches) ui.setDock('werkbank'); // Krachwerk: die Werkbank ersetzt den Sample-Editor
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
  ensureStretch(); // einmal beim Start: eigene Sounds im Projekt (auf Abruf) gleich bereitstellen
  ui.on(() => document.getElementById('app').classList.toggle('dock-open', !!ui.dock));
  const recorder = new Recorder({ engine, store, own });
  const recording = mountRecording({ store, engine, ui, arranger, recorder, mode: EDITION.record });
  if (recArm) recArm.busy = () => recorder.state !== 'idle';
  const pwa = EDITION.pwa ? mountPwa({ ui, recorder, own }) : null;
  const importer = mountImport({ store, ui, arranger, own, shelf });
  mountBrandMeter(engine, undefined, { mark: EDITION.brandMark });
  const glow = mountGlow({ engine, store, library, ui });
  doubleTapRanges();
  const linkImport = mountLinkImport({ ui, importer, engine, own, store, arranger, shelf });
  const tempo = mountTempo({ store, engine, library, ui, arranger });
  mountSoundState({ store, engine, library, ui, arranger });
  const mastering = mountMasteringAnalysis({ store, engine, library });
  mountExport({ root: document.getElementById('export'), store, library, ui, engine, tempo, mastering });
  const fxpad = mountFxPad({ root: document.getElementById('fxpad'), store, engine, ui });
  splash.set(0.94, 'Oberfläche wird aufgebaut …');
  if (library.bpm !== store.project.bpm || library.semis !== keySemis(keyOf(store.project))) { splash.set(0.95, 'Sounds werden angepasst …'); await tempo.apply(); }
  mountHints({ root: document.getElementById('hint'), ui, library, store, engine });
  mountMasteringControls(document.getElementById('song-mst-slot'), { store, engine, analysis: mastering, prefix: 'song-mst' });
  // Handy, Fach „Song“: Summe ein- oder ausblenden (zwei Tipps); danach macht das Fach der Summen-Zeile Platz
  const inspector = mountInspector({
    root: document.getElementById('insp'), store, ui, library, tools, engine, mastering, recArm, recorder,
    // Krachwerk: Sound-Werkbank statt Clip-Abschnitt, Spur nur bei eigener Wahl, nur aktive Effekte (Spec Scheibe 2a §6)
    ...(EDITION.workbench === 'sound' ? { clipPanel: (box, deps) => mountSoundBench(box, { ...deps, own }), trackOnClip: false, fxCompact: true } : {}),
  });
  const layout = mountLayout({
    store, ui, library,
    editName: (dock) => (dock === 'pattern' ? store.project.patterns?.[patternEditor.id]?.name : editor.state?.src?.name),
  });
  const recSetup = mountRecSetup({ ui, engine, recorder, store, recArm });
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
      accomp: (t) => accompany(t),
    },
  });
  // Begleitung ab dem Takt der Ablage (Klick: ab Takt 1), folgt dem Akkord-Streifen
  function accompany(t) {
    const fromBar = t ? Math.floor(t.startBeat / store.project.beatsPerBar) + 1 : 1;
    const plan = accompanimentPlan(store.project, { fromBar, chordsEmpty: !chordsOf(store.project).length });
    const res = applyPlan(store, library, plan);
    ui.flash(res.done.length ? 'Begleitung folgt jetzt dem Akkord-Streifen – Akkord antippen zum Ändern.' : 'Keine freie Spur für die Begleitung.');
  }
  const starter = mountStarter({ root: document.getElementById('create-panel'), store, library, ui, onAccomp: accompany });
  mountKeySelects(store);
  mountMobile({ store, ui, tools, library });
  // Dichte „calm“: Werkzeug am Clip statt Clip-Leiste und Deck-Gruppe
  if (EDITION.density === 'calm') mountClipFloat({ store, ui, tools, library });
  const sheets = mountSheets({ ui, arranger });
  // ⤢ breite Werkbank: der Song soll mindestens 4 ganze Takte zeigen, sonst wird die Ansicht passend verkleinert
  if (EDITION.density === 'calm') {
    const app0 = document.getElementById('app');
    const fit = () => {
      if (!app0.classList.contains('wb-wide') || !app0.classList.contains('insp-open') || narrow.matches) return;
      const sc = document.getElementById('arr-scroll');
      const want = (sc.clientWidth - headW() - 22) / (store.project.beatsPerBar * 4);
      if (want > 0 && ui.pxPerBeat > want) arranger.zoomTo(want);
    };
    let wasWide = false;
    new MutationObserver(() => {
      const w = app0.classList.contains('wb-wide') && app0.classList.contains('insp-open');
      if (w && !wasWide) setTimeout(fit, 60);
      wasWide = w;
    }).observe(app0, { attributes: true, attributeFilter: ['class'] });
  }
  // Ruhige Dichte: Tonart- und Akkordzeile am Handy erst bei Wechseln – oder auf Wunsch über das Song-Fach (gemerkt)
  if (EDITION.density === 'calm') {
    const btn = document.getElementById('harm-tpl').content.firstElementChild.cloneNode(true);
    document.getElementById('song-links').prepend(btn);
    place(btn, { calm: { narrow: document.getElementById('song-links'), wide: document.getElementById('insp-song-tools') } }); // Desktop: Song-Werkbank
    const app = document.getElementById('app');
    const set = (on) => {
      app.classList.toggle('harmony-on', on);
      btn.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem(lsKey('loopwerk.harmony'), on ? '1' : '0'); } catch { /* egal */ }
      arranger.render();
    };
    btn.addEventListener('click', () => set(!app.classList.contains('harmony-on')));
    let on = false;
    try { on = localStorage.getItem(lsKey('loopwerk.harmony')) === '1'; } catch { /* Standard */ }
    if (on) set(true);
  }
  const tips = EDITION.surfaces.tips === false ? null : mountTips({ ui, store });

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
    } else if (!mod && !e.altKey && !e.shiftKey && key === 'a' && ui.dock !== 'pattern') {
      // Kurve (Automation) der gewählten Spur auf- oder zuklappen
      e.preventDefault();
      arranger.autoLanes.toggleSelected();
    } else if (!mod && !e.altKey && key === 't') {
      e.preventDefault();
      tools.split();
    } else if (!mod && !e.altKey && e.shiftKey && key === 'r' && ui.dock !== 'pattern' && recArm) {
      // Gewählte Spur (oder die Spur des gewählten Clips) für die Aufnahme scharf schalten
      e.preventDefault();
      const id = ui.selectedTrackId ?? (ui.selectedClipId && store.findClip(ui.selectedClipId)?.track.id);
      if (!id || e.repeat || !recArm.toggle(id)) return;
      ui.flash(ui.isRecArmed(id) ? `„${store.track(id).name}“ ist scharf für die Aufnahme.` : `„${store.track(id).name}“ nicht mehr scharf.`);
    } else if (!mod && !e.altKey && !e.shiftKey && key === 'r' && ui.dock !== 'pattern') {
      // Aufnahme starten bzw. beenden (wie ●)
      e.preventDefault();
      if (!e.repeat) recording.start(null);
    } else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && ui.selectedClipId && !e.target.closest?.('.fxl')) {
      // Take-Clip: vorigen bzw. nächsten Take wählen
      if (stepTake(store, library, ui.selectedClipId, e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault();
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

  // Hat der Browser eigene Sounds gelöscht, bleiben die Clips als „Sound fehlt“ – einmal Bescheid sagen
  const missing = library.list().filter((s) => s.missing).length;
  if (missing) ui.flash(`${missing === 1 ? 'Ein eigener Sound fehlt' : `${missing} eigene Sounds fehlen`} im Browser – die Clips sind noch da. Öffne die Projektdatei, um ${missing === 1 ? 'ihn' : 'sie'} zurückzuholen.`);

  // Zugang für automatische Tests und spätere Werkzeuge.
  window.loopwerk = { edition: EDITION, pwa, store, engine, library, ui, arranger, tools, tempo, mixer, editor, own, recorder, importer, linkImport, patterns, patternEditor, inspector, layout, sheets, tips, recSetup, renderProject, encodeWav, glow, mastering, fxpad, starter, ready: true };
}

boot().catch((err) => {
  splash.fail(`${EDITION.title} konnte nicht starten: ${err.message}`);
  console.error(err);
});
