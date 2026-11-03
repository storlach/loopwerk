// Mastering mit einem Klick: Analyse des Songs (offline gerendert über buildMix, dann dieselbe Kette wie im Worklet
// in JS durchgerechnet) liefert die Verstärkungen für die Ziellautheit. Der Export rechnet sie für seinen Bereich,
// die Wiedergabe hält sie im Voraus bereit (Analyse im Hintergrund nach jeder Änderung) – beide klingen gleich.

import { renderProject, masteringOf } from './engine.js';
import { styleOf, MASTER_STYLES } from './dsp/master-core.js';
import { integratedLoudness } from './dsp/loudness.js';
import { runJob } from './dsp/run.js';

export { MASTER_STYLES, styleOf };

// Ende des letzten Clips, auf ganze Takte aufgerundet
export function songEnd(project) {
  const end = Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats)));
  return Math.ceil(end / project.beatsPerBar - 1e-9) * project.beatsPerBar;
}

// → { pre, drive, inLufs, outLufs, peak, aLufs } (Lautheiten in LUFS, Spitze in dBTP)
export async function analyzeMastering(project, library, { fromBeat = 0, toBeat = songEnd(project), tailSeconds = 0, sampleRate = 44100, onProgress } = {}) {
  const st = styleOf(masteringOf(project).style);
  if (toBeat <= fromBeat) return null;
  const r = await renderProject(project, library, { fromBeat, toBeat, tailSeconds, sampleRate, analysis: true, onProgress: (p) => onProgress?.(p * 0.6) });
  const aLufs = integratedLoudness(r.a, sampleRate);
  const res = await runJob('master', { chs: r.x, sampleRate, style: st.id, target: st.target });
  onProgress?.(1);
  return { ...res, aLufs };
}

// Pegel für den A/B-Vergleich: beide auf die leisere der beiden Lautheiten (nie lauter machen)
export function abLevels(an) {
  if (!an || !Number.isFinite(an.aLufs) || !Number.isFinite(an.outLufs)) return { aDb: 0, bDb: 0 };
  const ref = Math.min(an.aLufs, an.outLufs);
  return { aDb: ref - an.aLufs, bDb: ref - an.outLufs };
}

// Was die Lautheit beeinflusst: alles außer Name, Loop, Auswahl
const keyOf = (project, library) => {
  const { name, loop, ...rest } = project;
  void name; void loop;
  const revs = project.tracks.flatMap((t) => t.clips.map((c) => `${c.sampleId}:${library.get(c.sampleId)?.rev ?? 0}`));
  return JSON.stringify(rest) + revs.join(',');
};

// Hintergrund-Analyse für die Wiedergabe. state: { busy, analysis, error }
export function mountMasteringAnalysis({ store, engine, library, delay = 1200 }) {
  const state = { busy: false, analysis: null, key: null, listeners: new Set() };
  let timer = null;
  let running = false;
  const emit = () => state.listeners.forEach((fn) => fn(state));
  async function run() {
    timer = null;
    const project = store.project;
    if (!masteringOf(project).on) return;
    const key = keyOf(project, library);
    if (key === state.key) return;
    if (running) { schedule(); return; }
    running = true;
    state.busy = true;
    emit();
    try {
      const snap = JSON.parse(JSON.stringify(project));
      await library.ensureProject?.(snap);
      const an = await analyzeMastering(snap, library);
      state.key = key;
      state.analysis = an;
      if (an) {
        engine.setMasterGains({ pre: an.pre, drive: an.drive });
        if (engine.monitor?.ab) engine.setMonitor(abLevels(an));
      }
    } catch (err) {
      state.error = err?.message || String(err);
    } finally {
      running = false;
      state.busy = false;
      emit();
      if (masteringOf(store.project).on && keyOf(store.project, library) !== state.key) schedule();
    }
  }
  function schedule(ms = delay) {
    clearTimeout(timer);
    // Nur das Anstoßen läuft über einen Zeitgeber – Klangereignisse plant die Engine auf der Kontextuhr
    timer = setTimeout(run, ms);
  }
  const onChange = () => {
    const on = masteringOf(store.project).on;
    if (!on) { clearTimeout(timer); if (engine.monitor?.ab) engine.setMonitor({ ab: null }); return; }
    if (keyOf(store.project, library) !== state.key) schedule();
  };
  store.on(onChange);
  library.on?.(onChange);
  onChange();
  return {
    state,
    on(fn) { state.listeners.add(fn); },
    now() { clearTimeout(timer); return run(); },
    // A/B-Vergleich: null → A → B → A …; ende() setzt zurück auf normal
    toggleAB() {
      const cur = engine.monitor?.ab ?? null;
      engine.setMonitor({ ab: cur === 'A' ? 'B' : 'A', ...abLevels(state.analysis) });
      emit();
    },
    endAB() { engine.setMonitor({ ab: null }); emit(); },
    // Vergleich direkt wählen: 'A' (vorher), 'B' (nachher, gleich laut) oder null (normal)
    setAB(which) { if (!which) { this.endAB(); return; } engine.setMonitor({ ab: which, ...abLevels(state.analysis) }); emit(); },
  };
}
