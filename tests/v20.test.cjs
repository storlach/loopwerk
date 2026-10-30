// Version 2.0: Überlappungen ohne Verlust (der obere Clip klingt, der untere bleibt erhalten),
// Mixer am Handy wischbar ohne Regler zu verstellen, Link-Import, Look „Werkstück“.
// node tests/v20.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp({ viewport: { width: 1536, height: 960 } });
  let { page } = app;
  try {
    // ---------- Ladescreen ganz oben, Bildmarke zeigt den echten Pegel ----------
    const order = await page.evaluate(() => {
      const boot = document.getElementById('boot');
      const big = [...document.querySelectorAll('style')].sort((a, b) => b.textContent.length - a.textContent.length)[0];
      return { bootFirst: !!(boot.compareDocumentPosition(big) & Node.DOCUMENT_POSITION_FOLLOWING), bootCss: !!document.getElementById('boot-css') };
    });
    check('Ladescreen steht samt eigenem Stil vor dem großen Stylesheet (erscheint sofort)', order.bootFirst && order.bootCss, JSON.stringify(order));
    const bars = () => page.evaluate(() => [...document.querySelectorAll('#brand-bars i')].map((i) => i.getBoundingClientRect().height));
    const idle = await bars();
    check('Bildmarke ohne Ton: Grundform des Logos', idle.length === 5 && idle[2] === Math.max(...idle) && idle[4] === Math.min(...idle), JSON.stringify(idle));
    await page.click('#play-btn');
    await page.waitForTimeout(2600);
    const samples = [];
    for (let k = 0; k < 6; k++) { samples.push(JSON.stringify(await bars())); await page.waitForTimeout(90); }
    const live = await page.evaluate(() => document.getElementById('brand-bars').classList.contains('live'));
    check('Bildmarke beim Abspielen: Balken folgen dem echten Ausgangspegel', live && new Set(samples).size > 1, samples.join(' '));
    await page.click('#play-btn');
    await page.waitForTimeout(1500);
    check('Nach dem Stopp kehrt das Logo in die Grundform zurück', JSON.stringify(await bars()) === JSON.stringify(idle), JSON.stringify(await bars()));
    const inSplash = await page.evaluate(() => !!document.querySelector('#boot #brand-bars'));
    check('Im Ladescreen bleibt die Animation (keine Pegelanzeige)', !inSplash);

    // ---------- Pad halten: leuchtet durchgehend, aus erst beim Loslassen ----------
    await page.evaluate(() => document.getElementById('ltab-create').click());
    await page.click('[data-create="beat"]');
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern');
    await page.click('#pat-view [data-view="pads"]');
    await page.waitForTimeout(500);
    const pb = await page.locator('#pat-pads .pat-pad[data-row="kick"]').boundingBox();
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await page.mouse.down();
    const lit = await page.evaluate(() => new Promise((res) => {
      const pad = document.querySelector('#pat-pads .pat-pad[data-row="kick"]');
      const out = [];
      const t0 = performance.now();
      const f = () => { out.push(/radial-gradient/.test(getComputedStyle(pad).backgroundImage)); if (performance.now() - t0 < 1100) requestAnimationFrame(f); else res(out); };
      requestAnimationFrame(f);
    }));
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('#pat-pads .pat-pad[data-row="kick"]')).backgroundImage);
    check('Pad halten: leuchtet in jedem Bild, auch während des Wirbels', lit.length > 20 && lit.every(Boolean), `${lit.filter(Boolean).length}/${lit.length}`);
    check('Pad loslassen: Licht geht aus', !/radial-gradient/.test(after), after.slice(0, 60));
    await page.evaluate(() => { window.loopwerk.ui.setDock(null); document.getElementById('ltab-sounds').click(); });

    // ---------- Überlappungen: Klang ----------
    const ov = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const m = await import('./src/model.js');
      const sr = 44100;
      const mk = (id, value) => {
        const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
        for (let c = 0; c < 2; c++) b.getChannelData(c).fill(value);
        library.register({ id, name: id, category: 'fx', lengthBeats: 4, bpm: 120, buffer: b });
      };
      mk('ov-low', 0.5);
      mk('ov-high', 0.25);
      const s = new m.Store(m.createEmptyProject(), { sampleBeats: (id) => library.get(id).lengthBeats });
      s.project.lengthBars = 4;
      for (const t of s.project.tracks) t.volume = 1;
      s.addClip('t1', 'ov-low', 0, 16);
      const top = s.addClip('t1', 'ov-high', 4, 4);
      const level = (d, beat) => { const i = Math.round((beat * 0.5 + 0.06) * sr); let a = 0; for (let k = 0; k < 400; k++) a += d[i + k]; return Math.round((a / 400) * 100) / 100; };
      const render = async () => (await renderProject(s.project, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      let d = await render();
      const stacked = [level(d, 1), level(d, 5), level(d, 9)];
      const kept = s.track('t1').clips.map((c) => [c.sampleId, c.startBeat, c.lengthBeats]);
      // Oberen Clip löschen: der untere klingt dort wieder, weil er nie gekürzt wurde
      s.deleteClip(top);
      d = await render();
      const freed = [level(d, 1), level(d, 5), level(d, 9)];
      // Wieder einen Clip darauflegen, dann den unteren neu ablegen (verschieben): jetzt liegt er oben
      s.addClip('t1', 'ov-high', 4, 4);
      const low = s.track('t1').clips.find((c) => c.sampleId === 'ov-low').id;
      s.moveClip(low, 't1', 0);
      d = await render();
      const raised = [level(d, 1), level(d, 5), level(d, 9)];
      return { stacked, kept, freed, raised };
    });
    // Track-Fader und Panorama (Mitte, -3 dB je Kanal) skalieren gleich: Verhältnis zählt
    const r = (a) => a.map((v) => Math.round((v / ov.freed[0]) * 10) / 10);
    check('Überlappen: unter dem oberen Clip klingt nur der obere', JSON.stringify(r(ov.stacked)) === '[1,0.5,1]', JSON.stringify(ov.stacked));
    check('Überlappen: der untere Clip bleibt vollständig erhalten', JSON.stringify(ov.kept) === JSON.stringify([['ov-low', 0, 16], ['ov-high', 4, 4]]), JSON.stringify(ov.kept));
    check('Oberen Clip löschen: der untere klingt dort wieder', JSON.stringify(r(ov.freed)) === '[1,1,1]', JSON.stringify(ov.freed));
    check('Zuletzt abgelegter Clip liegt oben', JSON.stringify(r(ov.raised)) === '[1,1,1]', JSON.stringify(ov.raised));

    // ---------- Look „Werkstück“ ----------
    await page.emulateMedia({ colorScheme: 'dark' });
    const look = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        bg: cs('body').backgroundColor, play: cs('#play-btn').backgroundColor, lcd: cs('.lcd').backgroundColor,
        body: cs('body').fontFamily, mono: cs('.lcd-value').fontFamily, drums: getComputedStyle(document.documentElement).getPropertyValue('--cat-drums').trim(),
        label: cs('.clip-label').backgroundColor, labelInk: cs('.clip-label').color,
      };
    });
    check('Werkstück dunkel: Graphit-Grund, orange Start-Taste, schwarzes Display', look.bg === 'rgb(15, 15, 15)' && look.play === 'rgb(255, 91, 31)' && look.lcd === 'rgb(5, 5, 5)', JSON.stringify(look));
    check('Werkstück: Archivo für Text, Martian Mono für Anzeigen, Drums gelb', /Archivo/.test(look.body) && /Martian Mono/.test(look.mono) && look.drums.toUpperCase() === '#FFC21A', JSON.stringify(look));
    check('Werkstück: Clips tragen ein farbiges Etikett mit dunkler Schrift', look.label !== 'rgba(0, 0, 0, 0)' && look.labelInk === 'rgb(17, 17, 17)', JSON.stringify(look));
    // Clips und Spurköpfe wie im Entwurf: LED-Wellenform, Pattern-Schild, Farbpunkt, Lautstärke-Drehregler
    const heads = await page.evaluate(() => {
      const row = document.querySelector('.track-row');
      return { dot: getComputedStyle(row.querySelector('.track-dot')).backgroundColor, knob: !!row.querySelector('.track-vol-wrap .knob'), slider: getComputedStyle(row.querySelector('.track-vol')).opacity };
    });
    check('Spurkopf: Farbpunkt der Kategorie und Lautstärke als Drehregler', heads.dot === 'rgb(255, 194, 26)' && heads.knob && heads.slider === '0', JSON.stringify(heads));
    const vol0 = await page.evaluate(() => window.loopwerk.store.track('t1').volume);
    const tk = await page.locator('.track-row:first-child .track-vol-wrap .knob').boundingBox();
    await page.mouse.move(tk.x + tk.width / 2, tk.y + tk.height / 2);
    await page.mouse.down();
    await page.mouse.move(tk.x + tk.width / 2, tk.y + tk.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    check('Spur-Drehregler nach unten ziehen macht leiser', await page.evaluate(() => window.loopwerk.store.track('t1').volume) < vol0 - 0.1);
    await page.keyboard.press('Control+z');
    const dots = await page.evaluate(() => {
      // LED-Wellenform: in einer Spalte wechseln Punkt und Lücke (keine durchgehende Fläche)
      const cv = document.querySelector('.clip[data-clip-id="c4"] .clip-wave');
      const g = cv.getContext('2d');
      const col = g.getImageData(Math.round(cv.width * 0.3), 0, 1, cv.height).data;
      let changes = 0;
      for (let y = 1; y < cv.height; y++) if ((col[y * 4 + 3] > 0) !== (col[(y - 1) * 4 + 3] > 0)) changes++;
      return changes;
    });
    check('Wellenform als LED-Punkte (Punkt, Lücke, Punkt …)', dots >= 4, String(dots));
    await page.emulateMedia({ colorScheme: 'light' });

    // ---------- Überlappen im Arranger: Drag & Drop zerstört nichts ----------
    await page.evaluate(() => {
      const { store } = window.loopwerk;
      store.replace({ ...store.project, tracks: store.project.tracks.map((t) => ({ ...t, clips: t.id === 't8' ? [{ id: 'x1', sampleId: 'chords-pad', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }] : t.clips })) });
    });
    const item = page.locator('.loop-item[data-sample-id="drums-four"]');
    const lane = page.locator('.lane[data-track-id="t8"]');
    const lb = await lane.boundingBox();
    const ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await item.dragTo(lane, { targetPosition: { x: 4 * ppb + 4, y: lb.height / 2 } });
    const t8 = await page.evaluate(() => window.loopwerk.store.track('t8').clips.map((c) => [c.sampleId, c.startBeat, c.lengthBeats]));
    check('Sound auf einen Clip ziehen: beide bleiben, der untere ungekürzt', t8.length === 2 && t8.some((c) => c[0] === 'chords-pad' && c[1] === 0 && c[2] === 16), JSON.stringify(t8));
    const stack = await page.evaluate(() => [...document.querySelectorAll('.lane[data-track-id="t8"] .clip')].map((n) => ({ id: n.dataset.clipId, z: getComputedStyle(n).zIndex, top: n.classList.contains('on-top'), covered: n.classList.contains('covered') })));
    const pad = stack.find((s) => s.id === 'x1');
    const drum = stack.find((s) => s.id !== 'x1');
    check('Arranger: der neue Clip liegt sichtbar oben, der untere ist als verdeckt markiert', Number(drum.z) > Number(pad.z) && drum.top && pad.covered, JSON.stringify(stack));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v20-ueberlappen.png') });

    // ---------- Aus dem Netz holen ----------
    // Ein Link auf eine Audiodatei (hier vom eigenen Testserver) wird geholt und als eigener Sound angelegt
    const wavUrl = await page.evaluate(async () => {
      const { encodeWav } = window.loopwerk;
      const b = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 44100 });
      b.getChannelData(0).fill(0.2);
      return URL.createObjectURL(encodeWav(b));
    });
    await page.evaluate(() => document.getElementById('ltab-create').click());
    await page.click('[data-create="link"]');
    check('Karte „Aus dem Netz holen“ öffnet das Link-Feld', await page.locator('#link-input').isVisible());
    await page.fill('#link-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.press('#link-input', 'Enter');
    const yt = await page.locator('#link-note').textContent();
    check('YouTube-Link: ehrliche Erklärung und Tab-Aufnahme als Weg', /YouTube/.test(yt) && /Tab/.test(yt), yt);
    await page.fill('#link-input', 'kein link');
    await page.press('#link-input', 'Enter');
    check('Kein Link: verständlicher Hinweis', /kein Link/.test(await page.locator('#link-note').textContent()));
    const ownBefore = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
    // blob:-Links zählen nicht als http(s) – für den Test den Abruf direkt auslösen
    const ok = await page.evaluate(async (u) => {
      const real = window.fetch;
      window.fetch = (url, o) => real(u, o);
      try { return await window.loopwerk.linkImport.fetchLink('https://example.org/sounds/Testton.wav'); } finally { window.fetch = real; }
    }, wavUrl);
    const ownAfter = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').map((s) => s.name));
    check('Link auf eine Audiodatei: wird importiert und heißt wie die Datei', ok && ownAfter.length === ownBefore + 1 && ownAfter.includes('Testton'), JSON.stringify(ownAfter));
    const failed = await page.evaluate(async () => {
      const real = window.fetch;
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      try { await window.loopwerk.linkImport.fetchLink('https://example.org/x.mp3'); return document.getElementById('link-note').textContent; } finally { window.fetch = real; }
    });
    check('Server sperrt den Abruf: Hinweis zum Herunterladen und Ziehen', /herunter/.test(failed), failed);
    await page.keyboard.press('Escape');
    // Link mit Strg+V irgendwo einfügen startet den Import
    const pasted = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://youtu.be/abc');
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return { open: !document.getElementById('link-pop').hidden, value: document.getElementById('link-input').value };
    });
    check('Link einfügen (Strg+V) öffnet das Feld und prüft den Link', pasted.open && pasted.value === 'https://youtu.be/abc', JSON.stringify(pasted));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v20-link.png') });
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Mixer wischen verstellt keine Regler ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page = app.page;
    const cdp = await page.context().newCDPSession(page);
    const touch = async (x, y, dx, dy, steps = 10) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    };
    const mixState = () => page.evaluate(() => ({
      vols: window.loopwerk.store.project.tracks.map((t) => t.volume), pans: window.loopwerk.store.project.tracks.map((t) => t.pan || 0),
      scroll: document.getElementById('mixer-strips').scrollLeft,
    }));
    await page.tap('#mixer-btn');
    await page.waitForTimeout(600);
    const before = await mixState();
    const fr = await page.locator('#mixer .strip[data-strip-id="t2"] .strip-fader-row').boundingBox();
    await touch(fr.x + fr.width / 2 + 120, fr.y + fr.height / 2, -220, 6);
    const swiped = await mixState();
    check('Handy: waagrecht über die Fader wischen scrollt die Kanäle', swiped.scroll > before.scroll + 60, `${before.scroll} → ${swiped.scroll}`);
    check('Handy: dabei verstellt sich kein Fader und kein Panorama', JSON.stringify(swiped.vols) === JSON.stringify(before.vols) && JSON.stringify(swiped.pans) === JSON.stringify(before.pans), JSON.stringify({ before: before.vols, after: swiped.vols }));
    // Antippen springt nicht, senkrecht ziehen verstellt relativ
    const f3 = await page.locator('#mixer .strip[data-strip-id="t3"] .strip-fader-row').boundingBox();
    await page.touchscreen.tap(f3.x + f3.width / 2, f3.y + 10);
    const tapped = await mixState();
    check('Handy: Antippen eines Faders lässt ihn stehen', tapped.vols[2] === before.vols[2], `${before.vols[2]} → ${tapped.vols[2]}`);
    await touch(f3.x + f3.width / 2, f3.y + f3.height / 2, 0, -60);
    const dragged = await mixState();
    check('Handy: Fader senkrecht ziehen macht lauter', dragged.vols[2] > before.vols[2] + 0.1 && dragged.vols.filter((v, i) => v !== before.vols[i]).length === 1, `${before.vols[2]} → ${dragged.vols[2]}`);
    const kb = await page.locator('#mixer .strip[data-strip-id="t3"] .knob').boundingBox();
    await touch(kb.x + kb.width / 2, kb.y + kb.height / 2, 0, -50);
    const panned = await mixState();
    const turn = await page.evaluate(() => getComputedStyle(document.querySelector('#mixer .strip[data-strip-id="t3"] .knob')).getPropertyValue('--turn'));
    check('Handy: Panorama-Drehregler senkrecht ziehen dreht nach rechts', panned.pans[2] > 0.3 && parseFloat(turn) > 30, `${panned.pans[2]} ${turn}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v20-mixer-handy.png') });
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
