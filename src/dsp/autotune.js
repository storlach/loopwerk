// Autotune: Tonhöhe erkennen (YIN), zum nächsten Ton der Tonleiter ziehen, per TD-PSOLA verschieben.
// PSOLA setzt Perioden-Körner (Hann, zwei Perioden lang) im neuen Abstand neu zusammen: die Tonhöhe ändert sich,
// Länge und Klangfarbe (Formanten) bleiben weitgehend erhalten.

import { detectPitch, voicing, midiOf, snapToScale, toMono } from './pitch.js';

const UNVOICED_PERIOD = 0.01; // s: Kornabstand in stimmlosen Stellen

// Pro Rahmen: Korrektur in Halbtönen (geglättet). speed 1 = sofort (Roboter-Effekt), 0 = sehr weich
export function correctionCurve(track, { root = 9, scale = 'minor', strength = 1, speed = 0.6 } = {}) {
  const voiced = voicing(track, { minConf: 0.75, gateDb: -35 });
  const n = track.f0.length;
  const corr = new Float32Array(n);
  const tau = Math.max(0.001, (1 - speed) * 0.2);
  const a = 1 - Math.exp(-track.hop / tau);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (!voiced[i]) { c = 0; corr[i] = 0; continue; }
    const m = midiOf(track.f0[i]);
    const target = (snapToScale(m, root, scale) - m) * strength;
    c += (target - c) * (speed >= 1 ? 1 : a);
    corr[i] = c;
  }
  return { corr, voiced };
}

// Werte je Rahmen auf Abtastwerte verteilen (linear zwischen den Rahmenmitten)
function perSample(track, values, length, sampleRate, fill) {
  const out = new Float32Array(length);
  const n = values.length;
  if (!n) return out.fill(fill);
  let f = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    while (f + 1 < n && track.times[f + 1] <= t) f++;
    if (t <= track.times[0]) out[i] = values[0];
    else if (f + 1 >= n) out[i] = values[n - 1];
    else {
      const w = (t - track.times[f]) / (track.times[f + 1] - track.times[f]);
      out[i] = values[f] * (1 - w) + values[f + 1] * w;
    }
  }
  return out;
}

export function psola(chs, sampleRate, periods, ratios) {
  const length = chs[0].length;
  const mono = toMono(chs);
  // Analyse-Marken: im Abstand einer Periode, auf das nächste Maximum gezogen
  const marks = [];
  let t = 0;
  while (t < length) {
    const P = periods[t];
    let best = t;
    if (P > 0) {
      const r = Math.round(P * 0.2);
      for (let k = Math.max(0, t - r); k <= Math.min(length - 1, t + r); k++) if (mono[k] > mono[best]) best = k;
      if (marks.length && best <= marks[marks.length - 1]) best = t;
    }
    marks.push(best);
    t = best + Math.max(16, Math.round(P > 0 ? P : UNVOICED_PERIOD * sampleRate));
  }
  const out = chs.map(() => new Float32Array(length));
  let mi = 0;
  let ts = marks[0] ?? 0;
  while (ts < length) {
    while (mi + 1 < marks.length && Math.abs(marks[mi + 1] - ts) <= Math.abs(marks[mi] - ts)) mi++;
    const ta = marks[mi];
    const P = Math.max(16, Math.round(periods[ta] > 0 ? periods[ta] : UNVOICED_PERIOD * sampleRate));
    const ratio = periods[ta] > 0 ? ratios[ta] : 1;
    const step = Math.max(8, Math.round(P / ratio));
    // Kornhöhe an die Dichte anpassen: Pegel bleibt gleich, auch wenn Körner enger liegen
    const g = Math.min(1, step / P);
    for (let k = -P; k < P; k++) {
      const src = ta + k;
      const dst = ts + k;
      if (src < 0 || src >= length || dst < 0 || dst >= length) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / P);
      for (let c = 0; c < chs.length; c++) out[c][dst] += chs[c][src] * w * g;
    }
    ts += step;
  }
  return out;
}

// chs: Kanäle; root 0–11 (C…H); scale 'major' | 'minor' | 'chromatic'; strength 0…1; speed 0…1
export function autotune(chs, sampleRate, opts = {}) {
  if ((opts.strength ?? 1) <= 0) return chs.map((d) => d.slice());
  const track = detectPitch(toMono(chs), sampleRate);
  const { corr, voiced } = correctionCurve(track, opts);
  const length = chs[0].length;
  const period = Array.from(track.f0, (f, i) => (voiced[i] ? sampleRate / f : 0));
  // Periode nur innerhalb stimmhafter Stellen verteilen: an Rändern keine Mischwerte mit 0
  const periods = perSample(track, period, length, sampleRate, 0);
  const vmask = perSample(track, Array.from(voiced, (v) => (v ? 1 : 0)), length, sampleRate, 0);
  for (let i = 0; i < length; i++) if (vmask[i] < 0.999) periods[i] = 0;
  const ratios = perSample(track, Array.from(corr, (c) => Math.pow(2, c / 12)), length, sampleRate, 1);
  return psola(chs, sampleRate, periods, ratios);
}
