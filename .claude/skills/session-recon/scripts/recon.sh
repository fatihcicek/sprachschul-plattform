#!/usr/bin/env bash
# session-recon: Ausgangslage erfassen. Schreibt nur den Bericht nach reports/.
# Aufruf: bash .claude/skills/session-recon/scripts/recon.sh [--ohne-tests]
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2
BASE="origin/main"
RUN_TESTS=1
[ "${1:-}" = "--ohne-tests" ] && RUN_TESTS=0

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="reports/session-recon"
OUT="$OUT_DIR/$STAMP.md"
mkdir -p "$OUT_DIR"
FAIL=0
REPORT=""
emit() { REPORT="${REPORT}$1"$'\n'; }

git fetch origin --prune >/dev/null 2>&1 || emit "_Hinweis: git fetch ist fehlgeschlagen, Zweig-Stände können veraltet sein._"

emit "# Session-Recon $STAMP"
emit ""

# --- Stand ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
read -r BEHIND AHEAD < <(git rev-list --left-right --count "$BASE...HEAD" 2>/dev/null || echo "? ?")
emit "## Stand"
emit ""
emit "- Zweig: \`$BRANCH\`"
emit "- Commit: \`$(git rev-parse HEAD)\`"
emit "- Gegenüber \`$BASE\`: $AHEAD voraus, $BEHIND zurück"
emit ""

# --- Arbeitsordner ---
STATUS="$(git status --short)"
emit "## Arbeitsordner"
emit ""
if [ -z "$STATUS" ]; then
  emit "Sauber."
else
  emit '```'; emit "$STATUS"; emit '```'
  emit "**NICHT SAUBER**: nicht eingecheckte Änderungen."
  FAIL=1
fi
emit ""

# --- letzte Commits ---
emit "## Letzte 10 Commits"
emit ""; emit '```'; emit "$(git log -10 --format='%h %ci %s')"; emit '```'; emit ""

# --- offene Zweige ---
emit "## Offene Zweige (noch nicht in \`main\`)"
emit ""
ROWS=""
while IFS= read -r REF; do
  [ -z "$REF" ] && continue
  N="$(git rev-list --count "$BASE..$REF" 2>/dev/null || echo 0)"
  [ "$N" = "0" ] && continue
  B="$(git rev-list --count "$REF..$BASE" 2>/dev/null || echo "?")"
  D="$(git log -1 --format='%cs' "$REF")"
  S="$(git log -1 --format='%s' "$REF" | sed 's/|/\\|/g')"
  ROWS="${ROWS}| \`${REF#origin/}\` | $N voraus, $B zurück | $D | $S |"$'\n'
done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin/feature refs/remotes/origin/fix refs/remotes/origin/setup)
if [ -z "$ROWS" ]; then
  emit "Keine."
else
  emit "| Zweig | Abstand zu main | Letzte Änderung | Letzter Commit |"
  emit "|---|---|---|---|"
  emit "${ROWS%$'\n'}"
fi
emit ""

# --- Migrationen ---
emit "## Migrationen"
emit ""
if [ -f drizzle/meta/_journal.json ]; then
  LAST="$(node -e 'const j=require("./drizzle/meta/_journal.json").entries;const l=j[j.length-1];console.log(l.idx+" "+l.tag)')"
  NEXT="$(node -e 'const j=require("./drizzle/meta/_journal.json").entries;console.log(String(j[j.length-1].idx+1).padStart(4,"0"))')"
  emit "- Letzte: \`$LAST\`"
  emit "- Nächste freie Nummer: \`$NEXT\` (offene Zweige mit neuen Dateien in \`drizzle/\` vorher prüfen, siehe cross-branch-recon)"
else
  emit "_drizzle/meta/_journal.json nicht gefunden._"
fi
emit ""

# --- Prüfungen ---
emit "## Typprüfung und Tests"
emit ""
if [ "$RUN_TESTS" = "0" ]; then
  emit "Übersprungen (\`--ohne-tests\`)."
else
  LOG="$(mktemp)"
  npx tsc --noEmit >"$LOG" 2>&1; TSC=$?
  emit "\`npx tsc --noEmit\`: Rückgabewert $TSC"
  [ "$TSC" -ne 0 ] && { emit '```'; emit "$(tail -5 "$LOG")"; emit '```'; FAIL=1; }
  npx vitest run >"$LOG" 2>&1; VT=$?
  emit ""
  emit "\`npx vitest run\`: Rückgabewert $VT. Ergebniszeilen wörtlich:"
  emit '```'; emit "$(sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -E '^\s*(Test Files|Tests|Errors)' || tail -3 "$LOG")"; emit '```'
  [ "$VT" -ne 0 ] && FAIL=1
  rm -f "$LOG"
fi
emit ""
emit "---"
if [ "$FAIL" -eq 0 ]; then emit "**Ergebnis: in Ordnung (Rückgabewert 0)**"; else emit "**Ergebnis: Befunde, siehe oben (Rückgabewert 1)**"; fi

printf '%s' "$REPORT" > "$OUT"
echo "Bericht: $OUT"
echo "$REPORT" | grep -E '^\*\*Ergebnis|NICHT SAUBER|Rückgabewert [1-9]' || true
exit "$FAIL"
