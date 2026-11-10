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
  finish();
})();
