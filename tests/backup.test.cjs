// Krachwerk Scheibe 3a (Spec docs/specs/krachwerk-3-takes-festhalten.md §5, §7 „3a“; ADR 012): Werkstatt als ZIP sichern
// und zurückholen, Song als ZIP speichern/teilen, Konflikte über ID + CRC, Öffnen mit Rückgängig, Loopwerk ↔ Krachwerk,
// großer Bestand ohne Speicherspitze. Getrennte Browser-Kontexte = getrennte Geräte.
// node tests/backup.test.cjs [--shots] [--quick | --big-only]   (SHOT_DIR=…; --quick ohne, --big-only nur den 200-MB-Lauf)
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker, readZipFile } = require('./harness.cjs');
const { countUi, scene } = require('./count.cjs');

const SHOTS = process.argv.includes('--shots');
const QUICK = process.argv.includes('--quick');
const BIG_ONLY = process.argv.includes('--big-only');
const DIR = process.env.SHOT_DIR || '/tmp';
const DESK = { viewport: { width: 1440, height: 900 }, acceptDownloads: true };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, acceptDownloads: true };
const BIG = { sounds: 40, mb: 5 };
// Speicher v1 legt jede WAV als ArrayBuffer ab: beim Lesen geht sie durch den JS-Speicher, V8 räumt solche Puffer in
// Schritten von etwa 64 MB ab. Grenze hier: höchstens die Hälfte des Bestands (100 MB von 200 MB) – wer alles hielte,
// läge darüber. Die 60 MB aus Spec §7 gelten mit Speicher v2 (Blobs, 3b, tests/storage-v2.test.cjs).
const PEAK_MB = (BIG.sounds * BIG.mb) / 2;
// Ohne Locale gibt Chromium Downloads mit Umlaut („Küchensong.zip“) als „download“ aus
const ENV = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' };

