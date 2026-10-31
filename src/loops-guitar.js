// E-Gitarren-Loops und -One-Shots (eigene Klänge, CC0): gespielt von der Gitarre aus src/dsp/guitar.js.
// Alles in A-Moll notiert (Standardstimmung E2 A2 D3 G3 B3 E4); der Tonartwechsel verschiebt jeden Ton um semis
// (über sechs Halbtöne nach unten statt nach oben, damit die Gitarre in ihrer Lage bleibt).
// Format wie LOOP_DEFS; gerendert wird über kit.pcm in derselben Kette wie jeder andere Loop.

import { renderGuitar } from './dsp/guitar.js';
import { mulberry32 } from './util.js';

export const GUITAR_GENRES = [
  { id: 'rock', label: 'Rock & Metal' },
  { id: 'blues', label: 'Blues & Surf' },
];
export const GUITAR_TAGS = ['gitarre', 'e-gitarre', 'guitar'];

// Powerchords (Grundton, Quinte, Oktave)
const P5 = { A: [45, 52, 57], F: [41, 48, 53], C: [48, 55, 60], G: [43, 50, 55], E: [40, 47, 52], D: [50, 57, 62] };
// Offene Griffe, tiefe Saite zuerst
const OPEN = {
  Am: [45, 52, 57, 60, 64], F: [41, 48, 53, 57, 60, 65], C: [48, 52, 55, 60, 64], G: [43, 47, 50, 55, 59, 67],
  Em: [40, 47, 52, 55, 59, 64], Dm: [50, 57, 62, 65], E: [40, 47, 52, 56, 59, 64],
  Am7: [45, 52, 55, 60, 64], Dm7: [50, 57, 60, 65], Em7: [40, 47, 52, 55, 62, 64], Fmaj7: [41, 53, 57, 60, 64],
  Cmaj7: [48, 52, 55, 59, 64], Am9: [45, 52, 55, 59, 60], Dm9: [50, 53, 57, 60, 64],
};
// Hohe Lage (Funk, Disco, Highlife)
const HIGH = {
  Am7: [57, 60, 64, 67], Dm7: [57, 60, 62, 65], Am: [64, 69, 72], Dm: [62, 65, 69], C: [64, 67, 72],
  G: [62, 67, 71], F: [65, 69, 72], E: [64, 68, 71], Em: [64, 67, 71],
};
const PROG = {
  'Am–F–C–G': ['Am', 'F', 'C', 'G'], 'Am–G–F–E': ['Am', 'G', 'F', 'E'], 'Am–F–G–Em': ['Am', 'F', 'G', 'Em'],
  'Fmaj7–Em7–Dm7–Am7': ['Fmaj7', 'Em7', 'Dm7', 'Am7'],
};
const ROOT = { Am: 'A', F: 'F', C: 'C', G: 'G', E: 'E', Em: 'E', Dm: 'D' };

