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

## ✅ Stufe 6 – Export (0.6)
- WAV (verlustfrei) und MP3 (192 kBit/s, LAME/lamejs) aus dem ganzen Song oder dem Loop-Bereich, mit Ausklang für Hall und Echo
- Im Artifact als ZIP gespeichert (dort dürfen Audiodateien nur verpackt gespeichert werden)
- Spec: `docs/specs/stufe-6-export.md`, ADR 002, Tests: `tests/stufe6.test.cjs`

### Offen aus Stufe 6
- Einzelspuren (Stems) exportieren, Normalisieren beim Export

## ✅ Stufe 7 – Instrumente (1.0)
- Beat-Editor (Stepsequencer, 8 Instrumente, zwei Kits) und Melodie-Editor (Piano-Roll, vier Klänge)
- Eingabe per Maus, Computertastatur (Schritt-Eingabe) und MIDI-Keyboard
- Patterns werden zu Loops gerendert und verhalten sich wie jeder Clip
- Spec: `docs/specs/stufe-7-instrumente.md`, Tests: `tests/stufe7.test.cjs`

### Offen aus Stufe 7
- Anschlagstärke pro Schritt/Note, Swing, Akkord-Eingabe, Echtzeit-Aufnahme von MIDI

## ✅ 1.1 – Handy-Bedienung
- Sound-Regal als Akkordeon: Kategorien auf- und zuklappen, am Handy immer nur eine offen, kein eigener Scrollbereich mehr, größere Tippziele
- Tests: `tests/mobil.test.cjs` (echte Touch-Eingabe)

## ✅ 1.2 – Mobile Bedienung
- App füllt den Bildschirm, die Seite scrollt nicht mehr: kompaktes Deck oben (Start/Stopp, Loop, Takt, Tempo), Arranger in der Mitte
- Leiste unten (Sounds, Mixer, Rückgängig, Mehr); Regal, Mixer, Editoren, Export und „Mehr“ erscheinen im Fach direkt darüber, der Arranger bleibt sichtbar
- Clips: erst antippen, dann ziehen; Wischen über Clips scrollt. Werkzeugleiste für den ausgewählten Clip mit Bearbeiten, Teilen, Duplizieren, Löschen und Reglern für Lautstärke und Fades
- Hinweiszeile mit Fingertexten und „Fertig“ beim Einsetzen, Tippziele ≥ 44 px, Piano-Roll und Stepsequencer fingertauglich, Spuren per Antippen umbenennen
- Spec: `docs/specs/mobil-ux.md`, Tests: `tests/mobil.test.cjs`

### Offen aus 1.2
- Pinch-Zoom im Arranger, Notenlänge per Finger ziehen, Prüfung im Rahmen der Claude-App auf echten Geräten

## ✅ 1.3 – Beat-Editor und Bildschirmtastatur
- Beat-Editor am Handy mit Umschalter für die Takthälften (und Wischen), Tempo-Fach ohne Tastatur, Tastatur-Modus für Suche und Namen
- Spec: `docs/specs/mobil-ux.md` (Abschnitt 1.3), Tests: `tests/mobil.test.cjs`

## ✅ 1.4 – Feiner arbeiten, Techno, Effekte, Drumpad
- Raster bis 1/16 und frei (Umschalt), Alt+Pfeil schiebt Clips, Zoom 4–192 px/Schlag mit Strg+Mausrad und zwei Fingern
- Spuren heißen automatisch wie ihr erster Clip; Spur-Menü (duplizieren, verschieben, umbenennen, löschen), Spurkopf ziehen
- Techno-Paket (14 Sounds) und Techno-Kit; Genres an allen Sounds, Regal nach Genre ordnen
- Neue Effekte: Verzerrer (Warm, Hart, Fuzz, Bitcrusher), Filter mit taktsynchroner Bewegung, Pumpen; Kompressor mit Ansprache, Ausklang, Pegel
- Drumpad mit Live-Aufnahme im Loop (quantisiert), Klaviatur im Melodie-Editor (Desktop), Live-Melodie
- Markt-Scout-Agent: `docs/markt-scout/2026-10-29.md`
- Spec: `docs/specs/v1.4-komfort-techno-effekte.md`, Tests: `tests/v14.test.cjs`

## ✅ 1.5 – Einsingen, Autotune, Trennen
- Import: neuer Sound wird im Regal aufgeklappt und angesprungen; Hinweis, wenn eine App die Dateiauswahl sperrt
- Melodie einsingen (Mikrofon oder Datei) → Noten im Melodie-Editor, Klang frei wählbar; Lead-Melodie aus ganzen Songs
- Elf Klänge (neu: E-Piano, Orgel, Flöte, Glocke, Streicher, Blech, Acid)
- Sample-Editor: Autotune (Tonart, Stärke, Roboter), Stimme entfernen/isolieren, Song in vier Ebenen zerlegen (Näherung, ADR 003)
- Spec: `docs/specs/v1.5-einsingen-trennen.md`, Tests: `tests/v15.test.cjs`

## ✅ 1.6 – Ideen von Claude
- „✨ Weiterführen“ im Melodie-Editor: Claude (im Artifact) oder Regeln führen die Melodie fort, nochmal klicken = neue Idee
- „Wie soll es klingen?“: Beschreibung → Klang, Name und Effekte (Claude oder Stichwörter); nach dem Einsingen automatisch
- Spec: `docs/specs/v1.6-ideen-von-claude.md`

## Als Nächstes
- GitHub-Repo verbinden, GitHub Pages (dort geht das Mikrofon)
- Aus dem Markt-Scout: Song-Starter, Akkord-Streifen, Songtonart, Effekt-Pad, Ein-Klick-Mastering, Tonleiter-Sperre

## Später
- Automation, Tonart-Erkennung, Stem-Trennung, Desktop-App (Tauri), Plugins
