// Ausgabe der m3-Ergebnisse als kompakte Zeilen. Aufruf: node show-m3.cjs datei.json …
for (const f of process.argv.slice(2)) {
  let j; try { j = require(require('path').resolve(f)); } catch (e) { console.log('fehlt', f); continue; }
  console.log('\n=====', f, 'Last', j.load);
  const o = j.out;
  const keys = ['fps', 'p95', 'max', 'lt', 'ltSum', 'ltMax', 'busy', 'script', 'layout', 'durMed', 'durP95', 'durMax', 'gapMax', 'over125', 'late', 'lateMax', 'sync', 'used', 'all', 'cost', 'roomCost', 'glQ', 'items', 'dom', 'clips', 'json'];
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v == null) continue;
    if (typeof v !== 'object') { console.log(k.padEnd(16), String(v)); continue; }
    console.log(k.padEnd(16), keys.filter((x) => x in v).map((x) => x + ' ' + v[x]).join(' · '));
  }
}
