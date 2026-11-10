// Editor-Scheibe: MIDI-Anschlag, MIDI-Drums (General MIDI), Akkord-Eingabe, Quantisieren – Desktop und Handy.
// MIDI wird über eine Attrappe für navigator.requestMIDIAccess simuliert (page.addInitScript).
// node tests/editor-midi.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker, createCard, clickR, selectR } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Läuft vor der Seite: ein MIDI-Eingang, dessen onmidimessage der Test aufruft
const MIDI_STUB = () => {
  window.__midiIn = { name: 'Test-Keyboard', onmidimessage: null };
  navigator.requestMIDIAccess = async () => ({ inputs: new Map([['a', window.__midiIn]]), onstatechange: null });
  // Jede Verstärkung, die die App anlegt, merken: so sieht man, mit welchem Anschlag ein Ton vorgehört wird
  window.__gains = [];
  const create = AudioContext.prototype.createGain;
  AudioContext.prototype.createGain = function () { const g = create.call(this); window.__gains.push(g); return g; };
};
const NOTE_ON = (note, vel) => ({ data: [0x90, note, vel] });
const NOTE_OFF = (note) => ({ data: [0x80, note, 0] });

// Läuft im Browser: Raster der Piano-Roll (Desktop) – Mitte der Zeilen und Spalten
function geometry(pitch) {
  const wrap = document.getElementById('pat-roll-wrap');
  const canvas = document.getElementById('pat-roll');
  const keyW = 30;
  const row = 14;
  wrap.scrollTop = Math.max(0, (84 - pitch) * row - wrap.clientHeight / 2);
  const r = canvas.getBoundingClientRect();
  const { store, patternEditor } = window.loopwerk;
  const p = store.project.patterns[patternEditor.id];
  const cellW = (r.width - keyW) / (p.bars * 16);
  const ys = {};
  for (let m = 40; m <= 84; m++) ys[m] = r.top + (84 - m) * row + row / 2;
  return { x0: r.left + keyW, cellW, ys };
}

