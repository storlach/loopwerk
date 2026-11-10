// Klangfarbe (Bestandsanalyse Klang 2026-11, K2/K3/W5/W6): Sub-Bässe mit Obertönen, Elektro-Kick und -Snare kräftiger,
// Hats und Rim lauter, Flächen und Hats heller, Stereo in den Sounds (Bass und Kick mono), E-Piano ohne Knacken am
// Notenende, Rechenaufwand der Bibliothek. Offline gemessen.
// node tests/klangfarbe.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();
const SUBS = ['bass-sub', 'techno-rumble', 'gen-hiphop-bass', 'gen-hiphop-jazzbass', 'gen-trap-808', 'gen-trap-808prog', 'gen-lofi-bass',
  'gen-lofi-bass2', 'gen-dnb-liquidbass', 'gen-reggaeton-bass', 'gen-ambient-sub'];
// Teure Knoten (Oszillatoren, Filter, Shaper, Pufferquellen) beim Rendern aller synthetischen Loops ohne Gitarren, gezählt
// mit dem Stand vor „Klangfarbe“ (fd0406f). Gemessene Renderzeit dazu: neu/alt 1,025 (abwechselnd, belastete Maschine).
const HEAVY_BEFORE = 11498;

function helpers() {
  window.__kf = (async () => {
    const L = await import('./src/dsp/loudness.js');
    const F = await import('./src/dsp/fft.js');
    const N = 4096;
    const win = F.hann(N);
    const sr = 44100;
    // Leistungsspektrum von Mitte und Seite (Welch, Hann, 50 %)
    const spec = (buf) => {
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      const pm = new Float64Array(N / 2), ps = new Float64Array(N / 2);
      const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
      for (let s = 0; s < l.length; s += N / 2) {
        for (let i = 0; i < N; i++) {
          const x = l[s + i] ?? 0, y = r[s + i] ?? 0;
          re[i] = 0.5 * (x + y) * win[i]; im[i] = 0; re2[i] = 0.5 * (x - y) * win[i]; im2[i] = 0;
        }
        F.fft(re, im); F.fft(re2, im2);
        for (let k = 0; k < N / 2; k++) { pm[k] += re[k] * re[k] + im[k] * im[k]; ps[k] += re2[k] * re2[k] + im2[k] * im2[k]; }
      }
      return { pm, ps };
    };
    // Kennzahlen: Lautheit (stereo, mono), Breite, Seite unter 150 Hz, Anteile (%) in Bändern, Schwerpunkt
    window.__m = (buf, bands = {}) => {
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      const mono = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
      const { pm, ps } = spec(buf);
      let tot = 0, side = 0, mid = 0, lowS = 0, lowM = 0, cen = 0;
      const out = {};
      for (const k in bands) out[k] = 0;
      for (let k = 1; k < N / 2; k++) {
        const f = (k * sr) / N;
        const p = pm[k] + ps[k];
        if (f >= 30) tot += p;
        mid += pm[k]; side += ps[k]; cen += f * p;
        if (f >= 20 && f < 150) { lowM += pm[k]; lowS += ps[k]; }
        for (const [id, [a, b]] of Object.entries(bands)) if (f >= a && f < b) out[id] += p;
      }
      for (const k in bands) out[k] = (100 * out[k]) / (tot || 1);
      return {
        lufs: L.integratedLoudness([l, r], sr), mono: L.integratedLoudness([mono, mono], sr),
        width: side / (mid + side + 1e-20), lowSide: lowS / (lowM + lowS + 1e-20), lowSideAll: lowS / (mid + side + 1e-20), centroid: cen / (mid + side + 1e-20), ...out,
      };
    };
    // Höchste Kurzzeit-Lautheit (400 ms)
    window.__mom = (buf) => {
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      let best = -Infinity;
      const w = Math.round(0.4 * sr);
      for (let a = 0; a + w <= l.length; a += Math.round(0.05 * sr)) best = Math.max(best, L.integratedLoudness([l.subarray(a, a + w), r.subarray(a, a + w)], sr));
      return best;
    };
    window.__hp = async (b, f) => {
      const ctx = new OfflineAudioContext(2, b.length, b.sampleRate);
      const s = ctx.createBufferSource(); s.buffer = b;
      let n = s;
      for (let i = 0; i < 2; i++) { const q = ctx.createBiquadFilter(); q.type = 'highpass'; q.frequency.value = f; n = n.connect(q); }
      n.connect(ctx.destination); s.start();
      return ctx.startRendering();
    };
    window.__loss150 = async (buf) => {
      const h = await window.__hp(buf, 150);
      return L.integratedLoudness([buf.getChannelData(0), buf.getChannelData(1)], sr) - L.integratedLoudness([h.getChannelData(0), h.getChannelData(1)], sr);
    };
    window.__hit = (kit, row) => {
      const rows = {};
      for (const id of ['kick', 'snare', 'clap', 'hat', 'open', 'tomLo', 'tomHi', 'crash']) rows[id] = Array(16).fill(0);
      rows[row][0] = 1;
      return { type: 'drums', name: 'x', bars: 1, kit, rows };
    };
    return true;
  })();
}

