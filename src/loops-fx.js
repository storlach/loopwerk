// FX-One-Shots (eigene Klänge, CC0): Riser, Downlifter, Einschläge, Rückwärts-Klänge, Tape-Effekte, Geräusche.
// Gleiches Format wie LOOP_DEFS in samples.js. Die meisten Klänge werden sampleweise gerechnet (kit.pcm): Zeiten in
// Schlägen folgen dem Tempo, Ausklänge passen sich der verfügbaren Länge an, am Ende blendet jeder Klang aus.
// Geräusch-FX folgen der Tonart nicht; tonale FX (tonal: true) liegen auf A und werden in die Song-Tonart gerechnet
// (c.k = Frequenzfaktor, höchstens ± eine halbe Oktave, Länge bleibt). Rauschen mit festem Startwert.

import { mulberry32 } from './util.js';

const TAU = 2 * Math.PI;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const expAt = (a, b, x) => a * Math.pow(b / a, x);
const chans = (n) => [new Float32Array(n), new Float32Array(n)];
const panLR = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const noiseGen = (seed) => { const r = mulberry32(seed); return () => r() * 2 - 1; };

// Biquad nach RBJ; beim Wandern die Koeffizienten alle 32 Samples neu setzen
class Biq {
  constructor(sr) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; }
  set(type, f, q = 0.707) {
    const w = TAU * Math.min(Math.max(f, 10), this.sr * 0.45) / this.sr;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b1 = 1 - cs; b0 = b2 = b1 / 2; }
    else if (type === 'hp') { b1 = -(1 + cs); b0 = b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // Bandpass, 0 dB in der Mitte
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * cs / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// Bandbegrenzte Oszillatoren (PolyBLEP); dt = Frequenz / Abtastrate
const blep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
class Saw {
  constructor(p = 0) { this.p = p; }
  run(dt) {
    const v = 2 * this.p - 1 - blep(this.p, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}
class Pulse {
  constructor(w = 0.5, p = 0) { this.w = w; this.p = p; }
  run(dt) {
    let q = this.p + this.w;
    if (q >= 1) q -= 1;
    const v = (2 * this.p - blep(this.p, dt)) - (2 * q - blep(q, dt));
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}

// Sinus aus einer Tabelle (Phase 0…1, linear interpoliert) für viele Oszillatoren mit wandernder Frequenz
const SIN_N = 4096;
const SIN = Float32Array.from({ length: SIN_N + 1 }, (_, i) => Math.sin(TAU * i / SIN_N));
const sinT = (ph) => {
  const p = (ph - Math.floor(ph)) * SIN_N;
  const i = p | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (p - i);
};

const norm = (d, to = 1) => {
  let p = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
  if (p > 0) for (let i = 0; i < d.length; i++) d[i] *= to / p;
  return d;
};
const lerp = (d, pos) => {
  const i = Math.floor(pos);
  if (i < 0 || i >= d.length - 1) return 0;
  const f = pos - i;
  return d[i] + (d[i + 1] - d[i]) * f;
};
// Mono-Ebene mit Panorama zu Stereo addieren
const addPan = (out, d, gain = 1, pan = 0, at = 0) => {
  const [gl, gr] = panLR(pan);
  const n = Math.min(d.length, out[0].length - at);
  for (let i = 0; i < n; i++) { out[0][at + i] += d[i] * gain * gl; out[1][at + i] += d[i] * gain * gr; }
};

// Kosinus-Ausblendung von a bis b (Samples), danach still
function fadeOut(ch, a, b) {
  a = Math.max(0, Math.round(a));
  b = Math.max(a + 1, Math.round(b));
  for (const d of ch) for (let i = a; i < d.length; i++) d[i] *= i >= b ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (i - a) / (b - a));
}
// Gleichanteil entfernen (Hochpass 10 Hz)
function dcBlock(ch, sr) {
  const R = 1 - TAU * 10 / sr;
  for (const d of ch) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < d.length; i++) { const y = d[i] - x1 + R * y1; x1 = d[i]; y1 = y; d[i] = y; }
  }
}
// Kleiner Raum (Schroeder: sechs Kammfilter, drei Allpässe je Kanal, rechts versetzte Längen)
function room(ch, sr, { size = 0.82, damp = 0.35, wet = 0.3, dry = 1 } = {}) {
  const k = sr / 44100;
  ch.forEach((d, c) => {
    const sp = c ? 23 : 0;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((l) => ({ b: new Float32Array(Math.round((l + sp) * k)), i: 0, s: 0 }));
    const aps = [556, 441, 341].map((l) => ({ b: new Float32Array(Math.round((l + sp) * k)), i: 0 }));
    for (let n = 0; n < d.length; n++) {
      const x = d[n] * 0.03;
      let y = 0;
      for (let j = 0; j < 6; j++) {
        const cb = combs[j];
        const o = cb.b[cb.i];
        cb.s = o * (1 - damp) + cb.s * damp;
        cb.b[cb.i] = x + cb.s * size;
        if (++cb.i >= cb.b.length) cb.i = 0;
        y += o;
      }
      for (let j = 0; j < 3; j++) {
        const a = aps[j];
        const o = a.b[a.i];
        a.b[a.i] = y + o * 0.5;
        if (++a.i >= a.b.length) a.i = 0;
        y = o - y;
      }
      d[n] = d[n] * dry + y * wet;
    }
  });
}
// Echo (Ping-Pong: links rein, Wiederholungen wechseln die Seite), Wiederholungen gedämpft
function echo(ch, sr, delay, { fb = 0.4, wet = 0.3, tone = 0.35 } = {}) {
  const D = Math.max(1, Math.round(delay * sr));
  const bl = new Float32Array(D), br = new Float32Array(D);
  const [L, R] = ch;
  let i = 0, sl = 0, sr2 = 0;
  for (let n = 0; n < L.length; n++) {
    const ol = bl[i], or = br[i];
    sl += (ol - sl) * (1 - tone);
    sr2 += (or - sr2) * (1 - tone);
    bl[i] = (L[n] + R[n]) * 0.5 + sr2 * fb;
    br[i] = sl * fb;
    if (++i >= D) i = 0;
    L[n] += ol * wet;
    R[n] += or * wet;
  }
}
// Gedämpfte Sinus-Schwingung (Modalsynthese) rekursiv: y[n] = 2cos(w)·y[n-1] − y[n-2]
function mode(d, at, f, amp, tau, sr, attack = 0.0005) {
  const w = TAU * f / sr;
  if (w >= Math.PI) return;
  const c2 = 2 * Math.cos(w);
  const len = Math.min(d.length - at, Math.round(tau * 7 * sr));
  const dec = Math.exp(-1 / (tau * sr));
  const att = Math.max(1, attack * sr);
  let y1 = 0, y2 = -Math.sin(w), e = amp;
  for (let j = 0; j < len; j++) {
    const y = c2 * y1 - y2;
    y2 = y1; y1 = y;
    d[at + j] += y * e * (j < att ? j / att : 1);
    e *= dec;
  }
}

// ---------- Klänge ----------

// Rausch-Riser: Hochpass und Bandpass wandern nach oben, Pegel steigt; gate: Zerhacker wird immer schneller
function noiseRiser(c, { gate = false, tone = 0 } = {}) {
  const { n, sr, spb } = c;
  const out = chans(n);
  const bpb = spb * sr;
  const beats = n / bpb;
  const ramp = 0.003 * sr;
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 7919);
    const hp = new Biq(sr), top = new Biq(sr), bp = new Biq(sr), lp = new Biq(sr);
    const saw = new Saw(ch * 0.31);
    let g0 = 0, dt = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      if ((i & 31) === 0) {
        hp.set('hp', expAt(150, 4500, x));
        top.set('lp', expAt(1500, 18000, x));
        bp.set('bp', expAt(350, 9000, x), 2.2);
        g0 = Math.pow(10, -1.8 * (1 - x)); // −36 dB → 0 dB
        if (tone) { const f = expAt(55, 880, x); lp.set('lp', f * 5, 0.8); dt = f * (1 + ch * 0.004) / sr; }
      }
      const v = w();
      let s = top.run(hp.run(v)) * 0.5 + bp.run(v) * 1.4;
      if (tone) s += lp.run(saw.run(dt)) * tone;
      let g = g0;
      if (gate) {
        const b = i / bpb;
        const steps = b < beats * 0.5 ? 2 : b < beats * 0.75 ? 4 : b < beats * 0.875 ? 8 : 16;
        const stepLen = bpb / steps;
        const p = i % stepLen;
        g *= clamp01(Math.min(p / ramp, (stepLen * 0.6 - p) / ramp));
      }
      d[i] = s * g;
    }
  });
  fadeOut(out, n - c.S(0.02), n);
  return out;
}

