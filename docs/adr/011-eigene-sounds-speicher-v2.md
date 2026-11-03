# ADR 011: Eigene Sounds – Speicher v2 (Metadaten und Audio getrennt)

**Status:** vorgeschlagen (Martin klärt am Ende) · **Spec:** `docs/specs/krachwerk-3-festhalten.md` §4

## Kontext
`OwnSounds` speichert jeden eigenen Sound als einen Datensatz (IndexedDB v1, Store `sounds`, Feld `wav`). `loadAll` legt zwar Stubs an, liest per `getAll()` aber **alle WAV-Bytes** in den Speicher. In Krachwerk besteht die Bibliothek nur aus Aufnahmen, Takes und Festgehaltenem: Startzeit und RAM wachsen mit jedem Sound, iOS beendet Tabs ab einigen hundert MB. Dazu räumt iOS-Safari Seiten-Speicher nach rund 7 Tagen ohne Besuch, eine Sicherung fehlt.

## Entscheidung
- IndexedDB **Version 2** je Datenbank (`loopwerk` und `loopwerk-make`, ein Code in `src/own-sounds.js`): Store `meta` (keyPath `id`, alle Felder außer Audio, dazu `duration`, `channels`, `sampleRate`, `bytes`) und Store `audio` (keyPath `id`, Feld `wav`). Der Start liest nur `meta` (`getAll`), Audio kommt auf Abruf über `library.stub(…, load)`.
- **Migration** in `onupgradeneeded` (1 → 2) in derselben Versionswechsel-Transaktion: jeden Datensatz aus `sounds` aufteilen, dann `sounds` löschen. Bricht sie ab, bleibt v1 unverändert (IndexedDB rollt zurück). Neue Aufnahmen mit Doppel-Mono (`isDoubleMono`) werden mono gespeichert, Bestand wird nicht umgerechnet.
- **Sicherung** als ZIP ohne Kompression (`src/zip.js`): `sounds.json` (Liste der `meta`-Einträge) + `sounds/<id>.wav`. Zurückholen per Ablegen oder Dateiwahl; vorhandene IDs werden übersprungen.
- Die Projektdatei bleibt JSON mit Base64-WAV (`PROJECT_VERSION` 1). Projektdatei als ZIP ist eine eigene Entscheidung, sobald Dateien stören.

## Alternativen
- **v1 lassen, nur `getAll` durch Cursor über Schlüssel ersetzen** (`getAllKeys` + Längen aus dem WAV-Kopf): spart kein Lesen, weil die Länge im WAV steckt und der Name im selben Datensatz liegt. Abgelehnt.
- **OPFS (Origin Private File System) für Audio:** schneller für große Dateien, aber Safari-Unterschiede und eine zweite Speicherart. Vertagt.
- **Verlustbehaftet speichern (Opus über WebCodecs):** halbiert weiter, aber nicht überall verfügbar und verändert den Klang. Vertagt.

## Folgen
- Ein Krachwerk-Stand vor v2 (alter Service-Worker-Cache) öffnet die DB mit Version 1 und bekommt `VersionError` → keine eigenen Sounds sichtbar. Darum Cache-Name `krachwerk-v3` und `onversionchange` → `db.close()` in offenen Tabs.
- Jede Stelle, die Audio braucht, ruft vorher `library.ensure(id)`: Export, Einbetten, Zerlegen, Kit-Render (`renderPattern`), Festhalten. Wer es vergisst, rendert Stille.
- Loopwerk migriert beim ersten Start mit dem neuen Stand ebenfalls (gleicher Code). Das ist gewollt und wird mit dem Loopwerk-Fall getestet.
