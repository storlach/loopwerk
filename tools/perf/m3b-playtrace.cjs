// Abspielen mit Licht: Trace über 4 s. Wand- und CPU-Zeit je Ereignisart im Hauptthread. Aufruf: node m3b-playtrace.cjs <desktop|handy> [idle|play] [noglow]
const { start, launch, newPage, load, sleep } = require('./lib.cjs');
const { startTrace, stopTrace } = require('./trace.cjs');
const mobile = process.argv[2] === 'handy';
const mode = process.argv[3] || 'play';
const noglow = process.argv[4] === 'noglow';
const big = process.argv[5] === 'big';
const S = require('./scen.cjs');
const cpu = mobile ? 4 : 1;

function summarize(ev) {
  const names = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const perThread = new Map();
  for (const e of ev) {
    if (e.ph !== 'X' || e.dur == null) continue;
    const k = `${e.pid}:${e.tid}`;
    const t = perThread.get(k) || perThread.set(k, { name: names.get(k) || '?', top: [], n: 0 }).get(k);
    t.n++; t.top.push(e);
  }
  const out = [];
  for (const [k, t] of perThread) {
    // nur oberste Ebene (RunTask u. ä.) summieren
    const xs = t.top.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    let end = 0, wall = 0, cpuT = 0; const self = new Map(); const stack = [];
    for (const e of xs) {
      if (e.ts >= end) { wall += e.dur; cpuT += e.tdur || 0; end = e.ts + e.dur; }
      while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
      if (stack.length) stack[stack.length - 1].child += e.dur;
      const n = { name: e.name, end: e.ts + e.dur, dur: e.dur, child: 0 }; stack.push(n); e.__n = n;
    }
    for (const e of xs) self.set(e.name, (self.get(e.name) || 0) + Math.max(0, e.__n.dur - e.__n.child));
    out.push({ k, name: t.name, wallMs: Math.round(wall / 1000), cpuMs: Math.round(cpuT / 1000), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, us]) => `${n} ${Math.round(us / 1000)}`) });
  }
  return out.sort((a, b) => b.wallMs - a.wallMs).slice(0, 7);
}

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  const { page } = await newPage(browser, { cpu, mobile });
  if (noglow) await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
  await page.goto(srv.origin + '/');
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  if (big) await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
  await sleep(1500);
  if (mode === 'play') { await page.evaluate(() => { window.loopwerk.engine.setPosition(16); return window.loopwerk.engine.play(); }); await sleep(1000); }
  console.log('Last', load(), process.argv.slice(2).join(' '));
  await startTrace(browser, page);
  await page.evaluate(() => window.__startFrames());
  await sleep(4000);
  const f = await page.evaluate(() => window.__stopFrames());
  const ev = await stopTrace(browser);
  console.log('Bilder', JSON.stringify(f));
  if (!noglow) console.log('glow', await page.evaluate(() => { const s = window.loopwerk.glow.state; return { cost: s.cost, roomCost: s.roomCost, glQ: s.glQ, shader: s.shader }; }));
  for (const t of summarize(ev)) console.log(`${t.name.padEnd(28)} Wand ${String(t.wallMs).padStart(5)} ms · CPU ${String(t.cpuMs).padStart(5)} ms · ${t.top.join(' | ')}`);
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
