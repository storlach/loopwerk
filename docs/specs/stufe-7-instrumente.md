# Stufe 7 – Instrumente: Beats und Melodien

## Ziel
Eigene Beats und Melodien bauen, ohne Noten lesen zu können – wie die BeatBox und die Synth-Objekte im Music Maker.

## Bedienung
- **„+ Beat bauen“** (Regal): neues Beat-Pattern mit Grundbeat, als Clip an der Abspielmarke auf einer freien Spur, Editor öffnet sich.
  Stepsequencer mit 8 Instrumenten (Kick, Snare, Clap, Hi-Hat zu/offen, Toms, Becken) im 16tel-Raster, 1/2/4 Takte, Kit „Elektro (synthetisch)“ oder „Akustik (Sonic Pi)“. Klick auf den Instrumentennamen spielt es an.
- **„+ Melodie“**: Piano-Roll C2–C6, Klang Pluck/Lead/Bass/Fläche, Notenlänge 1/16 bis 1/1. Klick setzt eine Note (Ziehen = länger), Klick auf eine Note löscht sie, Ziehen verschiebt, rechter Rand ändert die Länge.
- **Tastatur:** A–K wie Klaviertasten (schwarze Tasten W, E, T, Z/Y, U), Pfeil hoch/runter = Oktave. Mit „Schritt-Eingabe“ setzt jede Taste eine Note an der markierten Stelle und rückt weiter.
- **MIDI-Keyboard:** über Web MIDI, sobald der Browser es erlaubt (im Artifact in der Regel nicht).
- Doppelklick auf einen Pattern-Clip öffnet den passenden Editor; Patterns erscheinen unter „Eigene“ im Regal und lassen sich wiederverwenden oder löschen (Rückgängig möglich).

## Entscheidung: Patterns als erzeugte Sounds
Jedes Pattern wird zu einem Loop gerendert (`src/instruments.js`) und als Sound „pat-…“ registriert (`src/patterns.js`). Dadurch gilt alles, was für Clips gilt, auch für Patterns: Wiederholen, Fades, Teilen, Effekte, Export, Tempowechsel. Änderungen werden in Millisekunden neu gerendert; die Engine plant betroffene Clips neu (Sound-Version in der Signatur).

## Tests
`tests/stufe7.test.cjs`: Rendering (Länge, Anschläge beider Kits, Stille, Tonhöhe), Beat anlegen/bearbeiten/rückgängig/verlängern, Piano-Roll setzen/löschen, Tastatur-Eingabe (inkl. Konflikt mit „T = Teilen“), Klangwahl, Tempowechsel, Wiedergabe, Speichern/Öffnen, Doppelklick, Löschen im Regal.

## Ohr-Test für Martin
Einen Beat bauen und eine kurze Melodie mit der Tastatur einspielen, beides gemeinsam abspielen: Grooven die Klänge? Ist eine Pattern-Änderung während der Wiedergabe sofort hörbar, ohne Knackser?
