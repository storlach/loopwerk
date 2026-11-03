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
- ~~Mehrfachauswahl~~ (erledigt in 2.1)
- ~~Clip-Lautstärke über 0 dB~~ (erledigt: bis +12 dB; Regler und Griff bis 0 dB linear, darüber ein Fünftel Regelweg in dB, Griff über den oberen Clip-Rand hinaus ziehen, Etikett „+6,0 dB“ am Clip)

## ✅ Stufe 3 – Bibliothek und Tempo (0.3)
- 33 CC0-Sounds aus Sonic Pi (Loops, Drums, Bass, Flächen, Glocken, FX) mit Quelle und Lizenz je Sound
- Regal mit Suche, Kategorie-Filter und Favoriten
- Tempo frei wählbar (60–200 BPM): synthetische Loops neu gerendert, echte Loops gestreckt (eigenes WSOLA, ADR 001), One-Shots auf ganze Schläge aufgefüllt
- Spec: `docs/specs/stufe-3-bibliothek-tempo.md`, Tests: `tests/stufe3.test.cjs`

### Offen aus Stufe 3
- ~~VCSL (echte Instrumente)~~ (erledigt in 2.4)
- ~~Tempowechsel schneller (Worker, benutzte Sounds zuerst)~~ (erledigt): `Library.setTempo(bpm, { first })` bereitet die Sounds des Songs zuerst vor (parallel), den Rest danach im Hintergrund; was dort noch nicht dran war, macht `ensure()` beim Vorhören/Einsetzen sofort. Echte Loops dehnt der Rechen-Worker (WSOLA), jeder Auftrag beginnt in einer eigenen Aufgabe – keine langen Aufgaben im Hauptthread. Ein neuer Wert verwirft ältere Aufträge (laufende Rechnungen werden fertig, aber nicht übernommen). Die Wiedergabe läuft weiter: die Engine setzt an der gehörten Stelle im neuen Tempo an; Sounds, die noch im alten Tempo vorliegen, klingen bis zur neuen Fassung mit `playbackRate` neu/alt (wie Tonband: Raster stimmt, Tonhöhe kurz verschoben) – lieber das als Stille; fertige tauscht `_resync` ohne Stopp ein. Gemessen auf der Testmaschine: Sounds des Songs nach etwa 0,35 s statt 1,2–3 s, alle geladenen nach etwa 2 s statt 3–7 s, längste Aufgabe im Hauptthread unter 50 ms statt etwa 0,9 s. Test: `tests/tempo-fast.test.cjs`.
- ~~Tonart wählbar~~ (erledigt, auch je Takt)

## ✅ Stufe 4 – Mixer und Effekte (0.4)
- Mixer-Dock: Kanalzug je Spur plus Master mit Fader, Panorama, M/S, Pegelanzeige
- Festes Effekt-Rack je Kanal: EQ, Kompressor, Echo (tempo-synchron), Hall
- Live umschaltbar ohne Knackser, identisch im Offline-Rendering
- Spec: `docs/specs/stufe-4-mixer-effekte.md`, Tests: `tests/stufe4.test.cjs`

### Offen aus Stufe 4
- Freie Effekt-Slots, Send-Effekte (Automation: erledigt in 2.12)

## ✅ Stufe 5 – Eigene Sounds (0.5)
- Import per Knopf oder Datei auf eine Spur ziehen; eigene Sounds bleiben im Browser gespeichert und werden in Projektdateien eingebettet
- Mikrofon-Aufnahme mit Vorzähler und Latenzausgleich (außerhalb von claude.ai)
- Sample-Editor: Auswahl, Zuschneiden, Entfernen, Stille, Fades, Rückwärts, Normalisieren, Pegel, Tonhöhe, „Als Loop“
- Spec: `docs/specs/stufe-5-aufnahme-editor.md`, Tests: `tests/stufe5.test.cjs`

### Offen aus Stufe 5
- Manuelle Latenz-Korrektur bzw. Einmessen per Klick, Mehrspur-Aufnahme, Aufnahme im Loop (Takes)

## ✅ Stufe 6 – Export (0.6)
- WAV (verlustfrei) und MP3 (192 kBit/s, LAME/lamejs) aus dem ganzen Song oder dem Loop-Bereich, mit Ausklang für Hall und Echo
- Im Artifact als ZIP gespeichert (dort dürfen Audiodateien nur verpackt gespeichert werden)
- Spec: `docs/specs/stufe-6-export.md`, ADR 002, Tests: `tests/stufe6.test.cjs`
- Einzelspuren (Stems): Haken im Export-Fach → ZIP mit „01 Drums.wav“ usw. je hörbarer Spur (gemutet/leer übersprungen, Solo ignoriert), Spur mit Effekten, Fader, Panorama, Kurven, Fades; ohne Master-Kette addieren sie sich exakt zum Mix, „Mit Summe“ schickt jede durch Master und Mastering; Fortschritt je Spur, abbrechbar (`renderProject` mit `onlyTrack`, `master: false`; `tests/stems.test.cjs`)

### Offen aus Stufe 6
- ~~Einzelspuren (Stems)~~ (erledigt) – Normalisieren beim Export: durch Mastering (2.10) abgedeckt; WAV mit 24 Bit oder 32 Bit Gleitkomma (übersteuert nicht) wählbar, Stems ohne Summe stellen 32 Bit voreingestellt ein (`tests/wav-bits.test.cjs`)

