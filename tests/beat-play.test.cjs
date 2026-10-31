// Beat- und Melodie-Editor: „Anhören“ läuft im Loop, der klingende Schritt leuchtet (auch beim Song), Änderungen hört man sofort.
// node tests/beat-play.test.cjs [--shots]
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(() => document.getElementById('ltab-create').click());
    await page.click('[data-create="beat"]');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.waitForTimeout(400);
    const lit = () => page.evaluate(() => [...new Set([...document.querySelectorAll('#pat-drums .pat-cell.now')].map((c) => c.dataset.step))]);
    check('Ohne Wiedergabe leuchtet kein Schritt', (await lit()).length === 0);
    await page.click('#pat-play');
    const dur = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return window.loopwerk.engine.preview?.duration;
    });
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < dur * 1000 + 1500) {
      const l = await lit();
      if (l.length === 1) seen.add(Number(l[0]));
      await page.waitForTimeout(60);
    }
    const pv = await page.evaluate(() => ({ loop: !!window.loopwerk.engine.preview?.loop, label: document.getElementById('pat-play').textContent }));
    check('Anhören läuft im Loop (auch nach Ende des Patterns)', pv.loop && /Stopp/.test(pv.label), JSON.stringify(pv));
    check('Genau ein Schritt leuchtet, er wandert über das Raster', seen.size >= 6, [...seen].sort((a, b) => a - b).join(','));
    if (SHOTS) await page.locator('#pattern').screenshot({ path: `${DIR}/beat-play.png` });
    // Schritt setzen während des Loops: neuer Klang, Loop läuft weiter
    const rev0 = await page.evaluate(() => window.loopwerk.engine.preview?.rev);
    await page.click('#pat-drums .pat-cell[data-row="clap"][data-step="2"]');
    await page.waitForFunction((r) => window.loopwerk.engine.preview?.rev !== r && window.loopwerk.engine.preview?.loop, rev0, { timeout: 8000 });
    check('Schritt ändern: weiter im Loop mit neuem Klang', true);
    await page.click('#pat-play');
    await page.waitForTimeout(200);
    check('Stopp: Wiedergabe aus, nichts leuchtet', await page.evaluate(() => !window.loopwerk.engine.preview) && (await lit()).length === 0);
    // Song: Clip dieses Patterns unter der Marke → Schritte leuchten mit
    const placed = await page.evaluate(async () => {
      const { store, patternEditor, engine } = window.loopwerk;
      const sid = 'pat-' + patternEditor.id;
      const clip = store.project.tracks.flatMap((t) => t.clips).find((c) => c.sampleId === sid);
      if (!clip) return false;
      await engine.play(clip.startBeat);
      return true;
    });
    if (placed) {
      await page.waitForTimeout(900);
      const l = await lit();
      check('Beim Abspielen des Songs leuchtet der Schritt im Editor mit', l.length === 1, JSON.stringify(l));
      await page.evaluate(() => window.loopwerk.engine.stop());
    } else check('Pattern-Clip im Song gefunden', false);
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
