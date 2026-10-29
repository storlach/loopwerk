// Version 1.4: feineres Raster, Zoom, Spur-Funktionen, Techno-Sounds, Genres, neue Effekte, Drumpad, Klaviatur.
// node tests/v14.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp();
  let { page } = app;
  const clipOn = (trackId) => page.evaluate((t) => window.loopwerk.store.track(t).clips.map((c) => ({ ...c })), trackId);
  const drag = async (x, y, dx, dy, opts = {}) => {
    await page.mouse.move(x, y);
    if (opts.shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    if (opts.shift) await page.keyboard.up('Shift');
  };
  try {
    // ---------- Raster ----------
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
      document.getElementById('arr-scroll').scrollLeft = 0;
    });
    const opts = await page.evaluate(() => [...document.querySelectorAll('#snap-sel option')].map((o) => o.value));
    check('Raster bis 1/16 und frei wählbar', JSON.stringify(opts) === JSON.stringify(['4', '2', '1', '0.5', '0.25', '0']), opts.join(','));
    check('Voreinstellung ist „Schlag“', await page.evaluate(() => window.loopwerk.ui.snapBeats === 1 && document.getElementById('snap-sel').value === '1'));

    await page.evaluate(() => window.loopwerk.store.addClip('t1', 'test-click', 0, 4));
    await page.selectOption('#snap-sel', '0.25');
    let ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    let cb = await page.locator('.lane[data-track-id="t1"] .clip').first().boundingBox();
    await drag(cb.x + 20, cb.y + cb.height / 2, 1.3 * ppb, 0);
    let c = (await clipOn('t1'))[0];
    check('1/16-Raster: Clip rastet auf Sechzehntel', c.startBeat === 1.25, String(c.startBeat));

    await page.selectOption('#snap-sel', '1');
    cb = await page.locator('.lane[data-track-id="t1"] .clip').first().boundingBox();
    await drag(cb.x + 20, cb.y + cb.height / 2, 0.4 * ppb, 0, { shift: true });
    c = (await clipOn('t1'))[0];
    const frac = c.startBeat * 64;
    check('Umschalt beim Ziehen: frei (1/64 Schlag)', c.startBeat > 1.25 && c.startBeat < 2 && Math.abs(frac - Math.round(frac)) < 1e-9 && c.startBeat * 4 % 1 !== 0, String(c.startBeat));

    // Alt + Pfeil schiebt um einen Rasterschritt
    const before = c.startBeat;
    await page.keyboard.press('Alt+ArrowRight');
    c = (await clipOn('t1'))[0];
    check('Alt+→ schiebt den Clip zur nächsten Rasterlinie', c.startBeat === Math.floor(before) + 1, `${before} → ${c.startBeat}`);
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    c = (await clipOn('t1'))[0];
    check('Alt+← schiebt um je einen Schritt zurück', c.startBeat === Math.floor(before) - 1, String(c.startBeat));

    // Raster bleibt nach Neuladen
    await page.selectOption('#snap-sel', '0.5');
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready);
    await page.evaluate(() => { const { library } = window.loopwerk; const sr = 44100; const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr }); b.getChannelData(0)[0] = 1; library.register({ id: 'test-click', name: 'Klick', category: 'fx', lengthBeats: 4, bpm: 120, buffer: b }); });
    check('Raster wird gemerkt', await page.evaluate(() => window.loopwerk.ui.snapBeats === 0.5 && document.getElementById('snap-sel').value === '0.5'));

    // Klick setzt einen ausgewählten Sound auf das Raster
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
      window.loopwerk.ui.arm('test-click');
      document.getElementById('arr-scroll').scrollLeft = 0;
    });
    const lane = await page.locator('.lane[data-track-id="t2"]').boundingBox();
    await page.mouse.click(lane.x + 2.7 * ppb, lane.y + lane.height / 2);
    c = (await clipOn('t2'))[0];
    check('Klick auf die Spur rastet im 1/8-Raster', c && c.startBeat === 2.5, String(c?.startBeat));
    await page.keyboard.press('Escape');

    // ---------- Zoom ----------
    const z0 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    const z1 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    check('Zoom vergrößert weit über das alte Maximum', z1 > 64 && z1 > z0, `${z0} → ${z1}`);
    const fine = await page.evaluate(() => document.querySelector('.arr-grid').classList.contains('fine'));
    check('Bei großem Zoom erscheinen Sechzehntel-Linien', fine);
    const clipW = await page.locator('.lane[data-track-id="t2"] .clip').first().evaluate((n) => n.getBoundingClientRect().width);
    check('Clips wachsen mit dem Zoom', Math.abs(clipW - 4 * z1) < 2, `${clipW} px`);

    // Strg + Mausrad zoomt um den Mauszeiger: der Schlag unter dem Zeiger bleibt stehen
    const arr = await page.locator('#arr-scroll').boundingBox();
    const mx = arr.x + arr.width * 0.6;
    const beatAt = () => page.evaluate((x) => {
      const r = document.getElementById('arr-scroll');
      const lane = document.querySelector('.lane').getBoundingClientRect();
      return (x - lane.left) / window.loopwerk.ui.pxPerBeat;
    }, mx);
    const b0 = await beatAt();
    await page.mouse.move(mx, arr.y + 80);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const z2 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    const b1 = await beatAt();
    check('Strg+Mausrad verkleinert', z2 < z1, `${z1} → ${z2}`);
    check('Schlag unter dem Mauszeiger bleibt stehen', Math.abs(b1 - b0) < 0.3, `${b0.toFixed(2)} → ${b1.toFixed(2)}`);
    for (let i = 0; i < 12; i++) await page.click('#zoom-out');
    const zmin = await page.evaluate(() => ({ ppb: window.loopwerk.ui.pxPerBeat, marks: document.querySelectorAll('.bar-mark').length, bars: window.loopwerk.store.project.lengthBars }));
    check('Ganz klein: mindestens 4 px pro Schlag, Taktzahlen ausgedünnt', zmin.ppb >= 4 && zmin.marks < zmin.bars, JSON.stringify(zmin));
    for (let i = 0; i < 20; i++) await page.click('#zoom-in');
    const zmax = await page.evaluate(() => {
      const cv = document.querySelector('.clip-wave');
      return { ppb: window.loopwerk.ui.pxPerBeat, canvas: cv.width };
    });
    check('Ganz groß: höchstens 192 px pro Schlag, Wellenform bleibt zeichenbar', zmax.ppb <= 192 && zmax.canvas > 0 && zmax.canvas <= 16000, JSON.stringify(zmax));
    await page.evaluate(() => { window.loopwerk.ui.pxPerBeat = 24; window.loopwerk.arranger.render(); });

    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Zwei-Finger-Zoom am Handy ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    const cdp = await page.context().newCDPSession(page);
    const a = await page.locator('#arr-scroll').boundingBox();
    const cy = a.y + a.height / 2;
    const cx = a.x + a.width * 0.6;
    const p0 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - 5 * i, y: cy, id: 1 }, { x: cx + 30 + 5 * i, y: cy, id: 2 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const p1 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    check('Finger auseinander zoomt hinein', p1 > p0 * 1.8, `${p0} → ${p1}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v14-zoom-mobil.png') });
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
