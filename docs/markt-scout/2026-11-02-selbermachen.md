# Markt-Scout – 02.11.2026: Ableger „Selbermachen“

**Frage:** Ein Loopwerk-Ableger ohne mitgelieferte Samples. Man durchsucht nur eigene Sounds und erzeugt alles selbst: aufnehmen, Synthese, Beats bauen, Resampling. Wer macht das schon, was funktioniert, wo scheitern Einsteiger, und welche Nische ist im Browser frei?

**Verglichen:** Koala Sampler, Teenage Engineering (PO-33, OP-1 Field, EP-133 K.O. II), Ableton Note, GarageBand iOS (Sampler, Live Loops), BandLab Sampler, Endlesss, Elektron Digitakt II, Polyend Tracker, Bitwig Grid, BlokDust, Samplr, Chrome Music Lab Song Maker, BeepBox, Incredibox, Ableton Learning Synths. Zum Ordnen eigener Sounds: XLN XO, Sononym, Ableton Live 12. Stimme als Eingabe: Vochlea DubBox, Magenta Tone Transfer, Synplant 2. Als Gegenpol: Suno Studio, Stable Audio 2.0.

**Machbarkeit (Spalte „Browser“):** wie im Scout vom 29.10.: **DSP** (läuft überall), **DSP+Mic** (Mikrofon, nur GitHub Pages), **Claude** (Artifact-Capability `sample`, nur Text), **Modell** (großes KI-Modell im Browser), **Server**.

**Hinweis zur Recherche:** soundonsound.com, engadget.com und apps.apple.com ließen sich in dieser Umgebung nicht direkt öffnen. Aussagen zu diesen Seiten stammen aus Suchergebnissen, die auf sie verweisen. Schwache Quellen sind markiert.

---

## Was die Vorbilder stark macht

- **Aufnehmen ist ein einziger Griff.** Beim PO-33 hält man Aufnahme plus Taste, und solange man hält, nimmt das Mikrofon auf [4]. Bei BandLab tippt man auf ein leeres Pad und hält den Aufnahmeknopf, Loslassen beendet die Aufnahme [9]. Koala nimmt direkt über das Mikrofon auf ein Pad auf [1].
- **Ein Geräusch wird sofort zum Instrument.** Der GarageBand-Sampler erkennt die Tonhöhe der Aufnahme und legt sie auf die passende Taste [7]. Melodische Slots beim PO-33 verteilen einen Klang über 16 Tasten [4].
- **Der Anfang wird automatisch sauber.** Ableton Note schneidet den Startpunkt auf den ersten Anschlag zu [6].
- **Zerhacken (Chop) ist Kernfunktion.** Koala zerlegt in bis zu 32 Stücke, mit Auto-, Gleich- und „Lazy“-Chop [1]. Beim OP-1 spielt jede Taste ein Stück einer Datei [5]. Der Digitakt II schafft bis zu 64 Stücke [11]. Beim Polyend Tracker gilt das Zerlegen im Test als treffsicher [12].
- **Resampling ist der Motor.** Koala nimmt die eigene Ausgabe samt Effekten als neues Sample auf [1], ebenso OP-1 Field [5] und Digitakt II [11]. So entstehen Ebenen über die Pad-Zahl hinaus.
- **Nichts geht verloren, weil man nichts starten muss.** Ableton Note Capture: erst spielen, dann „Capture“. Tempo und Länge werden erkannt [6]. Beim EP-133 friert „Commit“ den Moment als Szene ein, danach baut man weiter [2].
- **Effekte zum Spielen.** EP-133 hat 12 druckempfindliche Punch-in-Effekte [2], Koala DJ-Effekte (Stutter, Gate, Filter) [31].
- **Teilen ohne Konto.** Song Maker teilt per Link ohne Login [15]. BeepBox speichert den ganzen Song in der URL [16]. Incredibox vergibt jedem Mix eine eigene URL [17].

## Wo Einsteiger scheitern

