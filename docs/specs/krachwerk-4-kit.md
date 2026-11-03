# Krachwerk Scheibe 4: Kit und Instrument

**Stand:** 03.11.2026 · **Grundlage:** `synthese.md` §2 (Pad-Wand = Kit-Werkbank, groß = Pad-Wand), §3.4, `ux.md` a/d, `architektur.md` §3, Spec 2b (Schnitte als Varianten), **ADR 012** (Kit und Instrument als Projektobjekte) · **Branch:** `werkstatt`
**Rahmen:** Loopwerk optisch unverändert (Zählbasis exakt), nur Edition-Optionen, ≤ 5 Grund-Griffe je Reiter, eine Signalkette (`renderPattern` → `pat-…` → `startVoice`/`buildMix`), `PROJECT_VERSION` bleibt 1.

## 0. Ziel aus Nutzersicht
Martin öffnet einen leeren Song, tippt „Klatsch dein Kit“, klatscht und klopft zehn Sekunden und hört sofort einen Groove aus seinen eigenen Schlägen. Aus einem gesummten Ton macht er mit zwei Tipps ein Instrument und spielt darauf eine Melodie in der Tonart des Songs.

## 1. Umfang
**Drin:** Kit-Objekt (8 Pads = `DRUM_ROWS`) mit Kit-Werkbank (Pads 2×4, Schritt-Zeile, Grund), groß gezogen = Pad-Wand zum Live-Spielen · Pad leer antippen = in dieses Pad aufnehmen · ● im Kit-/Instrument-Kontext nimmt Pads/Tasten ins Raster auf · „Klatsch dein Kit“ (Aufnahme → Zerlegen → Kit → Groove) · Zerlegen → „Als Kit“ · Instrument aus einem Sound (Grundton per YIN, 8 Tasten der Song-Tonart) · Übernahme der Pad-Belegung `loopwerk.make.pads.v1` · Startkarte „● Mach ein Geräusch“ · eigene Krachwerk-Tipps.
**Nicht drin:** Mehrzonen-Instrumente, Sampler-Schleife/Halten (`sustain`), Strom-Regler (Synth-Parameter, eigene Spec), Rolle in der Werkbank (bleibt im Pattern-Editor), Kits über Songs hinweg, 16 Pads.

## 2. Bedienung
**Kit-Werkbank** (Clip mit `pat-…` und `kit: 'k-…'`, oder Kit in der Kiste): Kopf (Herkunftspunkt, Name, „in N Clips“) · **Pads 2×4** (Name des Sounds, Herkunftsfarbe, leer = Linie mit „+“) · **Schritt-Zeile** für das gewählte Pad (16 Schritte je Takt, eine `role=grid`, ←/→ wandern, Leertaste setzt, Halten = Anschlag 50 %) · Reiter **Kit · Clip**.

| Kit: Grund (≤ 5) | Feinheiten |
|---|---|
| 1 Takt \| 2 Takte · Swing · Muster (Gerade → Halb → Breaks, Tipp wechselt, ersetzt die Schritte, ein Undo) · Auf die Spur | Anschlag je Schritt · Einrasten 1/16 · 1/8 · Kit umbenennen · Pad leeren |

- **Pad antippen** = spielt jetzt und wählt das Pad. **Leeres Pad antippen** = Aufnahme `mode:'sound'` → Sound kommt aufs Pad (ein Undo: `setKitPad`). **Sound aus der Kiste aufs Pad ziehen** = tauschen. **Pad lang drücken** = Sound-Werkbank dieses Sounds, im Kopf „‹ Kit“ zurück.
- **Pad-Wand:** Handy Schublade „oben“, Desktop ⤢: Pads werden groß (≥ 88 px), Schritt-Zeile bleibt, Grund klappt zu. Gespielt wird über die Spur des Clips (Effekte hörbar).
- **● mit Kontext** (erweitert Scheibe 3): Werkbank zeigt Kit → Quelle „Pads“, Instrument → „Tasten“, sonst wie Scheibe 3. Läuft der Song nicht, startet ● ihn am Loop-Anfang (ohne Vorzähler). Jeder Pad-Schlag landet auf dem nächsten 1/16 im Pattern. Ein ●-Durchgang = ein Undo-Schritt. Am Desktop spielen die Tasten A S D F / J K L Ö die Pads (wie im Pattern-Editor).

