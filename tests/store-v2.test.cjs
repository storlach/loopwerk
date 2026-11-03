// Krachwerk Scheibe 3a, Speicher v2 (ADR 011, Spec docs/specs/krachwerk-3-festhalten.md §4, §9 Tests 9–13):
// IndexedDB v2 mit Stores meta/audio, Migration aus v1 in beiden Editionen (Loopwerk „loopwerk“, Krachwerk „loopwerk-make“),
// Audio auf Abruf (Start liest nur meta, Abspielen und Export klingen trotzdem), Doppel-Mono als 1 Kanal, ZIP-Sicherung
// hin und zurück, Füllstand.
// node tests/store-v2.test.cjs
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Läuft im Browser vor dem App-Start: Lesezugriffe auf IndexedDB mitschreiben (Store und Schlüssel)
function spyIdb() {
  window.__idb = [];
  const P = IDBObjectStore.prototype;
  for (const fn of ['get', 'getAll']) {
    const orig = P[fn];
    P[fn] = function (...a) { window.__idb.push({ fn, store: this.name, key: fn === 'get' ? String(a[0]) : null, ready: !!window.loopwerk?.ready }); return orig.apply(this, a); };
  }
}

// Zeitpunkt, an dem die App window.loopwerk setzt (ms seit Navigationsbeginn) – genauer als das Warten von außen
function readyClock() {
  let v;
  Object.defineProperty(window, 'loopwerk', { configurable: true, get: () => v, set: (x) => { v = x; window.__readyAt = performance.now(); } });
}

// v1-Datensätze schreiben: Loopwerk-Format (own-…) bzw. Pad-Wand-Format (mk-…), Stores wie vor ADR 011
async function seedV1({ name, recs, extraFrames = 0 }) {
  const { encodeWav } = await import('/src/wav.js');
  const sr = 44100;
  const out = [];
  for (const r of recs) {
    const n = Math.round(sr * r.secs) + extraFrames;
    const chs = Array.from({ length: r.ch || 2 }, (_, c) => {
      const d = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * (r.hz || 220) * i / sr) * (c ? 0.9 : 1) * Math.exp(-i / (sr * 2));
      return d;
    });
    const wav = await encodeWav({ numberOfChannels: chs.length, length: n, sampleRate: sr, getChannelData: (c) => chs[c] }).arrayBuffer();
    const { secs, hz, ch, ...rest } = r;
    out.push({ ...rest, wav });
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sounds', { keyPath: 'id' });
    req.onsuccess = () => {
      const t = req.result.transaction('sounds', 'readwrite');
      for (const r of out) t.objectStore('sounds').put(r);
      t.oncomplete = () => { req.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
  return out.map((r) => ({ id: r.id, bytes: r.wav.byteLength }));
}

// Stand der Datenbank lesen, ohne sie zu verändern
async function inspect(name) {
  const dbs = await indexedDB.databases();
  const info = dbs.find((d) => d.name === name);
  if (!info) return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const d = req.result;
      const stores = [...d.objectStoreNames];
      const res = { version: d.version, stores, meta: [], audio: [], sounds: [] };
      if (!stores.length) { d.close(); resolve(res); return; }
      const t = d.transaction(stores, 'readonly');
      for (const s of stores) {
        const g = t.objectStore(s).getAll();
        g.onsuccess = () => { res[s] = g.result.map((x) => ({ ...x, wav: x.wav ? x.wav.byteLength : undefined })); };
      }
      t.oncomplete = () => { d.close(); resolve(res); };
    };
    req.onerror = () => resolve({ error: String(req.error) });
  });
}

// Im Browser: Sounds als Clips rendern, Spitze je Clip
async function playsAll(ids) {
  const { library, renderProject } = window.loopwerk;
  const M = await import('/src/model.js');
  const p = M.createEmptyProject({ tracks: 1, bpm: 120 });
  p.lengthBars = Math.max(1, ids.length);
  p.master = { volume: 1 };
  p.tracks[0].volume = 1;
  ids.forEach((id, i) => p.tracks[0].clips.push({ id: 'c' + (i + 1), sampleId: id, startBeat: i * 4, lengthBeats: 2, offsetBeats: 0 }));
  const d = (await renderProject(p, library, { limiter: false })).getChannelData(0);
  return ids.map((_, i) => { let m = 0; const a = i * 4 * 22050; for (let k = a; k < a + 22050; k++) m = Math.max(m, Math.abs(d[k])); return m; });
}

