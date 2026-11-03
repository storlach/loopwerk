// Schnelle Musikwerte für das Raumlicht: Spektrum in 32 Bändern mit fallenden Spitzen und Schläge je Spur
// (auf die jüngste Spitze der Spur bezogen: sofort hoch, kurz nachklingend, dazu ein Blitz beim Einsatz).

export const SPEC_N = 32;
const MAX_TRACKS = 8;

export function createReact({ engine }) {
  const spec = new Float32Array(SPEC_N);
  const peak = new Float32Array(SPEC_N);
  const trk = new Map(); // trackId → { env, slow, flash, ref, max, cat }
  let topS = 0;

  // Jedes Bild (60 Hz): Spitzen zwischen zwei Raumlicht-Bildern sammeln, damit kein Schlag verloren geht
  function feed(hits) {
    for (const h of hits) {
      let s = trk.get(h.trackId);
      if (!s) trk.set(h.trackId, (s = { env: 0, slow: 0, flash: 0, ref: 0, max: 0, cat: h.cat }));
      s.max = Math.max(s.max, h.lv);
      s.cat = h.cat;
    }
  }

  // Bezogen auf die jüngste Spitze (leise Spuren wirken so deutlich wie laute): sofort hoch, kurz zurück;
  // Blitz, wenn der Pegel deutlich über den gemächlichen Mittelwert springt
  function env(s, raw, dt, fade) {
    s.ref = Math.max(raw, s.ref * Math.exp(-dt / 4), 0.015);
    const v = raw / s.ref;
    s.env = Math.max(v, s.env * Math.exp(-dt / (0.2 * fade)));
    if (v > s.slow * 1.3 + 0.12) s.flash = 1;
    s.flash *= Math.exp(-dt / (0.32 * fade));
    s.slow += (v - s.slow) * (1 - Math.exp(-dt / 0.45));
  }

  // Nach dem Stopp klingt alles dreimal so langsam aus (sanft statt abgeschnitten)
  function step(dt, live) {
    const fade = live ? 1 : 3;
    const bands = live ? engine.outputBands?.(SPEC_N) : null;
    // Form des Klangs: bezogen auf das lauteste Band (gut 25 dB Spanne), sehr Leises ganz aus
    topS = Math.max(bands ? Math.max(...bands) : 0, topS * Math.exp(-dt / 0.5));
    const top = topS;
    const smooth = (x) => x * x * (3 - 2 * x);
    for (let i = 0; i < SPEC_N; i++) {
      const b = bands ? bands[i] : 0;
      const rel = Math.min(1, Math.max(0, (b - top + 0.45) / 0.45));
      const v = smooth(rel) * smooth(Math.min(1, Math.max(0, (b - 0.04) / 0.3)));
      spec[i] = Math.max(v, spec[i] * Math.exp(-dt / (0.12 * fade)));
      peak[i] = Math.max(spec[i], peak[i] - (dt * 0.45) / fade);
    }
    for (const [id, s] of trk) {
      env(s, live ? s.max : 0, dt, fade);
      s.max = 0;
      if (!live && s.env < 0.002 && s.flash < 0.002) trk.delete(id);
    }
  }

  // Spuren mit Wert, die lautesten zuerst (höchstens 8)
  function tracks() {
    return [...trk.entries()].sort((a, b) => b[1].env - a[1].env).slice(0, MAX_TRACKS);
  }

  return { feed, step, tracks, spec, peak };
}
