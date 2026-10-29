# Stufe 3 – Bibliothek und freies Tempo

## Ziel
Mehr und echte Sounds, schnell auffindbar; Songs in jedem Tempo zwischen 60 und 200 BPM.

## Umfang
- 33 Sounds aus Sonic Pi (CC0): 6 Loops, 13 Drum-One-Shots, Bass, Flächen, Glocken, FX. Katalog in `src/catalog.js` mit Quelle und Lizenz je Sound. Nicht aufgenommen: `loop_industrial`, `loop_tabla` (Schlagzahl nicht eindeutig bestimmbar).
- VCSL: aus der Arbeitsumgebung nicht erreichbar (GitHub-API gesperrt) – verschoben.
- Regal: Suche, Kategorie-Filter, Favoriten (★, im Browser gespeichert), Beschreibung mit Herkunft und Originaltempo im Tooltip.
- Tempo im Deck eintippbar; Rückgängig möglich; Wiedergabe läuft beim Wechsel an derselben Stelle weiter.
- One-Shots auf ganze Schläge aufgefüllt: Clip verlängern = Wiederholung im Schlagraster.

## Tests
`tests/stufe3.test.cjs`: Katalog geladen und lizenziert, Loop-Längen exakt, WSOLA (Länge, Anschläge, Tonhöhe), Tempo 100 samplegenau, Tempowechsel während Wiedergabe, Rückgängig, Suche/Filter/Favoriten, Persistenz.

## Ohr-Test für Martin
Tempo auf 100 und 140 stellen und „Amen Break“, „Compus“ und „Garzul“ anhören: Klingen die gestreckten Loops sauber, oder flattern/doppeln Anschläge?
