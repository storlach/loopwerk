// Automation Scheibe 1–3, Bedienung (Spec v2.12, Testplan 11): Kurvenzeile unter der Spur am Desktop (Maus, Tastatur) und
// am Handy/Tablet (Finger), Vorlagen Einblenden/Ausblenden/Filter öffnen/Filter schließen, Parameter Lautstärke, Panorama und
// Effekt-Werte, Mini-Leiste Linear/Stufe/Löschen, gesperrte Regler (Panorama, Effekte; Mixer, Inspektor), gestrichelte
// Kurve bei ausgeschaltetem Effekt, Tippflächen, keine Konsolenfehler.
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

    // ================= Scheibe 2: Panorama, Stufe, Mini-Leiste, gesperrte Regler =================
    const pan = () => page.evaluate(() => { const t = window.loopwerk.store.project.tracks[0]; return { pan: t.automation?.pan ?? null, vol: t.automation?.volume ?? null, slider: t.pan || 0 }; });
    await page.evaluate((id) => { window.loopwerk.store.setTrack(id, { pan: -0.3 }); window.loopwerk.ui.selectTrack(id); }, t);
    await page.keyboard.press('a');
    await page.waitForSelector('.auto-row');
    await page.click('.auto-chip');
    const km = await page.evaluate(() => {
      const m = document.querySelector('.auto-keys');
      return { open: !!m && !m.hidden, items: [...m.querySelectorAll('.auto-key[data-key]')].map((b) => ({ key: b.dataset.key, text: b.textContent, lit: !!b.querySelector('.auto-dot.on'), checked: b.getAttribute('aria-checked') })) };
    });
    check('Chip ist eine Auswahl: Lautstärke, Panorama, Filter-Frequenz, Hall-, Echo-, Verzerrer-Anteil', km.open && km.items.map((x) => x.text).join() === 'Lautstärke,Panorama,Filter-Frequenz,Hall-Anteil,Echo-Anteil,Verzerrer-Anteil', JSON.stringify(km.items.map((x) => x.text)));
    check('Chip: Lautstärke (mit Kurve) trägt einen Leuchtpunkt, Panorama (ohne) nicht', km.items[0]?.lit && !km.items[1]?.lit && km.items[0].checked === 'true', JSON.stringify(km.items));
    await page.click('.auto-key[data-key="pan"]');
    const panRow = await page.evaluate(() => ({
      chip: document.querySelector('.auto-chip')?.textContent, key: document.querySelector('.auto-row')?.dataset.key,
      menu: document.querySelector('.auto-keys').hidden, mid: document.querySelector('.auto-mid')?.getAttribute('d') || '', pts: document.querySelectorAll('.auto-pt').length,
    }));
    check('Chip wechselt zu Panorama: Zeile zeigt Panorama, Menü zu', panRow.chip === 'Panorama' && panRow.key === 'pan' && panRow.menu && panRow.pts === 0, JSON.stringify(panRow));
    g = await geom(page);
    check('Panorama: Mittellinie in der Zeile', /^M0 [\d.]+H\d+$/.test(panRow.mid) && Math.abs(Number(panRow.mid.split(' ')[1].split('H')[0]) - g.h / 2) < 1.5, panRow.mid);
    // Punkt bei Schlag 2, Wert R 40 % (Höhe 30 % von oben innerhalb der Ränder)
    const yPan = (v) => PAD + (1 - (v + 1) / 2) * (g.h - 2 * PAD);
    await page.mouse.click(g.x + g.ppb * 2, g.y + yPan(0.4));
    await page.mouse.click(g.x + g.ppb * 6, g.y + yPan(-0.5));
    let ps = await pan();
    check('Panorama: Klick setzt Punkte (Wert = Höhe, −1 … 1)', ps.pan?.length === 2 && near(ps.pan[0].value, 0.4, 0.03) && near(ps.pan[1].value, -0.5, 0.03) && ps.vol?.length >= 2, JSON.stringify(ps));
    // Fähnchen beim Ziehen: „R 40 %“ / „L 50 %“ / „Mitte“
    c = await ptCenter(page, 1);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    let panFlag = '';
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(c.x, c.y + (yPan(0) - yPan(-0.5)) * (-i / 6) * -1);
      if (i === 6) panFlag = await page.evaluate(() => document.querySelector('.auto-flag')?.textContent || '');
    }
    await page.mouse.up();
    ps = await pan();
    check('Panorama-Fähnchen zeigt „Mitte“ bzw. „L/R … %“', /^(Mitte|[LR] \d+ %) · Takt \d+/.test(panFlag) && (panFlag.startsWith('Mitte') === (Math.abs(ps.pan[1].value) < 0.005)), `${panFlag} (Wert ${ps.pan[1].value})`);
    await page.evaluate((id) => window.loopwerk.store.moveAutoPoint(id, 'pan', 1, 6, -0.4), t);
    await page.waitForTimeout(50);
    const flagTexts = await page.evaluate(async () => { const A = await import('./src/automation.js'); return [-0.4, 0, 0.25].map((v) => A.formatAutoValue('pan', v)); });
    check('Panorama-Format: L 40 % · Mitte · R 25 %', flagTexts.join(' | ') === 'L 40 % | Mitte | R 25 %', flagTexts.join(' | '));

    // Mini-Leiste (Maus): Klick auf den gewählten Punkt
    c = await ptCenter(page, 0);
    await page.mouse.click(c.x, c.y);
    check('Maus: erster Klick wählt den Punkt, noch keine Mini-Leiste', await page.evaluate(() => document.querySelector('.auto-bar')?.hidden !== false && window.loopwerk.ui.autoLane.selected?.i === 0));
    await page.mouse.click(c.x, c.y);
    const barInfo = () => page.evaluate(() => {
      const b = document.querySelector('.auto-bar');
      if (!b || b.hidden) return null;
      const r = b.getBoundingClientRect();
      return { labels: [...b.querySelectorAll('button')].map((x) => x.textContent), pressed: [...b.querySelectorAll('button')].map((x) => x.getAttribute('aria-pressed')), x: r.left + r.width / 2, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
    });
    let bi = await barInfo();
    check('Maus: Klick auf den gewählten Punkt zeigt die Mini-Leiste „Linear · Stufe · Löschen“', bi && bi.labels.join(' · ') === 'Linear · Stufe · Löschen' && bi.pressed[0] === 'true', JSON.stringify(bi));
    check('Mini-Leiste steht am Punkt (über oder unter ihm, am Rand eingerückt)', bi && c.x >= bi.x - bi.w / 2 && c.x <= bi.x + bi.w / 2 && (bi.bottom <= c.y || bi.top >= c.y), JSON.stringify({ bi, c }));
    let steps0 = (await state(page)).steps;
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-pan-desktop.png') });
    await page.click('.auto-bar [data-act="step"]');
    ps = await pan();
    bi = await barInfo();
    check('Mini-Leiste: Stufe setzt curve „step“ (ein Schritt), Leiste bleibt mit Stufe gedrückt', ps.pan[0].curve === 'step' && (await state(page)).steps === steps0 + 1 && bi?.pressed[1] === 'true', JSON.stringify(ps.pan));
    check('Stufe: Punkt ist eckig (nicht nur über Farbe)', await page.evaluate(() => document.querySelectorAll('.auto-pt')[0].classList.contains('step') && /,\s*Stufe$/.test(document.querySelectorAll('.auto-pt')[0].getAttribute('aria-valuetext'))));
    await page.click('.auto-bar [data-act="linear"]');
    ps = await pan();
    check('Mini-Leiste: Linear nimmt die Stufe zurück', !ps.pan[0].curve && (await barInfo())?.pressed[0] === 'true', JSON.stringify(ps.pan));
    // Rechtsklick auf den anderen Punkt: wählt ihn und zeigt die Leiste dort
    c = await ptCenter(page, 1);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    bi = await barInfo();
    check('Maus: Rechtsklick auf einen Punkt wählt ihn und zeigt die Mini-Leiste', bi && Math.abs(bi.x - c.x) < 4 && (await state(page)).sel?.i === 1, JSON.stringify(bi));
    await page.keyboard.press('Escape');
    check('Escape schließt die Mini-Leiste', !(await barInfo()));
    await page.mouse.click(c.x, c.y, { button: 'right' });
    steps0 = (await state(page)).steps;
    await page.click('.auto-bar [data-act="delete"]');
    ps = await pan();
    check('Mini-Leiste: Löschen entfernt den Punkt (ein Schritt), Leiste zu', ps.pan?.length === 1 && (await state(page)).steps === steps0 + 1 && !(await barInfo()), JSON.stringify(ps.pan));
    await page.keyboard.press('Control+z');
    // Klick ins Leere schließt die Leiste und setzt wie gewohnt einen Punkt
    c = await ptCenter(page, 0);
    await page.mouse.click(c.x, c.y, { button: 'right' });
    await page.mouse.click(g.x + g.ppb * 10, g.y + yPan(0));
    ps = await pan();
    check('Klick neben die Leiste: Leiste zu, neuer Punkt', !(await barInfo()) && ps.pan?.length === 3, JSON.stringify(ps.pan));
    await page.keyboard.press('Delete');
    // Tastatur: Enter auf einem Punkt öffnet die Leiste
    await page.focus('.auto-pt');
    await page.keyboard.press('Enter');
    check('Tastatur: Enter auf einem Punkt öffnet die Mini-Leiste, Fokus darin', !!(await barInfo()) && await page.evaluate(() => document.activeElement?.closest('.auto-bar') != null));
    await page.keyboard.press('Escape');

    // Leuchtpunkte jetzt für beide; zuletzt gewählter Parameter bleibt beim Schließen/Öffnen
    await page.click('.auto-chip');
    check('Chip: beide Parameter mit Punkten leuchten (die anderen nicht)', await page.evaluate(() => [...document.querySelectorAll('.auto-key[data-key]')].every((b) => b.querySelector('.auto-dot').classList.contains('on') === ['volume', 'pan'].includes(b.dataset.key))));
    await page.keyboard.press('Escape');
    await page.click('.auto-close');
    await page.keyboard.press('a');
    await page.waitForSelector('.auto-row');
    check('Zuletzt gewählter Parameter je Spur bleibt (Panorama)', await page.evaluate(() => document.querySelector('.auto-chip').textContent === 'Panorama'));

    // Gesperrter Panorama-Regler im Inspektor: gedimmt, folgt der Kurve an der Marke, Klick öffnet die Zeile
    await page.evaluate((id) => {
      const { store, engine } = window.loopwerk;
      store.clearAutomation(id, 'pan');
      store.addAutoPoint(id, 'pan', 0, -1);
      store.addAutoPoint(id, 'pan', 8, 1);
      engine.setPosition(6);
    }, t);
    await page.waitForTimeout(100);
    const insp = () => page.evaluate(() => {
      const lock = document.querySelector('#insp .insp-pan-box .auto-lock');
      const r = lock?.getBoundingClientRect();
      return { lock: !!lock && !lock.hidden && r.width > 20, dis: document.getElementById('insp-pan').disabled, value: Number(document.getElementById('insp-pan').value),
        out: document.querySelector('#insp .insp-pan-box output').textContent, dim: document.querySelector('#insp .insp-pan-box').classList.contains('auto-locked'), vol: document.getElementById('insp-vol').disabled };
    });
    let ii = await insp();
    check('Inspektor: Panorama mit Kurve gesperrt (gedimmt, Kurven-Zeichen), zeigt Kurvenwert an der Marke (Schlag 6 → R 50 %)', ii.lock && ii.dis && ii.dim && near(ii.value, 0.5, 0.011) && ii.out === '50 % rechts', JSON.stringify(ii));
    check('Inspektor: Lautstärke bleibt frei bedienbar (Kurve ist ein Anteil)', !ii.vol);
    await page.evaluate(() => window.loopwerk.engine.play(0));
    await page.waitForTimeout(600);
    const follow = await page.evaluate(async () => {
      const { engine, store } = window.loopwerk;
      const A = await import('./src/automation.js');
      const got = Number(document.getElementById('insp-pan').value);
      const want = A.autoValueOf(store.project.tracks[0], 'pan', engine.heardBeat());
      return { got, want };
    });
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Inspektor: gesperrter Regler folgt beim Abspielen der Kurve', Math.abs(follow.got - follow.want) < 0.06 && follow.got < 0.9, JSON.stringify(follow));
    await page.click('.auto-close');
    await page.click('#insp .insp-pan-box .auto-lock');
    check('Inspektor: Klick auf den gesperrten Regler öffnet die Kurvenzeile mit Panorama', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'pan' && document.querySelector('.auto-chip').textContent === 'Panorama'));
    // Mixer: gleich
    await page.click('.auto-close');
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(150);
    const mx = await page.evaluate((id) => {
      const wrap = document.getElementById(`pan-${id}`).closest('.strip-pan-wrap');
      const lock = wrap.querySelector('.auto-lock');
      return { lock: !!lock && !lock.hidden, dis: document.getElementById(`pan-${id}`).disabled, dim: wrap.classList.contains('auto-locked'), fader: document.getElementById(`fader-${id}`).disabled, value: Number(document.getElementById(`pan-${id}`).value) };
    }, t);
    check('Mixer: Panorama mit Kurve gesperrt, Fader frei, Anzeige = Kurve an der Marke', mx.lock && mx.dis && mx.dim && !mx.fader && Math.abs(mx.value - (await page.evaluate(() => window.loopwerk.engine.positionBeat)) / 4 + 1) < 0.02, JSON.stringify(mx));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-pan-mixer.png') });
    await page.click(`#mixer .strip-pan-wrap .auto-lock`);
    check('Mixer: Klick auf den gesperrten Regler öffnet die Kurvenzeile mit Panorama', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'pan'));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    // Spur-Menü „Kurve löschen“ gilt für den gewählten Parameter; der Regler bekommt seinen alten Wert zurück
    await page.click('.track-row .tbtn-menu');
    const delItem = await page.evaluate(() => [...document.querySelectorAll('.track-menu-item')].map((b) => b.textContent).find((x) => /Kurve löschen/.test(x)));
    check('Spur-Menü: „Panorama-Kurve löschen“ für den gewählten Parameter', delItem === 'Panorama-Kurve löschen', String(delItem));
    await page.click('.track-menu-item:text-is("Panorama-Kurve löschen")');
    ps = await pan();
    ii = await insp();
    check('Kurve löschen: Panorama weg, Lautstärke-Kurve bleibt, Regler frei mit altem Wert (−0,3)', ps.pan === null && ps.vol?.length >= 2 && !ii.dis && !ii.lock && near(ii.value, -0.3, 0.011) && ii.out === '30 % links', JSON.stringify({ ps, ii }));
    await page.keyboard.press('a');

    // ================= Scheibe 3: Effekt-Kurven =================
    const fxState = () => page.evaluate(() => { const t = window.loopwerk.store.project.tracks[0]; return { cut: t.automation?.['filter.cutoff'] ?? null, hall: t.automation?.['hall.mix'] ?? null, filter: t.fx?.filter ?? null, hallOn: !!t.fx?.hall?.on, steps: window.loopwerk.store.undoStack.length }; });
    await page.evaluate((id) => { const { store, ui, engine } = window.loopwerk; store.clearAutomation(id); engine.setPosition(0); ui.autoBars = undefined; ui.select(null); ui.selectTrack(id); }, t);
    await page.waitForTimeout(100);
    if (await page.evaluate(() => !!document.querySelector('.auto-row'))) await page.click('.auto-close');
    // Vorlage „Filter öffnen“ im Inspektor: ein Klick, ab Takt der Marke 8 Takte 0,25 → 1, Filter an (Tiefpass)
    let f0 = await fxState();
    check('Inspektor „Verlauf“: Einblenden · Ausblenden · Filter öffnen · Filter schließen', await page.evaluate(() => [...document.querySelectorAll('#insp .auto-tpl [data-template]')].map((b) => b.textContent).join(' · ')) === 'Einblenden · Ausblenden · Filter öffnen · Filter schließen');
    await page.click('#insp [data-template="filterOpen"]');
    let f1 = await fxState();
    check('Vorlage „Filter öffnen“: 0,25 → 1 über 8 Takte ab der Marke, Filter an als Tiefpass, ein Schritt',
      JSON.stringify(f1.cut) === JSON.stringify([{ beat: 0, value: 0.25 }, { beat: 32, value: 1 }]) && f1.filter?.on && f1.filter.type === 'lowpass' && f1.steps === f0.steps + 1, JSON.stringify(f1));
    check('Vorlage öffnet die Zeile mit Filter-Frequenz, Einblender nennt die Länge', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'filter.cutoff' && document.querySelector('.auto-chip').textContent === 'Filter-Frequenz' && /Filter öffnen über 8 Takte/.test(window.loopwerk.ui.flashText || '')));
    // Fähnchen beim Ziehen: Frequenz in Hz/kHz
    let pc = await ptCenter(page, 0);
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.down();
    await page.mouse.move(pc.x, pc.y - 20, { steps: 4 });
    const fFlag = await page.evaluate(() => document.querySelector('.auto-flag').textContent);
    await page.mouse.up();
    check('Fähnchen der Filter-Kurve zeigt die Frequenz („… Hz · Takt …“)', /^\d+(,\d)? k?Hz · Takt \d+/.test(fFlag), fFlag);
    if ((await fxState()).steps > f1.steps) await page.evaluate(() => window.loopwerk.store.undo());
    // Gesperrter Frequenz-Regler im Inspektor: gedimmt, Kurven-Zeichen, Wert = Kurve an der Marke (Schlag 16 → 0,625)
    await page.evaluate(() => window.loopwerk.engine.setPosition(16));
    await page.waitForTimeout(100);
    const fxLock = () => page.evaluate(() => {
      const input = document.getElementById('fx-filter-cutoff');
      const box = input.closest('.fx-param-box');
      const lock = box?.querySelector('.auto-lock');
      const r = lock?.getBoundingClientRect();
      return { dis: input.disabled, dim: box?.classList.contains('auto-locked'), lock: !!lock && !lock.hidden && r.width > 20, value: Number(input.value), out: box?.querySelector('.fx-param-value').textContent,
        reso: document.getElementById('fx-filter-reso').disabled, label: lock?.getAttribute('aria-label') };
    });
    const fl = await fxLock();
    check('Inspektor: Filter-Frequenz mit Kurve gesperrt (gedimmt, Kurven-Zeichen), zeigt Kurvenwert an der Marke', fl.dis && fl.dim && fl.lock && near(fl.value, 0.625, 0.006) && /kHz$/.test(fl.out) && !fl.reso && /Filter-Frequenz folgt der Kurve/.test(fl.label), JSON.stringify(fl));
    await page.evaluate(() => window.loopwerk.engine.play(0));
    await page.waitForTimeout(700);
    const fFollow = await page.evaluate(async () => {
      const { engine, store } = window.loopwerk;
      const A = await import('./src/automation.js');
      return { got: Number(document.getElementById('fx-filter-cutoff').value), want: A.autoValueOf(store.project.tracks[0], 'filter.cutoff', engine.heardBeat()) };
    });
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Inspektor: gesperrter Frequenz-Regler folgt beim Abspielen der Kurve', Math.abs(fFollow.got - fFollow.want) < 0.03 && fFollow.got < 0.4, JSON.stringify(fFollow));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-filter-desktop.png') });
    await page.click('.auto-close');
    await page.click('#insp .fx-param-box:has(#fx-filter-cutoff) .auto-lock');
    check('Inspektor: Klick auf den gesperrten Frequenz-Regler öffnet die Zeile mit Filter-Frequenz', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'filter.cutoff'));
    // Effekt aus: Kurve gestrichelt, wirkt nicht; wieder an: durchgezogen
    await page.evaluate((id) => window.loopwerk.store.setTrackFx(id, 'filter', { on: false }), t);
    const dash = () => page.evaluate(() => ({ inactive: document.querySelector('.auto-row').classList.contains('inactive'), dash: getComputedStyle(document.querySelector('.auto-curve')).strokeDasharray }));
    let dd = await dash();
    check('Effekt aus: Kurve gestrichelt', dd.inactive && dd.dash !== 'none', JSON.stringify(dd));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-filter-off-desktop.png') });
    await page.evaluate((id) => window.loopwerk.store.setTrackFx(id, 'filter', { on: true }), t);
    dd = await dash();
    check('Effekt an: Kurve durchgezogen', !dd.inactive && dd.dash === 'none', JSON.stringify(dd));
    // Chip → Hall-Anteil: Klick setzt den ersten Punkt und schaltet den Hall ein (ein Schritt), Fähnchen in %
    await page.click('.auto-chip');
    await page.click('.auto-key[data-key="hall.mix"]');
    g = await geom(page);
    f0 = await fxState();
    await page.mouse.click(g.x + g.ppb * 4, g.y + PAD + 0.65 * (g.h - 2 * PAD));
    f1 = await fxState();
    check('Hall-Anteil: erster Punkt schaltet den Hall ein, ein Schritt, Wert = Höhe', f1.hall?.length === 1 && f1.hallOn && !f0.hallOn && f1.steps === f0.steps + 1 && near(f1.hall[0].value, 0.35, 0.02), JSON.stringify(f1));
    pc = await ptCenter(page, 0);
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.down();
    await page.mouse.move(pc.x, pc.y - 6, { steps: 3 });
    const hFlag = await page.evaluate(() => document.querySelector('.auto-flag').textContent);
    await page.mouse.up();
    check('Fähnchen der Hall-Kurve zeigt „… % · Takt …“', /^\d+ % · Takt \d+/.test(hFlag), hFlag);
    check('Inspektor: Hall-Anteil gesperrt, Raumgröße frei', await page.evaluate(() => document.getElementById('fx-hall-mix').disabled && !document.getElementById('fx-hall-size').disabled));
    await page.click('.auto-close');

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
    check('Handy: Spur-Menü hat „Kurve“, „Einblenden“, „Ausblenden“ und „Länge“', await page.evaluate(() => { const l = [...document.querySelectorAll('.track-menu-item')].map((b) => b.textContent); return l.includes('Kurve') && l.includes('Einblenden') && l.includes('Ausblenden') && l.some((x) => x.startsWith('Länge')); }));
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
    await page.tap('.track-menu-item:text-matches("^Länge")');
    check('Handy: Verlauf zeigt Längen-Chips 1 · 2 · 4 · 8 und beide Knöpfe', await page.evaluate(() => [...document.querySelectorAll('.track-menu .auto-bars button')].map((b) => b.textContent).join() === '1,2,4,8' && !!document.querySelector('.track-menu [data-template="fadeIn"]') && !!document.querySelector('.track-menu [data-template="fadeOut"]')));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-phone-menu.png') });
    const mt = (await page.evaluate(measureTargets)).filter((x) => /track-menu-item|„\d Takte?“/.test(x.label));
    check('Handy: Menü-Knöpfe Verlauf (Zurück, Einblenden, Ausblenden, Längen-Chips) ≥ 44 px hoch', mt.length >= 4 && mt.every((x) => x.h >= 44), JSON.stringify(mt.map((x) => `${x.label} ${x.w}×${x.h}`)));
    await page.tap('.track-menu .auto-bars [data-bars="2"]');
    await page.tap('.track-menu [data-template="fadeIn"]');
    s = await state(page);
    check('Handy: Menü → Einblenden über 2 Takte = ein Schritt, Menü zu, Zeile offen', s.auto?.length === 2 && s.auto[1].beat === 8 && s.steps === st0 + 1 && await page.evaluate(() => document.querySelector('.track-menu').hidden && !!document.querySelector('.auto-row')), JSON.stringify(s.auto));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-phone-fade.png') });
    // Zwei Tipps: Spur-Menü → Ausblenden (Länge wie zuletzt gewählt: 2 Takte)
    await page.tap('.auto-close');
    const st1 = (await state(page)).steps;
    await page.tap('.track-row .tbtn-menu');
    await page.tap('.track-menu-item:text-is("Ausblenden")');
    s = await state(page);
    check('Handy: Spur-Menü → Ausblenden in zwei Tipps, ein Schritt, Zeile offen', s.steps === st1 + 1 && s.auto?.length >= 3 && await page.evaluate(() => document.querySelector('.track-menu').hidden && !!document.querySelector('.auto-row')), JSON.stringify(s.auto));
    // ---------- Scheibe 2 am Finger: Parameter wählen, Mini-Leiste, gesperrter Regler im Mixer ----------
    const panOf = () => page.evaluate(() => window.loopwerk.store.project.tracks[0].automation?.pan ?? null);
    await page.tap('.auto-chip');
    await page.waitForSelector('.auto-keys:not([hidden])');
    const kt = (await page.evaluate(measureTargets)).filter((x) => /auto-key|auto-chip/.test(x.label));
    check('Handy: Parameter-Auswahl, Tippflächen ≥ 44 px (Chip und Einträge)', kt.length >= 3 && kt.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(kt));
    await page.tap('.auto-key[data-key="pan"]');
    check('Handy: Chip wechselt zu Panorama', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'pan' && document.querySelector('.auto-keys').hidden));
    g = await geom(page);
    await tap(g.x + g.ppb * 2.2, g.y + 16);
    await tap(g.x + g.ppb * 5.1, g.y + g.h - 16);
    let pp = await panOf();
    check('Handy: Antippen setzt Panorama-Punkte (oben rechts, unten links)', pp?.length === 2 && pp[0].beat === 2 && pp[0].value > 0.3 && pp[1].beat === 5 && pp[1].value < -0.3, JSON.stringify(pp));
    // Antippen eines Punkts: Mini-Leiste
    let q = await ptCenter(page, 0);
    await tap(q.x, q.y);
    await page.waitForTimeout(80);
    const bar = () => page.evaluate(() => { const b = document.querySelector('.auto-bar'); return b && !b.hidden ? [...b.querySelectorAll('button')].map((x) => x.textContent) : null; });
    check('Handy: Antippen eines Punkts zeigt die Mini-Leiste „Linear · Stufe · Löschen“', (await bar())?.join(' · ') === 'Linear · Stufe · Löschen' && (await panOf()).length === 2);
    const bt = (await page.evaluate(measureTargets)).filter((x) => /auto-bar-btn/.test(x.label));
    check('Handy: Mini-Leiste, Tippflächen ≥ 44 px', bt.length === 3 && bt.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(bt));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-pan-phone.png') });
    await page.tap('.auto-bar [data-act="step"]');
    pp = await panOf();
    check('Handy: Stufe über die Mini-Leiste', pp[0].curve === 'step' && (await bar()) !== null, JSON.stringify(pp));
    await page.tap('.auto-bar [data-act="linear"]');
    check('Handy: Linear über die Mini-Leiste', !(await panOf())[0].curve);
    await page.tap('.auto-bar [data-act="delete"]');
    pp = await panOf();
    check('Handy: Löschen über die Mini-Leiste, Leiste zu, Einblender', pp?.length === 1 && !(await bar()) && (await state(page)).flash === 'Punkt gelöscht', JSON.stringify(pp));
    // Ziehen auf einem Punkt zeigt keine Leiste
    q = await ptCenter(page, 0);
    await swipe(q.x, q.y, q.x + g.ppb, q.y, 8);
    check('Handy: Ziehen eines Punkts zeigt keine Mini-Leiste', !(await bar()) && (await panOf())[0].beat === 6, JSON.stringify(await panOf()));
    // Gesperrter Panorama-Regler im Mixer: Antippen öffnet die Kurvenzeile (der Mixer macht Platz)
    await page.tap('.auto-close');
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(300);
    const lt = (await page.evaluate(measureTargets)).filter((x) => /auto-lock/.test(x.label));
    check('Handy: gesperrter Panorama-Regler im Mixer mit Tippfläche ≥ 44 px', lt.length >= 1 && lt.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(lt));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-pan-phone-mixer.png') });
    await page.tap('#mixer .strip-pan-wrap .auto-lock');
    await page.waitForTimeout(200);
    check('Handy: Antippen öffnet die Kurvenzeile mit Panorama, Mixer zu', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'pan' && window.loopwerk.ui.dock !== 'mixer'));
    // ---------- Scheibe 3 am Finger: Filter öffnen über das Spur-Menü, gesperrter Effekt-Regler im Mixer ----------
    await page.tap('.auto-close');
    await page.evaluate(() => window.loopwerk.engine.setPosition(0));
    const st2 = (await state(page)).steps;
    await page.tap('.track-row .tbtn-menu');
    const tm = await page.evaluate(() => { const m = document.querySelector('.track-menu'); const r = m.getBoundingClientRect(); return { items: [...m.querySelectorAll('.track-menu-item')].map((b) => b.textContent), top: r.top, bottom: r.bottom, vh: innerHeight }; });
    check('Handy: Spur-Menü hat „Filter öffnen“ und „Filter schließen“ direkt, Menü liegt im Bild', tm.items.includes('Filter öffnen') && tm.items.includes('Filter schließen') && tm.top >= 0 && tm.bottom <= tm.vh, JSON.stringify(tm));
    const mi = (await page.evaluate(measureTargets)).filter((x) => /track-menu-item/.test(x.label));
    check('Handy: Spur-Menü-Einträge ≥ 44 px hoch', mi.length >= 8 && mi.every((x) => x.h >= 44 && x.w >= 44), JSON.stringify(mi.map((x) => `${x.label} ${x.w}×${x.h}`)));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-filter-phone-menu.png') });
    await page.tap('.track-menu-item:text-is("Filter öffnen")');
    const fp = await page.evaluate(() => { const t = window.loopwerk.store.project.tracks[0]; return { cut: t.automation?.['filter.cutoff'], filter: t.fx?.filter, steps: window.loopwerk.store.undoStack.length, key: document.querySelector('.auto-row')?.dataset.key }; });
    check('Handy: Spur-Menü → Filter öffnen in zwei Tipps, ein Schritt, Zeile mit Filter-Frequenz offen', fp.cut?.length === 2 && fp.cut[0].value === 0.25 && fp.cut[1].value === 1 && fp.filter?.on && fp.filter.type === 'lowpass' && fp.steps === st2 + 1 && fp.key === 'filter.cutoff', JSON.stringify(fp));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-filter-phone.png') });
    // Mixer → Kanal → Effekte: Frequenz-Regler gesperrt, Antippen öffnet die Zeile
    await page.tap('.auto-close');
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(300);
    await page.tap(`#mixer .strip[data-strip-id="${t}"] .strip-name`);
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('fx-filter-cutoff')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const ml = await page.evaluate(() => { const i = document.getElementById('fx-filter-cutoff'); const b = i?.closest('.fx-param-box'); return { dis: i?.disabled, dim: b?.classList.contains('auto-locked'), out: b?.querySelector('.fx-param-value').textContent }; });
    const mlt = (await page.evaluate(measureTargets)).filter((x) => /auto-lock/.test(x.label) && /Filter-Frequenz/.test(x.label));
    check('Handy: Mixer-Effektseite – Frequenz gesperrt, Tippfläche ≥ 44 px', ml.dis && ml.dim && mlt.length === 1 && mlt[0].w >= 44 && mlt[0].h >= 44, JSON.stringify({ ml, mlt }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'auto-filter-phone-mixer.png') });
    await page.tap('#mixer .fx-param-box:has(#fx-filter-cutoff) .auto-lock');
    await page.waitForTimeout(200);
    check('Handy: Antippen öffnet die Zeile mit Filter-Frequenz, Mixer zu', await page.evaluate(() => document.querySelector('.auto-row')?.dataset.key === 'filter.cutoff' && window.loopwerk.ui.dock !== 'mixer'));
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
