// Einzelposten im Hauptthread: Säubern einer Aufnahme (Krachwerk), Lautheit fürs Mastering, WAV-Kodierung, Spitzenwert; wiederholtes Offline-Rendern.
const { execSync } = require('child_process');
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('Last', load());
  for (const cpu of [1, 4]) {
    const { page, ctx } = await newPage(browser, { cpu, mobile: cpu > 1 });
    await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
    await page.goto(srv.origin + '/');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const clean = await import('/src/dsp/clean.js');
      const { integratedLoudness } = await import('/src/dsp/loudness.js');
      const { encodeWav } = await import('/src/wav.js');
      const ex = await import('/src/export.js');
      const sr = 48000;
      const mk = (secs, ch, rate = sr) => Array.from({ length: ch }, (_, c) => { const d = new Float32Array(Math.round(secs * rate)); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.02 * (c + 1)) * 0.3 * Math.exp(-((i / rate) % 1) * 3) + (Math.random() - 0.5) * 0.02; return d; });
      const med = (fn, n = 5) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return { med: +t[Math.floor(n / 2)].toFixed(1), min: +t[0].toFixed(1), max: +t[n - 1].toFixed(1) }; };
      const out = {};
      const take = mk(4, 2);
      out.cleanTake4s = med(() => clean.cleanTake(take.map((d) => d.slice()), sr, { maxSeconds: 4 }));
      const mono = clean.mixMono(take);
      out.features4s = med(() => clean.features(mono, sr));
      const long = mk(112, 2, 44100);
      out.loudness112s = med(() => integratedLoudness(long, 44100), 3);
      const buf = new AudioBuffer({ numberOfChannels: 2, length: long[0].length, sampleRate: 44100 });
      buf.copyToChannel(long[0], 0); buf.copyToChannel(long[1], 1);
      out.encodeWav112s = med(() => encodeWav(buf, { bits: 16 }), 3);
      out.peakOf112s = med(() => ex.peakOf(buf), 3);
      return out;
    });
    console.log(`cpu ${cpu}: Aufnahme säubern (4 s Stereo, cleanTake) ${JSON.stringify(r.cleanTake4s)} ms · Klang beschreiben (features) ${JSON.stringify(r.features4s)} ms · Lautheit 112 s (Mastering-Analyse, Hauptthread) ${JSON.stringify(r.loudness112s)} ms · encodeWav 112 s ${JSON.stringify(r.encodeWav112s)} ms · peakOf 112 s ${JSON.stringify(r.peakOf112s)} ms`);
    await ctx.close();
  }
  // Wiederholtes Offline-Rendern mit Mastering (jede Änderung stößt bei eingeschaltetem Mastering eine Analyse an)
  {
    const { page, cdp, ctx } = await newPage(browser, {});
    await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
    await page.goto(srv.origin + '/');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
    const threads = () => { try { return execSync("ps -eLo pid,args | grep -- '--type=renderer' | grep -v grep | wc -l").toString().trim(); } catch { return '?'; } };
    const rss = () => { try { return execSync("ps -eo rss,args --sort=-rss | grep -- '--type=renderer' | grep -v grep | head -1 | awk '{print int($1/1024)}'").toString().trim(); } catch { return '?'; } };
    console.log('Renderer-Threads vorher', threads(), '· RSS', rss(), 'MB');
    let crashed = null;
    for (let round = 1; round <= 6 && !crashed; round++) {
      const r = await page.evaluate(async () => {
        const { store, library, renderProject } = window.loopwerk;
        store.setMastering({ on: true });
        const t = [];
        for (let i = 0; i < 10; i++) { const t0 = performance.now(); await renderProject(store.project, library, { toBeat: 32 }); t.push(performance.now() - t0); }
        return { first: Math.round(t[0]), last: Math.round(t[9]) };
      }).catch((e) => { crashed = e.message.split('\n')[0]; return null; });
      const h = crashed ? null : await cdp.send('Runtime.getHeapUsage').catch(() => null);
      console.log(`nach ${round * 10} Offline-Rendern mit Mastering-Worklet: ${crashed ? 'ABSTURZ ' + crashed : `je ${r.first}→${r.last} ms · Threads ${threads()} · RSS ${rss()} MB · JS-Heap ${(h.usedSize / 1e6).toFixed(1)} MB · ArrayBuffer ${((h.backingStorageSize || 0) / 1e6).toFixed(0)} MB`}`);
    }
    await ctx.close().catch(() => {});
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
