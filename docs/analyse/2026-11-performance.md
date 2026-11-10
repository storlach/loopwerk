# Bestandsanalyse Performance – Loopwerk und Krachwerk (November 2026)

Stand: Commit `c80d821`. Reine Messung, kein Code geändert. Alle Messskripte liegen außerhalb des Repos (siehe „Womit gemessen“ am Ende).

## 1. Maßstab

Loopwerk soll auf einem Mittelklasse-Handy ohne Wartezeit und ohne Ruckeln laufen, und der Ton darf dabei nie aussetzen oder aus dem Takt geraten.

Das Mittelklasse-Handy ist hier nachgestellt: Bildschirm 390 × 844, Rechenleistung des Hauptthreads auf ein Viertel gedrosselt („CPU 4×“), Netz wie 4G (9 Mbit/s, 85 ms Verzögerung je Anfrage) und als schlechter Fall „langsames 4G“ (1,6 Mbit/s, 150 ms). „Desktop“ heißt 1440 × 900 ohne Drosselung.

Zielwerte, gegen die gemessen wird:

| Bereich | gut | grenzwertig | schlecht |
|---|---|---|---|
| Erstes Bild nach dem Aufruf | bis 1 s | bis 2,5 s | darüber |
| Seite bedienbar (Ladebild weg) am Handy, 4G, erster Besuch | bis 3 s | bis 5 s | darüber |
| Erster Ton nach dem Tippen | bis 0,3 s | bis 1 s | darüber |
| Antwort auf eine Eingabe (bis zum nächsten Bild) | bis 100 ms | bis 250 ms | darüber |
| Bildrate beim Spielen, Scrollen, Ziehen | ab 50 Bilder/s | 30–50 | unter 30 |
| Lange Aufgabe (der Hauptthread ist am Stück blockiert) | keine über 50 ms | bis 125 ms | darüber |
| Abstand zwischen zwei Takten des Schedulers | bis 60 ms | bis 125 ms | darüber (Einsätze kommen zu spät) |
| Rechenlast des Tons | bis 30 % eines Kerns | bis 60 % | darüber (Aussetzer drohen) |
| Speicher für Klänge am Handy | bis 150 MB | bis 300 MB | darüber |
| Ganze Testkette | bis 10 min | bis 20 min | darüber |

Kurz zu den Fachwörtern: Der **Hauptthread** ist der eine Arbeitsstrang des Browsers, in dem die Seite rechnet, zeichnet und auf Eingaben antwortet; solange dort eine **lange Aufgabe** läuft, reagiert nichts. Der **Scheduler** ist der Teil der Engine, der alle 25 ms die nächsten Clip-Einsätze an die Tonausgabe meldet, immer 150 ms im Voraus. Eine **Leinwand** (Canvas) ist eine Zeichenfläche, die der Browser als Bild im Speicher hält.

### Drei Vorbehalte, die für alle Zahlen gelten

1. **Keine Grafikkarte.** Der Test-Browser läuft ohne Bildschirm und ohne Grafikkarte, alles Zeichnen rechnet der Prozessor. Bildraten sind deshalb **Vergleichswerte**, keine Gerätewerte. Besonders stark trifft das das Raumlicht (WebGL-Shader): Mit Licht sinkt hier fast jede Bildrate auf rund 10 Bilder/s. Ich habe deshalb alle Bedien-Messungen **ohne Licht** gemacht (das Licht war nur in der Messung durch eine Attrappe ersetzt) und das Licht getrennt gemessen.
2. **Last auf der Testmaschine.** Parallel liefen drei andere Analysen mit eigenen Browsern (4 Kerne, Xeon 2,1 GHz). Die Last (`uptime`) lag während fast aller Reihen zwischen 5 und 16, einzeln bis 19. Meine Mess-Prozesse liefen mit erhöhter Priorität (`nice -10`), jede Reihe mindestens dreimal; angegeben ist der Median, in Klammern die Spanne. Auffällige Werte habe ich wiederholt.
3. **Drosselung trifft nur den Hauptthread.** Die Tonberechnung selbst läuft in einem eigenen Strang und lässt sich hier nicht drosseln. Aussagen über die Tonlast am Handy sind daher hochgerechnet und so gekennzeichnet.

## 2. Bestand

### 2.1 Laden und Start

Ausgeliefert wie auf GitHub Pages nachgestellt: HTTP/2, gzip für Text, `Cache-Control: max-age=600`. Je Wert 3 Läufe; Last 1,0 bis 8,5. Eine zweite Reihe bei Last 15 lag erwartungsgemäß höher (Handy mit 4G, erster Besuch: 2,65 s statt 2,16 s; langsames 4G: 5,75 s statt 5,38 s); die Tabelle zeigt die ruhigere Reihe.

**Was geladen wird (erster Besuch, beide Editionen gleich):**

| | Anfragen | übertragen | entpackt |
|---|---|---|---|
| HTML (`index.html`, davon 249 kB CSS) | 1 | 66 kB | 313 kB |
| JavaScript (ES-Module, ungebündelt) | 101 | 496 kB | 1 624 kB |
| Schriften (Google Fonts) | 4 | 65 kB | 64 kB |
| Symbol | 1 | unter 1 kB | – |
| Audio beim Start | 0 | 0 | – |
| **Summe** | **107** | **627 kB** | **2,0 MB** |

Die Import-Kette ist vier Ebenen tief (1 → 46 → 47 → 7 Module). Weil alle 101 Module in `index.html` als `modulepreload` stehen, fordert der Browser sie sofort gemeinsam an: Es gibt **keinen Wasserfall**. Am Handy mit 4G sind alle Module nach 0,83 s da. Beim Start wird **kein Klang aus dem Netz** geholt; die acht Loops des Beispiel-Arrangements werden erzeugt, alle übrigen 537 Sounds erst bei Gebrauch.

**Zeiten (Median, in Klammern Spanne):**

| | Desktop | Handy, 4G | Handy, langsames 4G | Einordnung |
|---|---|---|---|---|
| Loopwerk: erstes Bild (Ladebild) | 0,20 s | 0,35 s (0,30–0,39) | 0,44 s (0,35–0,60) | gut |
| Loopwerk: bedienbar, erster Besuch | 0,86 s (0,86–1,58) | 2,16 s (2,10–2,27) | 5,38 s (5,29–5,91) | gut / gut / schlecht |
| Loopwerk: bedienbar, Wiederbesuch | 0,64 s | 1,61 s (1,57–1,71) | 2,30 s (2,16–2,81) | gut |
| Loopwerk: Wiederbesuch nach über 10 min (101 Nachfragen „noch aktuell?“) | – | 1,65 s (1,46–1,78) | 2,60 s (2,45–2,81) | gut |
| Krachwerk: bedienbar, erster Besuch | 0,76 s (0,62–0,77) | 2,15 s (1,83–2,66) | 5,27 s (4,63–5,29) | gut / gut / schlecht |
| Lange Aufgaben bis „bedienbar“ (Loopwerk, erster Besuch) | 4, zusammen 0,47 s, längste 0,20 s | 5, zusammen 1,07 s, längste 0,47 s | 7, zusammen 1,27 s, längste 0,42 s | grenzwertig / schlecht / schlecht |

„Bedienbar“ heißt: Das Ladebild ist weg und `window.loopwerk.ready` gesetzt. Beides fällt zusammen (Abstand unter 0,1 s).

**Was der Hauptthread beim Start tut** (Profil am Handy CPU 4×, ohne Netzdrossel, Last 2,5; bereit nach 2,1 s; 9 lange Aufgaben, die längste 0,54 s):