// Ton-Riser: fünf verstimmte Sägezähne gleiten drei Oktaven hoch (A2 → A5), Vibrato wird schneller
function toneRiser(c) {
  const { n, sr } = c;
  const out = chans(n);
  const det = [-0.012, -0.006, 0, 0.006, 0.012];
  const vs = det.map((_, j) => ({ s: new Saw((j * 0.37) % 1), g: panLR([-0.8, -0.4, 0, 0.4, 0.8][j]) }));
  const sub = new Saw(0.5);
  const lpL = new Biq(sr), lpR = new Biq(sr);
  let lfo = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f0 = expAt(110, 880, x) * c.k;
    lfo += (3 + 7 * x) / sr;
    const vib = 1 + 0.007 * x * Math.sin(TAU * lfo);
    if ((i & 31) === 0) { const fc = Math.min(15000, f0 * (3 + 5 * x)); lpL.set('lp', fc, 1.1); lpR.set('lp', fc, 1.1); }
    let l = 0, r = 0;
    for (let j = 0; j < 5; j++) {
      const s = vs[j].s.run(f0 * (1 + det[j]) * vib / sr);
      l += s * vs[j].g[0];
      r += s * vs[j].g[1];
    }
    const sb = sub.run(f0 * 0.5 / sr) * 0.6;
    const g = Math.pow(10, -1.5 * (1 - x));
    out[0][i] = lpL.run(l + sb) * g;
    out[1][i] = lpR.run(r + sb) * g;
  }
  fadeOut(out, n - c.S(0.025), n);
  return out;
}

// Filter-Riser: Sägezahn-Fläche auf A durch resonanten Tiefpass, der sich öffnet
function filterRiser(c) {
  const { n, sr } = c;
  const out = chans(n);
  out.forEach((d, ch) => {
    const saws = [55, 110, 164.81, 220].map((f, j) => ({ s: new Saw((j * 0.29 + ch * 0.5) % 1), f: f * c.k * (1 + (ch ? 0.003 : -0.003) * (j + 1)) }));
    const lp = new Biq(sr);
    const w = noiseGen(c.seed + ch);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      if ((i & 31) === 0) lp.set('lp', expAt(120, 9000, Math.pow(x, 1.2)), 7);
      let s = 0.12 * w();
      for (const v of saws) s += v.s.run(v.f / sr) * 0.3;
      d[i] = lp.run(s) * Math.pow(10, -1.1 * (1 - x));
    }
  });
  fadeOut(out, n - c.S(0.025), n);
  return out;
}

// Endlos-Riser (Shepard-Ton): Oktavschichten steigen, die Hüllkurve über der Tonhöhe bleibt stehen
function shepard(c) {
  const { n, sr } = c;
  const out = chans(n);
  const K = 9;
  const phL = new Float64Array(K), phR = new Float64Array(K);
  const wk = new Float64Array(K);
  for (let k = 0; k < K; k++) { phL[k] = k * 0.13; phR[k] = k * 0.29; }
  let up = 1, g0 = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    if ((i & 31) === 0) {
      up = Math.pow(2, 1.5 * x);
      g0 = 0.3 + 0.7 * Math.pow(x, 1.5);
      for (let k = 0; k < K; k++) { const lp = k + 1.5 * x; wk[k] = Math.exp(-(((lp - 5) / 1.4) ** 2)); }
    }
    let l = 0, r = 0;
    for (let k = 0; k < K; k++) {
      const f = 27.5 * (1 << k) * up / sr;
      phL[k] += f; if (phL[k] >= 1) phL[k] -= 1;
      phR[k] += f * 1.004; if (phR[k] >= 1) phR[k] -= 1;
      l += wk[k] * sinT(phL[k]);
      r += wk[k] * sinT(phR[k]);
    }
    const g = g0 * clamp01(i / (0.01 * sr));
    out[0][i] = l * g;
    out[1][i] = r * g;
  }
  fadeOut(out, n - c.S(0.03), n);
  return out;
}

