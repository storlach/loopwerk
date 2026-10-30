// Fasst die VCSL-Aufnahmen zu Klang-Paketen zusammen: zusammengehörige WAV-Dateien (eine Familie wie „kick“,
// „conga“ oder ein ganzes Instrument) hintereinander in eine Datei. Die App lädt ein Paket einmal und schneidet
// die WAV-Datei heraus (src/fetch-asset.js). Weniger Dateien = weniger Anfragen und passt ins Artifact-Limit.
// Endung .wav, weil das Artifact nur bekannte Medientypen ausliefert; der Anfang ist ohnehin die erste WAV-Datei.
// Aufruf: node tools/pack-assets.cjs   (schreibt assets/packs/*.wav und src/asset-packs.js)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = 'assets/samples/vcsl';
const OUT = 'assets/packs';

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`;
    return d.isDirectory() ? walk(rel) : d.name.endsWith('.wav') ? [rel] : [];
  });
}

// Familie: Instrumente (inst/<id>) als Ganzes, sonst Ordner + Name ohne Nummer bzw. Tonname
function family(rel) {
  const parts = rel.slice(SRC.length + 1).split('/');
  if (parts[0] === 'inst') return `inst-${parts[1]}`;
  const base = parts[parts.length - 1].replace(/\.wav$/, '')
    .replace(/-[a-g]s?\d$/, '')      // melodisch: fluegel-c3 → fluegel
    .replace(/(-\d+)+$/, '')         // kick-3 → kick
    .replace(/-(leise|gedaempft|kurz|vib)$/, '');
  return `${parts[0]}-${base}`;
}

const files = walk(SRC).sort();
const groups = new Map();
for (const f of files) {
  const fam = family(f);
  if (!groups.has(fam)) groups.set(fam, []);
  groups.get(fam).push(f);
}

fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
const packs = [];
const packed = {};
for (const [fam, list] of [...groups].sort()) {
  const bufs = list.map((f) => fs.readFileSync(path.join(ROOT, f)));
  const name = `${OUT}/vcsl-${fam}.wav`;
  const i = packs.length;
  packs.push(name);
  let off = 0;
  list.forEach((f, k) => { packed[f] = [i, off, bufs[k].length]; off += bufs[k].length; });
  fs.writeFileSync(path.join(ROOT, name), Buffer.concat(bufs));
}

const js = `// Erzeugt von tools/pack-assets.cjs – nicht von Hand ändern.
// PACKED: Dateipfad → [Paket, Byte-Anfang, Länge]; das Paket ist eine Aneinanderreihung vollständiger WAV-Dateien.
export const PACKS = ${JSON.stringify(packs, null, 0)};
export const PACKED = ${JSON.stringify(packed, null, 0)};
`;
fs.writeFileSync(path.join(ROOT, 'src/asset-packs.js'), js);
const bytes = packs.reduce((n, p) => n + fs.statSync(path.join(ROOT, p)).size, 0);
console.log(`${files.length} Dateien in ${packs.length} Paketen, ${(bytes / 1048576).toFixed(1)} MB, größtes ${(Math.max(...packs.map((p) => fs.statSync(path.join(ROOT, p)).size)) / 1048576).toFixed(2)} MB`);
