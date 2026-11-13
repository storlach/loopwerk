# Wörter: alt → neu (Scheibe 7)

Gilt nur im Layout „reiter“ am Desktop (Loopwerk, ab 761 px Breite). Krachwerk und Handy behalten ihre Wörter.
Quelle der Tabelle: `src/ui/words-table.js`; diese Datei erzeugt `node tools/woerter.cjs`. Gesetzt werden die Wörter von `src/ui/words.js`:
beim Start und beim Wechsel der Breite werden Texte, `title`, `aria-label` und `placeholder` der Seite umgeschrieben (Originale werden gemerkt und am Handy zurückgesetzt); dynamisch erzeugte Texte (Mixer, Inspektor, Einblender, Tipps, Export-Ergebnis) laufen über `W()`.

Regeln: Deutsch, aus Sicht der Person, ein Wort je Sache, kein Fachwort, wo ein Alltagswort trägt; etablierte Musikwörter bleiben.

Art: „ganz“ = der ganze Text, „teil“ = Textstück, „Muster“ = regulärer Ausdruck (`$1` = Treffer).

## Geändert (49 Einträge)

| alt | neu | wo | warum |
|---|---|---|---|
| Assets | Sounds | Name der Seitenleiste (aria-label) | Reitername und Alltagswort; die Überschrift im Reiter entfällt ganz, sie wiederholte nur den Reiternamen |
| Clip-Editor | Clip bearbeiten | Karte in der Mitte (Name, Tipps) | ein Wort „Bearbeiten“ fürs Öffnen eines Clips |
| Sample-Editor | Clip bearbeiten | Karte in der Mitte (aria-label) | wie Clip-Editor: „Sample“ kennt der Einsteiger nicht |
| Pattern-Editor | Beat und Melodie bearbeiten | Karte in der Mitte (aria-label) | Pattern ist Fachwort; es sind ein Beat oder eine Melodie |
| Beat-Editor | Beat bearbeiten | Überschrift der Karte | Verb statt Werkzeugname |
| Melodie-Editor | Melodie bearbeiten | Überschrift der Karte | Verb statt Werkzeugname |
| Editor | Bearbeiten | Fachleisten-Knopf (versteckt am Desktop), Einblender | ein Wort für dieselbe Sache |
| Duplizieren | Kopieren | Kopfzeile über den Spuren, Spur-Menü | Martins Wort; „Duplizieren“ ist Fachsprache |
| Scharf | Aufnahme bereit | Schalter im Spur-Abschnitt | sagt, was passiert; „scharf“ ist Studiojargon |
| Für Aufnahme scharf | Für Aufnahme bereit | Spur-Menü, aria-label | wie oben |
| Busse | Hall und Echo | Abschnitt in der Gesamt-Karte und der Spur-Karte | „Bus“ ist Fachwort; der Abschnitt enthält Hall und Echo |
| Master-Lautstärke | Gesamt-Lautstärke | Gesamt-Karte | ein Wort für Summe und Master |
| Mit Summe (Master-Effekte, Mastering) | Mit Gesamt (Effekte, Feinschliff) | Export, Schritt „Was“ (Einzelspuren) | einheitliche Wörter |
| Quantisieren | Ins Raster rücken | Beat/Melodie bearbeiten | sagt, was passiert (Hinweistext erklärte es schon so) |
| Beispiel | Beispiel laden | Reiter Datei | Befehl statt Hauptwort; steht neben „Leeren“ |
| →H | Hall | Regler in der Mixer-Zeile | Abkürzung ausgeschrieben, dazu ein verständlicher Hinweistext |
| →E | Echo | Regler in der Mixer-Zeile | wie →H |
| Ausgewählten Clip im Sample-Editor öffnen | Clip bearbeiten | Hinweistext des Bearbeiten-Knopfs | ein Wort fürs Öffnen |
| Clip im Editor öffnen | Clip bearbeiten | Hinweistext | ein Wort fürs Öffnen |
| Doppelklick öffnet den Editor | Doppelklick bearbeitet den Clip | Tipp „clip“ | ein Wort fürs Öffnen |
| Editor ·  | Bearbeiten ·  | Hinweistext/Name der Fachleiste | ein Wort fürs Öffnen |
| Name des Patterns | Name des Beats oder der Melodie | aria-label des Namensfelds | Pattern ist Fachwort |
| Pattern im Loop anhören | Im Loop anhören | Hinweistext Anhören | Fachwort gestrichen |
| Pattern läuft im Loop | Es läuft im Loop | Hinweistext Live | Fachwort gestrichen |
| duplizieren | kopieren | Hinweistexte, Tastenkürzel-Liste | ein Wort: Kopieren |
| Mastering | Feinschliff | Gesamt-Karte, Export, Hinweistexte | Alltagswort für den letzten Klangschliff |
| Summe radiotauglich machen | Gesamtklang radiotauglich machen | Hinweistext des Feinschliff-Schalters | einheitlich Gesamt |
| Bus-Kompression | Kompression | Hinweistext Feinschliff | Fachwort Bus gestrichen |
| Limiter | Begrenzer | Hinweistext Feinschliff | deutsches Wort |
| Ziellautheit | Ziel-Lautheit | Hinweistext Feinschliff | lesbarer |
| Muster \bFader\b | Regler | Hinweistext Einzelspuren | ein Wort für Schieberegler |
| Panorama | Links/Rechts | Regler in Mixer-Zeile und Spur-Karte, aria-label | sagt, was der Regler tut |
| Muster Anteil zum (Hall\|Echo)-Bus | $1-Anteil | Hinweistext und aria-label der Regler | „Send“/„Bus“ ist Fachwort |
| Muster → (Hall\|Echo)-Bus | $1-Anteil | Regler in der Spur-Karte | wie oben |
| Muster \b(Hall\|Echo)-Bus\b | $1 | Zeilen in der Gesamt-Karte, aria-label | Hall und Echo sind Alltagswörter, „Bus“ nicht |
|  dieses Rückkanals | (entfällt) | Hinweistext der Hall-/Echo-Zeile | „Rückkanal“ ist Fachwort |
| Effekte dieses Kanals | Effekte dieser Spur | Hinweistext der Effekt-Kurzinfo | ein Wort: Spur |
| Muster \bMaster\b | Gesamt | Deck (Pegel), Gesamt-Karte, aria-label | ein Wort für Summe und Master |
| Muster \bSumme\b | Gesamt | Spuren-Fuß, Mixer, Kurven, Hinweistexte | ein Wort für Summe und Master |
| Muster \bSummen- | Gesamt- | Summen-Kurve, aria-label | ein Wort für Summe und Master |
| Muster Aufnahme scharf schalten | Aufnahme bereit machen | Tastenkürzel-Liste | „scharf“ ist Jargon |
| Muster (Aufnahme\|mehr) scharf\b | $1 bereit | Spur-Menü, Einblender, aria-label | wie „Aufnahme bereit“ |
| Muster ist scharf für | ist bereit für | Einblender | wie „Aufnahme bereit“ |
| Muster , (−?[\d,]+) LUFS\) | , Lautheit $1 LUFS) | Ergebnis des Exports | Messwert bekommt ein Etikett |
| Muster ^(−?[\d,.]+) LUFS · Spitze | Lautheit $1 LUFS · Spitze | Anzeige unter dem Feinschliff-Stil | Zahl mit Einheit bleibt, Etikett davor |
| Muster Ziel (−?\d+) LUFS | Ziel-Lautheit $1 LUFS | Anzeige und Hinweistexte der Stile | Etikett vor dem Messwert |
|  (Stems) | (entfällt) | Export, Einzelspuren | „Stems“ ist Fachwort; „Einzelspuren“ sagt es schon |
| Muster ^Suchen … \(.*\)$ | Suchen … | Suchfeld im Reiter Sounds | die Zahl in Klammern wurde abgeschnitten (neben „+ Neu“ ist zu wenig Platz); die Zahlen stehen an den Gruppen |
| Fach schließen | Karte schließen | Tastenkürzel-Liste (Esc) | es gibt hier Karten, keine Fächer |

