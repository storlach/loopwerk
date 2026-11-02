# Krachwerk – Architektur (Brainstorm, 02.11.2026)

Status: Entwurf mit Optionen für Martin. Keine Entscheidung, keine ADR. Grundlage: `docs/specs/ableger-selbermachen.md`.

**Martins Ziel in einem Satz:** Loopwerk mit Arranger und ganzen Tracks, aber das Material entsteht selbst (Mikro, Synth), die Werkbank dafür bekommt mehr Raum und mehr Regler, und die Oberfläche wirkt ruhiger, ohne dass Funktionen fehlen.

**Befund zum Prototyp:** `src/werkstatt/main.js` (~900 Zeilen) ist eine zweite App mit eigener Signalkette (`makeBus`, `voice`), eigenem Speicher (`bank.js`), eigenem Mikrofon (`mic.js`) und eigenem Takt (`groove.js`). Einen Arranger gibt es dort nicht, deshalb `handoff.js`. Die volle App liest `EDITION` bisher nirgends.

## 1. Bauweise

| Option | Was es heißt | Aufwand | Pflege | Risiko |
|---|---|---|---|---|
| **A: Edition der vollen App** | `/werkstatt/` lädt dasselbe `index.html` + `main.js`, `EDITION=make` schaltet Flächen, Kataloge und Voreinstellungen | M (Entkopplung + Flags) | eine Oberfläche, ein Testlauf | CSS-Sonderregeln wuchern, wenn sie nicht an einer Stelle stehen |
| B: neue schlanke Schale für beide | neue UI auf dem Kern, Loopwerk zieht später um | XL | monatelang zwei Oberflächen | Umbau von 1.8–2.12 (Schubladen, Touch, Phosphor) noch einmal |
| C: getrennte Schale (= heutiger Prototyp) | eigene UI, eigener Takt | schon da | doppelt (Engine, Aufnahme, Speicher) | verletzt „eine Signalkette“, Arranger fehlt, trifft das Ziel nicht |

**Empfehlung: A, mit einer Ruhe-Schicht, die auch Loopwerk benutzen kann.** „Minimalistischer, gleiche Funktionen“ wird so nicht zur zweiten Oberfläche, sondern zu einer **Dichte-Stufe** derselben Oberfläche.

### Wie „ruhiger, gleiche Funktionen“ in einer Edition geht
| Baustein | Umsetzung | Nutzen für Loopwerk |
|---|---|---|
| **Flächen-Tabelle** in `src/edition.js` | `surfaces: { starter:false, chordRow:?, genreFilter:false, shelf:'material', workbench:'wide', … }`. `main.js` mountet danach, `#app[data-edition]` + `data-surface-*` für CSS. Keine `if (edition)` quer durch `src/ui/*` | Loopwerk bekommt dieselbe Tabelle (alles an): eine Liste, *was* es in der App gibt |
| **Stufen an Bedienelementen** | Markup: `data-tier="1|2|3"` (1 = immer, 2 = bei Auswahl/Fokus, 3 = nur im „…“-Menü). `#app[data-density=calm]` blendet Stufe 2 erst bei Auswahl ein und verschiebt Stufe 3 per `place()` in ein „…“-Feld | Loopwerk kann `calm` später als Voreinstellung übernehmen; das Aufräumen passiert einmal für beide |
| **Plätze je Edition** | `place.js` bekommt neben `narrow`/`wide` ein drittes Ziel je Edition (`place(node, { wide, narrow, calm })`), die Tabelle steht in `layout.js` | Plätze bleiben an einer Stelle |
| **CSS** | ein Block `/* Edition make */` am Ende von `index.html`, nur Selektoren auf `[data-edition=make]`/`[data-density=calm]`, nur Tokens. Eine Grenze (z. B. 150 Zeilen) setzen; was größer wird, gehört in die gemeinsame Ruhe-Schicht | – |
| Seite | `tools/werkstatt-page.cjs` erzeugt `/werkstatt/index.html` = `index.html` + `<script>LOOPWERK_EDITION='make'</script>` + Manifest/Icon (keine eigene Seite aus Tokens mehr) | – |

`index.html` in Dateien aufzuteilen (`styles/*.css`) lohnt nur, wenn die Artifact-Vorschau externe CSS verträgt (offene Frage 5). Für A ist das nicht nötig.

## 2. Kataloge entkoppeln (kleinster Schnitt, damit die volle App ohne startet)
| # | Stelle | Schnitt |
|---|---|---|
| 1 | `samples.js` Z. 6–11, `LOOP_DEFS`, `buildLibrary` | Katalog-Imports + Loop-Definitionen nach `src/catalog-all.js`; `buildLibrary({ catalogs })` holt es per `import()` nur bei `EDITION.catalogs`. `createKit` und `PEAK_TARGET` bleiben im Kern |
| 2 | `sampler.js` Z. 6–8 | Registry startet leer; `catalog-all.js` ruft `registerInstrument` für VCSL, Regal, Gitarre |
| 3 | `main.js` `boot`/`loadSaved` | `EDITION.demo ? createDemoProject() : createEmptyProject()`; Clips mit unbekanntem Sound als `missing` stehen lassen statt löschen (Fall: Loopwerk-Datei öffnen) |
| 4 | `own-sounds.js` `DB_NAME`, Projekt-Schlüssel in `main.js` | aus `EDITION.db` / `EDITION.storageKey` |
| 5 | `instruments.js` `KITS` | Liste über `EDITION.synthKits` filtern (`akustik` hängt an `sp-*`) |
| 6 | Starter, Genre-Chips, Splash-Text, `modulepreload` | über die Flächen-Tabelle aus; `accompanimentPlan` bleibt |
| 7 | Tests | `openApp({ path:'/werkstatt/' })`; Request-Log: keine Anfrage unter `assets/` außer Icons, keine Konsolenfehler, Loopwerk-Tests unverändert grün |

