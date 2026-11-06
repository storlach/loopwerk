# Krachwerk Scheibe 3: Takes, Festhalten, Speicher v2, Sicherung

**Stand:** 06.11.2026 · **Grundlage:** `docs/ux/krachwerk-brainstorm/synthese.md` §3.7 und §5, `ux.md` b) und e), `architektur.md` §4, `ableger-selbermachen.md` §4, Spec `v2.13-aufnahme.md` B, ADR 007, 009, 010, **ADR 011 (Festhalten), ADR 012 (Speicher v2 und Sicherung)** · **Branch:** `werkstatt`
**Rahmen:** Loopwerk sieht unverändert aus (`count-baseline.json` exakt). Unterschiede nur über Optionen aus `src/edition.js`, die `main.js` weitergibt. `PROJECT_VERSION` bleibt 1. Grund ≤ 5 Griffe je Reiter. Rot nur für Aufnahme und Löschen.

## 0. Ziel aus Nutzersicht
Martin lässt seinen Klopf-Loop laufen, tippt ●, singt viermal darüber und wählt den besten Take am Clip. Dann tippt er „Festhalten“ am Loop und hat Klopfen, Gesang und Hall als einen neuen Sound, den er rückwärts drehen oder zerlegen kann. Seine ganze Werkstatt passt in eine ZIP-Datei, die er auf einem anderen Gerät zurückholt.

## 1. Scheiben und Reihenfolge
| # | Scheibe | Martin kann danach | Warum hier |
|---|---|---|---|
| **3a** | **Sicherung:** Werkstatt als ZIP sichern und zurückholen, Song als ZIP speichern/teilen, Konflikte, Öffnen mit Rückgängig | alles auf einem anderen Gerät öffnen, einen Song verschicken | Erst sichern können, dann den Speicher umbauen. iOS räumt Seiten-Speicher |
| **3b** | **Speicher v2:** `meta`/`audio` getrennt, Migration je Sound, Start liest nur `meta`, Speicher-Zeile (Größe, frei, dauerhaft, zuletzt gesichert), voller Speicher, Papierkorb und Aufräumen | sehen, wie viel Platz belegt ist, Reste wegräumen, ohne etwas endgültig zu verlieren | Takes und Festhalten erzeugen viele große Sounds |
| **3c** | **Takes:** ● bei laufendem Loop nimmt Takes auf, ohne den Song anzuhalten | über den laufenden Song einsingen, den besten Take wählen | fast nur Wiederverwendung (ADR 009) |
| **3d** | **Festhalten:** Loop, Spur oder Auswahl mit Effekten zu einem Sound, an Ort und Stelle ersetzen | einen Teil einfrieren und weiterformen | braucht `clip.mute` (ADR 011) |

3c und 3d hängen nicht voneinander ab und können parallel laufen. Jede Scheibe ist für sich fertig im Sinne von CLAUDE.md.

---

## 2. Takes (3c) – Wiederverwendung von ADR 009

### Bedienung
- **Regel für ●:** Läuft der Song mit Loop, nimmt ● **Takes** auf. Steht der Song (oder ist der Loop aus), nimmt ● wie bisher **einen Klang** auf (`mode:'sound'`: säubern, Clip in den Loop). Den Einzelklang über den laufenden Song bekommt man mit Anhalten und dann ● (2 Tipps).
- **Ohne Vorzähler, ohne Stopp:** Der laufende Loop ist der Vorzähler. Die Aufnahme beginnt am **nächsten Loop-Anfang**, der mindestens 0,25 s nach dem Aufnahmebeginn liegt. Bis dahin pulsiert ● als Ring, Einblender „Ab dem nächsten Durchgang – jeder wird ein Take.“ Ab dem ersten Durchgang ist die Marke rot (Formsignal: Linie, nicht nur Farbe).
- **Stopp:** ●, R oder Leertaste. ● und R beenden nur die Aufnahme, der Song spielt weiter. Leertaste hält den Song an und beendet die Aufnahme. Ein angefangener Durchgang zählt ab einem Takt (wie in Loopwerk), höchstens 16 Takes.
- **Ergebnis:** ein Take-Clip über den Loop auf der gewählten Spur, sonst auf der ersten ohne Clip im Loop-Bereich, sonst auf einer neuen Spur. Es spielt der letzte volle Take. Einblender „3 Takes – der letzte spielt. Wechseln am Clip.“
- **Wechseln:** wie heute über das Werkzeug am Clip „Take 2/3“ (1 Tipp) und Alt+↑/↓. **Neu in der Werkbank:** Im Kopf unter der Stammbaum-Zeile steht die Take-Zeile `1 2 3 ×` (`take-row.js` wiederverwendet, nur bei Take-Clips). × löscht den aktiven Take, in Rot.
- **Kiste:** Takes einer Aufnahme stehen gefaltet als „Klang 2 · 3 Takes ▸“, so wie die Schnitte aus 2b.
- Einmal je Gerät kommen zwei Einblender: bei der ersten Take-Aufnahme „Mit Kopfhörern nimmt das Mikro den Song nicht mit auf.“ und, solange nicht eingemessen, nach der ersten Take-Aufnahme „Sitzt es nicht im Takt? Song → Aufnahme → Einmessen.“ (`lsKey('loopwerk.takeHints')`).
- Während der Aufnahme sind Loop, Tempo und Festhalten gesperrt (`store.lock`, vorhanden).

