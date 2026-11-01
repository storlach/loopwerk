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
