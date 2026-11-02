# Krachwerk Scheibe 1: Gerüst und erster Laut

**Stand:** 02.11.2026 · **Grundlage:** `docs/ux/krachwerk-brainstorm/synthese.md` (maßgeblich), `architektur.md`, `ux.md`, `ui.md`, ADR 007 · **Branch:** `werkstatt`
**Martins Entscheidungen:** Werkbank rechts (⤢ auf ca. 60 %), am Handy als Schublade · „selbst gemacht“ mittel · Pad-Wand wird später Kit-Werkbank · Ruhe-Schicht gemeinsam bauen, in Loopwerk aus.

## 0. Ziel aus Nutzersicht
Martin öffnet `/werkstatt/` am Handy, tippt ●, klopft und hört den gesäuberten Klang sofort als Clip im Loop. Die alten Pad-Klänge liegen schon in der Kiste. Der Song funktioniert wie in Loopwerk.

## 1. Umfang und Teilung
Alles zusammen passt nicht in einen Tag. Darum gibt es zwei Teile, und jeder ist für sich auslieferbar.

| | **1a Gerüst und erster Laut** (zuerst) | **1b Flächen und Ruhe** |
|---|---|---|
| Inhalt | volle App unter `/werkstatt/` ohne Kataloge · Flächen-Tabelle (`surfaces`) · leerer Song (2 Spuren, 90 BPM) · eigener Speicher inkl. Prototyp-Klänge · ● → säubern → Clip im Loop · PWA bleibt · Prototyp zurückgebaut · Zähl-Werkzeug mit Loopwerk-Basis | Dichte `calm` mit Stufen (`data-tier`) · Werkbank rechts/Schublade · Daumenleiste · Werkzeug am Clip · Kiste nach Quelle · Schrift- und Rahmenregeln · Zähl-Budget |
| Aussehen | Loopwerk-Layout, nur ohne Katalog-Flächen | Richtung B |
| Zeigbar | Ablauf aus §0 am Handy (● sitzt im Deck neben ▶). Ein Clip lässt sich antippen, schieben und kopieren (wie in Loopwerk). Alte Klänge liegen im Regal unter „Eigene“. Eine Projektdatei öffnet in beiden Apps. | Zählung neben Loopwerk legen, CD-Durchsicht am echten Handy |

**Nicht in Scheibe 1:** Klang-Rezept, Stammbaum, „in 3 Clips“/Variante, Herkunftsfarben im Song (Scheibe 2). Takes, Festhalten, DB v2, ZIP-Sicherung (3). Kit-Werkbank/Pad-Wand, Klatsch-Kit, Startkarte „● Mach ein Geräusch“, Instrument aus Aufnahme, eigene Tipps (4). Song-Werkbank, Ruhe-Schicht als Option für Loopwerk (5). Kataloge per `import()` statt nur abgeschaltet (eigene Messung, frühestens 1b).

## 2. Bauweise (1a)

### 2.1 Edition-Tabelle `src/edition.js`
`EDITION` ist die einzige Stelle, an der sich Editionen unterscheiden. `src/main.js` (die Wurzel) liest sie und gibt Werte als Optionen an Module weiter. In `src/ui/*` gibt es kein `if (edition)`.
```js
full: { id:'full', title:'Loopwerk', db:'loopwerk', keyPrefix:'loopwerk.', catalogs:true, demo:true,
        tracks:8, bpm:120, record:'song', keepUnknownClips:false, pwa:false, density:'full', surfaces:{} },
make: { id:'make', title:'Krachwerk', db:'loopwerk-make', keyPrefix:'loopwerk.make.', padsKey:'loopwerk.make.pads.v1',
        catalogs:false, demo:false, synthKits:['elektro','techno'], tracks:2, bpm:90, record:'sound',
        keepUnknownClips:true, pwa:true, density:'full' /* 1b: 'calm' */,
        surfaces:{ starter:false, accomp:false, ai:false, link:false, catalog:false, demo:false, tips:false } },
```
- `export const lsKey = (k) => k.replace(/^loopwerk\./, EDITION.keyPrefix)`. Alle `localStorage`-Schlüssel laufen darüber: `main.js`, `transport.js`, `zoombars.js`, `sheets.js`, `tips.js`, `library.js`. In Loopwerk kommt derselbe Schlüssel heraus.
- Gleich zu Beginn setzt `main.js` `#app.dataset.edition` und `#app.dataset.density`. `?edition=make` auf `/` wird die Artifact-Vorschau, dort ohne Service Worker (`pwa` greift nur unter `/werkstatt/`).

