# ADR 012: Kit und Instrument als Projektobjekte

**Status:** vorgeschlagen (Martin klärt am Ende) · **Spec:** `docs/specs/krachwerk-4-kit.md`

## Kontext
Krachwerk soll aus eigenen Klängen Beats und Melodien bauen. Es gibt schon Beat-Patterns mit 8 Zeilen (`DRUM_ROWS`) und Kits mit `map` Zeile → Sample-ID (`KITS`, „Akustik“), Melodie-Patterns mit `preset` und einen Sampler mit Zonen (`registerInstrument`, nur Dateien aus `assets/`). Eigene Klänge haben ein Rezept im Projekt (ADR 010), Schnitte sind Varianten ohne eigenes Audio.

## Entscheidung
- `project.kits['k-…'] = { name, map: { kick|snare|…: sampleId } }` (8 Pads = die 8 `DRUM_ROWS`) und `project.instruments['in-…'] = { name, sampleId, root, cents, release }`. Beide optional, `PROJECT_VERSION` bleibt 1. Änderungen nur über Store-Aktionen (Undo).
- Ein Beat-Pattern zeigt mit `kit: 'k-…'` auf ein Kit, ein Melodie-Pattern mit `preset: 'in-…'` auf ein Instrument. Gerendert wird weiter über `renderPattern` → Sound `pat-…` → Clip → `startVoice`/`buildMix`. **Keine neue Signalkette.**
- Pads und Instrument spielen den **gebackenen** Klang (`library.source`), also mit Rezept. Die Pattern-Signatur in `Patterns._sync` enthält deshalb `recipeKey` jedes benutzten Sounds.
- Eigene Instrumente kommen als Zone `{ midi: root, sampleId }` in die Sampler-Registry; `loadZone` liest dann aus der Library statt aus `assets/`.

## Alternativen
- **Kit als eigener Sound-Typ in IndexedDB** (über Songs hinweg in der Kiste): ohne Undo, und Schnitte (`vr-…`) gibt es nur im Projekt. Abgelehnt; Vorlagen über Songs hinweg später als Kopie.
- **16 frei benannte Pads mit eigenem Pattern-Typ:** mehr Freiheit, aber neuer Editor, neue MIDI-Belegung, neues Rendern. Abgelehnt; 8 Zeilen reichen für die Pad-Wand 2×4.
- **Mehrzonen-Instrument** (je Taste eigene Aufnahme): später möglich, das Modell (`zones`) trägt es.

## Folgen
- „Benutzte Sounds“ heißen jetzt `usedSampleIds(project)` (Clips mit Takes, Eltern von Varianten, Kit-Pads, Instrumente). Einbetten, Löschschutz und „Sound fehlt“ nutzen nur noch diese Funktion.
- Ein Loopwerk-Stand ohne diese Felder spielt die gerenderten Patterns nicht nach (unbekanntes Kit → Synth-Elektro, unbekanntes Preset → Pluck). Beim Speichern dort gehen `kits`/`instruments` verloren.
- `clearSong` löscht Kits und Instrumente wie Rezepte. Neue Songs beginnen ohne Kit.
