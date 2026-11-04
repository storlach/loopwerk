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
- Reihenfolge der Effekte aus `fxOrderOf(track)` bzw. `fxOrderOf(master)` (ADR 008); `syncMix` gibt sie an `syncStrip` weiter. Nur Reihenfolge geändert → `keepTail`: Eingänge 30 ms überblenden, alte Kette klingt aus (höchstens 4,5 s), dann entsorgen. Aufräumen ist kein Klangereignis; Offline wird nicht aufgeräumt (`later`).
- Send-Busse (ADR 008): `Spur.out (hinter Fader, Kurve, Pad, Panorama)` → `strip.sends[hall|echo] (Gain)` → `Bus: input → Effekt nur nass (create(ctx, { dry: false })) → level (Fader · Stumm)` → `mix.master`. `syncBuses` am Ende von `syncMix`: Bus entsteht beim ersten Send und bleibt im laufenden Mix; Send-Gains live mit `setTargetAtTime`, Abbau nach Rampe. Send-Kurven (`send.hall`/`send.echo`): `laneTarget` → `strip.sends[bus].gain`, `skipOf(...).sends` lässt den Regler aus (ein Besitzer je AudioParam), eine Kurve hält den Send-Knoten am Leben; entsteht/verschwindet ein Knoten (`strip.sendGen`), plant `_syncAutoChains` nach. `mix.buses` (Map), `engine.busPeak(id)` für die Pegelanzeige der Rückkanäle (Analyser am `bus.output`, Tap über `mix.onBus`). Stems (`onlyTrack`) enthalten ihren Bus-Anteil, die Summe der Stems bleibt exakt der Mix ohne Master-Kette.
- Der Limiter hat Vorlaufverzögerung: Timing-Tests mit `limiter: false` rendern.
- Pegeländerungen mit `setTargetAtTime(…, 0.012)`, nie hart setzen während der Wiedergabe.

## Klicks vermeiden
- Schnittkanten (Einstieg mitten im Sample, Abschneiden vor dem Ende): benachbarte Stimmen überlappen ±96 Samples mit komplementären linearen Rampen (`startVoice`) – Teilen bleibt unhörbar. Stimmen beenden über `_kill` (10 ms).
- Loops werden beim Erzeugen „gefaltet“ (Ausklang an den Anfang addiert), damit Wiederholungen nahtlos sind. Fremd-Samples brauchen dafür saubere Schnittpunkte.

## AudioWorklet (ab Stufe 4)
- In `process()` keine Allokation, keine neuen Arrays/Objekte, keine Closures, kein Logging. Puffer im Konstruktor anlegen.
- Ausnahme Aufnahme (`src/dsp/recorder-worklet.js`): neuer Puffer nur alle 4096 Frames, per Transfer ohne Kopie an den Hauptthread – SharedArrayBuffer steht im Artifact nicht zur Verfügung.
- Parameter über `AudioParam`, nicht per `postMessage` pro Block.
- Worklet-Module als eigene Dateien unter `src/dsp/`, geladen mit `ctx.audioWorklet.addModule()` – für Realtime **und** OfflineAudioContext.

## Latenz (Aufnahme)
- Ausgleich = `ctx.outputLatency + ctx.baseLatency` + Eingangslatenz (`track.getSettings().latency`), umgesetzt in `src/recorder.js`. Offen: per Loopback-Klick kalibrierbar machen.

## Lizenzen
- Time-Stretching: eigenes WSOLA (`src/dsp/stretch.js`, ADR 001). Alternative für tonales Material: Signalsmith Stretch (MIT). Rubber Band ist GPL – nicht einbinden.