Aufwand S–M. Die Kataloge kommen dadurch auch in Loopwerk erst nach dem ersten Bild – das schadet nicht, `catalogReady` gibt es schon.

## 3. Werkbank: mehr Einstellungen fürs Selbermachen
**Was es schon gibt:** Sample-Editor (zerstörend: Zuschnitt, Schnitt, Stille, Umkehren, Fades, Gain, Normalisieren, Tonhöhe → neuer eigener Sound), Autotune, Trennen, Einsingen, Pattern-Editor mit Synth-Presets, Sampler (nur Katalog-Zonen), Clip-Fades/Gain/Stretch, Effekte je Spur, `setSampleTempo` (Klang-Eigenschaft im Projekt, mit Undo – das ist das Vorbild).

**Datenmodell: Klang-Rezept am Sound im Projekt, nicht am Clip.** Was einen Klang ausmacht, gilt für alle Clips und Pads mit diesem Klang. Es liegt im Projekt (Undo, in der Datei gespeichert), nicht in IndexedDB. Am Clip bleibt nur, was es heute schon gibt (Lage, Fades, Gain, Stretch).
```
project.sounds[sampleId] = { start, end, gain, reverse, root,        // gebacken
                             env:{a,d,s,r}, filter:{type,freq,q},     // pro Stimme
                             loop:{start,end,xfade} }                 // Sampler-Haltepunkt
project.derived[id] = { parent, start, end, name }                    // virtuelle Sounds: Schnitte ohne neues Audio
project.kits[id]    = { name, map:{ row: sampleId } }
project.instruments[id] = { name, zones:[{ midi, sampleId }] }        // Grundton aus Rezept.root (YIN)
pattern.synth = { osc, cutoff, res, env, detune, sub, drive }
clip.takes = [sampleId…], clip.take = i                               // Loop-Aufnahme
```
Neue Felder sind optional, darum bleibt `PROJECT_VERSION` 1 (alte Dateien laden unverändert; ältere Loopwerk-Stände ignorieren die Felder).

**Store-Aktionen** (je ein Undo-Schritt): `setSoundRecipe(id, patch, coalesce)`, `deriveSound(parent, ranges)` / `moveCut(id, at)`, `addKit/setKitPad/removeKit`, `addInstrument/setInstrument`, `setPatternSynth(pid, patch)`, `addTake(clipId, sampleId)` / `chooseTake`, `bounceClips(ids, sampleId)`.

**Engine:** keine neue Kette. Zwei Wege:
- *Gebacken* (Zuschnitt, Umkehren, Gain, abgeleitete Sounds): in der vorhandenen Vorbereitung der Library (wie `setTempo`), Schlüssel = Rezept-Revision. `clipSignature`/`patterns.sync` müssen die Revision enthalten, sonst klingt nach dem Live-Resync Altes.
- *Pro Stimme* (ADSR relativ zum Clip-Ende, Filter, Loop-Haltepunkt): in `startVoice` (gemeinsam für Realtime und `renderProject`), ein `BiquadFilter` nur, wenn gesetzt.

| Baustein | Baut auf | Aufwand | Reihenfolge |
|---|---|---|---|
| Resampling (Loop-Bereich/Spur → eigener Sound, `parent`) | `renderProject({fromBeat,toBeat})`, `own.create` | S | 1 |
| Aufnahme-Nachbereitung + Auto-Name | `werkstatt/clean.js` → `dsp/clean.js`, Recorder-Option „Stopp nach Stille“ | S | 1 |
| Klang-Rezept: Start/Ende, Gain, Umkehren, Grundton | Editor-Griffe nicht-zerstörend, Backen in der Library | M | 2 |
| Zerlegen mit verschiebbaren Schnitten → virtuelle Sounds | `werkstatt/slice.js` `detectOnsets`, `deriveSound` | M | 3 |
| Kit als Objekt + „Klatsch dein Kit“ | `pickKit`, `classify`, `renderPattern` mit Sample-Map | M | 4 |
| Hüllkurve + Filter pro Sound | `startVoice`, `knob.js` | M | 5 |
| Sampler aus eigener Aufnahme | `registerInstrument`, `loadZone` aus `library.get().orig`, Loop mit Überblendung | M–L | 6 |
| Loop-Aufnahme mit Takes | Recorder + Loop-Sprung, Latenzausgleich je Durchlauf | M–L | 7 |
| Synth mit Reglern | Kit-Stimmen-Parameter, Neu-Rendern entprellt, Vorhören über `startNote` | M | 8 |

