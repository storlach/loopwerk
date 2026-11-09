// Mastering-Kette als reiner JS-Code: läuft im AudioWorklet (Realtime und Offline) und im Hauptthread/Worker
// für die Lautheitsanalyse. Dieselbe Rechnung an beiden Orten – darum klingen Export und Wiedergabe gleich.
// Stufe 1 (MasterTone): Eingangspegel → EQ → Stereobreite nur in den Höhen (Bässe mono) → Bus-Kompressor
//   [→ weicher Clipper, nur Stile mit `clip`].
// Stufe 2 (TruePeakLimiter): Ziel-Verstärkung → Limiter mit Vorausschau und True-Peak-Erkennung (4× überabgetastet).
// Optionale Felder eines Stils (fehlen sie, rechnet die Kette wie vor „Club“ – bitgleich):
//   eq.hp   Trittschall-Hochpass (Hz, sonst 25)
//   mono    Bass-Mono: Seite mit Linkwitz-Riley 8. Ordnung (2 × Butterworth 4.) ab dieser Frequenz statt LR4 bei 160 Hz
//   comp.sc Hochpass im Detektor des Kompressors (Hz): der Sub der Kick zieht die Summe nicht mit
//   clip    Clipper zwischen Kompressor und Limiter (siehe Clipper), verlängert die Latenz um TP_HALF + OS_Q
// process() reserviert keinen Speicher: alle Puffer entstehen im Konstruktor bzw. in setStyle().

export const MASTER_STYLES = [
  {
    id: 'balanced', label: 'Ausgewogen', target: -14,
    eq: { low: [110, 1], mud: [320, -1, 1], high: [8000, 1.5] }, width: 1.5,
    comp: { threshold: -17, ratio: 2, attack: 0.025, release: 0.22 }, release: 0.1, drive: 3,
  },
  {
    id: 'warm', label: 'Warm', target: -14,
    eq: { low: [120, 2.5], mud: [2800, -1, 0.8], high: [7000, -1.5] }, width: 1,
    comp: { threshold: -18, ratio: 2.5, attack: 0.03, release: 0.3 }, release: 0.12, drive: 3,
  },
  {
    id: 'bright', label: 'Hell', target: -14,
    eq: { low: [100, 0], mud: [260, -1.5, 1], high: [6000, 3] }, width: 2.5,
    comp: { threshold: -17, ratio: 2, attack: 0.02, release: 0.2 }, release: 0.09, drive: 3,
  },
  {
    id: 'loud', label: 'Laut', target: -10,
    eq: { low: [110, 1.5], mud: [320, -1, 1], high: [8000, 2] }, width: 1.5,
    comp: { threshold: -20, ratio: 3, attack: 0.015, release: 0.15 }, release: 0.06, drive: 7,
  },
  {
    // Club (melodischer Techno, −8 LUFS): Tiefen fest, Schlamm raus, Höhen offen; Bass-Mono; Kompressor mit
    // langsamem Attack und Detektor ohne Sub, damit die Kick durchkommt; Clipper in zwei Bändern liefert einen Teil der
    // Lautheit (Sub und Flächen werden dichter, der Klick der Kick bleibt), der Limiter den Rest. Seite über 300 Hz
    // unverändert (width 0), die Höhen öffnet der EQ.
    id: 'club', label: 'Club', target: -8,
    eq: { hp: 30, low: [95, 2], mud: [300, -2, 1], high: [10000, 2] }, width: 0, mono: 125,
    comp: { threshold: -18, ratio: 2, attack: 0.03, release: 0.12, sc: 100 }, release: 0.04, drive: 11,
    clip: { split: 250, low: [0, 4], high: [2, 6] },
  },
];
export const styleOf = (id) => MASTER_STYLES.find((s) => s.id === id) ?? MASTER_STYLES[0];

export const MASTER_REF = -18; // Eingangslautheit (LUFS), auf die Stufe 1 normiert – darauf beziehen sich die Schwellen
export const CEILING_DB = -1.7; // Grenze des 4×-Detektors (dBTP); zwischen seinen Stützstellen bleibt bis zu 0,3 dB – echte Spitze < −1 dBTP
const TP_HALF = 16; // halbe Länge des Interpolationsfilters je Phase (32 Abgriffe)
const TP_FACTOR = 4;

