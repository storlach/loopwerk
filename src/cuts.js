// Zerlegen (Krachwerk 2b, Spec krachwerk-2b-zerlegen §3–4): Schnittgrenzen und Lage der Schnitt-Clips, ohne Audio
// (auch in Node testbar). Zeiten in Sekunden des Originals der Wurzel, Lage in Schlägen.
// Die Rundungen spiegeln cookRecipe (src/dsp/recipe.js): so liegen die Schnitt-Clips auf dem Frame, an dem die Quelle
// dieselbe Stelle spielt, und „Auf die Spur“ klingt samplegenau wie vorher.

import { MIN_SPAN } from './recipe.js';

export const CUT_PRE = 0.003; // Schnitt 3 ms vor dem Anschlag
const STEP = 1e-5; // Raster von start/end im Rezept
const EPS = 1e-6;
const roundT = (v) => Number((Math.round(v / STEP) * STEP).toFixed(6));

// Dauer des gebackenen Klangs aus dem Rezept (Dehnen, Tonhöhe; Rückwärts und Autotune ändern die Länge nicht)
export function cookedSeconds(r, dur) {
  const len = Math.max(MIN_SPAN, (r.end ?? dur) - (r.start ?? 0));
  const pf = 2 ** (((r.semis ?? 0) + (r.cents ?? 0) / 100) / 12);
  return Math.max(MIN_SPAN, (len * (r.stretch ?? 1)) / pf);
}

// Tonhöhe per Neuabtastung auf einem festen Raster des Originals (Vielfache von ratio ab Frame 0 bzw. ab dem Ende bei
// rückwärts): Ausschnitte desselben Originals treffen dieselben Stützstellen. anchor = Lage des Ausschnitts im Raster.
export const pitchFirst = (anchor, ratio) => Math.ceil(anchor / ratio - 1e-9);
export function pitchGrid(anchor, ratio, length) {
  const first = pitchFirst(anchor, ratio);
  const x0 = first * ratio - anchor; // erste Stützstelle im Ausschnitt, 0 ≤ x0 < ratio
  return { first, x0, count: Math.max(1, Math.floor((length - x0) / ratio)) };
}

// Ausschnitt in Frames wie cookRecipe
function window_(r, sr, len) {
  const a = Math.min(len - 1, Math.max(0, Math.round((r.start ?? 0) * sr)));
  const b = Math.max(a + 1, Math.min(len, r.end != null ? Math.round(r.end * sr) : len));
  return { a, b };
}

// Frame im gebackenen Klang der Quelle, an dem die Originalzeit t (Schnittgrenze) erklingt
export function cookedFrame(r, t, { sampleRate: sr, duration }) {
  const len = Math.round(duration * sr);
  const { a, b } = window_(r, sr, len);
  const T = Math.min(b, Math.max(a, Math.round(t * sr)));
  const off = r.reverse ? b - T : T - a;
  const st = r.stretch ?? 1;
  const semis = (r.semis ?? 0) + (r.cents ?? 0) / 100;
  if (!semis) return off * st;
  const ratio = 2 ** (semis / 12);
  if (st !== 1) return (off * st) / ratio; // nach WSOLA nur ungefähr
  const anchor = r.reverse ? len - b : a;
  return pitchFirst(anchor + off, ratio) - pitchFirst(anchor, ratio);
}

// Länge des gebackenen Klangs der Quelle in Frames (wie cookRecipe)
export function cookedFrames(r, { sampleRate: sr, duration }) {
  const len = Math.round(duration * sr);
  const { a, b } = window_(r, sr, len);
  let n = b - a;
  const st = r.stretch ?? 1;
  if (st !== 1) n = Math.max(1, Math.round(n * st));
  const semis = (r.semis ?? 0) + (r.cents ?? 0) / 100;
  if (!semis) return n;
  const ratio = 2 ** (semis / 12);
  if (st !== 1) return Math.max(1, Math.floor(n / ratio));
  return pitchGrid(r.reverse ? len - b : a, ratio, n).count;
}

// Schnitte aus Anschlägen (Frames ab start): Schnitt k = [Anschlag k − 3 ms, Anschlag k+1 − 3 ms]; der erste beginnt am
// Anfang (Auftakt bleibt), der letzte endet am Ende. Zu kurze Stücke (< 10 ms) gehen im Vorgänger auf.
export function planCuts(onsets, sampleRate, { start = 0, end }) {
  const times = [...(onsets || [])].map((o) => start + o / sampleRate).filter((t) => t >= start - EPS && t < end).sort((x, y) => x - y);
  if (!times.length) return [];
  const bounds = [start];
  for (const t of times.slice(1)) {
    const b = roundT(Math.max(start, t - CUT_PRE));
    if (b - bounds[bounds.length - 1] >= MIN_SPAN && end - b >= MIN_SPAN) bounds.push(b);
  }
  const out = [];
  for (let k = 0; k < bounds.length; k++) {
    const s = bounds[k];
    const onset = k === 0 ? times[0] : times.find((t) => t >= s - EPS) ?? s + CUT_PRE;
    out.push({ start: s, end: k + 1 < bounds.length ? bounds[k + 1] : end, onset: Number(onset.toFixed(6)) });
  }
  return out;
}

