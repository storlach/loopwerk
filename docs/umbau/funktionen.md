# Funktionsliste der Oberfläche

Erzeugt von `tools/funktionen.cjs` (Stand 5b9b359). Nicht von Hand ändern, sondern neu erzeugen.

Eine Zeile ist eine Bedienfunktion. Die Spalten je Gerät nennen den Ort, an dem sie zu sehen ist. „(versteckt: …)“ heißt: Das Element steht dort im Aufbau der Seite, war aber in keinem geprüften Zustand zu sehen. „–“ heißt: gibt es dort nicht. „×n“ heißt: wiederholt sich (je Spur, je Sound, je Schritt).

## Überblick

| | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---:|---:|---:|---:|
| erreichbare Funktionen | 280 | 186 | 250 | 168 |
| versteckt (nur im Aufbau der Seite) | 89 | 158 | 120 | 177 |

Funktionen insgesamt: 477.

## Funktionen nach heutigem Ort

### Arranger (7)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| + Spur<br><small>Neue Spur hinzufügen</small> | `#add-track` | button | Arranger | Arranger | Arranger | Arranger |
| Lautstärke<br><small>Parameter der Kurve wählen</small> | `#arr-scroll button.auto-chip` | button | Arranger | Arranger | Arranger | Arranger |
| Kurve schließen | `#arr-scroll button.auto-close` | button | Arranger | Arranger | Arranger | Arranger |
| Am<br><small>Akkord-Streifen: Takt wählen, um den Akkord festzulegen</small> | `#arr-scroll div.chord-strip „Akkord-Streifen: Takt wählen, um den Akkord festzulegen“` | button | Arranger | Arranger | (versteckt: Arranger) | (versteckt: Arranger) |
| Am<br><small>Tonart je Takt: Takt wählen, um die Tonart ab dort zu ändern</small> | `#arr-scroll div.key-strip „Tonart je Takt: Takt wählen, um die Tonart ab dort zu ändern“` | button | Arranger | Arranger | (versteckt: Arranger) | (versteckt: Arranger) |
| Harmonie<br><small>Tonart- und Akkordzeile zeigen</small> | `#harm-toggle` | button | Arranger | Arranger | – | – |
| Summe<br><small>Summen-Kurve zeigen (Taste A ohne Auswahl)</small> | `#sum-toggle` | button | Arranger | Arranger | Arranger | Arranger |

### Arranger-Leiste (5)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Raster (beim Ziehen Umschalt halten: frei) | `#snap-sel` | select | Arranger-Leiste | Pillen über den Spuren | Arranger-Leiste | Pillen über den Spuren |
| +<br><small>Vergrößern (Strg+Mausrad)</small> | `#zoom-in` | button | Arranger-Leiste | (versteckt: Deck) | (versteckt: Arranger-Leiste) | (versteckt: Deck) |
| −<br><small>Verkleinern (Strg+Mausrad)</small> | `#zoom-out` | button | Arranger-Leiste | (versteckt: Deck) | (versteckt: Arranger-Leiste) | (versteckt: Deck) |
| Spuren höher<br><small>Spuren höher (Alt+Mausrad)</small> | `#zoomy-in` | button | Arranger-Leiste | (versteckt: Deck) | (versteckt: Arranger-Leiste) | (versteckt: Deck) |
| Spuren niedriger<br><small>Spuren niedriger (Alt+Mausrad)</small> | `#zoomy-out` | button | Arranger-Leiste | (versteckt: Deck) | (versteckt: Arranger-Leiste) | (versteckt: Deck) |

### Aufnahme-Feld am ● (4)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Einmessen<br><small>Spielt 6 Klicks aus dem Lautsprecher und misst, wann das Mikrofon sie </small> | `#rs-cal` | button | Aufnahme-Feld am ● | (versteckt: Fach Song) | Inspektor Song (Werkzeuge) | Fach Song |
| Eingangsgerät<br><small>Standard-Mikrofon</small> | `#rs-device` | select | Aufnahme-Feld am ● | Fach Song | Inspektor Song (Werkzeuge) | Fach Song |
| −<br><small>Aufnahme liegt zu früh: weniger Ausgleich (Umschalt: 10 ms)</small> | `#rs-minus` | button | Aufnahme-Feld am ● | (versteckt: Fach Song) | Inspektor Song (Werkzeuge) | Fach Song |
| +<br><small>Aufnahme liegt zu spät: mehr Ausgleich (Umschalt: 10 ms)</small> | `#rs-plus` | button | Aufnahme-Feld am ● | (versteckt: Fach Song) | Inspektor Song (Werkzeuge) | Fach Song |

### Clipleiste (10)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Löschen<br><small>Clip löschen (Rückgängig holt ihn zurück)</small> | `#cb-del` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Duplizieren Kopie<br><small>Kopie direkt dahinter legen</small> | `#cb-dup` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Bearbeiten Editor<br><small>Clip im Editor öffnen</small> | `#cb-edit` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Pegel<br><small>Lautstärke und Ein-/Ausblenden einstellen</small> | `#cb-levels` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Teilen<br><small>An der Abspielmarke teilen</small> | `#cb-split` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Clip-Lautstärke | `#lvl-gain` | input:range | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Einblenden | `#lvl-in` | input:range | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Ausblenden | `#lvl-out` | input:range | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Geschwindigkeit<br><small>Doppelklick: 100 %</small> | `#lvl-speed` | input:range | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| wie Tonband<br><small>An: Tonhöhe ändert sich mit (wie ein Tonband). Aus: gleiche Tonhöhe</small> | `#lvl-speed-tape` | button | (versteckt: Clipleiste) | Clipleiste | (versteckt: Clipleiste) | (versteckt: Clipleiste) |

### Deck (12)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Tempo in BPM (60–200): tippen oder mit den Pfeiltasten ändern | `#bpm-input` | input:number | Deck | Deck | Deck | Deck |
| Exportieren<br><small>Song als WAV oder MP3 exportieren</small> | `#export-btn` | button | Deck | Fach Song | Deck | Fach Song |
| Zum Anfang<br><small>Zum Anfang (Pos1)</small> | `#home-btn` | button | Deck | Deck | (versteckt: Deck) | (versteckt: Deck) |
| Tonart des Songs | `#key-sel` | select | Deck | (versteckt: Deck) | (versteckt: Deck) | (versteckt: Deck) |
| Loop<br><small>Loop-Bereich wiederholen</small> | `#loop-btn` | button | Deck | Pillen über den Spuren | Deck | Pillen über den Spuren |
| Klick<br><small>Metronom</small> | `#metro-btn` | button | Deck | Pillen über den Spuren | Inspektor Song (Werkzeuge) | (versteckt: Fach Song) |
| Abspielen<br><small>Abspielen/Pause (Leertaste)</small> | `#play-btn` | button | Deck | Deck | Deck | Fachleiste |
| Beispiel-Arrangement<br><small>Projekt: Name, Öffnen, Speichern, Beispiel, Leeren</small> | `#project-menu-btn` | button | Deck | (versteckt: Deck) | Deck | (versteckt: Deck) |
| Aufnahme<br><small>Mit dem Mikrofon aufnehmen (ein Takt Vorzähler)</small> | `#rec-btn` | button | Deck | Deck | Deck | Fachleiste |
| Aufnahme einstellen<br><small>Aufnahme: Latenz einmessen</small> | `#rec-more` | button | Deck | (versteckt: Deck) | (versteckt: Deck) | (versteckt: Deck) |
| Wiederholen<br><small>Wiederholen (Strg+Umschalt+Z)</small> | `#redo-btn` | button | Deck | Deck | Deck | Deck |
| Rückgängig<br><small>Rückgängig (Strg+Z)</small> | `#undo-btn` | button | Deck | Deck | Deck | Deck |

### Erstellen (8)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Begleitung Fläche, Bass und Arp folgen dem Akkord-Streifen | `#create-panel button.ccard[data-create=accomp]` | button | Erstellen | (versteckt: Erstellen) | – | – |
| Beat bauen Schlagzeug in Schritten oder auf Pads | `#create-panel button.ccard[data-create=beat]` | button | Erstellen | (versteckt: Erstellen) | Erstellen | (versteckt: Erstellen) |
| Loop festhalten Was im Loop klingt, als neuer Sound in die Kiste | `#create-panel button.ccard[data-create=bounce]` | button | – | – | Erstellen | (versteckt: Erstellen) |
| Datei importieren WAV, MP3, OGG … – oder direkt auf eine Spur ziehen | `#create-panel button.ccard[data-create=import]` | button | Erstellen | (versteckt: Erstellen) | Erstellen | (versteckt: Erstellen) |
| Aus dem Netz holen Link zu einer Audiodatei – oder Ton aus einem ander | `#create-panel button.ccard[data-create=link]` | button | Erstellen | (versteckt: Erstellen) | – | – |
| Melodie schreiben Noten setzen oder auf der Klaviatur spielen | `#create-panel button.ccard[data-create=melody]` | button | Erstellen | (versteckt: Erstellen) | Erstellen | (versteckt: Erstellen) |
| Audio aufnehmen Stimme oder Instrument als Sound auf eine Spur | `#create-panel button.ccard[data-create=record]` | button | Erstellen | (versteckt: Erstellen) | Erstellen | (versteckt: Erstellen) |
| Melodie einsingen Summen, singen, pfeifen – wird zu Noten | `#create-panel button.ccard[data-create=sing]` | button | Erstellen | (versteckt: Erstellen) | Erstellen | (versteckt: Erstellen) |

