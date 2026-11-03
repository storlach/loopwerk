// Klang-Rezept backen (ADR 010): aus dem Original und dem Rezept einen neuen Puffer rechnen. Reines JS auf
// Float32Array-Kanälen, Eingabe bleibt unverändert – läuft im Hauptthread (kurze Klänge) und im Rechen-Worker.
// Feste Reihenfolge: Ausschnitt · rückwärts · Dehnen · Tonhöhe · Autotune · Hochpass/Tiefpass · Wärme · Körnung · Gain ·
// Hüllkurve.

import { timeStretch } from './stretch.js';
import { pitch } from './edit.js';
import { autotune } from './autotune.js';
import { pitchGrid } from '../cuts.js';
import { TUNE_KEYS } from '../recipe.js';

const EDGE_SEC = 0.002; // Mindestblende an jeder geschnittenen Kante

// RBJ-Biquad (Tief- oder Hochpass, 12 dB/Okt.) in place
function biquad(d, type, freq, q, sr) {
  const w0 = (2 * Math.PI * Math.min(freq, sr * 0.499)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b1 = (type === 'lp' ? 1 - cos : -(1 + cos)) / a0;
  const b0 = (type === 'lp' ? (1 - cos) / 2 : (1 + cos) / 2) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
}

// Neuabtastung (kubisch wie edit.js pitch) auf dem festen Raster des Originals: Stützstellen bei Vielfachen von ratio,
// gezählt ab anchor (Lage des Ausschnitts). Schnitte treffen so dieselben Werte wie ihre Quelle (Zerlegen, 2b).
function pitchOnGrid(chs, ratio, anchor) {
  const { x0, count } = pitchGrid(anchor, ratio, chs[0].length);
  return chs.map((d) => {
    const out = new Float32Array(count);
    const n = d.length;
    const at = (i) => d[i < 0 ? 0 : i >= n ? n - 1 : i];
    for (let j = 0; j < count; j++) {
      const x = x0 + j * ratio;
      const i = Math.floor(x);
      const f = x - i;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      out[j] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    }
    return out;
  });
}

const rmsOf = (chs) => {
  let e = 0, n = 0;
  for (const d of chs) { for (let i = 0; i < d.length; i++) e += d[i] * d[i]; n += d.length; }
  return n ? Math.sqrt(e / n) : 0;
};

// Ist das Rezept leer (nur Name/Material), kommt eine Kopie zurück
export function cookRecipe(chs, sampleRate, r = {}) {
  const sr = sampleRate;
  const len = chs[0].length;
  // 1. Ausschnitt
  const a = Math.min(len - 1, Math.max(0, Math.round((r.start ?? 0) * sr)));
  const b = Math.max(a + 1, Math.min(len, r.end != null ? Math.round(r.end * sr) : len));
  let out = chs.map((d) => d.slice(a, b));
  const cutStart = a > 0 || !!r.reverse;
  const cutEnd = b < len || !!r.reverse;
  // 2. rückwärts
  if (r.reverse) for (const d of out) d.reverse();
  // 3. Dehnen (gleiche Tonhöhe)
  const st = r.stretch ?? 1;
  if (st !== 1) out = timeStretch(out, st, sr, Math.max(1, Math.round(out[0].length * st)), { loop: false });
  // 4. Tonhöhe per Neuabtastung; beim Hochstimmen vorher Tiefpass gegen Spiegelfrequenzen
  const semis = (r.semis ?? 0) + (r.cents ?? 0) / 100;
  if (semis) {
    const f = Math.pow(2, semis / 12);
    if (f > 1) for (const d of out) { biquad(d, 'lp', (0.45 * sr) / f, Math.SQRT1_2, sr); biquad(d, 'lp', (0.45 * sr) / f, Math.SQRT1_2, sr); }
    out = st === 1 ? pitchOnGrid(out, f, r.reverse ? len - b : a) : pitch(out, semis);
  }
  // 4b. Autotune: zum nächsten Ton der Moll-Tonleiter ziehen (PSOLA, Länge bleibt)
  const tune = r.tune ?? 0;
  if (tune > 0) {
    const root = Math.max(0, TUNE_KEYS.indexOf(r.tuneKey ?? 'Am'));
    out = autotune(out, sr, { root, scale: 'minor', strength: Math.min(1, tune), speed: r.robot ? 1 : 0.6 });
  }
  // 5. Hochpass, Tiefpass (Resonanz: Q 0,707 … 8)
  if ((r.hp ?? 20) > 20) for (const d of out) biquad(d, 'hp', r.hp, Math.SQRT1_2, sr);
  if ((r.lp ?? 20000) < 20000 || (r.res ?? 0) > 0) {
    const q = Math.SQRT1_2 * Math.pow(8 / Math.SQRT1_2, r.res ?? 0);
    for (const d of out) biquad(d, 'lp', r.lp ?? 20000, q, sr);
  }
  // 6. Wärme: tanh-Sättigung, danach auf das RMS davor ausgeglichen, Spitze ≤ 1
  const warm = r.warm ?? 0;
  if (warm > 0) {
    const before = rmsOf(out);
    const k = 1 + 7 * warm;
    for (const d of out) for (let i = 0; i < d.length; i++) d[i] = Math.tanh(k * d[i]);
    const after = rmsOf(out);
    let g = after > 0 ? before / after : 1;
    let p = 0;
    for (const d of out) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]) * g; if (v > p) p = v; }
    if (p > 1) g /= p;
    if (g !== 1) for (const d of out) for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  // 7. Körnung: 16 → 4 Bit, Halten bis 8 Samples
  const grain = r.grain ?? 0;
  if (grain > 0) {
    const q = Math.pow(2, 16 - 12 * grain - 1);
    const hold = 1 + Math.round(7 * grain);
    for (const d of out) {
      let h = 0;
      for (let i = 0; i < d.length; i++) {
        if (i % hold === 0) h = Math.round(d[i] * q) / q;
        d[i] = h;
      }
    }
  }
  // 8. Gain
  const gdb = r.gain ?? 0;
  if (gdb) {
    const g = Math.pow(10, gdb / 20);
    for (const d of out) for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  // 9. Hüllkurve: Anschlag linear, Ausklang (1−x)²; an geschnittenen Kanten mindestens 2 ms
  const n = out[0].length;
  const edge = Math.round(EDGE_SEC * sr);
  const A = Math.min(n, Math.max(Math.round(((r.attack ?? 0) / 1000) * sr), cutStart ? edge : 0));
  const R = Math.min(n, Math.max(Math.round(((r.release ?? 0) / 1000) * sr), cutEnd ? edge : 0));
  for (const d of out) {
    for (let i = 0; i < A; i++) d[i] *= i / A;
    for (let i = n - R; i < n; i++) { const x = 1 - (i - (n - R)) / R; d[i] *= x * x; }
  }
  return out;
}

// Spitze des gebackenen Klangs ohne seine Lautstärke (für „Auf Spitze“): Gain wirkt linear nach allen anderen Stufen
export function peakOfChannels(chs) {
  let p = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; }
  return p;
}