## ✅ Stufe 7 – Instrumente (1.0)
- Beat-Editor (Stepsequencer, 8 Instrumente, zwei Kits) und Melodie-Editor (Piano-Roll, vier Klänge)
- Eingabe per Maus, Computertastatur (Schritt-Eingabe) und MIDI-Keyboard
- Patterns werden zu Loops gerendert und verhalten sich wie jeder Clip
- Spec: `docs/specs/stufe-7-instrumente.md`, Tests: `tests/stufe7.test.cjs`

### Offen aus Stufe 7
- ~~Akkord-Eingabe, Echtzeit-Aufnahme von MIDI~~ (Anschlag, Swing, MIDI-Anschlag, MIDI-Drums, Akkord-Eingabe, Quantisieren: erledigt, siehe „Editor: MIDI, Akkorde, Quantisieren“)

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
- ~~Pinch-Zoom im Arranger, Notenlänge per Finger ziehen~~ (erledigt: Zoomen mit zwei Fingern, Halten-und-Ziehen in der Piano-Roll) – Prüfung auf echten Geräten bleibt Martins Ohr-/Hand-Test

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

## ✅ 2.1 – Mehr Griff, mehr Licht
- Mehrfachauswahl mit dem Cursor: Rahmen aufziehen, Umschalt-Klick, Strg+A; zusammen verschieben, kopieren, löschen
- Laufzeit eines Clips: doppelt so lang = halbes Tempo, gleiche Tonhöhe (WSOLA im Worker) – seit „Geschwindigkeit eines Clips“ als Regler 50–200 % mit „wie Tonband“
- Spurgruppen als Akkordeon: einklappen mit Übersicht, Gruppe stumm/solo, umbenennen, auflösen
- Licht aus der Musik: Umgebungslicht folgt Pegel und Farben der klingenden Clips, Leuchten und Funken nur an der Abspielmarke
- Wunsch-Agent: ein Satz → Plan (Claude im Artifact, sonst Regeln) → ein Rückgängig-Schritt
- Nur noch dunkel: Hell-Modus gestrichen
- Neue UI-Richtung F · Phosphor (schwarz, Licht aus der Musik), vom Creative Director mit Auflagen zur Durchsicht freigegeben
- Spec: `docs/specs/v2.1-griff-und-licht.md`, Tests: `tests/v21.test.cjs`

## ✅ 2.2 – Phosphor
- Neuer Look „Phosphor“: Schwarz, Licht nur wo Musik klingt, Einstellungen als Linien, Weißglut statt Orange (ADR 004)
- Wellenform als Lichtstriche, Auswahl mit Schnittmarken, Stumm als Schraffur, Umgebungslicht hinter der ganzen Seite, still ist schwarz
- Auflagen des Creative Directors: Tippflächen ≥ 44 px, Schrift am Handy ≥ 11 px
- Spec: `docs/specs/v2.2-phosphor.md`

## ✅ 2.3 – Große Bibliothek
- 464 Sounds statt 62: 275 CC0-One-Shots aus der VCSL (Drums, Percussion, Einzeltöne; `src/catalog-vcsl.js`, `tools/vcsl-import.py`) und 125 erzeugte Loops in zwölf Genres (`src/loops-more.js`)
- Sounds auf Abruf: alle Einträge sofort im Regal, geladen bzw. erzeugt erst beim Anhören oder Einsetzen (`library.ensure`), Start schneller
- Regal: große Kategorien in Loops / One-Shots / Percussion geteilt, Suche nach Tags
- Tonart wählbar, Stopp als Pause, Griff an der Abspielmarke, Licht- und Transparenz-Feinschliff
- Tests: `tests/v22.test.cjs` (Pakete), `tests/more-loops.test.cjs` (alle erzeugten Loops)

## ✅ 2.4 – Echte Instrumente, Regal-Feinschliff
- Sampler (`src/sampler.js`): 13 VCSL-Instrumente (`src/instruments-vcsl.js`) und 6 aus Regal-Einzeltönen (`src/instruments-shelf.js`: Folkharfe, Klavier, Marimba, Xylofon, Glockenspiel, Mundharmonika) im Melodie-Editor
- Klang-Pakete: VCSL-Aufnahmen familienweise in `assets/packs/*.wav` (`tools/pack-assets.cjs`, `src/fetch-asset.js`) – passt ins Artifact-Limit
- Regal: Vorhören zeigt die Wellenform nur in der gewählten Zeile (leuchtet bis zur Stelle, die klingt); Längenfilter 1T / 2T / 4T / 8T+ / One-Shot
- Handy und Touch: großer Schubladengriff
- Tests: `tests/sampler.test.cjs`, `tests/regal.test.cjs`

## ✅ 2.5 – Tablet: Desktop-Ansicht mit Fingerbedienung
- Bedienung nach Eingabeart statt Breite (`(hover: none) and (pointer: coarse)`, `touch` in `place.js`, Gesten in `src/ui/touch.js`)
- Lang drücken: Clips auswählen (Auswählen-Modus, „Alle“), Rahmen aufziehen, Noten verschieben/verlängern, Spuren verschieben
- Tippflächen ab 44 px, Einsetzen erst beim Loslassen, Pinch-Zoom auch auf Clips, Lineal ohne Scrollen, schwebende Clip-Leiste
- Zweimal antippen setzt Drehregler und Schieberegler auf den Grundwert; Tipps und „? Gesten“ in Fingersprache
- Regal am Handy: Knopf „Filter“ neben der Suche; Lichtleiste als LED-Band
- Tests: `tests/tablet.test.cjs`, `tests/touch-targets.cjs`

