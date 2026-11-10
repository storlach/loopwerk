#!/usr/bin/env node
// Bezug für den Nulltest alter Projekte (ADR 013): erzeugt in einem Stand VOR der Lautheits-Tabelle einige Projekte
// (Starter Pop, Hip-Hop, Rock, Beispiel, ein gemischtes Projekt) und misst sie; tests/pegel.test.cjs lädt dieselben
// Projekte ohne `levels` im neuen Stand und vergleicht.
// Aufruf:  node tools/klang/pegel-bezug.cjs --repo <alter-stand> [--out tests/fixtures/pegel-alt.json]
// Beispiel: git archive 32c342e | tar -x -C /tmp/alt && node tools/klang/pegel-bezug.cjs --repo /tmp/alt
// Nur neu erzeugen, wenn sich der Klang der Sounds gewollt ändert (dann auch im Bericht erklären).
const fs = require('fs');
const path = require('path');

const HILFE = `Bezug für den Nulltest alter Projekte (ADR 013).

  node tools/klang/pegel-bezug.cjs --repo <alter-stand> [--out <datei>]

<alter-stand>: Ordner mit einem Loopwerk-Stand vor ADR 013 (z. B. ausgepacktes "git archive <commit>"), dessen
Server und Sounds gemessen werden; die Messung selbst kommt aus diesem Repo (tests/pegel-mess.cjs).
--out: Zieldatei (Voreinstellung tests/fixtures/pegel-alt.json). Inhalt: je Projekt die Projektdatei (ohne levels),
Takt-Bereich, Effektivwert je 100 ms je Kanal (dB, ohne Limiter) und integrierte Lautheit je Spur.
Exit-Code: 0 = geschrieben, 1 = Bedien- oder Messfehler.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || !args.length) { console.log(HILFE); process.exit(args.length ? 0 : 1); }
const opt = (name, def = null) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; if (!v || v.startsWith('--')) { console.error(`Fehler: ${name} braucht einen Wert.`); process.exit(1); } return v; };
for (let i = 0; i < args.length; i++) { if (['--repo', '--out'].includes(args[i])) { i++; continue; } console.error(`Fehler: unbekannte Option ${args[i]}\n\n${HILFE}`); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');
const OLD = opt('--repo') && path.resolve(opt('--repo'));
const OUT = path.resolve(opt('--out', path.join(ROOT, 'tests', 'fixtures', 'pegel-alt.json')));
if (!OLD || !fs.existsSync(path.join(OLD, 'tests', 'harness.cjs'))) { console.error('Fehler: --repo muss ein Loopwerk-Stand sein (tests/harness.cjs fehlt).'); process.exit(1); }
if (fs.existsSync(path.join(OLD, 'src', 'levels.js'))) { console.error('Fehler: der Stand hat schon src/levels.js – der Bezug muss VOR ADR 013 entstehen.'); process.exit(1); }

const RANGES = { pop: [64, 128], hiphop: [64, 128], rock: [64, 128], demo: [0, 64], gemischt: [0, 32] };

(async () => {
  const { openApp } = require(path.join(OLD, 'tests', 'harness.cjs'));
  const { makeOldProjects, measureProject } = require(path.join(ROOT, 'tests', 'pegel-mess.cjs'));
  const app = await openApp({ fresh: true });
  app.page.setDefaultTimeout(1800000);
  const out = { erzeugt: new Date().toISOString().slice(0, 10), stand: path.basename(OLD), projekte: {} };
  try {
    const projects = await makeOldProjects(app.page);
    for (const [id, project] of Object.entries(projects)) {
      const [fromBeat, toBeat] = RANGES[id];
      const m = await measureProject(app.page, project, { fromBeat, toBeat });
      out.projekte[id] = { project, fromBeat, toBeat, ...m };
      console.log(`${id.padEnd(10)} ${m.blocks.length} Blöcke, Spuren: ${Object.entries(m.tracks).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    }
  } catch (err) {
    console.error('Messfehler:', err.message);
    await app.close();
    process.exit(1);
  }
  if (app.errors.length) console.error('Konsolenfehler:', app.errors.slice(0, 5).join(' | '));
  await app.close();
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`geschrieben: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} kB)`);
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
