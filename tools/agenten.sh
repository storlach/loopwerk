#!/usr/bin/env bash
# Stand aller Agent-Worktrees: Branch, Commits vor main, ungesicherte Dateien, letzte Änderung.
# Aufruf: tools/agenten.sh [--dateien]
# Beispiel: tools/agenten.sh --dateien   (zeigt zusätzlich die geänderten Dateien je Worktree)
set -u

case "${1:-}" in
  --help|-h)
    cat <<'EOF'
Stand aller Agent-Worktrees (.claude/worktrees/…).

  tools/agenten.sh             je Worktree: Branch, Commits vor dem aktuellen Branch, ungesicherte Dateien, Alter der letzten Änderung
  tools/agenten.sh --dateien   zusätzlich die geänderten und neuen Dateien

Zeigt auch Agent-Branches ohne Worktree (liegen geblieben). Ändert nichts.
EOF
    exit 0 ;;
esac
files=0; [ "${1:-}" = "--dateien" ] && files=1

top=$(git rev-parse --show-toplevel) || exit 1
cd "$top" || exit 1
base=$(git branch --show-current)
n=0
while read -r wt; do
  [ "$wt" = "$top" ] && continue
  n=$((n + 1))
  br=$(git -C "$wt" branch --show-current 2>/dev/null)
  ahead=$(git rev-list --count "$base..$br" 2>/dev/null || echo '?')
  behind=$(git rev-list --count "$br..$base" 2>/dev/null || echo '?')
  dirty=$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  # jüngste Änderung: Commit oder Datei im Arbeitsbaum
  last=$(git -C "$wt" log -1 --format=%ct 2>/dev/null || echo 0)
  newest=$(git -C "$wt" status --porcelain 2>/dev/null | awk '{print $NF}' | while read -r f; do stat -c %Y "$wt/$f" 2>/dev/null; done | sort -n | tail -1)
  [ -n "${newest:-}" ] && [ "$newest" -gt "$last" ] && last=$newest
  age=$(( ($(date +%s) - last) / 60 ))
  echo "$(basename "$wt")  Branch $br · $ahead Commit(s) vor $base, $behind dahinter · $dirty ungesicherte Datei(en) · letzte Änderung vor $age min"
  if [ "$files" = 1 ]; then
    git -C "$wt" log --format='    Commit %h %s' "$base..$br" 2>/dev/null
    git -C "$wt" status --short 2>/dev/null | sed 's/^/    /'
  fi
done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
[ "$n" = 0 ] && echo "Keine Agent-Worktrees."

# Agent-Branches ohne Worktree
used=$(git worktree list --porcelain | awk '$1=="branch"{sub("refs/heads/","",$2); print $2}')
for br in $(git branch --format='%(refname:short)' --list 'worktree-agent-*'); do
  echo "$used" | grep -qx "$br" || echo "Branch ohne Worktree: $br ($(git rev-list --count "$base..$br") Commit(s) vor $base)"
done
exit 0
