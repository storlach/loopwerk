// Projektmodell: Projekt → Spuren → Clips. Alle Positionen in Schlägen (Beats).
// Ein Clip verweist auf ein Sample und wiederholt es über seine Länge (wie ein Objekt im Music Maker).

import { Emitter } from './util.js';
import { KEYS, KEY_MAJOR, minorOf, wrapSemis, isSoundKey } from './keys.js';
import { withFx, fxOrderOf, isDefaultOrder, busDef, ECHO_TIMES } from './effects.js';
import { isChord } from './harmony.js';
import { normalizeRecipe, soundFields, newVariantId, newGroupId, MIN_SPAN } from './recipe.js';
import { PAD_IDS, grooveRows, grooveOf } from './grooves.js';
import { AUTO_PARAMS, autoKeys, laneOf, setLane, templateRange, templatePoints, templateRest, carryAutomation, AUTO_TEMPLATES, STEP_BEATS, fxOfKey } from './automation.js';

export const EPS = 1e-6;
export const DEFAULT_TRACK_NAME = /^Spur \d+$/;
export const PROJECT_VERSION = 1;

// mastering: Stil-ID (Krachwerk: „balanced“) schaltet das Mastering von Anfang an ein
export function createEmptyProject({ tracks = 8, bpm = 120, mastering = null } = {}) {
  return {
    ...(mastering ? { master: { volume: 0.85, fx: null, mastering: { on: true, style: mastering } } } : {}),
    version: PROJECT_VERSION,
    name: 'unbenannt',
    bpm,
    beatsPerBar: 4,
    lengthBars: 32,
    loop: { on: false, startBeat: 0, endBeat: 16 },
    tracks: Array.from({ length: tracks }, (_, i) => ({
      id: 't' + (i + 1),
      name: 'Spur ' + (i + 1),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      clips: [],
    })),
  };
}

export function createDemoProject() {
  const p = createEmptyProject();
  p.name = 'Beispiel-Arrangement';
  const names = ['Drums', 'Hi-Hats', 'Bass', 'Pad', 'Arp', 'Melodie', 'FX', 'Spur 8'];
  p.tracks.forEach((t, i) => { t.name = names[i]; });
  let n = 0;
  const put = (ti, sampleId, startBar, bars) => {
    p.tracks[ti].clips.push({ id: 'c' + (++n), sampleId, startBeat: startBar * 4, lengthBeats: bars * 4, offsetBeats: 0 });
  };
  put(0, 'drums-four', 4, 12);
  put(1, 'drums-hats16', 8, 8);
  put(2, 'bass-prog', 4, 12);
  put(3, 'chords-pad', 0, 16);
  put(4, 'synth-arp-prog', 8, 8);
  put(5, 'synth-lead', 12, 4);
  put(6, 'fx-riser', 2, 2);
  put(6, 'fx-crash', 4, 1);
  p.tracks[3].volume = 0.65;
  p.tracks[4].volume = 0.6;
  return p;
}

// Zerlegt einen Clip in die einzelnen Wiederholungen seines Samples.
export function clipSegments(clip, sampleBeats) {
  const segs = [];
  const end = clip.startBeat + clip.lengthBeats;
  let pos = clip.startBeat;
  let off = (clip.offsetBeats || 0) % sampleBeats;
  while (pos < end - EPS) {
    const segEnd = Math.min(pos + sampleBeats - off, end);
    segs.push({ start: pos, end: segEnd, offset: off });
    pos = segEnd;
    off = 0;
  }
  return segs;
}

export function clipSignature(trackId, clip) {
  return `${trackId}|${clip.sampleId}|${clip.startBeat}|${clip.lengthBeats}|${clip.offsetBeats || 0}|${clipGain(clip)}|${clip.fadeInBeats || 0}|${clip.fadeOutBeats || 0}|${clip.fadeInCurve || 0}|${clip.fadeOutCurve || 0}|${clip.z ?? 0}|${clip.stretch ?? 1}|${clip.varispeed ? 1 : 0}${clip.mute ? '|m' : ''}`;
}

// Stapel: Liegen Clips einer Spur übereinander, klingt der obere. Der untere bleibt unverändert erhalten
// und ist wieder zu hören, sobald nichts mehr über ihm liegt. Oben liegt, wer zuletzt abgelegt wurde (z);
// ohne z (alte Projekte) der später beginnende.
export function isAbove(a, b, clips) {
  const za = a.z ?? 0;
  const zb = b.z ?? 0;
  if (za !== zb) return za > zb;
  if (Math.abs(a.startBeat - b.startBeat) > EPS) return a.startBeat > b.startBeat;
  return clips.indexOf(a) > clips.indexOf(b);
}

// Hörbare Bereiche je Clip einer Spur: Clip-Bereich ohne alles, was ein höher liegender Clip verdeckt.
export function audibleRanges(track) {
  const map = new Map();
  const clips = track.clips;
  for (const c of clips) {
    let parts = [[c.startBeat, c.startBeat + c.lengthBeats]];
    for (const o of clips) {
      if (o === c || !parts.length || !isAbove(o, c, clips)) continue;
      const os = o.startBeat;
      const oe = os + o.lengthBeats;
      parts = parts.flatMap(([s, e]) => {
        if (oe <= s + EPS || os >= e - EPS) return [[s, e]];
        const rest = [];
        if (os > s + EPS) rest.push([s, os]);
        if (oe < e - EPS) rest.push([oe, e]);
        return rest;
      });
    }
    map.set(c.id, parts);
  }
  return map;
}

// Stumme Clips (clip.mute) klingen nirgends, verdecken aber weiter, was unter ihnen liegt – eine Stelle für Realtime und Offline
export function audibleMap(project) {
  const map = new Map();
  for (const t of project.tracks) {
    const muted = new Set(t.clips.filter((c) => c.mute).map((c) => c.id));
    for (const [id, r] of audibleRanges(t)) map.set(id, muted.has(id) ? [] : r);
  }
  return map;
}

// Alle Sounds, die das Projekt braucht: Clips (auch stumme), Kit-Pads und Instrument-Sounds (ADR 012) und die Eltern
// benutzter Varianten (ADR 010, kein eigenes Audio)
export function usedSampleIds(project) {
  const ids = new Set();
  for (const t of project.tracks || []) for (const c of t.clips || []) ids.add(c.sampleId);
  for (const k of Object.values(project.kits || {})) for (const id of Object.values(k?.map || {})) if (typeof id === 'string') ids.add(id);
  for (const i of Object.values(project.instruments || {})) if (typeof i?.sampleId === 'string') ids.add(i.sampleId);
  for (const id of [...ids]) { const parent = project.recipes?.[id]?.parent; if (parent) ids.add(parent); }
  return ids;
}

// Wiederholungen eines Clips, beschnitten auf seine hörbaren Bereiche: [{ seg, from, to }]
export function audibleSegments(clip, sampleBeats, ranges) {
  const out = [];
  for (const seg of clipSegments(clip, sampleBeats)) {
    for (const [s, e] of ranges ?? [[seg.start, seg.end]]) {
      const from = Math.max(seg.start, s);
      const to = Math.min(seg.end, e);
      if (to - from > EPS) out.push({ seg, from, to });
    }
  }
  return out;
}

// Länge nach einer Geschwindigkeitsänderung: liegt sie fast auf einer Rasterlinie (1/64 Schlag), rastet sie dort ein.
// So bleiben aus 48 Schlägen bei 150 % genau 32 (statt 32,0016 durch die gerundete Laufzeit), und 100 % stellt die
// Ausgangslänge wieder her. Krumme Längen (4 Schläge bei 125 % = 3,2) bleiben, damit der Sound nicht beschnitten wird.
export function snapNear(beats, grid = 1 / 64) {
  const g = Math.round(beats / grid) * grid;
  return Math.abs(g - beats) <= 1e-3 + beats * 2e-4 ? g : beats;
}

// Geschwindigkeit eines Clips = 1 / Laufzeit (clip.stretch). „Wie Tonband“ (clip.varispeed): der Grund-Sound läuft mit
// playbackRate schneller oder langsamer, die Tonhöhe ändert sich mit. Sounds, die der Tonart folgen (tonale Patterns,
// erzeugte Loops mit Tonart), würden dabei verstimmt – sie werden stattdessen gedehnt (gleiche Tonhöhe).
export const clipSpeed = (clip) => 1 / (clip.stretch || 1);
export const canVarispeed = (library, sampleId) => !library?.followsKey?.(sampleId) && !library?.followsChords?.(sampleId);
export function tapeRate(library, clip) {
  const f = clip.stretch || 1;
  return clip.varispeed && f !== 1 && canVarispeed(library, clip.sampleId) ? 1 / f : 1;
}

// Der Sound, den ein Clip tatsächlich spielt: bei geänderter Laufzeit die gedehnte Fassung (null, solange die erste entsteht),
// wie Tonband der Grund-Sound (Tempo über tapeRate). stale: bis die neue Fassung da ist, gilt die vorige, wenn sie gleich
// lang ist (z. B. beim Ziehen am Rezept) oder im alten Tempo vorliegt (Tempowechsel, die Engine gleicht das Tempo aus).
export function sampleFor(library, clip, stale = true) {
  return clip.stretch && clip.stretch !== 1 && tapeRate(library, clip) === 1 ? library.stretched(clip.sampleId, clip.stretch, stale) : library.get(clip.sampleId);
}

// Spurgruppen: eine Gruppe kann ihre Spuren gemeinsam stumm oder solo schalten (die Spuren behalten ihre eigenen Schalter)
export function groupOf(project, track) {
  return track.groupId ? project.groups?.find((g) => g.id === track.groupId) ?? null : null;
}
export function trackState(project, track) {
  const g = groupOf(project, track);
  return { mute: !!track.mute || !!g?.mute, solo: !!track.solo || !!g?.solo };
}
export function anySoloOf(project) {
  return project.tracks.some((t) => trackState(project, t).solo);
}

export const MAX_TRACKS = 16;
export const MIN_BPM = 60;
export const MAX_BPM = 200;
export const clipGain = (clip) => clip.gain ?? 1;
// Clip-Lautstärke bis +12 dB. Regler und Griff: 0…1 wie bisher linear (0 dB = 1), darüber ein Fünftel Regelweg in dB
export const MAX_CLIP_GAIN = 10 ** (12 / 20);
export const GAIN_SLIDER_MAX = 1.25;
export const gainToSlider = (g) => (g <= 1 ? Math.max(0, g) : 1 + 0.25 * Math.min(1, (20 * Math.log10(g)) / 12));
export const sliderToGain = (p) => (p <= 1 ? Math.max(0, p) : 10 ** ((Math.min(0.25, p - 1) / 0.25) * 12 / 20));

