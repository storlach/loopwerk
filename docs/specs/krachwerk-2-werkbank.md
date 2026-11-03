# Krachwerk Scheibe 2: Sound-Werkbank

**Stand:** 02.11.2026 · **Grundlage:** `docs/ux/krachwerk-brainstorm/synthese.md` (maßgeblich), `ux.md` §c, `ui.md`, `architektur.md` §3, `docs/ux/cd-review.md` (Krachwerk Scheibe 1), ADR 007, **ADR 010 (Klang-Rezept)** · **Branch:** `werkstatt`
**Fester Rahmen:** Eine Änderung gilt für alle Clips dieses Sounds, daneben gibt es „Als Variante“. Sie wirkt sofort, ohne „Übernehmen“, und geht über ↶ zurück. Raum und Echo gehören zur Spur. Höchstens 5 Griffe je Reiter. Loopwerk bleibt optisch unverändert (`count-baseline.json` exakt). `PROJECT_VERSION` bleibt 1.

## 0. Ziel aus Nutzersicht
Martin tippt im laufenden Loop seinen „Bumm 1“ an, kürzt ihn auf der Welle, stimmt ihn tiefer, macht ihn dunkler und hört jede Änderung sofort in allen Clips. Mit „Als Variante“ bekommt ein einzelner Clip einen eigenen Klang. Der Sound hat in der Kiste und im Song dieselbe Herkunftsfarbe.

