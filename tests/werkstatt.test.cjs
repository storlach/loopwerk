// Krachwerk (Edition „make“, Adresse /werkstatt/): Pad-Wand mit Aufnahme + Auto-Säubern, „Klatsch dein Kit“, eigener Speicher,
// keine mitgelieferten Samples. Handy zuerst (390 × 844, Touch), dazu Desktop.
// node tests/werkstatt.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

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
    // Resonator (2 Pole) bei 1,5 kHz auf Rauschen
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
  // Aufnahme: Rauschen −60 dB, Klänge an Positionen (Sekunden) mit Pegel
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

// Fixture fürs Fake-Mikrofon: 1 s Stille, dann ein „Bumm“ (Kick), dann Stille
function micWav(file) {
  const sr = 48000, n = sr * 4;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    const k = i - sr; // Kick ab 1,0 s
    if (k >= 0 && k < sr * 0.4) { const f = 46 + 119 * Math.exp(-k / (sr * 0.03)); ph += 2 * Math.PI * f / sr; v = 0.3 * Math.sin(ph) * Math.exp(-k / (sr * 0.09)); }
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

async function open(server, browser, ctxOpts = PHONE, ctx = null) {
  const context = ctx || await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto(`http://127.0.0.1:${server.address().port}/werkstatt/`);
  await page.waitForFunction(() => window.werkstatt?.ready, null, { timeout: 15000 });
  await page.evaluate(signals);
  return { page, context, errors, requests };
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'werkstatt-')), 'bumm.wav');
  micWav(wav);
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`],
  });
  try {
    // ---------- Start: leer, eigene Edition, nichts Mitgeliefertes ----------
    const A = await open(server, browser);
    const { page } = A;
    const first = await page.evaluate(() => ({
      edition: window.werkstatt.edition.id, title: document.title, mark: document.querySelector('.wmark').textContent,
      pads: document.querySelectorAll('.wpad').length, free: document.querySelectorAll('.wpad.free').length,
      scroll: document.documentElement.scrollWidth - innerWidth,
      bar: document.querySelector('.wbar').getBoundingClientRect().bottom,
    }));
    check('Krachwerk öffnet unter /werkstatt/ als Edition „make“', first.edition === 'make' && first.title === 'Krachwerk' && first.mark === 'Krachwerk');
    check('16 Pads, alle leer', first.pads === 16 && first.free === 16, `${first.free}/${first.pads}`);
    check('Handy: kein seitliches Scrollen, Werkzeugleiste im Bild', first.scroll <= 0 && first.bar <= 844, `bar ${Math.round(first.bar)}`);
    const sounds = A.requests.filter((p) => /\/assets\//.test(p) && !/\/assets\/icons\//.test(p));
    check('Keine mitgelieferten Samples geladen (keine Anfrage unter assets/)', sounds.length === 0, sounds.slice(0, 3).join(', '));

    // ---------- Säubern ----------
    const clean = await page.evaluate(async () => {
      const { cleanTake } = await import('./src/werkstatt/clean.js');
      const sr = 48000;
      const raw = window.sig.take(sr, 2, [[window.sig.snare, 0.731, 0.3, 0.3]]);
      const onset = Math.round(sr * 0.731);
      const c = cleanTake([raw, raw.slice()], sr);
      let peak = 0;
      for (const v of c.chs[0]) peak = Math.max(peak, Math.abs(v));
      const silent = cleanTake([window.sig.take(sr, 1, []), window.sig.take(sr, 1, [])], sr);
      return { start: c.start, onset, end: c.end, channels: c.chs.length, peak, len: c.chs[0].length / sr, silent };
    });
    const lead = (clean.onset - clean.start) / 48;
    check('Säubern: Start auf dem Anschlag (0–5 ms davor)', lead >= 0 && lead <= 5, `${lead.toFixed(2)} ms vorher`);
    check('Säubern: Stille hinten weg (Klang 0,3 s → höchstens 0,45 s)', clean.len > 0.1 && clean.len < 0.45, `${clean.len.toFixed(3)} s`);
    check('Säubern: Pegel auf −1 dB angeglichen', Math.abs(clean.peak - 0.89) < 0.01, clean.peak.toFixed(3));
    check('Säubern: Doppel-Mono wird mono gespeichert', clean.channels === 1);
    check('Säubern: reine Stille ergibt keinen Klang', clean.silent === null);

    // ---------- Einordnen und Benennen ----------
    const cls = await page.evaluate(async () => {
      const { cleanTake, features, classify, describe } = await import('./src/werkstatt/clean.js');
      const sr = 48000;
      const out = {};
      for (const [k, gen, len] of [['kick', window.sig.kick, 0.4], ['snare', window.sig.snare, 0.3], ['hat', window.sig.hat, 0.15], ['tone', window.sig.tone, 0.6]]) {
        const raw = window.sig.take(sr, 1.2, [[gen, 0.2, len, 0.5]]);
        const c = cleanTake([raw], sr);
        const f = features(c.chs[0], sr);
        const cl = classify(f);
        out[k] = { cls: cl, ...describe(f, cl, ['Bumm 1']), centroid: Math.round(f.centroid) };
      }
      return out;
    });
    check('Einordnen: Kick → tief', cls.kick.cls === 'tief', JSON.stringify(cls.kick));
    check('Einordnen: Rauschen um 1,5 kHz → mittel', cls.snare.cls === 'mittel', JSON.stringify(cls.snare));
    check('Einordnen: helles Rauschen → hell', cls.hat.cls === 'hell', JSON.stringify(cls.hat));
    check('Einordnen: 440 Hz → Ton A4', cls.tone.cls === 'ton' && cls.tone.name === 'Ton A4 1' && cls.tone.tags.includes('A4'), JSON.stringify(cls.tone));
    check('Benennen: Name eindeutig (Bumm 1 vergeben → Bumm 2), Etiketten kurz · tief', cls.kick.name === 'Bumm 2' && cls.kick.tags.join() === 'kurz,tief', cls.kick.name);

    // ---------- Anschläge ----------
    const on = await page.evaluate(async () => {
      const { detectOnsets } = await import('./src/werkstatt/slice.js');
      const sr = 48000;
      const gens = [window.sig.kick, window.sig.snare, window.sig.hat];
      const at = [0.25, 0.61, 0.9, 1.33, 1.58, 2.02, 2.31, 2.77];
      const raw = window.sig.take(sr, 3.3, at.map((t, k) => [gens[k % 3], t, 0.25, k % 2 ? 0.25 : 0.6]));
      return { found: detectOnsets(raw, sr).map((f) => f / sr), at };
    });
    const errMs = on.found.length === on.at.length ? Math.max(...on.at.map((t, k) => Math.abs(on.found[k] - t) * 1000)) : Infinity;
    check('Anschläge: 8 Schläge (laut und leise) → 8 Stücke, je ±5 ms', on.found.length === 8 && errMs <= 5, `${on.found.length} gefunden, max ${errMs.toFixed(2)} ms`);

    // ---------- Klatsch dein Kit ----------
    const kit = await page.evaluate(async () => {
      const sr = 48000;
      const s = window.sig;
      const raw = s.take(sr, 4, [[s.kick, 0.3, 0.3, 0.6], [s.hat, 0.7, 0.15, 0.4], [s.snare, 1.1, 0.3, 0.5], [s.hat, 1.5, 0.15, 0.4],
        [s.kick, 1.9, 0.3, 0.6], [s.hat, 2.3, 0.15, 0.3], [s.snare, 2.7, 0.3, 0.5], [s.hat, 3.1, 0.15, 0.4]]);
      const used = await window.werkstatt.ingestKit([raw, raw.slice()], sr);
      const g = window.werkstatt.groove;
      return { used, pads: window.werkstatt.pads, playing: g?.playing, roles: g?.roles };
    });
    const kitPads = kit.pads.filter(Boolean);
    const classes = new Set(kitPads.map((p) => p.cls));
    check('Klatsch-Kit: 8 Schläge → 8 Pads belegt', kit.used.length === 8 && kitPads.length === 8, `${kit.used.length}`);
    check('Klatsch-Kit: Stücke nach Klang sortiert (tief, mittel, hell)', ['tief', 'mittel', 'hell'].every((c) => classes.has(c)) && kitPads[0].cls === 'tief' && kitPads[7].cls === 'hell', kitPads.map((p) => p.name).join(', '));
    check('Klatsch-Kit: Groove läuft sofort mit Kick = tief, Snare = mittel, Hi-Hat = hell', kit.playing && kit.pads[kit.roles.kick].cls === 'tief' && kit.pads[kit.roles.snare].cls === 'mittel' && kit.pads[kit.roles.hat].cls === 'hell', JSON.stringify(kit.roles));
    await page.waitForTimeout(600);
    const lit = await page.evaluate(() => document.querySelectorAll('.wpad.hit').length);
    check('Groove: Pads leuchten im Takt', lit > 0);
    if (SHOTS) await page.screenshot({ path: path.join(DIR, 'werkstatt-kit-handy.png') });
    await page.click('#wagain');
    const again = await page.evaluate(() => ({ v: window.werkstatt.groove.variant, playing: window.werkstatt.groove.playing }));
    check('„Nochmal“ wechselt den Groove', again.v === 1 && again.playing);
    await page.click('#wgroove');
    check('Groove stoppt per Knopf', await page.evaluate(() => !window.werkstatt.groove.playing && document.querySelector('#wgroove').getAttribute('aria-pressed') === 'false'));

    // ---------- Festhalten (Resampling) und Schleifen ----------
    await page.click('#wgroove');
    await page.waitForTimeout(300);
    await page.click('#wfreeze');
    await page.waitForFunction(() => window.werkstatt.pads[8], null, { timeout: 5000 });
    const fz = await page.evaluate(() => {
      const b = window.werkstatt.padBuffer(8);
      let peak = 0;
      for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
      return { pad: window.werkstatt.pads[8], peak, sr: b.sampleRate };
    });
    const barFrames = Math.round((60 / 90) * 4 * fz.sr);
    check('Festhalten: Groove wird neue Schleife auf dem nächsten freien Pad (1 Takt, samplegenau)', fz.pad?.cls === 'loop' && fz.pad.bars === 1 && Math.abs(fz.pad.length - barFrames) <= 1, `${fz.pad?.name}, ${fz.pad?.length} / ${barFrames} Frames`);
    check('Festhalten: hörbar und ohne Übersteuern', fz.peak > 0.1 && fz.peak <= 0.8901, fz.peak.toFixed(3));
    // Am nächsten Taktanfang ersetzt die Schleife, was lief (Original-Pads bleiben)
    await page.waitForFunction(() => window.werkstatt.live.includes(8), null, { timeout: 4000 });
    const swap = await page.evaluate(() => ({ drums: window.werkstatt.groove.drums, playing: window.werkstatt.groove.playing, btn: document.getElementById('wgroove').getAttribute('aria-pressed'), live: document.querySelector('.wpad[data-pad="8"]').classList.contains('live'), kit: window.werkstatt.pads.slice(0, 8).every(Boolean) }));
    check('Festhalten: am nächsten Takt läuft die Schleife statt des Grooves, Kit bleibt', swap.playing && !swap.drums && swap.btn === 'false' && swap.live && swap.kit);
    // Ebene drauf: Groove wieder an, zusammen festhalten
    await page.click('#wagain');
    await page.waitForTimeout(200);
    await page.click('#wfreeze');
    await page.waitForFunction(() => window.werkstatt.pads[9], null, { timeout: 5000 });
    check('Festhalten mit Schleife + Groove → „Schleife 2“', await page.evaluate(() => window.werkstatt.pads[9].name === 'Schleife 2' && window.werkstatt.pads[9].cls === 'loop'));
    await page.waitForFunction(() => window.werkstatt.live.includes(9) && !window.werkstatt.live.includes(8), null, { timeout: 4000 });
    await page.tap('.wpad[data-pad="9"]');
    check('Schleife antippen stoppt sie, ohne anderes läuft nichts mehr', await page.evaluate(() => !window.werkstatt.live.length && !window.werkstatt.groove.playing));
    await page.tap('.wpad[data-pad="8"]');
    check('Schleife antippen startet sie im Takt (ohne Schlagzeug)', await page.evaluate(() => window.werkstatt.live.includes(8) && window.werkstatt.groove.playing && !window.werkstatt.groove.drums));
    await page.tap('.wpad[data-pad="8"]');

    // ---------- Tastenleiste: jeder Klang wird Instrument ----------
    await page.evaluate(async () => {
      const sr = 48000;
      const n = sr * 0.6;
      const d = new Float32Array(sr);
      const f = 440 * 2 ** (0.3 / 12); // 30 Cent zu hoch gesungen
      for (let i = 0; i < n; i++) d[sr * 0.2 + i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr) * Math.min(1, i / 240, (n - i) / 2400);
      await window.werkstatt.ingestPad(10, [d], sr);
    });
    const ton = await page.evaluate(() => window.werkstatt.pads[10]);
    check('Tonaler Klang: Grundton A4 erkannt, Feinstimmung auf den Halbton (−0,3)', ton.cls === 'ton' && ton.root === 69 && Math.abs(ton.tune + 0.3) < 0.03, `${ton.name}, Stimmung ${ton.tune?.toFixed(3)}`);
    await page.tap('#wkeys-btn');
    const keysUi = await page.evaluate(() => ({ shown: !document.getElementById('wkeys').hidden, name: document.getElementById('wkeys-name').textContent, keys: document.querySelectorAll('.wkey').length, sel: document.querySelector('.wpad[data-pad="10"]').classList.contains('sel'), scroll: document.documentElement.scrollWidth - innerWidth }));
    check('Tasten: Leiste mit 8 Tönen spielt das zuletzt gespielte Pad', keysUi.shown && keysUi.name === `${ton.name} · A-Moll` && keysUi.keys === 8 && keysUi.sel, keysUi.name);
    check('Tasten: Handy ohne seitliches Scrollen', keysUi.scroll <= 0);
    await page.tap('.wkey[data-midi="64"]');
    const e4 = await page.evaluate(async () => {
      const v = await window.werkstatt.playKey(64);
      const rate = v.src.playbackRate.value;
      const buf = window.werkstatt.padBuffer(10);
      const off = new OfflineAudioContext(1, Math.ceil(buf.length / rate), buf.sampleRate);
      const s = off.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      s.connect(off.destination);
      s.start();
      const r = await off.startRendering();
      const { detectPitch } = await import('./src/dsp/pitch.js');
      const { f0, conf } = detectPitch(r.getChannelData(0), r.sampleRate);
      const voiced = [...f0].filter((_, i) => conf[i] > 0.85).sort((a, b) => a - b);
      return voiced[voiced.length >> 1];
    });
    check('Tasten: Taste E4 klingt E4 (329,6 Hz ± 1 %), obwohl zu hoch gesungen', Math.abs(e4 / 329.63 - 1) < 0.01, `${e4?.toFixed(1)} Hz`);
    if (SHOTS) await page.screenshot({ path: path.join(DIR, 'werkstatt-tasten-handy.png') });
    await page.tap('#wkeys-btn');

    // ---------- Pad-Wand: leeres Pad antippen nimmt auf (Fake-Mikrofon) ----------
    await page.tap('.wpad[data-pad="12"]');
    await page.waitForFunction(() => document.querySelector('.wpad[data-pad="12"]').classList.contains('rec'), null, { timeout: 5000 });
    const micShown = await page.waitForFunction(() => !document.getElementById('wmic').hidden, null, { timeout: 5000 }).then(() => true, () => false);
    check('Leeres Pad antippen → nimmt auf (rote Form, Mikro offen sichtbar)', micShown);
    await page.waitForFunction(() => window.werkstatt.pads[12], null, { timeout: 12000 });
    const rec = await page.evaluate(() => {
      const b = window.werkstatt.padBuffer(12);
      const d = b.getChannelData(0);
      let peak = 0, at = 0;
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); at = i; }
      let first = 0;
      while (first < d.length && Math.abs(d[first]) < 0.05) first++;
      return { pad: window.werkstatt.pads[12], peak, firstMs: first / b.sampleRate * 1000, ms: window.werkstatt.timing.cleanMs.at(-1), rec: document.querySelector('.wpad[data-pad="12"]').classList.contains('rec') };
    });
    check('Aufnahme endet von selbst nach der Stille, Pad ist gefüllt', !!rec.pad && !rec.rec, rec.pad?.name);
    check('Aufnahme gesäubert: Stille vorn weg (Klang ab ≤ 10 ms), Pegel −1 dB', rec.firstMs <= 10 && Math.abs(rec.peak - 0.89) < 0.02, `${rec.firstMs.toFixed(1)} ms, Spitze ${rec.peak.toFixed(3)}`);
    check('Aufnahme benannt und etikettiert (Bumm · tief)', /^Bumm \d+$/.test(rec.pad?.name) && rec.pad.tags.includes('tief'), `${rec.pad?.name} – ${rec.pad?.tags}`);
    check('Säubern dauert < 300 ms', rec.ms < 300, `${rec.ms?.toFixed(0)} ms`);

    // Volles Pad antippen spielt nur (keine neue Aufnahme)
    await page.tap('.wpad[data-pad="12"]');
    await page.waitForTimeout(150);
    check('Volles Pad antippen → spielt, nimmt nicht auf', await page.evaluate(() => !document.querySelector('.wpad[data-pad="12"]').classList.contains('rec')));

    await page.tap('#wmic');
    check('„Mikro offen“ antippen schließt das Mikrofon', await page.evaluate(() => document.getElementById('wmic').hidden && !window.werkstatt.mic.open));

    // ---------- Leeren, Synth-Kit ----------
    await page.tap('#warm-clear');
    await page.tap('.wpad[data-pad="0"]');
    check('„Leeren“ + Pad → Pad leer, Schalter wieder aus', await page.evaluate(() => !window.werkstatt.pads[0] && document.getElementById('warm-clear').getAttribute('aria-pressed') === 'false'));
    const freeBefore = await page.evaluate(() => window.werkstatt.pads.filter((p) => !p).length);
    await page.tap('#wsynth');
    const synth = await page.evaluate(() => window.werkstatt.pads.map((p) => p?.kind || null));
    check('Synth-Kit füllt die freien Pads mit erzeugten Klängen', synth.filter((k) => k === 'synth').length === freeBefore && synth.every(Boolean), synth.join(','));
    await page.waitForTimeout(300);
    check('Synth-Pads sind vorgerechnet (spielbar auf Tasten und beim Festhalten)', await page.evaluate(() => window.werkstatt.pads.filter((p) => p.kind === 'synth').every((p) => p.length > 0)));
    await page.tap('.wpad[data-pad="0"]');
    check('Synth-Pad spielt ohne Fehler', A.errors.length === 0, A.errors.join(' | '));
    if (SHOTS) await page.screenshot({ path: path.join(DIR, 'werkstatt-voll-handy.png') });

    // ---------- Eigener Speicher, Wiederherstellen ----------
    const names = await page.evaluate(() => window.werkstatt.pads.map((p) => p?.name ?? null));
    const page2 = await A.context.newPage();
    await page2.goto(page.url());
    await page2.waitForFunction(() => window.werkstatt?.ready, null, { timeout: 15000 });
    await page2.waitForTimeout(200);
    const after = await page2.evaluate(async () => ({
      names: window.werkstatt.pads.map((p) => p?.name ?? null),
      dbs: (await indexedDB.databases()).map((d) => d.name),
      keys: Object.keys(localStorage),
    }));
    check('Neu laden: alle Pads wiederhergestellt', JSON.stringify(after.names) === JSON.stringify(names), after.names.filter(Boolean).length + ' Pads');
    check('Eigener Speicher: IndexedDB „loopwerk-make“, nicht „loopwerk“', after.dbs.includes('loopwerk-make') && !after.dbs.includes('loopwerk'), after.dbs.join(','));
    check('Eigener Speicher: nur Schlüssel „loopwerk.make.*“ in localStorage', after.keys.length > 0 && after.keys.every((k) => k.startsWith('loopwerk.make.')), after.keys.join(','));
    await page2.close();
    check('Handy: keine Konsolenfehler', A.errors.length === 0, A.errors.join(' | '));
    await A.context.close();

    // ---------- Desktop ----------
    const D = await open(server, browser, { viewport: { width: 1280, height: 800 } });
    await D.page.click('#wsynth');
    await D.page.keyboard.press('Digit1');
    await D.page.waitForTimeout(80);
    const desk = await D.page.evaluate(() => ({
      hit: document.querySelector('.wpad[data-pad="0"]').classList.contains('hit'),
      key: getComputedStyle(document.querySelector('.wpad-key')).display,
      w: document.getElementById('app').getBoundingClientRect().width,
    }));
    check('Desktop: Taste 1 spielt Pad 1, Tastenbeschriftung sichtbar', desk.hit && desk.key !== 'none');
    check('Desktop: Spalte bleibt schmal (≤ 560 px)', desk.w <= 560, `${desk.w}px`);
    const lay = await D.page.evaluate(() => {
      const h = document.getElementById('whint').getBoundingClientRect();
      const p = document.querySelector('.wpad').getBoundingClientRect();
      const bar = document.querySelector('.wbar').getBoundingClientRect();
      return { hintBottom: h.bottom, padTop: p.top, barBottom: bar.bottom, vh: innerHeight };
    });
    check('Desktop: Einblender verdeckt keine Pads, alles ohne Scrollen im Bild', lay.hintBottom <= lay.padTop && lay.barBottom <= lay.vh, JSON.stringify(lay));
    if (SHOTS) await D.page.screenshot({ path: path.join(DIR, 'werkstatt-desktop.png') });
    check('Desktop: keine Konsolenfehler', D.errors.length === 0, D.errors.join(' | '));
    await D.context.close();

    // ---------- Als App: Manifest, Offline-Start, dauerhafter Speicher, Home-Bildschirm-Tipp ----------
    const base = `http://127.0.0.1:${server.address().port}`;
    const P = await browser.newContext(PHONE);
    await P.addInitScript(() => {
      window.__persist = 0;
      if (navigator.storage) navigator.storage.persist = async () => { window.__persist++; return true; };
    });
    const pg = await P.newPage();
    const pErrors = [];
    pg.on('pageerror', (e) => pErrors.push(e.message));
    await pg.goto(`${base}/werkstatt/`);
    await pg.waitForFunction(() => window.werkstatt?.ready);
    const man = await pg.evaluate(async () => {
      const link = document.querySelector('head link[rel="manifest"]');
      const res = await fetch(link.href);
      const m = await res.json();
      const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, link.href))).status));
      return { href: link.href, type: res.headers.get('content-type'), m, icons, start: new URL(m.start_url, link.href).pathname, scope: new URL(m.scope, link.href).pathname };
    });
    check('Manifest im Kopf: Krachwerk, Vollbild, Start und Bereich /werkstatt/', man.m.name === 'Krachwerk' && man.m.display === 'standalone' && man.start === '/werkstatt/' && man.scope === '/werkstatt/' && /manifest\+json/.test(man.type), `${man.start} ${man.scope}`);
    check('Manifest: Icons erreichbar, Farbe = Token --bg', man.icons.every((x) => x === 200) && man.m.background_color === '#16171A', man.icons.join(','));
    const icons = await pg.evaluate(() => ({ head: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href')), man: [] }));
    check('Eigenes Icon: Tab, iOS und Manifest zeigen Krachwerk, nicht Loopwerk', icons.head.length === 3 && icons.head.every((h) => /krachwerk/.test(h)) && man.m.icons.every((i) => /krachwerk/.test(i.src)), icons.head.join(', '));
    const reg = await pg.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    check('Service Worker aktiv, nur für /werkstatt/ (Loopwerk unberührt)', reg === `${base}/werkstatt/`, reg);
    await pg.reload();
    await pg.waitForFunction(() => window.werkstatt?.ready && navigator.serviceWorker.controller);
    await pg.evaluate(async () => {
      const sr = 48000, d = new Float32Array(sr);
      for (let i = 0; i < 9600; i++) d[4800 + i] = 0.5 * Math.sin(2 * Math.PI * 60 * i / sr) * Math.exp(-i / 2000);
      await window.werkstatt.ingestPad(3, [d], sr);
    });
    const kept = await pg.evaluate(() => ({ calls: window.__persist, persisted: window.werkstatt.app.persisted }));
    check('Erster eigener Klang: Speicher dauerhaft angefragt (einmal)', kept.calls === 1 && kept.persisted === true, JSON.stringify(kept));
    await P.setOffline(true);
    await pg.reload();
    const offline = await pg.waitForFunction(() => window.werkstatt?.ready, null, { timeout: 10000 }).then(() => true, () => false);
    const offPad = offline && await pg.evaluate(() => window.werkstatt.pads[3]?.name);
    check('Ohne Netz: Krachwerk startet aus dem Zwischenspeicher, Pads sind da', offline && /^Bumm/.test(offPad || ''), String(offPad));
    await P.setOffline(false);
    check('App-Modus: keine Programmfehler', pErrors.length === 0, pErrors.join(' | '));
    await P.close();

    // iPhone-Safari ohne Home-Bildschirm: einmal der Tipp
    const I = await browser.newContext({ ...PHONE, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const ip = await I.newPage();
    await ip.goto(`${base}/werkstatt/`);
    await ip.waitForFunction(() => window.werkstatt?.ready);
    const ingest = () => ip.evaluate(async () => {
      const sr = 48000, d = new Float32Array(sr);
      for (let i = 0; i < 4800; i++) d[4800 + i] = (Math.random() - 0.5) * Math.exp(-i / 500);
      await window.werkstatt.ingestPad(window.werkstatt.pads.findIndex((p) => !p), [d], sr);
    });
    await ingest();
    const tip = await ip.waitForFunction(() => /Home-Bildschirm/.test(document.getElementById('whint').textContent) && !document.getElementById('whint').classList.contains('off'), null, { timeout: 5000 }).then(() => true, () => false);
    check('iPhone im Browser: Tipp „Zum Home-Bildschirm“ nach dem ersten Klang', tip);
    await ip.reload();
    await ip.waitForFunction(() => window.werkstatt?.ready);
    await ingest();
    await ip.waitForTimeout(3200);
    check('Tipp kommt nur einmal', await ip.evaluate(() => !/Home-Bildschirm/.test(document.getElementById('whint').textContent)));
    await I.close();

    // ---------- Tempo und Tonart ----------
    const T = await browser.newContext(PHONE);
    const tp = await T.newPage();
    const tErrors = [];
    tp.on('pageerror', (e) => tErrors.push(e.message));
    tp.on('console', (m) => { if (m.type() === 'error') tErrors.push(m.text()); });
    await tp.goto(`${base}/werkstatt/`);
    await tp.waitForFunction(() => window.werkstatt?.ready);
    check('Start: 90 BPM, A-Moll im Kopf', await tp.evaluate(() => document.getElementById('wsong').textContent.replace(/\s+/g, ' ').trim() === '90BPMA-Moll'));
    // Schleife bei 90 festhalten
    await tp.tap('#wsynth');
    await tp.waitForFunction(() => window.werkstatt.pads.slice(0, 8).every((p) => p.length > 0));
    await tp.tap('#wgroove');
    await tp.waitForTimeout(200);
    await tp.tap('#wfreeze');
    await tp.waitForFunction(() => window.werkstatt.pads[8]?.cls === 'loop');
    await tp.waitForFunction(() => window.werkstatt.live.includes(8), null, { timeout: 4000 });
    await tp.tap('#wsong');
    check('Tempo/Tonart-Leiste öffnet mit einem Tipp', await tp.evaluate(() => !document.getElementById('wset').hidden && document.getElementById('wsong').getAttribute('aria-expanded') === 'true'));
    for (let k = 0; k < 6; k++) await tp.tap('#wbpm-up');
    const fast = await tp.evaluate(() => ({ bpm: window.werkstatt.song.bpm, step: window.werkstatt.groove.stepDur, head: document.getElementById('wsong-bpm').textContent, loop: window.werkstatt.loopBuffer(8), sr: window.werkstatt.padBuffer(8).sampleRate }));
    check('Tempo + : 90 → 120 BPM, Groove läuft im neuen Tempo weiter', fast.bpm === 120 && Math.abs(fast.step - 0.125) < 1e-9 && fast.head === '120', `${fast.bpm}`);
    const stretched = await tp.evaluate(() => {
      const b = window.werkstatt.loopBuffer(8);
      let peak = 0;
      for (const v of b.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { len: b.length, sr: b.sampleRate, peak };
    });
    check('Schleife folgt dem Tempo: 1 Takt bei 120 BPM = 2,0 s (samplegenau), hörbar', stretched.len === Math.round(2 * stretched.sr) && stretched.peak > 0.1, `${stretched.len} Frames`);
    await tp.waitForTimeout(2300);
    check('Schleife läuft nach dem Tempowechsel weiter', await tp.evaluate(() => window.werkstatt.live.includes(8) && window.werkstatt.groove.playing));
    // Tempo antippen: 4 Tipps im Abstand 0,5 s → 120 BPM; vorher auf 100 stellen
    for (let k = 0; k < 4; k++) await tp.tap('#wbpm-down');
    await tp.waitForTimeout(2100);
    await tp.evaluate(() => new Promise((done) => {
      const b = document.getElementById('wtap');
      let k = 0;
      const tap = () => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (++k < 4) setTimeout(tap, 500); else done(); };
      tap();
    }));
    const tapped = await tp.evaluate(() => window.werkstatt.song.bpm);
    check('Tempo antippen: 4 Tipps im Abstand 0,5 s → etwa 120 BPM', Math.abs(tapped - 120) <= 4, `${tapped}`);
    // Tonart: C-Dur → Tasten C4 … C5
    await tp.tap('.wset [data-root="0"]');
    await tp.tap('.wset [data-mode="dur"]');
    const drawer = await tp.evaluate(() => ({ bar: document.querySelector('.wbar').getBoundingClientRect().bottom, vh: innerHeight, scroll: document.documentElement.scrollWidth - innerWidth }));
    check('Tempo/Tonart als Schublade: Werkzeugleiste bleibt im Bild, kein seitliches Scrollen', drawer.bar <= drawer.vh && drawer.scroll <= 0, JSON.stringify(drawer));
    if (SHOTS) await tp.screenshot({ path: path.join(DIR, 'werkstatt-tonart-handy.png') });
    await tp.tap('.wpad[data-pad="0"]');
    check('Pad antippen schließt die Schublade', await tp.evaluate(() => document.getElementById('wset').hidden));
    await tp.tap('#wkeys-btn');
    const dur = await tp.evaluate(() => ({ keys: [...document.querySelectorAll('.wkey')].map((k) => k.textContent).join(' '), head: document.getElementById('wsong-key').textContent, pressed: document.querySelector('.wset [data-root="0"]').getAttribute('aria-pressed') }));
    check('Tonart C-Dur: Kopf und Tasten C4 D4 E4 F4 G4 A4 H4 C5', dur.head === 'C-Dur' && dur.keys === 'C4 D4 E4 F4 G4 A4 H4 C5' && dur.pressed === 'true', dur.keys);
    const kick = await tp.evaluate(async () => (await window.werkstatt.playKey(60)).src.playbackRate.value);
    check('Klang ohne Tonhöhe liegt im Original auf der ersten Taste', Math.abs(kick - 1) < 1e-6, kick.toFixed(4));
    if (SHOTS) await tp.screenshot({ path: path.join(DIR, 'werkstatt-tempo-handy.png') });
    const tScroll = await tp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('Handy: Leiste offen ohne seitliches Scrollen', tScroll <= 0);
    await tp.reload();
    await tp.waitForFunction(() => window.werkstatt?.ready);
    const kept2 = await tp.evaluate(() => ({ ...window.werkstatt.song }));
    check('Tempo und Tonart bleiben nach dem Neuladen', kept2.bpm === tapped && kept2.root === 0 && kept2.mode === 'dur', JSON.stringify(kept2));
    check('Tempo/Tonart: keine Konsolenfehler', tErrors.length === 0, tErrors.join(' | '));
    await T.close();

    // ---------- Mitnehmen: Krachwerk → Loopwerk ----------
    const M = await browser.newContext({ ...PHONE, acceptDownloads: true });
    const mp = await M.newPage();
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(e.message));
    mp.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
    await mp.goto(`${base}/werkstatt/`);
    await mp.waitForFunction(() => window.werkstatt?.ready);
    await mp.evaluate(signals);
    await mp.tap('#wsynth');
    await mp.waitForFunction(() => window.werkstatt.pads.slice(0, 8).every((p) => p.length > 0));
    const rawAt = await mp.evaluate(async () => {
      const sr = 48000;
      await window.werkstatt.ingestPad(8, [window.sig.take(sr, 1, [[window.sig.tone, 0.2, 0.5, 0.5]])], sr);
      return document.querySelector('.wpad[data-pad="8"]').classList.contains('raw');
    });
    await mp.waitForTimeout(900);
    const formed = await mp.evaluate(() => {
      const b = document.querySelector('.wpad[data-pad="8"]');
      return !b.classList.contains('raw') && [...b.querySelectorAll('.wpad-wave i')].every((i) => getComputedStyle(i).transform === 'none');
    });
    check('Roh → geformt: neuer Klang erscheint als Wolke und ordnet sich zur Wellenform', rawAt && formed);
    // ohne Schleife: der Groove wird als Schleife mitgegeben
    await mp.tap('#wtake-btn');
    check('„Mitnehmen“ öffnet die Schublade', await mp.evaluate(() => !document.getElementById('wtake').hidden));
    const [dl0] = await Promise.all([mp.waitForEvent('download'), mp.tap('#wtake-project')]);
    const p0 = JSON.parse(fs.readFileSync(await dl0.path(), 'utf8'));
    check('Ohne Schleife: Groove kommt als Schleife ins Projekt', p0.tracks[0].clips.length === 1 && p0.ownSounds.some((o) => o.name === 'Groove' && o.kind === 'loop'), `${p0.tracks[0].clips.length} Clips`);
    await mp.tap('#wgroove');
    await mp.waitForTimeout(200);
    await mp.tap('#wfreeze');
    await mp.waitForFunction(() => window.werkstatt.pads[9]?.cls === 'loop');
    await mp.tap('#wgroove');
    await mp.tap('#wtake-btn');
    const [dl] = await Promise.all([mp.waitForEvent('download'), mp.tap('#wtake-project')]);
    const projFile = path.join(path.dirname(wav), dl.suggestedFilename());
    await dl.saveAs(projFile);
    const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
    check('Projektdatei: Loopwerk-Format, 90 BPM, A-Moll („Am“), Name mit Krachwerk', proj.version === 1 && proj.bpm === 90 && proj.key === 'Am' && /^Krachwerk /.test(proj.name) && /\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    check('Projektdatei: alle 10 Pads als eigene Sounds, Schleife als 4-Takt-Clip', proj.ownSounds.length === 10 && proj.tracks[0].clips.length === 1 && proj.tracks[0].clips[0].lengthBeats === 16 && proj.ownSounds.every((o) => o.id.startsWith('own-')), `${proj.ownSounds.length} Sounds`);
    // WAV der Schleife
    await mp.tap('#wtake-btn');
    const [dw] = await Promise.all([mp.waitForEvent('download'), mp.tap('#wtake-wav')]);
    const wb = fs.readFileSync(await dw.path());
    const wsr = wb.readUInt32LE(24), wch = wb.readUInt16LE(22), wlen = wb.readUInt32LE(40) / (2 * wch);
    check('WAV: Schleife 4 Takte lang (90 BPM, samplegenau)', wb.toString('ascii', 0, 4) === 'RIFF' && wlen === 4 * Math.round((60 / 90) * 4 * wsr) && /\.wav$/.test(dw.suggestedFilename()), `${wlen} Frames, ${dw.suggestedFilename()}`);
    check('Mitnehmen: keine Konsolenfehler', mErrors.length === 0, mErrors.join(' | '));
    // In Loopwerk öffnen
    const lw = await M.newPage();
    const lwErrors = [];
    lw.on('pageerror', (e) => lwErrors.push(e.message));
    await lw.goto(`${base}/`);
    await lw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 20000 });
    await lw.setInputFiles('#open-input', projFile);
    await lw.waitForFunction(() => /^Krachwerk /.test(window.loopwerk.store.project.name), null, { timeout: 10000 });
    const opened = await lw.evaluate((ids) => {
      const { store, library } = window.loopwerk;
      const clip = store.project.tracks[0].clips[0];
      const s = library.get(clip?.sampleId);
      return { clips: store.project.tracks[0].clips.length, kind: s?.kind, cat: s?.category, beats: s?.beats, bpm: store.project.bpm, all: ids.every((id) => !!library.get(id)) };
    }, proj.ownSounds.map((o) => o.id));
    check('Loopwerk öffnet die Datei: Schleifen-Clip bleibt, Sound unter „Eigene“', opened.clips === 1 && opened.kind === 'loop' && opened.cat === 'own' && opened.beats === 4 && opened.bpm === 90, JSON.stringify(opened));
    check('Loopwerk: alle Krachwerk-Pads stehen als eigene Sounds bereit', opened.all);
    check('Loopwerk: keine Programmfehler beim Öffnen', lwErrors.length === 0, lwErrors.join(' | '));
    await M.close();

    // GitHub-Pages-Build liefert dieselben Dateien unter werkstatt/
    require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-pages.cjs')], { stdio: 'pipe' });
    const site = path.join(__dirname, '..', '_site', 'werkstatt');
    const built = ['index.html', 'manifest.webmanifest', 'sw.js'].every((f) => fs.existsSync(path.join(site, f)));
    check('Pages-Build: werkstatt/index.html, manifest.webmanifest, sw.js', built && JSON.parse(fs.readFileSync(path.join(site, 'manifest.webmanifest'), 'utf8')).name === 'Krachwerk');
  } catch (err) {
    check('Ablauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
