// Lesbarkeit: Schrift auf Knöpfen hat in jedem Zustand genug Kontrast (normal, Mauszeiger, gedrückt, Fokus,
// jeweils auch „aktiv“ über aria-pressed/aria-selected) – Desktop, Tablet, Handy, mit offenen Fächern.
// node tests/contrast.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const MIN = 3; // Schrift auf Bedienelementen: mindestens 3:1 (sonst „nicht lesbar“)
const SEL = 'button, .seg, .chip, [role="tab"], select';

function measureAll(pressed) {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const out = [];
  for (const el of document.querySelectorAll('[data-ct]')) {
    if (el.disabled) continue;
    const had = el.getAttribute('aria-pressed');
    const hadSel = el.getAttribute('aria-selected');
    if (pressed) {
      if (had === null && hadSel === null) continue;
      if (had !== null) el.setAttribute('aria-pressed', 'true');
      if (hadSel !== null) el.setAttribute('aria-selected', 'true');
    }
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const layers = [];
    let n = el;
    while (n && n.nodeType === 1) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b[3] > 0) { layers.push(b); if (b[3] >= 0.99) break; } n = n.parentElement; }
    let bg = [22, 23, 26];
    for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; bg = [0, 1, 2].map((k) => l[k] * l[3] + bg[k] * (1 - l[3])); }
    const f = [0, 1, 2].map((k) => fg[k] * fg[3] + bg[k] * (1 - fg[3]));
    const L1 = lum(f);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (pressed) { if (had !== null) el.setAttribute('aria-pressed', had); if (hadSel !== null) el.setAttribute('aria-selected', hadSel); }
    out.push({ k: el.dataset.ct, ratio, text: (el.innerText || '').trim().slice(0, 20), id: el.id, cls: String(el.className).split(' ')[0] });
  }
  return out;
}

async function audit(page, cdp, where) {
  const count = await page.evaluate((sel) => {
    for (const n of document.querySelectorAll('[data-ct]')) n.removeAttribute('data-ct');
    let i = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !el.offsetParent || getComputedStyle(el).visibility === 'hidden') continue;
      if (!(el.innerText || '').trim()) continue;
      el.dataset.ct = String(i++);
    }
    return i;
  }, SEL);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ct]' });
  const bad = [];
  for (const state of [[], ['hover'], ['active'], ['focus-visible'], ['hover', 'active']]) {
    if (state.length) for (const id of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: state });
    for (const pressed of [false, true]) {
      const res = await page.evaluate(measureAll, pressed);
      for (const r of res) if (r.ratio < MIN) bad.push(`${state.join('+') || 'normal'}${pressed ? '+aktiv' : ''}: ${r.id ? '#' + r.id : '.' + r.cls} „${r.text}“ ${r.ratio.toFixed(2)}`);
    }
    if (state.length) for (const id of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] });
  }
  check(`Lesbar in jedem Zustand: ${where} (${count} Knöpfe)`, bad.length === 0, [...new Set(bad)].slice(0, 12).join(' | '));
}

async function session(opts, steps) {
  const app = await openApp(opts);
  const { page } = app;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  try {
    for (const [where, prep] of steps) {
      await prep(page);
      await page.waitForTimeout(350);
      await audit(page, cdp, where);
    }
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
  }
}

(async () => {
  const ev = (fn) => (page) => page.evaluate(fn);
  await session({ viewport: { width: 1440, height: 900 } }, [
    ['Desktop Start', async () => {}],
    ['Desktop Wiedergabe', ev(() => window.loopwerk.engine.play(0))],
    ['Desktop Beat-Editor', async (page) => { await page.evaluate(() => { window.loopwerk.engine.stop(); document.getElementById('ltab-create').click(); }); await page.click('[data-create="beat"]'); }],
    ['Desktop Melodie-Editor', async (page) => { await page.click('[data-create="melody"]').catch(() => page.evaluate(() => document.getElementById('new-melody-btn')?.click())); }],
    ['Desktop Mixer', ev(() => window.loopwerk.ui.setDock('mixer'))],
    ['Desktop Clip-Editor', ev(() => { const { store, editor } = window.loopwerk; editor.open(store.track('t4').clips[0].id); })],
    ['Desktop Export', ev(() => window.loopwerk.ui.setDock('export'))],
    ['Desktop Projekt-Menü', async (page) => { await page.evaluate(() => window.loopwerk.ui.setDock(null)); await page.click('#project-menu-btn'); }],
  ]);
  await session({ viewport: { width: 1180, height: 820 }, hasTouch: true }, [
    ['Tablet Start', async () => {}],
    ['Tablet Clip ausgewählt', ev(() => { const { store, ui } = window.loopwerk; ui.select(store.track('t1').clips[0].id); })],
  ]);
  await session({ viewport: { width: 390, height: 844 }, hasTouch: true }, [
    ['Handy Start', async () => {}],
    ['Handy Sounds mit Filter', async (page) => { await page.evaluate(() => window.loopwerk.ui.setDock('sounds')); await page.waitForTimeout(300); await page.tap('#shelf-filter-btn'); }],
    ['Handy Mixer', ev(() => window.loopwerk.ui.setDock('mixer'))],
    ['Handy Mehr', ev(() => window.loopwerk.ui.setDock('more'))],
  ]);
  finish();
})();
