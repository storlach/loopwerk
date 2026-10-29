# 1.2 – Mobile Bedienung

## Ziel
Die Hauptaufgabe (Sound finden → auf eine Spur legen → abspielen → Clip bearbeiten) geht am Handy mit dem Daumen, ohne Scrollen über die ganze Seite. Desktop (ab 761 px) bleibt unverändert.

## Befunde vorher (390 × 844, Touch, hell und dunkel)
Nach Wirkung geordnet:

1. **Blockiert: Die Seite ist 2600 px lang.** Das Deck ist 453 px hoch (8 Zeilen Knöpfe), darunter 1500 px Regal, der Arranger beginnt erst bei 1950 px. Nach dem Antippen eines Sounds muss man weit nach unten scrollen, um ihn einzusetzen.
2. **Blockiert: Docks erscheinen außer Sicht.** „Mixer“, „Exportieren“, „+ Beat bauen“ öffnen ihr Dock unterhalb des Arrangers, rund 2000 px unter dem Knopf. Antippen wirkt wie „nichts passiert“.
3. **Blockiert: Wischen über Clips verändert sie.** Clips hatten `touch-action: none`. Wer über einen Clip wischt, um zu scrollen, verschiebt ihn oder zieht am unsichtbaren Lautstärke-Griff (gemessen: neuer Rückgängig-Schritt). Da Clips große Teile der Spuren bedecken, ist Scrollen im Arranger kaum möglich.
4. **Blockiert: Piano-Roll lässt sich am Finger nicht scrollen.** Die Leinwand fängt jede Berührung (`touch-action: none`), Zeilen sind 14 px hoch. Andere Oktaven sind nicht erreichbar.
5. **Umständlich: Rückmeldungen unsichtbar.** Die Hinweiszeile steht am Seitenende; „Clip geteilt“, „ist ausgewählt“ usw. sieht man nicht. Das Einsetzen eines Sounds lässt sich nur mit Esc beenden – am Handy gar nicht.
6. **Umständlich: Clip-Werkzeuge weit weg, Griffe winzig.** Teilen/Bearbeiten/Duplizieren/Löschen stehen oben im Deck; Fades und Lautstärke nur über 11-px-Griffe. Doppeltippen zum Öffnen des Editors funktioniert am Finger nicht zuverlässig.
7. **Umständlich: kleine Tippziele.** M/S 24 × 20 px, Spur löschen 20 px, Effekt-Schalter 20 px, Stepsequencer-Felder 14 px breit, Kategorie-Chips 24 px, Suche 30 px, Editor-Knöpfe 28 px.
8. **Umständlich: Spuren umbenennen nur per Doppelklick**, am Handy nicht möglich. „Schritt-Eingabe“ im Melodie-Editor braucht eine Tastatur.
9. **Kosmetisch:** Mit offenem Dock ragt die LCD-Anzeige über das Deck hinaus; Dock-Köpfe brechen chaotisch um („BEAT-/EDITOR“).

UX-Check vorher (Auszug): 1 ✘ (Sound einsetzen = antippen + langer Scroll + tippen), 3 ✘ (Docks außer Sicht), 7 ✘ (Hinweise unsichtbar, Tastaturtexte), 8 ✘, 12 ✘ (Tippziele, Wischen), 13 ✔.

## Konzept: drei Muster
1. **Kompaktes Deck oben (eine Zeile, 61 px):** Zum Anfang, Start/Stopp, Loop, Anzeige Takt + Tempo (Tempo direkt antippbar). Alles andere liegt unter „Mehr“.
2. **Leiste unten mit Fach darüber:** Sounds · Mixer · Rückgängig · Mehr. Regal, Mixer, Sample-Editor, Beat-/Melodie-Editor, Export und „Mehr“ erscheinen im selben Fach direkt über der Leiste – immer nur eins, der Arranger bleibt darüber sichtbar (mindestens ~150 px). Die App füllt den Bildschirm, die Seite scrollt nicht mehr.
3. **Erst antippen, dann ziehen:** Ein Clip wird mit dem Finger zuerst ausgewählt; Wischen über nicht ausgewählte Clips scrollt. Für den ausgewählten Clip erscheint eine Werkzeugleiste: Bearbeiten, Teilen, Duplizieren, Löschen, Pegel (Regler für Lautstärke, Einblenden, Ausblenden). Die Griffe bleiben für Feinarbeit, mit größerer Trefferfläche.

Dazu: Hinweiszeile direkt über der Leiste mit Fingertexten statt Tastenkürzeln und einem „Fertig“-Knopf beim Einsetzen; Tippziele ≥ 44 px.

