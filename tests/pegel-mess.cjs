// Gemeinsame Messung für tools/klang/pegel.cjs und tests/pegel.test.cjs (ADR 013): Lautheit, Spitze und Rolle je
// Bibliotheks-Sound, je Drum-Kit (Grundbeat) und je Melodie-Klang (Standard-Melodie bzw. -Akkorde).
// Ergebnis je Eintrag: { role, loud, peakDb, levelDb, low } – loud/peakDb so, wie es klingt; levelDb = angewandter
// Pegel gegen die Spitzen-Normalisierung (sample.level bzw. renderPattern().level).

// Grundbeat und Standard-Melodien (auch für die Tabelle in src/levels-table.js)
const BEAT = { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] };
const MELODY = [57, 60, 64, 62, 60, 59, 57, 64];
const CHORDS = [[57, 60, 64], [53, 57, 60]];

async function measureAll(page, { parts = ['lib', 'kits', 'klaenge'], ids = '' } = {}) {
  return page.evaluate(async ({ parts, ids, BEAT, MELODY, CHORDS }) => {
    const Lo = await import('./src/dsp/loudness.js');
    const LV = await import('./src/levels.js');
    const I = await import('./src/instruments.js');
    const { library } = window.loopwerk;
    const sr = 44100;
    const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
    const chs = (b) => [b.getChannelData(0), b.getChannelData(b.numberOfChannels > 1 ? 1 : 0)];
    const peak = (b) => { let p = 0; for (const d of chs(b)) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; } return p; };
    const integ = (b) => Lo.integratedLoudness(chs(b), sr);
    const mom = (b) => {
      const [l, r] = chs(b); const w = Math.round(0.4 * sr); let best = -Infinity;
      if (l.length < w) return Lo.integratedLoudness([new Float32Array(w).fill(0).map((_, i) => l[i] ?? 0), new Float32Array(w).fill(0).map((_, i) => r[i] ?? 0)], sr);
      for (let a = 0; a + w <= l.length; a += Math.round(0.05 * sr)) best = Math.max(best, Lo.integratedLoudness([l.subarray(a, a + w), r.subarray(a, a + w)], sr));
      return best;
    };
    // Anteil der Energie unter 150 Hz (Zweipol-Tiefpass, grob genug für die Rolle)
    const low = (b) => {
      const [l, r] = chs(b); const a = Math.exp(-2 * Math.PI * 150 / sr);
      let y1 = 0, y2 = 0, el = 0, et = 0;
      for (let i = 0; i < l.length; i++) { const x = 0.5 * (l[i] + r[i]); y1 = (1 - a) * x + a * y1; y2 = (1 - a) * y1 + a * y2; el += y2 * y2; et += x * x; }
      return et > 0 ? el / et : 0;
    };
    const res = {};
    if (parts.includes('lib')) {
      res.lib = {};
      const mine = (s) => s.category === 'own' || /^(pat-|own-|test-)/.test(s.id) || s.missing;
      let list = library.list().filter((s) => !mine(s));
      if (ids.startsWith('@')) list = list.filter((s) => s.category === ids.slice(1));
      else if (ids) list = list.filter((s) => ids.split(',').includes(s.id));
      for (const s of list) {
        try { await library.ensure(s.id); } catch { continue; }
        const b = s.buffer;
        if (!b) continue;
        const one = s.kind === 'oneshot' || !!s.oneShot;
        const f = { low: Math.round(low(b) * 1000) / 1000 };
        res.lib[s.id] = { role: LV.soundRole(s.id) ?? LV.roleOf(s, f), loud: one ? mom(b) : integ(b), peakDb: db(peak(b)), levelDb: db(s.level ?? 1), ...f, cat: s.category, one };
      }
    }
    if (parts.includes('kits')) {
      res.kits = {};
      for (const kit of I.KITS) {
        const rows = {}; for (const r of I.DRUM_ROWS) rows[r.id] = Array(16).fill(0);
        for (const [k, on] of Object.entries(BEAT)) for (const i of on) rows[k][i] = 1;
        if (kit.map) await library.ensureMany(Object.values(kit.map));
        const r = await I.renderPattern({ type: 'drums', name: 'Grundbeat', bars: 1, kit: kit.id, rows }, 120, library);
        res.kits[kit.id] = { role: 'drums', loud: integ(r.buffer), peakDb: db(peak(r.buffer)), levelDb: db(r.level ?? 1) };
      }
    }
    if (parts.includes('klaenge')) {
      res.klaenge = {};
      for (const p of I.allPresets()) {
        const role = p.category === 'bass' ? 'bass' : p.category === 'chords' ? 'chords' : 'synth';
        const notes = role === 'chords'
          ? CHORDS.flatMap((c, j) => c.map((pitch) => ({ pitch, start: j * 4, len: 3.9, vel: 0.9 })))
          : MELODY.map((pitch, i) => ({ pitch: pitch - (role === 'bass' ? 12 : 0), start: i, len: 0.9, vel: 0.9 }));
        if (p.sampled) await I.preparePreset(p.id);
        const r = await I.renderPattern({ type: 'synth', name: 'm', bars: 2, preset: p.id, notes }, 120, library);
        res.klaenge[p.id] = { role, loud: integ(r.buffer), peakDb: db(peak(r.buffer)), levelDb: db(r.level ?? 1) };
      }
    }
    return res;
  }, { parts, ids, BEAT, MELODY, CHORDS });
}