### Fach Editor (Beat/Melodie) (56)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Takte 124816 | `#pat-bars` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Bass: Offbeat<br><small>Bass-Muster: Grundton auf jedem Offbeat, die Viertel bleiben für die K</small> | `#pat-bass-offbeat` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Bass: Sechzehntel (rollend)<br><small>Bass-Muster: drei Sechzehntel je Schlag im Grundton, die Viertel bleib</small> | `#pat-bass-roll` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Akkord AusDurMollTonleiterPowerSept | `#pat-chord` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Leeren | `#pat-clear` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| ✨ Weiterführen<br><small>Die Melodie wird um dieselbe Länge weitergeführt (im Artifact von Clau</small> | `#pat-continue` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | – | – |
| Kick, Schritt 5 ×64 | `#pat-drums button.alt.pat-cell` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Kick, Schritt 1 ×8 | `#pat-drums button.bar.pat-cell` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Kick, Schritt 2 ×56 | `#pat-drums button.pat-cell` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Kick ×8<br><small>Anhören</small> | `#pat-drums button.pat-row-label „Anhören“` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Gleiten AusKurzLang | `#pat-glide` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| ∿ Aus<br><small>Gleiten zwischen Tönen: antippen wechselt Aus, Kurz, Lang</small> | `#pat-glide-btn` | button | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) |
| U ×2<br><small>A♯4</small> | `#pat-keybed button.black.pat-key „A♯#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| W ×2<br><small>C♯4</small> | `#pat-keybed button.black.pat-key „C♯#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| E ×2<br><small>D♯4</small> | `#pat-keybed button.black.pat-key „D♯#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| T ×2<br><small>F♯4</small> | `#pat-keybed button.black.pat-key „F♯#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| Z ×2<br><small>G♯4</small> | `#pat-keybed button.black.pat-key „G♯#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| A C4 ×3<br><small>C4</small> | `#pat-keybed button.c.pat-key „C#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| H ×2<br><small>A4</small> | `#pat-keybed button.pat-key „A#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| S ×2<br><small>D4</small> | `#pat-keybed button.pat-key „D#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| D ×2<br><small>E4</small> | `#pat-keybed button.pat-key „E#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| F ×2<br><small>F4</small> | `#pat-keybed button.pat-key „F#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| G ×2<br><small>G4</small> | `#pat-keybed button.pat-key „G#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| J ×2<br><small>H4</small> | `#pat-keybed button.pat-key „H#“` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| Biss der Kick | `#pat-kick-bite` | input:range | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Kick<br><small>Tonhöhe, Länge, Klick und Biss der Kick</small> | `#pat-kick-btn` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Klick der Kick | `#pat-kick-click` | input:range | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Länge der Kick | `#pat-kick-length` | input:range | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Tonhöhe der Kick | `#pat-kick-pitch` | input:range | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Wie das Kit<br><small>Kick wieder wie das Kit</small> | `#pat-kick-reset` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Kit Elektro (synthetisch)Techno (909-artig)Techno (Druck)Akustik (Soni | `#pat-kit` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Notenlänge 1/161/81/41/21/1 | `#pat-len` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Live<br><small>Pattern läuft im Loop, was du spielst, wird im Raster festgehalten</small> | `#pat-live` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Mehr ▾ | `#pat-more-btn` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Name des Patterns<br><small>Name ändern: Enter speichert, Esc verwirft</small> | `#pat-name` | input:text | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| ◀<br><small>Oktave tiefer</small> | `#pat-oct-down` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| ▶<br><small>Oktave höher</small> | `#pat-oct-up` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| Schlag 1–2 ×2<br><small>Schlag 1–2, mit Schlägen</small> | `#pat-pages button.pat-page „Schlag #–#, mit Schlägen“` | button | – | Fach Editor (Beat/Melodie) | – | Fach Editor (Beat/Melodie) |
| Anhören<br><small>Pattern im Loop anhören</small> | `#pat-play` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Klang PluckLeadE-PianoOrgelFlöteGlockeStreicherBlechBassAcid-BassRollb | `#pat-preset` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Einrasten 1/161/8 | `#pat-quant` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Quantisieren<br><small>Rückt Noten bzw. Schläge auf das Raster aus „Einrasten“. Rückgängig ma</small> | `#pat-quantize` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| ● Schritt-Eingabe<br><small>Mit der Tastatur (A–K) oder einem MIDI-Keyboard Noten Schritt für Schr</small> | `#pat-rec` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Tonleiter<br><small>Tonleiter einschalten: neue Noten rasten auf die Töne der Songtonart e</small> | `#pat-scale` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| 🎤 Einsingen<br><small>Melodie vorsingen oder aus einer Datei heraushören</small> | `#pat-sing-btn` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Swing AusLeichtMittelTrioleStark | `#pat-swing` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Anschlag LautMittelLeise | `#pat-vel` | select | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Schritte | `#pat-view button.seg[data-view=grid]` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Pads | `#pat-view button.seg[data-view=pads]` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| ▲<br><small>Oktave höher</small> | `#pat-vkeys button.vkey-oct „Oktave höher“` | button | – | Fach Editor (Beat/Melodie) | – | Fach Editor (Beat/Melodie) |
| ▼<br><small>Oktave tiefer</small> | `#pat-vkeys button.vkey-oct „Oktave tiefer“` | button | – | Fach Editor (Beat/Melodie) | – | Fach Editor (Beat/Melodie) |
| Datei wählen … | `#sing-file` | button | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| Töne genau wie gesungenC-MollC♯-MollD-MollD♯-MollE-MollF-MollF♯-MollG- | `#sing-key` | select | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) | Fach Editor (Beat/Melodie) | (versteckt: Fach Editor (Beat/Melodie)) |
| Song mit Begleitung: Lead-Melodie heraushören | `#sing-lead` | input:checkbox | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| ● Aufnehmen | `#sing-rec` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) |
| Klang bauen<br><small>Klang und Effekte nach deiner Beschreibung einstellen</small> | `#sing-sound` | button | Fach Editor (Beat/Melodie) | Fach Editor (Beat/Melodie) | – | – |

### Fach Editor (Sample-Editor) (29)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Mehr: Tonhöhe, Autotune, Rauschen, Trennen, Loop ▾ | `#clip-more` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Übernehmen | `#ed-apply` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| (ohne Beschriftung) | `#ed-at-robot` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Grundton | `#ed-at-root` | select | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Tonleiter | `#ed-at-scale` | select | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Stärke | `#ed-at-strength` | input:range | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Gesang auf die Töne der Tonleiter ziehen – sofort zu hören | `#ed-autotune` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Schläge | `#ed-beats` | input:number | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Abbrechen<br><small>Abbrechen – nichts ändern</small> | `#ed-cancel` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Zuschneiden<br><small>Nur die Auswahl behalten</small> | `#ed-crop` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Entfernen<br><small>Auswahl entfernen</small> | `#ed-cut` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Entrauschen<br><small>Rauschen entfernen – Stärke unter „Mehr“</small> | `#ed-denoise` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Stärke | `#ed-dn-strength` | input:range | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Einblenden | `#ed-fadein` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Ausblenden | `#ed-fadeout` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| (ohne Beschriftung) | `#ed-loop` | button | (versteckt: Fach Editor (Sample-Editor)) | Fach Editor (Sample-Editor) | – | – |
| +3 dB<br><small>Lauter um 3 dB</small> | `#ed-louder` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Name des Sounds<br><small>Name ändern</small> | `#ed-name` | input:text | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Normalisieren<br><small>Auf −1 dB anheben</small> | `#ed-normalize` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Stimme entfernen<br><small>Gesang aus einem Song entfernen (Karaoke)</small> | `#ed-novocal` | button | Fach Editor (Sample-Editor) | (versteckt: Fach Editor (Sample-Editor)) | – | – |
| −<br><small>Einen Halbton tiefer</small> | `#ed-pitch-down` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| +<br><small>Einen Halbton höher</small> | `#ed-pitch-up` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Anhören<br><small>Anhören (im Loop)</small> | `#ed-play` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| −3 dB<br><small>Leiser um 3 dB</small> | `#ed-quieter` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Rückwärts | `#ed-reverse` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Stille<br><small>Auswahl stumm schalten</small> | `#ed-silence` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| In Ebenen zerlegen<br><small>Gesang, Drums, Bass und Instrumente als eigene Spuren</small> | `#ed-stems` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Rückgängig | `#ed-undo` | button | Fach Editor (Sample-Editor) | Fach Editor (Sample-Editor) | – | – |
| Stimme isolieren<br><small>Nur den Gesang behalten</small> | `#ed-vocal` | button | Fach Editor (Sample-Editor) | (versteckt: Fach Editor (Sample-Editor)) | – | – |

### Fach Export (18)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| MP3 – 192 kBit/s, etwa ein Siebtel so groß | `#ex-format-mp3` | input:radio | Fach Export | Fach Export | Fach Export | Fach Export |
| WAV – verlustfrei, 16 Bit, 44,1 kHz | `#ex-format-wav` | input:radio | Fach Export | Fach Export | Fach Export | Fach Export |
| WAV – 24 Bit, für die Weiterarbeit | `#ex-format-wav24` | input:radio | Fach Export | Fach Export | Fach Export | Fach Export |
| WAV – 32 Bit Gleitkomma, übersteuert nicht | `#ex-format-wav32` | input:radio | Fach Export | Fach Export | Fach Export | Fach Export |
| Exportieren | `#ex-go` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Mit Mastering | `#ex-mastering` | input:checkbox | Fach Export | Fach Export | Fach Export | Fach Export |
| Mastering ein/aus<br><small>Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in</small> | `#ex-mst-on` | switch | Fach Export | Fach Export | Fach Export | Fach Export |
| Ausgewogen<br><small>Ausgewogen · Ziel −14 LUFS</small> | `#ex-mst-style-balanced` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Hell<br><small>Hell · Ziel −14 LUFS</small> | `#ex-mst-style-bright` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Club<br><small>Club · Ziel −8 LUFS</small> | `#ex-mst-style-club` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Laut<br><small>Laut · Ziel −10 LUFS</small> | `#ex-mst-style-loud` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Warm<br><small>Warm · Ziel −14 LUFS</small> | `#ex-mst-style-warm` | button | Fach Export | Fach Export | Fach Export | Fach Export |
| Loop-Bereich | `#ex-range-loop` | input:radio | Fach Export | (versteckt: Fach Export) | Fach Export | (versteckt: Fach Export) |
| Ganzer Song | `#ex-range-song` | input:radio | Fach Export | Fach Export | Fach Export | (versteckt: Fach Export) |
| Einzelspuren (Stems) | `#ex-stems` | input:checkbox | Fach Export | Fach Export | Fach Export | Fach Export |
| Mit Summe (Master-Effekte, Mastering) | `#ex-stems-master` | input:checkbox | Fach Export | Fach Export | Fach Export | Fach Export |
| Hall und Echo ausklingen lassen (+2,5 s) | `#ex-tail` | input:checkbox | Fach Export | Fach Export | Fach Export | Fach Export |
| LAME | `#export a „LAME“` | link | Fach Export | Fach Export | Fach Export | Fach Export |

### Fach FX-Pad (8)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Halten<br><small>Effekt bleibt nach dem Loslassen an</small> | `#fxpad-lock` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |
| Lo-Fi | `#fxpad-mode-crush` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |
| Echo | `#fxpad-mode-echo` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |
| Filter | `#fxpad-mode-filter` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |
| Stutter | `#fxpad-mode-stutter` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |
| ● Kurve aufnehmen<br><small>Filter- und Echo-Bewegungen während der Wiedergabe als Kurve des Ziels</small> | `#fxpad-rec` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | (versteckt: Fach FX-Pad) |
| Bandstopp<br><small>Beim Loslassen bremst das Band bis zum Stillstand, dann geht es auf de</small> | `#fxpad-tape` | button | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | (versteckt: Fach FX-Pad) |
| Ziel des Effekts | `#fxpad-target` | select | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad | Fach FX-Pad |

### Fach Mixer (14)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Lautstärke Master | `#fader-__master` | input:range | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| Lautstärke Echo-Bus | `#fader-bus-echo` | input:range | Fach Mixer | (versteckt: Fach Mixer) | Fach Mixer | (versteckt: Fach Mixer) |
| Lautstärke Hall-Bus | `#fader-bus-hall` | input:range | Fach Mixer | (versteckt: Fach Mixer) | Fach Mixer | (versteckt: Fach Mixer) |
| Lautstärke Drums ×6 | `#fader-t#` | input:range | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| FX-Pad<br><small>Effekt-Pad: live auf Summe oder Spur einwirken</small> | `#mixer-fxpad` | button | (versteckt: Fach Mixer) | Fach Mixer | (versteckt: Fach Mixer) | Fach Mixer |
| Drums ×7<br><small>Effekte dieses Kanals bearbeiten</small> | `#mixer-strips button.strip-name` | button | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| Arp<br><small>Effekte dieses Kanals bearbeiten</small> | `#mixer-strips button.strip-name „Arp“` | button | Fach Mixer | (versteckt: Fach Mixer) | – | – |
| Pad<br><small>Effekte dieses Kanals bearbeiten</small> | `#mixer-strips button.strip-name „Pad“` | button | Fach Mixer | (versteckt: Fach Mixer) | – | – |
| 7 Effekte ×7 | `#mixer-strips button.strip-sum` | button | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| M ×8<br><small>Stumm</small> | `#mixer-strips button.tbtn.tbtn-mute „M“` | button | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| S ×6<br><small>Solo</small> | `#mixer-strips button.tbtn.tbtn-solo „S“` | button | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| Panorama Drums ×6<br><small>Panorama (Doppelklick = Mitte)</small> | `#pan-t#` | input:range | Fach Mixer | Fach Mixer | Fach Mixer | Fach Mixer |
| Anteil zum Echo-Bus Drums ×6<br><small>Anteil zum Echo-Bus (Doppelklick = aus)</small> | `#send-t#-echo` | input:range | Fach Mixer | (versteckt: Fach Mixer) | Fach Mixer | (versteckt: Fach Mixer) |
| Anteil zum Hall-Bus Drums ×6<br><small>Anteil zum Hall-Bus (Doppelklick = aus)</small> | `#send-t#-hall` | input:range | Fach Mixer | (versteckt: Fach Mixer) | Fach Mixer | (versteckt: Fach Mixer) |

