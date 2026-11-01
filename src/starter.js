// Song-Starter: Genre wählen → komplettes Grundgerüst (Tempo, Tonart, Akkord-Streifen, Spuren Drums bis FX, Aufbau
// Intro → Strophe → Refrain → Break → Refrain → Outro mit Riser und Crash). Ergebnis ist ein Plan aus einfachen Bausteinen
// (reset, name, tempo, key, length, chords, add, accomp, pattern), den applyPlan als einen Rückgängig-Schritt ausführt.
// Tonale Loops werden so gewählt, dass sie dieselbe Akkordfolge spielen; was fehlt, übernehmen Begleit-Patterns,
// die dem Akkord-Streifen folgen.

import { mulberry32 } from './util.js';
import { loopHarmony, PROGRESSIONS, accompPattern, ACCOMP_STYLES, degreeOfSymbol, isChord } from './harmony.js';
import { KEYS, keyOf, keyAtBar, tonicOf } from './model.js';
import { patternSampleId } from './patterns.js';

export const STARTER_GENRES = [
  { id: 'house', label: 'House', bpm: 124, range: [120, 126], keys: ['Am', 'Cm', 'Fm', 'Gm', 'Dm'], pool: ['house', 'pop'], form: 'club', bassStyle: 'bass' },
  { id: 'techno', label: 'Techno', bpm: 130, range: [126, 134], keys: ['Am', 'Fm', 'Gm', 'Em'], pool: ['techno'], form: 'club', bassStyle: 'bass' },
  { id: 'hiphop', label: 'Hip-Hop', bpm: 90, range: [84, 96], keys: ['Am', 'Cm', 'Dm', 'Gm', 'Fm'], pool: ['hiphop', 'lofi'], form: 'song', bassStyle: 'sub' },
  { id: 'lofi', label: 'Lo-Fi', bpm: 80, range: [72, 86], keys: ['Am', 'Dm', 'Em', 'Fm'], pool: ['lofi', 'hiphop'], form: 'chill', bassStyle: 'sub' },
  { id: 'pop', label: 'Pop', bpm: 110, range: [100, 120], keys: ['Am', 'Cm', 'Dm', 'Em', 'F♯m'], pool: ['pop'], form: 'song', bassStyle: 'bass' },
  { id: 'trap', label: 'Trap', bpm: 140, range: [134, 150], keys: ['Am', 'Cm', 'Fm', 'Gm', 'C♯m'], pool: ['trap', 'hiphop'], form: 'song', bassStyle: 'sub' },
  { id: 'ambient', label: 'Ambient', bpm: 85, range: [70, 92], keys: ['Am', 'Dm', 'Em', 'Cm'], pool: ['ambient'], form: 'ambient', bassStyle: 'sub' },
  { id: 'rock', label: 'Rock', bpm: 120, range: [108, 140], keys: ['Am', 'Em', 'Dm', 'Hm'], pool: ['rock', 'pop'], form: 'song', bassStyle: 'bass', drums: 'rock' },
  { id: 'breaks', label: 'DnB', bpm: 172, range: [166, 176], keys: ['Am', 'Fm', 'Gm'], pool: ['breaks'], form: 'club', bassStyle: 'sub' },
];
export const starterGenre = (id) => STARTER_GENRES.find((g) => g.id === id) ?? null;

