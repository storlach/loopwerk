// Dauer der Testkette: jede Testdatei aus package.json einzeln, mit Zeit und Ergebnis. Aufruf: node m7-tests.cjs [nur-diese,…]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = process.env.LW_ROOT || require('path').resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let tests = pkg.scripts.test.split('&&').map((s) => s.trim().replace(/^node /, ''));
if (process.argv[2]) { const only = process.argv[2].split(','); tests = tests.filter((t) => only.some((o) => t.includes(`/${o}.test`))); }
const out = [];
const t00 = Date.now();
for (const t of tests) {
  const l0 = os.loadavg()[0];
  const t0 = Date.now();
  const r = spawnSync('node', [t], { cwd: ROOT, encoding: 'utf8', timeout: 420000, maxBuffer: 64e6 });
  const ms = Date.now() - t0;
  const text = (r.stdout || '') + (r.stderr || '');
  const m = text.match(/(\d+)\/(\d+) bestanden/g);
  const fails = (text.match(/^✘.*$/gm) || []).map((s) => s.slice(0, 110));
  const row = { t: path.basename(t, '.test.cjs'), s: +(ms / 1000).toFixed(1), code: r.status, sum: m ? m[m.length - 1] : (r.signal || '?'), load: +l0.toFixed(1), fails };
  out.push(row);
  console.log(`${row.t.padEnd(18)} ${String(row.s).padStart(6)} s · Code ${row.code} · ${row.sum} · Last ${row.load}${fails.length ? ' · ' + fails.slice(0, 2).join(' | ') : ''}`);
  fs.writeFileSync(path.join(__dirname, 'out-m7.json'), JSON.stringify(out, null, 1));
}
const total = out.reduce((a, r) => a + r.s, 0);
console.log(`\nGesamt ${total.toFixed(0)} s (${(total / 60).toFixed(1)} min) für ${out.length} Dateien · fehlgeschlagen: ${out.filter((r) => r.code !== 0).map((r) => r.t).join(', ') || 'keine'} · Wand ${((Date.now() - t00) / 60000).toFixed(1)} min`);