## 1. Umfang und Teilung
| | **2a Rezept und Werkbank** (diese Spec, zuerst) | **2b Zerlegen** (eigene kurze Spec) |
|---|---|---|
| Inhalt | Rezept-Modell, Backen in der Library, Store-Aktionen, Varianten · Sound-Werkbank mit Welle (Anfang/Ende/Hüllkurve) und den Reitern **Form · Ton · Farbe · Zeit · Clip** · Herkunft als Kopfzeile mit Material und Stammbaum · Herkunftsfarben in Kiste und Song · Spur-Werkbank nur bei Spurwahl · offene Punkte aus dem CD-Review (#7 Farbe/Griffe, #8 Fachleiste/Panorama am Desktop, #6 Zeichen) | Reiter **Zerlegen** („An Anschlägen“, „In 8 gleiche“, Empfindlichkeit; Ergebnis: Schnitte in der Kiste oder Clips auf der Spur). Schnitte sind Varianten mit `start`/`end` (Modell aus 2a, nichts Neues). Autotune und Trennen ziehen in Ton- bzw. Zerlegen-Feinheiten, der Editor fällt in Krachwerk weg |
| Zeigbar | Ablauf aus §0 am Handy und am Desktop | 10 s Klopfen → 8 Schnitte → Clips auf Spur |

**Nicht in 2:** Kit- und Instrument-Objekt, Pad-Wand (Scheibe 4) · Takes und Festhalten (3) · Song-Werkbank, Mastering (5) · Rezept für Musterspuren `pat-…` (Pattern-Editor, 4) · Werkbank in Loopwerk.

**Reiter-Namen (selbst entschieden):** Die Synthese nennt „Schnitt · Ton · Hülle · Farbe · Zeit · Zerlegen“. Schnitt und Hülle liegen beide als Griffe auf der Welle, darum bekommen ihre Zahlen einen gemeinsamen Reiter **Form** (wie `ux.md`). Dazu kommt der Reiter **Clip** (Frage „wo/wie laut“). Er steht nur, wenn ein Clip gewählt ist, und ist durch eine Linie abgesetzt. Der CD prüft das bei der Durchsicht.

## 2. Datenmodell
Neues optionales Feld `project.recipes`. Schlüssel ist die Sound-ID. Fehlende Felder haben den Standardwert, ein leeres Rezept wird gelöscht. Zeiten in Sekunden des Originals (sie hängen nicht am Tempo, Positionen im Song bleiben in Schlägen).

| Feld | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `parent` | Sound-ID | – | nur Variante/Schnitt: Ton kommt aus `orig` dieses Sounds (ohne dessen Rezept) |
| `name` | Text ≤ 40 | – | Anzeigename (Pflicht bei `parent`, sonst Umbenennen ohne IndexedDB) |
| `material` | `koerper·dinge·stimme·strom·schleife` | – (Vorschlag §5) | Herkunft, vom Nutzer gesetzt |
| `start`, `end` | 0 … Dauer, `end − start ≥ 0,01` | 0, Dauer | Ausschnitt |
| `attack` | 0 … 2000 ms | 0 | Anschlag, linear |
| `release` | 0 … 5000 ms | 0 | Ausklang am Ende des Ausschnitts, Kurve (1−x)² |
| `gain` | −24 … +12 dB, Raster 0,5 | 0 | Lautstärke des Sounds |
| `reverse` | bool | false | rückwärts |
| `semis` | −24 … +24, ganzzahlig | 0 | Halbtöne (Neuabtastung: Einzelklang wird kürzer/länger, Loop behält seine Schläge) |
| `cents` | −100 … +100 | 0 | Feinstimmung |
| `lp` | 200 … 20000 Hz, log | 20000 = aus | Tiefpass 12 dB/Okt. |
| `hp` | 20 … 2000 Hz, log | 20 = aus | Hochpass 12 dB/Okt. |
| `res` | 0 … 1 | 0 | Resonanz des Tiefpasses (Q 0,707 … 8) |
| `warm` | 0 … 1 | 0 | Wärme: tanh-Sättigung, RMS ausgeglichen |
| `grain` | 0 … 1 | 0 | Körnung (Bits 16 → 4, Halten bis 8 Samples), nur Feinheiten |
| `stretch` | 0,5 … 2 | 1 | Dehnen mit gleicher Tonhöhe, nur Einzelklang (Loops: Länge über `sampleTempo`) |

- Einzelklang oder Loop und die Länge in Schlägen bleiben im vorhandenen `project.sampleTempo` (Reiter Zeit benutzt `setSampleTempo`, nichts doppelt).
- **Variante:** ID `vr-` + Zeitstempel (base36) + 4 Zufallszeichen, `recipes[vr] = { parent: <Wurzel>, name: „Bumm 1 b“, …Rezept der Vorlage }`. `parent` zeigt immer auf einen Sound mit Audio, nie auf eine Variante. Eine Variante einer Variante kopiert deren Rezept und erbt ihre Wurzel.
- Laden: `validate` erlaubt `recipes` nur als Objekt. `normalizeRecipe` kappt Werte und verwirft unbekannte Felder. Fehlt der Eltern-Sound einer Variante, wird sie zum Platzhalter „Sound fehlt“ (`keepUnknownClips`).
- Projektdatei: `recipes` steht im Projekt-JSON. `OwnSounds.embed` bettet zusätzlich die `parent` aller benutzten Varianten ein. Ältere Loopwerk-Stände ignorieren das Feld.
- Geteilte Bausteine in **neu `src/recipe.js`** (ohne Audio, auch vom Store genutzt): `RECIPE` (Tabelle oben: min, max, Standard, Raster), `normalizeRecipe(r)`, `recipeKey(r)` (stabiles JSON), `MATERIALS` (§5), `suggestMaterial(sample)`, `recipeSteps(r)` (Wörter für den Stammbaum).

## 3. Store-Aktionen (`src/model.js`)
| Aktion | Verhalten |
|---|---|
| `setRecipe(id, patch, { coalesce } = {})` | `null` im Patch = Standard. Normalisiert, keine Wirkung bei Gleichstand, löscht leere Einträge. Label `'recipe'`. Ziehen: je Geste ein Schlüssel `rcp-${id}-${feld}-${n}` = ein Undo-Schritt (Muster aus `clip-speed.js`, `GESTURE_GAP` 600 ms) |
| `addVariant(id, { clipId } = {}) → vrId` | `batch('Als Variante')`: legt das Rezept an, kopiert `sampleTempo[id]`, setzt bei `clipId` den Clip auf die Variante. Ein Undo-Schritt |
| `removeVariant(id)` | nur wenn kein Clip sie nutzt, sonst keine Wirkung (UI: Einblender „Wird noch in 2 Clips benutzt.“) |
| `clearSong()` | löscht zusätzlich `recipes` |

Material und Name laufen über `setRecipe(id, { material })` bzw. `{ name }`. `OwnSounds` speichert das zuletzt gesetzte Material zusätzlich als Vorschlag am Datensatz (`rec.material`, außerhalb des Undo, nur Vorbelegung für neue Projekte).

## 4. Engine (ADR 010: gebacken, eine Kette)
**Kein neuer Knoten.** `startVoice`, `buildMix`, `clipPieces` und der Scheduler bleiben unverändert. Das Rezept ändert den Puffer, die Engine merkt das an `rev` in `_sig` und plant live neu (`_resync`: alte Stimme blendet aus, neue setzt mit ±96 Samples Überblendung an derselben Stelle ein).

**Library (`src/samples.js`):**
- `s.cooked`: Ergebnis aus `orig` und Rezept, `null` ohne Rezept. Neu `library.source(id) = s.cooked ?? s.orig`. `_prepare` sowie `applySampleTempo` (Dauer für bpm) lesen `source`, und `_tag` enthält `recipeKey`. `instruments.js` (Z. 278, 422) liest `source` statt `orig`. `orig` bleibt das unveränderte Original (Editor, `embed`).
- `async applyRecipes(project)` ersetzt den Aufruf in `mountSampleTempo`. Die neue Wurzelfunktion `mountSoundState` in `main.js` arbeitet erst Rezepte, dann Sound-Tempo in einer Kette ab, in beiden Editionen. Varianten werden registriert als `{ id, name, category:'own', made: parent.made, parentId, orig: parent.orig (derselbe Puffer), duration }`, Einträge ohne Rezept fallen weg. Lazy-Eltern werden vorher geladen. Je Sound wird höchstens ein Auftrag gleichzeitig gerechnet, kommt währenddessen ein neuer, gilt nur der jüngste. Danach `library.emit()` und `engine.refresh()` (ohne Stopp, anders als heute bei Sound-Tempo).
- Gedehnte Clip-Fassungen (`clip.stretch` ohne Tonband): `_stretchedOf(base, f, { stale:true })` gibt die alte Fassung zurück, solange die neue rechnet und `lengthBeats` gleich bleibt. So gibt es beim Filterziehen keine Lücke. `sampleFor` ruft das mit `stale:true` auf, die Signatur enthält das `rev` der Fassung.
- `renderProject` beginnt mit `await library.applyRecipes?.(project)` (gleicher Schlüssel → sofort fertig). Export und Tests klingen damit garantiert nach dem aktuellen Rezept.

**Backen (`src/dsp/recipe.js`, neu, reines JS):** `cookRecipe(chs, sampleRate, r) → chs`, feste Reihenfolge:
1. Ausschnitt `start…end` · 2. rückwärts · 3. Dehnen (`timeStretch`, `loop:false`) · 4. Tonhöhe `2^((semis + cents/100)/12)`, kubisch (`edit.js pitch`), beim Hochstimmen vorher Tiefpass bei 0,45·sr/Faktor (2 Biquads in Reihe) · 5. Hochpass, Tiefpass (RBJ-Biquad) · 6. Wärme `tanh(k·x)` mit k = 1 + 7·warm, danach auf das RMS vor der Stufe ausgeglichen und auf Spitze ≤ 1 gekappt · 7. Körnung · 8. Gain · 9. Hüllkurve. **Klickschutz:** An jeder geschnittenen Kante (`start > 0`, `end < Dauer`, bei `reverse` beide) gilt eine Mindestblende von 2 ms, auch bei Anschlag oder Ausklang 0.
- Kosten: Ohne Dehnen und unter 20 s Stereo rechnet der Hauptthread (Ziel < 15 ms für 10 s, gemessen). Sonst Job `recipe` im Worker (`src/dsp/worker.js`, `runJob`).

**Zusammenspiel:**
| mit | Wirkung |
|---|---|
| Clip-Geschwindigkeit (`clip.stretch`) | wirkt auf den gebackenen Puffer; die gedehnte Fassung hängt an `baseRev` und wird neu gerechnet (alte gilt solange, s. o.) |
| „wie Tonband“ (`varispeed`) | `playbackRate` auf den gebackenen Puffer, ohne Neuberechnung; die Tonhöhe addiert sich zu `semis` |
| Tempo-Fassungen | `_prepare` passt `cooked` wie heute `orig` an (Einzelklang auffüllen, Loop strecken). Tempowechsel backt nicht neu |
| Tonart-Fassungen | betreffen nur `def`/`transpose`-Sounds, eigene Sounds folgen der Tonart nicht. „Auf Tonart“ setzt nur `semis` |
| Clip-Blenden, Clip-Lautstärke | Hüllkurve des Clips (`envelopeAutomation`) über dem Sound, unverändert. Die Hüllkurve des Sounds wirkt je Wiederholung, die Blende des Clips einmal je Clip |
| Automation, Spur-Effekte | unverändert (Spur-Ebene) |

## 5. Herkunft
`MATERIALS` (in `src/recipe.js`), Farben nur über vorhandene Tokens:

| id | Wort | Farbe (`colorCat`) | Vorschlag, wenn nicht gesetzt |
|---|---|---|---|
| `koerper` | Körper | `--cat-drums` | – (nur von Hand) |
| `dinge` | Dinge | `--cat-fx` | Aufnahme oder Datei ohne Ton |
| `stimme` | Stimme | `--cat-synth` | `made.cls === 'ton'` |
| `strom` | Strom | `--cat-bass` | `pat-…` |
| `schleife` | Schleife | `--cat-chords` | `made.from === 'loop'` oder `kind === 'loop'` |

- Reihenfolge: `recipes[id].material` → `rec.material` (letzte Wahl) → Vorschlag. Mit der Option `materialColors` (nur `make`, aus `main.js`) setzt die Library `s.colorCat` danach. Arranger, Glühen, Werkbank und Kiste lesen dieselbe `colorCat`. **Damit sind Kiste und Song gleich gefärbt (CD #7)**, und Pink `--cat-own` bleibt nur Marke und Mikrofonlicht. In Loopwerk bleibt `colorCat` leer.
- **Kiste:** Gruppen sind jetzt **Körper · Dinge · Stimme · Strom · Schleife** (`EDITION.shelfGroups` neu, `library.js` nimmt `suggestMaterial` statt `FROM`/`originCat`). Die Quelle (Aufnahme/Datei) steht im Stammbaum. Varianten stehen direkt unter ihrem Eltern-Sound, eingerückt.
- **Material setzen:** Tipp auf den Herkunftspunkt im Kopf der Werkbank öffnet eine Zeile mit 5 Punkten samt Wort. Ein Tipp setzt das Material (ein Undo-Schritt). Das sind 2 Tipps.
- **Stammbaum-Zeile** (13 px, `--muted`, eine Zeile mit Auslassung, voller Text im `title`): `{Material} · {Aufnahme|Datei|Schleife|Strom} {TT.MM. HH:MM} → {Schritte} · {Dauer} s`. Schritte aus `recipeSteps` in fester Reihenfolge: gekürzt, rückwärts, gedehnt 150 %, gestimmt −3, gefiltert, wärmer, körnig, lauter/leiser. Varianten bekommen vorn „Variante von Bumm 1 →“. `toSample` übernimmt dafür `rec.created`. Beispiel: „Dinge · Aufnahme 02.11. 21:14 → gekürzt · gestimmt −3 · gefiltert · 0,41 s“.
- **Roh → geformt:** Im Song zeichnet ein Clip, dessen Sound ein Rezept hat, die Welle als Linie, ohne Rezept als Punkte (Korn). Option `grainWave` am Arranger aus `main.js`, Prüfung durch den ui-designer.

## 6. Werkbank-Oberfläche
**Einbau ohne `if (edition)`:** `main.js` übergibt `mountInspector` die Optionen `clipPanel: EDITION.workbench === 'sound' ? mountSoundBench : null`, `trackOnClip: false` und `fxCompact: true`. Mit `clipPanel` ersetzt das Modul den Clip-Abschnitt, und die Spur zeigt sich nur bei eigener Spurwahl. Ohne die Optionen bleibt Loopwerk wie heute. Neu `src/ui/sound-bench.js` (Kopf, Reiter, Griffe) und `src/ui/wave-handles.js` (Welle mit Griffen). CSS im calm-Block unter einem Abschnitt `/* Werkbank */`, höchstens 120 Zeilen, nur Tokens.

**Inhalt je Auswahl:**
| Auswahl | Werkbank zeigt |
|---|---|
| Clip (eigener Sound) | Kopf · Welle · Reiter Form Ton Farbe Zeit · Clip |
| Sound in der Kiste (lange drücken bzw. Doppelklick) | dasselbe ohne Reiter Clip, „in N Clips“ |
| Clip mit `pat-…` | Kopf · Reiter Clip · Verweis „Muster bearbeiten“ (heutiger Pattern-Editor) |
| Clip mit fehlendem Sound | Kopf „Sound fehlt“ und Stammbaum, sonst nichts |
| Spur (Name antippen) | M · S · Lautstärke · Panorama · + Effekt; darunter nur die Effekte, die an sind; Verlauf/Kurven unter Feinheiten |
| nichts | Song wie in Scheibe 1 (Umbau Scheibe 5), dazu neu „Mischen“ und „FX-Pad“ als Verweise (CD #8) |

**Kopf:** Herkunftspunkt (Tipp → Material) · Name (Tipp → umbenennen inline, `setRecipe {name}`) · „in 3 Clips“ · **Als Variante**. Darunter die Stammbaum-Zeile.

**Welle** (`wave-handles.js`, volle Breite, Desktop 120 px, Handy 96 px): Innerhalb von Anfang/Ende ist die gebackene Welle ein Lichtstrich in Herkunftsfarbe, außerhalb ist das Original Korn mit 30 %. Die Darstellung folgt der Abspielrichtung, gespeichert wird in Originalzeit (die Umrechnung macht `wave-handles.js`). 4 Griffe als `role=slider`: **Anfang**, **Ende** (senkrechte Linien), **Anschlag**, **Ausklang** (Punkte auf der Hüllkurven-Linie oben). Pfeiltasten verschieben um 10 ms, mit Umschalt um 100 ms. Doppelklick setzt auf Standard. Griffe nehmen nur waagerechte Züge an (`touch-action: pan-y`), Tippziel ≥ 44 px. Ein Tipp auf die Welle außerhalb der Griffe hört den Sound einmal vor (Vorhör-Weg der Kiste). Beim Spielen läuft eine Marke durch die Welle.

**Reiter** (`role=tablist`, gewählter Reiter je Objektart gemerkt in `lsKey('loopwerk.wbTab')`, Feinheiten je Reiter in `lsKey('loopwerk.wbFine')`). Ein Griff ist ein zählbares Bedienelement. Grund ≤ 5 ist eine harte Grenze:

| Reiter | Grund (sichtbar) | Feinheiten (aufgeklappt) |
|---|---|---|
| **Form** | Lautstärke (dB) · Anschlag (ms) · Ausklang (ms) · Rückwärts | Anfang/Ende als Zahl · Auf Spitze (setzt `gain` auf −1 dBFS Spitze) · Stille abschneiden (setzt `start`/`end` aus `soundBounds`) · Zurücksetzen |
| **Ton** | Halbtöne (− Wert +) · Feinstimmung (Cent) · Auf Tonart (rundet den erkannten Grundton per `snapToScale` auf die Song-Tonart, setzt `semis`) | erkannter Grundton (Anzeige, YIN im Worker) · Zurücksetzen · 2a: „Im Editor (Autotune, Trennen)“ |
| **Farbe** | Tiefpass („dunkler“) · Hochpass („dünner“) · Resonanz · Wärme | Körnung · Zurücksetzen |
| **Zeit** | Einzelklang \| Loop (2 Knöpfe) · bei Loop: Länge in Schlägen mit ÷2 · ×2, bei Einzelklang: Dehnen (50–200 %) | Als Song-Tempo · Wie geliefert (bisheriger Sound-Tempo-Block aus `sound-tempo.js`) |
| **Clip** | Lautstärke · Einblenden · Ausblenden · Geschwindigkeit · wie Tonband | Kurve ein/aus · ½× 1× 2× |

Regler sind Linien mit Wert in Mono (Zahlen) und Wort in Sans. Gesperrte Griffe stehen nicht da (Dehnen fehlt bei Loop, ÷2 ×2 fehlt bei Einzelklang).

**Wohin der heutige Inspektor wandert (nur Krachwerk; Loopwerk unverändert):**
| heute (`inspector.js`) | Krachwerk 2a | Loopwerk |
|---|---|---|
| Clip-Titel, Farbfeld, Meta | Kopf + Stammbaum | bleibt |
| Lautstärke, Ein-/Ausblenden, Kurven | Reiter Clip (Kurven: Feinheiten) + Griffe am Clip | bleibt |
| Geschwindigkeit, Tonband, ½× 1× 2× (`clip-speed.js`) | Reiter Clip (Chips: Feinheiten), Modul wiederverwendet | bleibt |
| Sound-Tempo (`sound-tempo.js`) | Reiter Zeit | bleibt |
| Bearbeiten (`#edit-btn`) | Ton-Feinheiten „Im Editor“ (2a), entfällt mit 2b | bleibt |
| Teilen, Kopie, Löschen | Werkzeug am Clip (seit 1b) | bleibt |
| Spur-Abschnitt beim Clip | nur bei Spurwahl | bleibt |
| alle Effekte untereinander | nur aktive + „+ Effekt“ (Liste der übrigen) | bleibt |
| Desktop-Fachleiste Mixer · FX-Pad · Editor · Tastenkürzel | Stufe 3; Zwillinge: Song-Werkbank „Mischen“, „FX-Pad“, Werkbank, Tastenkürzel unter Song → Hilfe (`EDITION.twins`) | bleibt |
| Panorama-Knopf im Spurkopf (Desktop) | Stufe 3, Zwilling Spur-Werkbank | bleibt |

**Desktop:** rechts 36 %, ⤢ 60 % der Breite rechts der Kiste, und die Kiste klappt dabei zu (Auflage aus CD-Review 1). Die Welle nutzt die volle Breite der Werkbank. **Handy:** Schublade `#werkbank` (zu / Mitte / oben). Auf „zu“ (56 px) stehen Kopf und Als Variante, auf „Mitte“ Kopf, Welle, Reiterleiste und der Grund des gewählten Reiters. Song, 2 Spuren und die Marke bleiben sichtbar. Ziehen geht nur am Griffband, die Welle nimmt nur waagerechte Züge.

**Ebenfalls in 2a (CD-Review, Abschnitt 3):** #7: Griffe für Ein- und Ausblenden unter der Namenszeile des Clips, am Handy bekommt der Spurname den Platz des ⋯. #8: siehe Tabelle. #6: Krachwerk-Zeichen im Deck statt `#brand-bars` (motion-designer, die Funken aus `glow.js` hängen weiter daran).

**Tipps (Grundfunktionen):** Rückwärts: Clip antippen → Rückwärts = **2** (Form ist der Standard-Reiter). Kürzen: Clip → Ende-Griff ziehen = 1 + Zug. Tiefer: Clip → Ton → − = 3. Variante: Clip → Als Variante = 2. Material: Clip → Punkt → Material = 3.

## 7. Zähl-Budgets 2a (`tests/count.cjs`, Wer überschreitet, streicht)
| Bild | Scheibe 1 gemessen | **2a** |
|---|---|---|
| Desktop *Clip gewählt* Bedienelemente / Rahmen / Schriftgrößen / kleinste | 54 / 30 / 4 / 11 | **≤ 45 / ≤ 30 / ≤ 5 / ≥ 11** |
| Handy *Clip gewählt* | 18 / 8 / 4 / 11 | **≤ 18 / ≤ 8 / ≤ 5 / ≥ 11** |
| Handy *Werkbank Mitte* (Clip, Reiter Form) | 23 / 13 | **≤ 26 / ≤ 13 / ≤ 5 / ≥ 11** |
| je Reiter: Bedienelemente im Grund (`[role=tabpanel]:not([hidden]) .wb-grund`) | – | **≤ 5**, jeder Reiter einzeln geprüft |
| Weißglut außer Linse und Marke | – | **≤ 1** (gewählter Clip) |
| Loopwerk alle Bilder | Basis | **exakt** `count-baseline.json` |

## 8. Testplan
**Neu `tests/recipe.test.cjs`** (Browser, `window.loopwerk`, Signale nach Skill `audio-test`, Rauschen mit `mulberry32`, `limiter:false`). Testsound: eigener Sound, registriert mit `orig`.
1. **Leeres Rezept ist bitgleich:** `setRecipe` und danach Zurücksetzen → `buffer` gleich dem Stand ohne Rezept (größte Abweichung 0).
2. **Ausschnitt:** Impulse bei 0,10 und 0,30 s, `start 0,20` → im Offline-Render erster Impuls bei Frame (0,10·sr) ±1, davor < 1e-4.
3. **Klickfrei:** Sinus 1 kHz mit 0,8, `start` mitten in einer Periode, `end` 0,25 s, Clip über 2 Takte (Wiederholungen) → erstes Sample < 0,01, größter Sprung zwischen Nachbar-Samples < 0,05.
4. **Hüllkurve:** Gleichspannung 1,0, `attack 100` → bei 0/50/100 ms 0 / 0,5 / 1 (±0,02). `release 200` → 100 ms vor Ende 0,25 ± 0,02, letztes Sample < 0,01.
5. **Lautstärke:** +6 dB auf Sinus 0,25 → Spitze 0,5 ± 0,5 dB. Auf Spitze → −1 dBFS ± 0,1.
6. **Rückwärts:** Impuls bei 0,1 s in 0,5 s → bei 0,4 s ±1 Frame.
7. **Tonhöhe:** Sinus 440 Hz, `semis +12` → FFT-Spitze 880 Hz ± 1 Bin, Einzelklang-Dauer halb (±1 Sample vor dem Auffüllen). `cents +100` = gleiche Frequenz wie `semis +1` (±0,5 %). Loop mit `semis +12`: `lengthBeats` unverändert, 880 Hz.
8. **Filter:** weißes Rauschen. `lp 500` → Band > 4 kHz mindestens 24 dB leiser, Band < 200 Hz ± 1 dB. `hp 1000` → Band < 100 Hz mindestens 24 dB leiser.
9. **Wärme 1:** Sinus 0,5 → 3. Oberton ≥ −30 dB zur Grundwelle, Spitze ≤ 1, RMS ± 1 dB zum Eingang.
10. **Dehnen 2:** Dauer ×2 ± 1 %, Frequenz ± 1 %.
11. **Alle Clips, Variante:** 2 Clips desselben Sounds, `gain −12` → beide −12 ± 0,5 dB. Nach `addVariant(id, {clipId: c2})` und `setRecipe(vr, {gain:0})` hat c2 0 dB, c1 −12 dB. `get(vr).orig === get(id).orig`. Ein `undo()` stellt beide Clips und `recipes` zurück.
12. **Undo beim Ziehen:** 30 × `setRecipe` mit demselben `coalesce` → genau ein neuer Undo-Schritt. Nach `undo()` gilt wieder Prüfung 1.
13. **Offline wartet:** `setRecipe({lp:300})` und sofort danach `renderProject` (ohne zu warten) → das Band > 2 kHz ist mindestens 20 dB leiser.
14. **Live ohne Stopp (grob):** Engine spielt, `setRecipe` → innerhalb von 500 ms trägt eine eingeplante Stimme das neue `rev`. `engine.playing` blieb durchgehend `true`, `heardBeat` steigt stetig.
15. **Gedehnter Clip:** Clip mit 80 %, kein Tonband, `setRecipe({lp})` → `sampleFor` ist nie `null` (alle 10 ms geprüft, bis die neue Fassung da ist).
16. **Datei:** Speichern → `recipes` und `version 1` vorhanden. `ownSounds` enthält den Eltern-Sound einer Variante, die nur über die Variante benutzt wird. Datei in `/` öffnen → Offline-Render gleich Krachwerk (größte Abweichung < 1e-4).
17. **Kosten:** Backen von 10 s Stereo mit allen Feldern außer `stretch` wird gemessen und ausgegeben. Grenze < 60 ms (headless Desktop).

**`tests/werkstatt.test.cjs`, neuer Teil 2a** (Handy 390×844 Touch und Desktop 1400×820):
- Clip wählen → Kopf mit Name und „in 1 Clip“, Reiter Form gewählt, Reiter Form, Ton, Farbe, Zeit und Clip (`role=tab`). Neu laden → der Reiter bleibt gemerkt.
- Zähltest je Reiter (≤ 5) und die Budgets aus §7.
- Welle: 4 `role=slider`. `ArrowRight` am Anfang → `start` + 0,01. Mit der Maus am Ende ziehen → ein Undo-Schritt. Am Handy verschiebt waagerechtes Ziehen auf der Welle nicht die Schublade.
- Rückwärts in 2 Tipps ab nichts gewählt (Clip, Rückwärts) → `reverse` ist gesetzt, ein `undo()` hebt es auf.
- Als Variante → `sampleId` beginnt mit `vr-`, der andere Clip bleibt, der Kopf zeigt die Variante, die Kiste zeigt sie unter dem Eltern-Sound.
- Material „Körper“ → der Clip im Song hat `cat-drums`. Die berechnete Farbe des Punkts in der Kiste ist gleich der Clipfarbe. Gruppe „Körper“ enthält den Sound. Stammbaum passt auf `/^Körper · Aufnahme .*→ .*rückwärts/`.
- Spur antippen → Spur-Werkbank ohne Reiter. Nur aktive Effekte sind sichtbar, „+ Effekt“ ist da.
- Desktop: Fachleiste nicht sichtbar, Zwillinge in `EDITION.twins`. Spurkopf ohne Panorama-Knopf.
- **Loopwerk unverändert:** Auf `/` ist bei gewähltem Clip `#insp-speed` da und `.wb-tabs` nicht. `countUi` trifft die Basis exakt. Keine Konsolenfehler.

**Bilder** (`--shots`): `kw-werkbank-handy` (Mitte, Form), `kw-werkbank-ton-handy`, `kw-clip-desktop`, `kw-breit-desktop`, `kw-kiste-desktop`. Dazu ui-designer-Review und CD-Durchsicht am echten Handy.

**Ohr-Test für Martin:**
1. Den Loop laufen lassen und den Tiefpass langsam ganz zu und wieder auf ziehen. Knackst oder stottert es bei den Zwischenschritten?
2. Den Ende-Griff eines Klopfers nah an den Anschlag ziehen. Bleibt der Schnitt ohne Klick, und klingt der Ausklang natürlich oder abgehackt?
3. Halbtöne −12 und +12 auf eine Stimm-Aufnahme. Ist die Qualität für dich brauchbar (kubische Neuabtastung, „Micky Maus“ ist hier gewollt)?
4. Wärme ganz auf, an Klopfen und an Stimme. Ist das „warm“ oder schon „kaputt“?
5. Einen Einzelklang kürzen, sodass er in der Wiederholung dichter läuft (1 statt 2 Schläge). Überrascht dich das oder hilft es dir?

## 9. Reihenfolge
| # | Schritt | Dateien | Wer | parallel |
|---|---|---|---|---|
| 0 | Basis nachmessen, Gerüst von `recipe.test.cjs` mit Prüfungen 1–10 (scheitern erst) | `tests/recipe.test.cjs` neu, `package.json` | qa | – |
| 1 | Rezept-Tabelle, Material, Stammbaum-Wörter · Store-Aktionen | `src/recipe.js` neu, `src/model.js` | audio-engineer | – |
| 2 | Backen, Worker-Job, Library (`cooked`, `source`, `applyRecipes`, Varianten, alte Dehnfassung gilt weiter), `renderProject` wartet, `instruments.js` | `src/dsp/recipe.js` neu, `src/dsp/worker.js`, `src/samples.js`, `src/engine.js` (1 Zeile), `src/instruments.js` | audio-engineer | nach 1 |
| 3 | Wurzel: `mountSoundState`, Optionen `clipPanel`/`trackOnClip`/`fxCompact`/`materialColors`/`grainWave`, Edition-Tabelle (`workbench`, `shelfGroups` neu, `twins`) · `embed` mit Eltern, `created`, `rec.material` | `src/main.js`, `src/edition.js`, `src/own-sounds.js` | Haupt-Session | nach 2 |
| 4 | Welle mit Griffen | `src/ui/wave-handles.js` neu | ui-engineer | ab 1 |
| 5 | Sound-Werkbank (Kopf, Stammbaum, Reiter, Feinheiten), Inspektor-Optionen, Spur kompakt | `src/ui/sound-bench.js` neu, `src/ui/inspector.js`, `src/ui/clip-speed.js`/`sound-tempo.js` (nur einbettbar machen), `index.html` (Abschnitt `/* Werkbank */`) | ui-engineer | nach 3 und 4 |
| 6 | Kiste nach Material, Varianten eingerückt · Arranger Korn/Linie, Blendengriffe unter dem Namen · Fachleiste und Panorama in Stufe 3 | `src/ui/library.js`, `src/ui/arranger.js`, `src/ui/layout.js`, `index.html` | ui-engineer | mit 5 |
| 7 | Krachwerk-Zeichen im Deck | `index.html`, `src/ui/glow.js`, `assets/icons/` | motion-designer | mit 5 |
| 8 | Prüfungen 11–17, UI-Teil 2a, Budgets | `tests/recipe.test.cjs`, `tests/werkstatt.test.cjs` | qa | ab 3 |
| 9 | **Abschluss 2a:** `npm test`, Bilder, ui-designer-Review, CD-Durchsicht, ROADMAP, CLAUDE.md (Rezept-Satz unter Technik, ADR 010) | `docs/ROADMAP.md`, `CLAUDE.md`, `docs/ux/cd-review.md` | Haupt-Session, ui-designer, creative-director | – |

Vor Schritt 2 lädt der audio-engineer den Skill `audio-engine-regeln`.

## 10. Selbst entschieden
- **Alles gebacken, keine Knoten je Stimme** (ADR 010): eine Kette, Offline gleich Realtime ohne eigenen Nachweis je Knoten.
- **Rezept im Projekt, Material zusätzlich als Vorschlag am Datensatz:** Undo bleibt im Store, und neue Projekte erben trotzdem die letzte Wahl.
- **Varianten ohne eigenes Audio** und mit `parent` auf die Wurzel. Damit sind die Schnitte aus 2b fertig modelliert.
- **Kiste nach Material statt nach Quelle:** Mit setzbarem Material ist die Gruppe gleich der Farbe. Die Quelle steht im Stammbaum.
- **Engine-Teil in beiden Editionen, Werkbank nur in Krachwerk:** Dateien klingen überall gleich, und Loopwerk sieht unverändert aus.
- **Reiter Form statt Schnitt + Hülle, dazu Reiter Clip** (§1).

Offene Fragen, die blockieren: keine.
