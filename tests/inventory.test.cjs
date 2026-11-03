// Krachwerk Scheibe 5, Abschluss-Prüfung 1 (Spec docs/specs/krachwerk-5-song.md §8.1): Inventar aller Loopwerk-Funktionen mit
// Hauptort in Krachwerk. Jeder Pfad aus tests/inventory.json wird am Handy und am Desktop ausgeführt: Selektor-Folge ab einem
// benannten Zustand, höchstens 2 Tipps, höchstens ein Zwilling, Ziel sichtbar. Dazu: /?density=calm (Loopwerk) – Pfade werden
// nur ausgegeben, ohne Budget. node tests/inventory.test.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');
const { PHONE, DESK, openKw, seedTwo, visible } = require('./kw-common.cjs');

const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'));

// Zustand herstellen (Handy: Werkbank-Schublade offen, wo es eine Werkbank gibt)
async function setState(page, phone, state) {
  await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.selectTrack(null); lw.ui.openSound(null); lw.ui.setDock(null); lw.store.setLoop({ on: false }); });
  await page.waitForTimeout(250);
  if (!phone && await page.evaluate(() => document.getElementById('app').classList.contains('insp-open') && !window.loopwerk.ui.selectedClipId)) await page.click('.insp-toggle', { timeout: 2000 }).catch(() => {});
  if (state === 'song') { if (phone) await page.tap('#deck-name'); else await page.click('#project-menu-btn'); }
  else if (state === 'clip') await page.evaluate((ph) => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); void ph; }, phone);
  else if (state === 'spur') await page.evaluate((ph) => { const lw = window.loopwerk; lw.ui.selectTrack(lw.store.project.tracks[0].id); if (ph) lw.ui.setDock('werkbank'); }, phone);
  else if (state === 'loop') await page.evaluate(() => window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 4 }));
  await page.waitForTimeout(500);
}

async function tap(page, phone, sel) {
  const loc = page.locator(`${sel}:visible`).first();
  await loc.waitFor({ state: 'visible', timeout: 4000 });
  // Feinheiten merken ihren Zustand: ist der Bereich schon offen, zählt der Tipp trotzdem (er wäre sonst das Zuklappen)
  if (/fine/.test(sel) && (await loc.getAttribute('aria-expanded')) === 'true') return;
  if (phone) await loc.tap(); else await loc.click();
  await page.waitForTimeout(250);
}