### Fach Song (8)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Länge des Songs in Takten | `#song-length` | select | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |
| Mastering ein/aus<br><small>Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in</small> | `#song-mst-on` | switch | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |
| Ausgewogen<br><small>Ausgewogen · Ziel −14 LUFS</small> | `#song-mst-style-balanced` | button | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |
| Hell<br><small>Hell · Ziel −14 LUFS</small> | `#song-mst-style-bright` | button | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |
| Club<br><small>Club · Ziel −8 LUFS</small> | `#song-mst-style-club` | button | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | (versteckt: Fach Song) |
| Laut<br><small>Laut · Ziel −10 LUFS</small> | `#song-mst-style-loud` | button | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |
| Warm<br><small>Warm · Ziel −14 LUFS</small> | `#song-mst-style-warm` | button | (versteckt: Fach Song) | (versteckt: Fach Song) | (versteckt: Fach Song) | Fach Song |
| Tempo 120 BPM<br><small>Tempo einstellen</small> | `#song-tempo` | button | (versteckt: Fach Song) | Fach Song | (versteckt: Fach Song) | Fach Song |

### Fach Tempo (7)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Tonart des Songs | `#key-sel-phone` | select | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |
| −1<br><small>1 BPM langsamer</small> | `#tempo-m1` | button | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |
| −5<br><small>5 BPM langsamer</small> | `#tempo-m5` | button | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |
| +1<br><small>1 BPM schneller</small> | `#tempo-p1` | button | (versteckt: Fach Tempo) | (versteckt: Fach Tempo) | (versteckt: Fach Tempo) | Fach Tempo |
| +5<br><small>5 BPM schneller</small> | `#tempo-p5` | button | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |
| 80 ×6 | `#tempo-presets button.key „#“` | button | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |
| Tempo in BPM | `#tempo-slider` | input:range | (versteckt: Fach Tempo) | Fach Tempo | (versteckt: Fach Tempo) | Fach Tempo |

### Fachleiste (7)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Editor<br><small>Wähle einen Clip, um ihn zu bearbeiten</small> | `#editor-tab` | button | Fachleiste | Fachleiste | – | – |
| FX-Pad<br><small>Effekt-Pad: live auf Summe oder Spur einwirken</small> | `#fxpad-btn` | button | Fachleiste | (versteckt: Fachleiste) | Inspektor Song (Werkzeuge) | (versteckt: Fach Song) |
| ? Tastenkürzel ? Gesten | `#keys-btn` | button | Fachleiste | (versteckt: Fachleiste) | Inspektor Song (Werkzeuge) | (versteckt: Fachleiste) |
| Mixer<br><small>Mixer und Effekte</small> | `#mixer-btn` | button | Fachleiste | Fachleiste | Inspektor Song (Werkzeuge) | (versteckt: Fach Song) |
| Song | `#tab-song` | button | (versteckt: Fachleiste) | Fachleiste | (versteckt: Fachleiste) | (versteckt: Fachleiste) |
| Sounds | `#tab-sounds` | button | (versteckt: Fachleiste) | Fachleiste | (versteckt: Fachleiste) | Fachleiste |
| Werkbank<br><small>Werkbank: Einstellungen des gewählten Clips, sonst des Songs</small> | `#tab-werkbank` | button | (versteckt: Fachleiste) | (versteckt: Fachleiste) | (versteckt: Fachleiste) | Fachleiste |

### Inspektor (2)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Werkbank | `#insp button.insp-toggle „Werkbank“` | button | – | – | Inspektor | (versteckt: Inspektor) |
| ⤢<br><small>Werkbank breiter oder schmaler</small> | `#wb-wide` | button | – | – | Inspektor | (versteckt: Inspektor) |

### Inspektor Clip (12)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Löschen<br><small>Ausgewählten Clip löschen (Entf)</small> | `#del-btn` | button | Inspektor Clip | (versteckt: Deck) | (versteckt: Deck) | (versteckt: Deck) |
| Duplizieren<br><small>Ausgewählten Clip duplizieren (Strg+D)</small> | `#dup-btn` | button | Inspektor Clip | (versteckt: Deck) | (versteckt: Deck) | (versteckt: Deck) |
| Bearbeiten<br><small>Ausgewählten Clip im Sample-Editor öffnen (Doppelklick auf den Clip)</small> | `#edit-btn` | button | Inspektor Clip | (versteckt: Deck) | – | – |
| ½×<br><small>Halbe Geschwindigkeit</small> | `#insp button.key[data-speed=0.5]` | button | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| 1×<br><small>Originalgeschwindigkeit</small> | `#insp button.key[data-speed=1]` | button | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| 2×<br><small>Doppelte Geschwindigkeit</small> | `#insp button.key[data-speed=2]` | button | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| (ohne Beschriftung) | `#insp-fadein` | input:range | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| (ohne Beschriftung) | `#insp-fadeout` | input:range | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| (ohne Beschriftung) | `#insp-gain` | input:range | Inspektor Clip | (versteckt: Inspektor Clip) | – | – |
| Geschwindigkeit<br><small>Doppelklick: 100 %</small> | `#insp-speed` | input:range | Inspektor Clip | (versteckt: Inspektor Clip) | Werkbank | Werkbank |
| wie Tonband<br><small>An: Tonhöhe ändert sich mit (wie ein Tonband). Aus: gleiche Tonhöhe</small> | `#insp-speed-tape` | button | Inspektor Clip | (versteckt: Inspektor Clip) | Werkbank | Werkbank |
| Teilen<br><small>An der Abspielmarke teilen (T)</small> | `#split-btn` | button | Inspektor Clip | (versteckt: Deck) | (versteckt: Deck) | (versteckt: Deck) |

### Inspektor Song (25)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Kompressor ein/aus | `#fx-comp-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| Verzerrer ein/aus | `#fx-drive-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| Echo ein/aus | `#fx-echo-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| EQ ein/aus | `#fx-eq-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| Filter ein/aus | `#fx-filter-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| Hall ein/aus | `#fx-hall-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| Pumpen ein/aus | `#fx-pump-on` | button | Inspektor Song · Inspektor Spur | – | Inspektor Song · Inspektor Spur | – |
| −<br><small>Tempo langsamer</small> | `#insp button.insp-step.key „Tempo langsamer“` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| +<br><small>Tempo schneller</small> | `#insp button.insp-step.key „Tempo schneller“` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-bus-echo-feedback` | input:range | Inspektor Song | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) |
| Zeit 1/4 1/8 punktiert 1/8 1/16 1/4 punktiert | `#insp-bus-echo-time` | select | Inspektor Song | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-bus-echo-volume` | input:range | Inspektor Song | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-bus-hall-size` | input:range | Inspektor Song | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-bus-hall-volume` | input:range | Inspektor Song | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) | (versteckt: Inspektor Song) |
| Tonart des Songs | `#insp-key` | select | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-length` | input:range | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Mastering ein/aus<br><small>Summe radiotauglich machen: Klangausgleich, Bus-Kompression, Breite in</small> | `#insp-mst-on` | switch | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Ausgewogen<br><small>Ausgewogen · Ziel −14 LUFS</small> | `#insp-mst-style-balanced` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Hell<br><small>Hell · Ziel −14 LUFS</small> | `#insp-mst-style-bright` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Club<br><small>Club · Ziel −8 LUFS</small> | `#insp-mst-style-club` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Laut<br><small>Laut · Ziel −10 LUFS</small> | `#insp-mst-style-loud` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| Warm<br><small>Warm · Ziel −14 LUFS</small> | `#insp-mst-style-warm` | button | Inspektor Song | (versteckt: Inspektor Song) | Inspektor Song | (versteckt: Inspektor Song) |
| (ohne Beschriftung) | `#insp-vol` | input:range | Inspektor Song · Inspektor Spur | (versteckt: Inspektor Song · Inspektor Spur) | Inspektor Song · Inspektor Spur | (versteckt: Inspektor Song · Inspektor Spur) |
| Zurückholen<br><small>Eine Sicherung oder Song-ZIP zurückholen – vorhandene Sounds werden ni</small> | `#wk-restore` | button | – | – | Inspektor Song | (versteckt: Fach Song) |
| Sichern<br><small>Alle eigenen Sounds, den Song und die Pads als eine ZIP-Datei sichern</small> | `#wk-save` | button | – | – | Inspektor Song | (versteckt: Fach Song) |

### Inspektor Song (Werkzeuge) (1)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Tonart und Akkorde | `#harm-btn` | button | – | – | Inspektor Song (Werkzeuge) | (versteckt: Fach Song) |

### Inspektor Spur (34)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Stärke50 % | `#fx-comp-amount` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Ansprache5 ms | `#fx-comp-attack` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Pegel0 dB | `#fx-comp-gain` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Ausklang150 ms | `#fx-comp-release` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Stärke40 % | `#fx-drive-drive` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Anteil100 % | `#fx-drive-mix` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Ton7,0 kHz | `#fx-drive-tone` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| ArtWarmHartFuzzBitcrusherAmp CrunchAmp LeadAmp Metal | `#fx-drive-type` | select | Inspektor Spur | – | Inspektor Spur | – |
| Wiederholungen35 % | `#fx-echo-feedback` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Anteil30 % | `#fx-echo-mix` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Zeit1/41/8 punktiert1/81/161/4 punktiert | `#fx-echo-time` | select | Inspektor Spur | – | Inspektor Spur | – |
| Höhen0 dB | `#fx-eq-high` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Tiefen0 dB | `#fx-eq-low` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Mitten0 dB | `#fx-eq-mid` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Frequenz2,9 kHz | `#fx-filter-cutoff` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Tiefe50 % | `#fx-filter-depth` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Bewegungaus4 Takte1 Takt1/21/41/8 | `#fx-filter-lfo` | select | Inspektor Spur | – | Inspektor Spur | – |
| Resonanz20 % | `#fx-filter-reso` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| ArtTiefpassHochpassBandpass | `#fx-filter-type` | select | Inspektor Spur | – | Inspektor Spur | – |
| Anteil25 % | `#fx-hall-mix` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Raumgröße50 % | `#fx-hall-size` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Tiefe60 % | `#fx-pump-depth` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Taktjeder Schlag1/8jeder 2. Schlag | `#fx-pump-rate` | select | Inspektor Spur | – | Inspektor Spur | – |
| Rückkehr50 % | `#fx-pump-release` | input:range | Inspektor Spur | – | Inspektor Spur | – |
| Alle Spuren im Mixer vergleichen → | `#insp button.insp-link „Alle Spuren im Mixer vergleichen →“` | button | Inspektor Spur | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Festhalten<br><small>Spur festhalten (F) – lange drücken oder Umschalt: nur in die Kiste</small> | `#insp-bounce` | button | – | – | Inspektor Spur | (versteckt: Inspektor Spur) |
| mit Effekten<br><small>Festhalten mit Effekten, Lautstärke und Sends – aus: nur die Clips, ob</small> | `#insp-bounce-fx` | button | – | – | Inspektor Spur | (versteckt: Inspektor Spur) |
| M<br><small>Spur stumm schalten</small> | `#insp-mute` | button | – | – | Inspektor Spur | (versteckt: Inspektor Spur) |
| (ohne Beschriftung) | `#insp-pan` | input:range | Inspektor Spur | (versteckt: Inspektor Spur) | Inspektor Spur | (versteckt: Inspektor Spur) |
| Scharf<br><small>Die nächste Aufnahme (●) landet auch auf dieser Spur (Umschalt+R)</small> | `#insp-rec-arm` | button | Inspektor Spur | (versteckt: Inspektor Spur) | – | – |
| Anteil zum Echo-Bus (Doppelklick = aus) | `#insp-send-echo` | input:range | Inspektor Spur | (versteckt: Inspektor Spur) | Inspektor Spur | (versteckt: Inspektor Spur) |
| Anteil zum Hall-Bus (Doppelklick = aus) | `#insp-send-hall` | input:range | Inspektor Spur | (versteckt: Inspektor Spur) | Inspektor Spur | (versteckt: Inspektor Spur) |
| S<br><small>Spur solo hören</small> | `#insp-solo` | button | – | – | Inspektor Spur | (versteckt: Inspektor Spur) |
| Feinheiten | `#insp-track-fine` | button | – | – | Inspektor Spur | (versteckt: Inspektor Spur) |

