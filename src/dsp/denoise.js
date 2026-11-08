// Rauschminderung (spektral): STFT mit Hann-Fenster (2048, 75 % Überlappung), WOLA-Rekonstruktion.
// Rauschprofil je Frequenzband automatisch aus den leisesten Rahmen (10-%-Quantil, auf den Mittelwert korrigiert), über
// die Frequenz median-geglättet ohne „stehende“ Bänder – ein gehaltener Ton gilt nicht als Rauschen. Netzbrummen
// (50/60 Hz und Obertöne, frequenzgenau mit langem Fenster erkannt) bleibt dagegen im Profil.
// Gewinn: Spektral-Subtraktion mit Überschätzung; die Leistung davor über 3 × 7 Zellen (Rahmen × Bänder), der Gewinn
// danach über 3 × 3 geglättet gegen „musical noise“. Untergrenze −30 dB bei voller Stärke, die Stärke ist der Anteil der
// dB-Absenkung. Alle Kanäle bekommen denselben Gewinn je Zelle (Stereobild bleibt).
// Rahmen liegen auf einem festen Raster (Vielfache des Hops, Spiegelung an den Rändern des Ganzen): ein Ausschnitt
// [from, to) ergibt exakt dieselben Samples wie das Ganze an dieser Stelle (Schnitte in Krachwerk, Auswahl im Editor).

import { fft, hann } from './fft.js';

export const FLOOR_DB = -30;
const BETA = 2.5;                  // Überschätzung des Rauschens bei der Subtraktion
// Glättung gegen „musical noise“: Leistung über ±1 Rahmen × ±3 Bänder, danach der Gewinn über ±1 × ±1
const T_POW = 1, F_POW = 3, T_GAIN = 1, F_GAIN = 1;
const Q = 0.1;                     // Quantil der Rahmen je Band
const Q_MEAN = -Math.log(1 - Q);   // Quantil → Mittelwert (Leistung je Zelle ist bei Rauschen exponentialverteilt)
const STEADY = 0.35;               // Quantil/Median darüber: stehender Anteil (Ton oder Brummen)
const MED = 7;                     // Medianbreite ±7 Bänder: Spitzen schmaler als das gelten nicht als Rauschen
const MAX_FRAMES = 2000;           // Profil: höchstens so viele Rahmen (gleichmäßig verteilt)
export const MIN_PROFILE_SEC = 0.25; // kürzer: kein verlässliches Profil, der Klang bleibt unverändert
const EDGE_SEC = 0.01;             // Überblendung an den Rändern einer Auswahl
const HUM_N = 32768;

export const frameSize = (sr) => (sr > 64000 ? 4096 : 2048);

const reflect = (i, n) => {
  if (n <= 1) return 0;
  const p = 2 * (n - 1);
  i %= p;
  if (i < 0) i += p;
  return i < n ? i : p - i;
};

// Kanalpaar (a, b) ab Position s gefenstert in re/im (b fehlt: im = 0)
function load(a, b, s, w, re, im) {
  const n = w.length;
  const len = a.length;
  if (s >= 0 && s + n <= len) {
    for (let i = 0; i < n; i++) { re[i] = a[s + i] * w[i]; im[i] = b ? b[s + i] * w[i] : 0; }
  } else {
    for (let i = 0; i < n; i++) { const j = reflect(s + i, len); re[i] = a[j] * w[i]; im[i] = b ? b[j] * w[i] : 0; }
  }
}

// Leistung je Band, gemittelt über die Kanäle; addiert in P (Länge N/2+1). Paar-Trick: Z = A + iB.
function addPower(re, im, P, scale) {
  const n = re.length;
  const half = n >> 1;
  for (let k = 0; k <= half; k++) {
    const m = (n - k) & (n - 1);
    P[k] += ((re[k] * re[k] + im[k] * im[k] + re[m] * re[m] + im[m] * im[m]) / 2) * scale;
  }
}

function median(arr, a, b, tmp) {
  const n = b - a;
  for (let i = 0; i < n; i++) tmp[i] = arr[a + i];
  const t = tmp.subarray(0, n).sort();
  return n & 1 ? t[n >> 1] : (t[(n >> 1) - 1] + t[n >> 1]) / 2;
}