### 2.2 Flächen ausblenden: `data-surface`
- Im Markup von `index.html` steht `data-surface="…"` an Elementen, die zu einer abschaltbaren Fläche gehören. Neu: `src/ui/surfaces.js` mit `applySurfaces(EDITION.surfaces)`. Das setzt `data-off` an jedes Element, dessen Fläche `false` ist. Dazu kommt eine einzige CSS-Regel: `[data-off] { display: none !important; }`. Die Elemente bleiben im DOM, damit `getElementById` nicht bricht.
- Zuordnung in 1a:

| Fläche | Elemente (`index.html`) | Grund |
|---|---|---|
| `starter` | `#starter`, die `h3.create-sec` „Song-Starter“ davor | keine Loops |
| `accomp` | `.ccard[data-create="accomp"]` | Begleitautomatik weg |
| `ai` | `#pat-continue`, `.sing-desc-field`, `#sing-sound` | KI-Erzeugung weg |
| `link` | `[data-link-open]`, `.ccard[data-create="link"]`, `#link-pop`, `#tab-capture` | Link-Import und Tab-Aufnahme weg |
| `catalog` | `.shelf-sort` (Ordnen, Länge), `#shelf-filter-btn`, `#shelf-chips` (Kategorie-Filter), `.shelf-credit`, `#pop-about` | ohne Katalog sinnlos |
| `demo` | `#demo-btn` | kein Beispiel-Song |
| `tips` | `#tips-reset` | Loopwerk-Tipps zeigen auf Katalog-Flächen |

- Diese Elemente **bleiben**: Import (`#import-btn`, Karte „Datei importieren“), Beat, Melodie, Einsingen (Tonhöhe erkennen), Sample-Editor samt Autotune, Trennen, Tonart- und Akkord-Streifen, Mixer, FX-Pad, Export.
- Bei `surfaces.tips === false` ruft `main.js` `mountTips` nicht auf. Mounten oder nicht ist die einzige Entscheidung, die in der Wurzel fällt.

### 2.3 Seite `/werkstatt/` (`tools/werkstatt-page.cjs`)
`werkstattPage(head)` setzt die Seite so zusammen: Gerüst mit `<base href="../">`, Krachwerk-Icons und Manifest (wie heute), dann `<script>window.LOOPWERK_EDITION='make'</script>`, dann **`index.html` unverändert** und `</body></html>`. Die Tokens werden nicht mehr herausgeschnitten, `werkstatt.css` fällt weg. Ersetzt werden nur Wörter. Jede Ersetzung hat eine erwartete Anzahl und wirft einen Fehler, wenn diese nicht stimmt:
- `<title>Loopwerk</title>` → `<title>Krachwerk</title>` (1×). Der eigene `<title>` im Gerüst fällt weg.
- `Loopwerk wird geladen` → `Krachwerk wird geladen` (1×, Splash-`aria-label`)
- `Loop<b>werk</b>` → `Krach<b>werk</b>` (2×: Splash und Deck)
- Splash-Satz `I Like To Loop it Loop it` → „Mach aus jedem Geräusch ein Instrument.“ (1×)

Den Fehlertext in `boot().catch` liefert `EDITION.title`. `werkstattManifest()` liest nur noch `--bg`. `tests/serve.cjs` und `tools/build-pages.cjs` bleiben unverändert. Der Service Worker bekommt `CACHE = 'krachwerk-v2'`, damit die Prototyp-Dateien gelöscht werden. Er speichert die volle App (alle GETs vom selben Ursprung aus Clients unter `/werkstatt/`).

### 2.4 Kataloge entkoppeln (kleinster Schnitt)
Die statischen Imports bleiben. Damit ändert sich die Ladereihenfolge in Loopwerk nicht, und die 23 Testdateien mit Katalog-IDs bleiben ruhig. Die Katalog-Module (`src/catalog*.js`, `loops-*.js`) laden weiter mit, `assets/` aber nicht. Die Startzeit am Handy misst der Test (§7 Punkt 2), `import()` kommt erst, wenn sie stört.