## ✅ 2.6 – Tonart pro Takt
- Tonartwechsel ab einem Takt (`project.keyChanges`), z. B. ab Takt 5 Dm statt Am; Rückgängig, Projektdatei, alte Projekte laden weiter
- Tonale Loops und Melodien klingen in jedem Takt in der dort gültigen Tonart, auch mitten im Sample (umgestimmte Fassung, Schnittkante überblendet); Drums und Fremd-Samples bleiben; Realtime, Live-Änderung und Export gleich
- Tonart-Zeile unter dem Lineal: Takt antippen → Tonart oder „Wie davor“; Wunsch-Agent versteht „ab Takt 9 in D-Moll“
- Spec: `docs/specs/v2.6-tonart-pro-takt.md`, Tests: `tests/key-bars.test.cjs`

## ✅ 2.7 – Zoom-Leisten und Spurhöhe
- Vertikaler Zoom: Spurhöhe stufenlos ×0,4 bis ×3 (`ui.trackZoom`), Clips, Wellenformen, Spurköpfe, Gruppenköpfe, Drop-Vorschau, Rahmen und Licht passen sich an; bei kleiner Höhe wird der Spurkopf einzeilig, ganz klein nur Farbpunkt und Name
- Eigene Rollbalken (`src/ui/zoombars.js`): unten Zeit, rechts Spuren, Daumen = sichtbarer Ausschnitt; Klick in die Bahn springt; Greifer an beiden Enden zoomen (Zeit = `pxPerBeat`, senkrecht = Spurhöhe), die Gegenkante bleibt stehen; native Balken ausgeblendet
- Bedienung: Alt+Mausrad = Spurhöhe, Strg+Mausrad = Zeit, Knöpfe „Spuren höher/niedriger“, Tastatur am Daumen (Pfeile, +/−); Zwei Finger senkrecht = Spurhöhe, waagrecht = Zeit
- Tablet: Greifer fingergroß (44 px); Handy: nur schmaler senkrechter Streifen, Zoomen mit zwei Fingern
- Zoom-Stufe pro Gerät im Browser gemerkt (`loopwerk.zoom`), nicht im Undo-Verlauf
- Tests: `tests/zoom-bars.test.cjs`

## ✅ 2.8 – Gitarren, Fades, Gleiten, Feinschliff
- E-Gitarren: eigene Gitarren-Simulation (`src/dsp/guitar.js`: Saite, Amp, Box, Effekte), 26 Loops + 9 One-Shots (`src/loops-guitar.js`), Presets „E-Gitarre clean/verzerrt“, echte Gitarren von Karoryfer (CC0, `src/catalog-guitar.js`)
- Clip-Fades mit Bézier-Kurve (`fadeInCurve`/`fadeOutCurve`, Griff mitten auf der Linie, Inspektor „Kurve“); Melodien mit Gleiten (Aus/Kurz/Lang)
- Sound-Tempo im Inspektor; Clip-Editor und Beat-/Melodie-Editor spielen im Loop, klingender Schritt leuchtet; Tonhöhe/Autotune sofort hören
- Lücken geschlossen: Clip-Leiste am Tablet über der Zoom-Leiste, Gruppenköpfe wachsen mit, Sound-Tempo am Handy (Pegel), Tonartwechsel im Inspektor, Gleiten am Handy als Knopf (`tests/luecken.test.cjs`)
- Handy ohne „Mehr“ (Variante B): Aufnahme und Wiederholen im Deck, Raster/Klick/Loop über den Spuren, Fach „Song“ (Name, Tempo, Tonart, Länge, Speichern, Exportieren) (`tests/handy-b.test.cjs`)
- Spuren leuchten beim Klingen; Weichzeichner für Schubladen, Menüs, Tipps; Kontrast-Test für alle Knöpfe (`tests/contrast.test.cjs`)

## ✅ 2.9 – Tonleiter-Sperre
- Schalter „Tonleiter“ im Melodie-Editor (Kopfzeile; am Handy im Streifen über der Piano-Roll, immer in Reichweite): neue Noten rasten auf Töne der Songtonart ein – Setzen, Verschieben, Ziehen in der Piano-Roll, Bildschirm-Klaviatur, Computertastatur, MIDI, Live-Einspielen, Einsingen, Weiterführen
- Tonleiter: natürliches Moll der Songtonart (Standard), „Dur“ (Paralleltonart, Grundton eine kleine Terz höher) oder Pentatonik; maßgeblich ist die Grundtonart des Songs, denn Melodien wandern bei Tonartwechseln als Ganzes mit (`src/scale.js`)
- Anzeige: Tonleiter-Zeilen hell, Fremdtöne schwarz, Grundton mit Weißglut-Streifen; Klaviertasten mit Fremdtönen gedämpft, Grundton markiert; vorhandene Fremdnoten bleiben, gestrichelt
- „Auf Tonleiter ziehen (n)“ rückt Fremdnoten auf den nächsten Ton, ein Rückgängig-Schritt; gespeichert am Pattern (`scaleLock`, `scaleKind`), alte Projekte laden mit „aus“, ändert den Klang nicht (kein Neu-Rendern)
- Tests: `tests/scale-lock.test.cjs`

