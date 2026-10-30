// Export des Songs als WAV oder MP3. Gerendert wird offline mit derselben Signalkette wie beim Abspielen.
// MP3 mit LAME (lamejs, LGPL-3.0, lame.sourceforge.net) – wird erst beim ersten MP3-Export geladen.

import { renderProject } from './engine.js';
import { encodeWav } from './wav.js';

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

// format: 'wav' | 'mp3'; range: 'song' | 'loop'
export async function exportSong(project, library, { format = 'wav', range = 'song', tail = true, onProgress } = {}) {
  const [fromBeat, toBeat] = exportRange(project, range);
  if (toBeat <= fromBeat) throw new Error('Im Song liegen noch keine Clips – es gibt nichts zu exportieren.');
  const renderShare = format === 'mp3' ? 0.5 : 0.95;
  await library.ensureProject?.(project);
  const audio = await renderProject(project, library, {
    fromBeat, toBeat, tailSeconds: tail ? EXPORT_TAIL : 0, limiter: true, compensate: true,
    onProgress: (p) => onProgress?.(p * renderShare),
  });
  const blob = format === 'mp3'
    ? await encodeMp3(audio, { onProgress: (p) => onProgress?.(renderShare + p * (1 - renderShare)) })
    : encodeWav(audio);
  onProgress?.(1);
  return { blob, duration: audio.duration, peak: peakOf(audio), fromBeat, toBeat };
}
