# Stufe 6 – Export

## Ziel
Den fertigen Song als Audiodatei mitnehmen: verlustfrei (WAV) oder klein (MP3).

## Bedienung
„Exportieren“ im Deck öffnet ein Dock: Format (WAV 16 Bit / MP3 192 kBit/s), Bereich (ganzer Song bis Ende des letzten Clips oder Loop-Bereich), Ausklang für Hall/Echo (+2,5 s). Fortschrittsbalken, danach Dateiname, Größe, Länge und Spitzenpegel.

## Technik
Offline-Rendering mit derselben Signalkette (inkl. Effekte und Limiter, Limiter-Verzögerung herausgerechnet), WAV (`src/wav.js`) oder MP3 (lamejs, ADR 002). Im Artifact über `downloads`, Audio als ZIP.

## Tests
`tests/stufe6.test.cjs`: WAV-Kopf, Länge, Gleichheit mit dem Rendering, Fortschritt, Loop-Bereich samplegenau, MP3 gültig/Länge/Signal, leerer Song, Bedienung mit Download, Artifact-Weg mit nachgebildeter Capability, ZIP mit Python-`zipfile` (CRC) geprüft.

## Ohr-Test für Martin
Das Beispiel-Arrangement als MP3 exportieren und in einem normalen Player anhören: Klingt es wie in Loopwerk?
