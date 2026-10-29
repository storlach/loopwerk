// Projekt als Datei speichern und öffnen.
// Im Artifact läuft das Speichern über die Capability `downloads`, lokal über einen normalen Download-Link.

import { isValidProject } from '../model.js';
import { saveFile, safeName } from './save-file.js';

const fileName = (name) => `${safeName(name)}.json`;

export function mountProjectIO({ store, engine, ui, library, own }) {
  const saveBtn = document.getElementById('save-btn');
  const openBtn = document.getElementById('open-btn');
  const input = document.getElementById('open-input');

  saveBtn.addEventListener('click', async () => {
    const ownSounds = own ? await own.embed(store.project) : [];
    const data = JSON.stringify({ ...store.project, app: 'Loopwerk', ownSounds }, null, 2);
    try {
      await saveFile(fileName(store.project.name), new Blob([data], { type: 'application/json' }));
      ui.flash('Projekt gespeichert.');
    } catch (err) {
      if (err?.code === 'declined') return;
      ui.flash('Speichern ist hier nicht möglich. Öffne Loopwerk in claude.ai oder im Browser.');
    }
  });

  openBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
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
    let missing = 0;
    for (const t of project.tracks) {
      const before = t.clips.length;
      t.clips = t.clips.filter((c) => library.get(c.sampleId));
      missing += before - t.clips.length;
    }
    engine.stop();
    engine.setPosition(0);
    ui.select(null);
    if (!project.name) project.name = file.name.replace(/\.json$/i, '');
    store.replace(project);
    ui.flash(missing
      ? `„${project.name}“ geöffnet. ${missing} Clip(s) ohne passenden Sound wurden weggelassen.`
      : `„${project.name}“ geöffnet.`);
  });
}