// Fades begrenzen: nie negativ, zusammen nie länger als der Clip.
export function normalizeClip(clip) {
  clip.gain = Math.min(MAX_CLIP_GAIN, Math.max(0, clipGain(clip)));
  let fi = Math.max(0, clip.fadeInBeats || 0);
  let fo = Math.max(0, clip.fadeOutBeats || 0);
  if (fi + fo > clip.lengthBeats) {
    const k = clip.lengthBeats / (fi + fo);
    fi *= k;
    fo *= k;
  }
  clip.fadeInBeats = fi;
  clip.fadeOutBeats = fo;
  for (const k of ['fadeInCurve', 'fadeOutCurve']) if (clip[k] != null) clip[k] = fadeCurveOf(clip[k]);
  if (clip.mute) clip.mute = true; else delete clip.mute;
  return clip;
}

// Krümmung eines Fades: −1 (langsam, exponentiell) … 0 (linear) … 1 (schnell, logarithmisch). Fehlt sie, ist er linear.
export const fadeCurveOf = (c) => {
  const v = Math.min(1, Math.max(-1, Number(c) || 0));
  return Math.abs(v) < 1e-3 ? 0 : Math.round(v * 1000) / 1000;
};

// Form eines Fades als quadratische Bézierkurve von (0,0) nach (1,1) mit dem Kontrollpunkt ((1−c)/2, (1+c)/2):
// t = Anteil der Fade-Länge, Ergebnis = Pegelanteil 0…1. Der Griff im Arranger sitzt auf dem Kurvenpunkt bei s = ½.
export function fadeShape(t, c = 0) {
  t = Math.min(1, Math.max(0, t));
  if (!c) return t;
  const s = (Math.sqrt((1 - c) ** 2 + 4 * c * t) - (1 - c)) / (2 * c);
  return Math.min(1, Math.max(0, (1 + c) * s - c * s * s));
}

// Kurvenpunkt in der Mitte des Fades (Bézier-Parameter ½) als [Zeitanteil, Pegelanteil]
export const fadeHandlePoint = (c = 0) => [0.5 - c / 4, 0.5 + c / 4];

// Lautstärke-Hüllkurve an Position x (Schläge ab Clip-Start).
export function clipEnvelope(clip, x) {
  const L = clip.lengthBeats;
  const fi = clip.fadeInBeats || 0;
  const fo = clip.fadeOutBeats || 0;
  let v = 1;
  if (fi > 0) v = Math.min(v, fadeShape(x / fi, clip.fadeInCurve || 0));
  if (fo > 0) v = Math.min(v, fadeShape((L - x) / fo, clip.fadeOutCurve || 0));
  return clipGain(clip) * Math.max(0, Math.min(1, v));
}

export function totalBeats(project) {
  return project.lengthBars * project.beatsPerBar;
}

// Songtonarten: die mitgelieferten Loops stehen in A-Moll; jede Moll-Tonart (mit paralleler Dur) ist wählbar.
export { KEYS, KEY_MAJOR };
export const keyOf = (project) => (KEYS.includes(project?.key) ? project.key : 'Am');
// Halbtöne von A-Moll aus, kürzester Weg (−6 … +5), damit Bässe nicht zu weit wandern
export function keySemis(key) {
  const d = (KEYS.indexOf(key) - 9 + 12) % 12;
  return d > 5 ? d - 12 : d;
}

// Tonart je Takt: project.keyChanges = [{ bar, key }], Taktnummern wie im Lineal (1 = Songanfang). Takt 1 hat immer
// die Grundtonart project.key; ein Wechsel gilt bis zum nächsten. Alte Projekte ohne das Feld haben keine Wechsel.
export function keyChangesOf(project) {
  const list = Array.isArray(project?.keyChanges) ? project.keyChanges : [];
  const byBar = new Map();
  for (const c of list) if (Number.isInteger(c?.bar) && c.bar >= 2 && KEYS.includes(c.key)) byBar.set(c.bar, c.key);
  return [...byBar].sort((a, b) => a[0] - b[0]).map(([bar, key]) => ({ bar, key }));
}

export function keyAtBar(project, bar) {
  let key = keyOf(project);
  for (const c of keyChangesOf(project)) { if (c.bar > bar) break; key = c.key; }
  return key;
}

export const barOfBeat = (project, beat) => Math.floor(beat / project.beatsPerBar + EPS) + 1;
export const keyAtBeat = (project, beat) => keyAtBar(project, barOfBeat(project, beat));

// Halbtöne von der Grundtonart zu `key` – so weit wandern Loops und Melodien, wie beim Wechsel der Songtonart
export const keyDelta = (project, key) => keySemis(key) - keySemis(keyOf(project));

// Eigene Sounds mit Tonart (project.soundKeys = { sampleId: { key, follow } }, optional): so weit wandert ein Sound
// in `key` (Moll-Song-Tonart), auf kürzestem Weg; Dur-Sounds wie ihre parallele Moll-Tonart
export const soundKeysOf = (project) => (project?.soundKeys && typeof project.soundKeys === 'object' && !Array.isArray(project.soundKeys) ? project.soundKeys : {});
export const soundKeyShift = (soundKey, key) => (minorOf(soundKey) ? wrapSemis(keySemis(key) - keySemis(minorOf(soundKey))) : 0);

// Abschnitte gleicher Tonart im Bereich [from, to) (Schläge): [{ from, to, key }]
export function keySpans(project, from, to) {
  const bpb = project.beatsPerBar;
  const spans = [];
  let key = keyAtBeat(project, from);
  let start = from;
  for (const c of keyChangesOf(project)) {
    const b = (c.bar - 1) * bpb;
    if (b <= from + EPS) continue;
    if (b >= to - EPS) break;
    if (c.key === key) continue;
    spans.push({ from: start, to: b, key });
    start = b;
    key = c.key;
  }
  spans.push({ from: start, to, key });
  return spans;
}

// Akkord-Streifen: project.chords = [{ beat, chord }], chord = Stufe der dort gültigen Tonart („i“, „VI“ …) oder „-“
// (Pause). Ein Eintrag gilt bis zum nächsten; vor dem ersten Eintrag und ohne Streifen klingt die Stufe i.
// Raster: halbe Takte. Alte Projekte ohne das Feld haben keinen Streifen.
export const tonicOf = (key) => Math.max(0, KEYS.indexOf(key));
export const chordGrid = (project) => project.beatsPerBar / 2;
export function chordsOf(project) {
  const list = Array.isArray(project?.chords) ? project.chords : [];
  const byBeat = new Map();
  for (const c of list) if (Number.isFinite(c?.beat) && c.beat >= 0 && isChord(c.chord)) byBeat.set(c.beat, c.chord);
  return [...byBeat].sort((a, b) => a[0] - b[0]).map(([beat, chord]) => ({ beat, chord }));
}

export function chordAtBeat(project, beat, list = chordsOf(project)) {
  let chord = 'i';
  for (const c of list) { if (c.beat > beat + EPS) break; chord = c.chord; }
  return chord;
}

// Abschnitte gleichen Akkords im Bereich [from, to): [{ from, to, chord }]
export function chordSpans(project, from, to) {
  const list = chordsOf(project);
  const spans = [];
  let chord = chordAtBeat(project, from, list);
  let start = from;
  for (const c of list) {
    if (c.beat <= from + EPS) continue;
    if (c.beat >= to - EPS) break;
    if (c.chord === chord) continue;
    spans.push({ from: start, to: c.beat, chord });
    start = c.beat;
    chord = c.chord;
  }
  spans.push({ from: start, to, chord });
  return spans;
}

// Tonart und Akkord zusammen: [{ from, to, key, chord }] – geteilt an jedem Tonart- und Akkordwechsel
export function harmonySpans(project, from, to) {
  const out = [];
  for (const k of keySpans(project, from, to)) {
    for (const c of chordSpans(project, k.from, k.to)) out.push({ from: c.from, to: c.to, key: k.key, chord: c.chord });
  }
  return out;
}

// Tonhöhe verschieben und im Bereich der Piano-Roll halten (C2…C6)
export function transposePitch(m, delta) {
  m += delta;
  while (m > 84) m -= 12;
  while (m < 36) m += 12;
  return m;
}
export const transposePattern = (pattern, delta) => ({ ...pattern, notes: (pattern.notes || []).map((n) => ({ ...n, pitch: transposePitch(n.pitch, delta) })) });

// Automation ist optional (PROJECT_VERSION bleibt 1); abgelehnt wird nur ein Feld, das kein Objekt ist
const autoOk = (a) => a == null || (typeof a === 'object' && !Array.isArray(a));
// Klang-Rezepte (ADR 010) ebenso optional: nur als Objekt
const recipesOk = autoOk;

// Effekt-Reihenfolge (ADR 008): Liste oder fehlt; Sends und Busse: Objekt oder fehlt
const orderOk = (o) => o == null || Array.isArray(o);
const objOk = autoOk;

export function isValidProject(p) {
  return p && p.version === PROJECT_VERSION && Array.isArray(p.tracks) && p.tracks.every((t) => Array.isArray(t.clips) && autoOk(t.automation) && orderOk(t.fxOrder) && objOk(t.sends))
    && (p.keyChanges == null || Array.isArray(p.keyChanges)) && (p.chords == null || Array.isArray(p.chords)) && autoOk(p.master?.automation) && recipesOk(p.recipes)
    && orderOk(p.master?.fxOrder) && objOk(p.buses) && autoOk(p.kits) && autoOk(p.instruments);
}

// ---------- Kit und Instrument (ADR 012) ----------
const newObjId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
export const newKitId = () => newObjId('k-');
export const newInstrumentId = () => newObjId('in-');
export const isKitId = (id) => /^k-[a-z0-9]+$/.test(String(id));
export const isInstrumentId = (id) => /^in-[a-z0-9]+$/.test(String(id));
const cleanName = (v, def) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : def);

