# Messskripte Performance

Aus der Bestandsanalyse `docs/analyse/2026-11-performance.md`. Jede Verbesserung wird mit demselben Skript vorher und nachher gemessen.

- `lib.cjs` – Server wie GitHub Pages (gzip, Cache-Kopfzeilen), Browser mit CPU- und Netz-Drossel. `LW_ROOT` wählt einen anderen Stand (z. B. einen Worktree).
- `m1-load.cjs`, `m1b-firsttone.cjs`, `m2-startprofile.cjs` – Laden und Start
- `m3-interact.cjs`, `m3b-playtrace.cjs`, `m3c-arranger-scale.cjs`, `m3d-idle.cjs`, `m3e-play-css.cjs` – Bedienung, Arranger-Skalierung, Stillstand, Licht
- `m4-audio.cjs` – Scheduler, Audio-Last, Export
- `m5-memory.cjs`, `m8b-render-mem.cjs` – Speicher
- `m6-sw.cjs`, `m6b-offline.cjs` – Service Worker, ohne Netz (brauchen ein Zertifikat: `cert.pem`/`key.pem` im Arbeitsordner, selbst erzeugen)
- `m7-tests.cjs` – Dauer der Testkette
- `kennzahlen.cjs` – die wichtigsten Kennzahlen in einem Lauf als Tabelle vorher/nachher (Stillstand, Abspielen mit 448 Clips, Zoom-Schritt, Clip-Knoten, Leinwand-Speicher); `--vorher <ordner>` z. B. aus `git archive`
- `scen.cjs` – Szenen (Beispiel, großer Song mit 448 Clips)

Headless hat keine Grafikkarte: Bildraten sind Vergleichswerte.
- `m9-scheduler.cjs` (mit `sched-probe.cjs`) – Scheduler: Reaktion auf Live-Änderungen und Folgen einer Blockade des Hauptthreads (Stille, falsche Stelle), Rampe als Sound
- `render-null.cjs` – Nulltest: Beispiel offline rendern (`--out`, `--szene`), zwei Stände vergleichen (`--compare`; derselbe Stand zweimal liegt bei rund −112 dB)
