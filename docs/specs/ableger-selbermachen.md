# Ableger „Selbermachen“ (Entwurf)

Status: Brainstorming für Martin, keine Entscheidung, keine ADR. Arbeitstitel „Loopwerk Werkstatt“.

## Entscheidungen von Martin (2026-11-02)
- Synthetische Klänge und Kits bleiben als Startmaterial (Klangerzeuger, keine Samples) – „Ohne Mikro anfangen“ ist möglich.
- Einsatz: persönlich, Freizeit. Kein Teilen, kein Konto, keine Schul-Ausrichtung nötig.
- Eigene Sounds zwischen Loopwerk und Ableger teilen: nicht nötig → eigene Datenbank (`loopwerk-make/sounds`), sauber getrennt.
- Eigene Adresse oder Modus in Loopwerk: noch offen, wird später evaluiert. Die Edition-Konfiguration (Option a) hält beides offen.
- Vorschläge aus Markt-Scout, UX und Creative Director gefallen; nächster Schritt: Prototyp der Momente „Pad-Wand mit Aufnahme + Auto-Säubern“ und „Klatsch dein Kit“, auf GitHub Pages am Handy ausprobieren.

## Prototyp (Branch `werkstatt`, 02.11.2026)
- Name: **Krachwerk** (Martin). Adresse `/werkstatt/`, Edition `make` (Option a): `src/edition.js`, Oberfläche `src/werkstatt/`, Seite erzeugt von `tools/werkstatt-page.cjs` (kein zweites `index.html`).
- Moment 1, Pad-Wand: leeres Pad antippen nimmt auf, stoppt nach Stille; `clean.js` säubert (Hochpass, Start auf dem Anschlag, Stille hinten weg, −1 dB, Doppel-Mono → mono) und benennt (Bumm/Klatsch/Ts/Ton A4 + Etiketten). „● Ins Pad“ nimmt neu auf, „✕ Leeren“ leert.
- Moment 2, „Klatsch dein Kit“: Aufnahme bis Stille/Fertig, `slice.js` zerlegt an Anschlägen, bis zu 8 Stücke tief → hell auf freie Pads, Groove (`groove.js`, 4 Muster, „Nochmal“) startet sofort mit Kick = tief, Snare = mittel, Hi-Hat = hell.
- Synth-Kits (elektro, 909) als „◇ Synth“ auf freie Pads, einmal offline vorgerechnet (Stärke, Tasten, Festhalten wie bei Aufnahmen). Keine Anfrage unter `assets/` (außer Icons).
- **Festhalten** (Resampling): rechnet Groove + laufende Schleifen offline mit derselben Summenkette (`makeBus`, `voice`, `stepHits`) als Schleife (1 Takt bzw. Länge der längsten Schleife, Ausklang an den Anfang gefaltet) aufs nächste freie Pad. Am nächsten passenden Taktanfang ersetzt sie, was lief; Quell-Pads bleiben. Schleifen-Pads antippen = im Takt an/aus; „▶ Groove“ schaltet nur das Schlagzeug.
- **Tasten**: Leiste mit A-Moll (A3–A4) spielt das zuletzt gespielte Pad. Tonale Klänge: Grundton per YIN, Feinstimmung auf den nächsten Halbton (auch beim normalen Antippen); Klänge ohne Tonhöhe liegen auf A3.
- **Als App (PWA)**: Manifest und Service Worker unter `/werkstatt/` (erzeugt von `tools/werkstatt-page.cjs`, Bereich nur `/werkstatt/`). Netz zuerst, ohne Netz aus dem Zwischenspeicher → Start auch offline. Beim ersten eigenen Klang `navigator.storage.persist()`; iPhone im Browser bekommt einmal den Tipp „Zum Home-Bildschirm“ (iOS räumt sonst Seiten-Speicher nach Tagen ohne Besuch), Android/Chrome einen Knopf „Installieren“. Icon vorerst das von Loopwerk.
- Flutter geprüft (02.11.2026): vorerst nein – kein Web Audio, DSP und Tonkern müssten neu, zwei Codebasen (Option b). Reihenfolge: PWA → bei Bedarf Capacitor (gleicher Code) → Flutter nur mit eigenem C++-Tonkern (auch als WASM im Browser).
- **Tempo und Tonart**: Tipp auf „90 BPM · A-Moll“ öffnet eine Schublade (− / + in 5er-Schritten, 60–160, Tempo antippen, 12 Grundtöne, Moll/Dur), gemerkt in `loopwerk.make.song.v1`. Groove wechselt ab dem nächsten Schritt, Schleifen ab dem nächsten Takt; Schleifen merken ihr Aufnahmetempo und werden per WSOLA (`dsp/stretch.js`) samplegenau auf das Song-Tempo gestreckt, Tonhöhe bleibt. Tastenleiste = Tonleiter der Tonart (Grundton zwischen F3 und E4); Klänge ohne Tonhöhe liegen im Original auf der ersten Taste.
- **Mitnehmen** (`handoff.js`): Loopwerk-Projektdatei (gleiches Format wie „Speichern“): Schleifen nacheinander auf Spur „Krachwerk“ (je 4 Takte), alle Pads als eigene Sounds (`own-…`, Quelle „Krachwerk“), Tempo, Tonart (Dur → parallele Moll-Tonart, weil Loopwerk Tonarten als Moll führt). Ohne Schleife wird der Groove mitgegeben. Dazu „Schleife als WAV“ (mind. 4 Takte). Am Handy über das Teilen-Menü, sonst Download. Song-Bau passiert in Loopwerk.
- **Roh → geformt**: neue Klänge erscheinen als unruhige Wolke und ordnen sich zur Wellenform (0,7 s; bei „weniger Bewegung“ aus).
- **Icon**: `assets/icons/krachwerk.svg` (Klatscher als Ausschlag um die Mittellinie, Pink), PNG 512/180/32 über `tools/krachwerk-icons.cjs`.

