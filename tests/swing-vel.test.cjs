// Swing und Anschlag im Beat- und Melodie-Editor: Offbeat-Sechzehntel kommen später, leise Schritte/Noten sind leiser,
// Anschlag-Pinsel setzt, ändert und löscht; Anzeige dimmt leise Schritte.
const { openApp, createChecker, createCard } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const m = await page.evaluate(async () => {
      const ins = await import('./src/instruments.js');
      const { swingBeat } = ins;
      const renderPattern = async (p, bpm) => (await ins.renderPattern(p, bpm)).buffer;
      const steps = (on) => Array.from({ length: 16 }, (_, i) => on[i] ?? 0);
      const onset = (buf, from = 0) => { const d = buf.getChannelData(0); for (let i = from; i < d.length; i++) if (Math.abs(d[i]) > 0.02) return i; return -1; };
      const peak = (buf) => { let p = 0; for (const v of buf.getChannelData(0)) p = Math.max(p, Math.abs(v)); return p; };
      const drums = (rows, swing) => ({ type: 'drums', kit: 'elektro', bars: 1, rows, swing });
      // Kick nur auf Schritt 2 (Offbeat-Sechzehntel) und auf Schritt 3 (gerade): 120 BPM, Schlag = 0,5 s
      const straight = await renderPattern(drums({ kick: steps({ 1: 1 }) }, 0.5), 120);
      const swung = await renderPattern(drums({ kick: steps({ 1: 1 }) }, 0.667), 120);
      const evenStraight = await renderPattern(drums({ kick: steps({ 2: 1 }) }, 0.5), 120);
      const evenSwung = await renderPattern(drums({ kick: steps({ 2: 1 }) }, 0.667), 120);
      const loud = await renderPattern(drums({ snare: steps({ 0: 1 }) }), 120);
      const soft = await renderPattern(drums({ snare: steps({ 0: 0.4 }) }), 120);
      const crashLoud = await renderPattern(drums({ crash: steps({ 0: 1 }) }), 120);
      const crashSoft = await renderPattern(drums({ crash: steps({ 0: 0.4 }) }), 120);
      const mel = (notes, swing) => ({ type: 'synth', preset: 'pluck', bars: 1, notes, swing });
      const nStraight = await renderPattern(mel([{ pitch: 60, start: 0.25, len: 0.25, vel: 1 }], 0.5), 120);
      const nSwung = await renderPattern(mel([{ pitch: 60, start: 0.25, len: 0.25, vel: 1 }], 0.667), 120);
      const nSoft = await renderPattern(mel([{ pitch: 60, start: 0, len: 1, vel: 0.4 }]), 120);
      const nLoud = await renderPattern(mel([{ pitch: 60, start: 0, len: 1, vel: 1 }]), 120);
      return {
        delay: (onset(swung) - onset(straight)) / 44100,
        expect: (swingBeat(0.25, 0.667) - 0.25) * 0.5,
        evenDelay: (onset(evenSwung) - onset(evenStraight)) / 44100,
        velRatio: peak(soft) / peak(loud),
        crashRatio: peak(crashSoft) / peak(crashLoud),
        noteDelay: (onset(nSwung) - onset(nStraight)) / 44100,
        noteVel: peak(nSoft) / peak(nLoud),
      };
    });
    const f = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v));
    check('Swing Triole: Offbeat-Sechzehntel kommt eine Zweiundsiebzigstel später (±1 ms)', Math.abs(m.delay - m.expect) < 0.001 && m.expect > 0.04, f(m));
    check('Swing lässt gerade Sechzehntel an ihrem Platz', Math.abs(m.evenDelay) < 0.0005, f(m));
    check('Anschlag leise (0,4) ist deutlich leiser als laut', m.velRatio > 0.25 && m.velRatio < 0.6, f(m));
    check('Auch das Becken folgt dem Anschlag', m.crashRatio > 0.25 && m.crashRatio < 0.6, f(m));
    check('Melodie: Swing verschiebt Noten auf dem Offbeat', Math.abs(m.noteDelay - m.expect) < 0.002, f(m));
    check('Melodie: leise Note ist leiser', m.noteVel > 0.2 && m.noteVel < 0.75, f(m));

    // ---------- Bedienung Beat-Editor ----------
    await createCard(page, 'beat');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.waitForTimeout(600);
    const pid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const cellVal = (row, i) => page.evaluate(([id, r, s]) => window.loopwerk.store.project.patterns[id].rows?.[r]?.[s] || 0, [pid, row, i]);
    await page.selectOption('#pat-vel', '0.4');
    await page.click('.pat-cell[data-row="snare"][data-step="4"]');
    check('Pinsel „Leise“ setzt einen leisen Schritt', Math.abs(await cellVal('snare', 4) - 0.4) < 1e-6, String(await cellVal('snare', 4)));
    const dim = await page.evaluate(() => { const c = document.querySelector('.pat-cell[data-row="snare"][data-step="4"]'); return { vel: c.style.getPropertyValue('--vel'), op: Number(getComputedStyle(c).opacity) }; });
    check('Leiser Schritt leuchtet schwächer', dim.vel === '0.4' && dim.op < 0.8, JSON.stringify(dim));
    await page.selectOption('#pat-vel', '1');
    await page.click('.pat-cell[data-row="snare"][data-step="4"]');
    check('Pinsel „Laut“ auf leisem Schritt macht ihn laut (statt zu löschen)', await cellVal('snare', 4) === 1);
    await page.click('.pat-cell[data-row="snare"][data-step="4"]');
    check('Gleicher Anschlag nochmal: Schritt aus', await cellVal('snare', 4) === 0);
    await page.selectOption('#pat-swing', '0.667');
    check('Swing „Triole“ wird am Pattern gespeichert', await page.evaluate((id) => window.loopwerk.store.project.patterns[id].swing, pid) === 0.667);
    await page.keyboard.press('Control+z');
    check('Swing ist ein Rückgängig-Schritt', (await page.evaluate((id) => window.loopwerk.store.project.patterns[id].swing ?? 0.5, pid)) === 0.5);

    // ---------- Bedienung Melodie-Editor ----------
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForTimeout(500);
    await createCard(page, 'melody');
    await page.waitForFunction(() => /^Melodie(-Editor| bearbeiten)$/.test(document.getElementById('pat-title').textContent) /* Desktop seit Scheibe 7: „Melodie bearbeiten“ */);
    await page.waitForTimeout(600);
    await page.selectOption('#pat-vel', '0.7');
    const box = await page.evaluate(() => { const w = document.getElementById('pat-roll').parentElement.getBoundingClientRect(); const r = document.getElementById('pat-roll').getBoundingClientRect(); const top = Math.max(w.top, r.top), bottom = Math.min(w.bottom, r.bottom); return { x: r.left, y: top, height: bottom - top }; });
    await page.mouse.click(box.x + 120, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const notes = await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes);
    check('Neue Note bekommt den Anschlag „Mittel“', notes.length === 1 && notes[0].vel === 0.7, JSON.stringify(notes));
    await page.selectOption('#pat-vel', '1');
    await page.mouse.click(box.x + 120, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const notes2 = await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes);
    check('Klick mit anderem Anschlag ändert die Note, statt sie zu löschen', notes2.length === 1 && notes2[0].vel === 1, JSON.stringify(notes2));
    await page.mouse.click(box.x + 120, box.y + box.height / 2);
    await page.waitForTimeout(150);
    check('Gleicher Anschlag: Klick löscht wie bisher', (await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].notes.length)) === 0);
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
  finish();
})();