### Kurven-Feld (5)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Echo-Anteil | `.auto-keys button.auto-key „Echo-Anteil“` | menuitemradio | Kurven-Feld | Kurven-Feld | Kurven-Feld | Kurven-Feld |
| Filter-Frequenz | `.auto-keys button.auto-key „Filter-Frequenz“` | menuitemradio | Kurven-Feld | Kurven-Feld | Kurven-Feld | Kurven-Feld |
| Hall-Anteil | `.auto-keys button.auto-key „Hall-Anteil“` | menuitemradio | Kurven-Feld | Kurven-Feld | Kurven-Feld | Kurven-Feld |
| Lautstärke | `.auto-keys button.auto-key „Lautstärke“` | menuitemradio | Kurven-Feld | Kurven-Feld | Kurven-Feld | Kurven-Feld |
| Verzerrer-Anteil | `.auto-keys button.auto-key „Verzerrer-Anteil“` | menuitemradio | Kurven-Feld | Kurven-Feld | Kurven-Feld | Kurven-Feld |

### Lineal (1)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Wiedergabeposition | `#arr-scroll div.ph-grip „Wiedergabeposition“` | slider | Lineal | Lineal | Lineal | Lineal |

### Projekt-Menü (7)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Beispiel<br><small>Beispiel-Arrangement laden</small> | `#demo-btn` | button | Projekt-Menü | (versteckt: Fach Song) | – | – |
| Leeren<br><small>Alle Spuren leeren</small> | `#new-btn` | button | Projekt-Menü | (versteckt: Fach Song) | Projekt-Menü | (versteckt: Fach Song) |
| Öffnen<br><small>Projektdatei öffnen</small> | `#open-btn` | button | Projekt-Menü | (versteckt: Fach Song) | Projekt-Menü | (versteckt: Fach Song) |
| Sonic Pi | `#pop-about a „Sonic Pi“` | link | Projekt-Menü | (versteckt: Projekt-Menü) | – | – |
| Projektname<br><small>Projektname – wird auch für gespeicherte und exportierte Dateien verwe</small> | `#project-name` | input:text | Projekt-Menü | Fach Song | Projekt-Menü | Fach Song |
| Speichern<br><small>Projekt als Datei speichern</small> | `#save-btn` | button | Projekt-Menü | Fach Song | Projekt-Menü | Fach Song |
| Tipps wieder zeigen Tipps | `#tips-reset` | button | Projekt-Menü | (versteckt: Fach Song) | – | – |

### Regal (30)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Sonic Pi | `.shelf a „Sonic Pi“` | link | (versteckt: Regal) | Regal | – | – |
| + Link<br><small>Sound über einen Link holen oder Ton aus einem anderen Tab aufnehmen</small> | `.shelf button.shelf-import „Sound über einen Link holen oder Ton aus einem anderen Tab aufnehmen“` | button | (versteckt: Regal) | Regal | – | – |
| + Eigene Sounds importieren + Import<br><small>Audiodateien (WAV, MP3, OGG …) als eigene Sounds importieren – oder Da</small> | `#import-btn` | button | (versteckt: Regal) | Regal | (versteckt: Regal) | Regal |
| ‹<br><small>Kiste ein- und ausklappen</small> | `#kiste-toggle` | button | (versteckt: Regal) | (versteckt: Regal) | Regal | (versteckt: Regal) |
| × ×4<br><small>Eigenen Sound löschen</small> | `#library button.loop-del „×“` | button | Regal | (versteckt: Regal) | Regal | (versteckt: Regal) |
| ★ ×547<br><small>Four to the Floor als Favorit markieren</small> | `#library button.loop-fav „★“` | button | Regal | Regal | Regal | (versteckt: Regal) |
| Four to the Floor 1 Takt ×547<br><small>Four to the Floor · Loop, 4 Schläge · House, Techno, Pop · synthetisch</small> | `#library button.loop-item` | button | Regal | Regal | Regal | (versteckt: Regal) |
| Erstellen | `#ltab-create` | tab | Regal | (versteckt: Regal) | (versteckt: Regal) | (versteckt: Regal) |
| Suchen | `#ltab-sounds` | tab | Regal | (versteckt: Regal) | (versteckt: Regal) | (versteckt: Regal) |
| + Beat bauen + Beat<br><small>Neuen Beat im Stepsequencer bauen</small> | `#new-beat-btn` | button | (versteckt: Regal) | Regal | (versteckt: Regal) | Regal |
| + Melodie<br><small>Neue Melodie in der Piano-Roll schreiben</small> | `#new-melody-btn` | button | (versteckt: Regal) | Regal | (versteckt: Regal) | Regal |
| Bass 33 | `#shelf-cat-bass` | button | Regal | Regal | – | – |
| Akkorde 123 | `#shelf-cat-chords` | button | Regal | Regal | – | – |
| Dinge 2 | `#shelf-cat-dinge` | button | – | – | Regal | (versteckt: Regal) |
| Drums 261 | `#shelf-cat-drums` | button | Regal | Regal | – | – |
| FX 69 | `#shelf-cat-fx` | button | Regal | Regal | – | – |
| Eigene 1 | `#shelf-cat-own` | button | Regal | (versteckt: Regal) | – | – |
| Strom 1 | `#shelf-cat-strom` | button | – | – | Regal | (versteckt: Regal) |
| Synth 59 | `#shelf-cat-synth` | button | Regal | Regal | – | – |
| Nur Favoriten zeigen | `#shelf-fav` | button | Regal | Regal (Suchzeile) | – | – |
| Länge und Ordnen | `#shelf-filter-btn` | button | Regal | Regal (Suchzeile) | – | – |
| 1T 37<br><small>Loops bis 1 Takt</small> | `#shelf-filters button.seg[data-len=1]` | button | Regal | Regal (Suchzeile) | – | – |
| 2T 67<br><small>Loops mit 2 Takten</small> | `#shelf-filters button.seg[data-len=2]` | button | Regal | Regal (Suchzeile) | – | – |
| 4T 62<br><small>Loops mit 3 bis 4 Takten</small> | `#shelf-filters button.seg[data-len=4]` | button | Regal | Regal (Suchzeile) | – | – |
| 8T+ 0<br><small>Loops ab 5 Takten</small> | `#shelf-filters button.seg[data-len=8]` | button | Regal | Regal (Suchzeile) | – | – |
| Shot 379<br><small>Einzelklänge ohne Takt</small> | `#shelf-filters button.seg[data-len=shot]` | button | Regal | Regal (Suchzeile) | – | – |
| Kategorie | `#shelf-filters button.seg[data-sort=cat]` | button | Regal | Regal (Suchzeile) | – | – |
| Genre | `#shelf-filters button.seg[data-sort=genre]` | button | Regal | Regal (Suchzeile) | – | – |
| + Neu<br><small>Neu: aufnehmen, Datei, Beat, Melodie</small> | `#shelf-new` | button | (versteckt: Regal) | (versteckt: Regal) | Regal | Regal (Suchzeile) |
| Sounds durchsuchen | `#shelf-search` | input:search | Regal | Regal (Suchzeile) | Regal | Regal (Suchzeile) |

### Song-Starter (11)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Nochmal<br><small>Andere Fassung desselben Genres</small> | `#starter-again` | button | Song-Starter | Song-Starter | – | – |
| Ambient | `#starter-genres button.starter-genre „Ambient“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| DnB | `#starter-genres button.starter-genre „DnB“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| Hip-Hop | `#starter-genres button.starter-genre „Hip-Hop“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| House | `#starter-genres button.starter-genre „House“` | button | Song-Starter | Song-Starter | – | – |
| Lo-Fi | `#starter-genres button.starter-genre „Lo-Fi“` | button | Song-Starter | Song-Starter | – | – |
| Melodic Techno | `#starter-genres button.starter-genre „Melodic Techno“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| Pop | `#starter-genres button.starter-genre „Pop“` | button | Song-Starter | Song-Starter | – | – |
| Rock | `#starter-genres button.starter-genre „Rock“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| Techno | `#starter-genres button.starter-genre „Techno“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |
| Trap | `#starter-genres button.starter-genre „Trap“` | button | Song-Starter | (versteckt: Song-Starter) | – | – |

### Spur-Menü ⋯ (8)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Duplizieren | `.track-menu button.track-menu-item „Duplizieren“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Gruppe bilden | `.track-menu button.track-menu-item „Gruppe bilden“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Kurve | `.track-menu button.track-menu-item „Kurve“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Löschen | `.track-menu button.track-menu-item „Löschen“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Nach oben | `.track-menu button.track-menu-item „Nach oben“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Nach unten | `.track-menu button.track-menu-item „Nach unten“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Umbenennen | `.track-menu button.track-menu-item „Umbenennen“` | menuitem | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ | Spur-Menü ⋯ |
| Für Aufnahme scharf<br><small>Die nächste Aufnahme (●) landet auch auf dieser Spur (Umschalt+R)</small> | `#tm-rec-arm` | menuitemcheckbox | Spur-Menü ⋯ | Spur-Menü ⋯ | – | – |

### Spurkopf (5)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Kurve zeigen: Drums ×8<br><small>Kurve zeigen (Taste A)</small> | `#arr-scroll button.tbtn.tbtn-chev` | button | Spurkopf | Spurkopf | (versteckt: Spurkopf) | (versteckt: Spurkopf) |
| ⋯ ×8<br><small>Spur: duplizieren, verschieben, umbenennen, löschen</small> | `#arr-scroll button.tbtn.tbtn-menu „⋯“` | button | Spurkopf | Spurkopf | Spurkopf | Spurkopf |
| M ×8<br><small>Stumm</small> | `#arr-scroll button.tbtn.tbtn-mute „M“` | button | Spurkopf | Spurkopf | (versteckt: Spurkopf) | (versteckt: Spurkopf) |
| S ×8<br><small>Solo</small> | `#arr-scroll button.tbtn.tbtn-solo „S“` | button | Spurkopf | Spurkopf | (versteckt: Spurkopf) | (versteckt: Spurkopf) |
| Lautstärke Drums ×8 | `#vol-t#` | input:range | Spurkopf | (versteckt: Spurkopf) | (versteckt: Spurkopf) | (versteckt: Spurkopf) |

