// Automation Scheibe 1 + 2 (Spec v2.12, Testplan 1–8, 10): Spur-Lautstärke und Panorama als Kurve, Stufen, Besitz je
// AudioParam, samplegenau gemessen, plus Kurven wandern mit Clips (Zusatz von Martin).
// node tests/automation.test.cjs
const path = require('path');
const { pathToFileURL } = require('url');
const { openApp, createChecker } = require('./harness.cjs');

const { check, finish } = createChecker();

// Nachbildung der AudioParam-Semantik (setValueAtTime, linearRampToValueAtTime) in doppelter Genauigkeit
class MockParam {
  constructor(v) { this.def = v; this.ev = []; }
  setValueAtTime(v, t) { this._ins({ type: 'set', t, v }); }
  linearRampToValueAtTime(v, t) { this._ins({ type: 'ramp', t, v }); }
  _ins(e) {
    let i = this.ev.length;
    while (i > 0 && this.ev[i - 1].t > e.t) i--;
    this.ev.splice(i, 0, e);
  }
  valueAt(t) {
    let k = -1;
    for (let i = 0; i < this.ev.length; i++) { if (this.ev[i].t <= t) k = i; else break; }
    const pT = k >= 0 ? this.ev[k].t : 0;
    const pV = k >= 0 ? this.ev[k].v : this.def;
    const n = this.ev[k + 1];
    if (n && n.type === 'ramp') return pV + ((n.v - pV) * (t - pT)) / (n.t - pT);
    return pV;
  }
}

// Mulberry32 für reproduzierbare Fensterlängen
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function pureTests() {
  const A = await import(pathToFileURL(path.join(__dirname, '../src/automation.js')).href);
  const spb = 0.5;
  const map = (v) => v;
  const pts = [{ beat: 0, value: 0.2 }, { beat: 3, value: 1 }, { beat: 5, value: 0, curve: 'step' }, { beat: 7, value: 0.6 }, { beat: 9.5, value: 0.1 }, { beat: 12, value: 1 }];
  const loop = { start: 2, end: 10 };
  const from = 1;

  // Wie Engine._tick: Fenster bis zum Horizont, Loop-Sprung mit 'smooth', sonst 'cont'
  const simulate = (pointsAt, seed, passes = 3) => {
    const p = new MockParam(1);
    const r = rng(seed);
    const state = { beat: from };
    let cursorBeat = from;
    let cursorTime = 0;
    let smooth = false;
    A.planLane(p, map, pointsAt(0), from, from, 0, spb, 'set');
    A.autoWindow(state, from, from, 0, spb, 'set');
    let now = 0;
    let jumps = 0;
    while (jumps < passes) {
      now += 0.025 + r() * 0.125;
      const horizon = now + 0.15;
      while (cursorTime < horizon && jumps < passes) {
        const endT = Math.min(horizon, cursorTime + (loop.end - cursorBeat) * spb);
        const endB = cursorBeat + (endT - cursorTime) / spb;
        const w = A.autoWindow(state, cursorBeat, endB, cursorTime, spb, smooth ? 'smooth' : 'cont');
        smooth = false;
        if (w) A.planLane(p, map, pointsAt(w.t0), w.b0, w.b1, w.t0, spb, w.entry);
        cursorBeat = endB;
        cursorTime = endT;
        if (cursorBeat >= loop.end - 1e-6) { cursorBeat = loop.start; smooth = true; jumps++; }
      }
    }
    return p;
  };
  // Referenz: ein Aufruf je Durchlauf
  const ref = new MockParam(1);
  A.planLane(ref, map, pts, from, loop.end, 0, spb, 'set');
  let T = (loop.end - from) * spb;
  for (let k = 1; k < 3; k++) { A.planLane(ref, map, pts, loop.start, loop.end, T, spb, 'smooth'); T += (loop.end - loop.start) * spb; }
  let worst = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const p = simulate(() => pts, seed);
    for (let t = 0; t < T; t += 0.0005) worst = Math.max(worst, Math.abs(p.valueAt(t) - ref.valueAt(t)));
  }
  check('5 Fenster = Ganzes: zufällige Fenster 25–150 ms mit Loop-Sprüngen gleich einem Aufruf', worst < 1e-6, `max. Abweichung ${worst.toExponential(2)}`);
  // Kurve folgt im Ganzen autoValueAt (außer im Sprung nach dem Loop)
  let dev = 0;
  for (let t = 0; t < (loop.end - from) * spb; t += 0.001) dev = Math.max(dev, Math.abs(ref.valueAt(t) - A.autoValueAt(pts, from + t / spb)));
  check('5 Planung trifft autoValueAt', dev < 1e-9, `max. Abweichung ${dev.toExponential(2)}`);

  // Kurvenänderung zwischen zwei Fenstern: stetig, danach exakt auf der neuen Kurve
  const ptsB = [{ beat: 0, value: 1 }, { beat: 4, value: 0 }, { beat: 12, value: 0.9 }];
  const tChange = 1.3;
  const live = simulate((t) => (t < tChange ? pts : ptsB), 7, 1);
  const dt = 1 / 44100;
  let maxStep = 0;
  for (let t = 0; t < (loop.end - from) * spb; t += dt) maxStep = Math.max(maxStep, Math.abs(live.valueAt(t + dt) - live.valueAt(t)));
  const bound = dt / 0.025 + 1e-6;
  let after = 0;
  for (let t = tChange + 0.3; t < (loop.end - from) * spb - 0.01; t += 0.001) after = Math.max(after, Math.abs(live.valueAt(t) - A.autoValueAt(ptsB, from + t / spb)));
  check('5 Live-Änderung stetig (kein Schritt größer als Wertebereich je 25 ms)', maxStep <= bound, `größter Schritt ${maxStep.toExponential(2)}, Grenze ${bound.toExponential(2)}`);
  check('5 Live-Änderung: nach 0,3 s exakt auf der neuen Kurve', after < 1e-6, `max. Abweichung ${after.toExponential(2)}`);

  // Kurzes Fenster direkt nach dem Loop-Sprung: Sprung dauert trotzdem 1/128 Schlag
  const st = { beat: 9.9 };
  const w = A.autoWindow(st, 2, 2.001, 5, spb, 'smooth');
  check('5 Sprung nach dem Loop reicht über ein kurzes Fenster hinaus', Math.abs(w.b1 - (2 + A.STEP_BEATS)) < 1e-12 && A.autoWindow(st, 2.001, 2.005, 5.0005, spb, 'cont') === null, JSON.stringify(w));
}

