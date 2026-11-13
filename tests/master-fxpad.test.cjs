// Mastering mit einem Klick und Effekt-Pad: Lautheit auf Ziel (±1 LU), True Peak < −1 dBTP, Bässe mono,
// A/B gleich laut, Export = Wiedergabe-Kette; Pad: Filter senkt Höhen, Stutter wiederholt taktgenau, Loslassen ohne Sprung.
// UI am Desktop und Handy, Tippflächen, keine Konsolenfehler.
// node tests/master-fxpad.test.cjs
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const { check, finish } = createChecker();

// Läuft im Browser: Testsignale (4 Schläge bei 120 BPM = 2 s)
function registerSignals() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const n = 2 * sr;
  const make = (fill) => {
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    fill(buf.getChannelData(0), buf.getChannelData(1));
    return buf;
  };
  let seed = 12345;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  library.register({ id: 'mf-noise', name: 'Rauschen', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((l, r) => { for (let i = 0; i < n; i++) { l[i] = (rnd() * 2 - 1) * 0.3; r[i] = l[i]; } }) });
  library.register({ id: 'mf-sine', name: 'Sinus', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((l, r) => { for (let i = 0; i < n; i++) l[i] = r[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr); }) });
  library.register({ id: 'mf-pulse', name: 'Puls', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((l, r) => { const k = Math.round(0.51 * sr); l[k] = r[k] = 0.9; }) });
  // Links ein tiefer Ton (60 Hz) und ein hoher (5 kHz), rechts nichts: Breite unten weg, oben bleibt sie
  library.register({ id: 'mf-wide', name: 'Breit', category: 'fx', lengthBeats: 4, bpm: 120, buffer: make((l) => { for (let i = 0; i < n; i++) l[i] = 0.25 * Math.sin((2 * Math.PI * 60 * i) / sr) + 0.12 * Math.sin((2 * Math.PI * 5000 * i) / sr); }) });
}