// Welche Rolle in welchem Teil spielt (I Intro, V Strophe, C Refrain, B Break, D zweiter Refrain, O Outro)
const FORMS = {
  song: { drums: 'VCDO', perc: 'CD', bass: 'VCD', chords: 'IVCBDO', lead: 'CBD' },
  club: { drums: 'IVCDO', perc: 'VCD', bass: 'VCD', chords: 'ICBDO', lead: 'CBD' },
  chill: { drums: 'VCD', perc: 'CDO', bass: 'VCBD', chords: 'IVCBDO', lead: 'CDO' },
  ambient: { drums: 'CD', perc: 'D', bass: 'VCBD', chords: 'IVCBDO', lead: 'VCBDO' },
};
const ROLES = [
  { id: 'drums', name: 'Drums', volume: 0.85 },
  { id: 'perc', name: 'Percussion', volume: 0.55 },
  { id: 'bass', name: 'Bass', volume: 0.75 },
  { id: 'chords', name: 'Akkorde', volume: 0.6 },
  { id: 'lead', name: 'Melodie', volume: 0.5 },
  { id: 'fx', name: 'FX', volume: 0.55 },
];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// Stufe je halbem Takt über die Loop-Länge (A-Moll-Loops; Akkorde gleichmäßig verteilt); null = unbekannt
function harmonyGrid(s) {
  const degs = loopHarmony(s.name);
  if (!degs) return null;
  const halves = Math.max(1, Math.round((s.beats ?? s.lengthBeats ?? 4) / 2));
  if (halves % degs.length) return null;
  return Array.from({ length: halves }, (_, i) => degs[Math.floor((i * degs.length) / halves)]);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function sameHarmony(a, b) {
  const L = (a.length * b.length) / gcd(a.length, b.length);
  for (let i = 0; i < L; i++) if (a[i % a.length] !== b[i % b.length]) return false;
  return true;
}
// Kürzeste Wiederholung: [i,VI,i,VI] → [i,VI]
function period(g) {
  for (let p = 1; p <= g.length; p++) if (g.length % p === 0 && g.every((d, i) => d === g[i % p])) return g.slice(0, p);
  return g;
}

const isTonal = (s) => !!(s.def && s.key);
const userSound = (s) => s.category === 'own' || String(s.id).startsWith('pat-') || String(s.id).startsWith('own-') || String(s.id).startsWith('test-');
const PERC = /hat|perc|shaker|ride|klick|rim|toms|clap|klatsch|besen/i;

// Kandidaten einer Kategorie im Genre-Pool: erst das Hauptgenre, dann die weiteren
function candidates(library, cat, pool, filter = () => true) {
  const all = library.list().filter((s) => !userSound(s) && (s.colorCat ?? s.category) === cat && filter(s));
  for (const g of pool) {
    const list = all.filter((s) => s.genres?.includes(g));
    if (list.length) return list;
  }
  return [];
}

// Plan für ein Genre. variant 0 = Grundfassung (Tempo des Genres, A-Moll), jede weitere würfelt Loops, Tonart, Tempo
// und Längen neu. mode: 'replace' (neues Lied) oder 'append' (ab dem Takt hinter dem letzten Clip).
export function planStarter(genreId, library, { variant = 0, project = null, mode = 'replace' } = {}) {
  const genre = starterGenre(genreId) ?? starterGenre('pop');
  const rand = mulberry32(hash(genre.id) + variant * 7919);
  const pick = (list) => (list.length ? list[Math.floor(rand() * list.length) % list.length] : null);
  const bpb = project?.beatsPerBar ?? 4;
  const appendAt = mode === 'append' && project
    ? Math.ceil(Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats))) / bpb - 1e-9) + 1 : 1;

  // Aufbau: Längen der Teile in Takten
  const v = variant > 0;
  const parts = [
    ['I', 'Intro', v ? pick([4, 8, 8]) : 8],
    ['V', 'Strophe', v ? pick([8, 16, 16]) : 16],
    ['C', 'Refrain', 8],
    ['B', 'Break', v ? pick([4, 8]) : 8],
    ['D', 'Refrain', 8],
    ['O', 'Outro', v ? pick([4, 8]) : 8],
  ];
  const at = {};
  let bar = appendAt;
  for (const [id, , len] of parts) { at[id] = { from: bar, to: bar + len - 1 }; bar += len; }
  const lastBar = bar - 1;

  const actions = [];
  const bpm = v ? Math.round(genre.range[0] + rand() * (genre.range[1] - genre.range[0])) : genre.bpm;
  const key = mode === 'append' ? null : v ? pick(genre.keys) : 'Am';
  if (mode === 'replace') {
    actions.push({ do: 'reset' });
    actions.push({ do: 'name', name: `${genre.label}-Song` });
  }
  actions.push({ do: 'tempo', bpm });
  if (key && KEYS.includes(key)) actions.push({ do: 'key', bar: 1, key });
  actions.push({ do: 'length', bars: Math.max(lastBar, project?.lengthBars && mode === 'append' ? project.lengthBars : 0) });

  // ---------- Harmonie: eine Akkord-Loop bestimmt die Folge, Bass und Melodie spielen dieselbe ----------
  const tonal = (cat) => candidates(library, cat, genre.pool, (s) => isTonal(s) && s.kind === 'loop');
  const chordLoops = tonal('chords').filter((s) => harmonyGrid(s));
  const chordLoop = pick(chordLoops);
  let grid = chordLoop ? harmonyGrid(chordLoop) : null;
  if (!grid) grid = PROGRESSIONS[Math.floor(rand() * 4)].chords.flatMap((d) => [d, d]);
  const prog = period(grid);
  const allI = prog.every((d) => d === 'i');
  const mildLead = prog.every((d) => ['i', 'III', 'iv', 'VI', 'VII'].includes(d));
  // Bass legt die Harmonie fest: gleiche Folge, ohne Akkordangabe nur, wenn alles auf i steht
  const fits = (s) => { const g = harmonyGrid(s); return g ? sameHarmony(g, prog) : allI; };
  // Melodie auf einem Akkord („Arp Am“) passt auch über Folgen ohne v und V
  const fitsLead = (s) => { const g = harmonyGrid(s); return g ? sameHarmony(g, prog) || (mildLead && period(g).every((d) => d === 'i')) : allI; };

  // Akkord-Streifen zeigt die Folge (je halber Takt verdichtet auf ganze Takte, wo möglich)
  const perBar = prog.length % 2 === 0 && prog.every((d, i) => i % 2 === 0 || d === prog[i - 1]);
  const chordSeq = perBar ? prog.filter((_, i) => i % 2 === 0) : prog;
  actions.push({ do: 'chords', fromBar: appendAt, toBar: lastBar, chords: chordSeq, per: perBar ? bpb : bpb / 2 });

  const form = FORMS[genre.form];
  // Abschnitte einer Rolle zu zusammenhängenden Bereichen [von, bis] (Takte)
  const runs = (letters) => {
    const out = [];
    for (const [id] of parts) {
      if (!letters.includes(id)) continue;
      const r = at[id];
      const last = out[out.length - 1];
      if (last && last.to + 1 === r.from) last.to = r.to; else out.push({ ...r });
    }
    return out;
  };
  const roleTrack = {};
  const place = (role, base, list, { fadeIn = 0, fadeOut = 0 } = {}) => {
    list.forEach((r, i) => {
      const first = !roleTrack[role.id];
      roleTrack[role.id] = true;
      actions.push({
        ...base, fromBar: r.from, toBar: r.to,
        track: first ? 'neu' : role.id, as: role.id, name: role.name, volume: role.volume,
        ...(i === 0 && fadeIn ? { fadeInBars: fadeIn } : {}),
        ...(i === list.length - 1 && fadeOut && r.to === lastBar ? { fadeOutBars: fadeOut } : {}),
      });
    });
  };
  const used = [];
  const R = Object.fromEntries(ROLES.map((r) => [r.id, r]));

  // Drums
  if (genre.drums === 'rock') {
    place(R.drums, { do: 'pattern', id: 'drums', pattern: rockBeat(variant) }, runs(form.drums), { fadeOut: 4 });
  } else {
    const drums = candidates(library, 'drums', genre.pool, (s) => s.kind === 'loop' && !!s.def);
    const main = pick(drums.filter((s) => !PERC.test(s.name))) ?? pick(drums);
    if (main) { used.push(main.id); place(R.drums, { do: 'add', sound: main.id }, runs(form.drums), { fadeOut: 4 }); }
    const perc = pick(drums.filter((s) => s !== main && PERC.test(s.name))) ?? pick(drums.filter((s) => s !== main));
    if (perc) { used.push(perc.id); place(R.perc, { do: 'add', sound: perc.id }, runs(form.perc)); }
  }
  // Bass: passende Loop, sonst Begleit-Bass
  const bass = pick(tonal('bass').filter(fits));
  if (bass) { used.push(bass.id); place(R.bass, { do: 'add', sound: bass.id }, runs(form.bass)); } else place(R.bass, { do: 'accomp', id: 'bass', style: genre.bassStyle }, runs(form.bass));
  // Akkorde
  const chordFade = genre.form === 'chill' || genre.form === 'ambient' ? 4 : 0;
  if (chordLoop) { used.push(chordLoop.id); place(R.chords, { do: 'add', sound: chordLoop.id }, runs(form.chords), { fadeIn: chordFade, fadeOut: 4 }); } else place(R.chords, { do: 'accomp', id: 'chords', style: genre.drums === 'rock' ? 'guitar' : 'pad' }, runs(form.chords), { fadeIn: chordFade, fadeOut: 4 });
  // Melodie
  const lead = pick(tonal('synth').filter(fitsLead)) ?? (genre.drums === 'rock' ? pick(tonal('chords').filter((s) => /solo|lick|melodie/i.test(s.name) && fitsLead(s))) : null);
  if (lead) { used.push(lead.id); place(R.lead, { do: 'add', sound: lead.id }, runs(form.lead), { fadeOut: 4 }); } else place(R.lead, { do: 'accomp', id: 'lead', style: 'arp' }, runs(form.lead), { fadeOut: 4 });

  // FX: Riser vor den Refrains, Crash auf den Refrain, Downlifter in den Break (Club)
  const fx = (re) => candidates(library, 'fx', [...genre.pool, 'pop', 'techno'], (s) => (s.kind === 'oneshot' || s.oneShot) && re.test(s.name));
  const riser = pick(fx(/riser|wirbel|übergang|sweep/i)) ?? library.get('fx-riser');
  const crash = pick(fx(/crash|becken|impact/i)) ?? library.get('fx-crash');
  const barsOf = (s) => Math.max(1, Math.round((s.beats ?? s.lengthBeats ?? 4) / bpb));
  let down = genre.form === 'club' ? pick(fx(/downlifter/i)) : null;
  // Downlifter und Riser teilen sich den Break: nur, wenn beide hineinpassen
  if (down && riser && barsOf(down) + barsOf(riser) > at.B.to - at.B.from + 1) down = null;
  const fxAt = [];
  for (const p of ['V', 'C', 'D']) {
    if (riser && p !== 'V') fxAt.push({ sound: riser.id, bar: Math.max(at.I.from, at[p].from - barsOf(riser)) });
    if (crash) fxAt.push({ sound: crash.id, bar: at[p].from });
  }
  if (down) fxAt.push({ sound: down.id, bar: at.B.from });
  if (crash) fxAt.push({ sound: crash.id, bar: at.O.from });
  fxAt.sort((a, b) => a.bar - b.bar).forEach((f, i) => actions.push({
    do: 'add', sound: f.sound, fromBar: f.bar, toBar: f.bar, track: i === 0 ? 'neu' : 'fx', as: 'fx', name: R.fx.name, volume: R.fx.volume,
  }));

  const summary = `${genre.label} · ${bpm} BPM${key ? ` · ${key}` : ''} · Takt ${appendAt}–${lastBar}: ${parts.map((p) => p[1]).join(' → ')}`;
  return { summary, actions, genre: genre.id, variant, sections: parts.map(([id, label]) => ({ id, label, ...at[id] })), progression: chordSeq, used };
}

