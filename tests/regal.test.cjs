// Regal: Wellenform nur in der gewählten Zeile, Längenfilter (Takte / One-Shot), Regal-Töne als Instrumente, großer Griff am Handy.
// node tests/regal.test.cjs [--shots]
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';

(async () => {
  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let { page } = app;
  try {
    // ---------- Längenfilter ----------
    const visible = () => page.evaluate(() => {
      const { library } = window.loopwerk;
      return [...document.querySelectorAll('#library .loop-item')].map((n) => library.get(n.dataset.sampleId)).filter(Boolean)
        .map((s) => ({ kind: s.kind, bars: s.lengthBeats / 4 }));
    });
    await page.click('.shelf-len .seg[data-len="shot"]');
    let v = await visible();
    check('Filter One-Shot: nur Einzelklänge', v.length > 50 && v.every((s) => s.kind !== 'loop'), String(v.length));
    await page.click('.shelf-len .seg[data-len="2"]');
    v = await visible();
    check('Filter 2 Takte: nur Loops mit 2 Takten', v.length > 3 && v.every((s) => s.kind === 'loop' && s.bars > 1 && s.bars <= 2), String(v.length));
    check('Längenfilter lässt „Ordnen“ unberührt', await page.getAttribute('.shelf-sort .seg[data-sort="cat"]', 'aria-pressed') === 'true');
    await page.click('.shelf-len .seg[data-len="2"]');
    check('Noch einmal tippen hebt den Filter auf', await page.getAttribute('.shelf-len .seg[data-len="all"]', 'aria-pressed') === 'true');
    await page.click('.shelf-len .seg[data-len="1"]');
    await page.click('.shelf-len .seg[data-len="all"]');

    // ---------- Wellenform nur in der gewählten Zeile ----------
    check('Ohne Auswahl keine Wellenform im Regal', await page.locator('.loop-wave').count() === 0);
    const first = page.locator('#library .loop-item').first();
    const id = await first.getAttribute('data-sample-id');
    await first.click();
    await page.waitForFunction((sid) => window.loopwerk.engine.preview?.sampleId === sid, id, { timeout: 8000 });
    await page.waitForTimeout(400);
    const row = await page.evaluate((sid) => {
      const waves = [...document.querySelectorAll('.loop-wave')];
      const w = waves[0];
      let lit = 0;
      if (w) {
        const d = w.getContext('2d').getImageData(0, 0, w.width, w.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 20) lit++;
      }
      return { n: waves.length, inRow: w?.parentElement?.dataset.sampleId === sid, lit, shelfLight: !!document.querySelector('.shelf-light') };
    }, id);
    check('Vorhören: genau eine Zeile zeigt ihre Wellenform', row.n === 1 && row.inRow && row.lit > 50, JSON.stringify(row));
    check('Kein Licht mehr über die ganze Leiste', !row.shelfLight);
    if (SHOTS) await page.locator('.shelf').screenshot({ path: `${DIR}/regal-vorhoeren.png` });
    const second = page.locator('#library .loop-item').nth(1);
    const id2 = await second.getAttribute('data-sample-id');
    await second.click();
    await page.waitForTimeout(200);
    check('Neue Auswahl: Wellenform wandert mit', await page.evaluate((sid) => document.querySelectorAll('.loop-wave').length === 1 && document.querySelector('.loop-wave').parentElement.dataset.sampleId === sid, id2));
    await second.click();
    await page.waitForTimeout(150);
    check('Auswahl aufgehoben: Wellenform weg', await page.locator('.loop-wave').count() === 0);

    // ---------- Regal-Töne als Instrumente im Klavier ----------
    const inst = await page.evaluate(async () => {
      const ins = await import('./src/instruments.js');
      const sp = await import('./src/sampler.js');
      const ids = ['vc-marimba', 'vc-xylofon', 'vc-glockenspiel', 'vc-mundharmonika', 'vc-folkharfe', 'vc-klavier'];
      const res = {};
      for (const i of ids) {
        const info = ins.presetInfo(i);
        const loaded = info && await sp.loadInstrument(i);
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        if (loaded) sp.playSampled(ctx, ctx.destination, loaded, 67, 0, 0.5, 1);
        const buf = await ctx.startRendering();
        let p = 0;
        for (const x of buf.getChannelData(0)) p = Math.max(p, Math.abs(x));
        res[i] = +p.toFixed(2);
      }
      return res;
    });
    check('Regal-Töne als Instrumente: alle klingen im Klavier', Object.values(inst).every((p) => p > 0.2 && p <= 1), JSON.stringify(inst));
    check('Im Melodie-Editor wählbar', await page.evaluate(() => [...document.querySelectorAll('option')].some((o) => o.value === 'vc-marimba')));
    // ---------- Master-Amplitude im Hintergrund ----------
    await page.evaluate(() => window.loopwerk.engine.play(16));
    await page.waitForTimeout(2500);
    const mw = await page.evaluate(() => ({ ...window.loopwerk.glow.state.wave, el: !!document.querySelector('canvas.ambient-wave:not([hidden])') }));
    check('Wiedergabe: Master-Amplitude steht im Hintergrund und schlägt zur Ausgabe aus', mw.shown && mw.el && mw.n > 0 && mw.peak > 0.1 && mw.alpha > 0.5, JSON.stringify(mw));
    await page.evaluate(() => window.loopwerk.engine.stop());
    await page.waitForTimeout(700);
    const fading = await page.evaluate(() => window.loopwerk.glow.state.wave.alpha);
    check('Nach dem Stopp blendet sie sanft aus (nicht sofort weg)', fading > 0.05 && fading < 0.9, String(fading));
    await page.waitForFunction(() => !window.loopwerk.glow.state.wave.shown, null, { timeout: 15000 });
    check('… und ist danach ganz weg', await page.evaluate(() => document.querySelector('canvas.ambient-wave').hidden));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: großer Griff ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(600);
    const grip = await page.evaluate(() => {
      const g = document.querySelector('.dock:not([hidden]) > .sheet-grip');
      const r = g?.getBoundingClientRect();
      const b = g && getComputedStyle(g, '::before');
      // Fassbereich: was ein Finger knapp unter dem Griff trifft, gehört noch zum Griff
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.bottom + 10)?.closest('.sheet-grip') === g;
      return { h: r?.height, bar: b && parseFloat(b.width), hit };
    });
    // Filter am Handy: Knopf neben der Suche, klappt die Filter auf, Zahl zeigt aktive Filter, bleibt beim Scrollen oben
    await page.evaluate(() => window.loopwerk.ui.setDock('sounds'));
    await page.waitForTimeout(600);
    const fb = await page.evaluate(() => {
      const s = document.getElementById('shelf-search').getBoundingClientRect();
      const b = document.getElementById('shelf-filter-btn').getBoundingClientRect();
      return { sameRow: Math.abs(s.top - b.top) < 4 && b.left > s.right - 1, hidden: !document.querySelector('.shelf-len').offsetParent };
    });
    check('Handy: Knopf „Filter“ neben der Suche, Filter zunächst zu', fb.sameRow && fb.hidden, JSON.stringify(fb));
    await page.tap('#shelf-filter-btn');
    await page.tap('.shelf-len .seg[data-len="shot"]');
    await page.evaluate(() => { document.querySelector('.shelf').scrollTop = 500; });
    await page.waitForTimeout(200);
    const fo = await page.evaluate(() => {
      const len = document.querySelector('.shelf-len').getBoundingClientRect();
      const sh = document.querySelector('.shelf').getBoundingClientRect();
      return { n: document.getElementById('shelf-filter-n').textContent, visible: len.top >= sh.top && len.bottom <= sh.bottom, expanded: document.getElementById('shelf-filter-btn').getAttribute('aria-expanded') };
    });
    check('Handy: Filter offen bleiben beim Scrollen sichtbar, Zahl zeigt 1 aktiven', fo.n === '1' && fo.visible && fo.expanded === 'true', JSON.stringify(fo));
    await page.tap('.shelf-len .seg[data-len="all"]');
    await page.tap('#shelf-filter-btn');
    await page.evaluate(() => { window.loopwerk.ui.setDock('mixer'); });
    await page.waitForTimeout(600);
    check('Handy: Schubladengriff groß (Strich ≥ 56 px, Fassbereich reicht unter den Griff)', grip.h >= 24 - 0.01 && grip.bar >= 56 && grip.hit, JSON.stringify(grip));
    if (SHOTS) await page.screenshot({ path: `${DIR}/regal-griff-handy.png` });
    await page.evaluate(() => window.loopwerk.ui.setDock('sounds'));
    await page.waitForTimeout(600);
    if (SHOTS) {
      await page.locator('#library .loop-item').first().tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/regal-handy.png` });
    }
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