## Ziel aus Nutzersicht
Wer die Werkstatt öffnet, hat ein leeres Regal und baut alles selbst – aufnehmen, klatschen, singen, Synth schrauben, Beats und Melodien, Teile des eigenen Songs wieder zu neuen Sounds machen.

## 1. Wie bauen, ohne zwei Codebasen?

| Option | Bewertung |
|---|---|
| (a) **Edition im selben Repo** | Ein Kern, ein Testlauf, jede Korrektur wirkt in beiden. Unterschiede in *einer* Konfig. Passt zu „kein Build-Schritt“. **Empfohlen.** |
| (b) Fork/eigenes Repo | Nach wenigen Wochen auseinander (Engine, Phosphor, Touch-Fixes doppelt). Nur sinnvoll, wenn der Ableger eine ganz andere App wird. |
| (c) Monorepo Kern + zwei UI-Schalen | Sauber auf dem Papier, aber: ohne Bundler nur Ordner-Umzug; `index.html` (CSS + Markup, ~2900 Zeilen) müsste geteilt werden. Lohnt erst, wenn die Schalen *wirklich* verschieden aussehen. (a) lässt sich später in (c) überführen. |

**Vorschlag (a) konkret**
- `src/edition.js`: `EDITION = { id, title, storageKey, catalogs, starter, demo, kits, shelf }`; Quelle: `globalThis.LOOPWERK_EDITION ?? ?edition=… ?? 'full'`.
- Kein zweites `index.html` im Repo: `tools/build-pages.cjs` erzeugt `_site/werkstatt/index.html` aus `index.html` plus einer Zeile `<script>LOOPWERK_EDITION='make'</script>`; `tests/serve.cjs` liefert dasselbe unter `/werkstatt/`. Artifact: `?edition=make` oder zweites Artifact (offene Frage).
- `#app[data-edition]` blendet Song-Starter, Genre-Filter und Akustik-Kit per CSS/Mount aus; keine Verzweigungen quer durch die UI.
- Gleicher Origin auf GitHub Pages: die IndexedDB `loopwerk/sounds` wird geteilt – in der Werkstatt gebaute Sounds stehen in Loopwerk unter „Eigene“. Projekte bekommen getrennte Schlüssel (`loopwerk.make.project.v1`).

