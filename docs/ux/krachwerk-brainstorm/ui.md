# Krachwerk: Brainstorm aus UI-Sicht

**Stand:** 02.11.2026 · **Art:** Brainstorm, keine Freigabe · **Mockups:** `richtungen.html` (Bild: `richtungen.png`), Ist-Bilder: `shots/ist-*.png`
**Auftrag (Martin):** Song-Bau wie Loopwerk, aber für selbst Aufgenommenes, mit mehr Raum und mehr Einstellungen fürs Formen. Dazu ruhiger und minimalistischer, ohne dass Funktionen wegfallen. Der bisherige Pad-Wand-Prototyp (`src/werkstatt/`) gilt nicht als Grundlage.

## 1. Diagnose: Warum Loopwerk „sehr umfangreich“ wirkt

Gemessen im Desktop-Bild 1400 × 820 mit gewähltem Clip, sichtbare Elemente (`shots/ist-desktop-clip.png`):

| | Desktop | Handy |
|---|---|---|
| Elemente mit Rahmen/Kontur | 117 | 60 |
| Bedienelemente gleichzeitig | 113 | 45 |
| Beschriftungen | 172 (12 Schriftgrößen) | 57 (7 Größen) |
| davon Mono | 63 %, dazu 60 in Versalien | 67 % |

Nach Wirkung geordnet:
1. **Jede Einstellung hat einen Kasten, und alle Kästen sind gleich hell.** Die Regel „Einstellungen sind Linien“ wurde zu „Einstellungen sind umrandete Tasten“. 117 Rahmen ergeben ein Gitter, in dem nichts zurücktritt. Die Musik (Clips) hat weniger Kontrast als die Bedienung.
2. **Mono-Versalien als Standardstimme.** „RASTER: SCHLAG“, „EINBLENDEN“, „FILTER SCHLIESSEN“, „LOOPS · 57“: Beschriftungen sind so laut gesetzt wie Messwerte. Mono sollte Zahlen tragen, keine Wörter. Dazu kommen 12 Schriftgrößen ohne erkennbare Skala (9; 9,5; 10; 11; 12; 13; 13,5; 14; 15 …).
3. **Drei gleich gewichtete Spalten.** Regal, Arranger und Inspektor haben dieselbe Dichte. Der Inspektor stapelt Clip- und Spur-Einstellungen untereinander (Lautstärke, Ein-/Ausblenden, Laufzeit, 4 Aktionen, Spur-Lautstärke, Panorama, Verlauf, Länge …) und bleibt sichtbar, auch wenn man nur hört.
4. **Feste Zeilen ohne Inhalt.** Tonart- und Akkordzeile, Spurköpfe mit M, S, Drehknopf und Menü bei jeder Spur, auch bei „Spur 8“ ohne Clip. Am Handy belegen diese Zeilen 29 % der Höhe, bevor der erste Clip kommt.
5. **Lichter konkurrieren.** Weiße Taste „Exportieren“, weißes „Übernehmen“, weiße Auswahl, weiße Regler-Füllungen und Knöpfe: Weißglut steht für „aktiv“, ist aber an sechs Stellen gleichzeitig, also an keiner.

Folgerung für Krachwerk: weniger **sichtbare** Elemente, nicht weniger Funktionen. Drei Hebel: (a) Rahmen nur, wo man drückt, alles Einstellbare als Linie; (b) Mono nur für Zahlen, Wörter in Sans/Display mit fester Skala; (c) Werkzeuge erscheinen dort und dann, wo man arbeitet, statt dauernd in Spalten zu stehen.

## 2. Gemeinsame Krachwerk-Grammatik (in allen Richtungen)

- **Herkunft statt Instrument:** Körper `--cat-drums`, Dinge `--cat-fx`, Stimme `--cat-synth`, Strom `--cat-bass`, Schleife `--cat-chords` (Aliase `--o-*`, keine neuen Werte). Pink `--cat-own` ist nur Marke und Mikrofonlicht.
- **Roh → geformt:** Eine frische Aufnahme ist weißes Korn (Punkte), ein geformter Klang besteht aus Lichtstrichen in seiner Herkunftsfarbe.
- **Stammbaum als Zeile:** „Dinge · Küche 21:14 → gestimmt auf A · 0,82 s“.
- **Ruhe-Licht:** Nur Clips unter der Marke leuchten voll, der Rest steht auf 50 % (`--trace-rest`-Gedanke).
- **Aufnahme:** Rot nur an Knopf, Zeit und Clipanfang, immer mit Formsignal (Quadrat, Zeit, Ring). Pink steigt vom unteren Rand auf, wo am Handy das Mikrofon sitzt. Pink und Rot liegen nah beieinander, deshalb nie Farbe allein.
- **Mehr Einstellungen beim Formen**, gruppiert in Schnitt · Ton · Hülle · Farbe · Raum · Zerlegen (etwa 28 Werte: Anfang/Ende, Ein-/Ausblenden, Halbtöne, Fein, Auf Tonart ziehen, Stimmfarbe halten, Gleiten, Länge, Anschlag/Halten/Abklingen, Tiefen/Höhen weg, Rauschen weg, Verdichten, Wärme, Lautstärke, Raum, Echo, Rückwärts, Einfrieren, Zerlegen, Als Instrument, Als neuen Klang). Anfang, Ende und Hülle liegen als Linien direkt auf der Welle.

