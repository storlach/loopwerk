# Creative-Director-Review

Neueste Prüfung oben.

---

## Krachwerk 3b Takes (06.11.2026)

**Geprüft:** `shots-3b/` (kw-takes-handy, kw-takes-desktop, kw-rec-lang-handy, kw-aufnahme-reiter-handy), Code `rec-context.js`, `sound-bench.js` (`also`), `clip-float.js`, `take-row.js`, `main.js` (`context`, `startAt:'next-wrap'`), `model.js` `cutSound`. Grundlage: Spec 3 Teil 3b, `synthese.md`, Martins Ziel „ganze Tracks über den laufenden Song einsingen“.

### Urteil

**Der Kern trägt.** Bei laufendem Loop wird ● von selbst zu „Takes“. Der Song läuft ohne Stopp weiter, jeder Durchgang wird ein Take, und danach steht „3 Takes – der letzte spielt.“ Am Clip steht „Take 3/3“, die Werkbank formt alle Takes in einem Schritt. Dafür gibt es keinen neuen Knopf und keinen Dialog, nur ein Wort unter ●. So hatte die Synthese das gemeint. Was noch fehlt: Wer singt, weiß nicht, wann der Take beginnt. Die Kiste zeigt drei gleiche Zeilen, und am Handy verdeckt das Werkzeug die Spur darüber.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Vorher werden die vier „jetzt“-Punkte behoben. Keiner braucht eine neue Spec.

### Punkte

| # | Befund | Lösung (klein) | Wann |
|---|---|---|---|
| a | **Kiste: drei Takes ergeben drei gleiche Zeilen „Aufnah… Einzelklang“** (Desktop). Der Name ist abgeschnitten, deshalb sieht man nicht, welcher Take welcher ist. „Einzelklang“ ist außerdem falsch, denn ein Take ist so lang wie der Loop. | Takes eines Clips stehen in der Kiste als **eine** Gruppe „Aufnahme 1 · 3 Takes“, genau wie „Klopfen · 8 Schnitte“. Darunter steht je Take eine Zeile „Take 1 … 3“ mit ▶, der spielende in Weißglut. Die Länge steht als „2 Takte“ (`kind:'loop'`) statt „Einzelklang“. | **jetzt** |
| b | **Lang drücken auf ● sieht man nicht.** Das zählt nur halb: Der Kontext wählt meist richtig, lang drücken ist der Sonderfall. In der Zeile „Geräusch · Takes“ sieht man aber nicht, was ● ohne Wahl täte, und sie liegt auf dem Einblender (abgeschnittenes „T…“ in kw-rec-lang-handy). | Die Option, die ● gerade nehmen würde, bekommt eine Weißglut-Linie unten. Die Zeile verdrängt `#hint`, oder der Einblender geht zu, solange sie offen ist. Dazu kommt ein Tipp in `tips-make.js` beim ersten ● mit Loop: „Lang drücken: Geräusch statt Takes“. | **jetzt** |
| c | **Handy: das Werkzeug am Clip liegt über Spurname und Clip der Spur darüber** („Loop-Klick“ ist ganz verdeckt). Ursache ist die neue Ausnahme in `clip-float.js`: Ist die Leiste zu breit, darf sie über die Spurköpfe ragen. Dabei steht „3/3“ schon am Clip selbst. | Die Ausnahme zurücknehmen. Am Handy fällt „Take 3/3“ in der Leiste weg, stattdessen wird das „3/3“ am Clip zum Schalter (Tippfläche 44 px, ein Tipp = nächster Take, wie `stepTake`). Danach passt die Leiste rechts der Spurköpfe. Test: Die Rechtecke von Leiste und `.track-head` schneiden sich nicht. | **jetzt** |
| d | **Zerlegen und Zeit wirken nur auf den aktiven Take.** Zerlegen ist hier richtig: Man zerlegt den Take, den man behalten will, und der Clip wird durch die Schnitte ersetzt, also ist das zugleich die Auswahl. Zeit (`setSoundBpm`) ist dagegen ein Bruch, denn danach sind die Takes nicht mehr gleich lang (ADR 009). Weil Takes schon im Song-Tempo entstehen, braucht man Zeit hier aber kaum. | Zeit schreibt auf alle Takes, wie Form über `also`. Bis dahin steht in Zeit und Zerlegen bei Takes klein „gilt für Take 3“ (`--muted`). | später |
| e | **Die Aufnahme beginnt erst am nächsten Loop-Sprung, ● ist dann ein Ring mit „wartet …“.** Das verlangt die Spec so (ohne Stopp, ohne Vorzähler), und es ist richtig. Wer singt, muss aber wissen, **wann** er einsetzen soll. „wartet …“ sagt das nicht, und bei einem Loop von 8 Takten kann das bis zu 16 s dauern. | Im letzten Takt vor dem Sprung zählt der Ring unter ● „4 · 3 · 2 · 1“ (Schläge aus `engine.heardBeat()` bis `loop.endBeat`), vorher steht „wartet …“. Es kommt kein Ton dazu und kein neues Bedienelement. Gilt auch für das Zählbild in der Daumenleiste. | **jetzt** |
| f | Kleinigkeiten: Am Desktop klebt „Loop“ links an ●. „Stopp nach Stille“ im Reiter Aufnahme sieht aus wie ein Hauptknopf (weiße Fläche über die ganze Breite). | Abstand zwischen Loop und ● wie zwischen ▶ und Loop. Der Schalter bekommt die Linienform von `wb-toggle`. | später |

### Was Martin am Handy hören soll

1. **Einsingen über den Loop:** Einen Loop von 2 Takten mit Beat spielen lassen, ● tippen und drei Durchgänge singen. Fühlst du am Zählen, wann es losgeht? Wackelt der Beat beim Start oder beim Sprung?
2. **Liegt der Take im Takt?** Den letzten Take mit Kopfhörer und dann über den Lautsprecher abspielen. Liegt die Stimme auf dem Schlag oder hörbar zu spät? Wenn zu spät: einmal „Einmessen“ im Reiter Aufnahme, dann noch einmal.
3. **Takes vergleichen:** Mit „3/3“ durch die Takes tippen, während der Loop läuft. Ist der Wechsel ohne Knacks, und sind alle gleich laut (gemeinsamer Pegel)?
4. **Form für alle:** Bei Take 2 Hall oder Farbe einstellen, dann auf Take 3 wechseln. Klingt der genauso?
5. **Geräusch trotz Loop:** ● lang drücken und „Geräusch“ wählen. Kommt ein gesäuberter Einzelklang, und läuft der Song dabei weiter?

### Darf es „Krachwerk 1.0“ heißen?

**Ja, sobald die vier „jetzt“-Punkte erledigt sind und Martin Hörprobe 1 und 2 bestanden hat.** Mit den Takes ist der Ablauf vollständig: Geräusch, Kit, Instrument, über den Song einsingen, Festhalten, Export mit Zutatenliste. Hängt der Take am Handy hörbar nach, ist es noch eine Vorschau, egal wie die Oberfläche aussieht. Die Adresse (`/krachwerk/`, Entscheidung 4 aus 3a–5) zieht mit dem Namen um.

---

## Krachwerk Scheiben 3a–5 (03.11.2026)

**Geprüft:** `shots-3a/` (Festhalten Handy und Desktop, Sicherung im alten Song-Fach), `shots-4/` (Start mit Startkarte, Kit, Pad-Wand und Instrument am Handy, Kit und Pad-Wand am Desktop), `shots-5/` (Song-Werkbank je Reiter an beiden Geräten, Export mit Zutatenzeile, Projekt-Feinheiten, `lw-calm-*`). Grundlage: `synthese.md`, Specs `krachwerk-3-festhalten.md`, `-4-kit.md`, `-5-song.md`. **Zählung Endziel:** Desktop *Clip gewählt* 45/13/4/11 (Ziel ≤ 45/≤ 35, Start war 112/117), Handy 17/8/4/11 (Ziel ≤ 22/≤ 15, Start 44/60), Handy *Song Mitte* 22/6. Takes (3b) fehlen, sie warten auf v2.13.

### Gesamturteil

**Ja, Krachwerk trägt Martins Wunsch.** Es ist Loopwerk mit Song, Spuren, Clips, Mischen und Export. Das Material entsteht aber nur aus dem Mikro, und die Oberfläche ist um 60 bis 90 % leiser, ohne dass eine Funktion fehlt (Inventar-Test). Schwach sind zwei Stellen, an denen die Marke sichtbar werden müsste: Das **Kit** wirkt wie ein Formular aus braunen Kacheln mit „Klang 1 · 3“ statt wie die eigenen Schläge. Und der **Export**, also der letzte Schritt, widerspricht sich selbst. Ganze Tracks über den laufenden Song einsingen kann man erst mit den Takes.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Die fünf Punkte mit „jetzt“ unten werden vorher behoben. Keiner braucht eine neue Spec. Als „Krachwerk 1.0“ würde ich es erst mit 3b bezeichnen (siehe Entscheidung 5).

