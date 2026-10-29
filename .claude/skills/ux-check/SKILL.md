---
name: ux-check
description: Prüft ein Loopwerk-Feature gegen die Bedienprinzipien des Magix Music Makers (alles ist ein Objekt, Drag & Drop, gute Voreinstellungen, keine Pflichtdialoge) und gegen Barrierefreiheit. Verwenden nach jeder UI-Änderung und vor dem Veröffentlichen.
---

# UX-Check

Jeden Punkt mit ✔ / ✘ / – (nicht relevant) bewerten, bei ✘ konkreten Vorschlag machen.

## Niederschwelligkeit
1. Grundfunktion in **höchstens zwei Klicks** erreichbar?
2. Funktioniert es **ohne Einstellungen** – sind die Voreinstellungen so, dass es sofort gut klingt/aussieht?
3. Ist das Ergebnis **direkt am Objekt** sichtbar (Clip, Spur, Regler) statt in einem Dialog?
4. Gibt es **Drag & Drop** dort, wo man es erwarten würde?
5. Rastet alles am **Raster** ein, mit Möglichkeit zum feineren Raster?
6. Ist jede Aktion **rückgängig** zu machen (Strg+Z)?
7. Sagt die **Hinweiszeile** in Alltagssprache, was gerade möglich ist?

## Rückmeldung
8. Hört/sieht man sofort, dass etwas passiert ist (Vorschau, Abspielmarke, Hervorhebung)?
9. Fehler/Grenzen erklärt statt still ignoriert?

## Zugänglichkeit
10. Mit Tastatur bedienbar, sichtbarer Fokus?
11. Kontraste in hell **und** dunkel lesbar, Zustände nicht nur über Farbe?
12. Auf Handy-Breite (400 px) bedienbar – mindestens über Tippen statt Ziehen?
13. Bewegung respektiert `prefers-reduced-motion`?

## Abschluss
- Bei Konzeptfragen oder vor größeren Freigaben zusätzlich den Skill `kritiker` nutzen.
- Ergebnis als kurze Tabelle in die Rückmeldung.
