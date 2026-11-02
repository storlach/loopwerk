// Automation: Punktkurven in Schlägen (Spec v2.12, ADR 006). Rein, ohne Browser-Abhängigkeiten – Engine, Modell, UI und Tests
// nutzen dieselben Funktionen.
//
// API (Auszug für die Oberfläche):
//   AUTO_PARAMS[key]                     { key, label, min, max, def, owner: 'relative'|'absolute', target, track, master, format(v) }
//   autoKeys(target)                     Schlüssel, die eine Spur (target = Spur-ID) bzw. 'master' kennt
//   laneOf(owner, key)                   Punkte [{ beat, value, curve? }] einer Spur/des Masters: sortiert, geklemmt, ein Punkt je Schlag
//   autoValueAt(points, beat, def)       Wert der Kurve an einem Schlag (ohne Punkte: def)
//   autoValueOf(owner, key, beat)        dasselbe direkt am Besitzer (Regler-Anzeige an der Marke)
//   autoBreaks(points, b0, b1)           Stützstellen [[beat, value], …] inkl. b0 und b1
//   formatAutoValue(key, v)              Text fürs Fähnchen („−6,0 dB“)
//   AUTO_TEMPLATES, TEMPLATE_BARS        Vorlagen (fadeIn, fadeOut) und Längen-Chips in Takten
//   templateRange(project, target, name, { bars, playheadBeat }) → { fromBeat, toBeat } | null
//   Store: addAutoPoint, moveAutoPoint, setAutoCurve, deleteAutoPoint, clearAutomation, applyAutoTemplate (src/model.js)
// Engine: planLane, autoWindow, handover.

export const STEP_BEATS = 1 / 128;
const EPS = 1e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (x) => { const r = Math.round(x * 10) / 10; return (r || 0).toFixed(1).replace('-', '−').replace('.', ','); };

export const AUTO_PARAMS = {
  volume: {
    key: 'volume', label: 'Lautstärke', min: 0, max: 1, def: 1, owner: 'relative', target: 'strip', track: true, master: true,
    format: (v) => (v <= 1e-4 ? '−∞ dB' : num(20 * Math.log10(v)) + ' dB'),
    map: (v) => v,
  },
};

export function autoKeys(target) {
  return Object.values(AUTO_PARAMS).filter((p) => (target === 'master' ? p.master : p.track)).map((p) => p.key);
}

export const formatAutoValue = (key, v) => AUTO_PARAMS[key]?.format(v) ?? String(v);

// Normalisierte Punktliste (neue Objekte); ungültige Punkte fallen weg, bei gleichem Schlag gilt der spätere Eintrag
export function normalizeLane(key, list) {
  const spec = AUTO_PARAMS[key];
  if (!spec || !Array.isArray(list)) return [];
  const pts = [];
  for (const p of list) {
    if (!p || !Number.isFinite(p.beat) || !Number.isFinite(p.value)) continue;
    const q = { beat: Math.max(0, p.beat), value: clamp(p.value, spec.min, spec.max) };
    if (p.curve === 'step') q.curve = 'step';
    pts.push(q);
  }
  pts.sort((a, b) => a.beat - b.beat);
  const out = [];
  for (const p of pts) {
    if (out.length && p.beat - out[out.length - 1].beat < EPS) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

export function laneOf(owner, key) {
  const a = owner?.automation;
  return a && typeof a === 'object' && !Array.isArray(a) ? normalizeLane(key, a[key]) : [];
}

// Kurve als Polygonzug: Stufen halten bis 1/128 Schlag vor dem nächsten Punkt und laufen dann linear hinüber
function vertices(points) {
  const vs = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    vs.push([p.beat, p.value]);
    const n = points[i + 1];
    if (n && p.curve === 'step') {
      const b = Math.max(p.beat, n.beat - STEP_BEATS);
      if (b > p.beat) vs.push([b, p.value]);
    }
  }
  return vs;
}

function valueOnVerts(vs, beat, def) {
  if (!vs.length) return def;
  if (beat <= vs[0][0]) return vs[0][1];
  const last = vs[vs.length - 1];
  if (beat >= last[0]) return last[1];
  let lo = 0;
  let hi = vs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (vs[m][0] <= beat) lo = m; else hi = m; }
  const [b0, v0] = vs[lo];
  const [b1, v1] = vs[hi];
  return b1 > b0 ? v0 + ((v1 - v0) * (beat - b0)) / (b1 - b0) : v1;
}