### Gelungen

1. **Die Zahlen sind erreicht, und man sieht es.** 112 → 45 Bedienelemente und 117 → 13 Rahmen am Desktop, am Handy 44 → 17 und 60 → 8. Neben `kw-sicherung-handy.png` (3a: zwei weiße Pillen, Punktzeilen mit Links, „Leeren“ in Rot, Summe ein/aus) zeigt `kw-song-handy-song.png` den Unterschied: Kopf mit einer Weißglut-Fläche, fünf Reiter, vier Griffe, Feinheiten. Die Gefahr aus der Synthese („die Werkbank wird der neue Inspektor“) ist nicht eingetreten. Achtung: Am Desktop steht der Wert genau auf der Grenze 45, Luft gibt es keine mehr. Jedes neue Bedienelement muss ein anderes ersetzen.
2. **Festhalten ist Resampling ohne Dialog.** Es gibt eine Linie „Festhalten“ am Lineal und keinen Kasten. Danach liegt „Schleife 1“ in Schleifen-Grün auf einer neuen Spur direkt unter den Quellen, die Quellen ruhen auf 50 %. Am Desktop ist „Bumm“ an der Bereichsgrenze sichtbar geteilt (links gedimmt, rechts klingt er weiter). Der Einblender sagt in vier Wörtern, was passiert ist. Ein fertiges Loopwerk hat das so nicht, eine Werkbank schon.
3. **Die Startkarte lädt ein.** Auf Spur 1 steht eine einzige weiße Fläche, „● Mach ein Geräusch“, darunter zwei Linien. Sie liegt im Song und nicht in einem Dialog darüber, und sie verschwindet mit dem ersten Clip. Am Ende des Kit-Ablaufs spielt der Groove schon, und der Einblender sagt „7 Schläge – dein Kit spielt.“ Das ist die Spielfreude, die die Marke verspricht.
4. **„2 Geräusche · 0 fremde Samples“.** Diese eine Zeile im Reiter Fertig und nach dem Export ist der Markenkern von Krachwerk in Zahlen. Mit der Zutatenliste in der Teilen-Nachricht und im WAV entsteht etwas, das man gern herzeigt.
5. **Die Ruhe-Schicht funktioniert in Loopwerk.** `lw-calm-desktop.png` ist erkennbar Loopwerk (Katalog, acht Spuren, bunte Kategorien), aber mit Deck, Kiste und eingeklappter Werkbank aus Krachwerk. Die Basis von `/` bleibt dabei exakt. Martin kann über Ruhe für Loopwerk also an einem echten Bild entscheiden statt an einem Mockup.

### Stört

| # | Befund (an den Bildern) | Vorschlag | Wann |
|---|---|---|---|
| 1 | **Der Export widerspricht dem Kopf.** Über „Exportieren“ steht „32 Takte · 1:25“, die Datei ist aber 5,2 s (Handy) bzw. 7,8 s (Desktop) lang. Der Kopf zeigt `lengthBars`, während `exportRange` bis zum Ende des letzten Clips rendert (`src/export.js` `songEndBeat`). Der Regler „Länge“ im Grund des Reiters Song ändert am Export also nichts. Martin wird glauben, der Export sei kaputt. | Der Kopf zeigt, was der Export liefert: „2 Takte · 0:05“ (Bereich + Ausklang), bei „Nur Loop-Bereich“ dessen Länge. „Länge“ wandert in die Feinheiten und heißt dort „Arbeitsfläche“, damit Tempo · Tonart · Klick Grund bleiben. Test: Der Text im Kopf entspricht der WAV-Länge ± 0,1 s. | **jetzt** |
| 2 | **Die Pads zeigen nicht deine Klänge.** Am Handy heißen alle „Klang 1 · 1“ bis „· 7“, obwohl das Kit „Klatschen 1“ heißt. Am Desktop steht „Klopfen · 6, 4, 5, 1“, also durcheinander. Alle sieben Pads haben dieselbe braune Fläche, die Herkunftsfarbe mit Deckkraft. Der Kit-Punkt im Kopf ist dagegen gelb, die Instrument-Tasten sind grau. „Still ist schwarz“ gilt hier nicht, und die Pads sehen nicht nach den eigenen Schlägen aus. | Pads sind still dunkel, wie leere Tasten. Unten haben sie eine Lichtkante in Herkunftsfarbe, beim Anschlag leuchtet die ganze Fläche kurz (motion-designer). Gewählt = Weißglut-Rahmen wie heute. Die Schnitte eines Klatsch-Kits heißen nach dem Kit („Klatschen 1 · 3“), die Nummer folgt der Pad-Reihenfolge (Kick = 1). Die Rolle bleibt als kleine Zeile oben. Gleiches gilt für die Instrument-Tasten, damit Kit und Instrument eine Sprache sprechen. | **jetzt** |
| 3 | **„Klatsch dein Kit“ braucht 3 Tipps, versprochen sind 2** (Spec 4 §2). | Ein Tipp auf die Karte bzw. auf „+ Neu → Kit aus Klatschen“ ist schon das ●: Die Aufnahme startet sofort, mit Zählring statt eines zweiten Ziels, und stoppt nach 2 s Stille. Die Mikrofon-Freigabe des Browsers zählt nicht, beim ersten Mal kommt sie trotzdem. | **jetzt** |
| 4 | **Reiter Fertig: Mastering kostet einen Tipp mehr und sieht fremd aus.** Mastering + Export sind am Handy 4 statt 3 Tipps. Ohne Mastering hat die Testdatei eine Spitze von −15,4 dB, eigene Aufnahmen sind leise. Mastering „an“ ist eine petrolfarbene Fläche mit türkisem Schalter (`kw-fertig-handy.png`), der Stil ein Kasten 2×2. Phosphor sagt: aktiv = Weißglut, Einstellungen sind Linien. | In Krachwerk ist Mastering „Ausgewogen“ **voreingestellt an**. Damit ist Export immer 2 Tipps, und Abschalten ist der Sonderfall (Entscheidung 1). Der Schalter sieht aus wie die übrigen `wb-toggle` (Weißglut-Linie), der Stil ist eine Zeile mit vier Wörtern, das gewählte in Weißglut. „Ziel −14 LUFS · misst …“ wird `--muted`. | **jetzt** |
| 5 | **Einblender liegen weiter auf Griffen** (2b-Auflage 4 ist nicht erfüllt). „7 Schläge – dein Kit spielt.“ deckt die Reiter Kit/Clip und „1 Takt“ ab, „Geteilt: Mein Song.wav“ die Feinheiten. Beides sind Zustände, die man nach jedem Erfolg sieht. | Wie in 2b beschrieben: `#hint` sitzt über der Oberkante der Schublade bzw. über dem Werkbank-Inhalt und schneidet kein sichtbares Bedienelement. Das prüft ein Test, der die Rechtecke vergleicht. | **jetzt** |
| 6 | **Am Handy rutscht das Wichtige unter die Falz.** Bei Kit Mitte zeigen Pads und Schritte nur die Reiterzeile, der Grund (Takte, Swing, Muster) liegt darunter. Im Reiter Projekt scrollt der Kopf samt „Exportieren“ weg. Fünf gleich große Kästen sehen aus wie eine Einstellungsliste, „Sounds zurückholen“ liegt halb unter der Daumenleiste. | Die Pads werden bei Mitte niedriger (64 px), sodass „Muster“ sichtbar bleibt. Der Werkbank-Kopf bleibt beim Scrollen stehen. In Projekt sind Speichern und Öffnen Griffe, der Rest wird eine Zeile ohne Kasten. | später |
| 7 | **Der Pattern-Clip trägt Griffe vom Sound.** Der Clip „Klatschen 1“ zeigt die Griffe für Anfang, Hülle und Ende eines Audio-Clips und ein abgeschnittenes „P“ oben rechts. Die Schritte, die drin sind, sieht man nicht. | Ein Kit-Clip zeigt seine Schläge als Punkte in Pad-Farbe, ohne Hüllkurven-Griffe. Das Kennzeichen „P“ entfällt, der Punkt im Kopf sagt schon, dass es ein Kit ist. | später |
| 8 | **Kleinigkeiten.** Am Desktop-Start leuchten zwei weiße Flächen („Mach ein Geräusch“ und „Exportieren“ bei leerem Song). „Tonart Am · C-Dur“ liest sich wie zwei Tonarten. „in 0 Clips“. Die Reiterzeile hat einen Trennstrich vor „Aufnahme“, der Reiter zeigt bis v2.13 nur einen Schalter. | Exportieren erst ab dem ersten Clip zeigen. „Am (parallel C-Dur)“ oder nur „Am“. Bei 0 Clips steht nichts. Den Reiter Aufnahme bis v2.13 in die Feinheiten von Song legen, dann gibt es vier Reiter. | später |

### Was Martin am Handy prüfen und hören soll

