# ADR 001 – Time-Stretching: eigenes WSOLA statt Signalsmith Stretch

**Status:** angenommen (Stufe 3)

## Kontext
Ab Stufe 3 ist das Tempo frei wählbar (60–200 BPM). Loops müssen dafür ohne Tonhöhenänderung gestreckt werden. Geplant war Signalsmith Stretch (MIT).

## Entscheidung
- **Synthetische Loops** werden beim Tempowechsel neu gerendert – verlustfrei.
- **Echte Loops** (Sonic Pi) werden mit einem eigenen WSOLA-Verfahren (`src/dsp/stretch.js`) offline gestreckt, zyklisch fortgesetzt für nahtlose Schleifen.
- **One-Shots** werden nicht gestreckt, sondern auf ganze Schläge aufgefüllt.

## Gründe
- Keine Abhängigkeit, kein WASM, kein Netzwerkzugriff nötig (CDN aus der Arbeitsumgebung nicht erreichbar).
- Vollständig offline messbar: Länge exakt, Anschläge ≤ 5 ms Abweichung, Tonhöhe erhalten (`tests/stufe3.test.cjs`).
- Die Streckfaktoren der mitgelieferten Loops liegen zwischen 0,6 und 1,7 – dafür reicht WSOLA bei Drums gut.

## Folgen
- Bei tonalen Loops und großen Faktoren klingt WSOLA hörbar „körniger“ als ein Phasen-Vocoder. Falls das stört: Signalsmith Stretch als Alternative für tonales Material nachrüsten.
- Ein Tempowechsel bereitet alle Sounds neu vor (~3 s). Verbesserung: Worker, zuerst die im Projekt benutzten Sounds.

## Nachtrag W7 (2026-11): Anschläge bleiben, gedehnt wird dazwischen

**Anlass:** Die Klanganalyse (`docs/analyse/2026-11-klang.md`, W7) fand beim Verlangsamen doppelte, flatternde Snare-Schläge und beim Beschleunigen verschluckte Ghost-Notes. Ursache: WSOLA schiebt jedes 40-ms-Fenster um bis zu ±12 ms auf die ähnlichste Stelle und wiederholt dabei auch Fenster, die einen Anschlag enthalten – der Anschlag erscheint mehrfach oder 5–12 ms neben seinem Platz.

**Entscheidung:** WSOLA bleibt, bekommt aber eine Zeitkarte statt einer festen Schrittweite.
- Anschläge werden vor dem Dehnen erkannt (Spektralfluss: FFT 1024, Schritt 256, log-Betrag, Zunahme gegen das Maximum der Nachbar-Bins des vorigen Fensters; Spitze über Mittel + 0,01 und über 3 % des größten Flusses, größte in ±20 ms; Feinlage auf den steilsten 1-ms-Anstieg breitbandig oder in den Höhen). Loops werden zyklisch untersucht.
- Die Zeitkarte bildet jeden Anschlag genau auf Anschlag · Faktor ab und lässt von 32 ms davor (halbes Fenster + Suchbereich) bis 60 ms danach die Zeit 1:1 laufen. Nur die Stücke dazwischen werden gedehnt bzw. gestaucht, höchstens auf das 4-Fache bzw. 0,3-Fache des mittleren Faktors; reicht der Platz nicht, schrumpfen die 1:1-Bereiche. Die Gesamtlänge stimmt exakt.
- WSOLA folgt der Karte. Im 1:1-Bereich sucht es nur ±2 ms (das erste Fenster richtet die Phase aus, die folgenden sind die natürliche Fortsetzung und liegen deckungsgleich); vor einem 1:1-Bereich wird der Suchbereich enger, damit der Übergang keine Delle vor dem Anschlag reißt; kein Fenster wird über einen Anschlag hinweg verschoben.
- Ohne erkannte Anschläge (Dauertöne) rechnet der alte Weg bitgleich. `timeStretch(…, { transients: false })` erzwingt ihn (Vergleich in Tests).

**Warum so und nicht anders:**
- *Scheiben an den Anschlägen (Recycle-Art):* scheitert an Loops ohne Pausen (Garzul, Mika, Amen klingen durch) – die Pausen gibt es nicht, die gestreckt werden könnten, und jeder nicht erkannte Schlag wandert mit seiner Scheibe (Versuch mit 200 ms 1:1-Bereich: bis zu 200 ms daneben). Die Zeitkarte ist dieselbe Idee mit weichen Grenzen.
- *Nur die Synthese-Position an Anschlägen neu ausrichten:* behebt die Lage, aber nicht das Verdoppeln – dafür müssen alle Fenster, die den Anschlag enthalten, deckungsgleich liegen. Das leistet der 1:1-Bereich.
- *Phasen-Vocoder mit Transienten-Erhalt / Signalsmith Stretch:* größerer Umbau; Rubber Band ist GPL. Für Drums reicht WSOLA mit Zeitkarte.
- Ein erster Detektor nach Energie in zwei Bändern übersah leise Schläge im dichten Material und reagierte auf Schwebungen von Akkorden; der Spektralfluss mit ±1-Bin-Maximum ist dort robust (Sinus, Akkord, Bass, Vokal: keine Fehlalarme mit Folgen).

**Messung** (`tests/stretch-transienten.test.cjs`, sechs Sonic-Pi-Drum-Loops, −40 % … +40 %): Doppelschläge je Loop 0 statt bis zu 9; Zahl der deutlichen Anschläge (Prüf-Detektor mit eigener FFT, Schwelle aus dem Original, Hysterese) −1,5 … 0 % statt −11,5 … −4,6 %; Lage gegen den Sollzeitpunkt Median ≤ 2,5 ms, 90 % ≤ 4 ms statt 3,5–12 / 7–12 ms; synthetischer Loop mit bekannten Anschlägen höchstens 3,3 ms statt 12 ms daneben. Tonal (Sinus, Akkord, Bass, gehaltener Ton, Gesang, Gitarre) kein zusätzliches Flattern oder Rauschen gegenüber dem reinen WSOLA, Pegel ±0,15 dB. Rechenzeit 1,0- bis 1,2-fach (die Erkennung kostet eine FFT 1024 je 256 Frames, die 1:1-Bereiche sparen Suche).

**Folgen:**
- Der Schwellen-Detektor der Analyse (−14 dB, 15 ms Sperrzeit) zählt beim Amen −40 % weiter +35 % (vorher +69 %). Er zählt auch Perioden tiefer Ausklänge und Kreuzungen in Rauschfahnen; schon ein im neuen Tempo neu gerechneter synthetischer Loop (ideale Dehnung) ergibt mit ihm +22 %. Er taugt nicht als Maß für Doppelschläge.
- Pegel: beim Verlangsamen bleibt der Anschlag gleich lang und der Raum dazwischen wird länger – der Loop wird um bis zu 1–2 dB leiser (RMS), beim Beschleunigen bis +1 dB lauter, wie bei einem langsamer bzw. schneller gespielten Schlagzeug. Spitzen bleiben.
- Flams und Doppelanschläge unter 12 ms behalten ihren Abstand; weiche Anschläge, die direkt vor einem stärkeren liegen (Amen −40 %: zwei von zwölf), landen bis 15 ms neben ihrem Platz.
- `pitchShift` und das Rezept-Dehnen in Krachwerk (`src/dsp/recipe.js`) nutzen dieselbe Funktion und profitieren mit.
