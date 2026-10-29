// Tonhöhenerkennung (YIN, de Cheveigné & Kawahara 2002) und Umwandlung einer Tonhöhenspur in Noten.
// Arbeitet einstimmig: Gesang, gepfiffene oder gesummte Melodien, ein Lead-Instrument.

import { fft } from './fft.js';

const ANALYSIS_RATE = 11025;
const WIN = 512; // Analysefenster bei 11 kHz (46 ms): reicht bis ca. 50 Hz hinunter
export const FMIN = 70;
export const FMAX = 1000;

export const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);

// Tiefpass (gefenstertes Sinc) und Dezimierung auf etwa 11 kHz
function downsample(mono, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  if (factor === 1) return { data: mono, rate: sampleRate };
  const taps = 63;
  const fc = 0.45 / factor;
  const h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - (taps - 1) / 2;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    h[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const n = Math.floor(mono.length / factor);
  const out = new Float32Array(n);
  const half = (taps - 1) / 2;
  for (let k = 0; k < n; k++) {
    const c = k * factor;
    let acc = 0;
    for (let i = 0; i < taps; i++) {
      const j = c + i - half;
      if (j >= 0 && j < mono.length) acc += mono[j] * h[i];
    }
    out[k] = acc;
  }
  return { data: out, rate: sampleRate / factor };
}

export function toMono(chs) {
  if (chs.length === 1) return chs[0];
  const n = chs[0].length;
  const m = new Float32Array(n);
  for (const d of chs) for (let i = 0; i < n; i++) m[i] += d[i] / chs.length;
  return m;
}

// Tonhöhenspur: für jeden Rahmen Zeit (Mitte, s), Grundfrequenz (Hz, 0 = keine), Sicherheit (0…1) und Pegel (RMS)
export function detectPitch(mono, sampleRate, { fmin = FMIN, fmax = FMAX, threshold = 0.15 } = {}) {
  const { data, rate } = downsample(mono, sampleRate);
  const W = WIN;
  const N = 2 * W;
  const hop = data.length / rate > 30 ? 128 : 64;
  const tauMin = Math.max(2, Math.floor(rate / fmax));
  const tauMax = Math.min(W - 1, Math.ceil(rate / fmin));
  const frames = Math.max(0, Math.floor((data.length - N) / hop) + 1);
  const times = new Float32Array(frames);
  const f0 = new Float32Array(frames);
  const conf = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const ar = new Float64Array(N), ai = new Float64Array(N);
  const br = new Float64Array(N), bi = new Float64Array(N);
  const sq = new Float64Array(N + 1);
  const dn = new Float64Array(tauMax + 2);
  for (let f = 0; f < frames; f++) {
    const s = f * hop;
    times[f] = (s + W / 2) / rate;
    sq[0] = 0;
    for (let i = 0; i < N; i++) { const v = data[s + i]; sq[i + 1] = sq[i] + v * v; }
    const e1 = sq[W];
    rms[f] = Math.sqrt(e1 / W);
    if (e1 < 1e-10) continue;
    // Kreuzkorrelation r(τ) = Σ_{j<W} x_j · x_{j+τ} per FFT
    for (let i = 0; i < N; i++) { ar[i] = i < W ? data[s + i] : 0; ai[i] = 0; br[i] = data[s + i]; bi[i] = 0; }
    fft(ar, ai);
    fft(br, bi);
    for (let k = 0; k < N; k++) {
      const re = ar[k] * br[k] + ai[k] * bi[k];
      const im = ar[k] * bi[k] - ai[k] * br[k];
      ar[k] = re; ai[k] = im;
    }
    fft(ar, ai, true);
    // Differenzfunktion und kumulativ normierte Differenz
    let run = 0;
    dn[0] = 1;
    for (let t = 1; t <= tauMax + 1; t++) {
      const d = Math.max(0, e1 + (sq[t + W] - sq[t]) - 2 * ar[t]);
      run += d;
      dn[t] = run > 0 ? (d * t) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (dn[t] < threshold) {
        while (t + 1 <= tauMax && dn[t + 1] < dn[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      tau = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t++) if (dn[t] < dn[tau]) tau = t;
    }
    // Parabel durch die Nachbarn für Bruchteile eines Abtastwerts
    let better = tau;
    if (tau > 1 && tau < tauMax) {
      const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
      const den = a - 2 * b + c;
      if (den > 0) better = tau + (0.5 * (a - c)) / den;
    }
    conf[f] = Math.max(0, 1 - dn[tau]);
    f0[f] = rate / better;
  }
  return { times, f0, conf, rms, hop: hop / rate };
}

const median = (arr) => {
  const s = [...arr].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Tonleitern als Halbtonstufen über dem Grundton
export const SCALES = {
  major: { label: 'Dur', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Moll', steps: [0, 2, 3, 5, 7, 8, 10] },
  chromatic: { label: 'Chromatisch', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

// Nächster Ton der Tonleiter (root 0 = C … 11 = H) zu einer (gebrochenen) MIDI-Tonhöhe
export function snapToScale(midi, root = 9, scale = 'minor') {
  const steps = SCALES[scale]?.steps || SCALES.chromatic.steps;
  let best = Math.round(midi);
  let dist = Infinity;
  const base = Math.floor(midi) - 12;
  for (let m = base; m <= base + 24; m++) {
    if (!steps.includes((((m - root) % 12) + 12) % 12)) continue;
    const d = Math.abs(m - midi);
    if (d < dist) { dist = d; best = m; }
  }
  return best;
}

// Stimmhafte Abschnitte: sichere Tonhöhe und nicht zu leise
export function voicing(track, { minConf = 0.8, gateDb = -26 } = {}) {
  let max = 0;
  for (const v of track.rms) max = Math.max(max, v);
  const gate = max * Math.pow(10, gateDb / 20);
  return Array.from(track.f0, (f, i) => f >= FMIN && f <= FMAX && track.conf[i] >= minConf && track.rms[i] >= gate);
}

// Tonhöhenspur → Noten im Raster.
// bpm: Projekttempo; grid: Raster in Schlägen; fromFirst: erste Note auf Schlag 0 (sonst zählt Sekunde 0 als Schlag 0)
export function trackToNotes(track, { bpm = 120, grid = 0.25, fromFirst = true, key = null, minConf = 0.8, gateDb = -26, minNoteSec = 0.07 } = {}) {
  const voiced = voicing(track, { minConf, gateDb });
  const n = track.f0.length;
  const midi = Array.from(track.f0, (f, i) => (voiced[i] ? midiOf(f) : NaN));
  // Medianfilter über 5 Rahmen (nur stimmhafte), glättet Ausreißer und Oktavsprünge
  const smooth = midi.map((m, i) => {
    if (Number.isNaN(m)) return NaN;
    const win = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (!Number.isNaN(midi[k])) win.push(midi[k]);
    return median(win);
  });
  let rmsMax = 0;
  for (const v of track.rms) rmsMax = Math.max(rmsMax, v);

  // Abschnitte gleicher Tonhöhe mit Hysterese; neue Note bei Tonwechsel (3 Rahmen Abweichung) oder neuem Anschlag
  const segs = [];
  let cur = null;
  const close = (endFrame) => { if (cur) { cur.end = endFrame; segs.push(cur); cur = null; } };
  for (let i = 0; i < n; i++) {
    const m = smooth[i];
    if (Number.isNaN(m)) { close(i); continue; }
    const fresh = (start, vals, rmsVals) => ({ start, vals, ref: median(vals), pend: [], rms: rmsVals });
    if (!cur) { cur = fresh(i, [m], [track.rms[i]]); continue; }
    const recent = track.rms.slice(Math.max(cur.start, i - 8), i);
    const dip = recent.length >= 4 ? Math.min(...recent) : Infinity;
    const onset = track.rms[i] > dip * 1.8 && (i - cur.start) * track.hop > 0.12;
    if (onset) { close(i); cur = fresh(i, [m], [track.rms[i]]); continue; }
    if (Math.abs(m - cur.ref) < 0.6) {
      // Kurzer Ausreißer zählt nicht als neuer Ton
      cur.pend = [];
      cur.vals.push(m);
      cur.rms.push(track.rms[i]);
      cur.ref = median(cur.vals.slice(-12));
    } else {
      cur.pend.push({ m, r: track.rms[i] });
      if (cur.pend.length >= 3) {
        const p = cur.pend;
        close(i - p.length + 1);
        cur = fresh(i - p.length + 1, p.map((x) => x.m), p.map((x) => x.r));
      }
    }
  }
  close(n);

  const minFrames = Math.max(1, Math.round(minNoteSec / track.hop));
  const raw = segs.filter((s) => s.end - s.start >= minFrames && s.vals.length >= minFrames).map((s) => {
    const m = median(s.vals);
    return {
      t0: track.times[s.start] - track.hop / 2,
      t1: track.times[Math.min(n - 1, s.end - 1)] + track.hop / 2,
      pitch: key ? snapToScale(m, key.root, key.scale) : Math.round(m),
      level: Math.sqrt(s.rms.reduce((a, v) => a + v * v, 0) / s.rms.length),
    };
  });
  if (!raw.length) return { notes: [], beats: 0 };

  const spb = 60 / bpm;
  const origin = fromFirst ? raw[0].t0 : 0;
  const q = (b) => Math.round(b / grid) * grid;
  const notes = [];
  for (const r of raw) {
    const start = Math.max(0, q((r.t0 - origin) / spb));
    const end = Math.max(start + grid, q((r.t1 - origin) / spb));
    const prev = notes[notes.length - 1];
    if (prev && start <= prev.start) {
      // Gleicher Rasterplatz: der längere/lautere Ton gewinnt
      if (end - start > prev.len) Object.assign(prev, { pitch: r.pitch, len: end - start });
      continue;
    }
    if (prev && prev.start + prev.len > start) prev.len = start - prev.start;
    notes.push({ pitch: r.pitch, start, len: end - start, vel: Math.round(Math.min(1, 0.55 + 0.45 * (r.level / rmsMax)) * 100) / 100 });
  }
  const last = notes[notes.length - 1];
  return { notes, beats: last.start + last.len };
}

// Noten oktavweise in den Bereich [low, high] holen (Gesang liegt oft tiefer als die Piano-Roll-Mitte)
export function fitOctaves(notes, low, high) {
  if (!notes.length) return notes;
  const mid = median(notes.map((x) => x.pitch));
  let shift = 0;
  while (mid + shift < low + 12) shift += 12;
  while (mid + shift > high - 12) shift -= 12;
  return notes.map((x) => ({ ...x, pitch: Math.min(high, Math.max(low, x.pitch + shift)) }));
}
