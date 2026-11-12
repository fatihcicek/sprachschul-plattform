#!/usr/bin/env bash
# NUR LESEN. Auf dem Namecheap-Server ausführen (cPanel > Terminal), Ausgabe zurückgeben.
# Zeigt, wie der Server das Paket abholt und wo die Datenbank liegt. Ändert nichts, startet nichts neu.
#
# Zugangsdaten werden nach bestem Bemühen unkenntlich gemacht, aber nicht garantiert. Bitte die Ausgabe
# vor dem Einfügen kurz überfliegen. Sie enthält Benutzername, Pfade, Dateinamen und den Namen des Repositories.
#
# Aufruf:  bash server-pruefung.sh [Datenbankordner]
#   Datenbankordner = der Pfad aus DATABASE_URL hinter "pglite:" (cPanel > Node.js-App > Umgebungsvariablen),
#   zum Beispiel /home/benutzer/schule_daten. Nur den Pfad angeben, nie die ganze Variable.
#   Anderer Programmordner:  APP=/pfad bash server-pruefung.sh
set -u
APP="${APP:-$HOME/schule_app}"
DATA_DIR="${1:-}"

# Schwärzung: ohne Beachtung der Groß-/Kleinschreibung, mehrere Muster. Lieber zu viel als zu wenig.
hide() {
  sed -E \
    -e 's#(bearer|basic)[[:space:]]+[A-Za-z0-9._~+/=-]+#\1 <ENTFERNT>#gI' \
    -e 's#(https?|ssh|git)://[^/@[:space:]]+@#\1://<ENTFERNT>@#gI' \
    -e 's#(pass(word|wd)?|pwd|token|secret|key|auth|cred[a-z]*|bearer)[a-z_]*[[:space:]]*[=:][[:space:]]*("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)#\1=<ENTFERNT>#gI' \
    -e 's#(--?[a-z-]*(pass|pwd|token|secret|key)[a-z-]*)([= ])[^[:space:]]+#\1\3<ENTFERNT>#gI' \
    -e 's#(gh[pousr]_|github_pat_)[A-Za-z0-9_]+#\1<ENTFERNT>#g' \
    -e 's# -p[^[:space:]]+# -p<ENTFERNT>#g'
}
section() { printf '\n== %s\n' "$1"; }

section "Zeit und Rechner"
date -Is 2>/dev/null || date
echo "Benutzer: $(id -un)"

# Ohne Programmordner ist keine sinnvolle Aussage möglich: klar abbrechen statt falsch zu warnen.
if ! git -C "$APP" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo
  echo "ABBRUCH: $APP ist kein Git-Ordner. Ist der Ordner anders benannt? Dann so aufrufen:"
  echo "  APP=/pfad/zum/programmordner bash server-pruefung.sh"
  exit 2
fi

section "Programmordner"
ls -ld -- "$APP" 2>&1

section "Woher holt der Server das Paket? (Adressen ohne Zugangsdaten)"
git -C "$APP" remote -v 2>&1 | hide

section "Wie meldet sich der Server bei GitHub an?"
url=$(git -C "$APP" config --get remote.origin.url 2>/dev/null || true)  # Rohwert, ohne Umschreibungen
helper=$(git -C "$APP" config --get-urlmatch credential.helper "$url" 2>/dev/null || true)
case "$helper" in
  "")        echo "Anmeldehilfe (credential.helper): keine" ;;
  store*)    echo "Anmeldehilfe (credential.helper): store (Zugangsdaten liegen in einer Datei)" ;;
  cache*)    echo "Anmeldehilfe (credential.helper): cache (nur zeitweise im Speicher)" ;;
  !*)        echo "Anmeldehilfe (credential.helper): eigener Befehl (Inhalt wird nicht angezeigt)" ;;
  *)         echo "Anmeldehilfe (credential.helper): andere (Name wird nicht angezeigt)" ;;
esac
kind=unbekannt
case "$url" in
  git@*|ssh://*) kind=ssh;       echo "Adresse-Art: SSH (braucht einen Schlüssel auf dem Server)" ;;
  https://*@*)   kind=https-auth; echo "Adresse-Art: HTTPS mit Zugangsdaten in der Adresse" ;;
  https://*)     kind=https;     echo "Adresse-Art: HTTPS ohne Zugangsdaten (funktioniert nur bei öffentlichem Repo, oder mit Anmeldehilfe)" ;;
  http://*)      kind=http;      echo "Adresse-Art: HTTP (ungewöhnlich)" ;;
  *)             echo "Adresse-Art: nicht erkannt (Pfad oder anderes)" ;;
