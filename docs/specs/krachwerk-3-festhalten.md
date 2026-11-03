# Krachwerk Scheibe 3: Festhalten, Speicher, Takes-Anbindung

**Stand:** 03.11.2026 · **Grundlage:** `synthese.md` §3.7/§5, `ux.md` b/e, `architektur.md` §4, `ableger-selbermachen.md` §4, ADR 009 + `v2.13-aufnahme.md` (Takes, **nicht hier gebaut**), **ADR 011** (Speicher v2) · **Branch:** `werkstatt`
**Rahmen:** Loopwerk optisch unverändert (`count-baseline.json` exakt), Unterschiede nur in `src/edition.js`, ≤ 5 Grund-Griffe je Reiter, ein Undo je Handlung, `PROJECT_VERSION` bleibt 1.

## 0. Ziel aus Nutzersicht
Martin lässt vier Takte laufen, tippt „Festhalten“ und hat den Teil als eine Schleife in der Kiste und auf einer neuen Spur, die Quellen schweigen in diesem Bereich. Krachwerk startet auch mit 200 Aufnahmen sofort, und mit einem Tipp liegen alle eigenen Sounds als ZIP auf dem Rechner.

## 1. Umfang
| | **3a Festhalten + Speicher** (zuerst, unabhängig) | **3b Takes-Anbindung** (erst nach v2.13 B auf `main`) |
|---|---|---|
| drin | Festhalten am Loop-Bereich und an der Auswahl · `clip.mute` · Speicher v2 mit Migration · ZIP sichern/zurückholen · Füllstand · `usedSampleIds` | ● im laufenden Loop → Takes (v2.13) · Rezept gilt für alle Takes eines Clips · Take-Wahl in Werkzeug am Clip und Werkbank · ●-Quelle per lang drücken |

**Nicht drin:** eigene Take-Mechanik (nur v2.13), Latenz-Einmessen-UI (v2.13 A, Platz in Scheibe 5), Sends/Busse (v2.14), Projektdatei als ZIP, „Unbenutzte anzeigen“, Festhalten in der Loopwerk-UI.

## 2. Bedienung
**Festhalten (2 Tipps + 1 Zug):** Loop-Bereich ziehen (oder vorhanden) → am Loop-Bereich im Lineal steht rechts **„Festhalten“** (Linie, kein Kasten; nur bei `loop.on`; Desktop auch Taste **F**) → Tipp. Ergebnis:
- neuer Sound **„Schleife N“** (Material Schleife, `kind:'loop'`, `beats` = Bereich) in der Kiste,
- neue Spur **direkt unter der untersten Quellspur** mit einem Clip über den Bereich, gewählt, die Werkbank öffnet mit ihm,
- alle Clips im Bereich sind dort **stumm** (an den Bereichsgrenzen geteilt, außerhalb klingen sie weiter). Einblender „Festgehalten – Quellen im Bereich stumm.“ Nach ↶: „Rückgängig: Festhalten“ (der Sound bleibt in der Kiste wie bei jeder Aufnahme).
- **Auswahl:** Sind mehrere Clips gewählt, steht „Festhalten“ im Werkzeug am Clip (nur bei Mehrfachauswahl, an der Stelle von „Kopie“) und nimmt nur diese Clips; Bereich = frühester Anfang bis spätestes Ende.
- Voreinstellungen (gemerkt in `lsKey('loopwerk.freeze')`, umschaltbar in den Feinheiten des Reiters Clip): mit Spur-Effekten (an) · Ausklang an den Anfang falten (an bei Loop-Bereich, bei Auswahl angehängt) · Quellen stumm (an).
- Stumme Clips ruhen im Song auf 50 %. Reiter Clip → Feinheiten **Stumm** schaltet zurück (ein Undo).

**● mit Kontext (3b):** Läuft der Song im Loop → ● nimmt **Takes** über den Loop (v2.13), sonst wie bisher **Geräusch** (`mode:'sound'`). Unter ● steht klein „Takes“ bzw. „Geräusch“ (Text, kein Bedienelement). **Lang drücken** auf ● öffnet die Zeile „Geräusch · Takes“ (gilt für diese Aufnahme). Stopp: ● nochmal (v2.13-Regel: ein angefangener Durchgang zählt ab einem Takt).
**Takes wählen:** Werkzeug am Clip zeigt „Take 2/3“ (v2.13 `clip-float.js`, Tipp = weiter). Werkbank: Reiter Clip, Feinheiten „Take löschen“. Formen in der Werkbank gilt **für alle Takes des Clips**, der Kopf sagt „3 Takes“ statt „in 1 Clip“.