**Instrument-Werkbank** (Clip mit `preset: 'in-…'`): Kopf · **Tasten 2×4** = Stufen 1–8 der Song-Tonart (`keyOf`), Grundton markiert · Reiter **Instrument · Clip**.

| Instrument: Grund (≤ 5) | Feinheiten |
|---|---|
| Oktave − + · Ausklang · Auf die Spur · Rolle ▸ (öffnet den Pattern-Editor) | erkannter Grundton (Anzeige + − + Halbton) · Cent · Tonleiter-Art |

**Aus einem Sound:** Sound-Werkbank, Reiter **Ton** bekommt „**Als Instrument**“ (4. Griff). Reiter **Zerlegen**: Grund = Quelle (2) · Empfindlichkeit · **Als Kit** · Auf die Spur; „In die Kiste“ wandert in die Feinheiten (die beiden anderen legen die Schnitte ohnehin in die Kiste).
**Klatsch dein Kit (2 Tipps + Klatschen):** Startkarte bzw. Kiste „+ Neu → Kit aus Klatschen“ → ● (bis 10 s, Stopp nach 2 s Stille) → Kit „Klatschen N“ mit bis zu 8 Pads, Muster „Gerade“, Clip über einen Takt am Loop-Anfang auf der ersten freien Spur, Loop an, spielt. Einblender „6 Schläge – dein Kit spielt.“ Unter 2 Schlägen: „Nur ein Schlag gehört – nochmal?“, nichts entsteht.
**Startkarte** (nur leerer Song, Krachwerk): auf Spur 1 groß „● Mach ein Geräusch“ (= ● Geräusch), darunter klein „Klatsch dein Kit“ und „Ohne Mikro: Strom“ (neuer Beat mit Synth-Kit `elektro`, Muster Gerade). Ohne Mikrofon (claude.ai) heißt die große Karte „Datei holen“. Sie verschwindet mit dem ersten Clip.
**Kiste:** neue erste Gruppe **Kits und Instrumente** (Objekte aus `project.kits`/`instruments`; Tipp = Werkbank, Ziehen auf Spur = Clip). Solange `padsKey` existiert und kein Kit daraus stammt, steht dort „**Pad-Wand**“ als Vorlage; Tipp legt das Kit an.

## 3. Datenmodell (ADR 012)
```
project.kits['k-…']        = { name, map: { kick|snare|clap|hat|open|tomLo|tomHi|crash: sampleId }, from?: 'pads.v1' }
project.instruments['in-…'] = { name, sampleId, root: 36…96, cents: −50…50, release: 0…2 s (0,3) }
pattern (drums).kit = 'k-…'   ·   pattern (synth).preset = 'in-…'
```
- IDs wie Varianten (`k-`/`in-` + Zeitstempel base36 + 4 Zufallszeichen). `validate`: beide nur als Objekt; `normalizeKit`/`normalizeInstrument` verwerfen Unbekanntes, Pads mit fehlendem Sound bleiben stehen (Platzhalter, stumm).
- **Pad-Zuordnung beim Klatsch-Kit / Als Kit** (`assignPads(cuts)` in `src/cuts.js`, nach Spektralschwerpunkt `features().centroid` auf dem gebackenen Schnitt): dunkelster → `kick`, hellster → `hat` (ab 3), mittlerer → `snare`, die übrigen in Helligkeitsfolge → `clap, tomLo, tomHi, open, crash`. Über 8 Schnitte: `pickKit(…, 8)`.
- **Muster** (`src/grooves.js` neu, 16 Schritte/Takt): Gerade = kick 0 8 · snare 4 12 · hat 2 6 10 14; Halb = kick 0 · snare 8 · hat 0 4 8 12; Breaks = kick 0 10 · snare 4 12 · hat alle Achtel · open 14. Leere Pads werden übersprungen.
- **Pad-Wand-Übernahme:** `padsKey` tolerant lesen (Liste von IDs oder Objekten mit `id`/`sampleId`; Format aus der Git-Geschichte von `src/werkstatt/bank.js` vor Scheibe 1a bestätigen), erste 8 Pads mit vorhandenem Audio, Synth-Pads fallen weg. `padsKey` bleibt liegen.
- `usedSampleIds` (Scheibe 3) zählt Kit-Pads und Instrument-Sounds mit; `embed` bettet sie ein. `clearSong` löscht `kits` und `instruments`.
- Lernfeld am Sound-Datensatz (außerhalb Undo): `rec.root` = erkannter Grundton (spart die zweite Messung).

