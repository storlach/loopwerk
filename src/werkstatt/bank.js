// Speicher der Werkstatt, getrennt von Loopwerk: eigene IndexedDB (EDITION.db) für die Klänge,
// Pad-Belegung in localStorage (EDITION.storageKey). Klänge als 16-Bit-WAV (mono, wenn L = R).

import { encodeWav } from '../wav.js';

export const PAD_COUNT = 16;
const STORE = 'sounds';

export function wavToChannels(ab) {
  const v = new DataView(ab);
  const ch = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  let o = 12;
  while (o + 8 <= v.byteLength && String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)) !== 'data') o += 8 + v.getUint32(o + 4, true);
  const len = Math.floor(v.getUint32(o + 4, true) / (2 * ch));
  const chs = Array.from({ length: ch }, () => new Float32Array(len));
  let p = o + 8;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++, p += 2) chs[c][i] = v.getInt16(p, true) / 0x8000;
  return { chs, sampleRate };
}

export function channelsToWav(chs, sampleRate) {
  const buffer = { numberOfChannels: chs.length, length: chs[0].length, sampleRate, getChannelData: (c) => chs[c] };
  return encodeWav(buffer).arrayBuffer();
}

const newId = () => 'mk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export class Bank {
  constructor({ db, storageKey }) {
    this.dbName = db;
    this.key = storageKey;
    this.dbp = null;
    this.available = typeof indexedDB !== 'undefined';
  }

  db() {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((err) => { this.dbp = null; throw err; });
    }
    return this.dbp;
  }

  tx(mode, fn) {
    return this.db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r?.result ?? r);
      t.onerror = () => reject(t.error);
    }));
  }

  // Pad-Belegung: Array(16) aus null | { sound: id } | { synth: { kit, row } }
  loadPads() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (Array.isArray(raw?.pads)) return Array.from({ length: PAD_COUNT }, (_, i) => raw.pads[i] ?? null);
    } catch { /* leer anfangen */ }
    return Array(PAD_COUNT).fill(null);
  }

  savePads(pads) {
    try { localStorage.setItem(this.key, JSON.stringify({ v: 1, pads })); } catch { /* Speicher voll oder gesperrt */ }
  }

  // Klang speichern; meta: { name, tags, cls, centroid, pitch, source, parent }
  async put(chs, sampleRate, meta) {
    const rec = { id: newId(), created: Date.now(), ...meta, sampleRate, wav: await channelsToWav(chs, sampleRate) };
    if (this.available) {
      try { await this.tx('readwrite', (s) => s.put(rec)); } catch (err) {
        this.available = false;
        console.warn('Klang nur für diese Sitzung gespeichert:', err?.message || err);
      }
    }
    return rec;
  }

  async get(id) {
    if (!this.available) return null;
    try { return (await this.tx('readonly', (s) => s.get(id))) ?? null; } catch { return null; }
  }
}