**Speicher:** Kiste, letzte Zeile (Text, `--muted`): „Eigene: 312 MB“, ab 80 % der Quote in `--fg` mit „fast voll“. **Sichern/Zurückholen** stehen in der Song-Werkbank (heute `insp-song-tools` bzw. Song-Fach, ab Scheibe 5 Reiter Projekt): „Alle Sounds sichern“ liefert `krachwerk-sounds-JJJJ-MM-TT.zip` (Handy: `navigator.share` mit Datei, sonst Download); „Zurückholen“ öffnet die Dateiwahl, ZIP auf die Kiste ziehen geht auch. Einblender „12 Sounds zurückgeholt, 3 waren schon da.“

## 3. Datenmodell
- **`clip.mute?: true`** (optional). `normalizeClip` löscht `false`. Engine: `audibleMap`/`clipPieces` überspringen stumme Clips (Realtime und Offline gleich, eine Stelle).
- **Sound-Datensatz** (IndexedDB, nicht im Undo): `from: 'freeze'` (neu; Stammbaum „Festgehalten 03.11. 21:14 aus Bumm 1, Summ 2“), `src: [sampleId…]` (Zutaten, höchstens 16). `makeMeta`/`embed`/`restore` tragen beides mit. `suggestMaterial`: `from === 'freeze'` → Schleife.
- **`usedSampleIds(project)`** neu in `src/model.js`: `clipSampleIds` aller Clips (v2.13; bis dahin `sampleId`) + `recipes[*].parent` benutzter Varianten. Ersetzt die Sammlungen in `own-sounds.js embed`, im Löschschutz und bei „Sound fehlt“ (`main.js`). Scheibe 4 ergänzt Kits und Instrumente.
- **Takes (3b):** nur die Felder aus ADR 009 (`clip.takes`, `clip.take`).

## 4. Speicher v2 (ADR 011, `src/own-sounds.js`)
- `db(name)` öffnet Version 2. `onupgradeneeded` bei `oldVersion === 1`: Cursor über `sounds`, je Datensatz `meta.put({ …rec ohne wav, duration: wavDuration(wav), channels, sampleRate, bytes: wav.byteLength })` und `audio.put({ id, wav })`, danach `deleteObjectStore('sounds')`. Bei `oldVersion === 0` beide Stores anlegen. `onversionchange` → `db.close()`; `onblocked` → Einblender „Krachwerk ist noch in einem anderen Tab offen – dort schließen.“
- `loadAll`: nur `meta.getAll()`. Der Stub-Lader liest `audio.get(id)`. `create`/`restore`: eine Transaktion über beide Stores. `remove`: beide. `rememberMaterial`: nur `meta`.
- Neue Aufnahmen: Doppel-Mono (`isDoubleMono`) → 1 Kanal vor `encodeWav`.
- `async usage()` → `{ bytes: Σ meta.bytes, quota }` (`navigator.storage.estimate()`). `askPersist` bleibt.
- **Sicherung**, neu `src/sound-backup.js`: `backupSounds(own)` → `Blob[]` (Teile ≤ 200 MB, je Teil `sounds.json` + `sounds/<id>.wav`, ohne Kompression über `makeZip`); `restoreSounds(own, files)` → `{ added, skipped }` über `readZip`, unbekannte Felder in `sounds.json` bleiben erhalten.
- Service Worker: `CACHE = 'krachwerk-v3'`.

## 5. Store-Aktionen (`src/model.js`)
| Aktion | Verhalten |
|---|---|
| `freeze({ fromBeat, toBeat, sampleId, clipIds = null, mute = true }) → { trackId, clipId }` | `batch('Festhalten')`: `addTrack({ after })` (neue Option: Position unter der untersten Quellspur; Name „Schleife N“, 0 dB, Mitte, ohne Effekte), Clip `[fromBeat, toBeat)`, `sampleTempo[sampleId]` als Loop mit `beats`. Bei `mute`: Quell-Clips (alle hörbaren im Bereich bzw. `clipIds`) per `splitAt` an `fromBeat`/`toBeat` teilen, die inneren Stücke `mute:true`. Ein Undo-Schritt |
| `setClip(clipId, { mute })` | vorhanden, neues Feld |
| `setRecipe(id, patch, { coalesce, also })` (3b) | `also: [ids]` schreibt denselben Patch auf alle Takes, ein Undo-Schritt je Geste |

