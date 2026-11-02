// Werkstatt: rohe Aufnahme → spielbarer Klang. Reine Funktionen auf Float32Array-Kanälen (laufen auch im Worker/Node).
// Ablauf: Doppel-Mono erkennen, Trittschall weg (Hochpass), Stille vorn/hinten weg (Start auf dem Anschlag),
// Ränder weich, Pegel angleichen. Danach Merkmale messen und daraus Name und Etiketten ableiten.

import { fft, hann } from '../dsp/fft.js';
import { detectPitch } from '../dsp/pitch.js';

export const PEAK_TARGET = 0.89; // −1 dB
const PRE_ROLL = 0.002;          // so viel vor dem Anschlag behalten (s)
const FADE_IN = 0.001;
const FADE_OUT = 0.012;

// L und R praktisch gleich (Handy-Mikrofon)? Dann reicht ein Kanal – halbiert den Speicher.
export function isDoubleMono(chs) {
  if (chs.length < 2) return true;
  const [l, r] = chs;
  let diff = 0, sum = 0;
  for (let i = 0; i < l.length; i += 7) { diff += Math.abs(l[i] - r[i]); sum += Math.abs(l[i]); }
  return diff <= sum * 0.01 + 1e-9;
}

// Hochpass 2. Ordnung (Butterworth), nimmt auch Gleichanteil mit
export function highpass(d, sampleRate, freq = 45) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  const out = new Float32Array(d.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

// Pegel je Block (RMS) – Grundlage für Stille-Erkennung und Anschläge
export function blockRms(mono, block) {
  const n = Math.ceil(mono.length / block);
  const out = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let s = 0;
    const end = Math.min(mono.length, (b + 1) * block);
    for (let i = b * block; i < end; i++) s += mono[i] * mono[i];
    out[b] = Math.sqrt(s / Math.max(1, end - b * block));
  }
  return out;
}

