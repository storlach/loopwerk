// Krachwerk Scheibe 3a, Festhalten (Spec docs/specs/krachwerk-3-festhalten.md §3, §5, §6, §9 Tests 1–8):
// Bereich über renderProject(master:false) als Schleife, Ausklang an den Anfang gefaltet, neue Spur unter den Quellen,
// Quell-Clips im Bereich stumm (clip.mute), ein Undo-Schritt. Gemessen im Offline-Rendering.
// node tests/freeze.test.cjs
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
  const sine = (frames, hz, amp = 0.4) => buf(frames, (d) => { for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * hz * i / sr); });
  // Klopfer: gedämpfte Rauschstöße je Schlag (fester Seed)
  const knock = (frames, every, seed = 3) => buf(frames, (d, c) => {
    const r = rng(seed + c * 17);
    for (let a = 0; a < d.length; a += every) for (let i = 0; i < 1500 && a + i < d.length; i++) d[a + i] += 0.6 * r() * Math.exp(-i / 300);
  });
  const impulse = (frames) => buf(frames, (d) => { d[0] = 0.9; });
  const own = async (id, orig, extra = {}) => {
    library.remove(id);
    return library.add({ id, name: id, category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig, duration: orig.duration, ...extra });
  };
  const store = ({ tracks = 3, bpm = 90, bars = 8 } = {}) => {
    const p = M.createEmptyProject({ tracks, bpm });
    p.lengthBars = bars;
    for (const t of p.tracks) t.volume = 1;
    p.master = { volume: 1 };
    return new M.Store(p, {
      sampleBeats: (id) => library.get(id)?.lengthBeats ?? 4, sampleName: (id) => library.get(id)?.name,
      soundDuration: (id) => library.get(id)?.orig?.duration ?? library.get(id)?.duration ?? null,
    });
  };
  const render = async (s, opts = {}) => (await window.loopwerk.renderProject(s.project, library, { limiter: false, ...opts })).getChannelData(0).slice();
  const rms = (d, a = 0, z = d.length) => { let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, z - a)); };
  const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
  const goertzel = (d, hz, a = 0, z = d.length) => {
    const w = 2 * Math.PI * hz / sr, k = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = a; i < z; i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / (z - a);
  };
  const peakAt = (d, a = 0, z = d.length) => { let m = 0, at = -1; for (let i = a; i < z; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); at = i; } return { m, at }; };
  window.T = { sr, sine, knock, impulse, own, store, render, rms, db, goertzel, peakAt };
}