| Posten | Zeit |
|---|---|
| Acht Beispiel-Loops fertig machen (`src/samples.js`: Ausklang falten, Spitze suchen, Pegel setzen, Wellenform-Spitzen; die Klangberechnung selbst läuft nebenher) | 346 ms |
| Stile berechnen und Layout (249 kB CSS, rund 10 400 Elemente) | 368 ms |
| Arranger aufbauen und Wellenformen zeichnen (`src/ui/arranger.js`) | 191 ms |
| HTML lesen | 98 ms |
| Module übersetzen und ausführen | rund 110 ms |
| Raumlicht-Shader anlegen (`src/ui/room-shader.js`) | 45 ms |
| Regal mit 545 Zeilen aufbauen (`src/ui/library.js`) | 43 ms |

Die synthetischen Loops werden also **nicht** alle beim Start gerendert, nur die acht des Songs. Krachwerk startet ohne diesen Posten (bereit nach 1,46 s im selben Profil).

**Erster Ton** (3 Läufe, Last 2,2–2,7):

| | Desktop | Handy, 4G | Handy, langsames 4G | Einordnung |
|---|---|---|---|---|
| Erstes Abspielen (Ton-Kontext aufbauen) | 23 ms | 96 ms (83–110) | 103 ms (98–125) | gut |
| Vorhören: synthetischer Loop (wird erzeugt) | 74–170 ms | 139–259 ms | 159–250 ms | gut |
| Vorhören: Katalog-Loop, erstes Mal (Datei 309 kB + Dehnen, lädt dabei rund 20 Rechen-Module nach) | 169 ms | 839 ms (829–868) | 2 537 ms (2 509–2 560) | gut / grenzwertig / schlecht |
| Vorhören: Katalog-Loop, jedes weitere Mal | 78 ms | 529 ms | 1 987 ms | gut / grenzwertig / schlecht |
| Vorhören: Einzelklang aus einem Paket | 56 ms | 594 ms | 2 583 ms | gut / grenzwertig / schlecht |
| Vorhören: schon geladen | 1 ms | 4 ms | 4 ms | gut |

Alle Sounds bereit: Die Grundausstattung (75 Sounds, 119 Dateien, 52,5 MB unkomprimiertes WAV) ist am Desktop nach 2,9 s da; alle 545 Sounds nach weiteren 28 s. Die App wartet darauf nicht, nur die Tests tun es.

### 2.2 Bedienung im Betrieb

Alle Werte **ohne Licht** (siehe Vorbehalt 1), je 3 Läufe, Last 5–15. „Beispiel“ ist das mitgelieferte Arrangement (8 Spuren, 8 Clips). „448 Clips“ ist ein Mess-Song mit 16 Spuren und 448 eintaktigen Clips. Angabe „Skript / bis Bild“: Rechenzeit der Aktion / Zeit, bis das Ergebnis zu sehen ist.

| Vorgang | Desktop, Beispiel | Desktop, 448 Clips | Handy, Beispiel | Handy, 448 Clips |
|---|---|---|---|---|
| Stillstand: Bilder/s · Hauptthread belegt | 60 · 11 % | 55 · 81 % | 60 · 46 % | **13,5 · 98 %** |
| Abspielen: Bilder/s · lange Aufgaben in 5 s | 60 · 0 | 26,5 · 11 | 60 · 0 | **7,7 · 38** |
| Scrollen beim Abspielen: Bilder/s | 59 | 15,5 | 59 | 8,7 |
| Zoom, ein Schritt: Skript / bis Bild | 18 / 39 ms | 616 / 855 ms | 100 / 169 ms | **2 969 / 4 058 ms** |
| Clip ziehen (Maus): Bilder/s | 60 | 41 | – | – |
| Clip loslassen: bis Bild | 61 ms | **1 013 ms** | – | – |
| Clip verschieben (eine Aktion): Skript / bis Bild | 4 / 31 ms | 38 / 121 ms | 19 / 48 ms | 137 / 407 ms |
| Rückgängig: Skript / bis Bild | 4 / 31 ms | 37 / 113 ms | 21 / 55 ms | 129 / 343 ms |
| Fach öffnen (Mixer): Skript / bis Bild | 14 / 31 ms | 69 / 121 ms | 52 / 109 ms | 311 / 517 ms |
| Fach fährt auf: Bilder/s | 30 | 17 | 37 | 5,4 |
| Schublade am Griff ziehen: Bilder/s | – | – | 58 | 10 |
| Suchen im Regal, je Zeichen: Skript / bis Bild | 4 / 32 ms | 6 / 83 ms | 15 / 31 ms | 20 / 137 ms |
| Tempowechsel beim Abspielen: Sounds des Songs fertig nach · längste Aufgabe | 0,33 s · unter 72 ms | 1,7 s · 509 ms | 0,64 s · 85 ms | **5,7 s · 1 717 ms** |
| Beat-Editor, ein Feld tippen: hörbar nach · Bilder/s dabei | 45 ms · 34 | 139 ms · 15 | 163 ms · 43 | 475 ms · 6,8 |

Einordnung: Mit dem Beispiel-Arrangement ist fast alles gut; grenzwertig sind am Handy der Zoom-Schritt (100 ms Skript, je Schritt eine lange Aufgabe von rund 146 ms), das Öffnen eines Fachs (109 ms) und das Tippen im Beat-Editor (lange Aufgaben bis 74 ms). Mit dem großen Song ist am Handy alles schlecht, am Desktop Zoom, Loslassen und Tempowechsel.

**Wie der Arranger mit der Clip-Zahl skaliert** (16 Spuren, Licht aus, 3 Läufe, Last 7–13):

| Clips (davon sichtbar: Desktop / Handy) | Alles neu zeichnen, Skript: Desktop / Handy | Ein Zoom-Schritt, Skript: Desktop / Handy | Ein Clip geändert, Skript: Desktop / Handy (neu gebaute Clips) | Speicher der Leinwände am Handy: Zoom 24 → Zoom 192 |
|---|---|---|---|---|
| 20 (10 / 9) | 30 ms / 216 ms | 58–202 ms / 445–599 ms | 7 ms / 42 ms (2) | 39 → 58 MB |
| 200 (24 / 9) | 170 ms / 994 ms | 282–480 ms / 1,5–2,6 s | 19 ms / 69 ms (13) | 58 → 460 MB |
| 448 (48 / 18) | 333 ms / 1,8 s | 580–667 ms / 2,8–4,6 s | 26 ms / 125 ms (28) | 62 → 496 MB |
| 1 000 (84 / 27) | 867 ms / 3,5 s | 1,2–1,4 s / 4,4–6,2 s | 63 ms / 246 ms (63) | 70 → 557 MB |

Antwort auf die Frage „alles oder nur Geändertes?“: Bei einer Änderung an einem Clip wird die **ganze Spur** neu gebaut (alle Clips dieser Spur), die anderen Spuren nicht. Bei jedem **Zoom-Schritt** und nach jedem **Ziehen mit der Maus** wird **alles** neu gebaut. Es werden immer alle Clips gebaut und gezeichnet, auch die 90 % außerhalb des Bildes. Die Kosten wachsen gleichmäßig mit der Clip-Zahl (Desktop rund 0,8 ms je Clip, Handy rund 3,5–4 ms).

**Was kostet das Licht?**

