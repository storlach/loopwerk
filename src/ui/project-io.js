// Projekt als Datei speichern und öffnen.
// Im Artifact läuft das Speichern über die Capability `downloads`, lokal über einen normalen Download-Link.
// Öffnen nimmt JSON (Loopwerk-Projektdatei) und ZIP (Sicherung, Song-ZIP; ADR 012) in beiden Editionen.
// songFile 'zip' (Krachwerk): „Speichern“ schreibt den Song mit genau seinen Sounds als ZIP, am Handy übers Teilen-Menü.

import { isValidProject, normalizeClip } from '../model.js';
import { songSoundIds } from '../archive.js';
import { saveFile, safeName, shareOrSave } from './save-file.js';

const fileName = (name) => `${safeName(name)}.json`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Was beim Zurückholen herauskam, als ein Satz
export function importSummary(r, { opened = null } = {}) {
  const parts = [`${plural(r.added, 'Sound', 'Sounds')} neu`, `${r.skipped} schon da`];
  if (r.renamed) parts.push(`${r.renamed} abweichend als Kopie`);
  if (r.untrashed) parts.push(`${r.untrashed} aus dem Papierkorb`);
  const tail = opened ? ` – „${opened}“ geöffnet. ↶ holt deinen vorigen Song zurück.` : '.';
  return r.kind === 'song' && opened
    ? `„${opened}“ geöffnet: ${parts.join(', ')}. ↶ holt deinen vorigen Song zurück.`
    : `Zurückgeholt: ${parts.join(', ')}${tail}`;
}

// Fehler aus importArchive als Einblender
function importError(err, name) {
  switch (err?.code) {
    case 'nozip': return `„${name}“ ist keine ZIP-Datei.`;
    case 'nomanifest': return `„${name}“ ist keine Sicherung – werkstatt.json fehlt.`;
    case 'crc': return `„${name}“ ist beschädigt – nichts übernommen.`;
    case 'packed': return err.message;
    case 'big': return `„${name}“: Zu groß für eine Datei.`;
    default: return `„${name}“ ließ sich nicht zurückholen (${err?.message || 'unbekannt'}) – nichts übernommen.`;
  }
}

const isZip = async (file) => /\.zip$/i.test(file.name) || /zip/.test(file.type)
  || (await file.slice(0, 4).arrayBuffer().then((b) => new DataView(b).getUint32(0, true) === 0x04034b50).catch(() => false));

