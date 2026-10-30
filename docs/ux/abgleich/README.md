# Abgleich App 2.0 ↔ Konzept „Werkstück“

Stand 30.10.2026 (Zeilenangaben in `index.html` sind ungefähr, die Datei ist in Arbeit). Ich habe die laufende App (Version 2.0) mit dem Mockup `docs/ux/richtungen/b-werkstueck.html` und der Spec `docs/specs/v2.0-werkstueck.md` verglichen. Aufgenommen mit Playwright (2×), dunkel und hell, Desktop 1536×960 und Handy 390×844. Zustände: Start, Clip gewählt, Sounds, Erstellen, Mixer, Beat-Editor (Schritte und Pads, Pad gehalten), Melodie-Editor, Sample-Editor, Export, „Mehr“, Link-Feld, Einblender, Tipps und Ladescreen (ohne webdriver).

**Kurzurteil:** Das Herz sitzt. Tokens (dunkel), Display, Gummitasten, Clips mit Etikett und LED-Wellenform, Schrittraster, Pads und Ladescreen treffen das Konzept genau. Die Abweichungen sitzen in den Teilen, die das Mockup nicht gezeigt hat und die noch das alte Formular-Vokabular sprechen: native Schieber, Auswahllisten, Radios, iOS-Schalter, Pillen, Emoji. Dort leuchtet Orange auf Flächen, die weder Transport noch aktiv sind. Und im Hell-Modus ist das Signal-Orange zu Rost gedimmt.

## Vergleichsbilder

| Datei | Inhalt |
|---|---|
| `01-geruest-desktop.png` | Mockup gegen App, Desktop dunkel, Gesamtbild |
| `02-inspektor.png` | Inspektor: Drehregler und LED-Effekte gegen Schieber und Schalter |
| `03-regal.png` | Regal: Segment-Mulde und Zeilen mit Taste und Mini-Welle |
| `04-beat-editor.png` | Beat-Editor: Mockup, App mit Schritten, App mit gehaltenem Pad |
| `05-hell-akzent.png`, `05b-hell-pad.png` | Orange dunkel gegen hell (Deck, Display, Pad) |
| `06-handy.png` | Handy: Mockup gegen Start, Pads, Schritte |
| `07-mixer.png` | Mixer Desktop und Handy (orange Fader) |
| `08-melodie-sample.png`, `08b-handy-tasten.png` | Rosa Noten und Wellenform, Klaviertasten |
| `09-export-link.png` | Export-Klappfeld, Link-Feld, Einblender |
| `10-handy-kleinteile.png` | Clip-Leiste (abgeschnitten), Regal-Knöpfe, Taktseiten |

---

## A · Sticht ins Auge

### A1 · Orange auf Flächen, die weder Transport noch aktiv sind
- **Ort:** `.insp-row input[type=range]` (`index.html` ~965), `.strip-fader` (692, 1552), `.ed-inline input[type=range]` (804), `.fxl-switch[aria-pressed]` (985), `#export-btn` (1049), `.dbtn.primary` (734, 1512: Übernehmen, Holen, Exportieren im Klappfeld), `.tip-ok` (1019), `.hint-done` (859, 1573).
- **Ist:** Jeder Schieber hat eine orange Füllung und einen orangen Knopf: im Inspektor 5 Stück, im Mixer 9 Fader in voller Höhe (`07-mixer.png`). Dazu kommen orange getönte oder volle Primärknöpfe. Im Mixer ist Orange die größte Farbfläche der ganzen App.
- **Soll:**
  - Schieber im Werkstück-Stil: Rinne `background: var(--well); box-shadow: var(--well-shadow); height: 4px; border-radius: 2px`, ohne farbige Füllung. Griff als kleine Gummitaste: 14×22 px, `border-radius: 3px`, `background: var(--key-face); box-shadow: var(--key-shadow)`, mittig eine 2-px-Linie in `var(--ink)`. Orange nur während des Ziehens (`:active`): Wertanzeige in `var(--amber)`.
  - Fader im Mixer: dieselbe Rinne senkrecht (6 px), Kappe 30×16 px als Taste mit Ink-Linie. Daneben der Pegel als LED-Säule (`--meter-ok/warm/hot`, aus `--meter-off`). Orange gibt es dort nicht.
  - Primärknopf = helle Taste wie `.k.cta` im Mockup: `background: var(--ink); color: var(--panel); box-shadow: inset 0 -2px 0 rgb(0 0 0 / .2)`. Hell wird daraus automatisch eine Graphit-Taste (16,7 : 1). Das gilt für `#export-btn`, `.dbtn.primary`, `.tip-ok` und `.hint-done`.
  - Effekt-Schalter: siehe B3.
