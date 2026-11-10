// Leerlauf und Abspielen: Wie viel arbeitet der Hauptthread je Bild? Versuch: Dauerschleifen einzeln entschärfen (nur in der
// Messung, über page.route – das Repo bleibt unverändert). Aufruf: node m3d-idle.cjs <desktop|handy>
const fs = require('fs');
const path = require('path');
const { ROOT, start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const mobile = process.argv[2] === 'handy';
const cpu = mobile ? 4 : 1;
const GLOW_STUB = 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }';
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const must = (s, a, b) => { if (!s.includes(a)) throw new Error('Stelle nicht gefunden: ' + a.slice(0, 60)); return s.replace(a, b); };
// Deck-Anzeige: Texte, Marke und Pegel nur anfassen, wenn sich der Wert geändert hat (so sähe die Reparatur aus)
const transportLean = () => {
  let s = src('src/ui/transport.js');
  s = must(s, "    lcdBar.textContent = String(Math.floor(beat / bpb) + 1).padStart(3, '0');", "    { const v = String(Math.floor(beat / bpb) + 1).padStart(3, '0'); if (lcdBar.__v !== v) { lcdBar.textContent = v; lcdBar.__v = v; } }");
  s = must(s, '    lcdBeat.textContent = String(Math.floor(beat % bpb) + 1);', '    { const v = String(Math.floor(beat % bpb) + 1); if (lcdBeat.__v !== v) { lcdBeat.textContent = v; lcdBeat.__v = v; } }');
  s = must(s, "    lcdTime.textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`;", "    { const v = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`; if (lcdTime.__v !== v) { lcdTime.textContent = v; lcdTime.__v = v; } }");
  s = must(s, '    arranger.setPlayhead(beat);', '    if (beat !== frame.__b || engine.playing !== frame.__p) { arranger.setPlayhead(beat); frame.__b = beat; frame.__p = engine.playing; }');
  s = must(s, '    drawMeter(frac, hold);', '    if (frac !== frame.__f || hold !== frame.__h) { drawMeter(frac, hold); frame.__f = frac; frame.__h = hold; }');
  return s;
};
// Abspielmarke: Griffbreite nicht in jedem Bild aus dem Layout lesen
const arrangerLean = () => must(src('src/ui/arranger.js'), '(phGrip.offsetWidth || 14) / 2', '(phGripW ??= (phGrip.offsetWidth || 14)) / 2').replace('  function setPlayhead(beat) {', '  let phGripW = null;\n  function setPlayhead(beat) {');
const brandLean = () => must(src('src/ui/brand-meter.js'), '  function frame() {\n    const max = root.clientHeight || 20;', '  let __max = 0;\n  function frame() {\n    const max = __max || (__max = root.clientHeight || 20);');

const VARIANTS = [
  { name: 'wie ausgeliefert (mit Licht, Software-Grafik)', routes: {} },
  { name: 'Licht aus', routes: { 'glow.js': GLOW_STUB } },
  { name: 'Licht aus + Deck-Anzeige nur bei Änderung', routes: { 'glow.js': GLOW_STUB, 'transport.js': transportLean, 'brand-meter.js': brandLean } },
  { name: 'Licht aus + Deck + Marke ohne Layout-Lesen', routes: { 'glow.js': GLOW_STUB, 'transport.js': transportLean, 'brand-meter.js': brandLean, 'arranger.js': arrangerLean } },
];

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('##', mobile ? 'Handy 390×844, CPU 4x' : 'Desktop 1440×900', '· Last', load());
  for (const song of ['demo', 'big']) for (const v of VARIANTS) {
    const rs = { idle: [], play: [] };
    for (let i = 0; i < 3; i++) {
      const { page, cdp, ctx, errors } = await newPage(browser, { cpu, mobile });
      await cdp.send('Performance.enable');
      for (const [f, body] of Object.entries(v.routes)) await page.route('**/src/ui/' + f, (r) => r.fulfill({ contentType: 'text/javascript', body: typeof body === 'function' ? body() : body }));
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      if (song === 'big') await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
      await sleep(2500);
      const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const span = async (ms) => {
        const b0 = await m();
        await page.evaluate(() => window.__startFrames());
        await sleep(ms);
        const f = await page.evaluate(() => window.__stopFrames());
        const b1 = await m();
        const wall = b1.Timestamp - b0.Timestamp;
        return { busy: 100 * (b1.TaskDuration - b0.TaskDuration) / wall, script: 100 * (b1.ScriptDuration - b0.ScriptDuration) / wall, layout: 100 * (b1.LayoutDuration - b0.LayoutDuration + b1.RecalcStyleDuration - b0.RecalcStyleDuration) / wall, fps: f.fps, lt: f.lt, layouts: (b1.LayoutCount - b0.LayoutCount) / wall, styles: (b1.RecalcStyleCount - b0.RecalcStyleCount) / wall };
      };
      rs.idle.push(await span(4000));
      await page.evaluate(S.watchTicks);
      await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
      await sleep(800);
      await page.evaluate(S.resetTicks);
      const p = await span(4000);
      const t = await page.evaluate(S.readTicks);
      rs.play.push({ ...p, gapMax: t.gapMax, late: t.late });
      if (errors.length && i === 0) console.log('  Fehler:', errors[0].slice(0, 160));
      await ctx.close();
    }
    const g = (ph, k, d = 0) => fmt(stats(rs[ph].map((r) => r[k]), d));
    console.log(`${song === 'big' ? '448 Clips' : 'Beispiel '} · ${v.name}`);
    console.log(`    Stillstand: Hauptthread ${g('idle', 'busy')} % belegt · ${g('idle', 'fps', 1)} Bilder/s · Layouts/s ${g('idle', 'layouts')} · Stilrechnungen/s ${g('idle', 'styles')}`);
    console.log(`    Abspielen:  Hauptthread ${g('play', 'busy')} % belegt · ${g('play', 'fps', 1)} Bilder/s · lange Aufgaben ${g('play', 'lt')} · Layouts/s ${g('play', 'layouts')} · größter Tick-Abstand ${g('play', 'gapMax')} ms · verspätete Ticks ${g('play', 'late')}`);
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
