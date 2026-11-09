# Konzeptanalyse Loopwerk und Krachwerk

**Stand:** 09.11.2026 · **Rolle:** Creative Director · **Art:** Bestandsanalyse des Ganzen, keine Freigabe eines Entwurfs. Klang und Bedienung im Detail prüfen zwei getrennte Analysen; hier geht es um Idee, Kern und Richtung.

**Grundlage:** `CLAUDE.md`, `docs/ROADMAP.md`, ADR 001–012 (besonders 004, 007, 010), `docs/specs/ableger-selbermachen.md`, `krachwerk-*.md`, `v1.6-ideen-von-claude.md`, beide Markt-Scout-Berichte, `docs/ux/cd-review.md`, `docs/ux/cd-ableger-selbermachen.md`, `src/edition.js`. Dazu das Produkt selbst: Headless-Chromium mit leerem Speicher (echter erster Start), Desktop 1440 × 900 und Handy 390 × 844 mit Touch, gezählt mit `tests/count.cjs` (`countUi`), Bibliothek über `library.list()` ausgewertet.

**Bilder** (`docs/analyse/konzept/`):

| Bild | Inhalt |
|---|---|
| `loopwerk-desktop-1-start.png`, `loopwerk-handy-1-start.png` | Loopwerk, erster Start (Beispiel-Arrangement) |
| `loopwerk-desktop-2-song.png`, `loopwerk-handy-2-song.png` | Loopwerk, Song-Starter „Melodic Techno“ läuft (Takt 2 von 56) |
| `krachwerk-desktop-1-start.png`, `krachwerk-handy-1-start.png` | Krachwerk, erster Start |
| `krachwerk-desktop-2-song.png`, `krachwerk-handy-2-song.png` | Krachwerk, vier eigene Klänge als Beat über 4 Takte, läuft. Die Klänge sind synthetische Platzhalter für Mikrofon-Aufnahmen; beurteilt wird nur die Arbeitsweise, nicht der Klang. |

**Gezählt** (Bedienelemente / Rahmen / Schriftgrößen / kleinste Schrift in px):

| Szene | Loopwerk | Krachwerk |
|---|---|---|
| Desktop, erster Start | 80 / 45 / 11 / 9,5 | 18 / 8 / 4 / 11 |
| Handy, erster Start | 48 / 25 / 5 / 10 | 13 / 4 / 4 / 11 |
| Desktop, Song läuft | 77 / 41 / 11 / 9,5 | 34 / 50 / 4 / 11 |
| Handy, Song läuft | 40 / 20 / 5 / 10 | 15 / 31 / 4 / 11 |

(Die hohen Rahmenzahlen in Krachwerk beim laufenden Song sind die 42 Einzel-Clips, siehe Kritisch 2.)

---

## 1. Maßstab

So, wie das Ziel in `CLAUDE.md` steht, lässt es sich nicht prüfen: „Niedrigschwellig“ sagt nicht, für wen, „angelehnt an Magix 2000“ und „Awwwards-Niveau“ ziehen in verschiedene Richtungen, und auf dem Ladeschirm steht „Private use only“, während Martin für Krachwerk „persönlich, Freizeit“ entschieden hat (`ableger-selbermachen.md`). Ich prüfe deshalb gegen diese Fassung, die Martin korrigieren soll:

> **Eine Person ohne Musikvorwissen (heute vor allem Martin selbst) baut in einer Sitzung am Handy oder am Rechner einen Song von zwei bis drei Minuten, der nach Musik mit Druck klingt und den sie jemandem schicken mag. In Loopwerk geht das aus mitgelieferten Loops, in Krachwerk nur aus eigenen Geräuschen.**

Daran hängen drei Prüffragen: Klingt das Material gut, ohne dass man etwas können muss? Kommt man ohne Erklärung vom Start zum Song? Endet der Weg bei jemand anderem und nicht bei einer Datei?

## 2. Bestand

