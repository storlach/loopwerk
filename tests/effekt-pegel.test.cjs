// Ehrliche Pegel (Klanganalyse 2026-11, W2/W3/K3): Schutz-Limiter ohne versteckte Anhebung mit echter Spitzengrenze,
// Kompressor und Verzerrer pegelneutral beim Einschalten, Hall hörbar und breit – alte Songs klingen wie vorher.
// node tests/effekt-pegel.test.cjs
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Bezugswerte, gemessen am alten Stand (Commit fd0406f, Schutz-Limiter = DynamicsCompressor): Starter ohne Mastering,
// Variante 0, Takte 1–16, mit Limiter (LUFS) und ohne (raw, dient als Fingerabdruck: ändern sich die Sounds, gilt nur
// noch der Vergleich mit dem Rückfall-Limiter, der im Test live mitgerechnet wird)
const OLD_STARTER = {
  demo: { lim: -13.47, raw: -15.85 }, house: { lim: -17.79, raw: -20.34 }, techno: { lim: -14.26, raw: -16.79 },
  hiphop: { lim: -11.95, raw: -14.26 }, lofi: { lim: -12.14, raw: -14.59 }, pop: { lim: -13.01, raw: -15.44 },
  trap: { lim: -15.35, raw: -17.71 }, ambient: { lim: -10.12, raw: -12.05 }, rock: { lim: -12.11, raw: -13.2, tp: 0.49 },
  breaks: { lim: -13.87, raw: -16.38 }, melodic: { lim: -10.91, raw: -13.17 },
};
// Alte Projekte (Effekt an, ohne Fassung `v`), feste Testsignale, limiter: false – am alten Stand gemessen:
// [LUFS, Spitze dBFS, Effektivwert je Viertel der Datei in dB]
const OLD_LEGACY = {
  'pegel-drums': {
    comp: [-11.45, 2.85, [-11.32, -10.55, -29.05]], comp8: [-6.14, 12.57, [-5.63, -5.66, -21.34]],
    drive: [-12.97, -3.27, [-11.66, -11.8, -27.05]], hard: [-15.32, -5.31, [-13.93, -14.17, -26.68]],
    crunch: [-17.83, -2.4, [-19.31, -19.3, -46.51]], hall: [-17.1, -1.15, [-16.95, -17.01, -37.23, -66.09]],
    hallBus: [-17.19, -1.06, [-16.81, -16.87, -34.21, -57.61]],
  },
  'pegel-pad': {
    comp: [-8.69, -1.22, [-11.48, -10.79, -16.9]], comp8: [-4.07, 3.38, [-6.66, -6.25, -12.25]],
    drive: [-9.3, -5.8, [-12.02, -11.52, -17.44]], hard: [-11.2, -7.85, [-13.89, -13.48, -19.32]],
    crunch: [-14.34, -5.35, [-17.59, -17.03, -23.01]], hall: [-18.4, -10.16, [-21.28, -20.39, -26.67, -64.4]],
    hallBus: [-18.16, -9.97, [-21.11, -20.11, -26.28, -56.99]],
  },
  'pegel-bass': {
    comp: [-7.83, 0.24, [-7.65, -7.61, -12.89]], comp8: [-4.03, 7.7, [-3.42, -3.77, -9.06]],
    drive: [-10.3, -3.18, [-9.24, -9.4, -14.76]], hard: [-12.73, -5.41, [-11.63, -11.79, -17.15]],
    crunch: [-15.49, -9.39, [-16.41, -16.69, -21.98]], hall: [-16.1, -6.33, [-15.44, -16.17, -21.24, -57.98]],
    hallBus: [-16.19, -5.95, [-15.55, -16.35, -21.32, -50.1]],
  },
};
const LEGACY_CASES = {
  comp: { fx: { comp: { on: true } } },
  comp8: { fx: { comp: { on: true, amount: 0.8, attack: 20, gain: 2 } } },
  drive: { fx: { drive: { on: true } } },
  hard: { fx: { drive: { on: true, type: 'hard', drive: 0.7, mix: 0.6 } } },
  crunch: { fx: { drive: { on: true, type: 'amp-crunch' } } },
  hall: { fx: { hall: { on: true } } },
  hallBus: { sends: { hall: 0.5 } },
};

