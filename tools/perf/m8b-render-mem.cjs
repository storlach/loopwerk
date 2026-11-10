// Wächst der Speicher bei wiederholtem Offline-Rendern (Mastering-Analyse nach jeder Änderung)? Mit und ohne Worklet, vor und nach erzwungener Müllabfuhr.
const { execSync } = require('child_process');
const { start, launch, newPage, load, sleep } = require('./lib.cjs');
const GLOW = 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }';

(async () => {
  const srv = await start({ h2: false });
  console.log('Last', load());
  for (const mastering of [false, true]) {
    const browser = await launch();
    const { page, cdp } = await newPage(browser, {});
    await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: GLOW }));
    await page.goto(srv.origin + '/');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
    await sleep(1000);
    const bs = await browser.newBrowserCDPSession();
    const pids = (await bs.send('SystemInfo.getProcessInfo')).processInfo.filter((x) => x.type === 'renderer').map((x) => x.id);
    const rss = () => { let best = 0; for (const pid of pids) { try { const m = /VmRSS:\s+(\d+)/.exec(require('fs').readFileSync(`/proc/${pid}/status`, 'utf8')); if (m) best = Math.max(best, Math.round(Number(m[1]) / 1024)); } catch { /* weg */ } } return best; };
    const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(400); await cdp.send('HeapProfiler.collectGarbage'); await sleep(1200); };
    await gc();
    const r0 = rss();
    const rows = [];
    for (let round = 1; round <= 4; round++) {
      await page.evaluate(async (mastering) => {
        const { store, library, renderProject } = window.loopwerk;
        if (mastering) store.setMastering({ on: true });
        for (let i = 0; i < 15; i++) await renderProject(store.project, library, { toBeat: 32 });
      }, mastering);
      const before = rss();
      await gc();
      rows.push(`${round * 15}×: ${before} MB, nach Müllabfuhr ${rss()} MB`);
    }
    console.log(`${mastering ? 'mit Mastering-Worklet' : 'ohne Worklet        '} · Start ${r0} MB · ${rows.join(' · ')}`);
    await browser.close();
  }
  await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
