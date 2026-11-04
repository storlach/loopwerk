// UI-Paket: (1) Stumm aufheben bringt die Farbe zurück, (2) Inspektor trennt Clip und Spur, (3) Folgen der Marke endet bei
// bewusster Bewegung der Ansicht, (4) Pfeil-Knopf klappt die Kurve auf, (5) Clip-Editor ohne Reiter.
// node tests/ui-paket.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Farbe der Wellenform eines Clips: erstes deckendes Pixel der Zeichenfläche (r,g,b,a) – grau, wenn r≈g≈b
const waveColor = (page, trackId) => page.evaluate((tid) => {
  const cv = document.querySelector(`.lane[data-track-id="${tid}"] .clip-wave`);
  if (!cv) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  return null;
}, trackId);
const sat = (c) => (c ? Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) : -1);
const sameColor = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 6;

// ---------- 1. Stumm / Solo aufheben ----------
async function muteTest(vp, name) {
  const app = await openApp({ viewport: vp, hasTouch: vp.width < 800 });
  const { page } = app;
  try {
    const ids = await page.evaluate(() => window.loopwerk.store.project.tracks.filter((t) => t.clips.length).map((t) => t.id));
    const t1 = ids[0];
    const t2 = ids[1];
    await page.waitForTimeout(300);
    const before = await waveColor(page, t1);
    check(`${name}: Wellenform ist farbig, bevor stumm geschaltet wird`, sat(before) > 20, JSON.stringify(before));
    const mute = page.locator(`.track-row:has(.lane[data-track-id="${t1}"]) .tbtn-mute`);
    await mute.click();
    await page.waitForTimeout(250);
    const during = await waveColor(page, t1);
    check(`${name}: stumme Spur ist grau`, sat(during) <= 20, JSON.stringify(during));
    await mute.click();
    await page.waitForTimeout(250);
    const after = await waveColor(page, t1);
    check(`${name}: nach dem Aufheben von Stumm kommt die Farbe zurück`, sameColor(before, after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

    // Solo auf Spur 2: Spur 1 wird still (nicht stumm), danach wieder farbig
    const solo = page.locator(`.track-row:has(.lane[data-track-id="${t2}"]) .tbtn-solo`);
    await solo.click();
    await page.waitForTimeout(250);
    const viaSolo = await waveColor(page, t1);
    check(`${name}: durch Solo einer anderen Spur ist Spur 1 grau`, sat(viaSolo) <= 20, JSON.stringify(viaSolo));
    await solo.click();
    await page.waitForTimeout(250);
    const soloOff = await waveColor(page, t1);
    check(`${name}: Solo aufheben bringt die Farbe zurück`, sameColor(before, soloOff), `${JSON.stringify(before)} → ${JSON.stringify(soloOff)}`);

    // Zusammenspiel: stumm und Solo zugleich, dann nacheinander lösen
    await mute.click();
    await solo.click();
    await page.waitForTimeout(150);
    await mute.click();
    await solo.click();
    await page.waitForTimeout(250);
    const both = await waveColor(page, t1);
    check(`${name}: Stumm und Solo nacheinander gelöst: Farbe zurück`, sameColor(before, both), JSON.stringify(both));

    // Während der Wiedergabe (Spur leuchtet)
    await page.evaluate(() => window.loopwerk.engine.play(0));
    await page.waitForTimeout(300);
    await page.evaluate((tid) => window.loopwerk.store.setTrack(tid, { mute: true }), t1);
    await page.waitForTimeout(300);
    await page.evaluate((tid) => window.loopwerk.store.setTrack(tid, { mute: false }), t1);
    await page.waitForTimeout(300);
    const live = await waveColor(page, t1);
    await page.evaluate(() => window.loopwerk.engine.stop());
    check(`${name}: auch während der Wiedergabe kommt die Farbe zurück`, sameColor(before, live), JSON.stringify(live));
    const st = await page.evaluate((tid) => document.querySelector(`.lane[data-track-id="${tid}"]`).closest('.track-row').classList.contains('silent'), t1);
    check(`${name}: Spur ist nicht mehr „still“ markiert`, !st);
    check(`${name}: keine Fehler in der Konsole`, app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check(`${name}: Ablauf ohne Ausnahme`, false, e.stack); }
  await app.close();
}

// ---------- 2. Inspektor: Clip und Spur getrennt ----------
async function inspectorTest() {
  const app = await openApp({ viewport: { width: 1400, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(() => { const { store, ui } = window.loopwerk; const t = store.project.tracks.find((x) => x.clips.length); ui.select(t.clips[0].id); });
    await page.waitForTimeout(250);
    const d = await page.evaluate(() => {
      const { store, ui, library } = window.loopwerk;
      const f = store.findClip(ui.selectedClipId);
      const q = (s) => document.querySelector(s);
      const vis = (n) => !!n && n.offsetParent !== null;
      const cs = q('#insp .insp-clip'); const ts = q('#insp .insp-track');
      const lab = (sec) => [...sec.querySelectorAll('.insp-row > span:first-child')].map((n) => n.textContent);
      const speed = cs.querySelector('.insp-clip-speed');
      return {
        mode: q('#insp').dataset.mode,
        both: vis(cs) && vis(ts),
        clipHead: cs.querySelector('.insp-title').textContent.replace(/\s+/g, ' '),
        trackHead: ts.querySelector('.insp-title').textContent.replace(/\s+/g, ' '),
        trackName: f.track.name,
        clipLabels: lab(cs), trackLabels: lab(ts),
        sepBorder: getComputedStyle(ts).borderTopWidth,
        speedHasRun: !!speed && !!speed.querySelector('.insp-speed') && /Geschwindigkeit/.test(speed.textContent),
        order: cs.compareDocumentPosition(ts) & Node.DOCUMENT_POSITION_FOLLOWING ? 'clip-vor-spur' : 'falsch',
        clipCat: [...cs.classList].find((c) => c.startsWith('cat-')) || '',
        sample: library.get(f.clip.sampleId).name,
      };
    });
    check('Inspektor: bei einem Clip zwei Abschnitte, Clip oben, Spur darunter', d.mode === 'clip' && d.both && d.order === 'clip-vor-spur', JSON.stringify(d));
    check('Überschriften „CLIP · Name“ und „SPUR · Name“', d.clipHead === `Clip·${d.sample}` && d.trackHead === `Spur·${d.trackName}`, `${d.clipHead} | ${d.trackHead}`);
    check('Eindeutige Begriffe: Clip-Lautstärke vs. Spur-Lautstärke', d.clipLabels.includes('Clip-Lautstärke') && d.trackLabels.includes('Spur-Lautstärke') && !d.clipLabels.includes('Spur-Lautstärke'), JSON.stringify([d.clipLabels, d.trackLabels]));
    check('Sichtbare Trennung zwischen den Abschnitten', parseFloat(d.sepBorder) >= 2, d.sepBorder);
    check('Geschwindigkeit liegt im Container .insp-clip-speed des Clip-Abschnitts', d.speedHasRun);
    check('Kategoriefarbe nur als Akzent (Klasse cat-… am Clip-Abschnitt)', /^cat-/.test(d.clipCat), d.clipCat);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'paket-desktop-inspektor.png') });
    await page.evaluate(() => { const { store, ui } = window.loopwerk; ui.selectTrack(store.project.tracks[0].id); });
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => ({ mode: document.getElementById('insp').dataset.mode, clip: !!document.querySelector('#insp .insp-clip')?.offsetParent, track: !!document.querySelector('#insp .insp-track')?.offsetParent }));
    check('Nur Spur gewählt: nur der Spur-Abschnitt', t.mode === 'track' && !t.clip && t.track, JSON.stringify(t));
    check('Inspektor: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check('Inspektor: Ablauf ohne Ausnahme', false, e.stack); }
  await app.close();
}

// Handy: Clip-Leiste trägt dieselbe Überschrift und dieselben Begriffe
async function clipbarTest() {
  const app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const { page } = app;
  try {
    await page.evaluate(() => { const { store, ui } = window.loopwerk; ui.select(store.project.tracks.find((x) => x.clips.length).clips[0].id); });
    await page.waitForTimeout(250);
    await page.click('#cb-levels');
    await page.waitForTimeout(250);
    const d = await page.evaluate(() => {
      const lv = document.getElementById('clip-levels');
      const { store, ui, library } = window.loopwerk;
      return {
        shown: !!lv.offsetParent, head: lv.querySelector('.lvl-head').textContent.replace(/\s+/g, ' '),
        labels: [...lv.querySelectorAll('.lvl > span:first-child')].map((n) => n.textContent),
        speed: !!lv.querySelector('#lvl-speed-row .lvl-speed'),
        scroll: document.documentElement.scrollWidth - innerWidth,
        sample: library.get(store.findClip(ui.selectedClipId).clip.sampleId).name,
      };
    });
    check('Handy: Clip-Leiste zeigt „Clip · Name“ und „Clip-Lautstärke“', d.shown && d.head === `Clip·${d.sample}` && d.labels[0] === 'Clip-Lautstärke', JSON.stringify(d));
    check('Handy: Geschwindigkeit liegt in der Clip-Leiste (#lvl-speed-row)', d.speed);
    check('Handy: kein waagrechtes Scrollen', d.scroll <= 0, String(d.scroll));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'paket-handy-clipleiste.png') });
    check('Handy-Clip-Leiste: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check('Clip-Leiste: Ablauf ohne Ausnahme', false, e.stack); }
  await app.close();
}

// ---------- 3. Folgen der Marke ----------
const scrollLeft = (page) => page.evaluate(() => document.getElementById('arr-scroll').scrollLeft);
const chipShown = (page) => page.evaluate(() => { const c = document.getElementById('follow-btn'); return !!c && !c.hidden; });
async function followTest() {
  const app = await openApp({ viewport: { width: 1400, height: 900 } });
  const { page } = app;
  try {
    const box = await page.locator('#arr-scroll').boundingBox();
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Programmatisch: Start weit rechts – die Ansicht folgt der Marke
    await page.evaluate(() => window.loopwerk.engine.play(100));
    await page.waitForTimeout(500);
    const f1 = await scrollLeft(page);
    check('Folgen: Start außerhalb der Ansicht holt die Ansicht zur Marke', f1 > 500, String(f1));
    // Schublade schiebt mit (programmatisch): kein Eingriff der Person
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForTimeout(500);
    check('Schublade öffnen und schließen beendet das Folgen nicht', !(await chipShown(page)) && Math.abs((await scrollLeft(page)) - f1) < 80, `${f1} → ${await scrollLeft(page)}`);
    // Rad: bewusste Bewegung
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(-600, 0);
    await page.waitForTimeout(400);
    const f2 = await scrollLeft(page);
    check('Rad während der Wiedergabe verschiebt die Ansicht', f2 < f1 - 300, `${f1} → ${f2}`);
    await page.waitForTimeout(1200);
    const f3 = await scrollLeft(page);
    check('Danach folgt die Ansicht der Marke nicht mehr', Math.abs(f3 - f2) < 2, `${f2} → ${f3}`);
    check('Hinweis „Marke folgen“ erscheint, wenn die Marke außerhalb ist', await chipShown(page));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'paket-desktop-folgen.png') });
    await page.click('#follow-btn');
    await page.waitForTimeout(500);
    const f4 = await scrollLeft(page);
    check('„Marke folgen“ holt die Ansicht zur Marke zurück', f4 > f3 + 300, `${f3} → ${f4}`);
    await page.evaluate(() => window.loopwerk.engine.stop());

    // Nächster Start folgt wieder
    await page.evaluate(() => window.loopwerk.engine.play(100));
    await page.waitForTimeout(500);
    await page.mouse.wheel(-600, 0);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.loopwerk.engine.stop());
    await page.evaluate(() => window.loopwerk.engine.play(100));
    await page.waitForTimeout(500);
    const f5 = await scrollLeft(page);
    check('Beim nächsten Start folgt die Ansicht wieder', f5 > 500, String(f5));

    // Scrollbalken ziehen
    const t0 = await scrollLeft(page);
    const th = await page.locator('.zbar-x .zbar-thumb').boundingBox();
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2);
    await page.mouse.down();
    await page.mouse.move(th.x + th.width / 2 - 200, th.y + th.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const t1 = await scrollLeft(page);
    await page.waitForTimeout(800);
    const t2 = await scrollLeft(page);
    check('Scrollbalken ziehen beendet das Folgen', t1 < t0 - 100 && Math.abs(t2 - t1) < 2, `${t0} → ${t1} → ${t2}`);
    await page.evaluate(() => window.loopwerk.engine.stop());

    // Zoomen (Strg + Rad)
    await page.evaluate(() => window.loopwerk.engine.play(100));
    await page.waitForTimeout(500);
    await page.mouse.move(mid.x, mid.y);
    const p0 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    const p1 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    const z1 = await scrollLeft(page);
    await page.waitForTimeout(1200);
    const z2 = await scrollLeft(page);
    check('Zoomen während der Wiedergabe beendet das Folgen', p1 !== p0 && Math.abs(z2 - z1) < 2, `ppb ${p0} → ${p1}, Ansicht ${z1} → ${z2}`);
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Folgen: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check('Folgen: Ablauf ohne Ausnahme', false, e.stack); }
  await app.close();

  // Wischen am Handy (Touch-Geste über CDP)
  const m = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const pg = m.page;
    await pg.evaluate(() => window.loopwerk.engine.play(100));
    await pg.waitForTimeout(600);
    const a = await scrollLeft(pg);
    const cdp = await pg.context().newCDPSession(pg);
    // Finger nach rechts ziehen = Ansicht nach links
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 400 }] });
    await touch('touchStart', 100);
    for (let i = 1; i <= 10; i++) await touch('touchMove', 100 + i * 20);
    await touch('touchEnd');
    await pg.waitForTimeout(500);
    const b = await scrollLeft(pg);
    await pg.waitForTimeout(1200);
    const c = await scrollLeft(pg);
    check('Handy: Wischen beendet das Folgen', b < a - 50 && Math.abs(c - b) < 2, `${a} → ${b} → ${c}`);
    await pg.evaluate(() => window.loopwerk.engine.stop());
  } catch (e) { check('Handy-Wischen: Ablauf ohne Ausnahme', false, e.stack); }
  await m.close();
}

