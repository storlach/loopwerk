# Krachwerk Scheibe 2b: Zerlegen

**Stand:** 03.11.2026 · **Grundlage:** `krachwerk-2-werkbank.md` §1 (Teilung), ADR 008, `ux.md` (Reiter Zerlegen), `cd-review.md` (2a) · **Branch:** `werkstatt`
**Rahmen:** Loopwerk unverändert (`count-baseline.json` exakt), Krachwerk nur über Edition-Optionen, ≤ 5 Grund-Griffe je Reiter, ein Undo-Schritt je Zerlegen, Schnitte nicht-destruktiv, `PROJECT_VERSION` bleibt 1.

## 0. Ziel aus Nutzersicht
Martin klopft 10 s auf den Tisch, tippt den Clip an, dann „Zerlegen“ und „Auf die Spur“: Aus einem Clip werden 8 Schnitte, die genauso klingen wie vorher und jetzt einzeln verschoben, gestimmt und gefiltert werden können.

## 1. Umfang
**Drin:** Reiter **Zerlegen** (An Anschlägen · In 8 gleiche · Empfindlichkeit · In die Kiste · Auf die Spur), Marken auf der Welle (verschieben, löschen), Schnitte als Varianten mit Gruppe, Kiste faltet Schnitte. **Autotune** wird Rezeptschritt (Ton-Feinheiten), **Trennen** steht in den Zerlegen-Feinheiten. Der **Sample-Editor fällt in Krachwerk weg**, alle Funktionen haben Zwillinge (§6). Aus dem CD-Review 2a: **Werkbank für einen Sound aus der Kiste** (lange drücken/Doppelklick, für „In die Kiste“ nötig), **56-px-Zustand** der Handy-Schublade (Kopf + Als Variante), **Krachwerk-Zeichen im Deck** (motion-designer, parallel).
**Nicht drin:** Kit/Instrument als Ergebnis und Pads (Scheibe 4), Marken hinzufügen (Weg: Empfindlichkeit oder Anzahl), nachträgliches Neu-Zerlegen einer Gruppe, „Unbenutzte löschen“, Zerlegen in Loopwerk.

## 2. Bedienung
**Ablauf „10 s Klopfen → 8 Schnitte → Clips auf Spur“:** Clip antippen (1) → Reiter Zerlegen (2): Marken erscheinen sofort („An Anschlägen“ ist Voreinstellung, Empfindlichkeit gemerkt in `lsKey('loopwerk.cutSens')`, Standard 0,5) → **Auf die Spur** (3). **3 Tipps.** Findet die Erkennung 7 oder 9, reicht ein Zug an Empfindlichkeit, alternativ „In 8 gleiche“ (+1 Tipp).

| Grund (≤ 5) | Wirkung |
|---|---|
| An Anschlägen \| In 8 gleiche | 2 Umschalter (`wb-toggle`), wählen die Marken-Quelle |
| Empfindlichkeit | Linie 0…1, Marken folgen live (nur bei Anschlägen, sonst nicht da) |
| In die Kiste | legt die Schnitte als Gruppe an, Einblender „8 Schnitte in der Kiste“ |
| Auf die Spur | wie „In die Kiste“ und ersetzt den gewählten Clip durch die Schnitt-Clips an denselben Stellen. Aus der Kiste geöffnet: gewählte Spur ab Marke, sonst neue Spur |

**Feinheiten:** Anzahl gleiche 2 · 4 · 8 · 16 · Ins Raster (aus; Clip-Anfänge rasten auf `ui.grid`) · **Trennen:** Stimme weg · Nur Stimme · In 4 Ebenen.

**Marken auf der Welle** (nur im Reiter Zerlegen; die 4 Griffe aus 2a sind dann ausgeblendet): senkrechte Linien in `--fg-dim`, gewählte in Weißglut, Nummer klein darüber. **Verschiebbar** vor dem Übernehmen (waagerechter Zug, Tippfläche 44 px um die Linie), Doppeltipp löscht. Eine einzige `role=slider` „Marke 3 von 8“ mit wanderndem Fokus: ↑/↓ wechselt die Marke, ←/→ verschiebt um 5 ms (Umschalt 50 ms), Entf löscht. Marken sind UI-Zustand, erst „In die Kiste“/„Auf die Spur“ schreibt in den Store. Ein Tipp zwischen zwei Marken hört diesen Schnitt einmal vor. Nach dem Übernehmen sind die Schnitte eigene Sounds, ihr Anfang/Ende ändert man im Reiter Form.
**Sichtbarkeit:** Reiter Zerlegen nur bei Sounds ≥ 1 s (Einzelschläge haben nichts zu zerlegen). Fehlt der Sound oder ist es `pat-…`, gibt es ihn nicht.
**Kiste:** Schnitte einer Gruppe stehen als eine eingerückte Zeile „Klopfen · 8 Schnitte ▸“ unter dem Eltern-Sound; Tipp klappt auf, jeder Schnitt ist ein Objekt (Ziehen, Vorhören, Werkbank).

