// Standardbilder: ein fester Satz Ansichten (Edition x Gerät x Szene), damit man Oberflächen-Änderungen vergleichen kann.
// Aufruf:  node tools/shots.cjs --out <ordner> [--geraet desktop,handy] [--edition loopwerk,krachwerk] [--szene a,b] [--breite 360]
// Beispiel: node tools/shots.cjs --out /tmp/bilder --edition krachwerk --szene start,song,werkbank
// Ausgabe: <edition>-<geraet>-<szene>.png; Exit 0 = alle Szenen entstanden oder bewusst übersprungen, 1 = Fehler beim Start/Bild.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('../tests/serve.cjs');

const SZENEN = ['start', 'song', 'clip', 'beat', 'melodie', 'clip-editor', 'werkbank', 'mixer', 'mastering', 'export'];
// Reihenfolge der Herstellung (Erstellen-Karten ändern den Song, deshalb zuletzt)
const ABLAUF = ['start', 'song', 'clip', 'clip-editor', 'werkbank', 'mixer', 'mastering', 'export', 'beat', 'melodie'];
const GERAETE = {
  desktop: { viewport: { width: 1440, height: 900 } },
  handy: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
const EDITIONEN = ['loopwerk', 'krachwerk'];

const HILFE = `Standardbilder des laufenden Programms (Loopwerk und Krachwerk, Desktop und Handy).

Aufruf: node tools/shots.cjs --out <ordner> [Optionen]
  --out <ordner>        Zielordner (Pflicht, wird angelegt)
  --geraet a,b          desktop (1440x900), handy (390x844, Touch); Voreinstellung beide
  --edition a,b         loopwerk, krachwerk; Voreinstellung beide
  --szene a,b           ${SZENEN.join(', ')}
                        (Voreinstellung alle; werkbank nur Krachwerk, beat/melodie/clip-editor nur wo es sie gibt)
  --breite 360          zusätzliche Handy-Breite (Datei <edition>-handy360-<szene>.png)
  --help                diese Hilfe
Bilder mit deviceScaleFactor 2. Nicht herstellbare Szenen werden übersprungen und am Ende genannt.
Exit-Code: 0 = Bilder geschrieben, 1 = Fehler in den Optionen oder nichts geschrieben.`;

function args() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.includes('-h')) { console.log(HILFE); process.exit(0); }
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) fail(`Unbekanntes Argument: ${a[i]}`);
    const k = a[i].slice(2);
    if (!['out', 'geraet', 'edition', 'szene', 'breite'].includes(k)) fail(`Unbekannte Option --${k} (siehe --help)`);
    o[k] = a[++i];
    if (o[k] == null) fail(`--${k} braucht einen Wert`);
  }
  if (!o.out) fail('--out <ordner> fehlt (siehe --help)');
  const list = (v, all, name) => {
    const l = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : all;
    const bad = l.filter((x) => !all.includes(x));
    if (bad.length) fail(`${name}: unbekannt ${bad.join(', ')} (erlaubt: ${all.join(', ')})`);
    return l;
  };
  const geraete = list(o.geraet, Object.keys(GERAETE), '--geraet');
  const out = { out: path.resolve(o.out), geraete: geraete.map((g) => ({ id: g, ...GERAETE[g] })), editionen: list(o.edition, EDITIONEN, '--edition'), szenen: list(o.szene, SZENEN, '--szene') };
  if (o.breite) {
    const w = Number(o.breite);
    if (!(w >= 280 && w <= 600)) fail('--breite: Zahl zwischen 280 und 600 erwartet');
    out.geraete.push({ id: `handy${w}`, viewport: { width: w, height: 844 }, hasTouch: true, isMobile: true });
  }
  return out;
}
function fail(msg) { console.error('Fehler: ' + msg); process.exit(1); }

const wait = (page, ms) => page.waitForTimeout(ms);

// ---- Hilfen im Browser ----
async function ruhe(page) {
  await page.evaluate(() => {
    const { ui, editor } = window.loopwerk;
    try { if (ui.dock === 'editor') editor?.close?.(); } catch { /* egal */ }
    ui.setDock(null);
    ui.select(null);
    ui.selectTrack(null);
    window.loopwerk.side?.show('sounds', { save: false }); // Layout „reiter“: Grundstellung der Leiste
  });
  await wait(page, 500);
}