- **Lernkurve bei Hardware:** Beim EP-133 fühlt sich selbst für Fortgeschrittene das Einarbeiten an „wie ein neues Instrument lernen“ [2]. Der Digitakt II gilt als steil [11], der Polyend Tracker als „powerful but confounding“ [12].
- **Freiheit ohne Halt:** BlokDust (Browser, modular) bekam viel Lob. Eine Besprechung fand es aber „really difficult to craft music in any meaningful way“ [14]. Bitwig Grid hilft mit vorverkabelten Presets und über 200 Voreinstellungen [13]. Leere Modularflächen sind also nur mit Vorlagen einsteigertauglich.
- **Skizze statt Song:** Koala wird als „Sketchpad“ statt „Finishing Tool“ beschrieben, auch wegen des fehlenden Song-Modus. Das stammt aus einer KI-erzeugten Analyseseite, also schwache Quelle [1b]. Ein Nutzer kritisiert, dass Resampling zerstörend arbeitet [1].
- **Grenzen und Bezahlschranken:** PO-33 hat insgesamt 40 s Speicher [4], BandLab 1 Minute pro Kit, und AutoSlice gibt es nur mit Mitgliedschaft [9].
- **Abhängigkeit vom Server:** Endlesss (gemeinsames Jammen) schaltete am 31.05.2024 die Server ab, Nutzer sollten ihre Inhalte selbst sichern [10].
- **KI nimmt das Machen weg:** Suno-Chef Shulman wurde für die Aussage kritisiert, die meisten Menschen machten nicht gern Musik [28]. Suno Studio und Stable Audio verwandeln eigene Uploads per Text, beides als Serverdienst [26][27]. Daraus folgt die Gegenposition: Das Werkzeug macht dich schneller, aber nicht überflüssig.

## Freie Nische

Mobile Sampler (Koala, BandLab, GarageBand) brauchen eine App, zum Teil ein Konto oder ein Abo. Hardware (TE, Elektron, Polyend) kostet Geld und Lernzeit. Browser-Werkzeuge sind entweder ohne Aufnahme (Song Maker, BeepBox), schwer (BlokDust) oder treten als Pro-DAW auf (Audiotool wirbt mit „Free Cloud-based Pro DAW“ [29]). Ordnen nach Klangähnlichkeit gibt es nur in Profi-Desktop-Software (XO, Sononym ca. 89 €, Live 12) [20][21][22].

**Frei ist:** ein Koala-artiger Sampler im Browser, der bis zum fertigen Song führt (Arranger und Export hat Loopwerk schon). Ohne Konto, ohne Abo, lokal gespeichert. Dazu eine Sound-Kiste, die sich selbst ordnet. Dass so etwas im Browser geht, zeigt TE selbst: Das EP Sample Tool läuft im Browser (Web MIDI, Chrome/Edge/Firefox, nicht Safari und nicht mobil) [3].

---

## Übersicht

„Basis“ = was Loopwerk dafür schon hat.

