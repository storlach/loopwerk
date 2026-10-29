// Trennung eines Mixes in Ebenen – als Näherung ohne KI-Modell, rein mit Signalverarbeitung im Browser:
// - harmonisch/perkussiv (HPSS, Fitzgerald 2010): Medianfilter über die Zeit bzw. über die Frequenz
// - Mitte/Seiten (Avendano & Jot): Anteil, der in beiden Kanälen gleich ist (Gesang und Lead liegen meist mittig)
// - Bass: harmonischer Anteil unter ca. 200 Hz
// Die vier Masken (Drums, Bass, Gesang, Rest) ergeben zusammen 1: die Ebenen addieren sich wieder zum Original.

import { fft } from './fft.js';

const N = 2048;
const HOP = 512;
const MED_T = 17; // Rahmen für den Zeit-Median (≈ 200 ms)
const MED_F = 17; // Bins für den Frequenz-Median (≈ 370 Hz)

export const STEMS = [
  { id: 'vocals', label: 'Gesang' },
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'other', label: 'Instrumente' },
];

// Wurzel-Hann für Analyse und Synthese: bei 75 % Überlappung summiert sich das Produkt zu einer Konstante
function sqrtHann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  return w;
}

// STFT von zwei reellen Kanälen mit einer komplexen FFT (x + i·y), danach getrennt
function stft2(x, y, win) {
  const length = x.length;
  const frames = Math.ceil((length + N) / HOP) + 1;
  const bins = N / 2 + 1;
  const mk = () => ({ re: new Float32Array(frames * bins), im: new Float32Array(frames * bins), frames, bins });
  const a = mk();
  const b = mk();
  const zr = new Float64Array(N), zi = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const s = f * HOP - N;
    for (let i = 0; i < N; i++) {
      const j = s + i;
      const inside = j >= 0 && j < length;
      zr[i] = inside ? x[j] * win[i] : 0;
      zi[i] = inside ? y[j] * win[i] : 0;
    }
    fft(zr, zi);
    const o = f * bins;
    for (let k = 0; k < bins; k++) {
      const m = (N - k) % N;
      a.re[o + k] = (zr[k] + zr[m]) / 2; a.im[o + k] = (zi[k] - zi[m]) / 2;
      b.re[o + k] = (zi[k] + zi[m]) / 2; b.im[o + k] = (zr[m] - zr[k]) / 2;
    }
  }
  return [a, b];
}

// Inverse STFT zweier maskierter Spektren in einem Durchgang (A + i·B → Real- und Imaginärteil)
function istft2(A, B, mask, length, win) {
  const { frames, bins } = A;
  const outA = new Float32Array(length);
  const outB = new Float32Array(length);
  const zr = new Float64Array(N), zi = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * bins;
    for (let k = 0; k < bins; k++) {
      const m = mask[o + k];
      const ar = A.re[o + k] * m, ai = A.im[o + k] * m, br = B.re[o + k] * m, bi = B.im[o + k] * m;
      zr[k] = ar - bi; zi[k] = ai + br;
      if (k > 0 && k < N / 2) { zr[N - k] = ar + bi; zi[N - k] = br - ai; }
    }
    fft(zr, zi, true);
    const s = f * HOP - N;
    for (let i = 0; i < N; i++) {
      const j = s + i;
      // Analyse- mal Synthesefenster = Hann; bei 75 % Überlappung summiert es sich zu 2
      if (j >= 0 && j < length) { outA[j] += (zr[i] * win[i]) / 2; outB[j] += (zi[i] * win[i]) / 2; }
    }
  }
  return [outA, outB];
}

