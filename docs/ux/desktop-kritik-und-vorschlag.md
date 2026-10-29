# Desktop-Layout: Kritik und Vorschlag (Stand 1.6)

Für Martin zum Entscheiden. Das Handy-Layout (≤ 760 px) bleibt unverändert.
Mockup: [`desktop-vorschlag.html`](desktop-vorschlag.html) (im Browser öffnen, hell/dunkel nach Systemeinstellung). Screenshots daneben: `ist-*.png` (heute) und `vorschlag-*.png`.

## Kurzfassung

1. Loopwerk verwirrt am Desktop, weil fast jede neue Funktion an eine bestehende Leiste angehängt wurde: Das Deck hat 22 gleich aussehende Bedienelemente in zwei Zeilen (bei 1280 × 720 in drei), und die Kopfzeilen der Editoren sind auf bis zu 12 Bedienelemente angewachsen.
2. Sobald ein Mixer oder Editor aufgeht, schrumpft der Arranger auf 352 px (1440 × 900) bzw. 201 px (1280 × 720, zwei Spuren). Der Clip, den man gerade bearbeitet, ist oft nicht mehr zu sehen, und der ganze Rahmen verrutscht um 16 px.
3. Bei 1280 × 720 passen Mixer und Melodie-Editor nicht mehr in ihr Fach: Die Kanalnamen, über die man die Effekte öffnet, sind abgeschnitten. Mit „Einsingen“ schrumpft die Piano-Roll auf 2 px, und die Seite fängt an zu scrollen.
4. Vorschlag A („Aufgeräumt“) behält die Aufteilung, räumt aber auf: Deck in einer Zeile, Clip-Werkzeuge in einer eigenen Arranger-Leiste, ein Fach mit Reitern unten, dessen Ränder sich nicht verschieben, und einheitliche Begriffe. Vorschlag B („Objekt im Mittelpunkt“) baut darauf auf und ergänzt rechts einen Inspektor, der immer das ausgewählte Objekt zeigt (Clip, Spur oder Song), sowie links den Reiter „Erstellen“ für Beat, Melodie, Einsingen, Aufnahme und Import.
5. Meine Empfehlung: B als Ziel, aber in zwei Schritten bauen. Schritt 1 ist Variante A, behebt alle Blocker und ist auch allein schon fertig. Schritt 2 ergänzt Inspektor und „Erstellen“.

## Wie ich geprüft habe

- Playwright, 1440 × 900 und 1280 × 720, hell und dunkel, mit dem Beispielprojekt. Abläufe: Start, Sound auswählen, Clip auswählen, Mixer und Kanal, Sample-Editor, Beat-Editor (Raster und Pads), Melodie-Editor mit Einsingen, Export, Spur-Menü.
- Maße per `getBoundingClientRect`, Zählung der sichtbaren Bedienelemente. Alle Zahlen unten sind gemessen.

| Messung | 1440 × 900 | 1280 × 720 |
|---|---|---|
| Höhe des Decks | 111 px (2 Zeilen) | 157 px (3 Zeilen, 22 % der Höhe) |
| Arranger ohne Fach | 1192 × 771 px, 8/8 Spuren | 1032 × 545 px, 8/8 Spuren |
| Arranger mit Fach | 1150 × **352** px, 5/8 Spuren | 990 × **201** px, **2**/8 Spuren |
| Rahmen beim Öffnen eines Fachs | Deck rückt von x = 0 auf x = 16, y = 0 auf y = 10 | dito |
| Bedienelemente beim Start | 138, davon 22 im Deck, 51 kleiner als 24 px | dito |
| Effekt-Schalter im Mixer | 63 (9 Kanäle × 7, abgekürzt: ZERR, KOMP, PUMP …) | dito |
| Master-Kanal im Mixer sichtbar | nein (nur über seitliches Scrollen) | nein |
| Piano-Roll ohne / mit „Einsingen“ | 150 px / **28 px** | 74 px / **2 px** |
| Sample-Editor: Inhalt / sichtbar | 409 / 327 px | 409 / 251 px |

