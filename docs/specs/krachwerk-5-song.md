# Krachwerk Scheibe 5: Song-Werkbank und Abschluss

**Stand:** 03.11.2026 · **Grundlage:** `synthese.md` §3.4/§3.9/§5–6 (Frage 4: Ruhe gemeinsam, in Loopwerk aus), `ux.md` f + §5 (wohin wandert was), `architektur.md` §1, ADR 007, Specs 1–4, `v2.13-aufnahme.md` A/C (Feld „Aufnahme“, nicht hier gebaut) · **Branch:** `werkstatt`
**Rahmen:** Loopwerk unter `/` optisch unverändert (Zählbasis exakt), Unterschiede nur in `src/edition.js`, ≤ 5 Grund-Griffe je Reiter, keine neue Signalkette, `PROJECT_VERSION` bleibt 1.

## 0. Ziel aus Nutzersicht
Martin tippt auf den Songnamen, stellt Tempo und Länge ein, schaltet Mastering an und hat mit „Exportieren“ seinen Track als WAV, mit einer Zutatenliste der eigenen Klänge. Alles, was den ganzen Song betrifft, liegt an einem Ort.

## 1. Umfang
**Drin:** Song-Werkbank mit Kopf und Reitern **Song · Mischen · Fertig · Projekt · Aufnahme** (ersetzt in Krachwerk das Song-Fach, den Song-Abschnitt des Inspektors und die Einstiege in Export- und Mixer-Fach) · Zutatenliste beim Export und Teilen · Ruhe-Schicht `calm` in Loopwerk **schaltbar, aber aus** · Adresse `/krachwerk/` vorbereitet, **nicht umgestellt** · Abschluss-Prüfungen (Inventar, Endziel-Zahlen, Ablauf a–f in einem Test).
**Nicht drin:** Strom-Regler (Synth-Parameter, eigene Spec), Projektdatei als ZIP, der Umzug selbst, ein sichtbarer Schalter „ruhig“ in Loopwerk, neue Effekte oder Sends (v2.14).

## 2. Bedienung
**Öffnen:** Desktop: Klick auf „Songname ▾“ im Deck, ins Leere des Songs oder auf den eingeklappten Werkbank-Streifen. Handy: Tipp auf die Lesezeile (Name · Takt · Tempo), die Werkbank-Schublade zeigt den Song (Haltepunkt je Objektart gemerkt, Scheibe 1). Das alte Song-Fach `#song` gibt es in `calm` nicht mehr, seine Knöpfe ziehen per `place()` in die Reiter.
**Kopf** (wie beim Sound): Name (Tipp → umbenennen, `setProjectName`) · „32 Takte · 1:25“ · **Exportieren** (einzige Weißglut-Fläche). Damit ist Exportieren **2 Tipps** ab nichts gewählt (Songname, Exportieren), egal welcher Reiter offen ist.

| Reiter | Grund (≤ 5) | Feinheiten |
|---|---|---|
| **Song** | Tempo (Zahl, Ziehen) · Tonart · Länge in Takten · Klick | Taktart · Tempo eintippen · Tonart je Takt und Akkordzeile zeigen (Zwilling aus Scheibe 1) |
| **Mischen** | Fader je Spur (das Werkstück, zählt wie Pads) · FX-Pad ▸ · Summen-Effekte ▸ | Tipp auf einen Kanalnamen = Spur-Werkbank |
| **Fertig** | Mastering an/aus · Stil (nur bei an) · nur Loop-Bereich · Teilen (nur Handy, `navigator.share`) | MP3 · Einzelspuren · Ausklang · Zutatenliste an/aus · Mastering A/B |
| **Projekt** | Speichern · Öffnen · Neuer Song · Alle Sounds sichern · Zurückholen (Scheibe 3) | Füllstand im Detail · Tastenkürzel · Tipps zurücksetzen (`#tips-reset`) · Über |
| **Aufnahme** | Feld „Aufnahme“ aus v2.13 (`#rec-setup`: Latenz, Einmessen, Eingang) · Stopp nach Stille an/aus | Säubern an/aus (nur Geräusch) · Stille-Dauer |

