# Umbau der Oberfläche: Übergabe

Stand: 2026-11-11, `main` bei Vorschau 111. Diese Datei ist der Einstieg für den neuen Chat. Sie ersetzt die Vorgeschichte.

## Auftrag (Martin)
> „Ich will die gesamte Oberfläche umstrukturieren. Bei der heutigen Aufteilung wirkt erst alles sinnvoll, ist es aber irgendwie nicht. Es wirkt unnötig komplex. Funktional soll alles erhalten bleiben, nur anders verortet.“

Es ist ein **Test**: entweder in einer Kopie oder so, dass man ohne Aufwand zurück kann.

## Rollen
- **Martin gibt genau vor, was wie und wo liegt.** Die Struktur kommt von ihm.
- **Claude setzt um** und legt jeden Schritt als Bild und in der Vorschau zur Abnahme vor. Keine eigenen Umstellungen über die Vorgabe hinaus; Unklares wird gefragt, nicht geraten.

## Feste Regeln für den Umbau
1. **Keine Funktion geht verloren.** Jede Funktion der Liste unten ist nach dem Umbau erreichbar, auf Desktop und Handy.
2. **Nur der Ort ändert sich.** Verhalten, Klang, Engine, Modell und Speicherformat bleiben unberührt (`src/engine.js`, `src/effects.js`, `src/dsp/*`, `src/samples.js`, `src/levels*.js`, `src/model.js` nur, wenn eine Verortung es zwingend braucht).
3. **Kennungen bleiben.** Die 73 Tests finden Funktionen über `id` und feste Klassen. Bleiben die Kennungen und ändert sich nur der Ort, bleiben die Tests das Sicherheitsnetz. Angepasst werden nur Tests, die Position, Größe oder Zählwerte prüfen, und zwar begründet.
4. **Regeln aus `CLAUDE.md` gelten weiter:** Look Phosphor nur über Tokens, Texte Deutsch, höchstens zwei Klicks für Grundfunktionen, keine Pflichtdialoge, Editions-Unterschiede nur in `src/edition.js`, „Skript zuerst“.

## Rückweg
- **Branch `umbau`** (von `main` abzweigen). `main` bleibt, wie es ist. Zurück = Branch wechseln; übernehmen = einfügen.
- **Eigene Vorschau:** ein NEUES Artifact für den Umbau (beim ersten Veröffentlichen ohne `url`, eigener Dateipfad bzw. Titel „Loopwerk Umbau“). Die bestehende Vorschau https://claude.ai/artifact/LAPXHQXC5sb54jFkNbJcpP wird vom Umbau nicht angefasst. Den neuen Link hier eintragen: _(noch offen)_
- `tools/vorschau-stand.json` gehört zur bestehenden Vorschau. Für den Umbau einen eigenen Stand führen (z. B. `tools/vorschau-stand-umbau.json`, Skript `tools/vorschau.cjs` dafür um eine Option erweitern).
- **GitHub Pages** baut nur `main`. Braucht Martin den Umbau am Handy mit Mikrofon, ihn zusätzlich unter `/umbau/` ausliefern (Erweiterung von `tools/build-pages.cjs` und des Workflows; erst auf Wunsch).
- Die Zählbasis `tests/count-baseline.json` darf sich im Branch `umbau` ändern (das ist der Zweck). Auf `main` bleibt sie exakt.

## Erste Schritte im neuen Chat
1. Branch `umbau` anlegen.
2. **Offene Fragen an Martin stellen** (siehe unten), bevor etwas gebaut wird.
3. **Funktionsliste per Skript erzeugen** (`tools/funktionen.cjs` → `docs/umbau/funktionen.md` und `.json`): jede Bedienfunktion mit Kennung, Beschriftung (Text, `title`, `aria-label`), Art, heutigem Ort (Deck, Regal, Arranger-Leiste, Spurkopf, Inspektor Clip/Spur/Song, Fächer Mixer/FX-Pad/Editor/Export/Song, Menüs, Werkbank, Tastenkürzel, Gesten), sichtbar je Gerät (Desktop 1440×900, Handy 390×844) und je Edition (Loopwerk, Krachwerk). Das Skript geht die Szenen aus `tools/shots.cjs` durch (start, song, clip, beat, melodie, clip-editor, mixer, mastering, export, werkbank) und sammelt ein. Tastenkürzel und Gesten stehen nicht im DOM: aus `src/main.js`, `src/ui/touch.js`, dem Kürzel-Dialog und `docs/analyse/2026-11-bedienung.md` (Abschnitt Auffindbarkeit) ergänzen.
   - Dasselbe Skript vergleicht später zwei Stände (`--vergleich vorher.json`): Was fehlt, was ist neu, was ist umgezogen. Das ist der Nachweis für Regel 1.
4. Martins Vorgaben in `docs/umbau/struktur.md` festhalten (Ziel-Ort je Funktion), ihm zur Bestätigung zeigen.
5. In Scheiben umbauen (ein Bereich je Scheibe). Nach jeder Scheibe: Funktionsvergleich, betroffene Tests (`node tools/test.cjs --only …`), `npm run regeln`, Bilder (`npm run shots -- --out … --szene …`, Desktop und Handy), Vorschau aktualisieren, Martin sieht es an.
6. Erst nach Martins Ja die nächste Scheibe. Die ganze Testkette einmal am Ende jeder größeren Etappe.

