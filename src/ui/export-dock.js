// Export-Dock: Format, Bereich, Ausklang wählen; Fortschritt anzeigen; Datei speichern. Wahlweise Einzelspuren (Stems) als ZIP.

import { exportSong, exportRange, exportStems, stemTracks } from '../export.js';
import { saveFile, safeName } from './save-file.js';
import { formatDb } from './arranger.js';
import { fileExt } from '../wav.js';
import { masteringOf } from '../engine.js';
import { mountMasteringControls } from './mastering.js';

export function mountExport({ root, store, library, ui, engine, tempo, mastering }) {
  const $ = (id) => root.querySelector('#' + id);
  const btn = document.getElementById('export-btn');
  const go = $('ex-go');
  const bar = $('ex-progress');
  const status = $('ex-status');
  const loopLabel = $('ex-range-loop-label');
  const stems = $('ex-stems');
  const stemsMaster = $('ex-stems-master');
  let busy = false;
  let abort = null;

  const value = (name) => root.querySelector(`input[name="${name}"]:checked`)?.value;

  // Mastering: Bedienung wie im Inspektor; der Haken folgt dem Schalter, lässt sich für einen Export aber abwählen
  const withMaster = $('ex-mastering');
  if (mastering) mountMasteringControls($('ex-master-ctl'), { store, engine, analysis: mastering, prefix: 'ex-mst' });
  let lastOn = null;
  // Stems ohne Summe kennen kein Mastering – dann ist der Haken abgeschaltet
  const syncMaster = () => {
    const on = !!masteringOf(store.project).on;
    if (on !== lastOn) { withMaster.checked = on; lastOn = on; }
    withMaster.disabled = !on || (stems.checked && !stemsMaster.checked);
    stemsMaster.disabled = !stems.checked;
    go.textContent = busy && abort ? 'Abbrechen' : stems.checked ? 'Spuren exportieren' : 'Exportieren';
  };
  store.on(syncMaster);
  // Stems ohne Summe können über 0 dBFS gehen: dann WAV mit 32 Bit Gleitkomma voreinstellen (übersteuert nicht)
  const preferFloat = () => { if (stems.checked && !stemsMaster.checked && value('ex-format') === 'wav') $('ex-format-wav32').checked = true; };
  stems.addEventListener('change', () => { preferFloat(); syncMaster(); describe(); });
  stemsMaster.addEventListener('change', () => { preferFloat(); syncMaster(); });
  syncMaster();

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
    const [s0, s1] = exportRange(p, value('ex-range'));
    const n = s1 > s0 ? stemTracks(p, s0, s1).length : 0;
    $('ex-stems-label').textContent = `Einzelspuren (Stems) – ${n === 1 ? '1 Spur' : `${n} Spuren`} als ZIP`;
  }
  root.querySelectorAll('input[name="ex-range"]').forEach((r) => r.addEventListener('change', describe));

  const num = (v, d = 1) => v.toFixed(d).replace('.', ',');

  async function runStems(format) {
    abort = new AbortController();
    go.disabled = false;
    syncMaster();
    const res = await exportStems(store.project, library, {
      format,
      range: value('ex-range'),
      tail: $('ex-tail').checked,
      withMaster: stemsMaster.checked,
      mastering: withMaster.checked && !withMaster.disabled,
      signal: abort.signal,
      onProgress: (p, info) => {
        bar.value = p;
        status.textContent = info.phase === 'analyze' ? `Mastering wird vorbereitet … ${Math.round(p * 100)} %`
          : info.phase === 'done' ? 'ZIP wird geschrieben …'
          : `Spur ${info.index + 1} von ${info.count} (${info.name}) … ${Math.round(p * 100)} %`;
      },
    });
    const saved = await saveFile(`${safeName(store.project.name)} Stems.zip`, res.blob);
    const mb = num(res.blob.size / 1048576);
    const n = res.stems.length;
    const over = res.peak > 1 && format !== 'wav32';
    status.textContent = `Fertig: ${saved.filename} (${n === 1 ? '1 Spur' : `${n} Spuren`}, ${mb} MB, je ${num(res.duration)} s, Spitze ${formatDb(res.peak)})${over ? ' – übersteuert: WAV 32 Bit wählen oder Fader der lautesten Spur senken' : ''}.`;
    ui.flash(`Exportiert: ${saved.filename}`);
  }

  go.addEventListener('click', async () => {
    if (busy) { abort?.abort(); status.textContent = 'Wird abgebrochen …'; return; }
    if (tempo.usedBusy ?? tempo.busy) { ui.flash('Einen Moment – die Sounds werden noch an das Tempo angepasst.'); return; }
    busy = true;
    go.disabled = true;
    bar.value = 0;
    bar.hidden = false;
    const format = value('ex-format');
    status.textContent = 'Song wird gerendert …';
    try {
      engine.stop();
      if (stems.checked) { await runStems(format); return; }
      const res = await exportSong(store.project, library, {
        format,
        range: value('ex-range'),
        tail: $('ex-tail').checked,
        mastering: withMaster.checked && !withMaster.disabled,
        onProgress: (p) => {
          bar.value = p;
          status.textContent = p < (format === 'mp3' ? 0.5 : 0.95) ? `Song wird gerendert … ${Math.round(p * 100)} %` : format === 'mp3' ? `MP3 wird erzeugt … ${Math.round(p * 100)} %` : 'Datei wird geschrieben …';
        },
      });
      const filename = `${safeName(store.project.name)}.${fileExt(format)}`;
      const saved = await saveFile(filename, res.blob);
      const mb = (res.blob.size / 1048576).toFixed(1).replace('.', ',');
      const loud = res.analysis ? `, ${res.analysis.outLufs.toFixed(1).replace('.', ',').replace('-', '−')} LUFS` : '';
      status.textContent = `Fertig: ${saved.filename} (${mb} MB, ${res.duration.toFixed(1).replace('.', ',')} s, Spitze ${formatDb(res.peak)}${loud})${saved.zipped ? ' – als ZIP, weil claude.ai Audiodateien nur verpackt speichern kann.' : '.'}`;
      ui.flash(`Exportiert: ${saved.filename}`);
    } catch (err) {
      if (err?.code === 'declined') status.textContent = 'Speichern abgebrochen.';
      else if (err?.code === 'aborted') { status.textContent = 'Export abgebrochen.'; bar.hidden = true; }
      else status.textContent = err?.message || 'Export fehlgeschlagen.';
    } finally {
      busy = false;
      abort = null;
      go.disabled = false;
      syncMaster();
    }
  });

  btn.addEventListener('click', () => ui.setDock(ui.dock === 'export' ? null : 'export'));
  ui.on(() => {
    const show = ui.dock === 'export';
    btn.setAttribute('aria-pressed', String(show));
    if (root.hidden === !show) return;
    root.hidden = !show;
    if (show) { describe(); if (!busy) { bar.hidden = true; status.textContent = ''; } }
  });
  store.on(() => { if (!root.hidden) describe(); });
}
