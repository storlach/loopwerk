// Krachwerk Scheibe 1a (Spec docs/specs/krachwerk-1-geruest.md §7): die volle App unter /werkstatt/ als Edition „make“ –
// ohne mitgelieferte Sounds, leerer Song, eigener Speicher, ● → säubern → Clip im Loop, PWA. Loopwerk bleibt unverändert.
// node tests/werkstatt.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');
const { countUi, scene } = require('./count.cjs');

const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1400, height: 820 } };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// Testsignale im Browser: Kick (Abwärtsschwung), Snare-artig (Rauschen um 1,5 kHz), Hi-Hat (helles Rauschen), Ton A4
function signals() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const kick = (n, sr) => {
    const d = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const f = 46 + 119 * Math.exp(-i / (sr * 0.03)); ph += 2 * Math.PI * f / sr; d[i] = Math.sin(ph) * Math.exp(-i / (sr * 0.09)); }
    return d;
  };
  const snare = (n, sr) => {
    const d = new Float32Array(n);
    const r = 0.97, w = 2 * Math.PI * 1500 / sr, a1 = 2 * r * Math.cos(w), a2 = -r * r;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const y = rnd() * 0.08 + a1 * y1 + a2 * y2; y2 = y1; y1 = y; d[i] = y * Math.exp(-i / (sr * 0.06)); }
    return d;
  };
  const hat = (n, sr) => {
    const d = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) { const x = rnd(); d[i] = (x - prev) * 0.5 * Math.exp(-i / (sr * 0.018)); prev = x; }
    return d;
  };
  const tone = (n, sr) => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr) * Math.min(1, i / (sr * 0.005)) * Math.min(1, (n - i) / (sr * 0.05));
    return d;
  };
  const take = (sr, seconds, parts) => {
    const d = new Float32Array(Math.round(sr * seconds));
    for (let i = 0; i < d.length; i++) d[i] = 0.001 * rnd();
    for (const [gen, at, len, gain] of parts) {
      const s = gen(Math.round(sr * len), sr);
      const o = Math.round(sr * at);
      for (let i = 0; i < s.length && o + i < d.length; i++) d[o + i] += gain * s[i];
    }
    return d;
  };
  window.sig = { kick, snare, hat, tone, take };
}

