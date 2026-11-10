// Laden und Start: kalt/warm, ungedrosselt/gedrosselt, Loopwerk/Krachwerk. Aufruf: node m1-load.cjs [runs] [h2|h1]
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const RUNS = Number(process.argv[2]) || 3;
const H2 = (process.argv[3] || 'h2') === 'h2';

async function measure(browser, origin, pathName, { cpu, net, mobile }, warmToo = true) {
  const { page, cdp, ctx } = await newPage(browser, { cpu, net, mobile });
  const reqs = new Map();
  let phase = 'cold';
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, phase, t: e.timestamp }));
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromDisk = e.response.fromDiskCache; r.mime = e.response.mimeType; r.proto = e.response.protocol; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.enc = e.encodedDataLength; r.end = e.timestamp; } });
  cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.dec = (r.dec || 0) + e.dataLength; });
  const once = async () => {
    const t0 = Date.now();
    await page.goto(origin + pathName, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.loopwerk?.ready && window.__marks.splashDone, null, { timeout: 120000, polling: 50 });
    await sleep(cpu > 1 ? 2500 : 1200); // Nachlauf: lange Aufgaben und Nachladen nach dem Start
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      const ready = window.__marks.ready;
      const lt = window.__lt;
      const before = lt.filter((e) => e.s < ready);
      const after = lt.filter((e) => e.s >= ready);
      const mainJs = res.find((r) => /src\/main\.js/.test(r.name));
      const lastJs = Math.max(0, ...res.filter((r) => /\.js$/.test(r.name) && r.responseEnd < ready).map((r) => r.responseEnd));
      return {
        ttfb: nav.responseStart, htmlEnd: nav.responseEnd, dcl: nav.domContentLoadedEventEnd,
        fp: window.__paint['first-paint'], fcp: window.__paint['first-contentful-paint'],
        splashDone: window.__marks.splashDone, ready,
        mainJsEnd: mainJs?.responseEnd, lastJsEnd: lastJs,
        ltN: before.length, ltSum: before.reduce((a, e) => a + e.d, 0), ltMax: Math.max(0, ...before.map((e) => e.d)),
        ltAfterN: after.length, ltAfterSum: after.reduce((a, e) => a + e.d, 0),
        heap: performance.memory?.usedJSHeapSize,
      };
    });
    m.wall = Date.now() - t0;
    return m;
  };
  const cold = await once();
  const sum = (ph, f) => [...reqs.values()].filter((r) => r.phase === ph && f(r));
  const tally = (ph) => {
    const all = sum(ph, () => true);
    const kind = (r) => (/\.js(\?|$)/.test(r.url) ? 'js' : /\.wav/.test(r.url) ? 'audio' : /fonts\.g/.test(r.url) ? 'font' : /\/$|\.html/.test(new URL(r.url).pathname) ? 'html' : 'other');
    const out = { n: all.length, net: all.filter((r) => !r.fromDisk).length, enc: 0, dec: 0, byKind: {} };
    for (const r of all) { const k = kind(r); out.byKind[k] = out.byKind[k] || { n: 0, enc: 0, dec: 0 }; out.byKind[k].n++; out.byKind[k].enc += r.enc || 0; out.byKind[k].dec += r.dec || 0; out.enc += r.enc || 0; out.dec += r.dec || 0; }
    out.proto = all.find((r) => r.proto)?.proto;
    return out;
  };
  cold.req = tally('cold');
  let warm = null;
  if (warmToo) { phase = 'warm'; warm = await once(); warm.req = tally('warm'); }
  await ctx.close();
  return { cold, warm };
}

(async () => {
  const srv = await start({ h2: H2 });
  const browser = await launch();
  const conds = [
    { name: 'Desktop ungedrosselt', cpu: 1, net: 'none', mobile: false },
    { name: 'Handy gedrosselt (CPU 4x, 4G 9 Mbit/85 ms)', cpu: 4, net: '4g', mobile: true },
    { name: 'Handy gedrosselt (CPU 4x, langsames 4G 1,6 Mbit/150 ms)', cpu: 4, net: 'slow4g', mobile: true },
  ];
  const out = {};
  for (const ed of ['/', '/werkstatt/']) {
    for (const c of conds) {
      const key = `${ed} | ${c.name}`;
      const rs = [];
      console.log('\n##', key, '· Last', load());
      for (let i = 0; i < RUNS; i++) rs.push(await measure(browser, srv.origin, ed, c));
      const col = (ph, f) => rs.map((r) => f(r[ph])).filter((x) => x != null);
      for (const ph of ['cold', 'warm']) {
        const o = {};
        for (const k of ['ttfb', 'htmlEnd', 'fp', 'fcp', 'mainJsEnd', 'lastJsEnd', 'splashDone', 'ready', 'ltN', 'ltSum', 'ltMax', 'ltAfterN', 'ltAfterSum']) o[k] = fmt(stats(col(ph, (m) => m[k])));
        o.heapMB = fmt(stats(col(ph, (m) => m.heap / 1e6), 1));
        const q = rs[0][ph].req;
        o.requests = `${q.n} (Netz ${q.net}) · übertragen ${(q.enc / 1e3).toFixed(0)} kB · entpackt ${(q.dec / 1e3).toFixed(0)} kB · ${q.proto}`;
        o.byKind = Object.fromEntries(Object.entries(q.byKind).map(([k, v]) => [k, `${v.n} · ${(v.enc / 1e3).toFixed(0)} kB / ${(v.dec / 1e3).toFixed(0)} kB`]));
        console.log(ph, JSON.stringify(o, null, 1));
        out[`${key} | ${ph}`] = o;
      }
    }
  }
  require('fs').writeFileSync(__dirname + `/out-m1-${H2 ? 'h2' : 'h1'}.json`, JSON.stringify(out, null, 1));
  await browser.close(); await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
