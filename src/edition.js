// Editionen aus einem Code (ADR 007): Loopwerk (voll) und Krachwerk (nur Selbstgemachtes, Adresse /werkstatt/).
// Die einzige Stelle, an der sich Editionen unterscheiden. src/main.js liest sie und gibt Werte als Optionen weiter.
// Quelle: globalThis.LOOPWERK_EDITION (setzt die erzeugte Seite /werkstatt/) oder ?edition=… in der Adresse.

export const EDITIONS = {
  full: {
    id: 'full', title: 'Loopwerk', db: 'loopwerk', keyPrefix: 'loopwerk.',
    catalogs: true, demo: true, tracks: 8, bpm: 120, record: 'song', keepUnknownClips: false,
    pwa: false, density: 'full', surfaces: {}, twins: {}, shelfGroups: null,
  },
  make: {
    id: 'make', title: 'Krachwerk', db: 'loopwerk-make', keyPrefix: 'loopwerk.make.', padsKey: 'loopwerk.make.pads.v1',
    // Keine mitgelieferten Samples; Synth-Kits sind Klangerzeuger und bleiben
    catalogs: false, demo: false, synthKits: ['elektro', 'techno'], tracks: 2, bpm: 90, record: 'sound',
    keepUnknownClips: true, pwa: true, density: 'calm',
    // „selbst gemacht“ mittel (Martin, 02.11.2026): ohne Loops, Begleitautomatik, KI-Erzeugung, Link/Tab
    surfaces: { starter: false, accomp: false, ai: false, link: false, catalog: false, demo: false, tips: false },
    // Stufe 3 (data-tier="3") ist in „calm“ nicht sichtbar; hier steht, wo man es stattdessen findet (Schlüssel: ID oder .Klasse)
    twins: {
      'home-btn': 'Pos1, Lineal antippen', 'metro-btn': 'Song-Fach (Klick)',
      '.lcd-more': 'Song-Fach, Werkbank Song', '.meter-wrap': 'Song-Fach, Werkbank Song',
      'zoom-in': 'Strg+Rad, zwei Finger', 'zoom-out': 'Strg+Rad, zwei Finger', 'zoomy-in': 'Alt+Rad, zwei Finger', 'zoomy-out': 'Alt+Rad, zwei Finger',
      'select-btn': 'lange drücken', 'select-all-btn': 'Strg+A', '.ltab': '+ Neu in der Kiste',
      '.tbtn-mute': 'Werkbank Spur (M)', '.tbtn-solo': 'Werkbank Spur (S)', '.track-vol-wrap': 'Werkbank Spur (Lautstärke)',
      'clipbar': 'Werkzeug am Clip', 'split-btn': 'Werkzeug am Clip', 'dup-btn': 'Werkzeug am Clip', 'del-btn': 'Werkzeug am Clip',
      'mixer-btn': 'Song-Fach (Mischen)', 'fxpad-btn': 'Song-Fach (FX-Pad)', 'editor-tab': 'Werkbank (Bearbeiten)', 'tab-song': 'Tipp auf das Deck',
    },
    // Kiste: Gruppen nach Herkunft (Reihenfolge = Anzeige); cat = Farbe des Punkts, wenn nichts Genaueres bekannt ist
    shelfGroups: [
      { id: 'mic', label: 'Aufnahmen', cat: 'fx' },
      { id: 'file', label: 'Dateien', cat: 'fx' },
      { id: 'loop', label: 'Schleifen', cat: 'chords' },
      { id: 'pat', label: 'Strom', cat: 'bass' },
    ],
  },
};

export function editionId() {
  const g = globalThis.LOOPWERK_EDITION;
  if (g && EDITIONS[g]) return g;
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('edition');
    if (q && EDITIONS[q]) return q;
  } catch { /* keine Adresse */ }
  return 'full';
}

export const EDITION = EDITIONS[editionId()];

// Speicher-Schlüssel je Edition: in Loopwerk unverändert, in Krachwerk „loopwerk.make.…“
export const lsKey = (k) => k.replace(/^loopwerk\./, EDITION.keyPrefix);
