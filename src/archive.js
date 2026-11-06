// Sicherung und Song-Datei als ZIP (ADR 012, Spec krachwerk-3 §5), Format „loopwerk-werkstatt“ Version 1:
//   werkstatt.json  { format, version, app, kind, created, sounds:[{ …Metadaten, file, crc, bytes }], songs:[{ file, name, current }], pads? }
//   sounds/<id>.wav 16-Bit-WAV wie gespeichert
//   songs/<name>.json Projekt-JSON (Version 1) ohne ownSounds
// Hier nur reine Teile (in Node testbar): Manifest bauen und prüfen, Auswahl der Sounds eines Songs, Konflikt-Plan.

import { clipSampleIds } from './model.js';

export const ARCHIVE_FORMAT = 'loopwerk-werkstatt';
export const ARCHIVE_VERSION = 1;
export const MANIFEST = 'werkstatt.json';

// Eigene Sounds: „own-…“ und „mk-…“ (frühere Pad-Wand); gleiche Regel wie in own-sounds.js
const isOwn = (id) => /^(own|mk)-/.test(String(id));

// Dateiname im ZIP: nur ASCII (manche Entpacker kennen kein UTF-8), Umlaute ausgeschrieben
const UMLAUT = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
export function songFileName(name, taken = new Set()) {
  const base = (String(name || 'Song').replace(/[äöüÄÖÜß]/g, (c) => UMLAUT[c]).normalize('NFKD').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)) || 'Song';
  let file = `songs/${base}.json`;
  for (let i = 2; taken.has(file); i++) file = `songs/${base}-${i}.json`;
  taken.add(file);
  return file;
}
export const soundFile = (id) => `sounds/${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}.wav`;

// Alle eigenen Sounds, die ein Song braucht: Clips (auch inaktive Takes) und die Eltern benutzter Varianten (wie embed)
export function songSoundIds(project) {
  const ids = (project?.tracks || []).flatMap((t) => (t.clips || []).flatMap(clipSampleIds));
  const parents = ids.map((id) => project.recipes?.[id]?.parent).filter(Boolean);
  return [...new Set([...ids, ...parents])].filter(isOwn);
}

// Metadaten eines Datensatzes fürs Manifest: alles außer dem Audio und dem Papierkorb-Vermerk
export function soundMeta(rec) {
  const { wav, trashedAt, file, crc, bytes, ...meta } = rec || {};
  return meta;
}

export function buildManifest({ app, kind = 'werkstatt', created = new Date().toISOString(), sounds = [], songs = [], pads }) {
  const m = { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, app, kind, created, sounds, songs };
  if (pads != null) m.pads = pads;
  return m;
}

// Manifest prüfen; wirft mit einem Satz für den Einblender
export function parseManifest(text) {
  let m;
  try { m = JSON.parse(text); } catch { throw new Error('werkstatt.json ist kaputt'); }
  if (!m || m.format !== ARCHIVE_FORMAT) throw new Error('keine Krachwerk-Sicherung');
  if (!Number.isInteger(m.version) || m.version > ARCHIVE_VERSION) throw new Error('von einer neueren Version – erst die App aktualisieren');
  const sounds = Array.isArray(m.sounds) ? m.sounds.filter((s) => s && isOwn(s.id) && typeof s.file === 'string') : [];
  const songs = Array.isArray(m.songs) ? m.songs.filter((s) => s && typeof s.file === 'string') : [];
  return { ...m, sounds, songs };
}

// Konflikt-Plan beim Zurückholen (§5): nie überschreiben.
// incoming: [{ id, crc, bytes }] (crc/bytes der Datei im ZIP); local(id) → null | { crc?, bytes?, trashed? }
// newId() → frische own-ID. Ergebnis je Sound: 'create' | 'skip' | 'untrash' | 'rename' (mit to), dazu map alt → neu.
export function planImport(incoming, local, newId) {
  const steps = [];
  const map = new Map();
  const used = new Set();
  for (const s of incoming) {
    const here = local(s.id);
    if (!here) { steps.push({ id: s.id, action: 'create' }); continue; }
    const same = here.crc != null && s.crc != null ? here.crc === s.crc : here.bytes != null && here.bytes === s.bytes;
    if (same) { steps.push({ id: s.id, action: here.trashed ? 'untrash' : 'skip' }); continue; }
    let to;
    do to = newId(); while (used.has(to) || local(to));
    used.add(to);
    map.set(s.id, to);
    steps.push({ id: s.id, action: 'rename', to });
  }
  return { steps, map };
}
