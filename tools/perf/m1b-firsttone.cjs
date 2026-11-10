// Erster Ton: Zeit vom Tippen bis es klingen kann – Play, Regal-Vorhören (synthetisch / Katalog-Datei / Paket), kalt.
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const RUNS = Number(process.argv[2]) || 3;

(async () => {
  const srv = await start({ h2: true });
  const browser = await launch();
  const conds = [
    { name: 'Desktop ungedrosselt', cpu: 1, net: 'none', mobile: false },
    { name: 'Handy CPU 4x, 4G (9 Mbit/85 ms)', cpu: 4, net: '4g', mobile: true },
    { name: 'Handy CPU 4x, langsames 4G (1,6 Mbit/150 ms)', cpu: 4, net: 'slow4g', mobile: true },
  ];
  for (const c of conds) {
    console.log('\n##', c.name, '· Last', load());
    const rs = [];
    for (let i = 0; i < RUNS; i++) {
      const { page, ctx } = await newPage(browser, c);
      await page.goto(srv.origin + '/', { waitUntil: 'commit' });
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      await sleep(500);
      const n0 = srv.log.length;
      const r = await page.evaluate(async () => {
        const { engine, library } = window.loopwerk;
        const { PACKED } = await import('/src/asset-packs.js');
        const out = {};
        const time = async (fn) => { const t0 = performance.now(); await fn(); return performance.now() - t0; };
        // 1. Play: Ton-Kontext aufbauen (Worklet laden, Latenz messen) und Song starten
        out.play = await time(() => engine.play(16));
        engine.pause();
        const lazy = library.list().filter((s) => s.lazy);
        const syn = lazy.find((s) => s.def && s.category === 'drums');
        const syn2 = lazy.find((s) => s.def && s.category === 'chords');
        const file = lazy.find((s) => s.file && !PACKED[s.file] && s.kind === 'loop');
        const shot = lazy.find((s) => s.file && !PACKED[s.file] && s.kind !== 'loop');
        const packed = lazy.filter((s) => s.file && PACKED[s.file]);
        const pk = packed[Math.floor(packed.length / 2)];
        // 2.–5. Vorhören: bis previewSample fertig ist (Klang erzeugt/geladen und gestartet)
        out.synDrums = await time(() => engine.previewSample(syn.id));
        out.synChords = await time(() => engine.previewSample(syn2.id));
        out.catLoop = file ? await time(() => engine.previewSample(file.id)) : null; // Datei + Dehnen (Worker wird nachgeladen)
        out.catLoop2 = file ? await time(() => engine.previewSample(lazy.filter((s) => s.file && !PACKED[s.file] && s.kind === 'loop')[1].id)) : null;
        out.catShot = shot ? await time(() => engine.previewSample(shot.id)) : null;
        out.pack = pk ? await time(() => engine.previewSample(pk.id)) : null;
        out.again = await time(() => engine.previewSample(syn.id)); // schon geladen
        engine.stopPreview();
        out.ids = [syn.id, syn2.id, file?.id, shot?.id, pk?.id];
        return out;
      });
      r.reqs = srv.log.slice(n0).map((l) => `${l.p.split('/').slice(-2).join('/')} ${(l.bytes / 1e3).toFixed(0)}kB`);
      rs.push(r);
      await ctx.close();
    }
    const m = (k) => fmt(stats(rs.map((r) => r[k]).filter((x) => x != null)));
    console.log('erstes Play (Ton-Kontext aufbauen):', m('play'), 'ms');
    console.log('Vorhören synthetischer Drum-Loop (wird erzeugt):', m('synDrums'), 'ms · Akkord-Loop:', m('synChords'), 'ms');
    console.log('Vorhören Katalog-Loop (Datei laden + auf Tempo dehnen, 1. Mal mit Worker-Start):', m('catLoop'), 'ms · 2. Loop:', m('catLoop2'), 'ms');
    console.log('Vorhören Katalog-Einzelklang (Datei):', m('catShot'), 'ms · aus Paket:', m('pack'), 'ms · schon geladen:', m('again'), 'ms');
    console.log('Beispiele', rs[0].ids.join(', '), '· Anfragen:', rs[0].reqs.join(' | '));
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
