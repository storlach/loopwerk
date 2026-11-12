// Ruhe und Tempo der Oberfläche (Analyse docs/analyse/2026-11-performance.md, 3.1, 3.3, 4.1).
// Geprüft wird Verhalten statt Uhr, wo es geht: Schreibvorgänge im Stillstand, Layout-Lesen je Bild,
// Clip-Knoten und Leinwandfläche im Arranger. Zeitgrenzen sind bewusst weit (die Maschine ist oft belastet).
// node tests/perf-ui.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Läuft im Browser: großer Song (16 Spuren, n Clips zu je einem Takt), Sounds aus dem Beispiel
async function bigSong(n) {
  const { store, library } = window.loopwerk;
  const ids = ['drums-four', 'drums-hats16', 'bass-prog', 'chords-pad', 'synth-arp-prog', 'synth-lead', 'fx-riser', 'fx-crash'];
  const per = Math.ceil(n / 16);
  let k = 0;
  store.replace({
    version: 1, name: 'Mess-Song', bpm: 120, beatsPerBar: 4, lengthBars: Math.max(56, per), loop: { on: false, startBeat: 0, endBeat: 16 },
    tracks: Array.from({ length: 16 }, (_, i) => ({
      id: 't' + (i + 1), name: 'Spur ' + (i + 1), volume: 0.6, pan: 0, mute: false, solo: false,
      clips: Array.from({ length: per }, (_, j) => ({ id: 'c' + (++k), sampleId: ids[i % ids.length], startBeat: j * 4, lengthBeats: 4, offsetBeats: 0 })),
    })),
  });
  await library.ensureProject(store.project);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// Läuft im Browser: alle DOM-Änderungen über ms zählen (Texte, Stile, Klassen, Knoten)
function mutations(ms) {
  return new Promise((res) => {
    const seen = {};
    let n = 0;
    const mo = new MutationObserver((l) => {
      for (const m of l) { n++; const k = `${m.type}:${m.attributeName || ''}:${m.target.id || m.target.className || m.target.nodeName}`; seen[k] = (seen[k] || 0) + 1; }
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res({ n, top: Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 4) }); }, ms);
  });
}

// Läuft im Browser: wie oft je Bild Maße aus dem Layout gelesen werden (jedes Lesen nach einer Änderung erzwingt
// eine Layout-Rechnung). Zählt über ms, liefert Lesezugriffe je Bild und die häufigsten Stellen.
function layoutReads(ms) {
  const props = ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent', 'clientWidth', 'clientHeight', 'scrollLeft', 'scrollTop'];
  const restore = [];
  let reads = 0;
  const where = {};
  const note = (name) => {
    reads++;
    const line = (new Error().stack || '').split('\n')[3] || '';
    const k = `${name} ${line.replace(/^.*\/src\//, '').replace(/\)$/, '')}`;
    where[k] = (where[k] || 0) + 1;
  };
  for (const p of props) {
    for (const proto of [HTMLElement.prototype, Element.prototype]) {
      const d = Object.getOwnPropertyDescriptor(proto, p);
      if (!d?.get) continue;
      Object.defineProperty(proto, p, { ...d, get() { note(p); return d.get.call(this); } });
      restore.push(() => Object.defineProperty(proto, p, d));
    }
  }
  const gbr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { note('rect'); return gbr.call(this); };
  restore.push(() => { Element.prototype.getBoundingClientRect = gbr; });
  return new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const f = (now) => { frames++; if (now - t0 < ms) requestAnimationFrame(f); else { restore.forEach((r) => r()); res({ frames, reads, perFrame: reads / Math.max(1, frames), top: Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 4) }); } };
    requestAnimationFrame(f);
  });
}

const lcd = (page) => page.evaluate(() => ['lcd-bar', 'lcd-beat', 'lcd-time'].map((id) => document.getElementById(id).textContent).join(' '));

