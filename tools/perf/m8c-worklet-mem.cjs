// Wozu: Ursache von 5.8 (Speicher beim Rendern mit Worklet) eingrenzen – Arbeitsspeicher des Seitenprozesses nach 40
// Offline-Rendern (4 s) je Fall, nach erzwungener Müllabfuhr: ohne Worklet, nur addModule, mit Knoten (process → true/false).
// Aufruf: node tools/perf/m8c-worklet-mem.cjs [--n 40]
// Exit-Code: 0 = gemessen, 1 = Fehler.
if (process.argv.includes('--help')) { console.log('node tools/perf/m8c-worklet-mem.cjs [--n 40]'); process.exit(0); }
const N = process.argv.includes('--n') ? Number(process.argv[process.argv.indexOf('--n') + 1]) : 40;
const { start, launch, newPage, sleep } = require('./lib.cjs');
const GLOW = 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }';
(async () => {
  const srv = await start({});
  for (const mode of ['plain', 'module', 'module+node', 'module+node-false']) {
    const browser = await launch();
    const { page, cdp } = await newPage(browser, {});
    await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: GLOW }));
    await page.goto(srv.origin + '/');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
    const bs = await browser.newBrowserCDPSession();
    const pids = (await bs.send('SystemInfo.getProcessInfo')).processInfo.filter((x) => x.type === 'renderer').map((x) => x.id);
    const rss = () => { let best = 0; for (const pid of pids) { try { const m = /VmRSS:\s+(\d+)/.exec(require('fs').readFileSync(`/proc/${pid}/status`, 'utf8')); if (m) best = Math.max(best, Math.round(Number(m[1]) / 1024)); } catch { /* weg */ } } return best; };
    const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(400); await cdp.send('HeapProfiler.collectGarbage'); await sleep(1500); };
    await gc();
    const r0 = rss();
    await page.evaluate(async ({ mode, N }) => {
      const code = 'class P extends AudioWorkletProcessor{process(i,o){return MODE;}} registerProcessor("leak-p",P);'.replace('MODE', mode.endsWith('false') ? 'false' : 'true');
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      for (let i = 0; i < N; i++) {
        const ctx = new OfflineAudioContext(2, 44100 * 4, 44100);
        if (mode !== 'plain') await ctx.audioWorklet.addModule(url);
        const o = ctx.createOscillator(); o.start();
        if (mode.startsWith('module+node')) { const n = new AudioWorkletNode(ctx, 'leak-p'); o.connect(n).connect(ctx.destination); } else o.connect(ctx.destination);
        await ctx.startRendering();
      }
    }, { mode, N });
    await gc();
    console.log(mode.padEnd(20), 'Start', r0, `MB → nach ${N} Rendern`, rss(), 'MB');
    await browser.close();
  }
  await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
