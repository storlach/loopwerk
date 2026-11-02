// Automation Scheibe 1, Bedienung (Spec v2.12, Testplan 11): Kurvenzeile unter der Spur am Desktop (Maus, Tastatur) und am
// Handy/Tablet (Finger), Vorlagen Einblenden/Ausblenden, Tippflächen, keine Konsolenfehler.
// node tests/automation-ui.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// Im Browser: leeres Projekt, Spur 1 mit zwei Clips (0–4 und 8–12), Spur gewählt
async function setup(page) {
  return page.evaluate(async () => {
    const M = await import('./src/model.js');
    const { store, ui } = window.loopwerk;
    store.replace(M.createEmptyProject());
    const t = store.project.tracks[0].id;
    store.addClip(t, 'test-dc', 0, 4);
    store.addClip(t, 'test-dc', 8, 4);
    ui.selectTrack(t);
    return t;
  });
}
const state = (page) => page.evaluate(() => {
  const { store, ui } = window.loopwerk;
  const t = store.project.tracks[0];
  return { auto: t.automation?.volume ?? null, steps: store.undoStack.length, flash: ui.flashText, sel: window.loopwerk.arranger.autoLanes.selected };
});
// Geometrie der Kurvenzeile (Bildschirmpixel)
const geom = (page) => page.evaluate(() => {
  const b = document.querySelector('.auto-body');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const row = b.closest('.auto-row').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, rowH: row.height, ppb: window.loopwerk.ui.pxPerBeat };
});
const PAD = 9;
const valueAt = (h, yy) => Math.round(Math.min(1, Math.max(0, 1 - (yy - PAD) / (h - 2 * PAD))) * 100) / 100;
const ptCenter = (page, i) => page.evaluate((k) => { const r = document.querySelectorAll('.auto-pt')[k]?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; }, i);

