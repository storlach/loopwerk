// Tempo eines Sounds: im Inspektor festlegen (Zahl, ÷2, ×2), als Song-Tempo übernehmen, Rückgängig, Speichern.
// node tests/sound-tempo.test.cjs [--shots]
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    // Eigener Einzelklang von genau 2 s mit Klicks im Abstand 0,5 s (bei 120 BPM = Viertel)
    const cid = await page.evaluate(async () => {
      const { library, store, ui } = window.loopwerk;
      const sr = 44100;
      const orig = new AudioBuffer({ numberOfChannels: 1, length: 2 * sr, sampleRate: sr });
      const d = orig.getChannelData(0);
      for (let k = 0; k < 4; k++) d[k * sr / 2] = 0.9;
      await library.add({ id: 'own-tempo', name: 'Mein Beat', category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', orig, duration: 2 });
      store.setBpm(120);
      const t = store.project.tracks[0].id;
      const id = store.addClip(t, 'own-tempo', 64, library.get('own-tempo').lengthBeats);
      ui.select(id);
      return id;
    });
    await page.waitForTimeout(300);
    const st = () => page.evaluate(() => {
      const s = window.loopwerk.library.get('own-tempo');
      return { kind: s.kind, beats: s.beats, len: s.lengthBeats, dur: +(s.buffer.duration).toFixed(3), out: document.getElementById('insp-stempo-out').textContent, map: window.loopwerk.store.project.sampleTempo || {} };
    });
    let s0 = await st();
    check('Einzelklang: Inspektor bietet Tempo an', s0.kind === 'oneshot' && /Einzelklang/.test(s0.out), JSON.stringify(s0));
    await page.fill('#insp-stempo', '120');
    await page.press('#insp-stempo', 'Enter');
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').kind === 'loop');
    await page.waitForTimeout(150);
    let s1 = await st();
    check('120 BPM: wird Loop mit 4 Schlägen, 2 s lang', s1.kind === 'loop' && s1.beats === 4 && s1.len === 4 && Math.abs(s1.dur - 2) < 0.01 && /^120 BPM · 4 Schläge$/.test(s1.out), JSON.stringify(s1));
    if (SHOTS) await page.locator('#insp').screenshot({ path: `${DIR}/sound-tempo.png` });
    await page.click('#insp-stempo-double');
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').beats === 8);
    s1 = await st();
    check('×2: 240 BPM = 8 Schläge, im Song-Tempo 4 s', s1.beats === 8 && Math.abs(s1.dur - 4) < 0.01, JSON.stringify(s1));
    await page.click('#insp-stempo-half');
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').beats === 4);
    check('÷2: zurück auf 120 BPM', (await st()).beats === 4);
    // Krummes Tempo: 100 BPM → 3,25 Schläge (Viertelraster), dann als Song-Tempo übernehmen
    await page.fill('#insp-stempo', '100');
    await page.press('#insp-stempo', 'Enter');
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').beats === 3.25);
    await page.click('#insp-stempo-song');
    await page.waitForFunction(() => window.loopwerk.store.project.bpm === 97.5, null, { timeout: 15000 });
    await page.waitForFunction(() => window.loopwerk.library.bpm === 97.5 && Math.abs(window.loopwerk.library.get('own-tempo').buffer.duration - 2) < 0.01, null, { timeout: 60000 }).catch(() => {});
    s1 = await st();
    check('„Als Song-Tempo“: Song läuft im Tempo des Sounds, Sound ungedehnt', Math.abs(s1.dur - 2) < 0.01, JSON.stringify(s1));
    // Zurücksetzen und Rückgängig
    await page.click('#insp-stempo-reset');
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').kind === 'oneshot');
    check('„Wie geliefert“: wieder Einzelklang', (await st()).kind === 'oneshot');
    await page.evaluate(() => window.loopwerk.store.undo());
    await page.waitForFunction(() => window.loopwerk.library.get('own-tempo').beats === 3.25);
    check('Rückgängig stellt das eigene Tempo wieder her', (await st()).map['own-tempo'] === 3.25);
    // Projektdatei: Tempo bleibt erhalten
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(window.loopwerk.store.project)));
    check('Projekt speichert das Sound-Tempo', saved.sampleTempo?.['own-tempo'] === 3.25);
    // Erzeugte Loops: kein Tempo-Feld, „folgt dem Song“
    const gen = await page.evaluate(async () => {
      const { library, store, ui } = window.loopwerk;
      const s = library.list().find((x) => x.def);
      await library.ensure(s.id);
      const id = store.addClip(store.project.tracks[0].id, s.id, 96, s.lengthBeats);
      ui.select(id);
      await new Promise((r) => setTimeout(r, 200));
      return { out: document.getElementById('insp-stempo-out').textContent, hidden: document.getElementById('insp-stempo').hidden };
    });
    check('Erzeugter Loop: „folgt dem Song“, kein Eingabefeld', gen.out === 'folgt dem Song' && gen.hidden, JSON.stringify(gen));
    void cid;
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
