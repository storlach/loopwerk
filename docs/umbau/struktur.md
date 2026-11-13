# Umbau: Ziel-Struktur

Stand: 2026-11-11. **Aufteilung und Entscheidungen von Martin bestätigt**; die Tabelle „Wohin jeder Bereich geht“ gilt mit den Entscheidungen unten. Grundlage: Martins Vorgaben unten und die Funktionsliste (`funktionen.md`). Gebaut wird erst, was hier als bestätigt markiert ist.

## Martins Vorgaben (2026-11-11)

- **Umfang:** nur Loopwerk. Krachwerk bleibt, wie es ist.
- **Zu viel auf einmal.** Vieles soll nur dann erscheinen, wenn es gebraucht wird.
- **Knopf-Anordnungen** sind teils nicht sinnvoll.
- **Clip und Spur getrennt.** Einstellungen eines Clips und einer Spur werden heute verwechselt.
- **Einiges darf wie ein Assistent ablaufen** (Schritt für Schritt).
- **Die rechte Leiste wird ausgebaut und bekommt Reiter:**
  1. **Datei:** alle Grundeinstellungen des Songs, dazu Speichern, Öffnen usw. Die Song-Starter gehören eher hierher.
  2. **Assets:** die Sounds.
  3. **Mixer:** geht senkrecht auf. Von dort kommt man an die Effekte einer Spur. Bei den Clip-Infos stehen dann keine Spur-Effekte mehr.
- **Wörter** einsteigerfreundlicher, weniger Fachsprache.
- Ziel: weniger sichtbar, dadurch fingerfreundlicher und moderner.

## Entwurf: Aufteilung am Desktop

```
┌──────────────────────────────────────────────────────────────┐
│ Deck: ▶  ●  Loop  Klick  │ Takt │ Rückgängig/Wiederholen       │
├───────────────────────────────────────────┬──────────────────┤
│                                           │ Datei│Sounds│Mixer│
│  Kopfzeile: Raster · Tempo · [Teilen …]   ├──────────────────┤
│                                           │                  │
│  Arranger (Spuren über die ganze Breite)  │  Inhalt des      │
│  Clip öffnen → Overlay zum Schließen      │  gewählten       │
│                                           │  Reiters         │
├───────────────────────────────────────────┤                  │
│ Fach unten nur bei Bedarf: Editor         │                  │
└───────────────────────────────────────────┴──────────────────┘
```

Die linke Spalte (Regal) entfällt, die rechte Leiste ist der eine Ort für alles, was nicht Arranger ist.

## Entwurf: Wohin jeder heutige Bereich geht

Zahlen: Funktionen heute am Loopwerk-Desktop.

