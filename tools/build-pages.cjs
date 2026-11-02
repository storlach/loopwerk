// Baut die Seite für GitHub Pages nach `_site/`: index.html mit demselben Gerüst wie lokal und im Artifact,
// dazu Quellcode, Sounds und lamejs. Kein Bundling – die ES-Module werden direkt ausgeliefert.
const fs = require('fs');
const path = require('path');
const { SKELETON_HEAD } = require('../tests/serve.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_site');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
const head = SKELETON_HEAD;
fs.writeFileSync(path.join(OUT, 'index.html'), head + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>');
// Krachwerk (Edition „make“) unter /werkstatt/ mit Manifest und Service Worker – dort geht auch das Mikrofon
fs.mkdirSync(path.join(OUT, 'werkstatt'));
for (const [name, [body]] of Object.entries(require('./werkstatt-page.cjs').werkstattFiles(head))) fs.writeFileSync(path.join(OUT, 'werkstatt', name), body);
for (const dir of ['src', 'assets', 'vendor']) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
// UX-Entwürfe mit ausliefern, damit man sie im Browser ansehen kann
fs.cpSync(path.join(ROOT, 'docs', 'ux'), path.join(OUT, 'docs', 'ux'), { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Seite gebaut:', path.relative(ROOT, OUT));