Loopwerk ist nach zwölf Tagen und 314 Commits (29.10. bis 09.11.2026) eine kleine DAW im Browser: 106 Quelldateien mit 31 200 Zeilen, `index.html` mit 4 259 Zeilen, 71 Testdateien mit 22 500 Zeilen. Arranger mit Einrasten, Mixer mit 7 Effekten in wählbarer Reihenfolge, zwei Send-Bussen und Automation in sechs Scheiben, Aufnahme mit Latenz-Einmessen, Takes und Mehrspur, Clip-Editor mit Autotune, Trennen und Entrauschen, Beat- und Melodie-Editor mit MIDI, Song-Starter in zehn Genres, Akkord-Streifen, Tonart je Takt, Mastering in fünf Stilen, Export bis zu Stems in 32 Bit. Technisch ist das sorgfältig gebaut, die Tests messen Timing samplegenau und Effekte in dB.

Wer Loopwerk zum ersten Mal öffnet, sieht ein „Beispiel-Arrangement“ mit acht Spuren und acht Clips (`loopwerk-desktop-1-start.png`). Es stammt unverändert aus dem Spike 0.1 (`createDemoProject` in `src/model.js`: `drums-four`, `chords-pad`, `bass-prog`). Daneben stehen ein Regal mit 545 Sounds, ein Inspektor mit sieben Effekt-Schaltern und Mastering sowie 80 Bedienelemente in elf Schriftgrößen. Von den 166 Loops der Bibliothek sind **160 im Code synthetisiert und 6 aufgenommen** (Sonic Pi). Aufgenommen sind fast nur Einzelklänge (320 von 379, vor allem VCSL).

Krachwerk ist dieselbe App unter `/werkstatt/`: ohne Kataloge, mit leerem Song aus zwei Spuren, einer ruhigen Dichte (18 statt 80 Bedienelemente), einer Sound-Werkbank mit nicht-zerstörendem Klang-Rezept, Zerlegen, Takes über den laufenden Loop, Festhalten, ZIP-Sicherung und PWA. Der erste Start zeigt eine leise Zeile „● tippen, dann ein Geräusch machen“ und sonst Schwarz (`krachwerk-desktop-1-start.png`).

Kurz gesagt ist das Produkt heute ein technisch starker Werkzeugkasten mit zwei Oberflächen. Was ihm fehlt, ist das, was ein Neuling als Erstes trifft: gut klingendes Material, ein Einstieg, der zum Song führt, und ein Ende, an dem man den Song jemandem zeigt.

---

## 3. Kritisch

### K1 · Das Kernmaterial trägt das Produkt nicht
**Problem:** Ein Loop-Music-Maker ist so gut wie seine Loops. Magix hat Soundpools verkauft, nicht den Arranger. In Loopwerk sind 160 von 166 Loops im Code synthetisiert. Das Erste, was man hört, ist das Material aus dem Spike vom ersten Tag (`createDemoProject`), und das Paket „Druck“ wirkt nur im Starter „Melodic Techno“ und im Kit `druck`. Neue Beats bleiben laut Roadmap Elektro.
**Auswirkung:** Martins einziges Urteil über das Ergebnis, „super dünn, da fehlt der Druck“, ist bei diesem Material die erwartbare Folge und kein Mischproblem. Mastering, Busse und Automation polieren dünnes Material und verdecken so, wo der Mangel sitzt. Jede weitere Funktion macht ein Produkt breiter, dessen Kern nicht überzeugt.
**Richtung:** Eine kleine, kuratierte Kernbibliothek (wenige Genres, je ein vollständiges, aufeinander abgestimmtes Set) wird zum Produktziel mit Hörabnahme durch Martin, und die Demo wird durch das beste Ergebnis daraus ersetzt.

