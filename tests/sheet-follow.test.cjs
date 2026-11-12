// Schubladen legen sich über den Arranger (seit Nov. 2026): Öffnen und Schließen bewegt die Spuren nicht, auch nicht
// bei ausgewählter Spur oder ausgewähltem Clip. Unten entsteht nur Platz, damit man die letzte Spur über die Schublade scrollen kann.
// Wird der Clip des offenen Editors gelöscht, schließt sich der Editor.
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
  for (const vp of [{ width: 390, height: 844, touch: true, dock: 'sounds', name: 'Handy' }, { width: 1400, height: 820, touch: false, dock: 'fxpad', name: 'Desktop' }]) {
    const app = await openApp({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });
    const { page } = app;
    try {
      const s0 = await page.evaluate(() => document.getElementById('arr-scroll').scrollTop);
      const up = await trace(page, vp.dock);
      await page.waitForTimeout(300);
      check(`${vp.name}: Schublade öffnen bewegt die Spuren nicht`, distinct(up).length === 1 && up[0] === s0, distinct(up).join(','));
      const room = await page.evaluate(() => { const a = document.getElementById('arr-scroll'); return a.scrollHeight - a.clientHeight; });
      check(`${vp.name}: darunter Platz zum Hochscrollen`, room > 100, String(room));
      const down = await trace(page, null);
      await page.waitForTimeout(300);
      check(`${vp.name}: Schließen bewegt die Spuren nicht`, distinct(down).length === 1 && down[0] === s0, distinct(down).join(','));
      // Mit ausgewähltem Clip (letzte Spur) bleibt die Ansicht ebenso stehen
      await page.evaluate(() => { const { store, ui } = window.loopwerk; const t = [...store.project.tracks].reverse().find((x) => x.clips.length); ui.select(t.clips[0].id); });
      await page.waitForTimeout(200);
      const s1 = await page.evaluate(() => document.getElementById('arr-scroll').scrollTop);
      const up2 = await trace(page, vp.dock);
      await page.waitForTimeout(400);
      check(`${vp.name}: auch mit ausgewähltem Clip kein Mitschieben`, distinct(up2).every((v) => v === s1), `${s1} → ${distinct(up2).join(',')}`);
      await page.evaluate(() => window.loopwerk.ui.setDock(null));
      await page.waitForTimeout(400);
      // Clip-Editor offen, Clip löschen → Editor zu; Beat-Editor offen, einzigen Clip löschen → Editor zu
      const ed = await page.evaluate(async () => {
        const { store, ui, editor, patternEditor } = window.loopwerk;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const c = store.project.tracks.flatMap((t) => t.clips).find((x) => !/^pat-/.test(x.sampleId));
        editor.open(c.id);
        await wait(300);
        const opened = ui.dock;
        store.deleteClip(c.id);
        await wait(200);
        const after = ui.dock;
        document.querySelector('.ccard[data-create="beat"]').click();
        for (let i = 0; i < 30 && ui.dock !== 'pattern'; i++) await wait(100);
        const pOpen = ui.dock;
        const sid = 'pat-' + patternEditor.id;
        const pc = store.project.tracks.flatMap((t) => t.clips).filter((x) => x.sampleId === sid);
        for (const x of pc) store.deleteClip(x.id);
        await wait(200);
        const pat = { pOpen, pAfter: ui.dock, cid: pc.length > 0 };
        return { opened, after, pat };
      });
      check(`${vp.name}: Clip löschen schließt den offenen Clip-Editor`, ed.opened === 'editor' && ed.after === null, JSON.stringify(ed));
      if (ed.pat?.cid) check(`${vp.name}: letzten Clip eines Patterns löschen schließt den Beat-Editor`, ed.pat.pOpen === 'pattern' && ed.pat.pAfter === null, JSON.stringify(ed.pat));
      check(`${vp.name}: keine Fehler in der Konsole`, app.errors.length === 0, app.errors.join(' | '));
    } catch (e) {
      check(`${vp.name}: Ablauf ohne Ausnahme`, false, e.stack);
    }
    await app.close();
  }
  finish();
})();
