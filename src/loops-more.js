// Weitere synthetische Loops (eigene Klänge, CC0): zwölf Genres, alle tonalen Loops in A-Moll.
// Gleiches Format wie LOOP_DEFS in samples.js. Tonhöhen als MIDI-Noten; die Kit-Instrumente rechnen sie
// über tf() um, damit der Tonartwechsel greift. Drums und FX bleiben unverändert.

// Genres, die LOOP_DEFS noch nicht kennt (für GENRES in samples.js)
export const MORE_GENRES = [
  { id: 'trap', label: 'Trap' },
  { id: 'lofi', label: 'Lo-Fi' },
  { id: 'reggaeton', label: 'Reggaeton & Dembow' },
  { id: 'afro', label: 'Afro & Amapiano' },
  { id: 'funk', label: 'Funk & Disco' },
  { id: 'synthwave', label: 'Synthwave' },
];

// Akkorde in enger Lage um C4
const CH = {
  Am: [57, 60, 64], Am7: [55, 57, 60, 64], Am9: [55, 59, 60, 64], Amadd9: [57, 59, 60, 64],
  Dm: [57, 62, 65], Dm7: [57, 60, 62, 65], Dm9: [53, 57, 60, 64],
  Em: [55, 59, 64], Em7: [55, 59, 62, 64], E: [56, 59, 64],
  F: [57, 60, 65], Fmaj7: [53, 57, 60, 64], C: [55, 60, 64], Cmaj7: [55, 59, 60, 64],
  G: [55, 59, 62], G6: [55, 59, 62, 64],
  // tiefere Lage für Lo-Fi-Keys
  Em7b: [52, 55, 59, 62], Dm7b: [50, 53, 57, 60], Am7b: [52, 55, 57, 60],
};

// Akkordfolgen: je Takt Akkord und Grundton (Bass, A1 = 33)
const PROG = {
  'Am–F–C–G': [['Am', 33], ['F', 29], ['C', 36], ['G', 31]],
  'Am–G–F–E': [['Am', 33], ['G', 31], ['F', 29], ['E', 28]],
  'Am–Dm–Em–Am': [['Am', 33], ['Dm', 38], ['Em', 40], ['Am', 33]],
  'Am–F–G–Em': [['Am', 33], ['F', 29], ['G', 31], ['Em', 28]],
  'Am7–Dm7–Em7–Am7': [['Am7', 33], ['Dm7', 38], ['Em7', 40], ['Am7', 33]],
  'Fmaj7–Em7–Dm7–Am7': [['Fmaj7', 41], ['Em7b', 40], ['Dm7b', 38], ['Am7b', 33]],
  'Am9–Fmaj7–C–G': [['Am9', 33], ['Fmaj7', 29], ['Cmaj7', 36], ['G6', 31]],
  'Amadd9–Fmaj7–Cmaj7–G6': [['Amadd9', 33], ['Fmaj7', 29], ['Cmaj7', 36], ['G6', 31]],
  'Am7–Dm7': [['Am7', 33], ['Dm7', 38]],
  'Am9–Dm9': [['Am9', 33], ['Dm9', 38]],
  'Am9–Fmaj7': [['Am9', 33], ['Fmaj7', 29]],
  'Am–Dm': [['Am', 33], ['Dm', 38]],
  'Am–F': [['Am', 33], ['F', 29]],
};
const prog = (name) => PROG[name].map(([c, r]) => ({ c: CH[c], r, name: c }));
const up = (notes, n) => notes.map((m) => m + n);

// Schrittmuster in 16teln: X = 1, x = 0,75, o = 0,5, - = 0,3 (Geisternote); Leerzeichen/| nur zur Gliederung.
// swing verschiebt jede zweite 16tel nach hinten (in Schlägen).
const VEL = { X: 1, x: 0.75, o: 0.5, '-': 0.3 };
function steps(pattern, fn, swing = 0) {
  const p = pattern.replace(/[\s|]/g, '');
  for (let i = 0; i < p.length; i++) {
    const v = VEL[p[i]];
    if (v) fn(i / 4 + (i % 2 ? swing : 0), v);
  }
}

const ALL = ['house', 'techno', 'hiphop', 'trap', 'lofi', 'breaks', 'reggaeton', 'afro', 'funk', 'pop', 'synthwave', 'ambient'];

