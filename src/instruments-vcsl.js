// VCSL-Instrumente (CC0) als Sampler-Zonen. Erzeugt von tools/vcsl-instruments.py.
export const SAMPLED_INSTRUMENTS = [
  {
    id: 'vc-grand', label: 'Konzertflügel', category: 'chords', // chords | synth | bass
    release: 0.4,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.10,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'piano',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 46, file: 'assets/samples/vcsl/inst/vc-grand/as2.wav' },
      { midi: 50, file: 'assets/samples/vcsl/inst/vc-grand/d3.wav' },
      { midi: 54, file: 'assets/samples/vcsl/inst/vc-grand/fs3.wav' },
      { midi: 58, file: 'assets/samples/vcsl/inst/vc-grand/as3.wav' },
      { midi: 62, file: 'assets/samples/vcsl/inst/vc-grand/d4.wav' },
      { midi: 66, file: 'assets/samples/vcsl/inst/vc-grand/fs4.wav' },
      { midi: 70, file: 'assets/samples/vcsl/inst/vc-grand/as4.wav' },
      { midi: 74, file: 'assets/samples/vcsl/inst/vc-grand/d5.wav' },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-grand/fs5.wav' },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-grand/gs5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/NoSus',
  },
  {
    id: 'vc-harfe', label: 'Konzertharfe', category: 'chords', // chords | synth | bass
    release: 0.8,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.10,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'pluck',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 52, file: 'assets/samples/vcsl/inst/vc-harfe/e3.wav' },
      { midi: 55, file: 'assets/samples/vcsl/inst/vc-harfe/g3.wav' },
      { midi: 59, file: 'assets/samples/vcsl/inst/vc-harfe/b3.wav' },
      { midi: 62, file: 'assets/samples/vcsl/inst/vc-harfe/d4.wav' },
      { midi: 65, file: 'assets/samples/vcsl/inst/vc-harfe/f4.wav' },
      { midi: 69, file: 'assets/samples/vcsl/inst/vc-harfe/a4.wav' },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-harfe/c5.wav' },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-harfe/e5.wav' },
      { midi: 79, file: 'assets/samples/vcsl/inst/vc-harfe/g5.wav' },
      { midi: 83, file: 'assets/samples/vcsl/inst/vc-harfe/b5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Concert%20Harp',
  },
  {
    id: 'vc-cembalo', label: 'Cembalo', category: 'chords', // chords | synth | bass
    release: 0.5,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.10,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'pluck',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 46, file: 'assets/samples/vcsl/inst/vc-cembalo/as2.wav' },
      { midi: 49, file: 'assets/samples/vcsl/inst/vc-cembalo/cs3.wav' },
      { midi: 51, file: 'assets/samples/vcsl/inst/vc-cembalo/ds3.wav' },
      { midi: 54, file: 'assets/samples/vcsl/inst/vc-cembalo/fs3.wav' },
      { midi: 58, file: 'assets/samples/vcsl/inst/vc-cembalo/as3.wav' },
      { midi: 61, file: 'assets/samples/vcsl/inst/vc-cembalo/cs4.wav' },
      { midi: 63, file: 'assets/samples/vcsl/inst/vc-cembalo/ds4.wav' },
      { midi: 66, file: 'assets/samples/vcsl/inst/vc-cembalo/fs4.wav' },
      { midi: 70, file: 'assets/samples/vcsl/inst/vc-cembalo/as4.wav' },
      { midi: 73, file: 'assets/samples/vcsl/inst/vc-cembalo/cs5.wav' },
      { midi: 75, file: 'assets/samples/vcsl/inst/vc-cembalo/ds5.wav' },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-cembalo/fs5.wav' },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-cembalo/gs5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Harpsichord%2C%20Italian/Sustains/stop1',
  },
  {
    id: 'vc-vibrafon', label: 'Vibrafon', category: 'chords', // chords | synth | bass
    release: 1.0,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'bell',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 57, file: 'assets/samples/vcsl/inst/vc-vibrafon/a3.wav' },
      { midi: 60, file: 'assets/samples/vcsl/inst/vc-vibrafon/c4.wav' },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-vibrafon/e4.wav' },
      { midi: 67, file: 'assets/samples/vcsl/inst/vc-vibrafon/g4.wav' },
      { midi: 71, file: 'assets/samples/vcsl/inst/vc-vibrafon/b4.wav' },
      { midi: 74, file: 'assets/samples/vcsl/inst/vc-vibrafon/d5.wav' },
      { midi: 77, file: 'assets/samples/vcsl/inst/vc-vibrafon/f5.wav' },
      { midi: 81, file: 'assets/samples/vcsl/inst/vc-vibrafon/a5.wav' },
      { midi: 84, file: 'assets/samples/vcsl/inst/vc-vibrafon/c6.wav' },
      { midi: 88, file: 'assets/samples/vcsl/inst/vc-vibrafon/e6.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Vibraphone/Soft%20Mallets',
  },
  {
    id: 'vc-handglocken', label: 'Handglocken', category: 'synth', // chords | synth | bass
    release: 1.0,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'bell',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 60, file: 'assets/samples/vcsl/inst/vc-handglocken/c4.wav' },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-handglocken/e4.wav' },
      { midi: 66, file: 'assets/samples/vcsl/inst/vc-handglocken/fs4.wav' },
      { midi: 70, file: 'assets/samples/vcsl/inst/vc-handglocken/as4.wav' },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-handglocken/c5.wav' },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-handglocken/e5.wav' },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-handglocken/fs5.wav' },
      { midi: 81, file: 'assets/samples/vcsl/inst/vc-handglocken/a5.wav' },
      { midi: 84, file: 'assets/samples/vcsl/inst/vc-handglocken/c6.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes',
  },
  {
    id: 'vc-psalter', label: 'Psalter', category: 'chords', // chords | synth | bass
    release: 0.6,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.10,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'pluck',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 70, file: 'assets/samples/vcsl/inst/vc-psalter/as4.wav' },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-psalter/c5.wav' },
      { midi: 74, file: 'assets/samples/vcsl/inst/vc-psalter/d5.wav' },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-psalter/fs5.wav' },
      { midi: 82, file: 'assets/samples/vcsl/inst/vc-psalter/as5.wav' },
      { midi: 84, file: 'assets/samples/vcsl/inst/vc-psalter/c6.wav' },
      { midi: 88, file: 'assets/samples/vcsl/inst/vc-psalter/e6.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Psaltery%2C%20Bowed%20and%20Plucked/Pluck',
  },
  {
    id: 'vc-fmpiano', label: 'FM-Piano', category: 'synth', // chords | synth | bass
    release: 0.3,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.00,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'piano',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 48, file: 'assets/samples/vcsl/inst/vc-fmpiano/c3.wav' },
      { midi: 52, file: 'assets/samples/vcsl/inst/vc-fmpiano/e3.wav' },
      { midi: 56, file: 'assets/samples/vcsl/inst/vc-fmpiano/gs3.wav' },
      { midi: 60, file: 'assets/samples/vcsl/inst/vc-fmpiano/c4.wav' },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-fmpiano/e4.wav' },
      { midi: 68, file: 'assets/samples/vcsl/inst/vc-fmpiano/gs4.wav' },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-fmpiano/c5.wav' },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-fmpiano/e5.wav' },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-fmpiano/gs5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Electrophones/TX81Z/FM%20Piano',
  },
  {
    id: 'vc-clavisynth', label: 'Clavisynth', category: 'synth', // chords | synth | bass
    release: 0.3,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.10,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'piano',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 48, file: 'assets/samples/vcsl/inst/vc-clavisynth/c3.wav' },
      { midi: 52, file: 'assets/samples/vcsl/inst/vc-clavisynth/e3.wav' },
      { midi: 56, file: 'assets/samples/vcsl/inst/vc-clavisynth/gs3.wav' },
      { midi: 60, file: 'assets/samples/vcsl/inst/vc-clavisynth/c4.wav' },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-clavisynth/e4.wav' },
      { midi: 68, file: 'assets/samples/vcsl/inst/vc-clavisynth/gs4.wav' },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-clavisynth/c5.wav' },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-clavisynth/e5.wav' },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-clavisynth/gs5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Electrophones/TX81Z/Clavisynth',
  },
  {
    id: 'vc-orgel', label: 'Orgel', category: 'synth', // chords | synth | bass
    release: 0.12,            // Ausklang in s nach Notenende
    sustain: true,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'organ',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 36, file: 'assets/samples/vcsl/inst/vc-orgel/c2.wav' },
      { midi: 40, file: 'assets/samples/vcsl/inst/vc-orgel/e2.wav', loopStart: 0.718118, loopEnd: 1.252132 },
      { midi: 44, file: 'assets/samples/vcsl/inst/vc-orgel/gs2.wav', loopStart: 0.266757, loopEnd: 1.782404 },
      { midi: 48, file: 'assets/samples/vcsl/inst/vc-orgel/c3.wav', loopStart: 0.271111, loopEnd: 0.699229 },
      { midi: 52, file: 'assets/samples/vcsl/inst/vc-orgel/e3.wav' },
      { midi: 56, file: 'assets/samples/vcsl/inst/vc-orgel/gs3.wav', loopStart: 0.254376, loopEnd: 1.599002 },
      { midi: 60, file: 'assets/samples/vcsl/inst/vc-orgel/c4.wav', loopStart: 0.304671, loopEnd: 2.096803 },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-orgel/e4.wav', loopStart: 0.250635, loopEnd: 2.098118 },
      { midi: 68, file: 'assets/samples/vcsl/inst/vc-orgel/gs4.wav', loopStart: 0.282154, loopEnd: 1.984150 },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-orgel/c5.wav', loopStart: 0.369751, loopEnd: 2.013787 },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Aerophones/Edge-blown%20Aerophones/Renaissance%20Organ/Full',
  },
  {
    id: 'vc-blockfloete', label: 'Altblockflöte', category: 'synth', // chords | synth | bass
    release: 0.12,            // Ausklang in s nach Notenende
    sustain: true,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'flute',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 65, file: 'assets/samples/vcsl/inst/vc-blockfloete/f4.wav', loopStart: 0.251111, loopEnd: 2.099206 },
      { midi: 68, file: 'assets/samples/vcsl/inst/vc-blockfloete/gs4.wav', loopStart: 0.262358, loopEnd: 1.907732 },
      { midi: 72, file: 'assets/samples/vcsl/inst/vc-blockfloete/c5.wav', loopStart: 0.276440, loopEnd: 2.099320 },
      { midi: 74, file: 'assets/samples/vcsl/inst/vc-blockfloete/d5.wav', loopStart: 0.597392, loopEnd: 2.099410 },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-blockfloete/fs5.wav', loopStart: 1.024717, loopEnd: 2.058163 },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-blockfloete/gs5.wav', loopStart: 0.251111, loopEnd: 2.034490 },
      { midi: 84, file: 'assets/samples/vcsl/inst/vc-blockfloete/c6.wav', loopStart: 0.292290, loopEnd: 2.099501 },
      { midi: 86, file: 'assets/samples/vcsl/inst/vc-blockfloete/d6.wav', loopStart: 0.630385, loopEnd: 1.413628 },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Aerophones/Edge-blown%20Aerophones/Baroque%20Alto%20Recorder/Sustain',
  },
  {
    id: 'vc-okarina', label: 'Okarina', category: 'synth', // chords | synth | bass
    release: 0.12,            // Ausklang in s nach Notenende
    sustain: true,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'flute',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 69, file: 'assets/samples/vcsl/inst/vc-okarina/a4.wav', loopStart: 0.252041, loopEnd: 2.099433 },
      { midi: 71, file: 'assets/samples/vcsl/inst/vc-okarina/b4.wav', loopStart: 0.251338, loopEnd: 2.098050 },
      { midi: 73, file: 'assets/samples/vcsl/inst/vc-okarina/cs5.wav', loopStart: 0.250204, loopEnd: 2.099116 },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-okarina/e5.wav', loopStart: 0.250816, loopEnd: 2.098798 },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-okarina/fs5.wav', loopStart: 0.366757, loopEnd: 2.037506 },
      { midi: 80, file: 'assets/samples/vcsl/inst/vc-okarina/gs5.wav', loopStart: 0.815533, loopEnd: 2.099841 },
      { midi: 81, file: 'assets/samples/vcsl/inst/vc-okarina/a5.wav', loopStart: 0.337483, loopEnd: 2.099116 },
      { midi: 84, file: 'assets/samples/vcsl/inst/vc-okarina/c6.wav', loopStart: 0.831247, loopEnd: 1.931429 },
      { midi: 85, file: 'assets/samples/vcsl/inst/vc-okarina/cs6.wav', loopStart: 0.266644, loopEnd: 1.448118 },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Aerophones/Edge-blown%20Aerophones/Ocarina%2C%20Typical/Sustains/Sus',
  },
  {
    id: 'vc-saxophon', label: 'Tenorsaxophon', category: 'synth', // chords | synth | bass
    release: 0.2,            // Ausklang in s nach Notenende
    sustain: true,           // true = Ton hält, solange die Note dauert
    gain: 0.90,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'lead',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 46, file: 'assets/samples/vcsl/inst/vc-saxophon/as2.wav', loopStart: 0.256735, loopEnd: 1.955873 },
      { midi: 50, file: 'assets/samples/vcsl/inst/vc-saxophon/d3.wav', loopStart: 0.250136, loopEnd: 2.061655 },
      { midi: 52, file: 'assets/samples/vcsl/inst/vc-saxophon/e3.wav', loopStart: 0.254036, loopEnd: 2.098662 },
      { midi: 56, file: 'assets/samples/vcsl/inst/vc-saxophon/gs3.wav', loopStart: 0.251701, loopEnd: 2.096054 },
      { midi: 58, file: 'assets/samples/vcsl/inst/vc-saxophon/as3.wav', loopStart: 0.416259, loopEnd: 2.089524 },
      { midi: 62, file: 'assets/samples/vcsl/inst/vc-saxophon/d4.wav', loopStart: 0.250703, loopEnd: 2.099864 },
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-saxophon/e4.wav', loopStart: 0.385374, loopEnd: 2.090363 },
      { midi: 68, file: 'assets/samples/vcsl/inst/vc-saxophon/gs4.wav', loopStart: 0.250454, loopEnd: 1.943107 },
      { midi: 70, file: 'assets/samples/vcsl/inst/vc-saxophon/as4.wav', loopStart: 0.331701, loopEnd: 1.972698 },
      { midi: 74, file: 'assets/samples/vcsl/inst/vc-saxophon/d5.wav', loopStart: 0.652925, loopEnd: 2.096667 },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-saxophon/e5.wav', loopStart: 0.286939, loopEnd: 2.070771 },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-saxophon/fs5.wav', loopStart: 0.348866, loopEnd: 1.754014 },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Aerophones/Reed%20Aerophones/Tenor%20Saxophone/Non-Vibrato',
  },
  {
    id: 'vc-strumstick', label: 'Strumstick', category: 'chords', // chords | synth | bass
    release: 0.6,            // Ausklang in s nach Notenende
    sustain: false,           // true = Ton hält, solange die Note dauert
    gain: 1.06,                  // Anschlag (vel 1) hat Spitze etwa 0,65 nach gain
    fallback: 'pluck',  // Ersatzklang, solange das Instrument lädt
    zones: [
      { midi: 64, file: 'assets/samples/vcsl/inst/vc-strumstick/e4.wav' },
      { midi: 67, file: 'assets/samples/vcsl/inst/vc-strumstick/g4.wav' },
      { midi: 71, file: 'assets/samples/vcsl/inst/vc-strumstick/b4.wav' },
      { midi: 73, file: 'assets/samples/vcsl/inst/vc-strumstick/cs5.wav' },
      { midi: 76, file: 'assets/samples/vcsl/inst/vc-strumstick/e5.wav' },
      { midi: 78, file: 'assets/samples/vcsl/inst/vc-strumstick/fs5.wav' },
      { midi: 81, file: 'assets/samples/vcsl/inst/vc-strumstick/a5.wav' },
    ],
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', origin: 'VCSL (Versilian Studios)',
    source: 'https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Strumstick/Finger',
  },
];
