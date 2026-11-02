# Creative-Director-Review

Neueste Prüfung oben.

---

## Krachwerk Scheibe 1 (02.11.2026)

**Geprüft:** Bilder in `docs/ux/krachwerk-brainstorm/shots-1b/` (alle sieben, Deck und Clip in Ausschnitten vergrößert), Vergleich mit `shots/ist-*.png` und Richtung B in `richtungen.png` (Ausschnitte). Dazu die App selbst unter `/werkstatt/` per Playwright, Handy 390×844 (Touch) und Desktop 1400×820, mit einem Clip „Bumm 1“ auf Spur 1 und gewählt. Gemessen habe ich mit `tests/count.cjs` und an den Rechtecken von Werkzeug, Spurköpfen und Spuren. Grundlage: `synthese.md` (Zielbild), `docs/specs/krachwerk-1-geruest.md`.

**Zählwerte (Clip gewählt), selbst nachgemessen:** Desktop 54 / 30 / 4 / 11, Handy 18 / 8 / 4 / 11 (Bedienelemente / Rahmen / Schriftgrößen / kleinste). Handy *Start* 15 / 4, *Werkbank Mitte* 23 / 13. Damit sind die 1b-Budgets eingehalten, und am Handy liegt der Wert schon unter dem Endziel (22 / 15). Keine Konsolenfehler.

### 1. Urteil

Das Gerüst trägt drei von vier Teilen von Martins Wunsch: Es ist erkennbar Loopwerk, es ist deutlich ruhiger, und alle Funktionen sind da. Der vierte Teil, „mehr Raum fürs Selbermachen“, ist noch nicht zu sehen: Die Werkbank ist der alte Inspektor, ⤢ nimmt dem Song den Platz weg, statt dem Klang welchen zu geben, und der leere Start lädt nicht zum ersten Geräusch ein.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Die Punkte 1 bis 5 aus Abschnitt 3 („jetzt“) werden vorher behoben. Alle sind klein, keiner braucht eine neue Spec. Martin soll dabei ausdrücklich erfahren, dass er in Scheibe 1 Lage, Ruhe und den ersten Laut beurteilt und noch nicht die Werkbank. Die Werkbank kommt mit Scheibe 2.

### 2. Was gelungen ist

1. **Die Ruhe ist echt und nicht nur ausgeblendet.** Am Handy zählt das Bild „Clip gewählt“ 18 Bedienelemente und 8 Rahmen, in Loopwerk sind es 43 und 27. Das liegt unter dem Endziel. Es gibt nur noch vier Schriftgrößen, die kleinste hat 11 px, und die Versalien-Etiketten sind weg. Neben `ist-handy-clip.png` liest sich `kw-clip-handy.png` wie eine andere Klasse von Ruhe, obwohl beide auf demselben DOM laufen. So hatte die Synthese die Ruhe-Schicht gemeint.
2. **Die Daumenleiste setzt die Entscheidung genau um:** Kiste · ▶ · ● · Werkbank, 64 px hoch, das ● hat eine Tippfläche von 92 × 64 px. Die beiden häufigsten Tipps liegen in der Mitte unter dem Daumen, und oben steht nur, was man liest (Name, Takt, Tempo, ↶ ↷).
3. **Die Werkbank-Schublade lässt den Song stehen.** Auf „Mitte“ beginnt sie bei y = 414. Darüber bleiben beide Spuren, der Clip und die Marke sichtbar. Damit ist die größte Gefahr von Richtung B („die Werkbank frisst die halbe Bühne“) für das Handy gebannt.
4. **Das Werkzeug am Clip ersetzt die Clipleiste mit fünf Knöpfen durch drei Wörter direkt am Objekt** („Teilen · Kopie · Löschen“, 52 px hoch, ohne Rahmen). Das ist die Grammatik „Rahmen nur, wo man drückt“, und es ist der richtige Schritt weg vom Inspektor als Werkzeugkasten.
5. **Die Kiste nach Quelle mit „+ Neu“ statt der Reiter Suchen/Erstellen** ist die eigenständigste Fläche der Scheibe. Die Gruppen tragen Zähler und einen Herkunftspunkt, Filterchips, Sortierung und Genre fehlen, und man vermisst sie nicht. **Rot ist eingehalten:** Es erscheint nur am ● (Punkt, also mit Form) und an „Löschen“. Sonst ist nirgends Rot zu sehen.