### Datenmodell
- Clip: unverändert `takes`/`take` (ADR 009). Take-Sounds sind eigene Sounds mit Audio, alle genau N = round(Loop-Schläge · spb · sr) Frames lang.
- Eigener Sound (IndexedDB, nicht im Undo), neu optional: `takeGroup: 'tk-…'` (gemeinsam für die Takes einer Aufnahme). `toSample` legt es als `made.group` ab, `embed` und die Sicherung tragen es mit.
- **Rezept am Take-Clip gilt für alle Takes des Clips.** Wer in der Werkbank einen Take formt, formt alle. So klingt das Wechseln nicht plötzlich roh. „Als Variante“ und „Zerlegen“ nehmen den aktiven Take (über `normalizeTakes` wird der aktive Eintrag zur Variante).

### Store-Aktionen
| Aktion | Änderung |
|---|---|
| `setRecipe(idOrIds, patch, { coalesce })` | nimmt auch eine Liste. Alle IDs in **einem** `dispatch`, damit Ziehen weiter ein Undo-Schritt bleibt. Die Werkbank übergibt `clip.takes ?? [clip.sampleId]` |
| `addRecordings`, `setClipTake`, `stepClipTake`, `removeTake` | unverändert |

### Engine / Recorder / DSP
- **Engine unverändert.** `emit('wrap')` gibt es schon.
- `Recorder.start({ trackId, mode:'loop' })` ist neu und nutzt dieselben Teile wie `song` mit Loop: Worklet, `effectiveLatency` mit `engine.playbackDelay()`, `splitPasses`, `cutPass`, `addRecordings`. Anders ist: kein `engine.stop()` und kein `engine.play({ countIn })`. Dafür gilt `armTime = ctx.currentTime` beim Wechsel auf `recording`, und als `anchors` zählen die `wrap`s mit `time ≥ armTime + 0,25`. `finish()` stoppt die Engine nicht. Ein `state`-Wechsel der Engine (angehalten) beendet die Aufnahme wie bei `song`.
- Entscheidung in der Wurzel: `mountRecording({ mode: EDITION.record, whilePlaying: EDITION.recordWhilePlaying })`. In `make` ist `recordWhilePlaying: 'loop'`, in `full` `null` (Loopwerk bleibt bei Stopp + Vorzähler).
- **Säubern ohne Zeitverschiebung:** `cleanTake` schneidet vorn ab und würde die Takes gegeneinander verschieben. Darum neu `cleanPasses(list, sr)` in `src/dsp/clean.js`: Doppel-Mono → 1 Kanal (`isDoubleMono`), Hochpass 45 Hz, **gemeinsamer** Pegel für alle Takes (Spitze des lautesten auf 0,89, höchstens +12 dB). Kein Zuschnitt, keine Blenden. Name aus `describe(features(letzter voller Take))` + „ · Take k“, `from:'mic'`.

### Dateien
`src/recorder.js` (Modus `loop`), `src/dsp/clean.js` (`cleanPasses`), `src/main.js` (`mountRecording`, Einblender), `src/edition.js` (`recordWhilePlaying`), `src/model.js` (`setRecipe` mit Liste), `src/own-sounds.js` (`takeGroup`), `src/ui/sound-bench.js` (Take-Zeile im Kopf, Rezept auf alle Takes), `src/ui/library.js` (Takes falten wie Schnitte), `src/ui/arranger.js` (rote Marke während der Aufnahme).

---

## 3. Festhalten (3d) – ADR 011

### Bedienung
- **Loop festhalten (Hauptweg):** Ist der Loop an und kein Clip gewählt, steht im Loop-Band des Lineals „Festhalten“: ein Linien-Etikett, unter 96 px Bandbreite nur als Zeichen mit `aria-label`, Tippziel ≥ 44 px (darf über die Bandkante ragen). Am Desktop geht es auch mit **F**. 1 Tipp, wenn der Loop schon steht (nach der ersten Aufnahme ist das so), sonst Loop ziehen und 1 Tipp.
- **Auswahl festhalten:** Bei ≥ 2 gewählten Clips zeigt das Werkzeug am Clip „Festhalten“ (bei einem Clip nicht, das schont das Zählbild). F geht auch hier.
- **Spur festhalten:** In der Spur-Werkbank steht „Festhalten“ neben dem Namen. Das gilt für den Loop-Bereich, ohne Loop für die belegte Strecke der Spur. In den Feinheiten der Schalter „mit Effekten“ (Voreinstellung an).
- **Was passiert (Voreinstellung „ersetzen“):** Der Sound „Festgehalten n“ kommt in die Kiste. Direkt unter der untersten Quellspur entsteht eine neue Spur mit diesem Clip über dem Bereich. Die Quell-Clips sind im Bereich **stumm**, nicht gelöscht: Sie werden an den Bereichsgrenzen geteilt, das ist klanglich neutral. Der neue Clip ist gewählt, und die Werkbank zeigt ihn (am Handy auf „zu“, 56 px). Einblender „Festgehalten – die Quellen sind stumm. ↶ nimmt alles zurück.“ **Ein** Undo-Schritt. Der Sound bleibt danach in der Kiste wie jede Aufnahme.
- **Nur in die Kiste:** Umschalt+F bzw. lange drücken auf „Festhalten“. Der Zwilling ist „+ Neu“ in der Kiste → „Loop festhalten“.
- **Spur ohne Effekte** (Schalter aus): Gerendert werden nur die Clips, ohne Effekte, Fader, Panorama, Sends und Kurven. Das Ergebnis liegt **auf derselben Spur oben** (`_raise`), die Quellen bleiben darunter (`audibleRanges`). Es entsteht keine neue Spur und nichts wird stumm geschaltet. Das ist „Zusammenfassen“.
- Während des Rechnens wird das Etikett zur wachsenden Weißglut-Linie („hält fest …“). Der Song spielt weiter, nichts ist modal. Stumme Clips sind schraffiert (vorhandener Stumm-Look). Ist ein stummer Clip gewählt, zeigt das Werkzeug am Clip „Stumm aus“.