## Probleme nach Wirkung

### Blockiert

**B1 – Das Fach drückt den Arranger zusammen, der bearbeitete Clip verschwindet.**
Ablauf: Clip „Riser“ (Spur FX) anklicken → „Bearbeiten“. Der Sample-Editor öffnet unten, im Arranger bleiben bei 1280 × 720 nur Drums, Hi-Hats und Bass sichtbar. Man bearbeitet einen Clip, den man nicht sieht.
Erwartet: Der bearbeitete Clip bleibt im Blick, der Arranger behält mindestens vier Spuren.
Belege: [`ist-06-sample-editor-1280-hell.png`](ist-06-sample-editor-1280-hell.png), [`ist-04-mixer-1440-hell.png`](ist-04-mixer-1440-hell.png).

**B2 – Fachinhalte passen nicht in ihr Fach.**
- Mixer bei 1280 × 720: Kanalnamen und M/S sind abgeschnitten. Der Name ist aber genau der Knopf, der die Effekte öffnet, also kommt man ohne Scrollen nicht an die Effekte. Der Master-Kanal liegt auch bei 1440 rechts außerhalb. Belege: [`ist-04-mixer-1280-hell.png`](ist-04-mixer-1280-hell.png), [`ist-05-mixer-kanal-1280-dunkel.png`](ist-05-mixer-kanal-1280-dunkel.png).
- Melodie-Editor mit „Einsingen“: Das Feld schiebt sich über die Piano-Roll (1440: 28 px, 1280: 2 px), die Klaviatur ragt 34 px aus dem Fach über die Hinweiszeile, und die Seite scrollt (739 px bei 720 px Fenster). Nach dem Einsingen sieht man die erkannten Noten nicht, man muss „Einsingen“ erst wieder zuklappen. Belege: [`ist-10-melodie-einsingen-1440-hell.png`](ist-10-melodie-einsingen-1440-hell.png), [`ist-10-melodie-einsingen-1280-dunkel.png`](ist-10-melodie-einsingen-1280-dunkel.png).
- Sample-Editor: „Trennen“, „Als Loop“ und „Name“ liegen auch bei 1440 unterhalb der sichtbaren Fläche.

### Umständlich

**U1 – Das Deck ist ein Sammelbecken.** Transport, Aufnahme, Mixer, Klick, Anzeige, Pegel, Rückgängig, Zoom, Raster, vier Clip-Knöpfe, Projektname, Öffnen, Speichern, Exportieren, Beispiel und Leeren sehen alle gleich aus. Die Zeilen brechen an zufälligen Stellen um; bei 1280 steht die Master-Anzeige allein links in Zeile 2. „Exportieren“ (Ziel jeder Session) wirkt so wichtig wie „Leeren“ und steht direkt daneben. Belege: [`ist-01-start-1440-hell.png`](ist-01-start-1440-hell.png), [`ist-01-start-1280-hell.png`](ist-01-start-1280-hell.png).

**U2 – Die Clip-Werkzeuge sind weit vom Clip entfernt.** Teilen, Bearbeiten, Duplizieren und Löschen stehen im Deck, rund 400 px über dem Clip, und sind ohne Auswahl dauerhaft ausgegraut. Lautstärke und Fades erreicht man nur über 11-px-Griffe, die erst beim Überfahren erscheinen. Teilen braucht drei Schritte (Clip auswählen, Abspielmarke im Lineal setzen, Teilen) und schneidet nur an der Abspielmarke. Am Handy gibt es dafür längst eine Werkzeugleiste am Clip. Beleg: [`ist-03-clip-gewaehlt-1440-hell.png`](ist-03-clip-gewaehlt-1440-hell.png).

