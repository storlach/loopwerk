# Stufe 2 – Arranger-Komfort

## Ziel
Man kann ein Arrangement fein bearbeiten wie im Music Maker: Lautstärke und Fades direkt am Clip, Clips teilen, kürzen, duplizieren, Spuren benennen, hinzufügen und löschen, Projekte als Datei sichern und öffnen.

## Bedienung
| Funktion | Bedienung | Tastatur |
|---|---|---|
| Clip-Lautstärke | Griff oben in der Clip-Mitte nach unten/oben ziehen. Die Wellenform wird mitskaliert. | – |
| Fade-In / Fade-Out | Griffe auf der Hüllkurve links/rechts zur Mitte ziehen (¼-Schlag-Schritte, Umschalt = fein) | – |
| Clip links kürzen | linken Rand ziehen (rastet im Raster) | – |
| Clip verlängern | rechten Rand ziehen (wie bisher) | – |
| Teilen | „Teilen“ im Deck: teilt den ausgewählten Clip an der Abspielmarke; ohne Auswahl alle Clips unter der Abspielmarke | T |
| Duplizieren | „Duplizieren“: Kopie direkt dahinter auf derselben Spur | Strg+D |
| Löschen | „Löschen“ im Deck (für Touch) | Entf |
| Spur umbenennen | Doppelklick auf den Namen, Enter speichert, Esc bricht ab | – |
| Spur hinzufügen | „+ Spur“ unter der letzten Spur (max. 16) | – |
| Spur löschen | „×“ im Spurkopf, zweiter Klick bestätigt | – |
| Projekt speichern | „Speichern“: `.json`-Datei (im Artifact über die Capability `downloads`) | – |
| Projekt öffnen | „Öffnen“: `.json`-Datei wählen | – |

Griffe erscheinen beim Überfahren und dauerhaft am ausgewählten Clip (damit es auch per Touch geht). Während des Ziehens zeigt die Hinweiszeile den Wert („Fade-In: 1,5 Schläge“, „Lautstärke: −6,0 dB“).

## Datenmodell
Clip erhält optionale Felder (fehlend = Standard, daher keine Versionsänderung):
- `gain` (0…1, Standard 1)
- `fadeInBeats`, `fadeOutBeats` (≥ 0, Summe ≤ Länge, Standard 0)

Hüllkurve an Position x (Schläge ab Clip-Start, Länge L): `gain · min(1, x/fadeIn, (L−x)/fadeOut)`.

Spur-IDs bleiben `t<n>`; neue Spuren bekommen die nächste freie Nummer.

## Store-Aktionen
`setClip(id, patch)`, `trimClipStart(id, startBeat)`, `splitAt(beat, ids?)`, `duplicateClip(id)`, `addTrack()`, `removeTrack(id)`; Umbenennen über `setTrack`. Alle Fades werden nach jeder Änderung begrenzt (`normalizeClip`). Beim Überschreiben (`_carve`) verliert ein links abgeschnittenes Stück sein Fade-Out, ein rechts abgeschnittenes sein Fade-In.

## Engine
- Zusätzlicher Hüllkurven-Gain pro Stimme (nach dem Entknackser-Gain), Stützpunkte aus der Clip-Hüllkurve für genau den gespielten Ausschnitt → funktioniert auch beim Einstieg mitten im Clip und bei Loop-Sprüngen.
- Ohne Fades und mit `gain = 1` entfällt der Knoten.
- `clipSignature` enthält `gain` und Fades, damit Änderungen während der Wiedergabe sofort greifen.
- Gelöschte Spuren: Kanalzug trennen.

## Testplan
Offline (messbar):
1. Clip-Gain 0,5 → Impulshöhe halbiert.
2. Fade-In 2 Schläge auf Gleichspannung → Werte bei 0 / 1 / 2 Schlägen ≈ 0 / 0,5 / 1 (relativ). Fade-Out entsprechend.
3. Teilen ist klanglich neutral: Render vor und nach dem Teilen identisch (Differenz < 1e-4).
4. Links kürzen erhält die Phase: Impulse bleiben an derselben absoluten Position.
5. Duplizieren: Kopie beginnt am Ende des Originals.
Store: Spur hinzufügen/löschen/umbenennen inkl. Rückgängig.
UI (Playwright): Fade-Griff ziehen, Lautstärke-Griff ziehen, Doppelklick-Umbenennen, Taste T, Strg+D, Spur hinzufügen, Projekt öffnen per Datei.

Ohr-Test für Martin: Fades auf „Pad“ und „Riser“ setzen und anhören, ob die Übergänge weich klingen; während der Wiedergabe teilen und Lautstärke ziehen – keine Knackser?

## Offene Fragen
- Lautstärke über 0 dB anheben (Boost)? Vorerst nein, das kann der Spur-Regler.
- Mehrfachauswahl (mehrere Clips gleichzeitig bewegen) → Stufe 2b, falls gewünscht.
