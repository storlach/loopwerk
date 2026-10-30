// Weitere synthetische Loops (src/loops-more.js): jede Def offline rendern und messen.
// Prüft Format, Länge, NaN, Pegel, Lautheit im Vergleich zu LOOP_DEFS, nahtlosen Übergang, Tonartwechsel und Renderzeit.
// node tests/more-loops.test.cjs [--verbose]
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');

const VERBOSE = process.argv.includes('--verbose');
const { check, finish } = createChecker();

(async () => {
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    // Leere Seite vom selben Server: nur die Module laden, nicht die ganze App
    await page.goto(url + 'package.json');
    const r = await page.evaluate(async () => {
      const S = await import('/src/samples.js');
      const F = await import('/src/dsp/fft.js');
      const M = await import('/src/loops-more.js');
      const defs = M.MORE_LOOP_DEFS;
      const SR = 44100;
      const TONAL = new Set(['bass', 'chords', 'synth']);
      // Instrumente mit festen Frequenzen in Hz (nicht über tf): in tonalen Loops verboten
      const HZ = new Set(['tom', 'clang', 'conga', 'cowbell', 'clave', 'zap', 'swell', 'subDrop', 'impact', 'crash', 'sweep', 'riser', 'kick', 'kick909', 'kickDeep']);

      // Aufrufe mitschreiben (Methode, Schlag), auch in Untergruppen (bus)
      const record = (def) => {
        const ctx = new OfflineAudioContext(2, 128, SR);
        const calls = [];
        const wrap = (kit) => new Proxy(kit, {
          get(target, name) {
            const fn = target[name];
            if (typeof fn !== 'function') return fn;
            return (...args) => {
              if (name === 'bus' || name === 'defer') return wrap(fn(...args));
              calls.push([name, args[0]]);
              return fn(...args);
            };
          },
        });
        def.render(wrap(S.createKit(ctx, ctx.destination, 0.5, 0)));
        return calls;
      };

      // Anteil der Spektralenergie (60 Hz–4 kHz) auf den Tönen einer Moll-Tonleiter (natürlich + große Septime)
      const N = 32768;
      const win = F.hann(N);
      const inScale = (buf, root) => {
        const d = buf.getChannelData(0);
        const chroma = new Float64Array(12);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let s = 0; s + N <= d.length || s === 0; s += N) {
          for (let i = 0; i < N; i++) { re[i] = (d[s + i] || 0) * win[i]; im[i] = 0; }
          F.fft(re, im);
          for (let k = Math.ceil(60 * N / SR); k < 4000 * N / SR; k++) {
            const f = k * SR / N;
            const pc = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
            chroma[pc] += re[k] * re[k] + im[k] * im[k];
          }
          if (s + 2 * N > d.length) break;
        }
        const scale = [0, 2, 3, 5, 7, 8, 10, 11].map((x) => (x + root) % 12);
        const total = chroma.reduce((a, b) => a + b, 0);
        return total > 0 ? scale.reduce((a, pc) => a + chroma[pc], 0) / total : 0;
      };

      const analyse = (buf) => {
        let peak = 0, sum = 0, nan = 0, maxStep = 0;
        const n = buf.length;
        const chans = [buf.getChannelData(0), buf.getChannelData(1)];
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
        // Sprung an der Nahtstelle (letzter → erster Frame) gegenüber dem größten Sprung im Inneren
        const wrap = Math.max(...chans.map((d) => Math.abs(d[0] - d[n - 1])));
        // Ende (letzte 2 ms) für One-Shots: ausgeklungen oder bewusst kurz ausgeblendet, nicht abgeschnitten
        let tail = 0;
        for (const d of chans) for (let i = n - Math.round(0.002 * SR); i < n; i++) tail = Math.max(tail, Math.abs(d[i]));
        return { peak, rms: Math.sqrt(sum / (2 * n)), nan, wrap, maxStep, tail, length: n };
      };

      // Rohes Rendering (mit Ausklang, ohne Falten); plain = Kit ohne Aufbau auf Abruf (defer liefert das Kit selbst)
      const raw = async (def, plain) => {
        const ctx = new OfflineAudioContext(2, Math.round(def.bars * 4 * 0.5 * SR) + 2 * SR, SR);
        const kit = S.createKit(ctx, ctx.destination, 0.5, 0);
        const k = plain ? new Proxy(kit, { get: (t, n) => (n === 'defer' ? () => kit : t[n]) }) : kit;
        def.render(k);
        const b = await ctx.startRendering();
        return [b.getChannelData(0), b.getChannelData(1)];
      };

      const prepare = async (def, bpm, semis = 0) => {
        const lib = new S.Library();
        lib.bpm = bpm;
        lib.semis = semis;
        const s = {
          id: def.id, name: def.name, category: def.category, kind: def.oneShot ? 'oneshot' : 'loop',
          beats: def.bars * 4, bpm: null, key: TONAL.has(def.category) ? S.LIBRARY_KEY : null, oneShot: !!def.oneShot, def,
        };
        const t0 = performance.now();
        await lib.add(s);
        return { s, ms: performance.now() - t0, lib };
      };

      // Bezugswerte: RMS der vorhandenen LOOP_DEFS je Kategorie
      const ref = {};
      const refMs = [];
      for (const def of S.LOOP_DEFS) {
        const { s, ms } = await prepare(def, 120);
        const a = analyse(s.buffer);
        (ref[def.category] ||= []).push(a.rms);
        refMs.push([def.id, ms]);
      }

      // Aufwärmen (JIT, Kurven), damit die erste Def nicht die Zeit verfälscht
      await prepare(defs[0], 120);
      const out = [];
      for (const def of defs) {
        const res = { id: def.id, category: def.category, bars: def.bars, peakSet: def.peak, oneShot: !!def.oneShot, genres: def.genres, name: def.name };
        try {
          const calls = record(def);
          res.calls = calls.length;
          res.outOfRange = calls.filter(([, b]) => typeof b === 'number' && (b < 0 || b >= def.bars * 4)).map(([n, b]) => `${n}@${b}`);
          res.hzInTonal = TONAL.has(def.category) ? [...new Set(calls.map(([n]) => n).filter((n) => HZ.has(n)))] : [];
          const { s, ms, lib } = await prepare(def, 120);
          res.ms = ms;
          Object.assign(res, analyse(s.buffer));
          res.expected = Math.round(def.bars * 4 * 0.5 * SR);
          // zweites Tempo mit krummer Frame-Zahl
          const p93 = await prepare(def, 93);
          res.length93 = p93.s.buffer.length;
          res.expected93 = Math.round(def.bars * 4 * (60 / 93) * SR);
          // Aufbau auf Abruf (kit.defer) darf den Klang nicht verändern
          const [a0, a1] = await raw(def, true);
          const [b0, b1] = await raw(def, false);
          let dmax = 0, pmax = 0;
          for (let i = 0; i < a0.length; i++) {
            dmax = Math.max(dmax, Math.abs(a0[i] - b0[i]), Math.abs(a1[i] - b1[i]));
            pmax = Math.max(pmax, Math.abs(a0[i]), Math.abs(a1[i]));
          }
          res.deferDiff = pmax > 0 ? dmax / pmax : 1;
          if (TONAL.has(def.category)) {
            res.scaleAm = inScale(s.buffer, 9);
            res.scaleWrong = inScale(s.buffer, 3); // Gegenprobe: Es-Moll
            const a = s.buffer.getChannelData(0).slice();
            await lib.setKey(3);
            res.scaleCm = inScale(lib.get(def.id).buffer, 0);
            const b = lib.get(def.id).buffer.getChannelData(0);
            let diff = 0;
            for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
            res.keyDiff = diff;
          }
        } catch (e) {
          res.error = String(e && e.stack || e);
        }
        out.push(res);
      }
      const known = new Set([...S.GENRES, ...M.MORE_GENRES].map((g) => g.id));
      return { out, ref, refMs, known: [...known], loopIds: S.LOOP_DEFS.map((d) => d.id) };
    });

    const { out, ref, refMs, known, loopIds } = r;
    const refRange = Object.fromEntries(Object.entries(ref).map(([c, v]) => [c, [Math.min(...v), Math.max(...v)]]));
    if (VERBOSE) {
      console.log('Bezug RMS je Kategorie (LOOP_DEFS):', JSON.stringify(refRange));
      console.log('Bezug Renderzeit LOOP_DEFS (ms):', refMs.map(([id, ms]) => `${id} ${ms.toFixed(0)}`).join(', '));
      for (const x of out) {
        console.log(`${x.id.padEnd(30)} ${x.category.padEnd(6)} ms=${x.ms?.toFixed(0).padStart(4)} peak=${x.peak?.toFixed(3)} rms=${x.rms?.toFixed(3)} wrap=${x.wrap?.toFixed(3)} step=${x.maxStep?.toFixed(3)} tail=${x.tail?.toFixed(4)} key=${x.keyDiff?.toFixed(3) ?? '-'} defer=${x.deferDiff?.toExponential(1)} Am=${x.scaleAm?.toFixed(2) ?? '-'} Cm=${x.scaleCm?.toFixed(2) ?? '-'}${x.error ? ' FEHLER ' + x.error : ''}`);
      }
    }

    // ---------- Format ----------
    const ids = out.map((x) => x.id);
    check('Mindestens 120 neue Loop-Defs', out.length >= 120, `${out.length}`);
    check('IDs eindeutig, mit Präfix gen-, ohne Überschneidung mit LOOP_DEFS',
      new Set(ids).size === ids.length && ids.every((id) => id.startsWith('gen-') && !loopIds.includes(id)));
    const cats = new Set(['drums', 'bass', 'chords', 'synth', 'fx']);
    const badFormat = out.filter((x) => !cats.has(x.category) || ![1, 2, 4].includes(x.bars) || !(x.peakSet >= 0.2 && x.peakSet <= 0.95)
      || (x.oneShot && x.category !== 'fx') || !x.name || !x.genres?.length || x.genres.some((g) => !known.includes(g)));
    check('Kategorie, Takte, peak, oneShot nur bei FX, Genres bekannt', badFormat.length === 0, badFormat.map((x) => x.id).join(', '));

    const errs = out.filter((x) => x.error);
    check('Alle Defs rendern ohne Fehler', errs.length === 0, errs.map((x) => `${x.id}: ${x.error.split('\n')[0]}`).join(' | '));
    const ok = out.filter((x) => !x.error);

    // ---------- Ereignisse und Tonart ----------
    const outside = ok.filter((x) => x.outOfRange.length);
    check('Alle Ereignisse liegen innerhalb der Loop-Länge', outside.length === 0, outside.map((x) => `${x.id}: ${x.outOfRange.slice(0, 3)}`).join(' | '));
    const hz = ok.filter((x) => x.hzInTonal.length);
    check('Tonale Loops nutzen nur Instrumente mit tf() (keine festen Hz)', hz.length === 0, hz.map((x) => `${x.id}: ${x.hzInTonal}`).join(' | '));
    const deferBad = ok.filter((x) => !(x.deferDiff < 0.002));
    check('Aufbau auf Abruf (defer) klingt wie sofortiger Aufbau (Abweichung < 0,2 % des Spitzenpegels)', deferBad.length === 0,
      deferBad.map((x) => `${x.id}: ${(x.deferDiff * 100).toFixed(3)} %`).join(', ') || `max ${(Math.max(...ok.map((x) => x.deferDiff)) * 100).toFixed(4)} %`);
    const offKey = ok.filter((x) => x.scaleAm !== undefined && !(x.scaleAm >= 0.75 && x.scaleCm >= 0.75));
    const minScale = Math.min(...ok.filter((x) => x.scaleAm !== undefined).map((x) => Math.min(x.scaleAm, x.scaleCm)));
    check('Tonale Loops klingen in A-Moll und nach +3 Halbtönen in C-Moll (≥ 75 % der Energie auf Skalentönen)', offKey.length === 0,
      offKey.map((x) => `${x.id}: Am ${(x.scaleAm * 100).toFixed(0)} %, Cm ${(x.scaleCm * 100).toFixed(0)} %`).join(', ') || `min ${(minScale * 100).toFixed(0)} %`);
    const tonal = ok.filter((x) => x.scaleWrong !== undefined);
    const margins = tonal.map((x) => [x.id, x.scaleAm - x.scaleWrong]).sort((a, b) => a[1] - b[1]);
    check('Gegenprobe: jeder tonale Loop liegt in A-Moll mindestens 10 Prozentpunkte über Es-Moll', margins[0][1] >= 0.1,
      `kleinster Abstand ${(margins[0][1] * 100).toFixed(0)} Punkte (${margins[0][0]}), Median ${(margins[margins.length >> 1][1] * 100).toFixed(0)}`);
    const noKey = ok.filter((x) => x.keyDiff !== undefined && !(x.keyDiff > 0.02));
    check('Tonartwechsel (+3 Halbtöne) verändert jeden tonalen Loop', noKey.length === 0, noKey.map((x) => `${x.id}: ${x.keyDiff}`).join(', '));

    // ---------- Messungen ----------
    const badLen = ok.filter((x) => x.length !== x.expected || x.length93 !== x.expected93);
    check('Länge exakt Takte × 4 Schläge (120 und 93 BPM)', badLen.length === 0, badLen.map((x) => `${x.id}: ${x.length}/${x.expected}, ${x.length93}/${x.expected93}`).join(' | '));
    const nan = ok.filter((x) => x.nan);
    check('Kein NaN/Inf', nan.length === 0, nan.map((x) => x.id).join(', '));
    const badPeak = ok.filter((x) => !(x.peak >= 0.2 && x.peak <= 0.95) || Math.abs(x.peak - x.peakSet) > 0.01);
    check('Spitzenpegel 0,2–0,95 und wie in peak angegeben', badPeak.length === 0, badPeak.map((x) => `${x.id}: ${x.peak.toFixed(3)}`).join(', '));
    // Nicht still: RMS mindestens -40 dBFS
    const silent = ok.filter((x) => !(x.rms > 0.01));
    check('Kein Loop ist still (RMS > 0,01)', silent.length === 0, silent.map((x) => `${x.id}: ${x.rms}`).join(', '));
    // Lautheit passend: RMS je Kategorie höchstens 6 dB außerhalb der Spanne der vorhandenen Loops
    const loud = ok.filter((x) => {
      const [lo, hi] = refRange[x.category];
      return x.rms < lo / 2 || x.rms > hi * 2;
    });
    check('Lautheit (RMS) passt zu den vorhandenen Loops der Kategorie (±6 dB um deren Spanne)', loud.length === 0,
      loud.map((x) => `${x.id}: ${x.rms.toFixed(3)} (Bezug ${refRange[x.category].map((v) => v.toFixed(3))})`).join(' | '));
    // Nahtlos: Sprung an der Nahtstelle nicht größer als der größte Sprung im Inneren und absolut klein
    const seams = ok.filter((x) => !x.oneShot && x.wrap > Math.max(0.05, x.maxStep));
    check('Loops laufen ohne Sprung an der Nahtstelle', seams.length === 0, seams.map((x) => `${x.id}: ${x.wrap.toFixed(3)} (innen max ${x.maxStep.toFixed(3)})`).join(' | '));
    // One-Shots klingen bei 120 BPM vor dem Ende aus (kein abgeschnittener Ausklang)
    const cut = ok.filter((x) => x.oneShot && x.tail > 0.15 * x.peak);
    check('One-Shots enden leise (letzte 2 ms < 15 % des Spitzenpegels, nicht abgeschnitten)', cut.length === 0, cut.map((x) => `${x.id}: ${x.tail.toFixed(4)}`).join(', '));

    // ---------- Renderzeit ----------
    const ms = ok.map((x) => x.ms).sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    const slow = ok.filter((x) => x.ms > 300).map((x) => `${x.id}: ${x.ms.toFixed(0)} ms`);
    check('Renderzeit im Mittel unter 150 ms je Def', avg < 150, `Mittel ${avg.toFixed(0)} ms, Median ${ms[ms.length >> 1].toFixed(0)} ms, Max ${ms[ms.length - 1].toFixed(0)} ms`);
    check('Keine Def braucht länger als 300 ms', slow.length === 0, slow.join(', '));

    check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
  } catch (e) {
    check('Test lief durch', false, e.stack);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
