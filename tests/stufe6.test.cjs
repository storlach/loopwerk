// Tests für Stufe 6 (Export): node tests/stufe6.test.cjs [--shots]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const tmp = (name) => path.join(os.tmpdir(), name);

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    // Kleines Testprojekt: Impuls auf Schlag 0 und 4, Song 2 Takte
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      const p = m.createEmptyProject();
      p.name = 'Export Test';
      p.tracks[0].clips.push({ id: 'c1', sampleId: 'test-click', startBeat: 0, lengthBeats: 8, offsetBeats: 0 });
      p.tracks[1].clips.push({ id: 'c2', sampleId: 'drums-four', startBeat: 0, lengthBeats: 8, offsetBeats: 0 });
      p.loop = { on: true, startBeat: 4, endBeat: 8 };
      window.loopwerk.store.replace(p);
    });

    // ---------- WAV ----------
    const wav = await page.evaluate(async () => {
      const { exportSong, songEndBeat } = await import('./src/export.js');
      const { store, library, renderProject } = window.loopwerk;
      const progress = [];
      const res = await exportSong(store.project, library, { format: 'wav', range: 'song', tail: true, onProgress: (p) => progress.push(p) });
      const bytes = new Uint8Array(await res.blob.arrayBuffer());
      const dv = new DataView(bytes.buffer);
      const head = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12));
      const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes.buffer.slice(0));
      const ref = await renderProject(store.project, library, { toBeat: 8, tailSeconds: 2.5, limiter: true, compensate: true });
      let diff = 0;
      const a = decoded.getChannelData(0), b = ref.getChannelData(0);
      for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
      return { head, rate: dv.getUint32(24, true), ch: dv.getUint16(22, true), bits: dv.getUint16(34, true), dur: decoded.duration, end: songEndBeat(store.project), diff, peak: res.peak, progressEnd: progress[progress.length - 1], steps: progress.length };
    });
    check('WAV hat einen gültigen Kopf (44,1 kHz, Stereo, 16 Bit)', wav.head === 'RIFFWAVE' && wav.rate === 44100 && wav.ch === 2 && wav.bits === 16, JSON.stringify({ head: wav.head, rate: wav.rate, ch: wav.ch, bits: wav.bits }));
    check('Song-Ende = Ende des letzten Clips, plus 2,5 s Ausklang', wav.end === 8 && Math.abs(wav.dur - 6.5) < 0.001, `${wav.dur.toFixed(3)} s`);
    check('WAV entspricht dem Offline-Rendering (16-Bit-genau)', wav.diff < 2 / 32768, `max. Abweichung ${wav.diff.toExponential(1)}`);
    check('Fortschritt wird gemeldet und endet bei 100 %', wav.progressEnd === 1 && wav.steps >= 3, `${wav.steps} Meldungen`);

    // Loop-Bereich ohne Ausklang
    const loop = await page.evaluate(async () => {
      const { exportSong } = await import('./src/export.js');
      const { store, library } = window.loopwerk;
      const res = await exportSong(store.project, library, { format: 'wav', range: 'loop', tail: false });
      const d = (await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await res.blob.arrayBuffer())).getChannelData(0);
      let at = 0; for (let i = 0; i < 2000; i++) if (Math.abs(d[i]) > Math.abs(d[at])) at = i;
      return { dur: d.length / 44100, at };
    });
    check('Loop-Bereich exportiert genau Takt 2, Schlag exakt am Dateianfang', Math.abs(loop.dur - 2) < 0.001 && loop.at <= 1, `${loop.dur} s, stärkster Ausschlag auf Frame ${loop.at}`);

    // ---------- MP3 ----------
    const mp3 = await page.evaluate(async () => {
      const { exportSong } = await import('./src/export.js');
      const { store, library } = window.loopwerk;
      const t0 = performance.now();
      const res = await exportSong(store.project, library, { format: 'mp3', range: 'song', tail: true });
      const ms = performance.now() - t0;
      const bytes = new Uint8Array(await res.blob.arrayBuffer());
      const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes.buffer.slice(0));
      let e = 0; const d = decoded.getChannelData(0); for (const v of d) e += v * v;
      return { size: bytes.length, sync: bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0, dur: decoded.duration, rms: Math.sqrt(e / d.length), ms };
    });
    check('MP3 ist gültig und abspielbar', mp3.sync && mp3.size > 10000, `${mp3.size} Bytes`);
    check('MP3 hat die richtige Länge', Math.abs(mp3.dur - 6.5) < 0.1, `${mp3.dur.toFixed(2)} s`);
    check('MP3 enthält das Signal', mp3.rms > 0.01, `RMS ${mp3.rms.toFixed(3)}, Export in ${Math.round(mp3.ms)} ms`);

    // Leerer Song wird verständlich abgelehnt
    const empty = await page.evaluate(async () => {
      const { exportSong } = await import('./src/export.js');
      const m = await import('./src/model.js');
      try { await exportSong(m.createEmptyProject(), window.loopwerk.library, {}); return 'kein Fehler'; } catch (e) { return e.message; }
    });
    check('Leerer Song: verständliche Meldung', empty.includes('noch keine Clips'), empty);

    // ---------- Bedienung (lokal: Download) ----------
    await page.click('#export-btn');
    const label = await page.locator('#ex-range-song-label').textContent();
    check('Export-Dock zeigt den Bereich des Songs', label.includes('Takt 1–2'), label);
    await page.check('#ex-format-mp3');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stufe6-export.png') });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#ex-go')]);
    const status = await page.locator('#ex-status').textContent();
    check('Exportieren speichert „Export Test.mp3“', download.suggestedFilename() === 'Export Test.mp3' && status.startsWith('Fertig'), `${download.suggestedFilename()} – ${status}`);

    // ---------- Artifact-Weg: downloads-Capability, Audio als ZIP ----------
    const zipped = await page.evaluate(async () => {
      window.claude = { use: async (n) => (n === 'downloads' ? { save: async (r) => { window.__saved = r; return { status: 'saved' }; } } : null) };
      const { saveFile } = await import('./src/ui/save-file.js');
      const { exportSong } = await import('./src/export.js');
      const res = await exportSong(window.loopwerk.store.project, window.loopwerk.library, { format: 'wav', range: 'loop', tail: false });
      const out = await saveFile('Export Test.wav', res.blob);
      const savedName = window.__saved.filename;
      const bytes = new Uint8Array(await window.__saved.data.arrayBuffer());
      const json = await saveFile('Projekt.json', new Blob(['{}']));
      delete window.claude;
      return { name: out.filename, zipped: out.zipped, saved: savedName, bytes: Array.from(bytes), json };
    });
    const zipPath = tmp('loopwerk-export-test.zip');
    fs.writeFileSync(zipPath, Buffer.from(zipped.bytes));
    let zipCheck = '';
    try {
      zipCheck = execFileSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or "ok", z.namelist(), z.getinfo(z.namelist()[0]).file_size)', zipPath]).toString().trim();
    } catch (e) { zipCheck = 'Fehler: ' + e.message; }
    check('Im Artifact: WAV wird als ZIP gespeichert', zipped.zipped && zipped.saved === 'Export Test.zip', zipped.saved);
    check('ZIP ist gültig (CRC geprüft) und enthält die WAV', zipCheck.startsWith("ok ['Export Test.wav']"), zipCheck);
    check('Im Artifact: JSON wird direkt gespeichert', zipped.json.filename === 'Projekt.json' && !zipped.json.zipped);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
