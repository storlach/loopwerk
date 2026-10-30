# Drei Richtungen für den neuen Look

Martins Wunsch: „funktional, clean, modern und etwas verspielt, primär Darkmode“, Vorbild Premium-Design.
Übersicht zum Vergleichen: `index.html` (Handy-Ansichten nebeneinander, darunter Desktop). Jedes Mockup ist eine einzelne HTML-Datei mit Handy (390 × 844) und Desktop (1536 × 960) nebeneinander.

**Herkunft:** Das ist Wissen über Premium-Musik- und Profi-Werkzeuge (Teenage Engineering OP-1/EP-133, Ableton Move/Note, Koala Sampler, Endlesss, Linear/Raycast-Darkmodes, Glas/visionOS, Neo-Brutalismus) und die typische Pinterest-/Dribbble-Ästhetik. Eine Live-Recherche gab es nicht: kein Webzugriff, Pinterest nur mit Login.

**Gemeinsame Grundlage (kommendes Layout):** Deck oben, darunter der Arranger. Am Desktop links Sounds/Erstellen, rechts der Inspektor. Unten eine Leiste mit Reitern, an der die Schubladen hängen: Der aktive Reiter hat dieselbe Fläche wie die Schublade und ist mit ihr verbunden. Am Handy hat die Leiste die Reiter Sounds, Mixer, Editor und Mehr, daneben einen eigenen runden bzw. eckigen **Funktionsknopf Rückgängig** (bewusst anders geformt als die Reiter). Die Hinweiszeile fällt weg. Das Logo bleibt in allen drei Richtungen gleich aufgebaut: sieben Amplituden-Balken plus „Loop**werk**“ mit hervorgehobenem „werk“.

| | A · Nachtglas | B · Werkstück | C · Sticker |
|---|---|---|---|
| Stimmung | Ruhiges Nachtstudio hinter Rauchglas, weich leuchtend | Präzises Musikgerät aus Graphit und Gummi, eine Signalfarbe | Freches Skizzenbuch voller Aufkleber, Bonbonfarben |
| Vorbilder | Linear, Raycast, visionOS, Endlesss | Teenage Engineering, Ableton Move, Elektron | Koala Sampler, Neo-Brutalismus, Figma-Community |
| Schriften (Google Fonts) | Geist + Geist Mono | Archivo + Martian Mono | Bricolage Grotesque + DM Mono |
| Formen | Radius 10–20 px, Glas, 1-px-Lichtkanten, Glow nur auf Aktivem | Radius 4–10 px, bündige Flächen mit Haarlinien, Gummitasten, Punktraster | Radius 11–22 px, 2-px-Kontur, harter Versatzschatten 3–5 px |
| Clips | Getönt, transparent, Wellenform als gefüllte Fläche, gewählt = farbiger Schein | Dunkler Körper mit farbigem Etikett-Streifen, Wellenform aus LED-Punkten | Vollflächig bonbonfarben, schwarze Kontur, Wellenform als runde Balken, gewählt = leicht gekippter Aufkleber |
| Verspielt durch | Aurora im Hintergrund, pulsierende Abspielmarke, Pegel mit Verlauf und Schein, federnde Schalter | LED-Lauflicht im Schrittraster, leuchtende Pads, Drehregler mit Skalenstrichen, Logo als LED-Säulen | Hüpfender Ball auf der Abspielmarke, Knöpfe „drücken sich ein“ (Schatten weg), bunte Logo-Balken, gekippte Aufkleber |
| Gezeigte Schublade | Mixer | Drumpads + Schritte (Desktop nebeneinander) | Piano-Roll (Handy senkrechte Tasten, Desktop Klaviatur) |
| Kontrast Text (WCAG) | Text 16,9 : 1 · Leise 6,5 : 1 · Akzent 6,0 : 1 | Text 16,7 : 1 · Leise 7,2 : 1 · Signal auf Display 6,6 : 1 | Text 17,1 : 1 · Leise 8,4 : 1 · Schwarz auf Clip ≥ 7,4 : 1 |
| Risiko | Glas (`backdrop-filter`) kostet am Handy Leistung, Glow wirkt schnell austauschbar | Viele Großbuchstaben in Mono: bei langen deutschen Wörtern schmaler | 2-px-Konturen und Schatten kosten Platz, dichte Ansichten (Mixer) wirken schnell laut |
| Aufwand | mittel–hoch: neue Glas-/Verlaufs-Tokens, Blur-Fallback, Leistung prüfen | **niedrig–mittel**: liegt am nächsten am heutigen „Werkbank“-Gerüst (Deck, LCD, Tasten), Drehregler optional | mittel: Konturen ändern Boxmaße, Tests mit Mindestgrößen prüfen, Schatten brauchen Luft |

