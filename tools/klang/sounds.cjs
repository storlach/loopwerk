#!/usr/bin/env node
// Misst die Klangfarbe der Sounds selbst (nicht fertiger WAV-Dateien): synthetische Bibliothek, Drum-Kits, Melodie-Klänge,
// Sprung am Notenende des E-Pianos, kleine Lautsprecher (Hochpass 150 Hz) der Song-Starter. Offline im Headless-Chromium.
// Aufruf:  node tools/klang/sounds.cjs [--teile lib,kits,klaenge,piano,starter] [--ids a,b|@bass|@<kategorie>] [--out f.json]
//          [--vergleich vorher.json] [--repo <ordner>]
// Beispiel: node tools/klang/sounds.cjs --repo /tmp/alt --out vorher.json && node tools/klang/sounds.cjs --vergleich vorher.json
const fs = require('fs');
const path = require('path');

const HILFE = `Misst die Klangfarbe der Sounds (Offline-Rendering im Browser, wie die Tests).

  node tools/klang/sounds.cjs [Optionen]
  --teile <liste>     lib, kits, klaenge, piano, starter (Voreinstellung: alle)
  --ids <liste>       nur diese Bibliotheks-Sounds; @bass = die 11 Sub-Bässe der Klanganalyse, @drums/@chords/… = Kategorie
  --starter <liste>   Starter für "starter" (Voreinstellung pop,hiphop,lofi,trap,techno,ambient,breaks,demo)
  --out <datei>       Ergebnis als JSON speichern
  --vergleich <datei> früheres JSON danebenstellen (vorher → nachher, "!" bei mehr als 2 LU Lautheit oder 1 dB Mono-Summe)
  --repo <ordner>     anderen Stand messen (z. B. ein ausgepacktes "git archive"), Voreinstellung dieses Repo
  --help              diese Hilfe

Je Sound: Lautheit (LUFS), Mono-Summe (LUFS von (L+R)/2), Breite (Seite/(Mitte+Seite), 0 = mono), Seite unter 150 Hz,
Verlust bei Hochpass 150 Hz (LU), Anteil über 250 Hz und über 2 kHz (%), Schwerpunkt (Hz), Länge.
Kits: je Zeile ein Schlag (Kurzzeit-Lautheit 400 ms, Sub 30–80 Hz, Körper 150–300 Hz, Schwerpunkt, Länge bis −40 dB, Breite).
Klänge: Melodie und Akkord je Synth-Klang (Lautheit, Mono, Breite). Piano: größter Abfall je 2 ms am Notenende (dB).
Starter: Refrain mit Schutz-Limiter, Verlust bei Hochpass 150 Hz, Breite, Anteil über 2 kHz.
Exit-Code: 0 = gemessen, 1 = Bedien- oder Messfehler.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HILFE); process.exit(0); }
const opt = (name, def = null) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; if (!v || v.startsWith('--')) { console.error(`Fehler: ${name} braucht einen Wert.\n\n${HILFE}`); process.exit(1); } return v; };
const known = ['--teile', '--ids', '--starter', '--out', '--vergleich', '--repo'];
for (let i = 0; i < args.length; i++) { if (known.includes(args[i])) { i++; continue; } console.error(`Fehler: unbekannte Option ${args[i]}\n\n${HILFE}`); process.exit(1); }
const REPO = path.resolve(opt('--repo', path.join(__dirname, '..', '..')));
if (!fs.existsSync(path.join(REPO, 'tests', 'harness.cjs'))) { console.error(`Fehler: ${REPO} ist kein Loopwerk-Stand (tests/harness.cjs fehlt)`); process.exit(1); }
const parts = opt('--teile', 'lib,kits,klaenge,piano,starter').split(',');
const SUBS = ['bass-sub', 'techno-rumble', 'gen-hiphop-bass', 'gen-hiphop-jazzbass', 'gen-trap-808', 'gen-trap-808prog', 'gen-lofi-bass', 'gen-lofi-bass2', 'gen-dnb-liquidbass', 'gen-reggaeton-bass', 'gen-ambient-sub'];
const idsOpt = opt('--ids', '');
const starters = opt('--starter', 'pop,hiphop,lofi,trap,techno,ambient,breaks,demo').split(',');
const before = opt('--vergleich') ? JSON.parse(fs.readFileSync(opt('--vergleich'), 'utf8')) : null;

// Läuft im Browser: Messhelfer
function helpers() {
  window.__kh = (async () => {
    const L = await import('./src/dsp/loudness.js');
    const F = await import('./src/dsp/fft.js');
    const N = 4096, sr = 44100, win = F.hann(N);
    const spec = (buf) => {
      const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
      const pm = new Float64Array(N / 2), ps = new Float64Array(N / 2);
      const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
      for (let s = 0; s < l.length; s += N / 2) {
        for (let i = 0; i < N; i++) { const x = l[s + i] ?? 0, y = r[s + i] ?? 0; re[i] = 0.5 * (x + y) * win[i]; im[i] = 0; re2[i] = 0.5 * (x - y) * win[i]; im2[i] = 0; }
        F.fft(re, im); F.fft(re2, im2);
        for (let k = 0; k < N / 2; k++) { pm[k] += re[k] * re[k] + im[k] * im[k]; ps[k] += re2[k] * re2[k] + im2[k] * im2[k]; }
      }
      return { pm, ps };
    };
    const r1 = (x) => Math.round(x * 10) / 10;
    window.__hp = async (b, f) => {
      const ctx = new OfflineAudioContext(2, b.length, b.sampleRate);
      const s = ctx.createBufferSource(); s.buffer = b;
      let n = s; for (let i = 0; i < 2; i++) { const q = ctx.createBiquadFilter(); q.type = 'highpass'; q.frequency.value = f; n = n.connect(q); }
      n.connect(ctx.destination); s.start(); return ctx.startRendering();
    };
    const lufs = (b) => L.integratedLoudness([b.getChannelData(0), b.getChannelData(b.numberOfChannels > 1 ? 1 : 0)], sr);
    window.__m = async (buf) => {
      const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
      const mono = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
      const { pm, ps } = spec(buf);
      let tot = 0, mid = 0, side = 0, lowM = 0, lowS = 0, cen = 0, sub = 0, body = 0, over250 = 0, over2k = 0;
      for (let k = 1; k < N / 2; k++) {
        const f = (k * sr) / N, p = pm[k] + ps[k];
        if (f >= 30) tot += p;
        mid += pm[k]; side += ps[k]; cen += f * p;
        if (f >= 20 && f < 150) { lowM += pm[k]; lowS += ps[k]; }
        if (f >= 30 && f < 80) sub += p;
        if (f >= 150 && f < 300) body += p;
        if (f >= 250) over250 += p;
        if (f >= 2000) over2k += p;
      }
      const pc = (x) => r1((100 * x) / (tot || 1));
      const st = lufs(buf);
      return {
        lufs: r1(st), mono: r1(L.integratedLoudness([mono, mono], sr)), width: +(side / (mid + side + 1e-20)).toFixed(3),
        lowSide: +(lowS / (lowM + lowS + 1e-20)).toFixed(3), hp150: r1(st - lufs(await window.__hp(buf, 150))),
        sub: pc(sub), body: pc(body), over250: pc(over250), over2k: pc(over2k), centroid: Math.round(cen / (mid + side + 1e-20)), len: buf.length,
      };
    };
    window.__mom = (buf) => {
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      let best = -Infinity; const w = Math.round(0.4 * sr);
      for (let a = 0; a + w <= l.length; a += Math.round(0.05 * sr)) best = Math.max(best, L.integratedLoudness([l.subarray(a, a + w), r.subarray(a, a + w)], sr));
      return r1(best);
    };
    window.__len40 = (buf) => { const d = buf.getChannelData(0); let p = 0; for (const x of d) p = Math.max(p, Math.abs(x)); let e = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > p * 0.01) e = i; return +(e / sr).toFixed(3); };
    // größter Abfall zwischen zwei 2-ms-Schritten des Effektivwerts (10-ms-Fenster) im Bereich ±40 ms um end (s)
    window.__jump = (buf, end) => {
      const d = buf.getChannelData(0); const w = Math.round(0.01 * sr), st = Math.round(0.002 * sr); const e = [];
      for (let a = 0; a + w < d.length; a += st) { let s = 0; for (let i = a; i < a + w; i++) s += d[i] * d[i]; e.push(Math.sqrt(s / w)); }
      const db = (x) => 20 * Math.log10(x + 1e-9);
      let m = 0; for (let k = Math.max(1, Math.round((end - 0.04) * sr / st)); k < Math.min(e.length, Math.round((end + 0.04) * sr / st)); k++) m = Math.max(m, db(e[k - 1]) - db(e[k]));
      return +m.toFixed(2);
    };
    return true;
  })();
}

(async () => {
  const { openApp } = require(path.join(REPO, 'tests', 'harness.cjs'));
  const app = await openApp({ fresh: true });
  const { page } = app;
  page.setDefaultTimeout(3600000);
  const res = {};
  try {
    await page.evaluate(helpers);
    await page.evaluate(() => window.__kh);
    if (parts.includes('lib')) {
      res.lib = await page.evaluate(async ({ idsOpt, SUBS }) => {
        const { library } = window.loopwerk;
        const all = library.list().filter((s) => s.def && !s.id.startsWith('gtr-'));
        let list = all;
        if (idsOpt === '@bass') list = all.filter((s) => SUBS.includes(s.id));
        else if (idsOpt.startsWith('@')) list = all.filter((s) => s.category === idsOpt.slice(1));
        else if (idsOpt) list = all.filter((s) => idsOpt.split(',').includes(s.id));
        const o = {};
        for (const s of list) { await library.ensure(s.id); o[s.id] = { cat: s.category, ...(await window.__m(s.orig || s.buffer)) }; }
        return o;
      }, { idsOpt, SUBS });
    }
    if (parts.includes('kits')) {
      res.kits = await page.evaluate(async () => {
        const I = await import('./src/instruments.js');
        const { library } = window.loopwerk;
        const out = {};
        for (const kit of I.KITS.filter((k) => !k.map).map((k) => k.id)) {
          for (const row of I.DRUM_ROWS.map((r) => r.id)) {
            const rows = {}; for (const r of I.DRUM_ROWS) rows[r.id] = Array(16).fill(0); rows[row][0] = 1;
            const { buffer } = await I.renderPattern({ type: 'drums', name: 'x', bars: 1, kit, rows }, 120, library);
            const m = await window.__m(buffer);
            out[`${kit}.${row}`] = { mom: window.__mom(buffer), len40: window.__len40(buffer), sub: m.sub, body: m.body, centroid: m.centroid, width: m.width, lowSide: m.lowSide };
          }
        }
        return out;
      });
    }
    if (parts.includes('klaenge')) {
      res.klaenge = await page.evaluate(async () => {
        const I = await import('./src/instruments.js');
        const { library } = window.loopwerk;
        const melody = [57, 60, 64, 62, 60, 59, 57, 64].map((pitch, i) => ({ pitch, start: i, len: 0.9, vel: 0.9 }));
        const chord = [[57, 60, 64], [53, 57, 60]].flatMap((c, j) => c.map((pitch) => ({ pitch, start: j * 4, len: 3.9, vel: 0.9 })));
        const out = {};
        for (const p of I.SYNTH_PRESETS) {
          const mel = await window.__m((await I.renderPattern({ type: 'synth', name: 'm', bars: 2, preset: p.id, notes: melody }, 120, library)).buffer);
          const ch = await window.__m((await I.renderPattern({ type: 'synth', name: 'c', bars: 2, preset: p.id, notes: chord }, 120, library)).buffer);
          out[p.id] = { lufs: mel.lufs, mono: mel.mono, width: mel.width, lowSide: mel.lowSide, over2k: mel.over2k, chLufs: ch.lufs, chMono: ch.mono, chWidth: ch.width };
        }
        return out;
      });
    }
    if (parts.includes('piano')) {
      res.piano = await page.evaluate(async () => {
        const I = await import('./src/instruments.js');
        const { library } = window.loopwerk;
        const out = {};
        for (const len of [0.45, 0.5, 0.9, 1, 1.5]) {
          const { buffer } = await I.renderPattern({ type: 'synth', name: 'p', bars: 1, preset: 'piano', notes: [{ pitch: 57, start: 0, len, vel: 1 }] }, 120, library);
          out[`${len} Schläge`] = window.__jump(buffer, Math.max(len * 0.5, 0.25));
        }
        return out;
      });
    }
    if (parts.includes('starter')) {
      res.starter = {};
      for (const id of starters) {
        res.starter[id] = await page.evaluate(async (id) => {
          const { store, library, renderProject, patterns } = window.loopwerk;
          const S = await import('./src/starter.js');
          const { createDemoProject } = await import('./src/model.js');
          if (id === 'demo') store.replace(createDemoProject()); else await S.runStarter(id, { store, library });
          const project = JSON.parse(JSON.stringify(store.project));
          project.master = { ...(project.master || {}), mastering: { on: false } };
          await patterns.sync(project);
          await library.ensureProject(project);
          const fromBeat = id === 'demo' ? 32 : 96;
          const m = await window.__m(await renderProject(project, library, { fromBeat, toBeat: fromBeat + 32, limiter: true, compensate: true }));
          return { lufs: m.lufs, mono: m.mono, hp150: m.hp150, width: m.width, lowSide: m.lowSide, over2k: m.over2k, centroid: m.centroid };
        }, id);
      }
    }
  } catch (err) {
    console.error('Messfehler:', err.message);
    await app.close();
    process.exit(1);
  }
  if (app.errors.length) console.error('Konsolenfehler:', app.errors.slice(0, 5).join(' | '));
  await app.close();

  // Ausgabe: je Teil eine Zeile je Eintrag, mit Vergleich
  for (const [part, rows] of Object.entries(res)) {
    console.log(`\n== ${part}`);
    for (const [id, v] of Object.entries(rows)) {
      const b = before?.[part]?.[id];
      if (typeof v !== 'object') { console.log(`${id.padEnd(26)} ${b != null ? `${b} → ` : ''}${v}`); continue; }
      const cells = Object.entries(v).filter(([k]) => k !== 'cat' && k !== 'len').map(([k, x]) => (b && b[k] != null && b[k] !== x ? `${k} ${b[k]}→${x}` : `${k} ${x}`));
      let flag = '';
      if (b && v.lufs != null && b.lufs != null && Math.abs(v.lufs - b.lufs) > 2) flag += ' !Lautheit';
      if (b && v.mono != null && b.mono != null && v.mono - b.mono < -1 && Math.abs(v.lufs - b.lufs) <= 2) flag += ' !Mono';
      if (b && v.len != null && b.len != null && v.len !== b.len) flag += ' !Länge';
      console.log(`${id.padEnd(26)} ${cells.join('  ')}${flag}`);
    }
  }
  const out = opt('--out');
  if (out) { fs.writeFileSync(out, JSON.stringify(res, null, 1)); console.log(`\ngespeichert: ${out}`); }
})().catch((err) => { console.error('Fehler:', err.message); process.exit(1); });
