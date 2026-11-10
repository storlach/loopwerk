// Audio-Last. Aufruf: node m4-audio.cjs <nodes|render|capacity|ticks|gaps|export> [cpu]
const { start, launch, newPage, stats, fmt, load, sleep } = require('./lib.cjs');
const S = require('./scen.cjs');
const part = process.argv[2] || 'nodes';
const cpu = Number(process.argv[3] || 1);

// Zählt erzeugte Audio-Knoten je Art (vor dem Laden einhängen)
function countNodes() {
  const c = window.__nodes = {};
  const bump = (k) => { c[k] = (c[k] || 0) + 1; };
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!/^create(?!Buffer$|PeriodicWave$)/.test(k)) continue;
    const orig = BaseAudioContext.prototype[k];
    if (typeof orig !== 'function') continue;
    BaseAudioContext.prototype[k] = function (...a) { bump(k.slice(6)); return orig.apply(this, a); };
  }
  for (const name of ['AudioWorkletNode', 'GainNode', 'AudioBufferSourceNode', 'BiquadFilterNode', 'DelayNode', 'ConvolverNode', 'WaveShaperNode', 'DynamicsCompressorNode', 'StereoPannerNode', 'OscillatorNode', 'ConstantSourceNode', 'AnalyserNode']) {
    const O = window[name]; if (!O) continue;
    window[name] = new Proxy(O, { construct(t, args, nt) { bump('new ' + name); return Reflect.construct(t, args, nt); } });
  }
  window.__nodeSum = () => Object.values(c).reduce((a, b) => a + b, 0);
  window.__nodeReset = () => { for (const k of Object.keys(c)) delete c[k]; };
}

const CONFIGS = [
  { name: 'ohne Effekte', fx: false, sends: false, mastering: false },
  { name: 'alle 7 Effekte je Spur', fx: true, sends: false, mastering: false },
  { name: 'alle Effekte + Sends Hall/Echo', fx: true, sends: true, mastering: false },
  { name: 'alle Effekte + Sends + Mastering', fx: true, sends: true, mastering: true },
];

async function open(browser, srv, opts = {}) {
  const p = await newPage(browser, { cpu, ...opts, init: countNodes });
  // Licht aus (Attrappe): die Software-Grafik im Headless blockiert sonst den Hauptthread und verfälscht Scheduler-Messungen
  if (process.env.GLOW !== '1' && (part === 'ticks' || part === 'gaps' || part === 'export')) {
    await p.page.route('**/src/ui/glow.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export function mountGlow(){ return { state: {}, setQuality(){}, readRoom(){ return { data: new Uint8Array(4), W: 1, H: 1 }; } }; }' }));
  }
  await p.page.goto(srv.origin + '/');
  await p.page.waitForFunction(() => window.loopwerk?.ready, null, { timeout: 120000 });
  await sleep(500);
  return p;
}

