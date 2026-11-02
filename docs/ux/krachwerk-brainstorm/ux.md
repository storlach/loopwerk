# Krachwerk: Bedienkonzept (UX-Brainstorming)

**Stand:** 02.11.2026 · **Art:** Konzept für Martin, kein Code, keine Freigabe.
**Auftrag (Martin):** „sehr ähnlich wie beim Loopwerk“, Songs bauen, aber hauptsächlich aus Selbstaufgenommenem. Dem Selbermachen mehr Raum und mehr Einstellungen geben, das UI reduzieren, ohne Funktionen zu verlieren.
**Grundlage:** Loopwerk 2.8 lokal (`tests/serve.cjs`, Playwright), Desktop 1400×820 und Handy 390×844 (Touch). Screenshots in `docs/ux/krachwerk-brainstorm/shots/` (`desk-*`, `phone-*`). Der Pad-Wand-Prototyp (`src/werkstatt/`) dient nur als Werkzeugkiste.

---

## 1. Inventur Loopwerk heute

### 1.1 Flächen und Bedienelemente

| Fläche | Element-IDs (Auswahl) | Inhalt | ca. Bedienelemente |
|---|---|---|---|
| Deck | `.deck`, `#play-btn`, `#rec-btn`, `#loop-btn`, `#metro-btn`, `#home-btn`, `#lcd-*`, `#bpm-input`, `#key-sel`, `#meter`, `#undo-btn`/`#redo-btn`, `#project-menu-btn`, `#deck-export` | Transport, Anzeige, Projekt, Export | 14 |
| Projekt-Menü | `#project-menu` (Name, Öffnen, Speichern, Beispiel, Leeren, Tipps) | Datei | 7 |
| Ansichtsleiste | `#arr-bar`: `#zoom-in/out`, `#zoomy-in/out`, `#snap-sel`, `#select-btn`, `#select-all-btn`, `#arr-pills` | Zoom, Raster, Auswahl | 7–9 |
| Streifen über den Spuren | `.key-row` (Tonart pro Takt), `.chord-row` (Akkorde) | Harmonie | 2 Zeilen |
| Spurkopf (je Spur) | Name, `…`-Menü (9 Einträge), M, S, Lautstärke-Knopf | Spur | 4 × 8 Spuren = 32 |
| Regal „Suchen“ | `#shelf-search`, Ordnen (2), Länge (6), Kategorien (8), Akkordeon, Favoriten | Bibliothek | ~20 + Liste |
| Regal „Erstellen“ | `#starter` (9 Genres + Nochmal), 7 Karten `.ccard` | Anlegen | 17 |
| Inspektor | `#insp`: Clip (3 Regler, Laufzeit 5, Werkzeuge 4), Spur (2 Regler, Verlauf 4, Länge 4, Kurve, 7 Effekte), Song (Tempo, Tonart, Länge, Mastering 6, Master, 7 Effekte) | Eigenschaften | 20–35 je Zustand |
| Docks/Fächer | `#mixer`, `#editor`, `#pattern`, `#fxpad`, `#export`, `#tempo`, `#song`, `#link-pop`, Regal-Fach | Werkzeuge | 9 Flächen |
| Sample-Editor | `#editor`: Name, ▶, ↶, ✕, Übernehmen, 5 Reiter, 23 Werkzeuge | Klang | ~30 |
| Pattern-Editor | `#pattern`: Kopf mit 17 Feldern/Knöpfen in zwei Zeilen (`#pat-bars` … `#pat-clear`), Einsingen-Bereich (7) | Beat/Melodie | ~25 + Raster |
| Fachleiste | `#tabbar`: Sounds, Mixer, FX-Pad, Editor, Song, Tastenkürzel | Navigation | 5–6 |
| Clip-Leiste (Handy) | `#clipbar`: Bearbeiten, Teilen, Duplizieren, Löschen, Pegel (+5 Regler) | Clip | 5–10 |
| Einblender | `#hint` | Rückmeldung | 1 |

**Gemessen** (sichtbare Knöpfe, Eingaben, Listeneinträge im Bild, Beispielprojekt):