// Snare-Build: Wirbel über vier Takte (Viertel → Achtel → 16tel → 32stel → 64stel), wird lauter und höher,
// abwechselnd links/rechts; ab Takt 3 schwillt Rauschen darunter an
function snareBuild(c) {
  const { n, sr, B } = c;
  const out = chans(n);
  const hits = [];
  for (let b = 0; b < 4; b += 1) hits.push(b);
  for (let b = 4; b < 8; b += 0.5) hits.push(b);
  for (let b = 8; b < 12; b += 0.25) hits.push(b);
  for (let b = 12; b < 14; b += 0.125) hits.push(b);
  for (let b = 14; b < 15.8; b += 0.0625) hits.push(b);
  const w = noiseGen(c.seed);
  const len = Math.round(0.25 * sr);
  const kn = Math.exp(-1 / (0.045 * sr)), kt = Math.exp(-1 / (0.03 * sr));
  hits.forEach((b, h) => {
    const at = B(b), x = b / 16;
    const vel = 0.25 + 0.75 * (b / 15.8), tone = 180 + 140 * x;
    const [gl, gr] = panLR(h % 2 ? 0.15 : -0.15);
    // Teppich wird heller: Hoch- und Tiefpass wandern mit
    const hp = new Biq(sr).set('hp', expAt(500, 2200, x)), lp = new Biq(sr).set('lp', expAt(2500, 16000, x));
    let ph = 0, en = 0.85 * vel, et = 0.5 * vel * (1 - 0.6 * x);
    for (let j = 0; j < len && at + j < n; j++) {
      const t = j / sr;
      ph += tone * (1 - 0.25 * Math.min(1, t / 0.08)) / sr;
      const v = (lp.run(hp.run(w())) * en + sinT(ph) * et) * clamp01(t / 0.0005);
      en *= kn; et *= kt;
      out[0][at + j] += v * gl;
      out[1][at + j] += v * gr;
    }
  });
  const from = B(8);
  out.forEach((d, ch) => {
    const wn = noiseGen(c.seed + 9 + ch);
    const bp = new Biq(sr);
    let g = 0;
    for (let i = from; i < n; i++) {
      if (((i - from) & 31) === 0) { const u = (i - from) / (n - from); bp.set('bp', expAt(250, 10000, u), 3); g = 0.6 * Math.pow(10, -1.6 * (1 - u)); }
      d[i] += bp.run(wn()) * g;
    }
  });
  room(out, sr, { size: 0.5, wet: 0.3 });
  fadeOut(out, n - c.S(0.02), n);
  return out;
}

// Downlifter kurz: Rauschen, Filter schließen sich, Pegel fällt, dazu ein fallender Sägezahn
function downNoise(c) {
  const { n, sr } = c;
  const out = chans(n);
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 17);
    const lp = new Biq(sr), bp = new Biq(sr), tl = new Biq(sr).set('lp', 2500, 0.7);
    const saw = new Saw(ch * 0.5);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      if ((i & 31) === 0) { lp.set('lp', expAt(14000, 250, x), 1.2); bp.set('bp', expAt(6000, 220, x), 4); }
      const v = w();
      const s = lp.run(v) * 0.7 + bp.run(v) * 1.6 + tl.run(saw.run(expAt(880, 55, x) / sr)) * 0.15;
      d[i] = s * clamp01(i / (0.003 * sr)) * Math.pow(10, -2.2 * x);
    }
  });
  room(out, sr, { size: 0.75, wet: 0.5 });
  fadeOut(out, n - c.S(0.06), n);
  return out;
}

// Abwärts-Gleiter: verstimmte Sägezähne fallen fünf Oktaven, Tiefpass schließt mit, Ping-Pong-Echo
function glider(c) {
  const { n, sr, spb } = c;
  const out = chans(n);
  const det = [-0.01, 0, 0.01];
  const vs = det.map((_, j) => ({ s: new Saw(j * 0.33), g: panLR([-0.6, 0, 0.6][j]) }));
  const lpL = new Biq(sr), lpR = new Biq(sr);
  const span = n * 0.75;
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, i / span);
    const f = expAt(1760, 55, u);
    if ((i & 31) === 0) { lpL.set('lp', f * 4 + 200, 1.4); lpR.set('lp', f * 4 + 200, 1.4); }
    let l = 0, r = 0;
    for (let j = 0; j < 3; j++) { const s = vs[j].s.run(f * (1 + det[j]) / sr); l += s * vs[j].g[0]; r += s * vs[j].g[1]; }
    const g = clamp01(i / (0.004 * sr)) * Math.pow(10, -2 * u) * (i < span ? 1 : Math.max(0, 1 - (i - span) / (0.05 * sr)));
    out[0][i] = lpL.run(l) * g;
    out[1][i] = lpR.run(r) * g;
  }
  echo(out, sr, 0.75 * spb, { fb: 0.3, wet: 0.3 });
  fadeOut(out, n - c.B(0.75), n);
  return out;
}

// Donnerschlag: zwei Risse, dann tiefes Grollen mit unregelmäßigem Pegel, im Raum
function thunder(c) {
  const { n, sr } = c;
  const out = chans(n);
  const L = Math.min(c.T * 0.8, 4.5);
  const tau = L / 4.5;
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 31);
    const r = mulberry32(c.seed + 99 + ch);
    const mods = [0, 1, 2].map(() => [0.7 + r() * 3.5, r() * TAU]);
    const crackHp = new Biq(sr).set('hp', 1800);
    const lp1 = new Biq(sr).set('lp', 260), lp2 = new Biq(sr).set('lp', 260);
    const mid = new Biq(sr).set('bp', 700, 0.8);
    const crack = new Float32Array(n), rumble = new Float32Array(n), grit = new Float32Array(n);
    let brown = 0, env = 0;
    const crackEnd = Math.round(0.3 * sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const v = w();
      if (i < crackEnd) {
        const ck = Math.exp(-t / 0.014) + 0.6 * (t > 0.11 ? Math.exp(-(t - 0.11) / 0.02) : 0);
        crack[i] = crackHp.run(v) * ck * clamp01(t / 0.0005);
      }
      brown = brown * 0.985 + v * 0.15;
      if ((i & 31) === 0) {
        let m = 0;
        for (const [f, p] of mods) m += Math.sin(TAU * f * t + p);
        env = (1 - Math.exp(-t / 0.06)) * Math.exp(-t / tau) * (0.55 + 0.15 * m);
      }
      rumble[i] = lp2.run(lp1.run(brown)) * env;
      grit[i] = mid.run(v) * env;
    }
    norm(crack); norm(rumble); norm(grit);
    for (let i = 0; i < n; i++) d[i] = crack[i] * 0.55 + rumble[i] + grit[i] * 0.12;
  });
  room(out, sr, { size: 0.86, damp: 0.5, wet: 0.6 });
  fadeOut(out, n - c.S(Math.min(0.8, c.T * 0.2)), n);
  return out;
}

// Rückwärts-Crash: Becken (Rauschen + metallische Rechtecke) rückwärts, Spitze kurz vor dem Ende
function reverseCrash(c) {
  const { n, sr } = c;
  const out = chans(n);
  const m = n - c.S(0.03);
  const tau = (m / sr) / 4.2;
  const MET = [205.3, 304.4, 369.6, 522.7, 540, 800, 1077];
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 13);
    const hp = new Biq(sr).set('hp', 3200), hp2 = new Biq(sr).set('hp', 5000), lp = new Biq(sr);
    const ph = MET.map((_, j) => (j * 0.17 + ch * 0.5) % 1);
    const fwd = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      if ((i & 31) === 0) lp.set('lp', 16000 - 9000 * Math.min(1, t / (tau * 3)));
      let met = 0;
      for (let j = 0; j < MET.length; j++) { ph[j] += MET[j] * (1 + ch * 0.002) / sr; if (ph[j] >= 1) ph[j] -= 1; met += ph[j] < 0.5 ? 1 : -1; }
      fwd[i] = lp.run(hp.run(w()) * 0.9 + hp2.run(met / MET.length) * 0.6) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0007));
    }
    for (let i = 0; i < m; i++) d[i] = fwd[m - 1 - i];
  });
  fadeOut(out, m - c.S(0.012), m);
  return out;
}