1. **Klatsch dein Kit:** 10 s auf Tisch, Knie und Brust schlagen. Liegt das Dunkle auf Kick und das Helle auf Hi-Hat? Groovt „Gerade“, und taugen „Halb“ und „Breaks“ beim Durchtippen?
2. **Pad-Wand live:** Schublade ganz hoch, über den laufenden Loop spielen. Kommt der Anschlag sofort, oder spürst du Verzögerung? Landet ● mit Pads auf dem Raster, wo du es gemeint hast?
3. **Summen wird Instrument:** einen Ton summen, Ton → Als Instrument, Tasten spielen. Ist der Grundton richtig? Wie viele Tasten nach oben und unten klingt es noch nach dir und nicht nach Micky Maus?
4. **Festhalten:** Loop mit Hall festhalten und mit ↶/↷ Quelle und Schleife vergleichen. Klingt es gleich, springt der Ausklang am Loop-Ende?
5. **Ganzer Track bis zum Teilen:** mit Mastering „Ausgewogen“ exportieren, über Teilen an dich selbst schicken, am Handy-Lautsprecher und an Boxen hören. Laut genug, nicht gequetscht? Liest du die Zutatenliste in der Nachricht gern?
6. **Sichern am iPhone:** „Alle eigenen Sounds sichern“ und danach „Sounds zurückholen“. Kommt die Datei in Dateien/iCloud an, und meldet der Einblender, wie viele zurück sind?

### Entscheidungen für Martin

1. **Mastering in Krachwerk von Anfang an an?** *Empfehlung: ja, „Ausgewogen“.* Eigene Aufnahmen sind leise (Test: −15 dB Spitze), und Export ist dann immer 2 Tipps.
2. **Was exportiert „Exportieren“?** a) bis zum Ende des letzten Clips (heute) · b) die eingestellte Songlänge. *Empfehlung: a*, der Kopf zeigt die echte Länge, „Länge“ wird „Arbeitsfläche“ in den Feinheiten.
3. **Ruhe in Loopwerk** (`lw-calm-*.png` ansehen): a) bleibt aus · b) Schalter in den Einstellungen · c) wird Standard. *Empfehlung: b*, nach zwei Wochen eigener Nutzung c.
4. **Adresse:** bleibt `/werkstatt/` oder zieht nach `/krachwerk/` um (Daten bleiben, alte Adresse leitet weiter). *Empfehlung: Name „Krachwerk“ festlegen und zusammen mit 3b umziehen.* Dann ändert sich die installierte App nur einmal.
5. **Wann heißt es „Krachwerk 1.0“?** *Empfehlung: erst mit den Takes (3b).* „Über den laufenden Song einsingen“ ist der Ablauf, der aus Geräuschen Tracks macht. Bis dahin ist es eine Vorschau.
6. **Rollen auf den Pads:** Fachwörter (Kick, Snare, Hi-Hat) oder Klangwörter (Tief, Mitte, Hell …)? *Empfehlung: Fachwörter klein lassen*, groß steht dein Klang (Stört 2). Die Wörter sagen, wohin das Muster schlägt, und jeder Beat-Bastler kennt sie.

---

## Krachwerk Scheibe 2b (03.11.2026)

**Geprüft:** alle sieben Bilder in `docs/ux/krachwerk-brainstorm/shots-2b/` (Zerlegen Handy und Desktop, Kiste mit Schnitten, 56-px-Schublade, Zeichen auf Desktop, Handy und Ladeschirm), daneben `shots-2a/`. Grundlage: `docs/specs/krachwerk-2b-zerlegen.md`, `synthese.md`, meine 2a-Auflagen. **Zählwerte:** Desktop *Clip gewählt* 44/11/4/11 (Grenze 45), Handy *Mitte, Zerlegen* 26/7/4/11 (Grenze 26/13). Die Bilder vom Zerlegen sind um 08:45 entstanden, vor dem Commit mit dem Zeichen. Deshalb tragen sie noch Loopwerks bunte Balken, die Zeichen-Bilder (08:54) zeigen den Stand danach. Form-Reiter und Clip im Song mit Rezept sind in 2b nicht abgebildet. Die 2a-Auflagen #2 (vier Griffe auf zwei Punkten) und #6 (roh/geformt) konnte ich deshalb nicht nachprüfen.

### 1. Urteil

**Zerlegen ist die erste Funktion, die nur Krachwerk hat, und sie sitzt an der richtigen Stelle:** Sie ist ein Reiter der Werkbank mit fünf Griffen und kein Editor-Fenster. Der Ablauf in drei Tipps hält, wie in der Spec versprochen. Schwach ist die Welle: Sie zeigt nicht, was man zerlegt, und der Hauptgriff „Auf die Spur“ sieht aus wie ein Nebengriff.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Die Punkte 1 bis 4 aus Abschnitt 3 („jetzt“) werden vorher behoben. Keiner braucht eine neue Spec. Ohne Punkt 1 kann Martin die Frage „findet es die Schläge, die du hörst?“ nicht beantworten, weil er die Schläge nicht sieht.

### 2. Was gelungen ist

1. **Mehr Werkzeug, aber nicht mehr Lärm.** Mit dem neuen Reiter sinkt der Desktop auf 44 Bedienelemente (2a: 45), das Handy bleibt bei 26 und hat jetzt 7 statt 8 Rahmen. Der Sample-Editor ist ganz weg. Seine Funktionen leben als Zwillinge in Form, Ton und Zerlegen weiter, und das prüft der Test für jeden `ed-`-Knopf einzeln. So hatte die Synthese „ein Ort für den Klang“ gemeint.
2. **2a-Auflage #1 ist erfüllt: Am Handy zeigt „Mitte“ jetzt den ganzen Grund.** Die Titelzeile „Werkbank“ ist entfallen, der Name des Klangs ist die Überschrift. Alle fünf Griffe und „Feinheiten ▾“ liegen über der Daumenleiste, über der Schublade sind beide Spuren sichtbar. Dazu sind #3 bis #5 erledigt: „Einzelklang“ statt „One-Shot“ in der Kiste, „50 %“ mit Einheit in Sans, Einblender „Rückgängig: Zerlegen“ bzw. „Wiederholt: Zerlegen“ und am Desktop keine Tonart- und Akkordzeile mehr.
3. **Die Marken sehen aus wie ein Maßband auf der Werkbank.** Es sind senkrechte Linien mit kleiner Nummer darüber, die gewählte steht in Weißglut, sonst gibt es nichts Zusätzliches (keine Kästchen, keine Farbe). Das hält die Phosphor-Grammatik („Einstellungen sind Linien“) ein. Die 2a-Griffe sind in diesem Reiter ausgeblendet, sodass auf der Welle nur eine Art Griff liegt.
4. **Die Kiste erzählt den Stammbaum weiter.** „Klopfen · 8 Schnitte“ steht als Gruppe unter dem Eltern-Sound, und darunter steht jeder Schnitt als eigenes Objekt mit ▶. Der Zähler der Gruppe „Dinge 10“ stimmt. Zusammen mit der Rezeptzeile aus 2a ist das der rote Faden von Krachwerk: Man sieht, was aus dem eigenen Geräusch geworden ist.
5. **Das Zeichen ist eigenständig und überall dasselbe.** Es ist ein pinker Klatscher aus sieben Balken, symmetrisch um die Mittellinie. Er steht auf dem Ladeschirm (mit Schein), im Deck neben der Wortmarke und im Fuß des Song-Fachs. Loopwerks Balken in Kategoriefarben sind damit abgelöst, und Rot bleibt dem ● vorbehalten. Dass er beim Spielen mit dem Pegel ausschlägt (nur über `transform`), ist die richtige Übersetzung von „Was klingt, leuchtet“. Auf Standbildern kann ich das nicht beurteilen (siehe 4.5).

### 3. Was stört (nach Gewicht)

