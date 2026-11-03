// Latenz einmessen (Spec 2.13 A): kurzer Chirp aus dem Lautsprecher, Suche im Mikrofon-Mitschnitt per Matched Filter.
// Reine Funktionen, keine Web-Audio-Abhängigkeit.

export const CLICK = { f0: 1500, f1: 6000, seconds: 0.008, peak: 0.5, count: 6, first: 0.3, gap: 0.6 };

// Chirp 1,5–6 kHz, 8 ms, Hann-Fenster, Spitze 0,5. quad: um 90° versetzte Fassung (für die Hüllkurve)
export function clickTemplate(sr, { quad = false } = {}) {
  const n = Math.max(8, Math.round(CLICK.seconds * sr));
  const T = n / sr;
  const k = (CLICK.f1 - CLICK.f0) / T;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ph = 2 * Math.PI * (CLICK.f0 * t + 0.5 * k * t * t);
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    out[i] = CLICK.peak * w * (quad ? Math.cos(ph) : Math.sin(ph));
  }
  return out;
}

// Versatz je erwartetem Klick in Frames (Bruchteile durch Parabel-Interpolation) oder null, wenn keiner gefunden.
// Fenster [e − 5 ms, e + maxLatency]; Hüllkurve der Korrelation (Phase egal, auch bei verpoltem Mikrofon).
// Gezählt wird der erste Gipfel über max(0,5 · Maximum, 6 · Rauschboden) – Reflexionen kommen später und verlieren.
export function findClicks(mono, sr, expectedFrames, { maxLatency = 0.5 } = {}) {
  const a = clickTemplate(sr);
  const b = clickTemplate(sr, { quad: true });
  const m = a.length;
  const pre = Math.round(0.005 * sr);
  const post = Math.round(maxLatency * sr);
  return expectedFrames.map((e) => {
    const lo = Math.max(0, Math.round(e) - pre);
    const hi = Math.min(mono.length - m, Math.round(e) + post);
    if (hi <= lo + 2) return null;
    const env = new Float32Array(hi - lo);
    for (let k = lo; k < hi; k++) {
      let s = 0, q = 0;
      for (let j = 0; j < m; j++) { const x = mono[k + j]; s += a[j] * x; q += b[j] * x; }
      env[k - lo] = Math.sqrt(s * s + q * q);
    }
    let max = 0;
    for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i];
    if (!(max > 1e-9)) return null;
    const floor = median(env);
    const thr = Math.max(0.5 * max, 6 * floor);
    if (max < thr) return null;
    for (let i = 1; i < env.length - 1; i++) {
      if (env[i] < thr || env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
      // Parabel durch die drei Werte um den Gipfel
      const y0 = env[i - 1], y1 = env[i], y2 = env[i + 1];
      const d = y0 - 2 * y1 + y2;
      const frac = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
      return lo + i + frac - e;
    }
    return null;
  });
}

function median(arr) {
  const s = Float32Array.from(arr).sort();
  return s[s.length >> 1];
}

// { ms } oder { error: 'silent' | 'unsteady' }: mindestens 4 von 6 gefunden, Ausreißer (> 2 ms vom Median) fallen weg,
// danach müssen noch 4 übrig sein; plausibel 0–500 ms
export function summarize(offsets, sr, { need = 4, spread = 0.002, max = 0.5 } = {}) {
  const found = offsets.filter((x) => x != null && Number.isFinite(x));
  if (found.length < need) return { error: 'silent', found: found.length };
  const med = [...found].sort((x, y) => x - y)[found.length >> 1];
  const kept = found.filter((x) => Math.abs(x - med) <= spread * sr);
  if (kept.length < need) return { error: 'unsteady', found: found.length, kept: kept.length };
  const frames = kept.reduce((s, x) => s + x, 0) / kept.length;
  const sec = frames / sr;
  if (sec < -0.001 || sec > max) return { error: 'unsteady', found: found.length, kept: kept.length };
  return { ms: Math.max(0, sec) * 1000, frames, found: found.length, kept: kept.length };
}