const dbToGain = (db) => Math.pow(10, db / 20);

// Biquad-Koeffizienten (RBJ-Kochbuch) → [b0, b1, b2, a1, a2]
function biquad(type, f, sr, gainDb = 0, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') {
    const al = sw / (2 * q);
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  } else if (type === 'lowpass') {
    const al = sw / (2 * q);
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  } else if (type === 'peaking') {
    const al = sw / (2 * q);
    b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
  } else {
    const al = (sw / 2) * Math.SQRT2; // Kuhsteilheit S = 1
    const sa = 2 * Math.sqrt(A) * al;
    if (type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * cw + sa); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sa);
      a0 = (A + 1) + (A - 1) * cw + sa; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sa;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cw + sa); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sa);
      a0 = (A + 1) - (A - 1) * cw + sa; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sa;
    }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// Weiches Knie: linear bis a, darüber tanh bis zur Grenze a + w (Steigung 1 am Übergang)
function soft(x, a, w) {
  const ax = x < 0 ? -x : x;
  if (ax <= a) return x;
  const v = a + w * Math.tanh((ax - a) / w);
  return x < 0 ? -v : v;
}

// Kette von Biquads für einen Kanal: Koeffizienten c (5 je Stufe), Zustand s (2 je Stufe, transponierte Direktform II)
function runChain(c, s, n, x) {
  for (let k = 0; k < n; k++) {
    const o = k * 5;
    const z = k * 2;
    const y = c[o] * x + s[z];
    s[z] = c[o + 1] * x - c[o + 3] * y + s[z + 1];
    s[z + 1] = c[o + 2] * x - c[o + 4] * y;
    x = y;
  }
  return x;
}

// Clipper vor dem Limiter, 4× überabgetastet (Interpolation wie der True-Peak-Detektor, zurück mit linearphasigem
// Tiefpass): kaum Spiegelfrequenzen, kaum Zwischenwert-Spitzen. Zwei Bänder (LR4-Tiefpass + Rest, Summe = Eingang),
// jedes mit eigener Grenze – so kappt er den Sub der Kick und die Spitzen der Flächen, der Klick darüber bleibt.
// cfg: { split (Hz), low: [über MASTER_REF dB, Knie dB], high: [...] } – fehlt ein Band, bleibt es linear.
const OS = 4;
const OS_Q = 12; // halbe Länge des Rück-Tiefpasses (Abtastwerte) = zusätzliche Latenz neben TP_HALF

class Clipper {
  constructor(sr, cfg) {
    const H2 = 2 * TP_HALF;
    this.up = tpFilter(OS, TP_HALF);
    const c = OS * OS_Q;
    this.K = 2 * c + 1;
    this.down = new Float64Array(this.K);
    let sum = 0;
    for (let k = 0; k < this.K; k++) {
      const t = (k - c) / OS;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      this.down[k] = sinc * (0.5 + 0.5 * Math.cos((Math.PI * (k - c)) / (c + 1)));
      sum += this.down[k];
    }
    for (let k = 0; k < this.K; k++) this.down[k] /= sum;
    this.hl = new Float64Array(2 * H2);
    this.hr = new Float64Array(2 * H2);
    this.hp = 0;
    this.ol = new Float64Array(2 * this.K);
    this.or = new Float64Array(2 * this.K);
    this.op = 0;
    this.lc = new Float64Array(10);
    const lp = biquad('lowpass', cfg.split, sr * OS);
    this.lc.set(lp, 0);
    this.lc.set(lp, 5);
    this.lsL = new Float64Array(4); // Zustand der Band-Weiche je Kanal
    this.lsR = new Float64Array(4);
    const knee = (b) => { if (!b) return [Infinity, 1]; const g = dbToGain(MASTER_REF + b[0]); const a = g * dbToGain(-b[1]); return [a, g - a]; };
    [this.la, this.lw] = knee(cfg.low);
    [this.ha, this.hw] = knee(cfg.high);
    this.yl = 0;
    this.yr = 0;
  }

