// Schneller Tempowechsel: die Sounds des Songs zuerst, der Rest im Hintergrund oder bei Gebrauch; Dehnen im Worker,
// keine langen Aufgaben im Hauptthread; schnelles Mehrfachändern rechnet nur den letzten Wert; bis ein Sound fertig ist,
// klingt die alte Fassung im neuen Tempo (wie Tonband), danach stimmen alle Pufferlängen.
// node tests/tempo-fast.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Der Bildaufbau (Leuchten, Pegel, Raumlicht) erzeugt bei Software-Rendering schon im Leerlauf Aufgaben über 50 ms.
// Für die Messung lässt sich requestAnimationFrame anhalten (window.__rafOff): so zählt nur, was der Tempowechsel tut.
const RAF_GATE = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__rafOff = false;
  window.requestAnimationFrame = (f) => raf((t) => {
    if (!window.__rafOff) f(t);
    else setTimeout(() => window.requestAnimationFrame(f), 100);
  });
};

(async () => {
  const app = await openApp({ init: RAF_GATE });
  // Im Browser: noch nicht für das aktuelle Tempo (und die Tonart) vorbereitet?
  await app.page.evaluate(() => {
    window.STALE = (library) => (s) => !!(s.def || s.make || s.orig) && (!s.buffer || library.prepared.get(s.id) !== library._tag(s, library.bpm));
  });
  const { page, errors } = app;
  try {
    await page.evaluate(() => { window.__rafOff = true; });
    await page.waitForTimeout(800);

    // ---------- Benutzte zuerst, Zeit, lange Aufgaben ----------
    const a = await page.evaluate(async () => {
      const { library, store, tempo } = window.loopwerk;
      const stale = STALE(library);
      const used = [...new Set(store.project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)))];
      const loaded = library.list().filter((s) => !s.lazy && (s.def || s.make || s.orig));
      const long = [];
      const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); });
      obs.observe({ type: 'longtask', buffered: false });
      const bpm = 100;
      const ready = (id) => { const s = library.get(id); return !stale(s) && s.atBpm === bpm; };
      const t0 = performance.now();
      store.setBpm(bpm);
      const busyAtStart = tempo.busy && tempo.usedBusy;
      let tUsed = null;
      let restOpen = null;
      await new Promise((res) => {
        const f = () => {
          if (tUsed == null && !tempo.usedBusy) {
            tUsed = performance.now() - t0;
            restOpen = loaded.filter((s) => !used.includes(s.id) && stale(s)).length;
          }
          if (!tempo.busy && tUsed != null) res(); else setTimeout(f, 5);
        };
        f();
      });
      const tAll = performance.now() - t0;
      await new Promise((r) => setTimeout(r, 300));
      obs.disconnect();
      return {
        used: used.length, loaded: loaded.length, busyAtStart, tUsed: Math.round(tUsed), tAll: Math.round(tAll), restOpen,
        usedReady: used.filter((id) => library.get(id)?.def || library.get(id)?.orig || library.get(id)?.make).every(ready),
        long: long.sort((x, y) => y - x),
      };
    });
    check('Tempowechsel meldet sich sofort als laufend', a.busyAtStart);
    check('Sounds des Songs schnell im neuen Tempo (< 1,5 s)', a.usedReady && a.tUsed < 1500, `${a.used} benutzte in ${a.tUsed} ms, alle ${a.loaded} geladenen in ${a.tAll} ms`);
    check('Benutzte zuerst: beim Fertigmelden sind andere Sounds noch offen', a.restOpen >= 5, `${a.restOpen} noch nicht angepasst`);
    check('Keine langen Aufgaben (> 50 ms) im Hauptthread', a.long.length === 0, a.long.length ? `${a.long.length}: ${a.long.join(', ')} ms` : 'keine');

    // ---------- Schnelles Mehrfachändern: nur der letzte Wert zählt ----------
    const b = await page.evaluate(async () => {
      const { library, store, tempo } = window.loopwerk;
      const stale = STALE(library);
      const calls = [];
      const applied = [];
      const used = new Set(store.project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)));
      // Jede Vorbereitung (Rendern bzw. Dehnen eines Sounds) zählen, mit dem Tempo, für das sie rechnet
      const fn = library._prepareNow ? '_prepareNow' : '_prepare';
      const orig = library[fn];
      library[fn] = function (s, bpm, ...rest) {
        calls.push(bpm);
        const p = orig.call(this, s, bpm, ...rest);
        // Übernommen werden darf ein Ergebnis nur, solange sein Tempo noch gilt
        p.then((ok) => { applied.push({ bpm, ok, current: library.bpm === bpm }); });
        return p;
      };
      const settle = () => new Promise((res) => { const f = () => (!tempo.busy && library.bpm === store.project.bpm ? res() : setTimeout(f, 10)); f(); });
      // Auf einen Schlag (Tasten-Wiederholung): 121 … 128
      for (let v = 121; v <= 128; v++) store.setBpm(v);
      await settle();
      const burst = { inter: calls.filter((x) => x !== 128).length, final: calls.filter((x) => x === 128).length };
      calls.length = 0;
      applied.length = 0;
      // Im Klick-Abstand (40 ms): 130 … 138
      for (let v = 130; v <= 138; v++) { store.setBpm(v); await new Promise((r) => setTimeout(r, 40)); }
      await settle();
      const spaced = {
        inter: calls.filter((x) => x !== 138).length, final: calls.filter((x) => x === 138).length, steps: 8, used: used.size,
        discarded: applied.filter((x) => !x.ok).length, staleApplied: applied.filter((x) => x.ok && !x.current).length,
      };
      library[fn] = orig;
      // Danach: jeder geladene Sound im Endtempo, Pufferlänge = Schläge × 60 / BPM
      const bpm = store.project.bpm;
      const bad = [];
      let n = 0;
      for (const s of library.list()) {
        if (s.lazy || !(s.def || s.make || s.orig)) continue;
        n++;
        const want = Math.round(s.lengthBeats * (60 / bpm) * 44100);
        const tempoOk = s.def || s.make || s.kind === 'loop' ? s.atBpm === bpm : s.atBpm === undefined;
        if (s.buffer.length !== want || !tempoOk || stale(s)) bad.push(`${s.id}: ${s.buffer.length}/${want} @${s.atBpm}`);
      }
      return { burst, spaced, bpm, n, bad: bad.slice(0, 6), nBad: bad.length, loaded: n };
    });
    check('Tempo 121…128 auf einen Schlag: keine Zwischenstände gerechnet', b.burst.inter === 0 && b.burst.final > 0, JSON.stringify(b.burst));
    // Angefangen werden je Zwischenschritt höchstens die Sounds des Songs (laufende Rechnungen lassen sich nicht abbrechen),
    // übernommen wird davon nichts; die übrigen Sounds kommen erst im Endtempo dran
    check('Tempo 130…138 im Klick-Abstand: Zwischenstände verworfen', b.spaced.inter <= b.spaced.used * b.spaced.steps && b.spaced.staleApplied === 0 && b.spaced.final >= b.loaded,
      `${b.spaced.inter} angefangene Zwischen-Aufträge (höchstens ${b.spaced.used} je Schritt; alle zu Ende gerechnet wären ${b.spaced.steps * b.loaded}), ${b.spaced.discarded} verworfen, ${b.spaced.staleApplied} veraltet übernommen, ${b.spaced.final} im Endtempo`);
    check('Danach alle Sounds im Endtempo (Pufferlängen passen)', b.bpm === 138 && b.nBad === 0, b.nBad ? b.bad.join('; ') : `${b.n} Sounds bei ${b.bpm} BPM`);

    // ---------- Bei Gebrauch: ein noch nicht angepasster Sound ist beim Vorhören sofort im neuen Tempo ----------
    const c = await page.evaluate(async () => {
      const { library, store, tempo } = window.loopwerk;
      const stale = STALE(library);
      store.setBpm(90);
      await new Promise((res) => { const f = () => (!tempo.usedBusy ? res() : setTimeout(f, 5)); f(); });
      const used = new Set(store.project.tracks.flatMap((t) => t.clips.map((x) => x.sampleId)));
      const pick = library.list().filter((s) => !s.lazy && !used.has(s.id) && stale(s));
      const s = pick.find((x) => x.kind === 'loop' && x.orig) ?? pick[pick.length - 1];
      if (!s) return { none: true };
      const t0 = performance.now();
      await library.ensure(s.id);
      const ms = Math.round(performance.now() - t0);
      const len = [s.buffer.length, Math.round(s.lengthBeats * (60 / 90) * 44100)];
      await new Promise((res) => { const f = () => (!tempo.busy ? res() : setTimeout(f, 10)); f(); });
      return { id: s.id, ms, len, stale: stale(s) };
    });
    check('Bei Gebrauch (Vorhören/Einsetzen) sofort angepasst', !c.none && c.len[0] === c.len[1] && !c.stale, JSON.stringify(c));

    // ---------- Übergang: alte Fassung im neuen Tempo (wie Tonband), Offline = Realtime ----------
    const d = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const sr = 44100;
      // Klicks auf Schlag 0 und 2 bei 120 BPM; Puffer gilt für 120 BPM (wie ein Sound, der noch nicht neu vorbereitet ist)
      const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let ch = 0; ch < 2; ch++) { const x = buf.getChannelData(ch); x[0] = 1; x[sr] = 1; }
      library.register({ id: 'tf-old', name: 'Alt', category: 'fx', kind: 'loop', lengthBeats: 4, buffer: buf, atBpm: 120 });
      const proj = {
        version: 1, bpm: 100, beatsPerBar: 4, lengthBars: 2, loop: { on: false, startBeat: 0, endBeat: 8 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'k', sampleId: 'tf-old', startBeat: 0, lengthBeats: 8 }] }],
      };
      const out = (await renderProject(proj, library, { limiter: false, toBeat: 8 })).getChannelData(0);
      // Lage der Klicks: größter Wert je Fenster um die erwartete Stelle
      const spb = 0.6 * sr;
      const hits = [0, 2, 4, 6].map((beat) => {
        const e = Math.round(beat * spb);
        let best = -1; let bi = -1;
        for (let i = Math.max(0, e - 3000); i < Math.min(out.length, e + 3000); i++) if (Math.abs(out[i]) > best) { best = Math.abs(out[i]); bi = i; }
        return bi - e;
      });
      let peak = 0;
      for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
      library.remove('tf-old');
      return { hits, peak };
    });
    check('Alte Fassung läuft im neuen Tempo: Klicks auf den Schlägen bei 100 BPM', d.hits.every((x) => Math.abs(x) <= 2) && d.peak > 0.3, `Abweichung (Frames): ${d.hits.join(', ')}`);

    const e = await page.evaluate(async () => {
      const { library, store, engine, tempo } = window.loopwerk;
      // Ab der Stelle, an der die meisten Clips gleichzeitig klingen
      const clips = store.project.tracks.flatMap((t) => t.clips);
      const at = clips.map((x) => x.startBeat).sort((p, q) => clips.filter((x) => x.startBeat <= q && x.startBeat + x.lengthBeats > q + 1).length - clips.filter((x) => x.startBeat <= p && x.startBeat + x.lengthBeats > p + 1).length)[0];
      await engine.play(at);
      await new Promise((r) => setTimeout(r, 700));
      const before = engine.heardBeat();
      store.setBpm(110);
      await new Promise((r) => setTimeout(r, 0));
      const rates = [...engine.voices].map((v) => v.src.playbackRate.value);
      const tape = rates.filter((r) => Math.abs(r - 110 / 90) < 1e-3).length;
      const playingNow = engine.playing;
      await new Promise((res) => { const f = () => (!tempo.usedBusy ? res() : setTimeout(f, 5)); f(); });
      await new Promise((r) => setTimeout(r, 300));
      const after = engine.heardBeat();
      const ratesAfter = [...engine.voices].map((v) => v.src.playbackRate.value);
      const playing = engine.playing;
      engine.stop();
      await new Promise((res) => { const f = () => (!tempo.busy ? res() : setTimeout(f, 10)); f(); });
      return { before: +before.toFixed(2), after: +after.toFixed(2), voices: rates.length, tape, playingNow, playing, wrongAfter: ratesAfter.filter((r) => r !== 1).length, nAfter: ratesAfter.length, bpm: library.bpm };
    });
    check('Wiedergabe läuft beim Tempowechsel ohne Pause weiter', e.playingNow && e.playing && e.after > e.before, `Schlag ${e.before} → ${e.after}`);
    check('Bis die neue Fassung da ist: alte im neuen Tempo (playbackRate 110/90)', e.tape > 0, `${e.tape} von ${e.voices} Stimmen`);
    check('Danach klingen alle Sounds des Songs in der neuen Fassung (playbackRate 1)', e.nAfter > 0 && e.wrongAfter === 0, `${e.wrongAfter} von ${e.nAfter} Stimmen noch ausgeglichen`);

    check('Keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('Test lief durch', false, err.message);
  } finally {
    await app.close();
    finish();
  }
})();
