// Sampler: echte Instrumente (VCSL, CC0) im Melodie-Editor – Tonhöhe, Länge, Release, Anschlag, Pattern-Render, Vorhören.
// node tests/sampler.test.cjs
const { openApp, createChecker, createCard } = require('./harness.cjs');

const { check, finish } = createChecker();

// Läuft im Browser: Hilfen für Testinstrumente (WAV als Blob-URL) und Messungen
function installHelpers() {
  const sr = 44100;
  // Mono-WAV, 16 Bit, aus einer Funktion f(i) → Wert
  const wavUrl = (seconds, f) => {
    const n = Math.round(seconds * sr);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, f(i))) * 32767), true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  };
  const sine = (hz, a = 0.5) => (i) => a * Math.sin(2 * Math.PI * hz * i / sr);
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  // Frequenz eines Sinus über Nulldurchgänge (aufwärts, linear interpoliert)
  const zeroCrossHz = (d, from, to) => {
    const xs = [];
    for (let i = from; i < to - 1; i++) if (d[i] <= 0 && d[i + 1] > 0) xs.push(i + d[i] / (d[i] - d[i + 1]));
    return xs.length > 2 ? (xs.length - 1) * sr / (xs[xs.length - 1] - xs[0]) : 0;
  };
  const rms = (d, from, to) => { let s = 0; for (let i = from; i < to; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, to - from)); };
  const peak = (d, from = 0, to = d.length) => { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(d[i])); return p; };
  const maxJump = (d, from, to) => { let j = 0; for (let i = Math.max(1, from); i < to; i++) j = Math.max(j, Math.abs(d[i] - d[i - 1])); return j; };
  const offline = (seconds) => new OfflineAudioContext(2, Math.round(seconds * sr), sr);
  window.__st = { sr, wavUrl, sine, hz, zeroCrossHz, rms, peak, maxJump, offline };
}

