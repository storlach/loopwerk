# ADR 007: Krachwerk als Edition der vollen App

**Status:** angenommen (Martin, 02.11.2026: „mach“) · **Spec:** `docs/specs/krachwerk-1-geruest.md`

## Kontext
Der Prototyp unter `/werkstatt/` (`src/werkstatt/main.js`) ist eine zweite App. Er hat eine eigene Signalkette, einen eigenen Takt und einen eigenen Speicher, aber keinen Arranger. Martin will Loopwerk mit Song und Spuren, nur mit selbst gemachtem Material und einer ruhigeren Oberfläche. Die Regel „Realtime und Offline nutzen eine Signalkette“ verletzt der Prototyp.

## Entscheidung
- `/werkstatt/` lädt dasselbe `index.html` und `src/main.js`. `window.LOOPWERK_EDITION='make'` wählt die Edition.
- Alle Unterschiede stehen in einer Tabelle in `src/edition.js`: Kataloge, Speicher, Voreinstellungen, Flächen (`surfaces`), Dichte, Zwillinge. Nur `main.js` liest sie und gibt sie als Optionen weiter.
- Im Markup schalten `data-surface` (Fläche an/aus) und `data-tier` (Stufe in der Dichte `calm`) die Oberfläche. Das CSS dafür steht in einem einzigen Block. Loopwerk kann `calm` später übernehmen.
- Kataloge werden in Scheibe 1 nur abgeschaltet und nicht per `import()` nachgeladen.
- Eigene Sounds liegen in der IndexedDB `loopwerk-make`, im selben Schema wie bisher. Die Prototyp-Daten gelten ohne Kopie weiter.

## Alternativen
- **Getrennte Schale (Prototyp weiterbauen):** doppelte Engine und doppelter Speicher, und der Arranger fehlt. Abgelehnt.
- **Neue schlanke Schale für beide Apps:** monatelang zwei Oberflächen, die Arbeit aus 1.8–2.12 noch einmal. Abgelehnt.
- **Zweites `index.html` für Krachwerk:** doppeltes Markup und CSS. Abgelehnt, die Seite wird aus `index.html` erzeugt.

## Folgen
- Eine Engine, eine Projektdatei, ein Testlauf. Krachwerk-Projekte öffnen in Loopwerk und umgekehrt (unbekannte Clips bleiben als Platzhalter).
- Risiko: Die Sonderregeln für `calm` wuchern. Gegenmittel sind die Grenze von 150 Zeilen CSS, die Zwillingsliste und der Zähltest.
- Am Handy lädt Krachwerk mehr Code als die Pad-Wand, weil die Katalog-Module weiter mitkommen. Die Startzeit wird gemessen. Wird sie zu lang, folgen `import()`-Kataloge mit eigener Prüfung der Loopwerk-Tests.
- Der Prototyp wird zurückgebaut. `clean.js` und `slice.js` ziehen nach `src/dsp/`, `sw.js`, Manifest und Icons bleiben.
