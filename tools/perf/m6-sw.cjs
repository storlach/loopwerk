// Service Worker in Krachwerk: Was liegt nach dem 1. Besuch im Cache? Startet es offline? Wie schnell ist der 2. Start (mit/ohne SW)?
// Aufruf: node tools/perf/m6-sw.cjs [Teile, z. B. CD] [--netz 4g] [--runs 3]   (Teile A–D, ohne Angabe alle)
const PARTS = /^[A-D]+$/.test(process.argv[2] || '') ? process.argv[2] : 'ABCD';
const RUNS = process.argv.includes('--runs') ? Number(process.argv[process.argv.indexOf('--runs') + 1]) : 3;
const NETS = process.argv.includes('--netz') ? [process.argv[process.argv.indexOf('--netz') + 1]] : ['4g', 'slow4g'];
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');

async function visit(page, url, timeout = 60000) {
  const t0 = Date.now();
  let ok = true; let err = '';
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout });
  } catch (e) { ok = false; err = e.message.split('\n')[0].slice(0, 120); }
  const ready = ok ? await page.evaluate(() => Math.round(window.__marks.ready)) : null;
  return { ok, ready, wall: Date.now() - t0, err };
}
const cacheInfo = (page) => page.evaluate(async () => {
  const keys = await caches.keys(); let n = 0; const names = [];
  for (const k of keys) { const c = await caches.open(k); const rs = await c.keys(); n += rs.length; names.push(...rs.map((r) => new URL(r.url).pathname)); }
  const reg = await navigator.serviceWorker.getRegistration('werkstatt/');
  return { keys, n, hasIndex: names.some((p) => /\/werkstatt\/$/.test(p)), js: names.filter((p) => /\.js$/.test(p)).length, sw: !!reg?.active, controlled: !!navigator.serviceWorker.controller, worker: names.includes('/src/dsp/worker.js'), worklet: names.includes('/src/dsp/fx-worklet.js'), recWorklet: names.includes('/src/dsp/recorder-worklet.js'), lame: names.includes('/vendor/lamejs/lame.min.js') };
}).catch((e) => ({ err: e.message }));

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('Last', load());
  const url = srv.origin + '/werkstatt/';

  // A: 1. Besuch online → sofort offline neu laden
  if (PARTS.includes('A')) {
    const { page, cdp, ctx, errors } = await newPage(browser, { mobile: true });
    const v1 = await visit(page, url);
    await sleep(1500);
    const c1 = await cacheInfo(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await ctx.setOffline(true);
    const off1 = await visit(page, url, 15000);
    console.log('A · 1. Besuch:', JSON.stringify(v1), '· Cache danach:', JSON.stringify(c1));
    console.log('A · direkt danach offline neu laden:', JSON.stringify(off1), off1.ok ? '' : `(Fehler: ${errors.slice(-2).join(' | ').slice(0, 200)})`);
    await ctx.close();
  }
  // B: 1. + 2. Besuch online → offline
  if (PARTS.includes('B')) {
    const { page, cdp, ctx, errors } = await newPage(browser, { mobile: true });
    await visit(page, url); await sleep(1200);
    const v2 = await visit(page, url); await sleep(1500);
    const c2 = await cacheInfo(page);
    await ctx.setOffline(true);
    const off = await visit(page, url, 15000);
    let play = null; let rec = null;
    if (off.ok) {
      play = await page.evaluate(async () => { try { await window.loopwerk.engine._ensure(); return { worklets: window.loopwerk.engine.worklets }; } catch (e) { return { err: e.message }; } });
      rec = await page.evaluate(async () => { try { const { runJob } = await import('/src/dsp/run.js'); const r = await runJob('key', { chs: [new Float32Array(44100)], sampleRate: 44100 }); return { worker: 'ok', r: !!r }; } catch (e) { return { err: e.message }; } });
    }
    console.log('B · 2. Besuch online:', JSON.stringify(v2), '· Cache danach:', JSON.stringify(c2));
    console.log('B · danach offline:', JSON.stringify(off), '· Ton-Kontext offline:', JSON.stringify(play), '· Rechen-Worker offline:', JSON.stringify(rec), errors.slice(-2).join(' | ').slice(0, 200));
    void cdp;
    await ctx.close();
  }
  // C: Tempo des 2. Starts, gedrosselt (CPU 4x, 4G): mit SW (Netz zuerst) gegen ohne SW (nur HTTP-Cache)
  if (PARTS.includes('C')) for (const net of NETS) {
    for (const sw of [true, false]) {
      const rs = [];
      for (let i = 0; i < RUNS; i++) {
        const { page, ctx } = await newPage(browser, { mobile: true, cpu: 4, net });
        if (!sw) await page.addInitScript(() => { try { navigator.serviceWorker.register = () => Promise.reject(new Error('fuer die Messung aus')); } catch { /* egal */ } });
        await visit(page, url, 120000); await sleep(1500);
        if (sw) { await visit(page, url, 120000); await sleep(1000); }
        const n0 = srv.log.length;
        const v = await visit(page, url, 120000);
        await sleep(500);
        const reqs = srv.log.slice(n0);
        rs.push({ ready: v.ready, reqs: reqs.length, r304: reqs.filter((r) => r.status === 304).length, kB: Math.round(reqs.reduce((a, r) => a + r.bytes, 0) / 1e3) });
        await ctx.close();
      }
      console.log(`C · Wiederholter Start (${net}, CPU 4x) ${sw ? 'mit Service Worker' : 'ohne Service Worker (HTTP-Cache)'}: bereit nach ${fmt(stats(rs.map((r) => r.ready)))} ms · Anfragen am Server ${fmt(stats(rs.map((r) => r.reqs)))} (davon 304: ${rs[0].r304}) · ${rs[0].kB} kB`);
    }
  }
  // D: Start nach Ablauf der 10 Minuten (max-age=600): alles wird neu geprüft – simuliert mit max-age=0
  await srv.close();
  const srv0 = await start({ h2: true, maxAge: 0 });
  if (PARTS.includes('D')) for (const path of ['/', '/werkstatt/']) for (const net of NETS) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) {
      const { page, ctx } = await newPage(browser, { mobile: true, cpu: 4, net });
      await visit(page, srv0.origin + path, 120000); await sleep(1200);
      // Krachwerk: so tun, als läge der letzte Start über 9 Minuten zurück (sonst lässt der Worker den Browser-Speicher ran)
      if (path === '/werkstatt/') await page.evaluate(async () => { try { await (await caches.open('krachwerk-runtime')).put(new URL('werkstatt/__last-start', location.origin + '/').href, new Response('0')); } catch { /* alter Stand ohne Zeitstempel */ } });
      const n0 = srv0.log.length;
      const v = await visit(page, srv0.origin + path, 120000);
      const reqs = srv0.log.slice(n0);
      rs.push({ ready: v.ready, reqs: reqs.length, r304: reqs.filter((r) => r.status === 304).length });
      await ctx.close();
    }
    console.log(`D · ${path} Wiederbesuch nach Ablauf des Caches (${net}, CPU 4x, HTTP/2): bereit nach ${fmt(stats(rs.map((r) => r.ready)))} ms · ${rs[0].reqs} Anfragen, davon ${rs[0].r304}× „304 unverändert“`);
  }
  await browser.close(); await srv0.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
