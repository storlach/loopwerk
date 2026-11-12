// Tests für die Effekt-Reihenfolge (2.14, ADR 008): node tests/fx-order.test.cjs [--ref] [--shots]
// --ref schreibt den Bezug tests/fixtures/fx-legacy.f32: Klang der Grundreihenfolge mit allen Effekten (zuletzt neu erzeugt,
// als die frühere Fassung 1 der Effekte wegfiel, 2026-11). Nur neu erzeugen, wenn sich der Klang eines Effekts gewollt ändert.
const path = require('path');
const fs = require('fs');
const { openApp, createChecker } = require('./harness.cjs');

const REF = process.argv.includes('--ref');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const REF_PATH = path.join(__dirname, 'fixtures', 'fx-legacy.f32');
const { check, finish } = createChecker();

// Läuft im Browser: Demo-Projekt ohne fxOrder, alle sieben Spur-Effekte auf „Drums“, Master mit EQ und Hall; Schlag 16–24, 22,05 kHz.
function renderLegacy() {
  return (async () => {
    const m = await import('./src/model.js');
    const { EFFECT_IDS } = await import('./src/effects.js');
    const { library, renderProject } = window.loopwerk;
    const p = m.createDemoProject();
    p.tracks[0].fx = Object.fromEntries(EFFECT_IDS.map((id) => [id, { on: true }]));
    p.master = { volume: 0.85, fx: { eq: { on: true, low: 3, high: -2 }, hall: { on: true } } };
    await library.ensureProject?.(p);
    const b = await renderProject(p, library, { sampleRate: 22050, limiter: false, fromBeat: 16, toBeat: 24 });
    const out = new Float32Array(b.length * 2);
    out.set(b.getChannelData(0), 0);
    out.set(b.getChannelData(1), b.length);
    return Array.from(out);
  })();
}

