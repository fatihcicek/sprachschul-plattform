#!/usr/bin/env bash
# closing-discipline: Reste in den gegenüber origin/main geänderten Dateien suchen.
# Rückgabewert 0 = nichts gefunden, 1 = Treffer. Ändert nichts.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Kein Git-Repository: bitte im Projektordner ausführen." >&2; exit 2; }
cd "$ROOT" || exit 2
BASE="${BASE:-origin/main}"

MB="$(git merge-base "$BASE" HEAD 2>/dev/null)" || { echo "Kein Vergleichsstand ($BASE) gefunden."; exit 2; }
# Committed + gestaged + ungestaged + neue Dateien, ohne gelöschte.
FILES="$( { git -c core.quotepath=off diff --name-only --diff-filter=ACMR "$MB"; git -c core.quotepath=off ls-files --others --exclude-standard; } | sort -u \
  | grep -E '\.(ts|tsx|js|mjs|sh|yml|yaml|md|sql)$' | grep -vE '^(drizzle/meta/|package-lock\.json)' )"
if [ -z "$FILES" ]; then echo "Keine geänderten Dateien gegenüber $BASE."; exit 0; fi

HITS=0
report() { # $1 Titel, $2 Muster, $3 Dateifilter (Regex auf Pfad, optional)
  local OUT=""
  while IFS= read -r F; do
    [ -f "$F" ] || continue
    [ -n "${3:-}" ] && ! printf '%s' "$F" | grep -qE "$3" && continue
    case "$F" in .claude/skills/closing-discipline/*) continue;; esac  # dieser Skill nennt die Muster selbst
    R="$(grep -nE "$2" "$F" 2>/dev/null | sed "s#^#  $F:#" | cut -c1-200)"
    [ -n "$R" ] && OUT="${OUT}${R}"$'\n'
  done <<< "$FILES"
  if [ -n "$OUT" ]; then
    echo "$1"; printf '%s' "$OUT"; HITS=$((HITS + $(printf '%s' "$OUT" | grep -c .)))
  fi
}

report "TODO / FIXME / XXX / HACK:"            '\b(TODO|FIXME|XXX|HACK)\b'
report "Vergessene .only / .skip in Tests:"     '(\.(only|skip)\(|\b(fit|fdescribe)\()' '^tests/|\.test\.'
report "console.log in src/:"                   'console\.log\(' '^src/'
report "debugger:"                              '\bdebugger\b' '\.(ts|tsx|js|mjs)$'

echo "Geprüft: $(printf '%s\n' "$FILES" | grep -c .) Datei(en) gegenüber $BASE."
if [ "$HITS" -eq 0 ]; then echo "Sauber: keine Reste gefunden."; exit 0; fi
echo "Treffer insgesamt: $HITS (beheben oder im Abschlussbericht begründen)."
exit 1