(async () => {
  // ================= Desktop =================
  let app = await openApp({ viewport: { width: 1400, height: 900 } });
  let { page } = app;
  try {
    const t = await setup(page);

    // ---------- Öffnen: Taste A, Spur-Menü ----------
    await page.evaluate(() => window.loopwerk.ui.selectTrack(null));
    await page.keyboard.press('a');
    check('A ohne Auswahl: keine Zeile, Einblender sagt, was zu tun ist', await page.evaluate(() => !document.querySelector('.auto-row') && /Spur/.test(window.loopwerk.ui.flashText || '')));
    await page.evaluate((id) => window.loopwerk.ui.selectTrack(id), t);
    await page.keyboard.press('a');
    await page.waitForSelector('.auto-row');
    let g = await geom(page);
    const rowH = await page.evaluate(() => window.loopwerk.arranger.rowHeight());
    check('A öffnet die Kurvenzeile direkt unter der Spur', await page.evaluate(() => document.querySelector('.auto-row').previousElementSibling?.classList.contains('track-row')));
    check('Zeilenhöhe = 0,6 × Spurhöhe, mindestens 44 px', g.rowH >= 44 && g.rowH >= Math.round(rowH * 0.6) - 1, `${g.rowH} px bei Spurhöhe ${rowH}`);
    check('Kopf: Parameter-Chip „Lautstärke“ und Schließen', await page.evaluate(() => document.querySelector('.auto-chip')?.textContent === 'Lautstärke' && !!document.querySelector('.auto-close')));
    await page.keyboard.press('a');
    check('A schließt die Zeile wieder', await page.evaluate(() => !document.querySelector('.auto-row')));
    await page.click('.track-row .tbtn-menu');
    check('Spur-Menü hat „Kurve“', await page.evaluate(() => [...document.querySelectorAll('.track-menu-item')].some((b) => b.textContent === 'Kurve')));
    await page.click('.track-menu-item:text-is("Kurve")');
    await page.waitForSelector('.auto-row');
    check('Spur-Menü → Kurve öffnet die Zeile (2 Klicks)', true);

    // ---------- Klick setzt Punkt auf Raster, Umschalt frei ----------
    g = await geom(page);
    let yy = 10;
    await page.mouse.click(g.x + g.ppb * 2.3, g.y + yy);
    let s = await state(page);
    check('Klick setzt einen Punkt, rastet auf den Schlag (2,3 → 2)', s.auto?.length === 1 && s.auto[0].beat === 2, JSON.stringify(s.auto));
    check('Wert = Höhe des Klicks', s.auto?.[0] && near(s.auto[0].value, valueAt(g.h, yy), 0.011), `${s.auto?.[0]?.value} erwartet ${valueAt(g.h, yy)}`);
    check('Punkt ist gewählt (Weißglut), Spur im Inspektor', s.sel?.i === 0 && await page.evaluate(() => document.querySelector('.auto-pt.sel') !== null && window.loopwerk.ui.selectedTrackId !== null));
    await page.keyboard.down('Shift');
    await page.mouse.click(g.x + g.ppb * 3.3, g.y + 30);
    await page.keyboard.up('Shift');
    s = await state(page);
    check('Umschalt-Klick setzt frei (3,3 ≈ 1/64-Raster)', s.auto?.length === 2 && Math.abs(s.auto[1].beat - 3.3) <= 1 / 128 + 1e-9 && s.auto[1].beat % 1 !== 0, JSON.stringify(s.auto));

    // ---------- Ziehen: rastet, bleibt zwischen Nachbarn, ein Rückgängig-Schritt, Fähnchen ----------
    await page.evaluate((id) => window.loopwerk.store.clearAutomation(id, 'volume'), t);
    await page.mouse.click(g.x + g.ppb * 2, g.y + 10);
    let before = await state(page);
    let c = await ptCenter(page, 0);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    let flagText = '';
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(c.x + (g.ppb * 2.4 * i) / 8, c.y + (15 * i) / 8);
      if (i === 5) flagText = await page.evaluate(() => { const f = document.querySelector('.auto-flag'); return f && !f.hidden ? f.textContent : ''; });
    }
    await page.mouse.up();
    let after = await state(page);
    check('Ziehen rastet auf das Raster (2 + 2,4 → 4)', after.auto?.length === 1 && after.auto[0].beat === 4, JSON.stringify(after.auto));
    check('Ziehen nach unten senkt den Wert', after.auto[0].value < before.auto[0].value, `${before.auto[0].value} → ${after.auto[0].value}`);
    check('Ein Ziehvorgang = ein Rückgängig-Schritt', after.steps === before.steps + 1, `${before.steps} → ${after.steps}`);
    check('Fähnchen beim Ziehen: „… dB · Takt 2, Schlag …“', /dB · Takt \d+, Schlag/.test(flagText), flagText);
    check('Fähnchen nach dem Loslassen weg', await page.evaluate(() => document.querySelector('.auto-flag').hidden));
    await page.keyboard.press('Control+z');
    check('Rückgängig bringt den Punkt zurück auf Schlag 2', (await state(page)).auto?.[0]?.beat === 2);
    await page.keyboard.press('Control+y');

    // Nachbarn nicht überholen; Umschalt-Ziehen frei
    await page.evaluate((id) => window.loopwerk.store.clearAutomation(id, 'volume'), t);
    await page.mouse.click(g.x + g.ppb * 2, g.y + 12);
    await page.mouse.click(g.x + g.ppb * 4, g.y + 12);
    c = await ptCenter(page, 0);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(c.x + g.ppb * 3.5 * (i / 6), c.y);
    await page.mouse.up();
    s = await state(page);
    check('Ein Punkt überholt seinen Nachbarn nicht', s.auto?.length === 2 && s.auto[0].beat < s.auto[1].beat && s.auto[0].beat <= 3, JSON.stringify(s.auto));
    c = await ptCenter(page, 0);
    await page.keyboard.down('Shift');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(c.x - (g.ppb * 1.4 * i) / 4, c.y);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    s = await state(page);
    check('Umschalt-Ziehen rastet fein (nicht auf den Schlag)', s.auto?.[0] && s.auto[0].beat % 1 !== 0 && s.auto[0].beat < 3, JSON.stringify(s.auto));

    // ---------- Doppelklick und Entf löschen ----------
    c = await ptCenter(page, 1);
    await page.mouse.dblclick(c.x, c.y);
    s = await state(page);
    check('Doppelklick löscht den Punkt', s.auto?.length === 1, JSON.stringify(s.auto));
    c = await ptCenter(page, 0);
    await page.mouse.click(c.x, c.y);
    const clipsBefore = await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips.length);
    await page.keyboard.press('Delete');
    s = await state(page);
    check('Entf löscht den gewählten Punkt – letzter Punkt entfernt die Kurve', s.auto === null && await page.evaluate(() => !('automation' in window.loopwerk.store.project.tracks[0])), JSON.stringify(s.auto));
    check('Entf lässt die Clips in Ruhe', await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips.length) === clipsBefore);

    // ---------- Tastatur: Enter setzt an der Marke, Pfeile bewegen ----------
    await page.focus('.auto-body');
    await page.keyboard.press('Enter');
    s = await state(page);
    check('Enter setzt einen Punkt an der Abspielmarke', s.auto?.length === 1 && s.auto[0].beat === 0, JSON.stringify(s.auto));
    const v0 = s.auto[0].value;
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    s = await state(page);
    check('Pfeile bewegen den Punkt (runter = leiser, rechts = ein Rasterschritt)', s.auto?.[0] && s.auto[0].value < v0 && s.auto[0].beat === 1, JSON.stringify(s.auto));
    await page.keyboard.press('Delete');

    // ---------- Vorlagen im Inspektor ----------
    s = await state(page);
    await page.click('#insp [data-template="fadeIn"]');
    let s2 = await state(page);
    check('Vorlage „Einblenden“: Punkte über 4 Takte (0 → 1 bei Schlag 0 → 16)', s2.auto?.length === 2 && s2.auto[0].beat === 0 && s2.auto[0].value === 0 && s2.auto[1].beat === 16 && s2.auto[1].value === 1, JSON.stringify(s2.auto));
    check('Vorlage = ein Rückgängig-Schritt, danach ist die Zeile offen', s2.steps === s.steps + 1 && await page.evaluate(() => !!document.querySelector('.auto-row')));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-desktop.png') });
    await page.keyboard.press('Control+z');
    check('Rückgängig nimmt die ganze Vorlage zurück', (await state(page)).auto === null);
    await page.click('#insp .auto-bars [data-bars="2"]');
    await page.click('#insp [data-template="fadeOut"]');
    s2 = await state(page);
    check('Längen-Chip 2 Takte + „Ausblenden“: endet am letzten Clip (Schlag 4 → 12)', s2.auto?.length === 2 && s2.auto[0].beat === 4 && s2.auto[0].value === 1 && s2.auto[1].beat === 12 && s2.auto[1].value === 0, JSON.stringify(s2.auto));
    await page.keyboard.press('Control+z');
    await page.click('#insp .auto-bars [data-bars="4"]');
    await page.click('#insp [data-template="fadeIn"]');

    // ---------- Geschlossen: Kurve als Linie über den Clips; wandert mit dem Clip ----------
    await page.click('.auto-close');
    check('Schließen: Zeile weg', await page.evaluate(() => !document.querySelector('.auto-row')));
    const ov = () => page.evaluate(() => {
      const p = document.querySelector('.lane .auto-over path');
      if (!p) return null;
      const cs = getComputedStyle(p);
      return { d: p.getAttribute('d'), stroke: cs.stroke, box: p.getBoundingClientRect().width };
    });
    const o1 = await ov();
    check('Geschlossen liegt die Kurve als dünne Linie über den Clips', o1 && o1.d.length > 10 && o1.stroke !== 'none' && o1.box > 50, JSON.stringify(o1));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-desktop-closed.png') });
    await page.evaluate((id) => { const { store } = window.loopwerk; store.moveClip(store.project.tracks[0].clips[0].id, id, 2, { copy: false }); }, t);
    const o2 = await ov();
    check('Kurve wandert mit dem Clip: die Linie wird neu gezeichnet', o2 && o2.d !== o1.d, `${o1.d.slice(0, 40)} → ${o2?.d.slice(0, 40)}`);
    await page.keyboard.press('a');
    await page.waitForSelector('.auto-row');
    check('Offene Zeile zeichnet nach dem Verschieben mit', await page.evaluate(() => document.querySelectorAll('.auto-pt').length) === (await state(page)).auto.length);
    await page.keyboard.press('a');

    check('Desktop: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Desktop-Ablauf ohne Ausnahme', false, err.message);
  }
  await app.close();

  // ================= Finger: Handy (390 × 844) =================
  app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  page = app.page;
  try {
    const cdp = await page.context().newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const tap = (x, y) => page.touchscreen.tap(x, y);
    const swipe = async (x0, y0, x1, y1, steps = 8) => {
      await T('touchStart', [{ x: x0, y: y0 }]);
      for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }]); await page.waitForTimeout(16); }
      await T('touchEnd', []);
    };
    const scroll = () => page.evaluate(() => { const r = document.getElementById('arr-scroll'); return { x: r.scrollLeft, y: r.scrollTop }; });
    const t = await setup(page);

    // Öffnen über das Spur-Menü
    await page.tap('.track-row .tbtn-menu');
    check('Handy: Spur-Menü hat „Kurve“ und „Verlauf“', await page.evaluate(() => { const l = [...document.querySelectorAll('.track-menu-item')].map((b) => b.textContent); return l.includes('Kurve') && l.some((x) => x.startsWith('Verlauf')); }));
    await page.tap('.track-menu-item:text-is("Kurve")');
    await page.waitForSelector('.auto-row');
    let g = await geom(page);
    check('Handy: Zeile mindestens 56 px hoch', g.rowH >= 56, `${g.rowH} px`);
    check('Handy: Tippflächen Schließen ≥ 44 px', await page.evaluate(() => { const r = document.querySelector('.auto-close').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
    check('Handy: Zeile liegt im Bild, kein waagrechtes Scrollen der Seite', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth));

    // Antippen setzt Punkte
    const yMid = g.y + g.h / 2;
    await tap(g.x + g.ppb * 3.4, yMid);
    await tap(g.x + g.ppb * 6.2, g.y + 14);
    let s = await state(page);
    check('Handy: Antippen setzt Punkte auf das Raster', s.auto?.length === 2 && s.auto[0].beat === 3 && s.auto[1].beat === 6, JSON.stringify(s.auto));
    check('Handy: Wert = Höhe der Berührung', s.auto?.[0] && near(s.auto[0].value, valueAt(g.h, g.h / 2), 0.02), `${s.auto?.[0]?.value}`);
    const p0 = await ptCenter(page, 0);
    check('Handy: Punkte haben eine Tippfläche von mindestens 44 px', p0.w >= 44 && p0.h >= 44, `${p0.w}×${p0.h}`);
    const tg = (await page.evaluate(measureTargets)).filter((x) => /auto-(pt|close)|auto-bars/.test(x.label));
    check('Handy: gemessene Tippflächen der Kurvenzeile ≥ 44 px', tg.length >= 2 && tg.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(tg));

    // Ziehen nur auf einem Punkt: der Punkt wandert, die Ansicht scrollt nicht
    const sc0 = await scroll();
    const stepsBefore = s.steps;
    await swipe(p0.x, p0.y, p0.x + g.ppb * 2, p0.y, 10);
    s = await state(page);
    const sc1 = await scroll();
    check('Handy: Ziehen auf einem Punkt verschiebt ihn (3 → 5, kein Überholen)', s.auto?.length === 2 && s.auto[0].beat === 5 && s.auto[1].beat === 6, JSON.stringify(s.auto));
    check('Handy: Ziehen auf einem Punkt scrollt nicht und ist ein Rückgängig-Schritt', sc1.x === sc0.x && sc1.y === sc0.y && s.steps === stepsBefore + 1, `${JSON.stringify(sc0)} → ${JSON.stringify(sc1)}, Schritte ${stepsBefore} → ${s.steps}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-phone.png') });

    // Tippen auf einen Punkt wählt ihn, setzt keinen neuen
    const p1 = await ptCenter(page, 1);
    await tap(p1.x, p1.y);
    s = await state(page);
    check('Handy: Antippen eines Punkts wählt ihn, es entsteht kein neuer', s.auto?.length === 2 && s.sel?.i === 1, JSON.stringify(s.sel));

    // Halten löscht
    await T('touchStart', [{ x: p1.x, y: p1.y }]);
    await page.waitForTimeout(650);
    await T('touchEnd', []);
    s = await state(page);
    check('Handy: Halten löscht den Punkt', s.auto?.length === 1 && s.auto[0].beat === 5, JSON.stringify(s.auto));
    check('Handy: Einblender „Punkt gelöscht“', s.flash === 'Punkt gelöscht', String(s.flash));
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Handy: Rückgängig holt den Punkt zurück', (await state(page)).auto?.length === 2);

    // Wischen scrollt, setzt keinen Punkt
    await page.waitForTimeout(400);
    g = await geom(page);
    const n0 = (await state(page)).auto.length;
    const scA = await scroll();
    await swipe(g.x + g.ppb * 8.5, g.y + g.h / 2, g.x + g.ppb * 8.5 - 120, g.y + g.h / 2, 10);
    await page.waitForTimeout(300);
    const scB = await scroll();
    s = await state(page);
    check('Handy: Wischen auf freier Fläche scrollt', scB.x > scA.x + 20, `${scA.x} → ${scB.x}`);
    check('Handy: Wischen setzt keinen Punkt', s.auto?.length === n0, JSON.stringify(s.auto));
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });

    // Vorlage über das Spur-Menü
    await page.evaluate((id) => window.loopwerk.store.clearAutomation(id, 'volume'), t);
    await page.tap('.auto-close');
    const st0 = (await state(page)).steps;
    await page.tap('.track-row .tbtn-menu');
    await page.tap('.track-menu-item:text-is("Verlauf ›")');
    check('Handy: Verlauf zeigt Längen-Chips 1 · 2 · 4 · 8 und beide Knöpfe', await page.evaluate(() => [...document.querySelectorAll('.track-menu .auto-bars button')].map((b) => b.textContent).join() === '1,2,4,8' && !!document.querySelector('.track-menu [data-template="fadeIn"]') && !!document.querySelector('.track-menu [data-template="fadeOut"]')));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-phone-menu.png') });
    const mt = (await page.evaluate(measureTargets)).filter((x) => /track-menu-item|„\d Takte?“/.test(x.label));
    check('Handy: Menü-Knöpfe Verlauf (Zurück, Einblenden, Ausblenden, Längen-Chips) ≥ 44 px hoch', mt.length >= 4 && mt.every((x) => x.h >= 44), JSON.stringify(mt.map((x) => `${x.label} ${x.w}×${x.h}`)));
    await page.tap('.track-menu .auto-bars [data-bars="2"]');
    await page.tap('.track-menu [data-template="fadeIn"]');
    s = await state(page);
    check('Handy: Menü → Einblenden über 2 Takte = ein Schritt, Menü zu, Zeile offen', s.auto?.length === 2 && s.auto[1].beat === 8 && s.steps === st0 + 1 && await page.evaluate(() => document.querySelector('.track-menu').hidden && !!document.querySelector('.auto-row')), JSON.stringify(s.auto));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-phone-fade.png') });
    check('Handy: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Handy-Ablauf ohne Ausnahme', false, err.message);
  }
  await app.close();

  // ================= Finger: Tablet (1180 × 820) =================
  app = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
  page = app.page;
  try {
    await setup(page);
    await page.keyboard.press('a');
    await page.waitForSelector('.auto-row');
    const g = await geom(page);
    check('Tablet: Zeile mindestens 56 px hoch', g.rowH >= 56, `${g.rowH} px`);
    await page.touchscreen.tap(g.x + g.ppb * 2.2, g.y + 20);
    const p = await ptCenter(page, 0);
    check('Tablet: Antippen setzt einen Punkt mit 44-px-Tippfläche', (await state(page)).auto?.length === 1 && p.w >= 44 && p.h >= 44, `${p?.w}×${p?.h}`);
    check('Tablet: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Tablet-Ablauf ohne Ausnahme', false, err.message);
  }
  await app.close();
  finish();
})();