(async () => {
  // ---------- Handy-Größe: Stillstand und Anzeige ----------
  const app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const { page, errors } = app;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const metric = async (name) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name).value;
    await page.waitForTimeout(1200);

    // Stillstand: keine Arbeit je Bild (vorher 59 Layouts und drei Texte je Bild)
    let l0 = await metric('LayoutCount');
    let mut = await page.evaluate(mutations, 2000);
    let layouts = (await metric('LayoutCount')) - l0;
    check('Stillstand (Beispiel): kaum DOM-Schreibvorgänge in 2 s', mut.n <= 3, JSON.stringify(mut));
    check('Stillstand (Beispiel): kaum Layout-Rechnungen in 2 s', layouts <= 3, String(layouts));

    // Anzeige stimmt sofort: Spulen, Tempo, Rückgängig, Abspielen
    await page.evaluate(() => window.loopwerk.engine.setPosition(16));
    await page.waitForTimeout(120);
    check('Spulen: Anzeige zeigt Takt 5, Schlag 1, 0:08.0', (await lcd(page)) === '005 1 0:08.0', await lcd(page));
    await page.evaluate(() => window.loopwerk.store.setBpm(60));
    await page.waitForTimeout(120);
    check('Tempowechsel: Zeit folgt sofort (0:16.0)', (await lcd(page)) === '005 1 0:16.0', await lcd(page));
    await page.evaluate(() => window.loopwerk.store.undo());
    await page.waitForTimeout(120);
    check('Rückgängig: Zeit wieder 0:08.0', (await lcd(page)) === '005 1 0:08.0', await lcd(page));
    const before = await page.evaluate(() => document.querySelector('.playhead').style.transform);
    await page.evaluate(() => window.loopwerk.engine.play());
    await page.waitForTimeout(700);
    const playing = await lcd(page);
    const after = await page.evaluate(() => document.querySelector('.playhead').style.transform);
    check('Abspielen: Anzeige und Marke laufen', playing !== '005 1 0:08.0' && after !== before, `${playing} · ${before} → ${after}`);

    // Abspielen: Licht und Anzeige lesen je Bild nichts aus dem Layout (vorher je Spur offsetTop/-Height, Marke, Pegel)
    const rd = await page.evaluate(layoutReads, 2000);
    check('Abspielen: kein Layout-Lesen je Bild (Licht, Anzeige, Marke)', rd.perFrame < 0.5, JSON.stringify({ perFrame: +rd.perFrame.toFixed(2), frames: rd.frames, top: rd.top }));
    await page.evaluate(() => window.loopwerk.engine.pause());
    await page.waitForTimeout(300);
    check('Pause: Anzeige bleibt an der gehörten Stelle stehen', (await lcd(page)) !== '005 1 0:08.0', await lcd(page));

    // Großer Song im Stillstand: ebenfalls Ruhe (vorher 98 % Hauptthread am gedrosselten Handy)
    await page.evaluate(bigSong, 448);
    // Das Beispiel startet mit Mastering an: die Lautheitsmessung des neuen Songs abwarten, sie schreibt einmal ihr Ergebnis
    await page.waitForFunction(() => !window.loopwerk.mastering?.state?.busy, null, { timeout: 120000 }).catch(() => null);
    await page.waitForTimeout(1200);
    l0 = await metric('LayoutCount');
    mut = await page.evaluate(mutations, 2000);
    layouts = (await metric('LayoutCount')) - l0;
    check('Stillstand (448 Clips): kaum DOM-Schreibvorgänge in 2 s', mut.n <= 3, JSON.stringify(mut));
    check('Stillstand (448 Clips): kaum Layout-Rechnungen in 2 s', layouts <= 3, String(layouts));

    // Raumlicht ohne Grafikchip: sparsam (in der Stille kein neues Bild); dauerhaft zu langsam → nur noch Lichtleiste
    const gl = await page.evaluate(() => window.loopwerk.glow.state);
    if (gl.software) {
      // „aus“ ist ebenfalls richtig: war das Bild hier schon über Sekunden zu langsam, hat das Licht weiter gespart
      check('Software-Grafik: Raumlicht sparsam (nicht in voller Fassung)', gl.mode === 'lean' || gl.mode === 'off', gl.mode);
      const n0 = gl.room.n;
      await page.waitForTimeout(1500);
      const n1 = await page.evaluate(() => window.loopwerk.glow.state.room.n);
      check('Sparsam: in der Stille zeichnet das Raumlicht nicht weiter', gl.mode === 'off' || n1 - n0 <= 1, `${n0} → ${n1}`);
    } else check('Mit Grafikchip: Raumlicht in voller Fassung', gl.mode === 'full', gl.mode);
    await page.evaluate(() => window.loopwerk.store.replace(window.loopwerk.store.project)); // Song bleibt, nur zur Ruhe
    const slow = await page.evaluate(async () => {
      const { glow, engine } = window.loopwerk;
      glow.setMode('full');
      glow.setMode('auto');
      if (glow.state.mode === 'full') glow.setMode('lean'); // eine Stufe über „aus“
      glow.setMode('auto');
      engine.setPosition(0);
      await engine.play();
      // bis 9 s lang jedes Bild künstlich auf gut 40 ms dehnen
      const t0 = performance.now();
      await new Promise((r) => { const f = () => { const s = performance.now(); while (performance.now() - s < 42); if (performance.now() - t0 < 9000 && glow.state.mode !== 'off') requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      const wasPlaying = engine.playing;
      engine.pause();
      return { wasPlaying, mode: glow.state.mode, hidden: document.querySelector('.ambient').hidden, frameMs: +glow.state.frameMs.toFixed(1), slowFor: glow.state.slowFor, fixed: glow.state.fixed, ms: Math.round(performance.now() - t0) };
    });
    check('Dauerhaft zu langsam: Raumlicht schaltet stufenweise ab', slow.mode === 'off' && slow.hidden, JSON.stringify(slow));
    await page.evaluate(() => window.loopwerk.glow.setMode('auto'));
    check('Keine Konsolenfehler (Handy)', errors.length === 0, errors.join(' | '));
  } finally {
    await app.close();
  }

  // ---------- Arranger: nur zeichnen, was man sieht ----------
  for (const dev of ['desktop', 'handy']) {
    const mobile = dev === 'handy';
    const a2 = await openApp(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
    try {
      const { page, errors } = a2;
      await page.evaluate(bigSong, 448);
      await page.waitForTimeout(600);
      // Clips im Bild (aus dem Modell) und Clips im DOM
      const view = () => page.evaluate(() => {
        const { store, ui } = window.loopwerk;
        const sc = document.getElementById('arr-scroll');
        const box = sc.getBoundingClientRect();
        const dom = new Set([...sc.querySelectorAll('.clip')].map((n) => n.dataset.clipId));
        const head = parseFloat(getComputedStyle(document.querySelector('.arr-grid')).getPropertyValue('--head-w'));
        const missing = [];
        for (const t of store.project.tracks) {
          const lane = sc.querySelector(`.lane[data-track-id="${t.id}"]`).getBoundingClientRect();
          if (lane.bottom <= box.top + 60 || lane.top >= box.bottom) continue;
          for (const c of t.clips) {
            const x0 = lane.left + c.startBeat * ui.pxPerBeat;
            const x1 = x0 + c.lengthBeats * ui.pxPerBeat;
            if (x1 > box.left + head && x0 < box.right && !dom.has(c.id)) missing.push(c.id);
          }
        }
        let px = 0;
        for (const c of sc.querySelectorAll('canvas')) px += c.width * c.height;
        return { dom: [...dom], missing, mb: +(px * 4 / 1e6).toFixed(1), left: sc.scrollLeft, names: [...sc.querySelectorAll('.lane[aria-label]')].reduce((n, l) => n + (l.getAttribute('aria-label').split(' – ')[1]?.split('; ').length ?? 0), 0) };
      });
      let v = await view();
      check(`${dev}: deutlich weniger Clip-Knoten als Clips (448)`, v.dom.length < 448 * 0.8 /* Layout „reiter“: der Arranger läuft über die ganze Fensterbreite, also mehr Clips im Bild */, String(v.dom.length));
      check(`${dev}: jeder Clip im Bild ist gezeichnet`, v.missing.length === 0, JSON.stringify(v.missing.slice(0, 5)));
      check(`${dev}: Namen aller Clips bleiben für Screenreader erreichbar`, v.names === 448, String(v.names));
      const before = new Set(v.dom);
      const keepId = v.dom[0];
      await page.evaluate((id) => window.loopwerk.ui.select(id), keepId);
      await page.evaluate(() => { document.getElementById('arr-scroll').scrollLeft += 1400; });
      await page.waitForTimeout(400);
      v = await view();
      const fresh = v.dom.filter((id) => !before.has(id)).length;
      check(`${dev}: beim Scrollen wandern die Clip-Knoten mit`, fresh > 10 && v.missing.length === 0 && v.dom.length < 448 * 0.98 /* Layout „reiter“: volle Breite und (Scheibe 5) ohne Fachleiste mehr Höhe, nach dem Scrollen bleiben alte und neue Knoten kurz nebeneinander */, JSON.stringify({ fresh, missing: v.missing.length, dom: v.dom.length, left: v.left }));
      check(`${dev}: der gewählte Clip bleibt im DOM (auch außerhalb des Bildes)`, await page.evaluate((id) => !!document.querySelector(`.clip.selected[data-clip-id="${id}"]`), keepId));
      // revealClip holt einen fernen Clip ins Bild und zeichnet ihn
      const far = await page.evaluate(() => { const t = window.loopwerk.store.project.tracks[3]; return t.clips[t.clips.length - 1].id; });
      const shown = await page.evaluate((id) => {
        window.loopwerk.arranger.revealClip(id);
        const n = document.querySelector(`.clip[data-clip-id="${id}"]`);
        const b = document.getElementById('arr-scroll').getBoundingClientRect();
        const r = n?.getBoundingClientRect();
        return !!r && r.left >= b.left - 1 && r.right <= b.right + 1;
      }, far);
      check(`${dev}: revealClip holt einen fernen Clip ins Bild`, shown);
      // Zoom: Leinwandfläche bleibt begrenzt (vorher am Handy bis 496 MB)
      await page.evaluate(() => window.loopwerk.arranger.zoomTo(192));
      await page.waitForTimeout(500);
      v = await view();
      check(`${dev}: Leinwand-Speicher bei größtem Zoom unter 70 MB`, v.mb < 70 && v.missing.length === 0, JSON.stringify({ mb: v.mb, missing: v.missing.length }));
      await page.evaluate(() => window.loopwerk.arranger.zoomTo(24));
      await page.waitForTimeout(300);
      if (mobile) {
        // Zoom-Schritt am gedrosselten Handy (vorher 2,8–4,6 s); Grenze weit, damit Last nicht stört
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const zs = await page.evaluate(async () => {
          const t = [];
          for (const z of [32, 44, 60, 80, 60, 44, 32, 24]) {
            const t0 = performance.now();
            window.loopwerk.arranger.zoomTo(z);
            t.push(performance.now() - t0);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          }
          return t.sort((a, b) => a - b);
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const med = zs[Math.floor(zs.length / 2)];
        check('Handy (CPU 4×): Zoom-Schritt mit 448 Clips unter 1 s (Median)', med < 1000, `${zs.map((x) => Math.round(x)).join(' / ')} ms`);
      } else {
        // Rahmen aufziehen (auf freier Fläche hinter den Clips beginnen): wählt nach dem Modell aus
        const box = await page.evaluate(() => {
          const { store, ui } = window.loopwerk;
          const sc = document.getElementById('arr-scroll');
          const end = Math.max(...store.project.tracks[0].clips.map((c) => c.startBeat + c.lengthBeats)) * ui.pxPerBeat;
          sc.scrollLeft = Math.max(0, end - 300);
          sc.scrollTop = 0;
          return { end };
        });
        await page.waitForTimeout(300);
        const m = await page.evaluate(({ end }) => {
          const { store, ui } = window.loopwerk;
          const sc = document.getElementById('arr-scroll');
          const l1 = sc.querySelector('.lane[data-track-id="t1"]').getBoundingClientRect();
          const l3 = sc.querySelector('.lane[data-track-id="t3"]').getBoundingClientRect();
          const x = l1.left + end + 40;
          const x0 = x - 300;
          const want = store.project.tracks.slice(0, 3).flatMap((t) => t.clips.filter((c) => l1.left + (c.startBeat + c.lengthBeats) * ui.pxPerBeat > x0 && l1.left + c.startBeat * ui.pxPerBeat < x)).length;
          return { x, x0, y: l1.top + l1.height / 2, y1: l3.top + l3.height / 2, want, free: !document.elementFromPoint(x, l1.top + l1.height / 2)?.closest('.clip') };
        }, box);
        await page.evaluate(() => window.loopwerk.ui.select(null));
        await page.mouse.move(m.x, m.y);
        await page.mouse.down();
        await page.mouse.move(m.x - 40, m.y + 4, { steps: 3 });
        await page.mouse.move(m.x0, m.y1, { steps: 6 });
        await page.mouse.up();
        const got = await page.evaluate(() => window.loopwerk.ui.selectedIds().length);
        check('Desktop: Rahmen wählt alle berührten Clips (nach dem Modell)', m.free && got === m.want && got > 0, `${got} von ${m.want}`);
        // Loslassen nach dem Ziehen (vorher 1,0 s): nur der gezogene Clip wird neu gebaut
        await page.evaluate(() => window.loopwerk.ui.select(null));
        const c = await page.evaluate(() => { const n = document.querySelector('#arr-scroll .lane[data-track-id="t2"] .clip'); const r = n.getBoundingClientRect(); return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2, id: n.dataset.clipId }; });
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(c.x + i * 12, c.y);
        const added = await page.evaluate(() => { window.__added = 0; window.__mo = new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes) if (n.classList?.contains('clip')) window.__added++; }); window.__mo.observe(document.getElementById('arr-scroll'), { childList: true, subtree: true }); });
        const t0 = Date.now();
        await page.mouse.up();
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const ms = Date.now() - t0;
        const rebuilt = await page.evaluate(() => { window.__mo.disconnect(); return window.__added; });
        check('Desktop: Loslassen nach dem Ziehen baut nur den gezogenen Clip neu', rebuilt <= 1, String(rebuilt));
        check('Desktop: Loslassen bis zum Bild unter 500 ms', ms < 500, `${ms} ms`);
        void added;
      }
      check(`Keine Konsolenfehler (${dev}, 448 Clips)`, errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await a2.close();
    }
  }
  finish();
})();