| # | Befund (gemessen an den Bildern) | Vorschlag | Wann |
|---|---|---|---|
| 1 | **Die Welle zeigt die Schläge nicht.** Am Handy ist der 10-s-Klopfer eine gepunktete Linie mit vier winzigen orangen Strichen. Am Desktop sieht man fünf Ausschläge, die leisen Schläge (−12 bis −18 dB) gar nicht. Ob Marke 2 oder 3 auf einem Schlag sitzt, kann man nicht sehen. Am Desktop liegt der erste sichtbare Schlag zwischen Marke 1 und 2, und für Marke 2 ist kein Schlag erkennbar. Beim Zerlegen ist die Welle aber das Werkstück: Ohne sie ist „Empfindlichkeit“ ein Blindregler, und Marken verschieben ist Raten. | Im Reiter Zerlegen zeichnet die Welle die Hüllkurve in **dB-Skala** (Boden etwa −48 dB) als gefüllte Fläche in Herkunftsfarbe. Dann haben auch −18-dB-Schläge sichtbare Höhe. Die Marke sitzt 3 ms vor dem Anstieg und damit erkennbar am Fuß des Schlags. Prüfung durch den ui-designer am Testklopfen: Alle 8 Schläge sind auf dem Handybild ohne Vergrößerung zu sehen. | **jetzt** |
| 2 | **Der dritte Tipp hat kein Gewicht, und „aktiv“ ist grau.** „In die Kiste“ und „Auf die Spur“ sind gleich große, gleich graue Flächen, obwohl „Auf die Spur“ der Schluss des Hauptablaufs ist (§0). Der gewählte Umschalter „An Anschlägen“ ist eine hellgraue Fläche. Das liest sich eher wie gesperrt als wie gewählt. Phosphor sagt: aktiv = Weißglut. | „Auf die Spur“ wird der einzige gefüllte Griff des Reiters (Weißglut-Fläche, dunkle Schrift, wie „Exportieren“ im Deck). „In die Kiste“ wird eine Linie. Der gewählte Umschalter hat Weißglut-Schrift mit Weißglut-Linie unten, der andere `--muted` ohne Fläche. Der Baustein gilt für alle `wb-toggle`. | **jetzt** |
| 3 | **Im Song heißen alle Schnitte „Klopfen“.** In `kw-kiste-schnitte.png` sind die acht Clips 30 bis 60 px breit. Sichtbar sind „Klopfen“, „Klop“ oder „Klopfe“, die Nummer, die sie unterscheidet, wird immer abgeschnitten. Man kann den vierten Schnitt im Song nicht finden, ohne jeden anzutippen. | Bei Clips, deren Sound eine `group` hat, steht die Nummer vorn („4 · Klopfen“). Ist der Clip schmaler als der Name, steht nur „4“. Die Kiste bleibt bei „Klopfen · 4“. | **jetzt** |
| 4 | **Der Einblender liegt auf der 56-px-Schublade.** In `kw-zu-handy.png` verdeckt „Rückgängig: Zerlegen“ den Kopf der Schublade (von „in 1 Clip“ bleibt „lip“ sichtbar) und reicht bis an „Als Variante“. Genau diesen Zustand sieht man nach jedem Zurücknehmen am Handy. | Der Einblender sitzt immer über der Oberkante der obersten Schublade (bei „zu“ also über den 56 px) und überdeckt keinen Griff. Test: Das Rechteck von `#hint` schneidet kein sichtbares Bedienelement. | **jetzt** |
| 5 | **Der Kopf der Werkbank ist unruhig gesetzt.** Am Handy stehen zwischen Punkt und Name rund 60 px Lücke, und „in 1 Clip“ hängt 20 px höher als Name und „Als Variante“ (andere Grundlinie). Die Rezeptzeile beginnt links vom Punkt. Am Desktop ist es enger, aber gleich. | Punkt, Name, „in 1 Clip“ und „Als Variante“ stehen auf einer Grundlinie. Der Punkt hat 44 px Tippfläche, sichtbar aber nur 12 px, und der Name folgt 8 px danach. Die Rezeptzeile beginnt bündig unter dem Namen. | später |
| 6 | **Kleinigkeiten an Kiste und Song-Fach.** Die Gruppenzeile „Klopfen · 8 Schnitte“ ist weniger eingerückt als der Name ihres Eltern-Sounds (43 statt 48 px) und wirkt dadurch wie eine neue Gruppe. Im Song-Fach am Handy bricht „Länge 32 Takte“ in zwei Zeilen, und der Titel „unbenannt“ ist anders eingerückt als „Tempo“. Ladeschirm und Fuß setzen Wörter in Mono mit Laufweite („Lädt Programm …“, „VERSION 2.8“) und sind englisch („Private use only“). | Gruppenzeile bündig mit dem Eltern-Namen + 16 px, mit ▸/▾ vorn statt hinten. „32 Takte“ in einer Zeile. Ladeschirm: Wörter in Sans, nur „0 %“ in Mono. Ob „Private use only“ englisch bleibt, entscheidet Martin (gilt auch für Loopwerk, also außerhalb der Edition). | später |

### 4. Was Martin am Handy prüfen und hören soll

1. **Eigenes Klopfen in drei Tipps:** 10 s auf den Tisch klopfen, Clip antippen, Zerlegen, Auf die Spur. Klingt es danach genau wie vorher, oder hörst du an den Grenzen Klicks oder Löcher?
2. **Findet es deine Schläge?** Bei Empfindlichkeit 50 %: Stimmt die Zahl der Marken mit den Schlägen, die du gehört hast? Wie weit musst du ziehen, bis auch ein leiser Schlag dazukommt?
3. **Marken mit dem Daumen:** Eine Marke waagerecht verschieben, zwischen zwei Marken tippen (hört vor), eine Marke doppelt antippen (löscht). Triffst du die Marke beim ersten Mal? Bleibt die Schublade dabei stehen, und löschst du nie aus Versehen?
4. **Ins Raster und Autotune:** Mit „Ins Raster“ an, groovt es besser, oder ist das Gefühl weg? Dann Autotune an deiner Stimme mit halber Stärke und einmal mit Roboter. Ist das brauchbar?
5. **Das Zeichen beim Spielen:** Loop starten und auf den Klatscher im Deck schauen. Schlägt er mit der Musik aus, ohne zu flackern, und kommt er nach dem Stoppen ruhig in seine Grundform zurück?

---

## Krachwerk Scheibe 2a (03.11.2026)

**Geprüft:** alle neun Bilder in `docs/ux/krachwerk-brainstorm/shots-2a/` (Handy je Reiter Form/Ton/Farbe/Zeit/Clip, Handy Clip gewählt, Desktop Clip gewählt, ⤢ breit, Kiste), daneben `shots-1b/` (gleiche Lage) und die Aufnahmefolge in `tests/werkstatt.test.cjs`. Grundlage: `docs/specs/krachwerk-2-werkbank.md`, ADR 010, `synthese.md`, meine Durchsicht von Scheibe 1. **Zählwerte (Clip gewählt):** Desktop 57/33/4/11 → **45/11/4/11** (Endziel 45/35/6/11: Bedienelemente erreicht, Rahmen weit darunter), Handy 17/8/4/11, Handy *Werkbank Mitte* 26/8/4/11 (Budget 26 genau ausgeschöpft). Nicht umgesetzt laut ui-engineer: Krachwerk-Zeichen im Deck, 56-px-Zustand der Schublade, Werkbank für einen Sound aus der Kiste.

### 1. Urteil

**Am Desktop ist „mehr Raum fürs Selbermachen“ jetzt sichtbar, am Handy erst halb:** Die Werkbank ist kein Inspektor mehr, sondern ein Klang mit Welle, Herkunft und Rezept. Auf „Mitte“ sieht man am Handy aber nur die Welle und einen einzigen Griff des Reiters.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Die Punkte 1 bis 5 aus Abschnitt 3 („jetzt“) werden vorher behoben. Keiner braucht eine neue Spec. Martin bekommt dazu den Hinweis, dass er den Weg von der Kiste in die Werkbank (lange drücken) und den 56-px-Zustand noch nicht prüfen kann.

### 2. Was gelungen ist

1. **Die Werkbank hat die Seite gewechselt, vom Formular zum Klang.** Neben `shots-1b/kw-clip-desktop.png` fehlen jetzt Laufzeit-Knöpfe, „Bearbeiten“, der Spurblock mit M/S/Panorama, „Verlauf“ und „Länge in Takten“. Stattdessen steht oben die Welle über die volle Breite (120 px) mit Anfang und Ende als Linien. Die Rahmen sinken von 33 auf 11, die Bedienelemente von 57 auf 45. Das ist die Gegenwehr gegen die größte Gefahr aus der Synthese („die Werkbank wird der neue Inspektor“), und zwar sichtbar und nicht nur gezählt.
2. **Eine Herkunft, eine Farbe, überall.** Punkt in der Kiste, Punkt am Spurkopf, Clip im Song, Punkt im Kopf und Welle in der Werkbank haben dieselbe Farbe („Körper“ gelb, „Dinge“ orange). Pink ist aus dem Song verschwunden. Die Kiste nach Material (Dinge · Strom · Schleife mit Zählern) ist damit gleichzeitig Legende und Ordnung. Damit ist Befund 7 aus Scheibe 1 erledigt.
3. **Die Stammbaum-Zeile ist das eigenständigste Stück der Scheibe.** „Dinge · Aufnahme 03.11. 00:07 → gestimmt −1 · 0,53 s“ liest sich wie ein Rezept, bleibt dabei eine leise Zeile (13 px, `--muted`) und wächst mit jedem Griff. So etwas hat kein Magix und kein Koala. Es erzählt, dass der Klang von dir kommt.
4. **Die Reiter halten die Disziplin.** Je Reiter 3 bis 4 Griffe im Grund, „Feinheiten ▾“ für den Rest. Gesperrte Griffe stehen nicht da (Zeit bei Einzelklang: nur Dehnen, kein ÷2/×2). Der Reiter „Clip“ ist mit einer senkrechten Linie abgesetzt, und so sieht man ohne Erklärtext, wo „alle Clips“ aufhört und „dieser Clip“ beginnt.
5. **Die Auflagen aus Scheibe 1 am Clip sind sauber umgesetzt.** Am Handy steht das Werkzeug jetzt in der Reihenfolge Werkbank · Teilen · Kopie · Löschen, Löschen also außen, und es beginnt rechts vom Spurkopf. Der Spurname steht voll („Bumm 1“ statt „Bum…“). Die Blendengriffe sitzen unter dem Clipnamen. Am Desktop sind Fachleiste und Panorama-Knopf verschwunden.

