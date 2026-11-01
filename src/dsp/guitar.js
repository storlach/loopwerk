// E-Gitarre, selbst gerechnet (eigener Code): Saiten nach Karplus-Strong (erweitert um Anschlagposition,
// Palm-Mute, Abdämpfen, Bend/Slide/Vibrato), dahinter Verstärker (Vorstufe mit 2-fach-Überabtastung,
// Klangregelung, Endstufe), Lautsprecherbox und Effekte (Wah, Tremolo, Chorus, Echo, Hall, Lo-Fi).
// Reines JavaScript ohne Web-Audio-Knoten: AudioContext und OfflineAudioContext bekommen dieselben Zahlen.
// Loops werden periodisch gerechnet (Ausklang gefaltet, Kette eingeschwungen) und laufen dadurch nahtlos.

import { mulberry32 } from '../util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// tanh-Näherung (Padé), bei |x| = 3 glatt (Steigung 0) auf ±1 begrenzt; viel schneller als sat
const sat = (x) => (x >= 3 ? 1 : x <= -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x));

// ---------- Biquad (RBJ, transponierte Direktform II) ----------
class Biquad {
  constructor(type, f, q, gainDb, sr) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.49) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), alpha = sn / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; }
    else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; }
    else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; }
    else if (type === 'peaking') { b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; }
    else {
      const s = 2 * Math.sqrt(A) * alpha;
      if (type === 'lowshelf') {
        b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s);
        a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s;
      } else { // highshelf
        b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
        a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.z1 = 0; this.z2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  // Ganzer Abschnitt mit Zustand in lokalen Variablen (deutlich schneller als run() je Sample)
  block(src, dst, n0, n1) {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1, z2 = this.z2;
    for (let n = n0; n < n1; n++) {
      const x = src[n];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      dst[n] = y;
    }
    this.z1 = z1; this.z2 = z2;
  }
}

// ---------- Saite ----------
// Ereignis (Zeiten in Sekunden, Tonhöhe als MIDI-Zahl):
// t, midi, dur (danach abgedämpft; Infinity = ausklingen lassen), vel 0–1, mute 0–1 (Palm-Mute), dead (gedämpfter
// Anschlag ohne Ton), bright 0–1, pick 0–0,5 (Anschlagposition), decay (Ausklingzeit −60 dB bei 110 Hz),
// glide [[ab, zielMidi, dauer], …] (Bend, Slide, Hammer-on), vib [tiefe Halbtöne, Hz, ab], swell (Einblenden in s),
// fb [ab, Intervall, Anstieg, Pegel] (Rückkopplung: ein Oberton schwillt an), gain
const LINE = 4096;
const MASK = LINE - 1;
const line = new Float32Array(LINE);
const CTRL = 16; // Steuerrate: Tonhöhe und Dämpfung alle 16 Samples

