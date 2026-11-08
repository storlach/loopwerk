// Eigene Sounds (Importe, Aufnahmen, bearbeitete Sounds): im Browser in IndexedDB gespeichert
// und beim Speichern eines Projekts in die Projektdatei eingebettet, damit es vollständig bleibt.

import { decodeAudio } from './samples.js';
import { encodeWav } from './wav.js';
import { clipSampleIds, isValidProject, remapSampleIds } from './model.js';
import { crc32, makeZip, readZipBlob, ZIP_TOO_BIG, ZIP_PACKED } from './zip.js';
import { MANIFEST, buildManifest, parseManifest, planImport, soundFile, soundMeta, songFileName } from './archive.js';

const STORE = 'sounds';
const MAX_SECONDS = 480;
const KEY_SECONDS = 90;

// Eine Datenbank je Edition (Loopwerk „loopwerk“, Krachwerk „loopwerk-make“), gleiches Schema
const dbs = new Map();
function db(name) {
  if (!dbs.has(name)) {
    dbs.set(name, new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => { dbs.delete(name); throw err; }));
  }
  return dbs.get(name);
}

function txOn(name, mode, fn) {
  return db(name).then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  }));
}

const newId = () => 'own-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Eigene Sounds: „own-…“ (Loopwerk, Krachwerk) und „mk-…“ (Aufnahmen aus der früheren Krachwerk-Pad-Wand)
export const isOwnId = (id) => /^(own|mk)-/.test(String(id));

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
// Herkunft für die Kiste (Krachwerk): Mikrofon, Datei oder Schleife; Felder aus der Pad-Wand (cls, tags, bars) verstanden.
// group: Takes einer Aufnahme (takeGroup, Krachwerk 3c) – die Kiste faltet sie
function makeMeta(rec) {
  const from = rec.from || (rec.cls === 'loop' ? 'loop' : /^Import/.test(rec.source || '') ? 'file' : 'mic');
  const m = { cls: rec.cls ?? null, tags: rec.tags ?? [], from };
  if (rec.takeGroup) m.group = rec.takeGroup;
  // Festgehalten (ADR 011): Wurzeln der Quellen, nur für den Stammbaum
  if (Array.isArray(rec.bounceOf) && rec.bounceOf.length) m.bounceOf = rec.bounceOf.slice(0, 16);
  return m;
}

