// Tests für Stufe 3 (Bibliothek, freies Tempo): node tests/stufe3.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    // ---------- Katalog ----------
    const cat = await page.evaluate(async () => {
      const { CATALOG } = await import('./src/catalog.js');
      const lib = window.loopwerk.library;
      return {
        total: CATALOG.length,
        loaded: CATALOG.filter((e) => lib.get(e.id)?.buffer).length,
        licensed: CATALOG.every((e) => e.license === 'CC0' && /^https?:\/\//.test(e.source)),
        amenLen: lib.get('sp-loop-amen').buffer.length,
        amenBpm: lib.get('sp-loop-amen').bpm,
        kick: [lib.get('sp-bd-haus').lengthBeats, lib.get('sp-bd-haus').buffer.length],
        peaksOk: CATALOG.every((e) => { const s = lib.get(e.id); let m = 0; for (const v of s.buffer.getChannelData(0)) m = Math.max(m, Math.abs(v)); return m > 0.2 && m < 0.7; }),
      };
    });
    check('Alle Katalog-Sounds geladen', cat.loaded === cat.total, `${cat.loaded} von ${cat.total}`);
    check('Jeder Katalog-Sound hat Lizenz CC0 und Quelle', cat.licensed);
    check('Echter Loop exakt auf 4 Schläge bei 120 BPM gestreckt', cat.amenLen === 88200, `Amen: ${cat.amenLen} Frames, Original ${cat.amenBpm} BPM`);
    check('One-Shot auf ganze Schläge aufgefüllt', cat.kick[0] === 1 && cat.kick[1] === 22050, JSON.stringify(cat.kick));
    check('Pegel aller Katalog-Sounds angeglichen', cat.peaksOk);

    // ---------- Time-Stretching (WSOLA) ----------
    const st = await page.evaluate(async () => {
      const { timeStretch } = await import('./src/dsp/stretch.js');
      const sr = 44100;
      // Klickfolge alle 0,5 s, 4 s lang, auf 1,25-fache Länge
      const clicks = new Float32Array(4 * sr);
      for (let k = 0; k < 8; k++) for (let i = 0; i < 40; i++) clicks[k * sr / 2 + i] = 1 - i / 40;
      const outLen = Math.round(clicks.length * 1.25);
      const [c] = timeStretch([clicks], 1.25, sr, outLen, { loop: true });
      const onsets = [];
      for (let i = 0; i < c.length; i++) if (c[i] > 0.4 && (i === 0 || c[i - 1] <= 0.4) && (!onsets.length || i - onsets[onsets.length - 1] > sr * 0.2)) onsets.push(i);
      // Abweichung jedes Anschlags zum nächstgelegenen Sollzeitpunkt (Raster 0,625 s)
      const P = 0.625 * sr;
      const maxErr = Math.max(...onsets.map((o) => { const r = o % P; return Math.min(r, P - r); })) / sr * 1000;
      // Sinus 440 Hz, auf 1,2-fache Länge: Tonhöhe muss bleiben
      const sine = new Float32Array(2 * sr);
      for (let i = 0; i < sine.length; i++) sine[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr);
      const [s] = timeStretch([sine], 1.2, sr, Math.round(sine.length * 1.2), { loop: false });
      let zc = 0;
      const a = Math.round(0.2 * sr), b = Math.round(2.2 * sr);
      for (let i = a + 1; i < b; i++) if (s[i - 1] < 0 && s[i] >= 0) zc++;
      return { len: c.length === outLen, onsets: onsets.length, maxErr, freq: zc / ((b - a) / sr) };
    });
    check('Strecken trifft die Ziellänge exakt', st.len);
    check('Strecken verschiebt Anschläge proportional', st.onsets >= 7 && st.maxErr < 5, `${st.onsets} Anschläge, max. Abweichung ${st.maxErr.toFixed(1)} ms`);
    check('Strecken erhält die Tonhöhe', Math.abs(st.freq - 440) < 3, `${st.freq.toFixed(1)} Hz (erwartet 440)`);

    // ---------- Tempo ändern ----------
    const t0 = Date.now();
    await page.fill('#bpm-input', '100');
    await page.press('#bpm-input', 'Enter');
    await page.waitForFunction(() => window.loopwerk.library.bpm === 100 && !window.loopwerk.tempo.busy, null, { timeout: 30000 });
    const tempoMs = Date.now() - t0;
    const t100 = await page.evaluate(async () => {
      const { library, renderProject, store } = window.loopwerk;
      const proj = {
        version: 1, bpm: 100, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'a', sampleId: 'test-click', startBeat: 0, lengthBeats: 4 }, { id: 'b', sampleId: 'test-click', startBeat: 6, lengthBeats: 4 }] }],
      };
      const d = (await renderProject(proj, library, { limiter: false, toBeat: 12 })).getChannelData(0);
      const hits = [];
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.3) hits.push(i);
      return {
        bpm: store.project.bpm,
        synthLen: library.get('drums-four').buffer.length,
        amenLen: library.get('sp-loop-amen').buffer.length,
        kick: [library.get('sp-bd-haus').lengthBeats, library.get('sp-bd-haus').buffer.length],
        hits,
      };
    });
    check('Tempo-Eingabe ändert das Projekttempo', t100.bpm === 100, `${t100.bpm} BPM, Anpassung in ${tempoMs} ms`);
    check('Synthetische Loops neu gerendert (1 Takt = 2,4 s)', t100.synthLen === 105840, `${t100.synthLen} Frames`);
    check('Echte Loops auf neues Tempo gestreckt', t100.amenLen === 105840, `${t100.amenLen} Frames`);
    check('One-Shot passt sich an (1 Schlag = 0,6 s)', t100.kick[0] === 1 && t100.kick[1] === 26460, JSON.stringify(t100.kick));
    check('Timing bei 100 BPM samplegenau', JSON.stringify(t100.hits) === JSON.stringify([0, 6].map((b) => Math.round(b * 0.6 * 44100))), t100.hits.join(', '));

    // Tempo während der Wiedergabe ändern: läuft weiter
    await page.click('#play-btn');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.loopwerk.store.setBpm(130));
    await page.waitForFunction(() => window.loopwerk.library.bpm === 130 && !window.loopwerk.tempo.busy, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const playing = await page.evaluate(() => window.loopwerk.engine.playing);
    check('Tempowechsel während der Wiedergabe: es läuft weiter', playing);
    await page.click('#play-btn');

    // Rückgängig stellt das Tempo wieder her
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => window.loopwerk.library.bpm === 100 && !window.loopwerk.tempo.busy, null, { timeout: 30000 });
    check('Strg+Z nimmt den Tempowechsel zurück', await page.evaluate(() => window.loopwerk.store.project.bpm) === 100);

    // One-Shot über einen Takt gezogen: vier Anschläge im Schlagraster
    const reps = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const proj = {
        version: 1, bpm: 100, beatsPerBar: 4, lengthBars: 2, loop: { on: false, startBeat: 0, endBeat: 8 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'k', sampleId: 'sp-bd-haus', startBeat: 0, lengthBeats: 4 }] }],
      };
      const d = (await renderProject(proj, library, { limiter: false, toBeat: 4 })).getChannelData(0);
      const spb = 0.6 * 44100;
      return [0, 1, 2, 3].map((b) => { let i = b * spb; while (i < d.length && Math.abs(d[i]) < 0.05) i++; return Math.round(i - b * spb); });
    });
    check('Kick über einen Takt gezogen = vier gleich versetzte Schläge', reps.every((x) => x < 400 && Math.abs(x - reps[0]) <= 2), `Einsatz-Abweichung je Schlag (Frames): ${reps.join(', ')}`);

    // ---------- Regal: Suche, Filter, Favoriten ----------
    await page.fill('#shelf-search', 'kick');
    const kickRows = await page.locator('#library .loop-item').count();
    const kicks = await page.evaluate(() => window.loopwerk.library.list().filter((s) => /kick/i.test(s.name)).length);
    check('Suche „kick“ findet alle Kicks', kickRows === kicks && kicks >= 4, `${kickRows} Treffer`);
    await page.fill('#shelf-search', 'xyzzy');
    const empty = await page.locator('#library .shelf-empty').textContent();
    check('Leere Suche erklärt sich', empty.includes('Keine Sounds gefunden'), empty);
    await page.fill('#shelf-search', '');
    await page.click('#shelf-chips .chip[data-filter="bass"]');
    const bassRows = await page.locator('#library .loop-item').count();
    const basses = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'bass').length);
    check('Filter „Bass“ zeigt nur Bass-Sounds', bassRows === basses, `${bassRows} Einträge`);
    await page.locator('#library .loop-row').first().locator('.loop-fav').click();
    await page.click('#shelf-chips .chip[data-filter="fav"]');
    const favRows = await page.locator('#library .loop-item').count();
    check('Stern markiert einen Favoriten', favRows === 1, `${favRows} Favorit(en)`);
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await page.click('#shelf-chips .chip[data-filter="fav"]');
    const favAfter = await page.locator('#library .loop-item').count();
    const bpmAfter = await page.evaluate(() => [window.loopwerk.store.project.bpm, window.loopwerk.library.bpm]);
    check('Favoriten und Tempo bleiben nach Neuladen erhalten', favAfter === 1 && bpmAfter[0] === 100 && bpmAfter[1] === 100, `Favoriten ${favAfter}, Tempo ${bpmAfter.join('/')}`);

    if (SHOTS) {
      await page.click('#shelf-chips .chip[data-filter="all"]');
      await page.fill('#shelf-search', '');
      await page.screenshot({ path: path.join(SHOT_DIR, 'stufe3-light.png') });
    }
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
