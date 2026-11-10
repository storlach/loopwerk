#!/usr/bin/env bash
# Findet den Commit, seit dem ein Test rot ist: git bisect in einem eigenen Worktree, der Arbeitsbaum bleibt unberührt.
# Aufruf: tools/bisect-test.sh <guter-commit> <testname> [<schlechter-commit>]
# Beispiel: tools/bisect-test.sh 6abd2ff v20        (schlecht = HEAD)
set -u

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ] || [ $# -lt 2 ]; then
  cat <<'EOF'
Findet den ersten Commit, mit dem ein Test durchfällt.

  tools/bisect-test.sh <guter-commit> <testname> [<schlechter-commit>]

  <guter-commit>      Stand, an dem der Test noch bestand
  <testname>          Name wie in tests/chain.txt (ohne .test.cjs)
  <schlechter-commit> Voreinstellung HEAD

Läuft in einem Wegwerf-Worktree (der eigene Arbeitsbaum und Branch bleiben unberührt) und folgt bei Merges nur
der Hauptlinie nicht – git bisect prüft auch die Commits der eingefügten Branches. Ein Stand, an dem es die
Testdatei noch nicht gibt, wird übersprungen. Exit 0: Commit gefunden (wird ausgegeben), 1: Fehler.
EOF
  [ $# -lt 2 ] && [ "${1:-}" != "--help" ] && [ "${1:-}" != "-h" ] && exit 1
  exit 0
fi

good=$1; name=$2; bad=${3:-HEAD}
top=$(git rev-parse --show-toplevel) || exit 1
git -C "$top" rev-parse --verify -q "$good^{commit}" >/dev/null || { echo "Fehler: Commit $good gibt es nicht" >&2; exit 1; }
badsha=$(git -C "$top" rev-parse --verify -q "$bad^{commit}") || { echo "Fehler: Commit $bad gibt es nicht" >&2; exit 1; }

wt=$(mktemp -d "${TMPDIR:-/tmp}/bisect-XXXXXX")
trap 'git -C "$top" worktree remove -f -f "$wt" >/dev/null 2>&1; rm -rf "$wt"' EXIT
git -C "$top" worktree add -f --detach "$wt" "$badsha" >/dev/null 2>&1 || { echo "Fehler: Worktree nicht angelegt" >&2; exit 1; }
[ -d "$top/node_modules" ] && ln -sfn "$top/node_modules" "$wt/node_modules"

cd "$wt" || exit 1
git bisect start "$badsha" "$good" >/dev/null || exit 1
# 125 = überspringen (Testdatei fehlt an diesem Stand)
git bisect run sh -c "[ -f tests/$name.test.cjs ] || exit 125; ln -sfn '$top/node_modules' node_modules 2>/dev/null; timeout 600 node tests/$name.test.cjs >/dev/null 2>&1" | grep -E "is the first bad commit|^commit |^    |bisect found|skipped" | head -20
first=$(git bisect log | awk '/first bad commit/{print $NF}' | tr -d '[]' | tail -1)
git bisect log | grep -q "first bad commit" && { echo; git -C "$top" log -1 --format='Erster roter Commit: %h %s (%ad)' --date=short "$(git rev-parse refs/bisect/bad)"; git -C "$top" show --stat --format= "$(git rev-parse refs/bisect/bad)" | tail -12; git bisect reset >/dev/null 2>&1; exit 0; }
git bisect reset >/dev/null 2>&1
echo "Kein eindeutiger Commit gefunden." >&2
exit 1
