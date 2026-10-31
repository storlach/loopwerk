// Kleine Lücken: Gruppenkopf wächst mit der Spurhöhe, Sound-Tempo am Handy, Tonartwechsel im Inspektor,
// Gleiten am Handy als Knopf in der Kopfzeile (Zeile passt auch bei 360 px).
// node tests/luecken.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let page = app.page;
  try {
    // ---------- Gruppenkopf (aufgeklappt) wächst mit der Spurhöhe ----------
    const gh = await page.evaluate(async () => {
      const { store, ui, arranger } = window.loopwerk;
      store.groupTracks?.(['t1', 't2']);
      await new Promise((r) => setTimeout(r, 100));
      const h = () => document.querySelector('.group-row:not(.collapsed)')?.getBoundingClientRect().height ?? null;
      const a = h();
      arranger.zoomYTo(2.5);
      arranger.render();
      await new Promise((r) => setTimeout(r, 100));
      return { a, b: h(), has: !!document.querySelector('.group-row') };
    });
    if (gh.has) check('Aufgeklappter Gruppenkopf wächst mit der Spurhöhe', gh.b > gh.a + 4, JSON.stringify(gh));
    else check('Gruppe angelegt (Testaufbau)', false, JSON.stringify(gh));
    // ---------- Tonartwechsel im Inspektor ----------
    await page.evaluate(() => { const { store, ui } = window.loopwerk; ui.select(null); ui.selectTrack?.(null); store.setKeyAt(5, 'Dm'); store.setKeyAt(9, 'Em'); });
    await page.waitForTimeout(200);
    const kc = await page.evaluate(() => [...document.querySelectorAll('#insp-keychg .insp-keychg-row')].map((r) => r.textContent));
    check('Inspektor „Song“ listet die Tonartwechsel', kc.length === 2 && /Takt 5/.test(kc[0]) && /Dm/.test(kc[0]) && /Em/.test(kc[1]), JSON.stringify(kc));
    await page.click('#insp-keychg .insp-keychg-row:first-of-type .insp-keychg-rm');
    await page.waitForTimeout(150);
    const kc2 = await page.evaluate(() => window.loopwerk.store.project.keyChanges?.map((c) => `${c.bar}:${c.key}`));
    check('× entfernt den Wechsel', JSON.stringify(kc2) === JSON.stringify(['9:Em']), JSON.stringify(kc2));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Sound-Tempo in der Clip-Leiste, Gleiten-Knopf ----------
    for (const w of [390, 360]) {
      app = await openApp({ viewport: { width: w, height: 800 }, hasTouch: true });
      page = app.page;
      if (w === 390) {
        await page.evaluate(async () => {
          const { library, store, ui } = window.loopwerk;
          const sr = 44100;
          const orig = new AudioBuffer({ numberOfChannels: 1, length: 2 * sr, sampleRate: sr });
          orig.getChannelData(0)[0] = 0.9;
          await library.add({ id: 'own-phone', name: 'Handy-Beat', category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', orig, duration: 2 });
          store.setBpm(120);
          ui.select(store.addClip(store.project.tracks[0].id, 'own-phone', 64, 4));
        });
        await page.waitForTimeout(300);
        await page.tap('#cb-levels');
        await page.waitForTimeout(200);
        check('Handy: Pegel zeigt „Tempo“ für eigene Aufnahmen', await page.evaluate(() => !document.getElementById('lvl-tempo-row').hidden));
        await page.fill('#lvl-tempo', '120');
        await page.press('#lvl-tempo', 'Enter');
        await page.waitForFunction(() => window.loopwerk.library.get('own-phone').kind === 'loop', null, { timeout: 8000 });
        await page.tap('#lvl-tempo-double');
        await page.waitForFunction(() => window.loopwerk.library.get('own-phone').beats === 8, null, { timeout: 8000 });
        check('Handy: Tempo eingeben macht einen Loop, ×2 verdoppelt', true);
        await page.evaluate(() => { const { ui, store } = window.loopwerk; ui.select(store.track('t1').clips[0].id); });
        await page.waitForTimeout(200);
        check('Handy: erzeugte Loops ohne Tempo-Zeile', await page.evaluate(() => document.getElementById('lvl-tempo-row').hidden));
        await page.evaluate(() => window.loopwerk.ui.select(null));
      }
      await page.evaluate(() => document.getElementById('new-melody-btn')?.click());
      await page.waitForTimeout(600);
      const head = await page.evaluate(() => {
        const b = document.getElementById('pat-glide-btn');
        const m = document.getElementById('pat-more-btn').getBoundingClientRect();
        return { vis: !!b.offsetParent, text: b.textContent, fits: m.right <= innerWidth + 0.5 };
      });
      check(`Handy ${w} px: Gleiten-Knopf in der Kopfzeile, „Mehr“ bleibt sichtbar`, head.vis && head.fits && /Aus/.test(head.text), JSON.stringify(head));
      if (w === 390) {
        await page.tap('#pat-glide-btn');
        await page.waitForTimeout(150);
        const g = await page.evaluate(() => ({ t: document.getElementById('pat-glide-btn').textContent, v: Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth')?.glide }));
        check('Ein Tipp: Gleiten „Kurz“', /Kurz/.test(g.t) && g.v === 0.25, JSON.stringify(g));
      }
      check(`Keine Fehler in der Konsole (Handy ${w})`, app.errors.length === 0, app.errors.join(' | '));
      await app.close();
    }
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
    await app.close();
  } finally {
    finish();
  }
})();