| # | Idee (aus Sicht der Person) | Vorbild (Quelle) | Nutzen | Aufwand | Browser | Basis |
|---|---|---|---|---|---|---|
| 1 | **Halten = Aufnehmen:** Pad gedrückt halten, reinsingen/klopfen, loslassen – fertig, Anfang automatisch gesäubert | PO-33 [4], BandLab [9], Koala [1], Note Auto-Crop [6] | sehr hoch | S–M | DSP+Mic | `recorder.js`, Drumpad, `dsp/edit.js` |
| 2 | **Jeder Sound wird Instrument:** Tonhöhe erkennen, auf Klaviatur legen, Tonleiter-Sperre gilt | GarageBand Sampler [7], PO-33 melodisch [4] | sehr hoch | S | DSP | `dsp/pitch.js` (YIN), `sampler.js`, `scale.js` |
| 3 | **Zerhacken auf Pads:** automatisch an Schlägen, gleichmäßig oder von Hand; Stücke liegen auf Pads | Koala [1], OP-1 [5], Digitakt II [11], Polyend [12], BandLab AutoSlice (Abo) [9] | hoch | M | DSP | Sample-Editor, Drumpad |
| 4 | **Festhalten als neuer Sound (Resampling):** was gerade klingt, samt Effekten, auf ein freies Pad; Original bleibt | Koala [1], OP-1 Field [5], Digitakt II [11] | hoch | S–M | DSP | `renderProject`, Effekt-Pad |
| 5 | **Sound-Kiste, die sich selbst ordnet:** Ordner rein, sortiert nach Kick/Snare/Hi-Hat/Ton/Stimme/Geräusch; „ähnlich wie dieser“; Doppelte finden | XO [20], Sononym [21], Live 12 [22] | hoch (ersetzt die fehlende Bibliothek) | M | DSP (Klangmerkmale); Ordner wählen nur Chrome/Edge, sonst Mehrfachauswahl [30] | `own-sounds.js` (IndexedDB) |
| 6 | **Klangerzeuger statt Bibliothek:** Drum-Synth und Synth mit Würfel und XY-Pad, damit nie „leer“ | Learning Synths Playground (Presets wie Synth-Kick, Hi-Hat; XY-Pad) [18], Bitwig Grid Presets [13] | sehr hoch (Startlöcher ohne Samples) | M | DSP | `instruments.js`, Synth-Klänge, Gitarren-DSP |
| 7 | **Nachträglich festhalten:** einfach spielen, dann „Festhalten“ – Tempo und Länge erkannt | Ableton Note Capture [6], EP-133 Commit [2] | hoch | S–M | DSP | Patterns, Live-Einspielen |
| 8 | **Beatbox → Beat:** 3–8 eigene Mundgeräusche einlernen, Gebeatboxtes wird Pattern | Vochlea DubBox (bis 8 eigene Laute) [23] | hoch, großer Spaß | M | DSP+Mic (Anschläge + Vergleich mit den eigenen Beispielen) | Pattern-Editor, Einsingen |
| 9 | **Spielfläche für Aufnahmen:** zwei Finger als Loop-Grenzen, Scratch, Tape, Granular; Gesten aufnehmen | Samplr (8 Spielmodi, Gestenrekorder) [19] | mittel–hoch | M–L | DSP | WSOLA, Effekt-Pad |
| 10 | **Punch-in-Effekte mitschneiden** und als Sound festhalten | EP-133 [2], Koala [31] | mittel | S | DSP | Effekt-Pad (2.10) + Idee 4 |
| 11 | **Szenen-Raster:** Muster in Zellen, Zellen antippen, die Performance landet im Arranger | GarageBand Live Loops (in Zelle aufnehmen; Auftritt wird Spur) [8], EP-133 Szenen [2] | mittel–hoch | L | DSP | Arranger |
| 12 | **Stimme spielt Instrument:** Summen → Melodie mit eigenem Pad-Sound | Tone Transfer (DDSP im Browser) [24]; Loopwerk hat Einsingen → Noten | mittel | S (Noten-Weg) / L (Klang-Transfer) | DSP bzw. Modell | Einsingen 1.5 |
| 13 | **Teilen per Link** (nur bei reinen Synth-/Pattern-Songs) | Song Maker [15], BeepBox [16], Incredibox [17] | mittel | S–M | DSP; mit eigenen Aufnahmen nur per Datei, sonst Server | Projektdatei |
| 14 | **Kombi-Belohnung:** bestimmte Kombinationen schalten Bonus/Animation frei | Incredibox [17] | mittel (Motivation) | S | DSP | Glow |
| 15 | **Klang aus Aufnahme nachbauen** (Synth-Patch aus Sample) | Synplant 2 Genopatch [25] | niedrig–mittel | L | DSP (Suche), rechenintensiv | – |
| 16 | **Hardware-Pads per Web MIDI** | EP Sample Tool [3] | niedrig | S | DSP (nicht Safari) | MIDI-Eingabe |

---

## Priorisiert

### Must (ohne das ist der Ableger kein Selbermach-Werkzeug)