Alle Text-Paare liegen über AA (4,5 : 1). Die knappste Stelle ist B: schwarze Schrift auf dem Bass-Blau mit 4,9 : 1. Nebenbefund im Ist-Stand: Die LCD-Beschriftung (`--amber-dim` auf `--lcd`) hat nur **1,7 : 1**. Alle drei Richtungen beheben das.

## Tokens je Richtung (dunkel)

Die Blöcke passen auf die vorhandenen Namen in `:root` (index.html). `--amber` wird zum Akzent; langfristig wäre die Umbenennung in `--accent` sauberer. „Vocals“ belegt die bisherige Kategorie `--cat-own` (eigene Sounds, Aufnahmen). Neu wären nur wenige Tokens für Formen (`--radius-lg`, `--shadow`, `--glow` bzw. `--outline`).

### A · Nachtglas
```css
--bg:#0A0C12; --panel:#11141C; --lane:#0A0C12; --lane-alt:#0D0F15; --ink:#ECEEF6; --muted:#8E95A9;
--line:#232836; --grid-bar:#1F2128; --grid-beat:#121419; --deck:#12141B; --deck-2:#1A1D25;
--deck-ink:#ECEEF6; --deck-muted:#8E95A9; --lcd:#06070B; --amber:#8B7CFF; --amber-dim:#8E95A9; --focus:#A99CFF;
--accent-2:#45D6E6; --meter-ok:#3FE0B5; --meter-warm:#FFC857; --meter-hot:#FF5D73; --meter-off:#1A1D25;
--cat-drums:#FF7A6B; --cat-bass:#5AA2FF; --cat-chords:#3FE0B5; --cat-synth:#B794FF; --cat-fx:#FFC857; --cat-own:#FF7EB6;
--font-display:"Geist"; --font-body:"Geist"; --font-mono:"Geist Mono";
--radius:10px; --radius-lg:16px; --glow:0 0 18px rgb(139 124 255 / .5);
/* hell: --bg:#F4F5FA --panel:#FFFFFF --ink:#12141C --muted:#5B6175 (5,7:1) --amber:#5B4BE0 (6,0:1) */
```

### B · Werkstück
```css
--bg:#0F0F0F; --panel:#181818; --lane:#0F0F0F; --lane-alt:#141414; --ink:#F2EFE9; --muted:#A39E94;
--line:#2C2C2C; --grid-bar:#262626; --grid-beat:#1C1C1C; --deck:#181818; --deck-2:#232323;
--deck-ink:#F2EFE9; --deck-muted:#A39E94; --lcd:#050505; --amber:#FF5B1F; --amber-dim:#8F8A80; --focus:#FFFFFF;
--meter-ok:#22C97C; --meter-warm:#FFC21A; --meter-hot:#FF3B30; --meter-off:#262626;
--cat-drums:#FFC21A; --cat-bass:#3D7BFF; --cat-chords:#22C97C; --cat-synth:#A99BFF; --cat-fx:#E6E1D6; --cat-own:#FF7AA8;
--font-display:"Martian Mono"; --font-body:"Archivo"; --font-mono:"Martian Mono";
--radius:8px; --radius-lg:10px; --shadow:inset 0 1px 0 rgb(255 255 255 / .07), inset 0 -2px 0 rgb(0 0 0 / .45);
/* hell („silbernes Gehäuse“): --bg:#E9E7E2 --panel:#F5F4F0 --ink:#141414 --muted:#5F5B54 (5,5:1), Akzent als Text #B83706 (4,7:1), Display bleibt schwarz */
```
Orange ist hier allein für Transport und aktive Zustände reserviert. Drums sind deshalb gelb.

