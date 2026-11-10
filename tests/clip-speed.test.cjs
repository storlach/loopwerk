// Geschwindigkeit eines Clips (50–200 %): ohne „wie Tonband“ bleibt die Tonhöhe (WSOLA), mit ändert sie sich um den Faktor
// (playbackRate). Länge im Modell, Realtime = Offline, Live-Änderung ohne Stopp, Rückgängig je Ziehvorgang, alte Projekte,
// Bedienung im Inspektor (Desktop) und in der Clip-Leiste (Handy).
// node tests/clip-speed.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1400, height: 900 } });
  let { page } = app;
  try {
    // ---------- Klang: Tonhöhe und Dauer gemessen (Offline-Rendering) ----------
    const au = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const M = await import('./src/model.js');
      const sr = 44100;
      // 2 s Sinus 440 Hz = 4 Schläge bei 120 BPM, als Einzelklang (wie eine Aufnahme)
      const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); }
      library.register({ id: 'spd-tone', name: 'Ton', category: 'fx', kind: 'oneshot', lengthBeats: 4, bpm: 120, buffer: b });
      // Grundfrequenz über interpolierte Nulldurchgänge (aufsteigend) im Fenster [a, z) Sekunden
      const freq = (d, a, z) => {
        let first = -1; let last = -1; let n = 0;
        for (let i = Math.round(a * sr) + 1; i < Math.round(z * sr); i++) {
          if (d[i - 1] < 0 && d[i] >= 0) { const t = i - 1 + d[i - 1] / (d[i - 1] - d[i]); if (first < 0) first = t; last = t; n++; }
        }
        return n > 1 ? ((n - 1) * sr) / (last - first) : 0;
      };
      const lastLoud = (d) => { let l = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) l = i; return l / sr; };
      const run = async (speed, varispeed) => {
        const s = new M.Store(M.createEmptyProject(), { sampleBeats: (id) => library.get(id).lengthBeats });
        s.project.lengthBars = 4;
        const id = s.addClip('t1', 'spd-tone', 0, 4);
        s.setClipSpeed(id, speed, { varispeed });
        const clip = { ...s.findClip(id).clip };
        await library.ensureProject(s.project);
        const d = (await renderProject(s.project, library, { limiter: false, toBeat: 16 })).getChannelData(0);
        const dur = lastLoud(d);
        return { len: clip.lengthBeats, stretch: clip.stretch ?? 1, varispeed: !!clip.varispeed, dur: Math.round(dur * 1000) / 1000, hz: Math.round(freq(d, dur * 0.2, dur * 0.8) * 10) / 10 };
      };
      return {
        s50: await run(0.5, false), s150: await run(1.5, false),
        t50: await run(0.5, true), t150: await run(1.5, true), t200: await run(2, true),
      };
    });
    const near = (v, want, tol) => Math.abs(v - want) <= Math.abs(want) * tol;
    check('Ohne Tonband 50 %: Clip doppelt so lang (8 Schläge), Ton klingt ≈4 s', au.s50.len === 8 && au.s50.stretch === 2 && !au.s50.varispeed && near(au.s50.dur, 4, 0.03), JSON.stringify(au.s50));
    check('Ohne Tonband 50 %: Tonhöhe bleibt 440 Hz (±1 %)', near(au.s50.hz, 440, 0.01), `${au.s50.hz} Hz`);
    check('Ohne Tonband 150 %: Clip ⅔ so lang, Ton ≈1,33 s, Tonhöhe bleibt 440 Hz (±1 %)', near(au.s150.len, 8 / 3, 1e-3) && near(au.s150.dur, 4 / 3, 0.03) && near(au.s150.hz, 440, 0.01), JSON.stringify(au.s150));
    check('Wie Tonband 150 %: Tonhöhe 660 Hz (1,5×, ±1 %)', near(au.t150.hz, 660, 0.01) && au.t150.varispeed, JSON.stringify(au.t150));
    check('Wie Tonband 150 %: Clip ⅔ so lang, Ton klingt ≈1,33 s', near(au.t150.len, 8 / 3, 1e-3) && near(au.t150.dur, 4 / 3, 0.02), JSON.stringify(au.t150));
    check('Wie Tonband 50 %: Tonhöhe 220 Hz (0,5×, ±1 %), Ton ≈4 s', near(au.t50.hz, 220, 0.01) && au.t50.len === 8 && near(au.t50.dur, 4, 0.02), JSON.stringify(au.t50));
    check('Wie Tonband 200 %: 880 Hz, halbe Länge', near(au.t200.hz, 880, 0.01) && au.t200.len === 2 && near(au.t200.dur, 1, 0.02), JSON.stringify(au.t200));

    // ---------- Erzeugte Loops: bei gleicher Tonhöhe neu gerendert statt gedehnt (Anschläge bleiben knackig) ----------
    const syn = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const base = await library.ensure('drums-four');
      const v = await library.ensureStretched('drums-four', 2);
      const sr = base.buffer.sampleRate;
      const spb = 60 / library.bpm;
      // Abklingzeit des ersten Kicks: bis die Hüllkurve (5-ms-RMS) unter 10 % ihres Maximums fällt, vor der ersten Hi-Hat
      const decay = (d, until) => {
        const w = Math.round(0.005 * sr); const env = [];
        for (let i = 0; i + w < until * sr; i += w) { let e = 0; for (let j = i; j < i + w; j++) e += d[j] * d[j]; env.push(Math.sqrt(e / w)); }
        const max = Math.max(...env); const top = env.indexOf(max);
        let k = top; while (k < env.length && env[k] > 0.1 * max) k++;
        return (k * w) / sr;
      };
      // Anschlag je Schlag: erstes Sample über 0,05 ab der erwarteten Stelle − 2 ms
      const onset = (d, t) => { const a = Math.max(0, Math.round((t - 0.002) * sr)); for (let i = a; i < a + 0.05 * sr; i++) if (Math.abs(d[i]) > 0.05) return i; return -1; };
      const b0 = base.buffer.getChannelData(0); const d = v.buffer.getChannelData(0);
      return {
        len: v.lengthBeats, frames: d.length, want: Math.round(base.lengthBeats * 2 * spb * sr),
        dBase: decay(b0, 0.45 * spb), dVar: decay(d, 0.45 * spb),
        // Abstand zum Anschlag im Original (gleiche Stelle im Takt): 0 = samplegenau
        onsets: [0, 1, 2, 3].map((b) => (onset(d, b * 2 * spb) - Math.round(b * 2 * spb * sr)) - (onset(b0, b * spb) - Math.round(b * spb * sr))),
      };
    });
    check('Erzeugter Loop 50 %: doppelte Länge, Anschläge auf den gedehnten Schlägen (±5 Frames)', syn.len === 8 && Math.abs(syn.frames - syn.want) <= 1 && syn.onsets.every((x) => Math.abs(x) <= 5),
      JSON.stringify(syn));
    check('Erzeugter Loop 50 %: Kick klingt so kurz wie im Original (neu gerendert, nicht gedehnt)', Math.abs(syn.dVar - syn.dBase) <= 0.006,
      `Abklingen Original ${(syn.dBase * 1000).toFixed(0)} ms, 50 % ${(syn.dVar * 1000).toFixed(0)} ms`);

    // ---------- Realtime-Scheduler = Offline (auch Einstieg mitten im Clip und Wiederholungen eines Loops) ----------
    const rt = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const M = await import('./src/model.js');
      const E = await import('./src/engine.js');
      const sr = 44100;
      // Loop: 1 Takt Sägezahn 330 Hz, wird im Clip wiederholt
      const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.4 * (((i * 330) / sr) % 1) - 0.2; }
      library.register({ id: 'spd-loop', name: 'Loop', category: 'fx', kind: 'loop', lengthBeats: 4, bpm: 120, buffer: b });
      const p = M.createEmptyProject();
      p.lengthBars = 4;
      p.tracks[0].clips.push({ id: 'a', sampleId: 'spd-loop', startBeat: 0, lengthBeats: 12, offsetBeats: 1, stretch: 0.8, varispeed: true, fadeInBeats: 1, fadeOutBeats: 1 });
      const s = new M.Store(JSON.parse(JSON.stringify(p)), { sampleBeats: (id) => library.get(id).lengthBeats });
      const eng = new E.Engine(s, library);
      const b0 = 2.3;
      // Vorlauf wie im Betrieb: Seit dem längeren Ton-Vorlauf steigt eine Stimme, die auf „jetzt“ geplant wird, mit Versatz ein
      const LEAD = Math.round(0.1 * sr);
      eng.ctx = new OfflineAudioContext(2, Math.round((12 - b0) * 22050) + LEAD, sr);
      eng.mix = E.buildMix(eng.ctx, s.project, { limiter: false });
      eng._scheduleActiveAt(b0, LEAD / sr, 12);
      eng._scheduleSpan(b0, 12, LEAD / sr, 12);
      const voices = [...eng.voices];
      const rates = voices.map((v) => v.src.playbackRate.value);
      const r = (await eng.ctx.startRendering()).getChannelData(0).subarray(LEAD);
      const o = (await renderProject(p, library, { limiter: false, fromBeat: b0, toBeat: 12 })).getChannelData(0);
      let diff = 0; let peak = 0;
      // ab Abtastwert 128: die Einstiegs-Überblendung (96 Werte) läuft mit Vorlauf ganz, beim Offline-Start ist sie an der Null abgeschnitten
      for (let i = 128; i < Math.min(r.length, o.length); i++) { diff = Math.max(diff, Math.abs(r[i] - o[i])); peak = Math.max(peak, Math.abs(o[i])); }
      // Schnittkanten der Wiederholungen: kein Klick (größter Schritt ≈ Sägezahn-Flanke 0,4 · Rate)
      eng.ticker?.stop();
      return { diff, peak, voices: voices.length, rates };
    });
    check('Realtime-Scheduler = Offline-Rendering (Einstieg mitten im Clip, Wiederholungen, Tonband 125 %)', rt.diff < 1e-4 && rt.peak > 0.1 && rt.voices >= 3,
      `max. Abweichung ${rt.diff.toExponential(1)}, Spitze ${rt.peak.toFixed(3)}, Stimmen ${rt.voices}`);
    check('Stimmen laufen mit playbackRate 1,25', rt.rates.length && rt.rates.every((x) => Math.abs(x - 1.25) < 1e-6), JSON.stringify(rt.rates));

    // ---------- Modell: Länge, Rückgängig, Signatur, alte Projekte, Tonart-Sounds ----------
    const md = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const M = await import('./src/model.js');
      const s = new M.Store(M.createEmptyProject(), { sampleBeats: (id) => library.get(id).lengthBeats });
      const id = s.addClip('t1', 'spd-tone', 0, 4);
      const u0 = s.undoStack.length;
      // Ein Ziehvorgang: viele Zwischenwerte, ein Schritt; Länge vom Stand zu Beginn gerechnet
      const from = { ...s.findClip(id).clip };
      for (const v of [0.95, 0.8, 0.6, 0.5, 0.75, 1.25]) s.setClipSpeed(id, v, { coalesce: 'drag-1', from });
      const after = { ...s.findClip(id).clip };
      const steps = s.undoStack.length - u0;
      s.undo();
      const undone = { ...s.findClip(id).clip };
      // Song-Ende kappt beim Ziehen nicht bleibend
      const e = s.addClip('t2', 'spd-tone', 124, 4);
      const fromE = { ...s.findClip(e).clip };
      s.setClipSpeed(e, 0.5, { coalesce: 'drag-2', from: fromE });
      const capped = s.findClip(e).clip.lengthBeats;
      s.setClipSpeed(e, 1, { coalesce: 'drag-2', from: fromE });
      const back = s.findClip(e).clip.lengthBeats;
      // Länge rastet: 48 Schläge bei 150 % = genau 32, getrennte Schritte zurück auf 100 % = wieder genau 48
      const g = s.addClip('t3', 'spd-tone', 0, 48);
      s.setClipSpeed(g, 1.5);
      const grid32 = s.findClip(g).clip.lengthBeats;
      s.setClipSpeed(g, 1.05);
      s.setClipSpeed(g, 1);
      const grid48 = s.findClip(g).clip.lengthBeats;
      // Tonband-Schalter: eigener Schritt, Länge bleibt
      s.setClipSpeed(id, 1.5);
      const len15 = s.findClip(id).clip.lengthBeats;
      s.setClipVarispeed(id, true);
      const tape = { ...s.findClip(id).clip };
      // Signatur: Tonband-Wechsel plant neu
      const c = s.findClip(id).clip;
      const sig = M.clipSignature('t1', c) !== M.clipSignature('t1', { ...c, varispeed: false });
      // Alte Projekte: stretch ohne varispeed bleibt beim Laden unverändert und klingt gedehnt
      const old = { ...M.createEmptyProject(), name: 'alt' };
      old.tracks[0].clips = [{ id: 'c1', sampleId: 'spd-tone', startBeat: 0, lengthBeats: 8, offsetBeats: 0, stretch: 2 }];
      const json = JSON.stringify(old);
      const s2 = new M.Store(JSON.parse(json), { sampleBeats: (x) => library.get(x).lengthBeats });
      const oldClip = s2.project.tracks[0].clips[0];
      return {
        steps, after, undone, capped, back, len15, tape, sig, grid32, grid48,
        oldSame: JSON.stringify(s2.project.tracks[0].clips) === JSON.stringify(JSON.parse(json).tracks[0].clips) && M.isValidProject(s2.project),
        oldSpeed: M.clipSpeed(oldClip), oldRate: M.tapeRate(library, oldClip),
        version: s2.project.version === M.PROJECT_VERSION && M.PROJECT_VERSION === 1,
        // Tonart-Sounds (Akkord-Pad) laufen nie wie Tonband – sonst wären sie verstimmt
        padCan: M.canVarispeed(library, 'chords-pad'), padRate: M.tapeRate(library, { sampleId: 'chords-pad', stretch: 0.5, varispeed: true }),
        drumCan: M.canVarispeed(library, 'drums-four'),
      };
    });
    check('Ein Ziehvorgang = ein Rückgängig-Schritt', md.steps === 1, `${md.steps} Schritte`);
    check('Nach dem Ziehen auf 125 %: Länge 3,2 Schläge, Rückgängig stellt 4 Schläge her', Math.abs(md.after.lengthBeats - 3.2) < 1e-3 && md.undone.lengthBeats === 4 && md.undone.stretch == null,
      JSON.stringify({ after: md.after, undone: md.undone }));
    check('Am Song-Ende: gekappt, beim Zurückziehen wieder volle Länge', md.capped === 4 && md.back === 4, JSON.stringify({ capped: md.capped, back: md.back }));
    check('Länge rastet auf dem Raster: 48 → 150 % = 32 Schläge, zurück auf 100 % = 48', md.grid32 === 32 && md.grid48 === 48, JSON.stringify({ grid32: md.grid32, grid48: md.grid48 }));
    check('Tonband-Schalter ändert die Länge nicht', md.tape.varispeed === true && md.tape.lengthBeats === md.len15 && Math.abs(md.len15 - 8 / 3) < 1e-3, JSON.stringify(md.tape));
    check('Signatur enthält „wie Tonband“ (Live-Resync)', md.sig);
    check('Alte Projekte mit Laufzeit laden unverändert (×2 = 50 %, gleiche Tonhöhe, Version 1)', md.oldSame && md.oldSpeed === 0.5 && md.oldRate === 1 && md.version, JSON.stringify(md));
    check('Tonart-Sounds nur gedehnt (kein Tonband), Drums dürfen', md.padCan === false && md.padRate === 1 && md.drumCan === true, JSON.stringify({ padCan: md.padCan, padRate: md.padRate, drumCan: md.drumCan }));

    // ---------- Live: Geschwindigkeit während der Wiedergabe ändern ----------
    const lv = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      store.setBpm(120);
      const t = store.project.tracks[7].id;
      const id = store.addClip(t, 'spd-loop', 0, 64);
      const other = store.project.tracks.flatMap((x) => x.clips).find((c) => c.id !== id && c.startBeat < 2 && c.startBeat + c.lengthBeats > 6)?.id;
      engine.seek?.(2);
      engine.play();
      await wait(600);
      const kills = [];
      const orig = engine._kill.bind(engine);
      engine._kill = (v, when) => { kills.push(v.clipId); return orig(v, when); };
      const before = [...engine.voices].filter((v) => v.clipId === id).map((v) => v.src.playbackRate.value);
      store.setClipSpeed(id, 1.5, { varispeed: true });
      await wait(400);
      const after = [...engine.voices].filter((v) => v.clipId === id).map((v) => v.src.playbackRate.value);
      const playing = engine.playing;
      engine._kill = orig;
      engine.stop();
      return { before, after, playing, kills, other, killedOther: other ? kills.includes(other) : false, len: store.findClip(id).clip.lengthBeats };
    });
    check('Live: Wiedergabe läuft weiter, Stimme des Clips neu mit Rate 1,5', lv.playing && lv.before.includes(1) && lv.after.length > 0 && lv.after.every((r) => Math.abs(r - 1.5) < 1e-3), JSON.stringify(lv));
    check('Live: nur der geänderte Clip wird neu eingeplant', !lv.killedOther && lv.kills.length > 0, JSON.stringify(lv.kills));

    // ---------- Inspektor (Desktop) ----------
    await page.evaluate(() => { const { store, ui } = window.loopwerk; store.undo(); ui.select('c4'); });
    await page.waitForTimeout(150);
    const ins = await page.evaluate(() => ({
      box: !!document.querySelector('#insp .insp-clip-speed #insp-speed'),
      oldRow: !!document.getElementById('insp-run-out'),
      out: document.getElementById('insp-speed-out').textContent,
      val: document.getElementById('insp-speed').value,
      tapeDisabled: document.getElementById('insp-speed-tape').disabled,
      label: document.querySelector('.insp-speed > span').textContent,
    }));
    check('Inspektor: Zeile „Geschwindigkeit“ im Container .insp-clip-speed, Laufzeit-Zeile weg', ins.box && !ins.oldRow && ins.label === 'Geschwindigkeit', JSON.stringify(ins));
    check('Inspektor: 100 %, Akkord-Pad folgt der Tonart → Tonband gesperrt', ins.out === '100 %' && ins.val === '100' && ins.tapeDisabled, JSON.stringify(ins));
    // Drums-Clip: Regler ziehen (Maus), ein Rückgängig-Schritt, Länge passt sich an
    await page.evaluate(() => window.loopwerk.ui.select('c1'));
    await page.waitForTimeout(100);
    const c1 = await page.evaluate(() => ({ ...window.loopwerk.store.findClip('c1').clip }));
    const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    const rb = await page.locator('#insp-speed').boundingBox();
    // 50…200 % linear: 100 % liegt bei ⅓, 150 % bei ⅔
    const xAt = (pct) => rb.x + 8 + ((rb.width - 16) * (pct - 50)) / 150;
    await page.mouse.move(xAt(100), rb.y + rb.height / 2);
    await page.mouse.down();
    for (const pct of [110, 130, 160, 180, 150]) await page.mouse.move(xAt(pct), rb.y + rb.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const dr = await page.evaluate(() => ({ clip: { ...window.loopwerk.store.findClip('c1').clip }, steps: window.loopwerk.store.undoStack.length, out: document.getElementById('insp-speed-out').textContent }));
    const sp = Math.round(100 / (dr.clip.stretch || 1));
    check('Inspektor: Ziehen am Regler stellt ≈150 % ein, Clip wird kürzer', sp >= 140 && sp <= 160 && Math.abs(dr.clip.lengthBeats - c1.lengthBeats / (sp / 100)) < 0.01 && dr.out.startsWith(`${sp} %`),
      JSON.stringify({ sp, len0: c1.lengthBeats, dr }));
    check('Inspektor: ein Rückgängig-Schritt je Ziehvorgang', dr.steps - u0 === 1, `${dr.steps - u0} Schritte`);
    check('Inspektor: ohne Tonband steht „gleiche Tonhöhe“', /gleiche Tonhöhe/.test(dr.out), dr.out);
    await page.click('#insp-speed-tape');
    const tp = await page.evaluate(() => ({ v: window.loopwerk.store.findClip('c1').clip.varispeed, pressed: document.getElementById('insp-speed-tape').getAttribute('aria-pressed'), out: document.getElementById('insp-speed-out').textContent }));
    check('Inspektor: „wie Tonband“ schaltet um und zeigt die Halbtöne', tp.v === true && tp.pressed === 'true' && /\+\d/.test(tp.out) && /Halbtöne/.test(tp.out), JSON.stringify(tp));
    // Tastatur: Pfeil nach links = −5 %
    await page.focus('#insp-speed');
    const k0 = await page.evaluate(() => Number(document.getElementById('insp-speed').value));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const k1 = await page.evaluate(() => Math.round(100 / (window.loopwerk.store.findClip('c1').clip.stretch || 1)));
    check('Tastatur: Pfeiltasten in 5-%-Schritten', k1 === k0 - 10, `${k0} → ${k1}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'clip-speed-desktop.png') });
    // Doppelklick = 100 %
    await page.dblclick('#insp-speed');
    const dbl = await page.evaluate(() => ({ s: window.loopwerk.store.findClip('c1').clip.stretch ?? 1, len: window.loopwerk.store.findClip('c1').clip.lengthBeats }));
    check('Doppelklick stellt 100 % und die Originallänge her', dbl.s === 1 && Math.abs(dbl.len - c1.lengthBeats) < 1e-6, JSON.stringify({ dbl, len0: c1.lengthBeats }));
    // Chips ½× / 2×
    await page.click('.insp-speed [data-speed="0.5"]');
    const half = await page.evaluate(() => window.loopwerk.store.findClip('c1').clip);
    check('Schnellwahl ½×: halbe Geschwindigkeit, doppelte Länge', half.stretch === 2 && Math.abs(half.lengthBeats - Math.min(c1.lengthBeats * 2, 128 - c1.startBeat)) < 1e-6, JSON.stringify(half));
    await page.click('.insp-speed [data-speed="1"]');
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Clip-Leiste, Bereich „Pegel“ ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.evaluate(async () => {
      const { library, store, ui } = window.loopwerk;
      const sr = 44100;
      const orig = new AudioBuffer({ numberOfChannels: 1, length: 2 * sr, sampleRate: sr });
      orig.getChannelData(0)[0] = 0.9;
      await library.add({ id: 'own-speed', name: 'Aufnahme', category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', orig, duration: 2 });
      store.setBpm(120);
      ui.select(store.addClip(store.project.tracks[0].id, 'own-speed', 0, 4));
    });
    await page.waitForTimeout(300);
    await page.tap('#cb-levels');
    await page.waitForTimeout(200);
    const ph = await page.evaluate(() => {
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), vis: b.width > 0 && b.height > 0 }; };
      return { label: document.querySelector('#lvl-speed-row .lvl-speed > span')?.textContent, range: r('lvl-speed'), tape: r('lvl-speed-tape'), out: document.getElementById('lvl-speed-out').textContent, old: !!document.getElementById('lvl-run-out'), tempoRow: !document.getElementById('lvl-tempo-row').hidden };
    });
    check('Handy: Zeile „Geschwindigkeit“ mit Regler und Tonband-Schalter, alte Laufzeit-Zeile weg', ph.label === 'Geschwindigkeit' && ph.range.vis && ph.tape.vis && !ph.old && ph.out === '100 %' && ph.tempoRow, JSON.stringify(ph));
    const tt = await page.evaluate(`(${measureTargets.toString()})('#lvl-speed-row input, #lvl-speed-row button')`);
    check('Handy: Tippflächen Regler und Schalter ≥ 44 px', tt.length === 2 && tt.every((t) => t.h >= 44 && t.w >= 44), JSON.stringify(tt));
    const pu0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    for (const v of ['120', '140', '160']) await page.locator('#lvl-speed').fill(v);
    const pc = await page.evaluate(() => ({ clip: { ...window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip }, steps: window.loopwerk.store.undoStack.length, out: document.getElementById('lvl-speed-out').textContent }));
    check('Handy: Regler 160 % kürzt den Clip auf 2,5 Schläge, ein Rückgängig-Schritt', Math.abs(pc.clip.lengthBeats - 2.5) < 1e-3 && pc.steps - pu0 === 1 && pc.out === '160 %', JSON.stringify({ pc, pu0 }));
    await page.tap('#lvl-speed-tape');
    const pt = await page.evaluate(() => ({ v: window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.varispeed, pressed: document.getElementById('lvl-speed-tape').getAttribute('aria-pressed') }));
    check('Handy: Tonband-Schalter antippen schaltet um', pt.v === true && pt.pressed === 'true', JSON.stringify(pt));
    await page.waitForTimeout(150);
    const tag = await page.evaluate(() => [...document.querySelectorAll(`.clip[data-clip-id="${window.loopwerk.ui.selectedClipId}"] .clip-tag`)].map((n) => n.textContent));
    const tapeOk = await page.evaluate(async () => { const { canVarispeed } = await import('./src/model.js'); const { store, ui, library } = window.loopwerk; return canVarispeed(library, store.findClip(ui.selectedClipId).clip.sampleId); });
    check('Etikett am Clip zeigt die Geschwindigkeit (160 %, bei Tonband mit Zusatz)', tag.includes(tapeOk ? '160 % · Band' : '160 %'), JSON.stringify({ tag, tapeOk }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'clip-speed-handy.png') });
    // Doppeltipp auf den Regler = 100 %
    const rr = await page.locator('#lvl-speed').boundingBox();
    const tx = rr.x + rr.width / 3 + 0.5;
    const ty = rr.y + rr.height / 2;
    await page.touchscreen.tap(tx, ty);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(tx, ty);
    await page.waitForTimeout(150);
    const dt = await page.evaluate(() => ({ s: window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.stretch ?? 1, out: document.getElementById('lvl-speed-out').textContent }));
    check('Handy: Doppeltipp stellt 100 % her', dt.s === 1 && dt.out === '100 %', JSON.stringify(dt));
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || String(err));
  } finally {
    await app.close();
    finish();
  }
})();
