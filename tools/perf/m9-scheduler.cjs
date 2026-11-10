// Wozu: Scheduler messen – wie schnell Live-Änderungen hörbar werden (Stumm, Fader, Clip verschieben, Stopp,
// Loop-Ende kurz vor der Marke) und was eine Blockade des Hauptthreads mit der Wiedergabe macht (Stille, falsche Stelle).
// Grundlage: tools/perf/sched-probe.cjs (Rampe als Sound, Abgriff am Kanalzug).
// Aufruf: node tools/perf/m9-scheduler.cjs [--cpu 4] [--runs 3] [--only block,mute,…] [--blocks 0.3,0.45,0.8]
// Beispiel: LW_ROOT=/pfad/zum/vorher node tools/perf/m9-scheduler.cjs --cpu 4
// Exit-Code: 0 = gemessen, 1 = Fehler beim Messen.
const { start, launch, newPage, stats, fmt, load } = require('./lib.cjs');
const { schedProbe } = require('./sched-probe.cjs');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node tools/perf/m9-scheduler.cjs [--cpu 4] [--runs 3] [--only block,mute,fader,move,stop,loop] [--blocks 0.3,0.45,0.8]\nLW_ROOT=<ordner> misst einen anderen Stand.');
  process.exit(0);
}
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cpu = Number(opt('--cpu', 4));
const runs = Number(opt('--runs', 3));
const only = opt('--only', 'block,mute,fader,move,stop,loop').split(',');
const blocks = opt('--blocks', '0.3,0.45,0.8').split(',').map(Number);

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch();
  console.log(`## Scheduler · CPU ${cpu}× · ${runs} Läufe · Last ${load()}`);
  const cases = [];
  for (const k of only) {
    if (k === 'block') for (const b of blocks) cases.push({ kind: 'block', block: b, label: `Blockade ${b} s` });
    else if (k === 'loop') { cases.push({ kind: 'loop', d: 0.1, label: 'Loop-Ende 0,1 s vor der Marke' }); cases.push({ kind: 'loop', d: 0.3, label: 'Loop-Ende 0,3 s vor der Marke' }); }
    else cases.push({ kind: k, label: k });
  }
  for (const c of cases) {
    const rs = [];
    for (let i = 0; i < runs; i++) {
      const { page, ctx } = await newPage(browser, { mobile: true, cpu });
      // Licht aus (Attrappe): die Software-Grafik im Headless belegt sonst den Hauptthread
      await page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      rs.push(await page.evaluate(schedProbe, c));
      await ctx.close();
    }
    const m = (k) => fmt(stats(rs.map((r) => r[k] * 1000), 0));
    console.log(`${c.label.padEnd(32)} Reaktion ${m('react')} ms · abweichend ${m('bad')} ms (Stille ${m('silent')}, falsche Stelle ${m('misplaced')})`);
  }
  await browser.close();
  await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