## 6. Engine
- **Festhalten**, neu `src/freeze.js`: `renderFreeze(project, library, { fromBeat, toBeat, clipIds, fx = true, fold })` = `renderProject(view, library, { fromBeat, toBeat, tailSeconds, master: false })`. Das ist dieselbe Kette wie der Export (`buildMix`, `clipPieces`, Automation), nur ohne Summe (Master-Effekte, Mastering, Limiter), weil das Ergebnis wieder durch die Summe läuft. `view`: bei `clipIds` nur diese Clips, bei `fx:false` ohne Spur-Effekte, Solo/Stumm wie im Song. Gruppen und (ab v2.14) Sends gehören zur Spurseite und werden mitgerendert.
- `tailSeconds`: bis 8 s; der Ausklang endet, wo 50 ms RMS < −60 dBFS liegen. **Falten:** `out[i % N] += out[i]` für `i ≥ N` (wie `renderPattern`), N = round((toBeat − fromBeat) · spb · sr).
- Vorher `library.ensure` für alle benutzten Sounds; `applyRecipes` steckt schon in `renderProject`.
- Läuft der Song, spielt er weiter (eigener Offline-Kontext). Fortschritt als Linie im Lineal unter dem Bereich, nicht modal.
- **Takes (3b), Anforderung an v2.13 (Schnittstelle, dort bauen):** `recorder.start({ mode:'song', targets, startAt:'next-wrap' })`: Läuft der Song im Loop, beginnt die Aufnahme am nächsten Loop-Sprung (`emit('wrap')`), **ohne** Stopp und Vorzähler. Krachwerk ruft sonst nichts Eigenes. Nach `recorded` mit `takes`: kein `cleanTake` (gleich lange Takes, ADR 009), nur Hochpass 45 Hz (`highpass`) und ein gemeinsamer Pegel (Spitze des lautesten Takes = 0,89).

## 7. Dateien
neu: `src/freeze.js`, `src/sound-backup.js`, `tests/freeze.test.cjs`, `tests/store-v2.test.cjs` · geändert: `src/own-sounds.js`, `src/model.js` (`freeze`, `mute`, `usedSampleIds`, `addTrack({ after })`), `src/engine.js` (stumm in `audibleMap`), `src/recipe.js` (`from:'freeze'`), `src/main.js` (Taste F, ●-Kontext, Sichern), `src/ui/arranger.js` (Festhalten am Bereich, stumm 50 %), `src/ui/clip-float.js`, `src/ui/sound-bench.js` (Stumm, „3 Takes“), `src/ui/library.js` (Füllstand), `src/werkstatt/sw.js`, `src/edition.js` (Option `freeze: true`, Loopwerk `false`).

## 8. Zähl-Budgets
| Bild | Grenze |
|---|---|
| Desktop *Clip gewählt* (Loop an, Festhalten sichtbar) | ≤ 45 / ≤ 30 / ≤ 5 / ≥ 11 |
| Handy *Clip gewählt* | ≤ 18 / ≤ 8 / ≤ 5 / ≥ 11 |
| Handy *Werkbank Mitte* (Take-Clip) | ≤ 26 / ≤ 13 |
| Loopwerk alle Bilder | **exakt** Basis |

## 9. Testplan
**`tests/freeze.test.cjs`** (Browser, Signale nach Skill `audio-test`):
1. **Länge:** Loop 0–8 bei 90 BPM → Sound mit genau N Frames (N = 8 · 60/90 · sr gerundet), `kind 'loop'`, `beats 8`.
2. **Klingt gleich:** Song mit Sinus-Clip, Klopfer-Clip und Hall auf Spur 2. Render des Loop-Bereichs über 2 Durchgänge vor und nach `freeze`: Differenz im 2. Durchgang ≤ −40 dB RMS (gefalteter Ausklang = eingeschwungener Zustand).
3. **Falten:** Impuls kurz vor Bereichsende + Echo 300 ms → Echo im Ergebnis bei Frame (Echo − N) ± 1.
4. **Auswahl:** 2 von 3 Clips gewählt → der dritte fehlt im Ergebnis (Goertzel ≥ 30 dB Abstand), nur die beiden sind stumm.
5. **Stumm teilt:** Clip 0–16, Bereich 4–8 → 3 Clips, nur 4–8 `mute`; Render 0–4 und 8–16 unverändert (< 1e-4).
6. **Ein Undo:** Stapel +1; `undo()` → Projekt-JSON wie vorher, Sound bleibt in der Library.
7. **Ohne Summe:** Master-Hall an → im Ergebnis kein Master-Hall (ohne Faltung nach Bereichsende < −60 dB).
8. **Datei:** `from:'freeze'` und `src` überstehen Speichern/Öffnen; der Sound eines stummen Clips wird eingebettet.