// Rock-Beat für das akustische Kit (Sonic Pi): Bassdrum 1 und 3 (+ „und“ von 3), Snare 2 und 4, Achtel-Becken
function rockBeat(variant) {
  const row = (on) => Array.from({ length: 16 }, (_, i) => (on.includes(i) ? 1 : 0));
  const kick = variant % 2 ? [0, 7, 8, 10] : [0, 8, 10];
  return {
    type: 'drums', name: 'Rock-Beat', bars: 1, kit: 'akustik',
    rows: {
      kick: row(kick), snare: row([4, 12]), clap: row([]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]).map((x, i) => (x ? (i % 4 ? 0.7 : 1) : 0)),
      open: row([]), tomLo: row([]), tomHi: row([]), crash: row([]),
    },
  };
}
export const ROCK_KIT_IDS = ['sp-bd-haus', 'sp-drum-snare-hard', 'sp-drum-cymbal-closed'];

// Ganzer Ablauf: planen, benötigte Klänge laden, als ein Schritt ausführen
export async function runStarter(genreId, { store, library, variant = 0, mode = 'replace' }) {
  const plan = planStarter(genreId, library, { variant, project: store.project, mode });
  const ids = plan.actions.filter((a) => a.sound).map((a) => a.sound);
  if (plan.actions.some((a) => a.pattern?.kit === 'akustik')) ids.push(...ROCK_KIT_IDS);
  await library.ensureMany(ids);
  const res = applyPlan(store, library, plan);
  return { ...plan, ...res };
}

