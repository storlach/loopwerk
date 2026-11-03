// 2.13 Aufnahme (Spec docs/specs/v2.13-aufnahme.md): A Latenz einmessen, B Takes im Loop.
// node tests/v213-aufnahme.test.cjs [--shots]   (SHOT_DIR=… für Bilder)
// Mikrofon: Loopback-Attrappe – getUserMedia liefert engine.out → DelayNode(0,12 s) (+ Testtöne) → MediaStreamDestination.
const fs = require('fs');
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { countUi, scene } = require('./count.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, '..', 'docs', 'ux', 'v2.13');
const { check, finish } = createChecker();
const SR = 44100;
// Zählung vor 2.13 (Basis bis 2.14): genau +1 Bedienelement am Desktop (▾ am ●), Handy unverändert
const OLD_COUNT = { 'desktop-start': 84, 'desktop-clip': 88, 'handy-start': 48, 'handy-clip': 52 };

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
  // ================= A1: Suche und Auswertung, offline =================
  let app = await openApp({ init: loopback, viewport: { width: 1440, height: 900 } });
  let page = app.page;
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
    check('A2 Zweiter Lauf weicht ≤ 1 ms ab', Math.abs(ms2 - ms1) <= 1, `${ms1} / ${ms2} ms`);
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
    const now = {};
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
      for (const s of ['start', 'clip']) { await scene(pg, s); now[`${dev}-${s}`] = await countUi(pg); }
      await pg.close();
    }
    await browser.close();
    server.close();
    const deltas = Object.fromEntries(Object.keys(OLD_COUNT).map((k) => [k, now[k].controls - OLD_COUNT[k]]));
    check('A4 Zählung: genau +1 Bedienelement in desktop-start und desktop-clip (▾), Handy unverändert', deltas['desktop-start'] === 1 && deltas['desktop-clip'] === 1 && deltas['handy-start'] === 0 && deltas['handy-clip'] === 0, JSON.stringify(deltas));
    check('A4 Zählung trifft die neue Basis exakt', Object.keys(base).every((k) => JSON.stringify(base[k]) === JSON.stringify(now[k])), JSON.stringify(now));
  } catch (err) {
    check('A4 Zählung lief ohne Ausnahme', false, err.stack || err.message);
  }

  finish();
})();