// Rückwärts-Hall: Snare mit langer Hallfahne, umgedreht – schwillt an und bricht vor dem Ende ab
function reverseReverb(c) {
  const { n, sr } = c;
  const out = chans(n);
  const m = n - c.S(0.03);
  const tau = (m / sr) / 5.5;
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 41);
    const sw = noiseGen(c.seed + 7);
    const shp = new Biq(sr).set('hp', 1200), hp = new Biq(sr).set('hp', 350), lp = new Biq(sr);
    const fwd = new Float32Array(m);
    let ph = 0;
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      if ((i & 31) === 0) lp.set('lp', expAt(6000, 1200, Math.min(1, t / (tau * 4))));
      ph += (160 + 40 * Math.exp(-t / 0.03)) / sr;
      const snare = t < 0.4 ? shp.run(sw()) * Math.exp(-t / 0.05) * 0.7 + Math.sin(TAU * ph) * Math.exp(-t / 0.035) * 0.6 : 0;
      const tail = lp.run(hp.run(w())) * (1 - Math.exp(-t / 0.015)) * Math.exp(-t / tau) * 0.5;
      fwd[i] = (snare + tail) * clamp01(t / 0.0005);
    }
    for (let i = 0; i < m; i++) d[i] = fwd[m - 1 - i];
  });
  fadeOut(out, m - c.S(0.01), m);
  return out;
}

// Vorbeiflug: Rauschen fliegt von links nach rechts vorbei, Tonhöhe fällt (Doppler)
function flyby(c) {
  const { n, sr, spb } = c;
  const out = chans(n);
  const tc = 1.5 * spb, sig = 0.45 * spb;
  const w = noiseGen(c.seed);
  const bp = new Biq(sr), lp = new Biq(sr).set('lp', 250);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = (t - tc) / sig;
    if ((i & 31) === 0) bp.set('bp', 900 * Math.pow(2, -Math.tanh(u * 1.2)), 1.8);
    const v = w();
    const s = (bp.run(v) * 1.2 + lp.run(v) * 0.6) * Math.exp(-0.5 * u * u);
    const [gl, gr] = panLR(0.9 * Math.tanh(u));
    out[0][i] = s * gl;
    out[1][i] = s * gr;
  }
  fadeOut(out, n - c.S(0.02), n);
  return out;
}

// Power-Up: 8-Bit-Puls läuft die A-Moll-Pentatonik hoch, Schlusston mit Vibrato, Echo
function powerUp(c) {
  const { n, sr, spb } = c;
  const out = chans(n);
  const NOTES = [440, 523.25, 587.33, 659.26, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760].map((f) => f * c.k);
  const step = 0.125 * spb * sr;
  const arpEnd = NOTES.length * step;
  const p = new Pulse(0.25);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i / step);
    const t = (i - arpEnd) / sr;
    const f = idx < NOTES.length ? NOTES[idx] : NOTES[NOTES.length - 1] * (1 + 0.012 * Math.sin(TAU * 6 * t));
    const env = idx < NOTES.length ? 0.8 : 0.8 * Math.exp(-t / 0.25);
    d[i] = p.run(f / sr) * env * clamp01(i / (0.002 * sr));
  }
  addPan(out, d);
  echo(out, sr, 0.375 * spb, { fb: 0.38, wet: 0.35 });
  fadeOut(out, n - c.B(0.4), n);
  return out;
}

// „Aah“: Pulswelle durch drei Formanten (Quelle für Glitch und Scratch)
function vowel(c, sec, f0, fall = 0) {
  const { sr } = c;
  const m = Math.round(sec * sr);
  const src = new Float32Array(m);
  const p = new Pulse(0.3);
  const f1 = new Biq(sr).set('bp', 750, 5), f2 = new Biq(sr).set('bp', 1150, 6), f3 = new Biq(sr).set('bp', 2600, 8);
  const w = noiseGen(c.seed + 3);
  for (let i = 0; i < m; i++) {
    const t = i / sr;
    const s = p.run(f0 * (1 - fall * t / sec) / sr) + 0.15 * w();
    src[i] = (f1.run(s) + f2.run(s) * 0.6 + f3.run(s) * 0.35) * (1 - Math.exp(-t / 0.004)) * Math.min(1, (sec - t) / 0.08);
  }
  return norm(src);
}

// Glitch-Stotterer: ein „Aah“ wird zerhackt, immer kürzer wiederholt, hochgepitcht, zerbröselt und rückwärts gespielt
function glitch(c) {
  const { n, sr, B } = c;
  const out = chans(n);
  const src = vowel(c, 0.55, 220);
  const m = src.length;
  const ev = [];
  let b = 0;
  const add = (len, rate = 1, pan = 0, crush = 0, rev = false) => { ev.push([b, len, rate, pan, crush, rev]); b += len; };
  add(0.5);
  add(0.125, 1, -0.3); add(0.125, 1, 0.3);
  for (let k = 0; k < 4; k++) add(1 / 16, 1, k % 2 ? 0.5 : -0.5);
  for (let k = 0; k < 8; k++) add(1 / 32, 1, 0, k >= 4 ? 1 : 0);
  for (let k = 0; k < 4; k++) add(1 / 16, k % 2 ? 2 : 1.5, k % 2 ? -0.6 : 0.6, 1);
  b += 0.125;
  add(0.25, 1, 0, 0, true);
  b = Math.max(b, 2.25);
  const r = mulberry32(c.seed + 5);
  while (b < 3.3) {
    add(r() < 0.5 ? 1 / 32 : 1 / 16, [0.5, 1, 2, 3][Math.floor(r() * 4)], r() * 1.6 - 0.8, r() < 0.5 ? 1 : 0);
    if (r() < 0.35) b += 1 / 16;
  }
  const ramp = 0.0015 * sr;
  for (const [b0, len, rate, pan, crush, rev] of ev) {
    const s0 = B(b0), L = B(len);
    const [gl, gr] = panLR(pan);
    let hold = 0;
    for (let j = 0; j < L && s0 + j < n; j++) {
      const pos = (rev ? L - 1 - j : j) * rate;
      let v = pos < m - 1 ? lerp(src, pos) : 0;
      if (crush) { if (j % 6 === 0) hold = Math.round(v * 6) / 6; v = hold; }
      v *= clamp01(Math.min(j / ramp, (L - 1 - j) / ramp));
      out[0][s0 + j] += v * gl;
      out[1][s0 + j] += v * gr;
    }
  }
  fadeOut(out, n - c.S(0.01), n);
  return out;
}