// Netzbrummen: lange Fenster (≈ 1,3 Hz Auflösung) über den Bereich verteilt. Rückgabe: Brumm-Frequenzen (Hz) oder [].
function detectHum(chs, sr, from, to) {
  const span = to - from;
  if (span < HUM_N / 2) return [];
  const N = Math.min(HUM_N, 1 << Math.floor(Math.log2(span)));
  const w = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const K = Math.min(N >> 1, Math.ceil((1100 * N) / sr));
  const count = Math.max(1, Math.min(12, Math.floor((span - N) / (N >> 1)) + 1));
  const step = count > 1 ? (span - N) / (count - 1) : 0;
  const pairs = [];
  for (let c = 0; c < chs.length; c += 2) pairs.push([chs[c], chs[c + 1] ?? null]);
  const Ps = [];
  const P = new Float64Array(K + 1);
  for (let m = 0; m < count; m++) {
    const s = from + Math.round(m * step);
    const Pm = new Float64Array(K + 1);
    for (const [a, b] of pairs) {
      load(a, b, s, w, re, im);
      fft(re, im);
      for (let k = 0; k <= K; k++) {
        const j = (N - k) & (N - 1);
        Pm[k] += re[k] * re[k] + im[k] * im[k] + re[j] * re[j] + im[j] * im[j];
      }
    }
    for (let k = 0; k <= K; k++) P[k] += Pm[k];
    Ps.push(Pm);
  }
  const bin = sr / N;
  const tmp = new Float64Array(64);
  // Spitze genau bei f über dem Median der Umgebung (±20 Bänder). Lage der Spitze parabolisch verfeinert: Netzbrummen
  // liegt auf ±0,2 Hz genau (je Oberton mehr), ein Ton daneben (G1 = 49 Hz) zählt nicht.
  const peakAt = (X, f, h) => {
    const kc = Math.round(f / bin);
    if (kc < 2 || kc + 2 > K) return 0;
    let k = kc;
    for (const d of [-1, 1]) if (X[kc + d] > X[k]) k = kc + d;
    if (X[k] <= 0 || X[k] < X[k - 1] || X[k] < X[k + 1]) return 0;
    const l = Math.log(X[k - 1] + 1e-300), c = Math.log(X[k]), r = Math.log(X[k + 1] + 1e-300);
    const den = l - 2 * c + r;
    const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
    if (Math.abs((k + off) * bin - f) > 0.3 + 0.2 * h) return 0;
    const lo = Math.max(0, k - 20), hi = Math.min(K + 1, k + 21);
    const med = median(X, lo, hi, tmp);
    return med > 0 ? X[k] / med : Infinity;
  };
  // Brummen steht: die Spitze ist im Mittel deutlich (> 10 dB) und in mindestens 80 % der Fenster (> 6 dB) da.
  // Mindestens zwei Obertöne oder der Grundton
  let best = { f0: 0, hits: [] };
  for (const f0 of [50, 60]) {
    const hits = [];
    let strong = false;
    for (let h = 1; f0 * h <= 1000; h++) {
      const p = peakAt(P, f0 * h, h);
      if (p <= 10) continue;
      let on = 0;
      for (const Pm of Ps) if (peakAt(Pm, f0 * h, h) > 4) on++;
      if (on < 0.8 * count) continue;
      hits.push(f0 * h);
      if (h === 1) strong = true;
    }
    if (hits.length >= 2 || strong) if (hits.length > best.hits.length) best = { f0, hits };
  }
  return best.hits;
}

