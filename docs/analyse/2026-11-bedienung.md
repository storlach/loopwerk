# Bestandsanalyse Bedienung – Loopwerk und Krachwerk (November 2026)

Geprüft am laufenden Programm (Stand `6abd2ff`), Headless-Chromium über Playwright, echter erster Start (ohne `legacyStart`), für die Tipps zusätzlich mit verborgenem `navigator.webdriver`, damit sie wie bei Menschen erscheinen. Größen: Desktop 1440×900 und 1280×720, Tablet 820×1180 mit Touch, Handy 390×844 und 360×740 mit Touch. Eingaben am Handy und Tablet per `tap`, `touchscreen` und CDP-Touch (langes Drücken). Bilder liegen in `docs/analyse/bedienung/`.

## 1. Maßstab

Jemand ohne Vorkenntnisse soll im Browser, am Handy wie am Rechner, in wenigen Minuten einen Song bauen können (Krachwerk: nur mit Selbstgemachtem), wobei jede Grundfunktion sichtbar ist und in höchstens zwei Schritten erreicht wird.

## 2. Bestand

### Flächen und Fächer

**Loopwerk, Desktop (1440):** Deck oben (Transport, ●, Klick, Anzeige Takt/Schlag/Zeit/Tempo/Tonart, Pegel, Rückgängig, Projektmenü, Exportieren), links das Regal „Assets“ mit den Reitern „Suchen“ und „Erstellen“ (Song-Starter, Beat, Melodie, Einsingen, Begleitung, Aufnehmen, Import, Link), Mitte der Arranger mit Ansichtsleiste (Zoom, Raster) und Spurköpfen (M, S, Lautstärke-Knopf, ⋯, Kurve), rechts der Inspektor (Song, Clip, Spur mit Effekten, Mastering), unten die Fachleiste (Mixer, FX-Pad, Editor, Tastenkürzel). Docks über dem Arranger: Mixer, Clip-Editor, Beat-/Melodie-Editor, FX-Pad; Export als Klappfeld unter seinem Knopf. Bei 1280 klappt der Inspektor zu einer senkrechten Leiste „Eigenschaften“ zusammen, die Tonart verschwindet aus dem Deck.

**Loopwerk, Tablet (820):** wie Desktop, aber das Deck bricht in zwei Zeilen um, der Inspektor ist eine Leiste „Eigenschaften“, über den Spuren gibt es zusätzlich „Auswählen“, die Clipleiste schwebt über dem Arranger.

**Loopwerk, Handy:** Deck (Anfang, ▶, ●, Takt, Tempo, Rückgängig), darunter Pillen (Raster, Klick, Loop), Spuren, Clipleiste bei Auswahl (Bearbeiten, Teilen, Duplizieren, Löschen, Pegel), Fachleiste mit vier Schubladen: Sounds, Mixer, Editor, Song. Im Fach „Song“ liegen Name, Tempo/Tonart/Länge, Song-Starter, Mastering, Speichern, Exportieren, Aufnahme-Eingang, dann eine Textzeile „Öffnen · Beispiel · Tipps · Leeren“.

**Krachwerk, Desktop:** schmales Deck (▶, Loop, ●, Takt, Tempo, Rückgängig, Projektmenü, Exportieren), links die „Kiste“ mit „+ Neu“ (sechs Karten), Arranger, rechts die „Werkbank“ – bei Clip-Auswahl offen mit den Reitern Form · Ton · Farbe · Zeit · Zerlegen · Clip, sonst eine 22 px schmale senkrechte Leiste, hinter der Song-Werte, Mixer, FX-Pad, Tastenkürzel, Aufnahme-Eingang und Effekte liegen. „Festhalten“ sitzt als Knopf auf dem Loop-Band im Lineal.

**Krachwerk, Handy:** Deck (Songname, Takt, Tempo, Rückgängig), Pillen (Raster, Loop), Daumenleiste Kiste · ▶ · ● · Werkbank. Das Fach „Song“ (Speichern, Exportieren, Mastering, Mischen, FX-Pad, Sicherung) öffnet nur ein Tipp auf den Songnamen im Deck.