### K2 · Krachwerk löst sein eigenes Versprechen nicht ein
**Problem:** Das Versprechen aus dem CD-Brainstorm und dem Markt-Scout lautet „Mach aus jedem Geräusch ein Instrument“. Die drei Must-Punkte dafür sind „Halten = Aufnehmen“, „Jeder Sound wird Instrument“ und „Klatsch dein Kit“. Der Prototyp hatte Pad-Wand und Klatsch-Kit, sie wurden zurückgebaut (ROADMAP Zeile 300), und ihr Ersatz steht als „Scheibe 4“ aus (`krachwerk-1-geruest.md` §1). Gebaut wurden stattdessen Sicherung, Takes und Festhalten, als Nächstes geplant ist Speicher v2 (ROADMAP Zeile 308). Im Produkt heißt das: Eigene Klänge lassen sich nur als einzelne Clips legen, ein Beat über vier Takte sind 42 Clips (`krachwerk-desktop-2-song.png`, `krachwerk-handy-2-song.png`). Der Beat-Editor kennt nur die Synth-Kits (`KITS` in `src/instruments.js`), der Melodie-Editor keinen eigenen Klang als Instrument. Tipps sind aus (`surfaces.tips: false`), und eine Startkarte gibt es nicht.
**Auswirkung:** Krachwerk ist heute ein ruhigeres Loopwerk ohne Loops. Wer es öffnet, bekommt eine Spurfläche und ein Mikrofon, aber keinen Weg vom Klatschen zum Groove. Genau diese Minute hat die CD-Einschätzung als größte Gefahr benannt („die erste Minute klingt schlechter als jede Minute in Loopwerk“).
**Richtung:** Scheibe 4 (eigenes Kit im Beat-Editor, eigener Klang als Instrument im Melodie-Editor, ein erster Start mit Auftrag) kommt vor jeder weiteren Infrastruktur.

### K3 · Gebaut wird schneller, als abgenommen wird
**Problem:** Neun Hör- und Handtests sind offen (Entrauschen, tonale FX, Busse, Takes, Festhalten, Einmessen, Mehrfachauswahl per Touch, Figma-Plugin, Druck). Mehrere davon bauen aufeinander auf: Festhalten nutzt Takes, Takes nutzen das Einmessen, und keiner davon ist gehört. Die Tests beweisen, dass eine Funktion tut, was die Spec sagt. Ob die Spec das Richtige will, beweisen sie nicht. Das einzige menschliche Urteil („dünn“) widerspricht dem Bild, das 22 500 Zeilen grüner Tests zeichnen.
**Auswirkung:** Fehler in der Richtung werden spät und teuer entdeckt, und die Aufmerksamkeit des einzigen Nutzers verteilt sich auf Funktionen, die er nicht bestellt hat. Das Produkt wächst in die Breite, während Martins Urteil über den Kern fehlt.
**Richtung:** Eine neue Scheibe beginnt erst, wenn höchstens drei Abnahmen offen sind, und die Abnahme ist ein eigener Schritt mit Datum und Urteil in der Roadmap.

---

## 4. Wichtig

### W1 · Der erste Start von Loopwerk verspricht eine DAW, nicht „Loop it“
**Problem:** In den ersten 30 Sekunden sieht man 80 Bedienelemente, 45 Rahmen und 11 Schriftgrößen, rechts Verzerrer bis Hall und Mastering (`loopwerk-desktop-1-start.png`). Der Song-Starter, die stärkste Einstiegsfunktion, liegt hinter dem Reiter „Erstellen“ bzw. im Handy-Fach „Song“. Am Handy zeigt der Start weder Namen noch Zeichen von Loopwerk, sondern acht meist leere Spuren und zweieinhalb Takte (`loopwerk-handy-1-start.png`). Für wen das Produkt gemacht ist, sagt der Bildschirm nicht.
**Auswirkung:** Der Neuling liest „Profi-Werkzeug“ und sucht, statt zu spielen. Das Versprechen „niedrigschwellig“ ist nur für jemanden sichtbar, der weiß, wo der Starter liegt.
**Richtung:** Loopwerk startet mit der Wahl „Song-Starter oder leer“ und übernimmt die Dichte `calm`, die Krachwerk mit 18 statt 80 Bedienelementen schon beweist (ADR 007 sieht das ausdrücklich vor).

