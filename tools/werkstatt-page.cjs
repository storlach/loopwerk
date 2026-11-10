// Erzeugt die Dateien von Krachwerk (/werkstatt/, ADR 007): die volle App aus index.html – unverändert bis auf
// Wörter (Name, Ladesatz) –, dazu die Edition-Zeile, Manifest und Service Worker. Kein zweites index.html im Repo.
// Genutzt von tools/build-pages.cjs (GitHub Pages) und tests/serve.cjs (lokal).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// Jede Ersetzung mit erwarteter Anzahl: ändert sich index.html, fällt es hier sofort auf
const WORDS = [
  ['<title>Loopwerk</title>', '<title>Krachwerk</title>', 1],
  ['Loopwerk wird geladen', 'Krachwerk wird geladen', 1],
  ['Loop<b>werk</b>', 'Krach<b>werk</b>', 2],
  ['<div class="splash-bars" aria-hidden="true">', '<div class="splash-bars splash-klatscher" aria-hidden="true">', 1],
  ['I Like To Loop it Loop it', 'Mach aus jedem Geräusch ein Instrument.', 1],
  ['<link rel="icon" href="assets/icons/favicon.svg" type="image/svg+xml">', '<link rel="icon" href="assets/icons/krachwerk.svg" type="image/svg+xml">', 1],
  ['<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">', '<link rel="apple-touch-icon" href="assets/icons/krachwerk-180.png">', 1],
];

function bgToken(index) {
  const m = index.match(/\n {2}:root \{[\s\S]*?--bg:\s*(#[0-9A-Fa-f]{6})/);
  if (!m) throw new Error('Token --bg in index.html nicht gefunden');
  return m[1];
}

function werkstattPage(skeletonHead) {
  let index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [from, to, n] of WORDS) {
    const found = index.split(from).length - 1;
    if (found !== n) throw new Error(`werkstatt-page: „${from}“ ${found}× statt ${n}× in index.html`);
    index = index.split(from).join(to);
  }
  // Seite liegt eine Ebene tiefer; <base> lässt src/ und assets/ wie gewohnt auflösen
  const head = skeletonHead
    .replace('<head>', '<head><base href="../">')
    .replace(/<link rel="icon"[^>]*>|<link rel="apple-touch-icon"[^>]*>/g, '')
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><link rel="icon" href="assets/icons/krachwerk.svg" type="image/svg+xml"><link rel="icon" href="assets/icons/krachwerk-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="assets/icons/krachwerk-180.png">')
    .replace('</head>', '<link rel="manifest" href="werkstatt/manifest.webmanifest">'
      + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-title" content="Krachwerk"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
      + '</head>');
  return head + "<script>window.LOOPWERK_EDITION = 'make';</script>\n" + index + '</body></html>';
}

// Pfade relativ zu /werkstatt/manifest.webmanifest
function werkstattManifest() {
  const bg = bgToken(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  return JSON.stringify({
    name: 'Krachwerk', short_name: 'Krachwerk', lang: 'de',
    description: 'Mach aus jedem Geräusch ein Instrument – und daraus ganze Songs.',
    id: './', start_url: './', scope: './', display: 'standalone',
    background_color: bg, theme_color: bg,
    icons: [
      { src: '../assets/icons/krachwerk-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '../assets/icons/krachwerk-180.png', sizes: '180x180', type: 'image/png' },
      { src: '../assets/icons/krachwerk.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2);
}

// Dateiliste für den Service Worker (ADR 014): alles, was Krachwerk ohne Netz braucht – alle Module unter src/ (auch die
// erst bei Bedarf geladenen: Worklets, Rechen-Worker, Zerlegen), der MP3-Encoder und die Icons. Pfade relativ zu /werkstatt/.
// Keine Klänge: Krachwerk hat keine Kataloge.
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}
function precacheList() {
  const rel = (f) => '../' + path.relative(ROOT, f).split(path.sep).join('/');
  const sw = path.join(ROOT, 'src', 'werkstatt', 'sw.js');
  const src = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js') && f !== sw);
  const lame = walk(path.join(ROOT, 'vendor', 'lamejs')).filter((f) => f.endsWith('.js'));
  const icons = walk(path.join(ROOT, 'assets', 'icons')).filter((f) => /krachwerk/.test(path.basename(f)));
  return [...src, ...lame, ...icons].sort().map((f) => [rel(f), f]);
}

const FONT_CSS = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/;

// sw.js mit vorangestellter Liste; version = Prüfsumme über alle Dateien, damit jede neue Fassung neu vorgeladen wird
function werkstattSw(page, manifest) {
  const list = precacheList();
  const hash = crypto.createHash('sha1');
  const template = fs.readFileSync(path.join(ROOT, 'src', 'werkstatt', 'sw.js'), 'utf8');
  for (const part of [page, manifest, template]) hash.update(part);
  for (const [name, f] of list) hash.update(name).update(fs.readFileSync(f));
  const fonts = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(FONT_CSS)?.[1].replace(/&amp;/g, '&') ?? null;
  const pre = { version: hash.digest('hex').slice(0, 12), files: ['./', 'manifest.webmanifest', ...list.map(([name]) => name)], fonts };
  return `self.PRECACHE = ${JSON.stringify(pre)};\n` + template;
}

// Alle Dateien unter /werkstatt/: Name → [Inhalt, Typ]
function werkstattFiles(skeletonHead) {
  const page = werkstattPage(skeletonHead);
  const manifest = werkstattManifest();
  return {
    'index.html': [page, 'text/html'],
    'manifest.webmanifest': [manifest, 'application/manifest+json'],
    'sw.js': [werkstattSw(page, manifest), 'text/javascript'],
  };
}

module.exports = { werkstattPage, werkstattManifest, werkstattFiles, precacheList };
