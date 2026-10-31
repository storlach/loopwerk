// Tonart je Takt (2.6): Modell, Projektdatei, Klang (Offline gemessen), Realtime mit Live-Änderung, Zeile im Arranger
// am Desktop, Tablet und Handy, Wunsch-Agent.  node tests/key-bars.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const SEMI = 2 ** (1 / 12);

// Im Browser: Testton als tonaler synthetischer Loop (4 Takte, Sinus A3 = 220 Hz in A-Moll; endet kurz vor dem Loop-Ende,
// damit das Falten des Ausklangs den Pegel nicht je nach Phase verändert)
async function addTestTone() {
  const { library } = window.loopwerk;
  if (library.get('test-tone')) return;
  const def = { id: 'test-tone', name: 'Testton', bars: 4, category: 'synth', peak: 0.5, render: (kit) => kit.sub(0, 57, 15.8) };
  await library.add({ id: 'test-tone', name: 'Testton', category: 'synth', kind: 'loop', key: 'Am', beats: 16, def });
}

(async () => {
  let app = await openApp();
  let { page } = app;
  try {
    await page.evaluate(addTestTone);

    // ---------- Modell ----------
    const m = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const p = M.createEmptyProject();
      p.keyChanges = [{ bar: 9, key: 'Em' }, { bar: 5, key: 'Dm' }, { bar: 5, key: 'Gm' }, { bar: 1, key: 'Cm' }, { bar: 3, key: 'X' }];
      const list = M.keyChangesOf(p);
      const at = [M.keyAtBeat(p, 0), M.keyAtBeat(p, 15.9999), M.keyAtBeat(p, 16), M.keyAtBeat(p, 31.99), M.keyAtBeat(p, 32)];
      const spans = M.keySpans(p, 8, 40);
      const old = M.createEmptyProject();
      return {
        list, at, spans,
        oldValid: M.isValidProject(old), oldNone: M.keyChangesOf(old).length === 0, oldKey: M.keyAtBeat(old, 50),
        badValid: M.isValidProject({ ...old, keyChanges: 'Dm' }),
        delta: M.keyDelta({ ...old, key: 'Am' }, 'Dm'),
      };
    });
    check('Wechsel sortiert, ohne Doppelte, ungültige und Takt 1 weg', JSON.stringify(m.list) === '[{"bar":5,"key":"Gm"},{"bar":9,"key":"Em"}]', JSON.stringify(m.list));
    check('keyAtBeat: Wechsel genau an der Taktgrenze', m.at.join() === 'Am,Am,Gm,Gm,Em', m.at.join());
    check('keySpans teilt an den Taktgrenzen', JSON.stringify(m.spans.map((s) => [s.from, s.to, s.key])) === '[[8,16,"Am"],[16,32,"Gm"],[32,40,"Em"]]', JSON.stringify(m.spans));
    check('Alte Projekte ohne keyChanges: gültig, Grundtonart überall', m.oldValid && m.oldNone && m.oldKey === 'Am');
    check('keyChanges, das keine Liste ist, ist ungültig', !m.badValid);
    check('Am → Dm: +5 Halbtöne', m.delta === 5, String(m.delta));

    const s = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store } = window.loopwerk;
      store.replace(M.createEmptyProject());
      const kc = () => JSON.stringify(store.project.keyChanges ?? []);
      const out = {};
      store.setKeyAt(5, 'Dm');
      out.a = kc();
      store.setKeyAt(9, 'Em');
      out.b = kc();
      const steps = store.undoStack.length;
      store.setKeyAt(9, 'Dm'); // wie davor → Wechsel weg
      out.c = kc();
      store.undo();
      out.undo = kc();
      store.redo();
      out.redo = kc();
      store.clearKeyAt(5);
      out.cleared = kc();
      out.clearedField = 'keyChanges' in store.project;
      store.undo();
      store.setKeyAt(1, 'Cm');
      out.base = store.project.key;
      out.afterBase = kc();
      store.setKeyAt(99, 'Dm');
      out.beyond = kc();
      out.steps = steps;
      return out;
    });
    check('setKeyAt legt Wechsel an (je ein Rückgängig-Schritt)', s.a === '[{"bar":5,"key":"Dm"}]' && s.b === '[{"bar":5,"key":"Dm"},{"bar":9,"key":"Em"}]' && s.steps === 2, `${s.a} ${s.b} Schritte ${s.steps}`);
    check('Gleiche Tonart wie davor entfernt den Wechsel', s.c === '[{"bar":5,"key":"Dm"}]', s.c);
    check('Rückgängig und Wiederholen', s.undo === s.b && s.redo === s.c, `${s.undo} / ${s.redo}`);
    check('clearKeyAt: letzter Wechsel weg, Feld verschwindet', s.cleared === '[]' && !s.clearedField);
    check('Takt 1 setzt die Grundtonart, Wechsel bleiben', s.base === 'Cm' && s.afterBase === '[{"bar":5,"key":"Dm"}]', `${s.base} ${s.afterBase}`);
    check('Takt hinter dem Songende wird ignoriert', s.beyond === s.afterBase);

    // ---------- Projektdatei ----------
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-tonart.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('Speichern: keyChanges in der Datei', JSON.stringify(json.keyChanges) === '[{"bar":5,"key":"Dm"}]' && json.key === 'Cm', JSON.stringify(json.keyChanges));
    json.name = 'Mit Wechsel';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createEmptyProject()); });
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Mit Wechsel', null, { timeout: 5000 });
    check('Öffnen: Wechsel wieder da', await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.keyChanges)) === '[{"bar":5,"key":"Dm"}]');
    delete json.keyChanges;
    json.name = 'Alt';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Alt', null, { timeout: 5000 });
    check('Alte Datei ohne keyChanges lädt', await page.evaluate(() => !('keyChanges' in window.loopwerk.store.project)));

    // ---------- Klang: Offline gemessen ----------
    const k = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { library, renderProject, store, tempo } = window.loopwerk;
      // Grundtonart A-Moll (das zuletzt geöffnete Projekt stand in Cm)
      store.replace(M.createEmptyProject());
      await tempo.apply();
      const sr = 44100;
      // Frequenz über aufsteigende Nulldurchgänge (linear interpoliert)
      const freq = (d, a, b) => {
        let first = null; let last = null; let n = 0;
        for (let i = a + 1; i < b; i++) if (d[i - 1] < 0 && d[i] >= 0) { const t = i - 1 + d[i - 1] / (d[i - 1] - d[i]); if (first == null) first = t; last = t; n++; }
        return (n - 1) / ((last - first) / sr);
      };
      const at = (beat) => Math.round(beat * 0.5 * sr);
      const p = M.createEmptyProject();
      p.lengthBars = 8;
      // Testton ab Takt 3 (Schlag 8), 4 Takte: der Wechsel an Takt 5 liegt mitten im Sample (Schlag 8 des Loops)
      p.tracks[0].clips.push({ id: 'c1', sampleId: 'test-tone', startBeat: 8, lengthBeats: 16, offsetBeats: 0 });
      p.keyChanges = [{ bar: 5, key: 'Dm' }];
      const d = (await renderProject(p, library, { limiter: false, toBeat: 32 })).getChannelData(0);
      const before = freq(d, at(12.5), at(15.8));
      const after = freq(d, at(16.2), at(19.5));
      const b = at(16);
      let jump = 0; for (let i = b - 3000; i < b + 3000; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]));
      // Größter Sprung im Dauerton davor und danach (der höhere Ton hat von sich aus größere Sprünge)
      let steady = 0;
      for (const s0 of [at(13), at(18)]) for (let i = s0; i < s0 + 6000; i++) steady = Math.max(steady, Math.abs(d[i] - d[i - 1]));
      let peak = 0; for (let i = b - 3000; i < b + 3000; i++) peak = Math.max(peak, Math.abs(d[i]));
      // Ohne Wechsel bleibt alles bei 220 Hz
      const plain = (await renderProject({ ...p, keyChanges: undefined }, library, { limiter: false, toBeat: 32 })).getChannelData(0);
      const plainAfter = freq(plain, at(16.2), at(19.5));
      // Grundtonart Cm, Wechsel zu Dm: Dm klingt gleich wie oben (absolute Tonart), Abschnitt davor in Cm
      store.replace(JSON.parse(JSON.stringify({ ...p, key: 'Cm' })));
      await tempo.apply();
      const dc = (await renderProject(store.project, library, { limiter: false, toBeat: 32 })).getChannelData(0);
      const cBefore = freq(dc, at(12.5), at(15.8));
      const cAfter = freq(dc, at(16.2), at(19.5));
      store.replace(M.createEmptyProject());
      await tempo.apply();

      // Drums und Fremd-Samples bleiben unverändert
      await library.ensure('drums-four');
      const dp = M.createEmptyProject();
      dp.lengthBars = 8;
      dp.tracks[0].clips.push({ id: 'c1', sampleId: 'drums-four', startBeat: 0, lengthBeats: 32, offsetBeats: 0 });
      const withKey = (await renderProject({ ...dp, keyChanges: [{ bar: 3, key: 'F♯m' }] }, library, { limiter: false })).getChannelData(0);
      const without = (await renderProject(dp, library, { limiter: false })).getChannelData(0);
      let diff = 0; let energy = 0;
      for (let i = 0; i < without.length; i++) { diff = Math.max(diff, Math.abs(withKey[i] - without[i])); energy += without[i] * without[i]; }
      const foreign = library.list().find((x) => !x.def && x.key && x.kind === 'loop');
      return {
        before, after, jump, steady, peak, plainAfter, cBefore, cAfter, drumDiff: diff, drumEnergy: energy,
        follows: { tone: library.followsKey('test-tone'), drums: library.followsKey('drums-four'), foreign: foreign ? library.followsKey(foreign.id) : false, foreignId: foreign?.id },
        storeKey: store.project.key,
      };
    });
    check('Tonaler Loop vor dem Wechsel: A3 = 220 Hz', Math.abs(k.before - 220) < 1, `${k.before.toFixed(2)} Hz`);
    check('Ab Takt 5 (Dm): +5 Halbtöne = 293,7 Hz, mitten im Sample', Math.abs(k.after - 220 * SEMI ** 5) < 1, `${k.after.toFixed(2)} Hz (Verhältnis ${(k.after / k.before).toFixed(4)}, erwartet ${(SEMI ** 5).toFixed(4)})`);
    check('Ohne Wechsel bleibt er bei 220 Hz', Math.abs(k.plainAfter - 220) < 1, `${k.plainAfter.toFixed(2)} Hz`);
    check('Übergang ohne Klick (größter Sprung wie im Dauerton)', k.jump < 0.05 && k.jump < k.steady * 1.5 && k.peak > 0.3, `Sprung ${k.jump.toFixed(4)}, Dauerton ${k.steady.toFixed(4)}, Spitze ${k.peak.toFixed(2)}`);
    check('Grundtonart Cm: davor Cm (+3), ab Takt 5 Dm (+5)', Math.abs(k.cBefore - 220 * SEMI ** 3) < 1 && Math.abs(k.cAfter - 220 * SEMI ** 5) < 1, `${k.cBefore.toFixed(2)} / ${k.cAfter.toFixed(2)} Hz`);
    check('Drums klingen mit Wechsel exakt gleich', k.drumDiff < 1e-6 && k.drumEnergy > 1, `max. Abweichung ${k.drumDiff}`);
    check('Nur tonale Sounds folgen der Tonart (Testton ja, Drums und Fremd-Samples nein)', k.follows.tone && !k.follows.drums && !k.follows.foreign, JSON.stringify(k.follows));

    // Melodie-Pattern: folgt dem Wechsel mit verschobenen Noten
    const pat = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, library, renderProject, patterns } = window.loopwerk;
      store.replace(M.createEmptyProject());
      const notes = Array.from({ length: 16 }, (_, i) => ({ pitch: 57, start: i, len: 0.9, vel: 1 }));
      const pid = store.addPattern({ type: 'synth', name: 'Ton', bars: 4, preset: 'bass', notes });
      await patterns.sync(store.project);
      const sid = 'pat-' + pid;
      store.addClip('t1', sid, 8, 16);
      store.setKeyAt(5, 'Dm');
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 32 })).getChannelData(0);
      const sr = 44100;
      const pitch = (beat) => {
        const a = Math.round((beat + 0.1) * 0.5 * sr);
        const x = d.subarray(a, a + 8192);
        const r = [];
        for (let L = 0; L < 700; L++) { let s = 0; for (let i = 0; i < 4096; i++) s += x[i] * x[i + L]; r.push(s); }
        let max = 0; for (let L = 40; L < 700; L++) max = Math.max(max, r[L]);
        for (let L = 41; L < 699; L++) if (r[L] > 0.9 * max && r[L] >= r[L - 1] && r[L] >= r[L + 1]) return sr / L;
        return 0;
      };
      return { follows: library.followsKey(sid), f4: pitch(13), f5: pitch(17), f6: pitch(21) };
    });
    check('Melodie-Pattern folgt der Tonart', pat.follows);
    check('Melodie: ab Takt 5 um +5 Halbtöne höher', Math.abs(pat.f5 / pat.f4 - SEMI ** 5) < 0.02 && Math.abs(pat.f4 - 220) < 5, `${pat.f4.toFixed(1)} → ${pat.f5.toFixed(1)} Hz (${(pat.f5 / pat.f4).toFixed(3)})`);

    // ---------- Realtime: dieselben Fassungen, Live-Änderung ohne Stopp ----------
    const rt = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, library, engine } = window.loopwerk;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const p = M.createEmptyProject();
      p.lengthBars = 16;
      p.tracks[0].clips.push({ id: 'c1', sampleId: 'test-tone', startBeat: 8, lengthBeats: 32, offsetBeats: 0 });
      p.tracks[1].clips.push({ id: 'c2', sampleId: 'test-dc', startBeat: 0, lengthBeats: 64, offsetBeats: 0 });
      p.keyChanges = [{ bar: 5, key: 'Dm' }];
      store.replace(p);
      await library.ensureProject(store.project);
      const bufOf = (delta) => { const v = library.variant('test-tone', { delta }); if (!v) throw new Error('Fassung fehlt ' + JSON.stringify(window.__dbg())); return v.buffer; };
      window.__dbg = () => ({ v5: !!library.variant('test-tone', { delta: 5 }), v7: !!library.variant('test-tone', { delta: 7 }), keys: [...library.keyedVariants.keys()], rev: library.get('test-tone').rev, kv: [...library.keyedVariants.values()].map((v) => v.baseRev) });
      const toneBuf = () => [...engine.voices].filter((v) => v.clipId === 'c1').map((v) => v.src.buffer);
      await engine.play(15);
      await wait(1500); // jetzt in Takt 5 (Dm)
      const inDm = toneBuf().some((b) => b === bufOf(5));
      const drumsBefore = [...engine.voices].filter((v) => v.clipId === 'c2');
      store.setKeyAt(5, 'Em');
      const drumsKept = drumsBefore.every((v) => engine.voices.has(v));
      await wait(1200);
      const inEm = toneBuf().some((b) => b === bufOf(-5)); // Em liegt 5 Halbtöne unter Am (kürzester Weg)
      const state = { playing: engine.playing, beat: engine.currentBeat() };
      store.clearKeyAt(5);
      const baseBuf = library.get('test-tone').buffer;
      await wait(300);
      const back = toneBuf().some((b) => b === baseBuf);
      engine.stop();
      return { inDm, drumsKept, inEm, back, ...state };
    });
    check('Realtime: ab Takt 5 spielt die Dm-Fassung', rt.inDm);
    check('Live-Änderung Dm → Em greift ohne Stopp', rt.inEm && rt.playing && rt.beat > 17, `spielt ${rt.playing}, Schlag ${rt.beat.toFixed(1)}`);
    check('Live-Änderung lässt andere Clips weiterlaufen', rt.drumsKept);
    check('„Wie davor“ live: zurück zum Grund-Sound', rt.back);

    // ---------- Oberfläche (Desktop) ----------
    await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, arranger, engine } = window.loopwerk;
      store.replace(M.createDemoProject());
      store.setKeyAt(5, 'Dm');
      engine.setPosition(0);
      document.getElementById('arr-scroll').scrollLeft = 0;
      arranger.render();
    });
    const row = await page.evaluate(() => {
      const strip = document.querySelector('.key-strip');
      const ruler = document.querySelector('.ruler').getBoundingClientRect();
      const r = strip.getBoundingClientRect();
      const secs = [...strip.querySelectorAll('.key-sec')].map((n) => ({ text: n.textContent, left: n.offsetLeft, bar: n.dataset.bar }));
      return { below: Math.abs(r.top - ruler.bottom) < 1.5, h: r.height, secs, ppb: window.loopwerk.ui.pxPerBeat };
    });
    check('Tonart-Zeile direkt unter dem Lineal, schmal', row.below && row.h <= 24, `Höhe ${row.h}`);
    check('Zeile zeigt „Am“ ab Takt 1 und „Dm“ ab Takt 5', row.secs.length === 2 && row.secs[0].text === 'Am' && row.secs[1].text === 'Dm' && row.secs[1].left === 16 * row.ppb, JSON.stringify(row.secs));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'key-desktop.png') });

    const stripBox = await page.locator('.key-strip').boundingBox();
    const barX = (bar) => stripBox.x + (bar - 1 + 0.5) * 4 * row.ppb;
    await page.mouse.click(barX(3), stripBox.y + stripBox.height / 2);
    const popUp = await page.evaluate(() => {
      const pop = document.querySelector('.key-pop');
      return { open: !pop.hidden, head: pop.querySelector('.key-pop-head')?.textContent, keys: pop.querySelectorAll('.key-pop-key').length, same: pop.querySelector('.key-pop-same')?.textContent };
    });
    check('Klick auf Takt 3 öffnet die Auswahl (12 Tonarten, „Wie davor“)', popUp.open && popUp.head === 'Tonart ab Takt 3' && popUp.keys === 12 && popUp.same === 'Wie davor (Am)', JSON.stringify(popUp));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'key-desktop-pop.png') });
    await page.click('.key-pop-key[data-key="Gm"]');
    const after3 = await page.evaluate(() => ({ kc: JSON.stringify(window.loopwerk.store.project.keyChanges), open: !document.querySelector('.key-pop').hidden, secs: [...document.querySelectorAll('.key-sec')].map((n) => n.textContent).join(',') }));
    check('Zweiter Klick wählt: ab Takt 3 Gm', after3.kc === '[{"bar":3,"key":"Gm"},{"bar":5,"key":"Dm"}]' && !after3.open && after3.secs === 'Am,Gm,Dm', JSON.stringify(after3));
    // Klick auf den Namen „Dm“ bearbeitet den Wechsel an Takt 5, „Wie davor“ entfernt ihn
    await page.click('.key-sec[data-bar="5"] .key-name');
    await page.click('.key-pop-same');
    const after5 = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.keyChanges));
    check('„Wie davor“ entfernt den Wechsel', after5 === '[{"bar":3,"key":"Gm"}]', after5);
    await page.keyboard.press('Control+z');
    check('Strg+Z holt ihn zurück', await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.keyChanges)) === '[{"bar":3,"key":"Gm"},{"bar":5,"key":"Dm"}]');
    // Tastatur: Zeile fokussieren, Enter öffnet für den Takt der Abspielmarke, Escape schließt
    await page.evaluate(() => window.loopwerk.engine.setPosition(36));
    await page.focus('.key-strip');
    await page.keyboard.press('Enter');
    const kb = await page.evaluate(() => ({ head: document.querySelector('.key-pop-head')?.textContent, focus: document.activeElement?.className }));
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => document.querySelector('.key-pop').hidden && document.activeElement?.classList.contains('key-strip'));
    check('Tastatur: Enter öffnet für Takt 10, Escape schließt', kb.head === 'Tonart ab Takt 10' && kb.focus.includes('key-pop') && closed, JSON.stringify(kb));
    // Loop-Schattierung beginnt unter der Tonart-Zeile
    const shade = await page.evaluate(() => {
      window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 16 });
      return Math.round(document.querySelector('.loop-shade').getBoundingClientRect().top - document.querySelector('.key-strip').getBoundingClientRect().bottom);
    });
    check('Loop-Bereich beginnt unter der Tonart-Zeile', Math.abs(shade) <= 1, `${shade} px`);

    // ---------- Wunsch-Agent ----------
    const w = await page.evaluate(async () => {
      const W = await import('./src/wish.js');
      const { store, library } = window.loopwerk;
      const plan = W.planByRules('ab Takt 9 in E-Moll', store.project, library);
      const res = W.applyPlan(store, library, plan);
      return { actions: plan.actions, summary: plan.summary, done: res.done.length, kc: JSON.stringify(store.project.keyChanges), plain: W.keyInText('Am Ende lauter') };
    });
    check('Wunsch „ab Takt 9 in E-Moll“ setzt den Wechsel', w.kc.includes('{"bar":9,"key":"Em"}') && w.done === 1 && w.plain === null, `${JSON.stringify(w.actions)} → ${w.kc} („${w.summary}“)`);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Tablet (Finger) ----------
    app = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.evaluate(() => { const { store, arranger } = window.loopwerk; store.setKeyAt(5, 'Dm'); document.getElementById('arr-scroll').scrollLeft = 0; arranger.render(); });
    const tb = await page.locator('.key-strip').boundingBox();
    const tppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    check('Tablet: Tonart-Zeile fingerhoch (44 px)', tb.height >= 44, `${tb.height} px`);
    await page.touchscreen.tap(tb.x + 2.5 * 4 * tppb, tb.y + tb.height / 2);
    await page.waitForTimeout(150);
    const tpop = await page.evaluate(() => ({ open: !document.querySelector('.key-pop').hidden, head: document.querySelector('.key-pop-head')?.textContent }));
    check('Tablet: Antippen öffnet die Auswahl für Takt 3', tpop.open && tpop.head === 'Tonart ab Takt 3', JSON.stringify(tpop));
    const list = (await page.evaluate(measureTargets)).filter((x) => /key-pop/.test(x.label));
    const small = list.filter((x) => x.w < 44 || x.h < 44);
    check('Tablet: Tasten der Auswahl ≥ 44 px', list.length === 13 && !small.length, small.map((x) => `${x.label} ${x.w}×${x.h}`).join(' | ') || `${list.length} Tasten`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'key-tablet-pop.png') });
    await page.tap('.key-pop-key[data-key="Em"]');
    check('Tablet: Antippen einer Tonart setzt den Wechsel', await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.keyChanges)) === '[{"bar":3,"key":"Em"},{"bar":5,"key":"Dm"}]');
    // Wischen über die Zeile scrollt nur
    const sl0 = await page.evaluate(() => document.getElementById('arr-scroll').scrollLeft);
    const cdp = await page.context().newCDPSession(page);
    const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await T('touchStart', [{ x: tb.x + 500, y: tb.y + tb.height / 2 }]);
    for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: tb.x + 500 - 30 * i, y: tb.y + tb.height / 2 }]); await page.waitForTimeout(16); }
    await T('touchEnd', []);
    await page.waitForTimeout(250);
    const sw = await page.evaluate(() => ({ open: !document.querySelector('.key-pop').hidden, sl: document.getElementById('arr-scroll').scrollLeft }));
    check('Tablet: Wischen über die Zeile öffnet nichts', !sw.open, `scrollLeft ${sl0} → ${sw.sl}`);
    check('Tablet: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.evaluate(() => { const { store, arranger } = window.loopwerk; store.setKeyAt(5, 'Dm'); arranger.render(); });
    const hb = await page.locator('.key-strip').boundingBox();
    const hppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.touchscreen.tap(hb.x + 1.5 * 4 * hppb, hb.y + hb.height / 2);
    await page.waitForTimeout(150);
    const hp = await page.evaluate(() => {
      const r = document.querySelector('.key-pop').getBoundingClientRect();
      return { open: !document.querySelector('.key-pop').hidden, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, head: document.querySelector('.key-pop-head')?.textContent };
    });
    check('Handy: Zeile 44 px, Auswahl öffnet ganz im Bild', hb.height >= 44 && hp.open && hp.inside && hp.head === 'Tonart ab Takt 2', `${hb.height} px, ${JSON.stringify(hp)}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'key-phone-pop.png') });
    await page.tap('.key-pop-key[data-key="Hm"]');
    check('Handy: Wechsel gesetzt', await page.evaluate(() => JSON.stringify(window.loopwerk.store.project.keyChanges)) === '[{"bar":2,"key":"Hm"},{"bar":5,"key":"Dm"}]');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'key-phone.png') });
    check('Handy: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test ohne Ausnahme durchgelaufen', false, err.stack);
  } finally {
    await app.close().catch(() => {});
    finish();
  }
})();