### W2 · Die Editionen trennen nach Zufall, nicht nach Material
**Problem:** Gedacht war: Die Editionen unterscheiden sich im Material (Kataloge, KI, Link). Tatsächlich unterscheiden sie sich auch in den Werkzeugen und im Bearbeitungsmodell. Loopwerk bearbeitet zerstörend im Sample-Editor, Krachwerk nicht-zerstörend über das Rezept. Die Zwillingsliste in `src/edition.js` hat 59 Einträge. Festhalten (`bounce: false`), Takes ohne Stopp (`recordWhilePlaying: null`), Zerlegen und ZIP-Sicherung (`storagePanel: false`) gibt es nur in Krachwerk. Einen Grund dafür nennt keine Spec. Umgekehrt fehlen Krachwerk Tipps und Mehrspur ohne erkennbaren Grund. Das Resampling „Spur zu Audio“ stand im Markt-Scout vom 29.10. ausdrücklich für Loopwerk (Punkt L). Loopwerk-Nutzer mit eigenen Aufnahmen in IndexedDB haben keine Sicherung, obwohl iOS genau diesen Speicher räumt.
**Auswirkung:** Doppelte Pflege, sichtbar in Zahlen: 172 Zeilen `calm` in `index.html` gegen die Grenze von 150 aus ADR 007, rund 3 800 Zeilen Krachwerk-Tests, eine Loopwerk-Zählbasis, die bei jeder Krachwerk-Änderung „exakt bleiben“ muss. Jede neue Funktion stellt die Frage „in welche Edition?“ neu, und die bisherigen Antworten widersprechen sich.
**Richtung:** Eine Regel festschreiben: Editionen unterscheiden sich nur in Material und Dichte. Werkzeuge (Rezept, Zerlegen, Festhalten, Takes im Lauf, Sicherung) gibt es in beiden, und der zerstörende Sample-Editor läuft mittelfristig aus.

### W3 · Die Breite verdeckt den Kern
**Problem:** Automation in sechs Scheiben, Send-Kurven, Effekt-Reihenfolge per Ziehen, Mehrspur-Aufnahme mit Eingang je Spur, Stems in 32 Bit, Tonart je Takt und fünf Mastering-Stile sind DAW-Funktionen. Für „niedrigschwellig“ braucht es sie nicht. Effekte stehen an drei Orten (Inspektor, Mixer-Effektseite, Effekt-Pad).
**Auswirkung:** Jede dieser Funktionen kostet Platz, Tests und Abnahme, und keine davon bringt einen Neuling schneller zum Song.
**Richtung:** Den Kern festlegen und alles andere hinter eine Stufe legen statt weiterbauen. Der Kern: Regal mit guten Loops, Arranger mit Einrasten, Song-Starter, Beat und Melodie mit Tonleiter-Sperre, Aufnahme, Mastering an, Export und Teilen. Hinter die Stufe gehören Send-Kurven, Effekt-Reihenfolge, Mehrspur und Eingang je Spur, Tonart je Takt, Stems-Optionen und „Klang aus Beschreibung“ (geht nur im Artifact). Zusammenlegen lassen sich Effekt-Pad-Aufnahme und Automation, und Effekte sollten nur einen Ort haben.

### W4 · Nach dem Export ist der Weg zu Ende
**Problem:** Der Export endet in einer WAV- oder MP3-Datei, die heruntergeladen wird. Teilen über das Teilen-Menü gibt es nur für die Song-ZIP in Krachwerk (`src/ui/save-file.js`). Einen Moment „Hör dir das an“ gibt es nicht, auch keinen Titel, kein Bild und keine Zutatenliste. Die CD-Idee „17 Geräusche · 0 fremde Samples“ wäre genau der Teilen-Moment von Krachwerk gewesen.
**Auswirkung:** Das Ziel „jemandem zeigen“ ist nicht erreichbar, ohne die App zu verlassen und eine Datei von Hand zu verschicken. BandLab und Soundtrap haben hier ihren größten Vorsprung.
**Richtung:** Der Export bekommt einen Schritt „Teilen“: MP3 über Web Share, mit Titel und in Krachwerk mit der Zutatenliste als Bild.