## 2. Was heute an den mitgelieferten Sounds hängt

| Stelle | Kopplung | Entkopplung |
|---|---|---|
| `src/samples.js` Zeilen 6–11, `buildLibrary` (1805–1834) | statische Imports aller Kataloge und Loop-Definitionen; `LOOP_DEFS` (1251 ff.) liegt in derselben Datei wie `createKit`; `GENRES` wird beim Laden aus den Paketen ergänzt | Kataloge nach `src/catalog-all.js` (dynamisch importiert), `buildLibrary({ catalogs })`. `createKit` bleibt im Kern (Synth-Motor für Patterns) |
| `Library.coreIds`/`catalogReady` | Tests warten auf Katalog | in der Werkstatt leer → sofort erfüllt |
| `src/model.js` `createDemoProject` | `drums-four`, `chords-pad` … | Edition liefert `createEmptyProject` (+ evtl. Mini-Demo aus Patterns) |
| `src/main.js` `boot` (377), `loadSaved` (54) | `need` aus Demo-Projekt; **Clips mit unbekanntem Sound werden still gelöscht** | Werkstatt: fremde IDs auf Abruf aus `catalog-all.js` als verborgene Stubs auflösen (kein Datenverlust beim Öffnen einer Loopwerk-Datei) |
| `src/instruments.js` `KITS.akustik.map` | `sp-*` | Kit-Liste aus Edition; neues Kit „Eigenes“ (s. u.) |
| `src/sampler.js` Zeilen 6–17 | Registry importiert VCSL-, Regal- und Gitarren-Instrumente statisch; `loadZone` lädt nur per `fetchAsset` | Registry leer starten, Katalog-Instrumente aus `catalog-all.js` registrieren; Zonen auch aus `sampleId` |
| `src/instruments-shelf.js` | baut aus `VCSL_CATALOG` | wandert mit in `catalog-all.js` |
| `src/starter.js` `planStarter`, `ROCK_KIT_IDS`, `fx-riser`/`fx-crash`; `src/ui/starter.js` | braucht Genre-Loops | Song-Starter in der Werkstatt aus. **`accompanimentPlan`/`applyPlan` bleiben** (reine Patterns) |
| `src/ui/library.js` | Kategorien/Genres; alle eigenen Sounds in *einer* Gruppe `own` | Gruppierung nach Herkunft/Rolle (Aufnahmen, Drums, Töne, Loops, Resamples) |
| `src/fetch-asset.js`, `asset-packs.js`, `assets/` | Pakete | in der Werkstatt nie geladen |
| `index.html` | `modulepreload` von Starter-Modulen, Starter-Markup, Splash „Sounds werden geladen“ | Preloads neutral halten, Texte aus Edition |
| `tests/harness.cjs` + 23 Testdateien mit Katalog-IDs | Werkstatt-Tests brauchen eigene Signale | `openApp({ path })`; Werkstatt-Tests mit `library.register('test-…')` und WAV-Fixtures |
| `src/own-sounds.js` `embed` | bettet nur Sounds ein, die Clips benutzen | auch Sounds aus Kits und Instrumenten einbetten (sonst fehlen sie in der Datei) |

## 3. Erzeuger-Bausteine