| Heute | Funktionen | Ziel im Entwurf | Offen |
|---|---:|---|---|
| Projekt-Menü (Name, Öffnen, Speichern, Beispiel, Leeren, Tipps) | 7 | Reiter **Datei** | – |
| Inspektor Song: Länge, Tonart, Lautstärke, Mastering | 9 | Reiter **Datei** | Frage 4 |
| Song-Starter | 11 | Reiter **Datei**, als Einstieg „Neuer Song“ | – |
| Exportieren (Knopf im Deck, Fach Export) | 19 | Reiter **Datei**, Export als Schritt-für-Schritt-Ablauf | Frage 6 |
| Regal (Suche, Filter, Sounds, Favoriten) | 21 | Reiter **Sounds** | Frage 1 |
| Erstellen (Beat, Melodie, Einsingen, Aufnehmen, Import, Link, Begleitung) | 7 | Reiter **Sounds**, Knopf „+ Neu“ | Frage 6 |
| Fach Mixer (Lautstärke, Panorama, Sends, M/S je Spur) | 13 | Reiter **Mixer**, eine Zeile je Spur | Frage 3 |
| Inspektor Spur (Effekte und ihre Regler, Panorama, Sends, Scharf) | 29 | Reiter **Mixer** → Spur antippen → ihre Effekte | Frage 3 |
| Inspektor Song: Effekte der Summe, Hall- und Echo-Bus | 14 | Reiter **Mixer** → Zeile „Summe“ bzw. „Hall“, „Echo“ | – |
| Inspektor Clip (Lautstärke, Ein-/Ausblenden, Geschwindigkeit, Teilen, Kopie, Löschen, Bearbeiten) | 12 | nur bei gewähltem Clip | Frage 2 |
| Fach Editor (Sample-Editor 28, Beat/Melodie 52) | 80 | bleibt als Fach unten, öffnet nur bei „Bearbeiten“ | – |
| Fach FX-Pad | 8 | Reiter **Mixer**, Knopf „FX-Pad“ | – |
| Deck (Abspielen, Aufnahme, Loop, Klick, Tempo, Tonart, Rückgängig) | 12 | bleibt; Tonart, Beispiel und Exportieren wandern nach **Datei** | Frage 4 |
| Aufnahme-Feld am ● | 4 | bleibt am ● | – |
| Spurkopf (Name, M, S, Lautstärke, ⋯, Kurve) | 5 | bleibt, schlanker: Name, M, S | Frage 3 |
| Spur-Menü ⋯ | 8 | bleibt | – |
| Arranger-Leiste (Raster, Zoom) | 5 | bleibt | – |
| Fachleiste (Mixer, FX-Pad, Editor, Kürzel) | 4 | entfällt; Kürzel und Gesten nach **Datei** → „Hilfe“ | – |

## Entscheidungen (Martin, 2026-11-11, bestätigt)

1. **Sounds rechts:** Das Regal links entfällt, die Spuren bekommen die volle Breite.
2. **Clip:** kein Reiter und keine Leiste am Clip. Wer einen Clip öffnet, bekommt dessen Inhalt in einem **Overlay, das man wieder schließt**. Nirgends ein eigener Knopf dafür.
3. **Lautstärke je Spur:** bleibt zusätzlich im Spurkopf. Die Doppelung ist gewollt.
4. **Kopfzeile über den Spuren:** Die Zoom-Knöpfe (`#zoom-in`, `#zoom-out`, `#zoomy-in`, `#zoomy-out`) **entfallen**; Zoomen geht mit zwei Fingern, den Rollbalken-Enden und Strg/Alt+Mausrad. Das ist die einzige bewusste Ausnahme von „keine Funktion geht verloren“. Übrig bleibt das Raster, **das Tempo kommt dazu**.
5. **Geräte:** erst nur Desktop. Handy bleibt bis dahin, wie es ist.
6. **Assistent:** zuerst „Neuer Song“ (Song-Starter), „+ Neu“ bei den Sounds, Exportieren.
7. **Wörter:** eigene Scheibe am Ende, Liste alt → neu zur Abnahme.

8. **Werkzeuge für das gewählte Element (Martin, 2026-11-11):** Teilen, Kopieren und Löschen stehen in der Kopfzeile über den Spuren, neben Raster und Tempo, und zwar nur, solange ein Element aktiv ist. Dort ist auch der Platz für **Schneiden**; das wird später eine neue Funktion (nicht Teil des Umbaus).

9. **Clip öffnen (Martin, 2026-11-11):** Doppelklick auf den Clip öffnet den Editor als Overlay, das einfliegt und sich wieder schließen lässt.

## Martins Skizze (2026-11-11)

Bild: `skizze-martin-1.webp`. **Gilt rein optisch, nicht inhaltlich** (Martin): Inhalt und Benennung der Reiter richten sich nach den Entscheidungen oben, nicht nach der Skizze. Was optisch daraus gilt:

- Die Reiter sitzen als Knöpfe **oben rechts im Deck**; der gewählte ist hell hinterlegt.
- Die Leiste darunter ist eine **schwebende Karte** mit runden Ecken über dem rechten Rand des Arrangers, mit Überschrift und Unterreitern (Suchen · Erstellen).
- Der Clip-Editor ist eine **Karte in der Mitte** mit ✕ und einem Hauptknopf, zweispaltig: links Wellenform und Werkzeuge, rechts die Regler.
- Großzügige Abstände, wenige Rahmen, Abschnitte mit kleinen Überschriften in Versalien.

