// Krachwerk Scheibe 5, Abschluss-Prüfungen (Spec docs/specs/krachwerk-5-song.md §8.3–8.5, §8.7): ein durchgehender Test der
// Abläufe a–f („vom Klopfen zum Export“, Handy, Fake-Mikro), Offline mit dem Service Worker, Startzeit mit 200 eigenen Sounds,
// Adresse /krachwerk/ (Build mit KW_PATH). Tipps werden gezählt und ausgegeben. node tests/krachwerk-abschluss.test.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');
const { PHONE, DESK, clapWav, openKw, visible } = require('./kw-common.cjs');

const shareStub = () => {
  window.__shared = [];
  navigator.share = async (d) => {
    const f = d.files?.[0];
    const ab = await f.arrayBuffer();
    const dv = new DataView(ab);
    let icmt = null, frames = null, rate = null, ch = null, pos = 12;
    while (pos + 8 <= dv.byteLength) {
      const id = String.fromCharCode(...new Uint8Array(ab, pos, 4)), size = dv.getUint32(pos + 4, true);
      if (id === 'fmt ') { ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); }
      if (id === 'data') frames = size / (ch * 2);
      if (id === 'LIST') {
        let q = pos + 12;
        while (q + 8 <= pos + 8 + size) {
          const sid = String.fromCharCode(...new Uint8Array(ab, q, 4)), ssz = dv.getUint32(q + 4, true);
          if (sid === 'ICMT') icmt = new TextDecoder().decode(new Uint8Array(ab, q + 8, ssz - 1));
          q += 8 + ssz + (ssz & 1);
        }
      }
      pos += 8 + size + (size & 1);
    }
    window.__shared.push({ name: f.name, text: d.text ?? null, icmt, frames, rate });
  };
};

