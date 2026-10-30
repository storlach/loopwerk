// Klangdateien holen – gepackte (assets/packs, siehe tools/pack-assets.cjs) aus ihrem Paket, sonst direkt.
// Ein Paket wird nur einmal geladen; jede Datei darin ist eine vollständige WAV-Datei.

import { PACKS, PACKED } from './asset-packs.js';

const packs = new Map(); // Paket-URL → Promise<ArrayBuffer>

function loadPack(url) {
  if (!packs.has(url)) {
    packs.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.arrayBuffer();
    }).catch((err) => { packs.delete(url); throw err; }));
  }
  return packs.get(url);
}

// Liefert eine eigene Kopie der Bytes (decodeAudioData übernimmt den Puffer)
export async function fetchAsset(path) {
  const hit = PACKED[path];
  if (hit) {
    const [i, off, len] = hit;
    return (await loadPack(PACKS[i])).slice(off, off + len);
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.arrayBuffer();
}