### Zählwerte (`tests/count.cjs`, Funktion `measure`)

Basis-Szenen wie im Werkzeug, Desktop hier 1440×900 (die Datei `count-baseline.json` misst bei 1400×820 und ergibt 79/86 statt 80/88). Für Krachwerk „clip“ wurde ein Test-Klang angelegt, weil der leere Song sonst keinen Clip hat. Die Docks öffnen über `ui.setDock`; „sounds“, „song“ und „werkbank“ sind am Desktop von Loopwerk keine eigenen Schubladen, die Werte entsprechen dort dem Start.

| Szene | Loopwerk Desktop | Loopwerk Handy | Krachwerk Desktop | Krachwerk Handy |
|---|---|---|---|---|
| Start | 80 Bedienelemente · 45 Rahmen · 11 Schriftgrößen | 48 · 25 · 5 | 22 · 8 · 4 | 13 · 4 · 4 |
| Clip gewählt | 88 · 53 · 10 | 52 · 30 · 5 | 40 · 12 · 4 | 17 · 8 · 4 |
| Mixer | 106 · 81 · 13 (kleinste Schrift 9 px) | 29 · 24 · 4 | 41 · 29 · 4 | 24 · 17 · 4 |
| Beat-Editor | **223 · 167 · 10** | 75 · 50 · 6 | 187 · 140 · 4 | 54 · 43 · 4 |
| Clip-Editor / Werkbank | 92 · 56 · 10 | 21 · 16 · 3 | 44 · 12 · 4 | 19 · 10 · 4 |
| Export | 82 · 49 · 11 | 36 · 18 · 6 | 38 · 15 · 4 | 14 · 8 · 4 |
| Fach Song | – | 32 · 21 · 6 | – | 24 · 6 · 5 |
| Fach Sounds/Kiste | – | 43 · 22 · 6 | – | 20 · 9 · 4 |

Am vollsten ist der Desktop von Loopwerk mit offenem Beat-Editor (jede Schrittzelle zählt als Knopf) und der Desktop-Mixer mit 13 verschiedenen Schriftgrößen. Krachwerk liegt überall bei einem Viertel bis einem Drittel davon.

### Kernabläufe – Schritte je Gerät

Gezählt sind Klicks oder Tipps ab einem ruhigen Zustand (nichts gewählt, kein Fach offen). „+n“ steht für nötiges Scrollen oder Schließen.