### Werkbank (55)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Dinge | `#insp button.wb-mat-btn „Dinge“` | button | – | – | Werkbank | Werkbank |
| Körper | `#insp button.wb-mat-btn „Körper“` | button | – | – | Werkbank | Werkbank |
| Schleife | `#insp button.wb-mat-btn „Schleife“` | button | – | – | Werkbank | Werkbank |
| Stimme | `#insp button.wb-mat-btn „Stimme“` | button | – | – | Werkbank | Werkbank |
| Strom | `#insp button.wb-mat-btn „Strom“` | button | – | – | Werkbank | Werkbank |
| Anschlag<br><small>Anschlag: ziehen, Pfeiltasten verschieben (Umschalt: grob), Doppelklic</small> | `#insp div.wb-h.wb-h-atk „Anschlag“` | slider | – | – | Werkbank | Werkbank |
| Ende<br><small>Ende: ziehen, Pfeiltasten verschieben (Umschalt: grob), Doppelklick: S</small> | `#insp div.wb-h.wb-h-end „Ende“` | slider | – | – | Werkbank | Werkbank |
| Ausklang<br><small>Ausklang: ziehen, Pfeiltasten verschieben (Umschalt: grob), Doppelklic</small> | `#insp div.wb-h.wb-h-rel „Ausklang“` | slider | – | – | Werkbank | Werkbank |
| Anfang<br><small>Anfang: ziehen, Pfeiltasten verschieben (Umschalt: grob), Doppelklick:</small> | `#insp div.wb-h.wb-h-start „Anfang“` | slider | – | – | Werkbank | Werkbank |
| Anschlag | `#wb-attack` | input:range | – | – | Werkbank | Werkbank |
| Feinstimmung | `#wb-cents` | input:range | – | – | Werkbank | Werkbank |
| Clip-Lautstärke | `#wb-clip-gain` | input:range | – | – | Werkbank | Werkbank |
| Einblenden | `#wb-clip-in` | input:range | – | – | Werkbank | Werkbank |
| Ausblenden | `#wb-clip-out` | input:range | – | – | Werkbank | Werkbank |
| Rauschen weg | `#wb-denoise` | input:range | – | – | Werkbank | Werkbank |
| Herkunft ändern | `#wb-dot` | button | – | – | Werkbank | Werkbank |
| Ende im Original | `#wb-end-num` | input:number | – | – | (versteckt: Werkbank) | Werkbank |
| Zurücksetzen | `#wb-farbe-reset` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Feinheiten | `#wb-fine-btn-clip` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Feinheiten | `#wb-fine-btn-farbe` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Feinheiten | `#wb-fine-btn-form` | button | – | – | Werkbank | Werkbank |
| Feinheiten | `#wb-fine-btn-ton` | button | – | – | Werkbank | Werkbank |
| Feinheiten | `#wb-fine-btn-zeit` | button | – | – | Werkbank | Werkbank |
| Zurücksetzen | `#wb-form-reset` | button | – | – | (versteckt: Werkbank) | Werkbank |
| Pegel | `#wb-gain` | input:range | – | – | Werkbank | Werkbank |
| Körnung | `#wb-grain` | input:range | – | – | Werkbank | (versteckt: Werkbank) |
| Dünner | `#wb-hp` | input:range | – | – | Werkbank | Werkbank |
| Dunkler | `#wb-lp` | input:range | – | – | Werkbank | Werkbank |
| Loop | `#wb-mode-loop` | button | – | – | Werkbank | Werkbank |
| Einzelklang | `#wb-mode-one` | button | – | – | Werkbank | Werkbank |
| Bumm 1<br><small>Antippen zum Umbenennen</small> | `#wb-name` | button | – | – | Werkbank | (versteckt: Werkbank) |
| ½×<br><small>Halbe Geschwindigkeit</small> | `#wb-panel-clip button.key[data-speed=0.5]` | button | – | – | Werkbank | (versteckt: Werkbank) |
| 1×<br><small>Originalgeschwindigkeit</small> | `#wb-panel-clip button.key[data-speed=1]` | button | – | – | Werkbank | (versteckt: Werkbank) |
| 2×<br><small>Doppelte Geschwindigkeit</small> | `#wb-panel-clip button.key[data-speed=2]` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Muster bearbeiten | `#wb-pattern` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Auf Spitze | `#wb-peak` | button | – | – | (versteckt: Werkbank) | Werkbank |
| Ausklang | `#wb-release` | input:range | – | – | Werkbank | Werkbank |
| Resonanz | `#wb-res` | input:range | – | – | Werkbank | (versteckt: Werkbank) |
| Rückwärts | `#wb-reverse` | button | – | – | Werkbank | Werkbank |
| −<br><small>Einen Halbton tiefer</small> | `#wb-semis-minus` | button | – | – | Werkbank | Werkbank |
| +<br><small>Einen Halbton höher</small> | `#wb-semis-plus` | button | – | – | Werkbank | Werkbank |
| Als Song-Tempo | `#wb-song-tempo` | button | – | – | Werkbank | Werkbank |
| Anfang im Original | `#wb-start-num` | input:number | – | – | (versteckt: Werkbank) | Werkbank |
| Dehnen | `#wb-stretch` | input:range | – | – | Werkbank | Werkbank |
| Clip | `#wb-tab-clip` | tab | – | – | Werkbank | Werkbank |
| Farbe | `#wb-tab-farbe` | tab | – | – | Werkbank | Werkbank |
| Form | `#wb-tab-form` | tab | – | – | Werkbank | Werkbank |
| Ton | `#wb-tab-ton` | tab | – | – | Werkbank | Werkbank |
| Zeit | `#wb-tab-zeit` | tab | – | – | Werkbank | Werkbank |
| Zurücksetzen | `#wb-ton-reset` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Auf Tonart<br><small>Rundet den erkannten Grundton auf die Tonart des Songs</small> | `#wb-tonart` | button | – | – | Werkbank | Werkbank |
| Stille abschneiden | `#wb-trim` | button | – | – | (versteckt: Werkbank) | Werkbank |
| Autotune<br><small>Stärke</small> | `#wb-tune` | button | – | – | Werkbank | (versteckt: Werkbank) |
| Als Variante<br><small>Eigene Fassung nur für diesen Clip</small> | `#wb-variant` | button | – | – | Werkbank | Werkbank |
| Wärme | `#wb-warm` | input:range | – | – | Werkbank | Werkbank |

### Werkzeug am Clip (4)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Löschen<br><small>Clip löschen (Entf) – Rückgängig holt ihn zurück</small> | `#cf-del` | button | – | – | Werkzeug am Clip | Werkzeug am Clip |
| Kopie<br><small>Kopie direkt dahinter legen (Strg+D)</small> | `#cf-dup` | button | – | – | Werkzeug am Clip | Werkzeug am Clip |
| Teilen<br><small>Clip an der Abspielmarke teilen (T)</small> | `#cf-split` | button | – | – | Werkzeug am Clip | Werkzeug am Clip |
| Werkbank<br><small>Werkbank für diesen Clip öffnen</small> | `#cf-werkbank` | button | – | – | (versteckt: Werkzeug am Clip) | Werkzeug am Clip |

### Nirgends zu sehen (84)

| Funktion | Kennung | Art | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|---|---|
| Keine Tipps mehr | `.tip button.tip-off „Keine Tipps mehr“` | button | (versteckt: Tipp) | (versteckt: Tipp) | – | – |
| Verstanden | `.tip button.tip-ok „Verstanden“` | button | (versteckt: Tipp) | (versteckt: Tipp) | – | – |
| Festhalten<br><small>Loop festhalten (F) – lange drücken oder Umschalt: nur in die Kiste</small> | `#bounce-btn` | button | – | – | (versteckt: Lineal) | (versteckt: Lineal) |
| Festhalten<br><small>Auswahl festhalten (F) – Umschalt: nur in die Kiste</small> | `#cf-bounce` | button | – | – | (versteckt: Werkzeug am Clip) | (versteckt: Werkzeug am Clip) |
| Take<br><small>Nächster Take (Alt+↓)</small> | `#cf-take` | button | – | – | (versteckt: Werkzeug am Clip) | (versteckt: Werkzeug am Clip) |
| Stumm aus<br><small>Clip wieder hörbar machen</small> | `#cf-unmute` | button | – | – | (versteckt: Werkzeug am Clip) | (versteckt: Werkzeug am Clip) |
| Anwenden | `#ed-pitch-apply` | button | (versteckt: Fach Editor (Sample-Editor)) | (versteckt: Fach Editor (Sample-Editor)) | – | – |
| Marke folgen<br><small>Die Ansicht folgt wieder der Abspielmarke</small> | `#follow-btn` | button | (versteckt: Arranger) | (versteckt: Arranger) | (versteckt: Arranger) | (versteckt: Arranger) |
| Fertig | `#hint-done` | button | (versteckt: Einblender) | (versteckt: Einblender) | (versteckt: Einblender) | (versteckt: Einblender) |
| (ohne Beschriftung) | `#insp button.auto-lock` | button | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) |
| Verzerrer ein/aus | `#insp button.fxl-switch` | button | – | (versteckt: Inspektor Song · Inspektor Spur) | – | (versteckt: Inspektor Song · Inspektor Spur) |
| Eigenschaften | `#insp button.insp-toggle „Eigenschaften“` | button | (versteckt: Inspektor) | (versteckt: Inspektor) | – | – |
| Kompressor | `#insp button.wb-btn[data-fx=comp]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Verzerrer | `#insp button.wb-btn[data-fx=drive]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Echo | `#insp button.wb-btn[data-fx=echo]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| EQ | `#insp button.wb-btn[data-fx=eq]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Filter | `#insp button.wb-btn[data-fx=filter]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Hall | `#insp button.wb-btn[data-fx=hall]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Pumpen | `#insp button.wb-btn[data-fx=pump]` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| Marke: ziehen, Pfeil links/rechts verschiebt (Umschalt: grob), Pfeil h | `#insp div.wb-mk-slider „Marke: ziehen, Pfeil links/rechts verschiebt (Umschalt: grob), Pfeil h“` | slider | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Stärke40 % | `#insp input` | input:range | – | (versteckt: Inspektor Song · Inspektor Spur) | – | (versteckt: Inspektor Song · Inspektor Spur) |
| ArtWarmHartFuzzBitcrusherAmp CrunchAmp LeadAmp Metal | `#insp select` | select | – | (versteckt: Inspektor Song · Inspektor Spur) | – | (versteckt: Inspektor Song · Inspektor Spur) |
| + Effekt | `#insp-add-fx` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) |
| (ohne Beschriftung) | `#insp-curvein` | input:range | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| (ohne Beschriftung) | `#insp-curveout` | input:range | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Reihenfolge zurücksetzen | `#insp-fx-reset` | button | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) | (versteckt: Inspektor Song · Inspektor Spur) |
| Auto | `#insp-recin-auto` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | – | – |
| Links | `#insp-recin-L` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | – | – |
| Stereo | `#insp-recin-LR` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | – | – |
| Rechts | `#insp-recin-R` | button | (versteckt: Inspektor Spur) | (versteckt: Inspektor Spur) | – | – |
| Folgt Song<br><small>Sound in die Tonart des Songs umstimmen</small> | `#insp-skey-follow` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Tonart des Sounds | `#insp-skey-sel` | select | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Tempo des Sounds (BPM) | `#insp-stempo` | input:number | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| ×2<br><small>Doppeltes Tempo</small> | `#insp-stempo-double` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| ÷2<br><small>Halbes Tempo (Aufnahme zählt doppelt so viele Schläge)</small> | `#insp-stempo-half` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Wie geliefert<br><small>Eigenes Tempo für diesen Sound entfernen</small> | `#insp-stempo-reset` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Als Song-Tempo<br><small>Song-Tempo auf das Tempo dieses Sounds setzen</small> | `#insp-stempo-song` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| ×<br><small>Aktiven Take löschen (der Sound bleibt unter „Eigene“)</small> | `#insp-take-del` | button | (versteckt: Inspektor Clip) | (versteckt: Inspektor Clip) | – | – |
| Tonart des Songs | `#key-sel-song` | select | (versteckt: Fach Song) | (versteckt: Fach Song) | (versteckt: Fach Song) | (versteckt: Fach Song) |
| Holen | `#link-go` | button | (versteckt: Feld „Aus dem Netz holen“) | (versteckt: Feld „Aus dem Netz holen“) | – | – |
| Link zu einer Audiodatei | `#link-input` | input:url | (versteckt: Feld „Aus dem Netz holen“) | (versteckt: Feld „Aus dem Netz holen“) | – | – |
| Folgt Song<br><small>Sound in die Tonart des Songs umstimmen</small> | `#lvl-skey-follow` | button | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Tonart des Sounds | `#lvl-skey-sel` | select | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Tempo des Sounds (BPM) | `#lvl-tempo` | input:number | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| ×2<br><small>Doppeltes Tempo</small> | `#lvl-tempo-double` | button | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| ÷2<br><small>Halbes Tempo</small> | `#lvl-tempo-half` | button | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| Song<br><small>Song-Tempo auf das Tempo dieses Sounds setzen</small> | `#lvl-tempo-song` | button | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) | (versteckt: Clipleiste) |
| (ohne Beschriftung) | `#mixer-strips button.auto-lock` | button | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) |
| Zerr<br><small>Verzerrer ein/aus</small> | `#mixer-strips button.fx-toggle` | button | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) |
| EQ<br><small>EQ ein/aus</small> | `#mixer-strips button.fx-toggle „EQ“` | button | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) |
| FX<br><small>Effekte dieses Kanals bearbeiten</small> | `#mixer-strips button.strip-name „FX“` | button | (versteckt: Fach Mixer) | (versteckt: Fach Mixer) | – | – |
| Auf Tonleiter ziehen<br><small>0 Noten liegen außerhalb der Tonleiter – sie rücken auf den nächsten T</small> | `#pat-scale-fix` | button | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) |
| Welche Tonleiter | `#pat-scale-kind` | select | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) |
| Alle<br><small>Alle Clips auswählen</small> | `#select-all-btn` | button | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) |
| Auswählen<br><small>Mehrere Clips auswählen: Clips antippen</small> | `#select-btn` | button | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) | (versteckt: Arranger-Leiste) |
| Suche und Filter zurücksetzen | `#shelf-reset` | button | (versteckt: Regal) | (versteckt: Regal (Suchzeile)) | (versteckt: Regal) | (versteckt: Regal (Suchzeile)) |
| Wie soll es klingen? | `#sing-desc` | input:text | (versteckt: Fach Editor (Beat/Melodie)) | (versteckt: Fach Editor (Beat/Melodie)) | – | – |
| + Begleitung<br><small>Fläche, Bass und Arp, die dem Akkord-Streifen folgen</small> | `#starter-accomp` | button | (versteckt: Song-Starter) | (versteckt: Song-Starter) | – | – |
| ● Ton aus einem Tab aufnehmen | `#tab-capture` | button | (versteckt: Feld „Aus dem Netz holen“) | (versteckt: Feld „Aus dem Netz holen“) | – | – |
| Tempo des Sounds (BPM) | `#wb-bpm` | input:number | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Kurve Einblenden | `#wb-curve-in` | input:range | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Kurve Ausblenden | `#wb-curve-out` | input:range | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| In die Kiste<br><small>Legt die Schnitte als eigene Sounds in die Kiste</small> | `#wb-cut-box` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| In 8 gleiche | `#wb-cut-even` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Ins Raster<br><small>Die Anfänge der Schnitt-Clips rasten auf das Raster ein</small> | `#wb-cut-grid` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| 16 | `#wb-cut-n-16` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| 2 | `#wb-cut-n-2` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| 4 | `#wb-cut-n-4` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| 8 | `#wb-cut-n-8` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| An Anschlägen | `#wb-cut-onsets` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Empfindlichkeit | `#wb-cut-sens` | input:range | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Auf die Spur<br><small>Ersetzt den Clip durch die Schnitte an denselben Stellen</small> | `#wb-cut-track` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| ×2<br><small>Doppelt so lang</small> | `#wb-double` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Feinheiten | `#wb-fine-btn-zerlegen` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| ÷2<br><small>Halb so lang</small> | `#wb-half` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Name des Sounds | `#wb-name-in` | input:text | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Stimme weg | `#wb-sep-novocal` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| In 4 Ebenen | `#wb-sep-stems` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Nur Stimme | `#wb-sep-vocal` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Zerlegen | `#wb-tab-zerlegen` | tab | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| ×<br><small>Aktiven Take löschen (der Sound bleibt unter „Eigene“)</small> | `#wb-take-del` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Wie geliefert | `#wb-tempo-reset` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Tonart für Autotune | `#wb-tune-key` | select | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |
| Roboter | `#wb-tune-robot` | button | – | – | (versteckt: Werkbank) | (versteckt: Werkbank) |

