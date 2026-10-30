// Ideen von Claude (im Artifact über die Capability `sample`, die Person stimmt zu) mit Ausweichlösung ohne KI:
// Melodien weiterführen und einen Klang aus einer Beschreibung bauen.

import { EFFECTS } from './effects.js';
import { SCALES } from './dsp/pitch.js';
import { mulberry32 } from './util.js';

const PITCH_MIN = 36;
const PITCH_MAX = 84;

let samplePromise = null;
let claudeOff = false;
// Claude im Artifact; null, wenn nicht verfügbar (GitHub Pages, lokal, abgelehnt)
export function getClaude() {
  if (!samplePromise) {
    samplePromise = window.claude?.use
      ? Promise.race([window.claude.use('sample'), new Promise((r) => setTimeout(() => r(null), 12000))]).catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}
// Neu nachsehen, ob Claude da ist (Tests, nach einer Freigabe)
export function resetClaude() { samplePromise = null; claudeOff = false; }
// Fehlercodes, nach denen Claude in dieser Ansicht nicht mehr gefragt wird
const PERMANENT = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

export async function askJson(prompt) {
  if (claudeOff) return null;
  const sample = await getClaude();
  if (!sample) return null;
  try {
    return await sample.json(prompt, { cache: false });
  } catch (e) {
    if (PERMANENT.includes(e?.code)) claudeOff = true;
    if (e?.code === 'cancelled') throw e;
    return null;
  }
}

// ---------- Tonart (Krumhansl-Schmuckler) ----------

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];

export function detectKey(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[((n.pitch % 12) + 12) % 12] += n.len;
  let best = { root: 9, scale: 'minor', score: -Infinity };
  const corr = (prof, root) => {
    const mx = hist.reduce((a, b) => a + b, 0) / 12;
    const mp = prof.reduce((a, b) => a + b, 0) / 12;
    let num = 0, dx = 0, dp = 0;
    for (let i = 0; i < 12; i++) {
      const x = hist[(i + root) % 12] - mx;
      const p = prof[i] - mp;
      num += x * p; dx += x * x; dp += p * p;
    }
    return num / Math.sqrt(dx * dp || 1);
  };
  for (let r = 0; r < 12; r++) {
    for (const [scale, prof] of [['major', MAJOR], ['minor', MINOR]]) {
      const score = corr(prof, r);
      if (score > best.score) best = { root: r, scale, score };
    }
  }
  return { root: best.root, scale: best.scale, label: `${NAMES[best.root]}-${SCALES[best.scale].label}` };
}

// ---------- Melodie weiterführen ----------

// Tonhöhe ↔ Stufe der Tonleiter (fortlaufend über Oktaven)
function degreeOf(pitch, key) {
  const steps = SCALES[key.scale].steps;
  const rel = pitch - key.root;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let i = steps.findIndex((s) => s >= pc);
  if (i < 0) i = steps.length - 1;
  return oct * steps.length + i;
}
function pitchOf(degree, key) {
  const steps = SCALES[key.scale].steps;
  const oct = Math.floor(degree / steps.length);
  const i = ((degree % steps.length) + steps.length) % steps.length;
  return key.root + oct * 12 + steps[i];
}
const nearestTonic = (pitch, key) => {
  let best = pitch;
  let d = Infinity;
  for (let m = pitch - 12; m <= pitch + 12; m++) if ((((m - key.root) % 12) + 12) % 12 === 0 && Math.abs(m - pitch) < d) { d = Math.abs(m - pitch); best = m; }
  return best;
};

// Ohne KI: das Motiv variieren (versetzen, umkehren, Rhythmus behalten) und auf dem Grundton enden
export function continueByRules(notes, { from, beats, seed = 1 }) {
  const motif = [...notes].sort((a, b) => a.start - b.start);
  if (!motif.length) return [];
  const key = detectKey(motif);
  const rnd = mulberry32(seed);
  const span = Math.max(1, from - motif[0].start);
  const first = degreeOf(motif[0].pitch, key);
  const variants = [
    (d) => d + 1, // Sequenz aufwärts
    (d) => d - 1, // Sequenz abwärts
    (d) => 2 * first - d, // Umkehrung um den ersten Ton
    (d) => d + 2,
  ];
  const out = [];
  for (let off = 0; off < beats; off += span) {
    const variant = off === 0 && beats > span ? (d) => d : variants[Math.floor(rnd() * variants.length)];
    for (const n of motif) {
      const start = from + off + (n.start - motif[0].start);
      if (start >= from + beats) break;
      const pitch = pitchOf(variant(degreeOf(n.pitch, key)), key);
      out.push({ pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch)), start, len: Math.min(n.len, from + beats - start), vel: n.vel ?? 1 });
    }
  }
  // Schluss: letzter Ton auf den Grundton, bis zum Phrasenende gehalten
  const last = out[out.length - 1];
  if (last) { last.pitch = nearestTonic(last.pitch, key); last.len = Math.max(last.len, from + beats - last.start); }
  return out;
}

