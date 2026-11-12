// Tonart-Erkennung eigener Sounds: synthetische Testsignale → Tonart bzw. keine, automatisch nach dem Anlegen,
// Speichern (IndexedDB, Projektdatei) und Wiederladen, Inspektor- und Handy-Zeile, „Folgt Song“ verschiebt die Tonhöhe.
// node tests/key-detect.test.cjs [--shots]
const { openApp, createChecker, openClipSettings } = require('./harness.cjs');

const { check, finish } = createChecker();
const SHOTS = process.argv.includes('--shots');
const DIR = process.env.SHOT_DIR || '/tmp';

// Läuft im Browser: Testsignale (Töne mit Obertönen, Schlagzeug aus Rauschen mit festem Seed) und Frequenzmessung
function installSignals() {
  const sr = 44100;
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const mulberry32 = (seed) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tones = (events, seconds, harm = 6) => {
    const out = new Float32Array(Math.round(seconds * sr));
    for (const { at, dur, notes } of events) {
      const s0 = Math.round(at * sr), n = Math.round(dur * sr);
      for (const m of notes) for (let h = 1; h <= harm; h++) {
        const w = (2 * Math.PI * hz(m) * h) / sr;
        for (let i = 0; i < n && s0 + i < out.length; i++) out[s0 + i] += (0.12 / h) * Math.min(1, i / 441) * Math.min(1, (n - i) / 2205) * Math.exp((-i / sr) * 1.2) * Math.sin(w * i);
      }
    }
    return out;
  };
  const prog = (chords, per = 1) => chords.map((notes, i) => ({ at: i * per, dur: per, notes }));
  const drums = (seconds, seed = 7) => {
    const rnd = mulberry32(seed);
    const out = new Float32Array(Math.round(seconds * sr));
    for (let b = 0; b * 0.5 < seconds; b++) {
      const t0 = Math.round(b * 0.5 * sr);
      if (b % 2 === 0) { let ph = 0; for (let i = 0; i < 0.3 * sr && t0 + i < out.length; i++) { const t = i / sr; ph += (2 * Math.PI * (50 + 100 * Math.exp(-t * 30))) / sr; out[t0 + i] += 0.8 * Math.exp(-t * 9) * Math.sin(ph); } }
      else for (let i = 0; i < 0.2 * sr && t0 + i < out.length; i++) { const t = i / sr; out[t0 + i] += 0.5 * Math.exp(-t * 18) * (rnd() * 2 - 1) + 0.3 * Math.exp(-t * 25) * Math.sin(2 * Math.PI * 185 * t); }
      for (const off of [0, 0.25]) { const s = t0 + Math.round(off * sr); let prev = 0; for (let i = 0; i < 0.05 * sr && s + i < out.length; i++) { const x = rnd() * 2 - 1; out[s + i] += 0.25 * Math.exp((-i / sr) * 80) * (x - prev); prev = x; } }
    }
    return out;
  };
  const Am = [45, 57, 60, 64], Dm = [50, 57, 62, 65], E = [40, 56, 59, 64];
  const signals = {
    amProg: () => tones(prog([Am, Dm, Am, E, Am, Dm, E, Am]), 8),
    cScale: () => tones([60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => ({ at: i * 0.4, dur: i === 7 ? 1.2 : 0.4, notes: [m] })), 4.4),
    drums: () => drums(4),
    noise: () => { const r = mulberry32(3); return Float32Array.from({ length: sr * 3 }, () => (r() * 2 - 1) * 0.3); },
    tone: () => tones([{ at: 0, dur: 2, notes: [57] }], 2),
    // Kadenz i–iv–V–i bzw. I–IV–V–I in jeder Tonart (Grundton t = 0 … 11 ab C)
    cadence: (t, minor) => {
      const r = 48 + t, q = minor ? 3 : 4;
      return tones(prog([[r - 12, r, r + q, r + 7], [r - 7, r + 5, r + 5 + q, r + 12], [r - 5, r + 7, r + 11, r + 14], [r - 12, r, r + q, r + 7]]), 4);
    },
  };
  const toBuffer = (d) => { const b = new AudioBuffer({ numberOfChannels: 2, length: d.length, sampleRate: sr }); b.copyToChannel(d, 0); b.copyToChannel(d, 1); return b; };
  // Grundfrequenz über Nulldurchgänge (Sinus) im Bereich [a, b) Sekunden
  const freq = (buf, a, b) => {
    const d = buf.getChannelData(0);
    let n = 0, first = -1, last = -1;
    for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) if (d[i - 1] < 0 && d[i] >= 0) { if (first < 0) first = i; last = i; n++; }
    return n > 1 ? ((n - 1) * sr) / (last - first) : 0;
  };
  // Passt der gewählte Text in die geschlossene Auswahl (Innenabstand und Pfeil abgezogen)?
  const fits = (sel) => {
    const g = document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(sel);
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return g.measureText(sel.selectedOptions[0]?.textContent || '').width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 20 <= sel.clientWidth;
  };
  window.__kt = { sr, signals, toBuffer, freq, fits };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installSignals);

    // ---------- 1: Erkennung (Rechen-Worker) ----------
    const det = await page.evaluate(async () => {
      const { runJob } = await import('/src/dsp/run.js');
      const { signals, sr } = window.__kt;
      const run = async (d) => runJob('key', { chs: [d], sampleRate: sr });
      const out = {};
      for (const k of ['amProg', 'cScale', 'drums', 'noise', 'tone']) { const r = await run(signals[k]()); out[k] = { key: r.key, conf: r.confidence, ton: +r.tonality.toFixed(2), r: +r.r.toFixed(3), m: +r.margin.toFixed(3) }; }
      const KEYS = ['Cm', 'C♯m', 'Dm', 'E♭m', 'Em', 'Fm', 'F♯m', 'Gm', 'G♯m', 'Am', 'B♭m', 'Hm'];
      const MAJ = ['E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'H', 'C', 'D♭', 'D'];
      const miss = [];
      for (let t = 0; t < 12; t++) {
        const mi = (await run(signals.cadence(t, true))).key;
        const ma = (await run(signals.cadence(t, false))).key;
        if (mi !== KEYS[t]) miss.push(`${KEYS[t]}→${mi}`);
        if (ma !== MAJ[(t + 9) % 12]) miss.push(`${MAJ[(t + 9) % 12]}→${ma}`);
      }
      out.cadences = { hits: 24 - miss.length, miss };
      return out;
    });
    check('A-Moll-Akkordfolge (i–iv–i–V) → A-Moll', det.amProg.key === 'Am' && det.amProg.conf >= 0.5, JSON.stringify(det.amProg));
    check('C-Dur-Tonleiter → C-Dur', det.cScale.key === 'C' && det.cScale.conf >= 0.5, JSON.stringify(det.cScale));
    check('Schlagzeug (Bassdrum, Snare, Hi-Hat) → keine Tonart', det.drums.key === null, JSON.stringify(det.drums));
    check('Weißes Rauschen → keine Tonart', det.noise.key === null, JSON.stringify(det.noise));
    check('Einzelner Ton (A mit Obertönen) → keine Tonart (nicht raten)', det.tone.key === null, JSON.stringify(det.tone));
    check('Kadenzen in allen 24 Tonarten erkannt', det.cadences.hits === 24, `${det.cadences.hits}/24 ${det.cadences.miss.join(', ')}`);

    // ---------- 2: automatisch nach dem Anlegen, gespeichert ----------
    const auto = await page.evaluate(async () => {
      const { own, library } = window.loopwerk;
      const { signals, toBuffer } = window.__kt;
      const a = await own.create({ name: 'Akkorde', buffer: toBuffer(signals.amProg()), id: 'own-kt-am' });
      const pendingRight = !a.keyDone; // Anlegen wartet nicht auf die Erkennung
      const d = await own.create({ name: 'Trommeln', buffer: toBuffer(signals.drums()), id: 'own-kt-dr' });
      await own.keysReady();
      const rec = await own.tx('readonly', (s) => s.get('own-kt-am'));
      const recD = await own.tx('readonly', (s) => s.get('own-kt-dr'));
      return { pendingRight, am: { key: a.keyAuto, done: a.keyDone, eff: library.get('own-kt-am').key }, dr: { key: d.keyAuto, done: d.keyDone }, rec: { key: rec.key, done: rec.keyDone }, recD: { key: recD.key, done: recD.keyDone } };
    });
    check('Anlegen kehrt sofort zurück, Erkennung läuft im Hintergrund', auto.pendingRight, JSON.stringify(auto));
    check('Eigener Sound „Akkorde“: A-Moll erkannt und im Sound vermerkt', auto.am.key === 'Am' && auto.am.done && auto.am.eff === 'Am', JSON.stringify(auto.am));
    check('Eigener Sound „Trommeln“: keine Tonart, Erkennung gelaufen', auto.dr.key === null && auto.dr.done, JSON.stringify(auto.dr));
    check('IndexedDB: Tonart im Datensatz gespeichert', auto.rec.key === 'Am' && auto.rec.done && auto.recD.key === null && auto.recD.done, JSON.stringify([auto.rec, auto.recD]));
    const tip = await page.evaluate(() => document.querySelector('.loop-item[data-id="own-kt-am"], [data-sample-id="own-kt-am"]')?.title ?? null);
    if (tip != null) check('Regal: Tonart im Hinweis der Zeile (wie Katalog-Sounds)', /Tonart Am/.test(tip), tip);

    // ---------- 3: Inspektor ----------
    const ktClip = await page.evaluate(() => {
      const { store } = window.loopwerk;
      store.setKey('Am');
      return store.addClip(store.project.tracks[0].id, 'own-kt-am', 64, 16);
    });
    await openClipSettings(page, ktClip); // Clip-Einstellungen (Tonart des Sounds) stehen im Clip-Editor
    const row = () => page.evaluate(() => {
      const r = document.getElementById('insp-skey');
      const sel = document.getElementById('insp-skey-sel');
      const f = document.getElementById('insp-skey-follow');
      const fits = window.__kt.fits(sel);
      return {
        shown: !!r && !r.hidden && r.getBoundingClientRect().height > 0, value: sel?.value, text: sel?.selectedOptions[0]?.textContent, fits,
        said: document.getElementById('insp-skey-state')?.textContent, listed: sel?.querySelector('option[value="Am"]')?.textContent,
        state: r?.dataset.state, follow: f && !f.hidden ? f.getAttribute('aria-pressed') : null, map: window.loopwerk.store.project.soundKeys || null, eff: window.loopwerk.library.get('own-kt-am').key,
      };
    });
    let r0 = await row();
    check('Inspektor: Zeile „Tonart · erkannt · A-Moll“ beim Clip eines eigenen Sounds, Text passt in die Auswahl', r0.shown && r0.value === 'Am' && r0.text === 'A-Moll' && r0.fits && r0.said === 'erkannt' && r0.state === 'auto' && r0.follow === 'false', JSON.stringify(r0));
    if (SHOTS) await page.locator('#insp').screenshot({ path: `${DIR}/key-detect-insp.png` });
    await page.selectOption('#insp-skey-sel', 'Em');
    await page.waitForTimeout(100);
    let r1 = await row();
    check('Ändern: E-Moll gewählt, im Projekt gespeichert, Sound hat E-Moll', r1.value === 'Em' && r1.state === 'set' && r1.map?.['own-kt-am']?.key === 'Em' && r1.eff === 'Em' && r1.said === '', JSON.stringify(r1));
    check('Liste nennt die erkannte Tonart, solange eine andere gewählt ist', r1.listed === 'A-Moll (erkannt)', r1.listed);
    await page.selectOption('#insp-skey-sel', '');
    await page.waitForTimeout(100);
    r1 = await row();
    check('Entfernen: „keine“, ohne „Folgt Song“', r1.value === '' && r1.map?.['own-kt-am']?.key === null && r1.eff === null && r1.follow === null, JSON.stringify(r1));
    await page.evaluate(() => { window.loopwerk.store.undo(); window.loopwerk.store.undo(); });
    await page.waitForTimeout(100);
    r1 = await row();
    check('Rückgängig: wieder wie erkannt', r1.value === 'Am' && r1.state === 'auto' && !r1.map, JSON.stringify(r1));
    const catRow = await page.evaluate(async () => {
      const { library, store, ui } = window.loopwerk;
      const s = library.list().find((x) => x.def && x.key);
      ui.select(store.addClip(store.project.tracks[1].id, s.id, 64, 4));
      await new Promise((r) => setTimeout(r, 150));
      return document.getElementById('insp-skey').hidden;
    });
    check('Katalog-Loop: keine Tonart-Zeile (folgt ohnehin dem Song)', catRow === true);

    // ---------- 4: „Folgt Song“ verschiebt die Tonhöhe (Offline-Rendering) ----------
    // Sinus 440 Hz als 4-Schlag-Loop, Tonart von Hand A-Moll (ein Ton allein hat keine erkannte Tonart)
    const sineId = await page.evaluate(async () => {
      const { own, store, ui } = window.loopwerk;
      const { sr } = window.__kt;
      const d = Float32Array.from({ length: 2 * sr }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
      const b = new AudioBuffer({ numberOfChannels: 1, length: d.length, sampleRate: sr });
      b.copyToChannel(d, 0);
      const s = await own.create({ name: 'Sinus A', buffer: b, kind: 'loop', beats: 4, id: 'own-kt-sine' });
      await own.keysReady();
      store.setBpm(120);
      ui.select(store.addClip(store.project.tracks[2].id, s.id, 0, 16));
      return s.id;
    });
    await page.waitForTimeout(200);
    const sineRow = await page.evaluate(() => ({ value: document.getElementById('insp-skey-sel').value, follow: document.getElementById('insp-skey-follow').hidden }));
    check('Sinus allein: keine erkannte Tonart, „Folgt Song“ verborgen', sineRow.value === '' && sineRow.follow === true, JSON.stringify(sineRow));
    await page.selectOption('#insp-skey-sel', 'Am');
    await page.click('#insp-skey-follow');
    const measure = (opts) => page.evaluate(async ({ sid, key, changeAt, follow }) => {
      const { store, library, renderProject } = window.loopwerk;
      const { freq } = window.__kt;
      if (key) store.setKey(key);
      if (changeAt) store.setKeyAt(changeAt.bar, changeAt.key);
      await new Promise((r) => setTimeout(r, 50));
      const { keySemis, keyOf } = await import('/src/model.js');
      const want = keySemis(keyOf(store.project));
      const t0 = performance.now();
      while (library.semis !== want || window.loopwerk.tempo.busy) { if (performance.now() - t0 > 60000) break; await new Promise((r) => setTimeout(r, 50)); }
      const s = library.get(sid);
      while (s.keyFollow !== follow && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
      // nur die Sinus-Spur
      const p = JSON.parse(JSON.stringify(store.project));
      p.tracks = p.tracks.filter((t) => t.clips.some((c) => c.sampleId === sid))
        .map((t) => ({ ...t, clips: t.clips.filter((c) => c.sampleId === sid), fx: null, automation: null, volume: 1, pan: 0, mute: false, solo: false }));
      await library.ensureProject(p);
      const buf = await renderProject(p, library, { limiter: false, mastering: false, toBeat: 16 });
      return { a: +freq(buf, 0.2, 1.8).toFixed(2), b: +freq(buf, 4.2, 5.8).toFixed(2), len: s.buffer.length, follow: s.keyFollow, key: s.key };
    }, { sid: sineId, follow: true, ...opts });
    const near = (v, f) => Math.abs(v - f) < 1;
    let m = await measure({});
    check('Folgt Song, Song A-Moll: Tonhöhe bleibt 440 Hz', m.follow && near(m.a, 440) && m.len === 88200, JSON.stringify(m));
    m = await measure({ key: 'Cm' });
    check('Song C-Moll: Sound klingt 3 Halbtöne höher (523,25 Hz), Länge gleich', near(m.a, 523.25) && near(m.b, 523.25) && m.len === 88200, JSON.stringify(m));
    m = await measure({ changeAt: { bar: 2, key: 'Dm' } });
    check('Tonart je Takt: ab Takt 2 D-Moll → 587,33 Hz, davor 523,25 Hz', near(m.a, 523.25) && near(m.b, 587.33), JSON.stringify(m));
    await page.evaluate(() => window.loopwerk.store.clearKeyAt(2));
    // Dur-Sound folgt über die parallele Moll-Tonart: C-Dur in E-Moll (= G-Dur) → 5 Halbtöne tiefer
    await page.selectOption('#insp-skey-sel', 'C');
    m = await measure({ key: 'Em' });
    check('Sound in C-Dur, Song E-Moll: 5 Halbtöne tiefer (329,63 Hz)', m.key === 'C' && near(m.a, 329.63), JSON.stringify(m));
    await page.click('#insp-skey-follow');
    m = await measure({ follow: false });
    check('„Folgt Song“ aus: wieder Originaltonhöhe 440 Hz', !m.follow && near(m.a, 440), JSON.stringify(m));
    const fx = await page.evaluate(() => ({ pressed: document.getElementById('insp-skey-follow').getAttribute('aria-pressed'), map: window.loopwerk.store.project.soundKeys }));
    check('Schalter zeigt den Zustand, Projekt merkt Tonart ohne „folgt“', fx.pressed === 'false' && fx.map['own-kt-sine'].key === 'C' && !fx.map['own-kt-sine'].follow, JSON.stringify(fx));
    await page.click('#insp-skey-follow');

    // ---------- 5: Projektdatei und Neuladen ----------
    const file = await page.evaluate(async () => {
      const { own, library, store } = window.loopwerk;
      const list = await own.embed(store.project);
      const e = list.find((x) => x.id === 'own-kt-am');
      // Sound im Browser „verloren“: aus der Projektdatei zurückholen, ohne neu zu erkennen
      await own.remove('own-kt-am');
      await own.restore(list);
      const s = library.get('own-kt-am');
      return { e: { key: e?.key, done: e?.keyDone }, back: { key: s?.keyAuto, done: s?.keyDone, jobs: own.keyJobs.size } };
    });
    check('Projektdatei: erkannte Tonart eingebettet und wiederhergestellt (ohne neue Erkennung)', file.e.key === 'Am' && file.e.done && file.back.key === 'Am' && file.back.done && file.back.jobs === 0, JSON.stringify(file));
    await page.waitForTimeout(600); // Autosave (300 ms)
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    await page.evaluate(installSignals);
    const back = await page.evaluate(async () => {
      const { library, store } = window.loopwerk;
      await library.ensure('own-kt-sine');
      const t0 = performance.now();
      while (library.semis !== -5 && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
      await library.ensureProject(store.project);
      const am = library.get('own-kt-am'), si = library.get('own-kt-sine');
      return { am: { key: am?.key, auto: am?.keyAuto, done: am?.keyDone }, sine: { key: si?.key, follow: si?.keyFollow }, map: store.project.soundKeys, f: +window.__kt.freq(si.buffer, 0.2, 1.8).toFixed(2) };
    });
    check('Neuladen: erkannte Tonart aus IndexedDB, Projekt-Einstellung bleibt', back.am.key === 'Am' && back.am.done && back.sine.key === 'C' && back.sine.follow && back.map?.['own-kt-sine']?.follow === true, JSON.stringify(back));
    check('Neuladen: folgender Sound ist sofort umgestimmt (329,63 Hz in E-Moll)', near(back.f, 329.63), String(back.f));
    check('Keine Fehler in der Konsole (Desktop)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
  }

  // ---------- 6: Handy – gleiche Zeile in der Clip-Leiste ----------
  const phone = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const { page } = phone;
    await page.evaluate(installSignals);
    await page.evaluate(async () => {
      const { own, store, ui } = window.loopwerk;
      const { signals, toBuffer } = window.__kt;
      await own.create({ name: 'Akkorde', buffer: toBuffer(signals.amProg()), id: 'own-kt-ph' });
      await own.keysReady();
      ui.select(store.addClip(store.project.tracks[0].id, 'own-kt-ph', 64, 16));
    });
    await page.waitForTimeout(300);
    await page.click('#cb-levels');
    await page.waitForTimeout(200);
    const ph = await page.evaluate(() => {
      const r = document.getElementById('lvl-skey');
      const sel = document.getElementById('lvl-skey-sel');
      const f = document.getElementById('lvl-skey-follow');
      const box = (n) => { const b = n.getBoundingClientRect(); return { h: Math.round(b.height), right: Math.round(b.right) }; };
      return { shown: !!r && !r.hidden && r.getBoundingClientRect().height > 0, text: sel.selectedOptions[0]?.textContent, fits: window.__kt.fits(sel), said: document.getElementById('lvl-skey-state').textContent, sel: box(sel), follow: box(f) };
    });
    check('Handy: Clip-Leiste zeigt „Tonart · erkannt · A-Moll“ und „Folgt Song“ (≥ 44 px, im Bild, Text passt)', ph.shown && ph.text === 'A-Moll' && ph.fits && ph.said === 'erkannt' && ph.sel.h >= 44 && ph.follow.h >= 44 && ph.follow.right <= 390, JSON.stringify(ph));
    if (SHOTS) await page.screenshot({ path: `${DIR}/key-detect-handy.png` });
    await page.click('#lvl-skey-follow');
    await page.waitForTimeout(100);
    const on = await page.evaluate(() => ({ pressed: document.getElementById('lvl-skey-follow').getAttribute('aria-pressed'), map: window.loopwerk.store.project.soundKeys }));
    check('Handy: ein Tipp auf „Folgt Song“ schaltet ein', on.pressed === 'true' && on.map?.['own-kt-ph']?.follow === true, JSON.stringify(on));
    check('Keine Fehler in der Konsole (Handy)', phone.errors.length === 0, phone.errors.join(' | '));
  } catch (e) {
    check('Handy: Ablauf ohne Ausnahme', false, e.stack);
  } finally {
    await phone.close();
    finish();
  }
})();
