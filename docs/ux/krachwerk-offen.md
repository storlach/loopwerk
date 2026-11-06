# Krachwerk – offen für Martin (Stand 2026-11-06)

Alles bis Scheibe 5 und jetzt auch 3b (Takes) ist auf dem Branch `werkstatt` gebaut, getestet und gepusht. **Auf `main` ist nichts davon gemergt.** Bei jeder Frage steht schon eine Voreinstellung. Ein Wort von dir genügt.

## 1. Merge
- **Krachwerk 3a–5 und 3b auf `main` mergen?** Danach steht es unter https://storlach.github.io/loopwerk/werkstatt/. Für Loopwerk ändert sich nichts: `/` ist im Zähltest exakt gleich geblieben, die Ruhe-Schicht kommt nur mit `?density=calm`. *Vorschlag: ja, als PR.*

## 2. Entscheidungen (Voreinstellung ist gebaut)
| # | Frage | Gebaut | Alternative |
|---|---|---|---|
| 1 | Mastering von Anfang an an | ja, „Ausgewogen“ | aus |
| 2 | Was „Exportieren“ liefert | bis zum Ende des letzten Clips, der Kopf zeigt die echte Länge, „Länge“ heißt jetzt „Arbeitsfläche“ (Feinheiten) | eingestellte Songlänge |
| 3 | Ruhe in Loopwerk (`shots-5/lw-calm-*.png`) | aus, nur `?density=calm` | b) Schalter in den Einstellungen *(Vorschlag)* · c) Standard |
| 4 | Adresse | `/werkstatt/` (Umzug per `KW_PATH`, alte Adresse leitet weiter) | `/krachwerk/` *(Vorschlag: zusammen mit 3b)* |
| 5 | „Krachwerk 1.0“ | CD: ja, sobald du Hörprobe 1 und 2 der Takes bestanden hast (unten) | weiter Vorschau |
| 6 | Rollen auf den Pads | Fachwörter klein, dein Klang groß | Klangwörter (Tief, Mitte, Hell) |
| 7 | Quellen nach Festhalten | stumm, nur im Bereich (Clips werden geteilt) | klingen weiter |
| 8 | Name des Festgehaltenen | „Schleife N“ | „Festgehalten N“ |
| 9 | Sicherung | ZIP in Teilen ≤ 200 MB | eine Datei |
| 10 | Speicher v2 in Loopwerk | migriert mit; Festhalten in Loopwerk aus | Festhalten auch in Loopwerk |
| 11 | Pads | 8 (2×4) | 16 (neuer Pattern-Typ) |
| 12 | Kits | gehören zum Song | Vorlagen über Songs hinweg (später) |
| 13 | Klatsch-Kit-Groove | „Gerade“, dazu „Halb“, „Breaks“ | – |
| 14 | Rolle (Notenrolle) | im Pattern-Editor | in der breiten Werkbank |
| 15 | Instrument | ein Grundton (eine Zone) | Mehrzonen später |
| 16 | Zutatenliste | bei Export und Teilen | nur beim Teilen |
| 17 | Aufnahme-Einstellungen | Reiter „Aufnahme“ der Song-Werkbank | am ● |
| 18 | Fußzeile | Krachwerk „Nur privat“, Loopwerk „Private use only“ | beide deutsch |
| 20 | Takes: auf welche Spur | freie Spur im Loop-Bereich (sonst neue), nicht über den gewählten Clip | auf die Spur des gewählten Clips |
| 21 | ● bei laufendem Loop | Takes ab dem nächsten Sprung, Song läuft weiter; lang drücken = Geräusch | ● immer Geräusch, Takes nur lang drücken |
| 19 | Scheibe 6 „Strom-Regler“ (Synth formen) | als nächstes | später |