// Rauschprofil: mittlere Leistung je Band (Länge N/2+1), aus [from, to) geschätzt. null, wenn der Bereich zu kurz ist.
export function noiseProfile(chs, sampleRate, { from = 0, to = chs[0].length } = {}) {
  const len = chs[0].length;
  from = Math.max(0, Math.min(len, Math.round(from)));
  to = Math.max(from, Math.min(len, Math.round(to)));
  if (to - from < MIN_PROFILE_SEC * sampleRate) return null;
  const N = frameSize(sampleRate);
  const K = (N >> 1) + 1;
  const w = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const span = to - from;
  const half = N >> 1;
  const avail = Math.max(1, Math.floor((span - N) / half) + 1);
  const hop = half * Math.max(1, Math.ceil(avail / MAX_FRAMES));
  const F = span >= N ? Math.floor((span - N) / hop) + 1 : 1;
  const data = new Float32Array(K * F);
  const P = new Float64Array(K);
  const pairs = [];
  for (let c = 0; c < chs.length; c += 2) pairs.push([chs[c], chs[c + 1] ?? null]);
  const scale = 1 / chs.length;
  for (let m = 0; m < F; m++) {
    P.fill(0);
    for (const [a, b] of pairs) { load(a, b, from + m * hop, w, re, im); fft(re, im); addPower(re, im, P, scale); }
    for (let k = 0; k < K; k++) data[k * F + m] = P[k];
  }
  // Quantil je Band; „stehend“ heißt: das 10-%-Quantil liegt nah am Median (Rauschen: −8 dB, stehender Ton: ≈ 0 dB)
  const raw = new Float64Array(K);
  const steady = new Uint8Array(K);
  const at = (s, q) => { const x = q * (F - 1); const i = Math.floor(x); return s[i] + (i + 1 < F ? (s[i + 1] - s[i]) * (x - i) : 0); };
  for (let k = 0; k < K; k++) {
    const s = data.subarray(k * F, (k + 1) * F).sort();
    const v = at(s, Q);
    // Gleichanteil und Nyquist sind reell (Chi-Quadrat mit 1 Freiheitsgrad): 10-%-Quantil = 0,0158 · Mittelwert
    raw[k] = v / (k === 0 || k === K - 1 ? 0.0158 : Q_MEAN);
    steady[k] = F >= 8 && v > STEADY * at(s, 0.5) ? 1 : 0;
  }
  // Median über die Frequenz ohne stehende Bänder (symmetrisch, am Rand kleiner): stehende Töne fallen heraus,
  // Steigungen bleiben. Zu wenige Werte im Fenster: Fenster wächst, notfalls einseitig.
  const prof = new Float64Array(K);
  const tmp = new Float64Array(4 * MED + 2);
  for (let k = 0; k < K; k++) {
    let n = 0;
    const r = Math.min(MED, k, K - 1 - k);
    for (let q = k - r; q <= k + r; q++) if (!steady[q]) tmp[n++] = raw[q];
    for (let d = r + 1; n < Math.min(3, 2 * r + 1) && d <= 2 * MED; d++) {
      if (k - d >= 0 && !steady[k - d]) tmp[n++] = raw[k - d];
      if (k + d < K && !steady[k + d]) tmp[n++] = raw[k + d];
    }
    prof[k] = n ? median(tmp, 0, n, tmp.subarray(2 * MED + 1)) : raw[k];
  }
  // Brummen bleibt im Profil (dort zählt das Rohprofil)
  const hum = detectHum(chs, sampleRate, from, to);
  const bin = sampleRate / N;
  for (const f of hum) {
    const kc = Math.round(f / bin);
    for (let k = Math.max(0, kc - 3); k <= Math.min(K - 1, kc + 3); k++) prof[k] = Math.max(prof[k], raw[k]);
  }
  return { N, power: prof, hum };
}