## 4. Speicher (Details: Spec §4)
- `OwnSounds.loadAll` legt schon Stubs an, liest aber per `getAll()` **alle WAV-Bytes** in den Speicher. Fix: DB v2 mit `meta`- und `audio`-Store, Regal liest nur `meta`. Das ist die Voraussetzung für „hauptsächlich Aufnahmen“.
- `askPersist` ist schon drin. Dazu: Füllstand (`estimate()`) im Regal, „Alles sichern“ als ZIP (`zip.js`) und Zurückholen per Ablegen. Projektdatei als ZIP erst mit ADR.
- Doppel-Mono → mono (`clean.js isDoubleMono`) beim Speichern, halbiert den Platz.

## 5. Was vom Prototyp bleibt
| Teil | Urteil |
|---|---|
| `clean.js`, `slice.js` | **behalten**, nach `src/dsp/` (gehören zur Werkbank, getestet) |
| `groove.js` | Muster als Pattern-Vorlagen übernehmen; Klasse `Groove` (eigener Takt) **zurückbauen** |
| `main.js`, `bank.js`, `mic.js`, `handoff.js` | **zurückbauen** (zweite App, zweite Kette). Pad-Wand höchstens später als Dock „Pads“ auf `project.kits` (offene Frage 1) |
| `sw.js`, Manifest, Icons, `krachwerk-icons.cjs` | **behalten**, Service Worker cacht dann die volle App unter `/werkstatt/` |
| `edition.js` | **behalten**, um `surfaces`, `demo`, `density` erweitern |
| `tools/werkstatt-page.cjs` | **vereinfachen** (s. 1) |
| `tests/werkstatt.test.cjs` | neu schreiben gegen die volle App |
| Daten in `loopwerk-make` (Bank) | einmalig in den OwnSounds-Speicher übernehmen, Pad-Belegung → `project.kits['pads']` |

## 6. Migrationsweg (jede Scheibe einzeln auslieferbar)
| # | Scheibe | Prüfung |
|---|---|---|
| 1 | **Volle App unter `/werkstatt/` ohne Kataloge**: Entkopplung (§2), Edition in `main.js`, leeres Projekt, Prototyp-Klänge übernehmen, Prototyp-UI weg | Request-Log ohne `assets/`, Pads aus `loopwerk-make` stehen im Regal, `npm test` grün |
| 2 | **Ruhig**: Flächen-Tabelle, `data-tier`, `density=calm`, Regal „Material“ nach Herkunft (Aufnahmen, Schnitte, Kits, Resamples), Aufnahme als Hauptknopf im Regal | Screenshots Desktop + Handy, Durchsicht CD; Zählung sichtbarer Knöpfe vorher/nachher; Funktions-Inventar: jede Funktion in ≤ 2 Klicks |
| 3 | **Aufnehmen + Speicher**: Nachbereitung, Auto-Name, DB v2, Sicherung | 50 Sounds → Startzeit konstant; Stille vorn ± 5 ms |
| 4 | **Resampling + Klang-Rezept** | Resample Länge = Bereich ± 1 Sample; Rezept-Undo; Offline = Realtime |
| 5 | **Zerlegen + Kit-Objekt + Klatsch-Kit** | 8 Impulse → 8 Schnitte ± 5 ms; Schnitt verschieben ändert alle Clips |
| 6+ | Hüllkurve/Filter, Sampler, Takes, Synth-Regler | je eigene Spec; Ohr-Test für Martin |

## 7. Risiken
1. **Ruhe über Flags wird Flickwerk** in `index.html` (CSS + Markup in einer Datei) → eine Flächen-Tabelle, Stufen statt Einzelregeln, CSS-Grenze, CD-Durchsicht je Scheibe.
2. **Entkopplung bricht Loopwerk** (Boot, `catalogReady`, 23 Testdateien mit Katalog-IDs, Sampler-Registry) → Scheibe 1 ändert nur die Ladereihenfolge, Loopwerk-Tests als Wächter.
3. **Martins Pad-Gefühl und Daten gehen verloren**: der Prototyp verschwindet, Aufnahmen auf dem Handy liegen in `loopwerk-make`, iOS räumt Speicher → Übernahme in Scheibe 1, PWA bleibt, Sicherung in Scheibe 3. Dazu: die volle App ist am Handy schwerer als die Pad-Wand (Startzeit messen).

## Offene Fragen an Martin
1. Pad-Wand behalten: als Dock „Pads“ in der vollen App oder ganz weg?
2. Soll Loopwerk die ruhige Dichte später auch als Voreinstellung bekommen?
3. Akkord-Streifen/Begleitung, KI („Klang aus Beschreibung“), Link-Import in Krachwerk: an oder aus? (Link-Import ist nicht „selbst aufgezeichnet“.)
4. Wiederholt Krachwerk Mastering und Effekt-Pad, oder nur über Export?
5. Artifact-Vorschau: `?edition=make` reicht? Verträgt sie externe CSS-Dateien (für eine spätere Aufteilung von `index.html`)?
