// „Klatsch dein Kit“: eine Aufnahme an den Anschlägen zerlegen, jedes Stück säubern, messen und einordnen.

import { highpass, blockRms, mixMono, cleanTake, features, classify, isDoubleMono } from './clean.js';

const HOP = 0.0025;      // Analyseraster 2,5 ms
const MIN_GAP = 0.06;    // zwei Anschläge mindestens 60 ms auseinander
const MAX_SLICE = 1.2;   // ein Stück höchstens 1,2 s

const percentile = (arr, p) => {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

// Anschläge (Frames). sensitivity 0…1: höher findet auch leise Schläge.
export function detectOnsets(mono, sampleRate, { sensitivity = 0.5 } = {}) {
  const x = highpass(mono, sampleRate, 60);
  const hop = Math.max(8, Math.round(sampleRate * HOP));
  const env = blockRms(x, hop);
  const floor = percentile(env, 0.2);
  const loudest = env.reduce((m, v) => Math.max(m, v), 0);
  const rel = 0.08 - 0.06 * sensitivity; // −22 dB … −36 dB unter dem lautesten Schlag
  const thr = Math.max(0.003, floor * 3, loudest * rel);
  const rise = 2.2 - sensitivity;        // Pegelsprung gegenüber den letzten ~10 ms
  const gap = Math.round(MIN_GAP / HOP);
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < env.length; i++) {
    if (env[i] < thr || i - last < gap) continue;
    let before = 0, n = 0;
    for (let j = Math.max(0, i - 6); j <= i - 2; j++) { before += env[j]; n++; }
    before = n ? before / n : 0;
    if (env[i] < before * rise + 1e-6) continue;
    // auf den ersten deutlichen Ausschlag im Bereich verfeinern
    const a = Math.max(0, (i - 2) * hop);
    const b = Math.min(x.length, (i + 3) * hop);
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, Math.abs(x[k]));
    let k = a;
    while (k < b && Math.abs(x[k]) < m * 0.3) k++;
    out.push(k);
    last = i;
  }
  return out;
}

// Zerlegen: Rückgabe je Stück { chs, sampleRate, onset, f, cls }
export function sliceTake(chs, sampleRate, opts = {}) {
  const src = isDoubleMono(chs) ? [chs[0]] : chs;
  const mono = mixMono(src);
  const onsets = detectOnsets(mono, sampleRate, opts);
  const pre = Math.round(0.003 * sampleRate);
  const pieces = [];
  onsets.forEach((o, i) => {
    const a = Math.max(0, o - pre);
    const next = i + 1 < onsets.length ? onsets[i + 1] - pre : mono.length;
    const b = Math.min(next, o + Math.round(MAX_SLICE * sampleRate), mono.length);
    const seg = src.map((d) => d.slice(a, b));
    const c = cleanTake(seg, sampleRate, { maxSeconds: MAX_SLICE });
    if (!c || c.chs[0].length < sampleRate * 0.015) return;
    const f = features(mixMono(c.chs), sampleRate);
    pieces.push({ chs: c.chs, sampleRate, onset: o, f, cls: classify(f) });
  });
  return pieces;
}

// Höchstens max Stücke auswählen, gleichmäßig über die Helligkeit verteilt; Reihenfolge tief → hell
export function pickKit(pieces, max = 8) {
  const sorted = [...pieces].sort((p, q) => p.f.centroid - q.f.centroid);
  if (sorted.length <= max) return sorted;
  const out = [];
  for (let i = 0; i < max; i++) out.push(sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]);
  return out;
}