**U3 – Das Regal hat drei Aufgaben.** Sounds finden, Neues bauen (Beat, Melodie) und Importieren. Vor dem ersten Sound stehen 266 px Bedienelemente: Import, Beat bauen, Melodie, Suche, Ordnen nach Kategorie/Genre und 8 Chips, dazu das Akkordeon. Das sind fünf sich überlagernde Wege, die Liste zu filtern. Die drei „+“-Knöpfe sehen aus wie Import-Felder (gestrichelt, Farbe „Eigene“). Beleg: [`ist-02-sound-gewaehlt-1440-hell.png`](ist-02-sound-gewaehlt-1440-hell.png).

**U4 – Gleiche Wörter für Verschiedenes, Verschiedenes für Gleiches.**
- „Raster“ bedeutet drei Dinge: das Einrasten im Arranger („Raster: Schlag“), die Ansicht im Beat-Editor („Raster | Pads“) und die Quantisierung der Live-Aufnahme („Raster 1/16“). Belege: [`ist-07-beat-raster-1440-hell.png`](ist-07-beat-raster-1440-hell.png), [`ist-08-beat-pads-1440-hell.png`](ist-08-beat-pads-1440-hell.png).
- Es gibt drei Aufnahmen an drei Orten: „Aufnahme“ im Deck (Audio auf eine Spur), „Einsingen“ im Melodie-Editor (wird zu Noten) und „Live“ im Beat-/Melodie-Editor (Pattern einspielen). Nirgends steht der Unterschied.
- Rückgängig gibt es doppelt: global im Deck und eigens im Sample-Editor (dort mit „Abbrechen/Übernehmen“).
- Eine Spur lässt sich über das × im Spurkopf und über „⋯ → Löschen“ entfernen. Das × liegt direkt neben dem Menü-Knopf.

**U5 – Die Fächer geben keine Orientierung.** Vier Eingänge an drei Orten: Mixer und Export im Deck, Sample-Editor über „Bearbeiten“ oder Doppelklick, Beat/Melodie im Regal. Ein neues Fach ersetzt das offene ohne Hinweis. Es gibt keine Reiter, die zeigen, was offen ist oder sein könnte. Esc schließt kein Fach, das × ist 28 px groß. Beim Öffnen verrutscht der ganze Rahmen (Rand 0 → 16 px, Abstand 0 → 10 px, das Deck wird zur Kachel). Belege: `ist-01-…` und `ist-04-…` im Vergleich.

**U6 – Neue Patterns landen irgendwo.** „+ Melodie“ legt den Clip an der Abspielmarke auf die erste freie Spur. Im Test landete „Melodie 1“ auf der Spur „Hi-Hats“, und der Arranger scrollt nicht hin. Beleg: [`ist-10-melodie-einsingen-1280-dunkel.png`](ist-10-melodie-einsingen-1280-dunkel.png).

**U7 – Der Mixer ist überladen und versteckt zugleich.** 63 Effekt-Schalter mit Abkürzungen. Die Einstellungen eines Effekts stehen in einer 400 px schmalen rechten Spalte, in der zwei von sieben Karten sichtbar sind. Vom Spurkopf führt kein Weg zu den Effekten der Spur. Ausgeschaltete Effekt-Karten sind im Dunkeln kaum lesbar (Deckkraft 0,55). Beleg: [`ist-05-mixer-kanal-1440-dunkel.png`](ist-05-mixer-kanal-1440-dunkel.png).

**U8 – Die Kopfzeile des Melodie-Editors ist voll.** Name, Takte, Klang, Notenlänge, Schritt-Eingabe, Weiterführen, Einsingen, Live, Raster, Anhören und Leeren stehen in zwei umbrechenden Zeilen. Die Ideen-Funktionen (Weiterführen, Einsingen) gehen zwischen Fachbegriffen unter. „Klang bauen“ steckt im Einsingen-Feld, obwohl es für jede Melodie gilt. Beleg: [`ist-09-melodie-1440-hell.png`](ist-09-melodie-1440-hell.png).

**U9 – Die Hinweiszeile ist die einzige Führung, aber kaum zu sehen.** 12 px grau am unteren Rand, im Ruhezustand eine Liste aus 9 Tastenkürzeln, die bei 1280 px gerade noch in eine Zeile passt.