(async () => {
  // Krachwerk: Bibliothek im Song-Tempo 90 BPM und ohne Kataloge (Loops werden im Bibliothekstempo vorbereitet)
  const app = await openApp();
  const { page } = app;
  try {
    await page.goto(new URL('/werkstatt/', app.url).href);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await page.evaluate(async () => { window.__M = await import('./src/model.js'); window.__F = await import('./src/freeze.js').catch(() => null); });
    await page.evaluate(helpers);
    const api = await page.evaluate(() => ({
      freeze: typeof window.__M.Store.prototype.freeze === 'function',
      used: typeof window.__M.usedSampleIds === 'function',
      render: typeof window.__F?.renderFreeze === 'function',
      range: typeof window.__F?.freezeRange === 'function',
    }));
    check('API vorhanden: store.freeze, usedSampleIds, renderFreeze, freezeRange', api.freeze && api.used && api.render && api.range, JSON.stringify(api));
    if (!(api.freeze && api.used && api.render && api.range)) return;

    // 0. Modell: clip.mute, audibleMap, Signatur, usedSampleIds, addTrack({ after })
    const r0 = await page.evaluate(() => {
      const M = window.__M;
      const a = M.normalizeClip({ id: 'x', sampleId: 's', startBeat: 0, lengthBeats: 4, mute: false });
      const b = M.normalizeClip({ id: 'y', sampleId: 's', startBeat: 0, lengthBeats: 4, mute: 1 });
      const p = M.createEmptyProject({ tracks: 2 });
      p.tracks[0].clips = [{ id: 'c1', sampleId: 'own-a', startBeat: 0, lengthBeats: 8, offsetBeats: 0, mute: true }, { id: 'c2', sampleId: 'vr-b', startBeat: 0, lengthBeats: 4, offsetBeats: 0, z: 1 }];
      p.tracks[1].clips = [{ id: 'c3', sampleId: 'own-c', startBeat: 0, lengthBeats: 4, offsetBeats: 0 }];
      p.recipes = { 'vr-b': { parent: 'own-p', name: 'b' }, 'vr-unused': { parent: 'own-q', name: 'q' } };
      const aud = M.audibleMap(p);
      const used = [...M.usedSampleIds(p)].sort();
      const s = window.T.store({ tracks: 3 });
      const id = s.addTrack({ after: 't1' });
      const id2 = s.addTrack();
      return {
        aMute: 'mute' in a, bMute: b.mute,
        sig: M.clipSignature('t', { ...p.tracks[0].clips[0] }) !== M.clipSignature('t', { ...p.tracks[0].clips[0], mute: undefined }),
        sigSame: M.clipSignature('t', { id: 'q', sampleId: 's', startBeat: 0, lengthBeats: 4 }) === 't|s|0|4|0|1|0|0|0|0|0|1|0',
        aud1: JSON.stringify(aud.get('c1')), used, order: s.project.tracks.map((t) => t.id).join(','), id, id2,
      };
    });
    check('0 normalizeClip: mute false fällt weg, wahr wird true', !r0.aMute && r0.bMute === true, JSON.stringify(r0));
    check('0 clipSignature: stumm ändert die Signatur, sonst unverändertes Format', r0.sig && r0.sigSame);
    check('0 audibleMap: stummer Clip hat keine hörbaren Bereiche', r0.aud1 === '[]', r0.aud1);
    check('0 usedSampleIds: Clips (auch stumme) + Eltern benutzter Varianten, keine unbenutzten', JSON.stringify(r0.used) === JSON.stringify(['own-a', 'own-c', 'own-p', 'vr-b']), JSON.stringify(r0.used));
    check('0 addTrack({ after }): neue Spur direkt darunter, ohne Option am Ende', r0.order === 't1,t4,t2,t3,t5' && r0.id === 't4' && r0.id2 === 't5', r0.order);

    // 1. Länge
    const r1 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const lib = window.loopwerk.library;
      await T.own('fz-sine', T.sine(44100, 300));
      await T.own('fz-knock', T.knock(88200, 14700));
      const s = T.store({ tracks: 3 });
      s.addClip('t1', 'fz-sine', 0, 8);
      s.addClip('t2', 'fz-knock', 0, 8);
      s.setLoop({ on: true, startBeat: 0, endBeat: 8 });
      const res = await freezeRange({ store: s, library: lib, fromBeat: 0, toBeat: 8 });
      const snd = lib.get(res.sampleId);
      if (lib.bpm !== 90) throw new Error('Bibliothek nicht auf 90 BPM: ' + lib.bpm);
      const t = s.project.tracks;
      const nt = t.find((x) => x.id === res.trackId);
      return {
        res, N: Math.round(8 * 60 / 90 * 44100), orig: snd.orig.length, buf: snd.buffer.length, kind: snd.kind, beats: snd.beats, name: snd.name, from: snd.made?.from, src: snd.made?.src,
        tempo: s.project.sampleTempo?.[res.sampleId], order: t.map((x) => x.id).join(','), idx: t.indexOf(nt), track: { name: nt.name, volume: nt.volume, pan: nt.pan, fx: nt.fx ?? null },
        clip: nt.clips.map((c) => [c.sampleId === res.sampleId, c.startBeat, c.lengthBeats]),
      };
    });
    check('1 Länge: Loop 0–8 bei 90 BPM → genau N Frames (orig und Fassung)', r1.orig === r1.N && r1.buf === r1.N, `${r1.orig} / ${r1.buf}, N ${r1.N}`);
    check('1 Sound: kind loop, beats 8, „Schleife N“, from freeze, src = Zutaten, sampleTempo 8', r1.kind === 'loop' && r1.beats === 8 && /^Schleife \d+$/.test(r1.name) && r1.from === 'freeze'
      && JSON.stringify([...(r1.src || [])].sort()) === '["fz-knock","fz-sine"]' && r1.tempo === 8, JSON.stringify({ kind: r1.kind, beats: r1.beats, name: r1.name, from: r1.from, src: r1.src, tempo: r1.tempo }));
    check('1 Neue Spur direkt unter der untersten Quellspur (t2), 0 dB, Mitte, ohne Effekte, Clip [0, 8)', r1.idx === 2 && r1.order.split(',')[3] === 't3' && r1.track.volume === 1 && r1.track.pan === 0 && !r1.track.fx
      && JSON.stringify(r1.clip) === '[[true,0,8]]' && r1.track.name === r1.name, JSON.stringify({ order: r1.order, track: r1.track, clip: r1.clip }));

    // 2. Klingt gleich (2. Durchgang = eingeschwungener Zustand mit gefaltetem Ausklang)
    const r2 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const lib = window.loopwerk.library;
      const N = Math.round(8 * 60 / 90 * 44100);
      await T.own('fz-sine8', T.sine(N, 300));
      await T.own('fz-knock8', T.knock(N, N / 8));
      const s = T.store({ tracks: 3 });
      s.addClip('t1', 'fz-sine8', 0, 16);
      s.addClip('t2', 'fz-knock8', 0, 16);
      s.setTrackFx('t2', 'hall', { on: true, mix: 0.45, size: 0.5 });
      s.setLoop({ on: true, startBeat: 0, endBeat: 8 });
      const before = await T.render(s, { toBeat: 16 });
      const res = await freezeRange({ store: s, library: lib, fromBeat: 0, toBeat: 8 });
      const nt = s.project.tracks.find((x) => x.id === res.trackId);
      s.resizeClip(nt.clips[0].id, 16);
      for (const t of s.project.tracks) for (const c of t.clips) if (t.id !== res.trackId) s.setClip(c.id, { mute: true });
      const after = await T.render(s, { toBeat: 16 });
      let e = 0, sig = 0, tailE = 0;
      for (let i = N; i < 2 * N; i++) { const d = before[i] - after[i]; e += d * d; sig += before[i] * before[i]; }
      for (let i = N; i < N + 44100; i++) tailE += (before[i] - after[i]) ** 2;
      const loop = lib.get(res.sampleId).orig.getChannelData(0);
      return { relDb: 10 * Math.log10((e + 1e-30) / (sig + 1e-30)), firstDb: T.db(T.rms(loop, 0, 4410)), sig: Math.sqrt(sig / N), tailDb: 10 * Math.log10((tailE + 1e-30) / (sig / N * 44100)) };
    });
    check('2 Klingt gleich: Differenz im 2. Durchgang ≤ −40 dB RMS (Sinus, Klopfer, Hall auf Spur 2)', r2.relDb <= -40 && r2.sig > 0.05, `${r2.relDb.toFixed(1)} dB (erste Sekunde ${r2.tailDb.toFixed(1)} dB), Pegel ${r2.sig.toFixed(3)}`);

    // 3. Falten: Echo hinter dem Bereichsende landet am Anfang
    const r3 = await page.evaluate(async () => {
      const T = window.T;
      const { renderFreeze } = window.__F;
      const lib = window.loopwerk.library;
      await T.own('fz-imp', T.impulse(4410));
      const s = T.store({ tracks: 2, bpm: 100 });
      const N = Math.round(8 * 0.6 * 44100);
      s.addClip('t1', 'fz-imp', 7.75, 0.25);
      s.setTrackFx('t1', 'echo', { on: true, time: '1/8', feedback: 0, mix: 0.6 });
      const open = await renderFreeze(s.project, lib, { fromBeat: 0, toBeat: 8, fold: false });
      const fold = await renderFreeze(s.project, lib, { fromBeat: 0, toBeat: 8, fold: true });
      const u = open.buffer.getChannelData(0), f = fold.buffer.getChannelData(0);
      const imp = T.peakAt(u, 0, N);
      const echo = T.peakAt(u, N, u.length);
      const fe = T.peakAt(f, 0, Math.min(N, echo.at - N + 2000));
      return { N, len: f.length, openLen: u.length, imp: imp.at, echo: echo.at, echoM: echo.m, fAt: fe.at, fM: fe.m, impWant: N - Math.round(0.25 * 0.6 * 44100), fImp: f[imp.at] };
    });
    check('3 Falten: Ergebnis genau N Frames, ungefaltet länger (Echo hinter dem Ende)', r3.len === r3.N && r3.openLen > r3.N + (r3.echo - r3.N), JSON.stringify({ len: r3.len, open: r3.openLen, N: r3.N }));
    check('3 Echo 300 ms hinter dem Impuls (±2 Frames für den Ton-Tiefpass)', Math.abs(r3.echo - r3.imp - 13230) <= 2 && Math.abs(r3.imp - r3.impWant) <= 1, `Impuls ${r3.imp} (soll ${r3.impWant}), Echo ${r3.echo}`);
    check('3 Echo im Ergebnis bei Frame (Echo − N) ± 1, gleicher Pegel', Math.abs(r3.fAt - (r3.echo - r3.N)) <= 1 && Math.abs(r3.fM - r3.echoM) < 1e-3, `bei ${r3.fAt}, soll ${r3.echo - r3.N}; ${r3.fM.toFixed(4)} / ${r3.echoM.toFixed(4)}`);

    // 4. Auswahl: nur die gewählten Clips
    const r4 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const lib = window.loopwerk.library;
      await T.own('fz-440', T.sine(88200, 440));
      await T.own('fz-660', T.sine(88200, 660));
      await T.own('fz-880', T.sine(88200, 880));
      const s = T.store({ tracks: 3 });
      const a = s.addClip('t1', 'fz-440', 0, 8);
      const b = s.addClip('t2', 'fz-660', 2, 4);
      const c = s.addClip('t3', 'fz-880', 0, 8);
      const res = await freezeRange({ store: s, library: lib, clipIds: [a, b] });
      const d = lib.get(res.sampleId).orig.getChannelData(0);
      const z = Math.min(d.length, Math.round(5 * 44100));
      const nt = s.project.tracks.find((x) => x.id === res.trackId);
      const muted = s.project.tracks.flatMap((t) => t.clips.filter((x) => x.mute).map((x) => x.sampleId)).sort();
      return {
        g440: T.goertzel(d, 440, 0, z), g660: T.goertzel(d, 660, Math.round(1.4 * 44100), Math.round(3.9 * 44100)), g880: T.goertzel(d, 880, 0, z),
        muted, clip: [nt.clips[0].startBeat, nt.clips[0].lengthBeats], idx: s.project.tracks.indexOf(nt), kind: lib.get(res.sampleId).kind,
      };
    });
    const sep = 20 * Math.log10(r4.g440 / Math.max(1e-12, r4.g880));
    check('4 Auswahl: der dritte Clip fehlt (880 Hz ≥ 30 dB unter 440 Hz), der zweite klingt', sep >= 30 && r4.g660 > 0.05, `Abstand ${sep.toFixed(1)} dB, 660 Hz ${r4.g660.toFixed(3)}`);
    check('4 Auswahl: nur die beiden gewählten sind stumm, Bereich = frühester Anfang bis spätestes Ende, Spur unter t2', JSON.stringify(r4.muted) === '["fz-440","fz-660"]' && r4.clip[0] === 0 && r4.clip[1] >= 8 && r4.idx === 2,
      JSON.stringify(r4));

    // 5. Stumm teilt
    const r5 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const lib = window.loopwerk.library;
      const s = T.store({ tracks: 2 });
      const id = s.addClip('t1', 'fz-sine', 0, 16);
      const before = await T.render(s, { toBeat: 16 });
      await freezeRange({ store: s, library: lib, fromBeat: 4, toBeat: 8 });
      const clips = s.project.tracks[0].clips.map((c) => [c.startBeat, c.lengthBeats, !!c.mute]);
      const after = await T.render(s, { toBeat: 16 });
      const spb = 60 / 90, b4 = Math.round(4 * spb * 44100), b8 = Math.round(8 * spb * 44100), g = Math.round(0.003 * 44100);
      let out = 0, jump = 0;
      for (let i = 0; i < before.length; i++) {
        if (Math.abs(i - b4) < g || Math.abs(i - b8) < g || (i > b4 && i < b8)) continue;
        out = Math.max(out, Math.abs(before[i] - after[i]));
      }
      for (const b of [b4, b8]) for (let i = b - g; i < b + g; i++) jump = Math.max(jump, Math.abs(after[i + 1] - after[i]));
      let inner = 0;
      for (let i = b4 + g; i < b8 - g; i++) inner = Math.max(inner, Math.abs(before[i] - after[i]));
      return { id, clips, out, jump, inner };
    });
    check('5 Stumm teilt: Clip 0–16, Bereich 4–8 → 3 Clips, nur 4–8 stumm', JSON.stringify(r5.clips) === '[[0,4,false],[4,4,true],[8,8,false]]', JSON.stringify(r5.clips));
    check('5 Render 0–4 und 8–16 unverändert (< 1e-4, ±3 ms um die Grenzen ausgenommen), 4–8 gleich (Festgehaltenes)', r5.out < 1e-4 && r5.inner < 1e-3, `außen ${r5.out.toExponential(2)}, innen ${r5.inner.toExponential(2)}`);
    check('5 Übergänge 4 und 8 ohne Sprung (größter Nachbarsprung < 0,05; Sinus 300 Hz, 0,4)', r5.jump < 0.05, `Sprung ${r5.jump.toFixed(4)}`);

    // 6. Ein Undo
    const r6 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const lib = window.loopwerk.library;
      const s = T.store({ tracks: 2 });
      s.addClip('t1', 'fz-sine', 0, 16);
      s.addClip('t2', 'fz-knock', 2, 4);
      const json = JSON.stringify(s.project);
      const u0 = s.undoStack.length;
      const res = await freezeRange({ store: s, library: lib, fromBeat: 0, toBeat: 8 });
      const steps = s.undoStack.length - u0;
      s.undo();
      const same = JSON.stringify(s.project) === json;
      s.redo();
      return { steps, same, kept: !!lib.get(res.sampleId)?.orig, redo: s.project.tracks.length === 3 };
    });
    check('6 Ein Undo-Schritt; ↶ → Projekt wie vorher, Sound bleibt in der Library, ↷ stellt wieder her', r6.steps === 1 && r6.same && r6.kept && r6.redo, JSON.stringify(r6));

    // 7. Ohne Summe
    const r7 = await page.evaluate(async () => {
      const T = window.T;
      const { renderFreeze } = window.__F;
      const lib = window.loopwerk.library;
      await T.own('fz-burst', T.sine(13230, 300, 0.8));
      const s = T.store({ tracks: 2 });
      s.addClip('t1', 'fz-burst', 3, 1);
      s.setMasterFx('hall', { on: true, mix: 0.6, size: 0.6 });
      s.setMaster({ volume: 0.5 });
      const N = Math.round(4 * 60 / 90 * 44100);
      const endB = Math.round(3 * 60 / 90 * 44100) + 13230;
      const full = await T.render(s, { toBeat: 4, tailSeconds: 2 });
      const r = await renderFreeze(s.project, lib, { fromBeat: 0, toBeat: 4, fold: false });
      const d = r.buffer.getChannelData(0);
      return { N, len: d.length, after: T.peakAt(d, endB + 200, d.length).m, fullAfter: T.peakAt(full, N, full.length).m, peak: T.peakAt(d, 0, endB).m };
    });
    check('7 Ohne Summe: kein Master-Hall, Fader 1 (Spitze 0,8), nach dem Ton < −60 dB', r7.after < 1e-3 && Math.abs(r7.peak - 0.8) < 2e-3 && r7.fullAfter > 1e-2,
      `nach dem Ton ${T(r7.after)}, Länge ${r7.len} (N ${r7.N}), Spitze ${r7.peak.toFixed(3)}; mit Summe nach N ${T(r7.fullAfter)}`);

    // 8. Datei: from/src überstehen Speichern/Öffnen, der Sound eines stummen Clips wird eingebettet
    const r8 = await page.evaluate(async () => {
      const T = window.T;
      const { freezeRange } = window.__F;
      const { own, library } = window.loopwerk;
      const src = await own.create({ name: 'Quelle', buffer: T.sine(44100, 220) });
      const s = T.store({ tracks: 2 });
      s.addClip('t1', src.id, 0, 4);
      const res = await freezeRange({ store: s, library, own, fromBeat: 0, toBeat: 4 });
      const list = await own.embed(s.project);
      const e = list.find((x) => x.id === res.sampleId);
      const srcEmbedded = list.some((x) => x.id === src.id);
      library.remove(res.sampleId);
      await own.remove(res.sampleId);
      await own.restore(list);
      const back = library.get(res.sampleId);
      await library.ensure(res.sampleId);
      return { from: e?.from, src: e?.src, srcEmbedded, backFrom: back?.made?.from, backSrc: back?.made?.src, kind: back?.kind, beats: back?.beats, len: back?.orig?.length, mute: s.project.tracks[0].clips[0].mute };
    });
    check('8 Datei: from freeze und src in ownSounds, nach Öffnen wieder am Sound', r8.from === 'freeze' && JSON.stringify(r8.src) === JSON.stringify(r8.backSrc) && r8.backFrom === 'freeze' && r8.src?.length === 1 && r8.kind === 'loop' && r8.beats === 4, JSON.stringify(r8));
    check('8 Datei: Sound des stummen Quell-Clips wird eingebettet', r8.mute === true && r8.srcEmbedded, JSON.stringify({ mute: r8.mute, embedded: r8.srcEmbedded }));

    // 9. Render ohne vorheriges ensure: Sounds auf Abruf werden vor dem Rendern geladen
    const r9 = await page.evaluate(async () => {
      const T = window.T;
      const lib = window.loopwerk.library;
      const orig = T.sine(44100, 500);
      lib.remove('fz-lazy');
      lib.stub({ id: 'fz-lazy', name: 'fz-lazy', category: 'own', kind: 'oneshot', beats: null, origin: 'Eigene', made: { cls: null, tags: [], from: 'mic' }, orig: null, duration: 1, lengthBeats: 2 }, async (x) => { x.orig = orig; x.duration = orig.duration; });
      const s = T.store({ tracks: 1 });
      s.addClip('t1', 'fz-lazy', 0, 2);
      const d = await T.render(s, { toBeat: 2 });
      return { peak: T.peakAt(d).m, lazy: lib.get('fz-lazy').lazy };
    });
    check('9 renderProject lädt Sounds auf Abruf selbst (sonst klingt es stumm)', r9.peak > 0.3 && !r9.lazy, JSON.stringify(r9));

    check('Keine Konsolenfehler', !app.errors.length, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
    finish();
  }
})();

function T(x) { return `${(20 * Math.log10(Math.max(1e-12, x))).toFixed(1)} dB`; }
