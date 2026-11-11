# Umbau: Ziel-Struktur

Stand: 2026-11-11, **Entwurf, von Martin noch nicht bestätigt.** Grundlage: Martins Vorgaben unten und die Funktionsliste (`funktionen.md`). Gebaut wird erst, was hier als bestätigt markiert ist.

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
│ Deck: ▶  ●  Loop  Klick  │ Takt · Tempo │ Rückgängig/Wiederh. │
├───────────────────────────────────────────┬──────────────────┤
│                                           │ Datei│Sounds│Mixer│
│  Arranger (Spuren über die ganze Breite)  ├──────────────────┤
│                                           │                  │
│  Clip gewählt → Leiste am Clip:           │  Inhalt des      │
│  Teilen · Kopie · Löschen · Bearbeiten    │  gewählten       │
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

## Offene Fragen

1. **Sounds rechts:** Entfällt das Regal links ganz, sodass der Arranger die volle Breite bekommt? (Entwurf: ja.)
2. **Clip-Einstellungen:** eigener vierter Reiter „Clip“, der nur bei gewähltem Clip erscheint, oder eine kleine Leiste direkt am Clip? (Entwurf: Leiste am Clip für Teilen, Kopie, Löschen, Bearbeiten; die Regler als Reiter „Clip“.)
3. **Mixer senkrecht:** eine Zeile je Spur mit Lautstärke, M, S; Antippen klappt die Effekte dieser Spur auf. Bleibt die Lautstärke zusätzlich im Spurkopf? (Entwurf: nein, nur M und S.)
4. **Tempo und Tonart:** nur im Reiter Datei oder Tempo weiter im Deck? (Entwurf: Tempo bleibt im Deck, weil man es ständig braucht; Tonart nach Datei.)
5. **Handy:** erst Desktop fertig, dann dieselben drei Reiter als Fächer am Handy? (Entwurf: ja.)
6. **Assistent:** wo zuerst? (Entwurf: „Neuer Song“ mit den Song-Startern, „+ Neu“ bei den Sounds, Exportieren.)
7. **Wörter:** eigene Scheibe am Ende, mit einer Liste alt → neu zur Abnahme. Vorschläge vorab: „Assets“ → „Sounds“, „Mastering“ → „Feinschliff“, „Panorama“ → „Links/Rechts“, „Send“ → „Hall-Anteil“/„Echo-Anteil“, ein Wort „Bearbeiten“ statt der sieben Editor-Namen.

## Reihenfolge der Scheiben (Entwurf)

1. Rechte Leiste mit drei Reitern; Inhalt zuerst unverändert umgehängt (Datei = Projekt-Menü + Song, Sounds = Regal, Mixer = heutiger Mixer).
2. Reiter Datei ordnen, Song-Starter und Export hinein.
3. Mixer senkrecht, Spur-Effekte darunter; Inspektor Spur entfällt.
4. Clip: nur noch Clip-Einstellungen, nur bei Auswahl.
5. Deck und Spurkopf ausdünnen.
6. Handy nachziehen.
7. Wörter.

Nach jeder Scheibe: Funktionsvergleich, betroffene Tests, Bilder, Vorschau, Martins Ja.
