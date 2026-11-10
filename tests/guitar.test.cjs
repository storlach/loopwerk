// E-Gitarre: synthetische Loops/One-Shots (src/loops-guitar.js, src/dsp/guitar.js), spielbare Presets im
// Melodie-Editor, echte Aufnahmen (Karoryfer, Sonic Pi) mit Lizenz, Suche im Regal.
// node tests/guitar.test.cjs [--verbose]
const { start } = require('./serve.cjs');
const { chromium } = require('playwright');
const { legacyStart, openApp, createChecker } = require('./harness.cjs');

const VERBOSE = process.argv.includes('--verbose');
const { check, finish } = createChecker();

// Läuft im Browser: Messhilfen (Skalenanteil, Chroma, Tonhöhe, Pegel)
async function helpers() {
  const F = await import('/src/dsp/fft.js');
  const P = await import('/src/dsp/pitch.js');
  const SR = 44100;
  const N = 32768;
  const win = F.hann(N);
  // Energie je Tonklasse (60 Hz–4 kHz), über alle vollen Fenster
  const chroma = (d) => {
    const c = new Float64Array(12);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s = 0; s + N <= d.length || s === 0; s += N) {
      for (let i = 0; i < N; i++) { re[i] = (d[s + i] || 0) * win[i]; im[i] = 0; }
      F.fft(re, im);
      for (let k = Math.ceil(60 * N / SR); k < 4000 * N / SR; k++) {
        const pc = ((Math.round(12 * Math.log2(k * SR / N / 440)) + 9) % 12 + 12) % 12;
        c[pc] += re[k] * re[k] + im[k] * im[k];
      }
      if (s + 2 * N > d.length) break;
    }
    const sum = c.reduce((a, b) => a + b, 0) || 1;
    return Array.from(c, (v) => v / sum);
  };
  // Moll-Tonleiter (natürlich + große Septime) ab root
  const inScale = (ch, root) => [0, 2, 3, 5, 7, 8, 10, 11].reduce((a, x) => a + ch[(x + root) % 12], 0);
  // Korrelation zweier Chroma-Vektoren, b um shift Halbtöne zurückgedreht
  const corr = (a, b, shift) => {
    const bb = a.map((_, i) => b[(i + shift) % 12]);
    const ma = a.reduce((s, v) => s + v, 0) / 12, mb = bb.reduce((s, v) => s + v, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (bb[i] - mb); da += (a[i] - ma) ** 2; db += (bb[i] - mb) ** 2; }
    return n / Math.sqrt(da * db || 1);
  };
  // Spektrum in Halbtonbändern 55 Hz – 3,5 kHz (dB), ohne Oktavfaltung; Transposition = beste Verschiebung der Bänder
  const bands = (d) => {
    const c = new Float64Array(72);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s = 0; s + N <= d.length || s === 0; s += N) {
      for (let i = 0; i < N; i++) { re[i] = (d[s + i] || 0) * win[i]; im[i] = 0; }
      F.fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const b = Math.round(12 * Math.log2(k * SR / N / 55));
        if (b >= 0 && b < 72) c[b] += re[k] * re[k] + im[k] * im[k];
      }
      if (s + 2 * N > d.length) break;
    }
    return Array.from(c, (v) => 10 * Math.log10(v + 1e-9));
  };
  const transposition = (a, b) => {
    const rs = [];
    for (let sh = -6; sh <= 6; sh++) {
      const xs = [], ys = [];
      for (let i = 6; i < 66; i++) { xs.push(a[i]); ys.push(b[i + sh]); }
      const mx = xs.reduce((p, v) => p + v, 0) / xs.length, my = ys.reduce((p, v) => p + v, 0) / ys.length;
      let n = 0, dx = 0, dy = 0;
      for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
      rs.push([sh, n / Math.sqrt(dx * dy)]);
    }
    rs.sort((x, y) => y[1] - x[1]);
    return { shift: rs[0][0], r: rs[0][1], second: rs[1][1] };
  };
  const analyse = (chans) => {
    let peak = 0, sum = 0, nan = 0, maxStep = 0;
    const n = chans[0].length;
    for (const d of chans) {
      for (let i = 0; i < n; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) { nan++; continue; }
        const a = Math.abs(v);
        if (a > peak) peak = a;
        sum += v * v;
        if (i) { const s = Math.abs(v - d[i - 1]); if (s > maxStep) maxStep = s; }
      }
    }
    const wrap = Math.max(...chans.map((d) => Math.abs(d[0] - d[n - 1])));
    let tail = 0;
    for (const d of chans) for (let i = n - Math.round(0.002 * SR); i < n; i++) tail = Math.max(tail, Math.abs(d[i]));
    return { peak, rms: Math.sqrt(sum / (chans.length * n)), nan, wrap, maxStep, tail, length: n };
  };
  // Median der Tonhöhe (YIN) in einem Ausschnitt, in MIDI
  const pitchAt = (d, t0, t1) => {
    const tr = P.detectPitch(d.subarray(Math.round(t0 * SR), Math.round(t1 * SR)), SR, { fmin: 60, fmax: 1000 });
    const out = [];
    for (let i = 0; i < tr.f0.length; i++) if (tr.conf[i] > 0.8 && tr.f0[i] > 0) out.push(P.midiOf(tr.f0[i]));
    out.sort((a, b) => a - b);
    return out.length ? out[out.length >> 1] : NaN;
  };
  const energy = (d, t0, t1) => { let e = 0; for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) e += d[i] * d[i]; return e; };
  return { chroma, inScale, corr, bands, transposition, analyse, pitchAt, energy, SR };
}

