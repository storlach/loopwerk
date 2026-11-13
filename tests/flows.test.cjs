// Umbau Scheibe 6 (Layout „reiter“, Desktop): die drei Schritt-für-Schritt-Abläufe als Karte in der Mitte.
// Prüft je Ablauf: nur mit dem Hauptknopf kommt man durch, Esc schließt ohne Folgen und der Fokus kehrt zurück, danach stimmt der Zustand.
// Neuer Song: Stil → anhören und entscheiden; Rückfrage im Hauptknopf; Rückgängig holt den alten Song zurück.
// Neuer Sound: „+ Neu“ neben der Suche, die Unterreiter entfallen; eine Wahl öffnet den Weg (Beat bearbeiten).
// Exportieren: drei Schritte, der Knopf #ex-go sitzt im dritten Schritt als Hauptknopf; am Handy bleibt das Fach.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  const lw = (fn, arg) => page.evaluate(fn, arg);
  const info = () => lw(() => { const f = window.loopwerk.flow; const o = document.getElementById('flow-overlay'); return { id: f.id, step: f.step, open: f.isOpen, shown: !o.hidden && o.dataset.state === 'auf', label: document.getElementById('flow-main').textContent, mainHidden: document.getElementById('flow-main').hidden, stepText: document.getElementById('flow-step').textContent }; });
  const closed = () => page.waitForFunction(() => { const o = document.getElementById('flow-overlay'); return o.dataset.state === 'zu' && o.inert && o.hidden; }, null, { timeout: 5000 });
  const sameProject = (json) => lw((j) => JSON.stringify(window.loopwerk.store.project) === j, json);
  try {
    await lw(async () => {
      const M = await import('./src/model.js');
      window.loopwerk.store.replace(M.createDemoProject());
      window.loopwerk.tips?.disable?.();
    });
    const demo = await lw(() => JSON.stringify(window.loopwerk.store.project));

    // ---------- Neuer Song ----------
    const rows = await lw(() => ({
      genreButtons: [...document.querySelectorAll('#side-datei-liste .starter-genre')].length,
      row: !!document.getElementById('new-song-btn')?.closest('#side-datei-liste'),
      start: !!document.getElementById('demo-btn').closest('#side-datei-liste'), clear: !!document.getElementById('new-btn').closest('#side-datei-liste'),
    }));
    check('Datei: „Neuer Song“ ist eine Zeile der Liste, keine zehn Genre-Knöpfe; Beispiel und Leeren bleiben Zeilen', rows.row && rows.genreButtons === 0 && rows.start && rows.clear, JSON.stringify(rows));
    await page.click('#side-tab-datei');
    await page.click('#new-song-btn');
    await page.waitForTimeout(500);
    let i = await info();
    check('Neuer Song öffnet die Karte: Schritt 1 von 2, Stil wählen', i.id === 'song' && i.step === 0 && i.shown && i.stepText === '1 von 2', JSON.stringify(i));
    const geo = await lw(() => { const r = document.getElementById('flow-card').getBoundingClientRect(); return { cx: Math.abs((r.left + r.right) / 2 - innerWidth / 2), role: document.getElementById('flow-card').getAttribute('role'), focusIn: document.getElementById('flow-card').contains(document.activeElement), genres: [...document.querySelectorAll('#flow-card .starter-genre')].filter((b) => b.offsetParent).length }; });
    check('Karte steht in der Mitte, ist ein Dialog, Fokus ist drin, die zehn Stile sind zu sehen', geo.cx < 60 && geo.role === 'dialog' && geo.focusIn && geo.genres === 10, JSON.stringify(geo));
    // Esc: nichts geschieht, Fokus zurück
    await page.keyboard.press('Escape');
    await closed();
    check('Esc schließt den Ablauf ohne Folgen (Song unverändert) und der Fokus kehrt auf „Neuer Song“ zurück', (await sameProject(demo)) && (await lw(() => document.activeElement?.id)) === 'new-song-btn');
    // Nur mit dem Hauptknopf: Rückfrage im Knopf, dann bauen, dann Fertig
    await page.click('#new-song-btn');
    await page.waitForTimeout(400);
    i = await info();
    check('Hauptknopf nennt, dass der Song ersetzt wird', /ersetzen/i.test(i.label), i.label);
    await page.click('#flow-main');
    await page.waitForTimeout(200);
    i = await info();
    check('Erster Klick fragt im Knopf nach („Sicher?“), der Song ist noch unverändert', /^Sicher/.test(i.label) && i.step === 0 && (await sameProject(demo)), i.label);
    await page.click('#flow-main');
    await page.waitForFunction(() => window.loopwerk.flow.step === 1, null, { timeout: 20000 });
    i = await info();
    const built = await lw(() => ({ bpm: window.loopwerk.store.project.bpm, name: window.loopwerk.store.project.name, again: !!document.getElementById('starter-again').offsetParent, accomp: !!document.getElementById('starter-accomp').offsetParent, play: !!document.getElementById('flow-play').offsetParent, genres: [...document.querySelectorAll('#flow-card .starter-genre')].filter((b) => b.offsetParent).length }));
    check('Zweiter Klick baut den Song (Pop) und geht zu Schritt 2 von 2: Nochmal, Begleitung, Anhören; Hauptknopf „Fertig“', i.step === 1 && i.label === 'Fertig' && i.stepText === '2 von 2' && built.again && built.accomp && built.play && built.genres === 0 && built.bpm === 110, JSON.stringify({ ...i, ...built }));
    const pop = await lw(() => JSON.stringify(window.loopwerk.store.project));
    await page.click('#starter-again');
    await page.waitForTimeout(1500);
    check('„Nochmal“ baut eine andere Fassung ohne Rückfrage', (await info()).step === 1 && !(await sameProject(pop)));
    await page.click('#flow-back');
    await page.waitForTimeout(300);
    check('Zurück führt zu Schritt 1, das gewählte Genre bleibt gewählt', (await info()).step === 0 && (await lw(() => document.querySelector('#flow-card .starter-genre[aria-pressed="true"]')?.dataset.genre)) === 'pop');
    await page.click('#flow-main');
    await page.waitForFunction(() => window.loopwerk.flow.step === 1, null, { timeout: 20000 });
    await page.click('#flow-main');
    await closed();
    check('Fertig schließt die Karte; Rückgängig holt den alten Song zurück', await lw((d) => { const k = window.loopwerk; let n = 0; while (n++ < 8 && JSON.stringify(k.store.project) !== d) k.store.undo(); return true; }, demo) && (await sameProject(demo)));

    // ---------- Neuer Sound ----------
    await page.click('#side-tab-sounds');
    const sd = await lw(() => ({ tabs: !!document.querySelector('.left-tabs')?.offsetParent, ltab: !!document.getElementById('ltab-create').offsetParent, neu: !!document.getElementById('shelf-new').offsetParent, nearSearch: !!document.getElementById('shelf-new').closest('#shelf-find'), title: !!document.querySelector('.left-title')?.offsetParent }));
    check('Sounds: keine Unterreiter und keine Überschrift „Assets“, „+ Neu“ steht in der Suchzeile', !sd.tabs && !sd.ltab && !sd.title && sd.neu && sd.nearSearch, JSON.stringify(sd));
    await page.click('#shelf-new');
    await page.waitForTimeout(500);
    i = await info();
    const cards = await lw(() => [...document.querySelectorAll('#flow-card .ccard')].filter((c) => c.offsetParent).map((c) => c.dataset.create));
    check('„+ Neu“ öffnet „Neuer Sound“ mit den sieben Wegen, ohne Schrittanzeige und ohne Hauptknopf', i.id === 'sound' && i.shown && i.mainHidden && cards.length === 7 && !(await lw(() => document.getElementById('flow-step').offsetParent)), JSON.stringify({ ...i, cards }));
    await page.keyboard.press('Escape');
    await closed();
    check('Esc schließt, Fokus zurück auf „+ Neu“', (await lw(() => document.activeElement?.id)) === 'shelf-new');
    await page.click('#shelf-new');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); // der erste Weg hat den Fokus: Beat bauen
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern', null, { timeout: 10000 });
    await page.waitForTimeout(500);
    const ov = await lw(() => ({ flow: window.loopwerk.flow.isOpen, pat: !document.getElementById('clip-overlay').hidden, title: document.getElementById('pat-title').textContent }));
    check('Ein Weg gewählt: der Ablauf ist zu, der Beat wird in der Karte bearbeitet („Beat bearbeiten“)', !ov.flow && ov.pat && ov.title === 'Beat bearbeiten', JSON.stringify(ov));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.loopwerk.ui.dock, null, { timeout: 5000 });
    await page.waitForTimeout(500);

    // ---------- Exportieren ----------
    await page.click('#side-tab-datei');
    await page.click('#export-btn');
    await page.waitForTimeout(500);
    i = await info();
    const ex1 = await lw(() => ({ range: !!document.getElementById('ex-range-song').offsetParent, stems: !!document.getElementById('ex-stems').offsetParent, wav: !!document.getElementById('ex-format-wav').offsetParent, go: !!document.getElementById('ex-go').offsetParent }));
    check('Exportieren öffnet Schritt 1 von 3 (Was): Bereich und Einzelspuren, noch kein Format', i.id === 'export' && i.step === 0 && i.stepText === '1 von 3' && ex1.range && ex1.stems && !ex1.wav && !ex1.go, JSON.stringify({ ...i, ...ex1 }));
    await page.click('#flow-main');
    await page.waitForTimeout(300);
    const ex2 = await lw(() => ({ wav: !!document.getElementById('ex-format-wav').offsetParent, mst: !!document.getElementById('ex-mastering').offsetParent, range: !!document.getElementById('ex-range-song').offsetParent }));
    check('Schritt 2 (Format und Klang): Format und Feinschliff', (await info()).step === 1 && ex2.wav && ex2.mst && !ex2.range, JSON.stringify(ex2));
    await page.click('#flow-back');
    await page.waitForTimeout(300);
    check('Zurück führt zu Schritt 1', (await info()).step === 0);
    await page.click('#flow-main');
    await page.click('#flow-main');
    await page.waitForTimeout(300);
    const ex3 = await lw(() => ({ go: document.getElementById('ex-go'), inFoot: !!document.getElementById('ex-go').closest('.flow-foot'), vis: !!document.getElementById('ex-go').offsetParent, text: document.getElementById('ex-go').textContent, mainHidden: document.getElementById('flow-main').hidden, status: !!document.getElementById('ex-status') }));
    check('Schritt 3: der vorhandene Knopf #ex-go ist der Hauptknopf (in der Fußzeile), Fortschritt und Ergebnis sind da', (await info()).step === 2 && ex3.inFoot && ex3.vis && ex3.text === 'Exportieren' && ex3.mainHidden && ex3.status, JSON.stringify({ ...ex3, go: undefined }));
    await page.keyboard.press('Escape');
    await closed();
    const after = await lw(() => ({ home: !!document.getElementById('ex-go').closest('.ex-go'), hidden: document.getElementById('export').hidden, dock: window.loopwerk.ui.dock, focus: document.activeElement?.id }));
    check('Esc schließt, #ex-go liegt wieder an seinem Platz, kein Fach ist offen, Fokus zurück auf „Exportieren“', after.home && after.hidden && !after.dock && after.focus === 'export-btn', JSON.stringify(after));

    // ---------- Klick daneben schließt ----------
    await page.click('#export-btn');
    await page.waitForTimeout(400);
    await page.mouse.click(30, 700);
    await closed();
    check('Klick auf die abgedunkelte Fläche schließt den Ablauf', !(await lw(() => window.loopwerk.flow.isOpen)));

    // ---------- Handy: die Abläufe gibt es nicht, alles am alten Platz ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const m = await lw(() => ({ open: window.loopwerk.flow.isOpen, panel: !!document.getElementById('create-panel').closest('.shelf'), exportHome: !document.getElementById('export').closest('#flow-overlay'), starter: !!document.getElementById('starter').closest('#song, .song-starter, #create-panel') }));
    check('Handy: Ablauf zu, Erstellen-Panel, Export-Fach und Song-Starter liegen wieder an ihrem Platz', !m.open && m.panel && m.exportHome && m.starter, JSON.stringify(m));
    await lw(() => document.getElementById('export-btn').click());
    await page.waitForTimeout(500);
    check('Handy: „Exportieren“ öffnet weiter das Fach', (await lw(() => window.loopwerk.ui.dock)) === 'export' && !(await lw(() => window.loopwerk.flow.isOpen)));

    check('keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || String(e));
  } finally {
    await app.close();
    finish();
  }
})();
