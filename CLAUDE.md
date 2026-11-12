# Loopwerk

Loop-basierter Music Maker im Browser, angelehnt an Magix Music Maker (ca. 2000). Ziel: niedrigschwellig Musik aus Loops bauen, später eigene Aufnahmen und Bearbeitung. Wächst in Stufen, siehe `docs/ROADMAP.md`.

## Laufende Arbeit
- **Umbau der Oberfläche (Test, Branch `umbau`):** Auftrag, Regeln, Rückweg und erste Schritte stehen in `docs/umbau/uebergabe.md`. Zuerst lesen, wenn es um die Oberfläche geht. `main` und die bestehende Vorschau bleiben davon unberührt.

## Technik
- Reine ES-Module ohne Build-Schritt, Web Audio API. `index.html` hat bewusst kein `<!doctype>`/`<head>`: die Artifact-Veröffentlichung ergänzt das Gerüst (lokal macht das `tests/serve.cjs`).
- `src/model.js` – Projektmodell + `Store` (alle Änderungen über Aktionen → Undo/Redo). Positionen immer in Schlägen. Überlappende Clips bleiben erhalten; es klingt der obere (`clip.z`, `audibleRanges`).
- `src/engine.js` – Scheduler mit Vorlauf, Loop-Sprünge, Live-Resync, Kanalzüge mit Effektketten in wählbarer Reihenfolge (`fxOrder`, Umstellen mit `keepTail`) und Send-Bussen Hall/Echo (`syncBuses`, ADR 008) (`buildMix`/`syncMix`), `renderProject` für Offline-Rendering/Export.
- `src/samples.js` + `src/catalog.js` – Bibliothek: synthetische Loops und CC0-Sounds (Sonic Pi), Tempo-Vorbereitung (`setTempo`).
- `src/effects.js` – Effekt-Rack (Verzerrer, Filter, EQ, Kompressor, Pumpen, Echo, Hall); taktsynchrone LFOs über `mix.grid`; Kompressor und Verzerrer pegelneutral, Echo als Ping-Pong, Schutz am Ausgang ist ein True-Peak-Begrenzer im Worklet (`loopwerk-limiter`).
- `src/levels.js` + `src/levels-table.js` – Pegel nach Lautheit (ADR 013): Ziel-Lautheit je Rolle, die Drums führen; die Tabelle schreibt `tools/klang/pegel.cjs --tabelle` neu, wenn sich Sounds ändern.
- `src/dsp/` – Time-Stretching (WSOLA), Bearbeitungsfunktionen, Aufnahme-Worklet, FFT, Tonhöhe (YIN → Noten), Autotune (PSOLA), Trennung (HPSS + Mitte, ADR 003), Rauschminderung (`denoise.js`, spektral, Profil automatisch, Brummen 50/60 Hz). Lange Rechnungen über `runJob` im Worker.
- `src/own-sounds.js`, `src/recorder.js` – eigene Sounds (IndexedDB, Projektdatei), Mikrofon- und Tab-Aufnahme; `src/ui/link-import.js` – Sounds per Link holen.
- `src/instruments.js`, `src/patterns.js` – Beat-/Melodie-Patterns, als Sounds „pat-…“ gerendert.
- `src/ai.js` – Melodie weiterführen, Klang aus Beschreibung: Claude über die Artifact-Capability `sample`, sonst Regeln.
- `src/export.js`, `src/zip.js`, `src/wav.js`, `vendor/lamejs/` – Export WAV/MP3.
- `src/ui/*` – Regal, Arranger, Deck, Docks (Mixer, Sample-Editor, Pattern-Editor, Export). Die UI liest aus dem Store und schreibt nur über Store-Aktionen. Docks über `ui.setDock(name)`.
  - `layout.js` + `place.js`: dieselben Knöpfe je Bildschirm an ihren Platz (Desktop: Deck/Menüs/Leisten, Handy: Fach „Mehr“).
  - `side.js` (Umbau, Layout `EDITION.layout === 'reiter'`, nur Loopwerk-Desktop): rechte Leiste mit Reitern Datei · Sounds · Mixer (`#side`, `data-side` an `#app`); das Regal zieht in den Reiter Sounds, der Inspektor liefert Song (Datei) und Spur/Summe/Busse (Mixer); `place(..., { reiter })` hängt Knöpfe dorthin. CSS unter `#app[data-layout="reiter"]`.
  - `overlay.js` (Umbau, Layout `reiter`, Desktop): Doppelklick auf einen Clip bzw. „Beat bauen“/„Melodie schreiben“ öffnen wie bisher `ui.setDock('editor'|'pattern')`; `#editor`/`#pattern` und der Clip-Abschnitt des Inspektors (`.insp-clip`) hängen sich dann in eine Karte in der Mitte (`#clip-overlay`, einfliegend, ✕/Esc/Klick daneben schließt, Fokus kehrt zurück); `mountSheets({ external })` lässt die Fächer dafür aus. Kopfzeile `#arr-bar`: Raster · Tempo (`.lcd-song` aus dem Deck) · Teilen/Duplizieren/Löschen (`#arr-bar-tools`, nur bei Auswahl); Zoom-Knöpfe, Editor-Reiter, „Bearbeiten“ und die Fachleiste entfallen, „Tastenkürzel“ steht in Datei.
  - `glow.js`: Licht aus der Musik (Umgebungslicht hinter den Spuren, Leuchten und Funken an der Marke), nur beim Spielen; im Regal Wellenform nur in der gewählten Zeile; Raumlicht als WebGL-2-Shader (`room-shader.js`: Rand-Glühen – Ränder zeigen das Spektrum in den Farben der Spuren, die Mitte bleibt ruhig; Werte aus `room-react.js` und `engine.trackBands`), ohne WebGL 2 Canvas 2D; Seitenleisten mit Weichzeichner.
  - `inspector.js`: rechte Spalte (Clip/Spur/Song); `ui.selectTrack(id)` neben `ui.select(clipId)`.
  - `sheets.js`: Fächer als Schubladen über dem Arranger (Haltepunkte zu/Mitte/oben, je Fach gemerkt); `create.js`: Erstellen-Karten; `tips.js`: Tutorial.
  - Eine Fachleiste `#tabbar` für Handy und Desktop; Rückmeldungen nur als Einblender (`#hint`), keine Erklärtexte (dafür Tipps).
