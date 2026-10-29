// Eigene Sounds (Importe, Aufnahmen, bearbeitete Sounds): im Browser in IndexedDB gespeichert
// und beim Speichern eines Projekts in die Projektdatei eingebettet, damit es vollständig bleibt.

import { decodeAudio } from './samples.js';
import { encodeWav } from './wav.js';

const DB_NAME = 'loopwerk';
const STORE = 'sounds';
const MAX_SECONDS = 480;

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => { dbPromise = null; throw err; });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  }));
}

const newId = () => 'own-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function channelsToBuffer(chs, sampleRate) {
  const b = new AudioBuffer({ numberOfChannels: chs.length, length: Math.max(1, chs[0].length), sampleRate });
  chs.forEach((d, c) => b.copyToChannel(d, c));
  return b;
}

export function bufferToChannels(buffer) {
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
}

// Library-Eintrag aus Datensatz
function toSample(rec, orig) {
  const s = {
    id: rec.id,
    name: rec.name,
    category: 'own',
    kind: rec.kind === 'loop' ? 'loop' : 'oneshot',
    beats: rec.beats || null,
    origin: 'Eigene',
    source: rec.source || '',
    license: null,
    orig,
    duration: orig.duration,
  };
  if (s.kind === 'loop' && s.beats) s.bpm = Math.round((s.beats * 60 / orig.duration) * 100) / 100;
  return s;
}

export class OwnSounds {
  constructor(library) {
    this.library = library;
    this.available = typeof indexedDB !== 'undefined';
  }

  async loadAll() {
    if (!this.available) return 0;
    try {
      const recs = await tx('readonly', (s) => s.getAll());
      for (const rec of recs || []) {
        if (this.library.get(rec.id)) continue;
        const orig = await decodeAudio(rec.wav.slice(0));
        await this.library.add(toSample(rec, orig));
      }
      return recs?.length ?? 0;
    } catch (err) {
      this.available = false;
      console.warn('Eigene Sounds konnten nicht geladen werden:', err?.message || err);
      return 0;
    }
  }

  // Neuen eigenen Sound anlegen (aus Puffer) und dauerhaft speichern
  async create({ name, buffer, kind = 'oneshot', beats = null, source = '', id = newId() }) {
    if (buffer.duration > MAX_SECONDS) throw new Error(`„${name}“ ist länger als ${MAX_SECONDS / 60} Minuten – bitte vorher kürzen.`);
    const wav = await encodeWav(buffer).arrayBuffer();
    const rec = { id, name, kind, beats, source, wav, created: Date.now() };
    const sample = await this.library.add(toSample(rec, buffer));
    if (this.available) {
      try { await tx('readwrite', (s) => s.put(rec)); } catch (err) {
        this.available = false;
        console.warn('Eigener Sound nur für diese Sitzung gespeichert:', err?.message || err);
      }
    }
    return sample;
  }

  async importFile(file) {
    let buffer;
    try {
      buffer = await decodeAudio(await file.arrayBuffer());
    } catch (err) {
      // Typ und Fehler nennen: hilft bei Formaten, die dieser Browser nicht kennt (z. B. manche .m4a/.amr)
      const kind = file.type || file.name.split('.').pop() || 'unbekannt';
      console.warn('Import fehlgeschlagen:', file.name, kind, err?.name, err?.message);
      throw new Error(`„${file.name}“ (${kind}) kann dieser Browser nicht lesen. WAV und MP3 gehen überall; sonst die Datei vorher umwandeln.`);
    }
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Import';
    return this.create({ name, buffer, source: `Import: ${file.name}` });
  }

  async remove(id) {
    this.library.remove(id);
    if (this.available) { try { await tx('readwrite', (s) => s.delete(id)); } catch { /* egal */ } }
  }

  // Für die Projektdatei: alle im Projekt benutzten eigenen Sounds als Base64-WAV
  async embed(project) {
    const used = new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId)).filter((id) => id.startsWith('own-')));
    const out = [];
    for (const id of used) {
      const s = this.library.get(id);
      if (!s?.orig) continue;
      const wav = new Uint8Array(await encodeWav(s.orig).arrayBuffer());
      let bin = '';
      for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
      out.push({ id, name: s.name, kind: s.kind, beats: s.beats, source: s.source, wav: btoa(bin) });
    }
    return out;
  }

  // Aus der Projektdatei: fehlende eigene Sounds wiederherstellen
  async restore(list = []) {
    let n = 0;
    for (const e of list) {
      if (this.library.get(e.id)) continue;
      const bin = atob(e.wav);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buffer = await decodeAudio(bytes.buffer);
      await this.create({ id: e.id, name: e.name, buffer, kind: e.kind, beats: e.beats, source: e.source });
      n++;
    }
    return n;
  }
}
