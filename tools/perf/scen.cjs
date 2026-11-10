// Szenarien-Hilfen, die im Browser laufen (page.evaluate)

// Großer Song: tracks Spuren, clips Clips gleichmäßig verteilt (1-Takt-Clips), Sounds aus dem Beispiel-Arrangement
async function bigSong({ tracks = 16, clips = 448, bars = null, fx = false, sends = false, mastering = false } = {}) {
  const { store, library } = window.loopwerk;
  const ids = ['drums-four', 'drums-hats16', 'bass-prog', 'chords-pad', 'synth-arp-prog', 'synth-lead', 'fx-riser', 'fx-crash'];
  const per = Math.ceil(clips / tracks);
  const lengthBars = bars ?? Math.max(56, per);
  const stepBars = Math.max(1, Math.floor(lengthBars / per));
  let n = 0;
  const p = {
    version: 1, name: 'Mess-Song', bpm: 120, beatsPerBar: 4, lengthBars, loop: { on: false, startBeat: 0, endBeat: 16 },
    tracks: Array.from({ length: tracks }, (_, i) => ({
      id: 't' + (i + 1), name: 'Spur ' + (i + 1), volume: 0.6, pan: 0, mute: false, solo: false,
      clips: Array.from({ length: Math.min(per, clips - i * per > 0 ? per : 0) }, (_, k) => ({ id: 'c' + (++n), sampleId: ids[i % ids.length], startBeat: k * stepBars * 4, lengthBeats: stepBars * 4, offsetBeats: 0 })),
    })),
  };
  store.replace(p);
  await library.ensureProject(store.project);
  await library.ensureMany(ids);
  if (fx) for (const t of store.project.tracks) for (const id of ['drive', 'filter', 'eq', 'comp', 'pump', 'echo', 'hall']) store.setTrackFx(t.id, id, { on: true });
  if (sends) for (const t of store.project.tracks) { store.setSend(t.id, 'hall', 0.4); store.setSend(t.id, 'echo', 0.3); }
  if (mastering) store.setMastering({ on: true });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { clips: store.project.tracks.reduce((a, t) => a + t.clips.length, 0), tracks: store.project.tracks.length, json: JSON.stringify(store.project).length };
}

// Scheduler beobachten: Abstände zwischen Ticks, Dauer je Tick, Rückstand (Zeiger hinter der Uhr = verspätet eingeplant)
function watchTicks() {
  const { engine } = window.loopwerk;
  if (engine.__w) return;
  const w = engine.__w = { gaps: [], durs: [], late: [], last: 0 };
  const orig = engine._tick.bind(engine);
  engine._tick = function () {
    const t = performance.now();
    if (engine.playing && engine.ctx) {
      if (w.last) w.gaps.push(t - w.last);
      w.last = t;
      const behind = engine.ctx.currentTime - engine.cursorTime;
      if (behind > 0) w.late.push(behind * 1000);
    } else w.last = 0;
    orig();
    w.durs.push(performance.now() - t);
  };
}
function resetTicks() { const w = window.loopwerk.engine.__w; if (w) { w.gaps = []; w.durs = []; w.late = []; w.last = 0; } }
function readTicks() {
  const w = window.loopwerk.engine.__w;
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2) : 0; };
  return { n: w.durs.length, durMed: q(w.durs, 0.5), durP95: q(w.durs, 0.95), durMax: q(w.durs, 1), gapMed: q(w.gaps, 0.5), gapP95: q(w.gaps, 0.95), gapMax: q(w.gaps, 1), over100: w.gaps.filter((g) => g > 100).length, over125: w.gaps.filter((g) => g > 125).length, late: w.late.length, lateMax: +Math.max(0, ...w.late).toFixed(1) };
}

module.exports = { bigSong, watchTicks, resetTicks, readTicks };