// „Begleitung“ (Erstellen-Karte): Fläche, Bass und Arp auf neuen Spuren, die dem Akkord-Streifen folgen – ab `fromBar`
// bis zum Songende. Ist der Streifen leer, kommt die beliebteste Folge (i–VI–III–VII) dazu. Ein Rückgängig-Schritt.
export function accompanimentPlan(project, { fromBar = 1, chordsEmpty = true } = {}) {
  const actions = [];
  const to = project.lengthBars;
  if (chordsEmpty) actions.push({ do: 'chords', fromBar: 1, toBar: to, chords: PROGRESSIONS[0].chords });
  const parts = [['pad', 'Akkord-Fläche', 0.55], ['bass', 'Akkord-Bass', 0.7], ['arp', 'Akkord-Arp', 0.45]];
  for (const [style, name, volume] of parts) actions.push({ do: 'accomp', id: style, style, track: 'neu', as: 'acc-' + style, name, volume, fromBar, toBar: to });
  return { summary: 'Begleitung folgt den Akkorden', actions };
}

// ---------- Plan ausführen ----------

const DEFAULT_NAME = /^Spur \d+$/;
const catOf = (t, library) => { const c = t.clips[0]; const s = c && library.get(c.sampleId); return s ? s.colorCat ?? s.category : null; };

