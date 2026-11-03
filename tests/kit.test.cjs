// Krachwerk Scheibe 4, Modell und Engine (Spec docs/specs/krachwerk-4-kit.md §3–5, §9; ADR 012): Kits und Instrumente
// als Projektobjekte, Kit-Pattern mit eigenen Pad-Sounds (samplegenau, Rezept wirkt, auf Abruf), Klatsch-Kit (Zerlegen →
// Pads tief → hell, Groove, ein Undo), Instrument mit Grundton (YIN), Pad-Aufnahme, Live-Anschlag mit Vorlauf,
// Pad-Wand-Übernahme (pads.v1), Projektdatei hin und zurück (auch in Loopwerk). Gemessen im Offline-Rendering.
// node tests/kit.test.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

function helpers() {
  const sr = 44100;
  const { library } = window.loopwerk;
  const M = window.__M;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }; };
  const buf = (frames, fill) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(b.getChannelData(c), c);
    return b;
  };
  // Sinus-Stoß: Kosinus (erster Frame = Amplitude), linear auf 0 in `len` Sekunden
  const burst = (hz, len = 0.06, amp = 0.5) => buf(Math.round(len * sr), (d) => {
    for (let i = 0; i < d.length; i++) d[i] = amp * Math.cos(2 * Math.PI * hz * i / sr) * (1 - i / d.length);
  });
  const sine = (seconds, hz, amp = 0.4) => buf(Math.round(seconds * sr), (d) => { for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr); });
  const noise = (seconds, seed = 5) => buf(Math.round(seconds * sr), (d, c) => { const r = rng(seed + c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * r(); });
  // Aufnahme mit Rauschstößen (Tiefpass zweiter Ordnung je Stoß), Spitze je Stoß 0,6, Abstand `gap` s
  const claps = (cutoffs, gap = 0.3, seed = 11) => {
    const len = Math.round((0.1 + cutoffs.length * gap + 0.3) * sr);
    const r = rng(seed);
    const mono = new Float32Array(len);
    cutoffs.forEach((fc, k) => {
      const a = Math.round((0.1 + k * gap) * sr);
      const n = Math.round(0.09 * sr);
      const x = Math.exp(-2 * Math.PI * fc / sr);
      let y1 = 0, y2 = 0;
      const seg = new Float32Array(n);
      for (let i = 0; i < n; i++) { y1 = (1 - x) * r() + x * y1; y2 = (1 - x) * y1 + x * y2; seg[i] = y2 * Math.exp(-i / (0.02 * sr)); }
      let pk = 0;
      for (const v of seg) pk = Math.max(pk, Math.abs(v));
      for (let i = 0; i < n; i++) mono[a + i] += (0.6 * seg[i]) / pk;
    });
    return buf(len, (d) => d.set(mono));
  };
  const own = async (id, orig, extra = {}) => {
    library.remove(id);
    return library.add({ id, name: id, category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig, duration: orig.duration, ...extra });
  };
  const store = ({ tracks = 2, bpm = 90, bars = 8 } = {}) => {
    const p = M.createEmptyProject({ tracks, bpm });
    p.lengthBars = bars;
    for (const t of p.tracks) t.volume = 1;
    p.master = { volume: 1 };
    return new M.Store(p, {
      sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4, sampleName: (id) => library.get(id)?.name,
      soundDuration: (id) => library.get(id)?.orig?.duration ?? library.get(id)?.duration ?? null,
    });
  };
  const sync = (s) => window.loopwerk.patterns.sync(s.project);
  const render = async (s, toBeat = 4) => { await sync(s); return (await window.loopwerk.renderProject(s.project, library, { limiter: false, toBeat })).getChannelData(0).slice(); };
  const rms = (d, a = 0, z = d.length) => { let e = 0; for (let i = Math.max(0, a); i < Math.min(d.length, z); i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, z - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  const goertzel = (d, hz, a = 0, z = d.length) => {
    const w = 2 * Math.PI * hz / sr, k = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = Math.max(0, a); i < Math.min(d.length, z); i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / (z - a);
  };
  // erster Frame ab a mit |x| > thr
  const firstAbove = (d, thr, a = 0, z = d.length) => { for (let i = Math.max(0, a); i < Math.min(z, d.length); i++) if (Math.abs(d[i]) > thr) return i; return -1; };
  window.T = { sr, rng, buf, burst, sine, noise, claps, own, store, sync, render, rms, db, goertzel, firstAbove };
}

(async () => {
  const app = await openApp();
  const { page } = app;
  const kw = await app.browser.newPage({ viewport: { width: 1400, height: 820 } });
  const kwErr = [];
  kw.on('pageerror', (e) => kwErr.push(e.message));
  kw.on('console', (m) => { if (m.type() === 'error') kwErr.push(m.text()); });
  try {
    await kw.goto(new URL('/werkstatt/', app.url).href);
    await kw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await kw.evaluate(async () => {
      window.__M = await import('./src/model.js');
      window.__G = await import('./src/grooves.js').catch(() => null);
      window.__OI = await import('./src/own-instruments.js').catch(() => null);
      window.__CS = await import('./src/cut-sound.js');
      window.__C = await import('./src/cuts.js');
      window.__PW = await import('./src/pad-wall.js').catch(() => null);
      window.__I = await import('./src/instruments.js');
      window.__P = await import('./src/dsp/pitch.js');
    });
    await kw.evaluate(helpers);
    const api = await kw.evaluate(() => {
      const S = window.__M.Store.prototype;
      return {
        store: ['addKit', 'setKit', 'setKitPad', 'removeKit', 'addInstrument', 'setInstrument', 'removeInstrument', 'placeKit', 'placeInstrument', 'clapKit', 'setGroove', 'padHit'].filter((k) => typeof S[k] !== 'function'),
        grooves: !!window.__G?.GROOVES && typeof window.__G?.grooveRows === 'function',
        assign: typeof window.__C.assignPads === 'function',
        oi: typeof window.__OI?.detectRoot === 'function' && typeof window.__OI?.instrumentFromSound === 'function' && typeof window.__OI?.syncInstruments === 'function' && typeof window.__OI?.playKey === 'function',
        kit: typeof window.__CS.kitFromSound === 'function',
        pw: typeof window.__PW?.readPadsV1 === 'function' && typeof window.__PW?.padWallTemplate === 'function' && typeof window.__PW?.importPadWall === 'function',
        live: typeof window.loopwerk.engine.trackInput === 'function' && typeof window.__OI?.playPad === 'function' && typeof window.__G?.recordPadHit === 'function',
      };
    });
    const apiOk = !api.store.length && api.grooves && api.assign && api.oi && api.kit && api.pw && api.live;
    check('API vorhanden: Store-Aktionen, grooves, assignPads, own-instruments, kitFromSound, pad-wall, trackInput', apiOk, JSON.stringify(api));
    if (!apiOk) return;

    // 0. Modell: Normalisieren, Validierung, usedSampleIds, clearSong, Undo je Aktion
    const r0 = await kw.evaluate(() => {
      const M = window.__M;
      const s = window.T.store();
      const u0 = s.undoStack.length;
      const kid = s.addKit({ name: 'Mein Kit', map: { kick: 'own-a', snare: 'own-b', bogus: 'own-x', hat: 5 } });
      const u1 = s.undoStack.length;
      s.setKitPad(kid, 'clap', 'vr-c');
      const u2 = s.undoStack.length;
      s.setKitPad(kid, 'snare', null);
      s.setKit(kid, { name: 'Umbenannt' });
      const u2b = s.undoStack.length;
      const iid = s.addInstrument({ name: 'Summen', sampleId: 'own-i', root: 120, cents: 80, release: 9 });
      const u3 = s.undoStack.length;
      s.setInstrument(iid, { cents: -12 });
      const u3b = s.undoStack.length;
      const placed = s.placeKit(kid, { trackId: 't1', atBeat: 0 });
      const u4 = s.undoStack.length;
      const removeBlocked = s.removeKit(kid) === false && !!s.project.kits[kid];
      const p = s.project;
      p.recipes = { 'vr-c': { parent: 'own-p', name: 'c' } };
      const used = [...M.usedSampleIds(p)].sort();
      const valid = M.isValidProject(p) && !M.isValidProject({ ...p, kits: [] }) && !M.isValidProject({ ...p, instruments: 'x' });
      const out = {
        kid: /^k-[a-z0-9]{6,}$/.test(kid), iid: /^in-[a-z0-9]{6,}$/.test(iid), kit: p.kits[kid], inst: p.instruments[iid],
        steps: [u1 - u0, u2 - u1, u3 - u2b, u3b - u3, u4 - u3b], removeBlocked, used, valid,
        pat: p.patterns[placed.patternId], clip: s.findClip(placed.clipId)?.clip, loop: p.loop,
      };
      s.undo();
      out.undoPlace = !s.project.patterns?.[placed.patternId] && !s.findClip(placed.clipId) && !!s.project.kits[kid];
      s.clearSong();
      out.cleared = !s.project.kits && !s.project.instruments;
      return out;
    });
    check('0 IDs k-…/in-…, Kit-Map nur DRUM_ROWS mit Text, Name gesetzt', r0.kid && r0.iid && JSON.stringify(r0.kit) === JSON.stringify({ name: 'Umbenannt', map: { kick: 'own-a', clap: 'vr-c' } }), JSON.stringify(r0.kit));
    check('0 Instrument normalisiert (root 36…96, cents ±50, release 0…2)', r0.inst?.root === 96 && r0.inst?.cents === -12 && r0.inst?.release === 2 && r0.inst?.sampleId === 'own-i', JSON.stringify(r0.inst));
    check('0 je Aktion ein Undo-Schritt (addKit, setKitPad, addInstrument, setInstrument, placeKit)', JSON.stringify(r0.steps) === '[1,1,1,1,1]', JSON.stringify(r0.steps));
    check('0 removeKit verweigert, solange ein Pattern es nutzt', r0.removeBlocked);
    check('0 placeKit: Beat-Pattern mit kit, Muster Gerade, Clip 1 Takt, Loop an', r0.pat?.type === 'drums' && r0.pat?.kit && r0.pat.groove === 'gerade' && r0.pat.rows.kick[0] === 1 && r0.pat.rows.kick[8] === 1 && r0.pat.rows.snare.join('') === '0000000000000000' && r0.pat.rows.clap[4] === 0
      && r0.clip?.lengthBeats === 4 && r0.loop.on && r0.loop.startBeat === 0 && r0.loop.endBeat === 4, JSON.stringify({ rows: r0.pat?.rows, clip: r0.clip, loop: r0.loop }));
    check('0 placeKit: leere Pads übersprungen (Snare leer → keine Snare-Schritte, Clap auf Pad → keine, weil nicht im Muster)', r0.pat?.rows.hat.every((v) => v === 0));
    check('0 undo() von placeKit entfernt Pattern und Clip, Kit bleibt', r0.undoPlace);
    check('0 usedSampleIds zählt Kit-Pads, Instrument-Sound, Eltern von Varianten-Pads', JSON.stringify(r0.used) === JSON.stringify(['own-a', 'own-i', 'own-p', 'pat-' + 'p1', 'vr-c'].sort()), JSON.stringify(r0.used));
    check('0 isValidProject: kits/instruments nur als Objekt', r0.valid);
    check('0 clearSong löscht Kits und Instrumente', r0.cleared);

    // assignPads (ohne Audio): tief → kick, hell → hat, Mitte → snare, Rest aufsteigend
    const ra = await kw.evaluate(() => {
      const { assignPads } = window.__C;
      const mk = (cs) => cs.map((c, i) => ({ id: 'x' + i, centroid: c }));
      return {
        one: assignPads(mk([500])), two: assignPads(mk([3000, 500])),
        eight: assignPads(mk([900, 300, 7000, 1500, 200, 4000, 2500, 600])),
        ten: Object.keys(assignPads(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).length,
      };
    });
    check('assignPads: 1 → kick; 2 → kick + snare', JSON.stringify(ra.one) === '{"kick":"x0"}' && ra.two.kick === 'x1' && ra.two.snare === 'x0' && !ra.two.hat, JSON.stringify([ra.one, ra.two]));
    check('assignPads: 8 → kick dunkelster, hat hellster, snare Mitte, Rest clap < tomLo < tomHi < open < crash', ra.eight.kick === 'x4' && ra.eight.hat === 'x2' && ra.eight.snare === 'x0'
      && ['clap', 'tomLo', 'tomHi', 'open', 'crash'].map((r) => ra.eight[r]).join(',') === 'x1,x7,x3,x6,x5' && ra.ten === 8, JSON.stringify(ra.eight));

    // 1. Kit-Render: drei eigene Sounds, Muster Gerade, 90 BPM → Anschläge samplegenau, je Zeile die richtige Frequenz
    const r1 = await kw.evaluate(async () => {
      const T = window.T;
      await T.own('own-kt-lo', T.burst(200));
      await T.own('own-kt-mid', T.burst(1000));
      await T.own('own-kt-hi', T.burst(5000));
      const s = T.store();
      const kid = s.addKit({ name: 'Test', map: { kick: 'own-kt-lo', snare: 'own-kt-mid', hat: 'own-kt-hi' } });
      const { patternId } = s.placeKit(kid, { trackId: 't1', atBeat: 0 });
      const d = await T.render(s, 4);
      const spb = 60 / 90;
      const rows = { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] };
      const hz = { kick: 200, snare: 1000, hat: 5000 };
      const hits = [];
      for (const [row, steps] of Object.entries(rows)) {
        for (const st of steps) {
          const at = Math.round(st * spb / 4 * T.sr);
          const on = T.firstAbove(d, 0.05, at - Math.round(0.01 * T.sr), at + Math.round(0.01 * T.sr));
          const w = Math.round(0.04 * T.sr);
          const own = T.goertzel(d, hz[row], at, at + w);
          const other = Math.max(...Object.entries(hz).filter(([r]) => r !== row).map(([, f]) => T.goertzel(d, f, at, at + w)));
          hits.push({ row, st, off: on - at, sep: T.db(own / other) });
        }
      }
      const pre = T.rms(d, Math.round(1 * spb / 4 * T.sr), Math.round(2 * spb / 4 * T.sr) - 10);
      window.__k1 = { s, kid, patternId };
      return { hits, pre };
    });
    const badOff = r1.hits.filter((h) => Math.abs(h.off) > 44);
    const badSep = r1.hits.filter((h) => h.sep < 20);
    check('1 Kit-Render: 8 Anschläge an k·spb/4 ± 1 ms', !badOff.length, r1.hits.map((h) => `${h.row}@${h.st}:${h.off}`).join(' '));
    check('1 je Zeile die richtige Frequenz (Goertzel ≥ 20 dB Abstand)', !badSep.length, r1.hits.map((h) => `${h.row}:${h.sep.toFixed(0)}dB`).join(' '));
    check('1 zwischen den Schlägen still', r1.pre < 1e-4, r1.pre.toExponential(1));

    // 2. Rezept am Pad-Sound wirkt im gerenderten Pattern (Pattern-Schlüssel enthält recipeKey)
    const r2 = await kw.evaluate(async () => {
      const T = window.T;
      const { s } = window.__k1;
      const spb = 60 / 90;
      const at = Math.round(4 * spb / 4 * T.sr);
      const w = Math.round(0.04 * T.sr);
      const a = T.rms(await T.render(s, 4), at, at + w);
      s.setRecipe('own-kt-mid', { gain: -12 });
      const b = T.rms(await T.render(s, 4), at, at + w);
      const kick = Math.round(0 * T.sr);
      const k = T.rms(await T.render(s, 4), kick, kick + w);
      s.setRecipe('own-kt-mid', { gain: null });
      const c = T.rms(await T.render(s, 4), at, at + w);
      return { delta: T.db(b / a), back: T.db(c / a), kick: k };
    });
    check('2 setRecipe(Pad, gain −12) → Schlag −12 ± 0,5 dB', Math.abs(r2.delta + 12) <= 0.5, `${r2.delta.toFixed(2)} dB`);
    check('2 Rezept zurück → Schlag wieder wie vorher', Math.abs(r2.back) <= 0.1, `${r2.back.toFixed(2)} dB`);

    // 3. Auf Abruf: Pad-Sound als Stub ohne orig
    const r3 = await kw.evaluate(async () => {
      const T = window.T;
      const lib = window.loopwerk.library;
      const b = T.burst(1000);
      lib.remove('own-kt-lazy');
      lib.stub({ id: 'own-kt-lazy', name: 'Lazy', category: 'own', kind: 'oneshot', origin: 'Eigene', made: { from: 'mic' }, duration: b.duration }, async (x) => { x.orig = b; x.duration = b.duration; });
      const s = T.store();
      const kid = s.addKit({ name: 'Lazy', map: { tomLo: 'own-kt-lazy' } });
      const { patternId } = s.placeKit(kid, { trackId: 't1', atBeat: 0 });
      s.updatePattern(patternId, (p) => { p.rows.tomLo[1] = 1; });
      const wasLazy = !!lib.get('own-kt-lazy').lazy && !lib.get('own-kt-lazy').orig;
      const d = await T.render(s, 4);
      const at = Math.round(1 * (60 / 90) / 4 * T.sr);
      return { wasLazy, r: T.rms(d, at, at + Math.round(0.03 * T.sr)) };
    });
    check('3 Pad-Sound auf Abruf (Stub ohne orig) klingt im Render', r3.wasLazy && r3.r > 0.05, `lazy ${r3.wasLazy}, RMS ${r3.r.toFixed(3)}`);

    // 4. Klatsch-Kit: 8 Rauschstöße (Tiefpass gemischt) → 8 Pads tief → hell, Groove spielt, ein Undo
    const r4 = await kw.evaluate(async () => {
      const T = window.T;
      const lib = window.loopwerk.library;
      const cut = [3000, 200, 12000, 800, 6000, 400, 1500, 9000];
      await T.own('own-kt-clap', T.claps(cut));
      const s = T.store({ tracks: 2 });
      const u0 = s.undoStack.length;
      const res = await window.__CS.kitFromSound({ store: s, library: lib, sampleId: 'own-kt-clap', place: true });
      const kit = s.project.kits?.[res.kitId];
      // Schnitt → Stoß-Index über den Anfang (Stoß k bei 0,1 + 0,3·k s)
      const which = (id) => { const r = s.project.recipes[id]; return Math.round(((r.start ?? 0) + 0.003 - 0.1) / 0.3); };
      const pads = Object.fromEntries(Object.entries(kit?.map || {}).map(([row, id]) => [row, cut[which(id)]]));
      const steps = s.undoStack.length - u0;
      const pat = s.project.patterns?.[res.patternId];
      const clip = s.findClip(res.clipId)?.clip;
      const d = await T.render(s, 4);
      const spb = 60 / 90;
      const on0 = T.firstAbove(d, 0.02, 0, Math.round(0.05 * T.sr));
      const at2 = Math.round(2 * spb * T.sr);
      const on2 = T.firstAbove(d, 0.02, at2 - Math.round(0.02 * T.sr), at2 + Math.round(0.05 * T.sr)) - at2;
      const name = kit?.name;
      const loop = s.project.loop;
      s.undo();
      const p = s.project;
      const gone = !Object.keys(p.kits || {}).length && !Object.keys(p.patterns || {}).length && !p.tracks.some((t) => t.clips.length) && !Object.keys(p.recipes || {}).length;
      // Nur ein Schlag: nichts entsteht
      await T.own('own-kt-one', T.claps([1000]));
      const s2 = T.store();
      const one = await window.__CS.kitFromSound({ store: s2, library: lib, sampleId: 'own-kt-one', place: true });
      return { res: { count: res.count, kitId: !!res.kitId }, pads, steps, name, groove: pat?.groove, clip: clip && [clip.startBeat, clip.lengthBeats], loop, on0, on2, gone, keep: !!lib.get('own-kt-clap'), one: { count: one.count, kitId: one.kitId, undo: s2.undoStack.length } };
    });
    check('4 Klatsch-Kit: 8 Schläge → 8 Pads, Name „Klatschen 1“', r4.res.count === 8 && r4.res.kitId && Object.keys(r4.pads).length === 8 && r4.name === 'Klatschen 1', JSON.stringify({ res: r4.res, name: r4.name }));
    check('4 Zuordnung tief → hell: kick 200 Hz, hat 12 kHz, snare Mitte, Rest aufsteigend', r4.pads.kick === 200 && r4.pads.hat === 12000 && r4.pads.snare === 1500
      && ['clap', 'tomLo', 'tomHi', 'open', 'crash'].map((r) => r4.pads[r]).join(',') === '400,800,3000,6000,9000', JSON.stringify(r4.pads));
    check('4 Groove Gerade, Clip 1 Takt ab 0, Loop an', r4.groove === 'gerade' && JSON.stringify(r4.clip) === '[0,4]' && r4.loop.on && r4.loop.endBeat === 4, JSON.stringify({ g: r4.groove, clip: r4.clip, loop: r4.loop }));
    // Schnitte beginnen 3 ms vor dem Anschlag (CUT_PRE): Kick erklingt bei Schritt + 3 ms
    check('4 Render: Kick bei 0 und 2 Schlägen (+ 3 ms Schnitt-Vorlauf) ± 2 ms', Math.abs(r4.on0 - 132) <= 88 && Math.abs(r4.on2 - 132) <= 88, `Frames ${r4.on0} / ${r4.on2} (Soll 132 ± 88)`);
    check('4 ein Undo-Schritt; undo() entfernt Kit, Pattern, Clip, Schnitte, Aufnahme bleibt', r4.steps === 1 && r4.gone && r4.keep, JSON.stringify({ steps: r4.steps, gone: r4.gone, keep: r4.keep }));
    check('4 nur ein Schlag: nichts entsteht', r4.one.count === 1 && !r4.one.kitId && r4.one.undo === 0, JSON.stringify(r4.one));

    // 5. Instrument: Grundton per YIN, Note E5 aus A4-Aufnahme
    const r5 = await kw.evaluate(async () => {
      const T = window.T;
      const lib = window.loopwerk.library;
      const { instrumentFromSound } = window.__OI;
      const { detectPitch, toMono } = window.__P;
      const hzOf = (d, a, z) => {
        const tr = detectPitch(d.subarray(a, z), T.sr, { fmax: 2000 });
        const v = [];
        for (let i = 0; i < tr.f0.length; i++) if (tr.conf[i] > 0.9) v.push(tr.f0[i]);
        v.sort((x, y) => x - y);
        return v[v.length >> 1] ?? 0;
      };
      await T.own('own-kt-a4', T.sine(1.5, 440));
      await T.own('own-kt-452', T.sine(1.5, 452));
      await T.own('own-kt-noise', T.noise(1.5));
      const s = T.store();
      const a = await instrumentFromSound({ store: s, library: lib, sampleId: 'own-kt-a4' });
      const ia = s.project.instruments[a.id];
      const { patternId } = s.placeInstrument(a.id, { trackId: 't1', atBeat: 0 });
      s.updatePattern(patternId, (p) => { p.notes = [{ pitch: 76, start: 0, len: 2, vel: 1 }]; });
      const d1 = await T.render(s, 4);
      const e5 = hzOf(d1, Math.round(0.1 * T.sr), Math.round(1.2 * T.sr));
      const pat = s.project.patterns[patternId];
      // Rezept am Instrument-Sound wirkt: +12 Halbtöne → E6
      s.setRecipe('own-kt-a4', { semis: 12 });
      const e6 = hzOf(await T.render(s, 4), Math.round(0.1 * T.sr), Math.round(0.6 * T.sr));
      const b = await instrumentFromSound({ store: s, library: lib, sampleId: 'own-kt-452' });
      const ib = s.project.instruments[b.id];
      const pb = s.placeInstrument(b.id, { trackId: 't2', atBeat: 0 }).patternId;
      s.updatePattern(pb, (p) => { p.notes = [{ pitch: 69, start: 0, len: 2, vel: 1 }]; });
      s.setTrack('t1', { mute: true });
      const a4 = hzOf(await T.render(s, 4), Math.round(0.1 * T.sr), Math.round(1.2 * T.sr));
      const u = s.undoStack.length;
      const n = await instrumentFromSound({ store: s, library: lib, sampleId: 'own-kt-noise' });
      const inn = s.project.instruments[n.id];
      return { a: { root: ia.root, cents: ia.cents, sure: a.sure, name: ia.name }, preset: pat.preset === a.id, type: pat.type, e5, e6, b: { root: ib.root, cents: ib.cents }, a4, n: { root: inn.root, cents: inn.cents, sure: n.sure, steps: s.undoStack.length - u } };
    });
    check('5 Sinus 440 → root 69, cents 0 ± 5, sicher', r5.a.root === 69 && Math.abs(r5.a.cents) <= 5 && r5.a.sure === true, JSON.stringify(r5.a));
    check('5 placeInstrument: Melodie-Pattern mit preset = Instrument', r5.preset && r5.type === 'synth');
    check('5 Note 76 → 659,3 Hz ± 1 %', Math.abs(r5.e5 / 659.26 - 1) <= 0.01, `${r5.e5.toFixed(1)} Hz`);
    check('5 Rezept am Instrument-Sound (+12) → Note 76 klingt 1318,5 Hz ± 1 %', Math.abs(r5.e6 / 1318.5 - 1) <= 0.01, `${r5.e6.toFixed(1)} Hz`);
    check('5 Sinus 452 → root 69, cents ≈ +47; Note 69 → 440 Hz ± 1 %', r5.b.root === 69 && Math.abs(r5.b.cents - 47) <= 3 && Math.abs(r5.a4 / 440 - 1) <= 0.01, `${JSON.stringify(r5.b)}, ${r5.a4.toFixed(1)} Hz`);
    check('5 Rauschen → root 60, nicht sicher (Einblender), ein Undo-Schritt', r5.n.root === 60 && r5.n.cents === 0 && r5.n.sure === false && r5.n.steps === 1, JSON.stringify(r5.n));

    // 6. Pad-Aufnahme: heardBeat 1,02 und 2,49 → Schritte 4 und 10, ein Undo je Durchgang; Live-Anschlag mit Vorlauf
    const r6 = await kw.evaluate(async () => {
      const T = window.T;
      const G = window.__G;
      const lib = window.loopwerk.library;
      const s = T.store();
      const kid = s.addKit({ name: 'Rec', map: { kick: 'own-kt-lo', tomLo: 'own-kt-mid' } });
      const { patternId, clipId } = s.placeKit(kid, { trackId: 't1', atBeat: 4 });
      let beat = 0;
      const fake = { heardBeat: () => beat };
      const u0 = s.undoStack.length;
      for (const b of [5.02, 6.49]) { beat = b; G.recordPadHit({ store: s, engine: fake, clipId, row: 'tomLo', vel: 1, pass: 'a' }); }
      const u1 = s.undoStack.length;
      beat = 7.26;
      G.recordPadHit({ store: s, engine: fake, clipId, row: 'kick', vel: 0.5, pass: 'b' });
      const u2 = s.undoStack.length;
      const rows = s.project.patterns[patternId].rows;
      const tom = rows.tomLo.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const kick = rows.kick.map((v, i) => (v ? `${i}:${v}` : '')).filter(Boolean);
      // Live: Anschlag über die Spur des Clips, mit kurzem Vorlauf auf der Audio-Uhr
      const engine = window.loopwerk.engine;
      const starts = [];
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, ...rest) { starts.push(when); return orig.call(this, when, ...rest); };
      let live;
      try {
        const map = { kick: 'own-kt-lo' };
        live = await window.__OI.playPad({ engine, library: lib, map, row: 'kick', trackId: 't1' });
      } finally { AudioBufferSourceNode.prototype.start = orig; }
      const now = engine.ctx.currentTime;
      return { starts, tom, kick, steps: [u1 - u0, u2 - u1], lead: live.when - live.now, inTrack: live.dest === engine.trackInput('t1') && live.dest !== engine.mix.master, started: starts.filter((t) => t === live.when).length === 1, future: live.when >= live.now, now };
    });
    check('6 Pad-Aufnahme: heardBeat 1,02 / 2,49 im Clip → Schritte 4 und 10', JSON.stringify(r6.tom) === '[4,10]', JSON.stringify(r6.tom));
    check('6 Anschlag gespeichert, Kick 3,26 → Schritt 13 mit 0,5', r6.kick.includes('13:0.5'), JSON.stringify(r6.kick));
    check('6 ein Undo-Schritt je ●-Durchgang', JSON.stringify(r6.steps) === '[1,1]', JSON.stringify(r6.steps));
    check('6 Live-Anschlag: über den Spureingang, Vorlauf 0 < Δ ≤ 10 ms auf ctx.currentTime', r6.inTrack && r6.started && r6.future && r6.lead > 0 && r6.lead <= 0.01, JSON.stringify(r6));

    // 8. Pad-Wand-Übernahme (pads.v1): 3 mk-Sounds + 1 Synth-Pad → Vorlage, Tipp → Kit mit 3 Pads, Vorlage weg
    const r8 = await kw.evaluate(async () => {
      const T = window.T;
      const PW = window.__PW;
      const lib = window.loopwerk.library;
      for (const id of ['mk-pw1', 'mk-pw2', 'mk-pw3']) await T.own(id, T.burst(500));
      const raw = JSON.stringify({ v: 1, pads: [{ sound: 'mk-pw1' }, null, { synth: { kit: 'elektro', row: 'kick' } }, { sound: 'mk-pw2' }, { sound: 'mk-gone' }, { sound: 'mk-pw3' }, ...Array(10).fill(null)] });
      const key = window.loopwerk.edition.padsKey;
      localStorage.setItem(key, raw);
      const tolerant = [PW.readPadsV1(JSON.stringify(['mk-a', { id: 'mk-b' }, { sampleId: 'mk-c' }])), PW.readPadsV1('kaputt'), PW.readPadsV1(null)];
      const s = T.store();
      const tpl = PW.padWallTemplate({ project: s.project, library: lib });
      const u = s.undoStack.length;
      const kid = PW.importPadWall({ store: s, library: lib });
      const kit = s.project.kits?.[kid];
      const after = PW.padWallTemplate({ project: s.project, library: lib });
      const again = PW.importPadWall({ store: s, library: lib });
      return { tolerant, tpl, kit, steps: s.undoStack.length - u, after, again, kept: localStorage.getItem(key) === raw };
    });
    check('8 readPadsV1 tolerant: IDs, {id}, {sampleId}; Kaputtes → []', JSON.stringify(r8.tolerant) === '[["mk-a","mk-b","mk-c"],[],[]]', JSON.stringify(r8.tolerant));
    check('8 Vorlage „Pad-Wand“ mit 3 vorhandenen Sounds (Synth und fehlender fallen weg)', r8.tpl && JSON.stringify(r8.tpl.ids) === '["mk-pw1","mk-pw2","mk-pw3"]', JSON.stringify(r8.tpl));
    check('8 Tipp → Kit mit 3 Pads, from pads.v1, ein Undo-Schritt', r8.kit?.from === 'pads.v1' && JSON.stringify(r8.kit.map) === '{"kick":"mk-pw1","snare":"mk-pw2","clap":"mk-pw3"}' && r8.steps === 1, JSON.stringify(r8.kit));
    check('8 danach keine Vorlage, keine zweite Übernahme, padsKey bleibt liegen', r8.after === null && r8.again === null && r8.kept, JSON.stringify({ after: r8.after, again: r8.again }));

    // 7. Projektdatei: Kit + Instrument (Pad-Sounds ohne eigenen Clip eingebettet), in Loopwerk geöffnet → Render gleich
    const k7 = await kw.evaluate(async () => {
      const { store, library, renderProject, own, patterns } = window.loopwerk;
      const T = window.T;
      const M = window.__M;
      const mk = async (name, b) => (await own.create({ name, buffer: b })).id;
      const lo = await mk('Tief', T.burst(200));
      const hi = await mk('Hell', T.burst(5000));
      const tone = await mk('Ton', T.sine(1.5, 440));
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      store.setProjectName('Kit-Datei');
      await window.loopwerk.tempo.apply();
      const kid = store.addKit({ name: 'Datei-Kit', map: { kick: lo, hat: hi } });
      store.placeKit(kid, { trackId: 't1', atBeat: 0 });
      const ins = await window.__OI.instrumentFromSound({ store, library, sampleId: tone });
      const { patternId } = store.placeInstrument(ins.id, { trackId: 't2', atBeat: 0 });
      store.updatePattern(patternId, (p) => { p.notes = [{ pitch: 72, start: 0, len: 1, vel: 1 }, { pitch: 76, start: 2, len: 1, vel: 0.8 }]; });
      store.setRecipe(hi, { gain: -6 });
      await patterns.sync(store.project);
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 4 })).getChannelData(0);
      const emb = (await own.embed(store.project)).map((e) => e.id);
      return { d: Array.from(d), ids: [lo, hi, tone], emb, peak: d.reduce((m, v) => Math.max(m, Math.abs(v)), 0) };
    });
    check('7 Pad- und Instrument-Sounds ohne eigenen Clip werden eingebettet', k7.ids.every((id) => k7.emb.includes(id)), JSON.stringify({ ids: k7.ids, emb: k7.emb }));
    const [download] = await Promise.all([kw.waitForEvent('download'), kw.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-kit.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    check('7 Datei: version 1, kits und instruments gespeichert', json.version === 1 && Object.keys(json.kits || {}).length === 1 && Object.keys(json.instruments || {}).length === 1,
      JSON.stringify({ kits: json.kits, instruments: json.instruments }));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Kit-Datei', null, { timeout: 10000 });
    const lw = await page.evaluate(async () => {
      const { store, library, renderProject, patterns, tempo } = window.loopwerk;
      await tempo.apply();
      await patterns.sync(store.project);
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 4 })).getChannelData(0);
      return { d: Array.from(d), kits: Object.keys(store.project.kits || {}).length };
    });
    let diff = lw.d.length === k7.d.length ? 0 : Infinity;
    for (let i = 0; i < k7.d.length && diff < Infinity; i++) diff = Math.max(diff, Math.abs(lw.d[i] - k7.d[i]));
    check('7 In Loopwerk geöffnet: Kit + Instrument da, Render gleich (< 1e-4), nicht still', diff < 1e-4 && lw.kits === 1 && k7.peak > 0.1, `Abweichung ${diff}, Spitze ${k7.peak.toFixed(2)}`);

    check('Keine Konsolenfehler', !app.errors.length && !kwErr.length, [...app.errors, ...kwErr].join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await kw.close();
    await app.close();
    finish();
  }
})();
