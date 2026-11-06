// 2.13 Aufnahme (Spec docs/specs/v2.13-aufnahme.md): A Latenz einmessen, B Takes im Loop, C Mehrspur.
// node tests/v213-aufnahme.test.cjs [--shots]   (SHOT_DIR=… für Bilder)
// Mikrofon: Loopback-Attrappe – getUserMedia liefert engine.out → DelayNode(0,12 s) (+ Testtöne) → MediaStreamDestination.
const fs = require('fs');
const path = require('path');
const { openApp, createChecker, clickR } = require('./harness.cjs');
const { countUi, scene } = require('./count.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, '..', 'docs', 'ux', 'v2.13');
const { check, finish } = createChecker();
const SR = 44100;

// Läuft im Browser vor dem Laden: Loopback-Attrappe. window.__tones = [{ at: Kontextzeit, f, amp }] mischt Töne dazu
// (je Eintrag gilt der Ton ab `at`), window.__markers = [Kontextzeit, …] setzt Impulse in den Mitschnitt.
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
      m.extra = ctx.createGain(); // Testtöne der Attrappe (B, C)
      window.__mock = m;
    }
    // Je Öffnen ein neuer Strom (wie ein echtes Mikrofon); der alte ist nach stop() beendet
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

const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
};

(async () => {
  const ONLY = process.env.ONLY || ''; // „A“, „B“ oder „C“: nur diese Scheibe (schneller beim Entwickeln)
  let app, page;
  if (!ONLY || ONLY === 'A') {
  // ================= A1: Suche und Auswertung, offline =================
  app = await openApp({ init: loopback, viewport: { width: 1440, height: 900 } });
  page = app.page;
  try {
    const pure = await page.evaluate(async () => {
      const L = await import('./src/dsp/loopback.js');
      const { mulberry32 } = await import('./src/util.js');
      const sr = 44100;
      const tpl = L.clickTemplate(sr);
      const times = Array.from({ length: 6 }, (_, k) => 0.3 + 0.6 * k);
      const expected = times.map((t) => Math.round(t * sr));
      // Klicks → DelayNode(D) → Hochpass 120 Hz → Tiefpass 6 kHz (+ Reflexion +4 ms · 0,8) (+ Rauschen −30 dB)
      async function render(D, { refl = true, noise = true, skip = [], burst = [], jitter = null, clicks = true } = {}) {
        const n = Math.round(4.6 * sr);
        const ctx = new OfflineAudioContext(1, n, sr);
        const src = ctx.createBuffer(1, n, sr);
        const d = src.getChannelData(0);
        const rnd = mulberry32(7);
        if (clicks) expected.forEach((e, k) => {
          if (skip.includes(k)) return;
          const at = e + (jitter ? Math.round(jitter[k] * sr) : 0);
          d.set(tpl, at);
        });
        const b = ctx.createBufferSource();
        b.buffer = src;
        const delay = ctx.createDelay(1);
        delay.delayTime.value = D;
        const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 120 });
        const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6000 });
        b.connect(delay).connect(hp).connect(lp).connect(ctx.destination);
        if (refl) {
          const r = ctx.createDelay(1);
          r.delayTime.value = D + 0.004;
          const g = new GainNode(ctx, { gain: 0.8 });
          b.connect(r).connect(g).connect(hp);
        }
        const nb = ctx.createBuffer(1, n, sr);
        const nd = nb.getChannelData(0);
        const rms = 0.5 * 10 ** (-30 / 20);
        if (noise) for (let i = 0; i < n; i++) nd[i] = rms * Math.sqrt(3) * (2 * rnd() - 1);
        // Verdeckt: lauter Rauschstoß über dem ankommenden Klick
        for (const k of burst) { const a = expected[k] + Math.round(D * sr); for (let i = a - 400; i < a + 1200; i++) nd[i] += 0.6 * (2 * rnd() - 1); }
        const ns = ctx.createBufferSource();
        ns.buffer = nb;
        ns.connect(ctx.destination);
        b.start(0);
        ns.start(0);
        return (await ctx.startRendering()).getChannelData(0);
      }
      // Eigene Verzögerung der beiden Filter (Gruppenlaufzeit im Chirp-Band), sauber gemessen bei D = 0
      const ref = L.findClicks(await render(0, { refl: false, noise: false }), sr, expected);
      const tau = ref.reduce((s, x) => s + x, 0) / ref.length;
      const out = {};
      let worst = 0;
      for (const ms of [12, 87, 231, 450]) {
        const D = ms / 1000;
        const t0 = performance.now();
        const offs = L.findClicks(await render(D), sr, expected);
        const res = L.summarize(offs, sr);
        const err = res.frames - D * sr - tau;
        worst = Math.max(worst, Math.abs(err));
        out[ms] = { ms: res.ms, err, raw: res.frames - D * sr, kept: res.kept, t: performance.now() - t0 };
      }
      const masked = L.summarize(L.findClicks(await render(0.087, { skip: [1], burst: [4] }), sr, expected), sr);
      const silent = L.summarize(L.findClicks(await render(0.087, { clicks: false }), sr, expected), sr);
      const rj = mulberry32(3);
      const jitter = expected.map(() => (rj() - 0.5) * 0.06);
      const unsteady = L.summarize(L.findClicks(await render(0.087, { jitter }), sr, expected), sr);
      // Rechenzeit der Suche allein (6 Fenster à 505 ms)
      const sig = await render(0.087);
      const t1 = performance.now();
      L.findClicks(sig, sr, expected);
      const searchMs = performance.now() - t1;
      return { tau, out, worst, masked: { ms: masked.ms, err: masked.frames - 0.087 * sr - tau, kept: masked.kept, error: masked.error }, silent, unsteady, searchMs, tplPeak: Math.max(...tpl.map(Math.abs)), tplLen: tpl.length };
    });
    check('A1 Klick: Chirp 8 ms, Spitze 0,5', pure.tplLen === Math.round(0.008 * SR) && Math.abs(pure.tplPeak - 0.5) < 0.01, `${pure.tplLen} Frames, Spitze ${pure.tplPeak.toFixed(3)}`);
    check('A1 Suche trifft D auf ±1 Sample (12/87/231/450 ms, Hoch-/Tiefpass, Rauschen −30 dB, Reflexion +4 ms)', pure.worst <= 1,
      `größter Fehler ${pure.worst.toFixed(2)} Samples; Filterlaufzeit ${pure.tau.toFixed(2)} Samples; ` + Object.entries(pure.out).map(([k, v]) => `${k}: ${v.ms.toFixed(2)} ms (${v.err.toFixed(2)})`).join(', '));
    check('A1 Mit 2 von 6 verdeckten Klicks (einer fehlt, einer im Rauschstoß) klappt es noch', pure.masked.error == null && Math.abs(pure.masked.err) <= 1 && pure.masked.kept >= 4, JSON.stringify(pure.masked));
    check('A1 Nur Rauschen → „silent“', pure.silent.error === 'silent', JSON.stringify(pure.silent));
    check('A1 Zufälliger Versatz je Klick → „unsteady“', pure.unsteady.error === 'unsteady', JSON.stringify(pure.unsteady));
    check('A1 Suche im Hauptthread unter 0,5 s', pure.searchMs < 500, `${pure.searchMs.toFixed(0)} ms`);

    await app.close();
  } catch (err) {
    check('A1 lief ohne Ausnahme', false, err.stack || err.message);
    await app.close();
  }
  // ================= A2: Einmessen über das Feld (Desktop), eigene Seite ohne Rechenlast davor =================
  app = await openApp({ init: loopback, viewport: { width: 1440, height: 900 } });
  page = app.page;
  try {
    await page.evaluate(() => localStorage.removeItem('loopwerk.recLatency.v1'));
    await page.click('#rec-more');
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ pop: !document.getElementById('rec-pop').hidden, mark: document.getElementById('rs-mark').textContent }));
    check('A2 ▾ öffnet das Feld „Aufnahme“, Latenz „geschätzt“', before.pop && before.mark === 'geschätzt', JSON.stringify(before));
    await shot(page, 'einmessen-desktop-vorher.png');
    await page.click('#rs-cal');
    const busy = await page.evaluate(() => document.getElementById('rs-cal').textContent);
    await page.waitForFunction(() => document.getElementById('rs-mark').textContent === 'eingemessen', null, { timeout: 15000 });
    const a2 = await page.evaluate(() => {
      const all = JSON.parse(localStorage.getItem('loopwerk.recLatency.v1') || '{}');
      const key = document.getElementById('rec-setup').dataset.key;
      return { shown: document.getElementById('rs-lat').textContent, hint: document.getElementById('hint').textContent, key, entry: all[key], keys: Object.keys(all), open: !document.getElementById('rec-pop').hidden };
    });
    await shot(page, 'einmessen-desktop.png');
    const ms1 = a2.entry?.ms;
    check('A2 Knopf zeigt „Misst …“, danach „… ms · eingemessen“ und Einblender', busy === 'Misst …' && /^\d+ ms$/.test(a2.shown) && /Latenz \d+ ms eingemessen\./.test(a2.hint), `${busy} → ${a2.shown} · ${a2.hint}`);
    check('A2 Wert in [120, 200] ms (Attrappe 120 ms + interner Weg)', ms1 >= 120 && ms1 <= 200, `${ms1} ms`);
    check('A2 Gespeichert unter lsKey „loopwerk.recLatency.v1“ und Geräteschlüssel „Eingang|Ausgang“', !!a2.entry && /\|/.test(a2.key) && a2.entry.nudge === 0 && a2.keys.length === 1, JSON.stringify(a2));
    await page.click('#rs-cal');
    await page.waitForFunction(() => document.getElementById('rs-cal').textContent === 'Einmessen', null, { timeout: 15000 });
    const ms2 = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].ms);
    // Chromium öffnet die Mikrofon-Attrappe jedes Mal mit etwas anderem Eingangsweg (gemessen bis 11,6 ms) – das ist der
    // Browser, nicht die Messung; die Genauigkeit der Messung selbst prüfen A1 und A3 auf Samples genau
    check('A2 Zweiter Lauf weicht ≤ 15 ms ab (Browser-Schwankung zwischen Mikrofon-Öffnungen)', Math.abs(ms2 - ms1) <= 15, `${ms1} / ${ms2} ms`);
    const mic = await page.evaluate(() => ({ live: window.__mock.last.getAudioTracks().map((t) => t.readyState), state: window.loopwerk.engine.ctx.state }));
    check('A2 Nach dem Messen ist das Mikrofon zu (Spur beendet), Ausgabe läuft wieder', mic.live.every((s) => s === 'ended') && mic.state === 'running', JSON.stringify(mic));
    const shown0 = parseInt(a2.shown, 10);
    for (let i = 0; i < 3; i++) await page.click('#rs-plus');
    await page.waitForFunction((v) => parseInt(document.getElementById('rs-lat').textContent, 10) === v, Math.round(ms2 + 3), { timeout: 3000 }).catch(() => {});
    const plus3 = await page.evaluate(() => ({ t: document.getElementById('rs-lat').textContent, e: JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key] }));
    await page.keyboard.down('Shift');
    await page.click('#rs-minus');
    await page.keyboard.up('Shift');
    const minus10 = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].nudge);
    await page.click('#rs-plus', { modifiers: ['Shift'] });
    check('A2 3 × + zeigt +3 ms (Handkorrektur 3), Umschalt ändert um 10 ms', parseInt(plus3.t, 10) - Math.round(ms2) === 3 && plus3.e.nudge === 3 && minus10 === -7, `${shown0} → ${plus3.t}, Korrektur ${plus3.e.nudge}, mit Umschalt − ${minus10}`);
    // Halten wiederholt
    const box = await page.locator('#rs-plus').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    const held = await page.evaluate(() => JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].nudge);
    check('A2 Halten wiederholt', held >= 8, `Korrektur nach Halten ${held}`);
    await page.evaluate(() => { const k = document.getElementById('rec-setup').dataset.key; const all = JSON.parse(localStorage.getItem('loopwerk.recLatency.v1')); all[k].nudge = 3; localStorage.setItem('loopwerk.recLatency.v1', JSON.stringify(all)); });
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await page.click('#rec-more');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ t: document.getElementById('rs-lat').textContent, m: document.getElementById('rs-mark').textContent }));
    check('A2 Nach dem Neuladen bleibt „+3“ stehen', parseInt(after.t, 10) === Math.round(ms2 + 3) && after.m === 'eingemessen', `${after.t} · ${after.m} (erwartet ${Math.round(ms2 + 3)} ms)`);
    await page.keyboard.press('Escape');
    // Abbruch: Feld zu während der Messung → Mikrofon sofort aus, alter Wert bleibt
    await page.click('#rec-more');
    await page.click('#rs-cal');
    await page.waitForFunction(() => window.loopwerk.recorder.calibrating && window.__mock?.dest, null, { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.loopwerk.recorder.calibrating, null, { timeout: 5000 });
    const cancel = await page.evaluate(() => ({ live: window.__mock.last.getAudioTracks().map((t) => t.readyState), state: window.loopwerk.engine.ctx.state, ms: JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].ms, nudge: JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].nudge, btn: document.getElementById('rs-cal').textContent }));
    await page.waitForTimeout(300);
    check('A2 Feld zu während der Messung: abgebrochen, Mikrofon zu, alter Wert bleibt', cancel.live.every((s) => s === 'ended') && cancel.ms === ms2 && cancel.nudge === 3 && cancel.btn === 'Einmessen', JSON.stringify(cancel));
    // Fehler: Attrappe stumm → „Kein Klick gehört …“, alter Wert bleibt
    await page.evaluate(() => { window.loopwerk.engine.out.disconnect(window.__mock.delay); });
    await page.click('#rec-more');
    await page.click('#rs-cal');
    await page.waitForFunction(() => document.getElementById('rs-cal').textContent === 'Einmessen', null, { timeout: 15000 });
    const fail = await page.evaluate(() => ({ hint: document.getElementById('hint').textContent, ms: JSON.parse(localStorage.getItem('loopwerk.recLatency.v1'))[document.getElementById('rec-setup').dataset.key].ms }));
    check('A2 Ohne Klick im Mikrofon: Einblender „Kein Klick gehört …“, alter Wert bleibt', /^Kein Klick gehört/.test(fail.hint) && fail.ms === ms2, JSON.stringify(fail));
    await page.evaluate(() => window.loopwerk.engine.out.connect(window.__mock.delay));
    await page.keyboard.press('Escape');

    // ================= A3: Ende zu Ende – Song-Aufnahme sitzt (playbackDelay) =================
    const e2e = async (label) => {
      await page.evaluate(async () => {
        const lw = window.loopwerk;
        const m = await import('./src/model.js');
        lw.store.replace(m.createEmptyProject());
        const sr = 44100;
        const spb = 60 / lw.store.project.bpm;
        const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(4 * spb * sr), sampleRate: sr });
        for (let c = 0; c < 2; c++) for (let k = 0; k < 4; k++) b.getChannelData(c)[Math.round(k * spb * sr)] = 0.5;
        lw.library.register({ id: 'test-beat-click', name: 'Schlag-Klick', category: 'fx', lengthBeats: 4, bpm: 120, buffer: b });
        lw.store.addClip('t1', 'test-beat-click', 0, 8);
        lw.engine.setPosition(0);
        lw.ui.select(null);
      });
      await page.click('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
      await page.waitForFunction(() => window.loopwerk.engine.currentBeat() >= 8.6, null, { timeout: 15000 });
      await page.click('#rec-btn');
      await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 10000 });
      return page.evaluate(() => {
        const { store, library, engine, recorder } = window.loopwerk;
        const c = store.track('t2').clips[0];
        const s = c && library.get(c.sampleId);
        if (!s) return null;
        const d = s.orig.getChannelData(0);
        const sr = s.orig.sampleRate;
        const spb = 60 / store.project.bpm;
        let peak = 0;
        for (const v of d) peak = Math.max(peak, Math.abs(v));
        const hits = [];
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.3 * peak && (!hits.length || i - hits[hits.length - 1] > 2000)) hits.push(i);
        const errs = hits.filter((i) => i < 8 * spb * sr).map((i) => (i - Math.round(i / (spb * sr)) * spb * sr) / sr * 1000);
        return { start: c.startBeat, hits: hits.length, errs, worst: Math.max(...errs.map(Math.abs)), lat: recorder.latency * 1000, measured: recorder.latencyInfo.measured, pd: engine.playbackDelay() * 1000 };
      });
    };
    // Handkorrektur aus A2 zurück auf 0: geprüft wird der gemessene Wert allein
    await page.evaluate(() => { const all = JSON.parse(localStorage.getItem('loopwerk.recLatency.v1')); for (const k of Object.keys(all)) all[k].nudge = 0; localStorage.setItem('loopwerk.recLatency.v1', JSON.stringify(all)); });
    const rec = await e2e('gemessen');
    check('A3 Aufnahme über die Attrappe: Impulse bei k · spb · sr ± 2 ms (mit playbackDelay)', rec && rec.hits >= 8 && rec.worst <= 2 && rec.measured,
      rec && `${rec.hits} Impulse, größte Abweichung ${rec.worst.toFixed(2)} ms, Ausgleich ${rec.lat.toFixed(1)} ms (Summe ${rec.pd.toFixed(2)} ms)`);
    // Gegenprobe: ohne Messung, Test-Delay 0,2 s (die Formel kennt ihn nicht; headless schätzt sie schon ~50 ms Ausgabe)
    await page.evaluate(() => { localStorage.removeItem('loopwerk.recLatency.v1'); window.__mock.delay.delayTime.value = 0.2; });
    const est = await e2e('geschätzt');
    await page.evaluate(() => { window.__mock.delay.delayTime.value = 0.12; });
    check('A3 Gegenprobe ohne Messung (Test-Delay 0,2 s): Abweichung ≥ 100 ms', !!est && !est.measured && Math.min(...est.errs.map(Math.abs)) >= 100,
      est && `Abweichungen ${est.errs.slice(0, 4).map((x) => x.toFixed(1)).join(', ')} ms, geschätzter Ausgleich ${est.lat.toFixed(1)} ms`);
    check('A Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('A Desktop lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
  }

  // ================= A4: Handy 390 px – Fach „Song“ → Einmessen =================
  app = await openApp({ init: loopback, viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  page = app.page;
  try {
    await page.tap('#tab-song');
    await page.waitForTimeout(900);
    const ph = await page.evaluate(() => {
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
      return { inSong: !!document.getElementById('rec-setup').closest('#song-rec'), more: getComputedStyle(document.querySelector('.rec-wrap')).display, cal: r('rs-cal'), minus: r('rs-minus'), plus: r('rs-plus') };
    });
    check('A4 Handy: Feld „Aufnahme“ im Fach „Song“, kein ▾ im Deck', ph.inSong && ph.more === 'none', JSON.stringify(ph));
    check('A4 Handy: Tippziele ≥ 44 px (Einmessen, −, +)', [ph.cal, ph.minus, ph.plus].every((b) => b.w >= 44 && b.h >= 44), JSON.stringify(ph));
    await page.evaluate(() => document.getElementById('rec-setup').scrollIntoView({ block: 'center' }));
    await page.tap('#rs-cal');
    await page.waitForFunction(() => document.getElementById('rs-mark').textContent === 'eingemessen', null, { timeout: 15000 });
    await page.waitForTimeout(200);
    await shot(page, 'einmessen-handy.png');
    const phv = await page.evaluate(() => document.getElementById('rs-lat').textContent);
    check('A4 Handy: zwei Tipps (Fach „Song“, Einmessen) → eingemessen', /^\d+ ms$/.test(phv) && parseInt(phv, 10) >= 120 && parseInt(phv, 10) <= 200, phv);
    // Fach zu während der Messung bricht ab
    await page.tap('#rs-cal');
    await page.waitForFunction(() => window.loopwerk.recorder.calibrating, null, { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.waitForFunction(() => !window.loopwerk.recorder.calibrating, null, { timeout: 5000 });
    const phc = await page.evaluate(() => window.__mock.last.getAudioTracks().every((t) => t.readyState === 'ended'));
    check('A4 Handy: Fach zu während der Messung → abgebrochen, Mikrofon zu', phc);
    check('A4 Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('A4 Handy lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
  }

  // ================= A4: Zählung (count.cjs) =================
  try {
    const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'count-baseline.json'), 'utf8'));
    const now = {}, without = {};
    // Wie tests/count.cjs: frischer Browser, ohne Test-Sounds
    const { chromium } = require('playwright');
    const { start } = require('./serve.cjs');
    const server = await start();
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    for (const [dev, opts] of [['desktop', { viewport: { width: 1400, height: 820 } }], ['handy', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const pg = await browser.newPage(opts);
      await pg.goto(`http://127.0.0.1:${server.address().port}/`);
      await pg.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 45000 });
      await pg.evaluate(() => window.loopwerk.library.catalogReady);
      await pg.waitForTimeout(800);
      for (const s of ['start', 'clip']) {
        await scene(pg, s);
        now[`${dev}-${s}`] = await countUi(pg);
        // Gegenprobe ohne ▾: genau dieses eine Bedienelement kam dazu (die Basis selbst wandert mit anderen Änderungen)
        await pg.evaluate(() => { document.getElementById('rec-more').style.display = 'none'; });
        without[`${dev}-${s}`] = await countUi(pg);
        await pg.evaluate(() => { document.getElementById('rec-more').style.display = ''; });
      }
      await pg.close();
    }
    await browser.close();
    server.close();
    const deltas = Object.fromEntries(Object.keys(now).map((k) => [k, now[k].controls - without[k].controls]));
    check('A4 Zählung: genau +1 Bedienelement in desktop-start und desktop-clip (▾), Handy unverändert', deltas['desktop-start'] === 1 && deltas['desktop-clip'] === 1 && deltas['handy-start'] === 0 && deltas['handy-clip'] === 0, JSON.stringify(deltas));
    check('A4 Zählung trifft die neue Basis exakt', Object.keys(base).every((k) => JSON.stringify(base[k]) === JSON.stringify(now[k])), JSON.stringify(now));
  } catch (err) {
    check('A4 Zählung lief ohne Ausnahme', false, err.stack || err.message);
  }

  } // Ende Teil A

  if (!ONLY || ONLY === 'B') {
  // ================= B5: splitPasses, rein =================
  app = await openApp({ init: loopback, viewport: { width: 1440, height: 900 } });
  page = app.page;
  try {
    const sp = await page.evaluate(async () => {
      const { splitPasses, cutPass } = await import('./src/recorder.js');
      const sr = 44100, N = 176400, bar = 88200, first = 1234, lat = 0.1234567;
      const t0 = 1.2345678901;
      const anchors = [0, 1, 2, 3].map((k) => ({ time: t0 + 4 * k + k * 1e-7 }));
      const want = anchors.map((a) => Math.round((a.time + lat) * sr) - first);
      const run = (total) => splitPasses({ total, first, sr, anchors, latency: lat, frames: N, minFrames: bar });
      const shortRest = run(want[3] + bar - 1); // letzter Rest knapp unter 1 Takt
      const longRest = run(want[3] + bar + 10); // ab 1 Takt
      const ch = Float32Array.from({ length: want[3] + bar + 10 }, (_, i) => (i % 7) + 1);
      const cut = cutPass(ch, longRest[3]);
      return { want, short: shortRest, long: longRest, cutLen: cut.length, pad: cut[N - 1], tail: cut[bar + 9], first: cut[0] === ch[want[3]] };
    });
    check('B5 splitPasses: from_k = round((anchor_k + latency) · sr) − first, exakt', sp.long.every((p, k) => p.from === sp.want[k]), `${sp.long.map((p) => p.from).join(', ')} / ${sp.want.join(', ')}`);
    check('B5 Jede Länge ist N', sp.long.every((p) => p.to - p.from === 176400) && sp.cutLen === 176400, JSON.stringify(sp.long));
    check('B5 Rest unter 1 Takt fällt weg, ab 1 Takt bleibt er (unvollständig)', sp.short.length === 3 && sp.short.every((p) => p.complete) && sp.long.length === 4 && !sp.long[3].complete, `${sp.short.length} / ${sp.long.length}`);
    check('B5 Ausschnitt eines Rests: mit Stille aufgefüllt', sp.first && sp.tail > 0 && sp.pad === 0, JSON.stringify({ tail: sp.tail, pad: sp.pad }));

    // ================= B6: Loop-Aufnahme Ende zu Ende =================
    await page.evaluate(async () => {
      const lw = window.loopwerk;
      const m = await import('./src/model.js');
      lw.store.replace(m.createEmptyProject());
      lw.store.setLoop({ on: true, startBeat: 0, endBeat: 8 });
      // Song: Impuls auf Schlag 1 jedes Durchgangs (über Summe und Limiter) – Bezug für den Marker im Take
      const sr = 44100;
      const b = new AudioBuffer({ numberOfChannels: 2, length: 8 * 22050, sampleRate: sr });
      for (let c = 0; c < 2; c++) b.getChannelData(c)[22050] = 0.35;
      lw.library.register({ id: 'test-loop-click', name: 'Loop-Klick', category: 'fx', lengthBeats: 8, bpm: 120, buffer: b });
      lw.store.addClip('t2', 'test-loop-click', 0, 8);
      lw.engine.setPosition(12); // Marke mitten im Song: die Aufnahme beginnt trotzdem am Loop-Anfang
      lw.ui.select(null);
      localStorage.removeItem('loopwerk.recLatency.v1');
      await lw.recorder.calibrate();
    });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    // „Gesang“: je Durchgang ein anderer Ton (440/550/660/770 Hz) und ein Impuls bei 0,25 s, so wie man ihn zum gehörten
    // Song spielt (Song + Summe verzögert), über denselben Weg wie der Lautsprecher
    const plan = await page.evaluate(() => {
      const { engine } = window.loopwerk;
      const ctx = engine.ctx;
      const m = window.__mock;
      const t0 = engine.anchors[0].time;
      const L = 4; // 8 Schläge bei 120 BPM
      const d = engine.playbackDelay();
      const into = ctx.createGain();
      into.connect(m.delay);
      [440, 550, 660, 770].forEach((f, k) => {
        const o = new OscillatorNode(ctx, { frequency: f });
        const g = new GainNode(ctx, { gain: 0.1 });
        o.connect(g).connect(into);
        o.start(t0 + k * L + d);
        o.stop(t0 + (k + 1) * L + d);
        const b = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: ctx.sampleRate });
        b.getChannelData(0)[0] = 0.9;
        const s = new AudioBufferSourceNode(ctx, { buffer: b });
        s.connect(into);
        s.start(t0 + k * L + 0.25 + d);
      });
      return { t0, d };
    });
    // Sperren während der Loop-Aufnahme
    await page.waitForTimeout(600);
    await page.click('#loop-btn');
    const lockHint = await page.evaluate(() => document.getElementById('hint').textContent);
    const lock = await page.evaluate(() => { const { store } = window.loopwerk; store.setBpm(100); store.setLoop({ startBeat: 4, endBeat: 12 }); return { loop: store.project.loop, bpm: store.project.bpm, undo: store.undoStack.length }; });
    check('B9 Während der Loop-Aufnahme: Loop-Knopf, Loop-Bereich und Tempo gesperrt (Projekt unverändert), Einblender', lock.loop.on && lock.loop.startBeat === 0 && lock.loop.endBeat === 8 && lock.bpm === 120 && /^Während der Aufnahme nicht änderbar\./.test(lockHint), JSON.stringify({ ...lock, lockHint }));
    // 3 Durchgänge + 1 Schlag, dann Taste R
    await page.waitForFunction((t) => window.loopwerk.engine.ctx.currentTime >= t, plan.t0 + 12.5, { timeout: 30000, polling: 20 });
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const b6 = await page.evaluate(async () => {
      const { store, library } = window.loopwerk;
      const clips = store.project.tracks.flatMap((t) => t.clips.map((c) => ({ ...c, track: t.id }))).filter((c) => c.sampleId !== 'test-loop-click');
      const c = clips[0];
      const sr = 44100;
      const goertzel = (d, f) => { const w = 2 * Math.PI * f / sr; const k = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; } return s1 * s1 + s2 * s2 - k * s1 * s2; };
      const takes = [];
      for (const id of c?.takes || []) {
        const s = await library.ensure(id);
        const d = s.orig.getChannelData(0);
        let peak = 0, at = -1;
        for (let i = 0; i < Math.min(d.length, sr); i++) if (Math.abs(d[i]) > peak + 0.3) { peak = Math.abs(d[i]); at = i; }
        // Marker: erster Wert über 0,7 (Ton 0,1, Song-Impuls 0,35); Song-Impuls: danach der erste über 0,3
        let mk = -1, song = -1;
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.7) { mk = i; break; }
        for (let i = mk + 2000; i > 2000 && i < d.length; i++) if (Math.abs(d[i]) > 0.3) { song = i; break; }
        const e = [440, 550, 660, 770].map((f) => goertzel(d, f));
        takes.push({ id, name: s.name, n: s.orig.length, mk, song, e });
      }
      return { clips: clips.length, c: c && { start: c.startBeat, len: c.lengthBeats, take: c.take, n: c.takes?.length, sampleId: c.sampleId, track: c.track }, takes, hint: document.getElementById('hint').textContent, sel: window.loopwerk.ui.selectedClipId === c?.id };
    });
    const N = 176400;
    check('B6 Ein Clip am Loop-Anfang, Länge 8, takes.length 3, take 2 (der letzte volle spielt)', b6.clips === 1 && b6.c?.start === 0 && b6.c.len === 8 && b6.c.n === 3 && b6.c.take === 2 && b6.c.sampleId === b6.takes[2]?.id, JSON.stringify(b6.c));
    check('B6 Einblender „3 Takes – der letzte spielt. Wechseln: Alt+↑/↓.“, Clip gewählt', /^3 Takes – der letzte spielt\. Wechseln: Alt\+↑\/↓\./.test(b6.hint) && b6.sel, b6.hint);
    check('B6 Jeder Take hat genau N Frames, Namen „Aufnahme n · Take k“', b6.takes.length === 3 && b6.takes.every((t, k) => t.n === N && new RegExp(`^Aufnahme \\d+ · Take ${k + 1}$`).test(t.name)), JSON.stringify(b6.takes.map((t) => [t.name, t.n])));
    // Marker relativ zum Song (Impuls auf Schlag 1 = 0,5 s): der Take liegt sample-genau zum Song. Absolut kommt die
    // Schwankung des Eingangswegs zwischen zwei Öffnungen dazu (Einmessen und Aufnahme öffnen getrennt; Attrappe ≈ 0–1,5 ms)
    const rel = b6.takes.map((t) => (t.song - t.mk) - Math.round(0.25 * SR));
    const abs = b6.takes.map((t) => t.mk - Math.round(0.25 * SR));
    check('B6 Marker je Take bei round(0,25 · sr) ± 2 Samples (zum Song im Take)', b6.takes.length === 3 && rel.every((x) => Math.abs(x) <= 2), `relativ ${rel.join(', ')} Samples`);
    check('B6 Marker absolut: in allen Takes gleich, Abweichung ≤ 15 ms (Latenz-Schwankung zwischen Öffnungen, s. A2)', abs.every((x) => x === abs[0]) && Math.abs(abs[0]) <= 0.015 * SR, `absolut ${abs.join(', ')} Samples (${(abs[0] / SR * 1000).toFixed(2)} ms)`);
    const dom = b6.takes.map((t, k) => 10 * Math.log10(t.e[k] / Math.max(...t.e.filter((_, j) => j !== k))));
    check('B6 In Take k überwiegt Ton k um ≥ 20 dB (Goertzel)', dom.length === 3 && dom.every((x) => x >= 20), dom.map((x) => x.toFixed(1) + ' dB').join(', '));

    // ================= B7: Takes wechseln =================
    await page.evaluate((id) => window.loopwerk.ui.select(id), (await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0].id)));
    await page.waitForTimeout(300);
    await shot(page, 'takes-desktop.png');
    const ui0 = await page.evaluate(() => ({ btns: [...document.querySelectorAll('#insp-takes .take-n')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]), del: !!document.getElementById('insp-take-del'), tag: document.querySelector('.clip.selected .clip-take')?.textContent, undo: window.loopwerk.store.undoStack.length }));
    check('B7 Inspektor „Take 1 2 3 ×“ (3 aktiv), Arranger zeigt „3/3“', JSON.stringify(ui0.btns) === '[["1","false"],["2","false"],["3","true"]]' && ui0.del && ui0.tag === '3/3', JSON.stringify(ui0));
    await page.click('#insp-take-1');
    await page.waitForFunction(() => { const c = window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0]; return c.take === 0; }, null, { timeout: 5000 });
    const sw = await page.evaluate(async () => {
      const { store, library, renderProject } = window.loopwerk;
      const c = store.project.tracks.flatMap((t) => t.clips)[0];
      const sr = 44100;
      const goertzel = (d, f) => { const w = 2 * Math.PI * f / sr; const k = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; } return s1 * s1 + s2 * s2 - k * s1 * s2; };
      const r = (await renderProject(store.project, library, { limiter: false, fromBeat: 0, toBeat: 8 })).getChannelData(0);
      return { ok: c.sampleId === c.takes[0], undo: store.undoStack.length, e440: goertzel(r, 440), e660: goertzel(r, 660), tag: document.querySelector('.clip.selected .clip-take')?.textContent, pressed: document.getElementById('insp-take-1').getAttribute('aria-pressed') };
    });
    check('B7 Klick „1“: sampleId === takes[0], ein Rückgängig-Schritt, Arranger „1/3“', sw.ok && sw.undo === ui0.undo + 1 && sw.tag === '1/3' && sw.pressed === 'true', JSON.stringify(sw));
    const ratio = 10 * Math.log10(sw.e440 / sw.e660);
    check('B7 renderProject des Loop-Bereichs: 440 Hz da, 660 Hz nicht (≥ 20 dB)', ratio >= 20, `${ratio.toFixed(1)} dB`);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0].take === 1, null, { timeout: 3000 }).catch(() => {});
    const k1 = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0].take);
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0].take === 2, null, { timeout: 3000 }).catch(() => {});
    const k2 = await page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips)[0].take);
    check('B7 Alt+↓ nächster, Alt+↑ voriger Take (mit Umlauf)', k1 === 1 && k2 === 2, `${k1}, ${k2}`);
    const undo1 = await page.evaluate(() => { const { store } = window.loopwerk; store.undo(); return store.project.tracks.flatMap((t) => t.clips)[0].take; });
    check('B7 Rückgängig nimmt genau einen Wechsel zurück', undo1 === 0, String(undo1));
    // Live: Wechsel während der Wiedergabe ändert die Signatur (Engine plant neu)
    const live = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const c = store.project.tracks.flatMap((t) => t.clips)[0];
      await engine.play(0);
      await new Promise((r) => setTimeout(r, 400));
      const before = [...engine.knownSigs.values()].join();
      store.setClipTake(c.id, 2);
      await new Promise((r) => setTimeout(r, 300));
      const after = [...engine.knownSigs.values()].join();
      engine.stop();
      return { changed: before !== after, has: after.includes(c.takes[2]) };
    });
    check('B7 Wechsel während der Wiedergabe greift live (clipSignature)', live.changed && live.has, JSON.stringify(live));

    // ================= B8: Teilen, Editor-Übernehmen =================
    const split = await page.evaluate(async () => {
      const { store, tools, ui } = window.loopwerk;
      const c = store.project.tracks.flatMap((t) => t.clips)[0];
      const [right] = store.splitAt(4, [c.id]);
      const L0 = store.findClip(c.id).clip;
      const R0 = store.findClip(right).clip;
      store.setClipTake(c.id, 0);
      const L = store.findClip(c.id).clip;
      const R = store.findClip(right).clip;
      return { left: { n: L.takes?.length, take: L.take, s: L.sampleId === L.takes?.[0] }, right: { n: R.takes?.length, take: R.take, s: R.sampleId === R.takes?.[2] }, same: R0.takes === L0.takes || JSON.stringify(R0.takes) === JSON.stringify(L0.takes), rightId: right, leftId: c.id };
    });
    check('B8 Teilen bei Schlag 4: beide Hälften haben die Takes, Umschalten links lässt rechts unberührt', split.left.n === 3 && split.right.n === 3 && split.left.take === 0 && split.left.s && split.right.take === 2 && split.right.s && split.same, JSON.stringify(split));
    // Editor: Normalisieren → Übernehmen ersetzt nur den aktiven Take (rechts: Take 3)
    await page.evaluate((id) => { window.loopwerk.ui.select(id); window.loopwerk.editor.open(id); }, split.rightId);
    await page.waitForFunction(() => !document.getElementById('editor').hidden, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    const pre = await page.evaluate((id) => window.loopwerk.store.findClip(id).clip.takes.slice(), split.rightId);
    await page.click('#ed-normalize');
    await page.click('#ed-apply');
    await page.waitForFunction((args) => window.loopwerk.store.findClip(args.id).clip.sampleId !== args.old, { id: split.rightId, old: pre[2] }, { timeout: 8000 });
    const ed = await page.evaluate((id) => { const c = window.loopwerk.store.findClip(id).clip; return { takes: c.takes, take: c.take, s: c.sampleId }; }, split.rightId);
    check('B8 Editor-Übernehmen ersetzt nur den aktiven Take', ed.takes.length === 3 && ed.take === 2 && ed.takes[2] === ed.s && ed.s !== pre[2] && ed.takes[0] === pre[0] && ed.takes[1] === pre[1], JSON.stringify({ pre, ed }));

    // ================= B9: Projektdatei, Löschschutz =================
    const all = await page.evaluate(() => [...new Set(window.loopwerk.store.project.tracks.flatMap((t) => t.clips.flatMap((c) => [c.sampleId, ...(c.takes || [])])))].filter((id) => id.startsWith('own-')));
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => { window.loopwerk.store.setProjectName('Takes-Datei'); document.getElementById('save-btn').click(); })]);
    const saved = path.join(require('os').tmpdir(), 'loopwerk-takes.json');
    await download.saveAs(saved);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    const embedded = (json.ownSounds || []).map((e) => e.id);
    check('B9 Projektdatei: alle Take-Sounds eingebettet (auch inaktive), Takes am Clip gespeichert', all.length >= 4 && all.every((id) => embedded.includes(id)) && json.tracks.some((t) => t.clips.some((c) => c.takes?.length === 3)), `${embedded.length} eingebettet, gebraucht ${all.length}`);
    // Löschschutz für einen inaktiven Take (links aktiv: Take 1, rechts aktiv: bearbeitet → Take 2 ist überall inaktiv)
    const inactive = await page.evaluate(() => { const cs = window.loopwerk.store.project.tracks.flatMap((t) => t.clips); const id = cs[0].takes[1]; return { id, name: window.loopwerk.library.get(id).name, active: cs.some((c) => c.sampleId === id) }; });
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    const delRes = await page.evaluate(async (id) => {
      // Wie das Regal: Löschen über den Löschen-Knopf der Zeile (zweimal = bestätigt)
      document.getElementById('ltab-sounds')?.click();
      const row = document.querySelector(`#library .loop-row [data-sample-id="${id}"]`)?.closest('.loop-row') || [...document.querySelectorAll('#library .loop-row')].find((r) => r.querySelector(`[data-sample-id="${id}"]`));
      if (!row) return { row: false };
      row.closest('.shelf-items')?.hidden && row.closest('.shelf-group')?.querySelector('.shelf-cat')?.click();
      const del = row.querySelector('.loop-del');
      del.click();
      del.click();
      await new Promise((r) => setTimeout(r, 400));
      return { row: true, still: !!window.loopwerk.library.get(id), hint: document.getElementById('hint').textContent };
    }, inactive.id);
    check('B9 Löschschutz greift auch für inaktive Takes', !inactive.active && delRes.row && delRes.still && /wird im Projekt benutzt/.test(delRes.hint), JSON.stringify({ inactive, delRes }));
    // Rückgängig bis vor die Aufnahme: kein Clip verweist mehr auf die Takes, die Datei bettet sie nicht ein;
    // die Sounds bleiben unter „Eigene“ (wie jede Aufnahme), damit Wiederholen sie wiederfindet
    const ud = await page.evaluate(async (ids) => {
      const { store, own, library } = window.loopwerk;
      while (store.project.tracks.some((t) => t.clips.some((c) => c.sampleId.startsWith('own-'))) && store.canUndo) store.undo();
      const emb = (await own.embed(store.project)).map((e) => e.id);
      const kept = ids.every((id) => library.get(id));
      store.redo();
      const back = store.project.tracks.some((t) => t.clips.some((c) => c.takes?.length === 3));
      return { emb, kept, back };
    }, all);
    check('B9 Rückgängig: keine Verweise mehr, Datei ohne Take-Sounds; Sounds bleiben unter „Eigene“, Wiederholen holt den Take-Clip', ud.emb.length === 0 && ud.kept && ud.back, JSON.stringify(ud));
    check('B Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // Frisches Profil: Datei öffnen stellt alle Take-Sounds her
    app = await openApp({ viewport: { width: 1440, height: 900 } });
    page = app.page;
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Takes-Datei', null, { timeout: 15000 });
    const fresh = await page.evaluate(async (ids) => {
      const { store, library } = window.loopwerk;
      const out = [];
      for (const id of ids) { const s = await library.ensure(id).catch(() => null); out.push(!!s && !s.missing && !!s.orig); }
      return { ok: out, clips: store.project.tracks.flatMap((t) => t.clips).map((c) => c.takes?.length ?? 0) };
    }, all);
    check('B9 Öffnen im frischen Profil: alle Take-Sounds wieder da, Take-Clips mit 3 Takes', fresh.ok.every(Boolean) && fresh.clips.length === 2 && fresh.clips.every((n) => n === 3), JSON.stringify(fresh));
    // Fehlt ein inaktiver Take in der Datei: er fällt aus der Liste, der Clip bleibt
    const cut = JSON.parse(JSON.stringify(json));
    cut.ownSounds = cut.ownSounds.filter((e) => e.id !== inactive.id);
    cut.name = 'Takes-ohne';
    const cutPath = path.join(require('os').tmpdir(), 'loopwerk-takes-ohne.json');
    fs.writeFileSync(cutPath, JSON.stringify(cut));
    await app.close();
    app = await openApp({ viewport: { width: 1440, height: 900 } });
    page = app.page;
    await page.setInputFiles('#open-input', cutPath);
    await page.waitForFunction(() => window.loopwerk.store.project.name === 'Takes-ohne', null, { timeout: 15000 });
    const less = await page.evaluate((id) => window.loopwerk.store.project.tracks.flatMap((t) => t.clips).map((c) => ({ n: c.takes?.length ?? 1, has: (c.takes || []).includes(id), ok: !c.takes || c.takes[c.take] === c.sampleId })), inactive.id);
    check('B9 Fehlender Take in der Datei: fällt aus der Liste, Clips bleiben', less.length === 2 && less.every((c) => c.n === 2 && !c.has && c.ok), JSON.stringify(less));
    check('B Keine Fehler in der Konsole (frisches Profil)', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('B lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
  }

  // ================= B7 Handy: „Take 3/3“ antippen, × löschen =================
  app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  page = app.page;
  try {
    const cid = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const m = await import('./src/model.js');
      lw.store.replace(m.createEmptyProject());
      const sr = 44100;
      const ids = [];
      for (const [k, f] of [440, 550, 660].entries()) {
        const b = new AudioBuffer({ numberOfChannels: 2, length: 4 * sr, sampleRate: sr });
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.2 * Math.sin(2 * Math.PI * f * i / sr); }
        ids.push((await lw.own.create({ name: `Aufnahme 1 · Take ${k + 1}`, buffer: b, source: 'Aufnahme', from: 'mic' })).id);
      }
      const [id] = lw.store.addRecordings([{ trackId: 't1', startBeat: 0, lengthBeats: 8, sampleIds: ids, take: 2 }]);
      lw.ui.select(id);
      return id;
    });
    await page.waitForTimeout(500);
    const t0 = await page.evaluate(() => ({ t: document.querySelector('#cb-take .cb-take-n').textContent, hidden: !document.getElementById('cb-take'), cols: getComputedStyle(document.querySelector('.clipbar-btns')).gridTemplateColumns.split(' ').length, box: (() => { const r = document.getElementById('cb-take').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }));
    await shot(page, 'takes-handy.png');
    await page.tap('#cb-take');
    await page.waitForFunction(() => document.querySelector('#cb-take .cb-take-n').textContent === 'Take 1/3', null, { timeout: 3000 }).catch(() => {});
    const t1 = await page.evaluate((id) => ({ t: document.querySelector('#cb-take .cb-take-n').textContent, take: window.loopwerk.store.findClip(id).clip.take }), cid);
    check('B7 Handy: Clip-Leiste „Take 3/3“ (≥ 44 px), Antippen → „Take 1/3“', !t0.hidden && t0.t === 'Take 3/3' && t0.cols === 6 && t0.box[0] >= 44 && t0.box[1] >= 44 && t1.t === 'Take 1/3' && t1.take === 0, JSON.stringify({ t0, t1 }));
    // Löschen im Pegel-Fach
    await page.tap('#cb-levels');
    await page.waitForTimeout(300);
    const lv = await page.evaluate(() => ({ shown: !document.getElementById('lvl-takes').hidden, btns: [...document.querySelectorAll('#lvl-takes button')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; }) }));
    await shot(page, 'takes-handy-pegel.png');
    check('B7 Handy: Pegel-Fach zeigt „Take 1 2 3 ×“, Tippziele ≥ 44 px', lv.shown && lv.btns.length === 4 && lv.btns.every(([, w, h]) => w >= 44 && h >= 44), JSON.stringify(lv));
    await page.tap('#lvl-take-del');
    await page.waitForFunction((id) => window.loopwerk.store.findClip(id).clip.takes?.length === 2, cid, { timeout: 5000 }).catch(() => {});
    const d1 = await page.evaluate((id) => { const c = window.loopwerk.store.findClip(id).clip; return { n: c.takes?.length, take: c.take, ok: c.takes?.[c.take] === c.sampleId, label: document.querySelector('#cb-take .cb-take-n').textContent }; }, cid);
    await page.tap('#lvl-take-del');
    await page.waitForFunction((id) => !window.loopwerk.store.findClip(id).clip.takes, cid, { timeout: 5000 }).catch(() => {});
    const d2 = await page.evaluate((id) => { const c = window.loopwerk.store.findClip(id).clip; return { takes: c.takes, take: c.take, hidden: !document.getElementById('cb-take'), row: !document.getElementById('lvl-takes'), own: window.loopwerk.library.list().filter((s) => /^Aufnahme 1 · Take/.test(s.name)).length }; }, cid);
    check('B7 × → 2 Takes (der letzte verbleibende spielt), nochmal × → normaler Clip; Sounds bleiben unter „Eigene“', d1.n === 2 && d1.take === 1 && d1.ok && d1.label === 'Take 2/2' && d2.takes === undefined && d2.take === undefined && d2.hidden && d2.row && d2.own === 3, JSON.stringify({ d1, d2 }));
    check('B Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('B Handy lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
  }
  } // Ende Teil B

  if (!ONLY || ONLY === 'C') await partC();

  finish();
})();

