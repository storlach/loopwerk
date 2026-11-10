// Krachwerk Scheibe 2a, Audio-Teil (Spec docs/specs/krachwerk-2-werkbank.md §2–4, §8; ADR 008): Klang-Rezept am Sound,
// gebacken in die Library-Fassung. Gemessen im Offline-Rendering: Ausschnitt samplegenau, klickfreie Kanten, Hüllkurve,
// Lautstärke, Rückwärts, Tonhöhe (YIN), Filter (Spektrum), Wärme, Dehnen, Varianten, Undo, Realtime = Offline,
// Live ohne Stopp, gedehnte Clips ohne Lücke, Projektdatei Krachwerk → Loopwerk, Backzeit.
// node tests/recipe.test.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, createChecker, readSaved } = require('./harness.cjs');

const { check, finish } = createChecker();

// Im Browser: Testsignale, Messgrößen, eigener Test-Store
function helpers() {
  const sr = 44100;
  const { library } = window.loopwerk;
  const buf = (seconds, fill) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(b.getChannelData(c), c);
    return b;
  };
  const sine = (seconds, hz, amp) => buf(seconds, (d) => { for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr); });
  const noise = (seconds, seed = 11) => buf(seconds, (d) => {
    let a = seed >>> 0;
    for (let i = 0; i < d.length; i++) { // mulberry32
      a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      d[i] = 0.5 * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
    }
  });
  // Eigener Sound mit Original (wie eine Aufnahme)
  const own = async (id, orig, { kind = 'oneshot', beats = null } = {}) => {
    library.remove(id);
    const s = { id, name: id, category: 'own', kind, beats, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig, duration: orig.duration };
    if (kind === 'loop') s.bpm = Math.round((beats * 60 / orig.duration) * 100) / 100;
    return library.add(s);
  };
  const M = window.__M;
  const store = (bars = 4) => {
    const p = M.createEmptyProject({ tracks: 2, bpm: 120 });
    p.lengthBars = bars;
    for (const t of p.tracks) t.volume = 1;
    p.master = { volume: 1 };
    return new M.Store(p, { sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4, sampleName: (id) => library.get(id)?.name });
  };
  const render = async (s, toBeat) => (await window.loopwerk.renderProject(s.project, library, { limiter: false, toBeat })).getChannelData(0);
  const peak = (d, a = 0, z = d.length) => { let p = 0; for (let i = a; i < z; i++) p = Math.max(p, Math.abs(d[i])); return p; };
  const rms = (d, a = 0, z = d.length) => { let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, z - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  // Mittleres Leistungsspektrum (Hann, 8192er Fenster, halb überlappend)
  const spectrum = async (d, N = 8192) => {
    const { fft, hann } = await import('./src/dsp/fft.js');
    const w = hann(N);
    const pow = new Float64Array(N / 2);
    let n = 0;
    for (let s = 0; s + N <= d.length; s += N / 2, n++) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = d[s + i] * w[i];
      fft(re, im);
      for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    }
    for (let k = 0; k < N / 2; k++) pow[k] /= Math.max(1, n);
    return { pow, hz: sr / N };
  };
  const band = (sp, lo, hi) => { let e = 0; for (let k = Math.max(1, Math.ceil(lo / sp.hz)); k <= Math.min(sp.pow.length - 1, Math.floor(hi / sp.hz)); k++) e += sp.pow[k]; return 10 * Math.log10(e + 1e-30); };
  // Grundton per YIN: Median der sicheren Rahmen
  const yin = async (d) => {
    const { detectPitch } = await import('./src/dsp/pitch.js');
    const r = detectPitch(d, sr);
    const f = [...r.f0].filter((v, i) => r.conf[i] > 0.9 && v > 0).sort((a, b) => a - b);
    return f.length ? f[f.length >> 1] : 0;
  };
  const firstAbove = (d, th) => { for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) return i; return -1; };
  const maxStep = (d, a = 1, z = d.length) => { let m = 0; for (let i = Math.max(1, a); i < z; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; };
  window.T = { sr, buf, sine, noise, own, store, render, peak, rms, db, spectrum, band, yin, firstAbove, maxStep };
}

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    await page.evaluate(async () => { window.__M = await import('./src/model.js'); });
    await page.evaluate(helpers);
    const api = await page.evaluate(() => typeof window.loopwerk.library.applyRecipes === 'function' && typeof window.__M.Store.prototype.setRecipe === 'function');
    check('API vorhanden: library.applyRecipes, store.setRecipe', api);
    if (!api) return;

    // 1. Leeres Rezept ist bitgleich
    const r1 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      await T.own('rc-imp', T.buf(0.5, (d) => { d[Math.round(0.1 * T.sr)] = 1; d[Math.round(0.3 * T.sr)] = 1; }));
      const s = T.store();
      const b0 = library.get('rc-imp').buffer.getChannelData(0).slice();
      const rev0 = library.get('rc-imp').rev;
      s.setRecipe('rc-imp', { gain: -6 });
      await library.applyRecipes(s.project);
      const changed = T.peak(library.get('rc-imp').buffer.getChannelData(0));
      s.setRecipe('rc-imp', { gain: null });
      await library.applyRecipes(s.project);
      const b1 = library.get('rc-imp').buffer.getChannelData(0);
      let diff = b1.length === b0.length ? 0 : Infinity;
      for (let i = 0; i < b0.length && diff < Infinity; i++) diff = Math.max(diff, Math.abs(b1[i] - b0[i]));
      return { changed, diff, recipes: s.project.recipes ?? null, cooked: library.get('rc-imp').cooked, revUp: library.get('rc-imp').rev > rev0, src: library.source('rc-imp') === library.get('rc-imp').orig };
    });
    check('1 Rezept wirkt (−6 dB → Spitze 0,5) und Zurücksetzen ist bitgleich (größte Abweichung 0)', Math.abs(r1.changed - 0.501) < 0.01 && r1.diff === 0 && r1.recipes === null && r1.cooked === null && r1.revUp && r1.src,
      JSON.stringify(r1));

    // 2. Ausschnitt samplegenau
    const r2 = await page.evaluate(async () => {
      const T = window.T;
      const s = T.store();
      s.addClip('t1', 'rc-imp', 0, 1);
      s.setRecipe('rc-imp', { start: 0.2 });
      const d = await T.render(s, 2);
      const at = T.firstAbove(d, 0.3);
      return { at, want: Math.round(0.1 * T.sr), before: T.peak(d, 0, at - 2), len: window.loopwerk.library.get('rc-imp').cooked?.length };
    });
    check('2 Ausschnitt start 0,2 s: Impuls bei 0,10 s (±1 Frame), davor still', Math.abs(r2.at - r2.want) <= 1 && r2.before < 1e-4, JSON.stringify(r2));

    // 3. Klickfrei an Schnittkanten (2-ms-Blende), auch in Wiederholungen
    const r3 = await page.evaluate(async () => {
      const T = window.T;
      // 100 Hz statt 1 kHz: bei 1 kHz mit 0,8 ist schon die natürliche Flanke 0,11 je Sample
      await T.own('rc-sin100', T.sine(1, 100, 0.8));
      const s = T.store();
      s.addClip('t1', 'rc-sin100', 0, 8);
      s.setRecipe('rc-sin100', { start: 0.0123, end: 0.2437 });
      const d = await T.render(s, 8);
      const natural = 0.8 * 2 * Math.PI * 100 / T.sr;
      return { first: Math.abs(d[0]), step: T.maxStep(d), natural, beats: window.loopwerk.library.get('rc-sin100').lengthBeats };
    });
    check('3 Klickfrei: erstes Sample < 0,01, größter Sprung < 0,05 über 8 Wiederholungen', r3.first < 0.01 && r3.step < 0.05 && r3.beats === 1, JSON.stringify(r3));

    // 4. Hüllkurve
    const r4 = await page.evaluate(async () => {
      const T = window.T;
      await T.own('rc-dc', T.buf(1, (d) => d.fill(1)));
      const s = T.store();
      s.addClip('t1', 'rc-dc', 0, 2);
      s.setRecipe('rc-dc', { attack: 100, release: 200 });
      const d = await T.render(s, 2);
      const n = T.sr; // 1 s = 2 Schläge
      return { a0: d[0], a50: d[Math.round(0.05 * T.sr)], a100: d[Math.round(0.1 * T.sr)], r100: d[n - Math.round(0.1 * T.sr)], last: d[n - 1] };
    });
    const n2 = (v, w) => Math.abs(v - w) <= 0.02;
    check('4 Anschlag 100 ms linear: 0 / 0,5 / 1 bei 0 / 50 / 100 ms (±0,02)', n2(r4.a0, 0) && n2(r4.a50, 0.5) && n2(r4.a100, 1), JSON.stringify(r4));
    check('4 Ausklang 200 ms (1−x)²: 100 ms vor Ende 0,25 (±0,02), letztes Sample < 0,01', n2(r4.r100, 0.25) && Math.abs(r4.last) < 0.01, JSON.stringify(r4));

    // 5. Lautstärke, Auf Spitze
    const r5 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      await T.own('rc-sin1k', T.sine(1, 1000, 0.25));
      const s = T.store();
      s.addClip('t1', 'rc-sin1k', 0, 2);
      s.setRecipe('rc-sin1k', { gain: 6 });
      const p6 = T.peak(await T.render(s, 2));
      s.setRecipe('rc-sin1k', { gain: library.peakGainDb('rc-sin1k') });
      const pk = T.peak(await T.render(s, 2));
      return { p6db: T.db(p6 / 0.5), pkdb: T.db(pk), gain: s.project.recipes['rc-sin1k'].gain };
    });
    check('5 +6 dB auf Sinus 0,25 → Spitze 0,5 (±0,5 dB)', Math.abs(r5.p6db) <= 0.5, `${r5.p6db.toFixed(3)} dB`);
    check('5 Auf Spitze → −1 dBFS (±0,1)', Math.abs(r5.pkdb + 1) <= 0.1, `${r5.pkdb.toFixed(3)} dBFS, gain ${r5.gain}`);

    // 6. Rückwärts
    const r6 = await page.evaluate(async () => {
      const T = window.T;
      await T.own('rc-imp1', T.buf(0.5, (d) => { d[Math.round(0.1 * T.sr)] = 1; }));
      const s = T.store();
      s.addClip('t1', 'rc-imp1', 0, 1);
      s.setRecipe('rc-imp1', { reverse: true });
      const d = await T.render(s, 1);
      return { at: T.firstAbove(d, 0.3), want: Math.round(0.4 * T.sr) };
    });
    check('6 Rückwärts: Impuls 0,1 s in 0,5 s → bei 0,4 s (±1 Frame)', Math.abs(r6.at - r6.want) <= 1, JSON.stringify(r6));

    // 7. Tonhöhe (YIN)
    const r7 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      await T.own('rc-a4', T.sine(1, 440, 0.5));
      const s = T.store();
      s.addClip('t1', 'rc-a4', 0, 2);
      const f0 = await T.yin(await T.render(s, 2));
      s.setRecipe('rc-a4', { semis: 12 });
      const d12 = await T.render(s, 2);
      const len12 = library.get('rc-a4').cooked.length;
      const f12 = await T.yin(d12.subarray(0, len12));
      s.setRecipe('rc-a4', { semis: 1 });
      const f1 = await T.yin(await T.render(s, 2));
      s.setRecipe('rc-a4', { semis: null, cents: 100 });
      const fc = await T.yin(await T.render(s, 2));
      // Loop behält seine Schläge
      await T.own('rc-a4loop', T.sine(1, 440, 0.5), { kind: 'loop', beats: 2 });
      const s2 = T.store();
      s2.addClip('t1', 'rc-a4loop', 0, 2);
      s2.setRecipe('rc-a4loop', { semis: 12 });
      const dl = await T.render(s2, 2);
      return { f0, f12, len12, f1, fc, loopBeats: library.get('rc-a4loop').lengthBeats, loopFrames: library.get('rc-a4loop').buffer.length, fl: await T.yin(dl) };
    });
    const pct = (v, w) => Math.abs(v - w) / w;
    check('7 Ohne Rezept 440 Hz (YIN, ±1 %)', pct(r7.f0, 440) <= 0.01, `${r7.f0.toFixed(2)} Hz`);
    check('7 Halbtöne +12 → 880 Hz (YIN, ±1 %), Einzelklang halb so lang (±1 Sample)', pct(r7.f12, 880) <= 0.01 && Math.abs(r7.len12 - 22050) <= 1, `${r7.f12.toFixed(2)} Hz, ${r7.len12} Frames`);
    check('7 Cent +100 = Halbton +1 (±0,5 %)', pct(r7.fc, r7.f1) <= 0.005 && pct(r7.f1, 440 * Math.pow(2, 1 / 12)) <= 0.01, `${r7.fc.toFixed(2)} / ${r7.f1.toFixed(2)} Hz`);
    check('7 Loop +12: Länge 2 Schläge bleibt, klingt 880 Hz (±1 %)', r7.loopBeats === 2 && r7.loopFrames === 44100 && pct(r7.fl, 880) <= 0.01, `${r7.loopBeats} Schläge, ${r7.loopFrames} Frames, ${r7.fl.toFixed(2)} Hz`);

    // 8. Filter (Spektrum)
    const r8 = await page.evaluate(async () => {
      const T = window.T;
      await T.own('rc-noise', T.noise(2));
      const s = T.store();
      s.addClip('t1', 'rc-noise', 0, 4);
      const sp0 = await T.spectrum(await T.render(s, 4));
      s.setRecipe('rc-noise', { lp: 500 });
      const spl = await T.spectrum(await T.render(s, 4));
      s.setRecipe('rc-noise', { lp: null, hp: 1000 });
      const sph = await T.spectrum(await T.render(s, 4));
      return {
        hi: T.band(sp0, 4000, 20000) - T.band(spl, 4000, 20000), lo: T.band(spl, 20, 200) - T.band(sp0, 20, 200),
        hpLo: T.band(sp0, 20, 100) - T.band(sph, 20, 100),
      };
    });
    check('8 Tiefpass 500 Hz: > 4 kHz mindestens 24 dB leiser, < 200 Hz ±1 dB', r8.hi >= 24 && Math.abs(r8.lo) <= 1, `−${r8.hi.toFixed(1)} dB, ${r8.lo.toFixed(2)} dB`);
    check('8 Hochpass 1 kHz: < 100 Hz mindestens 24 dB leiser', r8.hpLo >= 24, `−${r8.hpLo.toFixed(1)} dB`);

    // 9. Wärme
    const r9 = await page.evaluate(async () => {
      const T = window.T;
      const f = 82 * T.sr / 8192; // genau auf einem FFT-Bin
      await T.own('rc-warm', T.sine(1, f, 0.5));
      const s = T.store();
      s.addClip('t1', 'rc-warm', 0, 2);
      s.setRecipe('rc-warm', { warm: 1 });
      const d = await T.render(s, 2);
      const sp = await T.spectrum(d.subarray(0, T.sr));
      const at = (k) => Math.max(sp.pow[k - 1], sp.pow[k], sp.pow[k + 1]);
      return { h3: 10 * Math.log10(at(246) / at(82)), peak: T.peak(d), rmsDb: T.db(T.rms(d, 0, T.sr)) - T.db(0.5 / Math.SQRT2) };
    });
    check('9 Wärme 1: 3. Oberton ≥ −30 dB, Spitze ≤ 1, RMS ±1 dB zum Eingang', r9.h3 >= -30 && r9.peak <= 1 && Math.abs(r9.rmsDb) <= 1, JSON.stringify(r9));

    // 10. Dehnen (Worker)
    const r10 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      await T.own('rc-a4s', T.sine(1, 440, 0.5));
      const s = T.store();
      s.addClip('t1', 'rc-a4s', 0, 4);
      s.setRecipe('rc-a4s', { stretch: 2 });
      const t0 = performance.now();
      await library.applyRecipes(s.project);
      const ms = performance.now() - t0;
      const c = library.get('rc-a4s').cooked;
      const f = await T.yin(c.getChannelData(0));
      return { len: c.length, f, ms };
    });
    check('10 Dehnen 2: Dauer ×2 (±1 %), 440 Hz (±1 %)', pct(r10.len, 88200) <= 0.01 && pct(r10.f, 440) <= 0.01, `${r10.len} Frames, ${r10.f.toFixed(2)} Hz, ${r10.ms.toFixed(0)} ms (Worker)`);

    // 11. Alle Clips, Variante
    const r11 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      await T.own('rc-var', T.sine(1, 1000, 0.5));
      const s = T.store();
      const c1 = s.addClip('t1', 'rc-var', 0, 2);
      const c2 = s.addClip('t1', 'rc-var', 4, 2);
      const lv = async () => { const d = await T.render(s, 8); return [T.db(T.peak(d, 0, T.sr) / 0.5), T.db(T.peak(d, 2 * T.sr, 3 * T.sr) / 0.5)]; };
      s.setRecipe('rc-var', { gain: -12 });
      const both = await lv();
      const u0 = s.undoStack.length;
      const vr = s.addVariant('rc-var', { clipId: c2 });
      const steps = s.undoStack.length - u0;
      const copied = s.project.recipes[vr]?.gain;
      s.setRecipe(vr, { gain: 0 });
      const after = await lv();
      const sameOrig = library.get(vr)?.orig === library.get('rc-var').orig;
      const parent = s.project.recipes[vr]?.parent;
      const vName = library.get(vr)?.name;
      const removeBusy = s.removeVariant(vr);
      s.undo();
      const undo1 = await lv();
      s.undo();
      const undo2 = { c2: s.findClip(c2).clip.sampleId, hasVr: !!s.project.recipes?.[vr] };
      await library.applyRecipes(s.project);
      return { vr, both, steps, copied, after, sameOrig, parent, vName, removeBusy, undo1, undo2, gone: !library.get(vr), c1sid: s.findClip(c1).clip.sampleId };
    });
    const dbn = (v, w) => Math.abs(v - w) <= 0.5;
    check('11 gain −12 gilt für beide Clips (±0,5 dB)', dbn(r11.both[0], -12) && dbn(r11.both[1], -12), JSON.stringify(r11.both));
    check('11 Als Variante: vr-…, ein Undo-Schritt, Rezept kopiert, parent = Wurzel, eigener Name, orig geteilt', /^vr-[a-z0-9]+$/.test(r11.vr) && r11.steps === 1 && r11.copied === -12 && r11.parent === 'rc-var' && r11.sameOrig && / b$/.test(r11.vName || ''),
      `${r11.vr} Schritte ${r11.steps} kopiert ${r11.copied} Name „${r11.vName}“ orig geteilt ${r11.sameOrig}`);
    check('11 Variante unabhängig: c2 0 dB, c1 bleibt −12 dB', dbn(r11.after[0], -12) && dbn(r11.after[1], 0), JSON.stringify(r11.after));
    check('11 removeVariant ohne Wirkung, solange ein Clip sie nutzt', r11.removeBusy === false);
    check('11 Undo: zurück zu −12 / −12, dann Clip wieder auf dem Eltern-Sound, Variante weg', dbn(r11.undo1[1], -12) && r11.undo2.c2 === 'rc-var' && !r11.undo2.hasVr && r11.gone,
      JSON.stringify({ u1: r11.undo1, u2: r11.undo2, gone: r11.gone }));

    // 12. Undo beim Ziehen
    const r12 = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const T = window.T;
      const s = T.store();
      const b0 = library.get('rc-noise').buffer.getChannelData(0).slice();
      await library.applyRecipes(s.project);
      const u0 = s.undoStack.length;
      for (let i = 0; i < 30; i++) s.setRecipe('rc-noise', { lp: 20000 - i * 600 }, { coalesce: 'rcp-rc-noise-lp-1' });
      const steps = s.undoStack.length - u0;
      await library.applyRecipes(s.project);
      const lp = s.project.recipes['rc-noise'].lp;
      s.undo();
      await library.applyRecipes(s.project);
      const b1 = library.get('rc-noise').buffer.getChannelData(0);
      let diff = 0;
      for (let i = 0; i < b0.length; i++) diff = Math.max(diff, Math.abs(b1[i] - b0[i]));
      return { steps, lp, diff, recipes: s.project.recipes ?? null };
    });
    check('12 30 × setRecipe mit gleichem coalesce = ein Undo-Schritt; undo → bitgleich', r12.steps === 1 && r12.diff === 0 && r12.recipes === null, JSON.stringify(r12));

    // 13. Offline wartet aufs Rezept
    const r13 = await page.evaluate(async () => {
      const T = window.T;
      const s = T.store();
      s.addClip('t1', 'rc-noise', 0, 4);
      const sp0 = await T.spectrum(await T.render(s, 4));
      s.setRecipe('rc-noise', { lp: 300 });
      const sp1 = await T.spectrum(await T.render(s, 4)); // ohne vorher zu warten
      return { hi: T.band(sp0, 2000, 20000) - T.band(sp1, 2000, 20000) };
    });
    check('13 renderProject sofort nach setRecipe: > 2 kHz mindestens 20 dB leiser', r13.hi >= 20, `−${r13.hi.toFixed(1)} dB`);

    // 18. Realtime-Scheduler = Offline (dieselbe gebackene Fassung, Einstieg mitten im Clip)
    const r18 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const E = await import('./src/engine.js');
      const T = window.T;
      const s = T.store();
      s.addClip('t1', 'rc-noise', 0, 8);
      s.setRecipe('rc-noise', { lp: 2000, start: 0.3, end: 1.6, attack: 20, release: 100, reverse: true, semis: -3 });
      await library.applyRecipes(s.project);
      const eng = new E.Engine(s, library);
      const b0 = 1.3;
      // Vorlauf wie im Betrieb: Seit dem längeren Ton-Vorlauf steigt eine Stimme, die auf „jetzt“ geplant wird, mit Versatz ein
      const LEAD = Math.round(0.1 * T.sr);
      eng.ctx = new OfflineAudioContext(2, Math.round((8 - b0) * 0.5 * T.sr) + LEAD, T.sr);
      eng.mix = E.buildMix(eng.ctx, s.project, { limiter: false });
      eng._scheduleActiveAt(b0, LEAD / T.sr, 8);
      eng._scheduleSpan(b0, 8, LEAD / T.sr, 8);
      const r = (await eng.ctx.startRendering()).getChannelData(0).subarray(LEAD);
      const o = (await renderProject(s.project, library, { limiter: false, fromBeat: b0, toBeat: 8 })).getChannelData(0);
      let diff = 0;
      // ab Abtastwert 128: die Einstiegs-Überblendung (96 Werte) läuft mit Vorlauf ganz, beim Offline-Start ist sie an der Null abgeschnitten
      for (let i = 128; i < Math.min(r.length, o.length); i++) diff = Math.max(diff, Math.abs(r[i] - o[i]));
      return { diff, peak: T.peak(o), voices: eng.voices.size };
    });
    check('18 Realtime-Scheduler = Offline mit Rezept (größte Abweichung < 1e-4)', r18.diff < 1e-4 && r18.peak > 0.05, JSON.stringify(r18));

    // 17. Kosten
    const r17 = await page.evaluate(async () => {
      const { cookRecipe } = await import('./src/dsp/recipe.js');
      const { library } = window.loopwerk;
      const T = window.T;
      const b = T.noise(10, 5);
      const chs = [b.getChannelData(0), b.getChannelData(1)];
      const all = { start: 0.5, end: 9.5, attack: 10, release: 300, gain: -3, reverse: true, semis: 3, cents: 20, lp: 3000, hp: 80, res: 0.4, warm: 0.5, grain: 0.3 };
      cookRecipe(chs, T.sr, all); // aufwärmen
      const times = [];
      for (let k = 0; k < 3; k++) { const t0 = performance.now(); cookRecipe(chs, T.sr, all); times.push(performance.now() - t0); }
      // Langer Klang (30 s) geht in den Worker
      await T.own('rc-long', T.noise(30, 9));
      const s = T.store(16);
      s.addClip('t1', 'rc-long', 0, 60);
      s.setRecipe('rc-long', { lp: 1000, semis: -2 });
      const t1 = performance.now();
      await library.applyRecipes(s.project);
      const long = performance.now() - t1;
      return { ms: Math.min(...times), long, cooked: !!library.get('rc-long').cooked };
    });
    check('17 Backen 10 s Stereo, alle Felder außer Dehnen: < 60 ms (Hauptthread)', r17.ms < 60, `${r17.ms.toFixed(1)} ms`);
    check('17 Langer Klang 30 s im Worker gebacken', r17.cooked, `${r17.long.toFixed(0)} ms`);

    // 14. Live ohne Stopp (App-Store, Realtime-Engine)
    const r14 = await page.evaluate(async () => {
      const { library, store, engine } = window.loopwerk;
      const T = window.T;
      await T.own('rc-live', T.noise(2, 3));
      engine.stop();
      const M = window.__M;
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      store.setLoop({ on: true, startBeat: 0, endBeat: 8 });
      const cid = store.addClip('t1', 'rc-live', 0, 8);
      engine.play(0);
      await new Promise((r) => setTimeout(r, 400));
      const rev0 = library.get('rc-live').rev;
      let playing = true; let mono = true; let last = engine.heardBeat();
      const t0 = performance.now();
      store.setRecipe('rc-live', { lp: 800 });
      let seen = -1;
      while (performance.now() - t0 < 1500) {
        await new Promise((r) => setTimeout(r, 10));
        playing = playing && engine.playing;
        const hb = engine.heardBeat();
        if (hb < last - 1e-6 && hb > 0.5) mono = false;
        last = hb;
        const tr = store.project.tracks[0];
        const clip = tr.clips.find((c) => c.id === cid);
        const v = [...engine.voices].find((x) => x.clipId === cid && x.sig === engine._sig(tr, clip));
        if (library.get('rc-live').rev > rev0 && v && seen < 0) { seen = performance.now() - t0; break; }
      }
      engine.stop();
      return { seen, playing, mono };
    });
    check('14 Live: nach setRecipe trägt eine eingeplante Stimme die neue Fassung (< 500 ms), ohne Stopp', r14.seen >= 0 && r14.seen < 500 && r14.playing && r14.mono, JSON.stringify(r14));

    // 15. Gedehnter Clip: keine Lücke
    const r15 = await page.evaluate(async () => {
      const { library, store } = window.loopwerk;
      const M = window.__M;
      const T = window.T;
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      const cid = store.addClip('t1', 'rc-live', 0, 4);
      store.setClipSpeed(cid, 0.8);
      await library.ensureProject(store.project);
      const clip = () => store.findClip(cid).clip;
      const ready0 = !!M.sampleFor(library, clip());
      store.setRecipe('rc-live', { lp: 400 });
      let nulls = 0; let n = 0; let fresh = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 5000) {
        await new Promise((r) => setTimeout(r, 10));
        const s = M.sampleFor(library, clip());
        n++;
        if (!s) nulls++;
        const base = library.get('rc-live');
        if (s && base.recipeKey && s.baseRev === base.rev) { fresh = true; break; }
      }
      return { ready0, nulls, n, fresh, ms: Math.round(performance.now() - t0) };
    });
    check('15 Gedehnter Clip (80 %): sampleFor nie null, bis die neue Fassung da ist', r15.ready0 && r15.nulls === 0 && r15.fresh, JSON.stringify(r15));

    // 16. Datei: Krachwerk → Loopwerk
    const kw = await app.browser.newPage();
    const kwErr = [];
    kw.on('pageerror', (e) => kwErr.push(e.message));
    await kw.goto(new URL('/werkstatt/', app.url).href);
    await kw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await kw.evaluate(async () => { window.__M = await import('./src/model.js'); });
    await kw.evaluate(helpers);
    const k1 = await kw.evaluate(async () => {
      const { own, store, library, renderProject } = window.loopwerk;
      const T = window.T;
      const M = window.__M;
      const snd = await own.create({ name: 'Bumm 1', buffer: T.sine(1, 330, 0.5) });
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 90 }));
      store.setProjectName('Rezept-Datei');
      const cid = store.addClip('t1', snd.id, 0, 4);
      store.setRecipe(snd.id, { lp: 1200, release: 300 });
      const vr = store.addVariant(snd.id, { clipId: cid });
      store.setRecipe(vr, { semis: -5, reverse: true });
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 8 })).getChannelData(0).slice();
      const embedded = (await own.embed(store.project)).map((e) => e.id);
      return { id: snd.id, vr, d: Array.from(d), embedded, peak: T.peak(d) };
    });
    const [download] = await Promise.all([kw.waitForEvent('download'), kw.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-rezept.zip');
    await download.saveAs(saved);
    const json = readSaved(saved); // Krachwerk: Song-ZIP (Scheibe 3a); ownSounds = Sounds aus werkstatt.json
    check('16 Datei: recipes und version 1, Variante mit parent', json.version === 1 && json.recipes?.[k1.vr]?.parent === k1.id && json.recipes?.[k1.id]?.lp === 1200, JSON.stringify(json.recipes));
    check('16 Datei: ownSounds enthält den Eltern-Sound, der nur über die Variante benutzt wird', json.ownSounds?.some((e) => e.id === k1.id) && k1.embedded.includes(k1.id), JSON.stringify(k1.embedded));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Rezept-Datei', null, { timeout: 10000 });
    const lw = await page.evaluate(async () => {
      const { store, library, renderProject } = window.loopwerk;
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 8 })).getChannelData(0);
      return { d: Array.from(d), clips: store.project.tracks[0].clips.map((c) => c.sampleId) };
    });
    let diff = lw.d.length === k1.d.length ? 0 : Infinity;
    for (let i = 0; i < k1.d.length && diff < Infinity; i++) diff = Math.max(diff, Math.abs(lw.d[i] - k1.d[i]));
    check('16 In Loopwerk geöffnet: Variante bleibt, Offline-Render gleich Krachwerk (< 1e-4)', lw.clips[0] === k1.vr && diff < 1e-4 && k1.peak > 0.05, `Abweichung ${diff}, Spitze ${k1.peak.toFixed(3)}, Clips ${lw.clips}`);

    check('Keine Konsolenfehler', !app.errors.length && !kwErr.length, [...app.errors, ...kwErr].join(' | '));
    await kw.close();
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
    finish();
  }
})();
