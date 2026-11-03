import { KEYS } from './keys.js';

// Klang-Rezept eines Sounds (ADR 010, Spec krachwerk-2-werkbank §2): project.recipes[sampleId]. Ohne Audio – Store,
// Library und Werkbank teilen sich Tabelle, Normalisierung und Wörter. Gebacken wird in src/dsp/recipe.js.

// Klangfelder: Bereich, Standard (= nicht gespeichert), Raster beim Speichern, Raster der Bedienung (ui)
export const RECIPE = {
  start: { min: 0, max: 480, def: 0, step: 1e-5, unit: 's' },
  end: { min: 0.01, max: 480, def: null, step: 1e-5, unit: 's' }, // null = Dauer
  attack: { min: 0, max: 2000, def: 0, step: 1, unit: 'ms' },
  release: { min: 0, max: 5000, def: 0, step: 1, unit: 'ms' },
  gain: { min: -24, max: 12, def: 0, step: 0.1, ui: 0.5, unit: 'dB' },
  reverse: { def: false, bool: true },
  semis: { min: -24, max: 24, def: 0, step: 1 },
  cents: { min: -100, max: 100, def: 0, step: 1 },
  lp: { min: 200, max: 20000, def: 20000, step: 1, log: true, unit: 'Hz' },
  hp: { min: 20, max: 2000, def: 20, step: 1, log: true, unit: 'Hz' },
  res: { min: 0, max: 1, def: 0, step: 0.01 },
  warm: { min: 0, max: 1, def: 0, step: 0.01 },
  grain: { min: 0, max: 1, def: 0, step: 0.01 },
  stretch: { min: 0.5, max: 2, def: 1, step: 0.01 },
  // Autotune (2b): Stärke 0 = aus; Roboter und Tonart wirken nur bei tune > 0
  tune: { min: 0, max: 1, def: 0, step: 0.01 },
  robot: { def: false, bool: true },
  tuneKey: { def: null, list: true },
};
export const SOUND_FIELDS = Object.keys(RECIPE);
const META = ['parent', 'name', 'material', 'group'];
// Moll-Tonarten wie KEYS in model.js (Index = Grundton 0 = C … 11 = H); hier ohne Import, model.js importiert dieses Modul
export const TUNE_KEYS = ['Cm', 'C♯m', 'Dm', 'E♭m', 'Em', 'Fm', 'F♯m', 'Gm', 'G♯m', 'Am', 'B♭m', 'Hm'];
const TUNE_ONLY = ['robot', 'tuneKey'];
export const MIN_SPAN = 0.01;

// Herkunft (§5): Farbe über die vorhandenen Kategorie-Tokens (colorCat)
export const MATERIALS = [
  { id: 'koerper', label: 'Körper', cat: 'drums' },
  { id: 'dinge', label: 'Dinge', cat: 'fx' },
  { id: 'stimme', label: 'Stimme', cat: 'synth' },
  { id: 'strom', label: 'Strom', cat: 'bass' },
  { id: 'schleife', label: 'Schleife', cat: 'chords' },
];
export const materialOf = (id) => MATERIALS.find((m) => m.id === id) ?? null;

export const isVariantId = (id) => /^vr-/.test(String(id));
export const newGroupId = () => 'zg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
export const newVariantId = () => 'vr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0');

const roundTo = (v, step) => Math.round(v / step) * step;
const clean = (v, step) => Number(roundTo(v, step).toFixed(6));

// Werte kappen, Unbekanntes und Standardwerte weglassen. duration (s, optional): Ausschnitt an die Länge anpassen,
// Ende auf der Dauer gilt als Standard. Ergebnis null, wenn nichts übrig bleibt.
export function normalizeRecipe(r, { duration = null } = {}) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const out = {};
  if (typeof r.parent === 'string' && r.parent) out.parent = r.parent;
  if (typeof r.name === 'string' && r.name.trim()) out.name = r.name.trim().slice(0, 40);
  if (materialOf(r.material)) out.material = r.material;
  if (typeof r.group === 'string' && /^zg-[a-z0-9]+$/.test(r.group)) out.group = r.group;
  for (const k of SOUND_FIELDS) {
    const f = RECIPE[k];
    const v = r[k];
    if (v == null) continue;
    if (f.bool) { if (v === true) out[k] = true; continue; }
    if (f.list) { if (TUNE_KEYS.includes(v)) out[k] = v; continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const x = clean(Math.min(f.max, Math.max(f.min, n)), f.step);
    if (x !== f.def) out[k] = x;
  }
  // Ausschnitt: Ende mindestens 10 ms hinter dem Anfang, beide innerhalb der Dauer
  const dur = duration > 0 ? duration : null;
  if (dur != null) {
    if (out.start != null) out.start = clean(Math.min(out.start, Math.max(0, dur - MIN_SPAN)), RECIPE.start.step);
    if (out.end != null && out.end >= dur - 1e-6) delete out.end;
  }
  if (out.start === 0) delete out.start;
  if (out.end != null && out.end < (out.start ?? 0) + MIN_SPAN) out.end = clean((out.start ?? 0) + MIN_SPAN, RECIPE.end.step);
  return Object.keys(out).length ? out : null;
}