### Datenmodell
- **Neu `clip.mute?: true`** (optional, `PROJECT_VERSION` bleibt 1). Ein stummer Clip klingt nicht und verdeckt nichts: `audibleRanges` (model.js) gibt ihm leere Bereiche und lässt ihn beim Verdecken aus. Engine und `renderProject` lesen beide `audibleRanges`, also eine Stelle.
- Festgehaltener Sound (eigener Sound mit Audio): `kind:'loop'`, `beats` = Bereichslänge, `source:'Festgehalten: Takt 5–8'`, `from:'bounce'`, `bounceOf: [Wurzel-IDs der Quellen]` (höchstens 16, nur für den Stammbaum: „Festgehalten aus Bumm 1, Gesang 2 …“). Ohne Rezept: Es ist eine neue Wurzel. Materialvorschlag ist „Schleife“.
- **Rezepte und Varianten:** Sie sind eingebacken (`renderProject` wartet auf `applyRecipes`). Die Rezepte der Quellen bleiben unverändert im Projekt, ihre Clips sind ja nur stumm. Ändert man später ein Quell-Rezept, ändert sich der festgehaltene Sound **nicht**, denn er ist eingefroren. Wer neu will, hält erneut fest. Varianten und Schnitte des neuen Sounds funktionieren wie bei jedem Sound (`parent` = neuer Sound).

### Store-Aktionen
| Aktion | Verhalten |
|---|---|
| `setClipMute(ids, on)` | ein Undo-Schritt |
| `bounce({ sampleId, fromBeat, toBeat, sources, mode, gain, belowTrackId, trackId })` → `{ trackId, clipId }` | `batch('Festhalten')`. `mode:'replace'`: Quell-Clips an `fromBeat`/`toBeat` teilen (`splitAt`), die Teile innen `mute`. `addTrack` direkt unter `belowTrackId` (`moveTrack`) mit Lautstärke 1, Mitte, ohne Effekte und Sends. Clip mit `gain`. `mode:'top'` (ohne Effekte): Clip oben auf `trackId`. Ein Undo-Schritt. „Nur in die Kiste“ ruft keine Store-Aktion auf (nur `own.create`) |

### Engine
- **Keine neue Kette:** `renderProject(view, library, { fromBeat, toBeat, tailSeconds, master:false, sampleRate: engine.ctx.sampleRate })`. `master:false` heißt ohne Master-Kette, Limiter und Mastering, denn die neue Spur läuft live wieder durch den Master. Busse (Hall, Echo) sind dabei, die neue Spur sendet nicht, und die Quellen sind stumm. So wird nichts doppelt.
- `renderView` lernt `onlyClips: ids` (Auswahl, Spur-Stumm und Solo zählen nicht) und `dry: true` (Spur ohne Effekte, Lautstärke 1, Mitte, ohne Sends und Kurven). `onlyTrack` gibt es schon (Spur).
- Ausklang wie im Export (`tailSeconds` aus den beteiligten Ketten). **Im Loop-Bereich wird gefaltet:** `out[i] += out[N + i]` für i < Ausklang, dann auf genau N = round(Schläge · spb · sr) Frames gekürzt. Das ist der Klang, den man im Loop hört, denn dort klingt der Ausklang des vorigen Durchgangs in den Anfang. Ohne Loop (Auswahl, Spur ohne Loop) wird nicht gefaltet, sondern am Ende abgeschnitten mit 10 ms Ausblende.
- **Kopfraum:** Liegt die Spitze über 0,98, wird der Sound auf 0,98 gesenkt (16-Bit-WAV clippt sonst). Der ersetzende Clip bekommt `gain = 1/Faktor` (bis +12 dB, `MAX_CLIP_GAIN`). Im Song klingt es dadurch gleich laut, in der Kiste ist der Sound leiser.
- Reine Teile ohne Audio in **neu `src/bounce.js`** (in Node testbar): `planBounce(project, { scope, fromBeat, toBeat, clipIds, trackId, withFx })` → `{ view, opts, sources, fold, belowTrackId }`, `foldTail(chs, N)`, `headroom(chs)`. Abbruch mit Einblender: Bereich über 480 s, nichts klingt („Im Bereich klingt nichts.“), Aufnahme läuft. Clips mit fehlendem Sound bleiben still, Einblender „2 Clips ohne Sound bleiben still.“
- Das Effekt-Pad wirkt nur live und kommt nicht mit. Wer es festhalten will, nimmt es erst als Kurve auf (2.12 Scheibe 6).

