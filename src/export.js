// Export des Songs als WAV oder MP3. Gerendert wird offline mit derselben Signalkette wie beim Abspielen.
// MP3 mit LAME (lamejs, LGPL-3.0, lame.sourceforge.net) – wird erst beim ersten MP3-Export geladen.

import { renderProject, masteringOf, trackLevel } from './engine.js';
import { encodeWav, wavBits, fileExt, INFO_MAX } from './wav.js';
import { ingredients } from './recipe.js';
import { analyzeMastering } from './mastering.js';
import { audibleMap, trackState, EPS } from './model.js';
import { makeZip, crc32 } from './zip.js';

export const EXPORT_TAIL = 2.5; // Sekunden Ausklang für Hall und Echo

// Ende des letzten Clips, auf ganze Takte aufgerundet
export function songEndBeat(project) {
  const end = Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startBeat + c.lengthBeats)));
  return Math.ceil(end / project.beatsPerBar - 1e-9) * project.beatsPerBar;
}

export function exportRange(project, range) {
  if (range === 'loop' && project.loop.endBeat > project.loop.startBeat) return [project.loop.startBeat, project.loop.endBeat];
  return [0, songEndBeat(project)];
}

let lamePromise = null;
function loadLame() {
  if (window.lamejs?.Mp3Encoder) return Promise.resolve(window.lamejs);
  if (!lamePromise) {
    lamePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/lamejs/lame.min.js', import.meta.url).href;
      s.onload = () => (window.lamejs?.Mp3Encoder ? resolve(window.lamejs) : reject(new Error('MP3-Encoder nicht verfügbar')));
      s.onerror = () => { lamePromise = null; reject(new Error('MP3-Encoder konnte nicht geladen werden')); };
      document.head.append(s);
    });
  }
  return lamePromise;
}

const toInt16 = (f) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
};

export async function encodeMp3(buffer, { kbps = 192, onProgress } = {}) {
  const lame = await loadLame();
  const enc = new lame.Mp3Encoder(2, buffer.sampleRate, kbps);
  const l = toInt16(buffer.getChannelData(0));
  const r = toInt16(buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0));
  const chunks = [];
  const block = 1152 * 20;
  for (let i = 0; i < l.length; i += block) {
    const out = enc.encodeBuffer(l.subarray(i, i + block), r.subarray(i, i + block));
    if (out.length) chunks.push(new Uint8Array(out));
    if ((i / block) % 20 === 0) {
      onProgress?.(i / l.length);
      await new Promise((res) => setTimeout(res)); // Oberfläche reaktionsfähig halten
    }
  }
  const end = enc.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(chunks, { type: 'audio/mpeg' });
}

export function peakOf(buffer) {
  let p = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) { const a = Math.abs(v); if (a > p) p = a; }
  return p;
}

// Zutatenliste für den WAV-Kommentar (ICMT, höchstens 2000 Zeichen): Kopf und Summe zuerst, dann so viele Zeilen wie passen
export function infoOf(project, library, { app = 'Krachwerk' } = {}) {
  const z = ingredients(project, library, { app });
  const out = [z.head, z.summary];
  let len = out.join('\n').length;
  let i = 0;
  for (; i < z.lines.length; i++) {
    if (len + 1 + z.lines[i].length > INFO_MAX - 24) break;
    out.push(z.lines[i]);
    len += 1 + z.lines[i].length;
  }
  if (i < z.lines.length) out.push(`… und ${z.lines.length - i} weitere`);
  return { title: project.name || '', software: app, comment: out.join('\n'), list: z };
}

// format: 'wav' (16 Bit) | 'wav24' | 'wav32' (Gleitkomma) | 'mp3'; range: 'song' | 'loop'; mastering: mit Mastering (Standard: wie im Projekt eingeschaltet)
export async function exportSong(project, library, { format = 'wav', range = 'song', tail = true, mastering = masteringOf(project).on, info = null, onProgress } = {}) {
  const [fromBeat, toBeat] = exportRange(project, range);
  if (toBeat <= fromBeat) throw new Error('Im Song liegen noch keine Clips – es gibt nichts zu exportieren.');
  const renderShare = format === 'mp3' ? 0.5 : 0.95;
  await library.ensureProject?.(project);
  const tailSeconds = tail ? EXPORT_TAIL : 0;
  // Mastering: erst den Bereich analysieren (Ziellautheit), dann mit diesen Verstärkungen über dieselbe Kette rendern
  const master = mastering && masteringOf(project).on;
  const share = master ? 0.35 : 0;
  let gains = false;
  let analysis = null;
  if (master) {
    analysis = await analyzeMastering(project, library, { fromBeat, toBeat, tailSeconds, onProgress: (p) => onProgress?.(p * share * renderShare) });
    gains = analysis ? { pre: analysis.pre, drive: analysis.drive } : false;
  }
  const audio = await renderProject(project, library, {
    fromBeat, toBeat, tailSeconds, limiter: true, compensate: true, mastering: gains,
    onProgress: (p) => onProgress?.((share + p * (1 - share)) * renderShare),
  });
  const blob = format === 'mp3'
    ? await encodeMp3(audio, { onProgress: (p) => onProgress?.(renderShare + p * (1 - renderShare)) })
    : encodeWav(audio, { bits: wavBits(format), info });
  onProgress?.(1);
  return { blob, duration: audio.duration, peak: peakOf(audio), fromBeat, toBeat, analysis, audio };
}

