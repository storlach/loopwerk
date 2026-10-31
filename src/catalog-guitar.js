// Echte E-Gitarren: Karoryfer Lecolds „Black And Green Guitars“ (Brian Wood; Gretsch Anniversary und Höfner Club),
// CC0 1.0 laut LICENSE im Repo. Aufbereitet mit tools/guitar-import.py, gepackt mit tools/pack-assets.cjs.
// GUITAR_CATALOG: Einzelklänge im Regal; GUITAR_INSTRUMENTS: spielbar im Melodie-Editor (Sampler; Höfner = kurz angeschlagen).
// Bezeichnungen kurz halten: die Klang-Auswahl am Handy darf die Leiste nicht verbreitern.

const REPO = 'https://github.com/sfzinstruments/karoryfer.black-and-green-guitars';
const COMMIT = 'b3b3249d37dc977a1a297bd2dc053e6d9b6b805c';
const LICENSE = {
  license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'Karoryfer Lecolds (Black And Green Guitars)',
};
const src = (path) => `${REPO}/blob/${COMMIT}/${path}`;
const TAGS = ['gitarre', 'e-gitarre', 'guitar', 'echt'];

// Karoryfer benennt eine Oktave höher (e3 = MIDI 40 = E2)
const ZONES = [['e3', 40], ['g3', 43], ['a3', 45], ['c4', 48], ['d4', 50], ['e4', 52], ['g4', 55], ['a4', 57],
  ['c5', 60], ['d5', 62], ['e5', 64], ['g5', 67], ['a5', 69], ['c6', 72], ['e6', 76]];
const DIR = 'assets/samples/karoryfer';

export const GUITAR_INSTRUMENTS = [
  {
    id: 'kf-gretsch', label: 'Gretsch-Gitarre', category: 'chords', release: 0.35, sustain: false, gain: 1.05,
    fallback: 'guitar',
    zones: ZONES.map(([n, midi]) => ({ midi, file: `${DIR}/inst/kf-gretsch/${n}.wav` })),
    ...LICENSE, source: src('Samples/green/ord'),
  },
  {
    id: 'kf-hofner-kurz', label: 'Höfner-Gitarre', category: 'chords', release: 0.08, sustain: false, gain: 1.05,
    fallback: 'guitar',
    zones: ZONES.map(([n, midi]) => ({ midi, file: `${DIR}/inst/kf-hofner-kurz/${n}.wav` })),
    ...LICENSE, source: src('Samples/black/stac'),
  },
];

const note = (n, label, key, genres) => ({
  id: `kf-gretsch-${label.toLowerCase()}`, name: `E-Gitarre Gretsch ${label} (echt)`, category: 'chords', kind: 'oneshot',
  beats: 5, bpm: 120, key, note: label, genres, tags: [...TAGS, 'einzelton'], file: `${DIR}/inst/kf-gretsch/${n}.wav`,
  source: src(`Samples/green/ord/twang_${n}_mf_rr1.wav`), ...LICENSE,
});

export const GUITAR_CATALOG = [
  note('e3', 'E2', 'E', ['rock', 'blues']),
  note('a3', 'A2', 'A', ['rock', 'blues']),
  note('d4', 'D3', 'D', ['rock', 'pop']),
  note('e5', 'E4', 'E', ['pop', 'blues']),
  {
    id: 'kf-hofner-steg', name: 'Höfner hinter dem Steg (echt)', category: 'fx', kind: 'oneshot', beats: 2, bpm: 120, key: 'keine',
    genres: ['rock', 'ambient'], tags: TAGS, file: `${DIR}/fx/hofner-steg-a3.wav`, source: src('Samples/black/btb/btb_a3_rr1.wav'), ...LICENSE,
  },
];