### C · Sticker
```css
--bg:#16131C; --panel:#221E2A; --lane:#16131C; --lane-alt:#1A1720; --ink:#FFF6E9; --muted:#B5ABC2;
--line:#3A3446; --grid-bar:#2F2A39; --grid-beat:#211D28; --deck:#221E2A; --deck-2:#2E2938;
--deck-ink:#FFF6E9; --deck-muted:#B5ABC2; --lcd:#0D0B11; --amber:#C8F94A; --amber-dim:#B5ABC2; --focus:#C8F94A;
--outline:#07060A; --accent-2:#FF5FA2; --meter-ok:#4BE3A8; --meter-warm:#FFD84D; --meter-hot:#FF4D4D; --meter-off:#0D0B11;
--cat-drums:#FF7A5C; --cat-bass:#5CB6FF; --cat-chords:#4BE3A8; --cat-synth:#C4A0FF; --cat-fx:#FFD84D; --cat-own:#FF8AD2;
--font-display:"Bricolage Grotesque"; --font-body:"Bricolage Grotesque"; --font-mono:"DM Mono";
--radius:12px; --radius-lg:20px; --shadow:3px 3px 0 var(--outline);
/* hell („Papier“): --bg:#FFF3E2 --panel:#FFFFFF --ink:#16131C (16,8:1) --muted:#5E5468 (6,5:1), Kontur bleibt dunkel */
```
Clips und Akzentflächen tragen hier immer **dunkle** Schrift (`#121014`), deshalb sind die Bonbonfarben sicher.

## Bewegung
Alle Mikroanimationen sind Deko (Puls, Hüpfen, Lauflicht, Eindrücken). Bei `prefers-reduced-motion` entfallen sie. In den Mockups ist das schon so umgesetzt. Abspielmarke und Pegel folgen in der App weiter der Engine-Zeit, nicht CSS-Animationen.

## Empfehlung: B · Werkstück

1. **Passt zum Produkt:** Loopwerk ist ein Instrument. B macht Pads, Schrittraster, Drehregler und Display zu „Hardware“, die man sofort versteht. Das ist niedrigschwellig wie Magix, aber mit eigenem Charakter statt SaaS-Glas.
2. **Funktional und clean:** Bündige Flächen mit Haarlinien nutzen am Handy jeden Pixel. Eine einzige Signalfarbe (Orange) zeigt eindeutig, was aktiv ist. Die Kategoriefarben bleiben für Inhalte (Clips) frei.
3. **Verspielt an den richtigen Stellen:** Leuchtende Pads, LED-Lauflicht und das Logo als LED-Säulen bringen die Freude dorthin, wo musiziert wird. Die Arbeitsflächen bleiben ruhig.
4. **Geringster Umbau:** Das heutige Wireframe ist schon eine „Werkbank“ (Deck mit LCD, Tasten, Bernstein-Akzent). B ist im Wesentlichen ein Token-Tausch plus wenige Komponenten-Stile (Clip-Etikett, Pads, Schrittraster, Reiter). Drehregler statt Schieber sind optional.

Wenn es mehr Wärme und Einsteiger-Charme braucht, lassen sich aus C die vollflächigen Clips mit dunkler Schrift oder das „Eindrücken“ der Knöpfe übernehmen, ohne die Richtung zu wechseln.

## Offene Fragen an Martin
1. Welche Richtung (oder Mischung) soll es werden? Gefällt bei B die Mono-Großschrift, oder lieber normale Schreibweise für Beschriftungen?
2. Wie präsent soll die Signalfarbe sein: nur Transport und Aktives (wie in B), oder auch Flächen (Play-Button, Reiter, Clips)?
3. Soll der helle Modus gleichwertig gestaltet werden, oder reicht eine solide, abgeleitete Variante, weil die App primär dunkel ist?

## Dateien
- `index.html`: Übersicht zum Vergleichen
- `a-nachtglas.html`, `b-werkstueck.html`, `c-sticker.html`: Mockups (statisch, nur Google Fonts extern)
- `*.png`: Gesamtbild je Richtung, `*-handy.png` und `*-desktop.png` als Ausschnitte (2×)

---

# F · Phosphor

**Idee in einem Satz:** Schwarz wie ein ausgeschalteter Bildschirm: Licht entsteht nur, wo Musik klingt. Die Abspielmarke ist der Strahl, der die Clips beim Überfahren zum Glühen bringt. Danach glimmen sie nach wie Phosphor.