const DEFS = [
  // ================= House =================
  {
    id: 'gen-house-groove', name: 'House-Groove', genres: ['house'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      steps('X...X...X...X...', (b) => k.kick(b));
      k.clap(1, 0.85); k.clap(3, 0.85);
      steps('..X...X...X...X.', (b) => k.hat909(b, 0.7, true));
      steps('o-x-o-x-o-x-o-x-', (b, v) => k.shaker(b, v, { pan: 0.35 }));
    },
  },
  {
    id: 'gen-house-deep', name: 'Deep-House-Beat', genres: ['house'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ lowpass: 9000 });
      for (let b = 0; b < 8; b++) d.kickDeep(b, 0.9, { decay: 0.32, tone: 50, punch: 120, click: 0.15 });
      [1, 3, 5, 7].forEach((b) => { d.clap(b, 0.6); d.snap(b + 0.01, 0.5, -0.2); });
      steps('-.x--.x--.x--.x- -.x--.x--.x-x.x-', (b, v) => d.hat(b, 0.8 * v), 0.05);
      steps('......x.......x. ...x..x.......x.', (b) => d.rim(b, 0.55));
    },
  },
  {
    id: 'gen-house-shuffle', name: 'House-Shuffle', genres: ['house'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) k.kick909(b, 0.9, 0.35);
      for (const b of [1, 3]) { k.clap(b); k.snare2(b, 0.45, { tone: 210 }); }
      steps('x-o-x-o-x-o-x-ox', (b, v) => k.hat909(b, 0.6 * v), 0.06);
      k.hat909(3.5, 0.6, true);
      steps('.......x......x.', (b) => k.conga(b, 200, 0.7, { pan: -0.35 }));
    },
  },
  {
    id: 'gen-house-perc', name: 'House-Percussion', genres: ['house', 'afro'], category: 'drums', bars: 2, peak: 0.5,
    render(k) {
      steps('..x..x.o..x...x. ..x..x.o..x.x.x.', (b, v) => k.conga(b, 330, v, { pan: 0.4 }));
      steps('X.......o..X.... X.......o...X...', (b, v) => k.conga(b, 220, v, { pan: -0.3, decay: 0.3 }));
      steps('-ox--ox--ox--ox- -ox--ox--ox--ox-', (b, v) => k.shaker(b, v, { pan: -0.5 }));
      steps('...X......X..... ...X......X...X.', (b) => k.clave(b, 0.6, { pan: 0.2 }));
    },
  },
  {
    id: 'gen-house-bass', name: 'House-Bass Am–F–C–G', genres: ['house', 'pop'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      prog('Am–F–C–G').forEach(({ r }, bar) => {
        const R = r + 12;
        [[0.5, R, 0.3], [1.5, R, 0.3], [1.75, R + 12, 0.15], [2.5, R, 0.3], [3.5, R, 0.25], [3.75, R + 7, 0.15]]
          .forEach(([b, m, l]) => k.synthBass(bar * 4 + b, m, l, { cutoff: 380, env: 1500, decay: 0.12, sub: 0.4 }));
      });
    },
  },
  {
    id: 'gen-house-deepbass', name: 'Deep-Bass Am7–Dm7', genres: ['house'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      prog('Am7–Dm7').forEach(({ r }, bar) => {
        [[0, r, 0.6], [0.75, r, 0.25], [1.5, r + 12, 0.3], [2.5, r, 0.6], [3.25, r + 7, 0.25], [3.5, r + 10, 0.4]]
          .forEach(([b, m, l], i) => k.synthBass(bar * 4 + b, m, l, { cutoff: 180, env: 700, res: 2, decay: 0.2, sub: 0.7, vel: i % 3 ? 0.8 : 1 }));
      });
    },
  },
  {
    id: 'gen-house-organ', name: 'Orgel-Stabs Am7–Dm7', genres: ['house'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const o = k.bus({ highpass: 180, space: 0.15 });
      prog('Am7–Dm7').forEach(({ c }, bar) => {
        steps('..X..x..X.x...x.', (s, v) => o.organ2(bar * 4 + s, up(c, 12), 0.22, { vel: v }));
      });
    },
  },
  {
    id: 'gen-house-piano', name: 'House-Piano Am–F–C–G', genres: ['house'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const p = k.bus({ pump: 16, pumpDepth: 0.4 });
      prog('Am–F–C–G').forEach(({ c }, bar) => {
        steps('..X..x..X..x.xX.', (s, v) => p.keys(bar * 4 + s, up(c, 12), 0.35, { vel: v }));
      });
    },
  },
  {
    id: 'gen-house-vox', name: 'Chor-Fläche Am–F–C–G', genres: ['house', 'ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const v = k.bus({ space: 0.35 });
      prog('Am–F–C–G').forEach(({ c }, bar) => v.vox(bar * 4, c, 4, { vowel: 'a' }));
    },
  },
  {
    id: 'gen-house-pluck', name: 'House-Pluck Am', genres: ['house'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.4, wet: 0.4 });
      [[0, 69], [0.5, 76], [0.75, 72], [1.5, 76], [2, 81], [2.25, 74], [3, 72], [3.5, 69], [4, 69], [4.5, 76], [4.75, 72], [5.5, 76], [6, 81], [6.25, 79], [7, 76], [7.5, 74]]
        .forEach(([b, m], i) => p.pluckSaw(b, m, i % 4 === 0 ? 1 : 0.8, { decay: 0.4 }));
    },
  },

  // ================= Techno =================
  {
    id: 'gen-techno-drive', name: 'Techno-Antrieb', genres: ['techno'], category: 'drums', bars: 1, peak: 0.64,
    render(k) {
      for (let b = 0; b < 4; b++) k.kick909(b, 1, 0.45);
      steps('..X...X...X...X.', (b) => k.ride(b, 0.7));
      steps('-x---x---x---x-x', (b, v) => k.hat909(b, 0.5 * v));
      steps('...x..x....x..x.', (b, v) => k.rim(b, v));
      for (const b of [1, 3]) k.snare2(b, 0.7, { tone: 230, decay: 0.12, bright: 0.8, noiseHp: 2500 });
    },
  },
  {
    id: 'gen-techno-peak', name: 'Peak-Time-Beat', genres: ['techno'], category: 'drums', bars: 2, peak: 0.64,
    render(k) {
      for (let b = 0; b < 8; b++) k.kick909(b, 1, 0.5);
      const c = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.18, echoTone: 3000 });
      [1, 3, 5, 7].forEach((b) => c.clap(b, 0.9));
      steps('-oXo-oXo-oXo-oXo -oXo-oXo-oXo-XXX', (b, v) => k.hat909(b, 0.5 * v));
      [[7.25, 0.35], [7.5, 0.55], [7.75, 0.8]].forEach(([b, v]) => k.snare2(b, v, { tone: 220, decay: 0.1 }));
    },
  },
  {
    id: 'gen-techno-minimal', name: 'Minimal-Klick', genres: ['techno', 'house'], category: 'drums', bars: 1, peak: 0.6,
    render(k) {
      steps('X...X...X...X...', (b) => k.kickDeep(b, 1, { decay: 0.28, tone: 55, punch: 210, click: 0.35, drive: 2 }));
      steps('...x..x.....x..x', (b, v) => k.rim(b, v));
      k.clave(2.75, 0.5, { pan: 0.5, freq: 1900 });
      steps('-o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, v, { pan: -0.3, len: 0.04 }));
      k.snap(1, 0.6); k.snap(3, 0.6);
    },
  },
  {
    id: 'gen-techno-toms', name: 'Techno-Toms', genres: ['techno'], category: 'drums', bars: 2, peak: 0.5,
    render(k) {
      const t = k.bus({ echo: 0.5, feedback: 0.3, wet: 0.2, highpass: 60 });
      steps('..x...x..x....x. ..x...x..x..x.x.', (b, v) => t.tom(b, 150, 0.8 * v));
      steps('......X.....x... ....x.......X...', (b, v) => t.tom(b, 95, v));
      [[3.5, 260], [7.25, 340]].forEach(([b, f]) => t.clang(b, f, 0.6));
    },
  },
  {
    id: 'gen-techno-roll', name: 'Rollender Bass A', genres: ['techno'], category: 'bass', bars: 1, peak: 0.5,
    render(k) {
      const notes = [33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 45, 43];
      for (let i = 0; i < 16; i++) {
        if (i % 4) k.synthBass(i / 4, notes[i], 0.2, { cutoff: 240, env: i % 4 === 2 ? 1500 : 1000, decay: 0.07, res: 5, vel: i % 4 === 2 ? 1 : 0.8 });
      }
    },
  },
  {
    id: 'gen-techno-acid', name: 'Acid-Linie Am II', genres: ['techno'], category: 'bass', bars: 2, peak: 0.5,
    render(k) {
      // [Schritt (16tel), Ton, Akzent, Slide vom vorigen Ton]
      const line = [[0, 33, 1], [2, 33], [3, 45, 0, 1], [5, 33], [6, 43, 1], [8, 33], [10, 40, 0, 1], [11, 33], [12, 45, 1], [14, 36], [15, 33],
        [16, 33, 1], [18, 48, 0, 1], [19, 45], [21, 33], [22, 43, 1], [24, 33], [25, 33], [26, 45, 1], [27, 47, 0, 1], [28, 45], [30, 40, 1], [31, 43, 0, 1]];
      line.forEach(([st, m, acc, slide], i) => {
        const next = line[i + 1]?.[0] ?? 32;
        k.acid(st / 4, m, Math.min(next - st, 2) / 4 * 0.85, { accent: !!acc, slideFrom: slide ? line[i - 1][1] : null, cutoff: 300 + st * 18, env: 2600, res: 15 });
      });
    },
  },
  {
    id: 'gen-techno-chord', name: 'Techno-Akkord Am9', genres: ['techno'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const c = k.bus({ highpass: 150 });
      [0.5, 2.25, 3.5, 4.5, 6.75].forEach((b) => c.dubStab(b, [57, 60, 64, 71], b % 1 ? 0.8 : 1));
    },
  },
  {
    id: 'gen-techno-pad', name: 'Techno-Fläche Am–F', genres: ['techno', 'ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 150 });
      s.supersaw(0, CH.Am, 8, { attack: 0.4, release: 0.8, sweep: [350, 2200] });
      s.supersaw(8, CH.F, 8, { attack: 0.4, release: 0.8, sweep: [2200, 350] });
    },
  },
  {
    id: 'gen-techno-arp', name: 'Hypno-Arp Am', genres: ['techno'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.4, wet: 0.25, highpass: 200 });
      const cycle = [57, 64, 60];
      for (let i = 0; i < 32; i++) {
        const w = 0.5 - 0.5 * Math.cos(i * Math.PI / 16);
        p.pluckSaw(i / 4, cycle[i % 3] + (i % 8 === 7 ? 12 : 0), i % 4 === 0 ? 1 : 0.75, { decay: 0.18 + 0.14 * w, cutoff: 1400 + 1800 * w });
      }
    },
  },
  {
    id: 'gen-techno-rave', name: 'Rave-Stab Am', genres: ['techno', 'breaks'], category: 'synth', bars: 1, peak: 0.42,
    render(k) {
      const s = k.bus({ drive: 2, highpass: 120, echo: 0.75, feedback: 0.25, wet: 0.2 });
      steps('X..x..X...x..x..', (b, v) => s.supersaw(b, [57, 64, 69], 0.2, { vel: v, cutoff: 3500, attack: 0.003, release: 0.08 }));
    },
  },

  // ================= Hip-Hop / Boom-Bap =================
  {
    id: 'gen-hiphop-boombap', name: 'Boom-Bap', genres: ['hiphop'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ lowpass: 8000, drive: 1.3 });
      const sw = 0.04;
      steps('X......x..X..... X.x.......X..x..', (b, v) => d.kickDeep(b, v, { decay: 0.38, tone: 50, punch: 130, click: 0.2 }), sw);
      steps('....X.......X... ....X.......X..-', (b, v) => d.snare2(b, v, { tone: 180, decay: 0.2, bright: 0.75, body: 0.6 }), sw);
      steps('x.o.x.o.x.o.x.o. x.o.x.o.x.o.x.ox', (b, v) => d.hat(b, v), sw);
      d.vinyl(0, 8, 0.3);
    },
  },
  {
    id: 'gen-hiphop-dusty', name: 'Staubiger Beat', genres: ['hiphop', 'lofi'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ lowpass: 4500, drive: 1.6 });
      const sw = 0.05;
      steps('X.....X.X.....x. ..X...X..X......', (b, v) => d.kickDeep(b, v, { decay: 0.34, tone: 48, punch: 120, click: 0.12 }), sw);
      steps('....X.......X... ....X..-....X...', (b, v) => { d.rim(b, v); d.snare2(b, 0.5 * v, { tone: 200, decay: 0.12, bright: 0.5 }); }, sw);
      steps('o.x.o.x.o.x.o.x. o.x.o.x.o.x.o.xo', (b, v) => d.shaker(b, v, { len: 0.08 }), sw);
    },
  },
  {
    id: 'gen-hiphop-swing', name: 'Hip-Hop-Swing', genres: ['hiphop'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      const sw = 0.07;
      steps('X..x.....X......', (b, v) => k.kickDeep(b, v, { decay: 0.36, tone: 52, punch: 140, click: 0.2 }), sw);
      steps('....X.......X..-', (b, v) => { k.snare2(b, v, { tone: 190, decay: 0.18 }); if (v > 0.5) k.clap(b, 0.4); }, sw);
      steps('x-o-x-o-x-o-x-oo', (b, v) => k.hat(b, v), sw);
    },
  },
  {
    id: 'gen-hiphop-perc', name: 'Rim & Shaker', genres: ['hiphop', 'lofi'], category: 'drums', bars: 1, peak: 0.45,
    render(k) {
      const sw = 0.06;
      steps('...x..x....x..x.', (b, v) => k.rim(b, v), sw);
      steps('o.x.o.x.o.x.o.x.', (b, v) => k.shaker(b, v, { pan: 0.4, len: 0.07 }), sw);
      k.snap(1.75, 0.5, -0.4); k.snap(3.25, 0.4, -0.4);
    },
  },
  {
    id: 'gen-hiphop-bass', name: 'Boom-Bap-Bass Am–Dm–Em–Am', genres: ['hiphop'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–Dm–Em–Am').forEach(({ r }, bar) => {
        [[0, r, 1.4], [1.75, r, 0.5], [2.5, r, 1], [3.5, r + 12, 0.35]].forEach(([b, m, l], i) =>
          k.synthBass(bar * 4 + b, m, l, { cutoff: 200, env: 600, res: 1.5, decay: 0.25, sub: 0.8, vel: i ? 0.85 : 1 }));
      });
    },
  },
  {
    id: 'gen-hiphop-jazzbass', name: 'Jazz-Bass Am7–Dm7', genres: ['hiphop', 'lofi'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      [33, 36, 40, 43, 38, 41, 45, 44].forEach((m, i) =>
        k.synthBass(i, m, i === 3 ? 0.6 : 0.85, { type: 'triangle', cutoff: 500, env: 800, res: 1, decay: 0.12, sub: 0.5, vel: i % 2 ? 0.85 : 1 }));
      k.synthBass(3.67, 45, 0.25, { type: 'triangle', cutoff: 500, env: 600, res: 1, decay: 0.1, vel: 0.5 });
    },
  },
  {
    id: 'gen-hiphop-rhodes', name: 'Rhodes Am7–Dm7–Em7–Am7', genres: ['hiphop', 'lofi'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const r = k.bus({ lowpass: 5000 });
      prog('Am7–Dm7–Em7–Am7').forEach(({ c }, bar) => {
        r.rhodes(bar * 4, c, 1.5, { strum: 0.02 });
        r.rhodes(bar * 4 + 1.75, c, 0.25, { vel: 0.6 });
        r.rhodes(bar * 4 + 2.5, c, 1.3, { vel: 0.85, strum: 0.015 });
      });
    },
  },
  {
    id: 'gen-hiphop-piano', name: 'Soul-Piano Am9–Fmaj7', genres: ['hiphop'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const p = k.bus({ space: 0.2, lowpass: 6000 });
      prog('Am9–Fmaj7').forEach(({ c }, bar) => {
        const o = bar * 4;
        p.keys(o, c, 1.75, { vel: 0.8, strum: 0.015 });
        c.forEach((m, i) => p.keys(o + 2 + i * 0.5, m + 12, 0.45, { vel: i % 2 ? 0.6 : 0.75 }));
      });
    },
  },
  {
    id: 'gen-hiphop-flute', name: 'Flöten-Hook Am', genres: ['hiphop', 'trap'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const f = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.2 });
      [[0, 76, 0.75], [0.75, 74, 0.25], [1, 72, 0.5], [1.5, 69, 1], [2.75, 72, 0.25], [3, 74, 1],
        [4, 76, 0.5], [4.5, 79, 0.5], [5, 76, 0.75], [5.75, 74, 0.25], [6, 72, 1.5], [7.5, 69, 0.4]]
        .forEach(([b, m, l]) => f.pipe(b, m, l, { vel: 0.9 }));
    },
  },

  // ================= Trap =================
  {
    id: 'gen-trap-beat', name: 'Trap-Beat', genres: ['trap', 'hiphop'], category: 'drums', bars: 2, peak: 0.64,
    render(k) {
      [0, 0.75, 3.25, 4, 5.5, 7.25].forEach((b) => k.kickDeep(b, 1, { decay: 0.9, tone: 45, punch: 140, click: 0.3, drive: 1.8 }));
      for (const b of [2, 6]) { k.clap(b); k.snare2(b, 0.6, { tone: 230, decay: 0.15 }); }
      for (let b = 0; b < 8; b += 0.5) if (b !== 3.5 && b < 7) k.hat909(b, b % 1 ? 0.55 : 0.8);
      [0.4, 0.55, 0.7, 0.9].forEach((v, i) => k.hat909(3.5 + i / 8, v));
      for (let i = 0; i < 6; i++) k.hat909(7 + i / 6, 0.45 + i * 0.08);
      k.hat909(5, 0.5, true);
    },
  },
  {
    id: 'gen-trap-hats', name: 'Trap-Hats', genres: ['trap', 'hiphop'], category: 'drums', bars: 1, peak: 0.42,
    render(k) {
      const L = k.bus({ pan: -0.35 });
      const R = k.bus({ pan: 0.35 });
      [[0, 1], [0.5, 0.6], [1, 0.9], [1.25, 0.5]].forEach(([b, v]) => L.hat909(b, v));
      for (let i = 0; i < 4; i++) R.hat909(1.5 + i / 8, 0.4 + i * 0.15);
      [[2, 1], [2.5, 0.6], [2.75, 0.5]].forEach(([b, v]) => L.hat909(b, v));
      for (let i = 0; i < 3; i++) R.hat909(3 + i / 3, 0.85 - i * 0.15);
    },
  },
  {
    id: 'gen-trap-dark', name: 'Dunkler Trap', genres: ['trap'], category: 'drums', bars: 2, peak: 0.64,
    render(k) {
      [0, 2.75, 4, 4.75, 6.5].forEach((b) => k.kickDeep(b, 1, { decay: 1.1, tone: 42, punch: 120, click: 0.2, drive: 2.2 }));
      for (const b of [2, 6]) { k.snap(b, 1); k.rim(b, 0.8); k.snare2(b, 0.5, { tone: 200, decay: 0.2, bright: 0.6 }); }
      steps('x...x.x.x...x..o x...x.x.x.oox...', (b, v) => k.hat909(b, 0.7 * v));
      k.hat909(7.5, 0.5, true);
    },
  },
  {
    id: 'gen-trap-triplet', name: 'Trap-Triolen', genres: ['trap'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      [0, 5 / 3, 3].forEach((b) => k.kickDeep(b, 1, { decay: 0.8, tone: 46, punch: 150, click: 0.3, drive: 1.8 }));
      k.clap(2); k.snare2(2, 0.5, { tone: 240, decay: 0.14 });
      for (let i = 0; i < 12; i++) k.hat909(i / 3, i % 3 === 0 ? 0.85 : 0.5);
    },
  },
  {
    id: 'gen-trap-808', name: '808 Glide A', genres: ['trap', 'hiphop'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      [[0, 33, 1.5], [1.75, 33, 0.5], [2.5, 45, 0.5, 33], [3, 43, 1, 45], [4, 33, 1.5], [5.75, 36, 0.5], [6.5, 40, 0.75, 36], [7.25, 31, 0.75, 40]]
        .forEach(([b, m, l, from]) => k.bass808(b, m, l, { glideFrom: from ?? null }));
    },
  },
  {
    id: 'gen-trap-808prog', name: '808 Am–G–F–E', genres: ['trap'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–G–F–E').forEach(({ r }, bar) => {
        const o = bar * 4;
        k.bass808(o, r, 1.5);
        k.bass808(o + 1.75, r, 0.5, { vel: 0.8 });
        k.bass808(o + 2.5, r + 12, 0.75, { glideFrom: r });
        k.bass808(o + 3.25, r, 0.6, { glideFrom: r + 12, vel: 0.9 });
      });
    },
  },
  {
    id: 'gen-trap-strings', name: 'Trap-Streicher Am–G–F–E', genres: ['trap', 'hiphop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am–G–F–E').forEach(({ c }, bar) => s.supersaw(bar * 4, [c[0] - 12, ...c], 4, { cutoff: 2400, attack: 0.18, release: 0.45, width: 0.4, voices: 2 }));
    },
  },
  {
    id: 'gen-trap-bells', name: 'Glocken Am–G–F–E', genres: ['trap'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const fig = { Am: [81, 76, 72], G: [79, 74, 71], F: [77, 72, 69], E: [76, 71, 68] };
      prog('Am–G–F–E').forEach(({ name }, bar) => {
        const n = fig[name];
        [[0, 0], [0.75, 1], [1.5, 2], [2, 1], [2.5, 0], [3.25, 2]].forEach(([b, j], i) => k.chime(bar * 4 + b, n[j], i % 2 ? 0.6 : 0.8, { decay: 1.1, pan: i % 2 ? 0.25 : -0.25 }));
      });
    },
  },
  {
    id: 'gen-trap-piano', name: 'Dunkles Piano Am', genres: ['trap', 'hiphop'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const p = k.bus({ space: 0.3 });
      [[0, 69, 0.75], [0.75, 72, 0.75], [1.5, 71, 0.5], [2, 69, 1.5], [3.5, 64, 0.5], [4, 65, 0.75], [4.75, 69, 0.75], [5.5, 68, 0.5], [6, 69, 1.75]]
        .forEach(([b, m, l]) => p.keys(b, [m - 12, m], l, { vel: 0.85 }));
    },
  },

  // ================= Lo-Fi =================
  {
    id: 'gen-lofi-beat', name: 'Lo-Fi-Beat', genres: ['lofi', 'hiphop'], category: 'drums', bars: 2, peak: 0.6,
    render(k) {
      const d = k.bus({ lowpass: 4200, drive: 1.4 });
      const sw = 0.06;
      steps('X.....x...X..... X.x.......X.....', (b, v) => d.kickDeep(b, 0.9 * v, { decay: 0.3, tone: 52, punch: 110, click: 0.08 }), sw);
      steps('....X.......X... ....X.......X..-', (b, v) => d.snare2(b, v, { tone: 170, decay: 0.14, bright: 0.45, body: 0.6, noiseHp: 1200 }), sw);
      steps('x-o-x-o-x-o-x-o- x-o-x-o-x-o-x-oo', (b, v) => d.hat(b, 0.7 * v), sw);
      d.vinyl(0, 8, 0.5);
    },
  },
  {
    id: 'gen-lofi-shuffle', name: 'Lo-Fi-Shuffle', genres: ['lofi'], category: 'drums', bars: 2, peak: 0.6,
    render(k) {
      const d = k.bus({ lowpass: 5000, drive: 1.3 });
      [0, 2 + 2 / 3, 4, 4 + 2 / 3, 6 + 2 / 3].forEach((b) => d.kickDeep(b, 0.9, { decay: 0.32, tone: 50, punch: 115, click: 0.1 }));
      [1, 3, 5, 7].forEach((b) => d.rim(b, 0.9));
      [3 + 2 / 3, 7 + 1 / 3].forEach((b) => d.snare2(b, 0.3, { tone: 180, decay: 0.1, bright: 0.4 }));
      for (let b = 0; b < 8; b++) { d.hat(b, 0.65); d.hat(b + 2 / 3, 0.4); }
      d.vinyl(0, 8, 0.4);
    },
  },
  {
    id: 'gen-lofi-brush', name: 'Besen & Rim', genres: ['lofi', 'ambient'], category: 'drums', bars: 1, peak: 0.45,
    render(k) {
      const sw = 0.08;
      steps('x.o.x.o.x.o.x.o.', (b, v) => k.shaker(b, v, { len: 0.16, tone: 4200 }), sw);
      steps('....x.......x..-', (b, v) => k.rim(b, v), sw);
      steps('X.......o.......', (b, v) => k.kickDeep(b, 0.6 * v, { decay: 0.3, tone: 50, punch: 100, click: 0 }));
    },
  },
  {
    id: 'gen-lofi-bass', name: 'Lo-Fi-Bass Fmaj7–Em7–Dm7–Am7', genres: ['lofi', 'hiphop'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Fmaj7–Em7–Dm7–Am7').forEach(({ r }, bar) => {
        [[0, r, 1.4], [1.5, r + 7, 0.4], [2.5, r, 0.9], [3.5, r + 12, 0.4]].forEach(([b, m, l], i) =>
          k.synthBass(bar * 4 + b + (b % 1 ? 0.06 : 0), m, l, { type: 'triangle', cutoff: 220, env: 300, res: 1, decay: 0.3, sub: 0.7, vel: i ? 0.8 : 1 }));
      });
    },
  },
  {
    id: 'gen-lofi-bass2', name: 'Lo-Fi-Bass Am9–Dm9', genres: ['lofi'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      prog('Am9–Dm9').forEach(({ r }, bar) => {
        [[0, r, 2.4], [2.75, r + 7, 0.5], [3.5, r + 10, 0.4]].forEach(([b, m, l], i) =>
          k.synthBass(bar * 4 + b, m, l, { type: 'triangle', cutoff: 260, env: 250, res: 1, decay: 0.4, sub: 0.8, vel: i ? 0.75 : 1 }));
      });
    },
  },
  {
    id: 'gen-lofi-keys', name: 'Lo-Fi-Rhodes Fmaj7–Em7–Dm7–Am7', genres: ['lofi', 'hiphop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const r = k.bus({ lowpass: 2600 });
      prog('Fmaj7–Em7–Dm7–Am7').forEach(({ c }, bar) => {
        r.rhodes(bar * 4, c, 1.75, { strum: 0.03 });
        r.rhodes(bar * 4 + 2.56, c, 1.2, { vel: 0.75, strum: 0.02 });
      });
    },
  },
  {
    id: 'gen-lofi-piano', name: 'Lo-Fi-Piano Am9–Dm9', genres: ['lofi'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const p = k.bus({ lowpass: 3500, echo: 0.75, feedback: 0.3, wet: 0.2 });
      prog('Am9–Dm9').forEach(({ c }, bar) => {
        const o = bar * 4;
        p.keys(o, c, 2.4, { vel: 0.7, strum: 0.03 });
        [[2.56, c[3] + 12], [3.06, c[2] + 12], [3.56, c[1] + 12]].forEach(([b, m]) => p.keys(o + b, m, 0.45, { vel: 0.6 }));
      });
    },
  },
  {
    id: 'gen-lofi-kalimba', name: 'Kalimba Am', genres: ['lofi', 'afro', 'ambient'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      const m = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.2 });
      [[0, 69], [0.5, 72], [1, 76], [1.5, 74], [2.5, 72], [3, 69], [3.5, 67],
        [4, 69], [4.5, 72], [5, 76], [5.5, 79], [6, 76], [6.5, 74], [7, 72]]
        .forEach(([b, n], i) => m.mallet(b + (i % 2 ? 0.05 : 0), n, i % 2 ? 0.7 : 0.9, { decay: 0.7, ratio: 5.4, bright: 0.25, pan: i % 2 ? 0.3 : -0.3 }));
    },
  },
  {
    id: 'gen-lofi-lead', name: 'Lo-Fi-Melodie Fmaj7–Em7–Dm7–Am7', genres: ['lofi'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const l = k.bus({ lowpass: 1800, echo: 0.75, feedback: 0.3, wet: 0.2 });
      [[0, 76, 1], [1, 72, 0.5], [1.5, 69, 0.5], [2.5, 72, 0.5], [3, 74, 1],
        [4, 71, 1], [5, 67, 0.5], [5.5, 69, 0.5], [6.5, 71, 0.5], [7, 74, 1],
        [8, 72, 1], [9, 69, 0.5], [9.5, 65, 0.5], [10.5, 69, 0.5], [11, 72, 1],
        [12, 72, 1.5], [13.5, 71, 0.5], [14, 69, 1.75]].forEach(([b, m, d]) => l.lead2(b, m, d * 0.95, { cutoff: 2000 }));
    },
  },

  // ================= Drum & Bass / Breaks =================
  {
    id: 'gen-dnb-twostep', name: 'DnB-Zweischritt', genres: ['breaks'], category: 'drums', bars: 1, peak: 0.64,
    render(k) {
      steps('X.........X.....', (b) => k.kickDeep(b, 1, { decay: 0.3, tone: 55, punch: 180, click: 0.3 }));
      steps('....X.......X..-', (b, v) => k.snare2(b, v, { tone: 200, bright: 0.95, decay: 0.16 }));
      steps('x.x.x.x.x.x.x.x.', (b) => k.hat909(b, 0.55));
      steps('-o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, v, { pan: 0.3, len: 0.04 }));
    },
  },
  {
    id: 'gen-dnb-jungle', name: 'Jungle-Break', genres: ['breaks'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ drive: 1.5 });
      steps('X.X.......XX.... X.X.......X.....', (b, v) => d.kickDeep(b, v, { decay: 0.25, tone: 58, punch: 170, click: 0.25 }));
      steps('....X..o.o..X..o ....X..o.o....X.', (b, v) => d.snare2(b, v, { tone: 210, bright: 0.85, decay: 0.14 }));
      steps('x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', (b, v) => d.ride(b, 0.6 * v));
    },
  },
  {
    id: 'gen-dnb-roller', name: 'Rollende Drums', genres: ['breaks'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      steps('X.........X..... X.........X..x..', (b, v) => k.kickDeep(b, v, { decay: 0.3, tone: 55, punch: 180, click: 0.3 }));
      steps('....X..-....X..- ....X..-....X.--', (b, v) => k.snare2(b, v, { tone: 205, bright: 0.9, decay: 0.15 }));
      steps('xoxoxoxoxoxoxoxo xoxoxoxoxoxoxoxo', (b, v) => k.hat909(b, 0.45 * v));
      steps('..x.......x..... ..x...x...x.....', (b, v) => k.rim(b, v));
    },
  },
  {
    id: 'gen-dnb-bigbeat', name: 'Big-Beat-Break', genres: ['breaks'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ drive: 2, lowpass: 7000 });
      steps('X..X......X..... X..X....X.X.....', (b, v) => d.kickDeep(b, v, { decay: 0.35, tone: 52, punch: 150, click: 0.3 }));
      steps('....X.......X... ....X..-....X...', (b, v) => { d.snare2(b, v, { tone: 190, decay: 0.2 }); if (v > 0.5) d.clap(b, 0.5); });
      steps('x.x.x.x.x.x.x.x. x.x.x.x.x.x.x...', (b) => d.hat(b, 0.8));
      d.hat(7.5, 0.8, true);
    },
  },
  {
    id: 'gen-dnb-halftime', name: 'Halftime-Beat', genres: ['breaks', 'trap'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      steps('X......x........ X.x.......x.....', (b, v) => k.kickDeep(b, v, { decay: 0.4, tone: 50, punch: 160, click: 0.3 }));
      for (const b of [2, 6]) k.snare2(b, 1, { tone: 200, bright: 1, decay: 0.22 });
      steps('x.o.x.o.x.o.x.o. x.o.x.o.x.oox.o.', (b, v) => k.hat909(b, 0.6 * v));
      k.rim(3.75, 0.6); k.rim(7.25, 0.6);
    },
  },
  {
    id: 'gen-dnb-reese', name: 'Reese-Bass Am–F', genres: ['breaks'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      [[0, 33, 1.5], [1.75, 33, 0.6], [2.5, 36, 1.4], [4, 29, 2.5], [6.5, 31, 1.4]]
        .forEach(([b, m, l]) => k.reese(b, m, l, { cutoff: 650, rate: 0.25 }));
    },
  },
  {
    id: 'gen-dnb-liquidbass', name: 'Liquid-Bass Am–F–C–G', genres: ['breaks'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–F–C–G').forEach(({ r }, bar) => {
        [[0, r, 1.25], [1.5, r, 0.4], [2.5, r, 1.2], [3.5, r + 12, 0.4]].forEach(([b, m, l], i) =>
          k.bass808(bar * 4 + b, m, l, { drive: 1.2, vel: i ? 0.85 : 1 }));
      });
    },
  },
  {
    id: 'gen-dnb-pad', name: 'Liquid-Fläche Am9–Fmaj7–C–G', genres: ['breaks', 'ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am9–Fmaj7–C–G').forEach(({ c }, bar) => s.supersaw(bar * 4, c, 4, { cutoff: 1600, attack: 0.6, release: 0.8, voices: 2 }));
    },
  },
  {
    id: 'gen-dnb-bells', name: 'Liquid-Glocken Am–F–C–G', genres: ['breaks'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const m = k.bus({ echo: 0.75, feedback: 0.35, wet: 0.3 });
      prog('Am–F–C–G').forEach(({ c }, bar) => {
        const n = up(c, 12);
        [n[0], n[1], n[2], n[0] + 12, n[2], n[1], n[0] + 12, n[2]].forEach((x, i) => m.mallet(bar * 4 + i / 2, x, i % 2 ? 0.65 : 0.85, { decay: 0.6, pan: i % 2 ? 0.25 : -0.25 }));
      });
    },
  },
  {
    id: 'gen-dnb-ravepiano', name: 'Rave-Piano Am–F', genres: ['breaks', 'house'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const p = k.bus({ space: 0.15, highpass: 150 });
      prog('Am–F').forEach(({ c }, bar) => {
        steps('X..X..X...X..X..', (s, v) => { p.keys(bar * 4 + s, up(c, 12), 0.4, { vel: v }); p.organ2(bar * 4 + s, c, 0.3, { vel: 0.5 * v }); });
      });
    },
  },

  // ================= Reggaeton / Dembow =================
  {
    id: 'gen-reggaeton-dembow', name: 'Dembow', genres: ['reggaeton'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) k.kickDeep(b, 1, { decay: 0.32, tone: 55, punch: 160, click: 0.25 });
      steps('...X..X....X..X.', (b) => k.snare2(b, 0.9, { tone: 220, bright: 0.7, decay: 0.12 }));
      steps('x.o.x.o.x.o.x.o.', (b, v) => k.hat909(b, 0.5 * v));
    },
  },
  {
    id: 'gen-reggaeton-perreo', name: 'Perreo', genres: ['reggaeton'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      for (let b = 0; b < 8; b++) k.kickDeep(b, 1, { decay: 0.35, tone: 52, punch: 150, click: 0.25 });
      steps('...X..X....X..X. ...X..X....X..X.', (b) => { k.snare2(b, 0.8, { tone: 230, decay: 0.12 }); k.snap(b, 0.4); });
      steps('x.x.x.x.x.x.x.x. x.x.x.x.x.....x.', (b) => k.hat909(b, 0.4));
      steps('................ ........xxXxoXxX', (b, v) => k.conga(b, v > 0.8 ? 420 : 320, v, { pan: v > 0.8 ? 0.3 : -0.3, decay: 0.15, slap: 0.4 }));
      k.hat909(3.5, 0.5, true);
    },
  },
  {
    id: 'gen-reggaeton-perc', name: 'Dembow-Percussion', genres: ['reggaeton', 'afro'], category: 'drums', bars: 1, peak: 0.45,
    render(k) {
      steps('...x..x....x..x.', (b, v) => k.rim(b, v));
      steps('o-x-o-x-o-x-o-x-', (b, v) => k.shaker(b, v, { pan: 0.4 }));
      steps('X...o...X...o...', (b, v) => k.conga(b, 200, v, { pan: -0.4, decay: 0.25 }));
      k.clave(1.5, 0.5, { pan: 0.2 }); k.clave(3.5, 0.5, { pan: 0.2 });
    },
  },
  {
    id: 'gen-reggaeton-bass', name: 'Reggaeton-Bass Am–F–C–G', genres: ['reggaeton'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–F–C–G').forEach(({ r }, bar) => {
        [[0, r, 0.6], [0.75, r, 0.6], [1.5, r + 12, 0.4], [2, r, 0.6], [2.75, r, 0.6], [3.5, r + 7, 0.4]]
          .forEach(([b, m, l], i) => k.bass808(bar * 4 + b, m, l, { drive: 2.2, vel: i % 3 ? 0.85 : 1 }));
      });
    },
  },
  {
    id: 'gen-reggaeton-moombah', name: 'Moombah-Bass Am–G–F–E', genres: ['reggaeton'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      prog('Am–G–F–E').forEach(({ r }, bar) => {
        [[0, r, 0.5], [0.75, r, 0.25], [1.5, r, 0.5], [2.5, r + 12, 0.25], [3, r, 0.75]]
          .forEach(([b, m, l], i) => k.synthBass(bar * 4 + b, m, l, { cutoff: 500, env: 2500, res: 8, decay: 0.15, sub: 0.6, vel: i === 3 ? 0.8 : 1 }));
      });
    },
  },
  {
    id: 'gen-reggaeton-chords', name: 'Reggaeton-Akkorde Am–F–C–G', genres: ['reggaeton', 'pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.2, wet: 0.15 });
      prog('Am–F–C–G').forEach(({ c }, bar) => {
        steps('X..x..x.X..x..x.', (s, v) => p.pluckSaw(bar * 4 + s, up(c, 12), v, { decay: 0.3, cutoff: 2600 }));
      });
    },
  },
  {
    id: 'gen-reggaeton-lead', name: 'Latin-Melodie Am–G–F–E', genres: ['reggaeton', 'pop'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.35, wet: 0.3 });
      [[0, 72], [0.75, 76], [1.5, 81], [2, 79], [2.5, 76], [3.5, 74],
        [4, 74], [4.75, 79], [5.5, 83], [6, 81], [6.5, 79], [7.5, 77],
        [8, 77], [8.75, 81], [9.5, 84], [10, 81], [10.5, 77], [11.5, 76],
        [12, 76], [12.75, 80], [13.5, 83], [14, 80], [14.5, 76], [15, 74], [15.5, 71]]
        .forEach(([b, m], i) => p.pluckSaw(b, m, i % 6 === 0 ? 1 : 0.85, { decay: 0.7, cutoff: 3000 }));
    },
  },

  // ================= Afro / Amapiano =================
  {
    id: 'gen-afro-beat', name: 'Afrobeats', genres: ['afro'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      steps('X......X..X.....', (b) => k.kickDeep(b, 1, { decay: 0.35, tone: 52, punch: 140, click: 0.2 }));
      steps('..x..x....x..x..', (b, v) => k.rim(b, v));
      for (const b of [1, 3]) k.snare2(b, 0.6, { tone: 230, decay: 0.12, bright: 0.6 });
      steps('-x-o-x-o-x-o-xx-', (b, v) => k.shaker(b, v, { pan: 0.3 }));
      steps('.......o......o.', (b, v) => k.conga(b, 250, v, { pan: -0.4 }));
    },
  },
  {
    id: 'gen-afro-amapiano', name: 'Amapiano-Groove', genres: ['afro', 'house'], category: 'drums', bars: 2, peak: 0.6,
    render(k) {
      const sw = 0.07;
      for (let b = 0; b < 8; b++) k.kickDeep(b, 0.8, { decay: 0.4, tone: 50, punch: 110, click: 0.05 });
      steps('-x-o-x-X-x-o-x-o -x-o-x-X-x-o-xXo', (b, v) => k.shaker(b, v, { pan: -0.25 }), sw);
      const e = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.25 });
      steps('...x..x...x..x.. ...x..x...x...x.', (b, v) => e.rim(b, v), sw);
      [3, 7].forEach((b) => e.snap(b, 0.7, 0.3));
    },
  },
  {
    id: 'gen-afro-perc', name: 'Afro-Percussion', genres: ['afro'], category: 'drums', bars: 2, peak: 0.5,
    render(k) {
      steps('X..X..X...X.X... X..X..X...X.X...', (b) => k.clave(b, 0.7, { pan: 0.25 }));
      steps('..x..x..x.x..x.. ..x..x..x.x..x..', (b, v) => k.cowbell(b, 0.5 * v, -0.3));
      steps('..o.x..x..o.x.xo ..o.x..x..o.xxXo', (b, v) => k.conga(b, 330, v, { pan: 0.45, decay: 0.16 }));
      steps('X.......X...o... X.......X..o....', (b, v) => k.conga(b, 190, v, { pan: -0.45, decay: 0.3 }));
      steps('-o-o-o-o-o-o-o-o -o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, v, { len: 0.05 }));
    },
  },
  {
    id: 'gen-afro-logdrum', name: 'Log-Drum A', genres: ['afro', 'house'], category: 'bass', bars: 2, peak: 0.55,
    render(k) {
      [[0.75, 45, 0.6, 1], [1.5, 45, 0.6, 0.8], [2.25, 43, 0.6, 0.9], [3, 40, 0.5, 0.8], [3.5, 45, 0.4, 1],
        [4.75, 45, 0.6, 1], [5.5, 48, 0.6, 0.9], [6.25, 45, 0.6, 0.9], [7, 43, 0.5, 0.8], [7.5, 40, 0.4, 0.9]]
        .forEach(([b, m, l, v]) => k.logDrum(b, m, l, { vel: v }));
    },
  },
  {
    id: 'gen-afro-logdrum2', name: 'Log-Drum Am9–Dm9', genres: ['afro'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      [...prog('Am9–Dm9'), ...prog('Am9–Dm9')].forEach(({ r }, bar) => {
        const R = r + 12;
        const fill = bar === 3 ? [[3, R + 3], [3.5, R + 7]] : [[3, R - 5], [3.5, R]];
        [[0.75, R], [1.5, R], [2.25, R + 7], ...fill].forEach(([b, m], i) => k.logDrum(bar * 4 + b, m, 0.55, { vel: i % 2 ? 0.85 : 1 }));
      });
    },
  },
  {
    id: 'gen-afro-keys', name: 'Amapiano-Keys Am9–Dm9', genres: ['afro', 'house'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const r = k.bus({ echo: 0.75, feedback: 0.25, wet: 0.15 });
      prog('Am9–Dm9').forEach(({ c }, bar) => {
        steps('..X...X..x..X...', (s, v) => r.rhodes(bar * 4 + s, c, 0.4, { vel: v, tremolo: 0.2 }));
      });
    },
  },
  {
    id: 'gen-afro-pad', name: 'Afro-Fläche Am–F–C–G', genres: ['afro', 'pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const v = k.bus({ highpass: 120 });
      prog('Am–F–C–G').forEach(({ c }, bar) => v.vox(bar * 4, c, 4, { vowel: 'o', attack: 0.15 }));
    },
  },
  {
    id: 'gen-afro-marimba', name: 'Afro-Marimba Am', genres: ['afro'], category: 'synth', bars: 2, peak: 0.4,
    render(k) {
      [[0, 69], [0.5, 72], [0.75, 76], [1.25, 74], [1.75, 72], [2.25, 69], [2.5, 67], [3, 69], [3.5, 64],
        [4, 69], [4.5, 72], [4.75, 76], [5.25, 79], [5.75, 76], [6.25, 74], [6.5, 72], [7, 74], [7.5, 76]]
        .forEach(([b, m], i) => k.mallet(b, m, i % 3 === 0 ? 1 : 0.75, { decay: 0.45, pan: (i % 3 - 1) * 0.3 }));
    },
  },
  {
    id: 'gen-afro-flute', name: 'Afro-Flöte Am–F–C–G', genres: ['afro'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const f = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.2 });
      [[0.5, 76, 0.5], [1, 79, 0.5], [1.5, 76, 0.75], [2.5, 72, 1],
        [4.5, 77, 0.5], [5, 76, 0.5], [5.5, 72, 0.75], [6.5, 69, 1],
        [8.5, 72, 0.5], [9, 76, 0.5], [9.5, 79, 0.75], [10.5, 76, 1],
        [12.5, 74, 0.5], [13, 71, 0.5], [13.5, 74, 0.75], [14.5, 67, 1]]
        .forEach(([b, m, l]) => f.pipe(b, m, l, { vel: 0.9 }));
    },
  },

  // ================= Funk / Disco =================
  {
    id: 'gen-funk-disco', name: 'Disco-Beat', genres: ['funk', 'house'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) k.kick(b);
      for (const b of [1, 3]) { k.snare2(b, 0.8, { tone: 200, decay: 0.16 }); k.clap(b, 0.5); }
      steps('..X...X...X...X.', (b) => k.hat(b, 0.8, true));
      steps('x.o.x.o.x.o.x.o.', (b, v) => k.hat(b, 0.5 * v));
      steps('-o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, v, { pan: 0.35, tone: 8500 }));
    },
  },
  {
    id: 'gen-funk-groove', name: 'Funk-Groove', genres: ['funk'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      steps('X.X....X..X..... X.....X...X..X..', (b, v) => k.kickDeep(b, v, { decay: 0.3, tone: 55, punch: 150, click: 0.25 }));
      steps('....X..-.-..X..- ....X..-....X.X.', (b, v) => k.snare2(b, v, { tone: 200, decay: 0.15, bright: 0.75 }));
      steps('xoxoxoxoxoxoxoxo xoxoxoxoxoxoxo..', (b, v) => k.hat(b, 0.7 * v));
      k.hat(7.5, 0.7, true);
    },
  },
  {
    id: 'gen-funk-break', name: 'Funk-Break', genres: ['funk', 'breaks', 'hiphop'], category: 'drums', bars: 2, peak: 0.62,
    render(k) {
      const d = k.bus({ drive: 1.4, lowpass: 9000 });
      const sw = 0.03;
      steps('X.X...X...X..X.. X.X...X...X.....', (b, v) => d.kickDeep(b, v, { decay: 0.3, tone: 55, punch: 140, click: 0.2 }), sw);
      steps('....X..-.-.-X..- ....X..-.-..X.x.', (b, v) => d.snare2(b, v, { tone: 195, decay: 0.15 }), sw);
      steps('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-', (b, v) => d.hat(b, 0.75 * v), sw);
      d.hat(3.5 + sw, 0.6, true);
    },
  },
  {
    id: 'gen-funk-perc', name: 'Disco-Percussion', genres: ['funk', 'house'], category: 'drums', bars: 1, peak: 0.48,
    render(k) {
      steps('..x...x...x...x.', (b, v) => k.cowbell(b, 0.6 * v, 0.3));
      steps('o.x.oxx.o.x.oxx.', (b, v) => k.conga(b, v > 0.6 ? 340 : 260, v, { pan: -0.35, decay: 0.15 }));
      for (const b of [1, 3]) k.shaker(b, 1, { len: 0.12, tone: 9000, pan: 0.2 });
      steps('-o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, 0.7 * v, { len: 0.04, tone: 9000, pan: 0.2 }));
    },
  },
  {
    id: 'gen-funk-octbass', name: 'Disco-Oktavbass Am–Dm', genres: ['funk', 'house'], category: 'bass', bars: 2, peak: 0.5,
    render(k) {
      prog('Am–Dm').forEach(({ r }, bar) => {
        const line = bar === 1 ? [r, r + 12, r, r + 12, r, r + 12, r + 10, r + 7] : [r, r + 12, r, r + 12, r, r + 12, r, r + 12];
        line.forEach((m, i) => k.synthBass(bar * 4 + i / 2, m, 0.32, { cutoff: 500, env: 1800, decay: 0.1, vel: i % 2 ? 1 : 0.85 }));
      });
    },
  },
  {
    id: 'gen-funk-slap', name: 'Funk-Bass Am7', genres: ['funk'], category: 'bass', bars: 2, peak: 0.5,
    render(k) {
      [[0, 33, 0.3, 1], [0.5, 45, 0.15, 0.9], [0.75, 33, 0.1, 0.35], [1.25, 43, 0.2, 0.8], [1.5, 45, 0.15, 1], [2, 33, 0.4, 1],
        [2.75, 36, 0.2, 0.8], [3, 38, 0.2, 0.8], [3.5, 40, 0.15, 0.9], [3.75, 43, 0.15, 0.8],
        [4, 33, 0.3, 1], [4.5, 45, 0.15, 1], [4.75, 33, 0.1, 0.35], [5.25, 40, 0.2, 0.8], [5.5, 43, 0.2, 0.9], [6, 45, 0.25, 1],
        [6.5, 43, 0.15, 0.7], [6.75, 40, 0.15, 0.7], [7, 38, 0.2, 0.8], [7.5, 36, 0.2, 0.8], [7.75, 35, 0.15, 0.7]]
        .forEach(([b, m, l, v]) => k.synthBass(b, m, l, { cutoff: 400, env: 3000, res: 3, decay: 0.1, vel: v }));
    },
  },
  {
    id: 'gen-funk-clav', name: 'Clavinet Am7–Dm7', genres: ['funk'], category: 'chords', bars: 2, peak: 0.42,
    render(k) {
      const c = k.bus({ highpass: 300 });
      prog('Am7–Dm7').forEach(({ c: ch }, bar) => {
        steps('x.xX..x.x.xX..x.', (s, v) => ch.forEach((m) => c.pluck(bar * 4 + s, m + 12, v, 0.09)));
      });
    },
  },
  {
    id: 'gen-funk-strings', name: 'Disco-Streicher Am–F–C–G', genres: ['funk', 'pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am–F–C–G').forEach(({ c }, bar) => {
        s.supersaw(bar * 4, up(c, 12), 2, { cutoff: 2600, attack: 0.12, release: 0.35, width: 0.5, voices: 2 });
        s.supersaw(bar * 4 + 2.5, up(c, 12), 1.5, { vel: 0.8, cutoff: 2600, attack: 0.12, release: 0.35, width: 0.5, voices: 2 });
      });
    },
  },
  {
    id: 'gen-funk-brass', name: 'Bläser-Riff Am', genres: ['funk', 'pop'], category: 'synth', bars: 2, peak: 0.42,
    render(k) {
      const b = k.bus({ space: 0.2 });
      [[0.5, 0.25], [1.25, 0.25], [2, 0.5]].forEach(([t, l]) => [69, 72, 76].forEach((m) => b.brass(t, m, l, 0.9)));
      [[4.5, 76, 0.25], [4.75, 79, 0.25], [5, 81, 0.5], [6, 79, 0.25], [6.5, 76, 0.5], [7.25, 72, 0.5]]
        .forEach(([t, m, l]) => { b.brass(t, m, l, 0.9); b.brass(t, m - 12, l, 0.6); });
    },
  },

  // ================= Pop =================
  {
    id: 'gen-pop-beat', name: 'Pop-Beat', genres: ['pop'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      steps('X.....X.X.......', (b) => k.kick(b));
      for (const b of [1, 3]) { k.clap(b, 0.9); k.snare2(b, 0.5, { tone: 200, decay: 0.15 }); }
      steps('x.o.x.o.x.o.x.o.', (b, v) => k.hat(b, v));
    },
  },
  {
    id: 'gen-pop-ballad', name: 'Pop-Ballade', genres: ['pop'], category: 'drums', bars: 2, peak: 0.6,
    render(k) {
      steps('X.........X..... X.....X...X.....', (b) => k.kickDeep(b, 1, { decay: 0.45, tone: 50, punch: 120, click: 0.15 }));
      const s = k.bus({ space: 0.4 });
      [1, 3, 5, 7].forEach((b) => s.snare2(b, 1, { tone: 185, decay: 0.24, bright: 0.7, body: 0.6 }));
      steps('x.o.x.o.x.o.x.o. x.o.x.o.x.o.x.o.', (b, v) => k.hat(b, 0.6 * v));
      steps('-o-o-o-o-o-o-o-o -o-o-o-o-o-o-o-o', (b, v) => k.shaker(b, 0.7 * v, { pan: 0.4 }));
    },
  },
  {
    id: 'gen-pop-claps', name: 'Klatsch-Groove', genres: ['pop', 'reggaeton'], category: 'drums', bars: 1, peak: 0.55,
    render(k) {
      steps('X.......X.......', (b) => k.kickDeep(b, 1, { decay: 0.4, tone: 52, punch: 150 }));
      for (const b of [1, 3]) { k.clap(b); k.clap(b + 0.02, 0.5); }
      steps('.......x......x.', (b) => k.snap(b, 0.8, -0.3));
      steps('o-x-o-x-o-x-o-x-', (b, v) => k.shaker(b, v, { pan: 0.3 }));
    },
  },
  {
    id: 'gen-pop-dance', name: 'Dance-Pop-Beat', genres: ['pop', 'house'], category: 'drums', bars: 1, peak: 0.62,
    render(k) {
      for (let b = 0; b < 4; b++) k.kickDeep(b, 1, { decay: 0.35, tone: 52, punch: 170, click: 0.3, drive: 1.8 });
      for (const b of [1, 3]) { k.clap(b); k.snap(b, 0.5, 0.25); }
      steps('xoXoxoXoxoXoxoXo', (b, v) => k.hat909(b, 0.5 * v));
    },
  },
  {
    id: 'gen-pop-bass', name: 'Pop-Bass Am–F–C–G', genres: ['pop'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      const p = prog('Am–F–C–G');
      p.forEach(({ r }, bar) => {
        const next = p[(bar + 1) % 4].r;
        // letzte Achtel nimmt den nächsten Grundton vorweg
        [r, r, r, r, r, r, r + 7, next].forEach((m, i) =>
          k.synthBass(bar * 4 + i / 2, m + 12, 0.42, { cutoff: 450, env: 1200, decay: 0.14, vel: i % 2 ? 0.8 : 1 }));
      });
    },
  },
  {
    id: 'gen-pop-bass2', name: 'Pop-Bass Am–G–F–E', genres: ['pop'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–G–F–E').forEach(({ r }, bar) => {
        [[0, r, 1.2], [1.5, r, 0.4], [2, r + 12, 0.4], [2.5, r, 0.9], [3.5, r + 7, 0.4]].forEach(([b, m, l], i) =>
          k.synthBass(bar * 4 + b, m, l, { cutoff: 260, env: 900, decay: 0.2, sub: 0.6, vel: i ? 0.85 : 1 }));
      });
    },
  },
  {
    id: 'gen-pop-piano', name: 'Klavier Am–F–C–G', genres: ['pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const p = k.bus({ highpass: 90 });
      prog('Am–F–C–G').forEach(({ c, r }, bar) => {
        p.keys(bar * 4, r + 12, 2, { vel: 0.8 });
        p.keys(bar * 4 + 2, r + 12, 2, { vel: 0.7 });
        steps('X.x.x.x.X.x.x.xx', (s, v) => p.keys(bar * 4 + s, up(c, 12), 0.45, { vel: v }));
      });
    },
  },
  {
    id: 'gen-pop-pad', name: 'Pop-Fläche Am–Dm–Em–Am', genres: ['pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am–Dm–Em–Am').forEach(({ c }, bar) => s.supersaw(bar * 4, c, 4, { cutoff: 2200, attack: 0.15, release: 0.4, voices: 2 }));
    },
  },
  {
    id: 'gen-pop-hook', name: 'Pop-Hook Am–F–C–G', genres: ['pop'], category: 'synth', bars: 4, peak: 0.42,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.3, wet: 0.2 });
      [[0, 76], [0.5, 76], [1, 72], [1.5, 74], [2, 76], [3, 79], [3.5, 76],
        [4, 77], [4.5, 76], [5, 72], [6, 69], [7, 72], [7.5, 74],
        [8, 76], [8.5, 76], [9, 72], [9.5, 74], [10, 76], [11, 79], [11.5, 81],
        [12, 79], [12.5, 74], [13, 71], [14, 74], [15, 71], [15.5, 72]]
        .forEach(([b, m], i) => p.pluckSaw(b, m, b % 1 ? 0.8 : 1, { decay: 0.35, cutoff: 3600 }));
    },
  },
  {
    id: 'gen-pop-arp', name: 'Pop-Arp Am–G–F–E', genres: ['pop', 'synthwave'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const order = [0, 2, 1, 3, 2, 1, 3, 2];
      prog('Am–G–F–E').forEach(({ c }, bar) => {
        const n = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24];
        for (let i = 0; i < 16; i++) k.pluck(bar * 4 + i / 4, n[order[i % 8]], i % 4 === 0 ? 1 : 0.65, 0.14);
      });
    },
  },

  // ================= Synthwave =================
  {
    id: 'gen-synthwave-beat', name: 'Synthwave-Beat', genres: ['synthwave', 'pop'], category: 'drums', bars: 1, peak: 0.64,
    render(k) {
      steps('X.......X.X.....', (b) => k.kickDeep(b, 1, { decay: 0.4, tone: 52, punch: 160, click: 0.2 }));
      const s = k.bus({ space: 0.45 });
      for (const b of [1, 3]) { s.snare2(b, 1, { tone: 180, decay: 0.25, bright: 0.8 }); s.clap(b, 0.5); }
      steps('xoxoxoxoxoxoxoxo', (b, v) => k.hat909(b, 0.4 * v));
    },
  },
  {
    id: 'gen-synthwave-drive', name: 'Retro-Antrieb', genres: ['synthwave'], category: 'drums', bars: 2, peak: 0.64,
    render(k) {
      for (let b = 0; b < 8; b++) k.kickDeep(b, 1, { decay: 0.35, tone: 52, punch: 160, click: 0.2 });
      const s = k.bus({ space: 0.4 });
      [1, 3, 5].forEach((b) => s.snare2(b, 1, { tone: 180, decay: 0.22, bright: 0.8 }));
      steps('x.x.x.x.x.x.x.x. x.x.x.x.x.......', (b) => k.hat909(b, 0.45));
      [[6.5, 170], [6.75, 170], [7, 135], [7.25, 135], [7.5, 105], [7.75, 105]].forEach(([b, f], i) => s.tom(b, f, 0.7 + i * 0.05));
    },
  },
  {
    id: 'gen-synthwave-bass', name: 'Synthwave-Bass Am–F–C–G', genres: ['synthwave'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      prog('Am–F–C–G').forEach(({ r }, bar) => {
        for (let i = 0; i < 8; i++) k.synthBass(bar * 4 + i / 2, i % 4 === 3 ? r + 24 : r + 12, 0.4, { cutoff: 600, env: 900, res: 3, decay: 0.1, sub: 0.5, vel: i % 2 ? 0.8 : 1 });
      });
    },
  },
  {
    id: 'gen-synthwave-arpbass', name: 'Arpeggio-Bass Am–F–G–Em', genres: ['synthwave'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      prog('Am–F–G–Em').forEach(({ r }, bar) => {
        const R = r + 12;
        const fig = [R, R, R + 12, R + 7];
        for (let i = 0; i < 16; i++) k.synthBass(bar * 4 + i / 4, fig[i % 4], 0.2, { type: 'square', cutoff: 350 + 250 * (i % 4 === 2), env: 1200, res: 4, decay: 0.08, vel: i % 4 ? 0.8 : 1 });
      });
    },
  },
  {
    id: 'gen-synthwave-pad', name: 'Retro-Fläche Am–F–C–G', genres: ['synthwave', 'ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am–F–C–G').forEach(({ c }, bar) => s.supersaw(bar * 4, [c[0] - 12, ...c], 4, { cutoff: 1800, attack: 0.5, release: 0.7, voices: 2 }));
    },
  },
  {
    id: 'gen-synthwave-stabs', name: 'Retro-Stabs Am–F–G–Em', genres: ['synthwave'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ echo: 0.75, feedback: 0.25, wet: 0.2 });
      prog('Am–F–G–Em').forEach(({ c }, bar) => {
        steps('X..X..X.X..X..X.', (st, v) => s.supersaw(bar * 4 + st, up(c, 12), 0.4, { vel: v, attack: 0.005, release: 0.12, sweep: [3500, 900] }));
      });
    },
  },
  {
    id: 'gen-synthwave-lead', name: 'Synthwave-Lead Am–F–C–G', genres: ['synthwave'], category: 'synth', bars: 4, peak: 0.42,
    render(k) {
      const l = k.bus({ echo: 0.75, feedback: 0.35, wet: 0.3 });
      [[0, 76, 1.5], [1.5, 79, 0.5], [2, 81, 1.5], [3.5, 79, 0.5],
        [4, 77, 1.5], [5.5, 76, 0.5], [6, 72, 2],
        [8, 76, 1.5], [9.5, 79, 0.5], [10, 84, 1], [11, 83, 1],
        [12, 79, 2], [14, 74, 1], [15, 71, 0.9]].forEach(([b, m, d]) => l.lead2(b, m, d));
    },
  },
  {
    id: 'gen-synthwave-arp', name: 'Retro-Arp Am–F–G–Em', genres: ['synthwave', 'pop'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const p = k.bus({ echo: 0.75, feedback: 0.35, wet: 0.25 });
      prog('Am–F–G–Em').forEach(({ c }, bar) => {
        const n = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24];
        for (let i = 0; i < 16; i++) p.pluckSaw(bar * 4 + i / 4, n[i % 4], i % 4 === 0 ? 1 : 0.7, { decay: 0.15, cutoff: 2800 });
      });
    },
  },

  // ================= Ambient =================
  {
    id: 'gen-ambient-pulse', name: 'Ambient-Puls', genres: ['ambient'], category: 'drums', bars: 2, peak: 0.45,
    render(k) {
      const s = k.bus({ space: 0.5, echo: 0.75, feedback: 0.35, wet: 0.25 });
      [0, 4.5].forEach((b) => k.kickDeep(b, 0.7, { decay: 0.6, tone: 48, punch: 90, click: 0 }));
      steps('o.-.o.-.o.-.o.-. o.-.o.-.o.-.o.-.', (b, v) => s.shaker(b, v, { len: 0.1, tone: 5000 }));
      [3, 7.5].forEach((b) => s.rim(b, 0.6));
    },
  },
  {
    id: 'gen-ambient-clicks', name: 'Glitch-Klicks', genres: ['ambient', 'techno'], category: 'drums', bars: 1, peak: 0.4,
    render(k) {
      const e = k.bus({ echo: 0.25, feedback: 0.3, wet: 0.3, highpass: 300 });
      [[0, 4000, -0.6], [0.75, 1500, 0.5], [1.25, 4000, 0.2], [2.5, 2500, -0.3], [3.25, 1500, 0.6], [3.5, 4000, -0.2]]
        .forEach(([b, f, p]) => e.clave(b, 0.6, { freq: f, pan: p }));
      [1.75, 3.75].forEach((b) => e.snap(b, 0.4, 0.4));
    },
  },
  {
    id: 'gen-ambient-drone', name: 'Drone A', genres: ['ambient', 'techno'], category: 'bass', bars: 4, peak: 0.5,
    render(k) {
      k.reese(0, 33, 16, { cutoff: 320, rate: 0.125, sub: 0.6, attack: 1, release: 2 });
      k.reese(0, 40, 16, { cutoff: 260, rate: 0.0625, sub: 0, vel: 0.35, attack: 1, release: 2 });
    },
  },
  {
    id: 'gen-ambient-sub', name: 'Ambient-Sub Am–F–C–G', genres: ['ambient'], category: 'bass', bars: 4, peak: 0.55,
    render(k) {
      prog('Am–F–C–G').forEach(({ r }, bar) => k.sub(bar * 4, r, 3.8));
    },
  },
  {
    id: 'gen-ambient-pad', name: 'Weite Fläche Am–F–C–G', genres: ['ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Amadd9–Fmaj7–Cmaj7–G6').forEach(({ c }, bar) => s.supersaw(bar * 4, c, 4, { cutoff: 1200, attack: 1, release: 1.4, voices: 2 }));
    },
  },
  {
    id: 'gen-ambient-strings', name: 'Streicher Am–Dm–Em–Am', genres: ['ambient', 'pop'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const s = k.bus({ highpass: 60 });
      prog('Am–Dm–Em–Am').forEach(({ c, r }, bar) => s.supersaw(bar * 4, [r + 12, ...c], 4, { cutoff: 2000, attack: 0.5, release: 0.8, width: 0.5, voices: 2 }));
    },
  },
  {
    id: 'gen-ambient-vox', name: 'Chor Am–F–C–G', genres: ['ambient'], category: 'chords', bars: 4, peak: 0.42,
    render(k) {
      const v = k.bus({ space: 0.5 });
      prog('Amadd9–Fmaj7–Cmaj7–G6').forEach(({ c }, bar) => v.vox(bar * 4, c, 4, { vowel: 'u', attack: 0.8, release: 1.2 }));
    },
  },
  {
    id: 'gen-ambient-bells', name: 'Glocken-Kaskade Am', genres: ['ambient'], category: 'synth', bars: 4, peak: 0.4,
    render(k) {
      const b = k.bus({ echo: 0.75, feedback: 0.4, wet: 0.3, space: 0.4 });
      [[0, 81], [1.5, 76], [3, 79], [4.5, 72], [6, 74], [8, 76], [9.5, 84], [11, 79], [12.5, 72], [14, 69]]
        .forEach(([t, m], i) => b.chime(t, m, i % 2 ? 0.6 : 0.8, { decay: 1.6, pan: i % 2 ? 0.3 : -0.3 }));
    },
  },
  {
    id: 'gen-ambient-shimmer', name: 'Schimmer Am', genres: ['ambient'], category: 'synth', bars: 2, peak: 0.38,
    render(k) {
      const s = k.bus({ echo: 0.75, feedback: 0.45, wet: 0.35, space: 0.4, highpass: 400 });
      [[0, 81], [0.75, 88], [1.5, 84], [2.5, 86], [3.25, 83], [4, 81], [4.75, 88], [5.5, 91], [6.5, 86], [7.25, 84]]
        .forEach(([b, m], i) => s.mallet(b, m, i % 2 ? 0.6 : 0.8, { decay: 0.8, ratio: 2.76, bright: 0.4, pan: i % 2 ? 0.5 : -0.5 }));
    },
  },

  // ================= FX =================
  {
    id: 'gen-fx-riser-long', name: 'Riser lang', genres: ['techno', 'house', 'pop', 'breaks', 'synthwave'], category: 'fx', bars: 4, peak: 0.5, oneShot: true,
    render(k) { k.sweep(0, 16); k.zap(0, 16, 110, 1760, { fadeIn: true, vel: 0.5 }); k.swell(8, 8, 0.5); },
  },
  {
    id: 'gen-fx-riser-short', name: 'Riser kurz', genres: ['house', 'pop', 'reggaeton', 'trap'], category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    render(k) { k.sweep(0, 4); k.zap(0, 4, 220, 1760, { fadeIn: true, vel: 0.4 }); },
  },
  {
    id: 'gen-fx-snareroll', name: 'Snare-Wirbel', genres: ['pop', 'house', 'trap', 'breaks', 'synthwave'], category: 'fx', bars: 2, peak: 0.5, oneShot: true,
    render(k) {
      const hits = [];
      for (let b = 0; b < 4; b += 0.5) hits.push(b);
      for (let b = 4; b < 6; b += 0.25) hits.push(b);
      for (let b = 6; b < 7.7; b += 0.125) hits.push(b);
      const s = k.bus({ highpass: 200 });
      hits.forEach((b) => s.snare2(b, 0.2 + 0.8 * (b / 7.7), { tone: 210, decay: 0.1, bright: 0.85 }));
    },
  },
  {
    id: 'gen-fx-snareroll-short', name: 'Snare-Wirbel kurz', genres: ['pop', 'trap', 'reggaeton', 'funk'], category: 'fx', bars: 1, peak: 0.5, oneShot: true,
    render(k) {
      const hits = [];
      for (let b = 0; b < 2; b += 0.25) hits.push(b);
      for (let b = 2; b < 3.7; b += 0.125) hits.push(b);
      hits.forEach((b) => k.snare2(b, 0.25 + 0.75 * (b / 3.7), { tone: 220, decay: 0.08, bright: 0.85 }));
    },
  },
  {
    id: 'gen-fx-down-long', name: 'Downlifter lang', genres: ['techno', 'house', 'breaks', 'synthwave', 'ambient'], category: 'fx', bars: 4, peak: 0.45, oneShot: true,
    render(k) { k.sweep(0, 16, true); k.zap(0, 12, 1200, 60, { vel: 0.3, cutoff: 2500 }); },
  },
  {
    id: 'gen-fx-subdrop', name: 'Sub-Drop', genres: ['trap', 'hiphop', 'techno', 'breaks'], category: 'fx', bars: 1, peak: 0.6, oneShot: true,
    render(k) { k.subDrop(0, 3.5); },
  },
  {
    id: 'gen-fx-impact-big', name: 'Impact groß', genres: ['ambient', 'techno', 'trap', 'synthwave', 'pop'], category: 'fx', bars: 2, peak: 0.6, oneShot: true,
    render(k) { const s = k.bus({ space: 0.35 }); s.impact(0); s.crash(0); s.clang(0, 160, 0.5); },
  },
  {
    id: 'gen-fx-reverse', name: 'Rückwärts-Becken', genres: ['pop', 'house', 'synthwave', 'reggaeton'], category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    render(k) { k.swell(0, 4); },
  },
  {
    id: 'gen-fx-laser', name: 'Laser', genres: ['techno', 'breaks', 'reggaeton', 'synthwave'], category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    render(k) {
      const e = k.bus({ echo: 0.5, feedback: 0.3, wet: 0.3 });
      [0, 0.5, 1].forEach((b, i) => e.zap(b, 0.4, 3200 - i * 600, 140, { type: 'square', cutoff: 5000, vel: 1 - i * 0.2 }));
    },
  },
  {
    id: 'gen-fx-whoosh', name: 'Whoosh', genres: ALL, category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    render(k) { k.sweep(0, 2); k.sweep(2, 2, true); },
  },
  {
    id: 'gen-fx-boom', name: '808-Boom', genres: ['trap', 'hiphop', 'reggaeton'], category: 'fx', bars: 1, peak: 0.6, oneShot: true,
    render(k) { k.bass808(0, 33, 3, { drive: 2.5 }); k.kickDeep(0, 1, { decay: 0.6, tone: 50, punch: 180, click: 0.4 }); },
  },
  {
    id: 'gen-fx-crashdown', name: 'Absturz', genres: ['techno', 'breaks', 'trap', 'synthwave'], category: 'fx', bars: 1, peak: 0.45, oneShot: true,
    render(k) { k.zap(0, 3, 420, 25, { type: 'square', cutoff: 1400, vel: 1 }); },
  },
  {
    id: 'gen-fx-vinyl', name: 'Vinyl-Knistern', genres: ['lofi', 'hiphop', 'ambient'], category: 'fx', bars: 2, peak: 0.3,
    render(k) { k.vinyl(0, 8, 1); },
  },
  {
    id: 'gen-fx-wind', name: 'Wind', genres: ['ambient', 'lofi'], category: 'fx', bars: 4, peak: 0.35,
    render(k) { k.wind(0, 16); },
  },
  {
    id: 'gen-fx-noisehit', name: 'Rausch-Schlag', genres: ['pop', 'synthwave', 'house', 'trap'], category: 'fx', bars: 1, peak: 0.5, oneShot: true,
    render(k) { const s = k.bus({ space: 0.45 }); s.snare2(0, 1, { tone: 170, decay: 0.35, bright: 1 }); s.clap(0, 0.8); s.kickDeep(0, 0.8, { decay: 0.5 }); },
  },
  {
    id: 'gen-fx-transition', name: 'Übergang', genres: ['pop', 'house', 'techno', 'synthwave', 'breaks'], category: 'fx', bars: 2, peak: 0.55, oneShot: true,
    render(k) { k.swell(0, 4, 0.8); k.impact(4); k.crash(4); },
  },
];

// Viele kurze Noten: Knoten erst kurz vor dem Einsatz bauen (kit.defer), damit das Rendern schnell bleibt
export const MORE_LOOP_DEFS = DEFS.map((def) => ({ ...def, render: (k) => def.render(k.defer()) }));
