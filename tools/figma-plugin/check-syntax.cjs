// Prüft, dass code.js nur Sprachmittel bis ES2017 nutzt (kein ?., ??, Objekt-Spread …), damit es in jeder Figma-Version läuft.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const file = path.join(__dirname, 'code.js');
try {
  acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2017, sourceType: 'script' });
  console.log('✔ code.js ist gültiges ES2017');
} catch (e) {
  console.error('✘ code.js ist kein ES2017: ' + e.message);
  process.exitCode = 1;
}