function cleanNotes(raw, { from, beats }) {
  if (!Array.isArray(raw)) return null;
  const q = (v) => Math.round(v * 4) / 4;
  const out = [];
  for (const n of raw) {
    const pitch = Math.round(Number(n?.pitch));
    const start = q(Number(n?.start));
    const len = Math.max(0.25, q(Number(n?.len)));
    if (!Number.isFinite(pitch) || !Number.isFinite(start) || !Number.isFinite(len)) continue;
    if (start < from || start >= from + beats) continue;
    out.push({ pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch)), start, len: Math.min(len, from + beats - start), vel: 1 });
  }
  out.sort((a, b) => a.start - b.start);
  return out.length ? out : null;
}

// notes: vorhandene Melodie; Ergebnis: neue Noten ab `from` über `beats` Schläge
export async function continueMelody(notes, { from, beats, seed = 1, style = '' }) {
  const key = detectKey(notes);
  const list = notes.map((n) => ({ pitch: n.pitch, start: n.start, len: n.len }));
  const prompt = [
    'Du bist Komponist und schreibst eine einstimmige Melodie weiter.',
    `Anfang (pitch = MIDI-Nummer, start und len in Schlägen, 4 Schläge pro Takt, vermutlich ${key.label}):`,
    JSON.stringify(list),
    `Setze sie um genau ${beats} Schläge fort: alle neuen Noten beginnen zwischen Schlag ${from} und ${from + beats}.`,
    'Gleicher Stil und Tonumfang, singbar, Motive aus dem Anfang aufgreifen und variieren, mit einem ruhigen Schlusston enden.',
    style ? `Wunsch: ${style}` : '',
    `Tonhöhen zwischen ${PITCH_MIN} und ${PITCH_MAX}, start und len als Vielfache von 0.25, keine Überlappungen.`,
    'Antworte nur mit einem JSON-Array wie [{"pitch":64,"start":8,"len":1}].',
  ].filter(Boolean).join('\n');
  const fromClaude = cleanNotes(await askJson(prompt), { from, beats });
  if (fromClaude) return { notes: fromClaude, source: 'claude', key };
  return { notes: continueByRules(notes, { from, beats, seed }), source: 'regeln', key };
}

// ---------- Klang aus einer Beschreibung ----------

// Wörter → Klang und Effekte (Deutsch und Englisch); erster Treffer je Gruppe gewinnt
const PRESET_WORDS = [
  [/klavier|piano|rhodes|e-?piano|wurli/i, 'piano'],
  [/orgel|organ/i, 'organ'],
  [/fl[öo]te|flute|pfeif|whistle|blockfl/i, 'flute'],
  [/glock|bell|chime|celesta|spieluhr/i, 'bell'],
  [/streich|string|geige|violin|cello|orchester/i, 'strings'],
  [/bl[äa]ser|blech|brass|trompete|trumpet|horn|posaune/i, 'brass'],
  [/acid|303|squelch/i, 'acid'],
  [/bass/i, 'bass'],
  [/fl[äa]che|pad|teppich|atmo/i, 'pad'],
  [/pluck|zupf|harfe|harp|gitarre|guitar/i, 'pluck'],
  [/lead|synth|säge|saw/i, 'lead'],
];
// Echtes Instrument, wenn die Beschreibung es beim Namen nennt („Harfe“, „Flügel“ ⊂ „Konzertflügel“)
function realInstrument(t, presets) {
  const words = t.split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
  return presets.find((p) => {
    if (!p.sampled) return false;
    const name = `${p.label} ${p.id}`.toLowerCase();
    return words.some((w) => name.includes(w)) || name.split(/[^\p{L}]+/u).some((w) => w.length >= 4 && t.includes(w));
  })?.id ?? null;
}

