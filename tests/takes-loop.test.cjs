// Krachwerk Scheibe 3c (Spec docs/specs/krachwerk-3-takes-festhalten.md §2 und §7 „3c“, ADR 009 Nachtrag): ● bei laufendem
// Loop nimmt Takes auf, ohne den Song anzuhalten. Recorder-Modus „loop“, cleanPasses, setRecipe mit Liste, takeGroup,
// Take-Zeile in der Werkbank, Kiste faltet, rote Marke, Einblender. Loopwerk bleibt bei Stopp + Vorzähler.
// node tests/takes-loop.test.cjs [--shots]   (SHOT_DIR=…, Standard docs/ux/krachwerk-3)
// Mikrofon: Loopback-Attrappe wie in v213-aufnahme – getUserMedia liefert engine.out → DelayNode(0,12 s) (+ Testtöne).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const { createChecker } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || path.join(__dirname, '..', 'docs', 'ux', 'krachwerk-3');
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1400, height: 820 } };
const BPM = 90;
const L = 4 * 60 / BPM; // Loop 0–4 bei 90 BPM, in Sekunden

const loopback = () => {
  navigator.mediaDevices.getUserMedia = async () => {
    const lw = window.loopwerk;
    await lw.engine._ensure();
    const ctx = lw.engine.ctx;
    const m = window.__mock || {};
    if (!m.delay) {
      m.delay = ctx.createDelay(1);
      m.delay.delayTime.value = 0.12;
      lw.engine.out.connect(m.delay);
      m.extra = ctx.createGain();
      window.__mock = m;
    }
    if (m.dest) { try { m.delay.disconnect(m.dest); m.extra.disconnect(m.dest); } catch { /* schon getrennt */ } }
    m.dest = ctx.createMediaStreamDestination();
    m.dest.channelCount = 2;
    m.delay.connect(m.dest);
    m.extra.connect(m.dest);
    m.opened = (m.opened || 0) + 1;
    m.last = m.dest.stream;
    return m.last;
  };
};

// Im Browser: Song (Loop 0–4, Impuls bei 0,5 s je Durchgang) auf Spur 1, Loop an, Einblender mitschreiben
async function setup(page, { calibrate }) {
  await page.evaluate(async (cal) => {
    const lw = window.loopwerk;
    const m = await import('/src/model.js');
    lw.engine.stop();
    lw.store.replace(m.createEmptyProject({ tracks: 2, bpm: 90 }));
    const sr = (await lw.engine._ensure(), lw.engine.ctx.sampleRate);
    const n = Math.round(4 * 60 / 90 * sr);
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    for (let c = 0; c < 2; c++) b.getChannelData(c)[Math.round(0.5 * sr)] = 0.6;
    lw.library.register({ id: 'test-song', name: 'Song-Klick', category: 'fx', lengthBeats: 4, bpm: 90, buffer: b });
    lw.store.addClip('t1', 'test-song', 0, 4);
    lw.store.setLoop({ on: true, startBeat: 0, endBeat: 4 });
    lw.ui.select(null);
    window.__flashes = [];
    if (!window.__flashWrapped) {
      const f = lw.ui.flash.bind(lw.ui);
      lw.ui.flash = (t) => { window.__flashes.push(t); f(t); };
      window.__flashWrapped = true;
      window.__stops = 0;
      lw.engine.on((w) => { if (w === 'state' && !lw.engine.playing && lw.recorder.state === 'recording') window.__stops++; });
    }
    if (cal) { localStorage.removeItem('loopwerk.make.recLatency.v1'); await lw.recorder.calibrate(); }
  }, calibrate);
}

