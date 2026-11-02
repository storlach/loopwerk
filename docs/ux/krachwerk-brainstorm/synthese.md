# Krachwerk: Synthese des Brainstormings

**Stand:** 02.11.2026 · **Von:** Creative Director · **Für:** Martin (5 Minuten)
**Grundlage:** `ux.md` (ux-designer), `ui.md` + `richtungen.html`/`.png` (ui-designer, selbst angesehen), `architektur.md` (architekt), Ist-Bilder in `shots/`, Phosphor-Spec, CLAUDE.md.

---

## 1. Was Martin will

> **Loopwerk, wie du es kennst (Song, Spuren, Clips, ganze Tracks), aber das Material machst du selbst, das Formen bekommt den meisten Platz und mehr Regler, und die Oberfläche zeigt nur das, woran du gerade arbeitest.**

**Wo der Prototyp danebenlag:** Er hat aus „Selbermachen“ ein anderes Produkt gemacht: eine Pad-Wand ohne Arranger, mit eigener Signalkette, eigenem Takt und eigenem Speicher. Songs entstehen dort nicht, nur über „Mitnehmen“ in Loopwerk. Das ging auf meine eigene Einschätzung zurück (`cd-ableger-selbermachen.md`: „Pads statt Arranger“, „Song-Bau in Loopwerk“, „keine Reglerwand, keine ADSR-Zahlen“). **Das war falsch.** Ich hatte eine Haltung („alles von dir“) gesehen und daraus ein Spielzeug abgeleitet. Martin will ein Werkzeug. Richtig bleiben aus dem alten Papier: Herkunftsfarben, Pink nur als Marke, Rot nur mit Formsignal, Stammbaum, automatisches Säubern der ersten Aufnahme, keine fremden Samples.

---

## 2. Übereinstimmung und Widerspruch

### Gesetzt (alle drei sind sich einig)
- **Eine App, keine zweite.** Krachwerk ist eine Edition der vollen App (gleicher Store, gleiche Engine, gleiche Projektdatei). Die Pad-Wand, `bank.js`, `mic.js`, `groove.js`-Takt und `handoff.js` kommen zurück in die Werkzeugkiste. `clean.js` und `slice.js` wandern nach `src/dsp/`.
- **Der Song ist die Hauptfläche**, immer sichtbar, mit der laufenden Marke.
- **Eine Werkbank statt neun Docks.** Sie zeigt das, was ausgewählt ist: Sound, Kit/Instrument, Spur oder (ohne Auswahl) den Song. Inspektor, Sample-Editor, Pattern-Editor, Mixer-Detail, Tempo-, Song- und Export-Fach gehen darin auf.
- **Nichts wird zerstört, also gibt es kein „Übernehmen“.** Klang-Einstellungen sind ein Rezept am Sound im Projekt (mit Undo und Live im Song). Es gibt nur ein ↶ und nur ein ▶.
- **Werkzeug am Objekt** für die schnellen Dinge (Teilen, Kopie, Stumm, Löschen), damit die Werkbank nur zum Formen da ist.
- **Gezeigt wird, was belegt ist:** neuer Song mit 2 Spuren, Tonart- und Akkordzeile nur auf Wunsch, an der Spur nur die Effekte, die an sind.
- **Grund und Feinheiten:** pro Seite der Werkbank 3–5 Griffe, der Rest klappt auf und bleibt je Seite gemerkt.
- **Neu fürs Selbermachen:** Takes im Loop, Festhalten (Resampling), Zerlegen zu Kit oder Instrument, Hüllkurve, Filter, Feinstimmung.
- **Look:** Phosphor-Familie, Kategorien nach Herkunft (Körper, Dinge, Stimme, Strom, Schleife), Roh = weißes Korn, geformt = Lichtstrich, Stammbaum als eine Zeile.

### Widersprüche und meine Empfehlung