// Läuft im Browser: Testsignal-Hilfen (Sinus 220 Hz, Amplitude 0,5) und Messungen unter window.__fx
function installHelpers() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr); }
  library.register({ id: 'test-sine', name: 'Sinus', category: 'fx', lengthBeats: 4, bpm: 120, buffer: buf });
  const clip = (id, sampleId, startBeat, lengthBeats) => ({ id, sampleId, startBeat, lengthBeats, offsetBeats: 0 });
  window.__fx = {
    clip,
    // Ein-Spur-Projekt ohne Master-Färbung
    project(fx, extra = {}, clips = [clip('c1', 'test-sine', 0, 8)]) {
      return {
        version: 1, name: 'fx', bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, fx, clips, ...extra }],
      };
    },
    // Größte Differenz zweier Puffer (dBFS)
    diffDb(a, b) {
      let d = 0;
      for (let c = 0; c < 2; c++) { const x = a.getChannelData(c); const y = b.getChannelData(c); for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i])); }
      return d > 0 ? 20 * Math.log10(d) : -Infinity;
    },
    peak(b) { let p = 0; for (let c = 0; c < 2; c++) for (const v of b.getChannelData(c)) p = Math.max(p, Math.abs(v)); return p; },
    // Energie der Obertöne von 220 Hz zwischen f0 und f1 (DFT an genau diesen Frequenzen, Fenster ganzzahlige Perioden)
    bandEnergy(d, from, n, f0, f1) {
      let e = 0;
      for (let h = Math.ceil(f0 / 220); h * 220 <= f1; h++) {
        const w = (2 * Math.PI * h * 220) / sr;
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) { re += d[from + i] * Math.cos(w * i); im -= d[from + i] * Math.sin(w * i); }
        e += (re * re + im * im) / (n * n);
      }
      return e;
    },
    energy(d, a, b) { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return e; },
    maxStep(d, a, b) { let m = 0; for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; },
  };
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmtDb = (x) => (x === -Infinity ? '−∞' : x.toFixed(1)) + ' dB';

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    // ---------- 1. Null-Test: Grundreihenfolge gegen den gespeicherten Klang ----------
    const now = new Float32Array(await page.evaluate(renderLegacy));
    if (REF) {
      fs.mkdirSync(path.dirname(REF_PATH), { recursive: true });
      fs.writeFileSync(REF_PATH, Buffer.from(now.buffer));
      let pk = 0; for (const v of now) pk = Math.max(pk, Math.abs(v));
      console.log(`Referenz geschrieben: ${REF_PATH} (${now.length} Werte, Spitze ${pk.toFixed(3)})`);
      return;
    }
    const raw = fs.readFileSync(REF_PATH);
    const ref = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let diff = 0, peak = 0;
    for (let i = 0; i < ref.length; i++) { diff = Math.max(diff, Math.abs(ref[i] - (now[i] ?? 0))); peak = Math.max(peak, Math.abs(ref[i])); }
    // Rauschboden zwischen zwei Seitenladungen: −94 bis −110 dB (die synthetischen Loops schwanken minimal)
    // Grenze −80 dB: Der Bezug gegen sich selbst (zweimal frisch erzeugt) liegt bei −87 bis −90 dB, weil die Kette mit allen
    // sieben Effekten das Rauschen zwischen zwei Seitenladungen um etwa 45 dB anhebt. Ein echter Unterschied läge über −40 dB.
    check('1 Null-Test: Grundreihenfolge (Projekt ohne fxOrder, alle Effekte) klingt wie der gespeicherte Bezug (Differenz < −80 dB)', ref.length === now.length && db(diff) < -80 && peak > 0.05,
      `Differenz ${fmtDb(db(diff))}, Spitze ${peak.toFixed(3)}, Längen ${ref.length}/${now.length}`);

    await page.evaluate(installHelpers);

    // Felder in Grundreihenfolge (fxOrder = EFFECT_IDS, sends: {}) = Projekt ohne Felder, bitgleich; kein Bus
    const same = await page.evaluate(async () => {
      const { EFFECT_IDS } = await import('./src/effects.js');
      const { buildMix } = await import('./src/engine.js');
      const { library, renderProject } = window.loopwerk;
      const F = window.__fx;
      const mk = (fields) => {
        const p = F.project(Object.fromEntries(EFFECT_IDS.map((id) => [id, { on: true }])), fields ? { fxOrder: EFFECT_IDS.slice(), sends: {} } : {},
          [F.clip('c1', 'test-sine', 0, 4), F.clip('c2', 'test-click', 4, 4)]);
        p.master = { volume: 0.85, fx: { eq: { on: true, low: 3 }, hall: { on: true } }, ...(fields ? { fxOrder: EFFECT_IDS.slice() } : {}) };
        return p;
      };
      const o = { toBeat: 8, limiter: false, tailSeconds: 1 };
      const a = await renderProject(mk(false), library, o);
      const a2 = await renderProject(mk(false), library, o);
      const b = await renderProject(mk(true), library, o);
      const ctx = new OfflineAudioContext(2, 128, 44100);
      const mix = buildMix(ctx, mk(true), { limiter: false });
      return { repeat: F.diffDb(a, a2), fields: F.diffDb(a, b), peak: F.peak(a), buses: mix.buses instanceof Map ? mix.buses.size : -1, key: mix.tracks.get('t1').chain.key };
    });
    check('1 Wiederholung bitgleich (Testsignale, alle Effekte)', same.repeat === -Infinity && same.peak > 0.05, `${fmtDb(same.repeat)}, Spitze ${same.peak.toFixed(3)}`);
    check('1 fxOrder = Grundreihenfolge und sends: {} klingen bitgleich wie ohne Felder', same.fields === -Infinity, fmtDb(same.fields));
    check('1 Ohne Sends kein Bus (mix.buses leer), Schlüssel wie vor 2.14', same.buses === 0 && same.key === 'drive+filter+eq+comp+pump+echo+hall', `${same.buses}, ${same.key}`);

    // ---------- 2. Reihenfolge ändert den Klang ----------
    const t2 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const F = window.__fx;
      const fx = { drive: { on: true, type: 'hard', drive: 0.8 }, filter: { on: true, type: 'lowpass', cutoff: 0.4, reso: 0 } };
      const o = { toBeat: 4, limiter: false };
      const dfl = await renderProject(F.project(fx), library, o);
      const flt = await renderProject(F.project(fx, { fxOrder: ['filter', 'drive'] }), library, o);
      const n = 44100;
      const hi = (b) => F.bandEnergy(b.getChannelData(0), 22050, n, 2000, 10000);
      const all = (b) => F.bandEnergy(b.getChannelData(0), 22050, n, 200, 10000);
      return { flt: hi(flt), dfl: hi(dfl), fltAll: all(flt), dflAll: all(dfl) };
    });
    const gain2 = 10 * Math.log10(t2.flt / t2.dfl);
    check('2 Filter → Verzerrer hat über 2 kHz ≥ 15 dB mehr Energie als Verzerrer → Filter', gain2 >= 15,
      `Unterschied ${gain2.toFixed(1)} dB (Anteil über 2 kHz: Filter→Verzerrer ${(10 * Math.log10(t2.flt / t2.fltAll)).toFixed(1)} dB, Verzerrer→Filter ${(10 * Math.log10(t2.dfl / t2.dflAll)).toFixed(1)} dB)`);

    // ---------- 3. Lineare Effekte vertauschen ändert nichts ----------
    // Filter und EQ wirken auf beide Kanäle gleich und vertauschen mit allem. Echo vor Hall bleibt: das Ping-Pong-Echo
    // (mono → links/rechts) und der Hall (je Kanal eigene Antwort) ergeben vertauscht einen anderen Klang.
    const t3 = await page.evaluate(async () => {
      const { buildMix } = await import('./src/engine.js');
      const { library, renderProject } = window.loopwerk;
      const F = window.__fx;
      const fx = { filter: { on: true, cutoff: 0.55, reso: 0.3 }, eq: { on: true, low: 4, mid: -3, high: 2 }, echo: { on: true, mix: 0.4 }, hall: { on: true, mix: 0.3 } };
      const clips = [F.clip('c1', 'test-sine', 0, 4), F.clip('c2', 'test-click', 4, 4)];
      const rev = { fxOrder: ['echo', 'hall', 'eq', 'filter'] };
      const o = { toBeat: 8, limiter: false, tailSeconds: 1.5 };
      const a = await renderProject(F.project(fx, {}, clips), library, o);
      const b = await renderProject(F.project(fx, rev, clips), library, o);
      const key = (extra) => buildMix(new OfflineAudioContext(2, 128, 44100), F.project(fx, extra, clips), { limiter: false }).tracks.get('t1').chain.key;
      return { d: F.diffDb(a, b), peak: F.peak(a), k0: key({}), k1: key(rev) };
    });
    check('3 Filter und EQ umgekehrt hinter Echo und Hall: Kette wirklich umgestellt', t3.k0 === 'filter+eq+echo+hall' && t3.k1 === 'echo+hall+eq+filter', `${t3.k0} / ${t3.k1}`);
    check('3 Lineare Effekte umgestellt (Echo vor Hall): Differenz < −90 dB', t3.d < -90 && t3.peak > 0.1, `${fmtDb(t3.d)}, Spitze ${t3.peak.toFixed(3)}`);

    // ---------- 4. Live ohne Knackser, Hall-Fahne bleibt ----------
    const t4 = await page.evaluate(async () => {
      const { buildMix, syncMix, startVoice } = await import('./src/engine.js');
      const { library } = window.loopwerk;
      const F = window.__fx;
      const sine = library.get('test-sine').buffer;
      const sr = 44100;
      // Offline mit suspend: bei 1,0 s die Reihenfolge umstellen und syncMix(live) aufrufen
      const run = async (fx, { swap, burst }) => {
        const ctx = new OfflineAudioContext(2, Math.round(3 * sr), sr);
        const p = F.project(fx);
        const mix = buildMix(ctx, p, { limiter: false });
        const input = mix.tracks.get('t1').input;
        if (burst) startVoice(ctx, input, sine, 0.3, 0, 0.6); else startVoice(ctx, input, sine, 0, 0, 2.0);
        let keys = null;
        if (swap) {
          ctx.suspend(1.0).then(() => {
            const before = mix.tracks.get('t1').chain.key;
            syncMix(ctx, { ...p, tracks: [{ ...p.tracks[0], fxOrder: ['filter', 'drive'] }] }, mix, 0.5, true);
            keys = [before, mix.tracks.get('t1').chain.key];
            ctx.resume();
          });
        }
        const b = await ctx.startRendering();
        return { d: b.getChannelData(0), keys };
      };
      const fx = { drive: { on: true, type: 'hard', drive: 0.8 }, filter: { on: true, type: 'lowpass', cutoff: 0.4, reso: 0 } };
      const s = await run(fx, { swap: true });
      const at = (t) => Math.round(t * sr);
      const steps = { near: F.maxStep(s.d, at(0.95), at(1.05)), before: F.maxStep(s.d, at(0.3), at(0.9)), after: F.maxStep(s.d, at(1.1), at(1.9)) };
      // Hall-Fahne: Ton bis 0,6 s, umstellen bei 1,0 s, Energie 1,5–2,5 s mit und ohne Umstellen
      const hfx = { ...fx, hall: { on: true, size: 0.6, mix: 0.8 } };
      const h1 = await run(hfx, { swap: true, burst: true });
      const h0 = await run(hfx, { swap: false, burst: true });
      return { steps, keys: s.keys, hallKeys: h1.keys, tail: 10 * Math.log10(F.energy(h1.d, at(1.5), at(2.5)) / F.energy(h0.d, at(1.5), at(2.5))), tailE: F.energy(h0.d, at(1.5), at(2.5)) };
    });
    const ref4 = Math.max(t4.steps.before, t4.steps.after);
    check('4 Live umgestellt (Verzerrer → Filter wird Filter → Verzerrer)', JSON.stringify(t4.keys) === '["drive+filter","filter+drive"]', JSON.stringify(t4.keys));
    check('4 Umstellen ohne Knackser: größter Schritt ±50 ms ≤ 1,5 × eingeschwungen', t4.steps.near <= 1.5 * ref4,
      `±50 ms ${t4.steps.near.toFixed(4)}, davor ${t4.steps.before.toFixed(4)}, danach ${t4.steps.after.toFixed(4)}`);
    check('4 Hall-Fahne reißt nicht ab (keepTail): Energie 0,5–1,5 s danach höchstens 1 dB unter ohne Umstellen', t4.tail >= -1 && t4.tailE > 1e-3,
      `${t4.tail.toFixed(2)} dB (Energie ohne Umstellen ${t4.tailE.toFixed(4)})`);

    // ---------- 5. Automation bleibt auf der Kurve ----------
    const t5 = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const A = await import('./src/automation.js');
      const F = window.__fx;
      const pts = [{ beat: 0, value: 0.2 }, { beat: 8, value: 0.9 }, { beat: 16, value: 0.3 }];
      const p = F.project({ drive: { on: true }, filter: { on: true, type: 'lowpass', cutoff: 0.7 } }, { automation: { 'filter.cutoff': pts } }, [F.clip('c1', 'test-sine', 0, 16)]);
      p.loop = { on: true, startBeat: 0, endBeat: 16 };
      store.replace(p);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const strip = () => engine.mix.tracks.get('t1');
      const probe = () => { const beat = engine.currentBeat(); return { beat, got: strip().chain.units.filter.auto.cutoff.param.value / (8.81 * 1200), want: A.autoValueAt(pts, beat) }; };
      await engine.play(0);
      await wait(450);
      const out = { before: [probe()], after: [] };
      const chain0 = strip().chain;
      store.moveFx('t1', 'filter', 0);
      out.rebuilt = strip().chain !== chain0 && strip().chain.key === 'filter+drive';
      await wait(20);
      for (let k = 0; k < 5; k++) { out.after.push(probe()); await wait(50); }
      engine.stop();
      return out;
    });
    const dev5 = (xs) => Math.max(...xs.map((x) => Math.abs(x.got - x.want)));
    check('5 Filter-Kurve läuft, Reihenfolge im Lauf umgestellt: Wert bleibt auf der Kurve (± 0,02)', t5.rebuilt && dev5(t5.before) < 0.02 && dev5(t5.after) < 0.02 && Math.abs(t5.after[0].want - 0.7) > 0.05,
      `neu gebaut ${t5.rebuilt}, Abweichung vorher ${dev5(t5.before).toFixed(4)}, nachher ${dev5(t5.after).toFixed(4)}`);

    // ---------- 6. Modell ----------
    const t6 = await page.evaluate(async () => {
      const { EFFECT_IDS, fxOrderOf } = await import('./src/effects.js');
      const m = await import('./src/model.js');
      const { store } = window.loopwerk;
      const F = window.__fx;
      const out = {};
      out.ids = EFFECT_IDS;
      out.none = fxOrderOf({});
      out.bad = fxOrderOf({ fxOrder: 'hall' });
      out.messy = fxOrderOf({ fxOrder: ['hall', 'hall', 'bogus', 'filter', null] });
      store.replace(F.project({}));
      const steps = () => store.undoStack.length;
      const s0 = steps();
      store.moveFx('t1', 'filter', 0);
      out.moved = store.project.tracks[0].fxOrder;
      out.oneStep = steps() === s0 + 1;
      store.undo();
      out.undone = store.project.tracks[0].fxOrder ?? null;
      store.redo();
      out.redone = store.project.tracks[0].fxOrder;
      store.moveFx('t1', 'filter', 1);
      out.backDefault = 'fxOrder' in store.project.tracks[0];
      store.moveFx('master', 'hall', 0);
      out.master = store.project.master.fxOrder;
      store.resetFxOrder('master');
      out.masterReset = 'fxOrder' in store.project.master;
      store.moveFx('t1', 'echo', 99);
      out.clamped = store.project.tracks[0].fxOrder;
      const json = JSON.stringify(store.project);
      out.roundTrip = JSON.stringify(JSON.parse(json)) === json && m.isValidProject(JSON.parse(json));
      out.invalid = m.isValidProject({ ...JSON.parse(json), tracks: [{ ...JSON.parse(json).tracks[0], fxOrder: 'x' }] });
      const id = store.duplicateTrack('t1');
      const copy = store.track(id);
      copy.fxOrder.push('x');
      out.dup = store.project.tracks[0].fxOrder.length === 7 && copy.fxOrder.length === 8;
      return out;
    });
    check('6 Grundreihenfolge (Literal): Verzerrer, Filter, EQ, Kompressor, Pumpen, Echo, Hall',
      JSON.stringify(t6.ids) === '["drive","filter","eq","comp","pump","echo","hall"]' && JSON.stringify(t6.none) === JSON.stringify(t6.ids) && JSON.stringify(t6.bad) === JSON.stringify(t6.ids), JSON.stringify(t6.none));
    check('6 fxOrderOf: doppelte und unbekannte fallen weg, fehlende hinten in Grundreihenfolge', JSON.stringify(t6.messy) === '["hall","filter","drive","eq","comp","pump","echo"]', JSON.stringify(t6.messy));
    check('6 moveFx: ein Schritt, Undo und Redo', t6.oneStep && JSON.stringify(t6.moved) === '["filter","drive","eq","comp","pump","echo","hall"]' && t6.undone === null && JSON.stringify(t6.redone) === JSON.stringify(t6.moved), JSON.stringify(t6));
    check('6 Grundreihenfolge speichert kein fxOrder (Spur und Master)', t6.backDefault === false && t6.masterReset === false && JSON.stringify(t6.master) === '["hall","drive","filter","eq","comp","pump","echo"]', `${t6.backDefault} ${t6.masterReset} ${JSON.stringify(t6.master)}`);
    check('6 moveFx begrenzt den Platz (99 → ans Ende)', JSON.stringify(t6.clamped) === '["drive","filter","eq","comp","pump","hall","echo"]', JSON.stringify(t6.clamped));
    check('6 JSON hin und zurück gleich, gültig; fxOrder als Text ungültig', t6.roundTrip && t6.invalid === false);
    check('6 Spur duplizieren kopiert fxOrder (tiefe Kopie)', t6.dup);

    // ---------- 7. UI Desktop ----------
    await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const F = window.__fx;
      store.replace(F.project({ drive: { on: true }, filter: { on: true } }, {}, [F.clip('c1', 'test-sine', 0, 8)]));
      window.loopwerk.mixer.select('t1'); // Layout „reiter“: Karte der Spur über der Mixer-Spalte (Effekt-Kurzinfo)
    });
    await page.waitForSelector('#insp .insp-track:not([hidden]) .fxl');
    await page.waitForTimeout(500); // Inspektor fertig eingeblendet
    const ui = () => page.evaluate(() => {
      const t = window.loopwerk.store.project.tracks[0];
      const vis = (n) => !!n && !n.hidden && n.getBoundingClientRect().height > 0;
      const sec = document.querySelector('#insp .insp-sec:not([hidden]) .fxl');
      return {
        order: t.fxOrder ?? null, on: Object.fromEntries(Object.entries(t.fx || {}).map(([k, v]) => [k, !!v.on])),
        dom: sec ? [...sec.querySelectorAll('.fxl-item .fxl-name')].map((n) => n.textContent) : [],
        reset: vis(document.getElementById('insp-fx-reset')), hint: document.getElementById('hint')?.textContent || '',
        strip: [...document.querySelectorAll('.strip[data-strip-id="t1"] .fx-toggle')].map((b) => b.textContent),
        steps: window.loopwerk.store.undoStack.length,
      };
    });
    const box = async (name, scroll = true) => page.evaluate(([n, scroll]) => {
      const el = [...document.querySelectorAll('#insp .insp-sec:not([hidden]) .fxl-name')].find((x) => x.textContent === n);
      if (scroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
    }, [name, scroll]);
    let u = await ui();
    check('7 Grundreihenfolge: kein Link „Reihenfolge zurücksetzen“', u.reset === false && u.dom[0] === 'Verzerrer' && u.dom[1] === 'Filter', JSON.stringify(u.dom));
    // Klick ohne Bewegung schaltet
    let b = await box('EQ');
    await page.mouse.click(b.x, b.y);
    u = await ui();
    check('7 Klick auf den Namen ohne Bewegung schaltet (EQ an), Reihenfolge bleibt', u.on.eq === true && u.order === null, JSON.stringify(u.on));
    // Name ziehen: Filter über den Verzerrer
    const s0 = u.steps;
    b = await box('Filter');
    const top = await box('Verzerrer', false);
    check('7 Verzerrer und Filter gleichzeitig im Bild', top.y > 0 && b.y < 900, `${top.y} / ${b.y}`);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y - 2);
    await page.mouse.move(b.x, b.y - 10, { steps: 3 });
    await page.mouse.move(b.x, top.y - top.h * 0.3, { steps: 6 });
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'fx-order-drag.png') });
    const lifted = await page.evaluate(() => ({ lifted: !!document.querySelector('.fxl .fx-lifted'), line: !!document.querySelector('.fxl .fx-drop-line:not([hidden])') }));
    await page.mouse.up();
    u = await ui();
    check('7 Ziehen hebt die Zeile, Einfügelinie sichtbar', lifted.lifted && lifted.line, JSON.stringify(lifted));
    check('7 Name ziehen: Filter vor Verzerrer (Modell und Liste), ein Schritt, Filter bleibt an', u.order?.[0] === 'filter' && u.order[1] === 'drive' && u.dom[0] === 'Filter' && u.dom[1] === 'Verzerrer' && u.on.filter === true && u.steps === s0 + 1,
      `${JSON.stringify(u.order)} / ${JSON.stringify(u.dom)} / Schritte ${s0} → ${u.steps}`);
    check('7 Einblender „Filter vor Verzerrer“, Link „zurücksetzen“ erscheint', u.hint.includes('Filter vor Verzerrer') && u.reset, `„${u.hint}“, Link ${u.reset}`);
    // Alt+↓ am Schalter des Verzerrers
    await page.focus('#fx-drive-on');
    await page.keyboard.press('Alt+ArrowDown');
    u = await ui();
    const focusKept = await page.evaluate(() => document.activeElement?.id);
    check('7 Alt+↓ verschiebt den Verzerrer hinter den EQ, Fokus bleibt', JSON.stringify(u.order?.slice(0, 3)) === '["filter","eq","drive"]' && u.dom[2] === 'Verzerrer' && focusKept === 'fx-drive-on', `${JSON.stringify(u.order)} Fokus ${focusKept}`);
    // Mixer-Schalter folgen der Liste
    await page.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await page.waitForSelector('.mix-slot .strip');
    u = await ui();
    check('7 Mixer-Schalter folgen der Reihenfolge', JSON.stringify(u.strip.slice(0, 3)) === '["Filter","EQ","Zerr"]', JSON.stringify(u.strip));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'fx-order-desktop.png') });
    await page.click('#insp-fx-reset');
    u = await ui();
    check('7 „Reihenfolge zurücksetzen“: Grundreihenfolge, Link verschwindet', u.order === null && u.dom[0] === 'Verzerrer' && u.reset === false, JSON.stringify(u.dom));
    // Master: Song-Ansicht, Alt+↑ am Hall
    await page.evaluate(() => { window.loopwerk.mixer.select('__master'); }); // Summen-Karte
    await page.waitForSelector('#insp .insp-grp-master .fxl');
    await page.focus('#fx-hall-on');
    await page.keyboard.press('Alt+ArrowUp');
    const mo = await page.evaluate(() => ({ order: window.loopwerk.store.project.master?.fxOrder ?? null, dom: [...document.querySelectorAll('.insp-grp-master .fxl-name')].map((n) => n.textContent) }));
    check('7 Master-Effekte: Alt+↑ stellt Hall vor Echo', JSON.stringify(mo.order) === '["drive","filter","eq","comp","pump","hall","echo"]' && mo.dom[5] === 'Hall', JSON.stringify(mo));
    // Griff ⠿ am Ende jeder Zeile: sichtbar, Ziehen am Griff ordnet um (Master: Pumpen ganz nach oben)
    const grip = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#insp .insp-grp-master .fxl-item')];
      const g = rows.map((r) => r.querySelector('.fx-grip'));
      const pump = rows.find((r) => r.querySelector('.fxl-name').textContent === 'Pumpen').querySelector('.fx-grip');
      pump.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = pump.getBoundingClientRect();
      const t = rows[0].getBoundingClientRect();
      return { n: g.filter((x) => x && x.getBoundingClientRect().width >= 8).length, rows: rows.length, x: r.left + r.width / 2, y: r.top + r.height / 2, top: t.top, cursor: getComputedStyle(pump).cursor };
    });
    check('7 Jede Effekt-Zeile hat einen Griff ⠿ (Cursor „grab“)', grip.n === grip.rows && grip.rows === 7 && grip.cursor === 'grab', JSON.stringify(grip));
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, grip.y - 10, { steps: 3 });
    await page.mouse.move(grip.x, grip.top + 2, { steps: 8 });
    await page.mouse.up();
    const mg = await page.evaluate(() => [...document.querySelectorAll('.insp-grp-master .fxl-name')].map((n) => n.textContent));
    check('7 Am Griff ziehen: Pumpen ganz nach oben', mg[0] === 'Pumpen', JSON.stringify(mg));
    check('7 Desktop: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
  }
  if (REF) return;

  // ---------- 7. UI Finger (Handy-Mixer, Effekt-Karten) ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const p = phone.page;
    await p.evaluate(installHelpers);
    await p.evaluate(() => {
      const { store } = window.loopwerk;
      store.replace(window.__fx.project({ drive: { on: true }, filter: { on: true } }));
    });
    const cdp = await p.context().newCDPSession(p);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await p.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await p.waitForSelector('#mixer:not([hidden]) .strip-name');
    await p.tap('#mixer-strips .strip[data-strip-id="t1"] .strip-name');
    await p.waitForSelector('#mixer .fx-cards .fx-card');
    await p.waitForTimeout(600); // Effekt-Seite fertig eingeblendet
    const card = (fx, scroll = true) => p.evaluate(([id, scroll]) => {
      const h = document.getElementById(`fx-${id}-on`).closest('.fx-card').querySelector('.fx-card-head');
      if (scroll) h.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, w: r.width, h: r.height };
    }, [fx, scroll]);
    const st = () => p.evaluate(() => {
      const t = window.loopwerk.store.project.tracks[0];
      const sc = (() => { for (let n = document.querySelector('#mixer .fx-cards'); n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n; } return null; })();
      return { order: t.fxOrder ?? null, eq: !!t.fx?.eq?.on, dom: [...document.querySelectorAll('#mixer .fx-cards .fx-switch')].map((b) => b.textContent), scroll: sc ? sc.scrollTop : null };
    });
    // Kurz antippen schaltet
    let c = await card('eq');
    await p.touchscreen.tap(c.x, c.y);
    let s = await st();
    check('7 Finger: Kartenkopf kurz antippen schaltet (EQ an), Reihenfolge bleibt', s.eq && s.order === null, JSON.stringify(s));
    // Halten + Ziehen: Filter vor den Verzerrer
    c = await card('filter');
    const d = await card('drive', false);
    await T('touchStart', [{ x: c.x, y: c.y }]);
    await p.waitForTimeout(500);
    const tx = d.l + 6;
    for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: c.x + ((tx - c.x) * i) / 10, y: c.y + ((d.y - c.y) * i) / 10 }]); await p.waitForTimeout(16); }
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'fx-order-phone-drag.png') });
    await T('touchEnd', []);
    s = await st();
    check('7 Finger: Halten + Ziehen stellt Filter vor Verzerrer (Modell und Karten)', s.order?.[0] === 'filter' && s.dom[0] === 'Filter' && s.dom[1] === 'Verzerrer', `${JSON.stringify(s.order)} / ${JSON.stringify(s.dom)}`);
    // Wischen scrollt und ordnet nicht um
    const before = await st();
    c = await card('eq');
    await T('touchStart', [{ x: c.x, y: c.y + 200 > 800 ? c.y : c.y + 120 }]);
    const y0 = c.y + 200 > 800 ? c.y : c.y + 120;
    for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: c.x, y: y0 - i * 25 }]); await p.waitForTimeout(16); }
    await T('touchEnd', []);
    await p.waitForTimeout(150);
    s = await st();
    check('7 Finger: Wischen ordnet nicht um (und scrollt, wenn es etwas zu scrollen gibt)', JSON.stringify(s.order) === JSON.stringify(before.order) && (before.scroll === null || s.scroll > before.scroll),
      `${JSON.stringify(s.order)}, Scroll ${before.scroll} → ${s.scroll}`);
    // Am Griff ⠿ zieht der Finger sofort, ohne Halten: EQ vor den Filter
    const gp = await p.evaluate(() => {
      const g = document.getElementById('fx-eq-on').closest('.fx-card').querySelector('.fx-grip');
      g.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = g.getBoundingClientRect();
      const f = document.getElementById('fx-filter-on').closest('.fx-card').querySelector('.fx-card-head').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, fx: f.left + 6, fy: f.top + f.height / 2 };
    });
    await T('touchStart', [{ x: gp.x, y: gp.y }]);
    for (let i = 1; i <= 12; i++) { await T('touchMove', [{ x: gp.x + ((gp.fx - gp.x) * i) / 12, y: gp.y + ((gp.fy - gp.y) * i) / 12 }]); await p.waitForTimeout(16); }
    await T('touchEnd', []);
    await p.waitForTimeout(150);
    s = await st();
    check('7 Finger: am Griff ⠿ ohne Halten ziehen stellt EQ vor Filter', s.order?.indexOf('eq') < s.order?.indexOf('filter'), JSON.stringify(s.order));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'fx-order-phone.png') });
    check('7 Finger: keine Konsolenfehler', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (e) {
    check('Finger-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await phone.close();
    finish();
  }
})();
