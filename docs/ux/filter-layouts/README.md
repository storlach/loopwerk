# Regal: Suche und Filter – vier touchfreundliche Layouts

Erster Eindruck für Martin. Es geht um den Bereich über den Akkordeons im Regal („Assets“ → „Suchen“, 272 px; am Handy Fach „Sounds“) mit Suche, Ordnen, Länge und Favoriten. App-Code bleibt unverändert.

- Mockups: `1-eine-zeile.html`, `2-woerter.html`, `3-pegel.html`, `4-lineal.html` (eigenständig, `:root` aus `index.html` 1:1 kopiert, nur Google Fonts extern)
- Bilder (deviceScaleFactor 2): `N-…-handy.png` (390 px, Fach auf Mitte, je drei Zustände), `N-…-seitenleiste.png` (272 px, Touch-Maße, je drei Zustände), `uebersicht.png` (2 × 2)
- Ist-Zustand zum Vergleich: `ist-handy.png`, `ist-handy-filter-offen.png`, `ist-seitenleiste-tablet.png` (gleicher Ausschnitt, `openApp({ fresh: true })`)
- Inhalte stammen echt aus der Bibliothek, ohne Test-Sounds gezählt: 504 Sounds, Drums 261, Bass 33, Akkorde 123, Synth 59, FX 28; Länge 1T 37, 2T 67, 4T 62, **8T+ 0**, One-Shot 338. Angenommen sind 7 Favoriten (Four to the Floor, Breakbeat, Bass Am–F–C–G, Pad Am–F–C–G, House-Piano Am–F–C–G, Arp Am, Riser).

## Heute (gemessen)

| | Handy, Filter zu | Handy, Filter offen | Seitenleiste Touch (Tablet) | Seitenleiste Maus |
|---|---|---|---|---|
| Filterbereich (Oberkante Suche bis Unterkante letzter Filter) | 56 px | 256 px | 244 px | 111 px |
| erste Gruppe ab Oberkante Fach/Leiste | 150 px | 350 px | 362 px | 217 px |

Am Handy ist das Fach auf „Mitte“ 364 px hoch. Mit offenen Filtern sieht man von den Akkordeons noch einen Streifen von 14 px. Welche Filter wirken, zeigt im geschlossenen Zustand nur eine Zahl am Knopf „Filter“. Einen Knopf, der alles zurücksetzt, gibt es nicht.

Drei Befunde nebenbei:
1. **8T+ ist leer.** Kein Loop der Bibliothek ist länger als 4 Takte; der Knopf führt immer zu „keine Treffer“. Alle Entwürfe zeigen ihn deshalb gedimmt (bei 3 und 4 mit „0“).
2. **„Alle“ ist überflüssig.** Ein zweiter Tipp auf die aktive Länge setzt sie schon heute zurück (`library.js`). Alle Entwürfe lassen „Alle“ weg und gewinnen so eine Zelle: fünf Längen passen in 242 px mit je ≥ 48 px.
3. Am Handy kostet die Zeile „+ Import / + Link / + Beat / + Melodie“ (63 px) mehr Höhe als die Filter in den Varianten 1 und 2. Sie gehört nicht zu dieser Aufgabe, ist aber der nächstgrößere Hebel (z. B. in „Erstellen“ oder hinter „+ Neu“).

## Übersicht

| | Filter Handy | Filter Seitenleiste | Gruppe ab (Handy / Leiste) | Akkordeons sichtbar am Handy (Mitte) | Tipps je Filterwahl | Zurücksetzen |
|---|---|---|---|---|---|---|
| Heute | 56 zu / 256 offen | 244 (Touch) | 150–350 / 362 | 4,6 zu, 0,3 offen | Handy 2 (+1 zum Zuklappen), Leiste 1 | jeden Filter einzeln, kein „alles“ |
| 1 · Eine Zeile | **44** / 205 offen | **44** / 205 offen | 149 / 164 | 4,6 | ★ 1 · Länge 2 · Ordnen 2 | 1 (× im Feld) |
| 2 · Wörter | 96 | 96 | 201 / 216 | 3,5 | 1 (am Rand: wischen + 1) · oder tippen | 1 (Wort) oder 1 (× alle) |
| 3 · Pegel | 156 | 156 | 253 / 266 | 2,4 | 1 | 1 (× im Feld) |
| 4 · Lineal | 148 | 148 | 251 / 266 | 2,4 (Favoriten als Gruppe dabei) | 1 (Tipp oder Ziehen) | 1 (Knopf „× 4T“) |

