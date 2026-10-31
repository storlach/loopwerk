// Clip-Editor: Anhören im Loop, Tonhöhe und Autotune sofort hören (ohne „Anwenden“), Rückgängig.
// node tests/editor-live.test.cjs
const { openApp, createChecker, clickR, selectR } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(() => {
      const { library, store, editor } = window.loopwerk;
      const sr = 44100;
      const b = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr });
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr);
      library.register({ id: 'own-live', name: 'Ton', category: 'own', kind: 'oneshot', lengthBeats: 2, bpm: 120, buffer: b, orig: b });
      editor.open(store.addClip('t3', 'own-live', 0, 2));
    });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    // ---------- Anhören im Loop ----------
    await page.click('#ed-play');
    await page.waitForTimeout(1600);
    const p1 = await page.evaluate(() => ({ loop: !!window.loopwerk.engine.preview?.loop, label: document.getElementById('ed-play').textContent }));
    check('Anhören läuft im Loop weiter (länger als der Clip)', p1.loop && /Stopp/.test(p1.label), JSON.stringify(p1));
    // ---------- Tonhöhe: sofort, ohne „Anwenden“ ----------
    const f0 = () => page.evaluate(() => {
      const d = window.loopwerk.editor.state.chs[0];
      let z = 0;
      for (let i = 1; i < 22050; i++) if (d[i - 1] < 0 && d[i] >= 0) z++;
      return z * 2;
    });
    const before = await f0();
    const prev = await page.evaluate(() => window.loopwerk.engine.preview);
    await clickR(page, '#ed-pitch-up');
    await clickR(page, '#ed-pitch-up');
    await page.waitForFunction(() => (window.loopwerk.editor.state.rev || 0) >= 1, null, { timeout: 10000 });
    await page.waitForTimeout(200);
    const after = await f0();
    const st = await page.evaluate((p) => ({ hist: window.loopwerk.editor.state.history.length, playing: !!window.loopwerk.engine.preview?.loop, newPreview: window.loopwerk.engine.preview !== p, applyHidden: document.getElementById('ed-pitch-apply').hidden, val: document.getElementById('ed-pitch-value').textContent }), prev);
    check('Tonhöhe +2 wirkt sofort (≈ 247 Hz statt 220 Hz)', Math.abs(after / before - 2 ** (2 / 12)) < 0.03, `${before} → ${after} Hz`);
    check('Ein Rückgängig-Schritt, Vorhören läuft mit neuem Klang weiter, kein „Anwenden“ mehr', st.hist === 1 && st.playing && st.applyHidden && st.val === '+2', JSON.stringify(st));
    // ---------- Autotune als Schalter ----------
    await clickR(page, '#ed-autotune');
    await page.waitForFunction(() => (window.loopwerk.editor.state.rev || 0) >= 2, null, { timeout: 20000 });
    const at = await page.evaluate(() => ({ pressed: document.getElementById('ed-autotune').getAttribute('aria-pressed'), hist: window.loopwerk.editor.state.history.length }));
    check('Autotune an: sofort gerechnet, weiterhin ein Rückgängig-Schritt', at.pressed === 'true' && at.hist === 1, JSON.stringify(at));
    await selectR(page, '#ed-at-scale', 'major');
    await page.waitForFunction(() => (window.loopwerk.editor.state.rev || 0) >= 3, null, { timeout: 20000 });
    check('Einstellung ändern rechnet neu, ohne Bestätigen', true);
    // ---------- Rückgängig ----------
    await page.click('#ed-undo');
    await page.waitForTimeout(200);
    const back = await f0();
    const u = await page.evaluate(() => ({ hist: window.loopwerk.editor.state.history.length, pressed: document.getElementById('ed-autotune').getAttribute('aria-pressed'), val: document.getElementById('ed-pitch-value').textContent }));
    check('Rückgängig: Originalklang, Schalter aus', Math.abs(back - before) <= 4 && u.hist === 0 && u.pressed === 'false' && u.val === '0', JSON.stringify({ back, before, ...u }));
    await page.click('#ed-play');
    check('Stopp hält das Vorhören an', await page.evaluate(() => !window.loopwerk.engine.preview));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
