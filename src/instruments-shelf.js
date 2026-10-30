// Instrumente aus Einzeltönen im Regal (VCSL, CC0): Familien mit mindestens zwei Tönen werden im Klavier spielbar.
// Die Töne liegen schon in den Klang-Paketen; Instrumente, die es als eigene Aufnahme gibt, fehlen hier.

import { VCSL_CATALOG } from './catalog-vcsl.js';

const FAMILIES = [
  { fam: 'folkharfe', id: 'vc-folkharfe', label: 'Folkharfe', category: 'chords', fallback: 'pluck', release: 0.5 },
  { fam: 'klavier2', id: 'vc-klavier', label: 'Klavier', category: 'chords', fallback: 'piano', release: 0.4 },
  { fam: 'marimba', id: 'vc-marimba', label: 'Marimba', category: 'synth', fallback: 'bell', release: 0.3 },
  { fam: 'xylofon', id: 'vc-xylofon', label: 'Xylofon', category: 'synth', fallback: 'bell', release: 0.25 },
  { fam: 'glockenspiel', id: 'vc-glockenspiel', label: 'Glockenspiel', category: 'synth', fallback: 'bell', release: 0.4 },
  { fam: 'mundharmonika', id: 'vc-mundharmonika', label: 'Mundharmonika', category: 'synth', fallback: 'flute', release: 0.12 },
];
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11, B: 11 };
const midiOf = (note) => {
  const m = /^([A-H])([s#♯b♭]?)(-?\d)$/i.exec(note || '');
  if (!m) return null;
  const acc = /[s#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + STEP[m[1].toUpperCase()] + acc;
};

export const SHELF_INSTRUMENTS = FAMILIES.map((f) => {
  const zones = VCSL_CATALOG
    .filter((e) => new RegExp(`/${f.fam}-[a-h][sb]?\\d\\.wav$`, 'i').test(e.file))
    .map((e) => ({ midi: midiOf(e.note), file: e.file, source: e.source }))
    .filter((z) => z.midi != null)
    .sort((a, b) => a.midi - b.midi);
  return {
    id: f.id, label: f.label, category: f.category, release: f.release, sustain: false,
    gain: 1.5, // Einzeltöne im Regal sind auf Spitze 0,42 angeglichen, Instrumente auf etwa 0,65
    fallback: f.fallback,
    zones: zones.map(({ midi, file }) => ({ midi, file })),
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: zones[0]?.source,
  };
}).filter((i) => i.zones.length >= 2);
