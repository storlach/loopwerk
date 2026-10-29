// Tests für Stufe 4 (Mixer und Effekte): node tests/stufe4.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker, toggleFx } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

(async () => {
  const app = await openApp();
  const { page } = app;
  try {
    const m = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { defaultFx } = await import('./src/effects.js');
      const { mulberry32 } = await import('./src/util.js');
      const sr = 44100;
      const mk = (id, fill, secs = 2) => {
        const b = new AudioBuffer({ numberOfChannels: 2, length: secs * sr, sampleRate: sr });
        for (let c = 0; c < 2; c++) fill(b.getChannelData(c), c);
        library.register({ id, name: id, category: 'fx', lengthBeats: secs * 2, bpm: 120, buffer: b });
      };
      const rnd = mulberry32(5);
      mk('t-noise', (d) => { for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * 0.3; });
      mk('t-loud', (d) => { for (let i = 0; i < d.length; i++) d[i] = 0.8 * Math.sin(2 * Math.PI * 220 * i / sr); });
      mk('t-quiet', (d) => { for (let i = 0; i < d.length; i++) d[i] = 0.1 * Math.sin(2 * Math.PI * 220 * i / sr); });

      const fxWith = (id, patch) => { const f = defaultFx(); Object.assign(f[id], { on: true }, patch); return f; };
      const proj = (sampleId, fx = null, extra = {}, len = 4) => ({
        version: 1, bpm: 120, beatsPerBar: 4, lengthBars: 4, loop: { on: false, startBeat: 0, endBeat: 16 },
        tracks: [{ id: 't1', name: 'T', volume: 1, pan: 0, mute: false, solo: false, fx, clips: [{ id: 'a', sampleId, startBeat: 0, lengthBeats: len }], ...extra }],
      });
      const render = async (p, toBeat = 8) => renderProject(p, library, { limiter: false, toBeat });

      // kleine FFT für Bandenergie
      const bandDb = (d, lo, hi) => {
        const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = d[i + 4410] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= N; len <<= 1) {
          const a = -2 * Math.PI / len;
          for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(a * k), wi = Math.sin(a * k);
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
            re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          }
        }
        let e = 0;
        for (let k = Math.floor(lo * N / sr); k < Math.ceil(hi * N / sr); k++) e += re[k] * re[k] + im[k] * im[k];
        return 10 * Math.log10(e + 1e-20);
      };
      const rms = (d, a, b) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return Math.sqrt(e / (b - a)); };
      const out = {};

      // Bypass: alle Effekte aus = identisch zur Spur ohne Effekte
      const a0 = (await render(proj('t-noise', null))).getChannelData(0);
      const a1 = (await render(proj('t-noise', defaultFx()))).getChannelData(0);
      let diff = 0; for (let i = 0; i < a0.length; i++) diff = Math.max(diff, Math.abs(a0[i] - a1[i]));
      out.bypass = diff;

      // EQ
      const eqHigh = (await render(proj('t-noise', fxWith('eq', { high: 12 })))).getChannelData(0);
      const eqLow = (await render(proj('t-noise', fxWith('eq', { low: -12 })))).getChannelData(0);
      out.eq = {
        highBoost: bandDb(eqHigh, 9000, 16000) - bandDb(a0, 9000, 16000),
        lowCut: bandDb(eqLow, 30, 120) - bandDb(a0, 30, 120),
        midSame: bandDb(eqHigh, 600, 1200) - bandDb(a0, 600, 1200),
      };

      // Echo 1/8 bei 120 BPM = 0,25 s: Wiederholungen bei 11025 und 22050 Frames
      const e = (await render(proj('test-click', fxWith('echo', { time: '1/8', feedback: 0.5, mix: 0.5 }), {}, 1), 4)).getChannelData(0);
      const peakNear = (f) => { let p = 0; for (let i = f - 200; i < f + 400; i++) p = Math.max(p, Math.abs(e[i])); return p; };
      out.echo = { first: peakNear(11025), second: peakNear(22050), gap: rms(e, 2000, 10500) };

      // Hall: Ausklang nach dem Impuls, größer bei größerem Raum
      const h0 = (await render(proj('test-click', null, {}, 1), 8)).getChannelData(0);
      const hs = (await render(proj('test-click', fxWith('hall', { size: 0.2, mix: 0.5 }), {}, 1), 8)).getChannelData(0);
      const hl = (await render(proj('test-click', fxWith('hall', { size: 0.9, mix: 0.5 }), {}, 1), 8)).getChannelData(0);
      out.hall = { dry: rms(h0, 4410, 17640), early: rms(hs, 4410, 17640), small: rms(hs, 35280, 52920), large: rms(hl, 35280, 52920) };

      // Kompressor verringert die Dynamik (Abstand laut/leise in dB)
      const lvl = async (id, fx) => rms((await render(proj(id, fx))).getChannelData(0), 22050, 66150);
      const dynOff = 20 * Math.log10(await lvl('t-loud', null) / await lvl('t-quiet', null));
      const cfx = fxWith('comp', { amount: 1 });
      const dynOn = 20 * Math.log10(await lvl('t-loud', cfx) / await lvl('t-quiet', cfx));
      out.comp = { dynOff, dynOn };

      // Panorama ganz links: rechter Kanal stumm
      const pl = await render(proj('t-noise', null, { pan: -1 }));
      out.pan = { left: rms(pl.getChannelData(0), 0, 44100), right: rms(pl.getChannelData(1), 0, 44100) };

      // Master-Lautstärke 0,425 halbiert gegenüber Standard 0,85; Master-Effekt wirkt
      const mp = proj('test-click', null, {}, 1);
      mp.master = { volume: 0.425 };
      out.master = (await render(mp, 4)).getChannelData(0)[0];
      const mh = proj('test-click', null, {}, 1);
      mh.master = { volume: 0.85, fx: fxWith('hall', { size: 0.5, mix: 0.5 }) };
      out.masterHall = rms((await render(mh, 8)).getChannelData(0), 4410, 17640);
      return out;
    });

    check('Alle Effekte aus = unverändertes Signal', m.bypass < 1e-6, `max. Abweichung ${m.bypass.toExponential(1)}`);
    check('EQ Höhen +12 dB hebt die Höhen an', m.eq.highBoost > 9, `${m.eq.highBoost.toFixed(1)} dB über 9 kHz`);
    check('EQ Tiefen −12 dB senkt die Tiefen ab', m.eq.lowCut < -8, `${m.eq.lowCut.toFixed(1)} dB unter 120 Hz`);
    check('EQ lässt die Mitten in Ruhe', Math.abs(m.eq.midSame) < 1.5, `${m.eq.midSame.toFixed(1)} dB bei 600–1200 Hz`);
    check('Echo 1/8 wiederholt nach 0,25 s und 0,5 s', m.echo.first > 0.05 && m.echo.second > 0.02 && m.echo.second < m.echo.first && m.echo.gap < 0.005,
      `1. ${m.echo.first.toFixed(3)}, 2. ${m.echo.second.toFixed(3)}, dazwischen ${m.echo.gap.toExponential(1)}`);
    check('Hall erzeugt einen Ausklang', m.hall.dry < 1e-6 && m.hall.early > 1e-4, `trocken ${m.hall.dry.toExponential(1)}, mit Hall ${m.hall.early.toExponential(1)} (0,1–0,4 s)`);
    check('Größerer Raum klingt länger', m.hall.large > m.hall.small * 3, `nach 0,8–1,2 s: klein ${m.hall.small.toExponential(1)}, groß ${m.hall.large.toExponential(1)}`);
    check('Kompressor verringert den Abstand laut/leise', m.comp.dynOn < m.comp.dynOff - 6, `${m.comp.dynOff.toFixed(1)} dB → ${m.comp.dynOn.toFixed(1)} dB`);
    check('Panorama links: rechter Kanal stumm', m.pan.right < 1e-4 && m.pan.left > 0.1, `L ${m.pan.left.toFixed(3)}, R ${m.pan.right.toExponential(1)}`);
    check('Master-Lautstärke wirkt', Math.abs(m.master - 0.425) < 0.002, `Impuls ${m.master.toFixed(4)}`);
    check('Master-Effekt wirkt', m.masterHall > 1e-3, `Ausklang ${m.masterHall.toExponential(1)}`);

    // ---------- Mixer bedienen ----------
    await page.evaluate(async () => { const mm = await import('./src/model.js'); window.loopwerk.store.replace(mm.createDemoProject()); });
    await page.click('#mixer-btn');
    const visible = await page.locator('#mixer').isVisible();
    const stripCount = await page.locator('#mixer .strip').count();
    check('Mixer öffnet mit Kanalzug je Spur plus Master', visible && stripCount === 9, `${stripCount} Kanalzüge`);

    // Desktop: Klick auf „keine Effekte“ zeigt die Spur im Inspektor; dort liegen die Effekte
    await page.locator('#mixer .strip[data-strip-id="t1"] .strip-sum').click();
    const insp = await page.evaluate(() => ({ mode: document.getElementById('insp').dataset.mode, title: document.querySelector('#insp .insp-sec:not([hidden]) .insp-title')?.textContent }));
    check('Effekte des gewählten Kanals stehen im Inspektor', insp.mode === 'track' && insp.title.includes('Drums'), JSON.stringify(insp));
    await page.click('#fx-hall-on');
    const hallOn = await page.evaluate(() => window.loopwerk.store.track('t1').fx.hall.on);
    check('Hall-Schalter schaltet Hall ein', hallOn === true);
    check('Kanalzug zeigt „1 Effekt“', (await page.locator('#mixer .strip[data-strip-id="t1"] .strip-sum').textContent()) === '1 Effekt');

    await page.locator('#fx-hall-mix').fill('0.6');
    const mix = await page.evaluate(() => window.loopwerk.store.track('t1').fx.hall.mix);
    check('Regler ändert den Effekt-Parameter', Math.abs(mix - 0.6) < 0.01, String(mix));
    await page.click('#fx-echo-on');
    await page.locator('#fx-echo-time').selectOption('1/16');
    const echo = await page.evaluate(() => window.loopwerk.store.track('t1').fx.echo);
    check('Echo einschalten, Zeit wählen', echo.on && echo.time === '1/16', JSON.stringify(echo));

    await page.locator('#fader-t2').fill('0.3');
    await page.locator('#pan-t2').fill('-0.5');
    const t2 = await page.evaluate(() => { const t = window.loopwerk.store.track('t2'); return [t.volume, t.pan]; });
    check('Fader und Panorama im Mixer', t2[0] === 0.3 && t2[1] === -0.5, JSON.stringify(t2));
    await page.locator('#fader-__master').fill('0.5');
    check('Master-Fader', await page.evaluate(() => window.loopwerk.store.project.master.volume) === 0.5);

    // Wiedergabe mit Effekten, Effekt live umschalten
    await page.click('#play-btn');
    await page.waitForTimeout(700);
    await toggleFx(page, 't4', 'eq');
    await page.waitForTimeout(300);
    await toggleFx(page, 't4', 'eq');
    await page.waitForTimeout(300);
    const live = await page.evaluate(() => ({ playing: window.loopwerk.engine.playing, meter: window.loopwerk.engine.trackPeak('t4') }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'stufe4-light.png') });
    await page.click('#play-btn');
    check('Effekte live umschalten während der Wiedergabe', live.playing, `Pegel Pad ${live.meter.toFixed(3)}`);
    check('Kanal-Pegelanzeige bekommt Signal', live.meter > 0.01);

    await page.keyboard.press('Control+z');
    check('Rückgängig gilt auch für Effekte', await page.evaluate(() => window.loopwerk.store.track('t4').fx.eq.on) === true);

    if (SHOTS) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOT_DIR, 'stufe4-dark.png') });
      const phone = await app.browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
      await phone.goto(app.url);
      await phone.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
      await phone.click('#mixer-btn');
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('Handy: Mixer ohne horizontale Seitenverschiebung', overflow <= 0, `${overflow}px`);
      await phone.screenshot({ path: path.join(SHOT_DIR, 'stufe4-phone.png'), fullPage: true });
    }
    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Testlauf ohne Ausnahme', false, err.stack);
  } finally {
    await app.close();
    finish();
  }
})();
