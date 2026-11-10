// Busse im Mixer (2.14, Scheibe 3): Rückkanäle, „→H/→E“, Bus-Seite am Handy, busPeak, Ruhe. node tests/sends-mixer.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const { measureTargets } = require('./touch-targets.cjs');
const { countUi, scene } = require('./count.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

// Läuft im Browser
function installHelpers() {
  const { library } = window.loopwerk;
  const sr = 44100;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: 2 * sr, sampleRate: sr });
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr); }
  library.register({ id: 'test-sine', name: 'Sinus', category: 'fx', lengthBeats: 4, bpm: 120, buffer: buf });
  const clip = (id, sampleId, startBeat, lengthBeats) => ({ id, sampleId, startBeat, lengthBeats, offsetBeats: 0 });
  const track = (id, extra = {}, clips = []) => ({ id, name: id, volume: 1, pan: 0, mute: false, solo: false, clips, ...extra });
  window.__sm = {
    clip, track,
    project(tracks, extra = {}) {
      return { version: 1, name: 'mixer', bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 16 }, master: { volume: 1 }, tracks, ...extra };
    },
    maxStep(d, a, b) { let m = 0; for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1])); return m; },
    energy(d, a, b) { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return e; },
  };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installHelpers);

    // ---------- 15. Live: erster Send im Lauf – kein Knackser, Bus entsteht ----------
    const t15 = await page.evaluate(async () => {
      const { buildMix, syncMix, startVoice } = await import('./src/engine.js');
      const { library } = window.loopwerk;
      const S = window.__sm;
      const sr = 44100;
      const sine = library.get('test-sine').buffer;
      const run = async (swap) => {
        const ctx = new OfflineAudioContext(2, 3 * sr, sr);
        const off = S.project([S.track('t1', {}, [])], { buses: { hall: { volume: 0.8, size: 0.6 } } });
        const on = S.project([S.track('t1', { sends: { hall: 0.8 } }, [])], { buses: { hall: { volume: 0.8, size: 0.6 } } });
        const mix = buildMix(ctx, off, { limiter: false });
        startVoice(ctx, mix.tracks.get('t1').input, sine, 0, 0, 2.5);
        let built = null;
        if (swap) {
          ctx.suspend(1.0).then(() => {
            const before = mix.buses.size;
            syncMix(ctx, on, mix, 0.5, true);
            built = [before, mix.buses.size, mix.tracks.get('t1').sends.hall?.gain.value];
            ctx.resume();
          });
        }
        const b = await ctx.startRendering();
        return { d: b.getChannelData(0), r: b.getChannelData(1), built };
      };
      const s = await run(true);
      const n = await run(false);
      const at = (t) => Math.round(t * sr);
      return {
        built: s.built,
        near: S.maxStep(s.d, at(0.95), at(1.05)), before: S.maxStep(s.d, at(0.3), at(0.9)), after: S.maxStep(s.d, at(1.1), at(1.9)),
        // Nachhall = Unterschied zum Lauf ohne Send (beide Kanäle): der Hall ist links/rechts unkorreliert und kann den
        // Sinus auf einem Kanal teilweise auslöschen, die Summe der Energie steigt dann nicht verlässlich
        wetDb: (() => {
          let w = 0, d = 0;
          for (const [x, y] of [[s.d, n.d], [s.r, n.r]]) for (let i = at(1.4); i < at(2.4); i++) { w += (x[i] - y[i]) ** 2; d += y[i] * y[i]; }
          return 10 * Math.log10(w / d + 1e-30);
        })(),
      };
    });
    const ref15 = Math.max(t15.before, t15.after);
    check('15 Live: erster Send baut den Bus (0 → 1) mit Send-Gain, der bei 0 beginnt', t15.built?.[0] === 0 && t15.built[1] === 1 && t15.built[2] < 0.1, JSON.stringify(t15.built));
    check('15 Live: Sprungtest – größter Schritt ±50 ms ≤ 1,5 × eingeschwungen', t15.near <= 1.5 * ref15, `±50 ms ${t15.near.toFixed(4)}, davor ${t15.before.toFixed(4)}, danach ${t15.after.toFixed(4)}`);
    check('15 Live: der Hall klingt nach dem Einschalten (Nachhall höchstens 20 dB unter dem Direktsignal)', t15.wetDb > -20, `${t15.wetDb.toFixed(2)} dB`);

    // ---------- Pegel der Rückkanäle (busPeak) ----------
    const pk = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const S = window.__sm;
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-sine', 0, 16)]), S.track('t2', {}, [S.clip('c2', 'test-sine', 0, 16)])], { buses: { hall: { volume: 0.8, size: 0.6 } } }));
      await engine.play(0);
      await new Promise((r) => setTimeout(r, 400));
      const idle = engine.busPeak('hall');
      store.setSend('t1', 'hall', 1);
      await new Promise((r) => setTimeout(r, 900));
      let peak = 0;
      for (let i = 0; i < 20; i++) { peak = Math.max(peak, engine.busPeak('hall')); await new Promise((r) => setTimeout(r, 30)); }
      const none = engine.busPeak('echo');
      engine.stop();
      return { idle, peak, none };
    });
    check('busPeak: 0 ohne Send, Pegel > 0 mit Send, unbekannter/ungebauter Bus 0', pk.idle === 0 && pk.peak > 0.001 && pk.none === 0, JSON.stringify(pk));

    // ---------- 17. Mixer Desktop ----------
    await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const S = window.__sm;
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-sine', 0, 8)]), S.track('t2', {}, [S.clip('c2', 'test-sine', 0, 8)])]));
      ui.setDock('mixer');
    });
    await page.waitForSelector('#mixer:not([hidden]) .strip-bus');
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#mixer-strips > .strip')].map((s) => s.dataset.stripId);
      const idle = [...document.querySelectorAll('#mixer-strips .strip-bus')].map((s) => s.classList.contains('idle'));
      const s1 = document.querySelector('.strip[data-strip-id="t1"] .strip-sends');
      const labels = [...document.querySelectorAll('.strip[data-strip-id="t1"] .strip-send-label')].map((n) => n.textContent);
      const ctl = (id) => !!document.querySelector(`#mixer-strips .strip[data-strip-id="${id}"]`);
      return { ids, idle, sends: !!s1 && getComputedStyle(s1).display !== 'none', labels, busHasPan: !!document.querySelector('.strip-bus .strip-pan'), busHasSolo: !!document.querySelector('.strip-bus .tbtn-solo'), trackHasSendIn: ctl('t1') };
    });
    check('17 Mixer: Rückkanäle „Hall-Bus“ und „Echo-Bus“ zwischen den Spuren und dem Master', JSON.stringify(layout.ids) === '["t1","t2","__bus:hall","__bus:echo","__master"]', JSON.stringify(layout.ids));
    check('17 Mixer: ohne Send sind beide Rückkanäle gedimmt', layout.idle.length === 2 && layout.idle.every(Boolean), JSON.stringify(layout.idle));
    check('17 Mixer: Kanalzug hat „→H“ und „→E“, Rückkanal weder Panorama noch Solo', layout.sends && layout.labels.join() === '→H,→E' && !layout.busHasPan && !layout.busHasSolo, JSON.stringify(layout));

    // Drehregler „→H“ mit der Maus ziehen (senkrecht, relativ)
    const kb = await page.evaluate(() => { const r = document.querySelector('.strip[data-strip-id="t1"] .strip-send:first-child .knob').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    await page.mouse.move(kb.x, kb.y);
    await page.mouse.down();
    await page.mouse.move(kb.x, kb.y - 50, { steps: 6 });
    await page.mouse.up();
    const rd = () => page.evaluate(() => {
      const st = window.loopwerk.store;
      return { sends: st.project.tracks[0].sends ?? null, buses: st.project.buses ?? null, idle: [...document.querySelectorAll('#mixer-strips .strip-bus')].map((s) => s.classList.contains('idle')), on: document.querySelector('.strip[data-strip-id="t1"] .strip-send:first-child').classList.contains('on') };
    });
    let r = await rd();
    check('17 Mixer: „→H“ ziehen setzt track.sends.hall; Hall-Bus ist nicht mehr gedimmt, Echo-Bus schon', r.sends?.hall > 0.2 && r.sends.hall < 0.6 && r.idle[0] === false && r.idle[1] === true && r.on, JSON.stringify(r));
    // Titel und Doppelklick
    const title = await page.evaluate(() => document.getElementById('send-t1-hall').title);
    check('17 Mixer: Titel „Anteil zum Hall-Bus“, Doppelklick setzt 0', /Anteil zum Hall-Bus/.test(title) && await (async () => {
      await page.dblclick('.strip[data-strip-id="t1"] .strip-send:first-child .knob');
      const q = await rd();
      return q.sends === null && q.idle[0] === true;
    })(), title);
    // „→E“ per Eingabefeld (Tastatur/Vorleser)
    await page.evaluate(() => { const n = document.getElementById('send-t2-echo'); n.value = '0.4'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    const t2s = await page.evaluate(() => window.loopwerk.store.project.tracks[1].sends);
    check('17 Mixer: „→E“ an Spur 2 setzt track.sends.echo', t2s?.echo === 0.4, JSON.stringify(t2s));

    // Fader und Stumm des Rückkanals
    await page.evaluate(() => { const n = document.getElementById('fader-bus-echo'); n.value = '0.5'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#mixer-strips .strip[data-strip-id="__bus:echo"] .tbtn-mute');
    r = await rd();
    check('17 Mixer: Fader des Rückkanals setzt buses.echo.volume, M schaltet buses.echo.mute', r.buses?.echo?.volume === 0.5 && r.buses.echo.mute === true, JSON.stringify(r.buses));
    const mutedUi = await page.evaluate(() => document.querySelector('.strip[data-strip-id="__bus:echo"] .tbtn-mute').getAttribute('aria-pressed'));
    check('17 Mixer: M zeigt den Zustand (aria-pressed)', mutedUi === 'true', mutedUi);

    // Name: öffnet den Inspektor „Song“ beim Block „Busse“
    await page.evaluate(() => { window.loopwerk.ui.selectTrack('t1'); });
    await page.click('#mixer-strips .strip[data-strip-id="__bus:echo"] .strip-name');
    await page.waitForTimeout(300);
    const insp = await page.evaluate(() => ({ mode: document.getElementById('insp').dataset.mode, box: !!document.getElementById('insp-bus-echo')?.offsetParent, hint: document.getElementById('hint-text')?.textContent || '' }));
    check('17 Mixer: Klick auf den Namen zeigt Inspektor „Song“ mit dem Block des Busses', insp.mode === 'song' && insp.box, JSON.stringify(insp));
    // Ohne Send zeigt der Block nichts – dann sagt es der Einblender
    await page.evaluate(() => { window.loopwerk.store.setSend('t2', 'echo', 0); });
    await page.evaluate(() => window.loopwerk.ui.selectTrack('t1'));
    await page.click('#mixer-strips .strip[data-strip-id="__bus:echo"] .strip-name');
    await page.waitForTimeout(200);
    const flash = await page.evaluate(() => document.getElementById('hint-text')?.textContent || '');
    check('17 Mixer: Name eines ungenutzten Rückkanals meldet „Noch sendet keine Spur …“', /Noch sendet keine Spur zum Echo-Bus/.test(flash), flash);
    await page.evaluate(() => window.loopwerk.store.setSend('t1', 'hall', 0.5));
    await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mixer-desktop.png') });

    // Pegelanzeige zeichnet (Canvas des Rückkanals hat Größe)
    const meter = await page.evaluate(() => { const c = document.querySelector('.strip[data-strip-id="__bus:hall"] .strip-meter'); return { w: c.width, h: c.height }; });
    check('17 Mixer: Rückkanal hat eine Pegelanzeige', meter.w > 0 && meter.h > 0, JSON.stringify(meter));
    check('17 Desktop: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Desktop-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
  }

  // ---------- 17. Handy: Bus-Seite ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const p = phone.page;
    await p.evaluate(installHelpers);
    await p.evaluate(() => {
      const S = window.__sm;
      window.loopwerk.store.replace(S.project([S.track('t1', { sends: { hall: 0.3 } }, [S.clip('c1', 'test-sine', 0, 8)]), S.track('t2', {}, [S.clip('c2', 'test-sine', 0, 8)])]));
      window.loopwerk.ui.setDock('mixer');
    });
    await p.waitForSelector('#mixer:not([hidden]) .strip-name');
    await p.waitForTimeout(500);
    const hv = await p.evaluate(() => ({
      sends: [...document.querySelectorAll('.strip-sends')].every((n) => getComputedStyle(n).display === 'none'),
      overflow: document.documentElement.scrollWidth <= innerWidth,
      bus: [...document.querySelectorAll('#mixer-strips .strip-bus')].length,
    }));
    check('17 Handy: keine Send-Knöpfe in den Kanalzügen, Rückkanäle da, kein waagrechtes Scrollen der Seite', hv.sends && hv.bus === 2 && hv.overflow, JSON.stringify(hv));
    await p.evaluate(() => { document.getElementById('mixer-strips').scrollLeft = 9999; });
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'mixer-phone.png') });
    await p.tap('#mixer-strips .strip[data-strip-id="__bus:hall"] .strip-name');
    await p.waitForSelector('#mixer .fx-bus-page');
    await p.waitForTimeout(500);
    const pg = await p.evaluate(() => ({ title: document.querySelector('#mixer .detail-title').textContent, ids: [...document.querySelectorAll('#mixer .fx-bus-page [id]')].map((n) => n.id) }));
    check('17 Handy: Name des Rückkanals öffnet die Bus-Seite (Lautstärke, Raumgröße, Stumm)', pg.title === 'Hall-Bus' && pg.ids.join() === 'fx-bus-hall-mute,fx-bus-hall-volume,fx-bus-hall-size', JSON.stringify(pg));
    await p.evaluate(() => {
      for (const [id, v] of [['fx-bus-hall-volume', '0.5'], ['fx-bus-hall-size', '0.3']]) { const n = document.getElementById(id); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await p.tap('#fx-bus-hall-mute');
    const hb = await p.evaluate(() => ({ buses: window.loopwerk.store.project.buses, out: [...document.querySelectorAll('#mixer .fx-bus-page .fx-param-value')].map((n) => n.textContent), pressed: document.getElementById('fx-bus-hall-mute').getAttribute('aria-pressed') }));
    check('17 Handy: Bus-Seite setzt Lautstärke, Raumgröße, Stumm (Anzeige folgt)', JSON.stringify(hb.buses) === '{"hall":{"volume":0.5,"size":0.3,"mute":true}}' && hb.out[1] === '30 %' && hb.pressed === 'true', JSON.stringify(hb));
    const tg = (await p.evaluate(measureTargets)).filter((x) => /fx-bus/.test(x.label));
    const box = await p.evaluate(() => ['#fx-bus-hall-mute', '#mixer .detail-back'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { q, w: Math.round(r.width), h: Math.round(r.height) }; }));
    check('17 Handy: Tippflächen der Bus-Seite ≥ 44 px (Regler, Stumm, Zurück)', tg.length >= 2 && tg.every((x) => x.w >= 44 && x.h >= 44) && box.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify({ tg, box }));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'mixer-phone-bus.png') });
    // Echo-Bus: Zeit (Notenwert) und Wiederholungen
    await p.tap('#mixer .detail-back');
    await p.waitForSelector('#mixer-strips .strip-bus');
    await p.evaluate(() => { document.getElementById('mixer-strips').scrollLeft = 9999; });
    await p.tap('#mixer-strips .strip[data-strip-id="__bus:echo"] .strip-name');
    await p.waitForSelector('#fx-bus-echo-time');
    await p.selectOption('#fx-bus-echo-time', '1/4');
    await p.evaluate(() => { const n = document.getElementById('fx-bus-echo-feedback'); n.value = '0.2'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    const eb = await p.evaluate(() => window.loopwerk.store.project.buses.echo);
    check('17 Handy: Echo-Bus-Seite setzt Zeit und Wiederholungen', eb.time === '1/4' && eb.feedback === 0.2, JSON.stringify(eb));
    // Zurück, dann Spur → Kopfzeile „‹ Alle Kanäle“ deckt beim Scrollen nichts durch
    await p.tap('#mixer .detail-back');
    await p.waitForSelector('#mixer-strips .strip[data-strip-id="t1"] .strip-name');
    await p.tap('#mixer-strips .strip[data-strip-id="t1"] .strip-name');
    await p.waitForSelector('#mixer .fx-cards');
    await p.waitForTimeout(500);
    const head = await p.evaluate(() => {
      const d = document.getElementById('mixer-detail');
      d.scrollTop = 300;
      const h = document.querySelector('#mixer .detail-head');
      const cs = getComputedStyle(h);
      const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor)?.[1].split(/[ ,/]+/).filter(Boolean) ?? [];
      const alpha = m.length > 3 ? Number(m[3]) : 1;
      const hr = h.getBoundingClientRect();
      const dr = d.getBoundingClientRect();
      // Über der Kopfzeile darf keine Karte hervorschauen: ganz oben im Scrollbereich liegt die Kopfzeile
      const top = document.elementFromPoint(dr.left + 200, dr.top + 1);
      return { alpha, gap: hr.top - dr.top, top: !!top && h.contains(top) };
    });
    check('17 Handy: Kopfzeile „‹ Alle Kanäle“ ist deckend und schließt oben bündig ab (nichts schimmert durch)', head.alpha === 1 && head.gap === 0 && head.top, JSON.stringify(head));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'mixer-phone-scrolled.png') });
    check('17 Handy: keine Konsolenfehler', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (e) {
    check('Handy-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await phone.close();
  }

  // ---------- 18. Ruhe: Zählung gegen die Basis ----------
  const calm = await openApp({ viewport: { width: 1400, height: 820 }, fresh: true });
  try {
    await scene(calm.page, 'start');
    const now = await countUi(calm.page);
    const base = require('./count-baseline.json')['desktop-start'];
    check('18 Ruhe: Startansicht Desktop unverändert (Bedienelemente, Rahmen, Schriftgrößen)', now.controls === base.controls && now.frames === base.frames && now.sizes === base.sizes, `${JSON.stringify(now)} gegen ${JSON.stringify(base)}`);
    await scene(calm.page, 'clip');
    const clip = await countUi(calm.page);
    const bc = require('./count-baseline.json')['desktop-clip'];
    check('18 Ruhe: „Clip gewählt“ Desktop unverändert', clip.controls === bc.controls && clip.frames === bc.frames && clip.sizes === bc.sizes, `${JSON.stringify(clip)} gegen ${JSON.stringify(bc)}`);
  } catch (e) {
    check('Zähl-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await calm.close();
    finish();
  }
})();
