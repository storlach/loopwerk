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
- Projektname im Deck (am Handy unter „Mehr“) editierbar, bestimmt Dateinamen und Fenstertitel
- Behoben: Nach dem Umbenennen einer Spur am Handy (Tipp daneben) blieb die Leiste unten verschwunden

- GitHub: https://github.com/storlach/loopwerk (führend), Seite: https://storlach.github.io/loopwerk/ (bei jedem Push auf main über `.github/workflows/pages.yml`, Bau mit `tools/build-pages.cjs`; Mikrofon geht dort)

## ✅ 1.7 – Flüssige Tasteneingabe, Splash-Screen
- Tasten und Pads: kein Schlag geht mehr verloren. Der Arranger zeichnet nur noch geänderte Spuren neu (15 ms → 0,3 ms je Eingabe). Live-Aufnahme verschmilzt schnelle Sechzehntel nicht mehr. Jedes Pad leuchtet bei jedem Schlag neu auf. Auswahlfelder schlucken keine Buchstaben mehr.
- Splash-Screen mit Logo, animierten Pegelbalken, Fortschrittsbalken (Prozent und aktueller Ladeschritt) und Ausblenden.
- Tests: `tests/v17.test.cjs`

## ✅ 1.8 – Neues Desktop-Layout, Schubladen, Tipps, Drücken und Halten
- Desktop nach UX-Prüfung (Variante B):
  - Deck in einer Zeile mit Projekt-Menü und Export-Klappfeld
  - links „Sounds | Erstellen“ (Karten zum Klicken oder Ziehen)
  - rechts der Inspektor für Clip, Spur oder Song (Effekte haben dort genau einen Ort)
  - unten Mixer, Editor, Hinweis und Tastenkürzel
- Fächer als Schubladen über den Spuren (Desktop und Handy): Griff zum Aufziehen, nach unten wischen schließt, Schatten
- Tutorial: Tipps beim ersten Sehen eines Bereichs, abschaltbar; feste Erklärtexte am Desktop entfernt
- Teilen per Schere, Sample-Editor mit Reitern, Einsingen links neben der Piano-Roll, neue Patterns auf eigener Spur in passender Farbe
- Drücken und Halten:
  - Pads wirbeln, Töne klingen solange gehalten (auch MIDI)
  - die Schritt-Eingabe übernimmt die Haltedauer
  - im Beat-Raster malt Ziehen mehrere Schritte
- Handy: senkrechte Klaviertasten an der Piano-Roll; Ladescreen sofort sichtbar
- Spec: `docs/specs/v1.8-layout-schubladen-tipps.md`, Tests: `tests/v18.test.cjs`

## ✅ 1.9 – Handy und Desktop aus einem Guss
- Eine Fachleiste für beide (Sounds, Mixer, Editor, Mehr); am Desktop nur unter dem Arranger, Reiter hängen an ihrer Schublade
- Hinweiszeile entfällt: Rückmeldungen als Einblender, Erklärungen in den Tipps
- Rückgängig am Handy als Taste im Deck
- Handy: Mixer mit langen Fadern und Effekt-Seite je Kanal, Melodie-Editor öffnet oben mit großen Tasten, jede Schublade merkt sich ihre Höhe
- Favicon aus den Intro-Balken
- Drei UI-Richtungen für den neuen Look: `docs/ux/richtungen/` (Nachtglas, Werkstück, Sticker)
- Spec: `docs/specs/v1.9-aus-einem-guss.md`, Tests: `tests/v19.test.cjs`

## ✅ 2.0 – Werkstück
- Neuer Look „Werkstück“: Graphit und Gummi, eine Signalfarbe, Display, LED-Logo, Etiketten-Clips, Drehregler; dunkel als Hauptmodus, hell als silbernes Gehäuse
- Überlappen ohne Verlust: der obere Clip klingt, der untere bleibt ganz erhalten
- Mixer am Handy: wischen ohne Regler zu verstellen, Fader relativ, Panorama als Drehregler
- Aus dem Netz holen: Links zu Audiodateien, Einfügen mit Strg+V; YouTube über „Ton aus einem Tab aufnehmen“ (Computer, Chrome/Edge)
- Schubladen: Bewegung vom Motion-Designer überarbeitet
- Neue Rollen im Team: UI-Designer, Motion-Designer, Creative Director
- Spec: `docs/specs/v2.0-werkstueck.md`, Tests: `tests/v20.test.cjs`

## Als Nächstes
- Aus dem Markt-Scout: Song-Starter, Akkord-Streifen, Songtonart, Effekt-Pad, Ein-Klick-Mastering, Tonleiter-Sperre

## Look
- Seit 2.0 „Werkstück“ (siehe `docs/ux/richtungen/`). Farben, Schriften und Bausteine nur über die Tokens in `:root`.

## Später
- Automation, Tonart-Erkennung, Stem-Trennung, Desktop-App (Tauri), Plugins
