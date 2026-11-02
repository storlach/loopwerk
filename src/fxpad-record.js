// Effekt-Pad als Kurve aufnehmen (Scheibe 5 zu Spec v2.12). Rein, ohne Browser-Abhängigkeiten: die Oberfläche füttert den
// Recorder mit Schlägen (engine.currentBeat()) und Pad-Positionen, beim Loslassen entsteht daraus die neue Punktliste.
//
// Aufnehmbar sind nur Modi, die einer Kurve entsprechen:
//   Filter → 'filter.cutoff' (Tiefpass oder Hochpass, je nach Seite bzw. Typ des Filters am Ziel; die Resonanz/Höhe nicht)
//   Echo   → 'echo.mix' (100 % solange gedrückt; Notenwert und Rückkopplung nur beim Einschalten)
// Stutter (hält Audio fest und wiederholt es), Lo-Fi (Bit-Tiefe und Abtastrate sind keine Kurven-Parameter) und der Bandstopp
// (Tonhöhe des Bandes) haben keine Kurve, die so klingt – sie wirken nur live.
//
// Ausdünnen: während des Ziehens höchstens ein Punkt je 1/16 Schlag (Raster, Wert = letzter Pad-Wert davor), beim Loslassen
// Ramer-Douglas-Peucker mit RECORD_TOL. Überschreiben: der Bereich der Geste ersetzt die alten Punkte, Haltepunkte davor und
// danach halten den bisherigen Verlauf. Über eine Loop-Grenze: neuer Durchgang ab dem Loop-Anfang, spätere überschreiben frühere.

import { padFilter, ECHO_STEPS, stepAt } from './fxpad.js';
import { ECHO_TIMES } from './effects.js';
import { laneOf, autoValueAt, autoRest, STEP_BEATS } from './automation.js';

export const PAD_RECORD = { filter: 'filter.cutoff', echo: 'echo.mix' };
export const RECORD_GRID = 1 / 16; // Schläge
export const RECORD_TOL = 0.01; // Abweichung im Wertebereich der Kurve (Filter: 0,09 Oktaven)
export const RELEASE_BEATS = { filter: 0.25, echo: 0.5 }; // Rückweg nach dem Loslassen
const EPS = 1e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEAD = 0.04; // Totzone in der Mitte des Filters (wie padFilter)

// Frequenz → Regler-Wert der Filter-Kurve (Umkehrung von cutoffHz: 40 Hz · 2^(8,81 · v))
export const cutoffOf = (hz) => clamp(Math.log2(hz / 40) / 8.81, 0, 1);

// Warum lässt sich hier nichts aufnehmen? null = geht. owner: Spur bzw. project.master
export function padRecordBlocked(mode, owner, label = mode) {
  if (!PAD_RECORD[mode]) return `${label} lässt sich nicht als Kurve aufnehmen – nur Filter und Echo.`;
  if (mode === 'filter') {
    const f = owner?.fx?.filter;
    if (f?.on && f.type !== 'lowpass' && f.type !== 'highpass') return 'Der Filter ist ein Bandpass – keine Kurve aufnehmbar.';
  }
  return null;
}

// Kurven-Wert des Pads allein (ohne den Effekt des Ziels); null = wirkt in dieser Richtung nicht
export function padCurveValue(mode, x, y, type) {
  if (mode === 'echo') return 1;
  const f = padFilter(x, y);
  if (type === 'highpass') return f.hp > 10 ? cutoffOf(f.hp) : null;
  return f.lp < 19999 ? cutoffOf(f.lp) : null;
}

// Ramer-Douglas-Peucker über [[beat, value], …] mit senkrechtem Abstand zur Sehne (die Kurve ist linear in Schlägen)
export function simplify(pts, tol = RECORD_TOL) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [b0, v0] = pts[a];
    const [b1, v1] = pts[b];
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const lin = b1 > b0 ? v0 + ((v1 - v0) * (pts[i][0] - b0)) / (b1 - b0) : v0;
      const d = Math.abs(pts[i][1] - lin);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const curveAt = (points, beat) => {
  let c;
  for (const p of points) { if (p.beat <= beat + EPS) c = p.curve; else break; }
  return c;
};

