// „Druck“ für Beats und Bass: Kick-Regler am Beat-Pattern (Tonhöhe, Länge, Klick, Biss), Kit „Techno (Druck)“,
// Rollbass mit Bass-Mustern, Song-Starter „Melodic Techno“. Klang offline gemessen, Oberfläche Desktop und Handy.
// node tests/druck.test.cjs [--shots]   (SHOT_DIR=… für die Bilder, WAV_DIR=… für Hörproben)
const fs = require('fs');
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const WAV_DIR = process.env.WAV_DIR || '';
const { check, finish } = createChecker();
const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'druck-old-patterns.json'), 'utf8')).patterns;
const db = (x) => 10 * Math.log10(x);

// Im Browser: Messhelfer
function helpers() {
  const sr = 44100;
  // Energie in einem Band (je zwei Hoch- und Tiefpässe, offline gerechnet) zwischen t0 und t1 (s)
  window.__band = async (buf, lo, hi, t0 = 0, t1 = buf.duration) => {
    const ctx = new OfflineAudioContext(1, buf.length, sr);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    let node = s;
    for (const [type, f] of [['highpass', lo], ['highpass', lo], ['lowpass', hi], ['lowpass', hi]]) {
      if (!f) continue;
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f;
      node = node.connect(b);
    }
    node.connect(ctx.destination);
    s.start();
    const d = (await ctx.startRendering()).getChannelData(0);
    let e = 0;
    for (let i = Math.round(t0 * sr); i < Math.min(d.length, Math.round(t1 * sr)); i++) e += d[i] * d[i];
    return e / sr;
  };
  // Grundfrequenz über Nulldurchgänge (aufwärts) zwischen t0 und t1
  window.__zc = (d, t0, t1) => {
    let n = 0; let first = -1; let last = -1;
    for (let i = Math.max(1, Math.round(t0 * sr)); i < Math.round(t1 * sr); i++) if (d[i - 1] < 0 && d[i] >= 0) { n++; if (first < 0) first = i; last = i; }
    return n > 1 ? ((n - 1) * sr) / (last - first) : 0;
  };
  window.__peak = (buf) => { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) for (const x of buf.getChannelData(c)) p = Math.max(p, Math.abs(x)); return p; };
  window.__lastAbove = (d, thr) => { let e = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) e = i; return e / sr; };
  window.__rms = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
  // Tiefpass (zweimal 2. Ordnung), offline: lässt vom Bass den Sub übrig
  window.__lowpass = async (buf, f) => {
    const ctx = new OfflineAudioContext(1, buf.length, sr);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const a = ctx.createBiquadFilter(); a.type = 'lowpass'; a.frequency.value = f;
    const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f;
    s.connect(a).connect(b).connect(ctx.destination);
    s.start();
    return (await ctx.startRendering()).getChannelData(0);
  };
  // Tonklasse (C = 0) aus dem Median der Frequenzen je Note (Nulldurchgänge im gefilterten Sub)
  window.__pitchClassOf = (d, windows) => {
    const fs = windows.map(([t0, t1]) => window.__zc(d, t0, t1)).filter((f) => f > 20).sort((x, y) => x - y);
    const f = fs[Math.floor(fs.length / 2)];
    return { pc: ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12, f };
  };
  window.__oneKick = (kit, kick, vel = 1) => {
    const rows = {};
    for (const id of ['kick', 'snare', 'clap', 'hat', 'open', 'tomLo', 'tomHi', 'crash']) rows[id] = Array(16).fill(0);
    rows.kick[0] = vel;
    return { type: 'drums', name: 'K', bars: 1, kit, rows, ...(kick ? { kick } : {}) };
  };
  window.__wav = async (buf) => {
    const { encodeWav } = await import('./src/wav.js');
    const bytes = new Uint8Array(await encodeWav(buf, { bits: 16 }).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
}
const saveWav = (name, b64) => { if (WAV_DIR && b64) { fs.mkdirSync(WAV_DIR, { recursive: true }); fs.writeFileSync(path.join(WAV_DIR, name), Buffer.from(b64, 'base64')); } };

async function openBeat(page) {
  await page.evaluate(() => window.loopwerk.ui.setDock(null));
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.ccard[data-create="beat"]').click());
  await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern', null, { timeout: 5000 });
  await page.waitForTimeout(600);
}

(async () => {
  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let { page } = app;
  try {
    await page.evaluate(helpers);

    // ---------- Kick: Sub-Energie, Tonhöhe, Länge, Biss, Klick (offline, 60 BPM: ein Takt = 4 s) ----------
    const k = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const { library } = window.loopwerk;
      await library.ensureMany(['sp-bd-haus']);
      const render = async (kit, kick, vel) => (await I.renderPattern(window.__oneKick(kit, kick, vel), 60, library)).buffer;
      const out = { sub: {}, pitch: [], len: {}, bite: {}, click: {}, wav: {} };
      for (const kit of ['elektro', 'techno', 'druck']) {
        const b = await render(kit);
        out.sub[kit] = await window.__band(b, 40, 80, 0, 0.9);
        out.wav[kit] = await window.__wav(b);
      }
      out.defaults = I.kickDefaults('druck');
      // Tonhöhe: Ausklang 0,15–0,4 s (nach dem Abwärtsschlag) je Kit, auch am Rand des Bereichs
      for (const kit of ['druck', 'elektro', 'techno']) {
        for (const want of [I.midiToHz(28), 49, 55, I.midiToHz(37)]) {
          const b = await render(kit, { ...I.kickDefaults(kit), pitch: want, length: 0.9 });
          out.pitch.push({ kit, want, got: window.__zc(b.getChannelData(0), 0.15, 0.4) });
        }
      }
      // Sample-Kick (Akustik): Tonhöhe über playbackRate – gleiche Stelle im Sample, Frequenz im Verhältnis der Einstellung
      const ref = await render('akustik', { ...I.kickDefaults('akustik', library) });
      const low = await render('akustik', { ...I.kickDefaults('akustik', library), pitch: 45, length: 0.4 });
      const rate = 45 / I.KITS.find((x) => x.id === 'akustik').kickHz;
      out.sample = { ref: window.__zc(ref.getChannelData(0), 0.04, 0.15), low: window.__zc(low.getChannelData(0), 0.04 / rate, 0.15 / rate), rate };
      // Länge: letzte Stelle über −60 dBFS
      for (const L of [0.2, 0.5, 1.2]) out.len[L] = window.__lastAbove((await render('druck', { ...I.kickDefaults('druck'), length: L })).getChannelData(0), 0.001);
      const sl = await render('akustik', { ...I.kickDefaults('akustik', library), length: 0.15 });
      out.len.sample = window.__lastAbove(sl.getChannelData(0), 0.001);
      out.len.sampleFull = window.__lastAbove(ref.getChannelData(0), 0.001);
      // Biss: Spitze und Obertöne (100–400 Hz) gegenüber dem Grundton; volles 4/4 mit Klick und Biss auf Anschlag 1
      for (const bite of [0, 0.5, 1]) {
        const b = await render('druck', { ...I.kickDefaults('druck'), click: 1, bite });
        out.bite[bite] = { peak: window.__peak(b), harm: await window.__band(b, 110, 400, 0.1, 0.6), fund: await window.__band(b, 35, 70, 0.1, 0.6) };
      }
      const rows = {};
      for (const r of I.DRUM_ROWS) rows[r.id] = Array(16).fill(0);
      rows.kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0];
      const loud = await I.renderPattern({ type: 'drums', name: 'L', bars: 1, kit: 'druck', rows, kick: { pitch: 41.2, length: 1.5, click: 1, bite: 1 } }, 124, library);
      out.bite.loud = window.__peak(loud.buffer);
      const sb = await render('akustik', { ...I.kickDefaults('akustik', library), click: 1, bite: 1 });
      out.bite.sample = window.__peak(sb);
      out.bite.sample0 = window.__peak(ref);
      // Klick: Energie über 2 kHz in den ersten 15 ms
      for (const click of [0, 1]) out.click[click] = await window.__band(await render('druck', { ...I.kickDefaults('druck'), click }), 2000, 0, 0, 0.015);
      return out;
    });
    saveWav('kick-alt-elektro.wav', k.wav.elektro);
    saveWav('kick-alt-909.wav', k.wav.techno);
    saveWav('kick-techno-druck.wav', k.wav.druck);
    // Bezug „heutige Kick“ = Stand vor „Druck“: Die Elektro-Kick hat seit „Klangfarbe“ (2026-11) selbst mehr Sub, ihr alter
    // Wert (3,69·10⁻³, gemessen mit fd0406f) bleibt der Bezug; die neue Elektro-Kick steht nur zur Information daneben.
    const ELEKTRO_SUB_ALT = 3.69e-3;
    const subGain = db(k.sub.druck / ELEKTRO_SUB_ALT);
    const subGain909 = db(k.sub.druck / k.sub.techno);
    check('Techno-Kick: Sub-Energie 40–80 Hz über 0,9 s deutlich über der heutigen Kick (≥ +6 dB)', subGain >= 6 && subGain909 >= 6,
      `Druck ${k.sub.druck.toExponential(2)}, Elektro vor „Druck“ ${ELEKTRO_SUB_ALT.toExponential(2)} (+${subGain.toFixed(1)} dB), 909 ${k.sub.techno.toExponential(2)} (+${subGain909.toFixed(1)} dB), Elektro jetzt ${k.sub.elektro.toExponential(2)} (+${db(k.sub.druck / k.sub.elektro).toFixed(1)} dB)`);
    check('Techno-Kick: Voreinstellung um 50 Hz, Länge etwa 0,9 s, deutlicher Klick, etwas Biss', Math.abs(k.defaults.pitch - 50) <= 2 && Math.abs(k.defaults.length - 0.9) < 0.05 && k.defaults.click >= 0.5 && k.defaults.bite > 0 && k.defaults.bite < 0.6, JSON.stringify(k.defaults));
    const offPitch = k.pitch.filter((p) => Math.abs(p.got / p.want - 1) > 0.03);
    check('Tonhöhen-Regler trifft die Frequenz (±3 %) – Druck, Elektro, 909', !offPitch.length, k.pitch.map((p) => `${p.kit} ${p.want.toFixed(1)}→${p.got.toFixed(1)}`).join(', '));
    check('Sample-Kick: Tonhöhe über playbackRate (±3 %)', Math.abs(k.sample.low / (k.sample.ref * k.sample.rate) - 1) < 0.03, `ref ${k.sample.ref.toFixed(1)} Hz, 45 Hz eingestellt → ${k.sample.low.toFixed(1)} Hz (Soll ${(k.sample.ref * k.sample.rate).toFixed(1)})`);
    check('Länge wirkt: Ausklang endet bei der eingestellten Länge (±15 %)', [0.2, 0.5, 1.2].every((L) => Math.abs(k.len[L] / L - 1) < 0.15) && k.len[1.2] > k.len[0.2] * 4,
      [0.2, 0.5, 1.2].map((L) => `${L} s → ${k.len[L].toFixed(3)} s`).join(', '));
    check('Länge am Sample: Fade kürzt (0,15 s)', k.len.sample <= 0.155 && k.len.sampleFull > 0.2, `${k.len.sample.toFixed(3)} s statt ${k.len.sampleFull.toFixed(3)} s`);
    const harm = (b) => db(b.harm / b.fund);
    check('Biss: mehr Obertöne (100–400 Hz gegenüber Grundton)', harm(k.bite[1]) > harm(k.bite[0]) + 6, `Biss 0: ${harm(k.bite[0]).toFixed(1)} dB, 0,5: ${harm(k.bite[0.5]).toFixed(1)} dB, 1: ${harm(k.bite[1]).toFixed(1)} dB`);
    check('Biss hebt die Spitze nicht (≤ ohne Biss, < 0 dBFS)', k.bite[1].peak <= k.bite[0].peak + 1e-3 && k.bite[0.5].peak <= k.bite[0].peak + 1e-3 && k.bite.loud < 1 && k.bite.sample < 1 && k.bite.sample <= k.bite.sample0 + 1e-3,
      `Spitze Biss 0/0,5/1: ${[0, 0.5, 1].map((b) => k.bite[b].peak.toFixed(3)).join('/')}, volles 4/4 (Klick 1, Biss 1, 1,5 s): ${k.bite.loud.toFixed(3)}, Sample ${k.bite.sample0.toFixed(3)}→${k.bite.sample.toFixed(3)}`);
    check('Klick: heller Anschlag (Energie über 2 kHz in 15 ms, ≥ +10 dB)', db(k.click[1] / Math.max(1e-12, k.click[0])) >= 10, `${db(k.click[1] / Math.max(1e-12, k.click[0])).toFixed(1)} dB`);

    // ---------- Alte Patterns: gleicher Klang wie vor „Druck“ ----------
    // Bezug: Block-RMS (64 Blöcke je Kanal) aus dem Stand vor der Änderung. Chromium summiert gleichzeitige Stimmen nicht
    // immer in derselben Reihenfolge (±3·10⁻⁷ zwischen zwei Renderings desselben Codes), daher relativ 10⁻⁵.
    const old = await page.evaluate(async (ref) => {
      const I = await import('./src/instruments.js');
      const { library } = window.loopwerk;
      await library.ensureMany(['sp-bd-haus', 'sp-drum-snare-hard', 'sp-perc-snap', 'sp-drum-cymbal-closed', 'sp-drum-cymbal-open', 'sp-drum-tom-lo-hard', 'sp-drum-tom-mid-hard', 'sp-drum-cymbal-hard']);
      const N = 64;
      const fp = (buf) => [0, 1].map((c) => { const d = buf.getChannelData(c); const per = Math.floor(d.length / N); return Array.from({ length: N }, (_, j) => { let s = 0; for (let i = j * per; i < (j + 1) * per; i++) s += d[i] * d[i]; return Math.sqrt(s / per); }); });
      const dev = (a, b) => { let m = 0; for (let c = 0; c < 2; c++) for (let j = 0; j < N; j++) m = Math.max(m, Math.abs(a[c][j] - b[c][j]) / Math.max(1e-6, b[c][j])); return m; };
      const out = {};
      for (const [name, r] of Object.entries(ref)) out[name] = dev(fp((await I.renderPattern(r.pattern, 124, library)).buffer), r.fp);
      // Gegenprobe: dasselbe Pattern mit Kick-Feld (Werte wie das Kit) weicht ab
      out.withField = dev(fp((await I.renderPattern({ ...ref.elektro.pattern, kick: I.kickDefaults('elektro') }, 124, library)).buffer), ref.elektro.fp);
      return out;
    }, OLD);
    const same = Object.entries(old).filter(([n]) => n !== 'withField');
    check('Alte Patterns ohne Kick-Feld klingen wie vorher (Elektro, 909, Akustik, neuer Beat, Bass)', same.every(([, d]) => d < 1e-5), same.map(([n, d]) => `${n} ${d.toExponential(1)}`).join(', '));
    check('Gegenprobe: mit Kick-Feld hörbar anders (Messung greift)', old.withField > 1e-3, old.withField.toExponential(2));

    // ---------- Kit „Techno (Druck)“ und Rollbass ----------
    const kit = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const { library } = window.loopwerk;
      const rows = {};
      for (const r of I.DRUM_ROWS) rows[r.id] = Array(16).fill(0);
      const hits = {};
      for (const id of ['hat', 'open', 'clap', 'snare']) {
        const p = { type: 'drums', name: 'D', bars: 1, kit: 'druck', rows: { ...rows, [id]: [1, ...Array(15).fill(0)] } };
        const b = (await I.renderPattern(p, 60, library)).buffer;
        hits[id] = { hi: await window.__band(b, 4000, 0, 0, 0.5), lo: await window.__band(b, 0, 150, 0, 0.5), end: window.__lastAbove(b.getChannelData(0), 0.003), peak: window.__peak(b) };
      }
      const bassP = { type: 'synth', name: 'B', bars: 1, preset: 'rollbass', notes: I.bassTemplateNotes('roll', 9, 1) };
      const bb = (await I.renderPattern(bassP, 124, library)).buffer;
      const L = bb.getChannelData(0); const R = bb.getChannelData(1);
      let side = 0; for (let i = 0; i < L.length; i++) side = Math.max(side, Math.abs(L[i] - R[i]));
      return {
        kits: I.KITS.map((x) => x.id), label: I.drumLabel('druck', 'snare'), hits, side, preset: I.presetInfo('rollbass'),
        tpl: { off: I.bassTemplateNotes('offbeat', 9, 1).map((n) => n.start), roll: I.bassTemplateNotes('roll', 0, 1).map((n) => `${n.pitch}@${n.start}`) },
        newBeat: I.newDrumPattern(1).kit,
      };
    });
    check('Kit „Techno (Druck)“ wählbar, Voreinstellung neuer Beats bleibt Elektro', kit.kits.includes('druck') && kit.newBeat === 'elektro' && kit.label === 'Rim', `${kit.kits.join(',')} · neu: ${kit.newBeat}`);
    const h = kit.hits;
    check('Druck-Kit: Hats hell und knapp (geschlossen < 0,1 s, offen < Viertel bei 124 BPM), Clap und Rim klingen', h.hat.hi > 50 * h.hat.lo && h.hat.end < 0.1 && h.open.end > h.hat.end && h.open.end < 0.45 && h.clap.peak > 0.1 && h.snare.peak > 0.05,
      Object.entries(h).map(([id, x]) => `${id} Ende ${x.end.toFixed(3)} s, Spitze ${x.peak.toFixed(2)}`).join('; '));
    check('Rollbass: Bass-Klang, mono', kit.preset?.category === 'bass' && kit.preset.label === 'Rollbass' && kit.side < 1e-6, `L−R max ${kit.side}`);
    check('Bass-Muster: Offbeat auf den Achteln dazwischen, rollend drei Sechzehntel je Schlag ohne Viertel', kit.tpl.off.join() === '0.5,1.5,2.5,3.5' && kit.tpl.roll.join(' ') === '36@0.25 36@0.5 36@0.75 36@1.25 36@1.5 36@1.75 36@2.25 36@2.5 36@2.75 36@3.25 36@3.5 36@3.75', `${kit.tpl.off.join()} / ${kit.tpl.roll.slice(0, 4).join(' ')} …`);

    // Bass im Grundton der Tonart, Tonart je Takt (Am, ab Takt 3 Dm), Platz auf den Vierteln
    const bass = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const I = await import('./src/instruments.js');
      const { store, library, renderProject, patterns, tempo } = window.loopwerk;
      const out = {};
      for (const key of ['Am', 'Fm']) {
        store.replace(M.createEmptyProject());
        store.setKey(key);
        store.setBpm(124);
        await tempo.apply();
        const tonic = M.tonicOf(M.keyOf(store.project));
        const pid = store.addPattern({ type: 'synth', name: 'Roll', bars: 1, preset: 'rollbass', notes: I.bassTemplateNotes('roll', tonic, 1) });
        await patterns.sync(store.project);
        store.setLength(8);
        store.addClip('t1', 'pat-' + pid, 0, 16);
        store.setKeyAt(3, key === 'Am' ? 'Dm' : 'Cm');
        await library.ensureProject?.(store.project);
        const buf = await renderProject(store.project, library, { limiter: false, toBeat: 16 });
        const d = buf.getChannelData(0);
        const spb = 60 / 124; const sr = 44100;
        const at = (beat) => Math.round(beat * spb * sr);
        // Ruhe auf den Vierteln (erste 0,12 Schläge) gegenüber den Sechzehnteln (0,25–0,45)
        let quiet = 0; let loud = 0;
        for (let b = 1; b < 8; b++) { quiet += window.__rms(d, at(b), at(b + 0.12)); loud += window.__rms(d, at(b + 0.27), at(b + 0.43)); }
        const sub = await window.__lowpass(buf, 90);
        const notes = (b0, b1) => { const w = []; for (let b = b0; b < b1; b++) for (const s of [0.25, 0.5, 0.75]) w.push([(b + s + 0.03) * spb, (b + s + 0.17) * spb]); return w; };
        const p1 = window.__pitchClassOf(sub, notes(0, 8));
        const p3 = window.__pitchClassOf(sub, notes(8, 16));
        out[key] = { pc1: p1.pc, f1: p1.f, pc3: p3.pc, f3: p3.f, tonic, gap: 20 * Math.log10(quiet / loud) };
      }
      return out;
    });
    check('Bass liegt im Grundton der Tonart (Am → A, Fm → F)', bass.Am.pc1 === 9 && bass.Fm.pc1 === 5, `Am: ${bass.Am.f1.toFixed(1)} Hz (Tonklasse ${bass.Am.pc1}), Fm: ${bass.Fm.f1.toFixed(1)} Hz (${bass.Fm.pc1}); C = 0`);
    check('Tonart je Takt: ab Takt 3 Dm bzw. Cm → Bass auf D bzw. C', bass.Am.pc3 === 2 && bass.Fm.pc3 === 0, `Am→Dm: ${bass.Am.f3.toFixed(1)} Hz (${bass.Am.pc3}), Fm→Cm: ${bass.Fm.f3.toFixed(1)} Hz (${bass.Fm.pc3})`);
    check('Bass lässt auf den Vierteln Platz für die Kick (≥ 20 dB leiser)', bass.Am.gap <= -20 && bass.Fm.gap <= -20, `${bass.Am.gap.toFixed(1)} dB / ${bass.Fm.gap.toFixed(1)} dB`);

    // ---------- Song-Starter „Melodic Techno“ ----------
    const st = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const S = await import('./src/starter.js');
      const MC = await import('./src/dsp/master-core.js');
      const { store, library } = window.loopwerk;
      store.replace(M.createDemoProject());
      const u0 = store.undoStack.length;
      const r = await S.runStarter('melodic', { store, library });
      const p = store.project;
      const by = (n) => p.tracks.find((t) => t.name === n);
      const fxOn = (t, id) => !!t?.fx?.[id]?.on;
      const hz = (t) => (fxOn(t, 'filter') && t.fx.filter.type === 'highpass' ? Math.round(40 * 2 ** (t.fx.filter.cutoff * 8.81)) : 0);
      const kickPat = Object.values(p.patterns).find((x) => x.name === 'Techno-Kick');
      const bassPat = Object.values(p.patterns).find((x) => x.preset === 'rollbass');
      const lane = p.master?.automation?.['filter.cutoff'] ?? [];
      return {
        skipped: r.skipped.length, steps: store.undoStack.length - u0, bpm: p.bpm, key: M.keyOf(p), bars: p.lengthBars,
        names: p.tracks.map((t) => t.name),
        dry: ['Kick', 'Bass'].map((n) => ({ n, sends: by(n)?.sends ?? null, hall: fxOn(by(n), 'hall'), echo: fxOn(by(n), 'echo'), hp: hz(by(n)) })),
        hp: ['Drums', 'Akkorde', 'Melodie', 'FX'].map((n) => [n, hz(by(n))]),
        pump: { bass: fxOn(by('Bass'), 'pump'), pad: fxOn(by('Akkorde'), 'pump') },
        sends: { pad: by('Akkorde')?.sends, lead: by('Melodie')?.sends },
        kick: { kit: kickPat?.kit, kick: kickPat?.kick, row: kickPat?.rows.kick.join(''), first: Math.min(...by('Kick').clips.map((c) => c.startBeat)) },
        hats: Object.values(p.patterns).find((x) => x.name === 'Offbeat-Hats')?.rows,
        bass: { preset: bassPat?.preset, follow: bassPat?.follow, pitches: [...new Set(bassPat?.notes.map((n) => n.pitch))] },
        lane, mfilter: p.master?.fx?.filter, mastering: p.master?.mastering, hasClub: MC.MASTER_STYLES.some((x) => x.id === 'club'),
        sections: r.sections.map((x) => `${x.label} ${x.from}–${x.to}`).join(', '),
      };
    });
    if (SHOTS) {
      await page.evaluate(() => { const { arranger, engine } = window.loopwerk; engine.setPosition(0); document.getElementById('arr-scroll').scrollLeft = 0; arranger.render(); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOT_DIR, 'druck-desktop-starter.png') });
    }
    check('Starter: ein Schritt, nichts übersprungen, 124 BPM, Moll', st.skipped === 0 && st.steps === 1 && st.bpm === 124 && /m$/.test(st.key), `${st.bpm} BPM ${st.key}, ${st.bars} Takte: ${st.sections}`);
    check('Starter: Spuren Kick, Drums, Bass, Akkorde, Melodie, FX', ['Kick', 'Drums', 'Bass', 'Akkorde', 'Melodie', 'FX'].every((n) => st.names.includes(n)), st.names.join(', '));
    check('Starter: kein Hall (und kein Echo, kein Hochpass) auf Kick und Bass', st.dry.every((x) => !x.sends && !x.hall && !x.echo && !x.hp), JSON.stringify(st.dry));
    check('Starter: alles außer Kick und Bass mit Hochpass (Fläche um 200 Hz)', st.hp.every(([, f]) => f >= 120) && Math.abs(st.hp.find(([n]) => n === 'Akkorde')[1] - 200) <= 10, st.hp.map(([n, f]) => `${n} ${f} Hz`).join(', '));
    check('Starter: Pumpen auf Rollbass und Fläche, Hall/Echo-Send auf Fläche und Arp', st.pump.bass && st.pump.pad && st.sends.pad?.hall > 0 && st.sends.lead?.hall > 0 && st.sends.lead?.echo > 0, JSON.stringify({ pump: st.pump, sends: st.sends }));
    check('Starter: Techno-Kick 4/4, Kit Druck, lang (≥ 0,8 s), auf A gestimmt, setzt nach 8 Takten Aufbau ein', st.kick.kit === 'druck' && st.kick.row === '1000100010001000' && st.kick.kick.length >= 0.8 && Math.abs(st.kick.kick.pitch - 55) < 0.5 && st.kick.first === 32, JSON.stringify(st.kick));
    check('Starter: Offbeat-Hat und Clap auf 2 und 4', st.hats.open.map((x, i) => (x ? i : -1)).filter((i) => i >= 0).join() === '2,6,10,14' && st.hats.clap.map((x, i) => (x ? i : -1)).filter((i) => i >= 0).join() === '4,12');
    check('Starter: Rollbass im Grundton (A), folgt den Akkorden', st.bass.preset === 'rollbass' && st.bass.follow && st.bass.pitches.join() === '45', JSON.stringify(st.bass));
    check('Starter: Aufbau – Tiefpass der Summe geht in 8 Takten auf (Kurve), danach offen', st.lane.length === 2 && st.lane[0].beat === 0 && st.lane[0].value < 0.5 && st.lane[1].beat === 32 && st.lane[1].value === 1 && st.mfilter?.on && st.mfilter.type === 'lowpass' && st.mfilter.reso === 0, JSON.stringify({ lane: st.lane, f: st.mfilter }));
    check(`Starter: Mastering an, Stil ${st.hasClub ? '„Club“' : '„Laut“ (Club gibt es noch nicht)'}`, st.mastering?.on && st.mastering.style === (st.hasClub ? 'club' : 'loud'), JSON.stringify(st.mastering));

    // Starter klingt: Takte 1–16 gerendert (mit Mastering). Kick erst ab Takt 9, Filter geht auf.
    const mix = await page.evaluate(async () => {
      const { store, library, renderProject, tempo, patterns } = window.loopwerk;
      await tempo.apply();
      await patterns.sync(store.project);
      await library.ensureProject(store.project);
      const buf = await renderProject(store.project, library, { fromBeat: 0, toBeat: 64 });
      const spb = 60 / store.project.bpm; const sr = 44100;
      const bar = (b) => [(b - 1) * 4 * spb, b * 4 * spb];
      // Tiefe auf den Vierteln (erste 0,15 Schläge, dort ruht der Bass): ohne Kick leise, mit Kick laut
      const onBeats = async (b0, b1) => { let e = 0; for (let b = (b0 - 1) * 4; b < b1 * 4; b++) e += await window.__band(buf, 35, 90, b * spb, (b + 0.15) * spb); return e; };
      const out = {
        intro: await onBeats(5, 8), drop: await onBeats(9, 12),
        hi1: await window.__band(buf, 3000, 0, ...bar(1)), hi7: await window.__band(buf, 3000, 0, ...bar(7)), hi10: await window.__band(buf, 3000, 0, ...bar(10)),
        peak: window.__peak(buf), nan: [...buf.getChannelData(0)].some((x) => Number.isNaN(x)),
        rms: window.__rms(buf.getChannelData(0), Math.round(bar(9)[0] * sr), Math.round(bar(16)[1] * sr)),
        wav: await window.__wav(buf),
      };
      // Bass-Spur allein (Takte 1–4: Am, dann F): Grundton folgt dem Akkord-Streifen
      const bassId = store.project.tracks.find((t) => t.name === 'Bass').id;
      const stem = await renderProject(store.project, library, { fromBeat: 0, toBeat: 16, onlyTrack: bassId, limiter: false });
      const sub = await window.__lowpass(stem, 90);
      const notes = (b0, b1) => { const w = []; for (let b = b0; b < b1; b++) for (const s of [0.25, 0.5, 0.75]) w.push([(b + s + 0.03) * spb, (b + s + 0.17) * spb]); return w; };
      out.bassI = window.__pitchClassOf(sub, notes(0, 8));
      out.bassVI = window.__pitchClassOf(sub, notes(8, 16));
      return out;
    });
    saveWav('starter-melodic-techno-16-takte.wav', mix.wav);
    check('Starter-Mix: Kick setzt mit Takt 9 ein (Tiefe auf den Vierteln ≥ +12 dB)', db(mix.drop / mix.intro) >= 12, `Takte 5–8 ${mix.intro.toExponential(2)}, 9–12 ${mix.drop.toExponential(2)} (+${db(mix.drop / mix.intro).toFixed(1)} dB)`);
    check('Starter-Mix: Filter geht im Aufbau auf (Höhen Takt 7 ≥ +12 dB über Takt 1, Takt 10 offen)', db(mix.hi7 / mix.hi1) >= 12 && mix.hi10 >= mix.hi7 * 0.5, `Höhen über 3 kHz: Takt 1 ${mix.hi1.toExponential(2)}, Takt 7 ${mix.hi7.toExponential(2)}, Takt 10 ${mix.hi10.toExponential(2)}`);
    check('Starter: Rollbass klingt im Grundton A (Takte 1–2, Am) und folgt dem Streifen (Takte 3–4, F)', mix.bassI.pc === 9 && mix.bassVI.pc === 5, `${mix.bassI.f.toFixed(1)} Hz / ${mix.bassVI.f.toFixed(1)} Hz`);
    check('Starter-Mix: laut, ohne Übersteuerung', mix.rms > 0.08 && mix.peak <= 1.0 && !mix.nan, `RMS Takte 9–16 ${mix.rms.toFixed(3)} (${(20 * Math.log10(mix.rms)).toFixed(1)} dBFS), Spitze ${mix.peak.toFixed(3)}`);

    // ---------- Oberfläche Desktop: Zeile „Kick“, ein Schritt je Ziehen, sofort hörbar ----------
    await page.evaluate(async () => { const M = await import('./src/model.js'); window.loopwerk.store.replace(M.createEmptyProject()); });
    await openBeat(page);
    const ui0 = await page.evaluate(() => ({ btn: !document.getElementById('pat-kick-btn').hidden && !!document.getElementById('pat-kick-btn').offsetParent, row: document.getElementById('pat-kick').hidden }));
    check('Desktop: Knopf „Kick“ im Kopf des Beat-Editors, Zeile zu', ui0.btn && ui0.row, JSON.stringify(ui0));
    await page.click('#pat-kick-btn');
    await page.waitForTimeout(200);
    const ui1 = await page.evaluate(() => {
      const row = document.getElementById('pat-kick');
      const ins = [...row.querySelectorAll('input[type="range"]')];
      const cs = getComputedStyle(ins[0]);
      return {
        open: !row.hidden, n: ins.length, pressed: document.getElementById('pat-kick-btn').getAttribute('aria-expanded'),
        pitch: document.getElementById('pat-kick-pitch-out').textContent, len: document.getElementById('pat-kick-length-out').textContent,
        accent: cs.accentColor, frames: getComputedStyle(row).borderTopStyle,
      };
    });
    check('Desktop: ein Klick öffnet die Zeile mit vier Reglern (Tonhöhe als Note)', ui1.open && ui1.n === 4 && ui1.pressed === 'true' && /^F♯1 · 46 Hz$/.test(ui1.pitch) && /0,42 s/.test(ui1.len), JSON.stringify(ui1));
    // Anhören im Loop, dann Länge ziehen
    await page.click('#pat-play');
    await page.waitForTimeout(600);
    const pv0 = await page.evaluate(() => { const lw = window.loopwerk; const id = 'pat-' + lw.patternEditor.id; return { rev: lw.library.get(id).rev, pv: lw.engine.preview?.rev, sid: lw.engine.preview?.sampleId === id, u: lw.store.undoStack.length }; });
    const box = await page.locator('#pat-kick-length').boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(box.x + box.width * (0.2 + i * 0.06), box.y + box.height / 2); await page.waitForTimeout(40); }
    await page.mouse.up();
    await page.waitForFunction((r) => { const lw = window.loopwerk; const s = lw.library.get('pat-' + lw.patternEditor.id); return s.rev !== r && lw.engine.preview?.rev === s.rev; }, pv0.rev, { timeout: 8000 }).catch(() => {});
    const pv1 = await page.evaluate(() => {
      const lw = window.loopwerk; const id = 'pat-' + lw.patternEditor.id;
      return { rev: lw.library.get(id).rev, pv: lw.engine.preview?.rev, kick: lw.store.project.patterns[lw.patternEditor.id].kick, u: lw.store.undoStack.length, out: document.getElementById('pat-kick-length-out').textContent };
    });
    check('Ziehen an „Länge“: ein Rückgängig-Schritt, Wert am Pattern', pv1.u === pv0.u + 1 && pv1.kick && pv1.kick.length > 0.8, JSON.stringify(pv1));
    check('Sofort hörbar: Pattern neu gerendert, Anhören läuft mit dem neuen Klang weiter', pv0.sid && pv1.rev !== pv0.rev && pv1.pv === pv1.rev, `rev ${pv0.rev} → ${pv1.rev}, Anhören ${pv1.pv}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'druck-desktop-kick.png') });
    await page.click('#pat-play');
    // Tonhöhe per Tastatur: ein Halbton je Pfeil
    await page.focus('#pat-kick-pitch');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const kb = await page.evaluate(() => ({ kick: window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].kick, out: document.getElementById('pat-kick-pitch-out').textContent }));
    check('Tonhöhe: Pfeil rechts = ein Halbton höher (G1 · 49 Hz)', Math.abs(kb.kick.pitch - 49) < 0.05 && kb.out === 'G1 · 49 Hz', JSON.stringify(kb));
    const undo = await page.evaluate(() => { const lw = window.loopwerk; lw.store.undo(); lw.store.undo(); return { kick: lw.store.project.patterns[lw.patternEditor.id].kick ?? null, out: document.getElementById('pat-kick-length-out').textContent }; });
    check('Zweimal Rückgängig: Pattern ohne Kick-Feld, Regler wieder wie das Kit', undo.kick === null && undo.out === '0,42 s', JSON.stringify(undo));
    // Kit wechseln: Druck zeigt seine Voreinstellung; „Wie das Kit“ entfernt das Feld
    await page.selectOption('#pat-kit', 'druck');
    await page.waitForTimeout(200);
    const dr = await page.evaluate(() => ({ pitch: document.getElementById('pat-kick-pitch-out').textContent, len: document.getElementById('pat-kick-length-out').textContent, labels: [...document.querySelectorAll('#pat-drums .pat-row-label')].map((n) => n.textContent).join(',') }));
    check('Kit „Techno (Druck)“ im Editor: Regler zeigen G1 · 49 Hz, 0,90 s; Zeilen Rim und Ride', dr.pitch === 'G1 · 49 Hz' && dr.len === '0,90 s' && /Rim/.test(dr.labels) && /Ride/.test(dr.labels), JSON.stringify(dr));
    await page.focus('#pat-kick-bite');
    await page.keyboard.press('ArrowRight');
    await page.click('#pat-kick-reset');
    check('„Wie das Kit“ entfernt das Kick-Feld (ein Schritt)', await page.evaluate(() => !('kick' in window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id])));

    // Melodie: Bass-Muster unter „Mehr“ (zwei Klicks), ein Schritt, Rollbass
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('.ccard[data-create="melody"]').click());
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'pattern', null, { timeout: 5000 });
    await page.waitForTimeout(500);
    check('Melodie-Editor: keine Kick-Zeile', await page.evaluate(() => document.getElementById('pat-kick').hidden && document.getElementById('pat-kick-btn').hidden));
    const u1 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.click('#pat-more-btn');
    await page.click('#pat-bass-roll');
    await page.waitForTimeout(200);
    const tm = await page.evaluate(() => { const lw = window.loopwerk; const p = lw.store.project.patterns[lw.patternEditor.id]; return { n: p.notes.length, preset: p.preset, pitches: [...new Set(p.notes.map((x) => x.pitch))], steps: lw.store.undoStack.length, select: document.getElementById('pat-preset').value }; });
    check('Mehr → „Bass: Sechzehntel (rollend)“: Noten im Grundton, Klang Rollbass, ein Schritt', tm.n === 24 && tm.preset === 'rollbass' && tm.pitches.join() === '45' && tm.steps === u1 + 1 && tm.select === 'rollbass', JSON.stringify(tm));
    check('Desktop: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: unter „Mehr“, Tippflächen ≥ 44 px, kein Überlauf ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await openBeat(page);
    await page.tap('#pat-more-btn');
    await page.waitForTimeout(200);
    const inMore = await page.evaluate(() => !!document.getElementById('pat-kick-btn').closest('#pat-more'));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'druck-handy-mehr.png') });
    await page.tap('#pat-kick-btn');
    await page.waitForTimeout(400);
    const hs = await page.evaluate(() => {
      const row = document.getElementById('pat-kick');
      const r = row.getBoundingClientRect();
      const pat = document.getElementById('pattern');
      return {
        open: !row.hidden, menu: !document.getElementById('pat-more').hidden, inView: r.top >= 0 && r.bottom <= innerHeight,
        over: { doc: document.documentElement.scrollWidth - innerWidth, pat: pat.scrollWidth - pat.clientWidth, row: row.scrollWidth - row.clientWidth },
        ranges: [...row.querySelectorAll('input[type="range"]')].map((n) => { const b = n.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }),
      };
    });
    check('Handy: Mehr → Kick (zwei Tipps) öffnet die Zeile, Menü zu', inMore && hs.open && !hs.menu && hs.inView, JSON.stringify({ inMore, ...hs }));
    check('Handy: kein Überlauf (Seite, Editor, Zeile)', hs.over.doc <= 0 && hs.over.pat <= 0 && hs.over.row <= 0, JSON.stringify(hs.over));
    const tt = (await page.evaluate(measureTargets, '#pat-kick input, #pat-kick button'));
    const small = tt.filter((t) => t.w < 44 || t.h < 44);
    check('Handy: Regler und Knopf der Kick-Zeile ≥ 44 px', tt.length === 5 && !small.length, tt.map((t) => `${t.label} ${t.w}×${t.h}`).join(' | '));
    // Ziehen mit dem Finger: ein Schritt
    const u2 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    const pb = await page.locator('#pat-kick-click').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: pb.y + pb.height / 2 }] });
    await touch('touchStart', pb.x + 6);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', pb.x + 6 + (pb.width - 12) * (i / 8)); await page.waitForTimeout(30); }
    await touch('touchEnd');
    await page.waitForTimeout(300);
    const fin = await page.evaluate(() => { const lw = window.loopwerk; return { kick: lw.store.project.patterns[lw.patternEditor.id].kick, steps: lw.store.undoStack.length }; });
    check('Handy: Ziehen an „Klick“ mit dem Finger = ein Rückgängig-Schritt', fin.kick?.click > 0.8 && fin.steps === u2 + 1, JSON.stringify(fin) + ` (vorher ${u2})`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'druck-handy-kick.png') });
    check('Handy: keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || String(err));
  } finally {
    await app.close().catch(() => {});
    finish();
  }
})();