### 3. Was stört (nach Gewicht)

| # | Befund (gemessen) | Vorschlag | Wann |
|---|---|---|---|
| 1 | **Das Werkzeug am Clip verdeckt die Spurköpfe.** Am Handy beginnt es bei x = 89, der Spurkopf endet bei 124. Es liegt also 35 px über dem Kopf von Spur 2, mitsamt dem ⋯-Menü. Am Desktop mit ⤢ beginnt es bei x = 336, der Kopf endet bei 433. Dort liegt es 97 px über M, S und dem Panorama-Knopf von Spur 2. Am Handy steht außerdem das rote „Löschen“ direkt neben „Werkbank“, dem Knopf, den man dort am häufigsten tippt. | Das Werkzeug nur im Spurbereich halten (linke Kante ≥ rechte Kante der Spurköpfe, nicht nur innerhalb `#arr-wrap`). Liegt der Clip am linken Rand, beginnt es bündig am Spuranfang. Reihenfolge am Handy: **Werkbank · Teilen · Kopie · Löschen**, Löschen also außen und mit Abstand. Der Test aus §7 („deckt den Clip nicht ab“) bekommt die Prüfung „deckt keinen Spurkopf ab“. | **jetzt** |
| 2 | **⤢ erdrückt den Song.** Mit Werkbank auf 60 % bleiben am Desktop für den Arranger 296 px, für die Spuren davon etwa 117 px. Das ist gut ein Takt (`kw-breit-desktop.png`). Damit dreht ⤢ die Absicht der Synthese um, denn lange Aufnahmen sieht man jetzt schlechter im Zusammenhang. | Beim Breitziehen klappt die Kiste automatisch auf 24 px zu und beim Zurückschalten wieder auf (der Zustand der Kiste bleibt gemerkt). Die 60 % beziehen sich auf die Breite rechts der Kiste. Der Song muss mindestens 4 Takte zeigen, und das gehört in den 1b-Test. | **jetzt** |
| 3 | **Der leere Start spricht nicht.** Man sieht zwei leere Spuren, 700 px schwarzen Grund und in der Kiste „Keine Sounds gefunden.“, eine Fehlermeldung statt einer Einladung. Wer `/werkstatt/` zum ersten Mal öffnet, weiß nicht, dass ● hier ohne Vorzähler sofort einen Clip macht. Genau diesen Ablauf soll Martin aber prüfen. | Die Startkarte gehört weiter zu Scheibe 4. Jetzt nur zwei Leerzustände, die sofort verschwinden: In der leeren Spur 1 steht leise eine Zeile „● tippen, dann ein Geräusch machen“ (`--muted`, 13 px, kein Kasten). Die leere Kiste sagt „Noch nichts aufgenommen“. Das ist ein Leerzustand und kein Erklärtext und verträgt sich damit mit der Regel „keine Erklärtexte“. | **jetzt** |
| 4 | **Tonart- und Akkordzeile kosten am Handy 88 px**, also mehr als eine Spur (62 px), und zeigen nur zweimal „Am“. Dazu kommen 44 px Lineal und 44 px Zeile für Raster und Loop. Vor der ersten Spur sind damit 200 px von 844 verbraucht. Am Desktop kosten die beiden Zeilen 44 px. Das Zielbild sagt „Tonart- und Akkordzeile nur auf Wunsch“. | In `calm` bekommen beide Zeilen Stufe 3, solange der Song keine Tonart- oder Akkordwechsel hat. Zwilling ist das Song-Fach (Tonart steht dort), der Eintrag kommt in `EDITION.twins`. Sobald ein Wechsel gesetzt ist oder „Einsingen“ eine Tonart erkennt, erscheinen die Zeilen. | **jetzt** |
| 5 | **Die Werkbank ist der alte Inspektor**, und man sieht es an den toten Teilen: ausgegraute Knöpfe „÷2 · ×2 · Als Song-Tempo · A/B“, ein leeres Feld „–“, „Einzelklang · Tempo eingeben“ in Mono (Wörter in Mono verstoßen gegen §5.6), am Desktop M/S doppelt (Spurkopf und Werkbank). Ein Einzelklang hat kein Sound-Tempo. Der Block ist für ihn reines Rauschen und an der Stelle, an der das Selbermachen Raum bekommen soll. | **Jetzt:** In `calm` stehen gesperrte Bedienelemente nicht sichtbar da. Den Block Sound-Tempo bei Einzelklang ganz weglassen. Werte, die aus Wörtern bestehen („aus“, „Mitte“, „Einzelklang“), in Sans setzen. **Scheibe 2:** Welle in voller Breite oben, Reiter mit ≤ 5 Griffen, Spurabschnitt nur noch auf eigener Auswahl. | **jetzt** (gesperrte Knöpfe, Mono) / Scheibe 2 (Rest) |
| 6 | **Das Deck ist am Desktop handwerklich unsauber.** Die Wortmarke steht in zwei Größen und zwei Schriften („Krach“ 15 px Funnel Display 300, „werk“ 13 px Funnel Sans fett, der calm-Block erfasst `.brand-name b` nicht). Das Zeichen davor ist noch Loopwerks Balken in Kategoriefarben, nicht der pinke Klatscher aus `krachwerk.svg`. Die Beschriftung des Loop-Knopfs sprengt den 36-px-Kasten und klebt am Ring von ▶. Im Lineal liegt der Startgriff der Marke über der „1“. | **Jetzt:** Die Wortmarke einheitlich auf `--fs-15` in Display setzen, „werk“ fett wie in Loopwerk. Loop als Symbol im Kasten (wie in Loopwerk) oder mit Breite nach Inhalt und 8 px Abstand. **Scheibe 2:** das Krachwerk-Zeichen im Deck (die Funken aus `glow.js` hängen an `#brand-bars`, also mit dem motion-designer). | **jetzt** (Schrift, Loop) / Scheibe 2 (Zeichen) |
| 7 | **Derselbe Klang hat zwei Farben.** „Bumm 1“ ist in der Kiste orange (Gruppe Aufnahmen, `--cat-fx`) und im Song pink (`--cat-own`). Die Griffe für Ein- und Ausblenden liegen auf dem Clipnamen („Bumm 1“ ist halb verdeckt). Am Handy wird die automatisch benannte Spur zu „Bum…“ gekürzt. | Die Herkunftsfarben im Song kommen mit Scheibe 2 (laut Spec), bis dahin ist der Widerspruch hinnehmbar. Die Griffe sitzen unterhalb der Namenszeile. Der Spurname am Handy bekommt den Platz des ⋯ (das Menü öffnet ohnehin per langem Druck). | Scheibe 2 |
| 8 | **Am Desktop sind noch Reste von Loopwerk sichtbar:** die Fachleiste unten (Mixer · FX-Pad · Editor · Tastenkürzel), Spurköpfe mit Panorama-Knopf, 54 statt 45 Bedienelemente. Das Zielbild sagt „keine Fachleiste“. | Mischen und FX-Pad wandern in die Song-Werkbank, der Editor geht in der Sound-Werkbank auf. Der Spurkopf am Desktop zeigt nur Name und M/S als Buchstaben, Panorama gehört in die Spur-Werkbank. Damit ist das Endziel 45 erreichbar. | Scheibe 2 |

