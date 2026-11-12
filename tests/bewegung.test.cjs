// Bewegung der schwebenden Flächen (Layout „reiter“, Desktop): unterbrechbar und am Ende im richtigen Zustand.
// Prüft je Bild (requestAnimationFrame): schnelles Auf–Zu–Auf der Karte, Reiter A–B–A, Datei ↔ Mixer hin und her, Effekt-Karte auf–zu–auf,
// Clip-Editor auf–zu–auf: keine Fläche springt (Lage und Deckkraft ändern sich nie schneller, als eine Bewegung es tut), am Ende stimmt der Zustand
// (Reiter, Inhalt der Karte, Spalte, Editor sichtbar/verborgen), die Karte wechselt beim Ausblenden nicht ihren Inhalt, der Rollbalken bleibt frei,
// Werkzeuge der Kopfzeile blenden weich ein und aus; mit reduzierter Bewegung kein Weg, nur Einblenden.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Schnellste erlaubte Änderung je ms: Feder-Spitze und Ausgang liegen bei rund 0,1–0,2 px/ms und 0,01/ms; ein Sprung ist ein Vielfaches davon
const MAX_PX_MS = 0.45;
const MAX_OP_MS = 0.03;

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  const lw = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  // Bis keine Bewegung der Flächen mehr läuft (CSS-Übergänge und Web Animations)
  const settled = () => page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#side, #clip-overlay, #arr-scroll, #arr-wrap, #arr-bar')).length === 0, null, { timeout: 5000 });
  const rec = {
    start: (probes) => lw((p) => {
      const w = window.__rec = { run: true, frames: [] };
      const read = (sel) => {
        const n = document.querySelector(sel);
        if (!n || !n.getClientRects().length) return null; // nicht im Fluss (hidden): keine Lage
        let op = 1;
        for (let a = n; a && a.nodeType === 1; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden') op = 0;
        return { y: n.getBoundingClientRect().top, op };
      };
      const step = (t) => {
        if (!w.run) return;
        const z = document.querySelector('.zbar-y');
        let zfree = true;
        if (z) { const r = z.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); zfree = !!hit && z.contains(hit); }
        w.frames.push({ t, zfree, tab: document.getElementById('app').dataset.tab, p: Object.fromEntries(Object.entries(p).map(([k, s]) => [k, read(s)])) });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, probes),
    stop: () => lw(() => { window.__rec.run = false; return window.__rec.frames; }),
  };
  // Größte Änderungsrate einer Fläche (Lage nur, solange sie zu sehen ist)
  const rates = (frames, k) => {
    let px = 0; let op = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].p[k]; const b = frames[i].p[k];
      if (!a || !b) continue;
      const dt = Math.max(8, frames[i].t - frames[i - 1].t);
      const dy = Math.abs(b.y - a.y); const dop = Math.abs(b.op - a.op);
      if (Math.max(a.op, b.op) > 0.02 && dy > 3) px = Math.max(px, dy / dt);
      if (dop > 0.08) op = Math.max(op, dop / dt);
    }
    return { px: +px.toFixed(3), op: +op.toFixed(4) };
  };
  const smooth = (name, frames, keys) => {
    for (const k of keys) {
      const r = rates(frames, k);
      check(`${name}: ${k} springt nicht (Lage ≤ ${MAX_PX_MS} px/ms, Deckkraft ≤ ${MAX_OP_MS}/ms)`, r.px <= MAX_PX_MS && r.op <= MAX_OP_MS, JSON.stringify(r));
    }
    check(`${name}: Rollbalken bleibt in jedem Bild frei`, frames.every((f) => f.zfree), `${frames.filter((f) => !f.zfree).length} Bilder verdeckt`);
  };
  const click = (id) => lw((i) => document.getElementById(i).click(), id);
  const state = () => lw(() => {
    const app = document.getElementById('app');
    const vis = (q) => { const n = document.querySelector(q); if (!n) return false; const c = getComputedStyle(n); return c.visibility !== 'hidden' && Number(c.opacity) > 0.99 && n.getClientRects().length > 0; };
    const gone = (q) => { const n = document.querySelector(q); return !n || getComputedStyle(n).visibility === 'hidden' || !n.getClientRects().length; };
    return { side: app.dataset.side, tab: app.dataset.tab, card: vis('#side'), cardGone: gone('#side'), col: vis('.mix-slot'), colGone: gone('.mix-slot'), datei: vis('#side-datei'), sounds: vis('#side .side-sounds'), mixcard: app.dataset.mixcard || null };
  });
  try {
    await page.click('#demo-btn');
    await wait(500);
    await settled();

    // ---------- Karte: auf – zu – auf (alle 110 ms) ----------
    await lw(() => { window.loopwerk.side.show('sounds'); window.loopwerk.side.close(); });
    await settled();
    await rec.start({ karte: '#side' });
    await click('side-tab-sounds'); await wait(110);
    await click('side-tab-sounds'); await wait(110);
    await click('side-tab-sounds');
    await settled();
    let f = await rec.stop();
    smooth('Karte auf–zu–auf', f, ['karte']);
    let s = await state();
    check('Karte auf–zu–auf endet offen mit Sounds', s.side === 'sounds' && s.tab === 'sounds' && s.card && s.sounds, JSON.stringify(s));

    // ---------- Reiter A – B – A (alle 70 ms): die Karte bleibt stehen ----------
    await rec.start({ karte: '#side' });
    await click('side-tab-datei'); await wait(70);
    await click('side-tab-sounds'); await wait(70);
    await click('side-tab-datei');
    await settled();
    f = await rec.stop();
    const ys = f.map((x) => x.p.karte?.y).filter((y) => y != null);
    const ops = f.map((x) => x.p.karte?.op ?? 0);
    check('Reiter A–B–A: die Karte bleibt stehen (keine Bewegung, immer ganz sichtbar)', Math.max(...ys) - Math.min(...ys) < 0.5 && Math.min(...ops) > 0.99, JSON.stringify({ dy: Math.max(...ys) - Math.min(...ys), minOp: Math.min(...ops) }));
    s = await state();
    check('Reiter A–B–A endet bei Datei, Inhalt Datei ganz sichtbar', s.side === 'datei' && s.tab === 'datei' && s.datei && s.card, JSON.stringify(s));

    // ---------- Datei → Mixer: die Karte behält beim Ausblenden ihren Inhalt ----------
    await rec.start({ karte: '#side', spalte: '.mix-slot', datei: '#side-datei' });
    await click('side-tab-mixer');
    await settled();
    f = await rec.stop();
    const leaving = f.filter((x) => x.p.karte && x.p.karte.op > 0.02);
    check('Datei → Mixer: solange die Karte zu sehen ist, zeigt sie Datei', leaving.length > 0 && leaving.every((x) => x.tab === 'datei'), JSON.stringify(leaving.map((x) => x.tab)));
    smooth('Datei → Mixer', f, ['karte', 'spalte']);
    s = await state();
    check('Datei → Mixer endet mit der Spalte, Karte verborgen', s.side === 'mixer' && s.tab === 'mixer' && s.col && s.cardGone, JSON.stringify(s));

    // ---------- Mixer ↔ Datei hin und her (alle 120 ms) ----------
    await rec.start({ karte: '#side', spalte: '.mix-slot' });
    for (const id of ['datei', 'mixer', 'datei', 'mixer', 'datei']) { await click(`side-tab-${id}`); await wait(120); }
    await settled();
    f = await rec.stop();
    smooth('Mixer ↔ Datei hin und her', f, ['karte', 'spalte']);
    s = await state();
    check('Mixer ↔ Datei hin und her endet bei Datei: Karte ganz da, Spalte verborgen', s.side === 'datei' && s.tab === 'datei' && s.card && s.datei && s.colGone, JSON.stringify(s));

    // ---------- Effekt-Karte über der Spalte: auf – zu – auf ----------
    await click('side-tab-mixer');
    await settled();
    await rec.start({ karte: '#side', spalte: '.mix-slot' });
    const sum = () => lw(() => document.querySelector('.mix-slot .strip-sum').click());
    await sum(); await wait(120);
    await click('mixcard-close'); await wait(100);
    await sum();
    await settled();
    f = await rec.stop();
    smooth('Effekt-Karte auf–zu–auf', f, ['karte', 'spalte']);
    s = await state();
    check('Effekt-Karte auf–zu–auf endet offen; die Spalte darunter ist ausgeblendet (kein Streifen am Rand)', s.mixcard === 'spur' && s.card && s.colGone, JSON.stringify(s));
    await click('mixcard-close');
    await settled();
    s = await state();
    check('Effekt-Karte zu: die Spalte ist wieder ganz da', !s.mixcard && s.col && s.cardGone, JSON.stringify(s));

    // ---------- Clip-Editor: auf – zu – auf (von unten) ----------
    await click('side-tab-sounds');
    await settled();
    const clip = page.locator('.clip').nth(1);
    const box = await clip.boundingBox();
    const at = { x: box.x + 30, y: box.y + box.height / 2 };
    await rec.start({ editor: '#ov-card', grund: '#clip-overlay .ov-back' });
    await page.mouse.dblclick(at.x, at.y);
    await wait(120);
    await page.keyboard.press('Escape');
    await wait(90);
    await page.mouse.dblclick(at.x, at.y);
    await settled();
    f = await rec.stop();
    for (const k of ['editor', 'grund']) {
      const r = rates(f, k);
      check(`Clip-Editor auf–zu–auf: ${k} springt nicht`, r.px <= MAX_PX_MS && r.op <= MAX_OP_MS, JSON.stringify(r));
    }
    const fromBelow = f.find((x) => x.p.editor && x.p.editor.op > 0.05 && x.p.editor.op < 0.9);
    const endY = f.at(-1).p.editor?.y;
    check('Clip-Editor kommt von unten', !!fromBelow && endY != null && fromBelow.p.editor.y > endY + 1, JSON.stringify({ zwischen: fromBelow?.p.editor, ende: endY }));
    const ov = await lw(() => ({ dock: window.loopwerk.ui.dock, hidden: document.getElementById('clip-overlay').hidden, state: document.getElementById('clip-overlay').dataset.state, op: Number(getComputedStyle(document.getElementById('ov-card')).opacity) }));
    check('Clip-Editor auf–zu–auf endet offen und ganz sichtbar', ov.dock === 'editor' && !ov.hidden && ov.state === 'auf' && ov.op > 0.99, JSON.stringify(ov));
    // Schließen: sofort nicht mehr bedienbar (Klicks gehen an die Spuren), verborgen, sobald der Ausflug zu Ende ist
    await page.keyboard.press('Escape');
    const mid = await lw(() => ({ inert: document.getElementById('clip-overlay').inert, pe: getComputedStyle(document.getElementById('clip-overlay')).pointerEvents }));
    check('Clip-Editor beim Ausflug: fängt keine Klicks und keinen Fokus mehr', mid.inert && mid.pe === 'none', JSON.stringify(mid));
    await settled();
    check('Clip-Editor nach dem Ausflug verborgen', await lw(() => document.getElementById('clip-overlay').hidden));
    const tin = await lw(() => { const o = document.getElementById('clip-overlay'); o.dataset.state = 'auf'; const a = getComputedStyle(document.getElementById('ov-card')).transitionDuration; o.dataset.state = 'zu'; return { auf: a, zu: getComputedStyle(document.getElementById('ov-card')).transitionDuration }; });
    const dur = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
    check('Ausflug schneller als Einflug', dur(tin.zu) < dur(tin.auf), JSON.stringify(tin));

    // ---------- Werkzeuge in der Kopfzeile: weich ein und aus ----------
    await rec.start({ werkzeuge: '#arr-bar-tools' });
    await lw(() => window.loopwerk.ui.select(null));
    await settled();
    await lw(() => window.loopwerk.ui.select(document.querySelector('.clip').dataset.clipId));
    await settled();
    f = await rec.stop();
    const wops = f.map((x) => x.p.werkzeuge?.op ?? 0);
    const between = wops.filter((o) => o > 0.05 && o < 0.95).length;
    check('Werkzeuge blenden weich aus und ein (Zwischenstufen), am Ende sichtbar', between >= 2 && wops.at(-1) > 0.99, JSON.stringify({ between, end: wops.at(-1) }));

    // ---------- Reduzierte Bewegung: kein Weg, nur kurzes Einblenden ----------
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await lw(() => window.loopwerk.side.close());
    await settled();
    await rec.start({ karte: '#side' });
    await click('side-tab-sounds');
    await settled();
    f = await rec.stop();
    const ry = f.map((x) => x.p.karte?.y).filter((y) => y != null);
    const shownF = f.filter((x) => x.p.karte && x.p.karte.op > 0.02);
    const t0 = shownF[0]?.t ?? 0; const t1 = f.find((x) => x.p.karte?.op > 0.99)?.t ?? 1e9;
    check('Reduzierte Bewegung: Karte ohne Weg, Einblenden ≤ 200 ms', Math.max(...ry) - Math.min(...ry) < 0.5 && t1 - t0 <= 200, JSON.stringify({ dy: Math.max(...ry) - Math.min(...ry), ms: Math.round(t1 - t0) }));
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
    finish();
  }
})();