// Kit: Name, Map Pad → Sound (nur die 8 Zeilen, nur Text; Pads mit fehlendem Sound bleiben stehen und schweigen), Herkunft
export function normalizeKit(k) {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
  const map = {};
  for (const r of PAD_IDS) if (typeof k.map?.[r] === 'string' && k.map[r]) map[r] = k.map[r];
  const out = { name: cleanName(k.name, 'Kit'), map };
  if (k.from === 'pads.v1') out.from = 'pads.v1';
  return out;
}
export const INSTRUMENT_RELEASE = 0.3;
// Instrument: ein Sound mit Grundton (MIDI 36…96) und Feinstimmung (Cent, ±50), Ausklang 0…2 s
export function normalizeInstrument(i) {
  if (!i || typeof i !== 'object' || typeof i.sampleId !== 'string' || !i.sampleId) return null;
  const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Number(v))) : def);
  return {
    name: cleanName(i.name, 'Instrument'), sampleId: i.sampleId,
    root: Math.round(num(i.root, 36, 96, 60)), cents: Math.round(num(i.cents, -50, 50, 0)),
    release: Math.round(num(i.release, 0, 2, INSTRUMENT_RELEASE) * 100) / 100,
  };
}
export const kitOf = (project, id) => normalizeKit(project?.kits?.[id]);
export const instrumentOf = (project, id) => normalizeInstrument(project?.instruments?.[id]);

export class Store extends Emitter {
  // soundDuration(id) → Sekunden des Originals (optional): Ausschnitt eines Rezepts passt sich der Länge an
  constructor(project, { sampleBeats, sampleName, soundDuration }) {
    super();
    this.sampleBeats = sampleBeats;
    this.sampleName = sampleName;
    this.soundDuration = soundDuration;
    this.replace(project, 'init');
  }

