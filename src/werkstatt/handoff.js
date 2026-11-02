// Mitnehmen: Krachwerk → Loopwerk-Projektdatei (gleiches Format wie „Speichern“ in Loopwerk, PROJECT_VERSION 1).
// Schleifen liegen nacheinander auf einer Spur (je 4 Takte), alle Pads kommen als eigene Sounds mit („Eigene“, pink).
// Kein geteilter Speicher: Loopwerk übernimmt die Sounds erst beim Öffnen der Datei.

import { createEmptyProject, KEYS } from '../model.js';
import { encodeWav } from '../wav.js';

export const LOOP_BARS_IN_SONG = 4;

function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Loopwerk kennt Tonarten als Moll (KEYS, Index = Grundton); Dur über die parallele Moll-Tonart
export const loopwerkKey = (root, mode) => KEYS[mode === 'dur' ? (root + 9) % 12 : root];

// sounds: [{ id, name, buffer, loop, bars }] (loop = Schleife, sonst Einzelklang), Reihenfolge = Pads
export async function buildHandoff({ name, bpm, root, mode, sounds }) {
  const project = createEmptyProject();
  project.name = name;
  project.bpm = bpm;
  project.key = loopwerkKey(root, mode);
  project.tracks.length = 4;
  project.tracks[0].name = 'Krachwerk';
  project.tracks[1].name = 'Spur 2';
  let beat = 0, n = 0;
  const ownSounds = [];
  for (const s of sounds) {
    const id = `own-${s.id}`;
    const beats = s.loop ? (s.bars || 1) * 4 : null;
    const wav = new Uint8Array(await encodeWav(s.buffer).arrayBuffer());
    ownSounds.push({ id, name: s.name, kind: s.loop ? 'loop' : 'oneshot', beats, source: 'Krachwerk', wav: base64(wav) });
    if (s.loop) {
      const len = Math.max(beats, LOOP_BARS_IN_SONG * 4);
      project.tracks[0].clips.push({ id: 'c' + (++n), sampleId: id, startBeat: beat, lengthBeats: len, offsetBeats: 0 });
      beat += len;
    }
  }
  project.lengthBars = Math.max(8, Math.ceil(beat / 4) + 4);
  project.loop = { on: beat > 0, startBeat: 0, endBeat: Math.max(16, beat) };
  return { ...project, app: 'Krachwerk', ownSounds };
}

// Schleife als WAV, mindestens 4 Takte lang (wiederholt)
export function repeatToBars(buffer, bars, minBars = LOOP_BARS_IN_SONG) {
  const times = Math.max(1, Math.ceil(minBars / Math.max(1, bars)));
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length * times, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    const o = out.getChannelData(c);
    for (let k = 0; k < times; k++) o.set(d, k * buffer.length);
  }
  return out;
}
