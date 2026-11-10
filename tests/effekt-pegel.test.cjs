// Ehrliche Pegel (Klanganalyse 2026-11, W2/W3/K3): Schutz-Limiter ohne versteckte Anhebung mit echter Spitzengrenze,
// Kompressor und Verzerrer pegelneutral beim Einschalten, Hall hörbar und breit. Seit 2026-11 gibt es davon nur eine
// Fassung: alte Songs (mit oder ohne Feld `v`) klingen wie neue, `v` fällt beim Laden weg. Echo als Ping-Pong (breit).
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
// Schwerpunkt der Impulsantwort: gemessen 5,2 kHz (der frühere Hall lag deutlich höher, über 6,7 kHz)
const CENTROID_MAX = 6000;
// Effekte, die früher eine Fassung `v` hatten (Verzerrer, Kompressor, Hall, Hall-Bus)
const VERSION_CASES = {
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

    // ---------- 1. Altes Projekt mit Feld `v` (1 oder 2) oder ohne lädt und klingt wie neu eingeschaltet ----------
    const loaded = await page.evaluate(async (CASES) => {
      const { library, renderProject, store } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const opts = { toBeat: 4, limiter: false, tailSeconds: 1.5 };
      // Größte Abweichung relativ zur Spitze (dB); die Faltung rechnet zwischen zwei Renderings nicht ganz bitgleich
      const rel = (a, b) => {
        let d = 0, pk = 0;
        for (let c = 0; c < 2; c++) { const x = a.getChannelData(c), y = b.getChannelData(c); for (let i = 0; i < x.length; i++) { d = Math.max(d, Math.abs(x[i] - y[i])); pk = Math.max(pk, Math.abs(x[i])); } }
        return { db: d > 0 ? 20 * Math.log10(d / pk) : -Infinity, peak: pk, len: a.length === b.length };
      };
      // Laden wie eine Datei: JSON → Store (replace) → was der Store hält, rendern
      const viaStore = async (proj) => { store.replace(JSON.parse(JSON.stringify(proj))); return JSON.parse(JSON.stringify(store.project)); };
      const out = {};
      for (const sid of ['pegel-drums', 'pegel-pad']) {
        out[sid] = {};
        for (const [name, c] of Object.entries(CASES)) {
          const variant = (v) => {
            const fx = FX.defaultFx();
            for (const [k, x] of Object.entries(c.fx || {})) fx[k] = { ...fx[k], ...x, ...(v != null ? { v } : {}) };
            const p = window.__pg.project(sid, { fx, sends: c.sends });
            if (c.sends) p.buses = { hall: { volume: 0.8, ...(v != null ? { v } : {}) } };
            return p;
          };
          // Neu eingeschaltet: leeres Projekt, Effekt bzw. Send über den Store
          store.replace(window.__pg.project(sid));
          for (const [k, x] of Object.entries(c.fx || {})) store.setTrackFx('t1', k, x);
          for (const [k, x] of Object.entries(c.sends || {})) store.setSend('t1', k, x);
          if (c.sends) store.setBus('hall', { volume: 0.8 });
          const fresh = await renderProject(JSON.parse(JSON.stringify(store.project)), library, opts);
          const r = {};
          for (const v of [null, 1, 2]) {
            const p = await viaStore(variant(v));
            r[v ?? 'ohne'] = { ...rel(fresh, await renderProject(p, library, opts)), stored: JSON.stringify(p).includes('"v":') };
          }
          out[sid][name] = r;
        }
      }
      return out;
    }, VERSION_CASES);
    for (const name of Object.keys(VERSION_CASES)) {
      let worst = -Infinity, stored = false, ok = true;
      const rows = [];
      for (const sid of Object.keys(loaded)) {
        for (const [v, r] of Object.entries(loaded[sid][name])) {
          worst = Math.max(worst, r.db);
          stored ||= r.stored;
          ok &&= r.len && r.peak > 0.01;
          rows.push(`${sid.slice(6)} v=${v} ${r.db === -Infinity ? '−∞' : r.db.toFixed(1)} dB`);
        }
      }
      check(`1 Altes Projekt mit ${name} (v: 1, v: 2, ohne v) lädt und klingt wie neu eingeschaltet (Abweichung < −90 dB zur Spitze), v nicht gespeichert`,
        ok && worst < -90 && !stored, rows.join(', '));
    }

    // ---------- 2. Das Feld `v` wird nicht geschrieben; beim Laden fällt es still weg ----------
    const stamp = await page.evaluate(async () => {
      const { store } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const hasV = (p) => (p.tracks || []).some((t) => Object.values(t.fx || {}).some((x) => x && 'v' in x))
        || Object.values(p.master?.fx || {}).some((x) => x && 'v' in x) || Object.values(p.buses || {}).some((x) => x && 'v' in x);
      const o = { errors: [] };
      const p = window.__pg.project('pegel-pad');
      p.tracks.push({ ...p.tracks[0], id: 't2', name: 't2', clips: [] });
      store.replace(p);
      // Einschalten, Drehen, Ausschalten, Senden, Effekt-Kurve, Pad-Aufnahme, Master
      for (const id of ['comp', 'drive', 'hall', 'eq']) store.setTrackFx('t1', id, { on: true });
      store.setTrackFx('t1', 'comp', { amount: 0.7 });
      store.setTrackFx('t1', 'drive', { on: false });
      store.setSend('t1', 'hall', 0.5);
      store.setSend('t2', 'hall', 0.3);
      store.setSend('t2', 'hall', 0);
      store.addAutoPoint('t2', 'hall.mix', 0, 0.3);
      store.recordAutoLane('t2', 'drive.mix', [{ beat: 0, value: 0.5 }, { beat: 2, value: 0.8 }], { on: true, type: 'hard' });
      store.setMasterFx('comp', { on: true });
      store.setMasterFx('hall', { on: true });
      o.written = hasV(store.project);
      o.on = { comp: store.track('t1').fx.comp.on, hall: store.track('t1').fx.hall.on, auto: store.track('t2').fx.hall.on, rec: store.track('t2').fx.drive.on, master: store.project.master.fx.comp.on };
      o.busAfterSend = store.project.buses ?? null;
      // Alte Datei mit Fassungen an Spur, Master und Bus: replace (Speicher beim Start) und openSong (Datei, Sicherung)
      const old = () => {
        const q = window.__pg.project('pegel-pad', { fx: { ...FX.defaultFx(), comp: { ...FX.defaultFx().comp, on: true, v: 1 }, hall: { ...FX.defaultFx().hall, on: true, v: 2 }, drive: { ...FX.defaultFx().drive, v: 1 } }, sends: { hall: 0.4 } });
        q.master = { volume: 1, fx: { comp: { on: true, amount: 0.3, v: 2 } } };
        q.buses = { hall: { v: 1 }, echo: { volume: 0.5 } };
        return JSON.parse(JSON.stringify(q));
      };
      try {
        store.replace(old());
        o.replaced = { v: hasV(store.project), buses: store.project.buses ?? null, comp: store.track('t1').fx.comp };
        store.replace(window.__pg.project('pegel-pad'));
        store.openSong(old());
        o.opened = { v: hasV(store.project), buses: store.project.buses ?? null, json: JSON.stringify(store.project).includes('"v":') };
        store.undo();
        store.redo();
        o.redo = hasV(store.project);
        // Bus mit weiteren Einstellungen behält sie
        const q = old(); q.buses = { hall: { v: 2, volume: 0.5, size: 0.3 } };
        store.replace(q);
        o.keep = store.project.buses;
      } catch (e) { o.errors.push(String(e)); }
      return o;
    });
    check('2 Einschalten, Drehen, Senden, Kurve, Pad-Aufnahme, Master: kein Feld v (Effekte trotzdem an, ein Send legt keinen Bus-Eintrag an)',
      !stamp.written && Object.values(stamp.on).every(Boolean) && stamp.busAfterSend === null, JSON.stringify({ written: stamp.written, on: stamp.on, bus: stamp.busAfterSend }));
    check('2 Alte Datei (v an Spur, Master, Bus) über replace und openSong: v still verworfen, leerer Bus-Eintrag fällt weg, nach Rückgängig/Wiederholen ohne v',
      stamp.errors.length === 0 && !stamp.replaced.v && !stamp.opened.v && !stamp.opened.json && !stamp.redo && stamp.replaced.comp.on === true
      && JSON.stringify(stamp.replaced.buses) === '{"echo":{"volume":0.5}}' && JSON.stringify(stamp.opened.buses) === '{"echo":{"volume":0.5}}', JSON.stringify(stamp));
    check('2 Bus-Eintrag mit eigenen Werten behält sie (nur v fällt weg)', JSON.stringify(stamp.keep) === '{"hall":{"volume":0.5,"size":0.3}}', JSON.stringify(stamp.keep));

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
      const with2 = (id, patch = {}) => { const fx = FX.defaultFx(); fx[id] = { ...fx[id], on: true, ...patch }; return fx; };
      const cases = {
        comp: with2('comp'), drive: with2('drive'),
        // „Presets“: Arten des Verzerrers, Klang aus Beschreibung („fett“, „verzerrt“, „stark verzerrt“, „8-Bit“)
        hard: with2('drive', { type: 'hard' }), fuzz: with2('drive', { type: 'fuzz' }), crush: with2('drive', { type: 'crush' }),
        crunch: with2('drive', { type: 'amp-crunch' }), lead: with2('drive', { type: 'amp-lead' }), metal: with2('drive', { type: 'amp-metal' }),
        /* „fett“ wie in src/ai.js (Kompressor 45 %) */ fett: with2('comp', { amount: 0.45 }), verzerrt: with2('drive', { drive: 0.5 }), stark: with2('drive', { drive: 0.8 }), bit: with2('drive', { type: 'crush', drive: 0.7, tone: 0.6 }),
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
      out.curve = { ohne: await curve({ ...FX.defaultFx().comp, on: true }), v1: await curve({ ...FX.defaultFx().comp, on: true, v: 1 }) };
      return out;
    });
    const analysis = ['gen-house-groove', 'chords-pad', 'bass-prog', 'synth-arp-prog'];
    const all = [...analysis, 'pegel-drums', 'pegel-pad', 'pegel-bass'];
    const span = (name, sids = all) => sids.map((s) => fresh[s][name]);
    const within = (name, lim, sids = all) => span(name, sids).every((v) => Math.abs(v) <= lim);
    const show = (name, sids = all) => span(name, sids).map((v) => (v >= 0 ? '+' : '') + v.toFixed(1)).join(' / ');
    check('3 Kompressor eingeschaltet (ohne Feld v): Lautheit ±1,5 LU (Drums / Fläche / Bass / Arp, dazu drei Testsignale)', within('comp', 1.5), `${show('comp')} LU`);
    check('3 Verzerrer eingeschaltet (ohne Feld v): Lautheit ±1,5 LU', within('drive', 1.5), `${show('drive')} LU`);
    const presets = ['hard', 'fuzz', 'crush', 'crunch', 'lead', 'metal', 'fett', 'verzerrt', 'stark', 'bit'];
    const badPresets = presets.filter((n) => !within(n, 2.0, analysis));
    check('3 Presets (Verzerrer-Arten, Klang aus Beschreibung) verschieben die Lautheit höchstens 2 LU', badPresets.length === 0,
      presets.map((n) => `${n} ${show(n, analysis)}`).join('; '));
    check('3 Kompressor: Sinus mit 0 dBFS bleibt unter 0 dBFS (ohne Feld v und mit v: 1 gleich)', fresh.curve.ohne < 0 && fresh.curve.ohne === fresh.curve.v1,
      `ohne v ${fresh.curve.ohne.toFixed(2)} dBFS, v: 1 ${fresh.curve.v1.toFixed(2)} dBFS`);

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
      const fxNew = FX.defaultFx(); fxNew.hall = { ...fxNew.hall, on: true };
      const busP = () => { const p = window.__pg.project('pegel-pad', { sends: { hall: 0.5 } }); p.buses = { hall: { volume: 0.8 } }; return p; };
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
        insNew: measure(await render({ fx: fxNew })),
        busNew: measure(await renderProject(busP(), library, { toBeat: 4, limiter: false, tailSeconds: 3 })),
      };
      // Impulsantwort nur nass (Bus-Einheit): Tiefen, Korrelation, „metallisch“ (Flachheit gegen ein
      // geglättetes Spektrum: Rauschen ≈ 0,56, Kammfilter deutlich darunter)
      const ir = async () => {
        const ctx = new OfflineAudioContext(2, sr * 4, sr);
        const b = ctx.createBuffer(1, 1, sr); b.getChannelData(0)[0] = 1;
        const src = ctx.createBufferSource(); src.buffer = b;
        const g = ctx.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit';
        const u = FX.EFFECTS.find((e) => e.id === 'hall').create(ctx, { dry: false });
        u.set({ ...FX.defaultFx().hall, mix: 1 }, null, 0.5, 0);
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
      out.irNew = await ir();
      return out;
    });
    const f1 = (x) => x.toFixed(1);
    check('4 Hall-Voreinstellung (Insert, Anteil 25 %): Nachhall 10–14 dB unter dem Direktsignal', hall.insNew.wetDb <= -10 && hall.insNew.wetDb >= -14,
      `${f1(hall.insNew.wetDb)} dB`);
    check('4 Hall-Bus (Send 50 %, Bus 80 %): Nachhall 10–14 dB unter dem Direktsignal', hall.busNew.wetDb <= -10 && hall.busNew.wetDb >= -14,
      `${f1(hall.busNew.wetDb)} dB`);
    check('4 Nachhall breit: Seite/Mitte der Impulsantwort ±1 dB (Fläche ±2 dB), Korrelation links/rechts unter 0,1; Mischung mindestens 0,02 breit',
      Math.abs(hall.irNew.sideMidDb) <= 1 && Math.abs(hall.insNew.sideMidDb) <= 2 && Math.abs(hall.irNew.corr) < 0.1 && hall.insNew.width >= 0.02,
      `S/M ${f1(hall.irNew.sideMidDb)} dB (Fläche ${f1(hall.insNew.sideMidDb)} dB), Korrelation ${hall.irNew.corr.toFixed(3)}, Breite ${hall.insNew.width.toFixed(3)}`);
    check('4 Tiefen im Hall beschnitten (50–110 Hz mindestens 18 dB unter 1 kHz)', hall.irNew.lowDb <= -18, `${f1(hall.irNew.lowDb)} dB`);
    check(`4 Nicht metallisch (Flachheit wie Rauschen, über 0,45) und warm (Schwerpunkt unter ${CENTROID_MAX} Hz)`, hall.irNew.flat > 0.45 && hall.irNew.centroid < CENTROID_MAX,
      `Flachheit ${hall.irNew.flat.toFixed(2)}, Schwerpunkt ${Math.round(hall.irNew.centroid)} Hz`);

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

    // ---------- 7. Echo als Ping-Pong: breit, im Raster, so laut wie das frühere Mono-Echo ----------
    const echo = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const FX = await import('./src/effects.js');
      const sr = 44100;
      const spb = 0.5;
      const time = 0.75 * spb; // 1/8 punktiert bei 120 BPM = 16537,5 Werte (die Verzögerung interpoliert)
      const T = time * sr;
      // Impulsantwort nur nass; mono = das frühere Echo (Verzögerung → Tiefpass 5 kHz → Rückkopplung) als Bezug
      // stereo: links Impuls bei 0, rechts bei 10 ms (zwei unkorrelierte Kanäle, Seite ≠ 0)
      const ir = async (mono, params, stereo = false) => {
        const ctx = new OfflineAudioContext(2, sr * 4, sr);
        const b = ctx.createBuffer(stereo ? 2 : 1, 1000, sr); b.getChannelData(0)[0] = 1; if (stereo) b.getChannelData(1)[441] = 1;
        const s = ctx.createBufferSource(); s.buffer = b;
        const g = ctx.createGain(); g.channelCount = 2; g.channelCountMode = 'explicit';
        s.connect(g);
        if (mono) {
          // das frühere Echo rechnete je Kanal für sich
          const d = ctx.createDelay(4); d.delayTime.value = time;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5000;
          const fb = ctx.createGain(); fb.gain.value = params.feedback;
          g.connect(d).connect(f).connect(fb).connect(d);
          f.connect(ctx.destination);
        } else {
          const u = FX.EFFECTS.find((e) => e.id === 'echo').create(ctx, { dry: false });
          u.set({ ...FX.defaultFx().echo, ...params, mix: 1 }, null, spb, 0);
          g.connect(u.input); u.output.connect(ctx.destination);
        }
        s.start(0);
        const y = await ctx.startRendering();
        return [y.getChannelData(0), y.getChannelData(1)];
      };
      const o = {};
      for (const [name, params] of [['insert', { feedback: 0.35 }], ['bus', { feedback: 0.4 }], ['lang', { feedback: 0.85 }]]) {
        const [L, R] = await ir(false, params);
        const [mL, mR] = await ir(true, params);
        let e = 0, em = 0, m = 0, sd = 0, lr = 0, ll = 0, rr = 0;
        for (let i = 0; i < L.length; i++) {
          e += L[i] ** 2 + R[i] ** 2; em += mL[i] ** 2 + mR[i] ** 2;
          m += (L[i] + R[i]) ** 2; sd += (L[i] - R[i]) ** 2; lr += L[i] * R[i]; ll += L[i] ** 2; rr += R[i] ** 2;
        }
        // Wiederholung k: Spitze je Kanal hinter k · T. Chrome hängt in einer Rückkopplung mit DelayNode je Umlauf einen
        // Block (128 Werte) an – das frühere Mono-Echo bei jeder Wiederholung, das Ping-Pong bei jeder zweiten.
        const taps = [1, 2, 3, 4].map((k) => {
          const at = (d) => { let p = 0, ix = 0; const c = Math.floor(k * T); for (let i = c - 64; i < c + 128 * k + 256; i++) if (Math.abs(d[i]) > p) { p = Math.abs(d[i]); ix = i; } return { p, off: ix - c }; };
          const l = at(L), r = at(R), ml = at(mL);
          const on = k % 2 ? l : r, off = k % 2 ? r : l;
          return { side: k % 2 ? 'L' : 'R', offset: on.off, monoOffset: ml.off, otherDb: 20 * Math.log10(off.p / on.p + 1e-30), levelDb: 20 * Math.log10(on.p / (ml.p * Math.SQRT2)) };
        });
        o[name] = { energyDb: 10 * Math.log10(e / em), sideMidDb: 10 * Math.log10(sd / m), corr: lr / Math.sqrt(ll * rr), taps };
      }
      {
        const [L, R] = await ir(false, { feedback: 0.35 }, true);
        const [mL, mR] = await ir(true, { feedback: 0.35 }, true);
        let e = 0, em = 0, sd = 0, sdm = 0;
        for (let i = 0; i < L.length; i++) { e += L[i] ** 2 + R[i] ** 2; em += mL[i] ** 2 + mR[i] ** 2; sd += (L[i] - R[i]) ** 2; sdm += (mL[i] - mR[i]) ** 2; }
        o.stereo = { energyDb: 10 * Math.log10(e / em), sideDb: 10 * Math.log10(sd / sdm) };
      }
      // Lautheit mit Echo-Voreinstellung (Anteil 30 %) auf den drei Testsignalen gegen trocken
      o.lufs = {};
      for (const sid of ['pegel-drums', 'pegel-pad', 'pegel-bass']) {
        const fx = FX.defaultFx(); fx.echo = { ...fx.echo, on: true };
        const opts = { toBeat: 4, limiter: false, tailSeconds: 1.5 };
        o.lufs[sid] = (await window.__pg.lufs(await renderProject(window.__pg.project(sid, { fx }), library, opts))) - (await window.__pg.lufs(await renderProject(window.__pg.project(sid), library, opts)));
      }
      return o;
    });
    const eRows = (k) => `${k}: Energie ${echo[k].energyDb.toFixed(3)} dB, S/M ${echo[k].sideMidDb.toFixed(1)} dB, Korrelation ${echo[k].corr.toFixed(3)}`;
    check('7 Echo nur nass: so viel Energie wie das frühere Mono-Echo (±0,1 dB; Voreinstellung, Bus, Rückkopplung 85 %)',
      ['insert', 'bus', 'lang'].every((k) => Math.abs(echo[k].energyDb) <= 0.1), ['insert', 'bus', 'lang'].map(eRows).join('; '));
    check('7 Stereo-Quelle (zwei unkorrelierte Kanäle): Energie wie das frühere Echo je Kanal (±0,1 dB), Seite mindestens so stark',
      Math.abs(echo.stereo.energyDb) <= 0.1 && echo.stereo.sideDb >= -0.1, `Energie ${echo.stereo.energyDb.toFixed(3)} dB, Seite ${echo.stereo.sideDb.toFixed(2)} dB`);
    check('7 Echo breit: Seite/Mitte ±1 dB um 0 (vorher −∞), Korrelation links/rechts unter 0,1', ['insert', 'bus', 'lang'].every((k) => Math.abs(echo[k].sideMidDb) <= 1 && Math.abs(echo[k].corr) < 0.1),
      ['insert', 'bus', 'lang'].map(eRows).join('; '));
    check('7 Ping-Pong: Wiederholungen 1–4 abwechselnd L, R, L, R, im Raster höchstens so spät wie das frühere Mono-Echo, Gegenkanal still (< −100 dB), Pegel je Wiederholung √2 · mono (±0,05 dB)',
      ['insert', 'bus', 'lang'].every((k) => echo[k].taps.every((t, i) => t.side === (i % 2 ? 'R' : 'L') && t.offset >= 0 && t.offset <= t.monoOffset && t.otherDb < -100 && Math.abs(t.levelDb) <= 0.05)),
      echo.insert.taps.map((t) => `${t.side} ${t.offset}/${t.monoOffset} Werte, Gegenkanal ${t.otherDb.toFixed(0)} dB, ${t.levelDb.toFixed(3)} dB`).join(' · '));
    check('7 Echo-Voreinstellung: Lautheit gegen trocken höchstens ±1,5 LU (Drums / Fläche / Bass)', Object.values(echo.lufs).every((v) => Math.abs(v) <= 1.5),
      Object.entries(echo.lufs).map(([k, v]) => `${k.slice(6)} ${v >= 0 ? '+' : ''}${v.toFixed(2)} LU`).join(', '));

    check('Keine Konsolenfehler', app.errors.length === 0, app.errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme durch', false, err.stack || String(err));
  } finally {
    await app.close();
    finish();
  }
})();
