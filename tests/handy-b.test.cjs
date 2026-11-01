// Handy, Variante B: kein „Mehr“, alles an seinem Ort – Deck (Aufnahme, Wiederholen), Pillen über den Spuren (Raster,
// Klick, Loop), Fach „Song“. Breiten 360 und 390 px, nur Finger.
// node tests/handy-b.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
// Tippfläche = Kasten des Elements (bei Pillen samt unsichtbarem Rand); die Mitte und die Mitten der Kanten müssen es treffen.
// (touch-targets.cjs prüft die Ecken und verwirft runde Knöpfe, deren Ecken leer sind.)
const measureTargets = (sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent && !n.disabled).map((n) => {
  const b = n.getBoundingClientRect();
  const hit = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === n || n.contains(h) || [...(n.labels || [])].some((l) => l.contains(h))); };
  const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
  const ok = hit(cx, cy) && hit(cx, b.top + 2) && hit(cx, b.bottom - 2) && hit(b.left + 2, cy) && hit(b.right - 2, cy);
  return { label: n.id ? `#${n.id}` : n.className, w: Math.round(b.width), h: Math.round(b.height), ok };
});
const overflow = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth, app: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth }));
const noOverflow = (o) => o.doc <= 0 && o.body <= 0 && o.app <= 0;