  // ein Abtastwert je Kanal hinein, Ergebnis (TP_HALF + OS_Q Werte zurück) in this.yl / this.yr
  step(xl, xr) {
    const H = TP_HALF;
    const H2 = 2 * H;
    const hl = this.hl;
    const hr = this.hr;
    hl[this.hp] = xl;
    hl[this.hp + H2] = xl;
    hr[this.hp] = xr;
    hr[this.hp + H2] = xr;
    this.hp = this.hp + 1 === H2 ? 0 : this.hp + 1;
    const w0 = this.hp;
    const up = this.up;
    const K = this.K;
    for (let j = 0; j < OS; j++) {
      let ul = hl[w0 + H - 1];
      let ur = hr[w0 + H - 1];
      if (j > 0) {
        ul = 0;
        ur = 0;
        const o = (j - 1) * H2;
        for (let m = 0; m < H2; m++) { ul += up[o + m] * hl[w0 + m]; ur += up[o + m] * hr[w0 + m]; }
      }
      const lol = runChain(this.lc, this.lsL, 2, ul);
      const lor = runChain(this.lc, this.lsR, 2, ur);
      const vl = soft(lol, this.la, this.lw) + soft(ul - lol, this.ha, this.hw);
      const vr = soft(lor, this.la, this.lw) + soft(ur - lor, this.ha, this.hw);
      this.ol[this.op] = vl;
      this.ol[this.op + K] = vl;
      this.or[this.op] = vr;
      this.or[this.op + K] = vr;
      this.op = this.op + 1 === K ? 0 : this.op + 1;
      if (j === 0) {
        // Rück-Tiefpass nur an den Stellen der Grundrate
        const d = this.down;
        const b = this.op;
        let al = 0;
        let ar = 0;
        for (let k = 0; k < K; k++) { al += d[k] * this.ol[b + k]; ar += d[k] * this.or[b + k]; }
        this.yl = al;
        this.yr = ar;
      }
    }
  }
}

export class MasterTone {
  constructor(sampleRate, styleId) {
    this.sr = sampleRate;
    this.eqC = new Float64Array(4 * 5);
    this.eqL = new Float64Array(8);
    this.eqR = new Float64Array(8);
    this.sideC = new Float64Array(5 * 5);
    this.sideS = new Float64Array(10);
    this.sideN = 3;
    this.scC = new Float64Array(5);
    this.scL = new Float64Array(2);
    this.scR = new Float64Array(2);
    this.scOn = false;
    this.clip = null; // Clipper (nur Stile mit `clip`)
    this.ms = 0; // geglättetes Quadrat (Pegeldetektor)
    this.grDb = 0; // aktuelle Pegelabsenkung des Kompressors
    this.setStyle(styleId);
  }

  setStyle(styleId) {
    const st = styleOf(styleId);
    const sr = this.sr;
    const eq = [biquad('highpass', st.eq.hp ?? 25, sr), biquad('lowshelf', st.eq.low[0], sr, st.eq.low[1]),
      biquad('peaking', st.eq.mud[0], sr, st.eq.mud[1], st.eq.mud[2]), biquad('highshelf', st.eq.high[0], sr, st.eq.high[1])];
    eq.forEach((c, i) => this.eqC.set(c, i * 5));
    // Seitensignal: unter 160 Hz weg (24 dB/Oktave), ab 3 kHz etwas breiter. Bass-Mono (st.mono): LR8 – unter
    // f/1,5 mindestens 30 dB weg, ab 2,5·f flach; die Mitte bleibt unberührt (L = M + S', R = M − S')
    const side = st.mono
      ? [0.5411961, 1.3065630, 0.5411961, 1.3065630].map((q) => biquad('highpass', st.mono, sr, 0, q))
      : [biquad('highpass', 160, sr), biquad('highpass', 160, sr)];
    side.push(biquad('highshelf', 3000, sr, st.width));
    this.sideS.fill(0);
    this.sideN = side.length;
    side.forEach((c, i) => this.sideC.set(c, i * 5));
    const cp = st.comp;
    this.scOn = !!cp.sc;
    if (this.scOn) { this.scC.set(biquad('highpass', cp.sc, sr)); this.scL.fill(0); this.scR.fill(0); }
    this.clip = st.clip ? new Clipper(sr, st.clip) : null;
    this.thr = cp.threshold;
    this.slope = 1 - 1 / cp.ratio;
    this.knee = 6;
    this.det = 1 - Math.exp(-1 / (0.01 * sr));
    this.att = 1 - Math.exp(-1 / (cp.attack * sr));
    this.rel = 1 - Math.exp(-1 / (cp.release * sr));
  }

