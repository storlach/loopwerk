// Bedienung am Handy: kompaktes Deck, Leiste unten, ein Fach für Regal und Docks, Clip-Werkzeuge,
// Antippen statt Ziehen. node tests/mobil.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  const expanded = (cat) => page.locator(`#shelf-cat-${cat}`).getAttribute('aria-expanded');
  const box = (sel) => page.locator(sel).first().boundingBox();
  const lw = () => page.evaluate(() => {
    const { store, ui } = window.loopwerk;
    return { tracks: store.project.tracks.map((t) => t.clips.map((c) => ({ ...c }))), sel: ui.selectedClipId, armed: ui.armedSampleId, dock: ui.dock, undo: store.undoStack.length };
  });
  // Wischgeste mit echten Touch-Ereignissen (Finger runter, ziehen, loslassen)
  const cdp = await page.context().newCDPSession(page);
  async function swipe(x, y, dx, dy, steps = 12) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
  }
  try {
    // ---------- Startansicht ----------
    const start = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return {
        page: document.documentElement.scrollHeight - innerHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        deck: r('.deck').height, arrTop: r('.arranger').top, arrH: r('.arranger').height,
        tabsBottom: r('#tabbar').bottom, h: innerHeight, shelf: getComputedStyle(document.querySelector('.shelf')).display,
      };
    });
    check('Handy: App passt auf den Bildschirm, die Seite scrollt nicht', start.page <= 1, JSON.stringify(start));
    check('Kompaktes Deck (eine Zeile, ≤ 64 px)', start.deck <= 64, `${start.deck} px`);
    check('Arranger direkt unter dem Deck und groß', start.arrTop <= 64 && start.arrH >= 500, `oben ${start.arrTop}, Höhe ${start.arrH}`);
    check('Leiste unten am Bildschirmrand', Math.abs(start.tabsBottom - start.h) <= 1, `${start.tabsBottom}/${start.h}`);
    check('Sound-Regal anfangs eingeklappt', start.shelf === 'none', start.shelf);
    const tabSizes = await page.evaluate(() => [...document.querySelectorAll('#tabbar .tab')].map((b) => Math.round(Math.min(b.offsetWidth, b.offsetHeight))));
    check('Leiste: vier Knöpfe, alle ≥ 44 px', tabSizes.length === 4 && tabSizes.every((s) => s >= 44), JSON.stringify(tabSizes));
    const moved = await page.evaluate(() => ['rec-btn', 'metro-btn', 'zoom-in', 'snap-sel', 'save-btn', 'export-btn', 'new-btn'].every((id) => document.getElementById(id).closest('#more')));
    check('Seltene Deck-Knöpfe liegen unter „Mehr“', moved);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-start.png') });

    // ---------- Sounds: Fach öffnen, Akkordeon ----------
    await page.tap('#tab-sounds');
    const opened = await page.evaluate(() => ({
      dock: window.loopwerk.ui.dock, pressed: document.getElementById('tab-sounds').getAttribute('aria-pressed'),
      shelf: document.querySelector('.shelf').getBoundingClientRect().height, arr: document.querySelector('.arranger').getBoundingClientRect().height,
    }));
    check('„Sounds“ öffnet das Regal im Fach', opened.dock === 'sounds' && opened.pressed === 'true' && opened.shelf > 200, JSON.stringify(opened));
    check('Arranger bleibt über dem Regal sichtbar', opened.arr >= 132, `${opened.arr} px`);
    check('Anfangs nur „Drums“ offen', await expanded('drums') === 'true' && await expanded('bass') === 'false' && await expanded('synth') === 'false');
    const shelf = await page.evaluate(() => {
      const l = document.getElementById('library');
      return { overflow: getComputedStyle(l).overflowY, inner: l.scrollHeight - l.clientHeight, panel: getComputedStyle(document.querySelector('.shelf')).overflowY };
    });
    check('Das Fach scrollt als Ganzes, keine verschachtelte Liste', shelf.overflow === 'visible' && shelf.inner <= 1 && shelf.panel === 'auto', JSON.stringify(shelf));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-regal.png') });

    await page.tap('#shelf-cat-bass');
    check('Antippen öffnet „Bass“ und schließt „Drums“', await expanded('bass') === 'true' && await expanded('drums') === 'false');
    const visibleItems = await page.locator('#library .loop-item:visible').count();
    check('Nur die Bass-Sounds sind sichtbar', visibleItems === 6, `${visibleItems} sichtbar`);
    const size = await box('#library .loop-item:visible');
    const header = await box('#shelf-cat-bass');
    const search = await box('#shelf-search');
    check('Tippziele im Regal ≥ 44 px', size.height >= 44 && header.height >= 44 && search.height >= 44, `Sound ${size.height}, Kopf ${header.height}, Suche ${search.height}`);

    // ---------- Sound einsetzen, ohne die Seite zu scrollen ----------
    await page.locator('#library .loop-item', { hasText: 'Pulse Bass A' }).tap();
    check('Antippen wählt den Sound aus', (await lw()).armed === 'bass-pulse');
    const hint = await page.locator('#hint-text').textContent();
    check('Hinweis erklärt den nächsten Schritt in Fingersprache', hint.includes('Tippe in eine Spur'), hint);
    check('„Fertig“ beendet das Einsetzen (statt Esc)', await page.locator('#hint-done').isVisible());
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-einsetzen.png') });
    const lane = await box('.lane[data-track-id="t2"]');
    const head = await box('.track-row:nth-child(2) .track-head');
    await page.touchscreen.tap(head.x + head.width + 20, lane.y + lane.height / 2);
    let s = await lw();
    check('Antippen einer sichtbaren Spur setzt den Sound ein', s.tracks[1].some((c) => c.sampleId === 'bass-pulse'), JSON.stringify(s.tracks[1]));
    check('Dabei scrollt die Seite nicht', await page.evaluate(() => scrollY === 0));
    await page.tap('#hint-done');
    s = await lw();
    check('Nach „Fertig“ ist kein Sound mehr ausgewählt', !s.armed && !(await page.locator('#hint-done').isVisible()));
    const placedId = s.tracks[1].find((c) => c.sampleId === 'bass-pulse').id;
    check('Der eingesetzte Clip ist ausgewählt', s.sel === placedId);
    check('Bei offenem Regal bleiben die Clip-Werkzeuge weg (Platz für den Arranger)', !(await page.locator('#clipbar').isVisible()));

    // Suche öffnet alle Treffer-Gruppen
    await page.fill('#shelf-search', 'snare');
    const forced = await page.evaluate(() => [...document.querySelectorAll('.shelf-cat')].map((b) => [b.id, b.getAttribute('aria-expanded'), b.disabled]));
    check('Suche zeigt alle Treffer aufgeklappt', forced.length >= 1 && forced.every(([, e, d]) => e === 'true' && d), JSON.stringify(forced));
    await page.fill('#shelf-search', '');
    check('Nach der Suche gilt wieder der eigene Zustand', await expanded('bass') === 'true' && await expanded('drums') === 'false');
    await page.tap('#tab-sounds');
    check('Nochmal „Sounds“ schließt das Fach', (await lw()).dock === null);
    check('Ohne Fach erscheinen die Clip-Werkzeuge für den ausgewählten Clip', await page.locator('#clipbar').isVisible());

    // ---------- Wischen über Clips scrollt, statt sie zu verschieben ----------
    await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.arranger.render(); });
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 4 * 4 * window.loopwerk.ui.pxPerBeat; });
    const before = await lw();
    const pad = await box('.lane[data-track-id="t4"] .clip');
    const scroll0 = await page.evaluate(() => document.getElementById('arr-scroll').scrollLeft);
    await swipe(Math.max(pad.x, 140) + 100, pad.y + pad.height / 2, -150, 0);
    const after = await lw();
    const scroll1 = await page.evaluate(() => document.getElementById('arr-scroll').scrollLeft);
    check('Wischen über einen Clip ändert nichts am Song', JSON.stringify(after.tracks) === JSON.stringify(before.tracks) && after.undo === before.undo);
    check('Wischen über einen Clip scrollt den Arranger', scroll1 > scroll0 + 50, `${scroll0} → ${scroll1}`);

    // ---------- Clip antippen → Werkzeuge ----------
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });
    const riser = await box('.lane[data-track-id="t7"] .clip');
    await page.touchscreen.tap(Math.max(riser.x, 140) + 40, riser.y + 8);
    s = await lw();
    const riserId = s.tracks[6][0].id;
    check('Antippen wählt den Clip aus', s.sel === riserId, s.sel);
    const cb = await page.evaluate(() => [...document.querySelectorAll('#clipbar .cbtn')].map((b) => [b.id, Math.round(b.offsetHeight), Math.round(b.offsetWidth)]));
    check('Clip-Werkzeuge: Bearbeiten, Teilen, Duplizieren, Löschen, Pegel – alle ≥ 44 px hoch', cb.length === 5 && cb.every(([, h]) => h >= 44), JSON.stringify(cb));

    await page.tap('#cb-levels');
    check('„Pegel“ zeigt Regler für Lautstärke und Fades', await page.locator('#clip-levels').isVisible() && (await box('#lvl-gain')).height >= 44);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-clip.png') });
    const undo0 = (await lw()).undo;
    for (const v of ['0.8', '0.6', '0.5']) await page.locator('#lvl-gain').fill(v);
    await page.locator('#lvl-in').fill('2');
    s = await lw();
    const riserClip = s.tracks[6].find((c) => c.id === riserId);
    check('Regler ändern Lautstärke und Einblenden am Clip', riserClip.gain === 0.5 && riserClip.fadeInBeats === 2, JSON.stringify(riserClip));
    check('Mehrere Reglerbewegungen sind ein Rückgängig-Schritt je Regler', s.undo - undo0 === 2, `${s.undo - undo0} Schritte`);
    check('Wertanzeige in dB', (await page.locator('#lvl-gain-out').textContent()).includes('dB'));
    await page.tap('#tab-undo');
    await page.tap('#tab-undo');
    const restored = (await lw()).tracks[6].find((c) => c.id === riserId);
    check('„Rückgängig“ in der Leiste nimmt beides zurück', (restored.gain ?? 1) === 1 && !restored.fadeInBeats, JSON.stringify(restored));
    await page.tap('#cb-levels');

    const count = async () => (await lw()).tracks[6].filter((c) => c.sampleId === 'fx-riser').length;
    const n0 = await count();
    await page.tap('#cb-dup');
    check('„Duplizieren“ legt eine Kopie dahinter', await count() === n0 + 1);
    await page.tap('#cb-del');
    check('„Löschen“ entfernt den ausgewählten Clip', await count() === n0);
    await page.tap('#tab-undo');
    check('„Rückgängig“ holt ihn zurück', await count() === n0 + 1);
    await page.tap('#tab-undo');
    await page.evaluate((id) => { const c = window.loopwerk.store.findClip(id).clip; window.loopwerk.engine.setPosition(c.startBeat + 4); window.loopwerk.arranger.select(id); }, riserId);
    await page.tap('#cb-split');
    check('„Teilen“ teilt an der Abspielmarke', await count() === n0 + 1, `${await count()} Clips`);
    await page.tap('#tab-undo');
    await page.evaluate((id) => window.loopwerk.arranger.select(id), riserId);

    // Ausgewählter Clip lässt sich ziehen
    const sel = await box('.clip.selected');
    const start0 = (await lw()).tracks[6].find((c) => c.id === riserId).startBeat;
    await swipe(Math.max(sel.x, 140) + 30, sel.y + 8, 96, 0);
    const start1 = (await lw()).tracks[6].find((c) => c.id === riserId)?.startBeat;
    check('Ein ausgewählter Clip lässt sich mit dem Finger verschieben', start1 === start0 + 4, `${start0} → ${start1}`);
    await page.tap('#tab-undo');

    // ---------- Fächer: immer nur eins ----------
    await page.tap('#tab-mixer');
    s = await lw();
    check('„Mixer“ öffnet den Mixer im Fach', s.dock === 'mixer' && await page.locator('#mixer').isVisible());
    check('Bei offenem Mixer sind Regal und Clip-Werkzeuge weg', !(await page.locator('.shelf').isVisible()) && !(await page.locator('#clipbar').isVisible()));
    const fx = await box('#mixer .fx-toggle');
    check('Effekt-Schalter im Mixer gut treffbar', fx.height >= 32, `${fx.height} px`);
    await page.tap('#tab-more');
    check('„Mehr“ ersetzt den Mixer', (await lw()).dock === 'more' && !(await page.locator('#mixer').isVisible()) && await page.locator('#more').isVisible());
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-mehr.png') });
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.tap('#zoom-in');
    check('Zoom aus „Mehr“ wirkt', await page.evaluate(() => window.loopwerk.ui.pxPerBeat) > ppb);
    await page.tap('#zoom-out');
    await page.tap('#export-btn');
    check('„Exportieren“ aus „Mehr“ öffnet den Export im Fach', (await lw()).dock === 'export' && await page.locator('#ex-go').isVisible());
    await page.tap('#export-close');

    // ---------- Beat-Editor ----------
    await page.tap('#tab-sounds');
    await page.tap('#new-beat-btn');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    const cell = page.locator('#pat-drums .pat-cell[data-row="clap"][data-step="2"]');
    const cellBox = await cell.boundingBox();
    check('Beat-Editor: Felder ≥ 36 px', cellBox.width >= 36 && cellBox.height >= 40, `${cellBox.width}×${cellBox.height}`);
    await cell.tap();
    check('Feld antippen setzt einen Schlag', await cell.getAttribute('aria-pressed') === 'true');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-beat.png') });

    // ---------- Melodie-Editor (Piano-Roll) ----------
    await page.tap('#tab-sounds');
    await page.tap('#new-melody-btn');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-roll-wrap').hidden);
    await page.waitForTimeout(200);
    const notes = () => page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes.length);
    const wrap = await box('#pat-roll-wrap');
    const n1 = await notes();
    await page.touchscreen.tap(wrap.x + 120, wrap.y + 60);
    check('Piano-Roll: Antippen setzt eine Note', await notes() === n1 + 1);
    await page.touchscreen.tap(wrap.x + 120, wrap.y + 60);
    check('Piano-Roll: nochmal Antippen löscht sie', await notes() === n1);
    const top0 = await page.evaluate(() => document.getElementById('pat-roll-wrap').scrollTop);
    await swipe(wrap.x + 150, wrap.y + wrap.height - 20, 0, -150);
    const top1 = await page.evaluate(() => document.getElementById('pat-roll-wrap').scrollTop);
    check('Piano-Roll: Wischen blättert durch die Tonhöhen, ohne Noten zu setzen', top1 > top0 + 50 && await notes() === n1, `${top0} → ${top1}`);
    check('Schritt-Eingabe (braucht Tastatur) ist am Handy ausgeblendet', !(await page.locator('#pat-rec').isVisible()));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-melodie.png') });
    await page.tap('#pattern-close');

    // ---------- Spurköpfe ----------
    const mute = await box('.track-row:nth-child(1) .tbtn-mute');
    const hitAbove = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.tbtn-mute'), [mute.x + mute.width / 2, mute.y - 5]);
    check('Stumm-Knopf: sichtbar ≥ 30 px, Trefferfläche ≥ 44 px', mute.height >= 30 && mute.width >= 36 && hitAbove, `${mute.width}×${mute.height}`);
    await page.locator('.track-row:nth-child(1) .track-name').tap();
    check('Spurname antippen öffnet das Umbenennen', await page.locator('#name-t1').isVisible());
    await page.locator('#name-t1').fill('Schlagzeug');
    await page.locator('#name-t1').press('Enter');
    check('Spur umbenannt', await page.evaluate(() => window.loopwerk.store.track('t1').name) === 'Schlagzeug');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Keine horizontale Seitenverschiebung', overflow <= 0, `${overflow}px`);

    // ---------- Dunkel ----------
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(100);
    const dark = await page.evaluate(() => ({ tabs: getComputedStyle(document.getElementById('tabbar')).backgroundColor, hint: getComputedStyle(document.getElementById('hint')).backgroundColor }));
    check('Dunkel: Leiste und Hinweiszeile nutzen die dunklen Tokens', dark.tabs === 'rgb(11, 15, 21)' && dark.hint === 'rgb(23, 30, 40)', JSON.stringify(dark));
    if (SHOTS) {
      await page.tap('#tab-sounds');
      await page.screenshot({ path: path.join(SHOT_DIR, 'mobil-dunkel.png') });
      await page.tap('#tab-sounds');
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // Zustand wird gemerkt
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    check('Offene Kategorie bleibt nach Neuladen erhalten', await expanded('bass') === 'true' && await expanded('drums') === 'false');

    // ---------- Desktop bleibt, wie er war ----------
    await page.tap('#tab-more');
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.waitForTimeout(150);
    const desk = await page.evaluate(() => ({
      back: ['rec-btn', 'metro-btn', 'zoom-in', 'save-btn'].every((id) => document.getElementById(id).closest('.deck')),
      tabs: getComputedStyle(document.getElementById('tabbar')).display,
      shelf: getComputedStyle(document.querySelector('.shelf')).display,
      dock: window.loopwerk.ui.dock,
      order: [...document.querySelector('.deck .group[aria-label="Transport"]').children].map((b) => b.id).join(','),
    }));
    check('Desktop: Knöpfe zurück im Deck, ohne Leiste unten, Regal sichtbar', desk.back && desk.tabs === 'none' && desk.shelf === 'flex' && desk.dock === null, JSON.stringify(desk));
    check('Desktop: Reihenfolge im Deck unverändert', desk.order === 'home-btn,play-btn,loop-btn,rec-btn,mixer-btn,metro-btn', desk.order);
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
