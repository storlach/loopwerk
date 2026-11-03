// Editionen aus einem Code (ADR 007): Loopwerk (voll) und Krachwerk (nur Selbstgemachtes, Adresse /werkstatt/).
// Die einzige Stelle, an der sich Editionen unterscheiden. src/main.js liest sie und gibt Werte als Optionen weiter.
// Quelle: globalThis.LOOPWERK_EDITION (setzt die erzeugte Seite /werkstatt/) oder ?edition=… in der Adresse.

export const EDITIONS = {
  full: {
    id: 'full', title: 'Loopwerk', db: 'loopwerk', keyPrefix: 'loopwerk.',
    catalogs: true, demo: true, tracks: 8, bpm: 120, record: 'song', keepUnknownClips: false,
    pwa: false, density: 'full', surfaces: {}, twins: {}, shelfGroups: null,
    workbench: null, materialColors: false, grainWave: false,
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
      'home-btn': 'Pos1, Lineal antippen', 'metro-btn': 'Song-Fach (Klick)',
      '.lcd-more': 'Song-Fach, Werkbank Song', '.meter-wrap': 'Song-Fach, Werkbank Song',
      'zoom-in': 'Strg+Rad, zwei Finger', 'zoom-out': 'Strg+Rad, zwei Finger', 'zoomy-in': 'Alt+Rad, zwei Finger', 'zoomy-out': 'Alt+Rad, zwei Finger',
      'select-btn': 'lange drücken', 'select-all-btn': 'Strg+A', '.ltab': '+ Neu in der Kiste',
      '.tbtn-mute': 'Werkbank Spur (M)', '.tbtn-solo': 'Werkbank Spur (S)', '.track-vol-wrap': 'Werkbank Spur (Lautstärke)',
      '.key-row': 'Song-Fach (Tonart und Akkorde)', '.chord-row': 'Song-Fach (Tonart und Akkorde)',
      'clipbar': 'Werkzeug am Clip', 'split-btn': 'Werkzeug am Clip', 'dup-btn': 'Werkzeug am Clip', 'del-btn': 'Werkzeug am Clip',
      'mixer-btn': 'Song-Fach (Mischen)', 'fxpad-btn': 'Song-Fach (FX-Pad)', 'editor-tab': 'Werkbank (Form · Ton · Zerlegen)', 'tab-song': 'Tipp auf das Deck',
      '.tabbar-end': 'Song-Werkbank (Hilfe)', '.tbtn-chev': 'Werkbank Spur (Feinheiten, Kurve)',
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
    // Klang-Rezept (Scheibe 2a, ADR 008): Sound-Werkbank im Clip-Abschnitt, Herkunftsfarben in Kiste und Song, Roh = Korn
    workbench: 'sound', materialColors: true, grainWave: true,
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

// Speicher-Schlüssel je Edition: in Loopwerk unverändert, in Krachwerk „loopwerk.make.…“
export const lsKey = (k) => k.replace(/^loopwerk\./, EDITION.keyPrefix);
