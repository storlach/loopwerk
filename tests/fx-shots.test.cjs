// FX-One-Shots (src/loops-fx.js): jede Def offline rendern und messen, dazu Regal und Engine.
// Prüft Format, IDs, Länge bei drei Tempi, NaN, Spitze, Stille, Lautheit gegenüber den vorhandenen FX, Gleichanteil,
// sauberes Ende, Charakter (Riser steigen, Downlifter fallen, Rückwärts-Klänge schwellen an), Regal-Suche und Export-Weg.
// node tests/fx-shots.test.cjs [--verbose]
const { openApp, createChecker } = require('./harness.cjs');

const VERBOSE = process.argv.includes('--verbose');
const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const S = await import('/src/samples.js');
      const M = await import('/src/loops-more.js');
      const G = await import('/src/loops-guitar.js');
      const X = await import('/src/loops-fx.js');
      const C = await import('/src/catalog.js');
      const V = await import('/src/catalog-vcsl.js');
      const GC = await import('/src/catalog-guitar.js');
      const F = await import('/src/dsp/fft.js');
      const L = await import('/src/dsp/loudness.js');
      const SR = 44100;
      const defs = X.FX_LOOP_DEFS;

      const prepare = async (def, bpm) => {
        const lib = new S.Library();
        lib.bpm = bpm;
        const s = { id: def.id, name: def.name, category: def.category, kind: 'oneshot', beats: def.bars * 4, bpm: null, key: null, oneShot: true, def };
        const t0 = performance.now();
        await lib.add(s);
        return { buf: s.buffer, ms: performance.now() - t0 };
      };
      // Pegel, Lautheit (ganzer Sound und lautestes 400-ms-Fenster), Gleichanteil, Ende, Anfang
      const analyse = (buf) => {
        const n = buf.length;
        const ch = [buf.getChannelData(0), buf.getChannelData(1)];
        let peak = 0, sum = 0, nan = 0;
        const mean = [0, 0];
        ch.forEach((d, c) => {
          for (let i = 0; i < n; i++) {
            const v = d[i];
            if (!Number.isFinite(v)) { nan++; continue; }
            const a = Math.abs(v);
            if (a > peak) peak = a;
            sum += v * v;
            mean[c] += v;
          }
        });
        const W = Math.round(0.4 * SR), hop = Math.round(0.05 * SR);
        let win = 0;
        for (let s = 0; s + W <= n; s += hop) {
          let e = 0;
          for (const d of ch) for (let i = s; i < s + W; i++) e += d[i] * d[i];
          win = Math.max(win, Math.sqrt(e / (2 * W)));
        }
        let tail = 0;
        for (const d of ch) for (let i = n - Math.round(0.002 * SR); i < n; i++) tail = Math.max(tail, Math.abs(d[i]));
        const quarter = (q) => {
          let e = 0;
          const a = Math.floor(q * n / 4), z = Math.floor((q + 1) * n / 4);
          for (const d of ch) for (let i = a; i < z; i++) e += d[i] * d[i];
          return Math.sqrt(e / (2 * (z - a)));
        };
        return {
          peak, rms: Math.sqrt(sum / (2 * n)), win, nan, length: n, tail,
          dc: Math.max(...mean.map((m) => Math.abs(m / n))), first: Math.max(Math.abs(ch[0][0]), Math.abs(ch[1][0])),
          q: [0, 1, 2, 3].map(quarter),
        };
      };
      // Spektraler Schwerpunkt (Hz) im Bereich x ± 10 % der Länge (Leistungsspektren gemittelt)
      const N = 4096, hann = F.hann(N);
      const centroid = (buf, x) => {
        const d = buf.getChannelData(0);
        const a = Math.max(0, Math.round((x - 0.1) * d.length)), z = Math.min(d.length - N, Math.round((x + 0.1) * d.length) - N);
        const re = new Float64Array(N), im = new Float64Array(N);
        let num = 0, den = 0;
        for (let s = a; s <= Math.max(a, z); s += N / 2) {
          for (let i = 0; i < N; i++) { re[i] = d[s + i] * hann[i]; im[i] = 0; }
          F.fft(re, im);
          for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; num += p * k * SR / N; den += p; }
        }
        return den > 0 ? num / den : 0;
      };
      const lufs = (buf) => L.integratedLoudness([buf.getChannelData(0), buf.getChannelData(1)], SR);
      // Aufrufe ins Kit mitschreiben (nur Klänge aus Kit-Bausteinen): alle Ereignisse innerhalb der Länge
      const record = (def) => {
        const ctx = new OfflineAudioContext(2, 128, SR);
        const calls = [];
        const wrap = (kit) => new Proxy(kit, {
          get(target, name) {
            const fn = target[name];
            if (typeof fn !== 'function') return fn;
            return (...args) => {
              if (name === 'bus' || name === 'defer') return wrap(fn(...args));
              if (name !== 'pcm') calls.push([name, args[0]]);
              return name === 'pcm' ? undefined : fn(...args);
            };
          },
        });
        def.render(wrap(S.createKit(ctx, ctx.destination, 0.5, 0)));
        return calls.filter(([, b]) => typeof b === 'number' && (b < 0 || b >= def.bars * 4)).map(([nm, b]) => `${nm}@${b}`);
      };

      // Bezug: alle vorhandenen synthetischen FX (LOOP_DEFS, loops-more, loops-guitar)
      const oldDefs = [...S.LOOP_DEFS, ...M.MORE_LOOP_DEFS, ...G.GUITAR_LOOP_DEFS].filter((d) => d.category === 'fx');
      const ref = [];
      for (const def of oldDefs) {
        const { buf, ms } = await prepare(def, 120);
        const a = analyse(buf);
        ref.push({ id: def.id, rms: a.rms, win: a.win, lufs: lufs(buf), ms, bars: def.bars });
      }
      await prepare(defs[0], 120); // Aufwärmen

      const out = [];
      for (const def of defs) {
        const res = { id: def.id, name: def.name, bars: def.bars, peakSet: def.peak, genres: def.genres, tags: def.tags, category: def.category, oneShot: def.oneShot };
        try {
          res.outside = record(def);
          const p120 = await prepare(def, 120);
          res.ms = p120.ms;
          Object.assign(res, analyse(p120.buf));
          res.lufs = lufs(p120.buf);
          res.expected = Math.round(def.bars * 4 * 0.5 * SR);
          res.c15 = centroid(p120.buf, 0.15);
          res.c85 = centroid(p120.buf, 0.85);
          for (const bpm of [93, 150]) {
            const p = await prepare(def, bpm);
            const a = analyse(p.buf);
            res[`len${bpm}`] = p.buf.length;
            res[`exp${bpm}`] = Math.round(def.bars * 4 * (60 / bpm) * SR);
            res[`tail${bpm}`] = a.tail;
            res[`nan${bpm}`] = a.nan;
            res[`peak${bpm}`] = a.peak;
          }
        } catch (e) {
          res.error = String(e && e.stack || e);
        }
        out.push(res);
      }

      // Bibliothek der App: Einträge, Herkunft, Lizenz
      const { library } = window.loopwerk;
      const stubs = defs.map((d) => {
        const s = library.get(d.id);
        return s && { id: d.id, tonal: !!d.tonal, category: s.category, kind: s.kind, key: s.key, license: s.license, origin: s.origin, genres: s.genres, tags: s.tags, beats: s.beats };
      });
      const otherIds = [...S.LOOP_DEFS, ...M.MORE_LOOP_DEFS, ...G.GUITAR_LOOP_DEFS, ...C.CATALOG, ...V.VCSL_CATALOG, ...GC.GUITAR_CATALOG].map((d) => d.id);
      const otherNames = library.list().filter((s) => !defs.some((d) => d.id === s.id)).map((s) => s.name);
      return { out, ref, stubs, otherIds, otherNames, known: S.GENRES.map((g) => g.id) };
    });

    const { out, ref, stubs, otherIds, otherNames, known } = r;
    const rr = (k) => [Math.min(...ref.map((x) => x[k])), Math.max(...ref.map((x) => x[k]))];
    const [rmsLo, rmsHi] = rr('rms');
    const [winLo, winHi] = rr('win');
    if (VERBOSE) {
      console.log(`Bezug (${ref.length} FX): RMS ${rmsLo.toFixed(3)}–${rmsHi.toFixed(3)}, lautestes 400-ms-Fenster ${winLo.toFixed(3)}–${winHi.toFixed(3)}`);
      for (const x of ref) console.log(`  ${x.id.padEnd(26)} rms=${x.rms.toFixed(3)} win=${x.win.toFixed(3)} lufs=${x.lufs.toFixed(1)}`);
      for (const x of out) {
        console.log(`${x.id.padEnd(20)} ${String(x.bars)}T ms=${x.ms?.toFixed(0).padStart(4)} peak=${x.peak?.toFixed(3)} rms=${x.rms?.toFixed(3)} win=${x.win?.toFixed(3)} lufs=${x.lufs?.toFixed(1)} dc=${x.dc?.toExponential(1)} first=${x.first?.toFixed(4)} tail=${x.tail?.toFixed(4)}/${x.tail150?.toFixed(4)}/${x.tail93?.toFixed(4)} q=${x.q?.map((v) => v.toFixed(3)).join(',')} cent=${x.c15?.toFixed(0)}→${x.c85?.toFixed(0)}${x.error ? ' FEHLER ' + x.error : ''}`);
      }
    }

    // ---------- Format und IDs ----------
    const ids = out.map((x) => x.id);
    check('Mindestens 24 neue FX-One-Shots', out.length >= 24, String(out.length));
    check('IDs eindeutig, Präfix fxs-, keine Kollision mit vorhandenen Sounds',
      new Set(ids).size === ids.length && ids.every((id) => id.startsWith('fxs-') && !otherIds.includes(id)), ids.filter((id) => otherIds.includes(id)).join(', '));
    const names = out.map((x) => x.name);
    const clash = names.filter((nm, i) => names.indexOf(nm) !== i || otherNames.includes(nm));
    check('Namen eindeutig im ganzen Regal', clash.length === 0, clash.join(', '));
    const badFormat = out.filter((x) => x.category !== 'fx' || !x.oneShot || ![1, 2, 4].includes(x.bars) || !(x.peakSet >= 0.2 && x.peakSet <= 0.7)
      || !x.genres?.length || x.genres.some((g) => !known.includes(g)) || !x.tags?.length);
    check('Kategorie FX, One-Shot, 1/2/4 Takte, peak 0,2–0,7, Genres bekannt, Suchwörter', badFormat.length === 0, badFormat.map((x) => x.id).join(', '));
    const errs = out.filter((x) => x.error);
    check('Alle FX rendern ohne Fehler', errs.length === 0, errs.map((x) => `${x.id}: ${x.error.split('\n')[0]}`).join(' | '));
    const ok = out.filter((x) => !x.error);
    const outside = ok.filter((x) => x.outside.length);
    check('Kit-Ereignisse liegen innerhalb der Länge', outside.length === 0, outside.map((x) => `${x.id}: ${x.outside.slice(0, 3)}`).join(' | '));

    // ---------- Regal ----------
    const badStub = out.filter((x, i) => {
      const s = stubs[i];
      return !s || s.category !== 'fx' || s.kind !== 'oneshot' || (s.tonal ? !s.key : s.key !== null) || s.license !== 'CC0' || s.origin !== 'Loopwerk' || s.beats !== x.bars * 4 || !s.tags?.length;
    });
    check('Im Regal: FX, One-Shot, Tonart nur bei tonalen FX, CC0, Herkunft Loopwerk', badStub.length === 0, badStub.map((x) => x.id).join(', '));

    // ---------- Messungen ----------
    const badLen = ok.filter((x) => x.length !== x.expected || x.len93 !== x.exp93 || x.len150 !== x.exp150);
    check('Länge exakt Takte × 4 Schläge (120, 93, 150 BPM)', badLen.length === 0, badLen.map((x) => `${x.id}: ${x.length}/${x.expected}`).join(' | '));
    const nan = ok.filter((x) => x.nan || x.nan93 || x.nan150);
    check('Kein NaN/Inf', nan.length === 0, nan.map((x) => x.id).join(', '));
    const badPeak = ok.filter((x) => !(x.peak <= 0.99 && x.peak93 <= 0.99 && x.peak150 <= 0.99) || Math.abs(x.peak - x.peakSet) > 0.01);
    check('Kein Clipping (Spitze ≤ 0,99) und Spitze wie in peak', badPeak.length === 0, badPeak.map((x) => `${x.id}: ${x.peak.toFixed(3)}`).join(', '));
    const silent = ok.filter((x) => !(x.rms > 0.01));
    check('Kein FX ist still (RMS > 0,01)', silent.length === 0, silent.map((x) => `${x.id}: ${x.rms}`).join(', '));
    const loud = ok.filter((x) => x.rms < rmsLo / 2 || x.rms > rmsHi * 2);
    check('Lautheit (RMS) höchstens 6 dB außerhalb der vorhandenen FX', loud.length === 0,
      loud.map((x) => `${x.id}: ${x.rms.toFixed(3)}`).join(', ') + ` (Bezug ${rmsLo.toFixed(3)}–${rmsHi.toFixed(3)})`);
    const loudWin = ok.filter((x) => x.win < winLo / 2 || x.win > winHi * 2);
    check('Lautestes 400-ms-Fenster höchstens 6 dB außerhalb der vorhandenen FX', loudWin.length === 0,
      loudWin.map((x) => `${x.id}: ${x.win.toFixed(3)}`).join(', ') + ` (Bezug ${winLo.toFixed(3)}–${winHi.toFixed(3)})`);
    // Lautheit nach BS.1770 (K-gewichtet, Pausen ausgeblendet): Median der neuen höchstens 2 LU neben dem der
    // vorhandenen, jeder einzelne zwischen Median − 6 LU und Median + 4 LU (kein Ausreißer nach oben)
    const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
    const luRef = med(ref.map((x) => x.lufs)), luNew = med(ok.map((x) => x.lufs));
    const luBad = ok.filter((x) => !(x.lufs >= luRef - 6 && x.lufs <= luRef + 4));
    const luSorted = ok.map((x) => x.lufs).sort((a, b) => a - b);
    check('Lautheit (LUFS) wie die vorhandenen FX: Median ±2 LU, jeder zwischen −6 und +4 LU um deren Median', Math.abs(luNew - luRef) <= 2 && luBad.length === 0,
      `Median neu ${luNew.toFixed(1)}, vorhanden ${luRef.toFixed(1)}, neu ${luSorted[0].toFixed(1)} bis ${luSorted[luSorted.length - 1].toFixed(1)}${luBad.length ? '; ' + luBad.map((x) => `${x.id}: ${x.lufs.toFixed(1)}`).join(', ') : ''}`);
    const dc = ok.filter((x) => !(x.dc < 0.002));
    check('Kein Gleichanteil (|Mittelwert| < 0,002)', dc.length === 0, dc.map((x) => `${x.id}: ${x.dc.toExponential(2)}`).join(', ') || `max ${Math.max(...ok.map((x) => x.dc)).toExponential(1)}`);
    const cut = ok.filter((x) => [x.tail, x.tail93, x.tail150].some((t) => t > 0.15 * x.peak));
    check('Enden leise bei 93, 120 und 150 BPM (letzte 2 ms < 15 % der Spitze)', cut.length === 0,
      cut.map((x) => `${x.id}: ${[x.tail93, x.tail, x.tail150].map((t) => t.toFixed(3))}`).join(', '));
    const click = ok.filter((x) => !(x.first < 0.01));
    check('Kein Knacks am Anfang (erstes Sample < 0,01)', click.length === 0, click.map((x) => `${x.id}: ${x.first.toFixed(4)}`).join(', '));

    // ---------- Charakter ----------
    const db = (a, b) => 20 * Math.log10(a / b);
    const has = (x, t) => x.tags.includes(t);
    const rise = ok.filter((x) => has(x, 'riser') || has(x, 'reverse'));
    const noRise = rise.filter((x) => !(db(x.q[3], x.q[0]) >= 6));
    check('Riser und Rückwärts-Klänge werden lauter (letztes Viertel ≥ 6 dB über dem ersten)', rise.length >= 7 && noRise.length === 0,
      noRise.map((x) => `${x.id}: ${db(x.q[3], x.q[0]).toFixed(1)} dB`).join(', ') || `${rise.length} Sounds, min ${Math.min(...rise.map((x) => db(x.q[3], x.q[0]))).toFixed(1)} dB`);
    const fall = ok.filter((x) => has(x, 'downlifter') || has(x, 'impact'));
    const noFall = fall.filter((x) => !(db(x.q[0], x.q[3]) >= 6));
    check('Downlifter und Einschläge klingen ab (erstes Viertel ≥ 6 dB über dem letzten)', fall.length >= 4 && noFall.length === 0,
      noFall.map((x) => `${x.id}: ${db(x.q[0], x.q[3]).toFixed(1)} dB`).join(', ') || `${fall.length} Sounds, min ${Math.min(...fall.map((x) => db(x.q[0], x.q[3]))).toFixed(1)} dB`);
    const up = ok.filter((x) => has(x, 'riser') && !has(x, 'shepard'));
    const noUp = up.filter((x) => !(x.c85 > 1.5 * x.c15));
    check('Riser werden heller (Schwerpunkt bei 85 % ≥ 1,5 × bei 15 %)', noUp.length === 0,
      noUp.map((x) => `${x.id}: ${x.c15.toFixed(0)} → ${x.c85.toFixed(0)} Hz`).join(', ') || up.map((x) => `${x.id.slice(4)} ${(x.c85 / x.c15).toFixed(1)}×`).join(', '));
    const down = ok.filter((x) => has(x, 'downlifter'));
    const noDown = down.filter((x) => !(x.c15 > 1.5 * x.c85));
    check('Downlifter werden dunkler (Schwerpunkt bei 15 % ≥ 1,5 × bei 85 %)', down.length >= 2 && noDown.length === 0,
      noDown.map((x) => `${x.id}: ${x.c15.toFixed(0)} → ${x.c85.toFixed(0)} Hz`).join(', '));

    // ---------- Renderzeit ----------
    // Bezug im selben Lauf (die Testmaschine schwankt): vorhandene FX gleicher Länge je Takt
    const ms = ok.map((x) => x.ms / x.bars).sort((a, b) => a - b);
    const refMs = ref.map((x) => x.ms / x.bars).sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length, refAvg = refMs.reduce((a, b) => a + b, 0) / refMs.length;
    const slowest = ok.reduce((a, b) => (b.ms / b.bars > a.ms / a.bars ? b : a));
    check('Renderzeit je Takt im Mittel höchstens doppelt so lang wie bei den vorhandenen FX, keine über 400 ms je Takt',
      avg <= 2 * refAvg && ms[ms.length - 1] < 400,
      `Mittel ${avg.toFixed(0)} ms/Takt (vorhandene ${refAvg.toFixed(0)}), langsamster ${slowest.id} ${(slowest.ms / slowest.bars).toFixed(0)} ms/Takt`);

    // ---------- Regal: Suche und Längenfilter ----------
    const shelf = async (q, len) => {
      await page.fill('#shelf-search', q);
      if (len) {
        if (await page.getAttribute('#shelf-filter-btn', 'aria-expanded') !== 'true') await page.click('#shelf-filter-btn');
        if (await page.getAttribute(`.shelf-len .seg[data-len="${len}"]`, 'aria-pressed') !== 'true') await page.click(`.shelf-len .seg[data-len="${len}"]`);
      }
      await page.waitForTimeout(250);
      return page.evaluate(() => [...document.querySelectorAll('#library .loop-item')].map((nd) => nd.dataset.sampleId));
    };
    let rows = await shelf('Sirene');
    check('Suche „Sirene“ findet die Dub-Sirene', rows.includes('fxs-siren'), rows.join(', '));
    rows = await shelf('riser', 'shot');
    const risers = ids.filter((id) => out.find((x) => x.id === id).tags.includes('riser'));
    check('Suche „riser“ mit Länge Shot zeigt alle neuen Riser', risers.every((id) => rows.includes(id)), `${rows.filter((id) => id.startsWith('fxs-')).length}/${risers.length}`);
    rows = await shelf('', 'shot');
    check('Länge Shot zeigt alle neuen FX', ids.every((id) => rows.includes(id)), `${ids.filter((id) => rows.includes(id)).length}/${ids.length}`);
    rows = await shelf('', '1');
    check('Länge 1 Takt zeigt keinen der neuen FX (One-Shots)', !ids.some((id) => rows.includes(id)));
    await page.click('#shelf-reset');

    // ---------- Engine: alle FX hintereinander auf einer Spur, Offline-Rendering wie beim Export ----------
    const eng = await page.evaluate(async (list) => {
      const { library, renderProject } = window.loopwerk;
      const { defaultFx } = await import('/src/effects.js');
      for (const x of list) await library.ensure(x.id);
      let at = 0;
      const clips = list.map((x, i) => { const c = { id: `c${i}`, sampleId: x.id, startBeat: at, lengthBeats: x.bars * 4 }; at += x.bars * 4; return c; });
      const project = {
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: at / 4, loop: { on: false, startBeat: 0, endBeat: at },
        tracks: [{ id: 't1', name: 'FX', volume: 1, pan: 0, mute: false, solo: false, fx: defaultFx(), clips }],
      };
      const buf = await renderProject(project, library, { limiter: false, toBeat: at });
      const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
      const spbS = 0.5 * 44100;
      let nan = 0, peak = 0;
      for (const d of [d0, d1]) for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) nan++; else peak = Math.max(peak, Math.abs(v)); }
      const quiet = [];
      for (const c of clips) {
        const a = Math.round(c.startBeat * spbS), z = Math.round((c.startBeat + c.lengthBeats) * spbS);
        let e = 0;
        for (let i = a; i < z; i++) e += d0[i] * d0[i] + d1[i] * d1[i];
        const rms = Math.sqrt(e / (2 * (z - a)));
        if (!(rms > 0.005)) quiet.push(`${c.sampleId}: ${rms.toFixed(4)}`);
      }
      return { nan, peak, quiet, length: buf.length, expected: Math.round(at * spbS) };
    }, ok.map((x) => ({ id: x.id, bars: x.bars })));
    check('Export-Weg (renderProject): alle FX hintereinander, kein NaN, keiner still, Spitze ≤ 1',
      eng.nan === 0 && eng.quiet.length === 0 && eng.peak <= 1 && Math.abs(eng.length - eng.expected) <= 1,
      `Spitze ${eng.peak.toFixed(3)}, ${eng.quiet.join(', ') || 'alle hörbar'}, ${eng.length}/${eng.expected} Frames`);

    // Tonale FX folgen der Song-Tonart (Martin, Nov. 2026): Grundton verschiebt sich um die Halbtöne, Länge bleibt;
    // Geräusch-FX bleiben unverändert
    const tonal = await page.evaluate(async () => {
      const S = await import('/src/samples.js');
      const X = await import('/src/loops-fx.js');
      const F = await import('/src/dsp/fft.js');
      const render = async (id, semis) => {
        const def = X.FX_LOOP_DEFS.find((d) => d.id === id);
        const lib = new S.Library();
        lib.bpm = 120;
        lib.semis = semis;
        const s = { id: def.id, name: def.name, category: 'fx', kind: 'oneshot', beats: def.bars * 4, bpm: null, key: def.tonal ? 'Am' : null, oneShot: true, def };
        await lib.add(s);
        return s.buffer;
      };
      // Spektraler Schwerpunkt der tiefsten starken Linie in der Mitte des Klangs
      const pitch = (buf) => {
        const N = 32768, d = buf.getChannelData(0), off = Math.max(0, Math.floor(d.length * 0.55) - N / 2);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = (d[off + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        F.fft(re, im);
        const mag = Array.from({ length: N / 2 }, (_, k) => Math.hypot(re[k], im[k]));
        const top = Math.max(...mag.slice(20));
        const k0 = mag.findIndex((m, k) => k > 20 && m > top * 0.5 && m >= mag[k - 1] && m >= mag[k + 1]);
        return (k0 * buf.sampleRate) / N;
      };
      const centroid = (buf) => {
        const N = 65536, d = buf.getChannelData(0);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < Math.min(N, d.length); i++) re[i] = d[i];
        F.fft(re, im);
        let num = 0, den = 0;
        for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); num += k * m; den += m; }
        return num / den;
      };
      const out = {};
      for (const id of ['fxs-swell', 'fxs-riser-filter', 'fxs-sparkle']) {
        const a = await render(id, 0), b = await render(id, 3);
        out[id] = { ratio: (id === 'fxs-sparkle' ? centroid(b) / centroid(a) : pitch(b) / pitch(a)), len: [a.length, b.length] };
      }
      const n0 = await render('fxs-noise-burst', 0), n3 = await render('fxs-noise-burst', 3);
      let diff = 0; for (let i = 0; i < n0.length; i++) diff = Math.max(diff, Math.abs(n0.getChannelData(0)[i] - n3.getChannelData(0)[i]));
      out.noise = diff;
      out.flags = X.FX_LOOP_DEFS.filter((d) => d.tonal).map((d) => d.id);
      return out;
    });
    const want = 2 ** (3 / 12);
    for (const id of ['fxs-swell', 'fxs-riser-filter', 'fxs-sparkle']) {
      const r = tonal[id];
      check(`${id}: folgt der Tonart (3 Halbtöne höher ≈ ×${want.toFixed(3)}), Länge gleich`, Math.abs(r.ratio - want) < 0.03 && r.len[0] === r.len[1], JSON.stringify(r));
    }
    check('Geräusch-FX bleiben unabhängig von der Tonart', tonal.noise === 0, String(tonal.noise));
    check('8 tonale FX markiert', tonal.flags.length === 8, tonal.flags.join(', '));

    check('Keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief durch', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