| | Desktop, Beispiel | Handy, Beispiel | Desktop, 448 Clips | Handy, 448 Clips |
|---|---|---|---|---|
| Stillstand, Bilder/s: mit Licht → ohne | 27,5 → 60 | 59 → 60 (Hauptthread 71 % → 46 %) | 7,3 → 55 | 11 → 13,5 |
| Abspielen, Bilder/s: mit Licht → ohne | 13,8 → 60 | 9,3 → 60 | 3,7 → 26,5 | 1,5 → 7,7 |
| Rechenzeit von `glow.js` je Bild beim Abspielen (eigene Messung der App, `glow.state.cost`) | 7,4 ms | 13,9 ms | 47,9 ms | – |
| Anteil „Layout“ am Hauptthread beim Abspielen: mit Licht / ohne | 4 % / 3 % | 8 % / 8 % | 31 % / 2 % | 31 % / 2 % |

Die Bildraten „mit Licht“ sind die eines Geräts **ohne Grafikkarte**; auf einem Handy mit Grafikchip wird der Shader viel billiger sein. Unabhängig von der Grafikkarte ist die Rechenzeit im Hauptthread (dritte und vierte Zeile).

**Dauerarbeit im Stillstand – Versuch.** Ich habe nur in der Messung die Deck-Anzeige so umgestellt, dass sie Texte, Abspielmarke und Pegel nur anfasst, wenn sich der Wert geändert hat (Handy CPU 4×, Licht aus, 3 Läufe, Last 9–14):

| | Stillstand: Hauptthread belegt · Layouts je Sekunde | Abspielen: Hauptthread · Bilder/s |
|---|---|---|
| Beispiel, wie ausgeliefert (ohne Licht) | 44 % (37–49) · 59 | 63 % · 58 |
| Beispiel, Anzeige nur bei Änderung | **4 %** · 0 | 44 % · 58 |
| 448 Clips, wie ausgeliefert (ohne Licht) | 98 % · 20 (nur 20 Bilder/s) | 96 % · 10 |
| 448 Clips, Anzeige nur bei Änderung | **7 %** · 0 (60 Bilder/s) | 98 % · 14 |
| 448 Clips, zusätzlich Clips außerhalb des Bildes vom Zeichnen ausgenommen (`content-visibility`) | – | 98 % · **25**, kein verspäteter Takt mehr |

Am Desktop bestätigt sich der Stillstand in zwei Reihen (Beispiel 10–12 % → 1–2 %, 448 Clips 54–67 % → 2 %). Der letzte Versuch (`content-visibility`) half nur am Handy. Am Desktop brachte er in zwei Reihen bei Last 12–19 nichts (30–39 → 21–22 Bilder/s); vermutlich, weil dort mehr Clips im Bild sind und die Abgrenzung selbst kostet. Er zeigt also die Richtung, ist aber nicht die Lösung.

### 2.3 Audio-Last

**Scheduler** (Handy CPU 4×, Licht aus, 3 Läufe, Last 10):

| Clips | Kosten eines Takts: Median / 95 % / höchster | größter Abstand zwischen zwei Takten | verspätete Takte in 4 s |
|---|---|---|---|
| 8 | 0,1 / 0,9 / 7,8 ms | 82 ms | 0 |
| 200 | unter 0,1 / 2,4 / 14,8 ms | 133 ms | 0 |
| 448 | unter 0,1 / 3,9 / 16,6 ms | 157 ms | 0 (0–4) |
| 1 000 | unter 0,1 / 3,7 / 18,1 ms | 278 ms | 16 |

Der Takt selbst ist billig (gut). Das Problem ist der Abstand: Der Takt läuft im Hauptthread und kommt nur dran, wenn dort gerade nichts anderes läuft.

**Stört Arbeit im Hauptthread die Wiedergabe?** Großer Song (448 Clips) läuft, dabei wird bedient (Handy CPU 4×, Licht aus, 3 Läufe, Last 10). „Verspätet“ heißt: Der Scheduler war hinter der Uhr, Clip-Einsätze in dieser Zeit beginnen zu spät.

| Was nebenher passiert | größter Abstand zwischen zwei Takten | Einsätze verspätet um bis zu | Einordnung |
|---|---|---|---|
| nichts | 125 ms (115–143) | 0 ms | grenzwertig |
| Speichern (`localStorage`) | 126 ms | 0 ms | grenzwertig |
| Rückgängig | 147 ms | 1 ms (0–10) | grenzwertig |
| Spur-Effekt einschalten | 410 ms | 262 ms | schlecht |
| Clip verschieben | 443 ms | 300 ms | schlecht |
| Mixer öffnen und schließen | 709 ms | 558 ms | schlecht |
| Tempo 120 → 133 | 1 524 ms (920–1 998) | 1 380 ms | schlecht |
| Zoomen | 2 792 ms | 2 639 ms | schlecht |
| Mastering eingeschaltet (Analyse läuft 34 s im Hintergrund) | 533 ms | 381 ms, 40 verspätete Takte | schlecht |

Mit dem Beispiel-Arrangement bleiben alle Abstände am Handy unter 125 ms (Abspielen 48 ms, Tempowechsel 100 ms, Beat-Editor 124 ms): kein verspäteter Einsatz, aber ohne Reserve. Am Desktop mit 448 Clips: Tempowechsel 555 ms Abstand, Einsätze bis 0,4 s zu spät.

**Audio-Knoten und Aufbau** (Desktop, ungedrosselt):

| | Knoten | `buildMix` |
|---|---|---|
| je Stimme (ein klingendes Clip-Stück) | 2, mit Hüllkurve 3 | – |
| Summe ohne Spuren | 13 | – |
| je Spur ohne Effekte | 8, in der Wiedergabe zusätzlich 2 Pegelmesser | – |
| je Spur mit allen 7 Effekten | 58 (davon 21 Filter, 3 Kennlinien-Knoten, 1 Faltungshall) | rund 35 ms |
| 16 Spuren ohne Effekte | 141 | 2,8 ms |
| 16 Spuren, alle Effekte | 941 | 575 ms (353–942) |
| 16 Spuren, alle Effekte, Sends, Mastering | 989 | 1 063 ms (740–1 287) |
| Erstes Abspielen dieses Songs (Ton-Kontext mit allem) | 1 031 | **2,9 s** |

**Rechenlast des Tons** (Offline-Rendern, bester von 2 Läufen, 2 Reihen bei Last 10–12; Maß: wie viel Prozent eines Kerns der Testmaschine das Rendern in Echtzeit bräuchte):

| Auf allen Spuren … | 8 Spuren, Reihe 1 | 8 Spuren, Reihe 2 | 16 Spuren (beide Reihen) |
|---|---|---|---|
| keine Effekte | 6 % | 3 % | 5–10 % |
| Filter / EQ / Pumpen / Echo (je einzeln) | 8–13 % | 5–6 % | – |
| Kompressor | 25 % | 7 % | – |
| Verzerrer | **50 %** | **50 %** | – |
| Hall je Spur | **65 %** | **79 %** | 108–157 % |
| Hall nur als Send-Bus (ein Hall für alle) | 27 % | 10 % | 11–15 % |
| alle Effekte außer Hall | 83 % | 76 % | – |
| alle 7 Effekte je Spur | 159 % | 172 % | 216–297 % |

Über 100 % heißt: Das Rendern dauert länger als das Stück, in Echtzeit ist es nicht zu schaffen.

Aussetzer in Echtzeit, gemessen mit `AudioContext.playbackStats` (Zeit, in der die Tonausgabe nichts bekam); `renderCapacity` gibt es in diesem Browser nicht:

| Song | Aussetzer |
|---|---|
| 8 oder 16 Spuren ohne Effekte | 0 |
| 16 Spuren, Hall auf 12 davon (Last 2) | 0 |
| 16 Spuren, Hall auf allen (Last 2) | 0,27 s in 6,3 s (4 %) |
| 16 Spuren, Hall + Kompressor + EQ auf allen (Last 2) | 2,6 s in 8,6 s (30 %) |
| 8 Spuren, alle Effekte und Sends (Last 8–12, zwei Reihen) | 0,7–1,0 s in 9 s |
| 16 Spuren, alle Effekte und Sends (Last 8–12, zwei Reihen) | 8–9 s in 12–14 s |

