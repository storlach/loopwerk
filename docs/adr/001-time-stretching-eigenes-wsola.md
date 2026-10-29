# ADR 001 – Time-Stretching: eigenes WSOLA statt Signalsmith Stretch

**Status:** angenommen (Stufe 3)

## Kontext
Ab Stufe 3 ist das Tempo frei wählbar (60–200 BPM). Loops müssen dafür ohne Tonhöhenänderung gestreckt werden. Geplant war Signalsmith Stretch (MIT).

## Entscheidung
- **Synthetische Loops** werden beim Tempowechsel neu gerendert – verlustfrei.
- **Echte Loops** (Sonic Pi) werden mit einem eigenen WSOLA-Verfahren (`src/dsp/stretch.js`) offline gestreckt, zyklisch fortgesetzt für nahtlose Schleifen.
- **One-Shots** werden nicht gestreckt, sondern auf ganze Schläge aufgefüllt.

## Gründe
- Keine Abhängigkeit, kein WASM, kein Netzwerkzugriff nötig (CDN aus der Arbeitsumgebung nicht erreichbar).
- Vollständig offline messbar: Länge exakt, Anschläge ≤ 5 ms Abweichung, Tonhöhe erhalten (`tests/stufe3.test.cjs`).
- Die Streckfaktoren der mitgelieferten Loops liegen zwischen 0,6 und 1,7 – dafür reicht WSOLA bei Drums gut.

## Folgen
- Bei tonalen Loops und großen Faktoren klingt WSOLA hörbar „körniger“ als ein Phasen-Vocoder. Falls das stört: Signalsmith Stretch als Alternative für tonales Material nachrüsten.
- Ein Tempowechsel bereitet alle Sounds neu vor (~3 s). Verbesserung: Worker, zuerst die im Projekt benutzten Sounds.
