// Ziel-Verstärkung fürs Mastering suchen: Stufe 1 einmal rechnen, dann den Limiter mit wenigen Verstärkungen
// probieren (Sekantenverfahren), bis die integrierte Lautheit auf ±0,1 LU am Ziel liegt.
// Gleicher Code wie im AudioWorklet – das Ergebnis gilt deshalb genau so für Wiedergabe und Export.

import { MasterTone, TruePeakLimiter, MASTER_REF, styleOf } from './master-core.js';
import { integratedLoudness, truePeak } from './loudness.js';

const B = 128;
const dbToGain = (db) => Math.pow(10, db / 20);

function runBlocks(n, fn) {
  for (let i = 0; i < n; i += B) fn(i, Math.min(B, n - i));
}

export function searchMaster(chs, sampleRate, styleId, target = styleOf(styleId).target) {
  const st = styleOf(styleId);
  const L0 = chs[0];
  const R0 = chs[1] || chs[0];
  const n = L0.length;
  const inLufs = integratedLoudness([L0, R0], sampleRate);
  if (!Number.isFinite(inLufs)) return { pre: 0, drive: st.drive, inLufs, outLufs: -Infinity, peak: -Infinity, silent: true };
  const pre = Math.max(-24, Math.min(24, MASTER_REF - inLufs));
  const yl = new Float32Array(n);
  const yr = new Float32Array(n);
  const tone = new MasterTone(sampleRate, st.id);
  const g = dbToGain(pre);
  runBlocks(n, (i, m) => tone.process(L0.subarray(i, i + m), R0.subarray(i, i + m), yl.subarray(i, i + m), yr.subarray(i, i + m), m, g));
  const toneLufs = integratedLoudness([yl, yr], sampleRate);
  const ol = new Float32Array(n);
  const or = new Float32Array(n);
  const peaks = new Float64Array(n);
  new TruePeakLimiter(sampleRate, st.id).detect(yl, yr, peaks, n);
  const limit = (driveDb) => {
    new TruePeakLimiter(sampleRate, st.id).apply(peaks, yl, yr, ol, or, n, dbToGain(driveDb));
    return integratedLoudness([ol, or], sampleRate);
  };
  const clampD = (d) => Math.max(-12, Math.min(30, d));
  let d0 = clampD(target - toneLufs);
  let l0 = limit(d0);
  let d = d0;
  let l = l0;
  for (let it = 0; it < 6 && Math.abs(target - l) > 0.1; it++) {
    let slope = 1;
    if (it > 0 && Math.abs(d - d0) > 1e-3) slope = Math.max(0.15, Math.min(1.2, (l - l0) / (d - d0)));
    const next = clampD(d + (target - l) / slope);
    d0 = d; l0 = l;
    d = next;
    l = limit(d);
  }
  return { pre, drive: d, inLufs, outLufs: l, peak: truePeak([ol, or]), style: st.id, target };
}

// Rechen-Worker (job 'mastering'): Suche auf der Summe vor dem Mastering (Kanäle 0, 1) und Lautheit ohne Mastering (2, 3)
export function masteringJob({ chs, sampleRate, style, target }) {
  return { ...searchMaster(chs.slice(0, 2), sampleRate, style, target), aLufs: integratedLoudness(chs.slice(2, 4), sampleRate) };
}
