# Bestandsanalyse November 2026: Abschluss

Stand: Vorschau 110. Die vier Berichte liegen daneben: `2026-11-klang.md`, `2026-11-performance.md`, `2026-11-bedienung.md`, `2026-11-konzept.md`.

**Maßstab:** Jemand ohne Vorkenntnisse macht im Browser, am Handy wie am Rechner, in wenigen Minuten einen Song, der druckvoll und fertig klingt; in Krachwerk dasselbe nur mit Selbstgemachtem.

## 1. Umgesetzt

### Klang
| Schritt | Was | Messwert |
|---|---|---|
| Klangfarbe | Sub-Bässe mit Obertönen, Elektro-Kit kräftiger, Stereo in Flächen, Hats und Melodie-Klängen, E-Piano ohne Knacken | Pop am kleinen Lautsprecher −5,9 → −1,7 LU; Elektro-Kick 14 → 77 % Sub |
| Effekte | Schutz-Limiter als echter Spitzenbegrenzer, Kompressor und Verzerrer pegelneutral, Hall hörbar und breit, Echo als Ping-Pong, nur noch eine Fassung je Effekt | Rock-Starter +0,5 → −1,7 dBTP; Kompressor beim Einschalten +5,7…+9,4 → ±1,3 LU; Hall 18–19 → 13 dB unter dem Direktsignal |
| Tempo-Dehnung | Anschläge bleiben unangetastet, gedehnt wird dazwischen | Doppelschläge bei −40 % Tempo 9 → 0; Lage 12 → 4 ms |
| Pegel | Jeder Sound, jedes Kit, jeder Klang auf einer Ziel-Lautheit je Rolle (ADR 013), die Drums führen | Streuung der Drum-Loops 17,8 LU → 0; neuer Beat +6,0 → −2,5 dBFS; dieselbe Melodie über alle Klänge 21,9 → 1,5 LU |
| Mischung | Alle zehn Starter und das Beispiel neu gemischt: Hochpass außer Kick und Bass, hellere Hats, Hall und Echo als Sends, Mastering je Genre | Drums gegenüber Bass im Refrain −12…+2 → +4…+6 LU |

Starter und Beispiel, Takte 1–16, Ausgangsstand → jetzt (`npm run klangvergleich`):

| | Lautheit (LUFS) | Tiefen < 250 Hz | Mitten | Höhen > 4 kHz | Stil |
|---|---|---|---|---|---|
| Pop | −13,0 → −14,0 | 96 → 48 % | 3,5 → 50 % | 0,2 → 1,9 % | ohne → Hell |
| Hip-Hop | −12,0 → −14,0 | 96 → 56 % | 4 → 43 % | 0,1 → 1,0 % | ohne → Ausgewogen |
| House | −17,8 → −11,1 | 85 → 73 % | 13 → 22 % | 2,2 → 5,3 % | ohne → Laut |
| Techno | −14,3 → −10,1 | 91 → 83 % | 8 → 17 % | 0,2 → 0,6 % | ohne → Laut |
| Trap | −15,4 → −10,1 | 90 → 59 % | 10 → 40 % | 0,2 → 0,6 % | ohne → Laut |
| Breaks | −13,9 → −10,2 | 89 → 77 % | 10 → 21 % | 1,0 → 2,6 % | ohne → Laut |
| Lo-Fi | −12,1 → −14,0 | 98 → 83 % | 2 → 17 % | 0,0 → 0,5 % | ohne → Warm |
| Ambient | −10,1 → −14,0 | 75 → 35 % | 25 → 65 % | 0,0 → 0,0 % | ohne → Warm |
| Rock | −12,1 → −14,0 | 64 → 63 % | 35 → 33 % | 1,6 → 4,3 % | ohne → Ausgewogen |
| Melodic Techno | −8,1 → −8,2 | 70 → 72 % | 30 → 28 % | 0,1 → 0,1 % | Club |
| Beispiel | −13,5 → −14,1 | 55 → 60 % | 43 → 36 % | 1,8 → 4,3 % | ohne → Ausgewogen |

Die Takte 1–16 sind Intro und Strophe; im Refrain liegen die Tiefen niedriger (39–74 %).

