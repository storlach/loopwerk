// Schnelle Musikwerte für das Raumlicht: Spektrum in 32 Bändern und je Band die Farbe der
// Spuren, die dort gerade klingen (gewichtet nach ihrem Anteil am Band).

export const SPEC_N = 32;

export function createReact({ engine, colorOf }) {
  const spec = new Float32Array(SPEC_N);
  const col = new Float32Array(SPEC_N * 3); // 0…255 je Band
  const target = new Float32Array(SPEC_N * 3);
  const heard = new Map(); // trackId → Kategorie (in diesem Raumlicht-Bild hörbar)
  let topS = 0;

  // Jedes Bild (60 Hz): welche Spuren gerade hörbar sind
  function feed(hits) {
    for (const h of hits) heard.set(h.trackId, h.cat);
  }

  // Nach dem Stopp klingt alles dreimal so langsam aus (sanft statt abgeschnitten)
  function step(dt, live) {
    const fade = live ? 1 : 3;
    const raw = live ? engine.outputBands?.(SPEC_N) : null;
    // Musik fällt zu den Höhen hin ab: Ausgleich um gut 15 dB über die Breite, damit Hi-Hats und Becken sichtbar werden
    const bands = raw && raw.map((b, i) => (b > 0.02 ? b + (0.26 * i) / (SPEC_N - 1) : 0));
    // Form des Klangs: bezogen auf das lauteste Band (gut 30 dB Spanne), sehr Leises ganz aus
    topS = Math.max(bands ? Math.max(...bands) : 0, topS * Math.exp(-dt / 0.5));
    const top = topS;
    const smooth = (x) => x * x * (3 - 2 * x);
    for (let i = 0; i < SPEC_N; i++) {
      const b = bands ? bands[i] : 0;
      const rel = Math.min(1, Math.max(0, (b - top + 0.55) / 0.55));
      const v = smooth(rel) * smooth(Math.min(1, Math.max(0, (b - 0.04) / 0.3)));
      // hoch in gut 50 ms, zurück in gut 0,3 s: die Ränder atmen mit der Musik, statt bei jedem Schlag zu zucken
      spec[i] = v > spec[i] ? spec[i] + (v - spec[i]) * (1 - Math.exp(-dt / 0.05)) : Math.max(v, spec[i] * Math.exp(-dt / (0.3 * fade)));
    }
    // Farbe je Band: Spuren nach ihrem Anteil gemischt (hoch potenziert, damit die stärkste die Farbe trägt)
    if (live && heard.size) {
      const w = new Float32Array(SPEC_N);
      target.fill(0);
      for (const [id, cat] of heard) {
        const tb = engine.trackBands?.(id, SPEC_N);
        if (!tb) continue;
        const c = colorOf(cat);
        for (let i = 0; i < SPEC_N; i++) {
          const e = tb[i] ** 6;
          w[i] += e;
          target[i * 3] += c[0] * e; target[i * 3 + 1] += c[1] * e; target[i * 3 + 2] += c[2] * e;
        }
      }
      const k = 1 - Math.exp(-dt / 0.15);
      for (let i = 0; i < SPEC_N; i++) {
        if (w[i] < 1e-6) continue;
        const fresh = col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2] < 1; // erstes Mal: gleich die Farbe, kein Einblenden aus Schwarz
        for (let j = 0; j < 3; j++) col[i * 3 + j] += (target[i * 3 + j] / w[i] - col[i * 3 + j]) * (fresh ? 1 : k);
      }
    }
    heard.clear();
  }

  return { feed, step, spec, col };
}
