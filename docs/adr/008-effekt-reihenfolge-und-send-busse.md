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