| Stelle | Änderung |
|---|---|
| `samples.js` `buildLibrary` | neue Option `catalogs = true`. Bei `false` legt es keine Stubs aus `ALL_LOOP_DEFS`/`ALL_CATALOG` an, `coreIds = []` (damit ist `catalogReady` sofort erfüllt) |
| `sampler.js` | `export function clearInstruments() { registry.clear(); pending.clear(); ready.clear(); }`, Aufruf in `main.js` bei `!catalogs` |
| `ui/pattern-editor.js` | Option `kits` (Liste der IDs), die Auswahl filtert `KITS`. `main.js` übergibt `EDITION.synthKits` (ohne `akustik`, das hängt an `sp-*`) |
| `model.js` | `createEmptyProject({ tracks = 8, bpm = 120 } = {})`, die Voreinstellung bleibt wie bisher |
| `main.js` `boot` | `need` aus `saved ?? (demo ? createDemoProject() : leer)`. Start: `EDITION.demo ? createDemoProject() : createEmptyProject(EDITION)`. `own = new OwnSounds(library, { db: EDITION.db })`. `mountProjectIO({ …, keepUnknown: EDITION.keepUnknownClips })` |
| `ui/project-io.js` | bei `keepUnknown` werden Clips mit unbekanntem Sound nicht herausgefiltert, sie bekommen den Platzhalter (`missingSound` aus `main.js` wandert nach `samples.js` als `library.placeholder(id, beats)`). Loopwerk bleibt beim Herausfiltern, das ist heutiges Verhalten und getestet |

Folge: Eine Loopwerk-Datei mit Katalog-Loops öffnet in Krachwerk mit stummen Clips („Sound fehlt“). Beim Speichern bleiben die `sampleId` erhalten, und in Loopwerk klingen die Clips wieder.

## 3. Eigener Speicher und Prototyp-Klänge
**Befund:** Der Prototyp (`bank.js`) und `OwnSounds` nutzen dasselbe Schema: IndexedDB Version 1, Store `sounds`, `keyPath: 'id'`, Feld `wav` (16-Bit-WAV aus `encodeWav`). Es braucht also **keine Kopie**. Krachwerk öffnet `OwnSounds` auf `loopwerk-make` und liest die Prototyp-Datensätze direkt.

- `own-sounds.js`: Der Konstruktor bekommt `{ db = 'loopwerk' }`, `DB_NAME` wird zum Feld. Der `db()`-Cache gilt je Name.
- `toSample(rec)` versteht die Prototyp-Felder:
  - `kind`: aus `rec.kind`, sonst `'loop'`, wenn `rec.cls === 'loop'`
  - `beats`: aus `rec.beats`, sonst `rec.bars * 4`
  - neu `made: { cls, tags, from }`. `from` ist `'loop'` (`cls === 'loop'`), `'file'` (`source` beginnt mit „Import“) oder sonst `'mic'`.
  - `category` bleibt `'own'`, weil Löschen, Editor und Starter darauf prüfen.
- `create()` speichert die optionalen Felder `cls`, `tags` und `from` mit. `embed()`/`restore()` tragen sie in der Projektdatei mit (optionale Felder, `PROJECT_VERSION` bleibt 1).
- Neu `export const isOwnId = (id) => /^(own|mk)-/.test(id)`. `embed()` nutzt es, sonst fehlten die `mk-`-Klänge in der Projektdatei. Die IDs werden nicht umbenannt, weil `padsKey` auf sie zeigt.
- Pad-Belegung (`loopwerk.make.pads.v1`): bleibt unangetastet liegen und wird in Scheibe 4 zum Kit. Synth-Pads haben kein Audio in der DB, die Synth-Kits erzeugen sie neu.
- „Einmalig“ heißt hier nur: Beim ersten Start mit Klängen und leerem Projekt erscheint einmal der Einblender „Deine Klänge aus der Pad-Wand liegen unter „Eigene“.“ (`lsKey('loopwerk.migrated')`).

