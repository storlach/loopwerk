// Schubladen schieben die Ansicht: beim Öffnen rückt der Inhalt mit der Kante nach oben, beim Schließen zurück;
// eine ausgewählte Spur bleibt über der Schublade zu sehen.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

const trace = (page, dock) => page.evaluate((d) => new Promise((res) => {
  const sc = document.getElementById('arr-scroll');
  const tr = [];
  const f = () => { tr.push(Math.round(sc.scrollTop)); if (tr.length < 60) requestAnimationFrame(f); else res(tr); };
  requestAnimationFrame(f);
  window.loopwerk.ui.setDock(d);
}), dock);
const distinct = (tr) => tr.filter((v, i, a) => i === 0 || v !== a[i - 1]);

(async () => {
  for (const vp of [{ width: 390, height: 844, touch: true, dock: 'sounds', name: 'Handy' }, { width: 1400, height: 820, touch: false, dock: 'mixer', name: 'Desktop' }]) {
    const app = await openApp({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });
    const { page } = app;
    try {
      const s0 = await page.evaluate(() => document.getElementById('arr-scroll').scrollTop);
      const up = await trace(page, vp.dock);
      await page.waitForTimeout(300);
      const steps = distinct(up);
      check(`${vp.name}: Schublade öffnen schiebt die Spuren mit nach oben, Bild für Bild`, steps.length >= 4 && steps[steps.length - 1] > s0 + 40 && steps.every((v, i) => i === 0 || v >= steps[i - 1]), steps.join(','));
      const down = await trace(page, null);
      await page.waitForTimeout(300);
      const back = await page.evaluate(() => document.getElementById('arr-scroll').scrollTop);
      check(`${vp.name}: Schließen bringt die Ansicht zurück`, Math.abs(back - s0) <= 1 && distinct(down).length >= 3, `${s0} → ${distinct(down).join(',')}`);

      // Ausgewählte Spur (die letzte): bleibt ganz über der Schublade
      await page.evaluate(() => { const { store, ui } = window.loopwerk; ui.selectTrack(store.project.tracks[store.project.tracks.length - 1].id); });
      await trace(page, vp.dock);
      await page.waitForTimeout(400);
      const vis = await page.evaluate(() => {
        const { store, ui } = window.loopwerk;
        const row = document.querySelector(`.lane[data-track-id="${ui.selectedTrackId}"]`).closest('.track-row').getBoundingClientRect();
        const sheet = [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden && s.getBoundingClientRect().height > 0).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
        return { rowBottom: Math.round(row.bottom), sheetTop: Math.round(sheet.getBoundingClientRect().top), last: store.project.tracks.length };
      });
      check(`${vp.name}: ausgewählte Spur bleibt über der Schublade zu sehen`, vis.rowBottom <= vis.sheetTop, JSON.stringify(vis));
      check(`${vp.name}: keine Fehler in der Konsole`, app.errors.length === 0, app.errors.join(' | '));
    } catch (e) {
      check(`${vp.name}: Ablauf ohne Ausnahme`, false, e.stack);
    }
    await app.close();
  }
  finish();
})();
