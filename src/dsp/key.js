// Tonart-Erkennung eigener Sounds: Chroma aus dem Spektrum (Spitzen zwischen C2 und H6), Abgleich mit den
// Dur-/Moll-Profilen von Krumhansl und Kessler (1982). Perkussives, Geräusche und Unsicheres ergeben keine Tonart.
// Ergebnis: { key, confidence, tonality, r, margin, chroma } – key wie im Modell („Am“ = A-Moll, „C“ = C-Dur) oder null.

import { fft, hann } from './fft.js';
import { downsample, toMono } from './pitch.js';
import { KEYS, KEY_MAJOR } from '../keys.js';

const N = 4096; // bei etwa 11 kHz: 0,37 s, 2,7 Hz Auflösung (reicht für Bässe ab C2)
const HOP = N / 2;
const F_LO = 63; // knapp unter C2: Bassdrums (50–60 Hz) bleiben draußen, Basstöne zählen über ihre Obertöne
const F_HI = 2000;
const MAX_SECONDS = 90;
const F_FUND = 40; // tiefere Grundtöne nur, um ihre Obertöne zu erkennen
const MAX_PEAKS = 256;
const PARTIALS = [3, 5, 6, 7];

// Profile (C als Grundton): Gewicht jeder Tonhöhenklasse in Dur bzw. Moll
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Schwellen: so viel des Pegels muss tonal sein, so gut muss das Profil passen, so klar vor dem Zweitbesten liegen
const MIN_TONALITY = 0.35;
const MIN_R = 0.6;
const MIN_MARGIN = 0.035;
const FLAT_TONAL = 0.12; // spektrale Flachheit eines tonalen Rahmens (weißes Rauschen ≈ 0,56)

export const keyCode = (tonic, minor) => (minor ? KEYS[tonic] : KEY_MAJOR[(tonic + 9) % 12]);

