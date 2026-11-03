// Zerlegen mit Audio (Krachwerk 2b, Spec krachwerk-2b-zerlegen §5): Anschläge im Original finden und Trennen in neue
// Sounds. Die Lage-Rechnung ohne Audio steht in src/cuts.js, die Store-Aktion ist store.cutSound.

import { detectOnsets } from './dsp/slice.js';
import { mixMono, features } from './dsp/clean.js';
import { cookRecipe } from './dsp/recipe.js';
import { planCuts, evenCuts, pickPads, assignPads, CUT_PRE } from './cuts.js';
import { soundFields } from './recipe.js';
import { channelsToBuffer } from './own-sounds.js';

const MAIN_MAX = 30; // s: bis hier im Hauptthread, darüber Job „onsets“ im Rechen-Worker

// Anschläge (Frames ab Fensteranfang) auf der Mono-Summe von orig[a…b]
async function onsetsIn(orig, a, b, sensitivity) {
  const sr = orig.sampleRate;
  const chs = Array.from({ length: orig.numberOfChannels }, (_, c) => orig.getChannelData(c).subarray(a, b));
  if ((b - a) / sr <= MAIN_MAX) return detectOnsets(mixMono(chs), sr, { sensitivity });
  const { runJob } = await import('./dsp/run.js');
  return runJob('onsets', { chs, sampleRate: sr, sensitivity });
}

// Marken für einen Sound. recipe = Rezept des Sounds (Ausschnitt start…end gilt; bei Varianten/Schnitten deren eigener).
// mode 'onsets' (sensitivity 0…1) | 'even' (count). Rückgabe { cuts: [{ start, end, onset? }], start, end, duration,
// sampleRate } in Sekunden des Originals der Wurzel, null ohne Original.
export async function findCuts(library, sampleId, recipe = null, { mode = 'onsets', sensitivity = 0.5, count = 8 } = {}) {
  const s = await library.ensure(sampleId);
  const orig = s?.orig;
  if (!orig) return null;
  const sr = orig.sampleRate;
  const duration = orig.duration;
  const start = Math.min(Math.max(0, recipe?.start ?? 0), duration);
  const end = Math.max(start, Math.min(duration, recipe?.end ?? duration));
  const base = { start, end, duration, sampleRate: sr };
  if (mode === 'even') return { ...base, cuts: evenCuts(count, { start, end }) };
  const a = Math.round(start * sr);
  const onsets = await onsetsIn(orig, a, Math.max(a + 1, Math.round(end * sr)), sensitivity);
  return { ...base, cuts: planCuts(onsets, sr, { start, end }) };
}

const LAYERS = {
  vocal: [{ label: 'Stimme', ids: ['vocals'] }],
  novocal: [{ label: 'ohne Stimme', ids: ['drums', 'bass', 'other'] }],
  stems: null, // aus STEMS
};