function addString(dst, ev, sr, seed) {
  const start = Math.round(ev.t * sr);
  if (start >= dst.length || !(ev.midi > 0)) return;
  const rand = mulberry32(seed);
  const vel = Math.max(0.05, Math.min(1, ev.vel ?? 0.85));
  const dead = !!ev.dead;
  const mute = dead ? 1 : Math.max(0, Math.min(1, ev.mute ?? 0));
  const bright = Math.max(0, Math.min(1, (ev.bright ?? 0.55) * (0.65 + 0.35 * vel)));
  const f0 = mtof(ev.midi);

  // Schleifenfilter: Zwei-Punkt-Mittel (Gewicht S) und einpoliger Tiefpass (c) für Palm-Mute/Abdämpfen
  const S = 0.5 - 0.42 * bright * (1 - mute);
  const c = dead ? 0.1 : 1 - 0.78 * Math.pow(mute, 0.7);
  const t60Open = (ev.decay ?? 4.5) * Math.pow(110 / f0, 0.5);
  const t60 = dead ? 0.03 : Math.exp(Math.log(t60Open) * (1 - mute) + Math.log(0.16) * mute);
  const t60Off = 0.06;
  const cOff = Math.min(c, 0.3);

  // Anregung: gezupfte Form (Dreieck mit Spitze an der Anschlagposition) plus gefärbtes Rauschen, eine Periode lang
  const P = Math.max(4, Math.round(sr / f0));
  const exc = new Float32Array(P);
  const pk = Math.max(1, Math.round((ev.pick ?? 0.18) * P));
  const a = 0.06 + 0.8 * bright;
  let lp = 0, mean = 0;
  for (let i = 0; i < P; i++) {
    const tri = i < pk ? i / pk : (P - i) / (P - pk);
    lp += a * ((rand() * 2 - 1) - lp);
    exc[i] = 0.55 * tri + 0.9 * lp;
  }
  for (let i = P - 1; i >= pk; i--) exc[i] -= 0.85 * exc[i - pk];
  for (let i = 0; i < P; i++) mean += exc[i];
  mean /= P;
  let peak = 0;
  for (let i = 0; i < P; i++) { exc[i] -= mean; peak = Math.max(peak, Math.abs(exc[i])); }
  const eg = peak > 0 ? vel / peak : 0;
  for (let i = 0; i < P; i++) exc[i] *= eg;

  // Anschlaggeräusch (Plektrum): kurzes, hochpassgefiltertes Rauschen
  const clickLen = Math.round(0.004 * sr);
  const clickAmp = vel * (dead ? 0.5 : 0.06 + 0.06 * bright);

  const offAt = Number.isFinite(ev.dur) ? start + Math.max(1, Math.round(ev.dur * sr)) : Infinity;
  const swellN = ev.swell ? Math.max(1, Math.round(ev.swell * sr)) : 0;
  const fb = ev.fb;
  const life = Number.isFinite(offAt) ? (offAt - start) / sr + 0.14 : Math.min(t60 * 1.25, 30) + (ev.swell ?? 0);
  const end = Math.min(dst.length, start + Math.round(life * sr));
  const fadeN = Math.round(0.006 * sr);
  const gain = ev.gain ?? 1;
  const glide = ev.glide || [];
  const vib = ev.vib;

  line.fill(0);
  let w = 0, prev = 0, m = 0, clickPrev = 0;
  let g = 0, D = 0, cc = c, fbPhase = 0, fbInc = 0, fbAmp = 0;
  for (let n = start, k = 0; n < end; n++, k++) {
    if (k % CTRL === 0) {
      const tr = k / sr;
      let pitch = ev.midi;
      let from = ev.midi;
      for (let j = 0; j < glide.length; j++) {
        const [at, to, dur] = glide[j];
        if (tr > at) {
          const x = Math.min(1, (tr - at) / Math.max(1e-3, dur));
          pitch += (to - from) * x * x * (3 - 2 * x);
        }
        from = to;
      }
      if (vib && tr > vib[2]) pitch += vib[0] * Math.min(1, (tr - vib[2]) / 0.15) * Math.sin(2 * Math.PI * vib[1] * (tr - vib[2]));
      const f = mtof(pitch);
      const damp = n >= offAt ? Math.min(1, (n - offAt) / (0.012 * sr)) : 0;
      cc = c + (cOff - c) * damp;
      const t = Math.exp(Math.log(t60) * (1 - damp) + Math.log(t60Off) * damp);
      g = Math.pow(10, -3 / (f * t));
      D = Math.min(LINE - 4, Math.max(3, sr / f - S - (1 - cc) / cc));
      if (fb) {
        fbInc = 2 * Math.PI * f * Math.pow(2, fb[1] / 12) / sr;
        const x = Math.max(0, Math.min(1, (tr - fb[0]) / fb[2]));
        fbAmp = vel * (fb[3] ?? 0.5) * x * x * (1 - damp);
      }
    }
    const rp = w - D;
    const i0 = Math.floor(rp);
    const fr = rp - i0;
    const xm1 = line[(i0 - 1) & MASK], x0 = line[i0 & MASK], x1 = line[(i0 + 1) & MASK], x2 = line[(i0 + 2) & MASK];
    // Hermite-Interpolation (gleitende Tonhöhe ohne Stufen)
    const c1 = 0.5 * (x1 - xm1);
    const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    const tap = ((c3 * fr + c2) * fr + c1) * fr + x0;
    const v = (1 - S) * tap + S * prev;
    prev = tap;
    m += cc * (v - m);
    const y = g * m + (k < P ? exc[k] : 0);
    line[w & MASK] = y;
    w++;
    let o = y;
    if (k < clickLen) {
      const nz = rand() * 2 - 1;
      o += clickAmp * (nz - clickPrev) * (1 - k / clickLen);
      clickPrev = nz;
    }
    if (fb) { fbPhase += fbInc; o += fbAmp * Math.sin(fbPhase); }
    let env = gain;
    if (swellN && k < swellN) { const x = k / swellN; env *= x * x; }
    if (end - n < fadeN) env *= (end - n) / fadeN;
    dst[n] += o * env;
  }
}

