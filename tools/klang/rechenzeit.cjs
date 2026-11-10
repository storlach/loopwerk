#!/usr/bin/env node
// Rechenaufwand der synthetischen Bibliothek: zwei Stände abwechselnd rendern (Uhrzeit) und die erzeugten Audio-Knoten zählen
// (deterministisch, unabhängig von der Last der Maschine).
// Aufruf:  node tools/klang/rechenzeit.cjs <alter-stand> [<neuer-stand>] [--runden 4]
// Beispiel: git archive HEAD | tar -x -C /tmp/alt && node tools/klang/rechenzeit.cjs /tmp/alt
const fs = require('fs');
const path = require('path');

const HILFE = `Rechenaufwand der synthetischen Bibliothek (alle Loop-Definitionen außer Gitarren) im Vergleich zweier Stände.

  node tools/klang/rechenzeit.cjs <alter-stand> [<neuer-stand>] [--runden N]

<alter-stand>/<neuer-stand>: Ordner mit einem Loopwerk-Stand (tests/harness.cjs), z. B. ausgepacktes "git archive HEAD";
neuer Stand = dieses Repo, wenn nicht angegeben. --runden: Paare alt/neu für die Uhrzeit (Voreinstellung 4, Reihenfolge
wechselt je Runde). Ausgabe: Millisekunden je Lauf, Verhältnis neu/alt der Summen, Knoten je Art und "teure" Knoten
(Oszillator, Biquad, WaveShaper, Pufferquelle). Die Uhrzeit schwankt auf belasteten Maschinen stark; die Knotenzahl nicht.
Exit-Code: 0 = gemessen, 1 = Bedien- oder Messfehler.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || !args.length) { console.log(HILFE); process.exit(args.length ? 0 : 1); }
const ri = args.indexOf('--runden');
const rounds = ri >= 0 ? Number(args[ri + 1]) : 4;
if (!(rounds >= 1)) { console.error('Fehler: --runden braucht eine Zahl ≥ 1'); process.exit(1); }
const dirs = args.filter((a, i) => !a.startsWith('--') && (ri < 0 || i !== ri + 1)).map((d) => path.resolve(d));
if (dirs.length < 1 || dirs.length > 2) { console.error(`Fehler: einen oder zwei Stände angeben.\n\n${HILFE}`); process.exit(1); }
const OLD = dirs[0];
const NEW = dirs[1] ?? path.join(__dirname, '..', '..');
for (const d of [OLD, NEW]) if (!fs.existsSync(path.join(d, 'tests', 'harness.cjs'))) { console.error(`Fehler: ${d} ist kein Loopwerk-Stand`); process.exit(1); }
const HEAVY = ['createOscillator', 'createBiquadFilter', 'createWaveShaper', 'createBufferSource'];

async function once(repo, count) {
  const { openApp } = require(path.join(repo, 'tests', 'harness.cjs'));
  const app = await openApp({ fresh: true });
  app.page.setDefaultTimeout(3600000);
  try {
    return await app.page.evaluate(async (count) => {
      const counts = {};
      if (count) {
        const P = BaseAudioContext.prototype;
        for (const k of Object.getOwnPropertyNames(P)) {
          if (!k.startsWith('create') || typeof P[k] !== 'function') continue;
          const f = P[k];
          P[k] = function (...a) { counts[k] = (counts[k] || 0) + 1; return f.apply(this, a); };
        }
      }
      const S = await import('./src/samples.js');
      const lib = await S.buildLibrary({ catalogs: true });
      const ids = lib.list().filter((s) => s.def && !s.id.startsWith('gtr-')).map((s) => s.id);
      const t0 = performance.now();
      for (const id of ids) await lib.ensure(id);
      return { ms: Math.round(performance.now() - t0), counts };
    }, count);
  } finally { await app.close(); }
}

(async () => {
  const t = { alt: [], neu: [] };
  for (let r = 0; r < rounds; r++) {
    for (const [k, repo] of r % 2 ? [['neu', NEW], ['alt', OLD]] : [['alt', OLD], ['neu', NEW]]) {
      t[k].push((await once(repo, false)).ms);
      console.log(`Runde ${r + 1} ${k}: ${t[k].at(-1)} ms`);
    }
  }
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  console.log(`Uhrzeit neu/alt (Summe): ${(sum(t.neu) / sum(t.alt)).toFixed(3)}`);
  const a = (await once(OLD, true)).counts, b = (await once(NEW, true)).counts;
  const heavy = (c) => HEAVY.reduce((s, k) => s + (c[k] || 0), 0);
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) console.log(`${k.padEnd(24)} ${a[k] || 0} → ${b[k] || 0}`);
  console.log(`teure Knoten: ${heavy(a)} → ${heavy(b)} (${((heavy(b) / heavy(a) - 1) * 100).toFixed(1)} %)`);
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
