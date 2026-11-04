# Loopwerk → Figma (Plugin)

Baut in einer Figma-Datei das Design-System **„Phosphor“** von Loopwerk als voll editierbare Datei: Variablen, Text- und Effekt-Stile, Komponenten nach Atomic Design (Atoms → Molecules → Organisms, alles verknüpfte Instanzen) und die Screens wie online. Es gibt keinen schreibenden Figma-Zugang von außen, darum erzeugt dieses Plugin die Datei direkt in Figma.

## Installation (4 Schritte)

1. **Schriften installieren** (Google Fonts, auf dem Rechner mit Figma Desktop): [Funnel Display](https://fonts.google.com/specimen/Funnel+Display), [Funnel Sans](https://fonts.google.com/specimen/Funnel+Sans), [Azeret Mono](https://fonts.google.com/specimen/Azeret+Mono). Figma Desktop danach neu starten.
2. In **Figma Desktop** eine neue, leere Design-Datei öffnen.
3. Menü **Plugins → Development → Import plugin from manifest …** und `tools/figma-plugin/manifest.json` aus diesem Repo wählen.
4. **Plugins → Development → Loopwerk Design-System (Phosphor)** starten. Nach etwa einer Minute meldet Figma „Fertig: 100 Komponenten (353 Varianten), 144 Variablen …“.

Das Plugin hat keine Oberfläche, braucht kein Netz und löscht nichts.

## Was erzeugt wird

| Seite | Inhalt |
|---|---|
| **Cover** | Name, Version, Datum, Legende (Seiten, Variablen, Stile, Namensschema, Regeln, Kategoriefarben) |
| **Atoms** | 61 Komponenten / 247 Varianten in Sektionen: Icons (28, 24-px-Raster), Licht und Marken (LED, Trennlinie, Lichtstrich, Wellenform, Abspielmarke, Clip-Griffe, Schnittmarken, Schubladen-Griff, Wortmarke, Schritt), Tasten (Key, Pill, Icon Button, Text Button, Underline Tab, Dropdown), Schalter/Segmente/Chips (Toggle, Segment, Chip, Tag, Radio, Checkbox), Eingaben und Anzeigen (Input, LCD Value, Label, Slider, Fader, Knob, Meter), Flächen (Surface, Category Frame, Slot) |
| **Molecules** | 26 Komponenten / 78 Varianten: Transport, LCD Field, Meter Field, Search Row, Shelf Row, Accordion Head, Left Tabs, Track Head, Clip, Ruler Bar, Grid Bar, Ruler Corner, Inspector Head, Inspector Row, Effect Row, Mastering Head, Segment Group, Tab Item, Hint, Tip, Dock Head, Channel Head, Song Tile, Tool Button, Beat Row, Option |
| **Organisms** | 13 Komponenten / 28 Varianten: Deck, Arranger Bar, Tabbar, Clip Toolbar, Shelf, Arranger, Inspector, Channel Strip, Mixer, Song Panel, Beat Editor, Export Panel, Sheet |
| **Screens** | Desktop 1440×900: Start · Clip ausgewählt · Mixer offen · Regal mit Filter. Handy 390×844: Start · Sounds-Fach · Mixer · Song-Fach · Clip ausgewählt |

**Variablen** (144):

- **Phosphor** (Modus „Dunkel“, 70 Farben): `color/surface/*` (bg, panel, deck, head, lane, sheet, well, clip …), `color/text/*` (ink, muted, disabled, on-accent), `color/line/*` (line, key, knob, active, grid-bar, grid-beat, row, playhead, trim), `color/state/*` (beam, amber → beam, focus → beam, danger, rec → meter/hot), `color/meter/*`, `color/led/off`, `color/cat/*` (drums, bass, chords, synth, fx, own), `color/cat-edge/*` (30 % für Clip-Kanten), `color/cat-glow/*` (45 % für den Schein), `color/glow/*`, `color/overlay/*`, `color/shadow/*`, `color/piano/*`. Alpha-Werte wie `--panel` sind RGBA, gleiche Werte sind Aliasse.
- **Maße** (Modus „Standard“, 71 Zahlen): `space/2 … space/48` (4er-Skala), `radius/xs|s|l|pill` (2 · 3 · 14 · 999), `size/*` (touch 44, track-h 58, track-head 176/136, deck 60, tabbar 42/60, bar 96, shelf 272, inspector 300 …), `stroke/*`, `font/size/10 … 28`.
- **Schrift** (3 Texte): `font/family/display|body|mono`.

**Stile:** 23 Text-Stile (`Display/*`, `Body/*`, `Mono/*`, `LCD/*`, Schriftgröße und Familie an Variablen gebunden) und 12 Effekt-Stile (`Glow/Beam`, `Glow/Ink`, `Glow/Cat/<Kategorie>`, `Shadow/Sheet`, `Shadow/Popover`, `Shadow/Lift`, `Blur/Glass`).

Alle Füllungen, Konturen, Effektfarben, Abstände (Auto-Layout-Padding und -Gap), Radien, Konturstärken und festen Größen sind an Variablen gebunden, alle Texte an Text-Stile. Auto-Layout überall dort, wo die App Flex/Grid nutzt; Hug/Fill wie in der App.

## Namenskonventionen

- **Komponenten:** `Ebene/Name` auf Englisch, z. B. `Atom/Key`, `Molecule/Track Head`, `Organism/Inspector`. Icons: `Atom/Icon/<Name>`.
- **Varianten-Properties:** englisch-kurz, Werte mit großem Anfangsbuchstaben: `State=Default|Active|Primary|Muted|Disabled|Rec`, `Size=XS|S|M|L`, `Device=Desktop|Phone`, `Category=Drums|Bass|Chords|Synth|FX|Own`, `Type=…`, `On=True|False`, `Kind=Clip|Track|Song`.
- **Component Properties:** englisch: `Label`, `Value`, `Name`, `Show Icon`, `Icon` (Instance-Swap), `Show Chevron`, `Content` (Inhalt der Schublade).
- **Ebenen:** deutsch wie die Begriffe in der App („Spurkopf Drums“, „Reiter Mixer“, „Clip Bass Am–F–C–G“, „Beschriftung“, „Wert“).
- **Beschreibungen:** jede Komponente sagt in einem Satz, was sie in der App ist.

## Varianten und Properties benutzen

- **Taste umstellen:** Instanz wählen → rechts `State` (Active = Weißglut-Linie, Primary = weiß gefüllt, Muted = Stumm, Rec = Aufnahme) und `Size`.
- **Icon tauschen:** `Show Icon` an, unter `Icon` ein anderes Icon wählen (bevorzugte Liste = alle Loopwerk-Icons). Nur Icon: `Show Label` aus, Taste quadratisch ziehen.
- **Freigelegte Instanzen:** In Molecules sind die Inhalts-Atome freigelegt (Exposed Instances) – z. B. beim LCD-Feld erscheinen Beschriftung und Ziffern direkt in den Properties, beim Spurkopf der Lichtpunkt (`Category`).
- **Clip auswählen:** im Arranger die Ebene „Clip …“ wählen → `State=Selected` (weiße Kante, Schnittmarken, Griffe).
- **Aktiver Reiter:** in der Fachleiste die Ebene „Reiter …“ → `State=Active`.
- **Schublade füllen:** `Organism/Sheet` hat die Property `Content` (Instance-Swap): Regal, Mixer, Song, Beat-Editor, Export oder Platzhalter.
- **Farben/Maße ändern:** in den Variablen (Lokale Variablen) – alles Gebundene zieht mit. Neue Werte bitte ebenfalls als Variable anlegen, keine festen Farben.

## Bereinigt: vorher → nachher

Wo die App uneinheitlich ist, zieht das Plugin die Werte auf saubere Skalen. In der App selbst ist nichts geändert.

| Bereich | Vorher (App) | Nachher (Figma) |
|---|---|---|
| Schriftgrößen | 8 · 8,5 · 9 · 9,5 px | 10 (`font/size/10`) |
| | 10,5 px | 11 |
| | 12,5 (Kanalname) · 13,5 (Spurname) | 13 (`Body/Strong`) |
| | 15 · 17 · 18 px | 16 bzw. 20 |
| | 21 (Wortmarke) | 20 |
| | 22 · 23 (Display-Ziffern) | 24 (`LCD/L`) |
| | 26 (Song-Titel) | 28 (`Display/XL`) |
| | Tempo im Inspektor 20 px SemiBold, Tonart 20 px Light | beide `LCD/M` 20 Light (dünne Ziffern) |
| Laufweite | 0,06 · 0,08 em | 8 % |
| | 0,1 · 0,12 · 0,14 em | 12 % (Mono-Labels) bzw. 10 % (Caps L) |
| | −0,02 · −0,03 em | −2 % (Display), −3 % (LCD) |
| Abstände | 1 · 3 px | 2 bzw. 4 |
| | 5 · 6 px | 4 (eng: Handy-Deck, Spurkopf, Lücken in Leisten) bzw. 8 (Tasten- und Deck-Gruppen) |
| | 7 · 9 px | 8 (Clipname, Inspektor-Kopf) |
| | 10 · 11 px | 12 (Tasten-Innenabstand, Kanalzüge, Einblender) bzw. 8 (Display-Zellen, damit das Deck in 1440 px passt) |
| | 14 px | 16 (Inspektor-Ränder, Tipp) |
| | 18 px | 16 (Abstand der Inspektor-Gruppen) |
| | 26 · 30 px | 24 bzw. 32 |
| Radien | 1 px | 2 (`radius/xs`) |
| | 4 · 5 · 6 · 8 px | 3 (`radius/s`, „Inhalte“ laut Spec) |
| | 10 · 12 · 13 · 18 px | 14 (`radius/l`, „Behälter“: Schublade, Einblender, Tipp, Such-Knöpfe) |
| | 22 · 26 px · 50 % | Pille (`radius/pill`) |
| Farben | `#4E4E56` fest für Deaktiviertes | `color/text/disabled` |
| | `#1B1204` (Schrift auf Weiß, alter Werkstück-Ton) | `color/text/on-accent` (#030304) |
| | `#26262B`, `#2E2E34` (Schritt-Rahmen, Gruppenlinie) | `color/line/line` |
| | `--lcd-sep #222226` | entfällt (Trenner sind `color/line/line`) |
| | Linsen-Rand 50 %, Master-Rand 42 % Weiß | `color/line/active` (55 %) |
| | Schein der Clip-Karte 22 % | ohne Schein, nur Rahmen `stroke/focus` |
| | Werkstück-Tokens (`--key-face`, `--knob-hi`, `--lcd-face` … = transparent) | nicht übernommen |
| Größen | Spielen-Linse am Handy 46 px | 44 (`size/lens`) |
| | Spurpunkt 7 px, Clip-Griff 11 px | 8 bzw. 12 |
| | Such-Knöpfe 46×34 | 34×34 (`size/find`) |
| | M/S am Handy 36×30 | 36×28 |
| | Projektname-Feld am Handy 52 px | 44 (`size/input`) |
| Fehler im Layout | Deck bei 1440 px zu breit, „Exportieren“ abgeschnitten | passt in 1424 px (Projekt-Menü 150 px, Aufnahme-Pfeil 20 px, Zellen 8 px) |
| | Mixer: Hall-Bus legt sich über den Kanal „Melodie“ | Spuren scrollen in eigenem Bereich, Busse und Master stehen daneben |
| | Kanalzug „keine Effekte“ zweizeilig gequetscht | „FX aus“ |
| | Regal-Schnellknöpfe am Handy gestrichelt rosa | normale Tasten |
| | „+ Spur“ in Funnel Display 12, Tipp-Knöpfe Funnel 12 | `Mono/Key` wie alle Tasten |
| | Regler im Browser-Standard-Look | Linie + Griff (`Atom/Slider`) |
| | Export: Fieldset-Rahmen um jede Gruppe | ohne Rahmen, Abstände gliedern |

## Bekannte Grenzen

- **Licht:** Glows (`box-shadow`, `text-shadow`) sind Drop-Shadow-Effekt-Stile – ähnlich, aber nicht identisch. Das Umgebungslicht (WebGL-Shader, Rand-Glühen, Funken) und die Pegel-Animation gibt es in Figma nicht; Screens zeigen den stillen Zustand („Still ist schwarz“).
- **Weichzeichner:** `Blur/Glass` ist ein Background-Blur; `saturate()` und `backdrop-filter` auf Lineal/Master kann Figma nicht.
- **Mischfarben:** `color-mix()` ist als feste RGBA-Variable übernommen (z. B. `color/surface/ruler`, `color/surface/master`).
- **Schraffur „Stumm“:** Figma hat keine wiederholten Verläufe – Stumm ist ein Hauch (`overlay/white-04`) mit Linie.
- **Drehknopf:** der konische Verlauf ist ein Bogen (Ellipse mit Arc) plus Zeiger; drei Stellungen als Varianten.
- **Wellenform:** fester Platzhalter je Kategorie (Lichtstriche), skaliert mit, zeigt aber nicht den echten Klang.
- **Responsives Verhalten:** die Haltepunkte der App (1439/1199/1099/939/760 px) sind als Varianten `Device=Desktop|Phone` abgebildet, nicht als Zwischenstufen.
- **Hover/Fokus:** nur Fokus beim Eingabefeld als Variante; Hover-Zustände fehlen.
- **Icon-Tausch:** Figma behält beim Tausch normalerweise die Größe (16 px). Erscheint ein Icon nach dem Tausch mit 24 px, auf 16 px zurückziehen.
- **Fehlende Schriften:** fehlt Funnel/Azeret, nimmt das Plugin Inter bzw. Roboto Mono, meldet das (`figma.notify` und Abschlussmeldung) und trägt den Ersatz in die Schrift-Variablen ein. Nach dem Installieren erneut laufen lassen.
- **Prototyping** (Klickpfade, Smart Animate) wird nicht erzeugt.

## Erneut laufen lassen (Design der App geändert)

1. Werte im Plugin nachziehen: Tokens stehen oben in `code.js` (`COLORS`, `FLOATS`/`SIZES`, `TEXT_STYLES`), Inhalte der Screens in `TRACKS`, `SHELF_GROUPS`, `DRUM_LOOPS`, `EFFECTS`. Quelle sind `:root` in `index.html` und die gemessene Oberfläche (`getComputedStyle`).
2. Prüfen (siehe unten).
3. Plugin in derselben Datei erneut starten: es legt **neue** Seiten mit Nummer an („Atoms · 2“ …), neue Collections („Phosphor · 2“) und Stile unter „Lauf 2/…“. Bestehende Seiten bleiben unberührt; Handanpassungen gehen also nicht verloren. Alte Seiten und Collections bei Bedarf von Hand löschen – oder das Plugin in einer frischen Datei laufen lassen und Komponenten per Bibliothek tauschen.

## Prüfen ohne Figma

```sh
cd tools/figma-plugin
npm install          # typescript, @figma/plugin-typings, acorn (node_modules ist ignoriert)
npm run check        # tsc mit Plugin-Typings · ES2017-Syntax · Laufprobe
```

`mock-run.cjs` stellt ein strenges Fake-`figma` bereit (lehnt ab, was Figma ablehnt: FILL ohne Auto-Layout-Eltern, Kinder in Instanzen, ungeladene Schrift, `textStyleId` ohne Async bei `dynamic-page`, Properties an Varianten …), führt `code.js` zweimal aus (frische Datei; dann dieselbe Datei ohne Funnel/Azeret) und prüft:

- (a) Molecules/Organisms enthalten keine nackten Grundformen – nur Instanzen, Texte und reine Layout-Frames; Molecules nur Atom-Instanzen,
- (b) keine Farbe ohne gebundene Variable (Füllung, Kontur, Effekt),
- (c) Screens bestehen nur aus Organism-Instanzen (plus Hintergrund-Frame),
- (d) keine Überlappung auf einer Seite (Sektionen, Komponenten, Varianten),
- (e) Texte an Text-Stilen, Abstände und Radien an Variablen,
- Seitenreihenfolge, Zahlen je Collection und Seite, Ersatzschrift und neue Seiten beim zweiten Lauf.

Hinweise „Inhalt größer als Rahmen“ beruhen auf geschätzten Textbreiten und sind keine Fehler.
