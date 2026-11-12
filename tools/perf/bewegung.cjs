// Wozu: die Übergänge der schwebenden Flächen (Layout „reiter“, Loopwerk-Desktop) Bild für Bild messen – Karte rechts auf/zu, Reiterwechsel,
//   Mixer-Spalte, Effekt- und Summen-Karte, Clip-Editor, schnelles Hin und Her, Werkzeuge in der Kopfzeile. Je Übergang: Dauer, größter Sprung
//   zwischen zwei Bildern (px, Deckkraft), Anfangsruck, Überschwingen, Aufblitzen (Deckkraft kehrt um), lange Bilder (> 20 ms), Breite konstant,
//   Rollbalken frei, Start- und Endzustand. Wahlweise Filmstreifen (Einzelbilder bei 1/10 Tempo + Übersicht).
// Aufruf: node tools/perf/bewegung.cjs [--root <ordner>] [--out <ordner>] [--film] [--nur a,b] [--szene still|spielen|beide] [--json <datei>]
// Beispiel: node tools/perf/bewegung.cjs --out /tmp/bewegung --film --szene beide
//   (--root = anderer Stand der App, z. B. aus `git archive`; Voreinstellung: dieses Repo)
// 1440×900, Stresssong mit 448 Clips (tools/perf/scen.cjs). Headless hat keine Grafikkarte: Bildzeiten sind Vergleichswerte.
// Exit 1, wenn ein Übergang im falschen Zustand endet, der Rollbalken verdeckt ist oder der Browser Fehler meldet; Exit 2 bei falschem Aufruf.
const path = require('path');
const fs = require('fs');

const HELP = `Bewegung der Karten messen (1440×900, 448 Clips)

  --root <ordner>   Stand der App (Voreinstellung: dieses Repo)
  --out <ordner>    Ergebnisse (bewegung.json, Filmstreifen film-<name>-<n>.png, film-<name>.png als Übersicht)
  --film            Filmstreifen aufnehmen (Übergänge bei 1/10 Tempo, 8 Einzelbilder je Übergang)
  --nur a,b         nur diese Übergänge (Namen siehe Ausgabe)
  --szene s         still | spielen | beide (Voreinstellung beide; spielen = Abspielen läuft während der Messung)
  --json <datei>    Ergebnis zusätzlich als JSON
  --help            diese Hilfe`;

function args(argv) {
  const o = { root: path.resolve(__dirname, '../..'), out: null, film: false, nur: null, szene: 'beide', json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) { console.error(`${a} braucht einen Wert`); process.exit(2); } return argv[++i]; };
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--root') o.root = path.resolve(need());
    else if (a === '--out') o.out = path.resolve(need());
    else if (a === '--film') o.film = true;
    else if (a === '--nur') o.nur = need().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--szene') o.szene = need();
    else if (a === '--json') o.json = path.resolve(need());
    else { console.error(`Unbekannt: ${a}\n\n${HELP}`); process.exit(2); }
  }
  if (!['still', 'spielen', 'beide'].includes(o.szene)) { console.error(`--szene: still, spielen oder beide\n\n${HELP}`); process.exit(2); }
  if (o.film && !o.out) { console.error('--film braucht --out'); process.exit(2); }
  return o;
}