- Edition **Krachwerk** (ADR 007, `docs/specs/krachwerk-1-geruest.md`): die volle App unter `/werkstatt/`, nur mit Selbstgemachtem. Unterschiede stehen nur in `src/edition.js` (`EDITION`; `main.js` gibt sie als Optionen weiter, kein `if (edition)` in `src/ui/*`): ohne Kataloge/Sampler-Instrumente, leerer Song, eigener Speicher (IndexedDB `loopwerk-make`, Schlüssel über `lsKey`), Flächen per `data-surface` + `src/ui/surfaces.js` aus, Aufnahme `mode:'sound'` (● → `src/dsp/clean.js` säubert → Clip im Loop), PWA (`src/pwa.js`, `src/werkstatt/sw.js`). Seite und Manifest erzeugt `tools/werkstatt-page.cjs` aus `index.html` (nur Wörter ersetzt). Test: `tests/werkstatt.test.cjs`; Ruhe messen: `tests/count.cjs` (Loopwerk-Basis `tests/count-baseline.json` muss exakt bleiben). Scheibe 2: Klang-Rezept am Sound (ADR 010, `src/recipe.js`, `src/dsp/recipe.js` backt `orig` + Rezept zu `cooked`, Varianten `vr-…` ohne eigenes Audio), Sound-Werkbank (`src/ui/sound-bench.js`, `wave-handles.js`; Reiter Form · Ton · Farbe · Zeit · Zerlegen · Clip), Zerlegen (`src/cuts.js`, `src/cut-sound.js`, `store.cutSound`), Sample-Editor in Krachwerk aus (Zwillinge in `EDITION.twins`), eigenes Zeichen im Deck (`brand-meter.js` `mountMark`). Tests: `tests/recipe.test.cjs`, `tests/cuts.test.cjs`. Scheibe 3: Sicherung als ZIP (`src/archive.js`, `storage-panel.js`, ADR 012), Takes über den laufenden Loop (`EDITION.recordWhilePlaying: 'loop'`, Recorder-Modus `loop`, `cleanPasses`, `takeGroup`), Festhalten (`src/bounce.js`, `store.bounce`, `clip.mute` nur in `audibleRanges`, ADR 011, `EDITION.bounce`). Tests: `tests/backup.test.cjs`, `tests/takes-loop.test.cjs`, `tests/bounce.test.cjs`.
- Veröffentlichung: GitHub Pages (https://storlach.github.io/loopwerk/) baut sich bei jedem Push auf `main` (`tools/build-pages.cjs` ergänzt das HTML-Gerüst wie `tests/serve.cjs`); Artifact-Vorschau siehe Skill `artifact-sync`.
- Entscheidungen: `docs/adr/`, Specs je Stufe: `docs/specs/`, Stand: `docs/ROADMAP.md`.

## Regeln
- Timing nie mit `setTimeout` planen, immer über `ctx.currentTime` + Vorlauf.
- Realtime und Offline nutzen dieselbe Signalkette (`buildMix`, `startVoice`).
- UX wie im Original: alles ist ein Objekt, Drag & Drop, Raster rastet ein, keine Pflichtdialoge, sinnvolle Voreinstellungen. Höchstens zwei Klicks für Grundfunktionen.
- Look „Phosphor“ (seit 2.2, ADR 004, `docs/specs/v2.2-phosphor.md`): Farben, Schriften und Bausteine nur über die Tokens in `:root`, keine neuen festen Farbwerte. Was klingt, leuchtet (Kategoriefarben); Einstellungen sind Linien; aktiv = Weißglut (`--amber` ist Weiß); Rot nur für Aufnahme/Löschen. Still ist schwarz. Nur dunkel, kein Hell-Modus.
- Texte in der Oberfläche auf Deutsch, Code-Bezeichner Englisch, Kommentare Deutsch und sparsam.
- Fremd-Samples nur mit geprüfter Lizenz (bevorzugt CC0); Lizenz in den Metadaten vermerken.

## Team (Subagenten in `.claude/agents/`)
| Agent | Aufgabe | Modell |
|---|---|---|
| `architekt` | Spec + ADR vor jedem Feature, kein Code | opus |
| `audio-engineer` | Engine, Scheduler, Effekte, DSP, Aufnahme | opus |
| `ui-engineer` | Arranger, Regal, Deck, Mixer, Editoren | sonnet |
| `qa` | Tests schreiben, Randfälle, Fehler melden (ändert kein `src/`) | sonnet |
| `sound-kurator` | Bibliothek, Lizenzen, Metadaten | haiku |
| `ux-designer` | Bedienung prüfen und verbessern (Handy, Desktop) | opus |
| `markt-scout` | Konkurrenz recherchieren, Funktionen vorschlagen (`docs/markt-scout/`) | opus |
| `ui-designer` | Visuelles Design, Look, Reviews aus UI-Sicht (Mockups in `docs/ux/`) | opus |
| `motion-designer` | Bewegung, Gesten, Schubladen-Gefühl (misst Frames, setzt um) | opus |
| `creative-director` | Prüft Entwürfe, gibt frei zur Durchsicht an Martin (`docs/ux/cd-review.md`) | opus |
| `performance-engineer` | Ladezeit, Bildrate, Speicher, Audio-Last messen und verbessern | opus |

Kleine Änderungen macht die Haupt-Session selbst. Agenten lohnen sich ab einer Feature-Scheibe.

## Skills (`.claude/skills/`)
- `feature-slice` – Standardablauf für jedes Feature
- `audio-engine-regeln` – vor Engine-Änderungen laden
- `audio-test` – Klang messbar prüfen
- `effekt-bauen` – Vorlage für Effekte (ab Stufe 4)
- `sample-import` – Sounds mit Lizenzprüfung aufnehmen
- `ux-check` – Bedienprinzipien und Zugänglichkeit prüfen
- `artifact-sync` – Sichern (GitHub storlach/loopwerk führend) und Artifact-Vorschau aktualisieren
- Persönliche Skills von Martin: `kritiker` (unabhängige Prüfung), `scout` (Skill-Review)

## Werkzeuge (`tools/`, je mit `--help`)
**Skript zuerst** (gilt für die Haupt-Session und jeden Agenten): Wiederkehrende Handgriffe laufen über Skripte, nicht von Hand.
- Vor einem Handgriff nachsehen, ob es in `tools/` schon ein Skript dafür gibt, und es benutzen.
- Wer denselben Handgriff zum zweiten Mal von Hand macht oder ein Wegwerf-Skript zum zweiten Mal schreibt (messen, vergleichen, prüfen, umformen, aufräumen), macht daraus ein Skript in `tools/`: Kopfzeilen mit Wozu, Aufruf, Beispiel; `--help`; verlässlicher Exit-Code; ohne neue Abhängigkeit. Dann ausführen, hier in die Liste eintragen und im Bericht nennen.
- Messskripte für einen Befund gehören zum Ergebnis (wie `tools/perf/`), damit vorher und nachher mit demselben Skript gemessen wird.
- Nicht ins Skript gehört, was Urteil braucht: Fehlersuche, Entwurf, Klang beurteilen.

Vorhanden:
- `npm test` (`tools/test.cjs`) – fährt die ganze Kette ohne Abbruch, wiederholt Ausfälle einmal (grün / wackelig / rot). `--only a,b`, `--repeat N name`. Die Kette steht in `tests/chain.txt` (ein Name je Zeile; neue Tests dort anhängen, `merge=union`).
- `npm run regeln` – prüft die Regeln oben mechanisch (feste Farben, Editions-Abfragen in `src/ui`, Timer in der Engine, Katalog-Pflichtangaben, Tests in der Kette) gegen `tools/regeln-basis.json`.
- `tools/merge-agent.sh <branch> [--tests a,b]` – Agent-Branch einfügen, testen, Worktree und Branch aufräumen; bleibt bei echten Konflikten stehen.
- `npm run shots -- --out <ordner>` – fester Satz Bilder (Desktop, Handy, Loopwerk, Krachwerk; `--szene`, `--geraet`, `--edition`).
- `npm run hoerprobe -- --starter <id|alle> | --beispiel | --projekt <datei>` – WAV zum Anhören (`--takte`, `--stil`); `npm run messen -- <wav…>` – Lautheit, Spitze, Bänder, Stereobreite (`--ziel`).
- `npm run vorschau` – seit der letzten Veröffentlichung geänderte Dateien als `files`-Objekt; `--verify <ordner>` prüft veröffentlichte Stände gegen die Git-Historie; `--mark <n>` merkt den Stand (`tools/vorschau-stand.json`).
- `tools/push.sh` – Push mit Wiederholung bei Netzfehlern.
- `npm run funktionen` (`tools/funktionen.cjs`) – Funktionsliste der Oberfläche (`docs/umbau/funktionen.md` und `.json`): jede Bedienfunktion mit Kennung, Beschriftung und Ort je Edition und Gerät, dazu Tastenkürzel und Gesten. `--vergleich <vorher.json>` zeigt, was fehlt, neu ist oder umgezogen ist (Exit 1, wenn etwas fehlt). Dauert rund 4 Minuten.
- `npm run klangvergleich -- <vorher-ordner> <nachher-ordner>` – paart Hörproben über den Namen und zeigt Lautheit, Spitze, Tiefen/Mitten/Höhen und Breite vorher → nachher.
- `tools/bisect-test.sh <guter-commit> <testname>` – findet in einem Wegwerf-Worktree den Commit, seit dem ein Test rot ist. Vorher mit `node tools/test.cjs --repeat 6 <name>` prüfen, ob der Test überhaupt verlässlich ist; bei Wacklern ist das Ergebnis Zufall.
- `tools/agenten.sh [--dateien]` – Stand aller Agent-Worktrees (Commits vor main, ungesicherte Dateien, letzte Änderung).
- `tools/klang/` – Messskripte zum Klang (offline im Headless-Chromium):
  - `sounds.cjs [--teile lib,kits,klaenge,piano,starter] [--vergleich vorher.json]` – Klangfarbe der Sounds selbst: Bänder, Stereobreite, Kits, Melodie-Klänge, Sprung am Notenende, kleine Lautsprecher.
  - `effekt-messen.cjs [--teil einschalten,hall,echo]` – was ein Effekt beim Einschalten mit dem Pegel macht; Pegel und Breite von Hall und Echo.
  - `anschlaege.cjs <wav|Sound> [--faktoren …]` – Anschläge zählen und ihre Lage nach der Tempo-Dehnung prüfen.
  - `rechenzeit.cjs <alter-stand> [<neuer-stand>]` – Rechenaufwand der synthetischen Bibliothek zweier Stände.
  - `druck-bezug.cjs [--muster …] [--write]` – Bezug `tests/fixtures/druck-old-patterns.json` erneuern, wenn sich Kit-Stimmen gewollt ändern.
  - `pegel.cjs [--tabelle] [--streuung] [--teile lib,kits,klaenge]` – Lautheit je Sound, Kit und Melodie-Klang gegen das Ziel ihrer Rolle (ADR 013); `--tabelle` schreibt `src/levels-table.js` neu (nach jeder Änderung an Sounds, Kits oder Klängen).
  - `mix.cjs [--starter a,b|alle] [--beispiel] [--stile …|keine]` – Mischung der Starter und des Beispiels: Spuren im Refrain, Drums minus Bass, Tiefen/Höhen, Breite, Song ohne Mastering und je Stil, Sends.
- `tools/perf/` – Messskripte der Performance-Analyse (Laden, Bedienung, Arranger-Skalierung, Stillstand, Audio-Last, Speicher, Service Worker), siehe `tools/perf/README.md`; `kennzahlen.cjs [--vorher <ordner>]` misst die wichtigsten Kennzahlen der Oberfläche in einem Lauf (Stillstand, Abspielen und Zoom mit 448 Clips, Leinwand-Speicher).

## Fertig heißt
- `npm test` ohne Rot (alle Stufen: Timing samplegenau, Effekte, Export, UI-Interaktionen, keine Konsolenfehler) und `npm run regeln` ohne neue Verstöße.
- Bilder angesehen (`npm run shots -- --out … --szene …`), Desktop und Handy-Breite (es gibt nur dunkel).
- Klang beurteilt der Mensch: bei hörbaren Änderungen eine Hörprobe mitgeben (`npm run hoerprobe`, vorher/nachher) und um ein Ohr-Feedback bitten.