| Ablauf | Desktop | Handy | Stolperstelle |
|---|---|---|---|
| Erster Ton (Loopwerk) | 1 (▶) | 1 (▶) | Beispiel-Song liegt schon da; am Handy sieht man nur Takt 1–3 mit zwei Clips, Drums/Bass beginnen erst bei Takt 5. |
| Loop vorhören und auf eine Spur legen | 3 (Gruppe öffnen, Klick hört, ziehen) | 4 (Sounds, Gruppe, Sound, Spur) | Alle Gruppen starten zu. Nach dem Ablegen bleibt der Sound „scharf“ (W1). Am Handy rastet er auf Schläge (W5). |
| Beat bauen | 2 (Erstellen, Beat bauen) | 2 (Sounds, + Beat) | Der neue Clip landet auf einer neuen Spur außer Sicht (W2). |
| Melodie bauen | 2 | 2 | wie Beat; am Handy füllt der Melodie-Editor das ganze Bild, der Beat-Editor nur die Hälfte. |
| Song-Starter | 3 (Erstellen, Genre, „Sicher?“) | 3 +1 (Song, Genre, „Sicher?“, Fach schließen) | Am Desktop unter „Erstellen“, am Handy im Fach „Song“. |
| Clip schneiden | 3 (Clip, Teilen, Stelle klicken – Schere) | 3 (Lineal antippen, Clip, Teilen) | Am Handy ohne Schere: steht die Marke nicht im Clip, erscheint 3,5 s ein Satz, dass man sie im Lineal setzen soll. |
| Clip verschieben | 1 (ziehen) | 2 (antippen, ziehen) | – |
| Clip kopieren / löschen | 2 (Clip, Knopf) oder Alt-Ziehen / Entf | 2 (Clip, Knopf) | Bei 1280 sind die Clip-Knöpfe nicht zu sehen (W3). |
| Mehrere Clips wählen | 1 (Rahmen ziehen) | 2 (lange drücken, weitere antippen) | Am Handy nirgends sichtbar (K1). Am Desktop keine Anzeige der Anzahl (W4). |
| Lautstärke einer Spur | 1 (Knopf am Spurkopf) | 2 (Mixer, Fader) | – |
| Effekt einer Spur | 2 (Spurname, Schalter) | 3 (Mixer, „Keine Effekte“, Effekt) | Bei 1280: +1 („Eigenschaften“ aufklappen). |
| Mastering einschalten | 1 (Schalter unten im Inspektor, nur ohne Auswahl) | 2 (Song, Schalter) | Im Export erscheint Mastering ein zweites und drittes Mal (W7). |
| Aufnehmen (Loopwerk) | 1 (●), 1 zum Beenden | 1, 1 | Aufnahme landet auf der Spur „Drums“ (W8). |
| Speichern / Öffnen | 2 (Projektmenü, Speichern/Öffnen) | 2 (Song, Speichern) | – |
| Exportieren | 2 (Exportieren, Exportieren) | 3 +1 (Song, Exportieren, scrollen, Exportieren) | – |
| Erster Klang (Krachwerk) | 1 (●, Geräusch machen) | 1 | Läuft sofort im Loop – trägt. |
| Werkbank (Krachwerk) | 1 (Clip wählen, sie öffnet sich) | 2 (Clip, Werkbank) | – |
| Zerlegen | 3 (Clip, Reiter Zerlegen, „Auf die Spur“) | 4 | – |
| Take über den laufenden Loop | 1 (● während der Loop läuft) | 1 | Einblender wechseln im 1,6-s-Takt (F7). |
| Festhalten | 1 (Knopf im Lineal, Loop an) | 1 | Knopf wird vom Marken-Griff überdeckt (F5). |
| Sichern (ZIP) | 2 +1 (Werkbank-Leiste, scrollen, Sichern) | 2 +1 (Songname, scrollen, Sichern) | Einstieg ohne Hinweis (K1). |
| Mischen (Krachwerk) | 2 (Werkbank-Leiste ohne Auswahl, Mixer) | 2 (Songname, Textlink „Mischen“) | wie oben. |

## 3. Kritisch

### K1. Funktionen wandern je Gerät, ihre Einstiege und Erklärungen wandern nicht mit

*Echter Fehler und Reibung.*

**Problem.** Am Handy sind der Knopf „Auswählen“ (`#select-btn`) und die Gesten-Liste („? Gesten“, `#keys-btn`) ausgeblendet, sie liegen in keinem Fach (geprüft: in keinem der vier Fächer sichtbar). Mehrfachauswahl gibt es nur über langes Drücken (Bild `08-handy-mehrfachauswahl-390.png` zeigt, dass es funktioniert). Der einzige Hinweis darauf ist der Tipp `select-touch` in `src/ui/tips.js`, und der hängt ausgerechnet an `#select-btn` – er kann am Handy deshalb nie erscheinen (echter Fehler). Dasselbe Muster in Krachwerk: Speichern, Exportieren, Mischen, FX-Pad und die Sicherung liegen am Handy im Fach „Song“, das nur ein Tipp auf den Songnamen „unbenannt“ öffnet; der Name sieht aus wie eine Beschriftung, nicht wie ein Knopf (`18-krachwerk-start-390.png`, `20-krachwerk-fach-song-390.png`). Am Desktop liegt dasselbe hinter der 22 px schmalen, senkrecht beschrifteten Werkbank-Leiste am rechten Rand (`23-krachwerk-desktop-werkbank-ohne-clip-1440.png`).

