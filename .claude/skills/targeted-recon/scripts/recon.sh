#!/usr/bin/env bash
# targeted-recon: gezielte, lesende Abfrage. Schreibt nur den Bericht nach reports/.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

if [ "$#" -lt 1 ]; then
  echo "Aufruf: $0 <gegenstand> [...]   (file:PFAD[:VON-BIS] | symbol:NAME | regex:MUSTER | branch:NAME)" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="reports/targeted-recon/$STAMP.md"
mkdir -p "$(dirname "$OUT")"
REPORT=""
emit() { REPORT="${REPORT}$1"$'\n'; }

emit "# Targeted-Recon $STAMP"
emit ""

for SUBJ in "$@"; do
  KIND="${SUBJ%%:*}"; ARG="${SUBJ#*:}"
  emit "## \`$SUBJ\`"
  emit ""
  case "$KIND" in
    file)
      P="${ARG%%:*}"; RANGE=""
      [ "$ARG" != "$P" ] && RANGE="${ARG#*:}"
      if [ ! -f "$P" ]; then emit "_Datei nicht gefunden._"; emit ""; continue; fi
      emit "SHA-256: \`$(sha256sum "$P" | cut -d' ' -f1)\`, $(wc -l < "$P") Zeilen"
      emit '```'
      if [ -n "$RANGE" ]; then
        S="${RANGE%%-*}"; E="${RANGE#*-}"
        emit "$(sed -n "${S},${E}p" "$P" | awk -v s="$S" '{printf "%d\t%s\n", s+NR-1, $0}')"
      else
        emit "$(cat -n "$P")"
      fi
      emit '```' ;;
    symbol|regex)
      FLAG="-F"; [ "$KIND" = "regex" ] && FLAG="-E"
      OUTP="$(git grep -n $FLAG --context=1 -- "$ARG" 2>/dev/null | head -200)"
      emit '```'; emit "${OUTP:-(keine Treffer)}"; emit '```' ;;
    branch)
      REF=""
      for C in "refs/heads/$ARG" "refs/remotes/origin/$ARG"; do
        git rev-parse --verify -q "$C" >/dev/null && { REF="$C"; break; }
      done
      if [ -z "$REF" ]; then emit "_Zweig nicht gefunden._"; emit ""; continue; fi
      read -r B A < <(git rev-list --left-right --count "origin/main...$REF")
      emit "Gegenüber \`origin/main\`: $A voraus, $B zurück"
      emit ""; emit "Letzte Commits:"; emit '```'; emit "$(git log -5 --format='%h %ci %s' "$REF")"; emit '```'
      emit "Geänderte Dateien seit Abzweigung:"; emit '```'
      emit "$(git diff --name-status "$(git merge-base origin/main "$REF")" "$REF")"; emit '```' ;;
    *) emit "_Unbekannte Art \`$KIND\`. Erlaubt: file, symbol, regex, branch._" ;;
  esac
  emit ""
done

printf '%s' "$REPORT" > "$OUT"
echo "Bericht: $OUT"
