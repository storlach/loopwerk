---
name: audio-test
description: Wie man Klang in Loopwerk messbar testet, ohne zu hören – Offline-Rendering im Headless-Chromium, Testsignale (Impuls, Sinus, Stille), Messgrößen (Frame-Position, Peak, RMS, Spektrum) und Toleranzen. Verwenden für jeden Test, der Audio betrifft.
---

# Audio messbar testen

Wir können nicht hören. Deshalb wird jeder Klang in Zahlen übersetzt.

## Werkzeuge
- `tests/spike.test.cjs` startet `tests/serve.cjs` und Chromium (Playwright ist vorinstalliert, nicht neu installieren).
- Im Browser: `window.loopwerk.renderProject(project, library, { limiter: false, toBeat })` liefert einen `AudioBuffer`.
- Eigene Testsignale per `library.register({ id, name, category, lengthBeats, bpm, buffer })` – vorher `new AudioBuffer({ numberOfChannels: 2, length, sampleRate: 44100 })` füllen.

## Muster
| Frage | Testsignal | Messung | Toleranz |
|---|---|---|---|
| Startet es zur richtigen Zeit? | Impuls auf Frame 0 | Indizes mit \|x\| > 0,3 | exakt (±0 Frames) |
| Stimmt die Lautstärke? | Sinus 1 kHz, Amplitude 0,5 | RMS bzw. Peak | ±0,5 dB |
| Ist es stumm, wenn es stumm sein soll? | beliebig | max \|x\| | < 1e-4 |
| Klickt der Übergang? | Sinus über die Schnittstelle | größter Sprung zwischen Nachbar-Samples | < 0,05 |
| Wirkt der Filter/Effekt? | weißes Rauschen (fester Seed) | Energie in Frequenzband (FFT oder Biquad-Messung) | relativ, z. B. ≥ 12 dB Unterschied |
| Ist ein Fade linear? | Gleichspannung 1,0 | Werte an 0 %, 50 %, 100 % | ±0,01 |

## Regeln
- Timing-Tests immer mit `limiter: false` (der Kompressor verzögert).
- Rauschen nur mit festem Seed (`mulberry32` aus `src/util.js`), damit Tests stabil sind.
- Jeder neue Test muss fehlschlagen, wenn man die zugehörige Änderung zurücknimmt – kurz gegenprüfen.
- Realtime-Wiedergabe nur grob prüfen (läuft, Position wandert, Stimmen eingeplant). Präzision prüft das Offline-Rendering.
- Was sich nicht messen lässt („klingt der Hall schön?“), als **Ohr-Test für Martin** in der Rückmeldung aufführen, mit Anleitung, was er anhören soll.

## Ausgabeformat
`check(name, ok, detail)` – Detail mit den gemessenen Werten, damit ein Fehlschlag ohne erneutes Debuggen verständlich ist.