## 4. Erster Laut: ● → säubern → Clip im Loop (1a)
- `src/werkstatt/clean.js` und `slice.js` ziehen nach `src/dsp/clean.js` und `src/dsp/slice.js` (Imports `./fft.js`, `./pitch.js`).
- `Recorder.start({ trackId, startBeat, mode })` lernt `mode: 'sound'` (aus `EDITION.record`, über `mountRecording`). In diesem Modus gilt:
  - kein Vorzähler, kein `engine.play`. Läuft der Song schon, spielt er weiter.
  - Stopp durch erneutes Tippen oder von selbst, wenn nach dem ersten Klang 1,2 s Stille kommen (RMS der Worklet-Blöcke, also eine Reaktion auf Daten und kein Timing). Höchstens 10 s.
  - `finish()`: Latenz wird hier nicht abgeschnitten (ohne Song zählt nur der Klang). Dann `cleanTake(chs, sr, { maxSeconds: 10 })`, danach `features` → `classify` → `describe(f, cls, eigeneNamen)`. Anschließend `own.create({ name, buffer, source:'Aufnahme', cls, tags, from:'mic' })`. Gibt `cleanTake` Stille zurück, kommt der Einblender „Nichts gehört – nochmal?“ und es entsteht kein Sound.
- Platzieren macht `mountRecording` in einem Undo-Schritt, `store.batch('Aufnahme', …)`:
  - Spur: die gewählte, sonst die erste ohne Clip im Takt, sonst `addTrack()`
  - `startBeat` = Takt der Marke beim Start (`floor(heardBeat / bpb) * bpb`)
  - `lengthBeats` = `sample.lengthBeats` aufgerundet auf ganze Takte, mindestens 1 Takt. Ein 1-Schlag-Klopfer klingt so 4× pro Takt.
  - `setLoop({ on:true, startBeat, endBeat: startBeat + lengthBeats })`
  - danach `engine.play(startBeat)`, falls der Song nicht schon spielt, und der Clip wird gewählt
- Loopwerk (`mode:'song'`) bleibt unverändert.

## 5. Oberfläche (1b)

### 5.1 Dichte `calm` und Stufen
- Ab 1b steht `make.density = 'calm'`. CSS dafür nur in **einem** Block `/* Dichte calm */` am Ende von `index.html`, Selektoren nur auf `.app[data-density="calm"]`, nur Tokens, höchstens 150 Zeilen. Neue Tokens in `:root`: Schriftskala `--fs-11, --fs-13, --fs-15, --fs-24, --fs-38, --fs-56`.
- `data-tier="3"` am Markup heißt: in `calm` nicht sichtbar. Jedes Element mit Stufe 3 braucht einen Eintrag in `EDITION.twins` (ID → Zwilling), sonst schlägt der Test fehl:

| Stufe 3 in calm | Zwilling |
|---|---|
| `#home-btn` | Pos1, Lineal antippen |
| `#metro-btn` | Song-Fach |
| `.lcd-more` (Schlag, Zeit, Tonart), `.meter-wrap` | Song-Fach, Inspektor Song |
| `#zoom-in/out`, `#zoomy-in/out` | Strg+Rad, zwei Finger |
| `#select-btn`, `#select-all-btn` | lange drücken, Strg+A |
| `.ltab` (Suchen/Erstellen) | „+ Neu“ in der Kiste |
| Spurkopf M, S, Lautstärke (nur Handy) | Spur-Werkbank: Lautstärke (gibt es) **plus neu M/S-Schalter in `inspector.js`** |
| `#clipbar` | Werkzeug am Clip (5.4) |

- `place.js`: `place(node, { narrow, wide, calm: { narrow, wide } })`. Den `calm`-Platz bekommt ein Element nur bei `#app[data-density=calm]`, sonst gilt der bisherige Platz.

### 5.2 Werkbank (heutiger Inspektor, Inhalt in Scheibe 1 unverändert)
- **Desktop:** `#insp` rechts, `--insp-w: 36%`. Ohne Auswahl ist er auf 24 px eingeklappt (heutiger `insp-toggle`-Mechanismus, in `calm` für alle Breiten). Bei Auswahl von Clip oder Spur klappt er auf, bei leerer Auswahl wieder zu. Klick auf den Streifen zeigt den Song. Der Knopf ⤢ im Kopf schaltet `.app.wb-wide` (60 %), der Zustand liegt in `lsKey('loopwerk.wbWide')`.
- **Handy:** neue `<section class="dock" id="werkbank" aria-label="Werkbank" hidden>`. `place(#insp, { calm:{ narrow: werkbank-body } })`, Dock-Name `'werkbank'`, `sheets.js` hängt sie an wie jede Schublade (Haltepunkte und Merken gibt es schon). Clip antippen öffnet die Werkbank nicht, dafür gibt es den Knopf „Werkbank“ in der Daumenleiste und im Werkzeug am Clip.
- Inhalt: Clip-, Spur- und Song-Abschnitt wie heute. Die Reduktion des Inhalts gehört zu Scheibe 2 (Sound-Werkbank). Neu ist nur M/S in der Spur.

