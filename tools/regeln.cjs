// Prüft die mechanisch prüfbaren Regeln aus CLAUDE.md und meldet Fundstellen mit Datei und Zeile.
// Aufruf: node tools/regeln.cjs [--baseline] [--root ordner]   (npm run regeln)
// Altbestand steht in tools/regeln-basis.json; gemeldet wird nur, was darüber hinausgeht. Exit 1 bei neuen Verstößen.
const fs = require('fs');
const path = require('path');

const HELP = `Regeln prüfen (Loopwerk)

  node tools/regeln.cjs               alle Regeln prüfen, Exit 1 bei neuen Verstößen
  node tools/regeln.cjs --baseline    Basis (tools/regeln-basis.json) mit dem heutigen Stand neu schreiben
  node tools/regeln.cjs --root <dir>  anderen Projektordner prüfen (Basis liegt dort in tools/)

Regeln:
  farbe      feste Farbwerte (#hex, rgb()/hsl() mit Zahlen) außerhalb von :root in index.html (CSS) und src/ui/*.js  [Basis]
  edition    EDITION/edition als Abfrage in src/ui/*  [Basis]
  timer      setTimeout/setInterval in src/engine.js  [Basis]
  doctype    <!doctype oder <head in index.html (darf nicht vorkommen)
  katalog    Einträge in src/catalog*.js ohne id/Quelle/Lizenz (Lizenz-URL), doppelte IDs
  preload    modulepreload in index.html auf fehlende Dateien
  kette      tests/*.test.cjs ohne Zeile in tests/chain.txt (und umgekehrt)
Exit: 0 gut · 1 neue Verstöße · 2 Bedienfehler`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); process.exit(0); }
let ROOT = path.resolve(__dirname, '..');
const ri = argv.indexOf('--root');
if (ri >= 0) { if (!argv[ri + 1]) { console.error('Fehler: --root braucht einen Ordner'); process.exit(2); } ROOT = path.resolve(argv[ri + 1]); }
for (const a of argv) if (a.startsWith('--') && !['--baseline', '--root'].includes(a)) { console.error(`Fehler: unbekannte Option ${a}`); process.exit(2); }
const BASE_FILE = path.join(ROOT, 'tools', 'regeln-basis.json');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const uiFiles = () => fs.readdirSync(path.join(ROOT, 'src', 'ui')).filter((f) => f.endsWith('.js')).sort().map((f) => `src/ui/${f}`);