## ✅ 2.10 – Mastering mit einem Klick, Effekt-Pad
- Mastering der Summe (`project.master.mastering = { on, style }`): Ausgewogen, Warm, Hell (−14 LUFS), Laut (−10 LUFS); EQ, Bus-Kompression, Breite nur in den Höhen, True-Peak-Limiter; Analyse für Export und Wiedergabe, A/B gleich laut (ADR 005)
- Ort: Inspektor „Song“ unter Master, Export-Fach (Haken „Mit Mastering“)
- Effekt-Pad (Filter, Echo, Stutter, Lo-Fi, Bandstopp, Halten) auf Summe oder Spur, nur live; Desktop: Reiter „FX-Pad“, Handy: Knopf im Mixer-Kopf
- Tests: `tests/master-fxpad.test.cjs`

## ✅ 2.11 – Song-Starter und Akkord-Streifen
- Song-Starter unter „Erstellen“ (am Handy im Fach „Song“): neun Genres, ein Antippen baut ein ganzes Lied – Tempo, Tonart, Intro → Strophe → Refrain → Break → Refrain → Outro, Spuren Drums bis FX mit Lautstärken, Riser/Crash an den Übergängen; Loops mit derselben Akkordfolge, sonst Begleit-Patterns; „Sicher?“ im Knopf statt Dialog, „Nochmal“ würfelt, ein Rückgängig-Schritt
- Akkord-Streifen unter der Tonart-Zeile: je Takt oder Halbtakt ein leitereigener Akkord (i, III, iv, v, V, VI, VII, ii°, Pause), beliebte Folgen „ab hier“; Begleit-Patterns (Fläche, Bass, Arp, Klavier, Gitarre) folgen live, offline gleich, Undo, Projektdatei; Loops behalten bewusst ihre eigene Folge
- Spec: `docs/specs/v2.9-song-starter-akkorde.md`, Tests: `tests/starter-chords.test.cjs`

## ✅ 2.12 – Automation (Scheibe 1: Spur-Lautstärke, Scheibe 2: Panorama und Stufe, Scheibe 3: Effekt-Kurven samt Verzerrer-Anteil (Scheibe 5 ging darin auf), Scheibe 4: Summe, Scheibe 6: Effekt-Pad aufnehmen)
- Lautstärke-Kurve je Spur, linear: Modell und Engine (`src/automation.js`, `tests/automation.test.cjs`), Kurven wandern mit Clips
- Kurvenzeile unter der Spur (`src/ui/auto-lane.js`): Spur-Menü „Kurve“ oder Taste A; Maus: Klick setzt, Ziehen verschiebt (Raster, Umschalt frei), Doppelklick/Entf löscht, Fähnchen mit Wert und Position; Finger: Antippen setzt, Punkt ziehen, Halten löscht, Wischen scrollt; geschlossen als dünne Linie über den Clips
- Vorlagen Einblenden/Ausblenden (1 · 2 · 4 · 8 Takte): Inspektor „Spur“, am Handy Spur-Menü → „Verlauf“; Tests: `tests/automation-ui.test.cjs`
- Scheibe 2: Panorama-Kurve (absolut, ein Besitzer je AudioParam: mit Kurve lässt `syncStrip` das Panorama aus; Kurve löschen gibt den Regler mit seinem Wert zurück, auch ohne `cancelAndHoldAtTime`), Stufe (Sprung in 1/128 Schlag); Parameter-Chip als Auswahl mit Leuchtpunkt, Mittellinie, Fähnchen „L 40 %“/„Mitte“; Mini-Leiste „Linear · Stufe · Löschen“ (Klick auf gewählten Punkt, Rechtsklick, Enter; Finger: Antippen); Panorama-Regler in Mixer und Inspektor folgen der Kurve, gedimmt mit Kurven-Zeichen, Klick öffnet die Zeile; Spur-Menü „…-Kurve löschen“ für den gewählten Parameter
- Scheibe 3: Effekt-Kurven Filter-Frequenz, Hall-, Echo- und Verzerrer-Anteil (Einheiten liefern `u.auto`, `updateFxParams` lässt automatisierte Parameter aus). Filter-Frequenz läuft immer über `detune` (40 Hz · 2^(Regler · 8,81)), Null-Test alter Projekte < −88 dB; Verzerrer-Anteil als ein gemeinsamer Parameter für trocken/nass (auch Amp). Neue Effektkette im Lauf plant die Kurven sofort nach; Effekt aus = Kurve wirkt nicht, gestrichelt. Erster Punkt und Vorlagen schalten den Effekt ein (Filter: Tiefpass). Vorlagen „Filter öffnen“ (0,25 → 1, 8 Takte) und „Filter schließen“ (Wert → 0,25) im Inspektor und im Spur-Menü; gesperrte Effekt-Regler in Inspektor und Mixer-Effektseite
- Scheibe 4: Summe – `masterStrip.auto` (Lautstärke-Anteil vom Master-Fader) und Kurven für die Master-Effekte (Filter-Frequenz, Hall-, Echo-, Verzerrer-Anteil; kein Panorama), vor Mastering und Limiter: Mastering-Analyse und Export rechnen die Kurve mit. Stillstand: Summe hält 4 s (Fahnen bleiben ausgeblendet) und geht dann auf 1, Vorhören/Pads/Pattern-Vorhören heben sie sofort. Summen-Zeile unter allen Spuren (Taste A ohne Spurauswahl, „Summe“ im Kopf), Vorlagen Einblenden · Ausblenden im Inspektor „Song“ unter Master und im Handy-Fach „Song“ (zwei Tipps); gesperrte Master-Effekt-Regler (Inspektor, Mixer); `clearSong` löscht die Summen-Kurven
- Scheibe 6: Effekt-Pad als Kurve aufnehmen – Schalter „● Kurve aufnehmen“ im Pad-Fach (Desktop und Handy). Während der Wiedergabe schreibt Filter → `filter.cutoff` (Tiefpass/Hochpass nach Seite bzw. Filter am Ziel; ausgeschalteter Filter wird offen und ohne Resonanz eingeschaltet), Echo → `echo.mix` (100 % gedrückt, ½ Schlag zurück; Notenwert/Rückkopplung beim Einschalten). Stutter, Lo-Fi, Bandstopp und Resonanz haben keine passende Kurve und wirken nur live (Einblender). Höchstens 1 Punkt je 1/16 Schlag, beim Loslassen Ramer-Douglas-Peucker (0,01), Überschreiben mit Haltepunkten davor/danach, über die Loop-Grenze weiter am Loop-Anfang. Übernahme erst beim Loslassen (kein Doppeln mit dem Pad), ein Rückgängig-Schritt, dann öffnet sich die Kurvenzeile. `src/fxpad-record.js`, `store.recordAutoLane`, Test `tests/fxpad-record.test.cjs`
- Spec: `docs/specs/v2.12-automation.md`