| Baustein | Mit Vorhandenem | Aufwand | Risiko |
|---|---|---|---|
| **Resampling** (Loop-Bereich, Spur, Auswahl → eigener Sound) | `renderProject({ fromBeat, toBeat })` + `own.create({ kind:'loop', beats })`; Spur/Auswahl über Projektkopie mit Mute | S | Ausklang: bei Loops in den Anfang falten, sonst klickt die Naht; Mastering aus |
| „An Ort und Stelle“ (Clips durch Resample ersetzen) | neue Store-Aktion `bounceClips(ids, sampleId)`, ein Undo-Schritt | S–M | Effekte der Spur doppelt, wenn mitgerendert |
| **Chop/Slice** zu Pads | Raster-Slices trivial; Onsets mit `fft.js` (spektraler Fluss) neu | Raster S, Onsets M | Onsets bei Raumhall/Rauschen; Abhilfe: Empfindlichkeit-Regler, Schnittmarken im Sample-Editor verschiebbar |
| **Klatsch dein Kit** (eine Aufnahme → 8 Pads) | Slice + `renderPattern` kann Kits mit Sample-Map schon; Zuordnung per Grobklassifikation (tief → Kick, Rausch-hoch → Hat, Mitte → Snare/Clap) | M | Klassifikation irrt; daher Sound per Ziehen aufs Pad tauschen |
| **Sampler aus eigener Aufnahme** | `registerInstrument`, `playSampled`, YIN (`detectPitch`) für Grundton | M | Haltepunkte für lange Töne (Schleife mit Überblendung) eigenes DSP; Tonumfang bei 1 Zone (±1 Oktave ok) |
| **Synth mit Reglern** | Kit-Stimmen haben Parameter (`synthBass`, `acid`, `reese`); `knob.js` | M | Neu-Rendern bei Reglerdrehung (Entprellen, 1–4 Takte sind schnell); Live-Vorhören über `startNote` |
| **Aufnahme-Nachbereitung** (Stille weg, normalisieren, auf Takte runden → „Als Loop“) | `onsetOffset`-Logik, `edit.normalize`; Aufnahme läuft ohnehin zum Klick | S | Auto-Runden darf nicht ungewollt kürzen: nur bei < 5 % Abweichung |
| **Tempo erkennen** bei Importen | Onset-Autokorrelation neu | M | halbes/doppeltes Tempo; Vorschlag statt Automatik |
| **Auto-Benennung/Tags** | Länge, YIN-Ton („C4“), Schwerpunkt/Tiefenanteil, Herkunft; optional Claude über `askJson` mit Merkmalen | S–M | Namen nur Vorschlag, im Clip-Kopf änderbar |
| **Loop-Aufnahme mit Takes** (offen seit Stufe 5) | Recorder + Loop-Sprung | M | Latenz pro Durchlauf, Take-Auswahl-UI |
| Granular (Klangwolke aus eigenem Sound → neuer Sound) | Worker-Job neu | M–L | Ohne Echtzeit-Vorschau wenig spielerisch; später |

Reihenfolge-Vorschlag: Edition-Gerüst → Aufnahme-Nachbereitung + Auto-Benennung → Resampling → Slice + Klatsch-Kit → Sampler → Synth mit Reglern.

## 4. Speicher und Persistenz
Heute: jeder eigene Sound als 16-Bit-WAV in IndexedDB; `loadAll` dekodiert **alle** beim Start (Float32 = doppelte Größe, plus vorbereitete Fassung und Peaks); Projektdatei = JSON mit Base64-WAV (+33 %, ein großer String). Kein `navigator.storage.persist()`.

