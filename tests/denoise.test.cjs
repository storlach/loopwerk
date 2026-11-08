// Rauschminderung (src/dsp/denoise.js): spektral (STFT 2048, 75 %, Hann, WOLA), Profil aus den leisesten Rahmen,
// Brummen 50/60 Hz, geglätteter Gewinn gegen „musical noise“, gemeinsamer Gewinn für alle Kanäle.
// Gemessen im Browser: Pausenpegel, Nutzton (Projektion auf den bekannten Sinus), Formanten, Brumm-Obertöne, Ausreißer im
// Spektrogramm, Bitgleichheit, Stereo (Pegelunterschied je Zelle), Ausschnitt = Ganzes, Worker = Hauptthread.
// Bedienung: Clip-Editor (Werkzeug „Entrauschen“, Stärke unter „Mehr“, Rückgängig, Desktop + Handy),
// Krachwerk-Werkbank (Rezeptfeld denoise, Regler „Rauschen weg“, Varianten, Schnitte, Rückgängig, Song-ZIP).
// node tests/denoise.test.cjs [--shots]   (Bilder nach SHOT_DIR, Standard docs/ux/denoise)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, createChecker, readSaved } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || path.join(__dirname, '..', 'docs', 'ux', 'denoise');

// Im Browser: Testsignale (fester Seed) und Messgrößen
function helpers() {
  const sr = 44100;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gaussian = (seed) => { const r = rng(seed); return () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); };
  const rms = (d, a = 0, b = d.length) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  const white = (n, seed) => { const g = gaussian(seed); const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = g(); return d; };
  const pink = (n, seed) => { // Paul Kellett
    const g = gaussian(seed); const d = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) { const w = g(); b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; }
    return d;
  };
  const scaleTo = (d, target) => { const r = rms(d); for (let i = 0; i < d.length; i++) d[i] *= target / r; return d; };
  // Ton/Akkord von 1 s bis 3 s (10-ms-Rampen), davor und danach Pause
  const chord = (n, freqs, amp, phase = 0) => {
    const d = new Float32Array(n);
    for (let i = sr; i < Math.min(n, 3 * sr); i++) {
      let v = 0; for (const f of freqs) v += Math.sin(2 * Math.PI * f * i / sr + phase);
      d[i] = amp * v * Math.min(1, (i - sr) / 441, (3 * sr - i) / 441);
    }
    return d;
  };
  // Vokal „a“: Pulsfolge 140 Hz durch drei Formant-Resonatoren (700, 1220, 2600 Hz), 1 s bis 3 s
  const vowel = (n) => {
    const src = new Float32Array(n), out = new Float32Array(n);
    for (let i = sr; i < 3 * sr; i++) { const ph = (i * 140 / sr) % 1; src[i] = ph < 140 / sr ? 1 : 0; }
    for (const [F, B] of [[700, 110], [1220, 120], [2600, 160]]) {
      const r = Math.exp(-Math.PI * B / sr), th = 2 * Math.PI * F / sr, a1 = -2 * r * Math.cos(th), a2 = r * r;
      let y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) { const v = src[i] - a1 * y1 - a2 * y2; out[i] += v; y2 = y1; y1 = v; }
    }
    let mx = 0; for (const v of out) mx = Math.max(mx, Math.abs(v));
    for (let i = 0; i < n; i++) out[i] *= (0.3 / mx) * Math.min(1, Math.max(0, (i - sr) / 2205), Math.max(0, (3 * sr - i) / 2205));
    return out;
  };
  const add = (a, b, g = 1) => a.map((v, i) => v + g * b[i]);
  // Amplitude des Sinus f im Bereich (Projektion, unabhängig vom Rauschen daneben)
  const tone = (d, f, a = 1.5 * sr, b = 2.5 * sr) => { let s = 0, c = 0; for (let i = a; i < b; i++) { s += d[i] * Math.sin(2 * Math.PI * f * i / sr); c += d[i] * Math.cos(2 * Math.PI * f * i / sr); } return 2 * Math.hypot(s, c) / (b - a); };
  let F = null;
  const dsp = async () => (F ??= { ...(await import('./src/dsp/denoise.js')), ...(await import('./src/dsp/fft.js')) });
  // Energie (dB) zwischen lo und hi Hz, 4096er Fenster über [a, b)
  const bandLevel = async (d, lo, hi, a, b) => {
    const { fft, hann } = await dsp(); const N = 4096, w = hann(N); let e = 0;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s = Math.round(a); s + N <= b; s += N / 2) { im.fill(0); for (let i = 0; i < N; i++) re[i] = d[s + i] * w[i]; fft(re, im); for (let k = Math.round(lo * N / sr); k <= Math.round(hi * N / sr); k++) e += re[k] * re[k] + im[k] * im[k]; }
    return 10 * Math.log10(e + 1e-30);
  };
  const band = (d, f, a = 1.5 * sr, b = 2.5 * sr) => bandLevel(d, f - 150, f + 150, a, b);
  // „Musical noise“: Anteil der Zellen (1024er STFT, Bänder 170 Hz … 21 kHz) mehr als 15 dB über dem Median ihres Bands.
  // Gauß-Rauschen (auch abgesenkt) hat praktisch keine (Wahrscheinlichkeit 2^−31,6), einzeln stehende Spitzen schon.
  const outliers = async (d, a, b) => {
    const { fft, hann } = await dsp(); const N = 1024, hop = 256, w = hann(N);
    const re = new Float64Array(N), im = new Float64Array(N); const rows = [];
    for (let s = a; s + N <= b; s += hop) { im.fill(0); for (let i = 0; i < N; i++) re[i] = d[s + i] * w[i]; fft(re, im); const r = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) r[k] = re[k] * re[k] + im[k] * im[k]; rows.push(r); }
    let over = 0, tot = 0;
    for (let k = 4; k < N / 2 - 4; k++) { const col = rows.map((r) => r[k]).sort((x, y) => x - y); const med = col[col.length >> 1]; for (const r of rows) { tot++; if (r[k] > med * 31.62) over++; } }
    return over / tot;
  };
  // Mittlere Abweichung des Pegelunterschieds L/R je Zelle (nur Zellen mit Signal)
  const ildDev = async (L, R, yl, yr) => {
    const { fft, hann } = await dsp(); const N = 2048, w = hann(N);
    const spec = (d, s) => { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = d[s + i] * w[i]; fft(re, im); return [re, im]; };
    const dev = [];
    for (let s = 0; s + N <= L.length; s += 1024) {
      const [a, b] = spec(L, s), [c, e] = spec(R, s), [f, g] = spec(yl, s), [h, k2] = spec(yr, s);
      for (let k = 2; k < 1000; k++) {
        const pl = a[k] ** 2 + b[k] ** 2, pr = c[k] ** 2 + e[k] ** 2;
        if (Math.max(pl, pr) < 1) continue;
        const ql = f[k] ** 2 + g[k] ** 2, qr = h[k] ** 2 + k2[k] ** 2;
        dev.push(Math.abs(10 * Math.log10((ql + 1e-30) / (qr + 1e-30)) - 10 * Math.log10((pl + 1e-30) / (pr + 1e-30))));
      }
    }
    dev.sort((x, y) => x - y);
    return { median: dev[dev.length >> 1], n: dev.length };
  };
  const corr = (a, b, s = sr, e = 3 * sr) => { let ab = 0, aa = 0, bb = 0; for (let i = s; i < e; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb); };
  const lagOf = (ref, y, a, b, max = 64) => { let best = -Infinity, at = 0; for (let L = -max; L <= max; L++) { let s = 0; for (let i = a; i < b; i++) s += ref[i] * y[i + L]; if (s > best) { best = s; at = L; } } return at; };
  const maxStep = (d, a = 1, b = d.length) => { let m = 0; for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; };
  const toBuf = (chs) => { const b = new AudioBuffer({ numberOfChannels: chs.length, length: chs[0].length, sampleRate: sr }); chs.forEach((d, c) => b.copyToChannel(d, c)); return b; };
  // Rauschiger Akkord (A-Dur, SNR 15 dB) als Testsignal für Editor und Werkbank
  const noisyChord = (n = 4 * sr) => { const c = chord(n, [220, 277.18, 329.63], 0.15); const sig = rms(c, sr, 3 * sr); return { clean: c, x: add(c, scaleTo(white(n, 5), sig / 10 ** (15 / 20))) }; };
  window.T = { sr, rms, db, white, pink, scaleTo, chord, vowel, add, tone, band, bandLevel, outliers, ildDev, corr, lagOf, maxStep, toBuf, noisyChord, dsp };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  if (SHOTS) fs.mkdirSync(DIR, { recursive: true });
  try {
    await page.evaluate(helpers);

    // ---------- (a) Akkord + weißes Rauschen, SNR 15 dB ----------
    const a = await page.evaluate(async () => {
      const T = window.T; const { denoise } = await T.dsp(); const { runJob } = await import('./src/dsp/run.js');
      const n = 4 * T.sr; const freqs = [220, 277.18, 329.63];
      const clean = T.chord(n, freqs, 0.15);
      const noise = T.scaleTo(T.white(n, 1), T.rms(clean, T.sr, 3 * T.sr) / 10 ** (15 / 20));
      const x = T.add(clean, noise);
      const t0 = performance.now();
      const [y] = await runJob('denoise', { chs: [x], sampleRate: T.sr, opts: { amount: 1 } });
      const ms = Math.round(performance.now() - t0);
      const [yLocal] = denoise([x], T.sr, { amount: 1 });
      // Der Worker selbst (ohne Rückfall in den Hauptthread) kennt den Job
      const direct = await new Promise((res) => {
        const wk = new Worker('./src/dsp/worker.js', { type: 'module' });
        wk.onmessage = (ev) => { if (ev.data.id === 7) { wk.terminate(); res(ev.data.result ? ev.data.result[0] : null); } };
        wk.onerror = () => res(null);
        wk.postMessage({ id: 7, job: 'denoise', args: { chs: [x.slice()], sampleRate: T.sr, opts: { amount: 1 } } });
        setTimeout(() => res(null), 20000);
      });
      const [y5] = denoise([x], T.sr, { amount: 0.5 });
      const pause = (d) => T.rms(d, Math.round(0.2 * T.sr), Math.round(0.9 * T.sr));
      let same = y.length === yLocal.length; for (let i = 0; same && i < y.length; i++) same = y[i] === yLocal[i];
      let worker = !!direct && direct.length === yLocal.length; for (let i = 0; worker && i < y.length; i++) worker = direct[i] === yLocal[i];
      return {
        len: [x.length, y.length], red: T.db(pause(x)) - T.db(pause(y)), red5: T.db(pause(x)) - T.db(pause(y5)),
        tones: freqs.map((f) => T.db(T.tone(y, f)) - T.db(T.tone(clean, f))), lag: T.lagOf(clean, y, T.sr + 2000, 3 * T.sr - 2000),
        same, worker, ms, edge: { x: T.maxStep(x, 1, 2205), y: T.maxStep(y, 1, 2205), xe: T.maxStep(x, n - 2205), ye: T.maxStep(y, n - 2205), first: Math.abs(y[0] - x[0]) },
      };
    });
    check('(a) Akkord + weißes Rauschen (SNR 15 dB), Stärke 1: Pausen-Rauschen sinkt um ≥ 15 dB', a.red >= 15, `${a.red.toFixed(1)} dB`);
    check('(a) Nutzton: jeder der drei Töne ändert sich um ≤ 1 dB', a.tones.every((v) => Math.abs(v) <= 1), a.tones.map((v) => v.toFixed(2)).join(' / ') + ' dB');
    check('(a) Länge gleich, keine Verschiebung (Kreuzkorrelation mit dem sauberen Akkord: Spitze bei 0)', a.len[0] === a.len[1] && a.lag === 0, `${a.len.join(' → ')}, Spitze bei ${a.lag}`);
    check('(a) Stärke 0,5 („mittel“) senkt etwa halb so stark (10 … 20 dB)', a.red5 >= 10 && a.red5 <= 20, `${a.red5.toFixed(1)} dB`);
    check('(a) Worker (Job „denoise“, direkt und über runJob) liefert bitgleich dasselbe wie der Hauptthread', a.same && a.worker, `${a.ms} ms für 4 s, direkt: ${a.worker}`);
    check('(a) Kein Klick am Anfang/Ende: größter Sprung in den ersten/letzten 50 ms nicht größer als im Eingang', a.edge.y <= a.edge.x && a.edge.ye <= a.edge.xe, JSON.stringify(a.edge));

    // ---------- (b) Vokal + rosa Rauschen ----------
    const b = await page.evaluate(async () => {
      const T = window.T; const { denoise } = await T.dsp();
      const n = 4 * T.sr; const v = T.vowel(n);
      const x = T.add(v, T.scaleTo(T.pink(n, 2), T.rms(v, T.sr, 3 * T.sr) / 10 ** (12 / 20)));
      const [y] = denoise([x], T.sr, { amount: 1 });
      // Rosa Rauschen hat in jeder Oktave gleich viel Energie, auch unter 20 Hz: gemessen wird der hörbare Bereich
      const pause = (d) => T.bandLevel(d, 40, 16000, 0.1 * T.sr, 0.95 * T.sr);
      const F = [700, 1220, 2600];
      const fm = [];
      for (const f of F) fm.push({ f, noisy: (await T.band(x, f)) - (await T.band(v, f)), out: (await T.band(y, f)) - (await T.band(v, f)) });
      return { red: (await pause(x)) - (await pause(y)), fm };
    });
    check('(b) Vokal + rosa Rauschen (SNR 12 dB): Pausen-Rauschen (40 Hz … 16 kHz) sinkt um ≥ 15 dB', b.red >= 15, `${b.red.toFixed(1)} dB`);
    check('(b) Formanten 700 / 1220 / 2600 Hz bleiben (Bandpegel ± 1,5 dB zum sauberen Vokal)', b.fm.every((m) => Math.abs(m.out) <= 1.5), b.fm.map((m) => `${m.f}: ${m.out.toFixed(2)} dB`).join(', '));

    // ---------- (c) Brummen 50/60 Hz + Obertöne ----------
    const c = await page.evaluate(async () => {
      const T = window.T; const { denoise, noiseProfile } = await T.dsp();
      const n = 4 * T.sr; const out = {};
      for (const f0 of [50, 60]) {
        const hum = new Float32Array(n);
        for (let i = 0; i < n; i++) { let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * i / T.sr + h) / h; hum[i] = 0.03 * v; }
        const music = T.chord(n, [440, 554.37], 0.2);
        const x = T.add(T.add(music, hum), T.white(n, 3), 0.002);
        const [y] = denoise([x], T.sr, { amount: 1 });
        out[f0] = {
          found: noiseProfile([x], T.sr).hum,
          red: [1, 2, 3, 4, 5].map((h) => T.db(T.tone(y, f0 * h, 0, n)) - T.db(T.tone(x, f0 * h, 0, n))),
          music: [440, 554.37].map((f) => T.db(T.tone(y, f)) - T.db(T.tone(music, f))),
        };
      }
      // Gegenstück: stehende Basstöne (G2 98 Hz, G1 49 Hz – 1 Hz neben dem Netz) sind kein Brummen und bleiben
      out.drone = [];
      for (const fd of [98, 49]) {
        const drone = new Float32Array(n);
        for (let i = 0; i < n; i++) drone[i] = 0.1 * Math.sin(2 * Math.PI * fd * i / T.sr);
        const xd = T.add(drone, T.white(n, 4), 0.01);
        const [yd] = denoise([xd], T.sr, { amount: 1 });
        out.drone.push({ f: fd, hum: noiseProfile([xd], T.sr).hum.length, change: T.db(T.tone(yd, fd, T.sr, 3 * T.sr)) - T.db(T.tone(xd, fd, T.sr, 3 * T.sr)) });
      }
      return out;
    });
    for (const f0 of [50, 60]) {
      check(`(c) ${f0}-Hz-Brummen erkannt, Grundton und Obertöne 2–5 um ≥ 15 dB gesenkt`, c[f0].found[0] === f0 && c[f0].red.every((v) => v <= -15), `erkannt ${c[f0].found.join(',')} Hz · ${c[f0].red.map((v) => v.toFixed(1)).join(' / ')} dB`);
      check(`(c) ${f0} Hz: Musik daneben ändert sich um ≤ 1 dB`, c[f0].music.every((v) => Math.abs(v) <= 1), c[f0].music.map((v) => v.toFixed(2)).join(' / ') + ' dB');
    }
    check('(c) Stehende Basstöne 98 Hz und 49 Hz gelten nicht als Brummen und bleiben (± 1 dB)', c.drone.every((x) => x.hum === 0 && Math.abs(x.change) <= 1), JSON.stringify(c.drone));

    // ---------- (d) „musical noise“ ----------
    const d = await page.evaluate(async () => {
      const T = window.T; const { denoise } = await T.dsp();
      const { x } = T.noisyChord();
      const [y] = denoise([x], T.sr, { amount: 1 });
      const [naive] = denoise([x], T.sr, { amount: 1, smooth: false });
      return { input: await T.outliers(x, 0, T.sr), out: await T.outliers(y, 0, T.sr), naive: await T.outliers(naive, 0, T.sr) };
    });
    check('(d) Musical noise: in der reinen Rauschpassage < 0,2 % Zellen mehr als 15 dB über dem Median ihres Bands', d.out < 0.002, `${(d.out * 100).toFixed(3)} % (Eingang ${(d.input * 100).toFixed(3)} %)`);
    check('(d) Gegenprobe Maß: ohne Glättung (einfache Subtraktion) > 2 % Ausreißer', d.naive > 0.02, `${(d.naive * 100).toFixed(2)} %`);

    // ---------- (e) Stärke 0 bitgleich, Ausschnitt = Ganzes ----------
    const e = await page.evaluate(async () => {
      const T = window.T; const { denoise } = await T.dsp();
      const { x } = T.noisyChord();
      const r = T.white(x.length, 9);
      const [z0, z1] = denoise([x, r], T.sr, { amount: 0 });
      const zero = z0 !== x && z0.every((v, i) => v === x[i]) && z1.every((v, i) => v === r[i]);
      const [full] = denoise([x], T.sr, { amount: 0.7 });
      const [part] = denoise([x], T.sr, { amount: 0.7, from: 50000, to: 120000 });
      let diff = 0; for (let i = 0; i < part.length; i++) diff = Math.max(diff, Math.abs(part[i] - full[50000 + i]));
      const short = T.white(5000, 3);
      const [s] = denoise([short], T.sr, { amount: 1 });
      return { zero, diff, partLen: part.length, short: s.every((v, i) => v === short[i]) };
    });
    check('(e) Stärke 0: bitgleich (neue Kanäle, gleiche Werte)', e.zero);
    check('(e) Ausschnitt 50 000 … 120 000 ist samplegleich mit derselben Stelle des Ganzen (Schnitte, Auswahl)', e.diff === 0 && e.partLen === 70000, `größte Abweichung ${e.diff}`);
    check('(e) Zu kurz für ein Profil (< 0,25 s): bleibt unverändert', e.short);

    // ---------- (f) Stereo ----------
    const f = await page.evaluate(async () => {
      const T = window.T; const { denoise } = await T.dsp();
      const n = 4 * T.sr;
      // Getrennte Quellen: 330 Hz nur links, 1250 Hz nur rechts
      const cl = T.chord(n, [330], 0.2), cr = T.chord(n, [1250], 0.2, 0.3);
      const L = T.add(cl, T.white(n, 11), 0.01), R = T.add(cr, T.white(n, 12), 0.01);
      const [yl, yr] = denoise([L, R], T.sr, { amount: 1 });
      const [ul, ur] = denoise([L, R], T.sr, { amount: 1, link: false });
      // Gemischte Quellen (A links betont, B rechts): Korrelation L/R
      const A = T.chord(n, [330], 0.2), B = T.chord(n, [523.25], 0.2, 1);
      const ml = T.add(T.add(A, B, 0.4), T.white(n, 13), 0.005), mr = T.add(T.add(B, A, 0.4), T.white(n, 14), 0.005);
      const [ol, or] = denoise([ml, mr], T.sr, { amount: 1 });
      return {
        linked: await T.ildDev(L, R, yl, yr), split: await T.ildDev(L, R, ul, ur),
        corrClean: T.corr(T.add(A, B, 0.4), T.add(B, A, 0.4)), corrIn: T.corr(ml, mr), corrOut: T.corr(ol, or),
        ild: [T.db(T.tone(ol, 330)) - T.db(T.tone(or, 330)), T.db(T.tone(ml, 330)) - T.db(T.tone(mr, 330))],
      };
    });
    check('(f) Stereo: Pegelunterschied L/R je Zelle bleibt (Median der Abweichung < 0,5 dB)', f.linked.median < 0.5, `${f.linked.median.toFixed(3)} dB über ${f.linked.n} Zellen`);
    check('(f) Gegenprobe: mit getrenntem Gewinn je Kanal verschiebt sich das Bild (> 10 dB)', f.split.median > 10, `${f.split.median.toFixed(1)} dB`);
    check('(f) Korrelation L/R bleibt (± 0,02) und Pegelverhältnis der linken Quelle ± 0,2 dB', Math.abs(f.corrOut - f.corrIn) <= 0.02 && Math.abs(f.ild[0] - f.ild[1]) <= 0.2,
      `Korrelation sauber ${f.corrClean.toFixed(3)}, vorher ${f.corrIn.toFixed(3)}, nachher ${f.corrOut.toFixed(3)} · ${f.ild.map((v) => v.toFixed(2)).join(' → ')} dB`);

    // ---------- (g) Clip-Editor: Werkzeug, Wirkung, Vorhören, Rückgängig ----------
    const setup = () => page.evaluate(async () => {
      const { library, store, editor } = window.loopwerk; const T = window.T;
      const { x } = T.noisyChord();
      library.register({ id: 'dn-noisy', name: 'Rauschiger Akkord', category: 'fx', lengthBeats: 8, bpm: 120, buffer: T.toBuf([x, x]) });
      const t = store.project.tracks[0].id;
      const cid = store.addClip(t, 'dn-noisy', 0, 8);
      editor.open(cid);
      return cid;
    });
    const waitChange = (before) => page.waitForFunction((b) => window.loopwerk.editor.state && window.loopwerk.editor.state.chs !== window.__dnPrev && window.loopwerk.editor.state.history.length !== b, before, { timeout: 15000 }).catch(() => null);
    await setup();
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.waitForTimeout(500);
    const g0 = await page.evaluate(() => {
      const b = document.getElementById('ed-denoise');
      const r = b.getBoundingClientRect();
      const crop = document.getElementById('ed-crop').getBoundingClientRect();
      const rows = new Set([...document.querySelectorAll('#editor .ed-tool')].map((t) => Math.round(t.getBoundingClientRect().top))).size;
      return { row1: Math.abs(r.top - crop.top) < 2, rows, group: b.closest('.ed-cutgroup')?.getAttribute('aria-label'), svg: !!b.querySelector('svg.ico-line'), title: b.title, label: b.textContent.trim(), w: r.width, h: r.height, visible: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
    check('(g) Desktop: Werkzeug „Entrauschen“ in der Werkzeugzeile (eigene Gruppe „Säubern“ neben den Schnittwerkzeugen, erste Reihe), Linien-Icon, Titel', g0.group === 'Säubern' && g0.row1 && g0.svg && /Rauschen entfernen/.test(g0.title) && g0.label === 'Entrauschen' && g0.visible && g0.rows === 2, JSON.stringify(g0));
    // Vorhören läuft, dann ein Klick
    await page.click('#ed-play');
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__dnPrev = window.loopwerk.editor.state.chs; window.__dnOrig = window.loopwerk.editor.state.chs.map((d) => d.slice()); window.__dnPv = window.loopwerk.engine.preview; });
    await page.click('#ed-denoise');
    await waitChange(0);
    await page.waitForTimeout(300);
    const g1 = await page.evaluate(() => {
      const { editor, engine, ui } = window.loopwerk; const T = window.T; const st = editor.state;
      const pause = (d) => T.rms(d, Math.round(0.2 * T.sr), Math.round(0.9 * T.sr));
      return {
        red: T.db(pause(window.__dnOrig[0])) - T.db(pause(st.chs[0])), len: st.chs[0].length === window.__dnOrig[0].length, history: st.history.length,
        pressed: document.getElementById('ed-denoise').getAttribute('aria-pressed'), flash: ui.flashText,
        replayed: !!engine.preview && engine.preview !== window.__dnPv,
      };
    });
    check('(g) Ein Klick: Rauschen sinkt (Voreinstellung mittel, ≥ 10 dB in der Pause), Länge gleich, ein Rückgängig-Schritt, Taste leuchtet', g1.red >= 10 && g1.len && g1.history === 1 && g1.pressed === 'true', JSON.stringify(g1));
    check('(g) Vorhören: die Loop-Wiedergabe läuft mit dem neuen Klang weiter, Einblender nennt „Mehr“', g1.replayed && /Stärke unter „Mehr“/.test(g1.flash || ''), JSON.stringify({ replayed: g1.replayed, flash: g1.flash }));
    // Stärke in „Mehr“: 100 % rechnet vom selben Stand aus neu (weiter ein Schritt)
    await page.click('#clip-more');
    await page.evaluate(() => { window.__dnPrev = window.loopwerk.editor.state.chs; const s = document.getElementById('ed-dn-strength'); s.value = '1'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => window.loopwerk.editor.state.chs !== window.__dnPrev, null, { timeout: 15000 }).catch(() => null);
    const g2 = await page.evaluate(() => {
      const st = window.loopwerk.editor.state; const T = window.T;
      const pause = (d) => T.rms(d, Math.round(0.2 * T.sr), Math.round(0.9 * T.sr));
      return { red: T.db(pause(window.__dnOrig[0])) - T.db(pause(st.chs[0])), history: st.history.length, out: document.getElementById('ed-dn-value').textContent, group: document.querySelector('#ed-tools .ed-group[aria-label="Rauschen"] .ed-group-label')?.textContent };
    });
    check('(g) „Mehr“ → Stärke 100 %: stärker (≥ 20 dB), immer noch ein Rückgängig-Schritt, Anzeige „100 %“', g2.red >= 20 && g2.history === 1 && g2.out === '100 %' && g2.group === 'Rauschen entfernen', JSON.stringify(g2));
    if (SHOTS) {
      await page.evaluate(() => { const b = document.querySelector('#editor .editor-body'); const g = document.querySelector('#ed-tools .ed-group[aria-label="Rauschen"]'); b.scrollTop = g.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 8; });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(DIR, 'editor-desktop-mehr.png') });
    }
    await page.click('#ed-undo');
    await page.waitForTimeout(200);
    const g3 = await page.evaluate(() => {
      const st = window.loopwerk.editor.state; const o = window.__dnOrig;
      let same = st.chs.length === o.length; for (let c = 0; same && c < o.length; c++) for (let i = 0; same && i < o[c].length; i++) same = st.chs[c][i] === o[c][i];
      return { same, history: st.history.length, pressed: document.getElementById('ed-denoise').getAttribute('aria-pressed') };
    });
    check('(g) Rückgängig stellt bitgleich her, Taste aus', g3.same && g3.history === 0 && g3.pressed === 'false', JSON.stringify(g3));
    // Auswahl: nur der Bereich ändert sich, Ränder ohne Sprung
    await page.evaluate(() => { const st = window.loopwerk.editor.state; st.sel = [Math.round(0.3 * 44100), Math.round(0.8 * 44100)]; window.__dnPrev = st.chs; });
    await page.click('#ed-denoise');
    await page.waitForFunction(() => window.loopwerk.editor.state.chs !== window.__dnPrev, null, { timeout: 15000 }).catch(() => null);
    const g4 = await page.evaluate(() => {
      const st = window.loopwerk.editor.state; const o = window.__dnOrig[0]; const y = st.chs[0]; const T = window.T;
      const a = Math.round(0.3 * T.sr), b = Math.round(0.8 * T.sr);
      let outside = true; for (let i = 0; i < y.length && outside; i++) if (i < a || i >= b) outside = y[i] === o[i];
      return { outside, red: T.db(T.rms(o, a + 4410, b - 4410)) - T.db(T.rms(y, a + 4410, b - 4410)), stepA: T.maxStep(y, a - 50, a + 500), stepB: T.maxStep(y, b - 500, b + 50), stepIn: T.maxStep(o, a - 50, b + 50) };
    });
    check('(g) Mit Auswahl: außerhalb bitgleich, innen leiser, an den Rändern kein größerer Sprung als im Original', g4.outside && g4.red >= 15 && g4.stepA <= g4.stepIn && g4.stepB <= g4.stepIn, JSON.stringify(g4));
    if (SHOTS) {
      await page.evaluate(() => document.getElementById('clip-more').click());
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(DIR, 'editor-desktop.png') });
    }
    await page.evaluate(() => { window.loopwerk.engine.stopPreview(); window.loopwerk.editor.close(); });

    // ---------- (g) Handy ----------
    {
      const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
      const p = phone.page;
      try {
        await p.evaluate(helpers);
        await p.evaluate(async () => {
          const { library, store, editor } = window.loopwerk; const T = window.T;
          const { x } = T.noisyChord();
          library.register({ id: 'dn-noisy', name: 'Rauschiger Akkord', category: 'fx', lengthBeats: 8, bpm: 120, buffer: T.toBuf([x, x]) });
          editor.open(store.addClip(store.project.tracks[0].id, 'dn-noisy', 0, 8));
        });
        await p.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
        await p.waitForTimeout(900);
        await p.evaluate(() => document.getElementById('ed-denoise').scrollIntoView({ inline: 'center', block: 'nearest' }));
        await p.waitForTimeout(300);
        const h0 = await p.evaluate(() => {
          const b = document.getElementById('ed-denoise'); const r = b.getBoundingClientRect(); const strip = document.querySelector('#editor .ed-cuts');
          const t = [...strip.querySelectorAll('.ed-tool')];
          return { w: r.width, h: r.height, inStrip: strip.contains(b), oneRow: new Set(t.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1, inView: r.left >= 0 && r.right <= innerWidth, over: document.documentElement.scrollWidth - innerWidth };
        });
        check('(g) Handy: Icon ≥ 44 px in der wischbaren Werkzeugzeile, kein seitliches Scrollen', h0.w >= 43.5 && h0.h >= 43.5 && h0.inStrip && h0.oneRow && h0.inView && h0.over <= 0, JSON.stringify(h0));
        await p.evaluate(() => { window.__dnPrev = window.loopwerk.editor.state.chs; window.__dnOrig = window.__dnPrev.map((d) => d.slice()); });
        await p.tap('#ed-denoise');
        await p.waitForFunction(() => window.loopwerk.editor.state.chs !== window.__dnPrev, null, { timeout: 15000 }).catch(() => null);
        if (SHOTS) await p.screenshot({ path: path.join(DIR, 'editor-handy.png') });
        const h1 = await p.evaluate(() => { const T = window.T; const st = window.loopwerk.editor.state; const pause = (d) => T.rms(d, Math.round(0.2 * T.sr), Math.round(0.9 * T.sr)); return { red: T.db(pause(window.__dnOrig[0])) - T.db(pause(st.chs[0])), pressed: document.getElementById('ed-denoise').getAttribute('aria-pressed') }; });
        await p.tap('#ed-undo');
        await p.waitForTimeout(200);
        const h2 = await p.evaluate(() => { const st = window.loopwerk.editor.state; const o = window.__dnOrig; return o.every((d, c) => d.every((v, i) => v === st.chs[c][i])); });
        check('(g) Handy: Tipp wirkt (≥ 10 dB), Rückgängig bitgleich', h1.red >= 10 && h1.pressed === 'true' && h2, JSON.stringify({ ...h1, undo: h2 }));
        if (SHOTS) {
          await p.evaluate(() => document.getElementById('clip-more').click());
          await p.waitForTimeout(150);
          await p.evaluate(() => { const b = document.querySelector('#editor .editor-body'); const g = document.querySelector('#ed-tools .ed-group[aria-label="Rauschen"]'); b.scrollTop = g.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 8; });
          await p.waitForTimeout(250);
          await p.screenshot({ path: path.join(DIR, 'editor-handy-mehr.png') });
        }
        check('(g) Handy: keine Konsolenfehler', phone.errors.length === 0, phone.errors.join(' | '));
      } finally { await phone.close(); }
    }

    // ---------- (h) Krachwerk: Rezept denoise ----------
    const kw = await app.browser.newPage({ viewport: { width: 1440, height: 900 } });
    const kwErr = [];
    kw.on('pageerror', (er) => kwErr.push(er.message));
    kw.on('console', (m) => { if (m.type() === 'error') kwErr.push(m.text()); });
    await kw.goto(new URL('/werkstatt/', app.url).href);
    await kw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await kw.evaluate(helpers);
    const h = await kw.evaluate(async () => {
      const { own, store, library, renderProject } = window.loopwerk; const T = window.T;
      const M = await import('./src/model.js');
      const { x } = T.noisyChord();
      const snd = await own.create({ name: 'Brumm 1', buffer: T.toBuf([x]) });
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      store.setProjectName('Entrauscht');
      const cid = store.addClip('t1', snd.id, 0, 8);
      await library.applyRecipes(store.project);
      const u0 = store.undoStack.length;
      store.setRecipe(snd.id, { denoise: 1 });
      await library.applyRecipes(store.project);
      const s = library.get(snd.id);
      const cooked = s.cooked?.getChannelData(0);
      const pause = (d) => T.rms(d, Math.round(0.2 * T.sr), Math.round(0.9 * T.sr));
      const render = async () => (await renderProject(store.project, library, { limiter: false, toBeat: 8 })).getChannelData(0).slice();
      const r1 = await render();
      // Variante erbt
      const vr = store.addVariant(snd.id);
      const vRec = store.project.recipes[vr]?.denoise ?? null;
      await library.applyRecipes(store.project);
      const vc = library.get(vr)?.cooked?.getChannelData(0);
      let vSame = !!vc && vc.length === cooked.length; for (let i = 0; vSame && i < vc.length; i++) vSame = vc[i] === cooked[i];
      // Schnitt erbt und klingt wie die Stelle in der Quelle (bis auf die 2-ms-Kanten)
      const cut = store.cutSound(snd.id, [{ start: 0.5, end: 1.5 }]);
      const cutRec = store.project.recipes[cut.ids[0]]?.denoise ?? null;
      await library.applyRecipes(store.project);
      const cc = library.get(cut.ids[0])?.cooked?.getChannelData(0);
      const a0 = Math.round(0.5 * T.sr); let cutDiff = 0;
      for (let i = 200; i < cc.length - 200; i++) cutDiff = Math.max(cutDiff, Math.abs(cc[i] - cooked[a0 + i]));
      const steps = (await import('./src/recipe.js')).recipeSteps(store.project.recipes[snd.id]);
      store.undo(); store.undo(); // Schnitt, Variante
      const keep = store.project.recipes[snd.id]?.denoise;
      store.undo(); // Rezept
      await library.applyRecipes(store.project);
      const back = library.get(snd.id);
      const b0 = back.buffer.getChannelData(0);
      let undoSame = b0.length === x.length; for (let i = 0; undoSame && i < x.length; i++) undoSame = b0[i] === x[i];
      store.redo();
      await library.applyRecipes(store.project);
      return {
        id: snd.id, cid, red: T.db(pause(x)) - T.db(pause(cooked)), renderRed: T.db(pause(x)) - T.db(pause(r1)), len: cooked.length === x.length,
        undoSteps: store.undoStack.length - u0, vr, vRec, vSame, cutRec, cutDiff, cutLen: cc.length, keep, undoSame,
        recipe: store.project.recipes?.[snd.id], steps, cookedNull: back.cooked == null,
      };
    });
    check('(h) Rezept denoise 1: gebackener Klang leiser in der Pause (≥ 15 dB), Länge gleich, Original bleibt', h.red >= 15 && h.len, `${h.red.toFixed(1)} dB`);
    check('(h) Offline-Render (renderProject) spielt den entrauschten Klang (≥ 15 dB)', h.renderRed >= 15, `${h.renderRed.toFixed(1)} dB`);
    check('(h) Variante erbt denoise und klingt bitgleich wie das Original-Rezept', h.vRec === 1 && h.vSame, JSON.stringify({ rec: h.vRec, same: h.vSame }));
    check('(h) Schnitt erbt denoise und ist samplegleich mit der Stelle in der Quelle (ohne die 2-ms-Kanten)', h.cutRec === 1 && h.cutDiff < 1e-6, `Rezept ${h.cutRec}, größte Abweichung ${h.cutDiff}`);
    check('(h) Stammbaum nennt „entrauscht“; Rückgängig nimmt das Rezept weg (Puffer bitgleich mit dem Original), Wiederholen bringt es zurück', h.steps.includes('entrauscht') && h.keep === 1 && h.undoSame && h.recipe?.denoise === 1, JSON.stringify({ steps: h.steps, keep: h.keep, undo: h.undoSame, recipe: h.recipe }));
    // Werkbank: Reiter Farbe, Regler „Rauschen weg“
    await kw.evaluate((cid) => window.loopwerk.ui.select(cid), h.cid);
    await kw.waitForTimeout(500);
    await kw.click('#wb-tab-farbe');
    await kw.waitForTimeout(250);
    const w0 = await kw.evaluate(() => {
      const i = document.getElementById('wb-denoise');
      const vis = (e) => e.getClientRects().length > 0 && !e.closest('[hidden]');
      const g = document.querySelector('[role=tabpanel]:not([hidden]) .wb-grund');
      return { inGrund: !!i && g.contains(i), first: g.querySelector('input') === i, label: i?.closest('label')?.firstChild.textContent, out: i?.closest('label')?.querySelector('output')?.textContent, value: i?.value, grund: [...g.querySelectorAll('button, input:not([type=hidden]), select, [role=slider]')].filter(vis).length };
    });
    check('(h) Werkbank Reiter Farbe: zuerst „Rauschen weg“ (zeigt 100 %), Grund ≤ 5 Griffe', w0.inGrund && w0.first && w0.label === 'Rauschen weg' && w0.out === '100 %' && w0.grund <= 5, JSON.stringify(w0));
    const u1 = await kw.evaluate(() => window.loopwerk.store.undoStack.length);
    await kw.evaluate(() => { const i = document.getElementById('wb-denoise'); for (const v of ['0.8', '0.6', '0.4']) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } i.dispatchEvent(new Event('change', { bubbles: true })); });
    await kw.waitForTimeout(300);
    const w1 = await kw.evaluate((u) => ({ v: window.loopwerk.store.project.recipes?.[Object.keys(window.loopwerk.store.project.recipes)[0]]?.denoise, steps: window.loopwerk.store.undoStack.length - u, out: document.getElementById('wb-denoise').closest('label').querySelector('output').textContent }), u1);
    check('(h) Regler ziehen: Rezept 0,4, ein Rückgängig-Schritt, Anzeige 40 %', w1.v === 0.4 && w1.steps === 1 && w1.out === '40 %', JSON.stringify(w1));
    if (SHOTS) await kw.screenshot({ path: path.join(DIR, 'werkbank-desktop.png') });
    // Song-ZIP enthält das Feld (auch an einer neuen Variante)
    const vr2 = await kw.evaluate((id) => window.loopwerk.store.addVariant(id), h.id);
    const [download] = await Promise.all([kw.waitForEvent('download'), kw.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-denoise.zip');
    await download.saveAs(saved);
    const json = readSaved(saved);
    check('(h) Song-ZIP (Sicherung) enthält recipes[…].denoise = 0,4 und die Variante mit denoise', json.recipes?.[h.id]?.denoise === 0.4 && json.recipes?.[vr2]?.denoise === 0.4 && json.recipes?.[vr2]?.parent === h.id, JSON.stringify(json.recipes));
    check('(h) Krachwerk: keine Konsolenfehler', kwErr.length === 0, kwErr.join(' | '));
    await kw.close();

    // Werkbank am Handy (Bild)
    if (SHOTS) {
      const ctx = await app.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const ph = await ctx.newPage();
      await ph.goto(new URL('/werkstatt/', app.url).href);
      await ph.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await ph.evaluate(helpers);
      await ph.evaluate(async () => {
        const { own, store, ui } = window.loopwerk; const T = window.T;
        const { x } = T.noisyChord();
        const snd = await own.create({ name: 'Brumm 1', buffer: T.toBuf([x]) });
        const cid = store.addClip('t1', snd.id, 0, 8);
        store.setRecipe(snd.id, { denoise: 0.5 });
        ui.select(cid);
      });
      await ph.waitForTimeout(600);
      await ph.tap('#cf-werkbank').catch(() => {});
      await ph.waitForTimeout(1100);
      await ph.tap('#wb-tab-farbe');
      await ph.waitForTimeout(400);
      const inView = await ph.evaluate(() => { const r = document.getElementById('wb-denoise').getBoundingClientRect(); const bar = document.getElementById('tabbar').getBoundingClientRect(); return r.top >= 0 && r.bottom <= bar.top + 1; });
      check('(h) Handy: Regler „Rauschen weg“ liegt bei „Mitte“ im Bild', inView);
      await ph.screenshot({ path: path.join(DIR, 'werkbank-handy.png') });
      await ctx.close();
    }

    check('Loopwerk: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test ohne Ausnahme', false, err.stack || String(err));
  } finally {
    await app.close();
    finish();
  }
})();