## 4. Store-Aktionen (`src/model.js`, je ein Undo-Schritt)
| Aktion | Verhalten |
|---|---|
| `addKit({ name, map, from }) → kitId` · `setKit(kitId, { name })` · `setKitPad(kitId, row, sampleId \| null)` | `removeKit(kitId)` nur, wenn kein Pattern es nutzt |
| `addInstrument({ name, sampleId, root, cents }) → id` · `setInstrument(id, patch)` · `removeInstrument(id)` | wie Kit |
| `placeKit(kitId, { trackId, atBeat, bars = 1, groove = 'gerade', loop = true }) → { patternId, clipId }` | `batch`: `addPattern` (drums, `kit`, Muster) + Clip + `setLoop` |
| `placeInstrument(id, { trackId, atBeat, bars = 1 })` | leere Melodie, `preset: id` |
| `clapKit(sampleId, cuts, map) → { kitId, clipId }` | `batch('Klatsch-Kit')`: `cutSound` (ohne `place`) + `addKit` + `placeKit`. Verschachtelte `batch` müssen ein Schritt bleiben (prüfen; sonst innere Teile ohne eigenes `batch`) |
| Pad-/Tasten-Aufnahme | `updatePattern(id, fn, 'padrec-' + n)` je ●-Durchgang |

## 5. Engine
- **`Patterns._sync`:** Schlüssel = Pattern-JSON + für Kit `map` + `recipeKey(recipes[id])` je Pad, für Instrument die Definition + `recipeKey`. Vor dem Rendern `await library.ensure(id)` je Sound (Speicher v2: alles auf Abruf) und Rezepte fertig (`applyRecipes` vor `patterns.sync` in `mountSoundState`).
- **`renderPattern`:** `map = pattern.kitMap ?? KITS.find(…)?.map` (Patterns reicht `kitMap` aus `project.kits` hinein), Puffer `library.source(s)`. `drumLabel`/`previewDrum` nehmen eine `map` statt nur einer Kit-ID.
- **Eigene Instrumente:** neu `src/own-instruments.js` `syncInstruments(project, library)` ruft `registerInstrument({ id, label, zones: [{ midi: root, sampleId, cents }], release, own: true })`, neu bei geändertem Schlüssel. `sampler.js loadZone`: hat die Zone `sampleId`, kommt der Puffer aus `library.source(await library.ensure(id))` statt aus `assets/`; `cents` geht in `playbackRate`. Loopwerk-Instrumente unverändert.
- **Grundton:** `detectPitch` (YIN) auf der Mono-Summe des gebackenen Sounds, ab 3 s im Worker (`runJob('pitch')`). `root` = Median der Frames mit Sicherheit ≥ 0,8, gerundet; Rest → `cents`. Unter 10 % sichere Frames: `root 60`, Einblender „Kein klarer Ton – spielt als C4.“
- **Live-Spielen:** neu `engine.trackInput(trackId)`; Pads/Tasten spielen über `previewDrum`/`playSampled` mit `when = ctx.currentTime` in diesen Eingang (gleiche Spurkette). Pad-Aufnahme liest `engine.heardBeat` beim Ereignis, rundet auf 1/16 im Pattern-Fenster. Kein `setTimeout`.

