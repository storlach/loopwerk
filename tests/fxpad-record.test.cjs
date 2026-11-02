// Effekt-Pad als Kurve aufnehmen: Punkte im richtigen Bereich und Wertebereich, Ausdünnung, Haltepunkte, Überschreiben,
// Loop-Grenze, ein Rückgängig-Schritt, Kurve klingt wie die Geste (offline gemessen), nicht aufnehmbare Modi melden sich,
// Bedienung Desktop/Handy, Tippflächen, keine Konsolenfehler.
// node tests/fxpad-record.test.cjs [--shots]   (SHOT_DIR=… für die Bilder)
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';

// Läuft im Browser: Rauschen (fester Seed), Projekt-Helfer, Bandpegel
function helpers() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const n = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  let seed = 4242;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const l = buf.getChannelData(0); const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { l[i] = (rnd() * 2 - 1) * 0.3; r[i] = l[i]; }
  library.register({ id: 'fr-noise', name: 'Rauschen', category: 'fx', lengthBeats: 4, bpm: 120, buffer: buf });
  window.fr = {
    // Eine Spur t1 mit einem Sound über `beats` Schläge, 120 BPM
    project(sampleId, beats = 16, fx = null) {
      const p = JSON.parse(JSON.stringify(window.loopwerk.store.project));
      p.bpm = 120;
      p.tracks = p.tracks.slice(0, 1).map((t) => ({ ...t, id: 't1', volume: 1, pan: 0, mute: false, solo: false, fx, clips: [] }));
      delete p.tracks[0].automation;
      for (let b = 0; b < beats; b += 4) p.tracks[0].clips.push({ id: 'fr' + b, sampleId, startBeat: b, lengthBeats: 4, offsetBeats: 0 });
      p.master = { volume: 1, fx: null };
      p.keyChanges = [];
      p.chords = [];
      p.loop = { on: false, startBeat: 0, endBeat: 4 };
      p.lengthBars = Math.max(4, beats / 4);
      return p;
    },
    // Energie (dB) in einem Band: Kette aus je drei Biquads je Eintrag, Fenster in Sekunden
    async band(buf, chain, from, to) {
      const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      let node = src;
      for (const [type, f] of chain) for (let k = 0; k < 3; k++) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; node.connect(b); node = b; }
      node.connect(ctx.destination);
      src.start();
      const d = (await ctx.startRendering()).getChannelData(0);
      let s = 0;
      const a = Math.round(from * buf.sampleRate);
      const e = Math.round(to * buf.sampleRate);
      for (let i = a; i < e; i++) s += d[i] * d[i];
      return 10 * Math.log10(s / (e - a) + 1e-20);
    },
    // Geste über die Recorder-API: events = [[beat, x, y], …]
    async gesture(mode, events, owner, loop = null) {
      const R = await import('/src/fxpad-record.js');
      const [b0, x0, y0] = events[0];
      const rec = new R.PadRecorder({ mode, target: 't1', beat: b0, x: x0, y: y0, loop });
      let most = 0;
      for (const [b, x, y] of events.slice(1, -1)) { rec.sample(b, x, y); most = Math.max(most, rec.count); }
      const res = rec.finish(events[events.length - 1][0], owner);
      return { res, most, passes: rec.passes.length, grid: rec.passes.map((p) => p.pts.map((q) => q.slice())) };
    },
    // Filter-Geste 4 → 8: von der Mitte nach links (x 0,5 → 0,1) bis Schlag 6, dann halten; Ereignis je 1/200 Schlag
    filterEvents(b0 = 4, b1 = 8, y = 0) {
      const ev = [];
      for (let b = b0; b <= b1 + 1e-9; b += 1 / 200) ev.push([b, b < b0 + 2 ? 0.5 - (0.4 * (b - b0)) / 2 : 0.1, y]);
      return ev;
    },
  };
}