(async () => {
  // ================= Desktop =================
  const app = await openApp({ viewport: { width: 1400, height: 900 }, init: MIDI_STUB });
  const { page } = app;
  try {
    // ---------- Modell ----------
    const m = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const S = await import('./src/scale.js');
      const proj = (key) => ({ key, patterns: {} });
      const pat = (extra = {}) => ({ type: 'synth', notes: [], ...extra });
      const ch = (key, mode, root, extra) => S.chordPitches(proj(key), pat(extra), mode, root);
      const rowIds = I.DRUM_ROWS.map((r) => r.id);
      return {
        v127: I.midiVelocity(127), v100: I.midiVelocity(100), v1: I.midiVelocity(1), v0: I.midiVelocity(0), v64: I.midiVelocity(64), v32: I.midiVelocity(32),
        mono: [10, 30, 60, 90, 120].map(I.midiVelocity).every((v, i, a) => i === 0 || v > a[i - 1]),
        gmOk: Object.values(I.GM_DRUMS).every((r) => rowIds.includes(r)), gmRows: [...new Set(Object.values(I.GM_DRUMS))].length, rows: rowIds.length,
        off: ch('Am', 'off', 69), major: ch('Am', 'major', 69), minor: ch('Am', 'minor', 69), power: ch('Am', 'power', 69), sept: ch('Am', 'seventh', 69),
        scaleA: ch('Am', 'scale', 69), scaleD: ch('Am', 'scale', 62), scaleB: ch('Am', 'scale', 71), scaleG: ch('Am', 'scale', 67),
        scaleDm_B: ch('Dm', 'scale', 71), scaleDm_A: ch('Dm', 'scale', 69), scaleDm_D: ch('Dm', 'scale', 62), scaleDm_Bb: ch('Dm', 'scale', 70),
        lockMajor: ch('Am', 'major', 69, { scaleLock: true }), lockSept: ch('Am', 'seventh', 69, { scaleLock: true }),
        topPower: ch('Am', 'power', 84), topScale: ch('Am', 'scale', 83), topMajor: ch('Am', 'major', 81), low: ch('Am', 'seventh', 36),
      };
    });
    const j = JSON.stringify;
    check('Velocity → Anschlag: 127 = 1, kleinste = 0,1 (Mindestwert), steigend, 64 etwa 0,58', m.v127 === 1 && m.v1 === 0.1 && m.v0 === 0.1 && m.mono && Math.abs(m.v64 - 0.58) < 0.02, `${m.v127} ${m.v1} ${m.v64} ${m.v32}`);
    check('GM-Belegung zeigt nur auf vorhandene Zeilen, alle acht Zeilen sind erreichbar', m.gmOk && m.gmRows === m.rows, `${m.gmRows}/${m.rows}`);
    check('Akkorde über A: Aus = A; Dur A C♯ E; Moll A C E; Power A E A; Sept A C♯ E G',
      j(m.off) === '[69]' && j(m.major) === '[69,73,76]' && j(m.minor) === '[69,72,76]' && j(m.power) === '[69,76,81]' && j(m.sept) === '[69,73,76,79]', j([m.off, m.major, m.minor, m.power, m.sept]));
    check('Tonleiter-Akkord in A-Moll: A → A C E, D → D F A, H → H D F, G → G H D',
      j(m.scaleA) === '[69,72,76]' && j(m.scaleD) === '[62,65,69]' && j(m.scaleB) === '[71,74,77]' && j(m.scaleG) === '[67,71,74]', j([m.scaleA, m.scaleD, m.scaleB, m.scaleG]));
    check('Tonleiter-Akkord folgt der Songtonart (D-Moll: H wird B♭ → B♭ D F, D → D F A, A → A C E)',
      j(m.scaleDm_B) === '[70,74,77]' && j(m.scaleDm_D) === '[62,65,69]' && j(m.scaleDm_A) === '[69,72,76]' && j(m.scaleDm_Bb) === '[70,74,77]', j([m.scaleDm_B, m.scaleDm_D, m.scaleDm_A]));
    check('Mit Tonleiter-Sperre bleiben Akkorde in der Tonleiter (Dur über A = A C E, Sept = A C E G)', j(m.lockMajor) === '[69,72,76]' && j(m.lockSept) === '[69,72,76,79]', j([m.lockMajor, m.lockSept]));
    check('Töne außerhalb C2–C6 fallen weg (Power auf C6 = nur C6, Dur auf A5 ohne E6)', j(m.topPower) === '[84]' && j(m.topMajor) === '[81]' && m.topScale.every((p) => p <= 84) && m.low[0] === 36, j([m.topPower, m.topMajor, m.topScale, m.low]));

    // ---------- Melodie-Editor ----------
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await page.waitForTimeout(600);
    const pid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const getNotes = () => page.evaluate((id) => window.loopwerk.store.project.patterns[id].notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len, vel: n.vel })), pid);
    const setNotes = (list) => page.evaluate(([id, l]) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = l.map(([pitch, start, len = 1, vel = 1]) => ({ pitch, start, len, vel })); }), [pid, list]);
    const pitchesOf = (ns) => ns.map((n) => n.pitch).sort((a, b) => a - b);
    const undoDepth = () => page.evaluate(() => window.loopwerk.store.undoStack.length);
    const midi = (msg) => page.evaluate((x) => window.__midiIn.onmidimessage(x), msg);
    const flashText = () => page.evaluate(() => window.loopwerk.ui.flashText);
    const waitNotes = (n) => page.waitForFunction(([id, k]) => window.loopwerk.store.project.patterns[id].notes.length >= k, [pid, n], { timeout: 5000 });
    const near = (a, b, e = 0.002) => Math.abs(a - b) <= e;

    const mid = await page.evaluate(() => !!window.__midiIn.onmidimessage);
    check('MIDI-Attrappe ist beim Öffnen des Editors angemeldet', mid);

    // ----- Akkord-Feld -----
    const field = await page.evaluate(() => {
      const f = document.getElementById('pat-chord-field');
      const r = f.getBoundingClientRect();
      return { vis: !!f.offsetParent, inView: r.right <= innerWidth && r.bottom <= innerHeight, options: [...document.querySelectorAll('#pat-chord option')].map((o) => o.textContent), value: document.getElementById('pat-chord').value, head: document.querySelector('#pattern .dock-actions').scrollWidth <= document.querySelector('#pattern .dock-actions').clientWidth };
    });
    check('Desktop: Feld „Akkord“ in der Kopfzeile, Voreinstellung Aus, Auswahl Aus · Dur · Moll · Tonleiter · Power · Sept',
      field.vis && field.inView && field.value === 'off' && field.options.join(' · ') === 'Aus · Dur · Moll · Tonleiter · Power · Sept' && field.head, j(field));

    // ----- Velocity: Schritt-Eingabe -----
    await clickR(page, '#pat-rec');
    await midi(NOTE_ON(60, 64)); await midi(NOTE_OFF(60));
    await midi(NOTE_ON(62, 127)); await midi(NOTE_OFF(62));
    await midi(NOTE_ON(64, 1)); await midi(NOTE_OFF(64));
    await waitNotes(3);
    let ns = await getNotes();
    check('Schritt-Eingabe: Velocity 64 / 127 / 1 → Anschlag 0,58 / 1 / 0,1 (Mindestwert)',
      ns.length === 3 && near(ns[0].vel, m.v64) && ns[1].vel === 1 && ns[2].vel === 0.1, j(ns));
    // Vorhören: Verstärkung des gehaltenen Tons = 0,8 · Anschlag
    const g0 = await page.evaluate(() => window.__gains.length);
    await midi(NOTE_ON(67, 32)); // gehalten: die Verstärkung steht, bis die Taste losgelassen wird
    await page.waitForTimeout(250);
    const heard = await page.evaluate((from) => window.__gains.slice(from).map((g) => +g.gain.value.toFixed(4)), g0);
    await midi(NOTE_OFF(67));
    const g1 = await page.evaluate(() => window.__gains.length);
    await midi(NOTE_ON(67, 127));
    await page.waitForTimeout(250);
    const heardLoud = await page.evaluate((from) => window.__gains.slice(from).map((g) => +g.gain.value.toFixed(4)), g1);
    await midi(NOTE_OFF(67));
    const want = +(0.8 * m.v32).toFixed(4);
    // Seit „Pegel nach Lautheit“ (ADR 013) steckt der Pegel des Klangs mit drin: voll = 0,8 · Pegel, leise = voll · Anschlag
    const full = heardLoud.find((b) => b > 0.3 && b <= 0.8 + 1e-3 && heard.some((a) => Math.abs(a / b - m.v32) < 0.002));
    check('Vorhören: leise gespielter Ton läuft mit Anschlag · voller Verstärkung, voller Anschlag höchstens 0,8 (lauter)',
      full != null && want < 0.5, `Anschlag ${m.v32}; leise ${j(heard)}; voll ${j(heardLoud)} → ${full}`);
    await waitNotes(5);
    // Computertastatur und Klaviatur bleiben beim Pinsel
    await page.selectOption('#pat-vel', '0.7');
    await setNotes([]);
    await page.keyboard.press('a');
    await waitNotes(1);
    ns = await getNotes();
    check('Computertastatur nutzt den Anschlag-Pinsel (Mittel = 0,7)', ns.length === 1 && ns[0].vel === 0.7, j(ns));
    await page.selectOption('#pat-vel', '0.4');
    await page.click('.pat-key[data-pitch="64"]');
    await waitNotes(2);
    ns = await getNotes();
    check('Klaviatur (Klick) nutzt den Anschlag-Pinsel (Leise = 0,4)', ns.length === 2 && ns[1].pitch === 64 && ns[1].vel === 0.4, j(ns));
    await page.selectOption('#pat-vel', '1');
    await clickR(page, '#pat-rec'); // Schritt-Eingabe aus

    // ----- Akkord per Klick in die Piano-Roll -----
    await setNotes([]);
    const click = async (pitch, cell) => {
      const g = await page.evaluate(geometry, pitch);
      await page.mouse.click(g.x0 + g.cellW * cell + 3, g.ys[pitch]);
      await page.waitForTimeout(120);
    };
    await click(69, 0);
    check('Akkord „Aus“: ein Klick = eine Note', j(pitchesOf(await getNotes())) === '[69]');
    const modes = [['major', [69, 73, 76]], ['minor', [69, 72, 76]], ['scale', [69, 72, 76]], ['power', [69, 76, 81]], ['seventh', [69, 73, 76, 79]]];
    let cell = 4;
    for (const [mode, want2] of modes) {
      await setNotes([]);
      await page.selectOption('#pat-chord', mode);
      const d0 = await undoDepth();
      await click(69, cell);
      ns = await getNotes();
      check(`Klick mit Akkord „${mode}“ über A: ${want2.join(' ')} – gleicher Start, gleiche Länge, ein Rückgängig-Schritt`,
        j(pitchesOf(ns)) === j(want2) && new Set(ns.map((n) => n.start)).size === 1 && new Set(ns.map((n) => n.len)).size === 1 && (await undoDepth()) === d0 + 1, `${j(ns)} Tiefe ${d0}→${await undoDepth()}`);
      await page.evaluate(() => window.loopwerk.store.undo());
      check(`Rückgängig nimmt den ganzen Akkord „${mode}“ zurück`, (await getNotes()).length === 0);
      cell += 4;
    }
    // Einzelne Noten bleiben einzeln editierbar
    await page.selectOption('#pat-chord', 'major');
    await setNotes([]);
    await click(69, 0);
    await click(73, 0); // Klick auf die Terz: nur diese Note verschwindet
    ns = await getNotes();
    check('Einzelne Akkordnote lässt sich einzeln löschen (Klick auf die Terz)', j(pitchesOf(ns)) === '[69,76]', j(ns));
    // Ziehen auf freier Fläche verlängert den ganzen Akkord
    await setNotes([]);
    {
      const g = await page.evaluate(geometry, 69);
      await page.mouse.move(g.x0 + g.cellW * 8 + 3, g.ys[69]);
      await page.mouse.down();
      await page.mouse.move(g.x0 + g.cellW * 8 + 3 + g.cellW * 7, g.ys[69], { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    }
    ns = await getNotes();
    check('Ziehen auf freier Fläche verlängert alle Töne des Akkords gleich', ns.length === 3 && new Set(ns.map((n) => n.len)).size === 1 && ns[0].len > 1, j(ns));
    // Pinsel gilt für alle Akkordnoten
    await setNotes([]);
    await page.selectOption('#pat-vel', '0.4');
    await click(69, 0);
    ns = await getNotes();
    check('Anschlag-Pinsel gilt für alle Töne des Akkords', ns.length === 3 && ns.every((n) => n.vel === 0.4), j(ns));
    await page.selectOption('#pat-vel', '1');

    // ----- Akkord mit Tonleiter-Sperre, Tonartwechsel -----
    await setNotes([]);
    await page.click('#pat-scale');
    await click(69, 0);
    check('Tonleiter-Sperre an + Dur über A: C♯ rastet auf C ein (A C E)', j(pitchesOf(await getNotes())) === '[69,72,76]', j(await getNotes()));
    await page.click('#pat-scale'); // Sperre aus
    await page.selectOption('#pat-chord', 'scale');
    await setNotes([]);
    await click(71, 0); // H in A-Moll
    check('Tonleiter-Akkord auf H in A-Moll: H D F', j(pitchesOf(await getNotes())) === '[71,74,77]', j(await getNotes()));
    await page.evaluate(() => window.loopwerk.store.setKey('Dm'));
    await page.waitForTimeout(150);
    await setNotes([]);
    await click(71, 0); // H gehört nicht zu D-Moll: rastet auf B♭
    check('Nach Tonartwechsel nach D-Moll: die Taste H spielt den B♭-Dreiklang (B♭ D F)', j(pitchesOf(await getNotes())) === '[70,74,77]', j(await getNotes()));
    await setNotes([]);
    await click(65, 0); // F in D-Moll
    check('D-Moll: Taste F → F A C', j(pitchesOf(await getNotes())) === '[65,69,72]', j(await getNotes()));
    await page.evaluate(() => window.loopwerk.store.setKey('Am'));
    await page.waitForTimeout(150);

    // ----- Akkord auf Computertastatur, Klaviatur und MIDI (Schritt-Eingabe) -----
    await clickR(page, '#pat-rec');
    await page.selectOption('#pat-chord', 'minor');
    await setNotes([]);
    let d1 = await undoDepth();
    await page.keyboard.press('a'); // C4
    await waitNotes(3);
    ns = await getNotes();
    check('Computertastatur (A) mit Akkord Moll: C Es G, ein Rückgängig-Schritt',
      j(pitchesOf(ns)) === '[60,63,67]' && new Set(ns.map((n) => n.start)).size === 1 && (await undoDepth()) === d1 + 1, `${j(ns)} ${d1}→${await undoDepth()}`);
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Rückgängig: der Akkord ist ganz weg', (await getNotes()).length === 0);

    await page.selectOption('#pat-chord', 'seventh');
    await setNotes([]);
    d1 = await undoDepth();
    await page.click('.pat-key[data-pitch="62"]');
    await waitNotes(4);
    ns = await getNotes();
    check('Klaviatur (Klick auf D) mit Akkord Sept: D F♯ A C, ein Rückgängig-Schritt', j(pitchesOf(ns)) === '[62,66,69,72]' && (await undoDepth()) === d1 + 1, `${j(ns)} ${d1}→${await undoDepth()}`);

    await page.selectOption('#pat-chord', 'power');
    await setNotes([]);
    d1 = await undoDepth();
    await midi(NOTE_ON(57, 100)); await midi(NOTE_OFF(57));
    await waitNotes(3);
    ns = await getNotes();
    check('MIDI (A2) mit Akkord Power: A E A, Anschlag aus der Velocity, ein Rückgängig-Schritt',
      j(pitchesOf(ns)) === '[57,64,69]' && ns.every((n) => near(n.vel, m.v100)) && (await undoDepth()) === d1 + 1, `${j(ns)} ${d1}→${await undoDepth()}`);

    await page.selectOption('#pat-chord', 'scale');
    await setNotes([]);
    await midi(NOTE_ON(62, 90)); await midi(NOTE_OFF(62));
    await waitNotes(3);
    check('MIDI mit Akkord Tonleiter (D in A-Moll): D F A', j(pitchesOf(await getNotes())) === '[62,65,69]', j(await getNotes()));
    // Drei Tasten klingen als Akkord (gedrückte Tasten leuchten)
    await page.selectOption('#pat-chord', 'major');
    await midi(NOTE_ON(60, 100));
    await page.waitForTimeout(150);
    const lit = await page.evaluate(() => [...document.querySelectorAll('.pat-key.down')].map((k) => Number(k.dataset.pitch)).sort((a, b) => a - b));
    await midi(NOTE_OFF(60));
    const lit2 = await page.evaluate(() => document.querySelectorAll('.pat-key.down').length);
    check('Gehaltener Akkord leuchtet auf der Klaviatur (C E G), nach dem Loslassen aus', j(lit) === '[60,64,67]' && lit2 === 0, `${j(lit)} / ${lit2}`);
    await clickR(page, '#pat-rec');
    await page.selectOption('#pat-chord', 'off');

    // ----- Live-Aufnahme mit MIDI-Anschlag und Akkord -----
    await setNotes([]);
    const waitBeat = (beat) => page.evaluate((b) => new Promise((res) => {
      const { engine, patternEditor } = window.loopwerk;
      const lp = patternEditor.looper;
      const target = lp.t0 + b * lp.spb + (engine.ctx.outputLatency || 0) + (engine.ctx.baseLatency || 0);
      const poll = () => (engine.ctx.currentTime >= target ? res(engine.ctx.currentTime) : setTimeout(poll, 2));
      poll();
    }), beat);
    // Wartet im Browser auf den Schlag und schickt die MIDI-Nachrichten dort sofort – ohne Rundlauf zum Testprogramm,
    // der unter Last (langsame Maschine) leicht 100 ms und mehr kostet und dann die Messung verfälscht
    const atBeat = (beat, ...msgs) => page.evaluate(([b, list]) => new Promise((res) => {
      const { engine, patternEditor } = window.loopwerk;
      const lp = patternEditor.looper;
      const target = lp.t0 + b * lp.spb + (engine.ctx.outputLatency || 0) + (engine.ctx.baseLatency || 0);
      const poll = () => { if (engine.ctx.currentTime < target) { setTimeout(poll, 2); return; } for (const m of list) window.__midiIn.onmidimessage(m); res(); };
      poll();
    }), [beat, msgs]);
    await page.click('#pat-live');
    await atBeat(1.02, NOTE_ON(64, 40));
    await atBeat(1.9, NOTE_OFF(64));
    await atBeat(2.02, NOTE_ON(66, 127));
    await atBeat(2.5, NOTE_OFF(66));
    await page.waitForTimeout(150);
    ns = await getNotes();
    check('Live: MIDI-Noten landen im Raster mit ihrem Anschlag (Velocity 40 → 0,38 …, 127 → 1)',
      ns.length === 2 && ns[0].pitch === 64 && ns[0].start === 1 && near(ns[0].vel, await page.evaluate(async () => (await import('./src/instruments.js')).midiVelocity(40))) && ns[1].pitch === 66 && ns[1].start === 2 && ns[1].vel === 1, j(ns));
    await setNotes([]);
    await page.selectOption('#pat-chord', 'major');
    const d2 = await undoDepth();
    await atBeat(3.02, NOTE_ON(60, 80));
    await atBeat(3.6, NOTE_OFF(60));
    await page.waitForTimeout(150);
    ns = await getNotes();
    const v80 = await page.evaluate(async () => (await import('./src/instruments.js')).midiVelocity(80));
    check('Live mit Akkord Dur: eine Taste trägt C E G ein (gleicher Start, Anschlag 80), ein Rückgängig-Schritt',
      j(pitchesOf(ns)) === '[60,64,67]' && new Set(ns.map((n) => n.start)).size === 1 && ns.every((n) => near(n.vel, v80)) && (await undoDepth()) === d2 + 1, `${j(ns)} ${d2}→${await undoDepth()}`);
    await page.click('#pat-live');
    await page.selectOption('#pat-chord', 'off');

    // ----- Quantisieren (Melodie) -----
    await page.evaluate(() => { const pop = document.getElementById('pat-more'); if (pop.hidden) document.getElementById('pat-more-btn').click(); });
    const qb = await page.evaluate(() => { const b = document.getElementById('pat-quantize'); const r = b.getBoundingClientRect(); return { vis: !!b.offsetParent, inMore: !!b.closest('#pat-more'), inView: r.right <= innerWidth && r.left >= 0, text: b.textContent }; });
    check('Desktop: Knopf „Quantisieren“ unter „Mehr“ neben „Einrasten“ (zwei Klicks)', qb.vis && qb.inMore && qb.inView && qb.text === 'Quantisieren', j(qb));
    await page.evaluate(() => { const pop = document.getElementById('pat-more'); if (!pop.hidden) document.getElementById('pat-more-btn').click(); });
    const orig = [[60, 0.3, 0.3, 1], [62, 1.1, 0.1, 0.6], [64, 2, 1, 1], [65, 3.37, 0.5, 1]];
    await setNotes(orig);
    const d3 = await undoDepth();
    await clickR(page, '#pat-quantize');
    ns = await getNotes();
    check('Quantisieren 1/16: Start und Länge auf das Raster (Länge mindestens 1/16), Ordnung bleibt',
      j(ns.map((n) => [n.pitch, n.start, n.len])) === j([[60, 0.25, 0.25], [62, 1, 0.25], [64, 2, 1], [65, 3.25, 0.5]]), j(ns));
    check('Ein Rückgängig-Schritt und Einblender „3 Noten gerückt“', (await undoDepth()) === d3 + 1 && /^3 Noten gerückt/.test(await flashText()), `${await undoDepth() - d3} / ${await flashText()}`);
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Rückgängig: Noten wieder wie gespielt', j((await getNotes()).map((n) => [n.pitch, n.start, n.len])) === j(orig.map((o) => o.slice(0, 3))));
    const d4 = await undoDepth();
    await setNotes([[60, 0.25, 0.25], [62, 1, 1]]);
    await clickR(page, '#pat-quantize');
    check('Alles schon im Raster: nichts ändert sich, kein Rückgängig-Schritt, Einblender sagt es', (await undoDepth()) === d4 + 1 && /schon im 1\/16-Raster/.test(await flashText()), await flashText());
    // 1/8
    await selectR(page, '#pat-quant', '2');
    await setNotes([[60, 0.3, 0.2, 1], [62, 0.9, 0.7, 1], [64, 1.5, 0.5, 1], [67, 2.1, 0.1, 0.5], [67, 2.2, 0.4, 1]]);
    await clickR(page, '#pat-quantize');
    ns = await getNotes();
    check('Quantisieren 1/8: Start 0,3 → 0,5, 0,9 → 1, Länge 0,2 → 0,5; gleiche Töne am selben Platz verschmelzen (längere, lautere)',
      j(ns.map((n) => [n.pitch, n.start, n.len, n.vel])) === j([[60, 0.5, 0.5, 1], [62, 1, 0.5, 1], [64, 1.5, 0.5, 1], [67, 2, 0.5, 1]]), j(ns));
    await selectR(page, '#pat-quant', '1');
    if (SHOTS) {
      await page.selectOption('#pat-chord', 'seventh');
      await setNotes([[69, 0, 1], [73, 0, 1], [76, 0, 1], [79, 0, 1], [62, 2, 2], [66, 2, 2], [69, 2, 2]]);
      await page.evaluate(() => { const pop = document.getElementById('pat-more'); if (!pop.hidden) document.getElementById('pat-more-btn').click(); });
      await page.evaluate(geometry, 70);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOT_DIR, 'editor-midi-melodie-desktop.png') });
    }
    await page.selectOption('#pat-chord', 'off');

    // ---------- Beat-Editor ----------
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForTimeout(500);
    await createCard(page, 'beat');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Beat-Editor');
    await page.waitForTimeout(600);
    const bid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const rows = () => page.evaluate((id) => JSON.parse(JSON.stringify(window.loopwerk.store.project.patterns[id].rows)), bid);
    const setRows = (spec) => page.evaluate(([id, s]) => window.loopwerk.store.updatePattern(id, (p) => { for (const r of Object.keys(p.rows)) p.rows[r] = p.rows[r].map(() => 0); for (const [r, steps] of Object.entries(s)) for (const [i, v] of Object.entries(steps)) p.rows[r][Number(i)] = v; }), [bid, spec]);
    const bd = await page.evaluate(() => ({ chordHidden: !document.getElementById('pat-chord-field').offsetParent, quant: !!document.getElementById('pat-quantize').closest('#pat-more'), midi: !!window.__midiIn.onmidimessage }));
    check('Beat-Editor: kein Akkord-Feld, „Quantisieren“ unter „Mehr“, MIDI angemeldet', bd.chordHidden && bd.quant && bd.midi, j(bd));

    // Pads nach General MIDI (Pads-Ansicht, Aufleuchten beobachten)
    await page.click('#pat-view .seg[data-view="pads"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__hits = [];
      const seen = new Set();
      new MutationObserver((list) => {
        for (const mu of list) { const el = mu.target; if (el.classList?.contains('hit') && !seen.has(el)) { seen.add(el); window.__hits.push(el.dataset.row); setTimeout(() => seen.delete(el), 200); } }
      }).observe(document.getElementById('pat-pads'), { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    const gm = { 36: 'kick', 35: 'kick', 38: 'snare', 40: 'snare', 39: 'clap', 42: 'hat', 44: 'hat', 46: 'open', 41: 'tomLo', 43: 'tomLo', 45: 'tomLo', 47: 'tomHi', 48: 'tomHi', 50: 'tomHi', 49: 'crash', 57: 'crash' };
    const wrong = [];
    for (const [note, row] of Object.entries(gm)) {
      await page.evaluate(() => { window.__hits = []; });
      await midi(NOTE_ON(Number(note), 100));
      await midi(NOTE_OFF(Number(note)));
      await page.waitForTimeout(230);
      const got = await page.evaluate(() => window.__hits.slice());
      if (got.length !== 1 || got[0] !== row) wrong.push(`${note}→${j(got)} statt ${row}`);
    }
    check('MIDI-Noten 35/36 Kick, 38/40 Snare, 39 Clap, 42/44 Hi-Hat zu, 46 offen, 41/43/45 Tom tief, 47/48/50 Tom hoch, 49/57 Becken leuchten ihr Pad', wrong.length === 0, wrong.join('; '));
    await page.evaluate(() => { window.__hits = []; });
    for (const bad of [60, 70, 0, 127, 34]) await midi(NOTE_ON(bad, 100));
    await midi({ data: [0x90, 36, 0] }); // Note-an mit Velocity 0 ist Note-aus
    await midi({ data: [0x99, 38, 100] }); // Kanal 10 – Kanal ist egal
    await page.waitForTimeout(250);
    const hits2 = await page.evaluate(() => window.__hits.slice());
    check('Unbekannte Noten und Note-aus werden ignoriert, der Kanal ist egal (Kanal 10 spielt Snare)', j(hits2) === '["snare"]', j(hits2));
    // Der Anschlag selbst ist im Klangtest unten gemessen; hier: Schläge spielen ohne Fehler
    await midi(NOTE_ON(36, 127));
    await page.waitForTimeout(100);
    check('MIDI-Schlag spielt ohne Fehler', app.errors.length === 0, app.errors.join(' | '));

    // Live-Aufnahme: quantisiert mit Anschlag
    await page.click('#pat-view .seg[data-view="grid"]');
    await setRows({});
    await page.click('#pat-live');
    await atBeat(1.02, NOTE_ON(38, 30)); // Snare leise auf Schlag 2 → Schritt 4
    await atBeat(2.27, NOTE_ON(36, 127)); // Kick, 0,27 Schläge nach Schlag 3 → Schritt 9 (9,1 gerundet, Spielraum für langsame Maschinen)
    await atBeat(3.02, NOTE_ON(60, 100), NOTE_ON(42, 64)); // 60 unbekannt: kein Eintrag; 42 Hi-Hat
    await page.waitForTimeout(150);
    let rw = await rows();
    const v30 = await page.evaluate(async () => (await import('./src/instruments.js')).midiVelocity(30));
    const v64 = await page.evaluate(async () => (await import('./src/instruments.js')).midiVelocity(64));
    const setSteps = (r) => rw[r].map((v, i) => (v ? [i, +v.toFixed(3)] : null)).filter(Boolean);
    check('Live: MIDI-Schläge landen quantisiert mit Anschlag (Snare Schritt 4 leise, Kick Schritt 9 voll, Hi-Hat Schritt 12)',
      j(setSteps('snare')) === j([[4, +v30.toFixed(3)]]) && j(setSteps('kick')) === '[[9,1]]' && j(setSteps('hat')) === j([[12, +v64.toFixed(3)]]) && !Object.entries(rw).some(([r, a]) => !['snare', 'kick', 'hat'].includes(r) && a.some(Boolean)), j(rw));
    const cellOp = await page.evaluate(() => { const c = document.querySelector('.pat-cell[data-row="snare"][data-step="4"]'); return { vel: Number(c.style.getPropertyValue('--vel')), pressed: c.getAttribute('aria-pressed') }; });
    check('Der leise Schlag leuchtet im Raster schwächer', cellOp.pressed === 'true' && cellOp.vel < 0.5, j(cellOp));
    await page.click('#pat-live');
    // Quantisierung der Live-Eingabe nach 1/8 – und Pad-Klick nutzt den Pinsel
    await page.selectOption('#pat-vel', '0.4');
    await page.click('#pat-view .seg[data-view="pads"]');
    await setRows({});
    await page.click('#pat-live');
    await waitBeat(1.02);
    await page.click('.pat-pad[data-row="clap"]');
    await page.waitForTimeout(150);
    rw = await rows();
    check('Live: Pad-Antippen schreibt den Anschlag-Pinsel (Leise = 0,4)', rw.clap.filter(Boolean).length === 1 && rw.clap.find(Boolean) === 0.4, j(rw.clap));
    await page.click('#pat-live');
    await page.selectOption('#pat-vel', '1');
    await page.click('#pat-view .seg[data-view="grid"]');

    // ----- Quantisieren (Beat) -----
    await page.waitForTimeout(200);
    await setRows({ kick: { 1: 0.4, 2: 1, 3: 1, 15: 0.7, 8: 1 }, snare: { 1: 1, 2: 0.4 }, hat: { 5: 0.5, 7: 1 } });
    const d5 = await undoDepth();
    await clickR(page, '#pat-quantize');
    check('Beat 1/16: alles liegt schon im Raster – nichts passiert', (await undoDepth()) === d5 && /schon im 1\/16-Raster/.test(await flashText()), await flashText());
    await selectR(page, '#pat-quant', '2');
    await clickR(page, '#pat-quantize');
    rw = await rows();
    const at = (r) => rw[r].map((v, i) => (v ? [i, v] : null)).filter(Boolean);
    check('Beat 1/8: ungerade Sechzehntel wandern zur nächsten Achtel (1→2, 3→4, 15→0 im Loop, 5→6, 7→8); beim Zusammenstoß gewinnt der lautere Anschlag',
      j(at('kick')) === j([[0, 0.7], [2, 1], [4, 1], [8, 1]]) && j(at('snare')) === j([[2, 1]]) && j(at('hat')) === j([[6, 0.5], [8, 1]]), j([at('kick'), at('snare'), at('hat')]));
    check('Ein Rückgängig-Schritt, Einblender „n Schläge gerückt“', (await undoDepth()) === d5 + 1 && /^6 Schläge gerückt/.test(await flashText()), `${await undoDepth() - d5} / ${await flashText()}`);
    await page.evaluate(() => window.loopwerk.store.undo());
    rw = await rows();
    check('Rückgängig: Schläge wieder auf den ungeraden Plätzen', rw.kick[1] === 0.4 && rw.kick[15] === 0.7 && rw.snare[1] === 1, j(at('kick')));
    await selectR(page, '#pat-quant', '1');
    if (SHOTS) {
      await page.evaluate(() => { const pop = document.getElementById('pat-more'); if (!pop.hidden) document.getElementById('pat-more-btn').click(); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOT_DIR, 'editor-midi-beat-desktop.png') });
    }
    check('Desktop: Kopfzeile des Beat-Editors läuft nicht über', await page.evaluate(() => { const a = document.querySelector('#pattern .dock-actions'); return a.scrollWidth <= a.clientWidth; }));

    // ---------- Klangtest: leise Töne sind leiser ----------
    const snd = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const peak = (buf) => { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) p = Math.max(p, Math.abs(v)); return p; };
      const prev = async (preset, vel) => {
        const ctx = new OfflineAudioContext(2, 22050, 44100);
        I.previewNote(ctx, ctx.destination, preset, 60, vel);
        return peak(await ctx.startRendering());
      };
      const drum = async (kit, row, vel) => {
        const ctx = new OfflineAudioContext(2, 22050, 44100);
        I.previewDrum(ctx, ctx.destination, kit, row, null, 0.01, vel);
        return peak(await ctx.startRendering());
      };
      const out = {};
      for (const preset of ['pluck', 'lead', 'pad', 'piano', 'bass']) out[preset] = (await prev(preset, 0.3)) / (await prev(preset, 1));
      out.snare = (await drum('elektro', 'snare', 0.3)) / (await drum('elektro', 'snare', 1));
      out.kick909 = (await drum('techno', 'kick', 0.3)) / (await drum('techno', 'kick', 1));
      const mel = (vel, preset) => ({ type: 'synth', preset, bars: 1, notes: [{ pitch: 60, start: 0, len: 2, vel }] });
      for (const preset of ['lead', 'pad']) out['render-' + preset] = peak((await I.renderPattern(mel(0.3, preset), 120)).buffer) / peak((await I.renderPattern(mel(1, preset), 120)).buffer);
      return out;
    });
    for (const [k, v] of Object.entries(snd)) check(`Klang: Anschlag 0,3 ist leiser als 1 (${k})`, v > 0.1 && v < 0.6, `Verhältnis ${v.toFixed(2)}`);

    check('Desktop: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Desktop-Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();

  // ================= Handy =================
  const ph = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2, init: MIDI_STUB });
  try {
    const pp = ph.page;
    await pp.tap('#tab-sounds');
    await pp.tap('#new-melody-btn');
    await pp.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-roll-wrap').hidden);
    await pp.waitForTimeout(800);
    const pid = await pp.evaluate(() => window.loopwerk.patternEditor.id);
    const getNotes = () => pp.evaluate((id) => window.loopwerk.store.project.patterns[id].notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len })), pid);
    const j = JSON.stringify;
    const closed = await pp.evaluate(() => ({
      head: (() => { const a = document.querySelector('#pattern .dock-actions'); return a.scrollWidth <= a.clientWidth; })(),
      chordInHead: !!document.getElementById('pat-chord-field').closest('#pat-more'),
      qInMore: !!document.getElementById('pat-quantize').closest('#pat-more'),
      over: document.documentElement.scrollWidth - innerWidth,
    }));
    check('Handy: Kopfzeile läuft nicht über, Akkord und Quantisieren liegen unter „Mehr“, kein Querscroll', closed.head && closed.chordInHead && closed.qInMore && closed.over <= 0, j(closed));
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(250);
    const more = await pp.evaluate(() => {
      const size = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vis: !!e.offsetParent }; };
      return { chord: size('pat-chord'), quant: size('pat-quantize'), over: document.documentElement.scrollWidth - innerWidth };
    });
    check('Handy: „Akkord“ und „Quantisieren“ unter „Mehr“ sichtbar, Tippflächen mindestens 44 px', more.chord.vis && more.quant.vis && more.chord.h >= 44 && more.quant.h >= 44 && more.chord.w >= 44 && more.quant.w >= 44 && more.over <= 0, j(more));
    if (SHOTS) await pp.screenshot({ path: path.join(SHOT_DIR, 'editor-midi-phone-more.png') });
    await pp.selectOption('#pat-chord', 'major');
    await pp.waitForTimeout(100);
    await pp.tap('#pat-more-btn'); // Menü zu
    await pp.waitForTimeout(250);
    const wrap = await pp.evaluate(() => { const r = document.getElementById('pat-roll-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    await pp.touchscreen.tap(wrap.x + 140, wrap.y + wrap.h / 2);
    await pp.waitForTimeout(250);
    let ns = await getNotes();
    const pts = ns.map((n) => n.pitch).sort((a, b) => a - b);
    check('Handy: Antippen der Piano-Roll mit Akkord Dur setzt drei Noten (Grundton, +4, +7)', pts.length === 3 && pts[1] - pts[0] === 4 && pts[2] - pts[0] === 7 && new Set(ns.map((n) => n.start)).size === 1, j(ns));
    if (SHOTS) await pp.screenshot({ path: path.join(SHOT_DIR, 'editor-midi-phone.png') });
    // Quantisieren am Handy
    await pp.evaluate(([id]) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = [{ pitch: 60, start: 0.3, len: 0.3, vel: 1 }]; }), [pid]);
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(250);
    await pp.tap('#pat-quantize');
    await pp.waitForTimeout(150);
    ns = await getNotes();
    check('Handy: „Quantisieren“ unter „Mehr“ rückt die Note (0,3 → 0,25)', ns.length === 1 && ns[0].start === 0.25 && ns[0].len === 0.25 && /gerückt/.test(await pp.evaluate(() => window.loopwerk.ui.flashText)), j(ns));
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(250);

    // Beat-Editor am Handy
    await pp.evaluate(() => window.loopwerk.ui.setDock(null));
    await pp.waitForTimeout(600);
    await pp.tap('#tab-sounds');
    await pp.tap('#new-beat-btn');
    await pp.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && document.getElementById('pat-title').textContent === 'Beat-Editor');
    await pp.waitForTimeout(800);
    const beat = await pp.evaluate(() => ({
      head: (() => { const a = document.querySelector('#pattern .dock-actions'); return a.scrollWidth <= a.clientWidth; })(),
      chordHidden: !document.getElementById('pat-chord-field').offsetParent,
      qInMore: !!document.getElementById('pat-quantize').closest('#pat-more'),
      over: document.documentElement.scrollWidth - innerWidth,
    }));
    check('Handy Beat-Editor: Kopfzeile ohne Überlauf, kein Akkord-Feld, Quantisieren unter „Mehr“, kein Querscroll', beat.head && beat.chordHidden && beat.qInMore && beat.over <= 0, j(beat));
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(250);
    const bq = await pp.evaluate(() => { const r = document.getElementById('pat-quantize').getBoundingClientRect(); return { h: Math.round(r.height), vis: !!document.getElementById('pat-quantize').offsetParent }; });
    check('Handy Beat-Editor: „Quantisieren“ ist sichtbar und mindestens 44 px hoch', bq.vis && bq.h >= 44, j(bq));
    // Das Menü endet über der Fachleiste (nichts verschwindet dahinter) und scrollt; Quantisieren ist erreichbar
    const fit = await pp.evaluate(() => { const m = document.getElementById('pat-more').getBoundingClientRect(); return { bottom: Math.round(m.bottom), bar: Math.round(document.getElementById('tabbar').getBoundingClientRect().top) }; });
    check('Handy Beat-Editor: das Menü „Mehr“ endet über der Fachleiste', fit.bottom <= fit.bar, j(fit));
    const rowsBefore = await pp.evaluate((id) => window.loopwerk.store.project.patterns[id].rows.kick.map((v) => v), await pp.evaluate(() => window.loopwerk.patternEditor.id));
    await pp.evaluate(() => { const id = window.loopwerk.patternEditor.id; window.loopwerk.store.updatePattern(id, (p) => { p.rows.kick = p.rows.kick.map(() => 0); p.rows.kick[1] = 1; }); });
    await pp.evaluate(() => { document.getElementById('pat-more').scrollTop = 0; });
    await pp.locator('#pat-quantize').scrollIntoViewIfNeeded();
    if (SHOTS) await pp.screenshot({ path: path.join(SHOT_DIR, 'editor-midi-phone-beat.png') });
    await pp.tap('#pat-quantize');
    await pp.waitForTimeout(150);
    check('Handy Beat-Editor: „Quantisieren“ antippen (Menü nach unten gescrollt) setzt die Achtel-Schiebung nur bei 1/8 – bei 1/16 bleibt alles',
      (await pp.evaluate(() => window.loopwerk.patternEditor && window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].rows.kick[1])) === 1 && /schon im 1\/16-Raster/.test(await pp.evaluate(() => window.loopwerk.ui.flashText)), String(rowsBefore.length));
    check('Handy: keine Fehler in der Konsole', ph.errors.length === 0, ph.errors.join(' | '));
  } catch (e) {
    check('Handy-Ablauf ohne Ausnahme', false, e.stack);
  }
  await ph.close();
  finish();
})();