function toSample(rec, orig, duration = orig?.duration) {
  const loop = rec.kind === 'loop' || rec.cls === 'loop';
  const s = {
    id: rec.id,
    name: rec.name,
    category: 'own',
    kind: loop ? 'loop' : 'oneshot',
    beats: rec.beats || (rec.bars ? rec.bars * 4 : null),
    made: makeMeta(rec),
    origin: 'Eigene',
    source: rec.source || '',
    license: null,
    created: rec.created ?? null,
    material: rec.material ?? null, // zuletzt gewählte Herkunft: nur Vorschlag (Rezept gewinnt)
    orig,
    duration,
    // Erkannte Tonart („Am“, „C“; null = keine bzw. noch nicht erkannt), keyDone: Erkennung gelaufen
    keyAuto: rec.key ?? null,
    keyConf: rec.keyConf ?? null,
    keyDone: !!rec.keyDone,
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
  constructor(library, { db = 'loopwerk' } = {}) {
    this.library = library;
    this.dbName = db;
    this.available = typeof indexedDB !== 'undefined';
    this.keyJobs = new Map(); // id → laufende Tonart-Erkennung
  }

  // Tonart erkennen (Rechen-Worker), im Sound und dauerhaft im Datensatz vermerken. Läuft im Hintergrund.
  detectKey(sample) {
    if (!sample?.orig || this.keyJobs.has(sample.id)) return this.keyJobs.get(sample?.id) ?? Promise.resolve(null);
    const job = (async () => {
      const { runJob } = await import('./dsp/run.js');
      const n = Math.min(sample.orig.length, Math.round(KEY_SECONDS * sample.orig.sampleRate)); // reicht für die Tonart
      const chs = Array.from({ length: sample.orig.numberOfChannels }, (_, c) => sample.orig.getChannelData(c).subarray(0, n));
      const r = await runJob('key', { chs, sampleRate: sample.orig.sampleRate });
      Object.assign(sample, { keyAuto: r.key ?? null, keyConf: r.key ? r.confidence : null, keyDone: true });
      await this.library.applySoundKeys();
      this.library.emit();
      if (this.available) {
        try {
          const rec = await this.tx('readonly', (s) => s.get(sample.id));
          if (rec) await this.tx('readwrite', (s) => s.put({ ...rec, key: sample.keyAuto, keyConf: sample.keyConf, keyDone: true }));
        } catch { /* nur für diese Sitzung */ }
      }
      return sample.keyAuto;
    })().catch((err) => { console.warn('Tonart-Erkennung:', err?.message || err); return null; })
      .finally(() => this.keyJobs.delete(sample.id));
    this.keyJobs.set(sample.id, job);
    return job;
  }

  // Alle laufenden Erkennungen (Tests, Export)
  keysReady() { return Promise.all([...this.keyJobs.values()]); }

  tx(mode, fn) { return txOn(this.dbName, mode, fn); }

  async loadAll() {
    if (!this.available) return 0;
    try {
      // Nur Name und Länge sofort (Start bleibt schnell, egal wie viele Aufnahmen); dekodiert wird beim ersten Gebrauch
      const recs = await this.tx('readonly', (s) => s.getAll());
      for (const rec of recs || []) {
        const had = this.library.get(rec.id);
        if (had && !had.missing) continue;
        this._stub(rec);
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

  // Sound auf Abruf aus einem Datensatz (Name und Länge sofort, dekodiert beim ersten Gebrauch). mem: WAV ohne Speicher
  _stub(rec, mem = null) {
    const sample = toSample(rec, null, wavDuration(rec.wav) ?? undefined);
    sample.bytes = rec.wav?.byteLength ?? null;
    this.library.stub(sample, async (x) => {
      const r = mem ? { wav: mem } : await this.tx('readonly', (st) => st.get(x.id));
      if (!r?.wav) throw new Error('nicht mehr im Browser gespeichert');
      x.orig = await decodeAudio(r.wav.slice(0), { keepMono: true });
      x.duration = x.orig.duration;
      if (x.kind === 'loop' && x.beats) x.bpm = Math.round((x.beats * 60 / x.duration) * 100) / 100;
      // Sounds von vor der Tonart-Erkennung: beim ersten Gebrauch nachholen
      if (!x.keyDone) this.detectKey(x);
    });
    if (sample.duration && !sample.beats) sample.lengthBeats = Math.max(1, Math.ceil(sample.duration / (60 / this.library.bpm) - 1e-6));
    return sample;
  }

  // Neuen eigenen Sound anlegen (aus Puffer) und dauerhaft speichern
  // cls/tags/from: optionale Herkunft und Einordnung (Krachwerk); landen auch in der Projektdatei
  // key/keyConf/keyDone: schon erkannte Tonart (Projektdatei); sonst wird sie im Hintergrund erkannt
  async create({ name, buffer, kind = 'oneshot', beats = null, source = '', id = newId(), cls, tags, from, key, keyConf, keyDone, takeGroup, bounceOf }) {
    if (buffer.duration > MAX_SECONDS) throw new Error(`„${name}“ ist länger als ${MAX_SECONDS / 60} Minuten – bitte vorher kürzen.`);
    const wav = await encodeWav(buffer).arrayBuffer();
    const rec = { id, name, kind, beats, source, wav, created: Date.now() };
    if (cls != null) rec.cls = cls;
    if (tags) rec.tags = tags;
    if (from) rec.from = from;
    if (takeGroup) rec.takeGroup = takeGroup;
    if (Array.isArray(bounceOf) && bounceOf.length) rec.bounceOf = bounceOf.slice(0, 16);
    if (keyDone) Object.assign(rec, { key: key ?? null, keyConf: keyConf ?? null, keyDone: true });
    const sample = await this.library.add(toSample(rec, buffer));
    sample.bytes = wav.byteLength;
    if (this.available) {
      askPersist();
      try { await this.tx('readwrite', (s) => s.put(rec)); } catch (err) {
        this.available = false;
        console.warn('Eigener Sound nur für diese Sitzung gespeichert:', err?.message || err);
      }
    }
    if (!sample.keyDone) this.detectKey(sample);
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

  // Zuletzt gesetztes Material als Vorschlag am Datensatz merken (außerhalb von Rückgängig, nur Vorbelegung)
  async rememberMaterial(id, material) {
    const s = this.library.get(id);
    if (!s || s.parentId || s.category !== 'own') return;
    s.material = material;
    if (!this.available) return;
    try {
      await this.tx('readwrite', (st) => new Promise((res) => {
        const g = st.get(id);
        g.onsuccess = () => { if (g.result) st.put({ ...g.result, material }); res(); };
        g.onerror = () => res();
      }));
    } catch { /* egal */ }
  }

  async remove(id) {
    this.library.remove(id);
    if (this.available) { try { await this.tx('readwrite', (s) => s.delete(id)); } catch { /* egal */ } }
  }

  // Für die Projektdatei: alle im Projekt benutzten eigenen Sounds als Base64-WAV, dazu die Eltern-Sounds benutzter
  // Varianten (Klang-Rezept, ADR 010) – die haben kein eigenes Audio
  async embed(project) {
    const ids = project.tracks.flatMap((t) => t.clips.flatMap(clipSampleIds)); // inaktive Takes gehören dazu
    const parents = ids.map((id) => project.recipes?.[id]?.parent).filter(Boolean);
    const used = new Set([...ids, ...parents].filter(isOwnId));
    const out = [];
    for (const id of used) {
      const s = await this.library.ensure(id).catch(() => null);
      if (!s?.orig) continue;
      const wav = new Uint8Array(await encodeWav(s.orig).arrayBuffer());
      let bin = '';
      for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
      const e = { id, name: s._baseName ?? s.name, kind: s.kind, beats: s.beats, source: s.source, wav: btoa(bin) };
      if (s.made?.cls != null) e.cls = s.made.cls;
      if (s.made?.tags?.length) e.tags = s.made.tags;
      if (s.made?.from) e.from = s.made.from;
      if (s.made?.group) e.takeGroup = s.made.group;
      if (s.made?.bounceOf?.length) e.bounceOf = s.made.bounceOf;
      if (s.keyDone) Object.assign(e, { key: s.keyAuto ?? null, keyConf: s.keyConf ?? null, keyDone: true });
      out.push(e);
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
      const buffer = await decodeAudio(bytes.buffer, { keepMono: true });
      await this.create({ id: e.id, name: e.name, buffer, kind: e.kind, beats: e.beats, source: e.source, cls: e.cls, tags: e.tags, from: e.from, takeGroup: e.takeGroup, key: e.key, keyConf: e.keyConf, keyDone: e.keyDone, bounceOf: e.bounceOf });
      n++;
    }
    return n;
  }

  // ---------- Sicherung als ZIP (ADR 012, Spec krachwerk-3 §5) ----------

  // Alle eigenen Sounds dieses Geräts: im Speicher, dazu die nur in dieser Sitzung (Speicher voll oder aus)
  async soundIds() {
    const keys = this.available ? await this.tx('readonly', (s) => s.getAllKeys()).catch(() => []) : [];
    const have = new Set(keys);
    const extra = this.library.list().filter((s) => s.category === 'own' && isOwnId(s.id) && !s.missing && !s.parentId && !have.has(s.id)).map((s) => s.id);
    return [...keys, ...extra];
  }

  // Ein Sound mit Metadaten und WAV, wie gespeichert (ohne Speicher: aus dem Original kodiert). Immer nur einer im Speicher.
  async readSound(id) {
    if (this.available) {
      const rec = await this.tx('readonly', (s) => s.get(id)).catch(() => null);
      if (rec?.wav) return { meta: soundMeta(rec), wav: rec.wav };
    }
    const s = this.library.get(id);
    if (!s || s.missing || s.category !== 'own' || s.parentId) return null;
    await this.library.ensure(id).catch(() => null);
    if (!s.orig) return null;
    const meta = { id, name: s._baseName ?? s.name, kind: s.kind, beats: s.beats, source: s.source, created: s.created ?? null };
    if (s.made?.cls != null) meta.cls = s.made.cls;
    if (s.made?.tags?.length) meta.tags = s.made.tags;
    if (s.made?.from) meta.from = s.made.from;
    if (s.made?.group) meta.takeGroup = s.made.group;
    if (s.made?.bounceOf?.length) meta.bounceOf = s.made.bounceOf;
    if (s.material) meta.material = s.material;
    if (s.keyDone) Object.assign(meta, { key: s.keyAuto ?? null, keyConf: s.keyConf ?? null, keyDone: true });
    return { meta, wav: await encodeWav(s.orig).arrayBuffer() };
  }

  async *eachSound(ids) {
    for (const id of ids ?? await this.soundIds()) {
      const r = await this.readSound(id);
      if (r) yield r;
    }
  }

  // ZIP bauen: Sounds (ids; ohne = alle), dazu der Song (project) und die Pads. Jeder Sound wird einzeln gelesen, als Blob
  // mit vorab berechneter CRC an makeZip gegeben und wieder losgelassen. → { blob, sounds, bytes }
  async exportArchive({ project = null, ids = null, pads, app = 'Loopwerk', kind = 'werkstatt', onProgress, signal } = {}) {
    const stop = () => { if (signal?.aborted) throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' }); };
    const list = ids ?? await this.soundIds();
    const files = [];
    const sounds = [];
    let bytes = 0;
    let done = 0;
    onProgress?.(0, list.length);
    for await (const { meta, wav } of this.eachSound(list)) {
      stop();
      const file = soundFile(meta.id);
      const crc = crc32(new Uint8Array(wav));
      files.push({ name: file, data: new Blob([wav], { type: 'audio/wav' }), crc, size: wav.byteLength });
      sounds.push({ ...meta, file, crc, bytes: wav.byteLength });
      bytes += wav.byteLength;
      onProgress?.(++done, list.length);
      await new Promise((r) => setTimeout(r, 40)); // Oberfläche und Blob-Ablage atmen lassen (kein Klangereignis)
    }
    stop();
    const enc = new TextEncoder();
    const songs = [];
    const songFiles = [];
    if (project) {
      const { ownSounds, ...song } = project;
      const file = songFileName(song.name);
      songs.push({ file, name: song.name || 'Song', current: true });
      songFiles.push({ name: file, data: enc.encode(JSON.stringify({ ...song, app }, null, 2)) });
    }
    const manifest = buildManifest({ app, kind, sounds, songs, pads });
    const blob = makeZip([{ name: MANIFEST, data: enc.encode(JSON.stringify(manifest, null, 2)) }, ...songFiles, ...files]);
    return { blob, sounds: sounds.length, bytes };
  }

  // Was es hier unter dieser ID gibt: { crc, bytes } (v1: CRC aus dem gespeicherten WAV), sonst null
  async localInfo(id) {
    const r = await this.readSound(id).catch(() => null);
    return r ? { crc: crc32(new Uint8Array(r.wav)), bytes: r.wav.byteLength } : null;
  }

  // Datensatz mit fertigem WAV speichern und als Sound auf Abruf anmelden (Zurückholen: kein Dekodieren, bitgleich)
  async putRecord(rec) {
    let mem = this.available ? null : rec.wav;
    if (this.available) {
      try { await this.tx('readwrite', (s) => s.put(rec)); } catch (err) {
        this.available = false;
        mem = rec.wav;
        console.warn('Eigener Sound nur für diese Sitzung gespeichert:', err?.message || err);
      }
    }
    return this._stub(rec, mem);
  }

  // ZIP zurückholen (Sicherung oder Song-ZIP). Nie überschreiben: Gleiches (ID + CRC) überspringen, Abweichendes unter neuer
  // ID anlegen und die Songs umschreiben. Bei einem Fehler wird nichts angelegt (schon Geschriebenes fällt wieder weg).
  // Fehler tragen code: nozip | nomanifest | crc | packed | big | bad.
  // → { added, skipped, untrashed, renamed, songs: [{ name, project, current }], pads, kind, app, map }
  async importArchive(blob, { onProgress } = {}) {
    const fail = (code, message) => Object.assign(new Error(message), { code });
    let zip;
    try { zip = await readZipBlob(blob); } catch (err) {
      throw fail(err.message === ZIP_TOO_BIG ? 'big' : /beschädigt/.test(err.message) ? 'crc' : 'nozip', err.message);
    }
    const read = async (e) => {
      try { return await zip.bytes(e); } catch (err) { throw fail(err.message === ZIP_PACKED ? 'packed' : 'crc', err.message); }
    };
    const dec = new TextDecoder();
    if (!zip.has(MANIFEST)) throw fail('nomanifest', 'werkstatt.json fehlt');
    let man;
    try { man = parseManifest(dec.decode(await read(zip.entry(MANIFEST)))); } catch (err) { throw err.code ? err : fail('bad', err.message); }
    // Songs zuerst prüfen (klein), dann die Sounds je einzeln
    const songs = [];
    for (const s of man.songs) {
      const e = zip.entry(s.file);
      if (!e) throw fail('bad', `${s.file} fehlt`);
      let project;
      try { project = JSON.parse(dec.decode(await read(e))); } catch (err) { throw err.code ? err : fail('bad', `${s.file} ist kein Song`); }
      if (!isValidProject(project)) throw fail('bad', `${s.file} ist kein Song dieser Version`);
      delete project.app;
      delete project.ownSounds;
      songs.push({ name: s.name || project.name, current: !!s.current, project });
    }
    const incoming = man.sounds.map((s) => {
      const e = zip.entry(s.file);
      if (!e) throw fail('bad', `${s.file} fehlt`);
      return { id: s.id, crc: e.crc, bytes: e.size, meta: s, entry: e };
    });
    const local = new Map();
    for (const s of incoming) { const l = await this.localInfo(s.id); if (l) local.set(s.id, l); }
    const plan = planImport(incoming, (id) => local.get(id) ?? (this.library.get(id) && !this.library.get(id).missing ? {} : null), newId);
    const byId = new Map(incoming.map((s) => [s.id, s]));
    const made = [];
    const out = { added: 0, skipped: 0, untrashed: 0, renamed: 0 };
    let done = 0;
    try {
      for (const st of plan.steps) {
        const s = byId.get(st.id);
        if (st.action === 'skip') out.skipped++;
        else if (st.action === 'untrash') { await this.untrash?.([st.id]); out.untrashed++; }
        else {
          const data = await read(s.entry);
          const wav = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.slice().buffer;
          if (wavDuration(wav) == null) throw fail('bad', `${s.entry.name} ist kein WAV`);
          const id = st.to ?? st.id;
          made.push({ id, had: this.library.get(id) ?? null });
          await this.putRecord({ ...soundMeta(s.meta), id, wav });
          if (st.action === 'rename') out.renamed++; else out.added++;
        }
        onProgress?.(++done, plan.steps.length);
        await new Promise((r) => setTimeout(r, 40));
      }
    } catch (err) {
      // Nichts halb anlegen: Geschriebenes wieder entfernen, vorige Platzhalter („Sound fehlt“) zurück
      for (const { id, had } of made.reverse()) {
        if (this.available) { try { await this.tx('readwrite', (st) => st.delete(id)); } catch { /* egal */ } }
        this.library.remove(id);
        if (had) this.library.samples.set(id, had);
      }
      this.library.emit();
      throw err.code ? err : fail('bad', err.message);
    }
    if (made.length) { askPersist(); this.library.emit(); }
    return { ...out, songs: songs.map((s) => ({ ...s, project: remapSampleIds(s.project, plan.map) })), pads: man.pads ?? null, kind: man.kind ?? null, app: man.app ?? null, map: plan.map };
  }
}

