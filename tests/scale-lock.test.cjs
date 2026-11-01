// Tonleiter-Sperre im Melodie-Editor: Modell, Einrasten (Setzen, Verschieben, Ziehen, Klaviatur, Computertastatur, MIDI,
// Live, Einsingen, Weiterführen), Anzeige, „Auf Tonleiter ziehen“, Rückgängig, Speichern/Laden – Desktop, Tablet, Handy.
// node tests/scale-lock.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, createChecker, createCard, clickR, makeWav } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Läuft im Browser: Raster der Piano-Roll (nach dem Scrollen auf `pitch`) – Mitte der Zeile und der Spalte
function geometry(pitch) {
  const wrap = document.getElementById('pat-roll-wrap');
  const canvas = document.getElementById('pat-roll');
  const narrow = matchMedia('(max-width: 760px)').matches;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const keyW = narrow ? 72 : 30;
  if (!narrow) {
    const row = touch ? 22 : 14;
    wrap.scrollTop = Math.max(0, (84 - pitch) * row - wrap.clientHeight / 2);
  }
  const r = canvas.getBoundingClientRect();
  const { store, patternEditor } = window.loopwerk;
  const p = store.project.patterns[patternEditor.id];
  const cellW = (r.width - keyW) / (p.bars * 16);
  let row;
  let yOf;
  if (narrow) {
    const keys = [...document.querySelectorAll('#pat-vkeys .vkey')];
    const k0 = keys[0].getBoundingClientRect();
    row = k0.height;
    yOf = (m) => { const k = document.querySelector(`#pat-vkeys .vkey[data-pitch="${m}"]`); const b = k.getBoundingClientRect(); return b.top + b.height / 2; };
  } else {
    row = touch ? 22 : 14;
    yOf = (m) => r.top + (84 - m) * row + row / 2;
  }
  const ys = {};
  for (let m = 40; m <= 80; m++) { try { ys[m] = yOf(m); } catch { /* außerhalb des Bereichs */ } }
  return { x0: r.left + keyW, cellW, row, ys, keyW };
}