export function soundFromWords(text, presets = []) {
  const t = text.toLowerCase();
  const preset = realInstrument(t, presets) ?? PRESET_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
  const fx = {};
  const has = (re) => re.test(t);
  if (has(/verzerr|dreckig|kaputt|crunch|distort|dirty|fuzz|übersteuer|rau/)) fx.drive = { on: true, type: has(/fuzz/) ? 'fuzz' : has(/hart|hard|brutal/) ? 'hard' : 'soft', drive: has(/stark|sehr|brutal|heavy/) ? 0.8 : 0.5 };
  if (has(/8-?bit|lo-?fi|retro|gameboy|chiptune|bitcrush/)) fx.drive = { on: true, type: 'crush', drive: 0.7, tone: 0.6 };
  if (has(/warm|weich|soft|dumpf|dunkel|dark|gedämpft|mellow/)) fx.filter = { on: true, type: 'lowpass', cutoff: has(/dunkel|dark|dumpf/) ? 0.45 : 0.58, reso: 0.1, lfo: 'off' };
  if (has(/telefon|radio|dünn|thin/)) fx.filter = { on: true, type: 'bandpass', cutoff: 0.6, reso: 0.3, lfo: 'off' };
  if (has(/wabber|wobble|bewegt|sweep|wah/)) fx.filter = { on: true, type: 'lowpass', cutoff: 0.5, reso: 0.5, lfo: has(/schnell|fast/) ? '1/8' : '1/2', depth: 0.6 };
  if (has(/hell|bright|klar|crisp|brillant|funkel/)) fx.eq = { on: true, high: 5, low: 0, mid: 0 };
  if (has(/fett|fat|druck|punch|wuchtig|kräftig/)) fx.comp = { on: true, amount: 0.6 };
  if (has(/pump|sidechain|ducking/)) fx.pump = { on: true, depth: 0.6 };
  if (has(/echo|delay|wiederhol/)) fx.echo = { on: true, mix: 0.3, feedback: 0.4 };
  if (has(/hall|weit|raum|kirche|kathedrale|reverb|space|sphär|verträumt|dreamy|ambient/)) fx.hall = { on: true, size: has(/kirche|kathedrale|riesig|huge|weit/) ? 0.85 : 0.55, mix: has(/viel|lots|sehr/) ? 0.45 : 0.3 };
  return { preset, fx };
}

function cleanFx(raw) {
  const fx = {};
  if (!raw || typeof raw !== 'object') return fx;
  for (const e of EFFECTS) {
    const r = raw[e.id];
    if (!r || typeof r !== 'object') continue;
    const patch = { on: r.on !== false };
    for (const [k, p] of Object.entries(e.params)) {
      if (!(k in r)) continue;
      if (p.options) { if (p.options.some((o) => o.id === r[k])) patch[k] = r[k]; } else {
        const v = Number(r[k]);
        if (Number.isFinite(v)) patch[k] = Math.min(p.max, Math.max(p.min, v));
      }
    }
    fx[e.id] = patch;
  }
  return fx;
}

// presets: [{id, label}] – die wählbaren Klänge
export async function designSound(description, presets) {
  const fxDoc = EFFECTS.map((e) => `${e.id} (${e.label}): ${Object.entries(e.params).map(([k, p]) => (p.options ? `${k} ∈ {${p.options.map((o) => o.id).join(', ')}}` : `${k} ${p.min}…${p.max}`)).join(', ')}`).join('\n');
  const prompt = [
    'Du bist Sounddesigner in einem einfachen Musikprogramm. Baue aus einer Beschreibung einen Klang.',
    `Beschreibung: „${description.slice(0, 400)}“`,
    `Wähle genau einen Grundklang (preset): ${presets.map((p) => `${p.id} = ${p.label}${p.sampled ? ' (echte Aufnahme)' : ''}`).join(', ')}.`,
    'Schalte passende Effekte ein (nur die nötigen) und setze ihre Regler. Verfügbare Effekte und Bereiche:',
    fxDoc,
    'Gib dem Klang einen kurzen deutschen Namen (höchstens 24 Zeichen).',
    'Antworte nur mit JSON wie {"preset":"flute","name":"Weiche Flöte","fx":{"hall":{"on":true,"size":0.7,"mix":0.35}}}.',
  ].join('\n');
  const raw = await askJson(prompt);
  if (raw && presets.some((p) => p.id === raw.preset)) {
    return { preset: raw.preset, name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : null, fx: cleanFx(raw.fx), source: 'claude' };
  }
  const words = soundFromWords(description, presets);
  return { preset: words.preset, name: null, fx: cleanFx(words.fx), source: 'regeln' };
}
