// Editionen aus einem Code (ADR 007): Loopwerk (voll) und Krachwerk (nur Selbstgemachtes, Adresse /werkstatt/).
// Die einzige Stelle, an der sich Editionen unterscheiden. src/main.js liest sie und gibt Werte als Optionen weiter.
// Quelle: globalThis.LOOPWERK_EDITION (setzt die erzeugte Seite /werkstatt/) oder ?edition=… in der Adresse.

import { CALM_TWINS } from './calm.js';

export const EDITIONS = {
  full: {
    id: 'full', title: 'Loopwerk', db: 'loopwerk', keyPrefix: 'loopwerk.',
    catalogs: true, demo: true, tracks: 8, bpm: 120, record: 'song', keepUnknownClips: false,
    pwa: false, density: 'full', surfaces: {}, twins: {}, shelfGroups: null,
    workbench: null, materialColors: false, grainWave: false, brandMark: null, freeze: false,
    kitBench: false, startCard: false, tips: null, songBench: false,
  },
  make: {
    id: 'make', title: 'Krachwerk', db: 'loopwerk-make', keyPrefix: 'loopwerk.make.', padsKey: 'loopwerk.make.pads.v1',
    // Keine mitgelieferten Samples; Synth-Kits sind Klangerzeuger und bleiben
    catalogs: false, demo: false, synthKits: ['elektro', 'techno'], tracks: 2, bpm: 90, record: 'sound',
    keepUnknownClips: true, pwa: true, density: 'calm',
    // „selbst gemacht“ mittel (Martin, 02.11.2026): ohne Loops, Begleitautomatik, KI-Erzeugung, Link/Tab
    // 2b: der Sample-Editor fällt weg, jede ed-…-Funktion hat unten einen Zwilling in der Werkbank
    surfaces: { starter: false, accomp: false, ai: false, link: false, catalog: false, demo: false, tips: false, editor: false },
    // Stufe 3 (data-tier="3") ist in „calm“ nicht sichtbar; hier steht, wo man es stattdessen findet (Schlüssel: ID oder .Klasse)
    twins: {
      ...CALM_TWINS,
      'metro-btn': 'Song-Werkbank, Reiter Song (Klick)', '.lcd-more': 'Song-Werkbank, Reiter Song', '.meter-wrap': 'Song-Werkbank, Reiter Song',
      '.key-row': 'Song-Werkbank, Reiter Song (Tonart und Akkorde)', '.chord-row': 'Song-Werkbank, Reiter Song (Tonart und Akkorde)',
      'mixer-btn': 'Song-Werkbank, Reiter Mischen', 'fxpad-btn': 'Song-Werkbank, Reiter Mischen (FX-Pad)', 'editor-tab': 'Werkbank (Form · Ton · Zerlegen)', 'tab-song': 'Tipp auf das Deck',
      '.tabbar-end': 'Song-Werkbank, Reiter Projekt (Hilfe)',
      // Sample-Editor (2b, Spec krachwerk-2b-zerlegen §6): Funktion → Zwilling in der Werkbank
      'edit-btn': 'Werkbank (Form · Ton · Zerlegen)',
      'ed-crop': 'Form: Anfang/Ende', 'ed-cut': 'Zerlegen, Schnitt löschen; Teilen und Löschen am Clip', 'ed-silence': 'Zerlegen, Schnitt löschen; Teilen und Löschen am Clip',
      'ed-fadein': 'Form: Anschlag', 'ed-fadeout': 'Form: Ausklang',
      'ed-reverse': 'Form: Rückwärts', 'ed-louder': 'Form: Pegel', 'ed-quieter': 'Form: Pegel', 'ed-normalize': 'Form: Auf Spitze',
      'ed-pitch-down': 'Ton: Halbtöne', 'ed-pitch-up': 'Ton: Halbtöne', 'ed-pitch-apply': 'Ton: Halbtöne', 'ed-pitch-value': 'Ton: Halbtöne',
      'ed-autotune': 'Ton, Feinheiten: Autotune', 'ed-at-root': 'Ton, Feinheiten: Tonart', 'ed-at-scale': 'Ton, Feinheiten: Tonart',
      'ed-at-strength': 'Ton, Feinheiten: Stärke', 'ed-at-robot': 'Ton, Feinheiten: Roboter',
      'ed-novocal': 'Zerlegen, Feinheiten: Stimme weg', 'ed-vocal': 'Zerlegen, Feinheiten: Nur Stimme', 'ed-stems': 'Zerlegen, Feinheiten: In 4 Ebenen',
      'ed-loop': 'Zeit', 'ed-beats': 'Zeit', 'ed-bpm': 'Zeit', 'ed-play': 'Tipp auf die Welle',
      'ed-undo': 'Rückgängig (↶)', 'ed-name': 'Name im Kopf der Werkbank', 'ed-apply': 'Als Variante',
    },
    // Klang-Rezept (Scheibe 2a, ADR 010): Sound-Werkbank im Clip-Abschnitt, Herkunftsfarben in Kiste und Song, Roh = Korn
    workbench: 'sound', materialColors: true, grainWave: true,
    // Zeichen im Deck: Klatscher als Ausschlag um die Mittellinie (assets/icons/krachwerk.svg), src/ui/brand-meter.js
    brandMark: 'klatscher',
    // Festhalten (Scheibe 3a): Knopf am Loop-Bereich, Taste F, Festhalten im Werkzeug bei Mehrfachauswahl
    freeze: true,
    // Kit und Instrument (Scheibe 4): Kit-/Instrument-Werkbank, Pad-Wand, Startkarte, eigene Tipps (src/tips-make.js)
    kitBench: true, startCard: true, tips: 'make',
    // Song-Werkbank (Scheibe 5): Song, Mischen, Fertig, Projekt, Aufnahme an einem Ort; Zutatenliste beim Export
    songBench: true,
    // Adresse der Edition (nur hier): umgestellt wird erst nach Martins Entscheidung, siehe KW_PATH in tools/werkstatt-page.cjs
    path: globalThis.LOOPWERK_PATH || 'werkstatt', // die erzeugte Seite (KW_PATH) setzt LOOPWERK_PATH
    // Kiste: Gruppen nach Material (Reihenfolge = Anzeige, Farbe = Herkunftsfarbe, siehe src/recipe.js MATERIALS)
    shelfGroups: [
      { id: 'koerper', label: 'Körper', cat: 'drums' },
      { id: 'dinge', label: 'Dinge', cat: 'fx' },
      { id: 'stimme', label: 'Stimme', cat: 'synth' },
      { id: 'strom', label: 'Strom', cat: 'bass' },
      { id: 'schleife', label: 'Schleife', cat: 'chords' },
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

// Dichte der Oberfläche: Krachwerk ist immer „calm“. In Loopwerk gilt „calm“ nur auf Wunsch (?density=calm in der Adresse oder
// lsKey('loopwerk.density') = 'calm'; ?density=full schaltet es wieder aus) – es gibt keinen sichtbaren Schalter. Standard: aus.
export function densityFrom(edition = EDITION, search = globalThis.location?.search || '', storage = globalThis.localStorage) {
  if (edition.density === 'calm') return 'calm';
  try {
    const q = new URLSearchParams(search).get('density');
    if (q === 'calm') return 'calm';
    if (q === 'full') return 'full';
    if (storage?.getItem(edition.keyPrefix + 'density') === 'calm') return 'calm';
  } catch { /* Standard */ }
  return edition.density;
}
export const DENSITY = densityFrom();

// Speicher-Schlüssel je Edition: in Loopwerk unverändert, in Krachwerk „loopwerk.make.…“
export const lsKey = (k) => k.replace(/^loopwerk\./, EDITION.keyPrefix);