// Saitengeräusch: Plektrum über die umwickelte Saite gezogen (Pick-Scrape), Rauschen mit Rillen-Takt
function addScrape(dst, ev, sr, seed) {
  const start = Math.round(ev.t * sr);
  const n = Math.round(ev.dur * sr);
  const rand = mulberry32(seed);
  const bp = { lo: 0, band: 0 };
  let phase = 0;
  for (let k = 0; k < n && start + k < dst.length; k++) {
    const x = k / n;
    const f = ev.from * Math.pow(ev.to / ev.from, x);
    phase += (f * 0.12) / sr;
    const ridge = 0.4 + 0.6 * (phase % 1 < 0.3 ? 1 : 0);
    // Zustandsvariablenfilter (Chamberlin), Mitte f, Güte etwa 3
    const fc = 2 * Math.sin(Math.PI * Math.min(f, sr / 7) / sr);
    const hi = (rand() * 2 - 1) * ridge - bp.lo - 0.33 * bp.band;
    bp.band += fc * hi;
    bp.lo += fc * bp.band;
    const env = Math.min(1, k / (0.01 * sr)) * Math.pow(1 - x, 0.6);
    dst[start + k] += bp.band * env * (ev.vel ?? 0.8) * 0.6;
  }
}

// ---------- Verstärker und Box ----------
export const AMPS = {
  clean: { hp: 50, drive: 1.2, bias: 0.04, bass: 2, mid: -1.5, treble: 3, cab: 'combo', fizz: 9000, level: 0.9 },
  jazz: { hp: 50, drive: 1.1, bias: 0.04, bass: 3, mid: 0, treble: -5, cab: 'combo', fizz: 5000, level: 0.9 },
  crunch: { hp: 100, boost: [800, 6, 0.8], drive: 7, bias: 0.15, bass: 1, mid: 2, treble: 2, cab: '4x12', fizz: 6500, level: 0.75 },
  lead: { hp: 120, boost: [850, 7, 0.8], drive: 12, drive2: 3, bias: 0.12, bass: 1, mid: 3, treble: 1, cab: '4x12', fizz: 6000, level: 0.7 },
  metal: { hp: 190, boost: [900, 8, 0.7], drive: 20, drive2: 4, bias: 0.1, bass: 5, mid: -7, treble: 3, cab: '4x12', fizz: 6000, level: 0.7 },
  fuzz: { hp: 60, drive: 35, bias: 0.35, bass: 3, mid: -4, treble: -1, cab: '2x12', fizz: 5000, level: 0.7 },
};
const CABS = {
  '4x12': [['highpass', 80, 0.9, 0], ['peaking', 120, 1, 3], ['peaking', 450, 1.2, -4], ['peaking', 2300, 1.6, 4], ['lowpass', 4600, 0.8, 0], ['lowpass', 6500, 0.6, 0]],
  '2x12': [['highpass', 75, 0.8, 0], ['peaking', 160, 1, 2], ['peaking', 1800, 1.2, 3], ['lowpass', 5200, 0.8, 0], ['lowpass', 7500, 0.6, 0]],
  combo: [['highpass', 70, 0.7, 0], ['peaking', 220, 1, 1.5], ['peaking', 2800, 1.2, 2.5], ['lowpass', 7000, 0.7, 0], ['lowpass', 9500, 0.6, 0]],
};

