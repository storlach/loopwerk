#!/usr/bin/env node
// Pegel nach Lautheit (Klanganalyse K1/W4, ADR 013): misst jeden Sound der Bibliothek, jedes Drum-Kit (Grundbeat) und jeden
// Melodie-Klang (Standard-Melodie) im Headless-Chromium und schreibt auf Wunsch die Pegel-Tabelle src/levels-table.js neu.
// Aufruf:  node tools/klang/pegel.cjs [--teile lib,kits,klaenge] [--ids a,b|@drums] [--tabelle] [--out f.json] [--streuung]
// Beispiel: node tools/klang/pegel.cjs --tabelle            (nach einer Änderung an den Sounds: Tabelle neu)
//           node tools/klang/pegel.cjs --streuung           (nur prüfen: Streuung je Rolle mit der jetzigen Tabelle)
const fs = require('fs');
const path = require('path');

const HILFE = `Misst die Lautheit der Sounds, Kits und Melodie-Klänge und rechnet die Pegel-Tabelle (ADR 013).

  node tools/klang/pegel.cjs [Optionen]
  --teile <liste>   lib, kits, klaenge (Voreinstellung: alle)
  --ids <liste>     nur diese Bibliotheks-Sounds (Komma) oder @<kategorie>
  --tabelle         src/levels-table.js aus der Messung neu schreiben (nur mit allen Teilen und ohne --ids)
  --streuung        je Rolle: Anzahl, Median, kleinster/größter Wert, Abweichung vom Ziel (mit der jetzigen Tabelle)
  --out <datei>     Messwerte als JSON speichern
  --help            diese Hilfe

Gemessen wird der Sound so, wie er heute klingt (mit Tabelle), und daraus der Wert vor der Tabelle zurückgerechnet
(Tabelle = Verstärkung gegen die alte Spitzen-Normalisierung). Loops: integrierte Lautheit (LUFS) über eine Runde;
Einzelklänge: lauteste 400-ms-Lautheit. Rolle und Ziel stehen in src/levels.js (ROLE_TARGET, roleOf).
Exit-Code: 0 = gemessen (bei --streuung: alle Rollen innerhalb ±2 LU), 1 = Bedienfehler, Messfehler oder Streuung zu groß.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HILFE); process.exit(0); }
const opt = (name, def = null) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; if (!v || v.startsWith('--')) { console.error(`Fehler: ${name} braucht einen Wert.\n\n${HILFE}`); process.exit(1); } return v; };
const known = ['--teile', '--ids', '--out'];
const flags = ['--tabelle', '--streuung'];
for (let i = 0; i < args.length; i++) { if (known.includes(args[i])) { i++; continue; } if (flags.includes(args[i])) continue; console.error(`Fehler: unbekannte Option ${args[i]}\n\n${HILFE}`); process.exit(1); }
const REPO = path.join(__dirname, '..', '..');
const parts = opt('--teile', 'lib,kits,klaenge').split(',');
const idsOpt = opt('--ids', '');
const writeTable = args.includes('--tabelle');
const spread = args.includes('--streuung');
if (writeTable && (idsOpt || parts.length < 3)) { console.error('Fehler: --tabelle braucht alle Teile und keine --ids.'); process.exit(1); }

(async () => {
  const { openApp } = require(path.join(REPO, 'tests', 'harness.cjs'));
  const { measureAll } = require(path.join(REPO, 'tests', 'pegel-mess.cjs'));
  const app = await openApp({ fresh: true });
  app.page.setDefaultTimeout(3600000);
  let res;
  try {
    res = await measureAll(app.page, { parts, ids: idsOpt });
  } catch (err) {
    console.error('Messfehler:', err.message);
    await app.close();
    process.exit(1);
  }
  if (app.errors.length) console.error('Konsolenfehler:', app.errors.slice(0, 5).join(' | '));
  await app.close();

  const L = await import(path.join(REPO, 'src', 'levels.js'));
  const r1 = (x) => Math.round(x * 10) / 10;
  // Je Eintrag: alter Wert (ohne Tabelle) und neuer Gewinn
  const rows = [];
  for (const [id, m] of Object.entries(res.lib || {})) rows.push({ part: 'lib', id, ...m });
  for (const [id, m] of Object.entries(res.kits || {})) rows.push({ part: 'kits', id, ...m });
  for (const [id, m] of Object.entries(res.klaenge || {})) rows.push({ part: 'klaenge', id, ...m });
  for (const r of rows) {
    r.target = L.ROLE_TARGET[r.role];
    r.oldLoud = r.loud - r.levelDb;
    r.oldPeakDb = r.peakDb - r.levelDb;
    r.gainDb = L.gainFor(r.role, r.oldLoud, r.oldPeakDb);
  }

  const byRole = new Map();
  for (const r of rows) { if (!byRole.has(r.role)) byRole.set(r.role, []); byRole.get(r.role).push(r); }
  let bad = 0;
  console.log('Rolle            n   Ziel   Median   min … max (jetzt)    Abw. max   Spitze max   vor der Tabelle: min … max');
  for (const [role, list] of [...byRole].sort()) {
    const v = list.map((r) => r.loud).sort((a, b) => a - b);
    const med = v[Math.floor(v.length / 2)];
    const dev = Math.max(...list.map((r) => Math.abs(r.loud - r.target)));
    const old = list.map((r) => r.oldLoud).sort((a, b) => a - b);
    const pk = Math.max(...list.map((r) => r.peakDb));
    const over = list.filter((r) => Math.abs(r.loud - r.target) > 2);
    if (over.length) bad++;
    console.log(`${role.padEnd(14)} ${String(list.length).padStart(3)}  ${String(list[0].target).padStart(5)}  ${String(r1(med)).padStart(6)}   ${r1(v[0])} … ${r1(v[v.length - 1])}`.padEnd(70)
      + `${r1(dev)}`.padStart(6) + `${r1(pk)} dBFS`.padStart(13) + `   ${r1(old[0])} … ${r1(old[old.length - 1])}`);
    if (spread && over.length) for (const r of over.slice(0, 12)) console.log(`   außerhalb ±2 LU: ${r.id} ${r1(r.loud)} (Spitze ${r1(r.peakDb)} dBFS)`);
  }
  const out = opt('--out');
  if (out) { fs.writeFileSync(out, JSON.stringify(rows, null, 1)); console.log(`\ngespeichert: ${out}`); }
  if (writeTable) {
    const pick = (part) => Object.fromEntries(rows.filter((r) => r.part === part).map((r) => [r.id, [r1(r.gainDb), r.role]]));
    const fmt = (o) => '{\n' + Object.entries(o).sort().map(([k, v]) => `  ${JSON.stringify(k)}: [${v[0]}, '${v[1]}'],`).join('\n') + '\n}';
    const file = path.join(REPO, 'src', 'levels-table.js');
    fs.writeFileSync(file, `// Erzeugt von tools/klang/pegel.cjs --tabelle; nicht von Hand ändern (ADR 013).
// Je Sound/Kit/Klang: [Verstärkung in dB gegen die alte Spitzen-Normalisierung, Rolle]. Ziele und Spitzengrenze: src/levels.js.
export const SOUND_DB = ${fmt(pick('lib'))};
export const KIT_DB = ${fmt(pick('kits'))};
export const PRESET_DB = ${fmt(pick('klaenge'))};
`);
    console.log(`\ngeschrieben: ${path.relative(REPO, file)} (${rows.length} Einträge)`);
  }
  process.exit(spread && bad ? 1 : 0);
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
