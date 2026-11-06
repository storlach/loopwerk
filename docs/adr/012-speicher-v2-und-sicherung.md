# ADR 012: Eigener Speicher v2 (meta/audio) und Sicherung als ZIP

> **Abgelöst (06.11.2026):** Paralleler Entwurf aus der Session auf `main`; Speicher v2 und Sicherung sind auf `werkstatt` als ADR 011 `011-eigene-sounds-speicher-v2.md` gebaut, die Nummer 012 gehört `012-kit-und-instrument-als-projektobjekte.md`. Nur Verlauf.

**Status:** vorgeschlagen (Architekt, 06.11.2026) · **Spec:** `docs/specs/krachwerk-3-takes-festhalten.md` §4 und §5

## Kontext
Eigene Sounds liegen in IndexedDB (Version 1, Store `sounds`, ein Satz mit Metadaten und WAV-ArrayBuffer). `loadAll` liest per `getAll()` alle WAV-Bytes, nur um Name und Länge zu zeigen. Mit Takes (bis 16 je Aufnahme) und Festhalten wächst das schnell auf Hunderte MB, und iOS beendet Tabs ab einigen hundert MB. Aufräumen, Größe und Sicherung gibt es nicht. iOS räumt Seiten-Speicher ohne Home-Bildschirm nach etwa 7 Tagen. Die Projektdatei bettet Sounds als Base64 ein (+33 %, ein großer String). Loopwerk und Krachwerk teilen den Ursprung und damit Quota und `persist()`.

## Entscheidung
1. **DB-Version 2 mit drei Stores:** `meta` (klein, alles für Kiste, Größe, Aufräumen), `audio` (`{ id, wav: Blob }`) und `kv` (Schema, letzte Sicherung). Beim Start wird nur `meta` gelesen, Audio erst beim ersten Gebrauch. `meta.v` versioniert die Felder eines Satzes, neue optionale Felder brauchen keine Version.
2. **Migration je Sound** in einer eigenen Transaktion über `sounds`/`meta`/`audio`, nach dem Upgrade und vor `loadAll`. Sie ist fortsetzbar und hält höchstens einen Sound im Speicher. `sounds` bleibt leer stehen und fällt erst in v3 weg.
3. **Ein Code für beide Editionen.** Auch `loopwerk` wird umgestellt, nur die Oberfläche (Speicher-Zeile, Papierkorb) gibt es allein in Krachwerk (Optionen aus `edition.js`).
4. **Löschen geht in den Papierkorb** (`meta.trashedAt`), umkehrbar 14 Tage lang, dann wird beim Start geleert. Speicher-Aktionen stehen nicht im Rückgängig-Verlauf des Songs. „Aufräumen“ schlägt nur vor, was nicht im Song, nicht im Undo-Verlauf, nicht in den Pads und kein Favorit ist.
5. **Sicherung und Song-Datei als ZIP ohne Kompression** (`zip.js`): `werkstatt.json` (Format `loopwerk-werkstatt`, Version 1, Sound-Metadaten, Song-Liste, Pads), `sounds/<id>.wav`, `songs/<name>.json` (Projekt-JSON Version 1 ohne Base64). Werkstatt-Sicherung und geteilter Song haben dasselbe Format, nur mit anderer Auswahl. Krachwerk speichert Songs als ZIP, Loopwerk weiter als JSON. Beide öffnen beides.
6. **Konflikte über ID und CRC:** Gleiche ID mit gleichem Inhalt wird übersprungen, gleiche ID mit anderem Inhalt bekommt eine neue ID, und die Songs der ZIP werden umgeschrieben (`remapSampleIds`). Nie wird etwas überschrieben. Der Song öffnet über `store.openSong`, und das ist ein Undo-Schritt.

## Alternativen
- **v1 lassen, nur `getAllKeys` + Kopf lesen:** Die Metadaten stecken im selben Satz wie das WAV. Ohne Teilung lässt sich die Kiste nicht befüllen, ohne alles zu lesen. Abgelehnt.
- **Migration in `onupgradeneeded` in einem Rutsch:** Sie wäre atomar, aber die ganze Datenmenge läge in einer Transaktion im Speicher (iPhone). Abgelehnt.
- **OPFS (Origin Private File System) für Audio:** gut für große Dateien, aber eine neue API mit unterschiedlicher Unterstützung (Safari-Worker) und kein Gewinn für Rückgängig oder Sicherung. Vertagt.
- **Verlustbehaftet speichern (Opus über WebCodecs):** kleiner, aber Bearbeitung und Rezepte rechnen auf Verlusten weiter, und die Unterstützung ist uneinheitlich. Vertagt.
- **Projektdatei bleibt JSON mit Base64, Sicherung als eigenes Format:** zwei Formate für dasselbe. Abgelehnt.
- **Kompression (deflate) beim Schreiben:** WAV schrumpft kaum, und es kostet Rechenzeit am Handy. Abgelehnt. Gelesen wird deflate trotzdem, wo `DecompressionStream` da ist.

## Folgen
- Der Start hängt nicht mehr an der Datenmenge. Die Sicherung schreibt Blobs aus IndexedDB, ohne alles in den Speicher zu laden.
- Ein alter, zwischengespeicherter App-Stand öffnet DB v2 nicht (`VersionError`) und zeigt „Sound fehlt“, die Daten bleiben. Der Service Worker wechselt den Cache-Namen.
- Ohne ZIP64 ist eine Sicherung kleiner als 4 GB. Darüber kommt eine Meldung, eine Aufteilung gibt es erst bei Bedarf.
- Ältere Loopwerk-Stände öffnen Song-ZIPs nicht (nur JSON).
- „Frei“ gilt für den ganzen Ursprung (Loopwerk und Krachwerk zusammen). Die Größe der eigenen Sounds zählt dagegen je DB genau.