### 5.3 Daumenleiste (Handy, calm)
`#tabbar` wird zur Leiste mit 64 px: **Kiste** (`#tab-sounds`, Text „Kiste“) · **▶** (`#play-btn` per `place`) · **●** (`#rec-btn` per `place`, rote Form) · **Werkbank** (neu `#tab-werkbank`, öffnet die Werkbank für den gewählten Clip, sonst für den Song). `#mixer-btn`, `#fxpad-btn`, `#editor-tab` und `#tab-song` haben in calm Stufe 3. Ihre Zwillinge: Das Deck oben ist die Lesezeile (Name · Takt · Tempo), ein Tipp darauf öffnet das Song-Fach (`#song`), und dort stehen neu „Mischen“ und „FX-Pad“ (per `place` nach `#song-links`). Der Editor ist über die Werkbank erreichbar (Clip → „Bearbeiten“). Am Desktop bleibt `#tabbar` wie in Loopwerk.

### 5.4 Werkzeug am Clip
Neu `src/ui/clip-float.js`: eine kleine Leiste über dem gewählten Clip (passt sie nicht darüber, dann darunter, immer innerhalb von `#arr-wrap`, folgt Scrollen und Zoom). Knöpfe: **Teilen · Kopie · Löschen** (`tools.split/duplicate/remove`), am Handy dazu **Werkbank**. Tippziele mindestens 44 px. Sie ersetzt in calm `#clipbar` und die Deck-Gruppe „Clip“. Bei Mehrfachauswahl gilt sie für alle gewählten Clips.

### 5.5 Kiste
Das Regal heißt in calm „Kiste“. `mountLibrary({ groupBy })` bekommt aus `EDITION.shelfGroups` die Gruppen **Aufnahmen** (`make.from==='mic'`) · **Dateien** (`'file'`) · **Schleifen** (`'loop'`) · **Strom** (`pat-…`). Der Punkt vor dem Namen zeigt die Herkunftsfarbe aus `ui.md` (Ton → Stimme `--cat-synth`, sonst Dinge `--cat-fx`, Schleife `--cat-chords`, Strom `--cat-bass`). Darüber steht „+ Neu“ (Aufnehmen, Datei, Beat, Melodie) statt des Reiters „Erstellen“. Am Desktop ist die Kiste 240 px breit und klappt auf 24 px ein (`.app.kiste-zu`). Clips im Song behalten in Scheibe 1 die Farbe „Eigene“, Herkunftsfarben im Song kommen mit Scheibe 2.

### 5.6 Schrift und Rahmen (calm-Block)
Mono nur für Zahlen. Etiketten ohne Versalien (`text-transform:none`, Sans). Jede sichtbare Schrift kommt aus der Skala, die kleinste ist 11 px. Rahmen nur an Knöpfen, die man drückt. Abschnitte im Inspektor, Regler, Felder in der Ansicht und Etiketten verlieren `border`/`inset`-Ring. Weißglut nur an ▶ (spielend) und am gewählten Clip.