(async () => {
  const srv = await start({ h2: false });
  const browser = await launch(['--enable-blink-features=AudioContextPlaybackStats', '--enable-features=AudioContextPlaybackStats']);
  console.log('##', part, 'cpu', cpu, '· Last', load());

  if (part === 'nodes') {
    let page;
    for (const tracks of (process.env.ONLY16 ? [16] : [4, 8, 16])) for (const cfg of CONFIGS) {
      const o = await open(browser, srv); page = o.page;
      const r = await page.evaluate(async ({ tracks, cfg, big }) => {
        const f = new Function('return (' + big + ')')();
        await f({ tracks, clips: tracks * 4, bars: 16, ...cfg });
        const { store } = window.loopwerk;
        const { buildMix, loadFxWorklet } = await import('/src/engine.js');
        const times = []; let nodes = null;
        for (let i = 0; i < 5; i++) {
          const ctx = new OfflineAudioContext(2, 44100, 44100);
          const worklets = await loadFxWorklet(ctx);
          window.__nodeReset();
          const t0 = performance.now();
          buildMix(ctx, store.project, { worklets });
          times.push(performance.now() - t0);
          nodes = { sum: window.__nodeSum(), kinds: { ...window.__nodes } };
        }
        times.sort((a, b) => a - b);
        return { buildMs: +times[2].toFixed(1), min: +times[0].toFixed(1), max: +times[4].toFixed(1), nodes };
      }, { tracks, cfg, big: S.bigSong.toString() }).catch((e) => ({ err: e.message.split('\n')[0] }));
      if (r.err) { console.log(`${tracks} Spuren · ${cfg.name}: ${r.err}`); continue; }
      console.log(`${String(tracks).padStart(2)} Spuren · ${cfg.name.padEnd(34)} Knoten ${String(r.nodes.sum).padStart(4)} · buildMix ${r.buildMs} ms (${r.min}–${r.max}) · ${JSON.stringify(r.nodes.kinds)}`);
    }
    // je Stimme
    const v = await page.evaluate(async () => {
      const { startVoice } = await import('/src/engine.js');
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const buf = new AudioBuffer({ numberOfChannels: 2, length: 44100, sampleRate: 44100 });
      window.__nodeReset(); startVoice(ctx, ctx.destination, buf, 0, 0, 1, null); const plain = window.__nodeSum();
      window.__nodeReset(); startVoice(ctx, ctx.destination, buf, 0, 0, 1, { points: [[0, 1]] }); const env = window.__nodeSum();
      return { plain, env };
    }).catch((e) => ({ err: e.message }));
    console.log('Knoten je Stimme (ohne/mit Hüllkurve):', JSON.stringify(v));
    // Echtzeit-Kontext: Aufbau beim ersten Play (Beispiel-Arrangement)
    await page.evaluate(() => window.__nodeReset());
    const first = await page.evaluate(async () => { const { engine } = window.loopwerk; const t0 = performance.now(); await engine._ensure(); return { ms: +(performance.now() - t0).toFixed(0), nodes: window.__nodeSum(), kinds: { ...window.__nodes }, sr: engine.ctx.sampleRate, base: engine.ctx.baseLatency, out: engine.ctx.outputLatency, cap: 'renderCapacity' in engine.ctx, stats: 'playbackStats' in engine.ctx }; });
    console.log('Erster Aufbau des Ton-Kontexts (Mess-Song 16 Spuren, alles an):', JSON.stringify(first));
  }

  if (part === 'render') {
    const { page } = await open(browser, srv);
    for (const tracks of [4, 8, 16]) for (const cfg of CONFIGS) {
      const r = await page.evaluate(async ({ tracks, cfg, big }) => {
        const f = new Function('return (' + big + ')')();
        // 16 Takte, jede Spur durchgehend belegt (4 Clips zu 4 Takten)
        await f({ tracks, clips: tracks * 4, bars: 16, ...cfg });
        const { store, library, renderProject } = window.loopwerk;
        const times = [];
        let dur = 0;
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const out = await renderProject(store.project, library, {});
          times.push(performance.now() - t0);
          dur = out.duration;
        }
        times.sort((a, b) => a - b);
        return { dur, med: times[1], min: times[0], max: times[2] };
      }, { tracks, cfg, big: S.bigSong.toString() });
      console.log(`${String(tracks).padStart(2)} Spuren · ${cfg.name.padEnd(34)} ${r.dur.toFixed(0)} s Audio in ${r.med.toFixed(0)} ms (${r.min.toFixed(0)}–${r.max.toFixed(0)}) → ${(100 * r.min / 1000 / r.dur).toFixed(1)} % eines Kerns (bester Lauf), ${(r.dur * 1000 / r.min).toFixed(0)}× Echtzeit`);
    }
  }

  if (part === 'perfx') {
    // Was kostet welcher Effekt? 8 Spuren, 8 Takte (16 s), je Lauf nur ein Effekt auf allen Spuren; bester von 2 Läufen
    const { page } = await open(browser, srv);
    const cases = [['ohne Effekte', []], ['Verzerrer', ['drive']], ['Filter', ['filter']], ['EQ', ['eq']], ['Kompressor', ['comp']], ['Pumpen', ['pump']], ['Echo', ['echo']], ['Hall (je Spur)', ['hall']], ['Hall nur als Send-Bus (ein Hall für alle)', ['@hall']], ['alle 7 je Spur', ['drive', 'filter', 'eq', 'comp', 'pump', 'echo', 'hall']], ['alle außer Hall', ['drive', 'filter', 'eq', 'comp', 'pump', 'echo']]];
    for (const tracks of [8, 16]) for (const [name, list] of cases) {
      if (tracks === 16 && !['ohne Effekte', 'alle 7 je Spur', 'Hall (je Spur)', 'Hall nur als Send-Bus (ein Hall für alle)'].includes(name)) continue;
      const r = await page.evaluate(async ({ tracks, list, big }) => {
        const f = new Function('return (' + big + ')')();
        await f({ tracks, clips: tracks * 2, bars: 8 });
        const { store, library, renderProject } = window.loopwerk;
        for (const t of store.project.tracks) for (const id of list) { if (id === '@hall') store.setSend(t.id, 'hall', 0.4); else store.setTrackFx(t.id, id, { on: true }); }
        const times = []; let dur = 0;
        for (let i = 0; i < 2; i++) { const t0 = performance.now(); const out = await renderProject(store.project, library, {}); times.push(performance.now() - t0); dur = out.duration; }
        return { dur, min: Math.min(...times), max: Math.max(...times) };
      }, { tracks, list, big: S.bigSong.toString() });
      console.log(`${String(tracks).padStart(2)} Spuren · ${name.padEnd(42)} ${r.dur.toFixed(0)} s Audio in ${r.min.toFixed(0)} ms (schlechter: ${r.max.toFixed(0)}) → ${(100 * r.min / 1000 / r.dur).toFixed(1)} % eines Kerns`);
    }
  }

  if (part === 'thresh') {
    // Ab wann setzt der Ton aus? Echtzeit-Wiedergabe, 16 Spuren laufen; n davon mit Effekt. Aussetzer aus AudioContext.playbackStats
    for (const [name, fx] of [['Hall je Spur', ['hall']], ['Verzerrer', ['drive']], ['Kompressor', ['comp']], ['Hall + Kompressor + EQ', ['hall', 'comp', 'eq']]]) {
      for (const n of [0, 2, 4, 6, 8, 12, 16]) {
        if (n === 0 && name !== 'Hall je Spur') continue;
        const { page, ctx } = await open(browser, srv);
        const r = await page.evaluate(async ({ n, fx, big }) => {
          const f = new Function('return (' + big + ')')();
          await f({ tracks: 16, clips: 64, bars: 16 });
          const { store, engine } = window.loopwerk;
          store.project.tracks.slice(0, n).forEach((t) => { for (const id of fx) store.setTrackFx(t.id, id, { on: true }); });
          await engine._ensure();
          const ps = engine.ctx.playbackStats;
          const read = () => ({ u: ps.underrunDuration ?? ps.fallbackFramesDuration, e: ps.underrunEvents ?? ps.fallbackFramesEvents, t: ps.totalDuration ?? ps.totalFramesDuration });
          engine.setPosition(0); await engine.play();
          await new Promise((r) => setTimeout(r, 1500));
          const a = read();
          await new Promise((r) => setTimeout(r, 6000));
          const b = read();
          engine.pause();
          return { under: b.u - a.u, events: b.e - a.e, total: b.t - a.t };
        }, { n, fx, big: S.bigSong.toString() });
        console.log(`${name.padEnd(24)} auf ${String(n).padStart(2)} von 16 Spuren: Aussetzer ${(1000 * r.under).toFixed(0)} ms in ${r.total.toFixed(1)} s (${r.events} Ereignisse) = ${(100 * r.under / r.total).toFixed(1)} %`);
        await ctx.close();
      }
    }
  }

  if (part === 'capacity') {
    const { page } = await open(browser, srv);
    for (const tracks of [8, 16]) for (const cfg of [CONFIGS[0], CONFIGS[2], CONFIGS[3]]) {
      const r = await page.evaluate(async ({ tracks, cfg, big }) => {
        const f = new Function('return (' + big + ')')();
        await f({ tracks, clips: tracks * 4, bars: 16, ...cfg });
        const { engine } = window.loopwerk;
        await engine._ensure();
        const ctx = engine.ctx;
        const ups = [];
        if (ctx.renderCapacity) { ctx.renderCapacity.onupdate = (e) => ups.push({ avg: e.averageLoad, peak: e.peakLoad, under: e.underrunRatio }); ctx.renderCapacity.start({ updateInterval: 1 }); }
        const s0 = ctx.playbackStats ? { u: ctx.playbackStats.underrunDuration ?? ctx.playbackStats.fallbackFramesDuration, n: ctx.playbackStats.underrunEvents ?? ctx.playbackStats.fallbackFramesEvents, t: ctx.playbackStats.totalDuration ?? ctx.playbackStats.totalFramesDuration } : null;
        engine.setPosition(0); await engine.play();
        await new Promise((r) => setTimeout(r, 8000));
        engine.pause();
        const s1 = ctx.playbackStats ? { u: ctx.playbackStats.underrunDuration ?? ctx.playbackStats.fallbackFramesDuration, n: ctx.playbackStats.underrunEvents ?? ctx.playbackStats.fallbackFramesEvents, t: ctx.playbackStats.totalDuration ?? ctx.playbackStats.totalFramesDuration } : null;
        ctx.renderCapacity?.stop();
        return { cap: !!ctx.renderCapacity, ups: ups.slice(1), stats: s0 && { underrunS: s1.u - s0.u, events: s1.n - s0.n, total: s1.t - s0.t }, voices: engine.voices.size };
      }, { tracks, cfg, big: S.bigSong.toString() });
      const avg = r.ups.length ? r.ups.reduce((a, u) => a + u.avg, 0) / r.ups.length : null;
      const peak = r.ups.length ? Math.max(...r.ups.map((u) => u.peak)) : null;
      console.log(`${String(tracks).padStart(2)} Spuren · ${cfg.name.padEnd(34)} renderCapacity ${r.cap ? `mittel ${(100 * avg).toFixed(0)} % · Spitze ${(100 * peak).toFixed(0)} % · Unterläufe ${r.ups.reduce((a, u) => a + u.under, 0).toFixed(3)}` : 'nicht verfügbar'} · playbackStats ${JSON.stringify(r.stats)}`);
    }
  }

  if (part === 'ticks') {
    for (const clips of [8, 200, 448, 1000]) {
      const rs = [];
      for (let i = 0; i < 3; i++) {
        const { page, ctx } = await open(browser, srv);
        const info = clips === 8 ? { clips: 8 } : await page.evaluate(S.bigSong, { tracks: 16, clips });
        await page.evaluate(S.watchTicks);
        await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
        await sleep(600);
        await page.evaluate(S.resetTicks);
        await sleep(4000);
        const t = await page.evaluate(S.readTicks);
        const playMs = await page.evaluate(async () => { const { engine } = window.loopwerk; engine.pause(); await new Promise((r) => setTimeout(r, 100)); const t0 = performance.now(); await engine.play(8); const d = performance.now() - t0; engine.pause(); return d; });
        rs.push({ ...t, playMs, json: info.json });
        await ctx.close();
      }
      const m = (k) => fmt(stats(rs.map((r) => r[k]), 2));
      console.log(`${String(clips).padStart(4)} Clips · Tick Median ${m('durMed')} ms · p95 ${m('durP95')} · max ${m('durMax')} · Abstand max ${m('gapMax')} ms · verspätet ${m('late')} · play() ${m('playMs')} ms`);
    }
  }

  if (part === 'gaps') {
    // Arbeit im Hauptthread während der Wiedergabe (großer Song, Licht aus, damit die Software-Grafik nicht mitmisst)
    const jobs = {
      'nichts (Vergleich)': async () => { await new Promise((r) => setTimeout(r, 1500)); },
      'Clip verschieben ×5': async () => { const { store } = window.loopwerk; for (let i = 0; i < 5; i++) { const c = store.project.tracks[3].clips[5]; store.moveClip(c.id, 't4', c.startBeat + 4, { copy: false }); await new Promise((r) => setTimeout(r, 200)); } },
      'Rückgängig ×5': async () => { const { store } = window.loopwerk; for (let i = 0; i < 5; i++) { store.undo(); await new Promise((r) => setTimeout(r, 200)); } },
      'Zoom ×6': async () => { const { arranger } = window.loopwerk; for (const v of [32, 48, 64, 48, 32, 24]) { arranger.zoomTo(v); await new Promise((r) => setTimeout(r, 200)); } },
      'Mixer öffnen/schließen ×3': async () => { const { ui } = window.loopwerk; for (let i = 0; i < 3; i++) { ui.setDock('mixer'); await new Promise((r) => setTimeout(r, 300)); ui.setDock(null); await new Promise((r) => setTimeout(r, 300)); } },
      'Tempo 120→133': async () => { const { store, tempo } = window.loopwerk; store.setBpm(133); const t0 = performance.now(); while (tempo.busy && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 20)); },
      'Speichern (localStorage) ×5': async () => { const { store } = window.loopwerk; for (let i = 0; i < 5; i++) { localStorage.setItem('loopwerk.project.v1', JSON.stringify(store.project)); await new Promise((r) => setTimeout(r, 200)); } },
      'Spur-Effekt einschalten ×4': async () => { const { store } = window.loopwerk; for (const id of ['hall', 'echo', 'comp', 'filter']) { store.setTrackFx('t2', id, { on: true }); await new Promise((r) => setTimeout(r, 250)); } },
      'Mastering an (Analyse im Hintergrund)': async () => { const { store, mastering } = window.loopwerk; store.setMastering({ on: true }); const t0 = performance.now(); await new Promise((r) => setTimeout(r, 1500)); while (mastering.state?.busy && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50)); window.__mst = performance.now() - t0; },
    };
    for (const [name, job] of Object.entries(jobs)) {
      const rs = [];
      for (let i = 0; i < 3; i++) {
        const { page, ctx } = await open(browser, srv);
        await page.evaluate(S.bigSong, { tracks: 16, clips: 448 });
        await page.evaluate(S.watchTicks);
        await page.evaluate(() => { window.loopwerk.engine.setPosition(8); return window.loopwerk.engine.play(); });
        await sleep(1000);
        await page.evaluate(S.resetTicks);
        await page.evaluate(() => { window.__ltMark = performance.now(); });
        const t0 = Date.now();
        await page.evaluate(async (src) => { await (new Function('return (' + src + ')')())(); }, job.toString());
        const t = await page.evaluate(S.readTicks);
        const lt = await page.evaluate(() => { const l = window.__lt.filter((e) => e.s >= window.__ltMark); return { n: l.length, sum: Math.round(l.reduce((a, e) => a + e.d, 0)), max: Math.round(Math.max(0, ...l.map((e) => e.d))), mst: window.__mst }; });
        rs.push({ ...t, ltN: lt.n, ltSum: lt.sum, ltMax: lt.max, wall: Date.now() - t0, mst: lt.mst ?? 0 });
        await ctx.close();
      }
      const m = (k) => fmt(stats(rs.map((r) => r[k]), 0));
      console.log(`${name.padEnd(40)} Tick-Abstand max ${m('gapMax')} ms · >125 ms: ${m('over125')} · verspätet ${m('late')} (bis ${m('lateMax')} ms) · lange Aufgaben ${m('ltN')}, längste ${m('ltMax')} ms${rs[0].mst ? ' · Analyse ' + m('mst') + ' ms' : ''}`);
    }
  }

  if (part === 'export') {
    for (const what of ['wav', 'mp3', 'stems', 'wav+mastering']) {
      const rs = [];
      for (let i = 0; i < 3; i++) {
        const { page, ctx } = await open(browser, srv);
        const r = await page.evaluate(async (what) => {
          const { store, library } = window.loopwerk;
          // Beispiel-Arrangement auf 56 Takte verlängern: alle Clips bis Takt 56 ziehen
          store.setLength(56);
          for (const t of store.project.tracks) for (const c of t.clips) if (c.lengthBeats >= 16) store.resizeClip(c.id, 56 * 4 - c.startBeat);
          if (what === 'wav+mastering') store.setMastering({ on: true });
          await library.ensureProject(store.project);
          const ex = await import('/src/export.js');
          await new Promise((r) => setTimeout(r, 300));
          window.__startFrames();
          const t0 = performance.now();
          const res = what === 'stems' ? await ex.exportStems(store.project, library, { format: 'wav' }) : await ex.exportSong(store.project, library, { format: what === 'mp3' ? 'mp3' : 'wav' });
          const ms = performance.now() - t0;
          const f = window.__stopFrames();
          // Datei = Kodierung desselben Renders im Hauptthread (alter Weg)? Dazu Prüfsummen eines festen Testsignals
          const sha = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
          let same = null;
          if (res.audio) {
            const { encodeWav } = await import('/src/wav.js');
            const ref = what === 'mp3' ? await ex.encodeMp3(res.audio, { worker: false }) : encodeWav(res.audio);
            same = (await sha(ref)) === (await sha(res.blob));
          }
          return { ms, dur: res.duration, size: res.blob.size, stems: res.stems?.length, fps: f.fps, max: f.max, lt: f.lt, ltSum: f.ltSum, ltMax: f.ltMax, same };
        }, what);
        rs.push(r);
        await ctx.close();
      }
      const m = (k, d = 0) => fmt(stats(rs.map((r) => r[k]), d));
      console.log(`${what.padEnd(14)} ${rs[0].dur.toFixed(0)} s Audio${rs[0].stems ? ` · ${rs[0].stems} Spuren` : ''} · ${(rs[0].size / 1e6).toFixed(1)} MB · Dauer ${m('ms')} ms · dabei ${m('fps', 1)} Bilder/s, längstes Bild ${m('max')} ms · lange Aufgaben ${m('lt')}, Summe ${m('ltSum')} ms, längste ${m('ltMax')} ms${rs[0].same == null ? '' : ` · gleich wie Hauptthread: ${rs.every((r) => r.same) ? 'ja' : 'NEIN'}`}`);
    }
    // Prüfsummen eines festen Testsignals (10 s, zwei Sinus): vorher/nachher vergleichen = bitgleich
    const { page, ctx } = await open(browser, srv);
    const ref = await page.evaluate(async () => {
      const ex = await import('/src/export.js');
      const { encodeWav } = await import('/src/wav.js');
      const sr = 44100; const n = 10 * sr;
      const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = 0.6 * Math.sin(2 * Math.PI * (220 + 110 * c) * i / sr) + 0.5 * Math.sin(i / 7000) * Math.sin(2 * Math.PI * 3000 * i / sr); }
      const sha = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const out = { mp3: await sha(await ex.encodeMp3(b)), wav16: await sha(encodeWav(b)), wav24: await sha(encodeWav(b, { bits: 24 })) };
      if (ex.encodeWavJob) out.wavJob16 = await sha((await ex.encodeWavJob(b)).blob);
      return out;
    });
    console.log('Prüfsummen Testsignal (vorher/nachher gleich = bitgleich):', JSON.stringify(ref));
    await ctx.close();
  }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
