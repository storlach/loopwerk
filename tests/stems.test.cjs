// Tests für den Export von Einzelspuren (Stems): node tests/stems.test.cjs [--shots]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Läuft im Browser: Testprojekt mit Effekten, Panorama, Kurven, Fades, Mute, Gruppe, Solo, leerer Spur und Master-Kette
function setupProject() {
  return (async () => {
    const m = await import('./src/model.js');
    const p = m.createEmptyProject();
    p.name = 'Stem Test';
    const clip = (id, sampleId, startBeat, lengthBeats, extra = {}) => ({ id, sampleId, startBeat, lengthBeats, offsetBeats: 0, ...extra });
    const [t1, t2, t3, t4, t5, t6, t7] = p.tracks;
    Object.assign(t1, { name: 'Drums', volume: 0.4, pan: -0.3, fx: { comp: { on: true }, filter: { on: true } },
      automation: { volume: [{ beat: 0, value: 1 }, { beat: 4, value: 0.3 }, { beat: 8, value: 0.9 }] } });
    t1.clips.push(clip('c1', 'drums-four', 0, 8));
    Object.assign(t2, { name: 'Bass/Sub: Tief', volume: 0.6, pan: 0.4, solo: true, fx: { echo: { on: true } } });
    t2.clips.push(clip('c2', 'bass-pulse', 0, 8, { gain: 0.8, fadeInBeats: 1, fadeOutBeats: 2, fadeOutCurve: 0.5 }));
    Object.assign(t3, { name: 'Gemutet', mute: true });
    t3.clips.push(clip('c3', 'test-dc', 0, 8));
    Object.assign(t4, { name: 'Nur vorn', volume: 0.5 });
    t4.clips.push(clip('c4', 'test-click', 0, 4));
    Object.assign(t5, { name: 'In stummer Gruppe', groupId: 'g1' });
    t5.clips.push(clip('c5', 'test-dc', 0, 8));
    p.groups = [{ id: 'g1', name: 'G', collapsed: false, mute: true }];
    t6.name = 'Leer';
    Object.assign(t7, { name: 'Hall', volume: 0.8, fx: { hall: { on: true, mix: 0.5 } } });
    t7.clips.push(clip('c7', 'test-click', 0, 8));
    p.master = { volume: 0.5, fx: { eq: { on: true } }, automation: { volume: [{ beat: 0, value: 1 }, { beat: 8, value: 0.4 }] }, mastering: { on: true, style: 'balanced' } };
    p.loop = { on: true, startBeat: 4, endBeat: 8 };
    window.loopwerk.store.replace(p);
  })();
}