(async () => {
  // ================= Teil 1: Defs und Klangphysik (nur Module) =================
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await legacyStart(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url + 'package.json');
    const r = await page.evaluate(async (helpersSrc) => {
      const H = await (0, eval)(`(${helpersSrc})`)();
      const S = await import('/src/samples.js');
      const G = await import('/src/loops-guitar.js');
      const D = await import('/src/dsp/guitar.js');
      const { SR } = H;

      const prepare = async (def, bpm, semis = 0) => {
        const lib = new S.Library();
        lib.bpm = bpm;
        lib.semis = semis;
        const s = {
          id: def.id, name: def.name, category: def.category, kind: def.oneShot ? 'oneshot' : 'loop',
          beats: def.bars * 4, bpm: null, key: def.category === 'fx' ? null : S.LIBRARY_KEY, oneShot: !!def.oneShot, def,
        };
        const t0 = performance.now();
        await lib.add(s);
        return { s, ms: performance.now() - t0, lib };
      };

      await prepare(G.GUITAR_LOOP_DEFS[0], 120); // Aufwärmen
      const out = [];
      for (const def of G.GUITAR_LOOP_DEFS) {
        const res = { id: def.id, name: def.name, category: def.category, bars: def.bars, peakSet: def.peak, level: (await import('./src/levels.js')).soundLevel(def.id), oneShot: !!def.oneShot, genres: def.genres, tags: def.tags };
        try {
          const { s, ms, lib } = await prepare(def, 120);
          res.ms = ms;
          const chans = [s.buffer.getChannelData(0), s.buffer.getChannelData(1)];
          Object.assign(res, H.analyse(chans));
          res.expected = Math.round(def.bars * 4 * 0.5 * SR);
          // Einsatz: erster Frame über 1 % des Spitzenpegels (Loops beginnen auf Schlag 1)
          const d0 = chans[0];
          let on = 0;
          while (on < d0.length && Math.abs(d0[on]) < 0.01 * res.peak) on++;
          res.onsetMs = on / SR * 1000;
          const p93 = await prepare(def, 93);
          res.length93 = p93.s.buffer.length;
          res.expected93 = Math.round(def.bars * 4 * (60 / 93) * SR);
          if (def.category !== 'fx') {
            const a = H.chroma(d0);
            res.scaleAm = H.inScale(a, 9);
            res.scaleEbm = H.inScale(a, 3); // Gegenprobe
            const before = d0.slice();
            await lib.setKey(3);
            const after = lib.get(def.id).buffer.getChannelData(0);
            res.scaleCm = H.inScale(H.chroma(after), 0);
            res.shift = H.transposition(H.bands(before), H.bands(after)); // erwartet: genau +3 Halbtöne
            let diff = 0;
            for (let i = 0; i < before.length; i++) diff = Math.max(diff, Math.abs(before[i] - after[i]));
            res.keyDiff = diff;
          }
        } catch (e) {
          res.error = String(e && e.stack || e);
        }
        out.push(res);
      }

      // ---------- Klangphysik der Gitarre ----------
      const phys = {};
      const one = (ev, opts = {}) => D.renderGuitar(Array.isArray(ev) ? ev : [ev], { sr: SR, frames: Math.round((opts.sec ?? 2) * SR), amp: 'clean', ...opts });
      // Tonhöhe: A2, E3, A3, E4 sauber gestimmt
      phys.pitch = [45, 52, 57, 64].map((m) => [m, H.pitchAt(one({ t: 0, midi: m, dur: Infinity, vel: 0.9 })[0], 0.2, 1.2)]);
      // Einsatz samplegenau: Ton bei 0,5 s → vorher still, danach sofort Klang
      const [on] = one({ t: 0.5, midi: 45, dur: 0.5, vel: 0.9 }, { amp: 'crunch' });
      let pre = 0;
      for (let i = 0; i < 22050; i++) pre = Math.max(pre, Math.abs(on[i]));
      let first = 22050;
      while (Math.abs(on[first]) < 1e-3) first++;
      phys.onset = { pre, first };
      // Palm-Mute klingt viel schneller ab als die offene Saite (Energie 0,3–0,4 s relativ zu 0–0,1 s)
      const decay = (mute) => { const [d] = one({ t: 0, midi: 45, dur: Infinity, vel: 0.9, mute }); return 10 * Math.log10(H.energy(d, 0.3, 0.4) / H.energy(d, 0, 0.1)); };
      phys.decayOpen = decay(0);
      phys.decayMute = decay(0.8);
      // Abdämpfen am Notenende: 0,1 s nach Ende mindestens 40 dB leiser als davor
      const [st] = one({ t: 0, midi: 45, dur: 0.5, vel: 0.9 });
      phys.stopDb = 10 * Math.log10(H.energy(st, 0.6, 0.7) / H.energy(st, 0.35, 0.45));
      // Bend um zwei Halbtöne: am Ende 2 Halbtöne höher
      const [bd] = one({ t: 0, midi: 57, dur: Infinity, vel: 0.9, glide: [[0.3, 59, 0.2]] });
      phys.bend = [H.pitchAt(bd, 0.05, 0.28), H.pitchAt(bd, 0.6, 1.2)];
      // Verzerrer: gleiche Saite (A2) durch Clean, Lead und Metal – Obertöne 4–20 gegenüber 1–3 und Crest-Faktor
      const F = await import('/src/dsp/fft.js');
      const drive = (amp) => {
        const [d] = one({ t: 0, midi: 45, dur: Infinity, vel: 0.9, bright: 0.3 }, { amp, sec: 1 });
        let pk = 0, sq = 0;
        for (let i = 4410; i < 26460; i++) { pk = Math.max(pk, Math.abs(d[i])); sq += d[i] * d[i]; }
        const N = 16384, re = new Float64Array(N), im = new Float64Array(N), w = F.hann(N);
        for (let i = 0; i < N; i++) re[i] = d[4410 + i] * w[i];
        F.fft(re, im);
        const band = (h) => { const k = Math.round(h * 110 * N / SR); let e = 0; for (let j = k - 3; j <= k + 3; j++) e += re[j] ** 2 + im[j] ** 2; return e; };
        let lo = 0, hi = 0;
        for (let h = 1; h <= 3; h++) lo += band(h);
        for (let h = 4; h <= 20; h++) hi += band(h);
        return { harm: 10 * Math.log10(hi / lo), crest: 20 * Math.log10(pk / Math.sqrt(sq / 22050)) };
      };
      phys.clean = drive('clean');
      phys.lead = drive('lead');
      phys.metal = drive('metal');
      // Gleiche Eingabe → gleiche Zahlen (deterministisch, Grundlage für Realtime = Offline)
      const a1 = one({ t: 0, midi: 50, dur: 0.6, vel: 0.8 }, { amp: 'lead', fx: { echo: {}, reverb: {} } })[0];
      const a2 = one({ t: 0, midi: 50, dur: 0.6, vel: 0.8 }, { amp: 'lead', fx: { echo: {}, reverb: {} } })[0];
      phys.deterministic = a1.every((v, i) => v === a2[i]);
      // Loop-Modus: periodisch, Ausklang über das Loop-Ende kommt am Anfang an
      const lf = Math.round(2 * SR);
      const [lp] = D.renderGuitar([{ t: 1.8, midi: 45, dur: Infinity, vel: 0.9 }], { sr: SR, spb: 0.5, loopFrames: lf, amp: 'clean' });
      phys.loopLen = lp.length;
      phys.loopWrapEnergy = H.energy(lp, 0, 0.2);

      const presets = Object.keys(D.GUITAR_PRESETS);
      return { out, phys, presets };
    }, helpers.toString());

    const { out, phys, presets } = r;
    if (VERBOSE) {
      for (const x of out) {
        console.log(`${x.id.padEnd(24)} ms=${x.ms?.toFixed(0).padStart(4)} peak=${x.peak?.toFixed(3)} rms=${x.rms?.toFixed(3)} wrap=${x.wrap?.toFixed(3)} step=${x.maxStep?.toFixed(3)} tail=${x.tail?.toFixed(4)} on=${x.onsetMs?.toFixed(1)}ms Am=${x.scaleAm?.toFixed(2) ?? '-'} Ebm=${x.scaleEbm?.toFixed(2) ?? '-'} Cm=${x.scaleCm?.toFixed(2) ?? '-'} Versatz=${x.shift ? `${x.shift.shift} (r ${x.shift.r.toFixed(2)}, nächster ${x.shift.second.toFixed(2)})` : '-'}${x.error ? ' FEHLER ' + x.error : ''}`);
      }
      console.log('Physik:', JSON.stringify(phys));
    }

    // ---------- Umfang und Format ----------
    const loops = out.filter((x) => !x.oneShot), shots = out.filter((x) => x.oneShot);
    check('20–30 Gitarren-Loops und mindestens 6 One-Shots', loops.length >= 20 && loops.length <= 30 && shots.length >= 6, `${loops.length} Loops, ${shots.length} One-Shots`);
    const ids = out.map((x) => x.id);
    check('IDs eindeutig mit Präfix gtr-', new Set(ids).size === ids.length && ids.every((id) => id.startsWith('gtr-')));
    const badName = out.filter((x) => !/gitarre|e-gitarre/i.test(x.name) || !x.tags?.includes('gitarre') || !x.tags?.includes('guitar'));
    check('Name nennt die Gitarre, Tags „gitarre“ und „guitar“', badName.length === 0, badName.map((x) => x.id).join(', '));
    const genres = new Set(out.flatMap((x) => x.genres));
    check('Mehrere Genres (mindestens 8), darunter Rock und Blues', genres.size >= 8 && genres.has('rock') && genres.has('blues'), [...genres].join(', '));
    const errs = out.filter((x) => x.error);
    check('Alle Gitarren-Defs rendern ohne Fehler', errs.length === 0, errs.map((x) => `${x.id}: ${x.error.split('\n')[0]}`).join(' | '));
    const ok = out.filter((x) => !x.error);

    // ---------- Klingt, taktgenau, nahtlos ----------
    const badLen = ok.filter((x) => x.length !== x.expected || x.length93 !== x.expected93);
    check('Länge exakt Takte × 4 Schläge (120 und 93 BPM)', badLen.length === 0, badLen.map((x) => `${x.id}: ${x.length}/${x.expected}, ${x.length93}/${x.expected93}`).join(' | '));
    check('Kein NaN/Inf', ok.every((x) => !x.nan));
    const badPeak = ok.filter((x) => Math.abs(x.peak / x.level - x.peakSet) > 0.01); // vor dem Lautheits-Pegel (ADR 013)
    check('Spitzenpegel wie angegeben (Akkorde 0,42, One-Shots 0,45)', badPeak.length === 0, badPeak.map((x) => `${x.id}: ${x.peak.toFixed(3)}`).join(', '));
    const quiet = ok.filter((x) => !(x.rms > 0.02));
    check('Jeder Gitarren-Sound klingt (RMS > 0,02)', quiet.length === 0, quiet.map((x) => `${x.id}: ${x.rms.toFixed(4)}`).join(', ') || `min ${Math.min(...ok.map((x) => x.rms)).toFixed(3)}`);
    const loud = ok.filter((x) => !x.oneShot && !(x.rms < 0.2));
    check('Kein Loop ist zu dicht (RMS < 0,2 bei Spitze 0,42)', loud.length === 0, loud.map((x) => `${x.id}: ${x.rms.toFixed(3)}`).join(', ') || `max ${Math.max(...ok.filter((x) => !x.oneShot).map((x) => x.rms)).toFixed(3)}`);
    const late = ok.filter((x) => !x.oneShot && x.onsetMs > 3 && x.id !== 'gtr-ambient-swell');
    check('Loops setzen auf Schlag 1 ein (Klang in den ersten 3 ms)', late.length === 0, late.map((x) => `${x.id}: ${x.onsetMs.toFixed(1)} ms`).join(', '));
    const seams = ok.filter((x) => !x.oneShot && x.wrap > Math.max(0.05, x.maxStep));
    check('Loops laufen ohne Sprung an der Nahtstelle', seams.length === 0, seams.map((x) => `${x.id}: ${x.wrap.toFixed(3)} (innen ${x.maxStep.toFixed(3)})`).join(' | '));
    const cut = ok.filter((x) => x.oneShot && x.tail > 0.05 * x.peak);
    check('One-Shots enden leise (letzte 2 ms < 5 % der Spitze)', cut.length === 0, cut.map((x) => `${x.id}: ${x.tail.toFixed(4)}`).join(', '));

    // ---------- Tonart ----------
    const tonal = ok.filter((x) => x.scaleAm !== undefined);
    const offKey = tonal.filter((x) => !(x.scaleAm >= 0.7 && x.scaleCm >= 0.7));
    check('Gitarren klingen in A-Moll und nach +3 Halbtönen in C-Moll (≥ 70 % der Energie auf Skalentönen)', offKey.length === 0,
      offKey.map((x) => `${x.id}: Am ${(x.scaleAm * 100).toFixed(0)} %, Cm ${(x.scaleCm * 100).toFixed(0)} %`).join(', ') || `min ${(Math.min(...tonal.map((x) => Math.min(x.scaleAm, x.scaleCm))) * 100).toFixed(0)} %`);
    const margin = tonal.filter((x) => !(x.scaleAm - x.scaleEbm >= 0.1));
    check('Gegenprobe: A-Moll mindestens 10 Punkte über Es-Moll', margin.length === 0, margin.map((x) => `${x.id}: ${((x.scaleAm - x.scaleEbm) * 100).toFixed(0)}`).join(', '));
    const noFollow = tonal.filter((x) => !(x.shift.shift === 3 && x.shift.r > 0.75 && x.keyDiff > 0.02));
    check('Tonartwechsel (+3) verschiebt jeden Gitarren-Sound um genau 3 Halbtöne (Spektrum in Halbtonbändern)', noFollow.length === 0,
      noFollow.map((x) => `${x.id}: ${x.shift.shift} (r ${x.shift.r.toFixed(2)})`).join(', ') || `kleinste Korrelation ${Math.min(...tonal.map((x) => x.shift.r)).toFixed(2)}`);

    // ---------- Klangphysik ----------
    const cents = phys.pitch.map(([m, p]) => [m, Math.round((p - m) * 100)]);
    check('Saite gestimmt: A2, E3, A3, E4 auf ±10 Cent', cents.every(([, c]) => Math.abs(c) <= 10), JSON.stringify(cents));
    check('Einsatz samplegenau: vor dem Ton still, Klang ab dem Startframe', phys.onset.pre < 1e-6 && phys.onset.first - 22050 <= 44,
      `vorher max ${phys.onset.pre.toExponential(1)}, erster Klang bei Frame ${phys.onset.first} (Start 22050)`);
    check('Palm-Mute klingt mindestens 30 dB schneller ab als die offene Saite', phys.decayMute < phys.decayOpen - 30, `offen ${phys.decayOpen.toFixed(1)} dB, gedämpft ${phys.decayMute.toFixed(1)} dB`);
    check('Notenende dämpft ab (≥ 40 dB in 0,15 s)', phys.stopDb < -40, `${phys.stopDb.toFixed(1)} dB`);
    check('Bend: zwei Halbtöne hoch (±15 Cent)', Math.abs(phys.bend[0] - 57) < 0.15 && Math.abs(phys.bend[1] - 59) < 0.15, phys.bend.map((v) => v.toFixed(2)).join(' → '));
    check('Verzerrer: Lead und Metal haben mindestens 5 dB mehr Obertöne (4.–20.) als Clean und einen kleineren Crest-Faktor',
      ['lead', 'metal'].every((a) => phys[a].harm > phys.clean.harm + 5 && phys[a].crest < phys.clean.crest - 2),
      ['clean', 'lead', 'metal'].map((a) => `${a} ${phys[a].harm.toFixed(1)} dB / Crest ${phys[a].crest.toFixed(1)} dB`).join(', '));
    check('Gleiche Eingabe ergibt dieselben Zahlen (deterministisch)', phys.deterministic);
    check('Loop-Modus: genau Loop-Länge, Ausklang über das Ende erscheint am Anfang', phys.loopLen === 88200 && phys.loopWrapEnergy > 1, `Länge ${phys.loopLen}, Energie am Anfang ${phys.loopWrapEnergy.toFixed(2)}`);
    check('Zwei Gitarren-Presets (clean, verzerrt)', presets.includes('guitar') && presets.includes('guitarDrive'), presets.join(', '));

    // Renderzeit (Loops entstehen beim ersten Gebrauch)
    const ms = ok.map((x) => x.ms).sort((a, b) => a - b);
    const slow = ok.filter((x) => x.ms > 900).map((x) => `${x.id}: ${x.ms.toFixed(0)} ms`);
    check('Renderzeit: keine Gitarren-Def über 900 ms', slow.length === 0, slow.join(', ') || `Median ${ms[ms.length >> 1].toFixed(0)} ms, Max ${ms[ms.length - 1].toFixed(0)} ms`);
    check('Keine Konsolenfehler (Module)', errors.length === 0, errors.join(' | '));
  } catch (e) {
    check('Teil 1 lief durch', false, e.stack);
  } finally {
    await browser.close();
    server.close();
  }

  // ================= Teil 2: App – Preset, Sampler, Lizenzen, Suche =================
  const app = await openApp();
  try {
    const { page } = app;
    const r = await page.evaluate(async (helpersSrc) => {
      const H = await (0, eval)(`(${helpersSrc})`)();
      const { library } = window.loopwerk;
      const I = await import('/src/instruments.js');
      const SM = await import('/src/sampler.js');
      const CG = await import('/src/catalog-guitar.js');
      const { SR } = H;
      const res = {};
      res.presetLabels = I.allPresets().filter((p) => /gitarre/i.test(p.label)).map((p) => `${p.id}:${p.label}`);

      // Melodie mit Gitarren-Preset offline: Töne an der richtigen Stelle und in der richtigen Höhe
      const renderMelody = async (preset) => {
        // Zwei Takte, Töne nur im ersten: Echo und Hall sind vor der Nahtstelle verklungen
        const pat = { type: 'synth', name: 'G', bars: 2, preset, notes: [{ start: 1, len: 1, pitch: 57, vel: 1 }, { start: 3, len: 0.5, pitch: 64, vel: 1 }] };
        const t0 = performance.now();
        const { buffer, level = 1 } = await I.renderPattern(pat, 120, library);
        const d = buffer.getChannelData(0);
        let pre = 0;
        for (let i = 0; i < 22050 - 64; i++) pre = Math.max(pre, Math.abs(d[i]));
        let first = 22050 - 64;
        while (first < d.length && Math.abs(d[first]) < 1e-3) first++;
        return {
          ms: performance.now() - t0, length: buffer.length, pre, first,
          p1: H.pitchAt(d, 0.6, 1.0), p2: H.pitchAt(d, 1.55, 1.7), peak: H.analyse([d]).peak / level, // vor dem Pegel des Klangs (ADR 013)
        };
      };
      res.clean = await renderMelody('guitar');
      res.drive = await renderMelody('guitarDrive');
      res.pluck = await renderMelody('pluck');

      // Echte Gitarren: Instrumente laden, eine Note spielen, Stimmung prüfen
      res.instruments = {};
      for (const inst of CG.GUITAR_INSTRUMENTS) {
        const loaded = await SM.loadInstrument(inst.id);
        const pat = { type: 'synth', name: 'E', bars: 1, preset: inst.id, notes: [{ start: 0, len: 1.5, pitch: 57, vel: 1 }] };
        const { buffer, level = 1 } = await I.renderPattern(pat, 120, library);
        const d = buffer.getChannelData(0);
        res.instruments[inst.id] = {
          zones: loaded.zones.length, decoded: loaded.zones.every((z) => z.buffer.duration > 0.3),
          pitch: H.pitchAt(d, 0.05, inst.id === 'kf-hofner-kurz' ? 0.25 : 0.6), peak: H.analyse([d]).peak / level,
          license: inst.license, licenseUrl: inst.licenseUrl, source: inst.source, fallback: SM.fallbackPreset(inst),
        };
      }

      // Bibliothek: alle Gitarren-Einträge laden und messen; Lizenzangaben der Fremdaufnahmen
      const guitars = library.list().filter((s) => /gitarre|guitar/i.test(`${s.name} ${(s.tags || []).join(' ')}`));
      await library.ensureMany(guitars.map((s) => s.id));
      res.lib = guitars.map((s) => {
        const b = s.buffer;
        const a = b ? H.analyse([b.getChannelData(0), b.getChannelData(1)]) : null;
        return {
          id: s.id, name: s.name, origin: s.origin, license: s.license, licenseUrl: s.licenseUrl, source: s.source,
          loaded: !!b, rms: a?.rms ?? 0, beats: s.lengthBeats, len: b?.length ?? 0, kind: s.kind,
        };
      });

      // Klang aus Beschreibung
      const { soundFromWords } = await import('/src/ai.js');
      res.words = {
        drive: soundFromWords('verzerrte Rock-Gitarre', I.allPresets()).preset,
        plain: soundFromWords('sanfte Gitarre', I.allPresets()).preset,
        noDoubleDrive: !soundFromWords('verzerrte Gitarre', I.allPresets()).fx.drive,
      };
      return res;
    }, helpers.toString());
    if (VERBOSE) console.log(JSON.stringify(r, null, 1));

    check('Melodie-Editor bietet „E-Gitarre clean“ und „E-Gitarre verzerrt“ (und echte Gitarren)',
      r.presetLabels.some((l) => l.startsWith('guitar:')) && r.presetLabels.some((l) => l.startsWith('guitarDrive:')) && r.presetLabels.some((l) => l.startsWith('kf-gretsch:')), r.presetLabels.join(', '));
    for (const [name, m] of [['clean', r.clean], ['verzerrt', r.drive]]) {
      check(`Preset ${name} offline: Länge 2 Takte, Ton genau auf Schlag 2 (still davor, Klang ab Frame 22050)`,
        m.length === 176400 && m.pre < 1e-3 && m.first >= 22050 && m.first <= 22050 + 44, `Länge ${m.length}, davor max ${m.pre.toExponential(1)}, Einsatz Frame ${m.first}`);
      check(`Preset ${name}: A3 und E4 in der richtigen Höhe (±25 Cent)`, Math.abs(r[name === 'clean' ? 'clean' : 'drive'].p1 - 57) < 0.25 && Math.abs(m.p2 - 64) < 0.25, `${m.p1.toFixed(2)}, ${m.p2.toFixed(2)}`);
      check(`Preset ${name}: Lautstärke wie die übrigen Klänge (Spitze 0,2–0,9; Pluck ${r.pluck.peak.toFixed(2)})`, m.peak > 0.2 && m.peak < 0.9, m.peak.toFixed(3));
    }
    for (const [id, x] of Object.entries(r.instruments)) {
      check(`Echte Gitarre ${id}: ${x.zones} Zonen geladen, Ton A3 stimmt (±25 Cent), klingt`, x.zones >= 12 && x.decoded && Math.abs(x.pitch - 57) < 0.25 && x.peak > 0.2,
        `Tonhöhe ${x.pitch.toFixed(2)}, Spitze ${x.peak.toFixed(2)}`);
      check(`Echte Gitarre ${id}: Lizenz CC0 mit Quelle, Ersatzklang „guitar“`, x.license === 'CC0' && /creativecommons\.org\/publicdomain\/zero/.test(x.licenseUrl) && /^https:\/\/github\.com\/sfzinstruments\//.test(x.source) && x.fallback === 'guitar');
    }
    const lib = r.lib;
    const synth = lib.filter((s) => s.origin === 'Loopwerk'), foreign = lib.filter((s) => s.origin !== 'Loopwerk');
    check('Regal: mindestens 30 synthetische und 8 echte Gitarren-Sounds', synth.length >= 30 && foreign.length >= 8, `${synth.length} synthetisch, ${foreign.length} echt: ${foreign.map((s) => s.name).join(', ')}`);
    const dead = lib.filter((s) => !s.loaded || !(s.rms > 0.005));
    check('Jeder Gitarren-Sound im Regal lädt und klingt', dead.length === 0, dead.map((s) => `${s.id}: ${s.loaded ? s.rms.toFixed(4) : 'nicht geladen'}`).join(', '));
    const badLen = lib.filter((s) => s.len !== Math.round(s.beats * 0.5 * 44100));
    check('Alle Gitarren-Sounds im Regal ganze Schläge lang (120 BPM)', badLen.length === 0, badLen.map((s) => `${s.id}: ${s.len} Frames / ${s.beats} Schläge`).join(', '));
    const noLic = foreign.filter((s) => s.license !== 'CC0' || !/creativecommons\.org\/publicdomain\/zero/.test(s.licenseUrl || '') || !/^https?:\/\//.test(s.source || ''));
    check('Fremdaufnahmen: Lizenz CC0, Lizenz-Link und Quelle vermerkt', noLic.length === 0, noLic.map((s) => s.id).join(', '));
    check('Klang aus Beschreibung: „verzerrte Rock-Gitarre“ → E-Gitarre verzerrt (ohne zweiten Verzerrer)', r.words.drive === 'guitarDrive' && r.words.noDoubleDrive, `${r.words.drive}`);
    check('Klang aus Beschreibung: „sanfte Gitarre“ → eine Gitarre', /guitar|kf-/.test(r.words.plain), r.words.plain);

    // Suche im Regal
    const found = {};
    for (const q of ['gitarre', 'guitar', 'e-gitarre']) {
      await page.fill('#shelf-search', q);
      found[q] = await page.evaluate(() => [...document.querySelectorAll('.loop-item .loop-name')].map((n) => n.textContent));
    }
    await page.fill('#shelf-search', '');
    check('Suche „gitarre“ findet die Gitarren (synthetisch und echt)', found.gitarre.length >= 38 && found.gitarre.some((n) => /Powerchord/.test(n)) && found.gitarre.some((n) => /\(echt\)/.test(n)), `${found.gitarre.length} Treffer`);
    check('Suche „guitar“ findet genauso viele', found.guitar.length === found.gitarre.length, `${found.guitar.length} / ${found.gitarre.length}`);
    check('Suche „e-gitarre“ findet die E-Gitarren', found['e-gitarre'].length >= 30, `${found['e-gitarre'].length}`);
    check('Keine Konsolenfehler (App)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Teil 2 lief durch', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
