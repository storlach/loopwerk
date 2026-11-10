// Speicher. Aufruf: node m5-memory.cjs <heap|sounds|undo|tempo|leaks|idb>
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const part = process.argv[2] || 'heap';

// Bytes aller dekodierten Klänge der Bibliothek (Float32, je Puffer nur einmal gezählt)
function audioBytes() {
  const { library } = window.loopwerk;
  const seen = new Set(); const by = { buffer: 0, orig: 0, cooked: 0, variants: 0, keyed: 0 }; let n = 0; let loaded = 0; let secs = 0;
  const add = (b, k) => { if (!b || seen.has(b) || !b.length) return; seen.add(b); by[k] += b.length * b.numberOfChannels * 4; n++; if (k === 'buffer') secs += b.duration; };
  for (const s of library.samples.values()) { if (s.buffer) loaded++; add(s.buffer, 'buffer'); add(s.orig, 'orig'); add(s.cooked, 'cooked'); }
  for (const v of library.variants.values()) add(v.buffer, 'variants');
  for (const v of library.keyedVariants.values()) add(v.buffer, 'keyed');
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return { sounds: library.samples.size, loaded, buffers: n, MB: +(total / 1e6).toFixed(1), secs: Math.round(secs), by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +(v / 1e6).toFixed(1)])) };
}

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(200);
  await cdp.send('HeapProfiler.collectGarbage');
  const h = await cdp.send('Runtime.getHeapUsage');
  const d = await cdp.send('Memory.getDOMCounters');
  return { jsMB: +(h.usedSize / 1e6).toFixed(1), backingMB: +((h.backingStorageSize || 0) / 1e6).toFixed(1), embedderMB: +((h.embedderHeapUsedSize || 0) / 1e6).toFixed(1), nodes: d.nodes, listeners: d.jsEventListeners, docs: d.documents };
}

