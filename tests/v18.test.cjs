// Version 1.8: neues Desktop-Layout (Deck in einer Zeile, Sounds|Erstellen, Inspektor, Leiste unten),
// Schubladen über den Spuren, Schere, Tipps, Drücken und Halten, Klaviertasten am Handy.
// node tests/v18.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker, clickR, selectR, createCard, reveal } = require('./harness.cjs');

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
// Zeiger-Gesten mit festen Zeitstempeln: Geschwindigkeit hängt nicht von der Last der Testmaschine ab
async function gesture(cdp, kind, x, y, dys, stepMs = 16, holdMs = 0) {
  const t0 = Date.now() / 1000;
  let t = t0;
  const send = (type, yy) => (kind === 'touch'
    ? cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }], timestamp: t })
    : cdp.send('Input.dispatchMouseEvent', { type, x, y: yy, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, timestamp: t }));
  await send(kind === 'touch' ? 'touchStart' : 'mousePressed', y);
  let last = y;
  for (const dy of dys) { t += stepMs / 1000; last = y + dy; await send(kind === 'touch' ? 'touchMove' : 'mouseMoved', last); }
  t += (stepMs + holdMs) / 1000;
  await send(kind === 'touch' ? 'touchEnd' : 'mouseReleased', last);
}
const ramp = (dy, steps) => Array.from({ length: steps }, (_, i) => (dy * (i + 1)) / steps);
const rest = (page) => page.waitForFunction(() => !document.querySelector('.sheet[data-motion], .sheet.leaving'), null, { timeout: 3000 });

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
      insp: getComputedStyle(document.getElementById('side')).visibility !== 'hidden', bar: getComputedStyle(document.getElementById('tabbar')).display,
      tabs: getComputedStyle(document.getElementById('tab-sounds')).display, overflow: document.documentElement.scrollWidth - innerWidth,
      mixerInBar: !!document.getElementById('fxpad-btn').closest('#mix-head'), zoomInBar: !!document.getElementById('zoom-in').closest('.arr-bar'),
      saveInMenu: !!document.getElementById('save-btn').closest('#side-datei-liste'), exportInDeck: !!document.getElementById('export-btn').closest('#side-datei-liste'),
      menuName: document.getElementById('project-menu-name').textContent,
    }));
    check('Deck in einer Zeile (≤ 64 px)', deck.h <= 64, `${deck.h} px`);
    // Umbau Scheibe 5: die Fachleiste unten entfällt (Tastenkürzel in Datei, Mixer und FX-Pad im Reiter Mixer)
    check('Inspektor rechts, keine Fachleiste unten, kein Querscrollen', lay.insp && lay.bar === 'none' && lay.tabs === 'none' && lay.overflow <= 0, JSON.stringify(lay));
    check('Knöpfe an ihren neuen Plätzen', lay.mixerInBar && lay.zoomInBar && lay.saveInMenu && lay.exportInDeck && lay.menuName === 'Beispiel-Arrangement', JSON.stringify(lay));

    // Reiter Datei (Layout „reiter“ ersetzt das Projekt-Menü; der Knopf im Deck entfällt)
    await page.click('#side-tab-datei');
    check('Reiter Datei zeigt Name, Öffnen, Speichern, Beispiel, Leeren, Tipps', await page.evaluate(() => ['project-name', 'open-btn', 'save-btn', 'demo-btn', 'new-btn', 'tips-reset'].every((id) => document.getElementById(id).offsetParent && document.getElementById(id).closest('#side-datei, #side-datei-liste'))));
    check('Der Menü-Knopf im Deck entfällt', await page.locator('#project-menu-btn').isHidden());

    // Export als Klappfeld: Arranger bleibt gleich groß
    const arr0 = await rect('.arranger');
    await page.click('#export-btn');
    const ex = await rect('#export');
    const arr1 = await rect('.arranger');
    check('Export öffnet als Klappfeld unter dem Knopf, Arranger unverändert', ex && ex.y < deck.b + 20 && ex.r > 1000 && arr1.h === arr0.h, JSON.stringify({ ex, arr0: arr0.h, arr1: arr1.h }));
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
    // Umbau Scheibe 4/5: Clip gewählt → die Karte rechts zeigt nichts, Teilen/Duplizieren/Löschen stehen in der Kopfzeile über den Spuren
    const ci = await page.evaluate(() => ({
      mode: document.getElementById('insp').dataset.mode,
      inCard: !!document.querySelector('#side .insp-clip')?.offsetParent,
      btns: ['split-btn', 'dup-btn', 'del-btn'].every((id) => document.getElementById(id).closest('#arr-bar-tools') && document.getElementById(id).offsetParent),
      noEdit: !document.getElementById('edit-btn').offsetParent,
    }));
    check('Clip auswählen: Karte zeigt nichts, Werkzeuge in der Kopfzeile, kein „Bearbeiten“-Knopf', ci.mode === 'clip' && !ci.inCard && ci.btns && ci.noEdit, JSON.stringify(ci));
    await page.evaluate(() => window.loopwerk.ui.select(null));
    // Die Werkzeuge blenden weich aus (motion.js): sofort nicht mehr bedienbar, verborgen am Ende des Ausblendens
    check('Ohne Auswahl sind die Werkzeuge in der Kopfzeile nicht bedienbar', await page.evaluate(() => document.getElementById('arr-bar-tools').inert));
    check('Ohne Auswahl sind die Werkzeuge in der Kopfzeile nicht zu sehen', await page.waitForFunction(() => !document.getElementById('arr-bar-tools').offsetParent, null, { timeout: 3000 }).then(() => true, () => false));
    await pad.click({ position: { x: 60, y: 45 } });
    await pad.dblclick({ position: { x: 60, y: 45 } });
    await page.waitForSelector('#clip-overlay:not([hidden]) #insp-gain', { state: 'visible' });
    const ovd = await page.evaluate(() => ({ dock: window.loopwerk.ui.dock, title: document.querySelector('#clip-overlay .insp-clip .insp-title span:last-child').textContent, meta: document.querySelector('#clip-overlay .insp-meta').textContent, dialog: document.getElementById('ov-card').getAttribute('role') }));
    check('Doppelklick öffnet den Clip-Editor als Karte mit den Clip-Einstellungen', ovd.dock === 'editor' && ovd.title === 'Pad Am–F–C–G' && /^Takt 1–16/.test(ovd.meta) && ovd.dialog === 'dialog', JSON.stringify(ovd));
    await page.locator('#insp-gain').fill('0.5');
    const g = await page.evaluate(() => window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.gain);
    check('Lautstärke in den Clip-Einstellungen ändert den Clip', g === 0.5, String(g));
    await page.keyboard.press('Escape');
    check('Esc schließt die Karte', await page.evaluate(() => window.loopwerk.ui.dock === null && document.getElementById('clip-overlay').hidden));
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
    await page.evaluate(() => window.loopwerk.mixcol?.close()); // die Summen-Karte (Master-Effekte oben) liegt über der Mixer-Spalte: erst zu
    await page.waitForTimeout(500);
    // Layout „reiter“ (Umbau Scheibe 3): das Fach „Mixer“ entfällt, die Schubladen-Mechanik (Haltepunkte, Feder, Esc) zeigt das FX-Pad (Knopf im Kopf der Mixer-Spalte)
    let cdp = await page.context().newCDPSession(page);
    const gripAt = async (sel) => { const g = await rect(`${sel} > .sheet-grip`); return { x: g.x + g.w / 2, y: g.y + 9 }; };
    // Ziehen am Griff mit der Maus: langsam (am Ende ruhig halten) oder als Schubs (kurz und schnell)
    const mdrag = async (sel, dy, steps, slow) => { const g = await gripAt(sel); await gesture(cdp, 'mouse', g.x, g.y, ramp(dy, steps), 16, slow ? 160 : 0); };
    const visH = async (sel) => { const r = await rect(sel); return (await rect('.arranger')).b - r.y; };
    await startFrames(page, ['#fxpad']);
    await page.click('#fxpad-btn');
    await page.waitForTimeout(40);
    const entering = await page.evaluate(() => document.getElementById('fxpad').classList.contains('entering'));
    check('Schublade fährt animiert herein', entering);
    await rest(page);
    const fOpen = motion(await stopFrames(page), '#fxpad');
    const dk = await rect('#fxpad');
    const ar = await rect('.arranger');
    check('FX-Pad liegt als Schublade über dem Arranger', Math.abs(dk.b - ar.b) < 2 && dk.h < ar.h && Math.abs(ar.h - arr0.h) < 1, JSON.stringify({ dk, ar }));
    check('Schublade öffnet in der Mitte (50 %)', Math.abs(dk.h / ar.h - 0.5) < 0.02, `${dk.h} / ${ar.h}`);
    check('Öffnen: startet unter dem Rand und gleitet ohne Sprung herein (Feder, ≤ 62 px je Bild, Tempo ändert sich ≤ 55 px)',
      fOpen.first.vis <= 1 && fOpen.moving >= 6 && fOpen.ms >= 250 && fOpen.peak <= 62 && fOpen.jerk <= 55, JSON.stringify({ first: fOpen.first, moving: fOpen.moving, ms: fOpen.ms, peak: fOpen.peak, jerk: fOpen.jerk }));
    const shadow = await page.evaluate(() => getComputedStyle(document.getElementById('fxpad')).boxShadow);
    check('Schublade hat Griff und Schatten', shadow !== 'none' && await page.locator('#fxpad > .sheet-grip').isVisible(), shadow);
    const pad1 = await page.evaluate(() => getComputedStyle(document.querySelector('.arr-grid')).paddingBottom);
    check('Arranger lässt unten Platz zum Scrollen', parseFloat(pad1) >= dk.h - 2, pad1);
    // Langsam nach oben ziehen: rastet am nächsten Haltepunkt (oben, 100 %) ein, animiert
    await startFrames(page, ['#fxpad']);
    await mdrag('#fxpad', -ar.h * 0.3, 10, true);
    await rest(page);
    const fUp = motion(await stopFrames(page), '#fxpad');
    const dk2 = await rect('#fxpad');
    check('Aufziehen rastet oben ein (100 %)', Math.abs(dk2.h / ar.h - 1) < 0.02, `${dk.h} → ${dk2.h} / ${ar.h}`);
    const followed = fUp.pts.filter((p) => p.drag).every((p, i, a) => i === 0 || p.vis >= a[i - 1].vis - 0.5);
    check('Beim Ziehen folgt die Schublade dem Zeiger, danach gleitet sie weich ein', followed && fUp.jerk <= 30, JSON.stringify({ jerk: fUp.jerk, peak: fUp.peak }));
    check('Höhe wird gemerkt', await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.sheetH')).wide.fxpad === 1));
    // Kurzer Schubs nach unten: eine Stufe tiefer (Mitte), nicht zu
    await mdrag('#fxpad', 40, 2, false);
    await page.waitForTimeout(80);
    const moving = await visH('#fxpad');
    await rest(page);
    const dk3 = await rect('#fxpad');
    check('Schubs nach unten rastet in der Mitte ein', Math.abs(dk3.h / ar.h - 0.5) < 0.02 && await page.evaluate(() => window.loopwerk.ui.dock === 'fxpad'), `${dk3.h} / ${ar.h}`);
    check('Einrasten ist animiert (Zwischenhöhe)', moving < dk2.h - 5 && moving > dk3.h + 5, `${dk2.h} → ${moving} → ${dk3.h}`);
    // Kurzer Schubs nach oben: eine Stufe höher
    await mdrag('#fxpad', -40, 2, false);
    await rest(page);
    check('Schubs nach oben rastet oben ein', Math.abs((await rect('#fxpad')).h / ar.h - 1) < 0.02);
    // Unterbrechen: Schubs nach unten, nach 100 ms am Griff greifen – keine Sprünge, folgt 1:1
    await mdrag('#fxpad', 40, 2, false);
    const grab = await page.evaluate(() => new Promise((res) => setTimeout(() => requestAnimationFrame(() => {
      const s = document.getElementById('fxpad');
      const g = s.querySelector('.sheet-grip').getBoundingClientRect();
      const ev = (type, y, n = window) => n.dispatchEvent(new PointerEvent(type, { clientX: g.x + 30, clientY: y, button: 0, buttons: 1, pointerId: 9, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true }));
      const before = s.getBoundingClientRect().top;
      ev('pointerdown', g.y + 9, s.querySelector('.sheet-grip'));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const held = s.getBoundingClientRect().top;
        ev('pointermove', g.y + 9 - 30);
        requestAnimationFrame(() => {
          const moved = s.getBoundingClientRect().top;
          setTimeout(() => { ev('pointerup', g.y + 9 - 30); res({ before, held, moved, wasMoving: before > 80 }); }, 200);
        });
      }));
    }), 100)));
    check('Laufende Bewegung lässt sich greifen: kein Sprung, folgt dem Zeiger 1:1', grab.wasMoving && Math.abs(grab.held - grab.before) < 1 && Math.abs(grab.moved - (grab.before - 30)) < 1, JSON.stringify(grab));
    await rest(page);
    await mdrag('#fxpad', -40, 2, false);
    await rest(page);
    // Gummiband: über oben hinaus ziehen dehnt nur wenig, danach zurück auf 100 %
    await startFrames(page, ['#fxpad']);
    await mdrag('#fxpad', -300, 15, true);
    await rest(page);
    const fRub = motion(await stopFrames(page), '#fxpad');
    const over = Math.max(...fRub.pts.map((p) => p.vis)) - ar.h;
    check('Gummiband über oben: dehnt sich wenig (10–75 px) und federt zurück', over > 10 && over <= 75 && Math.abs((await rect('#fxpad')).h / ar.h - 1) < 0.02, `${Math.round(over)} px`);
    // Langsam fast ganz herunter ziehen: zu – und zwar sichtbar hinausgleitend (Klassenwechsel mitschreiben, unabhängig von der Last)
    await page.evaluate(() => {
      const m = document.getElementById('fxpad');
      window.__leave = [];
      window.__mo = new MutationObserver(() => window.__leave.push({ t: performance.now(), leaving: m.classList.contains('leaving'), shown: getComputedStyle(m).display !== 'none' }));
      window.__mo.observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    await startFrames(page, ['#fxpad']);
    await mdrag('#fxpad', ar.h * 0.85, 10, true);
    await page.waitForTimeout(60);
    check('Nach unten ziehen schließt die Schublade', await page.evaluate(() => window.loopwerk.ui.dock === null));
    await rest(page);
    const fShut = motion(await stopFrames(page), '#fxpad');
    const lv = await page.evaluate(() => { window.__mo.disconnect(); const a = window.__leave.find((x) => x.leaving && x.shown); const b = a && window.__leave.find((x) => x.t > a.t && !x.leaving); return a && b ? { ms: Math.round(b.t - a.t) } : null; });
    const afterRelease = fShut.pts.filter((p, i) => i > 0 && !p.drag && p.top > fShut.pts[i - 1].top + 0.5).length;
    check('Schließen ist animiert (verschwindet nicht sofort)', lv && lv.ms >= 100 && afterRelease >= 2, JSON.stringify({ lv, afterRelease }));
    check('Nach der Animation ist die Schublade weg', await page.evaluate(() => getComputedStyle(document.getElementById('fxpad')).display === 'none'));
    // Mit dem Knopf öffnen und schließen: ebenfalls animiert, öffnet am gemerkten Haltepunkt
    await page.click('#fxpad-btn');
    await rest(page);
    check('Öffnet am gemerkten Haltepunkt', Math.abs((await rect('#fxpad')).h / ar.h - 1) < 0.02);
    await startFrames(page, ['#fxpad']);
    await page.click('#fxpad-btn');
    await page.waitForTimeout(40);
    check('Schließen per Knopf ist animiert', await page.evaluate(() => document.getElementById('fxpad').classList.contains('leaving')));
    await rest(page);
    const fClose = motion(await stopFrames(page), '#fxpad');
    // Mindestens 5 bewegte Bilder bei 60 Bildern/s; auf einer langsamen Maschine (größere Bildabstände) entsprechend weniger
    const gaps = fClose.pts.slice(1).map((p, i) => p.t - fClose.pts[i].t).filter((g) => g > 0).sort((a, b) => a - b);
    const dtm = gaps[Math.floor(gaps.length / 2)] || 16.7;
    const need = Math.min(5, Math.max(3, Math.floor(240 / dtm)));
    check('Schließen per Knopf: gleitet ganz hinaus, ohne Sprung', fClose.moving >= need && fClose.last.vis <= -30 && fClose.jerk <= 60, JSON.stringify({ moving: fClose.moving, need, dtm: Math.round(dtm), last: fClose.last, peak: fClose.peak, jerk: fClose.jerk }));
    await page.click('#fxpad-btn');
    await page.keyboard.press('Escape');
    check('Esc schließt das Fach', await page.evaluate(() => window.loopwerk.ui.dock === null));
    await rest(page);

    // Mixer → Inspektor
    await page.click('#side-tab-mixer');
    await page.locator('.mix-slot .strip[data-strip-id="t2"] .strip-sum').click();
    check('Mixer: „keine Effekte“ öffnet die Karte der Spur', await mode() === 'track' && await page.evaluate(() => window.loopwerk.ui.selectedTrackId) === 't2');
    await page.keyboard.press('Escape');

    // ---------- Erstellen ----------
    await page.click('#ltab-create');
    check('Reiter „Erstellen“ zeigt sieben Karten (mit „Begleitung“)', await page.locator('.ccard:visible').count() === 7);
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
    // Umbau Scheibe 4: der Editor liegt als Karte in der Mitte (kein Editor-Reiter mehr); Name im Kopf, Esc schließt
    const patName = await page.evaluate(() => ({ name: document.getElementById('pat-name').value, shown: !document.getElementById('clip-overlay').hidden, label: document.getElementById('pat-title').textContent }));
    check('Karte in der Mitte zeigt „Beat 1“ im Kopf', patName.name === 'Beat 1' && patName.shown && /Beat/.test(patName.label), JSON.stringify(patName));
    await page.keyboard.press('Escape');
    check('Esc schließt den offenen Editor', await page.evaluate(() => window.loopwerk.ui.dock === null));
    // Karte auf eine Spur ziehen (erst wenn die Schublade weg ist – sie nimmt die Ansicht beim Schließen mit zurück)
    await page.waitForTimeout(700);
    // Layout „reiter“: mit gewähltem Clip steht dessen Abschnitt über dem Regal – die Karte erst in Sicht rollen
    await page.locator('.ccard[data-create="melody"]').scrollIntoViewIfNeeded();
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
    check('„Mehr“ enthält Notenlänge, Einrasten, Schritt-Eingabe, Leeren', await page.evaluate(() => ['pat-len-field', 'pat-quant-field', 'pat-rec', 'pat-clear'].every((id) => document.getElementById(id).closest('#pat-more'))));
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

    // ---------- Sample-Editor: alle Werkzeuge in einer Ansicht ----------
    await page.evaluate(() => { const { store, editor } = window.loopwerk; editor.open(store.track('t4').clips[0].id); });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await page.click('#clip-more'); // Tonhöhe, Autotune, Trennen, Loop sind eingeklappt, damit die Wellenform das Fach füllt
    const edv = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('#editor .ed-group')].filter((g) => g.offsetParent).map((g) => g.getAttribute('aria-label')),
      tabs: document.querySelectorAll('#editor .ed-tab, #editor [role="tab"]').length,
    }));
    check('Sample-Editor: keine Reiter, alle Werkzeug-Gruppen sichtbar', edv.tabs === 0 && JSON.stringify(edv.groups) === '["Auswahl","Säubern","Bearbeiten","Tonhöhe","Autotune","Rauschen","Trennen","Loop"]', JSON.stringify(edv));
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
    // Layout „reiter“: die rechte Leiste ist auch am kleineren Laptop immer offen (kein Einklappen, kein Knopf „Eigenschaften“)
    const small = await page.evaluate(() => ({ w: document.getElementById('side').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth, toggle: !!document.querySelector('.insp-toggle')?.offsetParent }));
    check('1280 px: rechte Leiste immer offen (≥ 290 px), kein Einklapp-Knopf, kein Querscrollen', small.w >= 290 && small.overflow <= 0 && !small.toggle, JSON.stringify(small));
    check('Keine Fehler in der Konsole (1280)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Schubladen und Klaviertasten ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    cdp = await page.context().newCDPSession(page);
    // Wischen mit festen Zeitstempeln (16 ms je Schritt): ein Schubs bleibt ein Schubs, auch wenn die Maschine ausgelastet ist
    const swipe = async (sel, dy, steps) => { const g = await rect(`${sel} > .sheet-grip`); await gesture(cdp, 'touch', g.x + g.w / 2, g.y + 9, ramp(dy, steps), 16); };
    const arrM = await rect('.arranger');
    await page.tap('#tab-sounds');
    await rest(page);
    const sh = await rect('.shelf');
    const arrM2 = await rect('.arranger');
    check('Handy: Regal liegt als Schublade über den Spuren (Arranger bleibt gleich groß)', Math.abs(sh.b - arrM2.b) < 2 && Math.abs(arrM2.h - arrM.h) < 1 && sh.h < arrM.h, JSON.stringify({ sh, arrM, arrM2 }));
    check('Handy: Regal öffnet in der Mitte', Math.abs(sh.h / arrM2.h - 0.5) < 0.02, `${sh.h} / ${arrM2.h}`);
    // Schubs nach oben: rastet oben (100 %) ein
    await swipe('.shelf', -60, 3);
    await rest(page);
    const sh2 = await rect('.shelf');
    check('Handy: Schubs nach oben rastet oben ein (100 %)', Math.abs(sh2.h / arrM2.h - 1) < 0.02, `${sh.h} → ${sh2.h}`);
    // Kurzer Schubs nach unten: zurück zur Mitte
    await swipe('.shelf', 50, 3);
    await rest(page);
    check('Handy: Schubs nach unten rastet in der Mitte ein', Math.abs((await rect('.shelf')).h / arrM2.h - 0.5) < 0.02 && await page.evaluate(() => window.loopwerk.ui.dock === 'sounds'));
    // Weiter Wisch nach unten: zu, und zwar mit dem Schwung des Fingers (kein Stocken beim Loslassen)
    await startFrames(page, ['.shelf']);
    await swipe('.shelf', 300, 3);
    await page.waitForTimeout(100);
    check('Handy: nach unten wischen schließt', await page.evaluate(() => window.loopwerk.ui.dock === null));
    await rest(page);
    const fWipe = motion(await stopFrames(page), '.shelf');
    const iRel = fWipe.pts.findIndex((p, i) => i > 0 && fWipe.pts[i - 1].drag && !p.drag);
    const relStep = iRel > 0 ? fWipe.pts[iRel].top - fWipe.pts[iRel - 1].top : 0;
    check('Handy: Wegwischen fährt mit Schwung weiter (erstes Bild nach dem Loslassen ≥ 20 px)', relStep >= 20, `${Math.round(relStep)} px`);
    // Wechsel Sounds → Mixer: der Mixer fährt über das Regal, das Regal bleibt liegen, bis es bedeckt ist
    await page.tap('#tab-sounds');
    await rest(page);
    await startFrames(page, ['.shelf', '#mixer']);
    await page.tap('#mixer-btn');
    await rest(page);
    const swRows = await stopFrames(page);
    const fShelf = motion(swRows, '.shelf');
    const fMix = motion(swRows, '#mixer');
    const both = swRows.filter((r) => r['.shelf'] && r['#mixer']);
    check('Handy: Wechsel Sounds → Mixer: Mixer fährt von unten über das Regal, Regal springt nicht',
      fMix.first.vis <= 1 && fMix.moving >= 6 && both.length > 3 && both.every((r) => r['#mixer'].z > r['.shelf'].z) && fShelf.pts.every((p) => Math.abs(p.top - fShelf.first.top) <= 1),
      JSON.stringify({ mixFirst: fMix.first, moving: fMix.moving, both: both.length, shelfTops: [fShelf.first?.top, fShelf.last?.top] }));
    await page.tap('#mixer-btn');
    await rest(page);
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
      const wrap = document.getElementById('pat-roll-wrap'); return { n: keys.length, w: k.width, h: k.height, left: Math.round(k.left - roll.left), fit: wrap.scrollHeight <= wrap.clientHeight + 1 };
    });
    check('Handy: senkrechte Klaviertasten links an der Piano-Roll, passen ohne Scrollen', vk.n >= 12 && vk.n <= 25 && vk.fit && vk.w >= 60 && vk.h >= 28 && vk.left <= 1, JSON.stringify(vk));
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
    check('Handy: kein Querscrollen, Desktop-Teile ausgeblendet', ov <= 0 && await page.evaluate(() => ['.insp', '.tabbar-end', '.arr-bar-view', '.arr-bar-select', '.arr-bar-status', '.left-tabs'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none')
      && getComputedStyle(document.getElementById('arr-pills')).display === 'flex'));
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
