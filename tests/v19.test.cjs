// Version 1.9: eine Fachleiste für Handy und Desktop, Rückmeldungen als Einblender statt Hinweiszeile,
// Rückgängig als Taste im Deck, Höhe je Schublade (Editoren und Mixer am Handy oben), Favicon.
// node tests/v19.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

// Bewegung pro Bild aufzeichnen: gemessen kurz vor dem Malen (ResizeObserver läuft nach allen rAF-Rückrufen)
const startFrames = (page, sels) => page.evaluate((sels) => {
  const arr = document.querySelector('.arranger');
  const probe = document.body.appendChild(document.createElement('div'));
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  const rows = [];
  let ft = 0, flip = 0, raf = 0;
  const ro = new ResizeObserver(() => {
    const row = { t: ft, ab: arr.getBoundingClientRect().bottom };
    for (const s of sels) {
      const n = document.querySelector(s);
      if (!n || getComputedStyle(n).display === 'none') continue;
      const r = n.getBoundingClientRect();
      row[s] = { top: r.top, vis: row.ab - r.top, z: Number(getComputedStyle(n).zIndex) || 0, drag: n.classList.contains('dragging') };
    }
    rows.push(row);
  });
  ro.observe(probe);
  const loop = (t) => { ft = t; flip ^= 1; probe.style.width = `${1 + flip}px`; raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  window.__frames = () => { cancelAnimationFrame(raf); ro.disconnect(); probe.remove(); return rows; };
}, sels);
const stopFrames = (page) => page.evaluate(() => window.__frames());
// Kennzahlen einer Bewegung: Tempo je 16,7 ms (ausgelassene Bilder zählen nicht als Sprung), ohne Finger
function motion(rows, sel) {
  const pts = rows.filter((r) => r[sel]).map((r) => ({ t: r.t, top: r[sel].top, vis: r[sel].vis, z: r[sel].z, drag: r[sel].drag }));
  let peak = 0, jerk = 0, prev = null, moving = 0, t0 = null, t1 = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.t <= a.t) continue;
    const sp = ((b.top - a.top) / (b.t - a.t)) * 16.7;
    if (Math.abs(b.top - a.top) > 0.5) { moving++; t0 ??= a.t; t1 = b.t; }
    // Tempoänderung nur zwischen regelmäßigen Bildern: ausgelassene Bilder (Last) sind kein Ruck der Schublade
    const even = b.t - a.t <= 25;
    if (!a.drag && !b.drag) { peak = Math.max(peak, Math.abs(sp)); if (prev != null && even) jerk = Math.max(jerk, Math.abs(sp - prev)); }
    prev = a.drag || b.drag || !even ? null : sp;
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { n: pts.length, first: pts[0], last: pts[pts.length - 1], pts, moving, ms: t1 != null ? Math.round(t1 - t0) : 0, peak: r(peak), jerk: r(jerk) };
}
const rest = (page) => page.waitForFunction(() => !document.querySelector('.sheet[data-motion], .sheet.leaving'), null, { timeout: 3000 });

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
    // Wechsel Mixer ↔ Editor: die neue Schublade fährt sichtbar von unten herein, über der alten; die alte springt nicht
    const docks = ['#mixer', '#editor', '#pattern'];
    await page.click('#mixer-btn');
    await rest(page);
    for (const btn of ['#editor-tab', '#mixer-btn']) {
      const from = `#${await page.evaluate(() => window.loopwerk.ui.dock)}`;
      const a0 = await rect(from);
      await startFrames(page, docks);
      await page.click(btn);
      await rest(page);
      const rows = await stopFrames(page);
      const to = `#${await page.evaluate(() => window.loopwerk.ui.dock)}`;
      const fA = motion(rows, from);
      const fB = motion(rows, to);
      const both = rows.filter((r) => r[from] && r[to]);
      const ok = to !== from && fB.first.vis <= 1 && fB.moving >= 6 && fB.peak <= 62 && both.length > 3 && both.every((r) => r[to].z > r[from].z)
        && fA.pts.every((p) => Math.abs(p.top - a0.y) <= 1) && Math.abs((await rect(to)).h / arr.h - 0.5) < 0.02;
      check(`Desktop: Wechsel ${from} → ${to} fährt sichtbar herein (über der alten, die liegen bleibt)`, ok,
        JSON.stringify({ first: fB.first, moving: fB.moving, peak: fB.peak, both: both.length, oldTops: [fA.first?.top, fA.last?.top, a0.y] }));
    }
    // Reduzierte Bewegung: kurz, aber sichtbar (kein Aufploppen). Dauer aus den Klassenwechseln, unabhängig von der Last
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const what of ['schließt', 'öffnet']) {
      await page.evaluate(() => {
        const m = document.getElementById('mixer');
        window.__cls = [];
        window.__mo = new MutationObserver(() => window.__cls.push({ t: performance.now(), on: m.classList.contains('entering') || m.classList.contains('leaving') }));
        window.__mo.observe(m, { attributes: true, attributeFilter: ['class'] });
      });
      await startFrames(page, ['#mixer']);
      await page.click('#mixer-btn');
      await rest(page);
      const f = motion(await stopFrames(page), '#mixer');
      const ms = await page.evaluate(() => { window.__mo.disconnect(); const a = window.__cls.find((x) => x.on); const b = a && window.__cls.find((x) => x.t > a.t && !x.on); return a && b ? Math.round(b.t - a.t) : -1; });
      const dist = Math.abs(f.last.vis - f.first.vis);
      check(`Reduzierte Bewegung: Mixer ${what} kurz, aber sichtbar (150–600 ms, kein Bild > 30 % des Wegs)`, ms >= 150 && ms <= 600 && f.moving >= 3 && f.peak <= dist * 0.3,
        JSON.stringify({ ms, moving: f.moving, peak: f.peak, dist: Math.round(dist) }));
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.click('#mixer-btn');
    await rest(page);
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
