// Tempo eines Sounds (Aufnahme): gemeinsam für Inspektor (Desktop) und Clip-Leiste (Handy).
// Mit Tempo wird ein Einzelklang zum Loop, der sich dem Song anpasst; gespeichert im Projekt (store.setSampleTempo).

import { clamp } from '../util.js';
import { MIN_BPM, MAX_BPM } from '../model.js';

// Nur Aufnahmen haben ein eigenes Tempo; erzeugte Loops und Patterns folgen ohnehin dem Song
const origDur = (s) => s?.orig?.duration ?? (s?.lazy && s.category === 'own' ? s.duration : null);
export const hasOwnTempo = (s) => !!(origDur(s) && !s.def && !s.make && !s.missing);
export const soundBpm = (s) => (s?.kind === 'loop' && s.beats && origDur(s) ? (s.beats * 60) / origDur(s) : null);
export const fmtBpm = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

export function setSoundBpm(store, s, bpm) {
  if (!origDur(s) || !(bpm > 0)) return;
  store.setSampleTempo(s.id, Math.max(0.25, (bpm * origDur(s)) / 60));
}
export function useAsSongTempo(store, s) {
  const v = soundBpm(s);
  if (v) store.setBpm(clamp(Math.round(v * 10) / 10, MIN_BPM, MAX_BPM));
}
