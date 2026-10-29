# Roadmap

## ✅ Stufe 1 – Spike (0.1)
- 15 synthetische Loops in 5 Kategorien (Drums, Bass, Akkorde, Synth, FX), 120 BPM, A-Moll
- 8 Spuren, Loops per Drag & Drop oder Auswählen + Klick einsetzen, Raster Takt/½/Schlag
- Clips verschieben, über Spuren ziehen, verlängern (Wiederholung), Alt+Ziehen kopiert, Überschreiben teilt
- Start/Stopp, Position per Lineal, Loop-Bereich per Ziehen im Lineal, Metronom
- Mute/Solo/Lautstärke pro Spur, Master-Pegel, Undo/Redo, Autospeichern im Browser
- Tests: samplegenaues Timing, Drag & Drop, Loop-Sprung

## ✅ Stufe 2 – Arranger-Komfort (0.2)
- Clip-Lautstärke und Fade-In/-Out über Griffe auf der Hüllkurve, Wellenform zeigt das Ergebnis
- Clips links kürzen (Phase bleibt), teilen an der Abspielmarke (T), duplizieren (Strg+D), Löschen-Knopf für Touch
- Spuren umbenennen (Doppelklick), hinzufügen (bis 16), löschen mit Bestätigung
- Projekt als `.json` speichern (im Artifact über `downloads`) und öffnen
- Engine: Hüllkurve pro Stimme, Überblendung an Schnittkanten – Teilen ist klanglich neutral (gemessen)
- Spec: `docs/specs/stufe-2-arranger-komfort.md`, Tests: `tests/stufe2.test.cjs`

### Offen aus Stufe 2
- Mehrfachauswahl (mehrere Clips gemeinsam verschieben/löschen)
- Clip-Lautstärke über 0 dB

## ✅ Stufe 3 – Bibliothek und Tempo (0.3)
- 33 CC0-Sounds aus Sonic Pi (Loops, Drums, Bass, Flächen, Glocken, FX) mit Quelle und Lizenz je Sound
- Regal mit Suche, Kategorie-Filter und Favoriten
- Tempo frei wählbar (60–200 BPM): synthetische Loops neu gerendert, echte Loops gestreckt (eigenes WSOLA, ADR 001), One-Shots auf ganze Schläge aufgefüllt
- Spec: `docs/specs/stufe-3-bibliothek-tempo.md`, Tests: `tests/stufe3.test.cjs`

### Offen aus Stufe 3
- VCSL (echte Instrumente) – aus der Arbeitsumgebung nicht erreichbar
- Tempowechsel schneller (Worker, benutzte Sounds zuerst)
- Tonart wählbar (Loops transponieren)

## ✅ Stufe 4 – Mixer und Effekte (0.4)
- Mixer-Dock: Kanalzug je Spur plus Master mit Fader, Panorama, M/S, Pegelanzeige
- Festes Effekt-Rack je Kanal: EQ, Kompressor, Echo (tempo-synchron), Hall
- Live umschaltbar ohne Knackser, identisch im Offline-Rendering
- Spec: `docs/specs/stufe-4-mixer-effekte.md`, Tests: `tests/stufe4.test.cjs`

### Offen aus Stufe 4
- Freie Effekt-Slots, Send-Effekte, Automation

## ✅ Stufe 5 – Eigene Sounds (0.5)
- Import per Knopf oder Datei auf eine Spur ziehen; eigene Sounds bleiben im Browser gespeichert und werden in Projektdateien eingebettet
- Mikrofon-Aufnahme mit Vorzähler und Latenzausgleich (außerhalb von claude.ai)
- Sample-Editor: Auswahl, Zuschneiden, Entfernen, Stille, Fades, Rückwärts, Normalisieren, Pegel, Tonhöhe, „Als Loop“
- Spec: `docs/specs/stufe-5-aufnahme-editor.md`, Tests: `tests/stufe5.test.cjs`

### Offen aus Stufe 5
- Manuelle Latenz-Korrektur, Mehrspur-Aufnahme, Aufnahme im Loop (Takes)

## Stufe 6 – Export
- WAV (Encoder vorhanden: `src/wav.js`), MP3

## Stufe 7 – Instrumente
- Drum-Step-Sequencer, einfacher Synth mit Piano-Roll, MIDI-Eingang

## Später
- Automation, Tonart-Erkennung, Stem-Trennung, Desktop-App (Tauri), Plugins
