// Erzeugt die Seite von Krachwerk (/werkstatt/) aus index.html: dasselbe Gerüst, dieselben Phosphor-Tokens und
// Schriften, dazu die Edition-Zeile. So gibt es kein zweites index.html im Repo und die Tokens bleiben an einer Stelle.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function werkstattPage(skeletonHead) {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tokens = index.match(/\n {2}:root \{[\s\S]*?\n {2}\}/);
  const fonts = index.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/);
  if (!tokens || !fonts) throw new Error('Tokens oder Schriften in index.html nicht gefunden');
  // Seite liegt eine Ebene tiefer; <base> lässt src/ und assets/icons/ wie gewohnt auflösen
  const head = skeletonHead.replace('<head>', '<head><base href="../">');
  return head
    + '<title>Krachwerk</title>\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + fonts[0] + '\n'
    + `<style>${tokens[0]}\n</style>\n`
    + '<link rel="stylesheet" href="src/werkstatt/werkstatt.css">\n'
    + "<script>window.LOOPWERK_EDITION = 'make';</script>\n"
    + '<div id="app" data-edition="make"></div>\n'
    + '<script type="module" src="src/werkstatt/main.js"></script>\n'
    + '</body></html>';
}

module.exports = { werkstattPage };