| Zustand | Desktop 1400×820 | Handy 390×844 |
|---|---|---|
| Start | 106 | 39 |
| Clip gewählt | 112 | 44 |
| Mixer offen | 155 | 63 |
| Sample-Editor offen | 168 | 89 |
| Export offen | 125 | 51 |
| `index.html` statisch | 114 `<button>`, dazu alle erzeugten | |

**Raum für die eigentliche Arbeit:**
- Desktop: Regal 272 px + Inspektor 300 px = 41 % der Breite; für Clips bleiben 618 px (44 %), Bild `desk-02-clip.png`.
- Handy: die erste Spur beginnt erst bei y = 234 px (Deck 58, Ansichtsleiste 44, Lineal 44, Tonart 44, Akkorde 44). Spurköpfe nehmen 124 von 390 px (32 %). Clipfläche ≈ 266 × 550 px, also 44 % des Bildschirms (`phone-01-start.png`).

### 1.2 Doppelte Wege (Belege)

| Funktion | Orte heute | Anzahl |
|---|---|---|
| **Ein-/Ausblenden** | Griffe am Clip, Inspektor-Regler (Clip), `#clipbar` → Pegel, Editor `#ed-fadein/#ed-fadeout` (zerstörend), Inspektor Spur „Verlauf“ (Automation), Spurmenü „Einblenden/Ausblenden“ | 6 Orte, **3 verschiedene Bedeutungen** unter demselben Wort |
| Tonart | `#key-sel` (Deck), Tonart-Streifen, Inspektor Song, `#key-sel-song`, `#key-sel-phone`, Autotune `#ed-at-root` | 6 |
| Spur-Lautstärke | Knopf im Spurkopf, Inspektor Spur, Mixer-Fader, Automationskurve | 4 |
| Clip bearbeiten | Doppelklick, Inspektor „Bearbeiten“, Fachleiste „Editor · Name“, `#edit-btn`, `#cb-edit` | 5 |
| Tempo | `#bpm-input`, Inspektor Song −/+, Kachel `#song-tempo`, Fach `#tempo` | 4 |
| Mastering | Inspektor Song, `#song-mst-slot`, Export `#ex-mastering` | 3 |
| Effekte der Spur | Inspektor Spur, `#mixer-detail` | 2 |
| Anlegen | Reiter „Erstellen“ (Desktop) und `+ Import/+ Link/+ Beat/+ Melodie` im Regal (Handy) | 2 Muster |
| Rückgängig | Deck ↶, Editor `#ed-undo`, Editor ✕ Abbrechen | 3 |

Doppelte Wege sind nicht an sich schlecht (Magix hatte sie auch). Schlecht ist, dass sie **gleichzeitig sichtbar** sind (Desktop mit Clip: Lautstärke Spur steht im Spurkopf und im Inspektor, beim Mixer dreifach) und dass gleiche Wörter Verschiedenes meinen (Einblenden).

### 1.3 Selten gebraucht, ständig sichtbar

| Element | Warum selten | Kosten |
|---|---|---|
| Tonart- und Akkord-Streifen | wird einmal pro Song gesetzt | Handy 88 px Höhe (10 %) |
| Zoom ±, Spurhöhe ± (4 Knöpfe) | Handy hat Zwei-Finger-Zoom, Desktop Strg+Mausrad | eine ganze Leiste |
| M, S, Lautstärke je Spur | beim Mischen, nicht beim Bauen | 24 Bedienelemente bei 8 Spuren |
| 8 leere Standardspuren | leerer Song braucht 1–2 | Rauschen, die Hälfte ist leer |
| Schlag, Zeit, Master-Pegel im Deck | Anzeige ohne Handlung | Deckbreite |
| 7 Effekt-Schalter mit „aus“ im Inspektor | jede Spur zeigt alle, auch ungenutzte | ~50 % des Inspektors |
| Laufzeit, Sound-Tempo, Länge in Takten (Spur) | Spezialfälle | Inspektor |
| Pattern-Kopf: Swing, Anschlag, Gleiten, Notenlänge, Einrasten, Tonleiter-Art | Feinheiten | zwei volle Zeilen vor dem Raster (`desk-03-pattern.png`) |
| Editor: alle 23 Werkzeuge untereinander (Handy) | man braucht 1–3 pro Sitzung | Handy-Editor zeigt Werkzeuge statt Klang (`phone-03-editor.png`) |

