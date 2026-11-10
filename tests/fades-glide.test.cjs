// Fade-Kurven (Bézier-Griffe am Clip) und Gleiten in Melodien (Portamento): Klang gemessen, Bedienung, Speichern.
// node tests/fades-glide.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const { openApp, createChecker, createCard } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';
const { check, finish } = createChecker();

// Läuft im Browser: Grundfrequenz eines kurzen Ausschnitts (Autokorrelation, erster Gipfel über 90 % des größten)
function installPitch() {
  window.__f0 = (d, center, sr = 44100) => {
    const N = 1024;
    const a = Math.round(center * sr - N / 2);
    let best = 0;
    const r = new Float64Array(420);
    for (let L = 30; L < 420; L++) { let s = 0; for (let i = 0; i < N; i++) s += d[a + i] * d[a + i + L]; r[L] = s; if (s > best) best = s; }
    for (let L = 31; L < 419; L++) {
      if (r[L] > 0.9 * best && r[L] >= r[L - 1] && r[L] >= r[L + 1]) {
        // parabolisch verfeinern
        const p = (r[L - 1] - r[L + 1]) / (2 * (r[L - 1] - 2 * r[L] + r[L + 1]));
        return sr / (L + (Number.isFinite(p) ? p : 0));
      }
    }
    return 0;
  };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installPitch);

    // ================= Fades: Hüllkurve gemessen =================
    const fd = await page.evaluate(async () => {
      const { library, renderProject, store } = window.loopwerk;
      const M = await import('./src/model.js');
      const E = await import('./src/engine.js');
      const proj = (clips) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 },
        master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips }],
      });
      const render = async (p, opts = {}) => (await renderProject(p, library, { limiter: false, toBeat: 8, ...opts })).getChannelData(0);
      const at = (d, beat) => d[Math.round(beat * 22050)];
      const out = {};
      // Form der Kurve selbst
      out.shape = { lin: M.fadeShape(0.5, 0), pos: M.fadeShape(0.5, 1), neg: M.fadeShape(0.5, -1), handle: M.fadeHandlePoint(0.6) };
      out.handleOnCurve = Math.abs(M.fadeShape(out.shape.handle[0], 0.6) - out.shape.handle[1]);
      let mono = true;
      for (const c of [-1, -0.5, 0.3, 1]) for (let k = 1; k <= 100; k++) if (M.fadeShape(k / 100, c) < M.fadeShape((k - 1) / 100, c) - 1e-9) mono = false;
      out.mono = mono;

      // Gleichspannung 1,0, Clip 8 Schläge (4 s): Fade-In 2 Schläge, Fade-Out 2 Schläge
      const clip = (extra) => ({ id: 'a', sampleId: 'test-dc', startBeat: 0, lengthBeats: 8, offsetBeats: 0, fadeInBeats: 2, fadeOutBeats: 2, ...extra });
      const lin = await render(proj([clip({})]));
      const fast = await render(proj([clip({ fadeInCurve: 1, fadeOutCurve: 1 })]));
      const slow = await render(proj([clip({ fadeInCurve: -1, fadeOutCurve: -0.5 })]));
      out.mid = { lin: at(lin, 1), fast: at(fast, 1), slow: at(slow, 1), linOut: at(lin, 7), fastOut: at(fast, 7), slowOut: at(slow, 7) };
      out.edges = { start: Math.abs(fast[0]), plateau: at(fast, 4), end: Math.abs(at(fast, 7.9999)) };
      // Ganze Kurve gegen clipEnvelope (Modell = das, was der Arranger zeichnet)
      const c1 = clip({ fadeInCurve: 1, fadeOutCurve: 1 });
      let dev = 0;
      let devMid = 0;
      for (let i = 0; i < fast.length; i++) {
        const x = i / 22050;
        const e = Math.abs(fast[i] - M.clipEnvelope(c1, x));
        dev = Math.max(dev, e);
        if ((x > 0.05 && x < 1.95) || (x > 6.05 && x < 7.95)) devMid = Math.max(devMid, e);
      }
      out.dev = dev;
      out.devMid = devMid;
      // Alte Projekte ohne Feld: linear wie bisher
      out.linMatches = [0.5, 1, 1.5, 6.5, 7].every((b) => Math.abs(at(lin, b) - M.clipEnvelope({ lengthBeats: 8, fadeInBeats: 2, fadeOutBeats: 2 }, b)) < 0.005);
      out.linExact = Math.abs(at(lin, 1) - 0.5) < 0.005;
      // Fade-In und Fade-Out treffen sich (beide gekrümmt, ohne Pause dazwischen)
      const touching = await render(proj([{ id: 'a', sampleId: 'test-dc', startBeat: 0, lengthBeats: 4, fadeInBeats: 2, fadeOutBeats: 2, fadeInCurve: 0.7, fadeOutCurve: -0.7 }]), { toBeat: 4 });
      out.touching = { top: at(touching, 1.999), mid: at(touching, 1), midOut: at(touching, 3) };
      out.touchingExp = { mid: M.fadeShape(0.5, 0.7), midOut: M.fadeShape(0.5, -0.7) };

      // Einstieg mitten im Fade: dieselben Werte wie im Ganzen, kein Sprung (nur die 96-Sample-Einstiegsrampe)
      const full = await render(proj([c1]));
      const from = await render(proj([c1]), { fromBeat: 1 });
      let diff = 0;
      for (let i = 96; i < from.length - 1; i++) diff = Math.max(diff, Math.abs(from[i] - full[i + 22050]));
      let jump = 0;
      for (let i = 1; i < 22050; i++) jump = Math.max(jump, Math.abs(from[i] - from[i - 1]));
      out.entry = { diff, jump, first: from[0], at96: from[96], expect: full[22050 + 96] };

      // Realtime-Logik (Scheduler der Engine) gegen Offline-Rendering: die Engine plant in einen OfflineAudioContext
      const rtClip = { id: 'a', sampleId: 'test-dc', startBeat: 0, lengthBeats: 12, offsetBeats: 0, fadeInBeats: 3, fadeOutBeats: 3, fadeInCurve: 0.8, fadeOutCurve: -0.6 };
      const p = proj([rtClip]);
      const s = new M.Store(JSON.parse(JSON.stringify(p)), { sampleBeats: (id) => library.get(id).lengthBeats });
      const eng = new E.Engine(s, library);
      const b0 = 1.5;
      const frames = Math.round((12 - b0) * 22050);
      // Vorlauf wie im Betrieb: Seit dem längeren Ton-Vorlauf steigt eine Stimme, die auf „jetzt“ geplant wird, mit Versatz ein
      const LEAD = 4410; // 0,1 s
      eng.ctx = new OfflineAudioContext(2, frames + LEAD, 44100);
      eng.mix = E.buildMix(eng.ctx, s.project, { limiter: false });
      eng._scheduleActiveAt(b0, 0.1, 12);
      eng._scheduleSpan(b0, 12, 0.1, 12);
      const planned = eng.voices.size;
      const rt = (await eng.ctx.startRendering()).getChannelData(0).subarray(LEAD);
      const off = (await renderProject(p, library, { limiter: false, fromBeat: b0, toBeat: 12 })).getChannelData(0);
      let rd = 0;
      // ab Abtastwert 128: die Einstiegs-Überblendung (96 Werte) läuft mit Vorlauf ganz, beim Offline-Start ist sie an der Null abgeschnitten
      for (let i = 128; i < Math.min(rt.length, off.length); i++) rd = Math.max(rd, Math.abs(rt[i] - off[i]));
      out.rt = { diff: rd, voices: planned, mid: rt[Math.round((7.5 - b0) * 22050)], start: rt[Math.round(0.5 * 22050)], want: M.clipEnvelope(rtClip, 2) };
      eng.ticker.stop();

      // Signatur (Live-Resync) kennt die Krümmung; Speichern/Laden behält sie
      out.sig = M.clipSignature('t1', { ...rtClip }) !== M.clipSignature('t1', { ...rtClip, fadeInCurve: 0.5 })
        && M.clipSignature('t1', { ...rtClip }) !== M.clipSignature('t1', { ...rtClip, fadeOutCurve: 0 });
      out.norm = M.normalizeClip({ lengthBeats: 4, fadeInBeats: 1, fadeInCurve: 3, fadeOutCurve: -0.0001 });
      out.normOld = M.normalizeClip({ lengthBeats: 4, fadeInBeats: 1 });
      void store;
      return out;
    });
    check('Kurvenform: linear 0,5; schnell 0,91; langsam 0,09; monoton; Griff liegt auf der Kurve',
      Math.abs(fd.shape.lin - 0.5) < 1e-9 && Math.abs(fd.shape.pos - 0.914) < 0.002 && Math.abs(fd.shape.neg - 0.086) < 0.002 && fd.mono && fd.handleOnCurve < 1e-9,
      `${fd.shape.lin} / ${fd.shape.pos.toFixed(3)} / ${fd.shape.neg.toFixed(3)}, Griff-Abstand ${fd.handleOnCurve.toExponential(1)}`);
    check('Fade-Mitte gemessen: linear 0,50, schnell 0,91, langsam 0,09 (Gleichspannung)',
      Math.abs(fd.mid.lin - 0.5) < 0.01 && Math.abs(fd.mid.fast - 0.914) < 0.01 && Math.abs(fd.mid.slow - 0.086) < 0.01,
      `Fade-In-Mitte ${fd.mid.lin.toFixed(3)} / ${fd.mid.fast.toFixed(3)} / ${fd.mid.slow.toFixed(3)}`);
    check('Fade-Out-Mitte: linear 0,50, schnell 0,91 (lange laut), halb langsam darunter',
      Math.abs(fd.mid.linOut - 0.5) < 0.01 && Math.abs(fd.mid.fastOut - 0.914) < 0.01 && fd.mid.slowOut < 0.4 && fd.mid.slowOut > 0.1,
      `${fd.mid.linOut.toFixed(3)} / ${fd.mid.fastOut.toFixed(3)} / ${fd.mid.slowOut.toFixed(3)}`);
    check('Kurve beginnt bei 0, erreicht 1, endet bei 0', fd.edges.start < 1e-3 && Math.abs(fd.edges.plateau - 1) < 1e-4 && fd.edges.end < 0.02,
      JSON.stringify(fd.edges));
    check('Gerenderte Hüllkurve = gezeichnete Hüllkurve (clipEnvelope)', fd.devMid < 0.005 && fd.dev < 0.03,
      `max. Abweichung im Fade ${fd.devMid.toExponential(2)}, an den steilen Enden ${fd.dev.toExponential(2)}`);
    check('Ohne Krümmung (alte Projekte) linear wie bisher', fd.linMatches && fd.linExact, `Mitte ${fd.mid.lin.toFixed(4)}`);
    check('Gekrümmtes Fade-In direkt an gekrümmtem Fade-Out', Math.abs(fd.touching.mid - fd.touchingExp.mid) < 0.01 && Math.abs(fd.touching.midOut - fd.touchingExp.midOut) < 0.01 && fd.touching.top > 0.99,
      `${fd.touching.mid.toFixed(3)} (${fd.touchingExp.mid.toFixed(3)}), ${fd.touching.midOut.toFixed(3)} (${fd.touchingExp.midOut.toFixed(3)}), Spitze ${fd.touching.top.toFixed(3)}`);
    check('Einstieg mitten im Fade: genau auf der Kurve, ohne Sprung', fd.entry.diff < 1e-3 && fd.entry.jump < 0.02 && Math.abs(fd.entry.first) < 0.02,
      `Abweichung ${fd.entry.diff.toExponential(1)}, größter Schritt ${fd.entry.jump.toFixed(4)}, erster Wert ${fd.entry.first.toFixed(4)}, nach 96 Samples ${fd.entry.at96.toFixed(3)} (ganz: ${fd.entry.expect.toFixed(3)})`);
    check('Realtime-Scheduler (Einstieg mitten im Fade + nächste Wiederholungen) = Offline-Rendering', fd.rt.diff < 1e-4 && fd.rt.voices >= 3 && Math.abs(fd.rt.mid - 1) < 1e-3 && Math.abs(fd.rt.start - fd.rt.want) < 0.005,
      `max. Abweichung ${fd.rt.diff.toExponential(1)}, Stimmen ${fd.rt.voices}, bei Schlag 2 ${fd.rt.start.toFixed(4)} (Kurve ${fd.rt.want.toFixed(4)})`);
    check('Signatur (Live-Resync) enthält die Krümmung', fd.sig);
    check('Krümmung begrenzt (−1…1), winzige Werte = linear; alte Clips bekommen kein Feld',
      fd.norm.fadeInCurve === 1 && fd.norm.fadeOutCurve === 0 && !('fadeInCurve' in fd.normOld), JSON.stringify([fd.norm, fd.normOld]));

    // ================= Fades: Bedienung am Clip =================
    await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, ui } = window.loopwerk;
      const p = M.createEmptyProject();
      p.tracks[0].clips.push({ id: 'f1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0, fadeInBeats: 4, fadeOutBeats: 4 });
      store.replace(p);
      ui.pxPerBeat = 40;
      window.loopwerk.arranger.render?.(true);
      ui.emit();
      ui.select('f1');
    });
    await page.waitForTimeout(200);
    const clipNow = () => page.evaluate(() => ({ ...window.loopwerk.store.findClip('f1').clip }));
    const box = (sel) => page.locator(sel).first().boundingBox();
    // Griff liegt auf der Kurve: Mitte des Griffs = Hüllkurve an dieser Stelle
    const onCurve = () => page.evaluate(async () => {
      const M = await import('./src/model.js');
      const c = window.loopwerk.store.findClip('f1').clip;
      const node = document.querySelector('.clip[data-clip-id="f1"]');
      const cv = node.querySelector('canvas').getBoundingClientRect();
      const g = node.querySelector('.clip-curve-in').getBoundingClientRect();
      const ppb = window.loopwerk.ui.pxPerBeat;
      const x = (g.left + g.width / 2 - cv.left) / ppb;
      const yWant = cv.top + 1 + (1 - M.clipEnvelope(c, x)) * (cv.height - 2);
      return { dy: Math.abs(g.top + g.height / 2 - yWant), hidden: node.querySelector('.clip-curve-in').hidden };
    });
    let oc = await onCurve();
    check('Bézier-Griff sitzt in der Mitte der Fade-Linie', !oc.hidden && oc.dy < 1.5, JSON.stringify(oc));
    let g = await box('.clip[data-clip-id="f1"] .clip-curve-in');
    const drag = async (x, y, dx, dy) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
      await page.mouse.move(x + dx, y + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    };
    const undo0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await drag(g.x + g.width / 2, g.y + g.height / 2, 0, -10);
    let c = await clipNow();
    check('Griff nach oben ziehen biegt das Fade-In (schnell)', c.fadeInCurve > 0.3 && c.fadeInBeats === 4, `fadeInCurve ${c.fadeInCurve}`);
    oc = await onCurve();
    check('… Griff wandert mit auf der Kurve', oc.dy < 1.5, JSON.stringify(oc));
    if (SHOTS) await page.locator('.clip[data-clip-id="f1"]').screenshot({ path: `${DIR}/fade-curve-desktop.png` });
    const steps = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    check('Ein Ziehen = ein Rückgängig-Schritt', steps === undo0 + 1, `${undo0} → ${steps}`);
    g = await box('.clip[data-clip-id="f1"] .clip-curve-out');
    await drag(g.x + g.width / 2, g.y + g.height / 2, 0, 12);
    c = await clipNow();
    check('Fade-Out-Griff nach unten: früh leise (negativ)', c.fadeOutCurve < -0.3, `fadeOutCurve ${c.fadeOutCurve}`);
    const status = await page.evaluate(() => document.getElementById('insp-curveout').closest('label').querySelector('output').textContent);
    check('Inspektor zeigt die Kurve', /^langsam \d+ %$/.test(status), status);
    await page.evaluate(() => window.loopwerk.store.undo());
    c = await clipNow();
    check('Rückgängig nimmt die Krümmung zurück', !c.fadeOutCurve && c.fadeInCurve > 0.3, JSON.stringify([c.fadeInCurve, c.fadeOutCurve]));
    // Doppelklick setzt auf linear zurück
    g = await box('.clip[data-clip-id="f1"] .clip-curve-in');
    await page.mouse.dblclick(g.x + g.width / 2, g.y + g.height / 2);
    await page.waitForTimeout(150);
    c = await clipNow();
    const ed = await page.evaluate(() => window.loopwerk.ui.dock);
    check('Doppelklick auf den Griff: wieder linear (öffnet keinen Editor)', !c.fadeInCurve && ed !== 'editor', `fadeInCurve ${c.fadeInCurve}, Dock ${ed}`);
    // Inspektor-Regler
    await page.locator('#insp-curvein').fill('-0.5');
    c = await clipNow();
    check('Regler „Kurve“ im Inspektor setzt die Krümmung', c.fadeInCurve === -0.5, String(c.fadeInCurve));
    // Kurzer Fade: kein Bézier-Griff (verdeckt sonst den Fade-Griff)
    await page.evaluate(() => window.loopwerk.store.setClip('f1', { fadeOutBeats: 0.5 }));
    await page.waitForTimeout(100);
    const hiddenShort = await page.evaluate(() => document.querySelector('.clip[data-clip-id="f1"] .clip-curve-out').hidden);
    check('Kurzer Fade: Bézier-Griff ausgeblendet', hiddenShort);
    // Speichern und Laden
    const saved = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    const reloaded = await page.evaluate(async (json) => {
      const { store, library, renderProject } = window.loopwerk;
      store.replace(JSON.parse(json));
      const c = store.findClip('f1').clip;
      const d = (await renderProject(store.project, library, { limiter: false, toBeat: 4 })).getChannelData(0);
      const M = await import('./src/model.js');
      const want = M.clipEnvelope(c, 2) * (store.project.master?.volume ?? 0.85) * store.project.tracks[0].volume;
      return { curve: c.fadeInCurve, v: d[2 * 22050], want };
    }, saved);
    check('Projekt speichert die Krümmung; geladen klingt sie gleich', reloaded.curve === -0.5 && Math.abs(reloaded.v - reloaded.want) < 0.005,
      `${reloaded.curve}, Fade-Mitte ${reloaded.v.toFixed(4)} (erwartet ${reloaded.want.toFixed(4)})`);
    // Realtime grob: Wiedergabe mitten im gekrümmten Fade startet ohne Fehler
    const rtPlay = await page.evaluate(async () => {
      const { engine } = window.loopwerk;
      await engine.play(1.3);
      await new Promise((r) => setTimeout(r, 400));
      const n = [...engine.voices].filter((v) => v.clipId === 'f1').length;
      engine.stop();
      return n;
    });
    check('Realtime: Start mitten im gekrümmten Fade plant die Stimme ein', rtPlay >= 1, `${rtPlay} Stimmen`);

    // ================= Gleiten: Tonhöhe gemessen =================
    const gl = await page.evaluate(async () => {
      const M = await import('./src/model.js');
      const I = await import('./src/instruments.js');
      const { store, library, patterns } = window.loopwerk;
      store.replace(M.createEmptyProject());
      const spb = 60 / library.bpm;
      const notes = [{ pitch: 57, start: 0, len: 1, vel: 1 }, { pitch: 69, start: 1, len: 1, vel: 1 }];
      const mk = async (glide, preset = 'organ', extra = {}) => {
        const d = (await I.renderPattern({ type: 'synth', name: 'G', bars: 1, preset, notes, ...(glide != null ? { glide } : {}), ...extra }, library.bpm, library)).buffer.getChannelData(0);
        return d;
      };
      const t1 = 1 * spb; // Tonwechsel
      const track = (d) => [-0.1, 0.06, 0.12, 0.18, 0.24, 0.4].map((dt) => window.__f0(d, t1 + dt));
      const out = { spb };
      const off = await mk(null);
      const zero = await mk(0);
      let same = 0;
      for (let i = 0; i < off.length; i++) same = Math.max(same, Math.abs(off[i] - zero[i]));
      out.offSame = same;
      out.off = track(off);
      out.long = track(await mk(1));
      out.short = track(await mk(0.25));
      // Akkord-Stimmen und Wiederholung: Ketten
      out.chains = I.glideChains([
        { pitch: 60, start: 0, len: 1 }, { pitch: 64, start: 0, len: 1 },
        { pitch: 62, start: 1, len: 1 }, { pitch: 67, start: 1, len: 1 },
        { pitch: 67, start: 2, len: 1 }, { pitch: 72, start: 4, len: 1 },
      ], 8).map((c) => [c.pitch, c.start, c.len, c.steps.map((s) => s.pitch).join('>')].join(' '));

      // Sampler-Instrument: reiner Sinus, playbackRate + Gleiten über detune
      const S = await import('./src/sampler.js');
      const sr = 44100;
      const n = Math.round(3 * sr);
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(0.5 * Math.sin(2 * Math.PI * 261.6256 * i / sr) * 32767), true);
      S.registerInstrument({ id: 'test-gleit', label: 'Test Gleiten', category: 'keys', release: 0.1, sustain: true, gain: 1, license: 'CC0',
        zones: [{ midi: 60, file: URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })) }] });
      out.samplerOff = track(await mk(0, 'test-gleit'));
      out.samplerLong = track(await mk(1, 'test-gleit'));

      // Tonart pro Takt: die umgestimmte Fassung gleitet genauso
      const pid = store.addPattern({ type: 'synth', name: 'Gleiten', bars: 1, preset: 'organ', glide: 1, notes });
      await patterns.sync(store.project);
      const sid = 'pat-' + pid;
      await library.ensure(sid);
      const base = library.get(sid).buffer.getChannelData(0);
      const vr = await library.ensureVariant(sid, { delta: 5 });
      out.app = track(base);
      out.variant = track(vr.buffer.getChannelData(0));
      out.follows = library.followsKey(sid);
      return out;
    });
    const fmt = (a) => a.map((x) => x.toFixed(0)).join(' → ');
    const rising = (a) => a.every((x, i) => i === 0 || x > a[i - 1] + 2);
    check('Gleiten aus: Ton springt (60 ms nach dem Wechsel schon 440 Hz)',
      Math.abs(gl.off[0] - 220) < 3 && gl.off.slice(1).every((f) => Math.abs(f - 440) < 6), fmt(gl.off));
    check('Gleiten aus = wie ohne Feld (gleicher Weg)', gl.offSame < 1e-6, `max. Abweichung ${gl.offSame}`);
    check('Gleiten lang: Grundfrequenz steigt in Stufen von 220 auf 440 Hz statt zu springen',
      Math.abs(gl.long[0] - 220) < 3 && rising(gl.long.slice(0, 5)) && gl.long[2] > 260 && gl.long[2] < 360 && Math.abs(gl.long[5] - 440) < 6, fmt(gl.long));
    check('Gleiten kurz ist schneller am Ziel als lang', Math.abs(gl.short[2] - 440) < 8 && gl.short[1] > gl.long[1] + 20, `kurz ${fmt(gl.short)} / lang ${fmt(gl.long)}`);
    check('Akkorde: jede Stimme gleitet zum nächsten Ton, gleicher Ton und Lücke = neu angeschlagen',
      JSON.stringify(gl.chains) === JSON.stringify(['60 0 2 62', '64 0 2 67', '67 2 1 ', '72 4 1 ']), JSON.stringify(gl.chains));
    check('Sampler-Instrument: aus springt, lang gleitet (playbackRate + detune)',
      gl.samplerOff.slice(1).every((f) => Math.abs(f - 440) < 6) && rising(gl.samplerLong.slice(0, 5)) && gl.samplerLong[2] > 260 && gl.samplerLong[2] < 360 && Math.abs(gl.samplerLong[5] - 440) < 6,
      `aus ${fmt(gl.samplerOff)} / lang ${fmt(gl.samplerLong)}`);
    const ratio = 2 ** (5 / 12);
    check('Tonart pro Takt: umgestimmte Fassung (+5) gleitet genauso',
      gl.follows && Math.abs(gl.variant[0] / gl.app[0] - ratio) < 0.02 && Math.abs(gl.variant[5] / gl.app[5] - ratio) < 0.02 && rising(gl.variant.slice(0, 5)) && gl.variant[2] > 260 * ratio && gl.variant[2] < 360 * ratio,
      `Grund ${fmt(gl.app)} / +5 ${fmt(gl.variant)}`);

    // ================= Gleiten: Bedienung im Melodie-Editor =================
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    const pid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const glideField = await page.evaluate(() => {
      const f = document.getElementById('pat-glide-field');
      return { visible: !!f.offsetParent, opts: [...document.querySelectorAll('#pat-glide option')].map((o) => o.textContent), value: document.getElementById('pat-glide').value };
    });
    check('Melodie-Editor: Wahl „Gleiten“ (Aus/Kurz/Lang) sichtbar, Aus voreingestellt',
      glideField.visible && glideField.opts.join() === 'Aus,Kurz,Lang' && glideField.value === '0', JSON.stringify(glideField));
    await page.selectOption('#pat-glide', '1');
    const g1 = await page.evaluate((id) => window.loopwerk.store.project.patterns[id].glide, pid);
    check('„Lang“ wählen setzt pattern.glide = 1', g1 === 1, String(g1));
    if (SHOTS) await page.locator('#pattern-dock, .dock:not([hidden])').first().screenshot({ path: `${DIR}/glide-desktop.png` }).catch(() => page.screenshot({ path: `${DIR}/glide-desktop.png` }));
    await page.evaluate(() => window.loopwerk.store.undo());
    const g0 = await page.evaluate((id) => ({ glide: window.loopwerk.store.project.patterns[id].glide, sel: document.getElementById('pat-glide').value }), pid);
    check('Rückgängig: wieder aus (Feld entfernt, Wahl zeigt „Aus“)', g0.glide === undefined && g0.sel === '0', JSON.stringify(g0));

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
  }

  // ================= Touch: Trefferfläche des Bézier-Griffs =================
  const tab = await openApp({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const tp = tab.page;
    await tp.evaluate(async () => {
      const M = await import('./src/model.js');
      const { store, ui } = window.loopwerk;
      const p = M.createEmptyProject();
      p.tracks[0].clips.push({ id: 'f1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0, fadeInBeats: 6, fadeOutBeats: 1 });
      store.replace(p);
      ui.pxPerBeat = 32;
      ui.emit();
      ui.select('f1');
    });
    await tp.waitForTimeout(250);
    const t = await tp.evaluate(measureTargets, '.clip-curve');
    const vis = await tp.evaluate(() => ['in', 'out'].map((w) => document.querySelector(`.clip[data-clip-id="f1"] .clip-curve-${w}`).hidden));
    check('Finger: Bézier-Griff ≥ 44 × 44 px', t.length === 1 && t[0].w >= 44 && t[0].h >= 44, JSON.stringify(t));
    check('Finger: am kurzen Fade (1 Schlag = 32 px) kein Bézier-Griff, der den Clip zudeckt', !vis[0] && vis[1], JSON.stringify(vis));
    // Fade-Griff bleibt fassbar (liegt über der Trefferfläche des Bézier-Griffs)
    const fadeFree = await tp.evaluate(() => {
      const f = document.querySelector('.clip[data-clip-id="f1"] .clip-fade-in').getBoundingClientRect();
      const h = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
      return h?.classList.contains('clip-fade-in');
    });
    check('Finger: Fade-Griff bleibt neben dem Bézier-Griff fassbar', fadeFree);
    // Ziehen mit dem Finger, zweimal antippen = linear
    const cdp = await tp.context().newCDPSession(tp);
    const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const b = await tp.locator('.clip[data-clip-id="f1"] .clip-curve-in').boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await T('touchStart', [{ x, y }]);
    for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x, y: y - (i * 14) / 8 }]); await tp.waitForTimeout(16); }
    await T('touchEnd', []);
    await tp.waitForTimeout(200);
    const cv = await tp.evaluate(() => window.loopwerk.store.findClip('f1').clip.fadeInCurve);
    check('Finger: Bézier-Griff hochziehen biegt die Kurve', cv > 0.3, String(cv));
    if (SHOTS) await tp.locator('.clip[data-clip-id="f1"]').screenshot({ path: `${DIR}/fade-curve-tablet.png` });
    const b2 = await tp.locator('.clip[data-clip-id="f1"] .clip-curve-in').boundingBox();
    for (let k = 0; k < 2; k++) {
      await T('touchStart', [{ x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 }]);
      await T('touchEnd', []);
      await tp.waitForTimeout(80);
    }
    await tp.waitForTimeout(150);
    const cv2 = await tp.evaluate(() => window.loopwerk.store.findClip('f1').clip.fadeInCurve);
    check('Finger: zweimal antippen setzt auf linear zurück', !cv2, String(cv2));
    check('Touch: keine Fehler in der Konsole', tab.errors.length === 0, tab.errors.join(' | '));
  } catch (e) {
    check('Touch-Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await tab.close();
  }

  // ================= Handy: Melodie-Editor mit „Gleiten“ =================
  if (SHOTS) {
    const ph = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    try {
      await ph.page.evaluate(async () => {
        const M = await import('./src/model.js');
        const { store, ui } = window.loopwerk;
        const p = M.createEmptyProject();
        p.tracks[0].clips.push({ id: 'f1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0, fadeInBeats: 6, fadeInCurve: 0.7, fadeOutBeats: 4, fadeOutCurve: -0.6 });
        store.replace(p);
        ui.pxPerBeat = 24;
        ui.emit();
        ui.select('f1');
      });
      await ph.page.waitForTimeout(300);
      await ph.page.screenshot({ path: `${DIR}/fade-curve-phone.png` });
      await ph.page.evaluate(() => {
        const { store, patternEditor } = window.loopwerk;
        const id = store.addPattern({ type: 'synth', name: 'Gleiten', bars: 1, preset: 'organ', glide: 0.25, notes: [{ pitch: 60, start: 0, len: 1, vel: 1 }, { pitch: 64, start: 1, len: 1, vel: 1 }] });
        patternEditor.open(id);
      });
      await ph.page.waitForTimeout(400);
      await ph.page.screenshot({ path: `${DIR}/glide-phone.png` });
      await ph.page.click('#pat-more-btn').catch(() => {});
      await ph.page.waitForTimeout(250);
      await ph.page.screenshot({ path: `${DIR}/glide-phone-more.png` });
      check('Handy: keine Fehler in der Konsole', ph.errors.length === 0, ph.errors.join(' | '));
    } finally {
      await ph.close();
    }
  }
  finish();
})();
