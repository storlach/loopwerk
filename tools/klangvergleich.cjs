#!/usr/bin/env node
// Vergleicht Hörproben vorher/nachher: paart WAV-Dateien zweier Ordner über den Namen und zeigt die Unterschiede.
// Aufruf: node tools/klangvergleich.cjs <vorher-ordner> <nachher-ordner> [--json]
// Beispiel: node tools/klangvergleich.cjs proben/vorher proben/nachher
// Gepaart wird über den Namen ohne den Stil am Ende (…-takte-1-16-ohne.wav ↔ …-takte-1-16-club.wav gehören zusammen).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HELP = `Vergleicht Hörproben vorher/nachher.

  node tools/klangvergleich.cjs <vorher-ordner> <nachher-ordner> [--json]

Gepaart wird über den Dateinamen ohne den Mastering-Stil am Ende. Je Paar: Lautheit (LUFS), Spitze (dBTP),
Anteil Sub+Bass / Mitten / Höhen in Prozent, Stereobreite (Seite zu Mitte in dB), jeweils vorher → nachher.
Exit 0, auch wenn sich Werte verschlechtern (das Skript misst, es urteilt nicht); Exit 1 bei Bedienfehlern.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HELP); process.exit(0); }
const json = args.includes('--json');
const dirs = args.filter((a) => !a.startsWith('--'));
if (dirs.length !== 2) { console.error('Fehler: zwei Ordner angeben.\n\n' + HELP); process.exit(1); }
for (const d of dirs) if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) { console.error(`Fehler: kein Ordner: ${d}`); process.exit(1); }

const STILE = ['ohne', 'balanced', 'warm', 'bright', 'loud', 'club'];
const key = (f) => { const b = f.replace(/\.wav$/i, ''); const i = b.lastIndexOf('-'); return i > 0 && STILE.includes(b.slice(i + 1)) ? b.slice(0, i) : b; };
const stil = (f) => { const b = f.replace(/\.wav$/i, ''); const s = b.slice(b.lastIndexOf('-') + 1); return STILE.includes(s) ? s : ''; };
const list = (d) => fs.readdirSync(d).filter((f) => /\.wav$/i.test(f)).sort();
const measure = (d, files) => {
  if (!files.length) return {};
  const out = execFileSync('node', [path.join(__dirname, 'messen.cjs'), '--json', ...files.map((f) => path.join(d, f))], { maxBuffer: 64 * 1024 * 1024 });
  const res = {};
  for (const m of JSON.parse(out.toString('utf8'))) res[key(m.name)] = { ...m, stil: stil(m.name) };
  return res;
};

const a = measure(dirs[0], list(dirs[0]));
const b = measure(dirs[1], list(dirs[1]));
const keys = Object.keys(a).filter((k) => b[k]);
const onlyA = Object.keys(a).filter((k) => !b[k]);
const onlyB = Object.keys(b).filter((k) => !a[k]);
if (!keys.length) { console.error('Fehler: keine gleichnamigen WAV-Dateien in beiden Ordnern.'); process.exit(1); }

const rows = keys.map((k) => {
  const x = a[k]; const y = b[k];
  const tief = (m) => m.baender.sub + m.baender.bass;
  return {
    name: k, stilVorher: x.stil, stilNachher: y.stil,
    lufs: [x.lufs, y.lufs], truePeak: [x.truePeakDb, y.truePeakDb],
    tief: [tief(x), tief(y)], mitten: [x.baender.mitten, y.baender.mitten], hoehen: [x.baender.hoehen, y.baender.hoehen],
    breite: [x.breiteDb, y.breiteDb],
  };
});
if (json) { console.log(JSON.stringify({ paare: rows, nurVorher: onlyA, nurNachher: onlyB }, null, 2)); process.exit(0); }

const f1 = (v) => (v == null || !Number.isFinite(v) ? '  –  ' : v.toFixed(1).replace('.', ','));
const pair = (p, w = 6) => `${f1(p[0]).padStart(w)} → ${f1(p[1]).padEnd(w)}`;
const nameW = Math.max(8, ...rows.map((r) => r.name.length));
console.log(`${'Hörprobe'.padEnd(nameW)}  ${'LUFS'.padEnd(15)}  ${'Spitze dBTP'.padEnd(15)}  ${'Tiefen %'.padEnd(15)}  ${'Mitten %'.padEnd(15)}  ${'Höhen %'.padEnd(15)}  ${'Breite dB'.padEnd(15)}  Stil`);
for (const r of rows) {
  const s = r.stilVorher === r.stilNachher ? r.stilNachher : `${r.stilVorher || '?'} → ${r.stilNachher || '?'}`;
  console.log(`${r.name.padEnd(nameW)}  ${pair(r.lufs)}  ${pair(r.truePeak)}  ${pair(r.tief)}  ${pair(r.mitten)}  ${pair(r.hoehen)}  ${pair(r.breite)}  ${s}`);
}
console.log('\nTiefen = Sub + Bass (30–250 Hz). Breite = Seite zu Mitte; näher an 0 heißt breiter.');
if (onlyA.length) console.log(`Nur vorher: ${onlyA.join(', ')}`);
if (onlyB.length) console.log(`Nur nachher: ${onlyB.join(', ')}`);