### Kosmetisch

- K1: Die LCD-Anzeige hat fünf Zellen. „Tonart Am“ sieht einstellbar aus, ist es aber nicht; „Tempo“ ist einstellbar, sieht aber nicht so aus. Die Beschriftungen (Amber auf Dunkel) sind sehr kontrastarm.
- K2: Die Versionsnummer belegt Platz im Deck.
- K3: Beat-Patterns sind rosa (Farbe „Eigene“), Drums sonst rot. Das bricht die Farbcodierung.
- K4: 51 Bedienelemente sind kleiner als 24 px (M/S 24 × 20, Effekt-Schalter 20 px hoch, ⋯ 22 px, × 20 px). Am Desktop geht das, es fühlt sich aber fummelig an.
- K5: Der Quellenhinweis steht dauerhaft unten im Regal.

## Klicks für fünf Kernaufgaben

| Aufgabe | Heute | A „Aufgeräumt“ | B „Objekt im Mittelpunkt“ |
|---|---|---|---|
| Loop einsetzen | 1× ziehen oder 2 Klicks (andere Kategorie +1) ✔ | gleich ✔ | gleich ✔ |
| Clip verschieben/kürzen | 1× ziehen, linker Rand erst beim Überfahren sichtbar | gleich, Ränder immer sichtbar beim ausgewählten Clip | gleich |
| Clip teilen | 3 (Clip, Lineal, „Teilen“ oben im Deck) | 3 (Clip, „Teilen“ direkt über dem Arranger, Stelle anklicken: Schere, wenn die Abspielmarke nicht im Clip steht) | 3 (dito, im Inspektor) |
| Beat bauen | 1 + Felder; Clip landet evtl. außer Sicht auf fremder Spur | 1 + Felder; Clip wird angezeigt, Spur heißt „Beat 1“ | 2 + Felder (Erstellen, Beat bauen) **oder** Karte auf die Wunschstelle ziehen |
| Melodie einsingen | 3 bis zur Aufnahme (+ Melodie, Einsingen, Aufnehmen), +1 Stopp, +1 Einsingen zuklappen, um die Noten zu sehen = **5** | 2 bis zur Aufnahme („Einsingen“ im Regal-Kopf, Aufnehmen), +1 Stopp = **3**, Noten sofort sichtbar | 3 bis zur Aufnahme (Erstellen, Melodie einsingen, Aufnehmen), +1 Stopp = **4**, Noten sofort sichtbar |
| Song exportieren | 2 ✔, aber der Arranger schrumpft auf 352/201 px | 2, Klappfeld unter dem Knopf, Arranger bleibt | 2, dito |

## Vorschlag

Beide Varianten teilen fünf Bausteine. B ergänzt zwei weitere.

### Gemeinsame Bausteine (= Variante A)

**1. Ein Deck in einer Zeile (52 px)** → behebt U1, K1, K2
- Links: Logo, Transport (Anfang, Start, Loop, Aufnahme, Klick), Anzeige mit Takt.Schlag, Zeit, Tempo und Tonart. Tempo und Tonart sind sichtbar einstellbar (gepunktete Linie, Pfeil); die Tonart ist schon für die geplante Songtonart vorbereitet. Daneben der Master-Pegel.
- Rechts: Projektname als Menü (Öffnen, Speichern, Beispiel laden, Leeren, Über Loopwerk 1.6), Rückgängig/Wiederholen und **Exportieren** als einziger hervorgehobener Knopf.
- Raster, Zoom und die Clip-Knöpfe ziehen aus dem Deck aus (siehe 2).

**2. Eigene Leiste über dem Arranger** → behebt U2
- Links Raster und Zoom, also dort, wo sie wirken.
- Rechts erscheinen beim ausgewählten Clip seine Werkzeuge: Bearbeiten, Teilen, Duplizieren, Löschen und „Pegel ▾“ mit Reglern für Lautstärke und Ein-/Ausblenden. Das ist die Werkzeugleiste vom Handy, nur oben. Ohne Auswahl steht dort ein kurzer Hinweis, was als Nächstes geht.
- Teilen: Steht die Abspielmarke nicht im Clip, wird der Mauszeiger zur Schere, und ein Klick auf die gewünschte Stelle teilt dort.