## 6. Zähltest
Neu `tests/count.cjs`, eine reine Mess-Hilfe. `countUi(page)` läuft im Browser und gibt `{ controls, frames, sizes, minFont }` zurück. Als CLI `node tests/count.cjs [/werkstatt/]` druckt es die Tabelle.
- **Sichtbar:** `getClientRects().length > 0`, Rechteck schneidet den Viewport, `visibility` ist nicht `hidden`, `opacity` > 0, und `elementFromPoint(Mitte)` ist das Element selbst oder liegt darin. So zählen verdeckte Teile unter Schubladen nicht.
- **Bedienelemente:** `button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=slider], [role=tab], [role=option], [draggable=true]:not(.clip)`
- **Rahmen:** sichtbare Elemente mit mindestens 3 Seiten `border-*-width ≥ 0.5` und deckender Farbe, oder mit `box-shadow` als `inset 0 0 0 Npx`-Ring
- **Schriftgrößen:** Menge der `font-size` (auf 0,5 px gerundet) aller sichtbaren Elemente mit eigenem Textknoten; `minFont` ist ihr Minimum
- **Bilder:** *Start* (leerer Song), *Clip gewählt* (2 Spuren, 1 Clip, Clip gewählt), *Werkbank Mitte* (nur 1b, Handy). Größen: 1400×820 und 390×844 mit Touch.
- **Basis:** Schritt 0 schreibt `tests/count-baseline.json` aus Loopwerk **vor** jeder Änderung. Danach prüft der Test, dass Loopwerk die Basis exakt trifft. Das ist der Nachweis „Loopwerk optisch unverändert“.

| Budget (Clip gewählt) | Loopwerk heute | **1a** | **1b** | Endziel |
|---|---|---|---|---|
| Desktop Bedienelemente | 112 | ≤ 85 | **≤ 70** | 45 |
| Desktop Rahmen | 117 | ≤ 95 | **≤ 60** | 35 |
| Desktop Schriftgrößen / kleinste | 12 / 8,5 | messen | **≤ 8 / ≥ 11** | 6 / 11 |
| Handy Bedienelemente | 44 | ≤ 38 | **≤ 24** | 22 |
| Handy Rahmen | 60 | ≤ 50 | **≤ 25** | 15 |
| Handy Schriftgrößen / kleinste | 7 / – | messen | **≤ 6 / ≥ 11** | 5 / 11 |

Die Spalte „Loopwerk heute“ stammt aus `ux.md`/`ui.md` (Beispielprojekt). Die Basis in Schritt 0 misst mit derselben Hilfe neu, und zählt die Hilfe anders, gilt deren Wert. 1a spart nur durch die Flächen und durch 2 statt 8 Spuren. Wer ein Budget überschreitet, streicht etwas anderes und hebt das Budget nicht an.

## 7. Testplan
**`tests/werkstatt.test.cjs` neu** (gegen die volle App, `window.loopwerk`). Pfad `/werkstatt/`, Handy und Desktop, Fake-Mikrofon wie heute (`micWav`, für die Stille ein zweiter Browser mit stummer Datei):
1. **Start:** `loopwerk.edition.id === 'make'`, Titel und Marke „Krachwerk“, 2 Spuren, 90 BPM, 0 Clips. `library.list()` enthält nur `category === 'own'` oder `pat-`. `sampledInstruments().length === 0`. Die Kit-Auswahl zeigt genau `elektro, techno`. Kein seitliches Scrollen, keine Konsolenfehler.
2. **Anfragen:** Unter `/assets/` gibt es nur `/assets/icons/`. Nichts aus `/src/werkstatt/` außer `sw.js` (Pfad `/werkstatt/sw.js`). Startzeit bis `ready` am Handy wird gemessen und ausgegeben (Wert für die `import()`-Entscheidung, ohne Grenze).
3. **Flächen:** Jedes Element aus der Tabelle in §2.2 hat `data-off` und ist unsichtbar. Import, Beat, Melodie, Einsingen und der Tonart-Streifen sind da.
4. **Übernahme:** Vor dem App-Start `loopwerk-make` mit drei Datensätzen im `bank.js`-Format füllen (`mk-…`, „Bumm 1“ `cls:'tief'`, „Ton A4 1“ `cls:'ton'`, „Schleife 1“ `cls:'loop', bars:1, bpm:90`). Dafür zuerst `/werkstatt/manifest.webmanifest` öffnen, damit der Ursprung derselbe ist. Erwartet: Alle drei stehen unter „Eigene“, die Schleife hat `kind 'loop'` und `beats 4`. Sound wählen und in Spur 1 tippen ergibt einen Clip. Offline-Render dieses Takts hat eine Spitze > 0,1 am Clipanfang ±2 ms.
5. **Aufnahme:** `#rec-btn` antippen, und zwar ohne Vorzähler: `engine.playing` ist bis zum Stopp `false`. Der Stopp kommt von selbst. Danach:
   - Sound `/^Bumm \d+$/`, mono, erstes Sample über 0,05 nach ≤ 10 ms, Spitze 0,89 ± 0,02, Säubern < 300 ms
   - Clip auf `t1` bei Schlag 0, `lengthBeats 4`, Loop `{on, 0, 4}`, `engine.playing`
   - **ein** `store.undo()` entfernt Clip und Loop
   - Offline-Render 1 Takt: 4 Anschläge an den Schlägen, je ±2 ms (Onsets mit `detectOnsets` aus `src/dsp/slice.js`)
   - Stille-Fixture → Einblender „Nichts gehört“, kein neuer Sound