// Stabiler Schlüssel der Klangfelder (Name und Material ändern den Klang nicht); '' = nichts zu backen
export function recipeKey(r) {
  if (!r) return '';
  const parts = [];
  const tuned = (r.tune ?? 0) > 0;
  for (const k of SOUND_FIELDS) {
    if (!tuned && TUNE_ONLY.includes(k)) continue;
    if (r[k] != null && r[k] !== RECIPE[k].def) parts.push(`"${k}":${JSON.stringify(r[k])}`);
  }
  return parts.length ? `{${parts.join(',')}}` : '';
}

// Nur Klangfelder (für Kopien und das Backen)
export function soundFields(r) {
  const out = {};
  for (const k of SOUND_FIELDS) if (r?.[k] != null) out[k] = r[k];
  return out;
}

export const isMeta = (k) => META.includes(k);

// Vorschlag, wenn der Nutzer kein Material gesetzt hat (§5)
export function suggestMaterial(s) {
  if (!s) return 'dinge';
  if (/^pat-/.test(String(s.id)) || s.patternId) return 'strom';
  if (s.made?.cls === 'ton') return 'stimme';
  if (s.made?.from === 'loop' || s.made?.from === 'freeze' || s.kind === 'loop') return 'schleife';
  return 'dinge';
}

const num = (v, digits = 1) => String(Math.round(v * 10 ** digits) / 10 ** digits).replace('.', ',').replace('-', '−');
const signed = (v, digits = 1) => (v > 0 ? '+' : '') + num(v, digits);

// Wörter für den Stammbaum in fester Reihenfolge (§5)
export function recipeSteps(r) {
  if (!r) return [];
  const out = [];
  if ((r.start ?? 0) > 0 || r.end != null) out.push('gekürzt');
  if (r.reverse) out.push('rückwärts');
  if (r.stretch != null && r.stretch !== 1) out.push(`gedehnt ${Math.round(r.stretch * 100)} %`);
  const st = (r.semis ?? 0) + (r.cents ?? 0) / 100;
  if (st) out.push(`gestimmt ${signed(st, 2)}`);
  if ((r.tune ?? 0) > 0) out.push(`gestimmt auf ${r.tuneKey ?? 'Am'}`);
  if ((r.lp ?? 20000) < 20000 || (r.hp ?? 20) > 20 || (r.res ?? 0) > 0) out.push('gefiltert');
  if ((r.warm ?? 0) > 0) out.push('wärmer');
  if ((r.grain ?? 0) > 0) out.push('körnig');
  if ((r.gain ?? 0) > 0) out.push('lauter');
  else if ((r.gain ?? 0) < 0) out.push('leiser');
  return out;
}

// Ziehen an einem Griff: rasche Folgeänderungen desselben Felds = ein Rückgängig-Schritt (Muster aus clip-speed.js).
// const key = gesture(id, 'lp'); store.setRecipe(id, { lp }, { coalesce: key }); end() nach dem Loslassen.
export function recipeGesture(gap = 600) {
  let cur = { id: null, field: null, key: null, ended: 0 };
  let n = 0;
  const key = (id, field) => {
    const now = performance.now();
    if (cur.id !== id || cur.field !== field || (cur.ended && now - cur.ended > gap)) cur = { id, field, key: `rcp-${id}-${field}-${++n}`, ended: 0 };
    return cur.key;
  };
  key.end = () => { cur.ended = performance.now(); };
  return key;
}