**3. Ein Fach unten mit Reitern; die Ränder ändern sich nie** → behebt B1 und U5
- Unten eine feste Leiste (34 px) mit den Reitern **Mixer** und **Editor · ‹Name›** (Sample-, Beat- oder Melodie-Editor, je nach ausgewähltem Clip), daneben die Hinweiszeile in normaler Größe und „? Tastenkürzel“. Mixer- und Fach-Eingang liegen damit dort, wo das Fach aufgeht, wie die Leiste am Handy.
- Es ist immer nur ein Fach offen (wie heute), aber man sieht, welches. Esc schließt es, die Höhe lässt sich an der Kante ziehen.
- Rand und Abstände sind immer gleich (8 px), nichts springt.
- Beim Öffnen werden die Spuren flacher (50 statt 58 px), und der Arranger scrollt den bearbeiteten Clip in Sicht. Der Arranger behält so mindestens vier Spuren (1440 × 900 im Mockup: 432 px, 7 Spuren statt 352 px und 5).
- Export wird ein kleines Klappfeld unter seinem Knopf statt eines Fachs; der Arranger bleibt unverändert.

**4. Fachinhalte, die passen** → behebt B2, U7, U8
- Mixer: volle Kanalnamen oben und immer sichtbar. Statt 7 Schaltern zeigt jeder Kanal „2 Effekte“ / „keine Effekte“ (Klick öffnet die Effekte). Der Master-Kanal ist rechts angeheftet. Die Effekt-Details stehen als Liste mit Schaltern statt als Kacheln.
- Melodie-Editor: Das Einsingen-Feld steht **links neben** der Piano-Roll statt darüber, sodass die erkannten Noten sichtbar bleiben. In der Kopfzeile stehen nur noch Klang, Takte, Anhören, Weiterführen, Einsingen und „Mehr ▾“ (Notenlänge, Einrasten, Schritt-Eingabe, Live, Leeren).
- Sample-Editor: Die Werkzeuggruppen werden Unterreiter (Schneiden · Klang · Tonhöhe & Autotune · Trennen · Loop & Name), sodass nur eine Gruppe gleichzeitig zu sehen ist und nichts mehr unter dem Rand verschwindet.

**5. Begriffe und Doppelungen bereinigen** → behebt U3, U4, U6, U9, K3
- „Raster“ gibt es nur noch im Arranger. Im Beat-Editor heißen die Ansichten „Schritte | Pads“, bei der Live-Aufnahme heißt es „Einrasten: 1/16“.
- Das × im Spurkopf entfällt; Löschen bleibt im Spur-Menü ⋯ (keine Funktion geht verloren).
- Regal-Kopf in A: vier kompakte, gleich aussehende Knöpfe (Beat, Melodie, Einsingen, Import), dann Suche mit „Kategorie ▾“ (Kategorie/Genre wird zum Auswahlmenü) und Chips. Der Quellenhinweis wandert ins Menü „Über“.
- Neue Patterns und Aufnahmen bekommen eine eigene, passend benannte Spur oder benennen die freie Spur um, und der Arranger scrollt zu ihnen.
- Beat-Patterns bekommen die Drums-Farbe, Melodien die Synth-Farbe.

### Variante B zusätzlich: „Objekt im Mittelpunkt“

**6. Linke Spalte mit zwei Reitern: Sounds | Erstellen** → behebt U3 und U4 (drei Aufnahmen)
- „Sounds“ ist das bisherige Regal, aber nur zum Finden.
- „Erstellen“ zeigt Karten mit je einem Satz Erklärung: Beat bauen, Melodie schreiben, Melodie einsingen („wird zu Noten“), Audio aufnehmen („als Sound auf eine Spur“) und Datei importieren. Die drei Aufnahmearten stehen untereinander, der Unterschied ist auf einen Blick klar.
- Karten sind Objekte, wie im Original: Klick legt sie an der Abspielmarke an, Ziehen auf eine Spur legt sie genau dort ab. Hier ist auch Platz für Kommendes wie den Song-Starter.

