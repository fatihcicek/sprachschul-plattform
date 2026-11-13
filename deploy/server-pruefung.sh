#!/usr/bin/env bash
# NUR LESEN. Auf dem Namecheap-Server ausführen (cPanel > Terminal), Ausgabe zurückgeben.
# Zeigt, wie der Server das Paket abholt und wo die Datenbank liegt. Ändert nichts, startet nichts neu.
#
# Bauart: Das Skript gibt nur aus, was es selbst formuliert hat, oder streng geprüfte Werte
# (Zeitpunkte, Zahlen, Commit-Nummern, Ordnernamen, Rechte, Programmnamen). Zeilen aus Konfigurationen, Cronjobs,
# Protokollen oder Fehlermeldungen werden nicht roh ausgegeben. Ein letzter Filter entfernt verdächtige Zeilen.
# Eine Garantie ist das nicht: Die Ausgabe vor dem Einfügen kurz lesen.
#
# Was in der Ausgabe stehen kann (personenbezogen oder betrieblich, aber keine Zugangsdaten):
#   Adresse des Repositories (Rechner und Name, z. B. github.com:konto/repo), Name des Datenbankordners,
#   Zeitpunkte, Commit-Nummern, Rechte der Ordner, Anzahl der Prozesse und Anzahl gefundener Sicherungen.
#   Nicht ausgegeben werden Cron-Befehle, vollständige Pfade, Dateinamen von Sicherungen, Passwörter, Tokens,
#   Schlüssel. Der Benutzername kann trotzdem vorkommen, wenn er Teil der Repository-Adresse oder eines
#   Ordnernamens ist: darauf achten.
#
# Aufruf:  bash server-pruefung.sh [Datenbankordner]
#   Datenbankordner = der Pfad aus DATABASE_URL hinter "pglite:" (cPanel > Node.js-App > Umgebungsvariablen),
#   zum Beispiel /home/benutzer/schule_daten. Nur den Pfad angeben, nie die ganze Variable.
#   Anderer Programmordner:  APP=/pfad bash server-pruefung.sh
set -u
export LC_ALL=C
APP="${APP:-$HOME/schule_app}"
ARG="${1:-}"

# Git nur lesend und ohne Programme aus der Repo-Konfiguration (fsmonitor, Hooks).
g() { git -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"; }
have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s\n' "$1"; }
# Ehrliche Meldung statt stiller Lücke, wenn ein Programm fehlt.
need() { have "$1" && return 0; echo "nicht ermittelbar: Programm \"$1\" fehlt auf diesem Server"; return 1; }
# Rechner und Name aus einer Git-Adresse, alles bis zum letzten "@" und das Schema weg.
strip_url() { printf '%s' "$1" | sed -E 's#^[A-Za-z0-9+.-]+://##; s#^.*@##'; }
# Nur harmlose Zeichen durchlassen, sonst Platzhalter.
safe_text() {
  case "$1" in *$'\n'*|*$'\r'*) printf '<nicht darstellbar>'; return ;; esac
  if printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._:/+ -]{1,120}$'; then printf '%s' "$1"; else printf '<nicht darstellbar>'; fi
}
# Name der letzten Pfadstelle, nur harmlose Zeichen.
base_name() { safe_text "$(basename -- "$1" 2>/dev/null)"; }
# Git ohne Benutzer-/Systemkonfiguration und ohne Rückfragen, außerhalb des Programmordners.
git_anon() {
  ( cd / 2>/dev/null || true
    HOME=/nonexistent XDG_CONFIG_HOME=/nonexistent GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
    GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true SSH_ASKPASS=true \
    timeout 20 git -c credential.helper= "$@" )
}