1. **Halten = Aufnehmen (1).** Alle erfolgreichen Vorbilder machen Aufnehmen zur Geste statt zum Dialog [4][9][1]. Auto-Zuschnitt auf den ersten Schlag [6] und Pegelanzeige [7] verhindern die häufigste Enttäuschung: Stille am Anfang, zu leise. Loopwerk hat Aufnahme und Drumpad, es fehlt die Verbindung.
2. **Jeder Sound wird Instrument (2).** Das ist der „Aha“-Moment des GarageBand-Samplers: Man nimmt die eigene Stimme oder eine Tasse auf und spielt sofort eine Melodie damit [7]. Tonhöhenerkennung (YIN) und Sampler sind schon da, also kleiner Aufwand.
3. **Klangerzeuger statt Bibliothek (6).** Ohne Samples droht die leere Fläche, die im Scout vom 29.10. als größte Hürde galt. Learning Synths [18] und Bitwig Grid [13] lösen das mit Presets zum Verbiegen und einem XY-Pad. „Würfeln“ für Kick/Snare/Hat ersetzt den Song-Starter. Synthetisches ist ausdrücklich kein mitgeliefertes Sample.
4. **Festhalten als neuer Sound (4).** Das ist der Motor aller Sampler [1][5][11]. Wir machen es besser als Koala: Das Original bleibt erhalten, und es gibt Rückgängig (Koala-Kritik: zerstörend [1]). `renderProject` gibt es schon.
5. **Zerhacken auf Pads (3).** Standard bei jedem Sampler [1][5][11][12]. Bei BandLab steckt es hinter dem Abo [9], bei uns ist es frei. Das ist ein Unterscheidungsmerkmal gegenüber der kostenlosen Konkurrenz.
6. **Sound-Kiste, die sich selbst ordnet (5).** Wenn es nur eigene Sounds gibt, muss das Durchsuchen gut sein. XO sortiert eigene Ordner automatisch nach Kick/Snare/Hi-Hat und zeigt Ähnliches [20]. Sononym sucht sogar mit einer Live-Aufnahme als Frage [21]. Im Browser reichen einfache Klangmerkmale (Länge, Helligkeit, Rauschanteil, Tonhöhe). Ordner einlesen geht nur in Chrome/Edge, sonst über Mehrfachauswahl [30]. Für Einsteiger bietet das bisher niemand.

### Should (macht ihn besonders)

7. **Beatbox → Beat (8).** Größter Spaßfaktor, ohne Instrument, und es passt zum Mikrofon-Fokus. DubBox zeigt, dass das Lernen mit wenigen eigenen Beispielen funktioniert [23]. Machbar ohne KI-Modell: Anschlagserkennung plus Vergleich mit den eigenen Beispielen.
8. **Nachträglich festhalten (7).** Gegen den Druck „Aufnahme läuft“ [6]. Für Pads und Tasten; für das Mikrofon nur bei offenem Knopf (Privatsphäre).
9. **Punch-in-Effekte mitschneiden (10).** Effekt-Pad gibt es seit 2.10, zusammen mit Idee 4 wird daraus Klangbau [2].
10. **Spielfläche für Aufnahmen (9).** Samplr gilt im Test als ungewöhnlich natürlich zu spielen [19]. Ein Modus (Loop mit zwei Fingern) reicht für den Anfang.

### Could (später oder als Experiment)

11. **Szenen-Raster (11).** Viel Spaß, aber L und eine zweite Bedienwelt neben dem Arranger [8].
12. **Teilen per Link (13).** Nur für Synth-/Pattern-Songs ehrlich machbar. Aufnahmen passen nicht in eine URL, dafür bräuchte es einen Server.
13. **Kombi-Belohnung (14).** Billige Motivation nach dem Incredibox-Prinzip [17].
14. **Stimme spielt Instrument mit Klang-Transfer (12, KI-Weg).** Tone Transfer läuft im Browser [24], ist aber ein Modell. Den Noten-Weg hat Loopwerk schon.
15. **Hardware-Pads per Web MIDI (16)** und **Klang nachbauen (15).** Nischen für Fortgeschrittene. Synplant-Ergebnisse gelten auch im Test eher als Ausgangspunkt denn als Kopie [25].

---

## Drei Positionierungen und Namensrichtungen

