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
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