### Mixer (Skizzen 2 und 3, ebenfalls nur Beispiele für Anordnung und Layout)

- `skizze-martin-2-mixer.webp`: Der Mixer steht **rechts neben den Spuren, Zeile für Zeile auf Höhe der jeweiligen Spur**. Je Zeile: Kurzinfo zu den Effekten („Keine Effekte“), Anteil zu Hall und Echo, Lautstärke mit dB-Wert, M und S, darunter die Pegelanzeige. Über die Effekt-Kurzinfo kommt man zu den Effekten dieser Spur.
- `skizze-martin-3-summe.webp`: Die Einstellungen der Summe als schwebende Karte mit Abschnitten: Mastering (Schalter, Messwerte, Stil), Busse (Hall, Echo), Master (Lautstärke, Effekte).

### Abnahme Scheibe 1/1b und Vorgaben für Kopfzeile und Karte (Martin, 2026-11-12)

- Abgenommen: Reiter im Deck, schwebende Karte, Zuklappen. „Spur wählen öffnet Mixer“ passt. Dass die Karte den rechten Teil der Spuren verdeckt, passt.
- **Karte bis oben** (`skizze-martin-4-karte-datei.png`): Die Karte beginnt am oberen Fensterrand und umschließt die Reiter; ihr Inhalt hat oben so viel Abstand, dass die Reiter darüber Platz haben. Ist die Karte zu, stehen die Reiter allein oben rechts.
- **Kopfzeile** (`skizze-martin-5-kopfzeile.png`): Logo links frei auf dem Hintergrund, daneben das Deck als eigene abgerundete Leiste (Transport, Takt/Schlag/Zeit, Tempo, Tonart, Master, Rückgängig/Wiederholen), rechts davon die Reiter in der Karte.
- **Reiter Datei, Anordnung** (Skizze 4): oben der Songname als Überschrift, darunter Tempo, Tonart, Länge; dann eine ruhige Liste: Öffnen, Speichern · Beispiel, Leeren · Tipps wieder zeigen · Info-Zeile.
- Wie immer: nur Anordnung und Layout, Farben und Benennungen aus dem Bestand.

### Stand nach Scheibe 4 und 5 (2026-11-12)

Martin: „Setz alles um, was ich gebrieft habe“ – die Scheiben laufen jetzt ohne Einzelabnahme durch, die Vorschau wird nach jeder Scheibe aktualisiert.

Gebaut: Clip-Editor als Karte in der Mitte (Doppelklick, fliegt ein; Sample-, Beat- und Melodie-Editor im selben Rahmen, rechts die Clip-Einstellungen), Kopfzeile über den Spuren mit Raster, Tempo und – bei gewähltem Clip – Teilen, Duplizieren, Löschen; die Fachleiste unten entfällt, „Tastenkürzel“ steht im Reiter Datei.

Bewusst entfallene Bedienelemente am Loopwerk-Desktop (Ersatz in Klammern): `#project-menu-btn` (Reiter Datei), `#zoom-in`, `#zoom-out`, `#zoomy-in`, `#zoomy-out` (zwei Finger, Rollbalken-Enden, Strg/Alt+Mausrad), `#editor-tab` und `#edit-btn` (Doppelklick auf den Clip), `#key-sel` im Deck (Tonart im Reiter Datei, `#insp-key`).

### Bewegung und Rollbalken (Martin, 2026-11-12)

- **Animationen sind wichtig:** Die Karten blenden „super smooth und elegant“ ein und aus, mit weichen Bewegungen. Sie kommen **von oben** (eingeblendet, geschoben oder beides).
- **Der senkrechte Rollbalken der Spuren bleibt rechts am Fensterrand stehen.** Die Karte sitzt so weit innen, dass der Rollbalken bedienbar bleibt.
- **Die Spuren laufen hinter der Karte einfach weiter;** die Karte wird nur darübergelegt.
- **Der Clip-Editor bleibt von unten** (Martin): Nur die Karten rechts kommen von oben, das Editor-Overlay fliegt weiter von unten ein.