### 3. Was stört (nach Gewicht)

| # | Befund (gemessen an den Bildern) | Vorschlag | Wann |
|---|---|---|---|
| 1 | **Am Handy zeigt „Mitte“ den Grund des Reiters nicht.** Die Schublade beginnt bei y = 414 (CSS-px), die Reiterleiste endet bei 684, die Daumenleiste beginnt bei 772. Für den Grund bleiben 88 px, das reicht für einen Griff (Form: nur Lautstärke, Anschlag halb, Ausklang und Rückwärts unsichtbar). Die Spec verlangt auf „Mitte“ „Kopf, Welle, Reiterleiste und den Grund des gewählten Reiters“. Gleichzeitig liegen über der Schublade 74 px leerer Song (Spuren enden bei 340), und die Titelzeile „Werkbank“ kostet rund 34 px, obwohl der Name des Klangs direkt darunter steht. | (a) Titelzeile „Werkbank“ entfällt, sobald ein Klang oder eine Spur gewählt ist, der Name ist die Überschrift. (b) Auf „Mitte“ ist die Welle 72 px hoch (96 px erst auf „oben“). (c) Ein Griff am Handy ist **eine Zeile von 48 px**: Wort links, Wert rechts, Linie darunter ohne eigene Zeile für die Beschriftung (heute rund 63 px je Griff). (d) „Mitte“ beginnt unter der letzten belegten Spur, höchstens bei 50 %. Prüfung im Test: Auf „Mitte“ liegen alle Griffe von `.wb-grund` des Reiters Form vollständig über der Daumenleiste. | **jetzt** |
| 2 | **Vier Griffe auf der Welle teilen sich zwei Punkte.** Anschlag und Ausklang stehen bei 0 ms genau auf den oberen Enden von Anfang und Ende. Im Bild sieht man zwei Punkte, nicht vier. Mit dem Daumen ist nicht zu sagen, ob man kürzt oder ausblendet, und der häufigste Zug aus §0 („kürzt ihn auf der Welle“) trifft womöglich den Ausklang. | Anfang und Ende greift man **unten** (Fähnchen am Fuß der Linie, Tippfläche 44 px), Anschlag und Ausklang **oben** als Punkte auf der Hüllkurve. Bei 0 ms sitzt der Hüllkurven-Punkt 12 px nach innen versetzt. Die Hüllkurven-Linie selbst ist dünner als die Schnittlinien. | **jetzt** |
| 3 | **Wörter in Mono und doppelte Wörter.** „−1 Halbtöne“, „0 Cent“, „0 ms“, „0 dB“, „100 %“ stehen in Mono mit weiter Laufweite (Lücke zwischen „0“ und „dB“). „Halbtöne“ steht zweimal in einer Zeile (Beschriftung und Wert). „Lautstärke“ heißt im Reiter Form der Sound (0 dB in der Mitte, Skala −24…+12) und im Reiter Clip der Clip (0,0 dB ganz rechts), mit zwei Zahlenformaten. In der Kiste heißt ein Einzelklang „One-Shot“, im Reiter Zeit „Einzelklang“. Die Synthese sagt: Mono nur für Zahlen, gleiche Wörter meinen nicht Verschiedenes. | Einheit in Sans (`--muted`), Zahl in Mono, normale Laufweite. Halbtöne zeigt nur die Zahl zwischen − und +. Im Reiter Clip heißt der Griff „Clip-Lautstärke“, beide Werte mit einer Nachkommastelle. Die Kiste sagt „Einzelklang“ (Edition-Wort, Loopwerk bleibt). | **jetzt** |
| 4 | **Der Einblender lügt nach ↶.** In `kw-clip-desktop.png` und `kw-breit-desktop.png` steht „„Bumm 1 b“ – eigener Klang nur für diesen Clip.“, obwohl die Variante schon zurückgenommen ist: Der Kopf zeigt „Bumm 1 · in 2 Clips“, die Kiste keine Variante (laut Test wurde vorher `undo()` gerufen). Wer nach „Als Variante“ sofort zurücknimmt, liest das Gegenteil von dem, was gilt. | Ein Undo oder Redo ersetzt einen laufenden Einblender (wie in Loopwerk: „Rückgängig: Als Variante“) oder schließt ihn. | **jetzt** |
| 5 | **Zwei Auflagen aus Scheibe 1 sind am Desktop offen geblieben.** Tonart- und Akkordzeile stehen am Desktop weiter da (44 px, zweimal „Am“), am Handy sind sie richtig weg. Mit ⤢ zeigt der Song rund 3,4 Takte statt mindestens 4 (Spurfläche 217–555 px, 96 px je Takt). | Die Stufe für Tonart- und Akkordzeile gilt für beide Breiten. Bei ⤢ ist die Werkbank so breit, dass 4 Takte Platz haben (bei 1400 px etwa 56 % statt 60 %), oder der Zoom passt sich an. Der vorhandene Test für 4 Takte misst die Spurfläche ohne Spurköpfe. | **jetzt** |
| 6 | **Roh und geformt sind im Song kaum zu unterscheiden.** Der Clip ohne Rezept (Form-Bild) und mit „gestimmt −1“ (Ton-Bild) sehen fast gleich aus: Punkte mit ein paar Strichen, die zweite Fassung ist nur etwas dichter. Die Idee „Roh = Korn, geformt = Lichtstrich“ kommt beim Hinsehen nicht an. | Geformt zeichnet die Welle als geschlossenen Lichtstrich in voller Farbe, roh nur Punkte mit 50 %. Prüfung durch den ui-designer an zwei Clips nebeneinander. | später (vor 2b) |
| 7 | **Am Desktop bleibt die Werkbank unten leer, und der Herkunftspunkt ist klein.** Unter „Feinheiten ▾“ liegen bei Reiter Form rund 150 px schwarz, bei Ton rund 230 px. Gleichzeitig ist der Punkt im Kopf (Tipp → Material) nur etwa 12 px groß, ohne sichtbaren Hinweis, dass man ihn drücken kann. | Am Desktop sind die Feinheiten aufgeklappt, sobald sie ohne Scrollen hineinpassen (gemerkt bleibt der Zustand trotzdem). Der Punkt bekommt eine Tippfläche von 44 px und beim Darüberfahren einen Ring. | später |
| 8 | **Offene Kleinigkeiten am Rand:** Das Deck trägt noch Loopwerks Balken statt des Krachwerk-Zeichens. Der Startgriff der Marke liegt im Lineal weiter über der „1“ (Desktop und Handy). Am Desktop-Spurkopf sind M/S ganz verschwunden; die Synthese wollte sie dort als Buchstaben (jetzt 2 Klicks über die Spur-Werkbank). | Das Zeichen kommt mit dem motion-designer vor 2b. Der Startgriff bekommt einen Versatz unter die Zahl. M/S: Martin entscheidet beim Durchsehen, ob ihm die Buchstaben fehlen. Die Budgets lassen 2 Bedienelemente nicht zu, dafür müsste woanders gestrichen werden. | später |

### 4. Was Martin am Handy prüfen und hören soll

1. **Dunkler im laufenden Loop:** Loop starten, Clip antippen, Reiter Farbe, „Dunkler“ langsam ganz zu und wieder auf ziehen. Knackst oder stottert es zwischendurch, und hörst du die Änderung in allen Clips gleichzeitig?
2. **Kürzen mit dem Daumen:** Den Ende-Griff eines Klopfers nah an den Anschlag ziehen. Erwischst du das Ende (und nicht den Ausklang), bleibt die Schublade dabei stehen, und klingt der Schnitt ohne Klick?
3. **Tiefer und wärmer an der Stimme:** Halbtöne −12 und +12 an einer Stimm-Aufnahme, dann Wärme ganz auf. Brauchbar, warm oder schon kaputt?
4. **Als Variante:** Bei zwei Clips desselben Klangs einen wählen, „Als Variante“, dann den Klang verändern. Bleibt der andere Clip gleich? Steht „Bumm 1 b“ in der Kiste eingerückt unter „Bumm 1“?
5. **Herkunft setzen:** Auf den Punkt im Kopf tippen und „Körper“ wählen. Wechselt die Farbe in der Kiste, am Spurkopf und im Song gleichzeitig, und triffst du den Punkt beim ersten Versuch?

---

