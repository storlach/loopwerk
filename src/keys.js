// Tonarten als Kürzel: Moll wie die Songtonarten („Am“), Dur wie ihre parallelen Dur-Tonarten („C“).
// Ohne weitere Abhängigkeiten, damit auch der Rechen-Worker sie laden kann.

export const KEYS = ['Cm', 'C♯m', 'Dm', 'E♭m', 'Em', 'Fm', 'F♯m', 'Gm', 'G♯m', 'Am', 'B♭m', 'Hm'];
export const KEY_MAJOR = ['E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'H', 'C', 'D♭', 'D'];
const MINOR_NAME = ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];
const MAJOR_NAME = ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'];

// Alle Tonarten eines Sounds: erst Moll, dann Dur, je nach Grundton von C an
export const SOUND_KEYS = [...KEYS, ...KEY_MAJOR.map((_, i) => KEY_MAJOR[(i + 9) % 12])];
export const isSoundKey = (k) => SOUND_KEYS.includes(k);
export const isMinorKey = (k) => KEYS.includes(k);
// Grundton (0 = C … 11 = H)
export const keyTonic = (k) => (KEYS.includes(k) ? KEYS.indexOf(k) : KEY_MAJOR.includes(k) ? (KEY_MAJOR.indexOf(k) + 3) % 12 : -1);
// Moll-Tonart mit denselben Tönen (Dur → parallele Moll-Tonart)
export const minorOf = (k) => (KEYS.includes(k) ? k : KEY_MAJOR.includes(k) ? KEYS[KEY_MAJOR.indexOf(k)] : null);
export function keyName(k) {
  const t = keyTonic(k);
  if (t < 0) return '';
  return isMinorKey(k) ? `${MINOR_NAME[t]}-Moll` : `${MAJOR_NAME[t]}-Dur`;
}
// Halbtöne auf kürzestem Weg (−6 … +5)
export const wrapSemis = (d) => { const m = ((Math.round(d) % 12) + 12) % 12; return m > 5 ? m - 12 : m; };
