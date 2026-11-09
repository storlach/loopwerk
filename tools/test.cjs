// Testläufer: fährt die Kette aus tests/chain.txt ohne Abbruch, wiederholt Ausfälle einmal und meldet Wackler.
// Aufruf: node tools/test.cjs [--only a,b] [--from name] [--repeat N name] [--jobs N] [--no-retry] [--json datei]
// Beispiel: node tools/test.cjs --only spike,stufe2,wav-bits
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 10 * 60 * 1000;

const HELP = `Testläufer für Loopwerk (Kette: tests/chain.txt)

  node tools/test.cjs                      alle Tests nacheinander, ohne Abbruch
  --only a,b,c                             nur diese Tests
  --from name                              ab diesem Test (einschließlich)
  --repeat N name                          einen Test N-mal laufen lassen, Quote ausgeben (Wackler aufspüren)
  --jobs N                                 parallel (Voreinstellung 1; Parallelität reißt Zeitgrenzen)
  --no-retry                               Ausfälle nicht wiederholen
  --json datei                             Ergebnis je Test mit Dauer als JSON schreiben
  --chain datei                            andere Kette statt tests/chain.txt (zum Ausprobieren)
  --help                                   diese Hilfe

Ein Test gilt als bestanden, wenn sein Prozess mit 0 endet (Zeitgrenze 10 Minuten).
Ausfall + Wiederholung bestanden = "wackelig" (Lauf bleibt grün). Ausfall + Wiederholung durchgefallen = rot.
Exit 0 nur ohne rote Tests (2 bei Bedienfehlern).`;

function parseArgs(argv) {
  const o = { jobs: 1, retry: true, only: null, from: null, repeat: 0, json: null, chain: path.join(ROOT, 'tests', 'chain.txt'), names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) fail(`${a} braucht einen Wert`); return argv[++i]; };
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--only') o.only = need().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--from') o.from = need();
    else if (a === '--repeat') o.repeat = parseInt(need(), 10);
    else if (a === '--jobs') o.jobs = parseInt(need(), 10);
    else if (a === '--no-retry') o.retry = false;
    else if (a === '--json') o.json = need();
    else if (a === '--chain') o.chain = path.resolve(need());
    else if (a.startsWith('--')) fail(`Unbekannte Option ${a}`);
    else o.names.push(a);
  }
  if (!(o.jobs >= 1)) fail('--jobs braucht eine Zahl >= 1');
  if (o.repeat && !(o.repeat >= 1)) fail('--repeat braucht eine Zahl >= 1');
  return o;
}
function fail(msg) { console.error(`Fehler: ${msg}`); process.exit(2); }

function readChain(file) {
  if (!fs.existsSync(file)) fail(`Kette nicht gefunden: ${file}`);
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}

function testFile(name, dir) {
  const p = path.join(dir, `${name}.test.cjs`);
  return fs.existsSync(p) ? p : null;
}

// Ein Testprozess; gibt { ok, code, ms, out, summary } zurück
function runOne(file, cwd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = '';
    const child = spawn(process.execPath, [file], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { out += String(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, code, timedOut, ms: Date.now() - t0, out, summary: summaryOf(out) });
    });
  });
}

function summaryOf(out) {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\d+\/\d+ bestanden/.test(lines[i]) || /\d+ geprüft, \d+ Fehler/.test(lines[i])) return lines[i];
  }
  return '';
}

const fmt = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

