#!/usr/bin/env bash
# targeted-recon: gezielte, lesende Abfrage. Schreibt nur den Bericht nach reports/.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Kein Git-Repository: bitte im Projektordner ausführen." >&2; exit 2; }
cd "$ROOT" || exit 2

if [ "$#" -lt 1 ]; then
  echo "Aufruf: $0 <gegenstand> [...]   (file:PFAD[:VON-BIS] | symbol:NAME | regex:MUSTER | branch:NAME)" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
OUT="reports/targeted-recon/$STAMP.md"
mkdir -p "$(dirname "$OUT")"
FAILED=0
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
      # Nur versionierte Dateien im Repository, nie .env* oder Pfade außerhalb.
      case "$P" in
        .env|.env.*|*/.env|*/.env.*) emit "_Abgelehnt: .env-Dateien werden nicht gelesen._"; emit ""; continue;;
      esac
      if [ ! -f "$P" ] || ! git ls-files --error-unmatch -- "$P" >/dev/null 2>&1; then
        emit "_Nicht gefunden oder nicht versioniert (nur Dateien aus dem Repository werden gelesen)._"; emit ""; continue
      fi
      S=""; E=""
      if [ -n "$RANGE" ]; then
        S="${RANGE%%-*}"; E="${RANGE#*-}"
        if ! [[ "$S" =~ ^[0-9]+$ && "$E" =~ ^[0-9]+$ ]]; then
          emit "_Ungültiger Zeilenbereich \`$RANGE\` (erwartet VON-BIS mit Zahlen)._"; emit ""; continue
        fi
      fi
      emit "SHA-256: \`$(sha256sum -- "$P" | cut -d' ' -f1)\`, $(wc -l < "$P") Zeilen"
      emit '```'
      if [ -n "$RANGE" ]; then
        emit "$(sed -n "${S},${E}p" -- "$P" | awk -v s="$S" '{printf "%d\t%s\n", s+NR-1, $0}')"
      else
        emit "$(cat -n -- "$P")"
      fi
      emit '```' ;;
    symbol|regex)
      FLAG="-F"; [ "$KIND" = "regex" ] && FLAG="-E"
      OUTP="$(git grep -n $FLAG --context=1 -- "$ARG" 2>&1)"; RC=$?
      if [ "$RC" -gt 1 ]; then
        emit "_Fehler bei der Suche (Rückgabewert $RC), das ist kein „keine Treffer“:_"
        emit '```'; emit "$(printf '%s' "$OUTP" | head -5)"; emit '```'
        FAILED=1
      else
        emit '```'; emit "$(printf '%s' "$OUTP" | head -200)"; [ "$RC" -eq 1 ] && emit "(keine Treffer)"; emit '```'
      fi ;;
    branch)
      REF=""
      for C in "refs/heads/$ARG" "refs/remotes/origin/$ARG"; do
        git rev-parse --verify -q "$C" >/dev/null && { REF="$C"; break; }
      done
      if [ -z "$REF" ]; then emit "_Zweig nicht gefunden._"; emit ""; continue; fi
      if ! git rev-parse --verify -q origin/main >/dev/null; then emit "_origin/main nicht vorhanden, kein Vergleich möglich._"; emit ""; FAILED=1; continue; fi
      read -r B A < <(git rev-list --left-right --count "origin/main...$REF")
      emit "Gegenüber \`origin/main\`: $A voraus, $B zurück"
      emit ""; emit "Letzte Commits:"; emit '```'; emit "$(git log -5 --format='%h %ci %s' "$REF")"; emit '```'
      emit "Geänderte Dateien seit Abzweigung:"; emit '```'
      emit "$(git -c core.quotepath=off diff --name-status "$(git merge-base origin/main "$REF")" "$REF")"; emit '```' ;;
    *) emit "_Unbekannte Art \`$KIND\`. Erlaubt: file, symbol, regex, branch._" ;;
  esac
  emit ""
done

printf '%s' "$REPORT" > "$OUT"
echo "Bericht: $OUT"
[ "$FAILED" = "1" ] && { echo "Hinweis: mindestens ein Gegenstand konnte nicht ausgewertet werden (siehe Bericht)." >&2; exit 1; }
exit 0