// ---------- Stammbaum und Zutatenliste (Scheibe 5) ----------
const SOURCE = { mic: 'Aufnahme', file: 'Datei', loop: 'Schleife', freeze: 'Festgehalten' };
const pad2 = (n) => String(n).padStart(2, '0');

// Stammbaum-Zeile (§5): Material · Quelle Datum → Schritte · Dauer
export function treeText(s, r, lib) {
  if (!s) return '';
  if (s.missing) return 'Dieser Klang ist nicht mehr im Browser. Die Projektdatei bringt ihn zurück.';
  const root = s.parentId ? lib.get(s.parentId) : s;
  const mat = materialOf(r?.material ?? root?.material ?? s.material) ?? materialOf(suggestMaterial(root ?? s));
  const strom = /^pat-/.test(s.id) || s.patternId;
  const src = strom ? 'Strom' : SOURCE[root?.made?.from ?? 'mic'] ?? 'Aufnahme';
  let when = '';
  if (root?.created && root.created > 1e11) { const d = new Date(root.created); when = ` ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  const steps = recipeSteps(r);
  const dur = (lib.source?.(s) ?? s.orig)?.duration ?? s.duration;
  const parts = [`${mat.label} · ${src}${when}`];
  const zut = (root?.made?.src || []).map((id) => lib.get(id)?.name).filter(Boolean);
  if (root?.made?.from === 'freeze' && zut.length) parts[0] += ` aus ${zut.join(', ')}`;
  if (steps.length) parts[0] += ` → ${steps.join(' · ')}`;
  if (dur) parts[0] += ` · ${num(dur, 2)} s`;
  return (s.parentId ? `Variante von ${root?.name ?? '?'} → ` : '') + parts[0];
}

// Zutatenliste des Songs (rein): welche Sounds klingen, wie sind sie entstanden, was ist nicht selbst gemacht.
// Eigen = „own-…“/„mk-…“ (Aufnahmen), Strom („pat-…“, vom Programm aus deinem Muster gebaut) und Varianten davon;
// Fremd = alles andere aus der Bibliothek (mitgelieferte Loops und Sounds). Fehlt ein Sound in der Bibliothek, zählt er als eigen.
// Rückgabe: { head, summary, lines, text, own, foreign }; text ist die Nachricht beim Teilen und der WAV-Kommentar.
export function ingredients(project, library, { app = 'Krachwerk' } = {}) {
  const ids = new Set();
  for (const t of project.tracks || []) for (const c of t.clips || []) ids.add(c.sampleId);
  for (const k of Object.values(project.kits || {})) for (const id of Object.values(k?.map || {})) if (typeof id === 'string') ids.add(id);
  for (const i of Object.values(project.instruments || {})) if (typeof i?.sampleId === 'string') ids.add(i.sampleId);
  const rootOf = (id) => { const s = library.get(id); return project.recipes?.[id]?.parent ?? s?.parentId ?? id; };
  const roots = [...new Set([...ids].map(rootOf))];
  const isOwn = (id) => { const s = library.get(id); return /^(own|mk|pat)-/.test(String(id)) || !s || s.category === 'own'; };
  const own = [];
  const foreign = [];
  for (const id of roots) {
    const s = library.get(id);
    const name = s?.name ?? project.recipes?.[id]?.name ?? 'Ohne Namen';
    if (!isOwn(id)) { foreign.push({ id, name }); continue; }
    // Rezept des Sounds selbst, sonst das seiner Variante (die im Song klingt)
    const used = [...ids].filter((x) => rootOf(x) === id);
    const hit = used.find((x) => x !== id) ?? id;
    const line = s ? treeText(library.get(hit) ?? s, project.recipes?.[hit], library) : '';
    own.push({ id, name, line });
  }
  const n = own.length;
  const m = foreign.length;
  const summary = `${n} ${n === 1 ? 'Geräusch' : 'Geräusche'} · ${m} ${m === 1 ? 'fremdes Sample' : 'fremde Samples'}`;
  const head = [app, project.name || 'unbenannt', `${Math.round(project.bpm)} BPM`, (KEYS.includes(project.key) ? project.key : 'Am')].join(' · ');
  const lines = [...own.map((x) => `${x.name}: ${x.line}`), ...foreign.map((x) => `${x.name}: fremdes Sample`)];
  return { head, summary, lines, own, foreign, text: [head, summary, ...lines].join('\n') };
}