## ✅ Editor: MIDI, Akkorde, Quantisieren
- MIDI-Anschlag: Velocity 1–127 wird zum Anschlag (v/127)^0,8, mindestens 0,1 – bei Live-Aufnahme, Schritt-Eingabe und Vorhören (leiser Ton ist leiser, auch Lead und Pad, live wie beim Rendern); Maus, Klaviatur und Computertastatur nutzen den Anschlag-Pinsel (auch Live und Pad-Antippen)
- MIDI im Beat-Editor: Pads nach General-MIDI-Belegung (35/36 Kick, 37/38/40 Snare, 39 Clap, 42/44 Hi-Hat zu, 46 offen, 41/43/45 Tom tief, 47/48/50 Tom hoch, 49/51/52/55/57/59 Becken), Kanal egal, andere Noten werden ignoriert; bei Live-Aufnahme quantisiert mit Anschlag
- Akkord-Eingabe im Melodie-Editor: Feld „Akkord“ (Aus, Dur, Moll, Tonleiter, Power, Sept; Kopfzeile, am Handy unter „Mehr“) gilt für Klick/Antippen in der Piano-Roll, Klaviatur, Computertastatur, MIDI und Live; „Tonleiter“ = leitereigener Dreiklang der Songtonart; mit Tonleiter-Sperre rasten die Töne ein; Töne außerhalb C2–C6 entfallen; ein Akkord = ein Rückgängig-Schritt, einzelne Noten bleiben einzeln editierbar (`src/scale.js`)
- Quantisieren (Kopfzeile, am Handy unter „Mehr“): Noten (Start, Länge mindestens ein Raster) bzw. Beat-Schläge auf das Raster aus „Einrasten“, Einblender „n Noten gerückt“, ein Rückgängig-Schritt; Beat: Schläge auf ungeraden Sechzehnteln wandern zur nächsten Achtel, bei Kollision gewinnt der lautere
- Tests: `tests/editor-midi.test.cjs` (MIDI-Attrappe über `page.addInitScript`, `openApp({ init })`)

## Korrekturen nach 2.11
- Handy: Loop-Bereich lässt sich auf der Taktleiste ziehen (vorher hat der Browser die Geste als Scrollen abgebrochen); Taktleiste fingerhoch, Einblender beim Einschalten des Loops
- Fach „Song“ am Handy: Mastering dazu, Song-Starter als wischbare Reihe, damit alles ohne Scrollen passt
- Piano-Roll: ein schneller Klick setzt die Note zuverlässig (vorher ging sie verloren, solange der Klang lud)
- Schubladen schieben die Ansicht: beim Öffnen und Ziehen rücken die Spuren Bild für Bild mit nach oben (Mitte des sichtbaren Inhalts bleibt in der Mitte des freien Bereichs, eine ausgewählte Spur bleibt ganz sichtbar), beim Schließen zurück (`tests/sheet-follow.test.cjs`)
- Clip-Editor: Name direkt im Kopf ändern; Anhören, Rückgängig, Abbrechen als Icons (nur „Übernehmen“ ausgeschrieben); Wellenform bleibt oben stehen, Werkzeuge scrollen darunter; Autotune, Roboter und „Als Loop“ als Schalter
- Gitarren-Verzerrer: „Verzerrer“ auf der Spur hat jetzt Amp Crunch, Amp Lead, Amp Metal (Vorstufe mit Mittenanhebung, Röhrenstufen, Klangregelung, 4×12-Box; live und Export gleich); Melodie-Editor: E-Gitarre Crunch, Metal, Fuzz (`tests/amp-drive.test.cjs`)
- iOS-Safari: Stummschalter schaltet die Musik nicht mehr ab (`audioSession` „playback“), Audio läuft nach Anruf/Sperrbildschirm beim nächsten Tippen weiter, kein Zoom beim Antippen von Feldern, Wellenform-Canvas am Touchgerät sparsamer (iOS-Canvas-Speicher), kein Popup bei langem Drücken in Deck und Leiste
- Swing (Aus, Leicht, Mittel, Triole, Stark) und Anschlag (Laut, Mittel, Leise) im Beat- und Melodie-Editor: Swing verschiebt Offbeat-Sechzehntel beim Rendern; Anschlag ist ein Pinsel – neue Schritte/Noten bekommen ihn, Antippen mit anderem Anschlag ändert, mit gleichem löscht; leise Schritte leuchten schwächer (`tests/swing-vel.test.cjs`)
- Robustheit eigener Sounds: beim Start nur Name und Länge (aus dem WAV-Kopf), dekodiert wird beim ersten Gebrauch; Clips mit vom Browser gelöschtem Sound bleiben als „Sound fehlt“ erhalten (Hinweis, Projektdatei holt den Klang zurück); dauerhafter Speicher wird beim ersten eigenen Sound erbeten; eigene Sounds im Projekt werden direkt nach dem Start bereitgestellt (`tests/robust.test.cjs`)