(async () => {
  for (const w of [360, 390]) {
    const app = await openApp({ viewport: { width: w, height: 760 }, hasTouch: true, deviceScaleFactor: 2 });
    const { page } = app;
    const shot = (name) => (SHOTS ? page.screenshot({ path: path.join(SHOT_DIR, `handy-b-${w}-${name}.png`) }) : null);
    const lw = () => page.evaluate(() => ({ dock: window.loopwerk.ui.dock }));
    try {
      await page.evaluate(() => document.getElementById('demo-btn').click());
      await page.evaluate(() => document.getElementById('demo-btn').click());
      await page.waitForTimeout(500);
      await shot('start');

      // ---------- Deck ----------
      const deck = await page.evaluate(() => {
        const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height, vis: !!document.getElementById(id).offsetParent }; };
        const cells = [...document.querySelectorAll('.deck .lcd-cell')].filter((c) => c.offsetParent).map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right, sw: c.scrollWidth, cw: c.clientWidth }; });
        const rec = document.getElementById('rec-btn');
        const deckEl = document.querySelector('.deck');
        const kids = [...deckEl.querySelectorAll('.key, .lcd, #bpm-input')].filter((n) => n.offsetParent).map((n) => n.getBoundingClientRect());
        return {
          home: r('home-btn'), play: r('play-btn'), rec: r('rec-btn'), undo: r('undo-btn'), redo: r('redo-btn'), cells,
          round: getComputedStyle(rec).borderRadius, recIn: !!rec.closest('.deck'), recAfterPlay: rec.previousElementSibling?.id === 'play-btn',
          undoPair: document.getElementById('undo-btn').nextElementSibling?.id === 'redo-btn',
          h: deckEl.getBoundingClientRect().height, maxRight: Math.max(...kids.map((b) => b.right)), minLeft: Math.min(...kids.map((b) => b.left)),
          clipped: deckEl.scrollWidth - deckEl.clientWidth,
        };
      });
      check(`Handy ${w} px Deck: runder Aufnahme-Knopf direkt hinter ▶, ≥ 44 px`, deck.recIn && deck.recAfterPlay && deck.rec.w >= 44 && deck.rec.h >= 44 && Math.abs(deck.rec.w - deck.rec.h) < 1 && /50%|22px|999/.test(deck.round), JSON.stringify(deck.rec));
      check(`Handy ${w} px Deck: Wiederholen steht neben Rückgängig, beide ≥ 44 px`, deck.undoPair && deck.undo.w >= 44 && deck.undo.h >= 44 && deck.redo.w >= 44 && deck.redo.h >= 44 && deck.redo.vis, JSON.stringify([deck.undo, deck.redo]));
      check(`Handy ${w} px Deck: Zeile passt ohne Überlauf, Takt und Tempo überlappen nicht`,
        deck.maxRight <= w && deck.minLeft >= 0 && deck.clipped <= 0 && deck.h <= 64 && deck.cells.length >= 2 && deck.cells.every((c, i, a) => c.sw <= c.cw + 1 && (i === 0 || a[i - 1].r <= c.l + 1)) && deck.rec.l >= deck.play.r - 1 && deck.undo.l >= deck.cells[deck.cells.length - 1].r - 1,
        JSON.stringify(deck));
      check(`Handy ${w} px: Seite scrollt nicht seitwärts`, noOverflow(await overflow(page)), JSON.stringify(await overflow(page)));

      // ---------- Pillen über den Spuren ----------
      const pills = await page.evaluate(() => {
        const box = document.getElementById('arr-pills');
        const ruler = document.querySelector('.ruler-row').getBoundingClientRect();
        const items = ['snap-sel', 'metro-btn', 'loop-btn'].map((id) => { const n = document.getElementById(id); const b = n.getBoundingClientRect(); return { id, inside: box.contains(n), vis: !!n.offsetParent, r: b.right, bottom: b.bottom, h: b.height }; });
        return { items, aboveRuler: items.every((i) => i.bottom <= ruler.top + 1), maxRight: Math.max(...items.map((i) => i.r)), text: document.getElementById('snap-sel').selectedOptions[0].textContent, zoom: ['zoom-in', 'zoom-out', 'zoomy-in', 'zoomy-out'].map((id) => !!document.getElementById(id).offsetParent) };
      });
      check(`Handy ${w} px: „Raster“, „Klick“ und Loop sitzen über den Spuren, passen in die Breite`, pills.items.every((i) => i.inside && i.vis) && pills.aboveRuler && pills.maxRight <= w, JSON.stringify(pills));
      check(`Handy ${w} px: Raster-Pille zeigt „Raster: Schlag“; Zoom- und Spurhöhen-Knöpfe sind weg`, /Raster: Schlag/.test(pills.text) && pills.zoom.every((v) => !v), JSON.stringify(pills.zoom));
      const targets = await page.evaluate(measureTargets, '#arr-pills select, #arr-pills button, #rec-btn, #undo-btn, #redo-btn, #tab-song');
      check(`Handy ${w} px: Tippflächen von Pillen, Aufnahme, Wiederholen und Reiter ≥ 44 px`, targets.length >= 5 && targets.every((t) => t.w >= 44 && t.h >= 44 && t.ok), JSON.stringify(targets));
      await page.selectOption('#snap-sel', '0.5');
      check(`Handy ${w} px: Raster-Pille ändert das Raster`, await page.evaluate(() => window.loopwerk.ui.snapBeats) === 0.5);
      await page.selectOption('#snap-sel', '1');
      await page.tap('#metro-btn');
      check(`Handy ${w} px: „Klick“ ist ein Schalter`, await page.evaluate(() => document.getElementById('metro-btn').getAttribute('aria-pressed') === 'true' && window.loopwerk.engine.metronome === true));
      await page.tap('#metro-btn');
      const loopBefore = await page.evaluate(() => window.loopwerk.store.project.loop.on);
      await page.tap('#loop-btn');
      check(`Handy ${w} px: Loop-Pille schaltet den Loop`, await page.evaluate(() => window.loopwerk.store.project.loop.on) === !loopBefore);
      await page.tap('#loop-btn');
      await shot('pills');

      // ---------- Fach „Song“ ----------
      const tabs = await page.evaluate(() => ({ ids: [...document.querySelectorAll('#tabbar .tab')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id), label: document.querySelector('#tab-song .tab-label').textContent, more: !!document.getElementById('more') || !!document.getElementById('tab-more') }));
      check(`Handy ${w} px: Fachleiste Sounds, Mixer, Editor, „Song“ – kein „Mehr“`, JSON.stringify(tabs.ids) === '["tab-sounds","mixer-btn","editor-tab","tab-song"]' && tabs.label === 'Song' && !tabs.more, JSON.stringify(tabs));
      await page.tap('#tab-song');
      await page.waitForTimeout(500);
      const song = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const rect = (s) => { const n = q(s); const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), l: b.left, r: b.right, t: b.top }; };
        const links = [...q('#song-links').children].map((n) => n.innerText.trim());
        const tiles = [...document.querySelectorAll('.song-tile')].map((n) => n.querySelector('.song-tile-label').textContent);
        return {
          open: !q('#song').hidden && !!q('#song').offsetParent, name: rect('#project-name'), nameIn: !!q('#song-name #project-name'), tiles, links,
          main: [...q('#song-main').children].map((n) => ({ id: n.id, h: Math.round(n.getBoundingClientRect().height), bg: getComputedStyle(n).backgroundColor })),
          foot: q('#song-foot').textContent.replace(/\s+/g, ' ').trim(), sheetBottom: q('#song').getBoundingClientRect().bottom, tabTop: q('#tabbar').getBoundingClientRect().top, sheetTop: q('#song').getBoundingClientRect().top,
          tempo: q('#song-tempo-out').textContent, key: q('#key-sel-song').value, len: q('#song-length').value,
          newColor: getComputedStyle(q('#new-btn')).color,
        };
      });
      check(`Handy ${w} px: „Song“ öffnet das Fach mit Name, Tempo, Tonart, Länge`, song.open && song.nameIn && song.name.h >= 44 && song.name.w > w - 40 && JSON.stringify(song.tiles) === '["Tempo","Tonart","Länge"]' && song.tempo === '120' && song.key === 'Am' && song.len === '32', JSON.stringify(song));
      check(`Handy ${w} px: Speichern und Exportieren sind helle Hauptknöpfe`, JSON.stringify(song.main.map((m) => m.id)) === '["save-btn","export-btn"]' && song.main.every((m) => m.h >= 44 && /^rgb\((24\d|2[0-5]\d), /.test(m.bg)), JSON.stringify(song.main));
      check(`Handy ${w} px: Textzeile Öffnen · Beispiel · Tipps · Leeren`, JSON.stringify(song.links) === '["Öffnen","Beispiel","Tipps","Leeren"]', JSON.stringify(song.links));
      check(`Handy ${w} px: Fuß mit Marke, Version 2.8 und „Private use only“`, /Loopwerk/i.test(song.foot) && /Version 2\.8/i.test(song.foot) && /Private use only/.test(song.foot), song.foot);
      check(`Handy ${w} px: Fach liegt über der Leiste, ohne Überlauf`, song.sheetBottom <= song.tabTop + 1 && song.sheetTop > 100 && noOverflow(await overflow(page)), JSON.stringify(await overflow(page)));
      const songTargets = await page.evaluate(measureTargets, '#song button, #song select, #song input');
      check(`Handy ${w} px: alle Tippflächen im Fach „Song“ ≥ 44 px`, songTargets.length >= 10 && songTargets.every((t) => t.w >= 44 && t.h >= 44 && t.ok), JSON.stringify(songTargets));
      await shot('song');

      await page.selectOption('#key-sel-song', 'Dm');
      check(`Handy ${w} px: Tonart-Kachel stellt die Songtonart`, await page.evaluate(() => window.loopwerk.store.project.key) === 'Dm');
      await page.selectOption('#key-sel-song', 'Am');
      await page.selectOption('#song-length', '48');
      check(`Handy ${w} px: Längen-Kachel stellt die Takte`, await page.evaluate(() => window.loopwerk.store.project.lengthBars) === 48);
      await page.selectOption('#song-length', '32');
      await page.tap('#project-name');
      await page.fill('#project-name', 'Mein Song');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check(`Handy ${w} px: Song-Name antippen und umbenennen`, await page.evaluate(() => window.loopwerk.store.project.name) === 'Mein Song');
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(400);
      await page.tap('#new-btn');
      const sure = await page.evaluate(() => ({ t: document.getElementById('new-btn').textContent, clips: window.loopwerk.store.project.tracks.reduce((n, t) => n + t.clips.length, 0) }));
      check(`Handy ${w} px: „Leeren“ fragt erst „Sicher?“, ohne zu leeren`, sure.t === 'Sicher?' && sure.clips > 0, JSON.stringify(sure));
      await page.waitForTimeout(3200);
      check(`Handy ${w} px: ohne zweiten Tipp bleibt der Song, der Knopf kehrt zurück`, await page.evaluate(() => document.getElementById('new-btn').textContent === 'Leeren' && window.loopwerk.store.project.tracks.some((t) => t.clips.length)));
      await page.tap('#song-tempo');
      await page.waitForTimeout(400);
      check(`Handy ${w} px: Tempo-Kachel öffnet das Tempo-Fach`, (await lw()).dock === 'tempo' && await page.locator('#tempo').isVisible());
      check(`Handy ${w} px: im Tempo-Fach kein Überlauf`, noOverflow(await overflow(page)));
      await shot('tempo');
      await page.evaluate(() => window.loopwerk.ui.setDock(null));

      // ---------- Version überall gleich ----------
      const ver = await page.evaluate(() => ({ boot: document.getElementById('boot-version').textContent, tag: document.querySelector('.brand-tag').textContent, about: document.getElementById('pop-about').textContent }));
      check(`Handy ${w} px: Version auf Ladescreen, Marke und Info gleich (2.8)`, /2\.8$/.test(ver.boot) && /2\.8$/.test(ver.tag) && /Loopwerk 2\.8/.test(ver.about), JSON.stringify(ver));
      check(`Keine Fehler in der Konsole (Handy ${w})`, app.errors.length === 0, app.errors.join(' | '));
    } catch (e) {
      check(`Handy ${w} px: Ablauf ohne Ausnahme`, false, e.stack);
    } finally {
      await app.close();
    }
  }

  // Desktop bleibt: Knöpfe an ihren alten Plätzen
  const desk = await openApp({ viewport: { width: 1400, height: 820 } });
  try {
    const d = await desk.page.evaluate(() => ({
      pills: !!document.getElementById('arr-pills').offsetParent,
      undo: !!document.getElementById('undo-btn').closest('#deck-edit'), redo: !!document.getElementById('redo-btn').closest('#deck-edit'),
      snap: !!document.getElementById('snap-sel').closest('#arr-bar-view'), loop: !!document.getElementById('loop-btn').closest('.deck'), metro: !!document.getElementById('metro-btn').closest('.deck'),
      menu: ['project-name', 'open-btn', 'save-btn', 'demo-btn', 'new-btn', 'tips-reset'].every((id) => document.getElementById(id).closest('#project-menu')), tips: getComputedStyle(document.querySelector('#tips-reset .lbl-short')).display + '/' + getComputedStyle(document.querySelector('#tips-reset .lbl-long')).display,
    }));
    check('Desktop unverändert: Pillen unsichtbar, alle Knöpfe an ihrem alten Platz', !d.pills && d.undo && d.redo && d.snap && d.loop && d.metro && d.menu && d.tips === 'none/inline', JSON.stringify(d));
    check('Keine Fehler in der Konsole (Desktop)', desk.errors.length === 0, desk.errors.join(' | '));
  } catch (e) {
    check('Desktop: Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await desk.close();
    finish();
  }
})();