  replace(project, reason = 'replace') {
    this.project = project;
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
    this.nextId = 1 + Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => parseInt(c.id.slice(1), 10) || 0)));
    this.emit(this.project, reason);
  }

  // Jede Änderung läuft hier durch und landet im Rückgängig-Verlauf.
  // `coalesce` fasst schnelle Folgeänderungen (z. B. Lautstärke-Regler ziehen) zu einem Schritt zusammen.
  // Mehrere Aktionen als ein Rückgängig-Schritt (z. B. ein Song-Starter); bei Fehler bleibt alles beim Alten
  batch(label, fn) {
    if (this._batching) return fn();
    const before = JSON.stringify(this.project);
    this._batching = true;
    let out;
    try {
      out = fn();
    } catch (e) {
      this.project = JSON.parse(before);
      throw e;
    } finally {
      this._batching = false;
    }
    if (JSON.stringify(this.project) === before) return out;
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    this.lastKey = null;
    this._autoName();
    this.emit(this.project, label);
    return out;
  }

  // anyTime: gleicher coalesce-Schlüssel fasst ohne Zeitgrenze zusammen (ein ●-Durchgang der Pad-Aufnahme)
  dispatch(label, mutate, { coalesce, anyTime = false } = {}) {
    if (this._batching) { mutate(this.project); return; }
    const now = performance.now();
    const merge = coalesce && coalesce === this.lastKey && (anyTime || now - this.lastTime < 1500);
    if (!merge) {
      this.undoStack.push(JSON.stringify(this.project));
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.lastKey = coalesce || null;
    this.lastTime = now;
    mutate(this.project);
    this._autoName();
    this.emit(this.project, label);
  }

  // Spuren mit Standardnamen („Spur 3“) heißen wie ihr erster Clip, bis man sie selbst umbenennt.
  _autoName() {
    if (!this.sampleName) return;
    this.project.tracks.forEach((t, i) => {
      if (!(t.autoName ?? DEFAULT_TRACK_NAME.test(t.name))) return;
      const first = t.clips.reduce((a, c) => (!a || c.startBeat < a.startBeat ? c : a), null);
      if (!first) {
        if (t.autoName) t.name = t.baseName || 'Spur ' + (i + 1);
        return;
      }
      const name = this.sampleName(first.sampleId);
      if (!name) return;
      if (!t.autoName) t.baseName = t.name;
      t.name = name.slice(0, 32);
      t.autoName = true;
    });
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    this.lastKey = null;
    this.emit(this.project, 'undo');
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this.lastKey = null;
    this.emit(this.project, 'redo');
  }

  newId() { return 'c' + this.nextId++; }

  findClip(clipId) {
    for (const track of this.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  track(trackId) { return this.project.tracks.find((t) => t.id === trackId); }

  // Wer abgelegt oder bearbeitet wird, liegt oben. Überlappungen zerstören nichts: darunterliegende Clips
  // bleiben vollständig erhalten, sie sind nur dort stumm, wo etwas über ihnen liegt (audibleRanges).
  _raise(track, clip) {
    const others = track.clips.filter((c) => c !== clip);
    const overlaps = others.some((c) => c.startBeat < clip.startBeat + clip.lengthBeats - EPS && c.startBeat + c.lengthBeats > clip.startBeat + EPS);
    if (overlaps) clip.z = 1 + Math.max(0, ...others.map((c) => c.z ?? 0));
    track.clips.sort((a, b) => a.startBeat - b.startBeat);
  }

  _fit(startBeat, lengthBeats) {
    const total = totalBeats(this.project);
    const start = Math.max(0, Math.min(startBeat, total - 1));
    return { start, length: Math.max(EPS, Math.min(lengthBeats, total - start)) };
  }

  addClip(trackId, sampleId, startBeat, lengthBeats) {
    const id = this.newId();
    this.dispatch('add-clip', () => {
      const track = this.track(trackId);
      const { start, length } = this._fit(startBeat, lengthBeats);
      const clip = { id, sampleId, startBeat: start, lengthBeats: length, offsetBeats: 0 };
      track.clips.push(clip);
      this._raise(track, clip);
    });
    return id;
  }

  moveClip(clipId, trackId, startBeat, { copy = false } = {}) {
    const found = this.findClip(clipId);
    if (!found) return null;
    const newId = copy ? this.newId() : clipId;
    this.dispatch(copy ? 'copy-clip' : 'move-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const target = this.track(trackId);
      const { start, length } = this._fit(startBeat, clip.lengthBeats);
      carryAutomation([{ from: track, to: target, s0: clip.startBeat, e0: clip.startBeat + clip.lengthBeats, s1: start }], { copy });
      let moved;
      if (copy) {
        moved = { ...clip, id: newId, startBeat: start, lengthBeats: length };
      } else {
        track.clips = track.clips.filter((c) => c !== clip);
        moved = clip;
        moved.startBeat = start;
        moved.lengthBeats = length;
      }
      normalizeClip(moved);
      target.clips.push(moved);
      this._raise(target, moved);
    });
    return newId;
  }

  resizeClip(clipId, lengthBeats) {
    this.dispatch('resize-clip', () => {
      const { track, clip } = this.findClip(clipId);
      clip.lengthBeats = this._fit(clip.startBeat, lengthBeats).length;
      normalizeClip(clip);
      this._raise(track, clip);
    });
  }

  // Mehrere Clips gemeinsam verschieben oder kopieren (ein Rückgängig-Schritt). moves: [{ id, trackId, startBeat }]
  moveClips(moves, { copy = false } = {}) {
    const ids = moves.map(() => (copy ? this.newId() : null));
    this.dispatch(copy ? 'copy-clips' : 'move-clips', () => {
      const placed = [];
      // Kurven wandern mit: alle Bereiche aus dem Stand vor der Aktion
      carryAutomation(moves.map((m) => {
        const found = this.findClip(m.id);
        const target = this.track(m.trackId);
        if (!found || !target) return null;
        const { track, clip } = found;
        return { from: track, to: target, s0: clip.startBeat, e0: clip.startBeat + clip.lengthBeats, s1: this._fit(m.startBeat, clip.lengthBeats).start };
      }).filter(Boolean), { copy });
      moves.forEach((m, i) => {
        const found = this.findClip(m.id);
        if (!found) return;
        const { track, clip } = found;
        const { start, length } = this._fit(m.startBeat, clip.lengthBeats);
        let moved;
        if (copy) moved = { ...clip, id: ids[i], startBeat: start, lengthBeats: length };
        else {
          track.clips = track.clips.filter((c) => c !== clip);
          moved = Object.assign(clip, { startBeat: start, lengthBeats: length });
        }
        normalizeClip(moved);
        const target = this.track(m.trackId);
        target.clips.push(moved);
        placed.push([target, moved]);
      });
      for (const [t, c] of placed) this._raise(t, c);
    });
    return copy ? ids : moves.map((m) => m.id);
  }

  deleteClips(ids) {
    const set = new Set(ids.filter((id) => this.findClip(id)));
    if (!set.size) return;
    this.dispatch('delete-clips', (p) => { for (const t of p.tracks) t.clips = t.clips.filter((c) => !set.has(c.id)); });
  }

  // Mehrere Clips als Block direkt hinter sich kopieren; Abstände untereinander bleiben
  duplicateClips(ids) {
    const found = ids.map((id) => this.findClip(id)).filter(Boolean);
    if (!found.length) return [];
    const start = Math.min(...found.map((f) => f.clip.startBeat));
    const end = Math.max(...found.map((f) => f.clip.startBeat + f.clip.lengthBeats));
    if (end >= totalBeats(this.project) - EPS) return [];
    return this.moveClips(found.map((f) => ({ id: f.clip.id, trackId: f.track.id, startBeat: f.clip.startBeat + (end - start) })), { copy: true });
  }

  // Laufzeit: der Clip spielt factor-fach so lang (2 = halbes Tempo, Geschwindigkeit 50 %); ohne varispeed gleiche Tonhöhe.
  // Länge und Startpunkt im Sample wachsen mit, damit derselbe Inhalt zu hören ist.
  // from: Stand des Clips zu Beginn eines Ziehvorgangs (Länge wird von dort gerechnet, auch wenn das Song-Ende sie
  // zwischendurch kappt); coalesce: ein Rückgängig-Schritt je Ziehvorgang; varispeed: Schalter „wie Tonband“.
  setClipStretch(clipId, factor, { coalesce, from, varispeed } = {}) {
    const found = this.findClip(clipId);
    if (!found) return;
    const f = Math.min(4, Math.max(0.25, Math.round(factor * 1e4) / 1e4));
    const ref = from ?? { ...found.clip };
    const old = ref.stretch || 1;
    const tape = varispeed ?? !!found.clip.varispeed;
    if (f === (found.clip.stretch || 1) && tape === !!found.clip.varispeed) return;
    this.dispatch('stretch', () => {
      const { track, clip } = this.findClip(clipId);
      const k = f / old;
      if (f === 1) delete clip.stretch; else clip.stretch = f;
      if (tape) clip.varispeed = true; else delete clip.varispeed;
      clip.offsetBeats = (ref.offsetBeats || 0) * k;
      clip.fadeInBeats = (ref.fadeInBeats || 0) * k;
      clip.fadeOutBeats = (ref.fadeOutBeats || 0) * k;
      clip.lengthBeats = this._fit(clip.startBeat, snapNear(ref.lengthBeats * k)).length;
      normalizeClip(clip);
      this._raise(track, clip);
    }, { coalesce });
  }

  // Geschwindigkeit 0,5–2 (50–200 %) als Kehrwert der Laufzeit
  setClipSpeed(clipId, speed, opts = {}) {
    if (!(speed > 0)) return;
    this.setClipStretch(clipId, 1 / Math.min(2, Math.max(0.5, speed)), opts);
  }

  setClipVarispeed(clipId, on) {
    const found = this.findClip(clipId);
    if (found) this.setClipStretch(clipId, found.clip.stretch || 1, { varispeed: !!on });
  }

  deleteClip(clipId) {
    if (!this.findClip(clipId)) return;
    this.dispatch('delete-clip', () => {
      const { track } = this.findClip(clipId);
      track.clips = track.clips.filter((c) => c.id !== clipId);
    });
  }

  setClip(clipId, patch, coalesce) {
    if (!this.findClip(clipId)) return;
    this.dispatch('clip', () => normalizeClip(Object.assign(this.findClip(clipId).clip, patch)), { coalesce });
  }

  // Linken Rand verschieben: Inhalt bleibt an seiner Stelle, nur der Anfang wandert.
  trimClipStart(clipId, startBeat) {
    if (!this.findClip(clipId)) return;
    this.dispatch('trim-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const end = clip.startBeat + clip.lengthBeats;
      const start = Math.max(0, Math.min(startBeat, end - EPS * 10));
      const sb = this.sampleBeats(clip.sampleId) * (clip.stretch || 1);
      clip.offsetBeats = ((((clip.offsetBeats || 0) + (start - clip.startBeat)) % sb) + sb) % sb;
      clip.startBeat = start;
      clip.lengthBeats = end - start;
      normalizeClip(clip);
      this._raise(track, clip);
    });
  }

  // Teilt die angegebenen Clips (ohne Angabe: alle) an Schlag `beat`. Gibt die neuen rechten Teile zurück.
  splitAt(beat, clipIds = null) {
    const targets = [];
    for (const track of this.project.tracks) {
      for (const c of track.clips) {
        if (clipIds && !clipIds.includes(c.id)) continue;
        if (beat > c.startBeat + EPS && beat < c.startBeat + c.lengthBeats - EPS) targets.push(c.id);
      }
    }
    if (!targets.length) return [];
    const created = targets.map(() => this.newId());
    this.dispatch('split', () => {
      targets.forEach((id, i) => {
        const { track, clip } = this.findClip(id);
        const sb = this.sampleBeats(clip.sampleId) * (clip.stretch || 1);
        const end = clip.startBeat + clip.lengthBeats;
        const right = normalizeClip({
          ...clip,
          id: created[i],
          startBeat: beat,
          lengthBeats: end - beat,
          offsetBeats: ((clip.offsetBeats || 0) + (beat - clip.startBeat)) % sb,
          fadeInBeats: 0,
          fadeInCurve: undefined,
        });
        clip.lengthBeats = beat - clip.startBeat;
        clip.fadeOutBeats = 0;
        delete clip.fadeOutCurve;
        normalizeClip(clip);
        track.clips.splice(track.clips.indexOf(clip) + 1, 0, right);
      });
    });
    return created;
  }

  duplicateClip(clipId) {
    const found = this.findClip(clipId);
    if (!found) return null;
    const total = totalBeats(this.project);
    const start = found.clip.startBeat + found.clip.lengthBeats;
    if (start >= total - EPS) return null;
    const id = this.newId();
    this.dispatch('duplicate-clip', () => {
      const { track, clip } = this.findClip(clipId);
      const copy = normalizeClip({ ...clip, id, startBeat: start, lengthBeats: Math.min(clip.lengthBeats, total - start) });
      carryAutomation([{ from: track, to: track, s0: clip.startBeat, e0: start, s1: start }], { copy: true });
      track.clips.push(copy);
      this._raise(track, copy);
    });
    return id;
  }

  _newTrackId() {
    return 't' + (1 + Math.max(0, ...this.project.tracks.map((t) => parseInt(t.id.slice(1), 10) || 0)));
  }

  // after: neue Spur direkt unter dieser Spur (sonst am Ende); name/volume: Vorgaben für die neue Spur
  addTrack({ after = null, name = null, volume = 0.8 } = {}) {
    if (this.project.tracks.length >= MAX_TRACKS) return null;
    const id = this._newTrackId();
    this.dispatch('add-track', (p) => {
      const track = { id, name: name ?? 'Spur ' + (p.tracks.length + 1), volume, pan: 0, mute: false, solo: false, clips: [] };
      const at = after == null ? -1 : p.tracks.findIndex((t) => t.id === after);
      if (at < 0) p.tracks.push(track); else p.tracks.splice(at + 1, 0, track);
    });
    return id;
  }

  // Clips, die im Bereich [fromBeat, toBeat) klingen (hörbare Spur, nicht stumm, nicht verdeckt)
  audibleClipsIn(fromBeat, toBeat) {
    const p = this.project;
    const aud = audibleMap(p);
    const solo = anySoloOf(p);
    const out = [];
    for (const t of p.tracks) {
      const st = trackState(p, t);
      if (st.mute || (solo && !st.solo)) continue;
      for (const c of t.clips) if ((aud.get(c.id) || []).some(([s, e]) => s < toBeat - EPS && e > fromBeat + EPS)) out.push(c.id);
    }
    return out;
  }

  // Festhalten (Krachwerk 3a): neuer Sound sampleId liegt als Clip [fromBeat, fromBeat + lengthBeats) auf einer neuen Spur
  // direkt unter der untersten Quellspur (0 dB, Mitte, ohne Effekte). loop: sampleTempo = Bereich. mute: die Quell-Clips
  // (clipIds bzw. alle hörbaren im Bereich) werden an den Bereichsgrenzen geteilt, die inneren Stücke stumm.
  // Ein Rückgängig-Schritt. Rückgabe { trackId, clipId } | null (keine Spur mehr frei)
  freeze({ fromBeat, toBeat, sampleId, clipIds = null, mute = true, lengthBeats = null, loop = true, name = null }) {
    if (!(toBeat > fromBeat + EPS) || this.project.tracks.length >= MAX_TRACKS) return null;
    const p = this.project;
    const sources = (clipIds ?? this.audibleClipsIn(fromBeat, toBeat)).filter((id) => this.findClip(id));
    const idx = sources.map((id) => p.tracks.indexOf(this.findClip(id).track));
    const after = idx.length ? p.tracks[Math.max(...idx)].id : null;
    const solo = anySoloOf(p);
    let out = null;
    this.batch('Festhalten', () => {
      const trackId = this.addTrack({ after, name: String(name ?? this.sampleName?.(sampleId) ?? 'Schleife').slice(0, 32), volume: 1 });
      const track = this.track(trackId);
      if (solo) track.solo = true; // sonst schwiege die neue Spur neben einer Solo-Quelle
      const total = totalBeats(this.project);
      const len = Math.min(lengthBeats ?? toBeat - fromBeat, total - fromBeat);
      const clip = { id: this.newId(), sampleId, startBeat: fromBeat, lengthBeats: len, offsetBeats: 0 };
      track.clips.push(normalizeClip(clip));
      if (loop) this.project.sampleTempo = { ...(this.project.sampleTempo || {}), [sampleId]: toBeat - fromBeat };
      if (mute && sources.length) {
        const all = new Set(sources);
        for (const id of this.splitAt(fromBeat, [...all])) all.add(id);
        for (const id of this.splitAt(toBeat, [...all])) all.add(id);
        for (const id of all) {
          const c = this.findClip(id)?.clip;
          if (c && c.startBeat >= fromBeat - EPS && c.startBeat + c.lengthBeats <= toBeat + EPS) c.mute = true;
        }
      }
      out = { trackId, clipId: clip.id };
    });
    return out;
  }

  removeTrack(trackId) {
    if (this.project.tracks.length <= 1 || !this.track(trackId)) return;
    this.dispatch('remove-track', (p) => { p.tracks = p.tracks.filter((t) => t.id !== trackId); this._pruneGroups(); });
  }

  // ---------- Spurgruppen (Akkordeon) ----------

  _pruneGroups() {
    const p = this.project;
    if (!p.groups) return;
    p.groups = p.groups.filter((g) => p.tracks.some((t) => t.groupId === g.id));
    for (const t of p.tracks) if (t.groupId && !p.groups.some((g) => g.id === t.groupId)) delete t.groupId;
  }

  // Spuren zu einer Gruppe zusammenfassen; sie rücken direkt unter die oberste von ihnen
  groupTracks(trackIds, name) {
    const p = this.project;
    const members = p.tracks.filter((t) => trackIds.includes(t.id));
    if (!members.length) return null;
    const n = 1 + Math.max(0, ...(p.groups || []).map((g) => parseInt(g.id.slice(1), 10) || 0));
    const id = 'g' + n;
    this.dispatch('group', (q) => {
      q.groups = [...(q.groups || []), { id, name: (name || `Gruppe ${n}`).slice(0, 32), collapsed: false }];
      const at = q.tracks.findIndex((t) => trackIds.includes(t.id));
      const rest = q.tracks.filter((t) => !trackIds.includes(t.id));
      const mem = q.tracks.filter((t) => trackIds.includes(t.id));
      for (const t of mem) t.groupId = id;
      const before = q.tracks.slice(0, at).filter((t) => !trackIds.includes(t.id)).length;
      rest.splice(before, 0, ...mem);
      q.tracks = rest;
      this._pruneGroups();
    });
    return id;
  }

  setGroup(groupId, patch, coalesce) {
    if (!this.project.groups?.some((g) => g.id === groupId)) return;
    if ('name' in patch) patch = { ...patch, name: String(patch.name).trim().slice(0, 32) || 'Gruppe' };
    this.dispatch('group-set', (p) => Object.assign(p.groups.find((g) => g.id === groupId), patch), { coalesce });
  }

  ungroup(groupId) {
    if (!this.project.groups?.some((g) => g.id === groupId)) return;
    this.dispatch('ungroup', (p) => {
      for (const t of p.tracks) if (t.groupId === groupId) delete t.groupId;
      this._pruneGroups();
    });
  }

  // Eine Spur in eine Gruppe aufnehmen (null: herausnehmen); sie rückt ans Ende bzw. hinter die Gruppe
  setTrackGroup(trackId, groupId) {
    const track = this.track(trackId);
    if (!track || (track.groupId ?? null) === groupId) return;
    this.dispatch('track-group', (p) => {
      const t = p.tracks.find((x) => x.id === trackId);
      const old = t.groupId;
      p.tracks = p.tracks.filter((x) => x !== t);
      if (groupId) t.groupId = groupId; else delete t.groupId;
      const ref = groupId ?? old;
      let at = p.tracks.length;
      for (let i = p.tracks.length - 1; i >= 0; i--) if (p.tracks[i].groupId === ref) { at = i + 1; break; }
      p.tracks.splice(at, 0, t);
      this._pruneGroups();
    });
  }

  setTrack(trackId, patch, coalesce) {
    // Selbst vergebene Namen bleiben; ein leerer Standardname schaltet die Automatik wieder ein
    if ('name' in patch) patch = { ...patch, autoName: DEFAULT_TRACK_NAME.test(patch.name) ? undefined : false };
    this.dispatch('track', () => Object.assign(this.track(trackId), patch), { coalesce });
  }

  // Spur samt Clips, Effekten und Einstellungen direkt darunter kopieren
  duplicateTrack(trackId, toIndex) {
    const src = this.track(trackId);
    if (!src || this.project.tracks.length >= MAX_TRACKS) return null;
    const id = this._newTrackId();
    this.dispatch('duplicate-track', (p) => {
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = id;
      copy.name = `${src.name} (Kopie)`.slice(0, 32);
      copy.autoName = false;
      copy.solo = false;
      copy.clips = copy.clips.map((c) => ({ ...c, id: this.newId() }));
      p.tracks.splice(toIndex ?? p.tracks.indexOf(src) + 1, 0, copy);
    });
    return id;
  }

  // Ebenen eines zerlegten Clips: neue Spuren direkt unter der Spur des Clips, der Original-Clip fällt weg
  insertStemTracks(clipId, stems) {
    const found = this.findClip(clipId);
    if (!found || this.project.tracks.length + stems.length > MAX_TRACKS) return null;
    const ids = [];
    this.dispatch('stems', (p) => {
      const { track, clip } = this.findClip(clipId);
      let at = p.tracks.indexOf(track) + 1;
      for (const s of stems) {
        const id = this._newTrackId();
        ids.push(id);
        p.tracks.splice(at++, 0, {
          id, name: s.name.slice(0, 32), volume: track.volume, pan: track.pan || 0, mute: false, solo: false, autoName: false,
          clips: [normalizeClip({ ...clip, id: this.newId(), sampleId: s.sampleId })],
          ...(track.automation ? { automation: JSON.parse(JSON.stringify(track.automation)) } : {}),
          // Getrennte Ebenen bleiben im selben Raum (Send-Busse)
          ...(track.sends ? { sends: { ...track.sends } } : {}),
        });
      }
      track.clips = track.clips.filter((c) => c.id !== clipId);
    });
    return ids;
  }

  // Spur an eine neue Position der Liste schieben (0 = ganz oben)
  moveTrack(trackId, toIndex) {
    const tracks = this.project.tracks;
    const from = tracks.findIndex((t) => t.id === trackId);
    const to = Math.max(0, Math.min(tracks.length - 1, toIndex));
    if (from < 0 || from === to) return;
    this.dispatch('move-track', (p) => {
      const [t] = p.tracks.splice(from, 1);
      p.tracks.splice(to, 0, t);
    });
  }

  // ---------- Patterns (Beats, Melodien) ----------

  addPattern(pattern) {
    const n = 1 + Math.max(0, ...Object.keys(this.project.patterns || {}).map((k) => parseInt(k.slice(1), 10) || 0));
    const id = 'p' + n;
    this.dispatch('add-pattern', (p) => { p.patterns = { ...(p.patterns || {}), [id]: pattern }; });
    return id;
  }

  // Pattern ändern; fn bekommt das Pattern-Objekt und verändert es direkt
  updatePattern(id, fn, coalesce) {
    if (!this.project.patterns?.[id]) return;
    this.dispatch('pattern', (p) => fn(p.patterns[id]), { coalesce });
  }

  removePattern(id) {
    if (!this.project.patterns?.[id]) return;
    this.dispatch('remove-pattern', (p) => { const { [id]: _, ...rest } = p.patterns; p.patterns = rest; });
  }

  setTrackFx(trackId, fxId, patch, coalesce) {
    if (!this.track(trackId)) return;
    this.dispatch('fx', () => {
      const t = this.track(trackId);
      t.fx = withFx(t.fx);
      Object.assign(t.fx[fxId], patch);
    }, { coalesce });
  }

  // ---------- Kits und Instrumente (ADR 012): je Aktion ein Rückgängig-Schritt ----------

  _patternsUsing(key, id) { return Object.values(this.project.patterns || {}).filter((p) => p?.[key] === id).length; }

  addKit({ name, map, from } = {}) {
    const kit = normalizeKit({ name, map, from });
    let id;
    do id = newKitId(); while (this.project.kits?.[id]);
    this.dispatch('add-kit', (p) => { p.kits = { ...(p.kits || {}), [id]: kit }; });
    return id;
  }

  // patch: { name }
  setKit(kitId, patch = {}) {
    const cur = this.project.kits?.[kitId];
    if (!cur) return;
    const next = normalizeKit({ ...cur, ...(patch.name != null ? { name: patch.name } : {}) });
    if (JSON.stringify(next) === JSON.stringify(normalizeKit(cur))) return;
    this.dispatch('kit', (p) => { p.kits = { ...p.kits, [kitId]: next }; });
  }

  // Pad belegen (sampleId) bzw. leeren (null)
  setKitPad(kitId, row, sampleId) {
    const cur = this.project.kits?.[kitId];
    if (!cur || !PAD_IDS.includes(row) || (cur.map?.[row] ?? null) === (sampleId || null)) return;
    const map = { ...(cur.map || {}) };
    if (sampleId) map[row] = String(sampleId); else delete map[row];
    this.dispatch('kit-pad', (p) => { p.kits = { ...p.kits, [kitId]: normalizeKit({ ...cur, map }) }; });
  }

  // Nur ohne Pattern, das es spielt. Rückgabe true/false
  removeKit(kitId) {
    if (!this.project.kits?.[kitId] || this._patternsUsing('kit', kitId)) return false;
    this.dispatch('remove-kit', (p) => {
      const { [kitId]: _, ...rest } = p.kits;
      if (Object.keys(rest).length) p.kits = rest; else delete p.kits;
    });
    return true;
  }

  addInstrument({ name, sampleId, root, cents, release } = {}) {
    const inst = normalizeInstrument({ name, sampleId, root, cents, release });
    if (!inst) return null;
    let id;
    do id = newInstrumentId(); while (this.project.instruments?.[id]);
    this.dispatch('add-instrument', (p) => { p.instruments = { ...(p.instruments || {}), [id]: inst }; });
    return id;
  }

  // patch: { name, root, cents, release, sampleId }; coalesce für Ziehen (Cent, Ausklang)
  setInstrument(id, patch = {}, { coalesce } = {}) {
    const cur = this.project.instruments?.[id];
    if (!cur) return;
    const next = normalizeInstrument({ ...cur, ...patch });
    if (!next || JSON.stringify(next) === JSON.stringify(normalizeInstrument(cur))) return;
    this.dispatch('instrument', (p) => { p.instruments = { ...p.instruments, [id]: next }; }, { coalesce });
  }

  removeInstrument(id) {
    if (!this.project.instruments?.[id] || this._patternsUsing('preset', id)) return false;
    this.dispatch('remove-instrument', (p) => {
      const { [id]: _, ...rest } = p.instruments;
      if (Object.keys(rest).length) p.instruments = rest; else delete p.instruments;
    });
    return true;
  }

  // Erste Spur ohne Clip in [at, at + len); sonst eine neue (null, wenn keine mehr geht)
  _freeTrackFor(at, len) {
    const free = this.project.tracks.find((t) => !t.clips.some((c) => c.startBeat < at + len - EPS && c.startBeat + c.lengthBeats > at + EPS));
    return free?.id ?? this.addTrack();
  }

  // Pattern als Clip ablegen (in einem batch): Spur, Lage, Loop über den Clip, falls er nicht schon im Loop liegt
  _placePattern(pattern, { trackId, atBeat, loop }) {
    const len = pattern.bars * 4;
    const p = this.project;
    const at = Math.max(0, atBeat ?? (p.loop?.on ? p.loop.startBeat : 0));
    const tid = this.track(trackId)?.id ?? this._freeTrackFor(at, len);
    if (!tid) return null;
    const patternId = this.addPattern(pattern);
    const clipId = this.addClip(tid, 'pat-' + patternId, at, len);
    const l = this.project.loop;
    if (loop && !(l.on && l.startBeat <= at + EPS && l.endBeat >= at + len - EPS)) this.setLoop({ on: true, startBeat: at, endBeat: at + len });
    return { patternId, clipId, trackId: tid };
  }

  // Kit auf die Spur: Beat-Pattern mit kit und Muster (leere Pads ohne Schritte), Clip, Loop. Ein Schritt.
  // Rückgabe { patternId, clipId, trackId } | null
  placeKit(kitId, { trackId = null, atBeat = null, bars = 1, groove = 'gerade', loop = true } = {}) {
    const kit = kitOf(this.project, kitId);
    if (!kit) return null;
    const b = Math.max(1, Math.min(4, Math.round(bars)));
    const g = grooveOf(groove).id;
    const pattern = { type: 'drums', name: kit.name.slice(0, 30), bars: b, kit: kitId, groove: g, rows: grooveRows(g, b, kit.map) };
    return this.batch('Kit auf die Spur', () => this._placePattern(pattern, { trackId, atBeat, loop }));
  }

  // Instrument auf die Spur: leere Melodie mit preset = Instrument. Rückgabe wie placeKit
  placeInstrument(id, { trackId = null, atBeat = null, bars = 1, loop = false } = {}) {
    const inst = instrumentOf(this.project, id);
    if (!inst) return null;
    const pattern = { type: 'synth', name: inst.name.slice(0, 30), bars: Math.max(1, Math.min(8, Math.round(bars))), preset: id, notes: [] };
    return this.batch('Instrument auf die Spur', () => this._placePattern(pattern, { trackId, atBeat, loop }));
  }

  // Muster eines Kit-Patterns wechseln: ersetzt die Schritte (leere Pads bleiben leer). Ein Schritt.
  setGroove(patternId, groove) {
    const pat = this.project.patterns?.[patternId];
    if (!pat || pat.type !== 'drums') return;
    const g = grooveOf(groove).id;
    const map = pat.kit && this.project.kits?.[pat.kit] ? kitOf(this.project, pat.kit).map : null;
    this.updatePattern(patternId, (q) => { q.groove = g; q.rows = grooveRows(g, q.bars, map); });
  }

  // Klatsch-Kit / Als Kit: Schnitte als Varianten (cutSound ohne Ablage) + Kit + (place) Kit auf die Spur – ein Schritt.
  // cuts wie cutSound, map = { Pad: Index in cuts } (assignPads), opts: name, place, trackId, atBeat, groove.
  // Rückgabe { kitId, ids, patternId, clipId } | null
  clapKit(sampleId, cuts, map, { name = null, place = true, trackId = null, atBeat = null, groove = 'gerade', label = 'Klatsch-Kit' } = {}) {
    return this.batch(label, () => {
      const res = this.cutSound(sampleId, cuts);
      if (!res) return null;
      const pads = {};
      for (const [row, i] of Object.entries(map || {})) if (res.ids[i]) pads[row] = res.ids[i];
      const taken = new Set(Object.values(this.project.kits || {}).map((k) => k?.name));
      let n = 1;
      const base = name || 'Klatschen';
      let kitName = name || `${base} ${n}`;
      while (taken.has(kitName)) kitName = `${base} ${++n}`;
      const kitId = this.addKit({ name: kitName, map: pads });
      // Schnitte heißen nach dem Kit und sind nach Pad-Reihenfolge nummeriert (Kick = 1), nicht benutzte danach
      const order = [...PAD_IDS.map((r) => pads[r]).filter(Boolean), ...res.ids.filter((id) => !Object.values(pads).includes(id))];
      this.dispatch(label, (p) => { order.forEach((id, i) => { if (p.recipes?.[id]) p.recipes[id] = { ...p.recipes[id], name: `${kitName} · ${i + 1}`.slice(0, 40) }; }); });
      const placed = place ? this.placeKit(kitId, { trackId, atBeat, groove }) : null;
      return { kitId, ids: res.ids, patternId: placed?.patternId ?? null, clipId: placed?.clipId ?? null };
    });
  }

  // Pad-Aufnahme: Schlag auf Schritt step (Anschlag vel); pass = ●-Durchgang → ein Rückgängig-Schritt je Durchgang
  padHit(patternId, row, step, vel = 1, pass = 1) {
    const pat = this.project.patterns?.[patternId];
    if (!pat || pat.type !== 'drums' || !PAD_IDS.includes(row)) return;
    const n = pat.bars * 16;
    const k = ((Math.round(step) % n) + n) % n;
    const v = Math.round(Math.min(1, Math.max(0.05, vel)) * 100) / 100;
    this.dispatch('pattern', (p) => {
      const q = p.patterns[patternId];
      const rows = {};
      for (const r of PAD_IDS) rows[r] = Array.from({ length: n }, (_, i) => q.rows?.[r]?.[i] || 0);
      rows[row][k] = v;
      q.rows = rows;
    }, { coalesce: 'padrec-' + pass, anyTime: true });
  }

  // Tasten-Aufnahme (Instrument): Note { pitch, start, len, vel } ins Melodie-Pattern, ein Schritt je Durchgang
  keyHit(patternId, note, pass = 1) {
    const pat = this.project.patterns?.[patternId];
    if (!pat || pat.type !== 'synth' || !Number.isFinite(note?.pitch) || !Number.isFinite(note?.start)) return;
    const beats = pat.bars * 4;
    const start = ((Math.round(note.start * 4) / 4) % beats + beats) % beats;
    const n = { pitch: Math.round(note.pitch), start, len: Math.max(0.25, Math.min(beats - start, note.len ?? 0.25)), vel: Math.min(1, Math.max(0.05, note.vel ?? 1)) };
    this.dispatch('pattern', (p) => {
      const q = p.patterns[patternId];
      q.notes = [...(q.notes || []).filter((x) => !(x.pitch === n.pitch && Math.abs(x.start - n.start) < 1e-6)), n];
    }, { coalesce: 'keyrec-' + pass, anyTime: true });
  }

  // Klang eines Patterns auf einmal setzen: Klangfarbe, Name und Effekte der Spuren, auf denen es liegt (ein Schritt)
  applySound(patternId, { preset, name, fx }, trackIds) {
    if (!this.project.patterns?.[patternId]) return;
    this.dispatch('sound', (p) => {
      const pat = p.patterns[patternId];
      if (preset) pat.preset = preset;
      if (name) pat.name = name.slice(0, 30);
      for (const id of trackIds) {
        const t = this.track(id);
        if (!t || !fx) continue;
        t.fx = withFx(t.fx);
        for (const [fxId, patch] of Object.entries(fx)) if (t.fx[fxId]) Object.assign(t.fx[fxId], patch);
      }
    });
  }

  // Songlänge in Takten; nie kürzer als der letzte Clip
  setLength(bars) {
    const p = this.project;
    const lastBeat = Math.max(0, ...p.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats)));
    const min = Math.max(4, Math.ceil(lastBeat / p.beatsPerBar - 1e-9));
    const v = Math.max(min, Math.min(256, Math.round(bars)));
    if (v === p.lengthBars) return;
    this.dispatch('length', (q) => { q.lengthBars = v; if (q.loop.endBeat > v * q.beatsPerBar) q.loop = { ...q.loop, startBeat: 0, endBeat: Math.min(16, v * q.beatsPerBar) }; });
  }

  setProjectName(name) {
    const v = String(name).trim().slice(0, 40);
    if (!v || v === this.project.name) return;
    this.dispatch('name', (p) => { p.name = v; });
  }

  setMaster(patch, coalesce) {
    this.dispatch('master', (p) => { p.master = { volume: 0.85, fx: null, ...(p.master || {}), ...patch }; }, { coalesce });
  }

  // Mastering der Summe: { on, style } – ein Rückgängig-Schritt, im Projekt gespeichert
  setMastering(patch) {
    const cur = { on: false, style: 'balanced', ...(this.project.master?.mastering || {}) };
    const next = { ...cur, ...patch };
    if (next.on === cur.on && next.style === cur.style) return;
    this.dispatch('mastering', (p) => {
      p.master = { volume: 0.85, fx: null, ...(p.master || {}) };
      p.master.mastering = { on: !!next.on, style: next.style };
    });
  }

  // Effekt-Reihenfolge (target = Spur-ID oder 'master'): fxId an Platz toIndex, ein Schritt. Die Grundreihenfolge
  // speichert kein Feld, damit alte und neue Dateien gleich bleiben.
  moveFx(target, fxId, toIndex) {
    const owner = this._autoOwner(target);
    const order = fxOrderOf(owner);
    const from = order.indexOf(fxId);
    if (from < 0 || (target !== 'master' && !owner)) return;
    const to = Math.max(0, Math.min(order.length - 1, Math.round(toIndex)));
    if (to === from) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, fxId);
    this.dispatch('fx-order', () => {
      const o = this._autoOwner(target, true);
      if (isDefaultOrder(next)) delete o.fxOrder; else o.fxOrder = next;
    });
  }

  resetFxOrder(target) {
    const owner = this._autoOwner(target);
    if (!owner?.fxOrder) return;
    this.dispatch('fx-order', () => { delete this._autoOwner(target).fxOrder; });
  }

  // Send-Anteil einer Spur zu einem Bus (0…1); 0 löscht den Eintrag, ein leeres Objekt fällt weg
  setSend(trackId, bus, amount, coalesce) {
    const t = this.track(trackId);
    if (!t || !busDef(bus)) return;
    const v = Math.max(0, Math.min(1, Number(amount) || 0));
    if ((t.sends?.[bus] ?? 0) === v) return;
    this.dispatch('send', () => {
      const tr = this.track(trackId);
      const s = { ...(tr.sends || {}) };
      if (v > 0) s[bus] = v; else delete s[bus];
      if (Object.keys(s).length) tr.sends = s; else delete tr.sends;
    }, { coalesce });
  }

  // Einstellungen eines Busses: volume, mute und die Effekt-Parameter (Hall: size; Echo: time, feedback)
  setBus(bus, patch, coalesce) {
    const def = busDef(bus);
    if (!def) return;
    const clamp01 = (x, max = 1) => Math.max(0, Math.min(max, Number(x) || 0));
    const clean = {};
    for (const k of Object.keys(patch)) {
      if (k === 'volume') clean[k] = clamp01(patch[k]);
      else if (k === 'size' && def.params.includes(k)) clean[k] = clamp01(patch[k]);
      else if (k === 'mute') clean[k] = !!patch[k];
      else if (k === 'feedback' && def.params.includes(k)) clean[k] = clamp01(patch[k], 0.85);
      else if (k === 'time' && def.params.includes(k) && ECHO_TIMES.some((x) => x.id === patch[k])) clean[k] = patch[k];
    }
    if (!Object.keys(clean).length) return;
    this.dispatch('bus', (p) => {
      p.buses = { ...(p.buses || {}) };
      p.buses[bus] = { ...(p.buses[bus] || {}), ...clean };
    }, { coalesce });
  }

  setMasterFx(fxId, patch, coalesce) {
    this.dispatch('fx', (p) => {
      p.master = { volume: 0.85, ...(p.master || {}) };
      p.master.fx = withFx(p.master.fx);
      Object.assign(p.master.fx[fxId], patch);
    }, { coalesce });
  }

  // Tonart wechseln: Melodie-Patterns wandern mit (ein Rückgängig-Schritt); Loops rendert die Bibliothek neu
  setKey(key) {
    if (!KEYS.includes(key) || key === keyOf(this.project)) return;
    const delta = keySemis(key) - keySemis(keyOf(this.project));
    this.dispatch('key', (p) => {
      p.key = key;
      for (const pat of Object.values(p.patterns || {})) {
        if (pat.type !== 'synth') continue;
        for (const n of pat.notes || []) n.pitch = transposePitch(n.pitch, delta);
      }
    });
  }

  // Tempo eines Sounds festlegen: so viele Schläge lang ist die Aufnahme (null = wie geliefert). Gilt im Projekt.
  setSampleTempo(sampleId, beats) {
    const cur = this.project.sampleTempo?.[sampleId] ?? null;
    const v = beats == null ? null : Math.round(beats * 4) / 4;
    if (v === cur || (v != null && !(v > 0))) return;
    this.dispatch('sample-tempo', (p) => {
      p.sampleTempo = { ...(p.sampleTempo || {}) };
      if (v == null) delete p.sampleTempo[sampleId]; else p.sampleTempo[sampleId] = v;
    });
  }

  // ---------- Klang-Rezept (ADR 010) ----------
  // Rezept eines Sounds ändern: null im Patch = Standard. Gilt für alle Clips dieses Sounds; ein leeres Rezept fällt weg.
  // coalesce: ein Rückgängig-Schritt je Ziehvorgang (Schlüssel aus recipeGesture in src/recipe.js).
  setRecipe(sampleId, patch, { coalesce } = {}) {
    const cur = this.project.recipes?.[sampleId] ?? null;
    const merged = { ...(cur || {}) };
    for (const [k, v] of Object.entries(patch || {})) { if (v == null) delete merged[k]; else merged[k] = v; }
    // Eine Variante bleibt Variante (Eltern-Sound und Name sind Pflicht)
    if (cur?.parent) { merged.parent = cur.parent; merged.name ??= cur.name; }
    const next = normalizeRecipe(merged, { duration: this.soundDuration?.(sampleId) });
    const before = normalizeRecipe(cur, { duration: this.soundDuration?.(sampleId) });
    if (JSON.stringify(next) === JSON.stringify(before) && JSON.stringify(cur) === JSON.stringify(before)) return;
    this.dispatch('recipe', (p) => {
      p.recipes = { ...(p.recipes || {}) };
      if (next) p.recipes[sampleId] = next; else delete p.recipes[sampleId];
      if (!Object.keys(p.recipes).length) delete p.recipes;
    }, { coalesce });
  }

  // „Als Variante“: eigener Klang ohne eigenes Audio (Ton aus dem Original der Wurzel). Kopiert das Rezept der Vorlage
  // und ihr Sound-Tempo; mit clipId spielt dieser Clip danach die Variante. Ein Rückgängig-Schritt. Rückgabe: ID.
  addVariant(sampleId, { clipId } = {}) {
    const rs = this.project.recipes || {};
    const src = rs[sampleId] ?? null;
    const root = src?.parent ?? sampleId;
    const base = String(this.sampleName?.(root) || rs[root]?.name || 'Sound');
    const taken = new Set(Object.values(rs).map((r) => r?.name));
    let name = null;
    for (let i = 1; i < 26 && !name; i++) { const n = `${base.slice(0, 38)} ${String.fromCharCode(97 + i)}`; if (!taken.has(n)) name = n; }
    name ??= `${base.slice(0, 34)} ${taken.size + 2}`;
    const vr = newVariantId();
    const material = src?.material ?? rs[root]?.material;
    const rec = normalizeRecipe({ ...soundFields(src), material, parent: root, name });
    this.dispatch('Als Variante', (p) => {
      p.recipes = { ...(p.recipes || {}), [vr]: rec };
      const tempo = p.sampleTempo?.[sampleId];
      if (tempo != null) p.sampleTempo = { ...p.sampleTempo, [vr]: tempo };
      if (clipId) for (const t of p.tracks) for (const c of t.clips) if (c.id === clipId) c.sampleId = vr;
    });
    return vr;
  }

  // Variante entfernen – nur, wenn kein Clip sie benutzt. Rückgabe: ob entfernt
  removeVariant(sampleId) {
    if (!this.project.recipes?.[sampleId]?.parent) return false;
    if (this.project.tracks.some((t) => t.clips.some((c) => c.sampleId === sampleId))) return false;
    this.dispatch('recipe', (p) => {
      p.recipes = { ...p.recipes };
      delete p.recipes[sampleId];
      if (!Object.keys(p.recipes).length) delete p.recipes;
      if (p.sampleTempo?.[sampleId] != null) { p.sampleTempo = { ...p.sampleTempo }; delete p.sampleTempo[sampleId]; }
    });
    return true;
  }

  // Zerlegen (Krachwerk 2b): Schnitte als Varianten einer Gruppe. cuts = [{ start, end, clips?: [{ beat, len, offset }],
  // beat?, len?, stretch? }] (Sekunden im Original der Wurzel; Lage aus layoutCuts in src/cuts.js). Kopiert die Klangfelder
  // der Quelle außer Ausschnitt und Hüllkurve. place 'clip': clipId fällt weg, die Schnitt-Clips liegen auf seiner Spur
  // (erben Lautstärke, Geschwindigkeit, Tonband, Stapel; Einblenden nur der erste, Ausblenden nur der letzte).
  // place 'track': auf trackId (ohne: neue Spur) ab atBeat. Ein Rückgängig-Schritt. Rückgabe { group, ids, clipIds } | null
  cutSound(sampleId, cuts, { clipId = null, trackId = null, atBeat = 0, place = null } = {}) {
    const list = (Array.isArray(cuts) ? cuts : [])
      .filter((c) => Number.isFinite(c?.start) && Number.isFinite(c?.end) && c.end - c.start >= MIN_SPAN - 1e-9)
      .sort((x, y) => x.start - y.start);
    if (!list.length || /^pat-/.test(String(sampleId))) return null;
    const rs = this.project.recipes || {};
    const src = rs[sampleId] ?? null;
    const root = src?.parent ?? sampleId;
    const fields = soundFields(src);
    for (const k of ['start', 'end', 'attack', 'release']) delete fields[k];
    const material = src?.material ?? rs[root]?.material;
    const base = String(this.sampleName?.(sampleId) || src?.name || 'Sound');
    const taken = new Set(Object.values(rs).map((r) => r?.name));
    const duration = this.soundDuration?.(root);
    const group = newGroupId();
    const ids = [];
    const recs = {};
    let k = 1;
    for (const c of list) {
      let name;
      do { const tail = ` · ${k++}`; name = base.slice(0, 40 - tail.length) + tail; } while (taken.has(name));
      taken.add(name);
      let id;
      do id = newVariantId(); while (rs[id] || recs[id]);
      ids.push(id);
      recs[id] = normalizeRecipe({ ...fields, material, parent: root, name, group, start: c.start, end: c.end }, { duration });
    }
    const clipIds = [];
    this.batch('Zerlegen', () => {
      this.dispatch('Zerlegen', (p) => { p.recipes = { ...(p.recipes || {}), ...recs }; });
      const found = place === 'clip' && clipId ? this.findClip(clipId) : null;
      let track = found?.track ?? null;
      if (place === 'track') track = this.track(trackId) ?? this.track(this.addTrack());
      if (!track) return;
      const like = found?.clip ?? null;
      const total = totalBeats(this.project);
      const made = [];
      list.forEach((c, i) => {
        const spots = c.clips ?? (Number.isFinite(c.beat) && c.len > 0 ? [{ beat: c.beat, len: c.len, offset: 0 }] : []);
        for (const sp of spots) {
          const beat = (place === 'track' ? atBeat : 0) + sp.beat;
          if (beat < -EPS || beat >= total - EPS) continue;
          const clip = { id: this.newId(), sampleId: ids[i], startBeat: Math.max(0, beat), lengthBeats: Math.min(sp.len, total - beat), offsetBeats: sp.offset > EPS ? sp.offset : 0 };
          const stretch = c.stretch ?? like?.stretch ?? 1;
          if (Math.abs(stretch - 1) > 1e-9) clip.stretch = stretch;
          if (like) {
            if (like.gain != null) clip.gain = like.gain;
            if (like.varispeed) clip.varispeed = true;
            if (like.z != null) clip.z = like.z;
          }
          made.push(clip);
        }
      });
      if (!made.length) return;
      made.sort((x, y) => x.startBeat - y.startBeat);
      if (like) {
        const first = made[0];
        const last = made.reduce((m, x) => (x.startBeat + x.lengthBeats > m.startBeat + m.lengthBeats - EPS ? x : m), made[0]);
        if (like.fadeInBeats) { first.fadeInBeats = like.fadeInBeats; if (like.fadeInCurve != null) first.fadeInCurve = like.fadeInCurve; }
        if (like.fadeOutBeats) { last.fadeOutBeats = like.fadeOutBeats; if (like.fadeOutCurve != null) last.fadeOutCurve = like.fadeOutCurve; }
      }
      this.dispatch('Zerlegen', () => {
        if (found) track.clips = track.clips.filter((x) => x.id !== clipId);
        for (const clip of made) {
          normalizeClip(clip);
          track.clips.push(clip);
          clipIds.push(clip.id);
          if (like) track.clips.sort((x, y) => x.startBeat - y.startBeat); else this._raise(track, clip);
        }
      });
    });
    return { group, ids, clipIds };
  }

  // Wie oft ein Sound im Song steckt („in 3 Clips“)
  clipsOf(sampleId) {
    let n = 0;
    for (const t of this.project.tracks) for (const c of t.clips) if (c.sampleId === sampleId) n++;
    return n;
  }

  // Tonart eines eigenen Sounds im Projekt: { key } überschreibt die erkannte (null = keine, undefined = wie erkannt),
  // { follow } stimmt ihn in die Song-Tonart um. Ein Rückgängig-Schritt.
  setSoundKey(sampleId, patch) {
    const cur = soundKeysOf(this.project)[sampleId] || {};
    const next = { ...cur };
    if ('key' in patch) { if (patch.key === undefined) delete next.key; else if (patch.key === null || isSoundKey(patch.key)) next.key = patch.key; }
    if ('follow' in patch) { if (patch.follow) next.follow = true; else delete next.follow; }
    if (JSON.stringify(next) === JSON.stringify(cur)) return;
    this.dispatch('sound-key', (p) => {
      p.soundKeys = { ...soundKeysOf(p) };
      if (Object.keys(next).length) p.soundKeys[sampleId] = next; else delete p.soundKeys[sampleId];
      if (!Object.keys(p.soundKeys).length) delete p.soundKeys;
    });
  }

  // Tonart ab Takt `bar` (1 = Grundtonart). Dieselbe Tonart wie davor entfernt den Wechsel.
  setKeyAt(bar, key) {
    bar = Math.round(bar);
    if (!KEYS.includes(key) || !(bar >= 1) || bar > this.project.lengthBars) return;
    if (bar === 1) { this.setKey(key); return; }
    if (key === keyAtBar(this.project, bar - 1)) { this.clearKeyAt(bar); return; }
    if (keyChangesOf(this.project).some((c) => c.bar === bar && c.key === key)) return;
    this.dispatch('key-at', (p) => {
      p.keyChanges = [...keyChangesOf(p).filter((c) => c.bar !== bar), { bar, key }].sort((a, b) => a.bar - b.bar);
    });
  }

  // Wechsel ab Takt `bar` entfernen: dort gilt wieder die Tonart davor
  clearKeyAt(bar) {
    if (!keyChangesOf(this.project).some((c) => c.bar === bar)) return;
    this.dispatch('key-at', (p) => {
      const rest = keyChangesOf(p).filter((c) => c.bar !== bar);
      if (rest.length) p.keyChanges = rest; else delete p.keyChanges;
    });
  }

  // Akkord für [beat, beat + span) festlegen (Standard: ein Takt); was danach kommt, bleibt, wie es war.
  // Ein Rückgängig-Schritt; Raster halbe Takte.
  setChordAt(beat, chord, span = this.project.beatsPerBar) {
    const p = this.project;
    const g = chordGrid(p);
    const a = Math.round(beat / g) * g;
    const b = Math.min(totalBeats(p), a + Math.max(g, Math.round(span / g) * g));
    if (!isChord(chord) || !(a >= 0) || a >= totalBeats(p) - EPS) return;
    const next = chordsOf(p);
    const after = chordAtBeat(p, b, next);
    let list = next.filter((c) => c.beat < a - EPS || c.beat > b - EPS);
    if (b < totalBeats(p) - EPS && !list.some((c) => Math.abs(c.beat - b) < EPS)) list.push({ beat: b, chord: after });
    list.push({ beat: a, chord });
    this._setChords(list, 'chord');
  }

  // Folge ab `fromBeat` bis `toBeat` (Standard: Songende) wiederholen, je Akkord `per` Schläge (ein Schritt)
  fillChords(fromBeat, chords, { toBeat, per } = {}) {
    const p = this.project;
    const g = chordGrid(p);
    const len = Math.max(g, Math.round((per ?? p.beatsPerBar) / g) * g);
    const a = Math.max(0, Math.round(fromBeat / g) * g);
    const end = Math.min(totalBeats(p), toBeat ?? totalBeats(p));
    const seq = (chords || []).filter(isChord);
    if (!seq.length || a >= end - EPS) return;
    const old = chordsOf(p);
    const after = chordAtBeat(p, end, old);
    const list = old.filter((c) => c.beat < a - EPS || c.beat > end - EPS);
    for (let i = 0, x = a; x < end - EPS; i++, x += len) list.push({ beat: x, chord: seq[i % seq.length] });
    if (end < totalBeats(p) - EPS && !list.some((c) => Math.abs(c.beat - end) < EPS)) list.push({ beat: end, chord: after });
    this._setChords(list, 'chords');
  }

  clearChords() {
    if (!chordsOf(this.project).length) return;
    this.dispatch('chords', (p) => { delete p.chords; });
  }

  // Sortieren, Überflüssiges weglassen (gleicher Akkord wie davor, führendes „i“)
  _setChords(list, label) {
    const sorted = [...new Map(list.map((c) => [c.beat, c.chord]))].sort((x, y) => x[0] - y[0]);
    const out = [];
    let prev = 'i';
    for (const [beat, chord] of sorted) { if (chord !== prev) out.push({ beat, chord }); prev = chord; }
    if (JSON.stringify(out) === JSON.stringify(chordsOf(this.project))) return;
    this.dispatch(label, (p) => { if (out.length) p.chords = out; else delete p.chords; });
  }

  // Leeres Lied (Song-Starter „Ersetzen“): keine Spuren, Patterns, Wechsel und Akkorde; Master bleibt. Ein Schritt.
  clearSong() {
    this.dispatch('clear-song', (p) => {
      p.tracks = [];
      delete p.patterns;
      delete p.groups;
      delete p.keyChanges;
      delete p.chords;
      delete p.sampleTempo;
      delete p.recipes;
      delete p.kits;
      delete p.instruments;
      delete p.soundKeys;
      if (p.master) delete p.master.automation;
      p.loop = { on: false, startBeat: 0, endBeat: 16 };
    });
  }

  setBpm(bpm) {
    const v = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)) * 10) / 10;
    if (v === this.project.bpm) return;
    this.dispatch('tempo', (p) => { p.bpm = v; });
  }

  setLoop(patch) {
    this.dispatch('loop', (p) => Object.assign(p.loop, patch));
  }

  // ---------- Automation (target = Spur-ID oder 'master'; Indizes beziehen sich auf laneOf) ----------

  _autoOwner(target, create = false) {
    const p = this.project;
    if (target === 'master') {
      if (create) p.master = { volume: 0.85, fx: null, ...(p.master || {}) };
      return p.master || null;
    }
    return this.track(target) || null;
  }

  _autoOk(target, key) {
    return autoKeys(target).includes(key) && (target === 'master' || !!this.track(target));
  }

  // Effekt-Kurve: den Effekt einschalten, wenn er aus ist (Filter dann als Tiefpass) – im selben Rückgängig-Schritt
  _autoFxOn(owner, key) {
    const id = fxOfKey(key);
    if (!id || !owner) return;
    owner.fx = withFx(owner.fx);
    if (owner.fx[id].on) return;
    owner.fx[id].on = true;
    if (id === 'filter') owner.fx[id].type = 'lowpass';
  }

  // Punkt setzen (gleicher Schlag: Wert ersetzen); liefert den Index
  addAutoPoint(target, key, beat, value) {
    if (!this._autoOk(target, key) || !Number.isFinite(beat) || !Number.isFinite(value)) return -1;
    const spec = AUTO_PARAMS[key];
    const b = Math.max(0, beat);
    const v = Math.min(spec.max, Math.max(spec.min, value));
    const lane = laneOf(this._autoOwner(target), key);
    const same = lane.findIndex((p) => Math.abs(p.beat - b) < EPS);
    const first = !lane.length;
    if (same >= 0) lane[same] = { ...lane[same], value: v }; else lane.push({ beat: b, value: v });
    lane.sort((x, y) => x.beat - y.beat);
    this.dispatch('auto-add', () => {
      const o = this._autoOwner(target, true);
      setLane(o, key, lane);
      if (first) this._autoFxOn(o, key);
    });
    return lane.findIndex((p) => Math.abs(p.beat - b) < EPS);
  }

  // Ziehen: je Ziehvorgang ein eindeutiges coalesce ('auto-drag-' + n) = ein Rückgängig-Schritt; der Punkt bleibt
  // zwischen seinen Nachbarn
  moveAutoPoint(target, key, index, beat, value, coalesce) {
    if (!this._autoOk(target, key)) return;
    const lane = laneOf(this._autoOwner(target), key);
    const pt = lane[index];
    if (!pt) return;
    const spec = AUTO_PARAMS[key];
    const lo = index > 0 ? lane[index - 1].beat + STEP_BEATS : 0;
    const hi = index < lane.length - 1 ? lane[index + 1].beat - STEP_BEATS : Infinity;
    const b = Number.isFinite(beat) ? Math.min(hi, Math.max(lo, beat)) : pt.beat;
    const v = Number.isFinite(value) ? Math.min(spec.max, Math.max(spec.min, value)) : pt.value;
    if (b === pt.beat && v === pt.value) return;
    lane[index] = { ...pt, beat: b, value: v };
    this.dispatch('auto-move', () => setLane(this._autoOwner(target), key, lane), { coalesce });
  }

  // curve: null/undefined = linear, 'step' = Stufe (gilt ab diesem Punkt)
  setAutoCurve(target, key, index, curve) {
    if (!this._autoOk(target, key)) return;
    const lane = laneOf(this._autoOwner(target), key);
    if (!lane[index] || (lane[index].curve || null) === (curve === 'step' ? 'step' : null)) return;
    const q = { beat: lane[index].beat, value: lane[index].value };
    if (curve === 'step') q.curve = 'step';
    lane[index] = q;
    this.dispatch('auto-curve', () => setLane(this._autoOwner(target), key, lane));
  }

  // Letzter Punkt löscht die Kurve
  deleteAutoPoint(target, key, index) {
    if (!this._autoOk(target, key)) return;
    const lane = laneOf(this._autoOwner(target), key);
    if (!lane[index]) return;
    lane.splice(index, 1);
    this.dispatch('auto-delete', () => setLane(this._autoOwner(target), key, lane));
  }

  // Effekt-Pad-Aufnahme (src/fxpad-record.js): ganze Punktliste einer Geste auf einmal = ein Rückgängig-Schritt. fx: Einstellungen
  // des Effekts, wenn er dabei eingeschaltet wird (sonst schaltet ihn wie beim ersten Punkt _autoFxOn ein)
  recordAutoLane(target, key, points, fx = null) {
    if (!this._autoOk(target, key) || !Array.isArray(points) || !points.length) return false;
    const id = fxOfKey(key);
    this.dispatch('auto-record', () => {
      const o = this._autoOwner(target, true);
      setLane(o, key, points);
      if (id && fx) { o.fx = withFx(o.fx); Object.assign(o.fx[id], fx); } else this._autoFxOn(o, key);
    });
    return true;
  }

  // Ohne key: alle Kurven des Ziels
  clearAutomation(target, key) {
    const owner = this._autoOwner(target);
    if (!owner?.automation) return;
    if (key != null && !laneOf(owner, key).length && owner.automation[key] == null) return;
    this.dispatch('auto-clear', () => {
      const o = this._autoOwner(target);
      if (key == null) delete o.automation; else setLane(o, key, []);
    });
  }

  // Vorlage (fadeIn, fadeOut, filterOpen, filterClose) als ein Schritt, Filter-Vorlagen schalten den Filter ein. opts:
  // { fromBeat, toBeat } oder { bars, playheadBeat } (Bereich wie templateRange). Liefert { key, fromBeat, toBeat } – die
  // Oberfläche öffnet damit die Kurvenzeile.
  applyAutoTemplate(target, name, opts = {}) {
    const tpl = AUTO_TEMPLATES[name];
    if (!tpl || !this._autoOk(target, tpl.key)) return null;
    const range = opts.fromBeat != null && opts.toBeat != null ? { fromBeat: Math.max(0, opts.fromBeat), toBeat: opts.toBeat } : templateRange(this.project, target, name, opts);
    if (!range || range.toBeat - range.fromBeat < STEP_BEATS) return null;
    const owner = this._autoOwner(target);
    const lane = templatePoints(laneOf(owner, tpl.key), name, range.fromBeat, range.toBeat, templateRest(owner, tpl.key));
    this.batch('auto-template', () => {
      this.dispatch('auto-template', () => {
        const o = this._autoOwner(target, true);
        setLane(o, tpl.key, lane);
        this._autoFxOn(o, tpl.key);
      });
    });
    return { key: tpl.key, ...range };
  }
}
