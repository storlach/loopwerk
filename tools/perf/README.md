# Messskripte Performance

Aus der Bestandsanalyse `docs/analyse/2026-11-performance.md`. Jede Verbesserung wird mit demselben Skript vorher und nachher gemessen.

- `lib.cjs` – Server wie GitHub Pages (gzip, Cache-Kopfzeilen), Browser mit CPU- und Netz-Drossel. `LW_ROOT` wählt einen anderen Stand (z. B. einen Worktree).
- `m1-load.cjs`, `m1b-firsttone.cjs`, `m2-startprofile.cjs` – Laden und Start
- `m3-interact.cjs`, `m3b-playtrace.cjs`, `m3c-arranger-scale.cjs`, `m3d-idle.cjs`, `m3e-play-css.cjs` – Bedienung, Arranger-Skalierung, Stillstand, Licht
- `m4-audio.cjs` – Scheduler, Audio-Last, Export (`export`: dazu „gleich wie Hauptthread“ und Prüfsummen eines festen Testsignals für den Bitgleich-Vergleich vorher/nachher)
- `m5-memory.cjs`, `m8b-render-mem.cjs` – Speicher (`m5-memory.cjs stoebern`: alle Sounds nacheinander vorhören, Klangspeicher danach, Song vollständig?)
- `m6-sw.cjs [Teile A–D] [--netz 4g] [--runs N]`, `m6b-offline.cjs` – Service Worker, ohne Netz (Teil D braucht ein Zertifikat: `cert.pem`/`key.pem` in `tools/perf/`, z. B. `openssl req -x509 -newkey rsa:2048 -nodes -keyout tools/perf/key.pem -out tools/perf/cert.pem -days 30 -subj /CN=127.0.0.1`)
- `m7-tests.cjs` – Dauer der Testkette
- `kennzahlen.cjs` – die wichtigsten Kennzahlen in einem Lauf als Tabelle vorher/nachher (Stillstand, Abspielen mit 448 Clips, Zoom-Schritt, Clip-Knoten, Leinwand-Speicher); `--vorher <ordner>` z. B. aus `git archive`
- `bewegung.cjs [--root <ordner>] [--out <ordner>] [--film] [--nur a,b] [--szene still|spielen|beide]` – Übergänge der schwebenden Flächen (Layout „reiter“, 1440×900, 448 Clips, auch beim Abspielen) Bild für Bild: Dauer, größter Sprung (px, Deckkraft), Anfangsruck, Überschwingen, Umkehr, lange Bilder, Breite fest, Rollbalken frei, Endzustand; `--film` legt je Übergang 8 Einzelbilder bei 1/10 Tempo und eine Übersicht ab (`film-<name>.png`)
- `scen.cjs` – Szenen (Beispiel, großer Song mit 448 Clips)

Headless hat keine Grafikkarte: Bildraten sind Vergleichswerte.
- `m9-scheduler.cjs` (mit `sched-probe.cjs`) – Scheduler: Reaktion auf Live-Änderungen und Folgen einer Blockade des Hauptthreads (Stille, falsche Stelle), Rampe als Sound
- `render-null.cjs` – Nulltest: Beispiel offline rendern (`--out`, `--szene`), zwei Stände vergleichen (`--compare`; derselbe Stand zweimal liegt bei rund −112 dB)
- `m11-mastering.cjs [start,unnoetig,spielen]` – Mastering-Messung im Hintergrund: Start und erster Ton, unnötige Messläufe (Umbenennen, Loop, Rückgängig), Takt und lange Aufgaben während der Messung
- `m8c-worklet-mem.cjs` – Ursache von 5.8: Speicher je Offline-Rendern ohne Worklet, nur mit `addModule`, mit Worklet-Knoten