| Frage | ux-designer | ui-designer | architekt | Empfehlung CD |
|---|---|---|---|---|
| **Werkbank am Desktop** | unten, volle Breite (wie Magix) | rechts, 36 % (Mockup B) | offen | **Rechts als Standard, ⤢ macht sie breit** (→ Frage 1). Im Mockup B sieht man alle Spuren und den Klang gleichzeitig. Das ist „wie Loopwerk“, und die Clipfläche wächst trotzdem von 618 auf etwa 900 px. Unten bleiben bei 55 % nur 3 Spuren übrig. |
| **Wo liegt der Mikro-Knopf?** | Daumenleiste unten (Handy) | auf der Naht, wandert mit | – | **Am Handy fest in der Daumenleiste, am Desktop im Deck.** Ein Knopf, der mit dem Griff der Schublade wandert, ist für die häufigste Handlung kein festes Ziel und kollidiert mit dem Ziehen des Griffs. Die Naht bleibt die Marken-Geste als **Licht**: bei der Aufnahme wird sie zur roten Linie. Das entscheide ich selbst. |
| **Transport am Handy** | unten (Daumen) | oben (wie Loopwerk) | – | **Unten.** ▶ und ● sind die häufigsten Tipps. Oben steht nur, was man liest (Name, Takt, Tempo). Das entscheide ich selbst. |
| **Wo liegen die eigenen Klänge?** | eigene „Kiste“ links, einklappbar | „Ablage“ in der Werkbank | Regal „Material“ | **Kiste als eigene Fläche** (Desktop: schmale Liste ohne Kasten wie in A, einklappbar; Handy: Schublade). Liegt die Ablage in der Werkbank, ist sie genau dann weg, wenn man einen Klang formt und den nächsten braucht. |
| **Reiter der Sound-Werkbank** | Form · Ton · Farbe · Zeit · Zerlegen · Herkunft | Schnitt · Ton · Hülle · Farbe · Raum · Zerlegen | Rezept ohne Raum | **Schnitt · Ton · Hülle · Farbe · Zeit · Zerlegen.** Raum und Echo gehören zur Spur (Regel „ein Objekt, eine Frage“), und die Herkunft steht als Kopfzeile über der Welle statt in einem eigenen Reiter. |
| **Spurkopf** | 56 px, Farbe + Name | Name + M S als Buchstaben | – | **Handy: Name und Lichtkante, M/S lang drücken und in der Spur-Werkbank. Desktop: Name + M S als Buchstaben.** |
| **Pad-Wand behalten?** | Pads 2×4 als Kit-Werkbank | – | „Dock Pads“ oder weg | **Als Kit-Werkbank; groß gezogen ist sie die Pad-Wand zum Live-Spielen** (→ Frage 3). Die Daten aus `loopwerk-make` werden übernommen. |
| **Sound-Änderung gilt für …** | alle Clips (fragt Martin) | – | alle Clips (Rezept am Sound) | **Für alle Clips dieses Sounds**, Kopfzeile „in 3 Clips“, daneben „Als Variante“. Zwei von drei sind dafür, und so denken Instrumente. Das entscheide ich selbst. |
| **Satz-Werkbank aus C** | – | als Ansicht für Bildschirmleser und als Rezept | – | **Nicht als Bedienung.** Von C übernehmen wir nur die Schriftregel, die Stammbaum-Zeile und die Zutatenliste beim Teilen. |
| **Erster Start** | leerer Song, 3 Karten | – | leeres Projekt | **Leerer Song mit 2 Spuren; auf Spur 1 eine große Karte „● Mach ein Geräusch“ und zwei kleine** (Klatsch dein Kit, Ohne Mikro: Strom). Dazu ein Klang nach einem Tipp, der schon gesäubert ist. Das entscheide ich selbst. |

---

## 3. Zielbild