1. **„Alles, was du hörst, wird Musik“ – Klangjäger.** Das Mikrofon steht im Mittelpunkt: Küche, Straße, Stimme werden zu Drums und Instrumenten (Must 1, 2, 3, 5). Gegenbild zu Suno: Du machst es, die App hilft. Namen: *Klangfang*, *Lauschwerk*, *Fundstück*.
2. **„Musik aus dem Mund“ – Stimme zuerst.** Beatboxen wird Beat, Summen wird Melodie, Singen wird Chor. Kein Instrument nötig (Must 1, 2, Should 7, Einsingen). Am schärfsten abgegrenzt und am Handy am stärksten. Namen: *Mundwerk* (Wortspiel, passt zur „-werk“-Familie), *Summwerk*.
3. **„Taschen-Sampler im Browser“ – Werkbank.** Teenage-Engineering-/Koala-Gefühl ohne Kauf und Konto: Pads, Synth, Zerhacken, Resampling, fertig bis zum Export (Must 3, 4, 6, Should 9, 10). Spricht Neugierige an, die Hardware bewundern. Namen: *Loopwerk Roh*, *Eigenbau*, *Padwerk*.

Empfehlung: **2 als Gesicht und 1 als Inhalt.** „Mundwerk“ erklärt sich in einem Satz. Die Klangjagd liefert die Breite, und die Werkbank-Funktionen (3) stecken ohnehin darunter.

---

## Bewusst nicht

- **Text-zu-Song, Upload verwandeln per Prompt (Suno Studio, Stable Audio 2.0)** [26][27]: Das braucht einen Server und widerspricht dem Kern „selber machen“.
- **Gemeinsames Live-Jammen (Endlesss)** [10]: Das braucht einen Server. Das Abschalten 2024 zeigt das Risiko. Lokal-zuerst ist hier ein Vorteil, den man betonen sollte.
- **Offene Modular-Fläche (BlokDust, Bitwig Grid) als Hauptbedienung** [13][14]: Für Einsteiger ohne Vorlagen zu schwer. Höchstens versteckt hinter Presets.
- **Tracker-Bedienung (Polyend)** [12]: stark, aber im Test „confounding“.
- **Speicher- und Längengrenzen wie bei Hardware** [4][9]: Im Browser nicht nötig. Nur bei sehr langen Aufnahmen warnen.

---

## Quellen

