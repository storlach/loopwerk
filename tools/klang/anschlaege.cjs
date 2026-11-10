// Wozu: Anschläge vor/nach der Tempo-Dehnung (src/dsp/stretch.js) zählen und ihre Lage gegen den Sollzeitpunkt
//       (Anschlag · Faktor) prüfen – Doppelschläge, verschluckte Schläge, Versatz (Klanganalyse W7, ADR 001 Nachtrag).
// Aufruf:  node tools/klang/anschlaege.cjs <datei.wav | Sound-Name> [--faktoren 0.6,0.75,…] [--einzelklang] [--json]
// Beispiel: node tools/klang/anschlaege.cjs loop_amen --faktoren 0.66,1.24
// Als Modul: const { messer, leseWav } = require('./tools/klang/anschlaege.cjs');
//            const M = await messer();  // M.fluxPeaks, M.countOnsets, M.attack, M.timing, M.mono, M.quant
// Exit-Code: 0 = alle Faktoren im Ziel, 1 = ein Ziel verfehlt, 2 = Bedienfehler.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const HILFE = `Anschläge vor/nach der Tempo-Dehnung zählen und ihre Lage prüfen.

Aufruf: node tools/klang/anschlaege.cjs <datei.wav | Sound-Name> [Optionen]
  Sound-Name    Datei aus assets/samples/sonicpi/ ohne .wav (z. B. loop_amen) oder Katalog-Id (sp-loop-amen)
  --faktoren    Tempo neu/alt, Komma-getrennt (Voreinstellung 0.6,0.75,0.9,1.1,1.25,1.4)
  --einzelklang als One-Shot dehnen (Stille davor/danach) statt als Loop
  --json        Ergebnis als JSON
  --help        diese Hilfe

