// Exportieren aus der Song-Werkbank (Krachwerk, Spec krachwerk-5-song §2): ein Tipp, kein Dialog. WAV (oder MP3 / Einzelspuren,
// je nach Feinheiten im Reiter „Fertig“), ganzer Song oder Loop-Bereich, Mastering wie eingestellt. Am Handy öffnet danach das
// Teilen-Menü mit der Datei und der Zutatenliste als Text, am Desktop ist es ein Download. Fortschritt meldet ein Ereignis.

import { exportSong, exportStems, infoOf } from '../export.js';
import { saveFile, safeName } from './save-file.js';
import { formatDb } from './arranger.js';
import { fileExt } from '../wav.js';
import { masteringOf } from '../engine.js';
import { narrow } from './place.js';
import { lsKey } from '../edition.js';
import { Emitter } from '../util.js';

const FINE_KEY = lsKey('loopwerk.exportFine');
const DEFAULTS = { mp3: false, stems: false, tail: true, list: true };
const comma = (v, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');

export function mountSongExport({ store, library, engine, ui, tempo, appName = 'Krachwerk' }) {
  const em = new Emitter();
  let prefs = { ...DEFAULTS };
  try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(FINE_KEY)) }; } catch { /* Standard */ }
  const self = {
    on: (fn) => em.on(fn),
    state: { busy: false, p: 0, text: '', last: null },
    loopOnly: false, // gilt nur für diese Sitzung
    get prefs() { return prefs; },
    setPref(k, v) { prefs = { ...prefs, [k]: v }; try { localStorage.setItem(FINE_KEY, JSON.stringify(prefs)); } catch { /* egal */ } em.emit(); },
    setLoopOnly(v) { self.loopOnly = !!v; em.emit(); },
    canShare: () => typeof navigator.share === 'function',
    run,
  };
  const set = (patch) => { Object.assign(self.state, patch); em.emit(); };

  // Teilen-Menü (Handy) oder Download; Abbrechen im Menü ist kein Fehler
  async function deliver(file, { share, text }) {
    if (share && self.canShare() && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: file.name.replace(/\.[^.]+$/, ''), ...(text ? { text } : {}) });
        return { filename: file.name, shared: true };
      } catch (err) {
        if (err?.name === 'AbortError') return { filename: file.name, shared: true, aborted: true };
      }
    }
    return { ...(await saveFile(file.name, file)), shared: false };
  }

  // share: true = Teilen-Menü erzwingen (Knopf „Teilen“); sonst teilt nur das Handy
  async function run({ share = narrow.matches } = {}) {
    if (self.state.busy) return null;
    if (tempo?.usedBusy ?? tempo?.busy) { ui.flash('Einen Moment – die Sounds werden noch an das Tempo angepasst.'); return null; }
    const project = store.project;
    const format = prefs.mp3 ? 'mp3' : 'wav';
    const range = self.loopOnly && project.loop.endBeat > project.loop.startBeat ? 'loop' : 'song';
    const mastering = !!masteringOf(project).on;
    set({ busy: true, p: 0, text: 'Song wird gerendert …' });
    try {
      engine.stop();
      const info = infoOf(project, library, { app: appName });
      const text = prefs.list ? info.list.text : '';
      let file; let res;
      if (prefs.stems) {
        res = await exportStems(project, library, {
          format: format === 'wav' ? 'wav32' : format, range, tail: prefs.tail, withMaster: false, mastering,
          onProgress: (p, i) => set({ p, text: i.phase === 'done' ? 'ZIP wird geschrieben …' : `Spur ${i.index + 1} von ${i.count} … ${Math.round(p * 100)} %` }),
        });
        file = new File([res.blob], `${safeName(project.name)} Stems.zip`, { type: 'application/zip' });
      } else {
        res = await exportSong(project, library, {
          format, range, tail: prefs.tail, mastering, info: prefs.list && format === 'wav' ? info : null,
          onProgress: (p) => set({ p, text: p < (format === 'mp3' ? 0.5 : 0.95) ? `Song wird gerendert … ${Math.round(p * 100)} %` : format === 'mp3' ? `MP3 wird erzeugt … ${Math.round(p * 100)} %` : 'Datei wird geschrieben …' }),
        });
        file = new File([res.blob], `${safeName(project.name)}.${fileExt(format)}`, { type: res.blob.type });
      }
      const out = await deliver(file, { share, text });
      const mb = comma(res.blob.size / 1048576);
      const loud = res.analysis ? `, ${comma(res.analysis.outLufs)} LUFS` : '';
      const last = { filename: out.filename, size: res.blob.size, duration: res.duration, peak: res.peak, summary: info.list.summary, shared: out.shared, aborted: !!out.aborted, text: info.comment };
      set({ busy: false, p: 1, last, text: out.aborted ? 'Teilen abgebrochen.' : `Fertig: ${out.filename} (${mb} MB, ${comma(res.duration)} s, Spitze ${formatDb(res.peak)}${loud}) · ${info.list.summary}` });
      if (!out.aborted) ui.flash(out.shared ? `Geteilt: ${out.filename}` : `Exportiert: ${out.filename}`);
      return last;
    } catch (err) {
      set({ busy: false, p: 0, text: err?.code === 'declined' ? 'Speichern abgebrochen.' : err?.message || 'Export fehlgeschlagen.' });
      return null;
    }
  }
  return self;
}
