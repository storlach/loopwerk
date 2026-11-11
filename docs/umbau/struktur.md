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
