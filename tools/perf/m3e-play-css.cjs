// Versuch (nur in der Messung): Was bringt es beim Abspielen eines großen Songs, die Abspielmarke auf eine eigene Ebene zu legen
// bzw. Clips außerhalb des Bildes vom Zeichnen auszunehmen? Licht aus, Deck-Anzeige nur bei Änderung. Aufruf: node m3e-play-css.cjs <desktop|handy>
const fs = require('fs');
const path = require('path');
const { ROOT, start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const mobile = process.argv[2] === 'handy';
const cpu = mobile ? 4 : 1;
const GLOW = 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }';
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const must = (s, a, b) => { if (!s.includes(a)) throw new Error('Stelle fehlt: ' + a.slice(0, 50)); return s.replace(a, b); };
const transportLean = () => {
  let s = src('src/ui/transport.js');
  s = must(s, "    lcdBar.textContent = String(Math.floor(beat / bpb) + 1).padStart(3, '0');", "    { const v = String(Math.floor(beat / bpb) + 1).padStart(3, '0'); if (lcdBar.__v !== v) { lcdBar.textContent = v; lcdBar.__v = v; } }");
  s = must(s, '    lcdBeat.textContent = String(Math.floor(beat % bpb) + 1);', '    { const v = String(Math.floor(beat % bpb) + 1); if (lcdBeat.__v !== v) { lcdBeat.textContent = v; lcdBeat.__v = v; } }');
  s = must(s, "    lcdTime.textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`;", "    { const v = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`; if (lcdTime.__v !== v) { lcdTime.textContent = v; lcdTime.__v = v; } }");
  s = must(s, '    drawMeter(frac, hold);', '    if (frac !== frame.__f || hold !== frame.__h) { drawMeter(frac, hold); frame.__f = frac; frame.__h = hold; }');
  return s;
};
const arrangerLean = () => must(src('src/ui/arranger.js'), '(phGrip.offsetWidth || 14) / 2', '(phGripW ??= (phGrip.offsetWidth || 14)) / 2').replace('  function setPlayhead(beat) {', '  let phGripW = null;\n  function setPlayhead(beat) {');

const VARIANTS = [
  { name: 'Ausgang (Licht aus, Deck nur bei Änderung)', css: '' },
  { name: '+ Abspielmarke auf eigener Ebene (will-change)', css: '.playhead, .ph-grip { will-change: transform; }' },
  { name: '+ Spuren abgegrenzt (contain) ', css: '.playhead, .ph-grip { will-change: transform; } .lane { contain: layout paint style; }' },
  { name: '+ Clips außerhalb des Bildes ausgelassen (content-visibility)', css: '.playhead, .ph-grip { will-change: transform; } .lane { contain: layout paint style; } .clip { content-visibility: auto; }' },
];

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('##', mobile ? 'Handy 390×844, CPU 4x' : 'Desktop 1440×900', '· 448 Clips · Last', load());
  for (const v of VARIANTS) {
    const rs = [];
    for (let i = 0; i < 3; i++) {
      const { page, cdp, ctx, errors } = await newPage(browser, { cpu, mobile });
      await cdp.send('Performance.enable');
      await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: GLOW }));
      await page.route('**/src/ui/transport.js', (r) => r.fulfill({ contentType: 'text/javascript', body: transportLean() }));
      await page.route('**/src/ui/arranger.js', (r) => r.fulfill({ contentType: 'text/javascript', body: arrangerLean() }));
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      if (v.css) await page.addStyleTag({ content: v.css });
      await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
      await sleep(1500);
      await page.evaluate(S.watchTicks);
      await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
      await sleep(800);
      await page.evaluate(S.resetTicks);
      const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const b0 = await m();
      await page.evaluate(() => window.__startFrames());
      await sleep(4000);
      const f = await page.evaluate(() => window.__stopFrames());
      const b1 = await m();
      const t = await page.evaluate(S.readTicks);
      rs.push({ busy: 100 * (b1.TaskDuration - b0.TaskDuration) / (b1.Timestamp - b0.Timestamp), fps: f.fps, lt: f.lt, gap: t.gapMax, late: t.late });
      if (errors.length && i === 0) console.log('  Fehler:', errors[0].slice(0, 140));
      await ctx.close();
    }
    const g = (k, d = 0) => fmt(stats(rs.map((r) => r[k]), d));
    console.log(`${v.name.padEnd(62)} ${g('fps', 1)} Bilder/s · Hauptthread ${g('busy')} % · lange Aufgaben ${g('lt')} · größter Tick-Abstand ${g('gap')} ms · verspätet ${g('late')}`);
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