  // pre: Eingangsverstärkung (linear); Ein- und Ausgabe dürfen dieselben Arrays sein
  process(inL, inR, outL, outR, n, pre) {
    const eqC = this.eqC;
    const sideC = this.sideC;
    const thr = this.thr;
    const knee = this.knee;
    const slope = this.slope;
    const sideN = this.sideN;
    const scOn = this.scOn;
    const clip = this.clip;
    for (let i = 0; i < n; i++) {
      const l = runChain(eqC, this.eqL, 4, inL[i] * pre);
      const r = runChain(eqC, this.eqR, 4, inR[i] * pre);
      const m = (l + r) * 0.5;
      const s = runChain(sideC, this.sideS, sideN, (l - r) * 0.5);
      const L = m + s;
      const R = m - s;
      // Bus-Kompressor: stereogekoppelt, RMS-Detektor, weiches Knie
      if (scOn) {
        const dl = runChain(this.scC, this.scL, 1, L);
        const dr = runChain(this.scC, this.scR, 1, R);
        this.ms += this.det * ((dl * dl + dr * dr) * 0.5 - this.ms);
      } else this.ms += this.det * ((L * L + R * R) * 0.5 - this.ms);
      const lev = 10 * Math.log10(this.ms + 1e-12);
      const over = lev - thr;
      let want = 0;
      if (over > knee / 2) want = over * slope;
      else if (over > -knee / 2) { const u = over + knee / 2; want = (slope * u * u) / (2 * knee); }
      this.grDb += (want > this.grDb ? this.att : this.rel) * (want - this.grDb);
      const g = Math.pow(10, -this.grDb / 20);
      let yl = L * g;
      let yr = R * g;
      if (clip) { clip.step(yl, yr); yl = clip.yl; yr = clip.yr; }
      outL[i] = yl;
      outR[i] = yr;
    }
  }
}

// Interpolationsfilter für die True-Peak-Erkennung: gefenstertes Sinc, Phasen 1/4, 2/4, 3/4
export function tpFilter(factor = TP_FACTOR, half = TP_HALF) {
  const taps = new Float64Array((factor - 1) * 2 * half);
  for (let j = 1; j < factor; j++) {
    const ph = j / factor;
    for (let m = -half + 1; m <= half; m++) {
      const t = m - ph; // Abstand des Abgriffs x[n0 + m] zur Zwischenstelle n0 + ph
      const sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / (half + 0.5));
      taps[(j - 1) * 2 * half + (m + half - 1)] = sinc * w;
    }
  }
  return taps;
}

export class TruePeakLimiter {
  constructor(sampleRate, styleId) {
    this.sr = sampleRate;
    this.D = Math.max(32, Math.round(0.005 * sampleRate)); // Vorausschau 5 ms = Ansprechzeit
    this.H = TP_HALF;
    this.latency = this.D + this.H;
    this.ceiling = dbToGain(CEILING_DB);
    this.taps = tpFilter();
    // Verlauf der Eingabe für den Interpolator: 2·H Werte je Kanal, doppelt abgelegt (Fenster ohne Umbruch lesbar)
    this.hl = new Float64Array(4 * this.H);
    this.hr = new Float64Array(4 * this.H);
    this.hp = 0;
    // Verzögerung des Audiosignals um die gesamte Latenz
    const N = this.latency + 1;
    this.dl = new Float32Array(N);
    this.dr = new Float32Array(N);
    this.dp = 0;
    // Gleitendes Minimum über D+1 Werte: monotone Warteschlange (Wert, Index) als Ring
    this.qv = new Float64Array(this.D + 2);
    this.qi = new Float64Array(this.D + 2);
    this.qh = 0;
    this.qn = 0;
    this.idx = 0;
    // Gleitender Mittelwert über D Werte
    this.box = new Float64Array(this.D);
    this.bp = 0;
    this.sum = this.D;
    this.box.fill(1);
    this.held = 1;
    this.pk = new Float64Array(4096);
    this.setStyle(styleId);
  }

