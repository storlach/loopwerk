// Krachwerk Scheibe 2b, Modell und DSP (Spec docs/specs/krachwerk-2b-zerlegen.md §3–5, §8): Zerlegen an Anschlägen
// bzw. in gleiche Teile, Schnitte als Varianten mit Gruppe, „Auf die Spur“ klingt wie vorher, ein Undo-Schritt,
// Autotune als Rezeptschritt, Trennen als neue Sounds, Projektdatei, Kosten. Gemessen im Offline-Rendering.
// node tests/cuts.test.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Testklopfen: 10 s, 8 Schläge (gedämpfte Rauschstöße 30 ms, 0 … −18 dB, Abstände 0,6–1,8 s), Boden −50 dB
const HITS = [0.35, 1.25, 2.05, 3.7, 4.4, 5.6, 7.3, 8.2];
const LEVELS = [0, -3, -6, -9, -12, -15, -18, -4];

function helpers({ HITS, LEVELS }) {
  const sr = 44100;
  const { library } = window.loopwerk;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; }; };
  const buf = (seconds, fill) => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
    for (let c = 0; c < 2; c++) fill(b.getChannelData(c), c);
    return b;
  };
  // extra: weitere Schläge [{ t, db }]
  const knock = (extra = [], seed = 7) => buf(10, (d, c) => {
    const r = rng(seed + c * 101);
    for (let i = 0; i < d.length; i++) d[i] = 0.00316 * r();
    const hits = HITS.map((t, k) => ({ t, db: LEVELS[k] })).concat(extra);
    for (const h of hits) {
      const a = Math.round(h.t * sr);
      const g = 0.8 * Math.pow(10, h.db / 20);
      for (let i = 0; i < Math.round(0.03 * sr); i++) d[a + i] += g * r() * Math.exp(-i / (0.008 * sr));
    }
  });
  const sine = (seconds, hz, amp) => buf(seconds, (d) => { for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr); });
  const own = async (id, orig) => {
    library.remove(id);
    return library.add({ id, name: id, category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig, duration: orig.duration });
  };
  const M = window.__M;
  const store = (bars = 16) => {
    const p = M.createEmptyProject({ tracks: 2, bpm: 120 });
    p.lengthBars = bars;
    for (const t of p.tracks) t.volume = 1;
    p.master = { volume: 1 };
    return new M.Store(p, {
      sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4, sampleName: (id) => library.get(id)?.name,
      soundDuration: (id) => library.get(id)?.orig?.duration ?? library.get(id)?.duration ?? null,
    });
  };
  const render = async (s, toBeat) => (await window.loopwerk.renderProject(s.project, library, { limiter: false, toBeat })).getChannelData(0).slice();
  const rms = (d, a = 0, z = d.length) => { let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, z - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  // Differenz zweier Renderings: RMS relativ zum Signal (dB) und größte Abweichung außerhalb ±guard Frames um die Grenzen
  const compare = (x, y, bounds = [], guard = Math.round(0.003 * sr)) => {
    const n = Math.min(x.length, y.length);
    let e = 0, s = 0, max = 0, at = -1;
    const skip = new Uint8Array(n);
    for (const b of bounds) for (let i = Math.max(0, b - guard); i < Math.min(n, b + guard); i++) skip[i] = 1;
    for (let i = 0; i < n; i++) {
      const d = x[i] - y[i];
      e += d * d; s += x[i] * x[i];
      if (!skip[i] && Math.abs(d) > max) { max = Math.abs(d); at = i; }
    }
    return { relDb: 10 * Math.log10((e + 1e-30) / (s + 1e-30)), max, at, n, lenDiff: x.length - y.length };
  };
  const sum = (d) => { let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + Math.round(d[i] * 1e6)) | 0; return h; };
  const yin = async (d) => {
    const { detectPitch } = await import('./src/dsp/pitch.js');
    const r = detectPitch(d, sr);
    const f = [...r.f0].filter((v, i) => r.conf[i] > 0.9 && v > 0).sort((a, b) => a - b);
    return f.length ? f[f.length >> 1] : 0;
  };
  // Clip-Grenzen einer Spur in Frames (120 bpm: 22050 Frames je Schlag)
  const bounds = (s, spb = 0.5) => s.project.tracks.flatMap((t) => t.clips.flatMap((c) => [c.startBeat, c.startBeat + c.lengthBeats])).map((b) => Math.round(b * spb * sr));
  window.T = { HITS, sr, buf, knock, sine, own, store, render, rms, db, compare, sum, yin, bounds };
}