Alle Maße sind in den Mockups gemessen (Maßklammer links neben jedem Rahmen). Alle Tippflächen sind ≥ 44 px hoch und ≥ 44 px breit; in keiner Variante scrollt die Seite waagrecht (Variante 2 scrollt nur ihre eigene Vorschlagsleiste).

---

## 1 · Eine Zeile

**Idee:** Suche, Filter und Favoriten teilen sich ein einziges Feld von 44 px. Länge und Ordnen liegen in einem Fach hinter dem Regler-Knopf; das Fach schließt sich nach jeder Wahl selbst, der gewählte Wert („4T“) bleibt im Knopf stehen.

- **Höhe:** Handy 44 px statt 56/256; Seitenleiste 44 px statt 244. Offen 205 px, aber nur für den Moment der Wahl.
- **Tipps:** Favoriten 1 · Länge 2 (Fach, Wert) · Ordnen 2 · alles zurück 1 (× ersetzt die Lupe, sobald etwas wirkt).
- **Auf einen Blick:** Wert im Knopf glüht weiß, Stern gefüllt, Platzhalter zeigt die Treffer („3 Treffer“).
- **Vorteile:** am wenigsten Höhe, die Akkordeons stehen sofort da. Ein Muster für Handy und Seitenleiste. Liegt nah am heutigen Code: das Fach ist das bestehende `#shelf-filters` mit seiner Auf-/Zu-Bewegung, nur ohne „Filter“-Wort und mit Wert im Knopf.
- **Nachteile:** Die Länge liegt einen Tipp tiefer und wird leichter übersehen (abfangen mit einem Tipp in `tips.js`). Zwei Tipps statt einem für Länge und Ordnen. Am Desktop verschenkt das Fach Platz, den es dort eigentlich gäbe.
- **Bewegung:** Das Fach wächst aus dem Knopf nach unten (Verbindungslinie), nach der Wahl fliegt der Wert in den Knopf zurück. Dauer etwa 180 ms.
- **Aufwand:** niedrig bis mittel.

## 2 · Wörter

**Idee:** Alles, was vom Normalzustand abweicht, steht als weißes Wort im Suchfeld: „4T“, „★“, auch „nach Genre“. Darunter liegt eine wischbare Leiste mit den Wörtern, die man noch hinzufügen kann; wer lieber tippt, schreibt „4t“, „fav“ oder „genre“ und bestätigt den Vorschlag.

- **Höhe:** 96 px auf beiden Größen (Feld + eine Leiste). Am Handy 40 px mehr als heute zu, 160 px weniger als heute offen.
- **Tipps:** 1 je Wort, solange es sichtbar ist. In 272 px sieht man nur Stern, „1 Takt“ und „2 Takte“; für „4 Takte“ muss man erst wischen. Tippen auf der Tastatur ist ebenfalls ein Weg.
- **Auf einen Blick:** Die aktiven Filter sind genau die Wörter im Feld, in Weißglut (gefüllt). Ein Tipp aufs Wort entfernt es, × rechts entfernt alles.
- **Vorteile:** Aktive Filter sind klar lesbar und einzeln entfernbar. Für die Tastatur am Desktop ideal. Kategorie/Genre wird ein Filterwort wie die anderen, daher keine eigene Zeile. Lässt sich später erweitern (Tonart, Tempo, Genre-Namen) ohne neue Fläche.
- **Nachteile:** Wischleisten verstecken Möglichkeiten, in der Seitenleiste ist mehr als die Hälfte unsichtbar. Wörter im Eingabefeld sind technisch heikel (Fokus, Rücktaste, Screenreader, Autokorrektur am Handy). Kurzformen im Feld („4T“) und Langformen in der Leiste („4 Takte“) sind zwei Schreibweisen.
- **Bewegung:** Der gewählte Chip fliegt aus der Leiste ins Feld (FLIP, 200 ms), beim Entfernen zurück an seinen Platz.
- **Aufwand:** hoch.