(async () => {
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = (page) => {
    // „erzwungen“: absichtlicher Fehler im Upgrade-Test (9b)
    page.on('pageerror', (e) => { if (!/erzwungen/.test(e.message)) errors.push(e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !/erzwungen/.test(m.text())) errors.push(m.text()); });
    return page;
  };
  const open = async (ctx, path, { seed, init } = {}) => {
    const page = watch(await ctx.newPage());
    if (init) await page.addInitScript(init);
    let seeded = null;
    if (seed) { await page.goto(`${base}/package.json`); seeded = await page.evaluate(seedV1, seed); }
    const t0 = Date.now();
    await page.goto(base + path);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    return { page, seeded, ms: Date.now() - t0 };
  };
  try {
    // ---------- 9. Migration v1 → v2, beide Editionen ----------
    const V1 = [
      { id: 'own-a1', name: 'Eins', kind: 'oneshot', beats: null, source: 'Mikrofon', created: 1, secs: 0.5, hz: 220 },
      { id: 'own-a2', name: 'Zwei', kind: 'loop', beats: 4, source: 'Import: x.wav', created: 2, secs: 2, hz: 330 },
      { id: 'own-a3', name: 'Drei', kind: 'oneshot', beats: null, source: '', created: 3, secs: 1, hz: 440, ch: 1, material: 'stimme' },
    ];
    const MK = [
      { id: 'mk-p1', name: 'Bumm 1', tags: ['kurz', 'tief'], cls: 'tief', centroid: 90, source: 'Mikrofon', sampleRate: 44100, created: 1, secs: 0.4, hz: 60, ch: 1 },
      { id: 'mk-p2', name: 'Ton A4 1', tags: ['lang', 'tonal', 'A4'], cls: 'ton', pitch: 440, source: 'Mikrofon', sampleRate: 44100, created: 2, secs: 0.6, hz: 440, ch: 1 },
      { id: 'mk-p3', name: 'Schleife 1', tags: ['1 takt'], cls: 'loop', bars: 1, bpm: 90, source: 'Festhalten', sampleRate: 44100, created: 3, secs: 60 / 90 * 4, hz: 110, ch: 1 },
    ];
    for (const [label, path, dbName, recs] of [['Loopwerk', '/', 'loopwerk', V1], ['Krachwerk', '/werkstatt/', 'loopwerk-make', [...V1, ...MK]]]) {
      const ctx = await browser.newContext();
      const { page, seeded } = await open(ctx, path, { seed: { name: dbName, recs } });
      const st = await page.evaluate(inspect, dbName);
      const ids = recs.map((r) => r.id);
      const plays = await page.evaluate(playsAll, ids);
      const lib = await page.evaluate((ids) => ids.map((id) => { const s = window.loopwerk.library.get(id); return s && { name: s.name, kind: s.kind, beats: s.beats, from: s.made?.from, cls: s.made?.cls, material: s.material }; }), ids);
      const metaOk = st && st.meta.length === recs.length && st.meta.every((m) => {
        const r = recs.find((x) => x.id === m.id);
        const s = seeded.find((x) => x.id === m.id);
        return r && m.wav === undefined && m.name === r.name && m.bytes === s.bytes && m.channels === (r.ch || 2) && m.sampleRate === 44100 && Math.abs(m.duration - r.secs) < 1e-3
          && (r.tags ? JSON.stringify(m.tags) === JSON.stringify(r.tags) : true) && (r.cls ? m.cls === r.cls : true);
      });
      const audioOk = st && st.audio.length === recs.length && st.audio.every((a) => a.wav === seeded.find((x) => x.id === a.id)?.bytes);
      check(`9 ${label}: Datenbank „${dbName}“ Version 2, Stores meta/audio, „sounds“ weg`, st?.version === 2 && st.stores.sort().join(',') === 'audio,meta', JSON.stringify({ v: st?.version, stores: st?.stores }));
      check(`9 ${label}: alle ${recs.length} Datensätze ohne Verlust (meta mit Länge/Kanälen/Bytes, Audio bytegleich)`, metaOk && audioOk, JSON.stringify(st?.meta?.map((m) => [m.id, m.bytes, m.channels, m.duration])));
      check(`9 ${label}: alle klingen (Spitze > 0,1)`, plays.every((p) => p > 0.1), plays.map((p) => p.toFixed(2)).join(' '));
      if (label === 'Krachwerk') {
        const p3 = lib[ids.indexOf('mk-p3')];
        check('9 Krachwerk: Pad-Wand-Stand (mk-…) lesbar: Schleife als Loop mit 4 Schlägen, Herkunft und Klasse', p3?.kind === 'loop' && p3.beats === 4 && p3.from === 'loop' && lib[ids.indexOf('mk-p1')]?.cls === 'tief', JSON.stringify(lib.slice(3)));
      }
      check(`9 ${label}: Material-Vorschlag bleibt am Datensatz`, lib[2]?.material === 'stimme', JSON.stringify(lib[2]));
      await ctx.close();
    }

    // 9b. Erzwungener Fehler im Upgrade → v1 unverändert, App startet trotzdem; danach klappt die Migration
    {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        if (!sessionStorage.getItem('fail-upgrade')) return;
        const P = IDBObjectStore.prototype;
        const put = P.put;
        P.put = function (...a) { if (this.name === 'audio') throw new Error('erzwungen'); return put.apply(this, a); };
      });
      const pre = watch(await ctx.newPage());
      await pre.goto(`${base}/package.json`);
      await pre.evaluate(() => sessionStorage.setItem('fail-upgrade', '1'));
      const seeded = await pre.evaluate(seedV1, { name: 'loopwerk', recs: V1 });
      await pre.goto(`${base}/`);
      await pre.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      const st = await pre.evaluate(inspect, 'loopwerk');
      const own = await pre.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
      check('9 Fehler im Upgrade: Datenbank bleibt Version 1 mit „sounds“ und allen Datensätzen, App startet', st?.version === 1 && st.stores.join(',') === 'sounds' && st.sounds.length === 3
        && st.sounds.every((r) => r.wav === seeded.find((x) => x.id === r.id).bytes), JSON.stringify({ v: st?.version, stores: st?.stores, n: st?.sounds?.length, own }));
      await pre.evaluate(() => sessionStorage.removeItem('fail-upgrade'));
      await pre.reload();
      await pre.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      const st2 = await pre.evaluate(inspect, 'loopwerk');
      check('9 … danach (ohne Fehler) migriert: Version 2, 3 Einträge', st2?.version === 2 && st2.meta.length === 3 && st2.audio.length === 3, JSON.stringify({ v: st2?.version, n: st2?.meta?.length }));
      await ctx.close();
    }

    // 9c. Ein anderer Tab hält noch eine v1-Verbindung (alter Stand): App startet trotzdem, Einblender, danach kommen die Sounds
    {
      const ctx = await browser.newContext();
      const old = watch(await ctx.newPage());
      await old.goto(`${base}/package.json`);
      await old.evaluate(seedV1, { name: 'loopwerk-make', recs: MK });
      await old.evaluate(() => new Promise((r) => { const q = indexedDB.open('loopwerk-make', 1); q.onsuccess = () => { window.__hold = q.result; r(); }; }));
      const { page } = await open(ctx, '/werkstatt/');
      const b1 = await page.evaluate(() => ({ blocked: window.loopwerk.own.blocked, hint: document.getElementById('hint')?.textContent || '', n: window.loopwerk.library.list().filter((s) => s.category === 'own').length }));
      await old.evaluate(() => window.__hold.close());
      const n2 = await page.waitForFunction(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length === 3, null, { timeout: 10000 }).then(() => 3, () => -1);
      check('9 Anderer Tab mit altem Stand: App startet, Einblender „… in einem anderen Tab offen“, nach dem Schließen 3 Sounds da', b1.blocked && /anderen Tab offen/.test(b1.hint) && b1.n === 0 && n2 === 3, JSON.stringify({ ...b1, n2 }));
      await ctx.close();
    }

    // ---------- 10. Auf Abruf: 50 Sounds à 5 s, Projekt mit 20 davon ----------
    {
      const many = Array.from({ length: 50 }, (_, i) => ({ id: `own-m${String(i).padStart(2, '0')}`, name: `Viel ${i + 1}`, kind: 'oneshot', beats: null, source: 'Mikrofon', created: i, secs: 5, hz: 200 + i * 7 }));
      const used = many.slice(0, 20).map((r) => r.id);
      const ctx = await browser.newContext();
      const first = await open(ctx, '/werkstatt/', { seed: { name: 'loopwerk-make', recs: many } });
      await first.page.close();
      // Startzeit bis „ready“: 50 Sounds (ohne Projekt) gegen 0 Sounds, abwechselnd, je das Minimum
      const ctx0 = await browser.newContext();
      const runs = [], runs0 = [];
      // Je ein Aufwärmlauf (Service Worker, Zwischenspeicher, Aufräumen nach der Migration), dann 5 Läufe
      for (let k = 0; k < 6; k++) {
        for (const [c, list] of [[ctx, k ? runs : []], [ctx0, k ? runs0 : []]]) { const r = await open(c, '/werkstatt/', { init: readyClock }); list.push(Math.round(await r.page.evaluate(() => window.__readyAt))); await r.page.close(); }
      }
      await ctx0.close();
      const dt = Math.min(...runs) - Math.min(...runs0);
      console.log(`   Startzeit 50 Sounds: ${runs.join('/')} ms, 0 Sounds: ${runs0.join('/')} ms, Unterschied ${dt} ms`);
      check('10 Startzeit 50 vs. 0 Sounds: Unterschied < 150 ms', dt < 150, `${dt} ms`);
      // Projekt mit 20 eigenen Sounds speichern, dann neu laden
      const setup = await open(ctx, '/werkstatt/');
      await setup.page.evaluate(async (used) => {
        const { store } = window.loopwerk;
        const M = await import('/src/model.js');
        const p = M.createEmptyProject({ tracks: 4, bpm: 90 });
        p.lengthBars = 64;
        used.forEach((id, i) => p.tracks[i % 4].clips.push({ id: 'c' + (i + 1), sampleId: id, startBeat: Math.floor(i / 4) * 16, lengthBeats: 4, offsetBeats: 0 }));
        store.replace(p);
        localStorage.setItem('loopwerk.make.project.v1', JSON.stringify(p));
      }, used);
      await setup.page.close();
      const { page } = await open(ctx, '/werkstatt/', { init: spyIdb });
      const atReady = await page.evaluate((used) => {
        const { library } = window.loopwerk;
        const reads = window.__idb.filter((x) => !x.ready);
        const unused = library.list().filter((s) => s.category === 'own' && !used.includes(s.id));
        return {
          getAll: reads.filter((x) => x.fn === 'getAll').map((x) => x.store),
          audioReads: reads.filter((x) => x.store === 'audio').map((x) => x.key),
          sounds: reads.filter((x) => x.store === 'sounds').length,
          unusedWithOrig: unused.filter((s) => s.orig).length, unused: unused.length,
        };
      }, used);
      check('10 Start liest nur meta (getAll nur dort), kein Audio der 30 unbenutzten Sounds', atReady.getAll.length >= 1 && atReady.getAll.every((x) => x === 'meta') && atReady.sounds === 0 && atReady.audioReads.every((k) => used.includes(k)),
        JSON.stringify({ getAll: atReady.getAll, audio: atReady.audioReads.length }));
      check('10 Nach „ready“ hat kein unbenutzter Eintrag orig', atReady.unused === 30 && atReady.unusedWithOrig === 0, `${atReady.unusedWithOrig}/${atReady.unused}`);
      // Abspielen und Export klingen (vorher ensure)
      const play = await page.evaluate(async (used) => {
        const { engine, store, library, renderProject } = window.loopwerk;
        await library.ensureProject(store.project);
        const d = (await renderProject(store.project, library, { limiter: false })).getChannelData(0);
        const spb = 60 / 90;
        const peaks = used.map((_, i) => { const a = Math.round(Math.floor(i / 4) * 16 * spb * 44100); let m = 0; for (let k = a; k < a + 22050; k++) m = Math.max(m, Math.abs(d[k])); return m; });
        // Neu benutzter Sound auf Abruf (Lader wartet 300 ms): play() wartet auf ihn, statt still zu starten
        const id = 'own-m45';
        const s = library.get(id);
        const load = s._load;
        s._load = async (x) => { await new Promise((r) => setTimeout(r, 300)); return load(x); };
        const cid = store.addClip(store.project.tracks[0].id, id, 0, 4);
        await engine.play(0);
        const voice = [...engine.voices].some((v) => v.clipId === cid);
        engine.stop();
        return { peaks, voice, reads: window.__idb.filter((x) => x.ready && x.store === 'audio').map((x) => x.key) };
      }, used);
      check('10 Export nach Neuladen: alle 20 Sounds klingen (Spitze > 0,1)', play.peaks.every((p) => p > 0.1), play.peaks.map((p) => p.toFixed(2)).join(' '));
      check('10 Abspielen: Sound auf Abruf ist beim Start eingeplant (play wartet auf ensure)', play.voice, JSON.stringify(play));
      check('10 Erstes Abspielen eines unbenutzten Sounds lädt nur diesen einen', play.reads.filter((k) => !used.includes(k)).join(',') === 'own-m45', play.reads.join(','));
      await page.close();
      await ctx.close();
    }

    // ---------- 11–13: Mono, ZIP, Füllstand ----------
    {
      const ctx = await browser.newContext();
      const { page } = await open(ctx, '/werkstatt/');
      const r11 = await page.evaluate(async () => {
        const { own } = window.loopwerk;
        const sr = 44100;
        const mk = (diff) => {
          const b = new AudioBuffer({ numberOfChannels: 2, length: sr, sampleRate: sr });
          for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < sr; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * (c && diff ? 330 : 220) * i / sr); }
          return b;
        };
        const mono = await own.create({ name: 'Mono', buffer: mk(false) });
        const st = await own.create({ name: 'Stereo', buffer: mk(true) });
        const metas = await own.listMeta();
        const m = metas.find((x) => x.id === mono.id), s = metas.find((x) => x.id === st.id);
        return { mc: m?.channels, sc: s?.channels, ratio: m?.bytes / s?.bytes, libCh: window.loopwerk.library.get(mono.id).orig.numberOfChannels };
      });
      check('11 Doppel-Mono → 1 Kanal gespeichert, bytes halb (± 1 %); Stereo bleibt 2 Kanäle', r11.mc === 1 && r11.sc === 2 && Math.abs(r11.ratio - 0.5) < 0.01, JSON.stringify(r11));

      const r12 = await page.evaluate(async () => {
        const { own, library } = window.loopwerk;
        const B = await import('/src/sound-backup.js');
        const sr = 44100;
        for (const s of await own.listMeta()) await own.remove(s.id);
        const ids = [];
        for (let k = 0; k < 3; k++) {
          const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(sr * 4), sampleRate: sr });
          for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * (200 + 50 * k + c * 3) * i / sr); }
          ids.push((await own.create({ name: `Z${k}`, buffer: b, tags: ['t' + k], from: 'mic' })).id);
        }
        await own.rememberMaterial(ids[0], 'dinge');
        const before = await own.listMeta();
        const wavs = {};
        for (const id of ids) wavs[id] = Array.from(new Uint8Array(await own.readWav(id)));
        const blobs = await B.backupSounds(own);
        // Unbekanntes Feld im sounds.json soll erhalten bleiben
        const { readZip, makeZip } = await import('/src/zip.js');
        const parts = readZip(new Uint8Array(await blobs[0].arrayBuffer()));
        const json = JSON.parse(new TextDecoder().decode(parts.find((p) => p.name === 'sounds.json').data));
        json.sounds[0].zukunft = { x: 1 };
        const patched = makeZip(parts.map((p) => (p.name === 'sounds.json' ? { name: p.name, data: new TextEncoder().encode(JSON.stringify(json)) } : { name: p.name, data: p.data })));
        const names = parts.map((p) => p.name).sort();
        for (const id of ids) await own.remove(id);
        const gone = ids.every((id) => !library.get(id));
        const res1 = await B.restoreSounds(own, [patched]);
        const after = await own.listMeta();
        let bit = true;
        for (const id of ids) { const w = new Uint8Array(await own.readWav(id)); const o = wavs[id]; bit = bit && w.length === o.length && w.every((v, i) => v === o[i]); }
        const strip = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'zukunft').sort()));
        const metaSame = ids.every((id) => after.some((x) => x.id === id) && strip(before.find((x) => x.id === id)) === strip(after.find((x) => x.id === id)));
        const kept = after.find((x) => x.id === json.sounds[0].id)?.zukunft?.x === 1;
        await library.ensure(ids[1]);
        const plays = library.get(ids[1])?.orig?.length === Math.round(sr * 4);
        const res2 = await B.restoreSounds(own, [patched]);
        const small = await B.backupSounds(own, { limit: 1 << 20 });
        const smallOk = [];
        for (const b of small) { const p = readZip(new Uint8Array(await b.arrayBuffer())); smallOk.push(p.every((x) => x.crcOk) && p.some((x) => x.name === 'sounds.json') ? p.filter((x) => x.name.startsWith('sounds/')).length : -1); }
        return { names, gone, res1, res2, bit, metaSame, kept, plays, parts: blobs.length, small: smallOk, fname: B.backupName('Krachwerk', new Date(2026, 10, 3)), fname2: B.backupName('Krachwerk', new Date(2026, 10, 3), 2, 3) };
      });
      check('12 ZIP: sounds.json + sounds/<id>.wav je Sound, ein Teil', r12.parts === 1 && r12.names.length === 4 && r12.names[0] === 'sounds.json' && r12.names.slice(1).every((n) => /^sounds\/own-.+\.wav$/.test(n)), JSON.stringify(r12.names));
      check('12 Zurückholen: gleiche IDs, WAV-Bytes bitgleich, meta gleich, unbekanntes Feld bleibt, klingt', r12.gone && r12.res1.added === 3 && r12.res1.skipped === 0 && r12.bit && r12.metaSame && r12.kept && r12.plays, JSON.stringify(r12));
      check('12 Zweites Zurückholen: added 0, skipped 3', r12.res2.added === 0 && r12.res2.skipped === 3, JSON.stringify(r12.res2));
      check('12 Grenze 1 MB → mehrere Teile, alle lesbar, zusammen 3 Sounds', r12.small.length >= 2 && r12.small.every((n) => n > 0) && r12.small.reduce((a, b) => a + b, 0) === 3, JSON.stringify(r12.small));
      check('12 Dateiname krachwerk-sounds-2026-11-03.zip (Teile: …-teil-2-von-3)', r12.fname === 'krachwerk-sounds-2026-11-03.zip' && r12.fname2 === 'krachwerk-sounds-2026-11-03-teil-2-von-3.zip', `${r12.fname} / ${r12.fname2}`);

      const r13 = await page.evaluate(async () => {
        const { own } = window.loopwerk;
        const u = await own.usage();
        const sum = (await own.listMeta()).reduce((a, m) => a + (m.bytes || 0), 0);
        return { bytes: u.bytes, sum, quota: u.quota };
      });
      check('13 Füllstand: usage().bytes = Summe meta.bytes, Quote bekannt', r13.bytes === r13.sum && r13.sum > 0 && r13.quota > 0, JSON.stringify(r13));

      const sw = require('fs').readFileSync(require('path').join(__dirname, '../src/werkstatt/sw.js'), 'utf8');
      check('Service Worker: Cache „krachwerk-v3“', /const CACHE = 'krachwerk-v3'/.test(sw));
      await ctx.close();
    }
    check('Keine Konsolenfehler', !errors.length, errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
