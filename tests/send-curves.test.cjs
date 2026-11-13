// Send-Kurven (2.14, Scheibe 4): send.hall / send.echo als Automation. node tests/send-curves.test.cjs [--shots]
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');

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
  const RAMP = [{ beat: 4, value: 0 }, { beat: 8, value: 1 }];
  window.__sc = {
    clip, track, RAMP,
    project(tracks, extra = {}) {
      return { version: 1, name: 'curves', bpm: 120, beatsPerBar: 4, lengthBars: 8, loop: { on: false, startBeat: 0, endBeat: 32 }, master: { volume: 1 }, tracks, ...extra };
    },
    // Gleichspannung auf Spur t1, Echo-Bus 1/4 ohne Wiederholungen (1 Schlag = 0,5 s bei 120 BPM)
    dcProject(extra = {}, lane = RAMP) {
      return this.project([track('t1', { ...extra, ...(lane ? { automation: { 'send.echo': lane } } : {}) }, [clip('c1', 'test-dc', 0, 12)])], { buses: { echo: { volume: 0.8, time: '1/4', feedback: 0 } } });
    },
  };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installHelpers);

    // ---------- 14. Kurve offline: Bus-Anteil = Kurve um einen Schlag verzögert ----------
    const t14 = await page.evaluate(async () => {
      const { library, renderProject } = window.loopwerk;
      const { autoValueAt } = await import('./src/automation.js');
      const S = window.__sc;
      const o = { toBeat: 12, limiter: false };
      const ch = async (p) => (await renderProject(p, library, o)).getChannelData(0);
      const none = await ch(S.dcProject({}, null));
      const full = await ch(S.dcProject({ sends: { echo: 1 } }, null));
      const curve = await ch(S.dcProject({}));
      const both = await ch(S.dcProject({ sends: { echo: 0.9 } }));
      const sr = 44100;
      let worst = 0;
      let n = 0;
      for (let b = 5.2; b <= 11.5; b += 0.1) {
        const i = Math.round(b * 0.5 * sr);
        const ref = full[i] - none[i];
        const got = curve[i] - none[i];
        worst = Math.max(worst, Math.abs(got / ref - autoValueAt(S.RAMP, b - 1, 0)));
        n++;
      }
      let setSend = 0;
      for (let i = 0; i < curve.length; i++) setSend = Math.max(setSend, Math.abs(curve[i] - both[i]));
      // Vor dem ersten Echo (bis 0,49 s) ist nichts vom Bus zu hören
      let early = 0;
      for (let i = 0; i < Math.round(0.49 * sr); i++) early = Math.max(early, Math.abs(curve[i] - none[i]));
      return { worst, n, setSend, early, refAt: full[Math.round(10 * 0.5 * sr)] - none[Math.round(10 * 0.5 * sr)] };
    });
    check('14 Kurve 0 → 1 über Schlag 4–8: Bus-Anteil = Kurve, einen Schlag verzögert (± 1e-3)', t14.worst <= 1e-3 && t14.n > 50 && Math.abs(t14.refAt) > 0.1, `größte Abweichung ${t14.worst.toExponential(2)} an ${t14.n} Proben, voller Bus ${t14.refAt.toFixed(3)}`);
    check('14 Mit Kurve ändert track.sends den Klang nicht (Differenz < 1e-7)', t14.setSend < 1e-7, t14.setSend.toExponential(2));
    check('14 Vor dem ersten Echo ist nichts vom Bus zu hören', t14.early < 1e-7, t14.early.toExponential(2));

    // ---------- 14. Kurve realtime: Gain folgt der Kurve; Regler schreibt nicht hinein; Löschen gibt ihn zurück ----------
    const rt = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const { autoValueAt } = await import('./src/automation.js');
      const S = window.__sc;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const pts = [{ beat: 0, value: 0 }, { beat: 8, value: 1 }];
      store.replace(S.dcProject({}, pts));
      const gain = () => engine.mix.tracks.get('t1').sends.echo?.gain;
      await engine.play(0);
      await wait(150);
      const out = { node: !!gain(), bus: engine.mix.buses.has('echo'), follow: [] };
      for (let k = 0; k < 10; k++) {
        await wait(260);
        out.follow.push({ got: gain().value, want: autoValueAt(pts, engine.currentBeat(), 0) });
      }
      // Regler stellen: wirkt nicht
      store.setSend('t1', 'echo', 0.9);
      await wait(60);
      const a = gain().value;
      await wait(200);
      out.locked = { got: gain().value, want: autoValueAt(pts, engine.currentBeat(), 0), a };
      // Kurve löschen: der Regler (0,9) übernimmt
      store.clearAutomation('t1', 'send.echo');
      await wait(300);
      out.released = gain().value;
      // Rückgängig: die Kurve übernimmt wieder
      store.undo();
      await wait(250);
      out.back = { got: gain().value, want: autoValueAt(pts, engine.currentBeat(), 0) };
      engine.stop();
      return out;
    });
    const dFollow = Math.max(...rt.follow.map((x) => Math.abs(x.got - x.want)));
    check('14 Realtime: Send-Gain folgt der Kurve an 10 Zeitpunkten (± 0,02); Bus und Knoten entstehen allein durch die Kurve', rt.node && rt.bus && dFollow <= 0.02 && rt.follow[9].got > rt.follow[0].got + 0.2,
      `größte Abweichung ${dFollow.toFixed(4)}, ${rt.follow[0].got.toFixed(3)} → ${rt.follow[9].got.toFixed(3)}`);
    check('14 Realtime: setSend ändert den Klang mit Kurve nicht', Math.abs(rt.locked.got - rt.locked.want) <= 0.02, JSON.stringify(rt.locked));
    check('14 Kurve löschen im Lauf: der Regler (0,9) gibt den Wert vor', Math.abs(rt.released - 0.9) < 0.01, `${rt.released}`);
    check('14 Rückgängig: die Kurve übernimmt wieder', Math.abs(rt.back.got - rt.back.want) <= 0.03, JSON.stringify(rt.back));

    // Kurve im Lauf neu anlegen (Knoten entsteht erst jetzt) und wieder löschen (Knoten verschwindet)
    const lv = await page.evaluate(async () => {
      const { store, engine } = window.loopwerk;
      const { autoValueAt } = await import('./src/automation.js');
      const S = window.__sc;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-dc', 0, 12)])], { buses: { echo: { volume: 0.8, time: '1/4', feedback: 0 } } }));
      await engine.play(0);
      await wait(200);
      const out = { before: !!engine.mix.tracks.get('t1').sends.echo, busBefore: engine.mix.buses.has('echo') };
      store.addAutoPoint('t1', 'send.echo', 0, 0);
      store.addAutoPoint('t1', 'send.echo', 8, 1);
      await wait(400);
      const g = engine.mix.tracks.get('t1').sends.echo?.gain;
      out.node = !!g;
      const pts = store.project.tracks[0].automation['send.echo'];
      out.follow = g ? Math.abs(g.value - autoValueAt(pts, engine.currentBeat(), 0)) : 1;
      store.clearAutomation('t1', 'send.echo');
      await wait(250);
      out.after = !!engine.mix.tracks.get('t1').sends.echo;
      engine.stop();
      return out;
    });
    check('14 Kurve im Lauf angelegt: Knoten entsteht, folgt gleich der Kurve; gelöscht ohne Regler: Knoten verschwindet', !lv.before && lv.node && lv.follow <= 0.03 && !lv.after, JSON.stringify(lv));

    // ---------- Modell: Kurve gehört zur Spur ----------
    const md = await page.evaluate(async () => {
      const m = await import('./src/automation.js');
      const { store } = window.loopwerk;
      const S = window.__sc;
      store.replace(S.project([S.track('t1', { sends: { hall: 0.4 } }, [S.clip('c1', 'test-sine', 0, 8)]), S.track('t2', {}, [])]));
      const keys = m.autoKeys('t1');
      const out = { keys: keys.filter((k) => k.startsWith('send.')), master: m.autoKeys('master').filter((k) => k.startsWith('send.')), rest: m.autoRest(store.project.tracks[0], 'send.hall'), restEcho: m.autoRest(store.project.tracks[0], 'send.echo') };
      out.label = m.AUTO_PARAMS['send.hall'].label + ' / ' + m.AUTO_PARAMS['send.echo'].label;
      out.format = m.formatAutoValue('send.echo', 0.5);
      out.add = store.addAutoPoint('t1', 'send.hall', 0, 0.2) >= 0;
      out.addMaster = store.addAutoPoint('master', 'send.hall', 0, 0.2);
      out.used = m.busUsed(store.project, 'hall') && !m.busUsed(store.project, 'echo');
      store.clearAutomation('t1', 'send.hall');
      store.setSend('t1', 'hall', 0);
      out.usedAfter = m.busUsed(store.project, 'hall');
      return out;
    });
    check('Modell: autoKeys der Spur enthalten send.hall und send.echo, die Summe nicht', JSON.stringify(md.keys) === '["send.hall","send.echo"]' && md.master.length === 0, JSON.stringify(md));
    check('Modell: Ruhewert = track.sends[bus] (sonst 0), Beschriftung „→ Hall-Bus“, Format „%“', md.rest === 0.4 && md.restEcho === 0 && md.label === '→ Hall-Bus / → Echo-Bus' && md.format === '50 %', JSON.stringify(md));
    check('Modell: Punkt auf der Spur ja, auf der Summe nein; eine Kurve zählt als Send (Bus in Gebrauch)', md.add && md.addMaster === -1 && md.used && md.usedAfter === false, JSON.stringify(md));

    // ---------- UI Desktop: Regler gesperrt, folgen der Kurve, Chip-Einträge ----------
    await page.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const S = window.__sc;
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-sine', 0, 16)]), S.track('t2', {}, [S.clip('c2', 'test-sine', 0, 16)])], { buses: { hall: { volume: 0.8, size: 0.6 } } }));
      store.addAutoPoint('t1', 'send.hall', 0, 0);
      store.addAutoPoint('t1', 'send.hall', 8, 1);
      ui.selectTrack('t1');
      ui.setDock('mixer');
      // Layout „reiter“: Die Spur-Karte öffnet erst der Klick auf die Effekt-Kurzinfo der Zeile
      if (window.loopwerk.side) window.loopwerk.mixer.select('t1');
    });
    await page.waitForSelector('#insp-send-hall');
    await page.waitForTimeout(500);
    const lockState = () => page.evaluate(() => {
      const q = (id) => document.getElementById(id);
      const box = q('insp-send-hall').closest('.insp-send-box');
      const knob = q('send-t1-hall').closest('.strip-send-wrap');
      return {
        insp: { disabled: q('insp-send-hall').disabled, locked: box.classList.contains('auto-locked'), lockBtn: !box.querySelector('.auto-lock').hidden, value: Number(q('insp-send-hall').value), text: q('insp-send-hall').closest('.insp-row').querySelector('output').textContent },
        knob: { disabled: q('send-t1-hall').disabled, locked: knob.classList.contains('auto-locked'), value: Number(q('send-t1-hall').value) },
        echo: { disabled: q('insp-send-echo').disabled },
        t2: { disabled: q('send-t2-hall').disabled },
      };
    });
    let ls = await lockState();
    check('Regler gesperrt: Inspektor und Mixer-Knopf der Spur mit Kurve, „→ Echo-Bus“ und die andere Spur frei',
      ls.insp.disabled && ls.insp.locked && ls.insp.lockBtn && ls.knob.disabled && ls.knob.locked && !ls.echo.disabled && !ls.t2.disabled, JSON.stringify(ls));
    // Beim Abspielen folgen die Regler der Kurve
    await page.evaluate(() => window.loopwerk.engine.play(0));
    await page.waitForTimeout(1500);
    const a1 = await lockState();
    await page.waitForTimeout(1200);
    const a2 = await lockState();
    await page.evaluate(() => window.loopwerk.engine.stop());
    check('Regler folgen der Kurve beim Abspielen (Inspektor, Mixer-Knopf, Anzeige in %)', a2.insp.value > a1.insp.value + 0.1 && a2.knob.value > a1.knob.value + 0.1 && /^\d+ %$/.test(a2.insp.text), JSON.stringify({ a1: a1.insp.value, a2: a2.insp.value, k1: a1.knob.value, k2: a2.knob.value, text: a2.insp.text }));
    // Klick auf die Sperre öffnet die Kurvenzeile mit „→ Hall-Bus“
    await page.click('.insp-send-box .auto-lock:not([hidden])');
    await page.waitForSelector('.auto-row');
    const lane = await page.evaluate(() => ({ key: document.querySelector('.auto-row')?.dataset.key, chip: document.querySelector('.auto-chip')?.textContent }));
    check('Klick auf die Sperre öffnet die Kurvenzeile „→ Hall-Bus“', lane.key === 'send.hall' && lane.chip === '→ Hall-Bus', JSON.stringify(lane));
    await page.click('.auto-chip');
    const items = await page.evaluate(() => [...document.querySelectorAll('.auto-keys .auto-key[data-key]')].map((b) => ({ key: b.dataset.key, text: b.textContent, lit: !!b.querySelector('.auto-dot.on') })));
    check('Chip-Menü: „→ Hall-Bus“ (leuchtet) und „→ Echo-Bus“ stehen in der Liste', items.some((x) => x.key === 'send.hall' && x.lit && x.text === '→ Hall-Bus') && items.some((x) => x.key === 'send.echo' && !x.lit && x.text === '→ Echo-Bus'), JSON.stringify(items));
    await page.click('.auto-key[data-key="send.echo"]');
    await page.waitForTimeout(200);
    // Kurve zeichnen: Klick in die Zeile setzt einen Punkt auf send.echo
    const body = await page.evaluate(() => { const r = document.querySelector('.auto-row .auto-body').getBoundingClientRect(); return { x: r.left + 120, y: r.top + r.height / 2 }; });
    await page.mouse.click(body.x, body.y);
    const drawn = await page.evaluate(() => window.loopwerk.store.project.tracks[0].automation?.['send.echo']);
    check('Kurve zeichnen: Klick in die Zeile setzt einen Punkt auf send.echo', drawn?.length === 1, JSON.stringify(drawn));
    await page.waitForTimeout(300);
    ls = await lockState();
    check('Mit Kurve auf „→ Echo-Bus“ sperrt auch dieser Regler', ls.echo.disabled === true, JSON.stringify(ls.echo));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'send-curve-desktop.png') });
    // Kurven löschen: Regler sind frei
    await page.evaluate(() => { const { store } = window.loopwerk; store.clearAutomation('t1', 'send.hall'); store.clearAutomation('t1', 'send.echo'); });
    await page.waitForTimeout(300);
    ls = await lockState();
    check('Kurve löschen gibt die Regler zurück', !ls.insp.disabled && !ls.knob.disabled && !ls.echo.disabled && !ls.insp.locked, JSON.stringify(ls));
    check('Desktop: keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Desktop-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await app.close();
  }

  // ---------- Handy: Karte „Busse“ mit gesperrtem Regler ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const p = phone.page;
    await p.evaluate(installHelpers);
    await p.evaluate(() => {
      const { store, ui } = window.loopwerk;
      const S = window.__sc;
      store.replace(S.project([S.track('t1', {}, [S.clip('c1', 'test-sine', 0, 16)])]));
      store.addAutoPoint('t1', 'send.hall', 0, 0.2);
      store.addAutoPoint('t1', 'send.hall', 8, 1);
      ui.setDock('mixer');
    });
    await p.waitForSelector('#mixer:not([hidden]) .strip-name');
    await p.tap('#mixer-strips .strip[data-strip-id="t1"] .strip-name');
    await p.waitForSelector('#mixer .fx-bus-card');
    await p.waitForTimeout(500);
    const card = await p.evaluate(() => {
      const c = document.querySelector('#mixer .fx-bus-card');
      c.scrollIntoView({ block: 'center', behavior: 'instant' });
      const box = document.getElementById('fx-send-hall').closest('.fx-param-box');
      return { disabled: document.getElementById('fx-send-hall').disabled, locked: box.classList.contains('auto-locked'), lock: !box.querySelector('.auto-lock').hidden, echoFree: !document.getElementById('fx-send-echo').disabled, value: Number(document.getElementById('fx-send-hall').value) };
    });
    check('Handy: „→ Hall-Bus“ auf der Effekt-Seite ist gesperrt und zeigt den Kurvenwert, „→ Echo-Bus“ frei', card.disabled && card.locked && card.lock && card.echoFree && Math.abs(card.value - 0.2) < 0.05, JSON.stringify(card));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'send-curve-phone.png') });
    const lk = await p.evaluate(() => { const r = document.querySelector('#mixer .fx-bus-card .auto-lock:not([hidden])').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    check('Handy: Sperre ist mindestens 44 px groß', lk.w >= 44 && lk.h >= 44, JSON.stringify(lk));
    await p.tap('#mixer .fx-bus-card .auto-lock:not([hidden])');
    await p.waitForTimeout(500);
    const opened = await p.evaluate(() => ({ dock: window.loopwerk.ui.dock, lane: window.loopwerk.ui.autoLane.isOpen('t1'), key: window.loopwerk.ui.autoLane.lastKeyOf('t1') }));
    check('Handy: Antippen der Sperre schließt den Mixer und öffnet die Kurvenzeile „→ Hall-Bus“', opened.dock == null && opened.lane && opened.key === 'send.hall', JSON.stringify(opened));
    if (SHOTS) await p.screenshot({ path: path.join(SHOT_DIR, 'send-curve-phone-lane.png') });
    check('Handy: keine Konsolenfehler', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (e) {
    check('Handy-Test lief ohne Ausnahme', false, e.stack || e.message);
  } finally {
    await phone.close();
    finish();
  }
})();
