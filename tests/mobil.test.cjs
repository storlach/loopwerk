// Bedienung am Handy: Sound-Regal als Akkordeon, Antippen statt Ziehen. node tests/mobil.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  const expanded = (cat) => page.locator(`#shelf-cat-${cat}`).getAttribute('aria-expanded');
  try {
    check('Handy: anfangs nur „Drums“ offen', await expanded('drums') === 'true' && await expanded('bass') === 'false' && await expanded('synth') === 'false');
    const shelf = await page.evaluate(() => {
      const l = document.getElementById('library');
      return { overflow: getComputedStyle(l).overflowY, inner: l.scrollHeight - l.clientHeight };
    });
    check('Kein eigener Scrollbereich im Regal (die Seite scrollt)', shelf.overflow === 'visible' && shelf.inner <= 1, JSON.stringify(shelf));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-regal.png') });

    await page.tap('#shelf-cat-bass');
    check('Antippen öffnet „Bass“ und schließt „Drums“', await expanded('bass') === 'true' && await expanded('drums') === 'false');
    const visibleItems = await page.locator('#library .loop-item:visible').count();
    check('Nur die Bass-Sounds sind sichtbar', visibleItems === 6, `${visibleItems} sichtbar`);
    const size = await page.locator('#library .loop-item:visible').first().boundingBox();
    const header = await page.locator('#shelf-cat-bass').boundingBox();
    check('Tippziele groß genug (≥ 40 px)', size.height >= 40 && header.height >= 44, `Sound ${size.height} px, Kopf ${header.height} px`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-bass.png') });

    // Sound antippen (anhören + auswählen), dann in eine Spur tippen
    await page.locator('#library .loop-item', { hasText: 'Pulse Bass A' }).tap();
    const armed = await page.evaluate(() => window.loopwerk.ui.armedSampleId);
    check('Antippen wählt den Sound aus', armed === 'bass-pulse', armed);
    const lane = page.locator('.lane[data-track-id="t8"]');
    await lane.scrollIntoViewIfNeeded();
    const lb = await lane.boundingBox();
    const head = await page.locator('.track-row').nth(7).locator('.track-head').boundingBox();
    await page.touchscreen.tap(head.x + head.width + 30, lb.y + lb.height / 2);
    const placed = await page.evaluate(() => window.loopwerk.store.track('t8').clips.map((c) => c.sampleId));
    check('Antippen einer Spur setzt den Sound ein', placed.includes('bass-pulse'), JSON.stringify(placed));

    // Suche öffnet alle Treffer-Gruppen
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.fill('#shelf-search', 'snare');
    const forced = await page.evaluate(() => [...document.querySelectorAll('.shelf-cat')].map((b) => [b.id, b.getAttribute('aria-expanded'), b.disabled]));
    check('Suche zeigt alle Treffer aufgeklappt', forced.length >= 1 && forced.every(([, e, d]) => e === 'true' && d), JSON.stringify(forced));
    await page.fill('#shelf-search', '');
    check('Nach der Suche gilt wieder der eigene Zustand', await expanded('bass') === 'true' && await expanded('drums') === 'false');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Keine horizontale Seitenverschiebung', overflow <= 0, `${overflow}px`);

    // Zustand wird gemerkt
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    check('Offene Kategorie bleibt nach Neuladen erhalten', await expanded('bass') === 'true' && await expanded('drums') === 'false');

    // Desktop: mehrere Gruppen gleichzeitig offen
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.waitForTimeout(100);
    await page.click('#shelf-cat-synth');
    check('Desktop: mehrere Kategorien können offen sein', await expanded('bass') === 'true' && await expanded('synth') === 'true');
    await page.click('#shelf-cat-synth');
    check('Desktop: Kopf antippen klappt wieder zu', await expanded('synth') === 'false');

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