(async () => {
  let app = await openApp({ viewport: { width: 1440, height: 900 } });
  let page = app.page;
  try {
    await page.evaluate(registerSignals);
    // Hilfen im Browser: Projekt aus einem Sound, Lautheit, True Peak, Bandpegel
    await page.evaluate(() => {
      window.mf = {
        project(sampleId, beats = 4, volume = 1) {
          const p = JSON.parse(JSON.stringify(window.loopwerk.store.project));
          p.tracks = p.tracks.slice(0, 1).map((t) => ({ ...t, id: 't1', volume: 1, pan: 0, mute: false, solo: false, fx: null, clips: [] }));
          for (let b = 0; b < beats; b += 4) p.tracks[0].clips.push({ id: 'mf' + b, sampleId, startBeat: b, lengthBeats: 4, offsetBeats: 0 });
          p.master = { volume, fx: null };
          p.keyChanges = [];
          p.loop = { on: false, startBeat: 0, endBeat: 4 };
          p.lengthBars = Math.max(4, beats / 4);
          return p;
        },
        async band(buf, type, f, from, to) {
          const sr = buf.sampleRate;
          const ctx = new OfflineAudioContext(1, buf.length, sr);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          let node = src;
          for (let k = 0; k < 3; k++) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; node.connect(b); node = b; }
          node.connect(ctx.destination);
          src.start();
          const d = (await ctx.startRendering()).getChannelData(0);
          let s = 0;
          const a = Math.round(from * sr);
          const e = Math.round(to * sr);
          for (let i = a; i < e; i++) s += d[i] * d[i];
          return 10 * Math.log10(s / (e - a) + 1e-20);
        },
        maxJump(d, from = 1, to = d.length) { let m = 0; for (let i = Math.max(1, from); i < to; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; },
        // Knick: zweite Differenz – beim Sinus 440 Hz (0,5) etwa 0,002, ein Klick liegt um eine Größenordnung darüber
        maxKink(d) { let m = 0; for (let i = 2; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - 2 * d[i - 1] + d[i - 2])); return m; },
      };
    });

    // ---------- Mastering: Lautheit auf Ziel, True Peak, Bässe mono ----------
    const lv = await page.evaluate(async () => {
      const { library } = window.loopwerk;
      const L = await import('/src/dsp/loudness.js');
      const X = await import('/src/export.js');
      // Ein leiser Song: Demo-Arrangement mit Master auf 0,3
      const p = JSON.parse(JSON.stringify(window.loopwerk.store.project));
      p.master = { volume: 0.3, fx: null };
      const meas = (a) => { const chs = [a.getChannelData(0), a.getChannelData(1)]; return { lufs: L.integratedLoudness(chs, 44100), tp: L.truePeak(chs, { factor: 16, half: 32 }) }; };
      const off = meas((await X.exportSong(p, library, { tail: false, mastering: false })).audio);
      const out = { off };
      for (const style of ['balanced', 'warm', 'bright', 'loud']) {
        p.master.mastering = { on: true, style };
        const res = await X.exportSong(p, library, { tail: false });
        out[style] = { ...meas(res.audio), an: { pre: res.analysis.pre, drive: res.analysis.drive } };
      }
      return out;
    });
    check('Ohne Mastering ist der Testsong leise', lv.off.lufs < -18, `${lv.off.lufs.toFixed(2)} LUFS`);
    for (const [style, target] of [['balanced', -14], ['warm', -14], ['bright', -14], ['loud', -10]]) {
      const r = lv[style];
      check(`Mastering „${style}“: Lautheit ${target} LUFS ±1 LU`, Math.abs(r.lufs - target) <= 1, `${r.lufs.toFixed(2)} LUFS (vorher ${lv.off.lufs.toFixed(2)})`);
      check(`Mastering „${style}“: True Peak < −1 dBTP (16× überabgetastet)`, r.tp < -1, `${r.tp.toFixed(2)} dBTP`);
    }
    check('Stile klingen verschieden (andere Verstärkung)', Math.abs(lv.balanced.an.drive - lv.loud.an.drive) > 2, JSON.stringify([lv.balanced.an, lv.loud.an]));

    const mono = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const p = window.mf.project('mf-wide', 8);
      p.master.mastering = { on: true, style: 'balanced' };
      const a = await renderProject(p, library, { mastering: { pre: 0, drive: 0 }, toBeat: 8 });
      const b = await renderProject(p, library, { mastering: false, limiter: false, toBeat: 8 });
      const ms = async (buf) => {
        const sr = buf.sampleRate;
        const mid = new AudioBuffer({ numberOfChannels: 1, length: buf.length, sampleRate: sr });
        const side = new AudioBuffer({ numberOfChannels: 1, length: buf.length, sampleRate: sr });
        const l = buf.getChannelData(0); const r = buf.getChannelData(1);
        const m = mid.getChannelData(0); const s = side.getChannelData(0);
        for (let i = 0; i < l.length; i++) { m[i] = (l[i] + r[i]) / 2; s[i] = (l[i] - r[i]) / 2; }
        return {
          low: (await window.mf.band(side, 'lowpass', 200, 1, 3.5)) - (await window.mf.band(mid, 'lowpass', 200, 1, 3.5)),
          high: (await window.mf.band(side, 'highpass', 2500, 1, 3.5)) - (await window.mf.band(mid, 'highpass', 2500, 1, 3.5)),
        };
      };
      return { on: await ms(a), off: await ms(b) };
    });
    check('Bässe mono: 60 Hz nur links → Seitensignal ≥ 25 dB unter der Mitte', mono.on.low < -25 && mono.off.low > -1, JSON.stringify(mono));
    check('Höhen bleiben breit (Seite ≈ Mitte oder breiter)', mono.on.high > -1, JSON.stringify(mono));

    // ---------- A/B mit Lautheitsausgleich, Export = Wiedergabe-Kette ----------
    const ab = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const L = await import('/src/dsp/loudness.js');
      const M = await import('/src/mastering.js');
      const p = JSON.parse(JSON.stringify(window.loopwerk.store.project));
      p.master = { volume: 0.3, fx: null, mastering: { on: true, style: 'loud' } };
      const an = await M.analyzeMastering(p, library);
      const gains = { pre: an.pre, drive: an.drive };
      const lev = M.abLevels(an);
      const lufs = async (monitor) => { const a = await renderProject(p, library, { mastering: gains, monitor, toBeat: M.songEnd(p) }); return L.integratedLoudness([a.getChannelData(0), a.getChannelData(1)], 44100); };
      return { normal: await lufs(null), A: await lufs({ ab: 'A', ...lev }), B: await lufs({ ab: 'B', ...lev }), lev };
    });
    check('A/B: Vorher und Nachher gleich laut (±1 LU)', Math.abs(ab.A - ab.B) <= 1, JSON.stringify(ab));
    check('A/B: ohne Vergleich ist das Gemasterte lauter (Ausgleich wirkt wirklich)', ab.normal - ab.B > 3, JSON.stringify(ab));

    const rt = await page.evaluate(async () => {
      const { store, engine, library, renderProject, mastering } = window.loopwerk;
      store.setMaster({ volume: 0.3 });
      store.setMastering({ on: true, style: 'balanced' });
      await engine._ensure();
      await mastering.now();
      const an = mastering.state.analysis;
      const node = engine.mix.mst?.node;
      await new Promise((r) => setTimeout(r, 1500));
      const db = (v) => 20 * Math.log10(v);
      const X = await import('/src/export.js');
      const exp = await X.exportSong(store.project, library, { tail: false });
      // Wiedergabe-Verstärkungen offline über buildMix: muss genau den Export ergeben
      const again = await renderProject(store.project, library, { mastering: engine.mix.gains, toBeat: exp.toBeat, compensate: true });
      const a = exp.audio.getChannelData(0);
      const b = again.getChannelData(0);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
      return {
        has: !!node, style: engine.mix.mst?.style, pre: db(node.parameters.get('pre').value), drive: db(node.parameters.get('drive').value),
        an: { pre: an.pre, drive: an.drive }, ex: { pre: exp.analysis.pre, drive: exp.analysis.drive }, diff, aGain: engine.mix.aGain.gain.value, bGain: engine.mix.bBus.gain.value,
      };
    });
    check('Wiedergabe: Mastering-Knoten in der Summe (buildMix), Stil passt', rt.has && rt.style === 'balanced' && rt.aGain < 0.01 && rt.bGain > 0.99, JSON.stringify(rt));
    check('Wiedergabe hält die Verstärkungen der Analyse', Math.abs(rt.pre - rt.an.pre) < 0.05 && Math.abs(rt.drive - rt.an.drive) < 0.05, JSON.stringify(rt));
    check('Export rechnet dieselben Verstärkungen wie die Wiedergabe', Math.abs(rt.ex.pre - rt.an.pre) < 0.01 && Math.abs(rt.ex.drive - rt.an.drive) < 0.01, JSON.stringify(rt));
    check('Export = Wiedergabe-Kette mit diesen Verstärkungen (Abweichung < 1e-6)', rt.diff < 1e-6, `max |Δ| = ${rt.diff}`);

    // ---------- Bedienung Mastering (Desktop) ----------
    await page.evaluate(() => { const { ui } = window.loopwerk; ui.select(null); ui.selectTrack(null); });
    await page.waitForTimeout(200);
    // Kein Vergleich mehr in der Oberfläche (Martin, Nov. 2026): Aus- und Einschalten genügt
    check('Mastering ohne Zeile „Vergleich“', await page.evaluate(() => !document.querySelector('#insp-mst-ab-a, #insp-mst-ab-b, #insp-mst-ab-end, .mst-cmp')));

    await page.click('#insp-mst-style-warm');
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => ({ m: window.loopwerk.store.project.master.mastering, pressed: document.getElementById('insp-mst-style-warm').getAttribute('aria-pressed') }));
    check('Stil wählen über den Store (im Projekt gespeichert)', st.m.style === 'warm' && st.m.on && st.pressed === 'true', JSON.stringify(st));
    await page.click('#insp-mst-on');
    await page.waitForTimeout(150);
    const off = await page.evaluate(() => window.loopwerk.store.project.master.mastering.on);
    await page.evaluate(() => window.loopwerk.store.undo());
    const un = await page.evaluate(() => window.loopwerk.store.project.master.mastering);
    check('Schalter aus, Rückgängig holt Mastering zurück', off === false && un.on === true && un.style === 'warm', JSON.stringify(un));
    await page.click('#insp-mst-on');
    await page.waitForTimeout(150);
    const hid = await page.evaluate(() => ({ body: document.querySelector('#insp-mst .mst-body').hidden, styleVis: !!document.getElementById('insp-mst-style-warm').offsetParent }));
    check('Mastering aus: Stil und Vergleich sind ausgeblendet, nur der Schalter bleibt', hid.body && !hid.styleVis, JSON.stringify(hid));
    await page.evaluate(() => window.loopwerk.store.undo());
    await page.click('#export-btn');
    await page.waitForTimeout(300);
    // Desktop seit Scheibe 6: Export ist ein Ablauf; Mastering („Feinschliff“) steht im Schritt „Format und Klang“
    await page.evaluate(() => { const f = window.loopwerk.flow; if (f?.isOpen) f.go(1); });
    await page.waitForTimeout(300);
    const ex = await page.evaluate(() => ({ vis: !!document.getElementById('ex-mst-on')?.offsetParent, checked: document.getElementById('ex-mastering').checked, dis: document.getElementById('ex-mastering').disabled }));
    await page.click('#ex-mst-on');
    await page.waitForTimeout(150);
    const ex2 = await page.evaluate(() => ({ checked: document.getElementById('ex-mastering').checked, dis: document.getElementById('ex-mastering').disabled }));
    check('Export-Klappfeld: Mastering-Bedienung und Haken „Mit Mastering“ (an, wenn Mastering an)', ex.vis && ex.checked && !ex.dis && !ex2.checked && ex2.dis, JSON.stringify({ ex, ex2 }));
    await page.evaluate(() => { const { store, ui } = window.loopwerk; store.setMastering({ on: false }); ui.setDock(null); });

    // ---------- Effekt-Pad: offline gemessen über dieselben Kanalzüge ----------
    const pad = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { FxPad } = await import('/src/fxpad.js');
      const sr = 44100;
      const render = (sampleId, plan) => renderProject(window.mf.project(sampleId, 4), library, { limiter: false, toBeat: 4, pad: plan && ((ctx, mix, o) => plan(new FxPad(ctx, mix, { spb: () => 0.5, worklets: o.worklets, loopExtra: o.loopExtra }))) });
      const out = {};
      // Filter auf die Summe: links = Tiefpass
      const ref = await render('mf-noise');
      const flt = await render('mf-noise', (p) => { p.engage('master', 'filter', 0.1, 0.4, 0.25); p.release(1.25); });
      out.highRef = await window.mf.band(ref, 'highpass', 4000, 0.5, 1.0);
      out.highFlt = await window.mf.band(flt, 'highpass', 4000, 0.5, 1.0);
      let after = 0;
      const r0 = ref.getChannelData(0); const f0 = flt.getChannelData(0);
      for (let i = Math.round(1.62 * sr); i < Math.round(1.95 * sr); i++) after = Math.max(after, Math.abs(r0[i] - f0[i]));
      out.after = after;
      let before = 0;
      for (let i = 0; i < Math.round(0.25 * sr); i++) before = Math.max(before, Math.abs(r0[i] - f0[i]));
      out.before = before;
      // Stutter 1/8 auf einer Spur: Impuls bei 0,51 s, gedrückt bei 0,45 s → Raster 0,5 s, Länge 0,25 s
      const stt = (await render('mf-pulse', (p) => { p.engage('t1', 'stutter', 0.3, 1, 0.45); p.release(1.6); })).getChannelData(0);
      out.peaks = [];
      for (let i = 0; i < stt.length; i++) if (Math.abs(stt[i]) > 0.3) out.peaks.push(i);
      // Echo 1/8: zweite Spitze nach 0,25 s
      const ech = (await render('mf-pulse', (p) => { p.engage('t1', 'echo', 0.3, 0.5, 0.3); p.release(1.9); })).getChannelData(0);
      const win = (a, b) => { let m = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) m = Math.max(m, Math.abs(ech[i])); return m; };
      out.echo = { first: win(0.75, 0.77), between: win(0.53, 0.75), gap: win(0.78, 1.0) };
      // Lo-Fi ganz rechts: 3 Bit → höchstens 9 Stufen
      const lofi = (await render('mf-sine', (p) => { p.engage('t1', 'crush', 1, 0, 0.2); p.release(1.5); })).getChannelData(0);
      const levels = new Set();
      for (let i = Math.round(0.5 * sr); i < Math.round(1.0 * sr); i++) levels.add(Math.round(lofi[i] * 1e4));
      out.levels = levels.size;
      // Loslassen ohne Sprung: Sinus 440 Hz (Amplitude 0,5, größter Schritt 0,031)
      const jumps = {};
      const kinks = {};
      const both = (k, d) => { jumps[k] = window.mf.maxJump(d); kinks[k] = window.mf.maxKink(d); };
      both('ref', (await render('mf-sine')).getChannelData(0));
      both('filter', (await render('mf-sine', (p) => { p.engage('t1', 'filter', 0.15, 0.2, 0.3); p.release(1.0); })).getChannelData(0));
      both('filterHp', (await render('mf-sine', (p) => { p.engage('master', 'filter', 0.9, 0.2, 0.3); p.move(0.7, 0.4, 0.6); p.release(1.0); })).getChannelData(0));
      both('stutter', (await render('mf-sine', (p) => { p.engage('t1', 'stutter', 0.6, 1, 0.3); p.move(0.9, 1, 0.8); p.release(1.37); })).getChannelData(0));
      both('echo', (await render('mf-sine', (p) => { p.engage('t1', 'echo', 0.1, 0.6, 0.3); p.release(1.0); })).getChannelData(0));
      // Lo-Fi stuft das Signal ab (gewollte Treppen): gemessen werden Ein- und Aussteigen außerhalb
      const cr = (await render('mf-sine', (p) => { p.engage('t1', 'crush', 0.05, 0, 0.3); p.release(1.0); })).getChannelData(0);
      both('crush', cr.subarray(Math.round(1.1 * sr)));
      jumps.crush = Math.max(jumps.crush, window.mf.maxJump(cr, 1, Math.round(0.29 * sr)), window.mf.maxJump(cr, Math.round(0.29 * sr), Math.round(0.4 * sr)));
      const tape = (await render('mf-sine', (p) => { p.engage('t1', 'filter', 0.5, 0, 0.2); p.release(0.4, { tape: true }); })).getChannelData(0);
      both('tape', tape);
      // Bandstopp (1 Schlag = 0,5 s): bremst ab 0,4 s, steht bei 0,9 s, setzt auf dem nächsten Schlag (1,0 s) wieder ein
      const peak = (a, b) => { let m = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) m = Math.max(m, Math.abs(tape[i])); return m; };
      const zc = (a, b) => { let n = 0; for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) if ((tape[i - 1] < 0) !== (tape[i] < 0)) n++; return n; };
      out.tape = { stop: peak(0.905, 0.995), back: peak(1.02, 1.4), zcSlow: zc(0.6, 0.8), zcBack: zc(1.1, 1.3) };
      out.jumps = jumps;
      out.kinks = kinks;
      return out;
    });
    check('Pad Filter (links): Höhen über 4 kHz ≥ 20 dB leiser', pad.highRef - pad.highFlt >= 20, `${pad.highRef.toFixed(1)} → ${pad.highFlt.toFixed(1)} dB`);
    check('Pad Filter: vor dem Drücken und nach dem Loslassen unverändert', pad.before < 1e-6 && pad.after < 1e-4, `vorher ${pad.before}, nachher ${pad.after}`);
    const L8 = 11025;
    const want = [0, 1, 2, 3, 4].map((k) => Math.round(0.51 * 44100) + k * L8);
    check('Stutter 1/8: Wiederholungen genau im Abstand 0,25 s ab der Rastergrenze, nach dem Loslassen Schluss',
      JSON.stringify(pad.peaks) === JSON.stringify(want), `${JSON.stringify(pad.peaks)} erwartet ${JSON.stringify(want)}`);
    check('Echo 1/8: Wiederholung nach 0,25 s, davor und danach nichts', pad.echo.first > 0.05 && pad.echo.between < 1e-3 && pad.echo.gap < 0.05, JSON.stringify(pad.echo));
    check('Lo-Fi ganz rechts: 3 Bit (≤ 9 Stufen)', pad.levels <= 9, `${pad.levels} Stufen`);
    const j = pad.jumps;
    const kk = pad.kinks;
    // Ohne Pegelanhebung: größter Schritt wie beim Sinus (< 0,05). Echo und Resonanz machen lauter – dort zählt der Knick.
    for (const k of ['filter', 'stutter', 'crush', 'tape']) {
      check(`Ein- und Aussteigen ohne Sprung: ${k}`, j[k] < 0.05 && kk[k] < 0.012, `größter Schritt ${j[k].toFixed(4)}, Knick ${kk[k].toFixed(4)} (Sinus allein ${j.ref.toFixed(4)} / ${kk.ref.toFixed(4)})`);
    }
    for (const k of ['filterHp', 'echo']) {
      check(`Ein- und Aussteigen ohne Klick: ${k}`, kk[k] < 0.012, `Knick ${kk[k].toFixed(4)} (Sinus allein ${kk.ref.toFixed(4)}), größter Schritt ${j[k].toFixed(4)}`);
    }
    check('Bandstopp: Tonhöhe sinkt, Stille am Ende, Einsatz auf dem nächsten Schlag', pad.tape.zcSlow < 120 && pad.tape.stop < 0.02 && pad.tape.back > 0.45 && pad.tape.zcBack > 160, JSON.stringify(pad.tape));

    // ---------- Bedienung Pad (Desktop) ----------
    await page.click('#fxpad-btn');
    await page.waitForTimeout(700);
    const box = await page.locator('#fxpad-area').boundingBox();
    check('Desktop: FX-Pad-Schublade mit großer Fläche', box && box.width > 400 && box.height > 150, JSON.stringify(box));
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const down = await page.evaluate(() => ({ active: !!window.loopwerk.engine.pad?.active, live: document.getElementById('fxpad-area').classList.contains('live'), v: document.getElementById('fxpad-value').textContent, mode: window.loopwerk.engine.pad?.active?.mode }));
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.25, { steps: 4 });
    await page.waitForTimeout(80);
    const moved = await page.evaluate(() => document.getElementById('fxpad-value').textContent);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const up = await page.evaluate(() => ({ active: !!window.loopwerk.engine.pad?.active, live: document.getElementById('fxpad-area').classList.contains('live') }));
    check('Drücken wirkt (Lichtpunkt, Tiefpass), Ziehen nach rechts → Hochpass', down.active && down.live && /Tiefpass/.test(down.v) && /Hochpass/.test(moved), JSON.stringify({ down, moved }));
    check('Loslassen beendet den Effekt', !up.active && !up.live, JSON.stringify(up));
    await page.click('#fxpad-mode-stutter');
    await page.click('#fxpad-lock');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(100);
    const locked = await page.evaluate(() => ({ active: window.loopwerk.engine.pad?.active?.mode, v: document.getElementById('fxpad-value').textContent }));
    await page.click('#fxpad-lock');
    await page.waitForTimeout(100);
    const unlocked = await page.evaluate(() => !!window.loopwerk.engine.pad?.active);
    check('Halten: Effekt bleibt nach dem Loslassen, Halten aus beendet ihn', locked.active === 'stutter' && /Wiederholung/.test(locked.v) && !unlocked, JSON.stringify({ locked, unlocked }));
    const tsel = await page.evaluate(() => [...document.querySelectorAll('#fxpad-target option')].map((o) => o.value));
    check('Ziel: Summe und alle Spuren', tsel[0] === 'master' && tsel.length > 2, JSON.stringify(tsel));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme (Desktop)', false, e.stack);
  } finally {
    await app.close();
  }

  // ---------- Handy: FX-Pad über den Mixer, Mastering im Export-Fach ----------
  app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page = app.page;
  try {
    await page.tap('#mixer-btn');
    await page.waitForTimeout(700);
    await page.tap('#mixer-fxpad');
    await page.waitForTimeout(900);
    const ph = await page.evaluate(() => {
      const a = document.getElementById('fxpad-area').getBoundingClientRect();
      return { dock: window.loopwerk.ui.dock, w: a.width, h: a.height, tab: getComputedStyle(document.getElementById('fxpad-btn')).display };
    });
    check('Handy: FX-Pad aus dem Mixer, große Fläche', ph.dock === 'fxpad' && ph.w > 300 && ph.h > 250, JSON.stringify(ph));
    const small = (await page.evaluate(measureTargets)).filter((t) => (t.w < 44 || t.h < 44) && /fxpad|chip|Halten|Bandstopp/.test(t.label));
    check('Handy: Tippflächen im FX-Pad ≥ 44 px', small.length === 0, JSON.stringify(small));
    const a = await page.locator('#fxpad-area').boundingBox();
    await page.touchscreen.tap(a.x + a.width * 0.3, a.y + a.height * 0.3);
    await page.waitForTimeout(150);
    check('Handy: Antippen ohne Halten lässt nichts zurück', await page.evaluate(() => !window.loopwerk.engine.pad?.active));
    await page.evaluate(() => { window.loopwerk.store.setMastering({ on: true }); window.loopwerk.ui.setDock('export'); });
    await page.waitForTimeout(900);
    await page.evaluate(() => document.getElementById('ex-mst-on').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const exv = await page.evaluate(() => ({ on: document.getElementById('ex-mst-on').getAttribute('aria-pressed'), vis: !!document.getElementById('ex-mst-style-loud').offsetParent }));
    check('Handy: Mastering im Export-Fach', exv.on === 'true' && exv.vis, JSON.stringify(exv));
    const smallEx = (await page.evaluate(measureTargets)).filter((t) => (t.w < 44 || t.h < 44) && /mst|chip/.test(t.label));
    check('Handy: Tippflächen Mastering ≥ 44 px', smallEx.length === 0, JSON.stringify(smallEx));
    await page.tap('#ex-mst-style-loud');
    await page.waitForTimeout(150);
    check('Handy: Stil „Laut“ antippen', await page.evaluate(() => window.loopwerk.store.project.master.mastering.style === 'loud'));
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme (Handy)', false, e.stack);
  } finally {
    await app.close();
  }
  finish();
})();