// ---------- im Browser: Aufzeichnung je Bild ----------
function installRecorder() {
  const zbar = () => document.querySelector('.zbar-y');
  const read = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const cs = getComputedStyle(n);
    const rs = n.getClientRects();
    const r = n.getBoundingClientRect();
    // sichtbare Deckkraft: eigene mal die aller Eltern
    let op = 1;
    for (let a = n; a && a.nodeType === 1; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
    return { top: r.top, left: r.left, w: n.offsetWidth, h: r.height, op, vis: cs.visibility, shown: rs.length > 0 && cs.visibility !== 'hidden' };
  };
  window.__mv = {
    run: false, frames: [],
    start(probes) {
      const s = this; s.frames = []; s.run = true;
      const step = (t) => {
        if (!s.run) return;
        const f = { t, p: {} };
        for (const [k, sel] of Object.entries(probes)) {
          // Wert einer Fläche: die erste passende sichtbare (für Kanalzug-Zeilen die erste)
          f.p[k] = read(sel);
        }
        // Rollbalken: frei, wenn ein Punkt in seiner Mitte (halbe Höhe) ihn trifft
        const z = zbar();
        if (z) { const r = z.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.5); f.zfree = !!hit && z.contains(hit); f.zx = r.left; }
        s.frames.push(f);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    stop() { this.run = false; return this.frames; },
  };
}

// ---------- Auswertung ----------
// Eine Messgröße je Fläche: Oberkante (px) und Deckkraft; „ändert sich“ ab 0,05 px bzw. 0,002
function analyse(frames, key, expect, interrupted) {
  const xs = frames.map((f) => ({ t: f.t, v: f.p[key] })).filter((x) => x.v);
  if (xs.length < 3) return { fehlt: true };
  // Lage nur, solange die Fläche im Fluss ist (sonst die letzte bekannte)
  let lastTop = (xs.find((x) => x.v.w > 0) || xs[0]).v.top;
  const tops = xs.map((x) => { if (x.v.w > 0 || x.v.h > 0) lastTop = x.v.top; return lastTop; });
  const ops = xs.map((x) => (x.v.vis === 'hidden' || !x.v.shown ? 0 : x.v.op));
  let first = -1; let last = -1;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(tops[i] - tops[i - 1]) > 0.05 || Math.abs(ops[i] - ops[i - 1]) > 0.002) { if (first < 0) first = i; last = i; }
  }
  const res = { bilder: xs.length };
  if (first < 0) { res.dauer = 0; } else {
    res.dauer = Math.round(xs[last].t - xs[first - 1].t);
    let dy = 0; let dop = 0; let rev = 0; let lastSign = 0; let longF = 0; let maxF = 0;
    const seg = [];
    for (let i = first; i <= last; i++) {
      // Lage zählt nur, solange die Fläche zu sehen ist (unsichtbar an den Startplatz zurück ist kein Sprung)
      const a = Math.max(ops[i], ops[i - 1]) > 0.01 ? Math.abs(tops[i] - tops[i - 1]) : 0; const b = Math.abs(ops[i] - ops[i - 1]);
      seg.push(a);
      dy = Math.max(dy, a); dop = Math.max(dop, b);
      const s = Math.sign(ops[i] - ops[i - 1]);
      if (s && lastSign && s !== lastSign && b > 0.01) rev++;
      if (s && b > 0.01) lastSign = s;
      const ft = xs[i].t - xs[i - 1].t; maxF = Math.max(maxF, ft); if (ft > 20) longF++;
    }
    res.sprungPx = +dy.toFixed(1); res.sprungOp = +dop.toFixed(2); res.umkehr = rev; res.langeBilder = longF; res.maxBild = Math.round(maxF);
    // Anfangsruck: erster Schritt im Verhältnis zum mittleren Schritt (1 = gleichmäßig, groß = Ruck)
    const total = Math.abs(tops[last] - tops[first - 1]);
    const mean = seg.length ? seg.reduce((a, b) => a + b, 0) / seg.length : 0;
    res.anfang = mean > 0.05 ? +(seg[0] / mean).toFixed(1) : 0;
    res.wegPx = +total.toFixed(1);
    // Überschwingen: über das Ziel hinaus (px)
    const end = tops[tops.length - 1]; const st = tops[first - 1];
    let over = 0;
    for (let i = first; i < xs.length; i++) { const d = (tops[i] - end) * Math.sign(end - st || 1); if (d > over) over = d; }
    res.ueberPx = interrupted ? null : +over.toFixed(1);
    const ws = xs.slice(first - 1, last + 1).filter((x) => x.v.w > 0).map((x) => x.v.w);
    // Breite im Fluss (offsetWidth, ohne Skalierung): ändert sie sich, bricht Text um
    res.breiteFest = !ws.length || Math.max(...ws) - Math.min(...ws) < 0.5;
  }
  const endV = xs[xs.length - 1].v;
  if (expect) {
    const want = expect === 'auf' ? 1 : 0;
    const op = endV.vis === 'hidden' || !endV.shown ? 0 : endV.op;
    res.ende = Math.abs(op - want) < 0.01 && (expect === 'auf' ? endV.vis !== 'hidden' && endV.shown : true) ? 'ok' : `FALSCH (op ${op.toFixed(2)}, ${endV.vis})`;
  }
  return res;
}

