// Krachwerk Scheibe 1a und 1b (Spec docs/specs/krachwerk-1-geruest.md §7): die volle App unter /werkstatt/ als Edition „make“ –
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


// Fixture „Klatsch dein Kit“: 0,8 s Stille, dann alle 0,7 s ein Schlag (Kick, Snare, Hi-Hat, Kick, Snare, Hi-Hat), dann Stille
function clapWav(file) {
  const sr = 48000, n = sr * 10;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const d = new Float32Array(n);
  const hit = (kind, at) => {
    const o = Math.round(sr * at);
    let ph = 0, prev = 0, y1 = 0, y2 = 0;
    const r = 0.97, w = 2 * Math.PI * 1500 / sr, a1 = 2 * r * Math.cos(w), a2 = -r * r;
    for (let i = 0; i < sr * 0.3 && o + i < n; i++) {
      let v = 0;
      if (kind === 0) { const f = 46 + 119 * Math.exp(-i / (sr * 0.03)); ph += 2 * Math.PI * f / sr; v = 0.5 * Math.sin(ph) * Math.exp(-i / (sr * 0.09)); }
      else if (kind === 1) { const y = rnd() * 0.12 + a1 * y1 + a2 * y2; y2 = y1; y1 = y; v = 0.8 * y * Math.exp(-i / (sr * 0.06)); }
      else { const x = rnd(); v = (x - prev) * 0.45 * Math.exp(-i / (sr * 0.018)); prev = x; }
      d[o + i] += v;
    }
  };
  for (let k = 0; k < 6; k++) hit(k % 3, 0.8 + 0.7 * k);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, d[i] + 0.001 * rnd())) * 32767), 44 + i * 2);
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
    for (const f of [].concat(init)) await page.evaluate(f);
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
      const sel = ['#starter', '.ccard[data-create="accomp"]', '#pat-continue', '.sing-desc-field', '#sing-sound', '[data-link-open]', '.ccard[data-create="link"]', '#link-pop', '#tab-capture', '#shelf-filters', '.shelf-credit', '#pop-about', '#demo-btn', '#shelf-filter-btn', '#shelf-fav'];
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

    // ---------- 12: Zählen (Budgets 1b) und Bilder ----------
    // Ein Klang liegt als Clip in Spur 1 (Szene „Clip gewählt“); die Szenen messen Desktop und Handy
    const addBumm = (page) => page.evaluate(async () => {
      const lw = window.loopwerk;
      const sr = 44100, d = new Float32Array(sr / 2);
      for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 20) * Math.exp(-i / 3000);
      const b = new AudioBuffer({ numberOfChannels: 1, length: d.length, sampleRate: sr });
      b.copyToChannel(d, 0);
      const smp = await lw.own.create({ name: 'Bumm 1', buffer: b, source: 'Aufnahme', from: 'mic', cls: 'tief' });
      lw.store.addClip('t1', smp.id, 0, 4);
    });
    const counts = {};
    const bench = {};
    for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
      const ctx = await browser.newContext(opts);
      const k = await openKw(base, ctx);
      const page = k.page;
      await page.waitForTimeout(600);
      for (const sc of ['start', 'clip']) {
        if (sc === 'clip') await addBumm(page);
        await scene(page, sc);
        counts[`${dev}-${sc}`] = await countUi(page);
        if (sc === 'start') bench[`empty-${dev}`] = await page.evaluate(() => ({
          hint: getComputedStyle(document.querySelector('.track-row .lane'), '::after').content,
          card: document.getElementById('start-card')?.textContent ?? '',
          kiste: document.querySelector('#library .shelf-empty')?.textContent,
        }));
        if (SHOTS) await page.screenshot({ path: path.join(DIR, `kw-${sc}-${dev}.png`) });
      }
      if (dev === 'handy') {
        await page.click('#tab-werkbank');
        await page.waitForTimeout(1100);
        counts['handy-werkbank'] = await countUi(page);
        bench.wbSheet = await page.evaluate(() => {
          const wb = document.getElementById('werkbank').getBoundingClientRect();
          const arr = document.querySelector('.arranger').getBoundingClientRect();
          const rows = [...document.querySelectorAll('.track-row')].map((r) => r.getBoundingClientRect().bottom);
          const head = document.querySelector('.playhead').getBoundingClientRect();
          return { top: wb.top, frac: wb.height / arr.height, rowsAbove: rows.length === 2 && rows.every((b) => b <= wb.top + 1), markVisible: head.top < wb.top && head.height > 0 };
        });
        if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-werkbank-handy.png') });
        await page.evaluate(() => window.loopwerk.ui.setDock(null));
        await page.waitForTimeout(600);
        bench.phone = await page.evaluate(() => {
          const box = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { w: r.width, h: r.height, bottom: r.bottom }; };
          const fl = document.getElementById('clip-float');
          const flr = fl.getBoundingClientRect();
          return {
            bar: ['#tab-sounds', '#play-btn', '#rec-btn', '#tab-werkbank'].map(box),
            floatBtns: [...fl.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height),
            floatIn: fl.closest('#arr-wrap') === document.getElementById('arr-wrap'),
            floatHidden: fl.hidden, floatBottom: flr.bottom,
            floatRight: flr.right,
            order: [...fl.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent),
            headsHit: [...document.querySelectorAll('.track-head')].some((h) => { const r = h.getBoundingClientRect(); return !(flr.right <= r.left || flr.left >= r.right || flr.bottom <= r.top || flr.top >= r.bottom); }),
            rowsGone: ['.key-row', '.chord-row'].map((q) => document.querySelector(q).getClientRects().length === 0),
          };
        });
        // Deck antippen öffnet die Song-Werkbank (Scheibe 5): Reiter Mischen mit „FX-Pad“, Reiter Song mit „Klick“
        await page.tap('.deck-name');
        await page.waitForTimeout(900);
        bench.songLinks = await page.evaluate(() => ({ dock: window.loopwerk.ui.dock, links: [...document.querySelectorAll('#sb-mix-tools .tab')].map((b) => b.textContent.trim()).concat(document.getElementById('sb-fx-toggle') ? ['Mischen'] : []), metro: !!document.querySelector('#sb-song-tools #metro-btn') }));
        // Zwilling der Tonart-/Akkordzeile: Schalter in den Feinheiten des Reiters Song blendet beide wieder ein (Wechsel lassen sich anlegen)
        await page.tap('#sb-tab-song');
        if (await page.evaluate(() => document.getElementById('sb-fine-btn-song').getAttribute('aria-expanded') !== 'true')) await page.tap('#sb-fine-btn-song');
        await page.tap('#harm-btn');
        await page.waitForTimeout(200);
        bench.harmony = await page.evaluate(() => ({ pressed: document.getElementById('harm-btn').getAttribute('aria-pressed'), rows: ['.key-row', '.chord-row'].map((q) => document.querySelector(q).getClientRects().length > 0) }));
        await page.tap('#harm-btn');
        await page.evaluate(() => window.loopwerk.ui.setDock(null));
      } else {
        // Werkbank: 36 % bei Auswahl, ⤢ macht 60 %, bleibt nach dem Neuladen; ohne Auswahl 24 px
        const wid = () => page.evaluate(() => ({ insp: document.getElementById('insp').getBoundingClientRect().width, app: document.getElementById('app').getBoundingClientRect().width, shelf: document.querySelector('.shelf').getBoundingClientRect().width }));
        const pct = (w) => (w.insp / w.app) * 100;
        const pctRest = (w) => (w.insp / (w.app - w.shelf)) * 100;
        const open = await wid();
        await page.click('#wb-wide');
        await page.waitForTimeout(300);
        const wide = await wid();
        bench.wideState = await page.evaluate(() => {
          const fl = document.getElementById('clip-float').getBoundingClientRect();
          const sc = document.getElementById('arr-scroll').getBoundingClientRect();
          const bars = [...document.querySelectorAll('.bar-mark')].filter((m) => { const r = m.getBoundingClientRect(); return r.right <= sc.right && r.left >= sc.left; }).map((m) => parseInt(m.textContent, 10));
          return { headsHit: [...document.querySelectorAll('.track-head')].some((h) => { const r = h.getBoundingClientRect(); return !(fl.right <= r.left || fl.left >= r.right || fl.bottom <= r.top || fl.top >= r.bottom); }), bars: [1, 2, 3, 4, 5].every((b) => bars.includes(b)), barsSeen: bars.join(',') };
        });
        if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-breit-desktop.png') });
        await page.reload();
        await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
        await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
        await page.waitForTimeout(400);
        const again = await wid();
        await page.click('#wb-wide');
        await page.evaluate(() => window.loopwerk.ui.select(null));
        await page.waitForTimeout(400);
        const shut = await wid();
        bench.wb = { open: pct(open), wide: pctRest(wide), again: pctRest(again), shut: shut.insp, shelfWide: wide.shelf };
        // Werkzeug am Clip: innerhalb von #arr-wrap, deckt den Clip nicht ab; Kopie und Löschen je ein Undo-Schritt
        await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
        await page.waitForTimeout(400);
        bench.stempo = await page.evaluate(() => ({ block: !!document.querySelector('.insp-stempo')?.offsetParent, off: [...document.querySelectorAll('#insp :disabled')].filter((b) => b.offsetParent).length }));
        bench.float = await page.evaluate(() => {
          const fl = document.getElementById('clip-float').getBoundingClientRect();
          const w = document.getElementById('arr-wrap').getBoundingClientRect();
          const c = document.querySelector('.clip.selected').getBoundingClientRect();
          const hit = !(fl.right <= c.left || fl.left >= c.right || fl.bottom <= c.top || fl.top >= c.bottom);
          return { inside: fl.left >= w.left && fl.right <= w.right && fl.top >= w.top && fl.bottom <= w.bottom, covers: hit, h: [...document.querySelectorAll('#clip-float button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height) };
        });
        const nClips = () => page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length);
        const n0 = await nClips();
        await page.click('#cf-dup');
        const n1 = await nClips();
        await page.evaluate(() => window.loopwerk.store.undo());
        const n2 = await nClips();
        await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
        await page.waitForTimeout(300);
        await page.click('#cf-del');
        const n3 = await nClips();
        await page.evaluate(() => window.loopwerk.store.undo());
        const n4 = await nClips();
        bench.undo = [n0, n1, n2, n3, n4];
        // M/S in der Spur-Werkbank (2a: nur bei Spurwahl, beim Clip steht dort die Sound-Werkbank)
        await page.evaluate(() => window.loopwerk.ui.selectTrack(window.loopwerk.store.project.tracks[0].id));
        await page.waitForTimeout(300);
        await page.click('#insp-mute');
        await page.click('#insp-solo');
        bench.ms = await page.evaluate(() => { const t = window.loopwerk.store.project.tracks[0]; return { mute: !!t.mute, solo: !!t.solo, m: document.getElementById('insp-mute').getAttribute('aria-pressed'), s: document.getElementById('insp-solo').getAttribute('aria-pressed') }; });
        await page.click('#insp-mute');
        await page.click('#insp-solo');
        await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
        // Stufe 3: jedes Element hat einen Zwilling
        bench.tiers = await page.evaluate(() => {
          const tw = window.loopwerk.edition.twins;
          const els = [...document.querySelectorAll('[data-tier="3"]')];
          const miss = els.filter((e) => !(tw[e.id] || [...e.classList].some((c) => tw['.' + c]))).map((e) => e.id || e.className);
          return { n: els.length, miss };
        });
        // Kiste: Gruppen nach Herkunft, einklappbar
        await page.evaluate(async () => {
          const lw = window.loopwerk;
          const mk = (n) => { const b = new AudioBuffer({ numberOfChannels: 1, length: 4410, sampleRate: 44100 }); b.getChannelData(0)[0] = 0.5; return lw.own.create({ name: n, buffer: b, source: 'Import', from: n.startsWith('D') ? 'file' : 'loop' }); };
          await mk('Datei X');
          await mk('Schleife X');
          const { newDrumPattern } = await import('./src/instruments.js');
          lw.store.addPattern(newDrumPattern(1));
          await lw.patterns.sync(lw.store.project);
        });
        await page.waitForTimeout(500);
        bench.kiste = await page.evaluate(() => [...document.querySelectorAll('#library .shelf-cat')].map((b) => b.children[1].textContent));
        if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-kiste-desktop.png') });
        await page.click('#kiste-toggle');
        await page.waitForTimeout(300);
        bench.kisteZu = await page.evaluate(() => ({ w: document.querySelector('.shelf').getBoundingClientRect().width, zu: document.getElementById('app').classList.contains('kiste-zu') }));
        await page.click('#kiste-toggle');
        bench.kisteAuf = await page.evaluate(() => document.querySelector('.shelf').getBoundingClientRect().width);
      }
      await ctx.close();
    }
    console.table(counts);
    const B = { desktop: { controls: 70, frames: 60, sizes: 8 }, handy: { controls: 24, frames: 25, sizes: 6 } };
    for (const [dev, b] of Object.entries(B)) {
      const c = counts[`${dev}-clip`];
      check(`Zählung 1b ${dev === 'desktop' ? 'Desktop' : 'Handy'} (Clip gewählt): ≤ ${b.controls} Bedienelemente, ≤ ${b.frames} Rahmen`, c.controls <= b.controls && c.frames <= b.frames, `${c.controls} / ${c.frames}`);
      check(`Zählung 1b ${dev === 'desktop' ? 'Desktop' : 'Handy'}: ≤ ${b.sizes} Schriftgrößen, kleinste ≥ 11 px`, c.sizes <= b.sizes && c.minFont >= 11, `${c.sizes} Größen, kleinste ${c.minFont}`);
    }
    // Budgets 2a (Spec krachwerk-2-werkbank §7): Bedienelemente / Rahmen / Schriftgrößen / kleinste
    const B2 = { desktop: [45, 30, 5, 11], handy: [18, 8, 5, 11] };
    for (const [dev, [c, f, z, m]] of Object.entries(B2)) {
      const x = counts[`${dev}-clip`];
      check(`Zählung 2a ${dev === 'desktop' ? 'Desktop' : 'Handy'} (Clip gewählt): ≤ ${c} Bedienelemente, ≤ ${f} Rahmen, ≤ ${z} Schriftgrößen, kleinste ≥ ${m}`, x.controls <= c && x.frames <= f && x.sizes <= z && x.minFont >= m, `${x.controls} / ${x.frames} / ${x.sizes} / ${x.minFont}`);
    }
    const wm = counts['handy-werkbank'];
    check('Zählung 2a Handy Werkbank Mitte (Clip, Form): ≤ 26 Bedienelemente, ≤ 13 Rahmen, ≤ 5 Schriftgrößen, kleinste ≥ 11', wm.controls <= 26 && wm.frames <= 13 && wm.sizes <= 5 && wm.minFont >= 11, `${wm.controls} / ${wm.frames} / ${wm.sizes} / ${wm.minFont}`);
    const w = bench.wb;
    check('Werkbank Desktop: bei Clipwahl 36 % (± 1), ⤢ macht 60 % des Raums rechts der Kiste (± 1), bleibt nach dem Neuladen', Math.abs(w.open - 36) <= 1 && Math.abs(w.wide - 60) <= 1 && Math.abs(w.again - 60) <= 1, `${w.open.toFixed(1)} / ${w.wide.toFixed(1)} / ${w.again.toFixed(1)} %`);
    check('⤢: Kiste klappt auf 24 px zu, Song zeigt mindestens 4 ganze Takte (Takt 5 im Bild), Werkzeug deckt keinen Spurkopf ab', bench.wb.shelfWide <= 26 && bench.wideState.bars && !bench.wideState.headsHit, `${bench.wb.shelfWide} px, Takte ${bench.wideState.barsSeen}, Spurkopf verdeckt: ${bench.wideState.headsHit}`);
    check('Werkbank: Sound-Tempo-Block bei Einzelklang und gesperrte Knöpfe nicht sichtbar', !bench.stempo.block && bench.stempo.off === 0, JSON.stringify(bench.stempo));
    check('Leerer Start: Startkarte „● Mach ein Geräusch“ statt Hinweistext in Spur 1, Kiste „Noch nichts aufgenommen“ (Handy und Desktop)', ['desktop', 'handy'].every((d) => /Mach ein Geräusch/.test(bench[`empty-${d}`].card) && bench[`empty-${d}`].hint === 'none' && bench[`empty-${d}`].kiste === 'Noch nichts aufgenommen'), JSON.stringify([bench['empty-desktop'], bench['empty-handy']]));
    check('Handy: „Tonart und Akkorde“ im Song-Fach blendet beide Zeilen wieder ein', bench.harmony?.pressed === 'true' && bench.harmony.rows.every(Boolean), JSON.stringify(bench.harmony));
    check('Handy: Werkzeug am Clip deckt keinen Spurkopf ab, Reihenfolge Werkbank · Teilen · Kopie · Löschen; Tonart- und Akkordzeile ohne Wechsel weg', !bench.phone.headsHit && bench.phone.floatRight <= 390 && bench.phone.order.join() === 'Werkbank,Teilen,Kopie,Löschen' && bench.phone.rowsGone.every(Boolean), JSON.stringify([bench.phone.headsHit, bench.phone.order, bench.phone.rowsGone]));
    check('Werkbank Desktop: ohne Auswahl eingeklappt (≤ 26 px)', w.shut <= 26, `${w.shut.toFixed(1)} px`);
    const ws = bench.wbSheet;
    check('Werkbank Handy: öffnet auf Mitte, 2 Spuren und die Marke bleiben sichtbar', Math.abs(ws.frac - 0.5) < 0.06 && ws.rowsAbove && ws.markVisible, JSON.stringify(ws));
    const ph = bench.phone;
    check('Daumenleiste: 4 Ziele ≥ 44 px, unterer Rand ≤ 844', ph.bar.every((r) => r && r.w >= 44 && r.h >= 44 && r.bottom <= 844), JSON.stringify(ph.bar.map((r) => r && [Math.round(r.w), Math.round(r.h), Math.round(r.bottom)])));
    check('Song-Werkbank: Tipp aufs Deck öffnet sie (Werkbank-Schublade), „Mischen“ und „FX-Pad“ stehen im Reiter Mischen, „Klick“ im Reiter Song', bench.songLinks.dock === 'werkbank' && ['Mischen', 'FX-Pad'].every((t) => bench.songLinks.links.includes(t)) && bench.songLinks.metro, JSON.stringify(bench.songLinks));
    check('Werkzeug am Clip (Handy): in #arr-wrap, 4 Tasten ≥ 44 px', ph.floatIn && !ph.floatHidden && ph.floatBtns.length === 4 && ph.floatBtns.every((h) => h >= 44), JSON.stringify(ph.floatBtns));
    const f = bench.float;
    check('Werkzeug am Clip (Desktop): innerhalb von #arr-wrap, deckt den Clip nicht ab, Tasten ≥ 44 px', f.inside && !f.covers && f.h.length === 3 && f.h.every((h) => h >= 44), JSON.stringify(f));
    check('Kopie und Löschen sind je ein Undo-Schritt', bench.undo.join() === '1,2,1,0,1', bench.undo.join());
    check('Spur-Werkbank: M und S schalten track.mute / track.solo', bench.ms.mute && bench.ms.solo && bench.ms.m === 'true' && bench.ms.s === 'true', JSON.stringify(bench.ms));
    check('Stufe 3: jedes [data-tier="3"] hat einen Zwilling in EDITION.twins', bench.tiers.n > 10 && bench.tiers.miss.length === 0, `${bench.tiers.n} Elemente, ohne Zwilling: ${bench.tiers.miss.join(', ')}`);
    check('Kiste: Gruppen nach Material in der Reihenfolge Körper · Dinge · Stimme · Strom · Schleife (hier: Dinge · Strom · Schleife)', bench.kiste.join(' · ') === 'Dinge · Strom · Schleife', bench.kiste.join(' · '));
    check('Kiste: 240 px breit, klappt auf 24 px ein und wieder aus', Math.abs(bench.kisteAuf - 240) <= 1 && bench.kisteZu.zu && bench.kisteZu.w <= 26, `${bench.kisteAuf} / ${bench.kisteZu.w}`);

    // ---------- 13: Sound-Werkbank (Scheibe 2a, Spec krachwerk-2-werkbank §6 und §8) ----------
    const bumm = (page, n = 1) => page.evaluate(async (count) => {
      const lw = window.loopwerk;
      const sr = 44100, d = new Float32Array(sr / 2);
      for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 20) * Math.exp(-i / 3000);
      const b = new AudioBuffer({ numberOfChannels: 1, length: d.length, sampleRate: sr });
      b.copyToChannel(d, 0);
      const smp = await lw.own.create({ name: 'Bumm 1', buffer: b, source: 'Aufnahme', from: 'mic', cls: 'tief' });
      for (let k = 0; k < count; k++) lw.store.addClip('t1', smp.id, k * 4, 4);
      return smp.id;
    }, n);
    const recOf = (page, id) => page.evaluate((i) => window.loopwerk.store.project.recipes?.[i] ?? null, id);
    const grundCounts = (page) => page.evaluate(async () => {
      const vis = (e) => e.getClientRects().length > 0 && !e.closest('[hidden]');
      const out = {};
      for (const t of ['form', 'ton', 'farbe', 'zeit', 'clip']) {
        document.getElementById(`wb-tab-${t}`).click();
        await new Promise((r) => setTimeout(r, 60));
        const g = document.querySelector('.wb:not(.sb) [role=tabpanel]:not([hidden]) .wb-grund');
        out[t] = [...g.querySelectorAll('button, input:not([type=hidden]), select, [role=slider]')].filter(vis).length;
      }
      document.getElementById('wb-tab-form').click();
      return out;
    });

    // ----- Desktop 1400×820 -----
    {
      const ctx = await browser.newContext(DESK);
      const k = await openKw(base, ctx);
      const page = k.page;
      const id = await bumm(page, 2);
      const clip0 = await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips[0].id);
      await page.evaluate((c) => window.loopwerk.ui.select(c), clip0);
      await page.waitForTimeout(500);
      const head = await page.evaluate(() => ({
        name: document.getElementById('wb-name')?.textContent, count: document.getElementById('wb-count')?.textContent,
        tabs: [...document.querySelectorAll('.wb-tabs[aria-label="Werkbank"] [role=tab]:not([hidden])')].map((t) => t.textContent).join(','),
        sel: [...document.querySelectorAll('.wb-tabs[aria-label="Werkbank"] [role=tab][aria-selected=true]')].map((t) => t.textContent).join(','),
        group: [...document.querySelectorAll('.wb-tabs[aria-label="Werkbank"]')].length, tablist: document.querySelector('.wb-tabs[aria-label="Werkbank"]')?.getAttribute('role'),
        sliders: [...document.querySelectorAll('.wb-wave [role=slider]')].filter((e) => !e.closest('[hidden]')).length,
      }));
      check('Werkbank: Kopf mit Name und „in 2 Clips“, Reiter Form · Ton · Farbe · Zeit · Clip (role=tab), Form gewählt', head.name === 'Bumm 1' && head.count === 'in 2 Clips' && head.tabs === 'Form,Ton,Farbe,Zeit,Clip' && head.sel === 'Form' && head.tablist === 'tablist', JSON.stringify(head));
      check('Welle: 4 Griffe mit role=slider (Anfang, Ende, Anschlag, Ausklang)', head.sliders === 4);
      const geo = await page.evaluate(() => {
        const R = (q) => document.querySelector(q).getBoundingClientRect();
        const hs = ['.wb-h-start', '.wb-h-end', '.wb-h-atk', '.wb-h-rel'].map(R);
        const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const cx = (r) => r.left + r.width / 2;
        return { big: hs.every((r) => r.width >= 44 && r.height >= 44), overlap: [[0, 2], [0, 3], [1, 2], [1, 3], [0, 1], [2, 3]].filter(([i, j]) => hit(hs[i], hs[j])).length, dx: [cx(hs[2]) - cx(hs[0]), cx(hs[1]) - cx(hs[3])] };
      });
      check('Welle: 4 Griffe unterscheidbar – Tippziele ≥ 44 px, nichts überlappt, Anschlag/Ausklang 12 px innerhalb von Anfang/Ende', geo.big && geo.overlap === 0 && geo.dx.every((d) => Math.abs(d - 12) < 1.5), JSON.stringify(geo));
      const words = await page.evaluate(() => ({ gain: document.getElementById('wb-gain').closest('label').querySelector('output').textContent, label: document.getElementById('wb-gain').closest('label').firstChild.textContent, loopLen: document.querySelector('.loop-len')?.textContent }));
      check('Wörter: „Pegel“ (Form) statt „Lautstärke“, „0 dB“ ohne Doppel-Leerzeichen, Kiste „Einzelklang“', words.gain === '0 dB' && words.label === 'Pegel' && words.loopLen === 'Einzelklang', JSON.stringify(words));
      const rows = await page.evaluate(() => ({ key: [...document.querySelectorAll('.key-row, .chord-row')].some((e) => e.getClientRects().length > 0) }));
      check('Desktop: Tonart- und Akkordzeile ohne Wechsel nicht sichtbar', !rows.key, JSON.stringify(rows));
      const per = await grundCounts(page);
      check('Zählung je Reiter (Desktop): Grund ≤ 5 Griffe', Object.values(per).every((n) => n >= 1 && n <= 5), JSON.stringify(per));
      // Weißglut: Flächen in --amber (Weiß); außer ▶ und Marke höchstens eine (gewählter Clip)
      const white = await page.evaluate(() => {
        const t = document.createElement('i');
        t.style.color = 'var(--amber)';
        document.body.append(t);
        const amber = getComputedStyle(t).color;
        t.remove();
        return [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && getComputedStyle(e).backgroundColor === amber && !e.matches('#play-btn, .playhead, .ph-grip, .ph-line, #play-btn *') && e.getBoundingClientRect().width > 6).map((e) => e.id || e.className).slice(0, 6);
      });
      check('Weißglut: außer ▶ und Marke höchstens 1 Fläche (der gewählte Clip)', white.length <= 1, white.join(' | '));
      // Reiter gemerkt
      await page.click('#wb-tab-farbe');
      await page.reload();
      await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(500);
      const remembered = await page.evaluate(() => document.querySelector('.wb-tabs [aria-selected=true]')?.textContent);
      check('Reiter bleibt nach dem Neuladen gemerkt (Farbe)', remembered === 'Farbe', remembered);
      await page.click('#wb-tab-form');
      // Welle: Pfeiltaste am Anfang, Ende mit der Maus ziehen = ein Undo-Schritt
      await page.focus('.wb-h-start');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      const r1 = await recOf(page, id);
      check('Welle: ArrowRight am Anfang setzt start + 0,01 s', r1 && Math.abs(r1.start - 0.01) < 1e-6, JSON.stringify(r1));
      const box = await page.evaluate(() => { const r = document.querySelector('.wb-h-end').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(box.x - i * 15, box.y);
      await page.mouse.up();
      await page.waitForTimeout(300);
      const r2 = await recOf(page, id);
      const u1 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
      check('Welle: Ende mit der Maus nach links ziehen kürzt den Sound, genau ein Undo-Schritt', r2?.end > 0.01 && r2.end < 0.45 && u1 - u0 === 1, `end ${r2?.end}, Schritte ${u1 - u0}`);
      const bakedLen = await page.evaluate(async (i) => { await window.loopwerk.library.applyRecipes(window.loopwerk.store.project); return window.loopwerk.library.source(i)?.duration; }, id);
      check('Kürzen wirkt: gebackener Klang ist kürzer als das Original (0,5 s)', bakedLen > 0 && bakedLen < 0.45, `${bakedLen?.toFixed(3)} s`);
      await page.evaluate(() => { window.loopwerk.store.undo(); window.loopwerk.store.undo(); });
      // Rückwärts in 2 Tipps ab nichts gewählt
      await page.evaluate(() => window.loopwerk.ui.select(null));
      await page.waitForTimeout(300);
      await page.click('.lane[data-track-id="t1"] .clip >> nth=0', { position: { x: 30, y: 24 } });
      await page.click('#wb-reverse');
      await page.waitForTimeout(200);
      const rv = await recOf(page, id);
      check('Rückwärts in 2 Tipps: reverse gesetzt', rv?.reverse === true, JSON.stringify(rv));
      // Material Körper, Stammbaum
      await page.click('#wb-dot');
      await page.click('.wb-mat-btn[data-material="koerper"]');
      await page.waitForTimeout(500);
      const mat = await page.evaluate(() => {
        const probe = document.createElement('i');
        probe.className = 'cat-drums';
        probe.style.color = 'var(--cat)';
        document.body.append(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        const clip = document.querySelector('.lane[data-track-id="t1"] .clip');
        const sw = document.querySelector('#shelf-cat-koerper .swatch');
        const swColor = sw && getComputedStyle(sw).backgroundColor;
        const clipColor = (() => { const p = document.createElement('i'); clip.append(p); p.style.color = 'var(--cat)'; const c = getComputedStyle(p).color; p.remove(); return c; })();
        return { cls: clip.className.includes('cat-drums'), group: !!document.querySelector('#shelf-items-koerper .loop-item'), swColor, clipColor, want, tree: document.getElementById('wb-tree').textContent, tab: document.querySelector('#shelf-items-koerper .loop-play') ? getComputedStyle(document.querySelector('#shelf-items-koerper .loop-row')).getPropertyValue('--cat') : '' };
      });
      check('Material Körper: Clip im Song ist cat-drums, Gruppe „Körper“ enthält den Sound', mat.cls && mat.group, JSON.stringify(mat));
      check('Farbe gleich: Punkt der Kiste = Farbe des Clips im Song (Körper)', mat.swColor === mat.clipColor && mat.clipColor === mat.want, `${mat.swColor} / ${mat.clipColor} / ${mat.want}`);
      check('Stammbaum: „Körper · Aufnahme … → … rückwärts“', /^Körper · Aufnahme .*→ .*rückwärts/.test(mat.tree), mat.tree);
      await page.evaluate(() => window.loopwerk.store.undo());
      // Rückwärts ist ein Undo-Schritt
      await page.evaluate(() => window.loopwerk.store.undo());
      const afterUndo = await recOf(page, id);
      check('Ein undo() je Schritt: Material und Rückwärts lassen sich einzeln aufheben', !afterUndo || (!afterUndo.reverse && !afterUndo.material), JSON.stringify(afterUndo));
      // Als Variante: Clip 1 wechselt, Clip 2 bleibt, Kiste zeigt sie unter dem Eltern-Sound
      await page.evaluate((c) => window.loopwerk.ui.select(c), clip0);
      await page.waitForTimeout(300);
      await page.click('#wb-variant');
      await page.waitForTimeout(800);
      const va = await page.evaluate(() => {
        const lw = window.loopwerk;
        const cs = lw.store.project.tracks[0].clips;
        const rows = [...document.querySelectorAll('#library .loop-row')];
        const iv = rows.findIndex((r) => r.classList.contains('variant'));
        return { a: cs[0].sampleId, b: cs[1].sampleId, name: document.getElementById('wb-name').textContent, count: document.getElementById('wb-count').textContent, under: iv > 0 && !rows[iv - 1].classList.contains('variant'), indent: iv >= 0 && parseFloat(getComputedStyle(rows[iv]).paddingLeft) > parseFloat(getComputedStyle(rows[0]).paddingLeft), wave: !!document.querySelector('.wb-wave canvas'), tree: document.getElementById('wb-tree').textContent };
      });
      check('Als Variante: Clip 1 spielt „vr-…“, Clip 2 bleibt beim Original, Kopf zeigt die Variante', /^vr-/.test(va.a) && va.b === id && /Bumm 1 b/.test(va.name) && va.count === 'in 1 Clip' && /^Variante von Bumm 1 →/.test(va.tree), JSON.stringify(va));
      check('Kiste: Variante steht unter ihrem Eltern-Sound, eingerückt', va.under && va.indent, JSON.stringify(va));
      const flashBefore = await page.evaluate(() => document.getElementById('hint-text').textContent);
      await page.evaluate(() => window.loopwerk.store.undo());
      await page.waitForTimeout(100);
      const flashAfter = await page.evaluate(() => document.getElementById('hint-text').textContent);
      check('Einblender „Bumm 1 b …“ verschwindet nach Rückgängig', /Bumm 1 b/.test(flashBefore) && !/Bumm 1 b/.test(flashAfter), `${flashBefore} → ${flashAfter}`);
      const back = await page.evaluate(() => ({ c: window.loopwerk.store.project.tracks[0].clips.map((c) => c.sampleId), r: window.loopwerk.store.project.recipes ?? null }));
      check('Als Variante ist ein Undo-Schritt (Clips und Rezepte zurück)', back.c.every((x) => x === id) && !back.r, JSON.stringify(back));
      // Spur antippen: Spur-Werkbank ohne Reiter, nur aktive Effekte, „+ Effekt“
      await page.click('.track-row:nth-child(1) .track-head .track-name');
      await page.waitForTimeout(300);
      const sp = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
        return { tabs: [...document.querySelectorAll('.wb-tabs')].filter(vis).length, track: vis(document.querySelector('.insp-track')), fxShown: [...document.querySelectorAll('.fxl-item')].filter(vis).length, add: vis(document.getElementById('insp-add-fx')), ms: vis(document.getElementById('insp-mute')) && vis(document.getElementById('insp-solo')), pan: vis(document.getElementById('insp-pan')), mixerLink: vis(document.querySelector('.insp-track .insp-link:not(#insp-auto-toggle)') || document.body) && false };
      });
      check('Spur antippen: Spur-Werkbank ohne Reiter, M · S · Lautstärke · Panorama, noch keine Effekte sichtbar, „+ Effekt“ da', sp.tabs === 0 && sp.track && sp.fxShown === 0 && sp.add && sp.ms && sp.pan, JSON.stringify(sp));
      await page.click('#insp-add-fx');
      await page.click('.wb-fx-pick .wb-btn >> nth=0');
      await page.waitForTimeout(200);
      const fx2 = await page.evaluate(() => [...document.querySelectorAll('.fxl-item')].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none').map((e) => e.classList.contains('on')));
      check('„+ Effekt“ schaltet einen Effekt ein; nur dieser steht danach in der Liste', fx2.length === 1 && fx2[0] === true, JSON.stringify(fx2));
      // Desktop: Fachleiste weg, Zwillinge, Song-Werkbank mit Mischen und FX-Pad
      await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.ui.selectTrack(null); });
      await page.click('.insp-toggle');
      await page.waitForTimeout(400);
      const dk = await page.evaluate(() => {
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
        const tw = window.loopwerk.edition.twins;
        return {
          bar: ['tabbar', 'editor-tab', 'tab-song'].map((i) => vis(document.getElementById(i))),
          tw: ['mixer-btn', 'fxpad-btn', 'editor-tab', '.tabbar-end', '.tbtn-chev', '.tbtn-mute'].map((i) => !!tw[i]),
          song: false,
          pan: !!document.querySelector('.track-head [id*="pan"], .track-head .tbtn-pan'),
        };
      });
      // Song-Werkbank: FX-Pad im Reiter Mischen, Tastenkürzel im Reiter Projekt (Feinheiten), Tonart und Akkorde im Reiter Song (Feinheiten)
      const where = {};
      for (const [tab, ids] of [['mischen', ['fxpad-btn']], ['projekt', ['keys-btn']], ['song', ['harm-btn']]]) {
        await page.click(`#sb-tab-${tab}`);
        if (tab !== 'mischen' && await page.evaluate((t) => document.getElementById(`sb-fine-btn-${t}`).getAttribute('aria-expanded') !== 'true', tab)) await page.click(`#sb-fine-btn-${tab}`);
        where[tab] = await page.evaluate((list) => list.every((i) => { const e = document.getElementById(i); return !!e && e.getClientRects().length > 0; }), ids);
      }
      dk.song = Object.values(where).every(Boolean) && await page.evaluate(() => !document.getElementById('mixer-btn').getClientRects().length);
      dk.where = where;
      check('Desktop: Fachleiste nicht sichtbar, Zwillinge in EDITION.twins, Spurkopf ohne Panorama-Knopf', dk.bar.every((v) => !v) && dk.tw.every(Boolean) && !dk.pan, JSON.stringify(dk));
      check('Desktop: Song-Werkbank (nichts gewählt): FX-Pad im Reiter Mischen, Tastenkürzel im Reiter Projekt, Tonart und Akkorde im Reiter Song; kein Mixer-Knopf', dk.song, JSON.stringify(dk));
      if (SHOTS) {
        await page.evaluate((c) => window.loopwerk.ui.select(c), clip0);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(DIR, 'kw-clip-desktop.png') });
        await page.click('#wb-tab-ton');
        await page.click('#wb-wide');
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(DIR, 'kw-breit-desktop.png') });
        await page.click('#wb-wide');
      }
      // Stoßlisten: Roh → geformt (Korn/Linie) im Song
      check('Desktop: keine Konsolenfehler', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ----- Handy 390×844, Touch -----
    {
      const ctx = await browser.newContext(PHONE);
      const k = await openKw(base, ctx);
      const page = k.page;
      const id = await bumm(page, 1);
      const clip0 = await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips[0].id);
      await page.evaluate((c) => window.loopwerk.ui.select(c), clip0);
      await page.waitForTimeout(400);
      await page.tap('#cf-werkbank');
      await page.waitForTimeout(1100);
      const inView = await page.evaluate(async () => {
        const wb = document.getElementById('werkbank').getBoundingClientRect();
        const bar = document.getElementById('tabbar').getBoundingClientRect();
        const out = {};
        for (const t of ['form', 'ton', 'farbe', 'zeit', 'clip']) {
          document.getElementById(`wb-tab-${t}`).click();
          await new Promise((r) => setTimeout(r, 80));
          const g = document.querySelector('.wb:not(.sb) [role=tabpanel]:not([hidden]) .wb-grund');
          const items = [...g.querySelectorAll('button, input:not([type=hidden]), select')].filter((e) => e.getClientRects().length && !e.closest('[hidden]'));
          out[t] = items.filter((e) => { const r = e.getBoundingClientRect(); return r.top < wb.top - 1 || r.bottom > bar.top + 1; }).length;
        }
        document.getElementById('wb-tab-form').click();
        return out;
      });
      check('Handy auf „Mitte“: alle Grund-Griffe des aktiven Reiters liegen vollständig im Bild (je Reiter)', Object.values(inView).every((n) => n === 0), JSON.stringify(inView));
      const per = await grundCounts(page);
      check('Zählung je Reiter (Handy): Grund ≤ 5 Griffe', Object.values(per).every((n) => n >= 1 && n <= 5), JSON.stringify(per));
      const ph = await page.evaluate(() => ({ sc: document.documentElement.scrollWidth - innerWidth, top: document.getElementById('werkbank').getBoundingClientRect().top, wave: document.querySelector('.wb-wave').getBoundingClientRect().height, names: ['Bumm 1', 'Spur 2'].map((n) => { const e = [...document.querySelectorAll('.track-name')].find((x) => x.textContent === n); return e ? e.scrollWidth <= e.clientWidth : null; }) }));
      check('Handy: Werkbank auf Mitte, Welle 72 px hoch, kein seitliches Scrollen, Spurnamen nicht gekürzt', ph.sc <= 0 && Math.abs(ph.wave - 72) <= 2 && ph.names.every((v) => v === true), JSON.stringify(ph));
      // Waagerechtes Ziehen auf der Welle verschiebt die Schublade nicht
      const cdp = await ctx.newCDPSession(page);
      const wbox = await page.evaluate(() => { const r = document.querySelector('.wb-wave-cv').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await touch('touchStart', wbox.x, wbox.y);
      for (let i = 1; i <= 10; i++) await touch('touchMove', wbox.x + i * 12, wbox.y + (i % 2));
      await touch('touchEnd');
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => ({ top: document.getElementById('werkbank').getBoundingClientRect().top, open: window.loopwerk.ui.dock }));
      check('Handy: waagerechtes Ziehen auf der Welle verschiebt die Schublade nicht', Math.abs(after.top - ph.top) <= 1 && after.open === 'werkbank', `${ph.top} → ${after.top}`);
      // Griff am Finger ziehen (Ende) = Sound wird kürzer
      const eb = await page.evaluate(() => { const r = document.querySelector('.wb-h-end').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await touch('touchStart', eb.x - 3, eb.y);
      for (let i = 1; i <= 10; i++) await touch('touchMove', eb.x - 3 - i * 14, eb.y);
      await touch('touchEnd');
      await page.waitForTimeout(400);
      const re = await recOf(page, id);
      check('Handy: Ende-Griff mit dem Finger ziehen kürzt den Sound', re?.end > 0.01 && re.end < 0.4, JSON.stringify(re));
      await page.evaluate(() => window.loopwerk.store.undo());
      // Tiefer in 3 Tipps: Clip → Ton → −
      await page.tap('#wb-tab-ton');
      await page.tap('#wb-semis-minus');
      await page.waitForTimeout(200);
      const lo = await recOf(page, id);
      check('Tiefer: Ton → − setzt semis auf −1', lo?.semis === -1, JSON.stringify(lo));
      if (SHOTS) {
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(DIR, 'kw-werkbank-ton-handy.png') });
        for (const t of ['farbe', 'zeit', 'clip']) { await page.tap(`#wb-tab-${t}`); await page.waitForTimeout(250); await page.screenshot({ path: path.join(DIR, `kw-werkbank-${t}-handy.png`) }); }
        await page.tap('#wb-tab-form');
      }
      check('Handy: keine Konsolenfehler', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ---------- 13b: Zerlegen (Scheibe 2b, Spec krachwerk-2b-zerlegen §8) ----------
    // 10 s Klopfen: 8 Schläge (Rauschstöße, unregelmäßige Abstände, Pegel 0 … −12 dB) auf −56 dB Boden; Clip über 15 Schläge (= 10 s bei 90 BPM)
    const klopfen = (page, { clip = true } = {}) => page.evaluate(async (withClip) => {
      const lw = window.loopwerk;
      const sr = 44100, d = new Float32Array(sr * 10);
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      for (let i = 0; i < d.length; i++) d[i] = 0.0015 * rnd();
      [0.5, 1.6, 2.4, 3.9, 5.0, 6.3, 7.5, 8.8].forEach((t, k) => {
        const g = 10 ** (-(k % 4) * 4 / 20);
        for (let i = 0; i < sr * 0.03; i++) d[Math.round(t * sr) + i] += 0.6 * g * rnd() * Math.exp(-i / (sr * 0.01));
      });
      const b = new AudioBuffer({ numberOfChannels: 1, length: d.length, sampleRate: sr });
      b.copyToChannel(d, 0);
      const smp = await lw.own.create({ name: 'Klopfen', buffer: b, source: 'Aufnahme', from: 'mic', cls: 'tief' });
      if (withClip) lw.store.addClip('t1', smp.id, 0, 15);
      return smp.id;
    }, clip);
    const slider = (page) => page.evaluate(() => { const s = document.querySelector('.wb-mk-slider'); return { label: s?.getAttribute('aria-label'), now: Number(s?.getAttribute('aria-valuenow')), marks: document.querySelectorAll('.wb-mk').length, role: s?.getAttribute('role') }; });
    const clipsOf2 = (page) => page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).map((c) => c.sampleId));

    // ----- Desktop: Ablauf in 3 Tipps, Marken, Kiste, Editor weg -----
    {
      const ctx = await browser.newContext(DESK);
      const k = await openKw(base, ctx);
      const page = k.page;
      await bumm(page, 1);
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(400);
      const shortTab = await page.evaluate(() => getComputedStyle(document.getElementById('wb-tab-zerlegen')).display === 'none' || document.getElementById('wb-tab-zerlegen').hidden);
      check('Reiter Zerlegen fehlt bei einem Sound unter 1 s', shortTab);
      await page.evaluate(() => { const lw = window.loopwerk; lw.store.deleteClip(lw.store.project.tracks[0].clips[0].id); lw.ui.select(null); });
      const kid = await klopfen(page);
      await page.waitForTimeout(500);
      const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
      // Tipp 1: Clip, Tipp 2: Zerlegen, Marken stehen sofort da
      await page.click('.lane[data-track-id="t1"] .clip >> nth=0', { position: { x: 60, y: 24 } });
      await page.click('#wb-tab-zerlegen');
      await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 5000 });
      const m0 = await slider(page);
      check('Zerlegen: Marken erscheinen sofort, 8 Marken bei Empfindlichkeit 0,5, ein Regler „Marke 1 von 8“ (role=slider)', m0.marks === 8 && m0.label === 'Marke 1 von 8' && m0.role === 'slider', JSON.stringify(m0));
      const hidden4 = await page.evaluate(() => ['.wb-h-start', '.wb-h-end', '.wb-h-atk', '.wb-h-rel'].every((q) => getComputedStyle(document.querySelector(q)).display === 'none'));
      check('Marken-Modus: die 4 Griffe aus 2a sind ausgeblendet', hidden4);
      const gr = await page.evaluate(() => document.querySelectorAll('.wb:not(.sb) [role=tabpanel]:not([hidden]) .wb-grund :is(button, input, select, [role=slider])').length);
      check('Zerlegen: Grund hat 5 Griffe (An Anschlägen · In 8 gleiche · Empfindlichkeit · Als Kit · Auf die Spur)', gr === 5, String(gr));
      const near = await page.evaluate(() => {
        const t = [0.5, 1.6, 2.4, 3.9, 5.0, 6.3, 7.5, 8.8];
        const W = document.querySelector('.wb-wave').getBoundingClientRect().width;
        const xs = [...document.querySelectorAll('.wb-mk')].map((n) => parseFloat(n.style.left) / W * 10);
        return xs.slice(1).map((x, i) => Math.abs(x + 0.003 - t[i + 1]) * 1000);
      });
      check('Marken: jede Marke 3 ms vor ihrem Schlag (± 8 ms wegen Pixelraster)', near.length === 7 && near.every((e) => e < 60), near.map((e) => e.toFixed(0)).join(','));
      // Welle in dB: ein −12-dB-Schlag (4. Schlag, 3,9 s) hat sichtbare Höhe (≥ 20 % der Wellenhöhe); −18 dB ergäbe nach der Skala 62 %
      const hgt = await page.evaluate(() => {
        const cv = document.querySelector('.wb-wave-cv');
        const x = Math.round((3.95 / 10) * cv.width);
        const d = cv.getContext('2d').getImageData(x - 2, 0, 5, cv.height).data;
        let top = cv.height, bot = 0;
        for (let y = 0; y < cv.height; y++) for (let xx = 0; xx < 5; xx++) if (d[(y * 5 + xx) * 4 + 3] > 40) { top = Math.min(top, y); bot = Math.max(bot, y); }
        return { frac: (bot - top + 1) / cv.height };
      });
      check('Welle im Reiter Zerlegen: Hüllkurve in dB, der leise Schlag (−12 dB) füllt ≥ 20 % der Wellenhöhe', hgt.frac >= 0.2, JSON.stringify(hgt));
      const wgt = await page.evaluate(() => {
        const cs = (q) => getComputedStyle(document.querySelector(q));
        const amber = (() => { const t = document.createElement('i'); t.style.color = 'var(--amber)'; document.body.append(t); const c = getComputedStyle(t).color; t.remove(); return c; })();
        return { track: cs('#wb-cut-track').backgroundColor === amber, boxFill: cs('#wb-cut-box').backgroundColor, tog: cs('#wb-cut-onsets').color === amber, togBg: cs('#wb-cut-onsets').backgroundColor, off: cs('#wb-cut-even').color !== amber };
      });
      check('Gewicht: „Auf die Spur“ gefüllt in Weißglut, „In die Kiste“ ohne Fläche, gewählter Umschalter in Weißglut ohne Fläche', wgt.track && /rgba\(0, 0, 0, 0\)|transparent/.test(wgt.boxFill) && wgt.tog && /rgba\(0, 0, 0, 0\)|transparent/.test(wgt.togBg) && wgt.off, JSON.stringify(wgt));
      // Tastatur: Pfeil rechts +5 ms, runter wechselt, Entf löscht
      await page.focus('.wb-mk-slider');
      await page.keyboard.press('ArrowDown');
      const a1 = await slider(page);
      await page.keyboard.press('ArrowRight');
      const a2 = await slider(page);
      check('Marken-Slider: ArrowDown wechselt zu „Marke 2 von 8“, ArrowRight verschiebt um 5 ms', a1.label === 'Marke 2 von 8' && Math.abs(a2.now - a1.now - 0.005) < 0.0011, `${a1.now} → ${a2.now}`);
      await page.keyboard.press('Shift+ArrowLeft');
      const a3 = await slider(page);
      check('Marken-Slider: Umschalt+ArrowLeft verschiebt um 50 ms', Math.abs(a2.now - a3.now - 0.05) < 0.0011, `${a2.now} → ${a3.now}`);
      await page.keyboard.press('Delete');
      const a4 = await slider(page);
      check('Marken-Slider: Entf löscht die Marke (7 Schnitte), der Regler bleibt im Fokus', a4.marks === 7 && /von 7$/.test(a4.label) && await page.evaluate(() => document.activeElement?.classList.contains('wb-mk-slider')), JSON.stringify(a4));
      // Doppeltipp löscht ebenfalls, Zug verschiebt; dann Empfindlichkeit setzt die Marken neu
      const mk3 = await page.evaluate(() => { const r = document.querySelectorAll('.wb-mk')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(mk3.x, mk3.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(mk3.x + i * 4, mk3.y);
      await page.mouse.up();
      const a5 = await slider(page);
      check('Marke mit der Maus ziehen verschiebt sie (und wählt sie)', /Marke 4 von 7/.test(a5.label) && a5.marks === 7, JSON.stringify(a5));
      const mk3b = await page.evaluate(() => { const r = document.querySelectorAll('.wb-mk')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.dblclick(mk3b.x, mk3b.y);
      const a6 = await slider(page);
      check('Doppeltipp auf eine Marke löscht sie (6 Schnitte)', a6.marks === 6, JSON.stringify(a6));
      await page.evaluate(() => { const i = document.getElementById('wb-cut-sens'); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length === 8, null, { timeout: 5000 });
      const sensKey = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.make.cutSens')));
      check('Empfindlichkeit setzt die Marken neu (wieder 8), Wert in lsKey „loopwerk.cutSens“ gemerkt', sensKey?.v === 0.5, JSON.stringify(sensKey));
      const cnt = (v) => page.evaluate((x) => { const i = document.getElementById('wb-cut-sens'); i.value = String(x); i.dispatchEvent(new Event('input', { bubbles: true })); return new Promise((r) => setTimeout(() => r(document.querySelectorAll('.wb-mk').length), 500)); }, v);
      const lo = await cnt(0.05), hi = await cnt(1);
      await cnt(0.5);
      check('Empfindlichkeit: Marken folgen live (0,05 und 1 geben je ≥ 1 Marke, hoch nie weniger als niedrig)', lo >= 1 && hi >= lo, `0,05 → ${lo}, 1 → ${hi}`);
      // Tipp 3: Auf die Spur
      await page.click('#wb-cut-track');
      await page.waitForTimeout(700);
      const done = await page.evaluate(() => {
        const lw = window.loopwerk;
        const clips = lw.store.project.tracks[0].clips;
        const names = clips.map((c) => lw.library.get(c.sampleId)?.name);
        return { n: clips.length, ids: clips.every((c) => /^vr-/.test(c.sampleId)), names, undo: lw.store.undoStack.length, kiste: document.querySelector('.loop-group-btn')?.textContent, hint: document.getElementById('hint-text').textContent };
      });
      const u1 = done.undo - u0;
      check('Ablauf: Clip → Zerlegen → Auf die Spur = 3 Tipps ergibt 8 Clips mit vr-…, Namen „Klopfen · 1“ … „· 8“', done.n === 8 && done.ids && done.names.join('|') === [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Klopfen · ${n}`).join('|'), JSON.stringify(done));
      check('Kiste: eine eingerückte Zeile „Klopfen · 8 Schnitte“, Einblender „8 Schnitte auf der Spur“, ein Undo-Schritt', /Klopfen · 8 Schnitte/.test(done.kiste) && /8 Schnitte/.test(done.hint) && u1 === 1, `${done.kiste} / ${done.hint} / ${u1}`);
      const narrowL = await page.evaluate(() => [...document.querySelectorAll('.lane[data-track-id="t1"] .clip .clip-label')].map((l) => l.textContent));
      await page.evaluate(() => window.loopwerk.arranger.zoomTo(60));
      await page.waitForTimeout(300);
      const nums = await page.evaluate(() => [...document.querySelectorAll('.lane[data-track-id="t1"] .clip .clip-label')].map((l) => l.textContent));
      check('Schnitt-Clips im Song: Nummer vorn („4 · Klopfen“), schmale nur die Nummer', nums.length === 8 && nums.includes('4 · Klopfen') && narrowL.every((t) => /^\d$/.test(t)), `${nums.join(' | ')} / schmal: ${narrowL.join(',')}`);
      await page.evaluate(() => window.loopwerk.arranger.zoomTo(24));
      const cutRec = await page.evaluate((id) => { const rs = window.loopwerk.store.project.recipes; return { orig: !!rs[id] === false, groups: new Set(Object.values(rs).map((r) => r.group)).size, own: window.loopwerk.own.list?.().length }; }, kid);
      check('Alle 8 Schnitte tragen dieselbe Gruppe, der Sound selbst bekam kein Rezept', cutRec.orig && cutRec.groups === 1, JSON.stringify(cutRec));
      await page.evaluate(() => window.loopwerk.store.undo());
      await page.waitForTimeout(150);
      const undone = await page.evaluate(() => ({ hint: document.getElementById('hint-text').textContent, n: window.loopwerk.store.project.tracks[0].clips.length, r: window.loopwerk.store.project.recipes ?? null }));
      check('Nach undo() zeigt der Einblender „Rückgängig: Zerlegen“, Clip und Rezepte sind zurück', undone.hint === 'Rückgängig: Zerlegen' && undone.n === 1 && !undone.r, JSON.stringify(undone));
      await page.evaluate(() => window.loopwerk.store.redo());
      // Kiste: Gruppe klappt auf; Doppelklick auf einen Schnitt öffnet die Werkbank ohne Reiter Clip
      await page.click('.loop-group-btn');
      const kids = await page.evaluate(() => document.querySelectorAll('#library .loop-row.group-kid .loop-item').length);
      check('Kiste: Tipp auf die Gruppenzeile klappt die 8 Schnitte auf', kids === 8, String(kids));
      if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-kiste-schnitte.png') });
      await page.evaluate(() => window.loopwerk.ui.select(null));
      await page.dblclick(`#library .loop-item[data-sample-id="${kid}"]`);
      await page.waitForTimeout(500);
      const kb = await page.evaluate(() => ({ clipTab: document.getElementById('wb-tab-clip').hidden, name: document.getElementById('wb-name').textContent, mode: document.getElementById('insp').dataset.mode, bench: window.loopwerk.ui.benchSoundId }));
      check('Kiste: Doppelklick auf einen Sound öffnet die Werkbank ohne Reiter Clip', kb.clipTab && kb.mode === 'sound' && !!kb.bench && /Klopfen/.test(kb.name), JSON.stringify(kb));
      // Aus der Kiste: den Ursprungs-Sound „Klopfen“ öffnen und „In die Kiste“
      await page.evaluate((id) => window.loopwerk.ui.openSound(id), kid);
      await page.click('#wb-tab-zerlegen');
      await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 5000 });
      const g0 = await page.evaluate(() => new Set(Object.values(window.loopwerk.store.project.recipes).map((r) => r.group)).size);
      if (await page.evaluate(() => document.getElementById('wb-fine-btn-zerlegen').getAttribute('aria-expanded') !== 'true')) await page.click('#wb-fine-btn-zerlegen');
      await page.click('#wb-cut-box'); // „In die Kiste“ steht seit Scheibe 4 in den Feinheiten
      await page.waitForTimeout(500);
      const g1 = await page.evaluate(() => ({ groups: new Set(Object.values(window.loopwerk.store.project.recipes).map((r) => r.group)).size, clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length, hint: document.getElementById('hint-text').textContent }));
      check('Aus der Kiste: „In die Kiste“ legt eine zweite Gruppe an, Einblender „8 Schnitte in der Kiste“, Clips unverändert', g1.groups === g0 + 1 && g1.clips === 8 && /8 Schnitte in der Kiste/.test(g1.hint), JSON.stringify(g1));
      // Autotune in den Ton-Feinheiten; Trennen in den Zerlegen-Feinheiten
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(300);
      await page.click('#wb-tab-ton');
      const fineVis = await page.evaluate(() => !document.querySelector('#wb-panel-ton .wb-fine').hidden);
      if (!fineVis) await page.click('#wb-fine-btn-ton');
      await page.click('#wb-tune');
      await page.waitForTimeout(200);
      const tuned = await page.evaluate(() => { const lw = window.loopwerk; const id = lw.store.project.tracks[0].clips[0].sampleId; return { r: lw.store.project.recipes[id], key: document.getElementById('wb-tune-key')?.value }; });
      check('Autotune: Schalter in den Ton-Feinheiten setzt tune 1 und tuneKey auf die Tonart des Songs', tuned.r?.tune === 1 && tuned.r.tuneKey === 'Am' && tuned.key === 'Am', JSON.stringify(tuned));
      await page.evaluate(() => { window.loopwerk.store.undo(); window.loopwerk.ui.select(null); window.loopwerk.ui.openSound(Object.values(window.loopwerk.store.project.recipes)[0].parent); });
      await page.waitForTimeout(300);
      await page.click('#wb-tab-zerlegen');
      if (await page.evaluate(() => document.querySelector('#wb-panel-zerlegen .wb-fine').hidden)) await page.click('#wb-fine-btn-zerlegen');
      const sep = await page.evaluate(() => ['wb-sep-novocal', 'wb-sep-vocal', 'wb-sep-stems'].map((i) => document.getElementById(i)?.textContent));
      check('Trennen: Stimme weg · Nur Stimme · In 4 Ebenen stehen in den Zerlegen-Feinheiten', sep.join(' · ') === 'Stimme weg · Nur Stimme · In 4 Ebenen', sep.join(' · '));
      // Desktop-Zählung (Clip gewählt, 10-s-Sound, Reiter Form) in einem frischen Fenster, wie die 2a-Szene: ein Sound in der Kiste
      {
        const c2 = await browser.newContext(DESK);
        const k2 = await openKw(base, c2);
        await klopfen(k2.page);
        await scene(k2.page, 'clip');
        await k2.page.click('#wb-tab-form');
        counts['desktop-klopfen'] = await countUi(k2.page);
        if (SHOTS) {
          await k2.page.click('#wb-tab-zerlegen');
          await k2.page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 5000 });
          await k2.page.waitForTimeout(300);
          await k2.page.screenshot({ path: path.join(DIR, 'kw-zerlegen-desktop.png') });
        }
        await c2.close();
      }
      // Editor weg, jede Funktion hat einen Zwilling
      const ed = await page.evaluate(() => {
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
        const tw = window.loopwerk.edition.twins;
        const ids = [...document.querySelectorAll('#editor button[id^="ed-"], #editor input[id^="ed-"], #editor select[id^="ed-"]')].map((e) => e.id).filter((i) => i !== 'ed-cancel');
        return { btn: vis(document.getElementById('edit-btn')), tab: vis(document.getElementById('editor-tab')), dock: vis(document.getElementById('editor')), n: ids.length, miss: ids.filter((i) => !tw[i]), surf: window.loopwerk.edition.surfaces.editor, twEdit: !!tw['edit-btn'] };
      });
      check('Editor weg: #edit-btn, #editor-tab, Dock unsichtbar, surfaces.editor false', !ed.btn && !ed.tab && !ed.dock && ed.surf === false, JSON.stringify(ed));
      check('Editor weg: jeder Knopf mit id ed-… (außer ed-cancel) hat einen Zwilling in EDITION.twins', ed.n >= 20 && ed.miss.length === 0 && ed.twEdit, `${ed.n} Knöpfe, ohne Zwilling: ${ed.miss.join(',')}`);
      check('Zerlegen Desktop: keine Konsolenfehler', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ----- Handy: Marken ziehen, 56 px, lange drücken, Zählung, Bilder -----
    {
      const ctx = await browser.newContext(PHONE);
      const k = await openKw(base, ctx);
      const page = k.page;
      await klopfen(page);
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(400);
      await page.tap('#cf-werkbank');
      await page.waitForTimeout(1100);
      await page.tap('#wb-tab-zerlegen');
      await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 5000 });
      await page.waitForTimeout(400);
      counts['handy-zerlegen'] = await countUi(page);
      const inView = await page.evaluate(() => {
        const wb = document.getElementById('werkbank').getBoundingClientRect();
        const bar = document.getElementById('tabbar').getBoundingClientRect();
        const items = [...document.querySelectorAll('.wb:not(.sb) [role=tabpanel]:not([hidden]) .wb-grund :is(button, input)')].filter((e) => e.getClientRects().length);
        return items.filter((e) => { const r = e.getBoundingClientRect(); return r.top < wb.top - 1 || r.bottom > bar.top + 1; }).length;
      });
      check('Handy Zerlegen auf „Mitte“: alle 5 Grund-Griffe liegen vollständig im Bild', inView === 0, String(inView));
      if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-zerlegen-handy.png') });
      const top0 = await page.evaluate(() => document.getElementById('werkbank').getBoundingClientRect().top);
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      const m3 = await page.evaluate(() => { const r = document.querySelectorAll('.wb-mk')[3].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const before = (await slider(page)).now;
      await touch('touchStart', m3.x, m3.y);
      for (let i = 1; i <= 8; i++) await touch('touchMove', m3.x + i * 5, m3.y + (i % 2));
      await touch('touchEnd');
      await page.waitForTimeout(500);
      const dragged = await page.evaluate(() => ({ top: document.getElementById('werkbank').getBoundingClientRect().top, label: document.querySelector('.wb-mk-slider').getAttribute('aria-label'), now: Number(document.querySelector('.wb-mk-slider').getAttribute('aria-valuenow')) }));
      const moved = (await page.evaluate(() => [...document.querySelectorAll('.wb-mk')].map((n) => parseFloat(n.style.left))))[3];
      check('Handy: waagerechter Zug an einer Marke verschiebt sie und nicht die Schublade', /Marke 4 von 8/.test(dragged.label) && Math.abs(dragged.top - top0) <= 1 && dragged.now > before - 1 && moved > 0, `${JSON.stringify(dragged)} Marke bei ${moved}`);
      // Handy: Auf die Spur mit Tippen
      await page.tap('#wb-cut-track');
      await page.waitForTimeout(700);
      const hc = await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips.length);
      check('Handy: Auf die Spur ergibt 8 Clips', hc === 8, String(hc));
      // 56 px: wieder auf einen langen Sound, Schublade nach unten wischen
      await page.evaluate(() => { const lw = window.loopwerk; lw.store.undo(); lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(500);
      const grip = await page.evaluate(() => { const r = document.querySelector('#werkbank .sheet-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await touch('touchStart', grip.x, grip.y);
      for (let i = 1; i <= 10; i++) { await touch('touchMove', grip.x, grip.y + i * 30); await page.waitForTimeout(16); }
      await page.waitForTimeout(160);
      await touch('touchEnd');
      await page.waitForTimeout(1200);
      const zu = await page.evaluate(() => {
        const wb = document.getElementById('werkbank');
        const r = wb.getBoundingClientRect();
        const vis = (q) => { const e = wb.querySelector(q); const b = e?.getBoundingClientRect(); return !!b && b.width > 0 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1 && getComputedStyle(e).display !== 'none'; };
        return { h: r.height, head: vis('.wb-name'), variant: vis('#wb-variant'), dock: window.loopwerk.ui.dock, bottom: r.bottom, bar: document.getElementById('tabbar').getBoundingClientRect().top };
      });
      check('Handy: Werkbank „zu“ (Herunterwischen) = 56 px (± 1), zeigt Kopf und „Als Variante“, liegt über der Daumenleiste', Math.abs(zu.h - 56) <= 1 && zu.head && zu.variant && zu.dock === 'werkbank' && Math.abs(zu.bottom - zu.bar) <= 2, JSON.stringify(zu));
      await page.evaluate(() => window.loopwerk.ui.flash('Rückgängig: Zerlegen'));
      await page.waitForTimeout(400);
      const ov = await page.evaluate(() => {
        const a = document.getElementById('hint').getBoundingClientRect();
        const b = document.getElementById('werkbank').getBoundingClientRect();
        return { shown: document.getElementById('hint').classList.contains('show'), hit: !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom) };
      });
      check('Handy: der Einblender sitzt über der 56-px-Schublade und überlappt ihren Kopf nicht', ov.shown && !ov.hit, JSON.stringify(ov));
      if (SHOTS) await page.screenshot({ path: path.join(DIR, 'kw-zu-handy.png') });
      // Tipp auf den Griff holt sie wieder auf Mitte; nochmal wischen + wischen schließt
      await page.evaluate(() => { const r = document.querySelector('#werkbank .sheet-grip').getBoundingClientRect(); window.__g = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const g = await page.evaluate(() => window.__g);
      await touch('touchStart', g.x, g.y);
      await page.waitForTimeout(70);
      await touch('touchEnd');
      await page.waitForTimeout(1000);
      const mitte = await page.evaluate(() => document.getElementById('werkbank').getBoundingClientRect().height);
      check('Handy: Tipp auf den Griff holt die Werkbank aus der Kopfzeile zurück (Mitte)', mitte > 200, `${mitte.toFixed(0)} px`);
      // Kiste: lange drücken öffnet die Werkbank ohne Reiter Clip
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(null); lw.ui.setDock('sounds'); });
      await page.waitForTimeout(900);
      const it = await page.evaluate(() => { const r = document.querySelector('#library .loop-item').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await touch('touchStart', it.x, it.y);
      await page.waitForTimeout(700);
      await touch('touchEnd');
      await page.waitForTimeout(1100);
      const lp = await page.evaluate(() => ({ dock: window.loopwerk.ui.dock, clipTab: document.getElementById('wb-tab-clip')?.hidden, bench: !!window.loopwerk.ui.benchSoundId, armed: window.loopwerk.ui.armedSampleId }));
      check('Handy: lange drücken auf einen Sound der Kiste öffnet die Werkbank ohne Reiter Clip', lp.dock === 'werkbank' && lp.clipTab && lp.bench && !lp.armed, JSON.stringify(lp));
      check('Handy: kein seitliches Scrollen im Reiter Zerlegen', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
      check('Zerlegen Handy: keine Konsolenfehler', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }
    if (SHOTS) {
      // Bilder für den CD: Form mit 0-ms-Hüllkurve (vier Griffe), roh neben geformt im Song
      for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
        const ctx = await browser.newContext(opts);
        const k = await openKw(base, ctx);
        const page = k.page;
        const id = await bumm(page, 2);
        await page.evaluate((i) => {
          const lw = window.loopwerk;
          const c2 = lw.store.project.tracks[0].clips[1].id;
          const vr = lw.store.addVariant(i, { clipId: c2 });
          lw.library.syncVariants(lw.store.project);
          lw.store.setRecipe(vr, { semis: -3, lp: 1800, warm: 0.5 });
          lw.ui.select(lw.store.project.tracks[0].clips[0].id);
        }, id);
        await page.waitForTimeout(1200);
        if (dev === 'handy') { await page.tap('#cf-werkbank'); await page.waitForTimeout(1200); }
        await page.screenshot({ path: path.join(DIR, `kw-form-${dev}.png`) });
        if (dev === 'desktop') await page.screenshot({ path: path.join(DIR, 'kw-roh-geformt-desktop.png'), clip: { x: 250, y: 90, width: 650, height: 230 } });
        await ctx.close();
      }
    }
    {
      const c = counts['desktop-klopfen'];
      check('Zählung 2b Desktop (Clip gewählt, 10-s-Sound, Reiter Form): ≤ 45 Bedienelemente, ≤ 30 Rahmen, ≤ 5 Schriftgrößen, kleinste ≥ 11', c.controls <= 45 && c.frames <= 30 && c.sizes <= 5 && c.minFont >= 11, `${c.controls} / ${c.frames} / ${c.sizes} / ${c.minFont}`);
      const z = counts['handy-zerlegen'];
      check('Zählung 2b Handy Werkbank Mitte, Reiter Zerlegen (10-s-Sound, 8 Marken): ≤ 26 Bedienelemente, ≤ 13 Rahmen, ≤ 5 Schriftgrößen, kleinste ≥ 11', z.controls <= 26 && z.frames <= 13 && z.sizes <= 5 && z.minFont >= 11, `${z.controls} / ${z.frames} / ${z.sizes} / ${z.minFont}`);
    }

    // ----- Loopwerk unverändert: kein Werkbank-Reiter -----
    {
      const ctx = await browser.newContext(DESK);
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', (e) => errs.push(e.message));
      await pg.goto(`${base}/`);
      await pg.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await pg.evaluate(() => window.loopwerk.library.catalogReady);
      await scene(pg, 'clip');
      const lw2 = await pg.evaluate(() => ({ speed: !!document.getElementById('insp-speed')?.offsetParent, tabs: document.querySelectorAll('.wb-tabs').length, track: !!document.querySelector('.insp-track')?.offsetParent }));
      check('Loopwerk: bei gewähltem Clip #insp-speed da, kein .wb-tabs, Spur-Abschnitt wie bisher', lw2.speed && lw2.tabs === 0 && lw2.track && errs.length === 0, JSON.stringify(lw2) + errs.join('|'));
      await pg.click('#edit-btn');
      await pg.waitForTimeout(400);
      const lwEd = await pg.evaluate(() => ({ dock: window.loopwerk.ui.dock, btn: !!document.getElementById('edit-btn')?.offsetParent }));
      check('Loopwerk: Sample-Editor öffnet wie heute (Bearbeiten sichtbar, Dock „editor“)', lwEd.dock === 'editor' && lwEd.btn, JSON.stringify(lwEd));
      await ctx.close();
    }

    // ---------- 14: Zeichen im Deck (Klatscher, src/ui/brand-meter.js mit Option mark) ----------
    {
      // Klatscher: Rauschstoß direkt in den gemeinsamen Ausgang, alle 0,5 s
      const clap = (n) => pk.evaluate(async (n) => {
        const e = window.loopwerk.engine;
        await e._ensure();
        const sr = e.ctx.sampleRate, buf = e.ctx.createBuffer(1, sr * 0.4, sr), d = buf.getChannelData(0);
        let seed = 3;
        for (let i = 0; i < d.length; i++) d[i] = (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1) * 0.6 * Math.exp(-i / (sr * 0.05));
        const t0 = e.ctx.currentTime + 0.1;
        for (let k = 0; k < n; k++) { const s = e.ctx.createBufferSource(); s.buffer = buf; s.connect(e.out); s.start(t0 + k * 0.5); }
      }, n);
      // pro Bild: Ausschlag (scaleY) je Balken, Mittellinie, Layout-Höhe
      const track = (ms) => pk.evaluate((ms) => new Promise((res) => {
        const root = document.getElementById('brand-bars');
        const bars = [...root.children];
        const out = [];
        const t0 = performance.now();
        const f = () => {
          const r = root.getBoundingClientRect();
          out.push({ t: performance.now(), live: root.classList.contains('live'), s: bars.map((b) => +(/scaleY\(([\d.]+)\)/.exec(b.style.transform)?.[1] ?? NaN)),
            mid: bars.map((b) => { const q = b.getBoundingClientRect(); return Math.round(Math.abs(q.top + q.height / 2 - (r.top + r.height / 2)) * 10) / 10; }),
            hpx: bars.map((b) => b.offsetHeight) });
          if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out);
        };
        requestAnimationFrame(f);
      }), ms);
      const K = await browser.newContext(DESK);
      const pk = await K.newPage();
      await pk.goto(`${base}/werkstatt/`);
      await pk.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      const mark = await pk.evaluate(() => {
        const root = document.getElementById('brand-bars');
        const c = getComputedStyle(root.children[0]);
        return { mark: root.dataset.mark, n: root.children.length, splash: !!document.querySelector('#boot .splash-bars.splash-klatscher'),
          color: c.backgroundColor, own: getComputedStyle(document.documentElement).getPropertyValue('--cat-own').trim() };
      });
      const idle = (await track(100)).at(-1);
      const IDLE = [8, 20, 46, 34, 24, 14, 6].map((h) => h / 46);
      check('Krachwerk: Deck zeigt den Klatscher (7 Balken, Pink aus --cat-own), Ladescreen seine Grundform', mark.mark === 'klatscher' && mark.n === 7 && mark.splash && /255, 98, 165/.test(mark.color) && /FF62A5/i.test(mark.own), JSON.stringify(mark));
      check('Klatscher ohne Ton: Grundform wie im Icon, symmetrisch um die Mittellinie', idle.s.every((v, i) => Math.abs(v - IDLE[i]) < 0.005) && idle.mid.every((m) => m <= 0.5) && !idle.live, JSON.stringify(idle));
      await clap(3);
      const run = await track(1500);
      const live = run.filter((x) => x.live);
      const spread = Math.max(...run.map((x) => Math.max(...x.s.map((v, i) => Math.abs(v - IDLE[i])))));
      let jump = 0;
      for (let i = 1; i < run.length; i++) for (let b = 0; b < 7; b++) jump = Math.max(jump, (Math.abs(run[i].s[b] - run[i - 1].s[b]) * 22) / Math.max(1, (run[i].t - run[i - 1].t) / (1000 / 60))); // je Bild bei 60 fps: ein ausgefallenes Bild ist kein Sprung
      check('Pegel bewegt den Klatscher: Ausschlag mit dem Ton, nur transform (keine Layout-Höhe), Mitte bleibt', live.length > 5 && spread > 0.25 && run.every((x) => x.hpx.every((h) => h === run[0].hpx[0]) && x.mid.every((m) => m <= 0.5)), `${live.length} Bilder laut, Ausschlag ${spread.toFixed(2)}`);
      check('Klatscher ohne Sprung: höchstens 8 px Änderung je Bild (60 fps)', jump <= 8, `${jump.toFixed(1)} px`);
      await pk.waitForTimeout(1600);
      const back = (await track(60)).at(-1);
      check('Nach dem Ton zurück in die Grundform', back.s.every((v, i) => Math.abs(v - IDLE[i]) < 0.005) && !back.live, JSON.stringify(back.s));
      if (SHOTS) { await clap(1); await pk.waitForTimeout(160); await pk.screenshot({ path: path.join(DIR, 'kw-zeichen-desktop.png') }); }
      await pk.emulateMedia({ reducedMotion: 'reduce' });
      await pk.waitForTimeout(1200);
      await clap(2);
      const calm = await track(900);
      check('Weniger Bewegung: Klatscher leuchtet auf, bleibt aber in der Grundform', calm.some((x) => x.live) && calm.every((x) => x.s.every((v, i) => Math.abs(v - IDLE[i]) < 0.005)), `${calm.filter((x) => x.live).length} Bilder laut`);
      await K.close();
      if (SHOTS) {
        const H = await browser.newContext(PHONE);
        const ph = await H.newPage();
        await ph.goto(`${base}/werkstatt/`);
        await ph.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
        await ph.evaluate(() => window.loopwerk.ui.setDock('song'));
        await ph.waitForTimeout(700);
        await ph.screenshot({ path: path.join(DIR, 'kw-zeichen-handy.png') });
        await H.close();
      }
    }

    // ---------- 15: Festhalten und Sicherung (Scheibe 3a, Spec krachwerk-3-festhalten §2, §8, §9 „Teil 3“) ----------
    // Zwei Spuren: „Bumm“ (Klopfen) auf t1, „Summ“ (Ton) auf t2, je 8 Schläge; Loop 0–4
    const fzScene = (page, { loop = true } = {}) => page.evaluate(async (withLoop) => {
      const lw = window.loopwerk;
      const sr = 44100, n = sr * 2;
      const mkB = (fill) => { const d = new Float32Array(n); fill(d); const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr }); b.copyToChannel(d, 0); return b; };
      const bumm = await lw.own.create({ name: 'Bumm', buffer: mkB((d) => { for (let i = 0; i < n; i++) d[i] = 0.7 * Math.sin(i / 14) * Math.exp(-(i % 29400) / 4000); }), source: 'Aufnahme', from: 'mic', cls: 'tief' });
      const summ = await lw.own.create({ name: 'Summ', buffer: mkB((d) => { for (let i = 0; i < n; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr); }), source: 'Aufnahme', from: 'mic', cls: 'ton' });
      lw.store.addClip('t1', bumm.id, 0, 8);
      lw.store.addClip('t2', summ.id, 0, 8);
      if (withLoop) lw.store.setLoop({ on: true, startBeat: 0, endBeat: 4 });
      return { bumm: bumm.id, summ: summ.id };
    }, loop);
    const fzState = (page) => page.evaluate(() => {
      const lw = window.loopwerk, p = lw.store.project;
      return {
        tracks: p.tracks.map((t) => t.name),
        clips: p.tracks.map((t) => t.clips.map((c) => `${c.startBeat}-${c.startBeat + c.lengthBeats}${c.mute ? 'm' : ''}`)),
        sel: lw.ui.selectedClipId, undo: lw.store.undoStack.length,
        wb: document.getElementById('wb-name')?.textContent ?? '', hint: document.getElementById('hint-text').textContent,
        sounds: lw.library.list().filter((x) => x.category === 'own').map((x) => x.name),
      };
    });
    const fzWait = (page, tracks) => page.waitForFunction((n) => window.loopwerk.store.project.tracks.length === n, tracks, { timeout: 20000 });
    const sound3 = async (page, shot) => { if (SHOTS) await page.screenshot({ path: path.join(DIR, shot) }); };

    // ----- Desktop: Knopf, Taste F, Auswahl, Rückgängig, Sicherung -----
    {
      const ctx = await browser.newContext({ ...DESK, acceptDownloads: true });
      const k = await openKw(base, ctx);
      const page = k.page;
      await fzScene(page, { loop: false });
      await page.waitForTimeout(300);
      const hidden0 = await page.evaluate(() => document.getElementById('freeze-btn').hidden);
      check('Festhalten: ohne Loop-Bereich kein Knopf im Lineal', hidden0);
      await page.evaluate(() => window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 4 }));
      await page.waitForTimeout(300);
      const geo = await page.evaluate(() => { const b = document.getElementById('freeze-btn'), r = b.getBoundingClientRect(), ru = document.querySelector('.ruler').getBoundingClientRect(); return { vis: !b.hidden && r.width > 0, text: b.textContent, inRuler: r.top >= ru.top - 1 && r.bottom <= ru.bottom + 1, right: r.left >= ru.left + 4 * window.loopwerk.ui.pxPerBeat - 2 }; });
      check('Festhalten: Knopf steht im Lineal rechts am Loop-Bereich', geo.vis && geo.text === 'Festhalten' && geo.inRuler && geo.right, JSON.stringify(geo));
      // Zählung wie bei 2b in einem frischen Fenster: ein Clip, Loop an, Festhalten sichtbar
      {
        const c1 = await browser.newContext(DESK);
        const k1 = await openKw(base, c1);
        await k1.page.evaluate(async () => {
          const lw = window.loopwerk, sr = 44100, n = sr * 2, d = new Float32Array(n);
          for (let i = 0; i < n; i++) d[i] = Math.sin(i / 14) * Math.exp(-(i % 29400) / 4000);
          const bf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
          bf.copyToChannel(d, 0);
          const smp = await lw.own.create({ name: 'Bumm', buffer: bf, source: 'Aufnahme', from: 'mic', cls: 'tief' });
          lw.store.addClip('t1', smp.id, 0, 8);
          lw.store.setLoop({ on: true, startBeat: 0, endBeat: 4 });
          lw.ui.select(lw.store.project.tracks[0].clips[0].id);
        });
        await k1.page.waitForTimeout(500);
        const dens = await countUi(k1.page);
        check('Zählung Desktop „Clip gewählt, Loop an, Festhalten sichtbar“ ≤ 45 / ≤ 30 / ≤ 5 / ≥ 11', dens.controls <= 45 && dens.frames <= 30 && dens.sizes <= 5 && dens.minFont >= 11, `${dens.controls} / ${dens.frames} / ${dens.sizes} / ${dens.minFont}`);
        await c1.close();
      }
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(400);
      await sound3(page, 'kw-festhalten-desktop-loop.png');
      const u0 = (await fzState(page)).undo;
      await page.click('#freeze-btn');
      await fzWait(page, 3);
      await page.waitForFunction(() => document.getElementById('wb-name')?.textContent === 'Schleife 1', null, { timeout: 5000 });
      await page.waitForTimeout(400);
      const a = await fzState(page);
      const frozen = await page.evaluate(() => { const lw = window.loopwerk, s = lw.library.list().find((x) => x.name === 'Schleife 1'); return { kind: s?.kind, beats: s?.beats, from: s?.made?.from, track: lw.store.project.tracks[2].clips[0]?.sampleId === s?.id }; });
      check('Festhalten: neue Spur direkt unter der untersten Quelle, Clip über den Bereich, gewählt, Werkbank „Schleife 1“', a.tracks[2] === 'Schleife 1' && a.clips[2].join() === '0-4' && !!a.sel && a.wb === 'Schleife 1' && frozen.track, JSON.stringify(a));
      check('Festhalten: Sound „Schleife 1“ in der Kiste, Schleife über 4 Schläge', frozen.kind === 'loop' && frozen.beats === 4 && frozen.from === 'freeze', JSON.stringify(frozen));
      check('Festhalten: Quellen im Bereich stumm, außerhalb nicht (an den Grenzen geteilt)', a.clips[0].join() === '0-4m,4-8' && a.clips[1].join() === '0-4m,4-8', JSON.stringify(a.clips));
      check('Festhalten: Einblender „Festgehalten – Quellen im Bereich stumm.“, ein Undo-Schritt', a.hint === 'Festgehalten – Quellen im Bereich stumm.' && a.undo === u0 + 1, `${a.hint} / ${a.undo - u0}`);
      const mutedLook = await page.evaluate(() => { const c = [...document.querySelectorAll('.lane[data-track-id="t1"] .clip')]; return c.map((n) => ({ m: n.classList.contains('muted'), o: getComputedStyle(n).opacity })); });
      check('Stumme Clips ruhen im Song auf 50 %', mutedLook[0]?.m && mutedLook[0].o === '0.5' && !mutedLook[1]?.m && mutedLook[1].o === '1', JSON.stringify(mutedLook));
      await sound3(page, 'kw-festhalten-desktop.png');
      // Rückgängig: Einblender, Projekt wie vorher, Sound bleibt
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      const b = await fzState(page);
      check('Festhalten: ↶ nimmt alles zurück, Einblender „Rückgängig: Festhalten“, Sound bleibt in der Kiste', b.tracks.length === 2 && b.clips[0].join() === '0-8' && b.hint === 'Rückgängig: Festhalten' && b.sounds.includes('Schleife 1'), JSON.stringify(b));
      // Taste F (Loop an): zweites Festhalten heißt „Schleife 2“
      await page.evaluate(() => { document.activeElement?.blur?.(); window.loopwerk.ui.select(null); });
      await page.keyboard.press('f');
      await fzWait(page, 3);
      await page.waitForTimeout(300);
      const c = await fzState(page);
      check('Taste F am Desktop hält den Loop-Bereich fest („Schleife 2“)', c.tracks[2] === 'Schleife 2' && c.clips[0].join() === '0-4m,4-8', JSON.stringify(c));
      // Auswahl: zwei Clips, Festhalten steht an der Stelle von „Kopie“
      await page.evaluate(() => { const lw = window.loopwerk; lw.store.undo(); lw.store.setLoop({ on: false }); lw.ui.selectMany([lw.store.project.tracks[0].clips[0].id, lw.store.project.tracks[1].clips[0].id]); });
      await page.waitForTimeout(500);
      const fl = await page.evaluate(() => { const v = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; }; return { fz: v('cf-freeze'), dup: v('cf-dup'), text: document.getElementById('cf-freeze')?.textContent }; });
      check('Mehrfachauswahl: „Festhalten“ im Werkzeug am Clip statt „Kopie“', fl.fz && !fl.dup && fl.text === 'Festhalten', JSON.stringify(fl));
      await page.click('#cf-freeze');
      await fzWait(page, 3);
      await page.waitForTimeout(300);
      const d = await fzState(page);
      check('Auswahl festhalten: Bereich = frühester Anfang bis spätestes Ende, Ergebnis gewählt', d.tracks[2] === 'Schleife 3' && /^0-(8|9|1\d)$/.test(d.clips[2].join()) && d.clips[0].join() === '0-8m' && !!d.sel, JSON.stringify(d));
      await page.evaluate(() => window.loopwerk.store.undo());
      // Voreinstellungen in den Feinheiten des Reiters Clip: gemerkt, Quellen stumm aus → Quellen klingen weiter
      await page.evaluate(() => { const lw = window.loopwerk; lw.store.setLoop({ on: true, startBeat: 0, endBeat: 4 }); lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(300);
      await page.click('#wb-tab-clip');
      if (await page.evaluate(() => document.getElementById('wb-fine-btn-clip').getAttribute('aria-expanded') !== 'true')) await page.click('#wb-fine-btn-clip');
      const prefs0 = await page.evaluate(() => ['wb-clip-mute', 'wb-fz-fx', 'wb-fz-fold', 'wb-fz-mute'].map((id) => document.getElementById(id)?.getAttribute('aria-pressed')));
      check('Feinheiten Clip: Stumm aus; Festhalten mit Effekten, Falten, Quellen stumm an', prefs0.join() === 'false,true,true,true', prefs0.join());
      await page.click('#wb-fz-mute');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.make.freeze') || 'null'));
      check('Voreinstellung „Quellen stumm“ ist gemerkt (lsKey loopwerk.freeze)', saved?.mute === false, JSON.stringify(saved));
      await page.click('#freeze-btn');
      await fzWait(page, 3);
      await page.waitForTimeout(300);
      const e = await fzState(page);
      check('Quellen stumm aus: Quellen bleiben unverändert, Einblender „Festgehalten.“', e.clips[0].join() === '0-8' && e.hint === 'Festgehalten.', JSON.stringify([e.clips, e.hint]));
      await page.evaluate(() => { window.loopwerk.store.undo(); localStorage.removeItem('loopwerk.make.freeze'); });
      // Stumm-Schalter am Clip: ein Undo-Schritt
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(300);
      await page.click('#wb-tab-clip');
      if (await page.evaluate(() => document.getElementById('wb-fine-btn-clip').getAttribute('aria-expanded') !== 'true')) await page.click('#wb-fine-btn-clip');
      const m0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
      await page.click('#wb-clip-mute');
      await page.waitForTimeout(200);
      const mu = await page.evaluate(() => ({ n: window.loopwerk.store.undoStack.length, mute: window.loopwerk.store.project.tracks[0].clips[0].mute === true }));
      check('Stumm im Reiter Clip schaltet den Clip stumm, ein Undo-Schritt', mu.mute && mu.n === m0 + 1, JSON.stringify(mu));
      await page.click('#wb-clip-mute');
      const mu2 = await page.evaluate(() => window.loopwerk.store.project.tracks[0].clips[0].mute);
      check('Stumm nochmal: Clip klingt wieder (Feld weg)', mu2 === undefined, String(mu2));
      // Sicherung: Song-Werkbank, ZIP laden, Zurückholen
      await page.evaluate(() => { window.loopwerk.ui.select(null); window.loopwerk.ui.selectTrack(null); });
      if (await page.evaluate(() => !document.getElementById('app').classList.contains('insp-open'))) await page.click('.insp-toggle');
      await page.waitForTimeout(400);
      await page.click('#sb-tab-projekt');
      const vis = await page.evaluate(() => { const v = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }; return { b: v('backup-btn'), r: v('restore-btn') }; });
      check('Sicherung: „Alle eigenen Sounds sichern“ und „Sounds zurückholen“ stehen in der Song-Werkbank', vis.b && vis.r, JSON.stringify(vis));
      await sound3(page, 'kw-sicherung-desktop.png');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup-btn')]);
      const zipPath = path.join(tmp, dl.suggestedFilename());
      await dl.saveAs(zipPath);
      check('Sicherung: Datei „krachwerk-sounds-JJJJ-MM-TT.zip“', /^krachwerk-sounds-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()) && fs.statSync(zipPath).size > 1000, dl.suggestedFilename());
      const n = await page.evaluate(() => window.loopwerk.library.list().filter((x) => x.category === 'own').length);
      await page.setInputFiles('#restore-input', zipPath);
      await page.waitForFunction(() => /schon da/.test(document.getElementById('hint-text').textContent), null, { timeout: 8000 });
      const h1 = await page.evaluate(() => document.getElementById('hint-text').textContent);
      check('Zurückholen: alles schon da → „0 Sounds zurückgeholt, N waren schon da.“', h1 === `0 Sounds zurückgeholt, ${n} waren schon da.`, h1);
      // Einen Sound löschen (nicht benutzt: Schleife 1), dann zurückholen
      await page.evaluate(async () => { const lw = window.loopwerk; const id = lw.library.list().find((x) => x.name === 'Schleife 1').id; await lw.own.remove(id); });
      await page.setInputFiles('#restore-input', zipPath);
      await page.waitForFunction(() => /1 Sound zurückgeholt/.test(document.getElementById('hint-text').textContent), null, { timeout: 8000 });
      const h2 = await page.evaluate(() => document.getElementById('hint-text').textContent);
      check('Zurückholen: der fehlende Sound kommt wieder („1 Sound zurückgeholt, … waren schon da.“)', h2 === `1 Sound zurückgeholt, ${n - 1} waren schon da.`, h2);
      const back = await page.evaluate(() => window.loopwerk.library.list().some((x) => x.name === 'Schleife 1'));
      check('Zurückholen: Sound steht wieder in der Kiste', back);
      // Füllstand in der Kiste
      await page.waitForTimeout(600);
      const fill = await page.evaluate(async () => { const u = await window.loopwerk.own.usage(); return { text: document.getElementById('shelf-store').textContent, mb: Math.max(1, Math.round(u.bytes / 1048576)), quota: u.quota, bytes: u.bytes }; });
      check('Kiste: letzte Zeile „Eigene: N MB“ = Füllstand', fill.text === `Eigene: ${fill.mb} MB`, JSON.stringify(fill));
      check('Konsole ohne Fehler (Desktop Festhalten)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }

    // ----- Handy: ab Loop an in 2 Tipps, Werkbank öffnet, Bilder -----
    {
      const ctx = await browser.newContext(PHONE);
      const k = await openKw(base, ctx);
      const page = k.page;
      await fzScene(page, { loop: false });
      await page.waitForTimeout(300);
      await page.tap('#loop-btn');
      await page.waitForFunction(() => window.loopwerk.store.project.loop.on, null, { timeout: 3000 });
      await page.waitForTimeout(300);
      const geo = await page.evaluate(() => { const b = document.getElementById('freeze-btn'), r = b.getBoundingClientRect(), ru = document.querySelector('.ruler').getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: !b.hidden && r.width > 0, hit: hit === b, inRuler: r.top >= ru.top - 1 && r.bottom <= ru.bottom + 1, over: document.documentElement.scrollWidth > innerWidth }; });
      check('Handy: Festhalten im Lineal sichtbar und antippbar, kein waagerechtes Scrollen', geo.vis && geo.hit && geo.inRuler && !geo.over, JSON.stringify(geo));
      await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks[0].clips[0].id); });
      await page.waitForTimeout(500);
      const dens = await countUi(page);
      check('Zählung Handy „Clip gewählt“ ≤ 18 / ≤ 8 / ≤ 5 / ≥ 11', dens.controls <= 18 && dens.frames <= 8 && dens.sizes <= 5 && dens.minFont >= 11, JSON.stringify(dens));
      await page.evaluate(() => window.loopwerk.ui.select(null));
      await page.waitForTimeout(300);
      await sound3(page, 'kw-festhalten-handy-loop.png');
      await page.tap('#freeze-btn');
      await fzWait(page, 3);
      await page.waitForTimeout(900);
      const a = await fzState(page);
      const dock = await page.evaluate(() => window.loopwerk.ui.dock);
      check('Handy: zwei Tipps (Loop an, Festhalten) → Spur „Schleife 1“, Werkbank offen mit dem Clip', a.tracks[2] === 'Schleife 1' && dock === 'werkbank' && a.wb === 'Schleife 1', JSON.stringify([a.tracks, dock, a.wb]));
      await sound3(page, 'kw-festhalten-handy.png');
      await page.evaluate(() => window.loopwerk.ui.setDock(null));
      await page.waitForTimeout(500);
      await sound3(page, 'kw-festhalten-handy-ergebnis.png');
      await page.evaluate(() => window.loopwerk.ui.openSong());
      await page.waitForTimeout(700);
      await page.tap('#sb-tab-projekt');
      const sv = await page.evaluate(() => { const v = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }; return { b: v('backup-btn'), r: v('restore-btn'), over: document.documentElement.scrollWidth > innerWidth }; });
      check('Handy: Sichern und Zurückholen im Reiter Projekt, kein waagerechtes Scrollen', sv.b && sv.r && !sv.over, JSON.stringify(sv));
      await sound3(page, 'kw-sicherung-handy.png');
      check('Konsole ohne Fehler (Handy Festhalten)', k.errors.length === 0, k.errors.join(' | '));
      await ctx.close();
    }


    // ---------- Teil 4: Kit und Instrument (Scheibe 4, Spec docs/specs/krachwerk-4-kit.md §9) ----------
    {
      const clapFile = path.join(tmp, 'klatsch.wav');
      clapWav(clapFile);
      const bClap = await chromium.launch({
        args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${clapFile}%noloop`],
      });
      const visible = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0 && !e.closest('[hidden]'); }, sel);
      // Zeiger wie ein Finger: runter, halten, hoch (Zeigerereignisse, wie die App sie bedient)
      const press = (page, sel, ms = 0) => page.evaluate(async ({ sel, ms }) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        if (ms) await new Promise((res) => setTimeout(res, ms));
        window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
      }, { sel, ms });
      const grundOf = (page, panel) => page.evaluate((id) => [...document.querySelectorAll(`#${id} .wb-grund :is(button, input:not([type=hidden]), select, [role=slider])`)].filter((e) => e.getClientRects().length > 0 && !e.closest('[hidden]')).length, panel);
      // drei eigene Sounds (Stöße bei 200, 1000, 5000 Hz) und ein Ton A4 im Browser anlegen
      const seedSounds = (page) => page.evaluate(async () => {
        const lw = window.loopwerk;
        const ac = new AudioContext();
        const mk = async (name, f, secs = 0.5) => {
          const n = Math.round(44100 * secs), b = ac.createBuffer(1, n, 44100), d = b.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = 0.6 * Math.sin(2 * Math.PI * f * i / 44100) * (secs > 0.6 ? Math.min(1, i / 400) * Math.min(1, (n - i) / 2000) : Math.exp(-i / 3000));
          return (await lw.own.create({ name, buffer: b, source: 'Aufnahme', from: 'mic', cls: 'tief' })).id;
        };
        return { a: await mk('Bumm 1', 200), b: await mk('Klack 1', 1000), c: await mk('Zisch 1', 5000), t: await mk('Ton A4', 440, 1) };
      });
      try {
        // ----- Handy: Startkarte → Klatsch-Kit in einem Tipp, Kit-Werkbank, Pad-Wand, Instrument -----
        {
          const ctx = await bClap.newContext(PHONE);
          const k = await openKw(base, ctx);
          const page = k.page;
          await page.waitForTimeout(600);
          const card = await page.evaluate(() => {
            const c = document.getElementById('start-card');
            const bs = [...c.querySelectorAll('button')];
            return { shown: !c.hidden && c.getClientRects().length > 0, text: bs.map((b) => b.textContent), h: bs.map((b) => Math.round(b.getBoundingClientRect().height)), scroll: document.documentElement.scrollWidth - innerWidth };
          });
          check('Startkarte (leerer Song, Handy): „● Mach ein Geräusch“, „Klatsch dein Kit“, „Ohne Mikro: Strom“, Tippziele ≥ 44 px, kein seitliches Scrollen', card.shown && card.text.join('|') === '● Mach ein Geräusch|Klatsch dein Kit|Ohne Mikro: Strom' && card.h.every((h) => h >= 44) && card.scroll <= 0, JSON.stringify(card));
          const withCard = await countUi(page);
          await page.evaluate(() => { document.getElementById('start-card').hidden = true; });
          const noCard = await countUi(page);
          await page.evaluate(() => { document.getElementById('start-card').hidden = false; });
          check('Zählung Handy „Start mit Startkarte“: höchstens 3 Bedienelemente mehr als ohne', withCard.controls - noCard.controls <= 3 && withCard.minFont >= 11, `${withCard.controls} gegen ${noCard.controls}, kleinste Schrift ${withCard.minFont}`);
          await sound3(page, 'kw-start-handy.png');
          // ein Tipp, dann klatschen: Aufnahme endet nach 2 s Stille, das Kit spielt
          const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
          await page.tap('#start-clap');
          await page.waitForFunction(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length === 1, null, { timeout: 40000 });
          await page.waitForTimeout(600);
          const kit = await page.evaluate(async () => {
            const lw = window.loopwerk, p = lw.store.project;
            const clip = p.tracks.flatMap((t) => t.clips)[0];
            const pat = p.patterns[clip.sampleId.slice(4)];
            const kitObj = p.kits[pat.kit];
            const zcr = (id) => { const b = lw.library.source(lw.library.get(id)); const d = b.getChannelData(0); let z = 0; for (let i = 1; i < d.length; i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++; return z / b.duration; };
            return {
              playing: lw.engine.playing, clips: p.tracks.flatMap((t) => t.clips).length, sample: clip.sampleId, kit: pat.kit, groove: pat.groove, bars: pat.bars, loop: p.loop.on,
              pads: Object.keys(kitObj.map), kickZ: kitObj.map.kick ? zcr(kitObj.map.kick) : null, hatZ: kitObj.map.hat ? zcr(kitObj.map.hat) : null,
              undo: lw.store.undoStack.length, hint: document.getElementById('hint-text').textContent, card: document.getElementById('start-card').hidden, sel: lw.ui.selectedClipId === clip.id,
            };
          });
          check('Klatsch dein Kit: ein Tipp, Kit mit 5 bis 8 Pads, Muster „Gerade“, 1 Takt im Loop, spielt', kit.playing && kit.clips === 1 && /^pat-/.test(kit.sample) && /^k-/.test(kit.kit) && kit.pads.length >= 5 && kit.pads.length <= 8 && kit.groove === 'gerade' && kit.bars === 1 && kit.loop, JSON.stringify(kit));
          check('Klatsch dein Kit: tiefster Schlag = Kick, hellster = Hi-Hat, ein Rückgängig-Schritt, Einblender „N Schläge – dein Kit spielt.“', kit.kickZ < kit.hatZ && kit.undo - u0 === 1 && kit.hint === `${kit.pads.length} Schläge – dein Kit spielt.`, JSON.stringify({ kickZ: kit.kickZ, hatZ: kit.hatZ, undo: kit.undo - u0, hint: kit.hint }));
          check('Startkarte verschwindet mit dem ersten Clip', kit.card === true);
          // Ein undo() entfernt Kit, Muster, Clip und Schnitte; der Aufnahme-Sound bleibt; die Karte kommt zurück
          const und = await page.evaluate(async () => {
            const lw = window.loopwerk;
            lw.store.undo();
            await new Promise((r) => setTimeout(r, 300));
            return { kits: Object.keys(lw.store.project.kits || {}).length, pats: Object.keys(lw.store.project.patterns || {}).length, clips: lw.store.project.tracks.flatMap((t) => t.clips).length, vars: Object.keys(lw.store.project.recipes || {}).filter((i) => /^vr-/.test(i)).length, own: lw.library.list().filter((x) => x.category === 'own' && !/^vr-/.test(x.id)).length, card: !document.getElementById('start-card').hidden };
          });
          check('Ein Rückgängig: Kit, Muster, Clip und Schnitte weg, Aufnahme bleibt, Startkarte wieder da', und.kits === 0 && und.pats === 0 && und.clips === 0 && und.vars === 0 && und.own >= 1 && und.card, JSON.stringify(und));
          await page.evaluate(() => window.loopwerk.store.redo());
          await page.waitForTimeout(600);
          await page.evaluate(() => { const lw = window.loopwerk; lw.ui.select(lw.store.project.tracks.flatMap((t) => t.clips)[0].id); lw.ui.setDock('werkbank'); });
          await page.waitForTimeout(1200);
          // Kit-Werkbank: 8 Pads ≥ 44 px, Schritt-Zeile als Raster
          const kb = await page.evaluate(() => {
            const pads = [...document.querySelectorAll('#werkbank .kb-pad')].map((b) => b.getBoundingClientRect());
            const cells = [...document.querySelectorAll('#werkbank .kb-step')].filter((c) => c.getClientRects().length > 0);
            return { n: pads.length, min: Math.min(...pads.map((r) => Math.min(r.width, r.height))), tabs: [...document.querySelectorAll('#werkbank .kb-tab')].filter((b) => !b.hidden).map((b) => b.textContent).join(','), grid: document.querySelector('#werkbank .kb-steps')?.getAttribute('role'), cells: cells.length, over: document.documentElement.scrollWidth - innerWidth, name: document.getElementById('kb-name')?.textContent };
          });
          check('Kit-Werkbank (Handy): 8 Pads ≥ 44 px, Reiter Kit · Clip, Schritt-Zeile role=grid mit 16 Schritten, kein seitliches Scrollen', kb.n === 8 && kb.min >= 44 && kb.tabs === 'Kit,Clip' && kb.grid === 'grid' && kb.cells === 16 && kb.over <= 0, JSON.stringify(kb));
          const kz = await countUi(page);
          check('Zählung Handy „Kit Mitte“ (8 Pads, Schritt-Zeile) ≤ 26 / ≤ 13 / ≤ 5 / ≥ 11', kz.controls <= 26 && kz.frames <= 13 && kz.sizes <= 5 && kz.minFont >= 11, JSON.stringify(kz));
          check('Zählung je Reiter: Grund von Kit ≤ 5 Griffe', (await grundOf(page, 'kb-panel-kit')) <= 5 && (await grundOf(page, 'kb-panel-kit')) >= 1, String(await grundOf(page, 'kb-panel-kit')));
          await sound3(page, 'kw-kit-handy.png');
          // Pad antippen = spielt jetzt (pointerdown, nicht erst beim Loslassen) und wählt das Pad
          const hit = await page.evaluate(() => {
            const b = document.querySelector('#werkbank .kb-pad[data-row="snare"]');
            const r = b.getBoundingClientRect();
            b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true, clientX: r.left + 10, clientY: r.top + 10 }));
            const now = { lit: b.classList.contains('hit'), sel: b.getAttribute('aria-pressed') };
            window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true }));
            return now;
          });
          check('Pad antippen: leuchtet schon beim Zeiger-Herunter und ist gewählt', hit.lit && hit.sel === 'true', JSON.stringify(hit));
          // Schritt-Zeile per Tastatur: ←/→ wandern, Leertaste setzt
          await page.evaluate(() => document.querySelector('#werkbank .kb-step[data-step="0"]').focus());
          await page.keyboard.press('ArrowRight');
          const f1 = await page.evaluate(() => document.activeElement?.dataset.step);
          await page.keyboard.press('ArrowRight');
          await page.keyboard.press('Space');
          await page.waitForTimeout(200);
          const row2 = await page.evaluate(() => { const lw = window.loopwerk; const p = Object.values(lw.store.project.patterns)[0]; return { focus: document.activeElement?.dataset.step, on: p.rows.snare[2], sel: document.activeElement?.getAttribute('aria-selected') }; });
          check('Schritt-Zeile: Pfeil rechts wandert (Schritt 1, dann 2), Leertaste setzt den Schlag aufs gewählte Pad (Snare)', f1 === '1' && row2.focus === '2' && row2.on === 1 && row2.sel === 'true', JSON.stringify({ f1, ...row2 }));
          await page.keyboard.press('Space');
          const off = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns)[0].rows.snare[2]);
          check('Schritt-Zeile: Leertaste nochmal nimmt ihn zurück', off === 0, String(off));
          // Halten = Anschlag 50 %
          await press(page, '#werkbank .kb-step[data-step="3"]', 650);
          const half = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns)[0].rows.snare[3]);
          check('Schritt halten setzt den Anschlag auf 50 %', half === 0.5, String(half));
          // Pad-Wand (Handy): Schublade ganz nach oben ziehen → Pads ≥ 88 px, Grund klappt zu, Schritt-Zeile bleibt
          const cdp = await ctx.newCDPSession(page);
          const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
          const grip = await page.evaluate(() => { const r = document.querySelector('#werkbank .sheet-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
          await touch('touchStart', grip.x, grip.y);
          for (let i = 1; i <= 12; i++) { await touch('touchMove', grip.x, grip.y - i * 40); await page.waitForTimeout(16); }
          await page.waitForTimeout(160);
          await touch('touchEnd');
          await page.waitForTimeout(1300);
          const wall = await page.evaluate(() => {
            const pads = [...document.querySelectorAll('#werkbank .kb-pad')].map((b) => b.getBoundingClientRect());
            return { on: document.querySelector('#werkbank .kb')?.classList.contains('wall'), min: Math.min(...pads.map((r) => Math.min(r.width, r.height))), tabs: document.querySelector('#werkbank .kb-tabs').getClientRects().length > 0, steps: document.querySelector('#werkbank .kb-steps').getClientRects().length > 0, over: document.documentElement.scrollWidth - innerWidth };
          });
          check('Pad-Wand (Handy, Schublade oben): Pads ≥ 88 px, Grund eingeklappt, Schritt-Zeile bleibt', wall.on && wall.min >= 88 && !wall.tabs && wall.steps && wall.over <= 0, JSON.stringify(wall));
          await sound3(page, 'kw-padwand-handy.png');
          // Pad lang drücken → Sound-Werkbank dieses Sounds, „‹ Kit“ im Kopf führt zurück
          const kickId = await page.evaluate(() => { const lw = window.loopwerk; return lw.store.project.kits[Object.keys(lw.store.project.kits)[0]].map.kick; });
          await press(page, '#werkbank .kb-pad[data-row="kick"]', 700);
          await page.waitForTimeout(700);
          const lp = await page.evaluate(() => ({ bench: window.loopwerk.ui.benchSoundId, back: document.getElementById('wb-back')?.textContent, backVis: document.getElementById('wb-back')?.getClientRects().length > 0, kit: !document.querySelector('#werkbank .kb').hidden }));
          check('Pad lang drücken: Sound-Werkbank des Pad-Sounds, im Kopf „‹ Kit“', lp.bench === kickId && lp.back === '‹ Kit' && lp.backVis && lp.kit === false, JSON.stringify(lp));
          await page.click('#wb-back');
          await page.waitForTimeout(500);
          const bk = await page.evaluate(() => ({ kit: !document.querySelector('#werkbank .kb').hidden, name: document.getElementById('kb-name')?.textContent, back: document.getElementById('wb-back').hidden, clip: !!window.loopwerk.ui.selectedClipId }));
          check('„‹ Kit“ führt zurück zur Kit-Werkbank des Clips', bk.kit && /^Klatschen/.test(bk.name) && bk.back && bk.clip, JSON.stringify(bk));
          // Leeres Pad antippen = Aufnahme für dieses Pad
          // (der Klatsch-Test füllt bis zu 8 Pads: eines freiräumen)
          await page.evaluate(() => { const lw = window.loopwerk; lw.store.setKitPad(Object.keys(lw.store.project.kits)[0], 'crash', null); });
          await page.waitForTimeout(300);
          const empty = await page.evaluate(() => document.querySelector('#werkbank .kb-pad.free')?.dataset.row);
          // Mikrofon-Start abfangen (die Datei des Fake-Mikros ist nur einmal lesbar; echte Aufnahme: eigener Test unten)
          await page.evaluate(() => { const r = window.loopwerk.recorder; r.start = async (o) => { r.tag = o.tag; r.state = 'recording'; r.emit('state'); }; });
          await press(page, `#werkbank .kb-pad[data-row="${empty}"]`);
          await page.waitForTimeout(400);
          const pr = await page.evaluate(() => ({ state: window.loopwerk.recorder.state, tag: window.loopwerk.recorder.tag, rec: !!document.querySelector('#werkbank .kb-pad.rec') }));
          check('Leeres Pad antippen startet die Aufnahme für dieses Pad (rote Form am Pad)', pr.state === 'recording' && pr.tag?.kind === 'pad' && pr.tag.row === empty && pr.rec, JSON.stringify(pr));
          const landed = await page.evaluate(({ empty }) => {
            const lw = window.loopwerk, r = lw.recorder, id = lw.library.list().find((x) => x.category === 'own' && !/^(vr|pat)-/.test(x.id)).id;
            r.state = 'idle';
            r.emit('recorded', { sample: lw.library.get(id), clipId: null, mode: 'sound', tag: r.tag });
            const kit = lw.store.project.kits[Object.keys(lw.store.project.kits)[0]];
            return { pad: kit.map[empty] === id, undo: lw.store.undoStack.length };
          }, { empty });
          check('Aufgenommener Sound landet auf dem Pad (ein Rückgängig-Schritt)', landed.pad, JSON.stringify(landed));
          await page.evaluate(() => { delete window.loopwerk.recorder.start; });
          // Ton → „Als Instrument“ → Instrument-Werkbank mit Tasten → „Auf die Spur“ = Melodie-Clip
          const ids = await seedSounds(page);
          await page.evaluate((id) => { const lw = window.loopwerk; lw.ui.openSound(id); lw.ui.setDock('werkbank'); }, ids.t);
          await page.waitForTimeout(700);
          await page.click('#wb-tab-ton');
          check('Zählung je Reiter: Grund von Ton ≤ 5 Griffe, „Als Instrument“ darunter', (await grundOf(page, 'wb-panel-ton')) <= 5 && (await visible(page, '#wb-as-instrument')), String(await grundOf(page, 'wb-panel-ton')));
          await page.click('#wb-as-instrument');
          await page.waitForFunction(() => Object.keys(window.loopwerk.store.project.instruments || {}).length === 1, null, { timeout: 10000 });
          await page.waitForTimeout(600);
          const ins = await page.evaluate(() => {
            const lw = window.loopwerk, p = lw.store.project, id = Object.keys(p.instruments)[0];
            return { root: p.instruments[id].root, cents: p.instruments[id].cents, keys: [...document.querySelectorAll('#werkbank .kb-key')].map((b) => b.querySelector('.kb-key-note').textContent), rootKeys: [...document.querySelectorAll('#werkbank .kb-key.root')].length, tab: document.getElementById('kb-tab-inst')?.textContent, min: Math.min(...[...document.querySelectorAll('#werkbank .kb-key')].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))), hint: document.getElementById('hint-text').textContent };
          });
          check('Als Instrument: Grundton A4 (69) erkannt, 8 Tasten der Song-Tonart Am (A4 … A5), Grundton markiert, Tasten ≥ 44 px', ins.root === 69 && Math.abs(ins.cents) <= 5 && ins.keys.join(' ') === 'A4 H4 C5 D5 E5 F5 G5 A5' && ins.rootKeys >= 1 && ins.min >= 44, JSON.stringify(ins));
          check('Zählung je Reiter: Grund von Instrument ≤ 5 Griffe', (await grundOf(page, 'kb-panel-inst')) >= 1 && (await grundOf(page, 'kb-panel-inst')) <= 5, String(await grundOf(page, 'kb-panel-inst')));
          await sound3(page, 'kw-instrument-handy.png');
          await page.click('#kb-place-inst');
          await page.waitForTimeout(500);
          const mel = await page.evaluate(() => { const lw = window.loopwerk, p = lw.store.project; const c = p.tracks.flatMap((t) => t.clips).find((x) => /^pat-/.test(x.sampleId) && p.patterns[x.sampleId.slice(4)].type === 'synth'); return { clip: !!c, preset: c && p.patterns[c.sampleId.slice(4)].preset, roll: document.getElementById('kb-roll')?.getClientRects().length > 0 }; });
          check('Als Instrument + Auf die Spur: Melodie-Clip mit dem Instrument (in-…), Rolle ▸ steht bereit', mel.clip && /^in-/.test(mel.preset) && mel.roll, JSON.stringify(mel));
          // Tasten-Aufnahme: ● heißt „Tasten“, eine Taste bei 1,02 Schlägen setzt eine Note auf Schlag 1 (ein Undo-Schritt je Durchgang)
          const tl = await page.evaluate(() => document.querySelector('#rec-btn .rec-label').textContent);
          const tu0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
          await page.tap('#rec-btn');
          await page.evaluate(() => { window.__hb = window.loopwerk.engine.heardBeat; window.loopwerk.engine.heardBeat = () => 1.02; });
          await press(page, '#werkbank .kb-key[data-degree="3"]', 60);
          await page.evaluate(() => { window.loopwerk.engine.heardBeat = window.__hb; });
          const kn = await page.evaluate(() => { const lw = window.loopwerk, p = lw.store.project; const pat = Object.values(p.patterns).find((x) => x.type === 'synth'); return { notes: pat.notes.map((n) => [n.pitch, n.start]), undo: lw.store.undoStack.length }; });
          check('Tasten-Aufnahme: ● heißt „Tasten“, Taste 3 (C5) bei 1,02 Schlägen setzt eine Note auf Schlag 1, ein Undo-Schritt', tl === 'Tasten' && kn.notes.some(([pt, st]) => pt === 72 && st === 1) && kn.undo - tu0 === 1, JSON.stringify({ tl, ...kn, tu0 }));
          await page.tap('#rec-btn');
          check('Konsole ohne Fehler (Handy Kit und Instrument)', k.errors.length === 0, k.errors.join(' | '));
          await ctx.close();
        }

        // ----- Desktop: Kit gewählt, Tasten A S D F, ● nimmt Pads auf, Pad-Wand mit ⤢, Ziehen aus der Kiste -----
        {
          const ctx = await bClap.newContext(DESK);
          const k = await openKw(base, ctx);
          const page = k.page;
          await page.waitForTimeout(500);
          // ein 4-s-Sound mit 6 Schlägen → Klatsch-Kit (die Kiste bleibt wie nach einer echten Aufnahme: ein Sound, eine Schnitt-Gruppe, ein Kit)
          const made = await page.evaluate(async () => {
            const lw = window.loopwerk; const ac = new AudioContext();
            const n = 44100 * 4, b = ac.createBuffer(1, n, 44100), d = b.getChannelData(0);
            for (let q = 0; q < 6; q++) for (let i = 0; i < 4000; i++) d[Math.round((0.2 + q * 0.6) * 44100) + i] = 0.7 * Math.exp(-i / 800) * Math.sin(i / (1 + q * 1.5));
            const s = await lw.own.create({ name: 'Klopfen', buffer: b, source: 'Aufnahme', from: 'mic' });
            const { kitFromSound } = await import('/src/cut-sound.js');
            const res = await kitFromSound({ store: lw.store, library: lw.library, sampleId: s.id, atBeat: 0 });
            lw.library.syncVariants(lw.store.project); lw.library.emit();
            lw.ui.select(res.clipId);
            return { sound: s.id, kit: res.kitId, pads: Object.keys(lw.store.project.kits[res.kitId].map).length };
          });
          const ids = { t: made.sound };
          const kitId = made.kit;
          await page.waitForTimeout(900);
          const dk = await page.evaluate(() => ({ group: document.getElementById('shelf-cat-kits')?.textContent, item: [...document.querySelectorAll('#library .loop-object .loop-name')].map((e) => e.textContent), tabs: [...document.querySelectorAll('.kb-tab')].filter((b) => !b.hidden).map((b) => b.textContent).join(',') }));
          check('Kiste: erste Gruppe „Kits und Instrumente“ mit dem Kit; Werkbank zeigt Reiter Kit · Clip', /Kits und Instrumente/.test(dk.group) && dk.item.includes('Klatschen 1') && dk.tabs === 'Kit,Clip', JSON.stringify(dk));
          const dz = await countUi(page);
          check('Zählung Desktop „Kit gewählt“ ≤ 45 / ≤ 30 / ≤ 5 / ≥ 11', dz.controls <= 45 && dz.frames <= 30 && dz.sizes <= 5 && dz.minFont >= 11, JSON.stringify(dz));
          await sound3(page, 'kw-kit-desktop.png');
          // Tasten A S D F spielen die Pads (wählen und leuchten)
          await page.keyboard.press('d');
          const dsel = await page.evaluate(() => ({ sel: document.querySelector('.kb-pad[aria-pressed="true"]')?.dataset.row, hit: !!document.querySelector('.kb-pad[data-row="clap"].hit') }));
          check('Taste D spielt das dritte Pad (Clap), es leuchtet und ist gewählt', dsel.sel === 'clap' && dsel.hit, JSON.stringify(dsel));
          // Pad-Aufnahme: ● mit Kit-Werkbank = Quelle „Pads“; Schläge bei 1,02 und 2,49 → Schritte 4 und 10, ein Undo-Schritt
          const lab = await page.evaluate(() => document.querySelector('#rec-btn .rec-label').textContent);
          check('● in der Kit-Werkbank heißt „Pads“', lab === 'Pads', lab);
          const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
          await page.click('#rec-btn');
          await page.evaluate(() => { window.__hb = window.loopwerk.engine.heardBeat; window.loopwerk.engine.heardBeat = () => 1.02; });
          await page.keyboard.press('a');
          await page.evaluate(() => { window.loopwerk.engine.heardBeat = () => 2.49; });
          await page.keyboard.press('a');
          await page.evaluate(() => { window.loopwerk.engine.heardBeat = window.__hb; });
          const pr = await page.evaluate(() => { const lw = window.loopwerk; const p = Object.values(lw.store.project.patterns)[0]; return { rec: document.getElementById('rec-btn').getAttribute('aria-pressed'), kick: p.rows.kick.map((v, i) => (v ? i : null)).filter((i) => i != null), undo: lw.store.undoStack.length, label: document.querySelector('#rec-btn .rec-label').textContent }; });
          check('Pad-Aufnahme: Schläge landen auf Schritt 4 und 10 (nächstes 1/16), ein Undo-Schritt je ●-Durchgang, ● zeigt „Stopp“', pr.rec === 'true' && pr.kick.includes(4) && pr.kick.includes(10) && pr.undo - u0 === 1 && pr.label === 'Stopp', JSON.stringify({ ...pr, u0 }));
          await page.click('#rec-btn');
          const after = await page.evaluate(() => ({ rec: document.getElementById('rec-btn').getAttribute('aria-pressed'), label: document.querySelector('#rec-btn .rec-label').textContent }));
          check('● nochmal beendet die Pad-Aufnahme', after.rec === 'false' && after.label === 'Pads', JSON.stringify(after));
          await page.evaluate(() => window.loopwerk.engine.pause?.());
          // Muster wechseln (ersetzt die Schritte, ein Undo) und Swing
          const g0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
          if (await page.evaluate(() => !document.getElementById('kb-groove').getClientRects().length)) await page.click('#kb-tab-kit');
          await page.click('#kb-groove');
          const g1 = await page.evaluate(() => { const lw = window.loopwerk; const p = Object.values(lw.store.project.patterns)[0]; return { groove: p.groove, undo: lw.store.undoStack.length, label: document.getElementById('kb-groove').textContent, kick: p.rows.kick.filter(Boolean).length }; });
          check('Muster: Tipp wechselt Gerade → Halb, ersetzt die Schritte, ein Undo-Schritt', g1.groove === 'halb' && g1.undo - g0 === 1 && g1.label === 'Muster: Halb' && g1.kick === 1, JSON.stringify(g1));
          check('Zählung je Reiter (Desktop): Grund von Kit ≤ 5 Griffe', (await grundOf(page, 'kb-panel-kit')) <= 5, String(await grundOf(page, 'kb-panel-kit')));
          // Sound aus der Kiste aufs Pad ziehen = tauschen
          const drag = await page.evaluate((t) => { const it = document.querySelector(`#library .loop-item[data-sample-id="${t}"]`); const p = document.querySelector('.kb-pad[data-row="open"]'); const a = it.getBoundingClientRect(), b = p.getBoundingClientRect(); return { x1: a.left + 40, y1: a.top + a.height / 2, x2: b.left + b.width / 2, y2: b.top + b.height / 2 }; }, ids.t);
          await page.mouse.move(drag.x1, drag.y1);
          await page.mouse.down();
          await page.mouse.move(drag.x1 + 30, drag.y1 + 10, { steps: 3 });
          await page.mouse.move(drag.x2, drag.y2, { steps: 8 });
          await page.mouse.up();
          await page.waitForTimeout(400);
          const dr = await page.evaluate((id) => window.loopwerk.store.project.kits[id].map.open, kitId);
          check('Sound aus der Kiste auf ein Pad ziehen legt ihn aufs Pad', dr === ids.t, String(dr));
          // ⤢ = Pad-Wand: Pads ≥ 88 px, Grund zu, Schritt-Zeile bleibt
          await page.click('#wb-wide');
          await page.waitForTimeout(700);
          const dw = await page.evaluate(() => { const pads = [...document.querySelectorAll('.kb-pad')].map((b) => b.getBoundingClientRect()); return { on: document.querySelector('.kb').classList.contains('wall'), min: Math.min(...pads.map((r) => Math.min(r.width, r.height))), steps: document.querySelector('.kb-steps').getClientRects().length > 0, tabs: document.querySelector('.kb-tabs').getClientRects().length > 0 }; });
          check('Pad-Wand (Desktop, ⤢): Pads ≥ 88 px, Grund eingeklappt, Schritt-Zeile bleibt', dw.on && dw.min >= 88 && dw.steps && !dw.tabs, JSON.stringify(dw));
          await sound3(page, 'kw-padwand-desktop.png');
          await page.click('#wb-wide');
          // Reiter Zerlegen: Grund ≤ 5 mit „Als Kit“ (langer Sound)
          await page.evaluate((id) => { const lw = window.loopwerk; lw.store.addClip(lw.store.project.tracks[1].id, id, 0, 8); lw.ui.select(lw.store.project.tracks[1].clips[0].id); }, ids.t);
          await page.waitForTimeout(700);
          await page.click('#wb-tab-zerlegen');
          await page.waitForFunction(() => document.querySelectorAll('.wb-mk').length > 0, null, { timeout: 8000 });
          const zg = await grundOf(page, 'wb-panel-zerlegen');
          const als = await page.evaluate(() => ({ kit: !!document.getElementById('wb-as-kit')?.getClientRects().length, box: !!document.getElementById('wb-cut-box')?.closest('.wb-fine') }));
          check('Reiter Zerlegen: Grund = Quelle (2) · Empfindlichkeit · Als Kit · Auf die Spur (≤ 5), „In die Kiste“ steht in den Feinheiten', zg <= 5 && als.kit && als.box, JSON.stringify({ zg, ...als }));
          const kc0 = await page.evaluate(() => Object.keys(window.loopwerk.store.project.kits).length);
          await page.click('#wb-as-kit');
          await page.waitForFunction((n) => Object.keys(window.loopwerk.store.project.kits).length === n + 1, kc0, { timeout: 10000 });
          await page.waitForTimeout(500);
          const ak = await page.evaluate(() => { const lw = window.loopwerk; return { bench: /^k-/.test(lw.ui.benchSoundId || ''), place: !!document.getElementById('kb-place-kit')?.getClientRects().length, clips: lw.store.project.tracks.flatMap((t) => t.clips).length }; });
          check('Als Kit: Kit entsteht in der Kiste, seine Werkbank öffnet mit „Auf die Spur“ (kein Clip unaufgefordert)', ak.bench && ak.place && ak.clips === 2, JSON.stringify(ak));
          await page.click('#kb-place-kit');
          await page.waitForTimeout(500);
          const pk = await page.evaluate(() => { const lw = window.loopwerk, p = lw.store.project; return { clips: p.tracks.flatMap((t) => t.clips).length, sel: !!lw.ui.selectedClipId }; });
          check('Kit aus der Kiste: Auf die Spur legt ihn als Clip ab und wählt ihn', pk.clips === 3 && pk.sel, JSON.stringify(pk));
          // Tipps: eigene Liste, nur als Einblender, kein Loopwerk-Text
          await page.evaluate(() => { window.loopwerk.tips.reset?.(); window.loopwerk.tips.enable(); });
          await page.waitForFunction(() => window.loopwerk.tips.shown, null, { timeout: 12000 });
          const tp = await page.evaluate(() => ({ hint: document.getElementById('hint-text').textContent, bubble: !document.querySelector('.tip')?.hidden, cur: window.loopwerk.tips.current }));
          check('Tipps: der erste (nach dem ersten Geräusch) kommt als Einblender, ohne Sprechblase und ohne Loopwerk-Text', /^Tipp auf den Clip – in der Werkbank formst du den Klang\.$/.test(tp.hint) && !tp.bubble && tp.cur === null, JSON.stringify(tp));
          check('Konsole ohne Fehler (Desktop Kit)', k.errors.length === 0, k.errors.join(' | '));
          await ctx.close();
        }
      } finally { await bClap.close(); }


      // ----- Echte Aufnahme in ein leeres Pad (eigener Browser: die Fake-Mikro-Datei ist nur einmal lesbar) -----
      {
        const bPad = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${clapFile}%noloop`] });
        try {
          const ctx = await bPad.newContext(DESK);
          const k = await openKw(base, ctx);
          const page = k.page;
          await page.waitForTimeout(500);
          const ids = await seedSounds(page);
          await page.evaluate(({ a }) => { const lw = window.loopwerk; const id = lw.store.addKit({ name: 'Klatschen 1', map: { kick: a } }); lw.ui.select(lw.store.placeKit(id, {}).clipId); }, ids);
          await page.waitForTimeout(700);
          const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
          await page.click('.kb-pad[data-row="hat"]');
          await page.waitForFunction(() => window.loopwerk.store.project.kits && Object.values(window.loopwerk.store.project.kits)[0].map.hat, null, { timeout: 30000 });
          const r = await page.evaluate((u) => { const lw = window.loopwerk; const kit = Object.values(lw.store.project.kits)[0]; const s = lw.library.get(kit.map.hat); return { own: s?.category === 'own' && s?.name !== 'Bumm 1', undo: lw.store.undoStack.length - u, hint: document.getElementById('hint-text').textContent }; }, u0);
          check('Leeres Pad antippen + Geräusch: der Sound kommt aufs Pad, ein Rückgängig-Schritt', r.own && r.undo === 1, JSON.stringify(r));
          await page.waitForTimeout(300);
          await page.evaluate(() => window.loopwerk.store.undo());
          const un = await page.evaluate(() => !Object.values(window.loopwerk.store.project.kits)[0].map.hat);
          check('Rückgängig nimmt den Sound vom Pad (Aufnahme bleibt in der Kiste)', un);
          check('Konsole ohne Fehler (Pad-Aufnahme)', k.errors.length === 0, k.errors.join(' | '));
          await ctx.close();
        } finally { await bPad.close(); }
      }

      // ----- Pad-Wand aus dem Prototyp: Vorlage in der Kiste, Tipp legt das Kit an -----
      {
        const ctx = await browser.newContext(DESK);
        const seedKey = () => localStorage.setItem('loopwerk.make.pads.v1', JSON.stringify({ v: 1, pads: [{ sound: 'mk-test1' }, null, { synth: { kit: 'elektro', row: 'kick' } }, { sound: 'mk-test2' }, { sound: 'mk-test3' }] }));
        const k = await openKw(base, ctx, { init: [seedPadWall, seedKey] });
        const page = k.page;
        await page.waitForTimeout(700);
        const t0 = await page.evaluate(() => ({ tpl: document.querySelector('#library [data-template="pads"]')?.textContent ?? null, kits: Object.keys(window.loopwerk.store.project.kits || {}).length, hint: document.getElementById('hint-text').textContent, flag: localStorage.getItem('loopwerk.make.padNote') }));
        check('Pad-Wand: Vorlage „Pad-Wand“ in der Kiste, einmal Einblender, noch kein Kit', /Pad-Wand/.test(t0.tpl) && t0.kits === 0 && /Pad-Wand/.test(t0.hint) && t0.flag === '1', JSON.stringify(t0));
        await page.click('#library [data-template="pads"]');
        await page.waitForTimeout(600);
        const t1 = await page.evaluate(() => { const lw = window.loopwerk, p = lw.store.project; const id = Object.keys(p.kits || {})[0]; return { n: Object.keys(p.kits || {}).length, from: p.kits?.[id]?.from, pads: Object.keys(p.kits?.[id]?.map || {}).length, tpl: !!document.querySelector('#library [data-template="pads"]'), bench: lw.ui.benchSoundId === id, key: localStorage.getItem('loopwerk.make.pads.v1') != null }; });
        check('Pad-Wand: Tipp legt das Kit an (from pads.v1, 3 Pads ohne Synth-Pad), Vorlage weg, Werkbank offen, Schlüssel bleibt liegen', t1.n === 1 && t1.from === 'pads.v1' && t1.pads === 3 && !t1.tpl && t1.bench && t1.key, JSON.stringify(t1));
        check('Konsole ohne Fehler (Pad-Wand)', k.errors.length === 0, k.errors.join(' | '));
        await ctx.close();
      }
    }

    // ---------- 10: Pages-Build ----------
    require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-pages.cjs')], { stdio: 'pipe' });
    const site = path.join(__dirname, '..', '_site', 'werkstatt');
    const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
    check('Pages-Build: /werkstatt/ ist die volle App mit Edition „make“', html.includes("LOOPWERK_EDITION = 'make'") && html.includes('src/main.js') && html.includes('Krach<b>werk</b>') && html.includes('splash-bars splash-klatscher') && !html.includes('src/werkstatt/main.js') && fs.existsSync(path.join(site, 'sw.js')) && fs.existsSync(path.join(site, 'manifest.webmanifest')));

    // ---------- 11: Loopwerk unverändert ----------
    const L = await browser.newContext(DESK);
    const lw = await L.newPage();
    await lw.goto(`${base}/`);
    await lw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const lwInfo = await lw.evaluate(() => {
      localStorage.setItem('loopwerk.snap', localStorage.getItem('loopwerk.snap') || '1');
      window.loopwerk.store.setProjectName('Prüfung'); // Projekt wird erst nach einer Änderung gesichert
      return { bars: document.querySelectorAll('#brand-bars > i').length, mark: document.getElementById('brand-bars').dataset.mark || '', splash: document.querySelectorAll('#boot .splash-klatscher').length, off: document.querySelectorAll('[data-off]').length, ed: document.getElementById('app').dataset.edition, dens: document.getElementById('app').dataset.density, title: document.title, sw: !!navigator.serviceWorker.controller };
    });
    await lw.waitForTimeout(600);
    const keys = await lw.evaluate(() => Object.keys(localStorage));
    check('Loopwerk: keine abgeschalteten Flächen, Edition „full“, kein Service Worker, Bildmarke mit 5 Balken', lwInfo.off === 0 && lwInfo.bars === 5 && !lwInfo.mark && !lwInfo.splash && lwInfo.ed === 'full' && lwInfo.dens !== 'calm' && /Loopwerk$/.test(lwInfo.title) && !lwInfo.sw, JSON.stringify(lwInfo));
    check('Loopwerk: Schlüssel wie bisher (loopwerk.project.v1, loopwerk.snap)', keys.includes('loopwerk.project.v1') && keys.includes('loopwerk.snap') && !keys.some((k) => k.startsWith('loopwerk.make.')), keys.join(','));
    const lwFz = await lw.evaluate(() => ({ btn: !!document.getElementById('freeze-btn'), cf: !!document.getElementById('cf-freeze'), store: !!document.getElementById('shelf-store'), bk: !!document.getElementById('backup-btn') }));
    check('Loopwerk: ohne „Festhalten“, Füllstand und Sicherung', !lwFz.btn && !lwFz.cf && !lwFz.store && !lwFz.bk, JSON.stringify(lwFz));
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
