# Loopwerk

Loop-basierter Music Maker im Browser, angelehnt an Magix Music Maker (ca. 2000). Ziel: niedrigschwellig Musik aus Loops bauen, später eigene Aufnahmen und Bearbeitung. Wächst in Stufen, siehe `docs/ROADMAP.md`.

## Technik
- Reine ES-Module ohne Build-Schritt, Web Audio API. `index.html` hat bewusst kein `<!doctype>`/`<head>`: die Artifact-Veröffentlichung ergänzt das Gerüst (lokal macht das `tests/serve.cjs`).
- `src/model.js` – Projektmodell + `Store` (alle Änderungen über Aktionen → Undo/Redo). Positionen immer in Schlägen.
- `src/engine.js` – Scheduler mit Vorlauf auf der AudioContext-Uhr, Loop-Sprünge, Live-Resync geänderter Clips, `renderProject` für Offline-Rendering.
- `src/samples.js` – synthetische Start-Bibliothek (120 BPM, A-Moll), `Library`.
- `src/ui/*` – Sound-Regal, Arranger, Transport-Deck. UI liest aus dem Store und schreibt nur über Store-Aktionen.

## Regeln
- Timing nie mit `setTimeout` planen, immer über `ctx.currentTime` + Vorlauf.
- Realtime und Offline nutzen dieselbe Signalkette (`buildMix`, `startVoice`).
- UX wie im Original: alles ist ein Objekt, Drag & Drop, Raster rastet ein, keine Pflichtdialoge, sinnvolle Voreinstellungen. Höchstens zwei Klicks für Grundfunktionen.
- Texte in der Oberfläche auf Deutsch, Code-Bezeichner Englisch, Kommentare Deutsch und sparsam.
- Fremd-Samples nur mit geprüfter Lizenz (bevorzugt CC0); Lizenz in den Metadaten vermerken.

## Fertig heißt
- `node tests/spike.test.cjs` grün (Timing-Test samplegenau, UI-Interaktionen, keine Konsolenfehler).
- Ein Screenshot (`--shots`, `SHOT_DIR=…`) angesehen, hell/dunkel und Handy-Breite.
- Klang beurteilt der Mensch: bei hörbaren Änderungen um ein Ohr-Feedback bitten.
