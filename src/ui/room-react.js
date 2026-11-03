// Schnelle Musikwerte für das Raumlicht: Spektrum in 32 Bändern mit fallenden Spitzen, Schläge je Kategorie und
// je Spur (sofort hoch, kurz nachklingend, dazu ein Blitz beim Einsatz), Taktphase und ein Verlauf des Spektrums
// (eine Zeile je Viertel-Schlag) für den Wasserfall.

export const SPEC_N = 32;
export const HIST_ROWS = 48;
const MAX_TRACKS = 8;

export function createReact({ engine, cats }) {
  const spec = new Float32Array(SPEC_N);
  const peak = new Float32Array(SPEC_N);
  const hist = new Uint8Array(SPEC_N * HIST_ROWS);
  const catEnv = Object.fromEntries(cats.map((c) => [c, 0]));
  const catFlash = Object.fromEntries(cats.map((c) => [c, 0]));
  const catMax = Object.fromEntries(cats.map((c) => [c, 0]));
  const catS = Object.fromEntries(cats.map((c) => [c, { env: 0, slow: 0, flash: 0, ref: 0 }]));
  const trk = new Map(); // trackId → { env, slow, flash, max, cat }
  let histRow = -1;
  let histFrac = 0;

  // Jedes Bild (60 Hz): Spitzen zwischen zwei Raumlicht-Bildern sammeln, damit kein Schlag verloren geht
  function feed(hits) {
    for (const h of hits) {
      catMax[h.cat] = Math.max(catMax[h.cat], h.lv);
      let s = trk.get(h.trackId);
      if (!s) trk.set(h.trackId, (s = { env: 0, slow: 0, flash: 0, ref: 0, max: 0, cat: h.cat }));
      s.max = Math.max(s.max, h.lv);
      s.cat = h.cat;
    }
  }

  // Bezogen auf die jüngste Spitze (leise Spuren wirken so deutlich wie laute): sofort hoch, kurz zurück;
  // Blitz, wenn der Pegel deutlich über den gemächlichen Mittelwert springt
  function env(s, raw, dt) {
    s.ref = Math.max(raw, s.ref * Math.exp(-dt / 4), 0.015);
    const v = raw / s.ref;
    s.env = Math.max(v, s.env * Math.exp(-dt / 0.2));
    if (v > s.slow * 1.3 + 0.12) s.flash = 1;
    s.flash *= Math.exp(-dt / 0.32);
    s.slow += (v - s.slow) * (1 - Math.exp(-dt / 0.45));
  }

  function step(dt, live) {
    const bands = live ? engine.outputBands?.(SPEC_N) : null;
    for (let i = 0; i < SPEC_N; i++) {
      const v = bands ? bands[i] : 0;
      spec[i] = Math.max(v, spec[i] * Math.exp(-dt / 0.12));
      peak[i] = Math.max(spec[i], peak[i] - dt * 0.45);
    }
    for (const c of cats) {
      const s = catS[c];
      env(s, live ? catMax[c] : 0, dt);
      catEnv[c] = s.env; catFlash[c] = s.flash; catMax[c] = 0;
    }
    for (const [id, s] of trk) {
      env(s, live ? s.max : 0, dt);
      s.max = 0;
      if (!live && s.env < 0.002 && s.flash < 0.002) trk.delete(id);
    }
    // Verlauf: eine neue Zeile je Viertel-Schlag (läuft also im Songtempo), Zeile 0 ist die jüngste
    const beat = engine.heardBeat();
    const row = Math.floor(beat * 4);
    histFrac = beat * 4 - row;
    if (live && row !== histRow) {
      const steps = histRow < 0 || row < histRow ? 1 : Math.min(HIST_ROWS, row - histRow);
      hist.copyWithin(SPEC_N * steps, 0, SPEC_N * (HIST_ROWS - steps));
      for (let k = 0; k < steps; k++) for (let i = 0; i < SPEC_N; i++) hist[k * SPEC_N + i] = Math.round(Math.min(1, spec[i]) * 255);
      histRow = row;
    } else if (!live) {
      for (let i = 0; i < hist.length; i++) hist[i] = Math.round(hist[i] * Math.exp(-dt / 0.6));
      histRow = -1;
    }
  }

  // Spuren mit Wert, die lautesten zuerst (höchstens 8)
  function tracks() {
    return [...trk.entries()].sort((a, b) => b[1].env - a[1].env).slice(0, MAX_TRACKS);
  }

  return {
    feed, step, tracks, spec, peak, hist, catEnv, catFlash,
    get histFrac() { return histFrac; },
    get beat() { return engine.heardBeat(); },
  };
}
