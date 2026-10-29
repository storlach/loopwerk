// End-to-End-Tests für den Spike: node tests/spike.test.cjs [--shots]
// Prüft Timing samplegenau per Offline-Rendering, Überschreib-Logik, Drag & Drop und Wiedergabe.
const { chromium } = require('playwright');
const path = require('path');
const { start } = require('./serve.cjs');

const SHOTS = process.argv.includes('--shots');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const server = await start();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    await page.goto(url);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 15000 });

    // 1. Bibliothek
    const lib = await page.evaluate(() => {
      const list = window.loopwerk.library.list();
      return {
        count: list.length,
        synth: list.filter((s) => s.origin === 'Loopwerk').length,
        lengthsOk: list.every((s) => s.buffer.length === Math.round(s.lengthBeats * 0.5 * 44100)),
        silent: list.filter((s) => { const d = s.buffer.getChannelData(0); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m < 0.05; }).map((s) => s.id),
      };
    });
    check('Bibliothek: 15 synthetische Loops plus Katalog', lib.synth === 15 && lib.count >= 15, `${lib.synth} synthetisch, ${lib.count} gesamt`);
    check('Loop-Längen exakt in Takten', lib.lengthsOk);
    check('Kein Loop ist stumm', lib.silent.length === 0, lib.silent.join(', '));

    // 2. Samplegenaues Timing: Klick-Sample (1 Takt, Impuls auf Frame 0)
    const timing = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const sr = 44100;
      const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      buf.getChannelData(0)[0] = 1; buf.getChannelData(1)[0] = 1;
      library.register({ id: 'test-click', name: 'Klick', category: 'fx', lengthBeats: 4, bpm: 120, buffer: buf });
      const project = {
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [
          { id: 'a', sampleId: 'test-click', startBeat: 0, lengthBeats: 8, offsetBeats: 0 },   // Impulse bei 0 und 4
          { id: 'b', sampleId: 'test-click', startBeat: 12, lengthBeats: 4, offsetBeats: 0 },  // bei 12
          { id: 'c', sampleId: 'test-click', startBeat: 20, lengthBeats: 6, offsetBeats: 2 },  // erst bei 22
        ] }],
      };
      const out = await renderProject(project, library, { limiter: false, toBeat: 32 });
      const d = out.getChannelData(0);
      const hits = [];
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.3) hits.push(i);
      return hits;
    });
    const expected = [0, 4, 12, 22].map((b) => b * 22050);
    check('Clips starten samplegenau auf dem Raster', JSON.stringify(timing) === JSON.stringify(expected), `Frames ${timing.join(', ')}`);

    // 3. Überschreiben: Clip in die Mitte eines langen Clips legen teilt ihn
    const carved = await page.evaluate(async () => {
      const m = await import('./src/model.js');
      const lib = window.loopwerk.library;
      const s = new m.Store(m.createEmptyProject(), { sampleBeats: (id) => lib.get(id).lengthBeats });
      s.addClip('t1', 'chords-pad', 0, 16);
      s.addClip('t1', 'drums-four', 4, 4);
      const clips = s.track('t1').clips.map((c) => [c.sampleId, c.startBeat, c.lengthBeats, c.offsetBeats]);
      s.undo();
      const afterUndo = s.track('t1').clips.length;
      return { clips, afterUndo };
    });
    check('Überschreiben teilt den darunterliegenden Clip',
      JSON.stringify(carved.clips) === JSON.stringify([['chords-pad', 0, 4, 0], ['drums-four', 4, 4, 0], ['chords-pad', 8, 8, 8]]),
      JSON.stringify(carved.clips));
    check('Rückgängig stellt den Zustand wieder her', carved.afterUndo === 1);

    // 4. Drag & Drop aus dem Sound-Regal auf Spur 8, Takt 3
    await page.evaluate(() => { window.loopwerk.store.replace(JSON.parse(JSON.stringify(window.loopwerk.store.project))); });
    const item = page.locator('.loop-item[data-sample-id="drums-break"]');
    const lane = page.locator('.lane[data-track-id="t8"]');
    const ib = await item.boundingBox();
    const lb = await lane.boundingBox();
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.mouse.move(ib.x + 30, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(ib.x + 60, ib.y + 40, { steps: 4 });
    await page.mouse.move(lb.x + 8.5 * ppb, lb.y + lb.height / 2, { steps: 12 });
    await page.mouse.up();
    const dropped = await page.evaluate(() => window.loopwerk.store.track('t8').clips.map((c) => [c.sampleId, c.startBeat, c.lengthBeats]));
    check('Loop per Drag & Drop eingefügt und am Takt eingerastet', JSON.stringify(dropped) === JSON.stringify([['drums-break', 8, 8]]), JSON.stringify(dropped));

    // 5. Clip verschieben: von Takt 3 auf Takt 5 ziehen
    const clip = page.locator('.lane[data-track-id="t8"] .clip').first();
    const cb = await clip.boundingBox();
    await page.mouse.move(cb.x + 20, cb.y + cb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cb.x + 20 + 8 * ppb, cb.y + cb.height / 2, { steps: 10 });
    await page.mouse.up();
    const moved = await page.evaluate(() => window.loopwerk.store.track('t8').clips.map((c) => c.startBeat));
    check('Clip verschieben rastet am Takt ein', JSON.stringify(moved) === JSON.stringify([16]), JSON.stringify(moved));

    // 6. Wiedergabe in Echtzeit
    await page.click('#play-btn');
    await page.waitForTimeout(1200);
    const live = await page.evaluate(() => ({
      playing: window.loopwerk.engine.playing,
      beat: window.loopwerk.engine.currentBeat(),
      state: window.loopwerk.engine.ctx.state,
      voices: window.loopwerk.engine.voices.size,
    }));
    check('Wiedergabe läuft und die Position wandert', live.playing && live.beat > 1.5 && live.beat < 3.5, `Schlag ${live.beat.toFixed(2)}, Context ${live.state}`);
    check('Stimmen sind eingeplant', live.voices > 0, `${live.voices} Stimmen`);
    if (SHOTS) await page.screenshot({ path: path.join(process.env.SHOT_DIR || '.', 'desktop-light.png') });
    await page.keyboard.press('Space');
    const stopped = await page.evaluate(() => ({ playing: window.loopwerk.engine.playing, pos: window.loopwerk.engine.positionBeat }));
    check('Leertaste stoppt und springt zur Startposition', !stopped.playing && stopped.pos === 0);

    // 7. Loop-Sprung: Loop Takt 1–2, Start bei 0, nach ~4,3 s muss die Position wieder im Loop liegen
    await page.evaluate(() => window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 8 }));
    await page.click('#play-btn');
    await page.waitForTimeout(4300);
    const looped = await page.evaluate(() => window.loopwerk.engine.currentBeat());
    check('Loop springt zurück an den Anfang', looped >= 0 && looped < 1.5, `Schlag ${looped.toFixed(2)}`);
    await page.click('#play-btn');

    check('Keine Fehler in der Konsole', errors.length === 0, errors.join(' | '));

    if (SHOTS) {
      const dir = process.env.SHOT_DIR || '.';
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: path.join(dir, 'desktop-dark.png') });
      const phone = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
      await phone.goto(url);
      await phone.waitForFunction(() => window.loopwerk?.ready);
      await phone.screenshot({ path: path.join(dir, 'phone-light.png'), fullPage: true });
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('Handy: keine horizontale Seitenverschiebung', overflow <= 0, `${overflow}px`);
    }
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
})();