// Krachwerk: zwei eigene Klänge und ein paar Clips (kein Katalog, leerer Song)
async function kleinerSong(page) {
  await page.evaluate(async () => {
    const lw = window.loopwerk;
    const sr = 44100;
    const make = (n, fn) => { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = fn(i); const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr }); b.copyToChannel(d, 0); return b; };
    const bumm = make(sr / 2, (i) => Math.sin(i / 20 * (1 + 3 * Math.exp(-i / 2000))) * Math.exp(-i / 5000));
    const ton = make(sr, (i) => 0.5 * Math.sin(2 * Math.PI * 220 * i / sr) * Math.min(1, i / 400) * Math.exp(-i / 20000));
    const a = await lw.own.create({ name: 'Bumm 1', buffer: bumm, source: 'Aufnahme', from: 'mic', cls: 'tief' });
    const b = await lw.own.create({ name: 'Ton 1', buffer: ton, source: 'Aufnahme', from: 'mic', cls: 'mittel' });
    const [t1, t2] = lw.store.project.tracks;
    for (const s of [0, 4, 8, 12]) lw.store.addClip(t1.id, a.id, s, 2);
    for (const s of [2, 6, 10]) lw.store.addClip(t2.id, b.id, s, 4);
  });
}

const ersterClip = (page, nurAudio = false) => page.evaluate((audio) => {
  const lw = window.loopwerk;
  for (const t of lw.store.project.tracks) for (const c of t.clips) {
    if (audio && lw.library.get(c.sampleId)?.patternId) continue;
    return c.id;
  }
  return null;
}, nurAudio);

