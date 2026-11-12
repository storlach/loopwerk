// Zoom-Leisten und Spurhöhe: Scrollbalken unten und rechts mit Greifern an den Enden des Daumens.
// Ziehen am Daumen scrollt, Ziehen an einem Greifer zoomt (Gegenkante bleibt), Spurhöhe wirkt auf Clips, Licht, Spurköpfe.
// node tests/zoom-bars.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Geometrie einer Leiste (Bildschirmkoordinaten)
const geo = (page, axis) => page.evaluate((ax) => {
  const r = (s) => { const n = document.querySelector(`.zbar-${ax} ${s}`.trim()); const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const bar = document.querySelector(`.zbar-${ax}`).getBoundingClientRect();
  return { bar: { x: bar.x, y: bar.y, w: bar.width, h: bar.height }, thumb: r('.zbar-thumb'), a: r('.zbar-grip-a'), b: r('.zbar-grip-b') };
}, axis);
const view = (page) => page.evaluate(() => {
  const { ui } = window.loopwerk;
  const s = document.getElementById('arr-scroll');
  return { ppb: ui.pxPerBeat, tz: ui.trackZoom, left: s.scrollLeft, top: s.scrollTop, undo: window.loopwerk.store.undoStack.length };
});
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

async function desktop() {
  const app = await openApp({ viewport: { width: 1400, height: 820 } });
  const { page } = app;
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `zoom-${name}.png`) }); };
  try {
    // ---------- Aufbau ----------
    const init = await page.evaluate(() => {
      const s = document.getElementById('arr-scroll');
      const cs = getComputedStyle(s);
      return {
        bars: !!document.querySelector('.zbar-x .zbar-grip-a') && !!document.querySelector('.zbar-y .zbar-grip-b'),
        native: s.offsetWidth - s.clientWidth + (s.offsetHeight - s.clientHeight), hidden: cs.scrollbarWidth,
        tz: window.loopwerk.ui.trackZoom, ppb: window.loopwerk.ui.pxPerBeat,
        roles: [...document.querySelectorAll('.zbar-thumb')].map((n) => n.getAttribute('role')).join(),
      };
    });
    check('Zwei Leisten mit je zwei Greifern; native Scrollbalken weg', init.bars && init.native === 0 && init.hidden === 'none', JSON.stringify(init));
    check('Rollbalken sind für Hilfstechnik als „scrollbar“ ausgezeichnet', init.roles === 'scrollbar,scrollbar', init.roles);
    check('Grundwerte: Spurhöhe ×1', init.tz === 1);

    // ---------- Waagrecht: Daumen ziehen scrollt, Klick in die Bahn springt ----------
    let g = await geo(page, 'x');
    check('Daumen steht am Anfang und ist kürzer als die Bahn', near(g.thumb.x, g.bar.x, 1) && g.thumb.w < g.bar.w - 40, JSON.stringify(g.thumb));
    const range = await page.evaluate(() => { const s = document.getElementById('arr-scroll'); return s.scrollWidth - s.clientWidth; });
    const free = g.bar.w - g.thumb.w;
    let c = center(g.thumb);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 100, c.y, { steps: 6 });
    await page.mouse.up();
    let v = await view(page);
    check('Daumen ziehen scrollt anteilig', near(v.left, (100 / free) * range, 6), `${v.left} ≈ ${(100 / free) * range}`);
    g = await geo(page, 'x');
    check('Daumen folgt der Maus', near(g.thumb.x - g.bar.x, 100, 2), String(g.thumb.x - g.bar.x));
    check('Scrollen steht nicht im Undo-Verlauf', v.undo === 0);

    // Klick in die Bahn: Daumen springt dorthin (Mitte unter der Maus)
    const bx = g.bar.x + g.bar.w * 0.8;
    await page.mouse.click(bx, g.bar.y + g.bar.h / 2);
    g = await geo(page, 'x');
    check('Klick in die Bahn: Daumen springt unter die Maus', near(g.thumb.x + g.thumb.w / 2, bx, 3), `${g.thumb.x + g.thumb.w / 2} ≈ ${bx}`);

    // ---------- Waagrecht: Greifer ziehen zoomt, Gegenkante bleibt ----------
    await page.evaluate(() => { const s = document.getElementById('arr-scroll'); s.scrollLeft = 0; });
    await page.waitForTimeout(100);
    g = await geo(page, 'x');
    const p0 = (await view(page)).ppb;
    // rechter Greifer nach rechts: Daumen länger → mehr sichtbar → herauszoomen; linke Kante bleibt
    await page.mouse.move(g.b.x + g.b.w - 3, g.b.y + g.b.h / 2);
    await page.mouse.down();
    await page.mouse.move(g.b.x + g.b.w - 3 + 80, g.b.y + g.b.h / 2, { steps: 8 });
    await page.mouse.up();
    let g2 = await geo(page, 'x');
    let v2 = await view(page);
    check('Rechter Greifer nach rechts zoomt heraus', v2.ppb < p0 * 0.85, /* Karte offen: der sichtbare Teil ist schmaler, 80 px Bahn zoomen etwas weniger */ `${p0} → ${v2.ppb}`);
    check('… die linke Kante des Daumens bleibt stehen', near(g2.thumb.x, g.thumb.x, 2), `${g.thumb.x} → ${g2.thumb.x}`);
    check('… die rechte Kante folgt der Maus', near(g2.thumb.x + g2.thumb.w, g.thumb.x + g.thumb.w + 80, 10), `${g2.thumb.x + g2.thumb.w} ≈ ${g.thumb.x + g.thumb.w + 80}`);

    // linker Greifer nach rechts: Daumen kürzer → hineinzoomen; rechte Kante bleibt
    await page.evaluate(() => window.loopwerk.arranger.zoomTo(24));
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 300; });
    await page.waitForTimeout(150);
    g = await geo(page, 'x');
    const beatRight0 = await page.evaluate(() => { const { ui } = window.loopwerk; const s = document.getElementById('arr-scroll'); return (s.scrollLeft + s.clientWidth - 176) / ui.pxPerBeat; });
    await page.mouse.move(g.a.x + 3, g.a.y + g.a.h / 2);
    await page.mouse.down();
    await page.mouse.move(g.a.x + 3 + 40, g.a.y + g.a.h / 2, { steps: 8 });
    await page.mouse.up();
    g2 = await geo(page, 'x');
    v2 = await view(page);
    const beatRight1 = await page.evaluate(() => { const { ui } = window.loopwerk; const s = document.getElementById('arr-scroll'); return (s.scrollLeft + s.clientWidth - 176) / ui.pxPerBeat; });
    check('Linker Greifer nach rechts zoomt hinein', v2.ppb > 24 * 1.1, /* wie oben */ `24 → ${v2.ppb}`);
    check('… die rechte Kante des Daumens bleibt stehen', near(g2.thumb.x + g2.thumb.w, g.thumb.x + g.thumb.w, 3), `${g.thumb.x + g.thumb.w} → ${g2.thumb.x + g2.thumb.w}`);
    check('… und der Schlag am rechten Rand bleibt derselbe', near(beatRight1, beatRight0, 2), `${beatRight0.toFixed(1)} → ${beatRight1.toFixed(1)}`);
    check('Zoomen über Greifer steht nicht im Undo-Verlauf', v2.undo === 0);

    // ---------- Senkrecht: Spurhöhe ----------
    await page.evaluate(() => { window.loopwerk.arranger.zoomTo(24); window.loopwerk.arranger.setView({ tz: 2 }); document.getElementById('arr-scroll').scrollTop = 0; });
    await page.waitForTimeout(200);
    const tall = await page.evaluate(() => {
      const lane = document.querySelector('.lane');
      const clip = document.querySelector('.clip');
      const s = document.getElementById('arr-scroll');
      return { lane: lane.offsetHeight, clip: clip.offsetHeight, canvas: clip.querySelector('canvas').height, over: s.scrollHeight - s.clientHeight };
    });
    check('Spurhöhe ×2: Spuren doppelt so hoch', near(tall.lane, 116, 1), JSON.stringify(tall));
    check('… Clips füllen die Spur, Wellenform passt', near(tall.clip, 116 - 6, 1) && tall.canvas > 60, JSON.stringify(tall));
    check('… es gibt etwas zu scrollen', tall.over > 100, String(tall.over));
    await shot('desktop-hoch');

    let gy = await geo(page, 'y');
    check('Senkrechter Daumen ist kürzer als die Bahn', gy.thumb.h < gy.bar.h - 20 && near(gy.thumb.y, gy.bar.y, 1), JSON.stringify(gy.thumb));
    c = center(gy.thumb);
    const rangeY = await page.evaluate(() => { const s = document.getElementById('arr-scroll'); return s.scrollHeight - s.clientHeight; });
    const freeY = gy.bar.h - gy.thumb.h;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y + 60, { steps: 6 });
    await page.mouse.up();
    v = await view(page);
    check('Senkrechten Daumen ziehen scrollt die Spuren', near(v.top, (60 / freeY) * rangeY, 6), `${v.top} ≈ ${(60 / freeY) * rangeY}`);

    // unterer Greifer nach unten: Daumen länger → mehr Spuren sichtbar → Spuren niedriger; obere Kante bleibt
    await page.evaluate(() => { document.getElementById('arr-scroll').scrollTop = 0; });
    await page.waitForTimeout(100);
    gy = await geo(page, 'y');
    await page.mouse.move(gy.b.x + gy.b.w / 2, gy.b.y + gy.b.h - 3);
    await page.mouse.down();
    await page.mouse.move(gy.b.x + gy.b.w / 2, gy.b.y + gy.b.h - 3 + 70, { steps: 8 });
    await page.mouse.up();
    let gy2 = await geo(page, 'y');
    v2 = await view(page);
    check('Unterer Greifer nach unten: Spuren werden niedriger', v2.tz < 1.7, `2 → ${v2.tz}`);
    check('… die obere Kante des Daumens bleibt stehen', near(gy2.thumb.y, gy.thumb.y, 2), `${gy.thumb.y} → ${gy2.thumb.y}`);

    // oberer Greifer nach unten: Daumen kürzer → Spuren höher; untere Kante bleibt
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 1.8 }); });
    await page.evaluate(() => { const s = document.getElementById('arr-scroll'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(150);
    gy = await geo(page, 'y');
    const tz0 = (await view(page)).tz;
    await page.mouse.move(gy.a.x + gy.a.w / 2, gy.a.y + 3);
    await page.mouse.down();
    await page.mouse.move(gy.a.x + gy.a.w / 2, gy.a.y + 3 + 100, { steps: 8 });
    await page.mouse.up();
    gy2 = await geo(page, 'y');
    v2 = await view(page);
    check('Oberer Greifer nach unten: Spuren werden höher', v2.tz > tz0 * 1.2, `${tz0} → ${v2.tz}`);
    check('… die untere Kante des Daumens bleibt stehen', near(gy2.thumb.y + gy2.thumb.h, gy.thumb.y + gy.thumb.h, 3), `${gy.thumb.y + gy.thumb.h} → ${gy2.thumb.y + gy2.thumb.h}`);

    // ---------- Grenzen ----------
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 99 }));
    check('Spurhöhe hat eine Obergrenze (×3)', (await view(page)).tz === 3);
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 0.01 }));
    check('… und eine Untergrenze (×0,4)', (await view(page)).tz === 0.4);

    // ---------- Spurkopf nach Höhe ----------
    const headAt = (tz) => page.evaluate((z) => {
      window.loopwerk.arranger.setView({ tz: z });
      const row = document.querySelector('.track-row');
      const vis = (s) => { const n = row.querySelector(s); return !!n && n.offsetWidth > 0 && n.offsetHeight > 0; };
      const head = row.querySelector('.track-head').getBoundingClientRect();
      const inside = (s) => { const n = row.querySelector(s); const r = n.getBoundingClientRect(); return r.top >= head.top - 0.5 && r.bottom <= head.bottom + 0.5; };
      return { h: row.offsetHeight, name: vis('.track-name'), dot: vis('.track-dot'), mute: vis('.tbtn-mute'), solo: vis('.tbtn-solo'), vol: vis('.track-vol-wrap'), menu: vis('.tbtn-menu'), fit: vis('.tbtn-mute') ? inside('.tbtn-mute') : true };
    }, tz);
    let hd = await headAt(1);
    check('Normale Höhe: Name, M, S, Regler, Menü', hd.name && hd.mute && hd.solo && hd.vol && hd.menu && hd.fit, JSON.stringify(hd));
    hd = await headAt(0.6);
    check('Niedrig: eine Zeile mit Name, M, S – Regler weg', hd.name && hd.mute && hd.solo && !hd.vol && hd.fit, JSON.stringify(hd));
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => window.loopwerk.store.project.tracks[0].mute);
    await page.click('.track-row .tbtn-mute');
    const after = await page.evaluate(() => window.loopwerk.store.project.tracks[0].mute);
    check('… und M lässt sich dort bedienen', before !== after);
    await page.click('.track-row .tbtn-mute');
    await shot('desktop-niedrig');
    hd = await headAt(0.4);
    check('Sehr niedrig: nur Farbpunkt und Name', hd.name && hd.dot && !hd.mute && !hd.solo && !hd.vol, JSON.stringify(hd));
    const tiny = await page.evaluate(() => {
      const clip = document.querySelector('.clip');
      const label = clip.querySelector('.clip-label').getBoundingClientRect();
      const wave = clip.querySelector('canvas').getBoundingClientRect();
      return { clip: clip.offsetHeight, label: label.height, wave: wave.height, grips: getComputedStyle(clip.querySelector('.clip-grip')).display };
    });
    check('Sehr niedrig: Clip behält Wellenform und Namen, Griffe weichen', tiny.wave > 10 && tiny.label > 8 && tiny.grips === 'none', JSON.stringify(tiny));
    await shot('desktop-sehr-niedrig');

    // ---------- Mausrad: Strg waagrecht, Alt senkrecht ----------
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 1, ppb: 24 }); });
    const box = await page.locator('#arr-scroll').boundingBox();
    await page.mouse.move(box.x + 500, box.y + 200);
    await page.keyboard.down('Alt');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Alt');
    await page.waitForTimeout(100);
    v = await view(page);
    check('Alt + Mausrad ändert die Spurhöhe', v.tz > 1.2 && v.ppb === 24, JSON.stringify(v));
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const v3 = await view(page);
    check('Strg + Mausrad zoomt weiter waagrecht', v3.ppb > 30 && near(v3.tz, v.tz, 0.001), JSON.stringify(v3));

    // Der Strich unter der Maus bleibt beim senkrechten Zoomen an Ort und Stelle
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 1, ppb: 24 }); document.getElementById('arr-scroll').scrollTop = 0; });
    await page.waitForTimeout(100);
    const rowY = await page.evaluate(() => { const r = document.querySelectorAll('.track-row')[3].getBoundingClientRect(); return r.top + r.height / 2; });
    await page.mouse.move(box.x + 500, rowY);
    await page.keyboard.down('Alt');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Alt');
    await page.waitForTimeout(100);
    const rowY2 = await page.evaluate(() => { const r = document.querySelectorAll('.track-row')[3].getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    check('Senkrechter Zoom hält die Spur unter der Maus fest', rowY2.top < rowY && rowY2.bottom > rowY, `${rowY} in ${rowY2.top}–${rowY2.bottom}`);

    // ---------- Knöpfe ----------
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 1 }));
    // Umbau Scheibe 5: die Zoom-Knöpfe sind versteckt; ihre Funktion bleibt im Aufbau
    await page.dispatchEvent('#zoomy-in', 'click');
    const k1 = (await view(page)).tz;
    await page.dispatchEvent('#zoomy-out', 'click');
    await page.dispatchEvent('#zoomy-out', 'click');
    const k2 = (await view(page)).tz;
    check('Knöpfe „Spuren höher/niedriger“', k1 > 1 && k2 < 1, `${k1}, ${k2}`);

    // ---------- Tastatur am Daumen ----------
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 1, ppb: 24 }); document.getElementById('arr-scroll').scrollLeft = 0; });
    await page.focus('.zbar-x .zbar-thumb');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const kl = (await view(page)).left;
    await page.keyboard.press('+');
    const kp = (await view(page)).ppb;
    check('Tastatur am Daumen: Pfeile scrollen, Plus zoomt', kl === 80 && kp > 24, `${kl}, ${kp}`);

    // ---------- Clips, Rahmen und Ablegen bei anderer Höhe ----------
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 2, ppb: 24 }); const s = document.getElementById('arr-scroll'); s.scrollLeft = 0; s.scrollTop = 0; });
    await page.waitForTimeout(200);
    // Rahmen über zwei Spuren
    const lanes = await page.evaluate(() => [...document.querySelectorAll('.lane')].slice(0, 3).map((l) => { const r = l.getBoundingClientRect(); return { y: r.y, h: r.height, x: r.x }; }));
    const sx = lanes[0].x + 6;
    await page.mouse.move(sx, lanes[0].y + 4);
    await page.mouse.down();
    await page.mouse.move(sx + 900, lanes[2].y + lanes[2].h - 4, { steps: 10 });
    await page.mouse.up();
    const sel = await page.evaluate(() => window.loopwerk.ui.selectedIds().length);
    check('Rahmen-Auswahl über hohe Spuren', sel >= 2, String(sel));
    // Ablegen: Vorschau so hoch wie die Spur
    const drop = await page.evaluate(() => {
      const { arranger, library } = window.loopwerk;
      const lane = document.querySelectorAll('.lane')[1];
      const r = lane.getBoundingClientRect();
      const sample = library.get('test-click');
      arranger.dropTargetAt(r.x + 100, r.y + r.height / 2, sample);
      const p = document.querySelector('.drop-preview');
      const out = { h: p.offsetHeight, lane: lane.offsetHeight, inLane: p.parentElement === lane };
      arranger.clearDropPreview();
      return out;
    });
    check('Drop-Vorschau passt zur Spurhöhe', drop.inLane && near(drop.h, drop.lane - 6, 1), JSON.stringify(drop));
    // Clip anfassen: Lautstärke-Griff sitzt auf der Hüllkurve
    const grip = await page.evaluate(() => {
      const clip = document.querySelector('.clip');
      const canvas = clip.querySelector('canvas');
      const vol = clip.querySelector('.clip-vol');
      const cr = clip.getBoundingClientRect();
      const vr = vol.getBoundingClientRect();
      return { dy: vr.top + vr.height / 2 - cr.top, canvasTop: canvas.offsetTop, h: canvas.clientHeight };
    });
    check('Griffe sitzen oben auf der Hüllkurve (Gain 1)', near(grip.dy, grip.canvasTop + 1 + 1, 3), JSON.stringify(grip));

    // ---------- Licht ----------
    await page.evaluate(() => { window.loopwerk.engine.setPosition(16); });
    await page.evaluate(() => window.loopwerk.engine.play());
    await page.waitForTimeout(700);
    const glow = await page.evaluate(() => {
      const beam = document.querySelector('canvas.beam');
      const rows = document.querySelector('.rows');
      return { shown: !beam.hidden, h: parseFloat(beam.style.height), rows: rows.offsetHeight };
    });
    check('Licht an der Marke deckt die hohen Spuren', glow.shown && near(glow.h, glow.rows, 1), JSON.stringify(glow));
    await shot('desktop-licht');
    await page.evaluate(() => window.loopwerk.engine.pause());

    // ---------- Merken ----------
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 1.5, ppb: 40 }));
    const stored = await page.evaluate(() => localStorage.getItem('loopwerk.zoom'));
    check('Zoom-Stufe liegt im Browser-Speicher', JSON.parse(stored).trackZoom === 1.5 && JSON.parse(stored).ppb === 40, stored);
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });
    const back = await view(page);
    check('… und kommt nach dem Neuladen wieder', back.tz === 1.5 && back.ppb === 40, JSON.stringify(back));
    await page.evaluate(() => localStorage.setItem('loopwerk.zoom', '{"ppb":1e9,"trackZoom":"x"}'));
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });
    const bad = await view(page);
    check('Unsinnige gespeicherte Werte werden begrenzt', bad.ppb === 192 && bad.tz === 1, JSON.stringify(bad));
    await page.evaluate(() => localStorage.removeItem('loopwerk.zoom'));

    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } finally {
    await app.close();
  }
}