Ab wann droht ein Aussetzer? Auf der Testmaschine ab etwa 12–16 Spuren mit eigenem Hall oder 8 Spuren mit allen Effekten. Ein Mittelklasse-Handy rechnet je Kern grob ein Drittel so schnell (hochgerechnet, nicht gemessen): Dort liegt die Grenze bei etwa **4–5 Spuren mit eigenem Hall** oder 2–3 Spuren mit allen Effekten. Ohne Effekte sind 16 Spuren auch am Handy unkritisch.

**Export** (Beispiel-Arrangement auf 56 Takte verlängert = 115 s Audio, Licht aus, 3 Läufe, Last 3–9):

| | Desktop: Dauer · längste Blockade · Bilder/s dabei | Handy CPU 4×: Dauer · längste Blockade · Bilder/s dabei | Einordnung |
|---|---|---|---|
| WAV | 3,9 s · keine · 60 | 5,1 s · keine · 60 | gut |
| WAV mit Mastering | 13,8 s · 0,18 s · 59 | 15,6 s · 0,69 s · 55 | grenzwertig |
| Stems (7 Spuren, ZIP 141 MB) | 7,1 s · 0,25 s · 43 | 17,0 s · 1,05 s · 25 | schlecht am Handy |
| MP3 | 11,0 s · 0,74 s · 22 | **35,7 s · 3,1 s · 7** | schlecht |

Beim WAV-Export bleibt die Seite bedienbar, beim MP3-Export am Handy friert sie zwölfmal für bis zu 3 s ein.

### 2.4 Speicher

| Messung | Wert | Einordnung |
|---|---|---|
| JS-Heap nach dem Start (Loopwerk / Krachwerk) | 4,1 MB / 3,6 MB | gut |
| Klangdaten nach dem Start (Loopwerk / Krachwerk) | 14,8 MB (8 Loops, 42 s Stereo) / 0 MB | gut |
| DOM nach dem Start (Loopwerk / Krachwerk) | 10 358 Elemente, 2 302 Listener / 5 376, 719 | viel, siehe 5.3 |
| Nach typischer Sitzung (abspielen, 12 Sounds vorhören, 6 Clips, Mixer, Export, Beat, 3 Tempowechsel, 30 Änderungen) | Heap 5,9 MB, Klänge 30 MB (21 geladen) | gut |
| Grundausstattung geladen (75 Sounds) | 115,5 MB | grenzwertig |
| Alle 545 Sounds je einmal benutzt | **646 MB** (869 Puffer, 24 min Stereo) | schlecht |
| Rückgängig-Verlauf: ganze Schnappschüsse als Text, höchstens 200 | 8 Clips: 0,3 MB · 448 Clips: 8,3 MB (Heap +17 MB) · 1 000 Clips: 18 MB (Heap +37 MB) | gut / gut / grenzwertig |
| Eine Änderung durch alle Zuhörer des Stores (Desktop) | 3–4 ms, höchster Wert 160 ms bei 1 000 Clips | gut |
| 10 Tempowechsel mit 75 geladenen Sounds | 115,5 → 105,1 MB | gut: alte Fassungen werden freigegeben |
| Leinwände des Arrangers am Handy, 448 Clips | 62 MB bei Zoom 24, 496 MB bei größtem Zoom | schlecht |
| Krachwerk: 10 Aufnahmen zu je 8 s | IndexedDB +7,7 MB; im Speicher 30,7 MB (jeder Klang liegt doppelt: Original und Spielfassung) | gut |
| Krachwerk: Schreibzeit je Aufnahme (Desktop / Handy CPU 4×) | 58 ms (41–77) / 154 ms (131–191) | gut |
| Krachwerk: Neustart mit 10 Aufnahmen (Handy CPU 4×) | bereit nach 1,06 s; nur die 4 Sounds im Song werden geladen (11,3 MB) | gut |
| Projekt speichern (`localStorage`) | unter 2 ms auch bei 1 000 Clips (91 kB) | gut |
| Arbeitsspeicher der Seite nach 60 Offline-Rendern (eigener Prozess, nach erzwungener Müllabfuhr): ohne Worklet / mit Mastering-Worklet | 207 → 188 MB / 210 → **561 MB** | gut / schlecht, siehe 5.8 |

**Lecks:** Je zehnmal Abspielen/Stopp, Mixer, Export, Sample-Editor, Pattern-Editor auf und zu, Clip aus- und abwählen, Clip hinzufügen und löschen, Regal durchsuchen. Danach waren die Zahl der DOM-Elemente (±6), der Listener (unverändert), der Leinwände (unverändert) und der Stimmen (0) gleich, der Heap wuchs um höchstens 0,2 MB je Reihe. **Keine Lecks gefunden.**

### 2.5 Auslieferung

**GitHub Pages:** Von hier nicht prüfbar, der Zugriff auf `storlach.github.io` ist gesperrt (Antwort 403 vom Proxy). Aus `tools/build-pages.cjs` folgt sicher: Die Dateien werden unverändert kopiert, also ungebündelt, nicht verkleinert, ohne Prüfsumme im Dateinamen. Nach allgemein bekanntem Verhalten von GitHub Pages (nicht gemessen): gzip für Text, keine Kompression für WAV, HTTP/2, `Cache-Control: max-age=600` für alles. So habe ich es nachgestellt. Folge: Nach zehn Minuten fragt der Browser bei jedem Besuch für alle 102 Dateien nach, ob sie noch aktuell sind. Das kostet am Handy mit 4G fast nichts (1,65 s statt 1,61 s) und mit langsamem 4G 0,3 s. Das ist in Ordnung.

Mit ausgeliefert werden auch 54 MB WAV-Einzeldateien (`assets/samples/vcsl`), die die App nie lädt, weil sie dieselben Klänge aus den Paketen (`assets/packs`) holt. Das stört keinen Nutzer, nur den Umfang der Veröffentlichung.

**Service Worker in Krachwerk** (das Stück, das die App ohne Netz starten lässt). Der Fall „Speicher des Browsers abgelaufen“ ist mit `max-age=0` nachgestellt, denn sonst liefert der gewöhnliche Browser-Speicher zehn Minuten lang alles selbst:

| Vorgeschichte | Start ohne Netz | Was ohne Netz fehlt |
|---|---|---|
| 1 Besuch mit Netz | **scheitert** (leere Seite) | alles: Der Service Worker meldet sich erst am Ende des Starts an, die Dateien des ersten Besuchs landen nicht in seinem Speicher (3 Einträge) |
| 2 oder 3 Besuche mit Netz | gelingt (106 Einträge) | Aufnahme-Worklet (**Aufnehmen geht nicht**: „Failed to load worklet module“), Mastering-/Lo-Fi-Worklet, Rechen-Worker, Zerlegen (`cut-sound.js`), MP3-Encoder |
| 2 Besuche, dabei einmal abgespielt, aufgenommen und gerechnet | gelingt (108 Einträge) | Rechen-Worker, Zerlegen, MP3-Encoder (lange Rechnungen laufen dann im Hauptthread) |

Zweiter Start mit Netz, innerhalb der zehn Minuten (Handy CPU 4×, 3 Läufe): mit Service Worker bereit nach **1,03–1,24 s**, ohne Service Worker (nur Browser-Speicher) nach **0,67 s**. Der Service Worker macht den Wiederbesuch also um 0,4–0,6 s langsamer, weil er jede der gut 100 Dateien erst beim Netz anfragt und danach erneut in seinen Speicher schreibt.