// ---------- Einzelspuren (Stems) ----------

// Spuren mit eigenem Anteil am Mix im Bereich: nicht stumm (Solo zählt nicht), Fader über 0, ein hörbarer Clip im Bereich
export function stemTracks(project, fromBeat, toBeat) {
  const audible = audibleMap(project);
  return project.tracks.filter((t) => trackLevel({ ...t, ...trackState(project, t) }, false) !== 0 && t.clips.some((c) =>
    (audible.get(c.id) ?? [[c.startBeat, c.startBeat + c.lengthBeats]]).some(([a, b]) => a < toBeat - EPS && b > fromBeat + EPS)));
}

// „01 Drums“: Position im Arranger und Spurname, sicher für Dateisysteme
export function stemName(project, track) {
  const n = project.tracks.indexOf(track) + 1;
  const name = String(track.name || '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim() || `Spur ${n}`;
  return `${String(n).padStart(2, '0')} ${name}`;
}

const aborted = () => Object.assign(new Error('Export abgebrochen.'), { code: 'aborted' });

// Eine Datei je Spur in einer ZIP-Datei. withMaster: false = ohne Master-Kette (Summe der Stems = Mix ohne Master),
// true = jede Spur durch Master-Effekte, Fader, Summen-Kurve, Limiter und (falls gewählt) Mastering mit den Verstärkungen
// des ganzen Songs. onProgress(p, { index, count, name, phase: 'render' | 'encode' }); signal bricht zwischen Spuren ab.
export async function exportStems(project, library, { format = 'wav', range = 'song', tail = true, withMaster = false, mastering = masteringOf(project).on, onProgress, signal } = {}) {
  const [fromBeat, toBeat] = exportRange(project, range);
  if (toBeat <= fromBeat) throw new Error('Im Song liegen noch keine Clips – es gibt nichts zu exportieren.');
  const tracks = stemTracks(project, fromBeat, toBeat);
  if (!tracks.length) throw new Error('Keine hörbare Spur im Bereich – alle stumm oder leer.');
  await library.ensureProject?.(project);
  const tailSeconds = tail ? EXPORT_TAIL : 0;
  const master = withMaster && mastering && masteringOf(project).on;
  const share = master ? 0.15 : 0;
  let gains = false;
  let analysis = null;
  if (master) {
    analysis = await analyzeMastering(project, library, { fromBeat, toBeat, tailSeconds, onProgress: (p) => onProgress?.(p * share, { index: 0, count: tracks.length, name: '', phase: 'analyze' }) });
    gains = analysis ? { pre: analysis.pre, drive: analysis.drive } : false;
  }
  const renderShare = format === 'mp3' ? 0.5 : 0.95;
  const files = [];
  const stems = [];
  let duration = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (signal?.aborted) throw aborted();
    const track = tracks[i];
    const name = `${stemName(project, track)}.${fileExt(format)}`;
    const step = (p, phase) => onProgress?.(share + (1 - share) * (i + p) / tracks.length, { index: i, count: tracks.length, name, phase });
    const audio = await renderProject(project, library, {
      fromBeat, toBeat, tailSeconds, onlyTrack: track.id, master: withMaster,
      limiter: withMaster, compensate: withMaster, mastering: withMaster ? gains : false,
      onProgress: (p) => step(p * renderShare, 'render'),
    });
    if (signal?.aborted) throw aborted();
    const blob = format === 'mp3'
      ? await encodeMp3(audio, { onProgress: (p) => step(renderShare + p * (1 - renderShare), 'encode') })
      : encodeWav(audio, { bits: wavBits(format) });
    files.push({ name, data: blob, crc: crc32(new Uint8Array(await blob.arrayBuffer())), size: blob.size });
    stems.push({ name, trackId: track.id, peak: peakOf(audio) });
    duration = audio.duration;
  }
  if (signal?.aborted) throw aborted();
  onProgress?.(1, { index: tracks.length - 1, count: tracks.length, name: '', phase: 'done' });
  return { blob: makeZip(files), stems, duration, fromBeat, toBeat, analysis, peak: Math.max(...stems.map((x) => x.peak)) };
}