- **Warum:** Die Spec sagt „genau eine Signalfarbe“. Sie trägt nur, wenn sie selten ist. Heute leuchten Inspektor und Mixer im Ruhezustand orange, und Play, Display-Takt, aktive Pads sowie Solo verlieren ihre Wirkung.

### A2 · Hell-Modus: Orange wird zu Rost, Display und Pads fallen unter AA
- **Ort:** `:root { --amber: #C2410C }` (hell, Zeile 92), wirkt auf `.key.play`, `.lcd-cell:first-child .lcd-value`, `.pat-pad.held`, LEDs, Abspielmarke.
- **Ist:** Die Play-Taste und das gehaltene Pad sind rostbraun (`05-hell-akzent.png`, `05b-hell-pad.png`). Gemessen: Takt „005“ auf dem schwarzen Display 3,89 : 1, „Kick“ (`#140600`) auf gehaltenem Pad 3,84 : 1. Beides liegt unter AA. Das Display soll laut Spec „immer schwarz“ bleiben. Dann muss auch seine Schrift gleich bleiben.
- **Soll:** Das Token aufteilen.
  - `--amber: #FF5B1F` in beiden Modi für Flächen, LEDs, Display, Abspielmarke und Pads. Auf `#070707` ergibt das 6,49 : 1, `#140600` auf Orange 6,41 : 1.
  - Neu `--amber-ink`: dunkel `#FF5B1F`, hell `#A93305` (5,1–6,0 : 1 auf allen hellen Flächen). Damit laufen Text und Linien in Orange auf hellem Grund: `.insp-link`, `.loop-fav.on`, `.key[aria-pressed] { color }`, `.tip-step`.
  - `--accent-ink` bleibt `#140600`.