### 2.6 Entwicklung: die Testkette

Ganze Kette einmal durchlaufen (67 Dateien nacheinander, Last 2–4): **31,5 Minuten** (schlecht). 66 Dateien grün, eine rot: `v20` (2 von 34 Prüfungen: „Handy: Fader senkrecht ziehen“ und „Panorama-Drehregler“). Dieser Stand gilt für meinen Arbeitsbaum; auf `main` läuft die Kette inzwischen über `tools/test.cjs`.

| Die zehn längsten | Dauer |
|---|---|
| `v213-aufnahme` | 150 s |
| `contrast` | 107 s |
| `ui-paket` | 86 s |
| `werkstatt` | 75 s |
| `master-fxpad` | 69 s |
| `tablet` | 65 s |
| `takes-loop` | 53 s |
| `editor-kopf` | 53 s |
| `ambient` | 48 s |
| `v18` | 48 s |

Zusammen sind das 12,6 von 31,5 Minuten. Gezählt im Code: 113 Browser-Starts (`openApp`), 644 feste Wartezeiten (`waitForTimeout`, zusammen 265 s, also 4,4 Minuten reines Warten) und 263 Bedingungs-Warten (`waitForFunction`).

## 3. Kritisch

### 3.1 Der Arranger baut und zeichnet immer alle Clips

**Problem.** Jeder Clip ist ein eigenes Element mit acht Griffen und einer eigenen Leinwand in voller Clip-Breite (`src/ui/arranger.js:641` `drawWave`, `:738` `makeClip`). Es gibt keinen Ausschnitt: Auch was außerhalb des Bildes liegt, wird gebaut und gezeichnet (448 Clips: 18 am Handy sichtbar). Der Schlüssel, der über „neu bauen“ entscheidet, enthält die Zoomstufe (`:787` `laneKey`), also baut **jeder Zoom-Schritt alles neu**. Nach jedem Ziehen mit der Maus wird ebenfalls alles neu gebaut (`forceAll = true` in `:932`, `:970`, `:1045`). Gemessen: ein Zoom-Schritt am Handy 0,1 s mit dem Beispiel (8 Clips), 0,45–0,6 s mit 20 langen Clips, **2,8–4,6 s mit 448 Clips**; am Desktop 0,6 s. Loslassen nach dem Ziehen am Desktop 1,0 s bei 448 Clips. Abspielen eines großen Songs am Handy 7,7 Bilder/s, selbst der Stillstand nur 13,5. Die Leinwände belegen am Handy bei 448 Clips 62 MB und wachsen beim Hineinzoomen auf 496 MB.

**Auswirkung.** Mit zwei Fingern zoomen ruckt schon bei kleinen Songs und ist bei größeren unbrauchbar; je größer der Song, desto zäher wird alles andere mit (Fächer, Rückgängig, Tempo). Der Leinwand-Speicher liegt beim Hineinzoomen über dem, was mobile Browser für Zeichenflächen hergeben (bei iOS-Safari nach meiner Kenntnis einige hundert MB; hier nicht messbar): Dann bleiben Wellenformen leer oder die Seite wird neu geladen.

**Richtung.** Nur die Clips im Bild (plus etwas Rand) bauen und zeichnen, Wellenformen höchstens in Bildbreite, und den Zoom zuerst als reine Größenänderung der vorhandenen Elemente ausführen, das genaue Neuzeichnen danach. Der Versuch mit `content-visibility` (2.2) zeigt am Handy die Größenordnung (Abspielen 10 → 25 Bilder/s, kein verspäteter Takt mehr); als bloße CSS-Zeile reicht er nicht, am Desktop half er nicht.

**Aufwand:** groß (Umbau des Zeichnens im Arranger; kein Build-Schritt und keine neue Abhängigkeit nötig).

### 3.2 Der Takt der Engine hängt am Hauptthread – jede lange Aufgabe wird hörbar

**Problem.** Der Scheduler plant nur 150 ms voraus und wird alle 25 ms angestoßen (`src/engine.js:11` `LOOKAHEAD`, `:15` `TICK_MS`). Der Worker in `createTicker` (`:590`) schickt nur das Signal; geplant wird im Hauptthread (`_tick`, `:851`). Ist der Hauptthread länger als etwa 125 ms belegt, fällt der Scheduler hinter die Uhr. Einsätze, die in diese Lücke fallen, starten dann sofort, also zu spät, und bleiben für die Länge des Stücks neben dem Takt (`startVoice`, `:408`, startet in der Vergangenheit liegende Einsätze ohne Ausgleich). Gemessen am Handy mit großem Song: Clip verschieben 443 ms Abstand (Einsatz bis 0,3 s zu spät), Effekt einschalten 410 ms, Mixer öffnen 709 ms, Tempowechsel 1,5 s, Zoomen 2,8 s; am Desktop Tempowechsel 555 ms. Schon das reine Abspielen des großen Songs liegt am Handy bei 125 ms, genau an der Grenze.

**Auswirkung.** Während man am laufenden Song arbeitet, stolpert der Takt: einzelne Clips setzen hörbar zu spät ein, bei Tempowechsel und Zoom bleibt der Ton bis zu Sekunden stehen. Das widerspricht dem Grundsatz „der Ton geht vor“. Mit kleinen Songs tritt es heute noch nicht auf, weil dort keine Aufgabe über 125 ms dauert.

**Richtung.** Den Vorlauf vergrößern (etwa 0,5 s; geänderte Clips tauscht `_resync` im schon geplanten Fenster heute bereits aus) und verspätete Einsätze mit passendem Versatz im Klang starten statt verspätet von vorn. Vor einer Änderung den Skill `audio-engine-regeln` laden und Timing nachmessen.

**Aufwand:** klein bis mittel. Die Ursache der langen Aufgaben selbst beseitigen 3.1 und 4.5.

### 3.3 Die Oberfläche arbeitet in jedem Bild, auch wenn nichts passiert

**Problem.** `frame()` in `src/ui/transport.js:102` läuft 60-mal je Sekunde, immer, und schreibt jedes Mal drei Texte der Anzeige neu, setzt die Abspielmarke, liest dafür eine Breite aus dem Layout (`src/ui/arranger.js:899`, `phGrip.offsetWidth`) und zeichnet den Pegelmesser mit 24 Stil-Abfragen neu (`transport.js:119`). Der Browser muss deshalb in jedem Bild das Layout neu rechnen: gemessen 59 Layouts und 117 Stilrechnungen je Sekunde **im Stillstand**. Dazu kommen vier weitere Dauerschleifen (Bildmarke, Licht, Mixer-Pegel, Beat-Editor). Am Handy ist der Hauptthread im Stillstand zu 44 % belegt (Beispiel), mit Licht zu 69 %, mit großem Song zu 98 % bei nur 13–20 Bildern/s. Im Versuch (Anzeige nur bei Änderung anfassen) sinkt das auf **4 %** bzw. **7 %** bei 60 Bildern/s.

**Auswirkung.** Das Handy wird warm und der Akku leert sich, während die App nur offen ist. Jede Eingabe trifft auf einen schon beschäftigten Hauptthread; bei großen Songs ruckelt die App, bevor man irgendetwas tut.

**Richtung.** In den Dauerschleifen nur schreiben, wenn sich der Wert geändert hat, Maße einmal merken statt je Bild zu lesen, und die Schleifen im Stillstand ruhen lassen.

**Aufwand:** klein (wenige Zeilen in `transport.js`, `arranger.js`, `brand-meter.js`). Größter Gewinn je Stunde Arbeit in diesem Bericht.

