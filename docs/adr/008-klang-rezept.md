# ADR 008: Klang-Rezept am Sound, gebacken in die Library-Fassung

**Status:** vorgeschlagen (Architekt, 02.11.2026) · **Spec:** `docs/specs/krachwerk-2-werkbank.md`

## Kontext
Der Sample-Editor (`src/ui/editor.js`, `src/dsp/edit.js`) arbeitet zerstörend. Er hat einen eigenen Verlauf, und „Übernehmen“ legt einen neuen eigenen Sound an. Die Sound-Werkbank in Krachwerk soll einen Klang formen, während der Song läuft: Änderungen wirken sofort, gelten für alle Clips dieses Sounds und gehen nur über ↶ zurück. Vorbild ist `setSampleTempo`: eine Klang-Eigenschaft im Projekt, die die Library in eine neue Fassung des Puffers umrechnet (`applySampleTempo` → `_prepare`). Regel: Realtime und Offline nutzen eine Signalkette.

## Entscheidung
1. **Das Rezept liegt im Projekt**, als `project.recipes[sampleId]`, und nicht in IndexedDB. Damit gibt es Undo über den Store, es steht in der Projektdatei und ist ein optionales Feld (`PROJECT_VERSION` bleibt 1).
2. **Das Rezept wird gebacken.** Die Library rechnet aus `orig` und dem Rezept einen Zwischenpuffer `cooked` (reines JS, `src/dsp/recipe.js`, bei langen Klängen im Rechen-Worker). Daraus macht `_prepare` wie bisher die Tempo-Fassung (`padOneShot`/`stretchLoop`). Ein neues `rev` lässt die Engine den Clip über die vorhandene Signatur live neu einplanen. `startVoice`, `buildMix` und `renderProject` bleiben unverändert. `renderProject` wartet nur, bis die Library das Rezept des Projekts übernommen hat.
3. **Varianten und (ab 2b) Schnitte sind Rezepte mit `parent`.** Sie haben kein eigenes Audio, nutzen den `orig`-Puffer des Eltern-Sounds und haben ein eigenes Rezept. Die Projektdatei bettet den Eltern-Sound ein.
4. **Die Engine liest das Rezept in beiden Editionen.** Nur die Werkbank-Oberfläche gibt es allein in Krachwerk (Option aus `main.js`). Eine Krachwerk-Datei klingt in Loopwerk gleich.

## Alternativen
- **Knoten je Stimme in `startVoice`** (Filter, Hüllkurve, Gain): wirkt ohne Rechenzeit sofort. Umkehren, Zuschnitt und Tonhöhe lassen sich so aber nicht abbilden, weil sie Länge und Raster des Sounds ändern. Es gäbe also doch einen zweiten, gebackenen Weg. Die Hüllkurve müsste je Wiederholung und je Einstieg mitten im Sound umgerechnet werden. Dazu käme ein `BiquadFilterNode` pro Stimme. Abgelehnt: zwei Wege bedeuten doppelte Fehlerquellen.
- **Rezept am eigenen Sound in IndexedDB:** ohne Store-Undo, nicht in der Projektdatei, und es würde jedes andere Projekt mitändern. Abgelehnt.
- **Rezept am Clip:** widerspricht der Entscheidung des CD („gilt für alle Clips dieses Sounds“) und vervielfacht die Fassungen. Abgelehnt.
- **Zerstörender Editor mit Live-Vorschau:** Damit bliebe „Übernehmen“ bestehen. Abgelehnt.

## Folgen
- Jede Änderung kostet eine Neuberechnung. Bei Aufnahmen bis 10 s sind das wenige Millisekunden. Lange Importe (bis 480 s) gehen in den Worker, und es gilt „der jüngste Auftrag gewinnt“. Gedehnte Clips (Geschwindigkeit ohne „wie Tonband“) brauchen danach ein neues WSOLA. Bis es fertig ist, klingt die alte Fassung, wenn sie gleich lang ist.
- Wird ein Einzelklang kürzer oder länger, ändert sich seine Länge in Schlägen und damit die Wiederholung im Clip. Das ist das heutige Verhalten nach dem Editor.
- Der zerstörende Editor bleibt in Loopwerk. In Krachwerk ist er in 2a nur noch über die Feinheiten erreichbar, mit 2b fällt er dort weg (Autotune und Trennen ziehen in die Werkbank).
- Musterspuren (`pat-…`) bekommen kein Rezept, ihr Klang entsteht im Pattern-Editor (Scheibe 4).