**7. Inspektor rechts (296 px): zeigt immer das ausgewählte Objekt** → behebt U2, U7 grundsätzlich
- **Clip**: Name, Spur, Länge; Lautstärke, Ein- und Ausblenden als Regler; Bearbeiten, Teilen, Duplizieren, Löschen. Darunter die **Spur** des Clips mit Panorama und ihren Effekten als Schalterliste; ein angeschalteter Effekt klappt seine 1–2 wichtigsten Regler auf.
- **Spur** (Klick auf Spurname oder Mixer-Kanal): Lautstärke, Panorama, alle Effekte.
- **Nichts ausgewählt → Song**: Tempo, Tonart, Länge, Master-Effekte (später Ein-Klick-Mastering).
- Damit haben Effekte genau einen Ort, und der Mixer wird zur reinen Übersicht. Die Clip-Werkzeuge stehen im Inspektor statt in der Arranger-Leiste.

### Was Variante B kostet

- Der Arranger wird schmaler: 854 statt 1166 px bei 1440 (etwa 7 statt 10 Takte bei Standard-Zoom); in der Höhe gewinnt er (780 statt 771 px ohne Fach).
- Bei 1280 bliebe ohne Gegenmaßnahme zu wenig Breite. Vorschlag: Unter 1366 px startet der Inspektor eingeklappt als 44-px-Leiste mit Objektnamen und klappt bei Klick als Überlagerung auf.
- Melodie einsingen und Beat bauen kosten per Klick einen Schritt mehr (Reiter „Erstellen“), es sei denn, man zieht die Karte direkt auf die Spur.

### Empfehlung

**Variante B in zwei Schritten.** Schritt 1 = Bausteine 1–5 (Variante A): behebt beide Blocker, die Sprünge und das Durcheinander im Deck, und ist einzeln auslieferbar. Danach mit Martin am echten Bildschirm prüfen. Schritt 2 = Bausteine 6 und 7. Der Inspektor ist das Muster, das die Ursache behebt: Jede neue Funktion hat einen festen Platz („gehört zum Clip / zur Spur / zum Song / zum Erstellen“) und muss nicht mehr an eine Leiste angehängt werden. Die nächsten Funktionen aus dem Markt-Scout (Songtonart, Effekt-Pad, Ein-Klick-Mastering, Song-Starter) haben in B schon ihren Ort.

Falls die geringere Arranger-Breite stört, ist A allein ein vollständiger, deutlich ruhigerer Stand.

## Was gleich bleibt

- Das Handy-Layout komplett (Deck, Leiste, Fach, Clip-Werkzeugleiste, Fingertexte).
- Die Farben, Schriften, Tokens und Bedienelemente (`.key`, `.dbtn`, Chips, LCD), Hell/Dunkel.
- Alle Funktionen und Tastenkürzel, Drag & Drop aus dem Regal, die Griffe an den Clips, Doppelklick öffnet den Editor.
- Die Grundaufteilung Regal links, Arranger in der Mitte, Fach unten, wie im Original.
- Store-Aktionen, Undo/Redo, die Element-IDs (die Tests greifen darauf zu; die Bausteine verschieben Elemente, statt sie neu zu bauen).

## Aufwand grob