### 4. Was Martin am echten Handy prüfen soll

1. **Erster Laut:** `/werkstatt/` öffnen, ● tippen, zweimal auf den Tisch klopfen, nichts weiter tun. Hört die Aufnahme von selbst auf, und läuft der Klang sofort im Loop, ohne Klick vorn und ohne Stolpern? (Ohr-Test aus der Spec)
2. **Werkzeug am Clip mit dem Daumen:** Clip antippen, dann „Kopie“ und „Werkbank“ treffen, ohne versehentlich „Löschen“ zu erwischen. Verdeckt das Werkzeug etwas, das du gerade brauchst?
3. **Schublade:** die Werkbank auf „Mitte“ und „oben“ ziehen und darin scrollen. Kämpfen Ziehen und Scrollen miteinander? Bleiben Marke und Clip auf „Mitte“ im Blick, während der Loop läuft?
4. **Lesbarkeit:** Taktzahlen im Lineal und „Takt/Tempo“ sind 11 px groß. Reicht das draußen bei Tageslicht und nach einer Stunde Arbeit?
5. **Übernahme und offline:** Liegen die alten Pad-Klänge in der Kiste unter „Aufnahmen“? Erscheint der Einblender genau einmal? Startet die installierte App im Flugmodus mit deinem Klang?

