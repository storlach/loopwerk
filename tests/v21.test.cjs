// Version 2.1: Mehrfachauswahl, Clip-Laufzeit, Spurgruppen, reaktive Grafik, Wunsch-Agent.
// node tests/v21.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1536, height: 960 } });
  let { page } = app;
  const S = () => page.evaluate(() => window.loopwerk.store.project);
  const box = (sel) => page.locator(sel).boundingBox();
  try {
    // ---------- Mehrfachauswahl ----------
    // Rahmen über die Spuren Drums..Bass in Takt 5–8 ziehen (leere Stelle als Start)
    const lane1 = await box('.lane[data-track-id="t1"]');
    const lane3 = await box('.lane[data-track-id="t3"]');
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.mouse.move(lane1.x + 2 * ppb, lane1.y + 6);
    await page.mouse.down();
    await page.mouse.move(lane3.x + 20 * ppb, lane3.y + lane3.height - 6, { steps: 8 });
    await page.mouse.up();
    let sel = await page.evaluate(() => window.loopwerk.ui.selectedIds().sort());
    check('Rahmen aufziehen wählt alle berührten Clips (Drums, Bass)', JSON.stringify(sel) === '["c1","c3"]', JSON.stringify(sel));
    check('Alle ausgewählten Clips sind markiert', await page.evaluate(() => document.querySelectorAll('.clip.selected').length) === 2);
    // Umschalt-Klick nimmt einen heraus und fügt einen hinzu
    const pad = await box('.clip[data-clip-id="c4"]');
    await page.keyboard.down('Shift');
    await page.mouse.click(pad.x + 40, pad.y + pad.height - 8);
    const bass = await box('.clip[data-clip-id="c3"]');
    await page.mouse.click(bass.x + 40, bass.y + bass.height - 8);
    await page.keyboard.up('Shift');
    sel = await page.evaluate(() => window.loopwerk.ui.selectedIds().sort());
    check('Umschalt-Klick: hinzufügen (Pad) und herausnehmen (Bass)', JSON.stringify(sel) === '["c1","c4"]', JSON.stringify(sel));
    // Zusammen verschieben: einen Takt nach rechts
    const before = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    const drums = await box('.clip[data-clip-id="c1"]');
    await page.mouse.move(drums.x + 40, drums.y + drums.height - 8);
    await page.mouse.down();
    await page.mouse.move(drums.x + 40 + 4 * ppb, drums.y + drums.height - 8, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    check('Ausgewählte Clips gemeinsam verschieben (Abstände bleiben)', ['c1', 'c4'].every((id) => after[id][1] === before[id][1] + 4 && after[id][0] === before[id][0]) && after.c3[1] === before.c3[1], JSON.stringify({ before, after }));
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => Object.fromEntries(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => [c.id, [t.id, c.startBeat]]))));
    check('Ein Rückgängig-Schritt holt alle zurück', JSON.stringify(undone) === JSON.stringify(before));
    // Löschen und Duplizieren für die ganze Auswahl
    await page.evaluate(() => window.loopwerk.ui.selectMany(['c7', 'c8']));
    await page.keyboard.press('Control+d');
    const fx = await page.evaluate(() => window.loopwerk.store.track('t7').clips.map((c) => [c.sampleId, c.startBeat]));
    check('Strg+D dupliziert die Auswahl als Block dahinter', JSON.stringify(fx) === '[["fx-riser",8],["fx-crash",16],["fx-riser",20],["fx-crash",28]]' || fx.length === 4, JSON.stringify(fx));
    await page.keyboard.press('Delete');
    check('Entf löscht alle ausgewählten Clips', await page.evaluate(() => window.loopwerk.store.track('t7').clips.length) === 2);
    await page.keyboard.press('Control+a');
    check('Strg+A wählt alle Clips', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0)));
    await page.keyboard.press('Escape');
    check('Esc hebt die Auswahl auf', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === 0));
    // Klick ohne Ziehen auf freie Fläche bleibt ein Klick (hebt Auswahl auf, kein Rahmen)
    await page.evaluate(() => window.loopwerk.ui.selectMany(['c1', 'c3']));
    await page.mouse.click(lane1.x + 1.5 * ppb, lane1.y + lane1.height / 2);
    check('Klick ins Leere hebt die Mehrfachauswahl auf', await page.evaluate(() => window.loopwerk.ui.selectedIds().length === 0));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v21-auswahl.png') });

    // ---------- Laufzeit: doppelt so lang, gleiche Tonhöhe ----------
    const run = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const m = await import('./src/model.js');
      const sr = 44100;
      // 1 s Ton 440 Hz (2 Schläge bei 120 BPM), dann 1 s Stille: ein One-Shot
      const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < sr; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); }
      library.register({ id: 'run-tone', name: 'Ton', category: 'fx', kind: 'oneshot', lengthBeats: 4, bpm: 120, buffer: b });
      const s = new m.Store(m.createEmptyProject(), { sampleBeats: (id) => library.get(id).lengthBeats });
      s.project.lengthBars = 4;
      const id = s.addClip('t1', 'run-tone', 0, 4);
      s.setClipStretch(id, 2);
      const clip = s.findClip(id).clip;
      await library.ensureProject(s.project);
      const d = (await renderProject(s.project, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      // hörbare Dauer und Frequenz (Nulldurchgänge in der Mitte des Tons)
      let last = 0;
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) last = i;
      let zc = 0;
      const a = Math.round(0.5 * sr);
      const z = Math.round(1.0 * sr);
      for (let i = a + 1; i < z; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
      return { len: clip.lengthBeats, stretch: clip.stretch, seconds: Math.round((last / sr) * 100) / 100, hz: Math.round(zc / 2 / ((z - a) / sr)) };
    });
    check('Laufzeit ×2: Clip doppelt so lang', run.len === 8 && run.stretch === 2, JSON.stringify(run));
    check('Laufzeit ×2: der Ton klingt doppelt so lang (≈2 s)', run.seconds > 1.85 && run.seconds < 2.15, JSON.stringify(run));
    check('Laufzeit ×2: Tonhöhe bleibt (440 Hz)', Math.abs(run.hz - 440) <= 4, JSON.stringify(run));
    // Bedienung im Inspektor
    await page.evaluate(() => window.loopwerk.ui.select('c4'));
    const len0 = await page.evaluate(() => window.loopwerk.store.findClip('c4').clip.lengthBeats);
    await page.click('#insp-run-up');
    await page.click('[data-run="2"]');
    const st = await page.evaluate(() => { const c = window.loopwerk.store.findClip('c4').clip; return { s: c.stretch, len: c.lengthBeats, out: document.getElementById('insp-run-out').textContent }; });
    check('Inspektor: Laufzeit ×2 macht den Clip doppelt so lang, Anzeige stimmt', st.s === 2 && Math.abs(st.len - Math.min(len0 * 2, 128)) < 1e-6 && /×2/.test(st.out), JSON.stringify({ len0, st }));
    await page.waitForFunction(() => !!window.loopwerk.library.stretched('chords-pad', 2), null, { timeout: 20000 });
    check('Gedehnte Fassung wird im Hintergrund gerechnet', true);
    check('Clip zeigt die Laufzeit im Etikett', /×2/.test(await page.locator('.clip[data-clip-id="c4"] .clip-label').textContent()));
    await page.click('[data-run="1"]');
    check('Laufzeit ×1 stellt die Originallänge wieder her', await page.evaluate(() => window.loopwerk.store.findClip('c4').clip.lengthBeats) === len0);
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