### W5 · Loopwerk hat keine eigene Idee, Krachwerk hat eine
**Problem:** Song-Starter, Ein-Klick-Mastering, Stimme trennen und Effekt-Pad sind die Stärken von BandLab, Soundtrap und GarageBand, und die haben dazu echte Studio-Loops, Teilen und eine Community (Markt-Scout 29.10., Punkte A, C, D). Was Loopwerk unterscheidet (Browser ohne Konto, offline, deutsch), ist eine Eigenschaft, kein Grund, es zu öffnen. Krachwerk dagegen hat mit Stammbaum, Herkunftsfarben und nicht-zerstörendem Rezept etwas, das weder Koala (zerstörendes Resampling) noch BandLab bietet. Phosphor trägt diese Idee in Krachwerk sichtbar: 4 Schriftgrößen, Linien statt Kästen, Licht in Herkunftsfarbe. In Loopwerk tragen M/S-Kästen, Versalien-Etiketten und 45 Rahmen noch die Werkstück-Schicht (`loopwerk-desktop-1-start.png`).
**Auswirkung:** Gegen die kostenlosen Großen verliert Loopwerk jeden Vergleich, den es auf deren Feld führt.
**Richtung:** Die Geschichte von Krachwerk zur Geschichte beider machen. „Was klingt, leuchtet, und du siehst, woher es kommt“ gilt dann auch für Loops, und Loopwerk wird der Einstieg in dieselbe Werkstatt statt eines Nachbaus.

### W6 · Die Roadmap zeigt nicht, wo es steht und was kommt
**Problem:** `docs/ROADMAP.md` ist auf 341 Zeilen ein Änderungsprotokoll mit Funktionsnamen, dB-Werten und Frame-Zahlen. „Als Nächstes“ (Zeile 334) enthält nur Erledigtes. Mehrere Zeilen sind veraltet: Zeile 285 „Als Nächstes Scheibe C“, obwohl C erledigt ist, 2.14 steht auf 🧪, obwohl alle vier Scheiben ✅ sind, und Zeile 308 verweist auf „siehe unten“, wo nichts steht. Offene Abnahmen stehen nirgends gesammelt. Die Versionen widersprechen sich: `package.json` sagt 2.0.0, der Ladeschirm „Version 2.8“, die Roadmap 2.14.
**Auswirkung:** Martin kann aus dem Dokument weder den Stand noch das Nächste ablesen, und das Team plant ohne gemeinsame Vorlage.
**Richtung:** Die Roadmap wird in vier Teile geteilt: Stand auf einer Seite, die nächsten drei Scheiben, offene Abnahmen mit Datum, Änderungsprotokoll getrennt.

---

## 5. Feinschliff

- **Schrift am Handy:** Loopwerk misst am Handy 10 px als kleinste Schrift, ADR 004 verlangt mindestens 11 px (Zählung oben). Krachwerk hält 11 px.
- **Ein Ding, vier Namen:** Die linke Spalte heißt „Assets“ (englisch, `index.html` Zeile 3788), am Handy „Sounds“, in den Dokumenten „Regal“ und in Krachwerk „Kiste“.
- **Erklärtext trotz Regel:** Der Inspektor zeigt beim Start „Klick auf einen Clip oder einen Spurnamen zeigt hier seine Einstellungen …“. Laut `CLAUDE.md` gehören Erklärungen in die Tipps.
- **„Private use only“** auf Ladeschirm und im Song-Fach ist englisch und sagt einem Neuling, dass er nicht gemeint ist.
- **Beispiel-Arrangement:** 16 Takte Inhalt bei „Länge 32 Takte“, der Name ist ein Arbeitstitel.
- **Starter „Melodic Techno“:** Die ersten acht Takte laufen ohne Kick (`loopwerk-desktop-2-song.png`). Musikalisch ist das richtig, aber gerade das Paket „Druck“ beginnt dadurch ohne Druck. Bei der Abnahme sollte das zuerst gehört werden.
- **Geschmacksfrage:** Beim Spielen färbt das Raumlicht die ganzen Seitenleisten blau-grün bzw. orange (`*-2-song.png`). Das widerspricht der eigenen Vorgabe „die Mitte bleibt ruhig“ nicht direkt, für stundenlanges Arbeiten ist es aber viel Farbe hinter Text. Eine Lichtstufe „sparsam“ (offen seit ADR 004) würde reichen.

---

## 6. Trägt