## 4. Wichtig

### 4.1 Das Licht belastet den Hauptthread – und ohne Grafikkarte bricht alles ein

**Problem.** Zwei getrennte Dinge. Erstens, unabhängig vom Gerät: `draw()` in `src/ui/glow.js:143` setzt beim Abspielen in jedem Bild Stile an den Spuren und liest danach Maße aus dem Layout (`:207`–`:235`: `offsetTop`, `offsetHeight`, `offsetParent` je Spur). Das erzwingt in jedem Bild eine volle Layout-Rechnung: Layout-Anteil am Hauptthread 31 % mit Licht gegen 2 % ohne (448 Clips). Die App misst selbst 7,4 ms je Bild am Desktop, 13,9 ms am gedrosselten Handy und 47,9 ms mit 448 Clips; für 60 Bilder/s sind insgesamt 16,7 ms erlaubt. Zweitens, nur ohne Grafikkarte: Der Shader läuft auch im Stillstand mit 15 Bildern/s weiter (`:153`) und kostet dann fast den ganzen Hauptthread (Desktop: 27,5 statt 60 Bilder/s im Stillstand, 13,8 beim Abspielen).

**Auswirkung.** Auf Geräten mit Grafikchip kostet das Licht beim Abspielen spürbar Bildrate, sobald der Song größer wird. Auf Geräten, deren Browser WebGL in Software rechnet (ältere Android-Geräte mit gesperrtem Treiber, Fernzugriff, virtuelle Rechner), ist die ganze App zäh, auch im Stillstand. Wie viele Nutzer das trifft, kann ich nicht messen.

**Richtung.** Maße der Spuren nur bei Layout-Änderungen merken (das Ereignis `arr-layout` gibt es schon), im Stillstand nichts zeichnen, und bei erkanntem Software-Renderer (`shader.software` ist schon bekannt) auf das einfache Canvas-Licht oder ganz aus schalten.

**Aufwand:** mittel.

### 4.2 Krachwerk ohne Netz: startet erst nach dem zweiten Besuch, und Aufnehmen fehlt

**Problem.** Der Service Worker (`src/werkstatt/sw.js`) kennt keine Liste der nötigen Dateien. Er merkt sich nur, was nach seiner Anmeldung zufällig geladen wird, und die Anmeldung geschieht erst am Ende des Starts (`src/pwa.js:13`, aufgerufen spät in `boot()`). Gemessen (2.5): Nach einem Besuch scheitert der Start ohne Netz. Nach zwei Besuchen startet die App, aber das Aufnahme-Worklet fehlt, solange man nicht schon einmal mit Netz aufgenommen hat; ebenso Mastering-Worklet, Rechen-Worker, Zerlegen und MP3. Außerdem fragt er bei jedem Start zuerst das Netz („Netz zuerst“): Der Wiederbesuch dauert 1,0–1,2 s statt 0,67 s.

**Auswirkung.** Wer Krachwerk auf den Startbildschirm legt und unterwegs ohne Netz öffnet, sieht entweder nichts oder kann nicht aufnehmen. Aufnehmen ist der Kern von Krachwerk.

**Richtung.** Beim Einrichten des Service Workers eine feste Liste aller Dateien vorab speichern (Module, beide Worklets, Worker, Zerlegen, MP3-Encoder), dann aus dem Speicher antworten und im Hintergrund auffrischen; die Liste kann `tools/werkstatt-page.cjs` erzeugen, das die Seite ohnehin baut.

**Aufwand:** klein bis mittel. Kein Build-Schritt im engeren Sinn, aber die erzeugte Dateiliste ist ein neuer Schritt in `tools/werkstatt-page.cjs`; das sollte der Architekt kurz bestätigen.

### 4.3 Hall und Verzerrer je Spur sind so teuer, dass am Handy wenige Spuren reichen

**Problem.** Jede Spur mit eingeschaltetem Hall bekommt einen eigenen Faltungshall mit über 2 s langer Impulsantwort (`src/effects.js:404`–`:415`). Der Verzerrer rechnet mit vierfacher Überabtastung (`:206`, `:231`). Gemessen für 8 Spuren: Hall 65–79 % eines Kerns, Verzerrer 50 %, alle sieben Effekte 159–172 %; die übrigen fünf Effekte zusammen 15–35 Prozentpunkte. Ein Hall für alle über den Send-Bus kostet 10–15 % (ein Ausreißer: 27 %), gleich für 8 oder 16 Spuren. In Echtzeit setzt der Ton auf der Testmaschine ab 16 Spuren mit Hall aus, mit allen Effekten ab 8 Spuren. Der Aufbau ist ebenfalls teuer: `buildMix` mit 16 Spuren und allen Effekten blockiert 0,6–1,1 s, das erste Abspielen eines solchen Songs dauert 2,9 s (Desktop).

**Auswirkung.** Am Handy (hochgerechnet) Knackser und Aussetzer ab etwa 4–5 Spuren mit eigenem Hall. Die App warnt nicht und begrenzt nichts.

**Richtung.** Den Hall an der Spur auf den vorhandenen Send-Bus lenken (ADR 008 hat ihn dafür eingeführt) oder die Impulsantwort für Spur-Hall kürzen, und die Überabtastung des Verzerrers auf zweifach senken, wo es der Klang erlaubt. Beides ändert den Klang: nur mit Messung nach Skill `audio-test` und Ohr-Feedback.

**Aufwand:** mittel.

### 4.4 MP3-Export und Stems frieren die Seite ein

**Problem.** Der MP3-Encoder läuft im Hauptthread und gibt nur alle 20 Blöcke ab, das sind rund 10 s Audio am Stück (`src/export.js:50`–`:57`). Gemessen für 115 s Audio: Desktop 11 s mit Blockaden bis 0,74 s, Handy **35,7 s mit zwölf Blockaden bis 3,1 s**. Bei Stems blockieren je Spur das WAV-Schreiben und die Spitzensuche (`encodeWav` 0,8 s und `peakOf` 0,4 s am Handy für 112 s Audio; `peakOf` in `export.js:65` läuft mit `for … of` über Millionen Werte): Blockaden bis 1,05 s.

**Auswirkung.** Während des MP3-Exports reagiert am Handy nichts, auch nicht „Abbrechen“; die Fortschrittsanzeige springt in Sekundenschritten.

**Richtung.** MP3-Kodierung, WAV-Schreiben und Spitzensuche über `runJob` in den Rechen-Worker legen; der Encoder (`vendor/lamejs`) muss dafür im Worker ladbar sein.

**Aufwand:** mittel.

### 4.5 Mastering rechnet nach jeder Änderung den ganzen Song neu

**Problem.** Ist Mastering eingeschaltet, rendert `mountMasteringAnalysis` (`src/mastering.js:45`) 1,2 s nach jeder Änderung den ganzen Song offline und misst die Lautheit im Hauptthread (`:23`, 0,3 s am Handy für 112 s Audio). Am Handy dauert die Analyse eines großen Songs 34 s; in dieser Zeit gab es 40 verspätete Takte (bis 0,38 s) und lange Aufgaben bis 0,43 s.

**Auswirkung.** Mit Mastering an stolpert die Wiedergabe nach jeder Kleinigkeit eine halbe Minute lang, und das Handy rechnet dauernd.

**Richtung.** Die Analyse erst bei Stillstand oder nach einer längeren Ruhezeit starten, bei einer neuen Änderung abbrechen, und die Lautheitsmessung in den Worker geben.

**Aufwand:** klein bis mittel.

### 4.6 Geladene Klänge werden nie wieder freigegeben