6. **DSP** (die bisherigen Prüfungen, Import aus `src/dsp/`): Säubern (5 Prüfungen), Einordnen/Benennen (5), Anschläge 8 ± 5 ms (1).
7. **Speicher:** Nach dem Neuladen sind Clip und Sound wieder da. `indexedDB.databases()` enthält `loopwerk-make` und nicht `loopwerk`. Alle `localStorage`-Schlüssel beginnen mit `loopwerk.make.`.
8. **Datei hin und zurück:**
   - Krachwerk `#save-btn` → Download. `ownSounds` enthält `mk-` und `own-`, `version 1`.
   - In `/` öffnen: Clips und Sounds sind da, keine Fehler.
   - Loopwerk-Beispielprojekt speichern → in Krachwerk öffnen: gleiche Clip-Zahl, Platzhalter „Sound fehlt“. Speichern behält alle `sampleId`.
9. **PWA** (aus dem alten Test übernommen): Manifest, Icons, SW-Bereich `/werkstatt/`, Start ohne Netz mit eigenem Klang, `persist` einmal, iPhone-Tipp einmal.
10. **Pages-Build:** `_site/werkstatt/index.html` enthält `LOOPWERK_EDITION`, `src/main.js` und `Krach<b>werk</b>`, aber nicht `src/werkstatt/main.js`.
11. **Loopwerk unverändert:** `/` hat kein `[data-off]`. `#app.dataset.edition` ist `'full'`, die Dichte nicht `calm`. Die Schlüssel lauten wie bisher (`loopwerk.project.v1`, `loopwerk.snap`). `countUi` trifft `count-baseline.json` exakt.
12. **Zähltest:** die Budgets aus §6 für den jeweiligen Teil, Werte werden immer ausgegeben.

**Nur 1b, zusätzlich:**
- Werkbank: Desktop klappt bei Clipwahl auf, mit Breite 36 % ± 1. ⤢ macht 60 % ± 1 daraus und bleibt nach dem Neuladen. Am Handy öffnet „Werkbank“ die Schublade auf Mitte, 2 Spuren und die Marke bleiben sichtbar.
- Daumenleiste: 4 Ziele ≥ 44 px, unterer Rand ≤ 844.
- Werkzeug am Clip liegt innerhalb von `#arr-wrap` und deckt den Clip nicht ab. Kopie und Löschen sind je ein Undo-Schritt.
- Jedes `[data-tier="3"]` hat einen Eintrag in `EDITION.twins`, und M/S in der Spur-Werkbank schalten `track.mute/solo`.
- Kiste: Gruppen in der Reihenfolge Aufnahmen · Dateien · Schleifen · Strom.

**Bestehend:** `npm test` vollständig grün. In `package.json` bleibt `werkstatt.test.cjs` im Lauf, `count.cjs` ist kein eigener Test. Bilder mit `--shots`: `kw-start-handy`, `kw-clip-handy`, `kw-clip-desktop`, in 1b zusätzlich `kw-werkbank-handy` und `kw-breit-desktop`.

**Ohr-Test für Martin:** Klopfen und Klatschen am Handy klingen nach dem Säubern ohne Klick vorn und ohne Trittschall? Sitzt der Loop (4 Klopfer pro Takt) ohne Stolpern?

