// Version 1.5: Import sichtbar, Einsingen (Mikrofon/Datei), Lead-Melodie aus Songs, Autotune,
// Stimme entfernen/isolieren, Song in Ebenen zerlegen, neue Instrumente.
// node tests/v15.test.cjs [--shots]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, createChecker, clickR, selectR, fillR, createCard, reveal } = require('./harness.cjs');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';
const { check, finish } = createChecker();

const SR = 44100;
// Gesangsähnliches Signal: Obertöne, Vibrato, Einschwingen; mel = [[midi, Sekunden], …], Pausen mit midi = null
function voice(mel, { detune = [], gap = 0.04, amp = 0.3 } = {}) {
  const total = mel.reduce((a, [, d]) => a + d, 0);
  const n = Math.round(SR * total);
  const x = new Float32Array(n);
  let ph = 0;
  let t0 = 0;
  mel.forEach(([m, d], k) => {
    const a = Math.round(t0 * SR);
    const b = Math.round((t0 + d) * SR);
    for (let i = a; i < b && i < n; i++) {
      const w = (i - a) / SR;
      if (m == null) continue;
      const f = 440 * 2 ** ((m + (detune[k] || 0) / 100 - 69) / 12) * 2 ** ((0.15 / 12) * Math.sin(2 * Math.PI * 5.2 * (i / SR)));
      ph += (2 * Math.PI * f) / SR;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(h * ph) / (h * 1.2);
      x[i] = amp * v * Math.min(1, w / 0.02) * Math.min(1, Math.max(0, (d - gap - w) / 0.02));
    }
    t0 += d;
  });
  return x;
}

function wav(chs) {
  const n = chs[0].length;
  const c = chs.length;
  const buf = Buffer.alloc(44 + n * 2 * c);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2 * c, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(c, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2 * c, 28); buf.writeUInt16LE(2 * c, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2 * c, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chs[k][i])) * 32767), 44 + (i * c + k) * 2);
  return buf;
}

// Song-Mix: Gesang in der Mitte, Drums, Bass, breite Fläche (links/rechts verschieden)
function songMix(melody) {
  const v = voice(melody, { amp: 0.25 });
  const n = v.length;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bt = t % 0.5;
    const d = 0.5 * rnd() * Math.exp(-bt * 40) + 0.7 * Math.sin(2 * Math.PI * 55 * bt) * Math.exp(-bt * 12);
    const b = 0.25 * Math.sin(2 * Math.PI * 55 * t);
    L[i] = v[i] + d + b + 0.1 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t));
    R[i] = v[i] + d + b + 0.1 * (Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 261.6 * t));
  }
  return { L, R, v };
}

