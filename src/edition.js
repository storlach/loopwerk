// Editionen aus einem Code (ADR 007): Loopwerk (voll) und Krachwerk (nur Selbstgemachtes, Adresse /werkstatt/).
// Die einzige Stelle, an der sich Editionen unterscheiden. src/main.js liest sie und gibt Werte als Optionen weiter.
// Quelle: globalThis.LOOPWERK_EDITION (setzt die erzeugte Seite /werkstatt/) oder ?edition=… in der Adresse.

export const EDITIONS = {
  full: {
    id: 'full', title: 'Loopwerk', db: 'loopwerk', keyPrefix: 'loopwerk.',
    catalogs: true, demo: true, tracks: 8, bpm: 120, record: 'song', keepUnknownClips: false,
    pwa: false, density: 'full', surfaces: {},
  },
  make: {
    id: 'make', title: 'Krachwerk', db: 'loopwerk-make', keyPrefix: 'loopwerk.make.', padsKey: 'loopwerk.make.pads.v1',
    // Keine mitgelieferten Samples; Synth-Kits sind Klangerzeuger und bleiben
    catalogs: false, demo: false, synthKits: ['elektro', 'techno'], tracks: 2, bpm: 90, record: 'sound',
    keepUnknownClips: true, pwa: true, density: 'full',
    // „selbst gemacht“ mittel (Martin, 02.11.2026): ohne Loops, Begleitautomatik, KI-Erzeugung, Link/Tab
    surfaces: { starter: false, accomp: false, ai: false, link: false, catalog: false, demo: false, tips: false },
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