## 6. Tipps (eigene Liste)
`src/tips-make.js` (gleiche Form wie `TIPS` in `src/ui/tips.js`); `mountTips({ ui, store, list })`, `main.js` übergibt die Liste aus `EDITION.tips = 'make'`; `surfaces.tips` bleibt für `#tips-reset` (Platz in Scheibe 5). Höchstens einer je Sitzung, nur als Einblender:
1. nach dem ersten Geräusch: „Tipp auf den Clip – in der Werkbank formst du den Klang.“ 2. Sound ≥ 2 s gewählt: „Zerlegen macht aus einer langen Aufnahme einzelne Schläge.“ 3. Kit offen: „Leeres Pad antippen und ins Mikro machen.“ 4. Loop läuft 3 Durchgänge: „● im Loop nimmt Takes auf, lang drücken für ein einzelnes Geräusch.“ 5. ab 4 Clips: „Festhalten am Loop-Bereich macht aus allem eine Schleife.“ 6. ab 10 eigenen Sounds: „Song → Projekt → Alle Sounds sichern.“

## 7. Dateien
neu: `src/grooves.js`, `src/own-instruments.js`, `src/tips-make.js`, `src/ui/kit-bench.js` (Kit- und Instrument-Werkbank), `src/ui/start-card.js`, `tests/kit.test.cjs` · geändert: `src/model.js`, `src/cuts.js` (`assignPads`), `src/patterns.js`, `src/instruments.js`, `src/sampler.js`, `src/engine.js` (`trackInput`), `src/recorder.js` (Optionen `silence`, `maxSeconds`), `src/main.js`, `src/edition.js` (`kitBench`, `startCard`, `tips`), `src/ui/sound-bench.js` (Als Instrument, Als Kit), `src/ui/library.js`, `src/ui/inspector.js` (`clipPanel` je Clip-Art), `src/ui/tips.js` (Option `list`), `index.html` (Abschnitt `/* Werkbank */`).

## 8. Zähl-Budgets
| Bild | Grenze |
|---|---|
| Handy *Kit Mitte* (8 Pads, Schritt-Zeile) | ≤ 26 / ≤ 13 / ≤ 5 / ≥ 11 (Schritt-Zeile zählt als 1) |
| Desktop *Kit gewählt* | ≤ 45 / ≤ 30 |
| Handy *Start* mit Startkarte | Wert aus 2b + höchstens 3 |
| Reiter Ton, Zerlegen, Kit, Instrument: `.wb-grund` | ≤ 5 |
| Loopwerk alle Bilder | **exakt** Basis |

## 9. Testplan
**`tests/kit.test.cjs`** (Browser, `limiter:false`):
1. **Kit-Render:** 3 eigene Sounds (Sinus-Stöße 200/1000/5000 Hz) auf kick/snare/hat, Muster Gerade, 90 BPM → Anschläge an k·spb/4 ± 1 ms, je Zeile die richtige Frequenz (Goertzel ≥ 20 dB Abstand).
2. **Rezept wirkt im Kit:** `setRecipe(pad, { gain: −12 })` → nach `patterns.sync` ist der Schlag −12 ± 0,5 dB; ohne Schlüssel-Erweiterung schlüge der Test fehl.
3. **Auf Abruf:** Pad-Sound als Stub ohne `orig` → Render enthält ihn trotzdem.
4. **Klatsch-Kit:** Fake-Mikro mit 6 Rauschstößen (Tiefpass 300/800/1500/3000/6000/12000 Hz) → 6 Pads, `kick` = 300 Hz-Stoß, `hat` = 12 kHz-Stoß; Render 1 Takt: Kick bei 0 und 2 Schlägen ± 2 ms. **Ein** `undo()` entfernt Kit, Pattern, Clip, Schnitte; der Aufnahme-Sound bleibt.
5. **Instrument:** Sinus 440 → `root 69`, `cents 0 ± 5`; Note 76 → 659,3 Hz ± 1 %. Sinus 452 → `cents ≈ +47`, Note 69 → 440 Hz ± 1 %. Rauschen → `root 60` + Einblender.
6. **Pad-Aufnahme:** Loop 1 Takt spielt, Schläge bei `heardBeat` 1,02 und 2,49 → Schritte 4 und 10; ein Undo-Schritt je ●-Durchgang.
7. **Datei:** `kits`/`instruments` gespeichert, Pad-Sounds ohne eigenen Clip eingebettet; in `/` geöffnet → Render gleich (< 1e-4).
8. **Pad-Wand:** `padsKey` mit 3 `mk-`-IDs und 1 Synth-Pad → Vorlage in der Kiste, Tipp → Kit mit 3 Pads, `from 'pads.v1'`, Vorlage weg.
**`tests/werkstatt.test.cjs`, Teil 4:** Klatsch-Kit ab Start in 2 Tipps → `engine.playing`, 1 Clip `pat-…`; Pads ≥ 44 px, Pad-Wand ≥ 88 px; Schritt-Zeile per Tastatur; lang drücken auf ein Pad → Sound-Werkbank mit „‹ Kit“ und zurück; „Als Instrument“ + „Auf die Spur“ → Melodie-Clip; Startkarte weg nach dem ersten Clip; erster Tipp nach dem ersten Geräusch, kein Text aus Loopwerks `TIPS` erscheint; Budgets §8; Loopwerk `countUi` exakt, keine Konsolenfehler. Bilder `kw-kit-handy`, `kw-padwand-handy`, `kw-kit-desktop`, `kw-instrument-handy`, `kw-start-handy`.