- **Warum:** Das „silberne Gehäuse“ lebt davon, dass Display und LEDs dieselben Bauteile sind wie im dunklen Gerät. Nur Text auf Silber braucht ein dunkleres Orange. Das Konzept sah das schon vor (README: „Akzent als Text #B83706“).

### A3 · Gehäuse in Karten zerlegt statt bündig mit Haarlinien
- **Ort:** `@media (min-width: 761px) .app { gap: 8px; padding: 8px }` (1032), `.deck/.shelf/.arranger/.insp { border-radius: var(--radius); border: 1px solid var(--line) }`.
- **Ist:** Vier abgerundete Karten schweben mit 8 px Abstand auf dem Punktraster (`01-geruest-desktop.png`). Das wirkt wie ein Web-Dashboard.
- **Soll:** Am Desktop `.app { gap: 1px; padding: 0; background: var(--line) }` mit `border: 0; border-radius: 0` für Deck, Regal, Arranger und Inspektor (Mockup `.desk .app`). Das Punktraster bleibt nur in den Spuren (`.lane::before`). Die Schublade behält `border-radius: 10px 10px 0 0`. Am Handy bleibt alles, wie es ist (dort ist es schon bündig).
- **Warum:** Das ist die Leitidee „ein Gerät“: eine Platte mit Fugen, keine Kacheln. Der Umbau ist klein (Gerüst-Regeln), und das Layout ändert sich nicht.

### A4 · Native Formularelemente brechen die Materialität
- **Ort:** `select` (Raster, Takte, Kit, Klang, Autotune-Tonart, Projekt), `input[type=radio|checkbox]` (Export, „Roboter“, „Ausklingen“), `.fxl-switch` (iOS-Schalter im Inspektor).
- **Ist:** Systemblaue Radios und Häkchen im Export (`09-export-link.png`), runde Pillen-Schalter, Auswahllisten in Archivo mit System-Pfeil („Kit Elektro (synthetisch)“).
- **Soll:**
  - `select` wie `.sel-k` im Mockup: `appearance: none; height: 32px; padding: 0 28px 0 10px; border-radius: 6px; background: var(--well); box-shadow: inset 0 0 0 1px var(--line); font: 500 9.5px/1 var(--font-mono); text-transform: uppercase`. Die Beschriftung steht in der Mulde in `--muted` („KIT ELEKTRO“), der Pfeil als 10-px-SVG in `currentColor` mit `opacity: .6`.
  - Export: Format und Bereich als Segment-Mulde (`.seg` wie Schritte|Pads: „WAV | MP3“, „SONG | LOOP“). Die Zusatzinfo („16 Bit, 44,1 kHz“) steht als Mono-Zeile darunter. Häkchen als LED-Taste (`.key[aria-pressed]` mit LED). Fieldset-Rahmen fallen weg, stattdessen Abschnitts-Label 9px Mono.
  - Wenigstens sofort: `accent-color: var(--amber)` für alle übrigen Radios und Checkboxen, damit kein Systemblau mehr erscheint.
- **Warum:** Systemblau ist die einzige Fremdfarbe im Bild und durchbricht „nur über Tokens“. Native Steuerungen sehen in jedem Browser anders aus.

### A5 · Typografie: Rollen von Archivo und Martian Mono vertauscht
- **Ort:** `.insp-title` (959: `700 18px var(--font-display)`), `.project-menu-btn` (die spätere `.key`-Regel in der Stil-Schicht überschreibt `font-body`), `.insp-row` (Labels „Lautstärke“, „Einblenden“ in Archivo 12px), `.pat-field` („Takte“, „Kit“, „Klang“), `.ltab`, `.ed-tab`, `.tip-btns button`, `.shelf-import`, `.pat-page-main`, `.hint`.
- **Ist:** Namen von Song, Clip und Projekt stehen in Mono in gemischter Schreibung („Four to the Floor“, „Beispiel-Arrangement“). Geräte-Beschriftungen stehen dagegen in Archivo („Ordnen:“, „Takte“, „Lautstärke“, „Keine Tipps mehr“, „Schneiden“). Außerdem fordert `700` Martian Mono an, die nur bis 600 geladen ist.
- **Soll:** Eine Regel für alles:
  - **Archivo = Inhalt:** Namen (Song, Spur, Clip, Sound, Pad) und Fließtext. `.insp-title { font: 600 21px/1.1 var(--font-body); letter-spacing: -0.01em }`, `.project-menu-btn { font: 600 13px/1 var(--font-body) }` (in der Stil-Schicht, damit `.key` es nicht überschreibt).
  - **Martian Mono, Großschrift = Gerät:** Beschriftungen, Werte, Tasten, Reiter. Labels `500 8.5–9px`, Laufweite `0.08–0.1em`, Farbe `--muted`. Werte `500 11px`, `tabular-nums`. Tasten `500 9.5–10.5px`, `0.04em`.
  - Alle `font-weight: 700` mit `--font-display` auf `600` setzen.
- **Warum:** Diese Trennung ist die Typo-Idee des Konzepts: Mono ist die Beschriftung auf dem Gerät, Archivo ist das, was du hineinlegst. Gemischt gesetzte Mono-Namen wirken wie Code.

### A6 · LED-Lauflicht im Schrittraster fehlt
- **Ort:** `src/ui/pattern-editor.js` (kein Zustand für den laufenden Schritt), CSS fehlt.
- **Ist:** Beim Anhören, Live-Spielen und Abspielen eines Pattern-Clips zeigt das Raster nicht, wo der Schritt gerade steht. Im Mockup ist das die orange umrandete Spalte (`.stp.now`), und die Richtungs-README nennt es als eines von vier „verspielten“ Elementen.
- **Soll:** Spalte `.pat-cell.now { outline: 2px solid var(--amber); outline-offset: 1px }`, gesetzte Schritte in der Spalte `filter: brightness(1.15)`. Die Position kommt per `requestAnimationFrame` aus `ctx.currentTime` (Regel: kein `setTimeout`). Bei `prefers-reduced-motion` bleibt es stehen, denn es ist Information und keine Deko. Dasselbe gilt für eine 2-px-Abspielmarke in `--amber` in der Piano-Roll.
- **Warum:** Hier ist das Gerät am meisten „Instrument“. Ohne Lauflicht fühlt sich der Beat-Editor wie ein Formular an.

### A7 · Fremdfarben: rosa Noten und Wellenform, blaugraue Klaviertasten
- **Ort:** `src/ui/pattern-editor.js:300` (`const noteCol = col('--cat-own')`), `#ed-wave { --wave: var(--cat-own) }` (736), `--key-white/--key-black/*-ink` (nur in hellem `:root`, Zeile 126).
- **Ist:** Melodie-Clips sind lila, ihre Noten in der Piano-Roll aber rosa. Ein grüner Pad-Clip erscheint im Sample-Editor rosa (`08-melodie-sample.png`). Die Klaviertasten sind Reinweiß mit blaugrauem Schwarz (`#1d2330`). Im dunklen Modus blenden sie (`08b-handy-tasten.png`).
- **Soll:**
  - Noten in `var(--cat)` des Patterns, die Wellenform in `var(--cat)` des bearbeiteten Clips (Klasse `cat-*` am Editor setzen). Die gewählte Note bekommt einen 2-px-Ring in `--ink`, nicht in einer anderen Farbe.
  - Tasten-Tokens im Werkstück: dunkel `--key-white: #CFCAC0; --key-white-ink: #4A463F` (5,7 : 1), `--key-black: #0B0B0B; --key-black-ink: #8F8A80` (5,7 : 1). Hell `--key-white: #FBFAF7; --key-white-ink: #5F5B54` (6,5 : 1), `--key-black: #141414; --key-black-ink: #A39E94` (6,9 : 1).
  - Gedrückte Taste: `var(--amber)` (aktiv).
- **Warum:** Kategoriefarbe heißt „dieser Inhalt“. Wenn sie zwischen Arranger und Editor wechselt, verliert sie ihre Bedeutung. Das Blaugrau stammt aus dem alten Look.

### A8 · Emoji und Textzeichen als Icons
- **Ort:** `index.html` 1855–1861, 1875, 1894, 1937, 1740. `src/ui/pattern-editor.js` 888/901/912/962, `src/ui/link-import.js:83`. `#pat-play::before` und `#pat-live::before` (1213).
- **Ist:** „✨ Weiterführen“ und „🎤 Einsingen“ (farbige Emoji, je nach System anders), dazu „▶ Anhören“, „● Live“, „■ Live stoppen“, „● Ton aus einem Tab aufnehmen“ als Schriftzeichen in der Mono.
- **Soll:** Dieselben 16-px-SVG-Icons wie im Deck (`currentColor`, 13 px in `.dbtn`, `gap: 7px`). Für Aufnahme und Live eine echte LED statt „●“: `::before { width: 7px; height: 7px; border-radius: 50%; background: var(--meter-hot); box-shadow: 0 0 8px var(--meter-hot) }` (Mockup `.k.live`). Für Weiterführen ein Funken-Icon in 2-px-Strichen, ohne Farbe.
- **Warum:** Emoji sind der deutlichste Bruch mit der Gerät-Anmutung und sehen auf Android, iOS und Windows jeweils anders aus.

### A9 · Handy: Clip-Leiste schneidet ab
- **Ort:** `.clipbar-btns .key` (1354ff., `600 10px` Mono).
- **Ist:** „DUPLIZIERE“ ist abgeschnitten, „BEARBEITEN“ stößt an den Rand (`10-handy-kleinteile.png`). Gemessen: „DUPLIZIEREN“ ist in 10 px Martian Mono 77 px breit, die Taste 72 px.
- **Soll:** `font: 500 8.5px/1 var(--font-mono); letter-spacing: 0; padding-inline: 3px` (ergibt 65 px) oder das kürzere Wort „KOPIE“. Das Icon bleibt 20 px. Die Tippfläche bleibt 72×≥52 px.
- **Warum:** Abgeschnittene Beschriftungen sehen nach Fehler aus, und zwar an der Stelle, die am Handy am häufigsten zu sehen ist.

---

## B · Fällt auf

### B1 · Abspielmarke ohne Kappe, Lineal ohne Striche
- **Ort:** `.playhead::before` (628: `top: 18px`, liegt unter dem Lineal), `.bar-mark`.
- **Ist:** Die Marke beginnt unter dem Lineal, das orange Dreieck ist nicht zu sehen. Das Lineal zeigt nur Zahlen.
- **Soll:** Marke und Kappe liegen über dem Lineal (`z-index` über `.ruler`, Kappe `top: 0`, 12×9 px). Taktstrich `.bar-mark::before { left: 0; bottom: 0; width: 1px; height: 8px; background: color-mix(in srgb, var(--muted) 45%, transparent) }`, Schläge 4 px in `--grid-bar`.
- **Warum:** Die Kappe ist der Griff der Marke und zeigt, wo „jetzt“ ist. Striche machen das Lineal zu einer Skala.

### B2 · Einblender als Pille
- **Ort:** `.hint` (848: `border-radius: 22px`), `.hint-done` (`18px`).
- **Ist:** Eine weiche Pille in Archivo (`09-export-link.png`). Das Konzept erlaubt 4–10 px Radius.
- **Soll:** Ein Display-Streifen: `border-radius: 6px; background: var(--lcd-face); box-shadow: var(--lcd-shadow); color: var(--display-ink)`. Text in Archivo 13px, links eine 6-px-LED in `--amber`. Knopf „Fertig“ als helle Taste (A1). Gleich im Hell-Modus, denn das Display bleibt schwarz.
- **Warum:** Rückmeldungen kommen vom Gerät, und das Gerät spricht über sein Display. Das ist die schönste Stelle, um das Display-Motiv weiterzutragen.

### B3 · Inspektor-Effekte: iOS-Schalter statt LED-Liste
- **Ort:** `.fxl-head`, `.fxl-switch`, `.fxl-sum` („aus“).
- **Ist:** Eine Liste in voller Breite mit Pillen-Schaltern und dem Wort „aus“ (`02-inspektor.png`).
- **Soll:** Wie im Mockup: ein Raster mit 2 Spalten und `gap: 6px`. Jede Zelle ist 34 px hoch, `border-radius: 6px`, `background: var(--clip-body)` (dunkel #1B1B1B), `box-shadow: inset 0 0 0 1px var(--line)`, darin eine LED (7 px, `--led-off` / `--amber` mit Schein) und der Name in Archivo 12px. „Ein“ heißt: LED leuchtet und Rand `--muted` 40 %. So ist der Zustand auch ohne Farbe erkennbar. Klappt man eine Zelle auf, öffnen sich die Parameter darunter über beide Spalten.
- **Warum:** Spart die halbe Höhe, und die LED ist das Bauteil, das das Konzept für „an“ vorsieht.

### B4 · Inspektor: Schieber statt Drehregler, Aktionen uneinheitlich
- **Ort:** `src/ui/inspector.js`, `.insp-btns`.
- **Ist:** Lautstärke, Panorama und Ein-/Ausblenden sind Schieber. Nur „Teilen“ hat ein Icon. „Löschen“ ist nicht als gefährlich zu erkennen.
- **Soll:** Lautstärke und Panorama als Drehregler-Zelle `.kn-row` (36-px-Regler mit Skalenbogen, daneben Label 8.5px Mono und Wert 11px Mono). `knob.js` gibt es schon. Ein-/Ausblenden darf Schieber bleiben, aber im Stil aus A1. Alle vier Aktionen mit 13-px-Icon. Löschen: `color: var(--meter-hot)` für Icon und Text.
- **Warum:** Drehregler in Spurkopf und Mixer, Schieber im Inspektor: dieselbe Größe sähe an drei Stellen dreimal anders aus.

### B5 · Reiter Sounds|Erstellen und Sample-Editor als Unterstrich
- **Ort:** `.ltab` (1062), `.ed-tab` (1106).
- **Ist:** Ein orange unterstrichener Reiter in Web-Optik. `.ed-tab` steht in Archivo.
- **Soll:** Segment-Mulde wie `.shelf-sort`/`.pat-view`: `padding: 3px; border-radius: 8px; background: var(--well); box-shadow: var(--well-shadow)`, der aktive Reiter `background: var(--key-face); box-shadow: var(--key-shadow); color: var(--ink)` mit LED 5 px (Mockup `.seg .on::before`). Schrift 500 10px Mono in Großbuchstaben.
- **Warum:** In der App gibt es heute drei Reiter-Arten (Unterstrich, Mulde, Fachleiste). Das Konzept kennt zwei: Mulde für Umschalter und Fachleiste für Schubladen.

### B6 · Regal-Zeilen: nackte Dreiecke, keine Mini-Welle
- **Ort:** `.loop-play` (407), `.loop-item`.
- **Ist:** Jede Zeile hat ein farbiges Dreieck und keine Welle (`03-regal.png`). Bei 28 Drums ergibt das eine gelbe Säule aus Dreiecken.
- **Soll:** Wie `.snd` im Mockup: Vorhör-Taste 24×24 px (`--key-face`, Dreieck 9 px in `--ink`). Beim Vorhören wird sie orange (`--amber`, Symbol `--accent-ink`), denn das ist aktiv. Dazu eine Mini-LED-Welle 38×10 in `--cat` mit `opacity: .55`, auf `1` beim Vorhören. Länge 9px Mono.
- **Warum:** Die Farbe steht schon im Gruppenkopf. In der Zeile trägt sie keine Information mehr und macht die Liste laut.

### B7 · Handy: „+ Import / + Link / + Beat / + Melodie“ gestrichelt und rosa
- **Ort:** `.shelf-import` (718: `1px dashed color-mix(--cat-own …)`).
- **Ist:** Rosa gestrichelte Kästen in Archivo (`10-handy-kleinteile.png`).
- **Soll:** Gummitasten: `background: var(--key-face); box-shadow: var(--key-shadow); border: 0; border-radius: 6px; height: 44px; font: 500 9.5px/1 var(--font-mono); text-transform: uppercase`, „+“ als 12-px-Icon. Gestrichelt bleibt nur für Ablageziele (Drag & Drop).
- **Warum:** Gestrichelt heißt „hier ablegen“ und nicht „drück mich“.

### B8 · Handy: Taktseiten „Schlag 1–2 | 3–4“ in Drum-Gelb
- **Ort:** `.pat-page[aria-pressed]` (782).
- **Ist:** Die aktive Seite ist gelb umrandet und gelb getönt (`10-handy-kleinteile.png`). Gelb heißt in der App aber „Drums“ oder „Schritt gesetzt“.
- **Soll:** Eine Segment-Mulde mit zwei Tasten, die aktive mit `--key-face` und oranger LED. Text `500 9.5px` Mono: „SCHLAG 1–2“. Der Punkt für „hat Schläge“ bleibt `--cat`, 5 px, oben rechts.
- **Warum:** Aktiv heißt Orange plus LED. Eine Kategoriefarbe für einen Bedienzustand verwechselt man mit gesetzten Schritten.

### B9 · Pads: Beschriftung und Proportion
- **Ort:** `.pat-pad`, `.pat-pad-key`.
- **Ist:** Der Name steht mittig, die Taste darunter, Nummern fehlen. Am Desktop sind die Pads 290×140 px groß, am Handy gibt es 2 Spalten (`04-beat-editor.png`, `06-handy.png`).
- **Soll:** Oben links Nummer und Taste `500 9px` Mono `--muted` („01 · A“), unten links der Name in Archivo 600 12.5px (`justify-content: space-between`). Desktop: Pads höchstens 128 px quadratisch, 4×2. Ab 1200 px Schubladenbreite Pads und Schritte nebeneinander wie im Mockup. Handy: 4 Spalten mit 96 px Höhe (Tippziel 84×96).
- **Warum:** Hardware-Pads tragen ihre Beschriftung am Rand, damit die Mitte zum Schlagen frei bleibt. Kleinere Pads lassen am Handy Platz für das Schrittraster darunter wie im Mockup.

### B10 · Hell: Bass-Etikett unter AA
- **Ort:** hell `--cat-bass: #2F6BEF`.
- **Ist:** `#111` auf Bass-Blau 4,02 : 1 bei 9.5px Etikettschrift.
- **Soll:** `--cat-bass: #3D7BFF` auch hell (4,92 : 1, gegen `--panel` 3,48 : 1 als Fläche). Grenzwertig bleibt Synth hell `#7C6AF0` (4,66). Besser ist `#8A7CF2` (5,62).
- **Warum:** Die Etiketten sind die meistgelesene Schrift im Arranger.

### B11 · Export-Knopf und Klappfeld
- **Ort:** `#export-btn` (1049), `#export.dock`.
- **Ist:** Orange getönter Knopf. Das Klappfeld legt sich halb über den Inspektor, mit Fieldsets und Fußnote.
- **Soll:** `#export-btn` als helle CTA-Taste mit Upload-Icon (Mockup `.k.cta`). Das Klappfeld ist am Knopf rechts bündig, `border-radius: 10px`, `background: var(--sheet-bg)`, `box-shadow: var(--sheet-shadow)`, mit einem 8-px-Pfeil zum Knopf. Inhalt nach A4. Die Fußnote steht 9px Mono in `--muted`.

### B12 · Tipps
- **Ort:** `.tip` (1007), `.tip-btns button` (1018), `.tip-target`.
- **Ist:** Orange Rahmen, 4-px-Schein in Orange, Knöpfe in Archivo gemischt geschrieben.
- **Soll:** Die Karte `border: 1px solid var(--line); background: var(--sheet-bg); border-radius: 8px`. Kopf `TIPP · NOCH 11` 9px Mono mit LED in `--amber`. Knöpfe als Tasten 9.5px Mono in Großbuchstaben, „Verstanden“ als helle CTA. Orange bleibt nur am Ziel (Rahmen um das gemeinte Element), so zeigt der Tipp eindeutig, wohin man schauen soll.

### B13 · Mixer-Kanäle ohne Kategorie, „KEINE EFFEKTE“ als Strichkasten
- **Ort:** `.strip-name`, `.strip-fx`, `.fx-toggle` (670: `color: #1B1204` fester Wert).
- **Soll:** Kopf mit `.track-dot` (10 px, `--cat`) und Name in Archivo 600 12px. Leere Effektzone als eine Haarlinie mit `– FX –` 8.5px Mono `--muted`. Aktive Effekte als LED-Zeilen (wie B3, kompakt 20 px). `#1B1204` durch `var(--accent-ink)` ersetzen.

---

## C · Feinschliff

1. **PATTERN-Schild in kurzen Clips** kollidiert mit dem Namen und läuft über den Rand („BEAT 1 PATTERN“ bei 1 Takt). Soll: unter 120 px Clipbreite ausblenden (`.clip.narrow .clip-tag { display: none }`) oder auf „P“ kürzen.
2. **Clip-Griffe** (`.clip-grip`, 603): Quadrate und Kreis in Kategoriefarbe mit `--panel`-Rand wirken wie eine andere Bibliothek. Soll: Griffe für Ein- und Ausblenden als 6×10-px-Balken in `--ink` (Mockup `.clip.sel .hd`), Lautstärke als 9-px-Ring `2px solid var(--ink)` ohne Füllung.
3. **Loop-Band aus** (`.loop-band.off { opacity: .3 }`) wird zu trübem Braun. Soll: eine gepunktete LED-Linie `repeating-linear-gradient(90deg, var(--led-off) 0 2px, transparent 2px 4px)`, an ist durchgehend `--amber`.
4. **Aufnahme-Taste am Desktop** ohne Beschriftung (`#rec-btn .rec-label { display: none }`), „KLICK“ und „LOOP“ dagegen mit. Soll: „AUFNAHME“ zeigen (Platz ist da, siehe Mockup), oder alle drei nur mit Icon.
5. **Arranger-Leiste:** Im Mockup steht links „ARRANGER 8 Takte · 4/4“ (10.5px Mono), rechts Teilen, Raster und Zoom. In der App kommen Zoom-Tasten zuerst, ohne Titel. Soll: Titel links, Werkzeuge rechtsbündig.
6. **Schubladenkopf:** Im Beat-Editor fehlt der Name („BEAT-EDITOR · BEAT 1“, der Name in `--muted`), und das Schließen-X fehlt am Desktop. Soll wie Mockup `.dr-h h3 span` und eine `.k.x`-Taste 32×32.
7. **Schrittraster:** Die Zeilen füllen die Schublade nicht, unten bleiben ca. 180 px leer. Soll: `grid-template-rows: auto repeat(8, minmax(28px, 1fr))`. Die Viertelgruppen zusätzlich mit `margin-left: 3px` je 4. Schritt deutlicher absetzen (heute nur über `brightness .93`).
8. **„Hi-Hat offen“ am Handy** bricht mit `line-height: 1` übereinander. Soll: `.pat-row-label { line-height: 1.2; font: 500 9px/1.2 var(--font-mono) }`.
9. **Erklärtexte** im Inspektor („Klick auf einen Clip …“, „Tonart: A-Moll – die mitgelieferten …“) und im Sample-Editor („ziehe über die Wellenform …“). CLAUDE.md sagt: keine Erklärtexte, dafür Tipps. Soll: entfernen oder in Tipps verschieben. Die Tonart steht schon im Display.
10. **Ladescreen:** Untertitel „I Like To Loop it Loop it“ ist uneinheitlich geschrieben und englisch. Soll: einheitlich („I Like to Loop It, Loop It“) oder ein deutscher Claim. Der Rest ist vorbildlich (siehe unten).
11. **`theme-color`** im HTML-Gerüst ist `#141A24` (alter blaugrauer Look; `tests/serve.cjs`, wird von `tools/build-pages.cjs` übernommen). Er färbt die Browserleiste am Handy. Soll: `<meta name="theme-color" content="#0F0F0F" media="(prefers-color-scheme: dark)">` und `#E9E7E2` für hell.
12. **Fokusring** ist korrekt (`2px solid var(--focus)`, Abstand 2 px, weiß bzw. Graphit). Nur `.tip-target` setzt `outline … !important` in Orange und überdeckt damit den Fokus. Soll: das Tipp-Ziel per `box-shadow: 0 0 0 2px var(--amber)` markieren und `outline` dem Fokus lassen.

---

## Was schon gut sitzt

- **Tokens dunkel** entsprechen 1 : 1 dem Werkstück-Block der Richtungs-README (Graphit, Ink `#F2EFE9`, `--muted` 6,7 : 1, Kategorien, Drums gelb).
- **Display:** Rasterlinien, Labels 8.5px Mono `#8F8A80` (5,9 : 1, der alte 1,7-: 1-Befund ist behoben), Takt in Orange mit Schein, Trenner `--lcd-sep`. Hell bleibt es schwarz.
- **Gummitasten:** Verlauf, Unterkante und eingedrückter Zustand per `translateY(1px)`. Die LED oben rechts verändert die Breite nicht. Play ist die einzige volle Orange-Taste im Deck.
- **Clips:** Etikett in Kategoriefarbe mit `#111`, LED-Wellenform 3/4 px, gepunktete Mittellinie in Stille (Riser). Melodie-Clips zeigen Notenbalken, das PATTERN-Schild ist da, überdeckte Clips haben Schatten.
- **Spurkopf:** Farbpunkt, M/S als kleine Tasten, Stumm in `--meter-warm` und Solo in Orange, also auch ohne Farbe unterscheidbar (Buchstabe plus Fläche). Lautstärke als Drehregler mit Bogen.
- **Schrittraster und Pads:** LED-Tasten mit Aus-LED, gesetzte Schritte in Kategoriefarbe mit Schein. Ein gehaltenes Pad leuchtet orange mit Verlauf und Schein und bleibt beim Wirbel an (dunkel genau wie im Mockup).
- **Fachleiste:** Der aktive Reiter hat die Fläche der Schublade und eine orange LED. Die Schublade hat `--sheet-bg` und ein gepunktetes Griffband.
- **Ladescreen:** LED-Säulen, LED-Fortschritt, Wortmarke „LOOP**WERK**“ in Martian Mono, Punktraster, Versionsschild. Das ist das stärkste Stück der App.
- **„Mehr“ am Handy:** Gruppen mit Mono-Labels, Tasten in 44 px, Bildmarke mit Version als Abschluss.
- **Hell-Modus** als silbernes Gehäuse wirkt stimmig (Tasten, Mulden, Clips), abgesehen vom Orange (A2).
- **Tippziele am Handy:** Transport 44+ px, M/S 36×26 im Spurkopf (darunter, aber mit Abstand), Reiter 88 px hoch, Schritte 40 px.

## Wo die App das Konzept erweitert: Vorschläge im Werkstück-Stil

Das Mockup zeigte Deck, Arranger, Regal, Inspektor und Beat-Editor. Für die übrigen Teile schlage ich vor:

1. **Mixer: „Kanalzüge als Module“.** Jeder Zug ist eine bündige Platte (`--panel`), die Züge sind durch 1-px-`--line` getrennt statt als Karten. Von oben nach unten:
   - Kopf mit Farbpunkt und Name in Archivo
   - FX-Slots als LED-Zeilen (20 px)
   - Panorama-Drehregler 32 px mit Skalenstrichen (Mockup `.knob::before`)
   - Fader-Rinne (Mulde) mit Gummikappe, rechts daneben eine LED-Pegelsäule aus 2-px-Segmenten
   - Wert 11px Mono, M/S
   Master trägt eine helle Kappe (`--ink`) als einziges Unterscheidungsmerkmal. Orange gibt es nur bei Solo und beim Ziehen am Wert. Handy: dasselbe mit 76 px Zugbreite. Aufwand: mittel (Fader-Bauteil neu, `mixer.js` hat die Pegel schon).
2. **Erstellen-Karten: „Modulplatten“.** Statt großer, kategoriegefärbter Icon-Kacheln eine Platte mit Nummer oben links (`01`–`06`, 9px Mono `--muted`) und einem 2-px-Streifen oben in der Kategorie, wie bei den Pads. Nur Beat, Melodie und Einsingen haben eine Kategorie. Import, Link und Aufnahme bekommen den Streifen in `--muted`. Titel in Archivo 600 14px, Untertitel 12px `--muted`, Icon 16 px einfarbig in `--ink`. Bei Aufnahme leuchtet die LED rot (`--meter-hot`). Aufwand: niedrig.
3. **Piano-Roll: „Tastenfeld“.** Tasten nach A7. Zeilen der schwarzen Tasten in `--lane-alt`, C-Zeilen mit Haarlinie `--grid-bar` und Label 9px Mono. Noten als Balken in `--cat` mit 1-px-Kante in `color-mix(--cat 60%, #000)`, die gewählte mit Ink-Ring. Abspielmarke und Lauflicht in Orange (A6). Aufwand: niedrig (Canvas-Farben).
4. **Sample-Editor.** Die Wellenform in `--cat` des Clips, für das genaue Schneiden als Fläche statt LED-Punkte. Der Hintergrund ist das Display (`--lcd-face`), die Auswahl ist `--amber` mit 18 % Deckkraft und orangen Kanten (aktiv). Reiter als Segment-Mulde (B5), Werkzeuggruppen mit 9px-Mono-Labels wie heute. Aufwand: niedrig.
5. **Link-Feld.** Eingabe als Mulde in Mono 12px. „Holen“ als helle CTA. „Ton aus einem Tab aufnehmen“ als Taste mit roter LED. Der YouTube-Hinweis in Archivo 13px `--muted`, mit 2-px-Linie links in `--meter-warm` als Hinweis-Marker, ohne Kasten. Aufwand: niedrig.
6. **Einblender als Display-Streifen** (B2). Er trägt das Display-Motiv in die Rückmeldung.
7. **Taktseiten am Handy** als Segment mit LED (B8). Für 2 Takte vier Segmente mit Punkt für „hat Schläge“.

## Nebenbefund (bitte prüfen, nicht UI)

- In meinem Skript setzte `window.loopwerk.ui.select(clipId)` direkt nach dem Laden den Inspektor auf den Clip, der Clip im Arranger bekam aber nicht immer `.selected` (kein Ring). Per Klick klappt es zuverlässig. Vermutlich eine Reihenfolge beim ersten Render. Für Programmauswahl (z. B. nach Duplizieren) lohnt ein Test.
