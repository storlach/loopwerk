// Wozu: Mastering-Messung im Hintergrund (Performance Teil 2, Punkt 4) – stört sie Start, ersten Ton und Wiedergabe, und
// misst sie unnötig neu?
//   start    Beispiel (Mastering an) am Handy: lange Aufgaben in den ersten 6 s, Play 1,5 s nach „bereit“, Dauer der Messung
//   unnoetig großer Song: Umbenennen, Loop, Songlänge (ändern die Lautheit nicht) und danach ein Fader – wie oft wird gemessen?
//   spielen  großer Song spielt, Fader ändern: Takt-Abstände, verspätete Takte, lange Aufgaben während der Messung
// Aufruf: node tools/perf/m11-mastering.cjs [start,unnoetig,spielen] [--cpu 4] [--runs 3]
// Beispiel: LW_ROOT=/tmp/vorher node tools/perf/m11-mastering.cjs start --runs 3
// Exit-Code: 0 = gemessen, 1 = Fehler.
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('node tools/perf/m11-mastering.cjs [start,unnoetig,spielen] [--cpu 4] [--runs 3]'); process.exit(0); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const parts = (args[0] && !args[0].startsWith('--') ? args[0] : 'start,unnoetig,spielen').split(',');
const cpu = Number(opt('--cpu', 4));
const runs = Number(opt('--runs', 3));
const GLOW = 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }';

// Im Browser: Messläufe zählen (busy false → true) und ihre Dauer
function watchMastering() {
  const m = window.loopwerk.mastering;
  const w = window.__mw = { runs: 0, t0: 0, durs: [], busy: false };
  m.on((s) => {
    if (s.busy && !w.busy) { w.runs++; w.t0 = performance.now(); }
    if (!s.busy && w.busy) w.durs.push(performance.now() - w.t0);
    w.busy = s.busy;
  });
  if (m.state.busy) { w.busy = true; w.runs++; w.t0 = performance.now(); }
}
// Messung für den aktuellen Stand sofort fertig rechnen lassen, dann Ruhe
const settle = async (page) => { await page.evaluate(() => window.loopwerk.mastering.now()); await sleep(2500); await idle(page, 120000); };
const idle = (page, ms = 60000) => page.waitForFunction(() => !window.loopwerk.mastering.state.busy, null, { timeout: ms, polling: 100 });

async function open(browser, srv) {
  const p = await newPage(browser, { mobile: true, cpu });
  await p.page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: GLOW }));
  await p.page.goto(srv.origin + '/');
  await p.page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  return p;
}

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log(`## Mastering-Messung · CPU ${cpu}× · ${runs} Läufe · Last ${load()}`);
  if (parts.includes('start')) {
    const rs = [];
    for (let i = 0; i < runs; i++) {
      const { page, ctx } = await open(browser, srv);
      const r = await page.evaluate(async () => {
        const t0 = performance.now();
        const m = window.loopwerk.mastering;
        let seen = m.state.busy ? t0 : 0; let done = 0;
        m.on((s) => { if (s.busy && !seen) seen = performance.now(); if (!s.busy && seen && !done) done = performance.now(); });
        await new Promise((res) => setTimeout(res, 1500));
        const p0 = performance.now();
        await window.loopwerk.engine.play(0);
        const play = performance.now() - p0;
        await new Promise((res) => setTimeout(res, 4500));
        window.loopwerk.engine.stop();
        const lts = window.__lt.filter((e) => e.s >= t0 && e.s < t0 + 6000);
        return { play, ltN: lts.length, ltMax: Math.max(0, ...lts.map((e) => e.d)), startAt: seen ? seen - t0 : -1, dur: done ? done - seen : -1 };
      });
      rs.push(r);
      await ctx.close();
    }
    const m = (k) => fmt(stats(rs.map((r) => r[k])));
    console.log(`Start (Beispiel, Mastering an): Play 1,5 s nach „bereit“ ${m('play')} ms · lange Aufgaben in 6 s ${m('ltN')}, längste ${m('ltMax')} ms · Messung beginnt nach ${m('startAt')} ms, dauert ${m('dur')} ms`);
  }
  if (parts.includes('unnoetig')) {
    const rs = [];
    for (let i = 0; i < runs; i++) {
      const { page, ctx } = await open(browser, srv);
      await page.evaluate(S.bigSong, { tracks: 16, clips: 448, mastering: true });
      await settle(page);
      await page.evaluate(watchMastering);
      await page.evaluate(() => { const { store } = window.loopwerk; store.setTrack('t1', { name: 'Neu' }); store.setLoop({ on: true, startBeat: 8, endBeat: 24 }); store.setLength(store.project.lengthBars + 4); store.setProjectName('Anders'); });
      await sleep(3500); await idle(page, 120000);
      const cosmetic = await page.evaluate(() => window.__mw.runs);
      await page.evaluate(() => window.loopwerk.store.setTrack('t2', { volume: 0.5 }));
      await sleep(3500); await idle(page, 120000);
      const fader = await page.evaluate(() => window.__mw.runs) - cosmetic;
      await page.evaluate(() => window.loopwerk.store.undo());
      await sleep(3500); await idle(page, 120000);
      const undo = await page.evaluate(() => window.__mw.runs) - cosmetic - fader;
      rs.push({ cosmetic, fader, undo });
      await ctx.close();
    }
    const m = (k) => fmt(stats(rs.map((r) => r[k])));
    console.log(`Großer Song: Messläufe nach Umbenennen + Loop + Songlänge + Songname ${m('cosmetic')} · nach Fader ${m('fader')} · nach Rückgängig ${m('undo')}`);
  }
  if (parts.includes('spielen')) {
    const rs = [];
    for (let i = 0; i < runs; i++) {
      const { page, ctx } = await open(browser, srv);
      await page.evaluate(S.bigSong, { tracks: 16, clips: 448, mastering: true });
      await settle(page);
      await page.evaluate(watchMastering);
      await page.evaluate(S.watchTicks);
      await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
      await sleep(1000);
      await page.evaluate(S.resetTicks);
      await page.evaluate(() => { window.__ltMark = performance.now(); window.loopwerk.store.setTrack('t2', { volume: 0.5 }); });
      await sleep(2000); await idle(page, 120000);
      const t = await page.evaluate(S.readTicks);
      const r = await page.evaluate(() => { const l = window.__lt.filter((e) => e.s >= window.__ltMark); return { ltN: l.length, ltMax: Math.max(0, ...l.map((e) => e.d)), dur: window.__mw.durs[0] ?? -1, runs: window.__mw.runs }; });
      rs.push({ ...t, ...r });
      await ctx.close();
    }
    const m = (k) => fmt(stats(rs.map((r) => r[k])));
    console.log(`Großer Song spielt, Fader: Messung dauert ${m('dur')} ms · Takt-Abstand max ${m('gapMax')} ms · verspätet ${m('late')} (bis ${m('lateMax')} ms) · lange Aufgaben ${m('ltN')}, längste ${m('ltMax')} ms`);
  }
  await browser.close();
  await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
