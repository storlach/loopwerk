// Was passiert beim Start im Hauptthread? Trace mit CPU-Profil, CPU 4x gedrosselt, Netz ungedrosselt (nur Rechenzeit).
const { start, launch, newPage, load, sleep } = require('./lib.cjs');
const { startTrace, stopTrace, analyse, markTs, navStart } = require('./trace.cjs');
const ed = process.argv[2] || '/';
const cpu = Number(process.argv[3] || 4);
const mobile = process.argv[4] !== 'desktop';

(async () => {
  const srv = await start({ h2: true });
  const browser = await launch();
  console.log('Last', load(), ed, 'cpu', cpu, mobile ? 'Handy' : 'Desktop');
  const { page } = await newPage(browser, { cpu, mobile, init: () => {
    const iv = setInterval(() => { if (window.loopwerk?.ready) { performance.mark('lw-ready'); clearInterval(iv); } }, 4);
  } });
  await startTrace(browser, page);
  await page.goto(srv.origin + ed, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  await sleep(3000);
  const ev = await stopTrace(browser);
  const t0 = navStart(ev); const tReady = markTs(ev, 'lw-ready');
  console.log('ready nach', ((tReady - t0) / 1000).toFixed(0), 'ms');
  const a = analyse(ev, { fromTs: t0, toTs: tReady, top: 22 });
  console.log('\n== Bis ready: Selbstzeit je Ereignisart (ms)'); for (const r of a.byName) console.log(String(r.ms).padStart(8), r.name);
  console.log('\n== Aufgaben > 50 ms:', a.tasks.map((t) => `${((t.at - t0) / 1000).toFixed(0)}:${t.ms}`).join('  '));
  console.log('\n== JS-Selbstzeit je Datei (ms)'); for (const r of a.files) console.log(String(r.ms).padStart(8), r.name);
  console.log('\n== JS-Selbstzeit je Funktion (ms)'); for (const r of a.fns) console.log(String(r.ms).padStart(8), r.name);
  const b = analyse(ev, { fromTs: tReady, top: 14 });
  console.log('\n== Nach ready (3 s): Ereignisarten'); for (const r of b.byName) console.log(String(r.ms).padStart(8), r.name);
  console.log('Aufgaben > 50 ms nach ready:', b.tasks.map((t) => `${((t.at - t0) / 1000).toFixed(0)}:${t.ms}`).join('  '));
  console.log('\n== Nach ready: JS je Funktion'); for (const r of b.fns.slice(0, 14)) console.log(String(r.ms).padStart(8), r.name);
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