// Mischung eines Starters bzw. des Beispiels (ADR 013, K1/K2/K3/W1): Lautheit je Spur im Refrain (ohne Limiter),
// Refrain so, wie er klingt (Mastering wie gesetzt): Lautheit, Anteil unter 250 Hz / über 2 kHz / über 4 kHz, Breite
// (Seite/(Mitte+Seite)); dazu der Song-Abschnitt `song` ohne Mastering und mit jedem Stil (wie der Export).
// Ergebnis auch: Mastering-Einstellung, Sends und Effekte je Spur (für die Prüfung „nie auf Kick und Bass“).
async function measureMix(page, { id, variant = 0, styles = null, song = 'VC' } = {}) {
  return page.evaluate(async ({ id, variant, styles, song }) => {
    const M = await import('./src/model.js');
    const S = await import('./src/starter.js');
    const E = await import('./src/export.js');
    const MC = await import('./src/dsp/master-core.js');
    const Lo = await import('./src/dsp/loudness.js');
    const F = await import('./src/dsp/fft.js');
    const { store, library, tempo, patterns, renderProject } = window.loopwerk;
    let sections;
    if (id === 'demo') {
      store.replace(M.createDemoProject());
      sections = [{ id: 'V', from: 5, to: 12 }, { id: 'C', from: 13, to: 16 }];
    } else {
      store.replace(M.createEmptyProject());
      sections = (await S.runStarter(id, { store, library, variant })).sections;
    }
    await tempo.apply();
    await patterns.sync(store.project);
    await library.ensureProject(store.project);
    const p0 = structuredClone(store.project);
    const bpb = p0.beatsPerBar;
    const sec = (ids) => { const l = sections.filter((x) => ids.includes(x.id)); return [(Math.min(...l.map((x) => x.from)) - 1) * bpb, Math.max(...l.map((x) => x.to)) * bpb]; };
    const [c0, c1] = sec(['C']);
    const set = p0.master?.mastering ?? { on: false };
    const withStyle = (p, style) => { const q = structuredClone(p); const cur = q.master?.mastering ?? { style: 'balanced' }; q.master = { ...(q.master || {}), mastering: style ? { ...cur, on: true, style } : { ...cur, on: false } }; return q; };
    const decode = async (blob) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(await blob.arrayBuffer());
    const exportRange = async (p, b0, b1, style) => { const q = withStyle(p, style); q.loop = { ...(q.loop || {}), startBeat: b0, endBeat: b1 }; return decode((await E.exportSong(q, library, { format: 'wav', range: 'loop', tail: false })).blob); };
    const lufs = (b) => Lo.integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
    const r1 = (x) => Math.round(x * 10) / 10;
    const [s0, s1] = sec(song.split(''));
    // Spuren im Refrain, ohne Limiter und ohne Mastering
    const tracks = {};
    const dry = withStyle(p0, null);
    for (const t of p0.tracks) {
      if (!t.clips.length) continue;
      const b = await renderProject(dry, library, { fromBeat: c0, toBeat: c1, limiter: false, onlyTrack: t.id });
      tracks[t.name] = r1(lufs(b));
    }
    // Refrain wie gesetzt: Bänder und Breite
    const ref = await exportRange(p0, c0, c1, set.on ? set.style : null);
    const N = 4096, sr = ref.sampleRate, win = F.hann(N);
    const l = ref.getChannelData(0), r = ref.getChannelData(1);
    const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
    let tot = 0, low = 0, hi2 = 0, hi4 = 0, mid = 0, side = 0, midU = 0, sideU = 0;
    for (let s0 = 0; s0 + N <= l.length; s0 += N / 2) {
      for (let i = 0; i < N; i++) { const x = l[s0 + i], y = r[s0 + i]; re[i] = 0.5 * (x + y) * win[i]; im[i] = 0; re2[i] = 0.5 * (x - y) * win[i]; im2[i] = 0; }
      F.fft(re, im); F.fft(re2, im2);
      for (let k = 1; k < N / 2; k++) {
        const f = (k * sr) / N; if (f < 30) continue;
        const pm = re[k] * re[k] + im[k] * im[k], ps = re2[k] * re2[k] + im2[k] * im2[k], e = pm + ps;
        tot += e; mid += pm; side += ps;
        if (f < 250) low += e; else { midU += pm; sideU += ps; } if (f >= 2000) hi2 += e; if (f >= 4000) hi4 += e;
      }
    }
    const pc = (x) => r1((100 * x) / tot);
    const refrain = { lufs: r1(lufs(ref)), low: pc(low), hi2k: pc(hi2), hi4k: pc(hi4), width: Math.round((1000 * side) / (mid + side)) / 1000, widthUp: Math.round((1000 * sideU) / (midU + sideU)) / 1000 };
    // Song-Abschnitt ohne Mastering und mit jedem Stil
    const out = { ohne: r1(lufs(await exportRange(p0, s0, s1, null))) };
    const list = styles === 'set' ? (set.on ? [set.style] : []) : styles ?? MC.MASTER_STYLES.map((x) => x.id);
    for (const st of list) out[st] = r1(lufs(await exportRange(p0, s0, s1, st)));
    const strips = p0.tracks.filter((t) => t.clips.length).map((t) => ({ name: t.name, volume: t.volume, sends: t.sends ?? {}, fx: Object.fromEntries(Object.entries(t.fx || {}).filter(([, v]) => v?.on).map(([k, v]) => [k, v])) }));
    return { tracks, refrain, song: out, mastering: set, strips, range: { refrain: [c0, c1], song: [s0, s1] } };
  }, { id, variant, styles, song });
}

module.exports = { measureAll, measureMix, BEAT, MELODY, CHORDS };