## 3. Datenmodell (nur `project.recipes`, nichts Neues an Clip/Spur)
- **Schnitt = Variante** (2a): `recipes['vr-…'] = { parent: <Wurzel>, name, group, start, end, …Klangfelder der Quelle }`. Kopiert werden alle Klangfelder der Quelle **außer** `start`, `end`, `attack`, `release`. Die Kanten bekommen die 2-ms-Mindestblende aus 2a.
- **Neu (Meta, `META` in `src/recipe.js`):** `group` = `'zg-'` + Zeitstempel/Zufall, gemeinsam für alle Schnitte eines Zerlegens. Library: ein Eintrag mit `group` ist **immer Einzelklang** (kein `sampleTempo` kopieren).
- **Name:** `{Name der Quelle} · {k}`, k ab 1 in Zeitfolge. Sind die Namen schon vergeben (zweites Zerlegen), zählt k weiter (9 … 16). Längenkappung 40 wie 2a.
- **Zeiten** in Sekunden des Originals der Wurzel. Erkannt wird auf `orig` innerhalb `start…end` der Quelle; Schnitt k = [Anschlag k − 3 ms, Anschlag k+1 − 3 ms], der erste beginnt am Anfang der Quelle (Auftakt bleibt), der letzte endet an ihrem Ende. Ist eine Variante/ein Schnitt die Quelle, gilt deren Ausschnitt.
- **Autotune als Rezept:** `tune` 0…1 (Stärke, 0 = aus), `robot` bool, `tuneKey` (aus `KEYS`, gesetzt beim Einschalten = Song-Tonart). `recipeSteps`: „gestimmt auf Am“.
- **Rückwärts der Quelle:** jeder Schnitt bleibt `reverse`, die Lage auf der Spur wird gespiegelt; zusammen klingt es wie vorher.

## 4. Store-Aktionen (`src/model.js`)
| Aktion | Verhalten |
|---|---|
| `cutSound(sampleId, cuts, { clipId, trackId, atBeat, place } = {}) → { group, ids, clipIds }` | `cuts = [{ start, end, beat, len }]` (beat/len nur bei `place`). `batch('Zerlegen')`: legt alle Varianten an; `place:'clip'` entfernt `clipId` und legt die Schnitt-Clips auf dieselbe Spur (erben `gain`, `stretch`, `varispeed`; `fadeIn` nur der erste, `fadeOut` nur der letzte); `place:'track'` legt sie auf `trackId` ab `atBeat` (ohne `trackId`: `addTrack`). **Ein Undo-Schritt.** Leere `cuts` = keine Wirkung |
| `setRecipe(id, { tune, robot, tuneKey })` | vorhandene Aktion, nur neue Felder in `RECIPE` |