// Band mit veränderlicher Geschwindigkeit: Kick je Band-Schlag und Quint-Fläche auf A. rateAt(Schlag) → Faktor
// (negativ = rückwärts); start = Bandposition in Schlägen. Tonhöhe und Helligkeit folgen der Geschwindigkeit.
function tape(c, rateAt, { start = 0, kicks = true } = {}) {
  const { n, sr, spb } = c;
  const out = chans(n);
  const bpb = spb * sr;
  const kl = Math.round(0.35 * sr);
  const kick = new Float32Array(kl);
  let ph = 0;
  for (let i = 0; i < kl; i++) {
    const t = i / sr;
    ph += (48 + 110 * Math.exp(-t / 0.035)) / sr;
    kick[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.12) * (1 - Math.exp(-t / 0.0008));
  }
  const FREQ = [55, 110, 164.81, 220].map((f) => f * c.k);
  out.forEach((d, ch) => {
    const saws = FREQ.map((f, j) => ({ s: new Saw((j * 0.23 + ch * 0.5) % 1), f: f * (1 + (ch ? 0.004 : -0.004)) }));
    const lp = new Biq(sr);
    let pos = start * bpb;
    for (let i = 0; i < n; i++) {
      const rate = rateAt(i / bpb);
      const ar = Math.abs(rate);
      pos += rate;
      if ((i & 31) === 0) lp.set('lp', 200 + 9000 * Math.min(1, ar), 0.8);
      let s = 0;
      if (kicks) {
        const k = Math.floor(pos / bpb);
        s += lerp(kick, pos - k * bpb) * 0.9;
      }
      if (ar > 1e-4) for (const v of saws) s += v.s.run(Math.min(0.45, v.f * ar / sr)) * 0.1;
      d[i] = lp.run(s) * Math.min(1, ar / 0.12);
    }
  });
  return out;
}
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));

// Tape-Stopp: ein Schlag normal, dann bremst das Band in 2,5 Schlägen bis zum Stillstand
function tapeStop(c) {
  const out = tape(c, (b) => (b < 1 ? 1 : b < 3.5 ? (1 - (b - 1) / 2.5) ** 2 : 0));
  fadeOut(out, c.n - c.S(0.01), c.n);
  return out;
}
// Tape-Anlauf: Band läuft aus dem Stand an; ab Schlag 3 im Tempo (Kick genau auf Schlag 3)
function tapeStart(c) {
  const rate = (b) => (b < 2.5 ? (b / 2.5) ** 1.8 : 1);
  let pos = 0;
  const upTo = c.B(3);
  for (let i = 0; i < upTo; i++) pos += rate(i / (c.spb * c.sr));
  const offset = Math.ceil(pos / (c.spb * c.sr)) - pos / (c.spb * c.sr);
  const out = tape(c, rate, { start: offset });
  fadeOut(out, c.n - c.B(0.15), c.n);
  return out;
}
// Rückspulen: Band wird angehalten, läuft rückwärts immer schneller (hohes Quietschen), dann Stopp
function rewind(c) {
  const out = tape(c, (b) => (b < 0.25 ? 1 - 2 * ease(b / 0.25) : b < 2.5 ? -expAt(1, 5, (b - 0.25) / 2.25) : b < 3 ? -5 * (1 - ease((b - 2.5) / 0.5)) : 0));
  fadeOut(out, c.n - c.S(0.01), c.n);
  return out;
}

// Scratch: „Aah“ von der Platte, vor und zurück gezogen; im zweiten Teil mit Fader-Schnitten (Transformer)
function scratch(c) {
  const { n, sr, B, spb } = c;
  const out = chans(n);
  const src = vowel(c, 0.6, 150, 0.25);
  const STROKES = [ // [Schlag, Länge, von (s), bis (s), Fader-Schnitte]
    [0, 0.25, 0, 0.22, 0], [0.25, 0.25, 0.22, 0, 0],
    [0.5, 0.125, 0, 0.12, 0], [0.625, 0.125, 0.12, 0, 0],
    [0.75, 0.25, 0, 0.25, 0], [1, 0.25, 0.25, 0.02, 0],
    [1.5, 0.5, 0, 0.4, 4], [2, 0.5, 0.4, 0, 4],
    [3, 0.125, 0, 0.18, 0], [3.125, 0.125, 0.18, 0, 0], [3.25, 0.125, 0, 0.18, 0], [3.375, 0.375, 0.18, 0, 0],
  ];
  const d = new Float32Array(n);
  const ramp = 0.0012 * sr;
  for (const [b0, len, from, to, cuts] of STROKES) {
    const s0 = B(b0), L = B(len);
    const sec = len * spb;
    for (let j = 0; j < L && s0 + j < n; j++) {
      const u = j / L;
      const pos = from + (to - from) * ease(u);
      const vel = Math.abs((to - from) * 0.5 * Math.PI * Math.sin(Math.PI * u) / sec);
      let g = Math.min(1, vel * 1.5) * clamp01(Math.min(j / ramp, (L - 1 - j) / ramp));
      if (cuts) {
        const ch = L / (2 * cuts);
        const q = j % (2 * ch);
        g *= q < ch ? clamp01(Math.min(q / ramp, (ch - q) / ramp)) : 0;
      }
      d[s0 + j] += lerp(src, pos * sr) * g;
    }
  }
  const hp = new Biq(sr).set('hp', 120);
  const hiss = new Biq(sr).set('bp', 4000, 0.6);
  const w = noiseGen(c.seed + 1);
  const end = B(3.8);
  for (let i = 0; i < n; i++) d[i] = hp.run(d[i]) + (i < end ? hiss.run(w()) * 0.03 * clamp01(i / (0.01 * sr)) * clamp01((end - i) / (0.02 * sr)) : 0);
  addPan(out, d);
  fadeOut(out, n - c.S(0.01), n);
  return out;
}

// Rausch-Stoß: kurzer Schwall weißes Rauschen, Tiefpass schließt schnell, kleiner Raum
function noiseBurst(c) {
  const { n, sr } = c;
  const out = chans(n);
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 23);
    const lp = new Biq(sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) lp.set('lp', expAt(16000, 600, Math.min(1, t / 0.35)), 0.9);
      d[i] = lp.run(w()) * clamp01(t / 0.002) * Math.exp(-t / 0.12);
    }
  });
  room(out, sr, { size: 0.6, wet: 0.5 });
  fadeOut(out, n - c.S(Math.min(0.3, c.T * 0.2)), n);
  return out;
}

// Jet-Sweep: Rauschen durch einen Flanger mit starker Rückkopplung, Kerben wandern runter und wieder hoch
function jet(c) {
  const { n, sr } = c;
  const out = chans(n);
  const dmin = 0.0004 * sr, dmax = 0.0075 * sr;
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch * 3);
    const lp = new Biq(sr).set('lp', 9000);
    const size = Math.ceil(dmin + dmax) + 4;
    const buf = new Float32Array(size);
    let wi = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const D = dmin + dmax * (0.5 - 0.5 * Math.cos(TAU * x + ch * 0.7));
      let rp = wi - D;
      if (rp < 0) rp += size;
      const i0 = Math.floor(rp), f = rp - i0;
      const del = buf[i0] + (buf[(i0 + 1) % size] - buf[i0]) * f;
      const y = lp.run(w()) + 0.8 * del;
      buf[wi] = y;
      if (++wi >= size) wi = 0;
      d[i] = y * Math.pow(Math.sin(Math.PI * x), 1.2);
    }
  });
  fadeOut(out, n - c.S(0.02), n);
  return out;
}

