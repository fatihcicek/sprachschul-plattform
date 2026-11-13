#!/usr/bin/env bash
# cross-branch-recon: Überschneidungen zwischen offenen Zweigen. Schreibt nur nach reports/.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2
BASE="origin/main"
git fetch origin --prune >/dev/null 2>&1 || true

BRANCHES=()
if [ "$#" -ge 1 ]; then
  BRANCHES=("$@")
else
  while IFS= read -r REF; do
    [ -z "$REF" ] && continue
    [ "$(git rev-list --count "$BASE..$REF")" = "0" ] && continue
    BRANCHES+=("${REF#origin/}")
  done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin/feature refs/remotes/origin/fix refs/remotes/origin/setup)
fi
if [ "${#BRANCHES[@]}" -eq 0 ]; then echo "Keine offenen Zweige gefunden."; exit 0; fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="reports/cross-branch-recon/$STAMP.md"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
: > "$TMP/all"
REPORT=""
emit() { REPORT="${REPORT}$1"$'\n'; }

emit "# Cross-Branch-Recon $STAMP"
emit ""
emit "Basis: \`$BASE\`, ${#BRANCHES[@]} Zweig(e)"
emit ""
emit "## Zweige"
emit ""
for BR in "${BRANCHES[@]}"; do
  REF=""
  for C in "refs/remotes/origin/$BR" "refs/heads/$BR"; do
    git rev-parse --verify -q "$C" >/dev/null && { REF="$C"; break; }
  done
  if [ -z "$REF" ]; then emit "- \`$BR\`: _nicht gefunden_"; continue; fi
  read -r B A < <(git rev-list --left-right --count "$BASE...$REF")
  MB="$(git merge-base "$BASE" "$REF")"
  FILES="$(git diff --name-only "$MB" "$REF")"
  N="$(printf '%s' "$FILES" | grep -c . || true)"
  emit "- \`$BR\`: $A voraus, $B zurück, $N geänderte Datei(en)"
  printf '%s\n' "$FILES" | grep . | while IFS= read -r F; do printf '%s\t%s\n' "$F" "$BR" >> "$TMP/all"; done
done
emit ""

emit "## Dateien in mindestens zwei Zweigen"
emit ""
OVER="$(cut -f1 "$TMP/all" | sort | uniq -c | awk '$1>=2{sub(/^ +[0-9]+ /,"");print}')"
if [ -z "$OVER" ]; then
  emit "Keine Überschneidungen."
else
  emit "| Datei | Zweige |"; emit "|---|---|"
  while IFS= read -r F; do
    BRS="$(awk -F'\t' -v f="$F" '$1==f{print $2}' "$TMP/all" | sort -u | paste -sd, - | sed 's/,/, /g')"
    emit "| \`$F\` | $BRS |"
  done <<< "$OVER"
fi
emit ""

emit "## Warnungen an empfindlichen Stellen"
emit ""
WARN=0
# Migrationen: gleiche Nummer in verschiedenen Zweigen
NUMS="$(awk -F'\t' '$1 ~ /^drizzle\/[0-9][0-9][0-9][0-9]_.*\.sql$/ {n=substr($1,9,4); print n"\t"$2"\t"$1}' "$TMP/all" | sort -u)"
if [ -n "$NUMS" ]; then
  DUP="$(printf '%s\n' "$NUMS" | cut -f1 | sort | uniq -d)"
  for N in $DUP; do
    emit "- **Migrationsnummer $N kommt in mehreren Zweigen vor:** $(printf '%s\n' "$NUMS" | awk -F'\t' -v n="$N" '$1==n{print "`"$2"` (`"$3"`)"}' | paste -sd, - | sed 's/,/, /g')"
    WARN=1
  done
fi
for P in 'src/domain/permissions.ts:Rechte (Nur an einer Stelle ändern, Reihenfolge klären)' 'CLAUDE.md:Arbeitsregeln' '.github/:Prüf- und Auslieferungsabläufe' 'deploy/:Auslieferung'; do
  PATH_P="${P%%:*}"; WHY="${P#*:}"
  HITS="$(awk -F'\t' -v p="$PATH_P" 'index($1,p)==1{print $2}' "$TMP/all" | sort -u | paste -sd, - | sed 's/,/, /g')"
  if [ -n "$HITS" ] && [ "$(awk -F'\t' -v p="$PATH_P" 'index($1,p)==1{print $2}' "$TMP/all" | sort -u | wc -l)" -ge 2 ]; then
    emit "- **$PATH_P** (${WHY%% (*}) in mehreren Zweigen: $HITS"; WARN=1
  fi
done
[ "$WARN" = "0" ] && emit "Keine."
emit ""

printf '%s' "$REPORT" > "$OUT"
echo "Bericht: $OUT"