(async () => {
  const app = await openApp();
  const { page } = app;
  page.setDefaultTimeout(1800000);
  try {
    await page.evaluate(helpers);
    await page.evaluate(() => window.__kf);

    // ---------- Ganze synthetische Bibliothek frisch rendern, dabei teure Knoten zählen ----------
    const lib = await page.evaluate(async (SUBS) => {
      const counts = {};
      const P = BaseAudioContext.prototype;
      const orig = {};
      for (const k of ['createOscillator', 'createBiquadFilter', 'createWaveShaper', 'createBufferSource']) {
        orig[k] = P[k];
        P[k] = function (...a) { counts[k] = (counts[k] || 0) + 1; return orig[k].apply(this, a); };
      }
      const S = await import('./src/samples.js');
      const lib = await S.buildLibrary({ catalogs: true });
      const ids = lib.list().filter((s) => s.def && !s.id.startsWith('gtr-')).map((s) => s.id);
      const t0 = performance.now();
      for (const id of ids) await lib.ensure(id);
      const ms = performance.now() - t0;
      for (const k in orig) P[k] = orig[k];
      const sounds = {};
      for (const id of ids) {
        const s = lib.get(id);
        const buf = s.orig || s.buffer;
        const m = window.__m(buf, { sub: [30, 80], high: [2000, 22050] });
        sounds[id] = { cat: s.category, ...m };
        if (SUBS.includes(id)) sounds[id].loss = await window.__loss150(buf);
      }
      return { counts, ms, sounds };
    }, SUBS);
    const S = lib.sounds;
    const f1 = (x) => x.toFixed(1);

    // ---------- 1. Sub-Bässe mit Obertönen (K2) ----------
    const losses = SUBS.map((id) => [id, S[id].loss]);
    check('Sub-Bässe: Verlust bei Hochpass 150 Hz je Loop ≤ 8 LU (vorher 3,8–29,7; reine Sinus-Subs 29,7)', losses.every(([, l]) => l <= 8),
      losses.map(([id, l]) => `${id} ${f1(l)}`).join(', '));
    check('Sub bleibt: bass-sub und gen-ambient-sub ≥ 60 % der Energie in 30–80 Hz', S['bass-sub'].sub >= 60 && S['gen-ambient-sub'].sub >= 60,
      `${f1(S['bass-sub'].sub)} / ${f1(S['gen-ambient-sub'].sub)} %`);
    check('Bass-Loops bleiben mono (Breite < 0,001)', Object.values(S).filter((s) => s.cat === 'bass').every((s) => s.width < 0.001),
      Object.entries(S).filter(([, s]) => s.cat === 'bass' && s.width >= 0.001).map(([id, s]) => `${id} ${s.width.toFixed(4)}`).join(', ') || 'alle mono');

    // Starter Pop und Hip-Hop, Refrain (Takte 25–32) mit Schutz-Limiter: Verlust bei Hochpass 150 Hz (vorher 5,9 und 6,0)
    const starters = {};
    for (const id of ['pop', 'hiphop']) {
      starters[id] = await page.evaluate(async (id) => {
        const { store, library, renderProject, patterns } = window.loopwerk;
        const St = await import('./src/starter.js');
        await St.runStarter(id, { store, library });
        const project = JSON.parse(JSON.stringify(store.project));
        project.master = { ...(project.master || {}), mastering: { on: false } };
        await patterns.sync(project);
        await library.ensureProject(project);
        const buf = await renderProject(project, library, { fromBeat: 96, toBeat: 128, limiter: true, compensate: true });
        return window.__loss150(buf);
      }, id);
    }
    check('Starter Pop und Hip-Hop: Verlust bei Hochpass 150 Hz ≤ 3,3 LU (vorher 5,9 / 6,0)', starters.pop <= 3.3 && starters.hiphop <= 3.3,
      `Pop ${f1(starters.pop)}, Hip-Hop ${f1(starters.hiphop)}`);

    // ---------- 2. Kits (K2, W6) ----------
    const kits = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const { library } = window.loopwerk;
      const out = {};
      for (const [kit, row] of [['elektro', 'kick'], ['elektro', 'snare'], ['elektro', 'hat'], ['techno', 'kick'], ['techno', 'hat'], ['techno', 'snare'], ['druck', 'kick'], ['druck', 'snare']]) {
        const { buffer } = await I.renderPattern(window.__hit(kit, row), 120, library);
        const m = window.__m(buffer, { sub: [30, 80], body: [150, 300], low: [0, 250] });
        const d = buffer.getChannelData(0);
        let p = 0; for (const x of d) p = Math.max(p, Math.abs(x));
        let e = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > p * 0.01) e = i;
        out[`${kit}.${row}`] = { ...m, mom: window.__mom(buffer), len40: e / 44100 };
      }
      return out;
    });
    const K = (k) => kits[k];
    check('Elektro-Kick: Sub-Anteil (30–80 Hz) ≥ 50 % (vorher 14 %)', K('elektro.kick').sub >= 50, `${f1(K('elektro.kick').sub)} %`);
    check('Elektro-Kick: Lautheit ±2 LU wie vorher (−15,2 LUFS kurzzeitig)', Math.abs(K('elektro.kick').mom + 15.2) <= 2, f1(K('elektro.kick').mom));
    check('Kicks mono: keine Seite unter 150 Hz, Breite < 0,001 (Elektro, Techno, Druck)', ['elektro.kick', 'techno.kick', 'druck.kick'].every((k) => K(k).width < 0.001 && K(k).lowSide < 0.001),
      ['elektro.kick', 'techno.kick', 'druck.kick'].map((k) => `${k} ${K(k).width.toExponential(1)}/${K(k).lowSide.toExponential(1)}`).join(', '));
    check('Elektro-Snare: Körper 150–300 Hz ≥ 15 % (vorher unter 5 %), Schwerpunkt unter 9 kHz (vorher 10,4 kHz)', K('elektro.snare').body >= 15 && K('elektro.snare').centroid < 9000,
      `${f1(K('elektro.snare').body)} %, ${Math.round(K('elektro.snare').centroid)} Hz`);
    check('Elektro-Snare: Körper mono (Seite unter 150 Hz < 0,01), Teppich breit (Breite ≥ 0,01)', K('elektro.snare').lowSide < 0.01 && K('elektro.snare').width >= 0.01,
      `${K('elektro.snare').lowSide.toFixed(4)} / ${K('elektro.snare').width.toFixed(3)}`);
    const below = (a, b) => K(b).mom - K(a).mom;
    check('Hats: Elektro höchstens 11 LU unter der Kick (vorher 13,2), Techno höchstens 14 LU (vorher 21,2)', below('elektro.hat', 'elektro.kick') <= 11 && below('techno.hat', 'techno.kick') <= 14,
      `Elektro ${f1(below('elektro.hat', 'elektro.kick'))}, Techno ${f1(below('techno.hat', 'techno.kick'))} LU`);
    check('Rim (Techno, Druck): höchstens 11 LU unter der Kick (vorher 16,4) und länger als 30 ms (vorher 18 ms)',
      below('techno.snare', 'techno.kick') <= 11 && K('techno.snare').len40 > 0.03 && K('druck.snare').len40 > 0.03,
      `${f1(below('techno.snare', 'techno.kick'))} LU, ${Math.round(K('techno.snare').len40 * 1000)} ms`);
    check('Druck-Kick unverändert (−12,3 LUFS kurzzeitig, 93 % Sub)', Math.abs(K('druck.kick').mom + 12.3) <= 0.15 && Math.abs(K('druck.kick').sub - 93) <= 1,
      `${f1(K('druck.kick').mom)} LUFS, ${f1(K('druck.kick').sub)} %`);

    // ---------- 3. Höhen (K2) ----------
    check('Hats: Schwerpunkt 6–11 kHz (vorher 13,2 kHz), Elektro und Techno', ['elektro.hat', 'techno.hat'].every((k) => K(k).centroid >= 6000 && K(k).centroid <= 11000),
      ['elektro.hat', 'techno.hat'].map((k) => `${Math.round(K(k).centroid)} Hz`).join(', '));
    check('Fläche chords-pad: ≥ 3 % der Energie über 2 kHz (vorher 0,5 %)', S['chords-pad'].high >= 3, `${f1(S['chords-pad'].high)} %`);

    // ---------- 4. Stereo (K3) und 5. Mono-Summe ----------
    const presets = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const { library } = window.loopwerk;
      const chord = [[57, 60, 64], [53, 57, 60]].flatMap((c, j) => c.map((pitch) => ({ pitch, start: j * 4, len: 3.9, vel: 0.9 })));
      const melody = [64, 67, 72, 69, 67, 65, 64, 72].map((pitch, i) => ({ pitch, start: i, len: 0.9, vel: 0.9 }));
      const out = {};
      for (const id of ['pad', 'strings', 'organ', 'piano', 'pluck', 'lead', 'bell', 'flute', 'brass', 'bass', 'acid', 'rollbass']) {
        const notes = ['bass', 'acid', 'rollbass'].includes(id) ? melody.map((n) => ({ ...n, pitch: n.pitch - 24 })) : ['pad', 'strings', 'organ'].includes(id) ? chord : melody;
        const { buffer } = await I.renderPattern({ type: 'synth', name: 'k', bars: 2, preset: id, notes }, 120, library);
        out[id] = window.__m(buffer);
      }
      return out;
    });
    const wideP = ['pad', 'strings', 'organ', 'piano', 'pluck', 'lead', 'bell', 'flute', 'brass'];
    check('Melodie-Klänge breit: Breite ≥ 0,05 (vorher alle 0,00)', wideP.every((id) => presets[id].width >= 0.05),
      wideP.map((id) => `${id} ${presets[id].width.toFixed(3)}`).join(', '));
    check('Bass-Klänge bleiben mono (Bass, Acid, Rollbass: Breite < 0,001)', ['bass', 'acid', 'rollbass'].every((id) => presets[id].width < 0.001),
      ['bass', 'acid', 'rollbass'].map((id) => presets[id].width.toExponential(1)).join(', '));
    check('Melodie-Klänge: Mono-Summe höchstens 1 dB leiser als stereo', wideP.every((id) => presets[id].mono - presets[id].lufs >= -1),
      wideP.map((id) => `${id} ${f1(presets[id].mono - presets[id].lufs)}`).join(', '));
    const classes = {
      Flächen: ['chords-pad', 'gen-ambient-vox', 'gen-house-vox'], Akkorde: ['chords-stabs', 'techno-stab', 'gen-pop-piano', 'gen-house-organ'],
      Arps: ['synth-arp', 'synth-arp-prog', 'gen-pop-arp'], Hats: ['drums-hats16', 'techno-hats', 'techno-ride'],
      FX: ['fx-riser', 'fx-crash', 'techno-sweep', 'techno-down', 'gen-fx-wind'],
    };
    const cls = Object.entries(classes).map(([name, ids]) => [name, Math.min(...ids.map((id) => S[id].width)), ids.find((id) => S[id].width === Math.min(...ids.map((x) => S[x].width)))]);
    check('Loops breit je Klasse (Flächen, Akkorde, Arps, Hats, FX): kleinste Breite ≥ 0,015 (vorher 0)', cls.every(([, w]) => w >= 0.015),
      cls.map(([n, w, id]) => `${n} ${w.toFixed(3)} (${id})`).join(', '));
    // Ausgenommen: FX-Klänge fxs-… und die Supersaw-Flächen, die schon vorher breit waren (−1,0 dB, unverändert)
    const WIDE_BEFORE = ['gen-dnb-pad', 'gen-pop-pad', 'gen-ambient-pad'];
    const monoBad = Object.entries(S).filter(([id]) => !id.startsWith('fxs-') && !WIDE_BEFORE.includes(id)).map(([id, s]) => [id, s.mono - s.lufs]).filter(([, d]) => d < -1);
    check('Alle synthetischen Loops (außer den schon vorher breiten): Mono-Summe höchstens 1 dB leiser als stereo', !monoBad.length,
      monoBad.map(([id, d]) => `${id} ${f1(d)}`).join(', ') || `${Object.keys(S).length} Sounds`);
    // Seite unter 150 Hz als Anteil an der ganzen Energie des Loops (Hats/Ride haben dort nur Rauschen ohne Gewicht)
    // gen-techno-toms: Toms mit eigenem Panorama, schon vorher 1,7 % (unverändert)
    const lowBad = Object.entries(S).filter(([id, s]) => (s.cat === 'drums' || s.cat === 'bass') && id !== 'gen-techno-toms' && s.lowSideAll > 0.002);
    check('Drum- und Bass-Loops: Seite unter 150 Hz unter 0,2 % der Energie', !lowBad.length,
      lowBad.map(([id, s]) => `${id} ${(100 * s.lowSideAll).toFixed(2)} %`).join(', ') || `größter Wert ${(100 * Math.max(...Object.entries(S).filter(([id, s]) => (s.cat === 'drums' || s.cat === 'bass') && id !== 'gen-techno-toms').map(([, s]) => s).map((s) => s.lowSideAll))).toFixed(3)} %`);

    // ---------- 6. E-Piano: kein Sprung am Notenende (W5) ----------
    const piano = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const H = await import('./src/harmony.js');
      const { library } = window.loopwerk;
      const sr = 44100;
      const db = (x) => 20 * Math.log10(x + 1e-9);
      // Effektivwert in 10-ms-Fenstern, alle 2 ms; größter Abfall zwischen zwei Nachbarschritten im Bereich ±40 ms um das Ende
      const jumpAt = (buf, end) => {
        const d = buf.getChannelData(0);
        const w = Math.round(0.01 * sr), st = Math.round(0.002 * sr);
        const e = [];
        for (let a = 0; a + w < d.length; a += st) { let s = 0; for (let i = a; i < a + w; i++) s += d[i] * d[i]; e.push(Math.sqrt(s / w)); }
        const k0 = Math.round((end - 0.04) * sr / st), k1 = Math.round((end + 0.04) * sr / st);
        let m = 0;
        for (let k = Math.max(1, k0); k < Math.min(e.length, k1); k++) m = Math.max(m, db(e[k - 1]) - db(e[k]));
        return m;
      };
      const out = [];
      for (const len of [0.5, 0.9, 1]) {
        const { buffer } = await I.renderPattern({ type: 'synth', name: 'p', bars: 1, preset: 'piano', notes: [{ pitch: 57, start: 0, len, vel: 1 }] }, 120, library);
        out.push([`${len} Schläge`, jumpAt(buffer, len * 0.5)]);
      }
      // Begleit-Klavier: ein Ton seiner Note auf 1,5 Schläge, Länge 0,45 (ein Akkord schwebt, das wäre kein Sprung)
      const acc = H.accompPattern('piano', 9);
      const { buffer } = await I.renderPattern({ ...acc, notes: acc.notes.filter((n) => n.start === 1.5).slice(0, 1) }, 120, library);
      out.push(['Begleitung 0,45', jumpAt(buffer, (1.5 + 0.45) * 0.5)]);
      return out;
    });
    check('E-Piano: am Notenende höchstens 1 dB Abfall je 2 ms (vorher 10,4 dB Sprung)', piano.every(([, j]) => j <= 1),
      piano.map(([n, j]) => `${n}: ${j.toFixed(2)} dB`).join(', '));

    // ---------- 7. Rechenaufwand ----------
    const heavy = Object.values(lib.counts).reduce((s, x) => s + x, 0);
    check('Rechenaufwand der Bibliothek: teure Knoten höchstens 15 % mehr als vorher', heavy <= HEAVY_BEFORE * 1.15,
      `${heavy} statt ${HEAVY_BEFORE} (${f1((heavy / HEAVY_BEFORE - 1) * 100)} %), ${JSON.stringify(lib.counts)}, Renderzeit hier ${Math.round(lib.ms)} ms`);

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || String(err));
  } finally {
    await app.close().catch(() => {});
    finish();
  }
})();