## ✅ Geschwindigkeit eines Clips (statt „Laufzeit“)
- Regler 50–200 % in 5-%-Schritten (Doppelklick/Doppeltipp = 100 %, Pfeiltasten), Schnellwahl ½× · 1× · 2×, Schalter „wie Tonband“: aus = gleiche Tonhöhe (WSOLA im Worker), an = Tonhöhe ändert sich mit (playbackRate in `startVoice`, live und Export gleich, sofort ohne Rechnen). Clip-Länge passt sich an, ein Rückgängig-Schritt je Ziehvorgang
- Modell: Geschwindigkeit = 1 / `clip.stretch` (alte Projekte unverändert), neues Feld `clip.varispeed`; Länge rastet auf 1/64 Schlag ein, wenn sie fast trifft (48 Schläge bei 150 % = genau 32). Sounds, die der Tonart folgen (tonale Patterns, Loops mit Tonart), laufen nie wie Tonband – sonst wären sie verstimmt. Erzeugte Loops und Patterns werden bei gleicher Tonhöhe im passenden Tempo neu gerendert statt gedehnt (verlustfrei, Anschläge bleiben knackig, ADR 001); WSOLA nur für Aufnahmen und Fremd-Samples. Dehn-Aufträge: der jüngste gebrauchte zuerst, alte Fassungen fallen weg
- Inspektor (`.insp-clip-speed`) und Handy-Clip-Leiste („Pegel“) über `src/ui/clip-speed.js`; Test `tests/clip-speed.test.cjs`
- Etikett am Clip zeigt die Geschwindigkeit („130 %“, wie Tonband „130 % · Band“)

## ✅ UI-Paket und Raumlicht als Shader
- Stumm: Clip-Farbe kommt nach dem Wiederanschalten zurück; Inspektor mit getrennten Abschnitten „Clip“ und „Spur“; Ansicht folgt der Marke nicht mehr, sobald man sie beim Spielen selbst bewegt („Marke folgen“ holt sie zurück, nächster Start folgt wieder); Pfeil im Spurkopf öffnet die Kurven (wie A, auch per Touch); Editor ohne Reiter (`tests/ui-paket.test.cjs`)
- Raumlicht nach Frequenz (Bass unten, Höhen oben), Säule an der Marke, Nachglühen, Vignette; gezeichnet als WebGL-2-Shader (`src/ui/room-shader.js`): Sternenstaub (Martins Wahl aus neun Entwürfen: Höhenlinien, Polarlicht, Kammlinien, LED-Raster, Plasma-Adern, Fasern, Sternenstaub, Kristall, Equalizer-Säulen): Lichtpunkte sammeln sich, wo Nebel und Licht sind, blenden weich ein und aus und funkeln mit der Musik; je Takt nur eine leise Welle. Seitenleisten mit Weichzeichner.
- Regal ohne Kategorie-Chips: nur „★ Favoriten“, Kategorien/Genres über die Akkordeons, die zu Beginn geschlossen sind (Zustand gilt für die Sitzung); Suchfeld und Längen-Filter passen wieder in die Leiste
- Harmonie: Tonart- und Akkordzeile über den Schalter „Harmonie“ in der Ecke „Takt“, zu Beginn zu, Leuchtpunkt bei verborgenen Wechseln
- Deck: einstellbare Felder (Tempo, Tonart) mit Rahmen, Tonart mit Pfeil; Takt/Schlag/Zeit reine Anzeige
- Song-Leiste in Blöcken nach dem Signalweg (Song · Master · Verlauf der Summe · Mastering) mit Abstand und Linie; Mastering als eigener Block: Überschrift links, Schalter rechts, darunter nur bei „an“ Messwert, Stil (2 × 2) und Vergleich „Aus · Vorher · Nachher“ (statt A/B-Knopf mit ×); im Handy-Fach „Song“ ebenso abgesetzt
- Tests: `openApp` startet wie früher (Drums offen, Harmonie sichtbar), `fresh: true` zeigt den echten Start; `reveal` klappt Regal-Gruppen auf; Zählbasis Krachwerk auf den neuen Startzustand
- Inspektor: Clip-Einstellungen ganz in der Clip-Farbe umrandet (Desktop und Handy-Clip-Leiste), Spur-Einstellungen neutral ohne Farbe – die Zuordnung ist auf einen Blick klar
- Raumlicht: Rand-Glühen (Martins Wahl aus einer dritten Runde mit acht ruhigeren Entwürfen: Rand-Glühen, Bühnenlicht, Farbfelder, Plakat, Bokeh, Lamellen, Horizont, Wasserlicht). Man soll ablesen können, was klingt, ohne dass es von den Clips ablenkt: die Mitte bleibt ruhig (umgekehrte Vignette), an der Unterkante das ganze Spektrum von links tief nach rechts hoch mit feinem LED-Streifen, links trägt der Bass, rechts die Höhen die Seite, oben ein Hauch. Jede Stelle in der Farbe der Spur, die dort klingt (Spektrum je Spur, `engine.trackBands`); wie weit das Licht hereinreicht, zeigt den Pegel; Anstieg gut 50 ms, Ausklang gut 0,8 s, Farben gleiten in gut 0,4 s. Die Spektrum-Wand (Punktraster) ist gemerkt: Commit 293fdc2