**`tests/store-v2.test.cjs`:**
9. **Migration:** v1-DB mit 3 Datensätzen (Format aus Scheibe 1, Test 4) in `loopwerk-make` und in `loopwerk` → App starten → Version 2, Stores `meta`/`audio`, `sounds` weg, alle 3 klingen (Spitze > 0,1). Erzwungener Fehler im Upgrade → v1 unverändert.
10. **Auf Abruf:** 50 Sounds à 5 s → nach `ready` hat kein Eintrag `orig`; Startzeit 50 vs. 0 Sounds, Unterschied < 150 ms (ausgegeben). Erstes Abspielen lädt nur diesen einen.
11. **Mono:** Doppel-Mono-Aufnahme → 1 Kanal, `bytes` halb (± 1 %).
12. **ZIP hin und zurück:** 3 Sounds → `backupSounds` → DB löschen → `restoreSounds` → gleiche IDs, WAV-Bytes bitgleich, `meta` gleich; zweites Zurückholen → `added 0, skipped 3`. Grenze künstlich 1 MB → 2 Teile, beide lesbar.
13. **Füllstand:** Text in der Kiste = `usage().bytes` (auf MB gerundet).

**`tests/werkstatt.test.cjs`, Teil 3:** Festhalten am Handy in 2 Tipps ab Loop an, Taste F am Desktop; neue Spur unter der Quelle; Werkbank zeigt „Schleife 1“; Budgets §8; Loopwerk ohne „Festhalten“, `countUi` exakt, keine Konsolenfehler. **Teil 3b** (nach v2.13 B, mit dessen Loopback-Attrappe): ● bei laufendem Loop → `engine.playing` durchgehend, 3 Takes, Werkzeug „Take 3/3“; `setRecipe` mit `also` → alle Takes gleich gebacken; lang drücken ● → „Geräusch“ → gesäuberter Einzelklang. Bilder `kw-festhalten-handy`, `kw-festhalten-desktop`, `kw-takes-handy`.

**Ohr-Test für Martin:** (1) Einen Loop mit Hall festhalten und mit ↶/↷ Quelle und Ergebnis vergleichen: gleich? Springt der Ausklang am Loop-Ende? (2) Vier Durchgänge über einen laufenden Loop einsingen, ohne Stopp: kommt der Einsatz natürlich? (3) Einen Take filtern und dann durchschalten: klingen alle gleich geformt?

## 10. Reihenfolge
| # | Schritt | Wer | parallel |
|---|---|---|---|
| 0 | Testgerüste 1–6, 9–12 (scheitern erst) | qa | – |
| 1 | Speicher v2, Migration, Mono, `usage`, Sicherung, SW v3 | audio-engineer | – |
| 2 | `clip.mute` (Engine + Modell), `usedSampleIds`, `freeze`, `src/freeze.js` (Skill `audio-engine-regeln`) | audio-engineer | mit 1 |
| 3 | Festhalten am Bereich, Taste F, stumm 50 %, Füllstand, Sichern-Knöpfe | ui-engineer | ab 2 |
| 4 | Fortschrittslinie im Lineal | motion-designer | mit 3 |
| 5 | Abschluss 3a: `npm test`, Bilder, ui-designer, CD, ROADMAP, CLAUDE.md, ADR 011 annehmen | Haupt-Session, CD | – |
| 6 | **3b** (erst wenn v2.13 B auf `main` ist): `startAt:'next-wrap'` mit der v2.13-Session abstimmen, ●-Kontext, `also`, „3 Takes“ | audio-engineer, ui-engineer | – |
| 7 | Tests 3b, Abschluss 3b | qa, CD | – |

## 11. Für Martin am Ende (Voreinstellung gewählt)
1. **Quellen stumm nach Festhalten:** *an, nur im Bereich (Clips werden dafür geteilt)*. Alternative: Quellen klingen weiter, du schaltest selbst stumm.
2. **● bei laufendem Loop = Takes**, ein Einzelgeräusch per lang drücken. Alternative: ● bleibt immer Geräusch, Takes nur per lang drücken.
3. **Takes ungesäubert** (nur Hochpass + gemeinsamer Pegel), weil Takes gleich lang sein müssen. Säubern an Stille und Anschlag bleibt dem Einzelgeräusch.
4. **Name „Schleife N“** fürs Festgehaltene (wie `ux.md`). Alternative „Festgehalten N“.
5. **Sicherung in Teilen ≤ 200 MB** (Handy-Speicher). Eine Datei wäre bequemer, kann am iPhone aber abbrechen.
6. **Loopwerk migriert mit** (gleiche Speicher-Bibliothek, ADR 011). Festhalten in Loopwerk: *aus* (Option `freeze` vorhanden).

Offene Fragen, die blockieren: keine.