class Amp {
  constructor(sr, p) {
    this.p = p;
    this.hp = new Biquad('highpass', p.hp, 0.7, 0, sr);
    this.boost = p.boost ? new Biquad('peaking', p.boost[0], p.boost[2], p.boost[1], sr) : null;
    this.fizz = new Biquad('lowpass', p.fizz, 0.6, 0, sr);
    const sr2 = 2 * sr;
    // Überabtastung: Interpolations- und Dezimationsfilter (Butterworth 4. Ordnung bei 0,45 · fs)
    this.up = [new Biquad('lowpass', 0.45 * sr, 0.5412, 0, sr2), new Biquad('lowpass', 0.45 * sr, 1.3066, 0, sr2)];
    this.dn = [new Biquad('lowpass', 0.45 * sr, 0.5412, 0, sr2), new Biquad('lowpass', 0.45 * sr, 1.3066, 0, sr2)];
    this.inter = 1 - Math.exp(-2 * Math.PI * 140 / sr2); // Hochpass zwischen zwei Stufen
    this.ih = 0;
    this.tone = [
      new Biquad('lowshelf', 120, 0.7, p.bass ?? 0, sr),
      new Biquad('peaking', 650, 0.8, p.mid ?? 0, sr),
      new Biquad('highshelf', 3200, 0.7, p.treble ?? 0, sr),
    ];
    this.cab = CABS[p.cab].map(([t, f, q, gdb]) => new Biquad(t, f, q, gdb, sr));
    this.tb = sat(p.bias);
    this.tb2 = sat(p.bias * 0.5);
  }
  // Kennlinie (eine oder zwei Röhrenstufen) über einen Abschnitt
  nl(buf, i0, i1) {
    const { drive, drive2, bias } = this.p;
    const tb = this.tb, tb2 = this.tb2, k = this.inter, b2 = bias * 0.5;
    let ih = this.ih;
    for (let i = i0; i < i1; i++) {
      let y = sat(drive * buf[i] + bias) - tb;
      if (drive2) {
        ih += k * (y - ih);
        y = sat(drive2 * (y - ih) + b2) - tb2;
      }
      buf[i] = y;
    }
    this.ih = ih;
  }
  // Blockweise: jede Stufe läuft einmal über den ganzen Abschnitt
  process(src, dst, n0, n1) {
    const { hp, boost, fizz, up, dn, tone, cab } = this;
    hp.block(src, dst, n0, n1);
    if (boost) boost.block(dst, dst, n0, n1);
    fizz.block(dst, dst, n0, n1);
    if (this.p.drive > 3) {
      // 2-fach überabgetastet (Nullen einfügen, filtern, Kennlinie, filtern, jedes zweite Sample)
      const len = 2 * (n1 - n0);
      const x2 = new Float32Array(len);
      for (let n = n0, i = 0; n < n1; n++, i += 2) x2[i] = 2 * dst[n];
      up[0].block(x2, x2, 0, len); up[1].block(x2, x2, 0, len);
      this.nl(x2, 0, len);
      dn[0].block(x2, x2, 0, len); dn[1].block(x2, x2, 0, len);
      for (let n = n0, i = 1; n < n1; n++, i += 2) dst[n] = x2[i];
    } else this.nl(dst, n0, n1);
    for (let i = 0; i < tone.length; i++) tone[i].block(dst, dst, n0, n1);
    const lvl = this.p.level;
    for (let n = n0; n < n1; n++) dst[n] = (sat(1.1 * dst[n]) / 1.1) * lvl; // Endstufe
    for (let i = 0; i < cab.length; i++) cab[i].block(dst, dst, n0, n1);
  }
}

// ---------- Effekte (Raten in Schlägen, damit Loops nahtlos laufen) ----------
// Wah vor dem Verstärker: Bandpass, Mitte folgt der Hüllkurve (Auto-Wah) oder einem Pendel im Takt
class Wah {
  constructor(sr, spb, o) {
    this.sr = sr; this.o = o;
    this.period = (o.rate ?? 1) * spb * sr;
    this.env = 0; this.lo = 0; this.band = 0;
    this.att = 1 - Math.exp(-1 / (0.004 * sr));
    this.rel = 1 - Math.exp(-1 / (0.09 * sr));
  }
  process(buf, n0, n1, idx0) {
    const { sr, o } = this;
    const lo = o.lo ?? 420, hi = o.hi ?? 2200, q = o.q ?? 3.5, sens = o.sens ?? 6;
    let fc = 0;
    for (let n = n0, k = 0; n < n1; n++, k++) {
      const x = buf[n];
      const ax = Math.abs(x);
      this.env += (ax > this.env ? this.att : this.rel) * (ax - this.env);
      if (k % 8 === 0) {
        const pos = o.mode === 'env'
          ? Math.min(1, this.env * sens)
          : 0.5 - 0.5 * Math.cos(2 * Math.PI * (((idx0 + k) / this.period) % 1));
        fc = 2 * Math.sin(Math.PI * (lo * Math.pow(hi / lo, pos)) / sr);
      }
      const h = x - this.lo - this.band / q;
      this.band += fc * h;
      this.lo += fc * this.band;
      buf[n] = 2.2 * this.band + 0.12 * x;
    }
  }
}

