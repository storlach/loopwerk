// Misst WAV-Dateien: Lautheit (LUFS, BS.1770 über src/dsp/loudness.js), Spitze, True Peak, Crest, Bänder, Stereobreite, Gleichanteil.
// Aufruf:  node tools/messen.cjs <datei.wav> [weitere …] [--json] [--ziel -8]
// Beispiel: node tools/messen.cjs mix-a.wav mix-b.wav --ziel -8
// Als Modul: const { messeDatei } = require('./messen.cjs')  (async, liefert das Messobjekt).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const HILFE = `Misst WAV-Dateien (16/24/32 Bit PCM, 32/64 Bit Gleitkomma, Mono/Stereo/mehr Kanäle).

Aufruf: node tools/messen.cjs <datei.wav> [weitere …] [Optionen]
  --json        Ausgabe als JSON (ein Feld je Datei)
  --ziel <LUFS> Zielwert, z. B. -8: Abweichung der Lautheit wird markiert (> 0,7 LU = "!")
  --help        diese Hilfe

Je Datei eine Zeile: LUFS (integriert, wie src/dsp/loudness.js; eine Mono-Datei zählt als ein Kanal),
Spitze (dBFS), True Peak (dBTP, 4-fach), Crest (Spitze minus RMS, dB), Energie in Sub 30-80 Hz / Bass 80-250 Hz /
Mitten 250-4000 Hz / Höhen > 4000 Hz (Prozent, die vier Bänder zusammen = 100 %), Breite = Seite zu Mitte in dB
(gesamt und unter 120 Hz; "-inf" = keine Seite, bei Mono "-"), Gleichanteil (größter Kanal-Mittelwert, % Vollaussteuerung), Dauer.
Ab zwei Dateien folgt eine Vergleichstabelle (Differenz zur ersten Datei).
Exit-Code: 0 = alles gemessen, 1 = Fehler (Datei fehlt, kein WAV, falsche Option).`;

// ---- WAV lesen ----
function leseWav(file) {
  const b = fs.readFileSync(file);
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') throw new Error('kein WAV (RIFF/WAVE fehlt)');
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('latin1', p, p + 4);
    let size = b.readUInt32LE(p + 4);
    const start = p + 8;
    if (start + size > b.length) size = b.length - start; // abgeschnittene Datei: lesen, was da ist
    if (id === 'fmt ') {
      let tag = b.readUInt16LE(start);
      if (tag === 0xfffe && size >= 26) tag = b.readUInt16LE(start + 24);
      fmt = { tag, ch: b.readUInt16LE(start + 2), sr: b.readUInt32LE(start + 4), bits: b.readUInt16LE(start + 14) };
    } else if (id === 'data') { data = { start, size }; break; }
    p = start + size + (size & 1);
  }
  if (!fmt) throw new Error('kein fmt-Block');
  if (!data) throw new Error('kein data-Block');
  const { tag, ch, sr, bits } = fmt;
  const float = tag === 3;
  if (!(tag === 1 || float)) throw new Error(`Format ${tag} nicht unterstützt (nur PCM und Gleitkomma)`);
  if (float ? ![32, 64].includes(bits) : ![8, 16, 24, 32].includes(bits)) throw new Error(`${bits} Bit nicht unterstützt`);
  const bytes = bits / 8;
  const frames = Math.floor(data.size / (bytes * ch));
  const chs = Array.from({ length: ch }, () => new Float32Array(frames));
  let o = data.start;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      let v;
      if (float) v = bits === 32 ? b.readFloatLE(o) : b.readDoubleLE(o);
      else if (bits === 16) v = b.readInt16LE(o) / 32768;
      else if (bits === 24) v = (b.readIntLE(o, 3)) / 8388608;
      else if (bits === 32) v = b.readInt32LE(o) / 2147483648;
      else v = (b[o] - 128) / 128;
      chs[c][i] = v;
      o += bytes;
    }
  }
  return { chs, sr, bits, float };
}

// ---- FFT (Radix 2) und Bandenergien ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, c = a + len / 2;
        const tr = re[c] * cr - im[c] * ci, ti = re[c] * ci + im[c] * cr;
        re[c] = re[a] - tr; im[c] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const BAENDER = [['sub', 30, 80], ['bass', 80, 250], ['mitten', 250, 4000], ['hoehen', 4000, Infinity]];
const N = 8192;

// Summe der Leistung je Band (Welch, Hann, 50 % Überlappung) für ein Signal x
function bandEnergien(x, sr) {
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const out = { sub: 0, bass: 0, mitten: 0, hoehen: 0, tief120: 0 };
  const re = new Float64Array(N), im = new Float64Array(N);
  const bin = sr / N;
  const hop = N / 2;
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * bin;
      const e = re[k] * re[k] + im[k] * im[k];
      for (const [id, lo, hi] of BAENDER) if (f >= lo && f < hi) { out[id] += e; break; }
      if (f < 120) out.tief120 += e;
    }
  }
  return out;
}

const dB = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);

async function messeDatei(file) {
  const L = await import(pathToFileURL(path.join(__dirname, '../src/dsp/loudness.js')).href);
  const { chs, sr, bits, float } = leseWav(file);
  const frames = chs[0].length;
  if (!frames) throw new Error('keine Audiodaten');
  let peak = 0, sq = 0, dcMax = 0;
  for (const x of chs) {
    let sum = 0;
    for (let i = 0; i < frames; i++) { const v = x[i]; const a = Math.abs(v); if (a > peak) peak = a; sq += v * v; sum += v; }
    dcMax = Math.max(dcMax, Math.abs(sum / frames));
  }
  const rms = Math.sqrt(sq / (frames * chs.length));
  const m = new Float32Array(frames);
  const s = chs.length > 1 ? new Float32Array(frames) : null;
  for (let i = 0; i < frames; i++) {
    m[i] = chs.length > 1 ? (chs[0][i] + chs[1][i]) / 2 : chs[0][i];
    if (s) s[i] = (chs[0][i] - chs[1][i]) / 2;
  }
  const em = bandEnergien(m, sr);
  // Anteile aus allen Kanälen (nicht aus der Mitte), sonst wäre ein Gegenphasen-Signal "leer"
  const ea = chs.length > 1 ? chs.map((c) => bandEnergien(c, sr)) : [em];
  for (const k of ['sub', 'bass', 'mitten', 'hoehen']) em[k + 'A'] = ea.reduce((t, e) => t + e[k], 0);
  const total = em.subA + em.bassA + em.mittenA + em.hoehenA || 1;
  const es = s ? bandEnergien(s, sr) : null;
  const sumM = em.sub + em.bass + em.mitten + em.hoehen;
  const sumS = es ? es.sub + es.bass + es.mitten + es.hoehen : 0;
  return {
    datei: file, name: path.basename(file), kanaele: chs.length, sampleRate: sr, bits, gleitkomma: float,
    dauer: frames / sr,
    lufs: L.integratedLoudness(chs.map((c) => c), sr),
    spitzeDb: 20 * Math.log10(peak || 1e-12),
    truePeakDb: L.truePeak(chs),
    crestDb: 20 * Math.log10((peak || 1e-12) / (rms || 1e-12)),
    baender: { sub: (100 * em.subA) / total, bass: (100 * em.bassA) / total, mitten: (100 * em.mittenA) / total, hoehen: (100 * em.hoehenA) / total },
    breiteDb: s ? dB(sumS / sumM) : null,
    breiteTiefDb: es ? dB(es.tief120 / em.tief120) : null,
    gleichanteil: dcMax,
  };
}

// ---- Ausgabe ----
const f1 = (x, u = '') => (x === null ? '-' : Number.isFinite(x) ? `${x.toFixed(1)}${u}` : x < 0 ? `-inf${u}` : `inf${u}`);
const sgn = (x, d = 1) => {
  if (!Number.isFinite(x)) return '-';
  const t = x.toFixed(d);
  return /^-?0\.?0*$/.test(t) ? (0).toFixed(d) : (x > 0 ? '+' : '') + t;
};

function zeile(r, ziel) {
  const abw = ziel != null && Number.isFinite(r.lufs) && Math.abs(r.lufs - ziel) > 0.7 ? `  ! ${sgn(r.lufs - ziel)} LU zum Ziel ${ziel}` : ziel != null ? '  (Ziel erreicht)' : '';
  const b = r.baender;
  return `${r.name}: ${f1(r.lufs)} LUFS | Spitze ${f1(r.spitzeDb)} dBFS | TP ${f1(r.truePeakDb)} dBTP | Crest ${f1(r.crestDb)} dB | ` +
    `Sub ${b.sub.toFixed(1)}% Bass ${b.bass.toFixed(1)}% Mitten ${b.mitten.toFixed(1)}% Höhen ${b.hoehen.toFixed(1)}% | ` +
    `Breite ${f1(r.breiteDb, ' dB')} (<120 Hz ${f1(r.breiteTiefDb, ' dB')}) | DC ${(r.gleichanteil * 100).toFixed(3)}% | ${r.dauer.toFixed(1)} s` + abw;
}

function vergleich(rs) {
  const sp = [['Datei', (r) => r.name], ['LUFS', (r) => f1(r.lufs)], ['Spitze', (r) => f1(r.spitzeDb)], ['TP', (r) => f1(r.truePeakDb)], ['Crest', (r) => f1(r.crestDb)],
    ['Sub%', (r) => r.baender.sub.toFixed(1)], ['Bass%', (r) => r.baender.bass.toFixed(1)], ['Mitt%', (r) => r.baender.mitten.toFixed(1)], ['Höh%', (r) => r.baender.hoehen.toFixed(1)],
    ['Breite', (r) => f1(r.breiteDb)], ['Br<120', (r) => f1(r.breiteTiefDb)]];
  const diff = (get) => (r, i) => (i === 0 ? get(r) : Number.isFinite(get(r)) && Number.isFinite(get(rs[0])) ? sgn(get(r) - get(rs[0])) : '-');
  const num = [null, (r) => r.lufs, (r) => r.spitzeDb, (r) => r.truePeakDb, (r) => r.crestDb, (r) => r.baender.sub, (r) => r.baender.bass, (r) => r.baender.mitten, (r) => r.baender.hoehen, (r) => r.breiteDb ?? NaN, (r) => r.breiteTiefDb ?? NaN];
  const rows = rs.map((r, i) => sp.map(([, g], c) => (c === 0 ? r.name : i === 0 || !num[c] ? g(r) : diff(num[c])(r, i))));
  const w = sp.map(([h], c) => Math.max(h.length, ...rows.map((r) => String(r[c]).length)));
  const fmt = (cells) => cells.map((x, c) => (c === 0 ? String(x).padEnd(w[c]) : String(x).padStart(w[c]))).join('  ');
  return ['\nVergleich (ab Zeile 2: Differenz zur ersten Datei):', fmt(sp.map(([h]) => h)), ...rows.map(fmt)].join('\n');
}

async function main() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.includes('-h')) { console.log(HILFE); return 0; }
  const files = [];
  let json = false, ziel = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--json') json = true;
    else if (a[i] === '--ziel') { ziel = Number(a[++i]); if (!Number.isFinite(ziel)) { console.error('Fehler: --ziel braucht eine Zahl, z. B. --ziel -8'); return 1; } }
    else if (a[i].startsWith('--') && a[i] !== '--') { console.error(`Fehler: unbekannte Option ${a[i]} (siehe --help)`); return 1; }
    else files.push(a[i]);
  }
  if (!files.length) { console.error('Fehler: keine Datei angegeben (siehe --help)'); return 1; }
  const rs = [];
  let bad = 0;
  for (const f of files) {
    try { rs.push(await messeDatei(f)); } catch (e) { bad++; console.error(`Fehler bei ${f}: ${e.message}`); }
  }
  if (json) console.log(JSON.stringify(rs.map((r) => ({ ...r, ziel, lufsAbweichung: ziel != null ? r.lufs - ziel : null })), (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2));
  else {
    for (const r of rs) console.log(zeile(r, ziel));
    if (rs.length > 1) console.log(vergleich(rs));
  }
  return bad ? 1 : 0;
}

module.exports = { messeDatei, zeile, leseWav };
if (require.main === module) main().then((c) => process.exit(c), (e) => { console.error('Fehler: ' + e.message); process.exit(1); });
