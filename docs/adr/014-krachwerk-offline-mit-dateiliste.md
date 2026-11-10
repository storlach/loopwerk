# ADR 014 – Krachwerk ohne Netz: Service Worker mit fester Dateiliste

**Status:** angenommen (Performance Teil 2, November 2026)

## Kontext
Die Performance-Analyse (`docs/analyse/2026-11-performance.md`, 4.2) hat gezeigt: Der Service Worker von Krachwerk merkte sich nur, was nach seiner Anmeldung zufällig geladen wurde. Nach einem Besuch startete Krachwerk ohne Netz gar nicht, nach zwei Besuchen ohne Aufnahme-Worklet (Aufnehmen ging nicht), Mastering-Worklet, Rechen-Worker, Zerlegen und MP3-Encoder. Außerdem fragte er bei jedem Start für jede der gut 100 Dateien zuerst das Netz: Der Wiederbesuch dauerte am gedrosselten Handy 0,9–1,2 s statt 0,7 s ohne Service Worker.

## Entscheidung
- `tools/werkstatt-page.cjs` erzeugt `/werkstatt/sw.js` aus `src/werkstatt/sw.js` und stellt eine Zeile `self.PRECACHE = { version, files, fonts }` davor. `files` sind alle Module unter `src/` (auch die erst bei Bedarf geladenen: Worklets, Rechen-Worker, MP3-Worker, Zerlegen), `vendor/lamejs`, die Icons von Krachwerk, Seite und Manifest. `version` ist eine Prüfsumme über alle diese Dateien.
- Das ist kein Build-Schritt der App: Die Module werden weiter unverändert ausgeliefert. Neu ist nur eine erzeugte Liste in einer Datei, die das Werkzeug ohnehin erzeugt (lokal `tests/serve.cjs`, auf Pages `tools/build-pages.cjs`).
- Beim Installieren lädt der Worker die ganze Liste (`cache.addAll`, mit `cache: 'no-cache'`, also mit Nachfrage beim Server, damit alles zur selben Fassung gehört). Scheitert eine Datei, scheitert die Installation und wird beim nächsten Besuch wiederholt; der alte Stand bleibt so lange gültig.
- Beim Start entscheidet er je Seite: Hat der Browser die Dateien vor weniger als 9 Minuten selbst geholt (Zeitstempel beim Installieren und bei jedem solchen Start; Pages liefert `max-age=600`), lässt er alle Anfragen der Seite zum Browser-Speicher durch. Der ist schneller als jede Antwort aus dem Worker-Speicher (gemessen: jede Antwort aus dem Worker kostet am gedrosselten Handy einige Millisekunden, bei über 200 Anfragen je Start zusammen rund 0,2 s). Sonst, und immer ohne Netz, antwortet er für alle Dateien der Liste aus seinem Speicher, ohne aufs Netz zu warten (nach Ablauf der 10 Minuten spart das die über 100 Nachfragen „noch aktuell?“). Was nicht in der Liste steht, kommt aus dem Netz (Rückfall: Laufzeit-Speicher). Schriften von Google Fonts lädt er beim Installieren mit, Fehler dabei sind egal.
- Erwogen und verworfen: immer aus dem Worker-Speicher (Wiederbesuch 0,2 s langsamer als ohne Worker), Chromes feste Wege (Static Routing, `addRoutes`) mit Quelle Speicher (ebenso langsam, die Zeit steckt in der Auslieferung aus dem Speicher, nicht im Skript), Wettlauf Netz/Worker (nicht schneller).
- Jede Änderung an einer Datei ändert die Prüfsumme und damit `sw.js`; der Browser installiert dann die neue Fassung im Hintergrund (`skipWaiting`, `clients.claim`), alte Speicher werden gelöscht.
- Loopwerk selbst bekommt keinen Service Worker (Kataloge mit über 100 MB Klängen gehören nicht in einen Vorab-Speicher).

## Folgen
- Nach dem ersten Besuch startet Krachwerk ohne Netz und kann aufnehmen, mastern, zerlegen und MP3 exportieren.
- Der Wiederbesuch ist so schnell wie aus dem Browser-Speicher (gemessen mit `tools/perf/m6-sw.cjs`).
- Eine neue Fassung kommt beim Start aus dem Worker-Speicher einen Start später an: Der Besuch, bei dem sie erscheint, läuft noch mit der alten, der nächste mit der neuen. Dafür passen Seite und Module zueinander. Beim Durchlassen zum Browser-Speicher (innerhalb der 9 Minuten) gilt dasselbe wie für Loopwerk ohne Worker.
- Wie bisher kann ein offener Tab nach einer Installation ein erst später geladenes Modul (z. B. Zerlegen) schon in der neuen Fassung bekommen. Das war mit „Netz zuerst“ genauso.
- Der erste Besuch lädt etwa 2 MB zusätzlich (alle Module, auch die von Loopwerk), aber erst nach dem Start und meist als „unverändert“ aus dem Browser-Speicher.
- Neue Dateiarten, die Krachwerk ohne Netz braucht, müssen in `precacheList()` (`tools/werkstatt-page.cjs`) aufgenommen werden. Geprüft in `tests/perf-audio.test.cjs` (Start und Aufnahme ohne Netz nach einem Besuch).