class Tremolo {
  constructor(sr, spb, o) { this.period = (o.rate ?? 0.5) * spb * sr; this.depth = o.depth ?? 0.6; }
  process(L, R, n0, n1, idx0) {
    for (let n = n0, k = 0; n < n1; n++, k++) {
      const ph = ((idx0 + k) / this.period) % 1;
      const gn = 1 - this.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph));
      L[n] *= gn; R[n] *= gn;
    }
  }
}

// Modulierte Verzögerung (Chorus und Lo-Fi-Leiern); links und rechts gegenläufig
class ModDelay {
  constructor(sr, spb, { base = 0.009, depth = 0.0025, rate = 2, mix = 0.45, spread = 0.25 } = {}) {
    this.size = 1 << Math.ceil(Math.log2(sr * (base + depth) + 8));
    this.mask = this.size - 1;
    this.bl = new Float32Array(this.size); this.br = new Float32Array(this.size);
    this.w = 0; this.base = base * sr; this.depth = depth * sr; this.period = rate * spb * sr;
    this.mix = mix; this.spread = spread;
  }
  read(b, pos) {
    const i = Math.floor(pos), f = pos - i;
    return b[i & this.mask] * (1 - f) + b[(i + 1) & this.mask] * f;
  }
  process(L, R, n0, n1, idx0, dry = 1) {
    for (let n = n0, k = 0; n < n1; n++, k++) {
      const ph = 2 * Math.PI * ((idx0 + k) / this.period);
      this.bl[this.w & this.mask] = L[n];
      this.br[this.w & this.mask] = R[n];
      const dl = this.base + this.depth * Math.sin(ph);
      const dr = this.base + this.depth * Math.sin(ph + 2 * Math.PI * this.spread);
      const yl = this.read(this.bl, this.w - dl);
      const yr = this.read(this.br, this.w - dr);
      this.w++;
      L[n] = dry * L[n] + this.mix * yl;
      R[n] = dry * R[n] + this.mix * yr;
    }
  }
}

// Ping-Pong-Echo, Zeit in Schlägen, Wiederholungen gedämpft
class Echo {
  constructor(sr, spb, { time = 0.75, feedback = 0.38, mix = 0.3, tone = 3000 } = {}) {
    this.d = Math.max(1, Math.round(time * spb * sr));
    this.size = 1 << Math.ceil(Math.log2(this.d + 2));
    this.mask = this.size - 1;
    this.bl = new Float32Array(this.size); this.br = new Float32Array(this.size);
    this.w = 0; this.fb = feedback; this.mix = mix;
    this.k = 1 - Math.exp(-2 * Math.PI * tone / sr);
    this.ll = 0; this.lr = 0;
  }
  process(L, R, n0, n1) {
    const { mask, d } = this;
    for (let n = n0; n < n1; n++) {
      const yl = this.bl[(this.w - d) & mask];
      const yr = this.br[(this.w - d) & mask];
      this.ll += this.k * (yl - this.ll);
      this.lr += this.k * (yr - this.lr);
      this.bl[this.w & mask] = 0.5 * (L[n] + R[n]) + this.fb * this.lr;
      this.br[this.w & mask] = this.fb * this.ll;
      this.w++;
      L[n] += this.mix * yl;
      R[n] += this.mix * yr;
    }
  }
}

