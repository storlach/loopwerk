---
name: artifact-sync
description: Loopwerk ohne GitHub sichern und fortsetzen – den Projektstand als Artifact veröffentlichen (App + kompletter Quellcode) und in einer neuen Session aus dem Artifact wiederherstellen. Verwenden am Ende jeder Arbeitssitzung und wenn eine neue Session mit „Hol Loopwerk aus dem Artifact“ beginnt.
---

# Artifact-Sync

Solange es kein GitHub-Repo gibt, ist das Artifact der einzige dauerhafte Speicher. Die Arbeitsumgebung wird nach Inaktivität gelöscht.

**Artifact:** https://claude.ai/artifact/LAPXHQXC5sb54jFkNbJcpP

## Sichern (Ende jeder Sitzung)
1. `npm test` grün.
2. Git-Commit (lokal).
3. Veröffentlichen mit dem Artifact-Tool: `file_path` = `index.html`, `url` = Artifact-Link oben (in derselben Session reicht derselbe `file_path`). In `files` **alle** Projektdateien außer `index.html` mitgeben – auch `.claude/**`, `docs/**`, `tests/**`, `package.json`, `CLAUDE.md`. Liste erzeugen mit `git ls-files`. Content-Types: `.md` → `text/markdown`, `.cjs`/`.mjs` → `text/javascript`, `.json` → `application/json`.
4. Gelöschte Dateien im Update mit `null` entfernen.
5. In der Rückmeldung den Link nennen.

## Wiederherstellen (neue Session)
1. Artifact lesen (`action: "read"`, `url` oben) – das liefert `index.html`.
2. Dateiliste holen (`action: "list"`, `scope: "files"`, `url` oben).
3. Alle Dateien mit `action: "read"` und `paths` holen und an ihren Pfaden unter `/home/user/loopwerk/` ablegen.
4. `git init`, Commit „Wiederhergestellt aus Artifact“.
5. `npm test` laufen lassen, Ergebnis melden.
6. Hinweis: Agenten und Skills aus `.claude/` werden erst in einer Session aktiv, die im Ordner `loopwerk` startet – bis dahin ihre Dateien direkt lesen und befolgen.

## Wechsel zu GitHub
Sobald ein Repo existiert: Remote setzen, pushen, dieses Skill auf „GitHub ist führend, Artifact nur noch Vorschau“ umschreiben.