// ---------- Übergänge ----------
// probes: Flächen; erwart: Endzustand je Fläche; vorher(page): Ausgangslage; tun(page, tick): Auslöser (tick = Wartezeit in ms)
const CARD = { karte: '#side' };
const T = [
  { name: 'karte-auf', probes: { ...CARD, inhalt: '#side .side-sounds' }, erwart: { karte: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'zu'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-sounds').click()) },
  { name: 'karte-zu', probes: { ...CARD }, erwart: { karte: 'zu' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'sounds'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-sounds').click()) },
  { name: 'reiter', probes: { ...CARD, sounds: '#side .side-sounds', datei: '#side-datei' }, erwart: { karte: 'auf', datei: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'sounds'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-datei').click()) },
  { name: 'reiter-schnell', probes: { ...CARD, sounds: '#side .side-sounds', datei: '#side-datei' }, erwart: { karte: 'auf', sounds: 'auf' }, unterbrochen: true, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'sounds'); },
    tun: async (p, w) => { await p.evaluate(() => document.getElementById('side-tab-datei').click()); await w(70); await p.evaluate(() => document.getElementById('side-tab-sounds').click()); await w(70); await p.evaluate(() => document.getElementById('side-tab-datei').click()); await w(70); await p.evaluate(() => document.getElementById('side-tab-sounds').click()); } },
  { name: 'karte-spalte', probes: { ...CARD, spalte: '.mix-slot', kopf: '#mix-head' }, erwart: { karte: 'zu', spalte: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'datei'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-mixer').click()) },
  { name: 'spalte-karte', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'auf', spalte: 'zu' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'mixer'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-datei').click()) },
  { name: 'spalte-auf', probes: { spalte: '.mix-slot', kopf: '#mix-head' }, erwart: { spalte: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'zu'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-mixer').click()) },
  { name: 'spalte-zu', probes: { spalte: '.mix-slot', kopf: '#mix-head' }, erwart: { spalte: 'zu' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'mixer'); }, tun: async (p) => p.evaluate(() => document.getElementById('side-tab-mixer').click()) },
  { name: 'effekt-auf', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'mixer'); }, tun: async (p) => p.evaluate(() => document.querySelector('.mix-slot .strip-sum').click()) },
  { name: 'effekt-zu', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'zu', spalte: 'auf' }, film: 'rechts',
    vorher: async (p, w) => { await setSide(p, 'mixer'); await p.evaluate(() => document.querySelector('.mix-slot .strip-sum').click()); await w(900); },
    tun: async (p) => p.evaluate(() => document.getElementById('mixcard-close').click()) },
  { name: 'summe-auf', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'auf' }, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'mixer'); }, tun: async (p) => p.evaluate(() => document.querySelector('#mix-bus .strip[data-strip-id="__master"] .strip-sum').click()) },
  { name: 'summe-zu', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'zu', spalte: 'auf' }, film: 'rechts',
    vorher: async (p, w) => { await setSide(p, 'mixer'); await p.evaluate(() => document.querySelector('#mix-bus .strip[data-strip-id="__master"] .strip-sum').click()); await w(900); },
    tun: async (p) => p.evaluate(() => document.getElementById('mixcard-close').click()) },
  { name: 'spalte-effekt-wechsel', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'auf' }, film: 'rechts',
    vorher: async (p, w) => { await setSide(p, 'mixer'); await p.evaluate(() => document.querySelector('.mix-slot .strip-sum').click()); await w(900); },
    tun: async (p) => p.evaluate(() => document.querySelectorAll('.mix-slot .strip-sum')[2].click()) },
  { name: 'karte-hin-her', probes: { ...CARD }, erwart: { karte: 'auf' }, unterbrochen: true, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'zu'); },
    tun: async (p, w) => { const c = () => p.evaluate(() => document.getElementById('side-tab-sounds').click()); await c(); await w(110); await c(); await w(110); await c(); } },
  { name: 'mixer-hin-her', probes: { ...CARD, spalte: '.mix-slot' }, erwart: { karte: 'auf', spalte: 'zu' }, unterbrochen: true, film: 'rechts',
    vorher: async (p) => { await setSide(p, 'datei'); },
    tun: async (p, w) => { const c = (id) => p.evaluate((i) => document.getElementById(`side-tab-${i}`).click(), id); await c('mixer'); await w(120); await c('datei'); await w(120); await c('mixer'); await w(120); await c('datei'); } },
  { name: 'editor-auf', modal: true, probes: { editor: '#ov-card', grund: '#clip-overlay .ov-back' }, erwart: { editor: 'auf', grund: 'auf' }, film: 'mitte',
    vorher: async (p) => { await setSide(p, 'sounds'); await p.evaluate(() => window.loopwerk.ui.select(document.querySelector('.clip').dataset.clipId)); },
    tun: async (p) => dblclickClip(p) },
  { name: 'editor-zu', modal: true, probes: { editor: '#ov-card', grund: '#clip-overlay .ov-back' }, erwart: { editor: 'zu', grund: 'zu' }, film: 'mitte',
    vorher: async (p, w) => { await setSide(p, 'sounds'); await dblclickClip(p); await w(1000); },
    tun: async (p) => p.keyboard.press('Escape') },
  { name: 'editor-hin-her', modal: true, probes: { editor: '#ov-card', grund: '#clip-overlay .ov-back' }, erwart: { editor: 'auf', grund: 'auf' }, unterbrochen: true, film: 'mitte',
    vorher: async (p) => { await setSide(p, 'sounds'); },
    tun: async (p, w) => { await dblclickClip(p); await w(120); await p.keyboard.press('Escape'); await w(90); await dblclickClip(p); } },
  { name: 'werkzeuge', probes: { werkzeuge: '#arr-bar-tools' }, erwart: { werkzeuge: 'auf' }, film: 'oben',
    vorher: async (p) => { await setSide(p, 'sounds'); await p.evaluate(() => window.loopwerk.ui.select(null)); },
    tun: async (p) => p.evaluate(() => window.loopwerk.ui.select(document.querySelector('.clip').dataset.clipId)) },
  { name: 'werkzeuge-zu', probes: { werkzeuge: '#arr-bar-tools' }, erwart: { werkzeuge: 'zu' }, film: 'oben',
    vorher: async (p) => { await setSide(p, 'sounds'); await p.evaluate(() => window.loopwerk.ui.select(document.querySelector('.clip').dataset.clipId)); },
    tun: async (p) => p.evaluate(() => window.loopwerk.ui.select(null)) },
];