## ✅ Tonart-Erkennung
- Eigene Sounds (Import, Aufnahme, Tab-Aufnahme, Link-Import, bearbeitete Sounds) bekommen nach dem Anlegen im Rechen-Worker eine Tonart (`src/dsp/key.js`): Spektrum-Spitzen C2–H6, Obertöne tieferer Töne aussortiert, Stimmung geschätzt, nur gehaltene Töne zählen; Abgleich mit den Dur-/Moll-Profilen von Krumhansl/Kessler. Schlagzeug, Rauschen, Einzeltöne und Unsicheres ergeben keine Tonart. Ergebnis im Sound (IndexedDB, Projektdatei), ältere Sounds beim ersten Gebrauch
- Inspektor und Handy-Clip-Leiste: Zeile „Tonart · erkannt“ mit Auswahl (ändern, „keine“) und Schalter „Folgt Song“ (`src/ui/sound-key.js`, im Projekt `project.soundKeys`, Rückgängig). Folgende Sounds werden in die Song-Tonart umgestimmt (WSOLA + Umtasten, gleiche Länge, `pitchShift` in `src/dsp/stretch.js`), auch je Takt; Dur-Sounds über die parallele Moll-Tonart. Regal: Tonart im Hinweis wie bei Katalog-Sounds
- Test `tests/key-detect.test.cjs` (24/24 Kadenzen, A-Moll-Folge, C-Dur-Tonleiter, Schlagzeug/Rauschen/Einzelton = keine, Tonhöhe 440 → 523,25/587,33/329,63 Hz)

## 🧪 2.14 – Effekt-Reihenfolge und Send-Busse (Spec `docs/specs/v2.14-effekte-sends.md`, ADR 008)
- ✅ Scheibe 1 „Reihenfolge Ende zu Ende“: optionales `fxOrder` an Spur und Master (`fxOrderOf`, Grundreihenfolge speichert kein Feld), Store `moveFx`/`resetFxOrder`; `buildFxChain`/`fxKey` nach Reihenfolge (Grundreihenfolge bitgleich wie vorher); nur Reihenfolge geändert → `keepTail` (Eingänge 30 ms überblendet, alte Kette klingt aus, Hall-Fahne reißt nicht ab). Inspektor: am Namen ziehen (ab 4 px, Linie, die anderen rücken weg, ein Rückgängig-Schritt), Klick schaltet weiter, Alt+↑/↓ am Schalter, Einblender „Filter vor Verzerrer“, Link „Reihenfolge zurücksetzen“ nur bei Abweichung; Handy-Effekt-Seite: Kartenkopf 350 ms halten und ziehen, Antippen schaltet, Wischen scrollt, Rand scrollt mit; Mixer-Schalter folgen der Reihenfolge; Tipp „Von oben nach unten läuft der Ton“. Test `tests/fx-order.test.cjs` (Null-Test gegen `tests/fixtures/fx-legacy.f32` < −90 dB, Filter→Verzerrer +32 dB über 2 kHz, lineare Effekte vertauscht −100 dB, Live ohne Knackser, Automation bleibt auf der Kurve)
- ✅ Scheibe 2 „Busse: Engine, Modell, Inspektor“: `BUSES` (Hall-Bus: Lautstärke 0,8, Raumgröße 0,6; Echo-Bus: 0,8, 1/8 punktiert, Wiederholungen 0,4), Hall und Echo „nur nass“ (`dry: false`), `syncBuses` (Bus entsteht beim ersten Send, Send hinter Fader und Panorama am `strip.out`), `mix.buses`; Store `setSend`/`setBus`, Validierung, Stems-Spuren übernehmen Sends, `clearSong` lässt die Busse. Inspektor Spur: Block „Busse“ unter den Effekten (→ Hall-Bus, → Echo-Bus, „aus“, Doppelklick = aus); Inspektor Song: Block „Busse“ nach dem Master (erscheint je Bus, sobald eine Spur zu ihm sendet – der Start bleibt unverändert, Zählbasis exakt); Handy-Effekt-Seite: Karte „Busse“ nach dem Rack. Test `tests/sends.test.cjs` (nur nass bis 0,49 s bitgleich, Pegel −6,021 dB je Halbierung, stumm/Solo/Pan −∞ dB, Hall ∝ Send², Raumgröße 0,52 → 1,40 s, Echo bei 90 BPM auf der Probe, Stems −133 dB)
- Offen: Scheibe 3 (Rückkanäle im Mixer, →H/→E, Bus-Seite am Handy, `busPeak`), Scheibe 4 (Send-Kurven)