async function tablet() {
  const app = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  const cdp = await page.context().newCDPSession(page);
  const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  async function drag(x, y, dx, dy, steps = 10) {
    await T('touchStart', [{ x, y }]);
    for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }]); await page.waitForTimeout(16); }
    await T('touchEnd', []);
    await page.waitForTimeout(250);
  }
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `zoom-${name}.png`) }); };
  try {
    check('Tablet: Greifer sind da', await page.evaluate(() => getComputedStyle(document.querySelector('.zbar-x .zbar-grip-a')).display !== 'none'));
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 2 }));
    await page.waitForTimeout(200);
    await shot('tablet');
    // Trefferflächen: Greifer und Daumen
    const list = await page.evaluate(measureTargets, '.zbar-grip, .zbar-thumb');
    const bad = list.filter((x) => x.w < 44 || x.h < 44);
    check('Tablet: Greifer und Daumen ≥ 44 px', list.length >= 4 && bad.length === 0, bad.length ? bad.map((x) => `${x.label} ${x.w}×${x.h}`).join(' | ') : `${list.length} Elemente`);
    // Greifer mit dem Finger ziehen
    let g = await geo(page, 'y');
    const tz0 = (await view(page)).tz;
    await drag(g.b.x + g.b.w / 2, g.b.y + g.b.h - 10, 0, 90);
    let g2 = await geo(page, 'y');
    const v = await view(page);
    check('Tablet: unteren Greifer mit dem Finger ziehen ändert die Spurhöhe', v.tz < tz0 * 0.9, `${tz0} → ${v.tz}`);
    check('Tablet: obere Kante bleibt', near(g2.thumb.y, g.thumb.y, 3), `${g.thumb.y} → ${g2.thumb.y}`);
    // Daumen mit dem Finger ziehen scrollt
    await page.evaluate(() => { window.loopwerk.arranger.setView({ tz: 2.5 }); document.getElementById('arr-scroll').scrollTop = 0; });
    await page.waitForTimeout(200);
    g = await geo(page, 'y');
    const cc = center(g.thumb);
    await drag(cc.x, cc.y, 0, 60);
    check('Tablet: Daumen mit dem Finger ziehen scrollt', (await view(page)).top > 40, String((await view(page)).top));
    // Waagrecht
    g = await geo(page, 'x');
    const p0 = (await view(page)).ppb;
    await drag(g.b.x + g.b.w - 10, g.b.y + g.b.h / 2, -60, 0);
    check('Tablet: rechten Greifer nach links ziehen zoomt hinein', (await view(page)).ppb > p0 * 1.1, `${p0} → ${(await view(page)).ppb}`);
    // Spurkopf: Finger-Knöpfe bei niedriger Höhe
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 0.7 }));
    await page.waitForTimeout(150);
    const tl = await page.evaluate(measureTargets);
    const small = tl.filter((x) => (x.w < 44 || x.h < 44) && !/clip-(trim|handle|grip)|track-name|pat-key|^a\./.test(x.label));
    check('Tablet: niedrige Spuren – Tippflächen weiter ≥ 44 px', small.length === 0, small.map((x) => `${x.label} ${x.w}×${x.h}`).join(' | '));
    await shot('tablet-niedrig');
    // Zwei Finger senkrecht: Spurhöhe
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 1, ppb: 24 }));
    const box = await page.locator('#arr-scroll').boundingBox();
    const cx = box.x + 500;
    const cy = box.y + 300;
    await T('touchStart', [{ x: cx, y: cy - 30, id: 0 }, { x: cx, y: cy + 30, id: 1 }]);
    for (let i = 1; i <= 10; i++) {
      await T('touchMove', [{ x: cx, y: cy - 30 - i * 8, id: 0 }, { x: cx, y: cy + 30 + i * 8, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await T('touchEnd', []);
    await page.waitForTimeout(200);
    const pv = await view(page);
    check('Tablet: Zwei Finger senkrecht auseinander ändern die Spurhöhe, nicht die Zeit', pv.tz > 1.5 && pv.ppb === 24, JSON.stringify(pv));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('Tablet: keine Querverschiebung', over <= 0, String(over));
    check('Keine Fehler in der Konsole (Tablet)', app.errors.length === 0, app.errors.join(' | '));
  } finally {
    await app.close();
  }
}

async function phone() {
  const app = await openApp({ viewport: { width: 400, height: 800 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  const cdp = await page.context().newCDPSession(page);
  const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `zoom-${name}.png`) }); };
  try {
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 1.6 }));
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => {
      const x = document.querySelector('.zbar-x');
      const y = document.querySelector('.zbar-y');
      const gr = document.querySelector('.zbar-y .zbar-grip-a');
      const thumb = y.querySelector('.zbar-thumb').getBoundingClientRect();
      return { x: getComputedStyle(x).display, grip: getComputedStyle(gr).display, yw: y.getBoundingClientRect().width, thumbH: thumb.height, over: document.documentElement.scrollWidth - innerWidth };
    });
    check('Handy: nur der schmale senkrechte Streifen, keine Greifer', st.x === 'none' && st.grip === 'none' && st.yw <= 16 && st.thumbH > 40, JSON.stringify(st));
    check('Handy: keine Querverschiebung', st.over <= 0, String(st.over));
    await shot('handy');
    // Daumen ziehen scrollt
    const g = await geo(page, 'y');
    const c = center(g.thumb);
    await T('touchStart', [{ x: c.x, y: c.y }]);
    for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: c.x, y: c.y + i * 8 }]); await page.waitForTimeout(16); }
    await T('touchEnd', []);
    await page.waitForTimeout(200);
    check('Handy: Daumen ziehen scrollt die Spuren', (await view(page)).top > 20, String((await view(page)).top));
    // Daumen-Trefferfläche
    const list = await page.evaluate(measureTargets, '.zbar-thumb');
    const bad = list.filter((x) => x.w < 44 || x.h < 44);
    check('Handy: Daumen ≥ 44 px', list.length >= 1 && bad.length === 0, bad.map((x) => `${x.label} ${x.w}×${x.h}`).join(' | '));
    // Zwei Finger senkrecht
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 1, ppb: 24 }));
    const box = await page.locator('#arr-scroll').boundingBox();
    const cx = box.x + 250;
    const cy = box.y + 250;
    await T('touchStart', [{ x: cx, y: cy - 30, id: 0 }, { x: cx, y: cy + 30, id: 1 }]);
    for (let i = 1; i <= 10; i++) {
      await T('touchMove', [{ x: cx, y: cy - 30 - i * 8, id: 0 }, { x: cx, y: cy + 30 + i * 8, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await T('touchEnd', []);
    await page.waitForTimeout(200);
    const pv = await view(page);
    check('Handy: Zwei Finger senkrecht ändern die Spurhöhe', pv.tz > 1.5 && pv.ppb === 24, JSON.stringify(pv));
    const rowState = () => page.evaluate(() => {
      const row = document.querySelector('.track-row');
      return { h: row.offsetHeight, name: row.querySelector('.track-name').offsetWidth > 0, mute: row.querySelector('.tbtn-mute').offsetWidth > 0 };
    });
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 0.7 }));
    await page.waitForTimeout(200);
    await shot('handy-niedrig');
    const small = await rowState();
    check('Handy: bei niedriger Spur bleiben Name sowie M und S', small.name && small.mute, JSON.stringify(small));
    await page.evaluate(() => window.loopwerk.arranger.setView({ tz: 0.4 }));
    await page.waitForTimeout(200);
    await shot('handy-sehr-niedrig');
    const tiny = await rowState();
    check('Handy: bei sehr niedriger Spur nur der Name', tiny.name && !tiny.mute, JSON.stringify(tiny));
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } finally {
    await app.close();
  }
}

(async () => {
  try {
    await desktop();
    await tablet();
    await phone();
  } catch (e) {
    check('Test ohne Ausnahme', false, e.stack || String(e));
  }
  finish();
})();