### Dateien
`src/bounce.js` neu, `src/engine.js` (`renderView`: `onlyClips`, `dry`), `src/model.js` (`clip.mute` in `audibleRanges`/`normalizeClip`, `setClipMute`, `bounce`), `src/own-sounds.js` (`from:'bounce'`, `bounceOf`), `src/recipe.js` (Stammbaum-Wort „festgehalten“), `src/main.js` (Taste F, Ablauf rendern → `own.create` → `store.bounce`), `src/edition.js` (`bounce: true`), `src/ui/arranger.js` (Etikett im Loop-Band, Schraffur bei `mute`), `src/ui/clip-float.js` („Festhalten“ ab 2 Clips, „Stumm aus“), `src/ui/inspector.js` (Spur-Werkbank: Festhalten, „mit Effekten“), `src/ui/library.js` („+ Neu“ → Loop festhalten).

---

## 4. Speicher v2 (3b) – ADR 012

### Datenmodell (IndexedDB, je Edition: `loopwerk-make`, `loopwerk`; ein Code)
| Store (DB-Version 2) | Schlüssel | Inhalt |
|---|---|---|
| `meta` | `id` | `{ id, v:1, name, kind, beats, source, created, duration, sampleRate, channels, frames, bytes, crc?, cls?, tags?, from?, material?, key?, keyConf?, keyDone?, takeGroup?, bounceOf?, trashedAt? }` |
| `audio` | `id` | `{ id, wav: Blob('audio/wav') }` (16-Bit-WAV aus `encodeWav`, wie bisher) |
| `kv` | `key` | `schema` (2), `lastBackup` (`{ at, bytes, sounds }`), `migrateErrors` |
| `sounds` | `id` | v1, bleibt leer stehen und fällt in v3 weg |

- **Versionierung:** Die DB-Version beschreibt die Stores, `meta.v` die Felder eines Datensatzes. Neue optionale Felder brauchen keine Version.
- **Migration** (einmalig, fortsetzbar): `onupgradeneeded` legt nur `meta`, `audio` und `kv` an. Danach läuft `migrateV1()` vor `loadAll` über `getAllKeys('sounds')` und macht je Sound **eine** Transaktion über `sounds`/`meta`/`audio`: lesen → `meta` (Dauer, Frames, Kanäle, Rate aus dem WAV-Kopf, `bytes`) → `audio` als Blob → aus `sounds` löschen. Je Sound ist das atomar, und im Speicher liegt höchstens ein Sound gleichzeitig. Ein Abbruch setzt beim nächsten Start fort. Fehlerhafte Sätze bleiben in `sounds` und werden in `kv.migrateErrors` vermerkt, dazu der Einblender „n Sounds konnten nicht umgestellt werden – sie bleiben, nächster Start versucht es wieder.“ Splash: „Speicher wird umgestellt – 12 von 140“. `crc` wird erst beim Sichern berechnet und dann gemerkt.
- **Start:** `loadAll` liest nur `meta` (ohne `trashedAt`). `audio` wird erst beim ersten Gebrauch gelesen (vorhandener Stub-Weg).
- **Anlegen:** `create` schreibt `meta` und `audio` in einer Transaktion und berechnet `crc`. Bei `QuotaExceededError` gilt der Sound für diese Sitzung, und der Einblender sagt „Speicher voll – „Klang 3“ gilt nur bis zum Schließen. Sichern, dann aufräumen.“ `available` bleibt wahr (heute wird es für immer falsch).
- **Rückwärts:** Ein alter, zwischengespeicherter Stand öffnet v2 mit Version 1 → `VersionError` → „Sound fehlt“. Die Daten bleiben erhalten. Der Service Worker bekommt `CACHE = 'krachwerk-v3'`.

### Speicher-Zeile (Bedienung)
Block **„Werkstatt“** am Ende der Song-Werkbank (Desktop: Werkbank ohne Auswahl; Handy: Song-Fach). Zahlen in Mono, Wörter in Sans, `--muted`:
```
312 MB eigene Sounds · 1,2 GB frei · dauerhaft
zuletzt gesichert 02.11.
[Sichern]  [Zurückholen]
12 nicht im Song · 48 MB          [In den Papierkorb]
```
- Die Größe ist die Summe von `meta.bytes` dieser DB. „frei“ kommt aus `navigator.storage.estimate()` (gilt für den ganzen Ursprung, Loopwerk und Krachwerk zusammen). „dauerhaft“ zeigt `persisted()`. Steht dort „kann gelöscht werden“, fragt ein Tipp darauf `persist()` (mit Geste) und zeigt am iPhone im Browser den vorhandenen Tipp „Zum Home-Bildschirm“ (`pwa.js`).
- **Erinnerung (ruhig):** nur ein Leuchtpunkt am Eingang zum Song-Fach bzw. am Werkbank-Streifen, wenn nicht dauerhaft **und** seit der letzten Sicherung > 50 MB neu oder > 14 Tage mit neuen Sounds. Keine Einblender.
- **Aufräumen:** „nicht im Song“ heißt: eigener Sound ohne Bezug aus dem Projekt (`clipSampleIds` aller Clips, auch stummer; Rezept-Schlüssel und `parent`), aus dem Rückgängig-Verlauf (Textsuche in `undoStack`/`redoStack`) und aus der Pad-Belegung (`EDITION.padsKey`), und ohne Favoriten-Stern. „In den Papierkorb“ fragt im Knopf „Sicher?“ (2 Tipps, Rot) und setzt `trashedAt`.
- **Papierkorb:** Er steht als letzte Gruppe der Kiste, gefaltet und nur, wenn er nicht leer ist. Je Zeile „Zurück“, im Kopf „Leeren“ (im Knopf „Sicher?“, Rot). Beim Start wird geleert, was älter als 14 Tage ist (datengesteuert, kein Zeitgeber). In Krachwerk führt auch × in der Kiste in den Papierkorb (`trash: true`). Loopwerk löscht wie heute sofort.
- Speicher-Aktionen gehören nicht zum Song und stehen nicht im Rückgängig-Verlauf. Umkehrbar sind sie über den Papierkorb (ADR 012).