## Krachwerk Scheibe 1 (02.11.2026)

**Geprüft:** Bilder in `docs/ux/krachwerk-brainstorm/shots-1b/` (alle sieben, Deck und Clip in Ausschnitten vergrößert), Vergleich mit `shots/ist-*.png` und Richtung B in `richtungen.png` (Ausschnitte). Dazu die App selbst unter `/werkstatt/` per Playwright, Handy 390×844 (Touch) und Desktop 1400×820, mit einem Clip „Bumm 1“ auf Spur 1 und gewählt. Gemessen habe ich mit `tests/count.cjs` und an den Rechtecken von Werkzeug, Spurköpfen und Spuren. Grundlage: `synthese.md` (Zielbild), `docs/specs/krachwerk-1-geruest.md`.

**Zählwerte (Clip gewählt), selbst nachgemessen:** Desktop 54 / 30 / 4 / 11, Handy 18 / 8 / 4 / 11 (Bedienelemente / Rahmen / Schriftgrößen / kleinste). Handy *Start* 15 / 4, *Werkbank Mitte* 23 / 13. Damit sind die 1b-Budgets eingehalten, und am Handy liegt der Wert schon unter dem Endziel (22 / 15). Keine Konsolenfehler.

### 1. Urteil

Das Gerüst trägt drei von vier Teilen von Martins Wunsch: Es ist erkennbar Loopwerk, es ist deutlich ruhiger, und alle Funktionen sind da. Der vierte Teil, „mehr Raum fürs Selbermachen“, ist noch nicht zu sehen: Die Werkbank ist der alte Inspektor, ⤢ nimmt dem Song den Platz weg, statt dem Klang welchen zu geben, und der leere Start lädt nicht zum ersten Geräusch ein.

**Freigabe zur Durchsicht an Martin: ja, mit Auflagen.** Die Punkte 1 bis 5 aus Abschnitt 3 („jetzt“) werden vorher behoben. Alle sind klein, keiner braucht eine neue Spec. Martin soll dabei ausdrücklich erfahren, dass er in Scheibe 1 Lage, Ruhe und den ersten Laut beurteilt und noch nicht die Werkbank. Die Werkbank kommt mit Scheibe 2.

### 2. Was gelungen ist

1. **Die Ruhe ist echt und nicht nur ausgeblendet.** Am Handy zählt das Bild „Clip gewählt“ 18 Bedienelemente und 8 Rahmen, in Loopwerk sind es 43 und 27. Das liegt unter dem Endziel. Es gibt nur noch vier Schriftgrößen, die kleinste hat 11 px, und die Versalien-Etiketten sind weg. Neben `ist-handy-clip.png` liest sich `kw-clip-handy.png` wie eine andere Klasse von Ruhe, obwohl beide auf demselben DOM laufen. So hatte die Synthese die Ruhe-Schicht gemeint.
2. **Die Daumenleiste setzt die Entscheidung genau um:** Kiste · ▶ · ● · Werkbank, 64 px hoch, das ● hat eine Tippfläche von 92 × 64 px. Die beiden häufigsten Tipps liegen in der Mitte unter dem Daumen, und oben steht nur, was man liest (Name, Takt, Tempo, ↶ ↷).
3. **Die Werkbank-Schublade lässt den Song stehen.** Auf „Mitte“ beginnt sie bei y = 414. Darüber bleiben beide Spuren, der Clip und die Marke sichtbar. Damit ist die größte Gefahr von Richtung B („die Werkbank frisst die halbe Bühne“) für das Handy gebannt.
4. **Das Werkzeug am Clip ersetzt die Clipleiste mit fünf Knöpfen durch drei Wörter direkt am Objekt** („Teilen · Kopie · Löschen“, 52 px hoch, ohne Rahmen). Das ist die Grammatik „Rahmen nur, wo man drückt“, und es ist der richtige Schritt weg vom Inspektor als Werkzeugkasten.
5. **Die Kiste nach Quelle mit „+ Neu“ statt der Reiter Suchen/Erstellen** ist die eigenständigste Fläche der Scheibe. Die Gruppen tragen Zähler und einen Herkunftspunkt, Filterchips, Sortierung und Genre fehlen, und man vermisst sie nicht. **Rot ist eingehalten:** Es erscheint nur am ● (Punkt, also mit Form) und an „Löschen“. Sonst ist nirgends Rot zu sehen.

### 3. Was stört (nach Gewicht)

| # | Befund (gemessen) | Vorschlag | Wann |
|---|---|---|---|
| 1 | **Das Werkzeug am Clip verdeckt die Spurköpfe.** Am Handy beginnt es bei x = 89, der Spurkopf endet bei 124. Es liegt also 35 px über dem Kopf von Spur 2, mitsamt dem ⋯-Menü. Am Desktop mit ⤢ beginnt es bei x = 336, der Kopf endet bei 433. Dort liegt es 97 px über M, S und dem Panorama-Knopf von Spur 2. Am Handy steht außerdem das rote „Löschen“ direkt neben „Werkbank“, dem Knopf, den man dort am häufigsten tippt. | Das Werkzeug nur im Spurbereich halten (linke Kante ≥ rechte Kante der Spurköpfe, nicht nur innerhalb `#arr-wrap`). Liegt der Clip am linken Rand, beginnt es bündig am Spuranfang. Reihenfolge am Handy: **Werkbank · Teilen · Kopie · Löschen**, Löschen also außen und mit Abstand. Der Test aus §7 („deckt den Clip nicht ab“) bekommt die Prüfung „deckt keinen Spurkopf ab“. | **jetzt** |
| 2 | **⤢ erdrückt den Song.** Mit Werkbank auf 60 % bleiben am Desktop für den Arranger 296 px, für die Spuren davon etwa 117 px. Das ist gut ein Takt (`kw-breit-desktop.png`). Damit dreht ⤢ die Absicht der Synthese um, denn lange Aufnahmen sieht man jetzt schlechter im Zusammenhang. | Beim Breitziehen klappt die Kiste automatisch auf 24 px zu und beim Zurückschalten wieder auf (der Zustand der Kiste bleibt gemerkt). Die 60 % beziehen sich auf die Breite rechts der Kiste. Der Song muss mindestens 4 Takte zeigen, und das gehört in den 1b-Test. | **jetzt** |
| 3 | **Der leere Start spricht nicht.** Man sieht zwei leere Spuren, 700 px schwarzen Grund und in der Kiste „Keine Sounds gefunden.“, eine Fehlermeldung statt einer Einladung. Wer `/werkstatt/` zum ersten Mal öffnet, weiß nicht, dass ● hier ohne Vorzähler sofort einen Clip macht. Genau diesen Ablauf soll Martin aber prüfen. | Die Startkarte gehört weiter zu Scheibe 4. Jetzt nur zwei Leerzustände, die sofort verschwinden: In der leeren Spur 1 steht leise eine Zeile „● tippen, dann ein Geräusch machen“ (`--muted`, 13 px, kein Kasten). Die leere Kiste sagt „Noch nichts aufgenommen“. Das ist ein Leerzustand und kein Erklärtext und verträgt sich damit mit der Regel „keine Erklärtexte“. | **jetzt** |
| 4 | **Tonart- und Akkordzeile kosten am Handy 88 px**, also mehr als eine Spur (62 px), und zeigen nur zweimal „Am“. Dazu kommen 44 px Lineal und 44 px Zeile für Raster und Loop. Vor der ersten Spur sind damit 200 px von 844 verbraucht. Am Desktop kosten die beiden Zeilen 44 px. Das Zielbild sagt „Tonart- und Akkordzeile nur auf Wunsch“. | In `calm` bekommen beide Zeilen Stufe 3, solange der Song keine Tonart- oder Akkordwechsel hat. Zwilling ist das Song-Fach (Tonart steht dort), der Eintrag kommt in `EDITION.twins`. Sobald ein Wechsel gesetzt ist oder „Einsingen“ eine Tonart erkennt, erscheinen die Zeilen. | **jetzt** |
| 5 | **Die Werkbank ist der alte Inspektor**, und man sieht es an den toten Teilen: ausgegraute Knöpfe „÷2 · ×2 · Als Song-Tempo · A/B“, ein leeres Feld „–“, „Einzelklang · Tempo eingeben“ in Mono (Wörter in Mono verstoßen gegen §5.6), am Desktop M/S doppelt (Spurkopf und Werkbank). Ein Einzelklang hat kein Sound-Tempo. Der Block ist für ihn reines Rauschen und an der Stelle, an der das Selbermachen Raum bekommen soll. | **Jetzt:** In `calm` stehen gesperrte Bedienelemente nicht sichtbar da. Den Block Sound-Tempo bei Einzelklang ganz weglassen. Werte, die aus Wörtern bestehen („aus“, „Mitte“, „Einzelklang“), in Sans setzen. **Scheibe 2:** Welle in voller Breite oben, Reiter mit ≤ 5 Griffen, Spurabschnitt nur noch auf eigener Auswahl. | **jetzt** (gesperrte Knöpfe, Mono) / Scheibe 2 (Rest) |
| 6 | **Das Deck ist am Desktop handwerklich unsauber.** Die Wortmarke steht in zwei Größen und zwei Schriften („Krach“ 15 px Funnel Display 300, „werk“ 13 px Funnel Sans fett, der calm-Block erfasst `.brand-name b` nicht). Das Zeichen davor ist noch Loopwerks Balken in Kategoriefarben, nicht der pinke Klatscher aus `krachwerk.svg`. Die Beschriftung des Loop-Knopfs sprengt den 36-px-Kasten und klebt am Ring von ▶. Im Lineal liegt der Startgriff der Marke über der „1“. | **Jetzt:** Die Wortmarke einheitlich auf `--fs-15` in Display setzen, „werk“ fett wie in Loopwerk. Loop als Symbol im Kasten (wie in Loopwerk) oder mit Breite nach Inhalt und 8 px Abstand. **Scheibe 2:** das Krachwerk-Zeichen im Deck (die Funken aus `glow.js` hängen an `#brand-bars`, also mit dem motion-designer). | **jetzt** (Schrift, Loop) / Scheibe 2 (Zeichen) |
| 7 | **Derselbe Klang hat zwei Farben.** „Bumm 1“ ist in der Kiste orange (Gruppe Aufnahmen, `--cat-fx`) und im Song pink (`--cat-own`). Die Griffe für Ein- und Ausblenden liegen auf dem Clipnamen („Bumm 1“ ist halb verdeckt). Am Handy wird die automatisch benannte Spur zu „Bum…“ gekürzt. | Die Herkunftsfarben im Song kommen mit Scheibe 2 (laut Spec), bis dahin ist der Widerspruch hinnehmbar. Die Griffe sitzen unterhalb der Namenszeile. Der Spurname am Handy bekommt den Platz des ⋯ (das Menü öffnet ohnehin per langem Druck). | Scheibe 2 |
| 8 | **Am Desktop sind noch Reste von Loopwerk sichtbar:** die Fachleiste unten (Mixer · FX-Pad · Editor · Tastenkürzel), Spurköpfe mit Panorama-Knopf, 54 statt 45 Bedienelemente. Das Zielbild sagt „keine Fachleiste“. | Mischen und FX-Pad wandern in die Song-Werkbank, der Editor geht in der Sound-Werkbank auf. Der Spurkopf am Desktop zeigt nur Name und M/S als Buchstaben, Panorama gehört in die Spur-Werkbank. Damit ist das Endziel 45 erreichbar. | Scheibe 2 |

