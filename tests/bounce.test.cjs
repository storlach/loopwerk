// Krachwerk Scheibe 3d „Festhalten“ (Spec docs/specs/krachwerk-3-takes-festhalten.md §3 und §7, ADR 011): clip.mute,
// planBounce/foldTail/headroom (Node), renderView mit onlyClips/dry, store.bounce als ein Rückgängig-Schritt, und dass
// Festhalten klanglich neutral ist, soweit die Kette linear ist (Offline-Render vorher/nachher, limiter: false).
// node tests/bounce.test.cjs [--shots]   (SHOT_DIR=… für die Bilder, z. B. docs/ux/krachwerk-3)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker, readSaved } = require('./harness.cjs');
const { countUi } = require('./count.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || os.tmpdir();
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1400, height: 820 } };

// Läuft im Browser: Testsignale, Messgrößen, Song-Aufbau
function helpers() {
  const { library, store, renderProject } = window.loopwerk;
  const M = window.__M;
  const sr = 44100;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }; };
  const frames = (beats, bpm = 90) => Math.round(beats * 60 / bpm * sr);
  const buf = (n, fill) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(b.getChannelData(c), c);
    return b;
  };
  // Ton über 4 Schläge (90 BPM), weiche Ränder (5 ms), damit kein Clip-Rand klickt
  const tone = (hz, amp = 0.4, beats = 4) => buf(frames(beats), (d) => {
    const e = Math.round(0.005 * sr);
    for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr) * Math.min(1, i / e, (d.length - 1 - i) / e);
  });
  // Rauschstöße auf jedem Schlag (fester Seed), abklingend
  const bursts = (seed = 3, beats = 4) => buf(frames(beats), (d, c) => {
    const r = rng(seed + c);
    const step = frames(1);
    for (let i = 0; i < d.length; i++) d[i] = 0.6 * r() * Math.exp(-(i % step) / (0.04 * sr));
  });
  const noise = (seed = 9, beats = 4) => buf(frames(beats), (d, c) => { const r = rng(seed + c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * r(); });
  const sound = async (id, orig, name = id) => {
    library.remove?.(id);
    return library.add({ id, name, category: 'own', kind: 'loop', beats: 4, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig, duration: orig.duration });
  };
  // Song: Spuren mit Clips { t, id, at, len }, Loop [a, b)
  const song = async ({ tracks = 2, clips = [], loop = null, setup = null }) => {
    const p = M.createEmptyProject({ tracks, bpm: 90 });
    p.lengthBars = 8;
    for (const t of p.tracks) t.volume = 1;
    let n = 0;
    for (const c of clips) p.tracks[c.t].clips.push({ id: c.cid ?? 'c' + (++n + 100), sampleId: c.id, startBeat: c.at, lengthBeats: c.len ?? 4, offsetBeats: c.off ?? 0 });
    if (loop) p.loop = { on: true, startBeat: loop[0], endBeat: loop[1] };
    setup?.(p);
    window.loopwerk.ui.select(null);
    store.replace(p);
    await library.ensureProject(store.project);
    await library.applyRecipes?.(store.project);
  };
  const render = async (opts = {}) => {
    const b = await renderProject(store.project, library, { limiter: false, sampleRate: sr, ...opts });
    return [b.getChannelData(0).slice(), b.getChannelData(1).slice()];
  };
  const rms = (d, a = 0, z = d.length) => { let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, z - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  const peak = (chs) => Math.max(...chs.map((d) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  // Abweichung zweier Renderings in [a, z): RMS relativ zum Signal (dB) und größte Abweichung; guard = [[a, z], …] ausgenommen
  const diff = (x, y, a = 0, z = Math.min(x.length, y.length), guard = []) => {
    let e = 0, s = 0, max = 0;
    for (let i = a; i < z; i++) {
      if (guard.some(([g0, g1]) => i >= g0 && i < g1)) continue;
      const d = x[i] - y[i];
      e += d * d; s += x[i] * x[i];
      if (Math.abs(d) > max) max = Math.abs(d);
    }
    return { relDb: 10 * Math.log10((e + 1e-30) / (s + 1e-30)), max };
  };
  // Goertzel mit Hann-Fenster (wenig Leck zwischen nahen Tönen)
  const goertzel = (d, hz, a = 0, z = d.length) => {
    const w = 2 * Math.PI * hz / sr, k = 2 * Math.cos(w), n = z - a;
    let s1 = 0, s2 = 0;
    for (let i = a; i < z; i++) { const s0 = d[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - a) / (n - 1))) + k * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / (z - a);
  };
  // Energie über 2 kHz: Hochpass 2. Ordnung (RBJ, Q 0,707), dann RMS
  const highRms = (d) => {
    const w = 2 * Math.PI * 2000 / sr, al = Math.sin(w) / (2 * 0.7071), cw = Math.cos(w);
    const a0 = 1 + al, b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, e = 0;
    for (let i = 0; i < d.length; i++) { const y = b0 * d[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = d[i]; y2 = y1; y1 = y; e += y * y; }
    return Math.sqrt(e / d.length);
  };
  const hash = (d) => { let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + Math.round(d[i] * 1e7)) | 0; return h; };
  const chs = (s) => Array.from({ length: s.orig.numberOfChannels }, (_, c) => s.orig.getChannelData(c));
  window.T = { sr, frames, tone, bursts, noise, sound, song, render, rms, db, peak, diff, goertzel, highRms, hash, chs };
}

async function openKw(context, base) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/werkstatt/`);
  await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
  await page.evaluate(async () => { window.__M = await import('./src/model.js'); });
  await page.evaluate(helpers);
  return { page, errors };
}

(async () => {
  // ---------- Node: Modell und reine Teile ----------
  let M = null, B = null;
  try { M = await import('../src/model.js'); B = await import('../src/bounce.js'); } catch (err) { check('src/model.js und src/bounce.js laden in Node', false, err.message); }
  if (M && B) {
    const proj = () => {
      const p = M.createEmptyProject({ tracks: 3, bpm: 90 });
      p.loop = { on: true, startBeat: 4, endBeat: 8 };
      p.tracks[0].clips.push({ id: 'c1', sampleId: 'own-a', startBeat: 0, lengthBeats: 12, offsetBeats: 0, fadeInBeats: 1 });
      p.tracks[1].clips.push({ id: 'c2', sampleId: 'own-b', startBeat: 4, lengthBeats: 4, offsetBeats: 0 });
      p.tracks[2].mute = true;
      p.tracks[2].clips.push({ id: 'c3', sampleId: 'own-b', startBeat: 4, lengthBeats: 4, offsetBeats: 0 });
      return p;
    };
    const opts = { sampleBeats: () => 4, sampleName: (id) => (id === 'own-x' ? 'Festgehalten 1' : id) };

    // Stumm im Modell
    const t = { clips: [{ id: 'lo', startBeat: 0, lengthBeats: 8 }, { id: 'hi', startBeat: 2, lengthBeats: 4, z: 1, mute: true }] };
    const ar = M.audibleRanges(t);
    check('N1 audibleRanges: stummer Clip klingt nicht und verdeckt nicht', JSON.stringify(ar.get('hi')) === '[]' && JSON.stringify(ar.get('lo')) === '[[0,8]]', JSON.stringify([...ar]));
    const sigA = M.clipSignature('t1', { id: 'x', sampleId: 's', startBeat: 0, lengthBeats: 4 });
    const sigB = M.clipSignature('t1', { id: 'x', sampleId: 's', startBeat: 0, lengthBeats: 4, mute: true });
    const nc = M.normalizeClip({ id: 'x', sampleId: 's', startBeat: 0, lengthBeats: 4, mute: false });
    const nm = M.normalizeClip({ id: 'x', sampleId: 's', startBeat: 0, lengthBeats: 4, mute: 1 });
    check('N1 clipSignature enthält mute; normalizeClip: mute nur als true, sonst weg', sigA !== sigB && !('mute' in nc) && nm.mute === true, `${sigA} / ${sigB}`);

    // Plan
    const p0 = proj();
    const plan = B.planBounce(p0, { scope: 'loop' });
    check('N2 planBounce Loop: Bereich 4–8, ohne Master, gefaltet, Quellen nur hörbare Spuren (stumme Spur bleibt)',
      plan.fromBeat === 4 && plan.toBeat === 8 && plan.opts.master === false && plan.fold && JSON.stringify(plan.sources) === '["c1","c2"]' && plan.belowTrackId === 't2' && plan.mode === 'replace',
      JSON.stringify(plan));
    p0.tracks[0].fx = { hall: { on: true, size: 0.5, mix: 0.3 } };
    const ph = B.planBounce(p0, { scope: 'loop' });
    check('N2 Ausklang aus den Ketten: ohne Effekte 0,01 s, mit Hall ≥ 2,3 s', plan.opts.tailSeconds === 0.01 && ph.opts.tailSeconds >= 2.3, `${plan.opts.tailSeconds} / ${ph.opts.tailSeconds}`);
    const pt = B.planBounce(proj(), { scope: 'track', trackId: 't1', withFx: false });
    check('N2 Spur ohne Effekte: oben auf derselben Spur, dry, nur die Spur', pt.mode === 'top' && pt.opts.dry && pt.opts.onlyTrack === 't1' && pt.trackId === 't1', JSON.stringify(pt.opts));
    const pnl = proj();
    pnl.loop.on = false;
    const ps = B.planBounce(pnl, { scope: 'track', trackId: 't1' });
    check('N2 Spur ohne Loop: belegte Strecke 0–12, nicht gefaltet', ps.fromBeat === 0 && ps.toBeat === 12 && !ps.fold, JSON.stringify([ps.fromBeat, ps.toBeat, ps.fold]));
    check('N2 Abbruch: nichts klingt, kein Loop, über 480 s',
      /klingt nichts/.test(B.planBounce(proj(), { scope: 'loop', fromBeat: 20, toBeat: 24 }).error || '') && /Loop/.test(B.planBounce(pnl, { scope: 'loop' }).error || '')
      && /Minuten/.test(B.planBounce(proj(), { scope: 'loop', fromBeat: 0, toBeat: 800 }).error || ''));
    const pm = B.planBounce(proj(), { scope: 'loop', missing: (id) => id === 'own-b' });
    check('N2 Clip ohne Sound bleibt still und unverändert (keine Quelle, gezählt)', pm.missing === 1 && JSON.stringify(pm.sources) === '["c1"]', JSON.stringify(pm));

    // Falten, Abschneiden, Kopfraum
    const f = B.foldTail([Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8])], 4, { lead: 1 });
    check('N3 foldTail: Vorlauf ans Ende, Ausklang an den Anfang (modulo N)', JSON.stringify([...f[0]]) === '[8,10,12,6]', JSON.stringify([...f[0]]));
    const ct = B.cutTail([new Float32Array(2000).fill(1)], 1000, 44100);
    check('N3 cutTail: genau N Frames, letzte 10 ms blenden auf 0', ct[0].length === 1000 && ct[0][999] === 0 && ct[0][0] === 1 && Math.abs(ct[0][999 - 220] - 0.5) < 0.01, `${ct[0][999 - 220]}`);
    const hr = B.headroom([Float32Array.from([1.6, -0.4])]);
    check('N3 headroom: Spitze 1,6 → 0,98, gain gleicht aus', Math.abs(hr.chs[0][0] - 0.98) < 1e-6 && Math.abs(hr.gain - 1.6 / 0.98) < 1e-6 && B.headroom([Float32Array.from([0.5])]).gain === 1, JSON.stringify(hr.gain));

    // Store: ersetzen und Rückgängig
    const s = new M.Store(proj(), opts);
    const before = JSON.stringify(s.project);
    const pl = B.planBounce(s.project, { scope: 'loop' });
    const r = s.bounce({ sampleId: 'own-x', fromBeat: 4, toBeat: 8, sources: pl.sources, mode: pl.mode, gain: 1.5, belowTrackId: pl.belowTrackId });
    const c1 = s.project.tracks[0].clips;
    const nt = s.project.tracks[2];
    check('N4 bounce replace: Quellen an 4 und 8 geteilt, innen stumm, außen hörbar, Einblendung vorn bleibt',
      c1.length === 3 && c1.map((c) => `${c.startBeat}+${c.lengthBeats}${c.mute ? 'M' : ''}`).join(' ') === '0+4 4+4M 8+4' && c1[0].fadeInBeats === 1 && s.project.tracks[1].clips[0].mute === true,
      c1.map((c) => `${c.startBeat}+${c.lengthBeats}${c.mute ? 'M' : ''}`).join(' '));
    check('N4 neue Spur direkt unter der untersten Quellspur: Lautstärke 1, Mitte, ohne Effekte, Clip mit gain, Name wie der Sound',
      r && nt.id === r.trackId && nt.volume === 1 && nt.pan === 0 && !nt.fx && !nt.sends && nt.clips[0].gain === 1.5 && nt.clips[0].startBeat === 4 && nt.name === 'Festgehalten 1' && s.project.tracks[3].id === 't3',
      JSON.stringify(nt));
    check('N4 ein Rückgängig-Schritt, ↶ stellt das Projekt exakt her', s.undoStack.length === 1 && (s.undo(), JSON.stringify(s.project) === before), `${s.undoStack.length}`);
    const s2 = new M.Store(proj(), opts);
    const r2 = s2.bounce({ sampleId: 'own-x', fromBeat: 4, toBeat: 8, mode: 'top', trackId: 't2' });
    const top = s2.project.tracks[1].clips.find((c) => c.id === r2.clipId);
    check('N4 bounce top: oben auf derselben Spur, keine neue Spur, nichts stumm', s2.project.tracks.length === 3 && top.z > 0 && !s2.project.tracks.some((t2) => t2.clips.some((c) => c.mute)), JSON.stringify(s2.project.tracks[1].clips));
    const s3 = new M.Store(proj(), opts);
    s3.setClipMute(['c2'], true);
    const u3 = s3.undoStack.length;
    s3.setClipMute(['c2'], false);
    check('N5 setClipMute: je ein Rückgängig-Schritt, aus = Feld weg', u3 === 1 && s3.undoStack.length === 2 && !('mute' in s3.project.tracks[1].clips[0]));
    // Auswahl: was ein gewählter Clip verdeckt, wird in dessen Fenster mit stumm
    const p4 = M.createEmptyProject({ tracks: 1, bpm: 90 });
    p4.tracks[0].clips.push({ id: 'u', sampleId: 'own-a', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }, { id: 's1', sampleId: 'own-b', startBeat: 4, lengthBeats: 4, offsetBeats: 0, z: 1 }, { id: 's2', sampleId: 'own-b', startBeat: 12, lengthBeats: 2, offsetBeats: 0, z: 1 });
    const p4p = B.planBounce(p4, { scope: 'selection', clipIds: ['s1', 's2'] });
    const s4 = new M.Store(p4, opts);
    s4.bounce({ sampleId: 'own-x', fromBeat: p4p.fromBeat, toBeat: p4p.toBeat, sources: p4p.sources, mode: p4p.mode, belowTrackId: p4p.belowTrackId });
    const heard = M.audibleRanges(s4.project.tracks[0]);
    const uParts = s4.project.tracks[0].clips.filter((c) => c.sampleId === 'own-a').map((c) => `${c.startBeat}+${c.lengthBeats}${c.mute ? 'M' : ''}`).join(' ');
    check('N6 Auswahl: verdeckter Clip darunter wird nur unter den gewählten stumm (nichts kommt hervor, Rest bleibt)',
      uParts === '0+4 4+4M 8+4 12+2M 14+2' && p4p.fromBeat === 4 && p4p.toBeat === 14 && !p4p.fold, `${uParts} · ${JSON.stringify([...heard])}`);
  }

  // ---------- Browser ----------
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext(DESK);
    const { page, errors } = await openKw(ctx, base);

    // 1, 2, 5: Länge, Null-Test trocken, Rückgängig
    const r1 = await page.evaluate(async () => {
      const T = window.T;
      const { store, library, bounce } = window.loopwerk;
      await T.sound('own-t440', T.tone(440), 'Ton 440');
      await T.sound('own-t550', T.tone(550, 0.3), 'Ton 550');
      await T.sound('own-t330', T.tone(330), 'Ton 330');
      await T.song({ tracks: 2, loop: [4, 8], clips: [{ t: 0, id: 'own-t330', at: 0 }, { t: 0, id: 'own-t440', at: 4 }, { t: 1, id: 'own-t550', at: 4 }, { t: 0, id: 'own-t330', at: 8 }] });
      const pre = await T.render({ toBeat: 16 });
      const json = JSON.stringify(store.project);
      const undo0 = store.undoStack.length;
      const res = await bounce.run({ scope: 'loop' });
      const s = library.get(res.sampleId);
      const post = await T.render({ toBeat: 16 });
      const a = T.frames(4), z = T.frames(8);
      const inR = [0, 1].map((c) => T.diff(pre[c], post[c], a, z));
      const outR = [0, 1].map((c) => Math.max(T.diff(pre[c], post[c], 0, a).max, T.diff(pre[c], post[c], z).max));
      const tracks = store.project.tracks.map((t) => ({ id: t.id, name: t.name, vol: t.volume, clips: t.clips.map((c) => ({ id: c.id, at: c.startBeat, len: c.lengthBeats, mute: !!c.mute, gain: c.gain })) }));
      const sel = window.loopwerk.ui.selectedClipId;
      const undo1 = store.undoStack.length;
      store.undo();
      const back = JSON.stringify(store.project) === json;
      return {
        len: s.orig.length, want: Math.round(4 * 60 / 90 * s.orig.sampleRate), kind: s.kind, beats: s.beats, from: s.made?.from, bounceOf: s.made?.bounceOf, source: s.source, name: s.name,
        inDb: Math.max(...inR.map((x) => x.relDb)), outMax: Math.max(...outR), prePeak: T.peak(pre), tracks, sel, newClip: res.clipId, undo: undo1 - undo0, back, still: !!library.get(res.sampleId),
      };
    });
    check('1 Länge: Loop [4, 8) bei 90 BPM → genau round(4 · 60/90 · sr) Frames, kind loop, beats 4, Herkunft bounce',
      r1.len === r1.want && r1.kind === 'loop' && r1.beats === 4 && r1.from === 'bounce' && r1.source === 'Festgehalten: Takt 2' && r1.name === 'Festgehalten 1',
      `${r1.len} / ${r1.want}, ${r1.kind}, ${r1.beats}, ${r1.from}, ${r1.source}`);
    check('1 Stammbaum: bounceOf = Wurzeln der Quellen', JSON.stringify(r1.bounceOf) === '["own-t440","own-t550"]', JSON.stringify(r1.bounceOf));
    const nt1 = r1.tracks[2];
    check('1 neue Spur „Festgehalten 1“ unter der untersten Quellspur, Clip über dem Bereich gewählt, Quellen stumm',
      r1.tracks.length === 3 && nt1.name === 'Festgehalten 1' && nt1.vol === 1 && nt1.clips[0].at === 4 && nt1.clips[0].id === r1.newClip && r1.sel === r1.newClip
      && r1.tracks[0].clips.filter((c) => c.mute).length === 1 && r1.tracks[1].clips[0].mute, JSON.stringify(r1.tracks));
    check('2 Null-Test trocken: Song vorher/nachher ≤ −90 dB im Bereich, außerhalb exakt 0', r1.inDb <= -90 && r1.outMax === 0 && r1.prePeak > 0.3, `im Bereich ${r1.inDb.toFixed(1)} dB, außerhalb max ${r1.outMax}, Spitze ${r1.prePeak.toFixed(2)}`);
    check('5 Rückgängig: ein Schritt, ↶ → Projekt-JSON wie vorher, der Sound bleibt in der Kiste', r1.undo === 1 && r1.back && r1.still, `${r1.undo}, ${r1.back}, ${r1.still}`);

    // 2b: Clip über die Bereichsgrenzen (wird geteilt) – Abweichung nur in der Überblendung an den Grenzen (± 3 ms)
    const r2 = await page.evaluate(async () => {
      const T = window.T;
      const { store, bounce } = window.loopwerk;
      await T.sound('own-t220', T.tone(220, 0.4, 12), 'Ton 220');
      await T.song({ tracks: 2, loop: [4, 8], clips: [{ t: 0, id: 'own-t220', at: 2, len: 10 }, { t: 1, id: 'own-t550', at: 4 }] });
      const pre = await T.render({ toBeat: 16 });
      const res = await bounce.run({ scope: 'loop' });
      const post = await T.render({ toBeat: 16 });
      const a = T.frames(4), z = T.frames(8), g = Math.round(0.003 * T.sr);
      const guard = [[a - g, a + g], [z - g, z + g]];
      const inR = T.diff(pre[0], post[0], a, z, guard);
      const outMax = Math.max(T.diff(pre[0], post[0], 0, a, guard).max, T.diff(pre[0], post[0], z, pre[0].length, guard).max);
      const seam = Math.max(T.diff(pre[0], post[0], a - g, a + g).max, T.diff(pre[0], post[0], z - g, z + g).max);
      const parts = store.project.tracks[0].clips.map((c) => `${c.startBeat}+${c.lengthBeats}${c.mute ? 'M' : ''}`).join(' ');
      return { ok: !!res?.clipId, inDb: inR.relDb, outMax, seam, parts };
    });
    check('2b Quelle über die Grenzen: geteilt 2+2 · 4+4 stumm · 8+4; außerhalb ± 3 ms um die Grenzen ≤ −90 dB bzw. 0',
      r2.ok && r2.parts === '2+2 4+4M 8+4' && r2.inDb <= -90 && r2.outMax < 1e-6, `${r2.parts}, im Bereich ${r2.inDb.toFixed(1)} dB, außerhalb max ${r2.outMax.toExponential(1)}, an den Nähten max ${r2.seam.toFixed(3)} (Loop-Überblendung, Ohr-Test)`);

    // 3: Faltung mit Hall (Spur-Hall und Hall-Bus): Durchgang [8, 12) des Originals gegen den festgehaltenen Sound
    const r3 = await page.evaluate(async () => {
      const T = window.T;
      const { library, bounce } = window.loopwerk;
      await T.sound('own-bursts', T.bursts(3), 'Klopfen');
      await T.song({
        // Der Loop [4, 8) liegt auch davor und dahinter: [8, 12) klingt wie der Loop im eingeschwungenen Zustand
        tracks: 1, loop: [4, 8], clips: [{ t: 0, id: 'own-bursts', at: 0 }, { t: 0, id: 'own-bursts', at: 4 }, { t: 0, id: 'own-bursts', at: 8 }],
        setup: (p) => { p.tracks[0].fx = { hall: { on: true, size: 0.8, mix: 0.6 } }; p.tracks[0].sends = { hall: 0.7 }; },
      });
      const all = await T.render({ toBeat: 12, master: false });
      const N = T.frames(4);
      const ref = [0, 1].map((c) => all[c].subarray(T.frames(8), T.frames(8) + N));
      const first = await T.render({ fromBeat: 4, toBeat: 8, master: false });
      const plain = [0, 1].map((c) => first[c].subarray(0, N)); // ohne Faltung: der Durchgang ohne Fahnen davor
      const res = await bounce.run({ scope: 'loop', kiste: true });
      const s = library.get(res.sampleId);
      const got = T.chs(s);
      const folded = Math.max(...[0, 1].map((c) => T.diff(ref[c], got[c]).relDb));
      const unfolded = Math.max(...[0, 1].map((c) => T.diff(ref[c], plain[c]).relDb));
      return { folded, unfolded, len: got[0].length, N, tail: res.plan.opts.tailSeconds };
    });
    check('3 Faltung mit Hall: festgehaltener Sound = Durchgang [8, 12) des Originals, RMS-Abweichung ≤ −60 dB', r3.folded <= -60 && r3.len === r3.N, `${r3.folded.toFixed(1)} dB, Ausklang ${r3.tail.toFixed(2)} s`);
    check('3 Gegenprobe: ohne Faltung wäre die Abweichung ≥ −30 dB', r3.unfolded >= -30, `${r3.unfolded.toFixed(1)} dB`);

    // 4: Kopfraum
    const r4 = await page.evaluate(async () => {
      const T = window.T;
      const { store, library, bounce } = window.loopwerk;
      await T.sound('own-s1', T.tone(220, 0.8), 'Sinus A');
      await T.sound('own-s2', T.tone(220, 0.8), 'Sinus B');
      await T.song({ tracks: 2, loop: [4, 8], clips: [{ t: 0, id: 'own-s1', at: 4 }, { t: 1, id: 'own-s2', at: 4 }] });
      const pre = await T.render({ toBeat: 12 });
      const res = await bounce.run({ scope: 'loop' });
      const s = library.get(res.sampleId);
      const post = await T.render({ toBeat: 12 });
      const a = T.frames(4), z = T.frames(8);
      const clip = store.findClip(res.clipId).clip;
      return { peak: T.peak(T.chs(s)), gain: clip.gain, lvl: T.db(T.rms(post[0], a, z)) - T.db(T.rms(pre[0], a, z)), d: T.diff(pre[0], post[0], a, z).relDb };
    });
    check('4 Kopfraum: zwei Sinus 0,8 gleichphasig → Sound-Spitze ≤ 0,98, Clip-gain gleicht aus, Song ± 0,1 dB gleich',
      r4.peak <= 0.98 + 1e-6 && Math.abs(r4.gain - 1.6 / 0.98) < 0.01 && Math.abs(r4.lvl) <= 0.1 && r4.d <= -90, `Spitze ${r4.peak.toFixed(4)}, gain ${r4.gain.toFixed(3)}, Pegel ${r4.lvl.toFixed(3)} dB, Abweichung ${r4.d.toFixed(1)} dB`);

    // 7: Spur ohne Effekte (Zusammenfassen) bei aktivem Spur-EQ und Hall-Send
    const r7 = await page.evaluate(async () => {
      const T = window.T;
      const { store, bounce } = window.loopwerk;
      await T.song({
        tracks: 2, loop: [4, 8], clips: [{ t: 0, id: 'own-t440', at: 4 }, { t: 0, id: 'own-t330', at: 0 }, { t: 1, id: 'own-t550', at: 4 }],
        setup: (p) => { p.tracks[0].fx = { eq: { on: true, low: 6, mid: -4, high: 3 } }; p.tracks[0].sends = { hall: 0.3 }; p.tracks[0].volume = 0.7; p.tracks[0].pan = -0.4; },
      });
      const pre = await T.render({ toBeat: 16 });
      const n0 = store.project.tracks.length;
      const res = await bounce.run({ scope: 'track', trackId: 't1', withFx: false });
      const post = await T.render({ toBeat: 16 });
      const t1 = store.project.tracks[0];
      const c = t1.clips.find((x) => x.id === res.clipId);
      const maxZ = Math.max(...t1.clips.filter((x) => x !== c).map((x) => x.z ?? 0));
      return {
        same: store.project.tracks.length === n0, onTop: !!c && (c.z ?? 0) > maxZ, muted: store.project.tracks.some((t) => t.clips.some((x) => x.mute)),
        d: Math.max(...[0, 1].map((ch) => T.diff(pre[ch], post[ch]).relDb)), mode: res.plan.mode, dry: res.plan.opts.dry,
      };
    });
    check('7 Spur ohne Effekte: Ergebnis oben auf derselben Spur, keine neue Spur, nichts stumm', r7.same && r7.onTop && !r7.muted && r7.mode === 'top' && r7.dry, JSON.stringify(r7));
    check('7 Render vorher/nachher ≤ −90 dB bei aktivem Spur-EQ (Effekte wirken live weiter)', r7.d <= -90, `${r7.d.toFixed(1)} dB`);

    // 8: Auswahl – der dritte Clip fehlt im Sound
    const r8 = await page.evaluate(async () => {
      const T = window.T;
      const { store, library, bounce } = window.loopwerk;
      await T.sound('own-t660', T.tone(660), 'Ton 660');
      await T.song({ tracks: 1, clips: [{ t: 0, id: 'own-t440', at: 0, cid: 'a1' }, { t: 0, id: 'own-t660', at: 4, cid: 'a2' }, { t: 0, id: 'own-t550', at: 8, cid: 'a3' }] });
      const pre = await T.render({ toBeat: 16 });
      const res = await bounce.run({ scope: 'selection', clipIds: ['a1', 'a3'] });
      const d = T.chs(library.get(res.sampleId))[0];
      const post = await T.render({ toBeat: 16 });
      const g = (hz) => T.db(T.goertzel(d, hz));
      const mutes = Object.fromEntries(store.project.tracks[0].clips.map((c) => [c.id, !!c.mute]));
      return { g440: g(440), g550: g(550), g660: g(660), len: d.length, want: T.frames(12), mutes, fold: res.plan.fold, d: T.diff(pre[0], post[0], 0, T.frames(12) - Math.round(0.011 * T.sr)).relDb };
    });
    check('8 Auswahl: 2 von 3 Clips → 660 Hz fehlt im Sound (≥ 60 dB unter 440/550), 12 Schläge, nicht gefaltet',
      r8.g440 - r8.g660 >= 60 && r8.g550 - r8.g660 >= 60 && r8.len === r8.want && !r8.fold, `440 ${r8.g440.toFixed(1)}, 550 ${r8.g550.toFixed(1)}, 660 ${r8.g660.toFixed(1)} dB, ${r8.len}/${r8.want}`);
    check('8 Gewählte stumm, der dritte bleibt hörbar; Song bis 10 ms vor dem Ende gleich (≤ −90 dB)', r8.mutes.a1 && r8.mutes.a3 && !r8.mutes.a2 && r8.d <= -90, `${JSON.stringify(r8.mutes)}, ${r8.d.toFixed(1)} dB`);

    // 9: Eingefroren – Rezept der Quelle ist eingebacken, spätere Änderung ändert den Sound nicht
    const r9 = await page.evaluate(async () => {
      const T = window.T;
      const { store, library, bounce } = window.loopwerk;
      const raw = T.noise(9);
      await T.sound('own-noise', raw, 'Rauschen');
      await T.song({ tracks: 1, loop: [4, 8], clips: [{ t: 0, id: 'own-noise', at: 4 }] });
      store.setRecipe('own-noise', { lp: 300 });
      await library.applyRecipes(store.project);
      const res = await bounce.run({ scope: 'loop' });
      const s = library.get(res.sampleId);
      const d = T.chs(s)[0];
      const h0 = T.hash(d);
      const high = T.db(T.highRms(d)) - T.db(T.highRms(raw.getChannelData(0)));
      store.setRecipe('own-noise', { lp: null });
      await library.applyRecipes(store.project);
      const s2 = library.get(res.sampleId);
      return { high, same: T.hash(T.chs(s2)[0]) === h0 && s2.orig === s.orig, recipe: store.project.recipes?.['own-noise'] ?? null, own: !store.project.recipes?.[res.sampleId] };
    });
    check('9 Eingefroren: Quelle mit lp 300 → Band über 2 kHz im Sound ≥ 20 dB leiser', r9.high <= -20, `${r9.high.toFixed(1)} dB`);
    check('9 Rezept der Quelle zurückgesetzt → festgehaltener Sound bitgleich, er hat kein eigenes Rezept', r9.same && r9.own, JSON.stringify(r9));

    // 6: Stumm – verdeckt nicht (Render), keine Stimme in der Wiedergabe, Schraffur, „Stumm aus“ ein Rückgängig-Schritt
    const r6 = await page.evaluate(async () => {
      const T = window.T;
      const { store, engine, bounce } = window.loopwerk;
      void bounce;
      await T.song({ tracks: 1, clips: [{ t: 0, id: 'own-t440', at: 0, cid: 'lo', len: 8 }, { t: 0, id: 'own-t660', at: 2, cid: 'hi' }] });
      store.project.tracks[0].clips[1].z = 1;
      const top = await T.render({ toBeat: 8 });
      store.setClipMute(['hi'], true);
      const mute = await T.render({ toBeat: 8 });
      const a = T.frames(2.5), z = T.frames(5.5);
      const g = (d, hz) => T.db(T.goertzel(d, hz, a, z));
      await engine.play(3);
      await new Promise((r) => setTimeout(r, 400));
      const voices = [...engine.voices].map((v) => v.clipId);
      engine.stop();
      return { top660: g(top[0], 660), top440: g(top[0], 440), mute660: g(mute[0], 660), mute440: g(mute[0], 440), voices };
    });
    check('6 Stummer Clip oben verdeckt den unteren nicht (Render: 440 Hz klingt, 660 Hz ≥ 60 dB leiser)',
      r6.top660 - r6.top440 > 40 && r6.mute440 - r6.mute660 >= 60, `oben: 660 ${r6.top660.toFixed(1)} / 440 ${r6.top440.toFixed(1)} · stumm: 440 ${r6.mute440.toFixed(1)} / 660 ${r6.mute660.toFixed(1)} dB`);
    check('6 Wiedergabe plant für den stummen Clip keine Stimme, für den unteren schon', r6.voices.includes('lo') && !r6.voices.includes('hi'), JSON.stringify(r6.voices));
    await page.evaluate(() => { window.loopwerk.ui.select('hi'); window.loopwerk.arranger.revealClip?.('hi'); });
    await page.waitForTimeout(400);
    const r6b = await page.evaluate(() => {
      const n = document.querySelector('.clip[data-clip-id="hi"]');
      const btn = document.getElementById('cf-unmute');
      return { cls: n?.classList.contains('muted'), bg: n ? getComputedStyle(n).backgroundImage : '', btn: !!btn && !btn.hidden && !!btn.offsetParent, undo: window.loopwerk.store.undoStack.length };
    });
    check('6 Schraffur am stummen Clip, Werkzeug zeigt „Stumm aus“', r6b.cls && /repeating-linear-gradient/.test(r6b.bg) && r6b.btn, JSON.stringify(r6b));
    if (r6b.btn) await page.click('#cf-unmute');
    const r6c = await page.evaluate(() => ({ mute: window.loopwerk.store.findClip('hi').clip.mute, undo: window.loopwerk.store.undoStack.length }));
    check('6 „Stumm aus“ ist ein Rückgängig-Schritt', r6c.mute === undefined && r6c.undo === r6b.undo + 1, JSON.stringify(r6c));

    // Projektdatei: stumm und Herkunft gehen mit; Loopwerk öffnet die Song-ZIP und klingt gleich
    const rf = await page.evaluate(async () => {
      const T = window.T;
      const { store, bounce } = window.loopwerk;
      await T.song({ tracks: 2, loop: [4, 8], clips: [{ t: 0, id: 'own-t440', at: 4 }, { t: 1, id: 'own-t550', at: 4 }, { t: 0, id: 'own-t330', at: 8 }] });
      store.setProjectName('Festhalten-Datei');
      const res = await bounce.run({ scope: 'loop' });
      const d = await T.render({ toBeat: 16 });
      return { id: res.sampleId, d: Array.from(d[0]) };
    });
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-festhalten.zip');
    await download.saveAs(saved);
    const json = readSaved(saved);
    const mutedInFile = json.tracks.flatMap((t) => t.clips).filter((c) => c.mute === true).length;
    const meta = json.ownSounds?.find((e) => e.id === rf.id);
    check('Datei: stumme Quellen (mute: true) und der festgehaltene Sound mit from bounce und bounceOf', mutedInFile === 2 && meta?.from === 'bounce' && JSON.stringify(meta?.bounceOf) === '["own-t440","own-t550"]', `${mutedInFile}, ${JSON.stringify(meta && { from: meta.from, bounceOf: meta.bounceOf })}`);
    const lw = await ctx.newPage();
    const lwErr = [];
    lw.on('pageerror', (e) => lwErr.push(e.message));
    await lw.goto(`${base}/`);
    await lw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await lw.setInputFiles('#open-input', saved);
    await lw.waitForFunction(() => window.loopwerk.store.project.name === 'Festhalten-Datei', null, { timeout: 15000 });
    const lr = await lw.evaluate(async () => {
      const { store, library, renderProject } = window.loopwerk;
      await library.ensureProject(store.project);
      const d = (await renderProject(store.project, library, { limiter: false, sampleRate: 44100, toBeat: 16 })).getChannelData(0);
      return { d: Array.from(d), btn: !!document.getElementById('bounce-btn'), card: !!document.querySelector('.ccard[data-create="bounce"]'), cf: !!document.getElementById('cf-bounce') };
    });
    let dmax = lr.d.length === rf.d.length ? 0 : Infinity;
    for (let i = 0; i < rf.d.length && dmax < Infinity; i++) dmax = Math.max(dmax, Math.abs(lr.d[i] - rf.d[i]));
    check('Loopwerk öffnet die Song-ZIP: stumme Quellen bleiben stumm, Render gleich Krachwerk (< 1e-4, 16 Bit)', dmax < 1e-4, `Abweichung ${dmax}`);
    check('Loopwerk zeigt kein Festhalten (Etikett, Karte, Werkzeug)', !lr.btn && !lr.card && !lr.cf, JSON.stringify({ btn: lr.btn, card: lr.card, cf: lr.cf }));
    await lw.close();

    check('Keine Konsolenfehler (Krachwerk, Loopwerk)', !errors.length && !lwErr.length, [...errors, ...lwErr].join(' | '));
    await ctx.close();

    // ---------- 10: Bedienung Desktop und Handy ----------
    for (const [dev, opts] of [['desktop', DESK], ['handy', PHONE]]) {
      const c = await browser.newContext(opts);
      const { page: pg, errors: err } = await openKw(c, base);
      await pg.evaluate(async () => {
        const T = window.T;
        const { own, store } = window.loopwerk;
        const a = await own.create({ name: 'Bumm 1', buffer: T.bursts(5), kind: 'loop', beats: 4, from: 'mic' });
        const b = await own.create({ name: 'Summen 1', buffer: T.tone(330, 0.3), kind: 'loop', beats: 4, from: 'mic' });
        const p = window.__M.createEmptyProject({ tracks: 2, bpm: 90 });
        p.tracks[0].clips.push({ id: 'c1', sampleId: a.id, startBeat: 0, lengthBeats: 4, offsetBeats: 0 });
        p.tracks[1].clips.push({ id: 'c2', sampleId: b.id, startBeat: 0, lengthBeats: 4, offsetBeats: 0 });
        p.tracks[0].fx = { hall: { on: true, size: 0.4, mix: 0.3 } };
        store.replace(p);
        window.loopwerk.ui.select(null);
      });
      await pg.waitForTimeout(700);
      const off = await countUi(pg);
      await pg.evaluate(() => window.loopwerk.store.setLoop({ on: true, startBeat: 0, endBeat: 4 }));
      await pg.waitForTimeout(500);
      const on = await countUi(pg);
      const tag = await pg.evaluate(() => {
        const b = document.getElementById('bounce-btn');
        const r = b?.getBoundingClientRect();
        const face = b?.querySelector('.bounce-face')?.getBoundingClientRect();
        const band = document.querySelector('.loop-band').getBoundingClientRect();
        const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const g = document.querySelector('.ph-grip').getBoundingClientRect();
        const gh = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2);
        return { shown: !!b && !b.hidden && !!b.offsetParent, w: r?.width, h: r?.height, label: b?.getAttribute('aria-label'), text: b?.textContent, inBand: face && face.right <= band.right + 1 && face.left >= band.left - 1, hit: !!hit && b.contains(hit), grip: !!gh?.closest('.ph-grip') };
      });
      check(`10 ${dev}: Loop an, nichts gewählt → „Festhalten“ im Loop-Band, Tippziel ≥ 44 px, der Griff der Marke bleibt greifbar`, tag.shown && tag.w >= 44 && tag.h >= 44 && tag.label === 'Festhalten' && tag.inBand && tag.hit && tag.grip, JSON.stringify(tag));
      check(`10 ${dev}: Zählbild Loop an ≤ +1 Bedienelement und ≤ +1 Rahmen gegenüber Start`, on.controls - off.controls <= 1 && on.frames - off.frames <= 1, `${off.controls}/${off.frames} → ${on.controls}/${on.frames}`);
      if (SHOTS) await pg.screenshot({ path: path.join(DIR, `kw-festhalten-loop-${dev}.png`) });
      const box = await pg.locator('#bounce-btn').boundingBox();
      if (dev === 'handy') await pg.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await pg.waitForFunction(() => window.loopwerk.store.project.tracks.length === 3 && window.loopwerk.bounce.progress == null, null, { timeout: 20000 });
      await pg.waitForTimeout(500);
      const after = await pg.evaluate(() => {
        const { store, ui } = window.loopwerk;
        const t = store.project.tracks;
        const b = document.getElementById('bounce-btn');
        return {
          names: t.map((x) => x.name), sel: ui.selectedClipId, clip: t[2].clips[0]?.id, muted: t.flatMap((x) => x.clips).filter((c) => c.mute).length,
          tagHidden: !b || b.hidden || !b.offsetParent, hatch: document.querySelectorAll('.clip.muted').length, hint: document.getElementById('hint-text')?.textContent,
          dock: ui.dock, head: document.getElementById('werkbank')?.classList.contains('is-head'), headH: Math.round(document.getElementById('werkbank')?.getBoundingClientRect().height ?? 0),
        };
      });
      check(`10 ${dev}: 1 Tipp → Spur „Festgehalten 1“ unter der untersten Quellspur, Clip gewählt, Quellen stumm und schraffiert`,
        after.names[2] === 'Festgehalten 1' && after.sel === after.clip && after.muted === 2 && after.hatch === 2 && /Festgehalten/.test(after.hint || ''), JSON.stringify(after));
      check(`10 ${dev}: mit Clipwahl ist das Etikett weg`, after.tagHidden);
      if (dev === 'handy') check('10 Handy: die Werkbank zeigt den neuen Clip als Kopfzeile (zu, 56 px)', after.dock === 'werkbank' && after.head && Math.abs(after.headH - 56) <= 4, `${after.dock}, Kopf ${after.head}, ${after.headH} px`);
      if (SHOTS) await pg.screenshot({ path: path.join(DIR, `kw-festhalten-${dev}.png`) });

      if (dev === 'desktop') {
        // Taste F (Loop) und Umschalt+F (nur Kiste)
        await pg.evaluate(() => window.loopwerk.ui.select(null));
        await pg.keyboard.press('f');
        await pg.waitForFunction(() => window.loopwerk.store.project.tracks.length === 4 && window.loopwerk.bounce.progress == null, null, { timeout: 20000 });
        const n4 = await pg.evaluate(() => ({ names: window.loopwerk.store.project.tracks.map((t) => t.name), undo: window.loopwerk.store.undoStack.length }));
        await pg.evaluate(() => window.loopwerk.ui.select(null));
        await pg.keyboard.press('Shift+F');
        await pg.waitForFunction(() => window.loopwerk.library.list().some((s) => s.name === 'Festgehalten 3') && window.loopwerk.bounce.progress == null, null, { timeout: 20000 });
        const k = await pg.evaluate(() => ({ tracks: window.loopwerk.store.project.tracks.length, undo: window.loopwerk.store.undoStack.length, hint: document.getElementById('hint-text')?.textContent }));
        check('10 Desktop: F hält den Loop fest (Festgehalten 2), Umschalt+F nur in die Kiste (Song unverändert)',
          n4.names[3] === 'Festgehalten 2' && k.tracks === 4 && k.undo === n4.undo && /Kiste/.test(k.hint || ''), `${JSON.stringify(n4.names)} · ${JSON.stringify(k)}`);
        // Werkzeug am Clip: „Festhalten“ erst ab 2 Clips
        await pg.evaluate(() => window.loopwerk.ui.select('c1'));
        await pg.waitForTimeout(300);
        const one = await pg.evaluate(() => { const b = document.getElementById('cf-bounce'); return !!b && !b.hidden && !!b.offsetParent; });
        await pg.evaluate(() => window.loopwerk.ui.selectMany(['c1', 'c2']));
        await pg.waitForTimeout(300);
        const two = await pg.evaluate(() => { const b = document.getElementById('cf-bounce'); return !!b && !b.hidden && !!b.offsetParent; });
        check('10 Desktop: Werkzeug am Clip zeigt „Festhalten“ erst ab 2 Clips', !one && two, `1 Clip: ${one}, 2 Clips: ${two}`);
        // Spur-Werkbank: Festhalten neben dem Namen, „mit Effekten“ in den Feinheiten (an)
        await pg.evaluate(() => window.loopwerk.ui.selectTrack('t1'));
        await pg.waitForTimeout(300);
        await pg.click('#insp-track-fine');
        const tw = await pg.evaluate(() => {
          const b = document.getElementById('insp-bounce');
          const fx = document.getElementById('insp-bounce-fx');
          const head = b?.closest('.insp-head')?.getBoundingClientRect();
          const r = b?.getBoundingClientRect();
          return { shown: !!b && !!b.offsetParent, inHead: !!head && r.top >= head.top - 1 && r.bottom <= head.bottom + 1, fx: fx?.getAttribute('aria-pressed'), fxShown: !!fx?.offsetParent, h: r?.height };
        });
        check('10 Desktop: Spur-Werkbank mit „Festhalten“ neben dem Namen, „mit Effekten“ an', tw.shown && tw.inHead && tw.fx === 'true' && tw.fxShown && tw.h >= 44, JSON.stringify(tw));
        if (SHOTS) await pg.screenshot({ path: path.join(DIR, 'kw-festhalten-spur-desktop.png') });
        const card = await pg.evaluate(() => !!document.querySelector('#create-panel .ccard[data-create="bounce"]'));
        check('10 Desktop: „+ Neu“ hat die Karte „Loop festhalten“ (Zwilling von Umschalt+F)', card);
      }
      check(`10 ${dev}: keine Konsolenfehler`, !err.length, err.join(' | '));
      await c.close();
    }
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
