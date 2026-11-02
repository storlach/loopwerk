// Erzeugt die Dateien von Krachwerk (/werkstatt/) aus index.html: dasselbe Gerüst, dieselben Phosphor-Tokens und
// Schriften, dazu die Edition-Zeile, Manifest und Service Worker. So gibt es kein zweites index.html im Repo und die
// Tokens bleiben an einer Stelle. Genutzt von tools/build-pages.cjs (GitHub Pages) und tests/serve.cjs (lokal).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function source() {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tokens = index.match(/\n {2}:root \{[\s\S]*?\n {2}\}/);
  const fonts = index.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);
  const bg = tokens?.[0].match(/--bg:\s*(#[0-9A-Fa-f]{6})/);
  if (!tokens || !fonts || !bg) throw new Error('Tokens oder Schriften in index.html nicht gefunden');
  return { tokens: tokens[0], fonts: fonts[0], bg: bg[1] };
}

function werkstattPage(skeletonHead) {
  const { tokens, fonts } = source();
  // Seite liegt eine Ebene tiefer; <base> lässt src/ und assets/icons/ wie gewohnt auflösen
  const head = skeletonHead
    .replace('<head>', '<head><base href="../">')
    .replace('</head>', '<title>Krachwerk</title>'
      + '<link rel="manifest" href="werkstatt/manifest.webmanifest">'
      + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-title" content="Krachwerk"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
      + '</head>');
  return head
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + fonts + '\n'
    + `<style>${tokens}\n</style>\n`
    + '<link rel="stylesheet" href="src/werkstatt/werkstatt.css">\n'
    + "<script>window.LOOPWERK_EDITION = 'make';</script>\n"
    + '<div id="app" data-edition="make"></div>\n'
    + '<script type="module" src="src/werkstatt/main.js"></script>\n'
    + '</body></html>';
}

// Pfade relativ zu /werkstatt/manifest.webmanifest
function werkstattManifest() {
  const { bg } = source();
  return JSON.stringify({
    name: 'Krachwerk', short_name: 'Krachwerk', lang: 'de',
    description: 'Mach aus jedem Geräusch ein Instrument.',
    id: './', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
    background_color: bg, theme_color: bg,
    icons: [
      { src: '../assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '../assets/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }, null, 2);
}

// Alle Dateien unter /werkstatt/: Name → [Inhalt, Typ]
function werkstattFiles(skeletonHead) {
  return {
    'index.html': [werkstattPage(skeletonHead), 'text/html'],
    'manifest.webmanifest': [werkstattManifest(), 'application/manifest+json'],
    'sw.js': [fs.readFileSync(path.join(ROOT, 'src', 'werkstatt', 'sw.js'), 'utf8'), 'text/javascript'],
  };
}

module.exports = { werkstattPage, werkstattManifest, werkstattFiles };