1. **Drei Flächen:** Song (immer), Werkbank (bei Auswahl), Kiste (auf Abruf). Kein Regal-Katalog, keine Fachleiste, keine Ansichtsleiste. Zoom geht mit zwei Fingern oder Strg+Rad, die Knöpfe stehen unter Song → Ansicht.
2. **Desktop 1400×820:** oben das Deck (Linse, ●, Loop, Takt/Tempo/Tonart, ↶ ↷, Songname ▾, Teilen); links die Kiste (240 px, einklappbar auf 24 px); Mitte der Song; rechts die Werkbank (36 %, ⤢ auf etwa 60 %). Ohne Auswahl ist die Werkbank zu, dann gehört die ganze Breite dem Song.
3. **Handy 390×844:** oben eine Lesezeile von 56 px (Name · Takt · Tempo); der Song mit Spurköpfen von 56 px; die Werkbank als Schublade (zu 56 px / Mitte 50 % / oben 85 %, je Objektart gemerkt); unten die Daumenleiste mit 64 px (Kiste · ▶ · ● · ↶ · …). Bei „Mitte“ bleiben 2–3 Spuren und die Marke sichtbar.
4. **Werkbank-Inhalt je Objekt:** *Sound* hat die Welle in voller Breite mit Anfang, Ende und Hüllkurve als Linien darauf, dazu 6 Reiter mit je höchstens 5 Griffen im Grundzustand (etwa 28 Werte insgesamt, also mehr als heute). *Kit/Instrument* hat Pads 2×4 oder Tasten der Tonart, darüber 16 Schritte oder die Rolle. *Spur* zeigt Pegel, Panorama, M/S, die aktiven Effekte, „+ Effekt“ und Kurven. *Song* zeigt Tempo, Tonart, Länge, Mischen (alle Fader), Mastering, Export, Projekt und Hilfe.
5. **Zielzahlen, gemessen wie in `ux.md`/`ui.md` (Bild „Clip gewählt“):**

   | | heute Desktop | Ziel Desktop | heute Handy | Ziel Handy |
   |---|---|---|---|---|
   | sichtbare Bedienelemente | 112 | **≤ 45** | 44 | **≤ 22** |
   | Elemente mit Rahmen | 117 | **≤ 35** | 60 | **≤ 15** |
   | Schriftgrößen | 12 | **6** (11/13/15/24/38/56) | 7 | **5** |
   | weiße Flächen (Weißglut) außer Linse und Marke | 6 | **1** | – | **1** |
   | kleinste Schrift | 8,5 px | **11 px** | | **11 px** |

   Jede Funktion aus Loopwerk bleibt in höchstens 2 Tipps erreichbar. Die Liste „wohin wandert was“ (`ux.md` §5) ist dafür der Prüfstein.
6. **Look-Grammatik:** Rahmen nur, wo man drückt; alles Einstellbare ist eine Linie. Mono nur für Zahlen, Wörter in Sans, keine Versalien-Etiketten. Gleiche Wörter meinen nicht mehr Verschiedenes (Clip-Blende, Hüllkurve und Lautstärkekurve heißen verschieden). Was nicht unter der Marke klingt, ruht auf 50 %. Rot nur an Knopf, Zeit und Clipanfang der Aufnahme, immer mit Form (Quadrat, Ring, Zeit). Pink nur als Marke und als Mikrofonlicht.
7. **Selbermachen in einem Tipp:** ● nimmt auf, säubert, benennt und legt den Klang als Clip in den laufenden Loop. Läuft ein Loop, wird jeder Durchgang ein Take im selben Clip. „Festhalten“ am Loop-Bereich macht einen Teil des Songs zum neuen Klang. ● kennt seinen Kontext (Mikro, Pads, Tasten), und darunter steht klein die Quelle.
8. **Jede Geste hat einen sichtbaren Zwilling** (Werkbank, Lang-drücken-Menü, Tastatur). Die Werkbank ist eine benannte Region, die Reiter sind eine Tabliste, und die Griffe auf der Welle funktionieren auch mit den Pfeiltasten. Tippziele sind mindestens 44 px groß.
9. **Ruhe als gemeinsame Schicht:** Eine Flächen-Tabelle in `edition.js` und Stufen an den Bedienelementen (`data-tier`) statt `if (edition)` quer durch die UI. So kann Loopwerk dieselbe Ruhe später einschalten.

---

## 4. Größte Gefahr

**Die Werkbank wird der neue Inspektor.** Alles wandert hinein, nichts wird wirklich weniger, und Krachwerk ist am Ende „Loopwerk mit Schublade“: dieselbe Dichte, nur woanders. Das ist ein naher Verwandter des Fehlers, den Martin gerade zurückweist. Die zweite Seite derselben Gefahr: Die Ruhe entsteht durch CSS-Ausblenden über dem dichten Loopwerk-DOM. Dann ist es weder ruhig noch auffindbar.

**Gegenmittel:**
- **Die Zielzahlen aus §3.5 werden ein Test.** Er zählt in jeder Scheibe die sichtbaren Bedienelemente, Rahmen und Schriftgrößen in den Bildern „Start“, „Clip gewählt“ und „Werkbank Mitte“. Wer über das Budget kommt, muss etwas anderes streichen.
- **Grund ≤ 5 Griffe je Reiter** ist eine harte Regel und keine Richtlinie.
- **Ein Inventar als Abnahme:** Jede Loopwerk-Funktion hat genau einen Hauptort und höchstens einen Zwilling, mit Tippzahl.
- **CD-Durchsicht nach jeder Scheibe am echten Handy**, nicht nur am Mockup.