Empfehlung:
1. **Auf Abruf laden** wie der Katalog: IndexedDB v2 mit zwei Stores (`meta` klein, `audio` groß); Regal liest nur `meta`, `library.stub(…, load)` dekodiert beim ersten Gebrauch. Wichtigster Punkt – sonst wächst Startzeit und RAM mit jedem Sound (iOS-Tabs werden ab einigen hundert MB beendet).
2. **Dauerhaft anfragen**: `navigator.storage.persist()` beim ersten eigenen Sound; Füllstand über `estimate()` im Regal zeigen („Eigene: 312 MB“).
3. **iOS Safari**: Seiten-Speicher kann nach rund sieben Tagen ohne Besuch geräumt werden, Home-Bildschirm-Apps sind davon ausgenommen → Manifest + Hinweis „Zum Home-Bildschirm“ in den Tipps; dazu Sicherung (5).
4. **Kleiner speichern**: Doppel-Mono erkennen (Mikrofon liefert L = R) → mono, halbiert; Abtastrate wie aufgenommen. Verlustbehaftet (Opus über WebCodecs) nur als spätere Option.
5. **Sicherung**: „Alle eigenen Sounds sichern“ als ZIP (`src/zip.js`, WAV + `meta.json`), Zurückholen per Ablegen der ZIP.
6. **Projektdatei als ZIP** (`.loopwerk` = `project.json` + `sounds/*.wav`), JSON weiter lesbar. Formatwechsel → eigene ADR, sobald entschieden.
7. **Aufräumen**: Herkunft (`parent`) merken; „Unbenutzte anzeigen“ statt automatisch löschen.

## Datenmodell (Skizze, `PROJECT_VERSION` bleibt 1)
- Eigener Sound (IndexedDB, nicht im Undo): `group` (`aufnahme|import|resample|slice|kit|ton`), `tags[]`, `rootMidi`, `onsets[]`, `parent`, `channels`.
- Projekt, optional: `project.kits = { id: { name, map: { row: sampleId } } }`, `project.instruments = { id: { name, zones: [{ midi, sampleId }], release, sustain, loop } }`; Pattern `kit: 'k-…'`, `preset: 'i-…'`, `synth: { osc, cutoff, res, env, attack, release, detune, sub, drive }`.
- Store-Aktionen (je ein Undo-Schritt): `addKit/updateKitPad/removeKit`, `addInstrument/updateInstrument`, `bounceClips(ids, sampleId)`, `setPatternSynth(pid, params)`.

## Engine
Keine neue Signalkette: Resamples sind normale Sounds; Kits/Instrumente laufen durch `renderPattern` → Clip → `startVoice`/`buildMix`. Neu: `loadZone` aus `library.get(sampleId).orig`; Pattern-Signatur in `patterns.sync` muss Änderungen an Kit/Instrument/Sound (`rev`) einschließen, sonst klingt Altes.

## Testplan (Skizze)
- `tests/werkstatt.test.cjs`: Seite `/werkstatt/` öffnet ohne Netzabruf unter `assets/` (Playwright-Request-Log), Regal leer, keine Konsolenfehler.
- Resample: Testton (Sinus) im Loop-Bereich → neuer Sound, Länge = Bereich ± 1 Sample, Pegel gleich dem Offline-Render.
- Klatsch-Kit: synthetische Aufnahme mit 8 Impulsen → 8 Slices, Onsets ± 5 ms; Pattern-Render enthält sie an den Schrittpositionen.
- Sampler: Ton 440 Hz als Zone A4 → Note E5 per YIN 659 Hz ± 1 %.
- Loopwerk-Projekt mit Katalog-Clips in der Werkstatt öffnen → Clip-Zahl unverändert.
- Persistenz: 50 eigene Sounds → Startzeit wächst nicht mit (nur `meta` gelesen).
- Ohr-Test für Martin: Klatsch-Kit-Zuordnung, Sampler-Schleifen, Synth-Regler.

## Offene Fragen
1. Name und Adresse: „Loopwerk Werkstatt“ unter `/loopwerk/werkstatt/`? Eigenes Logo/Favicon?
2. Eigene Sounds zwischen Loopwerk und Werkstatt teilen (gleiche IndexedDB) – gewollt?
3. Artifact: zweites Artifact für die Werkstatt oder nur `?edition=make`?
4. Synth-Klänge (Pluck, E-Piano …) und synthetische Kits erlaubt? Sie sind erzeugt, nicht mitgeliefert – Vorschlag: ja, als Startmaterial; nur Samples/Loops entfallen.
5. Projektdatei als ZIP (ADR) jetzt oder erst, wenn Dateien zu groß werden?
6. Begleitung (Akkord-Streifen) in der Werkstatt behalten?