// Hall nach Schroeder/Moorer (vier Kammfilter, zwei Allpässe je Seite); spring = Federhall mit Dispersion
class Reverb {
  constructor(sr, { size = 0.8, damp = 0.35, mix = 0.25, spring = false } = {}) {
    const sc = sr / 44100;
    const mk = (lens) => lens.map((l) => ({ b: new Float32Array(Math.round(l * sc)), i: 0, f: 0 }));
    this.cl = mk([1116, 1188, 1277, 1356]); this.cr = mk([1139, 1211, 1300, 1379]);
    this.al = mk([556, 441]); this.ar = mk([579, 464]);
    this.fb = 0.7 + 0.26 * size; this.damp = damp; this.mix = mix;
    this.spring = spring;
    if (spring) {
      // Federhall: Verzögerung mit Allpass-Kette (Dispersion, „Tropfen“) in der Rückkopplung
      this.sd = new Float32Array(Math.round(0.037 * sr)); this.si = 0;
      this.ap = new Float32Array(8); this.apx = new Float32Array(8);
      this.sl = 0; this.sk = 1 - Math.exp(-2 * Math.PI * 4200 / sr);
    }
  }
  // Kammfilter parallel (Summe in acc), Allpässe nacheinander – je Filter ein Durchlauf über den Abschnitt
  side(cs, as, x, acc, len) {
    const fb = this.fb, damp = this.damp;
    acc.fill(0);
    for (let j = 0; j < cs.length; j++) {
      const c = cs[j], b = c.b, bl = b.length;
      let i = c.i, f = c.f;
      for (let k = 0; k < len; k++) {
        const y = b[i];
        f = y * (1 - damp) + f * damp;
        b[i] = x[k] + f * fb;
        if (++i >= bl) i = 0;
        acc[k] += y;
      }
      c.i = i; c.f = f;
    }
    for (let j = 0; j < as.length; j++) {
      const a = as[j], b = a.b, bl = b.length;
      let i = a.i;
      for (let k = 0; k < len; k++) {
        const y = b[i], v = acc[k];
        b[i] = v + y * 0.5;
        if (++i >= bl) i = 0;
        acc[k] = y - v;
      }
      a.i = i;
    }
  }
  process(L, R, n0, n1) {
    const len = n1 - n0;
    const x = new Float32Array(len);
    for (let k = 0; k < len; k++) x[k] = (L[n0 + k] + R[n0 + k]) * 0.5;
    if (this.spring) {
      const sd = this.sd, ap = this.ap, apx = this.apx, sk = this.sk, sl0 = sd.length;
      let si = this.si, sl = this.sl;
      for (let k = 0; k < len; k++) {
        let v = x[k] + 0.72 * sd[si];
        for (let j = 0; j < 8; j++) { // Allpass 1. Ordnung, Koeffizient 0,62
          const y = -0.62 * v + apx[j] + 0.62 * ap[j];
          apx[j] = v; ap[j] = y; v = y;
        }
        sl += sk * (v - sl);
        sd[si] = sl;
        if (++si >= sl0) si = 0;
        x[k] = 0.6 * sl + 0.4 * x[k];
      }
      this.si = si; this.sl = sl;
    }
    for (let k = 0; k < len; k++) x[k] *= 0.12;
    const acc = new Float32Array(len);
    this.side(this.cl, this.al, x, acc, len);
    for (let k = 0; k < len; k++) L[n0 + k] += this.mix * acc[k];
    this.side(this.cr, this.ar, x, acc, len);
    for (let k = 0; k < len; k++) R[n0 + k] += this.mix * acc[k];
  }
}

// Lo-Fi: Bandbegrenzung, Rauschen, leichte Sättigung (das Leiern macht ModDelay)
class LoFi {
  constructor(sr, { cutoff = 3400, hiss = 0.004 } = {}, seed = 1) {
    this.f = [new Biquad('lowpass', cutoff, 0.7, 0, sr), new Biquad('lowpass', cutoff, 0.7, 0, sr)];
    this.h = [new Biquad('highpass', 140, 0.7, 0, sr), new Biquad('highpass', 140, 0.7, 0, sr)];
    this.hiss = hiss; this.rand = mulberry32(seed);
  }
  process(L, R, n0, n1) {
    this.f[0].block(L, L, n0, n1); this.h[0].block(L, L, n0, n1);
    this.f[1].block(R, R, n0, n1); this.h[1].block(R, R, n0, n1);
    for (let n = n0; n < n1; n++) {
      const nz = (this.rand() * 2 - 1) * this.hiss;
      L[n] = sat(1.4 * L[n]) / 1.4 + nz;
      R[n] = sat(1.4 * R[n]) / 1.4 + nz;
    }
  }
}