## 3 · Pegel

**Idee:** Die Länge ist ein festes Pult aus fünf Kacheln. Jede Kachel zeigt ihre Anzahl und einen Pegel (Linie am Boden, Wurzel der Menge), und beide folgen den anderen Filtern: man sieht vor dem Tipp, was er bringt. Der Stern sitzt neben der Suche, Kategorie/Genre wird zum Reiter über der Akkordeon-Liste, rechts davon die Trefferzahl („3/504“).

- **Höhe:** 156 px auf beiden Größen. Seitenleiste 88 px weniger als heute, am Handy 100 px mehr als heute zu und 100 px weniger als heute offen.
- **Tipps:** 1 für alles (Länge, Favoriten, Ordnen); alles zurück 1 (× im Feld).
- **Auf einen Blick:** Die aktive Kachel ist weiß umrandet, ihr Pegel glüht. Stern umrandet und gefüllt, Trefferzahl im Reiter.
- **Vorteile:** Am direktesten, nichts ist versteckt. Die Zahlen machen die Bibliothek lesbar und verhindern leere Treffer (8T+ = 0, bei Favoriten etwa 2T = 1). Die Bausteine gibt es schon: Raster aus `.shelf-len` (Touch 3 × 2) wird 5 × 1, Reiter wie `.ltab`.
- **Nachteile:** Am Handy die zweitmeiste Höhe. Auf Mitte sieht man nur 2,4 Akkordeons, mit der Import-Zeile sogar weniger. Zahlen in jeder Kachel sind mehr Information, als jemand braucht, der nur schnell sucht.
- **Bewegung:** Die Pegel gleiten bei jeder Eingabe auf ihren neuen Wert (120 ms, ease-out), wie ein Meter, nicht springend.
- **Aufwand:** niedrig bis mittel (Zählen je Länge beim Rendern, Kacheln und Reiter umstylen).

## 4 · Lineal

**Idee:** Die Länge wird ein Takt-Lineal in der Sprache des Arrangers. Tippen wählt eine Länge, Ziehen einen Bereich (1–4 Takte); die weiße Klammer leuchtet wie die Loop-Leiste. Favoriten sind kein Filter mehr, sondern die erste Gruppe der Akkordeons. Eine Statuszeile zeigt die Treffer, den aktiven Filter als Rücksetz-Knopf („× 4T“) und Kategorie/Genre.

- **Höhe:** 148 px auf beiden Größen. Dafür entfällt der Favoriten-Schalter, und die Favoriten-Gruppe zählt zur Liste.
- **Tipps:** Länge 1 (Tipp) oder 1 Geste (Ziehen für einen Bereich), Favoriten 1 (Gruppe aufklappen), Ordnen 1, zurück 1.
- **Auf einen Blick:** Klammer auf dem Lineal und ein gefüllter Knopf „× 4T“ bzw. „× 1–4T“ in der Statuszeile.
- **Vorteile:** Die stärkste eigene Idee, sie passt zu Loopwerk, weil Takte dort immer ein Lineal sind. Bereiche sind neu und nützlich („bis 4 Takte“). Favoriten als Gruppe lassen sich mit der Länge kombinieren, ohne den Rest auszublenden, und folgen dem Akkordeon-Prinzip, das die Kategorie-Chips schon abgelöst hat.
- **Nachteile:** Das Lineal ist ungewohnt; dass „Ziehen = Bereich“ gilt, muss man entdecken. Ziehen im Fach kann mit dem Wischen der Schublade kollidieren (waagrecht ist eindeutig, braucht aber `touch-action: pan-y` und eine Gesten-Schwelle). „Shot“ ist kein Takt und braucht eine eigene Zelle. Es entsteht ein neues Datenmodell für die Länge (Bereich statt Wert).
- **Bewegung:** Die Klammer zieht beim Tippen von der Mitte der Zelle auf (140 ms) und folgt beim Ziehen direkt dem Finger, rastet beim Loslassen an der Zellgrenze ein, wie das Raster im Arranger.
- **Aufwand:** mittel bis hoch.