**Problem.** Jeder einmal vorgehörte Sound bleibt im Speicher (`src/samples.js:2028` `ensure`, `:2048` `s.lazy = false`; es gibt kein Gegenstück), im Schnitt 1,2 MB. Katalog- und eigene Sounds liegen doppelt vor: Original und Spielfassung (`padOneShot`, `:1642`, kopiert auch dann, wenn nichts zu dehnen ist). Gemessen: 12 vorgehörte Sounds +15 MB, Grundausstattung 115 MB, alle Sounds 646 MB.

**Auswirkung.** Wer lange im Regal stöbert (genau dazu lädt Loopwerk ein), füllt am Handy den Speicher; ab einigen hundert MB kann der Browser die Seite neu laden (hier nicht messbar).

**Richtung.** Vorgehörte, aber nicht im Song benutzte Sounds nach einer Obergrenze wieder entladen (zuletzt Benutztes bleibt) und Einzelklänge nicht kopieren, wenn Original und Spielfassung gleich sind.

**Aufwand:** klein bis mittel.

### 4.7 Die Testkette dauert 31,5 Minuten und hängt an der Uhr

**Problem.** Jeder der 113 Browser-Starts wartet auf die ganze Grundausstattung (`tests/harness.cjs:21`, `library.catalogReady`: 52,5 MB WAV laden, dekodieren, dehnen, rund 3 s und mehr). Dazu 4,4 Minuten feste Wartezeiten. In jedem Test läuft das Licht mit Software-Grafik mit und belegt den Hauptthread zu 70–100 %. Mehrere Prüfungen hängen an Zeitgrenzen, die nur auf ruhiger Maschine halten, zum Beispiel `ambient` „≥ 50 Bilder/s“ (`tests/ambient.test.cjs:239`; unter Last habe ich an derselben Stelle 9–48 gemessen) und `tempo-fast` „keine Aufgabe über 50 ms“ und „unter 1,5 s“.

**Auswirkung.** Jede Freigabe wartet eine halbe Stunde; laufen zwei Agenten gleichzeitig, kippen Tests ohne echten Fehler, und rote Ergebnisse verlieren ihre Aussage.

**Richtung.** Tests laden nur die Sounds, die sie brauchen; das Licht ist im Test abschaltbar (außer in `ambient`); feste Wartezeiten werden zu Bedingungen; Zeitgrenzen messen Rechenzeit oder Verhältnisse statt Wanduhr; die Dateien laufen auf den vier Kernen nebeneinander.

**Aufwand:** mittel. Ein Abschalter fürs Licht wäre eine kleine Änderung in `src/` und gehört dem UI-Engineer.

## 5. Feinschliff

### 5.1 Lange Aufgaben beim Start

**Problem.** Bis die App bedienbar ist, laufen am Handy 5–9 lange Aufgaben, die längste 0,47–0,54 s (2.1). Größte Posten: Nachbearbeitung der acht Beispiel-Loops im Hauptthread (346 ms; `bufferPeak`, `scale`, `computePeaks` und das Falten in `renderLoop`, `src/samples.js:1568`–`:1626`), Stile und Layout (368 ms), Arranger (191 ms). **Auswirkung.** Das Ladebild steht 1–1,3 s still, die Balken-Animation ruckt. **Richtung.** Die Nachbearbeitung der Loops in den Worker geben oder je Loop eine Pause lassen; das Regal erst füllen, wenn es geöffnet wird. **Aufwand:** klein bis mittel.

### 5.2 Katalog-Klänge sind unkomprimiert

**Problem.** Alle 562 Dateien sind WAV (134,5 MB im Repo, davon lädt die App höchstens 52,5 MB plus Pakete). Ein Vorhören lädt 0,3 MB oder ein ganzes Paket von bis zu 2,9 MB. **Auswirkung.** Mit langsamem Netz 2–2,6 s bis zum Ton (schlecht), mit 4G 0,5–0,8 s (grenzwertig). **Richtung.** Katalog zusätzlich in einem komprimierten Format ausliefern (etwa ein Achtel der Größe); das ist eine Entscheidung für den Sound-Kurator und den Architekten (Format, Qualität, Erzeugung per Werkzeug). **Aufwand:** mittel.

### 5.3 Das Regal baut sich bei jeder Meldung der Bibliothek ganz neu

**Problem.** `src/ui/library.js:435` ruft bei jedem Ereignis der Bibliothek `render()` auf, das alle 545 Zeilen verwirft und neu baut, auch in zugeklappten Gruppen. Jedes Tippen im Beat-Editor und jeder nachgeladene Sound löst das aus. Ein Durchlauf kostet 15–20 ms am Handy (Suchen je Zeichen, 2.2), das Regal stellt 5 600 der 10 400 Elemente der Seite. **Auswirkung.** Heute kaum spürbar, aber es addiert sich im Beat-Editor zu den langen Aufgaben (bis 74 ms am Handy). **Richtung.** Nur geänderte Zeilen anfassen und zugeklappte Gruppen erst beim Aufklappen füllen. **Aufwand:** klein bis mittel.

### 5.4 Krachwerk lädt Code, den es abgeschaltet hat

**Problem.** Krachwerk lädt dieselben 101 Module, darunter Kataloge, Loop-Definitionen, Starter, KI, Link-Import, Sample-Editor und Tipps: 407 kB entpackt, 79 kB übertragen (16 % des JavaScript). **Auswirkung.** Rund 0,1 s am Handy mit 4G, 0,4 s mit langsamem 4G. **Richtung.** Diese Module in `main.js` je nach Edition erst bei Bedarf nachladen (`import()`), die Vorlade-Zeilen für `/werkstatt/` in `tools/werkstatt-page.cjs` entsprechend kürzen. **Aufwand:** klein bis mittel.

### 5.5 Nach einer Aufnahme rechnet Krachwerk 0,4 s im Hauptthread

**Problem.** `features()` aus `src/dsp/clean.js:130` (Klang beschreiben und einordnen) läuft direkt in `src/recorder.js`, nicht im Worker: 95 ms am Desktop, 400 ms am Handy für 4 s Aufnahme; `cleanTake` 35 ms. **Auswirkung.** Nach ● hängt die Oberfläche kurz, läuft dabei der Loop, kann ein Einsatz zu spät kommen (siehe 3.2). **Richtung.** Über `runJob` in den Worker. **Aufwand:** klein.

### 5.6 Rückgängig speichert ganze Schnappschüsse

**Problem.** Jeder Schritt legt das ganze Projekt als Text ab, bis zu 200 Stück (`src/model.js:453`–`:459`). **Auswirkung.** Heute gut (0,3 MB beim Beispiel), bei 448 Clips 8,3 MB, bei 1 000 Clips 18 MB Text und 37 MB Heap. **Richtung.** Erst handeln, wenn Songs wirklich so groß werden: dann Unterschiede statt Schnappschüsse. **Aufwand:** mittel.

### 5.7 Fächer fahren mit halber Bildrate auf

**Problem.** Ein Fach öffnen kostet am Handy 52 ms Skript und 109 ms bis zum Bild, die Bewegung läuft mit 37 Bildern/s (Desktop 30). Das kann zum Teil an der fehlenden Grafikkarte liegen. **Auswirkung.** Die Schublade wirkt am Handy leicht zäh. **Richtung.** Auf einem echten Gerät nachmessen (Motion-Designer), den Inhalt des Fachs vor der Bewegung aufbauen. **Aufwand:** klein.

### 5.8 Rendern mit Mastering lässt Arbeitsspeicher zurück