// ---------- Ganze Kette ----------
const WOW_BASE = 0.006; // s, Grundverzögerung des Lo-Fi-Leierns
// opts: { sr, spb, amp: Name oder Objekt, fx: { wah, tremolo, chorus, echo, reverb, lofi }, double, width,
//         loopFrames (periodisch: Ausgabe genau so lang, nahtlos) oder frames (einmalig, Ende ausgeblendet), seed }
// events: Saiten-Ereignisse (siehe addString), scrapes: Saitengeräusche
export function renderGuitar(events, opts) {
  const { sr, spb = 0.5, seed = 1 } = opts;
  const amp = typeof opts.amp === 'string' ? AMPS[opts.amp] : (opts.amp || AMPS.clean);
  const fx = opts.fx || {};
  const loop = opts.loopFrames > 0;
  const outLen = loop ? opts.loopFrames : opts.frames;
  // Saiten mit vollem Ausklang rechnen, bei Loops danach auf die Loop-Länge falten
  let tailEnd = outLen;
  for (const ev of events) {
    const life = Number.isFinite(ev.dur) ? ev.dur + 0.2 : (ev.decay ?? 4.5) * 1.6 + (ev.swell ?? 0);
    tailEnd = Math.max(tailEnd, Math.round((ev.t + life) * sr));
  }
  const diLen = loop ? Math.min(tailEnd, outLen + Math.round(12 * sr)) : outLen;
  const takes = opts.double ? 2 : 1;
  const di = [];
  for (let tk = 0; tk < takes; tk++) {
    const raw = new Float32Array(diLen);
    const jr = mulberry32(seed * 7919 + tk * 104729);
    events.forEach((ev, i) => {
      let e = ev;
      if (tk) { // zweite Aufnahme: leicht andere Zeit, Stärke und Stimmung
        e = { ...ev, t: ev.t + 0.002 + 0.01 * jr(), vel: (ev.vel ?? 0.85) * (0.9 + 0.12 * jr()), midi: ev.midi + 0.04 }; // nie vor dem Schlag
      }
      addString(raw, e, sr, seed * 1000003 + i * 7 + tk * 131);
    });
    (opts.scrapes || []).forEach((s, i) => addScrape(raw, s, sr, seed + 17 * i + tk));
    let d = raw;
    if (loop) {
      d = new Float32Array(outLen);
      for (let i = 0; i < raw.length; i++) d[i % outLen] += raw[i];
    }
    const pre = opts.preGain ?? 0.3;
    for (let i = 0; i < d.length; i++) d[i] *= pre;
    di.push(d);
  }

  const L = new Float32Array(outLen), R = new Float32Array(outLen);
  const chains = di.map(() => ({ amp: new Amp(sr, amp), wah: fx.wah ? new Wah(sr, spb, fx.wah) : null }));
  const trem = fx.tremolo ? new Tremolo(sr, spb, fx.tremolo) : null;
  const chorus = fx.chorus ? new ModDelay(sr, spb, fx.chorus) : null;
  const wow = fx.lofi ? new ModDelay(sr, spb, { base: WOW_BASE, depth: 0.0011, rate: fx.lofi.rate ?? 4, mix: 1, spread: 0.02 }) : null;
  const lofi = fx.lofi ? new LoFi(sr, fx.lofi, seed) : null;
  const echo = fx.echo ? new Echo(sr, spb, fx.echo) : null;
  const rev = fx.reverb ? new Reverb(sr, fx.reverb) : null;
  const width = opts.width ?? 0.85;

  // Ein Durchgang über [n0, n1); idx0 = Position im Loop für die Effekt-Pendel
  const tmpA = new Float32Array(outLen), tmpB = new Float32Array(outLen);
  const pass = (n0, n1) => {
    const tmp = [tmpA, tmpB];
    di.forEach((d, i) => {
      const t = tmp[i];
      if (chains[i].wah) {
        t.set(d.subarray(n0, n1), n0);
        chains[i].wah.process(t, n0, n1, n0);
        chains[i].amp.process(t, t, n0, n1);
      } else chains[i].amp.process(d, t, n0, n1);
    });
    if (takes === 2) {
      const a = (1 + width) / 2, b = (1 - width) / 2;
      for (let n = n0; n < n1; n++) { L[n] = a * tmpA[n] + b * tmpB[n]; R[n] = b * tmpA[n] + a * tmpB[n]; }
    } else {
      for (let n = n0; n < n1; n++) { L[n] = tmpA[n]; R[n] = tmpA[n]; }
    }
    if (trem) trem.process(L, R, n0, n1, n0);
    if (wow) wow.process(L, R, n0, n1, n0, 0);
    if (lofi) lofi.process(L, R, n0, n1);
    if (chorus) chorus.process(L, R, n0, n1, n0);
    if (echo) echo.process(L, R, n0, n1);
    if (rev) rev.process(L, R, n0, n1);
  };
  if (loop) {
    // Einschwingen: das Loop-Ende (bis 3 s) einmal vorweg, damit Hall, Echo und Filter beim Start schon klingen
    const warm = Math.min(outLen, Math.round((echo || rev ? 3 : 0.3) * sr));
    pass(outLen - warm, outLen);
    pass(0, outLen);
    // Leiern verzögert um die Grundverzögerung: im periodischen Loop exakt zurückdrehen, damit Schläge pünktlich bleiben
    if (wow) {
      const sh = Math.round(WOW_BASE * sr);
      for (const ch of [L, R]) { const c = ch.slice(); for (let i = 0; i < outLen; i++) ch[i] = c[(i + sh) % outLen]; }
    }
  } else {
    pass(0, outLen);
    const fade = Math.min(outLen, Math.round(0.04 * sr));
    for (let i = 0; i < fade; i++) { const gn = i / fade; L[outLen - 1 - i] *= gn; R[outLen - 1 - i] *= gn; }
  }
  return [L, R];
}

