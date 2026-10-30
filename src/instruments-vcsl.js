// ENTWICKLUNGSFASSUNG (audio-engineer): kleine Auswahl aus vorhandenen VCSL-Dateien, damit sich der Sampler
// bauen und testen lässt. Wird beim Zusammenführen durch die Fassung des Sound-Kurators ersetzt.
// Format je Instrument: id, label, category, release (s), sustain, gain, zones [{ midi, file, loopStart?, loopEnd? }]
// aufsteigend, license, licenseUrl, origin, source. C4 = MIDI 60.
const CC0 = { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)' };
const DIR = 'assets/samples/vcsl/melodic/';

export const SAMPLED_INSTRUMENTS = [
  {
    id: 'konzertfluegel', label: 'Konzertflügel', category: 'keys', release: 0.35, sustain: true, gain: 1.6,
    zones: [
      { midi: 36, file: DIR + 'fluegel-c2.wav' },
      { midi: 40, file: DIR + 'fluegel-e2.wav' },
      { midi: 48, file: DIR + 'fluegel-c3.wav' },
      { midi: 52, file: DIR + 'fluegel-e3.wav' },
      { midi: 60, file: DIR + 'fluegel-c4.wav' },
      { midi: 64, file: DIR + 'fluegel-e4.wav' },
      { midi: 72, file: DIR + 'fluegel-c5.wav' },
      { midi: 76, file: DIR + 'fluegel-e5.wav' },
    ],
    ...CC0,
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/Sus',
  },
  {
    id: 'harfe', label: 'Harfe', category: 'plucked', release: 0.6, sustain: false, gain: 1.6,
    zones: [
      { midi: 45, file: DIR + 'harfe-a2.wav' },
      { midi: 48, file: DIR + 'harfe-c3.wav' },
      { midi: 52, file: DIR + 'harfe-e3.wav' },
      { midi: 69, file: DIR + 'harfe-a4.wav' },
      { midi: 72, file: DIR + 'harfe-c5.wav' },
      { midi: 76, file: DIR + 'harfe-e5.wav' },
    ],
    ...CC0,
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Concert%20Harp',
  },
];