// ================= C: Mehrspur – echtes getUserMedia mit Chromiums Fake-Gerät =================
// Stereo-Testdatei: links 440 Hz, rechts 660 Hz (läuft in Schleife). Die Spione merken sich jeden Strom und jede
// Anfrage; window.__oneChannel = true lässt getSettings().channelCount = 1 melden (1-Kanal-Gerät, Test 11).
function stereoWav(file, seconds = 30) {
  const n = Math.round(seconds * SR);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(0.3 * 32767 * Math.sin(2 * Math.PI * 440 * i / SR)), 44 + i * 4);
    buf.writeInt16LE(Math.round(0.3 * 32767 * Math.sin(2 * Math.PI * 660 * i / SR)), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
function micSpy() {
  const md = navigator.mediaDevices;
  if (md.__spied) return;
  md.__spied = true;
  const orig = md.getUserMedia.bind(md);
  window.__streams = [];
  window.__asked = [];
  md.getUserMedia = async (c) => { window.__asked.push(JSON.parse(JSON.stringify(c))); const s = await orig(c); window.__streams.push(s); return s; };
  // Wie ein Browser vor der Freigabe: Geräte ohne Namen und ohne ID (die Fake-Oberfläche gibt sie sonst sofort heraus)
  const en = md.enumerateDevices.bind(md);
  md.enumerateDevices = async () => { const l = await en(); return window.__streams.length ? l : l.map((d) => ({ kind: d.kind, label: '', deviceId: '', groupId: '' })); };
  const gs = MediaStreamTrack.prototype.getSettings;
  MediaStreamTrack.prototype.getSettings = function () { const v = gs.call(this); return window.__oneChannel && this.kind === 'audio' ? { ...v, channelCount: 1 } : v; };
}
// Läuft im Browser: Kanäle, Länge und Tonanteile (Goertzel, dB von 440 über 660 Hz je Kanal) eines Sounds
const soundInfo = () => `async (id) => {
  const s = await window.loopwerk.library.ensure(id);
  const sr = s.orig.sampleRate;
  const g = (d, f) => { const w = 2 * Math.PI * f / sr; const k = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const v = d[i] + k * s1 - s2; s2 = s1; s1 = v; } return s1 * s1 + s2 * s2 - k * s1 * s2; };
  const chs = Array.from({ length: s.orig.numberOfChannels }, (_, c) => s.orig.getChannelData(c));
  return { id, name: s.name, ch: chs.length, n: s.orig.length, db: chs.map((d) => +(10 * Math.log10(g(d, 440) / g(d, 660))).toFixed(1)) };
}`;

async function partC() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lw213c-'));
  const file = path.join(tmp, 'stereo.wav');
  stereoWav(file);
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`];
  let app = await openApp({ init: micSpy, args, viewport: { width: 1440, height: 900 } });
  let page = app.page;
  const info = (id) => page.evaluate(`(${soundInfo()})(${JSON.stringify(id)})`);
  const micClosed = () => page.evaluate(() => window.__streams.length > 0 && window.__streams.every((s) => s.getAudioTracks().every((t) => t.readyState === 'ended')));
  const record = async (beats) => {
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    await page.waitForFunction((b) => window.loopwerk.engine.currentBeat() >= b, beats, { timeout: 30000 });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    await page.waitForTimeout(200);
  };
  const ownClips = () => page.evaluate(() => window.loopwerk.store.project.tracks.flatMap((t) => t.clips.filter((c) => c.sampleId.startsWith('own-')).map((c) => ({ track: t.id, id: c.id, sampleId: c.sampleId, takes: c.takes, take: c.take, start: c.startBeat, len: c.lengthBeats }))));
  try {
    await page.evaluate(async () => {
      const lw = window.loopwerk;
      const m = await import('./src/model.js');
      lw.store.replace(m.createEmptyProject());
      lw.engine.setPosition(0);
      lw.ui.select(null);
      localStorage.removeItem('loopwerk.recDevice.v1');
    });
    // ---------- Gerät wählen: vor der Freigabe nur „Standard-Mikrofon“ und „Geräte suchen …“ ----------
    await page.click('#rec-more');
    await page.waitForTimeout(300);
    const pre = await page.evaluate(() => [...document.querySelectorAll('#rs-device option')].map((o) => o.textContent));
    await page.selectOption('#rs-device', '#suchen');
    await page.waitForFunction(() => [...document.querySelectorAll('#rs-device option')].some((o) => o.textContent === 'Fake Audio Input 1'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    const found = await page.evaluate(() => ({ opts: [...document.querySelectorAll('#rs-device option')].map((o) => o.textContent), ch: document.getElementById('rs-ch').textContent, chShown: !document.getElementById('rs-ch').hidden }));
    check('C Gerät: vor der Freigabe „Standard-Mikrofon“ (+ „Geräte suchen …“), danach die Geräte mit Namen und „2 Kanäle“',
      pre[0] === 'Standard-Mikrofon' && pre.includes('Geräte suchen …') && found.opts.includes('Fake Audio Input 1') && !found.opts.includes('Geräte suchen …') && found.chShown && found.ch === '2 Kanäle', JSON.stringify({ pre, found }));
    const fakeId = await page.evaluate(() => [...document.querySelectorAll('#rs-device option')].find((o) => o.textContent === 'Fake Audio Input 1').value);
    await page.selectOption('#rs-device', fakeId);
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle' && window.__streams.length >= 2, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    const chosen = await page.evaluate(() => ({ ls: JSON.parse(localStorage.getItem('loopwerk.recDevice.v1')), asked: window.__asked.at(-1), key: document.getElementById('rec-setup').dataset.key }));
    check('C Gerät gemerkt unter lsKey „loopwerk.recDevice.v1“ (Name, 2 Kanäle), geöffnet mit deviceId exact und channelCount ideal 2; Latenz-Schlüssel folgt dem Gerät',
      chosen.ls?.id === fakeId && chosen.ls.devices[fakeId]?.label === 'Fake Audio Input 1' && chosen.ls.devices[fakeId]?.channels === 2
        && chosen.asked?.audio?.deviceId?.exact === fakeId && chosen.asked.audio.channelCount?.ideal === 2 && /^Fake Audio Input 1\|/.test(chosen.key), JSON.stringify(chosen));
    check('C Kurz geöffnet zum Kennenlernen: danach Mikrofon zu', await micClosed());
    await page.keyboard.press('Escape');

    // ---------- 10: Spur 1 über das Menü, Spur 2 im Inspektor scharf, Spur 2 auf „Rechts“ ----------
    const undo0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.click('.track-row:has(.lane[data-track-id="t1"]) .tbtn-menu');
    const item = await page.evaluate(() => { const b = document.getElementById('tm-rec-arm'); return { text: b?.textContent, role: b?.getAttribute('role'), checked: b?.getAttribute('aria-checked') }; });
    await page.click('#tm-rec-arm');
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t2'));
    await page.waitForTimeout(200);
    const insp0 = await page.evaluate(() => ({ arm: !document.getElementById('insp-arm-row').hidden, pressed: document.getElementById('insp-rec-arm').getAttribute('aria-pressed'), inRow: document.getElementById('insp-recin-row').hidden }));
    await page.click('#insp-rec-arm');
    await page.waitForTimeout(150);
    const insp1 = await page.evaluate(() => ({ inRow: !document.getElementById('insp-recin-row').hidden, btns: [...document.querySelectorAll('#insp-recin-row .key')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.disabled]), auto: document.getElementById('insp-recin-auto').title }));
    await page.click('#insp-recin-R');
    await page.waitForTimeout(150);
    const armed = await page.evaluate(() => {
      const { ui, store } = window.loopwerk;
      const red = getComputedStyle(document.getElementById('rec-btn').querySelector('svg')).fill;
      const dot = (id) => getComputedStyle(document.querySelector(`.track-row:has(.lane[data-track-id="${id}"]) .track-dot`)).backgroundColor === red;
      return { rec: ui.recTracks.slice(), input: store.track('t2').recInput, dots: ['t1', 't2', 't3'].map(dot), undo: store.undoStack.length, inProject: JSON.stringify(store.project).includes('recTracks') };
    });
    check('C10 Spur-Menü ⋯: „Für Aufnahme scharf“ als Schalter (menuitemcheckbox)', item.text === 'Für Aufnahme scharf' && item.role === 'menuitemcheckbox' && item.checked === 'false', JSON.stringify(item));
    check('C10 Inspektor „Spur“: Schalter ● Scharf, Zeile Eingang erst wenn scharf (Auto · Links · Rechts · Stereo, Auto aktiv)',
      insp0.arm && insp0.pressed === 'false' && insp0.inRow && insp1.inRow && insp1.btns.map((b) => b[0]).join() === 'Auto,Links,Rechts,Stereo' && insp1.btns[0][1] === 'true' && /Rechts/.test(insp1.auto), JSON.stringify({ insp0, insp1 }));
    check('C10 Scharf: ui.recTracks in Reihenfolge, roter Punkt nur an scharfen Spuren, Eingang „R“ an der Spur (ein Rückgängig-Schritt), Scharf nicht im Projekt/Verlauf',
      JSON.stringify(armed.rec) === '["t1","t2"]' && armed.input === 'R' && armed.dots[0] && armed.dots[1] && !armed.dots[2] && armed.undo === undo0 + 1 && !armed.inProject, JSON.stringify(armed));
    await shot(page, 'mehrspur-desktop-spur.png');
    await page.click('#rec-more');
    await page.waitForTimeout(250);
    const list = await page.evaluate(() => [...document.querySelectorAll('#rs-armed .rs-armed-row')].map((r) => [r.querySelector('.rs-track').textContent, [...r.querySelectorAll('.recin-btns .key')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent]));
    check('C10 Feld „Aufnahme“ zeigt die scharfen Spuren mit ihrem Eingang', JSON.stringify(list) === JSON.stringify([['Spur 1', 'Auto'], ['Spur 2', 'Rechts']]), JSON.stringify(list));
    await shot(page, 'mehrspur-desktop-feld.png');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.loopwerk.ui.select(null));

    await record(8.5);
    const c10 = await ownClips();
    const i10 = [];
    for (const c of c10) i10.push({ track: c.track, ...(await info(c.sampleId)) });
    const hint10 = await page.evaluate(() => document.getElementById('hint-text').textContent);
    const by = (t) => i10.find((x) => x.track === t);
    check('C10 ● nimmt auf beide scharfen Spuren auf: 2 Clips, 2 Sounds mit je 1 Kanal, gleiche Länge, Einblender „2 Spuren aufgenommen.“',
      c10.length === 2 && by('t1') && by('t2') && by('t1').ch === 1 && by('t2').ch === 1 && by('t1').n === by('t2').n && c10.every((c) => c.start === 0) && hint10.startsWith('2 Spuren aufgenommen.'),
      JSON.stringify({ i10: i10.map(({ track, name, ch, n }) => ({ track, name, ch, n })), hint10 }));
    // Kanaltrennung: Spur 1 (Auto bei 2 scharfen → Links) trägt 440 Hz, Spur 2 (Rechts) 660 Hz
    check('C10 Kanalzuordnung: Spur 1 = links (440 Hz ≥ 20 dB über 660), Spur 2 = rechts (660 Hz ≥ 20 dB über 440)', by('t1')?.db[0] >= 20 && by('t2')?.db[0] <= -20,
      `Spur 1: ${by('t1')?.db[0]} dB, Spur 2: ${by('t2')?.db[0]} dB (440 über 660)`);
    check('C10 Nach der Aufnahme: Mikrofon zu', await micClosed());
    // IndexedDB und Projektdatei speichern 1 Kanal (WAV-Kopf, Byte 22)
    const store1 = await page.evaluate(async (ids) => {
      const { own, store } = window.loopwerk;
      const rec = await Promise.all(ids.map((id) => own.tx('readonly', (s) => s.get(id))));
      const emb = await own.embed(store.project);
      const ch = (b64) => { const bin = atob(b64.slice(0, 64)); return bin.charCodeAt(22) | (bin.charCodeAt(23) << 8); };
      return { idb: rec.map((r) => new DataView(r.wav).getUint16(22, true)), file: emb.map((e) => ch(e.wav)) };
    }, c10.map((c) => c.sampleId));
    check('C10 Mono-Aufnahme als 1-Kanal-Sound gespeichert: IndexedDB und Projektdatei (WAV-Kopf 1 Kanal)', store1.idb.every((x) => x === 1) && store1.file.length === 2 && store1.file.every((x) => x === 1), JSON.stringify(store1));
    const undo10 = await page.evaluate(() => { window.loopwerk.store.undo(); return window.loopwerk.store.project.tracks.flatMap((t) => t.clips).filter((c) => c.sampleId.startsWith('own-')).length; });
    check('C10 Ein Rückgängig entfernt beide Clips', undo10 === 0, String(undo10));
    await page.evaluate(() => window.loopwerk.store.redo());

    // ---------- 10 mit Loop: je Spur ein Take-Clip mit denselben Durchgängen ----------
    await page.evaluate(() => { const { store, engine } = window.loopwerk; store.setLoop({ on: true, startBeat: 16, endBeat: 24 }); engine.setPosition(0); });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const t0 = await page.evaluate(() => window.loopwerk.engine.anchors[0].time);
    await page.waitForFunction((t) => window.loopwerk.engine.ctx.currentTime >= t, t0 + 8.6, { timeout: 30000, polling: 20 });
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    await page.waitForTimeout(200);
    const loopClips = (await ownClips()).filter((c) => c.start === 16);
    const li = [];
    for (const c of loopClips) for (const id of c.takes || []) li.push({ track: c.track, ...(await info(id)) });
    const lhint = await page.evaluate(() => document.getElementById('hint-text').textContent);
    const N = Math.round(4 * SR);
    check('C10 Loop: 2 Take-Clips (Spur 1 und 2) am Loop-Anfang mit gleich vielen Takes (2), jeder Take N Frames, 1 Kanal',
      loopClips.length === 2 && loopClips.every((c) => c.takes?.length === 2 && c.take === 1 && c.len === 8) && new Set(loopClips.map((c) => c.track)).size === 2 && li.length === 4 && li.every((x) => x.ch === 1 && x.n === N),
      JSON.stringify({ clips: loopClips.map((c) => [c.track, c.takes?.length, c.take, c.len]), takes: li.map((x) => [x.track, x.name, x.ch, x.n]), lhint }));
    check('C10 Loop: Kanaltrennung je Take (Spur 1 links ≥ 20 dB, Spur 2 rechts ≥ 20 dB), Namen „Aufnahme n · Links/Rechts · Take k“',
      li.length === 4 && li.filter((x) => x.track === 't1').every((x) => x.db[0] >= 20 && / · Links · Take \d$/.test(x.name)) && li.filter((x) => x.track === 't2').every((x) => x.db[0] <= -20 && / · Rechts · Take \d$/.test(x.name)),
      li.map((x) => `${x.track} ${x.name}: ${x.db[0]} dB`).join('; '));
    check('C10 Loop: Einblender „2 Spuren aufgenommen. Je 2 Takes …“', /^2 Spuren aufgenommen\. Je 2 Takes/.test(lhint), lhint);
    const undoLoop = await page.evaluate(() => { window.loopwerk.store.undo(); return window.loopwerk.store.project.tracks.flatMap((t) => t.clips).filter((c) => c.startBeat === 16).length; });
    check('C10 Loop: ein Rückgängig entfernt beide Take-Clips', undoLoop === 0, String(undoLoop));

    // ---------- Eine scharfe Spur auf Auto: Stereo bei 2 Kanälen (beide Kanäle getrennt erhalten) ----------
    await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const m = await import('./src/model.js');
      store.replace(m.createEmptyProject());
      engine.setPosition(0);
    });
    await page.waitForTimeout(100);
    const cleared = await page.evaluate(() => window.loopwerk.ui.recTracks.length);
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t3'));
    await page.keyboard.press('Shift+R');
    const shiftR = await page.evaluate(() => ({ rec: window.loopwerk.ui.recTracks.slice(), undo: window.loopwerk.store.undoStack.length, dot: document.querySelectorAll('.track-row.rec-armed').length }));
    check('C12 Neues Projekt leert den Scharf-Zustand; Umschalt+R schaltet die gewählte Spur, ohne Rückgängig-Schritt', cleared === 0 && JSON.stringify(shiftR.rec) === '["t3"]' && shiftR.undo === 0 && shiftR.dot === 1, JSON.stringify({ cleared, shiftR }));
    await page.evaluate(() => window.loopwerk.ui.select(null));
    await record(4.5);
    const one = await ownClips();
    const oi = one[0] && await info(one[0].sampleId);
    check('C Eine scharfe Spur (Auto, 2 Kanäle): Stereo-Sound, links 440 Hz, rechts 660 Hz (je ≥ 20 dB)', one.length === 1 && one[0].track === 't3' && oi?.ch === 2 && oi.db[0] >= 20 && oi.db[1] <= -20, JSON.stringify({ one, oi }));

    // ---------- 12: gemerktes Gerät fehlt → Einblender, Aufnahme mit dem Standardgerät ----------
    await page.evaluate(() => { localStorage.setItem('loopwerk.recDevice.v1', JSON.stringify({ id: 'weg-123', devices: { 'weg-123': { label: 'Interface X', channels: 2, at: 1 } } })); window.loopwerk.engine.setPosition(0); window.loopwerk.ui.select(null); });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const miss = await page.evaluate(() => ({ hint: document.getElementById('hint-text').textContent, asked: window.__asked.slice(-2).map((a) => a.audio.deviceId?.exact ?? null), label: window.__streams.at(-1).getAudioTracks()[0].label }));
    await page.waitForFunction(() => window.loopwerk.engine.currentBeat() >= 2.5, null, { timeout: 15000 });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    const missN = (await ownClips()).length;
    check('C12 Gemerktes Gerät fehlt (OverconstrainedError): Einblender „„Interface X“ fehlt – Aufnahme mit dem Standard-Mikrofon.“, Aufnahme läuft',
      miss.hint === '„Interface X“ fehlt – Aufnahme mit dem Standard-Mikrofon.' && miss.asked[0] === 'weg-123' && miss.asked[1] === null && missN === 2, JSON.stringify({ ...miss, missN }));
    check('C12 Auch nach dem Ersatzweg: Mikrofon zu', await micClosed());
    await page.evaluate(() => localStorage.removeItem('loopwerk.recDevice.v1'));

    // ---------- 12: „Projekt öffnen“ leert den Scharf-Zustand ----------
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => { window.loopwerk.store.setProjectName('Mehrspur-Datei'); document.getElementById('save-btn').click(); })]);
    const saved = path.join(tmp, 'mehrspur.json');
    await download.saveAs(saved);
    await page.evaluate(() => { window.loopwerk.ui.setRecArm('t1', true); });
    await page.setInputFiles('#open-input', saved);
    await page.waitForFunction(() => !window.loopwerk.store.canUndo && window.loopwerk.ui.recTracks.length === 0, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => ({ name: window.loopwerk.store.project.name, rec: window.loopwerk.ui.recTracks.length, dots: document.querySelectorAll('.track-row.rec-armed').length }));
    check('C12 Nach „Projekt öffnen“ ist keine Spur scharf', opened.name === 'Mehrspur-Datei' && opened.rec === 0 && opened.dots === 0, JSON.stringify(opened));
    check('C Keine Fehler in der Konsole (Desktop, Fake-Gerät)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- 11: 1-Kanal-Gerät – Sperren, Auto → Mono, Editor/Stretch/Tonhöhe/Export mit 1 Kanal ----------
    app = await openApp({ init: () => { window.__oneChannel = true; }, args, viewport: { width: 1440, height: 900 } });
    page = app.page;
    await page.evaluate(micSpy);
    await page.evaluate(async () => {
      const lw = window.loopwerk;
      localStorage.removeItem('loopwerk.recDevice.v1');
      const m = await import('./src/model.js');
      lw.store.replace(m.createEmptyProject());
      lw.engine.setPosition(0);
      lw.ui.setRecArm('t1', true);
    });
    await page.click('#rec-more');
    await page.selectOption('#rs-device', '#suchen');
    await page.waitForFunction(() => document.getElementById('rs-ch').textContent === '1 Kanal' && !document.getElementById('rs-ch').hidden, null, { timeout: 8000 }).catch(() => {});
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t1'));
    await page.waitForTimeout(200);
    const lock = await page.evaluate(() => ({ ch: document.getElementById('rs-ch').textContent, btns: [...document.querySelectorAll('#insp-recin-row .key')].map((b) => [b.textContent, b.disabled, b.title]) }));
    check('C11 1-Kanal-Gerät: „1 Kanal“, Rechts und Stereo gesperrt („Eingang hat nur einen Kanal“), Auto und Links frei',
      lock.ch === '1 Kanal' && lock.btns.length === 4 && !lock.btns[0][1] && !lock.btns[1][1] && lock.btns[2][1] && lock.btns[3][1] && lock.btns[2][2] === 'Eingang hat nur einen Kanal' && /Mono/.test(lock.btns[0][2]), JSON.stringify(lock));
    await page.evaluate(() => window.loopwerk.ui.select(null));
    await record(8.5);
    const mono = (await ownClips())[0];
    const mi = mono && await info(mono.sampleId);
    check('C11 Auto mit 1 Kanal → 1-Kanal-Sound', mi?.ch === 1 && mi.db[0] >= 20, JSON.stringify(mi));
    // Pegel: der 1-Kanal-Sound klingt links und rechts gleich laut wie seine Stereo-Kopie (startVoice mischt hoch)
    const lvl = await page.evaluate(async (id) => {
      const { store, library, renderProject } = window.loopwerk;
      const s = await library.ensure(id);
      const d = s.orig.getChannelData(0);
      const st = new AudioBuffer({ numberOfChannels: 2, length: d.length, sampleRate: s.orig.sampleRate });
      st.copyToChannel(d, 0); st.copyToChannel(d, 1);
      library.register({ id: 'test-mono-copy', name: 'Stereo-Kopie', category: 'fx', lengthBeats: s.lengthBeats, bpm: 120, buffer: st });
      const p = JSON.parse(JSON.stringify(store.project));
      const only = (sid) => ({ ...p, tracks: p.tracks.map((t, i) => ({ ...t, clips: i === 0 ? [{ ...t.clips[0], sampleId: sid }] : [] })) });
      const rms = (b, c) => { const x = b.getChannelData(c); let a = 0; for (let i = 0; i < x.length; i++) a += x[i] * x[i]; return Math.sqrt(a / x.length); };
      const m = await renderProject(only(id), library, { limiter: false, fromBeat: 0, toBeat: 8 });
      const sc = await renderProject(only('test-mono-copy'), library, { limiter: false, fromBeat: 0, toBeat: 8 });
      const db = (a, b) => 20 * Math.log10(a / b);
      return { l: db(rms(m, 0), rms(sc, 0)), r: db(rms(m, 1), rms(sc, 1)), lr: db(rms(m, 0), rms(m, 1)) };
    }, mono.sampleId);
    check('C11 1-Kanal-Sound im Mix: links und rechts so laut wie die Stereo-Kopie (±0,1 dB, kein −3-dB-Panner-Abfall)', Math.abs(lvl.l) <= 0.1 && Math.abs(lvl.r) <= 0.1 && Math.abs(lvl.lr) <= 0.1,
      `links ${lvl.l.toFixed(2)} dB, rechts ${lvl.r.toFixed(2)} dB, L−R ${lvl.lr.toFixed(2)} dB`);
    // Tempo-Strecken (Sound-Tempo: 8 Schläge → 6, Song 120 BPM) mit 1 Kanal
    const str = await page.evaluate(async (id) => {
      const { store, library } = window.loopwerk;
      const s = await library.ensure(id);
      store.setSampleTempo(id, 6);
      await library.ensureProject(store.project);
      // Die ganze Aufnahme zählt jetzt 6 Schläge = 3 s bei 120 BPM
      const want = Math.round(6 * 0.5 * s.orig.sampleRate);
      for (let i = 0; i < 100 && library.get(id).buffer?.length !== want; i++) await new Promise((r) => setTimeout(r, 100));
      const b = library.get(id).buffer;
      let peak = 0; for (const v of b.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      return { ch: b.numberOfChannels, n: b.length, want, orig: s.orig.length, peak };
    }, mono.sampleId);
    check('C11 Tempo-Strecken mit 1 Kanal (Sound-Tempo 6 Schläge): gedehnte Fassung genau 3 s, 1 Kanal, klingt', str.n === str.want && str.n < str.orig && str.ch === 1 && str.peak > 0.1, JSON.stringify(str));
    await page.evaluate((id) => window.loopwerk.store.setSampleTempo(id, null), mono.sampleId);
    // Editor: Normalisieren, Tonhöhe +1, Übernehmen
    await page.evaluate((cid) => { window.loopwerk.ui.select(cid); window.loopwerk.editor.open(cid); }, mono.id);
    await page.waitForFunction(() => !document.getElementById('editor').hidden, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await clickR(page, '#ed-normalize');
    await clickR(page, '#ed-pitch-up');
    await page.waitForTimeout(300);
    await clickR(page, '#ed-apply');
    await page.waitForFunction((args) => window.loopwerk.store.findClip(args.id).clip.sampleId !== args.old, { id: mono.id, old: mono.sampleId }, { timeout: 15000 }).catch(() => {});
    const ed = await page.evaluate(async (cid) => { const c = window.loopwerk.store.findClip(cid).clip; return { s: c.sampleId }; }, mono.id);
    const edi = ed.s !== mono.sampleId ? await info(ed.s) : null;
    check('C11 Editor (Normalisieren, Tonhöhe +1, Übernehmen) mit 1-Kanal-Sound: neuer Sound, 1 Kanal', !!edi && edi.ch === 1 && edi.n > 0, JSON.stringify(edi));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    // WAV-Export
    const ex = await page.evaluate(async () => {
      const { store, library } = window.loopwerk;
      const { exportSong } = await import('./src/export.js');
      const r = await exportSong(store.project, library, { format: 'wav', range: 'song', tail: false, mastering: false });
      const v = new DataView(await r.blob.arrayBuffer());
      const a = r.audio;
      const rms = (c) => { const x = a.getChannelData(c); let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
      return { ch: v.getUint16(22, true), bytes: r.blob.size, peak: r.peak, lr: 20 * Math.log10(rms(0) / rms(1)) };
    });
    check('C11 WAV-Export mit 1-Kanal-Sound: Stereo-Datei, klingt, links = rechts', ex.ch === 2 && ex.peak > 0.1 && Math.abs(ex.lr) < 0.1, JSON.stringify(ex));
    const ownId = mono.sampleId;
    check('C11 Keine Fehler in der Konsole (1 Kanal)', app.errors.length === 0, app.errors.join(' | '));
    // Neu laden: der Sound kommt aus IndexedDB mit 1 Kanal zurück
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const back = await page.evaluate(async (id) => { const s = await window.loopwerk.library.ensure(id); return { ch: s.orig.numberOfChannels, n: s.orig.length, rec: window.loopwerk.ui.recTracks.length }; }, ownId);
    check('C11 Nach dem Neuladen: Sound aus IndexedDB mit 1 Kanal, nichts scharf', back.ch === 1 && back.n === mi.n && back.rec === 0, JSON.stringify(back));
    await app.close();

    // ---------- Handy 390 px: Menü „Für Aufnahme scharf“, Feld im Fach „Song“ mit Gerät und Eingang ----------
    app = await openApp({ init: micSpy, args, viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.tap('.track-row:has(.lane[data-track-id="t1"]) .tbtn-menu');
    await page.waitForTimeout(200);
    const pm = await page.evaluate(() => { const r = document.getElementById('tm-rec-arm').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    await page.tap('#tm-rec-arm');
    await page.tap('.track-row:has(.lane[data-track-id="t2"]) .tbtn-menu');
    await page.waitForTimeout(200);
    await page.tap('#tm-rec-arm');
    await page.waitForTimeout(200);
    await shot(page, 'mehrspur-handy-spuren.png');
    await page.tap('#tab-song');
    await page.waitForTimeout(900);
    await page.evaluate(() => document.getElementById('rec-setup').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
    await page.tap('#rs-recin-t2-R');
    await page.waitForTimeout(200);
    const ph = await page.evaluate(() => {
      const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      const rows = [...document.querySelectorAll('#rs-armed .rs-armed-row')];
      return {
        inSong: !!document.getElementById('rec-setup').closest('#song-rec'), sel: box(document.getElementById('rs-device')),
        rows: rows.map((r) => r.querySelector('.rs-track').textContent), keys: rows.flatMap((r) => [...r.querySelectorAll('button')].map(box)),
        input: window.loopwerk.store.track('t2').recInput, fits: rows.every((r) => r.scrollWidth <= r.clientWidth + 1 && r.getBoundingClientRect().right <= innerWidth),
      };
    });
    await shot(page, 'mehrspur-handy-feld.png');
    check('C Handy: Menüpunkt „Für Aufnahme scharf“ ≥ 44 px, Fach „Song“ zeigt Gerät und beide scharfen Spuren mit Eingang (≥ 44 px, passt in die Breite), Tipp auf „Rechts“ setzt ihn',
      pm[1] >= 44 && ph.inSong && ph.sel[1] >= 44 && ph.rows.length === 2 && ph.keys.length === 10 && ph.keys.every(([w, h]) => w >= 44 && h >= 44) && ph.fits && ph.input === 'R', JSON.stringify({ pm, ph }));
    check('C Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Krachwerk: recArm aus (Menüpunkt, Schalter, Liste), die Geräteauswahl bleibt ----------
    app = await openApp({ viewport: { width: 1440, height: 900 }, fresh: true });
    page = app.page;
    await page.goto(app.url + '?edition=make');
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const kw = await page.evaluate(async () => {
      const { ui, store } = window.loopwerk;
      document.querySelector('.track-row .tbtn-menu')?.click();
      await new Promise((r) => setTimeout(r, 150));
      const menu = !!document.getElementById('tm-rec-arm');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      ui.selectTrack(store.project.tracks[0].id);
      await new Promise((r) => setTimeout(r, 150));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true }));
      return { edition: window.loopwerk.edition.id, menu, insp: !!document.getElementById('insp-arm-row'), list: !!document.getElementById('rs-armed'), device: !!document.getElementById('rs-device'), rec: ui.recTracks.length };
    });
    check('C Krachwerk: kein „Für Aufnahme scharf“, kein Schalter, keine Liste, Umschalt+R wirkungslos; Geräteauswahl da', kw.edition === 'make' && !kw.menu && !kw.insp && !kw.list && kw.device && kw.rec === 0, JSON.stringify(kw));
    await app.close();
  } catch (err) {
    check('C lief ohne Ausnahme', false, err.stack || err.message);
    await app.close().catch(() => {});
  }
}
