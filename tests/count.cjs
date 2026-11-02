// Zähl-Hilfe für die Ruhe der Oberfläche (Spec krachwerk-1-geruest §6): sichtbare Bedienelemente, Rahmen,
// Schriftgrößen. Als Modul: countUi(page), scene(page, name). Als CLI:
//   node tests/count.cjs [/pfad/] [--baseline]   (schreibt mit --baseline tests/count-baseline.json)
const fs = require('fs');
const path = require('path');

// Läuft im Browser
function measure() {
  const vw = innerWidth, vh = innerHeight;
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    // verdeckte Teile (unter Schubladen) zählen nicht
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  };
  const CONTROLS = 'button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=slider], [role=tab], [role=option], [draggable=true]:not(.clip)';
  const controls = [...document.querySelectorAll(CONTROLS)].filter(visible).length;
  const opaque = (c) => c && c !== 'transparent' && !/rgba?\([^)]*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  let frames = 0;
  const sizes = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs[`border${s}Width`]) >= 0.5 && cs[`border${s}Style`] !== 'none' && opaque(cs[`border${s}Color`])).length;
    const ring = /inset\s+0(px)?\s+0(px)?\s+0(px)?\s+[0-9.]+px/.test(cs.boxShadow) || /\s0px 0px 0px [0-9.]+px inset/.test(cs.boxShadow);
    if (sides >= 3 || ring) frames++;
    if (parseFloat(cs.fontSize) >= 1 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) sizes.add(Math.round(parseFloat(cs.fontSize) * 2) / 2);
  }
  const list = [...sizes].sort((a, b) => a - b);
  return { controls, frames, sizes: list.length, minFont: list[0] ?? null };
}

const countUi = (page) => page.evaluate(measure);

// Szenen: start (wie geladen), clip (erster Clip gewählt; legt bei Bedarf einen an)
async function scene(page, name) {
  await page.evaluate(async (n) => {
    const lw = window.loopwerk;
    lw.ui.select(null);
    if (n === 'clip') {
      let clip = lw.store.project.tracks.flatMap((t) => t.clips)[0];
      if (!clip) {
        const id = lw.library.list?.().find((s) => s.orig || s.buffer)?.id;
        if (id) lw.store.addClip(lw.store.project.tracks[0].id, id, 0, 4);
        clip = lw.store.project.tracks.flatMap((t) => t.clips)[0];
      }
      if (clip) lw.ui.select(clip.id);
    }
  }, name);
  await page.waitForTimeout(400);
}

module.exports = { countUi, scene, measure };

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const { start } = require('./serve.cjs');
    const p = process.argv.slice(2).find((a) => a.startsWith('/')) || '/';
    const server = await start();
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const out = {};
    for (const [dev, opts] of [['desktop', { viewport: { width: 1400, height: 820 } }], ['handy', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const page = await browser.newPage(opts);
      page.on('pageerror', (e) => console.error('Fehler:', e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}${p}`);
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 45000 });
      await page.evaluate(() => window.loopwerk.library.catalogReady);
      await page.waitForTimeout(800);
      for (const s of ['start', 'clip']) { await scene(page, s); out[`${dev}-${s}`] = await countUi(page); }
      await page.close();
    }
    await browser.close();
    server.close();
    console.table(out);
    if (process.argv.includes('--baseline')) {
      fs.writeFileSync(path.join(__dirname, 'count-baseline.json'), JSON.stringify(out, null, 2) + '\n');
      console.log('Basis geschrieben: tests/count-baseline.json');
    }
  })();
}