### 4. Was Martin am echten Handy prüfen soll

1. **Erster Laut:** `/werkstatt/` öffnen, ● tippen, zweimal auf den Tisch klopfen, nichts weiter tun. Hört die Aufnahme von selbst auf, und läuft der Klang sofort im Loop, ohne Klick vorn und ohne Stolpern? (Ohr-Test aus der Spec)
2. **Werkzeug am Clip mit dem Daumen:** Clip antippen, dann „Kopie“ und „Werkbank“ treffen, ohne versehentlich „Löschen“ zu erwischen. Verdeckt das Werkzeug etwas, das du gerade brauchst?
3. **Schublade:** die Werkbank auf „Mitte“ und „oben“ ziehen und darin scrollen. Kämpfen Ziehen und Scrollen miteinander? Bleiben Marke und Clip auf „Mitte“ im Blick, während der Loop läuft?
4. **Lesbarkeit:** Taktzahlen im Lineal und „Takt/Tempo“ sind 11 px groß. Reicht das draußen bei Tageslicht und nach einer Stunde Arbeit?
5. **Übernahme und offline:** Liegen die alten Pad-Klänge in der Kiste unter „Aufnahmen“? Erscheint der Einblender genau einmal? Startet die installierte App im Flugmodus mit deinem Klang?

---

## F · Phosphor (30.10.2026)

**Geprüft:** `docs/ux/richtungen/f-phosphor.html` (im Browser per Playwright vermessen: Tippflächen, Schriftgrößen), `f-phosphor.png`, `f-phosphor-handy.png`, `f-phosphor-desktop.png` (auch in Ausschnitten um Marke und Auswahl), Abschnitt „F · Phosphor“ in `docs/ux/richtungen/README.md`. Zum Vergleich: `docs/specs/v2.0-werkstueck.md`, `docs/ux/abgleich/README.md`, Scheduler in `src/engine.js` (Vorlauf 150 ms, Takt aus dem Worker).

**Briefing (Martin):** „vordergründig in schwarz in minimalistisch cleaner Anmutung und leuchtenden highlights“, Awwwards-Niveau, primär dunkel. Dazu: unscharfer Hintergrund, der auf die Wiedergabe reagiert (Lautstärke als Amplitude, Farben der klingenden Kategorien), Abspielmarke bringt die Sounds direkt darunter zum Leuchten, Partikel in Clipfarbe, „als würde der Indikator reinlasern“.

### Urteil: freigegeben zur Durchsicht, mit Auflagen vor der Umsetzung

Martin kann F so ansehen, wie es ist. Die Auflagen unten müssen in die Spec und in einen Licht-Prototyp, bevor Code an der App entsteht. Ohne sie gebe ich F nicht zur Umsetzung frei.

### Warum freigegeben

1. **Die Idee trägt und ist eigenständig.** „Licht kommt aus der Musik“ ist ein Satz, aus dem sich jede Einzelentscheidung ableiten lässt: Was klingt, leuchtet; was eingestellt ist, ist eine Linie; Auswahl ist Zeichnung. Das ist mehr als ein dunkles Theme mit Glow. Es löst nebenbei den größten Befund des Abgleichs (A1, Orange auf zu vielen Flächen) grundsätzlich statt punktuell: Im Ruhezustand leuchtet nichts.
2. **Martins Wunsch ist wörtlich umgesetzt.** Marke als weißer Strahl, die Wellenform direkt an der Marke voll hell, Funken in Clipfarbe, Umgebungslicht aus den Farben der klingenden Spuren. Der Ausschnitt um Takt 8 (Desktop) ist die stärkste Stelle aller bisherigen Entwürfe: Gelb auf Drums, Blau auf Bass, grüner Funke auf der eingeklappten Gruppe, und trotzdem bleiben die Clipnamen lesbar.
3. **Handwerk auf hohem Niveau.** Klare Typo-Rollen (dünne Azeret-Ziffern für das Gerät, Funnel Sans für alles, was der Mensch hineinlegt), zwei Radien plus Kreis für Funktionen, konsequente Haarlinien. „3 Clips“ in Funnel Display 300 im Inspektor, das freistehende Display ohne Kasten: Das ist ruhig und wertig, nicht dekoriert.
4. **Zustände ohne Farbe sind durchdacht.** Spielen = Helligkeit, Gewählt = Kante + Ecken + Griff, Stumm = durchgestrichen + Schraffur, Vorschlag = gestrichelt. Spielen und Gewählt überlagern sich ohne Verwechslung. Die gestrichelten Vorschläge des Wunsch-Agenten im Arranger sind eine gute, eigene Lösung.
5. **Kontrast stimmt.** Nachgerechnet: Leise `#9898A1` auf Grund 7,2 : 1, Bass-Blau auf Clip 6,3 : 1, Tageslicht-Drums `#946200` 4,7 : 1. Die Angaben im README sind korrekt.

### Was nicht stimmt

**Bedienung am Handy (gemessen im Mockup):**
- Fader-Kappe **24 × 5 px**. Das ist das Hauptwerkzeug im Mixer, und im README fehlt es bei den Tippzielen. Ebenfalls zu klein: Segment Sounds|Erstellen 178 × **28**, Panorama-Knöpfe **32 × 32**, M/S im Spurkopf 26 × 22 (vom Designer selbst benannt).
- Schrift: 22 Textstellen in **8,5 px** (Display-Beschriftung, Panorama-Werte „Mitte/L 15“, Inspektor-Tasten), „Vorschlag“ in **8 px**, Reiter der Fachleiste in **9 px**, fast alles in `--muted`, Großbuchstaben mit +0,12 em. Für stundenlanges Arbeiten am Handy ist das zu klein. Das war auch in Werkstück knapp; Phosphor verschärft es, weil die Schrift ohne Taste und Mulde frei auf Schwarz steht.
- Tastenkanten `--line` mit **1,27 : 1**. Formal erlaubt (die Beschriftung trägt), aber für Einsteiger und bei Sonne am Handy sind M/S, Loop, Teilen kaum als Tasten zu erkennen. „Niedrigschwellig“ verlangt mehr Halt.

**Widerspruch zur eigenen Idee:**
- **Stumm leuchtet.** M an ist weiß gefüllt und damit das hellste Element im ganzen Mixer, ausgerechnet auf dem Kanal, der still ist. Das bricht „was klingt, leuchtet“.
- **Hinweiszeile am Desktop** („Leertaste spielt · Strg+Z macht Rückgängig“). Das widerspricht der Regel „keine Erklärtexte (dafür Tipps)“ und der eigenen Grundlage im README („Die Hinweiszeile fällt weg“).

