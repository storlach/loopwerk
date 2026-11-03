// Erzeugt die Dateien von Krachwerk (/werkstatt/, ADR 007): die volle App aus index.html – unverändert bis auf
// Wörter (Name, Ladesatz) –, dazu die Edition-Zeile, Manifest und Service Worker. Kein zweites index.html im Repo.
// Genutzt von tools/build-pages.cjs (GitHub Pages) und tests/serve.cjs (lokal).
// Adresse (Spec krachwerk-5-song §7): KW_PATH (Standard „werkstatt“) ist der Schalter für den Umzug nach /krachwerk/. Mit
// KW_PATH=krachwerk entsteht dort die App; unter /werkstatt/ liegen dann nur noch eine Weiterleitung und ein Service Worker,
// der sich abmeldet. Umgestellt wird erst nach Martins Entscheidung (dann Nachtrag zu ADR 007).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OLD_PATH = 'werkstatt';
const kwPath = () => process.env.KW_PATH || OLD_PATH;
// Feste Kennung der installierten App: der heutige start_url-Wert auf GitHub Pages. Ein Umzug der Adresse
// ändert sie nicht – sonst stünde die App danach doppelt auf dem Home-Bildschirm.
const MANIFEST_ID = '/loopwerk/werkstatt/';

// Jede Ersetzung mit erwarteter Anzahl: ändert sich index.html, fällt es hier sofort auf
const WORDS = [
  ['<title>Loopwerk</title>', '<title>Krachwerk</title>', 1],
  ['Loopwerk wird geladen', 'Krachwerk wird geladen', 1],
  ['Loop<b>werk</b>', 'Krach<b>werk</b>', 2],
  ['<div class="splash-bars" aria-hidden="true">', '<div class="splash-bars splash-klatscher" aria-hidden="true">', 1],
  ['I Like To Loop it Loop it', 'Mach aus jedem Geräusch ein Instrument.', 1],
  ['Private use only', 'Nur privat', 2], // nur Krachwerk: Fußzeile deutsch (Spec krachwerk-5-song §11.5)
  ['<link rel="icon" href="assets/icons/favicon.svg" type="image/svg+xml">', '<link rel="icon" href="assets/icons/krachwerk.svg" type="image/svg+xml">', 1],
  ['<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">', '<link rel="apple-touch-icon" href="assets/icons/krachwerk-180.png">', 1],
];

function bgToken(index) {
  const m = index.match(/\n {2}:root \{[\s\S]*?--bg:\s*(#[0-9A-Fa-f]{6})/);
  if (!m) throw new Error('Token --bg in index.html nicht gefunden');
  return m[1];
}

function werkstattPage(skeletonHead, dir = kwPath()) {
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
    .replace('</head>', `<link rel="manifest" href="${dir}/manifest.webmanifest">`
      + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-title" content="Krachwerk"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
      + '</head>');
  return head + `<script>window.LOOPWERK_EDITION = 'make'; window.LOOPWERK_PATH = '${dir}';</script>\n` + index + '</body></html>';
}

// Pfade relativ zum Manifest (eine Ebene unter der Wurzel)
function werkstattManifest() {
  const bg = bgToken(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  return JSON.stringify({
    name: 'Krachwerk', short_name: 'Krachwerk', lang: 'de',
    description: 'Mach aus jedem Geräusch ein Instrument – und daraus ganze Songs.',
    id: MANIFEST_ID, start_url: './', scope: './', display: 'standalone',
    background_color: bg, theme_color: bg,
    icons: [
      { src: '../assets/icons/krachwerk-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '../assets/icons/krachwerk-180.png', sizes: '180x180', type: 'image/png' },
      { src: '../assets/icons/krachwerk.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2);
}

// Alle Programmdateien, die der Service Worker vorab zwischenspeichert (Pfade relativ zu <Adresse>/sw.js): die App lädt manches erst
// bei Gebrauch (Aufnahme-Worklet, Rechen-Worker, MP3), das ohne Netz sonst beim ersten Mal fehlte
function precacheList() {
  const out = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`;
      if (f.isDirectory()) { if (rel !== 'src/werkstatt') walk(rel); } else if (/\.js$/.test(f.name)) out.push('../' + rel);
    }
  };
  walk('src');
  out.push('../vendor/lamejs/lame.min.js');
  return out;
}

// Alle Dateien unter /werkstatt/: Name → [Inhalt, Typ]
function werkstattFiles(skeletonHead, dir = kwPath()) {
  return {
    'index.html': [werkstattPage(skeletonHead, dir), 'text/html'],
    'manifest.webmanifest': [werkstattManifest(), 'application/manifest+json'],
    'sw.js': [fs.readFileSync(path.join(ROOT, 'src', 'werkstatt', 'sw.js'), 'utf8').replace('/*PRECACHE*/', precacheList().map((u) => JSON.stringify(u)).join(',')), 'text/javascript'],
  };
}

// Nach dem Umzug: unter der alten Adresse Weiterleitung (mit Abfrage und Anker) und ein Service Worker, der sich abmeldet
function redirectFiles(to) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Krachwerk</title>`
    + `<meta http-equiv="refresh" content="0;url=../${to}/"><script>location.replace('../${to}/' + location.search + location.hash);</script></head>`
    + `<body><p>Krachwerk ist umgezogen: <a href="../${to}/">hier geht es weiter</a>.</p></body></html>`;
  const sw = `// Alter Service Worker von Krachwerk: meldet sich ab, räumt den Zwischenspeicher und lädt die Seiten neu (sie leiten dann weiter).\n`
    + `self.addEventListener('install', () => self.skipWaiting());\n`
    + `self.addEventListener('activate', (e) => e.waitUntil((async () => {\n`
    + `  for (const k of await caches.keys()) if (k.startsWith('krachwerk-')) await caches.delete(k);\n`
    + `  await self.registration.unregister();\n`
    + `  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);\n`
    + `})()));\n`;
  return { 'index.html': [html, 'text/html'], 'sw.js': [sw, 'text/javascript'] };
}

module.exports = { werkstattPage, werkstattManifest, werkstattFiles, redirectFiles, kwPath, OLD_PATH, MANIFEST_ID };