## Loopwerk: Desktop und Handy im Vergleich

### Nur am Desktop zu sehen (130)

- Begleitung Fläche, Bass und Arp folgen dem Akkord-Streifen (`#create-panel button.ccard[data-create=accomp]`): Erstellen
- Beat bauen Schlagzeug in Schritten oder auf Pads (`#create-panel button.ccard[data-create=beat]`): Erstellen
- Datei importieren WAV, MP3, OGG … – oder direkt auf eine Spur ziehen (`#create-panel button.ccard[data-create=import]`): Erstellen
- Aus dem Netz holen Link zu einer Audiodatei – oder Ton aus einem ander (`#create-panel button.ccard[data-create=link]`): Erstellen
- Melodie schreiben Noten setzen oder auf der Klaviatur spielen (`#create-panel button.ccard[data-create=melody]`): Erstellen
- Audio aufnehmen Stimme oder Instrument als Sound auf eine Spur (`#create-panel button.ccard[data-create=record]`): Erstellen
- Melodie einsingen Summen, singen, pfeifen – wird zu Noten (`#create-panel button.ccard[data-create=sing]`): Erstellen
- Löschen (`#del-btn`): Inspektor Clip
- Beispiel (`#demo-btn`): Projekt-Menü
- Duplizieren (`#dup-btn`): Inspektor Clip
- Stimme entfernen (`#ed-novocal`): Fach Editor (Sample-Editor)
- Stimme isolieren (`#ed-vocal`): Fach Editor (Sample-Editor)
- Bearbeiten (`#edit-btn`): Inspektor Clip
- Loop-Bereich (`#ex-range-loop`): Fach Export
- Lautstärke Echo-Bus (`#fader-bus-echo`): Fach Mixer
- Lautstärke Hall-Bus (`#fader-bus-hall`): Fach Mixer
- Stärke50 % (`#fx-comp-amount`): Inspektor Spur
- Ansprache5 ms (`#fx-comp-attack`): Inspektor Spur
- Pegel0 dB (`#fx-comp-gain`): Inspektor Spur
- Kompressor ein/aus (`#fx-comp-on`): Inspektor Song · Inspektor Spur
- Ausklang150 ms (`#fx-comp-release`): Inspektor Spur
- Stärke40 % (`#fx-drive-drive`): Inspektor Spur
- Anteil100 % (`#fx-drive-mix`): Inspektor Spur
- Verzerrer ein/aus (`#fx-drive-on`): Inspektor Song · Inspektor Spur
- Ton7,0 kHz (`#fx-drive-tone`): Inspektor Spur
- ArtWarmHartFuzzBitcrusherAmp CrunchAmp LeadAmp Metal (`#fx-drive-type`): Inspektor Spur
- Wiederholungen35 % (`#fx-echo-feedback`): Inspektor Spur
- Anteil30 % (`#fx-echo-mix`): Inspektor Spur
- Echo ein/aus (`#fx-echo-on`): Inspektor Song · Inspektor Spur
- Zeit1/41/8 punktiert1/81/161/4 punktiert (`#fx-echo-time`): Inspektor Spur
- Höhen0 dB (`#fx-eq-high`): Inspektor Spur
- Tiefen0 dB (`#fx-eq-low`): Inspektor Spur
- Mitten0 dB (`#fx-eq-mid`): Inspektor Spur
- EQ ein/aus (`#fx-eq-on`): Inspektor Song · Inspektor Spur
- Frequenz2,9 kHz (`#fx-filter-cutoff`): Inspektor Spur
- Tiefe50 % (`#fx-filter-depth`): Inspektor Spur
- Bewegungaus4 Takte1 Takt1/21/41/8 (`#fx-filter-lfo`): Inspektor Spur
- Filter ein/aus (`#fx-filter-on`): Inspektor Song · Inspektor Spur
- Resonanz20 % (`#fx-filter-reso`): Inspektor Spur
- ArtTiefpassHochpassBandpass (`#fx-filter-type`): Inspektor Spur
- Anteil25 % (`#fx-hall-mix`): Inspektor Spur
- Hall ein/aus (`#fx-hall-on`): Inspektor Song · Inspektor Spur
- Raumgröße50 % (`#fx-hall-size`): Inspektor Spur
- Tiefe60 % (`#fx-pump-depth`): Inspektor Spur
- Pumpen ein/aus (`#fx-pump-on`): Inspektor Song · Inspektor Spur
- Taktjeder Schlag1/8jeder 2. Schlag (`#fx-pump-rate`): Inspektor Spur
- Rückkehr50 % (`#fx-pump-release`): Inspektor Spur
- FX-Pad (`#fxpad-btn`): Fachleiste
- Alle Spuren im Mixer vergleichen → (`#insp button.insp-link „Alle Spuren im Mixer vergleichen →“`): Inspektor Spur
- − (`#insp button.insp-step.key „Tempo langsamer“`): Inspektor Song
- + (`#insp button.insp-step.key „Tempo schneller“`): Inspektor Song
- ½× (`#insp button.key[data-speed=0.5]`): Inspektor Clip
- 1× (`#insp button.key[data-speed=1]`): Inspektor Clip
- 2× (`#insp button.key[data-speed=2]`): Inspektor Clip
- (ohne Beschriftung) (`#insp-bus-echo-feedback`): Inspektor Song
- Zeit 1/4 1/8 punktiert 1/8 1/16 1/4 punktiert (`#insp-bus-echo-time`): Inspektor Song
- (ohne Beschriftung) (`#insp-bus-echo-volume`): Inspektor Song
- (ohne Beschriftung) (`#insp-bus-hall-size`): Inspektor Song
- (ohne Beschriftung) (`#insp-bus-hall-volume`): Inspektor Song
- (ohne Beschriftung) (`#insp-fadein`): Inspektor Clip
- (ohne Beschriftung) (`#insp-fadeout`): Inspektor Clip
- (ohne Beschriftung) (`#insp-gain`): Inspektor Clip
- Tonart des Songs (`#insp-key`): Inspektor Song
- (ohne Beschriftung) (`#insp-length`): Inspektor Song
- Mastering ein/aus (`#insp-mst-on`): Inspektor Song
- Ausgewogen (`#insp-mst-style-balanced`): Inspektor Song
- Hell (`#insp-mst-style-bright`): Inspektor Song
- Club (`#insp-mst-style-club`): Inspektor Song
- Laut (`#insp-mst-style-loud`): Inspektor Song
- Warm (`#insp-mst-style-warm`): Inspektor Song
- (ohne Beschriftung) (`#insp-pan`): Inspektor Spur
- Scharf (`#insp-rec-arm`): Inspektor Spur
- Anteil zum Echo-Bus (Doppelklick = aus) (`#insp-send-echo`): Inspektor Spur
- Anteil zum Hall-Bus (Doppelklick = aus) (`#insp-send-hall`): Inspektor Spur
- Geschwindigkeit (`#insp-speed`): Inspektor Clip
- wie Tonband (`#insp-speed-tape`): Inspektor Clip
- (ohne Beschriftung) (`#insp-vol`): Inspektor Song · Inspektor Spur
- Tonart des Songs (`#key-sel`): Deck
- ? Tastenkürzel ? Gesten (`#keys-btn`): Fachleiste
- × (`#library button.loop-del „×“`): Regal
- Erstellen (`#ltab-create`): Regal
- Suchen (`#ltab-sounds`): Regal
- Arp (`#mixer-strips button.strip-name „Arp“`): Fach Mixer
- Pad (`#mixer-strips button.strip-name „Pad“`): Fach Mixer
- Leeren (`#new-btn`): Projekt-Menü
- Öffnen (`#open-btn`): Projekt-Menü
- Bass: Sechzehntel (rollend) (`#pat-bass-roll`): Fach Editor (Beat/Melodie)
- U (`#pat-keybed button.black.pat-key „A♯#“`): Fach Editor (Beat/Melodie)
- W (`#pat-keybed button.black.pat-key „C♯#“`): Fach Editor (Beat/Melodie)
- E (`#pat-keybed button.black.pat-key „D♯#“`): Fach Editor (Beat/Melodie)
- T (`#pat-keybed button.black.pat-key „F♯#“`): Fach Editor (Beat/Melodie)
- Z (`#pat-keybed button.black.pat-key „G♯#“`): Fach Editor (Beat/Melodie)
- A C4 (`#pat-keybed button.c.pat-key „C#“`): Fach Editor (Beat/Melodie)
- H (`#pat-keybed button.pat-key „A#“`): Fach Editor (Beat/Melodie)
- S (`#pat-keybed button.pat-key „D#“`): Fach Editor (Beat/Melodie)
- D (`#pat-keybed button.pat-key „E#“`): Fach Editor (Beat/Melodie)
- F (`#pat-keybed button.pat-key „F#“`): Fach Editor (Beat/Melodie)
- G (`#pat-keybed button.pat-key „G#“`): Fach Editor (Beat/Melodie)
- J (`#pat-keybed button.pat-key „H#“`): Fach Editor (Beat/Melodie)
- ◀ (`#pat-oct-down`): Fach Editor (Beat/Melodie)
- ▶ (`#pat-oct-up`): Fach Editor (Beat/Melodie)
- Quantisieren (`#pat-quantize`): Fach Editor (Beat/Melodie)
- Tonleiter (`#pat-scale`): Fach Editor (Beat/Melodie)
- Schritte (`#pat-view button.seg[data-view=grid]`): Fach Editor (Beat/Melodie)
- Pads (`#pat-view button.seg[data-view=pads]`): Fach Editor (Beat/Melodie)
- Sonic Pi (`#pop-about a „Sonic Pi“`): Projekt-Menü
- Beispiel-Arrangement (`#project-menu-btn`): Deck
- Aufnahme einstellen (`#rec-more`): Deck
- Einmessen (`#rs-cal`): Aufnahme-Feld am ●
- − (`#rs-minus`): Aufnahme-Feld am ●
- + (`#rs-plus`): Aufnahme-Feld am ●
- Anteil zum Echo-Bus Drums (`#send-t#-echo`): Fach Mixer
- Anteil zum Hall-Bus Drums (`#send-t#-hall`): Fach Mixer
- Eigene 1 (`#shelf-cat-own`): Regal
- Datei wählen … (`#sing-file`): Fach Editor (Beat/Melodie)
- Töne genau wie gesungenC-MollC♯-MollD-MollD♯-MollE-MollF-MollF♯-MollG- (`#sing-key`): Fach Editor (Beat/Melodie)
- Teilen (`#split-btn`): Inspektor Clip
- Ambient (`#starter-genres button.starter-genre „Ambient“`): Song-Starter
- DnB (`#starter-genres button.starter-genre „DnB“`): Song-Starter
- Hip-Hop (`#starter-genres button.starter-genre „Hip-Hop“`): Song-Starter
- Melodic Techno (`#starter-genres button.starter-genre „Melodic Techno“`): Song-Starter
- Rock (`#starter-genres button.starter-genre „Rock“`): Song-Starter
- Techno (`#starter-genres button.starter-genre „Techno“`): Song-Starter
- Trap (`#starter-genres button.starter-genre „Trap“`): Song-Starter
- Tipps wieder zeigen Tipps (`#tips-reset`): Projekt-Menü
- Lautstärke Drums (`#vol-t#`): Spurkopf
- + (`#zoom-in`): Arranger-Leiste
- − (`#zoom-out`): Arranger-Leiste
- Spuren höher (`#zoomy-in`): Arranger-Leiste
- Spuren niedriger (`#zoomy-out`): Arranger-Leiste

