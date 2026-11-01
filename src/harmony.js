// Akkorde einer Moll-Tonart (leitereigen, dazu V aus harmonisch Moll), Namen, beliebte Folgen und die Umrechnung
// einer Begleit-Vorlage (geschrieben auf der Stufe i) auf eine andere Stufe. Rein rechnerisch, ohne Projekt.
// tonic = Tonhöhenklasse des Grundtons (0 = C … 11 = H), wie der Index in KEYS.

export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
export const REST = '-'; // Pause: Begleitung schweigt

export const DEGREES = [
  { id: 'i', step: 0 },
  { id: 'III', step: 2 },
  { id: 'iv', step: 3 },
  { id: 'v', step: 4 },
  { id: 'VI', step: 5 },
  { id: 'VII', step: 6 },
  { id: 'V', step: 4, raised: true },
  { id: 'ii°', step: 1 },
];
export const DEGREE_IDS = DEGREES.map((d) => d.id);
export const isDegree = (id) => DEGREE_IDS.includes(id);
export const isChord = (id) => id === REST || isDegree(id);
const degreeOf = (id) => DEGREES.find((d) => d.id === id) ?? null;

// Beliebte Folgen in Moll (je ein Akkord pro Takt)
export const PROGRESSIONS = [
  { id: 'pop', chords: ['i', 'VI', 'III', 'VII'], label: 'Pop' },
  { id: 'epic', chords: ['i', 'VII', 'VI', 'VII'], label: 'Hymne' },
  { id: 'hiphop', chords: ['i', 'iv', 'v', 'i'], label: 'Hip-Hop' },
  { id: 'lofi', chords: ['VI', 'v', 'iv', 'i'], label: 'Lo-Fi' },
  { id: 'andalus', chords: ['i', 'VII', 'VI', 'V'], label: 'Spanisch' },
  { id: 'circle', chords: ['i', 'iv', 'VII', 'III'], label: 'Quintfall' },
];

const PC_MINOR = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'];
const PC_MAJOR = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'H'];
const mod12 = (x) => ((x % 12) + 12) % 12;

// Akkordtöne relativ zum Grundton der Tonart: [Grundton, Terz, Quinte] (Halbtöne, aufsteigend)
export function chordRel(id) {
  const d = degreeOf(id);
  if (!d) return null;
  const t = [0, 2, 4].map((k) => { const i = d.step + k; return MINOR_SCALE[i % 7] + 12 * Math.floor(i / 7); });
  if (d.raised) t[1] += 1;
  return t;
}

export function chordRoot(id, tonic) {
  const r = chordRel(id);
  return r ? mod12(tonic + r[0]) : null;
}

// Name des Akkords in der Tonart: „Am“, „F“, „H°“; Pause „–“
export function chordName(id, tonic) {
  if (id === REST) return '–';
  const r = chordRel(id);
  if (!r) return '?';
  const root = mod12(tonic + r[0]);
  const third = r[1] - r[0];
  const fifth = r[2] - r[0];
  if (fifth === 6) return PC_MINOR[root] + '°';
  return third === 3 ? PC_MINOR[root] + 'm' : PC_MAJOR[root];
}

