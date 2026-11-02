// Takt-Geber ohne funktionierenden Worker (manche Browser/Seiten blockieren Blob-Worker still, ohne Fehler):
// die Wiedergabe plant trotzdem durchgehend weiter. Fehler beim Einplanen erscheinen als Einblender statt Stille.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    // Worker, der nie antwortet und keinen Fehler meldet
    await page.addInitScript(() => {
      window.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
    });
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready);
    await page.evaluate(() => window.loopwerk.library.catalogReady);
    await page.click('#play-btn');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const { engine } = window.loopwerk;
      return { playing: engine.playing, beat: engine.currentBeat(), scheduled: engine.scheduledUntil ?? null, voices: engine.voices.size, ctxTime: engine.ctx.currentTime };
    });
    // Ohne Takt-Geber wäre nach 2,5 s nichts mehr eingeplant (nur das erste Fenster von 0,15 s)
    const ahead = await page.evaluate(() => {
      const { engine } = window.loopwerk;
      const until = engine.cursorTime ?? engine._cursorTime ?? null;
      return until == null ? null : until - engine.ctx.currentTime;
    });
    check('Ohne antwortenden Worker plant die Wiedergabe weiter (Wächter übernimmt)', r.playing && r.beat > 3 && (ahead == null ? r.voices > 0 : ahead > 0), JSON.stringify({ ...r, ahead }));
    await page.click('#play-btn');

    // Fehler beim Einplanen wird sichtbar
    await page.evaluate(() => { const e = window.loopwerk.engine; e._origTick = e._tick; e._tick = () => { throw new Error('Testfehler'); }; });
    await page.click('#play-btn');
    await page.waitForTimeout(600);
    const hint = await page.evaluate(() => document.getElementById('hint')?.textContent || '');
    check('Fehler beim Einplanen erscheint als Einblender', /Testfehler/.test(hint), hint);
    await page.evaluate(() => { const e = window.loopwerk.engine; e._tick = e._origTick; e.stop?.(); });
    check('Keine unerwarteten Fehler in der Konsole', app.errors.filter((m) => !/Testfehler/.test(m)).length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
  finish();
})();
