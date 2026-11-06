// Sonic-Pi-FX-One-Shots (src/catalog.js, Dateien in assets/samples/sonicpi/): Datei vorhanden und lesbar (WAV 16 Bit,
// 44,1 kHz, Stereo), Länge, nicht still, kein Clipping, Spitze auf FX-Ziel (0,5), sauberes Ende, Lizenz CC0 mit
// Quelle, Kategorie fx, One-Shot, eindeutige deutsche Namen gegenüber dem ganzen Regal.
// node tests/sonicpi-fx.test.cjs
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const NEW = {
  vinyl_backspin: 'Platte rückwärts',
  vinyl_rewind: 'Rückspulen (Platte)',
  vinyl_scratch: 'Scratch (Platte)',
  ambi_dark_woosh: 'Dunkler Woosh',
  ambi_lunar_land: 'Mondlandung',
  perc_impact1: 'Einschlag 1',
  perc_impact2: 'Einschlag 2',
  perc_swoosh: 'Swoosh kurz',
  perc_swash: 'Swash',
  glitch_robot1: 'Roboter-Glitch 1',
  glitch_robot2: 'Roboter-Glitch 2',
};
const VERBOSE = process.argv.includes('--verbose');
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';

let failed = 0;
let passed = 0;
const check = (ok, msg) => {
  if (ok) passed++;
  else { failed++; console.log('FEHLER:', msg); }
};

// WAV lesen: nur PCM 16 Bit, Chunks suchen
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('kein WAV');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data') data = b.subarray(body, Math.min(b.length, body + size));
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('fmt/data fehlt');
  const frames = Math.floor(data.length / (fmt.channels * 2));
  const ch = [new Float64Array(frames), new Float64Array(frames)];
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < 2; c++) ch[c][i] = data.readInt16LE((i * fmt.channels + (fmt.channels === 1 ? 0 : c)) * 2) / 32768;
  }
  return { fmt, ch, frames };
}

(async () => {
  const { CATALOG } = await import(pathToFileURL(path.join(ROOT, 'src/catalog.js')).href);
  const X = await import(pathToFileURL(path.join(ROOT, 'src/loops-fx.js')).href);
  const SR = 44100;

  // Eindeutigkeit der Namen über das ganze Regal (Katalog und synthetische FX/Loops)
  const names = [...CATALOG.map((e) => e.name), ...X.FX_LOOP_DEFS.map((d) => d.name)];
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  check(dup.length === 0, `doppelte Namen: ${[...new Set(dup)].join(', ')}`);
  const ids = CATALOG.map((e) => e.id);
  check(new Set(ids).size === ids.length, 'doppelte Katalog-IDs');

  for (const [file, name] of Object.entries(NEW)) {
    const id = 'sp-' + file.replace(/_/g, '-');
    const e = CATALOG.find((x) => x.id === id);
    check(!!e, `${id}: fehlt im Katalog`);
    if (!e) continue;
    check(e.name === name, `${id}: Name „${e.name}“ statt „${name}“`);
    check(e.category === 'fx', `${id}: Kategorie ${e.category}`);
    check(e.kind === 'oneshot', `${id}: kein One-Shot`);
    check(e.license === 'CC0' && e.licenseUrl === CC0_URL, `${id}: Lizenz nicht CC0`);
    check(e.origin === 'Sonic Pi', `${id}: Herkunft ${e.origin}`);
    check(/^https:\/\/freesound\.org\/people\/.+\/sounds\/\d+\/$/.test(e.source), `${id}: Quelle ${e.source}`);
    check(Array.isArray(e.tags) && e.tags.length >= 3, `${id}: zu wenige Suchwörter`);
    check(Array.isArray(e.genres) && e.genres.length >= 1, `${id}: keine Genres`);
    check(!e.key || e.key === 'keine', `${id}: Tonart ${e.key} für FX`);

    const file2 = path.join(ROOT, e.file);
    check(e.file === `assets/samples/sonicpi/${file}.wav`, `${id}: Pfad ${e.file}`);
    if (!fs.existsSync(file2)) { check(false, `${id}: Datei fehlt (${e.file})`); continue; }
    let w;
    try { w = readWav(file2); } catch (err) { check(false, `${id}: ${err.message}`); continue; }
    check(w.fmt.format === 1 && w.fmt.bits === 16 && w.fmt.rate === SR && w.fmt.channels === 2, `${id}: Format ${JSON.stringify(w.fmt)}`);
    const dur = w.frames / SR;
    check(dur >= 0.2 && dur <= 4.0 + 1e-6, `${id}: Länge ${dur.toFixed(3)} s`);

    let peak = 0, sum = 0, nan = 0;
    for (const d of w.ch) for (let i = 0; i < w.frames; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const rmsDb = 10 * Math.log10(sum / (2 * w.frames) + 1e-20);
    check(nan === 0, `${id}: ${nan} NaN-Werte`);
    check(rmsDb > -40, `${id}: fast still (${rmsDb.toFixed(1)} dBFS)`);
    check(peak < 1, `${id}: Clipping (Spitze ${peak})`);
    check(Math.abs(peak - 0.5) < 0.01, `${id}: Spitze ${peak.toFixed(3)} statt 0,5`);

    // Ende: letzte 2 ms leise
    let tail = 0;
    for (const d of w.ch) for (let i = w.frames - Math.round(0.002 * SR); i < w.frames; i++) tail = Math.max(tail, Math.abs(d[i]));
    check(tail < 0.02, `${id}: Ende nicht ausgeblendet (${tail.toFixed(4)})`);
    // Klang beginnt in den ersten 50 ms (Onset-Schwelle 1 % der Spitze, sanfte Anfänge bleiben)
    let head = 0;
    for (const d of w.ch) for (let i = 0; i < Math.min(w.frames, Math.round(0.05 * SR)); i++) head = Math.max(head, Math.abs(d[i]));
    check(head > 0.003, `${id}: kein Klang in den ersten 50 ms (${head.toFixed(4)})`);
    if (VERBOSE) console.log(`${id}: ${dur.toFixed(2)} s, Spitze ${peak.toFixed(3)}, RMS ${rmsDb.toFixed(1)} dBFS`);
  }

  console.log(`sonicpi-fx: ${passed} geprüft, ${failed} Fehler`);
  if (failed) process.exit(1);
})().catch((err) => { console.error(err); process.exit(1); });
