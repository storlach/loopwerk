// Vorschau (Artifact) vorbereiten: geänderte Dateien seit der letzten Veröffentlichung, Stände gegen die Historie prüfen.
// Aufruf: node tools/vorschau.cjs [--since <commit>] | --verify <ordner> | --mark <nummer>
// Beispiel: node tools/vorschau.cjs --since HEAD~5   (JSON für `files` auf stdout, Hinweis für Menschen auf stderr)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PATHS = ['src', 'vendor', 'index.html'];

const HELP = `Vorschau vorbereiten

  node tools/vorschau.cjs                 seit der zuletzt gemerkten Vorschau geänderte Dateien (src/, vendor/, index.html)
  node tools/vorschau.cjs --since <c>     dasselbe ab Commit <c> (nötig, solange kein Stand gemerkt ist)
  node tools/vorschau.cjs --verify <dir>  Dateien in <dir> (mit Pfad, z. B. <dir>/src/x.js) gegen die Git-Historie prüfen
  node tools/vorschau.cjs --mark <n>      HEAD als Vorschau <n> merken (tools/vorschau-stand.json, einchecken)

Ausgabe der Liste: JSON-Objekt { "src/a.js": "src/a.js", ... } auf stdout (gelöscht = null, ohne index.html),
eine Zeile für Menschen auf stderr. Exit: 0 gut · 1 --verify fand Dateien außerhalb der Historie · 2 Bedienfehler.`;

function die(msg, code = 2) { console.error(`Fehler: ${msg}`); process.exit(code); }
function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
const gitText = (args) => git(args).toString('utf8');

// Der letzte veröffentlichte Stand steht in tools/vorschau-stand.json (Tags kommen in dieser Umgebung nicht aufs Remote)
const STAND = path.join(ROOT, 'tools', 'vorschau-stand.json');
function latestStand() {
  try { const j = JSON.parse(fs.readFileSync(STAND, 'utf8')); return j.commit ? j : null; } catch { return null; }
}

function listChanged(since, label = since) {
  try { git(['rev-parse', '--verify', '-q', `${since}^{commit}`]); } catch { die(`Commit/Tag nicht gefunden: ${since}`); }
  const out = gitText(['diff', '--no-renames', '--name-status', since, 'HEAD', '--', ...PATHS]);
  const files = {};
  let indexChanged = false;
  for (const line of out.split('\n').filter(Boolean)) {
    const [st, p] = line.split('\t');
    if (p === 'index.html') { indexChanged = true; continue; }
    files[p] = st === 'D' ? null : p;
  }
  const dirty = gitText(['status', '--porcelain', '--untracked-files=no', '--', ...PATHS]).split('\n').filter(Boolean);
  console.log(JSON.stringify(files, null, 2));
  const n = Object.keys(files).length;
  const del = Object.values(files).filter((v) => v === null).length;
  console.error(`${n} Dateien geändert seit ${label} (${del} gelöscht), index.html ${indexChanged ? 'geändert' : 'unverändert'}.`);
  if (dirty.length) console.error(`Achtung: ${dirty.length} Datei(en) haben ungesicherte Änderungen und fehlen hier (nur Commits bis HEAD zählen).`);
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc); else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}

function verify(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`Ordner nicht gefunden: ${dir}`);
  const files = walk(dir).sort();
  if (!files.length) die('Ordner ist leer');
  let bad = 0;
  for (const rel of files) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
    let commits = [];
    try { commits = gitText(['log', '-n', '300', '--format=%H', '--', rel]).split('\n').filter(Boolean); } catch { /* leer */ }
    let found = null;
    for (const c of commits) {
      let blob;
      try { blob = git(['show', `${c}:${rel}`]); } catch { continue; } // in diesem Commit gelöscht
      if (crypto.createHash('sha256').update(blob).digest('hex') === hash) { found = c; break; }
    }
    if (found) {
      const info = gitText(['log', '-1', '--format=%h %ad %s', '--date=short', found]).trim();
      console.log(`✔ ${rel}  ${info}`);
    } else {
      bad++;
      console.log(`✘ ${rel}  NICHT IN DER HISTORIE (${commits.length} Commits geprüft)`);
    }
  }
  console.log(`\n${files.length - bad}/${files.length} Dateien stammen aus der Historie`);
  process.exit(bad ? 1 : 0);
}

function mark(n) {
  if (!/^\d+$/.test(n || '')) die('--mark braucht eine Nummer');
  const commit = gitText(['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(STAND, JSON.stringify({ nummer: Number(n), commit, datum: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log(`Vorschau ${n} gemerkt: ${commit.slice(0, 7)} (tools/vorschau-stand.json – mit dem nächsten Commit einchecken).`);
}

function main() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.includes('-h')) { console.log(HELP); return; }
  const val = (flag) => { const i = a.indexOf(flag); if (i < 0) return undefined; if (!a[i + 1]) die(`${flag} braucht einen Wert`); return a[i + 1]; };
  for (const x of a) if (x.startsWith('--') && !['--since', '--verify', '--mark'].includes(x)) die(`Unbekannte Option ${x}`);
  if (a.includes('--verify')) return verify(path.resolve(val('--verify')));
  if (a.includes('--mark')) return mark(val('--mark'));
  let since = val('--since');
  let label = since;
  if (!since) {
    const st = latestStand();
    if (!st) die('Noch kein Stand gemerkt (tools/vorschau-stand.json). Bitte --since <commit> angeben; danach mit --mark <n> merken.');
    since = st.commit;
    label = `Vorschau ${st.nummer}`;
  }
  listChanged(since, label);
}
main();
