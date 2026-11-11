// Mastering mit einem Klick: Analyse des Songs (offline gerendert über buildMix, dann dieselbe Kette wie im Worklet
// in JS durchgerechnet) liefert die Verstärkungen für die Ziellautheit. Der Export rechnet sie für seinen Bereich,
// die Wiedergabe hält sie im Voraus bereit (Analyse im Hintergrund nach jeder Änderung) – beide klingen gleich.

import { renderProject, masteringOf } from './engine.js';
import { styleOf, MASTER_STYLES } from './dsp/master-core.js';
import { runJob } from './dsp/run.js';

export { MASTER_STYLES, styleOf };

// Ende des letzten Clips, auf ganze Takte aufgerundet
export function songEnd(project) {
  const end = Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats)));
  return Math.ceil(end / project.beatsPerBar - 1e-9) * project.beatsPerBar;
}

// → { pre, drive, inLufs, outLufs, peak, aLufs } (Lautheiten in LUFS, Spitze in dBTP). Beide Messungen rechnet der
// Rechen-Worker (job 'mastering'); slices/signal: Rendern in Scheiben, Abbruch (Hintergrund-Messung).
export async function analyzeMastering(project, library, { fromBeat = 0, toBeat = songEnd(project), tailSeconds = 0, sampleRate = 44100, onProgress, slices = false, signal = null } = {}) {
  const st = styleOf(masteringOf(project).style);
  if (toBeat <= fromBeat) return null;
  const r = await renderProject(project, library, { fromBeat, toBeat, tailSeconds, sampleRate, analysis: true, onProgress: (p) => onProgress?.(p * 0.6), slices, signal });
  if (signal?.aborted) throw new DOMException('Messung abgebrochen', 'AbortError');
  const res = await runJob('mastering', { chs: [...r.x, ...r.a], sampleRate, style: st.id, target: st.target });
  onProgress?.(1);
  return res;
}


// Pegel für den A/B-Vergleich: beide auf die leisere der beiden Lautheiten (nie lauter machen)
export function abLevels(an) {
  if (!an || !Number.isFinite(an.aLufs) || !Number.isFinite(an.outLufs)) return { aDb: 0, bDb: 0 };
  const ref = Math.min(an.aLufs, an.outLufs);
  return { aDb: ref - an.aLufs, bDb: ref - an.outLufs };
}

// Was die Lautheit beeinflusst: alles außer Namen, Loop, Songlänge (gemessen wird bis zum letzten Clip) und Zuklappen
const COSMETIC = { song: ['name', 'loop', 'lengthBars'], track: ['name', 'autoName', 'collapsed'], group: ['name', 'collapsed'] };
const drop = (o, keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };
export const masteringKey = (project, library) => {
  const rest = drop(project, COSMETIC.song);
  rest.tracks = project.tracks.map((t) => drop(t, COSMETIC.track));
  if (project.groups) rest.groups = project.groups.map((g) => drop(g, COSMETIC.group));
  const revs = project.tracks.flatMap((t) => t.clips.map((c) => `${c.sampleId}:${library.get(c.sampleId)?.rev ?? 0}`));
  return JSON.stringify(rest) + revs.join(',');
};
const keyOf = masteringKey;
const MEMO = 8; // zuletzt gemessene Stände (Rückgängig/Wiederholen ohne neue Messung)

// Hintergrund-Analyse für die Wiedergabe. state: { busy, analysis, error, runs }. Entprellt (delay nach der letzten
// Änderung), rendert in Scheiben, rechnet im Worker und bricht bei einer neuen Änderung ab; bis zum neuen Ergebnis bleiben
// die alten Verstärkungen in Kraft. Nach dem App-Start wartet sie zusätzlich startDelay, damit Start und erster Ton frei sind.
// hold(): solange wahr, wartet die Messung (z. B. während ein Tempowechsel die Sounds neu vorbereitet – vorher wäre sie
// verfrüht und blockierte den Hauptthread mitten im Wechsel).
export function mountMasteringAnalysis({ store, engine, library, delay = 1200, startDelay = 2500, hold = null }) {
  const state = { busy: false, analysis: null, key: null, runs: 0, listeners: new Set() };
  const memo = new Map();
  let timer = null;
  let running = null; // { key, ctl, done }
  const ready = performance.now() + startDelay;
  const emit = () => state.listeners.forEach((fn) => fn(state));
  const apply = (key, an) => {
    state.key = key;
    state.analysis = an;
    if (an) {
      engine.setMasterGains({ pre: an.pre, drive: an.drive });
      if (engine.monitor?.ab) engine.setMonitor(abLevels(an));
    }
  };
  // wait: ausdrücklich verlangte Messung (now) wartet das Halten ab, statt sich neu einzureihen
  async function run(wait = false) {
    timer = null;
    if (!masteringOf(store.project).on) return;
    if (hold?.()) {
      if (!wait) { schedule(400); return; }
      while (hold()) await new Promise((r) => { setTimeout(r, 100); });
    }
    const project = store.project;
    const key = keyOf(project, library);
    if (key === state.key) return;
    if (memo.has(key)) { apply(key, memo.get(key)); emit(); return; }
    if (running) { await running.done; return run(wait); }
    const ctl = new AbortController();
    let finish;
    running = { key, ctl, done: new Promise((r) => { finish = r; }) };
    state.busy = true;
    state.runs++;
    emit();
    try {
      const snap = JSON.parse(JSON.stringify(project));
      await library.ensureProject?.(snap);
      const an = await analyzeMastering(snap, library, { slices: true, signal: ctl.signal });
      memo.set(key, an);
      if (memo.size > MEMO) memo.delete(memo.keys().next().value);
      apply(key, an);
    } catch (err) {
      if (err?.name !== 'AbortError') state.error = err?.message || String(err);
    } finally {
      running = null;
      state.busy = false;
      finish();
      emit();
      if (masteringOf(store.project).on && keyOf(store.project, library) !== state.key) schedule();
    }
  }
  function schedule(ms = delay) {
    clearTimeout(timer);
    // Nur das Anstoßen läuft über einen Zeitgeber – Klangereignisse plant die Engine auf der Kontextuhr
    timer = setTimeout(run, Math.max(ms, ready - performance.now()));
  }
  const onChange = () => {
    const on = masteringOf(store.project).on;
    if (!on) { clearTimeout(timer); running?.ctl.abort(); if (engine.monitor?.ab) engine.setMonitor({ ab: null }); return; }
    const key = keyOf(store.project, library);
    // Eine laufende Messung für einen überholten Stand abbrechen (vor dem Start des Renderns oder vor der Suche)
    if (running && running.key !== key) running.ctl.abort();
    if (key !== state.key) schedule();
  };
  store.on(onChange);
  library.on?.(onChange);
  onChange();
  return {
    state,
    on(fn) { state.listeners.add(fn); },
    async now() { clearTimeout(timer); if (running) await running.done; return run(true); },
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