## Neu gesetzte Texte (5)

| Text | wo | warum |
|---|---|---|
| (Zeile in Datei) „Neuer Song“ | Reiter Datei, Befehlsliste | Ersetzt den Abschnitt mit zehn Genre-Knöpfen; öffnet den Ablauf |
| Ablauf „Neuer Song“: „Welcher Stil?“ · „Anhören und entscheiden“ · „Song bauen“ / „Jetzigen Song ersetzen“ / „Sicher? Ersetzt den jetzigen Song“ · „Fertig“ | Karte in der Mitte | Hauptknopf sagt, was passiert; die Rückfrage steht im Knopf |
| Ablauf „Neuer Sound“: „Was möchtest du machen?“ | Karte in der Mitte | Einstieg wie bisher „Erstellen“, jetzt über „+ Neu“ neben der Suche |
| Ablauf „Exportieren“: „Was soll exportiert werden?“ · „Format und Klang“ · „Bereit zum Speichern“ · „Weiter“ · „Zurück“ | Karte in der Mitte | Schritte statt Klappfeld |
| Tipp „+ Neu“ (create-neu) | Tipps | Der Tipp „Unter Erstellen …“ zeigt auf den verschwundenen Unterreiter |

## Geprüft, bleibt (13)

| Wort | warum |
|---|---|
| Tempo, Takt, Schlag, Loop, Klick, Mixer, Hall, Echo, EQ, FX-Pad | Etablierte Musikwörter, die Einsteiger überall wiedersehen |
| Kompressor, Verzerrer, Filter, Pumpen, Resonanz | Effektnamen, die man auch in anderen Programmen findet; die Regler dazu sind mit Alltagswörtern beschriftet (Stärke, Tiefe) |
| Ansprache / Ausklang | Deutsche Fachwörter für Attack/Release, ohne bessere Alltagsentsprechung gefunden |
| LUFS, dBTP, dB, BPM | Bleiben als Zahl mit Einheit; die Etiketten „Lautheit“ und „Spitze“ stehen davor (Tabelle) |
| Normalisieren (Sample bearbeiten) | Unsicher: „Auf Höchstpegel“ wäre klarer, trifft aber nicht genau; der Hinweistext „Auf −1 dB anheben“ erklärt es. Zur Abnahme. |
| Latenz einmessen (Aufnahme-Feld) | Unsicher: „Verzögerung“ könnte mit Echo verwechselt werden; Martin entscheiden lassen |
| Pattern (Marke am Clip, Liste der Sounds) | Unsicher: ein besseres Wort („Beat/Melodie“) hängt vom Typ ab; Marke wird dynamisch erzeugt, nicht in der Tabelle |
| Einrasten, Swing, Gleiten, Anschlag, Quantisieren-Hinweis | Musikalisch gebräuchlich, im Editor selbst mit Hinweistext |
| Stimme entfernen, Stille, Zuschneiden, Rückwärts, Einblenden, Ausblenden | Schon Alltagswörter |
| Öffnen, Speichern, Leeren, Tipps wieder zeigen, Tastenkürzel, Gesten | Schon Alltagswörter |
| Beschriftungen von Sound-Namen, Spurnamen, Projektname | Inhalt der Person bzw. der Bibliothek, wird nie umgeschrieben (Regal, Clips, Spurköpfe sind ausgenommen) |
| Mixer-Zeile „Keine Effekte“, „2 Effekte“ | Schon Alltagswörter |
| Texte am Handy und in Krachwerk | Bleiben bewusst alt: die Wörter gelten nur im Layout „reiter“ am Desktop |

## Hinweise

- Überschrift „Assets“ im Reiter Sounds: entfällt ganz (die Unterreiter samt Überschrift sind am Desktop durch „+ Neu“ ersetzt).
- Die Regel „ein Wort“ schreibt auch Sound- und Spurnamen nicht um (`#library`, `.clip`, `.track-head` sind ausgenommen). Heißt eine Spur „Master“ oder „Summe“, zeigen nur aria-label und Mixer-Zeile „Gesamt“.
- Texte, die nur beim Breitenwechsel zur Laufzeit neu entstehen, zeigen die alten Wörter bis zur nächsten Aktualisierung der Fläche.
