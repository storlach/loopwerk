// Song-Starter und Akkord-Streifen (2.9): Modell, Undo, Projektdatei, Starter je Genre, Klang (Grundton der Begleitung je
// Takt, offline gemessen), Realtime mit Live-Änderung, Oberfläche Desktop/Tablet/Handy.
// node tests/starter-chords.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, createChecker, clickR } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const near = (f, want, tol = 0.02) => Math.abs(f / want - 1) < tol;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Im Browser: Grundfrequenz über Autokorrelation (erstes Maximum über 90 % des größten)
function pitchFn() {
  window.__pitch = (d, a, sr = 44100, n = 8192, maxLag = 1200) => {
    const x = d.subarray(a, a + n + maxLag);
    const r = [];
    for (let L = 0; L < maxLag; L++) { let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i + L]; r.push(s); }
    let max = 0; for (let L = 30; L < maxLag; L++) max = Math.max(max, r[L]);
    for (let L = 31; L < maxLag - 1; L++) if (r[L] > 0.9 * max && r[L] >= r[L - 1] && r[L] >= r[L + 1]) {
      const y0 = r[L - 1]; const y1 = r[L]; const y2 = r[L + 1];
      return sr / (L + (y0 - y2) / (2 * (y0 - 2 * y1 + y2)));
    }
    return 0;
  };
  window.__rms = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
}

