# ADR 008 – Effekt-Reihenfolge als Zusatzfeld, zwei feste Send-Busse

**Stand:** 03.11.2026 · **Status:** angenommen (Martin: „zieh es durch“, 03.11.2026; offene Fragen nach Vorschlag entschieden) · Spec: `docs/specs/v2.14-effekte-sends.md`

## Kontext
Jede Spur und die Summe haben heute ein festes Rack: `fx` ist ein Objekt mit einem Eintrag je Effekttyp (`fx.filter = { on, cutoff, … }`), die Reihenfolge steht in `EFFECTS`. An diesem Objekt hängen viele Stellen: Automation (`filter.cutoff` usw.), die Effekt-Pad-Aufnahme, `applySound`/„Klang aus Beschreibung“, der Song-Starter, Inspektor und Mixer. Gewünscht sind eine freie Reihenfolge und gemeinsame Hall- und Echo-Effekte für mehrere Spuren. Der Skill `effekt-bauen` beschreibt noch ein Listenmodell (`effects: [{ id, type, params, bypass }]`), das nie gebaut wurde.

## Entscheidung
1. **`fx` bleibt, wie es ist.** Neu ist das optionale Feld `fxOrder` (Liste von Effekt-IDs) an der Spur und an `project.master`. Fehlt es, gilt die heutige Reihenfolge. Jeder Effekt steht höchstens einmal in der Kette. Kurven-Schlüssel bleiben dadurch eindeutig, und keine Leserin von `fx[id]` muss sich ändern.
2. **Keine Mehrfachbelegung in dieser Fassung.** Den häufigsten Grund dafür (zweimal Hall) decken die Busse ab. Später geht es ohne Formatbruch: Einträge in `fxOrder` werden Instanz-IDs (`filter~2`), und `fx['filter~2'] = { type: 'filter', … }` bekommt Kurven-Schlüssel wie `filter~2.cutoff`.
3. **Zwei feste Busse, „Hall-Bus“ und „Echo-Bus“** (`project.buses`), keine frei anlegbaren Busse. Je Spur gibt es einen Send-Anteil (`track.sends`). Der Send sitzt hinter dem Fader und hinter dem Panorama, abgegriffen am Ausgang des Kanalzugs. Der Bus gibt nur das Effektsignal aus und läuft in die Summe.
4. **Kein Pre-Fader-Send.** Bei Loopwerk sitzt der Fader samt Stumm und Solo vor dem Rack, der Verzerrer und der Kompressor reagieren also auf den Fader. Wer den Fader hinter das Rack verlegt, ändert den Klang alter Projekte.
5. **Stems enthalten ihren Bus-Anteil.** Hall und Echo sind linear, also addieren sich die Einzelspuren weiterhin exakt zum Mix.
6. `PROJECT_VERSION` bleibt 1, denn alle neuen Felder sind optional, wie bei `automation` und `keyChanges`.

## Alternativen
- **`fx` als Liste von Slots:** Das ist am flexibelsten. Es bräuchte aber eine Migration, alle 13 Dateien mit `fx[id]` müssten sich ändern, Kurven-Schlüssel bräuchten Slot-IDs, und die Pad-Aufnahme müsste raten, welcher Filter gemeint ist. Dazu kämen ein Menü „Effekt hinzufügen“ (mehr Klicks) und leere Slots. Für einen Music Maker ist das zu viel.
- **Frei anlegbare Busse oder AUX-Spuren:** Das wäre DAW-Standard, braucht aber eine Bus-Verwaltung, Routing-Auswahl und Schleifenschutz. Zwei feste Busse wie im Magix-Mixer (FX 1/FX 2) reichen für den Zweck.
- **Pre-Fader-Send über einen zweiten Pegelknoten:** Das ist möglich, aber „vor Fader“ hieße bei uns auch „vor den Effekten“. Das versteht man schwer und braucht man selten (siehe offene Frage in der Spec).
- **Busse als eigene Stem-Dateien:** Profis wünschen sich das. Einsteigerinnen bekämen dann aber trockene Einzelspuren, die anders klingen als im Mix. Als späterer Haken ist es möglich.

## Folgen
- Alte Projekte laden ohne Umbau und klingen bitgleich. Neue Projekte klingen in älteren App-Ständen ohne Reihenfolge und ohne Busse (sie laden trotzdem).
- `buildFxChain` und `fxKey` bekommen die Reihenfolge. Hall und Echo lassen sich „nur nass“ bauen.
- Wird nur die Reihenfolge umgestellt, gibt es einen neuen Ketten-Übergang: Der Eingang wird überblendet, und die alte Kette klingt aus.
- Bus-Knoten entstehen erst, wenn eine Spur sendet. Projekte ohne Sends haben denselben Graphen wie heute.
- Die Skills `effekt-bauen` (Abschnitt Modell) und `audio-engine-regeln` (Signalkette) werden auf diesen Stand gebracht.

## Nachtrag 2026-11 – Fassung der Klangabstimmung (`v`), Klanganalyse W3 und K3
**Kontext:** Kompressor und Verzerrer machten beim bloßen Einschalten 4–9 LU lauter (Kompressor: fester Ausgleich +4,5 dB plus die eingebaute Anhebung des Browser-Kompressors; Verzerrer: Ausgleich nur für einen Pegel von 0,3). Der Hall lag mit der Voreinstellung rund 19 dB unter dem Direktsignal (Breite 0,008), hell und mit vollen Tiefen. Gespeicherte Songs sollen trotzdem genau so weiterklingen.