### Stand nach Scheibe 3 (2026-11-12)

Gebaut: Reiter Mixer = Spalte rechts neben den Spuren, jede Spur mit ihrer Zeile auf gleicher Höhe (Effekt-Kurzinfo, Hall-/Echo-Anteil, Panorama, Lautstärke, M, S, Pegel), darunter Summe, Hall-Bus, Echo-Bus. Klick auf die Kurzinfo öffnet die Karte der Spur (Effekte, Reihenfolge, Panorama, Sends, Scharf) bzw. der Summe (Mastering · Busse · Master). Mastering und Master-Lautstärke sind aus dem Reiter Datei dorthin gezogen. Das Mixer-Fach unten und `#mixer-btn` entfallen.

Zusätzlich entfallen (noch zu bestätigen): der Link „Alle Spuren im Mixer vergleichen →“ (sein Ziel gibt es nicht mehr) und der Spurname als Knopf im Kanalzug (der Name steht im Spurkopf, die Kurzinfo öffnet die Karte).

### Stand nach Bewegung, Scheibe 6 und 7 (2026-11-13)

Gebaut: gemeinsames Bewegungs-System (`src/ui/motion.js`, Tokens in `:root`; Karten rechts von oben, Clip-Editor von unten), die Abläufe „Neuer Song“ (2 Schritte), „Neuer Sound“ über „+ Neu“ (1 Schritt, ersetzt die Unterreiter Suchen/Erstellen) und „Exportieren“ (3 Schritte) als Karten in der Mitte, neue Wörter nur am Loopwerk-Desktop (`src/ui/words-table.js`, Liste in `woerter.md`).

Damit ist alles aus Martins Briefing umgesetzt, außer Handy und Krachwerk (bewusst ausgenommen). Letzte volle Testkette auf `2ede579`: 77 grün, 1 wackelig (`contrast`), 0 rot. Funktionsvergleich: Loopwerk Handy, Krachwerk Desktop, Krachwerk Handy je 0 Abweichungen; am Loopwerk-Desktop kein echter Verlust.

Wörter (Martin, 2026-11-13): „Duplizieren ist nicht Kopieren, mit Summe war besser, lass Mastering, lass Limiter“ – diese vier bleiben wie im Bestand (zurückgenommen: Kopieren, Gesamt, Feinschliff, Begrenzer).

Noch von Martin zu bestätigen: der entfallene Link „Alle Spuren im Mixer vergleichen →“ und der entfallene Spurname in der Mixer-Zeile.

## Technischer Rahmen

- Der Umbau gilt nur für Loopwerk am Desktop: Schalter `EDITION.layout = 'reiter'` in `src/edition.js`, an `#app` als `data-layout="reiter"`; alle neuen CSS-Regeln unter diesem Attribut und `@media (min-width: 761px)`. Krachwerk und Handy bleiben unverändert und werden nach jeder Scheibe mit Bildern und der Funktionsliste gegengeprüft.

## Reihenfolge der Scheiben (Entwurf)

1. Rechte Leiste mit drei Reitern; Inhalt zuerst unverändert umgehängt (Datei = Projekt-Menü + Song, Sounds = Regal, Mixer = heutiger Mixer).
2. Reiter Datei ordnen, Song-Starter und Export hinein.
3. Mixer senkrecht, Spur-Effekte darunter; Inspektor Spur entfällt.
4. Clip: Overlay beim Öffnen; Inspektor Clip entfällt.
5. Kopfzeile: Zoom-Knöpfe raus, Tempo hinein, Teilen/Kopieren/Löschen bei aktivem Element; Deck ausdünnen.
6. Handy nachziehen.
7. Wörter.

Nach jeder Scheibe: Funktionsvergleich, betroffene Tests, Bilder, Vorschau, Martins Ja.