// Rauschen mindern. amount 0 … 1 (0 = unverändert, Kopie). Rückgabe: Kanäle des Bereichs [from, to) (gleiche Länge).
// profile: fertiges Profil oder { from, to } (Bereich für die Schätzung, Standard: alles). edges: an Rändern des Bereichs,
// die nicht am Rand des Ganzen liegen, 10 ms ins Original überblenden (Auswahl im Editor).
// Nur für Tests: link = false (Gewinn je Kanal), smooth = false (ohne Glättung).
export function denoise(chs, sampleRate, { amount = 0.5, from = 0, to = chs[0].length, profile = null, edges = false, link = true, smooth = true } = {}) {
  const len = chs[0].length;
  from = Math.max(0, Math.min(len, Math.round(from)));
  to = Math.max(from, Math.min(len, Math.round(to)));
  const a = Math.min(1, Math.max(0, Number(amount) || 0));
  const plain = () => chs.map((d) => d.slice(from, to));
  if (a <= 0 || to <= from) return plain();
  if (!link && chs.length > 1) {
    return chs.map((d) => denoise([d], sampleRate, { amount: a, from, to, profile: profile?.power ? null : profile, edges, smooth })[0]);
  }
  const prof = profile?.power ? profile : noiseProfile(chs, sampleRate, profile ?? {});
  if (!prof) return plain();
  const N = prof.N;
  const K = (N >> 1) + 1;
  const hop = N >> 2;
  const noise = prof.power;
  const floor = Math.pow(10, FLOOR_DB / 20);
  const w = hann(N);
  const pairs = [];
  for (let c = 0; c < chs.length; c += 2) pairs.push([chs[c], chs[c + 1] ?? null]);
  const np = pairs.length;
  const scale = 1 / chs.length;
  // Glättung: Leistung über ±RT Rahmen × ±RF Bänder, Gewinn über ±GT × ±GF
  const RT = smooth ? T_POW : 0, RF = smooth ? F_POW : 0, GT = smooth ? T_GAIN : 0, GF = smooth ? F_GAIN : 0;
  const RS = 2 * (RT + GT) + 1; // Ringgröße
  const ring = (j) => ((j % RS) + RS) % RS;
  const specRe = Array.from({ length: RS }, () => pairs.map(() => new Float64Array(N)));
  const specIm = Array.from({ length: RS }, () => pairs.map(() => new Float64Array(N)));
  const Pw = Array.from({ length: RS }, () => new Float64Array(K));
  const Gr = Array.from({ length: RS }, () => new Float64Array(K));
  const G = new Float64Array(K);
  const acc = new Float64Array(K);
  const csum = new Float64Array(K + 1);
  const out = chs.map(() => new Float64Array(to - from));
  const yr = new Float64Array(N), yi = new Float64Array(N);
  const jMin = Math.floor((from - N) / hop) + 1;
  const jMax = Math.floor((to - 1) / hop);

  // Kastenmittel über Zeit (rows) und Frequenz (±rf) in acc
  const boxMean = (rows, rf) => {
    acc.fill(0);
    for (const r of rows) for (let k = 0; k < K; k++) acc[k] += r[k];
    if (rf > 0) {
      // gleitende Summe über die Frequenz, am Rand abgeschnitten (Leistung und Rauschen gleich gemittelt)
      for (let k = 0; k < K; k++) csum[k + 1] = csum[k] + acc[k];
      for (let k = 0; k < K; k++) { const lo = Math.max(0, k - rf), hi = Math.min(K - 1, k + rf); acc[k] = (csum[hi + 1] - csum[lo]) / ((hi - lo + 1) * rows.length); }
    } else for (let k = 0; k < K; k++) acc[k] /= rows.length;
  };
  // Rauschen im selben Frequenzfenster gemittelt wie die Leistung (schmale Brummspitzen zählen gleich)
  boxMean([noise], RF);
  const noiseBox = Float64Array.from(acc);
  const rawGain = (j) => {
    const rows = [];
    for (let d = -RT; d <= RT; d++) rows.push(Pw[ring(j + d)]);
    boxMean(rows, RF);
    const g = Gr[ring(j)];
    for (let k = 0; k < K; k++) {
      const s = acc[k];
      const v = s > 0 ? 1 - (BETA * noiseBox[k]) / s : 0;
      g[k] = v > 0 ? v : 0;
    }
  };
  const finalGain = (j) => {
    const rows = [];
    for (let d = -GT; d <= GT; d++) rows.push(Gr[ring(j + d)]);
    boxMean(rows, GF);
    for (let k = 0; k < K; k++) {
      let v = acc[k];
      if (v < floor) v = floor;
      G[k] = a === 1 ? v : Math.pow(v, a);
    }
  };
  const synth = (j) => {
    const slot = ring(j);
    const s0 = j * hop;
    for (let p = 0; p < np; p++) {
      const sr_ = specRe[slot][p], si = specIm[slot][p];
      for (let k = 0; k < N; k++) {
        const g = G[k <= N >> 1 ? k : N - k];
        yr[k] = sr_[k] * g; yi[k] = si[k] * g;
      }
      fft(yr, yi, true);
      const oa = out[2 * p], ob = pairs[p][1] ? out[2 * p + 1] : null;
      const i0 = Math.max(0, from - s0), i1 = Math.min(N, to - s0);
      for (let i = i0; i < i1; i++) {
        const o = s0 + i - from;
        oa[o] += yr[i] * w[i];
        if (ob) ob[o] += yi[i] * w[i];
      }
    }
  };
  // Rahmen analysieren; Rohgewinn um RT, Endgewinn und Synthese um RT + GT Rahmen versetzt
  for (let j = jMin - RT - GT; j <= jMax + RT + GT; j++) {
    const slot = ring(j);
    const P = Pw[slot];
    P.fill(0);
    for (let p = 0; p < np; p++) {
      const re = specRe[slot][p], im = specIm[slot][p];
      load(pairs[p][0], pairs[p][1], j * hop, w, re, im);
      fft(re, im);
      addPower(re, im, P, scale);
    }
    if (j - RT >= jMin - GT) rawGain(j - RT);
    if (j - RT - GT >= jMin) { finalGain(j - RT - GT); synth(j - RT - GT); }
  }
  // Hann² über 4 Überlappungen summiert sich auf 1,5
  const res = out.map((d) => { const r = new Float32Array(d.length); for (let i = 0; i < d.length; i++) r[i] = d[i] / 1.5; return r; });
  if (edges) {
    const E = Math.min(Math.round(EDGE_SEC * sampleRate), (to - from) >> 2);
    res.forEach((d, c) => {
      const src = chs[c];
      for (let i = 0; i < E; i++) {
        const t = (i + 0.5) / E;
        if (from > 0) d[i] = src[from + i] * (1 - t) + d[i] * t;
        if (to < len) { const o = to - from - 1 - i; d[o] = src[to - 1 - i] * (1 - t) + d[o] * t; }
      }
    });
  }
  return res;
}

// Ganzer Sound mit bearbeitetem Bereich (Editor): Kopie, [from, to) ersetzt
export function denoiseRange(chs, sampleRate, opts = {}) {
  const from = Math.max(0, Math.round(opts.from ?? 0));
  const part = denoise(chs, sampleRate, { ...opts, edges: true });
  return chs.map((d, c) => { const r = d.slice(); r.set(part[c], from); return r; });
}
