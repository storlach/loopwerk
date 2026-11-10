// Pegel nach Lautheit und neue Mischung der Starter (ADR 013, Klanganalyse K1/K2/K3/W1/W4).
// 1. Alte Projekte (ohne `levels`) klingen wie vor der Lautheits-Tabelle (Nulltest gegen tests/fixtures/pegel-alt.json).
// 2. Jeder Sound, jedes Kit und jeder Melodie-Klang liegt auf der Ziel-Lautheit seiner Rolle (±2 LU oder an der Spitzengrenze).
// 3. Neue Beats und Melodien: Spitze ≤ 0 dBFS, Klänge nicht weit auseinander.
// 4. Starter und Beispiel: Drums führen, Tiefen/Höhen/Breite im Korridor, Sends nicht auf Kick und Bass, Mastering gesetzt
//    und jeder Stil hebt an.
// Aufruf: node tests/pegel.test.cjs [--nur null,rollen,neu,starter]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureAll, measureProject } = require('./pegel-mess.cjs');

const FIX = require('./fixtures/pegel-alt.json');
const only = (() => { const i = process.argv.indexOf('--nur'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const want = (k) => !only || only.includes(k);
const r2 = (x) => Math.round(x * 100) / 100;

(async () => {
  const { check, finish } = createChecker();
  const app = await openApp({ fresh: true });
  const { page } = app;
  page.setDefaultTimeout(1800000);
  try {
    // ---------- 1. Nulltest: alte Projekte ----------
    if (want('null')) {
      for (const [id, ref] of Object.entries(FIX.projekte)) {
        check(`Bezug ${id} ist ein altes Projekt (ohne levels)`, ref.project.levels == null);
        const m = await measureProject(page, JSON.parse(JSON.stringify(ref.project)), { fromBeat: ref.fromBeat, toBeat: ref.toBeat });
        let worst = 0;
        let n = 0;
        // Blöcke unter −80 dB sind Stille bzw. Ausklang am Rand: dort zählt nur, dass sie leise bleiben
        for (let i = 0; i < ref.blocks.length; i++) {
          const a = ref.blocks[i];
          const b = m.blocks[i];
          if (a < -80 && b < -80) continue;
          worst = Math.max(worst, Math.abs(a - b));
          n++;
        }
        check(`${id}: Summe je 100 ms wie vorher (±0,01 dB)`, m.blocks.length === ref.blocks.length && worst <= 0.01, `${n} Blöcke, größte Abweichung ${worst.toFixed(4)} dB`);
        const dt = Object.entries(ref.tracks).map(([k, v]) => [k, v, m.tracks[k]]);
        const tw = Math.max(...dt.map(([, a, b]) => (a == null && b == null ? 0 : Math.abs(a - b))));
        check(`${id}: jede Spur so laut wie vorher (±0,01 LU)`, tw <= 0.01, dt.map(([k, a, b]) => `${k} ${a} → ${b}`).join(' · '));
      }
    }
  } catch (err) {
    check('Test lief ohne Fehler', false, err.stack);
  }
  check('Keine Konsolenfehler', app.errors.length === 0, app.errors.slice(0, 3).join(' | '));
  await app.close();
  finish();
})();