### Performance (Handy = 390×844, CPU vierfach gedrosselt; Bildraten ohne Grafikkarte nur Vergleichswerte)
| Was | vorher | nachher |
|---|---|---|
| Stillstand, Auslastung des Hauptthreads (Beispiel / 448 Clips) | 44 % / 98 % | Deck, Marke und Pegel schreiben nur bei Änderung |
| Licht: Anteil der Stilrechnung beim Abspielen mit 448 Clips | etwa 25 % | 2–6 % |
| Arranger | baut und zeichnet alle Clips | nur den sichtbaren Bereich |
| Oberfläche hängt 0,3–0,45 s: Ton an falscher Stelle | etwa 1 s | 0 ms |
| Loop-Ende kurz vor der Marke gesetzt | bis 1,3 s falsch | 0 ms |
| MP3-Export, längste Blockade | 2,8 s | 0,46 s |
| Stems-Export, längste Blockade | 1,0 s | 0,39 s |
| Speicher nach Stöbern durch alle 537 Sounds | 646 MB | 165 MB |
| Krachwerk ohne Netz nach einem Besuch | startet nicht | startet, Aufnahme und MP3 gehen (ADR 014) |
| Mastering-Messung | bei jeder Änderung, im Hauptthread | im Hintergrund, nur wenn es die Lautheit betrifft |

### Bedienung
Drei echte Fehler behoben: Der Tipp zur Mehrfachauswahl erscheint am Handy, Ziehen aus dem Regal beendet das Einsetzen, das Clip-Menü bleibt bei 360 px im Bild.

### Werkzeuge
Regel „Skript zuerst“ in `CLAUDE.md`; neue Rolle `performance-engineer`; 49 Skripte: 16 in `tools/`, 7 in `tools/klang/`, 26 Messskripte in `tools/perf/` (Liste in `CLAUDE.md`). Die Testkette (73 Tests) läuft ohne Abbruch und wiederholt Ausfälle selbst.

## 2. Hörproben
Erzeugt mit `npm run hoerprobe`; neu rendern: `node tools/hoerprobe.cjs --starter alle --takte 1-16 --stil wie-gesetzt --out <ordner>`.

| Hören | Worauf achten |
|---|---|
| Pop und Hip-Hop, 32 Takte, am Laptop-Lautsprecher und am Kopfhörer | Führen Kick und Snare vor dem Bass? Sind die Hats hörbar, aber nicht vorlaut? Ist der Hall auf Akkorden und Melodie zu viel oder zu wenig? Bleibt der Bass am Laptop hörbar? |
| House, Techno, Trap, Breaks (Stil „Laut“) | Druck ohne Pumpen oder Kratzen? |
| Rock | Sind die Gitarren zu hell? |
| Ambient | Flächig genug? Echo wandert links-rechts: Ist die erste Wiederholung links zu dominant? |
| Melodic Techno | Klingt er wie abgenommen? |
| Amen Break bei 90 und 170 BPM, alt gegen neu | Flattert die Snare noch? Werden Zwischenschläge verschluckt? |
| In der App: neuer Beat neben einem Drum-Loop aus dem Regal | Etwa gleich laut? |
| In der App: Hall auf einer Akkord-Spur ein und aus; Kompressor auf einer Drum-Spur ein und aus | Hall deutlich hörbar und breit? Kompressor verdichtet, ohne lauter zu werden? |

## 3. Abnahmen am Gerät
1. **Großer Song am Handy:** beim Spielen zoomen, Clips verschieben, Tempo wechseln. Keine verspäteten Einsätze; Zoomen ohne Hänger.
2. **Krachwerk ohne Netz:** einmal öffnen, zum Home-Bildschirm hinzufügen, im Flugmodus starten, ● aufnehmen, MP3 exportieren.
3. **MP3-Export am Handy:** Seite bleibt bedienbar, Fortschritt läuft.
4. **Mit Mastering gleich nach dem Start Play tippen:** Ton kommt sofort, Lautstärke springt nicht.
5. **Ein alter eigener Song:** klingt jetzt anders (Drums weiter vorn, Hall hörbar, Kompressor und Verzerrer leiser). Einmal bewusst anhören.

Aus der Zeit vor der Analyse noch offen: Entrauschen mit einer echten Aufnahme, tonale FX in einer anderen Tonart, Takes über den laufenden Loop, Festhalten, Latenz einmessen am Handy, Mehrfachauswahl per Touch, Figma-Plugin, Doppelklick am Mac nach hartem Neuladen.