// ---- Szenen: liefern null (Bild machen) oder einen Text (übersprungen) ----
const SZENE = {
  async start() { return null; }, // Seite ist frisch geladen
  async song(page, ed) {
    await ruhe(page);
    if (ed === 'loopwerk') {
      await page.evaluate(async () => {
        const M = await import('./src/model.js');
        const { store, library, tempo, patterns } = window.loopwerk;
        store.replace(M.createDemoProject());
        await tempo.apply?.();
        await patterns.sync?.(store.project);
        await library.ensureProject?.(store.project);
      });
    } else if (!(await ersterClip(page))) await kleinerSong(page);
    await page.evaluate(() => { window.loopwerk.engine.setPosition(0); const s = document.getElementById('arr-scroll'); if (s) s.scrollLeft = 0; window.loopwerk.arranger.render?.(); });
    await wait(page, 700);
    return null;
  },
  async clip(page, ed) {
    await ruhe(page);
    const id = await ersterClip(page);
    if (!id) return 'kein Clip im Song (Szene „song“ zuerst)';
    await page.evaluate((c) => window.loopwerk.ui.select(c), id);
    await wait(page, 700);
    return null;
  },
  async 'clip-editor'(page, ed) {
    if (ed === 'krachwerk') return 'Sample-Editor fehlt in Krachwerk (dort die Werkbank)';
    await ruhe(page);
    const id = await ersterClip(page, true);
    if (!id) return 'kein Audio-Clip im Song';
    await page.evaluate((c) => { const lw = window.loopwerk; lw.ui.select(c); lw.editor.open(c); }, id);
    try { await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor', null, { timeout: 8000 }); } catch { return 'Clip-Editor ging nicht auf'; }
    await wait(page, 1000);
    return null;
  },
  async werkbank(page, ed, dev) {
    if (ed !== 'krachwerk') return 'Werkbank gibt es nur in Krachwerk';
    await ruhe(page);
    const id = await ersterClip(page);
    if (!id) return 'kein Clip im Song';
    await page.evaluate((c) => window.loopwerk.ui.select(c), id);
    if (dev.startsWith('handy')) await page.evaluate(() => window.loopwerk.ui.setDock('werkbank'));
    await wait(page, 1200);
    return null;
  },
  async mixer(page) {
    await ruhe(page);
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await wait(page, 1000);
    if (await page.evaluate(() => window.loopwerk.ui.dock) !== 'mixer') return 'Mixer ging nicht auf';
    return null;
  },
  async mastering(page, ed, dev) {
    await ruhe(page);
    await page.evaluate(() => window.loopwerk.store.setMastering({ on: true, style: 'club' }));
    // Song-Einstellungen: Desktop = Inspektor ohne Auswahl, Handy = Song-Fach
    if (dev.startsWith('handy')) await page.evaluate(() => window.loopwerk.ui.setDock('song'));
    else await page.evaluate(() => window.loopwerk.side?.show('datei', { save: false })); // Layout „reiter“: Song-Abschnitt im Reiter Datei
    await wait(page, 1000);
    const sichtbar = await page.evaluate(() => { const n = [...document.querySelectorAll('#insp-mst, #song-mst')].find((x) => x.getClientRects().length); return !!n && n.getClientRects().length > 0; });
    return sichtbar ? null : 'Mastering liegt hier nicht in Inspektor/Song-Fach (nur im Export-Fach)';
  },
  async export(page) {
    await ruhe(page);
    await page.evaluate(() => window.loopwerk.ui.setDock('export'));
    await wait(page, 1000);
    if (await page.evaluate(() => window.loopwerk.ui.dock) !== 'export') return 'Export-Fach ging nicht auf';
    return null;
  },
  async beat(page) { return erstellen(page, 'beat', 'pattern'); },
  async melodie(page) { return erstellen(page, 'melody', 'pattern'); },
};

async function erstellen(page, karte, dock) {
  await ruhe(page);
  const da = await page.evaluate((k) => { const c = document.querySelector(`.ccard[data-create="${k}"]`); if (c) c.click(); return !!c; }, karte);
  if (!da) return `Karte „${karte}“ unter Erstellen fehlt`;
  try { await page.waitForFunction((d) => window.loopwerk.ui.dock === d, dock, { timeout: 8000 }); } catch { return `Editor „${karte}“ ging nicht auf`; }
  await wait(page, 1200);
  return null;
}

async function main() {
  const o = args();
  fs.mkdirSync(o.out, { recursive: true });
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const geschrieben = [];
  const uebersprungen = [];
  const fehler = [];
  try {
    for (const ed of o.editionen) {
      for (const dev of o.geraete) {
        const ctx = await browser.newContext({ ...dev, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        page.setDefaultTimeout(60000);
        const errs = [];
        page.on('pageerror', (e) => errs.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        const url = ed === 'krachwerk' ? `${base}/werkstatt/` : `${base}/`;
        try {
          await page.goto(url);
          await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 60000 });
          if (ed === 'loopwerk') await page.evaluate(() => window.loopwerk.library.catalogReady);
          await wait(page, 1200);
        } catch (e) {
          fehler.push(`${ed}-${dev.id}: Start fehlgeschlagen (${e.message.split('\n')[0]})`);
          await ctx.close();
          continue;
        }
        let songDa = false;
        for (const sz of ABLAUF.filter((s) => o.szenen.includes(s))) {
          // alle Szenen außer „start“ brauchen den Song, auch wenn „song“ nicht gewählt wurde
          if (sz !== 'start' && !songDa) { songDa = true; try { await SZENE.song(page, ed, dev.id); } catch { /* die Szene meldet es selbst */ } }
          const name = `${ed}-${dev.id}-${sz}`;
          const e0 = errs.length;
          let grund;
          try { grund = await SZENE[sz](page, ed, dev.id); } catch (e) { grund = `Fehler: ${e.message.split('\n')[0]}`; }
          if (grund) { uebersprungen.push(`${name}: ${grund}`); continue; }
          try {
            const file = path.join(o.out, `${name}.png`);
            await page.screenshot({ path: file });
            geschrieben.push({ file, errs: errs.slice(e0) });
          } catch (e) { fehler.push(`${name}: Bild fehlgeschlagen (${e.message.split('\n')[0]})`); }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${geschrieben.length} Bilder in ${o.out}:`);
  for (const g of geschrieben) console.log('  ' + path.basename(g.file) + (g.errs.length ? `   KONSOLENFEHLER: ${g.errs.map((x) => x.slice(0, 160)).join(' | ')}` : ''));
  if (uebersprungen.length) { console.log('\nÜbersprungen:'); for (const u of uebersprungen) console.log('  ' + u); }
  if (fehler.length) { console.log('\nFehler:'); for (const f of fehler) console.log('  ' + f); }
  const mitFehlern = geschrieben.filter((g) => g.errs.length).length;
  if (mitFehlern) console.log(`\n${mitFehlern} Bild(er) mit Konsolenfehlern der Seite.`);
  process.exit(!geschrieben.length || fehler.length ? 1 : 0);
}

// Als Modul (tools/funktionen.cjs): dieselben Szenen ohne Bilder
module.exports = { SZENE, ABLAUF, GERAETE, EDITIONEN, ruhe, ersterClip };
if (require.main === module) main().catch((e) => { console.error('Fehler: ' + e.message); process.exit(1); });