### Schnittstelle `OwnSounds` (neu)
`usage() → { bytes, count, trashBytes, free, persisted, lastBackup }` · `trash(ids)` · `untrash(ids)` · `purge({ olderThan })` · `unused(project, { stacks, protect })` (reine Hilfe in **neu `src/own-usage.js`**, in Node testbar) · `emit` bei jeder Änderung (die Speicher-Zeile zeichnet neu).

### Dateien
`src/own-sounds.js` (Schema, Migration, `create`, `loadAll`, Papierkorb, Nutzung), `src/own-usage.js` neu, `src/ui/storage-panel.js` neu (Block „Werkstatt“), `src/ui/library.js` (Gruppe Papierkorb), `src/ui/inspector.js` (Platz für den Block in der Song-Werkbank), `src/main.js` (Splash-Fortschritt, Optionen), `src/edition.js` (`storagePanel`, `trash`), `src/werkstatt/sw.js` (v3), `index.html` (CSS im calm-Block, nur Tokens).

---

## 5. Sicherung als ZIP (3a) – ADR 012

### Format
```
Krachwerk-Sicherung 2026-11-06.zip          (Song: „Küchensong.zip“)
  werkstatt.json      { format:'loopwerk-werkstatt', version:1, app, created,
                        sounds:[{ …meta ohne trashedAt, file:'sounds/<id>.wav' }],
                        songs:[{ file:'songs/Kuechensong.json', name, current:true }],
                        pads?: <Inhalt von padsKey> }
  sounds/<id>.wav     16-Bit-WAV wie gespeichert
  songs/<name>.json   Projekt-JSON (version 1, mit recipes, takes, mute …), ohne ownSounds
```
- **Werkstatt sichern:** alle Sounds außer dem Papierkorb, dazu der aktuelle Song und die Pads. Die Einstellungen je Gerät (Latenz, Zoom, Tipps) kommen nicht mit.
- **Song speichern / teilen:** In Krachwerk schreibt `#save-btn` die ZIP mit genau den Sounds des Songs (Auswahl wie `embed`: `clipSampleIds`, `parent` der Varianten, `isOwnId`). Mit `navigator.canShare({ files })` (Handy) öffnet sich das Teilen-Menü (Dateien, AirDrop, Messenger), sonst kommt ein Download über `saveFile` (im Artifact über `downloads`, ZIP ist dort erlaubt). Loopwerk speichert weiter `.json`.
- **Öffnen:** `#open-btn`, „Zurückholen“ und eine ZIP, die man auf die App fallen lässt, gehen alle zu `importArchive`. Das gilt in **beiden** Editionen (`accept=".json,.zip"`), so öffnen Krachwerk-Songs auch in Loopwerk.
- Beim Schreiben werden Blobs aus `audio` mit vorab berechnetem `crc`/`size` an `makeZip` gegeben (vorhanden), ohne alles in den Speicher zu laden. Beim Lesen holt neu `readZipBlob(blob)` (`src/zip.js`) nur das Verzeichnis über `blob.slice` und liest jeden Eintrag einzeln. „deflate“ geht über `DecompressionStream('deflate-raw')`, wo es das gibt. Sonst kommt „Diese ZIP ist nachträglich gepackt – nimm die Original-Sicherung.“ Grenzen: kein ZIP64 (unter 4 GB, unter 65 535 Einträge), sonst die Meldung „Zu groß für eine Datei.“

### Konflikte beim Zurückholen (keine Dialoge)
| Fall | Verhalten |
|---|---|
| ID gibt es hier nicht | anlegen (`meta` + `audio`) |
| ID da, gleiche `crc` (oder gleiche `bytes`, wenn `crc` fehlt) | überspringen, nichts überschreiben („schon da“). Es gelten die Metadaten von hier |
| ID liegt im Papierkorb | zurücklegen (`untrash`) |
| ID da, anderer Inhalt | unter neuer `own-…`-ID anlegen und die Songs der ZIP umschreiben: neu `remapSampleIds(project, map)` in `model.js` (Clip `sampleId`/`takes`, `recipes`-Schlüssel und `parent`, `sampleTempo`, `soundKeys`) |
| Pads | nur übernehmen, wenn hier keine stehen |
| Song (`current`) | wird geöffnet über **neu `store.openSong(project)`**: ein Undo-Schritt, der das ganze Projekt ersetzt. ↶ holt den vorigen Song zurück, die Sounds bleiben. `nextId` steigt nur (max aus beiden), damit nach ↶ keine Clip-ID doppelt vergeben wird |

