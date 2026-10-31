// Tablet: Desktop-Layout, aber nur Finger (1180×820, hasTouch). Alles, was am Desktop Maus, Hover, Umschalt,
// Doppelklick oder Mausrad braucht, geht hier mit Antippen, Ziehen, langem Drücken und zwei Fingern.
// node tests/tablet.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Bewusste Ausnahmen von „≥ 44 px“ – mit Begründung
const EXCEPTIONS = [
  // Ränder und Griffe am Clip: Fläche wächst mit dem Clip (bis 26 px Rand, 40 px Griff); 44 px würden kurze Clips ganz
  // zudecken. Dieselben Werte gibt es fingergroß unter „Pegel“ bzw. im Inspektor.
  [/^div\.clip-(trim|handle|grip)/, 'Clip-Ränder und -Griffe'],
  // Der Spurname ist Beschriftung; Umbenennen geht auch über ⋯ → „Umbenennen“ (44 px)
  [/^div\.track-name/, 'Spurname'],
  // Klaviatur: Tasten wie am Klavier (weiße 48 px breit, schwarze schmaler und überlappend)
  [/^button\.pat-key/, 'Klaviertasten'],
  // Quellenangaben im Fließtext
  [/^a\./, 'Links im Text'],
];
const exempt = (label) => EXCEPTIONS.some(([re]) => re.test(label));