  setStyle(styleId) {
    this.rel = 1 - Math.exp(-1 / (styleOf(styleId).release * this.sr));
  }

  // drive: Verstärkung vor dem Limiter (linear). Erkennung und Absenkung sind getrennt, damit die Analyse die
  // Spitzen einmal vorrechnen und viele Verstärkungen schnell probieren kann (Spitze von drive·x = drive·Spitze von x).
  process(inL, inR, outL, outR, n, drive) {
    this.detect(inL, inR, this.pk, n);
    this.apply(this.pk, inL, inR, outL, outR, n, drive);
  }

  // Spitze je Abtastwert (für die Stelle H Werte zurück): Abtastwert selbst und drei Zwischenwerte danach
  detect(inL, inR, peaks, n) {
    const H = this.H;
    const H2 = 2 * H;
    const taps = this.taps;
    const hl = this.hl;
    const hr = this.hr;
    for (let i = 0; i < n; i++) {
      const xl = inL[i];
      const xr = inR[i];
      // Verlauf: nach dem Schreiben liegt das Fenster (ältester … neuester Wert) bei hp … hp+2H−1
      hl[this.hp] = xl;
      hl[this.hp + H2] = xl;
      hr[this.hp] = xr;
      hr[this.hp + H2] = xr;
      this.hp = this.hp + 1 === H2 ? 0 : this.hp + 1;
      const w0 = this.hp;
      let peak = Math.abs(hl[w0 + H - 1]);
      let a = Math.abs(hr[w0 + H - 1]);
      if (a > peak) peak = a;
      for (let j = 0; j < 3; j++) {
        let al = 0;
        let ar = 0;
        const o = j * H2;
        for (let m = 0; m < H2; m++) {
          const c = taps[o + m];
          al += c * hl[w0 + m];
          ar += c * hr[w0 + m];
        }
        a = al < 0 ? -al : al;
        if (a > peak) peak = a;
        a = ar < 0 ? -ar : ar;
        if (a > peak) peak = a;
      }
      peaks[i] = peak;
    }
  }

  apply(peaks, inL, inR, outL, outR, n, drive) {
    const D = this.D;
    const qv = this.qv;
    const qi = this.qi;
    const Q = qv.length;
    const ceil = this.ceiling;
    const N = this.dl.length;
    for (let i = 0; i < n; i++) {
      this.dl[this.dp] = inL[i];
      this.dr[this.dp] = inR[i];
      const pk = peaks[i] * drive;
      const need = pk > ceil ? ceil / pk : 1;
      // Gleitendes Minimum der benötigten Verstärkung über die Vorausschau
      const k = this.idx++;
      while (this.qn > 0 && qv[(this.qh + this.qn - 1) % Q] >= need) this.qn--;
      qv[(this.qh + this.qn) % Q] = need;
      qi[(this.qh + this.qn) % Q] = k;
      this.qn++;
      while (qi[this.qh] <= k - D - 1) { this.qh = (this.qh + 1) % Q; this.qn--; }
      const mn = qv[this.qh];
      // Rückkehr mit Ausklingzeit, Absenkung sofort (bleibt dadurch immer ≤ Minimum)
      this.held = mn < this.held ? mn : this.held + (mn - this.held) * this.rel;
      // Mittelwert über D: Ansprechen als lineare Rampe, erreicht die Spitze rechtzeitig
      this.sum += this.held - this.box[this.bp];
      this.box[this.bp] = this.held;
      this.bp = this.bp + 1 === D ? 0 : this.bp + 1;
      const g = (this.sum / D) * drive;
      const rp = this.dp + 1 === N ? 0 : this.dp + 1; // ältester Wert = vor `latency` Abtastwerten
      outL[i] = this.dl[rp] * g;
      outR[i] = this.dr[rp] * g;
      this.dp = rp;
    }
  }
}

// Verzögerung der Kette in Abtastwerten: Vorausschau des Limiters, bei Stilen mit Clipper dazu dessen Filter
export const masterLatency = (sampleRate, styleId) => Math.max(32, Math.round(0.005 * sampleRate)) + TP_HALF
  + (styleOf(styleId).clip ? TP_HALF + OS_Q : 0);