export function autoValueAt(points, beat, def = 1) {
  return valueOnVerts(vertices(points), beat, def);
}

export function autoValueOf(owner, key, beat) {
  return autoValueAt(laneOf(owner, key), beat, AUTO_PARAMS[key]?.def ?? 0);
}

export function autoBreaks(points, b0, b1, def = 1) {
  const vs = vertices(points);
  const out = [[b0, valueOnVerts(vs, b0, def)]];
  for (const v of vs) if (v[0] > b0 && v[0] < b1) out.push(v);
  if (b1 > b0) out.push([b1, valueOnVerts(vs, b1, def)]);
  return out;
}

// Plant die Kurve für [b0, b1] ab Kontextzeit t0 auf einen AudioParam. map muss affin sein (dann ist die Rampe im
// Parameter exakt die Kurve). entry: 'set' setzt den Wert bei t0, 'cont' setzt am zuletzt geplanten Wert an,
// 'smooth' (nach Loop-Sprung) erreicht die Kurve erst nach STEP_BEATS.
export function planLane(param, map, points, b0, b1, t0, spb, entry = 'cont') {
  const at = (b) => t0 + (b - b0) * spb;
  let from = b0;
  if (entry === 'set') param.setValueAtTime(map(autoValueAt(points, b0)), t0);
  else if (entry === 'smooth') {
    from = Math.min(b0 + STEP_BEATS, b1);
    if (from > b0) param.linearRampToValueAtTime(map(autoValueAt(points, from)), at(from));
  }
  if (b1 <= from) return;
  const br = autoBreaks(points, from, b1);
  for (let i = 1; i < br.length; i++) param.linearRampToValueAtTime(map(br[i][1]), at(br[i][0]));
}

// Fortlaufende Planung über Scheduler-Fenster: state = { beat } merkt, bis wohin schon geplant ist (ein Sprung nach
// dem Loop reicht über ein kurzes Fenster hinaus). Liefert das tatsächlich zu planende Fenster oder null.
export function autoWindow(state, b0, b1, t0, spb, entry) {
  if (entry === 'cont' && state.beat > b0) {
    if (state.beat >= b1 - 1e-9) return null;
    t0 += (state.beat - b0) * spb;
    b0 = state.beat;
  }
  if (entry === 'smooth') b1 = Math.max(b1, b0 + STEP_BEATS);
  state.beat = b1;
  return { b0, b1, t0, entry };
}

// Besitzwechsel/Stillstand: laufende Planung an der Stelle t festhalten (Firefox ohne cancelAndHoldAtTime: Wert aus
// der eigenen Planung) und in 20 ms auf `to` rampen
export function handover(param, t, fallback, to) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
  else { param.cancelScheduledValues(t); param.setValueAtTime(fallback, t); }
  if (to != null) param.linearRampToValueAtTime(to, t + 0.02);
}

// ---------- Vorlagen ----------

export const TEMPLATE_BARS = [1, 2, 4, 8];
export const AUTO_TEMPLATES = {
  fadeIn: { name: 'fadeIn', label: 'Einblenden', key: 'volume', from: 0, to: 1, anchor: 'start', bars: 4 },
  fadeOut: { name: 'fadeOut', label: 'Ausblenden', key: 'volume', from: 1, to: 0, anchor: 'end', bars: 4 },
};

const clipsOf = (project, target) => (target === 'master' ? project.tracks : project.tracks.filter((t) => t.id === target)).flatMap((t) => t.clips);

