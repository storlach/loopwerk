// Version 1.9: eine Fachleiste für Handy und Desktop, Rückmeldungen als Einblender statt Hinweiszeile,
// Rückgängig als Taste im Deck, Höhe je Schublade (Editoren und Mixer am Handy oben), Favicon.
// node tests/v19.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1536, height: 960 } });
  let { page } = app;
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
  const visible = (sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0; }, sel);
  try {
    // ---------- Desktop: Fachleiste nur unter dem Arranger ----------
    const bar = await rect('#tabbar');
    const arr = await rect('.arranger');
    const shelf = await rect('.shelf');
    const insp = await rect('#insp');
    check('Desktop: Fachleiste genau unter dem Arranger, nicht unter den Seitenspalten', Math.abs(bar.x - arr.x) < 1 && Math.abs(bar.w - arr.w) < 1 && Math.abs(bar.y - arr.b) < 2 && shelf.b > bar.y && insp.b > bar.y, JSON.stringify({ bar, arr, shelf: shelf.b, insp: insp.b }));
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#tabbar .tab')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id));
    check('Desktop: Reiter Mixer und Editor (Sounds stehen links)', JSON.stringify(tabs) === '["mixer-btn","editor-tab"]', JSON.stringify(tabs));
    check('Desktop: kein Hinweistext, solange es nichts zu melden gibt', !(await visible('#hint')));
    await page.click('#mixer-btn');
    await page.waitForTimeout(550);
    const mx = await rect('#mixer');
    const tab = await rect('#mixer-btn');
    check('Desktop: Mixer-Reiter hängt direkt unter seiner Schublade', Math.abs(mx.b - tab.y) < 2 && tab.x >= mx.x && tab.r <= mx.r, JSON.stringify({ mx, tab }));
    check('Desktop: Schublade öffnet in der Mitte', Math.abs(mx.h / arr.h - 0.5) < 0.02, `${mx.h} / ${arr.h}`);
    // Einblender: erscheint mit einer Meldung, verschwindet von selbst
    await page.evaluate(() => window.loopwerk.ui.flash('Clip geteilt.'));
    await page.waitForTimeout(100);
    const toast = await rect('#hint');
    check('Einblender erscheint über der Leiste, mittig über dem Arranger', await visible('#hint') && toast.b <= bar.y && Math.abs((toast.x + toast.w / 2) - (arr.x + arr.w / 2)) < 2, JSON.stringify(toast));
    await page.waitForTimeout(3700);
    check('Einblender verschwindet wieder', !(await visible('#hint')));
    await page.click('#mixer-btn');
    await page.waitForTimeout(450);
    // Editor-Reiter nennt den Clip
    await page.locator('.clip').first().click();
    check('Desktop: Editor-Reiter nennt den ausgewählten Clip', /^Editor · /.test(await page.locator('#editor-tab-label').textContent()));
    const link = await page.evaluate(() => [...document.querySelectorAll('link[rel="icon"]')].map((l) => l.getAttribute('href')));
    const res = await page.request.get(new URL('assets/icons/favicon.svg', app.url).href);
    check('Favicon (SVG aus den Intro-Balken) ist eingebunden und wird ausgeliefert', link.includes('assets/icons/favicon.svg') && res.ok() && (await res.text()).includes('<svg'), JSON.stringify(link));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v19-desktop.png') });
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: dieselbe Leiste, Rückgängig im Deck ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page = app.page;
    const mtabs = await page.evaluate(() => [...document.querySelectorAll('#tabbar .tab')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id));
    check('Handy: Reiter Sounds, Mixer, Editor, Mehr', JSON.stringify(mtabs) === '["tab-sounds","mixer-btn","editor-tab","tab-more"]', JSON.stringify(mtabs));
    check('Handy: Rückgängig ist eine Taste im Deck, nicht in der Leiste', await page.evaluate(() => !!document.getElementById('undo-btn').closest('.deck') && !document.getElementById('undo-btn').closest('#tabbar')));
    const undo = await rect('#undo-btn');
    check('Handy: Rückgängig-Taste gut treffbar', undo.w >= 44 && undo.h >= 44, JSON.stringify(undo));
    check('Handy: keine Hinweiszeile', !(await visible('#hint')));
    await page.locator('.clip').nth(2).tap();
    check('Handy: Editor-Reiter wird mit Auswahl aktiv (kurz „Editor“)', await page.evaluate(() => !document.getElementById('editor-tab').disabled && document.getElementById('editor-tab-label').textContent === 'Editor'));
    await page.tap('#cb-dup');
    check('Handy: Rückgängig im Deck wirkt', await page.evaluate(() => window.loopwerk.store.canUndo));
    const before = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length);
    await page.tap('#undo-btn');
    check('Handy: Rückgängig nimmt das Duplizieren zurück', await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length) === before - 1);
    // Editor über den Reiter: öffnet oben (100 %), Klaviatur groß
    await page.tap('#tab-sounds');
    await page.waitForTimeout(500);
    await page.tap('#new-melody-btn');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.waitForTimeout(600);
    const pat = await rect('#pattern');
    const marr = await rect('.arranger');
    const roll = await rect('#pat-roll-wrap');
    const key = await rect('#pat-vkeys .vkey');
    check('Handy: Melodie-Editor öffnet oben (100 %)', Math.abs(pat.h / marr.h - 1) < 0.02, `${pat.h} / ${marr.h}`);
    check('Handy: Klavier groß (Piano-Roll ≥ 380 px hoch, Tasten ≥ 70 × 34)', roll.h >= 380 && key.w >= 70 && key.h >= 34, JSON.stringify({ roll, key }));
    check('Handy: Kopf des Editors in einer Zeile ohne Titel und Hinweistext', await page.evaluate(() => getComputedStyle(document.getElementById('pat-title')).display === 'none' && document.getElementById('pat-hint').hidden));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v19-mobil-klavier.png') });
    // Die Sounds-Schublade bleibt in der Mitte
    await page.tap('#editor-tab');
    await page.waitForTimeout(450);
    await page.tap('#tab-sounds');
    await page.waitForTimeout(550);
    const sh = await rect('.shelf');
    check('Handy: Höhe je Schublade (Sounds in der Mitte)', Math.abs(sh.h / marr.h - 0.5) < 0.02, `${sh.h} / ${marr.h}`);
    // Sound auswählen: Einblender mit „Fertig“
    await page.locator('#library .loop-item').first().tap();
    check('Handy: Einsetzen zeigt Einblender mit „Fertig“', await visible('#hint') && await page.locator('#hint-done').isVisible());
    await page.tap('#hint-done');
    check('Handy: „Fertig“ blendet ihn aus', !(await visible('#hint')));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v19-mobil.png') });
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