function pearson(x, prof, shift) {
  let mx = 0, my = 0;
  for (let i = 0; i < 12; i++) { mx += x[i]; my += prof[i]; }
  mx /= 12; my /= 12;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < 12; i++) {
    const a = x[(i + shift) % 12] - mx, b = prof[i] - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  return sxx > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// Chroma und Anteil des tonalen Pegels; mono: Float32Array
export function chromaOf(mono, sampleRate) {
  const lim = Math.min(mono.length, Math.round(MAX_SECONDS * sampleRate));
  const { data, rate } = downsample(mono.subarray(0, lim), sampleRate);
  const win = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const kLo = Math.max(2, Math.floor((F_LO * N) / rate));
  const kHi = Math.min(N / 2 - 3, Math.ceil((F_HI * N) / rate));
  const kFund = Math.max(2, Math.floor((F_FUND * N) / rate));
  const pow = new Float64Array(kHi + 3);
  const pkHz = new Float64Array(MAX_PEAKS), pkAmp = new Float64Array(MAX_PEAKS);
  const frames = Math.max(1, Math.floor((data.length - N) / HOP) + 1);
  const fPeaks = []; // je Rahmen: Tonhöhen (MIDI, Bruchteile) und Beträge der Töne
  const fEnergy = new Float64Array(frames);
  const fTonal = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) {
    const s = f * HOP;
    for (let i = 0; i < N; i++) { const v = data[s + i]; re[i] = v === undefined ? 0 : v * win[i]; im[i] = 0; }
    fft(re, im);
    let sum = 0, logSum = 0, max = 0;
    for (let k = kFund - 2; k <= kHi + 2; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
    for (let k = kLo; k <= kHi; k++) { sum += pow[k]; logSum += Math.log(pow[k] + 1e-20); if (pow[k] > max) max = pow[k]; }
    const n = kHi - kLo + 1;
    fEnergy[f] = sum;
    const tones = { midi: [], amp: [] };
    fPeaks.push(tones);
    if (!(sum > 0)) continue;
    const flat = Math.exp(logSum / n) / (sum / n);
    fTonal[f] = flat < FLAT_TONAL ? 1 : 0;
    // Spitzen bis 40 dB unter der stärksten, Lage per Parabel (log. Betrag)
    const floor = max * 1e-4;
    let np = 0;
    for (let k = kFund; k <= kHi; k++) {
      const p = pow[k];
      if (p < floor || p <= pow[k - 1] || p < pow[k + 1] || p <= pow[k - 2] || p < pow[k + 2]) continue;
      const a = Math.log(pow[k - 1] + 1e-20), b = Math.log(p + 1e-20), c = Math.log(pow[k + 1] + 1e-20);
      const den = a - 2 * b + c;
      const d = den < 0 ? (0.5 * (a - c)) / den : 0;
      if (np < MAX_PEAKS) { pkHz[np] = ((k + d) * rate) / N; pkAmp[np] = Math.sqrt(p); np++; }
    }
    // Obertöne eines tieferen, stärkeren Tons (Quinte, Terz, Septime darüber) zählen nicht als eigene Töne –
    // sonst wäre jeder Einzelton ein Dur-Akkord
    for (let j = 0; j < np; j++) {
      const hz = pkHz[j];
      if (hz < F_LO) continue;
      let partial = false;
      for (let i = 0; i < j && !partial; i++) {
        if (pkAmp[i] <= pkAmp[j]) continue;
        const r = hz / pkHz[i];
        for (const h of PARTIALS) if (Math.abs(r / h - 1) < 0.012) { partial = true; break; }
      }
      if (partial) continue;
      tones.midi.push(69 + 12 * Math.log2(hz / 440));
      tones.amp.push(pkAmp[j]);
    }
  }
  // Stille Rahmen zählen nicht
  let eMax = 0;
  for (let f = 0; f < frames; f++) if (fEnergy[f] > eMax) eMax = fEnergy[f];
  const used = (f) => fEnergy[f] > eMax * 1e-4 && fTonal[f];
  // Stimmung: mittlere Abweichung vom Halbtonraster (Kreismittel), damit verstimmte Aufnahmen nicht zwischen die Töne fallen
  let cx = 0, cy = 0;
  for (let f = 0; f < frames; f++) {
    if (!used(f)) continue;
    const { midi, amp } = fPeaks[f];
    for (let j = 0; j < midi.length; j++) { const a = 2 * Math.PI * midi[j]; cx += amp[j] * Math.cos(a); cy += amp[j] * Math.sin(a); }
  }
  const tuning = Math.atan2(cy, cx) / (2 * Math.PI);
  // Gehaltene Töne: eine Spitze zählt so weit, wie sie im Nachbarrahmen fortbesteht (kleinerer Betrag) –
  // Abklingendes und Gleitendes (Bassdrum, Toms, Snare) fällt so weg. Ein einziger Rahmen zählt ganz.
  const near = (t, m) => {
    let best = 0;
    if (!t) return 0;
    for (let j = 0; j < t.midi.length; j++) if (Math.abs(t.midi[j] - m) < 0.2 && t.amp[j] > best) best = t.amp[j];
    return best;
  };
  const chroma = new Float64Array(12);
  let eAll = 0, eTon = 0, wAll = 0, wHeld = 0;
  for (let f = 0; f < frames; f++) {
    if (!(fEnergy[f] > eMax * 1e-4)) continue;
    eAll += fEnergy[f];
    if (!fTonal[f]) continue;
    eTon += fEnergy[f];
    const { midi, amp } = fPeaks[f];
    const prev = f > 0 && used(f - 1) ? fPeaks[f - 1] : null;
    const next = f + 1 < frames && used(f + 1) ? fPeaks[f + 1] : null;
    for (let j = 0; j < midi.length; j++) {
      const m = midi[j] - tuning;
      const pc = Math.round(m);
      const dev = Math.abs(m - pc);
      if (dev > 0.4) continue;
      const held = frames === 1 ? amp[j] : Math.min(amp[j], Math.max(near(prev, midi[j]), near(next, midi[j])));
      const w = 1 - (dev / 0.4) ** 2;
      wAll += amp[j] * w;
      wHeld += held * w;
      chroma[((pc % 12) + 12) % 12] += held * w;
    }
  }
  // Tonal = Pegel in Rahmen mit klaren Spitzen × Anteil gehaltener Töne daran
  const tonality = eAll > 0 && wAll > 0 ? (eTon / eAll) * (wHeld / wAll) : 0;
  return { chroma, tonality, tuning };
}

// chs: Kanäle (Float32Array[]), sampleRate in Hz
export function detectKey(chs, sampleRate) {
  const none = (extra) => ({ key: null, confidence: 0, ...extra });
  if (!chs?.length || !chs[0].length) return none({ tonality: 0, r: 0, margin: 0 });
  const { chroma, tonality } = chromaOf(toMono(chs), sampleRate);
  const scores = [];
  for (let t = 0; t < 12; t++) {
    scores.push({ tonic: t, minor: false, r: pearson(chroma, MAJOR, t) });
    scores.push({ tonic: t, minor: true, r: pearson(chroma, MINOR, t) });
  }
  scores.sort((a, b) => b.r - a.r);
  const [best, second] = scores;
  const margin = best.r - second.r;
  const info = { tonality, r: best.r, margin, chroma: Array.from(chroma) };
  if (tonality < MIN_TONALITY || best.r < MIN_R || margin < MIN_MARGIN) return none(info);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const confidence = clamp01(tonality) * clamp01((best.r - 0.5) / 0.4) * clamp01(margin / 0.15);
  return { key: keyCode(best.tonic, best.minor), confidence: Math.round(confidence * 100) / 100, ...info };
}