## 4. Entscheidungen für Martin

### Klang
1. **Hall je Spur oder ein gemeinsamer Raum?** Hall je Spur kostet am Handy so viel, dass etwa 4–5 Spuren mit Hall gehen; über den Hall-Bus wären es 16. Dann gilt ein Raum für alle Spuren.
2. **Echo:** Die erste Wiederholung kommt von links (links rund 8,7 dB stärker). Ausgeglichene Variante: erste Wiederholung in der Mitte, dafür schmaler.
3. **Filter-Voreinstellung** offener (8 kHz statt 2,9 kHz)?
4. **Song-Starter „anhängen“ und „Begleitung“** setzen weder Sends noch Mastering. Angleichen?

### Bedienung (aus `2026-11-bedienung.md`)
1. **Einstiege je Gerät:** Jede Funktion bekommt auf jedem Gerät einen sichtbaren Einstieg (am Handy fehlen „Auswählen“ und die Gesten-Hilfe; in Krachwerk öffnen Speichern, Export und Sichern am Handy nur über den Songnamen).
2. **Tipps:** Die Einführung beginnt mit „Sound hören, auf die Spur legen, abspielen“ statt mit Filter und Harmonie.
3. **Ein Wort für „Bearbeiten“** statt sieben, und am Clip ist ablesbar, welcher Editor aufgeht.
4. Zehn weitere Punkte (W1–W10) im Bericht, darunter: neue Beats landen hinter der Schublade, Loops rasten am Handy auf Schläge statt Takte, Meldung „Mikrofon verweigert“ verschwindet nach 3,5 s.

### Konzept (aus `2026-11-konzept.md`, Urteil des Prüfers: Kurs ändern)
1. **Abnahme vor Neuem:** höchstens drei offene Abnahmen, sonst wird nichts Neues gebaut.
2. **Einstieg:** Loopwerk startet mit dem Song-Starter in ruhiger Dichte statt mit dem Beispiel und 80 Bedienelementen.
3. **Krachwerk:** eigene Klänge als Kit und Instrument („Dein Kit, dein Instrument“) vor dem neuen Speicher (3b).
4. **Teilen:** Der Export endet im Teilen-Menü statt beim Download.
5. **Nicht bauen:** weitere Mixer-, Effekt-, Mastering- und Look-Runden, Desktop-App.
6. **Roadmap** in Stand, Nächstes, offene Abnahmen und Änderungsprotokoll teilen; eine Versionsnummer statt drei (2.0.0, 2.8, 2.14).

Der Befund „160 von 166 Loops sind synthetisch, deshalb dünn“ aus dem Konzeptbericht hat sich durch die Klangmessung relativiert: Die Erzeugung ist sauber, dünn war die Abstimmung. Ob das Material jetzt trägt, entscheidet das Ohr.

## 5. Bekannt und offen
- **Stereobreite** der ganzen Mischung 0,02–0,07 statt der üblichen 0,1–0,3, weil Kick und Bass mono sind; oberhalb 250 Hz 0,07–0,11.
- **Ambient** hat weiter 0 % Höhen über 4 kHz (Material ohne Hats).
- **Verzerrer:** beim allerersten Einsatz bleibt ein Ausschlag von höchstens 4,7 dB für 5 ms (vorher 26 dB).
- **Amen Break bei −40 %:** 2 von 12 leisen Zwischenschlägen sitzen 12–15 ms daneben; Drum-Loops werden beim Verlangsamen 1–2 dB leiser.
- **Play 1,5 s nach dem Start** in einem Messfall 236 statt 153 ms, Ursache ungeklärt.
- **Speicher je Offline-Rendern:** Chrome hinterlässt 3–6 MB je Lauf (Worklet-Modul); gemildert durch weniger Messläufe.
- **Wackelige Tests unter Last:** `ambient`, `perf-ui`, `tempo-fast`, `automation`, `v17` (Zeitgrenzen). `v20` ist behoben (Testfehler, kein App-Fehler).
- **`effekt-pegel` Teil 5** vergleicht die Starter nicht mehr mit gespeicherten Bezugswerten, nur noch mit dem Rückfall-Limiter.
