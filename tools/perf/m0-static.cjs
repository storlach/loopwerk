// Statischer Bestand: Modulgraph, Tiefe, Größen (roh/gzip/brotli), modulepreload-Abdeckung
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const { ROOT } = require('./lib.cjs');
const read = (f) => fs.readFileSync(path.join(ROOT, f));
const graph = new Map(); const dyn = new Map();
function scan(file) {
  if (graph.has(file)) return;
  const src = read(file).toString('utf8');
  const stat = [], dy = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) stat.push(m[1] || m[2]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) dy.push(m[1]);
  for (const m of src.matchAll(/new URL\(\s*['"]([^'"]+\.js)['"]\s*,\s*import\.meta\.url\)/g)) dy.push(m[1]);
  const res = (r) => path.posix.normalize(path.posix.join(path.posix.dirname(file), r));
  graph.set(file, stat.map(res)); dyn.set(file, dy.map(res));
  for (const d of graph.get(file)) scan(d);
}
scan('src/main.js');
const depth = new Map([['src/main.js', 1]]);
const q = ['src/main.js'];
while (q.length) { const f = q.shift(); for (const d of graph.get(f)) if (!depth.has(d)) { depth.set(d, depth.get(f) + 1); q.push(d); } }
const statics = [...graph.keys()];
const html = read('index.html').toString('utf8');
const preload = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
const size = (f) => { const b = read(f); return { raw: b.length, gz: zlib.gzipSync(b, { level: 6 }).length, br: zlib.brotliCompressSync(b).length }; };
const tot = { raw: 0, gz: 0, br: 0 };
const rows = statics.map((f) => ({ f, d: depth.get(f), ...size(f) }));
for (const r of rows) { tot.raw += r.raw; tot.gz += r.gz; tot.br += r.br; }
const byDepth = {}; for (const r of rows) byDepth[r.d] = (byDepth[r.d] || 0) + 1;
console.log('statisch geladene Module (ab main.js):', statics.length, 'Summe', tot);
console.log('Tiefe (kürzester Entdeckungsweg) → Anzahl:', byDepth, 'max', Math.max(...depth.values()));
console.log('modulepreload-Zeilen:', preload.length, '· davon im statischen Graph:', preload.filter((p) => graph.has(p)).length);
console.log('statisch gebraucht, aber NICHT vorgeladen:', statics.filter((f) => !preload.includes(f)));
console.log('vorgeladen, aber nicht statisch gebraucht:', preload.filter((p) => !graph.has(p)));
const allDyn = new Set(); for (const [f, l] of dyn) for (const d of l) allDyn.add(d + ' <- ' + f);
console.log('dynamisch/Worker:', [...allDyn]);
const allSrc = []; (function walk(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { const p = d + '/' + n; if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p); else allSrc.push(p); } })('src');
console.log('Dateien in src/:', allSrc.length, '· nicht im statischen Graph:', allSrc.filter((f) => !graph.has(f)));
console.log('größte Module (roh/gzip):'); for (const r of rows.sort((a, b) => b.raw - a.raw).slice(0, 12)) console.log('  ', r.f, r.raw, r.gz, 'Tiefe', r.d);
const h = size('index.html'); console.log('index.html', h);
const css = html.slice(html.indexOf('<style>'), html.lastIndexOf('</style>')); console.log('CSS im HTML (Bytes, grob):', Buffer.byteLength(css));
const wav = { n: 0, bytes: 0 }; const dirs = {};
(function walk(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { const p = d + '/' + n; if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p); else if (p.endsWith('.wav')) { const s = fs.statSync(path.join(ROOT, p)).size; wav.n++; wav.bytes += s; const k = p.split('/').slice(0, 3).join('/'); dirs[k] = dirs[k] || { n: 0, mb: 0 }; dirs[k].n++; dirs[k].mb += s / 1e6; } } })('assets');
console.log('WAV-Dateien:', wav.n, (wav.bytes / 1e6).toFixed(1), 'MB', dirs);