esac
echo "SSH-Schlüssel (nur Dateinamen):"; ls "$HOME"/.ssh/*.pub 2>/dev/null || echo "  keine öffentlichen Schlüssel gefunden"
[ -f "$HOME/.netrc" ] && echo ".netrc vorhanden (Inhalt wird nicht angezeigt)" || echo ".netrc: nein"

section "Ist das Repository gerade ohne Anmeldung lesbar?"
anon=$(printf '%s' "$url" | sed -E 's#(https?://)[^/@]+@#\1#')
public=unbekannt
case "$anon" in
  https://*)
    err=$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true git -c credential.helper= ls-remote --heads -- "$anon" deploy 2>&1 >/dev/null); rc=$?
    if [ "$rc" -eq 0 ]; then public=ja; echo "JA: Das Repository ist gerade öffentlich lesbar."
    elif printf '%s' "$err" | grep -qiE "could not read|authentication|not found|terminal prompts disabled"; then public=nein; echo "NEIN: ohne Anmeldung nicht lesbar (das Repository ist privat)."
    else public=netzfehler; echo "UNKLAR: Netzwerkfehler (kein Hinweis auf privat). Meldung: $(printf '%s' "$err" | head -n 1 | hide | cut -c1-120)"; fi ;;
  *) echo "übersprungen (keine HTTPS-Adresse)" ;;
esac

section "Ausgehende Verbindungen zu GitHub (für SSH nötig)"
for target in "github.com 22" "ssh.github.com 443"; do
  read -r host port <<<"$target"
  if timeout 6 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then echo "$host Port $port: erreichbar"; else echo "$host Port $port: NICHT erreichbar (oder Test nicht möglich)"; fi
done

section "AUSWERTUNG: Übersteht der Abruf das Privatstellen des Repositories?"
has_auth=nein
case "$kind" in ssh|https-auth) has_auth=ja ;; esac
[ -n "$helper" ] && has_auth=ja
[ -f "$HOME/.netrc" ] && has_auth=ja
if [ "$kind" = unbekannt ] || [ "$kind" = http ]; then
  echo "NICHT EINDEUTIG: Die Adresse ist ungewöhnlich. Bitte die Ausgabe zurückgeben, bevor etwas umgestellt wird."
elif [ "$has_auth" = ja ]; then
  echo "Der Server meldet sich bei GitHub an. Ob die Anmeldung für ein privates Repository ausreicht (Leserecht), muss"
  echo "vor dem Umstellen geprüft werden (siehe docs/betrieb.md, Abschnitt Privatstellen)."
else
  echo "ACHTUNG: Der Server nutzt KEINE Anmeldung. Nach dem Privatstellen schlägt jeder Abruf fehl,"
  echo "das Testsystem bleibt auf dem alten Stand stehen und bekommt keine Updates mehr."
  echo "Vorher eine Anmeldung mit reinem Leserecht einrichten (docs/betrieb.md)."
fi

section "Letzter Stand und Abruf-Protokoll"
git -C "$APP" log -1 --format='Stand: %h vom %ad  %s' --date=iso 2>&1
tail -n 5 "$HOME/schule_deploy.log" 2>&1 | hide

section "Cronjob für die Auslieferung (andere Einträge werden nicht angezeigt)"
cron=$(crontab -l 2>&1 | grep -v '^[[:space:]]*#' || true)
printf '%s\n' "$cron" | grep -iE 'schule|namecheap-update|deploy' | hide || echo "(kein passender Eintrag gefunden)"
others=$(printf '%s\n' "$cron" | grep -vE '^[[:space:]]*$' | grep -ivcE 'schule|namecheap-update|deploy' || true)
echo "(weitere Einträge, nicht angezeigt: ${others:-0})"

# Datenbankordner
DATA_DIR="${DATA_DIR#pglite:}"
if [ -n "$DATA_DIR" ]; then
  section "Datenbankordner: $DATA_DIR"
  case "$DATA_DIR" in
    /*) ;;
    *) echo "Bitte den vollständigen Pfad angeben (beginnt mit /)."; DATA_DIR="" ;;
  esac
fi
if [ -n "$DATA_DIR" ]; then
  if [ ! -d "$DATA_DIR" ]; then
    echo "Diesen Ordner gibt es nicht. Tippfehler? Pfad aus DATABASE_URL hinter \"pglite:\" verwenden."
  else
    ls -ld -- "$DATA_DIR" 2>&1
    du -sh -- "$DATA_DIR" 2>&1
    echo "zuletzt geändert: $(stat -c '%y' -- "$DATA_DIR" 2>/dev/null || echo 'nicht ermittelbar')"
    real_data=$(cd -- "$DATA_DIR" && pwd -P)
    real_app=$(cd -- "$APP" && pwd -P)
    case "$real_data/" in
      "$real_app"/*)
        echo "LIEGT IM PROGRAMMORDNER. Wird er von git verfolgt oder ignoriert?"
        git -C "$APP" ls-files --error-unmatch -- "$real_data" >/dev/null 2>&1 && echo "  ACHTUNG: von git verfolgt (ein Abruf könnte ihn überschreiben)" || echo "  nicht von git verfolgt (ein Abruf mit reset --hard lässt unverfolgte Dateien stehen)"
        git -C "$APP" check-ignore -q -- "$real_data" && echo "  von git ignoriert" || echo "  nicht ignoriert"
        ;;
      *) echo "liegt außerhalb des Programmordners (gut: ein Abruf berührt ihn nicht)" ;;
    esac
    echo "Freier Speicher dort:"; df -h -- "$DATA_DIR" 2>&1 | tail -n 1
    echo "Sicherungen in der Nähe (Namen mit backup/sicherung/dump):"
    find -- "$(dirname -- "$real_data")" -maxdepth 2 \( -iname '*backup*' -o -iname '*sicherung*' -o -iname '*dump*' \) 2>/dev/null | head -n 10
  fi
else
  [ -z "${1:-}" ] && { section "Datenbankordner"; echo "nicht angegeben. Aufruf: bash server-pruefung.sh /pfad/zum/datenbankordner"; }
  true
fi

section "Laufende Node-/Passenger-Prozesse dieses Kontos (nur Nummer, Laufzeit, Programmname)"
procs=$(ps -u "$(id -un)" -o pid=,etime=,comm= 2>/dev/null | grep -iE ' (node|passenger|lsnode)' || true)
[ -n "$procs" ] && printf '%s\n' "$procs"
echo "Anzahl: $(printf '%s' "$procs" | grep -c . || true)"
echo
echo "Fertig. Es wurde nichts verändert."
