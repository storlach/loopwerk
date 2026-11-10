// Wozu: die wichtigsten Kennzahlen der Oberfläche in einem Lauf messen und als Tabelle vorher/nachher ausgeben
//   (Stillstand-Auslastung, Abspielen mit 448 Clips, Zoom-Schritt, Leinwand-Speicher, Clip-Knoten).
// Aufruf: node tools/perf/kennzahlen.cjs [--vorher <ordner>] [--nachher <ordner>] [--geraet handy|desktop] [--laeufe N]
// Beispiel: node tools/perf/kennzahlen.cjs --vorher /tmp/alt --laeufe 3
//   (Ordner = Stand der App, z. B. aus `git archive`; ohne --nachher der Stand dieses Repos)
// Headless hat keine Grafikkarte: Bildraten sind Vergleichswerte. Exit 1 bei Fehlern im Browser oder beim Messen.
const path = require('path');

const HELP = `Kennzahlen der Oberfläche (Handy: 390×844, CPU 4× gedrosselt; Desktop: 1440×900)

  --vorher <ordner>     zweiter Stand zum Vergleich (Spalte „vorher“)
  --nachher <ordner>    gemessener Stand (Voreinstellung: dieses Repo)
  --geraet handy|desktop  (Voreinstellung handy)
  --laeufe N            Wiederholungen je Stand (Voreinstellung 3); Median, Spanne in Klammern
  --help                diese Hilfe`;

function args(argv) {
  const o = { vorher: null, nachher: path.resolve(__dirname, '../..'), geraet: 'handy', laeufe: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) { console.error(`${a} braucht einen Wert`); process.exit(2); } return argv[++i]; };
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--vorher') o.vorher = path.resolve(need());
    else if (a === '--nachher') o.nachher = path.resolve(need());
    else if (a === '--geraet') o.geraet = need();
    else if (a === '--laeufe') o.laeufe = Math.max(1, parseInt(need(), 10) || 3);
    else { console.error(`Unbekannt: ${a}\n\n${HELP}`); process.exit(2); }
  }
  return o;
}

// Läuft im Browser: Leinwandfläche und Clip-Knoten im Arranger
function canvasInfo() {
  let px = 0;
  for (const c of document.querySelectorAll('#arr-scroll canvas')) px += c.width * c.height;
  return { mb: +(px * 4 / 1e6).toFixed(1), clips: document.querySelectorAll('#arr-scroll .clip').length };
}

async function measureRoot(root, mobile, runs) {
  // lib.cjs liest LW_ROOT beim Laden: je Stand frisch laden
  process.env.LW_ROOT = root;
  for (const k of Object.keys(require.cache)) if (k.startsWith(__dirname)) delete require.cache[k];
  const { start, launch, newPage, sleep } = require('./lib.cjs');
  const S = require('./scen.cjs');
  const srv = await start({ h2: false });
  const browser = await launch();
  const out = [];
  const errors = [];
  try {
    for (let i = 0; i < runs; i++) {
      const { page, cdp, ctx, errors: err } = await newPage(browser, { cpu: mobile ? 4 : 1, mobile });
      await cdp.send('Performance.enable');
      const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const span = async (ms) => {
        const b0 = await m();
        await page.evaluate(() => window.__startFrames());
        await sleep(ms);
        const f = await page.evaluate(() => window.__stopFrames());
        const b1 = await m();
        const wall = b1.Timestamp - b0.Timestamp;
        return { busy: 100 * (b1.TaskDuration - b0.TaskDuration) / wall, layout: 100 * (b1.LayoutDuration - b0.LayoutDuration + b1.RecalcStyleDuration - b0.RecalcStyleDuration) / wall, fps: f.fps };
      };
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      await sleep(2500);
      const r = {};
      r.idleDemo = (await span(3000)).busy;
      await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
      await sleep(2500);
      r.idleBig = (await span(3000)).busy;
      await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
      await sleep(1000);
      const p = await span(3000);
      r.playLayout = p.layout; r.playFps = p.fps; r.playBusy = p.busy;
      await page.evaluate(() => window.loopwerk.engine.pause());
      await sleep(500);
      r.clips = (await page.evaluate(canvasInfo)).clips;
      r.mb24 = (await page.evaluate(canvasInfo)).mb;
      const z = await page.evaluate(async () => {
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const t = [];
        for (const v of [32, 44, 60, 80, 60, 44, 32, 24]) { const t0 = performance.now(); window.loopwerk.arranger.zoomTo(v); t.push(performance.now() - t0); await frame(); }
        return t.sort((a, b) => a - b)[Math.floor(t.length / 2)];
      });
      r.zoom = z;
      await page.evaluate(() => window.loopwerk.arranger.zoomTo(192));
      await sleep(800);
      r.mb192 = (await page.evaluate(canvasInfo)).mb;
      errors.push(...err);
      out.push(r);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  return { out, errors };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const cell = (rs, k, d = 0) => { const v = rs.map((r) => r[k]); return `${median(v).toFixed(d)} (${Math.min(...v).toFixed(d)}–${Math.max(...v).toFixed(d)})`; };

(async () => {
  const o = args(process.argv.slice(2));
  const mobile = o.geraet !== 'desktop';
  const os = require('os');
  console.log(`## Kennzahlen · ${mobile ? 'Handy 390×844, CPU 4×' : 'Desktop 1440×900'} · ${o.laeufe} Läufe · Last ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}`);
  const cols = [];
  if (o.vorher) cols.push(['vorher', await measureRoot(o.vorher, mobile, o.laeufe)]);
  cols.push(['nachher', await measureRoot(o.nachher, mobile, o.laeufe)]);
  const rows = [
    ['Stillstand Beispiel: Hauptthread %', 'idleDemo'],
    ['Stillstand 448 Clips: Hauptthread %', 'idleBig'],
    ['Abspielen 448: Layout+Stil %', 'playLayout'],
    ['Abspielen 448: Hauptthread %', 'playBusy'],
    ['Abspielen 448: Bilder/s', 'playFps', 1],
    ['Zoom-Schritt 448: Skript ms (Median von 8)', 'zoom'],
    ['Clip-Knoten im DOM (448 Clips)', 'clips'],
    ['Leinwand-Speicher Zoom 24: MB', 'mb24', 1],
    ['Leinwand-Speicher Zoom 192: MB', 'mb192', 1],
  ];
  console.log(`| Kennzahl | ${cols.map((c) => c[0]).join(' | ')} |`);
  console.log(`|---|${cols.map(() => '---').join('|')}|`);
  for (const [name, k, d] of rows) console.log(`| ${name} | ${cols.map((c) => cell(c[1].out, k, d)).join(' | ')} |`);
  const errs = cols.flatMap((c) => c[1].errors.map((e) => `${c[0]}: ${e}`));
  if (errs.length) { console.error('Fehler im Browser:\n' + errs.slice(0, 5).join('\n')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
