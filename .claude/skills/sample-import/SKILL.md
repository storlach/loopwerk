---
name: sample-import
description: Neue Sounds in die Loopwerk-Bibliothek aufnehmen – Lizenz prüfen, Datei sicher holen, taktgenau schneiden, BPM/Tonart bestimmen, Lautheit angleichen, Metadaten schreiben. Verwenden für freie Sample-Bibliotheken (z. B. Sonic Pi, VCSL) und eigene Aufnahmen.
---

# Sounds importieren

## 1. Lizenz (zuerst!)
- Erlaubt: CC0, Public Domain, MIT/BSD-artig mit Erlaubnis zur Weitergabe von Audio.
- Nicht aufnehmen: „nur privat“, „keine Weitergabe“, CC-BY-NC, unklare Herkunft, GPL-Audio ohne Klärung.
- Pro Sound festhalten: `source` (URL der Quelle), `license` (Kurzname), `licenseUrl`.
- Kandidaten: Sonic-Pi-Samples (CC0), Versilian Community Sample Library VCSL (CC0). Lizenz trotzdem je Paket nachlesen.

## 2. Sicher holen
- Downloads in einen **eigenen, leeren Ordner** im Scratchpad, nicht ins Projekt. Archive dort entpacken. Keine Skripte aus heruntergeladenen Paketen ausführen.
- Nur die tatsächlich genutzten Audiodateien ins Projekt kopieren (`assets/samples/<kategorie>/`).

## 3. Aufbereiten
- Format: WAV oder OGG, 44,1 kHz, Stereo (Mono wird dupliziert).
- **Loops:** Länge muss exakt `takte × 4 × 60/bpm` Sekunden sein. Abweichung > 1 ms → nachschneiden oder BPM neu bestimmen. Nullstellen-nahe Schnitte, sonst 2-ms-Fade.
- **One-Shots (FX, einzelne Drums):** `oneShot: true`, Länge auf ganze Schläge auffüllen.
- Lautheit: Spitzenpegel auf die Werte der Kategorie normalisieren (Drums 0,62, Bass 0,5, Akkorde/Synth 0,42, FX 0,45–0,6).

## 4. Metadaten
```js
{ id: 'vcsl-piano-c4', name: 'Klavier C4', category: 'chords', lengthBeats: 4, bpm: 120, key: 'C',
  oneShot: true, source: 'https://…', license: 'CC0', licenseUrl: 'https://…' }
```
- Name deutsch und kurz, eindeutig im Regal.
- Tonart als `Am`, `C`, … oder `keine` für Drums/FX.

## 5. Prüfen
- Test ergänzen: Länge stimmt, nicht stumm, Peak im Zielbereich, Lizenzfeld gesetzt.
- Bis Stufe 3 (Time-Stretching) nur Loops mit 120 BPM aufnehmen oder die Abweichung in der Rückmeldung deutlich machen.