**Auswirkung.** Wer am Handy mehrere Clips verschieben will, findet keinen Weg; wer in Krachwerk seinen Song speichern oder exportieren will, findet am Handy keinen sichtbaren Ort dafür. Genau das ist Martins Beschwerde „Mehrfachauswahl per Touch nicht auffindbar“ – sie ist kein Einzelfehler, sondern Folge davon, dass `place.js`/`layout.js` Knöpfe je Gerät verschieben oder ausblenden, Tipps und Gesten-Liste aber an die Desktop-Orte gebunden bleiben.

**Richtung.** Jede Funktion braucht auf jedem Gerät einen sichtbaren Einstieg (Auswählen in die Clipleiste oder die Pillen, „Gesten“ ins Fach Song, Songname mit erkennbarem Pfeil oder eigener Reiter), und Tipps verankern sich am tatsächlich sichtbaren Element.

**Aufwand.** klein (Tipp-Anker, Gesten-Liste) bis mittel (Krachwerk-Einstieg ins Song-Fach).

### K2. Die Einführung beginnt beim Nebensächlichen, das Wichtigste kommt zu spät oder gar nicht

*Reibung mit Fehleranteil.*

**Problem.** Beim echten ersten Start erscheinen 18 Tipps nacheinander. Am Desktop kommen zuerst Filter, Harmonie, Erstellen, Lineal, „Effekte sitzen auf der Spur“ und Effekt-Reihenfolge; der Tipp „Hier sind die Sounds … auf eine Spur ziehen“ kam in meinem Durchgang erst als siebter, nachdem schon ein Clip gewählt war (`01-loopwerk-start-erster-tipp-filter-1440.png`). Am Handy ist der erste Tipp „Harmonie“ (Tonart- und Akkordzeilen, `02-loopwerk-start-erster-tipp-harmonie-390.png`); der Tipp „Antippen hört rein … danach in eine Spur tippen“ erschien in der ganzen Sitzung (Sounds öffnen, Gruppe öffnen, Clip wählen, Mixer) nicht. Ursache: Alle Regal-Gruppen starten geschlossen, der Tipp braucht ein sichtbares `.loop-item`, und das Aufklappen einer Gruppe löst keine neue Prüfung aus (`check` läuft nur bei `ui`/`store`-Ereignissen). Dazu kommt: Der Beispiel-Song beginnt bei Drums und Bass erst in Takt 5, am Handy wirkt der Arranger daher fast leer.

**Auswirkung.** Ein Neuling lernt zuerst, was Harmonie-Zeilen und Effekt-Reihenfolgen sind, und nicht, wie er einen Sound auf eine Spur bekommt. Wer zweimal „Verstanden“ drückt und dann „Keine Tipps mehr“ wählt, hat die Kernhandlung nie erklärt bekommen.

**Richtung.** Drei Tipps für die Kernschleife (Sound hören → auf Spur → ▶) zuerst und in fester Reihenfolge, alles andere erst beim ersten Gebrauch der jeweiligen Fläche; die Prüfung auch nach dem Aufklappen einer Gruppe anstoßen.

**Aufwand.** klein.

### K3. Ein Objekt, zwei unsichtbar verschiedene Editoren und sieben Namen dafür

*Reibung.*

**Problem.** Ein Drum-Loop aus dem Regal und ein selbst gebauter Beat sehen im Arranger gleich aus: gelb, mit Wellenform, nur ein kleines Etikett „Pattern“ unterscheidet sie (`05-clip-arten-beat-melodie-loop-1440.png`). Doppelklick öffnet beim Loop den Clip-Editor (Wellenform, Zuschneiden, Entrauschen …), beim Beat den Beat-Editor mit Schritten. Ein Drum-Loop lässt sich nicht als Schritte bearbeiten, und nichts sagt das vorher. Für dieselbe Sache gibt es im Programm diese Wörter: „Bearbeiten“ (Knopf in Inspektor und Clipleiste), „Editor · Name“ (Fachleiste), „Clip-Editor“ (Kopf), „Sample-Editor“ (Tooltip des Knopfs und Name für Screenreader), „Pattern-Editor“ (Name für Screenreader), „Beat-Editor“ / „Melodie-Editor“ (Kopf), „Pattern“ (Etikett am Clip); in Krachwerk heißt „Werkbank“ sowohl die Klangbearbeitung als auch der Ort für Song-Einstellungen. Am Handy zeigt der Kopf des Clip-Editors nur den Namen, die Art steht nirgends (`06-handy-clip-editor-390.png`).

