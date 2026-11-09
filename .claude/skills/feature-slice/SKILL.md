---
name: feature-slice
description: Fester Ablauf, um ein Loopwerk-Feature von der Idee bis zur veröffentlichten Version umzusetzen (Spec → Modell → Engine → UI → Tests → Demo → Roadmap → Veröffentlichen). Verwenden, wenn ein neues Feature oder eine Roadmap-Stufe gebaut werden soll.
---

# Feature-Slice

Ein Feature wird immer als vollständige, benutzbare Scheibe gebaut – nie „erst mal nur die Engine“.

## Ablauf

1. **Spec** – Agent `architekt` schreibt `docs/specs/<feature>.md`. Offene Fragen dem Menschen stellen, bevor gebaut wird. Bei Konzepten mit Tragweite den Skill `kritiker` drüberlaufen lassen.
2. **Modell** – Felder und `Store`-Aktionen in `src/model.js`. Jede Änderung über `dispatch`, damit Undo/Redo stimmt. Bei Formatänderung `PROJECT_VERSION` erhöhen und Migration in `isValidProject`/Laden ergänzen.
3. **Engine** – Agent `audio-engineer`, falls Klang oder Timing betroffen. Erst einen fehlschlagenden Messtest schreiben (Skill `audio-test`), dann umsetzen.
4. **UI** – Agent `ui-engineer`. Danach Skill `ux-check`.
5. **Tests** – Agent `qa` prüft unabhängig und ergänzt Randfälle. `npm test` muss ohne Rot durchlaufen (neue Tests in `tests/chain.txt` anhängen), `npm run regeln` ohne neue Verstöße.
6. **Ansehen und Anhören** – `npm run shots -- --out <scratchpad> --szene <betroffene>` und die Bilder (Desktop, Handy) anschauen, sichtbare Fehler beheben. Bei Klangänderungen `npm run hoerprobe` vorher und nachher, Werte mit `npm run messen` vergleichen.
7. **Roadmap** – `docs/ROADMAP.md` aktualisieren (erledigt abhaken, Neues eintragen), Version im Brand-Tag (`index.html`) erhöhen.
8. **Sichern** – Git-Commit und Skill `artifact-sync` (Veröffentlichen).
9. **Rückmeldung an Martin** – was neu ist, wie man es ausprobiert, was getestet ist und was nur er mit den Ohren beurteilen kann.

## Parallelisieren

Unabhängige Teile (z. B. zwei Effekte, Export und Bibliothek) dürfen parallel in getrennten Worktrees laufen; eingefügt wird mit `tools/merge-agent.sh <branch> --tests …`. Modell- und Engine-Änderungen, die sich überschneiden, nie parallel.

## Größe

Eine Scheibe soll in einer Session fertig werden. Ist sie größer, im Spec-Schritt teilen.