---

## Gestaltung (gilt für alle)

- **Tokens:** `--well` und `--key-line` (Mulden und Linien), `--sheet-bg`, `--ink`, `--muted`, `--accent-ink`, `--beam`, `--beam-glow`, `--glow-ink`, `--radius` (3 px: Wörter, Chips, entfernbare Dinge), `--radius-lg` (14 px: Feld, Pulte), `--cat-*` nur für Klingendes (Gruppen-Farbfeld, Abspiel-Dreieck). Neue feste Farben gibt es keine. Die weiße Umrandung `rgb(255 255 255 / 0.55)` steht schon heute so in `index.html` (`.seg[aria-pressed]`).
- **Zustände:** Eingestellt bedeutet Linie (Umriss + `--glow-ink`). Gefüllt Weiß (`--ink` auf `--accent-ink`) tragen nur Dinge, die man mit einem Tipp wieder entfernt: Wörter, „× 4T“, der offene Fach-Knopf. Leer (8T+) wird gedimmt und mit „0“ angezeigt. Kein Zustand hängt nur an der Farbe: Wert, Füllung oder Klammer zeigen ihn zusätzlich.
- **Schrift:** Funnel Sans 16 px im Feld (verhindert Zoom bei iOS), 14 px für Sounds; Funnel Display 600 11–12 px in Versalien für Gruppen und Reiter; Azeret Mono 500 10–12 px für Werte und Zahlen (Takte, Anzahlen, Treffer).
- **Zugänglichkeit:** Knöpfe im Feld mit `aria-pressed` bzw. `aria-expanded`; Längen als `radiogroup` (Lineal zusätzlich mit Pfeiltasten und Umschalt für Bereiche); Wörter als Knöpfe mit `aria-label="Filter 4 Takte entfernen"`; Pegel nur zur Zierde (`aria-hidden`), die Zahl steht im Namen („4 Takte, 62 Sounds“). `--muted` auf `--sheet-bg` hat etwa 5,9 : 1.

## Empfehlung

**Variante 1 „Eine Zeile“ als Grundlage, für Handy und Seitenleiste gleich, mit zwei Anleihen aus Variante 3:**

1. Die Längen-Knöpfe im Fach bekommen Anzahl und Pegel. Das macht 8T+ = 0 ehrlich sichtbar und verhindert leere Treffer, ohne Höhe in der Ruhe zu kosten.
2. Die Trefferzahl steht als Platzhalter im Feld („3 Treffer“), damit gibt es keine eigene Statuszeile.

Gründe: Variante 1 erfüllt die Vorgaben am knappsten. Sie ist am Handy 12 px niedriger als heute (zu) und in der Seitenleiste 200 px niedriger. Sie zeigt aktive Filter ohne Aufklappen, setzt mit einem Tipp alles zurück und braucht nie mehr als zwei Tipps. Sie baut auf dem vorhandenen `#shelf-filters` auf. Das Risiko liegt darin, dass man die Länge leichter übersieht; dagegen helfen das Regler-Symbol und ein Tipp beim ersten Öffnen.

Falls Martin in der Seitenleiste (Tablet, Desktop) lieber alles direkt sehen will: Variante 3 benutzt dieselben Bausteine (Feld, Stern, fünf Längen-Knöpfe). Ein Mix „Handy 1, Seitenleiste 3“ kostet über `layout.js`/`place.js` wenig. Variante 4 (Lineal, Favoriten als Gruppe) ist die eigenständigste Idee und lohnt sich als zweiter Schritt, sobald Längenbereiche gebraucht werden. Die Favoriten-Gruppe ganz oben lässt sich auch unabhängig davon übernehmen.