// Läuft im Browser: Testsignale, Datenbank lesen, PCM und Render als Base64-Float32, Einblender mitschreiben
function helpers() {
  const sr = 44100;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }; };
  const buf = (ch, secs, fill) => {
    const b = new AudioBuffer({ numberOfChannels: ch, length: Math.round(secs * sr), sampleRate: sr });
    for (let c = 0; c < ch; c++) fill(b.getChannelData(c), c);
    return b;
  };
  const b64 = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const join = (b) => {
    const out = new Float32Array(b.length * b.numberOfChannels);
    for (let c = 0; c < b.numberOfChannels; c++) out.set(b.getChannelData(c), c * b.length);
    return out;
  };
  const T = {
    sr,
    noise: (seed = 11, amp = 0.4) => buf(2, 1, (d, c) => { const r = rng(seed + c); for (let i = 0; i < d.length; i++) d[i] = amp * r() * Math.exp(-i / (0.3 * sr)); }),
    sine: (hz, secs = 0.8, amp = 0.4) => buf(1, secs, (d) => { for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr) * Math.min(1, i / 200, (d.length - i) / 200); }),
    async idb(name = 'loopwerk-make') {
      const db = await new Promise((res, rej) => { const q = indexedDB.open(name); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      if (!db.objectStoreNames.contains('sounds')) { db.close(); return {}; }
      const recs = await new Promise((res, rej) => { const q = db.transaction('sounds').objectStore('sounds').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      db.close();
      const out = {};
      for (const r of recs) {
        const { wav, ...meta } = r;
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', wav));
        out[r.id] = { meta, sha: [...h].map((b) => b.toString(16).padStart(2, '0')).join(''), bytes: wav.byteLength };
      }
      return out;
    },
    async pcm(ids) {
      const { library } = window.loopwerk;
      const out = {};
      for (const id of ids) { const s = await library.ensure(id); out[id] = s?.orig ? { ch: s.orig.numberOfChannels, len: s.orig.length, data: b64(join(s.orig)) } : null; }
      return out;
    },
    async render(toBeat = 8) {
      const { store, library, renderProject } = window.loopwerk;
      await library.ensureProject(store.project);
      const b = await renderProject(store.project, library, { limiter: false, toBeat });
      const d = join(b);
      let peak = 0;
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      return { data: b64(d), peak };
    },
    flashes: [],
  };
  window.T = T;
  const ui = window.loopwerk.ui;
  const flash = ui.flash;
  ui.flash = (t) => { T.flashes.push(t); return flash.call(ui, t); };
}

// Datensatz im Format der früheren Pad-Wand (mk-…, Felder cls, tags, centroid, sampleRate) in „loopwerk-make“
async function seedMk() {
  const { encodeWav } = await import('/src/wav.js');
  const sr = 44100;
  const n = Math.round(sr * 0.4);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.8 * Math.sin(2 * Math.PI * 60 * i / sr) * Math.exp(-i / 4000);
  const wav = await encodeWav({ numberOfChannels: 1, length: n, sampleRate: sr, getChannelData: () => d }).arrayBuffer();
  const rec = { id: 'mk-bt1', name: 'Bumm 1', tags: ['kurz', 'tief'], cls: 'tief', centroid: 90, source: 'Mikrofon', sampleRate: sr, wav, created: 1 };
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('loopwerk-make', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sounds', { keyPath: 'id' });
    req.onsuccess = () => {
      const t = req.result.transaction('sounds', 'readwrite');
      t.objectStore('sounds').put(rec);
      t.oncomplete = () => { req.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
  localStorage.setItem('loopwerk.make.pads.v1', JSON.stringify({ pads: ['mk-bt1'] }));
}

const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
function maxDiff(x, y) {
  const a = f32(x), b = f32(y);
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

// Gespeicherte ZIP in Node schreiben (für defekte Dateien): [{ name, data: Buffer }], ohne Kompression
function zipNode(files) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const crc = f.crc ?? zlib.crc32(f.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, f.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

// Im Browser: dieselben Einträge mit CompressionStream('deflate-raw') gepackt (Methode 8), als Base64
async function deflateZipInPage(entries) {
  const { crc32 } = await import('/src/zip.js');
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const raw = Uint8Array.from(atob(e.data), (ch) => ch.charCodeAt(0));
    const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const name = enc.encode(e.name);
    const crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 8, true); h.setUint32(14, crc, true);
    h.setUint32(18, packed.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, packed);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, packed.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + packed.length;
  }
  const cdLen = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
  const all = new Uint8Array(await new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer());
  let s = '';
  for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
  return btoa(s);
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-backup-'));
  const browser = await chromium.launch({ env: ENV, args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  async function open(ctx, url = '/werkstatt/', { init, tag = url } = {}) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`); });
    if (init) { await page.goto(`${base}/werkstatt/manifest.webmanifest`); await page.evaluate(init); }
    await page.goto(base + url);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await page.evaluate(helpers);
    return page;
  }
  const lastFlash = (page, re) => page.waitForFunction((src) => window.T.flashes.some((t) => new RegExp(src).test(t)), re.source, { timeout: 30000 })
    .then(() => page.evaluate((src) => window.T.flashes.filter((t) => new RegExp(src).test(t)).pop(), re.source));
  // Sound-Tempo und Rezepte sind angewandt (Kette in main.js mountSoundState), erst dann rendern
  const settle = (page) => page.waitForFunction(() => {
    const { store, library } = window.loopwerk;
    return Object.entries(store.project.sampleTempo || {}).every(([id, b]) => library.get(id)?.kind === 'loop' && library.get(id)?.beats === b);
  }, null, { timeout: 15000 });
  const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(DIR, { recursive: true }); await page.screenshot({ path: path.join(DIR, `${name}.png`) }); } };
  // Am Handy: Deck antippen öffnet das Song-Fach
  const songSheet = async (page) => { await page.tap('#deck-name'); await page.waitForFunction(() => window.loopwerk.ui.dock === 'song'); await page.waitForTimeout(350); };

  // Großer Bestand: 200 MB ohne Speicherspitze (eigener Browser, Speicher-Zähler)
  async function bigTest() {
    const big = await chromium.launch({ env: ENV, args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
    try {
      const cdp = await big.newBrowserCDPSession();
      const rendererRss = async () => {
        const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
        let sum = 0;
        for (const p of processInfo.filter((x) => x.type === 'renderer')) {
          try { sum += parseInt(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${p.id}/status`, 'utf8'))[1], 10) * 1024; } catch { /* beendet */ }
        }
        return sum;
      };
      const watch = () => {
        let max = 0, stop = false;
        const run = (async () => { while (!stop) { max = Math.max(max, await rendererRss()); await new Promise((r) => setTimeout(r, 15)); } })();
        return async () => { stop = true; await run; return max; };
      };
      const heapWatch = (pg) => pg.evaluate(() => { window.gc?.(); window.__heap0 = performance.memory.usedJSHeapSize; window.__heapMax = window.__heap0; window.__heapT = setInterval(() => { window.__heapMax = Math.max(window.__heapMax, performance.memory.usedJSHeapSize); }, 10); });
      const heapDone = (pg) => pg.evaluate(() => { clearInterval(window.__heapT); return (window.__heapMax - window.__heap0) / 1048576; });
      const G = await big.newContext(DESK);
      const pg = await open(G, '/werkstatt/', { tag: 'groß' });
      const seeded = await pg.evaluate(async ({ sounds: n, mb }) => {
        const db = await new Promise((res, rej) => { const q = indexedDB.open('loopwerk-make'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        let total = 0;
        for (let k = 0; k < n; k++) {
          const frames = Math.floor((mb * 1048576 - 44) / 4);
          const buf = new ArrayBuffer(44 + frames * 4);
          const v = new DataView(buf);
          const w = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
          w(0, 'RIFF'); v.setUint32(4, 36 + frames * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
          v.setUint32(24, 44100, true); v.setUint32(28, 44100 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, frames * 4, true);
          const pcm = new Uint32Array(buf, 44, frames);
          let s = 12345 + k;
          for (let i = 0; i < frames; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; pcm[i] = s & 0x0fff0fff; }
          await new Promise((res, rej) => { const t = db.transaction('sounds', 'readwrite'); t.objectStore('sounds').put({ id: `own-gross${k}`, name: `Groß ${k + 1}`, kind: 'oneshot', beats: null, source: 'Test', created: Date.now(), wav: buf }); t.oncomplete = res; t.onerror = () => rej(t.error); });
          total += buf.byteLength;
        }
        db.close();
        return total;
      }, BIG);
      await pg.click('.insp-toggle');
      await pg.waitForTimeout(200);
      // Abbrechen: erneutes Tippen während des Sicherns (Lesen künstlich gebremst, damit das Tippen sicher mitten hinein fällt)
      await pg.evaluate(() => { const own = window.loopwerk.own; own.__read = own.readSound; own.readSound = async (id) => { await new Promise((r) => setTimeout(r, 120)); return own.__read(id); }; });
      await pg.click('#wk-save');
      await pg.waitForFunction(() => document.getElementById('wk-save').getAttribute('aria-busy') === 'true', null, { timeout: 10000 });
      const prog = await pg.evaluate(() => getComputedStyle(document.getElementById('wk-save')).getPropertyValue('--p'));
      await pg.click('#wk-save');
      const ab = await lastFlash(pg, /abgebrochen/);
      const idle = await pg.evaluate(() => { const own = window.loopwerk.own; own.readSound = own.__read; return document.getElementById('wk-save').getAttribute('aria-busy') !== 'true'; });
      check('Sichern abbrechen: erneutes Tippen bricht ab (Fortschritt als Linie am Knopf)', !!ab && idle && prog !== '', `${ab} · --p ${prog}`);
      await pg.waitForTimeout(1500);
      await heapWatch(pg);
      const rss0 = await rendererRss();
      const stopRss = watch();
      const t0 = Date.now();
      const [dlg] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), pg.click('#wk-save')]);
      const bigFile = path.join(tmp, 'gross.zip');
      await dlg.saveAs(bigFile);
      await lastFlash(pg, /Gesichert/);
      const secs = (Date.now() - t0) / 1000;
      const rssPeak = (await stopRss()) - rss0;
      const heap = await heapDone(pg);
      const size = fs.statSync(bigFile).size;
      check(`Großer Bestand sichern (${BIG.sounds} × ${BIG.mb} MB): JS-Speicher und Renderer-Spitze < ${PEAK_MB} MB, ZIP vollständig`,
        heap < PEAK_MB && rssPeak < PEAK_MB * 1048576 && size > seeded && size < seeded + 1048576,
        `Heap +${heap.toFixed(1)} MB, Renderer-Spitze +${(rssPeak / 1048576).toFixed(1)} MB, ${(size / 1048576).toFixed(1)} MB in ${secs.toFixed(1)} s`);
      await G.close();
      const H = await big.newContext(DESK);
      const ph = await open(H, '/werkstatt/', { tag: 'groß-zurück' });
      await ph.waitForTimeout(1000);
      await heapWatch(ph);
      const rss1 = await rendererRss();
      const stop2 = watch();
      const t1 = Date.now();
      await ph.setInputFiles('#open-input', bigFile);
      const mb = await lastFlash(ph, /Zurückgeholt/);
      const secs2 = (Date.now() - t1) / 1000;
      const rssPeak2 = (await stop2()) - rss1;
      const heap2 = await heapDone(ph);
      check(`Großer Bestand zurückholen: JS-Speicher und Renderer-Spitze < ${PEAK_MB} MB, alle Sounds neu`,
        heap2 < PEAK_MB && rssPeak2 < PEAK_MB * 1048576 && new RegExp(`${BIG.sounds} Sounds neu`).test(mb),
        `Heap +${heap2.toFixed(1)} MB, Renderer-Spitze +${(rssPeak2 / 1048576).toFixed(1)} MB in ${secs2.toFixed(1)} s · ${mb}`);
    } finally {
      await big.close();
    }
  }

  // Reine Teile in Node: Konflikt-Plan, Dateinamen, Manifest, remapSampleIds, openSong
  async function pureTest() {
    const A = await import('../src/archive.js');
    const M = await import('../src/model.js');
    let n = 0;
    const here = { 'own-a': { crc: 1, bytes: 10 }, 'own-b': { crc: 2, bytes: 20 }, 'own-c': { bytes: 30 }, 'own-t': { crc: 4, bytes: 40, trashed: true } };
    const plan = A.planImport([
      { id: 'own-new', crc: 9, bytes: 9 }, { id: 'own-a', crc: 1, bytes: 10 }, { id: 'own-b', crc: 7, bytes: 20 },
      { id: 'own-c', crc: 5, bytes: 30 }, { id: 'own-t', crc: 4, bytes: 40 },
    ], (id) => here[id] ?? null, () => `own-x${++n}`);
    check('Plan: neu anlegen, gleich (CRC) überspringen, anders → neue ID, ohne CRC über die Größe, Papierkorb zurücklegen',
      plan.steps.map((s) => `${s.id}:${s.action}${s.to ? '>' + s.to : ''}`).join() === 'own-new:create,own-a:skip,own-b:rename>own-x1,own-c:skip,own-t:untrash' && plan.map.get('own-b') === 'own-x1' && plan.map.size === 1,
      JSON.stringify(plan.steps));
    check('Dateinamen: songs/Kuechensong.json (ASCII), doppelte Namen nummeriert, sounds/<id>.wav', A.songFileName('Küchensong') === 'songs/Kuechensong.json'
      && (() => { const t = new Set(); A.songFileName('Lied', t); return A.songFileName('Lied', t) === 'songs/Lied-2.json'; })() && A.soundFile('mk-1') === 'sounds/mk-1.wav');
    const errs2 = ['{', JSON.stringify({ format: 'anders' }), JSON.stringify({ format: A.ARCHIVE_FORMAT, version: 2 })].map((t) => { try { A.parseManifest(t); return 'ok'; } catch (e) { return e.message; } });
    check('Manifest: kaputt, fremdes Format, neuere Version → Fehler mit Satz', errs2.every((e) => e !== 'ok'), errs2.join(' | '));
    const p = {
      version: 1, tracks: [{ id: 't1', clips: [{ id: 'c1', sampleId: 'own-a', startBeat: 0, lengthBeats: 4 }, { id: 'c9', sampleId: 'own-b', takes: ['own-a', 'own-b'], take: 1, startBeat: 4, lengthBeats: 4 }] }],
      recipes: { 'own-a': { gain: -6 }, 'vr-1': { parent: 'own-a', name: 'a b' } }, sampleTempo: { 'own-a': 2 }, soundKeys: { 'own-a': { key: 'Am' } },
    };
    const q = M.remapSampleIds(p, new Map([['own-a', 'own-z']]));
    check('remapSampleIds: sampleId, takes, recipes-Schlüssel und parent, sampleTempo, soundKeys; Eingabe bleibt unverändert',
      q.tracks[0].clips[0].sampleId === 'own-z' && q.tracks[0].clips[1].takes.join() === 'own-z,own-b' && q.recipes['own-z']?.gain === -6 && q.recipes['vr-1'].parent === 'own-z'
      && q.sampleTempo['own-z'] === 2 && q.soundKeys['own-z']?.key === 'Am' && !q.recipes['own-a'] && p.tracks[0].clips[0].sampleId === 'own-a', JSON.stringify(q));
    check('songSoundIds: Clips, inaktive Takes, Eltern von Varianten, nur eigene', A.songSoundIds({ ...p, tracks: [{ clips: [...p.tracks[0].clips, { id: 'c3', sampleId: 'vr-1' }, { id: 'c4', sampleId: 'drums-four' }] }] }).sort().join() === 'own-a,own-b');
    const st = new M.Store({ version: 1, tracks: [{ id: 't1', clips: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `c${i}`, sampleId: 's', startBeat: i, lengthBeats: 1 })) }] }, { sampleBeats: () => 1 });
    const before = JSON.stringify(st.project);
    st.openSong({ version: 1, tracks: [{ id: 't1', clips: [{ id: 'c2', sampleId: 'x', startBeat: 0, lengthBeats: 1 }] }] });
    const opened = st.project.tracks[0].clips[0].sampleId === 'x' && st.undoStack.length === 1;
    st.undo();
    check('openSong: ein Rückgängig-Schritt, ↶ bringt den vorigen Song, nextId steigt nur (danach c7)', opened && JSON.stringify(st.project) === before && st.newId() === 'c7');
  }

  try {
    await pureTest();
    if (BIG_ONLY) { await bigTest(); throw Object.assign(new Error('nur Großbestand'), { bigOnly: true }); }
    // ---------- Gerät A (Desktop): Stereo, Mono, mk- (Prototyp), Take 2; Song mit Rezept, Variante, Schnitten, Take-Clip ----------
    const A = await browser.newContext(DESK);
    let pa = await open(A, '/werkstatt/', { init: seedMk, tag: 'A' });
    const api = await pa.evaluate(() => ({
      zip: typeof window.loopwerk.own.exportArchive === 'function' && typeof window.loopwerk.own.importArchive === 'function',
      open: typeof window.loopwerk.store.openSong === 'function',
      block: !!document.getElementById('wk-save') && !!document.getElementById('wk-restore'),
    }));
    check('Schnittstelle: own.exportArchive/importArchive, store.openSong, Block „Werkstatt“ (Sichern, Zurückholen)', api.zip && api.open && api.block, JSON.stringify(api));
    if (!api.zip || !api.open || !api.block) throw new Error('Scheibe 3a fehlt noch');
    await pa.evaluate(async () => {
      const { own, store } = window.loopwerk;
      const T = window.T;
      await own.create({ id: 'own-st', name: 'Rauschen', buffer: T.noise() });
      await own.create({ id: 'own-mo', name: 'Gesang · Take 1', buffer: T.sine(330) });
      await own.create({ id: 'own-tk2', name: 'Gesang · Take 2', buffer: T.sine(550) });
      store.setProjectName('Küchensong');
      store.addClip('t1', 'own-st', 0, 2);
      store.setRecipe('own-st', { gain: -6, lp: 2000 });
      store.setSampleTempo('own-st', 2);
      const vr = store.addVariant('mk-bt1');
      store.setRecipe(vr, { reverse: true });
      store.addClip('t1', vr, 4, 2);
      store.addRecordings([{ trackId: 't2', startBeat: 0, lengthBeats: 4, sampleIds: ['own-mo', 'own-tk2'], take: 1 }]);
      store.cutSound('own-st', [{ start: 0, end: 0.5, beat: 0, len: 1 }, { start: 0.5, end: 1, beat: 1, len: 1 }], { place: 'track', trackId: 't2', atBeat: 4 });
    });
    await pa.waitForTimeout(600); // Song im Seiten-Speicher
    await pa.reload();
    await pa.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await pa.evaluate(helpers);
    const reloaded = await settle(pa).then(() => true, () => false);
    check('Neu laden: Sound-Tempo gilt sofort (Sound mit eigenem Tempo ist ein Loop, ohne erst etwas zu ändern)', reloaded);
    const IDS = ['own-st', 'own-mo', 'own-tk2', 'mk-bt1'];
    const a = await pa.evaluate(async (ids) => {
      const T = window.T;
      const r = await T.render(8);
      return { project: window.loopwerk.store.project, idb: await T.idb(), pcm: await T.pcm(ids), render: r };
    }, IDS);
    check('Gerät A: Song klingt (Rezept, Variante, Schnitte, Take-Clip)', a.render.peak > 0.05 && Object.keys(a.project.recipes || {}).length === 4 && a.project.tracks[1].clips.some((c) => c.takes?.length === 2),
      `Spitze ${a.render.peak.toFixed(3)}, ${Object.keys(a.project.recipes || {}).length} Rezepte`);

    // Erinnerung: nur Leuchtpunkt (nicht dauerhaft + seit der letzten Sicherung > 14 Tage mit neuen Sounds), kein Einblender
    const remind = await pa.evaluate(async () => {
      const { backup } = window.loopwerk;
      const app = document.getElementById('app');
      Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false });
      localStorage.setItem('loopwerk.make.lastBackup', JSON.stringify({ at: Date.now() - 20 * 86400e3, bytes: 1, sounds: 1 }));
      const n0 = window.T.flashes.length;
      await backup.refresh();
      const on = app.hasAttribute('data-remind');
      const dot = getComputedStyle(document.querySelector('.insp-toggle'), '::after');
      localStorage.setItem('loopwerk.make.lastBackup', JSON.stringify({ at: Date.now() - 2 * 86400e3, bytes: 1, sounds: 1 }));
      await backup.refresh();
      const recent = app.hasAttribute('data-remind');
      localStorage.setItem('loopwerk.make.lastBackup', JSON.stringify({ at: Date.now() - 20 * 86400e3, bytes: 1, sounds: 1 }));
      Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true });
      await backup.refresh();
      const persisted = app.hasAttribute('data-remind');
      Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false });
      await backup.refresh();
      return { on, dot: [dot.content, dot.width, dot.height], recent, persisted, flashes: window.T.flashes.length - n0 };
    });
    check('Erinnerung: Leuchtpunkt am Werkbank-Streifen bei > 14 Tagen mit neuen Sounds, nicht bei 2 Tagen, nicht bei dauerhaftem Speicher, kein Einblender',
      remind.on && remind.dot[0] !== 'none' && parseFloat(remind.dot[1]) <= 8 && !remind.recent && !remind.persisted && remind.flashes === 0, JSON.stringify(remind));

    // ---------- 1: Sichern (Desktop: Werkbank-Streifen → Sichern = 2 Klicks) ----------
    await pa.click('.insp-toggle');
    await pa.waitForTimeout(300);
    await pa.evaluate(() => document.getElementById('wk-save').scrollIntoView({ block: 'center' }));
    await shot(pa, 'kw-werkstatt-desktop');
    const [dl] = await Promise.all([pa.waitForEvent('download'), pa.click('#wk-save')]);
    const backupFile = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(backupFile);
    const savedMsg = await lastFlash(pa, /Gesichert/);
    await pa.waitForTimeout(400); // Einblender blendet ein
    await shot(pa, 'kw-gesichert-desktop');
    check('Sichern: Dateiname „Krachwerk-Sicherung JJJJ-MM-TT.zip“, Einblender', /^Krachwerk-Sicherung \d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()) && /4 Sounds/.test(savedMsg), `${dl.suggestedFilename()} · ${savedMsg}`);
    const zipBuf = fs.readFileSync(backupFile);
    const entries = readZipFile(zipBuf);
    const names = entries.map((e) => e.name);
    const man = JSON.parse(entries.find((e) => e.name === 'werkstatt.json')?.data.toString('utf8') || '{}');
    const wavs = entries.filter((e) => /^sounds\/.+\.wav$/.test(e.name));
    const songs = entries.filter((e) => /^songs\/.+\.json$/.test(e.name));
    check('ZIP: werkstatt.json, 4 WAV-Dateien, 1 Song, alle CRC stimmen, ohne Kompression', names[0] === 'werkstatt.json' && wavs.length === 4 && songs.length === 1 && entries.length === 6 && entries.every((e) => e.crcOk && e.method === 0),
      names.join(', '));
    const crypto = require('crypto');
    const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
    check('ZIP: WAV-Dateien bitgleich mit dem Speicher („wie gespeichert“)', IDS.every((id) => { const e = entries.find((x) => x.name === `sounds/${id}.wav`); return e && sha(e.data) === a.idb[id].sha; }));
    const mkMeta = man.sounds?.find((s) => s.id === 'mk-bt1');
    check('werkstatt.json: format loopwerk-werkstatt v1, app, created, Sounds mit file/crc, Song current, Pads', man.format === 'loopwerk-werkstatt' && man.version === 1 && man.app === 'Krachwerk' && !!man.created
      && man.sounds?.length === 4 && man.sounds.every((s) => s.file === `sounds/${s.id}.wav` && Number.isInteger(s.crc) && !('wav' in s))
      && man.songs?.length === 1 && man.songs[0].current === true && man.songs[0].name === 'Küchensong' && man.songs[0].file === 'songs/Kuechensong.json' && JSON.stringify(man.pads) === JSON.stringify({ pads: ['mk-bt1'] }),
      JSON.stringify({ ...man, sounds: man.sounds?.map((s) => s.id) }));
    check('werkstatt.json: mk-Datensatz behält die Felder der Pad-Wand (cls, tags, centroid, sampleRate)', mkMeta && mkMeta.cls === 'tief' && mkMeta.centroid === 90 && mkMeta.sampleRate === 44100 && mkMeta.tags?.join() === 'kurz,tief' && mkMeta.created === 1, JSON.stringify(mkMeta));
    const songJson = JSON.parse(songs[0]?.data.toString('utf8') || '{}');
    check('Song-JSON: Projekt Version 1 mit Rezepten und Takes, ohne ownSounds', songJson.version === 1 && !songJson.ownSounds && JSON.stringify(songJson.recipes) === JSON.stringify(a.project.recipes) && JSON.stringify(songJson.tracks) === JSON.stringify(a.project.tracks));
    const lb = await pa.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.make.lastBackup') || 'null'));
    check('Sichern merkt „zuletzt gesichert“ (Zeit, Sounds), danach kein Leuchtpunkt', lb && Date.now() - lb.at < 60000 && lb.sounds === 4 && !(await pa.evaluate(() => document.getElementById('app').hasAttribute('data-remind'))), JSON.stringify(lb));

    // ---------- 5: Song-ZIP enthält genau die benutzten Sounds ----------
    await pa.evaluate(async () => { await window.loopwerk.own.create({ id: 'own-extra', name: 'Unbenutzt', buffer: window.T.sine(990) }); });
    const [dls] = await Promise.all([pa.waitForEvent('download'), pa.evaluate(() => document.getElementById('save-btn').click())]);
    const songFile = path.join(tmp, dls.suggestedFilename());
    await dls.saveAs(songFile);
    const sEntries = readZipFile(fs.readFileSync(songFile));
    const sMan = JSON.parse(sEntries.find((e) => e.name === 'werkstatt.json').data.toString('utf8'));
    const sIds = sMan.sounds.map((s) => s.id).sort();
    check('Song-ZIP „Küchensong.zip“: genau die benutzten Sounds (inaktiver Take, Eltern der Variante), nicht der unbenutzte', dls.suggestedFilename() === 'Küchensong.zip' && sIds.join() === [...IDS].sort().join() && sEntries.filter((e) => e.name.startsWith('sounds/')).length === 4 && sEntries.every((e) => e.crcOk),
      `${dls.suggestedFilename()}: ${sIds.join(', ')}`);
    check('Song-ZIP: ohne Pads, Song als current', sMan.pads == null && sMan.songs.length === 1 && sMan.songs[0].current);

    // ---------- Gerät B (Handy, frisch): Song-Fach → Zurückholen → Datei ----------
    const B = await browser.newContext(PHONE);
    const pb = await open(B, '/werkstatt/', { tag: 'B' });
    await songSheet(pb);
    const tgt = await pb.evaluate(() => ['wk-save', 'wk-restore'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), document.getElementById(id).closest('#song') ? 'Song-Fach' : 'woanders']; }));
    check('Handy: Sichern und Zurückholen im Song-Fach, Tippflächen ≥ 44 px', tgt.every(([w, h, where]) => w >= 44 && h >= 44 && where === 'Song-Fach'), JSON.stringify(tgt));
    await pb.evaluate(() => document.getElementById('wk-save').scrollIntoView({ block: 'center' }));
    await shot(pb, 'kw-werkstatt-handy');
    const [chooser] = await Promise.all([pb.waitForEvent('filechooser'), pb.tap('#wk-restore')]);
    await chooser.setFiles(backupFile);
    const msgB = await lastFlash(pb, /Zurückgeholt/);
    await settle(pb);
    await pb.waitForTimeout(400);
    await shot(pb, 'kw-zurueckgeholt-handy');
    check('Einblender: „Zurückgeholt: 4 Sounds neu, 0 schon da – „Küchensong“ geöffnet. ↶ …“', /4 Sounds neu, 0 schon da/.test(msgB) && /„Küchensong“ geöffnet/.test(msgB) && /↶/.test(msgB), msgB);
    const b = await pb.evaluate(async (ids) => ({ project: window.loopwerk.store.project, idb: await window.T.idb(), pcm: await window.T.pcm(ids), render: await window.T.render(8), pads: localStorage.getItem('loopwerk.make.pads.v1') }), IDS);
    const pcmDiff = Math.max(...IDS.map((id) => (a.pcm[id] && b.pcm[id] && a.pcm[id].ch === b.pcm[id].ch ? maxDiff(a.pcm[id].data, b.pcm[id].data) : Infinity)));
    check('Rundlauf: PCM aller Sounds bitgleich (größte Abweichung 0), Kanäle gleich (Stereo 2, Mono 1)', pcmDiff === 0 && b.pcm['own-st'].ch === 2 && b.pcm['own-mo'].ch === 1, `Abweichung ${pcmDiff}`);
    check('Rundlauf: WAV im Speicher bitgleich, Metadaten gleich (auch mk- mit Pad-Wand-Feldern)', IDS.every((id) => b.idb[id]?.sha === a.idb[id].sha && JSON.stringify(b.idb[id].meta) === JSON.stringify(a.idb[id].meta)),
      JSON.stringify(IDS.map((id) => [id, b.idb[id]?.sha === a.idb[id].sha, JSON.stringify(b.idb[id]?.meta) === JSON.stringify(a.idb[id].meta)])));
    const rDiff = maxDiff(a.render.data, b.render.data);
    check('Rundlauf: Offline-Render des Songs gleich (< 1e-4)', rDiff < 1e-4 && b.render.peak > 0.05, `Abweichung ${rDiff}`);
    check('Rundlauf: recipes, takes, sampleTempo gleich', JSON.stringify(b.project.recipes) === JSON.stringify(a.project.recipes) && JSON.stringify(b.project.tracks.map((t) => t.clips.map((c) => c.takes ?? null)))
      === JSON.stringify(a.project.tracks.map((t) => t.clips.map((c) => c.takes ?? null))) && JSON.stringify(b.project.sampleTempo) === JSON.stringify(a.project.sampleTempo));
    check('Pads: übernommen, weil hier keine standen', b.pads === JSON.stringify({ pads: ['mk-bt1'] }), b.pads);

    // ---------- 2: Konflikt gleich ----------
    await pb.setInputFiles('#open-input', backupFile);
    await pb.waitForFunction(() => window.T.flashes.filter((t) => /Zurückgeholt/.test(t)).length >= 2, null, { timeout: 30000 });
    const msgB2 = await pb.evaluate(() => window.T.flashes.filter((t) => /Zurückgeholt/.test(t)).pop());
    const idb2 = await pb.evaluate(() => window.T.idb());
    check('Konflikt gleich: zweites Zurückholen „0 neu, 4 schon da“, keine doppelten Sätze', /0 Sounds neu, 4 schon da/.test(msgB2) && Object.keys(idb2).length === 4, `${msgB2} · ${Object.keys(idb2).join(',')}`);

    // ---------- 8: Teilen (Handy) ohne Web Share → Download ----------
    await pb.evaluate(() => window.loopwerk.ui.setDock(null));
    await songSheet(pb);
    const [dlb] = await Promise.all([pb.waitForEvent('download'), pb.tap('#save-btn')]);
    check('Teilen ohne Web Share: Download der Song-ZIP', /\.zip$/.test(dlb.suggestedFilename()), dlb.suggestedFilename());

    // ---------- 3 + 4: Konflikt anders, Rückgängig nach dem Öffnen (Gerät C, Desktop) ----------
    const C = await browser.newContext(DESK);
    const pc = await open(C, '/werkstatt/', { tag: 'C' });
    const c0 = await pc.evaluate(async () => {
      const { own, store } = window.loopwerk;
      const T = window.T;
      await own.create({ id: 'own-st', name: 'Anderes Rauschen', buffer: T.noise(99, 0.3) });
      await own.create({ id: 'mk-bt1', name: 'Anderer Bumm', buffer: T.sine(90, 0.4) });
      await own.create({ id: 'own-tk2', name: 'Anderer Take', buffer: T.sine(770) });
      await own.keysReady(); // Tonart-Erkennung schreibt key/keyDone in den Datensatz
      localStorage.setItem('loopwerk.make.pads.v1', JSON.stringify({ pads: ['hier'] }));
      for (let i = 0; i < 6; i++) store.addClip('t1', 'own-st', i * 2, 2);
      await new Promise((r) => setTimeout(r, 50));
      return { before: JSON.stringify(store.project), undo: store.undoStack.length, idb: await T.idb(), pcm: await T.pcm(['own-st', 'mk-bt1', 'own-tk2']) };
    });
    await pc.setInputFiles('#open-input', backupFile);
    const msgC = await lastFlash(pc, /Zurückgeholt/);
    await settle(pc);
    if (SHOTS) { await pc.click('.insp-toggle'); await pc.evaluate(() => document.getElementById('wk-restore').scrollIntoView({ block: 'center' })); await pc.waitForTimeout(400); await shot(pc, 'kw-zurueckgeholt-desktop'); await pc.click('.insp-toggle'); }
    const c1 = await pc.evaluate(async () => {
      const { store } = window.loopwerk;
      const p = store.project;
      const t1 = p.tracks[0].clips, t2 = p.tracks[1].clips;
      const st = t1[0].sampleId;
      const vr = t1[1].sampleId;
      const take = t2.find((c) => c.takes);
      return {
        st, vr, takes: take?.takes, take: take?.take, recipes: p.recipes, tempo: p.sampleTempo, undo: store.undoStack.length,
        cutParents: t2.filter((c) => !c.takes).map((c) => p.recipes[c.sampleId]?.parent),
        render: await window.T.render(8), idb: await window.T.idb(), pads: localStorage.getItem('loopwerk.make.pads.v1'),
      };
    });
    const newSt = c1.st, newMk = c1.recipes?.[c1.vr]?.parent, newTk = c1.takes?.[1];
    check('Konflikt anders: dieselbe ID mit anderem Inhalt → neue own-ID (Stereo, mk-, Take)', /^own-/.test(newSt) && newSt !== 'own-st' && /^own-/.test(newMk) && newMk !== 'mk-bt1' && /^own-/.test(newTk) && newTk !== 'own-tk2', `${newSt} ${newMk} ${newTk}`);
    check('Konflikt anders: Einblender nennt neu, schon da und abweichend', /1 Sound neu, 0 schon da, 3 abweichend/.test(msgC), msgC);
    check('Umgeschrieben: sampleId, takes, recipes-Schlüssel, recipes[vr].parent, Schnitt-Eltern, sampleTempo',
      c1.recipes?.[newSt]?.lp === 2000 && !c1.recipes?.['own-st'] && c1.takes?.[0] === 'own-mo' && c1.take === 1 && c1.cutParents.length === 2 && c1.cutParents.every((x) => x === newSt) && c1.tempo?.[newSt] === 2 && !('own-st' in (c1.tempo || {})),
      JSON.stringify({ tempo: c1.tempo, takes: c1.takes, cut: c1.cutParents, keys: Object.keys(c1.recipes || {}) }));
    const rDiffC = maxDiff(a.render.data, c1.render.data);
    check('Konflikt anders: Render gleich der Quelle (< 1e-4)', rDiffC < 1e-4, `Abweichung ${rDiffC}`);
    const c1pcm = await pc.evaluate(() => window.T.pcm(['own-st', 'mk-bt1', 'own-tk2']));
    check('Konflikt anders: lokale Sounds unverändert (Speicher und PCM)', ['own-st', 'mk-bt1', 'own-tk2'].every((id) => c1.idb[id].sha === c0.idb[id].sha && JSON.stringify(c1.idb[id].meta) === JSON.stringify(c0.idb[id].meta) && maxDiff(c0.pcm[id].data, c1pcm[id].data) === 0)
      && Object.keys(c1.idb).length === 7, Object.keys(c1.idb).join(','));
    check('Pads: nicht übernommen, weil hier welche stehen', c1.pads === JSON.stringify({ pads: ['hier'] }), c1.pads);
    check('Öffnen ist ein Rückgängig-Schritt', c1.undo === c0.undo + 1, `${c0.undo} → ${c1.undo}`);
    const c2 = await pc.evaluate((ids) => {
      const { store, library } = window.loopwerk;
      store.undo();
      const same = JSON.stringify(store.project);
      const sounds = ids.every((id) => library.get(id) && !library.get(id).missing);
      store.addClip('t2', 'own-st', 0, 2);
      const all = store.project.tracks.flatMap((t) => t.clips.map((c) => c.id));
      return { same, sounds, unique: new Set(all).size === all.length, all };
    }, [newSt, newMk, newTk, 'own-mo']);
    check('↶ nach dem Öffnen: Projekt-JSON wie vorher, die Sounds bleiben', c2.same === c0.before && c2.sounds);
    check('Danach Clip einfügen: keine doppelte Clip-ID', c2.unique, c2.all.join(','));

    // ---------- 7: Defekte Dateien → Einblender, nichts angelegt ----------
    const nBefore = Object.keys(await pc.evaluate(() => window.T.idb())).length;
    const projBefore = await pc.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    const noMan = path.join(tmp, 'ohne-manifest.zip');
    fs.writeFileSync(noMan, zipNode(entries.filter((e) => e.name !== 'werkstatt.json').map((e) => ({ name: e.name, data: e.data }))));
    await pc.setInputFiles('#open-input', noMan);
    const m1 = await lastFlash(pc, /werkstatt\.json|keine Sicherung/);
    const bad = Buffer.from(zipBuf);
    const wavAt = zipBuf.indexOf(Buffer.from('sounds/own-tk2.wav')) + 'sounds/own-tk2.wav'.length + 400; // erster Eintrag mit dem Namen = lokaler Kopf
    bad[wavAt] ^= 0x55;
    const badFile = path.join(tmp, 'kaputt.zip');
    fs.writeFileSync(badFile, bad);
    await pc.setInputFiles('#open-input', badFile);
    const m2 = await lastFlash(pc, /beschädigt/);
    const junk = path.join(tmp, 'kein-zip.zip');
    fs.writeFileSync(junk, Buffer.from('PK\u0003\u0004 das ist keine ZIP'));
    await pc.setInputFiles('#open-input', junk);
    const m3 = await lastFlash(pc, /keine ZIP|kein Loopwerk|keine Sicherung/);
    const nAfter = Object.keys(await pc.evaluate(() => window.T.idb())).length;
    const projAfter = await pc.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    check('Defekt: ohne werkstatt.json, falsche CRC, keine ZIP → Einblender, nichts angelegt, Song unverändert', !!m1 && !!m2 && !!m3 && nAfter === nBefore && projAfter === projBefore, `${m1} | ${m2} | ${m3} · ${nBefore} → ${nAfter}`);

    // Gepackte ZIP (deflate, mit CompressionStream erzeugt) geht – frisches Gerät
    const D0 = await browser.newContext(DESK);
    const pd0 = await open(D0, '/werkstatt/', { tag: 'deflate' });
    const packed = await pd0.evaluate(deflateZipInPage, entries.map((e) => ({ name: e.name, data: e.data.toString('base64') })));
    const packedFile = path.join(tmp, 'gepackt.zip');
    fs.writeFileSync(packedFile, Buffer.from(packed, 'base64'));
    const packedMethods = readZipFile(fs.readFileSync(packedFile)).map((e) => e.method);
    await pd0.setInputFiles('#open-input', packedFile);
    const m4 = await lastFlash(pd0, /Zurückgeholt|gepackt/);
    const pdIdb = await pd0.evaluate(() => window.T.idb());
    check('Gepackte ZIP (deflate-raw): zurückgeholt, WAV bitgleich', packedMethods.every((m) => m === 8) && /4 Sounds neu/.test(m4) && IDS.every((id) => pdIdb[id]?.sha === a.idb[id].sha), m4);
    await D0.close();

    // ---------- 6: Loopwerk öffnet die Song-ZIP, Zählbasis exakt; Krachwerk öffnet Loopwerk-JSON ----------
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'count-baseline.json'), 'utf8'));
    const counts = {};
    let pl = null;
    for (const [dev, opts] of [['handy', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['desktop', { viewport: { width: 1400, height: 820 }, acceptDownloads: true }]]) {
      const L = await browser.newContext(opts);
      const pg = await L.newPage();
      pg.on('pageerror', (e) => errs.push(`Loopwerk: ${e.message}`));
      pg.on('console', (m) => { if (m.type() === 'error') errs.push(`Loopwerk: ${m.text()}`); });
      await pg.goto(`${base}/`);
      await pg.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 45000 });
      await pg.evaluate(() => window.loopwerk.library.catalogReady);
      await pg.waitForTimeout(800);
      for (const s of ['start', 'clip']) {
        // einmal nachmessen, falls das Bild noch nicht fertig gezeichnet war (Zeitwackler)
        for (let i = 0; i < 2; i++) { await scene(pg, s); counts[`${dev}-${s}`] = await countUi(pg); if (JSON.stringify(counts[`${dev}-${s}`]) === JSON.stringify(baseline[`${dev}-${s}`])) break; await pg.waitForTimeout(800); }
      }
      if (dev === 'desktop') { pl = pg; await pg.evaluate(helpers); } else await L.close();
    }
    const same = Object.keys(baseline).every((k) => JSON.stringify(baseline[k]) === JSON.stringify(counts[k]));
    check('Loopwerk: Zählbasis exakt (kein Block „Werkstatt“, accept am versteckten Input zählt nicht)', same, JSON.stringify(counts));
    const lwInfo = await pl.evaluate(() => ({ block: !!document.getElementById('wk-save'), accept: document.getElementById('open-input').accept }));
    check('Loopwerk: ohne Block „Werkstatt“, Öffnen nimmt .json und .zip', !lwInfo.block && /\.json/.test(lwInfo.accept) && /\.zip/.test(lwInfo.accept), JSON.stringify(lwInfo));
    await pl.setInputFiles('#open-input', songFile);
    await pl.waitForFunction(() => window.loopwerk.store.project.name === 'Küchensong', null, { timeout: 30000 });
    await settle(pl);
    const lw = await pl.evaluate(async () => {
      const { store, library } = window.loopwerk;
      const clips = store.project.tracks.flatMap((t) => t.clips);
      return { n: clips.length, ok: clips.every((c) => library.get(c.sampleId) && !library.get(c.sampleId).missing), idb: Object.keys(await window.T.idb('loopwerk')), render: await window.T.render(8), undo: store.canUndo };
    });
    const rDiffL = maxDiff(a.render.data, lw.render.data);
    check('Loopwerk öffnet die Krachwerk-Song-ZIP: Clips und Sounds da, Render gleich (< 1e-4), ↶ möglich', lw.n === a.project.tracks.flatMap((t) => t.clips).length && lw.ok && IDS.every((id) => lw.idb.includes(id)) && rDiffL < 1e-4 && lw.undo,
      `${lw.n} Clips, Speicher ${lw.idb.join(',')}, Abweichung ${rDiffL}`);
    const [dlj] = await Promise.all([pl.waitForEvent('download'), pl.evaluate(() => document.getElementById('save-btn').click())]);
    const lwJson = path.join(tmp, dlj.suggestedFilename());
    await dlj.saveAs(lwJson);
    check('Loopwerk speichert weiter JSON', /\.json$/.test(dlj.suggestedFilename()) && JSON.parse(fs.readFileSync(lwJson, 'utf8')).ownSounds?.length === 4, dlj.suggestedFilename());
    const E = await browser.newContext(DESK);
    const pe = await open(E, '/werkstatt/', { tag: 'E' });
    await pe.setInputFiles('#open-input', lwJson);
    await pe.waitForFunction(() => window.loopwerk.store.project.name === 'Küchensong', null, { timeout: 30000 });
    await settle(pe);
    const kwj = await pe.evaluate(async () => {
      const { store, library } = window.loopwerk;
      const clips = store.project.tracks.flatMap((t) => t.clips);
      return { ok: clips.every((c) => library.get(c.sampleId) && !library.get(c.sampleId).missing), render: await window.T.render(8), undo: store.canUndo };
    });
    const rDiffE = maxDiff(a.render.data, kwj.render.data);
    check('Krachwerk öffnet die Loopwerk-JSON: Sounds da, Render gleich (< 1e-4), ↶ möglich', kwj.ok && rDiffE < 1e-4 && kwj.undo, `Abweichung ${rDiffE}`);
    await pl.context().close();
    await E.close();

    // ---------- 8: Teilen mit Web Share (Handy) ----------
    const S = await browser.newContext(PHONE);
    await S.addInitScript(() => {
      navigator.canShare = (d) => !!d?.files?.length;
      navigator.share = async (d) => { window.__shared = d.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); };
    });
    const ps = await open(S, '/werkstatt/', { tag: 'S' });
    await ps.evaluate(async () => {
      const { own, store } = window.loopwerk;
      const s = await own.create({ name: 'Klatsch', buffer: window.T.sine(440, 0.3) });
      store.addClip('t1', s.id, 0, 1);
      store.setProjectName('Teilen');
    });
    await songSheet(ps);
    let shareDl = false;
    ps.on('download', () => { shareDl = true; });
    await ps.tap('#save-btn');
    await ps.waitForFunction(() => window.__shared, null, { timeout: 15000 });
    const shared = await ps.evaluate(() => window.__shared);
    check('Teilen: navigator.share mit einer Datei „Teilen.zip“ (application/zip), kein Download', shared.length === 1 && shared[0].name === 'Teilen.zip' && shared[0].type === 'application/zip' && shared[0].size > 1000 && !shareDl, JSON.stringify(shared));
    await S.close();
    await B.close();
    await C.close();
    await A.close();

    if (!QUICK && !BIG_ONLY) await bigTest();

    check('Keine Konsolenfehler', errs.length === 0, errs.slice(0, 6).join(' | '));
  } catch (err) {
    if (!err.bigOnly) check('Testlauf ohne Ausnahme', false, err.stack || err.message);
    else check('Keine Konsolenfehler', errs.length === 0, errs.slice(0, 6).join(' | '));
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
