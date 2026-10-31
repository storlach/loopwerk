// Wunsch-Agent: ein Satz wie „Techno-Beat ab Takt 5, Bass dazu, Pad mit Hall“ wird zu einem Plan aus wenigen
// Bausteinen und als ein Rückgängig-Schritt ausgeführt. Claude plant (Capability `sample`), sonst greifen Regeln.

import { EFFECTS } from './effects.js';
import { askJson } from './ai.js';
import { keyOf, keyChangesOf, KEYS } from './model.js';

const CATS = ['drums', 'bass', 'chords', 'synth', 'fx'];
const CAT_WORDS = {
  drums: /drum|beat|schlagzeug|groove|kick|hats?\b|hihat|rhythmus|perc/,
  bass: /bass/,
  chords: /akkord|pad|chord|fläche|harmonie/,
  synth: /melodie|arp|synth|lead|hook/,
  fx: /effekt|riser|crash|übergang|\bfx\b|impact/,
};
const GENRES = { techno: /techno/, house: /house/, hiphop: /hip.?hop|rap|trap/, pop: /\bpop/, ambient: /ambient|chill|ruhig/, breaks: /break|dnb|drum.?(and|&|n).?bass|jungle/ };
const FX_WORDS = { hall: /hall|reverb|raum/, echo: /echo|delay/, drive: /verzerr|dreckig|distortion|crunch/, filter: /filter|dumpf/, pump: /pump/, comp: /kompress|druck/ };
const NUM = { ein: 1, eins: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, acht: 8, zehn: 10, zwölf: 12, sechzehn: 16, zwanzig: 20, zweiunddreißig: 32 };
const num = (w) => (w == null ? null : /^\d+$/.test(w) ? Number(w) : NUM[w] ?? null);

