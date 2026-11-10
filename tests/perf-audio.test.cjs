// Performance Teil 2 (docs/analyse/2026-11-performance.md): Scheduler mit Vorlauf und Einstieg mit Versatz,
// Krachwerk ohne Netz, MP3 ohne Blockade, Mastering-Messung, Freigeben von Klängen. Grenzen prüfen Verhalten, nicht die Uhr.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { openApp, createChecker } = require('./harness.cjs');
const { start } = require('./serve.cjs');
const { schedProbe } = require('../tools/perf/sched-probe.cjs');

const { check, finish } = createChecker();
const ms = (s) => `${Math.round(s * 1000)} ms`;

async function scheduler() {
  const app = await openApp();
  const { page } = app;
  try {
    // Blockade 0,3 s: der Einsatz kurz vor ihrem Ende ist schon geplant – nichts weicht ab
    const b = await page.evaluate(schedProbe, { kind: 'block', block: 0.3 });
    check('Hauptthread 0,3 s blockiert: Wiedergabe unverändert (Vorlauf)', b.bad < 0.005, `abweichend ${ms(b.bad)} (Stille ${ms(b.silent)}, falsche Stelle ${ms(b.misplaced)})`);
    // Blockade 0,8 s: der Einsatz kommt zu spät dran und steigt an der richtigen Stelle ein (nur kurze Stille, keine Verschiebung)
    const l = await page.evaluate(schedProbe, { kind: 'block', block: 0.8 });
    check('Zu spät geplanter Einsatz startet mit Versatz an der richtigen Stelle', l.misplaced < 0.02 && l.silent < 0.2, `falsche Stelle ${ms(l.misplaced)}, Stille ${ms(l.silent)}`);
    for (const kind of ['mute', 'fader', 'move', 'stop']) {
      const r = await page.evaluate(schedProbe, { kind });
      check(`Live-Änderung „${kind}“ hörbar nach höchstens 0,1 s`, r.react < 0.1, `Reaktion ${ms(r.react)}`);
    }
    const lp = await page.evaluate(schedProbe, { kind: 'loop', d: 0.1 });
    check('Loop-Ende 0,1 s vor der Marke gesetzt: der Sprung kommt an der richtigen Stelle', lp.bad < 0.01, `abweichend ${ms(lp.bad)}`);
    check('Scheduler: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Scheduler: Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
}

// Mikrofon-Attrappe: 1 s Stille, dann ein kurzer tiefer Schlag (wie in werkstatt.test)
function micWav(file) {
  const sr = 48000, n = sr * 4;
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

// Krachwerk: ein Besuch mit Netz, dann ohne Netz starten, alles Nachgeladene prüfen und aufnehmen
async function krachwerk() {
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-audio-')), 'bumm.wav');
  micWav(wav);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  const C = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await C.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(`${base}/werkstatt/`);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    // Vorladen fertig: der Worker ist aktiv (aktiviert erst nach vollständigem addAll)
    const pre = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const name = keys.find((k) => k.startsWith('krachwerk-') && k !== 'krachwerk-runtime');
      return { active: !!reg.active, entries: name ? (await (await caches.open(name)).keys()).length : 0 };
    });
    check('Krachwerk: nach dem ersten Besuch liegt die ganze Dateiliste im Speicher', pre.active && pre.entries > 100, JSON.stringify(pre));
    await C.setOffline(true);
    await page.reload();
    const ok = await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 }).then(() => true, () => false);
    check('Krachwerk startet nach einem Besuch ohne Netz', ok);
    if (ok) {
      const p = await page.evaluate(async () => {
        const out = {};
        const lw = window.loopwerk;
        await lw.engine._ensure();
        out.fxWorklet = lw.engine.worklets === true;
        try { const { runJob } = await import('./src/dsp/run.js'); out.worker = (await runJob('crc', { chs: [new Uint8Array([1, 2, 3])] })) > 0; } catch (e) { out.worker = e.message; }
        try { await import('./src/cut-sound.js'); out.cut = true; } catch (e) { out.cut = e.message; }
        try { const r = await fetch('vendor/lamejs/lame.min.js'); out.lame = r.ok; } catch (e) { out.lame = e.message; }
        try { const r = await fetch('src/dsp/mp3-worker.js'); out.mp3 = r.ok; } catch (e) { out.mp3 = e.message; }
        return out;
      });
      check('Ohne Netz: Mastering-Worklet, Rechen-Worker, Zerlegen und MP3-Encoder da', p.fxWorklet === true && p.worker === true && p.cut === true && p.lame === true && p.mp3 === true, JSON.stringify(p));
      await page.tap('#rec-btn');
      const rec = await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 20000 }).then(() => true, () => false);
      const st = await page.evaluate(() => ({ state: window.loopwerk.recorder.state, clips: window.loopwerk.store.project.tracks.flatMap((t) => t.clips).length }));
      check('Ohne Netz: Aufnahme mit ● wird zum Clip', rec, JSON.stringify(st));
    }
    await C.setOffline(false);
    check('Krachwerk ohne Netz: keine Konsolenfehler', errors.length === 0, errors.join(' | '));
  } catch (e) {
    check('Krachwerk: Ablauf ohne Ausnahme', false, e.stack);
  }
  await browser.close();
  server.close();
}

