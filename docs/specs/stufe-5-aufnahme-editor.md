# Stufe 5 – Eigene Sounds: Import, Aufnahme, Sample-Editor

## Ziel
Eigene Klänge ins Projekt bringen und bearbeiten – so einfach wie Loops aus dem Regal.

## Bedienung
- **Importieren:** „+ Eigene Sounds importieren“ im Regal (mehrere Dateien möglich) oder Audiodateien direkt auf eine Spur ziehen. Ein importierter Sound ist danach ausgewählt – Klick in eine Spur setzt ihn ein.
- **Aufnahme:** Knopf „Aufnahme“ im Deck. Ein Takt Vorzähler, dann läuft der Song ab der Abspielmarke (auf Takt gerundet) mit. Erneut klicken oder Leertaste beendet. Die Aufnahme landet auf der Spur des ausgewählten Clips, sonst auf der ersten freien Spur.
- **Sample-Editor:** Doppelklick auf einen Clip oder „Bearbeiten“. Bereich auf der Wellenform ziehen; Zuschneiden, Entfernen, Stille, Ein-/Ausblenden, Rückwärts, Normalisieren, ±3 dB, Tonhöhe ±12 Halbtöne, „Als Loop“ mit Schlagzahl (dann tempo-synchron gestreckt). Eigenes Rückgängig. „Übernehmen“ legt einen neuen eigenen Sound an und setzt ihn in den Clip – das Original bleibt erhalten.
- **Eigene Sounds verwalten:** Kategorie „Eigene“ im Regal; „×“ löscht mit Bestätigung, aber nicht, solange der Sound im Projekt benutzt wird.

## Speicherung
- Pro Browser in IndexedDB (als WAV).
- In der Projektdatei werden alle benutzten eigenen Sounds eingebettet (Base64-WAV) und beim Öffnen wiederhergestellt.

## Grenzen
- Im Artifact (claude.ai) gibt es keinen Mikrofonzugriff. Die App erklärt das und verweist auf den Import.
- Latenzausgleich automatisch aus `outputLatency + baseLatency + Eingangslatenz`; eine manuelle Korrektur fehlt noch.
- Eigene Sounds höchstens 5 Minuten.

## Technik
`src/dsp/edit.js` (reine Funktionen), `src/own-sounds.js`, `src/recorder.js` + `src/dsp/recorder-worklet.js`, `src/ui/editor.js`. Mixer und Editor teilen sich das Dock (`ui.dock`).

## Tests
`tests/stufe5.test.cjs`: alle Bearbeitungen messbar, Import per Knopf und per Ziehen, Editor-Ablauf mit Rückgängig und Übernehmen, Loop-Streckung, Einbetten und Wiederherstellen aus der Projektdatei, Neuladen, Löschschutz, Aufnahme mit simuliertem Mikrofon (Vorzähler, Länge, Signal).

## Ohr-Test für Martin
Lokal im Browser (nicht in claude.ai) etwas zum Beat einsingen oder klatschen: Sitzt die Aufnahme im Takt, oder ist sie hörbar zu spät/zu früh?
