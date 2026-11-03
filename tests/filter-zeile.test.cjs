// Regal: Suche, Filter und Favoriten in einer Zeile (Entwurf docs/ux/filter-layouts, Variante 1), Desktop und Handy.
// node tests/filter-zeile.test.cjs [--shots]
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';

const setups = [
  { name: 'Desktop', viewport: { width: 1440, height: 900 }, touch: false, maxClosed: 56 },
  { name: 'Handy', viewport: { width: 390, height: 844 }, touch: true, maxClosed: 56 },
];

(async () => {
  for (const S of setups) {
    const app = await openApp({ viewport: S.viewport, hasTouch: S.touch, deviceScaleFactor: S.touch ? 2 : 1, fresh: true });
    const { page } = app;
    const act = (sel) => (S.touch ? page.tap(sel) : page.click(sel));
    const pre = `${S.name}: `;
    try {
      if (S.touch) { await page.evaluate(() => window.loopwerk.ui.setDock('sounds')); await page.waitForTimeout(700); }
      await page.evaluate(() => window.loopwerk.library.catalogReady);
      const st = () => page.evaluate(() => {
        const r = (q) => document.querySelector(q)?.getBoundingClientRect();
        const f = r('#shelf-find'); const s = r('#shelf-search'); const b = r('#shelf-filter-btn'); const fav = r('#shelf-fav');
        const pane = document.getElementById('shelf-filters');
        const sel = document.querySelector('.shelf-len .seg[aria-pressed="true"]');
        return {
          h: Math.round(f.height), top: Math.round(f.top), oneRow: [s, b, fav].every((x) => Math.abs((x.top + x.height / 2) - (f.top + f.height / 2)) < 3),
          paneOpen: getComputedStyle(pane).display !== 'none', expanded: document.getElementById('shelf-filter-btn').getAttribute('aria-expanded'),
          val: document.getElementById('shelf-filter-n').textContent, ph: document.getElementById('shelf-search').placeholder,
          resetShown: !document.getElementById('shelf-reset').hidden, favOn: document.getElementById('shelf-fav').getAttribute('aria-pressed'),
          len: sel?.dataset.len ?? null, over: document.documentElement.scrollWidth - innerWidth,
          rows: document.querySelectorAll('#library .loop-item').length,
        };
      });
      const pause = (ms = 450) => page.waitForTimeout(ms);

      let s = await st();
      check(pre + 'Suche, Regler und Stern in einer Zeile', s.oneRow && s.h === 44, JSON.stringify(s));
      check(pre + `Fach zu: Zeile ≤ ${S.maxClosed} px hoch`, !s.paneOpen && s.h <= S.maxClosed && s.expanded === 'false', `${s.h} px`);
      check(pre + 'Trefferzahl im Platzhalter', /^Suchen … \(\d+\)$/.test(s.ph) && Number(s.ph.match(/\d+/)[0]) > 100, s.ph);
      check(pre + 'Ruhe: Lupe statt ×', !s.resetShown);
      if (SHOTS) await page.screenshot({ path: `${DIR}/filter-zeile-${S.name.toLowerCase()}-ruhe.png` });

      // Länge in höchstens zwei Tipps, Wert steht im Knopf, Fach schließt selbst
      await act('#shelf-filter-btn');
      await pause();
      s = await st();
      check(pre + 'Regler-Knopf öffnet das Fach (aria-expanded)', s.paneOpen && s.expanded === 'true');
      const lens = await page.evaluate(() => [...document.querySelectorAll('.shelf-len .seg')].map((b) => ({ l: b.dataset.len, n: Number(b.querySelector('.len-n').textContent), dis: b.disabled, op: getComputedStyle(b).opacity, label: b.getAttribute('aria-label') })));
      const noAll = await page.evaluate(() => !document.querySelector('[data-len="all"]'));
      check(pre + 'Fünf Längen mit Anzahl, kein „Alle“', lens.length === 5 && lens.every((x) => /Sound/.test(x.label)) && noAll, JSON.stringify(lens));
      const l8 = lens.find((x) => x.l === '8');
      check(pre + '8T+ ohne Treffer ist aus und gedimmt', l8.n === 0 && l8.dis && Number(l8.op) < 0.7, JSON.stringify(l8));
      if (SHOTS) await page.screenshot({ path: `${DIR}/filter-zeile-${S.name.toLowerCase()}-offen.png` });
      if (S.touch) {
        const tt = await page.evaluate(`(${measureTargets.toString()})('#shelf-find button, #shelf-find input, .shelf-len .seg:not(:disabled), .shelf-sort .seg')`);
        check(pre + 'Tippflächen ≥ 44 px', tt.length >= 6 && tt.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(tt.filter((t) => t.w < 44 || t.h < 44)));
      }
      const total = s.rows;
      await act('.shelf-len .seg[data-len="4"]');
      await pause();
      s = await st();
      check(pre + 'Länge 4T: zwei Tipps, Fach schließt, „4T“ im Knopf', !s.paneOpen && s.expanded === 'false' && s.val === '4T' && s.len === '4', JSON.stringify(s));
      check(pre + 'Trefferzahl folgt dem Filter, × erscheint', /Treffer\)$/.test(s.ph) && s.resetShown, s.ph);
      const bars = await page.evaluate(() => [...document.querySelectorAll('#library .loop-item')].map((n) => window.loopwerk.library.get(n.dataset.sampleId)).filter(Boolean).every((x) => x.kind === 'loop' && x.lengthBeats / 4 > 2 && x.lengthBeats / 4 <= 4));
      check(pre + 'Liste zeigt nur 3–4-Takt-Loops', bars);
      // Stern
      await act('#shelf-fav');
      s = await st();
      check(pre + 'Stern schaltet Favoriten (aria-pressed)', s.favOn === 'true');
      await act('#shelf-fav');
      // Zweiter Tipp auf die aktive Länge hebt sie auf
      await act('#shelf-filter-btn');
      await pause();
      await act('.shelf-len .seg[data-len="4"]');
      await pause();
      s = await st();
      check(pre + 'Aktive Länge noch einmal tippen hebt sie auf', s.val === '' && s.len === null, JSON.stringify(s));
      // Ordnen + Länge + Stern + Suche, dann × setzt alles zurück
      await act('#shelf-filter-btn');
      await pause();
      await act('.shelf-sort .seg[data-sort="genre"]');
      await pause();
      await act('#shelf-filter-btn');
      await pause();
      await act('.shelf-len .seg[data-len="2"]');
      await pause();
      await act('#shelf-fav');
      await page.fill('#shelf-search', 'a');
      s = await st();
      check(pre + 'Knopf zeigt Länge und Ordnung', s.val === '2T Genre', s.val);
      if (SHOTS) await page.screenshot({ path: `${DIR}/filter-zeile-${S.name.toLowerCase()}-aktiv.png` });
      await act('#shelf-reset');
      await pause(300);
      s = await st();
      const sorted = await page.evaluate(() => document.querySelector('.shelf-sort .seg[aria-pressed="true"]')?.dataset.sort);
      const q = await page.inputValue('#shelf-search');
      check(pre + '× setzt Suche, Länge, Ordnung und Favoriten mit einem Tipp zurück', s.val === '' && !s.resetShown && s.favOn === 'false' && sorted === 'cat' && q === '' && s.rows === total, JSON.stringify({ ...s, sorted }));
      // Tastatur: Regler-Knopf mit Enter, Esc schließt
      await page.focus('#shelf-filter-btn');
      await page.keyboard.press('Enter');
      await pause();
      s = await st();
      await page.keyboard.press('Escape');
      await pause();
      const s2 = await st();
      check(pre + 'Tastatur: Enter öffnet, Esc schließt', s.paneOpen && !s2.paneOpen && s2.expanded === 'false', JSON.stringify([s.paneOpen, s2.paneOpen, s2.expanded]));
      check(pre + 'Seite scrollt nicht waagrecht', s2.over <= 0, String(s2.over));
      // Tipp beim ersten Sehen: der Regler-Knopf wird erklärt
      if (S.touch) { await page.evaluate(() => window.loopwerk.ui.setDock('sounds')); await pause(700); }
      await page.evaluate(() => { window.loopwerk.tips.reset(); window.loopwerk.tips.enable(); });
      const seen = [];
      for (let i = 0; i < 4 && !seen.includes('filter'); i++) {
        await page.waitForSelector('.tip:not([hidden])', { timeout: 3000 }).catch(() => {});
        const id = await page.evaluate(() => window.loopwerk.tips.current);
        if (!id) break;
        seen.push(id);
        if (id !== 'filter') { await act('.tip-ok'); await pause(); }
      }
      const tipAt = await page.evaluate(() => document.querySelector('.tip-target')?.id);
      check(pre + 'Tipp erklärt den Regler-Knopf', seen.includes('filter') && tipAt === 'shelf-filter-btn', JSON.stringify({ seen, tipAt }));
      await page.evaluate(() => window.loopwerk.tips.disable());
      check(pre + 'Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    } catch (err) {
      check(pre + 'Testlauf ohne Ausnahme', false, err.stack);
    } finally {
      await app.close();
    }
  }
  finish();
})();