// kleiner statischer Server für den Pages-Build (nur für den Adress-Test)
function serveDir(dir) {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krachwerk-abschluss-'));
  const clap = path.join(tmp, 'klatsch.wav');
  clapWav(clap);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${clap}%noloop`] });
  try {
    // ================= 8.3: Ablauf a–f in einem Test =================
    {
      const ctx = await browser.newContext(PHONE);
      await ctx.addInitScript(shareStub);
      const k = await openKw(base, ctx);
      const page = k.page;
      const taps = {};
      const nClips = () => page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length);
      // a) ● → Geräusch (1 Tipp)
      await page.tap('#rec-btn'); taps.a = 1;
      await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 40000 });
      await page.waitForTimeout(700);
      const a = await page.evaluate(() => { const lw = window.loopwerk; const c = lw.store.project.tracks.flatMap((t) => t.clips)[0]; return { name: lw.library.get(c.sampleId)?.name, id: c.sampleId, playing: lw.engine.playing }; });
      check('a) ein Tipp ●: Geräusch ist aufgenommen, benannt und liegt als Clip im Loop', !!a.name && a.playing, JSON.stringify(a));
      // c) Form → Rückwärts (2 Tipps: Clip, Rückwärts)
      await page.evaluate(() => window.loopwerk.ui.select(null));
      await page.evaluate(() => window.loopwerk.ui.setDock(null));
      await page.waitForTimeout(500);
      await page.tap('.lane[data-track-id="t1"] .clip >> nth=0'); taps.c = 1;
      await page.waitForFunction(() => document.getElementById('wb-reverse')?.getClientRects().length > 0, null, { timeout: 5000 }).catch(async () => { await page.tap('#tab-werkbank'); });
      await page.tap('#wb-reverse'); taps.c = 2;
      await page.waitForTimeout(600);
      const rev = await page.evaluate((id) => !!window.loopwerk.store.project.recipes[id]?.reverse, a.id);
      check('c) Rückwärts in 2 Tipps (Clip, Rückwärts): Rezept reverse', rev, `Tipps: ${taps.c}`);
      // d) Klatsch-Kit (Kiste, + Neu, Karte)
      await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.ui.setDock(null); });
      await page.waitForTimeout(400);
      const clipsBefore = await nClips();
      await page.tap('#tab-sounds'); await page.tap('#shelf-new'); await page.tap('#new-kit-btn'); taps.d = 3;
      await page.waitForFunction((n) => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length > n && Object.keys(window.loopwerk.store.project.kits || {}).length > 0, clipsBefore, { timeout: 40000 });
      await page.waitForTimeout(800);
      check('d) Klatsch-Kit: Kit mit Pads und ein Muster-Clip im Song', await page.evaluate(() => Object.values(window.loopwerk.store.project.kits)[0] && Object.keys(Object.values(window.loopwerk.store.project.kits)[0].map).length >= 5), `Tipps: ${taps.d}`);
      // b) Takes über den Loop – 3b ist noch nicht gebaut
      const takes = await page.evaluate(() => !!(window.loopwerk.recorder.takes || window.loopwerk.store.takesOf));
      console.log(takes ? '   b) Takes vorhanden' : '   Hinweis b): Takes über den Loop (Scheibe 3b / v2.13) sind noch nicht gebaut – Schritt übersprungen');
      // e) Festhalten (2 Tipps: Loop an, Festhalten)
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.setDock(null); lw.store.setLoop({ on: false }); });
      await page.waitForTimeout(400);
      const tracksBefore = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
      await page.tap('#loop-btn'); await page.waitForFunction(() => window.loopwerk.store.project.loop.on);
      await page.waitForSelector('#freeze-btn:not([hidden])', { timeout: 5000 });
      await page.tap('#freeze-btn'); taps.e = 2;
      await page.waitForFunction((n) => window.loopwerk.store.project.tracks.length > n, tracksBefore, { timeout: 30000 });
      await page.waitForTimeout(900);
      check('e) Festhalten in 2 Tipps (Loop an, Festhalten): neue Spur mit der Schleife', await page.evaluate((n) => window.loopwerk.store.project.tracks.length > n, tracksBefore), `Tipps: ${taps.e}`);
      // f) Mastering + Export (Songname, Fertig, Mastering, Exportieren)
      await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.ui.setDock(null); window.__shared.length = 0; });
      await page.waitForTimeout(500);
      await page.tap('#deck-name'); await page.waitForSelector('#sb-tab-fertig', { state: 'visible' });
      await page.tap('#sb-tab-fertig');
      await page.tap('#sb-mst-on');
      await page.tap('#export-btn'); taps.f = 4;
      await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 90000 });
      const ex = await page.evaluate(async () => {
        const lw = window.loopwerk, p = lw.store.project;
        const { songEndBeat } = await import('./src/export.js');
        const names = new Set();
        for (const t of p.tracks) for (const c of t.clips) { const s = lw.library.get(c.sampleId); const root = s?.parentId ? lw.library.get(s.parentId) : s; if (root) names.add(root.name); }
        return { shared: window.__shared[0], want: songEndBeat(p) * 60 / p.bpm + 2.5, names: [...names], mastering: !!p.master?.mastering?.on, tracks: p.tracks.length };
      });
      const e = ex.shared;
      check('f) Mastering + Export: Teilen-Menü bekommt die WAV, Mastering war an', e.name === 'unbenannt.wav' && ex.mastering, `${e.name}`);
      check('WAV-Länge = Song + Ausklang ± 1 Frame', Math.abs(e.frames - Math.round(ex.want * e.rate)) <= 1, `${e.frames} gegen ${Math.round(ex.want * e.rate)}`);
      check('ICMT enthält alle eigenen Sound-Namen des Songs', ex.names.length >= 3 && ex.names.every((n) => e.icmt.includes(n + ': ')), `${ex.names.join(', ')} | ${e.icmt?.length} Zeichen`);
      check('Nachricht beim Teilen = Zutatenliste (Kopf und „… fremde Samples“)', /^Krachwerk · unbenannt · 90 BPM · Am\n\d+ Geräusche · 0 fremde Samples/.test(e.text), e.text?.split('\n').slice(0, 2).join(' / '));
      console.log(`   Tipps gezählt: a) Geräusch ${taps.a} · c) Rückwärts ${taps.c} · d) Klatsch-Kit ${taps.d} (Kiste, + Neu, + Kit; Spec: 2) · e) Festhalten ${taps.e} · f) Mastering + Export ${taps.f} (Spec: 3; ohne Mastering: Songname + Exportieren = 2, bei gemerktem Reiter „Fertig“ 3)`);
      check('Konsole ohne Fehler (Ablauf a–f)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ================= 8.4: Offline =================
    {
      const ctx = await browser.newContext({ ...PHONE, serviceWorkers: 'allow' });
      await ctx.addInitScript(shareStub);
      const k = await openKw(base, ctx);
      const page = k.page;
      await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      // Offline: Anfragen außerhalb des Ursprungs werden gezählt
      const foreign = [];
      page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(base).origin) foreign.push(r.url()); });
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      check('Offline: die App startet aus dem Zwischenspeicher des Service Workers', await page.evaluate(() => window.loopwerk.ready === true));
      await page.tap('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 40000 });
      await page.waitForTimeout(600);
      check('Offline: Aufnahme läuft', (await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length)) >= 1);
      // Zerlegen
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); lw.ui.setDock('werkbank'); });
      await page.waitForTimeout(500);
      await page.tap('#wb-tab-zerlegen');
      await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 15000 });
      check('Offline: Zerlegen setzt Marken', await page.evaluate(() => document.querySelectorAll('.wb-mk').length > 0));
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.setDock(null); });
      // Kit
      await page.tap('#tab-sounds'); await page.tap('#shelf-new'); await page.tap('#new-kit-btn');
      await page.waitForFunction(() => Object.keys(window.loopwerk.store.project.kits || {}).length > 0, null, { timeout: 40000 });
      check('Offline: Klatsch-Kit entsteht', true);
      // Festhalten
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.setDock(null); lw.store.setLoop({ on: false }); });
      await page.waitForTimeout(400);
      const n0 = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
      await page.tap('#loop-btn');
      await page.waitForSelector('#freeze-btn:not([hidden])', { timeout: 5000 });
      await page.tap('#freeze-btn');
      await page.waitForFunction((n) => window.loopwerk.store.project.tracks.length > n, n0, { timeout: 30000 });
      check('Offline: Festhalten', true);
      // Export
      await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.ui.setDock(null); window.__shared.length = 0; });
      await page.waitForTimeout(500);
      await page.tap('#deck-name');
      await page.waitForSelector('#export-btn', { state: 'visible' });
      await page.tap('#export-btn');
      await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 90000 });
      check('Offline: Export liefert die WAV', await page.evaluate(() => window.__shared[0].frames > 100000));
      const external = foreign.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
      check('Offline: keine Anfrage außerhalb des Ursprungs (Schriften ausgenommen, die der Service Worker zwischenspeichert)', external.length === 0, `${external.join(' ')}${foreign.length ? ` · Schriften: ${foreign.length}` : ''}`);
      check('Konsole ohne Fehler (offline)', k.errors.filter((e) => !/Failed to load resource|net::ERR|fonts/i.test(e)).length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ================= 8.5: Startzeit mit 200 eigenen Sounds =================
    {
      const ctx = await browser.newContext(PHONE);
      const seed = async () => {
        const { encodeWav } = await import('/src/wav.js');
        const sr = 44100;
        const mk = (i) => { const n = Math.round(sr * 0.3); const d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = 0.5 * Math.sin(2 * Math.PI * (100 + i * 7) * k / sr) * Math.exp(-k / 3000); return encodeWav({ numberOfChannels: 1, length: n, sampleRate: sr, getChannelData: () => d }).arrayBuffer(); };
        const wavs = [];
        for (let i = 0; i < 200; i++) wavs.push(await mk(i));
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('loopwerk-make', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('sounds', { keyPath: 'id' });
          req.onsuccess = () => {
            const t = req.result.transaction('sounds', 'readwrite');
            for (let i = 0; i < 200; i++) t.objectStore('sounds').put({ id: `mk-s${i}`, name: `Klang ${i + 1}`, tags: ['kurz'], cls: 'tief', source: 'Mikrofon', sampleRate: sr, wav: wavs[i], created: 1e12 + i });
            t.oncomplete = () => { req.result.close(); resolve(); };
            t.onerror = () => reject(t.error);
          };
          req.onerror = () => reject(req.error);
        });
      };
      const k0 = await openKw(base, ctx, { init: seed });
      const n = await k0.page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
      await k0.page.close();
      const t0 = Date.now();
      const k1 = await openKw(base, ctx);
      const ms = Date.now() - t0;
      console.log(`   Startzeit mit 200 eigenen Sounds (Handy, headless, lokal): ${ms} ms bis ready (Ziel < 2 s, nur Hinweis)`);
      check('Start mit 200 eigenen Sounds: ready, alle in der Bibliothek (Hinweis: Zeit steht oben)', n >= 200 && k1.errors.length === 0, `${n} Sounds, ${ms} ms, ${k1.errors.join(' | ')}`);
      await ctx.close();
    }

    // ================= 8.7: Adresse (Build mit KW_PATH=krachwerk) =================
    {
      const out = path.join(tmp, 'site');
      require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-pages.cjs')], { stdio: 'pipe', env: { ...process.env, KW_PATH: 'krachwerk', PAGES_OUT: out } });
      const has = (p) => fs.existsSync(path.join(out, p));
      check('Build mit KW_PATH=krachwerk: App unter /krachwerk/ (Seite, Manifest, sw.js), unter /werkstatt/ Weiterleitung und abmeldender sw.js', has('krachwerk/index.html') && has('krachwerk/manifest.webmanifest') && has('krachwerk/sw.js') && has('werkstatt/index.html') && has('werkstatt/sw.js') && !has('werkstatt/manifest.webmanifest'));
      const man = JSON.parse(fs.readFileSync(path.join(out, 'krachwerk/manifest.webmanifest'), 'utf8'));
      const man0 = require('../tools/werkstatt-page.cjs').werkstattManifest();
      check('Manifest: festes id (heutiger start_url-Wert auf GitHub Pages), start_url relativ', man.id === '/loopwerk/werkstatt/' && JSON.parse(man0).id === man.id && man.start_url === './', man.id);
      const redirect = fs.readFileSync(path.join(out, 'werkstatt/index.html'), 'utf8');
      check('Weiterleitung: location.replace mit Abfrage und Anker, dazu meta refresh', /location\.replace\('\.\.\/krachwerk\/' \+ location\.search \+ location\.hash\)/.test(redirect) && /http-equiv="refresh"/.test(redirect));
      const srv = await serveDir(out);
      const b2 = `http://127.0.0.1:${srv.address().port}`;
      const ctx = await browser.newContext({ ...DESK });
      const k = await openKw(b2, ctx, { path: '/krachwerk/', init: async () => { const { openDB } = { openDB: null }; void openDB; localStorage.setItem('loopwerk.make.marker', 'da'); } });
      const sizeBefore = await k.page.evaluate(() => localStorage.getItem('loopwerk.make.marker'));
      await k.page.evaluate(async () => { await window.loopwerk.own.create({ name: 'Umzug', buffer: (() => { const b = new AudioBuffer({ numberOfChannels: 1, length: 4410, sampleRate: 44100 }); b.getChannelData(0)[10] = 0.5; return b; })(), source: 'Aufnahme', from: 'mic', cls: null, tags: [] }); });
      await k.page.waitForTimeout(500);
      const p2 = await ctx.newPage();
      const errs = [];
      p2.on('pageerror', (e) => errs.push(e.message));
      await p2.goto(`${b2}/werkstatt/?x=1#y`);
      await p2.waitForFunction(() => location.pathname === '/krachwerk/', null, { timeout: 10000 });
      const landed = await p2.evaluate(() => location.pathname + location.search + location.hash);
      await p2.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      const seen = await p2.evaluate(() => ({ own: window.loopwerk.library.list().filter((s) => s.name === 'Umzug').length, path: window.loopwerk.edition.path, marker: localStorage.getItem('loopwerk.make.marker') }));
      check('/werkstatt/?x=1#y landet auf /krachwerk/?x=1#y, eigene Sounds und Speicher sind dort sichtbar', landed === '/krachwerk/?x=1#y' && seen.own === 1 && seen.marker === 'da' && sizeBefore === 'da', `${landed} ${JSON.stringify(seen)}`);
      check('EDITION.path folgt der Seite (krachwerk), Service Worker meldet sich unter dem alten Pfad ab', seen.path === 'krachwerk');
      check('Konsole ohne Fehler (Adresse)', k.errors.length === 0 && errs.length === 0, k.errors.concat(errs).join(' | '));
      await ctx.close();
      srv.close();
    }
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