// Funkeln: kurze glockige Pings in der hohen A-Moll-Pentatonik, nach oben laufend, mit Echo und Raum
function sparkle(c) {
  const { n, sr, B } = c;
  const out = chans(n);
  const PENTA = [1760, 2093, 2349.3, 2637, 3136, 3520, 4186].map((f) => f * c.k);
  const r = mulberry32(c.seed);
  const N = 24;
  for (let k = 0; k < N; k++) {
    const u = k / N;
    const at = B(Math.max(0, 2.4 * (u + (r() - 0.5) / N)));
    const f = PENTA[Math.min(PENTA.length - 1, Math.floor(u * 5 + r() * 2.5))];
    const amp = 0.5 + 0.5 * r(), tau = 0.05 + 0.12 * r();
    const d = new Float32Array(n - at);
    mode(d, 0, f, amp, tau, sr, 0.001);
    mode(d, 0, f * 2.76, amp * 0.25, tau / 2, sr, 0.001);
    addPan(out, d, 1, r() * 1.8 - 0.9, at);
  }
  echo(out, sr, 0.375 * c.spb, { fb: 0.45, wet: 0.4 });
  room(out, sr, { size: 0.8, wet: 0.5 });
  fadeOut(out, n - B(0.6), n);
  return out;
}

// Dub-Sirene: Rechteck, dessen Tonhöhe ein Dreieck-LFO wobbeln lässt (immer schneller), langes Ping-Pong-Echo
function siren(c) {
  const { n, sr, spb, B } = c;
  const out = chans(n);
  const end = Math.min(n, B(5));
  const p = new Pulse(0.5);
  const lp = new Biq(sr).set('lp', 2800, 1);
  const d = new Float32Array(n);
  let lfo = 0;
  for (let i = 0; i < end; i++) {
    const b = i / (spb * sr);
    const base = b < 3 ? expAt(480, 720, b / 3) : 720;
    lfo += (2 + 0.8 * b) / (spb * sr);
    const fr = lfo - Math.floor(lfo);
    const tri = 1 - 4 * Math.abs(fr - 0.5);
    const f = base * (1 + 0.3 * tri);
    d[i] = lp.run(p.run(f / sr) * 0.6) * clamp01(i / (0.005 * sr)) * clamp01((end - i) / (0.02 * sr));
  }
  addPan(out, d);
  echo(out, sr, 0.75 * spb, { fb: 0.5, wet: 0.5, tone: 0.4 });
  fadeOut(out, n - B(1.2), n);
  return out;
}

// Wassertropfen: kurze Sinus-Blasen, deren Ton schnell steigt, in einer Tropfsteinhöhle
function drops(c) {
  const { n, sr, B } = c;
  const out = chans(n);
  const DROPS = [[0, 480, 1, -0.3], [0.5, 720, 0.7, 0.45], [1.25, 600, 0.85, 0.1], [2, 860, 0.6, -0.5], [2.375, 1020, 0.4, 0.6]];
  for (const [b, f0, amp, pan] of DROPS) {
    const len = Math.round(0.2 * sr);
    const d = new Float32Array(len);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / sr;
      ph += f0 * (1 + 1.5 * (1 - Math.exp(-t / 0.012))) / sr;
      d[j] = Math.sin(TAU * ph) * (1 - Math.exp(-t / 0.001)) * Math.exp(-t / 0.03) * amp;
    }
    addPan(out, d, 1, pan, B(b));
  }
  room(out, sr, { size: 0.88, damp: 0.25, wet: 0.9 });
  fadeOut(out, n - B(0.5), n);
  return out;
}

// Glas-Ping: zwei Gläser stoßen an (Modalsynthese, leicht verstimmt zwischen links und rechts)
function glass(c) {
  const { n, sr, B } = c;
  const out = chans(n);
  const MODES = [[1, 1, 1], [2.71, 0.45, 0.5], [5.13, 0.25, 0.28], [8.27, 0.12, 0.16]]; // [Verhältnis, Pegel, Ausklang]
  const tau0 = Math.max(0.2, Math.min(1.4, (c.T - c.spb) / 6));
  const HITS = [[0, 1, 1318.5], [0.75, 0.65, 1342.2], [1, 0.25, 1342.2]];
  out.forEach((d, ch) => {
    const w = noiseGen(c.seed + ch);
    for (const [b, vel, f0] of HITS) {
      const at = B(b);
      for (const [ratio, amp, tf] of MODES) mode(d, at, f0 * ratio * (1 + (ch ? 0.0006 : -0.0006)), amp * vel, tau0 * tf, sr);
      const hp = new Biq(sr).set('hp', 5000);
      for (let j = 0; j < 0.02 * sr; j++) d[at + j] += hp.run(w()) * Math.exp(-j / (0.002 * sr)) * clamp01(j / (0.0003 * sr)) * 0.25 * vel;
    }
  });
  room(out, sr, { size: 0.7, wet: 0.4 });
  fadeOut(out, n - c.S(Math.min(0.3, c.T * 0.15)), n);
  return out;
}

// Anschwellen: Fläche auf A (Quinte, None) mit Luft, Tiefpass öffnet bis Takt 3, dann klingt sie aus
function swellPad(c) {
  const { n, sr } = c;
  const out = chans(n);
  const FREQ = [110, 164.81, 220, 246.94, 329.63].map((f) => f * c.k);
  out.forEach((d, ch) => {
    const saws = [];
    FREQ.forEach((f, j) => { for (const det of [-0.0046, 0.0046]) saws.push({ s: new Saw((j * 0.31 + det * 50 + ch * 0.5) % 1), f: f * (1 + det * (ch ? 1.3 : 1)) }); });
    const lp = new Biq(sr), air = new Biq(sr).set('hp', 6000);
    const w = noiseGen(c.seed + ch * 5);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const env = x < 0.75 ? (x / 0.75) ** 2 : 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (x - 0.75) / 0.23));
      if ((i & 31) === 0) lp.set('lp', 250 + 3300 * env, 0.9);
      let s = 0;
      for (const v of saws) s += v.s.run(v.f / sr);
      d[i] = (lp.run(s) * 0.12 + air.run(w()) * 0.08) * env;
    }
  });
  room(out, sr, { size: 0.88, wet: 0.5 });
  fadeOut(out, n - c.S(0.05), n);
  return out;
}