// Nach dem Wechsel auf „recording“: Anfang des ersten Takes vorhersagen (erster Loop-Anfang ≥ armTime + 0,25 s) und je
// Durchgang einen Ton (freqs/amps) plus Impuls bei 0,25 s einplanen – so, wie man zum gehörten Song spielt (Summe verzögert)
async function sing(page, { freqs, amps, dc = 0 }) {
  return page.evaluate(({ freqs, amps, dc, L }) => {
    const { engine, recorder } = window.loopwerk;
    const ctx = engine.ctx;
    const m = window.__mock;
    const a = engine.anchors[0];
    const tPlay = a.time - a.beat * engine.spb; // Anker liegen auf Loop-Anfängen (Start bei 0)
    const arm = recorder.loopRec.armTime;
    const k0 = Math.ceil((arm + 0.25 - tPlay) / L - 1e-9);
    const t0 = tPlay + k0 * L;
    const d = engine.playbackDelay();
    const into = ctx.createGain();
    into.connect(m.delay);
    window.__into = into;
    freqs.forEach((f, k) => {
      const o = new OscillatorNode(ctx, { frequency: f });
      const g = new GainNode(ctx, { gain: amps[k] });
      o.connect(g).connect(into);
      o.start(t0 + k * L + d);
      o.stop(t0 + (k + 1) * L + d);
      const b = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: ctx.sampleRate });
      b.getChannelData(0)[0] = 0.9;
      const s = new AudioBufferSourceNode(ctx, { buffer: b });
      s.connect(into);
      s.start(t0 + k * L + 0.25 + d);
    });
    if (dc) { const c = new ConstantSourceNode(ctx, { offset: dc }); c.connect(into); c.start(); window.__dc = c; }
    return { t0, arm, d, now: ctx.currentTime };
  }, { freqs, amps, dc, L });
}

const waitCtx = (page, t) => page.waitForFunction((x) => window.loopwerk.engine.ctx.currentTime >= x, t, { timeout: 40000, polling: 20 });
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: path.join(DIR, name) });
};

// Im Browser: Auswertung der Takes eines Clips
async function analyse(page, clipId) {
  return page.evaluate(async (id) => {
    const { store, library } = window.loopwerk;
    const c = store.findClip(id)?.clip;
    const sr = window.loopwerk.engine.ctx.sampleRate;
    const goertzel = (d, f) => { const w = 2 * Math.PI * f / sr; const k = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; } return s1 * s1 + s2 * s2 - k * s1 * s2; };
    const amp = (d, f) => { let si = 0, co = 0; for (let i = 0; i < d.length; i++) { const p = 2 * Math.PI * f * i / sr; si += d[i] * Math.sin(p); co += d[i] * Math.cos(p); } return 2 * Math.hypot(si, co) / d.length; };
    const argmax = (d, a, b) => { let best = -1, at = -1; for (let i = Math.max(0, a); i < Math.min(d.length, b); i++) if (Math.abs(d[i]) > best) { best = Math.abs(d[i]); at = i; } return at; };
    const takes = [];
    for (const tid of c?.takes || [c?.sampleId].filter(Boolean)) {
      const s = await library.ensure(tid);
      const d = s.orig.getChannelData(0);
      let mean = 0;
      for (let i = 0; i < d.length; i++) mean += d[i];
      mean /= d.length;
      takes.push({
        id: tid, name: s.name, n: s.orig.length, ch: s.orig.numberOfChannels, group: s.made?.group ?? null, from: s.made?.from, mean,
        mk: argmax(d, 0, Math.round(0.4 * sr)), song: argmax(d, Math.round(0.4 * sr), Math.round(0.7 * sr)),
        e: [440, 550, 660, 770].map((f) => goertzel(d, f)), a: [440, 550, 660].map((f) => amp(d, f)),
      });
    }
    return { sr, c: c && { id: c.id, start: c.startBeat, len: c.lengthBeats, take: c.take, n: c.takes?.length, sampleId: c.sampleId }, takes };
  }, clipId);
}