---

## F · Phosphor (30.10.2026)

**Geprüft:** `docs/ux/richtungen/f-phosphor.html` (im Browser per Playwright vermessen: Tippflächen, Schriftgrößen), `f-phosphor.png`, `f-phosphor-handy.png`, `f-phosphor-desktop.png` (auch in Ausschnitten um Marke und Auswahl), Abschnitt „F · Phosphor“ in `docs/ux/richtungen/README.md`. Zum Vergleich: `docs/specs/v2.0-werkstueck.md`, `docs/ux/abgleich/README.md`, Scheduler in `src/engine.js` (Vorlauf 150 ms, Takt aus dem Worker).

**Briefing (Martin):** „vordergründig in schwarz in minimalistisch cleaner Anmutung und leuchtenden highlights“, Awwwards-Niveau, primär dunkel. Dazu: unscharfer Hintergrund, der auf die Wiedergabe reagiert (Lautstärke als Amplitude, Farben der klingenden Kategorien), Abspielmarke bringt die Sounds direkt darunter zum Leuchten, Partikel in Clipfarbe, „als würde der Indikator reinlasern“.

### Urteil: freigegeben zur Durchsicht, mit Auflagen vor der Umsetzung

Martin kann F so ansehen, wie es ist. Die Auflagen unten müssen in die Spec und in einen Licht-Prototyp, bevor Code an der App entsteht. Ohne sie gebe ich F nicht zur Umsetzung frei.

### Warum freigegeben

1. **Die Idee trägt und ist eigenständig.** „Licht kommt aus der Musik“ ist ein Satz, aus dem sich jede Einzelentscheidung ableiten lässt: Was klingt, leuchtet; was eingestellt ist, ist eine Linie; Auswahl ist Zeichnung. Das ist mehr als ein dunkles Theme mit Glow. Es löst nebenbei den größten Befund des Abgleichs (A1, Orange auf zu vielen Flächen) grundsätzlich statt punktuell: Im Ruhezustand leuchtet nichts.
2. **Martins Wunsch ist wörtlich umgesetzt.** Marke als weißer Strahl, die Wellenform direkt an der Marke voll hell, Funken in Clipfarbe, Umgebungslicht aus den Farben der klingenden Spuren. Der Ausschnitt um Takt 8 (Desktop) ist die stärkste Stelle aller bisherigen Entwürfe: Gelb auf Drums, Blau auf Bass, grüner Funke auf der eingeklappten Gruppe, und trotzdem bleiben die Clipnamen lesbar.
3. **Handwerk auf hohem Niveau.** Klare Typo-Rollen (dünne Azeret-Ziffern für das Gerät, Funnel Sans für alles, was der Mensch hineinlegt), zwei Radien plus Kreis für Funktionen, konsequente Haarlinien. „3 Clips“ in Funnel Display 300 im Inspektor, das freistehende Display ohne Kasten: Das ist ruhig und wertig, nicht dekoriert.
4. **Zustände ohne Farbe sind durchdacht.** Spielen = Helligkeit, Gewählt = Kante + Ecken + Griff, Stumm = durchgestrichen + Schraffur, Vorschlag = gestrichelt. Spielen und Gewählt überlagern sich ohne Verwechslung. Die gestrichelten Vorschläge des Wunsch-Agenten im Arranger sind eine gute, eigene Lösung.
5. **Kontrast stimmt.** Nachgerechnet: Leise `#9898A1` auf Grund 7,2 : 1, Bass-Blau auf Clip 6,3 : 1, Tageslicht-Drums `#946200` 4,7 : 1. Die Angaben im README sind korrekt.

