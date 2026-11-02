# Stufe 6 – Export

## Ziel
Den fertigen Song als Audiodatei mitnehmen: verlustfrei (WAV) oder klein (MP3).

## Bedienung
„Exportieren“ im Deck öffnet ein Dock: Format (WAV 16 Bit / MP3 192 kBit/s), Bereich (ganzer Song bis Ende des letzten Clips oder Loop-Bereich), Ausklang für Hall/Echo (+2,5 s). Fortschrittsbalken, danach Dateiname, Größe, Länge und Spitzenpegel.

Einzelspuren (Stems): Haken „Einzelspuren (Stems)“ (zeigt die Zahl der Spuren im Bereich), darunter „Mit Summe (Master-Effekte, Mastering)“, standardmäßig aus. Ergebnis immer eine ZIP-Datei „<Projekt> Stems.zip“ mit „NN Spurname.wav|mp3“ (NN = Position im Arranger). Während des Exports wird der Knopf zu „Abbrechen“ (wirkt zwischen zwei Spuren).

## Technik
Offline-Rendering mit derselben Signalkette (inkl. Effekte und Limiter, Limiter-Verzögerung herausgerechnet), WAV (`src/wav.js`) oder MP3 (lamejs, ADR 002). Im Artifact über `downloads`, Audio als ZIP. Stems: `exportStems` rendert je Spur über `renderProject(…, { onlyTrack, master })` – dieselbe `buildMix`-Kette, nur mit einer Spur bzw. neutraler Summe (Fader 1, keine Master-Effekte/Kurve, kein Mastering, kein Limiter).

## Tests
`tests/stufe6.test.cjs`: WAV-Kopf, Länge, Gleichheit mit dem Rendering, Fortschritt, Loop-Bereich samplegenau, MP3 gültig/Länge/Signal, leerer Song, Bedienung mit Download, Artifact-Weg mit nachgebildeter Capability, ZIP mit Python-`zipfile` (CRC) geprüft. `tests/stems.test.cjs`: Summe der Stems = Mix ohne Master (< 1e-4), Mute/Gruppe/leer übersprungen, Solo ignoriert, Dateinamen, ZIP-Inhalt, „Mit Summe“, Abbruch, Bedienung Desktop und Handy.

## Ohr-Test für Martin
Das Beispiel-Arrangement als MP3 exportieren und in einem normalen Player anhören: Klingt es wie in Loopwerk? Stems: das Beispiel als Einzelspuren exportieren, alle WAVs in einer DAW (oder Audacity) auf Null übereinander legen – das Ergebnis muss wie der Mix ohne Mastering klingen; jede Datei einzeln: nur ihre Spur, mit Hall-/Echo-Fahne.