(async () => {
  const app = await openApp({ viewport: { width: 1400, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(setupProject);

    // ---------- Kernbedingung: Summe der Stems = Mix ohne Master-Kette ----------
    const core = await page.evaluate(async () => {
      const { exportStems, stemTracks } = await import('./src/export.js');
      const { readZip } = await import('./src/zip.js');
      const { store, library, renderProject } = window.loopwerk;
      const p = store.project;
      await library.ensureProject?.(p);
      const opts = { fromBeat: 0, toBeat: 8, tailSeconds: 2.5 };
      const ids = stemTracks(p, 0, 8).map((t) => t.id);
      // Referenz: der Mix ohne Master-Kette, Solo aus (Stems ignorieren Solo)
      const noSolo = { ...p, tracks: p.tracks.map((t) => ({ ...t, solo: false })) };
      const ref = await renderProject(noSolo, library, { ...opts, master: false });
      const sum = [new Float32Array(ref.length), new Float32Array(ref.length)];
      const peaks = {};
      for (const id of ids) {
        const b = await renderProject(p, library, { ...opts, onlyTrack: id, master: false });
        let pk = 0;
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { sum[c][i] += d[i]; pk = Math.max(pk, Math.abs(d[i])); } }
        peaks[id] = pk;
      }
      let diff = 0, refPeak = 0;
      for (let c = 0; c < 2; c++) { const r = ref.getChannelData(c); for (let i = 0; i < r.length; i++) { diff = Math.max(diff, Math.abs(r[i] - sum[c][i])); refPeak = Math.max(refPeak, Math.abs(r[i])); } }
      // Gegenprobe: der normale Mix mit Master-Kette unterscheidet sich deutlich
      const full = await renderProject(noSolo, library, { ...opts, limiter: true, compensate: true, mastering: false });
      let fullDiff = 0;
      for (let i = 0; i < full.length; i++) fullDiff = Math.max(fullDiff, Math.abs(full.getChannelData(0)[i] - sum[0][i]));

      // Dieselbe Rechnung über den Export: ZIP lesen, WAVs dekodieren, addieren
      const progress = [];
      const res = await exportStems(p, library, { format: 'wav', range: 'song', tail: true, onProgress: (x, info) => progress.push([x, info.index, info.count, info.phase]) });
      const bytes = new Uint8Array(await res.blob.arrayBuffer());
      const entries = readZip(bytes);
      const zsum = [new Float32Array(ref.length), new Float32Array(ref.length)];
      const lens = [];
      for (const e of entries) {
        const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(e.data.slice().buffer);
        lens.push(buf.length);
        for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length && i < ref.length; i++) zsum[c][i] += d[i]; }
      }
      let zdiff = 0;
      for (let c = 0; c < 2; c++) { const r = ref.getChannelData(c); for (let i = 0; i < r.length; i++) zdiff = Math.max(zdiff, Math.abs(r[i] - zsum[c][i])); }
      const mono = progress.every((x, i) => i === 0 || x[0] >= progress[i - 1][0] - 1e-9);
      return {
        ids, diff, refPeak, fullDiff, peaks, zdiff, names: entries.map((e) => e.name), crcOk: entries.every((e) => e.crcOk), lens, refLen: ref.length,
        stems: res.stems.map((s) => s.name), progressEnd: progress[progress.length - 1], mono, counts: [...new Set(progress.map((x) => x[2]))],
        indices: [...new Set(progress.filter((x) => x[3] === 'render').map((x) => x[1]))], zip: Array.from(bytes),
      };
    });
    check('Hörbare Spuren: Drums, Bass, Nur vorn, Hall (gemutet, stumme Gruppe und leer übersprungen, Solo ignoriert)',
      JSON.stringify(core.ids) === JSON.stringify(['t1', 't2', 't4', 't7']), JSON.stringify(core.ids));
    check('Summe der Stems = Mix ohne Master-Kette (Differenz < 1e-4)', core.diff < 1e-4 && core.refPeak > 0.05, `max. Differenz ${core.diff.toExponential(2)}, Spitze Mix ${core.refPeak.toFixed(3)}`);
    check('Jede Stem trägt Signal, keine übersteuert', Object.values(core.peaks).every((v) => v > 1e-3 && v < 1), JSON.stringify(core.peaks));
    check('Gegenprobe: Mix mit Master-Kette weicht von der Stem-Summe ab', core.fullDiff > 0.01, `max. Abweichung ${core.fullDiff.toFixed(3)}`);
    check('ZIP enthält „01 Drums.wav“, „02 Bass Sub Tief.wav“, „04 Nur vorn.wav“, „07 Hall.wav“ (CRC stimmt)',
      JSON.stringify(core.names) === JSON.stringify(['01 Drums.wav', '02 Bass Sub Tief.wav', '04 Nur vorn.wav', '07 Hall.wav']) && core.crcOk, JSON.stringify(core.names));
    check('Alle Stems gleich lang wie der Mix (Song + 2,5 s Ausklang)', core.lens.every((n) => n === core.refLen), `${core.lens.join(', ')} / ${core.refLen}`);
    check('Summe der WAV-Dateien = Mix (16-Bit-genau je Spur)', core.zdiff < core.names.length * 2 / 32768, `max. Differenz ${core.zdiff.toExponential(2)}`);
    check('Fortschritt je Spur, steigend, endet bei 100 %', core.progressEnd[0] === 1 && core.mono && core.counts.length === 1 && core.counts[0] === 4 && core.indices.join() === '0,1,2,3', JSON.stringify({ end: core.progressEnd, counts: core.counts, indices: core.indices }));

    const zipPath = path.join(os.tmpdir(), 'loopwerk-stems-test.zip');
    fs.writeFileSync(zipPath, Buffer.from(core.zip));
    let py = '';
    try {
      py = execFileSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or "ok", "|".join(z.namelist()))', zipPath]).toString().trim();
    } catch (e) { py = 'Fehler: ' + e.message; }
    check('ZIP ist für Python zipfile gültig (CRC geprüft)', py === 'ok 01 Drums.wav|02 Bass Sub Tief.wav|04 Nur vorn.wav|07 Hall.wav', py);

    // ---------- Loop-Bereich, ohne Ausklang, MP3 ----------
    const loop = await page.evaluate(async () => {
      const { exportStems } = await import('./src/export.js');
      const { readZip } = await import('./src/zip.js');
      const { store, library } = window.loopwerk;
      const res = await exportStems(store.project, library, { format: 'mp3', range: 'loop', tail: false });
      const entries = readZip(new Uint8Array(await res.blob.arrayBuffer()));
      const out = [];
      for (const e of entries) {
        const b = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(e.data.slice().buffer);
        out.push({ name: e.name, dur: b.duration, sync: e.data[0] === 0xff || String.fromCharCode(...e.data.subarray(0, 3)) === 'ID3' });
      }
      return out;
    });
    check('Loop-Bereich: „Nur vorn“ (Clip vor dem Bereich) fehlt, MP3 je Spur', JSON.stringify(loop.map((x) => x.name)) === JSON.stringify(['01 Drums.mp3', '02 Bass Sub Tief.mp3', '07 Hall.mp3']) && loop.every((x) => x.sync), JSON.stringify(loop.map((x) => x.name)));
    check('Loop-Bereich ohne Ausklang: je 2 s', loop.every((x) => Math.abs(x.dur - 2) < 0.1), loop.map((x) => x.dur.toFixed(2)).join(', '));

    // ---------- Option „Mit Summe“ ----------
    const sum = await page.evaluate(async () => {
      const { exportStems } = await import('./src/export.js');
      const { readZip } = await import('./src/zip.js');
      const { store, library, renderProject } = window.loopwerk;
      const p = store.project;
      const opts = { fromBeat: 0, toBeat: 8, tailSeconds: 0 };
      const wet = await exportStems(p, library, { format: 'wav', range: 'song', tail: false, withMaster: true, mastering: false });
      const dry = await exportStems(p, library, { format: 'wav', range: 'song', tail: false });
      const dec = async (res) => Promise.all(readZip(new Uint8Array(await res.blob.arrayBuffer())).map((e) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(e.data.slice().buffer)));
      const w = await dec(wet);
      const d = await dec(dry);
      const ref = await renderProject(p, library, { ...opts, onlyTrack: 't1', limiter: true, compensate: true, mastering: false });
      let eq = 0, apart = 0;
      for (let i = 0; i < ref.length; i++) {
        eq = Math.max(eq, Math.abs(w[0].getChannelData(0)[i] - ref.getChannelData(0)[i]));
        apart = Math.max(apart, Math.abs(w[0].getChannelData(0)[i] - d[0].getChannelData(0)[i]));
      }
      const mst = await exportStems(p, library, { format: 'wav', range: 'loop', tail: false, withMaster: true, mastering: true });
      const dryM = await exportStems(p, library, { format: 'wav', range: 'loop', tail: false, mastering: true });
      return { eq, apart, analysis: !!mst.analysis, dryAnalysis: dryM.analysis === null, n: mst.stems.length };
    });
    check('„Mit Summe“: Stem läuft durch Master-Effekte, Fader, Kurve und Limiter', sum.eq < 2 / 32768 && sum.apart > 0.01, `zur Master-Kette ${sum.eq.toExponential(1)}, zur trockenen Stem ${sum.apart.toFixed(3)}`);
    check('„Mit Summe“ + Mastering analysiert den Song einmal; ohne Summe kein Mastering', sum.analysis && sum.dryAnalysis && sum.n === 3, JSON.stringify(sum));

    const errs = await page.evaluate(async () => {
      const { exportStems } = await import('./src/export.js');
      const m = await import('./src/model.js');
      const { library } = window.loopwerk;
      const msg = async (p) => { try { await exportStems(p, library, {}); return 'kein Fehler'; } catch (e) { return e.message; } };
      const muted = m.createEmptyProject();
      muted.tracks[0].clips.push({ id: 'x', sampleId: 'test-click', startBeat: 0, lengthBeats: 4, offsetBeats: 0 });
      muted.tracks[0].mute = true;
      const ac = new AbortController();
      ac.abort();
      let abortCode = '';
      try { await exportStems(window.loopwerk.store.project, library, { signal: ac.signal }); } catch (e) { abortCode = e.code; }
      return { empty: await msg(m.createEmptyProject()), muted: await msg(muted), abortCode };
    });
    check('Leerer Song und nur stumme Spuren: verständliche Meldung', errs.empty.includes('noch keine Clips') && errs.muted.includes('Keine hörbare Spur'), `${errs.empty} | ${errs.muted}`);
    check('Abbruch per Signal', errs.abortCode === 'aborted', errs.abortCode);

    // ---------- Bedienung Desktop ----------
    await page.click('#export-btn');
    const label = await page.locator('#ex-stems-label').textContent();
    check('Desktop: Option „Einzelspuren (Stems)“ zeigt die Zahl der Spuren', label === 'Einzelspuren (Stems) – 4 Spuren als ZIP', label);
    check('Desktop: „Mit Summe“ erst mit Stems wählbar, aus', await page.locator('#ex-stems-master').isDisabled() && !(await page.locator('#ex-stems-master').isChecked()));
    await page.check('#ex-stems');
    check('Desktop: Stems an → „Mit Summe“ wählbar, Mastering-Haken ruht, Knopf „Spuren exportieren“',
      !(await page.locator('#ex-stems-master').isDisabled()) && await page.locator('#ex-mastering').isDisabled() && (await page.locator('#ex-go').textContent()) === 'Spuren exportieren');
    await page.check('#ex-range-loop');
    const loopLabel = await page.locator('#ex-stems-label').textContent();
    check('Desktop: Zahl folgt dem Bereich (Loop: 3 Spuren)', loopLabel.includes('3 Spuren'), loopLabel);
    await page.check('#ex-range-song');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stems-desktop.png') });
    const seen = [];
    const poll = setInterval(async () => { try { seen.push(await page.locator('#ex-status').textContent()); } catch { /* Seite zu */ } }, 30);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#ex-go')]);
    clearInterval(poll);
    await page.waitForFunction(() => document.getElementById('ex-status').textContent.startsWith('Fertig'));
    const status = await page.locator('#ex-status').textContent();
    const dlPath = path.join(os.tmpdir(), 'loopwerk-stems-ui.zip');
    await download.saveAs(dlPath);
    let dl = '';
    try { dl = execFileSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or "ok", len(z.namelist()))', dlPath]).toString().trim(); } catch (e) { dl = 'Fehler: ' + e.message; }
    check('Desktop: zwei Klicks → „Stem Test Stems.zip“ mit 4 Dateien', download.suggestedFilename() === 'Stem Test Stems.zip' && dl === 'ok 4' && status.includes('4 Spuren'), `${download.suggestedFilename()} – ${dl} – ${status}`);
    check('Desktop: Fortschritt zeigt „Spur … von 4“', seen.some((s) => /Spur \d von 4/.test(s)), seen.filter(Boolean).slice(0, 3).join(' | '));

    // Abbrechen: zweiter Klick auf denselben Knopf
    await page.click('#ex-go');
    await page.waitForFunction(() => document.getElementById('ex-go').textContent === 'Abbrechen');
    await page.click('#ex-go');
    await page.waitForFunction(() => document.getElementById('ex-status').textContent === 'Export abgebrochen.', null, { timeout: 30000 });
    check('Desktop: „Abbrechen“ stoppt den Spur-Export, Knopf wieder bereit', (await page.locator('#ex-go').textContent()) === 'Spuren exportieren' && !(await page.locator('#ex-go').isDisabled()));
    await page.uncheck('#ex-stems');
    check('Desktop: ohne Stems wieder normaler Export', (await page.locator('#ex-go').textContent()) === 'Exportieren' && await page.locator('#ex-stems-master').isDisabled());
    check('Desktop: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf Desktop ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
  }

  // ---------- Bedienung Handy ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const p = phone.page;
    await p.evaluate(setupProject);
    await p.tap('#tab-song');
    await p.waitForTimeout(400);
    await p.tap('#export-btn');
    await p.waitForFunction(() => window.loopwerk.ui.dock === 'export');
    await p.locator('#ex-stems').scrollIntoViewIfNeeded();
    const box = await p.locator('label:has(#ex-stems)').boundingBox();
    const box2 = await p.locator('label:has(#ex-stems-master)').boundingBox();
    check('Handy: Stems-Zeilen am Finger ≥ 44 px hoch', box.height >= 44 && box2.height >= 44, `${box.height} / ${box2.height} px`);
    await p.locator('label:has(#ex-stems)').tap();
    check('Handy: Antippen der Zeile schaltet Stems an', await p.locator('#ex-stems').isChecked() && (await p.locator('#ex-go').textContent()) === 'Spuren exportieren');
    if (SHOTS) {
      await p.evaluate(() => document.getElementById('ex-stems-set').scrollIntoView({ block: 'start' }));
      await p.screenshot({ path: path.join(SHOT_DIR, 'stems-handy.png') });
    }
    await p.locator('#ex-go').scrollIntoViewIfNeeded();
    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.tap('#ex-go')]);
    check('Handy: Export der Stems lädt „Stem Test Stems.zip“', download.suggestedFilename() === 'Stem Test Stems.zip', download.suggestedFilename());
    await p.waitForFunction(() => document.getElementById('ex-status').textContent.startsWith('Fertig'));
    if (SHOTS) {
      await p.locator('#ex-status').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(SHOT_DIR, 'stems-handy-fertig.png') });
    }
    check('Handy: keine Fehler in der Konsole', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (err) {
    check('Testlauf Handy ohne Ausnahme', false, err.stack);
  } finally {
    await phone.close();
    finish();
  }
})();