// Gleitender Median über ein Fenster der Breite k (ungerade) einer Folge von Länge n, gelesen über get(i)
function slidingMedian(n, k, get, set) {
  const half = k >> 1;
  const win = [];
  const insert = (v) => {
    let lo = 0, hi = win.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (win[mid] < v) lo = mid + 1; else hi = mid; }
    win.splice(lo, 0, v);
  };
  const remove = (v) => {
    let lo = 0, hi = win.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (win[mid] < v) lo = mid + 1; else hi = mid; }
    win.splice(lo, 1);
  };
  for (let i = 0; i < Math.min(n, half); i++) insert(get(i));
  for (let i = 0; i < n; i++) {
    if (i + half < n) insert(get(i + half));
    if (i - half - 1 >= 0) remove(get(i - half - 1));
    set(i, win[win.length >> 1]);
  }
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// chs: Float32Array-Kanäle (1 oder 2). Gibt die Ebenen als Kanallisten zurück.
export function separate(chs, sampleRate, { onProgress } = {}) {
  const length = chs[0].length;
  const stereo = chs.length > 1;
  const win = sqrtHann(N);
  const specs = stereo ? stft2(chs[0], chs[1], win) : stft2(chs[0], chs[0], win).slice(0, 1);
  onProgress?.(0.2);
  const { frames, bins } = specs[0];
  const total = frames * bins;
  // Betrag des Mono-Mixes für HPSS
  const mag = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    let r = 0, m = 0;
    for (const s of specs) { r += s.re[i]; m += s.im[i]; }
    mag[i] = Math.hypot(r, m) / specs.length;
  }
  const harm = new Float32Array(total);
  const perc = new Float32Array(total);
  for (let k = 0; k < bins; k++) slidingMedian(frames, MED_T, (f) => mag[f * bins + k], (f, v) => { harm[f * bins + k] = v; });
  onProgress?.(0.4);
  for (let f = 0; f < frames; f++) slidingMedian(bins, MED_F, (k) => mag[f * bins + k], (k, v) => { perc[f * bins + k] = v; });
  onProgress?.(0.55);

  const hz = (k) => (k * sampleRate) / N;
  const masks = { vocals: new Float32Array(total), drums: new Float32Array(total), bass: new Float32Array(total), other: new Float32Array(total) };
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < bins; k++) {
      const i = f * bins + k;
      const h2 = harm[i] * harm[i];
      const p2 = perc[i] * perc[i];
      const p = h2 + p2 > 1e-20 ? p2 / (h2 + p2) : 0.5;
      const h = 1 - p;
      const fr = hz(k);
      const bassW = 1 - smoothstep(150, 260, fr);
      // Mitte: wie ähnlich sind linker und rechter Kanal in diesem Bin?
      let center = 1;
      if (stereo) {
        const lr = specs[0].re[i], li = specs[0].im[i], rr = specs[1].re[i], ri = specs[1].im[i];
        const el = lr * lr + li * li, er = rr * rr + ri * ri;
        const cross = Math.hypot(lr * rr + li * ri, li * rr - lr * ri);
        center = el + er > 1e-20 ? (2 * cross) / (el + er) : 0;
        center *= center; // nur deutlich mittige Anteile
      }
      const voiceBand = smoothstep(120, 220, fr) * (1 - smoothstep(7000, 11000, fr));
      const v = h * (1 - bassW) * center * voiceBand;
      masks.drums[i] = p;
      masks.bass[i] = h * bassW;
      masks.vocals[i] = v;
      masks.other[i] = h * (1 - bassW) - v;
    }
  }
  onProgress?.(0.65);
  const out = {};
  let done = 0;
  // Drei Ebenen rechnen, die vierte ist der Rest (Masken ergeben zusammen 1, die STFT ist linear)
  for (const id of ['vocals', 'drums', 'bass']) {
    const [l, r] = istft2(specs[0], specs[stereo ? 1 : 0], masks[id], length, win);
    out[id] = stereo ? [l, r] : [l, l.slice()];
    onProgress?.(0.65 + (0.35 * ++done) / 3);
  }
  const src = stereo ? chs : [chs[0], chs[0]];
  out.other = src.map((d, c) => {
    const o = new Float32Array(length);
    for (let i = 0; i < length; i++) o[i] = d[i] - out.vocals[c][i] - out.drums[c][i] - out.bass[c][i];
    return o;
  });
  return out;
}

// Stimme entfernen = alles außer der Gesangs-Ebene; Stimme isolieren = nur die Gesangs-Ebene
export function mixStems(stems, ids) {
  const first = stems[ids[0]];
  const out = first.map((d) => new Float32Array(d.length));
  for (const id of ids) stems[id].forEach((d, c) => { const o = out[c]; for (let i = 0; i < d.length; i++) o[i] += d[i]; });
  return out;
}