**Ohr-Test für Martin:** (1) Klatsch-Kit: passt die Zuordnung (dunkel = Kick, hell = Hi-Hat), groovt „Gerade“? (2) Pad-Wand live über den Loop: fühlt sich der Anschlag sofort an, oder spürst du Verzögerung? (3) Instrument aus Summen: wie weit nach oben/unten klingt es noch brauchbar? (4) Ein Pad tiefer stimmen, während der Beat läuft: kommt die Änderung ohne Stolpern?

## 10. Reihenfolge
| # | Schritt | Wer | parallel |
|---|---|---|---|
| 0 | Testgerüst 1–5 | qa | – |
| 1 | Modell, Store-Aktionen, `usedSampleIds`, `grooves.js`, `assignPads` | audio-engineer | – |
| 2 | Patterns-Schlüssel, `renderPattern`-Map, eigene Instrumente im Sampler, YIN, `trackInput` (Skill `audio-engine-regeln`) | audio-engineer | nach 1 |
| 3 | Kit-/Instrument-Werkbank, Pad-Wand, ●-Kontext Pads/Tasten | ui-engineer | ab 1 |
| 4 | Kiste-Gruppe, Pad-Wand-Vorlage, Startkarte, Als Kit/Als Instrument | ui-engineer | mit 3 |
| 5 | Pad-Anschlag (Licht, Größenwechsel zur Pad-Wand) | motion-designer | mit 3 |
| 6 | Tipps-Liste, Texte | Haupt-Session | mit 3 |
| 7 | Tests 6–8, Teil 4, Budgets | qa | ab 3 |
| 8 | Abschluss: `npm test`, Bilder, ui-designer, CD am Handy, ROADMAP, CLAUDE.md, ADR 012 | Haupt-Session, CD | – |

## 11. Für Martin am Ende (Voreinstellung gewählt)
1. **8 Pads (2×4)** statt 16, weil sie auf die 8 Beat-Zeilen passen. Mehr Pads hieße ein neuer Pattern-Typ.
2. **Kits gehören zum Song** (Undo, Datei). Neuer Song = keine Kits; die Pad-Wand bleibt als Vorlage. Kit-Vorlagen über Songs hinweg: später.
3. **Muster „Gerade“** als Grundgroove des Klatsch-Kits, „Halb“ und „Breaks“ zum Durchtippen.
4. **Rolle bleibt im Pattern-Editor** (Rolle ▸), die Werkbank zeigt nur Tasten. Alternative: Rolle in der breiten Werkbank (größerer Umbau).
5. **Ein Grundton je Instrument** (eine Zone, Neuabtastung). Mehrzonen später.
6. **„In die Kiste“ wandert im Reiter Zerlegen in die Feinheiten**, damit „Als Kit“ in den Grund passt.

Offene Fragen, die blockieren: keine.
