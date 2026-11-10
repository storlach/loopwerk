# ADR 005 – Mastering mit einem Klick und Effekt-Pad

**Stand:** 01.11.2026 · **Status:** angenommen

## Kontext
Martin will den fertigen Song mit einem Klick radiotauglich machen (Ziel etwa −14 LUFS, „Laut“ etwa −10, True Peak unter −1 dBTP) und während der Wiedergabe live mit einer XY-Fläche auf Summe oder Spur einwirken. Wiedergabe und Export müssen gleich klingen.

## Entscheidung
- **Mastering als eigener JS-Code** (`src/dsp/master-core.js`): Eingangspegel → EQ (4 Biquads) → Stereobreite nur in den Höhen (Seitensignal unter 160 Hz weg, ab 3 kHz etwas breiter) → Bus-Kompressor (RMS, weiches Knie) → Ziel-Verstärkung → True-Peak-Limiter (4× überabgetastete Spitzenerkennung, 5 ms Vorausschau, gleitendes Minimum + Mittelwert). Derselbe Code läuft im AudioWorklet (`src/dsp/fx-worklet.js`, Realtime und Offline) und für die Analyse im Worker (`runJob('master')`). Kein DynamicsCompressorNode, weil dessen Spitzen und Verzögerung nicht genau genug zu steuern sind.
- **Ziellautheit per Analyse:** Der Song wird über `buildMix` offline gerendert (Summe vor dem Mastering), dann sucht `src/dsp/master-search.js` die Verstärkung (Sekantenverfahren, ±0,1 LU). Der Export analysiert seinen eigenen Bereich; die Wiedergabe analysiert nach jeder Änderung im Hintergrund (1,2 s Ruhe) und hält die Verstärkungen bereit („Vorhalt“), bis dahin gelten Stil-Standardwerte.
- **Summe:** `post → A (Schutz-Limiter wie bisher) | B (Mastering) → final`. A/B schaltet zwischen den Wegen; beim Vergleich werden beide auf die leisere Lautheit gestellt (nie lauter machen, kein Übersteuern).
- **Effekt-Pad** (`src/fxpad.js`): Jeder Kanalzug hat einen Einschleifpunkt (`pre → dry → Panorama`). Das Pad hängt parallel eine Kette an, die das volle Signal ausgibt; Ein- und Aussteigen überblendet. Stutter und Echo nutzen eine Verzögerung mit Rückkopplung; der zusätzliche Block je Umlauf (Chrome: 128 Werte) wird einmal je Abtastrate gemessen und ausgeglichen. Taktbezug über `mix.grid`, Zeiten nur auf der Kontextuhr. Nichts davon landet im Projekt.

## Folgen
- Export mit Mastering rendert zweimal und rechnet die Kette einmal in JS (gemessen: 32-s-Demo-Song in knapp 3 s).
- Der 4×-Detektor sieht zwischen seinen Stützstellen bis zu 0,3 dB nicht; die Grenze liegt deshalb bei −1,7 dBTP, gemessen (16×) landen die Songs bei etwa −1,4 dBTP.
- Ohne AudioWorklet (sehr alte Browser) gibt es kein Mastering; Lo-Fi fällt auf eine reine Bit-Kennlinie zurück.
- Tests: `tests/master-fxpad.test.cjs`.

## Nachtrag 2026-11 – Schutz-Limiter als echter Spitzenbegrenzer (Klanganalyse W2)
- **Problem:** Der Weg A ohne Mastering lief über einen `DynamicsCompressorNode` (Schwelle −6 dB, 12:1). Chrome hebt damit alles pauschal um 2,6 dB an, regelt in Songs kaum (0–0,4 % der Zeit mehr als 1 dB) und ließ beim Rock-Starter trotzdem +0,5 dBTP durch.
- **Entscheidung:** Weg A ist jetzt `feste Anhebung (PROTECT_GAIN_DB) → True-Peak-Limiter` (Worklet-Prozessor `loopwerk-limiter`, dieselbe Klasse `TruePeakLimiter` wie im Mastering, Grenze −1,7 dB am 4×-Detektor, Ausklang 0,2 s). Die Anhebung ist ausdrücklich und browserunabhängig; ihr Wert ist so gemessen, dass die integrierte Lautheit aller Starter ohne Mastering höchstens 0,5 LU vom alten Stand abweicht (Bezugswerte in `tests/effekt-pegel.test.cjs`). Mastering an: Weg A ist stumm (`aGain` = 0), es wird nur einmal begrenzt.
- **Latenz:** `peakLimiterLatency(sr)` = 5 ms Vorausschau + 16 Abtastwerte Interpolator (44,1 kHz: 237 Werte, 5,37 ms). `mixLatency(sr, mix)` kennt beide Wege (Mastering, wenn es klingt, sonst Schutz-Limiter); `Engine.playbackDelay()` (Aufnahme-Ausgleich) und `renderProject({ compensate })` (Export, Stems) nutzen sie. Offline wird mit etwas Vorrat gerendert und genau die Verzögerung der tatsächlich gebauten Kette herausgeschnitten. `limiter: false` (Timing-Tests) baut keinen Limiter.
- **Rückfall:** Ohne AudioWorklet bleibt der alte DynamicsCompressor (Verzögerung wie bisher einmal gemessen) – es spielt weiter, klingt wie vorher.
- `renderProject` lädt das Worklet-Modul jetzt immer (Limiter, Mastering, Pad, Pegelausgleich des Verzerrers).

## Nachtrag 2026-11 – Fassung 1 entfernt (Entscheidung Martin, 2026-11)
- Auf bestehende Songs wird keine Rücksicht mehr genommen: Verzerrer, Kompressor, Hall und Hall-Bus haben nur noch eine Fassung (ADR 008, gleichnamiger Nachtrag).
- Schutz-Limiter unverändert: feste Anhebung → True-Peak-Limiter im Worklet. Der `DynamicsCompressorNode` als Begrenzer der Summe bleibt nur als Rückfall ohne AudioWorklet (`createDcLimiter` in `src/engine.js`; `limiter: 'dc'` erzwingt ihn für Tests, `limiterLatency` misst seine Verzögerung). Der Kompressor-Effekt nutzt weiter einen eigenen `DynamicsCompressorNode`, das ist kein Limiter.