const percentile = (arr, p) => {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

export function mixMono(chs) {
  if (chs.length === 1) return chs[0];
  const out = new Float32Array(chs[0].length);
  for (const d of chs) for (let i = 0; i < out.length; i++) out[i] += d[i] / chs.length;
  return out;
}

// Wo beginnt und endet der Klang? Schwelle relativ zum Grundrauschen und zur lautesten Stelle.
export function soundBounds(mono, sampleRate) {
  const block = Math.max(16, Math.round(sampleRate * 0.005));
  const rms = blockRms(mono, block);
  let peak = 0;
  for (let i = 0; i < mono.length; i++) { const v = Math.abs(mono[i]); if (v > peak) peak = v; }
  const floor = percentile(rms, 0.1);
  const loudest = rms.reduce((m, v) => Math.max(m, v), 0);
  // Mindestens −54 dBFS, 4× über dem Rauschen und höchstens 30 dB unter dem lautesten Block
  const thr = Math.max(0.002, floor * 4, loudest * 0.03);
  if (loudest < thr * 1.5 || peak < 0.004) return null;
  let a = 0;
  while (a < rms.length && rms[a] < thr) a++;
  let b = rms.length - 1;
  while (b > a && rms[b] < thr * 0.5) b--;
  // Anschlag genauer: erstes Sample im Startblock (oder kurz davor) über einem Viertel der Blockschwelle
  let start = Math.max(0, (a - 1) * block);
  const sThr = Math.max(thr * 0.7, peak * 0.02);
  const limit = Math.min(mono.length, (a + 1) * block);
  while (start < limit && Math.abs(mono[start]) < sThr) start++;
  start = Math.max(0, start - Math.round(PRE_ROLL * sampleRate));
  const end = Math.min(mono.length, (b + 1) * block + Math.round(0.03 * sampleRate));
  return { start, end, peak, floor };
}

function fadeEdges(d, sampleRate) {
  const fi = Math.min(d.length >> 2, Math.round(FADE_IN * sampleRate));
  const fo = Math.min(d.length >> 2, Math.round(FADE_OUT * sampleRate));
  for (let i = 0; i < fi; i++) d[i] *= i / fi;
  for (let i = 0; i < fo; i++) d[d.length - 1 - i] *= i / fo;
}

// Rohaufnahme säubern. Rückgabe: { chs, sampleRate, start, end } (Frames bezogen auf die Eingabe) oder null bei Stille.
export function cleanTake(chs, sampleRate, { maxSeconds = 4 } = {}) {
  const src = isDoubleMono(chs) ? [chs[0]] : chs;
  const filtered = src.map((d) => highpass(d, sampleRate));
  const bounds = soundBounds(mixMono(filtered), sampleRate);
  if (!bounds) return null;
  const end = Math.min(bounds.end, bounds.start + Math.round(maxSeconds * sampleRate));
  if (end - bounds.start < sampleRate * 0.01) return null;
  const out = filtered.map((d) => d.slice(bounds.start, end));
  let peak = 0;
  for (const d of out) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  const g = peak > 0 ? PEAK_TARGET / peak : 1;
  for (const d of out) { for (let i = 0; i < d.length; i++) d[i] *= g; fadeEdges(d, sampleRate); }
  return { chs: out, sampleRate, start: bounds.start, end };
}

// Merkmale: Länge, Helligkeit (spektraler Schwerpunkt im Anschlag), Tiefenanteil, Rauschanteil, Tonhöhe
export function features(mono, sampleRate) {
  const duration = mono.length / sampleRate;
  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  const w = hann(N);
  // Anschlag: ab dem Start, etwas Abstand, damit der Klick nicht alles bestimmt
  const off = Math.min(Math.max(0, mono.length - N), Math.round(sampleRate * 0.003));
  for (let i = 0; i < N; i++) re[i] = (mono[off + i] || 0) * w[i];
  fft(re, im);
  let num = 0, den = 0, low = 0;
  const binHz = sampleRate / N;
  for (let k = 1; k < N / 2; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    num += p * k * binHz;
    den += p;
    if (k * binHz < 220) low += p;
  }
  const centroid = den > 0 ? num / den : 0;
  const lowShare = den > 0 ? low / den : 0;
  let zc = 0;
  const zn = Math.min(mono.length, Math.round(sampleRate * 0.1));
  for (let i = 1; i < zn; i++) if ((mono[i - 1] < 0) !== (mono[i] < 0)) zc++;
  const zcr = zc / Math.max(1, zn) * sampleRate; // Nulldurchgänge pro Sekunde
  let pitch = null;
  if (duration > 0.18) {
    const { f0, conf, rms } = detectPitch(mono, sampleRate);
    let maxRms = 0;
    for (let i = 0; i < rms.length; i++) maxRms = Math.max(maxRms, rms[i]);
    const voiced = [];
    let loud = 0;
    for (let i = 0; i < f0.length; i++) {
      if (rms[i] < maxRms * 0.1) continue;
      loud++;
      if (conf[i] > 0.85) voiced.push(f0[i]);
    }
    if (loud > 3 && voiced.length / loud > 0.6) {
      voiced.sort((x, y) => x - y);
      // nur ein stehender Ton zählt (mittlere Hälfte innerhalb eines Halbtons), kein Kick-Abwärtsschwung
      const q1 = voiced[Math.floor(voiced.length * 0.25)], q3 = voiced[Math.floor(voiced.length * 0.75)];
      const mid = voiced[voiced.length >> 1];
      if (12 * Math.log2(q3 / q1) < 1 && mid >= 80) pitch = mid;
    }
  }
  return { duration, centroid, lowShare, zcr, pitch };
}

const NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
export const noteOf = (hz) => {
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

// Klasse: tief (Kick-artig), mittel (Snare/Klatschen), hell (Hi-Hat/„ts“), ton (hat eine Tonhöhe), lang (Geräusch)
export function classify(f) {
  if (f.pitch && f.duration > 0.18) return 'ton';
  if (f.duration > 1.6) return 'lang';
  if (f.lowShare > 0.45 || f.centroid < 450) return 'tief';
  if (f.centroid > 3800 || f.zcr > 5000) return 'hell';
  return 'mittel';
}

const BASE = { tief: 'Bumm', mittel: 'Klatsch', hell: 'Ts', lang: 'Klang' };

// Name und Etiketten (nur Vorschlag; Zähler macht Namen eindeutig)
export function describe(f, cls, taken = []) {
  const tags = [f.duration < 0.45 ? 'kurz' : 'lang'];
  if (cls === 'ton') tags.push('tonal', noteOf(f.pitch));
  else tags.push(cls === 'tief' ? 'tief' : cls === 'hell' ? 'hell' : cls === 'lang' ? 'geräusch' : 'mitte');
  if (cls !== 'ton' && f.zcr > 4000) tags.push('rauschen');
  const base = cls === 'ton' ? `Ton ${noteOf(f.pitch)}` : BASE[cls];
  let n = 1;
  const used = new Set(taken);
  while (used.has(`${base} ${n}`)) n++;
  return { name: `${base} ${n}`, tags };
}