Einblender: „Zurückgeholt: 42 Sounds neu, 8 schon da – „Küchensong“ geöffnet. ↶ holt deinen vorigen Song zurück.“ `lastBackup` wird nur beim **Sichern** gesetzt, nicht beim Zurückholen.

### Bedienung (Tipps)
Sichern: Deck antippen → Song-Fach → „Sichern“ = **2** (Desktop: Werkbank-Streifen → Sichern = 2). Song teilen: Song-Fach → „Speichern“ = **2**. Zurückholen: Song-Fach → „Zurückholen“ → Datei = 2 + Auswahl. Während des Sicherns zeigt der Knopf eine Weißglut-Linie mit Fortschritt, abbrechbar durch erneutes Tippen.

### Dateien
`src/archive.js` neu (Manifest bauen und lesen, Konflikt-Plan als reine Funktion), `src/zip.js` (`readZipBlob`, deflate), `src/model.js` (`remapSampleIds`, `openSong`), `src/own-sounds.js` (`exportArchive`, `importArchive`, `eachSound`), `src/ui/project-io.js` (ZIP öffnen, Krachwerk speichert ZIP, Teilen), `src/ui/storage-panel.js` (Sichern/Zurückholen; in 3a als kleiner Block ohne Größenangabe), `src/main.js` (ZIP ablegen), `src/edition.js` (`songFile: 'zip'`), `index.html` (`accept`).

---

## 6. Zähl-Budgets
| Bild | Grenze |
|---|---|
| Desktop und Handy *Start*, *Clip gewählt*, *Werkbank Mitte* (kein Take-Clip, Loop aus bzw. Clip gewählt) | **unverändert** gegenüber 2b. Das Loop-Etikett fehlt bei Clipwahl, „Festhalten“ im Werkzeug gibt es erst ab 2 Clips, die Take-Zeile nur bei Take-Clips, der Block „Werkstatt“ nur in der Song-Werkbank |
| neu *Loop an, nichts gewählt* (Desktop/Handy) | höchstens +1 gegenüber *Start* (Festhalten) |
| Loopwerk alle Bilder | **exakt** `count-baseline.json` (`accept` am versteckten Input zählt nicht) |

## 7. Testplan
**3a `tests/backup.test.cjs` neu** (Browser, zwei getrennte Kontexte = zwei Geräte):
1. Hin und zurück: 3 Sounds (Stereo, Mono, `mk-` im Prototyp-Format), Song mit Rezept, Variante und Take-Clip (2 Takes) → Sichern. Die ZIP enthält `werkstatt.json`, 4 WAV-Dateien und 1 Song, alle mit `crcOk`. Im frischen Kontext zurückholen: PCM aller Sounds bitgleich (größte Abweichung 0), Offline-Render des Songs gleich (< 1e-4), `recipes`/`takes` gleich.
2. Konflikt gleich: zweimal zurückholen → beim zweiten Mal „0 neu, 4 schon da“, keine doppelten `meta`.
3. Konflikt anders: dieselbe ID mit anderem Inhalt → neue ID. Im geöffneten Song zeigen `sampleId`, `takes`, `recipes[vr].parent` und `sampleTempo` auf die neue ID, der Render ist gleich der Quelle (< 1e-4), der lokale Sound ist unverändert.
4. Rückgängig: nicht leerer Song, zurückholen, `store.undo()` → Projekt-JSON gleich dem Stand davor, die Sounds bleiben. Danach Clip einfügen → keine doppelte Clip-ID.
5. Song-ZIP enthält genau die benutzten Sounds inklusive inaktiver Takes und Eltern von Varianten, keinen anderen.
6. Loopwerk `/` öffnet die Song-ZIP (Clips und Sounds da), `countUi` trifft die Basis exakt, keine Konsolenfehler.
7. Defekt: Datei ohne `werkstatt.json` oder mit falscher CRC → Einblender, nichts angelegt. Gepackte ZIP (deflate, mit `CompressionStream` erzeugt) geht.
8. Teilen: Mit gestubbtem `navigator.share`/`canShare` wird `share` mit einer Datei `*.zip` gerufen, ohne Stub kommt ein Download.

**3b `tests/storage-v2.test.cjs` neu:**
1. Migration: `loopwerk-make` v1 mit 3 Sätzen (davon 1 `mk-`) füllen → Start → `meta` 3, `audio` 3, `sounds` 0, `kv.schema` 2. Audio bitgleich, ein Clip klingt (Spitze > 0,1 am Clipanfang ±2 ms).
2. Abbruch: Test-Haken wirft nach Sound 2 von 5 → neu laden → 5 umgestellt, keine doppelten, keine verlorenen.
3. Start liest nur `meta`: 50 Sounds × 10 s, Zähler `own.stats.audioReads === 0` bis zum ersten Gebrauch. Zeit bis `ready` wird ausgegeben und ist ≤ 1,2 × der Zeit mit 0 Sounds.
4. Sichern ohne Speicherberg: 200 MB Sounds sichern, `performance.memory.usedJSHeapSize` wächst um < 60 MB (Chromium, ausgegeben).
5. Voller Speicher: `put` wirft `QuotaExceededError` → Einblender, Sound spielbar, der nächste `create` versucht es wieder.
6. Zeile: Größe = Summe der WAV-Bytes (genau), „dauerhaft“/„kann gelöscht werden“ folgen gestubbtem `persisted()`, „zuletzt gesichert“ nach Sichern.
7. Aufräumen: A im Clip, B inaktiver Take, C Eltern einer Variante, D Favorit, E nur im `undoStack`, F und G unbenutzt → „2 nicht im Song“. 2 Tipps → Papierkorb mit F und G. „Zurück“ legt F zurück. `trashedAt` vor 15 Tagen → beim Start gelöscht (`meta` und `audio`), vor 13 Tagen → bleibt.
8. Rückwärts: DB v2 mit Version 1 öffnen → Fehler abgefangen, „Sound fehlt“. Danach mit v2 sind alle Daten da.
9. Loopwerk: DB `loopwerk` wird ebenso umgestellt, `tests/robust.test.cjs` grün, kein Block „Werkstatt“, Basis exakt.

