#!/usr/bin/env bash
# Fügt einen Agent-Branch ein: Merge, ROADMAP-Konflikt beidseitig auflösen, optional Tests, dann Worktree und Branch weg.
# Aufruf: tools/merge-agent.sh <branch> [--tests a,b,c] [--keep]
# Beispiel: tools/merge-agent.sh worktree-agent-ab12 --tests stufe2,wav-bits
# Exit: 0 gut · 1 Tests rot / Fehler · 2 Konflikt in anderen Dateien (Merge bleibt offen) · 64 Bedienfehler
set -u

usage() {
  cat <<'EOF'
Aufruf: tools/merge-agent.sh <branch> [--tests a,b,c] [--keep]

  <branch>        Branch des Agenten (der Merge geht in den aktuell ausgecheckten Branch)
  --tests a,b,c   nach dem Merge tools/test.cjs --only a,b,c ausführen
  --keep          Worktree und Branch stehen lassen
  --help          diese Hilfe

Ablauf: Arbeitsbaum muss sauber sein; git merge --no-ff --no-edit. Konflikt nur in docs/ROADMAP.md:
beide Seiten behalten (unsere zuerst), deutliche Meldung, Abschluss mit "Merge <branch>".
Konflikt in anderen Dateien: Dateien nennen, Exit 2, Merge bleibt offen.
EOF
}

branch=""; tests=""; keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --tests) [ $# -ge 2 ] || { echo "Fehler: --tests braucht einen Wert" >&2; exit 64; }; tests="$2"; shift 2 ;;
    --keep) keep=1; shift ;;
    -*) echo "Fehler: unbekannte Option $1" >&2; usage >&2; exit 64 ;;
    *) [ -z "$branch" ] || { echo "Fehler: nur ein Branch erlaubt" >&2; exit 64; }; branch="$1"; shift ;;
  esac
done
[ -n "$branch" ] || { usage >&2; exit 64; }

top=$(git rev-parse --show-toplevel) || exit 1
cd "$top" || exit 1
git rev-parse --verify -q "refs/heads/$branch" >/dev/null || { echo "Fehler: Branch $branch gibt es nicht" >&2; exit 64; }
cur=$(git branch --show-current)
[ "$cur" != "$branch" ] || { echo "Fehler: $branch ist der aktuelle Branch" >&2; exit 64; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Fehler: Arbeitsbaum ist nicht sauber:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

# Worktree des Branches suchen (vor dem Merge, falls er danach nicht mehr eindeutig wäre)
wt=$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '/^worktree /{p=substr($0,10)} $1=="branch" && $2==b {print p}')
if [ "$wt" = "$top" ]; then echo "Fehler: Worktree von $branch ist dieser hier" >&2; exit 64; fi

echo "== Merge $branch in $cur"
if git merge --no-ff --no-edit "$branch"; then
  echo "== Merge ohne Konflikt"
else
  conflicts=$(git diff --name-only --diff-filter=U)
  others=$(printf '%s\n' "$conflicts" | grep -v '^docs/ROADMAP.md$' || true)
  if [ -n "$others" ]; then
    echo "" >&2
    echo "KONFLIKT in Dateien, die ich nicht errate:" >&2
    printf '  %s\n' $others >&2
    [ -z "$(printf '%s\n' "$conflicts" | grep '^docs/ROADMAP.md$')" ] || echo "  (docs/ROADMAP.md ist auch betroffen, bleibt ebenfalls offen)" >&2
    echo "Der Merge bleibt offen. Lösen, dann: git add <Dateien> && git commit; danach Worktree/Branch selbst entfernen." >&2
    exit 2
  fi
  # nur ROADMAP: Markierungen entfernen, beide Seiten behalten (unsere zuerst)
  awk '/^<<<<<<< /{next} /^=======$/{next} /^>>>>>>> /{next} {print}' docs/ROADMAP.md > docs/ROADMAP.md.neu && mv docs/ROADMAP.md.neu docs/ROADMAP.md
  if grep -qE '^(<<<<<<<|>>>>>>>) ' docs/ROADMAP.md; then echo "Fehler: Markierungen in ROADMAP.md übrig" >&2; exit 2; fi
  git add docs/ROADMAP.md
  git commit -q -m "Merge $branch" || { echo "Fehler: Commit fehlgeschlagen" >&2; exit 1; }
  echo ""
  echo "!!! ACHTUNG: Konflikt in docs/ROADMAP.md, beide Seiten behalten (unsere zuerst)."
  echo "!!! Bitte die Stelle ansehen: git show HEAD -- docs/ROADMAP.md"
fi

if [ -n "$tests" ]; then
  echo "== Tests: $tests"
  if ! node tools/test.cjs --only "$tests"; then
    echo "Tests rot. Worktree und Branch bleiben stehen." >&2
    exit 1
  fi
fi

if [ "$keep" = 1 ]; then
  echo "== --keep: Worktree und Branch bleiben ($branch${wt:+, $wt})"
  exit 0
fi
if [ -n "$wt" ]; then
  git worktree remove -f -f "$wt" && echo "== Worktree entfernt: $wt" || { echo "Fehler: Worktree nicht entfernt: $wt" >&2; exit 1; }
fi
git branch -d "$branch" && echo "== Branch gelöscht: $branch" || { echo "Fehler: Branch nicht gelöscht" >&2; exit 1; }
exit 0