// ---------- 4. Pfeil-Knopf für die Kurve ----------
async function chevronTest(vp, name, touch) {
  const app = await openApp({ viewport: vp, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  const { page } = app;
  try {
    const t1 = await page.evaluate(() => window.loopwerk.store.project.tracks[0].id);
    const sel = `.track-row:has(.lane[data-track-id="${t1}"]) .tbtn-chev`;
    const chev = page.locator(sel);
    const measure = () => page.evaluate((s) => {
      const b = document.querySelector(s);
      const menu = b.closest('.track-row').querySelector('.tbtn-menu');
      const r = b.getBoundingClientRect(); const mr = menu.getBoundingClientRect();
      // Trefferfläche wie in touch-targets.cjs: von der Mitte aus gehen, solange der Knopf getroffen wird
      const owns = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && b.contains(h); };
      const cx = Math.round(r.left + r.width / 2); const cy = Math.round(r.top + r.height / 2);
      let l = cx; let rr = cx; let t = cy; let bt = cy;
      while (l > cx - 60 && owns(l - 1, cy)) l--;
      while (rr < cx + 60 && owns(rr + 1, cy)) rr++;
      while (t > cy - 60 && owns(cx, t - 1)) t--;
      while (bt < cy + 60 && owns(cx, bt + 1)) bt++;
      return { w: rr - l + 1, h: bt - t + 1, below: r.top >= mr.bottom - 2, expanded: b.getAttribute('aria-expanded'), vis: r.width > 0 };
    }, sel);
    const m = await measure();
    check(`${name}: Pfeil-Knopf im Spurkopf unter den drei Punkten`, m.vis && (m.below || touch) && m.expanded === 'false', JSON.stringify(m));
    if (touch) check(`${name}: Pfeil-Knopf ist am Finger mindestens 44 × 44 px groß`, m.w >= 44 && m.h >= 44, `${m.w}×${m.h}`);
    await chev.click();
    await page.waitForTimeout(250);
    const open = await page.evaluate((s) => ({ row: !!document.querySelector('.auto-row'), exp: document.querySelector(s).getAttribute('aria-expanded'), rot: getComputedStyle(document.querySelector(s + ' svg')).transform }), sel);
    const isOpen = await page.evaluate((id) => window.loopwerk.ui.autoLane.isOpen(id), t1);
    check(`${name}: Tippen öffnet die Kurvenzeile, aria-expanded=true, Pfeil gedreht`, isOpen && open.row && open.exp === 'true' && open.rot !== 'none', JSON.stringify(open));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `paket-${name.toLowerCase()}-kurve.png`) });
    await chev.click();
    await page.waitForTimeout(250);
    const closed = await page.evaluate((id) => window.loopwerk.ui.autoLane.isOpen(id), t1);
    check(`${name}: nochmal tippen schließt sie`, !closed && (await chev.getAttribute('aria-expanded')) === 'false');

    // Pfeil folgt dem Zustand, auch wenn die Kurve anders geöffnet wird (Taste A)
    await page.evaluate((id) => window.loopwerk.ui.autoLane.toggle(id), t1);
    await page.waitForTimeout(200);
    check(`${name}: Pfeil folgt dem Zustand (Öffnen ohne Pfeil)`, (await chev.getAttribute('aria-expanded')) === 'true');
    await page.evaluate((id) => window.loopwerk.ui.autoLane.toggle(id), t1);
    await page.waitForTimeout(200);

    // Summen-Zeile
    const s = page.locator('#sum-toggle');
    await s.scrollIntoViewIfNeeded();
    const sm = await page.evaluate(() => { const b = document.getElementById('sum-toggle'); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), exp: b.getAttribute('aria-expanded') }; });
    if (touch) check(`${name}: Summen-Knopf ist am Finger mindestens 44 px hoch`, sm.h >= 44 && sm.w >= 44, JSON.stringify(sm));
    await s.click();
    await page.waitForTimeout(250);
    const so = await page.evaluate(() => ({ open: window.loopwerk.ui.autoLane.isOpen('master'), exp: document.getElementById('sum-toggle').getAttribute('aria-expanded') }));
    check(`${name}: Summen-Knopf öffnet die Summen-Kurve`, so.open && so.exp === 'true', JSON.stringify(so));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `paket-${name.toLowerCase()}-summe.png`) });
    await s.click();
    await page.waitForTimeout(200);
    check(`${name}: und schließt sie wieder`, !(await page.evaluate(() => window.loopwerk.ui.autoLane.isOpen('master'))));

    // Niedrige Spuren: Pfeil bleibt sichtbar und bedienbar
    for (const [z, label] of [[0.55, 'niedrig'], [0.3, 'ganz niedrig']]) {
      await page.evaluate((zz) => { window.loopwerk.ui.trackZoom = zz; window.loopwerk.arranger.render(true); }, z);
      await page.waitForTimeout(200);
      const low = await page.evaluate((s0) => {
        const b = document.querySelector(s0); const r = b.getBoundingClientRect(); const row = b.closest('.track-row').getBoundingClientRect();
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inRow: r.top >= row.top - 1 && r.bottom <= row.bottom + 1, hit: !!h && b.contains(h), w: Math.round(r.width), h: Math.round(r.height), rowH: Math.round(row.height) };
      }, sel);
      check(`${name}: bei ${label}er Spur liegt der Pfeil in der Zeile und ist treffbar`, low.inRow && low.hit, JSON.stringify(low));
      if (SHOTS && z === 0.3) await page.screenshot({ path: path.join(SHOT_DIR, `paket-${name.toLowerCase()}-niedrig.png`) });
    }
    check(`${name}: keine Fehler in der Konsole`, app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check(`${name}: Ablauf ohne Ausnahme`, false, e.stack); }
  await app.close();
}