**Auswirkung.** Martins Eindruck „es geht immer nur der Clip-Editor auf“ ist folgerichtig: Wer einen Drum-Loop doppelklickt und einen Beat-Editor erwartet, bekommt eine Wellenform und weiß nicht, warum. Die vielen Namen verhindern, dass man ein Modell davon bildet, welcher Clip welches Werkzeug hat.

**Richtung.** Ein Wort für „Bearbeiten“ überall und am Clip selbst ablesbar machen, was kommt (Beat/Melodie mit Schritt- bzw. Notenbild statt Wellenform, Editor-Kopf nennt die Art auch am Handy).

**Aufwand.** mittel.

## 4. Wichtig

### W1. Ein gewählter Sound bleibt „scharf“ – ein Klick ins Leere legt einen weiteren Clip

*Reibung mit Fehlerwirkung.* Klick auf einen Sound im Regal hört ihn an und macht ihn zum Einsetzen bereit; zieht man ihn danach auf eine Spur, bleibt er bereit. Der nächste Klick auf eine freie Stelle – den man macht, um die Auswahl aufzuheben – legt einen zweiten Clip (gemessen: Spur 8 von 1 auf 2 Clips). Der Einblender „… ausgewählt – in eine Spur klicken setzt ihn ein, Esc beendet“ bleibt so lange stehen und liegt am Desktop über der unteren Zeile von Beat- und Clip-Editor (`04-desktop-beat-clip-ausser-sicht-hinweis-ueber-editor-1440.png`), am Handy über der Soundliste (`03-handy-loop-gelegt-hinweis-bleibt-390.png`). **Richtung:** Ablegen per Ziehen beendet den Einsetz-Modus, und der Einblender weicht offenen Fächern aus. **Aufwand:** klein.

### W2. Neue Beats und Melodien entstehen außer Sicht

*Reibung.* „Beat bauen“ und „+ Beat“ legen den Clip auf eine neue Spur 9; am Desktop liegt sie unter dem geöffneten Editor, am Handy unter der Schublade (`04-…`, `13-handy-beat-clip-unsichtbar-390.png`). Man baut einen Beat, ohne zu sehen, wo er im Song liegt. **Richtung:** den neuen Clip in den sichtbaren Bereich scrollen oder auf eine freie sichtbare Spur legen. **Aufwand:** klein.

### W3. Mittlere Breiten: Werkzeuge verdrängen den Inhalt

*Reibung.* Bei 1280×720 ist der Inspektor zugeklappt; wählt man einen Clip, erscheint nirgends eine Aktion – kein Teilen, Duplizieren, Löschen, keine Clip-Lautstärke (`10-desktop-1280-clip-gewaehlt-ohne-aktionen.png`). Erst die senkrechte Leiste „Eigenschaften“ zeigt sie. Am Tablet (820) bleibt der Zeitleiste neben Regal (280 px) und Spurköpfen (230 px) ein Streifen von gut 200 px, Takt 1–3 (`11-tablet-zeitleiste-schmal-820.png`). Öffnet man dort den Clip-Editor und „Mehr“, stehen zwei Reihen Werkzeuge über der Wellenform, die auf 86 px schrumpft (`07-tablet-editor-mehr-wellenform-klein-820.png`). Das ist das Muster hinter Martins Beschwerde „der Editor lief über die Wellenform, wenn Mehr offen war“: Die Fächer haben feste Höhen, Werkzeugzeilen stapeln sich darüber, und was schrumpft, ist das Objekt, um das es geht. **Richtung:** Inhalt (Zeitleiste, Wellenform) bekommt eine Mindestgröße, Werkzeuge klappen oder scrollen vorher; bei zugeklapptem Inspektor erscheint die Clipleiste wie am Tablet. **Aufwand:** mittel.

### W4. Mehrfachauswahl am Desktop ohne Rückmeldung

