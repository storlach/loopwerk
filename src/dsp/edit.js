// Destruktive Bearbeitungen für den Sample-Editor. Reine Funktionen auf Float32Array-Kanälen:
// Eingabe bleibt unverändert, Rückgabe sind neue Kanäle. Bereiche [a, b) in Frames.

const copy = (chs) => chs.map((d) => d.slice());
const range = (chs, a, b) => [Math.max(0, Math.min(a, b)), Math.min(chs[0].length, Math.max(a, b))];

export function peakOf(chs, a = 0, b = chs[0].length) {
  let p = 0;
  for (const d of chs) for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > p) p = v; }
  return p;
}

// Nur die Auswahl behalten
export function crop(chs, a, b) {
  [a, b] = range(chs, a, b);
  return chs.map((d) => d.slice(a, b));
}

// Auswahl entfernen, Rest schließt auf (mit 2-ms-Überblendung an der Naht)
export function cut(chs, a, b, sampleRate = 44100) {
  [a, b] = range(chs, a, b);
  const xf = Math.min(Math.round(sampleRate * 0.002), a, chs[0].length - b);
  return chs.map((d) => {
    const out = new Float32Array(d.length - (b - a));
    out.set(d.subarray(0, a));
    out.set(d.subarray(b), a);
    for (let i = 0; i < xf; i++) {
      const w = (i + 1) / (xf + 1);
      out[a - xf + i] = d[a - xf + i] * (1 - w) + d[b - xf + i] * w;
    }
    return out;
  });
}

export function silence(chs, a, b) {
  [a, b] = range(chs, a, b);
  const out = copy(chs);
  for (const d of out) d.fill(0, a, b);
  return out;
}

export function reverse(chs, a = 0, b = chs[0].length) {
  [a, b] = range(chs, a, b);
  const out = copy(chs);
  for (const d of out) d.subarray(a, b).reverse();
  return out;
}

export function fade(chs, a, b, dir) {
  [a, b] = range(chs, a, b);
  const out = copy(chs);
  const n = Math.max(1, b - a - 1);
  for (const d of out) {
    for (let i = a; i < b; i++) {
      const t = (i - a) / n;
      d[i] *= dir === 'in' ? t : 1 - t;
    }
  }
  return out;
}

export function gain(chs, db, a = 0, b = chs[0].length) {
  [a, b] = range(chs, a, b);
  const g = Math.pow(10, db / 20);
  const out = copy(chs);
  for (const d of out) for (let i = a; i < b; i++) d[i] *= g;
  return out;
}

export function normalize(chs, target = 0.89, a = 0, b = chs[0].length) {
  [a, b] = range(chs, a, b);
  const p = peakOf(chs, a, b);
  if (p <= 0) return copy(chs);
  return gain(chs, 20 * Math.log10(target / p), a, b);
}

// Tonhöhe in Halbtönen per Neuabtastung (kubisch). Höher = kürzer, wie beim Bandmaschinen-Prinzip.
export function pitch(chs, semitones) {
  const r = Math.pow(2, semitones / 12);
  if (r === 1) return copy(chs);
  return chs.map((d) => {
    const len = Math.max(1, Math.floor(d.length / r));
    const out = new Float32Array(len);
    const at = (i) => d[Math.min(d.length - 1, Math.max(0, i))];
    for (let j = 0; j < len; j++) {
      const x = j * r;
      const i = Math.floor(x);
      const f = x - i;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      out[j] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    }
    return out;
  });
}