### Was nicht stimmt

**Bedienung am Handy (gemessen im Mockup):**
- Fader-Kappe **24 × 5 px**. Das ist das Hauptwerkzeug im Mixer, und im README fehlt es bei den Tippzielen. Ebenfalls zu klein: Segment Sounds|Erstellen 178 × **28**, Panorama-Knöpfe **32 × 32**, M/S im Spurkopf 26 × 22 (vom Designer selbst benannt).
- Schrift: 22 Textstellen in **8,5 px** (Display-Beschriftung, Panorama-Werte „Mitte/L 15“, Inspektor-Tasten), „Vorschlag“ in **8 px**, Reiter der Fachleiste in **9 px**, fast alles in `--muted`, Großbuchstaben mit +0,12 em. Für stundenlanges Arbeiten am Handy ist das zu klein. Das war auch in Werkstück knapp; Phosphor verschärft es, weil die Schrift ohne Taste und Mulde frei auf Schwarz steht.
- Tastenkanten `--line` mit **1,27 : 1**. Formal erlaubt (die Beschriftung trägt), aber für Einsteiger und bei Sonne am Handy sind M/S, Loop, Teilen kaum als Tasten zu erkennen. „Niedrigschwellig“ verlangt mehr Halt.

**Widerspruch zur eigenen Idee:**
- **Stumm leuchtet.** M an ist weiß gefüllt und damit das hellste Element im ganzen Mixer, ausgerechnet auf dem Kanal, der still ist. Das bricht „was klingt, leuchtet“.
- **Hinweiszeile am Desktop** („Leertaste spielt · Strg+Z macht Rückgängig“). Das widerspricht der Regel „keine Erklärtexte (dafür Tipps)“ und der eigenen Grundlage im README („Die Hinweiszeile fällt weg“).

**Abweichung von Martins Worten:**
- Martin: Leuchten „nur direkt an der Marke“. F lässt die Wellenform über **120 px / 0,5 s** nachglimmen. Das ist schön, aber nicht bestellt, und auf dem Desktop wird der Hof dadurch eher ein runder Fleck als ein Laserpunkt.
- Martin: „nur gelbe Drums → alles gelb“. F gibt jeder Kategorie einen festen Ort (Drums unten links, Bass unten Mitte …). Spielen nur Drums, entsteht ein gelber Fleck unten links, nicht ein gelber Raum.

**Leistung (das eigentliche Risiko):**
- Das Mockup baut das Licht mit `filter: blur(70px)` auf großen Flächen, `mix-blend-mode: screen` für Körnung und Hof, `filter: drop-shadow` auf Pegeln und `box-shadow`-Schein. Das README beschreibt für die App eine Maske pro Clip, die über `--ph` **jedes Bild** neu berechnet wird. Masken- und Schattenänderungen erzwingen Neuzeichnen, nicht nur Compositing. Am Handy, wo der Scheduler im Hauptthread nur 150 ms Vorlauf hat, kann das bei langen Songs zu Aussetzern führen. Der Charakter von F hängt vollständig an dieser Schicht, und genau sie ist im Mockup nur als Standbild belegt.

