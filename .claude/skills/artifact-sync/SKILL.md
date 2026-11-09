---
name: artifact-sync
description: Loopwerk sichern und veröffentlichen – GitHub (storlach/loopwerk) ist der führende Speicher, das Artifact die spielbare Vorschau in claude.ai. Verwenden am Ende jeder Arbeitssitzung und wenn eine neue Session ohne Repo-Klon beginnt („Hol Loopwerk aus dem Artifact“).
---

# Sichern und veröffentlichen

**GitHub (führend):** https://github.com/storlach/loopwerk, Branch `main`
**Artifact (Vorschau in claude.ai, mit Claude-Ideen):** https://claude.ai/artifact/LAPXHQXC5sb54jFkNbJcpP
**GitHub Pages (eigene Adresse, mit Mikrofon):** https://storlach.github.io/loopwerk/ – baut sich bei jedem Push auf `main` selbst (`.github/workflows/pages.yml`, `tools/build-pages.cjs`). Status prüfen: `gh run list --limit 3`.

## Ende jeder Sitzung
1. `npm test` ohne Rot, `npm run regeln` ohne neue Verstöße.
2. Commit, dann `tools/push.sh` (wiederholt bei Netzfehlern). Vorher `git fetch origin main` und bei Bedarf rebasen.
3. Artifact aktualisieren: `file_path` = `index.html`, `url` = Artifact-Link, `root` = Projektordner. In `files` die seit der letzten Veröffentlichung geänderten Dateien mitgeben: `node tools/vorschau.cjs` gibt genau dieses Objekt aus (gelöschte als `null`). Verweigert das Artifact das Überschreiben ungelesener Dateien: mit `action: "read"` und `out_dir` holen, dann `node tools/vorschau.cjs --verify <out_dir>` (jede Datei muss aus der Git-Historie stammen), danach veröffentlichen. Nach dem Veröffentlichen `node tools/vorschau.cjs --mark <Versionsnummer>` und die Stand-Datei einchecken. Content-Types: `.md` → `text/markdown`, `.cjs`/`.mjs` → `text/javascript`, `.json` → `application/json`. Gelöschte Dateien mit `null` entfernen. `capabilities` weglassen, dann bleiben `downloads` und `sample` erhalten.
4. Mit `gh run list --limit 1` prüfen, ob der Pages-Workflow nach dem Push grün ist.
5. In der Rückmeldung alle drei Links nennen.

## Neue Session
- Mit Repo: Die Session klont `storlach/loopwerk`, es ist nichts weiter zu tun.
- Ohne Repo: `add_repo` für `storlach/loopwerk` aufrufen und klonen. Klappt das nicht, aus dem Artifact wiederherstellen:
  1. Dateiliste mit `action: "list"`, `scope: "files"` und der `url` holen.
  2. Dateien mit `action: "read"` und `paths` holen und unter `loopwerk/` ablegen.
  3. Mit `git init` neu anfangen und zu GitHub pushen, sobald das wieder geht.