(async () => {
  await pureTests();
  const app = await openApp();
  const { page } = app;
  try {
    // ================= Offline: Pegel, Rampe, Start mitten, Datei, Rückgängig =================
    const off = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const M = await import('./src/model.js');
      const A = await import('./src/automation.js');
      const proj = (automation, extra = {}) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }], ...(automation ? { automation } : {}) }],
        ...extra,
      });
      const render = async (p, opts = {}) => (await renderProject(p, library, { limiter: false, toBeat: 16, ...opts })).getChannelData(0);
      const idx = (b) => Math.round(b * 22050);
      const out = {};
      const pts = [{ beat: 4, value: 0 }, { beat: 8, value: 1 }];
      const ref = await render(proj(null));
      const dc = await render(proj({ volume: pts }));
      out.ref = ref[idx(6)];
      out.points = [2, 4, 6, 8, 10].map((b) => ({ b, got: dc[idx(b)], want: ref[idx(b)] * A.autoValueAt(pts, b) }));
      let lin = 0;
      for (let i = idx(4); i <= idx(8); i++) lin = Math.max(lin, Math.abs(dc[i] - ref[i] * ((i / 22050 - 4) / 4)));
      out.lin = lin;
      // Clip beginnt an Schlag 6 (kein Einstieg mitten im Sample, dessen Überblendung die erste Probe formen würde)
      const p6 = proj({ volume: pts });
      p6.tracks[0].clips = [{ id: 'c1', sampleId: 'test-dc', startBeat: 6, lengthBeats: 10, offsetBeats: 0 }];
      const mid = await render(p6, { fromBeat: 6 });
      out.mid = { first: mid[0], at7: mid[idx(1)], want0: ref[0] * 0.5, want7: ref[0] * 0.75 };

      // Null-Test: ohne Feld = mit leerem Feld = leere Kurve, bitgleich (Testsignale mit Fader, Panorama, Fades, Effekten)
      const nullProj = () => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 0.85 },
        tracks: [
          { id: 't1', name: 'A', volume: 0.8, pan: -0.3, mute: false, solo: false, fx: { filter: { on: true } }, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 8, offsetBeats: 0, fadeInBeats: 1, fadeOutBeats: 2 }] },
          { id: 't2', name: 'B', volume: 0.6, pan: 0.5, mute: false, solo: false, fx: { echo: { on: true } }, clips: [{ id: 'c2', sampleId: 'test-click', startBeat: 1, lengthBeats: 12, offsetBeats: 0 }] },
          { id: 't3', name: 'C', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c3', sampleId: 'test-dc', startBeat: 2.5, lengthBeats: 5, offsetBeats: 1.25, gain: 0.5 }] },
        ],
      });
      const diffOf = (a, b) => {
        let diff = 0;
        let max = 0;
        let energy = 0;
        for (let c = 0; c < 2; c++) {
          const x = a.getChannelData(c);
          const y = b.getChannelData(c);
          for (let i = 0; i < x.length; i++) { if (x[i] !== y[i]) diff++; max = Math.max(max, Math.abs(x[i] - y[i])); energy += x[i] * x[i]; }
        }
        return { diff, max, energy };
      };
      const empty = (p) => { p.tracks.forEach((t, i) => { t.automation = i % 2 ? {} : { volume: [] }; }); return p; };
      // Je Spur bitgenau (eine Spur rendert reproduzierbar); die Summe mehrerer Spuren schwankt in Chromium schon ohne
      // Änderung um Rundungsbits (Reihenfolge beim Aufsummieren), dort gilt 1e-6.
      const solo = [];
      for (let k = 0; k < 3; k++) {
        const one = () => { const p = nullProj(); p.tracks = [p.tracks[k]]; return p; };
        const d = diffOf(await renderProject(one(), library, { limiter: true }), await renderProject(empty(one()), library, { limiter: true }));
        solo.push(d.energy > 1 ? d.diff : -1);
      }
      const all = diffOf(await renderProject(nullProj(), library, { limiter: true }), await renderProject(empty(nullProj()), library, { limiter: true }));
      out.nullTest = { solo, max: all.max };

      // Vorlage über den Store: Loop 4–12 aktiv → Einblenden genau dort, davor unverändert
      const st = new M.Store(proj(null, { loop: { on: true, startBeat: 4, endBeat: 12 } }), { sampleBeats: () => 4 });
      const r = st.applyAutoTemplate('t1', 'fadeIn');
      out.tpl = { r, steps: st.undoStack.length, lane: A.laneOf(st.project.tracks[0], 'volume') };
      const tplOut = await render({ ...st.project, loop: { on: false, startBeat: 0, endBeat: 16 } });
      out.tplVals = [3.9, 4, 8, 12, 14].map((x) => tplOut[idx(x)] / ref[idx(x)]);
      const st2 = new M.Store(proj(null), { sampleBeats: () => 4 });
      out.tplOut = st2.applyAutoTemplate('t1', 'fadeOut', { bars: 2 });
      out.tplOutLane = A.laneOf(st2.project.tracks[0], 'volume');

      // Rückgängig: Punkt setzen, Ziehen (viele Schritte, ein coalesce) = 2 Schritte
      const s = new M.Store(proj(null), { sampleBeats: () => 4 });
      const i0 = s.addAutoPoint('t1', 'volume', 4, 0);
      s.addAutoPoint('t1', 'volume', 8, 1);
      for (let k = 1; k <= 20; k++) s.moveAutoPoint('t1', 'volume', 0, 4 + k * 0.5, k / 20, 'auto-drag-1');
      const lane = A.laneOf(s.project.tracks[0], 'volume');
      out.undo = { i0, steps: s.undoStack.length, lane };
      s.undo();
      out.undo.afterUndo = A.laneOf(s.project.tracks[0], 'volume');
      s.undo(); s.undo();
      out.undo.empty = !('automation' in s.project.tracks[0]);
      s.redo(); s.redo(); s.redo();
      out.undo.redo = JSON.stringify(A.laneOf(s.project.tracks[0], 'volume')) === JSON.stringify(lane);
      s.deleteAutoPoint('t1', 'volume', 1);
      s.deleteAutoPoint('t1', 'volume', 0);
      out.undo.deleted = !('automation' in s.project.tracks[0]);
      s.undo();
      const json = JSON.stringify(s.project);
      out.file = { same: JSON.stringify(JSON.parse(json)) === json, valid: M.isValidProject(JSON.parse(json)),
        badArray: M.isValidProject({ ...proj([]) }), badNum: M.isValidProject(proj(5)), oldOk: M.isValidProject(proj(null)) };
      // Master-Ziel schon vorgesehen
      s.addAutoPoint('master', 'volume', 0, 0.5);
      out.master = A.laneOf(s.project.master, 'volume');
      return out;
    });
    check('Referenz ohne Kurve: Gleichspannung kommt mit 1,0 an', Math.abs(off.ref - 1) < 1e-4, `${off.ref}`);
    for (const p of off.points) check(`1 Pegel an Schlag ${p.b}`, Math.abs(p.got - p.want) < 1e-4, `gemessen ${p.got.toFixed(6)}, erwartet ${p.want.toFixed(6)}`);
    check('2 Rampe zwischen Schlag 4 und 8 linear', off.lin < 1e-4, `max. Abweichung ${off.lin.toExponential(2)}`);
    check('4 Start mitten (Schlag 6): erste Probe auf der Kurve', Math.abs(off.mid.first - off.mid.want0) < 1e-4 && Math.abs(off.mid.at7 - off.mid.want7) < 1e-4, JSON.stringify(off.mid));
    check('10 Null-Test: Projekt ohne Kurven bitgleich mit leerem automation-Feld', off.nullTest.solo.every((d) => d === 0) && off.nullTest.max < 1e-6, JSON.stringify(off.nullTest));
    check('10 Vorlage Einblenden = ein Schritt, Loop-Bereich, Haltepunkt bei 0', off.tpl.steps === 1 && off.tpl.r.fromBeat === 4 && off.tpl.r.toBeat === 12
      && JSON.stringify(off.tpl.lane) === JSON.stringify([{ beat: 0, value: 1, curve: 'step' }, { beat: 4, value: 0 }, { beat: 12, value: 1 }]), JSON.stringify(off.tpl));
    check('10 Vorlage klingt: vor dem Bereich wie vorher, dann 0 → 1', Math.abs(off.tplVals[0] - 1) < 1e-4 && Math.abs(off.tplVals[1]) < 1e-4 && Math.abs(off.tplVals[2] - 0.5) < 1e-4 && Math.abs(off.tplVals[3] - 1) < 1e-4 && Math.abs(off.tplVals[4] - 1) < 1e-4, off.tplVals.map((v) => v.toFixed(5)).join(' '));
    check('10 Ausblenden ohne Loop: 2 Takte bis Ende des letzten Clips', off.tplOut?.fromBeat === 8 && off.tplOut.toBeat === 16 && JSON.stringify(off.tplOutLane) === JSON.stringify([{ beat: 8, value: 1 }, { beat: 16, value: 0 }]), JSON.stringify(off.tplOutLane));
    check('10 Punkt setzen + Ziehen (20 Bewegungen) = 2 Schritte (+1 zweiter Punkt)', off.undo.i0 === 0 && off.undo.steps === 3, `Schritte ${off.undo.steps}, Kurve ${JSON.stringify(off.undo.lane)}`);
    check('10 Ziehen bleibt zwischen den Nachbarn', off.undo.lane.length === 2 && off.undo.lane[0].beat < off.undo.lane[1].beat && Math.abs(off.undo.lane[0].value - 1) < 1e-9, JSON.stringify(off.undo.lane));
    check('10 Rückgängig nimmt das ganze Ziehen zurück, dann Kurve weg, Wiederholen stellt her', JSON.stringify(off.undo.afterUndo) === JSON.stringify([{ beat: 4, value: 0 }, { beat: 8, value: 1 }]) && off.undo.empty && off.undo.redo, JSON.stringify(off.undo));
    check('10 Letzter Punkt gelöscht → Kurve und Feld entfernt', off.undo.deleted);
    check('10 Datei: JSON hin und zurück gleich, Validierung', off.file.same && off.file.valid && !off.file.badArray && !off.file.badNum && off.file.oldOk, JSON.stringify(off.file));
    check('Aktionen nehmen schon das Ziel „master“ an', off.master.length === 1 && off.master[0].value === 0.5, JSON.stringify(off.master));

    // ================= Kurven wandern mit Clips =================
    const carry = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const M = await import('./src/model.js');
      const A = await import('./src/automation.js');
      const S = A.STEP_BEATS;
      const base = () => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 16, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [
          { id: 't1', name: 'A', volume: 1, pan: 0, mute: false, solo: false,
            clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 8, lengthBeats: 8, offsetBeats: 0 }, { id: 'c2', sampleId: 'test-dc', startBeat: 24, lengthBeats: 8, offsetBeats: 0 }],
            automation: { volume: [{ beat: 0, value: 1 }, { beat: 8, value: 0 }, { beat: 12, value: 1 }, { beat: 20, value: 0.5 }, { beat: 28, value: 0.1 }, { beat: 40, value: 0.2 }] } },
          { id: 't2', name: 'B', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c3', sampleId: 'test-dc', startBeat: 48, lengthBeats: 4, offsetBeats: 0 }] },
        ],
      });
      const mk = () => new M.Store(base(), { sampleBeats: () => 4 });
      const lane = (st, id) => A.laneOf(st.project.tracks.find((t) => t.id === id), 'volume');
      const orig = A.laneOf(base().tracks[0], 'volume');
      // größte Abweichung von f(b) über Bereiche (Schritt 1/64 Schlag)
      const dev = (pts, ranges, f) => {
        let m = 0;
        for (const [a, b] of ranges) for (let x = a; x <= b + 1e-9; x += 1 / 64) m = Math.max(m, Math.abs(A.autoValueAt(pts, x) - f(x)));
        return m;
      };
      const o = (x) => A.autoValueAt(orig, x);
      const out = {};
      // a) gleiche Spur, Clip 8–16 nach 32–40
      let st = mk();
      const before = JSON.stringify(st.project);
      st.moveClip('c1', 't1', 32);
      let l = lane(st, 't1');
      out.move = {
        steps: st.undoStack.length,
        wander: dev(l, [[32, 40]], (x) => o(x - 24)),
        outside: dev(l, [[0, 8], [16, 32 - S], [40 + S, 64]], o),
        lane: l,
      };
      st.undo();
      out.move.undo = JSON.stringify(st.project) === before;
      // Klang: Clip spielt an neuer Stelle genau mit seiner alten Kurve
      const r0 = (await renderProject(base(), library, { limiter: false, toBeat: 48 })).getChannelData(0);
      st.redo();
      const r1 = (await renderProject(st.project, library, { limiter: false, toBeat: 48 })).getChannelData(0);
      let au = 0;
      for (let x = 0.05; x < 7.95; x += 0.05) au = Math.max(au, Math.abs(r1[Math.round((32 + x) * 22050)] - r0[Math.round((8 + x) * 22050)]));
      out.move.audio = au;
      // b) Spurwechsel auf eine Spur ohne Kurve
      st = mk();
      st.moveClip('c1', 't2', 8);
      const l1 = lane(st, 't1');
      const l2 = lane(st, 't2');
      out.track = {
        wander: dev(l2, [[8, 16]], o),
        targetOutside: dev(l2, [[0, 8 - S], [16 + S, 64]], () => 1),
        sourceOutside: dev(l1, [[0, 8], [16, 64]], o),
        steps: st.undoStack.length,
      };
      // c) Duplizieren kopiert die Punkte an den neuen Platz, Quelle bleibt
      st = mk();
      st.duplicateClip('c1');
      l = lane(st, 't1');
      out.dup = { wander: dev(l, [[16, 24]], (x) => o(x - 8)), outside: dev(l, [[0, 16 - S], [24 + S, 64]], o), clips: st.project.tracks[0].clips.length, steps: st.undoStack.length };
      // d) Mehrfachauswahl: beide Clips um 4 Schläge, Inhalt aus dem Stand vor der Aktion
      st = mk();
      st.moveClips([{ id: 'c1', trackId: 't1', startBeat: 12 }, { id: 'c2', trackId: 't1', startBeat: 28 }]);
      l = lane(st, 't1');
      out.multi = { a: dev(l, [[12, 20]], (x) => o(x - 4)), b: dev(l, [[28, 36]], (x) => o(x - 4)), outside: dev(l, [[0, 8], [40 + S, 64]], o), steps: st.undoStack.length };
      // e) Spur ohne Kurve: nichts entsteht
      st = mk();
      st.moveClip('c3', 't2', 52);
      out.none = !('automation' in st.project.tracks[1]);
      // f) Kopieren per Ziehen (Alt) auf die andere Spur
      st = mk();
      st.moveClip('c2', 't2', 0, { copy: true });
      out.copy = { wander: dev(lane(st, 't2'), [[0, 8]], (x) => o(x + 24)), source: dev(lane(st, 't1'), [[0, 64]], o) };
      // g) Spur duplizieren und Ebenen (Stems) übernehmen die Kurve
      st = mk();
      const dupId = st.duplicateTrack('t1');
      const stemIds = st.insertStemTracks('c1', [{ name: 'Ebene', sampleId: 'test-dc' }]);
      const same = (id) => JSON.stringify(lane(st, id)) === JSON.stringify(orig);
      out.tracks = { dup: same(dupId), stem: same(stemIds[0]) };
      return out;
    });
    check('Mitwandern: Punkte des Clip-Bereichs wandern mit (gleiche Spur)', carry.move.wander < 1e-9, `max. Abweichung ${carry.move.wander}`);
    check('Mitwandern: Verlauf außerhalb beider Bereiche unverändert', carry.move.outside < 1e-9, `max. Abweichung ${carry.move.outside}; ${JSON.stringify(carry.move.lane)}`);
    check('Mitwandern: ein Rückgängig-Schritt stellt Clip und Kurve her', carry.move.steps === 1 && carry.move.undo);
    check('Mitwandern klingt: verschobener Clip = alter Clip mit alter Kurve', carry.move.audio < 1e-4, `max. Abweichung ${carry.move.audio.toExponential(2)}`);
    check('Mitwandern: Spurwechsel trägt die Kurve auf die Zielspur, Ränder unverändert', carry.track.wander < 1e-9 && carry.track.targetOutside < 1e-9 && carry.track.sourceOutside < 1e-9 && carry.track.steps === 1, JSON.stringify(carry.track));
    check('Mitwandern: Duplizieren kopiert die Punkte, Quelle bleibt', carry.dup.wander < 1e-9 && carry.dup.outside < 1e-9 && carry.dup.clips === 3 && carry.dup.steps === 1, JSON.stringify(carry.dup));
    check('Mitwandern: Mehrfachauswahl verschiebt beide Bereiche korrekt', carry.multi.a < 1e-9 && carry.multi.b < 1e-9 && carry.multi.outside < 1e-9 && carry.multi.steps === 1, JSON.stringify(carry.multi));
    check('Mitwandern: Spur ohne Kurve bekommt keine Punkte', carry.none);
    check('Spur duplizieren und Ebenen übernehmen die Kurve', carry.tracks.dup && carry.tracks.stem, JSON.stringify(carry.tracks));
    check('Mitwandern: Kopieren auf andere Spur, Quelle bleibt', carry.copy.wander < 1e-9 && carry.copy.source < 1e-9, JSON.stringify(carry.copy));

    // ================= Realtime = Kurve = Export (6) =================
    const rt = await page.evaluate(async () => {
      const { store, engine, library, renderProject } = window.loopwerk;
      const A = await import('./src/automation.js');
      const pts = [{ beat: 0, value: 0 }, { beat: 4, value: 1 }, { beat: 8, value: 0.2 }];
      store.replace({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: true, startBeat: 0, endBeat: 8 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }], automation: { volume: pts } }],
      });
      await engine.play(3);
      const param = () => engine.mix.tracks.get('t1').auto.gain;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const samples = [];
      let jumped = false;
      let lastBeat = 3;
      for (let k = 0; k < 40 && samples.filter((x) => x.jumped).length < 4; k++) {
        await wait(170);
        const beat = engine.currentBeat();
        if (beat < lastBeat) jumped = true;
        lastBeat = beat;
        // nicht direkt am Loop-Sprung messen
        if (beat < 0.15 || beat > 7.85) continue;
        samples.push({ beat, got: param().value, want: A.autoValueAt(pts, beat), jumped });
      }
      const stopBeat = engine.currentBeat();
      engine.stop();
      await wait(120);
      const rest = { got: param().value, want: A.autoValueAt(pts, stopBeat) };
      // Kurve im Stillstand löschen: der nächste Start klingt wieder ohne Kurve (1)
      store.clearAutomation('t1', 'volume');
      await engine.play(0);
      await wait(250);
      rest.free = param().value;
      engine.stop();
      store.undo();
      const off = (await renderProject(store.project, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      for (const s of samples) s.export = off[Math.round(s.beat * 22050)];
      return { samples, rest };
    });
    const dRt = Math.max(...rt.samples.map((s) => Math.abs(s.got - s.want)));
    const dEx = Math.max(...rt.samples.map((s) => Math.abs(s.export - s.got)));
    const afterJump = rt.samples.filter((s) => s.jumped);
    check('6 Realtime: Parameter folgt der Kurve (≥ 10 Zeitpunkte)', rt.samples.length >= 10 && dRt < 0.02, `max. Abweichung ${dRt.toFixed(4)} bei ${rt.samples.length} Proben`);
    check('6 Realtime: nach dem Loop-Sprung wieder Werte vom Anfang', afterJump.length >= 2 && afterJump.every((s) => Math.abs(s.got - s.want) < 0.02 && s.beat < 7), JSON.stringify(afterJump.map((s) => [s.beat.toFixed(2), s.got.toFixed(3)])));
    check('6 Export = Realtime an denselben Schlägen', dEx < 0.02, `max. Abweichung ${dEx.toFixed(4)}`);
    check('6 Stillstand hält den Wert (keine aufblühende Hall-Fahne), nach Löschen der Kurve startet die Spur mit 1', Math.abs(rt.rest.got - rt.rest.want) < 0.02 && rt.rest.want < 0.9 && Math.abs(rt.rest.free - 1) < 1e-4, JSON.stringify(rt.rest));

    // ================= Live-Änderung (7) =================
    const lv = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const A = await import('./src/automation.js');
      store.replace({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 16, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 64, offsetBeats: 0 }], automation: { volume: [{ beat: 0, value: 0.2 }, { beat: 60, value: 0.2 }] } }],
      });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await engine.play(0);
      await wait(400);
      let kills = 0;
      const kill = engine._kill.bind(engine);
      engine._kill = (...a) => { kills++; return kill(...a); };
      const voices = engine.voices.size;
      store.moveAutoPoint('t1', 'volume', 0, 0, 0.9);
      const p0 = engine.mix.tracks.get('t1').auto.gain.value;
      await wait(300);
      const beat = engine.currentBeat();
      const got = engine.mix.tracks.get('t1').auto.gain.value;
      const want = A.autoValueAt(A.laneOf(store.project.tracks[0], 'volume'), beat);
      const out = { p0, got, want, beat, playing: engine.playing, kills, voices, voicesAfter: engine.voices.size };
      engine._kill = kill;
      engine.stop();
      return out;
    });
    check('7 Live: nach 300 ms folgt der Parameter der neuen Kurve', Math.abs(lv.got - lv.want) < 0.02 && Math.abs(lv.p0 - 0.2) < 0.01, JSON.stringify(lv));
    check('7 Live: Wiedergabe läuft weiter, keine Stimme abgebrochen', lv.playing && lv.kills === 0 && lv.voices > 0 && lv.voicesAfter > 0, `Abbrüche ${lv.kills}, Stimmen ${lv.voices} → ${lv.voicesAfter}`);

    // ================= Stufe (3) =================
    const step = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const A = await import('./src/automation.js');
      const p = {
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }],
          automation: { volume: [{ beat: 4, value: 0.2, curve: 'step' }, { beat: 8, value: 1 }, { beat: 12, value: 0.6, curve: 'step' }, { beat: 14, value: 0.1 }] } }],
      };
      const d = (await renderProject(p, library, { limiter: false, toBeat: 16 })).getChannelData(0);
      const sr = 44100;
      const idx = (b) => Math.round(b * 0.5 * sr);
      // Beginn (erste Probe weg vom alten Wert) und Ende (erste Probe am neuen Wert) des Sprungs
      const jump = (from, to, lo, hi) => {
        let i0 = -1;
        let i1 = -1;
        for (let i = idx(from); i < idx(to); i++) {
          if (i0 < 0 && Math.abs(d[i] - lo) > 1e-4) i0 = i;
          if (i1 < 0 && Math.abs(d[i] - hi) < 1e-4) { i1 = i; break; }
        }
        let maxStep = 0;
        for (let i = idx(from); i < idx(to); i++) maxStep = Math.max(maxStep, Math.abs(d[i + 1] - d[i]));
        return { dur: i1 - i0, i0, i1, maxStep };
      };
      return {
        want: A.STEP_BEATS * 0.5 * sr,
        up: jump(6, 10, 0.2, 1), down: jump(12.5, 14.5, 0.6, 0.1),
        hold: [5, 7, 7.98, 12.5, 13.98].map((b) => d[idx(b)]),
      };
    });
    for (const [name, j, delta] of [['hoch 0,2 → 1', step.up, 0.8], ['runter 0,6 → 0,1', step.down, 0.5]]) {
      const lim = (delta / step.want) * 1.05;
      check(`3 Stufe ${name}: Sprung dauert 1/128 Schlag (± 1 Probe)`, Math.abs(j.dur - step.want) <= 1, `${j.dur} Proben (${j.i0}–${j.i1}), erwartet ${step.want.toFixed(2)}`);
      check(`3 Stufe ${name}: knackfrei (größter Schritt ≤ Δ / Sprungdauer · 1,05)`, j.maxStep <= lim, `größter Schritt ${j.maxStep.toFixed(5)}, Grenze ${lim.toFixed(5)}`);
    }
    check('3 Stufe hält den Wert bis kurz vor dem nächsten Punkt', [0.2, 0.2, 0.2, 0.6, 0.6].every((v, i) => Math.abs(step.hold[i] - v) < 1e-4), step.hold.map((v) => v.toFixed(5)).join(' '));

    // ================= Besitz (8): Panorama-Kurve, Regler, Lautstärke × Fader =================
    // StereoPanner mit Stereo-Eingang (Gleichspannung 1 auf beiden Kanälen)
    const panOut = (p) => {
      const x = (p <= 0 ? p + 1 : p) * Math.PI / 2;
      return p <= 0 ? [1 + Math.cos(x), Math.sin(x)] : [Math.cos(x), 1 + Math.sin(x)];
    };
    const own = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const M = await import('./src/model.js');
      const proj = (pan, automation, volume = 1) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume, pan, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 16, offsetBeats: 0 }], ...(automation ? { automation } : {}) }],
      });
      const render = async (p) => { const b = await renderProject(p, library, { limiter: false, toBeat: 16 }); return [b.getChannelData(0), b.getChannelData(1)]; };
      const idx = (b) => Math.round(b * 22050);
      const pan = [{ beat: 0, value: -1 }, { beat: 4, value: -0.5 }, { beat: 8, value: 0.5 }, { beat: 12, value: 1, curve: 'step' }, { beat: 14, value: -0.25 }];
      const a = await render(proj(0, { pan }));
      const b = await render(proj(0.8, { pan }));
      let diff = 0;
      for (let c = 0; c < 2; c++) for (let i = 0; i < a[c].length; i++) diff = Math.max(diff, Math.abs(a[c][i] - b[c][i]));
      const at = [2, 4, 6, 8, 10, 13, 15].map((x) => ({ b: x, l: a[0][idx(x)], r: a[1][idx(x)] }));
      // Kurve löschen über den Store: der Reglerwert (0,8) klingt wieder
      const st = new M.Store(proj(0.8, { pan }), { sampleBeats: () => 4 });
      st.clearAutomation('t1', 'pan');
      const free = await render(st.project);
      // Lautstärke-Kurve × Fader 0,5
      const vol = [{ beat: 0, value: 0 }, { beat: 8, value: 1 }];
      const half = await render(proj(0, { volume: vol }, 0.5));
      return { diff, at, free: [free[0][idx(6)], free[1][idx(6)]], gone: !('automation' in st.project.tracks[0]), steps: st.undoStack.length,
        half: [2, 4, 8, 12].map((x) => ({ b: x, got: half[0][idx(x)] })) };
    });
    const A = await import(pathToFileURL(path.join(__dirname, '../src/automation.js')).href);
    const panPts = [{ beat: 0, value: -1 }, { beat: 4, value: -0.5 }, { beat: 8, value: 0.5 }, { beat: 12, value: 1, curve: 'step' }, { beat: 14, value: -0.25 }];
    check('8 Pan-Kurve aktiv: anderer Reglerwert ändert den Klang nicht (offline bitgleich)', own.diff === 0, `max. Differenz ${own.diff}`);
    const panDev = Math.max(...own.at.map((x) => { const [l, r] = panOut(A.autoValueAt(panPts, x.b)); return Math.max(Math.abs(x.l - l), Math.abs(x.r - r)); }));
    check('8 Pan-Kurve klingt an den Punkten und dazwischen (StereoPanner-Formel, auch Stufe)', panDev < 1e-4, `max. Abweichung ${panDev.toExponential(2)}`);
    const [fl, fr] = panOut(0.8);
    check('8 Kurve löschen (ein Schritt): Reglerwert 0,8 klingt wieder', own.gone && own.steps === 1 && Math.abs(own.free[0] - fl) < 1e-4 && Math.abs(own.free[1] - fr) < 1e-4, `${own.free.map((v) => v.toFixed(4))} erwartet ${[fl, fr].map((v) => v.toFixed(4))}`);
    check('8 Lautstärke-Kurve × Fader 0,5 = halber Pegel', own.half.every((x) => Math.abs(x.got - 0.5 * Math.min(1, x.b / 8)) < 1e-4), own.half.map((x) => `${x.b}: ${x.got.toFixed(4)}`).join(', '));

    // Realtime: Regler gesperrt, Übergabe beim Löschen (auch ohne cancelAndHoldAtTime wie in Firefox), Realtime = Export
    const rtPan = await page.evaluate(async () => {
      const { store, engine, library, renderProject } = window.loopwerk;
      const A = await import('./src/automation.js');
      const pts = [{ beat: 0, value: -1 }, { beat: 4, value: 1 }, { beat: 8, value: -1 }];
      const proj = () => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: true, startBeat: 0, endBeat: 8 }, master: { volume: 1 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0.3, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'test-dc', startBeat: 0, lengthBeats: 32, offsetBeats: 0 }], automation: { pan: pts } }],
      });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const param = () => engine.mix.tracks.get('t1').pan.pan;
      const near = (beat) => beat > 0.15 && beat < 7.85 && Math.abs(beat - 4) > 0.15; // nicht an Knicken oder am Loop-Sprung
      const out = { locked: [], samples: [], release: [] };
      store.replace(proj());
      await engine.play(2);
      await wait(200);
      // Regler bewegen, während die Kurve läuft: der Parameter bleibt auf der Kurve
      for (let k = 0; k < 8; k++) {
        store.setTrack('t1', { pan: k % 2 ? -0.9 : 0.9 }, 'pan-t1');
        await wait(70);
        const beat = engine.currentBeat();
        if (near(beat)) out.locked.push({ beat, got: param().value, want: A.autoValueAt(pts, beat) });
      }
      for (let k = 0; k < 14; k++) {
        await wait(130);
        const beat = engine.currentBeat();
        if (near(beat)) out.samples.push({ beat, got: param().value });
      }
      // Kurve löschen mitten im Lauf: der Regler (−0,9) übernimmt in wenigen Millisekunden
      for (const firefox of [false, true]) {
        const proto = AudioParam.prototype;
        const keep = proto.cancelAndHoldAtTime;
        if (firefox) proto.cancelAndHoldAtTime = undefined;
        store.setTrack('t1', { pan: -0.9 });
        // weit weg vom Reglerwert löschen (Kurve > 0, also zwischen Schlag 2 und 6)
        for (let k = 0; k < 160; k++) { const b = engine.currentBeat(); if (b > 2.2 && b < 5.2) break; await wait(25); }
        const before = { beat: engine.currentBeat(), got: param().value };
        store.clearAutomation('t1', 'pan');
        await wait(60);
        const at60 = param().value;
        await wait(200);
        const at260 = param().value;
        // Kurve kommt zurück (Rückgängig): der Parameter folgt ihr wieder
        store.undo();
        await wait(250);
        const beat = engine.currentBeat();
        out.release.push({ firefox, before, want: A.autoValueAt(pts, before.beat), at60, at260, back: { beat, got: param().value, want: A.autoValueAt(pts, beat) } });
        if (firefox) proto.cancelAndHoldAtTime = keep;
      }
      engine.stop();
      await wait(100);
      // Stillstand mit Kurve: der gehaltene Wert gehört der Kurve, der Regler schreibt nicht hinein
      const held = param().value;
      store.setTrack('t1', { pan: held > 0 ? -0.8 : 0.8 }, 'pan-t1');
      await wait(120);
      out.stoppedLocked = { held, after: param().value };
      // Stillstand: Kurve löschen gibt den Regler mit seinem Wert zurück
      store.setTrack('t1', { pan: 0.4 });
      store.clearAutomation('t1', 'pan');
      await wait(120);
      out.stopped = param().value;
      store.replace(proj());
      const off = await renderProject(store.project, library, { limiter: false, toBeat: 32 });
      const L = off.getChannelData(0);
      const R = off.getChannelData(1);
      for (const s of out.samples) { const i = Math.round(s.beat * 22050); s.l = L[i]; s.r = R[i]; }
      return out;
    });
    const dLock = Math.max(...rtPan.locked.map((x) => Math.abs(x.got - x.want)));
    check('8 Realtime: Pan-Kurve aktiv, Regler bewegen ändert den Parameter nicht', rtPan.locked.length >= 4 && dLock < 0.02, `max. Abweichung ${dLock.toFixed(4)} bei ${rtPan.locked.length} Proben`);
    const dRtOff = Math.max(...rtPan.samples.map((x) => { const [l, r] = panOut(x.got); return Math.max(Math.abs(x.l - l), Math.abs(x.r - r)); }));
    check('8 Pan-Kurve realtime = offline (Export klingt wie der Parameter in der Wiedergabe)', rtPan.samples.length >= 8 && dRtOff < 0.03, `max. Abweichung ${dRtOff.toFixed(4)} bei ${rtPan.samples.length} Proben`);
    for (const r of rtPan.release) {
      const tag = r.firefox ? ' (ohne cancelAndHoldAtTime)' : '';
      check(`8 Kurve löschen im Lauf${tag}: Regler −0,9 klingt nach 60 ms`, Math.abs(r.at60 + 0.9) < 0.03 && Math.abs(r.at260 + 0.9) < 1e-3 && Math.abs(r.want + 0.9) > 0.5, JSON.stringify(r));
      check(`8 Rückgängig${tag}: Kurve übernimmt wieder`, Math.abs(r.back.got - r.back.want) < 0.03, JSON.stringify(r.back));
    }
    check('8 Stillstand mit Pan-Kurve: Regler bewegen ändert den gehaltenen Wert nicht', Math.abs(rtPan.stoppedLocked.after - rtPan.stoppedLocked.held) < 1e-4, JSON.stringify(rtPan.stoppedLocked));
    check('8 Stillstand: Kurve löschen gibt den Reglerwert zurück', Math.abs(rtPan.stopped - 0.4) < 1e-3, `${rtPan.stopped}`);

    check('Keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Testlauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