// Läuft im Browser: feste Testsignale (eigener Zufallsgenerator mit Seed), 4 Schläge bei 120 BPM, und Messhilfen
function installPegel() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const n = 2 * sr;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const mk = (id, fill) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    const l = b.getChannelData(0);
    fill(l);
    b.getChannelData(1).set(l);
    library.register({ id, name: id, category: 'fx', lengthBeats: 4, bpm: 120, buffer: b });
  };
  const beat = sr / 2;
  mk('pegel-drums', (d) => {
    for (let k = 0; k < 4; k++) {
      let ph = 0;
      for (let i = 0; i < 0.3 * sr; i++) {
        const t = i / sr;
        ph += (2 * Math.PI * (50 + 70 * Math.exp(-t * 30))) / sr;
        d[k * beat + i] += 0.55 * Math.sin(ph) * Math.exp(-t * 9);
      }
      if (k % 2 === 1) for (let i = 0; i < 0.2 * sr; i++) { const t = i / sr; d[k * beat + i] += 0.25 * (rnd() * 0.8 + 0.4 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 18); }
    }
    for (let h = 0; h < 8; h++) { let lp = 0; for (let i = 0; i < 0.05 * sr; i++) { const x = rnd(); const y = x - lp; lp = x; d[h * beat / 2 + i + 1] += 0.08 * y * Math.exp(-(i / sr) * 70); } }
  });
  mk('pegel-pad', (d) => {
    for (const f of [220, 261.63, 329.63]) {
      for (let h = 1; h <= 12; h++) {
        const w = (2 * Math.PI * f * h) / sr;
        for (let i = 0; i < n; i++) d[i] += (0.06 / h) * Math.sin(w * i + h);
      }
    }
    for (let i = 0; i < n; i++) d[i] *= Math.min(1, i / (0.15 * sr)) * Math.min(1, (n - i) / (0.05 * sr));
  });
  mk('pegel-bass', (d) => {
    for (let k = 0; k < 8; k++) {
      for (let i = 0; i < 0.23 * sr; i++) {
        const t = i / sr;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * 55 * h * t) / h;
        d[k * beat / 2 + i] += 0.3 * v * Math.exp(-t * 4) * Math.min(1, i / 60);
      }
    }
  });
  window.__pg = {
    project(sid, { fx = null, sends, beats = 4 } = {}) {
      return { version: 1, name: 'pegel', bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 't1', volume: 1, pan: 0, mute: false, solo: false, fx, sends, clips: [{ id: 'c1', sampleId: sid, startBeat: 0, lengthBeats: beats, offsetBeats: 0 }] }] };
    },
    async lufs(b) { const L = await import('./src/dsp/loudness.js'); return L.integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate); },
    async tp(b) { const L = await import('./src/dsp/loudness.js'); return L.truePeak([b.getChannelData(0), b.getChannelData(1)], { factor: 8, half: 16 }); },
  };
  return true;
}