(async () => {
  let app = await openApp({ viewport: { width: 1400, height: 900 } });
  let page = app.page;
  try {
    await page.evaluate(helpers);

    // ---------- Aufnahme rein (Recorder-API) ----------
    const g = await page.evaluate(async () => {
      const R = await import('/src/fxpad-record.js');
      const A = await import('/src/automation.js');
      const { padFilter } = await import('/src/fxpad.js');
      const v = (x) => R.cutoffOf(padFilter(x, 0).lp);
      const out = {};
      // 1. Filter aus → Tiefpass, Geste 4 → 8
      const a = await window.fr.gesture('filter', window.fr.filterEvents(), { fx: null });
      const pts = a.res.points;
      out.a = { n: pts.length, most: a.most, events: 801, first: pts[0], second: pts[1], last: pts[pts.length - 1], fx: a.res.fx, key: a.res.key, range: [a.res.from, a.res.to] };
      out.a.valuesOk = pts.every((p) => p.value >= 0 && p.value <= 1);
      out.a.beatsOk = pts.every((p) => p.beat >= 4 - A.STEP_BEATS - 1e-9 && p.beat <= 8.25 + 1e-9);
      // Abweichung von der Geste (Wert der Pad-Position am Schlag; Raster-Verzug ≤ 1/16 Schlag)
      let err = 0;
      for (let b = 4.1; b < 8; b += 0.05) {
        const x = b < 6 ? 0.5 - (0.4 * (b - 4)) / 2 : 0.1;
        const want = padFilter(x, 0).lp < 19999 ? v(x) : 1;
        err = Math.max(err, Math.abs(A.autoValueAt(pts, b) - want));
      }
      out.a.err = err;
      out.a.hold = A.autoValueAt(pts, 7);
      out.a.holdWant = v(0.1);
      // Vereinfachung hält die Rasterpunkte innerhalb der Toleranz
      let simp = 0;
      for (const [b, x] of a.grid[0]) {
        const want = padFilter(x, 0).lp < 19999 ? v(x) : 1;
        simp = Math.max(simp, Math.abs(A.autoValueAt(pts, b) - want));
      }
      out.a.simp = simp;
      out.a.gridN = a.grid[0].length;
      out.a.before = A.autoValueAt(pts, 3.9);
      out.a.after = A.autoValueAt(pts, 9);

      // 2. Zittern: 10 000 Ereignisse über 8 Schläge, zufällige Position
      let s = 7;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const ev = [];
      for (let i = 0; i <= 10000; i++) ev.push([2 + (8 * i) / 10000, rnd() * 0.45, 0]);
      const z = await window.fr.gesture('filter', ev, { fx: null });
      out.z = { most: z.most, n: z.res.points.length };

      // 3. Überschreiben: Filter an (Tiefpass), vorhandene Kurve; Geste 4,5 → 6,5 weit links
      const old = [{ beat: 0, value: 0.8 }, { beat: 4, value: 0.6 }, { beat: 5, value: 0.5 }, { beat: 6, value: 0.4 }, { beat: 8, value: 0.8 }];
      const owner = { fx: { filter: { on: true, type: 'lowpass', cutoff: 0.8, reso: 0.2 } }, automation: { 'filter.cutoff': old } };
      const ev3 = [];
      for (let b = 4.5; b <= 6.5 + 1e-9; b += 0.01) ev3.push([b, 0.12, 0]);
      const o = await window.fr.gesture('filter', ev3, owner);
      const op = o.res.points;
      let outside = 0;
      for (let b = 0; b < 12; b += 0.01) if (b < 4.5 - A.STEP_BEATS - 1e-6 || b > 6.75 + 1e-6) outside = Math.max(outside, Math.abs(A.autoValueAt(op, b) - A.autoValueAt(old, b)));
      out.o = {
        beats: op.map((p) => +p.beat.toFixed(4)), outside, mid: A.autoValueAt(op, 5.5), want: v(0.12), fx: o.res.fx,
        gone: !op.some((p) => Math.abs(p.beat - 5) < 1e-6 || Math.abs(p.beat - 6) < 1e-6),
        kept: [0, 4, 8].every((b) => op.some((p) => Math.abs(p.beat - b) < 1e-6)),
      };

      // 4. Loop 4–12: Geste ab 10, über die Grenze, weiter am Loop-Anfang bis 6
      const loop = { on: true, startBeat: 4, endBeat: 12 };
      const ev4 = [];
      for (let b = 10; b < 12; b += 0.01) ev4.push([b, 0.1, 0]);
      for (let b = 4; b <= 6 + 1e-9; b += 0.01) ev4.push([b, 0.3, 0]);
      const lp = await window.fr.gesture('filter', ev4, { fx: null }, loop);
      const lpts = lp.res.points;
      const holds = new Set([lpts[0], lpts[lpts.length - 1]]);
      out.l = {
        passes: lp.passes, n: lpts.length,
        inside: lpts.filter((p) => !holds.has(p) && !(p.beat < 4 && p.value === 1) && !(p.beat > 12 && p.value === 1)).every((p) => p.beat >= 4 - 1e-9 && p.beat <= 12 + 1e-9),
        all: lpts.every((p) => p.beat >= 4 - A.STEP_BEATS - 1e-9 && p.beat <= 12 + A.STEP_BEATS + 1e-9),
        at11: A.autoValueAt(lpts, 11), at5: A.autoValueAt(lpts, 5.5), mid: A.autoValueAt(lpts, 8), atEnd: A.autoValueAt(lpts, 12), after: A.autoValueAt(lpts, 13),
        before: A.autoValueAt(lpts, 3.9), w01: v(0.1), w03: v(0.3),
      };
      // 5. Loop zweimal herum: der zweite Durchgang überschreibt den ersten
      const ev5 = [];
      for (let b = 10; b < 12; b += 0.01) ev5.push([b, 0.1, 0]);
      for (let b = 4; b < 12; b += 0.01) ev5.push([b, 0.3, 0]);
      for (let b = 4; b <= 5 + 1e-9; b += 0.01) ev5.push([b, 0.2, 0]);
      const l2 = await window.fr.gesture('filter', ev5, { fx: null }, loop);
      out.l2 = { passes: l2.passes, at11: A.autoValueAt(l2.res.points, 11), at45: A.autoValueAt(l2.res.points, 4.5), w02: v(0.2), w03: v(0.3) };

      // 6. Echo: Anteil 100 % solange gedrückt, Notenwert/Rückkopplung beim Einschalten
      const ev6 = [];
      for (let b = 3.5; b <= 5 + 1e-9; b += 0.01) ev6.push([b, 0.3, 0.4]);
      const e = await window.fr.gesture('echo', ev6, { fx: null });
      out.e = { pts: e.res.points, fx: e.res.fx, key: e.res.key };

      // 7. Hochpass-Seite, wenn der Filter am Ziel ein Tiefpass ist: nichts zu schreiben; Filter aus + rechts = Hochpass
      const hp = await window.fr.gesture('filter', [[4, 0.9, 0], [5, 0.95, 0], [6, 0.95, 0]], { fx: { filter: { on: true, type: 'lowpass', cutoff: 0.8 } } });
      out.hp = hp.res;
      const hp2 = await window.fr.gesture('filter', [[4, 0.9, 0], [5, 0.95, 0], [6, 0.95, 0]], { fx: null });
      out.hp2 = { fx: hp2.res.fx, before: A.autoValueAt(hp2.res.points, 3), at55: A.autoValueAt(hp2.res.points, 5.5), want: R.cutoffOf(padFilter(0.95, 0).hp) };
      // 8. Nicht aufnehmbar
      out.blocked = {
        stutter: R.padRecordBlocked('stutter', null, 'Stutter'), crush: R.padRecordBlocked('crush', null, 'Lo-Fi'),
        band: R.padRecordBlocked('filter', { fx: { filter: { on: true, type: 'bandpass' } } }), filter: R.padRecordBlocked('filter', {}), echo: R.padRecordBlocked('echo', {}),
      };
      return out;
    });
    const A = g.a;
    check('Filter-Geste: Schlüssel filter.cutoff, Filter wird als Tiefpass eingeschaltet (offen, ohne Resonanz)', A.key === 'filter.cutoff' && A.fx?.on && A.fx.type === 'lowpass' && A.fx.cutoff === 1 && A.fx.reso === 0, JSON.stringify(A.fx));
    check('Punkte im Bereich der Geste (4 − 1/128 … 8 + ¼) und im Wertebereich 0…1', A.beatsOk && A.valuesOk, JSON.stringify({ first: A.first, last: A.last, range: A.range }));
    check('Haltepunkte: davor offen (1) bis 1/128 Schlag vor dem Drücken, danach wieder offen', Math.abs(A.first.beat - (4 - 1 / 128)) < 1e-9 && A.first.value === 1 && A.last.value === 1 && A.before === 1 && A.after === 1, JSON.stringify({ first: A.first, last: A.last }));
    check('Kurve folgt der Geste (≤ 0,04 inkl. 1/16-Raster), Halten = Pad-Frequenz', A.err <= 0.04 && Math.abs(A.hold - A.holdWant) < 0.002, `max. Abweichung ${A.err.toFixed(4)}, Halten ${A.hold.toFixed(4)} / ${A.holdWant.toFixed(4)}`);
    check('Ausdünnen beim Ziehen: höchstens 1 Punkt je 1/16 Schlag (801 Ereignisse über 4 Schläge)', A.most <= 4 * 16 + 2, `${A.most} gespeichert`);
    check('Vereinfachen beim Loslassen: weniger Punkte, Rasterpunkte ≤ Toleranz', A.n < A.gridN && A.simp <= 0.0101, `${A.gridN} → ${A.n} Punkte, Abweichung ${A.simp.toFixed(4)}`);
    check('Zittern (10 000 Ereignisse, 8 Schläge): ≤ 130 Punkte beim Ziehen', g.z.most <= 8 * 16 + 2 && g.z.n <= g.z.most + 2, JSON.stringify(g.z));
    check('Überschreiben: alte Punkte im Bereich ersetzt, außerhalb unverändert', g.o.gone && g.o.kept && g.o.outside < 1e-9 && g.o.fx === null, JSON.stringify(g.o));
    check('Überschreiben: im Bereich der tiefere Wert (vorhandene Kurve · Pad)', Math.abs(g.o.mid - g.o.want) < 0.002, `${g.o.mid.toFixed(4)} / ${g.o.want.toFixed(4)}`);
    const L = g.l;
    check('Loop-Grenze: zwei Durchgänge, Punkte im Loop-Bereich (Halten je 1/128 davor/danach)', L.passes === 2 && L.inside && L.all, JSON.stringify(L));
    check('Loop-Grenze: am Loop-Anfang weitergeschrieben, dazwischen unverändert', Math.abs(L.at11 - L.w01) < 0.002 && Math.abs(L.at5 - L.w03) < 0.002 && L.mid === 1 && L.before === 1 && L.after === 1 && Math.abs(L.atEnd - L.w01) < 0.002, JSON.stringify(L));
    check('Loop zweimal herum: späterer Durchgang überschreibt den früheren', g.l2.passes === 3 && Math.abs(g.l2.at11 - g.l2.w03) < 0.002 && Math.abs(g.l2.at45 - g.l2.w02) < 0.002, JSON.stringify(g.l2));
    const E = g.e;
    const ep = E.pts.map((p) => [+p.beat.toFixed(4), p.value]);
    check('Echo → echo.mix: 0 davor, 100 % gedrückt, ½ Schlag zurück auf 0', E.key === 'echo.mix' && JSON.stringify(ep) === JSON.stringify([[+(3.5 - 1 / 128).toFixed(4), 0], [3.5, 1], [5, 1], [5.5, 0]]), JSON.stringify(ep));
    check('Echo: beim Einschalten Notenwert (1/8) und Rückkopplung aus der Geste, Anteil-Regler 0', E.fx?.on && E.fx.time === '1/8' && Math.abs(E.fx.feedback - 0.34) < 1e-9 && E.fx.mix === 0, JSON.stringify(E.fx));
    check('Hochpass-Seite bei Tiefpass am Ziel: nichts geschrieben, mit Begründung', !g.hp.points && /Tiefpass/.test(g.hp.reason), JSON.stringify(g.hp));
    check('Filter aus + rechte Seite: Hochpass, davor ganz zu (0)', g.hp2.fx?.type === 'highpass' && g.hp2.before === 0 && Math.abs(g.hp2.at55 - g.hp2.want) < 0.002, JSON.stringify(g.hp2));
    const B = g.blocked;
    check('Nicht aufnehmbar: Stutter, Lo-Fi, Bandpass-Filter (mit Text); Filter und Echo gehen', /nicht als Kurve/.test(B.stutter) && /Lo-Fi/.test(B.crush) && /Bandpass/.test(B.band) && B.filter === null && B.echo === null, JSON.stringify(B));

    // ---------- Ein Rückgängig-Schritt ----------
    const u = await page.evaluate(async () => {
      const { store } = window.loopwerk;
      store.replace(window.fr.project('fr-noise', 16));
      const { res } = await window.fr.gesture('filter', window.fr.filterEvents(), store.track('t1'));
      const n0 = store.undoStack.length;
      store.recordAutoLane('t1', res.key, res.points, res.fx);
      const t = store.track('t1');
      const after = { n: store.undoStack.length - n0, lane: (t.automation?.['filter.cutoff'] || []).length, on: t.fx?.filter?.on, type: t.fx?.filter?.type };
      store.undo();
      const t2 = store.track('t1');
      const undone = { auto: !!t2.automation, on: !!t2.fx?.filter?.on };
      store.redo();
      const redone = (store.track('t1').automation?.['filter.cutoff'] || []).length;
      return { after, undone, redone, want: res.points.length };
    });
    check('Aufnahme = ein Rückgängig-Schritt (Kurve + Filter an), Rückgängig nimmt beides zurück, Wiederholen bringt es', u.after.n === 1 && u.after.lane === u.want && u.after.on && u.after.type === 'lowpass' && !u.undone.auto && !u.undone.on && u.redone === u.want, JSON.stringify(u));

    // ---------- Klingt wie die Geste (offline) ----------
    const snd = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { FxPad } = await import('/src/fxpad.js');
      const A = await import('/src/automation.js');
      const spb = 0.5;
      const out = {};
      // Pad-Höhe so, dass die Resonanz des Pads (Q = −3 + 21·y dB) der kleinsten des Spur-Filters entspricht (0,7 dB): die
      // Resonanz selbst wird nicht aufgenommen
      const ev = window.fr.filterEvents(4, 8, 3.7 / 21);
      const base = window.fr.project('fr-noise', 16);
      const { res } = await window.fr.gesture('filter', ev, base.tracks[0]);
      const withCurve = JSON.parse(JSON.stringify(base));
      withCurve.tracks[0].fx = { filter: res.fx };
      withCurve.tracks[0].automation = { [res.key]: res.points };
      const curve = await renderProject(withCurve, library, { limiter: false, toBeat: 16 });
      // Dieselbe Geste live über das Pad (Kontextzeit = Schlag · spb)
      const live = await renderProject(base, library, {
        limiter: false, toBeat: 16,
        pad: (ctx, mix, o) => {
          const p = new FxPad(ctx, mix, { spb: () => spb, worklets: o.worklets, loopExtra: o.loopExtra });
          p.engage('t1', 'filter', ev[0][1], ev[0][2], ev[0][0] * spb);
          for (const [b, x, y] of ev.slice(1, -1)) p.move(x, y, b * spb);
          p.release(ev[ev.length - 1][0] * spb);
        },
      });
      const ref = await renderProject(base, library, { limiter: false, toBeat: 16 });
      const band = [['highpass', 1000], ['lowpass', 6000]];
      const win = async (buf, b0, b1) => window.fr.band(buf, band, b0 * spb, b1 * spb);
      for (const [name, b0, b1] of [['vorher', 0.5, 3.8], ['Fahrt', 5.0, 5.9], ['Halten', 6.5, 7.9], ['danach', 9, 15]]) {
        out[name] = { curve: await win(curve, b0, b1), live: await win(live, b0, b1), ref: await win(ref, b0, b1) };
      }
      // Filter schon an (Tiefpass 0,8): vor und nach der Geste bitgleich zur Wiedergabe ohne Aufnahme
      const on = window.fr.project('fr-noise', 16, { filter: { on: true, type: 'lowpass', cutoff: 0.8, reso: 0.2 } });
      const ev2 = [];
      for (let b = 4.5; b <= 6.5 + 1e-9; b += 0.01) ev2.push([b, 0.12, 0]);
      const r2 = (await window.fr.gesture('filter', ev2, on.tracks[0])).res;
      const on2 = JSON.parse(JSON.stringify(on));
      on2.tracks[0].automation = { [r2.key]: r2.points };
      const a = (await renderProject(on, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      const c = await renderProject(on2, library, { limiter: false, toBeat: 16 });
      const d = c.getChannelData(0);
      const sr = 44100;
      let pre = 0;
      let post = 0;
      for (let i = 0; i < Math.floor((4.5 - A.STEP_BEATS) * spb * sr); i++) pre = Math.max(pre, Math.abs(a[i] - d[i]));
      for (let i = Math.ceil((6.75 + 0.5) * spb * sr); i < a.length; i++) post = Math.max(post, Math.abs(a[i] - d[i]));
      const onRef = await renderProject(on, library, { limiter: false, toBeat: 16 });
      out.on = { pre, post, inside: await window.fr.band(c, band, 5.2 * spb, 6.3 * spb), insideRef: await window.fr.band(onRef, band, 5.2 * spb, 6.3 * spb) };

      // Echo: Klick je 4 Schläge; Geste 3,5 → 5 erfasst nur den Klick auf Schlag 4
      const clicks = window.fr.project('test-click', 16);
      const evE = [];
      for (let b = 3.5; b <= 5 + 1e-9; b += 0.01) evE.push([b, 0.3, 0.4]);
      const rE = (await window.fr.gesture('echo', evE, clicks.tracks[0])).res;
      clicks.tracks[0].fx = { echo: rE.fx };
      clicks.tracks[0].automation = { [rE.key]: rE.points };
      const x = (await renderProject(clicks, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      const peak = (b, w = 0.03) => { let m = 0; for (let i = Math.round((b - w) * spb * sr); i < Math.round((b + w) * spb * sr); i++) m = Math.max(m, Math.abs(x[i])); return m; };
      out.echo = { at45: peak(4.5), at05: peak(0.5), at85: peak(8.5), at125: peak(12.5) };
      return out;
    });
    const fmt = (o) => `Kurve ${o.curve.toFixed(1)} dB, Pad ${o.live.toFixed(1)} dB, ohne ${o.ref.toFixed(1)} dB`;
    check('Klang: Filter wirkt beim Halten (≥ 20 dB weniger zwischen 1 und 6 kHz)', snd.Halten.ref - snd.Halten.curve >= 20, fmt(snd.Halten));
    check('Klang: Kurve = Pad-Geste beim Halten (±1 dB)', Math.abs(snd.Halten.curve - snd.Halten.live) <= 1, fmt(snd.Halten));
    check('Klang: Kurve = Pad-Geste während der Fahrt (±1,5 dB)', Math.abs(snd.Fahrt.curve - snd.Fahrt.live) <= 1.5, fmt(snd.Fahrt));
    check('Klang: vor und nach der Geste wie ohne (±0,3 dB)', Math.abs(snd.vorher.curve - snd.vorher.ref) <= 0.3 && Math.abs(snd.danach.curve - snd.danach.ref) <= 0.3, `vorher ${fmt(snd.vorher)} · danach ${fmt(snd.danach)}`);
    check('Klang (Filter schon an): vor der Geste bitgleich, danach < 1e-4, dazwischen tiefer', snd.on.pre < 1e-6 && snd.on.post < 1e-4 && snd.on.insideRef - snd.on.inside > 6, JSON.stringify(snd.on));
    check('Klang Echo: Wiederholung nur für den Klick in der Geste (Schlag 4 → 4,5)', snd.echo.at45 > 0.05 && snd.echo.at05 < 1e-3 && snd.echo.at85 < 1e-3 && snd.echo.at125 < 1e-3, JSON.stringify(snd.echo));

    // ---------- Bedienung Desktop ----------
    await page.evaluate(() => {
      const { store } = window.loopwerk;
      const p = window.fr.project('fr-noise', 16);
      p.loop = { on: false, startBeat: 0, endBeat: 16 };
      store.replace(p);
      window.loopwerk.ui.setDock('fxpad');
    });
    await page.waitForTimeout(700);
    const t0 = (await page.evaluate(measureTargets)).filter((t) => /fxpad-rec/.test(t.label));
    check('Desktop: Schalter „● Kurve aufnehmen“ im Pad-Fach, Trefferfläche ≥ 44 px', t0.length === 1 && t0[0].h >= 44 && t0[0].w >= 44, JSON.stringify(t0));
    await page.click('#fxpad-rec');
    const armed = await page.evaluate(() => ({ p: document.getElementById('fxpad-rec').getAttribute('aria-pressed'), t: document.getElementById('fxpad-rec').textContent, c: getComputedStyle(document.getElementById('fxpad-rec')).color }));
    check('Schalter an: gedrückt, rote Linie (Aufnahme-Rot)', armed.p === 'true' && /Kurve aufnehmen/.test(armed.t) && armed.c === 'rgb(255, 77, 77)', JSON.stringify(armed));
    // Nicht während der Wiedergabe: Einblender, nichts geschrieben
    const box = await page.locator('#fxpad-area').boundingBox();
    await page.selectOption('#fxpad-target', 't1');
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    const idle = await page.evaluate(() => ({ flash: window.loopwerk.ui.flashText, auto: !!window.loopwerk.store.track('t1').automation }));
    check('Ohne Wiedergabe: Einblender, keine Kurve', /Wiedergabe/.test(idle.flash || '') && !idle.auto, JSON.stringify(idle));

    await page.evaluate(async () => { await window.loopwerk.engine.play(0); });
    await page.waitForTimeout(400);
    const undo0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    const bDown = await page.evaluate(() => window.loopwerk.engine.currentBeat());
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(box.x + box.width * (0.5 - 0.4 * (i / 20)), box.y + box.height * 0.5);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
    const during = await page.evaluate(() => {
      const { store, ui, fxpad } = window.loopwerk;
      return { auto: !!store.track('t1').automation, open: !!ui.autoLane?.isOpen('t1'), take: fxpad.state.take, writing: document.getElementById('fxpad-rec').classList.contains('writing'), value: document.getElementById('fxpad-value').textContent, bg: getComputedStyle(document.getElementById('fxpad-rec')).backgroundColor };
    });
    check('Während der Geste: nichts im Projekt, Kurvenzeile zu, Schalter schreibt (rot gefüllt)', !during.auto && !during.open && during.take?.key === 'filter.cutoff' && during.writing && during.bg === 'rgb(255, 77, 77)' && /^● Tiefpass/.test(during.value), JSON.stringify(during));
    check('Während der Geste: Ausdünnung (≤ 1 Punkt je 1/16 Schlag)', during.take.count <= 16 * 2.5 + 4, JSON.stringify(during.take));
    await page.mouse.up();
    const bUp = await page.evaluate(() => window.loopwerk.engine.currentBeat());
    await page.waitForTimeout(250);
    const done = await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const t = store.track('t1');
      return { pts: t.automation?.['filter.cutoff'] || [], on: t.fx?.filter?.on, type: t.fx?.filter?.type, open: !!ui.autoLane?.isOpen('t1'), flash: ui.flashText, undo: store.undoStack.length, writing: document.getElementById('fxpad-rec').classList.contains('writing') };
    });
    const pts = done.pts;
    check('Nach dem Loslassen: Kurve im Bereich der Geste, Filter an (Tiefpass), Einblender', pts.length >= 3 && pts[0].beat >= bDown - 0.2 && pts[pts.length - 1].beat <= bUp + 0.5 && done.on && done.type === 'lowpass' && /Filter-Frequenz-Kurve aufgenommen/.test(done.flash || '') && !done.writing,
      JSON.stringify({ n: pts.length, first: pts[0], last: pts[pts.length - 1], bDown, bUp, flash: done.flash }));
    check('Nach dem Loslassen: Kurve fällt nach links (tiefer), ein Rückgängig-Schritt, Kurvenzeile offen', pts.some((p) => p.value < 0.6) && done.undo - undo0 === 1 && done.open, JSON.stringify({ min: Math.min(...pts.map((p) => p.value)), undo: done.undo - undo0, open: done.open }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'fxpad-record-desktop.png') });

    // Nicht aufnehmbarer Modus: Stutter sagt es, schreibt nichts
    const before = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    await page.click('#fxpad-mode-stutter');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => window.loopwerk.ui.flashText);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => JSON.stringify(window.loopwerk.store.project));
    check('Stutter mit Aufnahme: Einblender „nicht als Kurve“, Projekt unverändert', /Stutter lässt sich nicht als Kurve aufnehmen/.test(st || '') && before === after, st);
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme (Desktop)', false, e.stack);
  } finally {
    await app.close();
  }

  // ---------- Handy ----------
  app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page = app.page;
  try {
    await page.evaluate(helpers);
    await page.evaluate(() => { const p = window.fr.project('fr-noise', 16); window.loopwerk.store.replace(p); });
    await page.tap('#mixer-btn');
    await page.waitForTimeout(700);
    await page.tap('#mixer-fxpad');
    await page.waitForTimeout(900);
    const small = (await page.evaluate(measureTargets)).filter((t) => /fxpad/.test(t.label));
    const rec = small.find((t) => /fxpad-rec/.test(t.label));
    check('Handy: Schalter sichtbar, Tippflächen im Pad-Fach ≥ 44 px', !!rec && small.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(small));
    await page.tap('#fxpad-rec');
    check('Handy: Antippen schaltet die Aufnahme an', await page.evaluate(() => document.getElementById('fxpad-rec').getAttribute('aria-pressed') === 'true'));
    await page.evaluate(() => { window.loopwerk.fxpad.setMode('echo'); window.loopwerk.fxpad.setTarget('master'); });
    await page.evaluate(async () => { await window.loopwerk.engine.play(0); });
    await page.waitForTimeout(400);
    const a = await page.locator('#fxpad-area').boundingBox();
    await page.mouse.move(a.x + a.width * 0.3, a.y + a.height * 0.6);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const ph = await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const m = store.project.master;
      return { pts: (m.automation?.['echo.mix'] || []).map((p) => p.value), on: m.fx?.echo?.on, open: !!ui.autoLane?.isOpen('master'), flash: ui.flashText };
    });
    check('Handy: Echo auf die Summe aufgenommen (0 → 1 → 0), Summen-Zeile offen', ph.on && ph.pts.includes(1) && ph.pts[0] === 0 && ph.pts[ph.pts.length - 1] === 0 && ph.open && /Summe: Echo-Anteil-Kurve aufgenommen/.test(ph.flash || ''), JSON.stringify(ph));
    if (SHOTS) {
      await page.evaluate(() => window.loopwerk.ui.setDock('fxpad'));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOT_DIR, 'fxpad-record-handy.png') });
    }
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme (Handy)', false, e.stack);
  } finally {
    await app.close();
  }
  finish();
})();
