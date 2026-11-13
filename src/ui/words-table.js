// Wort-Tabelle für das Layout „reiter“ am Desktop (Scheibe 7): alt → neu, wo, warum. Reine Daten, damit docs/umbau/woerter.md daraus entsteht
// (tools/woerter.cjs). Gesetzt werden die Wörter von words.js; Krachwerk und Handy behalten ihre alten Texte.
// art: 'ganz' = der ganze Text, 'teil' = Textstück, 'regex' = Muster (alt ist dann der Musterquelltext, neu mit $1…).
// Reihenfolge zählt: erst ‚ganz‘, dann die übrigen von oben nach unten.

export const ENTRIES = [
  // ----- ganze Texte -----
  { art: 'ganz', alt: 'Assets', neu: 'Sounds', wo: 'Name der Seitenleiste (aria-label)', warum: 'Reitername und Alltagswort; die Überschrift im Reiter entfällt ganz, sie wiederholte nur den Reiternamen' },
  { art: 'ganz', alt: 'Clip-Editor', neu: 'Clip bearbeiten', wo: 'Karte in der Mitte (Name, Tipps)', warum: 'ein Wort „Bearbeiten“ fürs Öffnen eines Clips' },
  { art: 'ganz', alt: 'Sample-Editor', neu: 'Clip bearbeiten', wo: 'Karte in der Mitte (aria-label)', warum: 'wie Clip-Editor: „Sample“ kennt der Einsteiger nicht' },
  { art: 'ganz', alt: 'Pattern-Editor', neu: 'Beat und Melodie bearbeiten', wo: 'Karte in der Mitte (aria-label)', warum: 'Pattern ist Fachwort; es sind ein Beat oder eine Melodie' },
  { art: 'ganz', alt: 'Beat-Editor', neu: 'Beat bearbeiten', wo: 'Überschrift der Karte', warum: 'Verb statt Werkzeugname' },
  { art: 'ganz', alt: 'Melodie-Editor', neu: 'Melodie bearbeiten', wo: 'Überschrift der Karte', warum: 'Verb statt Werkzeugname' },
  { art: 'ganz', alt: 'Editor', neu: 'Bearbeiten', wo: 'Fachleisten-Knopf (versteckt am Desktop), Einblender', warum: 'ein Wort für dieselbe Sache' },
  { art: 'ganz', alt: 'Scharf', neu: 'Aufnahme bereit', wo: 'Schalter im Spur-Abschnitt', warum: 'sagt, was passiert; „scharf“ ist Studiojargon' },
  { art: 'ganz', alt: 'Für Aufnahme scharf', neu: 'Für Aufnahme bereit', wo: 'Spur-Menü, aria-label', warum: 'wie oben' },
  { art: 'ganz', alt: 'Busse', neu: 'Hall und Echo', wo: 'Abschnitt in der Summen-Karte und der Spur-Karte', warum: '„Bus“ ist Fachwort; der Abschnitt enthält Hall und Echo' },
  { art: 'ganz', alt: 'Quantisieren', neu: 'Ins Raster rücken', wo: 'Beat/Melodie bearbeiten', warum: 'sagt, was passiert (Hinweistext erklärte es schon so)' },
  { art: 'ganz', alt: 'Beispiel', neu: 'Beispiel laden', wo: 'Reiter Datei', warum: 'Befehl statt Hauptwort; steht neben „Leeren“' },
  { art: 'ganz', alt: '→H', neu: 'Hall', wo: 'Regler in der Mixer-Zeile', warum: 'Abkürzung ausgeschrieben, dazu ein verständlicher Hinweistext' },
  { art: 'ganz', alt: '→E', neu: 'Echo', wo: 'Regler in der Mixer-Zeile', warum: 'wie →H' },
  // ----- Textstücke -----
  { art: 'teil', alt: 'Ausgewählten Clip im Sample-Editor öffnen', neu: 'Clip bearbeiten', wo: 'Hinweistext des Bearbeiten-Knopfs', warum: 'ein Wort fürs Öffnen' },
  { art: 'teil', alt: 'Clip im Editor öffnen', neu: 'Clip bearbeiten', wo: 'Hinweistext', warum: 'ein Wort fürs Öffnen' },
  { art: 'teil', alt: 'Doppelklick öffnet den Editor', neu: 'Doppelklick bearbeitet den Clip', wo: 'Tipp „clip“', warum: 'ein Wort fürs Öffnen' },
  { art: 'teil', alt: 'Editor · ', neu: 'Bearbeiten · ', wo: 'Hinweistext/Name der Fachleiste', warum: 'ein Wort fürs Öffnen' },
  { art: 'teil', alt: 'Name des Patterns', neu: 'Name des Beats oder der Melodie', wo: 'aria-label des Namensfelds', warum: 'Pattern ist Fachwort' },
  { art: 'teil', alt: 'Pattern im Loop anhören', neu: 'Im Loop anhören', wo: 'Hinweistext Anhören', warum: 'Fachwort gestrichen' },
  { art: 'teil', alt: 'Pattern läuft im Loop', neu: 'Es läuft im Loop', wo: 'Hinweistext Live', warum: 'Fachwort gestrichen' },
  { art: 'teil', alt: 'Bus-Kompression', neu: 'Kompression', wo: 'Hinweistext Mastering', warum: 'Fachwort Bus gestrichen' },
  { art: 'teil', alt: 'Ziellautheit', neu: 'Ziel-Lautheit', wo: 'Hinweistext Mastering', warum: 'lesbarer' },
  { art: 'regex', alt: '\\bFader\\b', neu: 'Regler', wo: 'Hinweistext Einzelspuren', warum: 'ein Wort für Schieberegler' },
  { art: 'teil', alt: 'Panorama', neu: 'Links/Rechts', wo: 'Regler in Mixer-Zeile und Spur-Karte, aria-label', warum: 'sagt, was der Regler tut' },
  { art: 'regex', alt: 'Anteil zum (Hall|Echo)-Bus', neu: '$1-Anteil', wo: 'Hinweistext und aria-label der Regler', warum: '„Send“/„Bus“ ist Fachwort' },
  { art: 'regex', alt: '→ (Hall|Echo)-Bus', neu: '$1-Anteil', wo: 'Regler in der Spur-Karte', warum: 'wie oben' },
  { art: 'regex', alt: '\\b(Hall|Echo)-Bus\\b', neu: '$1', wo: 'Zeilen in der Summen-Karte, aria-label', warum: 'Hall und Echo sind Alltagswörter, „Bus“ nicht' },
  { art: 'teil', alt: ' dieses Rückkanals', neu: '', wo: 'Hinweistext der Hall-/Echo-Zeile', warum: '„Rückkanal“ ist Fachwort' },
  { art: 'teil', alt: 'Effekte dieses Kanals', neu: 'Effekte dieser Spur', wo: 'Hinweistext der Effekt-Kurzinfo', warum: 'ein Wort: Spur' },
  { art: 'regex', alt: 'Aufnahme scharf schalten', neu: 'Aufnahme bereit machen', wo: 'Tastenkürzel-Liste', warum: '„scharf“ ist Jargon' },
  { art: 'regex', alt: '(Aufnahme|mehr) scharf\\b', neu: '$1 bereit', wo: 'Spur-Menü, Einblender, aria-label', warum: 'wie „Aufnahme bereit“' },
  { art: 'regex', alt: 'ist scharf für', neu: 'ist bereit für', wo: 'Einblender', warum: 'wie „Aufnahme bereit“' },
  { art: 'regex', alt: ', (−?[\\d,]+) LUFS\\)', neu: ', Lautheit $1 LUFS)', wo: 'Ergebnis des Exports', warum: 'Messwert bekommt ein Etikett' },
  { art: 'regex', alt: '^(−?[\\d,.]+) LUFS · Spitze', neu: 'Lautheit $1 LUFS · Spitze', wo: 'Anzeige unter dem Mastering-Stil', warum: 'Zahl mit Einheit bleibt, Etikett davor' },
  { art: 'regex', alt: 'Ziel (−?\\d+) LUFS', neu: 'Ziel-Lautheit $1 LUFS', wo: 'Anzeige und Hinweistexte der Stile', warum: 'Etikett vor dem Messwert' },
  { art: 'teil', alt: ' (Stems)', neu: '', wo: 'Export, Einzelspuren', warum: '„Stems“ ist Fachwort; „Einzelspuren“ sagt es schon' },
  { art: 'teil', alt: 'Fach schließen', neu: 'Karte schließen', wo: 'Tastenkürzel-Liste (Esc)', warum: 'es gibt hier Karten, keine Fächer' },
];

// Zusätzlich in woerter.md: gesetzte Texte, die ohne Tabelle neu gebaut werden (Abläufe in flows.js, „Neuer Song“, „+ Neu“, Tipp „create-neu“).