Lage-Rechnung ohne Audio in **neu `src/cuts.js`** (auch in Node testbar): `planCuts(onsets, sr, { start, end })`, `evenCuts(n, { start, end })`, `layoutCuts(cuts, { recipe, beatsPerSecond, clip, grid })`. Sie nutzt `cookedSeconds` (aus `wave-handles.js` nach `src/cuts.js` verschieben) für Dehnen/Tonhöhe/Rückwärts und deckt das Fenster des Clips (`offsetBeats`, `lengthBeats`); wiederholt der Clip den Sound, wiederholen sich die Schnitt-Clips; überstehende werden gekürzt. Der Einblender nach ↶ heißt „Rückgängig: Zerlegen“ (CD #4).

## 5. Engine
**Kein neuer Knoten, Scheduler/`buildMix`/`startVoice` unverändert.** Schnitte backen wie jede Variante (`applyRecipes`).
- Anschläge: `detectOnsets` (unverändert) auf der Mono-Summe von `orig[start…end]`; bis 30 s im Hauptthread, darüber Job `onsets` in `src/dsp/worker.js`.
- `src/dsp/recipe.js`: neuer Schritt **4b Autotune** nach der Tonhöhe (`autotune(chs, sr, { root, scale, strength: tune, speed: robot ? 1 : 0.6 })`). Mit `tune > 0` backt immer der Worker (Job `recipe`); die alte gebackene Fassung klingt weiter, bis die neue da ist.
- **Trennen:** Job `separate` (vorhanden) auf `orig` der Wurzel. Ergebnis = **neue eigene Sounds mit Audio** (`own.create`, Quelle „Ebene aus …“), das Rezept der Quelle wird kopiert (gleiche Zeitbasis, Länge bleibt gleich). „Nur Stimme“/„Stimme weg“: `setClip(clipId, { sampleId })`; „In 4 Ebenen“: `insertStemTracks` (vorhanden). Fortschritt als Linie unter der Welle, nicht modal. Der Song bleibt bedienbar.

## 6. Editor-Wegfall und Zwillinge
`EDITION.surfaces.editor = false`; `data-surface="editor"` an `#edit-btn`, `#editor-tab` und am Dock `#editor`. Der Verweis „Im Editor“ in `sound-bench.js` (Z. 367–369) entfällt. **Einsingen** liegt im Pattern-Editor (Erstellen-Karte) und bleibt unberührt. Neue Einträge in `EDITION.twins`:

| Editor (`ed-…`) | Zwilling in Krachwerk |
|---|---|
| crop | Form: Anfang/Ende |
| cut, silence (Mitte entfernen/still) | Zerlegen, Schnitt löschen bzw. Teilen + Löschen am Clip |
| fadein, fadeout | Form: Anschlag/Ausklang |
| reverse, louder, quieter, normalize | Form: Rückwärts, Lautstärke, Auf Spitze (für einen Ausschnitt: erst Zerlegen) |
| pitch-down/up | Ton: Halbtöne |
| autotune, at-root, at-scale, at-strength, at-robot | Ton-Feinheiten: Autotune, Tonart, Stärke, Roboter |
| novocal, vocal, stems | Zerlegen-Feinheiten: Trennen |
| loop, beats | Zeit |
| play | Tipp auf die Welle |
| undo, name, apply | ↶; Name im Kopf; Als Variante |
| edit-btn, editor-tab | Werkbank (Form · Ton · Zerlegen) |

`ed-cancel` braucht keinen Zwilling (nichts zu verwerfen).

## 7. Zähl-Budgets
| Bild | Grenze |
|---|---|
| je Reiter `.wb-grund` (auch Zerlegen) | ≤ 5 |
| Handy *Werkbank Mitte, Reiter Zerlegen* (10-s-Sound, 8 Marken) | ≤ 26 / ≤ 13 / ≤ 5 / ≥ 11 (Marken zählen als 1 Slider) |
| 2a-Bilder (Sound < 1 s, also ohne Reiter Zerlegen) | unverändert wie 2a |
| Desktop *Clip gewählt* mit 10-s-Sound | ≤ 45. Wer überschreitet, streicht (ui-designer entscheidet, was in die Feinheiten wandert) |
| Loopwerk alle Bilder | **exakt** Basis |

## 8. Testplan
**Neu `tests/cuts.test.cjs`** (Browser, `window.loopwerk`, `limiter:false`, Rauschen mit `mulberry32`). Testklopfen: 10 s, 8 Schläge (gedämpfte Rauschstöße 30 ms, Pegel 0 … −18 dB, Abstände unregelmäßig 0,6–1,8 s), Boden −50 dB.
1. **Anschläge:** Empfindlichkeit 0,5 → genau 8 Marken; jeder Schnittanfang + 3 ms liegt ±5 ms am wahren Anschlag. Ein 9. Schlag bei −30 dB: bei 0,2 nicht, bei 1,0 gefunden.
2. **Gleiche:** In 8 → Grenzen bei k·Dauer/8 ±1 Frame. `planCuts`/`evenCuts`/`layoutCuts` zusätzlich in Node (Spiegeln bei Rückwärts, Dehnen 150 %, Clip-Fenster mit Wiederholung).
3. **Samplegenau:** Offline-Render eines Schnitt-Clips = `orig[a…b]` (größte Abweichung < 1e-4 außerhalb der 2-ms-Kanten, Länge ±1 Frame).
4. **Auf die Spur klingt gleich:** Render vor/nach `cutSound(place:'clip')`, Differenz ≤ −40 dB RMS, außerhalb ±3 ms um die Grenzen größte Abweichung < 1e-3. Dasselbe mit `reverse` und mit `semis −5`.
5. **Ein Undo, nicht-destruktiv:** Undo-Stapel +1; `undo()` → Projekt-JSON gleich dem Stand davor; `orig` der Wurzel unverändert (Prüfsumme), keine neuen Einträge in `own`.
6. **Autotune:** Sinus 452 Hz, `tune 1`, `tuneKey 'Am'` → 440 Hz ±1 %; `tune 0` ist bitgleich ohne Rezept; `renderProject` wartet auf den Worker.
7. **Trennen:** Länge der Ebenen = Länge des Originals; Rezept kopiert; „Nur Stimme“ setzt `sampleId`, ein `undo()` stellt den Clip zurück.
8. **Datei:** `group`, `tune*` bleiben beim Speichern; in `/` geöffnet: Render gleich (< 1e-4).
9. **Kosten:** `detectOnsets` auf 10 s Mono < 30 ms (ausgegeben).

**`tests/werkstatt.test.cjs`, Teil 2b** (Handy 390×844 Touch, Desktop 1400×820):
- Ablauf in 3 Tipps (Clip, Zerlegen, Auf die Spur) → 8 Clips mit `vr-`, Namen „Klopfen · 1“ … „· 8“, Kiste zeigt „Klopfen · 8 Schnitte“.
- Marken-Slider: `ArrowRight` → Marke +5 ms; `Delete` → 7 Schnitte. Am Handy verschiebt ein waagerechter Zug an einer Marke nicht die Schublade.
- Reiter fehlt bei Sound < 1 s; Grund ≤ 5; Budgets §7.
- Kiste: Doppelklick bzw. lange drücken öffnet die Werkbank ohne Reiter Clip; dort legt „In die Kiste“ eine Gruppe an.
- 56 px: Schublade „zu“ = 56 ± 1 px, zeigt Kopf und Als Variante.
- Editor weg: `#edit-btn`, `#editor-tab` in `/werkstatt/` unsichtbar; **jeder** Knopf mit `id^=ed-` in `#editor` (außer `ed-cancel`) hat einen Eintrag in `EDITION.twins`.
- Nach `undo()` zeigt der Einblender „Rückgängig: Zerlegen“. In `/`: Editor öffnet wie heute, `countUi` exakt, keine Konsolenfehler.
- Bilder: `kw-zerlegen-handy`, `kw-zerlegen-desktop`, `kw-kiste-schnitte`, `kw-zu-handy`.

**Ohr-Test für Martin:** (1) Eigenes Klopfen „Auf die Spur“: klingt es wie vorher, hörst du an den Grenzen Klicks oder Löcher? (2) Findet „An Anschlägen“ mit 0,5 die Schläge, die du hörst? (3) „Ins Raster“ an: groovt es besser oder ist das Gefühl weg? (4) Autotune an deiner Stimme, Stärke halb und Roboter: brauchbar? (5) „Stimme weg“ an einer Datei: so gut wie im alten Editor?

## 9. Reihenfolge
| # | Schritt | Dateien | Wer | parallel |
|---|---|---|---|---|
| 0 | Testgerüst 1–5 (scheitern erst), Testklopfen | `tests/cuts.test.cjs` neu, `package.json` | qa | – |
| 1 | `cuts.js`, `group`/`tune*` in `RECIPE`/`META`, `cutSound`, Library: `group` = Einzelklang, Job `onsets`, Autotune-Schritt | `src/cuts.js` neu, `src/recipe.js`, `src/model.js`, `src/samples.js`, `src/dsp/recipe.js`, `src/dsp/worker.js` | audio-engineer (Skill `audio-engine-regeln`) | – |
| 2 | Marken-Modus der Welle; Reiter Zerlegen, Trennen, Autotune in Ton-Feinheiten | `src/ui/wave-handles.js`, `src/ui/sound-bench.js`, `index.html` (`/* Werkbank */`) | ui-engineer | ab 1 |
| 3 | Kiste: Gruppen-Zeile, Werkbank aus der Kiste; Schublade 56 px | `src/ui/library.js`, `src/ui/sheets.js` | ui-engineer | mit 2 |
| 4 | Editor aus, Zwillinge | `src/edition.js`, `index.html` (`data-surface`) | Haupt-Session | nach 2 |
| 5 | Krachwerk-Zeichen im Deck | `index.html`, `src/ui/glow.js`, `assets/icons/` | motion-designer | ab 0 |
| 6 | Tests 6–9, UI-Teil 2b, Budgets | `tests/cuts.test.cjs`, `tests/werkstatt.test.cjs` | qa | ab 4 |
| 7 | Abschluss: `npm test`, Bilder, ui-designer, CD, ROADMAP, CLAUDE.md (Zerlegen-Satz, Editor nur Loopwerk), Nachtrag ADR 008 (Autotune im Rezept, Trennen als Audio) | `docs/…`, `CLAUDE.md` | Haupt-Session, ui-designer, creative-director | – |

## 10. Selbst entschieden
- **Marken verschiebbar, aber nur vor dem Übernehmen.** Danach sind Schnitte gewöhnliche Varianten (kein zweites Modell).
- **Autotune als Rezeptschritt** (nicht-destruktiv, Undo), **Trennen als neue Sounds mit Audio** (teuer, vier Ergebnisse), mit kopiertem Rezept.
- **Erkennung auf dem Original**, Klangfelder der Quelle werden kopiert. So bleiben Schnitte exakt und klingen wie die Quelle.
- **Reiter nur ab 1 s.** Das hält die 2a-Budgets ohne neue Streichung.

Offene Fragen, die blockieren: keine.