// Fixture fürs Fake-Mikrofon: 1 s Stille, dann ein „Bumm“ (Kick, 0,4 s), dann Stille
function micWav(file) {
  const sr = 48000, n = sr * 5;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    const k = i - sr;
    if (k >= 0 && k < sr * 0.4) { const f = 46 + 119 * Math.exp(-k / (sr * 0.03)); ph += 2 * Math.PI * f / sr; v = 0.3 * Math.sin(ph) * Math.exp(-k / (sr * 0.09)); }
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

async function openKw(base, context, { init } = {}) {
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  if (init) {
    await page.goto(`${base}/werkstatt/manifest.webmanifest`); // gleicher Ursprung, App läuft noch nicht
    await page.evaluate(init);
  }
  const t0 = Date.now();
  await page.goto(`${base}/werkstatt/`);
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
  const startMs = Date.now() - t0;
  await page.evaluate(signals);
  return { page, errors, requests, startMs };
}

// Datensätze im Format der früheren Pad-Wand (src/werkstatt/bank.js) in „loopwerk-make“ schreiben
async function seedPadWall() {
  const { encodeWav } = await import('/src/wav.js');
  const sr = 44100;
  const mk = (fill, secs) => {
    const n = Math.round(sr * secs);
    const d = new Float32Array(n);
    fill(d);
    const wav = encodeWav({ numberOfChannels: 1, length: n, sampleRate: sr, getChannelData: () => d });
    return wav.arrayBuffer();
  };
  const bumm = await mk((d) => { for (let i = 0; i < d.length; i++) d[i] = 0.8 * Math.sin(2 * Math.PI * 60 * i / sr) * Math.exp(-i / 4000); }, 0.4);
  const ton = await mk((d) => { for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr); }, 0.6);
  const loop = await mk((d) => { for (let b = 0; b < 4; b++) for (let i = 0; i < 3000; i++) d[Math.round(b * sr * 2 / 3) + i] = 0.7 * Math.exp(-i / 500) * Math.sin(i / 3); }, (60 / 90) * 4);
  const recs = [
    { id: 'mk-test1', name: 'Bumm 1', tags: ['kurz', 'tief'], cls: 'tief', centroid: 90, source: 'Mikrofon', sampleRate: sr, wav: bumm, created: 1 },
    { id: 'mk-test2', name: 'Ton A4 1', tags: ['lang', 'tonal', 'A4'], cls: 'ton', pitch: 440, source: 'Mikrofon', sampleRate: sr, wav: ton, created: 2 },
    { id: 'mk-test3', name: 'Schleife 1', tags: ['1 takt'], cls: 'loop', bars: 1, bpm: 90, source: 'Festhalten', sampleRate: sr, wav: loop, created: 3 },
  ];
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('loopwerk-make', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sounds', { keyPath: 'id' });
    req.onsuccess = () => {
      const t = req.result.transaction('sounds', 'readwrite');
      for (const r of recs) t.objectStore('sounds').put(r);
      t.oncomplete = () => { req.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krachwerk-'));
  const wav = path.join(tmp, 'bumm.wav');
  micWav(wav);
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`],
  });
  try {
    // ---------- 1–3: Start, Anfragen, Flächen ----------
    const C = await browser.newContext({ ...PHONE, acceptDownloads: true });
    await C.addInitScript(() => {
      window.__persist = 0;
      if (navigator.storage) { navigator.storage.persist = async () => { window.__persist++; return true; }; navigator.storage.persisted = async () => false; }
    });
    const A = await openKw(base, C, { init: seedPadWall });
    const { page } = A;
    const s1 = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const { sampledInstruments } = await import('./src/sampler.js');
      return {
        ed: lw.edition.id, title: document.title, mark: document.querySelector('.brand-name')?.textContent,
        tracks: lw.store.project.tracks.length, bpm: lw.store.project.bpm, clips: lw.store.project.tracks.flatMap((t) => t.clips).length,
        foreign: lw.library.list().filter((s) => s.category !== 'own' && !String(s.id).startsWith('pat-')).length,
        inst: sampledInstruments().length,
        kits: [...document.querySelectorAll('#pat-kit option')].map((o) => o.value).join(','),
        scroll: document.documentElement.scrollWidth - innerWidth,
        dataEd: document.getElementById('app').dataset.edition,
      };
    });
    check('Start: Edition „make“, Titel und Marke „Krachwerk“', s1.ed === 'make' && /Krachwerk$/.test(s1.title) && s1.mark === 'Krachwerk' && s1.dataEd === 'make', `${s1.title} / ${s1.mark}`);
    check('Start: leerer Song mit 2 Spuren, 90 BPM', s1.tracks === 2 && s1.bpm === 90 && s1.clips === 0, `${s1.tracks} Spuren, ${s1.bpm} BPM, ${s1.clips} Clips`);
    check('Bibliothek: nur eigene Sounds, keine Sampler-Instrumente', s1.foreign === 0 && s1.inst === 0, `${s1.foreign} fremde, ${s1.inst} Instrumente`);
    check('Beat-Kits: nur die Synth-Kits elektro und techno', s1.kits === 'elektro,techno', s1.kits);
    check('Handy: kein seitliches Scrollen', s1.scroll <= 0);
    const assets = A.requests.filter((p) => /\/assets\//.test(p) && !/\/assets\/icons\//.test(p));
    const proto = A.requests.filter((p) => /\/src\/werkstatt\//.test(p));
    check('Keine mitgelieferten Samples geladen (unter assets/ nur Icons)', assets.length === 0, assets.slice(0, 3).join(', '));
    check('Kein Code der alten Pad-Wand geladen', proto.length === 0, proto.join(', '));
    console.log(`   Startzeit bis „ready“ (Handy, lokal): ${A.startMs} ms`);
    const surf = await page.evaluate(() => {
      const sel = ['#starter', '.ccard[data-create="accomp"]', '#pat-continue', '.sing-desc-field', '#sing-sound', '[data-link-open]', '.ccard[data-create="link"]', '#link-pop', '#tab-capture', '.shelf-sort', '.shelf-credit', '#pop-about', '#demo-btn', '#tips-reset', '#shelf-filter-btn', '#shelf-chips'];
      const off = sel.filter((q) => { const n = document.querySelector(q); return n && n.hasAttribute('data-off') && getComputedStyle(n).display === 'none'; });
      const keep = ['#import-btn', '.ccard[data-create="beat"]', '.ccard[data-create="melody"]', '.ccard[data-create="sing"]', '#rec-btn'].filter((q) => document.querySelector(q) && !document.querySelector(q).closest('[data-off]'));
      return { off: off.length, all: sel.length, missing: sel.filter((q) => !off.includes(q)), keep: keep.length };
    });
    check('Flächen aus: Song-Starter, Begleitung, KI, Link/Tab, Katalog, Beispiel, Tipps', surf.off === surf.all, surf.missing.join(', '));
    check('Flächen da: Import, Beat, Melodie, Einsingen, Aufnahme', surf.keep === 5, `${surf.keep}/5`);

    // ---------- 4: Klänge aus der Pad-Wand ----------
    const mig = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const ids = ['mk-test1', 'mk-test2', 'mk-test3'];
      const got = ids.map((id) => lw.library.get(id));
      const loop = got[2];
      lw.store.addClip(lw.store.project.tracks[0].id, 'mk-test1', 0, 4);
      await lw.library.ensureProject(lw.store.project);
      const buf = await lw.renderProject(lw.store.project, lw.library, { fromBeat: 0, toBeat: 4, limiter: false });
      const d = buf.getChannelData(0);
      let peak = 0, at = 0;
      for (let i = 0; i < Math.round(buf.sampleRate * 0.05); i++) if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); at = i; }
      return { all: got.every((s) => s && s.category === 'own'), names: got.map((s) => s?.name).join(','), loopKind: loop?.kind, loopBeats: loop?.beats, from: got.map((s) => s?.made?.from).join(','), peak, atMs: at / buf.sampleRate * 1000 };
    });
    check('Pad-Wand-Klänge stehen unter „Eigene“ (gleiche Datenbank, keine Kopie)', mig.all, mig.names);
    check('Schleife aus der Pad-Wand: Loop mit 4 Schlägen, Herkunft gelesen', mig.loopKind === 'loop' && mig.loopBeats === 4 && mig.from === 'mic,mic,loop', `${mig.loopKind}, ${mig.loopBeats}, ${mig.from}`);
    check('Pad-Wand-Klang als Clip klingt am Clipanfang', mig.peak > 0.1, `Spitze ${mig.peak.toFixed(2)} bei ${mig.atMs.toFixed(1)} ms`);
    await page.evaluate(() => window.loopwerk.store.undo());

    // ---------- 5: ● → säubern → Clip im Loop ----------
    await page.tap('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 8000 });
    let playedDuring = false;
    const poll = setInterval(async () => { try { if (await page.evaluate(() => window.loopwerk.recorder.state === 'recording' && window.loopwerk.engine.playing)) playedDuring = true; } catch { /* Seite beschäftigt */ } }, 150);
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 15000 });
    clearInterval(poll);
    check('Aufnahme ohne Vorzähler: Song läuft während der Aufnahme nicht', !playedDuring);
    const rec = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const t = lw.store.project.tracks.find((x) => x.clips.length);
      const clip = t.clips[0];
      const s = lw.library.get(clip.sampleId);
      const o = s.orig;
      const d = o.getChannelData(0);
      let peak = 0;
      for (let c = 0; c < o.numberOfChannels; c++) for (const v of o.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
      let first = 0;
      while (first < d.length && Math.abs(d[first]) < 0.05) first++;
      return {
        name: s.name, ch: o.numberOfChannels, peak, firstMs: first / o.sampleRate * 1000, cleanMs: lw.recorder.cleanMs, cls: s.made?.cls, from: s.made?.from,
        track: t.id, start: clip.startBeat, len: clip.lengthBeats, loop: { ...lw.store.project.loop }, playing: lw.engine.playing, selected: lw.ui.selectedClipId === clip.id,
      };
    });
    check('Aufgenommen und benannt: „Bumm …“, Herkunft Mikrofon', /^Bumm \d+$/.test(rec.name) && rec.cls === 'tief' && rec.from === 'mic', `${rec.name} (${rec.cls}, ${rec.from})`);
    check('Gesäubert: mono, Klang ab ≤ 10 ms, Pegel −1 dB', rec.ch === 1 && rec.firstMs <= 10 && Math.abs(rec.peak - 0.89) < 0.02, `${rec.ch} Kanal, ${rec.firstMs.toFixed(1)} ms, Spitze ${rec.peak.toFixed(3)}`);
    check('Säubern dauert < 300 ms', rec.cleanMs < 300, `${rec.cleanMs?.toFixed(0)} ms`);
    check('Clip auf Spur 1 ab Schlag 0, ein Takt, Loop darum, spielt, gewählt', rec.track === 't1' && rec.start === 0 && rec.len === 4 && rec.loop.on && rec.loop.startBeat === 0 && rec.loop.endBeat === 4 && rec.playing && rec.selected, JSON.stringify(rec.loop));
    const onsets = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const { detectOnsets } = await import('./src/dsp/slice.js');
      const buf = await lw.renderProject(lw.store.project, lw.library, { fromBeat: 0, toBeat: 4, limiter: false });
      return detectOnsets(buf.getChannelData(0), buf.sampleRate).map((f) => f / buf.sampleRate);
    });
    const spb = 60 / 90;
    // Säubern lässt 2 ms vor dem Anschlag stehen (gegen Klicks): alle Anschläge gleich spät, Abstände genau ein Schlag
    const lead = onsets[0] * 1000;
    const gapErr = onsets.length === 4 ? Math.max(...onsets.slice(1).map((t, k) => Math.abs(t - onsets[k] - spb) * 1000)) : Infinity;
    check('Im Loop: 4 Anschläge pro Takt, Abstand genau ein Schlag (± 1 ms), erster ≤ 5 ms nach dem Takt', gapErr <= 1 && lead >= 0 && lead <= 5, `${onsets.length} Anschläge, Abstand max ± ${gapErr.toFixed(2)} ms, erster ${lead.toFixed(2)} ms`);
    if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-clip-handy.png') });
    const undo = await page.evaluate(() => {
      const lw = window.loopwerk;
      lw.engine.stop();
      lw.store.undo();
      const r = { clips: lw.store.project.tracks.flatMap((t) => t.clips).length, loop: lw.store.project.loop.on };
      lw.store.redo();
      return r;
    });
    check('Ein Rückgängig entfernt Clip und Loop zusammen', undo.clips === 0 && !undo.loop, JSON.stringify(undo));
    const silent = await page.evaluate(async () => {
      try { await window.loopwerk.recorder._finishSound([new Float32Array(48000), new Float32Array(48000)], 48000); return 'kein Fehler'; } catch (e) { return `${e.code}: ${e.message}`; }
    });
    check('Stille → „Nichts gehört“, kein neuer Sound', /^silent: Nichts gehört/.test(silent), silent);
    const kept = await page.evaluate(() => ({ calls: window.__persist }));
    check('Dauerhafter Speicher angefragt', kept.calls >= 1, `${kept.calls}×`);

    // ---------- 6: DSP (src/dsp/clean.js, slice.js) ----------
    const clean = await page.evaluate(async () => {
      const { cleanTake, features, classify, describe } = await import('./src/dsp/clean.js');
      const sr = 48000;
      const raw = window.sig.take(sr, 2, [[window.sig.snare, 0.731, 0.3, 0.3]]);
      const c = cleanTake([raw, raw.slice()], sr);
      let peak = 0;
      for (const v of c.chs[0]) peak = Math.max(peak, Math.abs(v));
      const out = {};
      for (const [k, gen, len] of [['kick', window.sig.kick, 0.4], ['snare', window.sig.snare, 0.3], ['hat', window.sig.hat, 0.15], ['tone', window.sig.tone, 0.6]]) {
        const r = window.sig.take(sr, 1.2, [[gen, 0.2, len, 0.5]]);
        const cc = cleanTake([r], sr);
        const f = features(cc.chs[0], sr);
        out[k] = { cls: classify(f), ...describe(f, classify(f), ['Bumm 1']) };
      }
      return { lead: (Math.round(sr * 0.731) - c.start) / 48, len: c.chs[0].length / sr, peak, ch: c.chs.length, silent: cleanTake([window.sig.take(sr, 1, [])], sr), out };
    });
    check('Säubern: Start 0–5 ms vor dem Anschlag, Stille hinten weg, −1 dB, mono', clean.lead >= 0 && clean.lead <= 5 && clean.len < 0.45 && Math.abs(clean.peak - 0.89) < 0.01 && clean.ch === 1 && clean.silent === null, `${clean.lead.toFixed(2)} ms, ${clean.len.toFixed(3)} s`);
    check('Einordnen: Kick tief, 1,5-kHz-Rauschen mittel, Rauschen hell, 440 Hz Ton A4', clean.out.kick.cls === 'tief' && clean.out.snare.cls === 'mittel' && clean.out.hat.cls === 'hell' && clean.out.tone.cls === 'ton' && clean.out.tone.name === 'Ton A4 1', Object.values(clean.out).map((o) => o.name).join(', '));
    check('Benennen: eindeutig (Bumm 1 vergeben → Bumm 2)', clean.out.kick.name === 'Bumm 2');
    const on = await page.evaluate(async () => {
      const { detectOnsets } = await import('./src/dsp/slice.js');
      const sr = 48000;
      const gens = [window.sig.kick, window.sig.snare, window.sig.hat];
      const at = [0.25, 0.61, 0.9, 1.33, 1.58, 2.02, 2.31, 2.77];
      const raw = window.sig.take(sr, 3.3, at.map((t, k) => [gens[k % 3], t, 0.25, k % 2 ? 0.25 : 0.6]));
      return { found: detectOnsets(raw, sr).map((f) => f / sr), at };
    });
    const oErr = on.found.length === 8 ? Math.max(...on.at.map((t, k) => Math.abs(on.found[k] - t) * 1000)) : Infinity;
    check('Anschläge: 8 Schläge laut und leise → 8, je ± 5 ms', oErr <= 5, `${on.found.length}, max ${oErr.toFixed(2)} ms`);

    // ---------- 7: Speicher ----------
    await page.waitForTimeout(500);
    const page2 = await C.newPage();
    await page2.goto(`${base}/werkstatt/`);
    await page2.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const st = await page2.evaluate(async () => {
      const lw = window.loopwerk;
      const c = lw.store.project.tracks.flatMap((t) => t.clips)[0];
      return { clip: !!c, sound: !!(c && lw.library.get(c.sampleId) && !lw.library.get(c.sampleId).missing), dbs: (await indexedDB.databases()).map((d) => d.name), keys: Object.keys(localStorage) };
    });
    check('Neu laden: Clip und Sound sind wieder da', st.clip && st.sound);
    check('Eigener Speicher: IndexedDB „loopwerk-make“, nicht „loopwerk“', st.dbs.includes('loopwerk-make') && !st.dbs.includes('loopwerk'), st.dbs.join(','));
    check('Alle Speicher-Schlüssel beginnen mit „loopwerk.make.“', st.keys.length > 0 && st.keys.every((k) => k.startsWith('loopwerk.make.')), st.keys.join(','));
    await page2.close();

    // ---------- 8: Datei hin und zurück ----------
    await page.evaluate(() => { const lw = window.loopwerk; lw.store.addClip('t2', 'mk-test3', 4, 8); });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const kwFile = path.join(tmp, 'krachwerk.json');
    await dl.saveAs(kwFile);
    const kw = JSON.parse(fs.readFileSync(kwFile, 'utf8'));
    const embedded = kw.ownSounds.map((o) => o.id);
    check('Krachwerk speichert Loopwerk-Format mit eigenen Sounds (own- und mk-)', kw.version === 1 && embedded.some((i) => i.startsWith('own-')) && embedded.includes('mk-test3'), embedded.join(','));
    const LW = await browser.newContext(DESK);
    const lp = await LW.newPage();
    const lErrors = [];
    lp.on('pageerror', (e) => lErrors.push(e.message));
    await lp.goto(`${base}/`);
    await lp.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await lp.setInputFiles('#open-input', kwFile);
    await lp.waitForFunction((n) => window.loopwerk.store.project.name === n, kw.name, { timeout: 10000 });
    const inLw = await lp.evaluate((ids) => ({ clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length, sounds: ids.every((id) => window.loopwerk.library.get(id) && !window.loopwerk.library.get(id).missing) }), embedded);
    check('Loopwerk öffnet die Krachwerk-Datei: Clips und Sounds da', inLw.clips === 2 && inLw.sounds, JSON.stringify(inLw));
    // Loopwerk-Beispiel in Krachwerk
    await lp.evaluate(() => document.getElementById('demo-btn').click());
    await lp.evaluate(() => document.getElementById('demo-btn').click());
    await lp.waitForFunction(() => window.loopwerk.store.project.name === 'Beispiel-Arrangement');
    const [dl2] = await Promise.all([lp.waitForEvent('download'), lp.evaluate(() => document.getElementById('save-btn').click())]);
    const lwFile = path.join(tmp, 'loopwerk.json');
    await dl2.saveAs(lwFile);
    const demo = JSON.parse(fs.readFileSync(lwFile, 'utf8'));
    const demoClips = demo.tracks.flatMap((t) => t.clips).map((c) => c.sampleId);
    check('Loopwerk: keine Programmfehler', lErrors.length === 0, lErrors.join(' | '));
    await LW.close();
    await page.setInputFiles('#open-input', lwFile);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Beispiel-Arrangement', null, { timeout: 10000 });
    const inKw = await page.evaluate(() => {
      const lw = window.loopwerk;
      const clips = lw.store.project.tracks.flatMap((t) => t.clips);
      return { n: clips.length, missing: clips.filter((c) => lw.library.get(c.sampleId)?.missing).length };
    });
    check('Loopwerk-Datei in Krachwerk: alle Clips bleiben, stumm als „Sound fehlt“', inKw.n === demoClips.length && inKw.missing === demoClips.length, `${inKw.n}/${demoClips.length}, stumm ${inKw.missing}`);
    const [dl3] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const back = JSON.parse(fs.readFileSync(await dl3.path(), 'utf8'));
    check('Wieder gespeichert: alle Sound-Kennungen erhalten (klingen in Loopwerk wieder)', JSON.stringify(back.tracks.flatMap((t) => t.clips).map((c) => c.sampleId)) === JSON.stringify(demoClips));

    // ---------- 9: PWA ----------
    const man = await page.evaluate(async () => {
      const link = document.querySelector('head link[rel="manifest"]');
      const res = await fetch(link.href);
      const m = await res.json();
      const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, link.href))).status));
      const heads = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href'));
      return { m, icons, start: new URL(m.start_url, link.href).pathname, scope: new URL(m.scope, link.href).pathname, heads };
    });
    check('Manifest: Krachwerk, Vollbild, Bereich /werkstatt/, Icons erreichbar', man.m.name === 'Krachwerk' && man.m.display === 'standalone' && man.start === '/werkstatt/' && man.scope === '/werkstatt/' && man.icons.every((x) => x === 200), man.icons.join(','));
    check('Eigenes Icon (nicht das von Loopwerk)', man.heads.length >= 3 && man.heads.every((h) => /krachwerk/.test(h)), man.heads.join(', '));
    const reg = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    check('Service Worker aktiv, nur für /werkstatt/', reg === `${base}/werkstatt/`, reg);
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready && navigator.serviceWorker.controller, null, { timeout: 30000 });
    await C.setOffline(true);
    await page.reload();
    const off = await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 }).then(() => true, () => false);
    const offOwn = off && await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own' && !s.missing).length);
    check('Ohne Netz: Krachwerk startet aus dem Zwischenspeicher, eigene Sounds da', off && offOwn >= 4, String(offOwn));
    await C.setOffline(false);
    check('Krachwerk: keine Konsolenfehler', A.errors.length === 0, A.errors.join(' | '));
    await C.close();

    const I = await browser.newContext({ ...PHONE, userAgent: IPHONE_UA });
    const ip = await openKw(base, I);
    const tip1 = await ip.page.evaluate(() => { window.loopwerk.pwa.tip(); return document.getElementById('hint-text').textContent; });
    await ip.page.evaluate(() => { document.getElementById('hint-text').textContent = ''; window.loopwerk.pwa.tip(); });
    const tip2 = await ip.page.evaluate(() => document.getElementById('hint-text').textContent);
    check('iPhone im Browser: einmal der Tipp „Zum Home-Bildschirm“', /Home-Bildschirm/.test(tip1) && !/Home-Bildschirm/.test(tip2), tip1);
    await I.close();

    // ---------- 12: Zählen (Budgets 1a) und Bilder ----------
    const counts = {};
    for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
      const ctx = await browser.newContext(opts);
      const k = await openKw(base, ctx);
      await k.page.waitForTimeout(600);
      for (const s of ['start', 'clip']) {
        if (s === 'clip') await k.page.evaluate(async () => {
          const lw = window.loopwerk;
          const sr = 44100, d = new Float32Array(sr / 2);
          for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 20) * Math.exp(-i / 3000);
          const b = new AudioBuffer({ numberOfChannels: 1, length: d.length, sampleRate: sr });
          b.copyToChannel(d, 0);
          const smp = await lw.own.create({ name: 'Bumm 1', buffer: b, source: 'Aufnahme', from: 'mic' });
          lw.store.addClip('t1', smp.id, 0, 4);
        });
        await scene(k.page, s);
        counts[`${dev}-${s}`] = await countUi(k.page);
        if (SHOTS) await k.page.screenshot({ path: path.join(DIR, `kw-${s}-${dev}.png`) });
      }
      await ctx.close();
    }
    console.table(counts);
    const dc = counts['desktop-clip'], hc = counts['handy-clip'];
    check('Zählung 1a Desktop (Clip gewählt): ≤ 85 Bedienelemente, ≤ 95 Rahmen', dc.controls <= 85 && dc.frames <= 95, `${dc.controls} / ${dc.frames}`);
    check('Zählung 1a Handy (Clip gewählt): ≤ 38 Bedienelemente, ≤ 50 Rahmen', hc.controls <= 38 && hc.frames <= 50, `${hc.controls} / ${hc.frames}`);

    // ---------- 10: Pages-Build ----------
    require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-pages.cjs')], { stdio: 'pipe' });
    const site = path.join(__dirname, '..', '_site', 'werkstatt');
    const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
    check('Pages-Build: /werkstatt/ ist die volle App mit Edition „make“', html.includes("LOOPWERK_EDITION = 'make'") && html.includes('src/main.js') && html.includes('Krach<b>werk</b>') && !html.includes('src/werkstatt/main.js') && fs.existsSync(path.join(site, 'sw.js')) && fs.existsSync(path.join(site, 'manifest.webmanifest')));

    // ---------- 11: Loopwerk unverändert ----------
    const L = await browser.newContext(DESK);
    const lw = await L.newPage();
    await lw.goto(`${base}/`);
    await lw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const lwInfo = await lw.evaluate(() => {
      localStorage.setItem('loopwerk.snap', localStorage.getItem('loopwerk.snap') || '1');
      window.loopwerk.store.setProjectName('Prüfung'); // Projekt wird erst nach einer Änderung gesichert
      return { off: document.querySelectorAll('[data-off]').length, ed: document.getElementById('app').dataset.edition, dens: document.getElementById('app').dataset.density, title: document.title, sw: !!navigator.serviceWorker.controller };
    });
    await lw.waitForTimeout(600);
    const keys = await lw.evaluate(() => Object.keys(localStorage));
    check('Loopwerk: keine abgeschalteten Flächen, Edition „full“, kein Service Worker', lwInfo.off === 0 && lwInfo.ed === 'full' && lwInfo.dens !== 'calm' && /Loopwerk$/.test(lwInfo.title) && !lwInfo.sw, JSON.stringify(lwInfo));
    check('Loopwerk: Schlüssel wie bisher (loopwerk.project.v1, loopwerk.snap)', keys.includes('loopwerk.project.v1') && keys.includes('loopwerk.snap') && !keys.some((k) => k.startsWith('loopwerk.make.')), keys.join(','));
    await L.close();
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'count-baseline.json'), 'utf8'));
    const now = {};
    for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
      const ctx = await browser.newContext(opts);
      const pg = await ctx.newPage();
      await pg.goto(`${base}/`);
      await pg.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await pg.evaluate(() => window.loopwerk.library.catalogReady);
      await pg.waitForTimeout(800);
      for (const s of ['start', 'clip']) { await scene(pg, s); now[`${dev}-${s}`] = await countUi(pg); }
      await ctx.close();
    }
    const same = Object.keys(baseline).every((k) => JSON.stringify(baseline[k]) === JSON.stringify(now[k]));
    check('Loopwerk optisch unverändert (Zählung trifft die Basis exakt)', same, same ? '' : JSON.stringify(now));
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
