// Tonleiter-Sperre im Melodie-Editor: welche Töne gehören zur Tonart, und wohin rastet ein Fremdton ein.
//
// Am Pattern gespeichert (Projektdatei, mit Rückgängig): pattern.scaleLock = true (fehlt = aus)
// und pattern.scaleKind = 'minor' | 'major' | 'pent' (fehlt = 'minor').
//
// Maßgebliche Tonart ist die Grundtonart des Songs (project.key), nicht die Tonart an einer Clip-Stelle:
// Melodie-Patterns werden bei Tonartwechseln als Ganzes verschoben (transposePattern), die Töne behalten
// also ihr Verhältnis zur Grundtonart. Eine Tonleiter der Grundtonart stimmt damit in jedem Takt – auch
// dort, wo der Clip hinter einem Wechsel liegt und umgestimmt klingt. Ändert man die Songtonart, wandern
// die Noten mit (Store.setKey), die Tonleiter folgt der neuen Tonart.

import { KEYS, KEY_MAJOR, keyOf } from './model.js';

const LOW = 36; // C2 – wie PITCH_LOW in instruments.js (hier nicht importiert: das Modul soll ohne Audio-Code laden)
const HIGH = 84; // C6

// Halbtonstufen über dem Grundton der Tonleiter. shift: Grundton über dem Moll-Grundton der Songtonart.
// „Dur“ ist die Paralleltonart (gleiche Töne wie Moll, Grundton eine kleine Terz höher).
export const SCALE_KINDS = {
  minor: { steps: [0, 2, 3, 5, 7, 8, 10], shift: 0 },
  major: { steps: [0, 2, 4, 5, 7, 9, 11], shift: 3 },
  pent: { steps: [0, 3, 5, 7, 10], shift: 0 },
};
export const SCALE_ORDER = ['minor', 'major', 'pent'];

export const scaleLockOn = (pattern) => pattern?.type === 'synth' && pattern.scaleLock === true;
export const scaleKindOf = (pattern) => (pattern?.scaleKind in SCALE_KINDS ? pattern.scaleKind : 'minor');

// Anzeigename, z. B. „A-Moll“, „C-Dur“, „A-Pentatonik“
export function scaleLabel(project, kind) {
  const tonic = KEYS.indexOf(keyOf(project));
  const minor = KEYS[tonic].slice(0, -1);
  return kind === 'major' ? `${KEY_MAJOR[tonic]}-Dur` : kind === 'pent' ? `${minor}-Pentatonik` : `${minor}-Moll`;
}

// Tonleiter eines Patterns. has(pitch): gehört der Ton dazu; isRoot(pitch): Grundton; snap(pitch, prefer):
// nächster Tonleiterton (bei gleichem Abstand nach unten, bei prefer > 0 nach oben); lock(): snap nur bei aktiver Sperre.
export function patternScale(project, pattern) {
  const on = scaleLockOn(pattern);
  const kind = scaleKindOf(pattern);
  const def = SCALE_KINDS[kind];
  const root = (KEYS.indexOf(keyOf(project)) + def.shift) % 12;
  const pcs = new Array(12).fill(false);
  for (const s of def.steps) pcs[(root + s) % 12] = true;
  const has = (pitch) => pcs[((pitch % 12) + 12) % 12];
  const isRoot = (pitch) => ((pitch % 12) + 12) % 12 === root;
  function snap(pitch, prefer = 0) {
    if (has(pitch)) return pitch;
    for (let d = 1; d <= 6; d++) {
      const order = prefer > 0 ? [pitch + d, pitch - d] : [pitch - d, pitch + d];
      for (const m of order) if (m >= LOW && m <= HIGH && has(m)) return m;
    }
    return pitch;
  }
  const lock = (pitch, prefer = 0) => (on ? snap(pitch, prefer) : pitch);
  const foreign = (notes) => (on ? (notes || []).filter((n) => !has(n.pitch)).length : 0);
  return { on, kind, root, label: scaleLabel(project, kind), has, isRoot, snap, lock, foreign };
}

// ---------- Akkord-Eingabe ----------
// Eine Taste (Klick in die Piano-Roll, Klaviatur, Computertastatur, MIDI) spielt und setzt einen ganzen Akkord.
// rel: Halbtöne über der gedrückten Taste. „Tonleiter“ baut den leitereigenen Dreiklang der Songtonart.
export const CHORD_MODES = [
  { id: 'off', label: 'Aus', rel: [0] },
  { id: 'major', label: 'Dur', rel: [0, 4, 7] },
  { id: 'minor', label: 'Moll', rel: [0, 3, 7] },
  { id: 'scale', label: 'Tonleiter', rel: null },
  { id: 'power', label: 'Power', rel: [0, 7, 12] },
  { id: 'seventh', label: 'Sept', rel: [0, 4, 7, 10] }, // Dur-Dreiklang mit kleiner Septime
];

// Töne des Akkords zur Taste `root` (aufsteigend, ohne Doppelte, nur LOW…HIGH). Eine aktive Tonleiter-Sperre
// rastet jeden Ton ein; bei Gleichstand gewinnt der tiefere (Dur über A in A-Moll gibt A C E).
export function chordPitches(project, pattern, mode, root) {
  const sc = patternScale(project, pattern);
  const def = CHORD_MODES.find((c) => c.id === mode) ?? CHORD_MODES[0];
  let raw;
  if (def.rel) raw = def.rel.map((r) => root + r);
  else {
    // Leitereigen: die sieben Töne der Songtonart (Moll = Dur-Parallele); Terz und Quinte liegen je zwei Leiterstufen höher
    const pcs = new Array(12).fill(false);
    const tonic = KEYS.indexOf(keyOf(project));
    for (const s of SCALE_KINDS.minor.steps) pcs[(tonic + s) % 12] = true;
    const dia = (m) => pcs[((m % 12) + 12) % 12];
    let r = root;
    for (let d = 1; !dia(r) && d <= 2; d++) r = dia(root - d) ? root - d : dia(root + d) ? root + d : r;
    const up = (from, n) => { let m = from; while (n > 0) { m++; if (dia(m)) n--; } return m; };
    raw = [r, up(r, 2), up(r, 4)];
  }
  const out = [];
  for (const m of raw) {
    const p = sc.lock(m);
    if (p >= LOW && p <= HIGH && !out.includes(p)) out.push(p);
  }
  return out.sort((a, b) => a - b);
}
