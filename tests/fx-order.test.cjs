// Tests für die Effekt-Reihenfolge (2.14, ADR 008): node tests/fx-order.test.cjs [--ref] [--shots]
// --ref schreibt die Referenz tests/fixtures/fx-legacy.f32 (nur mit dem Stand vor 2.14 erzeugen!).
const path = require('path');
const fs = require('fs');
const { openApp, createChecker } = require('./harness.cjs');

const REF = process.argv.includes('--ref');
const REF_PATH = path.join(__dirname, 'fixtures', 'fx-legacy.f32');
const { check, finish } = createChecker();

// Läuft im Browser: Demo-Projekt, alle sieben Spur-Effekte auf „Drums“, Master mit EQ und Hall; Schlag 16–24, 22,05 kHz.
// extra(p) ergänzt neue Felder (fxOrder, sends) für die Gleichheits-Prüfung.
function renderLegacy(extra) {
  return (async () => {
    const m = await import('./src/model.js');
    const { EFFECT_IDS } = await import('./src/effects.js');
    const { library, renderProject } = window.loopwerk;
    const p = m.createDemoProject();
    p.tracks[0].fx = Object.fromEntries(EFFECT_IDS.map((id) => [id, { on: true }]));
    p.master = { volume: 0.85, fx: { eq: { on: true, low: 3, high: -2 }, hall: { on: true } } };
    if (extra === 'fields') {
      p.tracks[0].fxOrder = EFFECT_IDS.slice();
      p.tracks[0].sends = {};
      p.master.fxOrder = EFFECT_IDS.slice();
    }
    await library.ensureProject?.(p);
    const b = await renderProject(p, library, { sampleRate: 22050, limiter: false, fromBeat: 16, toBeat: 24 });
    const out = new Float32Array(b.length * 2);
    out.set(b.getChannelData(0), 0);
    out.set(b.getChannelData(1), b.length);
    return Array.from(out);
  })();
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

(async () => {
  const app = await openApp({ viewport: { width: 1400, height: 900 } });
  const { page } = app;
  try {
    // ---------- 1. Null-Test alter Projekte ----------
    const now = new Float32Array(await page.evaluate(renderLegacy, null));
    if (REF) {
      fs.mkdirSync(path.dirname(REF_PATH), { recursive: true });
      fs.writeFileSync(REF_PATH, Buffer.from(now.buffer));
      let pk = 0; for (const v of now) pk = Math.max(pk, Math.abs(v));
      console.log(`Referenz geschrieben: ${REF_PATH} (${now.length} Werte, Spitze ${pk.toFixed(3)})`);
      return;
    }
    const raw = fs.readFileSync(REF_PATH);
    const ref = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let diff = 0, peak = 0;
    for (let i = 0; i < ref.length; i++) { diff = Math.max(diff, Math.abs(ref[i] - (now[i] ?? 0))); peak = Math.max(peak, Math.abs(ref[i])); }
    check('Null-Test: altes Projekt klingt wie vor 2.14 (Differenz < −90 dB)', ref.length === now.length && db(diff) < -90 && peak > 0.05,
      `Differenz ${db(diff).toFixed(1)} dB, Spitze ${peak.toFixed(3)}, Längen ${ref.length}/${now.length}`);
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
    if (!REF) finish();
  }
})();
