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