// Trennen (Job „separate“ auf dem Original der Wurzel): neue eigene Sounds mit Audio, gleiche Länge, Rezept und
// Sound-Tempo der Quelle kopiert. mode 'vocal' (Nur Stimme) | 'novocal' (Stimme weg): mit clipId spielt der Clip danach
// den neuen Sound; 'stems' (In 4 Ebenen): mit clipId vier Spuren unter der Spur des Clips (insertStemTracks).
// Die Zuordnung ist ein Rückgängig-Schritt („Trennen“); die Sounds selbst bleiben in den eigenen Sounds.
// Rückgabe { ids, trackIds } bzw. null (kein Original, zu viele Spuren).
export async function separateSound({ store, library, own, sampleId, clipId = null, mode = 'vocal', onProgress } = {}) {
  const s = library.get(sampleId);
  const rootId = s?.parentId ?? sampleId;
  const root = await library.ensure(rootId);
  if (!root?.orig) return null;
  const { STEMS, mixStems } = await import('./dsp/separate.js');
  const layers = LAYERS[mode] ?? STEMS.map((x) => ({ label: x.label, ids: [x.id], track: x.label }));
  if (mode === 'stems' && clipId && store.project.tracks.length + layers.length > 16) return null;
  const { runJob } = await import('./dsp/run.js');
  const orig = root.orig;
  const chs = Array.from({ length: orig.numberOfChannels }, (_, c) => orig.getChannelData(c));
  const stems = await runJob('separate', { chs, sampleRate: orig.sampleRate }, { onProgress });
  const rec = store.project.recipes?.[sampleId] ?? null;
  const patch = { ...soundFields(rec) };
  const material = rec?.material ?? store.project.recipes?.[rootId]?.material;
  if (material) patch.material = material;
  const tempo = store.project.sampleTempo?.[sampleId] ?? null;
  const tb = root.tempoBase ?? root;
  const base = s?.name || root.name || 'Sound';
  const made = [];
  for (const layer of layers) {
    const out = layer.ids.length === 1 ? stems[layer.ids[0]] : mixStems(stems, layer.ids);
    const snd = await own.create({
      name: `${base} – ${layer.label}`.slice(0, 40), buffer: channelsToBuffer(out, orig.sampleRate),
      kind: tb.kind === 'loop' ? 'loop' : 'oneshot', beats: tb.kind === 'loop' ? tb.beats : null, source: `Ebene aus „${root.name}“`,
      cls: root.made?.cls ?? undefined, tags: root.made?.tags, from: root.made?.from,
    });
    made.push({ id: snd.id, label: layer.track ?? layer.label });
  }
  let trackIds = [];
  store.batch('Trennen', () => {
    for (const m of made) {
      if (Object.keys(patch).length) store.setRecipe(m.id, patch);
      if (tempo != null) store.setSampleTempo(m.id, tempo);
    }
    if (!clipId || !store.findClip(clipId)) return;
    if (mode === 'stems') trackIds = store.insertStemTracks(clipId, made.map((m) => ({ name: m.label, sampleId: m.id }))) || [];
    else store.setClip(clipId, { sampleId: made[0].id });
  });
  return { ids: made.map((m) => m.id), trackIds };
}

const PAD_MAX = 1.2; // s: ein Pad höchstens so lang (wie die Stücke im Prototyp)

// Klatsch dein Kit / „Als Kit“ (Krachwerk 4, Spec krachwerk-4-kit §2–3): Anschläge finden, je Schnitt die Helligkeit auf
// dem gebackenen Klang messen, höchstens 8 Schnitte tief → hell auf die Pads (assignPads), dann store.clapKit (Schnitte
// als Varianten + Kit + mit place Clip mit Muster und Loop) – ein Rückgängig-Schritt. Pads beginnen 3 ms vor ihrem
// Anschlag (auch der erste, ohne Auftakt) und sind höchstens 1,2 s lang. Unter 2 Schlägen entsteht nichts.
// Rückgabe { count, kitId, ids, patternId, clipId } (kitId null: nichts entstanden)
export async function kitFromSound({ store, library, sampleId, sensitivity = 0.5, place = true, name = null, trackId = null, atBeat = null, groove = 'gerade', label = 'Klatsch-Kit' }) {
  const rec = store.project.recipes?.[sampleId] ?? null;
  const found = await findCuts(library, sampleId, rec, { sensitivity });
  const cuts = found?.cuts ?? [];
  if (cuts.length < 2) return { count: cuts.length, kitId: null };
  const root = await library.ensure(library.get(sampleId)?.parentId ?? sampleId);
  const orig = root.orig;
  const sr = orig.sampleRate;
  const fields = soundFields(rec);
  for (const k of ['start', 'end', 'attack', 'release']) delete fields[k];
  const cook = Object.keys(fields).length > 0;
  const list = cuts.map((c) => {
    const start = c.onset != null ? Math.max(c.start, Number((c.onset - CUT_PRE).toFixed(5))) : c.start;
    return { start, end: Math.min(c.end, Number((start + PAD_MAX).toFixed(5))) };
  });
  const items = list.map((c, i) => {
    const a = Math.round(c.start * sr), b = Math.max(a + 1, Math.round(c.end * sr));
    let chs = Array.from({ length: orig.numberOfChannels }, (_, ch) => orig.getChannelData(ch).subarray(a, b));
    if (cook) chs = cookRecipe(chs, sr, fields);
    return { id: i, centroid: features(mixMono(chs), sr).centroid };
  });
  const chosen = pickPads(items).map((x) => x.id).sort((x, y) => x - y);
  const at = new Map(chosen.map((i, k) => [i, k]));
  const map = {};
  for (const [row, i] of Object.entries(assignPads(items))) map[row] = at.get(i);
  const res = store.clapKit(sampleId, chosen.map((i) => list[i]), map, { name, place, trackId, atBeat, groove, label });
  return { count: cuts.length, ...(res || { kitId: null }) };
}
