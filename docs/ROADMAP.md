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

## Stufe 3 – Bibliothek
- Freie CC0-Bibliotheken anbinden (Kandidaten: Sonic-Pi-Samples, VCSL), Lizenz je Sample
- Suche, Favoriten, Vorhören synchron zum Song
- Tempo frei wählbar mit Time-Stretching (Signalsmith Stretch, MIT)

## Stufe 4 – Mixer und Effekte
- Mixer-Ansicht, Panorama, EQ, Hall, Echo, Kompressor pro Spur und Master

## Stufe 5 – Aufnahme und Sample-Editor
- Mikrofon-Aufnahme mit Einzähler und Latenzausgleich, eigene Dateien importieren
- Editor: schneiden, normalisieren, rückwärts, Fades, Pitch

## Stufe 6 – Export
- WAV (Encoder vorhanden: `src/wav.js`), MP3

## Stufe 7 – Instrumente
- Drum-Step-Sequencer, einfacher Synth mit Piano-Roll, MIDI-Eingang

## Später
- Automation, Tonart-Erkennung, Stem-Trennung, Desktop-App (Tauri), Plugins
