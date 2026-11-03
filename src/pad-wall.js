// Übernahme der Pad-Wand aus dem Krachwerk-Prototyp (Spec krachwerk-4-kit §3, ADR 012). Format laut Git-Geschichte von
// src/werkstatt/bank.js (fa3a044): localStorage[padsKey] = { v: 1, pads: Array(16) aus null | { sound: 'mk-…' } |
// { synth: { kit, row } } }. Tolerant gelesen (auch Listen von IDs oder { id } / { sampleId }); Synth-Pads fallen weg.
// Der Schlüssel bleibt liegen; die Vorlage verschwindet, sobald im Song ein Kit daraus stammt.

import { EDITION } from './edition.js';
import { PAD_IDS } from './grooves.js';

export const PAD_WALL_NAME = 'Pad-Wand';

// Sound-IDs in Pad-Reihenfolge (ohne leere und Synth-Pads, ohne Doppelte)
export function readPadsV1(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  const pads = Array.isArray(v) ? v : Array.isArray(v?.pads) ? v.pads : [];
  const out = [];
  for (const p of pads) {
    const id = typeof p === 'string' ? p : p && typeof p === 'object' ? p.sound ?? p.sampleId ?? p.id : null;
    if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
  }
  return out;
}

function stored(key) {
  try { return key ? localStorage.getItem(key) : null; } catch { return null; }
}

// Vorlage für die Kiste: { name, ids } mit den ersten 8 Pads, deren Sound da ist; null ohne Pad-Wand oder schon übernommen
export function padWallTemplate({ project, library, key = EDITION.padsKey }) {
  if (Object.values(project?.kits || {}).some((k) => k?.from === 'pads.v1')) return null;
  const ids = readPadsV1(stored(key)).filter((id) => { const s = library.get(id); return s && !s.missing; }).slice(0, PAD_IDS.length);
  return ids.length ? { name: PAD_WALL_NAME, ids } : null;
}

// Tipp auf die Vorlage: Kit „Pad-Wand“ (from 'pads.v1'), Pads in der Reihenfolge der Beat-Zeilen. Ein Schritt.
// Rückgabe kitId | null
export function importPadWall({ store, library, key = EDITION.padsKey }) {
  const tpl = padWallTemplate({ project: store.project, library, key });
  if (!tpl) return null;
  const map = {};
  tpl.ids.forEach((id, i) => { map[PAD_IDS[i]] = id; });
  return store.addKit({ name: tpl.name, map, from: 'pads.v1' });
}