**Und strukturell:** Loopwerk ist um das Regal gebaut (Suchen → Ziehen). Das Selbermachen steckt in drei getrennten Welten: Aufnahme (Deck ●), Sample-Editor (Dock mit Übernehmen/Abbrechen) und Pattern-Editor (Dock). Wer einen Klang formt, verlässt den Song in einen Modus mit eigenem ▶, eigenem ↶, eigenem Speichern. Der Tipp `fx-track` muss sogar erklären: „Soll ein Sound anders klingen, leg ihn auf eine eigene Spur.“ Das ist der Kern, den Krachwerk anders lösen muss.

---

## 2. Reduktionsprinzipien „gleiche Funktionen, weniger sichtbar“

| # | Prinzip | Was es in Krachwerk heißt | Was verschwindet oder zusammenfällt |
|---|---|---|---|
| P1 | **Drei Objekte, drei Fragen** | **Sound** = wie klingt es (Schnitt, Hüllkurve, Tonhöhe, Filter, Zeit). **Clip** = wo, wie lang, wie laut im Song. **Spur** = Raum und Mischung (Echo, Hall, Kompressor, Pegel, Panorama). Jede Einstellung hat genau ein Objekt. | Die drei „Einblenden“ werden getrennt benannt: Clip-Ein-/Ausblenden (am Clip), Hüllkurve (Sound), Lautstärkekurve (Spur). Der Tipp „leg ihn auf eine eigene Spur“ entfällt. |
| P2 | **Auswahl bestimmt die Werkbank** | Ein einziger Bereich, die **Werkbank**, zeigt immer das Ausgewählte: Sound, Kit, Instrument, Spur oder (ohne Auswahl) Song. | Inspektor, Clip-Leiste, Sample-Editor, Pattern-Editor, Mixer-Detail, Tempo-Fach, Song-Fach, Export-Klappfeld fallen in **eine** Fläche (9 Docks → 1). |
| P3 | **Nichtzerstörend, also kein Übernehmen** | Sound-Einstellungen sind Parameter (Rezept), wirken sofort und hörbar im laufenden Song. Rückgängig ist das einzige ↶. „Als Variante“ kopiert, wenn nur ein Clip anders klingen soll. | `#ed-apply`, `#ed-cancel`, `#ed-undo`, das eigene ▶ im Editor und im Pattern-Editor (`#pat-play`): ▶ im Deck spielt den Loop um die Auswahl. |
| P4 | **Werkzeug am Objekt** | Ausgewählter Clip zeigt Griffe (Länge, Pegel, Blenden) und eine kleine Leiste direkt darüber: Werkbank, Teilen, Kopie, Löschen. Loop-Bereich im Lineal zeigt „Festhalten“. Leere Spur zeigt „● Hier aufnehmen“. | `#arr-bar` (Auswählen/Alle als langes Drücken bzw. Strg+A), `#split-btn`/`#edit-btn`/`#dup-btn`/`#del-btn` im Deck, `#clipbar` als feste Leiste. |
| P5 | **Gezeigt wird, was belegt ist** | Spur zeigt nur Effekte, die an sind, plus „+ Effekt“. Tonart-/Akkord-Streifen erscheinen erst, wenn man sie im Song einschaltet oder einen Wechsel setzt; sonst steht die Tonart im Lineal. Neuer Song hat 2 Spuren, „+ Spur“ wächst mit. | 7 × „aus“ im Inspektor, 2 Streifenzeilen, 6 leere Spuren. |
| P6 | **Zwei Stufen: Grund und Feinheiten** | Jede Werkbank-Seite zeigt zuerst 3–5 Griffe, die meistens reichen; „Feinheiten“ klappt den Rest auf und merkt sich das je Seite. | Pattern-Kopf von 17 auf 4 sichtbare Felder; Editor von 23 auf ~5 sichtbare Werkzeuge je Reiter. |
| P7 | **Spuren schlank, Mischen auf Abruf** | Spurkopf = Farbe + Name (+ Pegelfunke beim Spielen). M/S/Lautstärke in der Spur-Werkbank und im Song unter „Mischen“ (alle Kanäle). Am Desktop optional „Köpfe breit“. | 24 Bedienelemente bei 8 Spuren; Mixer als eigener Reiter. |
| P8 | **Ein Ort für den Song** | Tipp auf Songname/Tempo im Deck = Song in der Werkbank: Tempo, Tonart, Länge, Mischen, Mastering, Exportieren, Speichern/Öffnen, Sicherung. | Projekt-Menü, Fach „Song“, Fach „Tempo“, Export-Klappfeld, Tonart/Tempo-Eingaben im Deck. |
| P9 | **Jede Geste hat einen sichtbaren Zwilling** | Gesten beschleunigen, sind aber nie der einzige Weg: alles steht auch in der Werkbank oder im Lang-drücken-Menü und ist per Tastatur erreichbar. | nichts, aber verhindert versteckte Funktionen |
| P10 | **Leere wird Einladung, nicht Erklärung** | Leere Spur/leere Kiste zeigt die 2–3 nächsten Handlungen als Objekte (Karten, ziehbar). Sie verschwinden mit dem ersten Clip. | Song-Starter, Reiter „Erstellen“ als Dauerfläche |