// Bereich [b0, end] einer Punktliste durch seg ([[beat, value], …], aufsteigend) ersetzen. Vor b0 hält ein Punkt den alten
// Wert (Sprung in 1/128 Schlag), am Ende (end ≥ letzter Punkt von seg) wieder der alte Wert samt Kurvenart – außerhalb
// bleibt der Verlauf, wie er war. rest: Wert ohne Kurve.
export function overwrite(points, seg, end, rest) {
  if (!seg.length) return points.map((p) => ({ ...p }));
  const b0 = seg[0][0];
  const pre = b0 - STEP_BEATS;
  const out = points.filter((p) => p.beat < pre - EPS || p.beat > end + EPS).map((p) => ({ ...p }));
  const add = [];
  if (pre > EPS) add.push({ beat: pre, value: autoValueAt(points, pre, rest) });
  for (const [beat, value] of seg) add.push({ beat, value });
  const last = seg[seg.length - 1][0];
  if (end > last + EPS) {
    const c = curveAt(points, end);
    add.push(c ? { beat: end, value: autoValueAt(points, end, rest), curve: c } : { beat: end, value: autoValueAt(points, end, rest) });
  }
  return [...out, ...add].sort((a, b) => a.beat - b.beat);
}

// Ein Durchgang: Rasterpunkte [beat, x, y]. Während des Ziehens höchstens ein Punkt je RECORD_GRID; stehen drei gleiche
// hintereinander, wandert der letzte nur weiter (Halten kostet keine Punkte).
class Pass {
  constructor(beat, x, y) {
    this.pts = [[beat, x, y]];
    this.k = Math.floor(beat / RECORD_GRID + EPS);
    this.x = x;
    this.y = y;
    this.end = beat;
    this.wrapped = false; // endet an der Loop-Grenze
  }

  _push(beat) {
    const p = this.pts;
    const n = p.length;
    if (n >= 2 && p[n - 1][1] === this.x && p[n - 1][2] === this.y && p[n - 2][1] === this.x && p[n - 2][2] === this.y) p[n - 1][0] = beat;
    else p.push([beat, this.x, this.y]);
  }

  // bis beat mit dem gehaltenen Wert auffüllen, dann neuen Wert übernehmen
  to(beat, x, y) {
    const k = Math.floor(beat / RECORD_GRID + EPS);
    for (let j = this.k + 1; j <= k; j++) this._push(j * RECORD_GRID);
    this.k = Math.max(this.k, k);
    this.end = Math.max(this.end, beat);
    if (x != null) { this.x = x; this.y = y; }
  }

  close(beat) {
    this.to(beat);
    const last = this.pts[this.pts.length - 1];
    if (beat > last[0] + EPS) this._push(beat);
    this.end = beat;
  }
}

export class PadRecorder {
  // loop: { on, startBeat, endBeat } beim Drücken; beat: Songposition (Kontextzeit jetzt)
  constructor({ mode, target, beat, x, y, loop = null }) {
    this.mode = mode;
    this.target = target;
    this.key = PAD_RECORD[mode];
    const inLoop = loop?.on && loop.endBeat > loop.startBeat && beat < loop.endBeat - EPS && beat >= loop.startBeat - EPS;
    this.loop = inLoop ? { startBeat: loop.startBeat, endBeat: loop.endBeat } : null;
    this.passes = [new Pass(beat, x, y)];
    this.last = beat;
    this.closed = false;
  }

  get cur() { return this.passes[this.passes.length - 1]; }
  // gespeicherte Punkte (Ausdünnung während des Ziehens)
  get count() { return this.passes.reduce((n, p) => n + p.pts.length, 0); }

  sample(beat, x, y) {
    if (this.closed || !Number.isFinite(beat)) return;
    const L = this.loop;
    if (beat < this.last - 1e-3 || beat > this.last + 1) {
      // Sprung: Loop-Grenze (kurz vor dem Ende → kurz nach dem Anfang) oder Marke versetzt
      const wrap = L && beat < this.last && L.endBeat - this.last >= -EPS && beat - L.startBeat >= -EPS && L.endBeat - this.last + beat - L.startBeat <= 1;
      const p = this.cur;
      if (wrap) { p.close(L.endBeat); p.wrapped = true; } else p.close(this.last);
      this.passes.push(new Pass(wrap ? L.startBeat : beat, p.x, p.y));
    }
    if (L) beat = clamp(beat, L.startBeat, L.endBeat);
    this.cur.to(beat, x, y);
    this.last = beat;
  }

