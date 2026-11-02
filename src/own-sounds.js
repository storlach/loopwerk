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

// Länge einer WAV-Datei aus dem Kopf lesen, ohne sie zu dekodieren (eigene Sounds sind PCM-WAV aus encodeWav)
export function wavDuration(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint32(0, false) !== 0x52494646) return null; // „RIFF“
    let pos = 12, rate = 0, block = 0;
    while (pos + 8 <= v.byteLength) {
      const id = v.getUint32(pos, false), size = v.getUint32(pos + 4, true);
      if (id === 0x666d7420) { rate = v.getUint32(pos + 12, true); block = v.getUint16(pos + 20, true); } // „fmt “
      if (id === 0x64617461) return rate && block ? Math.min(size, v.byteLength - pos - 8) / block / rate : null; // „data“
      pos += 8 + size + (size & 1);
    }
  } catch { /* kein WAV */ }
  return null;
}

// Library-Eintrag aus Datensatz (orig fehlt bei Einträgen auf Abruf; dann zählt die Länge aus dem WAV-Kopf)
function toSample(rec, orig, duration = orig?.duration) {
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
    duration,
  };
  if (s.kind === 'loop' && s.beats && duration) s.bpm = Math.round((s.beats * 60 / duration) * 100) / 100;
  return s;
}

// Browser bitten, die eigenen Sounds nicht bei Platzmangel oder nach Wochen ohne Besuch zu löschen (iOS: 7 Tage)
let persistAsked = false;
export function askPersist() {
  if (persistAsked || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persisted?.().then((on) => (on ? null : navigator.storage.persist())).catch(() => {});
}

export class OwnSounds {
  constructor(library) {
    this.library = library;
    this.available = typeof indexedDB !== 'undefined';
  }

  async loadAll() {
    if (!this.available) return 0;
    try {
      // Nur Name und Länge sofort (Start bleibt schnell, egal wie viele Aufnahmen); dekodiert wird beim ersten Gebrauch
      const recs = await tx('readonly', (s) => s.getAll());
      for (const rec of recs || []) {
        const had = this.library.get(rec.id);
        if (had && !had.missing) continue;
        const sample = toSample(rec, null, wavDuration(rec.wav) ?? undefined);
        this.library.stub(sample, async (x) => {
          const r = await tx('readonly', (st) => st.get(x.id));
          if (!r?.wav) throw new Error('nicht mehr im Browser gespeichert');
          x.orig = await decodeAudio(r.wav.slice(0));
          x.duration = x.orig.duration;
          if (x.kind === 'loop' && x.beats) x.bpm = Math.round((x.beats * 60 / x.duration) * 100) / 100;
        });
        if (sample.duration && !sample.beats) sample.lengthBeats = Math.max(1, Math.ceil(sample.duration / (60 / this.library.bpm) - 1e-6));
      }
      if (recs?.length) askPersist();
      if (recs?.length) this.library.emit();
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
      askPersist();
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
      const s = await this.library.ensure(id).catch(() => null);
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
      // Platzhalter („Sound fehlt“) wird durch den Sound aus der Datei ersetzt
      const had = this.library.get(e.id);
      if (had && !had.missing) continue;
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