- **Exportieren** = WAV, ganzer Song (oder Loop-Bereich, wenn im Reiter Fertig gewählt) mit Ausklang, Mastering wie eingestellt. Fortschritt als Linie unter dem Kopf, der Song bleibt bedienbar. Am Handy öffnet danach das Teilen-Menü mit der Datei, am Desktop ist es ein Download.
- **Zutatenliste:** „Krachwerk · Mein Song · 92 BPM · Am“ und je eigener Sound eine Zeile `{Name}: {Stammbaum-Zeile}` (Herkunft, Datum, `recipeSteps`). Beim Teilen ist sie der Text der Nachricht, in WAV ein `LIST/INFO`-Block (`ICMT` ≤ 2000 Zeichen, `ISFT` „Krachwerk“), in MP3 ein ID3-Kommentar, falls `vendor/lamejs` das kann, sonst nichts.

## 3. Datenmodell
Nichts Neues im Projekt. Lokal: `lsKey('loopwerk.density')` (`'full'|'calm'`, nur Loopwerk), Reiter der Song-Werkbank in `lsKey('loopwerk.wbTab')` (wie bisher je Objektart), Export-Feinheiten in `lsKey('loopwerk.exportFine')`.

## 4. Store-Aktionen
Keine neuen. Benutzt werden die vorhandenen `setBpm`, `setKey`, `setLength`, `setProjectName`, `setMastering`, `setMaster`, `setTrack`, `clearSong`. Speichern, Öffnen und Sichern liegen außerhalb des Undo (wie heute).

## 5. Engine
Unverändert. Export über `src/export.js` (`renderProject` mit `limiter`, `compensate`, `mastering`). Neu nur `encodeWav(buffer, { info })` in `src/wav.js` für den INFO-Block (Test: Datei lesbar mit `decodeAudioData`, Samples bitgleich zur Fassung ohne `info`).

## 6. Ruhe-Schicht als Option für Loopwerk
- `EDITIONS.full.density` bleibt `'full'`. Neu `densityFrom()` in `src/edition.js`: `?density=calm` oder `lsKey('loopwerk.density') === 'calm'` setzt in **Loopwerk** `#app.dataset.density = 'calm'`. Krachwerk ist immer `calm`. Kein sichtbarer Schalter.
- `calm` heißt in Loopwerk nur: Stufen (`data-tier`), Plätze (`place` mit `calm`), Werkzeug am Clip, Daumenleiste, Werkbank rechts eingeklappt. **Nicht** dabei: Sound-Werkbank, Rezept-UI, Materialfarben, Kiste nach Material, Song-Werkbank (das bleiben Edition-Werte `workbench`, `materialColors`, `shelfGroups`, `songBench`).
- Zwillinge: gemeinsame Tabelle `CALM_TWINS` (neu `src/calm.js`) für Elemente beider Editionen; `EDITION.twins` ergänzt nur Krachwerk-Eigenes (Editor-Zwillinge aus 2b, Song-Fach → Reiter). Loopwerk-Elemente mit `data-tier="3"`, die Krachwerk nicht hat (Katalog-Filter, Starter, Demo …), bekommen einen Eintrag in `CALM_TWINS`.
- Der calm-CSS-Block bleibt einer (Grenze 150 Zeilen, Werkbank-Abschnitt eigene 120). Was größer wird, wandert in die gemeinsame Schicht.

