# ADR 003 – Stimme und Ebenen trennen ohne KI-Modell

**Stand:** 29.10.2026 · **Status:** angenommen

## Kontext
Martin will Songs hochladen, die Stimme entfernen oder isolieren, die Lead-Melodie heraushören und einen Song in Instrument-Ebenen zerlegen. Gute Trennung liefern heute neuronale Modelle (Demucs, Spleeter, Open-Unmix).

## Optionen
1. **Demucs im Browser (ONNX/WebGPU):** beste Qualität. Laut Markt-Scout (docs/markt-scout/2026-10-29.md) aber rund 170 MB Modelldaten, die Gewichte von v3/v4 stehen unter CC BY-NC 4.0 (nicht kommerziell), und der Browser braucht COOP/COEP-Header, deren Verfügbarkeit im Artifact und auf GitHub Pages offen ist.
2. **Server mit Modell:** gute Qualität, aber Loopwerk hat keinen Server und soll ohne Konto laufen.
3. **Klassische Signalverarbeitung:** HPSS (Medianfilter, Fitzgerald 2010), Mitte/Seiten-Ähnlichkeit (Avendano & Jot), Frequenzbänder. Klein, lizenzfrei, offline, sofort verfügbar. Die Qualität ist eine Näherung.

## Entscheidung
Option 3 (`src/dsp/separate.js`), im Web Worker (`src/dsp/worker.js`, Ausweichlösung im Hauptthread). Vier Masken, die zusammen 1 ergeben: Gesang (mittig, harmonisch, 120 Hz–11 kHz), Drums (perkussiv), Bass (harmonisch unter ca. 200 Hz), Instrumente (Rest). Die Ebenen addieren sich wieder genau zum Original. In der Oberfläche steht „Näherung“.

## Folgen
- Funktioniert gut, wenn der Gesang in der Mitte und die Begleitung breit gemischt ist. Mittige Instrumente landen teils im Gesang, Hall der Stimme bleibt teils im Rest. Mono-Aufnahmen trennen schlecht.
- Messwerte am synthetischen Mix (tests/v15): Gesang isoliert mit Korrelation 0,97, nach „Stimme entfernen“ bleibt 0,02, die Lead-Melodie wird aus dem Mix zu 8 von 8 Tönen erkannt.
- Laufzeit: etwa 25 s pro 3-Minuten-Song im Desktop-Chromium, am Handy länger.
- Später möglich: optionaler Modell-Download (z. B. ein Modell mit freier Lizenz), wenn die Header-Frage geklärt ist. Die Schnittstelle `runJob('separate')` bleibt gleich.
