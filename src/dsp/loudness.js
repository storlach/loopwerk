// Lautheit nach ITU-R BS.1770-4 (integriert, LUFS) und True Peak (dBTP).
// K-Filter-Konstanten aus der Norm, für beliebige Abtastraten hergeleitet (wie libebur128, MIT).

import { tpFilter } from './master-core.js';

function kFilters(sr) {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  const hp = [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return [shelf, hp];
}

// Mittlere Quadrate je 100-ms-Schritt (K-gewichtet, über alle Kanäle summiert)
function stepPowers(chs, sr) {
  const [f1, f2] = kFilters(sr);
  const step = Math.round(sr * 0.1);
  const n = chs[0].length;
  const steps = Math.floor(n / step);
  const pw = new Float64Array(steps);
  for (const x of chs) {
    let s1a = 0, s1b = 0, s2a = 0, s2b = 0;
    for (let i = 0, k = 0; k < steps; k++) {
      let acc = 0;
      for (const end = (k + 1) * step; i < end; i++) {
        const v = x[i];
        const y1 = f1[0] * v + s1a;
        s1a = f1[1] * v - f1[3] * y1 + s1b;
        s1b = f1[2] * v - f1[4] * y1;
        const y2 = f2[0] * y1 + s2a;
        s2a = f2[1] * y1 - f2[3] * y2 + s2b;
        s2b = f2[2] * y1 - f2[4] * y2;
        acc += y2 * y2;
      }
      pw[k] += acc / step;
    }
  }
  return pw;
}

const lufs = (z) => -0.691 + 10 * Math.log10(z);

// Integrierte Lautheit: 400-ms-Blöcke mit 75 % Überlappung, absolute Schwelle −70, relative −10 LU
export function integratedLoudness(chs, sampleRate) {
  const pw = stepPowers(chs, sampleRate);
  const blocks = [];
  for (let k = 0; k + 4 <= pw.length; k++) blocks.push((pw[k] + pw[k + 1] + pw[k + 2] + pw[k + 3]) / 4);
  const abs = blocks.filter((z) => lufs(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((z) => lufs(z) > rel);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// True Peak in dBTP durch Überabtastung (Standard 4×; Tests messen feiner, z. B. 8× mit 16 Abgriffen je Seite)
export function truePeak(chs, { factor = 4, half = 16 } = {}) {
  const taps = tpFilter(factor, half);
  const H2 = 2 * half;
  let peak = 0;
  for (const x of chs) {
    const n = x.length;
    for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
    for (let n0 = half - 1; n0 < n - half; n0++) {
      for (let j = 0; j < factor - 1; j++) {
        let acc = 0;
        const o = j * H2;
        const base = n0 - half + 1;
        for (let m = 0; m < H2; m++) acc += taps[o + m] * x[base + m];
        const a = Math.abs(acc);
        if (a > peak) peak = a;
      }
    }
  }
  return 20 * Math.log10(peak + 1e-12);
}