- [1] Koala Sampler: App Store https://apps.apple.com/app/id1449584007 · https://djtechtools.com/2023/02/07/meet-the-koala-sampler-app-a-mobile-production-powerhouse-now-with-stems · https://synthanatomy.com/2019/03/koala-sampler-ios.html · https://violetrecording.com/how-to-use-koala-sampler/
- [1b] Koala-Kritik: https://marlvel.ai/apps/koala-sampler-1 (KI-erzeugte Analyse, schwach) · https://www.elektronauts.com/t/koala-sampler-app/82974?page=5 · https://www.soundonsound.com/reviews/elf-audio-koala-sampler · https://create.routenote.com/blog/koala-sampler-gains-new-mix-powers/
- [2] EP-133 K.O. II: https://rekkerd.org/teenage-engineering-launches-ep-133-k-o-ii-sampler-composer/ · https://www.soundonsound.com/reviews/teenage-engineering-ep-133-ko-ii · https://musictech.com/reviews/hardware-instruments/teenage-engineering-ep-133-ko-ii-review · https://www.gearnews.com/teenage-engineering-ep-133-k-o-ii-review-better-than-an-mpc/
- [3] EP Sample Tool (Browser, Web MIDI): https://support.teenage.engineering/hc/en-us/articles/11639171890204
- [4] PO-33 K.O!: https://support.teenage.engineering/hc/en-us/articles/360001346134-PO-33-K-O-or-PO-35-speak-how-do-i-record · https://www.soundtech.co.uk/musicians-blog/our-guide-to-the-teenage-engineering-po-33-ko-and-po-35-speak.html
- [5] OP-1 Field: https://www.soundonsound.com/reviews/teenage-engineering-op-1-field · https://www.gearnews.com/teenage-engineering-op-1-field-review/ · https://www.perfectcircuit.com/signal/teenage-engineering-op-1-field-review
- [6] Ableton Note: https://www.ableton.com/en/release-notes/note/ · https://www.soundonsound.com/reviews/ableton-note · https://www.synthtopia.com/content/2022/10/18/ableton-introduces-note-mobile-app-for-ios/ · https://cdm.link/ableton-note-2-1/
- [7] GarageBand iOS Sampler: https://support.apple.com/guide/garageband-iphone/use-the-sampler-chs392814a5/ios
- [8] GarageBand iOS Live Loops (in Zelle aufnehmen, Auftritt aufnehmen): https://support.apple.com/guide/garageband-iphone/chs02aae0e6b/ios
- [9] BandLab Sampler: https://help.bandlab.com/hc/en-us/articles/4403006058009-Using-the-Sampler
- [10] Endlesss: https://sonicstate.com/news/2024/05/25/endlesss-is-closing-down-sad-news · https://cdm.link/2024/05/endlesss-discontinued/ · https://musictech.com/reviews/endlesss/
- [11] Digitakt II: https://www.perfectcircuit.com/signal/elektron-digitakt-ii-review · https://www.gearnews.com/elektron-digitakt-ii-review/
- [12] Polyend Tracker: https://www.engadget.com/polyend-tracker-groovebox-sampler-review-170118746-170118557.html · https://www.musicradar.com/reviews/polyend-tracker
- [13] Bitwig Grid: https://musictech.com/reviews/digital-audio-workstations/bitwig-studio-3/ · https://cdm.link/2019/01/bitwig-studio-3-modular/ · https://www.bitwig.com/the-grid/
- [14] BlokDust: https://cdm.link/blokdust-amazing-graphical-sound-tool-browser/ · https://www.synthtopia.com/content/2016/08/25/blokdust-is-a-free-browser-based-music-making-app/ · https://thenextweb.com/news/blokdust-beautiful-music-browser
- [15] Chrome Music Lab Song Maker: https://blog.google/products-and-platforms/products/education/simple-music-making-everyone/ · https://www.education.sa.gov.au/our-learning-sa/learning-home-activities/arts/chrome-music-lab-song-maker
- [16] BeepBox: https://beepbox.co/ · https://newgrounds.wiki.gg/wiki/BeepBox
- [17] Incredibox: https://en.wikipedia.org/wiki/Incredibox · https://www.incredibox.com/info/faq
- [18] Ableton Learning Synths Playground: https://www.ableton.com/en/blog/new-in-learning-synths-export-to-live-record-your-creations-and-more/
- [19] Samplr: https://cdm.link/samplr-is-an-op-1-inspired-ipad-app-focused-on-touching-slicing-waveform-samples/ · https://musicradar.com/reviews/tech/samplr-572226 · https://apps.apple.com/app/id560756420
- [20] XLN XO (eigene Ordner, automatische Kategorien, Ähnlichkeit): https://assets.xlnaudio.com/documents/xo-getting-started.pdf
- [21] Sononym: https://sonicstate.com/news/2021/12/13/sononym-131 · https://rekkerd.org/?p=227727
- [22] Ableton Live 12 Ähnlichkeitssuche: https://sonicstate.com/news/2024/03/05/ableton-live-12-is-out/ · https://forum.ableton.com/viewtopic.php?p=1817951
- [23] Vochlea DubBox: https://www.musicradar.com/music-tech/beatbox-your-ideas-into-reality-with-vochleas-dubbox-an-app-that-converts-your-voice-into-drum-loops · https://mixdownmag.com.au/news/dubbox-a-standalone-app-that-plays-real-drums-from-beatboxing/
- [24] Magenta Tone Transfer: https://research.google/pubs/tone-transfer-in-browser-interactive-neural-audio-synthesis/ · https://blog.google/technology/ai/what-if-you-could-turn-your-voice-any-instrument/
- [25] Synplant 2: https://musictech.com/reviews/plug-ins/sonic-charges-synplant-2-review/ · https://www.soundonsound.com/reviews/sonic-charge-synplant-2
- [26] Stable Audio 2.0: https://stability.ai/news/stable-audio-2-0
- [27] Suno Studio: https://suno.com/release-notes/introducing-suno-studio · https://musictech.com/reviews/digital-audio-workstations/suno-studio-review/
- [28] Kritik an Suno-CEO: https://djmag.com/news/suno-ai-ceo-claims-people-dont-enjoy-making-music
- [29] Audiotool: https://www.audiotool.com/compare
- [30] Ordner im Browser öffnen: https://web.dev/articles/files/open-a-directory
- [31] Koala DJ-Effekte, GarageBand Remix FX: siehe `docs/markt-scout/2026-10-29.md` [9][18b]