*Reibung.* Nach einem Rahmen um vier Clips zeigt der Inspektor „Clip · Crash“ mit den Reglern eines einzelnen Clips, der Einblender bleibt leer (`09-desktop-vier-gewaehlt-inspektor-zeigt-einen-1440.png`). Am Handy steht dagegen „2 Clips ausgewählt“ (`08-…`). Ob die Clip-Lautstärke dann für einen oder alle vier gilt, ist nicht erkennbar. **Richtung:** Anzahl im Inspektor-Kopf anzeigen und Regler, die nur für einen Clip gelten, für die Gruppe kennzeichnen. **Aufwand:** klein.

### W5. Loops rasten am Handy auf Schläge statt auf Takte

*Reibung.* Mit dem Standardraster „Schlag“ ist ein Schlag am Handy etwa 24 px breit. Wer kurz hinter den Taktstrich tippt, setzt den Ein-Takt-Loop „Four to the Floor“ auf Schlag 2 – er klingt dann gegen alles andere versetzt (`03-handy-loop-gelegt-hinweis-bleibt-390.png`, Clip beginnt zwischen 1 und 2). **Richtung:** Loops beim Einsetzen auf Takte einrasten lassen, das feine Raster nur beim Verschieben. **Aufwand:** klein.

### W6. Dieselbe Funktion sitzt je Gerät woanders und sieht anders aus

*Reibung.* Der Song-Starter steht am Desktop unter „Erstellen“, am Handy im Fach „Song“. „+ Neu“ zeigt in Krachwerk am Desktop sechs Karten (mit Einsingen, Aufnehmen, Loop festhalten), am Handy drei Knöpfe ohne diese (`22-krachwerk-neu-und-festhalten-390.png`). Der Beat-Editor öffnet am Handy auf halber Höhe, Melodie- und Clip-Editor auf voller Höhe. Schneiden geht am Desktop mit Schere, am Handy nur über die Marke im Lineal. Der Mixer heißt in Loopwerk „Mixer“, in Krachwerk am Handy „Mischen“ (als kleiner Textlink). **Richtung:** pro Funktion einen festen Ort und Namen festlegen, der Ort darf je Gerät nur in der Form wechseln (Karte, Knopf, Fach), nicht im Inhalt. **Aufwand:** mittel.

### W7. Export: Mastering dreimal, falscher Plattform-Hinweis, Knopf außer Sicht

*Reibung.* Im Export-Feld gibt es einen Abschnitt „Mastering“ mit einem Schalter „Mastering“ und darunter das Häkchen „Mit Mastering“; außen im Inspektor steht ein dritter Schalter (`15-desktop-export-mastering-dreifach-1440.png`). Der Satz „In claude.ai wird die Audiodatei als ZIP gespeichert“ steht immer da, auch auf GitHub Pages. Am Handy steht zuerst eine Liste mit Bit-Tiefen, der Knopf „Exportieren“ erst nach dem Scrollen (`14-handy-export-390.png`). Der Bereich heißt „Ganzer Song (Takt 1–16)“, während das Fach „Song“ eine Länge von 32 Takten zeigt. **Richtung:** ein Mastering-Schalter, plattformabhängige Hinweise nur dort, wo sie gelten, Knopf oben, Formate mit sinnvoller Voreinstellung zuklappen. **Aufwand:** klein.

### W8. Aufnahme in Loopwerk landet auf der Spur „Drums“, der Text spricht von Klicken und Leertaste

*Reibung.* Am Handy legt ● die Aufnahme auf die erste Spur mit Platz an der Marke – im Beispiel „Drums“, mit deren Effekten (`17-handy-aufnahme-landet-auf-drums-390.png`), obwohl „Spur 8“ leer ist. Der Einblender sagt am Handy „Nochmal klicken oder Leertaste beendet“. **Richtung:** ohne scharf geschaltete Spur eine leere Spur nehmen oder anlegen; Texte für Touch getrennt formulieren wie bei den Tipps. **Aufwand:** klein.

### W9. Abschneiden und Überlauf: das Muster hinter den abgeschnittenen Kopfzeilen

