# ADR 004 – Look „Phosphor“ statt „Werkstück“

**Stand:** 30.10.2026 · **Status:** angenommen (Martin: „mach alles Phosphor, ja still ist schwarz“)

## Kontext
Seit 2.0 trägt Loopwerk den Look „Werkstück“ (Graphit, Gummitasten, Orange als einzige Signalfarbe). Martin wollte eine schwarze, minimalistische Richtung mit leuchtenden Highlights und einen Hintergrund, der auf die Musik reagiert. Der UI-Designer hat „F · Phosphor“ entworfen (`docs/ux/richtungen/f-phosphor.html`), der Creative Director hat sie mit Auflagen freigegeben (`docs/ux/cd-review.md`). Der Hell-Modus ist seit 2.1 gestrichen.

## Entscheidung
Phosphor ersetzt Werkstück vollständig:
- **Was klingt, leuchtet; was eingestellt ist, ist eine Linie.** Kategoriefarben erscheinen als Licht (Clipname, Wellenform, Spurpunkt, Umgebungslicht, Funken an der Marke). Regler und Tasten sind Haarlinien.
- **Weißglut statt Orange:** `--amber` ist Weiß. Aktiv = weiß gefüllt mit Schein (Spielen-Linse, Solo, Export, Haupt-Knöpfe) oder weiße Haarlinie mit leuchtender Schrift (Loop, Klick, gewählte Segmente). Rot bleibt für Aufnahme und Löschen. Die Regel „Orange nur für Transport und Aktives“ entfällt.
- **Still ist schwarz:** Ohne Wiedergabe gibt es kein Umgebungslicht.
- Schriften: Funnel Display (Titel, Wortmarke), Funnel Sans (Inhalte), Azeret Mono (Anzeigen, Beschriftungen).
- Auflagen des Creative Directors: Tippflächen am Handy mindestens 44 px (M/S im Spurkopf mit unsichtbarer Erweiterung), Schrift am Handy mindestens 11 px, Stumm ist Schraffur und Haarlinie (nicht das hellste Element), Tastenrahmen heller (`--key-line: #34343A`).

## Umsetzung
Tokens in `:root` (gleiche Namen, neue Werte), eine Stilschicht „Phosphor“ am Ende des Stylesheets, Wellenform als Lichtstriche (`arranger.js`), Umgebungslicht hinter der ganzen Seite (`glow.js`), Ladescreen in Phosphor.

## Folgen
- Werkstück-Bausteine (Gummi, Display-Kasten, LED-Punkte, Etiketten) sind über die Tokens neutralisiert; die alte Werkstück-Schicht bleibt als Grundlage darunter und kann später ausgedünnt werden.
- Offen: Leistung des Lichts am echten Handy messen (Ziel unter 2 ms je Bild); Lichteinstellung „voll / sparsam / aus“.