// MP3 und WAV im Worker: bitgleich zum alten Weg im Hauptthread, ohne lange Aufgabe
async function exportWorker() {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const ex = await import('./src/export.js');
      const { encodeWav } = await import('./src/wav.js');
      const { crc32 } = await import('./src/zip.js');
      const sha = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const sig = (sec) => {
        const sr = 44100; const n = sec * sr;
        const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = 0.6 * Math.sin(2 * Math.PI * (220 + 110 * c) * i / sr) + 0.5 * Math.sin(i / 7000) * Math.sin(2 * Math.PI * 3000 * i / sr); }
        return b;
      };
      const out = {};
      // Prüfsumme des alten Encoders (Stand vor Teil 2, tools/perf/m4-audio.cjs export) für dasselbe Testsignal
      const ten = sig(10);
      out.mp3 = await sha(await ex.encodeMp3(ten));
      out.mp3Page = await sha(await ex.encodeMp3(ten, { worker: false }));
      const w = await ex.encodeWavJob(ten, { crc: true });
      const ref = new Uint8Array(await encodeWav(ten).arrayBuffer());
      out.wavSame = (await sha(w.blob)) === (await sha(new Blob([ref])));
      out.crcOk = w.crc === crc32(ref);
      out.peakOk = Math.abs(w.peak - ex.peakOf(ten)) < 1e-9;
      // 60 s Audio im Worker: lange Aufgaben während des Kodierens
      const long = sig(60);
      await new Promise((res) => setTimeout(res, 100)); // die Aufgabe, die das Signal erzeugt hat, nicht mitzählen
      const lts = [];
      const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) lts.push(e.duration); });
      obs.observe({ type: 'longtask' });
      const t0 = performance.now();
      let progress = 0;
      await ex.encodeMp3(long, { onProgress: () => progress++ });
      out.ms = performance.now() - t0;
      await new Promise((res) => setTimeout(res, 50));
      obs.disconnect();
      out.ltMax = Math.max(0, ...lts);
      out.progress = progress;
      // Abbrechen
      const ctl = new AbortController();
      const p = ex.encodeMp3(long, { signal: ctl.signal });
      setTimeout(() => ctl.abort(), 100);
      out.abort = await p.then(() => 'fertig', (e) => e.code);
      return out;
    });
    check('MP3 bitgleich zum alten Encoder (Prüfsumme Testsignal) und zum Weg im Hauptthread', r.mp3 === '7b073758dbfbac11' && r.mp3 === r.mp3Page, `${r.mp3} / ${r.mp3Page}`);
    check('WAV im Worker: gleiche Bytes, Prüfsumme und Spitze wie im Hauptthread', r.wavSame && r.crcOk && r.peakOk, JSON.stringify({ wav: r.wavSame, crc: r.crcOk, peak: r.peakOk }));
    check('MP3 (60 s Audio) im Worker: keine Aufgabe im Hauptthread über 250 ms, Fortschritt kommt', r.ltMax < 250 && r.progress > 3, `längste ${Math.round(r.ltMax)} ms, ${r.progress} Meldungen, ${Math.round(r.ms)} ms`);
    check('MP3 abbrechen', r.abort === 'aborted', r.abort);
    check('Export: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Export: Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
}