Martins Wunsch: „vordergründig in Schwarz, minimalistisch-clean, leuchtende Highlights“, mit demselben Anspruch wie A–C. Mockup: `f-phosphor.html`. Zu sehen sind zwei Handys (spielt mit halb offenem Mixer; steht, mit Wunsch in „Erstellen“) und der Desktop (spielt in Takt 8, drei Clips per Rahmen gewählt, Gruppe „Harmonie“ eingeklappt, der Wunsch-Agent denkt). Das Layout ist das von 2.0: Deck oben, Arranger, Fachleiste unten, Schubladen ohne Schließen-Knopf, links Sounds|Erstellen, rechts der Inspektor.

**Abgrenzung:** A · Nachtglas leuchtet *überall* ein wenig (Glas, Aurora, violetter Akzent). Phosphor ist im Ruhezustand fast vollständig schwarz und weiß. Es gibt keinen Akzent-Farbton, kein Glas und kein `backdrop-filter`. Farbe erscheint nur als Licht aus Inhalten (Kategorie der klingenden Clips) und aus Zuständen. Zu B · Werkstück verhält sich Phosphor wie ein OLED-Display zu einem Gerätegehäuse: keine Gummitasten, keine Mulden, keine LED-Punkte, sondern Haarlinien und Licht.

## Fünf Kernentscheidungen
1. **Was klingt, leuchtet. Was eingestellt ist, ist eine Linie.** Pegel, Logo-Balken, Spurpunkt, Pegelstrich unter dem Spurnamen und Clips an der Marke sind *Licht* (Kategoriefarbe mit Schein). Fader, Lautstärke, Panorama und Laufzeit sind *Linien* in `--ink` ohne Schein und ohne Füllung. Damit ist das Problem „Orange auf zu vielen Flächen“ (Abgleich A1) grundsätzlich gelöst: Im Ruhezustand leuchtet nichts.
2. **Kein Akzent-Farbton: „Weißglut“ ist das Signal.** `--amber` wird `#FFFFFF`. Aktiv heißt weiß gefüllt mit Schein (Play/Stopp als Linse, M/S an, CTA, Zähler am Rahmen) oder eine weiße Haarlinie mit leuchtender Schrift (Loop, Tonhöhe halten, Effekt an). So gehören alle sechs Farben den Inhalten, und Orange wird frei für FX. Rot bleibt nur für Aufnahme und Löschen.
3. **Die Marke lasert, der Raum antwortet.** An der Marke wird die Wellenform des Clips voll hell, mit Hof und weißem Kern. Hinter der Marke klingt sie über etwa 120 px (rund 0,5 s) aus. Funken in der Clipfarbe sprühen meist entgegen der Laufrichtung. Der unscharfe Hintergrund mischt die Farben der klingenden Spuren nach ihrem Pegel: nur Drums ergeben Gelb, kommt der Bass dazu, kommt Blau dazu. Steht der Song, ist alles schwarz (Handy rechts).
4. **Auswahl ist Zeichnung, nicht Licht.** Gewählte Clips bekommen eine `--ink`-Kante, Schnittmarken an den Ecken und einen Laufzeit-Griff (4 × 20 px) rechts. Der Rahmen der Mehrfachauswahl ist eine 1-px-Linie mit Zähler „3 Clips“. Weil Licht = Klang und Linie = Auswahl gilt, überlagern sich Spielen und Gewählt ohne Verwechslung (auch ohne Farbe). Vorschläge des Wunsch-Agenten erscheinen gestrichelt („noch nicht da“), so wie Ablageziele.
5. **Typografie als Instrument: dünne Vektor-Ziffern, warme Grotesk für Namen.** Azeret Mono 200 für Anzeigen (wie ein Vektor-Display, der aktive Takt mit Schein), Funnel Sans für alles, was der Mensch hineinlegt (Spuren, Clips, Sounds, Wunsch-Text), Funnel Display 300/700 für Titel und Wortmarke („Loop“ dünn, „werk“ fett). Die Rollen trennen sich wie im Abgleich A5: Grotesk = Inhalt, Mono-Großschrift = Gerät.

