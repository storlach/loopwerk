# Loopwerk

Loop-basierter Music Maker im Browser, angelehnt an Magix Music Maker (ca. 2000). Ziel: niedrigschwellig Musik aus Loops bauen, später eigene Aufnahmen und Bearbeitung. Wächst in Stufen, siehe `docs/ROADMAP.md`.

## Technik
- Reine ES-Module ohne Build-Schritt, Web Audio API. `index.html` hat bewusst kein `<!doctype>`/`<head>`: die Artifact-Veröffentlichung ergänzt das Gerüst (lokal macht das `tests/serve.cjs`).
- `src/model.js` – Projektmodell + `Store` (alle Änderungen über Aktionen → Undo/Redo). Positionen immer in Schlägen.
- `src/engine.js` – Scheduler mit Vorlauf, Loop-Sprünge, Live-Resync, Kanalzüge mit Effektketten (`buildMix`/`syncMix`), `renderProject` für Offline-Rendering/Export.
- `src/samples.js` + `src/catalog.js` – Bibliothek: synthetische Loops und CC0-Sounds (Sonic Pi), Tempo-Vorbereitung (`setTempo`).
- `src/effects.js` – Effekt-Rack (Verzerrer, Filter, EQ, Kompressor, Pumpen, Echo, Hall); taktsynchrone LFOs über `mix.grid`.
- `src/dsp/` – Time-Stretching (WSOLA), Bearbeitungsfunktionen, Aufnahme-Worklet, FFT, Tonhöhe (YIN → Noten), Autotune (PSOLA), Trennung (HPSS + Mitte, ADR 003). Lange Rechnungen über `runJob` im Worker.
- `src/own-sounds.js`, `src/recorder.js` – eigene Sounds (IndexedDB, Projektdatei), Mikrofon-Aufnahme.
- `src/instruments.js`, `src/patterns.js` – Beat-/Melodie-Patterns, als Sounds „pat-…“ gerendert.
- `src/ai.js` – Melodie weiterführen, Klang aus Beschreibung: Claude über die Artifact-Capability `sample`, sonst Regeln.
- `src/export.js`, `src/zip.js`, `src/wav.js`, `vendor/lamejs/` – Export WAV/MP3.
- `src/ui/*` – Regal, Arranger, Deck, Docks (Mixer, Sample-Editor, Pattern-Editor, Export). Die UI liest aus dem Store und schreibt nur über Store-Aktionen. Docks über `ui.setDock(name)`.
- Entscheidungen: `docs/adr/`, Specs je Stufe: `docs/specs/`, Stand: `docs/ROADMAP.md`.

## Regeln
- Timing nie mit `setTimeout` planen, immer über `ctx.currentTime` + Vorlauf.
- Realtime und Offline nutzen dieselbe Signalkette (`buildMix`, `startVoice`).
- UX wie im Original: alles ist ein Objekt, Drag & Drop, Raster rastet ein, keine Pflichtdialoge, sinnvolle Voreinstellungen. Höchstens zwei Klicks für Grundfunktionen.
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

Kleine Änderungen macht die Haupt-Session selbst. Agenten lohnen sich ab einer Feature-Scheibe.

## Skills (`.claude/skills/`)
- `feature-slice` – Standardablauf für jedes Feature
- `audio-engine-regeln` – vor Engine-Änderungen laden
- `audio-test` – Klang messbar prüfen
- `effekt-bauen` – Vorlage für Effekte (ab Stufe 4)
- `sample-import` – Sounds mit Lizenzprüfung aufnehmen
- `ux-check` – Bedienprinzipien und Zugänglichkeit prüfen
- `artifact-sync` – Sichern/Wiederherstellen über das Artifact (solange kein GitHub)
- Persönliche Skills von Martin: `kritiker` (unabhängige Prüfung), `scout` (Skill-Review)

## Fertig heißt
- `npm test` grün (alle Stufen: Timing samplegenau, Effekte, Export, UI-Interaktionen, keine Konsolenfehler).
- Ein Screenshot (`--shots`, `SHOT_DIR=…`) angesehen, hell/dunkel und Handy-Breite.
- Klang beurteilt der Mensch: bei hörbaren Änderungen um ein Ohr-Feedback bitten.