## 7. Name und Adresse vorbereiten
- `tools/werkstatt-page.cjs` und `tools/build-pages.cjs` lesen `KW_PATH` (Standard `werkstatt`). Mit `KW_PATH=krachwerk` entstehen `_site/krachwerk/` (App, Manifest, `sw.js`) und unter `_site/werkstatt/` eine **Weiterleitung** (`location.replace` mit Abfrage und Anker, dazu `<meta http-equiv="refresh">`) und ein `sw.js`, das sich abmeldet und die Clients neu lädt.
- Speicher hängt am Ursprung (`storlach.github.io`), nicht am Pfad: IndexedDB `loopwerk-make` und `loopwerk.make.*` bleiben beim Umzug erhalten. Das Manifest bekommt **jetzt** ein festes `id` (heutiger `start_url`-Wert), damit ein Umzug die installierte App nicht verdoppelt.
- Die Adresse steht nur an einer Stelle (`EDITION.make.path`). Umgestellt wird erst nach Martins Entscheidung (dann Nachtrag zu ADR 007).

## 8. Abschluss-Prüfungen (Krachwerk fertig)
1. **Inventar**, neu `tests/inventory.json` + `tests/inventory.test.cjs`: jede Zeile aus `ux.md` §5 (Loopwerk-Funktion) → Pfad in Krachwerk (Selektor-Folge ab einem benannten Zustand), Tippzahl ≤ 2, höchstens ein Zwilling. Der Test führt jeden Pfad am Handy und am Desktop aus. Was bewusst wegfällt (Katalog, KI, Link), steht mit Grund in der Datei.
2. **Endziel-Zahlen** (`tests/count.cjs`, Bild *Clip gewählt*): Desktop ≤ 45 / ≤ 35 / ≤ 6 / ≥ 11, Handy ≤ 22 / ≤ 15 / ≤ 5 / ≥ 11, Weißglut außer Linse und Marke ≤ 1. Dazu *Song Mitte* am Handy ≤ 22 / ≤ 12 und *Song* am Desktop ≤ 45.
3. **Ablauf a–f in einem Test** („vom Klopfen zum Export“, Handy, Fake-Mikro): Geräusch (1) → Form, Rückwärts (2) → Klatsch-Kit (2) → Takes über den Loop (3b) → Festhalten (2) → Mastering + Export (3). Tipps gezählt und ausgegeben, WAV-Länge = Song + Ausklang ± 1 Frame, `ICMT` enthält alle eigenen Sound-Namen.
4. **Offline:** PWA ohne Netz: Aufnahme, Zerlegen, Kit, Festhalten und Export laufen; keine Anfrage außerhalb des Ursprungs.
5. **Startzeit** am Handy mit 200 eigenen Sounds (Speicher v2) gemessen und ausgegeben; Ziel < 2 s bis `ready` (headless, Hinweis, keine harte Grenze).
6. **Loopwerk:** `/` trifft die Basis exakt, keine Konsolenfehler, alle bisherigen Tests grün. `/?density=calm`: keine Konsolenfehler, jedes sichtbare `data-tier="3"` hat einen Zwilling, die Inventar-Pfade laufen und werden ausgegeben (ohne Budget).
7. **Adresse:** Build mit `KW_PATH=krachwerk` → beide Seiten da; `/werkstatt/?x=1#y` landet auf `/krachwerk/?x=1#y`, die eigenen Sounds sind dort sichtbar.

## 9. Testplan (zusätzlich zu §8)
**`tests/werkstatt.test.cjs`, Teil 5:** Song-Werkbank öffnet am Desktop per Songname und Klick ins Leere, am Handy per Lesezeile; 5 Reiter `role=tab`, je Grund ≤ 5; `#song` in calm unsichtbar, seine Knöpfe stehen in den Reitern (Zwillinge geprüft); Export in 2 Tipps aus jedem Reiter; Teilen ruft `navigator.share` mit `files` und `text` (Attrappe); das Feld „Aufnahme“ aus v2.13 steht im Reiter Aufnahme (fehlt v2.13 A noch, zeigt der Reiter nur „Stopp nach Stille“, und der Test überspringt mit Hinweis). Bilder `kw-song-handy`, `kw-song-desktop`, `kw-fertig-handy`, dazu `lw-calm-desktop`, `lw-calm-handy` (nur zur Ansicht für Martin).
**Ohr-Test für Martin:** (1) Einen ganzen eigenen Track mit Mastering „ausgewogen“ exportieren und am Handy und an Boxen hören: laut genug, nicht gequetscht? (2) Mastering A/B an deinem Material (viel Klopfen, wenig Bass): hilft es oder macht es dünn? (3) Ausklang am Ende des Exports: zu kurz oder zu lang?