// Bereich einer Vorlage: Loop-Bereich, wenn aktiv; sonst ab dem ersten Clip / bis zum Ende des letzten Clips / ab dem
// Takt der Abspielmarke, jeweils `bars` Takte lang
export function templateRange(project, target, name, { bars, playheadBeat = 0 } = {}) {
  const tpl = AUTO_TEMPLATES[name];
  if (!tpl) return null;
  const loop = project.loop;
  if (loop?.on && loop.endBeat > loop.startBeat) return { fromBeat: loop.startBeat, toBeat: loop.endBeat };
  const len = (bars || tpl.bars) * project.beatsPerBar;
  const clips = clipsOf(project, target);
  const song = project.lengthBars * project.beatsPerBar;
  let fromBeat;
  if (tpl.anchor === 'end') {
    const end = clips.length ? Math.max(...clips.map((c) => c.startBeat + c.lengthBeats)) : song;
    fromBeat = Math.max(0, end - len);
    return end > fromBeat ? { fromBeat, toBeat: end } : null;
  }
  if (tpl.anchor === 'playhead') fromBeat = Math.floor(playheadBeat / project.beatsPerBar + EPS) * project.beatsPerBar;
  else fromBeat = clips.length ? Math.min(...clips.map((c) => c.startBeat)) : 0;
  return { fromBeat, toBeat: fromBeat + len };
}

// Neue Punktliste: Punkte im Bereich ersetzt, davor klingt alles wie vorher (Haltepunkt bzw. Stufe vor dem Bereich)
export function templatePoints(points, name, fromBeat, toBeat) {
  const tpl = AUTO_TEMPLATES[name];
  const def = AUTO_PARAMS[tpl.key].def;
  const before = points.filter((p) => p.beat < fromBeat - EPS).map((p) => ({ ...p }));
  const after = points.filter((p) => p.beat > toBeat + EPS);
  const old = autoValueAt(points, fromBeat, def);
  if (fromBeat > EPS && Math.abs(old - tpl.from) > EPS) {
    const last = before[before.length - 1];
    if (!last) before.push({ beat: 0, value: old, curve: 'step' });
    else if (last.curve === 'step' || Math.abs(last.value - old) < EPS) last.curve = 'step';
    else if (fromBeat - STEP_BEATS > last.beat + EPS) before.push({ beat: fromBeat - STEP_BEATS, value: autoValueAt(points, fromBeat - STEP_BEATS, def) });
  }
  return [...before, { beat: fromBeat, value: tpl.from }, { beat: toBeat, value: tpl.to }, ...after];
}

// ---------- Kurven wandern mit Clips ----------

const curveAt = (points, beat) => {
  let c;
  for (const p of points) { if (p.beat <= beat + EPS) c = p.curve; else break; }
  return c;
};
const sortPts = (pts) => pts.sort((a, b) => a.beat - b.beat);

// Haltepunkt setzen, sofern er den Verlauf ändert (lineare Stücke bleiben dann ohne Zusatzpunkt)
function addHold(pts, beat, value, curve, def) {
  if (!curve && pts.length && Math.abs(autoValueAt(pts, beat, def) - value) < EPS) return;
  const i = pts.findIndex((p) => Math.abs(p.beat - beat) < EPS);
  const q = curve ? { beat, value, curve } : { beat, value };
  if (i >= 0) pts[i] = q;
  else { pts.push(q); sortPts(pts); }
}