(async () => {
  let app = await openApp();
  let { page } = app;
  try {
    await page.evaluate(pitchFn);

    // ---------- Modell ----------
    const m = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const H = await import('./src/harmony.js');
      const p = M.createEmptyProject();
      p.chords = [{ beat: 8, chord: 'VI' }, { beat: 4, chord: 'X' }, { beat: 0, chord: 'i' }, { beat: 8, chord: 'III' }, { beat: 14, chord: '-' }, { beat: -2, chord: 'iv' }];
      p.keyChanges = [{ bar: 4, key: 'Dm' }];
      const old = M.createEmptyProject();
      return {
        list: M.chordsOf(p),
        at: [0, 7.99, 8, 13.99, 14, 99].map((b) => M.chordAtBeat(p, b)),
        spans: M.harmonySpans(p, 4, 20).map((s) => [s.from, s.to, s.key, s.chord]),
        oldValid: M.isValidProject(old), oldChord: M.chordAtBeat(old, 40),
        badValid: M.isValidProject({ ...old, chords: 'Am F' }),
        names: H.DEGREE_IDS.map((d) => H.chordName(d, 9)).join(' '),
        namesC: ['i', 'III', 'VI', 'VII'].map((d) => H.chordName(d, 0)).join(' '),
        // Vorlage auf i (A3, C4, E4) → F-Dur, C-Dur, E-Dur: Akkordtöne in naher Lage
        voiced: ['VI', 'III', 'V', 'VII'].map((d) => [57, 60, 64].map((x) => H.voiceNote(x, 9, d))),
        sym: ['Am', 'F', 'C', 'G', 'E', 'Em', 'C#m', 'Bb', 'H°'].map((s) => H.degreeOfSymbol(s, 9)),
        harm: ['Pad Am–F–C–G', 'Lo-Fi-Bass Fmaj7–Em7–Dm7–Am7', 'Pulse Bass A', 'Hypno-Sequenz'].map((n) => H.loopHarmony(n)),
      };
    });
    check('chordsOf: sortiert, ohne Ungültige und Doppelte (letzter gewinnt)', JSON.stringify(m.list) === '[{"beat":0,"chord":"i"},{"beat":8,"chord":"III"},{"beat":14,"chord":"-"}]', JSON.stringify(m.list));
    check('chordAtBeat: gilt bis zum nächsten Eintrag', m.at.join() === 'i,i,III,III,-,-', m.at.join());
    check('harmonySpans teilt an Tonart- und Akkordwechseln', JSON.stringify(m.spans) === '[[4,8,"Am","i"],[8,12,"Am","III"],[12,14,"Dm","III"],[14,20,"Dm","-"]]', JSON.stringify(m.spans));
    check('Alte Projekte ohne Streifen: gültig, überall Stufe i', m.oldValid && m.oldChord === 'i' && !m.badValid);
    check('Akkordnamen in Am und Cm', m.names === 'Am C Dm Em F G E H°' && m.namesC === 'Cm E♭ A♭ B♭', `${m.names} / ${m.namesC}`);
    check('Vorlage auf i wird zum Akkord der Stufe (nahe Lage)', JSON.stringify(m.voiced) === '[[53,57,60],[60,64,67],[52,56,59],[55,59,62]]', JSON.stringify(m.voiced));
    check('Akkordsymbole → Stufen (nicht leitereigen = null)', m.sym.join() === 'i,VI,III,VII,V,v,,,ii°', m.sym.join());
    check('Akkordfolge aus Loop-Namen', JSON.stringify(m.harm) === '[["i","VI","III","VII"],["VI","v","iv","i"],["i"],null]', JSON.stringify(m.harm));

    const s = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store } = window.loopwerk;
      store.replace(M.createEmptyProject());
      const ch = () => JSON.stringify(store.project.chords ?? []);
      const out = {};
      const u0 = store.undoStack.length;
      store.setChordAt(8, 'VI'); // Takt 3
      out.a = ch();
      store.setChordAt(10, 'VII', 2); // 2. Hälfte von Takt 3
      out.b = ch();
      out.steps = store.undoStack.length - u0;
      store.setChordAt(8, 'i'); // ganzer Takt wieder i
      out.c = ch();
      store.undo();
      out.undo = ch();
      store.redo();
      store.fillChords(0, ['i', 'VI', 'III', 'VII'], { toBeat: 32 });
      out.fill = ch();
      out.fillSteps = store.undoStack.length - u0;
      store.setChordAt(4, '-');
      out.rest = ch();
      store.clearChords();
      out.cleared = 'chords' in store.project;
      store.undo();
      store.setKey('Cm');
      out.keyKeeps = ch() === out.rest;
      return out;
    });
    check('setChordAt: nur dieser Takt, danach wie vorher', s.a === '[{"beat":8,"chord":"VI"},{"beat":12,"chord":"i"}]', s.a);
    check('Halber Takt: 2. Hälfte, je ein Rückgängig-Schritt', s.b === '[{"beat":8,"chord":"VI"},{"beat":10,"chord":"VII"},{"beat":12,"chord":"i"}]' && s.steps === 2, `${s.b} Schritte ${s.steps}`);
    check('Gleicher Akkord wie ringsum fällt weg', s.c === '[]', s.c);
    check('Rückgängig', s.undo === s.b, s.undo);
    check('Folge füllen: ein Schritt, je Takt ein Akkord', s.fill === '[{"beat":4,"chord":"VI"},{"beat":8,"chord":"III"},{"beat":12,"chord":"VII"},{"beat":16,"chord":"i"},{"beat":20,"chord":"VI"},{"beat":24,"chord":"III"},{"beat":28,"chord":"VII"},{"beat":32,"chord":"i"}]' && s.fillSteps === 4, `${s.fill} (${s.fillSteps})`);
    check('Pause und Leeren; Stufen bleiben beim Tonartwechsel', s.rest.includes('{"beat":4,"chord":"-"}') && !s.cleared && s.keyKeeps, s.rest);

    // ---------- Projektdatei ----------
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-akkorde.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('Speichern: Akkord-Streifen in der Datei', Array.isArray(json.chords) && json.chords.some((c) => c.chord === '-'), JSON.stringify(json.chords));
    json.name = 'Mit Akkorden';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createEmptyProject()); });
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Mit Akkorden', null, { timeout: 5000 });
    check('Öffnen: Streifen wieder da', await page.evaluate((c) => JSON.stringify(window.loopwerk.store.project.chords) === c, JSON.stringify(json.chords)));
    delete json.chords;
    json.name = 'Alt ohne';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Alt ohne', null, { timeout: 5000 });
    check('Alte Datei ohne Streifen lädt', await page.evaluate(() => !('chords' in window.loopwerk.store.project)));

    // ---------- Klang: Grundton der Begleitung je Takt (offline) ----------
    const k = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, library, renderProject, patterns, tempo } = window.loopwerk;
      store.replace(M.createEmptyProject());
      await tempo.apply();
      const sr = 44100;
      const at = (beat) => Math.round(beat * 0.5 * sr);
      // Testvorlage: A3 auf jedem Schlag (Bass-Klang), folgt den Akkorden
      const notes = Array.from({ length: 4 }, (_, i) => ({ pitch: 57, start: i, len: 0.95, vel: 1 }));
      const pid = store.addPattern({ type: 'synth', name: 'Folgt', bars: 1, preset: 'bass', notes, follow: true });
      const pid2 = store.addPattern({ type: 'synth', name: 'Folgt nicht', bars: 1, preset: 'bass', notes });
      await patterns.sync(store.project);
      store.setLength(8);
      store.addClip('t1', 'pat-' + pid, 0, 32);
      store.addClip('t2', 'pat-' + pid2, 0, 32);
      store.setTrack('t2', { mute: true });
      store.fillChords(0, ['i', 'VI', 'III', 'VII']);
      store.setChordAt(20, 'iv', 2); // Takt 6, 1. Hälfte: Dm (halber Takt mitten im Sample)
      store.setChordAt(24, '-'); // Takt 7: Pause
      const d = (await renderProject(store.project, library, { limiter: false })).getChannelData(0);
      const f = [0, 1, 2, 3].map((bar) => window.__pitch(d, at(bar * 4 + 0.15)));
      const half = [window.__pitch(d, at(20.1), sr, 4096, 1200), window.__pitch(d, at(22.1), sr, 4096, 1200)];
      const rest = window.__rms(d, at(24) + 600, at(28));
      const play = window.__rms(d, at(28) + 600, at(32));
      // Gegenprobe: dasselbe Pattern ohne „folgt Akkorden“ bleibt in jedem Takt auf A
      store.setTrack('t1', { mute: true });
      store.setTrack('t2', { mute: false });
      const d2 = (await renderProject(store.project, library, { limiter: false })).getChannelData(0);
      const plain = [1, 2].map((bar) => window.__pitch(d2, at(bar * 4 + 0.15)));
      // Tonartwechsel ab Takt 3 nach Dm: Stufe III klingt dort als F (Dm-Tonart), nicht als C
      store.setTrack('t1', { mute: false });
      store.setTrack('t2', { mute: true });
      store.setKeyAt(3, 'Dm');
      const d3 = (await renderProject(store.project, library, { limiter: false })).getChannelData(0);
      const inDm = window.__pitch(d3, at(8.15));
      // Klick an der Akkordgrenze? Größter Sprung um Takt 2 im Vergleich zum Dauerton
      let jump = 0; const b = at(4); for (let i = b - 2000; i < b + 2000; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]));
      let steady = 0; for (let i = at(1); i < at(1) + 4000; i++) steady = Math.max(steady, Math.abs(d[i] - d[i - 1]));
      return { f, half, rest, play, plain, inDm, jump, steady, follows: library.followsChords('pat-' + pid), notFollows: library.followsChords('pat-' + pid2) };
    });
    check('Begleit-Pattern folgt den Akkorden, ohne „follow“ nicht', k.follows && !k.notFollows);
    check('Grundton je Takt: Am, F, C, G (A3 → F3, C4, G3)', near(k.f[0], hz(57)) && near(k.f[1], hz(53)) && near(k.f[2], hz(60)) && near(k.f[3], hz(55)), k.f.map((x) => x.toFixed(1)).join(' / ') + ` Hz (erwartet ${[57, 53, 60, 55].map((x) => hz(x).toFixed(1)).join(' / ')})`);
    check('Halber Takt: Dm, dann wieder F', near(k.half[0], hz(62)) && near(k.half[1], hz(53)), k.half.map((x) => x.toFixed(1)).join(' / ') + ` Hz (erwartet D4 ${hz(62).toFixed(1)}, F3 ${hz(53).toFixed(1)})`);
    check('Pause: Begleitung schweigt', k.rest < 1e-3 && k.play > 0.02, `RMS Pause ${k.rest.toExponential(1)}, danach ${k.play.toFixed(3)}`);
    check('Gegenprobe: ohne „folgt Akkorden“ bleibt A', near(k.plain[0], hz(57)) && near(k.plain[1], hz(57)), k.plain.map((x) => x.toFixed(1)).join(' / '));
    check('Tonart je Takt + Akkord: III in Dm = F', near(k.inDm, hz(65), 0.02) || near(k.inDm, hz(53), 0.02), `${k.inDm.toFixed(1)} Hz`);
    check('Akkordwechsel ohne Klick', k.jump < 0.05 || k.jump < k.steady * 1.5, `Sprung ${k.jump.toFixed(4)}, Dauerton ${k.steady.toFixed(4)}`);

    // Begleit-Bass (Generator) folgt dem Grundton
    const gb = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const H = await import('./src/harmony.js');
      const { store, library, renderProject, patterns } = window.loopwerk;
      store.replace(M.createEmptyProject());
      const pid = store.addPattern(H.accompPattern('sub', 9));
      await patterns.sync(store.project);
      store.setLength(4);
      store.addClip('t1', 'pat-' + pid, 0, 16);
      store.fillChords(0, ['i', 'VI', 'III', 'VII']);
      const d = (await renderProject(store.project, library, { limiter: false })).getChannelData(0);
      return [0, 1, 2, 3].map((bar) => window.__pitch(d, Math.round((bar * 4 + 0.3) * 0.5 * 44100), 44100, 12000, 1400));
    });
    check('Generator „Bass“: Grundton A2, F2, C3, G2', near(gb[0], hz(45), 0.03) && near(gb[1], hz(41), 0.03) && near(gb[2], hz(48), 0.03) && near(gb[3], hz(43), 0.03), gb.map((x) => x.toFixed(1)).join(' / ') + ` Hz (erwartet ${[45, 41, 48, 43].map((x) => hz(x).toFixed(1)).join(' / ')})`);

    // ---------- Realtime: gleiche Stücke wie offline, Live-Änderung ohne Stopp ----------
    const rt = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const E = await import('./src/engine.js');
      const { store, library, engine, patterns } = window.loopwerk;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      store.replace(M.createEmptyProject());
      const notes = Array.from({ length: 4 }, (_, i) => ({ pitch: 57, start: i, len: 0.95, vel: 1 }));
      const pid = store.addPattern({ type: 'synth', name: 'Folgt', bars: 1, preset: 'bass', notes, follow: true });
      await patterns.sync(store.project);
      const id = 'pat-' + pid;
      const cid = store.addClip('t1', id, 0, 64);
      store.fillChords(0, ['i', 'VI', 'III', 'VII']);
      await library.ensureProject(store.project);
      const clip = store.findClip(cid).clip;
      const same = JSON.stringify(engine._pieces(clip).map((p) => [p.from, p.to, p.sample.id]))
        === JSON.stringify(E.clipPieces(store.project, library, clip, M.audibleMap(store.project).get(cid)).map((p) => [p.from, p.to, p.sample.id]));
      const buf = (chord) => (chord === 'i' ? library.get(id).buffer : library.variant(id, { chord }).buffer);
      const playing = () => [...engine.voices].filter((v) => v.clipId === cid).map((v) => v.src.buffer);
      await engine.play(4.5); // Takt 2: VI
      await wait(400);
      const inVI = playing().some((b) => b === buf('VI'));
      store.setChordAt(4, 'iv'); // laufender Takt live auf Dm
      await wait(250);
      const inIv = playing().some((b) => b === buf('iv'));
      const state = { playing: engine.playing, beat: engine.currentBeat() };
      store.undo();
      await wait(250);
      const back = playing().some((b) => b === buf('VI'));
      engine.stop();
      return { same, inVI, inIv, back, ...state, ready: library.keyNeeds(store.project).length };
    });
    check('Realtime und Offline: dieselben Stücke und Fassungen (clipPieces)', rt.same);
    check('Realtime: Takt 2 spielt die F-Fassung', rt.inVI);
    check('Live-Änderung am Streifen greift ohne Stopp', rt.inIv && rt.playing && rt.beat > 4.5, `spielt ${rt.playing}, Schlag ${rt.beat.toFixed(2)}`);
    check('Rückgängig live: zurück auf F', rt.back);

    // ---------- Song-Starter je Genre ----------
    const genres = await page.evaluate(async () => (await import('./src/starter.js')).STARTER_GENRES.map((g) => g.id));
    const st = [];
    for (const g of genres) {
      st.push(await page.evaluate(async (genre) => {
        const M = await import('./src/model.js');
        const S = await import('./src/starter.js');
        const { store, library } = window.loopwerk;
        store.replace(M.createDemoProject());
        const before = JSON.stringify(store.project);
        const u0 = store.undoStack.length;
        const r = await S.runStarter(genre, { store, library });
        const p = store.project;
        const total = p.lengthBars * p.beatsPerBar;
        const names = p.tracks.map((t) => t.name);
        const byName = (n) => p.tracks.find((t) => t.name === n);
        const g = S.starterGenre(genre);
        const chorus = r.sections.find((x) => x.id === 'C');
        const fxClips = byName('FX')?.clips ?? [];
        const startsAt = (bar) => fxClips.some((c) => Math.abs(c.startBeat - (bar - 1) * 4) < 1e-6);
        const endsAt = (bar) => fxClips.some((c) => Math.abs(c.startBeat + library.get(c.sampleId).lengthBeats - (bar - 1) * 4) < 1e-6 || Math.abs(c.startBeat + c.lengthBeats - (bar - 1) * 4) < 1e-6);
        const res = {
          genre, skipped: r.skipped.length, bpm: p.bpm, range: g.range, key: p.key ?? 'Am', bars: p.lengthBars,
          names, roles: ['Drums', 'Bass', 'Akkorde', 'Melodie', 'FX'].every((n) => byName(n)?.clips.length),
          inside: p.tracks.every((t) => t.clips.every((c) => c.startBeat >= 0 && c.startBeat + c.lengthBeats <= total + 1e-6)),
          vols: Object.fromEntries(p.tracks.map((t) => [t.name, t.volume])),
          chords: M.chordsOf(p).length, prog: r.progression.join('-'),
          crash: startsAt(chorus.from), riser: endsAt(chorus.from),
          steps: store.undoStack.length - u0,
          sections: r.sections.map((x) => x.label).join(' → '),
          tonal: p.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)).filter((id) => library.followsKey(id) && !library.followsChords(id)),
          follow: p.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)).filter((id) => library.followsChords(id)).length,
        };
        store.undo();
        res.undone = JSON.stringify(store.project) === before;
        const v1 = S.planStarter(genre, library, { variant: 1, project: M.createEmptyProject() });
        const v0 = S.planStarter(genre, library, { variant: 0, project: M.createEmptyProject() });
        res.differs = JSON.stringify(v1.actions) !== JSON.stringify(v0.actions);
        return res;
      }, g));
    }
    for (const r of st) {
      const ok = !r.skipped && r.roles && r.inside && r.bars >= 32 && r.bars <= 64 && r.bpm >= r.range[0] && r.bpm <= r.range[1] && (r.chords > 0 || r.prog === 'i')
        && r.crash && r.riser && r.steps === 1 && r.undone && r.differs && r.vols.Drums > r.vols.Melodie;
      check(`Starter ${r.genre}: Gerüst, ${r.bars} Takte, ${r.bpm} BPM, ${r.key}, ein Schritt`, ok, `${r.sections}; Spuren ${r.names.join(', ')}; Folge ${r.prog}; Crash ${r.crash} Riser ${r.riser}; Schritte ${r.steps}; übersprungen ${r.skipped}; Begleit-Patterns ${r.follow}`);
    }
    // Hörbar: Refrain eines Starters gerendert (Tempo und Tonart vorbereitet)
    const loud = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const S = await import('./src/starter.js');
      const { store, library, renderProject, tempo, patterns } = window.loopwerk;
      const out = [];
      for (const [genre, variant] of [['house', 0], ['rock', 0], ['lofi', 2]]) {
        store.replace(M.createEmptyProject());
        const r = await S.runStarter(genre, { store, library, variant });
        await tempo.apply();
        await patterns.sync(store.project);
        await library.ensureProject(store.project);
        const c = r.sections.find((x) => x.id === 'C');
        const buf = await renderProject(store.project, library, { fromBeat: (c.from - 1) * 4, toBeat: c.from * 4 + 12 });
        const d = buf.getChannelData(0);
        let peak = 0; let nan = false;
        for (const x of d) { if (Number.isNaN(x)) nan = true; peak = Math.max(peak, Math.abs(x)); }
        out.push({ genre, variant, rms: window.__rms(d, 0, d.length), peak, nan, key: store.project.key ?? 'Am', bpm: store.project.bpm });
      }
      return out;
    });
    for (const l of loud) check(`Starter ${l.genre} (Fassung ${l.variant}) klingt im Refrain`, l.rms > 0.03 && l.peak < 1.01 && !l.nan, `RMS ${l.rms.toFixed(3)}, Spitze ${l.peak.toFixed(2)}, ${l.bpm} BPM ${l.key}`);

    // ---------- Oberfläche (Desktop) ----------
    await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, arranger, engine } = window.loopwerk;
      store.replace(M.createDemoProject());
      store.fillChords(0, ['i', 'VI', 'III', 'VII'], { toBeat: 16 });
      engine.setPosition(0);
      document.getElementById('arr-scroll').scrollLeft = 0;
      arranger.render();
    });
    const row = await page.evaluate(() => {
      const strip = document.querySelector('.chord-strip');
      const key = document.querySelector('.key-strip').getBoundingClientRect();
      const r = strip.getBoundingClientRect();
      const secs = [...strip.querySelectorAll('.chord-sec')].slice(0, 5).map((n) => n.textContent);
      return { below: Math.abs(r.top - key.bottom) < 1.5, h: r.height, secs, ppb: window.loopwerk.ui.pxPerBeat };
    });
    check('Akkord-Streifen direkt unter der Tonart-Zeile, schmal', row.below && row.h <= 24, `Höhe ${row.h}`);
    check('Streifen zeigt Am F C G, danach Am', row.secs.join(' ') === 'Am F C G Am', row.secs.join(' '));
    const box = await page.locator('.chord-strip').boundingBox();
    const barX = (bar, frac = 0.25) => box.x + (bar - 1 + frac) * 4 * row.ppb;
    await page.mouse.click(barX(6), box.y + box.height / 2);
    const pop = await page.evaluate(() => {
      const p = document.querySelector('.chord-pop');
      return { open: !p.hidden, head: p.querySelector('.key-pop-head')?.textContent, keys: [...p.querySelectorAll('.chord-pop-key')].map((b) => b.textContent), progs: p.querySelectorAll('.chord-pop-progbtn').length };
    });
    check('Klick auf Takt 6 öffnet die Akkorde der Tonart und Folgen', pop.open && /Takt 6/.test(pop.head) && pop.keys.length === 9 && pop.keys[0] === 'Ami' && pop.progs === 6, JSON.stringify(pop));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'chords-desktop-pop.png') });
    const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.click('.chord-pop-key[data-chord="iv"]');
    const after = await page.evaluate(() => ({ ch: JSON.stringify(window.loopwerk.store.project.chords), open: !document.querySelector('.chord-pop').hidden, secs: [...document.querySelectorAll('.chord-sec')].slice(4, 7).map((n) => n.textContent).join(' '), steps: window.loopwerk.store.undoStack.length }));
    check('Zweiter Klick setzt Dm für Takt 6 (ein Schritt)', after.ch.includes('{"beat":20,"chord":"iv"}') && after.ch.includes('{"beat":24,"chord":"i"}') && !after.open && after.steps === u0 + 1 && after.secs.startsWith('Am Dm'), JSON.stringify(after));
    await page.mouse.click(barX(7), box.y + box.height / 2);
    await page.click('.chord-pop-progbtn[data-prog="hiphop"]');
    const prog = await page.evaluate(async () => { const M = await import('./src/model.js'); const p = window.loopwerk.store.project; return [24, 28, 32, 36, 124].map((b) => M.chordAtBeat(p, b)).join(' '); });
    check('Folge „ab hier“ füllt bis zum Ende', prog === 'i iv v i iv', prog);
    await page.keyboard.press('Control+z');
    // Tastatur
    await page.evaluate(() => window.loopwerk.engine.setPosition(9));
    await page.focus('.chord-strip');
    await page.keyboard.press('Enter');
    const kb = await page.evaluate(() => ({ head: document.querySelector('.chord-pop .key-pop-head')?.textContent, focus: document.activeElement?.className }));
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => document.querySelector('.chord-pop').hidden && document.activeElement?.classList.contains('chord-strip'));
    check('Tastatur: Enter öffnet für Takt 3, Escape schließt', /Takt 3/.test(kb.head) && /chord-pop-key/.test(kb.focus) && closed, JSON.stringify(kb));
    const shade = await page.evaluate(() => {
      window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 16 });
      return Math.round(document.querySelector('.loop-shade').getBoundingClientRect().top - document.querySelector('.chord-strip').getBoundingClientRect().bottom);
    });
    check('Loop-Bereich beginnt unter dem Akkord-Streifen', Math.abs(shade) <= 1, `${shade} px`);

    // Starter-Knöpfe: nicht leer → „Sicher?“, zweiter Klick baut; „Nochmal“ würfelt ohne Rückfrage, solange unverändert
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createDemoProject()); });
    const demo = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    await clickR(page, '.starter-genre[data-genre="techno"]');
    const ask = await page.evaluate((d) => ({ text: document.querySelector('.starter-genre[data-genre="techno"]').textContent, same: JSON.stringify(window.loopwerk.store.project) === d }), demo);
    check('Starter im vollen Lied: Knopf fragt „Sicher?“, nichts passiert', ask.text === 'Sicher?' && ask.same, JSON.stringify(ask));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'starter-desktop-confirm.png') });
    await page.click('.starter-genre[data-genre="techno"]');
    await page.waitForFunction(() => window.loopwerk.starter.last?.genre === 'techno', null, { timeout: 10000 });
    const built = await page.evaluate(() => ({ bpm: window.loopwerk.store.project.bpm, name: window.loopwerk.store.project.name, again: document.getElementById('starter-again').textContent, dis: document.getElementById('starter-again').disabled, pressed: document.querySelector('.starter-genre[data-genre="techno"]').getAttribute('aria-pressed'), hint: document.getElementById('hint-text').textContent }));
    check('Zweiter Klick baut den Techno-Song', built.bpm === 130 && built.name === 'Techno-Song' && built.pressed === 'true' && /Techno · 130 BPM/.test(built.hint), JSON.stringify(built));
    check('„Nochmal“ bereit', !built.dis && built.again === 'Nochmal · Techno', built.again);
    const sig0 = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.tracks.map((t) => t.clips.map((c) => c.sampleId))));
    await page.click('#starter-again');
    await page.waitForFunction(() => window.loopwerk.starter.last?.variant === 1, null, { timeout: 10000 });
    const sig1 = await page.evaluate(() => ({ s: JSON.stringify(window.loopwerk.store.project.tracks.map((t) => t.clips.map((c) => c.sampleId))), b: window.loopwerk.store.project.bpm }));
    check('„Nochmal“ würfelt eine andere Fassung (ohne Rückfrage)', sig1.s !== sig0, `${sig1.b} BPM`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'starter-desktop.png') });
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    check('Zweimal Rückgängig: das alte Lied ist wieder da', await page.evaluate((d) => JSON.stringify(window.loopwerk.store.project) === d, demo));
    // Begleitung-Karte
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createEmptyProject()); });
    await clickR(page, '.ccard[data-create="accomp"]');
    const acc = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, library, patterns } = window.loopwerk;
      await patterns.sync(store.project);
      const p = store.project;
      return { names: p.tracks.filter((t) => t.clips.some((c) => library.followsChords(c.sampleId))).map((t) => t.name), chords: M.chordsOf(p).length, steps: store.undoStack.length };
    });
    check('Karte „Begleitung“: Fläche, Bass, Arp folgen, Streifen mit Folge (ein Schritt)', acc.names.join() === 'Akkord-Fläche,Akkord-Bass,Akkord-Arp' && acc.chords > 4 && acc.steps === 1, JSON.stringify(acc));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Tablet und Handy (Finger) ----------
    for (const [label, viewport] of [['Tablet', { width: 1180, height: 820 }], ['Handy', { width: 390, height: 844 }]]) {
      app = await openApp({ viewport, hasTouch: true, deviceScaleFactor: 2 });
      page = app.page;
      await page.evaluate(() => { const { store, arranger } = window.loopwerk; store.fillChords(0, ['i', 'VI', 'III', 'VII'], { toBeat: 16 }); document.getElementById('arr-scroll').scrollLeft = 0; arranger.render(); });
      const tb = await page.locator('.chord-strip').boundingBox();
      const tppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
      check(`${label}: Akkord-Streifen fingerhoch (44 px)`, tb.height >= 44, `${tb.height} px`);
      const x = Math.max(tb.x + 4, tb.x + 1.25 * 4 * tppb);
      await page.touchscreen.tap(x, tb.y + tb.height / 2);
      await page.waitForTimeout(150);
      const tpop = await page.evaluate(() => ({ open: !document.querySelector('.chord-pop').hidden, head: document.querySelector('.chord-pop .key-pop-head')?.textContent }));
      check(`${label}: Antippen öffnet die Akkorde`, tpop.open && /Takt 2/.test(tpop.head), JSON.stringify(tpop));
      const list = (await page.evaluate(measureTargets)).filter((t) => /chord-pop|key-pop/.test(t.label));
      const small = list.filter((t) => t.w < 44 || t.h < 44);
      check(`${label}: Tasten der Auswahl ≥ 44 px`, list.length >= 12 && !small.length, small.map((t) => `${t.label} ${t.w}×${t.h}`).join(' | ') || `${list.length} Tasten`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `chords-${label.toLowerCase()}-pop.png`) });
      await page.tap('.chord-pop-key[data-chord="VII"]');
      check(`${label}: Antippen setzt G für Takt 2`, await page.evaluate(async () => { const M = await import('./src/model.js'); return M.chordAtBeat(window.loopwerk.store.project, 4) === 'VII'; }));
      // Starter-Knöpfe: Tablet im Fach „Erstellen“, Handy im Fach „Song“ (gibt es erst mit dem Handy-Umbau aus main)
      const where = await page.evaluate(() => {
        const dock = document.getElementById('starter').closest('.dock');
        if (dock) window.loopwerk.ui.setDock(dock.id);
        else if (!matchMedia('(max-width: 760px)').matches) document.getElementById('ltab-create')?.click();
        else return null;
        document.getElementById('starter').scrollIntoView({ block: 'center' });
        return dock?.id ?? 'create';
      });
      if (where) {
        await page.waitForTimeout(500);
        const sl = (await page.evaluate(measureTargets)).filter((t) => /starter/.test(t.label));
        const sm = sl.filter((t) => t.w < 44 || t.h < 44);
        check(`${label}: Starter-Knöpfe ≥ 44 px (${where})`, sl.length >= 3 && !sm.length, sm.map((t) => `${t.label} ${t.w}×${t.h}`).join(' | ') || `${sl.length} Knöpfe`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `starter-${label.toLowerCase()}.png`) });
      } else console.log(`– ${label}: kein Fach „Song“ in diesem Stand, Starter am Handy erst nach dem Zusammenführen mit main`);
      check(`${label}: keine Fehler in der Konsole`, app.errors.length === 0, app.errors.join(' | '));
      await app.close();
    }
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || String(err));
    await app.close().catch(() => {});
  }
  finish();
})();
