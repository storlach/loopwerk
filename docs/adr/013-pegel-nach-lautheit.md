# ADR 013 – Pegel nach Lautheit je Rolle

**Stand:** 10.11.2026 · **Status:** angenommen

## Kontext
Bibliothek, Katalog und gerenderte Patterns waren nach der **Spitze** eingepegelt (`def.peak`, `PEAK_TARGET`). Weil Beats einen Crest-Faktor von 13–31 dB haben und Sinus-Bässe 3–8 dB, lagen die Drums im Refrain bis zu 12 LU unter dem Bass; innerhalb einer Kategorie streute die Lautheit um bis zu 17,8 LU, dieselbe Melodie je nach Klang um 21,9 LU, und ein neuer Beat spitzte bei +6 dBFS (Klanganalyse 2026-11, K1/W4).

## Entscheidung
- **Ziel-Lautheit je Rolle** (`ROLE_TARGET` in `src/levels.js`), die Drums sind der Bezug: volle Drum-Loops und Beats −20 LUFS, Hats/Percussion −25, Bass −23 (die Kick führt um 3 LU), Akkorde/Flächen −24, Melodie/Arp −23, FX −22, Einzelschläge −20, Einzeltöne −21. Spitzen-Obergrenze je Sound −0,5 dBFS: lauter gemacht wird nur bis dahin.
- **Gemessen** wird wie BS.1770 (`src/dsp/loudness.js`): Loops integriert über eine Runde bei 120 BPM, Einzelklänge (One-Shots, FX) als lauteste 400 ms. Kits mit einem Grundbeat (Kick 4/4, Snare 2/4, Achtel-Hats), Melodie-Klänge mit einer Standard-Melodie (8 Viertel um A3, Bass eine Oktave tiefer), Akkord-Klänge (Fläche, Streicher, Orgel, Klavier, Gitarren, Sampler-Tasten) mit zwei gehaltenen Dreiklängen. Rolle eines Sounds aus Kategorie, Art und Anteil unter 150 Hz (`roleOf`: Drum-Loop ohne Tiefen bzw. mit Namen wie „Hats“ → Percussion).
- **Feste Tabelle statt Messen beim Laden:** `tools/klang/pegel.cjs --tabelle` misst einmal alles und schreibt `src/levels-table.js` (Verstärkung in dB gegen die Spitzen-Normalisierung und Rolle je Sound, Kit, Klang). Beim Erzeugen bzw. Laden wird der Faktor mit der Spitzen-Normalisierung in einem Durchgang in den Puffer gerechnet (`renderLoop`, `loadCatalogEntry`) – keine zusätzliche Rechenzeit, und alle Fassungen eines Sounds (Tonart, Akkord, Tempo) bekommen denselben Faktor, also keine Sprünge zwischen ihnen. Patterns: Faktor je Kit bzw. Klang, danach ein Spitzen-Wächter (das ganze Pattern wird leiser, wenn es sonst über −0,5 dBFS spitzen würde) – Hinzufügen von Noten verschiebt die Balance innerhalb des Patterns nicht. Vorhören von Noten und Schlägen nutzt denselben Faktor.
- **Alte Songs** bekommen keinen Ausgleich (Vorgabe von Martin): sie klingen mit den neuen Pegeln.
- **Starter und Beispiel** werden mit diesen Pegeln gemischt (`starterMix` in `src/starter.js`, `createDemoProject`): Fader je Rolle, Hochpass auf allem außer der Drum-Spur mit Kick und dem Bass, Hats/Percussion heller und seitlich, Hall- und Echo-Sends auf Akkorden, Melodie, Percussion und FX, Mastering-Stil je Genre. Ohne Mastering liegen die Songs um −16 LUFS (Schutz-Limiter), damit jeder Stil anhebt.

## Folgen
- Ändert sich ein Sound, ein Kit oder ein Klang, muss die Tabelle neu: `node tools/klang/pegel.cjs --tabelle`; `--streuung` prüft ohne zu schreiben, `tests/pegel.test.cjs` fällt sonst auf (±2 LU je Rolle).
- Sehr kurze, spitze Einzelschläge (7 von 204, z. B. Klapperstock leise) erreichen das Ziel nicht, ohne über die Spitzengrenze zu gehen; sie bleiben bis 7 LU leiser.
- Eigene Aufnahmen und Krachwerk-Sounds sind nicht in der Tabelle (Faktor 1).
- Gemessen wird in Chromium; die Tabelle ist browserunabhängig, weil sie fest ist.