**3c `tests/werkstatt.test.cjs`, Teil 3c** (Loopback-Attrappe aus `v213-aufnahme.test.cjs` wiederverwenden):
1. Loop 0–4 bei 90 BPM, Song läuft, ● → `engine.playing` bleibt die ganze Zeit `true`. 3 Durchgänge mit Ton 440/550/660 Hz und Marker bei 0,25 s, Stopp nach dem halben 4. Durchgang → `takes.length === 3`, `take === 2`, jeder Take genau N Frames, Marker bei round(0,25 · sr) ± 2 Samples, Ton k ≥ 20 dB über den anderen (Goertzel).
2. Säubern: Bei Doppel-Mono hat jeder Take 1 Kanal. Das Pegelverhältnis Take 1/Take 3 ist gleich der Eingabe ± 0,1 dB. Gleichanteil < 1e-4.
3. ● bevor der erste Durchgang beginnt, wieder ● → Einblender „zu kurz“, kein neuer Sound.
4. Rezept auf alle Takes: in der Werkbank `gain −6` → alle drei `recipes` gleich, ein Undo-Schritt. Take wechseln → Render bleibt −6 dB ± 0,5.
5. Song steht → ● nimmt einen Klang auf (Teil 1a, Prüfung 5 unverändert grün).
6. Kiste zeigt „· 3 Takes“ gefaltet. Take-Zeile in der Werkbank: „1“ → `sampleId === takes[0]`, × → 2 Takes.
7. Loop und Tempo gesperrt (Projekt unverändert). Leertaste beendet die Aufnahme und hält den Song an.

**3d `tests/bounce.test.cjs` neu** (`limiter:false`, Rauschen mit `mulberry32`):
1. Länge: Loop [4, 8) bei 90 BPM → genau round(4 · 60/90 · sr) Frames, `kind 'loop'`, `beats 4`.
2. Null-Test trocken: 2 Spuren ohne Effekte, Loop festhalten → Render des ganzen Songs vorher/nachher, Abweichung ≤ −90 dB im Bereich und 0 außerhalb.
3. Faltung mit Hall: Die Clips aus [4, 8) liegen zusätzlich als Kopie in [8, 12). Render von [8, 12) des Originals gegen den festgehaltenen Sound → RMS-Abweichung ≤ −60 dB. Ohne Faltung wäre sie ≥ −30 dB (Gegenprobe).
4. Kopfraum: zwei Sinus 0,8 gleichphasig → Sound-Spitze ≤ 0,98, Clip-`gain` gleicht aus, Song-Render ± 0,1 dB gleich.
5. Undo: Undo-Stapel +1, `undo()` → Projekt-JSON wie vorher, der Sound bleibt in der Kiste.
6. Stumm: Ein stummer Clip oben verdeckt den unteren nicht (Render), Realtime plant für ihn keine Stimme (`sampleFor`/Stimmenzähler), Schraffur im Arranger, „Stumm aus“ ist ein Undo-Schritt.
7. Spur ohne Effekte: Das Ergebnis liegt oben auf derselben Spur, keine neue Spur, Render vorher/nachher ≤ −90 dB bei aktivem Spur-EQ.
8. Auswahl: 2 von 3 Clips einer Spur gewählt → der dritte (660 Hz) fehlt im Sound (≥ 60 dB unter den anderen).
9. Eingefroren: Quelle mit `lp 300` → Band > 2 kHz im Sound ≥ 20 dB leiser. Danach `setRecipe(lp: null)` an der Quelle → der Sound ist bitgleich wie vorher.
10. UI: Loop an, nichts gewählt → „Festhalten“ im Loop-Band (Desktop 1400×820 und Handy 390×844 Touch, ≥ 44 px). 1 Tipp → Spur „Festgehalten 1“ unter der untersten Quellspur, Clip gewählt. F und Umschalt+F (nur Kiste). Mit Clipwahl ist das Etikett weg. Budgets aus §6.

**Bestehend:** `npm test` vollständig grün. Bilder (`--shots`): `kw-takes-handy`, `kw-takes-desktop`, `kw-festhalten-handy`, `kw-festhalten-desktop`, `kw-speicher-handy`, `kw-papierkorb-desktop`. Dazu ui-designer-Review und CD-Durchsicht am echten Handy.

**Ohr-Test für Martin:**
1. Mit Kopfhörern viermal über einen 2-Takt-Loop singen: Sitzt jeder Take im Takt? Knackst der Wechsel während der Wiedergabe?
2. Dasselbe am Handy-Lautsprecher: Stört das Übersprechen des Songs im Take?
3. Einen Loop mit Hall festhalten und laufen lassen: Hörst du die Naht am Loop-Anfang, und ist die Hallfahne gleich?
4. Den festgehaltenen Loop rückwärts drehen und zerlegen: Taugt das als Material?