(async () => {
  const MIDI_STUB = () => {
    window.__midi = { name: 'Test-Keyboard', onmidimessage: null };
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([['a', window.__midi]]), onstatechange: null });
  };

  // ================= Desktop =================
  const app = await openApp({ viewport: { width: 1400, height: 1000 } });
  const { page } = app;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-scale-'));
  try {
    // ---------- Modell ----------
    const m = await page.evaluate(async () => {
      const S = await import('./src/scale.js');
      const M = await import('./src/model.js');
      const proj = (key) => ({ key, patterns: {} });
      const pat = (extra = {}) => ({ type: 'synth', notes: [], ...extra });
      const am = S.patternScale(proj('Am'), pat({ scaleLock: true }));
      const names = (sc) => [...Array(12).keys()].filter((pc) => sc.has(60 + pc)).map((pc) => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'][pc]).join(' ');
      const dm = S.patternScale(proj('Dm'), pat({ scaleLock: true }));
      const maj = S.patternScale(proj('Am'), pat({ scaleLock: true, scaleKind: 'major' }));
      const pent = S.patternScale(proj('Am'), pat({ scaleLock: true, scaleKind: 'pent' }));
      const off = S.patternScale(proj('Am'), pat());
      const drums = S.patternScale(proj('Am'), { type: 'drums', scaleLock: true });
      const bad = S.patternScale(proj('Am'), pat({ scaleLock: true, scaleKind: 'quatsch' }));
      return {
        am: names(am), amRoot: am.root, amLabel: am.label, dm: names(dm), dmRoot: dm.root,
        majRoot: maj.root, majLabel: maj.label, majSame: names(maj) === names(am), pent: names(pent), pentLabel: pent.label,
        snapDown: am.snap(61), snapUp: am.snap(61, 1), snapIn: am.snap(62), lockOff: off.lock(61), offOn: off.on, drumsOn: drums.on,
        badKind: bad.kind, low: am.snap(36), high: am.snap(84), highFix: S.patternScale(proj('Cm'), pat({ scaleLock: true })).snap(84, 1),
        foreign: am.foreign([{ pitch: 60 }, { pitch: 61 }, { pitch: 66 }]), foreignOff: off.foreign([{ pitch: 61 }]),
        cm: S.patternScale(proj('Cm'), pat({ scaleLock: true })).root, hm: S.patternScale(proj('Hm'), pat({ scaleLock: true })).root,
        keys: M.KEYS.length,
      };
    });
    check('Tonleiter A-Moll: A H C D E F G, Grundton A', m.am === 'C D E F G A H' && m.amRoot === 9 && m.amLabel === 'A-Moll', `${m.am} / ${m.amRoot} / ${m.amLabel}`);
    check('Tonleiter folgt der Songtonart (D-Moll: Grundton D, Grundtöne C-Moll 0, H-Moll 11)', m.dmRoot === 2 && m.dm === 'C D E F G A B♭' && m.cm === 0 && m.hm === 11, `${m.dm} / ${m.dmRoot}`);
    check('Dur (Parallele): gleiche Töne, Grundton C, „C-Dur“', m.majRoot === 0 && m.majSame && m.majLabel === 'C-Dur', `${m.majRoot} ${m.majLabel}`);
    check('Pentatonik: fünf Töne (A C D E G), „A-Pentatonik“', m.pent === 'C D E G A' && m.pentLabel === 'A-Pentatonik', `${m.pent} / ${m.pentLabel}`);
    check('Einrasten: Fremdton → nächster Ton (bei Gleichstand unten, mit Zugrichtung oben), Tonleiterton bleibt', m.snapDown === 60 && m.snapUp === 62 && m.snapIn === 62, `${m.snapDown} ${m.snapUp} ${m.snapIn}`);
    check('Sperre aus oder Beat-Pattern: nichts rastet ein', m.lockOff === 61 && !m.offOn && !m.drumsOn);
    check('Unbekannte Art = Moll; Rand der Piano-Roll bleibt im Bereich', m.badKind === 'minor' && m.low === 36 && m.high >= 36 && m.high <= 84 && m.highFix <= 84, `${m.low} ${m.high} ${m.highFix}`);
    check('Fremdtöne zählen nur bei aktiver Sperre', m.foreign === 2 && m.foreignOff === 0);

    // ---------- Melodie-Editor öffnen ----------
    await page.evaluate(MIDI_STUB);
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await page.waitForTimeout(500);
    const pid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const getNotes = () => page.evaluate((id) => window.loopwerk.store.project.patterns[id].notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len })), pid);
    const setNotes = (list) => page.evaluate(([id, l]) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = l.map(([pitch, start, len = 1]) => ({ pitch, start, len, vel: 1 })); }), [pid, list]);
    const pats = () => page.evaluate((id) => { const p = window.loopwerk.store.project.patterns[id]; return { lock: p.scaleLock, kind: p.scaleKind }; }, pid);
    const pitches = async () => (await getNotes()).map((n) => n.pitch);
    const geo = (pitch) => page.evaluate(geometry, pitch);
    const undoDepth = () => page.evaluate(() => window.loopwerk.store.undoStack.length);

    const start = await page.evaluate(() => ({
      btn: !!document.getElementById('pat-scale').offsetParent, pressed: document.getElementById('pat-scale').getAttribute('aria-pressed'),
      kind: !!document.getElementById('pat-scale-kind-field').offsetParent, fix: !!document.getElementById('pat-scale-fix').offsetParent,
      lock: window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].scaleLock,
    }));
    check('Neues Melodie-Pattern: Schalter „Tonleiter“ sichtbar, aus (alle 12 Töne)', start.btn && start.pressed === 'false' && start.lock === undefined && !start.kind && !start.fix, JSON.stringify(start));

    // ---------- Aus: wie bisher ----------
    let g = await geo(61);
    await page.mouse.click(g.x0 + g.cellW * 0 + 3, g.ys[61]);
    check('Aus: Klick auf eine Zeile setzt genau diesen Ton (C♯)', JSON.stringify(await pitches()) === '[61]', JSON.stringify(await getNotes()));
    await setNotes([]);

    // ---------- Einschalten: ein Klick, Auswahl erscheint ----------
    await page.click('#pat-scale');
    const on = await page.evaluate(() => ({
      pressed: document.getElementById('pat-scale').getAttribute('aria-pressed'),
      opts: [...document.querySelectorAll('#pat-scale-kind option')].map((o) => o.textContent).join(','), kind: !!document.getElementById('pat-scale-kind-field').offsetParent,
      val: document.getElementById('pat-scale-kind').value,
    }));
    check('Ein Klick schaltet die Sperre an (Standard Moll der Songtonart), Auswahl zeigt A-Moll, C-Dur, A-Pentatonik',
      (await pats()).lock === true && on.pressed === 'true' && on.kind && on.val === 'minor' && on.opts === 'A-Moll,C-Dur,A-Pentatonik', JSON.stringify(on));
    check('Natürliches Moll ist Voreinstellung: kein scaleKind im Pattern', (await pats()).kind === undefined);

    // ---------- Setzen ----------
    g = await geo(64);
    await page.mouse.click(g.x0 + g.cellW * 0 + 3, g.ys[61]);
    await page.mouse.click(g.x0 + g.cellW * 8 + 3, g.ys[66]);
    await page.mouse.click(g.x0 + g.cellW * 16 + 3, g.ys[64]);
    await page.mouse.click(g.x0 + g.cellW * 24 + 3, g.ys[70]);
    check('Setzen: Cis → C, Fis → F, E bleibt E, Ais → A', JSON.stringify(await pitches()) === '[60,65,64,69]', JSON.stringify(await pitches()));

    // ---------- Verschieben ----------
    await setNotes([[62, 4]]);
    g = await geo(62);
    const dragNote = async (fromBeat, fromPitch, dxCells, dRows) => {
      const x = g.x0 + g.cellW * (fromBeat * 4) + 4;
      const y = g.ys[fromPitch];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (dxCells * g.cellW) / 2, y - (dRows * g.row) / 2, { steps: 4 });
      await page.mouse.move(x + dxCells * g.cellW, y - dRows * g.row, { steps: 4 });
      await page.mouse.up();
    };
    await dragNote(4, 62, 0, 1);
    let ns = await getNotes();
    check('Verschieben nach oben auf einen Fremdton (D → D♯): rastet auf E ein', ns.length === 1 && ns[0].pitch === 64 && ns[0].start === 4, JSON.stringify(ns));
    g = await geo(64);
    await dragNote(4, 64, 0, -1);
    ns = await getNotes();
    check('Verschieben nach unten auf einen Fremdton (E → D♯): rastet auf D ein', ns.length === 1 && ns[0].pitch === 62 && ns[0].start === 4, JSON.stringify(ns));
    await dragNote(4, 62, 3, 4);
    ns = await getNotes();
    check('Verschieben um vier Zeilen (auf F♯) und drei Spalten: rastet nach oben auf G ein, zur neuen Zeit', ns.length === 1 && ns[0].pitch === 67 && Math.abs(ns[0].start - 4.75) < 1e-6, JSON.stringify(ns));
    g = await geo(67);
    await dragNote(4.75, 67, 4, 0);
    ns = await getNotes();
    check('Nur zeitlich verschieben: Tonhöhe bleibt', ns.length === 1 && ns[0].pitch === 67 && Math.abs(ns[0].start - 5.75) < 1e-6, JSON.stringify(ns));
    // ---------- Ziehen (Note aufziehen) ----------
    await setNotes([]);
    g = await geo(67);
    {
      const x = g.x0 + g.cellW * 20 + 3;
      await page.mouse.move(x, g.ys[68]);
      await page.mouse.down();
      await page.mouse.move(x + g.cellW * 8, g.ys[68], { steps: 8 });
      await page.mouse.up();
    }
    ns = await getNotes();
    check('Ziehen auf freier Fläche (Gis): Note wird länger und liegt auf G', ns.length === 1 && ns[0].pitch === 67 && ns[0].len > 1, JSON.stringify(ns));

    // ---------- Bildschirm-Klaviatur, Computertastatur, MIDI ----------
    await setNotes([]);
    await clickR(page, '#pat-rec');
    await page.click('.pat-key[data-pitch="61"]');
    await page.waitForFunction((id) => window.loopwerk.store.project.patterns[id].notes.length >= 1, pid);
    await page.keyboard.press('w'); // Computertastatur: Halbton 1 über C4 = C♯4
    await page.keyboard.press('s'); // D4
    await page.evaluate(() => { const m = window.__midi; m.onmidimessage({ data: [0x90, 66, 100] }); m.onmidimessage({ data: [0x80, 66, 0] }); });
    await page.waitForFunction((id) => window.loopwerk.store.project.patterns[id].notes.length >= 4, pid, { timeout: 5000 });
    ns = await getNotes();
    check('Klaviatur (Klick auf C♯), Taste W, MIDI-Keyboard (F♯): Fremdton → C, C, D bleibt, F♯ → F',
      JSON.stringify(ns.map((n) => n.pitch)) === '[60,60,62,65]', JSON.stringify(ns));
    const down = await page.evaluate(async () => {
      const k = document.querySelector('.pat-key[data-pitch="61"]');
      const r = k.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom - 8 };
    });
    await page.mouse.move(down.x, down.y);
    await page.mouse.down();
    const lit = await page.evaluate(() => ({ c: document.querySelector('.pat-key[data-pitch="60"]').classList.contains('down'), cs: document.querySelector('.pat-key[data-pitch="61"]').classList.contains('down') }));
    await page.mouse.up();
    check('Gedrückter Fremdton leuchtet auf der Taste, die wirklich klingt (C)', lit.c && !lit.cs, JSON.stringify(lit));
    await clickR(page, '#pat-rec'); // Schritt-Eingabe aus

    // ---------- Live-Einspielen ----------
    await setNotes([]);
    const waitBeat = (beat) => page.evaluate((b) => new Promise((res) => {
      const { engine, patternEditor } = window.loopwerk;
      const lp = patternEditor.looper;
      const target = lp.t0 + b * lp.spb + (engine.ctx.outputLatency || 0) + (engine.ctx.baseLatency || 0);
      const poll = () => (engine.ctx.currentTime >= target ? res(engine.ctx.currentTime) : setTimeout(poll, 2));
      poll();
    }), beat);
    const tapKey = (key) => page.evaluate((k) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); }, key);
    await page.click('#pat-live');
    await waitBeat(1.02);
    await tapKey('w');
    await waitBeat(2.02);
    await tapKey('d'); // E bleibt
    await page.waitForTimeout(200);
    await page.click('#pat-live');
    ns = await getNotes();
    check('Live-Einspielen: Fremdton (W = C♯) wird als C ins Raster geschrieben, E bleibt E',
      ns.length === 2 && ns[0].pitch === 60 && ns[0].start === 1 && ns[1].pitch === 64 && ns[1].start === 2, JSON.stringify(ns));

    // ---------- Anzeige ----------
    await setNotes([[61, 0, 2], [62, 4, 2]]);
    g = await geo(66);
    const px = (pitch, cell) => page.evaluate(([y, x]) => {
      const c = document.getElementById('pat-roll');
      const r = c.getBoundingClientRect();
      const d = c.getContext('2d').getImageData(Math.round(x - r.left), Math.round(y - r.top), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [g.ys[pitch], g.x0 + g.cellW * cell + 2]);
    const lum = (c) => c[0] + c[1] + c[2];
    const rowTone = await px(63, 30);
    const rowScale = await px(62, 30);
    const rowRoot = await px(69, 30);
    check('Anzeige: Zeilen der Tonleiter heller als Fremdtöne, der Grundton am hellsten',
      lum(rowScale) > lum(rowTone) + 30 && lum(rowRoot) > lum(rowScale) + 30, `Fremd ${rowTone} / Ton ${rowScale} / Grundton ${rowRoot}`);
    const solid = await px(62, 18);
    const dashed = await px(61, 5);
    check('Anzeige: vorhandener Fremdton bleibt, ist aber nur blass und gestrichelt (Ton der Tonleiter voll gefüllt)',
      (await pitches()).includes(61) && solid[0] > 200 && dashed[0] < 150, `voll ${solid} / Fremdton ${dashed}`);
    const keys = await page.evaluate(() => {
      const k = (m) => document.querySelector(`.pat-key[data-pitch="${m}"]`);
      return { off61: k(61).classList.contains('off'), off60: k(60).classList.contains('off'), off66: k(66).classList.contains('off'), root69: k(69).classList.contains('root'), root60: k(60).classList.contains('root') };
    });
    check('Klaviatur: Fremdtöne gedämpft (C♯, F♯), Tonleiterton nicht, Grundton A markiert',
      keys.off61 && keys.off66 && !keys.off60 && keys.root69 && !keys.root60, JSON.stringify(keys));
    const fixInfo = await page.evaluate(() => { const b = document.getElementById('pat-scale-fix'); return { vis: !!b.offsetParent, text: b.textContent }; });
    check('Fremdtöne vorhanden: Knopf „Auf Tonleiter ziehen (1)“ erscheint', fixInfo.vis && fixInfo.text === 'Auf Tonleiter ziehen (1)', JSON.stringify(fixInfo));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'scale-desktop.png') });

    // ---------- Auf Tonleiter ziehen, ein Rückgängig-Schritt ----------
    await setNotes([[61, 0], [63, 1], [62, 2], [66, 3], [66, 3.5]]);
    const before = await undoDepth();
    await page.click('#pat-scale-fix');
    ns = await getNotes();
    check('„Auf Tonleiter ziehen“: Fremdtöne auf den nächsten Ton (C♯→C, D♯→D, F♯→F), Gleiche verschmelzen nicht',
      JSON.stringify(ns.map((n) => [n.pitch, n.start])) === JSON.stringify([[60, 0], [62, 1], [62, 2], [65, 3], [65, 3.5]]), JSON.stringify(ns));
    check('Ein Rückgängig-Schritt', (await undoDepth()) === before + 1);
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Rückgängig: Fremdtöne wieder da', JSON.stringify(await pitches()) === '[61,63,62,66,66]', JSON.stringify(await pitches()));
    check('Nach dem Ziehen verschwindet der Knopf', await (async () => { await page.click('#pat-scale-fix'); return !(await page.evaluate(() => !!document.getElementById('pat-scale-fix').offsetParent)); })());
    await page.evaluate(() => window.loopwerk.store.undo());

    // ---------- Rückgängig der Einstellung ----------
    await page.click('#pat-scale');
    check('Zweiter Klick schaltet aus (Feld entfernt)', (await pats()).lock === undefined && await page.evaluate(() => document.getElementById('pat-scale').getAttribute('aria-pressed')) === 'false');
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Rückgängig: Sperre wieder an, Knopf folgt', (await pats()).lock === true && await page.evaluate(() => document.getElementById('pat-scale').getAttribute('aria-pressed')) === 'true');
    const offKeys = await (async () => { await page.click('#pat-scale'); return page.evaluate(() => document.querySelectorAll('.pat-key.off, .pat-key.root').length); })();
    check('Aus: Klaviatur zeigt keine Dämpfung', offKeys === 0);
    await page.click('#pat-scale');

    // ---------- Pentatonik / Dur ----------
    await setNotes([]);
    await page.selectOption('#pat-scale-kind', 'pent');
    check('Pentatonik wählbar, gespeichert als scaleKind', (await pats()).kind === 'pent');
    g = await geo(65);
    await page.mouse.click(g.x0 + 3, g.ys[65]);
    check('Pentatonik: F (in Moll erlaubt) rastet auf E ein', JSON.stringify(await pitches()) === '[64]', JSON.stringify(await pitches()));
    await page.selectOption('#pat-scale-kind', 'major');
    const maj = await page.evaluate(() => ({ root60: document.querySelector('.pat-key[data-pitch="60"]').classList.contains('root'), root69: document.querySelector('.pat-key[data-pitch="69"]').classList.contains('root') }));
    check('Dur (Parallele): Grundton C statt A markiert', maj.root60 && !maj.root69, JSON.stringify(maj));
    await page.selectOption('#pat-scale-kind', 'minor');
    check('Zurück auf Moll: scaleKind entfernt', (await pats()).kind === undefined);

    // ---------- Einsingen ----------
    await setNotes([]);
    await page.click('#pat-scale'); // aus
    await page.click('#pat-sing-btn');
    const wav = path.join(tmp, 'cis.wav');
    fs.writeFileSync(wav, makeWav(1.5, 554.37)); // C♯5
    await page.setInputFiles('#sing-input', wav);
    await page.waitForFunction(() => /Töne erkannt|Keine klaren/.test(document.getElementById('sing-status').textContent), null, { timeout: 25000 });
    const freeSing = await pitches();
    await setNotes([]);
    await page.evaluate(() => { document.getElementById('sing-status').textContent = ''; });
    await page.click('#pat-scale'); // an
    await page.setInputFiles('#sing-input', wav);
    await page.waitForFunction(() => /Töne erkannt|Keine klaren/.test(document.getElementById('sing-status').textContent), null, { timeout: 25000 });
    const lockSing = await pitches();
    check('Einsingen: ohne Sperre bleibt C♯ (554 Hz), mit Sperre rastet es auf C ein (Oktave wählt das Einsingen)', freeSing.length > 0 && freeSing.every((p) => p % 12 === 1) && lockSing.length > 0 && lockSing.every((p) => p % 12 === 0), `${freeSing} / ${lockSing}`);
    await page.click('#pat-sing-btn');

    // ---------- Weiterführen ----------
    await setNotes([[57, 0], [60, 1], [64, 2], [67, 3], [69, 4], [67, 5], [64, 6], [60, 7]]);
    await page.click('#pat-continue');
    await page.waitForFunction((id) => window.loopwerk.store.project.patterns[id].notes.length > 8 && document.getElementById('pat-continue').getAttribute('aria-busy') !== 'true', pid, { timeout: 20000 });
    const cont = await page.evaluate(async (id) => {
      const S = await import('./src/scale.js');
      const { store } = window.loopwerk;
      const p = store.project.patterns[id];
      const sc = S.patternScale(store.project, p);
      return { n: p.notes.length, foreign: sc.foreign(p.notes) };
    }, pid);
    check('Weiterführen: neue Töne liegen alle auf der Tonleiter', cont.n > 8 && cont.foreign === 0, JSON.stringify(cont));

    // ---------- Speichern und Laden ----------
    await page.selectOption('#pat-scale-kind', 'pent');
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(tmp, 'projekt.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('Speichern: scaleLock und scaleKind stehen am Pattern in der Datei', json.patterns[pid].scaleLock === true && json.patterns[pid].scaleKind === 'pent', JSON.stringify([json.patterns[pid].scaleLock, json.patterns[pid].scaleKind]));
    json.name = 'Mit Sperre';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createEmptyProject()); });
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Mit Sperre', null, { timeout: 8000 });
    await page.evaluate((id) => window.loopwerk.patternEditor.open(id), pid);
    await page.waitForTimeout(300);
    const loaded = await page.evaluate((id) => ({ ...(({ scaleLock, scaleKind }) => ({ scaleLock, scaleKind }))(window.loopwerk.store.project.patterns[id]), pressed: document.getElementById('pat-scale').getAttribute('aria-pressed'), sel: document.getElementById('pat-scale-kind').value }), pid);
    check('Öffnen: Sperre und Tonleiter-Art sind wieder da', loaded.scaleLock === true && loaded.scaleKind === 'pent' && loaded.pressed === 'true' && loaded.sel === 'pent', JSON.stringify(loaded));
    delete json.patterns[pid].scaleLock;
    delete json.patterns[pid].scaleKind;
    json.name = 'Alt';
    fs.writeFileSync(saved, JSON.stringify(json));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Alt', null, { timeout: 8000 });
    await page.evaluate((id) => window.loopwerk.patternEditor.open(id), pid);
    await page.waitForTimeout(300);
    const old = await page.evaluate(() => ({ pressed: document.getElementById('pat-scale').getAttribute('aria-pressed'), off: document.querySelectorAll('.pat-key.off').length, fix: !!document.getElementById('pat-scale-fix').offsetParent }));
    check('Altes Projekt ohne das Feld: Sperre aus, alle Töne frei', old.pressed === 'false' && old.off === 0 && !old.fix, JSON.stringify(old));

    // ---------- Klang unverändert: kein Neu-Rendern beim Umschalten ----------
    const rev0 = await page.evaluate((id) => window.loopwerk.library.get('pat-' + id)?.rev, pid);
    await page.click('#pat-scale');
    await page.waitForTimeout(400);
    const rev1 = await page.evaluate((id) => window.loopwerk.library.get('pat-' + id)?.rev, pid);
    check('Umschalten rendert den Pattern-Sound nicht neu', rev0 === rev1, `${rev0} → ${rev1}`);

    check('Desktop: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Desktop-Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
  }

  // ================= Tablet (Finger, Desktop-Layout) =================
  const tab = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const tp = tab.page;
    await tp.tap('#ltab-create');
    await tp.tap('.ccard[data-create="melody"]');
    await tp.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-roll-wrap').hidden);
    await tp.waitForTimeout(600);
    const pid = await tp.evaluate(() => window.loopwerk.patternEditor.id);
    const getNotes = () => tp.evaluate((id) => window.loopwerk.store.project.patterns[id].notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len })), pid);
    const where = await tp.evaluate(() => ({ inBar: !!document.getElementById('pat-scale').closest('#pat-scale-bar'), inHead: !!document.getElementById('pat-scale').closest('.dock-actions') }));
    check('Tablet: Schalter steht in der Kopfzeile (Desktop-Layout)', where.inHead && !where.inBar, JSON.stringify(where));
    await tp.tap('#pat-scale');
    await tp.waitForTimeout(500);
    // Die obere Zeile liegt unter dem Griff der Schublade (wie „Weiterführen“ und „Klang“), darum Größe statt Treffermessung
    const tg = await tp.evaluate(() => ['pat-scale', 'pat-scale-kind'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height }; }));
    check('Tablet: Tippflächen von Schalter und Auswahl ≥ 44 px', tg.length === 2 && tg.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(tg));
    let g = await tp.evaluate(geometry, 64);
    await tp.touchscreen.tap(g.x0 + g.cellW * 4 + 3, g.ys[61]);
    await tp.waitForTimeout(150);
    check('Tablet: Antippen eines Fremdtons setzt die Note auf den Tonleiterton (C♯ → C)', JSON.stringify((await getNotes()).map((n) => n.pitch)) === '[60]', JSON.stringify(await getNotes()));
    // Lange drücken und ziehen: eine Zeile höher auf einen Fremdton
    await tp.evaluate((id) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = [{ pitch: 62, start: 4, len: 2, vel: 1 }]; }), pid);
    g = await tp.evaluate(geometry, 62);
    const cdp = await tp.context().newCDPSession(tp);
    const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const hx = g.x0 + g.cellW * 16 + 6;
    const hy = g.ys[62];
    await T('touchStart', [{ x: hx, y: hy }]);
    await tp.waitForTimeout(650);
    for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: hx, y: hy - (i * g.row) / 6 }]); await tp.waitForTimeout(16); }
    await T('touchEnd', []);
    await tp.waitForTimeout(250);
    check('Tablet: lange drücken und eine Zeile höher ziehen (D → D♯) rastet auf E ein', JSON.stringify((await getNotes()).map((n) => n.pitch)) === '[64]', JSON.stringify(await getNotes()));
    if (SHOTS) await tp.screenshot({ path: path.join(SHOT_DIR, 'scale-tablet.png') });
    check('Tablet: keine Fehler in der Konsole', tab.errors.length === 0, tab.errors.join(' | '));
  } catch (e) {
    check('Tablet-Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await tab.close();
  }

  // ================= Handy =================
  const ph = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const pp = ph.page;
    await pp.tap('#tab-sounds');
    await pp.tap('#new-melody-btn');
    await pp.waitForFunction(() => window.loopwerk.ui.dock === 'pattern' && !document.getElementById('pat-roll-wrap').hidden);
    await pp.waitForTimeout(700);
    const pid = await pp.evaluate(() => window.loopwerk.patternEditor.id);
    const getNotes = () => pp.evaluate((id) => window.loopwerk.store.project.patterns[id].notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len })), pid);
    const lay = await pp.evaluate(() => {
      const b = document.getElementById('pat-scale').getBoundingClientRect();
      const wrap = document.getElementById('pat-roll-wrap').getBoundingClientRect();
      return { inBar: !!document.getElementById('pat-scale').closest('#pat-scale-bar'), w: b.width, h: b.height, inside: b.left >= wrap.left && b.right <= wrap.right && b.top >= wrap.top, over: document.documentElement.scrollWidth - innerWidth };
    });
    check('Handy: Schalter „Tonleiter“ liegt sichtbar über der Piano-Roll, ≥ 44 px, ohne Querscroll', lay.inBar && lay.inside && lay.w >= 44 && lay.h >= 44 && lay.over <= 0, JSON.stringify(lay));
    const hit = await pp.evaluate(() => { const b = document.getElementById('pat-scale').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('#pat-scale') != null; });
    check('Handy: Schalter ist nicht verdeckt', hit);
    await pp.tap('#pat-scale');
    await pp.waitForTimeout(200);
    const st = await pp.evaluate((id) => ({ lock: window.loopwerk.store.project.patterns[id].scaleLock, kindIn: !!document.getElementById('pat-scale-kind').closest('#pat-scale-bar'), kindVis: !!document.getElementById('pat-scale-kind').offsetParent }), pid);
    check('Handy: ein Antippen schaltet an, die Auswahl der Tonleiter erscheint daneben', st.lock === true && st.kindIn && st.kindVis, JSON.stringify(st));
    const vk = await pp.evaluate(() => {
      const k = (m) => document.querySelector(`#pat-vkeys .vkey[data-pitch="${m}"]`);
      return { off61: k(61)?.classList.contains('off'), off60: k(60)?.classList.contains('off'), root69: k(69)?.classList.contains('root') ?? null };
    });
    check('Handy: Klaviertasten links – Fremdton gedämpft, Tonleiterton nicht', vk.off61 === true && vk.off60 === false, JSON.stringify(vk));
    // Roll antippen auf einer Fremdton-Zeile
    const g = await pp.evaluate(geometry, 61);
    await pp.touchscreen.tap(g.x0 + g.cellW * 2 + 4, g.ys[61]);
    await pp.waitForTimeout(200);
    check('Handy: Antippen der Fremdton-Zeile setzt die Note auf C', JSON.stringify((await getNotes()).map((n) => n.pitch)) === '[60]', JSON.stringify(await getNotes()));
    // Fremdton über das Modell, dann „Auf Tonleiter ziehen“ unter „Mehr“
    await pp.evaluate((id) => window.loopwerk.store.updatePattern(id, (p) => { p.notes.push({ pitch: 61, start: 4, len: 1, vel: 1 }, { pitch: 63, start: 5, len: 1, vel: 1 }); }), pid);
    await pp.waitForTimeout(150);
    const fixHidden = await pp.evaluate(() => !document.getElementById('pat-scale-fix').offsetParent);
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(250);
    const fixVis = await pp.evaluate(() => { const b = document.getElementById('pat-scale-fix'); const r = b.getBoundingClientRect(); return { vis: !!b.offsetParent, inMore: !!b.closest('#pat-more'), h: r.height, text: b.textContent }; });
    check('Handy: „Auf Tonleiter ziehen (2)“ steht unter „Mehr“ (zwei Klicks), fingergroß', fixHidden && fixVis.vis && fixVis.inMore && fixVis.h >= 44 && fixVis.text === 'Auf Tonleiter ziehen (2)', JSON.stringify(fixVis));
    if (SHOTS) await pp.screenshot({ path: path.join(SHOT_DIR, 'scale-phone-more.png') });
    await pp.tap('#pat-scale-fix');
    await pp.waitForTimeout(250);
    check('Handy: „Auf Tonleiter ziehen“ schiebt C♯ → C und D♯ → D', JSON.stringify((await getNotes()).map((n) => n.pitch)) === '[60,60,62]', JSON.stringify(await getNotes()));
    await pp.evaluate(() => window.loopwerk.store.undo());
    await pp.waitForTimeout(150);
    await pp.evaluate((id) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = [{ pitch: 61, start: 0, len: 2, vel: 1 }, { pitch: 64, start: 4, len: 2, vel: 1 }]; }), pid);
    await pp.waitForTimeout(250);
    if (SHOTS) await pp.screenshot({ path: path.join(SHOT_DIR, 'scale-phone.png') });
    // Klaviertaste am Handy spielt den Ton der Tonleiter (Schritt-Eingabe)
    await pp.evaluate((id) => window.loopwerk.store.updatePattern(id, (p) => { p.notes = []; }), pid);
    await pp.tap('#pat-more-btn');
    await pp.waitForTimeout(200);
    await pp.tap('#pat-rec');
    await pp.waitForTimeout(150);
    const key = await pp.evaluate(() => { const r = document.querySelector('#pat-vkeys .vkey[data-pitch="61"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await pp.touchscreen.tap(key.x, key.y);
    await pp.waitForFunction((id) => window.loopwerk.store.project.patterns[id].notes.length >= 1, pid, { timeout: 5000 });
    check('Handy: Klaviertaste Cis (gedämpft) spielt und schreibt C', JSON.stringify((await getNotes()).map((n) => n.pitch)) === '[60]', JSON.stringify(await getNotes()));
    const over = await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check('Handy: kein Querscroll mit Sperre', over <= 0, String(over));
    check('Handy: keine Fehler in der Konsole', ph.errors.length === 0, ph.errors.join(' | '));
  } catch (e) {
    check('Handy-Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await ph.close();
  }
  finish();
})();
