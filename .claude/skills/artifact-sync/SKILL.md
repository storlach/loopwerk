---
name: artifact-sync
description: Loopwerk sichern und veröffentlichen – GitHub (storlach/loopwerk) ist der führende Speicher, das Artifact die spielbare Vorschau in claude.ai. Verwenden am Ende jeder Arbeitssitzung und wenn eine neue Session ohne Repo-Klon beginnt („Hol Loopwerk aus dem Artifact“).
---

# Sichern und veröffentlichen

**GitHub (führend):** https://github.com/storlach/loopwerk, Branch `main`
**Artifact (Vorschau in claude.ai):** https://claude.ai/artifact/LAPXHQXC5sb54jFkNbJcpP

## Ende jeder Sitzung
1. `npm test` grün.
2. Commit, dann `git push -u origin main`. Vorher `git fetch origin main` und bei Bedarf rebasen.
3. Artifact aktualisieren: `file_path` = `index.html`, `url` = Artifact-Link, `root` = Projektordner. In `files` die seit der letzten Veröffentlichung geänderten Dateien mitgeben, z. B. über `git diff --name-only <letzter-Stand> HEAD`. Content-Types: `.md` → `text/markdown`, `.cjs`/`.mjs` → `text/javascript`, `.json` → `application/json`. Gelöschte Dateien mit `null` entfernen. `capabilities` weglassen, dann bleiben `downloads` und `sample` erhalten.
4. In der Rückmeldung beide Links nennen.

## Neue Session
- Mit Repo: Die Session klont `storlach/loopwerk`, es ist nichts weiter zu tun.
- Ohne Repo: `add_repo` für `storlach/loopwerk` aufrufen und klonen. Klappt das nicht, aus dem Artifact wiederherstellen:
  1. Dateiliste mit `action: "list"`, `scope: "files"` und der `url` holen.
  2. Dateien mit `action: "read"` und `paths` holen und unter `loopwerk/` ablegen.
  3. Mit `git init` neu anfangen und zu GitHub pushen, sobald das wieder geht.