**Hell-Modus:**
- Es gibt nur Worte, kein Bild. „Tageslicht“ ist ausdrücklich eine Ableitung ohne Licht. Gegenüber Werkstück („silbernes Gehäuse“, gleichwertig gedacht) ist das ein Rückschritt. „Fertig heißt“ verlangt Screenshots hell und dunkel.

**Spielfreude im Ruhezustand:**
- Steht der Song, ist alles schwarz (Handy rechts). Bei einem leeren neuen Projekt sieht der erste Eindruck dann aus wie ein ausgeschaltetes Gerät. Für Profis ist das edel, für den „I Like To Loop It“-Einstieg ist es kühl. Das muss Martin gefallen (Frage 3).

### Auflagen (vor der Umsetzung, in Spec und Prototyp)

1. **Tippflächen Handy ≥ 44 px:** Fader über die ganze Kanalspalte relativ ziehbar (Breite der Spalte, nicht der Kappe), die sichtbare Kappe mindestens 28 × 8 px. Segment Sounds|Erstellen 44 px hoch. Panorama-Knöpfe mit 44-px-Tippfläche (senkrecht ziehen, Doppeltipp = Mitte). Spurkopf-M/S mit unsichtbarer 44-px-Fläche.
2. **Schrift-Untergrenze:** 10 px am Desktop, 11 px am Handy für alles, was gelesen werden muss (Reiter, Display-Beschriftung, Panorama-Werte, „Vorschlag“, Inspektor-Tasten). Laufweite dafür auf +0,08 em senken, damit die Breiten halten. Ausnahme nur für Taktnummern im Lineal (10 px).
3. **Tastenkante standardmäßig `#34343A`** (1,7 : 1), wie im README schon als Option genannt.
4. **Stumm leuchtet nicht:** M an = weiße Kante, weiße Schrift, Kanal gedimmt und durchgestrichen. Weiße Füllung bleibt Transport, Solo und der einen CTA je Ansicht.
5. **Hinweiszeile am Desktop entfernen.** Tastenkürzel nur hinter „?“ bzw. in den Tipps.
6. **Licht nach Martins Worten als Standard:** Aufleuchten nur an der Marke, Nachglimmen höchstens ~150 ms. Das 0,5-s-Nachglimmen nur als zweite Variante im Prototyp zum Vergleichen. Umgebungslicht: Spielt nur eine Kategorie, füllt ihre Farbe den ganzen Raum. Die festen Orte gelten nur als Gewichtung, wenn mehrere Kategorien klingen.
7. **Leerzustand und Vorhören:** Ein Bild „neues Projekt“ am Handy. Vorhören im Regal speist das Umgebungslicht, damit der erste Tipp auf einen Sound sofort Licht erzeugt (Spielfreude ab Sekunde eins).
8. **Hell-Modus zeigen:** Je ein Bild Handy und Desktop „Tageslicht“, bevor die Spec geschrieben wird.
9. **Technik für die Lichtschicht (Spec, Motion-Designer + Audio-Engineer):**
   - Ein einziges Overlay-Canvas über der Zeitleiste für Leuchten an der Marke und Funken. Die Clips selbst bleiben statisch: keine Maske und kein Schein pro Bild auf DOM-Elementen.
   - Pegel, Logo-Balken und Spurpunkt: Schein vorgerendert, pro Bild nur `opacity`/`transform` ändern, kein animiertes `box-shadow`/`filter`.
   - Umgebungslicht: kleines Canvas, weich durch Hochskalieren, **kein** `filter: blur()` auf einer bildschirmgroßen Ebene. Höchstens 30 Bilder/s. Gegen Banding auf Schwarz statisches Rauschen ins Bild, kein `mix-blend-mode` über animierten Flächen.
   - Schleife aus bei Stopp, verdeckter Seite (`visibilitychange`) und `prefers-reduced-motion`. Einstellung „Licht: voll / sparsam / aus“ im Fach Mehr (sparsam = ohne Funken, Umgebungslicht 15 Bilder/s). Das ist für Akku und Wärme bei stundenlangem Arbeiten nötig.
   - Messung: ≤ 2 ms pro Bild bei 4-fach gedrosselter CPU, dazu ein Test, dass der Scheduler-Takt bei langem Song mit Live-Resync keine Lücken bekommt.
   - QA-Kontrasttest mit Umgebungslicht auf `--ambient-max`: Bass-Blau auf vollem gelben Schein fällt flach gerechnet auf ~4,2 : 1, das muss der Deckel verhindern.
