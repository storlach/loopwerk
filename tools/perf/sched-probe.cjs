// Scheduler-Probe (läuft im Browser, page.evaluate): Mess-Song mit einer Rampe als Sound (jeder Wert verrät die
// Stelle in der Musik), Abgriff am Kanalzug der Spur über ein Worklet. Misst, ob und wann die Wiedergabe von der
// erwarteten Stelle abweicht – nach einer Live-Änderung (Reaktion) oder nach einer Blockade des Hauptthreads.
// Benutzt von tools/perf/m9-scheduler.cjs und tests/perf-audio.test.cjs.
//
// kind: 'block' (Hauptthread block s lang belegt, ein Einsatz fällt kurz vor ihr Ende), 'mute', 'fader', 'move',
// 'stop', 'loop' (Loop-Ende d s vor der Marke gesetzt). Ergebnis in Sekunden:
//   react = letzte Abweichung nach dem Aufruf (wie lange es dauert, bis die Änderung vollständig hörbar ist)
//   bad   = Dauer, in der etwas anderes klingt als erwartet (falsche Stelle oder Stille)
//   silent = davon Stille, misplaced = davon falsche Stelle
async function schedProbe({ kind, block = 0.4, d = 0.1 }) {
  const { store, library, engine } = window.loopwerk;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SR0 = 44100;
  if (!library.get('m9-ramp')) {
    const len = SR0; // 2 Schläge bei 120 bpm
    const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SR0 });
    for (let c = 0; c < 2; c++) { const x = buf.getChannelData(c); for (let i = 0; i < len; i++) x[i] = 0.1 + 0.8 * i / len; }
    library.register({ id: 'm9-ramp', name: 'Rampe', category: 'fx', lengthBeats: 2, bpm: 120, buffer: buf });
  }
  if (engine.playing) engine.stop();
  store.replace({
    version: 1, name: 'm9', bpm: 120, beatsPerBar: 4, lengthBars: 128, loop: { on: false, startBeat: 0, endBeat: 16 },
    tracks: [{ id: 't1', name: 'Rampe', volume: 1, pan: 0, mute: false, solo: false, clips: [{ id: 'c1', sampleId: 'm9-ramp', startBeat: 0, lengthBeats: 480, offsetBeats: 0 }] }],
  });
  await engine._ensure();
  const ctx = engine.ctx;
  const sr = ctx.sampleRate;
  if (!window.__m9cap) {
    const code = `class C extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(4096);this.n=0;this.f=0;}
process(i){const x=i[0]&&i[0][0];if(this.n===0)this.f=currentFrame;if(x)this.b.set(x,this.n);else this.b.fill(0,this.n,this.n+128);this.n+=128;
if(this.n>=4096){this.port.postMessage({f:this.f,d:this.b},[this.b.buffer]);this.b=new Float32Array(4096);this.n=0;}return true;}}
registerProcessor('m9-cap',C);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    window.__m9cap = true;
  }
  const node = new AudioWorkletNode(ctx, 'm9-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
  const chunks = [];
  node.port.onmessage = (e) => chunks.push(e.data);
  const strip = engine.mix.tracks.get('t1');
  strip.input.connect(node);
  node.connect(ctx.destination);
  const spb = 0.5;
  await engine.play(0);
  const t0 = engine.anchors[0].time;
  await sleep(1200);
  const frac = (x) => x - Math.floor(x);
  const ramp = (b) => 0.1 + 0.8 * frac(b / 2);
  const nearEdge = (b) => { const f = frac(b / 2); return f < 0.014 || f > 0.986; }; // ±14 ms um eine Wiederholung
  let tCall = 0;
  let expect = null;   // (t) => { v, guard }
  const lin = (t) => (t - t0) / spb;
  if (kind === 'block') {
    // nächste Wiederholung, die (block − 0,05) s nach Beginn der Blockade einsetzt
    const lead = block - 0.05;
    const now = ctx.currentTime;
    const bb = Math.ceil(lin(now + lead + 0.15) / 2) * 2;
    const tStart = t0 + bb * spb - lead;
    const wait = (tStart - ctx.currentTime) * 1000;
    await sleep(Math.max(0, wait - 60));
    const p0 = performance.now();
    const rest = (tStart - ctx.currentTime) * 1000;
    while (performance.now() - p0 < rest) { /* bis zum Beginn */ }
    tCall = ctx.currentTime;
    const p1 = performance.now();
    while (performance.now() - p1 < block * 1000) { /* Hauptthread belegt */ }
    expect = (t) => { const b = lin(t); return { v: ramp(b), guard: nearEdge(b) }; };
  } else {
    // Mitten in einer Wiederholung ändern (nicht an einer Kante)
    while (frac(lin(ctx.currentTime) / 2) > 0.5) await sleep(20);
    tCall = ctx.currentTime;
    if (kind === 'mute') { store.setTrack('t1', { mute: true }); expect = () => ({ v: 0 }); }
    if (kind === 'fader') { store.setTrack('t1', { volume: 0.5 }); expect = (t) => { const b = lin(t); return { v: 0.5 * ramp(b), guard: nearEdge(b) }; }; }
    if (kind === 'stop') { engine.stop(); expect = () => ({ v: 0 }); }
    if (kind === 'move') {
      store.moveClip('c1', 't1', 1);
      expect = (t) => { const b = lin(t) - 1; return b < 0 ? { v: 0 } : { v: ramp(b), guard: nearEdge(b) }; };
    }
    if (kind === 'loop') {
      // Loop-Ende d s vor der Marke, nicht an einer Kante; Loop-Anfang 1,3 Schläge davor
      let end = lin(tCall) + d / spb;
      if (nearEdge(end) || frac(end / 2) < 0.1 || frac(end / 2) > 0.9) end += 0.4;
      const start = end - 1.3;
      const tEnd = t0 + end * spb;
      store.setLoop({ on: true, startBeat: start, endBeat: end });
      expect = (t) => {
        if (t < tEnd) { const b = lin(t); return { v: ramp(b), guard: nearEdge(b) || t > tEnd - 0.014 }; }
        const k = (t - tEnd) / spb;
        const into = k % 1.3;
        const b = start + into;
        return { v: ramp(b), guard: nearEdge(b) || into < 0.028 || into > 1.3 - 0.028 };
      };
    }
  }
  const tCallEnd = ctx.currentTime;
  await sleep(1800);
  engine.stop();
  await sleep(120);
  strip.input.disconnect(node);
  node.disconnect();
  // Auswerten: [tCall − 0,1 s, tCall + 1,5 s]
  const from = Math.round((tCall - 0.1) * sr);
  const to = Math.round((tCall + 1.5) * sr);
  let bad = 0; let silent = 0; let last = -1; let n = 0; let first = -1;
  for (const c of chunks) {
    for (let i = 0; i < c.d.length; i++) {
      const f = c.f + i;
      if (f < from || f >= to) continue;
      n++;
      const t = f / sr;
      const e = t < tCall ? { v: ramp(lin(t)), guard: nearEdge(lin(t)) } : expect(t);
      if (e.guard) continue;
      const x = c.d[i];
      if (Math.abs(x - e.v) > 0.02) {
        bad++;
        if (Math.abs(x) < 0.02) silent++;
        if (t >= tCall) { last = t; if (first < 0) first = t; }
      }
    }
  }
  return {
    kind, block: kind === 'block' ? block : undefined, frames: n, sr,
    react: last < 0 ? 0 : +(last - tCall).toFixed(4), bad: +(bad / sr).toFixed(4), silent: +(silent / sr).toFixed(4), misplaced: +((bad - silent) / sr).toFixed(4),
    firstBad: first < 0 ? null : +(first - tCall).toFixed(4), callMs: +((tCallEnd - tCall) * 1000).toFixed(1),
  };
}

module.exports = { schedProbe };
