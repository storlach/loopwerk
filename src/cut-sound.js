// Zerlegen mit Audio (Krachwerk 2b, Spec krachwerk-2b-zerlegen §5): Anschläge im Original finden und Trennen in neue
// Sounds. Die Lage-Rechnung ohne Audio steht in src/cuts.js, die Store-Aktion ist store.cutSound.

import { detectOnsets } from './dsp/slice.js';
import { mixMono } from './dsp/clean.js';
import { planCuts, evenCuts } from './cuts.js';
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