| Baustein | Aufwand | Anmerkung |
|---|---|---|
| 1 Deck in einer Zeile, Projekt-Menü, Export-Klappfeld | M | `mobile.js` verschiebt Deck-Gruppen am Handy nach „Mehr“; die neuen Desktop-Orte brauchen eigene Platzhalter. |
| 2 Arranger-Leiste mit Clip-Werkzeugen, Schere beim Teilen | M | Die Werkzeugleiste vom Handy (`#clipbar`) kann wiederverwendet werden. |
| 3 Fach mit Reitern, feste Ränder, Esc, Höhe ziehen, Clip in Sicht | M | `ui.setDock()` bleibt; neu sind die Leiste unten und die Spurhöhe bei offenem Fach. |
| 4 Fachinhalte (Mixer-Zusammenfassung, Einsingen daneben, Unterreiter im Sample-Editor) | M | |
| 5 Begriffe, × im Spurkopf, Regal-Kopf, Spur für neue Patterns, Farben | S | |
| 6 Reiter Sounds/Erstellen mit ziehbaren Karten | M | Ziehen einer Karte auf eine Spur ist neu (Pattern an der Ablegestelle anlegen). |
| 7 Inspektor (Clip/Spur/Song), Effekte nur noch dort | L | Der größte Brocken; das Effekt-Rack aus `mixer.js` zieht in den Inspektor um. |

Variante A ≈ 1–5 (vier M, ein S). Variante B ≈ A + M + L. Zu jedem Baustein gehören Desktop-Tests (bestehende IDs bleiben, neue Abläufe kommen dazu) und ein Lauf von `tests/mobil.test.cjs`, um sicherzustellen, dass das Handy unverändert bleibt.

## UX-Check (Skill `ux-check`), heute → Vorschlag B

| # | Punkt | Heute | B |
|---|---|---|---|
| 1 | Grundfunktion in ≤ 2 Klicks | ✘ Einsingen 3 (+2), Teilen 3 | ✔ außer Teilen (3, aber ohne Lineal) |
| 2 | Ohne Einstellungen | ✔ | ✔ |
| 3 | Ergebnis am Objekt | ✘ Effekte nur im Mixer-Detail, Clip-Werkzeuge im Deck | ✔ Inspektor folgt der Auswahl |
| 4 | Drag & Drop | ✔ Sounds; ✘ Beat/Melodie nur per Klick | ✔ auch Erstellen-Karten |
| 5 | Raster | ✔ (Begriff dreifach belegt) | ✔ eindeutig |
| 6 | Rückgängig | ✔ (zweites Rückgängig im Sample-Editor) | ✔ |
| 7 | Hinweiszeile | ✘ 12 px grau, Kürzelliste | ✔ normale Schrift, Tipp je Lage, Kürzel unter „?“ |
| 8 | Rückmeldung | ✘ neues Pattern evtl. außer Sicht, Fach ersetzt Fach still | ✔ Reiter zeigt offenes Fach, Clip wird angezeigt |
| 9 | Grenzen erklärt | ✔ | ✔ |
| 10 | Tastatur/Fokus | ✘ Esc schließt kein Fach | ✔ Esc schließt das Fach |
| 11 | Kontraste | ✘ LCD-Beschriftungen, ausgeschaltete Effekte (dunkel) | ✔ |
| 12 | Handy-Breite | ✔ | ✔ unverändert |
| 13 | Reduzierte Bewegung | ✔ | ✔ keine neuen Animationen |

## Offene Fragen an Martin

1. **A oder B?** Reicht dir „Aufgeräumt“, oder willst du den Inspektor rechts, und ist dir der schmalere Arranger (≈ 7 statt 10 Takte sichtbar) das wert?
2. **Welche Bildschirmgröße nutzt du und wer sonst?** Wenn 1280 × 720 (oder ein Laptop mit Browserleisten) häufig ist, wird der eingeklappte Inspektor dort zum Normalfall.
3. **Spurlautstärke im Spurkopf:** behalten (heute so, im Mockup so) oder nur noch im Mixer/Inspektor, damit die Spurköpfe ruhiger werden?
4. **„Aufnahme“ im Deck:** als Transportknopf behalten (Musiker-Gewohnheit) oder nur noch unter „Erstellen → Audio aufnehmen“?
5. **Teilen mit Schere:** passt dir „Steht die Abspielmarke nicht im Clip, klickst du die Stelle an“, oder soll Teilen immer per Klick auf die Stelle gehen?
6. **Export als Klappfeld** statt Fach: in Ordnung?