---

## 3. Aufteilung des Bildschirms

**Drei Flächen, nur eine davon immer offen:**

| Fläche | Rolle | Immer sichtbar? |
|---|---|---|
| **Song** (Arranger) | Zusammensetzen, hören, Takes | ja, immer (mindestens 2 Spuren und die Abspielmarke) |
| **Werkbank** | das Ausgewählte formen (Sound, Kit, Instrument, Spur, Song) | auf Abruf, öffnet bei Auswahl in der kleinsten Stufe |
| **Kiste** (eigene Sounds) | finden, neu machen (+), ziehen | auf Abruf (Handy), schmal einklappbar (Desktop) |

### Handy 390×844 (Hochformat, Daumen unten)

```
┌──────────────────────────────┐
│ Mein Song · 92 · Am    ↶  ↷  │  56 px  Tipp = Song in der Werkbank
├──────────────────────────────┤
│ 1   2   3   4  [Loop]        │  32 px  Lineal, Tonart steht hier
│▌Stimme │▒▒▒▒▒▒▒│             │
│▌Kit    │■■■■│■■■■│           │  Song: Köpfe 56 px (Farbe+Name)
│▌+ Spur                       │
├──────── ═══ ─────────────────┤  Griff
│ Bumm 3 · Sound   ▸ Form Ton …│  Werkbank: zu 56 / Mitte 50 % / oben 85 %
│ (Wellenform mit Griffen)     │
├──────────────────────────────┤
│  Kiste    ▶    ●    Werkbank │  64 px  Daumenleiste
└──────────────────────────────┘
```

- Transport wandert nach unten in die Daumenleiste (▶ und ● sind die häufigsten Tipps). Oben bleibt nur, was man liest.
- Spurkopf 56 statt 124 px: Clipfläche wächst von 44 % auf etwa 60 % (Werkbank zu).
- Werkbank „Mitte“ lässt 2–3 Spuren und die Marke sichtbar: man formt einen Klang, während der Song läuft.
- Kiste ist eine Schublade wie heute (`sheets.js`), Haltepunkte werden je Fläche gemerkt.

### Desktop 1400×820

```
┌ ▶ ● ⟲ Klick │ 005.2 · 92 BPM · Am │            ↶ ↷ │ Mein Song ▾ ┐
├ Kiste 240 ──┬─ Song ─────────────────────────────────────────────┤
│ + Neu       │ Lineal                                              │
│ Suchen      │ Spuren                                              │
│ Aufnahmen   │                                                     │
│ Kits        ├─ Werkbank (Höhe ziehen, 35 / 55 / 75 %) ───────────┤
│ Instrumente │ Sound „Bumm 3“  Form | Ton | Farbe | Zeit | Zerlegen│
│ Schleifen   │ Wellenform groß · Griffe · 4–5 Regler · Feinheiten  │
└─────────────┴─────────────────────────────────────────────────────┘
```

