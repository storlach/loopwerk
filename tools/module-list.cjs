// Alle Module, die src/main.js (direkt oder indirekt) statisch importiert – für <link rel="modulepreload"> in index.html.
const fs = require('fs');
const path = require('path');

function moduleList(root = path.resolve(__dirname, '..')) {
  const seen = new Set();
  const visit = (file) => {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/gm)) visit(path.resolve(path.dirname(file), m[1]));
    for (const m of src.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm)) visit(path.resolve(path.dirname(file), m[1]));
  };
  visit(path.join(root, 'src/main.js'));
  return [...seen];
}

module.exports = { moduleList };
if (require.main === module) console.log(moduleList().join('\n'));