## 8. Reihenfolge
| # | Schritt | Dateien | Wer | parallel |
|---|---|---|---|---|
| 0 | Zähl-Hilfe und Loopwerk-Basis messen, **vor** jeder Änderung | `tests/count.cjs`, `tests/count-baseline.json` neu | qa | – |
| 1 | Edition-Tabelle, `lsKey`, Flächen | `src/edition.js`, `src/ui/surfaces.js` neu, `index.html` (`data-surface`, 1 CSS-Regel), `main.js`, `transport.js`, `zoombars.js`, `sheets.js`, `tips.js`, `library.js` | Haupt-Session | nach 0 |
| 2 | Kataloge entkoppeln, leerer Song, Platzhalter | `samples.js`, `sampler.js`, `model.js`, `main.js`, `ui/project-io.js`, `ui/pattern-editor.js` | Haupt-Session | nach 1 |
| 3 | OwnSounds je Edition, Prototyp-Felder, `isOwnId` | `own-sounds.js` | audio-engineer | mit 2 und 4 |
| 4 | DSP umziehen, Recorder `mode:'sound'`, Platzieren mit Loop | `src/dsp/clean.js`, `src/dsp/slice.js` (verschoben), `recorder.js`, `main.js` (`mountRecording`) | audio-engineer | nach 1, mit 3 |
| 5 | Seite, PWA, Rückbau | `tools/werkstatt-page.cjs`, `src/werkstatt/sw.js` (v2), `src/pwa.js` neu (Registrierung, `persist`, iPhone-Tipp aus dem alten `werkstatt/main.js`), löschen: `src/werkstatt/{main,bank,mic,groove,handoff}.js`, `werkstatt.css` | Haupt-Session | nach 1, mit 3 und 4 |
| 6 | Test neu (§7, Punkte 1–12) | `tests/werkstatt.test.cjs` | qa | ab 1 schreiben, am Ende laufen lassen |
| 7 | **Abschluss 1a:** `npm test`, Bilder, ROADMAP/CLAUDE.md (Krachwerk-Absatz) | `docs/ROADMAP.md`, `CLAUDE.md` | Haupt-Session | – |
| 8 | Dichte `calm`, Schriftskala, `data-tier`, Zwillinge, `place`-Variante | `index.html` (calm-Block, Tokens, `data-tier`), `edition.js`, `ui/place.js`, `ui/layout.js` | ui-engineer | – |
| 9 | Werkbank Desktop und Handy, M/S in der Spur | `index.html` (`#werkbank`), `ui/inspector.js`, `ui/sheets.js` (nur Name), `main.js` | ui-engineer | nach 8 |
| 10 | Daumenleiste, Song-Fach-Links | `ui/layout.js`, `ui/mobile.js`, `index.html` | ui-engineer | mit 9 |
| 11 | Werkzeug am Clip | `src/ui/clip-float.js` neu, `main.js` | Haupt-Session | mit 9 und 10 |
| 12 | Kiste nach Quelle, einklappbar | `ui/library.js`, `edition.js`, `index.html` | Haupt-Session | mit 9 bis 11 |
| 13 | **Abschluss 1b:** Budgets, Bilder, ui-designer-Review, CD-Durchsicht am Handy | `tests/werkstatt.test.cjs` (1b-Teil), `docs/ux/cd-review.md` | qa, creative-director | – |

## 9. Entscheidungen (selbst getroffen)
- **Keine Kopie der Prototyp-Daten:** Das Schema ist gleich, die `mk-`-IDs bleiben, `isOwnId` deckt sie ab.
- **Kataloge in Scheibe 1 nur abgeschaltet, nicht nachgeladen:** So bleibt Loopwerk risikofrei. `import()` erst nach der Startzeit-Messung.
- **Werkbank-Inhalt in Scheibe 1 = heutiger Inspektor.** Reduziert wird er mit dem Rezept in Scheibe 2. Scheibe 1 gewinnt die Ruhe über Lage, Stufen, Schrift und Rahmen.
- **Kiste gruppiert nach Quelle (Aufnahme/Datei/Schleife/Strom), nicht nach Körper/Dinge.** Das Material lässt sich nicht zuverlässig erkennen. Die Herkunft setzt man in Scheibe 2 selbst.
- **Loopwerk-Tipps aus, keine Startkarte:** Beides kommt mit eigenen Texten in Scheibe 4.
- **Unbekannte Clips behalten nur in Krachwerk** (`keepUnknownClips`), Loopwerk bleibt beim getesteten Verhalten.
- **Aufnahme in Krachwerk ohne Vorzähler und ohne Song-Mitlauf:** Für „erster Laut“ zählt der gesäuberte Anschlag auf dem Takt. Aufnahme über den laufenden Song mit Takes kommt in Scheibe 3.

Offene Fragen, die blockieren: keine.