Die zweitgrößte Gefahr ist die alte: Die erste Aufnahme klingt nach Küche. Deshalb gehört das automatische Säubern schon in Scheibe 1.

---

## 5. Reihenfolge

| # | Scheibe | Martin kann danach |
|---|---|---|
| **1** | **Gerüst und erster Laut:** die volle App unter `/werkstatt/`, ohne Kataloge, mit leerem Song und übernommenen Prototyp-Klängen. Dazu die Flächen Song / Kiste (nach Herkunft) / Werkbank (heutiger Inspektor plus Werkzeug am Clip, rechts bzw. als Schublade), die Daumenleiste am Handy, die Schrift- und Rahmenregeln und der Zähltest. ● → säubern (`clean.js`) → Clip im Loop. | Am Handy `/werkstatt/` öffnen, ● tippen, klopfen und den eigenen Klang sofort im Song loopen hören. Den Clip antippen, schieben und kopieren. Die alten Pad-Klänge in der Kiste finden und auf eine Spur ziehen. Denselben Song am Desktop öffnen und die Zählung neben Loopwerk legen. |
| 2 | **Sound-Werkbank:** Klang-Rezept nicht-zerstörend (Schnitt, Ton, Hülle, Farbe, Zeit), Stammbaum-Zeile, „in 3 Clips“ / Als Variante. Sample-Editor und Übernehmen fallen weg. | einen Klang formen, während der Song läuft |
| 3 | **Takes und Festhalten:** Aufnahme im Loop mit Take-Reihe, Festhalten am Loop-Bereich, Speicher DB v2 und Sicherung als ZIP | über den laufenden Song einsingen, den besten Take wählen, einen Teil einfrieren |
| 4 | **Zerlegen, Kit und Instrument:** Kit-Werkbank (Pads und Schritte, groß gezogen als Pad-Wand), „Klatsch dein Kit“, Instrument aus eigener Aufnahme, Pattern-Feinheiten | aus 10 Sekunden Klopfen einen Beat bauen, aus Summen eine Melodie |
| 5 | **Song fertig:** Song-Werkbank (Mischen, Mastering, Export, Projekt), Strom-Regler, Ruhe-Schicht als Option für Loopwerk | einen ganzen Track exportieren und teilen (mit Zutatenliste) |

Der Prototyp bleibt live, bis Scheibe 1 seine Daten übernommen hat.

---

## 6. Entscheidungen für Martin

1. **Werkbank am Desktop: rechts oder unten?**
   a) rechts wie im Mockup B (alle Spuren bleiben sichtbar, nah am Loopwerk-Inspektor) · b) unten über die volle Breite wie bei Magix (lange Wellen, aber nur 3 Spuren sichtbar) · c) frei umschaltbar.
   **Empfehlung: a**, mit ⤢ auf etwa 60 % Breite für lange Aufnahmen und die Rolle.
2. **Wie streng ist „selbst gemacht“?**
   a) streng: nur Mikro und Strom, keine Hilfen · b) mittel: eigene Dateien (Sprachmemos) erlaubt, Analyse und Harmonie-Werkzeuge versteckt dabei (Tonhöhe, Autotune, Tonart-/Akkordzeile), dagegen aus: KI-Erzeugung, Link-Import, Tab-Aufnahme, Begleitautomatik · c) offen: alles aus Loopwerk da, nur ohne Katalog.
   **Empfehlung: b.** Analysieren hilft dir, Erzeugen ersetzt dich.
3. **Was wird aus der Pad-Wand?**
   a) ganz weg · b) nur als Kit-Werkbank (Pads + Schritte) · c) Kit-Werkbank, die groß gezogen zur Pad-Wand fürs Live-Spielen wird.
   **Empfehlung: c.** Sie kostet kaum mehr als b, und das Spielgefühl des Prototyps bleibt erhalten.
4. **Soll Loopwerk die ruhige Oberfläche auch bekommen?**
   a) nein, nur Krachwerk · b) gemeinsam bauen, in Loopwerk erst nach deiner Durchsicht einschalten · c) Loopwerk zieht gleich mit um.
   **Empfehlung: b.** Das Aufräumen passiert einmal, und Loopwerk bleibt stabil, bis du es gesehen hast.