## Entscheidungen
- **Fach statt Overlay-Sheet:** Das Fach schiebt den Arranger zusammen statt ihn zu verdecken. So bleibt jede Spur durch Scrollen im Arranger erreichbar, und man tippt bei offenem Regal direkt in eine sichtbare Spur. Umgesetzt über `ui.setDock()` mit zwei zusätzlichen Handy-Fächern `sounds` und `more` (Desktop setzt sie nie; beim Wechsel auf breit werden sie geschlossen).
- **Deck-Knöpfe umziehen statt verdoppeln:** `src/ui/mobile.js` hängt Aufnahme, Klick, die Gruppen „Bearbeiten“ und „Projekt“ sowie Logo/Version am Handy ins Fach „Mehr“ und beim Wechsel auf breit an ihre alte Stelle zurück (Platzhalter-Kommentare). IDs, Ereignisse und Zustände bleiben erhalten, Desktop-Tests unberührt.
- **Clip-Werkzeuge nur ohne offenes Fach und nicht beim Einsetzen:** Sonst bliebe dem Arranger zu wenig Höhe. Rückgängig ist immer in der Leiste.
- **Pegel-Regler** schreiben über `store.setClip(id, patch, coalesce)`; schnelle Reglerbewegungen ergeben einen Rückgängig-Schritt je Regler.
- **Touch-Erkennung:** Clip-Verhalten über `pointerType === 'touch'` und `@media (pointer: coarse)` (gilt auch für Tablets im Querformat); Layout über `max-width: 760px`.
- **Piano-Roll am Finger:** Wischen scrollt, Antippen setzt eine Note in der gewählten Notenlänge oder löscht sie. Verschieben/Verlängern per Ziehen bleibt Maus und Stift vorbehalten. Zeilen 24 px, Felder ≥ 28 px.
- **Spurlautstärke** steht am Handy nur im Mixer (der Regler im 124 px schmalen Spurkopf war nicht treffbar). „Schritt-Eingabe“ ist am Handy ausgeblendet (braucht Tastatur oder MIDI).
- **Spurname:** einmal Antippen öffnet das Umbenennen (Doppelklick bleibt am Desktop).

## UX-Check nachher
| # | Punkt | |
|---|---|---|
| 1 | Grundfunktion in ≤ 2 Klicks | ✔ Sounds → Sound → Spur (Regal bleibt offen für weitere) |
| 2 | Ohne Einstellungen | ✔ |
| 3 | Ergebnis am Objekt | ✔ Pegel-Regler zeichnen Hüllkurve und Wellenform live |
| 4 | Drag & Drop | – am Handy bewusst Antippen; ausgewählte Clips lassen sich ziehen |
| 5 | Raster | ✔ unverändert, Raster unter „Mehr“ |
| 6 | Rückgängig | ✔ immer in der Leiste |
| 7 | Hinweiszeile | ✔ sichtbar, Fingersprache |
| 8 | Rückmeldung | ✔ Fach öffnet sichtbar, Tab markiert (Farbe + Fläche + Linie) |
| 9 | Grenzen erklärt | ✔ z. B. „Setze die Abspielmarke im Lineal …“ beim Teilen |
| 10 | Tastatur/Fokus | ✔ unverändert, alle neuen Elemente sind Buttons/Regler |
| 11 | Kontraste hell/dunkel | ✔ nur vorhandene Tokens |
| 12 | Handy-Breite | ✔ Tippziele ≥ 44 px, keine horizontale Verschiebung, auch 375 × 667 |
| 13 | Reduzierte Bewegung | ✔ keine neuen Animationen |

## Tests
`tests/mobil.test.cjs` (63 Prüfungen, echte Touch-Eingabe über `tap`, `touchscreen.tap` und CDP-Wischgesten): Startansicht passt auf den Bildschirm, Leiste und Fach, Akkordeon, Sound einsetzen ohne Seiten-Scroll, „Fertig“, Wischen über Clips scrollt ohne Änderung, Clip-Werkzeuge inkl. Pegel/Rückgängig/Duplizieren/Löschen/Teilen, ausgewählten Clip ziehen, nur ein Fach gleichzeitig, „Mehr“ (Zoom, Export), Beat-Editor, Piano-Roll (tippen, löschen, wischen), Spurköpfe, Umbenennen, Dunkel-Tokens, Rückkehr zum Desktop-Layout in alter Reihenfolge.

## Offen / nur am echten Gerät zu beurteilen
- Verhalten im eingebetteten Rahmen der Claude-App (Höhe, Bildschirmtastatur bei Suche und Tempo, Safe-Area unten).
- Wischen vs. Antippen auf echten Fingern (Schwelle, versehentliches Auswählen beim Scrollen).
- Pinch-Zoom im Arranger (heute Zoom-Knöpfe unter „Mehr“).
- Piano-Roll: Notenlänge per Ziehen am Finger, sichtbare Tastennamen beim seitlichen Scrollen.
- Mehrfachauswahl, Lineal-Loop per Finger feiner einstellen.
