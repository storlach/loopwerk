// Version 1.4: feineres Raster, Zoom, Spur-Funktionen, Techno-Sounds, Genres, neue Effekte, Drumpad, Klaviatur.
// node tests/v14.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  let app = await openApp();
  let { page } = app;
  const clipOn = (trackId) => page.evaluate((t) => window.loopwerk.store.track(t).clips.map((c) => ({ ...c })), trackId);
  const drag = async (x, y, dx, dy, opts = {}) => {
    await page.mouse.move(x, y);
    if (opts.shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    if (opts.shift) await page.keyboard.up('Shift');
  };
  try {
    // ---------- Raster ----------
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
      document.getElementById('arr-scroll').scrollLeft = 0;
    });
    const opts = await page.evaluate(() => [...document.querySelectorAll('#snap-sel option')].map((o) => o.value));
    check('Raster bis 1/16 und frei wählbar', JSON.stringify(opts) === JSON.stringify(['4', '2', '1', '0.5', '0.25', '0']), opts.join(','));
    check('Voreinstellung ist „Schlag“', await page.evaluate(() => window.loopwerk.ui.snapBeats === 1 && document.getElementById('snap-sel').value === '1'));

    await page.evaluate(() => window.loopwerk.store.addClip('t1', 'test-click', 0, 4));
    await page.selectOption('#snap-sel', '0.25');
    let ppb = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    let cb = await page.locator('.lane[data-track-id="t1"] .clip').first().boundingBox();
    await drag(cb.x + 20, cb.y + cb.height / 2, 1.3 * ppb, 0);
    let c = (await clipOn('t1'))[0];
    check('1/16-Raster: Clip rastet auf Sechzehntel', c.startBeat === 1.25, String(c.startBeat));

    await page.selectOption('#snap-sel', '1');
    cb = await page.locator('.lane[data-track-id="t1"] .clip').first().boundingBox();
    await drag(cb.x + 20, cb.y + cb.height / 2, 0.4 * ppb, 0, { shift: true });
    c = (await clipOn('t1'))[0];
    const frac = c.startBeat * 64;
    check('Umschalt beim Ziehen: frei (1/64 Schlag)', c.startBeat > 1.25 && c.startBeat < 2 && Math.abs(frac - Math.round(frac)) < 1e-9 && c.startBeat * 4 % 1 !== 0, String(c.startBeat));

    // Alt + Pfeil schiebt um einen Rasterschritt
    const before = c.startBeat;
    await page.keyboard.press('Alt+ArrowRight');
    c = (await clipOn('t1'))[0];
    check('Alt+→ schiebt den Clip zur nächsten Rasterlinie', c.startBeat === Math.floor(before) + 1, `${before} → ${c.startBeat}`);
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    c = (await clipOn('t1'))[0];
    check('Alt+← schiebt um je einen Schritt zurück', c.startBeat === Math.floor(before) - 1, String(c.startBeat));

    // Raster bleibt nach Neuladen
    await page.selectOption('#snap-sel', '0.5');
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready);
    await page.evaluate(() => { const { library } = window.loopwerk; const sr = 44100; const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr }); b.getChannelData(0)[0] = 1; library.register({ id: 'test-click', name: 'Klick', category: 'fx', lengthBeats: 4, bpm: 120, buffer: b }); });
    check('Raster wird gemerkt', await page.evaluate(() => window.loopwerk.ui.snapBeats === 0.5 && document.getElementById('snap-sel').value === '0.5'));

    // Klick setzt einen ausgewählten Sound auf das Raster
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
      window.loopwerk.ui.arm('test-click');
      document.getElementById('arr-scroll').scrollLeft = 0;
    });
    const lane = await page.locator('.lane[data-track-id="t2"]').boundingBox();
    await page.mouse.click(lane.x + 2.7 * ppb, lane.y + lane.height / 2);
    c = (await clipOn('t2'))[0];
    check('Klick auf die Spur rastet im 1/8-Raster', c && c.startBeat === 2.5, String(c?.startBeat));
    await page.keyboard.press('Escape');

    // ---------- Zoom ----------
    const z0 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    const z1 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    check('Zoom vergrößert weit über das alte Maximum', z1 > 64 && z1 > z0, `${z0} → ${z1}`);
    const fine = await page.evaluate(() => document.querySelector('.arr-grid').classList.contains('fine'));
    check('Bei großem Zoom erscheinen Sechzehntel-Linien', fine);
    const clipW = await page.locator('.lane[data-track-id="t2"] .clip').first().evaluate((n) => n.getBoundingClientRect().width);
    check('Clips wachsen mit dem Zoom', Math.abs(clipW - 4 * z1) < 2, `${clipW} px`);

    // Strg + Mausrad zoomt um den Mauszeiger: der Schlag unter dem Zeiger bleibt stehen
    const arr = await page.locator('#arr-scroll').boundingBox();
    const mx = arr.x + arr.width * 0.6;
    const beatAt = () => page.evaluate((x) => {
      const r = document.getElementById('arr-scroll');
      const lane = document.querySelector('.lane').getBoundingClientRect();
      return (x - lane.left) / window.loopwerk.ui.pxPerBeat;
    }, mx);
    const b0 = await beatAt();
    await page.mouse.move(mx, arr.y + 80);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const z2 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    const b1 = await beatAt();
    check('Strg+Mausrad verkleinert', z2 < z1, `${z1} → ${z2}`);
    check('Schlag unter dem Mauszeiger bleibt stehen', Math.abs(b1 - b0) < 0.3, `${b0.toFixed(2)} → ${b1.toFixed(2)}`);
    for (let i = 0; i < 12; i++) await page.click('#zoom-out');
    const zmin = await page.evaluate(() => ({ ppb: window.loopwerk.ui.pxPerBeat, marks: document.querySelectorAll('.bar-mark').length, bars: window.loopwerk.store.project.lengthBars }));
    check('Ganz klein: mindestens 4 px pro Schlag, Taktzahlen ausgedünnt', zmin.ppb >= 4 && zmin.marks < zmin.bars, JSON.stringify(zmin));
    for (let i = 0; i < 20; i++) await page.click('#zoom-in');
    const zmax = await page.evaluate(() => {
      const cv = document.querySelector('.clip-wave');
      return { ppb: window.loopwerk.ui.pxPerBeat, canvas: cv.width };
    });
    check('Ganz groß: höchstens 192 px pro Schlag, Wellenform bleibt zeichenbar', zmax.ppb <= 192 && zmax.canvas > 0 && zmax.canvas <= 16000, JSON.stringify(zmax));
    await page.evaluate(() => { window.loopwerk.ui.pxPerBeat = 24; window.loopwerk.arranger.render(); });

    // ---------- Spuren: automatische Namen ----------
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
    });
    const names = () => page.evaluate(() => window.loopwerk.store.project.tracks.map((t) => t.name));
    await page.evaluate(() => {
      const { store } = window.loopwerk;
      store.addClip('t1', 'drums-break', 4, 8);
      store.addClip('t1', 'drums-four', 0, 4);
      store.addClip('t2', 'bass-prog', 0, 16);
    });
    let n = await names();
    check('Spur heißt wie ihr erster Clip', n[0] === 'Four to the Floor' && n[1] === 'Bass Am–F–C–G' && n[2] === 'Spur 3', n.slice(0, 3).join(' | '));
    await page.evaluate(() => { const { store } = window.loopwerk; store.deleteClip(store.track('t1').clips[0].id); });
    n = await names();
    check('Name folgt, wenn der erste Clip wegfällt', n[0] === 'Breakbeat', n[0]);
    await page.evaluate(() => { const { store } = window.loopwerk; store.deleteClip(store.track('t1').clips[0].id); });
    n = await names();
    check('Leere Spur bekommt ihren Standardnamen zurück', n[0] === 'Spur 1', n[0]);
    await page.locator('.track-row').nth(1).locator('.track-name').dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Mein Bass');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.loopwerk.store.addClip('t2', 'bass-sub', 0, 4));
    n = await names();
    check('Selbst vergebener Name bleibt', n[1] === 'Mein Bass', n[1]);
    await page.evaluate(() => window.loopwerk.store.undo());
    await page.evaluate(() => window.loopwerk.store.undo());
    n = await names();
    check('Rückgängig stellt den automatischen Namen wieder her', n[1] === 'Bass Am–F–C–G', n[1]);

    // ---------- Spuren: Menü ----------
    await page.locator('.track-row').nth(1).locator('.tbtn-menu').click();
    const items = await page.locator('.track-menu:not([hidden]) .track-menu-item').allTextContents();
    check('Spur-Menü zeigt die Befehle', items.join(',') === 'Duplizieren,Nach oben,Nach unten,Umbenennen,Löschen', items.join(','));
    await page.locator('.track-menu-item', { hasText: 'Duplizieren' }).click();
    const dup = await page.evaluate(() => {
      const t = window.loopwerk.store.project.tracks;
      return { n: t.length, name: t[2].name, clips: t[2].clips.length, ids: t[2].clips[0].id !== t[1].clips[0].id, same: t[2].clips[0].sampleId === t[1].clips[0].sampleId };
    });
    check('Duplizieren legt die Kopie direkt darunter an', dup.n === 9 && dup.name === 'Bass Am–F–C–G (Kopie)' && dup.clips === 1 && dup.ids && dup.same, JSON.stringify(dup));
    check('Menü schließt nach dem Befehl', await page.locator('.track-menu').isHidden());
    await page.locator('.track-row').nth(2).locator('.tbtn-menu').click();
    await page.locator('.track-menu-item', { hasText: 'Nach oben' }).click();
    await page.locator('.track-row').nth(1).locator('.tbtn-menu').click();
    await page.locator('.track-menu-item', { hasText: 'Nach oben' }).click();
    n = await names();
    check('„Nach oben“ verschiebt die Spur', n[0] === 'Bass Am–F–C–G (Kopie)' && n[1] === 'Spur 1', n.slice(0, 3).join(' | '));
    check('Arranger zeigt die neue Reihenfolge', (await page.locator('.track-row .track-name').first().textContent()) === 'Bass Am–F–C–G (Kopie)');
    await page.locator('.track-row').nth(0).locator('.tbtn-menu').click();
    await page.keyboard.press('Escape');
    check('Escape schließt das Menü', await page.locator('.track-menu').isHidden());
    await page.locator('.track-row').nth(0).locator('.tbtn-menu').click();
    const delItem = page.locator('.track-menu-item', { hasText: 'Löschen' });
    await delItem.click();
    const stillThere = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    await page.locator('.track-menu-item', { hasText: 'Wirklich löschen?' }).click();
    const gone = await page.evaluate(() => window.loopwerk.store.project.tracks.length);
    check('Löschen im Menü mit Bestätigung', stillThere === 9 && gone === 8, `${stillThere} → ${gone}`);

    // ---------- Spuren ziehen ----------
    const headBox = async (i) => page.locator('.track-row').nth(i).locator('.track-btns').boundingBox();
    const rowH = (await page.locator('.track-row').first().boundingBox()).height;
    let hb = await headBox(1);
    await drag(hb.x + hb.width - 4, hb.y - 4, 0, 2.2 * rowH);
    n = await names();
    check('Spurkopf ziehen verschiebt die Spur', n[0] === 'Spur 1' && n[1] === 'Spur 3' && n[2] === 'Spur 4' && n[3] === 'Bass Am–F–C–G', n.slice(0, 4).join(' | '));
    hb = await headBox(3);
    await page.mouse.move(hb.x + hb.width - 4, hb.y - 4);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width - 4, hb.y - 4 - 1.5 * rowH, { steps: 6 });
    await page.mouse.move(hb.x + hb.width - 4, hb.y - 4 - 3 * rowH, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    n = await names();
    check('Mit Alt gezogen entsteht eine Kopie', n.length === 9 && n[0] === 'Bass Am–F–C–G (Kopie)' && n[4] === 'Bass Am–F–C–G', n.slice(0, 5).join(' | '));
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Kopieren ist ein Rückgängig-Schritt', (await names()).length === 8);

    // ---------- Techno-Sounds ----------
    const techno = await page.evaluate(() => {
      const { library } = window.loopwerk;
      const list = library.list().filter((s) => s.id.startsWith('techno-'));
      // Pegel und Tiefen-Anteil je Sound (Energie unter ~150 Hz über einen einfachen Tiefpass)
      return list.map((s) => {
        const d = s.buffer.getChannelData(0);
        let peak = 0, e = 0, lo = 0, y = 0;
        const a = 1 - Math.exp(-2 * Math.PI * 150 / s.buffer.sampleRate);
        for (let i = 0; i < d.length; i++) { const v = d[i]; peak = Math.max(peak, Math.abs(v)); e += v * v; y += a * (v - y); lo += y * y; }
        return { id: s.id, cat: s.category, genres: s.genres, peak: +peak.toFixed(3), low: +(lo / Math.max(e, 1e-12)).toFixed(3), beats: s.lengthBeats };
      });
    });
    check('14 Techno-Sounds in der Bibliothek', techno.length === 14, techno.map((t) => t.id).join(','));
    check('Alle Techno-Sounds klingen und sind eingepegelt', techno.every((t) => t.peak > 0.3 && t.peak <= 0.7), JSON.stringify(techno.map((t) => [t.id, t.peak])));
    check('Alle Techno-Sounds tragen das Genre Techno', techno.every((t) => t.genres.includes('techno')));
    const low = Object.fromEntries(techno.map((t) => [t.id, t.low]));
    check('Kick und Rumble sind tief, Hats und Ride nicht', low['techno-kick'] > 0.4 && low['techno-rumble'] > 0.6 && low['techno-hats'] < 0.05 && low['techno-ride'] < 0.05, JSON.stringify(low));
    const allTagged = await page.evaluate(() => window.loopwerk.library.list().filter((s) => !s.id.startsWith('test-') && s.category !== 'own' && !s.id.startsWith('pat-')).every((s) => s.genres?.length > 0));
    check('Jeder mitgelieferte Sound hat mindestens ein Genre', allTagged);

    // Techno-Kit im Beat-Editor
    const kit = await page.evaluate(async () => {
      const m = await import('./src/instruments.js');
      const p = m.newDrumPattern(1);
      p.kit = 'techno';
      p.rows.crash[2] = 1;
      p.rows.tomHi[6] = 1;
      const r = await m.renderPattern(p, 120, window.loopwerk.library);
      let peak = 0;
      for (const v of r.buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { peak, labels: ['snare', 'tomLo', 'tomHi', 'crash', 'kick'].map((id) => m.drumLabel('techno', id)), kits: m.KITS.map((k) => k.id) };
    });
    check('Techno-Kit im Beat-Editor rendert', kit.kits.includes('techno') && kit.peak > 0.2, JSON.stringify(kit));
    check('Techno-Kit benennt die Zeilen passend', kit.labels.join(',') === 'Rim,Rumble,Clang,Ride,Kick', kit.labels.join(','));

    // ---------- Regal nach Genre ordnen ----------
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createEmptyProject());
    });
    await page.click('.shelf-sort [data-sort="genre"]');
    const genreView = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('.shelf-cat')].map((h) => h.textContent.replace(/\d+$/, '')),
      chips: [...document.querySelectorAll('#shelf-chips .chip')].map((c) => c.textContent),
      pressed: document.querySelector('.shelf-sort [data-sort="genre"]').getAttribute('aria-pressed'),
    }));
    check('Umschalter „Genre“ ordnet das Regal nach Genres', genreView.pressed === 'true' && genreView.heads[0].startsWith('Techno') && genreView.heads.some((h) => h.startsWith('Hip-Hop')), genreView.heads.join(' | '));
    check('Filter-Chips zeigen Genres', genreView.chips.includes('Techno') && genreView.chips.includes('House') && !genreView.chips.includes('Bass'), genreView.chips.join(','));
    await page.locator('#shelf-chips .chip', { hasText: 'Techno' }).click();
    const tech = await page.evaluate(() => [...document.querySelectorAll('#library .loop-item')].map((n) => n.dataset.sampleId));
    check('Genre-Filter „Techno“ zeigt Techno-Sounds aus allen Kategorien', tech.includes('techno-kick') && tech.includes('techno-acid') && tech.includes('drums-four') && tech.includes('sp-loop-garzul') && !tech.includes('drums-break'), `${tech.length} Sounds`);
    check('Jeder Sound erscheint im Filter nur einmal', new Set(tech).size === tech.length);
    await page.locator('#shelf-chips .chip', { hasText: 'Alle' }).click();
    await page.fill('#shelf-search', 'ambient');
    const amb = await page.evaluate(() => [...document.querySelectorAll('#library .loop-item')].map((n) => n.dataset.sampleId));
    check('Suche findet auch nach Genre', amb.includes('sp-ambi-choir') && amb.includes('chords-pad'), amb.join(','));
    await page.fill('#shelf-search', '');
    // Ein Sound in mehreren Genres: Auswahl leuchtet überall
    await page.locator('#shelf-cat-g-house').click().catch(() => {});
    await page.locator('#library .loop-item[data-sample-id="techno-hats"]').first().click();
    const armedRows = await page.evaluate(() => [...document.querySelectorAll('#library .loop-item[data-sample-id="techno-hats"]')].map((n) => n.classList.contains('armed')));
    check('Ausgewählter Sound ist in jeder Genre-Gruppe markiert', armedRows.length >= 1 && armedRows.every(Boolean), JSON.stringify(armedRows));
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready);
    check('Ordnung nach Genre wird gemerkt', await page.evaluate(() => document.querySelector('.shelf-sort [data-sort="genre"]').getAttribute('aria-pressed') === 'true'));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v14-genre.png') });
    await page.click('.shelf-sort [data-sort="cat"]');
    check('Zurück nach Kategorie', await page.evaluate(() => !!document.getElementById('shelf-cat-drums')));

    // ---------- Effekte: Verzerrer, Filter, Kompressor, Pumpen ----------
    const fxm = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { defaultFx } = await import('./src/effects.js');
      const { mulberry32 } = await import('./src/util.js');
      const sr = 44100;
      const mk = (id, secs, fill) => {
        const b = new AudioBuffer({ numberOfChannels: 2, length: secs * sr, sampleRate: sr });
        for (let c = 0; c < 2; c++) fill(b.getChannelData(c));
        library.register({ id, name: id, category: 'fx', lengthBeats: secs * 2, bpm: 120, buffer: b });
      };
      const rnd = mulberry32(9);
      mk('v-sine', 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / sr); });
      mk('v-noise', 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * 0.3; });
      mk('v-dc', 2, (d) => d.fill(1));
      mk('v-quiet', 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = 0.1 * Math.sin(2 * Math.PI * 220 * i / sr); });
      const fxWith = (id, patch) => { const f = defaultFx(); Object.assign(f[id], { on: true }, patch); return f; };
      const proj = (sampleId, fx, len = 16) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, fx, clips: [{ id: 'a', sampleId, startBeat: 0, lengthBeats: len }] }],
      });
      const render = async (p, fromBeat = 0, toBeat = 8) => (await renderProject(p, library, { limiter: false, fromBeat, toBeat })).getChannelData(0);
      const bandDb = (d, lo, hi, at = 4410) => {
        const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = d[i + at] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= N; len <<= 1) {
          const a = -2 * Math.PI / len;
          for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(a * k), wi = Math.sin(a * k);
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          }
        }
        let e = 0;
        for (let k = Math.floor(lo * N / sr); k < Math.ceil(hi * N / sr); k++) e += re[k] * re[k] + im[k] * im[k];
        return 10 * Math.log10(e + 1e-20);
      };
      const rms = (d, a, b) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return Math.sqrt(e / (b - a)); };
      const db = (x) => 20 * Math.log10(x);
      const out = {};

      const dry = await render(proj('v-sine', null));
      const harm = (d) => bandDb(d, 630, 690) - bandDb(d, 200, 240); // 3. Oberton relativ zum Grundton
      const even = (d) => bandDb(d, 420, 460) - bandDb(d, 200, 240); // 2. Oberton
      out.drive = {};
      for (const type of ['soft', 'hard', 'fuzz', 'crush']) {
        const d = await render(proj('v-sine', fxWith('drive', { type, drive: type === 'crush' ? 1 : 0.8, tone: 1 })));
        out.drive[type] = { h3: harm(d) - harm(dry), h2: even(d) - even(dry), level: db(rms(d, 4410, 44100) / rms(dry, 4410, 44100)), noise: bandDb(d, 3000, 8000) - bandDb(dry, 3000, 8000) };
      }
      const mix0 = await render(proj('v-sine', fxWith('drive', { drive: 1, mix: 0 })));
      let diff = 0; for (let i = 0; i < dry.length; i++) diff = Math.max(diff, Math.abs(mix0[i] - dry[i]));
      out.driveMix0 = diff;
      const toneDark = await render(proj('v-sine', fxWith('drive', { type: 'hard', drive: 0.8, tone: 0 })));
      const toneBright = await render(proj('v-sine', fxWith('drive', { type: 'hard', drive: 0.8, tone: 1 })));
      out.tone = bandDb(toneBright, 4000, 10000) - bandDb(toneDark, 4000, 10000);

      const nDry = await render(proj('v-noise', null));
      const lp = await render(proj('v-noise', fxWith('filter', { type: 'lowpass', cutoff: 0.3, reso: 0 })));
      const hp = await render(proj('v-noise', fxWith('filter', { type: 'highpass', cutoff: 0.6, reso: 0 })));
      const bp = await render(proj('v-noise', fxWith('filter', { type: 'bandpass', cutoff: 0.6, reso: 0.6 })));
      out.filter = {
        lpHigh: bandDb(lp, 4000, 8000) - bandDb(nDry, 4000, 8000), lpLow: bandDb(lp, 50, 150) - bandDb(nDry, 50, 150),
        hpLow: bandDb(hp, 50, 200) - bandDb(nDry, 50, 200), hpHigh: bandDb(hp, 5000, 9000) - bandDb(nDry, 5000, 9000),
        bpSides: Math.max(bandDb(bp, 50, 300) - bandDb(nDry, 50, 300), bandDb(bp, 8000, 12000) - bandDb(nDry, 8000, 12000)), bpCenter: bandDb(bp, 1400, 1700) - bandDb(nDry, 1400, 1700),
      };
      // LFO im Takt: Höhen-Energie schwankt über den Takt, und gleich, egal ob ab Takt 1 oder Takt 2 gerendert wird
      const lfoFx = fxWith('filter', { type: 'lowpass', cutoff: 0.5, reso: 0.2, lfo: '1bar', depth: 0.8 });
      const quarters = (d) => [0, 1, 2, 3].map((q) => db(rms(d, q * 22050 + 2000, (q + 1) * 22050 - 2000) + 1e-9));
      const hpF = (d) => { const o = new Float32Array(d.length); let y = 0, x1 = 0; for (let i = 0; i < d.length; i++) { y = 0.9 * (y + d[i] - x1); x1 = d[i]; o[i] = y; } return o; };
      const l1 = quarters(hpF(await render(proj('v-noise', lfoFx), 0, 8)));
      const l2 = quarters(hpF(await render(proj('v-noise', lfoFx), 4, 12)));
      out.lfo = { l1, l2, swing: Math.max(...l1) - Math.min(...l1), same: Math.max(...l1.map((v, i) => Math.abs(v - l2[i]))) };

      // Kompressor: eigener Pegel hebt an
      const cq0 = await render(proj('v-quiet', fxWith('comp', { amount: 0, gain: 0 })));
      const cq6 = await render(proj('v-quiet', fxWith('comp', { amount: 0, gain: 6, attack: 30, release: 400 })));
      out.compGain = db(rms(cq6, 22050, 66150) / rms(cq0, 22050, 66150));

      // Pumpen mit Gleichspannung: der Ausgang IST die Pegelkurve
      const pump = async (patch, fromBeat = 0) => { const pr = proj('v-dc', fxWith('pump', patch)); pr.master = { volume: 1 }; return render(pr, fromBeat, fromBeat + 8); };
      const p1 = await pump({ rate: '1/4', depth: 0.6, release: 0.5 });
      const p2 = await pump({ rate: '1/4', depth: 0.6, release: 0.5 }, 1);
      const ph = await pump({ rate: '1/2', depth: 0.6, release: 0.5 });
      const at = (d, f) => d[Math.round(f)];
      out.pump = {
        onBeat: at(p1, 200), beforeNext: at(p1, 22050 - 300), onBeat2: at(p1, 22050 + 200), fromBeat1: at(p2, 200),
        halfOn: at(ph, 200), halfOff: at(ph, 22050 + 200), halfOn2: at(ph, 44100 + 200),
      };
      return out;
    });
    const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v));
    for (const t of ['soft', 'hard', 'fuzz']) {
      const d = fxm.drive[t];
      check(`Verzerrer „${t}“: deutliche Obertöne, Lautstärke bleibt im Rahmen`, d.h3 > 20 && Math.abs(d.level) < 6, fmt(d));
    }
    check('Fuzz erzeugt auch geradzahlige Obertöne', fxm.drive.fuzz.h2 > 20, fmt(fxm.drive.fuzz));
    check('Bitcrusher erzeugt Quantisierungsrauschen', fxm.drive.crush.noise > 20, fmt(fxm.drive.crush));
    check('Verzerrer mit Anteil 0 lässt das Signal unverändert', fxm.driveMix0 < 1e-4, String(fxm.driveMix0));
    check('Ton-Regler dunkelt die Verzerrung ab', fxm.tone > 12, fxm.tone.toFixed(1) + ' dB');
    check('Tiefpass schneidet Höhen, lässt Tiefen', fxm.filter.lpHigh < -20 && Math.abs(fxm.filter.lpLow) < 3, fmt(fxm.filter));
    check('Hochpass schneidet Tiefen, lässt Höhen', fxm.filter.hpLow < -20 && Math.abs(fxm.filter.hpHigh) < 3, fmt(fxm.filter));
    check('Bandpass lässt die Mitte durch', fxm.filter.bpSides < -10 && fxm.filter.bpCenter > fxm.filter.bpSides + 10, fmt(fxm.filter));
    check('Filter-Bewegung schwankt im Takt', fxm.lfo.swing > 6, fmt(fxm.lfo));
    check('Filter-Bewegung ist am Takt ausgerichtet (gleich ab Takt 1 und Takt 2)', fxm.lfo.same < 1.5, fmt(fxm.lfo));
    check('Kompressor: Regler „Pegel“ hebt um 6 dB', Math.abs(fxm.compGain - 6) < 0.5, fxm.compGain.toFixed(2) + ' dB');
    const pm = fxm.pump;
    check('Pumpen taucht auf dem Schlag ab und kommt zurück', Math.abs(pm.onBeat - 0.4) < 0.06 && pm.beforeNext > 0.95 && Math.abs(pm.onBeat2 - 0.4) < 0.06, fmt(pm));
    check('Pumpen sitzt auch ab Schlag 2 auf dem Schlag', Math.abs(pm.fromBeat1 - 0.4) < 0.06, fmt(pm));
    check('Pumpen „jeder 2. Schlag“', Math.abs(pm.halfOn - 0.4) < 0.06 && pm.halfOff > 0.6 && Math.abs(pm.halfOn2 - 0.4) < 0.06, fmt(pm));

    // Mixer zeigt die neuen Effekte
    await page.evaluate(async () => {
      const m = await import('./src/model.js');
      window.loopwerk.store.replace(m.createDemoProject());
      window.loopwerk.mixer.setOpen(true);
    });
    const strip = page.locator('.strip[data-strip-id="t1"]');
    const toggles = await strip.locator('.fx-toggle').allTextContents();
    check('Kanalzug hat sieben Effekt-Schalter', toggles.join(',') === 'Zerr,Filter,EQ,Komp,Pump,Echo,Hall', toggles.join(','));
    await strip.locator('.fx-toggle', { hasText: 'Pump' }).click();
    check('Pumpen per Schalter an', await page.evaluate(() => window.loopwerk.store.track('t1').fx.pump.on === true));
    await page.selectOption('#fx-drive-type', 'crush');
    const dv = await page.evaluate(() => window.loopwerk.store.track('t1').fx.drive);
    check('Verzerrer-Art wählbar, schaltet ein', dv.type === 'crush' && dv.on, JSON.stringify(dv));
    const cutoffLabel = await page.locator('#fx-filter-cutoff').locator('xpath=..').locator('.fx-param-value').textContent();
    check('Filterfrequenz wird in Hz angezeigt', /Hz/.test(cutoffLabel), cutoffLabel);
    await page.click('#play-btn');
    await page.waitForTimeout(700);
    await page.click('#play-btn');
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v14-mixer.png') });
    await page.evaluate(() => window.loopwerk.mixer.setOpen(false));

    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Zwei-Finger-Zoom am Handy ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    const cdp = await page.context().newCDPSession(page);
    const a = await page.locator('#arr-scroll').boundingBox();
    const cy = a.y + a.height / 2;
    const cx = a.x + a.width * 0.6;
    const p0 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - 5 * i, y: cy, id: 1 }, { x: cx + 30 + 5 * i, y: cy, id: 2 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const p1 = await page.evaluate(() => window.loopwerk.ui.pxPerBeat);
    check('Finger auseinander zoomt hinein', p1 > p0 * 1.8, `${p0} → ${p1}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v14-zoom-mobil.png') });
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
