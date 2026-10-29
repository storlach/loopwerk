# ADR 002 – MP3-Export mit lamejs (LGPL), Audio im Artifact als ZIP

**Status:** angenommen (Stufe 6)

## Kontext
Stufe 6 verlangt WAV- und MP3-Export. Ein eigener MP3-Encoder ist unverhältnismäßig. Im Artifact darf die Seite nur bestimmte Dateitypen zum Speichern anbieten (`downloads`-Capability) – WAV und MP3 gehören nicht dazu, ZIP schon.

## Entscheidung
- MP3 mit **lamejs 1.2.1** (JavaScript-Port von LAME, **LGPL-3.0**), unverändert als eigene Datei unter `vendor/lamejs/` mit Lizenztext; erst beim ersten MP3-Export geladen. Hinweis auf LAME und Link zu lame.sourceforge.net im Export-Dock (Auflage der LAME-Lizenz).
- WAV mit eigenem Encoder (`src/wav.js`).
- Im Artifact wird die Audiodatei in eine ZIP-Datei verpackt (eigener ZIP-Packer `src/zip.js`, ohne Kompression); lokal direkter Download.

## Abgrenzung zur Regel „kein GPL“
LGPL erlaubt die Nutzung einer unveränderten, separat eingebundenen Bibliothek in einem Programm mit anderer Lizenz. Änderungen an lamejs müssten unter LGPL veröffentlicht werden – deshalb wird die Datei nie verändert.

## Folgen
- ~150 KB zusätzlicher Code, nur bei Bedarf geladen.
- Export rechnet die Verzögerung des Master-Limiters heraus (`limiterLatency`), damit exportierte Loops exakt am Dateianfang beginnen.
