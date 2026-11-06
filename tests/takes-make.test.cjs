// Krachwerk 3b (Spec docs/specs/krachwerk-3-festhalten.md): ● im laufenden Loop → Takes ab dem nächsten Loop-Sprung,
// ohne Stopp und Vorzähler, roh (Hochpass 45 Hz + gemeinsamer Pegel), Rezept für alle Takes (setRecipe … also).
// node tests/takes-make.test.cjs
// Mikrofon: Loopback-Attrappe wie in tests/v213-aufnahme.test.cjs (engine.out → DelayNode 0,12 s → MediaStreamDestination).
const path = require('path');
const { openApp, createChecker } = require('./harness.cjs');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR || '.';

const { check, finish } = createChecker();
const SR = 44100;
const N = 176400; // 8 Schläge bei 120 BPM

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
    return m.dest.stream;
  };
};

(async () => {
  const app = await openApp({ init: loopback, viewport: { width: 1440, height: 900 } });
  const { page } = app;
  try {
    await page.goto(new URL('/werkstatt/', app.url).href);
    await page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 30000 });
    const api = await page.evaluate(() => ({ edition: window.loopwerk.edition.id, recTakes: window.loopwerk.edition.recTakes, ctx: typeof window.loopwerk.record?.context, start: typeof window.loopwerk.record?.start }));
    check('Krachwerk mit recTakes, record.start/record.context vorhanden', api.edition === 'make' && api.recTakes === true && api.ctx === 'function' && api.start === 'function', JSON.stringify(api));

    // ===== 1. Loop läuft, ● → Takes ab dem nächsten Sprung =====
    const pre = await page.evaluate(async () => {
      const lw = window.loopwerk;
      const m = await import('./src/model.js');
      lw.store.replace(m.createEmptyProject(lw.edition));
      lw.store.setBpm(120);
      lw.store.setLoop({ on: true, startBeat: 0, endBeat: 8 });
      // Song: Impuls auf Schlag 1 jedes Durchgangs (über Summe und Limiter) – Bezug für den Marker im Take
      const sr = 44100;
      const b = new AudioBuffer({ numberOfChannels: 2, length: 8 * 22050, sampleRate: sr });
      for (let c = 0; c < 2; c++) b.getChannelData(c)[22050] = 0.35;
      lw.library.register({ id: 'test-loop-click', name: 'Loop-Klick', category: 'fx', lengthBeats: 8, bpm: 120, buffer: b });
      const t = lw.store.project.tracks[0].id;
      lw.store.addClip(t, 'test-loop-click', 0, 8);
      lw.ui.select(null);
      localStorage.removeItem(lw.edition.keyPrefix + 'recLatency.v1');
      const cal = await lw.recorder.calibrate().catch((e) => ({ err: e.code }));
      const ctxStopped = lw.record.context();
      await lw.engine.play(0);
      await new Promise((r) => setTimeout(r, 1300)); // Testablauf: der Song läuft schon eine Weile, Marke mitten im Loop
      // Ab jetzt jede Änderung von engine.playing mitschreiben (Ereignis + Abtastung)
      window.__play = { stops: 0, samples: 0, off: 0 };
      lw.engine.on((what) => { if (what === 'state' && !lw.engine.playing) window.__play.stops++; });
      window.__poll = setInterval(() => { window.__play.samples++; if (!lw.engine.playing) window.__play.off++; }, 20);
      return { cal, ctxStopped, ctxPlaying: lw.record.context(), tracks: lw.store.project.tracks.length, undo: lw.store.undoStack.length };
    });
    check('Einmessen über die Attrappe', pre.cal && pre.cal.ms > 100 && pre.cal.ms < 220, JSON.stringify(pre.cal));
    check('Kontext: Loop läuft → „takes“', pre.ctxPlaying === 'takes', JSON.stringify(pre));

    await page.evaluate(() => document.getElementById('rec-btn').click());
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const arm = await page.evaluate(() => { const r = window.loopwerk.recorder; return { mode: r.mode, atWrap: r.atWrap, shape: r.takeShape, opened: window.__mock.opened, playing: window.loopwerk.engine.playing, hint: document.getElementById('hint').textContent }; });
    check('● bei laufendem Loop: Modus song, startAt next-wrap, roh', arm.mode === 'song' && arm.atWrap === true && arm.shape === 'raw' && arm.playing, JSON.stringify(arm));
    await page.waitForFunction(() => window.loopwerk.recorder.songStartTime != null, null, { timeout: 10000, polling: 10 });
    // „Gesang“ je Durchgang: eigener Ton und Marker bei 0,25 s, Pegel je Take verschieden (gemeinsamer Faktor muss sie erhalten)
    const plan = await page.evaluate(() => {
      const { engine, recorder, store } = window.loopwerk;
      const ctx = engine.ctx;
      const m = window.__mock;
      const t0 = recorder.songStartTime;
      const L = 4;
      const d = engine.playbackDelay();
      const into = ctx.createGain();
      into.connect(m.delay);
      const amps = [0.1, 0.2, 0.05, 0.1];
      [440, 550, 660, 770].forEach((f, k) => {
        const o = new OscillatorNode(ctx, { frequency: f });
        const g = new GainNode(ctx, { gain: amps[k] });
        o.connect(g).connect(into);
        o.start(t0 + k * L + d);
        o.stop(t0 + (k < 3 ? (k + 1) * L : 3 * L + 0.6) + d); // der angefangene 4. Durchgang endet vor dem Stopp
        const b = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: ctx.sampleRate });
        b.getChannelData(0)[0] = 3 * amps[k];
        const s = new AudioBufferSourceNode(ctx, { buffer: b });
        s.connect(into);
        s.start(t0 + k * L + 0.25 + d);
      });
      // Sprung: auf dem Loop-Anfang, in der Zukunft, als die Aufnahme begann
      const wrapBeat = engine.anchors.find((a) => Math.abs(a.time - t0) < 1e-9)?.beat;
      return { t0, d, lead: t0 - ctx.currentTime, wrapBeat, loop: store.project.loop };
    });
    check('Aufnahme beginnt an einem Loop-Sprung (Schlag 0), ohne neuen Song-Start', plan.wrapBeat === 0 && plan.lead > -0.2, JSON.stringify(plan));
    await page.waitForFunction((t) => window.loopwerk.engine.ctx.currentTime >= t, plan.t0 + 12.5, { timeout: 30000, polling: 20 });
    await page.evaluate(() => document.getElementById('rec-btn').click());
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const res = await page.evaluate(async () => {
      const lw = window.loopwerk;
      clearInterval(window.__poll);
      const { store, library } = lw;
      const clips = store.project.tracks.flatMap((t) => t.clips.map((c) => ({ ...c, track: t.id }))).filter((c) => c.sampleId !== 'test-loop-click');
      const c = clips[0];
      const sr = 44100;
      const goertzel = (d, f) => { const w = 2 * Math.PI * f / sr; const k = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const s = d[i] + k * s1 - s2; s2 = s1; s1 = s; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)); };
      const argmax = (d, a, z) => { let m = 0, at = -1; for (let i = a; i < z; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); at = i; } return { m, at }; };
      const takes = [];
      for (const id of c?.takes || []) {
        const s = await library.ensure(id);
        const d = s.orig.getChannelData(0);
        let peak = 0;
        for (let ch = 0; ch < s.orig.numberOfChannels; ch++) for (const v of s.orig.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
        const mk = argmax(d, 0, Math.round(0.4 * sr)).at;
        const song = argmax(d, Math.round(0.4 * sr), Math.round(0.7 * sr)).at;
        // Ton k in der Mitte des Takes (ohne Marker und Song-Klick)
        const mid = d.subarray(Math.round(1 * sr), Math.round(3.5 * sr));
        const e = [440, 550, 660, 770].map((f) => goertzel(mid, f));
        let dc = 0;
        for (let i = 0; i < d.length; i++) dc += d[i];
        takes.push({ id, name: s.name, n: s.orig.length, peak, mk, song, e, dc: dc / d.length, cat: s.category, from: s.from });
      }
      // Speicher: Takes liegen im Krachwerk-Speicher (IndexedDB loopwerk-make)
      const idb = await new Promise((resolve) => {
        const req = indexedDB.open(lw.own.dbName);
        req.onsuccess = async () => {
          const db = req.result;
          const keys = new Set();
          for (const name of db.objectStoreNames) {
            const ks = await new Promise((r) => { const q = db.transaction(name).objectStore(name).getAllKeys(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); });
            ks.forEach((k) => keys.add(String(k)));
          }
          db.close();
          resolve({ name: lw.own.dbName, has: (c?.takes || []).map((id) => keys.has(id)) });
        };
        req.onerror = () => resolve({ name: lw.own.dbName, has: [] });
      });
      return { clips: clips.length, c: c && { start: c.startBeat, len: c.lengthBeats, take: c.take, n: c.takes?.length, sampleId: c.sampleId, track: c.track }, takes, play: window.__play, playing: lw.engine.playing, idb, hint: document.getElementById('hint').textContent };
    });
    check('engine.playing bleibt durchgehend true (kein Stopp, kein Neustart)', res.play.stops === 0 && res.play.off === 0 && res.play.samples > 300 && res.playing, JSON.stringify(res.play));
    check('3 Durchgänge (+1 Schlag) → 1 Clip am Loop-Anfang, Länge 8, 3 Takes, der letzte spielt', res.clips === 1 && res.c?.start === 0 && res.c.len === 8 && res.c.n === 3 && res.c.take === 2 && res.c.sampleId === res.takes[2]?.id, JSON.stringify(res.c));
    check('Kein Säubern: jeder Take genau Loop-Länge N', res.takes.length === 3 && res.takes.every((t) => t.n === N), res.takes.map((t) => t.n).join(', '));
    const peaks = res.takes.map((t) => t.peak);
    // Je Take normalisiert hieße: alle 0,89. Gemeinsam: nur der lauteste (Take 2) trifft 0,89, die anderen liegen darunter
    check('Gemeinsamer Pegel: lautester Take Spitze 0,89 (±0,005), die anderen leiser', Math.abs(Math.max(...peaks) - 0.89) <= 0.005 && peaks[1] === Math.max(...peaks) && peaks[0] < 0.885 && peaks[2] < 0.885, peaks.map((p) => p.toFixed(4)).join(', '));
    const tone = res.takes.map((t, k) => t.e[k]);
    const r1 = 20 * Math.log10(tone[1] / tone[0]), r2 = 20 * Math.log10(tone[2] / tone[0]);
    check('Ein Faktor für alle Takes: Tonpegel bleiben im Verhältnis (+6,0 / −6,0 dB ± 0,5)', Math.abs(r1 - 6.02) <= 0.5 && Math.abs(r2 + 6.02) <= 0.5, `${r1.toFixed(2)} dB, ${r2.toFixed(2)} dB`);
    const dom = res.takes.map((t, k) => 20 * Math.log10(t.e[k] / Math.max(...t.e.filter((_, j) => j !== k))));
    check('In Take k überwiegt Ton k um ≥ 20 dB', dom.length === 3 && dom.every((x) => x >= 20), dom.map((x) => x.toFixed(1)).join(', '));
    const rel = res.takes.map((t) => (t.song - t.mk) - Math.round(0.25 * SR));
    const abs = res.takes.map((t) => t.mk - Math.round(0.25 * SR));
    check('Samplegenau: Marker zum Song-Klick im Take bei 0,25 s ± 2 Samples', res.takes.length === 3 && rel.every((x) => Math.abs(x) <= 2), `relativ ${rel.join(', ')}`);
    check('Marker absolut in allen Takes gleich, ≤ 15 ms', abs.every((x) => x === abs[0]) && Math.abs(abs[0]) <= 0.015 * SR, `absolut ${abs.join(', ')} Samples`);
    check('Hochpass: kein Gleichanteil', res.takes.every((t) => Math.abs(t.dc) < 1e-3), res.takes.map((t) => t.dc.toExponential(1)).join(', '));
    check('Takes sind eigene Sounds im Krachwerk-Speicher (loopwerk-make)', res.idb.name === 'loopwerk-make' && res.idb.has.length === 3 && res.idb.has.every(Boolean) && res.takes.every((t) => t.cat === 'own'), JSON.stringify(res.idb));
    check('Einblender nennt die Takes', /^3 Takes – der letzte spielt\./.test(res.hint), res.hint);

    // ===== 2. setRecipe … also: alle Takes gleich gebacken, ein Rückgängig-Schritt =====
    const rc = await page.evaluate(async () => {
      const { store, library } = window.loopwerk;
      const { cookRecipe } = await import('./src/dsp/recipe.js');
      const { soundFields, normalizeRecipe } = await import('./src/recipe.js');
      const c = store.project.tracks.flatMap((t) => t.clips).find((x) => x.takes);
      const ids = c.takes;
      const u0 = store.undoStack.length;
      // eine Geste: zwei Schritte mit demselben Schlüssel
      store.setRecipe(c.sampleId, { lp: 1500 }, { coalesce: 'g1', also: ids.filter((x) => x !== c.sampleId) });
      store.setRecipe(c.sampleId, { lp: 1200, gain: -6 }, { coalesce: 'g1', also: ids.filter((x) => x !== c.sampleId) });
      const u1 = store.undoStack.length;
      const recs = ids.map((id) => JSON.stringify(store.project.recipes?.[id] ?? null));
      await library.applyRecipes(store.project);
      const out = [];
      for (const id of ids) {
        const s = library.get(id);
        const chs = Array.from({ length: s.orig.numberOfChannels }, (_, k) => s.orig.getChannelData(k));
        const want = cookRecipe(chs, s.orig.sampleRate, soundFields(normalizeRecipe(store.project.recipes[id])));
        let diff = 0, eo = 0, ec = 0;
        const cd = s.cooked?.getChannelData(0);
        if (cd) for (let i = 0; i < want[0].length; i++) { diff = Math.max(diff, Math.abs(cd[i] - want[0][i])); eo += chs[0][i] ** 2; ec += cd[i] ** 2; }
        out.push({ cooked: !!s.cooked, len: s.cooked?.length, diff, db: 10 * Math.log10(ec / eo) });
      }
      store.undo();
      const u2 = store.undoStack.length;
      const after = ids.map((id) => store.project.recipes?.[id] ?? null);
      return { u0, u1, u2, recs, out, after };
    });
    check('setRecipe mit also: alle Takes dasselbe Rezept', rc.recs.length === 3 && rc.recs.every((r) => r === rc.recs[0]) && JSON.parse(rc.recs[0])?.lp === 1200, rc.recs.join(' | '));
    check('Alle Takes gebacken wie cookRecipe(orig, Rezept), gleich lang, leiser', rc.out.every((o) => o.cooked && o.len === N && o.diff < 1e-6 && o.db < -5), JSON.stringify(rc.out));
    check('Eine Geste = ein Rückgängig-Schritt; Undo nimmt das Rezept von allen Takes', rc.u1 === rc.u0 + 1 && rc.u2 === rc.u0 && rc.after.every((r) => r === null), JSON.stringify({ u0: rc.u0, u1: rc.u1, u2: rc.u2 }));


    // ===== 2b. Bedienung: Kontext unter ●, Werkzeug „Take 3/3“, Werkbank „3 Takes“, Geste für alle Takes, Aufnahme-Reiter =====
    const ctxTxt = await page.evaluate(() => {
      const { store, ui, engine, record } = window.loopwerk;
      const t = document.getElementById('rec-ctx')?.textContent;
      const clipId = store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes).id;
      ui.select(clipId);
      return { loopStopped: record.context(), playing: engine.playing, txt: t, clipId };
    });
    check('● zeigt „Takes“ (Text, nicht bedienbar), solange der Loop spielt', ctxTxt.txt === 'Takes' || ctxTxt.txt === 'Geräusch', JSON.stringify(ctxTxt));
    await page.evaluate(() => { const { engine, store } = window.loopwerk; engine.stop(); store.setLoop({ on: false }); });
    await page.waitForFunction(() => document.getElementById('rec-ctx')?.textContent === 'Geräusch', null, { timeout: 5000 });
    await page.evaluate(() => { const { engine, store } = window.loopwerk; store.setLoop({ on: true, startBeat: 0, endBeat: 8 }); engine.play(0); });
    await page.waitForFunction(() => document.getElementById('rec-ctx')?.textContent === 'Takes', null, { timeout: 5000 });
    check('Kontexttext folgt Stopp/Loop/Play: „Geräusch“ ohne Loop, „Takes“ im laufenden Loop', true);
    const ctxEl = await page.evaluate(() => { const e = document.getElementById('rec-ctx'); return { tag: e.tagName, inBtn: !!e.closest('#rec-btn'), pe: getComputedStyle(e).pointerEvents, focusable: e.tabIndex >= 0 && e.tagName !== 'SPAN' }; });
    check('Kontexttext ist reiner Text (keine Zeigerereignisse, nicht fokussierbar)', ctxEl.pe === 'none' && !ctxEl.focusable, JSON.stringify(ctxEl));
    await page.evaluate((id) => { window.loopwerk.engine.stop(); window.loopwerk.ui.select(id); }, ctxTxt.clipId);
    await page.waitForFunction(() => { const b = document.getElementById('cf-take'); return b && !b.hidden && /^Take \d\/\d$/.test(b.textContent); }, null, { timeout: 5000 });
    const cf = await page.evaluate(() => { const b = document.getElementById('cf-take'); const r = b.getBoundingClientRect(); return { txt: b.textContent, w: r.width, h: r.height }; });
    check('Werkzeug am Clip: „Take 3/3“, Ziel ≥ 44 px', cf.txt === 'Take 3/3' && cf.w >= 44 && cf.h >= 44, JSON.stringify(cf));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'kw-takes-desktop.png') });
    await page.click('#cf-take');
    await page.waitForFunction(() => document.getElementById('cf-take').textContent === 'Take 1/3', null, { timeout: 5000 });
    check('Tipp auf „Take“ schaltet weiter (3 → 1)', await page.evaluate(() => { const c = window.loopwerk.store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes); return c.take === 0 && c.sampleId === c.takes[0]; }));
    await page.click('#cf-take');
    await page.click('#cf-take');
    await page.waitForFunction(() => document.getElementById('cf-take').textContent === 'Take 3/3', null, { timeout: 5000 });
    // Kiste (Desktop): die Takes eines Clips sind eine Gruppe „Aufnahme N · 3 Takes“ mit Zeilen „Take 1…3“, der spielende in Weißglut
    await page.evaluate(() => { const b = document.getElementById('tab-sounds'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
    const kiste = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.take-group')];
      const kids = [...document.querySelectorAll('.group-kid[data-take-clip]')];
      const { store } = window.loopwerk;
      const c = store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes);
      const on = kids.filter((k) => k.firstChild.classList.contains('take-on')).map((k) => k.dataset.takeIndex);
      const wb = kids.length ? getComputedStyle(kids[c.take].firstChild).boxShadow : '';
      return { groups: g.length, head: g[0]?.textContent, kids: kids.map((k) => k.querySelector('.loop-name').textContent), on, take: c.take, len: g[0]?.querySelector('.loop-len')?.textContent, shadow: wb, einzel: /Einzelklang/.test(g[0]?.textContent || '') };
    });
    check('Kiste: eine Gruppe „Aufnahme N · 3 Takes“, Länge „2 Takte“ (nicht Einzelklang)', kiste.groups === 1 && /^Aufnahme \d+ · 3 Takes/.test(kiste.head) && kiste.len === '2 Takte' && !kiste.einzel, JSON.stringify(kiste));
    check('Kiste: darunter „Take 1“ bis „Take 3“, nur der spielende (clip.take) in Weißglut', kiste.kids.join('|') === 'Take 1|Take 2|Take 3' && kiste.on.length === 1 && Number(kiste.on[0]) === kiste.take && kiste.shadow !== 'none', JSON.stringify(kiste));
    // Handy: ohne „Take 3/3“ in der Leiste; das Kennzeichen am Clip schaltet
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const b = document.getElementById('tab-sounds'); if (b.getAttribute('aria-pressed') === 'true') b.click(); });
    await page.evaluate((id) => window.loopwerk.ui.select(id), ctxTxt.clipId);
    await page.waitForFunction(() => { const b = document.getElementById('clip-float'); return b && !b.hidden; }, null, { timeout: 5000 });
    const hf = await page.evaluate(() => {
      const bar = document.getElementById('clip-float').getBoundingClientRect();
      const heads = [...document.querySelectorAll('.track-head')].map((h) => h.getBoundingClientRect()).filter((r) => r.width > 0);
      const hit = heads.some((r) => bar.left < r.right && bar.right > r.left && bar.top < r.bottom && bar.bottom > r.top);
      const tag = document.querySelector('.clip.selected .clip-take');
      const r = tag.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // Tippfläche: Punkte nahe den vier Rändern der 44-px-Fläche treffen das Kennzeichen
      const pts = [[-20, 0], [20, 0], [0, -20], [0, 20]].map(([dx, dy]) => { const e = document.elementFromPoint(cx + dx, cy + dy); if (!e?.closest('.clip-take')) window.__miss = (e?.className || e?.tagName) + '@' + dx + ',' + dy; return !!e?.closest('.clip-take'); });
      return { miss: window.__miss, take: document.getElementById('cf-take').hidden, hit, txt: tag.textContent, w: r.width, h: r.height, pts, bar: [Math.round(bar.left), Math.round(bar.right)], noScroll: document.documentElement.scrollWidth <= innerWidth };
    });
    check('Handy: „Take 3/3“ fehlt in der Leiste, Leiste und .track-head schneiden sich nicht, kein waagerechtes Scrollen', hf.take && !hf.hit && hf.noScroll, JSON.stringify(hf));
    check('Handy: Kennzeichen „3/3“ am Clip, Tippfläche 44 × 44 px', hf.txt === '3/3' && hf.w >= 44 && hf.h >= 44 && hf.pts.every(Boolean), JSON.stringify(hf));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'kw-takes-handy.png') });
    const tagPos = await page.evaluate(() => { const r = document.querySelector('.clip.selected .clip-take').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(tagPos.x, tagPos.y);
    await page.waitForFunction(() => document.querySelector('.clip.selected .clip-take')?.textContent === '1/3', null, { timeout: 5000 });
    check('Handy: ein Tipp auf „3/3“ schaltet den nächsten Take (3 → 1), Clip bleibt gewählt', await page.evaluate(() => { const c = window.loopwerk.store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes); return c.take === 0 && c.sampleId === c.takes[0] && window.loopwerk.ui.selectedClipId === c.id; }));
    await page.setViewportSize({ width: 400, height: 800 });
    await page.evaluate(() => { const { store, ui } = window.loopwerk; const c = store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes); store.setClipTake(c.id, 2); ui.select(null); const b = document.getElementById('tab-sounds'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); });
    await page.waitForTimeout(600);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'kw-kiste-takes-handy.png') });
    await page.evaluate(() => { const b = document.getElementById('tab-sounds'); if (b.getAttribute('aria-pressed') === 'true') b.click(); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await page.evaluate((id) => window.loopwerk.ui.select(id), ctxTxt.clipId);

    // Werkbank: Kopf „3 Takes“, Geste auf Farbe → alle Takes
    await page.evaluate(() => window.loopwerk.ui.setDock('werkbank'));
    await page.waitForSelector('#wb-count', { state: 'visible', timeout: 5000 });
    const head = await page.evaluate(() => document.getElementById('wb-count').textContent);
    check('Werkbank-Kopf: „3 Takes“ statt „in 1 Clip“', head === '3 Takes', head);
    const u0 = await page.evaluate(() => window.loopwerk.store.undoStack.length);
    await page.click('#wb-tab-farbe');
    await page.evaluate(() => { const i = document.getElementById('wb-lp'); i.value = '700'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    const geste = await page.evaluate(() => {
      const { store } = window.loopwerk;
      const c = store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes);
      return { lps: c.takes.map((id) => store.project.recipes?.[id]?.lp ?? null), steps: store.undoStack.length };
    });
    check('Werkbank-Geste (Dunkler) gilt für alle 3 Takes mit demselben Wert, ein Undo-Schritt', geste.lps.length === 3 && geste.lps.every((v) => v != null && v === geste.lps[0]) && geste.steps === u0 + 1, JSON.stringify({ geste, u0 }));
    await page.evaluate(() => window.loopwerk.store.undo());
    check('Undo nimmt die Geste von allen Takes', await page.evaluate(() => { const { store } = window.loopwerk; const c = store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes); return c.takes.every((id) => !store.project.recipes?.[id]); }));
    // Take löschen in den Feinheiten des Reiters Clip
    await page.click('#wb-tab-clip');
    await page.evaluate(() => { const b = document.getElementById('wb-fine-btn-clip'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
    const delVis = await page.evaluate(() => { const b = document.getElementById('wb-take-del'); const r = b?.getBoundingClientRect(); return b ? { txt: b.textContent, vis: !b.hidden && r.height > 0, h: r.height } : null; });
    check('Reiter Clip, Feinheiten: „Take 3 löschen“ sichtbar, ≥ 44 px', !!delVis && delVis.vis && delVis.h >= 44 && delVis.txt === 'Take 3 löschen', JSON.stringify(delVis));

    await page.click('#wb-take-del');
    await page.waitForFunction(() => window.loopwerk.store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes)?.takes.length === 2, null, { timeout: 5000 });
    const afterDel = await page.evaluate(() => { const c = window.loopwerk.store.project.tracks.flatMap((x) => x.clips).find((x) => x.takes); return { n: c.takes.length, take: c.take, ok: c.sampleId === c.takes[c.take], head: document.getElementById('wb-count').textContent }; });
    check('Take löschen: aus 3 werden 2, der Clip spielt einen der übrigen, Kopf „2 Takes“', afterDel.n === 2 && afterDel.ok && afterDel.head === '2 Takes', JSON.stringify(afterDel));
    // Ab hier ein stiller Song (das Mikrofon der Attrappe hört sonst den Loop)
    await page.evaluate(() => { const { store, ui } = window.loopwerk; ui.select(null); store.deleteClips(store.project.tracks.flatMap((t) => t.clips.map((c) => c.id))); });

    // Handy: Zeile per Lang-Drücken, Aufnahme-Reiter
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForTimeout(400);

    // Lang drücken auf ● (Maus): Zeile „Geräusch · Takes“, danach startet nichts von selbst
    await page.evaluate(() => { const { engine, store, ui } = window.loopwerk; ui.select(null); store.setLoop({ on: true, startBeat: 0, endBeat: 8 }); engine.play(0); });
    const rb = await page.evaluate(() => { const r = document.getElementById('rec-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
    check('● am Handy ≥ 44 px', rb.w >= 44 && rb.h >= 44, JSON.stringify(rb));
    await page.evaluate(() => window.loopwerk.ui.flash('Probe-Einblender'));
    await page.mouse.move(rb.x, rb.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    check('Nach 150 ms ist die Zeile noch zu', await page.evaluate(() => document.getElementById('rec-ctxrow').hidden));
    await page.waitForTimeout(450);
    await page.mouse.up();
    const row = await page.evaluate(() => {
      const r = document.getElementById('rec-ctxrow');
      const b = [...r.querySelectorAll('button')].map((x) => { const q = x.getBoundingClientRect(); return { t: x.textContent, w: q.width, h: q.height }; });
      const q = r.getBoundingClientRect();
      return { hidden: r.hidden, b, inView: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight, state: window.loopwerk.recorder.state, noScroll: document.documentElement.scrollWidth <= innerWidth };
    });
    check('Lang drücken (Maus, ~600 ms) öffnet „Geräusch · Takes“; Ziele ≥ 44 px, im Bild; es startet noch keine Aufnahme', !row.hidden && row.b.map((x) => x.t).join('|') === 'Geräusch|Takes' && row.b.every((x) => x.w >= 44 && x.h >= 44) && row.inView && row.state === 'idle', JSON.stringify(row));
    check('Handy: kein waagerechtes Scrollen', row.noScroll);
    const def = await page.evaluate(() => {
      const r = document.getElementById('rec-ctxrow').getBoundingClientRect();
      const h = document.getElementById('hint');
      const hr = h.getBoundingClientRect();
      const hidden = getComputedStyle(h).display === 'none';
      const sh = (id) => getComputedStyle(document.getElementById(id)).boxShadow;
      return { takes: sh('rec-ctx-takes'), sound: sh('rec-ctx-sound'), cls: document.getElementById('rec-ctx-takes').classList.contains('rec-ctx-def'), hidden, overlap: !hidden && hr.width > 0 && r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top };
    });
    check('Voreinstellung (Takes, Loop läuft) trägt die Weißglut-Linie, „Geräusch“ nicht', def.cls && def.takes !== 'none' && def.sound === 'none', JSON.stringify(def));
    check('Die Zeile liegt nicht auf dem Einblender (#hint)', !def.overlap, JSON.stringify(def));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'kw-rec-lang-handy.png') });
    await page.keyboard.press('Escape');
    check('Esc schließt die Zeile', await page.evaluate(() => document.getElementById('rec-ctxrow').hidden));
    // Tastatur: Umschalt+R öffnet sie, Fokus auf „Takes“; Esc zurück
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Shift+R');
    const kb = await page.evaluate(() => ({ hidden: document.getElementById('rec-ctxrow').hidden, focus: document.activeElement?.id }));
    check('Umschalt+R öffnet die Zeile, Fokus in der Zeile', !kb.hidden && kb.focus === 'rec-ctx-takes', JSON.stringify(kb));
    // Wahl „Geräusch“ startet sofort ein Einzelgeräusch (auch im laufenden Loop), Song läuft weiter
    const nOwn = await page.evaluate(() => window.loopwerk.library.list().filter((x) => x.category === 'own').length);
    await page.click('#rec-ctx-sound');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const sRun = await page.evaluate(() => { const { recorder, engine } = window.loopwerk; return { mode: recorder.mode, atWrap: recorder.atWrap, playing: engine.playing, row: document.getElementById('rec-ctxrow').hidden }; });
    check('Wahl „Geräusch“ startet sofort im Modus sound, Zeile schließt', sRun.mode === 'sound' && !sRun.atWrap && sRun.row, JSON.stringify(sRun));
    await page.evaluate(() => {
      const { engine } = window.loopwerk;
      const ctx = engine.ctx;
      const sr = ctx.sampleRate;
      const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(0.3 * sr), sampleRate: sr });
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 330 * i / sr) * Math.exp(-i / (0.08 * sr));
      const src = new AudioBufferSourceNode(ctx, { buffer: b });
      src.connect(window.__mock.extra);
      src.start(ctx.currentTime + 0.4);
    });
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    const lang = await page.evaluate(async (n) => {
      const { library, store } = window.loopwerk;
      const own = library.list().filter((x) => x.category === 'own');
      const sel = window.loopwerk.ui.selectedClipId && store.findClip(window.loopwerk.ui.selectedClipId)?.clip;
      const smp = sel && await library.ensure(sel.sampleId);
      let peak = 0;
      if (smp?.orig) for (let c = 0; c < smp.orig.numberOfChannels; c++) for (const v of smp.orig.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
      return { added: own.length - n, takes: !!sel?.takes, dur: smp?.orig?.duration, peak };
    }, nOwn);
    check('Lang drücken → „Geräusch“ → ein gesäubertes Einzelgeräusch (kurz, Spitze 0,89, kein Take)', lang.added === 1 && !lang.takes && lang.dur < 1.2 && Math.abs(lang.peak - 0.89) <= 0.01, JSON.stringify(lang));

    // Kurzer Tipp unverändert: im laufenden Loop beginnt ● mit Takes (wartet auf den Sprung, Ring, dann gefüllt)
    await page.evaluate(() => { const { engine, store, ui } = window.loopwerk; ui.select(null); store.setLoop({ on: true, startBeat: 0, endBeat: 8 }); engine.play(0); });
    await page.waitForFunction(() => document.getElementById('rec-ctx')?.textContent === 'Takes', null, { timeout: 5000 });
    await page.evaluate(() => {
      window.__count = [];
      const e = document.getElementById('rec-ctx');
      const note = () => { const t = e.textContent; const b = window.loopwerk.engine.heardBeat(); if (window.__count[window.__count.length - 1]?.t !== t) window.__count.push({ t, b }); };
      new MutationObserver(note).observe(e, { childList: true, characterData: true, subtree: true });
    });
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    const wait = await page.evaluate(() => { const b = document.getElementById('rec-btn'); const r = window.loopwerk.recorder; return { waiting: r.waiting, cls: b.classList.contains('rec-wait'), txt: document.getElementById('rec-ctx').textContent, bg: getComputedStyle(b).backgroundColor }; });
    check('Kurzer Tipp im Loop: Takes, wartet auf den Sprung (Ring am ●, Text „wartet …“)', wait.waiting && wait.cls && wait.txt === 'wartet …' && /rgba\(0, 0, 0, 0\)|transparent/.test(wait.bg), JSON.stringify(wait));
    if (SHOTS) { await page.waitForFunction(() => document.getElementById('rec-ctx').textContent === '3', null, { timeout: 15000, polling: 10 }).catch(() => null); await page.screenshot({ path: path.join(SHOT_DIR, 'kw-zaehlen-handy.png') }); }
    await page.waitForFunction(() => window.loopwerk.recorder.songStartTime != null, null, { timeout: 15000, polling: 20 });
    const cnt = await page.evaluate(() => window.__count.map((x) => `${x.t}@${x.b.toFixed(1)}`));
    const seq = cnt.map((x) => x.split('@')[0]);
    const nums = seq.filter((x) => /^\d$/.test(x)).join('');
    check('Ring zählt im letzten Takt vor dem Sprung „4 · 3 · 2 · 1“, vorher „wartet …“', nums === '4321' && seq.indexOf('4') > seq.indexOf('wartet …') && cnt.filter((x) => /^[1-4]@/.test(x)).every((x) => parseFloat(x.split('@')[1]) >= 3.9), cnt.join(' '));
    const run = await page.evaluate(() => ({ cls: document.getElementById('rec-btn').classList.contains('rec-wait'), txt: document.getElementById('rec-ctx').textContent }));
    check('Nach dem ersten Sprung gefüllt, Text wieder „Takes“', !run.cls && run.txt === 'Takes', JSON.stringify(run));
    await page.click('#rec-btn');
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await page.evaluate(() => window.loopwerk.engine.stop());

    // Reiter „Aufnahme“ der Song-Werkbank (Handy): Eingang, Latenz ±, Einmessen; am ● kein Klappfeld
    await page.evaluate(() => window.loopwerk.ui.openSong());
    await page.waitForSelector('#sb-tab-aufnahme', { state: 'visible', timeout: 5000 });
    await page.click('#sb-tab-aufnahme');
    await page.waitForFunction(() => /ms/.test(document.getElementById('rs-lat')?.textContent || ''), null, { timeout: 5000 });
    const at = await page.evaluate(() => {
      const q = (id) => { const e = document.getElementById(id); const r = e?.getBoundingClientRect(); return e ? { in: !!e.closest('#sb-panel-aufnahme'), w: r.width, h: r.height } : null; };
      const stop = document.getElementById('sb-autostop');
      const box = document.getElementById('rec-setup');
      return { box: !!box?.closest('#sb-panel-aufnahme'), lat: document.getElementById('rs-lat').textContent, cal: q('rs-cal'), minus: q('rs-minus'), plus: q('rs-plus'), stopIn: !!stop?.closest('#sb-panel-aufnahme'),
        popEmpty: document.getElementById('rec-pop').children.length === 0, scroll: document.documentElement.scrollWidth <= innerWidth };
    });
    check('Reiter Aufnahme: Latenz in ms, Einmessen und ± (≥ 44 px) dort, neben „Stopp nach Stille“', at.box && at.stopIn && /\d+ ms/.test(at.lat) && at.cal.in && at.cal.h >= 44 && at.minus.h >= 44 && at.plus.h >= 44, JSON.stringify(at));
    check('Das Feld sitzt nicht mehr am ● (Klappfeld leer), Handy ohne waagerechtes Scrollen', at.popEmpty && at.scroll, JSON.stringify(at));
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'kw-aufnahme-reiter-handy.png') });
    await page.evaluate(() => window.loopwerk.ui.setDock(null));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    // Desktop: Reiter Aufnahme in der Song-Werkbank (rechte Spalte), nicht im Klappfeld
    await page.evaluate(() => window.loopwerk.ui.openSong());
    await page.waitForSelector('#sb-tab-aufnahme', { state: 'visible', timeout: 5000 });
    await page.click('#sb-tab-aufnahme');
    const dk = await page.evaluate(() => ({ box: !!document.getElementById('rec-setup')?.closest('#sb-panel-aufnahme'), more: getComputedStyle(document.getElementById('rec-more')).display }));
    check('Desktop: Feld im Reiter Aufnahme; ▾ am ● bleibt unsichtbar (Zwilling)', dk.box && dk.more === 'none', JSON.stringify(dk));
    await page.evaluate(() => window.loopwerk.ui.setDock(null));

    // ===== 3. Ohne Loop: gesäubertes Einzelgeräusch =====
    await page.evaluate(() => { const { store, engine } = window.loopwerk; engine.stop(); store.setLoop({ on: false }); engine.setPosition(16); });
    const ctxNoLoop = await page.evaluate(() => window.loopwerk.record.context());
    check('Kontext ohne Loop → „sound“', ctxNoLoop === 'sound', ctxNoLoop);
    const before = await page.evaluate(() => window.loopwerk.library.list().filter((s) => s.category === 'own').length);
    await page.evaluate(() => document.getElementById('rec-btn').click());
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'recording', null, { timeout: 10000 });
    await page.evaluate(() => {
      const { engine } = window.loopwerk;
      const ctx = engine.ctx;
      const sr = ctx.sampleRate;
      const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(0.3 * sr), sampleRate: sr });
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 330 * i / sr) * Math.exp(-i / (0.08 * sr));
      const s = new AudioBufferSourceNode(ctx, { buffer: b });
      s.connect(window.__mock.extra);
      s.start(ctx.currentTime + 0.4);
    });
    await page.waitForFunction(() => window.loopwerk.recorder.state === 'idle', null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const snd = await page.evaluate(async (n) => {
      const { library, recorder } = window.loopwerk;
      const own = library.list().filter((s) => s.category === 'own');
      const s = own.find((x) => !/Take/.test(x.name) && x.from === 'mic') ?? own[own.length - 1];
      const full = s && await library.ensure(s.id);
      let peak = 0;
      if (full?.orig) for (let c = 0; c < full.orig.numberOfChannels; c++) for (const v of full.orig.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
      return { added: own.length - n, mode: recorder.mode, name: s?.name, dur: full?.orig?.duration, peak, cleanMs: recorder.cleanMs };
    }, before);
    check('Ohne Loop: ein gesäubertes Geräusch (kurz, Spitze 0,89, nicht Loop-lang)', snd.added === 1 && snd.mode === 'sound' && snd.dur < 1.2 && Math.abs(snd.peak - 0.89) <= 0.01 && !/Take/.test(snd.name), JSON.stringify(snd));

    check('Keine Konsolenfehler', app.errors.length === 0, app.errors.join(' | '));
  } catch (err) {
    check('Test lief ohne Ausnahme', false, err.stack || err.message);
  } finally {
    await app.close();
  }
  finish();
})();