## Tokens (dunkel = Hauptmodus)
Die Namen passen auf `:root` in `index.html`. Neu sind nur die Licht-Tokens am Ende.
```css
--bg:#030304; --panel:#0A0A0C; --lane:transparent; --lane-alt:rgb(255 255 255/.012);
--ink:#F2F2F0; --muted:#9898A1; --line:#202024; --grid-bar:rgb(255 255 255/.07); --grid-beat:rgb(255 255 255/.028);
--deck:rgb(3 3 4/.8); --deck-2:#141417; --deck-ink:#F2F2F0; --deck-muted:#9898A1;
--lcd:transparent; --amber:#FFFFFF; --amber-dim:#9898A1; --focus:#FFFFFF; --accent-ink:#030304;
--meter-ok:#F2F2F0; --meter-warm:#FFC53D; --meter-hot:#FF4D4D; --meter-off:#17171B;
--cat-drums:#FFC53D; --cat-bass:#4A8CFF; --cat-chords:#2EE5A3; --cat-synth:#B494FF; --cat-fx:#FF7F45; --cat-own:#FF62A5;
--font-display:"Funnel Display"; --font-body:"Funnel Sans"; --font-mono:"Azeret Mono";
--radius:3px; --radius-lg:14px;
--key-face:transparent; --key-shadow:inset 0 0 0 1px var(--line); --well:#000; --well-shadow:inset 0 0 0 1px var(--line);
--dots:none; --clip-body:rgb(7 7 9/.82); --label-ink:#030304;
--lcd-face:transparent; --lcd-shadow:none; --lcd-sep:transparent; --display-ink:#F2F2F0; --lcd-label:#9898A1;
--sheet-bg:#09090B; --sheet-shadow:0 -1px 0 #2A2A2F,0 -30px 60px #000;
--led-off:#2A2A30; --knob-hi:transparent; --knob-lo:transparent; --knob-edge:#3A3A40;
/* neu: Licht */
--beam:#FFFFFF;                                   /* Kern der Marke */
--beam-glow:0 0 3px #fff,0 0 10px rgb(255 255 255/.55),0 0 26px rgb(255 255 255/.22);
--glow-ink:0 0 14px rgb(255 255 255/.38);          /* aktive Schrift */
--glow-cat:0 0 6px var(--cat),0 0 18px color-mix(in srgb,var(--cat) 45%,transparent);
--trace-rest:.3;                                   /* Wellenform in Ruhe, an der Marke 1 */
--trail:120px;                                     /* Nachleuchten hinter der Marke (in der App: 0,5 s in px) */
--ambient-max:.62; --ambient-blur:70px;            /* Deckel für das Umgebungslicht */
```
`--amber` heißt hier „Weißglut“. Die Umbenennung in `--accent` lohnt sich spätestens jetzt. Die Panels (Deck, Regal, Spurköpfe, Lineal, Inspektor) sind zu 80 % deckend, damit das Umgebungslicht nur durchschimmert. Die Spuren sind transparent, die Clips zu 82 % deckend. Die Schublade ist voll deckend, damit die Marke nicht durchscheint.

**Hell („Tageslicht“, abgeleitet, nicht gleichwertig):** `--bg:#F3F3F0 --panel:#FFFFFF --ink:#0B0B0C (17,7:1) --muted:#5D5D66 (5,9:1)`. Kategorien als Text: Drums `#946200` (4,7), Bass `#1F5FD6` (5,2), Akkorde `#0A7650` (≥ 4,6), Synth `#6A4BD8` (5,2), FX `#B8481A` (4,8), Eigene `#C2246B` (5,0). Das Umgebungslicht ist dort aus. Der Schein der Marke wird zu einer 2-px-Linie in `--ink`, und die Clips an der Marke werden mit 18 % `--cat` gefüllt statt zu leuchten. Licht auf Weiß funktioniert nicht. Ehrlich gesagt ist Phosphor eine Dunkel-Richtung.

## Typo-Skala
| Rolle | Schrift | Größe / Schnitt |
|---|---|---|
| Anzeige-Ziffern (Takt, Zeit, Tempo) | Azeret Mono | 200, 25 px Desktop / 23 px Handy, `tabular-nums`, −0,03 em; der aktive Takt 300 mit Schein |
| Großer Wert (Laufzeit „×1,00“) | Azeret Mono | 200, 26 px |
| Titel (Inspektor „3 Clips“) | Funnel Display | 300, 34 px, −0,03 em |
| Wortmarke | Funnel Display | 21 px, „Loop“ 300 + „werk“ 700 |
| Namen: Spur / Clip / Sound | Funnel Sans | 600 13,5 px / 600 11 px / 500 13 px |
| Wunsch-Text, Fließtext | Funnel Sans | 400 15/1,42 px |
| Beschriftung, Tasten, Reiter | Azeret Mono | 500 9–10 px, Großbuchstaben, +0,08–0,12 em |
| Werte (dB, Takte, Längen) | Azeret Mono | 400 9,5–12 px, `tabular-nums` |