function failLines(out) {
  const l = out.split('\n').filter((x) => x.trimStart().startsWith('✘'));
  if (l.length) return l;
  return out.split('\n').filter(Boolean).slice(-6); // kein ✘: letzte Zeilen (Absturz, Zeitgrenze)
}

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const chain = readChain(o.chain);
  const testsDir = path.join(ROOT, 'tests');

  // Kette und Dateien abgleichen (nur Hinweis)
  const onDisk = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.cjs')).map((f) => f.replace(/\.test\.cjs$/, ''));
  const hints = [
    ...onDisk.filter((n) => !chain.includes(n)).map((n) => `tests/${n}.test.cjs steht nicht in ${path.relative(ROOT, o.chain)}`),
    ...chain.filter((n) => !testFile(n, testsDir)).map((n) => `${n} steht in der Kette, aber tests/${n}.test.cjs fehlt`),
  ];
  for (const h of hints.slice(0, 5)) console.warn(`Hinweis: ${h}`);
  if (hints.length > 5) console.warn(`Hinweis: … und ${hints.length - 5} weitere Abweichungen zwischen Kette und tests/`);

  if (o.repeat) {
    const name = o.names[0];
    if (!name) fail('--repeat N braucht einen Testnamen');
    const file = testFile(name, testsDir);
    if (!file) fail(`Test nicht gefunden: ${name}`);
    let pass = 0;
    const results = [];
    for (let i = 1; i <= o.repeat; i++) {
      const r = await runOne(file, ROOT);
      if (r.ok) pass++;
      results.push({ run: i, ok: r.ok, ms: r.ms, summary: r.summary });
      console.log(`${r.ok ? '✔' : '✘'} ${name} Lauf ${i}/${o.repeat}  ${fmt(r.ms)}  ${r.summary}`);
      if (!r.ok) for (const l of failLines(r.out)) console.log(`    ${l.trim()}`);
    }
    console.log(`\n${name}: ${pass}/${o.repeat} bestanden${pass < o.repeat ? '  (wackelig)' : ''}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify({ name, runs: results }, null, 2));
    process.exit(pass === o.repeat ? 0 : 1);
  }

  let list = chain;
  if (o.only) {
    for (const n of o.only) if (!testFile(n, testsDir)) fail(`Test nicht gefunden: ${n}`);
    list = o.only;
  } else if (o.from) {
    const i = chain.indexOf(o.from);
    if (i < 0) fail(`--from: ${o.from} steht nicht in der Kette`);
    list = chain.slice(i);
  }
  list = list.filter((n) => testFile(n, testsDir));
  if (!list.length) fail('Keine Tests ausgewählt');

  const t0 = Date.now();
  const res = new Array(list.length);
  console.log(`${list.length} Tests, ${o.jobs} parallel`);
  await pool(list, o.jobs, async (name, i) => {
    const r = await runOne(testFile(name, testsDir), ROOT);
    res[i] = { name, status: r.ok ? 'gruen' : 'ausgefallen', ms: r.ms, summary: r.summary, first: r };
    console.log(`${r.ok ? '✔' : '✘'} ${name.padEnd(18)} ${fmt(r.ms).padStart(9)}  ${r.summary}${r.timedOut ? '  (Zeitgrenze 10 min)' : ''}`);
  });

  // Ausfälle einmal allein wiederholen
  for (const r of res.filter((x) => x.status === 'ausgefallen')) {
    if (!o.retry) { r.status = 'rot'; r.fails = failLines(r.first.out); continue; }
    console.log(`\nWiederhole ${r.name} allein ...`);
    const again = await runOne(testFile(r.name, testsDir), ROOT);
    r.retryMs = again.ms;
    if (again.ok) { r.status = 'wackelig'; r.summary = again.summary; console.log(`~ ${r.name} bestanden beim zweiten Mal  ${again.summary}`); }
    else { r.status = 'rot'; r.fails = failLines(again.out); r.summary = again.summary; console.log(`✘ ${r.name} auch beim zweiten Mal durchgefallen  ${again.summary}`); }
  }

  const total = Date.now() - t0;
  const n = (s) => res.filter((r) => r.status === s).length;
  console.log('\n──────── Übersicht ────────');
  console.log(`grün ${n('gruen')} · wackelig ${n('wackelig')} · rot ${n('rot')}   (${list.length} Tests, ${fmt(total)})`);
  const slow = [...res].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log('Langsamste: ' + slow.map((r) => `${r.name} ${fmt(r.ms)}`).join(' · '));
  for (const r of res.filter((x) => x.status === 'wackelig')) console.log(`~ wackelig: ${r.name}`);
  for (const r of res.filter((x) => x.status === 'rot')) {
    console.log(`✘ ROT: ${r.name}`);
    for (const l of r.fails) console.log(`    ${l.trim()}`);
  }
  if (o.json) {
    fs.writeFileSync(o.json, JSON.stringify({
      total_ms: total,
      tests: res.map((r) => ({ name: r.name, status: r.status, ms: r.ms, retry_ms: r.retryMs ?? null, summary: r.summary })),
    }, null, 2));
  }
  process.exit(n('rot') ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