- **Kein rechter Inspektor mehr:** seine Inhalte sind die Werkbank. Clipfläche ohne Werkbank: 1140 statt 618 px.
- Werkbank unten wie Magix-Editoren: volle Breite für Wellenform, Raster, Pads und Klaviatur.
- Kiste mit `Tab` oder Knopf einklappbar (24 px Leiste).
- Ab ~1700 px darf die Werkbank optional rechts andocken (gleicher Inhalt, andere Lage).

### Was wo lebt

| Immer sichtbar | Bei Auswahl | Auf Abruf |
|---|---|---|
| ▶, ●, Loop, ↶/↷, Takt, Tempo, Songname, Spuren, Lineal | Werkbank (kleinste Stufe), Leiste am Clip, „Festhalten“ am Loop-Bereich | Kiste, Werkbank-Feinheiten, Mischen, Export, Tastenkürzel/Gesten, Tipps |

---

## 4. Hauptabläufe (Tipps gezählt)

Zählweise: jeder Tipp/Klick und jede Zieh-Geste = 1. Systemdialoge (Mikrofon-Freigabe) zählen extra in Klammern.

### a) Erster Start → erstes eigenes Geräusch → als Clip im Song

Leerer Song mit 2 Spuren. Auf der ersten Spur liegen drei Karten: **● Geräusch aufnehmen · Klatsch dein Kit · Ohne Mikro: Synth**.

| Schritt | Handy | Desktop |
|---|---|---|
| 1 | „● Geräusch aufnehmen“ antippen (+1 Freigabe) | Karte klicken oder `R` |
| 2 | Geräusch machen. Licht reagiert auf den Pegel; Stopp nach Stille oder Tipp | gleich |
| 3 | Automatik: säubern (`clean.js`), benennen, einordnen: **kurz/perkussiv** → Pad 1 eines neuen Kits + 1-Takt-Groove als Clip; **tonal** → Instrument + Grundton-Clip im Takt; **lang** → Clip, auf ganze Takte gerundet (nur bei < 5 % Abweichung) | gleich |
| 4 | Song spielt im Loop sofort los. Werkbank öffnet „zu“ mit Name und „Nochmal“ | gleich |

**1 Tipp** bis zum klingenden Clip (heute in Loopwerk: ● im Deck, Vorzähler, Stopp, Clip wählen, Editor, zuschneiden, Übernehmen = 6+). Karten verschwinden mit dem ersten Clip; danach liegt dasselbe unter „+ Neu“ in der Kiste und als „● Hier aufnehmen“ auf jeder leeren Spur.

### b) Aufnahme im Loop über den laufenden Song (Takes)

| Schritt | Handy | Desktop |
|---|---|---|
| 1 | Loop-Bereich im Lineal ziehen (vorhanden: Takte 1–4) | gleich |
| 2 | Spur antippen (oder leere Spur) | gleich |
| 3 | ● in der Daumenleiste: 1 Takt Vorzähler, dann nimmt jeder Durchlauf einen Take auf | ● oder `R` |
| 4 | ● nochmal = Stopp am Ende des Durchlaufs | gleich |
| 5 | Clip trägt „3 Takes“. Werkbank zeigt Takes als Reihe 1 · 2 · 3; Antippen hört den Take im Loop, der zuletzt gehörte gilt | gleich, `←/→` wechselt |

**3 Tipps + 1 Zug.** Takes sind ein Stapel im selben Clip (kein Spurwirrwarr), Verwerfen über „Take löschen“ oder ↶. Für später: „Beste Stellen“ (Takt-weise wählen) als Feinheit. Kopfhörer-Hinweis einmal als Einblender, wenn kein Kopfhörer erkannt wird.

### c) Klang formen: die Werkbank für Sounds

**Rein:** Clip antippen = Werkbank „zu“ (Name + 3 Schnellgriffe). Hochwischen oder Doppeltipp/Doppelklick = „Mitte“/„oben“. Auch: Sound in der Kiste antippen.
**Raus:** Runterwischen, ins Leere des Songs tippen, `Esc`. Nichts muss bestätigt werden.

