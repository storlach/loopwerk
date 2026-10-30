// Version 1.7: flüssige Tasteneingabe (keine verlorenen Schläge, kein Ruckeln) und Splash-Screen beim Laden.
// node tests/v17.test.cjs
const { chromium } = require('playwright');
const { openApp, createChecker, clickR, selectR, createCard } = require('./harness.cjs');
const { start } = require('./serve.cjs');

const { check, finish } = createChecker();

(async () => {
  // ---------- Splash-Screen ----------
  const server = await start();
  const browser = await chromium.launch();
  const sp = await browser.newPage();
  const errors = [];
  sp.on('pageerror', (e) => errors.push(e.message));
  let n = 0;
  await sp.route('**/*.wav', async (r) => { await new Promise((res) => setTimeout(res, 100 + (n++) * 40)); r.continue(); });
  const seen = [];
  await sp.exposeFunction('__seen', (v) => seen.push(v));
  await sp.addInitScript(() => {
    new MutationObserver(() => {
      const pct = document.getElementById('boot-pct');
      if (pct) window.__seen(`${pct.textContent}|${document.getElementById('boot-step').textContent}`);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await sp.goto(`http://127.0.0.1:${server.address().port}/`);
  const early = await sp.evaluate(() => {
    const s = document.getElementById('boot');
    return { visible: !s.hidden && getComputedStyle(s).opacity === '1', logo: !!s.querySelector('.splash-name'), bar: !!s.querySelector('[role="progressbar"]') };
  });
  check('Splash mit Logo und Fortschrittsbalken erscheint sofort', early.visible && early.logo && early.bar, JSON.stringify(early));
  await sp.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 60000 });
  const pcts = seen.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v));
  const rising = pcts.every((v, i) => i === 0 || v >= pcts[i - 1]);
  const steps = [...new Set(seen.map((v) => v.split('|')[1].replace(/\d+ von \d+/, 'N von M')))];
  check('Fortschritt steigt stetig bis 100 %', rising && pcts.length > 10 && pcts[pcts.length - 1] === 100, `${pcts.length} Stände, ${pcts.slice(0, 3).join(',')} … ${pcts.slice(-3).join(',')}`);
  check('Splash nennt die Ladeschritte', steps.some((t) => t.startsWith('Sounds werden geladen')) && steps.some((t) => t.startsWith('Projekt')) && steps.some((t) => t.startsWith('Fertig')), steps.join(' | '));
  await sp.waitForTimeout(700);
  check('Splash blendet sich danach aus', await sp.evaluate(() => document.getElementById('boot').hidden));
  check('Keine Fehler beim Laden', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();

  // ---------- Tasteneingabe ----------
  const app = await openApp();
  const { page } = app;
  try {
    await page.evaluate(() => {
      window.__starts = 0;
      const orig = AudioScheduledSourceNode.prototype.start;
      AudioScheduledSourceNode.prototype.start = function (...a) { if (this.context === window.loopwerk.engine.ctx) window.__starts++; return orig.apply(this, a); };
    });
    await createCard(page, 'beat');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.click('#pat-view [data-view="pads"]');
    await page.keyboard.press('a');
    await page.waitForTimeout(300);
    // 10 Anschläge im Abstand von 20 ms: 10 Klänge, 10 Mal Aufleuchten
    await page.evaluate(() => {
      window.__starts = 0;
      window.__flashes = 0;
      const pad = document.querySelector('#pat-pads [data-row="kick"]');
      // Zählt jedes neue Aufleuchten („hit“ kommt dazu), nicht jede andere Klassenänderung (z. B. „held“)
      const hasHit = (c) => /(^|\s)hit(\s|$)/.test(c || '');
      new MutationObserver((records) => {
        // Zustandsfolge aus den alten Werten plus dem jetzigen: jeder Wechsel „ohne hit“ → „mit hit“ zählt
        const states = [...records.map((r) => r.oldValue), pad.className];
        for (let i = 1; i < states.length; i++) if (hasHit(states[i]) && !hasHit(states[i - 1])) window.__flashes++;
      }).observe(pad, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
    for (let i = 0; i < 10; i++) { await page.keyboard.press('a'); await page.waitForTimeout(20); }
    await page.waitForTimeout(300);
    const fast = await page.evaluate(() => ({ starts: window.__starts, flashes: window.__flashes }));
    check('10 schnelle Tastenschläge = 10 Klänge', fast.starts === 10, JSON.stringify(fast));
    check('Jeder Schlag lässt das Pad neu aufleuchten', fast.flashes === 10, JSON.stringify(fast));

    // Fokus auf einer Auswahl: Buchstaben spielen trotzdem das Pad und verstellen die Auswahl nicht
    await page.focus('#pat-kit');
    const kit0 = await page.inputValue('#pat-kit');
    await page.evaluate(() => { window.__starts = 0; });
    await page.keyboard.press('a');
    await page.keyboard.press('t');
    await page.waitForTimeout(200);
    const sel = await page.evaluate(() => ({ starts: window.__starts, kit: document.getElementById('pat-kit').value }));
    check('Auf der Kit-Auswahl: Taste spielt das Pad, Auswahl bleibt', sel.starts >= 1 && sel.kit === kit0, JSON.stringify(sel));
    await selectR(page, '#pat-quant', '1');
    check('Nach einer Auswahl liegt der Fokus nicht mehr im Auswahlfeld', await page.evaluate(() => document.activeElement?.id !== 'pat-quant'));

    // Live: 10 Sechzehntel nacheinander → 10 Schritte; ein gleichzeitiger Doppelschlag bleibt einer
    await clickR(page, '#pat-clear');
    await page.click('#pat-live');
    await page.evaluate(() => new Promise((r) => { const lp = window.loopwerk.patternEditor.looper; const go = () => (window.loopwerk.engine.ctx.currentTime > lp.t0 + 0.2 ? r() : setTimeout(go, 5)); go(); }));
    const t = Date.now();
    for (let i = 0; i < 10; i++) { await page.keyboard.press('d'); await page.waitForTimeout(Math.max(0, t + (i + 1) * 125 - Date.now())); }
    await page.evaluate(() => {
      const k = (type) => document.dispatchEvent(new KeyboardEvent(type, { key: 'g', bubbles: true }));
      k('keydown'); k('keyup'); k('keydown'); k('keyup');
    });
    await page.waitForTimeout(300);
    await page.click('#pat-live');
    const rows = await page.evaluate(() => { const p = Object.values(window.loopwerk.store.project.patterns)[0]; return { clap: p.rows.clap.reduce((a, v) => a + (v ? 1 : 0), 0), open: p.rows.open.reduce((a, v) => a + (v ? 1 : 0), 0) }; });
    check('Live: 10 schnelle Sechzehntel landen auf 10 Schritten', rows.clap === 10, JSON.stringify(rows));
    check('Live: echter Doppelschlag (gleichzeitig) bleibt ein Schlag', rows.open === 1, JSON.stringify(rows));

    // Flüssig: eine Eingabe zeichnet nur die geänderte Spur neu
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    const cost = await page.evaluate(async () => {
      const { store, arranger, patternEditor } = window.loopwerk;
      const time = (fn) => { const a = performance.now(); fn(); return performance.now() - a; };
      let full = 0, quick = 0;
      for (let i = 0; i < 5; i++) { full += time(() => arranger.render(true)); quick += time(() => arranger.render()); }
      const canvases = document.querySelectorAll('.clip-wave').length;
      let redrawn = 0;
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...a) { if (this.classList.contains('clip-wave')) redrawn++; return orig.apply(this, a); };
      store.updatePattern(patternEditor.id, (q) => { q.notes = [{ pitch: 60, start: 0, len: 1, vel: 1 }]; });
      await new Promise((r) => setTimeout(r, 400));
      HTMLCanvasElement.prototype.getContext = orig;
      return { full: +(full / 5).toFixed(2), quick: +(quick / 5).toFixed(2), canvases, redrawn };
    });
    check('Unveränderte Spuren werden nicht neu gezeichnet', cost.quick < cost.full / 4, JSON.stringify(cost));
    check('Eine Noteneingabe zeichnet nur den geänderten Clip neu', cost.redrawn >= 1 && cost.redrawn <= 2 && cost.canvases > 5, JSON.stringify(cost));

    // Arranger bleibt korrekt: Clip ziehen und abbrechen, Auswahl von außen
    const clip = page.locator('.lane[data-track-id="t4"] .clip').first();
    const b = await clip.boundingBox();
    await page.mouse.move(b.x + 40, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 200, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Control+z');
    const back = await page.evaluate(() => {
      const c = window.loopwerk.store.track('t4').clips[0];
      const node = document.querySelector(`.clip[data-clip-id="${c.id}"]`);
      return { start: c.startBeat, left: parseFloat(node.style.left), ppb: window.loopwerk.ui.pxPerBeat, nodes: document.querySelectorAll('.lane[data-track-id="t4"] .clip').length };
    });
    check('Nach Verschieben und Rückgängig steht der Clip wieder richtig', Math.abs(back.left - back.start * back.ppb) < 0.5 && back.nodes === 1, JSON.stringify(back));
    const selOk = await page.evaluate(() => {
      const { ui, store } = window.loopwerk;
      const id = store.track('t2').clips[0].id;
      ui.select(id);
      store.setTrack('t8', { volume: 0.5 });
      return document.querySelector(`.clip[data-clip-id="${id}"]`).classList.contains('selected');
    });
    check('Auswahl bleibt sichtbar, auch wenn nur andere Spuren sich ändern', selOk);
    // ---------- Bild und Ton synchron (Ausgabelatenz wie bei Bluetooth: 200 ms) ----------
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.evaluate(async () => {
      const mm = await import('./src/model.js');
      const p = mm.createDemoProject();
      p.loop = { on: true, startBeat: 0, endBeat: 4 };
      window.loopwerk.store.replace(p);
      document.getElementById('arr-scroll').scrollLeft = 0;
    });
    await page.click('#play-btn');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const ctx = window.loopwerk.engine.ctx;
      ctx.getOutputTimestamp = () => ({ contextTime: ctx.currentTime - 0.2, performanceTime: performance.now() });
    });
    const lag = await page.evaluate(() => {
      const e = window.loopwerk.engine;
      return { now: e.currentBeat(), heard: e.heardBeat(), spb: e.spb };
    });
    const lagBeats = lag.now - lag.heard;
    check('Hörbare Position liegt um die Ausgabelatenz zurück', Math.abs(lagBeats - 0.2 / lag.spb) < 0.02, JSON.stringify(lag));
    // Kurz nach dem Loop-Sprung (Planungsuhr schon wieder vorn): Marke steht noch am Loop-Ende, wie man es hört
    await page.evaluate(() => new Promise((r) => {
      const e = window.loopwerk.engine;
      const go = () => { const b = e.currentBeat(); if (b > 0.05 && b < 0.2 && e.anchors.length > 1) r(); else requestAnimationFrame(go); };
      go();
    }));
    await page.waitForTimeout(16);
    const jump = await page.evaluate(() => {
      const e = window.loopwerk.engine;
      const ph = document.querySelector('.playhead').style.transform;
      return { now: +e.currentBeat().toFixed(2), heard: +e.heardBeat().toFixed(2), ph, ppb: window.loopwerk.ui.pxPerBeat, lcd: document.getElementById('lcd-beat').textContent };
    });
    check('Am Loop-Sprung springt die Marke erst, wenn man den Sprung hört', jump.heard > 3.3 && jump.heard < 4 && jump.lcd === '4', JSON.stringify(jump));
    await page.waitForTimeout(80);
    const ph = await page.evaluate(() => {
      const e = window.loopwerk.engine;
      const x = parseFloat(document.querySelector('.playhead').style.transform.match(/translateX\(([-\d.]+)px/)[1]);
      const headW = parseFloat(getComputedStyle(document.querySelector('.arr-grid')).getPropertyValue('--head-w'));
      return { markBeat: (x - headW) / window.loopwerk.ui.pxPerBeat, heard: e.heardBeat(), now: e.currentBeat() };
    });
    check('Abspielmarke zeigt die hörbare Position', Math.abs(ph.markBeat - ph.heard) < 0.08 && Math.abs(ph.markBeat - ph.now) > 0.2, JSON.stringify(ph));
    await page.click('#play-btn');

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
