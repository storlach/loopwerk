// Time-Stretching nach WSOLA (Waveform Similarity Overlap-Add): ändert die Länge, nicht die Tonhöhe.
// Läuft offline auf Float32Arrays. Für Loops wird das Signal zyklisch fortgesetzt, damit die Naht sauber bleibt.
// Anschläge (ADR 001, Nachtrag W7): Um jeden erkannten Anschlag läuft die Zeit 1:1 – alle Fenster, die ihn enthalten,
// liegen deckungsgleich auf dem Sollzeitpunkt (Anschlag · Faktor). Gedehnt bzw. gestaucht wird nur dazwischen.

import { fft } from './fft.js';

const FRAME_SEC = 0.04;   // Fensterlänge
const TOL_SEC = 0.012;    // Suchbereich für die beste Überlappung
const STEP = 4;           // Unterabtastung bei der Ähnlichkeitssuche (Geschwindigkeit)
const TOL_IN_SEC = 0.002;  // Suchbereich in den 1:1-Bereichen um Anschläge

// Anschlagserkennung (Spektralfluss)
const FLUX_SEC = 0.023;   // FFT-Fenster (1024 bei 44,1 kHz), Schritt ein Viertel
const GAMMA = 20;         // Verdichtung log(1 + γ·|X|), bezogen auf die Spitze des Signals
const DELTA = 0.01;       // Fluss mindestens so weit über dem Mittel der ±50 ms …
const REL = 0.03;         // … und mindestens 3 % des größten Flusses
const PEAK_SEC = 0.02;    // Spitze muss die größte in ±20 ms sein
const MERGE_SEC = 0.012;  // dichter liegende Anschläge sind einer (Flam), der stärkere zählt
// Zeitkarte
const POST_SEC = 0.04;    // nach dem Anschlag über das halbe Fenster hinaus 1:1 (der laute Teil des Ausklangs)
const S_MIN = 0.3;        // Zwischenstücke höchstens auf das 0,3-Fache …
const S_MAX = 4;          // … bzw. das 4-Fache des mittleren Faktors

