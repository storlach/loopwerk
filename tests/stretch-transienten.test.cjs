// W7 (docs/analyse/2026-11-klang.md): Tempo-Dehnung echter Loops ohne doppelte oder verschluckte Anschläge
// (src/dsp/stretch.js, ADR 001 Nachtrag). Ohne Browser: sechs Sonic-Pi-Drum-Loops, ein synthetischer Drum-Loop mit
// bekannten Anschlägen, tonale Testsignale (Sinus, Akkord, Bass, gehaltener Ton, Gesang, Gitarre).
// Vergleich jeweils mit transients: false (reines WSOLA wie vor W7).
// node tests/stretch-transienten.test.cjs [--verbose]
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createChecker } = require('./harness.cjs');
const { messer, leseWav } = require('../tools/klang/anschlaege.cjs');

const { check, finish } = createChecker();
const VERBOSE = process.argv.includes('--verbose');
const ROOT = path.join(__dirname, '..');
const sr = 44100;
const FACTORS = [0.6, 0.75, 0.9, 1.1, 1.25, 1.4]; // Tempo neu/alt: 0,6 = −40 %, 1,4 = +40 %
const LOOPS = ['amen', 'breakbeat', 'compus', 'garzul', 'mika', 'safari'];
const pct = (f) => `${f > 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;

const readWav = leseWav;
const db = (x) => 20 * Math.log10(x + 1e-12);
const rms = (d, a = 0, b = d.length) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };

(async () => {
  const { timeStretch, findOnsets } = await import(pathToFileURL(path.join(ROOT, 'src/dsp/stretch.js')).href);
  const { fft, hann } = await import(pathToFileURL(path.join(ROOT, 'src/dsp/fft.js')).href);

  // Prüf-Detektor, Zählen und Feinlage: tools/klang/anschlaege.cjs (unabhängig von der Erkennung in stretch.js)
  const { fluxPeaks, countOnsets, attack, timing, mono, quant } = await messer(sr);

  // ---------- 1) Sechs Drum-Loops (Sonic Pi) ----------
  const real = LOOPS.map((name) => {
    const chs = readWav(path.join(ROOT, `assets/samples/sonicpi/loop_${name}.wav`));
    const m = mono(chs);
    return { name, chs, m, peaks: fluxPeaks(m) };
  });
  const rows = [];
  for (const f of FACTORS) {
    let n0 = 0, nNew = 0, nOld = 0;
    const per = [];
    let worst = null;
    for (const L of real) {
      const len = Math.round(L.m.length / f);
      const ratio = len / L.m.length;
      const yNew = timeStretch(L.chs, ratio, sr, len, { loop: true });
      const yOld = timeStretch(L.chs, ratio, sr, len, { loop: true, transients: false });
      const mN = mono(yNew), mO = mono(yOld);
      const cN = countOnsets(L.m, mN, ratio, L.peaks), cO = countOnsets(L.m, mO, ratio, L.peaks);
      const tN = timing(L.m, mN, ratio, L.peaks), tO = timing(L.m, mO, ratio, L.peaks);
      n0 += cN.n0; nNew += cN.n; nOld += cO.n;
      per.push({ name: L.name, cN, cO, tN, tO, len: yNew.every((d) => d.length === len) });
      if (!worst || tN.p90 > worst.tN.p90) worst = per[per.length - 1];
    }
    const dev = (nNew - n0) / n0, devOld = (nOld - n0) / n0;
    const detail = per.map((p) => `${p.name} ${p.cN.n0}→${p.cN.n} (+${p.cN.extra}/−${p.cN.missing})`).join(', ');
    check(`Drum-Loops ${pct(f)}: Zahl der Anschläge ±5 % (alle sechs zusammen)`, Math.abs(dev) <= 0.05,
      `${n0} → ${nNew} (${(dev * 100).toFixed(1)} %; ohne Anschlagsbehandlung ${nOld}, ${(devOld * 100).toFixed(1)} %) · ${detail}`);
    // Das Hörbare an W7: Doppelschläge. Je Loop höchstens einer bzw. 5 % zusätzlich
    const dblOk = per.every((p) => p.cN.extra <= Math.max(1, Math.round(0.05 * p.cN.n0)));
    check(`Drum-Loops ${pct(f)}: keine Doppelschläge (je Loop höchstens 1 bzw. 5 % zusätzliche Anschläge)`, dblOk,
      per.map((p) => `${p.name} +${p.cN.extra} (vorher +${p.cO.extra})`).join(', '));
    const tOk = per.every((p) => p.tN.med <= 3 && p.tN.p90 <= 5);
    check(`Drum-Loops ${pct(f)}: deutliche Anschläge auf dem Raster (Median ≤ 3 ms, 90 % ≤ 5 ms je Loop)`, tOk,
      per.map((p) => `${p.name} ${p.tN.med.toFixed(1)}/${p.tN.p90.toFixed(1)} ms (vorher ${p.tO.med.toFixed(1)}/${p.tO.p90.toFixed(1)})`).join(', '));
    check(`Drum-Loops ${pct(f)}: Länge exakt`, per.every((p) => p.len));
    rows.push({ f, n0, nNew, nOld, per });
  }

  // ---------- 2) Synthetischer Drum-Loop mit bekannten Anschlägen ----------
  // 2 Takte bei 120 BPM: Kick, Snare, leise Ghost-Notes, Hats auf Achteln, Bass-Sinus darunter; zyklisch (nahtlos),
  // um eine halbe Sechzehntel verschoben, damit die Naht zwischen zwei Anschlägen liegt.
  function drumLoop() {
    const beat = 0.5 * sr, n = 8 * beat;
    const L = new Float32Array(n), R = new Float32Array(n);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
    const hits = new Set();
    const add = (t16, kind, g = 1) => {
      const t0 = Math.round((t16 + 0.5) * beat / 4); // Naht zwischen zwei Anschlägen
      hits.add(t0);
      let hp = 0, ph = 0;
      for (let i = 0; i < 0.4 * sr; i++) {
        const tt = i / sr;
        let v = 0, pan = 0.5;
        if (kind === 'k') { ph += 2 * Math.PI * (50 + 90 * Math.exp(-tt / 0.03)) / sr; v = 0.9 * Math.sin(ph) * Math.exp(-tt / 0.12) + (i < 40 ? 0.3 * rnd() : 0); }
        if (kind === 's') { const nz = rnd(); hp = nz - hp * 0.2; v = 0.5 * hp * Math.exp(-tt / 0.07) + 0.4 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt / 0.05); }
        if (kind === 'h') { const nz = rnd(); v = 0.25 * (nz - hp) * Math.exp(-tt / 0.02); hp = nz; pan = 0.75; }
        const j = (t0 + i) % n;
        L[j] += g * v * (1 - pan) * 2;
        R[j] += g * v * pan * 2;
      }
    };
    for (let bar = 0; bar < 2; bar++) {
      const o = bar * 16;
      add(o, 'k'); add(o + 6, 'k', 0.8); add(o + 10, 'k'); add(o + 4, 's'); add(o + 12, 's');
      add(o + 7, 's', 0.2); add(o + 15, 's', 0.25); add(o + 9, 's', 0.18);
      for (let e = 0; e < 16; e += 2) add(o + e + 1, 'h', e % 4 ? 0.6 : 1);
    }
    for (let i = 0; i < n; i++) { const b = 0.08 * Math.sin(2 * Math.PI * 55 * i / sr); L[i] += b; R[i] += b; }
    return { chs: [L, R], hits: [...hits].sort((a, b) => a - b), n };
  }
  {
    const D = drumLoop();
    const m0 = mono(D.chs);
    const ref = D.hits.map((t) => attack(m0, t)[0]);
    const pk = fluxPeaks(m0);
    for (const f of FACTORS) {
      const len = Math.round(D.n / f), ratio = len / D.n;
      const yN = mono(timeStretch(D.chs, ratio, sr, len, { loop: true }));
      const yO = mono(timeStretch(D.chs, ratio, sr, len, { loop: true, transients: false }));
      const err = (y) => Math.max(...ref.map((t) => Math.abs(attack(y, Math.round(t * ratio))[0] - t * ratio) / sr * 1000));
      const cN = countOnsets(m0, yN, ratio, pk);
      const eN = err(yN), eO = err(yO);
      check(`Synthetischer Loop ${pct(f)}: alle ${D.hits.length} Anschläge ≤ 5 ms vom Sollzeitpunkt, Zahl ±5 %`,
        eN <= 5 && Math.abs(cN.n - cN.n0) <= Math.round(0.05 * cN.n0),
        `größte Abweichung ${eN.toFixed(1)} ms (vorher ${eO.toFixed(1)} ms), Anschläge ${cN.n0} → ${cN.n} (+${cN.extra}/−${cN.missing})`);
    }
    // Naht: der gedehnte Loop läuft ohne Sprung in seinen Anfang zurück
    const seam = FACTORS.map((f) => {
      const len = Math.round(D.n / f);
      const y = mono(timeStretch(D.chs, len / D.n, sr, len, { loop: true }));
      const steps = [];
      for (let i = 1; i < y.length; i++) steps.push(Math.abs(y[i] - y[i - 1]));
      return { f, jump: Math.abs(y[0] - y[y.length - 1]), p99: quant(steps, 0.99) };
    });
    check('Loop-Naht ohne Sprung (Sprung an der Naht ≤ 99-%-Wert der Nachbarsprünge)', seam.every((s) => s.jump <= s.p99),
      seam.map((s) => `${pct(s.f)}: ${s.jump.toFixed(4)} ≤ ${s.p99.toFixed(4)}`).join(', '));
  }

  // ---------- 3) Stereo phasenstarr: ein Schnittplan für alle Kanäle ----------
  {
    const [Lc, Rc] = real[0].chs;
    const Mc = Lc.map((v, i) => (v + Rc[i]) / 2);
    let worst = 0;
    for (const f of [0.6, 1.4]) {
      const len = Math.round(Lc.length / f);
      const [a, b, c] = timeStretch([Lc, Rc, Mc], len / Lc.length, sr, len, { loop: true });
      for (let i = 0; i < len; i++) worst = Math.max(worst, Math.abs(c[i] - (a[i] + b[i]) / 2));
    }
    check('Stereo phasenstarr: Kanal (L+R)/2 bleibt exakt die Mitte der gedehnten Kanäle', worst < 1e-5, `größte Abweichung ${worst.toExponential(1)}`);
  }

  // ---------- 4) Tonales Material: nicht schlechter als vorher ----------
  {
    const n = 3 * sr;
    const tone = (fq, amp = 0.25) => { const d = new Float32Array(n); for (let i = 0; i < n; i++) for (const q of fq) d[i] += amp * Math.sin(2 * Math.PI * q * i / sr); return d; };
    // Gesang: Vokal (Formanten 700/1200 Hz) auf 196 Hz mit Vibrato 5,5 Hz ±½ Halbton
    const voice = (syllables) => {
      const d = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += 2 * Math.PI * 196 * 2 ** (0.5 / 12 * Math.sin(2 * Math.PI * 5.5 * t)) / sr;
        const u = syllables ? t % 1 : t / 3;
        const a = syllables ? Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.08) : Math.min(1, t / 0.08);
        let s = 0;
        for (let h = 1; h <= 12; h++) {
          const fh = h * 196;
          s += (Math.exp(-((fh - 700) ** 2) / (2 * 250 ** 2)) + 0.5 * Math.exp(-((fh - 1200) ** 2) / (2 * 300 ** 2)) + 0.05) * Math.sin(h * ph) / h ** 0.3;
        }
        d[i] = 0.12 * a * s;
      }
      return d;
    };
    // Flattern: Abweichung der 10-ms-Hüllkurve von ihrem gleitenden 110-ms-Mittel (RMS, relativ) in [a, b) s.
    // Ein Ausklang oder eine Silbenform zählt so nicht, ein neues Wabern schon. skip: Bereiche [von, bis] in Samples,
    // die nicht zählen (Anschläge: dort soll der Ausgang gerade steiler bleiben als beim reinen WSOLA).
    const modIndex = (d, a, b, skip = []) => {
      const w = Math.round(0.01 * sr), v = [];
      for (let i = Math.round(a * sr); i + w < b * sr; i += w) v.push(rms(d, i, i + w));
      let s2 = 0, c = 0;
      for (let k = 5; k < v.length - 5; k++) {
        const at = Math.round(a * sr) + k * w + w / 2;
        if (skip.some(([x, y]) => at >= x && at < y)) continue;
        let m = 0;
        for (let j = k - 5; j <= k + 5; j++) m += v[j];
        s2 += (v[k] / (m / 11 + 1e-12) - 1) ** 2;
        c++;
      }
      return Math.sqrt(s2 / Math.max(1, c));
    };
    // Rauschen: Energie außerhalb ±8 Hz um die Teiltöne (dB), FFT 16384 in der Mitte
    const noiseDb = (d, partials) => {
      const N = 16384, w = hann(N), a = Math.floor(d.length / 2 - N / 2);
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = d[a + i] * w[i];
      fft(re, im);
      let inE = 0, outE = 0;
      for (let k = 1; k < N / 2; k++) { const q = k * sr / N, p = re[k] ** 2 + im[k] ** 2; if (partials.some((x) => Math.abs(q - x) < 8)) inE += p; else outE += p; }
      return 10 * Math.log10(outE / inE);
    };
    const guit = readWav(path.join(ROOT, 'assets/samples/sonicpi/guit_em9.wav'));
    const sigs = [
      { name: 'Sinus 220 Hz', chs: [tone([220])], partials: [220] },
      { name: 'Akkord a-Moll', chs: [tone([220, 261.63, 329.63])], partials: [220, 261.63, 329.63] },
      { name: 'Bass 55/110 Hz', chs: [tone([55, 110])], partials: [55, 110] },
      { name: 'gehaltener Ton (Vokal, Vibrato)', chs: [voice(false)] },
      { name: 'Gesang (drei Silben)', chs: [voice(true)], syllables: true },
      { name: 'Gitarre Em9 (Loop, Anschläge ausgenommen)', chs: guit, loop: true, strummed: true },
    ];
    for (const s of sigs) {
      const d0 = mono(s.chs);
      const N0 = d0.length;
      // Anschläge, die die Dehnung 1:1 lässt (ihre eigene Erkennung, Loop zyklisch fortgesetzt): dort ist der Ausgang
      // absichtlich steiler als beim reinen WSOLA und zählt nicht als Flattern
      let hitsAt = [];
      if (s.strummed) {
        const P = sr, ext = new Float32Array(N0 + 2 * P);
        for (let i = 0; i < ext.length; i++) ext[i] = d0[(((i - P) % N0) + N0) % N0];
        hitsAt = findOnsets(ext, P, P + N0, sr).map((t) => t - P);
      }
      const res = FACTORS.map((f) => {
        const len = Math.round(N0 / f), ratio = len / N0;
        const yN = mono(timeStretch(s.chs, ratio, sr, len, { loop: !!s.loop }));
        const yO = mono(timeStretch(s.chs, ratio, sr, len, { loop: !!s.loop, transients: false }));
        const dur = len / sr;
        // Silben: nur der gehaltene Teil jeder Silbe (0,15–0,8 der Silbe, auf die neue Länge abgebildet)
        const mod = (y) => s.syllables
          ? [0, 1, 2].map((k) => modIndex(y, (k + 0.15) * ratio, (k + 0.8) * ratio)).reduce((a, b) => Math.max(a, b), 0)
          : modIndex(y, 0.3, dur - 0.3, hitsAt.map((t) => [t * ratio - 0.03 * sr, t * ratio + 0.12 * sr]));
        const a0 = Math.round(0.3 * sr);
        return {
          f, modN: mod(yN), modO: mod(yO),
          dRms: db(rms(yN, Math.round(a0 * ratio), len - Math.round(a0 * ratio))) - db(rms(d0, a0, N0 - a0)),
          noiseN: s.partials ? noiseDb(yN, s.partials) : null, noiseO: s.partials ? noiseDb(yO, s.partials) : null,
        };
      });
      const modOk = res.every((r) => r.modN <= r.modO + 0.01);
      const lvlOk = res.every((r) => Math.abs(r.dRms) <= 0.5);
      const noiseOk = !s.partials || Math.max(...res.map((r) => r.noiseN)) <= Math.max(...res.map((r) => r.noiseO)) + 1;
      check(`Tonal ${s.name}: kein neues Flattern, Pegel ±0,5 dB${s.partials ? ', kein zusätzliches Rauschen' : ''}`, modOk && lvlOk && noiseOk,
        res.map((r) => `${pct(r.f)}: Flattern ${r.modN.toFixed(3)} (vorher ${r.modO.toFixed(3)}), ${r.dRms >= 0 ? '+' : ''}${r.dRms.toFixed(2)} dB` +
          (s.partials ? `, Rauschen ${r.noiseN.toFixed(1)} (vorher ${r.noiseO.toFixed(1)}) dB` : '')).join(' · '));
    }
  }

  // ---------- 5) Rechenzeit: höchstens 1,5-fach gegenüber reinem WSOLA ----------
  {
    let tNew = 0, tOld = 0;
    for (let rep = 0; rep < 2; rep++) {
      for (const L of real) {
        for (const f of [0.6, 1.4]) {
          const len = Math.round(L.m.length / f), ratio = len / L.m.length;
          let t = performance.now();
          timeStretch(L.chs, ratio, sr, len, { loop: true, transients: false });
          tOld += performance.now() - t;
          t = performance.now();
          timeStretch(L.chs, ratio, sr, len, { loop: true });
          tNew += performance.now() - t;
        }
      }
    }
    check('Rechenzeit höchstens 1,5-fach gegenüber dem reinen WSOLA', tNew <= 1.5 * tOld,
      `${Math.round(tNew)} ms gegenüber ${Math.round(tOld)} ms (${(tNew / tOld).toFixed(2)}-fach, 6 Loops × 2 Faktoren × 2)`);
  }

  if (VERBOSE) for (const r of rows) console.log(r.f, r.per.map((p) => `${p.name}: ${JSON.stringify(p.cN)} ${JSON.stringify(p.tN)}`).join('\n  '));
  finish();
})().catch((e) => { check('Testlauf ohne Ausnahme', false, e.stack); finish(); });