// Führt einen Plan als einen Rückgängig-Schritt aus; ungültige Bausteine werden übersprungen. → { done, skipped }
export function applyPlan(store, library, plan) {
  const done = [];
  const skipped = [];
  const aliases = new Map(); // „as“ eines Bausteins → Spur, die er angelegt hat
  const pats = new Map(); // „id“ eines Begleit-/Beat-Bausteins → Pattern (alle Teile spielen dasselbe Pattern)
  const findTrack = (p, ref) => {
    if (ref == null) return null;
    const al = aliases.get(ref);
    if (al) return p.tracks.find((t) => t.id === al) ?? null;
    return p.tracks.find((t) => t.id === ref) || p.tracks.find((t) => t.name === ref) || null;
  };
  // Spur: vorhandene, eine leere Standardspur oder eine neue; name/volume beim Anlegen
  const trackFor = (p, a, cat, from, to) => {
    let t = a.track && a.track !== 'neu' ? findTrack(p, a.track) : null;
    if (!t && a.track !== 'neu' && cat) t = p.tracks.find((x) => x.clips.length && catOf(x, library) === cat && !x.clips.some((c) => c.startBeat < to && c.startBeat + c.lengthBeats > from));
    if (!t) t = p.tracks.find((x) => !x.clips.length && DEFAULT_NAME.test(x.name) && ![...aliases.values()].includes(x.id));
    if (!t) { const id = store.addTrack(); if (!id) throw 0; t = store.track(id); }
    if (a.as && !aliases.has(a.as)) {
      aliases.set(a.as, t.id);
      const patch = {};
      if (a.name) patch.name = String(a.name).slice(0, 32);
      if (a.volume >= 0 && a.volume <= 1) patch.volume = Math.round(a.volume * 100) / 100;
      if (Object.keys(patch).length) store.setTrack(t.id, patch);
    }
    return t;
  };
  const range = (p, a) => {
    const from = Math.max(1, Math.round(Number(a.fromBar) || 1));
    let to = Math.round(Number(a.toBar) || p.lengthBars);
    if (to < from) to = from;
    if (to > p.lengthBars) store.setLength(Math.min(256, to));
    return [from, to];
  };
  const fades = (clipId, a, bpb) => {
    const patch = {};
    if (a.fadeInBars > 0) patch.fadeInBeats = a.fadeInBars * bpb;
    if (a.fadeOutBars > 0) patch.fadeOutBeats = a.fadeOutBars * bpb;
    if (Object.keys(patch).length) store.setClip(clipId, patch);
  };
  store.batch('starter', () => {
    for (const a of plan.actions || []) {
      const p = store.project;
      const bpb = p.beatsPerBar;
      try {
        switch (a.do) {
          case 'reset':
            store.clearSong();
            break;
          case 'name':
            if (!a.name) throw 0;
            store.setProjectName(String(a.name));
            break;
          case 'tempo': {
            const bpm = Number(a.bpm);
            if (!(bpm >= 40 && bpm <= 240)) throw 0;
            store.setBpm(bpm);
            break;
          }
          case 'key': {
            const bar = Math.round(Number(a.bar) || 1);
            if (!KEYS.includes(a.key) || bar < 1 || bar > p.lengthBars) throw 0;
            store.setKeyAt(bar, a.key);
            break;
          }
          case 'length': {
            const bars = Math.round(Number(a.bars));
            if (!(bars >= 4 && bars <= 256)) throw 0;
            store.setLength(bars);
            break;
          }
          case 'chords': {
            // Stufen („VI“) oder Symbole („F“, in der Tonart am Starttakt)
            const [from, to] = range(p, a);
            const tonic = tonicOf(keyAtBar(store.project, from));
            const list = (a.chords || []).map((c) => (isChord(c) ? c : degreeOfSymbol(c, tonic)));
            if (!list.length || list.some((c) => !c)) throw 0;
            store.fillChords((from - 1) * bpb, list, { toBeat: to * bpb, per: Number(a.per) > 0 ? Number(a.per) : bpb });
            break;
          }
          case 'add': {
            const s = library.get(a.sound);
            if (!s) throw 0;
            const [from, to] = range(p, a);
            const t = trackFor(store.project, a, s.colorCat ?? s.category, (from - 1) * bpb, to * bpb);
            const oneShot = s.kind === 'oneshot' || s.kind === 'oneShot';
            const id = store.addClip(t.id, s.id, (from - 1) * bpb, oneShot ? s.lengthBeats : (to - from + 1) * bpb);
            fades(id, a, bpb);
            break;
          }
          case 'accomp':
          case 'pattern': {
            const [from, to] = range(p, a);
            let pid = a.id != null ? pats.get(a.id) : null;
            if (!pid) {
              let pattern;
              if (a.do === 'accomp') {
                if (!ACCOMP_STYLES[a.style]) throw 0;
                pattern = accompPattern(a.style, tonicOf(keyOf(store.project)));
              } else {
                if (!a.pattern || !['drums', 'synth'].includes(a.pattern.type)) throw 0;
                pattern = JSON.parse(JSON.stringify(a.pattern));
              }
              pid = store.addPattern(pattern);
              if (a.id != null) pats.set(a.id, pid);
            }
            const pat = store.project.patterns[pid];
            const cat = pat.type === 'drums' ? 'drums' : ACCOMP_STYLES[a.style]?.category;
            const t = trackFor(store.project, { name: pat.name, ...a }, cat, (from - 1) * bpb, to * bpb);
            const id = store.addClip(t.id, patternSampleId(pid), (from - 1) * bpb, (to - from + 1) * bpb);
            fades(id, a, bpb);
            break;
          }
          default:
            throw 0;
        }
        done.push(a);
      } catch (e) {
        if (e !== 0) throw e;
        skipped.push(a);
      }
    }
    if (!store.project.tracks.length) store.addTrack();
  });
  return { done, skipped };
}