// Zeilen ohne Kommentare liefern: { n, text }. js: // und /* */; css: /* */
function codeLines(src, { js = false } = {}) {
  const out = [];
  let inBlock = false;
  src.split('\n').forEach((raw, i) => {
    let s = raw;
    if (inBlock) {
      const e = s.indexOf('*/');
      if (e < 0) return;
      s = s.slice(e + 2); inBlock = false;
    }
    s = s.replace(/\/\*.*?\*\//g, '');
    const b = s.indexOf('/*');
    if (b >= 0) { s = s.slice(0, b); inBlock = true; }
    if (js) s = s.replace(/(^|\s)\/\/.*$/, '$1');
    out.push({ n: i + 1, text: s });
  });
  return out;
}

// pro Zeile höchstens eine Fundstelle
const COLOR_RE = /(?<![&\w]|url\()#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(\s*[\d.]/;

// Fundstellen: { rule, file, n, text }
function findColors() {
  const found = [];
  // index.html: nur innerhalb <style>, :root-Blöcke ausgenommen
  const html = codeLines(read('index.html'));
  let inStyle = false, rootDepth = 0;
  for (const { n, text } of html) {
    if (/<style[\s>]/.test(text)) inStyle = true;
    if (!inStyle) continue;
    let kept = '';
    for (let i = 0; i < text.length; i++) {
      if (rootDepth > 0) {
        if (text[i] === '{') rootDepth++;
        else if (text[i] === '}') rootDepth--;
        continue;
      }
      if (text.startsWith(':root', i)) {
        const j = text.indexOf('{', i);
        if (j >= 0) { rootDepth = 1; i = j; continue; }
      }
      kept += text[i];
    }
    if (new RegExp(COLOR_RE.source).test(kept)) found.push({ rule: 'farbe', file: 'index.html', n, text: text.trim() });
    if (/<\/style>/.test(text)) inStyle = false;
  }
  for (const f of uiFiles()) {
    for (const { n, text } of codeLines(read(f), { js: true })) {
      if (new RegExp(COLOR_RE.source).test(text)) found.push({ rule: 'farbe', file: f, n, text: text.trim() });
    }
  }
  return found;
}

function findEdition() {
  const found = [];
  for (const f of uiFiles()) {
    for (const { n, text } of codeLines(read(f), { js: true })) {
      if (/^\s*import\b/.test(text)) continue;
      if (/\b(EDITION|edition)\b/.test(text)) found.push({ rule: 'edition', file: f, n, text: text.trim() });
    }
  }
  return found;
}

function findTimers() {
  const found = [];
  for (const { n, text } of codeLines(read('src/engine.js'), { js: true })) {
    if (/\b(setTimeout|setInterval)\b/.test(text)) found.push({ rule: 'timer', file: 'src/engine.js', n, text: text.trim() });
  }
  return found;
}

function findDoctype() {
  const found = [];
  read('index.html').split('\n').forEach((l, i) => {
    if (/<!doctype/i.test(l) || /<head[\s>]/i.test(l)) found.push({ rule: 'doctype', file: 'index.html', n: i + 1, text: l.trim() });
  });
  return found;
}

function findPreload() {
  const found = [];
  read('index.html').split('\n').forEach((l, i) => {
    const m = l.match(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/);
    if (!m) return;
    const href = m[1].split(/[?#]/)[0];
    if (/^https?:/.test(href)) return;
    if (!exists(href)) found.push({ rule: 'preload', file: 'index.html', n: i + 1, text: `modulepreload auf fehlende Datei: ${href}` });
  });
  return found;
}

function findChain() {
  const found = [];
  const chainFile = 'tests/chain.txt';
  if (!exists(chainFile)) return [{ rule: 'kette', file: chainFile, n: 1, text: 'tests/chain.txt fehlt' }];
  const lines = read(chainFile).split('\n');
  const names = new Map();
  lines.forEach((l, i) => { const t = l.replace(/#.*/, '').trim(); if (t) names.set(t, i + 1); });
  for (const f of fs.readdirSync(path.join(ROOT, 'tests')).filter((x) => x.endsWith('.test.cjs')).sort()) {
    const name = f.replace(/\.test\.cjs$/, '');
    if (!names.has(name)) found.push({ rule: 'kette', file: `tests/${f}`, n: 1, text: `nicht in tests/chain.txt: ${name}` });
  }
  for (const [name, n] of names) if (!exists(`tests/${name}.test.cjs`)) found.push({ rule: 'kette', file: chainFile, n, text: `Datei fehlt: tests/${name}.test.cjs` });
  return found;
}

// Kataloge laden (ES-Module) und die Pflichtangaben prüfen; Zeile = Position der id in der Quelldatei
async function findCatalog() {
  const found = [];
  const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^catalog.*\.js$/.test(f)).sort();
  const seen = new Map();
  for (const f of files) {
    const rel = `src/${f}`;
    const src = read(rel).split('\n');
    const lineOf = (id) => {
      const raw = String(id).replace(/^sp-/, '').replace(/-/g, '_'); // catalog.js: entry('bd_808', …) erzeugt id 'sp-bd-808'
      const tries = [(l) => l.includes(`entry('${raw}'`), (l) => l.includes(`id: '${id}'`), (l) => l.includes(`'${id}'`)];
      for (const t of tries) { const i = src.findIndex(t); if (i >= 0) return i + 1; }
      return 1;
    };
    const mod = await import(require('url').pathToFileURL(path.join(ROOT, rel)).href);
    for (const [exp, val] of Object.entries(mod)) {
      if (!Array.isArray(val) || !val.length || typeof val[0] !== 'object' || !('id' in val[0]) || !('category' in val[0])) continue;
      const isShelf = /CATALOG$/.test(exp); // Regal-Einträge; Instrumente (GUITAR_INSTRUMENTS) prüft derselbe Satz
      for (const e of val) {
        const miss = [];
        if (!e.id) miss.push('id');
        if (!e.license) miss.push('license');
        if (!e.licenseUrl || !/^https?:\/\//.test(e.licenseUrl)) miss.push('licenseUrl');
        if (!e.origin) miss.push('origin');
        if (!e.source || !/^https?:\/\//.test(e.source)) miss.push('source');
        if (isShelf && !e.file) miss.push('file');
        if (miss.length) found.push({ rule: 'katalog', file: rel, n: lineOf(e.id), text: `${e.id || '(ohne id)'}: fehlt ${miss.join(', ')}` });
        if (e.id) {
          if (seen.has(e.id)) found.push({ rule: 'katalog', file: rel, n: lineOf(e.id), text: `${e.id}: doppelte ID (auch in ${seen.get(e.id)})` });
          else seen.set(e.id, rel);
        }
      }
    }
  }
  return found;
}

const BASED = ['farbe', 'edition', 'timer'];
const NAMES = {
  farbe: 'Feste Farbwerte außerhalb von :root',
  edition: 'EDITION/edition in src/ui/*',
  timer: 'setTimeout/setInterval in src/engine.js',
  doctype: '<!doctype / <head in index.html',
  katalog: 'Katalog ohne Quelle/Lizenz',
  preload: 'modulepreload auf fehlende Datei',
  kette: 'Test nicht in tests/chain.txt',
};

async function main() {
  const all = [...findColors(), ...findEdition(), ...findTimers(), ...findDoctype(), ...(await findCatalog()), ...findPreload(), ...findChain()];

  const count = {};
  for (const f of all) if (BASED.includes(f.rule)) { (count[f.rule] ||= {}); count[f.rule][f.file] = (count[f.rule][f.file] || 0) + 1; }

  if (argv.includes('--baseline')) {
    const sorted = {};
    for (const r of BASED) { sorted[r] = {}; for (const k of Object.keys(count[r] || {}).sort()) sorted[r][k] = count[r][k]; }
    fs.mkdirSync(path.dirname(BASE_FILE), { recursive: true });
    fs.writeFileSync(BASE_FILE, JSON.stringify(sorted, null, 2) + '\n');
    const total = BASED.map((r) => `${r} ${Object.values(sorted[r]).reduce((a, b) => a + b, 0)}`).join(' · ');
    console.log(`Basis geschrieben: ${path.relative(ROOT, BASE_FILE)}  (${total})`);
    process.exit(0);
  }

  let base = null;
  if (fs.existsSync(BASE_FILE)) base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
  else console.warn(`Hinweis: ${path.relative(ROOT, BASE_FILE)} fehlt, alles Gefundene zählt als neu (--baseline schreibt die Basis).`);

  let bad = 0;
  const lower = [];
  for (const rule of Object.keys(NAMES)) {
    const items = all.filter((f) => f.rule === rule);
    let report = [];
    if (BASED.includes(rule)) {
      const files = new Set([...Object.keys(count[rule] || {}), ...Object.keys((base && base[rule]) || {})]);
      for (const file of [...files].sort()) {
        const now = (count[rule] || {})[file] || 0;
        const was = ((base && base[rule]) || {})[file] || 0;
        if (now > was) {
          const here = items.filter((f) => f.file === file);
          report.push({ head: `${file}: ${now} statt ${was} in der Basis (+${now - was}); alle Fundstellen der Datei:`, items: here });
        } else if (now < was) lower.push(`${rule} ${file}: ${now} statt ${was}`);
      }
    } else if (items.length) report = [{ head: null, items }];

    if (!report.length) { console.log(`✔ ${rule.padEnd(8)} ${NAMES[rule]}`); continue; }
    console.log(`✘ ${rule.padEnd(8)} ${NAMES[rule]}`);
    for (const r of report) {
      bad += r.head ? 1 : r.items.length;
      if (r.head) console.log(`    ${r.head}`);
      const show = r.items.slice(0, 15);
      for (const f of show) console.log(`    ${f.file}:${f.n}  ${f.text.length > 150 ? f.text.slice(0, 150) + '…' : f.text}`);
      if (r.items.length > show.length) console.log(`    … und ${r.items.length - show.length} weitere`);
    }
  }
  if (lower.length) console.log(`\nHinweis: unter der Basis (Basis mit --baseline senken): ${lower.join('; ')}`);
  console.log(bad ? `\n${bad} neue Verstöße` : '\nKeine neuen Verstöße');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
