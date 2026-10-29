// Tests für Stufe 5 (Import, Aufnahme, Sample-Editor): node tests/stufe5.test.cjs [--shots]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, createChecker, makeWav, clickR, fillR, reveal } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();
const tmp = (name) => path.join(os.tmpdir(), name);

(async () => {
  const app = await openApp({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const { page } = app;
  try {
    // ---------- Bearbeitungsfunktionen ----------
    const ed = await page.evaluate(async () => {
      const E = await import('./src/dsp/edit.js');
      const sr = 44100;
      const ramp = () => [Float32Array.from({ length: 1000 }, (_, i) => i / 1000)];
      const sine = (f, n) => [Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * f * i / sr))];
      const zc = (d) => { let z = 0; for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 && d[i] >= 0) z++; return z; };
      const r = ramp();
      return {
        crop: E.crop(r, 100, 300)[0].length,
        cut: E.cut(r, 100, 300, sr)[0].length,
        silence: [E.silence(r, 100, 300)[0][150], E.silence(r, 100, 300)[0][350]],
        reverse: [E.reverse(r)[0][0], E.reverse(r)[0][999]],
        fadeIn: [E.fade([new Float32Array(1001).fill(1)], 0, 1001, 'in')[0][0], E.fade([new Float32Array(1001).fill(1)], 0, 1001, 'in')[0][500]],
        gain: E.gain([new Float32Array(10).fill(0.1)], 6)[0][0],
        norm: E.peakOf(E.normalize(sine(440, 4410))),
        pitch: (() => { const s = sine(440, 44100); const p = E.pitch(s, 12)[0]; return [p.length, zc(p) / (p.length / sr)]; })(),
        untouched: r[0][500],
      };
    });
    check('Zuschneiden behält nur die Auswahl', ed.crop === 200, String(ed.crop));
    check('Entfernen kürzt um die Auswahl', ed.cut === 800, String(ed.cut));
    check('Stille nur in der Auswahl', ed.silence[0] === 0 && ed.silence[1] > 0.3, JSON.stringify(ed.silence));
    check('Rückwärts dreht die Reihenfolge um', ed.reverse[0] > 0.99 && ed.reverse[1] === 0, JSON.stringify(ed.reverse));
    check('Einblenden beginnt bei 0 und ist in der Mitte bei 0,5', ed.fadeIn[0] === 0 && Math.abs(ed.fadeIn[1] - 0.5) < 0.01, JSON.stringify(ed.fadeIn));
    check('+6 dB verdoppelt den Pegel', Math.abs(ed.gain - 0.1995) < 0.001, ed.gain.toFixed(4));
    check('Normalisieren auf −1 dB', Math.abs(ed.norm - 0.89) < 0.001, ed.norm.toFixed(3));
    check('+12 Halbtöne: halbe Länge, doppelte Frequenz', ed.pitch[0] === 22050 && Math.abs(ed.pitch[1] - 880) < 5, `${ed.pitch[0]} Frames, ${ed.pitch[1].toFixed(0)} Hz`);
    check('Bearbeitungen verändern das Original nicht', ed.untouched === 0.5);

    // ---------- Import ----------
    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); });
    const wavPath = tmp('Mein Gesang.wav');
    fs.writeFileSync(wavPath, makeWav(1.5, 330));
    await page.setInputFiles('#import-input', wavPath);
    await page.waitForFunction(() => { const s = window.loopwerk.library.list().find((x) => x.name === 'Mein Gesang'); return s && window.loopwerk.ui.armedSampleId === s.id; }, null, { timeout: 10000 });
    const imp = await page.evaluate(() => {
      const s = window.loopwerk.library.list().find((x) => x.name === 'Mein Gesang');
      return { id: s.id, cat: s.category, beats: s.lengthBeats, armed: window.loopwerk.ui.armedSampleId === s.id };
    });
    check('Import legt einen eigenen Sound an und wählt ihn aus', imp.cat === 'own' && imp.beats === 3 && imp.armed, JSON.stringify(imp));
    const lane = await page.locator('.lane[data-track-id="t2"]').boundingBox();
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.mouse.click(lane.x + 4.5 * ppb, lane.y + lane.height / 2);
    const placed = await page.evaluate((id) => window.loopwerk.store.track('t2').clips.map((c) => [c.sampleId === id, c.startBeat]), imp.id);
    check('Importierten Sound per Klick auf die Spur setzen', JSON.stringify(placed) === '[[true,4]]', JSON.stringify(placed));
    await page.keyboard.press('Escape');

    // Datei direkt auf eine Spur ziehen
    const dropped = await page.evaluate(async ({ x, y }) => {
      const sr = 44100, n = sr;
      const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 10) * 10000), true);
      const dt = new DataTransfer();
      dt.items.add(new File([b], 'Klatschen.wav', { type: 'audio/wav' }));
      const target = document.elementFromPoint(x, y);
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      await new Promise((r) => setTimeout(r, 600));
      return window.loopwerk.store.track('t3').clips.map((c) => [window.loopwerk.library.get(c.sampleId)?.name, c.startBeat]);
    }, { x: (await page.locator('.lane[data-track-id="t3"]').boundingBox()).x + 8.5 * ppb, y: (await page.locator('.lane[data-track-id="t3"]').boundingBox()).y + 20 });
    check('Audiodatei auf eine Spur ziehen importiert und setzt ein', JSON.stringify(dropped) === '[["Klatschen",8]]', JSON.stringify(dropped));

    // ---------- Sample-Editor ----------
    const clipId = await page.evaluate(() => window.loopwerk.store.track('t2').clips[0].id);
    await page.locator(`.clip[data-clip-id="${clipId}"]`).dblclick({ position: { x: 30, y: 40 } });
    await page.waitForSelector('#editor:not([hidden])');
    const title = await page.locator('#editor-title').textContent();
    check('Doppelklick öffnet den Sample-Editor', title.includes('Mein Gesang'), title);
    const wave = await page.locator('#ed-wave').boundingBox();
    await page.mouse.move(wave.x + wave.width * 0.25, wave.y + 40);
    await page.mouse.down();
    await page.mouse.move(wave.x + wave.width * 0.75, wave.y + 40, { steps: 6 });
    await page.mouse.up();
    const selInfo = await page.locator('#ed-info').textContent();
    check('Bereich auf der Wellenform auswählen', selInfo.startsWith('Auswahl'), selInfo);
    await clickR(page, '#ed-crop');
    const lenAfterCrop = await page.evaluate(() => window.loopwerk.editor.state.chs[0].length);
    await clickR(page, '#ed-reverse');
    await page.click('#ed-undo');
    const lenAfterUndo = await page.evaluate(() => window.loopwerk.editor.state.history.length);
    check('Zuschneiden im Editor und Rückgängig', Math.abs(lenAfterCrop - 33075) < 400 && lenAfterUndo === 1, `${lenAfterCrop} Frames, Verlauf ${lenAfterUndo}`);
    await reveal(page, '#ed-loop'); await page.check('#ed-loop');
    await page.fill('#ed-beats', '2');
    await page.press('#ed-beats', 'Enter');
    await fillR(page, '#ed-name', 'Gesang kurz');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stufe5-editor.png') });
    await page.click('#ed-apply');
    await page.waitForFunction(() => window.loopwerk.library.list().some((s) => s.name === 'Gesang kurz'), null, { timeout: 10000 });
    const applied = await page.evaluate((cid) => {
      const { store, library, ui } = window.loopwerk;
      const c = store.findClip(cid).clip;
      const s = library.get(c.sampleId);
      return { name: s.name, kind: s.kind, beats: s.lengthBeats, len: s.buffer.length, dock: ui.dock };
    }, clipId);
    check('Übernehmen speichert neuen Sound und setzt ihn in den Clip', applied.name === 'Gesang kurz' && applied.dock === null, JSON.stringify(applied));
    check('Als Loop markiert: auf 2 Schläge im Projekttempo gestreckt', applied.kind === 'loop' && applied.beats === 2 && applied.len === 44100, `${applied.len} Frames`);

    // ---------- Speichern mit eingebetteten Sounds, Wiederherstellen ----------
    const [download] = await Promise.all([page.waitForEvent('download'), clickR(page, '#save-btn')]);
    const saved = tmp('loopwerk-eigene.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('Projektdatei enthält die benutzten eigenen Sounds', json.ownSounds?.length === 2 && json.ownSounds.every((x) => x.wav.length > 1000), `${json.ownSounds?.length} eingebettet`);
    // eigenen Sound komplett entfernen (Bibliothek + IndexedDB), dann Projekt öffnen
    await page.evaluate(async (ids) => {
      const { own, store } = window.loopwerk;
      const m = await import('./src/model.js');
      store.replace(m.createEmptyProject());
      for (const id of ids) await own.remove(id);
    }, json.ownSounds.map((x) => x.id));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.some((t) => t.clips.length), null, { timeout: 10000 });
    const restored = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips.map((c) => window.loopwerk.library.get(c.sampleId)?.name)));
    check('Öffnen stellt eingebettete eigene Sounds wieder her', restored.includes('Gesang kurz') && restored.includes('Klatschen'), JSON.stringify(restored));

    // Eigene Sounds bleiben nach Neuladen erhalten (IndexedDB)
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const afterReload = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').map((s) => s.name).sort());
    check('Eigene Sounds bleiben nach Neuladen erhalten', afterReload.includes('Gesang kurz') && afterReload.includes('Mein Gesang'), JSON.stringify(afterReload));

    // Löschen: benutzter Sound wird geschützt, unbenutzter gelöscht
    await page.click('#shelf-chips .chip[data-filter="own"]');
    const rowUsed = page.locator('#library .loop-row', { hasText: 'Gesang kurz' });
    await rowUsed.locator('.loop-del').click();
    await rowUsed.locator('.loop-del').click();
    await page.waitForFunction(() => document.getElementById('hint').textContent.includes('wird im Projekt benutzt'), null, { timeout: 3000 }).catch(() => {});
    const hint = await page.locator('#hint').textContent();
    const rowFree = page.locator('#library .loop-row', { hasText: 'Mein Gesang' });
    await rowFree.locator('.loop-del').click();
    await rowFree.locator('.loop-del').click();
    await page.waitForFunction(() => !window.loopwerk.library.list().some((s) => s.name === 'Mein Gesang'), null, { timeout: 3000 }).catch(() => {});
    const ownNames = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').map((s) => s.name));
    check('Benutzter Sound ist vor dem Löschen geschützt', hint.includes('wird im Projekt benutzt') && ownNames.includes('Gesang kurz'), hint);
    check('Unbenutzter eigener Sound wird gelöscht', !ownNames.includes('Mein Gesang'), JSON.stringify(ownNames));

    // ---------- Aufnahme (simuliertes Mikrofon) ----------
    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); window.loopwerk.engine.setPosition(8); });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    await page.waitForTimeout(2000 + 1500); // 1 Takt Vorzähler (2 s) + 1,5 s Aufnahme
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 10000 });
    const rec = await page.evaluate(() => {
      const { store, library } = window.loopwerk;
      const t = store.project.tracks.find((x) => x.clips.length);
      if (!t) return null;
      const c = t.clips[0];
      const s = library.get(c.sampleId);
      let peak = 0; for (const v of s.orig.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { track: t.id, start: c.startBeat, name: s.name, dur: s.orig.duration, peak };
    });
    check('Aufnahme landet als Clip an der Abspielmarke', rec && rec.start === 8 && rec.name.startsWith('Aufnahme'), JSON.stringify(rec));
    check('Aufnahme beginnt nach dem Vorzähler und enthält Signal', rec && rec.dur > 1.0 && rec.dur < 2.4 && rec.peak > 0.01, rec && `${rec.dur.toFixed(2)} s, Spitze ${rec.peak.toFixed(3)}`);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
