// Wozu: Nulltest für Optimierungen – rendert das Beispiel-Arrangement offline (wie der Export) und schreibt die Abtastwerte
// als Datei; --compare vergleicht zwei solche Dateien (größte Abweichung, Differenzpegel in dB, bitgleich ja/nein).
// Aufruf: node tools/perf/render-null.cjs --out <datei.f32> [--szene beispiel|beispiel-ohne-master|hall-spuren|alle-effekte] [--takte 8]
//         node tools/perf/render-null.cjs --compare <a.f32> <b.f32> [--grenze -100]
// Beispiel: LW_ROOT=/tmp/vorher node tools/perf/render-null.cjs --out /tmp/a.f32 && node tools/perf/render-null.cjs --out /tmp/b.f32
//           node tools/perf/render-null.cjs --compare /tmp/a.f32 /tmp/b.f32
// Exit-Code: 0 = geschrieben bzw. gleich (unter der Grenze), 1 = verschieden oder Fehler.
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || !args.length) {
  console.log('node tools/perf/render-null.cjs --out <datei.f32> [--szene beispiel|beispiel-ohne-master|hall-spuren|alle-effekte] [--takte 8]\nnode tools/perf/render-null.cjs --compare <a.f32> <b.f32> [--grenze -100]\nLW_ROOT=<ordner> rendert einen anderen Stand.');
  process.exit(0);
}

if (args.includes('--compare')) {
  const i = args.indexOf('--compare');
  const read = (f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const a = read(args[i + 1]);
  const b = read(args[i + 2]);
  const limit = Number(opt('--grenze', -100)); // derselbe Stand zweimal gerendert: um −112 dB (Faltung rechnet nicht bitgleich)
  let max = 0; let diff = 0; let ref = 0; let same = a.length === b.length;
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) {
    const d = a[k] - b[k];
    if (d !== 0) same = false;
    max = Math.max(max, Math.abs(d));
    diff += d * d;
    ref += a[k] * a[k];
  }
  const db = diff > 0 ? 10 * Math.log10(diff / Math.max(ref, 1e-30)) : -Infinity;
  console.log(`Längen ${a.length} / ${b.length} · bitgleich ${same ? 'ja' : 'nein'} · größte Abweichung ${max.toExponential(2)} · Differenz ${db === -Infinity ? '−∞' : db.toFixed(1)} dB`);
  process.exit(same || (a.length === b.length && db < limit) ? 0 : 1);
}

const { start, launch, newPage } = require('./lib.cjs');
(async () => {
  const out = opt('--out');
  const scene = opt('--szene', 'beispiel');
  const bars = Number(opt('--takte', 8));
  const srv = await start({ h2: false });
  const browser = await launch();
  const { page } = await newPage(browser, {});
  await page.goto(srv.origin + '/');
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  const data = await page.evaluate(async ({ scene, bars }) => {
    const { store, library, renderProject } = window.loopwerk;
    if (scene === 'beispiel-ohne-master') store.setMastering({ on: false });
    if (scene === 'hall-spuren') for (const t of store.project.tracks) store.setTrackFx(t.id, 'hall', { on: true });
    // alle-effekte: Verzerrer (Warm, Amp Crunch, Hart im Wechsel), Kompressor und Hall auf jeder Spur, Kompressor im
    // Master, dazu der Hall-Bus des Beispiels – deckt die Effekte ab, die früher eine Fassung `v` hatten
    if (scene === 'alle-effekte') {
      store.project.tracks.forEach((t, i) => {
        store.setTrackFx(t.id, 'drive', { on: true, type: ['soft', 'amp-crunch', 'hard'][i % 3], mix: 0.5 });
        store.setTrackFx(t.id, 'comp', { on: true });
        store.setTrackFx(t.id, 'hall', { on: true });
      });
      store.setMasterFx('comp', { on: true, amount: 0.3 });
    }
    await library.ensureProject(store.project);
    const buf = await renderProject(store.project, library, { toBeat: bars * store.project.beatsPerBar, tailSeconds: 1, compensate: true });
    const n = buf.length;
    const all = new Float32Array(n * 2);
    all.set(buf.getChannelData(0), 0);
    all.set(buf.getChannelData(1), n);
    // als Base64 zurück (schneller als ein Zahlen-Array)
    let s = '';
    const u8 = new Uint8Array(all.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, { scene, bars });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`${scene}, ${bars} Takte → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
  await browser.close();
  await srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