main() {
  section "Zeit"
  date -Is 2>/dev/null || date

  # Ohne Git und ohne Programmordner ist keine sinnvolle Aussage möglich: klar abbrechen.
  if ! need git; then echo "ABBRUCH: ohne git keine Prüfung möglich."; return 2; fi
  gv=$(git --version 2>/dev/null | sed -E 's/[^0-9.]//g'); gmaj=${gv%%.*}; gmin=${gv#*.}; gmin=${gmin%%.*}
  if [ "${gmaj:-0}" -lt 2 ] && { [ "${gmaj:-0}" -lt 1 ] || [ "${gmin:-0}" -lt 9 ]; }; then
    echo "ABBRUCH: Die Git-Version auf diesem Server ist zu alt für diese Prüfung (Version wird nicht ausgewertet). Bitte melden."; return 2
  fi
  if ! g -C "$APP" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo
    echo "ABBRUCH: Der Programmordner ist kein Git-Ordner oder gehört einem anderen Benutzer (Name wird nicht angezeigt). Ist er anders benannt? Dann so aufrufen:"
    echo "  APP=/pfad/zum/programmordner bash server-pruefung.sh"
    return 2
  fi

  section "Programmordner"
  if have stat; then echo "Name: $(base_name "$APP"), Rechte und Änderungszeit: $(stat -L -c '%A  %y' -- "$APP" 2>/dev/null || echo 'nicht ermittelbar')"
  else echo "nicht ermittelbar: Programm \"stat\" fehlt"; fi

  section "Woher holt der Server das Paket?"
  url=$(g -C "$APP" config --get remote.origin.url 2>/dev/null || true)
  if [ -z "$url" ]; then echo "Keine Adresse \"origin\" eingetragen."
  else echo "Adresse (ohne Zugangsdaten): $(safe_text "$(strip_url "$url")")"; fi

  section "Wie meldet sich der Server bei GitHub an?"
  helper=$(g -C "$APP" config --get-urlmatch credential.helper "$url" 2>/dev/null || true)
  case "$helper" in
    "")     echo "Anmeldehilfe (credential.helper): keine" ;;
    store*) echo "Anmeldehilfe (credential.helper): store (Zugangsdaten liegen in einer Datei)" ;;
    cache*) echo "Anmeldehilfe (credential.helper): cache (nur zeitweise im Speicher)" ;;
    !*)     echo "Anmeldehilfe (credential.helper): eigener Befehl (Inhalt wird nicht angezeigt)" ;;
    *)      echo "Anmeldehilfe (credential.helper): andere (Name wird nicht angezeigt)" ;;
  esac
  kind=unbekannt
  case "$url" in
    git@*|ssh://*) kind=ssh;        echo "Adresse-Art: SSH (braucht einen Schlüssel auf dem Server)" ;;
    https://*@*)   kind=https-auth; echo "Adresse-Art: HTTPS mit Zugangsdaten in der Adresse" ;;
    https://*)     kind=https;      echo "Adresse-Art: HTTPS ohne Zugangsdaten (funktioniert nur bei öffentlichem Repo oder mit Anmeldehilfe)" ;;
    http://*)      kind=http;       echo "Adresse-Art: HTTP (ungewöhnlich)" ;;
    *)             echo "Adresse-Art: nicht erkannt" ;;
  esac
  pubkeys=$(ls "$HOME"/.ssh/*.pub 2>/dev/null | grep -c . || true)
  echo "Öffentliche SSH-Schlüssel im Konto: ${pubkeys:-0} (Namen werden nicht angezeigt)"
  if [ -f "$HOME/.netrc" ]; then echo ".netrc vorhanden (Inhalt wird nicht angezeigt)"; else echo ".netrc: nein"; fi

  section "Ist das Repository gerade ohne Anmeldung lesbar?"
  case "$url" in
    https://*)
      if need timeout; then
        anon=$(strip_url "$url"); anon="https://$anon"
        err=$(git_anon ls-remote --heads -- "$anon" deploy 2>&1 >/dev/null); rc=$?
        if [ "$rc" -eq 0 ]; then echo "JA: Das Repository ist gerade öffentlich lesbar."
        elif printf '%s' "$err" | grep -qiE "could not read|authentication|not found|terminal prompts disabled"; then echo "NEIN: ohne Anmeldung nicht lesbar (das Repository ist privat)."
        else echo "UNKLAR: Netzwerkfehler oder Zeitüberschreitung (kein Hinweis auf privat). Meldung wird nicht angezeigt."; fi
      fi ;;
    *) echo "übersprungen (keine HTTPS-Adresse)" ;;
  esac

  section "Ausgehende Verbindungen zu GitHub (für SSH nötig)"
  if need timeout; then
    for target in "github.com 22" "ssh.github.com 443"; do
      read -r host port <<<"$target"
      if timeout 6 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then echo "$host Port $port: erreichbar"; else echo "$host Port $port: NICHT erreichbar (oder Test nicht möglich)"; fi
    done
  fi

  section "AUSWERTUNG: Übersteht der Abruf das Privatstellen des Repositories?"
  has_auth=nein
  case "$kind" in ssh|https-auth) has_auth=ja ;; esac
  [ -n "$helper" ] && has_auth=ja
  [ -f "$HOME/.netrc" ] && has_auth=ja
  if [ "$kind" = unbekannt ] || [ "$kind" = http ]; then
    echo "NICHT EINDEUTIG: Die Adresse ist ungewöhnlich. Bitte die Ausgabe zurückgeben, bevor etwas umgestellt wird."
  elif [ "$kind" = ssh ] && [ "${pubkeys:-0}" -eq 0 ] && [ -z "$helper" ]; then
    echo "WARNUNG: SSH-Adresse, aber kein öffentlicher Schlüssel im Konto gefunden. Der Abruf funktioniert vermutlich nur, solange das Repository öffentlich ist."
  elif [ "$has_auth" = ja ]; then
    echo "Auf dem Server ist eine Anmeldung eingetragen (ob sie funktioniert, ist damit nicht gesagt). Ob die Anmeldung für ein privates Repository ausreicht (Leserecht), muss"
    echo "vor dem Umstellen geprüft werden (siehe docs/betrieb.md, Abschnitt Privatstellen)."
  else
    echo "ACHTUNG: Der Server nutzt KEINE Anmeldung. Nach dem Privatstellen schlägt jeder Abruf fehl,"
    echo "das Testsystem bleibt auf dem alten Stand stehen und bekommt keine Updates mehr."
    echo "Vorher eine Anmeldung mit reinem Leserecht einrichten (docs/betrieb.md)."
  fi

  section "Letzter Stand und Abruf-Protokoll"
  sha=$(g -C "$APP" log -1 --format=%H 2>/dev/null || true)
  when=$(g -C "$APP" log -1 --format=%ad --date=iso 2>/dev/null || true)
  subj=$(g -C "$APP" log -1 --format=%s 2>/dev/null || true)
  if printf '%s' "$subj" | grep -Eq '^Paket aus [0-9a-f]{40}$'; then subj_out="$subj"; else subj_out="<anderer Text, nicht angezeigt>"; fi
  if printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then echo "Stand: $sha vom $(safe_text "$when")  $subj_out"; else echo "Stand: nicht ermittelbar"; fi
  restart="$APP/tmp/restart.txt"
  if [ -e "$restart" ] && have stat; then echo "Letzter Neustart-Auslöser (tmp/restart.txt): $(stat -c '%y' -- "$restart" 2>/dev/null || echo 'nicht ermittelbar')"
  elif [ -e "$restart" ]; then echo "Neustart-Auslöser vorhanden"; else echo "tmp/restart.txt: nicht vorhanden"; fi
  logf="$HOME/schule_deploy.log"
  if [ -r "$logf" ]; then
    pat='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}[-+][0-9:]{4,5} aktualisiert auf Paket aus [0-9a-f]{40}$'
    total=$(grep -ac . < "$logf" 2>/dev/null || true)
    ok=$(grep -aEc "$pat" < "$logf" 2>/dev/null || true)
    echo "Protokoll: ${total:-0} Zeilen, davon ${ok:-0} im erwarteten Format. Die letzten 5 davon:"
    grep -aE "$pat" < "$logf" 2>/dev/null | tail -n 5
    echo "(Zeilen in anderem Format werden nicht angezeigt: $(( ${total:-0} - ${ok:-0} )))"
  else
    echo "Kein lesbares Protokoll (schule_deploy.log) gefunden."
  fi

  section "Cronjob für die Auslieferung (nur Zeitfelder und Programmname, nie der Befehl)"
  if need crontab; then
    cron=$(crontab -l 2>/dev/null | grep -Ev '^[[:space:]]*(#|$)' || true)
    mine=0; other=0
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if printf '%s' "$line" | grep -qiE 'schule|namecheap-update|deploy'; then
        mine=$((mine+1))
        # genau fünf Zeitfelder, jedes streng geprüft; der Rest (Befehl) wird nie ausgegeben
        read -r -a parts <<<"$line"
        times=""; good=0
        num='[0-9*]+([-/,][0-9*]+)*'
        mon='(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)'; dow='(sun|mon|tue|wed|thu|fri|sat)'
        if [ "${#parts[@]}" -ge 6 ]; then
          good=1
          for i in 0 1 2 3 4; do
            f=$(printf '%s' "${parts[$i]}" | tr 'A-Z' 'a-z')
            case $i in 3) alt="$mon" ;; 4) alt="$dow" ;; *) alt="" ;; esac
            if [ -n "$alt" ]; then printf '%s' "$f" | grep -Eq "^($num|$alt([-,]$alt)*)$" || good=0
            else printf '%s' "$f" | grep -Eq "^$num$" || good=0; fi
            times="$times ${parts[$i]}"
          done
        elif [ "${#parts[@]}" -ge 2 ] && printf '%s' "${parts[0]}" | grep -Eq '^@(reboot|hourly|daily|weekly|monthly|yearly|annually|midnight)$'; then
          good=1; times=" ${parts[0]}"
        fi
        [ "$good" -eq 1 ] || times=" <Zeitfelder nicht darstellbar>"
        if printf '%s' "$line" | grep -q 'namecheap-update\.sh'; then prog="namecheap-update.sh"; else prog="<anderer Befehl, nicht angezeigt>"; fi
        echo "Zeit:$times  Programm: $prog"
      else other=$((other+1)); fi
    done <<<"$cron"
    [ "$mine" -eq 0 ] && echo "(kein passender Eintrag gefunden)"
    echo "(weitere Einträge, nicht angezeigt: $other)"
  fi

  # Datenbankordner: Der Parameter wird nie ausgegeben, nur der Ordnername nach der Prüfung.
  section "Datenbankordner"
  DATA_DIR="${ARG#pglite:}"
  if [ -z "$ARG" ]; then
    echo "nicht angegeben. Aufruf: bash server-pruefung.sh /pfad/zum/datenbankordner"
  elif case "$ARG" in *$'\n'*|*$'\r'*) true ;; *) printf '%s' "$ARG" | grep -Eq '://|@|=|\?|[[:space:]]' ;; esac; then
    echo "Die Angabe sieht nach einer ganzen Verbindungsadresse oder nach Zugangsdaten aus. Sie wird NICHT angezeigt."
    echo "Bitte nur den Ordnerpfad hinter \"pglite:\" angeben (z. B. /home/konto/schule_daten)."
  elif ! printf '%s' "$DATA_DIR" | grep -Eq '^/[A-Za-z0-9._/-]+$'; then
    echo "Die Angabe ist kein einfacher vollständiger Pfad (beginnt mit /, nur Buchstaben, Ziffern, . _ - /). Sie wird nicht angezeigt."
  elif [ ! -d "$DATA_DIR" ]; then
    echo "Ein Ordner mit diesem Namen existiert nicht. Tippfehler? Pfad aus DATABASE_URL hinter \"pglite:\" verwenden."
  elif [ ! -r "$DATA_DIR" ] || [ ! -x "$DATA_DIR" ]; then
    echo "Ordner \"$(base_name "$DATA_DIR")\" vorhanden, aber für dieses Konto nicht lesbar: keine Aussage möglich."
  else
    echo "Name: $(base_name "$DATA_DIR")"
    if have stat; then echo "Rechte und zuletzt geändert: $(stat -L -c '%A  %y' -- "$DATA_DIR" 2>/dev/null || echo 'nicht ermittelbar')"; else echo "nicht ermittelbar: Programm \"stat\" fehlt"; fi
    if have du; then echo "Größe: $(du -sh -- "$DATA_DIR" 2>/dev/null | cut -f1)"; else echo "nicht ermittelbar: Programm \"du\" fehlt"; fi
    real_data=$(cd -P -- "$DATA_DIR" 2>/dev/null && pwd -P || true)
    real_app=$(cd -P -- "$APP" 2>/dev/null && pwd -P || true)
    if [ -z "$real_data" ] || [ -z "$real_app" ]; then
      echo "Lage zum Programmordner: nicht ermittelbar"
    else
      case "$real_data/" in
        "$real_app"/*)
          echo "LIEGT IM PROGRAMMORDNER."
          if [ -n "$(g -C "$APP" ls-files -- "$real_data" 2>/dev/null | head -n 1)" ]; then echo "  ACHTUNG: git verfolgt Dateien darin (ein Abruf kann sie überschreiben oder löschen)"
          else echo "  git verfolgt dort nichts (reset --hard lässt unverfolgte Dateien stehen, außer das neue Paket bringt gleichnamige mit)"; fi
          if g -C "$APP" check-ignore -q -- "$real_data" 2>/dev/null; then echo "  von git ignoriert"; else echo "  nicht von git ignoriert" ; fi ;;
        *) echo "liegt außerhalb des Programmordners (ein Abruf berührt ihn nicht)" ;;
      esac
    fi
    if have df; then echo "Freier Speicher dort: $(df -Ph -- "$DATA_DIR" 2>/dev/null | awk 'NR==2{print $4" frei von "$2}')"; else echo "nicht ermittelbar: Programm \"df\" fehlt"; fi
    if have find && [ -n "$real_data" ]; then
      parent=$(dirname -- "$real_data")
      found=$(find -- "$parent" -maxdepth 2 \( -iname '*backup*' -o -iname '*sicherung*' -o -iname '*dump*' \) 2>/dev/null)
      cnt=$(printf '%s' "$found" | grep -c . || true)
      echo "Dateien/Ordner mit backup/sicherung/dump im Namen (neben dem Datenordner, Tiefe 2): ${cnt:-0}. Namen werden nicht angezeigt."
      for ext in sql sql.gz tar.gz tgz zip; do
        n=$(printf '%s\n' "$found" | grep -ciE "\.$ext$" || true)
        [ "${n:-0}" -gt 0 ] && echo "  davon .$ext: $n"
      done
      echo "  (Hinweis: Sicherungen des Hosters außerhalb des Home-Ordners findet diese Suche nicht.)"
        else echo "Sicherungssuche: nicht ermittelbar"; fi
  fi

  section "Laufende Node-/Passenger-Prozesse dieses Kontos (nur Nummer, Laufzeit, Programmname)"
  if need ps && need id; then
    procs=$(ps -u "$(id -un)" -o pid=,etime=,comm= 2>/dev/null | grep -E '^ *[0-9]+ +[0-9:-]+ +(node|lsnode|passenger|Passenger[A-Za-z]*)$' || true)
    [ -n "$procs" ] && printf '%s\n' "$procs"
    echo "Anzahl: $(printf '%s' "$procs" | grep -c . || true)"
  fi
  echo
  echo "Fertig. Es wurde nichts verändert."
}

# Letzter Filter: Zeilen mit Adresse+"@" oder mit Passwort-/Token-Anzeichen werden entfernt.
final_filter() {
  grep -vEi '://[^[:space:]]*@|(pass(word|wd)?|pwd|token|secret|api[_-]?key|private[_ ]key|bearer)[a-z_]*[[:space:]]*[=:]|gh[pousr]_[A-Za-z0-9]|github_pat_|BEGIN [A-Z ]*PRIVATE KEY' \
    || true
}

main 2>&1 | final_filter
exit "${PIPESTATUS[0]}"
