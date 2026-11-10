#!/usr/bin/env node
// Erneuert den Bezug tests/fixtures/druck-old-patterns.json (Block-RMS alter Beat-/Melodie-Patterns, geprüft in
// tests/druck.test.cjs), wenn sich Kit-Stimmen gewollt ändern. Nur die mit --muster genannten Einträge werden neu
// geschrieben, die übrigen behalten ihren alten Bezug (und die Ausgabe zeigt, ob sie noch passen).
// Aufruf:  node tools/klang/druck-bezug.cjs [--muster neu,elektro,techno] [--write]
// Beispiel: node tools/klang/druck-bezug.cjs            (nur messen und zeigen)
const HILFE = `Erneuert Einträge in tests/fixtures/druck-old-patterns.json.

  node tools/klang/druck-bezug.cjs [--muster neu,elektro,techno] [--write]

Ohne --write: misst und zeigt je Eintrag die Abweichung zum gespeicherten Bezug (relativ, Block-RMS) und die
Wiederholgenauigkeit (zweimal derselbe Code). Mit --write: die Einträge aus --muster (Voreinstellung neu,elektro,techno)
werden mit dem jetzigen Klang überschrieben. Akustik und Bass bleiben, solange sie nicht genannt sind.
Exit-Code: 0 = gemessen (bzw. geschrieben), 1 = Bedien- oder Messfehler.`;
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HILFE); process.exit(0); }
const mi = args.indexOf('--muster');
const MUSTER = mi >= 0 ? (args[mi + 1] || '').split(',').filter(Boolean) : ['neu', 'elektro', 'techno'];
for (let i = 0; i < args.length; i++) { if (args[i] === '--write') continue; if (args[i] === '--muster') { i++; continue; } console.error(`Fehler: unbekannte Option ${args[i]}\n\n${HILFE}`); process.exit(1); }
const fs = require('fs');
const REPO = require('path').join(__dirname, '..', '..');
const { openApp } = require(REPO + '/tests/harness.cjs');
const file = REPO + '/tests/fixtures/druck-old-patterns.json';
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
(async () => {
  const app = await openApp({ fresh: true });
  const res = await app.page.evaluate(async (ref) => {
    const I = await import('./src/instruments.js');
    const { library } = window.loopwerk;
    await library.ensureMany(['sp-bd-haus', 'sp-drum-snare-hard', 'sp-perc-snap', 'sp-drum-cymbal-closed', 'sp-drum-cymbal-open', 'sp-drum-tom-lo-hard', 'sp-drum-tom-mid-hard', 'sp-drum-cymbal-hard']);
    const N = 64;
    const fp = (buf) => [0, 1].map((c) => { const d = buf.getChannelData(c); const per = Math.floor(d.length / N); return Array.from({ length: N }, (_, j) => { let s = 0; for (let i = j * per; i < (j + 1) * per; i++) s += d[i] * d[i]; return Math.sqrt(s / per); }); });
    const dev = (a, b) => { let m = 0; for (let c = 0; c < 2; c++) for (let j = 0; j < N; j++) m = Math.max(m, Math.abs(a[c][j] - b[c][j]) / Math.max(1e-6, b[c][j])); return m; };
    const out = {};
    for (const [name, r] of Object.entries(ref)) {
      const f = fp((await I.renderPattern(r.pattern, 124, library)).buffer);
      const f2 = fp((await I.renderPattern(r.pattern, 124, library)).buffer);
      out[name] = { fp: f.map((ch) => ch.map((x) => +x.toPrecision(7))), devOld: dev(f, r.fp), repeat: dev(f2, f) };
    }
    return out;
  }, json.patterns);
  for (const [n, r] of Object.entries(res)) console.log(n, 'Abweichung zum alten Bezug', r.devOld.toExponential(2), 'Wiederholung', r.repeat.toExponential(1));
  for (const n of MUSTER) { if (!json.patterns[n]) { console.error(`Fehler: kein Eintrag ${n}`); process.exit(1); } json.patterns[n].fp = res[n].fp; }
  json.note = 'Block-RMS (64 Blöcke je Kanal) alter Beat-/Melodie-Patterns, 124 BPM. Akustik und Bass: Stand vor „Druck“ (9b91aff). Elektro, neuer Beat, Techno: neu erzeugt mit den Kit-Stimmen nach „Klangfarbe“ (Kick, Snare, Hats, Clap, Rim 2026-11), Bezug unverändert für alle späteren Änderungen.';
  if (process.argv.includes('--write')) { fs.writeFileSync(file, JSON.stringify(json)); console.log('geschrieben'); }
  await app.close();
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