(async () => {
  const app = await openApp({ viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.evaluate(installHelpers);

    // ---------- Format und Auswahl im Editor ----------
    const fmt = await page.evaluate(async () => {
      const { SAMPLED_INSTRUMENTS } = await import('./src/instruments-vcsl.js');
      const bad = SAMPLED_INSTRUMENTS.filter((i) => !(i.id && i.label && i.zones?.length && i.license === 'CC0'
        && i.zones.every((z, k) => Number.isFinite(z.midi) && z.file && (k === 0 || z.midi > i.zones[k - 1].midi)))).map((i) => i.id);
      return { ids: SAMPLED_INSTRUMENTS.map((i) => i.id), labels: SAMPLED_INSTRUMENTS.map((i) => i.label), bad };
    });
    check('Instrumentliste im erwarteten Format, CC0, Zonen aufsteigend', fmt.ids.length >= 1 && !fmt.bad.length, `${fmt.ids.join(', ')}${fmt.bad.length ? ' – fehlerhaft: ' + fmt.bad.join(', ') : ''}`);
    const A = fmt.ids[0];
    const B = fmt.ids[fmt.ids.length - 1];

    await page.evaluate(async () => { const m = await import('./src/model.js'); window.loopwerk.store.replace(m.createEmptyProject()); });
    await createCard(page, 'melody');
    await page.waitForFunction(() => document.getElementById('pat-title').textContent === 'Melodie-Editor');
    const pid = await page.evaluate(() => window.loopwerk.patternEditor.id);
    const sel = await page.evaluate(() => {
      const s = document.getElementById('pat-preset');
      const groups = [...s.querySelectorAll('optgroup')];
      const kids = [...s.children];
      return {
        groups: groups.map((g) => g.label),
        inGroup: groups[0] ? [...groups[0].querySelectorAll('option')].map((o) => o.value) : [],
        groupLast: kids[kids.length - 1]?.tagName === 'OPTGROUP',
        synth: kids.filter((k) => k.tagName === 'OPTION').length,
      };
    });
    check('Feld „Klang“: Gruppe „Echte Instrumente (CC0)“ nach den Synth-Klängen',
      sel.groups.length === 1 && sel.groups[0] === 'Echte Instrumente (CC0)' && sel.groupLast && sel.synth === 11 && JSON.stringify(sel.inGroup) === JSON.stringify(fmt.ids),
      JSON.stringify(sel));

    // Auswahl startet das Laden sofort – auch ohne Noten (dann rendert das Pattern nichts, was laden müsste)
    await page.selectOption('#pat-preset', B);
    const stateAfterSelect = await page.evaluate(async (id) => (await import('./src/sampler.js')).loadState(id), B);
    check('Instrument wählen beginnt sofort zu laden', stateAfterSelect !== 'idle', stateAfterSelect);
    await page.evaluate(async (id) => (await import('./src/sampler.js')).loadInstrument(id), B);

    // Klangwechsel rendert das Pattern neu (Synth → Instrument A → Instrument B)
    const notes = [{ pitch: 60, start: 0, len: 1, vel: 1 }, { pitch: 64, start: 1, len: 1, vel: 1 }, { pitch: 69, start: 2, len: 2, vel: 1 }];
    const snap = (preset) => page.evaluate(async ({ pid, preset, notes }) => {
      const { store, patterns, library } = window.loopwerk;
      if (preset) {
        const s = document.getElementById('pat-preset');
        s.value = preset;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      } else store.updatePattern(pid, (p) => { p.notes = notes; p.preset = 'pluck'; });
      await new Promise((r) => setTimeout(r, 50));
      await patterns.queue;
      const sample = library.get('pat-' + pid);
      const { renderPattern } = await import('./src/instruments.js');
      const direct = await renderPattern(store.project.patterns[pid], library.bpm, library);
      const a = sample.buffer.getChannelData(0);
      const b = direct.buffer.getChannelData(0);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
      // Referenz: dieselben Noten direkt über den Sampler (Bus 0,9); verglichen ab 1 s, davor liegt der gefaltete Ausklang
      let ref = null;
      const p = store.project.patterns[pid];
      const S = await import('./src/sampler.js');
      if (S.isSampled(p.preset)) {
        const loaded = await S.loadInstrument(p.preset);
        const spb = 60 / library.bpm;
        const ctx = new OfflineAudioContext(2, a.length, 44100);
        const bus = ctx.createGain();
        bus.gain.value = 0.9;
        bus.connect(ctx.destination);
        for (const n of p.notes) S.playSampled(ctx, bus, loaded, n.pitch, n.start * spb, n.len * spb, n.vel);
        const r = (await ctx.startRendering()).getChannelData(0);
        ref = 0;
        for (let i = 44100; i < a.length; i++) ref = Math.max(ref, Math.abs(a[i] - r[i]));
      }
      return { preset: p.preset, rev: sample.rev, diff, ref, peak: window.__st.peak(a), head: Array.from(a.subarray(2000, 2400)), instrument: sample.instrument };
    }, { pid, preset, notes });
    const s0 = await snap(null);
    const s1 = await snap(A);
    const s2 = A !== B ? await snap(B) : s1;
    const differs = (x, y) => x.head.some((v, i) => Math.abs(v - y.head[i]) > 1e-3);
    check('Klangwechsel im Editor rendert das Pattern neu',
      s1.preset === A && s1.rev > s0.rev && differs(s0, s1) && (A === B || (s2.rev > s1.rev && differs(s1, s2))),
      `rev ${s0.rev} → ${s1.rev} → ${s2.rev}, Instrument „${s1.instrument}“`);
    check('Pattern-Sound = renderPattern mit Instrument = Sampler-Noten', s1.diff < 1e-6 && s2.diff < 1e-6 && s1.ref < 1e-4 && s2.ref < 1e-4 && s1.peak > 0.05 && s1.peak < 1,
      `Abweichung zu renderPattern ${s1.diff.toExponential(1)} / ${s2.diff.toExponential(1)}, zum Sampler ${s1.ref?.toExponential(1)} / ${s2.ref?.toExponential(1)}, Spitze ${s1.peak.toFixed(2)}`);

    // ---------- Testinstrumente mit bekannten Signalen ----------
    await page.evaluate(async () => {
      const { registerInstrument } = await import('./src/sampler.js');
      const { wavUrl, sine, hz, sr } = window.__st;
      const base = { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'Test', source: 'Test', category: 'keys' };
      // C4/E4 als reine Sinustöne, gehalten
      registerInstrument({ ...base, id: 'test-sinus', label: 'Test Sinus', release: 0.2, sustain: true, gain: 1,
        zones: [{ midi: 60, file: wavUrl(2.5, sine(hz(60))) }, { midi: 64, file: wavUrl(2.5, sine(hz(64))) }] });
      // Nicht gehalten: klingt nach Notenende noch `release` lang
      registerInstrument({ ...base, id: 'test-zupf', label: 'Test Zupf', release: 0.3, sustain: false, gain: 1,
        zones: [{ midi: 60, file: wavUrl(3, sine(hz(60))) }] });
      // Gleichspannung für den Anschlag
      registerInstrument({ ...base, id: 'test-dc', label: 'Test DC', release: 0.1, sustain: true, gain: 1,
        zones: [{ midi: 60, file: wavUrl(1, () => 0.5) }] });
      // Kurze Aufnahme mit Schleife (Frames, ganze Perioden von 220,5 Hz = 200 Frames)
      registerInstrument({ ...base, id: 'test-schleife', label: 'Test Schleife', release: 0.1, sustain: true, gain: 1,
        zones: [{ midi: 57, file: wavUrl(0.5, sine(sr / 200)), loopStart: 4400, loopEnd: 22000 }] });
      // Stille vor dem Einsatz (40 ms) wird übersprungen
      registerInstrument({ ...base, id: 'test-vorlauf', label: 'Test Vorlauf', release: 0.1, sustain: true, gain: 1,
        zones: [{ midi: 60, file: wavUrl(1, (i) => (i < 1764 ? 0 : 0.5)) }] });
    });

    // Offline mit dem Sampler direkt: eine Note, Messung auf Kanal 0
    const play = (id, pitch, when, dur, seconds) => page.evaluate(async ({ id, pitch, when, dur, seconds }) => {
      const S = await import('./src/sampler.js');
      const loaded = await S.loadInstrument(id);
      const ctx = window.__st.offline(seconds);
      S.playSampled(ctx, ctx.destination, loaded, pitch, when, dur, 1);
      const out = await ctx.startRendering();
      window.__last = out.getChannelData(0);
      return true;
    }, { id, pitch, when, dur, seconds });
    const measure = (fn, arg) => page.evaluate(fn, arg);

    // Tonhöhe: A4 aus der E4-Zone
    await play('test-sinus', 69, 0, 1, 1.5);
    const f69 = await measure(() => window.__st.zeroCrossHz(window.__last, 4410, 39690));
    check('A4 aus der C4/E4-Zone: 440 Hz ±1 %', Math.abs(f69 / 440 - 1) < 0.01, `${f69.toFixed(2)} Hz`);
    await play('test-sinus', 61, 0, 1, 1.5);
    const f61 = await measure(() => window.__st.zeroCrossHz(window.__last, 4410, 39690));
    check('C♯4 aus der C4-Zone (nächste Zone): 277,18 Hz ±1 %', Math.abs(f61 / 277.18 - 1) < 0.01, `${f61.toFixed(2)} Hz`);

    // Länge und Release (gehalten): Note 0,1–0,6 s, release 0,2 s
    await play('test-sinus', 60, 0.1, 0.5, 1.5);
    const sus = await measure(() => {
      const { rms, peak, sr } = window.__st;
      const d = window.__last;
      const at = (t) => Math.round(t * sr);
      return { before: peak(d, 0, at(0.099)), body: rms(d, at(0.15), at(0.59)), end: peak(d, at(0.6), at(0.61)), after: peak(d, at(0.85), d.length) };
    });
    const db = (x) => 20 * Math.log10(x);
    check('Gehaltene Note: klingt bis zum Notenende in voller Stärke', Math.abs(db(sus.body / (0.5 / Math.SQRT2))) < 0.5 && sus.before < 1e-4,
      `RMS ${db(sus.body / (0.5 / Math.SQRT2)).toFixed(2)} dB gegenüber Quelle, vorher ${sus.before.toExponential(1)}`);
    check('Gehaltene Note: Release weich (kein harter Schnitt) und nach Ende + release + 50 ms leise',
      sus.end > 0.2 && sus.after < 1e-3, `direkt nach Ende ${sus.end.toFixed(3)}, danach max ${sus.after.toExponential(1)}`);

    // Nicht gehalten: klingt nach Notenende natürlich weiter, endet nach Ende + release weich
    await play('test-zupf', 60, 0.1, 0.5, 1.5);
    const pl = await measure(() => {
      const { rms, peak, sr } = window.__st;
      const d = window.__last;
      const at = (t) => Math.round(t * sr);
      return { ring: rms(d, at(0.65), at(0.89)), fade: peak(d, at(0.9), at(0.91)), after: peak(d, at(0.95), d.length) };
    });
    check('Nicht gehaltene Note: klingt nach Notenende weiter, nach Ende + release + 50 ms leise',
      Math.abs(db(pl.ring / (0.5 / Math.SQRT2))) < 0.5 && pl.fade > 0.05 && pl.after < 2e-3,
      `Nachklang ${db(pl.ring / (0.5 / Math.SQRT2)).toFixed(2)} dB, am Ende ${pl.fade.toFixed(3)}, danach max ${pl.after.toExponential(1)}`);

    // Anschlag: Gleichspannung 0,5 steigt in 3 ms linear an
    await play('test-dc', 60, 0, 0.5, 1);
    const att = await measure(() => {
      const d = window.__last;
      let mono = true;
      for (let i = 1; i < 140; i++) if (d[i] < d[i - 1] - 1e-6) mono = false;
      return { first: d[0], mid: d[66], full: d[200], mono, jump: window.__st.maxJump(d, 0, 400) };
    });
    check('Kein Klick am Anfang: die ersten 3 ms steigen gleichmäßig an', att.first < 0.01 && Math.abs(att.mid - 0.25) < 0.02 && Math.abs(att.full - 0.5) < 0.005 && att.mono && att.jump < 0.01,
      `Frame 0: ${att.first.toFixed(4)}, 1,5 ms: ${att.mid.toFixed(3)}, 4,5 ms: ${att.full.toFixed(3)}, größter Sprung ${att.jump.toFixed(4)}`);

    // Schleife: 0,5-s-Aufnahme trägt eine 1,5-s-Note ohne Sprung
    await play('test-schleife', 57, 0, 1.5, 2);
    const lp = await measure(() => {
      const { rms, maxJump, sr } = window.__st;
      const d = window.__last;
      return { late: rms(d, Math.round(1.2 * sr), Math.round(1.45 * sr)), jump: maxJump(d, 200, Math.round(1.45 * sr)) };
    });
    check('Schleife (Frames) hält die Note über die Aufnahme hinaus, ohne Sprung', Math.abs(db(lp.late / (0.5 / Math.SQRT2))) < 0.5 && lp.jump < 0.03,
      `bei 1,2–1,45 s ${db(lp.late / (0.5 / Math.SQRT2)).toFixed(2)} dB, größter Sprung ${lp.jump.toFixed(4)}`);

    // Stille vor dem Einsatz wird übersprungen
    await play('test-vorlauf', 60, 0.1, 0.5, 1);
    const on = await measure(() => {
      const d = window.__last;
      return d.findIndex((v) => Math.abs(v) > 0.25) - Math.round(0.1 * window.__st.sr);
    });
    check('Stille vor dem Einsatz wird übersprungen (Note pünktlich)', on >= 0 && on < 0.006 * 44100, `Einsatz ${(on / 44.1).toFixed(1)} ms nach Notenbeginn`);

    // ---------- Echtes Instrument ----------
    const real = await page.evaluate(async (id) => {
      const S = await import('./src/sampler.js');
      const { detectPitch } = await import('./src/dsp/pitch.js');
      const loaded = await S.loadInstrument(id);
      const out = {};
      for (const pitch of [57, 69]) {
        const ctx = window.__st.offline(1.5);
        S.playSampled(ctx, ctx.destination, loaded, pitch, 0, 1, 1);
        const d = (await ctx.startRendering()).getChannelData(0);
        const tr = detectPitch(d.slice(0, 44100), 44100);
        const f = [...tr.f0].filter((v, i) => v > 0 && tr.conf[i] > 0.8).sort((a, b) => a - b);
        out[pitch] = { hz: f[Math.floor(f.length / 2)] || 0, start: Math.abs(d[0]), jump: window.__st.maxJump(d, 0, 132), peak: window.__st.peak(d) };
      }
      return out;
    }, A);
    const cents = (f, m) => 1200 * Math.log2(f / (440 * 2 ** ((m - 69) / 12)));
    check(`„${fmt.labels[0]}“: A3 und A4 treffen den Ton (±50 Cent)`, Math.abs(cents(real[57].hz, 57)) < 50 && Math.abs(cents(real[69].hz, 69)) < 50,
      `A3 ${real[57].hz.toFixed(1)} Hz (${cents(real[57].hz, 57).toFixed(0)} ct), A4 ${real[69].hz.toFixed(1)} Hz (${cents(real[69].hz, 69).toFixed(0)} ct)`);
    check(`„${fmt.labels[0]}“: beginnt ohne Sprung, Pegel im Rahmen`, real[69].start < 1e-3 && real[69].jump < 0.05 && real[69].peak > 0.1 && real[69].peak < 1,
      `Frame 0 ${real[69].start.toExponential(1)}, größter Sprung in 3 ms ${real[69].jump.toFixed(3)}, Spitze ${real[69].peak.toFixed(2)}`);

    // ---------- Offline (Pattern) und Live (gehaltene Taste) klingen gleich ----------
    const cmp = await page.evaluate(async () => {
      const I = await import('./src/instruments.js');
      const { zeroCrossHz, rms, peak, offline, sr } = window.__st;
      const pat = { type: 'synth', bars: 1, preset: 'test-sinus', notes: [{ pitch: 69, start: 0, len: 1, vel: 1 }] };
      const off = (await I.renderPattern(pat, 120, window.loopwerk.library)).buffer.getChannelData(0);
      // Live-Pfad im OfflineAudioContext: Taste bei 0, Loslassen bei 0,5 s
      const ctx = offline(2);
      const voice = I.startNote(ctx, ctx.destination, 'test-sinus', 69);
      ctx.suspend(0.5).then(() => { voice.stop(); ctx.resume(); });
      const live = (await ctx.startRendering()).getChannelData(0);
      const at = (t) => Math.round(t * sr);
      return {
        fOff: zeroCrossHz(off, at(0.05), at(0.45)), fLive: zeroCrossHz(live, at(0.05), at(0.45)),
        rOff: rms(off, at(0.05), at(0.45)) / 0.9, rLive: rms(live, at(0.05), at(0.45)) / 0.8,
        tailOff: peak(off, at(0.75), off.length), tailLive: peak(live, at(0.76), live.length),
      };
    });
    check('Offline (Pattern) und Live (Taste) vergleichbar: gleiche Tonhöhe, Pegel, Ausklang',
      Math.abs(cmp.fOff - cmp.fLive) < 1 && Math.abs(db(cmp.rOff / cmp.rLive)) < 0.5 && cmp.tailOff < 1e-3 && cmp.tailLive < 1e-3,
      `${cmp.fOff.toFixed(1)} / ${cmp.fLive.toFixed(1)} Hz, Pegel ${db(cmp.rOff / cmp.rLive).toFixed(2)} dB, Ausklang ${cmp.tailOff.toExponential(1)} / ${cmp.tailLive.toExponential(1)}`);

    // ---------- Vorhören, solange das Instrument noch lädt ----------
    const pre = await page.evaluate(async () => {
      const S = await import('./src/sampler.js');
      const I = await import('./src/instruments.js');
      const { wavUrl, sine, hz, offline, peak, zeroCrossHz, sr } = window.__st;
      S.registerInstrument({ id: 'test-spaet', label: 'Test Harfe spät', category: 'plucked', release: 0.2, sustain: false, gain: 1, license: 'CC0',
        zones: [{ midi: 69, file: wavUrl(1, sine(hz(69))) }] });
      const res = { errors: [] };
      const ctx = offline(1);
      try {
        I.previewNote(ctx, ctx.destination, 'test-spaet', 69);
        I.startNote(ctx, ctx.destination, 'test-spaet', 72).stop();
      } catch (e) { res.errors.push(e.message); }
      res.state = S.loadState('test-spaet');
      res.fallback = S.fallbackPreset(S.getInstrument('test-spaet'));
      const d = (await ctx.startRendering()).getChannelData(0);
      res.firstPeak = peak(d);
      await S.loadInstrument('test-spaet');
      const ctx2 = offline(1);
      I.previewNote(ctx2, ctx2.destination, 'test-spaet', 69);
      const d2 = (await ctx2.startRendering()).getChannelData(0);
      res.secondHz = zeroCrossHz(d2, Math.round(0.05 * sr), Math.round(0.35 * sr));
      res.state2 = S.loadState('test-spaet');
      return res;
    });
    check('Vorhören vor dem Laden: kein Fehler, Synth-Ersatz klingt, Laden läuft', !pre.errors.length && pre.state === 'loading' && pre.firstPeak > 0.01 && pre.fallback === 'pluck',
      `${pre.errors.join(' ') || 'keine Ausnahme'}, Zustand ${pre.state}, Ersatz ${pre.fallback}, Spitze ${pre.firstPeak.toFixed(3)}`);
    check('Danach spielt das Vorhören das Instrument selbst', pre.state2 === 'ready' && Math.abs(pre.secondHz / 440 - 1) < 0.01, `${pre.secondHz.toFixed(2)} Hz`);

    // Klaviatur im Editor (Realtime, nur grob): Taste H = A4 mit dem gewählten Instrument, gehalten und losgelassen
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('h');
    await page.waitForTimeout(200);
    const down = await page.evaluate(() => document.querySelector('#pat-keybed [data-pitch="69"]')?.classList.contains('down'));
    await page.keyboard.up('h');
    await page.waitForTimeout(100);
    check('Klaviatur spielt mit echtem Instrument (Taste gedrückt, keine Ausnahme)', down === true && app.errors.length === 0, `gedrückt: ${down}`);

    // ---------- Klang aus Beschreibung kennt die Instrumente ----------
    const ds = await page.evaluate(async (label) => {
      const { soundFromWords } = await import('./src/ai.js');
      const I = await import('./src/instruments.js');
      return { real: soundFromWords(`sanft, ${label} mit Hall`, I.allPresets()).preset, synth: soundFromWords('verzerrter Acid-Bass', I.allPresets()).preset };
    }, fmt.labels[0]);
    check('„Klang aus Beschreibung“ wählt das genannte echte Instrument', ds.real === A && ds.synth === 'acid', JSON.stringify(ds));

    check('Keine Fehler in der Konsole', app.errors.length === 0, app.errors.join(' | '));
  } catch (e) {
    check('Test lief ohne Ausnahme', false, e.stack);
  } finally {
    await app.close();
    finish();
  }
})();