// Schrittmuster in 16teln wie in loops-more.js: X = 1, x = 0,75, o = 0,5, - = 0,3
const VEL = { X: 1, x: 0.75, o: 0.5, '-': 0.3 };
function steps(pattern, fn, swing = 0) {
  const p = pattern.replace(/[\s|]/g, '');
  for (let i = 0; i < p.length; i++) {
    const v = VEL[p[i]];
    if (v) fn(i / 4 + (i % 2 ? swing : 0), v, i);
  }
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Spielanweisungen in Schlägen → Saiten-Ereignisse in Sekunden (siehe addString in src/dsp/guitar.js)
function player(spb, semis, seed) {
  const s = semis > 6 ? semis - 12 : semis;
  const rand = mulberry32(seed);
  const T = (b) => b * spb;
  const ev = [], scrapes = [];
  const g = {
    ev, scrapes,
    // Einzelton; len in Schlägen (null = ausklingen lassen). glide: [[Schlag ab Ton, Ziel, Dauer in Schlägen]],
    // glideBy wie glide, aber Ziel in Halbtönen relativ zum Ton (für ganze Griffe)
    note(b, m, len, o = {}) {
      const { dt = 0, glide, glideBy, vib, swell, ...rest } = o;
      const gl = glide || glideBy?.map(([gb, d, l]) => [gb, m + d, l]);
      ev.push({
        ...rest, t: T(b) + dt, midi: m + s, dur: len == null ? Infinity : T(len),
        vel: (o.vel ?? 0.85) * (0.94 + 0.06 * rand()),
        glide: gl?.map(([gb, to, l]) => [T(gb), to + s, T(l)]),
        vib: vib ? [vib[0], vib[1], T(vib[2] ?? 0)] : undefined,
        swell: swell ? T(swell) : undefined,
      });
    },
    // Anschlag: abwärts von der tiefen Saite, aufwärts nur die hohen Saiten (von oben)
    strum(b, notes, len, o = {}) {
      const { up = false, spread = 0.008, vel = 0.85, ...rest } = o;
      const order = up ? notes.slice(-Math.min(notes.length, 4)).reverse() : notes;
      order.forEach((m, i) => g.note(b, m, len, { ...rest, dt: i * spread, vel: vel * (up ? 0.75 : 1) * (1 - 0.04 * i) }));
    },
    // Gedämpfter Anschlag ohne Ton (Funk-Scratch)
    dead(b, notes, vel = 0.6, up = false) {
      g.strum(b, notes, 0.1, { dead: true, vel, up, spread: 0.004 });
    },
    // Plektrum über die Saite ziehen
    scrape(b, len, from = 2600, to = 300, vel = 0.8) {
      scrapes.push({ t: T(b), dur: T(len), from, to, vel });
    },
  };
  return g;
}

// Def bauen: play(g) setzt die Töne, amp/fx/double bestimmen den Klang
function gdef(d) {
  const seed = hash(d.id);
  return {
    category: 'chords', peak: d.oneShot ? 0.45 : 0.42, ...d, tags: GUITAR_TAGS,
    render(k) {
      k.pcm(0, (sr, spb, semis) => {
        const g = player(spb, semis, seed);
        d.play(g);
        const frames = Math.round(d.bars * 4 * spb * sr);
        return renderGuitar(g.ev, {
          sr, spb, amp: d.amp, fx: d.fx, double: d.double, scrapes: g.scrapes, seed,
          ...(d.oneShot ? { frames } : { loopFrames: frames }),
        });
      });
    },
  };
}

const DEFS = [
  // ================= Rock =================
  {
    id: 'gtr-rock-power', name: 'Rock-Gitarre Powerchords Am–F–C–G', genres: ['rock', 'pop'], bars: 4,
    amp: 'crunch', double: true,
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const pc = P5[ROOT[c]], o = bar * 4;
        g.strum(o, pc, 0.95, { vel: 1 });
        [1, 1.5, 2.5, 3].forEach((b) => g.strum(o + b, pc.slice(0, 2), 0.4, { mute: 0.75, vel: 0.8 }));
        g.strum(o + 2, pc, 0.45, { vel: 0.95 });
        g.strum(o + 3.5, pc, 0.45, { vel: 0.9 });
      });
    },
  },
  {
    id: 'gtr-rock-palm', name: 'Rock-Gitarre Palm-Mute-Achtel A', genres: ['rock'], bars: 2,
    amp: 'crunch', double: true,
    play(g) {
      for (let i = 0; i < 12; i++) g.strum(i / 2, P5.A.slice(0, 2), 0.45, { mute: 0.8, vel: i % 2 ? 0.75 : 0.95 });
      g.strum(6, P5.F, 0.45, { vel: 1 });
      g.strum(6.5, P5.F.slice(0, 2), 0.4, { mute: 0.8, vel: 0.75 });
      g.strum(7, P5.G, 0.95, { vel: 1 });
    },
  },
  {
    id: 'gtr-rock-punk', name: 'Punk-Gitarre Am–F–C–G', genres: ['rock'], bars: 2,
    amp: 'lead', double: true,
    play(g) {
      PROG['Am–F–C–G'].forEach((c, i) => {
        for (let k = 0; k < 4; k++) g.strum(i * 2 + k / 2, P5[ROOT[c]], 0.42, { vel: k % 2 ? 0.85 : 1, mute: 0.2 });
      });
    },
  },
  {
    id: 'gtr-rock-riff', name: 'Rock-Riff A (E-Gitarre)', genres: ['rock', 'blues'], bars: 2,
    amp: 'crunch', double: true, fx: { reverb: { size: 0.5, mix: 0.08 } },
    play(g) {
      const pm = { mute: 0.7 };
      [[0, 45, pm], [0.5, 45, pm], [1, 48], [1.5, 45, pm], [2, 50], [2.5, 48], [3, 45, pm], [3.5, 43],
        [4, 45, pm], [4.5, 45, pm], [5, 48], [5.5, 45, pm], [6, 50, { glide: [[0.05, 52, 0.2]] }]]
        .forEach(([b, m, o = {}]) => g.note(b, m, 0.45, { vel: 0.9, ...o }));
      g.strum(7, P5.G, 0.45, { vel: 1 });
      g.strum(7.5, P5.A, 0.45, { vel: 1 });
    },
  },
  {
    id: 'gtr-rock-solo', name: 'Rock-Solo Am (E-Gitarre)', genres: ['rock', 'blues'], bars: 2,
    amp: 'lead', fx: { echo: { time: 0.75, feedback: 0.3, mix: 0.22 }, reverb: { size: 0.6, mix: 0.12 } },
    play(g) {
      g.note(0, 69, 0.45);
      g.note(0.5, 72, 0.45);
      g.note(1, 74, 1.45, { glide: [[0.08, 76, 0.18]], vib: [0.3, 5.5, 0.5], vel: 1 });
      g.note(2.5, 72, 0.25);
      g.note(2.75, 69, 0.25);
      g.note(3, 67, 0.95, { glide: [[0, 69, 0.12]], vib: [0.25, 5.5, 0.3] });
      g.note(4, 76, 0.45);
      g.note(4.5, 79, 0.45);
      g.note(5, 79, 0.95, { glide: [[0.1, 81, 0.2]], vib: [0.3, 6, 0.4], vel: 1 });
      g.note(6, 76, 0.45);
      g.note(6.5, 74, 0.45);
      g.note(7, 72, 0.95, { glide: [[0.2, 69, 0.15]], vib: [0.25, 5.5, 0.5] });
    },
  },
  {
    id: 'gtr-rock-grunge', name: 'Grunge-Gitarre Am–G–F–E', genres: ['rock'], bars: 4,
    amp: 'fuzz', double: true,
    play(g) {
      PROG['Am–G–F–E'].forEach((c, bar) => {
        const pc = P5[ROOT[c]], o = bar * 4;
        g.strum(o, pc, 1.45, { vel: 1, spread: 0.012 });
        g.strum(o + 1.5, pc, 0.95, { vel: 0.85, spread: 0.012 });
        g.strum(o + 2.5, pc.slice(0, 2), 0.45, { mute: 0.6, vel: 0.7 });
        g.strum(o + 3, pc, 0.95, { vel: 0.95, spread: 0.012 });
      });
    },
  },
  {
    id: 'gtr-rock-ballad', name: 'Power-Ballade Gitarre Am–F–C–G', genres: ['rock', 'pop'], bars: 4,
    amp: 'crunch', fx: { chorus: { mix: 0.25, rate: 4 }, reverb: { size: 0.75, mix: 0.2 } },
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const ch = OPEN[c], o = bar * 4;
        [0, 1, 2, 3, 4, 3, 2, 1].forEach((si, i) => {
          const m = ch[Math.min(si, ch.length - 1)];
          g.note(o + i / 2, m, 1.4, { vel: i === 0 ? 0.9 : 0.7, bright: 0.45 });
        });
      });
    },
  },

  // ================= Metal =================
  {
    id: 'gtr-metal-chug', name: 'Metal-Gitarre Riff A (Palm-Mute)', genres: ['rock'], bars: 2,
    amp: 'metal', double: true,
    play(g) {
      const chug = (b, v = 0.9) => g.strum(b, [45, 52], 0.22, { mute: 0.85, vel: v, spread: 0.004 });
      for (let b = 0; b < 6; b++) { chug(b, 1); chug(b + 0.5, 0.8); chug(b + 0.75, 0.8); }
      g.strum(6, P5.F, 0.45, { vel: 1 });
      chug(6.5, 0.85);
      g.strum(7, P5.G, 0.45, { vel: 1 });
      chug(7.5, 0.85); chug(7.75, 0.85);
    },
  },
  {
    id: 'gtr-metal-pedal', name: 'Metal-Gitarre Riff Am harmonisch', genres: ['rock'], bars: 2,
    amp: 'metal', double: true,
    play(g) {
      // Orgelpunkt auf A mit Melodietönen dazwischen (harmonisches Moll)
      const line = [0, 0, 48, 0, 0, 50, 0, 52, 0, 0, 53, 0, 52, 0, 50, 48,
        0, 0, 48, 0, 0, 50, 0, 52, 0, 0, 55, 0, 53, 0, 52, 43];
      line.forEach((m, i) => {
        if (m) g.note(i / 4, m, 0.24, { vel: 0.95 });
        else g.note(i / 4, 45, 0.2, { mute: 0.85, vel: i % 4 ? 0.8 : 1 });
      });
    },
  },

  // ================= Funk & Disco =================
  {
    id: 'gtr-funk-chops', name: 'Funk-Gitarre Chops Am7', genres: ['funk'], bars: 2,
    amp: 'clean', fx: { reverb: { size: 0.4, mix: 0.06 } },
    play(g) {
      const ch = HIGH.Am7;
      ['X.x-x.X.-xX.x-X-', 'X.x-x.X.-xX.x-xX'].forEach((pat, bar) => {
        const p = pat.replace(/\s/g, '');
        for (let i = 0; i < 16; i++) {
          const b = bar * 4 + i / 4;
          if (p[i] === 'X') g.strum(b, ch, 0.14, { up: i % 2 === 1, vel: 0.95, bright: 0.8, spread: 0.005 });
          else if (p[i] === 'x') g.dead(b, ch, 0.55, i % 2 === 1);
          else if (p[i] === '-') g.dead(b, ch, 0.3, i % 2 === 1);
        }
      });
    },
  },
  {
    id: 'gtr-funk-wah', name: 'Wah-Gitarre Am7–Dm7', genres: ['funk', 'hiphop'], bars: 2,
    amp: 'clean', fx: { wah: { mode: 'lfo', rate: 1, lo: 420, hi: 1900, q: 2.6 }, reverb: { size: 0.4, mix: 0.06 } },
    play(g) {
      [HIGH.Am7, HIGH.Dm7].forEach((ch, bar) => {
        steps('X-x-x-X-x-X-x-x- ', (s, v, i) => {
          if (v >= 0.75) g.strum(bar * 4 + s, ch, 0.18, { up: i % 2 === 1, vel: v, bright: 0.75, spread: 0.005 });
          else g.dead(bar * 4 + s, ch, 0.25, i % 2 === 1);
        });
      });
    },
  },
  {
    id: 'gtr-funk-disco', name: 'Disco-Gitarre Oktaven Am–Dm', genres: ['funk', 'house'], bars: 2,
    amp: 'clean', fx: { chorus: { mix: 0.2, rate: 2 }, reverb: { size: 0.4, mix: 0.08 } },
    play(g) {
      [[57, 69], [62, 74]].forEach(([lo, hi], bar) => {
        for (let i = 0; i < 16; i++) {
          const b = bar * 4 + i / 4;
          if (i % 2) g.strum(b, [lo, hi], 0.1, { mute: 0.5, vel: 0.55, up: true, spread: 0.004 });
          else g.strum(b, [lo, hi], 0.2, { vel: i % 4 === 2 ? 0.95 : 0.75, spread: 0.004 });
        }
      });
    },
  },
  {
    id: 'gtr-house-chops', name: 'House-Gitarre Am7', genres: ['house', 'funk'], bars: 1,
    amp: 'clean', fx: { chorus: { mix: 0.2, rate: 1 }, echo: { time: 0.75, feedback: 0.25, mix: 0.15 } },
    play(g) {
      steps('-.X--.X--.X--.Xx', (s, v, i) => {
        if (v >= 0.75) g.strum(s, HIGH.Am7, 0.2, { vel: v, up: i % 2 === 1, bright: 0.7, spread: 0.005 });
        else g.dead(s, HIGH.Am7, 0.35);
      });
    },
  },

  // ================= Indie & Pop =================
  {
    id: 'gtr-indie-arp', name: 'Indie-Gitarre Arpeggio Am–F–C–G', genres: ['pop', 'rock'], bars: 4,
    amp: 'clean', fx: { chorus: { mix: 0.3, rate: 4 }, echo: { time: 0.75, feedback: 0.25, mix: 0.15 }, reverb: { size: 0.6, mix: 0.12 } },
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const ch = OPEN[c], n = ch.length;
        [0, n - 3, n - 2, n - 1, n - 2, n - 3, n - 2, n - 1].forEach((si, i) => g.note(bar * 4 + i / 2, ch[si], 1.2, { vel: i ? 0.7 : 0.85, bright: 0.65 }));
      });
    },
  },
  {
    id: 'gtr-pop-strum', name: 'Pop-Gitarre Anschlag Am–F–C–G', genres: ['pop'], bars: 4,
    amp: 'clean', fx: { reverb: { size: 0.5, mix: 0.1 } },
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const ch = OPEN[c], o = bar * 4;
        [[0, 0, 1], [1, 0, 0.8], [1.5, 1, 0.7], [2.5, 1, 0.7], [3, 0, 0.8], [3.5, 1, 0.65]]
          .forEach(([b, up, v]) => g.strum(o + b, ch, up ? 0.45 : 0.95, { up: !!up, vel: v, spread: 0.01 }));
      });
    },
  },
  {
    id: 'gtr-indie-echo', name: 'Indie-Gitarre Echo Am–F', genres: ['pop', 'rock', 'ambient'], bars: 2,
    amp: 'clean', fx: { echo: { time: 0.75, feedback: 0.45, mix: 0.42, tone: 3500 }, reverb: { size: 0.6, mix: 0.12 } },
    play(g) {
      [[69, 64, 72, 64], [69, 65, 72, 65]].forEach((ns, bar) => {
        for (let i = 0; i < 8; i++) g.note(bar * 4 + i / 2, ns[i % 4], 0.4, { mute: 0.3, vel: i % 4 === 0 ? 0.9 : 0.7, bright: 0.75 });
      });
    },
  },
  {
    id: 'gtr-synthwave', name: '80er-Gitarre Am–F–C–G', genres: ['synthwave', 'pop'], bars: 4,
    amp: 'clean', fx: { chorus: { mix: 0.5, rate: 2, depth: 0.003 }, echo: { time: 0.75, feedback: 0.35, mix: 0.2 }, reverb: { size: 0.7, mix: 0.12 } },
    play(g) {
      ['Am', 'F', 'C', 'G'].forEach((c, bar) => {
        for (let i = 0; i < 8; i++) g.strum(bar * 4 + i / 2, HIGH[c], 0.4, { mute: 0.45, vel: i % 2 ? 0.7 : 0.9, spread: 0.005 });
      });
    },
  },

  // ================= Blues & Surf =================
  {
    id: 'gtr-blues-lick', name: 'Blues-Lick A (E-Gitarre)', genres: ['blues', 'rock'], bars: 2,
    amp: 'crunch', fx: { reverb: { size: 0.65, mix: 0.18 } },
    play(g) {
      const sw = 1 / 6; // Shuffle: zweite Achtel auf die dritte Triole
      g.note(0, 72, 0.6, { glide: [[0.02, 72.5, 0.15]], vib: [0.2, 5, 0.3], vel: 0.95 });
      g.note(1, 69, 0.4);
      g.note(1.5 + sw, 67, 0.3);
      g.note(2, 69, 1.4, { vib: [0.3, 5.5, 0.4] });
      g.note(4, 74, 0.9, { glide: [[0.05, 76, 0.25]], vib: [0.3, 5.5, 0.5], vel: 1 });
      g.note(5, 72, 0.4);
      g.note(5.5 + sw, 69, 0.3);
      g.note(6, 67, 0.4);
      g.note(6.5 + sw, 64, 0.3);
      g.note(7, 62, 0.9, { glide: [[0.15, 64, 0.2]], vib: [0.25, 5, 0.5] });
    },
  },
  {
    id: 'gtr-blues-shuffle', name: 'Blues-Shuffle A (E-Gitarre)', genres: ['blues', 'rock'], bars: 2,
    amp: 'crunch', fx: { reverb: { size: 0.5, mix: 0.1 } },
    play(g) {
      const sw = 1 / 6;
      const pairs = [[45, 52], [45, 53], [45, 55], [45, 53]];
      for (let b = 0; b < 8; b++) {
        const pr = b < 7 ? pairs[b % 4] : [40, 47];
        g.strum(b, pr, 0.55, { mute: 0.45, vel: 0.95, spread: 0.006 });
        g.strum(b + 0.5 + sw, pr, 0.3, { mute: 0.55, vel: 0.75, spread: 0.006 });
      }
    },
  },
  {
    id: 'gtr-surf', name: 'Surf-Gitarre Am (Federhall)', genres: ['blues', 'rock'], bars: 2,
    amp: { hp: 60, drive: 1.6, bias: 0.05, bass: 0, mid: 1, treble: 5, cab: 'combo', fizz: 9000, level: 0.9 }, // hell, fast clean
    fx: { reverb: { size: 0.75, mix: 0.4, spring: true, damp: 0.25 } },
    play(g) {
      const line = [57, 56, 57, 60, 59, 57, 56, 52];
      line.forEach((m, j) => {
        for (let i = 0; i < 4; i++) g.note(j + i / 4, m, 0.24, { mute: 0.25, vel: i ? 0.75 : 0.95, bright: 0.85 });
      });
    },
  },

  // ================= Lo-Fi & Hip-Hop =================
  {
    id: 'gtr-lofi-chords', name: 'Lo-Fi-Gitarre Fmaj7–Em7–Dm7–Am7', genres: ['lofi', 'hiphop'], bars: 4,
    amp: 'jazz', fx: { lofi: { cutoff: 3000, hiss: 0.003, rate: 4 }, reverb: { size: 0.5, mix: 0.12 } },
    play(g) {
      PROG['Fmaj7–Em7–Dm7–Am7'].forEach((c, bar) => {
        const ch = OPEN[c], o = bar * 4;
        g.strum(o, ch, 2.2, { vel: 0.6, spread: 0.03, bright: 0.3 });
        g.strum(o + 2.5, ch.slice(-3), 1.3, { vel: 0.45, spread: 0.025, bright: 0.3, up: true });
      });
    },
  },
  {
    id: 'gtr-lofi-melody', name: 'Lo-Fi-Gitarre Melodie Am9–Dm9', genres: ['lofi', 'ambient'], bars: 2,
    amp: 'jazz', fx: { lofi: { cutoff: 3200, hiss: 0.003, rate: 4 }, reverb: { size: 0.6, mix: 0.18 } },
    play(g) {
      g.strum(0, OPEN.Am9, 1.8, { vel: 0.45, spread: 0.035, bright: 0.3 });
      g.strum(4, OPEN.Dm9, 1.8, { vel: 0.45, spread: 0.035, bright: 0.3 });
      [[1, 71, 0.5], [1.5, 72, 0.5], [2, 76, 1, { vib: [0.15, 5, 0.4] }], [3.5, 74, 0.5],
        [5, 72, 0.5], [5.5, 69, 0.5], [6, 67, 0.9, { glide: [[0.1, 69, 0.15]] }], [7.25, 64, 0.6]]
        .forEach(([b, m, l, o = {}]) => g.note(b, m, l, { vel: 0.6, bright: 0.35, ...o }));
    },
  },
  {
    id: 'gtr-hiphop-soul', name: 'Soul-Gitarre Am7–Dm7', genres: ['hiphop', 'lofi', 'funk'], bars: 2,
    amp: 'jazz', fx: { lofi: { cutoff: 4200, hiss: 0.002, rate: 2 }, reverb: { size: 0.5, mix: 0.12 } },
    play(g) {
      const sw = 0.06;
      // Doppelgriffe mit Hammer-on, dazwischen kurze Füller
      g.note(0, 64, 0.7, { vel: 0.75 }); g.note(0, 67, 0.7, { vel: 0.7, dt: 0.01 });
      g.note(0.75 + sw, 67, 0.4, { glide: [[0.06, 69, 0.03]] }); // Hammer-on
      g.note(1.5, 67, 0.4); g.note(1.75 + sw, 64, 0.5);
      g.strum(2.5, HIGH.Am7, 0.9, { vel: 0.6, spread: 0.02, bright: 0.4 });
      g.note(4, 65, 0.7, { vel: 0.75 }); g.note(4, 69, 0.7, { vel: 0.7, dt: 0.01 });
      g.note(4.75 + sw, 72, 0.4, { glide: [[0.02, 74, 0.08]] });
      g.note(5.5, 72, 0.4); g.note(5.75 + sw, 69, 0.5);
      g.strum(6.5, HIGH.Dm7, 0.9, { vel: 0.6, spread: 0.02, bright: 0.4 });
    },
  },
  {
    id: 'gtr-trap-arp', name: 'Trap-Gitarre Am–G–F–E', genres: ['trap', 'hiphop'], bars: 4,
    amp: 'clean', fx: { chorus: { mix: 0.35, rate: 4 }, reverb: { size: 0.85, mix: 0.25 } },
    play(g) {
      PROG['Am–G–F–E'].forEach((c, bar) => {
        const ch = HIGH[c], o = bar * 4;
        const lo = OPEN[c][0];
        g.note(o, lo, 3.5, { vel: 0.7, bright: 0.4 });
        [0, 1, 2, 1, 2, 0, 1, 2].forEach((si, i) => g.note(o + i / 2 + (i > 4 ? 0.25 : 0), ch[si], 1, { vel: 0.65, bright: 0.5 }));
      });
    },
  },

  // ================= Afro & Ambient =================
  {
    id: 'gtr-afro-highlife', name: 'Highlife-Gitarre Am–F–C–G', genres: ['afro', 'pop'], bars: 4,
    amp: 'clean', fx: { chorus: { mix: 0.15, rate: 2 }, reverb: { size: 0.4, mix: 0.08 } },
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const ch = HIGH[c], o = bar * 4;
        steps('x.xo.xo.x.ox.xo.', (s, v, i) => g.note(o + s, ch[(i * 2 + bar) % ch.length] + (i % 5 === 3 ? 12 : 0), 0.22, { vel: 0.5 + 0.4 * v, mute: 0.2, bright: 0.8 }));
      });
    },
  },
  {
    id: 'gtr-ambient-swell', name: 'Gitarren-Flächen Am–F–C–G', genres: ['ambient'], bars: 4,
    amp: 'clean', fx: { echo: { time: 1.5, feedback: 0.5, mix: 0.35, tone: 2500 }, reverb: { size: 0.95, mix: 0.45, damp: 0.5 } },
    play(g) {
      PROG['Am–F–C–G'].forEach((c, bar) => {
        const ch = OPEN[c], o = bar * 4;
        g.strum(o, ch.slice(-4), 3.8, { vel: 0.8, swell: 0.8, spread: 0.02, decay: 8, bright: 0.4 });
        g.note(o + 2, ch[ch.length - 1] + 12, 1.8, { vel: 0.6, swell: 0.6, decay: 8, bright: 0.4 });
      });
    },
  },

  // ================= One-Shots =================
  {
    id: 'gtr-shot-power', name: 'E-Gitarre Powerchord A', genres: ['rock'], bars: 2, oneShot: true,
    amp: 'lead', double: true, fx: { reverb: { size: 0.6, mix: 0.12 } },
    play(g) { g.strum(0, P5.A, null, { vel: 1, decay: 6, vib: [0.06, 5, 1] }); },
  },
  {
    id: 'gtr-shot-mute', name: 'E-Gitarre Palm-Mute A', genres: ['rock'], bars: 1, oneShot: true,
    amp: 'metal', double: true,
    play(g) { g.strum(0, [45, 52], 0.3, { mute: 0.85, vel: 1, spread: 0.004 }); },
  },
  {
    id: 'gtr-shot-chord', name: 'E-Gitarre Akkord Am clean', genres: ['pop', 'rock'], bars: 2, oneShot: true,
    amp: 'clean', fx: { chorus: { mix: 0.25, rate: 4 }, reverb: { size: 0.6, mix: 0.15 } },
    play(g) { g.strum(0, OPEN.Am, null, { vel: 0.9, spread: 0.014, decay: 5 }); },
  },
  {
    id: 'gtr-shot-chord-drive', name: 'E-Gitarre Akkord Am verzerrt', genres: ['rock'], bars: 2, oneShot: true,
    amp: 'crunch', double: true, fx: { reverb: { size: 0.6, mix: 0.12 } },
    play(g) { g.strum(0, OPEN.Am, null, { vel: 1, spread: 0.012, decay: 5 }); },
  },
  {
    id: 'gtr-shot-slide', name: 'E-Gitarre Slide abwärts', genres: ['rock'], bars: 1, oneShot: true,
    amp: 'lead', double: true,
    // Powerchord klingt, dann rutscht die Hand eine Oktave abwärts und lässt los
    play(g) { g.strum(0, P5.A.slice(0, 2), 2.2, { vel: 1, decay: 6, glideBy: [[1.4, -12, 0.8]] }); },
  },
  {
    id: 'gtr-shot-slide-up', name: 'E-Gitarre Slide aufwärts', genres: ['rock', 'blues'], bars: 1, oneShot: true,
    amp: 'crunch',
    play(g) { g.note(0, 62, 1.8, { vel: 0.95, glide: [[0.05, 69, 0.5]], vib: [0.25, 5.5, 0.8] }); },
  },
  {
    id: 'gtr-shot-feedback', name: 'E-Gitarre Feedback', genres: ['rock'], bars: 2, oneShot: true,
    amp: 'lead', fx: { reverb: { size: 0.7, mix: 0.15 } },
    play(g) {
      g.strum(0, P5.A, 7.4, { vel: 1, decay: 12 });
      g.note(0, 57, 7.4, { vel: 0.4, decay: 14, fb: [0.6, 19, 1.4, 0.5], vib: [0.08, 5.5, 2.5] });
    },
  },
  {
    id: 'gtr-shot-bend', name: 'E-Gitarre Bend D–E', genres: ['rock', 'blues'], bars: 1, oneShot: true,
    amp: 'lead', fx: { echo: { time: 0.75, feedback: 0.25, mix: 0.18 } },
    play(g) { g.note(0, 74, 3.2, { vel: 1, glide: [[0.15, 76, 0.3]], vib: [0.3, 5.5, 1] }); },
  },
  {
    id: 'gtr-shot-scrape', name: 'Pick-Scrape (E-Gitarre)', genres: ['rock'], category: 'fx', bars: 1, oneShot: true,
    amp: 'metal', double: true,
    play(g) { g.scrape(0, 2.5, 3200, 220, 1); },
  },
];

export const GUITAR_LOOP_DEFS = DEFS.map(gdef);
