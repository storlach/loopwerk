# ADR 009: Takes als Liste am Clip

**Status:** angenommen (Martin: „zieh es durch“, 03.11.2026; offene Fragen nach Vorschlag entschieden) · **Spec:** `docs/specs/v2.13-aufnahme.md` (Scheibe B)

## Kontext
Eine Aufnahme im Loop liefert mehrere Durchgänge desselben Bereichs. Gehört werden soll einer davon, und man soll mit einem Klick wechseln können. Das Modell kennt schon überlappende Clips: Der obere (`clip.z`) klingt, die unteren bleiben erhalten (`audibleRanges`).

## Entscheidung
Ein Take-Clip ist **ein** Clip mit `takes: string[]` (sampleIds der Durchgänge) und `take` (aktiver Index). Dabei gilt immer `sampleId === takes[take]`. Wechseln ändert nur `sampleId` und `take`. Engine, `clipSignature`, Offline-Rendering und Export bleiben unverändert. Alle Takes sind auf das Frame genau gleich lang.

## Alternativen
- **Gestapelte Clips mit gemeinsamer `takeGroup`:** nutzt `z` und `audibleRanges` und hätte auf den ersten Blick keine neue Mechanik. Aber Verschieben, Länge ändern, Teilen, Kopieren, Löschen, Mehrfachauswahl und Automation-Mitnahme müssten alle die Gruppe kennen. Sonst zerfällt sie beim ersten Ziehen. Der Arranger zeigt nur den oberen Clip, und verdeckte Takes sind unsichtbare Objekte. Abgelehnt: zu viele Stellen und zu viele Randfälle.
- **Eigene Take-Spuren unter der Spur** (wie in großen DAWs): mächtig für Comping, aber zu viel Oberfläche für eine Einsteiger-App. Vertagt.

## Folgen
- Beim Teilen behalten beide Hälften die Liste. Das ergibt einfaches Comping ohne neue Funktion.
- Jede Stelle, die „benutzte Sounds“ sammelt, muss `clipSampleIds(clip)` statt `clip.sampleId` nehmen: Einbetten, Löschschutz, Laden, „Sound fehlt“. Vergisst man eine, fehlen inaktive Takes in der Projektdatei. Test 9 der Spec prüft das.
- Optionales Feld, `PROJECT_VERSION` bleibt 1. Ältere Stände spielen den aktiven Take und verlieren beim Speichern die Liste.
