# Stufe 4 – Mixer und Effekte

## Ziel
Jede Spur und die Summe klanglich formen – mit wenigen, verständlichen Reglern.

## Bedienung
- „Mixer“ im Deck öffnet ein Dock unter dem Arranger: ein Kanalzug je Spur plus Master.
- Kanalzug: Name (Klick = Effekte bearbeiten), Effekt-Schalter EQ/Komp/Echo/Hall, Panorama (Doppelklick = Mitte), Fader mit dB-Anzeige, Pegelanzeige, M/S.
- Rechts die Effekt-Details des gewählten Kanals; einen Regler zu bewegen schaltet den Effekt ein, Doppelklick setzt ihn zurück.

## Entscheidung: festes Rack statt freier Slots
Reihenfolge EQ → Kompressor → Echo → Hall, je Effekt an/aus. Niedrigschwelliger als frei belegbare Slots; reicht für den Music-Maker-Umfang. Freie Slots und Sends sind ein späterer Ausbau.

## Effekte (`src/effects.js`)
| Effekt | Parameter | Umsetzung |
|---|---|---|
| EQ | Tiefen/Mitten/Höhen ±12 dB | Lowshelf 200 Hz, Peaking 1 kHz, Highshelf 5 kHz |
| Kompressor | Stärke | Schwelle, Ratio und Aufholverstärkung aus einem Regler |
| Echo | Zeit (Notenwert, tempo-synchron), Wiederholungen, Anteil | Delay mit Rückkopplung und Tiefpass |
| Hall | Raumgröße, Anteil | Faltung mit erzeugter Impulsantwort (0,5–4 s) |

## Engine
Kanalzug = Eingang (Pegel) → Effektkette → Überblend-Gain → Panorama. Ein/Aus baut die Kette neu und blendet in 30 ms über; Parameter ändern sich live über Rampen. Master gleich aufgebaut, danach Limiter. Offline-Rendering nutzt dieselbe Kette.

## Tests
`tests/stufe4.test.cjs`: Bypass identisch, EQ-Bänder per FFT, Echo-Positionen, Hall-Ausklang und Raumgröße, Kompressor-Dynamik, Panorama, Master-Lautstärke und -Effekt, Mixer-Bedienung, Live-Umschalten, Rückgängig, Handy-Breite.

## Ohr-Test für Martin
Hall auf „Pad“ (Raumgröße 70 %), Echo 1/8 punktiert auf „Arp“, Kompressor auf „Drums“: Klingt das musikalisch? Knackst es beim Ein- und Ausschalten während der Wiedergabe?