// ---------- 5. Clip-Editor ohne Reiter ----------
async function editorTest(vp, name, touch) {
  const app = await openApp({ viewport: vp, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  const { page } = app;
  try {
    await page.evaluate(() => { const { store, editor } = window.loopwerk; editor.open(store.project.tracks.find((x) => x.clips.length).clips[0].id); });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const ed = document.getElementById('editor');
      const groups = [...ed.querySelectorAll('.ed-group')];
      const vis = (n) => n.offsetParent !== null && n.getBoundingClientRect().height > 0;
      const wave = ed.querySelector('.ed-wave-wrap').getBoundingClientRect();
      const gr = groups.map((g) => g.getBoundingClientRect());
      return {
        tabs: ed.querySelectorAll('.ed-tab, [role="tab"], .ed-tabs').length,
        visible: groups.filter(vis).length, total: groups.length,
        labelled: groups.every((g) => g.querySelector('.ed-group-label') && g.getAttribute('aria-label')),
        waveVisible: wave.height > 40 && wave.top >= 0,
        columns: new Set(gr.map((r) => Math.round(r.left))).size,
        stacked: gr.every((r, i) => i === 0 || r.top >= gr[i - 1].bottom - 1),
        overflowX: document.documentElement.scrollWidth - innerWidth,
      };
    });
    check(`${name}: Editor ohne Reiter, alle Werkzeug-Gruppen sichtbar und beschriftet`, d.tabs === 0 && d.visible === d.total && d.total >= 6 && d.labelled, JSON.stringify(d));
    check(`${name}: Wellenform bleibt sichtbar`, d.waveVisible);
    if (touch) check(`${name}: Gruppen stehen untereinander`, d.columns === 1 && d.stacked, JSON.stringify({ c: d.columns, s: d.stacked }));
    else check(`${name}: Gruppen brechen in Spalten um`, d.columns >= 2, String(d.columns));
    check(`${name}: kein waagrechtes Scrollen`, d.overflowX <= 0, String(d.overflowX));
    const pin = await page.evaluate(() => {
      const w = document.querySelector('#editor .ed-wave-wrap'); const hd = document.querySelector('#editor .ed-headrow');
      const body = document.querySelector('#editor .editor-body');
      const t0 = [w.getBoundingClientRect().top, hd.getBoundingClientRect().top];
      body.scrollTop = body.scrollHeight;
      const t1 = [w.getBoundingClientRect().top, hd.getBoundingClientRect().top];
      return { t0, t1, scrolls: body.scrollTop > 0 || body.scrollHeight <= body.clientHeight };
    });
    check(`${name}: Kopf und Wellenform bleiben beim Scrollen der Werkzeuge oben stehen`, pin.scrolls && pin.t0[0] === pin.t1[0] && pin.t0[1] === pin.t1[1], JSON.stringify(pin));
    const reach = await page.evaluate(() => ['ed-crop', 'ed-pitch-up', 'ed-autotune', 'ed-stems', 'ed-loop'].map((id) => { const b = document.getElementById(id); return [id, b.offsetParent !== null && b.getBoundingClientRect().width > 0]; }));
    check(`${name}: Zuschneiden, Tonhöhe, Autotune, Trennen, Loop ohne Umschalten da`, reach.every(([, v]) => v), JSON.stringify(reach));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `paket-${name.toLowerCase()}-editor.png`) });
    check(`${name}: Editor ohne Konsolenfehler`, app.errors.length === 0, app.errors.join(' | '));
  } catch (e) { check(`${name}: Editor-Ablauf ohne Ausnahme`, false, e.stack); }
  await app.close();
}

