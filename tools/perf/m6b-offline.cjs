// Krachwerk offline, wenn der HTTP-Cache abgelaufen ist (Pages: 10 Minuten) – hier mit max-age=0 nachgestellt.
const { start, launch, newPage, load, sleep } = require('./lib.cjs');

async function visit(page, url, timeout = 30000) {
  let ok = true; let err = '';
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout });
  } catch (e) { ok = false; err = e.message.split('\n')[0].slice(0, 100); }
  return { ok, err, splash: ok ? '' : await page.evaluate(() => document.getElementById('boot-step')?.textContent || document.body?.innerText?.slice(0, 80) || '').catch(() => 'keine Seite') };
}
const probe = (page) => page.evaluate(async () => {
  const out = {};
  const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length;
  out.cacheEntries = n;
  for (const [k, u] of Object.entries({ fxWorklet: 'src/dsp/fx-worklet.js', recWorklet: 'src/dsp/recorder-worklet.js', worker: 'src/dsp/worker.js', cutSound: 'src/cut-sound.js', lame: 'vendor/lamejs/lame.min.js', fonts: null })) {
    if (!u) continue;
    try { const r = await fetch(new URL(u, document.baseURI)); out[k] = r.ok ? 'da' : 'Status ' + r.status; } catch { out[k] = 'FEHLT'; }
  }
  try { await window.loopwerk.engine._ensure(); out.masteringWorklet = window.loopwerk.engine.worklets ? 'geladen' : 'NICHT geladen'; } catch (e) { out.engine = e.message; }
  try { await window.loopwerk.engine.ctx.audioWorklet.addModule(new URL('src/dsp/recorder-worklet.js', document.baseURI)); out.aufnahme = 'Worklet geladen'; } catch (e) { out.aufnahme = 'GEHT NICHT: ' + String(e.message).slice(0, 60); }
  return out;
}).catch((e) => ({ err: e.message.slice(0, 100) }));

(async () => {
  const srv = await start({ h2: false, maxAge: 0 });
  const browser = await launch();
  console.log('Last', load());
  const url = srv.origin + '/werkstatt/';
  for (const visits of [1, 2, 3]) {
    const { page, ctx, errors } = await newPage(browser, { mobile: true });
    for (let i = 0; i < visits; i++) { await visit(page, url); await sleep(2000); }
    await ctx.setOffline(true);
    const off = await visit(page, url, 12000);
    const p = off.ok ? await probe(page) : null;
    console.log(`${visits} Besuch(e) online, dann offline: Start ${off.ok ? 'gelingt' : 'SCHEITERT (' + (off.splash || off.err) + ')'} ${p ? JSON.stringify(p) : ''} ${off.ok ? '' : errors.slice(-1).join('').slice(0, 140)}`);
    await ctx.close();
  }
  // Wie oben, aber beim 2. Besuch einmal abgespielt und einmal das Aufnahme-Worklet geholt (wie nach einer Aufnahme)
  {
    const { page, ctx } = await newPage(browser, { mobile: true });
    await visit(page, url); await sleep(1500);
    await visit(page, url); await sleep(500);
    await page.evaluate(async () => { await window.loopwerk.engine._ensure(); await window.loopwerk.engine.ctx.audioWorklet.addModule(new URL('src/dsp/recorder-worklet.js', document.baseURI)); const { runJob } = await import('/src/dsp/run.js'); await runJob('key', { chs: [new Float32Array(44100)], sampleRate: 44100 }); });
    await sleep(1500);
    await ctx.setOffline(true);
    const off = await visit(page, url, 12000);
    console.log('2 Besuche online mit Abspielen + Aufnahme + Rechen-Auftrag, dann offline: Start', off.ok ? 'gelingt' : 'SCHEITERT', off.ok ? JSON.stringify(await probe(page)) : '');
    await ctx.close();
  }
  // Loopwerk (ohne Service Worker) zum Vergleich
  {
    const { page, ctx } = await newPage(browser, { mobile: true });
    await visit(page, srv.origin + '/'); await sleep(1000); await visit(page, srv.origin + '/'); await sleep(500);
    await ctx.setOffline(true);
    const off = await visit(page, srv.origin + '/', 10000);
    console.log('Loopwerk (kein Service Worker) offline nach Ablauf des Caches: Start', off.ok ? 'gelingt' : 'scheitert (erwartet)');
    await ctx.close();
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