// Mastering-Messung: nur bei Änderungen, die die Lautheit betreffen; Rückgängig ohne neue Messung; im Worker; Abbruch
async function masteringMeasure() {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const { store, engine, mastering } = window.loopwerk;
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const idle = async () => { await sleep(1600); while (mastering.state.busy) await sleep(50); };
      const jobs = [];
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, ...rest) { if (m && m.job) jobs.push(m.job); return post.call(this, m, ...rest); };
      store.setMastering({ on: true, style: 'balanced' });
      await engine._ensure();
      await mastering.now();
      await idle();
      const out = { first: { ...engine.mix.gains } };
      const runs0 = mastering.state.runs;
      store.setTrack(store.project.tracks[0].id, { name: 'Anders' });
      store.setLoop({ on: true, startBeat: 4, endBeat: 12 });
      store.setLength(store.project.lengthBars + 2);
      store.setProjectName('Messprobe');
      await idle();
      out.cosmetic = mastering.state.runs - runs0;
      out.worker = jobs.includes('mastering');
      // Lautheit ändert sich: misst neu, bis dahin bleiben die alten Verstärkungen
      store.setTrack(store.project.tracks[0].id, { volume: 0.2 });
      await sleep(1300);
      out.busyGains = mastering.state.busy ? { ...engine.mix.gains } : null;
      await idle();
      out.fader = mastering.state.runs - runs0 - out.cosmetic;
      out.second = { ...engine.mix.gains };
      // Rückgängig: der Stand ist schon gemessen
      store.undo();
      await idle();
      out.undo = mastering.state.runs - runs0 - out.cosmetic - out.fader;
      out.back = { ...engine.mix.gains };
      // Neue Änderung während einer Messung: am Ende gilt der neueste Stand
      store.setTrack(store.project.tracks[1].id, { volume: 0.3 });
      await sleep(1300);
      while (!mastering.state.busy) await sleep(20);
      store.setTrack(store.project.tracks[1].id, { volume: 0.31 });
      await idle();
      const { masteringKey } = await import('./src/mastering.js');
      out.latest = mastering.state.key === masteringKey(store.project, window.loopwerk.library);
      Worker.prototype.postMessage = post;
      return out;
    });
    check('Mastering: Umbenennen, Loop, Songlänge, Songname messen nicht neu', r.cosmetic === 0, `${r.cosmetic} Messungen`);
    check('Mastering: Lautheitsmessung rechnet im Worker', r.worker);
    check('Mastering: Fader misst einmal neu, solange gelten die alten Verstärkungen', r.fader === 1 && (r.busyGains == null || (r.busyGains.pre === r.first.pre && r.busyGains.drive === r.first.drive)) && r.second.pre !== r.first.pre, JSON.stringify({ fader: r.fader, first: r.first, busy: r.busyGains, second: r.second }));
    check('Mastering: Rückgängig ohne neue Messung, Verstärkungen wie vorher', r.undo === 0 && r.back.pre === r.first.pre && r.back.drive === r.first.drive, JSON.stringify({ undo: r.undo, back: r.back }));
    check('Mastering: Änderung während der Messung – am Ende gilt der neueste Stand', r.latest);
    check('Mastering: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Mastering: Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
}

// Klänge freigeben: nach vielen vorgehörten Sounds bleibt der Speicher unter der Obergrenze, der Song bleibt vollständig
async function soundCache() {
  const app = await openApp();
  const { page } = app;
  try {
    const r = await page.evaluate(async () => {
      const { engine, library, store, renderProject } = window.loopwerk;
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const songIds = new Set(store.project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)));
      const rms = (b) => { let e = 0; const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; return Math.sqrt(e / d.length); };
      const opts = { toBeat: 16, limiter: false };
      const before = rms(await renderProject(store.project, library, opts));
      const limit = 20e6;
      library.cacheLimit = limit;
      const free = () => library.list().filter((s) => !songIds.has(s.id) && !s.lazy && (s.def || s._load) && s.category !== 'own');
      const ids = library.list().filter((s) => !songIds.has(s.id) && (s.def || s._load) && s.category !== 'own').map((s) => s.id).slice(0, 60);
      for (const id of ids) { await engine.previewSample(id).catch(() => {}); engine.stopPreview(); }
      const last = ids[ids.length - 1];
      await sleep(3600); // Aufräumen in Ruhe
      const bytes = free().reduce((a, s) => a + library.soundBytes(s), 0);
      const song = [...songIds].every((id) => library.get(id)?.buffer && !library.get(id).lazy);
      const after = rms(await renderProject(store.project, library, opts));
      // Freigegebener Sound lädt beim nächsten Vorhören wieder
      const gone = ids.find((id) => library.get(id).lazy);
      await engine.previewSample(gone);
      const again = !!library.get(gone)?.buffer && engine.preview?.sampleId === gone;
      engine.stopPreview();
      await engine.play(0);
      await sleep(600);
      const voices = engine.voices.size;
      engine.stop();
      return { bytes, limit, song, before, after, lastLoaded: !library.get(last).lazy, released: ids.filter((id) => library.get(id).lazy).length, again, voices, tracks: store.project.tracks.filter((t) => t.clips.some((c) => c.startBeat < 1)).length };
    });
    check('Nach 60 vorgehörten Sounds: Speicher der freigebbaren Klänge unter der Obergrenze', r.bytes <= r.limit && r.released > 0, `${(r.bytes / 1e6).toFixed(1)} MB ≤ ${(r.limit / 1e6).toFixed(0)} MB, ${r.released} freigegeben`);
    check('Zuletzt vorgehörter Sound bleibt geladen', r.lastLoaded);
    check('Song-Sounds bleiben geladen, der Song klingt wie vorher', r.song && Math.abs(r.after - r.before) < 1e-4 * Math.max(1, r.before), `RMS ${r.before.toFixed(5)} → ${r.after.toFixed(5)}`);
    check('Freigegebener Sound lädt beim Vorhören wieder', r.again);
    check('Song spielt danach (Stimmen geplant)', r.voices >= r.tracks && r.voices > 0, `${r.voices} Stimmen, ${r.tracks} Spuren ab Schlag 0`);
    check('Klänge freigeben: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Klänge freigeben: Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
}

(async () => {
  const only = process.env.PERF_AUDIO_ONLY ? process.env.PERF_AUDIO_ONLY.split(',') : null;
  const parts = { scheduler, krachwerk, exportWorker, masteringMeasure, soundCache };
  for (const [name, fn] of Object.entries(parts)) if (!only || only.includes(name)) await fn();
  finish();
})();