// ---------- Deck passt in jede Desktop-Breite (bei 1440 px fiel „Exportieren“ hinten raus) ----------
async function deckFitTest() {
  for (const w of [1100, 1280, 1366, 1440, 1520, 1600, 1920]) {
    const app = await openApp({ viewport: { width: w, height: 900 } });
    try {
      const r = await app.page.evaluate(() => {
        const d = document.querySelector('.deck');
        const cut = [...d.querySelectorAll('button, input, select, .lcd-cell')].filter((n) => n.offsetParent).filter((n) => n.getBoundingClientRect().right > d.getBoundingClientRect().right + 0.5).map((n) => (n.textContent || n.id).trim().slice(0, 16));
        return { over: d.scrollWidth - d.clientWidth, cut };
      });
      check(`Deck ${w} px: nichts abgeschnitten`, r.over <= 0 && !r.cut.length, JSON.stringify(r));
    } finally {
      await app.close();
    }
  }
}

(async () => {
  await deckFitTest();
  await muteTest({ width: 1400, height: 900 }, 'Desktop');
  await muteTest({ width: 390, height: 844 }, 'Handy');
  await inspectorTest();
  await clipbarTest();
  await followTest();
  await chevronTest({ width: 1400, height: 900 }, 'Desktop', false);
  await chevronTest({ width: 1180, height: 820 }, 'Tablet', true);
  await chevronTest({ width: 390, height: 844 }, 'Handy', true);
  await editorTest({ width: 1400, height: 900 }, 'Desktop', false);
  await editorTest({ width: 390, height: 844 }, 'Handy', true);
  finish();
})();