// In n gleiche Schnitte
export function evenCuts(n, { start = 0, end }) {
  const k = Math.max(1, Math.min(Math.floor((end - start) / MIN_SPAN), Math.round(n)));
  const out = [];
  for (let i = 0; i < k; i++) out.push({ start: i ? roundT(start + ((end - start) * i) / k) : start, end: i + 1 < k ? roundT(start + ((end - start) * (i + 1)) / k) : end });
  return out;
}

// Lage der Schnitt-Clips: deckt das Fenster des Clips (offsetBeats, lengthBeats) wie die Quelle; wiederholt der Clip den
// Sound, wiederholen sich die Schnitt-Clips, überstehende werden gekürzt (vorn mit offset im Schnitt).
// Ohne clip: ein Durchlauf ab Schlag 0 (cutSound addiert atBeat). loopBeats: Quelle ist ein Loop dieser Länge (sonst
// Einzelklang, aufgefüllt auf ganze Schläge). grid > 0: Clip-Anfänge rasten ein (Ins Raster).
// Rückgabe: cuts mit clips: [{ beat, len, offset }] und stretch (Clip-Geschwindigkeit der Schnitt-Clips).
export function layoutCuts(cuts, { recipe = {}, duration, sampleRate = 44100, beatsPerSecond, clip = null, grid = 0, loopBeats = null }) {
  const r = recipe || {};
  const sr = sampleRate;
  const opt = { sampleRate: sr, duration };
  const f = clip?.stretch || 1;
  const total = cookedFrames(r, opt);
  const sec = total / sr;
  // Schläge je Sekunde gebackener Klang, Periode einer Wiederholung
  const loop = loopBeats > 0 ? loopBeats : null;
  const g = loop ? loop / (sec * beatsPerSecond) : 1;
  const scale = beatsPerSecond * f * g;
  const period = (loop ?? Math.max(1, Math.ceil(sec * beatsPerSecond - 1e-6))) * f;
  const spans = cuts.map((c) => {
    const p = cookedFrame(r, c.start, opt);
    const q = cookedFrame(r, c.end, opt);
    const lo = Math.min(p, q), hi = Math.min(total, Math.max(p, q));
    return { b0: (lo / sr) * scale, b1: (hi / sr) * scale };
  });
  const out = cuts.map((c) => ({ start: c.start, end: c.end, ...(c.onset != null ? { onset: c.onset } : {}), stretch: f * g, clips: [] }));
  const w0 = clip ? clip.startBeat : 0;
  const w1 = clip ? clip.startBeat + clip.lengthBeats : period;
  const origin = w0 - (clip ? (((clip.offsetBeats || 0) % period) + period) % period : 0);
  for (let rep = 0; origin + rep * period < w1 - EPS; rep++) {
    const o = origin + rep * period;
    spans.forEach((s, i) => {
      const a = o + s.b0, b = o + s.b1;
      const from = Math.max(a, w0), to = Math.min(b, w1);
      if (to - from > EPS) out[i].clips.push({ beat: from, len: to - from, offset: from - a });
    });
  }
  if (grid > 0) {
    const all = out.flatMap((c) => c.clips).sort((x, y) => x.beat - y.beat);
    const snapped = all.map((p) => (p.offset > EPS ? p.beat : Math.round(p.beat / grid) * grid));
    all.forEach((p, i) => {
      const end = p.beat + p.len;
      const next = all[i + 1];
      const stop = next && Math.abs(next.beat - end) < 1e-4 ? snapped[i + 1] : end;
      p.beat = snapped[i];
      p.len = stop - p.beat;
    });
    for (const c of out) c.clips = c.clips.filter((p) => p.len > EPS);
  }
  for (const c of out) if (c.clips.length) { c.beat = c.clips[0].beat; c.len = c.clips[0].len; }
  return out;
}

// Kit aus Schnitten (Krachwerk 4, Spec krachwerk-4-kit §3): items = [{ id, centroid }] (Spektralschwerpunkt des gebackenen
// Schnitts). Über 8: gleichmäßig über die Helligkeit verteilt (wie pickKit in src/dsp/slice.js). Dunkelster → kick,
// hellster → hat (ab 3), mittlerer → snare, die übrigen in Helligkeitsfolge → clap, tomLo, tomHi, open, crash.
// Rückgabe { kick: id, … }
export function pickPads(items, max = 8) {
  const sorted = [...items].sort((p, q) => p.centroid - q.centroid);
  if (sorted.length <= max) return sorted;
  return Array.from({ length: max }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]);
}
export function assignPads(items) {
  const s = pickPads(items);
  const n = s.length;
  if (!n) return {};
  const map = { kick: s[0].id };
  if (n === 1) return map;
  if (n === 2) return { ...map, snare: s[1].id };
  const mid = Math.floor((n - 1) / 2); // bei gerader Zahl der dunklere der beiden mittleren
  map.hat = s[n - 1].id;
  map.snare = s[mid].id;
  const rest = s.filter((_, i) => i !== 0 && i !== n - 1 && i !== mid);
  ['clap', 'tomLo', 'tomHi', 'open', 'crash'].forEach((row, i) => { if (rest[i]) map[row] = rest[i].id; });
  return map;
}
