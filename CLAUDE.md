# Loopwerk

Loop-basierter Music Maker im Browser, angelehnt an Magix Music Maker (ca. 2000). Ziel: niedrigschwellig Musik aus Loops bauen, später eigene Aufnahmen und Bearbeitung. Wächst in Stufen, siehe `docs/ROADMAP.md`.

## Technik
- Reine ES-Module ohne Build-Schritt, Web Audio API. `index.html` hat bewusst kein `<!doctype>`/`<head>`: die Artifact-Veröffentlichung ergänzt das Gerüst (lokal macht das `tests/serve.cjs`).
- `src/model.js` – Projektmodell + `Store` (alle Änderungen über Aktionen → Undo/Redo). Positionen immer in Schlägen. Überlappende Clips bleiben erhalten; es klingt der obere (`clip.z`, `audibleRanges`).
- `src/engine.js` – Scheduler mit Vorlauf, Loop-Sprünge, Live-Resync, Kanalzüge mit Effektketten (`buildMix`/`syncMix`), `renderProject` für Offline-Rendering/Export.
- `src/samples.js` + `src/catalog.js` – Bibliothek: synthetische Loops und CC0-Sounds (Sonic Pi), Tempo-Vorbereitung (`setTempo`).
- `src/effects.js` – Effekt-Rack (Verzerrer, Filter, EQ, Kompressor, Pumpen, Echo, Hall); taktsynchrone LFOs über `mix.grid`.
- `src/dsp/` – Time-Stretching (WSOLA), Bearbeitungsfunktionen, Aufnahme-Worklet, FFT, Tonhöhe (YIN → Noten), Autotune (PSOLA), Trennung (HPSS + Mitte, ADR 003). Lange Rechnungen über `runJob` im Worker.
- `src/own-sounds.js`, `src/recorder.js` – eigene Sounds (IndexedDB, Projektdatei), Mikrofon- und Tab-Aufnahme; `src/ui/link-import.js` – Sounds per Link holen.
- `src/instruments.js`, `src/patterns.js` – Beat-/Melodie-Patterns, als Sounds „pat-…“ gerendert.
- `src/ai.js` – Melodie weiterführen, Klang aus Beschreibung: Claude über die Artifact-Capability `sample`, sonst Regeln.
- `src/wish.js` + `src/ui/wish.js` – Wunsch-Agent: Satz → Plan (Claude oder Regeln) → `store.batch` (ein Rückgängig-Schritt).
- `src/export.js`, `src/zip.js`, `src/wav.js`, `vendor/lamejs/` – Export WAV/MP3.
- `src/ui/*` – Regal, Arranger, Deck, Docks (Mixer, Sample-Editor, Pattern-Editor, Export). Die UI liest aus dem Store und schreibt nur über Store-Aktionen. Docks über `ui.setDock(name)`.
  - `layout.js` + `place.js`: dieselben Knöpfe je Bildschirm an ihren Platz (Desktop: Deck/Menüs/Leisten, Handy: Fach „Mehr“).
  - `glow.js`: Licht aus der Musik (Umgebungslicht hinter den Spuren, Leuchten und Funken an der Marke), nur beim Spielen; im Regal Wellenform nur in der gewählten Zeile.
  - `inspector.js`: rechte Spalte (Clip/Spur/Song); `ui.selectTrack(id)` neben `ui.select(clipId)`.
  - `sheets.js`: Fächer als Schubladen über dem Arranger (Haltepunkte zu/Mitte/oben, je Fach gemerkt); `create.js`: Erstellen-Karten; `tips.js`: Tutorial.
  - Eine Fachleiste `#tabbar` für Handy und Desktop; Rückmeldungen nur als Einblender (`#hint`), keine Erklärtexte (dafür Tipps).
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

## Fertig heißt
- `npm test` grün (alle Stufen: Timing samplegenau, Effekte, Export, UI-Interaktionen, keine Konsolenfehler).
- Ein Screenshot (`--shots`, `SHOT_DIR=…`) angesehen, Desktop und Handy-Breite (es gibt nur dunkel).
- Klang beurteilt der Mensch: bei hörbaren Änderungen um ein Ohr-Feedback bitten.
