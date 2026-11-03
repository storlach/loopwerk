// Kits (Krachwerk Scheibe 4, Spec krachwerk-4-kit §3, §5, ADR 012): Pad-Zeilen, Muster für neue Kit-Patterns,
// Schritt im Pattern-Fenster eines Clips, Pad-Aufnahme. Ohne Audio (Live-Anschlag: src/own-instruments.js playPad).

// Die 8 Pads = die 8 Zeilen des Beat-Editors (DRUM_ROWS in src/instruments.js, gleiche Reihenfolge)
export const PAD_IDS = ['kick', 'snare', 'clap', 'hat', 'open', 'tomLo', 'tomHi', 'crash'];
export const STEPS_PER_BAR = 16;

// Muster je Takt (16 Schritte): Schritt-Listen je Pad
export const GROOVES = [
  { id: 'gerade', label: 'Gerade', rows: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] } },
  { id: 'halb', label: 'Halb', rows: { kick: [0], snare: [8], hat: [0, 4, 8, 12] } },
  { id: 'breaks', label: 'Breaks', rows: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [14] } },
];
export const grooveOf = (id) => GROOVES.find((g) => g.id === id) ?? GROOVES[0];
export const nextGroove = (id) => GROOVES[(GROOVES.indexOf(grooveOf(id)) + 1) % GROOVES.length].id;

// Schritte eines Musters über `bars` Takte; Pads ohne Sound (map) bleiben leer. Form wie pattern.rows.
export function grooveRows(id, bars = 1, map = null) {
  const g = grooveOf(id);
  const n = Math.max(1, Math.round(bars)) * STEPS_PER_BAR;
  const rows = {};
  for (const r of PAD_IDS) {
    const on = !map || map[r] ? g.rows[r] || [] : [];
    rows[r] = Array.from({ length: n }, (_, i) => (on.includes(i % STEPS_PER_BAR) ? 1 : 0));
  }
  return rows;
}

// Schritt (1/16) im Pattern-Fenster eines Clips zur Songposition beat; null außerhalb des Clips
export function stepInClip(clip, beat, bars) {
  if (!clip || beat < clip.startBeat - 1e-6 || beat >= clip.startBeat + clip.lengthBeats + 1e-6) return null;
  const n = Math.max(1, Math.round(bars)) * STEPS_PER_BAR;
  const k = Math.round((beat - clip.startBeat + (clip.offsetBeats || 0)) * 4);
  return ((k % n) + n) % n;
}

// Pad-Aufnahme: ein Schlag auf dem nächsten 1/16 im Pattern des Clips (Position = engine.heardBeat beim Ereignis).
// pass = Kennung des ●-Durchgangs (ein Rückgängig-Schritt je Durchgang). Rückgabe: Schritt oder null.
export function recordPadHit({ store, engine, clipId, row, vel = 1, pass = 1 }) {
  const found = store.findClip(clipId);
  const pid = found && /^pat-/.test(found.clip.sampleId) ? found.clip.sampleId.slice(4) : null;
  const pat = pid && store.project.patterns?.[pid];
  if (!pat || pat.type !== 'drums' || !PAD_IDS.includes(row)) return null;
  const step = stepInClip(found.clip, engine.heardBeat(), pat.bars);
  if (step == null) return null;
  store.padHit(pid, row, step, vel, pass);
  return step;
}