## Formensprache
- **Zwei Radien, ein Kreis:** 3 px für Inhalte und Tasten (Clips, M/S, Effekt-Zellen), 14 px für Behälter (Schublade, Suchfeld, Wunsch-Feld, Segment). Kreise gibt es nur für die „Linsen“: Spielen/Stopp, Rückgängig am Handy, Senden, Vorhören. Weil nicht alles gleich rund ist, erkennt man Funktionen an der Form.
- **Haarlinien statt Flächen:** Tasten sind 1-px-Rahmen in `--line`, gefüllt ist nur Weißglut. Das Display hat keinen Kasten: Ziffern stehen frei auf Schwarz, getrennt durch Haarlinien.
- **Clips als Lichtschlitz:** dunkler Körper, Kante in 30 % `--cat`, Name in `--cat`, Wellenform aus senkrechten 1-px-Lichtstrichen (2-px-Raster). Ein Etikett-Streifen fällt weg, denn Farbe gibt es nur als Licht.
- **Spurgruppen als Akkordeon:** Kopf 30 px mit Pfeil, Name, Anzahl. Mitglieder sind eingerückt und haben eine 1-px-Klammer. Eingeklappt (44 px) zeigt die Gruppe pro Spur einen 3-px-Lichtstreifen. Auch diese glühen an der Marke und sprühen Funken, der Song bleibt also lesbar.
- **Mixer:** Fader-Rinne 1 px, darunter `--ink` bis zur Kappe (24 × 5 px). Daneben der Pegel als 3-px-Lichtsäule in der Kanalfarbe mit weißem Spitzenwert. Master in Weiß → Gelb → Rot. Das Panorama ist ein Ring mit Zeiger. Stumm: Name durchgestrichen, Kappe grau, kein Licht, M weiß gefüllt.
- **Wunsch-Agent:** Eingabe als Behälter (14 px) mit Linsen-Knopf „Senden“. Solange der Agent denkt, läuft ein Lichtkometen-Rand um das Feld (Desktop: „denkt …“). Die Antwort besteht aus Zeilen mit leuchtender Mini-Spur, Name in `--cat`, Ziel als Mono-Zeile und Vorhören. „Alle einsetzen“ ist die weiße CTA. Die Vorschläge stehen gestrichelt im Arranger.
- **Fachleiste:** Der aktive Reiter teilt die Fläche mit der Schublade und trägt oben einen 18 × 2 px großen Lichtstrich.

## Bewegung
- **Umgebungslicht:** ein Canvas von etwa 32 × 18 px, hochskaliert und weichgezeichnet, gezeichnet per `requestAnimationFrame`. Jede Kategorie hat einen festen Ort im Raum (Drums unten links, Bass unten Mitte, Akkorde oben rechts, Synth Mitte), damit nichts springt. Die Helligkeit folgt dem Pegel der Kanalzüge (Analyser gibt es für die Mixer-Pegel schon). Anstieg ~30 ms, Abklingen ~400 ms wie Phosphor. Gedeckelt durch `--ambient-max`. Beim Stopp blendet es in 600 ms auf Schwarz.
- **Marke:** Die Position kommt aus `ctx.currentTime` (keine CSS-Animation). Pro Bild wird eine Variable `--ph` auf der Zeitleiste geschrieben. Nur Clips unter der Marke bekommen `.live` mit einer Maske (`linear-gradient` um `--ph`). Die Klasse wechselt nur an Clipgrenzen.
- **Funken:** ein Canvas über der Zeitleiste mit einem Pool von höchstens 160 Teilchen, `globalCompositeOperation = 'lighter'`. Die Rate folgt dem Pegel des Clips an der Marke, Transienten (Kick) geben Stöße. Lebensdauer 350–700 ms, Flugrichtung überwiegend gegen die Laufrichtung, Striche mit Länge nach Tempo.
- **Kleines:** Die Rahmenauswahl zeichnet sofort, die Schnittmarken erscheinen in 120 ms. Der Kometen-Rand des Wunsch-Felds dreht in 1,6 s eine Runde (`@property --a` + `conic-gradient`), Antwortzeilen erscheinen gestaffelt alle 60 ms. Die Schubladen behalten die Feder aus 2.0.
- **`prefers-reduced-motion`:** keine Funken, kein Hof-Puls, Umgebungslicht statisch auf 50 % oder aus. Das Aufleuchten an der Marke bleibt ohne Nachleuchten, denn es ist Information („das klingt jetzt“) und keine Deko.

