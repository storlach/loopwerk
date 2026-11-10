// Tests für die Send-Busse (2.14, ADR 008): node tests/sends.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Läuft im Browser: Projekt-Bausteine und Messungen unter window.__sd
function installHelpers() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr); }
  library.register({ id: 'test-sine', name: 'Sinus', category: 'fx', lengthBeats: 4, bpm: 120, buffer: buf });
  const clip = (id, sampleId, startBeat, lengthBeats) => ({ id, sampleId, startBeat, lengthBeats, offsetBeats: 0 });
  const track = (id, extra = {}, clips = []) => ({ id, name: id, volume: 1, pan: 0, mute: false, solo: false, clips, ...extra });
  window.__sd = {
    clip, track,
    project(tracks, extra = {}) {
      return { version: 1, name: 'sends', bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 }, tracks, ...extra };
    },
    // Impuls auf Spur t1 mit Send zum Echo-Bus (1/4, ohne Wiederholungen)
    echoProject({ send = 1, bus = 0.8, vol = 1, pan = 0, mute = false, busMute = false, solo2 = false, bpm = 120 } = {}) {
      const p = this.project([track('t1', { volume: vol, pan, mute, sends: send ? { echo: send } : undefined }, [clip('c1', 'test-click', 0, 4)]), track('t2', { solo: solo2 })],
        { buses: { echo: { volume: bus, mute: busMute, time: '1/4', feedback: 0 } } });
      p.bpm = bpm;
      return p;
    },
    db(x) { return x > 0 ? 20 * Math.log10(x) : -Infinity; },
    maxAbs(d, a, b) { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(d[i])); return m; },
    energy(d, a, b) { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return e; },
    diff(a, b, to = Infinity) {
      let d = 0;
      for (let c = 0; c < 2; c++) { const x = a.getChannelData(c); const y = b.getChannelData(c); const n = Math.min(x.length, y.length, to); for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(x[i] - y[i])); }
      return d;
    },
    // Abklingzeit bis −30 dB unter der Spitze der Hüllkurve (10-ms-Fenster)
    decay30(d, from) {
      const w = 441;
      const env = [];
      for (let i = from; i + w <= d.length; i += w) env.push(Math.sqrt(this.energy(d, i, i + w) / w));
      let pk = 0, at = 0;
      env.forEach((v, i) => { if (v > pk) { pk = v; at = i; } });
      for (let i = at; i < env.length; i++) if (env[i] < pk * Math.pow(10, -30 / 20)) return ((i - at) * w) / sr;
      return Infinity;
    },
  };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installHelpers);

    // ---------- 8. Nur nass ----------
    const t8 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const o = { toBeat: 4, limiter: false };
      const dry = await renderProject(S.echoProject({ send: 0 }), library, o);
      const wet = await renderProject(S.echoProject({ send: 1 }), library, o);
      const at = (t) => Math.round(t * 44100);
      const d = wet.getChannelData(0);
      let first = -1;
      for (let i = at(0.1); i < d.length; i++) if (Math.abs(d[i]) > 1e-4) { first = i; break; }
      return { early: S.diff(dry, wet, at(0.49)), echo: S.maxAbs(d, at(0.49), at(0.6)), first };
    });
    check('8 Nur nass: bis 0,49 s identisch mit dem Signal ohne Send (< 1e-7)', t8.early < 1e-7, `${t8.early.toExponential(2)}`);
    check('8 Echo-Bus: Echo erst bei 0,5 s (1/4 bei 120 BPM)', t8.first === 22050 && t8.echo > 0.01, `erste Probe ${t8.first}, Spitze ${t8.echo.toFixed(4)}`);

    // ---------- 9. Pegel ∝ (Send · Bus-Fader · Spur-Fader)² ----------
    const t9 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const at = (t) => Math.round(t * 44100);
      const e = async (opt) => { const b = await renderProject(S.echoProject(opt), library, { toBeat: 4, limiter: false }); return S.energy(b.getChannelData(0), at(0.45), at(0.75)); };
      const base = await e({});
      const r = {};
      for (const [k, opt] of [['send', { send: 0.5 }], ['bus', { bus: 0.4 }], ['vol', { vol: 0.5 }]]) r[k] = 10 * Math.log10((await e(opt)) / base);
      return { base, r };
    });
    for (const [k, label] of [['send', 'Send'], ['bus', 'Bus-Fader'], ['vol', 'Spur-Fader']]) {
      check(`9 ${label} halbiert: Echo −6,02 dB ± 0,05`, Math.abs(t9.r[k] + 6.0206) <= 0.05, `${t9.r[k].toFixed(3)} dB`);
    }

    // ---------- 10. Hinter Fader und Panorama ----------
    const t10 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const at = (t) => Math.round(t * 44100);
      const o = { toBeat: 4, limiter: false };
      const busPart = async (opt, ch = 0) => S.db(S.maxAbs((await renderProject(S.echoProject(opt), library, o)).getChannelData(ch), at(0.45), at(1.5)));
      const dry = await renderProject(S.echoProject({ send: 0 }), library, o);
      const busMute = await renderProject(S.echoProject({ busMute: true }), library, o);
      return {
        mute: await busPart({ mute: true }), solo: await busPart({ solo2: true }),
        busMute: S.diff(dry, busMute), panL: await busPart({ pan: -1 }, 0), panRL: await busPart({ pan: 1 }, 0),
      };
    });
    check('10 Spur stumm: Bus unter −120 dB', t10.mute < -120, `${t10.mute} dB`);
    check('10 Andere Spur solo: Bus unter −120 dB', t10.solo < -120, `${t10.solo} dB`);
    check('10 Bus stumm: nur das trockene Signal', t10.busMute < 1e-7, t10.busMute.toExponential(2));
    // Vor dem Panorama klänge der Bus bei −1 und +1 gleich. Das Echo verteilt die Mitte als Ping-Pong (erste Wiederholung
    // links), die Seite bleibt: links ist das Echo einer Quelle ganz links deutlich lauter als das einer Quelle ganz rechts.
    check('10 Send hinter dem Panorama: Bus links bei Panorama −1 mindestens 10 dB lauter als bei +1', t10.panL > -60 && t10.panL - t10.panRL >= 10,
      `links bei −1 ${t10.panL.toFixed(1)} dB, bei +1 ${t10.panRL.toFixed(1)} dB`);

    // ---------- 11. Hall-Bus ----------
    const t11 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const at = (t) => Math.round(t * 44100);
      const mk = (send, size) => S.project([S.track('t1', { sends: { hall: send } }, [S.clip('c1', 'test-click', 0, 4)])], { buses: { hall: { volume: 0.8, size } } });
      const o = { toBeat: 8, limiter: false };
      const r = async (send, size) => (await renderProject(mk(send, size), library, o)).getChannelData(0);
      const a = await r(1, 0.6);
      const b = await r(0.5, 0.6);
      const ratio = 10 * Math.log10(S.energy(b, at(0.2), at(1.0)) / S.energy(a, at(0.2), at(1.0)));
      const small = S.decay30(await r(1, 0.2), at(0.005));
      const large = S.decay30(await r(1, 0.8), at(0.005));
      return { ratio, small, large, tail: S.energy(a, at(0.2), at(1.0)) };
    });
    check('11 Hall-Bus: Fahnen-Energie 0,2–1,0 s ∝ Send² (−6,02 dB ± 0,1)', Math.abs(t11.ratio + 6.0206) <= 0.1 && t11.tail > 1e-4, `${t11.ratio.toFixed(3)} dB`);
    check('11 Raumgröße 0,2 → 0,8 verlängert die Abklingzeit (−30 dB) mindestens auf das Doppelte', t11.large >= 2 * t11.small, `${t11.small.toFixed(3)} s → ${t11.large.toFixed(3)} s`);

    // ---------- 12. Tempo ----------
    const t12 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const b = await renderProject(S.echoProject({ bpm: 90 }), library, { toBeat: 4, limiter: false });
      const d = b.getChannelData(0);
      let first = -1;
      for (let i = 2000; i < d.length; i++) if (Math.abs(d[i]) > 1e-4) { first = i; break; }
      return { first, want: Math.round((60 / 90) * 44100) };
    });
    check('12 Echo-Bus 1/4 bei 90 BPM: Echo bei 0,6667 s ± 1 Probe', Math.abs(t12.first - t12.want) <= 1, `Probe ${t12.first}, erwartet ${t12.want}`);

    // ---------- 13. Stems ----------
    const t13 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const S = window.__sd;
      const p = S.project([
        S.track('t1', { volume: 0.7, pan: -0.4, sends: { hall: 0.3, echo: 0.6 }, fx: { filter: { on: true, cutoff: 0.6 } } }, [S.clip('c1', 'test-sine', 0, 4)]),
        S.track('t2', { volume: 0.5, pan: 0.5, sends: { hall: 0.8 } }, [S.clip('c2', 'test-click', 0, 8)]),
        S.track('t3', { volume: 0.9, sends: { echo: 1 }, fx: { drive: { on: true } } }, [S.clip('c3', 'test-sine', 4, 4)]),
        S.track('t4', { volume: 0.6 }, [S.clip('c4', 'test-dc', 2, 2)]),
      ], { buses: { hall: { volume: 0.7, size: 0.4 }, echo: { volume: 0.9, time: '1/8d', feedback: 0.5 } }, master: { volume: 0.6, fx: { eq: { on: true, low: 4 } } } });
      const o = { toBeat: 8, limiter: false, tailSeconds: 2.5, master: false };
      const ref = await renderProject(p, library, o);
      const sum = [new Float32Array(ref.length), new Float32Array(ref.length)];
      const stems = {};
      for (const t of p.tracks) {
        const b = await renderProject(p, library, { ...o, onlyTrack: t.id });
        stems[t.id] = b;
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) sum[c][i] += d[i]; }
      }
      let diff = 0, peak = 0;
      for (let c = 0; c < 2; c++) { const r = ref.getChannelData(c); for (let i = 0; i < r.length; i++) { diff = Math.max(diff, Math.abs(r[i] - sum[c][i])); peak = Math.max(peak, Math.abs(r[i])); } }
      // Spur ohne Send: wie heute (Projekt ganz ohne Busse und Sends)
      const plain = { ...p, buses: undefined, tracks: p.tracks.map((t) => ({ ...t, sends: undefined })) };
      const today = await renderProject(plain, library, { ...o, onlyTrack: 't4' });
      // Bus-Anteil in der Stem: t2 (Klick) klingt nach 0,5 s noch (Hall), ohne Send nicht
      const t2plain = await renderProject(plain, library, { ...o, onlyTrack: 't2' });
      const at = (t) => Math.round(t * 44100);
      return { diff: S.db(diff), peak, t4: S.diff(stems.t4, today), withBus: S.maxAbs(stems.t2.getChannelData(0), at(0.3), at(1.5)), noBus: S.maxAbs(t2plain.getChannelData(0), at(0.3), at(1.5)) };
    });
    check('13 Stems: Summe der Einzelspuren = Mix ohne Master-Kette (< −90 dB)', t13.diff < -90 && t13.peak > 0.1, `${t13.diff.toFixed(1)} dB, Spitze ${t13.peak.toFixed(3)}`);
    check('13 Stem enthält ihren Bus-Anteil (Hall-Fahne der Klick-Spur)', t13.withBus > 1e-4 && t13.noBus < 1e-6, `mit Bus ${t13.withBus.toExponential(2)}, ohne ${t13.noBus.toExponential(2)}`);
    check('13 Spur ohne Send rendert bitgleich zu heute', t13.t4 === 0, t13.t4.toExponential(2));

    // ---------- Graph: Bus entsteht erst mit einem Send, live ein und aus ----------
    const tg = await page.evaluate(async () => {
      const { buildMix, syncMix } = await import('./src/engine.js');
      const S = window.__sd;
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const p = S.echoProject({ send: 0 });
      const mix = buildMix(ctx, p, { limiter: false });
      const out = { none: mix.buses.size };
      const on = S.echoProject({ send: 0.5 });
      syncMix(ctx, on, mix, 0.5, true);
      out.on = [...mix.buses.keys()];
      out.sendGain = mix.tracks.get('t1').sends.echo?.gain.value;
      syncMix(ctx, p, mix, 0.5, true);
      out.kept = mix.buses.size;
      return out;
    });
    check('Bus entsteht erst mit einem Send und bleibt im laufenden Mix', tg.none === 0 && JSON.stringify(tg.on) === '["echo"]' && tg.kept === 1, JSON.stringify(tg));

    // ---------- 16. Modell und Undo ----------
    const t16 = await page.evaluate(async () => {
      const m = await import('./src/model.js');
      const { store } = window.loopwerk;
      const S = window.__sd;
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-dc', 0, 4)]), S.track('t2')]));
      const steps = () => store.undoStack.length;
      const out = {};
      const s0 = steps();
      for (const v of [0.1, 0.2, 0.35]) store.setSend('t1', 'hall', v, 'send-t1-hall');
      out.drag = { steps: steps() - s0, v: store.project.tracks[0].sends };
      store.setSend('t1', 'echo', 2);
      out.clamp = store.project.tracks[0].sends.echo;
      store.setSend('t1', 'echo', 0);
      out.zero = JSON.stringify(store.project.tracks[0].sends);
      store.setSend('t1', 'hall', 0);
      out.empty = 'sends' in store.project.tracks[0];
      store.undo();
      out.undo = store.project.tracks[0].sends?.hall;
      store.setSend('t1', 'bogus', 0.5);
      out.bogus = !store.project.tracks[0].sends?.bogus;
      const b0 = steps();
      store.setBus('hall', { volume: 0.5 }, 'bus-hall-vol');
      store.setBus('hall', { volume: 0.4 }, 'bus-hall-vol');
      store.setBus('echo', { time: '1/8', feedback: 0.6, mute: true, nope: 1 });
      out.bus = { steps: steps() - b0, buses: store.project.buses };
      const json = JSON.stringify(store.project);
      out.round = JSON.stringify(JSON.parse(json)) === json && m.isValidProject(JSON.parse(json));
      const bad = (patch) => m.isValidProject({ ...JSON.parse(json), ...patch });
      out.rejectSends = !bad({ tracks: [{ ...JSON.parse(json).tracks[0], sends: [] }] });
      out.rejectBuses = !bad({ buses: [] });
      const ids = store.insertStemTracks('c1', [{ name: 'Ebene', sampleId: 'test-dc' }]);
      out.stems = store.track(ids[0])?.sends;
      out.stemCopy = store.track(ids[0])?.sends !== store.project.tracks[0].sends;
      const dup = store.duplicateTrack(store.project.tracks[0].id);
      out.dup = store.track(dup)?.sends;
      store.clearSong();
      out.cleared = store.project.buses;
      return out;
    });
    check('16 setSend beim Ziehen: ein Schritt', t16.drag.steps === 1 && t16.drag.v.hall === 0.35, JSON.stringify(t16.drag));
    check('16 setSend begrenzt auf 0…1, 0 löscht den Eintrag, leeres Objekt fällt weg', t16.clamp === 1 && t16.zero === '{"hall":0.35}' && t16.empty === false, JSON.stringify(t16));
    check('16 Undo stellt den Send wieder her, unbekannter Bus wird ignoriert', t16.undo === 0.35 && t16.bogus);
    // Ohne Fassung "v" (seit 2026-11 gibt es nur noch eine): der Send schreibt nichts in project.buses
    check('16 setBus: Werte gesetzt (unbekannte ignoriert), Ziehen ein Schritt',
      t16.bus.steps === 2 && JSON.stringify(t16.bus.buses) === '{"hall":{"volume":0.4},"echo":{"time":"1/8","feedback":0.6,"mute":true}}', JSON.stringify(t16.bus));
    check('16 JSON hin und zurück gleich; sends: [] und buses: [] ungültig', t16.round && t16.rejectSends && t16.rejectBuses);
    check('16 insertStemTracks und duplicateTrack übernehmen die Sends (Kopie); clearSong lässt die Busse', JSON.stringify(t16.stems) === '{"hall":0.35}' && t16.stemCopy && JSON.stringify(t16.dup) === '{"hall":0.35}' && t16.cleared?.hall?.volume === 0.4,
      JSON.stringify({ stems: t16.stems, dup: t16.dup, cleared: t16.cleared }));

    // ---------- 17. UI Desktop: Inspektor Spur und Song ----------
    await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const S = window.__sd;
      store.replace(S.project([S.track('t1', { fx: { filter: { on: true } } }, [S.clip('c1', 'test-sine', 0, 8)]), S.track('t2', {}, [S.clip('c2', 'test-click', 0, 4)])]));
      ui.selectTrack('t1');
    });
    await page.waitForSelector('#insp-send-hall');
    await page.waitForTimeout(500);
    const setRange = (sel, v) => page.evaluate(([s, v]) => { const n = document.querySelector(s); n.scrollIntoView({ block: 'center', behavior: 'instant' }); n.value = String(v); n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
    const read = () => page.evaluate(() => {
      const t = window.loopwerk.store.project.tracks[0];
      const txt = (id) => document.getElementById(id)?.closest('.insp-row')?.querySelector('output')?.textContent;
      return { sends: t.sends ?? null, buses: window.loopwerk.store.project.buses ?? null, hallOut: txt('insp-send-hall'), echoOut: txt('insp-send-echo') };
    });
    let r = await read();
    check('17 Inspektor Spur: Block „Busse“ mit „→ Hall-Bus“ und „→ Echo-Bus“, aus = „aus“', r.hallOut === 'aus' && r.echoOut === 'aus'
      && await page.evaluate(() => { const b = document.querySelector('.insp-track .insp-buses'); const fx = document.querySelector('.insp-track .fxl'); return !!b && !!(fx.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && b.textContent.includes('→ Hall-Bus') && b.textContent.includes('→ Echo-Bus'); }), JSON.stringify(r));
    // Ziehen am Regler (Maus): Anteil steigt
    const hb = await page.evaluate(() => { const n = document.getElementById('insp-send-hall'); n.scrollIntoView({ block: 'center', behavior: 'instant' }); const q = n.getBoundingClientRect(); return { x: q.left, y: q.top + q.height / 2, w: q.width }; });
    await page.mouse.move(hb.x + 2, hb.y);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.w * 0.3, hb.y, { steps: 5 });
    await page.mouse.up();
    r = await read();
    check('17 „→ Hall-Bus“ ziehen setzt track.sends.hall, Anzeige in %', r.sends?.hall > 0.15 && r.sends.hall < 0.45 && /^\d+ %$/.test(r.hallOut), JSON.stringify(r));
    await page.dblclick('#insp-send-hall');
    r = await read();
    const knob = await page.evaluate(() => Number(document.getElementById('insp-send-hall').value));
    check('17 Doppelklick setzt auf 0 (Eintrag fällt weg, Regler steht auf 0)', r.sends === null && r.hallOut === 'aus' && knob === 0, `${JSON.stringify(r)}, Regler ${knob}`);
    await setRange('#insp-send-echo', 0.5);
    r = await read();
    check('17 „→ Echo-Bus“ setzt track.sends.echo', r.sends?.echo === 0.5 && r.echoOut === '50 %', JSON.stringify(r));
    if (SHOTS) {
      await page.evaluate(() => document.querySelector('.insp-track .insp-buses').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.screenshot({ path: path.join(SHOT_DIR, 'buses-track-desktop.png') });
    }
    // Song: Block „Busse“ unter den Master-Effekten – erst, wenn eine Spur zum Bus sendet
    await page.evaluate(() => { window.loopwerk.ui.selectTrack(null); window.loopwerk.ui.select(null); });
    await page.waitForSelector('#insp .insp-grp-master');
    const shown = () => page.evaluate(() => ({ grp: !document.getElementById('insp-buses').hidden, hall: !document.getElementById('insp-bus-hall').hidden, echo: !document.getElementById('insp-bus-echo').hidden }));
    const onlyEcho = await shown();
    await page.evaluate(() => window.loopwerk.store.setSend('t1', 'echo', 0));
    const none = await shown();
    await page.evaluate(() => { window.loopwerk.store.setSend('t1', 'echo', 0.5); window.loopwerk.store.setSend('t2', 'hall', 0.3); });
    const both = await shown();
    check('17 Song-Block „Busse“ nur, wenn eine Spur sendet; je Bus nur seine Zeilen', !none.grp && onlyEcho.grp && onlyEcho.echo && !onlyEcho.hall && both.hall && both.echo,
      JSON.stringify({ none, onlyEcho, both }));
    await page.waitForSelector('#insp .insp-grp-buses:not([hidden])');
    const order = await page.evaluate(() => [...document.querySelectorAll('#insp .insp-sec:not([hidden]) > .insp-grp')].map((g) => [...g.classList].find((c) => c.startsWith('insp-grp-') || c === 'insp-mst')));
    check('17 Song: Block „Busse“ direkt nach dem Master-Block', order.indexOf('insp-grp-buses') === order.indexOf('insp-grp-master') + 1, JSON.stringify(order));
    await setRange('#insp-bus-hall-volume', 0.5);
    await setRange('#insp-bus-hall-size', 0.3);
    await setRange('#insp-bus-echo-volume', 0.6);
    await setRange('#insp-bus-echo-feedback', 0.2);
    await page.selectOption('#insp-bus-echo-time', '1/4');
    r = await read();
    check('17 Song-Block „Busse“: Lautstärke, Raumgröße, Zeit, Wiederholungen setzen project.buses',
      JSON.stringify(r.buses) === '{"hall":{"volume":0.5,"size":0.3},"echo":{"volume":0.6,"feedback":0.2,"time":"1/4"}}', JSON.stringify(r.buses));
    const busGeom = await page.evaluate(() => {
      const g = document.querySelector('.insp-grp-buses');
      const m = document.querySelector('.insp-grp-master');
      const cs = getComputedStyle(g);
      return { line: cs.borderTopStyle, pad: cs.paddingTop, mt: cs.marginTop, below: g.getBoundingClientRect().top >= m.getBoundingClientRect().bottom };
    });
    check('17 Block „Busse“ mit Trennlinie und gleichem Abstand wie die anderen Blöcke', busGeom.line === 'solid' && busGeom.pad === '18px' && busGeom.mt === '10px' && busGeom.below, JSON.stringify(busGeom));
    if (SHOTS) {
      await page.evaluate(() => document.querySelector('.insp-grp-buses').scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.screenshot({ path: path.join(SHOT_DIR, 'buses-song-desktop.png') });
    }
    // Live: Wiedergabe mit Send, Bus entsteht im laufenden Mix
    const live = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      store.setSend('t2', 'hall', 0);
      await engine.play(0);
      await new Promise((r) => setTimeout(r, 200));
      const before = engine.mix.buses.has('hall');
      store.setSend('t2', 'hall', 0.4);
      await new Promise((r) => setTimeout(r, 120));
      const after = engine.mix.buses.has('hall') && engine.mix.tracks.get('t2').sends.hall.gain.value > 0.3;
      engine.stop();
      return { before, after };
    });
    check('17 Live: erster Send im Lauf baut den Hall-Bus', live.before === false && live.after === true, JSON.stringify(live));
    check('17 Desktop: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
  }

  // ---------- 17. Handy: Mixer → Spur → Karte „Busse“ ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const p = phone.page;
    await p.evaluate(installHelpers);
    await p.evaluate(() => window.loopwerk.store.replace(window.__sd.project([window.__sd.track('t1', {}, [window.__sd.clip('c1', 'test-sine', 0, 8)])])));
    await p.evaluate(() => window.loopwerk.ui.setDock('mixer'));
    await p.waitForSelector('#mixer:not([hidden]) .strip-name');
    await p.tap('#mixer-strips .strip[data-strip-id="t1"] .strip-name');
    await p.waitForSelector('#mixer .fx-bus-card');
    await p.waitForTimeout(600);
    const info = await p.evaluate(() => {
      const c = document.querySelector('#mixer .fx-bus-card');
      c.scrollIntoView({ block: 'center', behavior: 'instant' });
      const cards = [...document.querySelectorAll('#mixer .fx-cards > *')];
      return { last: cards[cards.length - 1] === c || c.previousElementSibling?.classList.contains('fx-card'), text: c.textContent, n: c.querySelectorAll('input[type=range]').length };
    });
    check('17 Handy: Effekt-Seite der Spur hat nach dem Rack die Karte „Busse“ mit zwei Reglern', info.n === 2 && info.text.includes('Busse') && info.text.includes('→ Hall-Bus'), JSON.stringify(info));
    await p.evaluate(() => { const n = document.querySelector('#mixer .fx-bus-card input[type=range]'); n.value = '0.3'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    const sends = await p.evaluate(() => window.loopwerk.store.project.tracks[0].sends);
    check('17 Handy: Regler „→ Hall-Bus“ setzt track.sends.hall', sends?.hall === 0.3, JSON.stringify(sends));
    const tg = (await p.evaluate(measureTargets)).filter((x) => /send|bus/i.test(x.label));
    check('17 Handy: Tippflächen der Bus-Regler ≥ 44 px', tg.length >= 2 && tg.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(tg));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'buses-phone.png') });
    check('17 Handy: keine Konsolenfehler', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (e) {
    check('Handy-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await phone.close();
    finish();
  }
})();