Aufbau: oben die **Wellenform in voller Breite** (Griffe für Anfang/Ende, Hüllkurve als 4 ziehbare Punkte, Anschlagsmarken), darunter Reiter mit je 3–5 Griffen:

| Reiter | Grund (sichtbar) | Feinheiten |
|---|---|---|
| **Form** | Anfang/Ende (Griffe), Hüllkurve (Angriff, Halten, Ausklang), Lautstärke, Rückwärts | Stille entfernen, Normalisieren, Bereich stumm |
| **Ton** | Tonhöhe ±24 Halbtöne, erkannter Grundton, „Auf Tonart ziehen“ | Feinstimmung (Cent), Autotune (Stärke, Roboter), Formant |
| **Farbe** | XY-Fläche Filter (x = Frequenz, y = Resonanz), Wärme/Zerren | Hochpass, Bitcrusher, EQ-Kurve |
| **Zeit** | Auf Song-Tempo strecken (an/aus), Länge in Takten, halb/doppelt | Strecken-Qualität, „Als Loop“ |
| **Zerlegen** | „An Anschlägen“ · „In 8 gleiche“ · Empfindlichkeit; Ergebnis → **Kit** / **Instrument** / **Clips auf Spur** | Marken einzeln verschieben/löschen |
| **Herkunft** | Name, Stammbaum („Löffel → gestimmt → aus Schleife 2“), „Als Variante“ | Löschen, unbenutzte zeigen |

Raum: Handy „Mitte“ 50 % (Song spielt sichtbar weiter), „oben“ 85 % für Feinarbeit. Desktop 55 % Standard. **Mehr Einstellungen als heute** (Hüllkurve, Filter, Feinstimmung, Zerlegen sind neu am Sound), aber **weniger gleichzeitig sichtbar** (5 statt 23 Werkzeuge).

Tipps: Rückwärts = Clip antippen + „Form“ + Rückwärts = **2–3** (heute: Clip, Bearbeiten, Reiter Klang, Rückwärts, Übernehmen = 5).

### d) Beat und Melodie aus eigenen Klängen

Kit und Instrument sind **Objekte in der Kiste** (wie Sounds): Kit = bis 16 Pads mit eigenen Sounds, Instrument = ein Sound über die Tasten (Grundton per YIN).

| Schritt | Beat | Melodie |
|---|---|---|
| 1 | Kit in der Kiste antippen (oder aus a/„Zerlegen“) | Instrument antippen |
| 2 | Auf Spur ziehen = Pattern-Clip mit Grundgroove (Desktop) / „Auf Spur“ (Handy) | „Auf Spur“ = leere Melodie |
| 3 | Werkbank zeigt oben **Pads 2×4**, darunter **16 Schritte** je Pad | oben **Tasten der Tonart**, darunter Rolle |
| 4 | Schritte antippen; oder ● und auf den Pads spielen (wird ins Raster gelegt) | Rolle antippen; oder ● und Tasten spielen; oder „Vorsingen“ |

**3–4 Tipps** bis zum eigenen Beat. Pad leer antippen = in dieses Pad aufnehmen; Sound aus der Kiste aufs Pad ziehen = tauschen; Pad lang drücken = Sound in der Werkbank formen (Wechsel Kit ↔ Sound mit „‹ Kit“ zurück). Sichtbar im Pattern nur: Takte, Pads/Schritte, ●. Swing, Anschlag, Gleiten, Notenlänge, Einrasten, Tonleiter-Art unter „Feinheiten“. Synth-Kits und Synth-Klänge sind Kit/Instrument-Objekte mit dem Etikett „Strom“, ihre Regler (Oszillator, Filter, Hüllkurve) stehen im Reiter „Farbe“ des Instruments.

**● hat einen Kontext:** Werkbank zeigt Kit/Instrument → ● nimmt Pads/Tasten auf; sonst Mikrofon. Unter ● steht klein die Quelle („Mikro“, „Pads“, „Tasten“), lang drücken wählt sie.

### e) Teile des Songs festhalten (Resampling) und weiterverarbeiten