// Tonart aus dem Text: „D-Moll“, „fis-moll“, „in Dm“, „Tonart C#m“ → Kürzel aus KEYS (nur Moll; die Loops stehen in Moll)
const KEY_WORDS = { c: 'Cm', cis: 'C♯m', des: 'C♯m', d: 'Dm', dis: 'E♭m', es: 'E♭m', e: 'Em', f: 'Fm', fis: 'F♯m', ges: 'F♯m', g: 'Gm', gis: 'G♯m', as: 'G♯m', a: 'Am', ais: 'B♭m', b: 'B♭m', h: 'Hm' };
const KEY_SYMBOLS = { C: 'Cm', 'C#': 'C♯m', Db: 'C♯m', D: 'Dm', 'D#': 'E♭m', Eb: 'E♭m', E: 'Em', F: 'Fm', 'F#': 'F♯m', Gb: 'F♯m', G: 'Gm', 'G#': 'G♯m', Ab: 'G♯m', A: 'Am', 'A#': 'B♭m', Bb: 'B♭m', B: 'Hm', H: 'Hm' };
export function keyInText(text) {
  const w = String(text).toLowerCase().match(/(?:^|[^a-zäöüß])(cis|des|dis|es|fis|ges|gis|as|ais|[a-h])\s*-?\s*moll(?![a-zäöü])/);
  if (w) return KEY_WORDS[w[1]];
  const sym = String(text).replace(/♯/g, '#').replace(/♭/g, 'b').match(/(?:\b[Ii]n|\b[Tt]onart|\b[Nn]ach)\s+([A-H])([#b]?)m(?![a-zäöü])/);
  if (sym) return KEY_SYMBOLS[sym[1] + sym[2]] ?? null;
  return null;
}

// ---------- Plan prüfen und ausführen ----------

function findTrack(p, ref) {
  if (ref == null) return null;
  const r = String(ref).toLowerCase().trim();
  return p.tracks.find((t) => t.id === ref) || p.tracks.find((t) => t.name.toLowerCase() === r) || p.tracks.find((t) => t.name.toLowerCase().includes(r)) || null;
}

function catOfTrack(t, library) {
  const c = t.clips[0];
  const s = c && library.get(c.sampleId);
  return s ? s.colorCat ?? s.category : null;
}

// Führt einen Plan als einen Schritt aus; gibt zurück, was geklappt hat (ungültige Bausteine werden übersprungen)
export function applyPlan(store, library, plan) {
  const done = [];
  const skipped = [];
  store.batch('wish', () => {
    for (const a of plan.actions || []) {
      const p = store.project;
      const bpb = p.beatsPerBar;
      try {
        switch (a.do) {
          case 'tempo': {
            const bpm = Number(a.bpm);
            if (!(bpm >= 40 && bpm <= 240)) throw 0;
            store.setBpm(bpm);
            break;
          }
          case 'length': {
            const bars = Math.round(Number(a.bars));
            if (!(bars >= 4 && bars <= 256)) throw 0;
            store.setLength(bars);
            break;
          }
          case 'add': {
            const s = library.get(a.sound);
            if (!s) throw 0;
            const from = Math.max(1, Math.round(Number(a.fromBar) || 1));
            let to = Math.round(Number(a.toBar) || p.lengthBars);
            if (to < from) to = from;
            if (to > p.lengthBars) store.setLength(Math.min(256, to));
            const cat = s.colorCat ?? s.category;
            let t = a.track && a.track !== 'neu' ? findTrack(p, a.track) : null;
            if (!t && a.track !== 'neu') t = p.tracks.find((x) => x.clips.length && catOfTrack(x, library) === cat && !x.clips.some((c) => c.startBeat < to * bpb && c.startBeat + c.lengthBeats > (from - 1) * bpb));
            if (!t) t = p.tracks.find((x) => !x.clips.length);
            if (!t) { const id = store.addTrack(); if (!id) throw 0; t = store.track(id); }
            const oneShot = s.kind === 'oneshot' || s.kind === 'oneShot';
            const len = oneShot ? s.lengthBeats : (to - from + 1) * bpb;
            store.addClip(t.id, s.id, (from - 1) * bpb, len);
            break;
          }
          case 'remove': {
            const t = findTrack(p, a.track);
            if (!t) throw 0;
            const from = ((Number(a.fromBar) || 1) - 1) * bpb;
            const to = (Number(a.toBar) || p.lengthBars) * bpb;
            const ids = t.clips.filter((c) => c.startBeat >= from - 1e-6 && c.startBeat < to).map((c) => c.id);
            if (!ids.length) throw 0;
            store.deleteClips(ids);
            break;
          }
          case 'volume': {
            const t = findTrack(p, a.track);
            const v = Number(a.level);
            if (!t || !(v >= 0 && v <= 1)) throw 0;
            store.setTrack(t.id, { volume: Math.round(v * 100) / 100 });
            break;
          }
          case 'mute': {
            const t = findTrack(p, a.track);
            if (!t) throw 0;
            store.setTrack(t.id, { mute: a.on !== false });
            break;
          }
          case 'effect': {
            const fx = EFFECTS.find((e) => e.id === a.effect);
            if (!fx) throw 0;
            const patch = { on: a.on !== false };
            for (const [k, v] of Object.entries(a.params || {})) {
              const d = fx.params[k];
              if (!d) continue;
              if (d.options) { if (d.options.some((o) => o.id === v)) patch[k] = v; } else if (typeof v === 'number') patch[k] = Math.min(d.max, Math.max(d.min, v));
            }
            if (a.track === 'master') store.setMasterFx(fx.id, patch);
            else {
              const t = findTrack(p, a.track);
              if (!t) throw 0;
              store.setTrackFx(t.id, fx.id, patch);
            }
            break;
          }
          case 'key': {
            const bar = Math.round(Number(a.bar) || 1);
            if (!KEYS.includes(a.key) || bar < 1 || bar > p.lengthBars) throw 0;
            store.setKeyAt(bar, a.key);
            break;
          }
          case 'name':
            if (!a.name) throw 0;
            store.setProjectName(String(a.name));
            break;
          default:
            throw 0;
        }
        done.push(a);
      } catch (e) {
        if (e !== 0) throw e;
        skipped.push(a);
      }
    }
  });
  return { done, skipped };
}

// ---------- Regeln (ohne KI) ----------

function pick(library, cat, genre, used) {
  const all = library.list().filter((s) => (s.colorCat ?? s.category) === cat && s.category !== 'own' && !String(s.id).startsWith('pat-') && !String(s.id).startsWith('own-'));
  const loops = all.filter((s) => cat === 'fx' || s.kind === 'loop');
  const pool = loops.length ? loops : all;
  const fit = genre ? pool.filter((s) => s.genres?.includes(genre)) : pool;
  const list = (fit.length ? fit : pool).filter((s) => !used.has(s.id));
  return (list.length ? list : fit.length ? fit : pool)[0] || null;
}

export function planByRules(text, project, library) {
  const t = text.toLowerCase();
  const actions = [];
  const notes = [];
  const genre = Object.keys(GENRES).find((g) => GENRES[g].test(t)) || null;
  const cats = CATS.filter((c) => CAT_WORDS[c].test(t));
  const W = '(\\d+|' + Object.keys(NUM).join('|') + ')';
  const bpm = t.match(/(\d{2,3})\s*(bpm|schläge)/);
  if (bpm) actions.push({ do: 'tempo', bpm: Number(bpm[1]) });
  else if (/schneller|flotter|tempo hoch/.test(t)) actions.push({ do: 'tempo', bpm: project.bpm + 10 });
  else if (/langsamer|gemütlicher|tempo runter/.test(t)) actions.push({ do: 'tempo', bpm: project.bpm - 10 });
  else if (genre && /song|track|stück|bau|mach/.test(t)) actions.push({ do: 'tempo', bpm: { techno: 130, house: 124, hiphop: 90, pop: 110, ambient: 85, breaks: 170 }[genre] });
  const len = t.match(new RegExp(W + '\\s*takte?\\s*(lang|länge)')) || t.match(new RegExp('(?:länge|lang)\\s*(?:auf|von)?\\s*' + W + '\\s*takte?'));
  if (len) actions.push({ do: 'length', bars: num(len[1]) });
  // Bereich: „ab Takt 5“, „von Takt 5 bis 12“, „in den ersten 4 Takten“, „am Ende“
  let from = 1;
  let to = Math.max(project.lengthBars, len ? num(len[1]) : 0);
  const r = t.match(new RegExp('(?:von|ab)\\s*takt\\s*' + W + '(?:\\s*bis\\s*(?:takt\\s*)?' + W + ')?'));
  if (r) { from = num(r[1]) || 1; if (r[2]) to = num(r[2]) || to; }
  const first = t.match(new RegExp('(?:ersten|erste)\\s*' + W + '\\s*takt'));
  if (first) to = num(first[1]) || to;
  const lastN = t.match(new RegExp('(?:letzten|letzte)\\s*' + W + '\\s*takt'));
  if (lastN) from = Math.max(1, to - (num(lastN[1]) || 4) + 1);

  const tracksOf = (c) => project.tracks.filter((x) => x.clips.length && catOfTrack(x, library) === c);
  const used = new Set();
  const addedCats = {};
  let louder = false;
  const fxAll = [];
  // „Bau mir einen Techno-Track“: alles, mit Aufbau
  const whole = !cats.length && (genre || /song|track|stück/.test(t)) && /bau|mach|erstell|schreib|gib/.test(t);
  if (whole) {
    const L = Math.max(16, to);
    if (L > project.lengthBars) actions.push({ do: 'length', bars: L });
    const plan = { chords: [1, L], drums: [5, L], bass: [9, L], synth: [13, L], fx: [8, 8] };
    for (const c of ['chords', 'drums', 'bass', 'synth', 'fx']) {
      const s = pick(library, c, genre, used);
      if (!s) continue;
      used.add(s.id);
      actions.push({ do: 'add', sound: s.id, track: 'neu', fromBar: plan[c][0], toBar: plan[c][1] });
    }
    notes.push('mit Aufbau: Fläche, dann Beat, Bass und Melodie');
  }
  // Jeder Teilsatz für sich: „Techno-Beat ab Takt 9, Bass dazu, Pad mit Hall“
  const clauses = whole ? [] : t.split(/[,;.]|\bund\b|\bdazu\b|\bplus\b|\bsowie\b/).map((x) => x.trim()).filter(Boolean);
  let lastCats = [];
  // „ab Takt 9 in D-Moll“: Tonartwechsel ab dem genannten Takt (ohne Takt: Grundtonart). Im Original-Text suchen,
  // damit „Dm“ (Großschreibung) erkannt wird.
  for (const cl of String(text).split(/[,;.]|\bund\b|\bdazu\b|\bplus\b|\bsowie\b/)) {
    const key = keyInText(cl);
    if (!key) continue;
    const kr = cl.toLowerCase().match(new RegExp('(?:von|ab)\\s*takt\\s*' + W));
    actions.push({ do: 'key', bar: kr ? num(kr[1]) || 1 : 1, key });
  }
  for (const cl of clauses) {
    let cc = CATS.filter((c) => CAT_WORDS[c].test(cl));
    const fx = Object.keys(FX_WORDS).filter((f) => FX_WORDS[f].test(cl));
    if (!cc.length && fx.length && /drauf|darauf|dazu|damit/.test(cl)) cc = lastCats;
    let f0 = from;
    let t0 = to;
    const rr = cl.match(new RegExp('(?:von|ab)\\s*takt\\s*' + W + '(?:\\s*bis\\s*(?:takt\\s*)?' + W + ')?'));
    if (rr) { f0 = num(rr[1]) || 1; t0 = rr[2] ? num(rr[2]) || to : to; }
    const remove = /\b(ohne|weg|entfern\w*|lösch\w*|raus)\b/.test(cl);
    const up = /lauter/.test(cl);
    const down = /leiser/.test(cl);
    if (remove && cc.length) {
      for (const c of cc) for (const tr of tracksOf(c)) actions.push({ do: 'remove', track: tr.id, fromBar: f0, toBar: t0 });
    } else if ((up || down) && cc.length) {
      louder = up;
      for (const c of cc) for (const tr of tracksOf(c)) actions.push({ do: 'volume', track: tr.id, level: Math.min(1, Math.max(0.05, tr.volume + (up ? 0.15 : -0.2))) });
    } else if (cc.length && !(fx.length && cc.every((c) => tracksOf(c).length || addedCats[c]))) {
      // neuer Sound – außer bei „Hall auf den Bass“, das meint die vorhandene Spur
      for (const c of cc) {
        const s = pick(library, c, genre, used);
        if (!s) continue;
        used.add(s.id);
        addedCats[c] = s.id;
        actions.push({ do: 'add', sound: s.id, fromBar: f0, toBar: t0 });
      }
    }
    for (const f of fx) {
      fxAll.push(f);
      const params = f === 'hall' ? { mix: /viel|groß|weit/.test(cl) ? 0.45 : 0.3 } : f === 'echo' ? { mix: 0.3 } : {};
      if (!cc.length) { actions.push({ do: 'effect', track: 'master', effect: f, params }); continue; }
      for (const c of cc) {
        if (addedCats[c] && !tracksOf(c).length) actions.push({ do: 'effect', track: '@' + addedCats[c], effect: f, params });
        else for (const tr of tracksOf(c)) actions.push({ do: 'effect', track: tr.id, effect: f, params });
      }
    }
    if (cc.length) lastCats = cc;
  }
  const fxs2 = [...new Set(fxAll)];
  const full = (a) => a.fromBar <= 1 && a.toBar >= project.lengthBars;
  const names = actions.filter((a) => a.do === 'add' && library.get(a.sound)).map((a) => library.get(a.sound).name + (whole || full(a) ? '' : ` (Takt ${a.fromBar}–${a.toBar})`));
  const parts = [];
  if (actions.some((a) => a.do === 'tempo')) parts.push(`Tempo ${actions.find((a) => a.do === 'tempo').bpm}`);
  if (names.length) parts.push(names.join(', '));
  if (actions.some((a) => a.do === 'remove')) parts.push('entfernt');
  for (const a of actions.filter((x) => x.do === 'key')) parts.push(a.bar > 1 ? `ab Takt ${a.bar} in ${a.key}` : `Tonart ${a.key}`);
  if (actions.some((a) => a.do === 'volume')) parts.push(louder ? 'lauter' : 'leiser');
  for (const f of fxs2) parts.push(EFFECTS.find((e) => e.id === f)?.label);
  return { summary: parts.filter(Boolean).join(' · ') + (notes.length ? ` – ${notes.join(', ')}` : ''), actions };
}

// „@sample-id“ als Spurverweis: die Spur, auf der dieser Sound gerade eingesetzt wurde
function resolveSoundRefs(store, plan) {
  for (const a of plan.actions) {
    if (typeof a.track !== 'string' || !a.track.startsWith('@')) continue;
    const id = a.track.slice(1);
    const t = store.project.tracks.findLast((x) => x.clips.some((c) => c.sampleId === id));
    a.track = t?.id ?? null;
  }
}

// ---------- Claude ----------

function describe(project, library) {
  const bpb = project.beatsPerBar;
  const sounds = library.list()
    .filter((s) => s.category !== 'own' && !String(s.id).startsWith('pat-'))
    .map((s) => `${s.id} | ${s.name} | ${s.colorCat ?? s.category} | ${s.kind === 'loop' ? `${Math.round(s.lengthBeats / bpb * 10) / 10} Takte` : 'One-Shot'} | ${(s.genres || []).join(',')}`);
  const tracks = project.tracks.map((t) => `${t.id} „${t.name}“ Lautstärke ${t.volume}${t.mute ? ' stumm' : ''}: ` +
    (t.clips.map((c) => `${library.get(c.sampleId)?.name ?? c.sampleId} Takt ${Math.round(c.startBeat / bpb) + 1}–${Math.round((c.startBeat + c.lengthBeats) / bpb)}`).join('; ') || 'leer'));
  const fx = EFFECTS.map((e) => `${e.id} (${e.label}): ${Object.entries(e.params).map(([k, p]) => p.options ? `${k}∈{${p.options.map((o) => o.id).join(',')}}` : `${k} ${p.min}…${p.max}`).join(', ')}`);
  return { sounds, tracks, fx };
}

export async function planWish(text, project, library) {
  const d = describe(project, library);
  const prompt = `Du bist der Assistent in Loopwerk, einem Loop-Music-Maker. Setze den Wunsch der Person mit den Bausteinen unten um. Wähle passende Sounds, achte auf die Tonart (Song in ${keyOf(project)}; die synthetischen Loops sind bereits darauf umgestimmt) und Aufbau, und übertreibe nicht.

Wunsch: „${text}“

Projekt: ${project.bpm} BPM, ${project.beatsPerBar}/4, ${project.lengthBars} Takte, Grundtonart ${keyOf(project)}, Tonartwechsel: ${keyChangesOf(project).map((c) => `ab Takt ${c.bar} ${c.key}`).join(', ') || 'keine'}.
Spuren (höchstens 16):
${d.tracks.join('\n')}

Sounds (id | Name | Kategorie | Länge | Genres):
${d.sounds.join('\n')}

Effekte (id: Parameter):
${d.fx.join('\n')}

Bausteine (Takte zählen ab 1, toBar ist inklusive; Loops wiederholen sich im Clip von selbst):
{"do":"tempo","bpm":40-240}
{"do":"length","bars":4-256}
{"do":"add","sound":"<id>","track":"<Spur-id oder Name, oder neu>","fromBar":n,"toBar":n}
{"do":"remove","track":"<Spur>","fromBar":n,"toBar":n}
{"do":"volume","track":"<Spur>","level":0-1}
{"do":"mute","track":"<Spur>","on":true|false}
{"do":"key","bar":n,"key":"<eine von ${KEYS.join(', ')}>"} (Tonart ab Takt n; Takt 1 = Grundtonart; tonale Loops und Melodien klingen dort umgestimmt)
{"do":"effect","track":"<Spur> oder master oder @<sound-id> (die Spur, auf die du diesen Sound gerade gesetzt hast)","effect":"<id>","on":true,"params":{}}

Antworte nur mit JSON: {"summary":"ein kurzer deutscher Satz, was du gemacht hast","actions":[...]}`;
  const res = await askJson(prompt);
  if (!res || !Array.isArray(res.actions)) return null;
  return { summary: String(res.summary || '').slice(0, 200), actions: res.actions.slice(0, 40), by: 'claude' };
}

// Ganzer Ablauf: planen (Claude, sonst Regeln) und ausführen
export async function runWish(text, { store, library }) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  let plan = await planWish(clean, store.project, library).catch((e) => { if (e?.code === 'cancelled') throw e; return null; });
  if (!plan) plan = { ...planByRules(clean, store.project, library), by: 'rules' };
  if (!plan.actions.length) return { ...plan, done: [], skipped: [] };
  // Verweise auf eben eingesetzte Sounds erst während der Ausführung auflösen
  const adds = plan.actions.filter((a) => a.do !== 'effect' || !String(a.track).startsWith('@'));
  const later = plan.actions.filter((a) => a.do === 'effect' && String(a.track).startsWith('@'));
  let result;
  store.batch('wish', () => {
    result = applyPlan(store, library, { actions: adds });
    if (later.length) {
      const refs = { actions: later.map((a) => ({ ...a })) };
      resolveSoundRefs(store, refs);
      const r2 = applyPlan(store, library, refs);
      result.done.push(...r2.done);
      result.skipped.push(...r2.skipped);
    }
  });
  return { ...plan, ...result };
}
