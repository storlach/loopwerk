// Version 1.8: neues Desktop-Layout (Deck in einer Zeile, Sounds|Erstellen, Inspektor, Leiste unten),
// Schubladen über den Spuren, Schere, Tipps, Drücken und Halten, Klaviertasten am Handy.
// node tests/v18.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker, clickR, selectR, createCard, reveal } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let { page } = app;
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
  const S = () => page.evaluate(() => window.loopwerk.store.project);
  try {
    // ---------- Grundaufteilung ----------
    const deck = await rect('.deck');
    const lay = await page.evaluate(() => ({
      insp: !!document.getElementById('insp').offsetParent, bar: getComputedStyle(document.getElementById('tabbar')).display,
      tabs: getComputedStyle(document.getElementById('tab-sounds')).display, overflow: document.documentElement.scrollWidth - innerWidth,
      mixerInBar: !!document.getElementById('mixer-btn').closest('#tabbar'), zoomInBar: !!document.getElementById('zoom-in').closest('.arr-bar'),
      saveInMenu: !!document.getElementById('save-btn').closest('#project-menu'), exportInDeck: !!document.getElementById('export-btn').closest('.deck'),
      menuName: document.getElementById('project-menu-name').textContent,
    }));
    check('Deck in einer Zeile (≤ 64 px)', deck.h <= 64, `${deck.h} px`);
    check('Inspektor rechts, Fachleiste unten ohne Handy-Reiter, kein Querscrollen', lay.insp && lay.bar === 'flex' && lay.tabs === 'none' && lay.overflow <= 0, JSON.stringify(lay));
    check('Knöpfe an ihren neuen Plätzen', lay.mixerInBar && lay.zoomInBar && lay.saveInMenu && lay.exportInDeck && lay.menuName === 'Beispiel-Arrangement', JSON.stringify(lay));

    // Projekt-Menü
    await page.click('#project-menu-btn');
    check('Projekt-Menü öffnet mit Name, Öffnen, Speichern, Beispiel, Leeren, Tipps', await page.evaluate(() => ['project-name', 'open-btn', 'save-btn', 'demo-btn', 'new-btn', 'tips-reset'].every((id) => document.getElementById(id).offsetParent && document.getElementById(id).closest('#project-menu'))));
    await page.keyboard.press('Escape');
    check('Esc schließt das Menü', await page.locator('#project-menu').isHidden());

    // Export als Klappfeld: Arranger bleibt gleich groß
    const arr0 = await rect('.arranger');
    await page.click('#export-btn');
    const ex = await rect('#export');
    const arr1 = await rect('.arranger');
    check('Export öffnet als Klappfeld unter dem Knopf, Arranger unverändert', ex && ex.y < deck.b + 20 && ex.r > 1300 && arr1.h === arr0.h, JSON.stringify({ ex, arr0: arr0.h, arr1: arr1.h }));
    // Daneben klicken: in die leere Spur 8 (ein Clip würde ausgewählt)
    const empty = await rect('.lane[data-track-id="t8"]');
    await page.mouse.click(empty.x + 20, empty.y + empty.h / 2);
    check('Klick daneben schließt das Export-Feld', await page.evaluate(() => window.loopwerk.ui.dock === null));

    // ---------- Inspektor ----------
    const mode = () => page.evaluate(() => document.getElementById('insp').dataset.mode);
    check('Ohne Auswahl zeigt der Inspektor den Song', await mode() === 'song');
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });
    const pad = page.locator('.clip', { hasText: 'Pad Am–F–C–G' });
    await pad.click({ position: { x: 60, y: 45 } });
    const ci = await page.evaluate(() => ({ mode: document.getElementById('insp').dataset.mode, title: document.querySelector('#insp .insp-sec:not([hidden]) .insp-title span:last-child').textContent, meta: document.querySelector('#insp .insp-meta').textContent, btns: ['edit-btn', 'split-btn', 'dup-btn', 'del-btn'].every((id) => document.getElementById(id).closest('#insp') && document.getElementById(id).offsetParent) }));
    check('Clip auswählen: Inspektor zeigt Clip mit Werkzeugen', ci.mode === 'clip' && ci.title === 'Pad Am–F–C–G' && /Spur „Pad“ · Takt 1–16/.test(ci.meta) && ci.btns, JSON.stringify(ci));
    await page.locator('#insp-gain').fill('0.5');
    const g = await page.evaluate(() => window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.gain);
    check('Lautstärke im Inspektor ändert den Clip', g === 0.5, String(g));
    await page.locator('.track-row').nth(2).locator('.track-btns').click({ position: { x: 4, y: 4 } }).catch(() => {});
    await page.locator('.track-row').nth(2).locator('.track-name').click();
    check('Klick auf den Spurkopf zeigt die Spur', await mode() === 'track' && await page.evaluate(() => window.loopwerk.ui.selectedTrackId) === 't3');
    await page.locator('#insp-pan').fill('-0.5');
    check('Panorama im Inspektor', (await S()).tracks[2].pan === -0.5);
    const lane = await rect('.lane[data-track-id="t8"]');
    await page.mouse.click(lane.x + 400, lane.y + 20);
    check('Klick ins Leere zeigt wieder den Song', await mode() === 'song');
    const bpm0 = (await S()).bpm;
    await page.locator('#insp .insp-step').nth(1).click();
    check('Tempo im Inspektor (+1)', (await S()).bpm === bpm0 + 1);
    await page.locator('#insp .insp-step').nth(0).click();
    await page.waitForFunction(() => !window.loopwerk.tempo.busy && window.loopwerk.library.bpm === window.loopwerk.store.project.bpm, null, { timeout: 30000 });
    await page.evaluate(() => { const i = document.getElementById('insp-length'); i.value = '48'; i.dispatchEvent(new Event('change')); });
    check('Songlänge im Inspektor', (await S()).lengthBars === 48);
    await page.click('#fx-hall-on');
    check('Ohne Auswahl: Effekte gelten dem Master', await page.evaluate(() => window.loopwerk.store.project.master.fx.hall.on === true));
    await page.keyboard.press('Control+z');

    // ---------- Schubladen ----------
    // Ziehen am Griff mit der Maus: wait = Pause je Schritt (langsam ziehen) oder 0 (Schubs)
    const mdrag = async (sel, dy, steps, wait) => {
      const g = await rect(`${sel} > .sheet-grip`);
      await page.mouse.move(g.x + g.w / 2, g.y + 8);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(g.x + g.w / 2, g.y + 8 + (dy * i) / steps); if (wait) await page.waitForTimeout(wait); }
      if (wait) await page.waitForTimeout(120);
      await page.mouse.up();
    };
    await page.click('#mixer-btn');
    await page.waitForTimeout(40);
    const entering = await page.evaluate(() => document.getElementById('mixer').classList.contains('entering'));
    check('Schublade fährt animiert herein', entering);
    await page.waitForTimeout(550);
    const dk = await rect('#mixer');
    const ar = await rect('.arranger');
    check('Mixer liegt als Schublade über dem Arranger', Math.abs(dk.b - ar.b) < 2 && dk.h < ar.h && Math.abs(ar.h - arr0.h) < 1, JSON.stringify({ dk, ar }));
    check('Schublade öffnet in der Mitte (50 %)', Math.abs(dk.h / ar.h - 0.5) < 0.02, `${dk.h} / ${ar.h}`);
    const shadow = await page.evaluate(() => getComputedStyle(document.getElementById('mixer')).boxShadow);
    check('Schublade hat Griff und Schatten', shadow !== 'none' && await page.locator('#mixer > .sheet-grip').isVisible(), shadow);
    const pad1 = await page.evaluate(() => getComputedStyle(document.querySelector('.arr-grid')).paddingBottom);
    check('Arranger lässt unten Platz zum Scrollen', parseFloat(pad1) >= dk.h - 2, pad1);
    // Langsam nach oben ziehen: rastet am nächsten Haltepunkt (oben, 100 %) ein, animiert
    await mdrag('#mixer', -ar.h * 0.25, 10, 16);
    await page.waitForTimeout(600);
    const dk2 = await rect('#mixer');
    check('Aufziehen rastet oben ein (100 %)', Math.abs(dk2.h / ar.h - 1) < 0.02, `${dk.h} → ${dk2.h} / ${ar.h}`);
    check('Höhe wird gemerkt', await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.sheetH')).wide.mixer === 1));
    // Kurzer Schubs nach unten: eine Stufe tiefer (Mitte), nicht zu
    await mdrag('#mixer', 40, 2, 0);
    await page.waitForTimeout(80);
    const moving = await rect('#mixer');
    await page.waitForTimeout(500);
    const dk3 = await rect('#mixer');
    check('Schubs nach unten rastet in der Mitte ein', Math.abs(dk3.h / ar.h - 0.5) < 0.02 && await page.evaluate(() => window.loopwerk.ui.dock === 'mixer'), `${dk3.h} / ${ar.h}`);
    check('Einrasten ist animiert (Zwischenhöhe)', moving.h < dk2.h - 5 && moving.h > dk3.h + 5, `${dk2.h} → ${moving.h} → ${dk3.h}`);
    // Kurzer Schubs nach oben: eine Stufe höher
    await mdrag('#mixer', -40, 2, 0);
    await page.waitForTimeout(550);
    check('Schubs nach oben rastet oben ein', Math.abs((await rect('#mixer')).h / ar.h - 1) < 0.02);
    // Langsam fast ganz herunter ziehen: zu
    await mdrag('#mixer', ar.h * 0.85, 10, 16);
    await page.waitForTimeout(60);
    check('Nach unten ziehen schließt die Schublade', await page.evaluate(() => window.loopwerk.ui.dock === null));
    const leaving = await page.evaluate(() => { const m = document.getElementById('mixer'); return m.classList.contains('leaving') && getComputedStyle(m).display !== 'none'; });
    check('Schließen ist animiert (verschwindet nicht sofort)', leaving);
    await page.waitForTimeout(450);
    check('Nach der Animation ist die Schublade weg', await page.evaluate(() => getComputedStyle(document.getElementById('mixer')).display === 'none'));
    // Mit dem Knopf öffnen und schließen: ebenfalls animiert, öffnet am gemerkten Haltepunkt
    await page.click('#mixer-btn');
    await page.waitForTimeout(550);
    check('Öffnet am gemerkten Haltepunkt', Math.abs((await rect('#mixer')).h / ar.h - 1) < 0.02);
    await page.click('#mixer-btn');
    await page.waitForTimeout(40);
    check('Schließen per Knopf ist animiert', await page.evaluate(() => document.getElementById('mixer').classList.contains('leaving')));
    await page.waitForTimeout(450);
    await page.click('#mixer-btn');
    await page.keyboard.press('Escape');
    check('Esc schließt das Fach', await page.evaluate(() => window.loopwerk.ui.dock === null));

    // Mixer → Inspektor
    await page.click('#mixer-btn');
    await page.locator('#mixer .strip[data-strip-id="t2"] .strip-sum').click();
    check('Mixer: „keine Effekte“ zeigt die Spur im Inspektor', await mode() === 'track' && await page.evaluate(() => window.loopwerk.ui.selectedTrackId) === 't2');
    await page.keyboard.press('Escape');

    // ---------- Erstellen ----------
    await page.click('#ltab-create');
    check('Reiter „Erstellen“ zeigt sechs Karten', await page.locator('.ccard:visible').count() === 6);
    const tracks0 = (await S()).tracks.length;
    await page.locator('.ccard[data-create="beat"]').click();
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    let st = await page.evaluate(() => {
      const { store, ui, library } = window.loopwerk;
      const f = store.findClip(ui.selectedClipId);
      return { track: f.track.name, n: store.project.tracks.length, cls: document.querySelector(`.clip[data-clip-id="${f.clip.id}"]`).className, cat: library.get(f.clip.sampleId).colorCat };
    });
    check('Karte „Beat bauen“: eigene Spur „Beat 1“, Editor offen', st.track === 'Beat 1' && st.n === tracks0, JSON.stringify(st));
    check('Beat-Clips in Drums-Farbe', st.cat === 'drums' && st.cls.includes('cat-drums'), st.cls);
    const tabLabel = await page.locator('#editor-tab-label').textContent();
    check('Leiste unten zeigt „Editor · Beat 1“', tabLabel === 'Editor · Beat 1', tabLabel);
    await page.click('#editor-tab');
    check('Editor-Reiter schließt den offenen Editor', await page.evaluate(() => window.loopwerk.ui.dock === null));
    // Karte auf eine Spur ziehen
    const card = await rect('.ccard[data-create="melody"]');
    const t8 = await rect('.lane[data-track-id="t8"]');
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    const sl = await page.evaluate(() => document.getElementById('arr-scroll').scrollLeft);
    await page.mouse.move(card.x + 40, card.y + 20);
    await page.mouse.down();
    await page.mouse.move(card.x + 80, card.y + 60, { steps: 4 });
    await page.mouse.move(t8.x + 16.5 * ppb - sl, t8.y + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    st = await page.evaluate(() => { const f = window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId); return { track: f.track.id, start: f.clip.startBeat }; });
    check('Melodie-Karte auf Spur 8, Takt 5 gezogen: liegt genau dort', st.track === 't8' && st.start === 16, JSON.stringify(st));
    // Melodie-Editor: Einsingen links neben der Piano-Roll, „Mehr“-Menü
    await page.click('#pat-sing-btn');
    const sing = await rect('#pat-sing');
    const roll = await rect('#pat-roll-wrap');
    check('Einsingen steht links neben der Piano-Roll', sing.r <= roll.x + 1 && roll.h > 60, JSON.stringify({ sing, roll }));
    await page.click('#pat-more-btn');
    check('„Mehr“ enthält Name, Notenlänge, Einrasten, Schritt-Eingabe, Leeren', await page.evaluate(() => ['pat-name', 'pat-len-field', 'pat-quant-field', 'pat-rec', 'pat-clear'].every((id) => document.getElementById(id).closest('#pat-more'))));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // ---------- Drücken und Halten ----------
    await page.evaluate(() => {
      window.__starts = 0;
      const orig = AudioScheduledSourceNode.prototype.start;
      AudioScheduledSourceNode.prototype.start = function (...a) { if (this.context === window.loopwerk.engine.ctx) window.__starts++; return orig.apply(this, a); };
    });
    await createCard(page, 'beat');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.click('#pat-view [data-view="pads"]');
    await page.evaluate(() => { window.__starts = 0; });
    await page.keyboard.down('a');
    await page.waitForTimeout(900);
    await page.keyboard.up('a');
    await page.waitForTimeout(250);
    const roll1 = await page.evaluate(() => window.__starts);
    // Normale Tipps (auch etwas längere) bleiben ein einzelner Schlag – mit Taste und mit der Maus
    const taps = [];
    for (const ms of [90, 180, 280]) {
      await page.evaluate(() => { window.__starts = 0; });
      // Kick: genau ein Oszillator je Schlag (gezählt werden Oszillator-Starts)
      await page.keyboard.down('a'); await page.waitForTimeout(ms); await page.keyboard.up('a');
      await page.waitForTimeout(350);
      const pb = await rect('#pat-pads .pat-pad[data-row="kick"]');
      await page.mouse.move(pb.x + 20, pb.y + 20); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
      await page.waitForTimeout(350);
      taps.push(await page.evaluate(() => window.__starts));
    }
    check('Tipps bis knapp 300 ms geben genau einen Schlag (kein Doppeln)', taps.every((n) => n === 2), `je Taste+Maus: ${taps.join(', ')}`);
    await page.evaluate(() => { window.__starts = 0; });
    await page.keyboard.press('a');
    await page.waitForTimeout(400);
    const tap1 = await page.evaluate(() => window.__starts);
    check('Pad halten = Wirbel (mehrere Schläge), Antippen = ein Schlag', roll1 >= 4 && tap1 === 1, `gehalten ${roll1}, getippt ${tap1}`);
    // Beat-Raster: gedrückt ziehen malt mehrere Schritte
    await page.click('#pat-view [data-view="grid"]');
    const c0 = await rect('#pat-drums .pat-cell[data-row="hat"][data-step="0"]');
    const c3 = await rect('#pat-drums .pat-cell[data-row="hat"][data-step="3"]');
    await page.mouse.move(c0.x + 5, c0.y + 5);
    await page.mouse.down();
    await page.mouse.move(c3.x + 5, c3.y + 5, { steps: 6 });
    await page.mouse.up();
    const hats = await page.evaluate(() => { const p = window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id]; return p.rows.hat.slice(0, 4); });
    check('Raster: gedrückt ziehen setzt mehrere Schläge', JSON.stringify(hats) === '[1,1,1,1]', JSON.stringify(hats));
    // Melodie: Ton halten in der Schritt-Eingabe = längere Note
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await clickR(page, '#pat-rec');
    await selectR(page, '#pat-len', '0.25');
    await page.keyboard.press('Escape');
    await page.keyboard.down('a');
    await page.waitForTimeout(650);
    await page.keyboard.up('a');
    await page.keyboard.press('s');
    await page.waitForTimeout(200);
    const notes = await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes.map((n) => [n.pitch, n.start, n.len]));
    check('Schritt-Eingabe: gehaltene Taste gibt längere Note, nächste folgt dahinter', notes.length === 2 && notes[0][0] === 60 && notes[0][2] >= 1 && notes[1][1] === notes[0][2], JSON.stringify(notes));
    await page.keyboard.press('Escape');

    // ---------- Schere ----------
    await page.evaluate(async () => { const mm = await import('./src/model.js'); window.loopwerk.store.replace(mm.createDemoProject()); window.loopwerk.engine.setPosition(0); document.getElementById('arr-scroll').scrollLeft = 0; });
    const riser = page.locator('.clip', { hasText: 'Riser' });
    await riser.click({ position: { x: 40, y: 40 } });
    await page.click('#split-btn');
    check('Teilen ohne Abspielmarke im Clip: Schere aktiv', await page.evaluate(() => window.loopwerk.arranger.scissors && document.getElementById('hint-text').textContent.includes('Schere')));
    const rclip = await page.evaluate(() => { const n = [...document.querySelectorAll('.clip')].find((c) => c.textContent.includes('Riser')); const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    const ppb2 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.mouse.click(rclip.x + 3 * ppb2 + 2, rclip.y + rclip.h - 8);
    const parts = await page.evaluate(() => window.loopwerk.store.track('t7').clips.filter((c) => c.sampleId === 'fx-riser').map((c) => [c.startBeat, c.lengthBeats]));
    check('Klick mit der Schere teilt an der Stelle (im Raster)', JSON.stringify(parts) === '[[8,3],[11,5]]', JSON.stringify(parts));

    // ---------- Sample-Editor: Reiter ----------
    await page.evaluate(() => { const { store, editor } = window.loopwerk; editor.open(store.track('t4').clips[0].id); });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    const vis = () => page.evaluate(() => [...document.querySelectorAll('#editor .ed-group')].filter((g) => g.offsetParent).map((g) => g.dataset.tab));
    const v1 = await vis();
    await page.click('.ed-tab[data-tab="trennen"]');
    const v2 = await vis();
    check('Sample-Editor: Werkzeuge in Reitern, eine Gruppe sichtbar', v1.every((t) => t === 'schneiden') && v2.every((t) => t === 'trennen') && v2.length === 1, JSON.stringify({ v1, v2 }));
    await page.keyboard.press('Escape');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v18-desktop.png') });

    // ---------- Tipps ----------
    await page.evaluate(() => { window.loopwerk.tips.reset(); window.loopwerk.tips.enable(); });
    await page.click('#ltab-sounds');
    await page.waitForSelector('.tip:not([hidden])', { timeout: 3000 });
    const tip1 = await page.evaluate(() => ({ id: window.loopwerk.tips.current, text: document.querySelector('.tip-text').textContent, target: !!document.querySelector('.tip-target') }));
    check('Tipp erscheint beim ersten Sehen eines Bereichs, Element wird markiert', tip1.id === 'sounds' && tip1.target && tip1.text.length > 20, JSON.stringify(tip1));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v18-tipp.png') });
    await page.click('.tip-ok');
    await page.waitForTimeout(600);
    const tip2 = await page.evaluate(() => window.loopwerk.tips.current);
    check('„Verstanden“ zeigt den nächsten Tipp', tip2 && tip2 !== 'sounds', String(tip2));
    await page.click('.tip-off');
    await page.waitForTimeout(600);
    check('„Keine Tipps mehr“ schaltet alle ab', await page.evaluate(() => window.loopwerk.tips.current === null && document.querySelector('.tip').hidden && JSON.parse(localStorage.getItem('loopwerk.tips')).off));
    await clickR(page, '#tips-reset');
    await page.waitForSelector('.tip:not([hidden])', { timeout: 3000 });
    check('Im Projekt-Menü wieder einschaltbar', !!(await page.evaluate(() => window.loopwerk.tips.current)));
    await page.evaluate(() => window.loopwerk.tips.disable());

    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Kleinerer Laptop: Inspektor eingeklappt ----------
    app = await openApp({ viewport: { width: 1280, height: 720 } });
    page = app.page;
    const small = await page.evaluate(() => ({ w: document.getElementById('insp').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth }));
    await page.click('.insp-toggle');
    const open = await page.evaluate(() => ({ w: document.getElementById('insp').getBoundingClientRect().width, mode: document.getElementById('insp').dataset.mode }));
    check('1280 px: Inspektor eingeklappt (44 px), klappt auf', small.w <= 46 && small.overflow <= 0 && open.w >= 290, JSON.stringify({ small, open }));
    check('Keine Fehler in der Konsole (1280)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Schubladen und Klaviertasten ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    const cdp = await page.context().newCDPSession(page);
    const drag = async (x, y, dy, steps = 8, wait = 16) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] }); await page.waitForTimeout(wait); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
    };
    const arrM = await rect('.arranger');
    await page.tap('#tab-sounds');
    await page.waitForTimeout(550);
    const sh = await rect('.shelf');
    const arrM2 = await rect('.arranger');
    check('Handy: Regal liegt als Schublade über den Spuren (Arranger bleibt gleich groß)', Math.abs(sh.b - arrM2.b) < 2 && Math.abs(arrM2.h - arrM.h) < 1 && sh.h < arrM.h, JSON.stringify({ sh, arrM, arrM2 }));
    check('Handy: Regal öffnet in der Mitte', Math.abs(sh.h / arrM2.h - 0.5) < 0.02, `${sh.h} / ${arrM2.h}`);
    // Schubs nach oben: rastet oben (100 %) ein
    const gM = await rect('.shelf > .sheet-grip');
    await drag(gM.x + gM.w / 2, gM.y + 8, -60, 3, 10);
    await page.waitForTimeout(400);
    const sh2 = await rect('.shelf');
    check('Handy: Schubs nach oben rastet oben ein (100 %)', Math.abs(sh2.h / arrM2.h - 1) < 0.02, `${sh.h} → ${sh2.h}`);
    // Kurzer Schubs nach unten: zurück zur Mitte
    let gs = await rect('.shelf > .sheet-grip');
    await drag(gs.x + gs.w / 2, gs.y + 8, 50, 3, 10);
    await page.waitForTimeout(400);
    check('Handy: Schubs nach unten rastet in der Mitte ein', Math.abs((await rect('.shelf')).h / arrM2.h - 0.5) < 0.02 && await page.evaluate(() => window.loopwerk.ui.dock === 'sounds'));
    // Weiter Wisch nach unten: zu, animiert
    gs = await rect('.shelf > .sheet-grip');
    await drag(gs.x + gs.w / 2, gs.y + 8, 300, 3, 10);
    check('Handy: nach unten wischen schließt', await page.evaluate(() => window.loopwerk.ui.dock === null));
    await page.waitForTimeout(400);
    // Drumpad am Handy: Antippen = ein Schlag
    await page.evaluate(() => {
      window.__starts = 0;
      const orig = AudioScheduledSourceNode.prototype.start;
      AudioScheduledSourceNode.prototype.start = function (...a) { if (this.context === window.loopwerk.engine.ctx) window.__starts++; return orig.apply(this, a); };
    });
    await page.tap('#tab-sounds');
    await page.tap('#new-beat-btn');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.tap('#pat-view [data-view="pads"]');
    await page.locator('#pat-pads .pat-pad[data-row="kick"]').tap();
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__starts = 0; });
    for (let i = 0; i < 3; i++) { await page.locator('#pat-pads .pat-pad[data-row="kick"]').tap(); await page.waitForTimeout(250); }
    await page.waitForTimeout(300);
    const phoneHits = await page.evaluate(() => window.__starts);
    check('Handy: drei Tipps aufs Pad = drei Schläge', phoneHits === 3, String(phoneHits));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));

    // Klaviertasten
    await page.tap('#tab-sounds');
    await page.tap('#new-melody-btn');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await page.waitForTimeout(550);
    const vk = await page.evaluate(() => {
      const keys = document.querySelectorAll('#pat-vkeys .vkey');
      const k = document.querySelector('#pat-vkeys .vkey[data-pitch="60"]').getBoundingClientRect();
      const roll = document.getElementById('pat-roll').getBoundingClientRect();
      return { n: keys.length, w: k.width, h: k.height, left: Math.round(k.left - roll.left), blacks: document.querySelectorAll('#pat-vkeys .vkey.black').length };
    });
    check('Handy: senkrechte Klaviertasten links an der Piano-Roll', vk.n === 49 && vk.blacks === 20 && vk.w >= 60 && vk.h >= 28 && vk.left <= 1, JSON.stringify(vk));
    await reveal(page, '#pat-rec');
    await page.tap('#pat-rec');
    await page.evaluate(() => document.querySelector('#pat-vkeys .vkey[data-pitch="64"]').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(100);
    const k64 = await rect('#pat-vkeys .vkey[data-pitch="64"]');
    await page.touchscreen.tap(k64.x + 20, k64.y + k64.h / 2);
    await page.waitForTimeout(300);
    const mn = await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes.map((n) => n.pitch));
    check('Handy: Taste antippen setzt in der Schritt-Eingabe eine Note', JSON.stringify(mn) === '[64]', JSON.stringify(mn));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v18-mobil-tasten.png') });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('Handy: kein Querscrollen, Desktop-Teile ausgeblendet', ov <= 0 && await page.evaluate(() => ['.insp', '.tabbar-end', '.arr-bar', '.left-tabs'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none')));
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