const MEL = [57, 60, 64, 67, 69, 67, 64, 60];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw15-'));
  // Datei für das simulierte Mikrofon: 1 s Stille (Vorzähler), dann die Melodie in Vierteln bei 120 BPM
  const micFile = path.join(tmp, 'mic.wav');
  const micVoice = voice([[null, 2], ...MEL.map((m) => [m, 0.5]), [null, 3]]);
  fs.writeFileSync(micFile, wav([micVoice]));

  let app = await openApp({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${micFile}%noloop`] });
  let { page } = app;
  try {
    // ---------- Import: neuer Sound wird sichtbar ----------
    await page.evaluate(() => { const b = document.querySelector('#shelf-cat-own'); if (b?.getAttribute('aria-expanded') === 'true') b.click(); });
    await page.setInputFiles('#import-input', { name: 'Mein Lied.wav', mimeType: 'audio/wav', buffer: wav([voice([[60, 1]])]) });
    await page.waitForFunction(() => window.loopwerk.library.list().some((s) => s.name === 'Mein Lied'), null, { timeout: 10000 });
    await page.waitForTimeout(100);
    const shown = await page.evaluate(() => {
      const s = window.loopwerk.library.list().find((x) => x.name === 'Mein Lied');
      const item = document.querySelector(`#library .loop-item[data-sample-id="${s.id}"]`);
      const r = item?.getBoundingClientRect();
      const list = document.getElementById('library').getBoundingClientRect();
      return { open: document.querySelector('#shelf-cat-own')?.getAttribute('aria-expanded'), visible: !!r && r.height > 0 && r.top >= list.top - 1 && r.bottom <= list.bottom + 1, fresh: item?.closest('.loop-row').classList.contains('fresh'), armed: window.loopwerk.ui.armedSampleId === s.id };
    });
    check('Importierter Sound: Gruppe „Eigene“ offen, Eintrag sichtbar und markiert', shown.open === 'true' && shown.visible && shown.fresh && shown.armed, JSON.stringify(shown));
    await page.keyboard.press('Escape');
    await page.setInputFiles('#import-input', { name: 'kaputt.m4a', mimeType: 'audio/mp4', buffer: Buffer.from('das ist kein audio') });
    await page.waitForFunction(() => /kann dieser Browser nicht lesen/.test(document.getElementById('hint-text').textContent), null, { timeout: 5000 }).catch(() => {});
    const msg = await page.locator('#hint-text').textContent();
    check('Unlesbare Datei: verständliche Meldung mit Dateityp', /kaputt\.m4a.*audio\/mp4.*kann dieser Browser nicht lesen/.test(msg), msg);

    // ---------- Neue Instrumente ----------
    const inst = await page.evaluate(async () => {
      const m = await import('./src/instruments.js');
      const out = {};
      for (const p of m.SYNTH_PRESETS) {
        const pat = { type: 'synth', bars: 1, preset: p.id, notes: [{ pitch: 60, start: 0, len: 1, vel: 1 }, { pitch: 67, start: 2, len: 1, vel: 1 }] };
        const r = await m.renderPattern(pat, 120, window.loopwerk.library);
        let peak = 0;
        for (const v of r.buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
        out[p.id] = +peak.toFixed(2);
      }
      return out;
    });
    check('Elf Klänge für Melodien, alle hörbar', Object.keys(inst).length === 11 && Object.values(inst).every((p) => p > 0.05 && p < 1.2), JSON.stringify(inst));

    // ---------- Einsingen per Datei ----------
    await page.evaluate(async () => { const mm = await import('./src/model.js'); window.loopwerk.store.replace(mm.createEmptyProject()); });
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await page.click('#pat-sing-btn');
    check('„Einsingen“ öffnet das Feld', await page.locator('#pat-sing').isVisible());
    const melFile = wav([voice([[null, 0.4], ...MEL.map((m) => [m, 0.5])])]);
    await page.setInputFiles('#sing-input', { name: 'gesummt.wav', mimeType: 'audio/wav', buffer: melFile });
    await page.waitForFunction(() => /Töne erkannt|Keine klaren/.test(document.getElementById('sing-status').textContent), null, { timeout: 20000 });
    let pat = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth'));
    check('Gesungene Melodie wird zu Noten (Ton, Einsatz, Länge)', JSON.stringify(pat.notes.map((n) => [n.pitch, n.start, n.len])) === JSON.stringify(MEL.map((m, i) => [m, i, 1])), JSON.stringify(pat.notes.map((n) => [n.pitch, n.start, n.len])));
    check('Pattern bekommt die passende Länge', pat.bars === 2, String(pat.bars));
    const status = await page.locator('#sing-status').textContent();
    check('Rückmeldung nennt die Zahl der Töne', status.startsWith('8 Töne erkannt'), status);
    await page.selectOption('#pat-preset', 'flute');
    check('Klang danach frei wählbar', await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth').preset) === 'flute');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    pat = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth'));
    check('Rückgängig nimmt das Einsingen zurück', pat.notes.length === 0, String(pat.notes.length));

    // Tonart-Sperre: schief gesungene Töne landen in der Tonleiter
    await page.selectOption('#sing-key', '0:major');
    await page.setInputFiles('#sing-input', { name: 'schief.wav', mimeType: 'audio/wav', buffer: wav([voice([[61, 0.5], [63, 0.5], [66, 0.5], [68, 0.5]])]) });
    await page.waitForFunction(() => /Töne erkannt/.test(document.getElementById('sing-status').textContent), null, { timeout: 20000 });
    pat = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth'));
    const inC = pat.notes.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12));
    check('Mit Tonart C-Dur liegen alle Töne in der Tonleiter', inC && pat.notes.length === 4, JSON.stringify(pat.notes.map((n) => n.pitch)));
    await page.selectOption('#sing-key', '');

    // Lead-Melodie aus einem Song mit Begleitung
    const LEAD = [64, 67, 69, 72, 69, 67, 64, 62];
    const song = songMix(LEAD.map((m) => [m, 0.5]));
    await page.check('#sing-lead');
    await page.setInputFiles('#sing-input', { name: 'song.wav', mimeType: 'audio/wav', buffer: wav([song.L, song.R]) });
    await page.waitForFunction(() => /Töne erkannt|Keine klaren/.test(document.getElementById('sing-status').textContent), null, { timeout: 60000 });
    pat = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth'));
    const leadPitches = pat.notes.map((n) => n.pitch % 12);
    const want = LEAD.map((m) => m % 12);
    const hits = want.filter((p, i) => leadPitches[i] === p).length;
    check('Lead-Melodie aus einem Song mit Drums, Bass und Fläche (Tonklassen)', hits >= 7, `${hits}/8: ${JSON.stringify(pat.notes.map((n) => [n.pitch, n.start]))}`);
    await page.uncheck('#sing-lead');

    // ---------- Einsingen über das Mikrofon (simuliert) ----------
    await clickR(page, '#pat-clear');
    await page.click('#sing-rec');
    await page.waitForFunction(() => document.getElementById('sing-rec').textContent.includes('Fertig'), null, { timeout: 5000 });
    await page.waitForTimeout(6500);
    await page.click('#sing-rec');
    await page.waitForFunction(() => /Töne erkannt|Keine klaren|leer|kurz/.test(document.getElementById('sing-status').textContent), null, { timeout: 20000 });
    pat = await page.evaluate(() => Object.values(window.loopwerk.store.project.patterns).find((p) => p.type === 'synth'));
    const micPitches = pat.notes.map((n) => n.pitch);
    const inOrder = MEL.every((m, i) => micPitches[i] === m);
    check('Mikrofon: eingesungene Melodie wird erkannt', inOrder, `${await page.locator('#sing-status').textContent()} ${JSON.stringify(pat.notes.map((n) => [n.pitch, n.start]))}`);
    // Wann das simulierte Mikrofon die Datei startet, ist zufällig; geprüft wird das Raster ab dem zweiten Ton
    const steps = pat.notes.slice(2, MEL.length).map((n, i) => n.start - pat.notes[i + 1].start);
    // Liegt der zufällige Versatz genau zwischen zwei 1/16, darf ein Ton um ein Raster kippen
    const spanOk = Math.abs(steps.reduce((a, b) => a + b, 0) - steps.length) <= 0.25;
    check('Mikrofon: Abstände im Takt (je ein Schlag, ± ein 1/16)', steps.length === MEL.length - 2 && steps.every((d) => Math.abs(d - 1) <= 0.25) && spanOk, JSON.stringify(steps));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-einsingen.png') });
    await page.evaluate(() => window.loopwerk.ui.setDock(null));

    // ---------- Sample-Editor: Autotune ----------
    const detuned = await page.evaluate(async ({ samples }) => {
      const { library, store, editor } = window.loopwerk;
      const b = new AudioBuffer({ numberOfChannels: 2, length: samples.length, sampleRate: 44100 });
      b.copyToChannel(Float32Array.from(samples), 0);
      b.copyToChannel(Float32Array.from(samples), 1);
      library.register({ id: 'own-test-voice', name: 'Schiefer Gesang', category: 'own', kind: 'oneshot', lengthBeats: Math.ceil(b.duration * 2), bpm: 120, buffer: b, orig: b });
      const clipId = store.addClip('t3', 'own-test-voice', 0, Math.ceil(b.duration * 2));
      editor.open(clipId);
      return clipId;
    }, { samples: Array.from(voice([[57, 0.6], [60, 0.6], [64, 0.6], [67, 0.6]], { detune: [-40, 35, -30, 45] })) });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    await selectR(page, '#ed-at-root', '9');
    await selectR(page, '#ed-at-scale', 'minor');
    await clickR(page, '#ed-autotune');
    await page.waitForFunction(() => document.getElementById('ed-busy').hidden && window.loopwerk.editor.state.history.length === 1, null, { timeout: 20000 });
    const cents = await page.evaluate(async () => {
      const { detectPitch, voicing, midiOf } = await import('./src/dsp/pitch.js');
      const st = window.loopwerk.editor.state;
      const tr = detectPitch(st.chs[0], st.sr);
      const v = voicing(tr);
      return [57, 60, 64, 67].map((m, k) => {
        const vals = [];
        for (let i = 0; i < tr.f0.length; i++) if (v[i] && tr.times[i] > k * 0.6 + 0.15 && tr.times[i] < (k + 1) * 0.6 - 0.15) vals.push((midiOf(tr.f0[i]) - m) * 100);
        vals.sort((a, b) => a - b);
        return Math.round(vals[vals.length >> 1]);
      });
    });
    check('Autotune zieht schiefe Töne (bis 45 Cent) auf ±15 Cent', cents.every((c) => Math.abs(c) <= 15), JSON.stringify(cents));
    await page.click('#ed-undo');
    await page.click('#ed-cancel');

    // ---------- Stimme entfernen / isolieren / Ebenen ----------
    const SONG = [64, 67, 69, 72, 69, 67, 64, 62];
    const mix = songMix(SONG.map((m) => [m, 0.5]));
    const prep = await page.evaluate(async ({ L, R, v }) => {
      const { library, store, editor } = window.loopwerk;
      const n = L.length;
      const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: 44100 });
      b.copyToChannel(Float32Array.from(L), 0);
      b.copyToChannel(Float32Array.from(R), 1);
      library.register({ id: 'own-test-song', name: 'Testsong', category: 'own', kind: 'loop', beats: 8, lengthBeats: 8, bpm: 120, buffer: b, orig: b });
      window.__voice = Float32Array.from(v);
      window.__mixL = Float32Array.from(L);
      const clipId = store.addClip('t4', 'own-test-song', 4, 8);
      editor.open(clipId);
      return clipId;
    }, { L: Array.from(mix.L), R: Array.from(mix.R), v: Array.from(mix.v) });
    await page.waitForFunction(() => window.loopwerk.ui.dock === 'editor');
    const corr = () => page.evaluate(() => {
      const a = window.loopwerk.editor.state.chs[0];
      const v = window.__voice;
      let ab = 0, aa = 0, bb = 0;
      for (let i = 4096; i < v.length - 4096; i++) { ab += a[i] * v[i]; aa += a[i] * a[i]; bb += v[i] * v[i]; }
      return ab / Math.sqrt(aa * bb);
    });
    const before = await corr();
    await clickR(page, '#ed-novocal');
    await page.waitForFunction(() => document.getElementById('ed-busy').hidden && window.loopwerk.editor.state.history.length === 1, null, { timeout: 60000 });
    const without = await corr();
    check('Stimme entfernen: Gesang fast verschwunden', before > 0.4 && Math.abs(without) < 0.1, `Korrelation mit dem Gesang ${before.toFixed(2)} → ${without.toFixed(2)}`);
    await page.click('#ed-undo');
    await clickR(page, '#ed-vocal');
    await page.waitForFunction(() => document.getElementById('ed-busy').hidden && window.loopwerk.editor.state.history.length === 1, null, { timeout: 60000 });
    const only = await corr();
    check('Stimme isolieren: fast nur noch Gesang', only > 0.9, only.toFixed(3));
    await page.click('#ed-undo');
    await clickR(page, '#ed-stems');
    await page.waitForFunction(() => window.loopwerk.ui.dock !== 'editor', null, { timeout: 60000 });
    const stems = await page.evaluate((clipId) => {
      const { store, library } = window.loopwerk;
      const tracks = store.project.tracks;
      const i = tracks.findIndex((t) => t.id === 't4');
      const made = tracks.slice(i + 1, i + 5);
      const sum = new Float32Array(window.__mixL.length);
      for (const t of made) {
        const s = library.get(t.clips[0].sampleId);
        const d = s.orig.getChannelData(0);
        for (let k = 0; k < sum.length; k++) sum[k] += d[k];
      }
      let err = 0;
      for (let k = 4096; k < sum.length - 4096; k++) err = Math.max(err, Math.abs(sum[k] - window.__mixL[k]));
      return {
        names: made.map((t) => t.name), starts: made.map((t) => t.clips[0].startBeat), lens: made.map((t) => t.clips[0].lengthBeats),
        originalGone: !store.findClip(clipId), err, n: tracks.length,
      };
    }, prep);
    check('In Ebenen zerlegen: vier Spuren Gesang, Drums, Bass, Instrumente', JSON.stringify(stems.names) === '["Gesang","Drums","Bass","Instrumente"]' && stems.n === 12, JSON.stringify(stems));
    check('Ebenen liegen genau dort, wo der Song lag', stems.starts.every((s) => s === 4) && stems.lens.every((l) => l === 8) && stems.originalGone, JSON.stringify(stems));
    check('Ebenen ergeben zusammen wieder den Song', stems.err < 0.002, stems.err.toExponential(2));
    await page.keyboard.press('Control+z');
    check('Rückgängig holt den Song zurück', await page.evaluate((id) => !!window.loopwerk.store.findClip(id) && window.loopwerk.store.project.tracks.length === 8, prep));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-editor.png') });

    // ---------- Weiterführen und Klang bauen (ohne Claude: Regeln) ----------
    await page.evaluate(async () => { const mm = await import('./src/model.js'); window.loopwerk.store.replace(mm.createEmptyProject()); });
    const oldPat = await page.evaluate(() => window.loopwerk.patternEditor.id);
    await createCard(page, 'melody');
    // Auf das neue Pattern warten – der Titel stimmt schon vom vorigen Melodie-Editor
    await page.waitForFunction((o) => window.loopwerk.patternEditor.id !== o && document.getElementById('pat-title').textContent === 'Melodie-Editor', oldPat);
    const START = [[69, 0, 1], [72, 1, 1], [76, 2, 1], [74, 3, 1], [72, 4, 2], [71, 6, 2]];
    const setNotes = (list) => page.evaluate((l) => {
      const { store, patternEditor } = window.loopwerk;
      store.updatePattern(patternEditor.id, (p) => { p.notes = l.map(([pitch, start, len]) => ({ pitch, start, len, vel: 1 })); p.bars = 2; });
    }, list);
    await setNotes(START);
    await page.waitForTimeout(600); // Schublade fährt herein
    const synth = () => page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id]);
    await page.click('#pat-continue');
    await page.waitForFunction(() => !document.getElementById('pat-continue').hasAttribute('aria-busy'));
    let sp = await synth();
    const added = sp.notes.filter((n) => n.start >= 8);
    const last = added[added.length - 1];
    check('Weiterführen (Regeln): gleich lange Fortsetzung ab Takt 3', sp.bars === 4 && added.length >= 4 && added.every((n) => n.start < 16) && sp.notes.length === START.length + added.length, JSON.stringify(added.map((n) => [n.pitch, n.start, n.len])));
    check('Fortsetzung endet auf dem Grundton (A) und bleibt in A-Moll', last.pitch % 12 === 9 && last.start + last.len === 16 && added.every((n) => [9, 11, 0, 2, 4, 5, 7].includes(n.pitch % 12)), JSON.stringify(last));
    const flashC = await page.locator('#hint-text').textContent();
    check('Meldung nennt Tonart und Herkunft', /A-Moll/.test(flashC) && /Regeln/.test(flashC), flashC);
    const firstIdea = JSON.stringify(added);
    await page.click('#pat-continue');
    await page.waitForFunction(() => !document.getElementById('pat-continue').hasAttribute('aria-busy'));
    sp = await synth();
    check('Nochmal klicken ersetzt die Fortsetzung (statt weiter anzuhängen)', sp.notes.filter((n) => n.start >= 8).length > 0 && sp.notes.every((n) => n.start < 16) && sp.bars === 4, `${sp.notes.length} Noten; vorher ${firstIdea}`);
    const openSing = async () => { if (await page.locator('#pat-sing').isHidden()) await page.click('#pat-sing-btn'); };
    await openSing();
    await page.fill('#sing-desc', 'weiche Flöte mit viel Hall');
    await page.click('#sing-sound');
    await page.waitForFunction(() => /Klang:/.test(document.getElementById('sing-status').textContent));
    let snd = await page.evaluate(() => {
      const { store, patternEditor } = window.loopwerk;
      const p = store.project.patterns[patternEditor.id];
      const t = store.project.tracks.find((x) => x.clips.some((c) => c.sampleId === 'pat-' + patternEditor.id));
      return { preset: p.preset, hall: t.fx?.hall, filter: t.fx?.filter, status: document.getElementById('sing-status').textContent };
    });
    check('Klang nach Stichworten: Flöte, weich (Tiefpass), viel Hall', snd.preset === 'flute' && snd.hall?.on && snd.hall.mix >= 0.4 && snd.filter?.on && snd.filter.type === 'lowpass', JSON.stringify(snd));
    await page.keyboard.press('Control+z');
    check('Klang bauen ist ein Rückgängig-Schritt', await page.evaluate(() => window.loopwerk.store.project.patterns[window.loopwerk.patternEditor.id].preset) === 'pluck');

    // ---------- Mit Claude (nachgebildet) ----------
    await page.reload();
    await page.waitForFunction(() => window.loopwerk?.ready);
    await page.evaluate(() => window.loopwerk.library.catalogReady);
    await page.evaluate(async () => {
      const mm = await import('./src/model.js');
      window.loopwerk.store.replace(mm.createEmptyProject());
      window.__asked = [];
      const fakeSample = async () => ({ text: '' });
      fakeSample.json = async (prompt) => {
        window.__asked.push(prompt);
        if (prompt.includes('Sounddesigner')) return { preset: 'bell', name: 'Glitzerglocke', fx: { echo: { on: true, mix: 0.4, time: '1/8' }, drive: { on: true, drive: 5, type: 'quatsch' } } };
        // Fortsetzung mit Ausreißern, die bereinigt werden müssen
        return [{ pitch: 72, start: 8, len: 1 }, { pitch: 74, start: 9.1, len: 0.9 }, { pitch: 200, start: 10, len: 2 }, { pitch: 69, start: 12, len: 4 }, { pitch: 60, start: 40, len: 1 }, { pitch: 'x' }];
      };
      window.claude = { use: async (name) => (name === 'sample' ? fakeSample : null) };
    });
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await setNotes(START);
    await page.click('#pat-continue');
    await page.waitForFunction(() => !document.getElementById('pat-continue').hasAttribute('aria-busy'));
    sp = await synth();
    const asked = await page.evaluate(() => window.__asked[0] || '');
    check('Claude bekommt Melodie, Tonart und Länge', asked.includes('"pitch":69') && asked.includes('A-Moll') && asked.includes('genau 8 Schläge'), asked.slice(0, 160));
    check('Antwort von Claude wird bereinigt (Raster, Tonumfang, Bereich)', JSON.stringify(sp.notes.filter((n) => n.start >= 8).map((n) => [n.pitch, n.start, n.len])) === '[[72,8,1],[74,9,1],[84,10,2],[69,12,4]]', JSON.stringify(sp.notes.filter((n) => n.start >= 8)));
    check('Meldung: Idee von Claude', /Claude/.test(await page.locator('#hint-text').textContent()));
    await openSing();
    await page.fill('#sing-desc', 'glitzernd wie eine Spieluhr');
    await page.press('#sing-desc', 'Enter');
    await page.waitForFunction(() => /Klang:/.test(document.getElementById('sing-status').textContent));
    snd = await page.evaluate(() => {
      const { store, patternEditor } = window.loopwerk;
      const p = store.project.patterns[patternEditor.id];
      const t = store.project.tracks.find((x) => x.clips.some((c) => c.sampleId === 'pat-' + patternEditor.id));
      return { preset: p.preset, name: p.name, echo: t.fx.echo, drive: t.fx.drive };
    });
    check('Klang von Claude: Grundklang, Name und Effekte übernommen, Werte begrenzt', snd.preset === 'bell' && snd.name === 'Glitzerglocke' && snd.echo.on && snd.echo.time === '1/8' && snd.drive.on && snd.drive.drive === 1 && snd.drive.type === 'soft', JSON.stringify(snd));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-weiterfuehren.png') });

    // ---------- Projektname ----------
    await page.evaluate(async () => { delete window.claude; const mm = await import('./src/model.js'); window.loopwerk.store.replace(mm.createDemoProject()); });
    check('Projektname steht im Deck', await page.inputValue('#project-name') === 'Beispiel-Arrangement');
    await fillR(page, '#project-name', 'Mein Techno-Track');
    await page.press('#project-name', 'Enter');
    let pn = await page.evaluate(() => ({ name: window.loopwerk.store.project.name, title: document.title, focus: document.activeElement.id }));
    check('Projektname ändern (Enter übernimmt, Fenstertitel folgt)', pn.name === 'Mein Techno-Track' && pn.title.startsWith('Mein Techno-Track') && pn.focus !== 'project-name', JSON.stringify(pn));
    await fillR(page, '#project-name', '   ');
    await page.press('#project-name', 'Enter');
    check('Leerer Name behält den alten', await page.inputValue('#project-name') === 'Mein Techno-Track');
    await clickR(page, '#project-name');
    await page.keyboard.type(' 2');
    await page.keyboard.press('Escape');
    check('Escape verwirft die Eingabe', await page.inputValue('#project-name') === 'Mein Techno-Track' && await page.evaluate(() => window.loopwerk.store.project.name) === 'Mein Techno-Track');
    const dl = page.waitForEvent('download');
    await clickR(page, '#save-btn');
    const file = (await dl).suggestedFilename();
    check('Gespeicherte Datei heißt wie das Projekt', file === 'Mein Techno-Track.json', file);
    await page.keyboard.press('Control+z');
    check('Rückgängig stellt den alten Namen her', await page.inputValue('#project-name') === 'Beispiel-Arrangement');

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
    await app.close();

    // ---------- Handy: Import und Einsingen-Feld ----------
    app = await openApp({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    page = app.page;
    await page.tap('#tab-sounds');
    await page.setInputFiles('#import-input', { name: 'Sprachmemo.wav', mimeType: 'audio/wav', buffer: wav([voice([[60, 1]])]) });
    await page.waitForFunction(() => window.loopwerk.library.list().some((s) => s.name === 'Sprachmemo'), null, { timeout: 10000 });
    await page.waitForTimeout(150);
    const mob = await page.evaluate(() => {
      const s = window.loopwerk.library.list().find((x) => x.name === 'Sprachmemo');
      const item = document.querySelector(`#library .loop-item[data-sample-id="${s.id}"]`);
      const r = item.getBoundingClientRect();
      const box = document.querySelector('.shelf').getBoundingClientRect();
      return { open: document.querySelector('#shelf-cat-own').getAttribute('aria-expanded'), drums: document.querySelector('#shelf-cat-drums').getAttribute('aria-expanded'), inView: r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
    });
    check('Handy: Import klappt „Eigene“ auf (andere zu) und zeigt den Sound', mob.open === 'true' && mob.drums === 'false' && mob.inView, JSON.stringify(mob));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-import-mobil.png') });
    await page.tap('#new-melody-btn');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    await reveal(page, '#pat-sing-btn');
    await page.tap('#pat-sing-btn');
    const ms = await page.evaluate(() => ({ visible: !document.getElementById('pat-sing').hidden, overflow: document.documentElement.scrollWidth - innerWidth, rec: document.getElementById('sing-rec').getBoundingClientRect().height }));
    check('Handy: Einsingen-Feld nutzbar', ms.visible && ms.overflow <= 0 && ms.rec >= 40, JSON.stringify(ms));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));

    // Spurname bearbeiten und daneben tippen: die Leiste unten muss wiederkommen
    const tabbar = () => page.evaluate(() => getComputedStyle(document.getElementById('tabbar')).display !== 'none' && !document.getElementById('app').classList.contains('kbd'));
    await page.locator('.track-row').nth(1).locator('.track-name').tap();
    await page.keyboard.type('Bass neu');
    await page.locator('.lane').nth(4).tap();
    await page.waitForTimeout(400);
    check('Handy: nach Umbenennen (Tipp daneben) ist die Leiste unten wieder da', await tabbar());
    await page.locator('.track-row').nth(2).locator('.track-name').tap();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('Handy: nach Umbenennen mit Enter ist die Leiste unten wieder da', await tabbar());

    // Projektname im Fach „Mehr“
    await page.tap('#tab-more');
    const inMore = await page.evaluate(() => { const n = document.getElementById('project-name'); const r = n.getBoundingClientRect(); return { inMore: !!n.closest('#more'), h: r.height, w: r.width }; });
    check('Handy: Projektname im Fach „Mehr“, groß genug', inMore.inMore && inMore.h >= 44 && inMore.w > 300, JSON.stringify(inMore));
    await page.locator('#project-name').tap();
    await page.fill('#project-name', 'Handy-Song');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('Handy: Projektname ändern, danach Leiste wieder da', await page.evaluate(() => window.loopwerk.store.project.name) === 'Handy-Song' && await tabbar());
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-projektname-mobil.png') });
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'v15-einsingen-mobil.png') });
    check('Keine Fehler in der Konsole (Handy)', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    finish();
  }
})();