*Echter Fehler und Reibung.* Bei 360 px läuft in Krachwerk das schwebende Clip-Menü über den rechten Rand: „Löschen“ ist halb abgeschnitten (`21-krachwerk-clipmenue-ueberlauf-360.png`, gemessen rechte Kante 377 px) – echter Fehler. Daneben schneidet das Programm überall Namen ab, sobald sie länger als die Standardnamen sind: Spurnamen nach etwa acht Zeichen („Schlagzeug…“, in Krachwerk tragen Spuren den Namen der Aufnahme, also „Gitarre Stro…“), der Songname im Krachwerk-Deck („Sommer…“), der Kopf des Clip-Editors am Handy („Pad Am–F–C–G (bear…“, `06-…`), der Projektknopf am Tablet („Beispiel-Ar…“), „? Gesten“ bricht am Tablet um. Das Muster: feste Breiten, die mit den kurzen Voreinstellungen („Spur 1“, „Drums“) geprüft werden; schwebende Menüs werden am Objekt verankert, aber nicht am Bildrand begrenzt. **Richtung:** Menüs am Rand begrenzen und die Handy-Tests mit langen Namen (Song, Spur, Sound) laufen lassen, abgeschnittene Namen per Antippen ganz zeigen. **Aufwand:** klein (Menü-Fehler), mittel (Prüfung mit langen Namen).

### W10. Einblender: fest 3,5 Sekunden, egal wie lang der Satz ist

*Reibung.* `ui.flash` blendet jede Meldung nach 3,5 s aus. „Kein Zugriff auf das Mikrofon. Erlaube den Zugriff im Browser oder importiere eine Aufnahme als Datei.“ (gut formuliert, `16-desktop-mikro-verweigert-1440.png`) ist danach weg, ohne Knopf zum Importieren; in Krachwerk, wo das Mikrofon der Hauptweg ist, bleibt dann nur der leere Hinweis „tippen, dann ein Geräusch machen“. Bei Takes wechseln drei Meldungen in 1,6-s-Abständen. **Richtung:** Dauer nach Textlänge, Fehlermeldungen mit Ausweg bleiben mit Knopf stehen, bis man handelt. **Aufwand:** klein.

## 5. Feinschliff

- **F1. Tippflächen am Handy** (gemessen mit `tests/touch-targets.cjs`, also mit vergrößerten Trefferflächen): Spur-Menü „⋯“ 36×25 px, Spurname 78×17 px (Antippen benennt um), Clip-Rand zum Kürzen 14×33 px, Einblend-Griff 16×28 px, Tempo-Feld 47×41 px. Das „⋯“ ist der einzige Weg zu Kurve, Duplizieren, Gruppe und Löschen einer Spur. Aufwand klein.
- **F2. Screenreader-Stichprobe:** Die Regler im Inspektor `#insp-gain`, `#insp-fadein`, `#insp-fadeout`, `#insp-length` und `#insp-vol` haben keinen zugänglichen Namen. Das Suchfeld im Regal zeigt beim Tab-Fokus keinen eigenen Ring (alle anderen 39 geprüften Stationen schon). Mit Tab erreicht man nach 40 Schritten noch keinen Clip im Arranger. Aufwand klein.
- **F3. Fremd- und Fachwörter:** „Assets“ (Regal-Titel), „Pattern“, „Fehlendes Sample“, „One-Shot“, „Stems“, „LUFS“, „FX-Pad“, „Sample-Editor“. Aufwand klein.
- **F4. „(bearbeitet)“ ohne Bearbeitung:** Der Clip-Editor zeigt den Titel sofort beim Öffnen mit „(bearbeitet)“ (`06-…`). Aufwand klein.
- **F5. Festhalten-Knopf überdeckt:** Der Griff der Abspielmarke liegt auf dem Symbol von „Festhalten“ im Lineal, am Desktop wie am Handy (`22-…`). Aufwand klein.
- **F6. Krachwerk-Leerzustand am Desktop** sagt „tippen, dann ein Geräusch machen“, auch mit Maus. Aufwand klein.
- **F7. Verweis ins Leere:** Der Einblender „Sitzt es nicht im Takt? Song → Aufnahme → Einmessen.“ nennt einen Abschnitt „Aufnahme“, der im Fach „Song“ nicht so heißt (dort stehen „Eingang“, „Latenz“, „Einmessen“). Aufwand klein.
- **F8. Handy-Mixer:** Der Master-Kanal klebt rechts und verdeckt den dritten Kanal zur Hälfte (`24-handy-mixer-390.png`). Aufwand klein.
- **F9. Song-Starter am Handy** ist eine seitlich scrollende Reihe, deren letzter Knopf angeschnitten ist; ob das ein Scroll-Hinweis oder ein Fehler ist, erkennt man nicht (`12-handy-fach-song-390.png`). Aufwand klein.
- **F10. Schwebendes Clip-Menü in Krachwerk** liegt über der Spur darüber und verdeckt dort Clips. Aufwand klein.
- **F11. Geschmacksfrage:** Loopwerk beschriftet in Versal-Mono („RASTER: SCHLAG“, „MIXER“), Krachwerk in Satzschreibung. Beides ist für sich stimmig, aber dieselbe App sieht dadurch je Edition anders aus.

## 6. Trägt

- **Krachwerks Kernschleife.** Ein Tipp auf ●, ein Geräusch, und der gesäuberte Klang liegt als Clip im Loop und spielt (`19-krachwerk-werkbank-390.png` zeigt den Zustand danach), mit 13 Bedienelementen am Handy-Start. Das ist die Niedrigschwelligkeit, die der Maßstab verlangt, und zeigt, wie Loopwerk sich anfühlen könnte.
- **Keine Pflichtdialoge, alles rückgängig.** Löschen geht ohne Rückfrage und mit Rückgängig zurück, der Song-Starter fragt im Knopf selbst („Sicher?“) statt in einem Dialog, Rahmen-Auswahl plus Entf plus Strg+Z verhalten sich wie erwartet, und das verweigerte Mikrofon wird mit einem Ausweg erklärt.

## Reihenfolge

1. **Sichtbare Einstiege auf jedem Gerät (K1):** Auswählen und Gesten-Liste ans Handy, Tipp-Anker an das sichtbare Element, Krachwerks Song-Fach als erkennbarer Knopf.
2. **Einführung auf die Kernschleife umstellen (K2):** Sound hören → auf Spur → ▶ zuerst, Rest beim ersten Gebrauch; Beispiel-Song so, dass man am Handy sofort Clips sieht.
3. **Ein Editor-Begriff und am Clip ablesbar, was kommt (K3):** Beat/Melodie mit eigenem Bild, ein Wort für „Bearbeiten“, Editor-Kopf nennt die Art.
4. **Einsetzen ohne Überraschung (W1, W2, W5):** Einsetz-Modus endet nach dem Ziehen, neue Clips erscheinen in Sicht, Loops rasten auf Takte.
5. **Inhalt vor Werkzeug bei mittleren und kleinen Breiten (W3, W9):** Mindestgröße für Zeitleiste und Wellenform, Clipleiste bei zugeklapptem Inspektor, Menüs am Bildrand begrenzen und mit langen Namen testen.

## Nicht geprüft

- Echtes Mikrofon und echte Latenz (nur Fake-Gerät von Chromium und eine verweigernde Attrappe); Tab-Aufnahme, Einsingen, MIDI.
- Echte Geräte und Browser (Safari auf iOS, Chrome auf Android, Firefox); nur Chromium-Emulation mit Touch.
- Screenreader im Betrieb (nur zugängliche Namen als Stichprobe), Kontraste nicht neu gemessen (dafür gibt es `tests/contrast.test.cjs`).
- Klang (Mastering, Effekte, Starter) – das beurteilt der Mensch.
- Datei-Import über den Dateidialog, Link-Import, Öffnen einer gespeicherten Datei über die Oberfläche (Speichern und Öffnen nur bis zum Knopf geprüft), Wiederherstellen einer Sicherung, PWA-Installation und Offline-Betrieb.
- Lange Sitzungen, große Projekte und Bildrate auf schwachen Geräten.