## Zugänglichkeit (geprüft)
Gemessen im gerenderten Mockup: Text ausgeblendet, der Hintergrund unter jedem Textkasten als 85. Perzentil **mit** Umgebungslicht und Hof, 254 Textstellen. Alle aktiven Texte liegen bei **≥ 5,1 : 1**. Die knappste Stelle ist der Bass-blaue Clipname direkt neben dem Hof der Marke am Handy. Flach gerechnet:

| Paar | Kontrast |
|---|---|
| Text `#F2F2F0` / Grund | 18,4 : 1 |
| Leise `#9898A1` / Grund · / Schublade | 7,2 : 1 · 7,0 : 1 |
| CTA-Schrift `#030304` / Weißglut | 18,4 : 1 |
| Clipnamen auf Clip: Drums · Bass · Akkorde · Synth · FX · Eigene | 12,8 · 6,3 · 12,4 · 8,3 · 8,1 · 7,3 : 1 |
| Löschen `#FF6B6B` · Aufnahme `#FF4D4D` / Grund | 7,4 · 6,3 : 1 |
| Inaktiv (Editor ohne Clip) `#4E4E56` | 2,5 : 1 (inaktiv, ausgenommen) |

- Zustände ohne Farbe: Spielen = Helligkeit und Schein, Gewählt = Kante, Ecken und Griff, Stumm = durchgestrichen, Schraffur, M gefüllt, Aktiv = weiße Füllung oder weiße Kante, Vorschlag = gestrichelt.
- Tippziele am Handy: Transport, Rückgängig, Senden und Vorhören 44 px, M/S im Mixer 34 × 44, Reiter 97 × 58. Die M/S-Tasten im Spurkopf (26 × 22) sind wie heute zu klein. Sie brauchen eine unsichtbare Tippfläche von 44 px.
- Fokus: 2 px `--focus` mit 2 px Abstand. Das unterscheidet sich von der Auswahl (1 px plus Ecken).
- Die Haarlinien der Tasten (1,3 : 1) sind Deko. Erkennbar sind die Tasten an Beschriftung und Icon. Wer mehr Halt braucht: `--line` auf `#34343A` (1,8 : 1) heben, das stört den Look nicht.

## Aufwand gegenüber Werkstück
- **Token-Tausch: niedrig.** Alle Namen existieren. Die Werkstück-Bausteine (`--key-face`, `--well`, `--lcd-face`, `--dots`) werden auf Linie oder transparent gesetzt, die Stil-Schicht wird schlanker (Gummitasten, Display-Raster und LED-Punkte entfallen).
- **Komponenten: mittel.** Neu sind Clip-Wellenform als Lichtstriche (statt LED-Punkte, im selben Canvas-Pfad), Fader als Linie mit Lichtsäule, Spurgruppen-Kopf und eingeklappte Lichtstreifen, Auswahl mit Ecken und Laufzeit-Griff, Wunsch-Feld. Die Gruppen, die Laufzeit und der Wunsch kommen ohnehin, Phosphor gibt ihnen nur die Form.
- **Licht: mittel bis hoch.** Umgebungslicht-Canvas, Maske an der Marke, Funken-Canvas. Alles läuft über `requestAnimationFrame` und eine Variable pro Bild, ohne `backdrop-filter`. Zu messen (Motion-Designer): Handy mit 4-fach gedrosselter CPU, Ziel unter 2 ms pro Bild für Licht und Funken. Die Pegel pro Kategorie braucht die Engine als `engine.categoryLevels()` (Audio-Engineer).
- **Risiko:** Das Licht ist der Charakter. Ohne Abspielen wirkt Phosphor sehr streng (Handy rechts). Das ist Absicht, muss Martin aber gefallen. Außerdem ist der Hell-Modus nur eine Ableitung.

## Dateien (F)
- `f-phosphor.html`: Mockup (statisch, nur Google Fonts extern, ohne JS)
- `f-phosphor.png`: Gesamtbild (1×)
- `f-phosphor-handy.png`: beide Handys (2×)
- `f-phosphor-desktop.png`: Desktop (2×)