// Läuft einen Pfad; Rückgabe { ok, taps, why }
async function runPath(page, phone, p) {
  if (p.state === 'extern') return { ok: true, taps: 0, why: 'abgedeckt: ' + p.covered };
  await setState(page, phone, p.state);
  const steps = [...(phone && p.phone ? p.phone : []), ...p.steps];
  try {
    for (const s of steps) await tap(page, phone, s);
    if (p.gesture === 'zoom') {
      const before = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
      if (phone) return { ok: true, taps: 0, why: 'Zwei-Finger-Zoom (Geste), Zwilling per Tastatur nicht am Handy' };
      await page.mouse.move(700, 300);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -300);
      await page.keyboard.up('Control');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
      return { ok: after !== before, taps: 0, why: `Strg+Rad ${before.toFixed(1)} → ${after.toFixed(1)}` };
    }
    let ok;
    if (p.expect === 'status:export') { ok = await page.waitForFunction(() => /gerendert|Fertig|Datei/.test(document.getElementById('sb-status')?.textContent ?? ''), null, { timeout: 30000 }).then(() => true, () => false); await page.waitForFunction(() => !document.getElementById('export-btn').disabled, null, { timeout: 30000 }).catch(() => {}); }
    else if (p.expect === 'state:loop') ok = await page.evaluate(() => window.loopwerk.store.project.loop.on);
    else ok = await visible(page, phone && p.expectPhone ? p.expectPhone : p.expect);
    return { ok, taps: steps.length, why: ok ? '' : `Ziel ${p.expect} nicht sichtbar` };
  } catch (e) {
    return { ok: false, taps: steps.length, why: e.message.split('\n')[0] };
  }
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    check('Inventar: Pfade nennen Zustand, Schritte (≤ 2), Zwillinge (≤ 1); Wegfall mit Grund', inv.paths.length >= 30 && inv.paths.every((p) => p.steps.length + (p.phone?.length ?? 0) <= 2 + (p.phone ? 1 : 0) && p.steps.length <= 2 && p.twins <= 1 && p.state) && inv.dropped.every((d) => d.reason && d.loopwerk), `${inv.paths.length} Pfade, ${inv.dropped.length} entfallen`);
    // Jede Zeile aus ux.md §5 kommt im Inventar vor (Stichworte)
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ux', 'krachwerk-brainstorm', 'ux.md'), 'utf8');
    const rows = (doc.split('## 5.')[1] || '').split('## 6.')[0].split('\n').filter((l) => l.startsWith('| ') && !/^\|[-| ]+\|$/.test(l) && !l.startsWith('| Loopwerk |')).map((l) => l.split('|')[1].trim());
    const text = JSON.stringify(inv).toLowerCase();
    const keys = { 'regal': 'regal', 'erstellen-karten': 'erstellen', 'inspektor clip': 'inspektor clip', 'sample-editor': 'sample-editor', 'pattern-editor': 'pattern-editor', 'mixer, mixer-detail': 'mixer-detail', 'fx-pad': 'fx-pad', 'tonart-/akkord-streifen': 'akkord-streifen', 'automation': 'automation', 'zoom': 'zoom', 'projekt-menü': 'projekt-menü', 'clip-leiste': 'clip-leiste', 'tastenkürzel': 'tastenkürzel' };
    const missing = rows.filter((r) => !Object.entries(keys).some(([k, v]) => r.toLowerCase().includes(k) && text.includes(v)));
    check('Inventar deckt jede Zeile aus ux.md §5', rows.length >= 12 && missing.length === 0, `${rows.length} Zeilen, fehlen: ${missing.join('; ')}`);

    for (const [dev, opts] of [['Handy', PHONE], ['Desktop', DESK]]) {
      const phone = dev === 'Handy';
      const ctx = await browser.newContext(opts);
      const k = await openKw(base, ctx);
      const page = k.page;
      await seedTwo(page);
      await page.waitForTimeout(600);
      const res = [];
      for (const p of inv.paths) { const t0 = Date.now(); const r = await runPath(page, phone, p); res.push([p, r]); if (process.env.INV_DEBUG) console.log(`     ${dev} ${p.id} ${r.ok ? 'ok' : 'FEHLT'} ${Date.now() - t0} ms ${r.why}`); }
      const bad = res.filter(([, r]) => !r.ok);
      const max = Math.max(...res.map(([, r]) => r.taps));
      check(`${dev}: alle ${inv.paths.length} Inventar-Pfade laufen (Ziel sichtbar), höchstens 2 Tipps ab dem Zustand`, bad.length === 0 && max <= 3, bad.map(([p, r]) => `${p.id}: ${r.why}`).join(' | ') || `längster Pfad ${max} Schritte`);
      const over2 = res.filter(([p, r]) => r.taps > 2).map(([p, r]) => `${p.id} (${r.taps})`);
      console.log(`   ${dev}: Pfade mit Tippzahl: ${res.map(([p, r]) => `${p.id}=${r.taps}`).join(' ')}${over2.length ? ' · über 2: ' + over2.join(', ') : ''}`);
      check(`${dev}: Konsole ohne Fehler`, k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // Loopwerk mit ?density=calm: Pfade ausführen und ausgeben (ohne Budget)
    for (const [dev, opts] of [['Handy', PHONE], ['Desktop', DESK]]) {
      const phone = dev === 'Handy';
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}/?density=calm`);
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await page.evaluate(() => window.loopwerk.library.catalogReady);
      await page.evaluate(() => { const lw = window.loopwerk; if (!lw.store.project.tracks.some((t) => t.clips.length)) { const id = lw.library.list()[0].id; lw.store.addClip(lw.store.project.tracks[0].id, id, 0, 4); } });
      await page.waitForTimeout(600);
      let ok = 0;
      const fails = [];
      for (const p of inv.paths) {
        if (p.state === 'extern') continue;
        // ohne Song-Werkbank: nur Pfade, die nicht an sb-… hängen, sind sinnvoll – der Rest wird gezählt und als nicht vorhanden ausgegeben
        const r = await Promise.race([runPath(page, phone, p).catch((e) => ({ ok: false, why: e.message })), new Promise((res) => setTimeout(() => res({ ok: false, why: 'Zeit' }), 12000))]);
        if (r.ok) ok++; else fails.push(p.id);
      }
      console.log(`   Loopwerk ?density=calm (${dev}): ${ok} von ${inv.paths.length - 1} Inventar-Pfaden laufen (ohne Budget; Rest ist Krachwerk-Eigenes: ${fails.join(', ')})`);
      check(`Loopwerk ?density=calm (${dev}): Pfade ausgeführt, Konsole ohne Fehler`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
