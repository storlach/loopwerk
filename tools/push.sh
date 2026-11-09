#!/usr/bin/env bash
# Pusht den aktuellen Branch nach origin; bei Netzfehlern bis zu viermal wiederholen (2, 4, 8, 16 s Pause, je Versuch max. 120 s).
# Aufruf: tools/push.sh [--remote name]      (Voreinstellung origin)
# Beispiel: tools/push.sh
# Exit: 0 gepusht · 1 Fehler (Meldung nennt, ob Commits ungepusht sind) · 64 Bedienfehler
set -u

remote=origin
case "${1:-}" in
  --help|-h)
    sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
  --remote) [ -n "${2:-}" ] || { echo "Fehler: --remote braucht einen Namen" >&2; exit 64; }; remote="$2" ;;
  "") ;;
  *) echo "Fehler: unbekanntes Argument $1 (siehe --help)" >&2; exit 64 ;;
esac

branch=$(git branch --show-current)
[ -n "$branch" ] || { echo "Fehler: kein Branch ausgecheckt (losgelöster HEAD)" >&2; exit 64; }

unpushed() {
  git fetch -q "$remote" "$branch" 2>/dev/null || true
  if git rev-parse --verify -q "refs/remotes/$remote/$branch" >/dev/null; then
    git rev-list --count "refs/remotes/$remote/$branch..HEAD"
  else
    echo "?"
  fi
}

delays=(2 4 8 16)
attempt=0
while :; do
  attempt=$((attempt + 1))
  echo "== Push $attempt/5: $remote $branch"
  out=$(timeout 120 git push -u "$remote" "$branch" 2>&1); rc=$?
  printf '%s\n' "$out"
  if [ $rc -eq 0 ]; then echo "== Gepusht."; exit 0; fi

  # Nur Netzfehler (und Zeitüberschreitung) wiederholen; Ablehnungen, Rechte usw. nicht
  if [ $rc -ne 124 ] && printf '%s' "$out" | grep -qE 'returned error: 4[0-9][0-9]'; then
    net=0   # HTTP-4xx (Rechte, Anmeldung): Wiederholen hilft nicht
  else
    net=1
  fi
  if [ $net -eq 1 ] && { [ $rc -eq 124 ] || printf '%s' "$out" | grep -qiE 'Could not resolve host|Connection (timed out|reset|refused)|Failed to connect|unable to access|early EOF|RPC failed|remote end hung up|Operation timed out|Network is unreachable|TLS|SSL|HTTP/2 stream|GnuTLS|the remote end hung up|Broken pipe|503|502|504'; }; then
    if [ $attempt -le ${#delays[@]} ]; then
      d=${delays[$((attempt - 1))]}
      echo "== Netzfehler, nächster Versuch in ${d} s"
      sleep "$d"
      continue
    fi
    echo "== Netzfehler, alle Versuche verbraucht." >&2
  else
    echo "== Kein Netzfehler, keine Wiederholung." >&2
  fi
  n=$(unpushed)
  if [ "$n" = "?" ]; then echo "== Ungepusht: unbekannt (Branch $branch ist auf $remote nicht erreichbar/vorhanden)." >&2
  elif [ "$n" = "0" ]; then echo "== Ungepusht: 0 Commits (der Stand ist auf $remote)." >&2
  else echo "== Ungepusht: $n Commit(s) auf $branch fehlen noch auf $remote." >&2; fi
  exit 1
done