// keepUnknown: Clips ohne passenden Sound als stummen Platzhalter behalten statt weglassen (Krachwerk)
// padsKey: Belegung der Pads (localStorage) – beim Zurückholen nur übernommen, wenn hier keine stehen
export function mountProjectIO({ store, engine, ui, library, own, patterns, keepUnknown = false, appName = 'Loopwerk', songFile = 'json', padsKey = null }) {
  const saveBtn = document.getElementById('save-btn');
  const openBtn = document.getElementById('open-btn');
  const input = document.getElementById('open-input');
  const nameIn = document.getElementById('project-name');
  const progress = new Set(); // Zuhörer für den Fortschritt beim Zurückholen (Block „Werkstatt“)
  let busy = false;

  // Projektname: frei editierbar, Enter oder Verlassen übernimmt, Escape verwirft; leer = alter Name
  nameIn.placeholder = 'Projektname';
  const showName = () => {
    const name = store.project.name || 'unbenannt';
    if (document.activeElement !== nameIn) nameIn.value = name;
    document.title = `${name} · ${appName}`;
  };
  nameIn.addEventListener('change', () => { store.setProjectName(nameIn.value); showName(); });
  nameIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nameIn.value = store.project.name || ''; nameIn.blur(); }
  });
  nameIn.addEventListener('blur', showName);
  store.on(showName);
  showName();

  async function saveJson() {
    const ownSounds = own ? await own.embed(store.project) : [];
    const data = JSON.stringify({ ...store.project, app: 'Loopwerk', ownSounds }, null, 2);
    const saved = await saveFile(fileName(store.project.name), new Blob([data], { type: 'application/json' }));
    ui.flash(`„${store.project.name}“ gespeichert als ${saved.filename}.`);
  }

  // Song-ZIP: genau die Sounds des Songs (Clips, inaktive Takes, Eltern von Varianten), ohne Pads
  async function saveZip() {
    const project = store.project;
    const { blob } = await own.exportArchive({ project, ids: songSoundIds(project), app: appName, kind: 'song' });
    const res = await shareOrSave(`${safeName(project.name)}.zip`, blob, { title: project.name });
    if (res.cancelled) return;
    ui.flash(res.shared ? `„${project.name}“ weitergegeben.` : `„${project.name}“ gespeichert als ${res.filename}.`);
  }

  saveBtn.addEventListener('click', async () => {
    try {
      if (songFile === 'zip' && own) await saveZip(); else await saveJson();
    } catch (err) {
      if (err?.code === 'declined') return;
      if (err?.message === 'Zu groß für eine Datei.') { ui.flash('Zu groß für eine Datei.'); return; }
      ui.flash(`Speichern ist hier nicht möglich. Öffne ${appName} in claude.ai oder im Browser.`);
    }
  });

  // Gemeinsamer Weg für JSON und ZIP: fehlende Takes, Varianten, Platzhalter; öffnen als ein Rückgängig-Schritt
  async function openProject(project, fallbackName) {
    if (patterns) await patterns.sync(project);
    library.syncVariants?.(project); // Varianten (Klang-Rezept) zählen als vorhandene Sounds
    let missing = 0, kept = 0;
    // Takes ohne Sound fallen aus der Liste, der Clip bleibt (spielt dann einen vorhandenen Take)
    for (const t of project.tracks) for (const c of t.clips) {
      if (!Array.isArray(c.takes)) continue;
      const have = c.takes.filter((id) => library.get(id));
      if (!library.get(c.sampleId) && have.length) { c.sampleId = have[have.length - 1]; c.take = have.length - 1; }
      c.takes = have;
      normalizeClip(c);
    }
    for (const t of project.tracks) {
      const before = t.clips.length;
      if (keepUnknown) { for (const c of t.clips) if (!library.get(c.sampleId)) { library.placeholder(c); kept++; } continue; }
      t.clips = t.clips.filter((c) => library.get(c.sampleId));
      missing += before - t.clips.length;
    }
    engine.stop();
    engine.setPosition(0);
    ui.select(null);
    if (!project.name) project.name = fallbackName;
    store.openSong(project);
    return { missing, kept };
  }

  async function openJson(file) {
    let project;
    try {
      project = JSON.parse(await file.text());
    } catch {
      ui.flash(`„${file.name}“ ist keine Projektdatei (kein gültiges JSON).`);
      return;
    }
    if (!isValidProject(project)) {
      ui.flash(`„${file.name}“ ist kein Loopwerk-Projekt dieser Version.`);
      return;
    }
    delete project.app;
    if (own && project.ownSounds?.length) {
      try { await own.restore(project.ownSounds); } catch { ui.flash('Einige eigene Sounds aus der Datei konnten nicht gelesen werden.'); }
    }
    delete project.ownSounds;
    const { missing, kept } = await openProject(project, file.name.replace(/\.json$/i, ''));
    const back = ' ↶ holt deinen vorigen Song zurück.';
    ui.flash(missing
      ? `„${project.name}“ geöffnet. ${missing} Clip(s) ohne passenden Sound wurden weggelassen.`
      : kept ? `„${project.name}“ geöffnet. ${kept} Clip(s) ohne Sound bleiben stumm erhalten.` : `„${project.name}“ geöffnet.${back}`);
  }

  // Sicherung oder Song-ZIP: Sounds anlegen (Konflikte ohne Rückfrage), den aktuellen Song öffnen
  async function openZip(file) {
    if (!own) { ui.flash(`„${file.name}“ lässt sich hier nicht öffnen.`); return; }
    const tell = (p) => progress.forEach((fn) => fn(p));
    let res;
    try {
      tell(0);
      res = await own.importArchive(file, { onProgress: (d, n) => tell(n ? d / n : 1) });
    } catch (err) {
      ui.flash(importError(err, file.name));
      return;
    } finally {
      tell(null);
    }
    if (padsKey && res.pads != null) {
      try { if (!localStorage.getItem(padsKey)) localStorage.setItem(padsKey, typeof res.pads === 'string' ? res.pads : JSON.stringify(res.pads)); } catch { /* Speicher nicht verfügbar */ }
    }
    const song = res.songs.find((s) => s.current) ?? res.songs[0];
    let opened = null;
    if (song) { await openProject(song.project, song.name || file.name.replace(/\.zip$/i, '')); opened = song.project.name; }
    ui.flash(importSummary(res, { opened }));
  }

  async function openFile(file) {
    if (!file || busy) return;
    busy = true;
    try {
      if (await isZip(file)) await openZip(file); else await openJson(file);
    } finally {
      busy = false;
    }
  }

  openBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    openFile(file);
  });

  return {
    openFile,
    pick: () => { if (!busy) input.click(); },
    get busy() { return busy; },
    onProgress(fn) { progress.add(fn); return () => progress.delete(fn); },
  };
}