// ---------- Spielbare E-Gitarre (Melodie-Editor) ----------
export const GUITAR_PRESETS = {
  guitar: { amp: 'clean', fx: { chorus: { mix: 0.3, rate: 4 }, reverb: { size: 0.6, mix: 0.18 } }, decay: 4, bright: 0.55, level: 1.15 },
  guitarDrive: { amp: 'lead', fx: { echo: { time: 0.75, feedback: 0.3, mix: 0.18 }, reverb: { size: 0.6, mix: 0.12 } }, decay: 6, bright: 0.6, double: true, level: 1 },
  guitarCrunch: { amp: 'crunch', fx: { reverb: { size: 0.5, mix: 0.12 } }, decay: 4.5, bright: 0.6, double: true, level: 0.9 },
  guitarMetal: { amp: 'metal', fx: { reverb: { size: 0.4, mix: 0.08 } }, decay: 5, bright: 0.65, double: true, level: 0.95 },
  guitarFuzz: { amp: 'fuzz', fx: { reverb: { size: 0.5, mix: 0.1 } }, decay: 6, bright: 0.5, level: 0.85 },
};
export const isGuitarPreset = (id) => Object.hasOwn(GUITAR_PRESETS, id);

// Noten (Schläge) → Kanaldaten; loopFrames: periodisch für Melodie-Loops, sonst frames mit Ausblende
export function renderGuitarNotes(presetId, notes, { sr, spb, loopFrames = 0, frames = 0 }) {
  const p = GUITAR_PRESETS[presetId];
  const events = notes.map((n) => ({
    t: n.start * spb, midi: n.pitch, dur: Math.max(0.03, n.len * spb), vel: 0.55 + 0.45 * (n.vel ?? 1),
    decay: p.decay, bright: p.bright, vib: n.len * spb > 0.6 ? [0.12, 5.5, 0.35] : null,
  }));
  const [L, R] = renderGuitar(events, { sr, spb, amp: p.amp, fx: p.fx, double: p.double, loopFrames, frames, seed: 11 });
  for (let i = 0; i < L.length; i++) { L[i] *= p.level; R[i] *= p.level; }
  return [L, R];
}