**Abweichung von Martins Worten:**
- Martin: Leuchten „nur direkt an der Marke“. F lässt die Wellenform über **120 px / 0,5 s** nachglimmen. Das ist schön, aber nicht bestellt, und auf dem Desktop wird der Hof dadurch eher ein runder Fleck als ein Laserpunkt.
- Martin: „nur gelbe Drums → alles gelb“. F gibt jeder Kategorie einen festen Ort (Drums unten links, Bass unten Mitte …). Spielen nur Drums, entsteht ein gelber Fleck unten links, nicht ein gelber Raum.

**Leistung (das eigentliche Risiko):**
- Das Mockup baut das Licht mit `filter: blur(70px)` auf großen Flächen, `mix-blend-mode: screen` für Körnung und Hof, `filter: drop-shadow` auf Pegeln und `box-shadow`-Schein. Das README beschreibt für die App eine Maske pro Clip, die über `--ph` **jedes Bild** neu berechnet wird. Masken- und Schattenänderungen erzwingen Neuzeichnen, nicht nur Compositing. Am Handy, wo der Scheduler im Hauptthread nur 150 ms Vorlauf hat, kann das bei langen Songs zu Aussetzern führen. Der Charakter von F hängt vollständig an dieser Schicht, und genau sie ist im Mockup nur als Standbild belegt.

**Hell-Modus:**
- Es gibt nur Worte, kein Bild. „Tageslicht“ ist ausdrücklich eine Ableitung ohne Licht. Gegenüber Werkstück („silbernes Gehäuse“, gleichwertig gedacht) ist das ein Rückschritt. „Fertig heißt“ verlangt Screenshots hell und dunkel.

**Spielfreude im Ruhezustand:**
- Steht der Song, ist alles schwarz (Handy rechts). Bei einem leeren neuen Projekt sieht der erste Eindruck dann aus wie ein ausgeschaltetes Gerät. Für Profis ist das edel, für den „I Like To Loop It“-Einstieg ist es kühl. Das muss Martin gefallen (Frage 3).

### Auflagen (vor der Umsetzung, in Spec und Prototyp)

1. **Tippflächen Handy ≥ 44 px:** Fader über die ganze Kanalspalte relativ ziehbar (Breite der Spalte, nicht der Kappe), die sichtbare Kappe mindestens 28 × 8 px. Segment Sounds|Erstellen 44 px hoch. Panorama-Knöpfe mit 44-px-Tippfläche (senkrecht ziehen, Doppeltipp = Mitte). Spurkopf-M/S mit unsichtbarer 44-px-Fläche.
2. **Schrift-Untergrenze:** 10 px am Desktop, 11 px am Handy für alles, was gelesen werden muss (Reiter, Display-Beschriftung, Panorama-Werte, „Vorschlag“, Inspektor-Tasten). Laufweite dafür auf +0,08 em senken, damit die Breiten halten. Ausnahme nur für Taktnummern im Lineal (10 px).
3. **Tastenkante standardmäßig `#34343A`** (1,7 : 1), wie im README schon als Option genannt.
4. **Stumm leuchtet nicht:** M an = weiße Kante, weiße Schrift, Kanal gedimmt und durchgestrichen. Weiße Füllung bleibt Transport, Solo und der einen CTA je Ansicht.
5. **Hinweiszeile am Desktop entfernen.** Tastenkürzel nur hinter „?“ bzw. in den Tipps.
6. **Licht nach Martins Worten als Standard:** Aufleuchten nur an der Marke, Nachglimmen höchstens ~150 ms. Das 0,5-s-Nachglimmen nur als zweite Variante im Prototyp zum Vergleichen. Umgebungslicht: Spielt nur eine Kategorie, füllt ihre Farbe den ganzen Raum. Die festen Orte gelten nur als Gewichtung, wenn mehrere Kategorien klingen.
7. **Leerzustand und Vorhören:** Ein Bild „neues Projekt“ am Handy. Vorhören im Regal speist das Umgebungslicht, damit der erste Tipp auf einen Sound sofort Licht erzeugt (Spielfreude ab Sekunde eins).
8. **Hell-Modus zeigen:** Je ein Bild Handy und Desktop „Tageslicht“, bevor die Spec geschrieben wird.
9. **Technik für die Lichtschicht (Spec, Motion-Designer + Audio-Engineer):**
   - Ein einziges Overlay-Canvas über der Zeitleiste für Leuchten an der Marke und Funken. Die Clips selbst bleiben statisch: keine Maske und kein Schein pro Bild auf DOM-Elementen.
   - Pegel, Logo-Balken und Spurpunkt: Schein vorgerendert, pro Bild nur `opacity`/`transform` ändern, kein animiertes `box-shadow`/`filter`.
   - Umgebungslicht: kleines Canvas, weich durch Hochskalieren, **kein** `filter: blur()` auf einer bildschirmgroßen Ebene. Höchstens 30 Bilder/s. Gegen Banding auf Schwarz statisches Rauschen ins Bild, kein `mix-blend-mode` über animierten Flächen.
   - Schleife aus bei Stopp, verdeckter Seite (`visibilitychange`) und `prefers-reduced-motion`. Einstellung „Licht: voll / sparsam / aus“ im Fach Mehr (sparsam = ohne Funken, Umgebungslicht 15 Bilder/s). Das ist für Akku und Wärme bei stundenlangem Arbeiten nötig.
   - Messung: ≤ 2 ms pro Bild bei 4-fach gedrosselter CPU, dazu ein Test, dass der Scheduler-Takt bei langem Song mit Live-Resync keine Lücken bekommt.
   - QA-Kontrasttest mit Umgebungslicht auf `--ambient-max`: Bass-Blau auf vollem gelben Schein fällt flach gerechnet auf ~4,2 : 1, das muss der Deckel verhindern.
10. **Kleinigkeiten:** Rahmen der Mehrfachauswahl nach dem Loslassen ausblenden (im Bild schneidet er „Gesang 1“). Abgeschnittene Mixer-Spalte am Handy mit Verlauf am Rand statt hartem Schnitt („−3,5 d“). Übersicht `richtungen/index.html` um F ergänzen. Bei Wahl von F braucht es eine neue Spec und ein ADR (Architekt), weil die Regel „Orange nur für Transport und Aktives“ in `CLAUDE.md` und die Spec 2.0 dann nicht mehr gelten.

### Empfehlung und Reihenfolge

- **F ist die Richtung, die Martins Briefing trifft**, und sie ersetzt A · Nachtglas als dunkle Glow-Variante: gleiches Gefühl, aber mit Idee statt Effekt und ohne `backdrop-filter`.
- **Gegenüber Werkstück (heute umgesetzt)** gewinnt F an Eigenständigkeit und Ruhe. Es verliert das Gerätehafte (Tasten, Mulden, LED), den gleichwertigen Hell-Modus und etwas Einsteiger-Wärme im Stand.
- **Umsetzungsreihenfolge, falls Martin F will:** zuerst nur die Lichtschicht als Prototyp (Umgebungslicht, Marke, Funken; `engine.categoryLevels()`), am Handy gemessen und von Martin live gesehen. Die Lichtschicht funktioniert auch auf dem dunklen Werkstück, deshalb ist sie in beiden Fällen keine verlorene Arbeit. Erst danach Token-Tausch und Komponenten.

### Was Martin sich ansehen soll

1. `docs/ux/richtungen/f-phosphor-handy.png`: links spielt (Mixer halb offen), rechts steht der Song. Beide Zustände ehrlich vergleichen: Gefällt das schwarze Stehen?
2. `docs/ux/richtungen/f-phosphor-desktop.png`: Bereich um Takt 8 (Laser, Funken, Umgebungslicht) und der Inspektor rechts.
3. `docs/ux/richtungen/f-phosphor.html` im Browser in voller Größe. Wichtig: Das ist ein Standbild. Bewegung, Nachglimmen und das Atmen des Hintergrunds sind beschrieben, aber nicht zu sehen.

### Offene Entscheidungen für Martin

1. **Phosphor ganz oder nur das Licht?** Neuer Look anstelle von Werkstück (Aufwand mittel bis hoch, große Teile der Werkstück-Abgleichliste entfallen) oder nur die Lichtschicht (reagierender Hintergrund, Laser-Marke, Funken) im heutigen Werkstück?
2. **Hell-Modus:** Reicht eine schlichte, helle Ableitung ohne Licht-Effekte, weil die App primär dunkel ist, oder muss Hell gleichwertig bleiben wie das „silberne Gehäuse“?
3. **Ruhezustand:** Soll beim Stehen wirklich alles schwarz und still sein, oder soll ein Rest Leben bleiben (z. B. Logo glimmt leise, Vorhören leuchtet)?
