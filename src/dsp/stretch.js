// Time-Stretching nach WSOLA (Waveform Similarity Overlap-Add): ändert die Länge, nicht die Tonhöhe.
// Läuft offline auf Float32Arrays. Für Loops wird das Signal zyklisch fortgesetzt, damit die Naht sauber bleibt.

const FRAME_SEC = 0.04;   // Fensterlänge
const TOL_SEC = 0.012;    // Suchbereich für die beste Überlappung
const STEP = 4;           // Unterabtastung bei der Ähnlichkeitssuche (Geschwindigkeit)

// channels: Float32Array[], ratio = Ausgabelänge / Eingabelänge, outLength: exakte Ziellänge in Frames
export function timeStretch(channels, ratio, sampleRate, outLength, { loop = true } = {}) {
  const inLen = channels[0].length;
  const N = Math.max(64, Math.round(FRAME_SEC * sampleRate)) & ~1;
  const Hs = N / 2;
  const Ha = Hs / ratio;
  const tol = Math.round(TOL_SEC * sampleRate);
  const pad = N + tol;

  // Eingang zyklisch (Loop) bzw. mit Stille (One-Shot) erweitern
  const ext = (d) => {
    const e = new Float32Array(inLen + 2 * pad + N);
    for (let i = 0; i < e.length; i++) {
      const j = i - pad;
      e[i] = loop ? d[((j % inLen) + inLen) % inLen] : (j >= 0 && j < inLen ? d[j] : 0);
    }
    return e;
  };
  const src = channels.map(ext);
  const mono = new Float32Array(src[0].length);
  for (const s of src) for (let i = 0; i < mono.length; i++) mono[i] += s[i] / src.length;

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const outPad = Math.ceil(pad * ratio) + N;
  const total = outLength + 2 * outPad;
  const out = channels.map(() => new Float32Array(total + N));
  const norm = new Float32Array(total + N);

  let prevIn = pad - Math.round(outPad / ratio) + 0; // Eingangsposition des vorherigen Fensters
  if (prevIn < 0) prevIn = 0;
  const startIn = prevIn;
  for (let outPos = 0, k = 0; outPos < total; outPos += Hs, k++) {
    const ideal = startIn + k * Ha;
    let best = Math.min(Math.max(0, Math.round(ideal)), mono.length - N);
    if (k > 0) {
      // Normierte Ähnlichkeit mit der natürlichen Fortsetzung des vorherigen Fensters.
      // Bei Gleichstand (z. B. Stille) bleibt die ideale Position – sonst wandern Anschläge.
      const nat = prevIn + Hs;
      const score = (cand) => {
        let dot = 0;
        let en = 0;
        for (let i = 0; i < Hs; i += STEP) { const v = mono[cand + i]; dot += mono[nat + i] * v; en += v * v; }
        return dot / Math.sqrt(en + 1e-9);
      };
      let bestScore = score(best) + 1e-6;
      const lo = Math.max(0, best - tol);
      const hi = Math.min(mono.length - N, best + tol);
      for (let cand = lo; cand <= hi; cand += 2) {
        const sc = score(cand);
        if (sc > bestScore) { bestScore = sc; best = cand; }
      }
    }
    best = Math.min(Math.max(0, best), mono.length - N);
    for (let c = 0; c < src.length; c++) {
      const s = src[c];
      const o = out[c];
      for (let i = 0; i < N; i++) o[outPos + i] += s[best + i] * win[i];
    }
    for (let i = 0; i < N; i++) norm[outPos + i] += win[i];
    prevIn = best;
  }

  // Ausschnitt ab dem Punkt, der dem Eingangsanfang entspricht. Abbildung über die Fenstermitten:
  // Eingang x ↦ Ausgang (x − startIn − N/2) · ratio + N/2
  const offset = Math.round((pad - startIn) * ratio - (N / 2) * (ratio - 1));
  return out.map((o) => {
    const r = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const j = offset + i;
      r[i] = norm[j] > 1e-3 ? o[j] / norm[j] : 0;
    }
    return r;
  });
}