Je Faktor: deutliche Anschläge (Spektralfluss, Schwelle aus dem Original, Hysterese) vorher → nachher,
+zusätzliche (Doppelschläge) / −fehlende, Lage Median/90 % in ms – für die neue Dehnung und das reine WSOLA
(transients: false). Ziele (Exit 0): Zahl ±5 %, höchstens 1 bzw. 5 % zusätzliche, 90 % der Anschläge ≤ 5 ms.`;

function leseWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, ch = 2, bits = 16, fmt = 1, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { fmt = b.readUInt16LE(p + 8); ch = b.readUInt16LE(p + 10); bits = b.readUInt16LE(p + 22); }
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  if (!data) throw new Error(`${file}: kein data-Block`);
  const bps = bits / 8;
  const n = Math.floor(data.length / (bps * ch));
  const out = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const o = (i * ch + c) * bps;
      out[c][i] = fmt === 3 ? (bits === 64 ? data.readDoubleLE(o) : data.readFloatLE(o))
        : bits === 16 ? data.readInt16LE(o) / 32768 : bits === 24 ? data.readIntLE(o, 3) / 8388608 : data.readInt32LE(o) / 2147483648;
    }
  }
  return out;
}

async function messer(sr = 44100) {
  const { fft, hann } = await import(pathToFileURL(path.join(ROOT, 'src/dsp/fft.js')).href);
  const mono = (chs) => (chs.length === 1 ? chs[0] : chs[0].map((v, i) => (v + chs[1][i]) / 2));
  const quant = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
  // Prüf-Detektor (unabhängig von dem in stretch.js): Spektralfluss, FFT 1024, Schritt 128 (2,9 ms), log10-Betrag,
  // nur Zunahmen; Spitzen mindestens 30 ms auseinander und über dem 1,4-Fachen des Mittels ±50 ms.
  const FN = 1024, FH = 128, WIN = hann(FN);
  function fluxPeaks(d) {
    const frames = Math.max(0, Math.floor((d.length - FN) / FH));
    const re = new Float64Array(FN), im = new Float64Array(FN);
    let prev = new Float64Array(FN / 2), cur = new Float64Array(FN / 2);
    const fl = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < FN; i++) { re[i] = d[f * FH + i] * WIN[i]; im[i] = 0; }
      fft(re, im);
      let s = 0;
      for (let k = 2; k < FN / 2; k++) {
        cur[k] = Math.log10(1e-4 + Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        if (f && cur[k] > prev[k]) s += cur[k] - prev[k];
      }
      fl[f] = s;
      [prev, cur] = [cur, prev];
    }
    const gap = Math.round((0.03 * sr) / FH), W = Math.round((0.05 * sr) / FH);
    const peaks = [];
    for (let f = 1; f < frames - 1; f++) {
      let isMax = true;
      for (let j = Math.max(0, f - gap); j <= Math.min(frames - 1, f + gap) && isMax; j++) if (j !== f && (fl[j] > fl[f] || (j > f && fl[j] === fl[f]))) isMax = false;
      if (!isMax) continue;
      let s = 0, c = 0;
      for (let j = Math.max(0, f - W); j <= Math.min(frames - 1, f + W); j++) { s += fl[j]; c++; }
      if (fl[f] < (1.4 * s) / c) continue;
      peaks.push({ t: f * FH + FN / 2, v: fl[f] });
    }
    const sorted = Float64Array.from(fl).sort();
    const med = sorted[frames >> 1] || 0;
    let mx = 0;
    for (const v of fl) mx = Math.max(mx, v);
    return { peaks, thr: med + 0.25 * (mx - med) };
  }
  // Zählen mit Schwelle aus dem Original und Hysterese, damit Grenzfälle nicht flackern:
  // gefunden = Sollpunkt (Flussspitze · Faktor) mit einer Spitze ≥ 0,7 · Schwelle in ±12 ms,
  // zusätzlich = Spitze ≥ 1,3 · Schwelle, die zu keinem Sollpunkt gehört (Doppelschlag, Flattern).
  function countOnsets(orig, out, ratio, origPeaks = fluxPeaks(orig)) {
    const { peaks: p0, thr } = origPeaks;
    const expect = p0.filter((p) => p.v >= thr).map((p) => p.t * ratio);
    const { peaks: p1 } = fluxPeaks(out);
    const used = new Uint8Array(p1.length);
    const tol = 0.012 * sr;
    let found = 0;
    for (const t of expect) {
      let bi = -1, bd = Infinity;
      p1.forEach((p, i) => { const dd = Math.abs(p.t - t); if (!used[i] && p.v >= 0.7 * thr && dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0 && bd <= tol) { used[bi] = 1; found++; }
    }
    const extra = p1.filter((p, i) => !used[i] && p.v >= 1.3 * thr && !expect.some((t) => Math.abs(p.t - t) <= tol)).length;
    return { n0: expect.length, n: found + extra, found, extra, missing: expect.length - found };
  }
  // Feinlage: erstes Sample in ±12 ms, an dem die Höhen-Hüllkurve (Spitzenhalter, ~5 ms Abfall) die Hälfte ihres
  // Maximums erreicht. Rückgabe [Lage, Anstieg in dB gegenüber den 5 ms davor]
  function attack(d, t, w = Math.round(0.012 * sr)) {
    const a = Math.max(1, t - w), b = Math.min(d.length - 1, t + w);
    const env = new Float32Array(Math.max(0, b - a));
    let e = 0;
    for (let i = Math.max(1, a - 220); i < b; i++) {
      const x = Math.abs(d[i] - d[i - 1]);
      e = Math.max(x, e * 0.995);
      if (i >= a) env[i - a] = e;
    }
    let m = 0;
    for (const v of env) m = Math.max(m, v);
    let k = 0;
    while (k < env.length && env[k] < 0.5 * m) k++;
    let before = 0;
    for (let i = Math.max(1, a + k - 220); i < a + k - 44; i++) before = Math.max(before, Math.abs(d[i] - d[i - 1]));
    return [a + k, 20 * Math.log10(m / (before + 1e-9))];
  }
  // Lage deutlicher Anschläge (Anstieg ≥ 6 dB) im Ausgang gegen den Sollzeitpunkt, in ms
  function timing(orig, out, ratio, origPeaks = fluxPeaks(orig)) {
    const errs = [];
    for (const p of origPeaks.peaks.filter((q) => q.v >= origPeaks.thr)) {
      const [a, rise] = attack(orig, p.t);
      if (rise < 6) continue;
      errs.push((Math.abs(attack(out, Math.round(a * ratio))[0] - a * ratio) / sr) * 1000);
    }
    return { n: errs.length, med: quant(errs, 0.5), p90: quant(errs, 0.9), max: quant(errs, 1) };
  }
  return { fluxPeaks, countOnsets, attack, timing, mono, quant };
}

// Ziele je Faktor (wie tests/stretch-transienten.test.cjs, dort über alle sechs Loops zusammen gezählt)
const imZiel = (c, t) => Math.abs(c.n - c.n0) <= Math.max(1, Math.round(0.05 * c.n0)) && c.extra <= Math.max(1, Math.round(0.05 * c.n0)) && t.p90 <= 5;

function quelle(arg) {
  if (fs.existsSync(arg)) return arg;
  const name = arg.replace(/^sp-/, '').replace(/-/g, '_').replace(/\.wav$/, '');
  const f = path.join(ROOT, 'assets/samples/sonicpi', `${name}.wav`);
  if (fs.existsSync(f)) return f;
  throw Object.assign(new Error(`Weder Datei noch Sound gefunden: ${arg}`), { usage: true });
}

async function main(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { console.log(HILFE); return argv.length ? 0 : 2; }
  let faktoren = [0.6, 0.75, 0.9, 1.1, 1.25, 1.4];
  const fi = argv.indexOf('--faktoren');
  if (fi >= 0) {
    faktoren = (argv[fi + 1] || '').split(',').map(Number).filter((x) => x > 0);
    if (!faktoren.length) { console.error('--faktoren braucht Zahlen, z. B. 0.6,1.4'); return 2; }
  }
  const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--faktoren');
  if (pos.length !== 1) { console.error('Genau eine Datei oder ein Sound-Name, siehe --help'); return 2; }
  let file;
  try { file = quelle(pos[0]); } catch (e) { console.error(e.message); return 2; }
  const loop = !argv.includes('--einzelklang');
  const chs = leseWav(file);
  const { timeStretch } = await import(pathToFileURL(path.join(ROOT, 'src/dsp/stretch.js')).href);
  const M = await messer();
  const m = M.mono(chs);
  const pk = M.fluxPeaks(m);
  const rows = [];
  for (const f of faktoren) {
    const len = Math.round(m.length / f), ratio = len / m.length;
    const run = (transients) => {
      const t0 = process.hrtime.bigint();
      const y = M.mono(timeStretch(chs, ratio, 44100, len, { loop, transients }));
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      return { count: M.countOnsets(m, y, ratio, pk), lage: M.timing(m, y, ratio, pk), ms: Math.round(ms) };
    };
    const neu = run(true), alt = run(false);
    rows.push({ faktor: f, neu, alt, ok: imZiel(neu.count, neu.lage) });
  }
  const ok = rows.every((r) => r.ok);
  if (argv.includes('--json')) console.log(JSON.stringify({ datei: path.relative(ROOT, file), loop, rows, ok }, null, 1));
  else {
    console.log(`${path.relative(ROOT, file)} (${(m.length / 44100).toFixed(2)} s, ${loop ? 'Loop' : 'Einzelklang'})`);
    const z = (r) => `${r.count.n0}→${r.count.n} (+${r.count.extra}/−${r.count.missing})  Lage ${r.lage.med.toFixed(1)}/${r.lage.p90.toFixed(1)} ms  ${r.ms} ms`;
    for (const r of rows) console.log(`${r.ok ? '✔' : '✘'} Tempo ×${r.faktor}:  neu ${z(r.neu)}   |  reines WSOLA ${z(r.alt)}`);
  }
  return ok ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e.stack); process.exitCode = 2; });

module.exports = { messer, leseWav };