## 10. Reihenfolge
| # | Schritt | Dateien | Wer | parallel |
|---|---|---|---|---|
| 0 | Inventar aus `ux.md` §5, Testgerüst Teil 5, Endziel-Budgets (scheitern erst) | `tests/inventory.json`, `tests/inventory.test.cjs` | qa | – |
| 1 | Song-Werkbank, `place()`-Ziele, Song-Fach in calm aus | `src/ui/song-bench.js` neu, `src/ui/inspector.js` (Option `songPanel`), `src/ui/layout.js`, `src/main.js`, `index.html` | ui-engineer | – |
| 2 | Zutatenliste, `encodeWav` mit `info`, Teilen | `src/export.js`, `src/wav.js`, `src/recipe.js` (`ingredients(project, library)`) | audio-engineer | mit 1 |
| 3 | Ruhe-Schicht für Loopwerk schaltbar, `CALM_TWINS` | `src/edition.js`, `src/calm.js` neu, `index.html` (`data-tier` an Loopwerk-Elementen) | Haupt-Session | mit 1 |
| 4 | Adresse vorbereiten, Manifest-`id` | `tools/werkstatt-page.cjs`, `tools/build-pages.cjs`, `src/werkstatt/sw.js` | Haupt-Session | mit 1 |
| 5 | Übergänge Song ↔ Clip in Werkbank und Schublade | `index.html`, `src/ui/sheets.js` | motion-designer | nach 1 |
| 6 | Streichen, wo die Endziel-Zahlen reißen (Vorschlag ui-designer, Entscheid CD) | – | ui-designer, creative-director | nach 1–3 |
| 7 | Abschluss-Prüfungen §8, `npm test` | `tests/*` | qa | nach 6 |
| 8 | CD-Endabnahme am echten Handy, ROADMAP („Krachwerk 1.0“), CLAUDE.md (Krachwerk-Absatz kürzen), Nachtrag ADR 007 | `docs/…`, `CLAUDE.md` | Haupt-Session, creative-director | – |

## 11. Für Martin am Ende (Voreinstellung gewählt)
1. **Ruhe in Loopwerk:** gebaut und unter `?density=calm` ansehbar, **aus**. Danach: (a) bleibt aus · (b) Schalter in den Einstellungen · (c) wird Standard. *Vorschlag: erst ansehen (`lw-calm-*.png`), dann b.*
2. **Adresse:** bleibt `/werkstatt/`. Der Umzug nach `/krachwerk/` ist ein Schalter (`KW_PATH`), die alte Adresse leitet weiter, die Daten bleiben. *Vorschlag: umziehen, sobald der Name feststeht.*
3. **Zutatenliste** beim Export und Teilen: *an*. Alternativ nur beim Teilen.
4. **Aufnahme-Einstellungen im Reiter Aufnahme** der Song-Werkbank statt am ●: *ja* (selten gebraucht, ● bleibt ein einziges Ziel).
5. **„Private use only“** im Fuß (gilt auch für Loopwerk): englisch lassen oder „Nur privat“? *Vorschlag: „Nur privat“.*
6. **Strom-Regler** (Synth-Klänge formen) als eigene Scheibe 6: *ja, nach deiner Durchsicht von 3–5.*

Offene Fragen, die blockieren: keine.