**Problem.** Jedes Offline-Rendern mit dem Mastering-Worklet lässt rund 6 MB Arbeitsspeicher zurück, auch nach erzwungener Müllabfuhr (60 Durchläufe: 210 → 561 MB; ohne Worklet bleibt es bei 188 MB; eine Reihe, Last 12). Im Code hält nur eine `WeakMap` den Kontext fest (`src/engine.js:95`), die Ursache liegt also vermutlich im Browser oder an einem Verweis über den Worklet-Knoten; geklärt habe ich sie nicht. Betroffen ist jeder Export mit Mastering, nicht die Hintergrund-Analyse (sie rendert ohne Worklet). **Auswirkung.** Gering: wer zehnmal mit Mastering exportiert, verliert rund 60 MB bis zum Neuladen. **Richtung.** Beim Umbau von 4.5 prüfen, ob der Knoten nach dem Rendern getrennt und sein Port geschlossen wird, und nachmessen. **Aufwand:** klein.

In Ordnung und ohne Handlungsbedarf: die Kosten eines Scheduler-Takts (unter 4 ms bei 95 % der Takte, auch mit 1 000 Clips), Speichern in `localStorage` (unter 2 ms), IndexedDB in Krachwerk (58–154 ms je Aufnahme, 0,8 MB je 8 s), Suchen im Regal, Clip verschieben und Rückgängig bei kleinen Songs, der WAV-Export, die Nachfrage-Runde nach Ablauf des Browser-Speichers.

## 6. Trägt

1. **Laden auf Abruf mit flacher Ladekette.** Kein Klang wird beim Start aus dem Netz geholt, die 101 Module kommen dank vollständiger Vorlade-Liste gleichzeitig. Ergebnis: bedienbar nach 2,2 s am Handy mit 4G beim ersten Besuch, erster Ton 0,1 s nach dem Tippen, und das ganz ohne Build-Schritt. Diese Liste muss vollständig bleiben; fehlt ein Modul, entsteht sofort ein Wasserfall.
2. **Sauberes Aufräumen.** Nach je zehn Durchläufen aller Editoren, von Abspielen/Stopp und zehn Tempowechseln bleiben Elemente, Listener, Leinwände, Stimmen und Klangspeicher gleich. Alte Tempo-Fassungen werden freigegeben (115 → 105 MB). Darauf lässt sich bauen.

## Reihenfolge

Die fünf wirksamsten Maßnahmen, die wirksamste zuerst:

1. **Dauerschleifen beruhigen (3.3), klein.** Erwarteter Gewinn: Hauptthread im Stillstand am Handy von 44 % auf 4 % (Beispiel) und von 98 % auf 7 % (großer Song), dort 60 statt 13–20 Bilder/s; beim Abspielen des Beispiels 63 % → 44 %. Im Versuch gemessen.
2. **Scheduler absichern (3.2), klein bis mittel.** Erwarteter Gewinn: Blockaden bis etwa 0,45 s bleiben unhörbar; damit sind Clip verschieben, Effekt einschalten und Beat-Editor auch im großen Song am Handy ohne verspätete Einsätze. Tempowechsel und Zoom brauchen zusätzlich Punkt 3.
3. **Arranger zeichnet nur, was man sieht (3.1), groß.** Erwarteter Gewinn: Zoom-Schritt am Handy von 2,8–4,6 s auf das Niveau kleiner Songs (Ziel unter 100 ms), Loslassen am Desktop von 1,0 s auf rund 30 ms, Abspielen großer Songs am Handy von 10 auf etwa 25 Bilder/s (Versuch, nur am Handy bestätigt), Leinwand-Speicher von bis zu 496 MB auf unter 70 MB.
4. **Service Worker von Krachwerk mit Dateiliste (4.2), klein bis mittel.** Erwarteter Gewinn: Start ohne Netz schon nach dem ersten Besuch, Aufnehmen ohne Netz, Wiederbesuch 0,67 s statt 1,0–1,2 s.
5. **Licht vom Layout lösen und ohne Grafikkarte abschalten (4.1), mittel.** Erwarteter Gewinn: Layout-Anteil beim Abspielen großer Songs von 31 % auf rund 2 %, 7–48 ms weniger Rechenzeit je Bild; auf Geräten ohne Grafikchip 60 statt rund 10–28 Bilder/s; nebenbei eine schnellere, stabilere Testkette (4.7).

Danach: MP3 und Stems in den Worker (4.4), Mastering-Analyse entkoppeln (4.5), Hall und Verzerrer (4.3), Klänge entladen (4.6), Testkette (4.7).

## Was ich nicht messen konnte

- **Echte Bildraten.** Ohne Grafikkarte sind alle Bildraten Vergleichswerte; was der Shader auf einem Handy mit Grafikchip kostet, weiß ich nicht. Ein Blick mit einem echten Mittelklasse-Handy (Chrome: `chrome://inspect`, Safari: Web-Inspektor) auf Stillstand, Abspielen und Zoom wäre die wichtigste Ergänzung.
- **GitHub Pages selbst.** Kompression, Cache-Kopfzeilen und HTTP-Version der echten Auslieferung (Zugriff gesperrt); nachgestellt nach bekanntem Verhalten.
- **Service Worker unter Netzdrossel.** Die Drossel des Test-Browsers wirkt nicht auf Anfragen, die der Service Worker selbst stellt. Wie lange „Netz zuerst“ bei schlechtem Netz wartet, ist deshalb nur abgeleitet: mindestens so lange wie die Nachfrage-Runde von Loopwerk (2,6 s mit langsamem 4G).
- **Tonlast am Handy.** Die CPU-Drossel erreicht den Ton-Strang nicht; die Grenze „4–5 Spuren mit Hall“ ist mit dem Faktor 3 hochgerechnet. `AudioContext.renderCapacity` gibt es in diesem Browser nicht, gemessen wurde mit `playbackStats` und Offline-Renderzeit. Die Renderzeiten der einzelnen Effekte schwanken unter Last stark (Kompressor 7 % und 25 %); verlässlich sind die beiden großen Posten Hall und Verzerrer.
- **iOS-Safari.** Grenzen für Leinwand-Speicher, Verhalten des Tons im Hintergrund, Speicherdruck.
- **Aufnahme mit echtem Mikrofon.** Gemessen ist nur die Rechenzeit des Säuberns, nicht der Weg vom Tippen auf ● bis zum Clip.
- **Ruhige Maschine.** Fast alle Reihen liefen bei Last 5–16. Die Reihenfolge der Befunde ist davon unberührt (die Unterschiede sind Faktoren, keine Prozente), einzelne Millisekundenwerte können auf ruhiger Maschine 20–40 % besser sein.

## Womit gemessen

Playwright mit Chromium (ohne Bildschirm), Chrome DevTools Protocol: `Emulation.setCPUThrottlingRate` (4), `Network.emulateNetworkConditions`, `Performance.getMetrics`, Tracing mit CPU-Profil, `PerformanceObserver` für lange Aufgaben, `requestAnimationFrame`-Abstände, `Runtime.getHeapUsage`, `Memory.getDOMCounters`, `AudioContext.playbackStats`. Ein eigener kleiner Server stellt GitHub Pages nach (gzip, `max-age`, ETag, HTTP/2). Versuche „was wäre wenn“ liefen über ausgetauschte Dateien nur im Test-Browser (`page.route`), nie im Repo.

Die Skripte und Rohdaten liegen in `/tmp/claude-0/-home-user-loopwerk/8ee5889c-2230-57bc-8dcd-1c8976709290/scratchpad/analyse-performance/` (`m0`–`m8`, Protokolle `log-*.txt`, Ergebnisse `out-*.json`). Dieser Ordner gehört zur Sitzung und ist nicht dauerhaft; wer die Messungen wiederholen will, sollte die Skripte von dort sichern.
