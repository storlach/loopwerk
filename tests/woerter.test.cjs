// Umbau Scheibe 7: Wörter (docs/umbau/woerter.md, src/ui/words-table.js). Nur im Layout „reiter“ am Desktop; Handy und Krachwerk behalten die alten Wörter.
// Prüft: neue Wörter am Desktop (Sounds statt Assets, Links/Rechts, Hall-Anteil, Aufnahme bereit, Lautheit; Duplizieren, Summe, Mastering, Limiter bleiben),
// Kennungen unverändert, alte Wörter am Handy nach dem Wechsel der Breite und in Krachwerk, dynamische Texte (Mixer-Zeile) über dieselbe Tabelle.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  const lw = (fn, arg) => page.evaluate(fn, arg);
  const text = (id) => lw((i) => document.getElementById(i)?.textContent.trim(), id);
  // Text aller sichtbaren Blätter der Karte (ohne das Regal: Sound-Namen sind Inhalt)
  const visText = () => [...document.querySelectorAll('#side *')].filter((n) => n.offsetParent && !n.children.length && !n.closest('#library')).map((n) => n.textContent.trim() + ' ' + (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('title') || '')).join(' | ').replace(/\s+/g, ' ');
  const attr = (id, a) => lw(([i, n]) => document.getElementById(i)?.getAttribute(n), [id, a]);
  try {
    await lw(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createDemoProject()); });
    await page.waitForTimeout(500);
    check('Desktop: Seitenleiste heißt „Sounds“ (nicht Assets), keine Überschrift „Assets“', (await lw(() => document.querySelector('.shelf').getAttribute('aria-label'))) === 'Sounds' && !(await lw(() => [...document.querySelectorAll('body *')].some((n) => n.offsetParent && n.children.length === 0 && /^Assets$/.test(n.textContent.trim())))));
    // Martin (2026-11-13): Duplizieren, Summe/Master, Mastering und Limiter bleiben
    check('Desktop: „Duplizieren“ bleibt (Knopf und Hinweistext), kein „Kopieren“', (await text('dup-btn')) === 'Duplizieren' && /uplizier/.test(await attr('dup-btn', 'title')));
    check('Desktop: Beispiel laden, Kennungen unverändert', (await text('demo-btn')) === 'Beispiel laden' && !!(await lw(() => document.getElementById('new-btn'))));
    check('Desktop: Deck-Anzeige „Master“ bleibt, kein „Gesamt“', await lw(() => /Master/i.test(document.querySelector('.deck').textContent) && !/Gesamt/i.test(document.querySelector('.deck').textContent)));
    // Mixer-Zeile (dynamisch erzeugt)
    await page.click('#side-tab-mixer');
    await page.waitForTimeout(500);
    const mx = await lw(() => {
      const row = document.querySelector('.mix-slot');
      const labels = [...row.querySelectorAll('[aria-label],[title]')].map((n) => (n.getAttribute('aria-label') || '') + '|' + (n.getAttribute('title') || ''));
      return { text: row.textContent, labels: labels.join(' ; ') };
    });
    check('Mixer-Zeile: „Hall“ und „Echo“ statt →H/→E, Hall-Anteil und Links/Rechts als Beschriftung', /Hall/.test(mx.text) && /Echo/.test(mx.text) && !/→/.test(mx.text) && /Hall-Anteil/.test(mx.labels) && /Echo-Anteil/.test(mx.labels) && /Links\/Rechts/.test(mx.labels) && !/Panorama|-Bus/.test(mx.labels), JSON.stringify(mx));
    const bus = await lw(() => document.getElementById('mix-bus').textContent + ' | ' + [...document.querySelectorAll('#mix-bus [aria-label]')].map((n) => n.getAttribute('aria-label')).join(' ; '));
    check('Summe, Hall, Echo: „Summe“ bleibt, Hall-Bus/Echo-Bus heißen Hall/Echo', /Summe/i.test(bus) && /Hall/i.test(bus) && /Echo/i.test(bus) && !/Gesamt|-Bus/.test(bus), bus);
    await lw(() => window.loopwerk.mixer.select('__master'));
    await page.waitForTimeout(500);
    const card = await lw(visText);
    check('Summen-Karte: Mastering, Hall und Echo, Master-Lautstärke; kein Feinschliff, Gesamt, Busse', /Mastering/i.test(card) && /Hall und Echo/i.test(card) && /Master/i.test(card) && !/Feinschliff|Gesamt|Busse/.test(card), card.slice(0, 300));
    check('Messwert mit Etikett: „Lautheit … LUFS · Spitze … dBTP“ oder „Ziel-Lautheit“', await lw(() => /(Lautheit|Ziel-Lautheit) −?[\d,]+ LUFS/.test(document.getElementById('side').textContent)), '');
    await lw(() => window.loopwerk.mixcol.close());
    // Spur-Karte: Aufnahme bereit
    await lw(() => { const k = window.loopwerk; k.mixer.select(k.store.project.tracks[0].id); });
    await page.waitForTimeout(500);
    const tr = await lw(visText);
    check('Spur-Karte: „Aufnahme bereit“, „Links/Rechts“, „Hall-Anteil“; kein Scharf, Panorama, Bus', /Aufnahme bereit/.test(tr) && /Links\/Rechts/.test(tr) && /Hall-Anteil/.test(tr) && !/Scharf|Panorama|-Bus/.test(tr), tr.slice(0, 300));
    await lw(() => window.loopwerk.mixcol.close());
    // Clip bearbeiten
    await lw(() => { const k = window.loopwerk; const c = k.store.project.tracks.flatMap((t) => t.clips).find((c) => !k.library.get(c.sampleId)?.patternId); k.ui.select(c.id); k.editor.open(c.id); });
    await page.waitForTimeout(800);
    check('Karte heißt „Clip bearbeiten“ (aria-label des Editors), keine „Sample-Editor“', (await lw(() => document.getElementById('editor').getAttribute('aria-label'))) === 'Clip bearbeiten');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // ---------- Handy: alte Wörter ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    check('Handy: alte Wörter kehren zurück (Assets, Duplizieren, Beispiel, Sample-Editor)', (await lw(() => document.querySelector('.shelf').getAttribute('aria-label'))) === 'Assets' && (await text('dup-btn')) === 'Duplizieren' && (await text('demo-btn')) === 'Beispiel' && (await lw(() => document.getElementById('editor').getAttribute('aria-label'))) === 'Sample-Editor');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(700);
    check('Zurück am Desktop: neue Wörter wieder da', (await text('demo-btn')) === 'Beispiel laden' && (await lw(() => document.querySelector('.shelf').getAttribute('aria-label'))) === 'Sounds');

    // ---------- Krachwerk: nichts geändert ----------
    await page.goto(app.url + '?edition=make');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const k = await lw(() => ({ dup: document.getElementById('dup-btn').textContent.trim(), shelf: document.querySelector('.shelf').getAttribute('aria-label'), demo: document.getElementById('demo-btn').textContent.trim(), layout: document.getElementById('app').dataset.layout }));
    check('Krachwerk: Wörter unverändert', k.dup === 'Duplizieren' && k.shelf === 'Assets' && k.demo === 'Beispiel' && k.layout === 'klassisch', JSON.stringify(k));
    check('keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || String(e));
  } finally {
    await app.close();
    finish();
  }
})();
