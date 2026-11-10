// Pegel nach Lautheit (ADR 013, Klanganalyse K1/W4). Jeder mitgelieferte Sound, jedes Drum-Kit und jeder Melodie-Klang
// landet auf einer Ziel-Lautheit je Rolle; die Drums sind der Bezug. Die Verstärkungen stehen fest in levels-table.js
// (einmal gemessen mit tools/klang/pegel.cjs --tabelle), beim Laden wird nichts gemessen.
// Projekte tragen den Stand in project.levels; fehlt er (vor ADR 013 gespeichert), spielt die Engine jeden Sound mit
// 1 / sample.level und damit so laut wie vorher.

import { SOUND_DB, KIT_DB, PRESET_DB } from './levels-table.js';

export const LEVELS_VERSION = 2;
export const levelsOf = (project) => (Number(project?.levels) >= LEVELS_VERSION ? LEVELS_VERSION : 1);

// Ziel-Lautheit je Rolle (LUFS; Loops integriert über eine Runde, Einzelklänge: lauteste 400 ms).
// Drums führen: Kick/Snare-Loop über Bass, Flächen und Melodie darunter, Hats/Percussion als Begleitung.
export const ROLE_TARGET = {
  drums: -20, // volle Drum-Loops und Beats (Kick + Snare/Clap + Hats)
  top: -25, // Hats, Shaker, Percussion ohne Kick
  bass: -23, // 3 LU unter den Drums: die Kick führt
  chords: -24, // Akkorde, Flächen, Gitarren-Begleitung
  synth: -23, // Melodie, Arp, Lead
  fx: -22, // Riser, Crash, Impact (lauteste 400 ms)
  hit: -20, // Einzelschläge (lauteste 400 ms)
  note: -21, // Einzeltöne und -akkorde (lauteste 400 ms)
};
// Spitzen-Obergrenze je Sound (dBFS): lauter wird nichts gemacht, was darüber spitzen würde
export const PEAK_MAX_DB = -0.5;

const PERC = /hat|perc|shaker|ride|klick|click|rim|clap|klatsch|besen|conga|bongo|tamb|cowbell|kuhglocke|snap|top|cymbal|becken|tom/i;
// Rolle eines Bibliotheks-Sounds aus Kategorie, Art und Messung (low = Anteil der Energie unter 150 Hz)
export function roleOf(s, { low = 0 } = {}) {
  const one = s.kind === 'oneshot' || !!s.oneShot;
  if (s.category === 'fx') return 'fx';
  if (s.category === 'drums') return one ? 'hit' : low < 0.15 || (low < 0.35 && PERC.test(`${s.id} ${s.name}`)) ? 'top' : 'drums';
  if (one) return 'note';
  return s.category === 'bass' ? 'bass' : s.category === 'chords' ? 'chords' : 'synth';
}

// Verstärkung (dB) für einen gemessenen Wert vor der Tabelle: aufs Ziel, aber nicht über die Spitzen-Obergrenze
export function gainFor(role, loud, peakDb) {
  const t = ROLE_TARGET[role];
  if (!Number.isFinite(loud) || t == null) return 0;
  return Math.min(t - loud, PEAK_MAX_DB - peakDb);
}

const lin = (db) => Math.pow(10, db / 20);
// Linearer Faktor gegen die alte Spitzen-Normalisierung (1 = unverändert, unbekannte Sounds)
export const soundLevel = (id) => { const e = SOUND_DB[id]; return e ? lin(e[0]) : 1; };
export const soundRole = (id) => SOUND_DB[id]?.[1] ?? null;
export const kitLevel = (kit) => { const e = KIT_DB[kit] ?? KIT_DB.elektro; return e ? lin(e[0]) : 1; };
export const presetLevel = (preset) => { const e = PRESET_DB[preset]; return e ? lin(e[0]) : 1; };
export const presetRole = (preset) => PRESET_DB[preset]?.[1] ?? null;
// Ein gerendertes Pattern spitzt höchstens hier (linear); darüber wird das ganze Pattern leiser
export const PATTERN_PEAK_MAX = lin(PEAK_MAX_DB);