## 3. Die Richtungen

### A · Leinwand
*Es gibt nur den Song. Jedes Werkzeug erscheint an dem Ding, das du berührst, und die Werkbank ist der herangezoomte Clip.*
- **Weg/zusammengelegt:** Regal-Spalte → Fundstücke-Leiste; Inspektor und Docks → Werkzeug am Objekt (Pille am Handy, Karte am Desktop); Spurköpfe → Name und Lichtkante auf der Spur (M/S per Halten); Fachleiste → „Mehr“.
- **Gefahr:** Was nicht angetippt ist, existiert nicht. Mixer, Stumm, Export und Projekt werden schlecht gefunden. Das Werkzeug verdeckt Nachbarspuren. Viele Gesten heißt viele Tipps.
- **Awwwards:** Ein Objekt, ein Werkzeug, ein Zoom ohne Schnitt vom Clip zur Werkbank. Die ruhigste und mutigste Fläche: die Musik füllt den Bildschirm.
- **Aufwand:** hoch (neuer Arranger-Kopf, Werkzeugposition, Zoom-Übergang).

### B · Bühne und Werkbank
*Oben spielt der Song, unten liegt immer der eine Klang, an dem du arbeitest, und das Mikrofon sitzt auf der Naht dazwischen.*
- **Weg/zusammengelegt:** Regal → „Ablage“ in der Werkbank; Inspektor, Sample-Editor und Mixer-Kanal → eine Werkbank, die zeigt, was gewählt ist (Clip = Klang, Spur = Kanal); Fachleiste, Zoomleisten, Tonart-/Akkordzeile fallen weg; Spurkopf = Name + M S als Buchstaben.
- **Gefahr:** Am Handy kostet die Werkbank Bühnenhöhe (drei Haltepunkte wie die Schubladen heute). Die Richtung kann wie „Loopwerk mit Schublade“ aussehen, wenn die Naht nicht konsequent die einzige starke Linie bleibt.
- **Awwwards:** Die Naht als einzige Geste der Marke: Mikrofon als Scharnier zwischen Hören und Machen, bei der Aufnahme wird sie zur roten Linie. Klare Zweiteilung, die man auch ohne Erklärung versteht.
- **Aufwand:** mittel (baut auf `sheets.js`, `inspector.js`, Sample-Editor; neu sind Naht und Ablage).

### C · Partitur
*Der Song liest sich wie ein Notenblatt: Spuren sind Zeilen aus Schrift, Clips sind Licht auf der Linie, jede Einstellung ist ein Satz, dessen Zahlen man zieht.*
- **Weg/zusammengelegt:** alle Tastenrahmen, Regler-Grafiken, Spurköpfe, Inspektor und Docks. Werkbank und Mixer sind Sätze („Klingt 3 Halbtöne höher und wird zu 80 % auf A-Moll gezogen“). Fundstücke = Register am Seitenrand.
- **Gefahr:** Sätze sind langsamer zu überfliegen als Regler, lange Werte brechen Zeilen, Präzision beim Ziehen. Gepunktete Unterstreichung allein ist ein schwaches Signal für „ziehbar“. 16 Spuren ergeben eine lange Partitur.
- **Awwwards:** Typografie als Charakter: die größte Schrift ist die Aufnahmezeit (128 px), die Seite wird zum Instrument. Am eindeutigsten unverwechselbar, und Barrierefreiheit gibt es fast geschenkt (Werte sind Text).
- **Aufwand:** mittel bis hoch (ziehbare Zahlen sind einfach, gute Sätze für jede Einstellung sind Gestaltungsarbeit).

## 4. Empfehlung

**B als Gerüst, mit A als Geste und C als Stimme.**
- **B** setzt Martins Satz am wörtlichsten um: „dem Selbermachen mehr Raum geben“ heißt eine eigene, immer vorhandene Zone, die man größer ziehen kann. Keine Funktion wird unauffindbar, weil die Werkbank immer zeigt, was gewählt ist. Das Modell bleibt Loopwerk (Arranger, Spuren, Clips), Projekte bleiben austauschbar, und der Code steht zu großen Teilen schon.
- **Von A** kommt das Werkzeug am Objekt für die schnellen Dinge (Teilen, Doppeln, Stumm, Löschen), damit die Werkbank nur fürs Formen da ist und keine Aktionsliste wird.
- **Von C** kommt die Typo-Regel: Mono nur für Zahlen, Wörter in Sans, eine Skala mit sechs Stufen (11 / 13 / 15 / 24 / 38 / 56). Dazu Stammbaum und Zutatenliste als Sätze. Die Satz-Werkbank aus C eignet sich als Ansicht für Bildschirmleser und als „Rezept“ beim Teilen.
- Ziel für das Bild „Desktop, Clip gewählt“: unter 40 gerahmte Elemente (heute 117), höchstens 6 Schriftgrößen, ein weißes Licht pro Ansicht neben Marke und Spielen-Linse.

Nächster Schritt: Der UX-Designer prüft B am Handy (Haltepunkte der Naht, Mikro-Knopf mitten auf der Naht und mit dem Daumen erreichbar?). Danach ein CD-Review, dann eine Spec.