// Anschläge in x[a, b) (Indizes von x), aufsteigend. Log-Betragsspektrum, Zunahme gegenüber dem vorigen Fenster
// (Maximum über ±1 Bin, damit Vibrato nicht zählt). Feinlage: steilster Anstieg der 1-ms-Energie (breitbandig oder
// Höhen) im Bereich, den das Fenster neu überdeckt.
export function findOnsets(x, a, b, sr) {
  const F = 2 ** Math.round(Math.log2(FLUX_SEC * sr));
  const H = F / 4;
  const a0 = Math.max(0, a - 2 * F);
  const frames = Math.floor((Math.min(b + F + H, x.length) - a0 - F) / H);
  if (frames < 8) return [];
  let peak = 0;
  for (let i = a0; i < b; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-6) return [];
  const g = GAMMA / peak;
  const w = new Float64Array(F);
  for (let i = 0; i < F; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / F);
  const re = new Float64Array(F);
  const im = new Float64Array(F);
  let prev = new Float64Array(F / 2 + 1);
  let cur = new Float64Array(F / 2 + 1);
  const fl = new Float64Array(frames);
  for (let t = 0; t < frames; t++) {
    const s = a0 + t * H;
    for (let i = 0; i < F; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let sum = 0;
    for (let k = 1; k < F / 2; k++) {
      cur[k] = Math.log1p(g * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      if (t) {
        const p = Math.max(prev[k - 1], prev[k], prev[k + 1]);
        if (cur[k] > p) sum += cur[k] - p;
      }
    }
    fl[t] = sum / (F / 2);
    const tmp = prev; prev = cur; cur = tmp;
  }
  let mx = 0;
  for (let t = 0; t < frames; t++) mx = Math.max(mx, fl[t]);
  const Wn = Math.round((0.05 * sr) / H);
  const LM = Math.max(1, Math.round((PEAK_SEC * sr) / H));
  const merge = Math.round(MERGE_SEC * sr);
  const blk = Math.max(8, Math.round(sr / 1000));
  const en = (s, hf) => {
    let e = 0;
    for (let i = s; i < s + blk; i++) { const v = hf ? x[i] - x[i - 1] : x[i]; e += v * v; }
    return e;
  };
  const out = [];
  const vals = [];
  const rises = new Float64Array(Math.ceil((F + H) / blk) + 2);
  for (let t = 1; t < frames - 1; t++) {
    const v = fl[t];
    if (v < REL * mx) continue;
    let isMax = true;
    for (let j = Math.max(0, t - LM); j <= Math.min(frames - 1, t + LM) && isMax; j++) {
      if (j !== t && (fl[j] > v || (j > t && fl[j] === v))) isMax = false;
    }
    if (!isMax) continue;
    let m = 0;
    const j0 = Math.max(0, t - Wn);
    const j1 = Math.min(frames - 1, t + Wn);
    for (let j = j0; j <= j1; j++) m += fl[j];
    if (v < m / (j1 - j0 + 1) + DELTA) continue;
    const s0 = Math.max(a0 + t * H + F / 4, 6 * blk + 1);
    const s1 = Math.min(a0 + t * H + F + H, x.length) - 2 * blk;
    // Feinlage: Block mit dem steilsten Anstieg
    let nr = 0;
    let bestR = 0;
    for (let s = s0; s <= s1; s += blk, nr++) {
      let r = 0;
      for (let hf = 0; hf < 2; hf++) {
        const before = (en(s - 5 * blk, hf) + en(s - 4 * blk, hf) + en(s - 3 * blk, hf)) / 3;
        r = Math.max(r, (en(s, hf) + en(s + blk, hf)) / 2 / (before + 1e-12));
      }
      rises[nr] = r;
      if (r > bestR) bestR = r;
    }
    let o = s0;
    for (let k = 0; k < nr; k++) if (rises[k] >= bestR) { o = s0 + k * blk; break; }
    if (o < a || o >= b) continue;
    if (out.length && o - out[out.length - 1] < merge) {
      if (v > vals[vals.length - 1]) { out[out.length - 1] = o; vals[vals.length - 1] = v; }
      continue;
    }
    out.push(o);
    vals.push(v);
  }
  return out;
}

// Zeitkarte Eingang → Ausgang (in Frames, Original-Koordinaten): 1:1 um jeden Anschlag, dazwischen linear.
// Rückgabe { kx, ky, regions } mit Stützstellen und den 1:1-Bereichen [y0, y1, Anschlag x] im Ausgang.
function buildMap(onsets, inLen, outLen, N, tol, loop) {
  const R = outLen / inLen;
  const PRE = N / 2 + tol;
  const POST = N / 2 + Math.round((POST_SEC * N) / FRAME_SEC);
  const sMin = R * S_MIN;
  const sMax = R * S_MAX;
  const allow = (L) => Math.max(0, R < 1 ? ((R - sMin) * L) / (1 - sMin) : sMax > 1 ? ((sMax - R) * L) / (sMax - 1) : L);
  const n = onsets.length;
  const pre = new Float64Array(n).fill(PRE);
  const post = new Float64Array(n).fill(POST);
  const fit = (i, j, L, aSide, bSide) => {
    const p = (aSide ? post[i] : 0) + (bSide ? pre[j] : 0);
    const m = allow(L);
    if (p > m) {
      const f = m / p;
      if (aSide) post[i] *= f;
      if (bSide) pre[j] *= f;
    }
  };
  for (let i = 0; i + 1 < n; i++) fit(i, i + 1, onsets[i + 1] - onsets[i], true, true);
  let head = false;
  let tail = false;
  if (loop) fit(n - 1, 0, onsets[0] + inLen - onsets[n - 1], true, true);
  else {
    // One-Shot: Anfang und Ende als feste Punkte, außer ein Anschlag liegt zu nah daran
    head = onsets[0] >= PRE;
    tail = inLen - onsets[n - 1] >= POST;
    if (head) fit(0, 0, onsets[0], false, true);
    if (tail) fit(n - 1, 0, inLen - onsets[n - 1], true, false);
  }
  const kx = [];
  const ky = [];
  if (head) { kx.push(0); ky.push(0); }
  for (let i = 0; i < n; i++) {
    const o = onsets[i];
    kx.push(o - pre[i], o + post[i]);
    ky.push(R * o - pre[i], R * o + post[i]);
  }
  if (tail) { kx.push(inLen); ky.push(outLen); }
  if (loop) { kx.push(kx[0] + inLen); ky.push(ky[0] + outLen); }
  const regions = onsets.map((o, i) => [R * o - pre[i], R * o + post[i], o]);
  return { kx, ky, regions, R };
}

// channels: Float32Array[], ratio = Ausgabelänge / Eingabelänge, outLength: exakte Ziellänge in Frames
// transients: false rechnet das reine WSOLA ohne Anschlagsbehandlung (zum Vergleich).
export function timeStretch(channels, ratio, sampleRate, outLength, { loop = true, transients = true } = {}) {
  const inLen = channels[0].length;
  const N = Math.max(64, Math.round(FRAME_SEC * sampleRate)) & ~1;
  const Hs = N / 2;
  const Ha = Hs / ratio;
  const tol = Math.round(TOL_SEC * sampleRate);
  const pad = N + tol;

  // Eingang zyklisch (Loop) bzw. mit Stille (One-Shot) erweitern
  const ext = (d) => {
    const e = new Float32Array(inLen + 2 * pad + N);
    for (let i = 0; i < e.length; i++) {
      const j = i - pad;
      e[i] = loop ? d[((j % inLen) + inLen) % inLen] : (j >= 0 && j < inLen ? d[j] : 0);
    }
    return e;
  };
  const src = channels.map(ext);
  const mono = new Float32Array(src[0].length);
  for (const s of src) for (let i = 0; i < mono.length; i++) mono[i] += s[i] / src.length;

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const outPad = Math.ceil(pad * ratio) + N;
  const total = outLength + 2 * outPad;
  const out = channels.map(() => new Float32Array(total + N));
  const norm = new Float32Array(total + N);

  let prevIn = pad - Math.round(outPad / ratio) + 0; // Eingangsposition des vorherigen Fensters
  if (prevIn < 0) prevIn = 0;
  const startIn = prevIn;
  // Ausschnitt ab dem Punkt, der dem Eingangsanfang entspricht. Abbildung über die Fenstermitten:
  // Eingang x ↦ Ausgang (x − startIn − N/2) · ratio + N/2
  const offset = Math.round((pad - startIn) * ratio - (N / 2) * (ratio - 1));

  // Anschläge: Zeitkarte statt fester Schrittweite. Ohne Anschläge bleibt alles wie im reinen WSOLA.
  let map = null;
  if (transients && inLen > 4 * N && Math.abs(ratio - 1) > 1e-6) {
    // Loop: zyklisch erkennen (Vorlauf aus dem Ende), One-Shot: Stille davor zählt als Vorlauf
    const on = findOnsets(mono, pad, pad + inLen, sampleRate).map((i) => i - pad);
    if (on.length) map = buildMap(on, inLen, outLength, N, tol, loop);
  }
  // Ausgang y (Ergebnis-Koordinaten) → ideale Eingangsposition x (Original-Koordinaten)
  let seg = 0;
  let reg = 0;
  let regPeriod = 0;
  const invMap = (y) => {
    const { kx, ky, R } = map;
    let p = 0;
    if (loop) {
      const span = outLength;
      p = Math.floor((y - ky[0]) / span);
      y -= p * span;
    } else {
      if (y < ky[0]) return kx[0] + (y - ky[0]) / R;
      if (y >= ky[ky.length - 1]) return kx[kx.length - 1] + (y - ky[ky.length - 1]) / R;
    }
    if (seg >= ky.length - 1 || ky[seg] > y) seg = 0;
    while (seg < ky.length - 2 && ky[seg + 1] <= y) seg++;
    const dy = ky[seg + 1] - ky[seg];
    const x = dy > 0 ? kx[seg] + ((y - ky[seg]) * (kx[seg + 1] - kx[seg])) / dy : kx[seg];
    return x + p * inLen;
  };
  // Liegt die Fenstermitte y in einem 1:1-Bereich? Sonst: Anschläge davor/danach (Original-Koordinaten)
  const near = { inside: false, before: -Infinity, after: Infinity, nextY: Infinity };
  const tolIn = Math.round(TOL_IN_SEC * sampleRate);
  const locate = (y) => {
    const rs = map.regions;
    const n = rs.length;
    let p = 0;
    if (loop) { p = Math.floor((y - rs[0][0]) / outLength); y -= p * outLength; }
    if (p !== regPeriod || reg >= n || (reg > 0 && rs[reg - 1][1] > y)) { reg = 0; regPeriod = p; }
    while (reg < n && rs[reg][1] < y) reg++;
    // rs[reg] ist der erste Bereich, der nicht vor y endet
    const shift = p * inLen;
    near.inside = reg < n && rs[reg][0] <= y;
    near.nextY = (reg < n ? rs[reg][0] : loop ? rs[0][0] + outLength : Infinity) + p * outLength;
    if (loop) {
      near.before = (reg > 0 ? rs[reg - 1][2] : rs[n - 1][2] - inLen) + shift;
      near.after = (reg < n ? rs[reg][2] : rs[0][2] + inLen) + shift;
    } else {
      near.before = reg > 0 ? rs[reg - 1][2] : -Infinity;
      near.after = reg < n ? rs[reg][2] : Infinity;
    }
  };

  for (let outPos = 0, k = 0; outPos < total; outPos += Hs, k++) {
    let ideal;
    let lo = 0;
    let hi = mono.length - N;
    let search = k > 0;
    let tolK = tol;
    if (map) {
      const y = outPos + N / 2 - offset;
      ideal = invMap(y) + pad - N / 2;
      locate(y);
      if (near.inside) {
        // 1:1-Bereich: nur Feinsuche (±2 ms) um die Zeitkarte. Ab dem ersten Fenster ist die natürliche Fortsetzung
        // die beste Wahl – alle Fenster mit dem Anschlag folgen lückenlos aufeinander und liegen deckungsgleich
        tolK = tolIn;
      } else {
        // Suche nicht über einen Anschlag hinweg schieben; vor einem 1:1-Bereich enger werden, damit der Übergang ohne
        // Phasensprung (Delle vor dem Anschlag) gelingt
        lo = Math.max(lo, Math.ceil(near.before + pad));
        hi = Math.min(hi, Math.floor(near.after + pad - N));
        tolK = Math.min(tol, Math.round(tolIn + ((near.nextY - y) * tol) / N));
      }
    } else {
      ideal = startIn + k * Ha;
    }
    let best = Math.min(Math.max(0, Math.round(ideal)), mono.length - N);
    if (search) {
      // Normierte Ähnlichkeit mit der natürlichen Fortsetzung des vorherigen Fensters.
      // Bei Gleichstand (z. B. Stille) bleibt die ideale Position – sonst wandern Anschläge.
      const nat = prevIn + Hs;
      const score = (cand) => {
        let dot = 0;
        let en = 0;
        for (let i = 0; i < Hs; i += STEP) { const v = mono[cand + i]; dot += mono[nat + i] * v; en += v * v; }
        return dot / Math.sqrt(en + 1e-9);
      };
      const a = Math.max(lo, best - tolK);
      const b = Math.min(hi, best + tolK);
      if (map && a <= b) best = Math.min(Math.max(best, a), b);
      if (!map || a <= b) {
        let bestScore = score(best) + 1e-6;
        for (let cand = a; cand <= b; cand += 2) {
          const sc = score(cand);
          if (sc > bestScore) { bestScore = sc; best = cand; }
        }
      }
    }
    best = Math.min(Math.max(0, best), mono.length - N);
    for (let c = 0; c < src.length; c++) {
      const s = src[c];
      const o = out[c];
      for (let i = 0; i < N; i++) o[outPos + i] += s[best + i] * win[i];
    }
    for (let i = 0; i < N; i++) norm[outPos + i] += win[i];
    prevIn = best;
  }

  return out.map((o) => {
    const r = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const j = offset + i;
      r[i] = norm[j] > 1e-3 ? o[j] / norm[j] : 0;
    }
    return r;
  });
}

// Tonhöhe um `semis` Halbtöne verschieben, Länge bleibt: erst auf das 2^(semis/12)-fache dehnen (WSOLA),
// dann wieder auf die Ausgangslänge umtasten (kubisch, Catmull-Rom). Loops bleiben zyklisch.
export function pitchShift(channels, semis, sampleRate, { loop = true } = {}) {
  const len = channels[0].length;
  if (!semis || len < 2) return channels.map((d) => d.slice());
  const sLen = Math.max(2, Math.round(len * 2 ** (semis / 12)));
  const stretched = timeStretch(channels, sLen / len, sampleRate, sLen, { loop });
  const step = sLen / len;
  const at = (d, i) => (loop ? d[((i % sLen) + sLen) % sLen] : d[Math.min(sLen - 1, Math.max(0, i))]);
  return stretched.map((d) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = i * step;
      const k = Math.floor(x);
      const t = x - k;
      const p0 = at(d, k - 1), p1 = at(d, k), p2 = at(d, k + 1), p3 = at(d, k + 2);
      out[i] = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    }
    return out;
  });
}