### Nur am Handy zu sehen (36)

- Sonic Pi (`.shelf a „Sonic Pi“`): Regal
- + Link (`.shelf button.shelf-import „Sound über einen Link holen oder Ton aus einem anderen Tab aufnehmen“`): Regal
- Löschen (`#cb-del`): Clipleiste
- Duplizieren Kopie (`#cb-dup`): Clipleiste
- Bearbeiten Editor (`#cb-edit`): Clipleiste
- Pegel (`#cb-levels`): Clipleiste
- Teilen (`#cb-split`): Clipleiste
- (ohne Beschriftung) (`#ed-loop`): Fach Editor (Sample-Editor)
- + Eigene Sounds importieren + Import (`#import-btn`): Regal
- Tonart des Songs (`#key-sel-phone`): Fach Tempo
- Clip-Lautstärke (`#lvl-gain`): Clipleiste
- Einblenden (`#lvl-in`): Clipleiste
- Ausblenden (`#lvl-out`): Clipleiste
- Geschwindigkeit (`#lvl-speed`): Clipleiste
- wie Tonband (`#lvl-speed-tape`): Clipleiste
- FX-Pad (`#mixer-fxpad`): Fach Mixer
- + Beat bauen + Beat (`#new-beat-btn`): Regal
- + Melodie (`#new-melody-btn`): Regal
- ∿ Aus (`#pat-glide-btn`): Fach Editor (Beat/Melodie)
- Schlag 1–2 (`#pat-pages button.pat-page „Schlag #–#, mit Schlägen“`): Fach Editor (Beat/Melodie)
- ▲ (`#pat-vkeys button.vkey-oct „Oktave höher“`): Fach Editor (Beat/Melodie)
- ▼ (`#pat-vkeys button.vkey-oct „Oktave tiefer“`): Fach Editor (Beat/Melodie)
- Länge des Songs in Takten (`#song-length`): Fach Song
- Mastering ein/aus (`#song-mst-on`): Fach Song
- Ausgewogen (`#song-mst-style-balanced`): Fach Song
- Hell (`#song-mst-style-bright`): Fach Song
- Club (`#song-mst-style-club`): Fach Song
- Laut (`#song-mst-style-loud`): Fach Song
- Tempo 120 BPM (`#song-tempo`): Fach Song
- Song (`#tab-song`): Fachleiste
- Sounds (`#tab-sounds`): Fachleiste
- −1 (`#tempo-m1`): Fach Tempo
- −5 (`#tempo-m5`): Fach Tempo
- +5 (`#tempo-p5`): Fach Tempo
- 80 (`#tempo-presets button.key „#“`): Fach Tempo
- Tempo in BPM (`#tempo-slider`): Fach Tempo

### An anderem Ort (17)

| Funktion | Desktop | Handy |
|---|---|---|
| Exportieren (`#export-btn`) | Deck | Fach Song |
| Loop (`#loop-btn`) | Deck | Pillen über den Spuren |
| Klick (`#metro-btn`) | Deck | Pillen über den Spuren |
| Projektname (`#project-name`) | Projekt-Menü | Fach Song |
| Eingangsgerät (`#rs-device`) | Aufnahme-Feld am ● | Fach Song |
| Speichern (`#save-btn`) | Projekt-Menü | Fach Song |
| Nur Favoriten zeigen (`#shelf-fav`) | Regal | Regal (Suchzeile) |
| Länge und Ordnen (`#shelf-filter-btn`) | Regal | Regal (Suchzeile) |
| 1T 37 (`#shelf-filters button.seg[data-len=1]`) | Regal | Regal (Suchzeile) |
| 2T 67 (`#shelf-filters button.seg[data-len=2]`) | Regal | Regal (Suchzeile) |
| 4T 62 (`#shelf-filters button.seg[data-len=4]`) | Regal | Regal (Suchzeile) |
| 8T+ 0 (`#shelf-filters button.seg[data-len=8]`) | Regal | Regal (Suchzeile) |
| Shot 379 (`#shelf-filters button.seg[data-len=shot]`) | Regal | Regal (Suchzeile) |
| Kategorie (`#shelf-filters button.seg[data-sort=cat]`) | Regal | Regal (Suchzeile) |
| Genre (`#shelf-filters button.seg[data-sort=genre]`) | Regal | Regal (Suchzeile) |
| Sounds durchsuchen (`#shelf-search`) | Regal | Regal (Suchzeile) |
| Raster (beim Ziehen Umschalt halten: frei) (`#snap-sel`) | Arranger-Leiste | Pillen über den Spuren |

## Krachwerk: Desktop und Handy im Vergleich

### Nur am Desktop zu sehen (112)

- Beat bauen Schlagzeug in Schritten oder auf Pads (`#create-panel button.ccard[data-create=beat]`): Erstellen
- Loop festhalten Was im Loop klingt, als neuer Sound in die Kiste (`#create-panel button.ccard[data-create=bounce]`): Erstellen
- Datei importieren WAV, MP3, OGG … – oder direkt auf eine Spur ziehen (`#create-panel button.ccard[data-create=import]`): Erstellen
- Melodie schreiben Noten setzen oder auf der Klaviatur spielen (`#create-panel button.ccard[data-create=melody]`): Erstellen
- Audio aufnehmen Stimme oder Instrument als Sound auf eine Spur (`#create-panel button.ccard[data-create=record]`): Erstellen
- Melodie einsingen Summen, singen, pfeifen – wird zu Noten (`#create-panel button.ccard[data-create=sing]`): Erstellen
- Loop-Bereich (`#ex-range-loop`): Fach Export
- Ganzer Song (`#ex-range-song`): Fach Export
- Lautstärke Echo-Bus (`#fader-bus-echo`): Fach Mixer
- Lautstärke Hall-Bus (`#fader-bus-hall`): Fach Mixer
- Stärke50 % (`#fx-comp-amount`): Inspektor Spur
- Ansprache5 ms (`#fx-comp-attack`): Inspektor Spur
- Pegel0 dB (`#fx-comp-gain`): Inspektor Spur
- Kompressor ein/aus (`#fx-comp-on`): Inspektor Song · Inspektor Spur
- Ausklang150 ms (`#fx-comp-release`): Inspektor Spur
- Stärke40 % (`#fx-drive-drive`): Inspektor Spur
- Anteil100 % (`#fx-drive-mix`): Inspektor Spur
- Verzerrer ein/aus (`#fx-drive-on`): Inspektor Song · Inspektor Spur
- Ton7,0 kHz (`#fx-drive-tone`): Inspektor Spur
- ArtWarmHartFuzzBitcrusherAmp CrunchAmp LeadAmp Metal (`#fx-drive-type`): Inspektor Spur
- Wiederholungen35 % (`#fx-echo-feedback`): Inspektor Spur
- Anteil30 % (`#fx-echo-mix`): Inspektor Spur
- Echo ein/aus (`#fx-echo-on`): Inspektor Song · Inspektor Spur
- Zeit1/41/8 punktiert1/81/161/4 punktiert (`#fx-echo-time`): Inspektor Spur
- Höhen0 dB (`#fx-eq-high`): Inspektor Spur
- Tiefen0 dB (`#fx-eq-low`): Inspektor Spur
- Mitten0 dB (`#fx-eq-mid`): Inspektor Spur
- EQ ein/aus (`#fx-eq-on`): Inspektor Song · Inspektor Spur
- Frequenz2,9 kHz (`#fx-filter-cutoff`): Inspektor Spur
- Tiefe50 % (`#fx-filter-depth`): Inspektor Spur
- Bewegungaus4 Takte1 Takt1/21/41/8 (`#fx-filter-lfo`): Inspektor Spur
- Filter ein/aus (`#fx-filter-on`): Inspektor Song · Inspektor Spur
- Resonanz20 % (`#fx-filter-reso`): Inspektor Spur
- ArtTiefpassHochpassBandpass (`#fx-filter-type`): Inspektor Spur
- Anteil25 % (`#fx-hall-mix`): Inspektor Spur
- Hall ein/aus (`#fx-hall-on`): Inspektor Song · Inspektor Spur
- Raumgröße50 % (`#fx-hall-size`): Inspektor Spur
- Tiefe60 % (`#fx-pump-depth`): Inspektor Spur
- Pumpen ein/aus (`#fx-pump-on`): Inspektor Song · Inspektor Spur
- Taktjeder Schlag1/8jeder 2. Schlag (`#fx-pump-rate`): Inspektor Spur
- Rückkehr50 % (`#fx-pump-release`): Inspektor Spur
- FX-Pad (`#fxpad-btn`): Inspektor Song (Werkzeuge)
- ● Kurve aufnehmen (`#fxpad-rec`): Fach FX-Pad
- Bandstopp (`#fxpad-tape`): Fach FX-Pad
- Tonart und Akkorde (`#harm-btn`): Inspektor Song (Werkzeuge)
- − (`#insp button.insp-step.key „Tempo langsamer“`): Inspektor Song
- + (`#insp button.insp-step.key „Tempo schneller“`): Inspektor Song
- Werkbank (`#insp button.insp-toggle „Werkbank“`): Inspektor
- Festhalten (`#insp-bounce`): Inspektor Spur
- mit Effekten (`#insp-bounce-fx`): Inspektor Spur
- Tonart des Songs (`#insp-key`): Inspektor Song
- (ohne Beschriftung) (`#insp-length`): Inspektor Song
- Mastering ein/aus (`#insp-mst-on`): Inspektor Song
- Ausgewogen (`#insp-mst-style-balanced`): Inspektor Song
- Hell (`#insp-mst-style-bright`): Inspektor Song
- Club (`#insp-mst-style-club`): Inspektor Song
- Laut (`#insp-mst-style-loud`): Inspektor Song
- Warm (`#insp-mst-style-warm`): Inspektor Song
- M (`#insp-mute`): Inspektor Spur
- (ohne Beschriftung) (`#insp-pan`): Inspektor Spur
- Anteil zum Echo-Bus (Doppelklick = aus) (`#insp-send-echo`): Inspektor Spur
- Anteil zum Hall-Bus (Doppelklick = aus) (`#insp-send-hall`): Inspektor Spur
- S (`#insp-solo`): Inspektor Spur
- Feinheiten (`#insp-track-fine`): Inspektor Spur
- (ohne Beschriftung) (`#insp-vol`): Inspektor Song · Inspektor Spur
- ? Tastenkürzel ? Gesten (`#keys-btn`): Inspektor Song (Werkzeuge)
- ‹ (`#kiste-toggle`): Regal
- × (`#library button.loop-del „×“`): Regal
- ★ (`#library button.loop-fav „★“`): Regal
- Four to the Floor 1 Takt (`#library button.loop-item`): Regal
- Klick (`#metro-btn`): Inspektor Song (Werkzeuge)
- Mixer (`#mixer-btn`): Inspektor Song (Werkzeuge)
- Leeren (`#new-btn`): Projekt-Menü
- Öffnen (`#open-btn`): Projekt-Menü
- U (`#pat-keybed button.black.pat-key „A♯#“`): Fach Editor (Beat/Melodie)
- W (`#pat-keybed button.black.pat-key „C♯#“`): Fach Editor (Beat/Melodie)
- E (`#pat-keybed button.black.pat-key „D♯#“`): Fach Editor (Beat/Melodie)
- T (`#pat-keybed button.black.pat-key „F♯#“`): Fach Editor (Beat/Melodie)
- Z (`#pat-keybed button.black.pat-key „G♯#“`): Fach Editor (Beat/Melodie)
- A C4 (`#pat-keybed button.c.pat-key „C#“`): Fach Editor (Beat/Melodie)
- H (`#pat-keybed button.pat-key „A#“`): Fach Editor (Beat/Melodie)
- S (`#pat-keybed button.pat-key „D#“`): Fach Editor (Beat/Melodie)
- D (`#pat-keybed button.pat-key „E#“`): Fach Editor (Beat/Melodie)
- F (`#pat-keybed button.pat-key „F#“`): Fach Editor (Beat/Melodie)
- G (`#pat-keybed button.pat-key „G#“`): Fach Editor (Beat/Melodie)
- J (`#pat-keybed button.pat-key „H#“`): Fach Editor (Beat/Melodie)
- ◀ (`#pat-oct-down`): Fach Editor (Beat/Melodie)
- ▶ (`#pat-oct-up`): Fach Editor (Beat/Melodie)
- Quantisieren (`#pat-quantize`): Fach Editor (Beat/Melodie)
- Tonleiter (`#pat-scale`): Fach Editor (Beat/Melodie)
- Beispiel-Arrangement (`#project-menu-btn`): Deck
- Anteil zum Echo-Bus Drums (`#send-t#-echo`): Fach Mixer
- Anteil zum Hall-Bus Drums (`#send-t#-hall`): Fach Mixer
- Dinge 2 (`#shelf-cat-dinge`): Regal
- Strom 1 (`#shelf-cat-strom`): Regal
- Datei wählen … (`#sing-file`): Fach Editor (Beat/Melodie)
- Töne genau wie gesungenC-MollC♯-MollD-MollD♯-MollE-MollF-MollF♯-MollG- (`#sing-key`): Fach Editor (Beat/Melodie)
- Zurücksetzen (`#wb-farbe-reset`): Werkbank
- Feinheiten (`#wb-fine-btn-clip`): Werkbank
- Feinheiten (`#wb-fine-btn-farbe`): Werkbank
- Körnung (`#wb-grain`): Werkbank
- Bumm 1 (`#wb-name`): Werkbank
- ½× (`#wb-panel-clip button.key[data-speed=0.5]`): Werkbank
- 1× (`#wb-panel-clip button.key[data-speed=1]`): Werkbank
- 2× (`#wb-panel-clip button.key[data-speed=2]`): Werkbank
- Muster bearbeiten (`#wb-pattern`): Werkbank
- Resonanz (`#wb-res`): Werkbank
- Zurücksetzen (`#wb-ton-reset`): Werkbank
- Autotune (`#wb-tune`): Werkbank
- ⤢ (`#wb-wide`): Inspektor
- Zurückholen (`#wk-restore`): Inspektor Song
- Sichern (`#wk-save`): Inspektor Song

