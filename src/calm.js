// Gemeinsame Tabelle der Ruhe-Schicht „calm“ (Spec krachwerk-5-song §6): Elemente mit data-tier="3" sind in calm nicht sichtbar;
// hier steht, wo man sie stattdessen findet (Schlüssel: ID oder .Klasse). Gilt für beide Editionen; EDITION.twins ergänzt
// nur Eigenes von Krachwerk. Loopwerk hat in index.html keine zusätzlichen Stufe-3-Elemente, die Krachwerk nicht auch hat.
export const CALM_TWINS = {
  'home-btn': 'Pos1, Lineal antippen',
  'zoom-in': 'Strg+Rad, zwei Finger', 'zoom-out': 'Strg+Rad, zwei Finger', 'zoomy-in': 'Alt+Rad, zwei Finger', 'zoomy-out': 'Alt+Rad, zwei Finger',
  'select-btn': 'lange drücken', 'select-all-btn': 'Strg+A', '.ltab': '+ Neu in der Kiste',
  '.tbtn-mute': 'Werkbank Spur (M)', '.tbtn-solo': 'Werkbank Spur (S)', '.track-vol-wrap': 'Werkbank Spur (Lautstärke)',
  'clipbar': 'Werkzeug am Clip', 'split-btn': 'Werkzeug am Clip', 'dup-btn': 'Werkzeug am Clip', 'del-btn': 'Werkzeug am Clip',
  'editor-tab': 'Werkbank am Clip', '.tbtn-chev': 'Spur-Menü ⋯ (Kurve)',
  // Song-Dinge: in Loopwerk calm weiter im Fach „Song“ bzw. im Inspektor, in Krachwerk in der Song-Werkbank
  'metro-btn': 'Song (Klick)', 'rec-more': 'Song (Aufnahme)', '.lcd-more': 'Song', '.meter-wrap': 'Song', '.key-row': 'Song (Tonart und Akkorde)', '.chord-row': 'Song (Tonart und Akkorde)',
  'mixer-btn': 'Song (Mischen)', 'fxpad-btn': 'Song (FX-Pad)', 'tab-song': 'Tipp auf das Deck', '.tabbar-end': 'Song (Tastenkürzel)',
};

export const twinOf = (twins, el) => twins[el.id] || [...el.classList].map((c) => twins['.' + c]).find(Boolean) || null;