// Ausgangslage herstellen, ohne Übergang mitzumessen: Reiter wählen bzw. Karte zu, Editor zu, Karte der Spalte zu
async function setSide(page, want) {
  await page.evaluate(async (w) => {
    const app = document.getElementById('app');
    if (window.loopwerk.ui.dock) window.loopwerk.ui.setDock(null);
    if (app.dataset.mixcard) document.getElementById('mixcard-close')?.click();
    if (w === 'zu') { if (app.dataset.side !== 'zu') document.getElementById(`side-tab-${app.dataset.side}`).click(); }
    else if (app.dataset.side !== w) document.getElementById(`side-tab-${w}`).click();
  }, want);
  await page.waitForTimeout(1100);
}
async function dblclickClip(page) {
  // Clip im sichtbaren Bereich links (nicht unter der Karte)
  const box = await page.evaluate(() => {
    const sc = document.getElementById('arr-scroll').getBoundingClientRect();
    for (const c of document.querySelectorAll('.clip')) { const r = c.getBoundingClientRect(); if (r.left > sc.left + 200 && r.right < sc.left + 700 && r.top > sc.top + 40 && r.bottom < sc.bottom - 40) return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2 }; }
    return null;
  });
  if (!box) throw new Error('kein Clip zum Öffnen gefunden');
  await page.mouse.dblclick(box.x, box.y);
}

const CLIPS = { rechts: { x: 840, y: 0, width: 600, height: 900 }, mitte: null, oben: { x: 0, y: 40, width: 1000, height: 200 } };

async function contactSheet(browser, files, out, cols = 4) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const data = await page.evaluate(async ({ imgs, cols }) => {
    const els = await Promise.all(imgs.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
    const w = 380; const h = Math.round(w * els[0].height / els[0].width);
    const rows = Math.ceil(els.length / cols);
    const c = document.createElement('canvas'); c.width = cols * (w + 6); c.height = rows * (h + 22);
    const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height);
    els.forEach((im, i) => { const x = (i % cols) * (w + 6); const y = Math.floor(i / cols) * (h + 22); g.drawImage(im, x, y + 18, w, h); g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText(String(i + 1), x + 4, y + 13); });
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs, cols });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  await page.close();
}