(async () => {
  const { check, finish } = createChecker();
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    // ================= Desktop: 1, 2, 4, 6, 7, 3, 5 =================
    const C = await browser.newContext({ ...DESK });
    await C.addInitScript(loopback);
    const page = await C.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/werkstatt/`);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const ed = await page.evaluate(() => ({ id: window.loopwerk.edition.id, w: window.loopwerk.edition.recordWhilePlaying }));
    check('Krachwerk: Edition „make“ mit recordWhilePlaying „loop“', ed.id === 'make' && ed.w === 'loop', JSON.stringify(ed));

    // ---------- 2 (rein): cleanPasses ----------
    const pure = await page.evaluate(async () => {
      const { cleanPasses } = await import('/src/dsp/clean.js');
      const sr = 44100, n = 44100;
      const mk = (fn) => Float32Array.from({ length: n }, (_, i) => fn(i));
      const quiet = cleanPasses([[mk((i) => (i === 1000 ? 0.01 : 0)), mk((i) => (i === 1000 ? 0.01 : 0))], [mk((i) => (i === 2000 ? 0.005 : 0)), mk((i) => (i === 2000 ? 0.005 : 0))]], sr);
      const stereo = cleanPasses([[mk((i) => 0.3 * Math.sin(i / 7)), mk((i) => 0.3 * Math.cos(i / 5))]], sr);
      const loud = cleanPasses([[mk((i) => (i === 500 ? 1.5 : 0))]], sr);
      const arg = (d) => d.reduce((b, v, i) => (Math.abs(v) > Math.abs(d[b]) ? i : b), 0);
      return {
        qGain: quiet.gain, qCh: quiet.list.map((c) => c.length), qAt: quiet.list.map((c) => arg(c[0])), qLen: quiet.list.map((c) => c[0].length),
        sCh: stereo.list[0].length, lPeak: Math.max(...loud.list[0][0].map(Math.abs)),
      };
    });
    check('2 cleanPasses: leise Takes höchstens +12 dB, Doppel-Mono → 1 Kanal, Lage und Länge unverändert',
      Math.abs(20 * Math.log10(pure.qGain) - 12) < 1e-6 && pure.qCh.every((c) => c === 1) && pure.qAt[0] === 1000 && pure.qAt[1] === 2000 && pure.qLen.every((x) => x === 44100), JSON.stringify(pure));
    check('2 cleanPasses: echtes Stereo bleibt 2 Kanäle, zu laut wird auf 0,89 gesenkt', pure.sCh === 2 && Math.abs(pure.lPeak - 0.89) < 0.01, JSON.stringify(pure));

    // ---------- 1: drei Takes über den laufenden Loop ----------
    await setup(page, { calibrate: true });
    const ownBefore = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
    await page.evaluate(() => window.loopwerk.engine.play(0));
    await page.waitForTimeout(700);
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const plan = await sing(page, { freqs: [440, 550, 660, 770], amps: [0.05, 0.07, 0.1, 0.05], dc: 0.02 });
    const wait0 = await page.evaluate(() => ({
      mode: window.loopwerk.recorder.mode, waiting: window.loopwerk.recorder.waiting, ring: document.getElementById('rec-btn').classList.contains('rec-wait'),
      red: document.getElementById('rec-btn').classList.contains('recording'), take: document.getElementById('app').classList.contains('rec-take'),
      playing: window.loopwerk.engine.playing, flashes: window.__flashes.slice(),
    }));
    check('1 ● bei laufendem Loop: Modus „loop“, Song läuft weiter, kein Vorzähler', wait0.mode === 'loop' && wait0.playing, JSON.stringify(wait0));
    check('1 Bis zum ersten Durchgang: ● pulsiert als Ring (nicht gefüllt), Marke noch nicht rot, Einblender „Ab dem nächsten Durchgang – jeder wird ein Take.“',
      wait0.waiting && wait0.ring && !wait0.red && !wait0.take && wait0.flashes.includes('Ab dem nächsten Durchgang – jeder wird ein Take.'), JSON.stringify(wait0));
    check('1 Erster Take frühestens 0,25 s nach dem Start, am Loop-Anfang', plan.t0 - plan.arm >= 0.25 && plan.t0 - plan.arm < 0.25 + L + 1e-6, `${(plan.t0 - plan.arm).toFixed(3)} s`);
    // Sperren während der Aufnahme (7)
    const lock = await page.evaluate(() => {
      const { store } = window.loopwerk;
      const undo = store.undoStack.length;
      store.setBpm(100);
      store.setLoop({ startBeat: 4, endBeat: 12 });
      return { loop: store.project.loop, bpm: store.project.bpm, undo: store.undoStack.length - undo, flash: window.__flashes[window.__flashes.length - 1] };
    });
    check('7 Während der Aufnahme: Loop und Tempo gesperrt (Projekt unverändert), Einblender', lock.loop.on && lock.loop.startBeat === 0 && lock.loop.endBeat === 4 && lock.bpm === BPM && lock.undo === 0 && /^Während der Aufnahme nicht änderbar\./.test(lock.flash || ''), JSON.stringify(lock));
    await waitCtx(page, plan.t0 + 0.4);
    await page.waitForTimeout(250);
    const during = await page.evaluate(() => {
      const ph = getComputedStyle(document.querySelector('.playhead'));
      return {
        red: document.getElementById('rec-btn').classList.contains('recording'), ring: document.getElementById('rec-btn').classList.contains('rec-wait'),
        take: document.getElementById('app').classList.contains('rec-take'), bg: ph.backgroundColor, w: parseFloat(ph.width),
        flashes: window.__flashes.slice(),
      };
    });
    check('1 Ab dem ersten Durchgang: ● rot, Marke als breite rote Linie (Form und Farbe)', during.red && !during.ring && during.take && /255, 77, 77/.test(during.bg) && during.w >= 3, JSON.stringify(during));
    check('1 Einmal je Gerät beim ersten Take: „Mit Kopfhörern nimmt das Mikro den Song nicht mit auf.“', during.flashes.includes('Mit Kopfhörern nimmt das Mikro den Song nicht mit auf.'), during.flashes.join(' | '));
    await shot(page, 'kw-takes-aufnahme-desktop.png');
    await waitCtx(page, plan.t0 + 3.5 * L);
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const lw = window.loopwerk;
      const t2 = lw.store.project.tracks.find((t) => t.clips.some((c) => c.takes));
      const raw = lw.recorder.chunks;
      let s = 0, n = 0;
      for (const c of raw.slice(-20)) for (let i = 0; i < c.l.length; i++) { s += c.l[i]; n++; }
      return {
        playing: lw.engine.playing, stops: window.__stops, track: t2?.id, clipId: t2?.clips.find((c) => c.takes)?.id, sel: lw.ui.selectedClipId,
        flashes: window.__flashes.slice(), rawDc: s / Math.max(1, n), own: lw.library.list().filter((x) => x.category === 'own').length,
        undoTop: lw.store.undoStack.length,
      };
    });
    check('1 engine.playing blieb die ganze Zeit true, ● beendet nur die Aufnahme', after.playing && after.stops === 0, JSON.stringify({ playing: after.playing, stops: after.stops }));
    check('1 Take-Clip auf der ersten Spur ohne Clip im Loop (Spur 2), gewählt', after.track === 't2' && after.sel === after.clipId, JSON.stringify(after));
    check('1 Einblender „3 Takes – der letzte spielt. Wechseln am Clip.“', after.flashes.includes('3 Takes – der letzte spielt. Wechseln am Clip.'), after.flashes.slice(-2).join(' | '));
    const a1 = await analyse(page, after.clipId);
    const SR = a1.sr;
    const N = Math.round(L * SR);
    check('1 takes.length === 3, take === 2, Clip über den Loop (0, 4 Schläge), sampleId === takes[2]', a1.c?.n === 3 && a1.c.take === 2 && a1.c.start === 0 && a1.c.len === 4 && a1.c.sampleId === a1.takes[2]?.id, JSON.stringify(a1.c));
    check('1 Jeder Take genau N = round(Loop · spb · sr) Frames', a1.takes.length === 3 && a1.takes.every((t) => t.n === N), `${a1.takes.map((t) => t.n).join(', ')} / ${N}`);
    const rel = a1.takes.map((t) => (t.song - t.mk) - Math.round(0.25 * SR));
    const abs = a1.takes.map((t) => t.mk - Math.round(0.25 * SR));
    check('1 Marker bei round(0,25 · sr) ± 2 Samples (zum Song im Take, ohne Verschiebung durchs Säubern)', rel.length === 3 && rel.every((x) => Math.abs(x) <= 2), `relativ ${rel.join(', ')} Samples`);
    check('1 Marker absolut: in allen Takes gleich, ≤ 15 ms (Latenz-Schwankung der Attrappe, s. v213 A2)', abs.every((x) => x === abs[0]) && Math.abs(abs[0]) <= 0.015 * SR, `absolut ${abs.join(', ')} Samples`);
    const dom = a1.takes.map((t, k) => 10 * Math.log10(t.e[k] / Math.max(...t.e.filter((_, j) => j !== k))));
    check('1 In Take k überwiegt Ton k um ≥ 20 dB (Goertzel)', dom.length === 3 && dom.every((x) => x >= 20), dom.map((x) => x.toFixed(1) + ' dB').join(', '));
    const names = a1.takes.map((t) => t.name);
    const baseName = names[0]?.replace(/ · Take \d+$/, '');
    check('1 Namen „<Klang> · Take k“ mit gemeinsamem Namen, Herkunft Mikrofon, eine takeGroup „tk-…“',
      names.every((nm, k) => nm === `${baseName} · Take ${k + 1}`) && a1.takes.every((t) => t.from === 'mic' && /^tk-/.test(t.group || '') && t.group === a1.takes[0].group) && after.own === ownBefore + 3,
      `${names.join(', ')} · ${a1.takes[0]?.group} · ${after.own - ownBefore} neu`);
    const carry = await page.evaluate(async (ids) => {
      const { own, store } = window.loopwerk;
      const emb = await own.embed(store.project);
      const meta = [];
      for (const id of ids) meta.push((await own.readSound(id))?.meta?.takeGroup ?? null);
      return { emb: ids.map((id) => emb.find((e) => e.id === id)?.takeGroup ?? null), meta };
    }, a1.takes.map((t) => t.id));
    check('1 takeGroup im Speicher (Sicherung) und in der Projektdatei', [...carry.emb, ...carry.meta].every((g) => g === a1.takes[0].group), JSON.stringify(carry));
    // ---------- 2: Säubern ----------
    const ratio = 20 * Math.log10(a1.takes[0].a[0] / a1.takes[2].a[2]);
    const want = 20 * Math.log10(0.05 / 0.1);
    check('2 Doppel-Mono → jeder Take 1 Kanal', a1.takes.every((t) => t.ch === 1), a1.takes.map((t) => t.ch).join(', '));
    check('2 Gemeinsamer Pegel: Take 1 / Take 3 wie die Eingabe ± 0,1 dB', Math.abs(ratio - want) <= 0.1, `${ratio.toFixed(3)} dB (Eingabe ${want.toFixed(3)} dB)`);
    check('2 Gleichanteil < 1e-4 (Eingang hatte 0,02)', a1.takes.every((t) => Math.abs(t.mean) < 1e-4) && after.rawDc > 0.01, `${a1.takes.map((t) => t.mean.toExponential(1)).join(', ')} · roh ${after.rawDc.toFixed(4)}`);
    const peak = await page.evaluate(async (ids) => {
      const { library } = window.loopwerk;
      let p = 0;
      for (const id of ids) { const d = (await library.ensure(id)).orig.getChannelData(0); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); }
      return p;
    }, a1.takes.map((t) => t.id));
    check('2 Spitze des lautesten Takes auf 0,89', Math.abs(peak - 0.89) < 0.005, peak.toFixed(4));

    // ---------- 4: Rezept auf alle Takes ----------
    await page.evaluate(() => window.__dc?.stop());
    const render440 = async (f) => page.evaluate(async (freq) => {
      const { store, library, renderProject, engine } = window.loopwerk;
      await library.applyRecipes(store.project);
      const sr = engine.ctx.sampleRate;
      const d = (await renderProject(store.project, library, { limiter: false, fromBeat: 0, toBeat: 4 })).getChannelData(0);
      let si = 0, co = 0;
      for (let i = 0; i < d.length; i++) { const p = 2 * Math.PI * freq * i / sr; si += d[i] * Math.sin(p); co += d[i] * Math.cos(p); }
      return 2 * Math.hypot(si, co) / d.length;
    }, f);
    await page.evaluate(() => { const lw = window.loopwerk; lw.engine.stop(); });
    await page.waitForSelector('#wb-takes:not([hidden])', { timeout: 5000 });
    const row0 = await page.evaluate(() => ({ btns: [...document.querySelectorAll('#wb-takes .take-n')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), del: !!document.getElementById('wb-take-del'), after: document.getElementById('wb-takes').previousElementSibling?.id }));
    check('6 Werkbank: Take-Zeile „1 2 3 ×“ unter der Stammbaum-Zeile, 3 aktiv', JSON.stringify(row0.btns) === '[["1","false"],["2","false"],["3","true"]]' && row0.del && row0.after === 'wb-tree', JSON.stringify(row0));
    await shot(page, 'kw-takes-desktop.png');
    const ref660 = await render440(660);
    await page.click('#wb-take-1');
    await page.waitForFunction(() => window.loopwerk.ui.selectedClipId && window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.take === 0, null, { timeout: 5000 });
    const t1 = await page.evaluate(() => { const c = window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip; return { ok: c.sampleId === c.takes[0], pressed: document.getElementById('wb-take-1').getAttribute('aria-pressed') }; });
    check('6 Take-Zeile „1“ → sampleId === takes[0]', t1.ok && t1.pressed === 'true', JSON.stringify(t1));
    const ref440 = await render440(440);
    await page.click('#wb-tab-form');
    const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.evaluate(() => {
      const i = document.getElementById('wb-gain');
      i.value = '-6';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const rec = await page.evaluate((u) => {
      const { store, ui } = window.loopwerk;
      const c = store.findClip(ui.selectedClipId).clip;
      return { gains: c.takes.map((id) => store.project.recipes?.[id]?.gain ?? null), same: c.takes.every((id) => JSON.stringify(store.project.recipes?.[id]) === JSON.stringify(store.project.recipes?.[c.takes[0]])), undo: store.undoStack.length - u };
    }, u0);
    check('4 Werkbank „Pegel −6“ am Take-Clip: alle drei Rezepte gleich, ein Rückgängig-Schritt', rec.gains.every((g) => g === -6) && rec.same && rec.undo === 1, JSON.stringify(rec));
    const g440 = 20 * Math.log10((await render440(440)) / ref440);
    await page.click('#wb-take-3');
    await page.waitForFunction(() => window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId).clip.take === 2, null, { timeout: 5000 });
    const g660 = 20 * Math.log10((await render440(660)) / ref660);
    check('4 Take wechseln → Render bleibt −6 dB ± 0,5 (Take 1 und Take 3)', Math.abs(g440 + 6) <= 0.5 && Math.abs(g660 + 6) <= 0.5, `${g440.toFixed(2)} dB, ${g660.toFixed(2)} dB`);
    const undo1 = await page.evaluate(() => { const { store, ui } = window.loopwerk; store.undo(); store.undo(); const c = store.findClip(ui.selectedClipId).clip; return c.takes.map((id) => store.project.recipes?.[id]?.gain ?? null); });
    check('4 Rückgängig nimmt den Pegel von allen Takes auf einmal zurück', undo1.every((g) => g == null), JSON.stringify(undo1));
    await page.evaluate(() => window.loopwerk.store.redo());

    // ---------- 6: Kiste faltet die Takes ----------
    const box = await page.evaluate((ids) => {
      const btn = [...document.querySelectorAll('#library .loop-group-btn')].find((b) => /· 3 Takes$/.test(b.textContent));
      return { text: btn?.textContent ?? null, exp: btn?.getAttribute('aria-expanded'), rows: ids.filter((id) => document.querySelector(`#library .loop-item[data-sample-id="${id}"]`)).length, indented: btn?.parentElement.classList.contains('variant') };
    }, a1.takes.map((t) => t.id));
    check('6 Kiste: „<Klang> · 3 Takes“ gefaltet, keine Take-Zeile sichtbar', box.text === `${baseName} · 3 Takes` && box.exp === 'false' && box.rows === 0 && !box.indented, JSON.stringify(box));
    await page.evaluate(() => [...document.querySelectorAll('#library .loop-group-btn')].find((b) => /· 3 Takes$/.test(b.textContent))?.click());
    const opened = await page.evaluate((ids) => ids.filter((id) => document.querySelector(`#library .loop-item[data-sample-id="${id}"]`)).length, a1.takes.map((t) => t.id));
    check('6 Aufklappen zeigt die drei Takes', opened === 3, String(opened));
    await page.click('#wb-take-del');
    await page.waitForFunction(() => window.loopwerk.store.findClip(window.loopwerk.ui.selectedClipId)?.clip.takes?.length === 2, null, { timeout: 5000 }).catch(() => {});
    const del = await page.evaluate(() => { const { store, ui } = window.loopwerk; const c = store.findClip(ui.selectedClipId).clip; return { n: c.takes?.length, ok: c.sampleId === c.takes?.[c.take], btns: document.querySelectorAll('#wb-takes .take-n').length, color: getComputedStyle(document.getElementById('wb-take-del')).color }; });
    check('6 × in der Take-Zeile (Rot) → 2 Takes', del.n === 2 && del.ok && del.btns === 2 && /255, 77, 77/.test(del.color), JSON.stringify(del));
    await page.evaluate(() => window.loopwerk.store.undo());

    // ---------- 7: Leertaste beendet die Aufnahme und hält den Song an ----------
    const pre7 = await page.evaluate(() => ({ tracks: window.loopwerk.store.project.tracks.length, undo: window.loopwerk.store.undoStack.length }));
    await page.evaluate(() => { window.loopwerk.ui.select(null); return window.loopwerk.engine.play(0); });
    await page.waitForTimeout(500);
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const p7 = await sing(page, { freqs: [550, 440], amps: [0.08, 0.08] });
    await waitCtx(page, p7.t0 + 1.3 * L);
    await page.evaluate(() => document.activeElement?.blur()); // Leertaste soll keinen Knopf drücken
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const s7 = await page.evaluate(() => {
      const { store, engine, ui } = window.loopwerk;
      const t = store.project.tracks[store.project.tracks.length - 1];
      const c = store.findClip(ui.selectedClipId)?.clip;
      return { playing: engine.playing, tracks: store.project.tracks.length, onNew: t.clips.some((x) => x.id === c?.id), takes: c?.takes ?? null, undo: store.undoStack.length };
    });
    check('7 Leertaste beendet die Aufnahme und hält den Song an', !s7.playing && s7.onNew && s7.takes === null, JSON.stringify(s7));
    check('7 Kein freier Platz im Loop → neue Spur, Spur und Clip sind ein Rückgängig-Schritt', s7.tracks === pre7.tracks + 1 && s7.undo === pre7.undo + 1, JSON.stringify({ pre7, s7 }));
    await page.evaluate(() => window.loopwerk.store.undo());

    // ---------- 3: ● vor dem ersten Durchgang wieder ● → zu kurz ----------
    await page.evaluate(() => window.loopwerk.engine.play(0));
    // kurz nach einem Loop-Anfang starten, damit der nächste weit weg ist
    await page.evaluate((L_) => {
      const { engine } = window.loopwerk;
      const a = engine.anchors[0];
      const t0 = a.time - a.beat * engine.spb;
      window.__next = t0 + Math.ceil((engine.ctx.currentTime - t0) / L_) * L_ + 0.05;
    }, L);
    await page.waitForFunction(() => window.loopwerk.engine.ctx.currentTime >= window.__next, null, { timeout: 10000, polling: 20 });
    const own3 = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const w3 = await page.evaluate(() => ({ waiting: window.loopwerk.recorder.waiting, ring: document.getElementById('rec-btn').classList.contains('rec-wait') }));
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 10000 });
    await page.waitForTimeout(200);
    const s3 = await page.evaluate(() => ({ own: window.loopwerk.library.list().filter((s) => s.category === 'own').length, hint: window.__flashes[window.__flashes.length - 1], playing: window.loopwerk.engine.playing, ring: document.getElementById('rec-btn').classList.contains('rec-wait') }));
    check('3 ● vor dem ersten Durchgang, wieder ● → Einblender „zu kurz“, kein neuer Sound, Song spielt weiter', w3.waiting && w3.ring && /zu kurz/.test(s3.hint || '') && s3.own === own3 && s3.playing && !s3.ring, JSON.stringify({ w3, s3, own3 }));

    // ---------- 5: Song steht (oder Loop aus) → ● nimmt einen Klang auf ----------
    const m5 = [];
    let silent = null;
    // Testtöne aus Schritt 7 trennen (der zweite ist bis zum Ende seines Durchgangs geplant und klänge sonst hinein)
    await page.evaluate(() => window.__into?.disconnect());
    for (const how of ['steht', 'loop-aus']) {
      await page.evaluate((h) => {
        const { engine, store } = window.loopwerk;
        engine.stop();
        if (h === 'loop-aus') { store.setLoop({ on: false }); return engine.play(0); }
        return null;
      }, how);
      await page.waitForTimeout(300);
      await page.click('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
      m5.push(await page.evaluate(() => window.loopwerk.recorder.mode));
      await page.click('#rec-btn');
      const idle = await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 }).then(() => true, () => false);
      if (how === 'steht') silent = await page.evaluate((ok) => ({ idle: ok, state: window.loopwerk.recorder.state, hint: window.__flashes[window.__flashes.length - 1] }), idle);
      if (!idle) break;
    }
    // Vorher blieb ein stiller Klang für immer in „saving“ (Fehler aus _finishSound wurde nicht abgefangen)
    check('5 Stille ohne Song → „Nichts gehört – nochmal?“, ● ist wieder frei', silent?.idle && silent.hint === 'Nichts gehört – nochmal?', JSON.stringify(silent));
    check('5 Song steht bzw. Loop aus → ● nimmt wie bisher einen Klang auf (Modus „sound“)', m5.join(',') === 'sound,sound', m5.join(','));
    await page.evaluate(() => { window.loopwerk.engine.stop(); window.loopwerk.store.undo(); });
    check('Keine Konsolenfehler (Desktop)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await C.close();

    // ================= Handy: Takes ohne Einmessen, Einmessen-Hinweis, Take-Zeile ≥ 44 px =================
    const H = await browser.newContext({ ...PHONE });
    await H.addInitScript(loopback);
    const hp = await H.newPage();
    const herr = [];
    hp.on('pageerror', (e) => herr.push(e.message));
    hp.on('console', (m) => { if (m.type() === 'error') herr.push(m.text()); });
    await hp.goto(`${base}/werkstatt/`);
    await hp.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await setup(hp, { calibrate: false });
    await hp.evaluate(() => window.loopwerk.engine.play(0));
    await hp.waitForTimeout(600);
    await hp.tap('#rec-btn');
    await hp.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const hplan = await sing(hp, { freqs: [440, 660, 550], amps: [0.08, 0.08, 0.08] });
    await shot(hp, 'kw-takes-warten-handy.png');
    await waitCtx(hp, hplan.t0 + 0.5);
    await hp.waitForTimeout(200);
    await shot(hp, 'kw-takes-aufnahme-handy.png');
    await waitCtx(hp, hplan.t0 + 2.4 * L);
    await hp.tap('#rec-btn');
    await hp.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await hp.waitForTimeout(3400);
    const hres = await hp.evaluate(() => {
      const lw = window.loopwerk;
      const c = lw.store.findClip(lw.ui.selectedClipId)?.clip;
      return { n: c?.takes?.length, take: c?.take, playing: lw.engine.playing, flashes: window.__flashes.slice(), measured: !!lw.recorder.latencyInfo?.measured };
    });
    check('Handy: zwei Takes, der letzte volle spielt, Song läuft weiter', hres.n === 2 && hres.take === 1 && hres.playing, JSON.stringify(hres));
    check('Handy: nicht eingemessen → nach der ersten Take-Aufnahme „Sitzt es nicht im Takt? Song → Aufnahme → Einmessen.“',
      !hres.measured && hres.flashes.includes('2 Takes – der letzte spielt. Wechseln am Clip.') && hres.flashes[hres.flashes.length - 1] === 'Sitzt es nicht im Takt? Song → Aufnahme → Einmessen.', hres.flashes.slice(-3).join(' | '));
    await hp.evaluate(() => { window.loopwerk.engine.stop(); window.loopwerk.ui.setDock('werkbank'); });
    await hp.waitForTimeout(700);
    await hp.evaluate(() => document.getElementById('wb-takes')?.scrollIntoView({ block: 'center' }));
    await hp.waitForTimeout(300);
    const hrow = await hp.evaluate(() => {
      const row = document.getElementById('wb-takes');
      const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
      return { shown: !!row && !row.hidden && row.getClientRects().length > 0, btns: [...row.querySelectorAll('button')].map(r) };
    });
    check('Handy: Take-Zeile in der Werkbank, Tippziele ≥ 44 px', hrow.shown && hrow.btns.length === 3 && hrow.btns.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(hrow));
    await shot(hp, 'kw-takes-handy.png');
    // Zweite Take-Aufnahme: die Hinweise kommen je Gerät nur einmal
    await hp.evaluate(() => { window.loopwerk.ui.setDock(null); window.__flashes = []; return window.loopwerk.engine.play(0); });
    await hp.waitForTimeout(400);
    await hp.tap('#rec-btn');
    await hp.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const h2 = await sing(hp, { freqs: [440, 660], amps: [0.08, 0.08] });
    await waitCtx(hp, h2.t0 + 1.4 * L);
    await hp.tap('#rec-btn');
    await hp.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await hp.waitForTimeout(3400);
    const once = await hp.evaluate(() => window.__flashes.slice());
    check('Handy: Kopfhörer- und Einmessen-Hinweis nur einmal je Gerät', !once.some((t) => /Kopfhörern|Einmessen/.test(t)), once.join(' | '));
    await hp.evaluate(() => window.loopwerk.engine.stop());
    check('Keine Konsolenfehler (Handy)', herr.length === 0, herr.slice(0, 3).join(' | '));
    await H.close();

    // ================= Loopwerk: ● bei laufendem Loop hält an und zählt vor (unverändert) =================
    const W = await browser.newContext({ ...DESK });
    await W.addInitScript(loopback);
    const wp = await W.newPage();
    await wp.goto(`${base}/`);
    await wp.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await wp.evaluate(() => { const { store, engine } = window.loopwerk; store.setLoop({ on: true, startBeat: 0, endBeat: 8 }); return engine.play(0); });
    await wp.waitForTimeout(400);
    await wp.click('#rec-btn');
    await wp.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const lw = await wp.evaluate(() => ({ mode: window.loopwerk.recorder.mode, w: window.loopwerk.edition.recordWhilePlaying, ring: document.getElementById('rec-btn').classList.contains('rec-wait') }));
    check('Loopwerk: ● bei laufendem Loop bleibt Modus „song“ (Stopp + Vorzähler), kein Ring', lw.mode === 'song' && lw.w === null && !lw.ring, JSON.stringify(lw));
    await wp.evaluate(() => window.loopwerk.engine.stop());
    await wp.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    await W.close();
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await browser.close();
    server.close();
    finish();
  }
})();
