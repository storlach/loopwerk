// Gemeinsame Messung für tools/klang/pegel.cjs und tests/pegel.test.cjs (ADR 013): Lautheit, Spitze und Rolle je
// Bibliotheks-Sound, je Drum-Kit (Grundbeat) und je Melodie-Klang (Standard-Melodie bzw. -Akkorde).
// Ergebnis je Eintrag: { role, loud, peakDb, levelDb, low } – loud/peakDb so, wie es in einem neuen Projekt klingt
// (Puffer · level); levelDb = Pegel gegen die Spitzen-Normalisierung (sample.level bzw. renderPattern().level).

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
        const L = db(s.level ?? 1); // so klingt es in einem neuen Projekt (Puffer · level, ADR 013)
        res.lib[s.id] = { role: LV.soundRole(s.id) ?? LV.roleOf(s, f), loud: (one ? mom(b) : integ(b)) + L, peakDb: db(peak(b)) + L, levelDb: L, ...f, cat: s.category, one };
      }
    }
    if (parts.includes('kits')) {
      res.kits = {};
      for (const kit of I.KITS) {
        const rows = {}; for (const r of I.DRUM_ROWS) rows[r.id] = Array(16).fill(0);
        for (const [k, on] of Object.entries(BEAT)) for (const i of on) rows[k][i] = 1;
        if (kit.map) await library.ensureMany(Object.values(kit.map));
        const r = await I.renderPattern({ type: 'drums', name: 'Grundbeat', bars: 1, kit: kit.id, rows }, 120, library);
        const L = db(r.level ?? 1);
        res.kits[kit.id] = { role: 'drums', loud: integ(r.buffer) + L, peakDb: db(peak(r.buffer)) + L, levelDb: L };
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
        const L = db(r.level ?? 1);
        res.klaenge[p.id] = { role, loud: integ(r.buffer) + L, peakDb: db(peak(r.buffer)) + L, levelDb: L };
      }
    }
    return res;
  }, { parts, ids, BEAT, MELODY, CHORDS });
}

// Alte Projekte für den Nulltest (ADR 013): im jeweiligen Stand erzeugt (Starter, Beispiel, ein gemischtes Projekt mit
// Fremd-Loops, Einzelklängen, Beat- und Melodie-Patterns, Sampler, Tonartwechsel, Dehnung). Ohne `levels` = vor ADR 013.
async function makeOldProjects(page) {
  return page.evaluate(async () => {
    const { store, library } = window.loopwerk;
    const S = await import('./src/starter.js');
    const M = await import('./src/model.js');
    const out = {};
    const strip = (p) => { const q = JSON.parse(JSON.stringify(p)); delete q.levels; return q; };
    for (const id of ['pop', 'hiphop', 'rock']) { await S.runStarter(id, { store, library }); out[id] = strip(store.project); }
    out.demo = strip(M.createDemoProject());
    const p = M.createEmptyProject({ tracks: 6, bpm: 100 });
    p.name = 'Gemischt';
    p.keyChanges = [{ beat: 16, key: 'Cm' }];
    const row = (on, v = 1) => Array.from({ length: 16 }, (_, i) => (on.includes(i) ? v : 0));
    const rows = (o) => ({ kick: row([]), snare: row([]), clap: row([]), hat: row([]), open: row([]), tomLo: row([]), tomHi: row([]), crash: row([]), ...o });
    p.patterns = {
      b1: { type: 'drums', name: 'Beat', bars: 1, kit: 'elektro', rows: rows({ kick: row([0, 4, 8, 12]), snare: row([4, 12]), hat: row([0, 2, 4, 6, 8, 10, 12, 14], 0.7) }) },
      b2: { type: 'drums', name: 'Akustik', bars: 1, kit: 'akustik', rows: rows({ kick: row([0, 8, 10]), snare: row([4, 12]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]) }) },
      m1: { type: 'synth', name: 'Melodie', bars: 2, preset: 'pluck', notes: [57, 60, 64, 62, 60, 59, 57, 64].map((pitch, i) => ({ pitch, start: i, len: 0.9, vel: 0.9 })) },
      m2: { type: 'synth', name: 'Klavier', bars: 2, preset: 'vc-grand', notes: [[57, 60, 64], [53, 57, 60]].flatMap((c, j) => c.map((pitch) => ({ pitch, start: j * 4, len: 3.9, vel: 0.8 }))) },
    };
    const clip = (n, sampleId, startBeat, lengthBeats, extra = {}) => ({ id: 'c' + n, sampleId, startBeat, lengthBeats, offsetBeats: 0, ...extra });
    p.tracks[0].clips = [clip(1, 'pat-b1', 0, 16), clip(2, 'pat-b2', 16, 16)];
    p.tracks[1].clips = [clip(3, 'sp-loop-amen', 0, 16), clip(4, 'sp-bd-808', 16, 2), clip(5, 'vc-kick-3', 20, 2)];
    p.tracks[2].clips = [clip(6, 'gen-hiphop-bass', 0, 32)];
    p.tracks[3].clips = [clip(7, 'pat-m1', 0, 16), clip(8, 'pat-m2', 16, 16)];
    p.tracks[4].clips = [clip(9, 'chords-pad', 0, 16, { gain: 0.7, fadeInBeats: 4 }), clip(10, 'gtr-pop-strum', 16, 16, { stretch: 2 })];
    p.tracks[5].clips = [clip(11, 'fx-riser', 8, 8), clip(12, 'sp-ambi-swoosh', 24, 4), clip(13, 'kf-gretsch-a2', 28, 4)];
    p.tracks[2].volume = 0.7;
    out.gemischt = strip(p);
    return out;
  });
}

// Projekt rendern und messen: Effektivwert je 100 ms (dB, je Kanal) der Summe ohne Limiter und integrierte Lautheit je Spur
async function measureProject(page, project, { fromBeat = 0, toBeat = 64 } = {}) {
  return page.evaluate(async ({ project, fromBeat, toBeat }) => {
    const { library, renderProject, patterns } = window.loopwerk;
    const Lo = await import('./src/dsp/loudness.js');
    await patterns.sync(project);
    await library.ensureProject(project);
    project.master = { ...(project.master || {}), mastering: { ...(project.master?.mastering || {}), on: false } };
    const end = Math.min(toBeat, project.lengthBars * project.beatsPerBar);
    const opts = { fromBeat, toBeat: end, limiter: false };
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
    const sum = await renderProject(project, library, opts);
    const step = Math.round(0.1 * sum.sampleRate);
    const blocks = [];
    for (let c = 0; c < 2; c++) {
      const d = sum.getChannelData(c);
      for (let a = 0; a + step <= d.length; a += step) { let e = 0; for (let i = a; i < a + step; i++) e += d[i] * d[i]; blocks.push(Math.round(db(Math.sqrt(e / step)) * 1000) / 1000); }
    }
    const tracks = {};
    for (const t of project.tracks) {
      if (!t.clips.length) continue;
      const b = await renderProject(project, library, { ...opts, onlyTrack: t.id });
      const v = Lo.integratedLoudness([b.getChannelData(0), b.getChannelData(1)], b.sampleRate);
      tracks[t.name + ' ' + t.id] = Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
    }
    return { blocks, tracks };
  }, { project, fromBeat, toBeat });
}

module.exports = { measureAll, makeOldProjects, measureProject, BEAT, MELODY, CHORDS };
