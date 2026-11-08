# ADR 011: Festhalten als eingefrorener eigener Sound, Quellen stumm

**Status:** vorgeschlagen (Architekt, 06.11.2026) · **Spec:** `docs/specs/krachwerk-3-takes-festhalten.md` §3

## Kontext
„Festhalten“ soll einen Teil des Songs (Loop-Bereich, Spur, Auswahl) samt Spur-Effekten zu einem neuen Sound machen, den man in der Werkbank weiterformt (rückwärts, zerlegen). Optional ersetzt er die Quellen an Ort und Stelle. Gelten muss: eine Signalkette (`renderProject`), Rückgängig über den Store, Überlappen ohne Verlust. Das Modell hat bisher kein Stumm am Clip. Rezepte (ADR 010) und Varianten hängen an Sound-IDs im Projekt.

## Entscheidung
1. **Das Ergebnis ist ein eigener Sound mit Audio** (`own.create`, `kind:'loop'`, `beats` = Bereich, `from:'bounce'`, `bounceOf` nur für den Stammbaum). Gerendert wird mit `renderProject(…, { master:false })`, gleiche Kette, ohne Master, Limiter und Mastering. Im Loop-Bereich wird der Ausklang in den Anfang gefaltet, damit die Länge genau N Frames bleibt und der Sound wie der gehörte Loop klingt. Rezepte der Quellen sind eingebacken, der neue Sound ist eine neue Wurzel ohne Rezept.
2. **Ersetzen heißt: neue Spur ohne Effekte unter den Quellen, Quell-Clips im Bereich stumm.** Neu ist das optionale Feld `clip.mute` (`PROJECT_VERSION` bleibt 1). Ein stummer Clip klingt nicht und verdeckt nichts. Ausgewertet wird das allein in `audibleRanges`, das Engine und Offline gemeinsam nutzen. An den Bereichsgrenzen wird geteilt, was klanglich neutral ist. Alles ist ein Store-Schritt `bounce` in einem `batch`.
3. **Ohne Effekte** (nur Spur bzw. Auswahl einer Spur) liegt das Ergebnis oben auf derselben Spur. Das Überlappungsmodell verdeckt die Quellen, ein Stumm braucht es dann nicht.
4. **16-Bit-WAV mit Kopfraum:** Liegt die Spitze über 0,98, wird der Sound abgesenkt, und der ersetzende Clip gleicht mit `gain` aus.

## Alternativen
- **Festhalten als Rezept bzw. virtueller Sound** (Liste von Quell-Clips, live gerechnet): Das wäre kein Einfrieren, kostet Rechenzeit bei jeder Änderung, und Zerlegen bräuchte dafür einen eigenen Weg. Abgelehnt.
- **Quellen löschen statt stumm schalten:** einfacher, aber nach dem Speichern ist der Weg zurück weg (Undo gilt nur in der Sitzung). Abgelehnt.
- **Quellspuren ganz stumm schalten (`track.mute`):** Das trifft auch Clips außerhalb des Bereichs. Abgelehnt.
- **Ergebnis auf die Quellspur legen, mit Effekten:** Die Effekte der Spur wirkten doppelt. Abgelehnt, außer im Fall „ohne Effekte“ (Punkt 3).
- **32 Bit Gleitkomma:** exakt ohne Ausgleich, aber doppelter Platz. Abgelehnt zugunsten von Punkt 4.

## Folgen
- `clip.mute` ist allgemein nutzbar. Ein Werkzeug „Stumm“ für jeden Clip kann später ohne Modelländerung kommen. In Scheibe 3 gibt es nur „Stumm aus“.
- Ältere Loopwerk-Stände kennen `mute` nicht und spielen festgehaltene Quellen doppelt. Das ist hingenommen, denn beide Editionen kommen aus einem Code.
- Der festgehaltene Sound bleibt nach ↶ in der Kiste wie jede Aufnahme. Weggeräumt wird er über „Aufräumen“ (ADR 012).
- Bei nichtlinearen Effekten (Kompressor, Pumpen) ist die Faltung nur fast nahtlos. Das prüft der Ohr-Test.
- Das Effekt-Pad wirkt nur live und wird nicht festgehalten, außer man hat es als Kurve aufgenommen.

## Nachtrag (Umsetzung 3d)
- „Klanglich neutral“ gilt im Loop und für Clips, die an den Bereichsgrenzen beginnen oder enden (Null-Test −340 dB, mit Hall gefaltet −112 dB). Läuft eine Quelle über eine Grenze, wird sie dort geteilt. Spielt man den Song danach ohne Loop durch die Grenze, weicht er in ±2 ms um die Naht ab: Die Überblendung von 96 Samples am Schnitt kommt zur Loop-Überblendung im festgehaltenen Sound hinzu. Ein Fade, der über die Grenze läuft, geht beim Teilen verloren, wie schon bei `splitAt`. Beides ist hingenommen und Teil von Ohr-Test 3.
