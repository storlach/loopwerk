// Editionen aus einem Code: Loopwerk (voll) und Krachwerk (nur Selbstgemachtes, Adresse /werkstatt/).
// Quelle: globalThis.LOOPWERK_EDITION (setzt die erzeugte Seite /werkstatt/) oder ?edition=… in der Adresse.

export const EDITIONS = {
  full: {
    id: 'full', title: 'Loopwerk',
    db: 'loopwerk', storageKey: 'loopwerk.project.v1',
    catalogs: true,
  },
  make: {
    id: 'make', title: 'Krachwerk',
    // Eigener Speicher: keine geteilten Sounds mit Loopwerk (Entscheidung Martin, 02.11.2026)
    db: 'loopwerk-make', storageKey: 'loopwerk.make.pads.v1',
    // Keine mitgelieferten Samples; Synth-Kits sind Klangerzeuger und bleiben
    catalogs: false, synthKits: ['elektro', 'techno'],
    bpm: 90,
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
