---
name: audio-engine-regeln
description: Wissen und Regeln für die Audio-Engine von Loopwerk – Web Audio API, Scheduler mit Vorlauf, Loop-Sprünge, Live-Resync, AudioWorklet-Grenzen, Latenz, Klickvermeidung. Laden, bevor src/engine.js oder DSP-Code geändert wird.
---

# Regeln für die Audio-Engine

## Zeit
- Einheit im Modell: **Schläge**. Umrechnung nur über `spb = 60 / bpm`.
- Uhr: ausschließlich `AudioContext.currentTime`. Der Scheduler (`_tick`, alle 25 ms aus einem Worker) plant alles ein, was in den nächsten `LOOKAHEAD` (0,15 s) beginnt.
- `anchors` bilden Kontextzeit → Songposition ab. Jeder Loop-Sprung erzeugt einen Anker. `currentBeat()` und `timeAtBeat()` lesen nur daraus.
- Grenzvergleiche immer mit `EPS`, und zwar konsistent: Segmente gehören zum Bereich `[b0 - EPS, b1 - EPS)`.

## Clips und Segmente
- Ein Clip wiederholt sein Sample; `clipSegments()` zerlegt ihn in Wiederholungen mit `offset`. Neue Clip-Eigenschaften (Lautstärke, Fades, Pitch) gehören in `startVoice`, damit Realtime und Offline gleich klingen.
- `_scheduleSpan` plant Segmente, die im Bereich **beginnen**; `_scheduleActiveAt` steigt in bereits laufende ein (Start, Loop-Sprung, Live-Änderung).
- Live-Änderungen: `_resync` vergleicht Signaturen (`clipSignature`). Wer neue Clip-Felder einführt, muss sie in die Signatur aufnehmen – sonst greifen Änderungen erst nach Stopp.

## Signalkette
`Stimme (BufferSource → Gain)` → `Spur (Gain → StereoPanner)` → `Master (Gain)` → `Limiter (DynamicsCompressor)` → Ausgang. Effekte pro Spur kommen zwischen Spur-Gain und Panner; Master-Effekte vor den Limiter. `buildMix` baut das für beide Kontexte.
- Der Limiter hat Vorlaufverzögerung: Timing-Tests mit `limiter: false` rendern.
- Pegeländerungen mit `setTargetAtTime(…, 0.012)`, nie hart setzen während der Wiedergabe.

## Klicks vermeiden
- Einstieg mitten im Sample: 3 ms Rampe. Abschneiden vor Sample-Ende: 4 ms Rampe. Stimmen beenden über `_kill` (10 ms).
- Loops werden beim Erzeugen „gefaltet“ (Ausklang an den Anfang addiert), damit Wiederholungen nahtlos sind. Fremd-Samples brauchen dafür saubere Schnittpunkte.

## AudioWorklet (ab Stufe 4)
- In `process()` keine Allokation, keine neuen Arrays/Objekte, keine Closures, kein Logging. Puffer im Konstruktor anlegen.
- Parameter über `AudioParam`, nicht per `postMessage` pro Block.
- Worklet-Module als eigene Dateien unter `src/dsp/`, geladen mit `ctx.audioWorklet.addModule()` – für Realtime **und** OfflineAudioContext.

## Latenz (Aufnahme, ab Stufe 5)
- Ausgleich = `ctx.outputLatency + ctx.baseLatency` + Eingangslatenz; per Loopback-Klick kalibrierbar machen.

## Lizenzen
- Time-Stretching: Signalsmith Stretch (MIT). Rubber Band ist GPL – nicht einbinden.