  // Wiedergabe angehalten: hier endet die Aufnahme (Loslassen schreibt sie trotzdem)
  stop() {
    if (this.closed) return;
    this.cur.close(this.last);
    this.closed = true;
  }

  // Neue Punktliste für das Ziel. owner: Spur bzw. project.master (Stand beim Loslassen). Liefert { key, points, fx, from,
  // to } oder { reason } (nichts zu schreiben).
  finish(beat, owner) {
    if (!this.closed) {
      if (Number.isFinite(beat)) this.sample(beat, null, null);
      this.cur.close(this.last);
      this.closed = true;
    }
    const mode = this.mode;
    const key = this.key;
    const fxId = mode === 'echo' ? 'echo' : 'filter';
    const fx = owner?.fx?.[fxId];
    const on = !!fx?.on;
    const all = this.passes.flatMap((p) => p.pts);
    let type = 'lowpass';
    let other = 0;
    if (mode === 'filter') {
      let l = 0;
      let h = 0;
      for (const [, x] of all) { if (x < 0.5 - DEAD) l++; else if (x > 0.5 + DEAD) h++; }
      type = on ? fx.type : h > l ? 'highpass' : 'lowpass';
      other = type === 'highpass' ? l : h;
    }
    // Wert ohne Kurve: ein ausgeschalteter Effekt ist transparent (Tiefpass ganz offen, Hochpass ganz zu, Echo 0 %)
    const rest = on ? autoRest(owner, key) : mode === 'echo' ? 0 : type === 'highpass' ? 0 : 1;
    // base: Kurve vor der Geste (die hat man gehört), lane: neue Kurve, Durchgang für Durchgang überschrieben
    const base = on ? laneOf(owner, key) : [];
    let lane = base;
    // Gehört hat man den Effekt des Ziels und das Pad dahinter: Tiefpass → das tiefere, Hochpass → das höhere, Echo → voll
    const comb = (old, v) => (v == null ? old : mode === 'echo' ? Math.max(old, v) : type === 'highpass' ? Math.max(old, v) : Math.min(old, v));
    let changed = false;
    let from = Infinity;
    let to = -Infinity;
    for (const p of this.passes) {
      if (p.pts.length < 2 && p.end - p.pts[0][0] < EPS) continue;
      const seg = p.pts.map(([b, x, y]) => {
        const old = autoValueAt(base, b, rest);
        const v = comb(old, padCurveValue(mode, x, y, type));
        if (Math.abs(v - old) > RECORD_TOL / 2) changed = true;
        return [b, Math.round(v * 1e4) / 1e4];
      });
      const pts = simplify(seg);
      const last = pts[pts.length - 1][0];
      let end;
      if (p.wrapped) end = last + STEP_BEATS;
      else {
        end = last + RELEASE_BEATS[mode];
        if (this.loop) end = Math.min(end, Math.max(last + STEP_BEATS, this.loop.endBeat));
      }
      lane = overwrite(lane, pts, end, rest);
      from = Math.min(from, pts[0][0]);
      to = Math.max(to, end);
    }
    if (!changed) {
      const reason = other ? `Der Filter ist ein ${type === 'highpass' ? 'Hochpass' : 'Tiefpass'} – die andere Seite wird nicht aufgenommen.` : 'Keine Änderung – nichts aufgenommen.';
      return { reason };
    }
    let patch = null;
    if (!on) {
      if (mode === 'filter') {
        // Resonanz bleibt 0: der eingeschaltete Filter steht außerhalb der Geste offen (Tiefpass 18 kHz, Hochpass 40 Hz) und
        // soll dort nichts färben – eine Resonanzspitze läge den ganzen Song über an. Die Pad-Höhe (Resonanz) wirkt nur live.
        patch = { on: true, type, cutoff: rest, reso: 0 };
      } else {
        const xs = all.map((p) => p[1]).sort((a, b) => a - b);
        const ys = all.map((p) => p[2]).sort((a, b) => a - b);
        const beats = stepAt(ECHO_STEPS, xs[xs.length >> 1]).beats;
        const time = ECHO_TIMES.reduce((a, b) => (Math.abs(b.beats - beats) < Math.abs(a.beats - beats) ? b : a)).id;
        patch = { on: true, time, feedback: Math.round(ys[ys.length >> 1] * 0.85 * 100) / 100, mix: 0 };
      }
    }
    return { key, points: lane, fx: patch, from, to, other: other > 0, type };
  }
}