## ✅ Mehr FX-One-Shots
- 30 neue FX (`src/loops-fx.js`, eigene Klänge, CC0, Präfix `fxs-`): Riser (Rausch kurz, Gate 4 Takte, Ton, Filter, Endlos/Shepard, Snare-Build), Downlifter kurz, Abwärts-Gleiter, Bass-Einschlag, Donnerschlag, Rückwärts-Crash, Rückwärts-Hall, Vorbeiflug, Jet-Sweep, Zap-Salve, Power-Up, Glitch-Stotterer, Dub-Sirene, Tape-Stopp, Tape-Anlauf, Rückspulen, Scratch, Rausch-Stoß, Funkeln, Wassertropfen, Glas-Ping, Flächen-Anschwellen, Radio-Rauschen, Herzschlag, Gong. Meist sampleweise gerechnet (`kit.pcm`): Zeiten in Schlägen, Ausklänge passen sich der Länge an, Ende ausgeblendet; Suchwörter (`tags`) für das Regal
- Test `tests/fx-shots.test.cjs`: Länge bei 93/120/150 BPM, kein NaN/Clipping/Gleichanteil, leises Ende, Lautheit (RMS, 400-ms-Fenster, LUFS) wie die vorhandenen FX, Riser steigen und werden heller, Downlifter fallen, Regal-Suche und Export-Weg
- Weitere CC0-Kandidaten aus Sonic Pi (noch nicht übernommen): `vinyl_backspin`, `vinyl_rewind`, `vinyl_scratch`, `ambi_dark_woosh`, `ambi_lunar_land`, `perc_impact_1/2`, `perc_swoosh`, `perc_swash`, `glitch_robot_1/2`

## 🧪 Krachwerk – Loopwerk zum Selbermachen (Branch `werkstatt`)
- Brainstorm mit ux-designer, ui-designer, architekt, creative-director: `docs/ux/krachwerk-brainstorm/` (Zielbild: Song · Werkbank · Kiste, ruhiger bei gleichem Funktionsumfang). Der erste Prototyp (Pad-Wand ohne Arranger) ist zurückgebaut.
- ✅ Scheibe 1a „Gerüst und erster Laut“ (`docs/specs/krachwerk-1-geruest.md`, ADR 007): volle App unter `/werkstatt/` ohne mitgelieferte Sounds, leerer Song (2 Spuren, 90 BPM), eigener Speicher inkl. der Pad-Wand-Klänge, ● nimmt ohne Vorzähler auf, säubert und legt den Klang als Clip in den Loop; PWA, eigenes Icon; Zählung Desktop „Clip gewählt“ 55 statt 114 Bedienelemente
- ✅ Scheibe 1b „Flächen und Ruhe“: Dichte `calm` (Schriftskala, Stufen mit Zwillingen), Werkbank rechts (⤢ 60 %) bzw. als Schublade am Handy, Daumenleiste Kiste · ▶ · ● · Werkbank, Werkzeug am Clip (`src/ui/clip-float.js`), Kiste nach Herkunft; Zählung „Clip gewählt“ Desktop 54 Bedienelemente / 30 Rahmen / 4 Schriftgrößen (Loopwerk 114 / 71 / 12), Handy 18 / 8 / 4 (Loopwerk 43 / 27 / 7)
- ✅ Scheibe 2a „Sound-Werkbank“ (`docs/specs/krachwerk-2-werkbank.md`, ADR 010): Klang-Rezept am Sound (nicht-destruktiv, gebacken, eine Signalkette; Varianten), Werkbank mit Welle (Anfang/Ende/Anschlag/Ausklang) und Reitern Form · Ton · Farbe · Zeit · Clip, Herkunft (Material Körper/Dinge/Stimme/Strom/Schleife) mit gleicher Farbe in Kiste und Song, Stammbaum-Zeile; Zählung Desktop „Clip gewählt“ 45 / 11 / 4
- ✅ Scheibe 2b „Zerlegen“ (`docs/specs/krachwerk-2b-zerlegen.md`): Reiter Zerlegen (An Anschlägen | In N gleiche, Empfindlichkeit, In die Kiste, Auf die Spur), verschiebbare Marken auf der Welle, Schnitte als Varianten (ein Undo), Autotune als Rezeptschritt, Trennen in der Werkbank, Werkbank direkt aus der Kiste, 56-px-Kopfzeile der Handy-Schublade, Sample-Editor in Krachwerk ersetzt (Zwillinge), eigenes Zeichen im Deck
- Als Nächstes Scheibe 3: Takes (Aufnahme im Loop über den laufenden Song), Festhalten (Resampling), Speicher v2 und ZIP-Sicherung
- ✅ Regal „Eine Zeile“ (Entwurf `docs/ux/filter-layouts/`, Variante 1 mit Anleihen aus 3): Suche, Regler-Knopf (Fach mit Länge und Ordnen, schließt nach der Wahl) und Favoriten-Stern in einer 44-px-Zeile für Handy und Desktop; gewählter Wert im Knopf, × setzt alles zurück, Anzahl und Pegel auf den Längen, Trefferzahl im Suchfeld, „Alle“ entfällt; Test `tests/filter-zeile.test.cjs`, Zählbasis Desktop-Start 92 → 85

## Entfernt
- Wunsch-Agent („Wünschen“) – auf Wunsch von Martin gestrichen

## Als Nächstes
- Aus dem Markt-Scout erledigt: Tonleiter-Sperre, Akkord-Streifen, Song-Starter, Effekt-Pad, Ein-Klick-Mastering

## Look
- Seit 2.2 „Phosphor“ (ADR 004), nur dunkel. Farben, Schriften und Bausteine nur über die Tokens in `:root`.

## Später
- ~~Tonart-Erkennung~~, Desktop-App (Tauri), Plugins