## 3. Am Handy prüfen und hören
1. **Klatsch dein Kit:** 10 s auf Tisch, Knie und Brust. Liegt Dunkles auf Kick, Helles auf Hi-Hat? Groovt „Gerade“?
2. **Pad-Wand live** über den laufenden Loop: Kommt der Anschlag sofort? Landet ● mit Pads auf dem Raster?
3. **Summen → Instrument:** Stimmt der Grundton? Ab wie vielen Tasten klingt es nach Micky Maus?
4. **Festhalten** mit Hall, ↶/↷ vergleichen: gleich? Springt der Ausklang am Loop-Ende?
5. **Ganzer Track** mit Mastering exportieren und teilen: laut genug, nicht gequetscht, Ausklang passend? Liest sich die Zutatenliste gut?
6. **Sichern am iPhone:** sichern und zurückholen. Kommt die Datei in Dateien/iCloud an?
7. Ein Pad tiefer stimmen, während der Beat läuft: kommt die Änderung ohne Stolpern?

## 3b. Takes am Handy prüfen und hören
1. Loop laufen lassen, ●: Merkst du am Zählen 4·3·2·1, wann es losgeht?
2. Drei Durchgänge einsingen, mit Kopfhörer und über den Lautsprecher: Liegt die Stimme im Takt?
3. Takes umschalten (3/3 am Clip): Sind leisere Takes leiser, verzerrt der lauteste nicht?
4. In der Werkbank formen: klingen alle Takes gleich bearbeitet?
5. Einen Take im Loop wiederholen: Knackt es am Sprung? (gilt auch für Loopwerk)

## 4. Später (CD, nicht blockierend)
- 3b: „Zeit“ (Tempo) wirkt nur auf den aktiven Take (dort steht später „gilt für Take 3“); am Desktop klebt „Loop“ an ●; „Stopp nach Stille“ als Linie.
- Am Handy rutscht der Grund unter die Falz (Kit Mitte, Reiter Projekt). Der Werkbank-Kopf soll stehen bleiben.
- Kit-Clips sollen ihre Schläge als Punkte zeigen, ohne Hüllkurven-Griffe und ohne „P“.
- Kleinigkeiten:
  - Exportieren erst ab dem ersten Clip.
  - „Tonart Am · C-Dur“ ist missverständlich.
  - „in 0 Clips“ soll wegfallen.
  - Den Reiter Aufnahme bis v2.13 in die Feinheiten legen.

## 5. Wartet auf andere
- **Testlauf am 2026-11-04 nach dem Merge von `main`:** 64 von 65 Dateien liefen beim ersten Mal grün (auch `ticker`). Nur `v17` „Marke zeigt die hörbare Position“ fiel durch. Die Prüfung las zu einem beliebigen Zeitpunkt, verlangte aber 40 ms Genauigkeit bei 33–50 ms Bildabstand im Headless-Browser. Jetzt liest sie im Bild-Takt und war danach dreimal grün.
- **Bildrate in Loopwerk auf `werkstatt`:** Im Headless-Browser fällt ab und zu ein Bild mehr aus als auf `main` (längster Abstand 83 statt 50–67 ms, der Median ist gleich). Spürbar ist das nicht, sollte aber vor dem Merge einmal am echten Gerät angesehen werden (motion-designer).
- **Ältere Wackler, die auf `main` genauso auftreten:** `v14`, `v18`, `v20`, `scale-lock`, `editor-midi`, `more-loops`, `stufe7`. In diesem Lauf waren alle grün.
- **`v19` „Handy: Kopf des Editors in einer Zeile ohne Titel“ schlägt auch auf `main` fehl:** Der große Editor-Kopf (2fc0501) zeigt den Titel jetzt, der Test erwartet ihn noch versteckt. Das ist eine Sache für die Session auf `main`.
- **Doppelte Planung:** Die Session auf `main` hat eine eigene Spec `krachwerk-3-takes-festhalten.md` und ADR 011/012 mit anderem Inhalt geschrieben (06.11.). Gebaut ist auf `werkstatt` nach `krachwerk-3-festhalten.md` (ADR 011 Speicher v2, ADR 012 Kit). Die Entwürfe von `main` sind als „abgelöst“ markiert. Bitte der anderen Session sagen, dass Krachwerk auf `werkstatt` entsteht.
- **`npm test` am Stück** dauert länger als 30 Minuten (Zeitgrenze der Cloud-Session). Die Tests laufen deshalb in Teilen.