| Schritt | Handy | Desktop |
|---|---|---|
| 1 | Loop-Bereich ziehen (oder vorhanden) | gleich |
| 2 | Am Loop-Bereich erscheint **„Festhalten“** → antippen | gleich, `F` |
| 3 | Ergebnis „Schleife 1“: in der Kiste, als Clip auf neuer Spur unter dem Bereich, Quellspuren in diesem Bereich stumm (nicht gelöscht) | gleich |
| 4 | Werkbank öffnet mit der Schleife → z. B. Zerlegen → Kit, Rückwärts, Strecken | gleich |

**2 Tipps + 1 Zug.** Mehrere Clips/Spuren gewählt → „Festhalten“ steht in der Auswahl-Leiste und nimmt nur diese. Feinheiten: „mit Spur-Effekten“ (an), „Ausklang in den Anfang falten“ (an), „Quellen stumm“ (an). Ein Undo-Schritt.

### f) Song fertig machen und exportieren

| Schritt | Handy | Desktop |
|---|---|---|
| 1 | Songname oben antippen → Werkbank zeigt **Song**: Tempo, Tonart, Länge, Mischen, Mastering, Exportieren, Speichern | Klick auf „Mein Song ▾“ oder ins Leere des Songs |
| 2 | „Mastering“ an (eine Voreinstellung, A/B in Feinheiten) | gleich |
| 3 | „Exportieren“: WAV, ganzer Song, mit Ausklang. Am Handy Teilen-Menü | Download |

**2 Tipps** mit sinnvollen Voreinstellungen, **3** mit Mastering. MP3, Loop-Bereich, Einzelspuren unter „Feinheiten“. „Mischen“ zeigt alle Kanäle als Fader nebeneinander (heutiger Mixer), Tipp auf einen Kanal = Spur in der Werkbank.

### Übersicht Tipps

| Ablauf | Loopwerk heute (Handy) | Krachwerk |
|---|---|---|
| a) erstes Geräusch als Clip | 6+ | 1 |
| b) Takes im Loop | nicht möglich | 3 + Zug |
| c) Rückwärts | 5 | 2–3 |
| d) eigener Beat | Kit nur mit Katalog-Sounds | 3–4 |
| e) Festhalten | nicht möglich | 2 + Zug |
| f) Export | 3 (Song, Exportieren, Exportieren) | 2 |

---

## 5. Wohin die Loopwerk-Funktionen wandern (nichts fällt weg)

| Loopwerk | Krachwerk |
|---|---|
| Regal (Suchen, Filter, Kategorien, Genres) | Kiste: Suche + Gruppen nach Herkunft (Aufnahmen, Kits, Instrumente, Schleifen, Strom); Genres/Länge entfallen mangels Katalog |
| Erstellen-Karten, Song-Starter | „+ Neu“ in der Kiste und Karten auf leeren Spuren; Starter entfällt (keine Loops), Begleitung siehe Frage 4 |
| Inspektor Clip/Spur/Song | Werkbank je Objekt |
| Sample-Editor | Werkbank Sound (nichtzerstörend) |
| Pattern-Editor | Werkbank Kit/Instrument |
| Mixer, Mixer-Detail | Song → Mischen; Spur → Werkbank |
| FX-Pad | Werkbank Song → „Spielen“ und Werkbank Spur; Ergebnis per „Festhalten“ zum Sound |
| Tonart-/Akkord-Streifen | Song → Tonart „Wechsel im Song“ blendet den Streifen ein |
| Automation | Spur-Werkbank „Kurven“ (heute `auto-lane.js`), Kurve im Song einblendbar (`A`) |
| Zoom/Spurhöhe-Knöpfe | Zwei-Finger/Strg+Rad; Knöpfe in Song → Ansicht |
| Projekt-Menü, Export-Klappfeld, Tempo-Fach | Werkbank Song |
| Clip-Leiste (Handy) | Leiste am Clip (4) + Werkbank |
| Tastenkürzel/Gesten-Liste, Tipps | Song → Hilfe; Tipps wie heute (`tips.js`) |

---

## 6. Risiken und Gegenmittel

