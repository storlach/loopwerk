// Export-Dock: Format, Bereich, Ausklang wählen; Fortschritt anzeigen; Datei speichern.

import { exportSong, exportRange } from '../export.js';
import { saveFile, safeName } from './save-file.js';
import { formatDb } from './arranger.js';

export function mountExport({ root, store, library, ui, engine, tempo }) {
  const $ = (id) => root.querySelector('#' + id);
  const btn = document.getElementById('export-btn');
  const go = $('ex-go');
  const bar = $('ex-progress');
  const status = $('ex-status');
  const loopLabel = $('ex-range-loop-label');
  let busy = false;

  const value = (name) => root.querySelector(`input[name="${name}"]:checked`)?.value;

  function describe() {
    const p = store.project;
    const bpb = p.beatsPerBar;
    const [a, b] = exportRange(p, 'song');
    $('ex-range-song-label').textContent = b > a ? `Ganzer Song (Takt 1–${b / bpb}, ${((b - a) * 60 / p.bpm).toFixed(1).replace('.', ',')} s)` : 'Ganzer Song (noch leer)';
    const hasLoop = p.loop.endBeat > p.loop.startBeat;
    const first = p.loop.startBeat / bpb + 1;
    const last = p.loop.endBeat / bpb;
    loopLabel.textContent = hasLoop ? `Loop-Bereich (Takt ${first === last ? first : `${first}–${last}`})` : 'Loop-Bereich (keiner gesetzt)';
    $('ex-range-loop').disabled = !hasLoop;
    if (!hasLoop && value('ex-range') === 'loop') $('ex-range-song').checked = true;
  }

  go.addEventListener('click', async () => {
    if (busy) return;
    if (tempo.busy) { ui.flash('Einen Moment – die Sounds werden noch an das Tempo angepasst.'); return; }
    busy = true;
    go.disabled = true;
    bar.value = 0;
    bar.hidden = false;
    const format = value('ex-format');
    status.textContent = 'Song wird gerendert …';
    try {
      engine.stop();
      const res = await exportSong(store.project, library, {
        format,
        range: value('ex-range'),
        tail: $('ex-tail').checked,
        onProgress: (p) => {
          bar.value = p;
          status.textContent = p < (format === 'mp3' ? 0.5 : 0.95) ? `Song wird gerendert … ${Math.round(p * 100)} %` : format === 'mp3' ? `MP3 wird erzeugt … ${Math.round(p * 100)} %` : 'Datei wird geschrieben …';
        },
      });
      const filename = `${safeName(store.project.name)}.${format}`;
      const saved = await saveFile(filename, res.blob);
      const mb = (res.blob.size / 1048576).toFixed(1).replace('.', ',');
      status.textContent = `Fertig: ${saved.filename} (${mb} MB, ${res.duration.toFixed(1).replace('.', ',')} s, Spitze ${formatDb(res.peak)})${saved.zipped ? ' – als ZIP, weil claude.ai Audiodateien nur verpackt speichern kann.' : '.'}`;
      ui.flash(`Exportiert: ${saved.filename}`);
    } catch (err) {
      if (err?.code === 'declined') status.textContent = 'Speichern abgebrochen.';
      else status.textContent = err?.message || 'Export fehlgeschlagen.';
    } finally {
      busy = false;
      go.disabled = false;
    }
  });

  btn.addEventListener('click', () => ui.setDock(ui.dock === 'export' ? null : 'export'));
  $('export-close').addEventListener('click', () => ui.setDock(null));
  ui.on(() => {
    const show = ui.dock === 'export';
    btn.setAttribute('aria-pressed', String(show));
    if (root.hidden === !show) return;
    root.hidden = !show;
    if (show) { describe(); if (!busy) { bar.hidden = true; status.textContent = ''; } }
  });
  store.on(() => { if (!root.hidden) describe(); });
}