(async () => {
  const app = await openApp({ fresh: true });
  const { page } = app;
  page.setDefaultTimeout(900000);
  try {
    await page.evaluate(installPegel);

    // ---------- 1. Alte Projekte klingen wie vorher (Effekte ohne Fassung) ----------
    const legacy = await page.evaluate(async (CASES) => {
      const { library, renderProject } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const out = {};
      for (const sid of ['pegel-drums', 'pegel-pad', 'pegel-bass']) {
        out[sid] = {};
        for (const [name, c] of Object.entries(CASES)) {
          const fx = FX.defaultFx();
          for (const [k, v] of Object.entries(c.fx || {})) fx[k] = { ...fx[k], ...v };
          const b = await renderProject(window.__pg.project(sid, { fx, sends: c.sends }), library, { toBeat: 4, limiter: false, tailSeconds: 1.5 });
          const l = b.getChannelData(0), r = b.getChannelData(1);
          const q = Math.floor(l.length / 4);
          const rms = [];
          let pk = 0;
          for (let k = 0; k < 4; k++) { let e = 0; for (let i = k * q; i < (k + 1) * q; i++) { e += l[i] * l[i] + r[i] * r[i]; pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i])); } rms.push(10 * Math.log10(e / (2 * q) + 1e-20)); }
          out[sid][name] = [await window.__pg.lufs(b), 20 * Math.log10(pk), rms];
        }
      }
      return out;
    }, LEGACY_CASES);
    for (const name of Object.keys(LEGACY_CASES)) {
      let worst = 0;
      const rows = [];
      for (const sid of Object.keys(OLD_LEGACY)) {
        const [l0, p0, r0] = OLD_LEGACY[sid][name];
        const [l1, p1, r1] = legacy[sid][name];
        const d = Math.max(Math.abs(l1 - l0), Math.abs(p1 - p0), ...r0.map((v, k) => Math.abs(r1[k] - v)));
        worst = Math.max(worst, d);
        rows.push(`${sid.slice(6)} ${l1.toFixed(2)} (alt ${l0})`);
      }
      check(`1 Altes Projekt mit ${name} klingt wie vorher (LUFS, Spitze, Effektivwerte je Viertel ±0,05 dB)`, worst <= 0.05, `größte Abweichung ${worst.toFixed(3)} dB; ${rows.join(', ')}`);
    }

    // ---------- 2. Fassung wird beim Einschalten gesetzt, beim Ausschalten festgehalten ----------
    const stamp = await page.evaluate(async () => {
      const { store } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const p = window.__pg.project('pegel-pad');
      p.tracks.push({ ...p.tracks[0], id: 't2', name: 't2', clips: [] });
      const legacyFx = FX.defaultFx();
      legacyFx.comp.on = true;
      legacyFx.hall.on = true;
      p.tracks[1].fx = legacyFx;
      p.tracks[1].sends = { hall: 0.3 };
      store.replace(p);
      const o = {};
      store.setTrackFx('t1', 'comp', { on: true });
      store.setTrackFx('t1', 'drive', { on: true });
      store.setTrackFx('t1', 'hall', { on: true });
      store.setTrackFx('t1', 'eq', { on: true });
      const t1 = () => store.track('t1').fx;
      o.fresh = { comp: t1().comp.v, drive: t1().drive.v, hall: t1().hall.v, eq: t1().eq.v ?? null };
      store.setTrackFx('t1', 'comp', { amount: 0.7 });
      o.knob = t1().comp.v;
      const t2 = () => store.track('t2').fx;
      store.setTrackFx('t2', 'comp', { amount: 0.6 });
      o.legacyKnob = t2().comp.v ?? null;
      store.setTrackFx('t2', 'comp', { on: false });
      o.legacyOff = t2().comp.v;
      store.setTrackFx('t2', 'comp', { on: true });
      o.legacyOn = t2().comp.v;
      // Bus: t2 sendet schon (alter Song) – ein weiterer Send setzt keine Fassung; der letzte Send weg hält v: 1 fest
      store.setSend('t1', 'hall', 0.4);
      o.busLegacy = store.project.buses?.hall?.v ?? null;
      store.setSend('t1', 'hall', 0);
      store.setSend('t2', 'hall', 0);
      o.busLast = store.project.buses?.hall?.v ?? null;
      // Neues Projekt: der erste Send bringt die aktuelle Fassung
      store.replace(window.__pg.project('pegel-pad'));
      store.setSend('t1', 'hall', 0.5);
      o.busFresh = store.project.buses?.hall?.v ?? null;
      store.undo();
      o.busUndo = store.project.buses?.hall?.v ?? null;
      // Klang aus Beschreibung (applySound) und Effekt-Kurve schalten ebenfalls mit Fassung ein
      store.replace(window.__pg.project('pegel-pad'));
      store.addAutoPoint('t1', 'hall.mix', 0, 0.3);
      o.auto = store.track('t1').fx?.hall?.v ?? null;
      return o;
    });
    check('2 Neu eingeschaltet: Kompressor, Verzerrer, Hall bekommen Fassung 2 (andere Effekte keine)',
      stamp.fresh.comp === 2 && stamp.fresh.drive === 2 && stamp.fresh.hall === 2 && stamp.fresh.eq === null && stamp.knob === 2, JSON.stringify(stamp));
    check('2 Alter eingeschalteter Kompressor: Drehen lässt die Fassung weg, Aus hält v: 1, Ein bleibt v: 1',
      stamp.legacyKnob === null && stamp.legacyOff === 1 && stamp.legacyOn === 1, JSON.stringify(stamp));
    check('2 Hall-Bus: alter Song bleibt alt (v: 1 beim letzten Send), neuer Song bekommt mit dem ersten Send v: 2, Rückgängig nimmt es mit',
      stamp.busLegacy === null && stamp.busLast === 1 && stamp.busFresh === 2 && stamp.busUndo === null && stamp.auto === 2, JSON.stringify(stamp));

    // ---------- 3. Kompressor und Verzerrer neu eingeschaltet: Lautheit bleibt (±1,5 LU) ----------
    const fresh = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const sounds = ['gen-house-groove', 'chords-pad', 'bass-prog', 'synth-arp-prog', 'pegel-drums', 'pegel-pad', 'pegel-bass'];
      await library.ensureMany(sounds.filter((s) => !s.startsWith('pegel')));
      const render = async (sid, fx) => {
        const p = window.__pg.project(sid, { fx, beats: sid.startsWith('pegel') ? 4 : 16 });
        return renderProject(p, library, { toBeat: sid.startsWith('pegel') ? 4 : 16, limiter: false, tailSeconds: 1 });
      };
      const with2 = (id, patch = {}) => { const fx = FX.defaultFx(); fx[id] = { ...fx[id], on: true, ...patch }; FX.stampFx(id, fx[id], false); return fx; };
      const cases = {
        comp: with2('comp'), drive: with2('drive'),
        // „Presets“: Arten des Verzerrers, Klang aus Beschreibung („fett“, „verzerrt“, „stark verzerrt“, „8-Bit“)
        hard: with2('drive', { type: 'hard' }), fuzz: with2('drive', { type: 'fuzz' }), crush: with2('drive', { type: 'crush' }),
        crunch: with2('drive', { type: 'amp-crunch' }), lead: with2('drive', { type: 'amp-lead' }), metal: with2('drive', { type: 'amp-metal' }),
        fett: with2('comp', { amount: 0.6 }), verzerrt: with2('drive', { drive: 0.5 }), stark: with2('drive', { drive: 0.8 }), bit: with2('drive', { type: 'crush', drive: 0.7, tone: 0.6 }),
        oldComp: (() => { const fx = FX.defaultFx(); fx.comp.on = true; return fx; })(),
        oldDrive: (() => { const fx = FX.defaultFx(); fx.drive.on = true; return fx; })(),
      };
      const out = {};
      for (const sid of sounds) {
        const dry = await window.__pg.lufs(await render(sid, null));
        out[sid] = {};
        for (const [name, fx] of Object.entries(cases)) out[sid][name] = +((await window.__pg.lufs(await render(sid, fx))) - dry).toFixed(2);
      }
      // Kennlinie: Sinus 1 kHz mit 0 dBFS durch den Kompressor (Voreinstellung), Spitze im eingeschwungenen Zustand
      const curve = async (p) => {
        const sr = 44100;
        const ctx = new OfflineAudioContext(1, sr, sr);
        const o = ctx.createOscillator(); o.frequency.value = 1000;
        const u = FX.EFFECTS.find((e) => e.id === 'comp').create(ctx);
        u.set(p, null, 0.5, 0);
        o.connect(u.input); u.output.connect(ctx.destination); o.start();
        const y = (await ctx.startRendering()).getChannelData(0);
        let pk = 0; for (let i = sr / 2; i < sr; i++) pk = Math.max(pk, Math.abs(y[i]));
        return 20 * Math.log10(pk);
      };
      out.curve = { neu: await curve({ ...FX.defaultFx().comp, on: true, v: 2 }), alt: await curve({ ...FX.defaultFx().comp, on: true }) };
      return out;
    });
    const analysis = ['gen-house-groove', 'chords-pad', 'bass-prog', 'synth-arp-prog'];
    const all = [...analysis, 'pegel-drums', 'pegel-pad', 'pegel-bass'];
    const span = (name, sids = all) => sids.map((s) => fresh[s][name]);
    const within = (name, lim, sids = all) => span(name, sids).every((v) => Math.abs(v) <= lim);
    const show = (name, sids = all) => span(name, sids).map((v) => (v >= 0 ? '+' : '') + v.toFixed(1)).join(' / ');
    check('3 Kompressor neu eingeschaltet: Lautheit ±1,5 LU (Drums / Fläche / Bass / Arp, dazu drei Testsignale)', within('comp', 1.5), `${show('comp')} LU (alt: ${show('oldComp')})`);
    check('3 Verzerrer neu eingeschaltet: Lautheit ±1,5 LU', within('drive', 1.5), `${show('drive')} LU (alt: ${show('oldDrive')})`);
    check('3 Fassung 1 (alte Songs) hebt weiterhin an – Vergleich bestätigt, dass die neue Fassung wirkt', span('oldComp', analysis).every((v) => v > 4) && span('oldDrive', analysis).every((v) => v > 3), `${show('oldComp', analysis)} / ${show('oldDrive', analysis)}`);
    const presets = ['hard', 'fuzz', 'crush', 'crunch', 'lead', 'metal', 'fett', 'verzerrt', 'stark', 'bit'];
    const badPresets = presets.filter((n) => !within(n, 2.0, analysis));
    check('3 Presets (Verzerrer-Arten, Klang aus Beschreibung) verschieben die Lautheit höchstens 2 LU', badPresets.length === 0,
      presets.map((n) => `${n} ${show(n, analysis)}`).join('; '));
    check('3 Kompressor: Sinus mit 0 dBFS bleibt unter 0 dBFS (alt: über 0)', fresh.curve.neu < 0 && fresh.curve.alt > 0, `neu ${fresh.curve.neu.toFixed(2)} dBFS, alt ${fresh.curve.alt.toFixed(2)} dBFS`);

    // ---------- 4. Hall: Voreinstellung hörbar, breit, ohne Tiefen, nicht metallisch; Bus genauso ----------
    const hall = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const F = await import('./src/dsp/fft.js');
      const sr = 44100;
      const db = (x) => 10 * Math.log10(x + 1e-30);
      // Fläche trocken und mit Hall; Nachhall = Differenz
      const render = async (opts) => renderProject(window.__pg.project('pegel-pad', opts), library, { toBeat: 4, limiter: false, tailSeconds: 3 });
      const dry = await render({});
      const fxNew = FX.defaultFx(); fxNew.hall = { ...fxNew.hall, on: true }; FX.stampFx('hall', fxNew.hall, false);
      const fxOld = FX.defaultFx(); fxOld.hall = { ...fxOld.hall, on: true };
      const busP = (v) => { const p = window.__pg.project('pegel-pad', { sends: { hall: 0.5 } }); p.buses = { hall: { volume: 0.8, ...(v ? { v } : {}) } }; return p; };
      const measure = (w) => {
        let ed = 0, ew = 0, m = 0, s = 0, mt = 0, st = 0;
        const a0 = dry.getChannelData(0), a1 = dry.getChannelData(1), b0 = w.getChannelData(0), b1 = w.getChannelData(1);
        for (let i = 0; i < a0.length; i++) {
          const l = b0[i] - a0[i], r = b1[i] - a1[i];
          ed += a0[i] * a0[i] + a1[i] * a1[i]; ew += l * l + r * r;
          m += (l + r) ** 2; s += (l - r) ** 2;
          mt += (b0[i] + b1[i]) ** 2; st += (b0[i] - b1[i]) ** 2;
        }
        return { wetDb: db(ew / ed), sideMidDb: db(s / m), width: st / (mt + st) };
      };
      const out = {
        insNew: measure(await render({ fx: fxNew })), insOld: measure(await render({ fx: fxOld })),
        busNew: measure(await renderProject(busP(2), library, { toBeat: 4, limiter: false, tailSeconds: 3 })),
        busOld: measure(await renderProject(busP(null), library, { toBeat: 4, limiter: false, tailSeconds: 3 })),
      };
      // Impulsantwort nur nass (Bus-Einheit, Fassung 2): Tiefen, Korrelation, „metallisch“ (Flachheit gegen ein
      // geglättetes Spektrum: Rauschen ≈ 0,56, Kammfilter deutlich darunter)
      const ir = async (v) => {
        const ctx = new OfflineAudioContext(2, sr * 4, sr);
        const b = ctx.createBuffer(1, 1, sr); b.getChannelData(0)[0] = 1;
        const src = ctx.createBufferSource(); src.buffer = b;
        const g = ctx.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit';
        const u = FX.EFFECTS.find((e) => e.id === 'hall').create(ctx, { dry: false });
        u.set({ ...FX.defaultFx().hall, mix: 1, v }, null, 0.5, 0);
        src.connect(g).connect(u.input); u.output.connect(ctx.destination); src.start();
        const y = await ctx.startRendering();
        const L = y.getChannelData(0), R = y.getChannelData(1);
        const N = 8192, win = F.hann(N), st = Math.round(0.03 * sr);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = L[st + i] * win[i];
        F.fft(re, im);
        const P = (k) => re[k] * re[k] + im[k] * im[k];
        const band = (f0, f1) => { let e = 0, c = 0; for (let k = Math.round(f0 * N / sr); k < Math.round(f1 * N / sr); k++) { e += P(k); c++; } return e / c; };
        let lg = 0, ar = 0, n = 0;
        for (let k = Math.round(300 * N / sr); k < Math.round(6000 * N / sr); k++) {
          const w = Math.max(2, Math.round(k * 0.115)); let sm = 0, c = 0;
          for (let j = k - w; j <= k + w; j++) { sm += P(j); c++; }
          const q = P(k) / (sm / c) + 1e-30; lg += Math.log(q); ar += q; n++;
        }
        let lr = 0, ll = 0, rr = 0, mm = 0, ss = 0;
        for (let i = st; i < sr; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; mm += (L[i] + R[i]) ** 2; ss += (L[i] - R[i]) ** 2; }
        let cen = 0, cw = 0; for (let k = 1; k < N / 2; k++) { cen += P(k) * k * sr / N; cw += P(k); }
        return { lowDb: db(band(50, 110) / band(800, 1600)), corr: lr / Math.sqrt(ll * rr), sideMidDb: db(ss / mm), flat: Math.exp(lg / n) / (ar / n), centroid: cen / cw };
      };
      out.irNew = await ir(2);
      out.irOld = await ir(undefined);
      return out;
    });
    const f1 = (x) => x.toFixed(1);
    check('4 Hall-Voreinstellung (Insert, Anteil 25 %): Nachhall 10–14 dB unter dem Direktsignal (alt rund 19)', hall.insNew.wetDb <= -10 && hall.insNew.wetDb >= -14,
      `neu ${f1(hall.insNew.wetDb)} dB, alt ${f1(hall.insOld.wetDb)} dB`);
    check('4 Hall-Bus (Send 50 %, Bus 80 %): Nachhall 10–14 dB unter dem Direktsignal', hall.busNew.wetDb <= -10 && hall.busNew.wetDb >= -14,
      `neu ${f1(hall.busNew.wetDb)} dB, alt ${f1(hall.busOld.wetDb)} dB`);
    check('4 Nachhall breit: Seite/Mitte der Impulsantwort ±1 dB (Fläche ±2 dB), Korrelation links/rechts unter 0,1; Mischung mehr als doppelt so breit',
      Math.abs(hall.irNew.sideMidDb) <= 1 && Math.abs(hall.insNew.sideMidDb) <= 2 && Math.abs(hall.irNew.corr) < 0.1 && hall.insNew.width >= 0.02 && hall.insNew.width > 2 * hall.insOld.width,
      `S/M ${f1(hall.irNew.sideMidDb)} dB (Fläche ${f1(hall.insNew.sideMidDb)} dB), Korrelation ${hall.irNew.corr.toFixed(3)}, Breite ${hall.insNew.width.toFixed(3)} (alt ${hall.insOld.width.toFixed(3)})`);
    check('4 Tiefen im Hall beschnitten (50–110 Hz mindestens 18 dB unter 1 kHz; alt flach)', hall.irNew.lowDb <= -18 && hall.irOld.lowDb > -6,
      `neu ${f1(hall.irNew.lowDb)} dB, alt ${f1(hall.irOld.lowDb)} dB`);
    check('4 Nicht metallisch (Flachheit wie Rauschen, über 0,45) und wärmer (Schwerpunkt unter dem alten)', hall.irNew.flat > 0.45 && hall.irNew.centroid < hall.irOld.centroid - 1500,
      `Flachheit ${hall.irNew.flat.toFixed(2)}, Schwerpunkt ${Math.round(hall.irNew.centroid)} Hz (alt ${Math.round(hall.irOld.centroid)} Hz)`);

    // ---------- 5. Schutz-Limiter: Lautheit der Starter wie vorher, Spitze ≤ −1 dBTP ----------
    const starters = await page.evaluate(async (ids) => {
      const { store, library, renderProject, patterns } = window.loopwerk;
      const S = await import('./src/starter.js');
      const M = await import('./src/mastering.js');
      const { createDemoProject } = await import('./src/model.js');
      const out = {};
      for (const id of ids) {
        if (id === 'demo') store.replace(createDemoProject()); else await S.runStarter(id, { store, library });
        const p = JSON.parse(JSON.stringify(store.project));
        await patterns.sync(p);
        await library.ensureProject(p);
        p.master = { ...(p.master || {}), mastering: { ...(p.master?.mastering || {}), on: false } };
        const toBeat = Math.min(M.songEnd(p), 64);
        const lim = await renderProject(p, library, { toBeat, limiter: true, compensate: true });
        const dc = await renderProject(p, library, { toBeat, limiter: 'dc', compensate: true });
        const raw = await renderProject(p, library, { toBeat, limiter: false });
        out[id] = { lim: await window.__pg.lufs(lim), dc: await window.__pg.lufs(dc), raw: await window.__pg.lufs(raw), tp: await window.__pg.tp(lim), tpDc: await window.__pg.tp(dc) };
      }
      return out;
    }, Object.keys(OLD_STARTER));
    const rows = [];
    let worstOld = 0, worstDc = 0, worstTp = -Infinity, skipped = [];
    for (const [id, o] of Object.entries(OLD_STARTER)) {
      const s = starters[id];
      worstDc = Math.max(worstDc, Math.abs(s.lim - s.dc));
      worstTp = Math.max(worstTp, s.tp);
      if (Math.abs(s.raw - o.raw) <= 0.05) worstOld = Math.max(worstOld, Math.abs(s.lim - o.lim)); else skipped.push(id);
      rows.push(`${id} ${s.lim.toFixed(2)} (alt ${o.lim}, Rückfall ${s.dc.toFixed(2)}) ${s.tp.toFixed(2)} dBTP`);
    }
    check('5 Starter ohne Mastering: Lautheit höchstens 0,5 LU vom alten Stand (gespeicherte Bezugswerte)', worstOld <= 0.5,
      `größte Abweichung ${worstOld.toFixed(2)} LU${skipped.length ? `; Sounds geändert, nur Rückfall-Vergleich: ${skipped.join(', ')}` : ''}; ${rows.join('; ')}`);
    check('5 … und höchstens 0,5 LU vom alten Limiter (Rückfall, live gerechnet)', worstDc <= 0.5, `größte Abweichung ${worstDc.toFixed(2)} LU`);
    check('5 Spitze ≤ −1 dBTP in jedem Starter, auch Rock (alt +0,49 dBTP)', worstTp <= -1,
      `höchste ${worstTp.toFixed(2)} dBTP; Rock ${starters.rock.tp.toFixed(2)} dBTP (Rückfall ${starters.rock.tpDc.toFixed(2)})`);

    // ---------- 6. Latenz: Impuls landet im Export samplegenau; keine doppelte Begrenzung mit Mastering ----------
    const lat = await page.evaluate(async () => {
      const { library, renderProject, engine } = window.loopwerk;
      const E = await import('./src/engine.js');
      const C = await import('./src/dsp/master-core.js');
      const click = (extra = {}) => ({ ...window.__pg.project('test-click'), ...extra });
      const first = (b) => { const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) return i; return -1; };
      const peakAt = (b) => { const d = b.getChannelData(0); let at = 0; for (let i = 0; i < 4000; i++) if (Math.abs(d[i]) > Math.abs(d[at])) at = i; return at; };
      const o = {};
      const lim = await renderProject(click(), library, { toBeat: 4, limiter: true, compensate: true });
      const raw = await renderProject(click(), library, { toBeat: 4, limiter: false });
      const unc = await renderProject(click(), library, { toBeat: 4, limiter: true, compensate: false });
      const dc = await renderProject(click(), library, { toBeat: 4, limiter: 'dc', compensate: true });
      o.at = { lim: peakAt(lim), raw: peakAt(raw), dc: peakAt(dc), unc: peakAt(unc), first: first(lim) };
      o.len = { lim: lim.length, raw: raw.length };
      o.frames = C.peakLimiterLatency(44100);
      // Pegel des Impulses: 1,0 + 2,6 dB Anhebung → auf die Grenze begrenzt (Spitze unter −1 dBFS)
      o.limPeak = 20 * Math.log10(Math.abs(lim.getChannelData(0)[o.at.lim]));
      // Mastering an: mit und ohne Schutz-Limiter bitgleich (Weg A stumm, nur ein Begrenzer)
      const ms = click({ master: { volume: 1, mastering: { on: true, style: 'balanced' } } });
      const m1 = await renderProject(ms, library, { toBeat: 4, compensate: true, mastering: { pre: 0, drive: 3 } });
      const m0 = await renderProject(ms, library, { toBeat: 4, compensate: true, mastering: { pre: 0, drive: 3 }, limiter: false });
      let d = 0; for (let c = 0; c < 2; c++) { const a = m1.getChannelData(c), b = m0.getChannelData(c); for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); }
      o.master = { diff: d, at: peakAt(m1) };
      // Wiedergabe: playbackDelay = Verzögerung des Spitzenbegrenzers (Aufnahme-Ausgleich)
      window.loopwerk.store.replace(click());
      await engine._ensure();
      o.play = { delay: engine.playbackDelay(), want: C.peakLimiterLatency(engine.ctx.sampleRate) / engine.ctx.sampleRate, kind: engine.mix.lim?.kind, mastering: !!engine.mix.mst, frames: C.peakLimiterLatency(engine.ctx.sampleRate) };
      // Mastering an (Stil Club mit Clipper): playbackDelay folgt der Mastering-Kette, A/B „A“ wieder dem Schutz-Limiter
      window.loopwerk.store.replace(click({ master: { volume: 1, mastering: { on: true, style: 'club' } } }));
      o.play.club = engine.playbackDelay() * engine.ctx.sampleRate;
      o.play.clubWant = C.masterLatency(engine.ctx.sampleRate, 'club');
      engine.mix.monitor.ab = 'A';
      o.play.ab = engine.playbackDelay() * engine.ctx.sampleRate;
      engine.mix.monitor.ab = null;
      // Rückfall ohne Worklet: Kontext ohne geladenes Modul → DynamicsCompressor, es klingt
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const mix = E.buildMix(ctx, click(), { limiter: true, worklets: true });
      const s = ctx.createBufferSource(); s.buffer = library.get('test-click').buffer; s.connect(mix.tracks.get('t1').input); s.start();
      const y = (await ctx.startRendering()).getChannelData(0);
      let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
      o.fallback = { kind: mix.lim.kind, latency: E.mixLatency(44100, mix, await E.limiterLatency(44100)), peak: pk };
      return o;
    });
    check('6 Export mit Schutz-Limiter: Impuls exakt auf Frame 0, Länge wie ohne Limiter', lat.at.lim === 0 && lat.at.raw === 0 && lat.at.dc === 0 && lat.len.lim === lat.len.raw,
      JSON.stringify({ at: lat.at, len: lat.len }));
    check('6 Ohne Ausgleich liegt der Impuls um die Vorausschau später (237 Werte bei 44,1 kHz)', lat.at.unc === lat.frames && lat.frames === 237, `${lat.at.unc} / ${lat.frames}`);
    check('6 Impuls 0 dBFS wird unter −1 dBFS begrenzt', lat.limPeak < -1, `${lat.limPeak.toFixed(2)} dBFS`);
    check('6 Mastering an: mit und ohne Schutz-Limiter gleich (keine doppelte Begrenzung, Abweichung < 1e-9), Impuls auf Frame 0', lat.master.diff < 1e-9 && lat.master.at === 0, JSON.stringify(lat.master));
    check('6 Wiedergabe: playbackDelay = Vorausschau des Spitzenbegrenzers', lat.play.kind === 'peak' && !lat.play.mastering && Math.abs(lat.play.delay - lat.play.want) < 1e-9
      && Math.abs(lat.play.club - lat.play.clubWant) < 1e-6 && Math.abs(lat.play.ab - lat.play.frames) < 1e-6, JSON.stringify(lat.play));
    check('6 Ohne Worklet-Modul: Rückfall auf den DynamicsCompressor, es klingt, Latenz gemessen', lat.fallback.kind === 'dc' && lat.fallback.peak > 0.1 && lat.fallback.latency > 0, JSON.stringify(lat.fallback));

    check('Keine Konsolenfehler', app.errors.length === 0, app.errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme durch', false, err.stack || String(err));
  } finally {
    await app.close();
    finish();
  }
})();