| Risiko | Wo | Gegenmittel |
|---|---|---|
| **Auffindbarkeit**: Feinheiten und Gesten findet niemand | Werkbank, Kit-Pads, Festhalten | P9 (jede Geste hat einen sichtbaren Zwilling); Tipps beim ersten Auftauchen eines Objekts; Feinheiten-Zustand je Reiter gemerkt; „Festhalten“ sitzt sichtbar am Loop-Bereich statt in einem Menü |
| **Ein ● mit zwei Bedeutungen** (Mikro vs. Pads) | d) | Quelle steht unter ●; Mikro-Aufnahme immer mit rotem Ring + laufender Zeit (Formsignal, nicht nur Farbe, CD-Hinweis Pink/Rot); lang drücken wählt |
| **Sound-Änderung wirkt auf alle Clips** | c) | Kopfzeile „in 3 Clips“; „Als Variante“ direkt daneben; ↶ |
| **Gestenkonflikt**: Wischen scrollt vs. Clip ziehen vs. Werkbank-Griff vs. Wellenform-Auswahl | Song, Werkbank | Regel wie heute: erst antippen, dann ziehen; Wellenform nimmt waagerechte Züge, Werkbank-Griff nur senkrechte am Griffband; Wischen von unten im Song ist kein Befehl |
| **Werkbank verdeckt den Song** | Handy | Stufe „Mitte“ hält 2–3 Spuren und Marke frei; gewählte Spur scrollt in Sicht; Marke läuft weiter |
| **Rechenzeit** bei Live-Parametern (Strecken, Autotune, Zerlegen) | c) | Vorschau sofort mit einfacher Kette, genaues Rendern im Worker (`runJob`) mit Fortschritt im Clip, nicht modal |
| **Speicher wächst** mit Takes und Varianten | b), c) | Takes verlieren, die beim Schließen des Songs nicht gewählt sind → „Unbenutzte zeigen“ in der Kiste, kein Auto-Löschen; Laden auf Abruf (Spec Abschnitt 4) |
| **Barrierefreiheit** | überall | Werkbank ist ein `region` mit Überschrift = Objektname; Reiter als `tablist`; Griffe auf Wellenform auch als Regler (`role=slider`, Pfeiltasten); Pads als Knöpfe mit Namen; Fokus springt beim Öffnen in die Werkbank, `Esc` zurück zum Clip; Tippziele ≥ 44 px; Hüllkurve/Filter-Fläche mit Zahlenwert im Feinheiten-Teil; `prefers-reduced-motion`: Roh→geformt-Wolke und Schubladen-Federn aus |
| **Desktop wird schlechter** (Inspektor weg) | Desktop | Werkbank darf rechts andocken; Tastenkürzel bleiben; Inspektor-Logik (Auswahl → Inhalt) bleibt dieselbe, nur die Lage ändert sich |
| **Zu weit weg von Loopwerk** (wie der Prototyp) | Gesamt | Song bleibt die Hauptfläche, gleiche Gesten, gleiche Engine, gleiche Projektdatei; Krachwerk-Projekte öffnen sich in Loopwerk |

---

## 7. Offene Fragen an Martin

1. **Werkbank unten oder rechts am Desktop?** Unten (Vorschlag: volle Breite für Wellenform und Pads, wie Magix) oder rechts wie der heutige Inspektor (Spuren bleiben voll sichtbar, Wellenform schmaler)?
2. **Sound-Änderungen wirken auf alle Clips dieses Sounds** (Instrument-Denken, Vorschlag) **oder nur auf den gewählten Clip** (Loopwerk-Editor-Denken, mehr Varianten in der Kiste)?
3. **Transport unten in der Daumenleiste am Handy?** Abweichung vom Loopwerk-Deck oben zugunsten des Daumens.
4. **Harmonie-Werkzeuge** (Tonart pro Takt, Akkord-Streifen, Begleitung) und **Claude-Hilfen** (Melodie weiterführen, Klang aus Beschreibung): in Krachwerk behalten (versteckt unter Song bzw. Feinheiten) oder bewusst weglassen, weil „alles von dir“?
5. **Was ist der erste Klang?** Leerer Song mit drei Karten (Vorschlag) oder Start direkt mit offenem Mikrofon-Feld („Mach ein Geräusch“)?