// Radio-Rauschen: Sendersuche – wanderndes Rauschen, Pfeifton beim Durchdrehen, kurz ein ferner Sender, Knackser
function radio(c) {
  const { n, sr, spb, B } = c;
  const out = chans(n);
  const r = mulberry32(c.seed);
  const w = noiseGen(c.seed + 1);
  const bp = new Biq(sr), hp = new Biq(sr).set('hp', 300), lp = new Biq(sr).set('lp', 4500);
  const st1 = new Biq(sr).set('bp', 1000, 2);
  const p = new Pulse(0.4);
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  let wh = 0, click = 0;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr, b = t / spb;
    if ((i & 31) === 0) bp.set('bp', 1200 * Math.pow(2, 0.8 * Math.sin(TAU * 0.7 * t + ph[0]) + 0.4 * Math.sin(TAU * 1.9 * t + ph[1])), 1.5);
    const v = w();
    let s = (bp.run(v) * 0.9 + v * 0.25) * (0.6 + 0.4 * Math.sin(TAU * 0.9 * t + ph[2]));
    if (b > 1.5 && b < 3.5) {
      const u = (b - 1.5) / 2;
      wh += (300 + 3200 * (2 * u - 1) ** 2) / sr;
      s += Math.sin(TAU * wh) * 0.3 * Math.sin(Math.PI * u) ** 2;
    }
    if (b > 4 && b < 6.5) {
      const u = (b - 4) / 2.5;
      const note = Math.floor(b * 2) % 2 ? 329.63 : 220;
      s += st1.run(p.run(note / sr)) * 0.5 * Math.sin(Math.PI * u) ** 2 * (0.7 + 0.3 * Math.sin(TAU * 3 * t));
    }
    if (r() < 14 / sr) click = (r() < 0.5 ? -1 : 1) * (0.4 + 0.6 * r());
    s += click;
    click *= 0.6;
    d[i] = lp.run(hp.run(s));
  }
  for (let i = 0; i < n; i++) { const x = i / n; d[i] *= clamp01(x / 0.03); }
  addPan(out, d);
  fadeOut(out, n - B(0.5), n);
  return out;
}

// Herzschlag: je Schlag „Bum-bum“ (tiefe Sinus-Stöße mit kurzem Tonhöhenknick), leicht angezerrt
function heartbeat(c) {
  const { n, sr, spb, B } = c;
  const out = chans(n);
  const d = new Float32Array(n);
  const gap = Math.min(0.22, 0.35 * spb);
  const scale = Math.min(1, spb / 0.5);
  const thump = (at, f0, amp, tau) => {
    let ph = 0;
    const len = Math.min(n - at, Math.round(tau * 8 * sr));
    for (let j = 0; j < len; j++) {
      const t = j / sr;
      ph += f0 * (1 + 0.6 * Math.exp(-t / 0.02)) / sr;
      d[at + j] += Math.sin(TAU * ph) * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / tau) * amp;
    }
  };
  for (let b = 0; b < 4; b++) {
    thump(B(b), 52, 1, 0.09 * scale);
    thump(B(b) + Math.round(gap * sr), 64, 0.75, 0.07 * scale);
  }
  const lp = new Biq(sr).set('lp', 400);
  for (let i = 0; i < n; i++) d[i] = lp.run(Math.tanh(2 * d[i]));
  addPan(out, d);
  fadeOut(out, n - c.S(0.01), n);
  return out;
}

// Gong: viele unharmonische Teiltöne mit Schwebung; die hohen blühen nach dem Anschlag erst auf
function gong(c) {
  const { n, sr } = c;
  const out = chans(n);
  const R = [1, 1.47, 1.97, 2.48, 2.95, 3.53, 4.08, 4.62, 5.26, 5.93, 6.71, 7.45, 8.33, 9.27, 10.4, 11.6];
  const f0 = 110;
  const tau0 = Math.min(5, c.T / 4.5);
  out.forEach((d, ch) => {
    const r = mulberry32(c.seed + ch * 11);
    for (let k = 0; k < R.length; k++) {
      const f = f0 * R[k] * (1 + (r() - 0.5) * 0.004) * (1 + (ch ? 0.0015 : 0));
      const amp = 1 / Math.sqrt(k + 1);
      const tau = tau0 / (1 + 0.35 * k);
      // hohe Teiltöne setzen weich ein (Aufblühen)
      mode(d, 0, f, amp, tau, sr, k >= 5 ? 0.15 + 0.03 * k : 0.002);
    }
    const w = noiseGen(c.seed + 50 + ch);
    const lp = new Biq(sr).set('lp', 800);
    let ph = 0;
    for (let j = 0; j < 0.5 * sr; j++) {
      const t = j / sr;
      ph += 55 / sr;
      d[j] += (lp.run(w()) * Math.exp(-t / 0.015) * 1.5 + Math.sin(TAU * ph) * Math.exp(-t / 0.1)) * clamp01(t / 0.001);
    }
  });
  fadeOut(out, n - c.S(Math.min(1, c.T * 0.15)), n);
  return out;
}

// ---------- Definitionen ----------

// pcm-Klang: synth(c) liefert Stereo-Kanäle genau in Loop-Länge
// tonal: folgt der Song-Tonart (semis aus dem Kit, auf ± 6 Halbtöne gefaltet, damit nichts weit nach oben oder unten rutscht)
const shot = (id, name, bars, genres, tags, synth, peak = 0.45, { tonal = false } = {}) => ({
  id, name, genres, tags, category: 'fx', bars, peak, oneShot: true, ...(tonal ? { tonal: true } : {}),
  render(k) {
    k.pcm(0, (sr, spb, semis = 0) => {
      const n = Math.round(bars * 4 * spb * sr);
      const st = tonal ? ((((Math.round(semis) + 6) % 12) + 12) % 12) - 6 : 0;
      const c = { sr, spb, n, T: n / sr, B: (b) => Math.round(b * spb * sr), S: (s) => Math.round(s * sr), seed: seedOf(id), k: 2 ** (st / 12) };
      const out = synth(c);
      dcBlock(out, sr);
      const a = c.S(0.001);
      for (const d of out) for (let i = 0; i < a; i++) d[i] *= i / a;
      fadeOut(out, n - c.S(0.003), n);
      return out;
    });
  },
});

