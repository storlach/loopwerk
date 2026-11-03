// Sicherung der eigenen Sounds (ADR 011): ZIP ohne Kompression mit sounds.json (Liste der meta-Einträge) und
// sounds/<id>.wav (gespeicherte Bytes, bitgleich). Große Bestände in Teilen (Handy-Speicher). Zurückholen überspringt
// vorhandene IDs; unbekannte Felder in sounds.json bleiben am Datensatz erhalten.

import { makeZip, readZip } from './zip.js';

export const PART_LIMIT = 200 * 1024 * 1024;
const FORMAT = 1;

// Dateiname: „krachwerk-sounds-2026-11-03.zip“, bei Teilen „…-teil-2-von-3.zip“
export function backupName(app = 'Loopwerk', date = new Date(), part = 1, parts = 1) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${String(app).toLowerCase()}-sounds-${day}${parts > 1 ? `-teil-${part}-von-${parts}` : ''}.zip`;
}

// Alle eigenen Sounds als ZIP-Teile (Blob[]); jeder Teil ist für sich lesbar. limit: Bytes je Teil (ein einzelner größerer
// Sound bekommt einen eigenen Teil).
export async function backupSounds(own, { limit = PART_LIMIT } = {}) {
  const metas = (await own.listMeta()).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  const enc = new TextEncoder();
  const blobs = [];
  let files = [], list = [], size = 0;
  const flush = () => {
    if (!list.length) return;
    blobs.push(makeZip([{ name: 'sounds.json', data: enc.encode(JSON.stringify({ format: FORMAT, sounds: list }, null, 1)) }, ...files]));
    files = []; list = []; size = 0;
  };
  for (const m of metas) {
    const wav = await own.readWav(m.id);
    if (!wav) continue;
    const data = new Uint8Array(wav);
    if (size && size + data.length > limit) flush();
    files.push({ name: `sounds/${m.id}.wav`, data });
    list.push(m);
    size += data.length;
  }
  flush();
  return blobs;
}

// ZIP-Teile (File/Blob/Uint8Array/ArrayBuffer) zurückholen. Rückgabe { added, skipped, failed }
export async function restoreSounds(own, files) {
  let added = 0, skipped = 0, failed = 0;
  for (const f of files) {
    const bytes = f instanceof Uint8Array ? f : new Uint8Array(f instanceof ArrayBuffer ? f : await f.arrayBuffer());
    const entries = readZip(bytes);
    const index = entries.find((e) => e.name === 'sounds.json');
    if (!index) throw new Error('Keine Sound-Sicherung (sounds.json fehlt)');
    const list = JSON.parse(new TextDecoder().decode(index.data))?.sounds || [];
    const wavs = new Map(entries.filter((e) => e.name.startsWith('sounds/')).map((e) => [e.name.slice(7).replace(/\.wav$/, ''), e]));
    let any = false;
    for (const m of list) {
      if (!m?.id) { failed++; continue; }
      const had = own.library.get(m.id);
      if ((had && !had.missing) || (await own.hasRecord(m.id))) { skipped++; continue; }
      const e = wavs.get(m.id);
      if (!e || !e.crcOk) { failed++; continue; }
      const wav = e.data.slice().buffer;
      const rec = await own.putRecord(m, wav);
      own.stubRecord(rec);
      added++;
      any = true;
    }
    if (any) own.library.emit();
  }
  return { added, skipped, failed };
}
