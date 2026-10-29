// Tests für Stufe 2 (Arranger-Komfort): node tests/stufe2.test.cjs [--shots]
const path = require('path');
const fs = require('fs');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    // ---------- Offline: Klang messbar ----------
    const audio = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const m = await import('./src/model.js');
      const proj = (clips, extra = {}) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips }], ...extra,
      });
      const render = async (p, toBeat = 32) => (await renderProject(p, library, { limiter: false, toBeat })).getChannelData(0);
      const hits = (d) => { const h = []; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.1) h.push(i); return h; };
      const out = {};

      // 1. Clip-Gain halbiert den Impuls
      const g = await render(proj([{ id: 'a', sampleId: 'test-click', startBeat: 0, lengthBeats: 4, gain: 0.5 }]), 4);
      out.gainPeak = g[0];

      // 2. Fade-In / Fade-Out auf Gleichspannung
      const f = await render(proj([{ id: 'a', sampleId: 'test-dc', startBeat: 0, lengthBeats: 4, fadeInBeats: 2, fadeOutBeats: 1 }]), 4);
      out.fade = [0, 1, 2, 3, 3.5, 3.999].map((b) => f[Math.round(b * 22050)]);

      // 3. Teilen ist klanglich neutral (Pad mit Fades, Teilung mitten im Ton)
      const base = proj([{ id: 'a', sampleId: 'chords-pad', startBeat: 0, lengthBeats: 16, offsetBeats: 0, fadeInBeats: 2, fadeOutBeats: 3, gain: 0.8 }]);
      const before = await render(base, 16);
      const s = new m.Store(JSON.parse(JSON.stringify(base)), { sampleBeats: (id) => library.get(id).lengthBeats });
      out.splitIds = s.splitAt(6.5);
      const after = await render(s.project, 16);
      let maxDiff = 0;
      for (let i = 0; i < before.length; i++) maxDiff = Math.max(maxDiff, Math.abs(before[i] - after[i]));
      out.splitDiff = maxDiff;
      out.splitClips = s.track('t1').clips.map((c) => [c.startBeat, c.lengthBeats, c.offsetBeats, c.fadeInBeats, c.fadeOutBeats]);

      // 4. Links kürzen erhält die Phase
      const t = new m.Store(proj([{ id: 'a', sampleId: 'test-click', startBeat: 0, lengthBeats: 16 }]), { sampleBeats: (id) => library.get(id).lengthBeats });
      t.trimClipStart('a', 2);
      out.trimClip = t.track('t1').clips.map((c) => [c.startBeat, c.lengthBeats, c.offsetBeats]);
      out.trimHits = hits(await render(t.project, 16));

      // 5. Duplizieren
      const d = new m.Store(proj([{ id: 'a', sampleId: 'test-click', startBeat: 4, lengthBeats: 4 }]), { sampleBeats: () => 4 });
      d.duplicateClip('a');
      out.dup = d.track('t1').clips.map((c) => [c.startBeat, c.lengthBeats]);

      // 6. Spuren: hinzufügen, umbenennen, löschen, rückgängig
      const k = new m.Store(m.createEmptyProject(), { sampleBeats: () => 4 });
      const nid = k.addTrack();
      k.setTrack(nid, { name: 'Gesang' });
      const afterAdd = k.project.tracks.map((x) => x.name).slice(-1)[0];
      k.removeTrack('t1');
      out.tracks = { nid, afterAdd, count: k.project.tracks.length, first: k.project.tracks[0].id };
      k.undo();
      out.tracks.undoCount = k.project.tracks.length;
      return out;
    });

    check('Clip-Lautstärke 0,5 halbiert den Pegel', Math.abs(audio.gainPeak - 0.425) < 0.002, `Spitze ${audio.gainPeak.toFixed(4)} (erwartet 0,425)`);
    const exp = [0, 0.425, 0.85, 0.85, 0.425, 0].map((v) => v);
    const fadeOk = audio.fade.every((v, i) => Math.abs(v - exp[i]) < 0.01);
    check('Fade-In und Fade-Out verlaufen linear', fadeOk, audio.fade.map((v) => v.toFixed(3)).join(' / '));
    check('Teilen ist klanglich neutral', audio.splitDiff < 1e-3, `max. Abweichung ${audio.splitDiff.toExponential(2)}`);
    check('Teilen übernimmt Fades und Phase richtig',
      JSON.stringify(audio.splitClips) === JSON.stringify([[0, 6.5, 0, 2, 0], [6.5, 9.5, 6.5, 0, 3]]), JSON.stringify(audio.splitClips));
    check('Links kürzen: Inhalt bleibt an seiner Stelle', JSON.stringify(audio.trimHits) === JSON.stringify([4, 8, 12].map((b) => b * 22050)),
      `Clip ${JSON.stringify(audio.trimClip)}, Impulse bei ${audio.trimHits.join(', ')}`);
    check('Duplizieren legt die Kopie direkt dahinter', JSON.stringify(audio.dup) === JSON.stringify([[4, 4], [8, 4]]), JSON.stringify(audio.dup));
    check('Spuren hinzufügen, umbenennen, löschen, rückgängig',
      audio.tracks.nid === 't9' && audio.tracks.afterAdd === 'Gesang' && audio.tracks.count === 8 && audio.tracks.first === 't2' && audio.tracks.undoCount === 9,
      JSON.stringify(audio.tracks));

    // ---------- Bedienung ----------
    // Ausgangslage: Beispielprojekt frisch laden
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createDemoProject());
    });
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    const resetScroll = () => page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft = 0; });
    const clipBox = async (id) => { await resetScroll(); return page.locator(`.clip[data-clip-id="${id}"]`).boundingBox(); };
    const clipData = (id) => page.evaluate((cid) => window.loopwerk.store.findClip(cid)?.clip, id);
    const drag = async (x, y, dx, dy) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
      await page.mouse.move(x + dx, y + dy, { steps: 4 });
      await page.mouse.up();
    };

    // Pad-Clip (c4, Takt 1–16) auswählen, dann Fade-In-Griff 2 Schläge nach rechts
    let b = await clipBox('c4');
    await page.mouse.click(b.x + 60, b.y + b.height - 8);
    const grip = async (cls) => {
      const loc = page.locator(`.clip[data-clip-id="c4"] ${cls}`);
      await loc.scrollIntoViewIfNeeded();
      return loc.boundingBox();
    };
    let g = await grip('.clip-fade-in');
    await drag(g.x + g.width / 2, g.y + g.height / 2, 2 * ppb, 0);
    let c = await clipData('c4');
    check('Fade-In per Griff ziehen', Math.abs(c.fadeInBeats - 2) < 0.26, `fadeInBeats ${c.fadeInBeats}`);

    // Lautstärke-Griff halb nach unten
    g = await grip('.clip-vol');
    const waveH = await page.locator('.clip[data-clip-id="c4"] canvas').evaluate((n) => n.clientHeight);
    await drag(g.x + g.width / 2, g.y + g.height / 2, 0, (waveH - 2) / 2);
    c = await clipData('c4');
    check('Clip-Lautstärke per Griff ziehen', Math.abs(c.gain - 0.5) < 0.06, `gain ${c.gain}`);

    // Fade-Out-Griff 1 Schlag nach links
    g = await grip('.clip-fade-out');
    await drag(g.x + g.width / 2, g.y + g.height / 2, -1 * ppb, 0);
    c = await clipData('c4');
    check('Fade-Out per Griff ziehen', Math.abs(c.fadeOutBeats - 1) < 0.26, `fadeOutBeats ${c.fadeOutBeats}`);

    // Linken Rand um 1 Takt nach rechts (Drums-Clip c1 beginnt bei Takt 5)
    b = await clipBox('c1');
    await drag(b.x + 3, b.y + b.height - 10, 4 * ppb, 0);
    c = await clipData('c1');
    check('Linken Rand ziehen kürzt den Clip am Anfang', c.startBeat === 20 && c.lengthBeats === 44, `Start ${c.startBeat}, Länge ${c.lengthBeats}`);

    // Teilen mit T: Pad an Takt 3 (Schlag 8)
    await page.evaluate(() => window.loopwerk.engine.setPosition(8));
    b = await clipBox('c4');
    await page.mouse.click(b.x + 60, b.y + b.height - 8);
    await page.keyboard.press('t');
    const padParts = await page.evaluate(() => window.loopwerk.store.track('t4').clips.map((x) => [x.startBeat, x.lengthBeats]));
    check('Taste T teilt den ausgewählten Clip an der Abspielmarke', JSON.stringify(padParts) === JSON.stringify([[0, 8], [8, 56]]), JSON.stringify(padParts));

    // Strg+D dupliziert die Auswahl (rechter Teil ist ausgewählt → hinter Song-Ende kein Platz, daher Riser c7 nehmen)
    b = await clipBox('c7');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height - 8);
    await page.keyboard.press('Control+d');
    const fx = await page.evaluate(() => window.loopwerk.store.track('t7').clips.map((x) => [x.sampleId, x.startBeat, x.lengthBeats]));
    check('Strg+D dupliziert direkt dahinter', JSON.stringify(fx) === JSON.stringify([['fx-riser', 8, 8], ['fx-riser', 16, 8]]), JSON.stringify(fx));

    // Spur umbenennen per Doppelklick
    await page.locator('.track-row').nth(7).locator('.track-name').dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Gesang');
    await page.keyboard.press('Enter');
    const nm = await page.evaluate(() => window.loopwerk.store.track('t8').name);
    check('Spur per Doppelklick umbenennen', nm === 'Gesang', nm);

    // Spur hinzufügen und mit zwei Klicks löschen
    await page.click('#add-track');
    const nTracks = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    const del = page.locator('.track-row').nth(8).locator('.tbtn-del');
    await del.click();
    const afterOne = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    await del.click();
    const afterTwo = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    check('Spur hinzufügen und mit Bestätigung löschen', nTracks === 9 && afterOne === 9 && afterTwo === 8, `${nTracks} → ${afterOne} → ${afterTwo}`);

    // Rückgängig nimmt Löschen zurück
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    check('Strg+Z stellt die gelöschte Spur wieder her', undone === 9, String(undone));

    // Wiedergabe mit Fades und Teilung läuft ohne Fehler, Live-Änderung während der Wiedergabe
    await page.click('#play-btn');
    await page.waitForTimeout(600);
    await page.evaluate(() => { const l = window.loopwerk; l.store.setClip('c1', { gain: 0.3, fadeInBeats: 1 }); });
    await page.waitForTimeout(400);
    const live = await page.evaluate(() => ({ playing: window.loopwerk.engine.playing, beat: window.loopwerk.engine.currentBeat() }));
    await page.click('#play-btn');
    check('Wiedergabe mit Hüllkurven und Live-Änderung', live.playing && live.beat > 1, `Schlag ${live.beat.toFixed(2)}`);

    if (SHOTS) {
      b = await clipBox('c4');
      await page.mouse.click(b.x + 60, b.y + b.height - 8);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOT_DIR, 'stufe2-light.png') });
    }

    // Projekt speichern (lokal: Download) und wieder öffnen
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-btn')]);
    const saved = path.join(require('os').tmpdir(), 'loopwerk-test-projekt.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('Speichern erzeugt eine Projektdatei', json.version === 1 && json.tracks.length === 9, download.suggestedFilename());
    json.name = 'Wiedergeöffnet';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); });
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Wiedergeöffnet', null, { timeout: 3000 });
    const reopened = await page.evaluate(() => ({ tracks: window.loopwerk.store.project.tracks.length, gain: window.loopwerk.store.findClip('c1')?.clip.gain }));
    check('Öffnen lädt das gespeicherte Projekt', reopened.tracks === 9 && reopened.gain === 0.3, JSON.stringify(reopened));

    // Ungültige Datei wird verständlich abgewiesen
    const bad = path.join(require('os').tmpdir(), 'kaputt.json');
    fs.writeFileSync(bad, '{ kein json');
    await page.setInputFiles('#open-input', bad);
    await page.waitForTimeout(200);
    const hint = await page.locator('#hint').textContent();
    check('Ungültige Datei wird mit Hinweis abgewiesen', hint.includes('keine Projektdatei'), hint);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));

    if (SHOTS) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createDemoProject()); window.loopwerk.store.setClip('c4', { fadeInBeats: 4, fadeOutBeats: 6, gain: 0.7 }); });
      b = await clipBox('c4');
      await page.mouse.click(b.x + 60, b.y + b.height - 8);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOT_DIR, 'stufe2-dark.png') });
    }
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
