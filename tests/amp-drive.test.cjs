// Verzerrer mit Gitarren-Verstärker (Amp Crunch, Lead, Metal) und weitere E-Gitarren-Klänge im Melodie-Editor.
// Gemessen: Obertöne, Lautstärke im Rahmen, Box dämpft das Kratzen über 8 kHz, Anteil 0 = unverändert.
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const m = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { defaultFx } = await import('./src/effects.js');
      const { renderGuitarNotes, GUITAR_PRESETS } = await import('./src/dsp/guitar.js');
      const sr = 44100;
      const b = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.15 * Math.sin(2 * Math.PI * 220 * i / sr); }
      library.register({ id: 'amp-sine', name: 'amp-sine', category: 'fx', lengthBeats: 4, bpm: 120, buffer: b });
      const b2 = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b2.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 110 * i / sr); }
      library.register({ id: 'amp-loud', name: 'amp-loud', category: 'fx', lengthBeats: 4, bpm: 120, buffer: b2 });
      const fxWith = (patch) => { const f = defaultFx(); Object.assign(f.drive, { on: true }, patch); return f; };
      const proj = (fx, sampleId = 'amp-sine') => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, fx, clips: [{ id: 'a', sampleId, startBeat: 0, lengthBeats: 4 }] }],
      });
      const render = async (p) => (await renderProject(p, library, { limiter: false, fromBeat: 0, toBeat: 4 })).getChannelData(0);
      const bandDb = (d, lo, hi, at = 4410) => {
        const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = d[i + at] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= N; len <<= 1) {
          const a = -2 * Math.PI / len;
          for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(a * k), wi = Math.sin(a * k);
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          }
        }
        let e = 0;
        for (let k = Math.floor(lo * N / sr); k < Math.ceil(hi * N / sr); k++) e += re[k] * re[k] + im[k] * im[k];
        return 10 * Math.log10(e + 1e-20);
      };
      const rms = (d, a, z) => { let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i]; return Math.sqrt(e / (z - a)); };
      const peak = (d) => { let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); return p; };
      const db = (x) => 20 * Math.log10(x);
      const harm = (d) => bandDb(d, 630, 690) - bandDb(d, 200, 240);
      const even = (d) => bandDb(d, 420, 460) - bandDb(d, 200, 240);
      const fizz = (d) => bandDb(d, 8000, 14000) - bandDb(d, 1000, 3000);
      const dry = await render(proj(null));
      const dryLoud = await render(proj(null, 'amp-loud'));
      const out = { amp: {} };
      for (const type of ['amp-crunch', 'amp-lead', 'amp-metal', 'hard']) {
        const d = await render(proj(fxWith({ type, drive: 0.6, tone: 0.75 })));
        const loud = await render(proj(fxWith({ type, drive: 0.4, tone: 0.75 }), 'amp-loud'));
        // Einsatz: kein Pegelstoß in den ersten 50 ms gegenüber dem eingeschwungenen Pegel (gemessener Ausgleich schwang über)
        const top = (x, a, z) => { let p = 0; for (let i = Math.round(a * 44100); i < Math.round(z * 44100) && i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };
        // bezogen auf das trockene Signal, das selbst einen Anschlag haben kann
        const rise = (x) => top(x, 0, 0.05) / top(x, 0.3, 2);
        (out.onset ||= {})[type] = Math.max(rise(d) / rise(dry), rise(loud) / rise(dryLoud));
        (out.onsetDry ||= {})[type] = [rise(dry), rise(dryLoud)];
        out.amp[type] = { h3: harm(d) - harm(dry), h2: even(d) - even(dry), level: db(rms(loud, 4410, 44100) / rms(dryLoud, 4410, 44100)), fizz: fizz(d), peak: Math.max(peak(d), peak(loud)), finite: d.every(Number.isFinite) && loud.every(Number.isFinite) };
      }
      const mix0 = await render(proj(fxWith({ type: 'amp-metal', drive: 1, mix: 0 })));
      let diff = 0; for (let i = 0; i < dry.length; i++) diff = Math.max(diff, Math.abs(mix0[i] - dry[i]));
      out.mix0 = diff;
      const lo = await render(proj(fxWith({ type: 'amp-lead', drive: 0 })));
      const hi = await render(proj(fxWith({ type: 'amp-lead', drive: 1 })));
      out.stronger = harm(hi) - harm(lo);

      // Melodie-Editor: weitere Gitarren
      out.presets = {};
      const notes = [{ pitch: 40, start: 0, len: 1 }, { pitch: 47, start: 0, len: 1 }, { pitch: 52, start: 0, len: 1 }];
      for (const id of ['guitar', 'guitarCrunch', 'guitarMetal', 'guitarFuzz']) {
        const [L] = renderGuitarNotes(id, notes, { sr, spb: 0.5, frames: sr });
        out.presets[id] = { ok: id in GUITAR_PRESETS && L.every(Number.isFinite), rms: rms(L, 0, L.length), peak: peak(L), harm: bandDb(L, 1500, 5000, 2000) - bandDb(L, 60, 400, 2000) };
      }
      return out;
    });
    const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v));
    // Grenze 2 = Auslegung des Ausgleichs (MATCH_HEAD in src/dsp/fx-worklet.js: höchstens das Doppelte); vor der Korrektur 12- bis 23-fach
    check('Verzerrer: kein Pegelstoß beim Einsatz (erste 50 ms höchstens das Doppelte des eingeschwungenen Pegels, bezogen auf das trockene Signal)', Object.values(m.onset).every((v) => v <= 2), JSON.stringify({ onset: m.onset, trocken: m.onsetDry['hard'] }, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
    for (const t of ['amp-crunch', 'amp-lead', 'amp-metal']) {
      const d = m.amp[t];
      check(`Verzerrer „${t}“: kräftige Obertöne, gerade und ungerade (Röhre)`, d.h3 > 20 && d.h2 > 10 && d.finite, fmt(d));
      check(`Verzerrer „${t}“: Lautstärke bei Gitarrenpegel im Rahmen, keine Übersteuerung`, Math.abs(d.level) < 6 && d.peak < 1.2, fmt(d));
      check(`Verzerrer „${t}“: Box dämpft das Kratzen über 8 kHz deutlich (gegenüber „Hart“)`, d.fizz < m.amp.hard.fizz - 8, `${d.fizz.toFixed(1)} dB gegen ${m.amp.hard.fizz.toFixed(1)} dB`);
    }
    check('Amp: mehr Stärke = mehr Verzerrung', m.stronger > 6, m.stronger.toFixed(1));
    check('Amp mit Anteil 0 lässt das Signal unverändert', m.mix0 < 1e-4, String(m.mix0));
    for (const [id, p] of Object.entries(m.presets)) check(`Gitarren-Klang „${id}“ klingt (endlich, hörbar, ohne Übersteuern)`, p.ok && p.rms > 0.01 && p.peak < 1.5, fmt(p));
    check('Metal hat deutlich mehr Obertöne als clean, Fuzz klingt dichter (mehr Sustain)', m.presets.guitarMetal.harm > m.presets.guitar.harm + 3 && m.presets.guitarFuzz.rms > 2 * m.presets.guitar.rms, fmt(m.presets));

    // ---------- Bedienung ----------
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t1'));
    await page.waitForTimeout(200);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#fx-drive-type option')].map((o) => o.textContent));
    check('Verzerrer-Art bietet Amp Crunch, Amp Lead, Amp Metal', ['Amp Crunch', 'Amp Lead', 'Amp Metal'].every((l) => opts.includes(l)), opts.join(', '));
    const presets = await page.evaluate(() => [...document.querySelectorAll('#pat-preset option')].map((o) => o.textContent));
    check('Melodie-Editor bietet E-Gitarre Crunch, Metal, Fuzz', ['E-Gitarre Crunch', 'E-Gitarre Metal', 'E-Gitarre Fuzz'].every((l) => presets.includes(l)), presets.filter((l) => /Gitarre/.test(l)).join(', '));
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  }
  await app.close();
  finish();
})();