// Verschobene/kopierte Clips nehmen die Punkte ihres Bereichs [s0, e0) mit (Spec-Zusatz von Martin):
// moves = [{ from, to, s0, e0, s1 }] mit Spur-Objekten. Inhalt kommt aus den Kurven vor der Aktion; an den Grenzen
// halten Haltepunkte den bisherigen Verlauf außerhalb fest. Unterscheiden sich innen und außen an einer neuen Grenze,
// springt die Kurve außerhalb in 1/128 Schlag. Spuren ohne Punkte im Bereich bleiben unberührt. Ändert die Spuren.
export function carryAutomation(moves, { copy = false } = {}) {
  const orig = new Map();
  const lane = (t, key) => {
    if (!orig.has(t)) orig.set(t, {});
    const o = orig.get(t);
    if (!(key in o)) o[key] = laneOf(t, key);
    return o[key];
  };
  const work = new Map();
  const cur = (t, key) => {
    if (!work.has(t)) work.set(t, {});
    const w = work.get(t);
    if (!(key in w)) w[key] = lane(t, key).map((p) => ({ ...p }));
    return w[key];
  };
  const jobs = [];
  for (const m of moves) {
    if (m.from === m.to && Math.abs(m.s1 - m.s0) < EPS && !copy) continue;
    for (const key of autoKeys(m.from.id)) {
      const src = lane(m.from, key);
      const inner = src.filter((p) => p.beat >= m.s0 - EPS && p.beat < m.e0 - EPS);
      if (!inner.length) continue;
      lane(m.to, key);
      const def = AUTO_PARAMS[key].def;
      const d = m.s1 - m.s0;
      const content = inner.map((p) => ({ ...p, beat: p.beat + d }));
      if (inner[0].beat > m.s0 + EPS) content.unshift({ beat: m.s1, value: autoValueAt(src, m.s0, def) });
      content.push({ beat: m.e0 + d, value: autoValueAt(src, m.e0, def) });
      jobs.push({ m, key, content, def });
    }
  }
  if (!jobs.length) return false;
  // Quellen räumen: Inhalt raus, Ränder mit dem ursprünglichen Wert festhalten
  if (!copy) {
    for (const { m, key, def } of jobs) {
      const src = lane(m.from, key);
      const w = cur(m.from, key);
      const keep = w.filter((p) => !(p.beat >= m.s0 - EPS && p.beat < m.e0 - EPS));
      addHold(keep, m.s0, autoValueAt(src, m.s0, def), undefined, def);
      addHold(keep, m.e0, autoValueAt(src, m.e0, def), curveAt(src, m.e0), def);
      work.get(m.from)[key] = keep;
    }
  }
  // Ziele: Bereich ersetzen, außerhalb bleibt der Verlauf
  for (const { m, key, content, def } of jobs) {
    const base = cur(m.to, key);
    const s1 = m.s1;
    const e1 = content[content.length - 1].beat;
    const vL = autoValueAt(base, s1, def);
    const vR = autoValueAt(base, e1, def);
    const jumpL = Math.abs(vL - content[0].value) > EPS && s1 - STEP_BEATS > -EPS;
    const jumpR = Math.abs(vR - content[content.length - 1].value) > EPS;
    const lo = jumpL ? s1 - STEP_BEATS : s1;
    const hi = jumpR ? e1 + STEP_BEATS : e1;
    const out = base.filter((p) => p.beat < lo - EPS || p.beat > hi + EPS);
    const holdL = jumpL ? [{ beat: lo, value: autoValueAt(base, lo, def) }] : [];
    const tail = content.map((p) => ({ ...p }));
    const end = tail[tail.length - 1];
    delete end.curve;
    const rc = curveAt(base, jumpR ? hi : e1);
    const holdR = jumpR ? [rc ? { beat: hi, value: autoValueAt(base, hi, def), curve: rc } : { beat: hi, value: autoValueAt(base, hi, def) }] : [];
    if (!jumpR && rc) end.curve = rc;
    work.get(m.to)[key] = sortPts([...out, ...holdL, ...tail, ...holdR]);
  }
  for (const [t, lanes] of work) {
    for (const [key, pts] of Object.entries(lanes)) setLane(t, key, pts);
  }
  return true;
}

// Punktliste am Besitzer speichern; leere Kurven und leere automation-Objekte fallen weg
export function setLane(owner, key, pts) {
  const lane = normalizeLane(key, pts);
  const a = owner.automation && typeof owner.automation === 'object' && !Array.isArray(owner.automation) ? { ...owner.automation } : {};
  if (lane.length) a[key] = lane; else delete a[key];
  if (Object.keys(a).length) owner.automation = a; else delete owner.automation;
}