async function main() {
  const o = args(process.argv.slice(2));
  process.env.LW_ROOT = o.root;
  const { start, launch, newPage, sleep } = require('./lib.cjs');
  const S = require('./scen.cjs');
  if (o.out) fs.mkdirSync(o.out, { recursive: true });
  const srv = await start({ h2: false });
  const browser = await launch();
  const all = {};
  let bad = 0;
  const szenen = o.szene === 'beide' ? ['still', 'spielen'] : [o.szene];
  const list = T.filter((t) => !o.nur || o.nur.includes(t.name));
  try {
    for (const sz of szenen) {
      const { page, cdp, errors } = await newPage(browser, { viewport: { width: 1440, height: 900 } });
      await page.addInitScript(installRecorder);
      await page.goto(srv.origin + '/');
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
      await page.evaluate(() => window.loopwerk.library.catalogReady);
      await sleep(1500);
      if ((await page.evaluate(() => document.getElementById('app').dataset.layout)) !== 'reiter') throw new Error('kein Layout „reiter“');
      await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
      await sleep(2000);
      if (sz === 'spielen') { await page.evaluate(() => { window.loopwerk.store.project.loop.on = false; window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); }); await sleep(800); }
      await cdp.send('Animation.enable');
      const res = {};
      for (const t of list) {
        const w = (ms) => sleep(ms);
        await t.vorher(page, w);
        if (sz === 'spielen') await page.evaluate(() => { if (!window.loopwerk.engine.playing) { window.loopwerk.engine.setPosition(8); window.loopwerk.engine.play(); } });
        await page.evaluate((p) => window.__mv.start(p), t.probes);
        await sleep(120);
        await t.tun(page, w);
        await sleep(1300);
        const frames = await page.evaluate(() => window.__mv.stop());
        const r = { flaechen: {} };
        for (const k of Object.keys(t.probes)) r.flaechen[k] = analyse(frames, k, t.erwart[k], t.unterbrochen);
        const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t);
        r.langeBilder = gaps.filter((g) => g > 20).length;
        r.maxBild = Math.round(Math.max(0, ...gaps));
        r.rollbalken = t.modal ? 'modal' : frames.every((f) => f.zfree !== false) ? 'frei' : `VERDECKT in ${frames.filter((f) => f.zfree === false).length} Bildern`;
        for (const [k, v] of Object.entries(r.flaechen)) if (v.ende && v.ende !== 'ok') { bad++; console.error(`✘ ${sz}/${t.name}/${k}: ${v.ende}`); }
        if (!['frei', 'modal'].includes(r.rollbalken)) { bad++; console.error(`✘ ${sz}/${t.name}: Rollbalken ${r.rollbalken}`); }
        res[t.name] = r;
        // Filmstreifen (nur in der ersten Szene): derselbe Übergang bei 1/10 Tempo, 8 Einzelbilder
        if (o.film && sz === szenen[0]) {
          await t.vorher(page, w);
          const dur = Math.max(250, ...Object.values(r.flaechen).map((v) => v.dauer || 0));
          await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
          const files = [];
          const n = 8;
          const shoot = async (i) => { const f = path.join(o.out, `film-${t.name}-${i + 1}.png`); await page.screenshot({ path: f, clip: CLIPS[t.film] || undefined }); files.push(f); };
          await shoot(0);
          const t0 = Date.now();
          const tunP = t.tun(page, (ms) => sleep(ms * 10));
          for (let i = 1; i < n; i++) {
            const at = (dur * 10 * 1.1 * i) / (n - 1);
            const waitMs = at - (Date.now() - t0);
            if (waitMs > 0) await sleep(waitMs);
            await shoot(i);
          }
          await tunP;
          await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
          await sleep(800);
          await contactSheet(browser, files, path.join(o.out, `film-${t.name}.png`));
        }
      }
      if (sz === 'spielen') await page.evaluate(() => window.loopwerk.engine.pause());
      if (errors.length) { bad++; console.error(`✘ ${sz}: Fehler im Browser: ${errors.slice(0, 3).join(' | ')}`); }
      all[sz] = res;
      await page.context().close();
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  // Tabelle
  const cols = ['dauer', 'wegPx', 'sprungPx', 'sprungOp', 'anfang', 'ueberPx', 'umkehr', 'langeBilder', 'breiteFest', 'ende'];
  for (const [sz, res] of Object.entries(all)) {
    console.log(`\n== Szene ${sz} (448 Clips${sz === 'spielen' ? ', Abspielen läuft' : ''}) ==`);
    console.log(['Übergang', 'Fläche', 'Dauer ms', 'Weg px', 'Sprung px', 'Sprung Deckkr.', 'Anfang', 'Überschw. px', 'Umkehr', 'lange Bilder', 'Breite fest', 'Ende', 'Rollbalken'].join(' | '));
    for (const [n, r] of Object.entries(res)) {
      for (const [k, v] of Object.entries(r.flaechen)) {
        console.log([n, k, ...cols.map((c) => (v.fehlt ? '–' : v[c] ?? '–')), r.rollbalken].join(' | '));
      }
    }
  }
  const out = { stand: o.root, zeit: new Date().toISOString(), szenen: all };
  if (o.out) fs.writeFileSync(path.join(o.out, 'bewegung.json'), JSON.stringify(out, null, 1));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(out, null, 1));
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