(async () => {
  const app = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  const cdp = await page.context().newCDPSession(page);
  const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  // Echte Touch-Gesten: Wischen (optional nach langem Drücken), Halten, zwei Finger
  async function swipe(x, y, dx, dy, { steps = 12, hold = 0 } = {}) {
    await T('touchStart', [{ x, y }]);
    if (hold) await page.waitForTimeout(hold);
    for (let i = 1; i <= steps; i++) {
      await T('touchMove', [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }]);
      await page.waitForTimeout(16);
    }
    await T('touchEnd', []);
    await page.waitForTimeout(250);
  }
  const longPress = (x, y) => swipe(x, y, 0, 0, { steps: 1, hold: 650 });
  async function pinch(cx, cy, d0, d1) {
    await T('touchStart', [{ x: cx - d0 / 2, y: cy, id: 0 }, { x: cx + d0 / 2, y: cy, id: 1 }]);
    for (let i = 1; i <= 10; i++) {
      const d = d0 + ((d1 - d0) * i) / 10;
      await T('touchMove', [{ x: cx - d / 2, y: cy, id: 0 }, { x: cx + d / 2, y: cy, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await T('touchEnd', []);
    await page.waitForTimeout(200);
  }
  const tapAt = (b, fx = 0.5, fy = 0.5) => page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy);
  const box = (sel) => page.locator(sel).first().boundingBox();
  const lw = () => page.evaluate(() => {
    const { store, ui } = window.loopwerk;
    return {
      tracks: store.project.tracks.map((t) => t.clips.map((c) => ({ ...c }))),
      sel: ui.selectedClipId, ids: ui.selectedIds(), selecting: ui.selecting, armed: ui.armedSampleId, dock: ui.dock,
      ppb: ui.pxPerBeat, loop: { ...store.project.loop }, undo: store.undoStack.length,
    };
  });
  const clipById = async (id) => (await lw()).tracks.flat().find((c) => c.id === id);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `tablet-${name}.png`) }); };
  // Tippflächen im aktuellen Zustand prüfen
  async function targets(name) {
    const list = await page.evaluate(measureTargets);
    const bad = list.filter((x) => (x.w < 44 || x.h < 44) && !exempt(x.label));
    check(`Tippflächen ≥ 44 px: ${name}`, list.length > 5 && bad.length === 0, bad.length ? bad.map((x) => `${x.label} ${x.w}×${x.h}`).join(' | ') : `${list.length} Elemente`);
  }
  const clear = () => page.evaluate(() => { const { ui, arranger } = window.loopwerk; ui.setSelecting(false); ui.arm(null); ui.select(null); ui.flashText = null; ui.emit(); arranger.render(); });

  try {
    // ---------- Eingabeart, nicht Breite ----------
    const start = await page.evaluate(() => ({
      coarse: matchMedia('(hover: none) and (pointer: coarse)').matches,
      shelf: getComputedStyle(document.querySelector('.shelf')).display,
      bar: getComputedStyle(document.getElementById('arr-bar')).display,
      select: getComputedStyle(document.querySelector('.arr-bar-select')).display,
      over: document.documentElement.scrollWidth - innerWidth,
      head: document.querySelector('.track-head').getBoundingClientRect().width,
      gestures: getComputedStyle(document.querySelector('#keys-btn .for-touch')).display !== 'none',
    }));
    check('Tablet erkannt: (hover: none) and (pointer: coarse)', start.coarse);
    check('Desktop-Layout bleibt: Regal, Arranger-Leiste, keine Querverschiebung', start.shelf !== 'none' && start.bar === 'flex' && start.over <= 0, JSON.stringify(start));
    check('„Auswählen“ und „Alle“ stehen in der Arranger-Leiste', start.select === 'flex' && await page.locator('#select-btn').isVisible() && await page.locator('#select-all-btn').isVisible());
    check('Spurkopf breiter für vier fingergroße Knöpfe', start.head >= 200, `${start.head} px`);
    await shot('start');
    await page.evaluate(() => window.loopwerk.engine.setPosition(8));
    await targets('Startansicht');

    // ---------- Sound anhören und einsetzen ----------
    await tapAt(await box('#library .loop-item'), 0.3);
    let s = await lw();
    check('Antippen im Regal wählt den Sound aus', s.armed === 'drums-four', s.armed);
    const hint = await page.locator('#hint-text').textContent();
    check('Hinweis in Fingersprache, mit „Fertig“', hint.includes('Tippe in eine Spur') && await page.locator('#hint-done').isVisible(), hint);
    const lane8 = await box('.lane[data-track-id="t2"]');
    // Wischen über die Spuren scrollt nur – erst Antippen setzt ein
    const t2before = (await lw()).tracks[1].length;
    await swipe(lane8.x + 400, lane8.y + lane8.height / 2, -200, 0);
    const t2 = (await lw()).tracks[1].length;
    check('Wischen mit ausgewähltem Sound setzt nichts ein', t2 === t2before, `${t2before} → ${t2}`);
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });
    await page.touchscreen.tap(lane8.x + 200, lane8.y + lane8.height / 2);
    s = await lw();
    check('Antippen einer Spur setzt den Sound ein', s.tracks[1].some((c) => c.sampleId === 'drums-four'), JSON.stringify(s.tracks[1]));
    await page.tap('#hint-done');
    check('„Fertig“ beendet das Einsetzen', !(await lw()).armed);
    // Ziehen aus dem Regal auf eine Spur
    const item2 = await box('#library .loop-item >> nth=1');
    await swipe(item2.x + 40, item2.y + item2.height / 2, lane8.x + 500 - item2.x - 40, lane8.y + lane8.height / 2 - item2.y - item2.height / 2, { steps: 20 });
    s = await lw();
    check('Sound mit dem Finger auf eine Spur ziehen', s.tracks[1].some((c) => c.sampleId === 'drums-break'), JSON.stringify(s.tracks[1].map((c) => c.sampleId)));

    // ---------- Clip: antippen, ziehen, kürzen, verlängern ----------
    await clear();
    const four = s.tracks[1].find((c) => c.sampleId === 'drums-four');
    const cbox = () => box(`.clip[data-clip-id="${four.id}"]`);
    let c = await cbox();
    const before = await lw();
    await swipe(c.x + 30, c.y + c.height / 2, 0, -60);
    check('Wischen über einen nicht ausgewählten Clip verändert nichts', JSON.stringify((await lw()).tracks) === JSON.stringify(before.tracks));
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollTop = 0; });
    c = await cbox();
    await tapAt(c, 0.3, 0.5);
    check('Antippen wählt den Clip aus', (await lw()).sel === four.id);
    check('Clip-Werkzeuge schweben unten im Arranger', await page.locator('#clipbar').isVisible());
    const cb = await page.evaluate(() => {
      const b = document.getElementById('clipbar').getBoundingClientRect();
      const a = document.querySelector('.arranger').getBoundingClientRect();
      return { inside: b.left >= a.left && b.right <= a.right && b.bottom <= a.bottom, btns: [...document.querySelectorAll('#clipbar .cbtn')].map((n) => Math.round(n.getBoundingClientRect().height)) };
    });
    check('… im Arranger, Knöpfe ≥ 44 px', cb.inside && cb.btns.every((h) => h >= 44), JSON.stringify(cb));
    await shot('clip');
    await targets('Clip ausgewählt');
    // In der Mitte anfassen
    await swipe(c.x + c.width / 2, c.y + c.height * 0.6, 96, 0);
    check('Ausgewählten Clip ziehen verschiebt ihn um einen Takt', (await clipById(four.id)).startBeat === four.startBeat + 4, `${four.startBeat} → ${(await clipById(four.id)).startBeat}`);
    c = await cbox();
    const handle = await box(`.clip[data-clip-id="${four.id}"] .clip-handle`);
    check('Rand zum Kürzen fingerbreit (≥ 20 px) und unten im Clip', handle.width >= 20 && handle.y > c.y + c.height * 0.4, JSON.stringify(handle));
    await swipe(handle.x + handle.width / 2, handle.y + handle.height / 2, -48, 0);
    check('Rechten Rand ziehen kürzt den Clip', (await clipById(four.id)).lengthBeats === 2, String((await clipById(four.id)).lengthBeats));
    const h2 = await box(`.clip[data-clip-id="${four.id}"] .clip-handle`);
    await swipe(h2.x + h2.width / 2, h2.y + h2.height / 2, 96, 0);
    check('… und wieder verlängern', (await clipById(four.id)).lengthBeats === 6, String((await clipById(four.id)).lengthBeats));
    const trim = await box(`.clip[data-clip-id="${four.id}"] .clip-trim`);
    await swipe(trim.x + trim.width / 2, trim.y + trim.height / 2, 24, 0);
    s = await lw();
    check('Linken Rand ziehen kürzt vorne', (await clipById(four.id)).lengthBeats === 5, JSON.stringify(await clipById(four.id)));

    // Lautstärke und Fades am Clip: Griffe größer
    const vol = await box(`.clip[data-clip-id="${four.id}"] .clip-vol`);
    check('Griffe am Clip größer (≥ 14 px sichtbar)', vol.width >= 14, `${vol.width}`);
    await swipe(vol.x + vol.width / 2, vol.y + vol.height / 2, 0, 20);
    check('Lautstärke-Griff nach unten ziehen macht den Clip leiser', (await clipById(four.id)).gain < 1, String((await clipById(four.id)).gain));
    const fin = await box(`.clip[data-clip-id="${four.id}"] .clip-fade-in`);
    await swipe(fin.x + fin.width / 2, fin.y + fin.height / 2, 24, 0);
    check('Fade-In-Griff nach rechts ziehen blendet ein', (await clipById(four.id)).fadeInBeats > 0, String((await clipById(four.id)).fadeInBeats));
    // Pegel in den Clip-Werkzeugen (statt Griffe)
    await page.tap('#cb-levels');
    check('„Pegel“ zeigt die Regler', await page.locator('#lvl-gain').isVisible() && (await box('#lvl-gain')).height >= 44);
    await page.tap('#cb-levels');

    // ---------- Teilen, Duplizieren, Löschen (statt T, Strg+D, Entf) ----------
    const n8 = async () => (await lw()).tracks[1].length;
    const k0 = await n8();
    await page.tap('#cb-dup');
    check('„Duplizieren“ legt eine Kopie dahinter', await n8() === k0 + 1);
    await page.tap('#cb-del');
    check('„Löschen“ entfernt den Clip', await n8() === k0);
    await page.tap('#undo-btn');
    check('„Rückgängig“ im Deck holt ihn zurück', await n8() === k0 + 1);
    await page.tap('#redo-btn');
    check('„Wiederholen“ im Deck', await n8() === k0);
    await page.evaluate((id) => { const cl = window.loopwerk.store.findClip(id).clip; window.loopwerk.engine.setPosition(cl.startBeat + 2); window.loopwerk.arranger.select(id); }, four.id);
    await page.tap('#cb-split');
    check('„Teilen“ teilt an der Marke', await n8() === k0 + 1);
    await page.tap('#undo-btn');

    // ---------- Mehrfachauswahl: langes Drücken, dann antippen ----------
    await clear();
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollTop = 0; });
    const pad = (await lw()).tracks[3][0];
    const riser = (await lw()).tracks[6][0];
    const padBox = await box(`.clip[data-clip-id="${pad.id}"]`);
    await longPress(padBox.x + 60, padBox.y + padBox.height / 2);
    s = await lw();
    check('Langes Drücken auf einen Clip schaltet „Auswählen“ ein und wählt ihn aus', s.selecting && s.ids.length === 1 && s.ids[0] === pad.id, JSON.stringify(s.ids));
    check('„Auswählen“ leuchtet, Einblender mit „Fertig“', await page.getAttribute('#select-btn', 'aria-pressed') === 'true' && await page.locator('#hint-done').isVisible());
    const rBox = await box(`.clip[data-clip-id="${riser.id}"]`);
    await tapAt(rBox, 0.5, 0.5);
    s = await lw();
    check('Danach nimmt Antippen weitere Clips dazu', s.ids.length === 2 && s.ids.includes(riser.id), JSON.stringify(s.ids));
    const counted = await page.locator('#hint-text').textContent();
    check('Einblender zählt mit', counted.includes('2 Clips'), counted);
    await shot('auswahl');
    await swipe(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2, 96, 0);
    const moved = await lw();
    check('Ausgewählte Clips gemeinsam ziehen', moved.tracks[3][0].startBeat === pad.startBeat + 4 && moved.tracks[6].find((x) => x.id === riser.id).startBeat === riser.startBeat + 4,
      `${pad.startBeat}→${moved.tracks[3][0].startBeat}, ${riser.startBeat}→${moved.tracks[6].find((x) => x.id === riser.id)?.startBeat}`);
    await page.tap('#undo-btn');
    await page.evaluate(([a, b]) => { window.loopwerk.ui.setSelecting(true); window.loopwerk.ui.selectMany([a, b]); }, [pad.id, riser.id]);
    const rb2 = await box(`.clip[data-clip-id="${riser.id}"]`);
    await tapAt(rb2, 0.5, 0.5);
    check('Nochmal antippen nimmt einen Clip wieder heraus', JSON.stringify((await lw()).ids) === JSON.stringify([pad.id]));
    await tapAt(rb2, 0.5, 0.5);
    const total0 = (await lw()).tracks.flat().length;
    await page.tap('#cb-del');
    check('„Löschen“ entfernt alle ausgewählten', (await lw()).tracks.flat().length === total0 - 2);
    await page.tap('#undo-btn');
    await page.tap('#hint-done');
    check('„Fertig“ beendet das Auswählen', !(await lw()).selecting && await page.getAttribute('#select-btn', 'aria-pressed') === 'false');
    // Alle
    await page.tap('#select-all-btn');
    s = await lw();
    check('„Alle“ wählt alle Clips aus', s.ids.length === s.tracks.flat().length && s.selecting, `${s.ids.length}/${s.tracks.flat().length}`);
    await page.tap('#select-btn');
    await clear();
    // Rahmen: langes Drücken auf freie Fläche, dann ziehen
    const lane5 = await box('.lane[data-track-id="t5"]');
    const lane7 = await box('.lane[data-track-id="t7"]');
    await page.evaluate(() => { window.loopwerk.ui.pxPerBeat = 24; window.loopwerk.arranger.render(); document.getElementById('arr-scroll').scrollLeft = 0; });
    await swipe(lane5.x + 30, lane5.y + 10, 500, lane7.y + lane7.height - 10 - lane5.y - 10, { hold: 650, steps: 16 });
    s = await lw();
    const inFrame = s.tracks[6].map((x) => x.id);
    check('Langes Drücken auf freier Fläche und ziehen: Rahmen wählt die Clips darin aus', s.selecting && inFrame.every((id) => s.ids.includes(id)) && s.ids.length >= inFrame.length, JSON.stringify(s.ids));
    check('Beim Rahmen scrollt der Arranger nicht', await page.evaluate(() => document.getElementById('arr-scroll').scrollLeft) === 0);
    await page.tap('#hint-done');
    await clear();

    // ---------- Spurkopf: Umbenennen, Menü, Drehregler ----------
    await page.locator('.track-row:nth-child(1) .track-name').tap();
    check('Spurname antippen öffnet das Umbenennen', await page.locator('#name-t1').isVisible());
    await page.locator('#name-t1').fill('Schlagzeug');
    await page.locator('#name-t1').press('Enter');
    check('Spur umbenannt', await page.evaluate(() => window.loopwerk.store.track('t1').name) === 'Schlagzeug');
    await page.tap('.track-row:nth-child(2) .tbtn-menu');
    const menu = await page.evaluate(() => [...document.querySelectorAll('.track-menu .track-menu-item')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]));
    check('Menü ⋯: Einträge ≥ 44 px, mit „Umbenennen“', menu.length >= 5 && menu.every(([, h]) => h >= 44) && menu.some(([t]) => t === 'Umbenennen'), JSON.stringify(menu));
    await shot('spurmenue');
    await page.locator('.track-menu-item', { hasText: 'Umbenennen' }).tap();
    check('„Umbenennen“ im Menü öffnet das Namensfeld', await page.locator('#name-t2').isVisible());
    await page.locator('#name-t2').press('Escape');
    const knob = await box('.track-row:nth-child(1) .knob');
    await swipe(knob.x + knob.width / 2, knob.y + knob.height / 2, 0, 40);
    const v1 = await page.evaluate(() => window.loopwerk.store.track('t1').volume);
    check('Drehregler: senkrecht ziehen ändert die Lautstärke', v1 < 0.8, String(v1));
    await page.touchscreen.tap(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.waitForTimeout(60);
    await page.touchscreen.tap(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.waitForTimeout(100);
    check('Drehregler: zweimal schnell antippen setzt den Grundwert', await page.evaluate(() => window.loopwerk.store.track('t1').volume) === 0.8);
    // Spurgruppe aus dem Menü, Kopf antippen klappt zu
    await page.tap('.track-row:nth-child(1) .tbtn-menu');
    await page.locator('.track-menu-item', { hasText: 'Gruppe bilden' }).tap();
    const grp = await page.evaluate(() => window.loopwerk.store.project.groups?.[0]?.id);
    check('Spurgruppe über das Menü bilden', !!grp);
    await page.tap(`.group-row[data-group-id="${grp}"] .group-toggle`);
    check('Gruppe auf- und zuklappen per Antippen', await page.evaluate((id) => window.loopwerk.store.project.groups.find((g) => g.id === id).collapsed, grp));
    await targets('Spurgruppe eingeklappt');
    await page.tap('#undo-btn');
    await page.tap('#undo-btn');

    // ---------- Zoom, Marke, Loop-Bereich ----------
    const arr = await box('#arr-scroll');
    const z0 = (await lw()).ppb;
    await pinch(arr.x + arr.width / 2, arr.y + 300, 120, 260);
    const z1 = (await lw()).ppb;
    check('Zwei Finger auseinander zoomen hinein', z1 > z0 * 1.5, `${z0} → ${z1}`);
    await pinch(arr.x + arr.width / 2, arr.y + 300, 260, 120);
    check('… zusammen wieder hinaus', (await lw()).ppb < z1, `${z1} → ${(await lw()).ppb}`);
    await page.evaluate(() => { window.loopwerk.arranger.zoomTo(24); document.getElementById('arr-scroll').scrollLeft = 0; });
    await page.tap('#zoom-in');
    check('„+“ in der Arranger-Leiste zoomt', (await lw()).ppb > 24);
    await page.tap('#zoom-out');
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });
    const ruler = await box('.ruler');
    await swipe(ruler.x + 24 * 4 + 10, ruler.y + ruler.height / 2, 24 * 8, 0);
    s = await lw();
    check('Im Lineal ziehen markiert den Loop-Bereich (statt zu scrollen)', s.loop.on && s.loop.startBeat === 4 && s.loop.endBeat === 16, JSON.stringify(s.loop));
    await page.touchscreen.tap(ruler.x + 24 * 8 + 5, ruler.y + ruler.height / 2);
    check('Lineal antippen setzt die Marke', await page.evaluate(() => window.loopwerk.engine.heardBeat()) === 8);
    const grip = await box('.ph-grip');
    await swipe(grip.x + grip.width / 2, grip.y + grip.height / 2, 96, 0);
    check('Marke am Griff ziehen', await page.evaluate(() => window.loopwerk.engine.heardBeat()) === 12);
    await page.tap('#undo-btn');

    // ---------- Inspektor (eingeklappt) ----------
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t2'));
    await page.tap('.insp-toggle');
    await page.waitForTimeout(200);
    await page.tap('#fx-hall-on');
    check('Inspektor: Effekt per Antippen einschalten', await page.evaluate(() => window.loopwerk.store.track('t2').fx.hall.on === true));
    await targets('Inspektor mit Effekt');
    await page.tap('.insp-toggle');
    await page.tap('#undo-btn');

    // ---------- Mixer ----------
    await page.tap('#mixer-btn');
    await page.waitForTimeout(600);
    const fader = await box('#mixer .strip[data-strip-id="t3"] .strip-fader-row');
    const fv0 = await page.evaluate(() => window.loopwerk.store.track('t3').volume);
    await swipe(fader.x + fader.width / 2, fader.y + fader.height / 2, 0, 40);
    const fv1 = await page.evaluate(() => window.loopwerk.store.track('t3').volume);
    check('Mixer: Fader mit dem Finger ziehen', fv1 < fv0, `${fv0} → ${fv1}`);
    await page.tap('#mixer .strip[data-strip-id="t3"] .tbtn-mute');
    check('Mixer: Stumm antippen', await page.evaluate(() => window.loopwerk.store.track('t3').mute));
    await shot('mixer');
    await targets('Mixer');
    await page.tap('#undo-btn');
    await page.tap('#undo-btn');
    await page.tap('#mixer-btn');
    await page.waitForTimeout(500);

    // ---------- Melodie: Piano-Roll ----------
    await page.tap('#ltab-create');
    await page.tap('.ccard[data-create="melody"]');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-roll-wrap').hidden);
    await page.waitForTimeout(600);
    const notes = () => page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes.map((n) => ({ ...n })));
    const geo = await page.evaluate(() => {
      const w = document.getElementById('pat-roll-wrap').getBoundingClientRect();
      const r = document.getElementById('pat-roll').getBoundingClientRect();
      const p = window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id];
      return { y: w.y, h: w.height, rx: r.x, cell: (r.width - 30) / (p.bars * 16) };
    });
    const cw = geo.cell;
    check('Piano-Roll: Raster fingertauglich (Spalten ≥ 20 px)', cw >= 20, `${cw} px`);
    const nx = geo.rx + 30 + cw * 4 + cw / 2; // Spalte 5 (Schlag 2), Zeilen sind 22 px hoch
    const ny = geo.y + geo.h / 2;
    await page.touchscreen.tap(nx, ny);
    let ns = await notes();
    check('Piano-Roll: Antippen setzt eine Note', ns.length === 1, JSON.stringify(ns));
    const n0 = ns[0];
    await swipe(nx, ny, cw * 2, -44, { hold: 650 });
    ns = await notes();
    check('Piano-Roll: lange drücken und ziehen verschiebt die Note (Zeit und Tonhöhe)', ns.length === 1 && ns[0].start === n0.start + 0.5 && ns[0].pitch === n0.pitch + 2, `${JSON.stringify(n0)} → ${JSON.stringify(ns[0])}`);
    const endX = geo.rx + 30 + (ns[0].start + ns[0].len) * 4 * cw - 6;
    const rowY = ny - 44;
    await swipe(endX, rowY, cw * 3, 0, { hold: 650 });
    ns = await notes();
    check('Piano-Roll: am rechten Ende lange drücken und ziehen verlängert sie', ns.length === 1 && ns[0].len > n0.len && ns[0].start === n0.start + 0.5, JSON.stringify(ns[0]));
    await swipe(nx, ny + 40, -100, 0);
    check('Piano-Roll: Wischen setzt keine Note', (await notes()).length === 1);
    await shot('melodie');
    await targets('Melodie-Editor');
    // Beat-Editor
    await page.tap('#ltab-create');
    await page.tap('.ccard[data-create="beat"]');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-drums').hidden);
    await page.waitForTimeout(600);
    const cell = page.locator('#pat-drums .pat-cell[data-row="clap"][data-step="2"]');
    await cell.tap();
    check('Beat-Editor: Schritt antippen setzt einen Schlag', await cell.getAttribute('aria-pressed') === 'true');
    await targets('Beat-Editor');
    await page.tap('#editor-tab');
    await page.waitForTimeout(500);

    // ---------- Wunsch, Projekt-Menü, Export, Gesten ----------
    await page.locator('#wish-input').tap();
    check('Wunsch-Feld lässt sich antippen', await page.evaluate(() => document.activeElement?.id === 'wish-input'));
    await page.evaluate(() => document.activeElement.blur());
    await targets('Erstellen');
    await page.tap('#ltab-sounds');
    await page.evaluate(() => window.loopwerk.engine.setPosition(8));
    await page.tap('#project-menu-btn');
    check('Projekt-Menü öffnet per Antippen', await page.locator('#project-menu').isVisible());
    await targets('Projekt-Menü');
    await shot('projektmenue');
    await page.tap('#project-menu-btn');
    await page.tap('#export-btn');
    await page.waitForTimeout(300);
    check('Export öffnet per Antippen', (await lw()).dock === 'export' && await page.locator('#ex-go').isVisible());
    await targets('Export');
    await page.touchscreen.tap(600, 400);
    await page.waitForTimeout(300);
    await page.tap('#keys-btn');
    const keys = await page.evaluate(() => ({ touch: getComputedStyle(document.querySelector('.keys-list.for-touch')).display, mouse: getComputedStyle(document.querySelector('.keys-list.for-mouse')).display, label: [...document.querySelectorAll('#keys-btn span')].filter((n) => n.offsetParent).map((n) => n.textContent).join() }));
    check('„? Gesten“ zeigt die Fingergesten statt Tastenkürzel', keys.touch === 'grid' && keys.mouse === 'none' && keys.label === '? Gesten', JSON.stringify(keys));
    await page.tap('#keys-btn');

    // ---------- Tipps in Fingersprache ----------
    await page.evaluate(() => { window.loopwerk.tips.reset(); window.loopwerk.tips.enable(); });
    await page.waitForTimeout(700);
    const tip = await page.evaluate(() => ({ id: window.loopwerk.tips.current, text: document.querySelector('.tip-text').textContent }));
    check('Erster Tipp spricht vom Antippen', tip.id === 'sounds-phone' && tip.text.includes('Antippen'), JSON.stringify(tip));
    await page.evaluate(() => window.loopwerk.tips.disable());

    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('Keine horizontale Seitenverschiebung', over <= 0, `${over}px`);

    // Hochkant (820×1180): auch hier keine Querverschiebung, Tippflächen groß
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.loopwerk.ui.setDock(null); window.loopwerk.engine.setPosition(8); document.getElementById('arr-scroll').scrollTop = 0; });
    await page.waitForTimeout(300);
    check('Hochkant: keine Querverschiebung', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
    await targets('Hochkant 820×1180');
    await shot('hochkant');

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