(async () => {
  // ---------- Node: reine Lage-Rechnung (src/cuts.js) ----------
  let C = null;
  try { C = await import('../src/cuts.js'); } catch (err) { check('src/cuts.js lädt in Node', false, err.message); }
  if (C) {
    const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
    const pc = C.planCuts([441, 44100, 88200], 44100, { start: 0, end: 3 });
    check('N1 planCuts: 3 Schnitte, erster ab Anfang, Grenzen 3 ms vor dem Anschlag, letzter bis Ende',
      pc.length === 3 && pc[0].start === 0 && near(pc[0].end, 0.997) && near(pc[1].start, 0.997) && near(pc[1].end, 1.997) && near(pc[2].start, 1.997) && pc[2].end === 3 && near(pc[1].onset, 1),
      JSON.stringify(pc));
    const pcw = C.planCuts([0, 22050], 44100, { start: 2, end: 4 });
    check('N1 planCuts im Fenster 2…4 s: Zeiten in Sekunden des Originals', pcw.length === 2 && pcw[0].start === 2 && near(pcw[1].start, 2.497) && pcw[1].end === 4, JSON.stringify(pcw));
    const ec = C.evenCuts(4, { start: 1, end: 3 });
    check('N2 evenCuts(4, 1…3 s): Grenzen 1 / 1,5 / 2 / 2,5 / 3', ec.length === 4 && [1, 1.5, 2, 2.5].every((v, i) => near(ec[i].start, v)) && ec[3].end === 3 && near(ec[0].end, 1.5), JSON.stringify(ec));
    const cuts = [{ start: 0, end: 1 }, { start: 1, end: 2.5 }, { start: 2.5, end: 4 }];
    const base = { duration: 4, sampleRate: 44100, beatsPerSecond: 2 };
    const one = (L) => L.map((c) => c.clips.map((p) => [Math.round(p.beat * 1e4) / 1e4, Math.round(p.len * 1e4) / 1e4, Math.round((p.offset || 0) * 1e4) / 1e4]));
    const l1 = one(C.layoutCuts(cuts, { ...base, recipe: {}, clip: { startBeat: 8, lengthBeats: 8, offsetBeats: 0 } }));
    check('N3 layoutCuts gerade: Beats 8 / 10 / 13, Längen 2 / 3 / 3', JSON.stringify(l1) === JSON.stringify([[[8, 2, 0]], [[10, 3, 0]], [[13, 3, 0]]]), JSON.stringify(l1));
    const l2 = one(C.layoutCuts(cuts, { ...base, recipe: { reverse: true }, clip: { startBeat: 8, lengthBeats: 8, offsetBeats: 0 } }));
    check('N3 layoutCuts rückwärts: Lage gespiegelt (Beats 14 / 11 / 8)', JSON.stringify(l2) === JSON.stringify([[[14, 2, 0]], [[11, 3, 0]], [[8, 3, 0]]]), JSON.stringify(l2));
    const l3 = one(C.layoutCuts(cuts, { ...base, recipe: { stretch: 1.5 }, clip: { startBeat: 0, lengthBeats: 12, offsetBeats: 0 } }));
    check('N3 layoutCuts Dehnen 150 %: Beats 0 / 3 / 7,5, Längen 3 / 4,5 / 4,5', JSON.stringify(l3) === JSON.stringify([[[0, 3, 0]], [[3, 4.5, 0]], [[7.5, 4.5, 0]]]), JSON.stringify(l3));
    const l4 = one(C.layoutCuts(cuts, { ...base, recipe: {}, clip: { startBeat: 0, lengthBeats: 20, offsetBeats: 1 } }));
    check('N3 layoutCuts Clip-Fenster (Versatz 1, Länge 20) mit Wiederholung: angeschnitten vorn, gekürzt hinten',
      JSON.stringify(l4) === JSON.stringify([[[0, 1, 1], [7, 2, 0], [15, 2, 0]], [[1, 3, 0], [9, 3, 0], [17, 3, 0]], [[4, 3, 0], [12, 3, 0]]]), JSON.stringify(l4));
    const l5 = one(C.layoutCuts(cuts, { ...base, recipe: {}, clip: { startBeat: 0, lengthBeats: 16, offsetBeats: 0, stretch: 2 } }));
    check('N3 layoutCuts Clip-Geschwindigkeit 50 % (stretch 2): Lage ×2', JSON.stringify(l5) === JSON.stringify([[[0, 4, 0]], [[4, 6, 0]], [[10, 6, 0]]]), JSON.stringify(l5));
    const l6 = one(C.layoutCuts([{ start: 0, end: 1.1 }, { start: 1.1, end: 4 }], { ...base, recipe: {}, grid: 1 }));
    check('N3 layoutCuts ohne Clip, Ins Raster 1: Anfänge auf ganzen Schlägen, lückenlos', JSON.stringify(l6) === JSON.stringify([[[0, 2, 0]], [[2, 6, 0]]]), JSON.stringify(l6));
    check('N3 cookedSeconds liegt in src/cuts.js', typeof C.cookedSeconds === 'function' && near(C.cookedSeconds({ start: 1, end: 3, semis: 12 }, 4), 1));
  }

  const app = await openApp();
  const { page } = app;
  try {
    await page.evaluate(async () => { window.__M = await import('./src/model.js'); });
    await page.evaluate(helpers, { HITS, LEVELS });
    const api = await page.evaluate(async () => {
      try {
        const cs = await import('./src/cut-sound.js');
        return typeof window.__M.Store.prototype.cutSound === 'function' && typeof cs.findCuts === 'function' && typeof cs.separateSound === 'function';
      } catch { return false; }
    });
    check('API vorhanden: store.cutSound, findCuts, separateSound', api);
    if (!api) return;

    // 1. Anschläge
    const r1 = await page.evaluate(async () => {
      const T = window.T;
      const { findCuts } = await import('./src/cut-sound.js');
      await T.own('ct-kl', T.knock());
      const f = await findCuts(window.loopwerk.library, 'ct-kl', null, { sensitivity: 0.5 });
      await T.own('ct-kl9', T.knock([{ t: 9.3, db: -30 }]));
      const lo = await findCuts(window.loopwerk.library, 'ct-kl9', null, { sensitivity: 0.2 });
      const hi = await findCuts(window.loopwerk.library, 'ct-kl9', null, { sensitivity: 1 });
      return { cuts: f.cuts, lo: lo.cuts.length, hi: hi.cuts.length, hi9: hi.cuts[8]?.onset ?? null };
    });
    const errs = r1.cuts.map((c, k) => (k === 0 ? c.onset : c.start + 0.003) - HITS[k]).map((e) => Math.round(e * 1e4) / 10);
    check('1 Empfindlichkeit 0,5: genau 8 Marken', r1.cuts.length === 8, `${r1.cuts.length} Schnitte`);
    check('1 Schnittanfang + 3 ms am Anschlag (±5 ms), erster ab Anfang, letzter bis Ende', r1.cuts.length === 8 && errs.every((e) => Math.abs(e) <= 5) && r1.cuts[0].start === 0 && Math.abs(r1.cuts[7].end - 10) < 1e-6,
      `Abweichungen ms: ${errs.join(' ')}`);
    check('1 9. Schlag −30 dB: bei 0,2 nicht, bei 1,0 gefunden', r1.lo === 8 && r1.hi === 9 && Math.abs(r1.hi9 - 9.3) < 0.005, JSON.stringify({ lo: r1.lo, hi: r1.hi, at: r1.hi9 }));

    // 2. In 8 gleiche
    const r2 = await page.evaluate(async () => {
      const { findCuts } = await import('./src/cut-sound.js');
      const f = await findCuts(window.loopwerk.library, 'ct-kl', { start: 1, end: 9 }, { mode: 'even', count: 8 });
      return f.cuts.map((c) => [c.start, c.end]);
    });
    const evenOk = r2.length === 8 && r2.every(([a, b], k) => Math.abs(a * 44100 - (44100 + k * 44100)) <= 1 && Math.abs(b * 44100 - (2 * 44100 + k * 44100)) <= 1);
    check('2 In 8 gleiche (Fenster 1…9 s): Grenzen bei 1 + k s (±1 Frame)', evenOk, JSON.stringify(r2));

    // 3. Schnitt-Variante = Ausschnitt des Originals (mit Rezept der Quelle)
    const r3 = await page.evaluate(async () => {
      const T = window.T;
      const { library } = window.loopwerk;
      const { findCuts } = await import('./src/cut-sound.js');
      const s = T.store();
      s.setRecipe('ct-kl', { gain: -6, material: 'koerper' });
      const { cuts } = await findCuts(library, 'ct-kl', s.project.recipes['ct-kl']);
      const u0 = s.undoStack.length;
      const res = s.cutSound('ct-kl', cuts);
      const steps = s.undoStack.length - u0;
      const id = res.ids[3];
      const rc = s.project.recipes[id];
      s.addClip('t1', id, 0, 4);
      const d = await T.render(s, 4);
      const orig = library.get('ct-kl').orig.getChannelData(0);
      const a = Math.round(rc.start * T.sr), b = Math.round(rc.end * T.sr);
      const edge = Math.round(0.002 * T.sr);
      const g = Math.pow(10, -6 / 20);
      let max = 0;
      for (let i = edge; i < b - a - edge; i++) max = Math.max(max, Math.abs(d[i] - g * orig[a + i]));
      const v = library.get(id);
      let tail = 0; // bis zur nächsten Wiederholung (Einzelklang auf ganze Schläge aufgefüllt)
      for (let i = b - a + 2; i < v.buffer.length; i++) tail = Math.max(tail, Math.abs(d[i]));
      return {
        steps, n: res.ids.length, group: res.group, groups: res.ids.map((x) => s.project.recipes[x].group), names: res.ids.map((x) => s.project.recipes[x].name),
        parent: rc.parent, gain: rc.gain, material: rc.material, max, tail, len: v.cooked?.length, want: b - a, kind: v.kind, lib: v.group, tempo: s.project.sampleTempo?.[id] ?? null,
      };
    });
    check('3 cutSound: 8 Varianten, ein Undo-Schritt, eine Gruppe zg-…, parent = Wurzel, Klangfelder und Material kopiert',
      r3.n === 8 && r3.steps === 1 && /^zg-/.test(r3.group) && r3.groups.every((g) => g === r3.group) && r3.parent === 'ct-kl' && r3.gain === -6 && r3.material === 'koerper' && r3.lib === r3.group,
      JSON.stringify({ n: r3.n, steps: r3.steps, group: r3.group, parent: r3.parent, gain: r3.gain, material: r3.material, lib: r3.lib }));
    check('3 Namen „ct-kl · 1“ … „· 8“ in Zeitfolge, Einzelklang ohne sampleTempo', r3.names.every((n, k) => n === `ct-kl · ${k + 1}`) && r3.kind === 'oneshot' && r3.tempo === null, r3.names.join(', '));
    check('3 Schnitt klingt samplegenau wie orig[a…b] −6 dB (< 1e-4 außerhalb 2-ms-Kanten), Länge ±1 Frame, danach still',
      r3.max < 1e-4 && Math.abs(r3.len - r3.want) <= 1 && r3.tail < 1e-4, JSON.stringify({ max: r3.max, len: r3.len, want: r3.want, tail: r3.tail }));

    // 4. Auf die Spur klingt gleich
    const cases = [
      { name: 'gerade', recipe: {}, clip: {} },
      { name: 'rückwärts', recipe: { reverse: true }, clip: {} },
      { name: 'semis −5', recipe: { semis: -5 }, clip: { lengthBeats: 27 } },
      { name: 'Ausschnitt 0,8…9,1 s + lp 6 kHz', recipe: { start: 0.8, end: 9.1, lp: 6000 }, clip: {} },
      { name: 'Versatz 3, Länge 34 (Wiederholung)', recipe: {}, clip: { offsetBeats: 3, lengthBeats: 34 } },
      // Tonband: Chrome startet Teil-Sample-genau, liest mit playbackRate aber nicht bitgleich → nur RMS-Grenze
      { name: 'wie Tonband 80 %', recipe: {}, clip: { stretch: 1.25, varispeed: true, lengthBeats: 25 }, rmsOnly: true },
      // WSOLA dehnt jeden Schnitt für sich: nicht bitgleich, aber die Anschläge bleiben an ihrer Stelle
      { name: 'Geschwindigkeit 125 % (WSOLA)', recipe: {}, clip: { stretch: 0.8, lengthBeats: 16 }, onsetsOnly: true },
    ];
    for (const cs of cases) {
      const r4 = await page.evaluate(async (cs) => {
        const T = window.T;
        const { library } = window.loopwerk;
        const { findCuts } = await import('./src/cut-sound.js');
        const { layoutCuts } = await import('./src/cuts.js');
        const s = T.store(12);
        if (Object.keys(cs.recipe).length) s.setRecipe('ct-kl', cs.recipe);
        const cid = s.addClip('t1', 'ct-kl', 2, cs.clip.lengthBeats ?? 20);
        s.setClip(cid, { ...cs.clip, lengthBeats: cs.clip.lengthBeats ?? 20 });
        if (cs.clip.stretch && !cs.clip.varispeed) await library.ensureProject(s.project);
        const before = await T.render(s, 46);
        const rec = s.project.recipes?.['ct-kl'] ?? null;
        const { cuts } = await findCuts(library, 'ct-kl', rec);
        const clip = s.findClip(cid).clip;
        const laid = layoutCuts(cuts, { recipe: rec || {}, duration: library.get('ct-kl').orig.duration, sampleRate: T.sr, beatsPerSecond: s.project.bpm / 60, clip });
        const res = s.cutSound('ct-kl', laid, { clipId: cid, place: 'clip' });
        // Die App räumt bei jedem Library-Ereignis gedehnte Fassungen weg, die ihr eigenes Projekt nicht braucht: Stand spiegeln
        if (cs.clip.stretch && !cs.clip.varispeed) { window.loopwerk.store.replace(JSON.parse(JSON.stringify(s.project))); await library.applyRecipes(s.project); await library.ensureProject(s.project); }
        const after = await T.render(s, 46);
        const cmp = T.compare(before, after, T.bounds(s));
        const { detectOnsets } = await import('./src/dsp/slice.js');
        const o0 = detectOnsets(before, T.sr), o1 = detectOnsets(after, T.sr);
        cmp.onsetMs = o0.length === o1.length ? Math.max(...o0.map((o, i) => Math.abs(o - o1[i]))) / T.sr * 1000 : Infinity;
        // ideale Lage der Anschläge (Clip ab Schlag 2 = 1 s, Laufzeit clip.stretch)
        const ideal = window.T.HITS.map((h) => (1 + h * (cs.clip.stretch ?? 1)) * T.sr);
        const dev = (o) => (o.length === ideal.length ? Math.max(...o.map((x, i) => Math.abs(x - ideal[i]))) / T.sr * 1000 : Infinity);
        cmp.idealBefore = dev(o0);
        cmp.idealAfter = dev(o1);
        return { ...cmp, clips: res.clipIds.length, gone: !s.findClip(cid), rms: T.db(T.rms(before)) };
      }, cs);
      const ok4 = cs.onsetsOnly ? r4.idealAfter <= 5 : r4.relDb <= -40 && (cs.rmsOnly || r4.max < 1e-3);
      check(`4 Auf die Spur klingt gleich (${cs.name}): ${cs.onsetsOnly ? 'Anschläge ±5 ms an der idealen Stelle' : 'Differenz ≤ −40 dB'}${cs.rmsOnly || cs.onsetsOnly ? '' : ', außerhalb ±3 ms < 1e-3'}`, ok4 && r4.gone && r4.clips >= 8,
        `Anschläge ±${r4.onsetMs.toFixed(2)} ms zum Original, ideal: Original ±${r4.idealBefore.toFixed(2)} / Schnitte ±${r4.idealAfter.toFixed(2)} ms, ${r4.relDb.toFixed(1)} dB, max ${r4.max.toExponential(2)} @${r4.at}, ${r4.clips} Clips, Signal ${r4.rms.toFixed(1)} dBFS`);
    }

    // 5. Ein Undo, nicht-destruktiv
    const r5 = await page.evaluate(async () => {
      const T = window.T;
      const { library } = window.loopwerk;
      const { findCuts } = await import('./src/cut-sound.js');
      const { layoutCuts } = await import('./src/cuts.js');
      const s = T.store(12);
      const cid = s.addClip('t1', 'ct-kl', 0, 20);
      s.setClip(cid, { fadeInBeats: 0.5, fadeOutBeats: 1, gain: 0.7 });
      const sum0 = T.sum(library.get('ct-kl').orig.getChannelData(0));
      const own0 = [...library.samples.values()].filter((x) => x.category === 'own' && !x.parentId).length;
      const u0 = s.undoStack.length;
      const { cuts } = await findCuts(library, 'ct-kl', null);
      const laid = layoutCuts(cuts, { recipe: {}, duration: 10, sampleRate: T.sr, beatsPerSecond: 2, clip: s.findClip(cid).clip });
      const res = s.cutSound('ct-kl', laid, { clipId: cid, place: 'clip' });
      const clips = s.project.tracks[0].clips;
      const steps = s.undoStack.length - u0;
      const inh = { gain: clips.every((c) => c.gain === 0.7), fi: clips.map((c) => c.fadeInBeats || 0), fo: clips.map((c) => c.fadeOutBeats || 0) };
      await library.applyRecipes(s.project);
      const own1 = [...library.samples.values()].filter((x) => x.category === 'own' && !x.parentId).length;
      // zweites Zerlegen zählt weiter
      const res2 = s.cutSound('ct-kl', cuts.slice(0, 2));
      const names2 = res2.ids.map((x) => s.project.recipes[x].name);
      s.undo();
      s.undo();
      await library.applyRecipes(s.project);
      const empty = s.cutSound('ct-kl', []);
      const tr = s.cutSound('ct-kl', laid.slice(0, 3), { place: 'track', atBeat: 8 });
      const newTrack = s.project.tracks.length === 3 && s.project.tracks[2].clips.length === 3 && s.project.tracks[2].clips[0].startBeat >= 8;
      return {
        steps, inh, names2, sum: T.sum(library.get('ct-kl').orig.getChannelData(0)) === sum0, own0, own1,
        empty, newTrack, trClips: tr?.clipIds?.length,
      };
    });
    check('5 Zerlegen = ein Undo-Schritt; Clips erben Lautstärke, Einblenden nur der erste, Ausblenden nur der letzte',
      r5.steps === 1 && r5.inh.gain && r5.inh.fi.filter((v) => v > 0).length === 1 && r5.inh.fi[0] > 0 && r5.inh.fo.filter((v) => v > 0).length === 1 && r5.inh.fo[r5.inh.fo.length - 1] > 0,
      JSON.stringify({ steps: r5.steps, ...r5.inh }));
    check('5 Zweites Zerlegen zählt weiter (· 9, · 10)', JSON.stringify(r5.names2) === JSON.stringify(['ct-kl · 9', 'ct-kl · 10']), JSON.stringify(r5.names2));
    check('5 orig der Wurzel unverändert, keine neuen eigenen Sounds; leere cuts ohne Wirkung', r5.sum && r5.own0 === r5.own1 && r5.empty === null, JSON.stringify({ sum: r5.sum, own: [r5.own0, r5.own1], empty: r5.empty }));
    check('5 place:track ohne trackId legt eine neue Spur ab atBeat an', r5.newTrack && r5.trClips === 3, JSON.stringify({ newTrack: r5.newTrack, clips: r5.trClips }));
    const r5u = await page.evaluate(async () => {
      const T = window.T;
      const { library } = window.loopwerk;
      const { findCuts } = await import('./src/cut-sound.js');
      const { layoutCuts } = await import('./src/cuts.js');
      const s = T.store(12);
      const cid = s.addClip('t1', 'ct-kl', 0, 20);
      const json0 = JSON.stringify(s.project);
      const { cuts } = await findCuts(library, 'ct-kl', null);
      s.cutSound('ct-kl', layoutCuts(cuts, { recipe: {}, duration: 10, sampleRate: T.sr, beatsPerSecond: 2, clip: s.findClip(cid).clip }), { clipId: cid, place: 'clip' });
      s.undo();
      await library.applyRecipes(s.project);
      return { same: JSON.stringify(s.project) === json0, variants: [...library.samples.values()].filter((x) => x.group).length };
    });
    check('5 undo() → Projekt-JSON gleich dem Stand davor, Schnitte aus der Library', r5u.same && r5u.variants === 0, JSON.stringify(r5u));

    // 6. Autotune als Rezeptschritt
    const r6 = await page.evaluate(async () => {
      const T = window.T;
      const { library } = window.loopwerk;
      const f = 440 * Math.pow(2, 30 / 1200);
      await T.own('ct-sin', T.sine(1, f, 0.5));
      const s = T.store(2);
      s.addClip('t1', 'ct-sin', 0, 2);
      const b0 = library.get('ct-sin').buffer.getChannelData(0).slice();
      const f0 = await T.yin(await T.render(s, 2));
      s.setRecipe('ct-sin', { tune: 1, tuneKey: 'Am' });
      const d = await T.render(s, 2); // ohne vorher zu warten
      const f1 = await T.yin(d.subarray(0, T.sr));
      const steps = (await import('./src/recipe.js')).recipeSteps(s.project.recipes['ct-sin']);
      s.setRecipe('ct-sin', { tune: 0, robot: true });
      await library.applyRecipes(s.project);
      const b1 = library.get('ct-sin').buffer.getChannelData(0);
      let diff = b1.length === b0.length ? 0 : Infinity;
      for (let i = 0; i < b0.length && diff < Infinity; i++) diff = Math.max(diff, Math.abs(b1[i] - b0[i]));
      return { f0, f1, steps, diff, cooked: library.get('ct-sin').cooked };
    });
    check('6 Autotune tune 1, Am: 30 Cent zu hoch → 440 Hz (YIN ±1 %), renderProject wartet auf den Worker', Math.abs(r6.f1 - 440) / 440 <= 0.01 && Math.abs(r6.f0 - 447.7) < 2,
      `${r6.f0.toFixed(2)} → ${r6.f1.toFixed(2)} Hz`);
    check('6 recipeSteps: „gestimmt auf Am“', r6.steps.includes('gestimmt auf Am'), JSON.stringify(r6.steps));
    check('6 tune 0 ist bitgleich ohne Rezept (auch mit robot)', r6.diff === 0 && r6.cooked === null, JSON.stringify({ diff: r6.diff }));

    // 9. Kosten
    const r9 = await page.evaluate(async () => {
      const { detectOnsets } = await import('./src/dsp/slice.js');
      const { library } = window.loopwerk;
      const mono = library.get('ct-kl').orig.getChannelData(0);
      detectOnsets(mono, 44100);
      const times = [];
      for (let k = 0; k < 3; k++) { const t0 = performance.now(); detectOnsets(mono, 44100); times.push(performance.now() - t0); }
      // langer Sound (40 s) über den Worker
      const T = window.T;
      const long = new AudioBuffer({ numberOfChannels: 2, length: 40 * T.sr, sampleRate: T.sr });
      const k = T.knock();
      for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) long.getChannelData(c).set(k.getChannelData(c), r * 10 * T.sr);
      await T.own('ct-long', long);
      const { findCuts } = await import('./src/cut-sound.js');
      const t1 = performance.now();
      const f = await findCuts(library, 'ct-long', null);
      return { ms: Math.min(...times), long: performance.now() - t1, n: f.cuts.length };
    });
    check('9 detectOnsets auf 10 s Mono < 30 ms', r9.ms < 30, `${r9.ms.toFixed(1)} ms`);
    check('9 40 s über den Worker-Job onsets: 32 Schnitte', r9.n === 32, `${r9.n} Schnitte, ${r9.long.toFixed(0)} ms`);

    // 7. + 8. Trennen und Datei (Krachwerk)
    const kw = await app.browser.newPage();
    const kwErr = [];
    kw.on('pageerror', (e) => kwErr.push(e.message));
    kw.on('console', (m) => { if (m.type() === 'error') kwErr.push(m.text()); });
    await kw.goto(new URL('/werkstatt/', app.url).href);
    await kw.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await kw.evaluate(async () => { window.__M = await import('./src/model.js'); });
    await kw.evaluate(helpers, { HITS, LEVELS });
    const r7 = await kw.evaluate(async () => {
      const { own, store, library } = window.loopwerk;
      const T = window.T;
      const M = window.__M;
      const { separateSound } = await import('./src/cut-sound.js');
      const snd = await own.create({ name: 'Mix', buffer: T.knock() });
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      const cid = store.addClip('t1', snd.id, 0, 20);
      store.setRecipe(snd.id, { lp: 5000, semis: -2 });
      const t0 = performance.now();
      const v = await separateSound({ store, library, own, sampleId: snd.id, clipId: cid, mode: 'vocal' });
      const ms = performance.now() - t0;
      const vid = store.findClip(cid).clip.sampleId;
      const vs = library.get(vid);
      const res = { ids: v.ids, ms, vid, len: vs?.orig?.length, want: library.get(snd.id).orig.length, rec: store.project.recipes?.[vid] ?? null, source: vs?.source };
      store.undo();
      res.back = store.findClip(cid)?.clip.sampleId === snd.id;
      const st = await separateSound({ store, library, own, sampleId: snd.id, clipId: cid, mode: 'stems' });
      res.stems = st.ids.length;
      res.stemLens = st.ids.map((id) => library.get(id)?.orig?.length);
      res.tracks = store.project.tracks.length;
      res.stemRec = st.ids.every((id) => store.project.recipes?.[id]?.lp === 5000);
      return res;
    });
    check('7 Nur Stimme: neuer Sound mit Audio, Länge = Original, Rezept kopiert, Clip zeigt darauf', r7.ids.length === 1 && r7.vid === r7.ids[0] && r7.len === r7.want && r7.rec?.lp === 5000 && r7.rec?.semis === -2 && /Ebene aus/.test(r7.source || ''),
      JSON.stringify({ ids: r7.ids, len: r7.len, want: r7.want, rec: r7.rec, source: r7.source, ms: Math.round(r7.ms) }));
    check('7 undo() stellt den Clip zurück', r7.back);
    check('7 In 4 Ebenen: 4 Sounds gleicher Länge auf 4 neuen Spuren, Rezept kopiert', r7.stems === 4 && r7.stemLens.every((l) => l === r7.want) && r7.tracks === 6 && r7.stemRec,
      JSON.stringify({ stems: r7.stems, lens: r7.stemLens, tracks: r7.tracks, rec: r7.stemRec }));

    const k8 = await kw.evaluate(async () => {
      const { own, store, library, renderProject } = window.loopwerk;
      const T = window.T;
      const M = window.__M;
      const { findCuts } = await import('./src/cut-sound.js');
      const { layoutCuts } = await import('./src/cuts.js');
      const snd = await own.create({ name: 'Klopfen', buffer: T.knock() });
      store.replace(M.createEmptyProject({ tracks: 2, bpm: 120 }));
      store.setProjectName('Zerlegen-Datei');
      const cid = store.addClip('t1', snd.id, 0, 20);
      const { cuts } = await findCuts(library, snd.id, null);
      const res = store.cutSound(snd.id, layoutCuts(cuts, { recipe: {}, duration: 10, sampleRate: T.sr, beatsPerSecond: 2, clip: store.findClip(cid).clip }), { clipId: cid, place: 'clip' });
      store.setRecipe(res.ids[2], { tune: 0.5, robot: true, tuneKey: 'Em' });
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 20 })).getChannelData(0).slice();
      return { id: snd.id, ids: res.ids, group: res.group, d: Array.from(d), names: res.ids.map((x) => store.project.recipes[x].name) };
    });
    check('8 Namen „Klopfen · 1“ … „· 8“', k8.names.length === 8 && k8.names.every((n, k) => n === `Klopfen · ${k + 1}`), k8.names.join(', '));
    const [download] = await Promise.all([kw.waitForEvent('download'), kw.evaluate(() => document.getElementById('save-btn').click())]);
    const saved = path.join(os.tmpdir(), 'loopwerk-zerlegen.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    const t2 = json.recipes?.[k8.ids[2]];
    check('8 Datei: version 1, group und tune* bleiben, Wurzel eingebettet', json.version === 1 && t2?.group === k8.group && t2?.tune === 0.5 && t2?.robot === true && t2?.tuneKey === 'Em' && json.ownSounds?.some((e) => e.id === k8.id),
      JSON.stringify(t2));
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Zerlegen-Datei', null, { timeout: 10000 });
    const lw = await page.evaluate(async () => {
      const { store, library, renderProject } = window.loopwerk;
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 20 })).getChannelData(0);
      return { d: Array.from(d), n: store.project.tracks[0].clips.length };
    });
    let diff = lw.d.length === k8.d.length ? 0 : Infinity;
    for (let i = 0; i < k8.d.length && diff < Infinity; i++) diff = Math.max(diff, Math.abs(lw.d[i] - k8.d[i]));
    check('8 In Loopwerk geöffnet: Render gleich Krachwerk (< 1e-4)', diff < 1e-4 && lw.n === 8, `Abweichung ${diff}, ${lw.n} Clips`);

    check('Keine Konsolenfehler', !app.errors.length && !kwErr.length, [...app.errors, ...kwErr].join(' | '));
    await kw.close();
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
    finish();
  }
})();