## Stand
- 2026-11-11: Branch `umbau` angelegt. `tools/funktionen.cjs` gebaut und gelaufen: 477 Funktionen (Loopwerk Desktop 280 erreichbar, Handy 186; Krachwerk Desktop 250, Handy 168). Ausgangsstand: `docs/umbau/funktionen.json` (Stand `main` 5b9b359); zwei Läufe hintereinander ergeben denselben Stand. Für den Nachweis nach einer Scheibe: `node tools/funktionen.cjs --out <ordner>/funktionen --vergleich docs/umbau/funktionen.json`.
- Grenzen der Liste: „versteckt“ heißt, das Element war in keinem geprüften Zustand zu sehen. Das trifft auch Funktionen, die nur in besonderen Lagen erscheinen (Take-Clip, eigener Sound mit Tempo, laufende Aufnahme, Tipps, „Aus dem Netz holen“). Für den Vergleich vorher/nachher ist das unschädlich, weil beide Läufe dieselben Zustände prüfen.
- 2026-11-11: Martin hat Umfang (nur Loopwerk) und Richtung genannt: rechte Leiste mit Reitern Datei, Assets, Mixer. Festgehalten als Entwurf in `docs/umbau/struktur.md`, mit sieben Rückfragen; noch nicht bestätigt.

## Offene Fragen an Martin (noch nicht beantwortet)
1. **Umfang:** nur Loopwerk oder auch Krachwerk? Desktop und Handy gleichzeitig oder ein Gerät zuerst?
2. **Was stört konkret?** Zwei, drei Stellen, an denen es sich unnötig komplex anfühlt.
3. **Die neue Struktur:** Martins Vorgabe, was wie und wo liegen soll (Text, Skizze oder Figma; das Figma-Plugin liegt in `tools/figma-plugin/`).

## Ausgangslage in Zahlen
- Erster Start Loopwerk Desktop: 80 Bedienelemente, 11 Schriftgrößen; Handy 48. Krachwerk Desktop 22, Handy 13.
- Am vollsten: Loopwerk Desktop mit offenem Beat-Editor, 223 Bedienelemente und 167 Rahmen.
- Für „Bearbeiten“ gibt es sieben Namen (Bearbeiten, Editor, Clip-Editor, Sample-Editor, Pattern-Editor, Beat-/Melodie-Editor, Werkbank).
- Dieselbe Funktion liegt je Gerät woanders (Song-Starter, „+ Neu“, Schneiden, Mixer/Mischen); am Handy fehlen „Auswählen“ und die Gesten-Hilfe in jedem Fach.
- 141 Zeilen nutzen feste Farbwerte statt der Tokens (`tools/regeln-basis.json`).
- Quellen: `docs/analyse/2026-11-bedienung.md` (mit 24 Bildern), `docs/analyse/2026-11-konzept.md`, `docs/analyse/2026-11-abschluss.md`.

## Wo die Oberfläche heute steht (Code)
- `index.html`: Gerüst und das gesamte CSS (rund 4 300 Zeilen).
- `src/ui/layout.js` + `place.js`: setzen dieselben Knöpfe je Bildschirm an ihren Platz (Desktop: Deck, Menüs, Leisten; Handy: Fächer). Hier ist die Trennung „Funktion“ und „Ort“ schon angelegt und der naheliegende Hebel für den Umbau.
- `src/ui/sheets.js`: Fächer als Schubladen; `#tabbar`: Fachleiste; `inspector.js`: rechte Spalte; `library.js`: Regal; `transport.js`: Deck; `mobile.js`: Handy.
- `src/edition.js` + `src/ui/surfaces.js`: Flächen je Edition ein- und ausschalten (`data-surface`); `tools/werkstatt-page.cjs` erzeugt die Krachwerk-Seite aus `index.html`.

## Arbeitsweise
- **Skript zuerst** (steht in `CLAUDE.md`, gilt automatisch): vorhandene Skripte in `tools/` benutzen, Wiederkehrendes als Skript ablegen.
- **Agenten sparsam:** höchstens ein bis zwei gleichzeitig. Mit bis zu sieben parallel ist das Fünf-Stunden-Limit zweimal gerissen. Das Umsetzen klar vorgegebener Verortung ist Arbeit für `ui-engineer` (Sonnet); Prüfen mit `ux-designer` oder `qa`.
- **Parallele Agenten testen nur ihren Bereich**, die ganze Kette fährt die Haupt-Session nach dem Einfügen (`tools/merge-agent.sh`).
- **Vorschau veröffentlichen:** zu Beginn der Sitzung einmal die Dateien des Artifacts auflisten (Skill `artifact-sync`), dann `npm run vorschau`.

## Nicht Teil des Umbaus (läuft getrennt auf `main`)
- Martins Hörproben und Abnahmen zu Klang und Performance und die neun Entscheidungen in `docs/analyse/2026-11-abschluss.md`.
- Krachwerk 3b (Speicher v2), wartet auf Martins ZIP-Sicherung.