10. **Kleinigkeiten:** Rahmen der Mehrfachauswahl nach dem Loslassen ausblenden (im Bild schneidet er „Gesang 1“). Abgeschnittene Mixer-Spalte am Handy mit Verlauf am Rand statt hartem Schnitt („−3,5 d“). Übersicht `richtungen/index.html` um F ergänzen. Bei Wahl von F braucht es eine neue Spec und ein ADR (Architekt), weil die Regel „Orange nur für Transport und Aktives“ in `CLAUDE.md` und die Spec 2.0 dann nicht mehr gelten.

### Empfehlung und Reihenfolge

- **F ist die Richtung, die Martins Briefing trifft**, und sie ersetzt A · Nachtglas als dunkle Glow-Variante: gleiches Gefühl, aber mit Idee statt Effekt und ohne `backdrop-filter`.
- **Gegenüber Werkstück (heute umgesetzt)** gewinnt F an Eigenständigkeit und Ruhe. Es verliert das Gerätehafte (Tasten, Mulden, LED), den gleichwertigen Hell-Modus und etwas Einsteiger-Wärme im Stand.
- **Umsetzungsreihenfolge, falls Martin F will:** zuerst nur die Lichtschicht als Prototyp (Umgebungslicht, Marke, Funken; `engine.categoryLevels()`), am Handy gemessen und von Martin live gesehen. Die Lichtschicht funktioniert auch auf dem dunklen Werkstück, deshalb ist sie in beiden Fällen keine verlorene Arbeit. Erst danach Token-Tausch und Komponenten.

### Was Martin sich ansehen soll

1. `docs/ux/richtungen/f-phosphor-handy.png`: links spielt (Mixer halb offen), rechts steht der Song. Beide Zustände ehrlich vergleichen: Gefällt das schwarze Stehen?
2. `docs/ux/richtungen/f-phosphor-desktop.png`: Bereich um Takt 8 (Laser, Funken, Umgebungslicht) und der Inspektor rechts.
3. `docs/ux/richtungen/f-phosphor.html` im Browser in voller Größe. Wichtig: Das ist ein Standbild. Bewegung, Nachglimmen und das Atmen des Hintergrunds sind beschrieben, aber nicht zu sehen.

### Offene Entscheidungen für Martin

1. **Phosphor ganz oder nur das Licht?** Neuer Look anstelle von Werkstück (Aufwand mittel bis hoch, große Teile der Werkstück-Abgleichliste entfallen) oder nur die Lichtschicht (reagierender Hintergrund, Laser-Marke, Funken) im heutigen Werkstück?
2. **Hell-Modus:** Reicht eine schlichte, helle Ableitung ohne Licht-Effekte, weil die App primär dunkel ist, oder muss Hell gleichwertig bleiben wie das „silberne Gehäuse“?
3. **Ruhezustand:** Soll beim Stehen wirklich alles schwarz und still sein, oder soll ein Rest Leben bleiben (z. B. Logo glimmt leise, Vorhören leuchtet)?
