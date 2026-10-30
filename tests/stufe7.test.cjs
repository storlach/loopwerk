// Tests für Stufe 7 (Beat- und Melodie-Patterns): node tests/stufe7.test.cjs [--shots]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, createChecker, clickR, selectR, createCard } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    // ---------- Rendering ----------
    const r = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const lib = window.loopwerk.library;
      const sr = 44100;
      const onsets = (d, spb, beats) => Array.from({ length: beats * 4 }, (_, i) => {
        const a = Math.round(i / 4 * spb * sr);
        const w = Math.round(spb / 4 * sr);
        let e = 0; for (let k = a; k < a + w; k++) e += d[k] * d[k];
        return e;
      });
      const kickOnly = I.newDrumPattern();
      for (const k of Object.keys(kickOnly.rows)) kickOnly.rows[k] = kickOnly.rows[k].map(() => 0);
      kickOnly.rows.kick = kickOnly.rows.kick.map((_, i) => (i % 4 === 0 ? 1 : 0));
      const a = await I.renderPattern(kickOnly, 120, lib);
      const ea = onsets(a.buffer.getChannelData(0), 0.5, 4);
      const hits = ea.map((e, i) => [i, e]).filter(([i, e]) => e > 1 && e > 3 * (ea[i - 1] ?? 0)).map(([i]) => i);
      const ac = await I.renderPattern({ ...kickOnly, kit: 'akustik' }, 120, lib);
      const eac = onsets(ac.buffer.getChannelData(0), 0.5, 4);
      const empty = I.newDrumPattern();
      for (const k of Object.keys(empty.rows)) empty.rows[k] = empty.rows[k].map(() => 0);
      const e = await I.renderPattern(empty, 120, lib);
      let ep = 0; for (const v of e.buffer.getChannelData(0)) ep = Math.max(ep, Math.abs(v));
      // Melodie: A3 (220 Hz) als Bass, Tonhöhe per Autokorrelation
      const mel = { type: 'synth', name: 'm', bars: 1, preset: 'bass', notes: [{ pitch: 57, start: 0, len: 2, vel: 1 }] };
      const m = await I.renderPattern(mel, 120, lib);
      const d = m.buffer.getChannelData(0).subarray(4410, 4410 + 8192);
      let best = 0, lag = 0;
      for (let L = 40; L < 1000; L++) { let s = 0; for (let i = 0; i < 4096; i++) s += d[i] * d[i + L]; if (s > best) { best = s; lag = L; } }
      return { len: a.buffer.length, beats: a.lengthBeats, hits, acHits: eac.map((x, i) => [i, x]).filter(([i, x]) => x > 1 && x > 3 * (eac[i - 1] ?? 0)).map(([i]) => i), emptyPeak: ep, freq: sr / lag, melLen: m.buffer.length };
    });
    check('Beat: 1 Takt bei 120 BPM = 2 s', r.len === 88200 && r.beats === 4, `${r.len} Frames`);
    check('Beat: Kick genau auf den Vierteln (Elektro-Kit)', JSON.stringify(r.hits) === '[0,4,8,12]', `Schritte ${r.hits.join(', ')}`);
    check('Beat: Akustik-Kit (Sonic Pi) spielt dieselben Schritte', JSON.stringify(r.acHits) === '[0,4,8,12]', `Schritte ${r.acHits.join(', ')}`);
    check('Leeres Pattern ist stumm', r.emptyPeak === 0);
    check('Melodie: Note A3 klingt mit 220 Hz', Math.abs(r.freq - 220) < 4, `${r.freq.toFixed(1)} Hz`);

    // ---------- Beat anlegen und bearbeiten ----------
    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); });
    await createCard(page, 'beat');
    await page.waitForSelector('#pattern:not([hidden])');
    const created = await page.evaluate(() => {
      const { store, library } = window.loopwerk;
      const c = store.project.tracks[0].clips[0];
      const s = c && library.get(c.sampleId);
      return { clip: c && [c.startBeat, c.lengthBeats], name: s?.name, pattern: s?.patternId, cells: document.querySelectorAll('#pat-drums .pat-cell').length };
    });
    check('„+ Beat bauen“ legt Pattern und Clip an und öffnet den Editor', created.clip?.[1] === 4 && created.name === 'Beat 1' && created.cells === 128, JSON.stringify(created));

    const rev0 = await page.evaluate(() => window.loopwerk.library.get('pat-p1').rev);
    await page.locator('#pat-drums .pat-cell[data-row="clap"][data-step="6"]').click();
    await page.waitForFunction((r0) => window.loopwerk.library.get('pat-p1').rev > r0, rev0, { timeout: 5000 });
    const clap = await page.evaluate(async () => {
      const { store, library, renderProject } = window.loopwerk;
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 4 })).getChannelData(0);
      const a = Math.round(1.5 * 0.5 * 44100);
      let e = 0; for (let k = a; k < a + 400; k++) e += d[k] * d[k];
      return { on: store.project.patterns.p1.rows.clap[6], energy: e, pressed: document.querySelector('#pat-drums .pat-cell[data-row="clap"][data-step="6"]').getAttribute('aria-pressed') };
    });
    check('Feld anklicken setzt einen Schlag, Sound wird neu gerendert', clap.on === 1 && clap.pressed === 'true' && clap.energy > 1, `Energie auf Schritt 7: ${clap.energy.toFixed(1)}`);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    check('Rückgängig nimmt den Schlag zurück', await page.evaluate(() => window.loopwerk.store.project.patterns.p1.rows.clap[6]) === 0);

    await page.selectOption('#pat-bars', '2');
    await page.waitForTimeout(300);
    const two = await page.evaluate(() => ({ steps: window.loopwerk.store.project.patterns.p1.rows.kick.length, clip: window.loopwerk.store.project.tracks[0].clips[0].lengthBeats, cells: document.querySelectorAll('#pat-drums .pat-cell').length, len: window.loopwerk.library.get('pat-p1').lengthBeats }));
    check('Auf 2 Takte verlängern: Raster, Sound und Clip wachsen mit', two.steps === 32 && two.clip === 8 && two.cells === 256 && two.len === 8, JSON.stringify(two));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stufe7-beat.png') });

    // ---------- Melodie ----------
    await createCard(page, 'melody');
    await page.waitForFunction(() => window.loopwerk.patternEditor.id === 'p2');
    const box = await page.locator('#pat-roll').boundingBox();
    const geo = await page.evaluate(() => ({ cellW: (document.getElementById('pat-roll').clientWidth - 30) / 32, top: 84 }));
    // Klick auf A4 (MIDI 69), Schritt 0
    const wrapScroll = await page.evaluate(() => document.getElementById('pat-roll-wrap').scrollTop);
    const yA4 = (84 - 69) * 14 + 7;
    await page.locator('#pat-roll-wrap').evaluate((n, y) => { n.scrollTop = Math.max(0, y - 60); }, yA4);
    const box2 = await page.locator('#pat-roll').boundingBox();
    await page.mouse.click(box2.x + 30 + geo.cellW * 0.5, box2.y + yA4);
    await page.waitForTimeout(200);
    let notes = await page.evaluate(() => window.loopwerk.store.project.patterns.p2.notes);
    check('Klick in die Piano-Roll setzt eine Note (A4, 1/4)', notes.length === 1 && notes[0].pitch === 69 && notes[0].start === 0 && notes[0].len === 1, JSON.stringify(notes));
    await page.mouse.click(box2.x + 30 + geo.cellW * 0.5, box2.y + yA4);
    await page.waitForTimeout(200);
    notes = await page.evaluate(() => window.loopwerk.store.project.patterns.p2.notes);
    check('Klick auf die Note löscht sie', notes.length === 0, JSON.stringify(notes));

    // Schritt-Eingabe mit der Computertastatur: A (C4), D (E4), G (G4)
    await clickR(page, '#pat-rec');
    await page.keyboard.press('a');
    await page.keyboard.press('d');
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    notes = await page.evaluate(() => window.loopwerk.store.project.patterns.p2.notes.map((n) => [n.pitch, n.start, n.len]));
    check('Tastatur-Eingabe setzt C4, E4, G4 nacheinander', JSON.stringify(notes) === '[[60,0,1],[64,1,1],[67,2,1]]', JSON.stringify(notes));
    const splitSafe = await page.evaluate(() => window.loopwerk.store.project.tracks.every((t) => t.clips.length <= 1));
    check('Taste T im Melodie-Editor spielt F♯ statt den Clip zu teilen', splitSafe);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stufe7-melodie.png') });
    await clickR(page, '#pat-rec');

    await page.selectOption('#pat-preset', 'bass');
    await page.waitForTimeout(300);
    check('Klang wählen ändert das Pattern', await page.evaluate(() => window.loopwerk.store.project.patterns.p2.preset) === 'bass');

    // Tempowechsel rendert Patterns neu
    await page.evaluate(() => window.loopwerk.store.setBpm(100));
    await page.waitForFunction(() => window.loopwerk.library.bpm === 100 && !window.loopwerk.tempo.busy, null, { timeout: 30000 });
    const len100 = await page.evaluate(() => window.loopwerk.library.get('pat-p2').buffer.length);
    check('Tempowechsel rendert Patterns passend neu', len100 === 2 * 4 * 0.6 * 44100, `${len100} Frames`);

    // Wiedergabe mit Pattern-Clips
    await page.click('#play-btn');
    await page.waitForTimeout(700);
    const playing = await page.evaluate(() => ({ p: window.loopwerk.engine.playing, v: window.loopwerk.engine.voices.size }));
    await page.click('#play-btn');
    check('Pattern-Clips spielen im Song', playing.p && playing.v > 0, `${playing.v} Stimmen`);

    // Speichern und wieder öffnen
    const [download] = await Promise.all([page.waitForEvent('download'), clickR(page, '#save-btn')]);
    const saved = path.join(os.tmpdir(), 'loopwerk-patterns.json');
    await download.saveAs(saved);
    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); });
    await page.waitForFunction(() => !window.loopwerk.library.get('pat-p1'));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 10000 });
    const reopened = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => window.loopwerk.library.get(c.sampleId)?.name)));
    check('Projekt mit Patterns speichern und öffnen', reopened.includes('Beat 1') && reopened.includes('Melodie 1'), JSON.stringify(reopened));

    // Doppelklick auf Pattern-Clip öffnet den passenden Editor
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    const beatClip = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).find((c) => c.sampleId === 'pat-p1').id);
    await page.locator(`.clip[data-clip-id="${beatClip}"]`).dblclick({ position: { x: 30, y: 40 } });
    await page.waitForSelector('#pattern:not([hidden])');
    check('Doppelklick auf einen Beat-Clip öffnet den Beat-Editor', await page.locator('#pat-title').textContent() === 'Beat-Editor');

    // Pattern im Regal löschen (nicht benutzt) und Rückgängig
    const cnt = await page.evaluate(() => window.loopwerk.store.addPattern({ type: 'synth', name: 'Übrig', bars: 1, preset: 'lead', notes: [] }));
    await page.waitForFunction(() => window.loopwerk.library.list().some((s) => s.name === 'Übrig'));
    await clickR(page, '#shelf-chips .chip[data-filter="own"]');
    const row = page.locator('#library .loop-row', { hasText: 'Übrig' });
    await row.locator('.loop-del').click();
    await row.locator('.loop-del').click();
    await page.waitForFunction(() => !window.loopwerk.library.list().some((s) => s.name === 'Übrig'), null, { timeout: 3000 });
    check('Unbenutztes Pattern im Regal löschen', true);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