async function open(browser, srv, path = '/', opts = {}) {
  const p = await newPage(browser, opts);
  await p.page.goto(srv.origin + path);
  await p.page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  await sleep(1500);
  return p;
}

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('##', part, '· Last', load());

  if (part === 'heap') {
    for (const path of ['/', '/werkstatt/']) {
      const rs = [];
      for (let i = 0; i < 3; i++) { const { page, cdp, ctx } = await open(browser, srv, path); rs.push({ ...(await heap(cdp)), audio: await page.evaluate(audioBytes) }); await ctx.close(); }
      console.log(path, 'nach dem Start:', 'JS-Heap', fmt(stats(rs.map((r) => r.jsMB), 1)), 'MB · ArrayBuffer', fmt(stats(rs.map((r) => r.backingMB), 1)), 'MB · DOM-Knoten', rs[0].nodes, '· Listener', rs[0].listeners, '· Klänge', JSON.stringify(rs[0].audio));
    }
    // typische Sitzung: abspielen, 12 Sounds vorhören, 6 Clips setzen, Mixer/Export auf/zu, Beat-Pattern, 3 Tempowechsel, 30 Änderungen
    const rs = [];
    for (let i = 0; i < 3; i++) {
      const { page, cdp, ctx } = await open(browser, srv, '/');
      const h0 = await heap(cdp);
      await page.evaluate(async () => {
        const { engine, library, store, ui, tempo } = window.loopwerk;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        await engine.play(16); await wait(1500);
        const ids = library.list().filter((s) => s.lazy).map((s) => s.id);
        const pick = Array.from({ length: 12 }, (_, k) => ids[Math.floor((k + 0.5) * ids.length / 12)]);
        for (const id of pick) { await engine.previewSample(id); await wait(150); }
        engine.stopPreview();
        for (let k = 0; k < 6; k++) store.addClip('t8', pick[k], k * 8, 8);
        for (const d of ['mixer', null, 'export', null]) { ui.setDock(d); await wait(200); }
        document.getElementById('new-beat-btn').click(); await wait(800); ui.setDock(null);
        for (const b of [128, 110, 120]) { store.setBpm(b); await wait(100); while (tempo.busy) await wait(50); }
        for (let k = 0; k < 30; k++) { store.setTrack('t1', { volume: 0.5 + (k % 10) / 30 }); await wait(20); }
        engine.pause(); await wait(500);
      });
      const h1 = await heap(cdp);
      rs.push({ h0, h1, audio: await page.evaluate(audioBytes), undo: await page.evaluate(() => { const s = window.loopwerk.store; return { n: s.undoStack.length, kB: Math.round(s.undoStack.reduce((a, x) => a + x.length, 0) / 1e3) }; }) });
      await ctx.close();
    }
    console.log('Loopwerk nach typischer Sitzung: JS-Heap', fmt(stats(rs.map((r) => r.h1.jsMB), 1)), 'MB (Start', fmt(stats(rs.map((r) => r.h0.jsMB), 1)), ') · ArrayBuffer', fmt(stats(rs.map((r) => r.h1.backingMB), 1)), 'MB (Start', fmt(stats(rs.map((r) => r.h0.backingMB), 1)), ') · DOM', rs[0].h0.nodes, '→', rs[0].h1.nodes, '· Listener', rs[0].h0.listeners, '→', rs[0].h1.listeners, '· Klänge', JSON.stringify(rs[0].audio), '· Rückgängig', JSON.stringify(rs[0].undo));
  }

  if (part === 'sounds') {
    const { page, cdp, ctx } = await open(browser, srv, '/');
    const a0 = await page.evaluate(audioBytes); const h0 = await heap(cdp);
    const t0 = Date.now();
    await page.evaluate(() => window.loopwerk.library.catalogReady);
    const tCore = Date.now() - t0;
    const a1 = await page.evaluate(audioBytes); const h1 = await heap(cdp);
    const t1 = Date.now();
    await page.evaluate(async () => { const { library } = window.loopwerk; const ids = library.list().map((s) => s.id); for (let i = 0; i < ids.length; i += 12) await library.ensureMany(ids.slice(i, i + 12)); });
    const tAll = Date.now() - t1;
    const a2 = await page.evaluate(audioBytes); const h2 = await heap(cdp);
    console.log('Start:', JSON.stringify(a0), JSON.stringify(h0));
    console.log(`Grundausstattung (catalogReady) nach ${tCore} ms:`, JSON.stringify(a1), JSON.stringify(h1));
    console.log(`Alle Sounds einmal benutzt nach weiteren ${tAll} ms:`, JSON.stringify(a2), JSON.stringify(h2));
    const net = srv.log.filter((l) => /\.wav$/.test(l.p));
    console.log('Audio-Anfragen:', net.length, 'Dateien,', (net.reduce((a, l) => a + l.bytes, 0) / 1e6).toFixed(1), 'MB');
    await ctx.close();
  }

  if (part === 'undo') {
    for (const clips of [8, 448, 1000]) {
      const { page, cdp, ctx } = await open(browser, srv, '/');
      if (clips > 8) await page.evaluate(S.bigSong, { tracks: 16, clips });
      const h0 = await heap(cdp);
      const r = await page.evaluate(async () => {
        const { store } = window.loopwerk;
        const t = store.project.tracks[0];
        const times = [];
        for (let k = 0; k < 200; k++) { const c = t.clips[k % t.clips.length]; const t0 = performance.now(); store.setClip(c.id, { gain: 0.5 + (k % 7) / 20 }); times.push(performance.now() - t0); if (k % 20 === 19) await new Promise((r) => setTimeout(r, 0)); }
        times.sort((a, b) => a - b);
        const t1 = performance.now(); JSON.stringify(store.project); const ser = performance.now() - t1;
        return { n: store.undoStack.length, MB: +(store.undoStack.reduce((a, x) => a + x.length, 0) / 1e6).toFixed(2), jsonKB: Math.round(JSON.stringify(store.project).length / 1e3), stepMed: +times[100].toFixed(1), stepMax: +times[199].toFixed(1), serMs: +ser.toFixed(1) };
      });
      const h1 = await heap(cdp);
      console.log(`${String(clips).padStart(4)} Clips · Projekt-JSON ${r.jsonKB} kB · 200 Schritte: Verlauf ${r.n} Einträge, ${r.MB} MB Text · JS-Heap ${h0.jsMB} → ${h1.jsMB} MB · Änderung (dispatch + alle Abonnenten) Median ${r.stepMed} ms, max ${r.stepMax} ms · JSON.stringify ${r.serMs} ms`);
      await ctx.close();
    }
  }

  if (part === 'tempo') {
    const { page, cdp, ctx } = await open(browser, srv, '/');
    await page.evaluate(() => window.loopwerk.library.catalogReady);
    const rows = [];
    rows.push({ at: 'vorher', ...(await heap(cdp)), audio: (await page.evaluate(audioBytes)).MB });
    for (let i = 1; i <= 10; i++) {
      const ms = await page.evaluate(async (bpm) => { const { store, tempo } = window.loopwerk; const t0 = performance.now(); store.setBpm(bpm); await new Promise((r) => setTimeout(r, 50)); while (tempo.busy) await new Promise((r) => setTimeout(r, 50)); return performance.now() - t0; }, 100 + i * 7);
      if (i === 1 || i === 5 || i === 10) rows.push({ at: `nach ${i}×`, ms: Math.round(ms), ...(await heap(cdp)), audio: (await page.evaluate(audioBytes)).MB });
    }
    for (const r of rows) console.log(JSON.stringify(r));
    await ctx.close();
  }

  if (part === 'leaks') {
    const { page, cdp, ctx } = await open(browser, srv, '/');
    const snap = async () => ({ ...(await heap(cdp)), canvas: await page.evaluate(() => document.querySelectorAll('canvas').length), voices: await page.evaluate(() => window.loopwerk.engine.voices.size) });
    const cycle = async (name, fn, n = 10) => {
      await page.evaluate(async (src) => { const f = new Function('return (' + src + ')')(); await f(); }, fn.toString()); // einmal vorwärmen
      const a = await snap();
      for (let i = 0; i < n; i++) await page.evaluate(async (src) => { const f = new Function('return (' + src + ')')(); await f(); }, fn.toString());
      const b = await snap();
      console.log(`${name.padEnd(34)} ${n}×: DOM ${a.nodes} → ${b.nodes} · Listener ${a.listeners} → ${b.listeners} · Canvas ${a.canvas} → ${b.canvas} · JS-Heap ${a.jsMB} → ${b.jsMB} MB · ArrayBuffer ${a.backingMB} → ${b.backingMB} MB · Stimmen ${b.voices}`);
    };
    const wait = 'const wait = (ms) => new Promise((r) => setTimeout(r, ms));';
    await cycle('Abspielen/Stopp', async () => { const { engine } = window.loopwerk; await engine.play(16); await new Promise((r) => setTimeout(r, 400)); engine.stop(); await new Promise((r) => setTimeout(r, 300)); });
    await cycle('Mixer auf/zu', async () => { const { ui } = window.loopwerk; ui.setDock('mixer'); await new Promise((r) => setTimeout(r, 150)); ui.setDock(null); await new Promise((r) => setTimeout(r, 150)); });
    await cycle('Export auf/zu', async () => { const { ui } = window.loopwerk; ui.setDock('export'); await new Promise((r) => setTimeout(r, 150)); ui.setDock(null); await new Promise((r) => setTimeout(r, 150)); });
    await cycle('Sample-Editor auf/zu', async () => { const { editor, ui, store } = window.loopwerk; editor.open(store.project.tracks[0].clips[0].id); await new Promise((r) => setTimeout(r, 250)); ui.setDock(null); await new Promise((r) => setTimeout(r, 150)); });
    await page.evaluate(async () => { document.getElementById('new-beat-btn').click(); await new Promise((r) => setTimeout(r, 800)); window.__pid = window.loopwerk.patternEditor.id; window.loopwerk.ui.setDock(null); });
    await cycle('Pattern-Editor auf/zu', async () => { const { patternEditor, ui } = window.loopwerk; patternEditor.open(window.__pid); await new Promise((r) => setTimeout(r, 250)); ui.setDock(null); await new Promise((r) => setTimeout(r, 150)); });
    await cycle('Clip auswählen/abwählen (Inspektor)', async () => { const { ui, store } = window.loopwerk; ui.select(store.project.tracks[0].clips[0].id); await new Promise((r) => setTimeout(r, 100)); ui.select(null); await new Promise((r) => setTimeout(r, 100)); });
    await cycle('Clip hinzufügen/löschen', async () => { const { store } = window.loopwerk; const id = store.addClip('t8', 'drums-four', 0, 16); await new Promise((r) => setTimeout(r, 100)); store.deleteClip(id); await new Promise((r) => setTimeout(r, 100)); });
    await cycle('Regal suchen', async () => { const s = document.getElementById('shelf-search'); for (const v of ['ba', 'bass', '']) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 60)); } });
    void wait;
    await ctx.close();
  }

  if (part === 'idb') {
    // Krachwerk: n Aufnahmen zu 8 s (Mono 48 kHz, wie vom Mikrofon) anlegen, Schreibzeit und Belegung messen
    for (const cpu of [1, 4]) {
      const { page, cdp, ctx } = await open(browser, srv, '/werkstatt/', { mobile: cpu > 1, cpu });
      const r = await page.evaluate(async () => {
        const { own, store } = window.loopwerk;
        const sr = 48000; const times = [];
        const e0 = await navigator.storage.estimate();
        for (let k = 0; k < 10; k++) {
          const buf = new AudioBuffer({ numberOfChannels: 1, length: 8 * sr, sampleRate: sr });
          const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.03 * (k + 1)) * 0.4 + (Math.random() - 0.5) * 0.05;
          const t0 = performance.now();
          const s = await own.create({ name: 'Aufnahme ' + (k + 1), buffer: buf, kind: 'oneshot' });
          times.push(performance.now() - t0);
          if (k < 4) store.addClip(store.project.tracks[k % store.project.tracks.length].id, s.id, k * 8, 8);
        }
        await new Promise((r) => setTimeout(r, 800));
        const e1 = await navigator.storage.estimate();
        times.sort((a, b) => a - b);
        const t1 = performance.now(); const json = JSON.stringify(store.project); localStorage.setItem('loopwerk.make.project.v1', json); const save = performance.now() - t1;
        return { med: +times[5].toFixed(0), min: +times[0].toFixed(0), max: +times[9].toFixed(0), usedMB: +((e1.usage - e0.usage) / 1e6).toFixed(1), quotaGB: +(e1.quota / 1e9).toFixed(1), saveMs: +save.toFixed(1), jsonKB: +(json.length / 1e3).toFixed(1) };
      });
      const a = await page.evaluate(audioBytes);
      // Neustart: wie lange dauert das Laden der eigenen Sounds?
      const t0 = Date.now();
      await page.reload();
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      const ready = await page.evaluate(() => window.__marks.ready);
      console.log(`Krachwerk cpu ${cpu}: 10 Aufnahmen je 8 s · own.create je Sound Median ${r.med} ms (${r.min}–${r.max}) · IndexedDB +${r.usedMB} MB (Kontingent ${r.quotaGB} GB) · Projekt speichern ${r.saveMs} ms (${r.jsonKB} kB) · Klänge im Speicher ${JSON.stringify(a)} · Neustart mit 10 Sounds: bereit nach ${Math.round(ready)} ms (${Date.now() - t0} ms Wand) · danach ${JSON.stringify(await page.evaluate(audioBytes))}`);
      void cdp;
      await ctx.close();
    }
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