1. **Ein Code, zwei Editionen, gemessen.** `src/edition.js` hält beide Editionen in einer Tabelle, die Projektdateien öffnen in beiden Apps, und der Zähltest macht Ruhe messbar. Dass Krachwerk mit derselben Engine und denselben Funktionen auf 18 statt 80 Bedienelemente kommt, ist der Beweis, dass Loopwerk ruhig werden kann, ohne etwas zu verlieren.
2. **Klang-Rezept mit Stammbaum (ADR 010).** Das Rezept ist nicht-zerstörend, wird in eine Signalkette gebacken und gilt für alle Clips eines Sounds, und die Herkunft bleibt als Zeile und Farbe sichtbar. Das ist die eigenständigste Idee im ganzen Bestand und die einzige, die keiner der verglichenen Konkurrenten so hat.

---

## 7. Empfehlung

### Die nächsten drei Scheiben

1. **Kernklang Loopwerk:** wenige Genres mit je einem vollständigen, aufeinander abgestimmten Loop-Set, eine neue Demo aus diesem Material, dazu eine Hörabnahme gegen einen Referenz-Track. Begründung: Das Material ist das Produkt, und das einzige Urteil über das Produkt lautet „dünn“.
2. **Krachwerk Scheibe 4 „Dein Kit, dein Instrument“:** eigene Klänge als Kit im Beat-Editor und als Instrument im Melodie-Editor, dazu ein erster Start mit Auftrag und eigene Tipps. Begründung: Erst damit hält Krachwerk sein Versprechen, und heute braucht ein eigener Beat 42 Einzel-Clips.
3. **Vom Start bis zum Teilen:** Loopwerk startet mit dem Song-Starter in der Dichte `calm`, und der Export endet beim Teilen über das Teilen-Menü (in Krachwerk mit Zutatenliste). Begründung: Damit ist der Weg aus dem Maßstab einmal ganz begehbar, vom ersten Tipp bis zu jemand anderem.

Davor kommt keine Scheibe, sondern eine **Abnahmerunde**: Die neun offenen Hör- und Handtests werden abgearbeitet oder ausdrücklich gestrichen.

### Jetzt ausdrücklich nicht bauen

- **Speicher v2 (Krachwerk 3b):** Die ZIP-Sicherung schützt schon vor Verlust. Speicher v2 kommt erst, wenn Startzeit oder Speicher bei Martins echter Sammlung messbar Probleme machen.
- **Weitere Mixer- und Automationsfunktionen**, weitere Mastering-Stile und weitere Effekte.
- **Krachwerk Scheibe 5 (Song-Werkbank)**, die Songliste im Gerät und Tauri oder Plugins.
- **Weitere Runden für Raumlicht und Look:** Es gab schon 9 und 8 Entwürfe.
- **Weitere KI-Funktionen.** Die bestehenden laufen nur im Artifact, auf GitHub Pages greifen Regeln.
- **Weitere Breite in der Bibliothek** (Genres, Einzelklang-Pakete), bevor Scheibe 1 die Qualität geklärt hat.

### Änderungen an der Arbeitsweise

- **Obergrenze für Offenes:** Höchstens drei offene Abnahmen. Liegen mehr vor, wird nichts Neues gebaut, sondern abgenommen oder gestrichen.
- **Abnahme als Schritt im Skill `feature-slice`:** Martins Urteil steht mit Datum in der Roadmap („gehört am …, passt / ändern / weg“). Eine Scheibe ohne Urteil gilt als offen, nicht als fertig.
- **Bezug zum Maßstab:** Jede Spec nennt den Satz aus dem Maßstab, dem sie dient. Infrastruktur ohne Bezug braucht einen gemessenen Anlass.
- **Feste Hörprobe:** Je Edition gibt es einen Referenzsong von 60 Sekunden, der nach jeder hörbaren Änderung neu gerendert wird. Martin vergleicht dann zwei Dateien statt einer Funktionsliste.
- **Roadmap teilen** wie unter W6. Das Änderungsprotokoll kann bleiben, wie es ist, aber nicht als Plan.

---

## 8. Urteil

**Kurs ändern.** Fundament, Engine und Edition-Architektur bleiben. Die Richtung muss sich aber von „mehr Werkzeug“ zu „besserer Klang, eingelöstes Versprechen, abgenommene Funktionen“ drehen, denn auf dem heutigen Kurs (als Nächstes Speicher v2) wird das Produkt breiter, ohne dass sein Kern besser wird.