**Entscheidung:**
1. Neues optionales Feld `v` (Fassung) an `fx.drive`, `fx.comp`, `fx.hall` und an `project.buses.hall`. Es steht nicht in den Parametern, `withFx`/`busOf` füllen es also nicht auf: **fehlt `v`, rechnet der Effekt wie vorher** (bitgleich, `tests/effekt-pegel.test.cjs` Teil 1). `PROJECT_VERSION` bleibt 1.
2. Gesetzt wird `v` nur beim Umschalten (`stampFx` in `src/effects.js`, aufgerufen von `setTrackFx`, `setMasterFx`, `applySound`, `_autoFxOn`, `recordAutoLane`): neu eingeschaltet → aktuelle Fassung (`FX_VERSION`, heute 2); ein alter, eingeschalteter Effekt bekommt beim Ausschalten `v: 1`, damit Aus/Ein im A/B-Vergleich nicht umstimmt. Drehen an Reglern ändert `v` nie. Hall-Bus (`setSend`): der erste Send eines Songs ohne Sender setzt `buses.hall.v = 2`, der letzte entfernte Send eines alten Songs `v: 1`.
3. **Fassung 2:**
   - Verzerrer: fester Ausgleich auf den Effektivwert eines Sinus mit Spitze 0,25 und dahinter ein **gemessener Ausgleich** (Worklet `loopwerk-match`: Ausgang = verzerrt · √(Leistung trocken / Leistung verzerrt), K-gewichtet wie LUFS, zweimal mit 0,2 s geglättet) – auch für die Verstärker-Arten. Die Kennlinien bleiben, nur der Pegel folgt dem trockenen Signal. Ohne Worklet bleibt der feste Ausgleich.
   - Kompressor: Verhältnis 1 + Stärke · 4 (statt · 7), Knie 12 dB (statt 6), die Anhebung des DynamicsCompressor (Blink/WebKit: (1/Kennlinie bei 0 dBFS)^0,6, nachgerechnet in `dcMakeupDb`) wird herausgenommen, eigener Ausgleich 60 % der Absenkung bei −11,5 dBFS. Stärke 50 %: 0 dBFS → −4,4 dBFS (Fassung 1: +0,9).
   - Hall: neue Impulsantwort (`hallImpulse2`): links/rechts unabhängiges Rauschen, Vorverzögerung 8–25 ms, weicher Einsatz, wärmer, Hochpass 200 Hz (24 dB/Oktave), feste Energie (`normalize` aus) mit `HALL_GAIN` so, dass die Voreinstellung (Anteil 25 %) auf einer Fläche rund 12 dB unter dem Direktsignal liegt; der Bus mit Send 50 % und Lautstärke 80 % genauso.
4. Gemessen (Drums / Fläche / Bass / Arp der Analyse): Kompressor neu −1,3 / +1,1 / −0,1 / +1,1 LU (Fassung 1: +5,7 / +9,4 / +6,7 / +9,3), Verzerrer neu −0,5 / 0,0 / 0,0 / +0,2 LU (Fassung 1: +4,2 / +8,6 / +5,7 / +8,9), Hall neu −13 dB unter dem Direktsignal, Breite der Fläche 0,011 → 0,027, 50–110 Hz −31 dB unter 1 kHz.

**Folgen:**
- Ein Song aus einem Starter, der Effekte oder Sends setzt („Melodic Techno“), bekommt beim Erzeugen die neue Fassung (Hall-Bus etwa 2 dB lauter und wärmer); gespeicherte Songs nicht.
- Wer eine Kopie einer Spur anlegt, kopiert `v` mit. Ältere App-Stände ignorieren das Feld und spielen dann Fassung 1.
- Neue Fassungen später (`v: 3`) gehen genauso: alte Werte bleiben, neue entstehen nur beim Einschalten.

## Nachtrag 2026-11 – Fassung 1 entfernt (Entscheidung Martin, 2026-11)
- **Entscheidung:** Auf bestehende Songs muss keine Rücksicht genommen werden. Verzerrer, Kompressor, Hall und Hall-Bus klingen immer wie die frühere Fassung 2, für alte wie neue Projekte. Weg sind `FX_VERSION`, `BUS_VERSION`, `stampFx`, der alte Pegelausgleich des Verzerrers, die Kennlinie 1 + Stärke · 7 / Knie 6 / Ausgleich Stärke · 9 dB des Kompressors und die alte Impulsantwort (`hallImpulse` ist jetzt die frühere `hallImpulse2`).
- Das Feld `v` wird nicht mehr geschrieben. Steht es in einer alten Datei (an `fx.*` einer Spur oder des Masters, an `project.buses.*`), verwirft `dropFxVersions` es still beim Laden (`Store.replace`, `Store.openSong`); ein Bus-Eintrag, der danach leer ist, fällt weg. Speichern schreibt es also nicht zurück.
- **Folgen:** Alte Songs mit eingeschaltetem Kompressor oder Verzerrer werden 4–9 LU leiser, ihr Hall rund 6 dB lauter, breiter und ohne Tiefen. Nulltest Fassung 2 vorher/nachher (`tools/perf/render-null.cjs --szene alle-effekte`): −112,5 dB, im Rauschen der Faltung. `tests/effekt-pegel.test.cjs` Teil 1 prüft jetzt: altes Projekt mit `v: 1`, `v: 2` oder ohne `v` klingt wie neu eingeschaltet; der Bezug `tests/fixtures/fx-legacy.f32` ist neu erzeugt.