## 8. Reihenfolge der Arbeit
| # | Schritt | Wer | parallel |
|---|---|---|---|
| 0 | Testgerüste `backup`, `storage-v2`, `bounce` (scheitern erst), Fixtures, Zählbild *Loop an* | qa | – |
| 1 | 3a: `readZipBlob`, `archive.js`, `remapSampleIds`, `openSong`, Export/Import in `OwnSounds` (noch v1) | audio-engineer | – |
| 2 | 3a: ZIP öffnen/speichern/teilen, Block „Werkstatt“ (Sichern, Zurückholen) | ui-engineer | nach 1 |
| 3 | **Abschluss 3a**, Martin sichert seine Werkstatt einmal | Haupt-Session | – |
| 4 | 3b: Schema, Migration, Quota, Papierkorb, `own-usage.js` | audio-engineer | nach 3 |
| 5 | 3b: Speicher-Zeile, Papierkorb in der Kiste, Leuchtpunkt | ui-engineer | ab 4 |
| 6 | 3c: Recorder `loop`, `cleanPasses`, `setRecipe` mit Liste, `takeGroup` | audio-engineer (Skill `audio-engine-regeln`) | ab 3 |
| 7 | 3c: Take-Zeile in der Werkbank, Kiste faltet, rote Marke, Einblender | ui-engineer | nach 6 |
| 8 | 3d: `clip.mute`, `renderView` (`onlyClips`, `dry`), `bounce.js`, `store.bounce` | audio-engineer | ab 3, mit 6 |
| 9 | 3d: Loop-Band-Etikett, Werkzeug, Spur-Werkbank, Taste F, Schraffur | ui-engineer | nach 8 |
| 10 | Abschluss je Scheibe: `npm test`, Bilder, ui-designer, CD, ROADMAP, CLAUDE.md (Speicher-, Sicherungs-, Festhalten-Satz) | Haupt-Session | – |

## 9. Risiken
- **Migration verliert Daten.** Gegenmittel: 3a zuerst (Sicherung), Transaktion je Sound, `sounds` erst nach erfolgreichem Schreiben leeren, Abbruch-Test, `migrateErrors`.
- **Speicher am iPhone** (Blob in IndexedDB, große ZIP im Teilen-Menü). Gegenmittel: Blobs statt ArrayBuffer, `readZipBlob` liest je Eintrag, Messung in 3b Test 4, Ohr- und Handtest am iPhone.
- **Aufräumen trifft Sammlung.** „Nicht im Song“ heißt nicht „Müll“. Gegenmittel: ehrlicher Name, Favoriten geschützt, Papierkorb 14 Tage, Song-Dateien und ZIPs enthalten ihre Sounds.
- **`clip.mute` in älteren Ständen:** Ein alter Loopwerk-Stand spielt stumme Quellen mit, man hört sie doppelt. Akzeptiert, weil beide Editionen aus einem Code kommen (ADR 011).
- **Takes mit Lautsprecher:** Der Song spricht ins Mikro über. Gegenmittel: Kopfhörer-Hinweis. Echounterdrückung bleibt bewusst aus (sie verbiegt den Klang).
- **Faltung bei nichtlinearen Effekten** (Kompressor, Pumpen): Die Naht ist nur fast nahtlos. Test 3 nimmt lineare Ketten, der Rest ist Ohr-Test 3.

## 10. Offene Fragen (Voreinstellung = meine Empfehlung)
1. **● bei laufendem Loop = Takes?** Heute legt ● in Krachwerk auch beim Spielen einen Einzelklang an. *(Ja, Takes. Einzelklang: anhalten, dann ●. Eine sichtbare Regel statt eines Umschalters.)*
2. **Rezept am Take-Clip für alle Takes?** *(Ja, sonst klingt der Wechsel roh.)*
3. **Festhalten ersetzt an Ort und Stelle** (neue Spur, Quellen stumm) **als Voreinstellung**, „nur Kiste“ mit Umschalt/lange drücken? *(Ja. Es klingt sofort gleich und ist ein Undo-Schritt.)*
4. **Festgehaltene Sounds in 16 Bit mit Clip-Ausgleich** statt 32 Bit Gleitkomma? *(16 Bit, halber Platz. Der Ausgleich macht es im Song exakt.)*
5. **Loopwerk bekommt Speicher v2 mit** (gleicher Code, Oberfläche unverändert)? *(Ja. Zwei Speicherwege wären doppelte Fehlerquellen, und Loopwerk startet mit vielen Aufnahmen auch schneller.)*
6. **Krachwerk speichert Songs als ZIP statt JSON?** Loopwerk öffnet beides. *(Ja. Base64 kostet 33 %, und Teilen am Handy braucht eine Datei.)*
7. **Papierkorb-Frist 14 Tage?** *(Ja.)*
8. **Erinnerung ans Sichern nur als Leuchtpunkt?** *(Ja, kein Einblender. Ruhig, aber sichtbar, solange der Speicher nicht dauerhaft ist.)*
9. **Mehrere Songs im Gerät (Songliste)?** *(Nicht in Scheibe 3, sondern Song-Werkbank in Scheibe 5. Das ZIP-Format trägt schon mehrere `songs`.)*