### Nur am Handy zu sehen (30)

- Werkbank (`#cf-werkbank`): Werkzeug am Clip
- + Eigene Sounds importieren + Import (`#import-btn`): Regal
- Tonart des Songs (`#key-sel-phone`): Fach Tempo
- FX-Pad (`#mixer-fxpad`): Fach Mixer
- + Beat bauen + Beat (`#new-beat-btn`): Regal
- + Melodie (`#new-melody-btn`): Regal
- ∿ Aus (`#pat-glide-btn`): Fach Editor (Beat/Melodie)
- Schlag 1–2 (`#pat-pages button.pat-page „Schlag #–#, mit Schlägen“`): Fach Editor (Beat/Melodie)
- ▲ (`#pat-vkeys button.vkey-oct „Oktave höher“`): Fach Editor (Beat/Melodie)
- ▼ (`#pat-vkeys button.vkey-oct „Oktave tiefer“`): Fach Editor (Beat/Melodie)
- Länge des Songs in Takten (`#song-length`): Fach Song
- Mastering ein/aus (`#song-mst-on`): Fach Song
- Ausgewogen (`#song-mst-style-balanced`): Fach Song
- Hell (`#song-mst-style-bright`): Fach Song
- Laut (`#song-mst-style-loud`): Fach Song
- Warm (`#song-mst-style-warm`): Fach Song
- Tempo 120 BPM (`#song-tempo`): Fach Song
- Sounds (`#tab-sounds`): Fachleiste
- Werkbank (`#tab-werkbank`): Fachleiste
- −1 (`#tempo-m1`): Fach Tempo
- −5 (`#tempo-m5`): Fach Tempo
- +1 (`#tempo-p1`): Fach Tempo
- +5 (`#tempo-p5`): Fach Tempo
- 80 (`#tempo-presets button.key „#“`): Fach Tempo
- Tempo in BPM (`#tempo-slider`): Fach Tempo
- Ende im Original (`#wb-end-num`): Werkbank
- Zurücksetzen (`#wb-form-reset`): Werkbank
- Auf Spitze (`#wb-peak`): Werkbank
- Anfang im Original (`#wb-start-num`): Werkbank
- Stille abschneiden (`#wb-trim`): Werkbank

### An anderem Ort (13)

| Funktion | Desktop | Handy |
|---|---|---|
| Exportieren (`#export-btn`) | Deck | Fach Song |
| Loop (`#loop-btn`) | Deck | Pillen über den Spuren |
| Abspielen (`#play-btn`) | Deck | Fachleiste |
| Projektname (`#project-name`) | Projekt-Menü | Fach Song |
| Aufnahme (`#rec-btn`) | Deck | Fachleiste |
| Einmessen (`#rs-cal`) | Inspektor Song (Werkzeuge) | Fach Song |
| Eingangsgerät (`#rs-device`) | Inspektor Song (Werkzeuge) | Fach Song |
| − (`#rs-minus`) | Inspektor Song (Werkzeuge) | Fach Song |
| + (`#rs-plus`) | Inspektor Song (Werkzeuge) | Fach Song |
| Speichern (`#save-btn`) | Projekt-Menü | Fach Song |
| + Neu (`#shelf-new`) | Regal | Regal (Suchzeile) |
| Sounds durchsuchen (`#shelf-search`) | Regal | Regal (Suchzeile) |
| Raster (beim Ziehen Umschalt halten: frei) (`#snap-sel`) | Arranger-Leiste | Pillen über den Spuren |

## Tastenkürzel

Aus der Kürzel-Liste der Seite (`#keys-pop`).

| Taste | Wirkung |
|---|---|
| Leertaste | Abspielen / Pause |
| Pos1 | Zum Anfang |
| Esc | Fach schließen, Auswahl aufheben |
| Strg+Z / Strg+⇧+Z | Rückgängig / Wiederholen |
| T | Clip an der Abspielmarke teilen |
| R | Aufnahme starten / beenden |
| ⇧+R | Gewählte Spur für die Aufnahme scharf schalten |
| A | Kurve der gewählten Spur öffnen oder schließen, ohne Auswahl die Summen-Kurve (Klick setzt einen Punkt, Doppelklick löscht) |
| Rahmen ziehen | Mehrere Clips auswählen (Umschalt: hinzufügen) |
| ⇧+Klick | Clip zur Auswahl hinzufügen oder herausnehmen |
| Strg+A | Alle Clips auswählen |
| Strg+D | Clip(s) duplizieren |
| Entf | Clip löschen |
| Alt+Ziehen | Clip oder Spur kopieren |
| ⇧+Ziehen | Ohne Raster ziehen |
| Alt+← / Alt+→ | Clip um einen Rasterschritt schieben |
| Strg+Mausrad | Zeit zoomen |
| Alt+Mausrad | Spurhöhe ändern |
| Rollbalken-Enden | Ziehen zoomt (unten Zeit, rechts Spurhöhe), der Daumen scrollt |
| A+S+D+F+G+H+J+K | Pads spielen (halten = Wirbel) |
| A+W+S+E+D / K | Klaviatur (halten = langer Ton), ↑↓ Oktave |

Nur im Code, nicht in der Liste (`src/main.js`):

| Taste | Wirkung | im Code gefunden |
|---|---|---|
| Strg+Y | Wiederholen (wie Strg+⇧+Z) | ja |
| Rücktaste | Clip löschen (wie Entf) | ja |
| F / ⇧+F | Festhalten: Auswahl, Loop oder gewählte Spur (Umschalt: nur in die Kiste); nur Krachwerk | ja |
| Alt+↑ / Alt+↓ | Take-Clip: voriger bzw. nächster Take | ja |

## Gesten

Aus der Gesten-Liste der Seite (`#keys-pop`).

| Geste | Wirkung |
|---|---|
| Antippen | Sound hören und auswählen, Clip auswählen |
| Ausgewählten Clip ziehen | Verschieben, an den Rändern kürzen oder verlängern |
| Lange drücken | Clip zur Auswahl hinzufügen, danach weitere antippen |
| Lange drücken, dann ziehen | Auf freier Fläche: Rahmen um mehrere Clips |
| Zwei Finger | Auseinander und zusammen: zoomen – nebeneinander die Zeit, übereinander die Spurhöhe |
| Rollbalken | Daumen ziehen scrollt, die Enden ziehen zoomt (Zeit unten, Spurhöhe rechts) |
| Lineal | Antippen setzt die Marke, Ziehen markiert den Loop |
| Spurname antippen | Umbenennen |
| Piano-Roll | Antippen setzt oder löscht eine Note, lange drücken und ziehen verschiebt sie |
| Kurve | Spur-Menü ⋯ → Kurve: Antippen setzt einen Punkt, einen Punkt ziehen verschiebt ihn, Halten löscht ihn. Summe: Fach „Song“ → Einblenden/Ausblenden |

Abweichende Listen: Krachwerk Desktop, Krachwerk Handy (siehe JSON, Schlüssel `kuerzel`).

## Nicht hergestellte Zustände

- loopwerk-desktop-werkbank: Werkbank gibt es nur in Krachwerk
- loopwerk-handy-projekt-menue: Projekt-Menü: Knopf hier nicht zu sehen
- loopwerk-handy-aufnahme-feld: Aufnahme-Feld: Knopf hier nicht zu sehen
- loopwerk-handy-kuerzel: Kürzel-Liste: Knopf hier nicht zu sehen
- loopwerk-handy-erstellen: Erstellen: kein Einstieg zu sehen
- loopwerk-handy-werkbank: Werkbank gibt es nur in Krachwerk
- krachwerk-desktop-aufnahme-feld: Aufnahme-Feld: Knopf hier nicht zu sehen
- krachwerk-desktop-kuerzel: Kürzel-Liste: Knopf hier nicht zu sehen
- krachwerk-desktop-clip-editor: Sample-Editor fehlt in Krachwerk (dort die Werkbank)
- krachwerk-desktop-mastering: Mastering liegt hier nicht in Inspektor/Song-Fach (nur im Export-Fach)
- krachwerk-handy-projekt-menue: Projekt-Menü: Knopf hier nicht zu sehen
- krachwerk-handy-aufnahme-feld: Aufnahme-Feld: Knopf hier nicht zu sehen
- krachwerk-handy-kuerzel: Kürzel-Liste: Knopf hier nicht zu sehen
- krachwerk-handy-clip-editor: Sample-Editor fehlt in Krachwerk (dort die Werkbank)