// Akkordsymbol („Am“, „F“, „G7“, „Fmaj7“, „C♯m“, „Bb“) → Stufe in der Tonart oder null, wenn nicht leitereigen
export function degreeOfSymbol(symbol, tonic) {
  const m = String(symbol).trim().replace(/♯/g, '#').replace(/♭/g, 'b')
    .match(/^([A-Ha-h])([#b]?)(m(?!aj)|min|-)?(.*)$/);
  if (!m) return null;
  const BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 }; // B wie im Englischen = H, B♭ = Bb
  let pc = BASE[m[1].toLowerCase()];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  const minor = !!m[3];
  const dim = /°|dim/.test(m[4]);
  const rel = mod12(pc - tonic);
  for (const d of DEGREES) {
    const r = chordRel(d.id);
    if (mod12(r[0]) !== rel) continue;
    const isMinor = r[1] - r[0] === 3;
    const isDim = r[2] - r[0] === 6;
    if (dim ? isDim : isDim ? minor : isMinor === minor) return d.id;
  }
  return null;
}

// Akkordfolge aus dem Namen eines A-Moll-Loops („Pad Am–F–C–G“, „Deep-Bass Am7–Dm7“, „Pulse Bass A“):
// Stufen in Reihenfolge, gleichmäßig über die Loop-Länge verteilt; null, wenn der Name keine Akkorde nennt
export function loopHarmony(name) {
  const tokens = String(name).replace(/\(.*?\)/g, ' ').trim().split(/\s+/);
  const parse = (p) => {
    const m = p.match(/^([A-H][♯♭]?)(m(?!aj))?(maj7|maj9|7|9|add9|6)?$/);
    if (!m) return undefined;
    if (!m[2] && !m[3] && m[1] === 'A') return 'i'; // „Pulse Bass A“: nur der Grundton
    return degreeOfSymbol(m[1] + (m[2] || ''), 9);
  };
  for (let i = tokens.length - 1; i >= 1; i--) {
    const degs = tokens[i].split('–').map(parse);
    if (degs.some((d) => d === undefined)) continue;
    return degs.some((d) => d == null) ? null : degs;
  }
  return null;
}

// Nächstgelegene Tonhöhe mit Tonhöhenklasse pc (bei Gleichstand die tiefere)
function nearest(m, pc) {
  const up = m + mod12(pc - m);
  const down = up - 12;
  return up - m < m - down ? up : down;
}

const LOW = 36;
const HIGH = 84;
const fit = (m) => { while (m > HIGH) m -= 12; while (m < LOW) m += 12; return m; };

// Eine Note der Vorlage (Stufe i) auf Stufe `id`: Akkordtöne von i werden zum entsprechenden Akkordton (Grundton → Grundton,
// Terz → Terz, Quinte → Quinte) in der nächstgelegenen Lage – das ergibt kurze Wege in jeder Stimme. Andere leitereigene
// Töne wandern um so viele Leiterstufen wie der Grundton, fremde Töne um dessen Halbtonabstand.
export function voiceNote(m, tonic, id) {
  const d = degreeOf(id);
  if (!d || id === 'i') return m;
  const rel = mod12(m - tonic);
  const k = [0, 3, 7].indexOf(rel);
  const target = chordRel(id);
  const shift = d.step <= 3 ? d.step : d.step - 7;
  let out;
  if (k >= 0) out = nearest(m, mod12(tonic + target[k]));
  else {
    const si = MINOR_SCALE.indexOf(rel);
    if (si >= 0) {
      const j = si + shift;
      out = m - rel + MINOR_SCALE[((j % 7) + 7) % 7] + 12 * Math.floor(j / 7);
      if (d.raised && mod12(out - tonic) === 10) out += 1;
    } else out = m + (shift >= 0 ? MINOR_SCALE[shift] : MINOR_SCALE[shift + 7] - 12);
  }
  return fit(out);
}

export const voicePattern = (pattern, tonic, id) => (!id || id === 'i' ? pattern
  : { ...pattern, notes: (pattern.notes || []).map((n) => ({ ...n, pitch: voiceNote(n.pitch, tonic, id) })) });

// ---------- Begleit-Vorlagen (auf der Stufe i, folgen dem Akkord-Streifen) ----------

export const ACCOMP_STYLES = {
  bass: { name: 'Akkord-Bass', preset: 'bass', category: 'bass' },
  pad: { name: 'Akkord-Fläche', preset: 'pad', category: 'chords' },
  arp: { name: 'Akkord-Arp', preset: 'pluck', category: 'synth' },
  piano: { name: 'Akkord-Klavier', preset: 'piano', category: 'chords' },
  guitar: { name: 'Akkord-Gitarre', preset: 'guitarDrive', category: 'chords' },
  strings: { name: 'Akkord-Streicher', preset: 'strings', category: 'chords' },
  sub: { name: 'Akkord-Sub', preset: 'bass', category: 'bass' },
};

// Ein Takt Begleitung als Melodie-Pattern mit follow: true
export function accompPattern(style, tonic, { preset } = {}) {
  const s = ACCOMP_STYLES[style] ?? ACCOMP_STYLES.pad;
  const r2 = 36 + mod12(tonic); // Grundton in der Bass-Lage (C2 … H2)
  const around = (pc, c) => nearest(c, mod12(tonic + pc));
  const triad = [around(0, 57), around(3, 60), around(7, 64)].sort((a, b) => a - b); // eng um C4
  const notes = [];
  const n = (pitch, start, len, vel = 1) => notes.push({ pitch, start, len, vel });
  switch (style) {
    case 'bass':
      [r2, r2, r2 + 12, r2, r2, r2 + 12, r2, r2 + 7].forEach((p, i) => n(p, i / 2, 0.42, i % 2 ? 0.8 : 1));
      break;
    case 'sub':
      n(r2, 0, 1.5); n(r2, 2, 1.25, 0.9); n(r2 + 12, 3.5, 0.4, 0.7);
      break;
    case 'arp': {
      const up = [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[0] + 24];
      const order = [0, 1, 2, 3, 2, 1, 0, 1];
      for (let i = 0; i < 16; i++) n(up[order[i % 8]], i / 4, 0.22, i % 4 === 0 ? 1 : 0.7);
      break;
    }
    case 'piano':
      for (const [b, l, v] of [[0, 1.4, 1], [1.5, 0.45, 0.7], [2, 1, 0.85], [3.5, 0.45, 0.7]]) for (const p of triad) n(p, b, l, v);
      break;
    case 'guitar':
      for (let i = 0; i < 8; i++) for (const p of [r2 + 12, r2 + 19, r2 + 24]) n(p, i / 2, 0.42, i % 2 ? 0.8 : 1);
      break;
    default: // pad, strings
      for (const p of triad) n(p, 0, 4, 0.9);
  }
  return { type: 'synth', name: s.name, bars: 1, preset: preset ?? s.preset, notes, follow: true };
}