const DEFS = [
  // ---------- Riser ----------
  shot('fxs-riser-noise', 'Rausch-Riser kurz', 1, ['house', 'techno', 'pop', 'trap', 'reggaeton'], ['riser', 'aufbau', 'build-up', 'rauschen'], (c) => noiseRiser(c)),
  shot('fxs-riser-gate', 'Gate-Riser', 4, ['techno', 'house', 'pop', 'synthwave'], ['riser', 'aufbau', 'build-up', 'rauschen', 'gate'], (c) => noiseRiser(c, { gate: true, tone: 0.12 })),
  shot('fxs-riser-tone', 'Ton-Riser', 2, ['synthwave', 'pop', 'house', 'trap'], ['riser', 'aufbau', 'build-up', 'synth'], toneRiser, 0.55, { tonal: true }),
  shot('fxs-riser-filter', 'Filter-Riser', 2, ['techno', 'house', 'breaks', 'synthwave'], ['riser', 'aufbau', 'build-up', 'filter'], filterRiser, 0.6, { tonal: true }),
  shot('fxs-riser-shepard', 'Endlos-Riser', 2, ['ambient', 'techno', 'synthwave'], ['riser', 'aufbau', 'shepard', 'spannung'], shepard, 0.37),
  shot('fxs-snare-build', 'Snare-Build lang', 4, ['pop', 'house', 'trap', 'breaks', 'reggaeton'], ['riser', 'aufbau', 'build-up', 'snare', 'wirbel'], snareBuild, 0.5),
  // ---------- Downlifter ----------
  shot('fxs-down-noise', 'Downlifter kurz', 1, ['house', 'techno', 'pop', 'trap'], ['downlifter', 'abbau', 'rauschen'], downNoise),
  shot('fxs-down-glide', 'Abwärts-Gleiter', 2, ['synthwave', 'techno', 'breaks', 'trap'], ['downlifter', 'abbau', 'synth', 'fall'], glider),
  // ---------- Einschläge ----------
  {
    id: 'fxs-impact-bass', name: 'Bass-Einschlag', genres: ['trap', 'hiphop', 'techno', 'ambient', 'pop'], category: 'fx', bars: 2, peak: 0.6, oneShot: true,
    tags: ['impact', 'einschlag', 'boom', 'drop', 'sub'],
    render(k) {
      const s = k.bus({ space: 0.3 });
      s.kickDeep(0, 1, { decay: 0.8, tone: 40, punch: 230, click: 0.6, drive: 2.2 });
      s.crash(0, 0.35);
      k.subDrop(0, 6, 1);
    },
  },
  shot('fxs-thunder', 'Donnerschlag', 2, ['ambient', 'trap', 'rock'], ['impact', 'einschlag', 'donner', 'gewitter', 'film'], thunder, 0.6),
  // ---------- Rückwärts ----------
  shot('fxs-reverse-crash', 'Rückwärts-Crash', 2, ['pop', 'rock', 'house', 'synthwave', 'breaks'], ['reverse', 'rückwärts', 'becken', 'übergang'], reverseCrash),
  shot('fxs-reverse-reverb', 'Rückwärts-Hall', 1, ['pop', 'hiphop', 'lofi', 'synthwave'], ['reverse', 'rückwärts', 'hall', 'snare', 'übergang'], reverseReverb, 0.6),
  // ---------- Bewegung ----------
  shot('fxs-flyby', 'Vorbeiflug', 1, ['pop', 'house', 'trap', 'ambient', 'breaks'], ['whoosh', 'swoosh', 'vorbei', 'übergang'], flyby),
  shot('fxs-jet', 'Jet-Sweep', 2, ['techno', 'house', 'breaks', 'funk'], ['sweep', 'flanger', 'jet', 'rauschen'], jet, 0.39),
  // ---------- Synth-Effekte ----------
  {
    id: 'fxs-zap-burst', name: 'Zap-Salve', genres: ['techno', 'breaks', 'reggaeton', 'synthwave'], category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    tags: ['laser', 'zap', 'pew'],
    render(k) {
      const L = k.bus({ pan: -0.6 }), R = k.bus({ pan: 0.6 });
      for (let i = 0; i < 8; i++) (i % 2 ? R : L).zap(i * 0.25, 0.22, 4200 - i * 250, 180, { type: 'square', cutoff: 6000, vel: 0.7 + 0.04 * i });
      k.zap(2, 1.2, 2600, 50, { cutoff: 3000, vel: 1 });
    },
  },
  shot('fxs-powerup', 'Power-Up', 1, ['synthwave', 'pop', 'house'], ['8-bit', 'chiptune', 'spiel', 'arcade'], powerUp, 0.25, { tonal: true }),
  shot('fxs-glitch', 'Glitch-Stotterer', 1, ['techno', 'breaks', 'trap', 'hiphop'], ['glitch', 'stutter', 'stotter', 'bitcrush'], glitch),
  shot('fxs-siren', 'Dub-Sirene', 2, ['breaks', 'reggaeton', 'techno', 'hiphop', 'afro'], ['sirene', 'alarm', 'dub', 'reggae'], siren, 0.22),
  // ---------- Band und Platte ----------
  shot('fxs-tape-stop', 'Tape-Stopp', 1, ['hiphop', 'lofi', 'trap', 'funk', 'pop'], ['tape', 'band', 'stopp', 'bremse'], tapeStop, 0.45, { tonal: true }),
  shot('fxs-tape-start', 'Tape-Anlauf', 1, ['hiphop', 'lofi', 'house', 'funk'], ['tape', 'band', 'anlauf', 'start'], tapeStart, 0.45, { tonal: true }),
  shot('fxs-rewind', 'Rückspulen', 1, ['breaks', 'reggaeton', 'hiphop', 'afro'], ['rewind', 'rückspulen', 'tape', 'pull-up'], rewind, 0.45, { tonal: true }),
  shot('fxs-scratch', 'Scratch', 1, ['hiphop', 'breaks', 'funk', 'lofi'], ['scratch', 'dj', 'platte', 'vinyl'], scratch, 0.37),
  // ---------- Geräusche ----------
  shot('fxs-noise-burst', 'Rausch-Stoß', 1, ['pop', 'house', 'techno', 'trap'], ['rauschen', 'noise', 'stoß', 'hit'], noiseBurst, 0.5),
  shot('fxs-sparkle', 'Funkeln', 1, ['pop', 'ambient', 'lofi', 'synthwave'], ['funkeln', 'sparkle', 'glitzer', 'magie'], sparkle, 0.38, { tonal: true }),
  shot('fxs-drops', 'Wassertropfen', 1, ['ambient', 'lofi', 'hiphop'], ['wasser', 'tropfen', 'natur', 'blubb'], drops),
  shot('fxs-glass', 'Glas-Ping', 1, ['ambient', 'pop', 'lofi'], ['glas', 'klirren', 'ping', 'anstoßen'], glass),
  shot('fxs-swell', 'Flächen-Anschwellen', 4, ['ambient', 'synthwave', 'pop', 'lofi'], ['swell', 'anschwellen', 'fläche', 'pad'], swellPad, 0.45, { tonal: true }),
  shot('fxs-radio', 'Radio-Rauschen', 2, ['lofi', 'ambient', 'hiphop'], ['radio', 'rauschen', 'sender', 'störung'], radio, 0.4),
  shot('fxs-heartbeat', 'Herzschlag', 1, ['ambient', 'trap', 'hiphop'], ['herz', 'puls', 'spannung', 'film'], heartbeat, 0.39),
  shot('fxs-gong', 'Gong', 4, ['ambient', 'techno', 'rock'], ['gong', 'metall', 'schlag', 'asien'], gong, 0.55),
];

export const FX_LOOP_DEFS = DEFS;
