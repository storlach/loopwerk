// Bedienung im Betrieb. Aufruf: node m3-interact.cjs <desktop|handy> <demo|big> [runs]
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const dev = process.argv[2] || 'desktop';
const song = process.argv[3] || 'demo';
const RUNS = Number(process.argv[4]) || 3;
const mobile = dev === 'handy';
const cpu = mobile ? 4 : 1;

// Aktion ausführen, synchrone Dauer und Zeit bis zum übernächsten Bild messen
const act = (page, fn, arg) => page.evaluate(async ({ src, arg }) => {
  const f = new Function('return (' + src + ')')();
  const t0 = performance.now();
  await f(arg);
  const sync = performance.now() - t0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { sync: +sync.toFixed(1), paint: +(performance.now() - t0).toFixed(1) };
}, { src: fn.toString(), arg });

const busy = async (cdp) => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return m; };

async function run(srv, browser, glow = true, short = false) {
  const { page, cdp, ctx, errors } = await newPage(browser, { cpu, mobile });
  await cdp.send('Performance.enable');
  if (!glow) {
    await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
  }
  await page.goto(srv.origin + '/');
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  await sleep(800);
  const R = {};
  if (song === 'big') R.song = await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
  await page.evaluate(S.watchTicks);
  const span = async (name, ms, during) => {
    const b0 = await busy(cdp);
    await page.evaluate(() => window.__startFrames());
    const t0 = Date.now();
    if (during) await during();
    const rest = ms - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    const f = await page.evaluate(() => window.__stopFrames());
    const b1 = await busy(cdp);
    const wall = (b1.Timestamp - b0.Timestamp) || 1;
    f.busy = +(100 * (b1.TaskDuration - b0.TaskDuration) / wall).toFixed(0);
    f.script = +(100 * (b1.ScriptDuration - b0.ScriptDuration) / wall).toFixed(0);
    f.layout = +(100 * ((b1.LayoutDuration - b0.LayoutDuration) + (b1.RecalcStyleDuration - b0.RecalcStyleDuration)) / wall).toFixed(0);
    R[name] = f;
    return f;
  };

  // 1 Leerlauf
  await span('idle', 4000);
  if (short) {
    // nur Abspielen vergleichen
    await page.evaluate(() => { window.loopwerk.engine.setPosition(16); return window.loopwerk.engine.play(); });
    await sleep(600);
    await span('play', 5000);
    await ctx.close();
    return R;
  }
  // 2 Abspielen (Licht an)
  const tPlay = await page.evaluate(async () => { const { engine } = window.loopwerk; engine.setPosition(16); const t0 = performance.now(); await engine.play(); return performance.now() - t0; });
  R.firstPlayMs = +tPlay.toFixed(0);
  await sleep(600);
  await page.evaluate(S.resetTicks);
  await span('play', 5000);
  R.playTicks = await page.evaluate(S.readTicks);
  R.glowState = await page.evaluate(() => { const s = window.loopwerk.glow.state; if (s.cost == null) return {}; return { cost: +s.cost.toFixed(2), roomCost: +s.roomCost.toFixed(2), glQ: s.glQ, shader: s.shader }; });

  // 3 Scrollen im Arranger (Geste über CDP, beim Abspielen)
  const box = await page.evaluate(() => { const r = document.getElementById('arr-scroll').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, sw: document.getElementById('arr-scroll').scrollWidth }; });
  await page.evaluate(S.resetTicks);
  await span('scrollX', 2500, async () => {
    await cdp.send('Input.synthesizeScrollGesture', { x: box.x, y: box.y, xDistance: -1200, speed: 900, gestureSourceType: mobile ? 'touch' : 'mouse' }).catch((e) => { R.scrollErr = e.message; });
    await cdp.send('Input.synthesizeScrollGesture', { x: box.x, y: box.y, xDistance: 1200, speed: 900, gestureSourceType: mobile ? 'touch' : 'mouse' }).catch(() => {});
  });
  R.scrollTicks = await page.evaluate(S.readTicks);

  // 4 Zoomen: 8 Stufen (waagerecht), je Stufe synchrone Dauer und Zeit bis zum Bild
  await page.evaluate(() => window.loopwerk.engine.pause());
  await sleep(300);
  const zooms = [];
  await page.evaluate(() => window.__startFrames());
  for (const ppb of [32, 44, 60, 80, 60, 44, 32, 24]) zooms.push(await act(page, (v) => window.loopwerk.arranger.zoomTo(v), ppb));
  R.zoomFrames = await page.evaluate(() => window.__stopFrames());
  R.zoomSync = stats(zooms.map((z) => z.sync), 1); R.zoomPaint = stats(zooms.map((z) => z.paint), 1);

  // 5 Clip ziehen (Maus bzw. Store-Aktion am Handy)
  const clip = await page.evaluate(() => { const n = document.querySelector('#arr-scroll .clip'); n.scrollIntoView({ block: 'center', inline: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, id: n.dataset.clipId }; });
  if (!mobile) {
    await page.mouse.move(clip.x, clip.y);
    await page.mouse.down();
    await span('drag', 1600, async () => {
      for (let i = 1; i <= 40; i++) { await page.mouse.move(clip.x + i * 6, clip.y + (i > 20 ? 20 : 0)); await sleep(16); }
    });
    const t0 = Date.now();
    await page.mouse.up();
    R.dropPaint = (await act(page, () => {})).paint + (Date.now() - t0);
  }
  const mv = [];
  for (let i = 0; i < 5; i++) mv.push(await act(page, (id) => { const { store } = window.loopwerk; const f = store.findClip(id); store.moveClip(id, f.track.id, f.clip.startBeat + 4, { copy: false }); }, clip.id));
  R.moveSync = stats(mv.map((z) => z.sync), 1); R.movePaint = stats(mv.map((z) => z.paint), 1);

  // 6 Rückgängig
  const un = [];
  for (let i = 0; i < 5; i++) un.push(await act(page, () => window.loopwerk.store.undo()));
  R.undoSync = stats(un.map((z) => z.sync), 1); R.undoPaint = stats(un.map((z) => z.paint), 1);

  // 7 Fach/Dock öffnen und schließen
  const docks = [];
  for (const d of ['mixer', null, 'export', null, 'mixer', null]) docks.push({ d, ...(await act(page, (name) => window.loopwerk.ui.setDock(name), d)) });
  R.dockOpenPaint = stats(docks.filter((x) => x.d).map((z) => z.paint), 1);
  R.dockOpenSync = stats(docks.filter((x) => x.d).map((z) => z.sync), 1);
  await span('dockAnim', 900, async () => { await page.evaluate(() => window.loopwerk.ui.setDock('mixer')); });
  await page.evaluate(() => window.loopwerk.ui.setDock(null));
  await sleep(400);
  if (mobile) {
    // Schublade „Sounds“ antippen und am Griff ziehen
    await page.tap('#tab-sounds').catch((e) => { R.tabErr = e.message.slice(0, 80); });
    await sleep(500);
    const grip = await page.evaluate(() => { const g = document.querySelector('.shelf .sheet-grip') || document.querySelector('.sheet-grip'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    R.grip = !!grip;
    if (grip) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip.x, y: grip.y }] });
      await span('sheetDrag', 1400, async () => {
        for (let i = 1; i <= 30; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip.x, y: grip.y - i * 8 }] }); await sleep(16); }
        for (let i = 30; i >= 0; i--) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip.x, y: grip.y - i * 8 }] }); await sleep(16); }
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
    }
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await sleep(300);
  }

  // 8 Regal: suchen (Zeichen für Zeichen)
  const typed = [];
  for (const q of ['b', 'ba', 'bas', 'bass', 'bas', '']) typed.push(await act(page, (v) => { const s = document.getElementById('shelf-search'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, q));
  R.searchSync = stats(typed.map((z) => z.sync), 1); R.searchPaint = stats(typed.map((z) => z.paint), 1);
  R.shelfItems = await page.evaluate(() => ({ items: document.querySelectorAll('#library .loop-item').length, all: window.loopwerk.library.list().length, dom: document.getElementsByTagName('*').length }));

  // 9 Tempowechsel beim Abspielen
  await page.evaluate(() => { window.loopwerk.engine.setPosition(16); return window.loopwerk.engine.play(); });
  await sleep(800);
  await page.evaluate(S.resetTicks);
  let tempo = null;
  await span('tempo', 4000, async () => {
    tempo = await page.evaluate(async () => {
      const { store, tempo } = window.loopwerk;
      const t0 = performance.now();
      store.setBpm(store.project.bpm === 120 ? 133 : 120);
      const sync = performance.now() - t0;
      let used = null;
      while (tempo.busy) { if (used == null && !tempo.usedBusy) used = performance.now() - t0; await new Promise((r) => setTimeout(r, 10)); if (performance.now() - t0 > 60000) break; }
      return { sync: +sync.toFixed(1), used: +(used ?? performance.now() - t0).toFixed(0), all: +(performance.now() - t0).toFixed(0) };
    });
  });
  R.tempoTimes = tempo;
  R.tempoTicks = await page.evaluate(S.readTicks);
  await page.evaluate(() => window.loopwerk.engine.pause());

  // 10 Beat-Editor: neues Beat-Pattern, 8 Felder tippen (läuft dabei im Loop)
  await page.evaluate(() => document.getElementById('new-beat-btn').click());
  await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && document.querySelectorAll('#pattern .pat-cell').length > 16, null, { timeout: 20000 });
  await sleep(600);
  await page.evaluate(() => { const { engine, store } = window.loopwerk; return engine.play(0); });
  await sleep(500);
  await page.evaluate(S.resetTicks);
  const taps = [];
  await span('beatEdit', 3200, async () => {
    for (let i = 0; i < 8; i++) {
      const pos = await page.evaluate((i) => {
        const { library } = window.loopwerk;
        const cells = [...document.querySelectorAll('#pattern .pat-cell')].filter((c) => c.offsetParent);
        const cell = cells[(i * 5 + 3) % cells.length];
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = cell.getBoundingClientRect();
        const revs = () => [...library.samples.values()].filter((s) => s.patternId).map((s) => s.rev).join(',');
        const w = window.__pat = { rev0: revs(), down: 0, sync: 0, heard: 0 };
        const onDown = () => { w.down = performance.now(); queueMicrotask(() => { w.sync = performance.now() - w.down; }); };
        document.addEventListener('pointerdown', onDown, { capture: true, once: true });
        const iv = setInterval(() => { if (w.down && revs() !== w.rev0) { w.heard = performance.now() - w.down; clearInterval(iv); } }, 4);
        setTimeout(() => clearInterval(iv), 6000);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, i);
      if (mobile) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
      await page.waitForFunction(() => window.__pat.heard > 0, null, { timeout: 8000 }).catch(() => {});
      taps.push(await page.evaluate(() => ({ sync: window.__pat.sync, heard: window.__pat.heard || 9999, changed: window.__pat.heard > 0 })));
      await sleep(250);
    }
  });
  R.beatSync = stats(taps.map((z) => z.sync), 1); R.beatHeard = stats(taps.map((z) => z.heard), 0); R.beatChanged = taps.filter((t) => t.changed).length;
  R.beatTicks = await page.evaluate(S.readTicks);
  await page.evaluate(() => window.loopwerk.engine.pause());
  R.errors = errors.slice(0, 3);
  await ctx.close();
  return R;
}

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log('##', dev, song, 'cpu', cpu, '· Last', load());
  const rs = []; const ng = [];
  for (let i = 0; i < RUNS; i++) { rs.push(await run(srv, browser, false, false)); console.log('Lauf', i + 1, 'Last', load()); }
  for (let i = 0; i < RUNS; i++) ng.push(await run(srv, browser, true, true));
  // Zusammenfassen: Median je Zahl
  const agg = (list, pick) => { const v = list.map(pick).filter((x) => typeof x === 'number'); return v.length ? fmt(stats(v, 1)) : '-'; };
  const out = {};
  for (const k of Object.keys(rs[0])) {
    const v = rs[0][k];
    if (typeof v === 'number') out[k] = agg(rs, (r) => r[k]);
    else if (v && typeof v === 'object' && 'med' in v) out[k] = agg(rs, (r) => r[k]?.med);
    else if (v && typeof v === 'object' && !Array.isArray(v)) { out[k] = {}; for (const kk of Object.keys(v)) if (typeof v[kk] === 'number') out[k][kk] = agg(rs, (r) => r[k]?.[kk]); else out[k][kk] = v[kk]; }
    else out[k] = v;
  }
  out.mitLicht_idle = {}; out.mitLicht_play = {};
  for (const kk of ['fps', 'p95', 'max', 'lt', 'ltSum', 'busy', 'script', 'layout']) { out.mitLicht_idle[kk] = agg(ng, (r) => r.idle[kk]); out.mitLicht_play[kk] = agg(ng, (r) => r.play[kk]); }
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(__dirname + `/out-m3-${dev}-${song}.json`, JSON.stringify({ load: load(), out, raw: rs }, null, 1));
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
