#!/usr/bin/env bash
# NUR LESEN. Auf dem Namecheap-Server ausführen (Terminal in cPanel), Ausgabe hier einfügen.
# Zeigt, wie der Server das Paket abholt und wo die Datenbank liegt. Ändert nichts, startet nichts neu und gibt
# keine Zugangsdaten aus (Passwörter, Tokens und Schlüssel in Adressen und Cronjobs werden unkenntlich gemacht).
#
# Aufruf:  bash server-pruefung.sh [Datenbankordner]
#   Datenbankordner = der Pfad aus DATABASE_URL hinter "pglite:" (cPanel > Node.js-App > Umgebungsvariablen).
#   Nur den Pfad angeben, nie die ganze Variable oder andere Werte.
set -u
APP="${APP:-$HOME/schule_app}"
DATA_DIR="${1:-}"

hide() {
  sed -E \
    -e 's#(https?://)[^/@[:space:]]+@#\1<ENTFERNT>@#g' \
    -e 's#([A-Za-z_]*(PASS|PASSWORD|TOKEN|SECRET|KEY)[A-Za-z_]*=)[^[:space:]]+#\1<ENTFERNT>#g'
}
section() { printf '\n== %s\n' "$1"; }

section "Zeit und Rechner"
date -Is
echo "Benutzer: $(id -un)"

section "Programmordner"
ls -ld "$APP" 2>&1

section "Woher holt der Server das Paket? (Adressen ohne Zugangsdaten)"
git -C "$APP" remote -v 2>&1 | hide

section "Wie meldet sich der Server bei GitHub an?"
helper=$(git -C "$APP" config --get credential.helper 2>/dev/null)
echo "credential.helper: ${helper:-keiner}"
url=$(git -C "$APP" config --get remote.origin.url 2>/dev/null || true)  # Rohwert, ohne Umschreibungen
case "$url" in
  git@*|ssh://*) echo "Adresse-Art: SSH (braucht einen Schlüssel auf dem Server)" ;;
  https://*@*)   echo "Adresse-Art: HTTPS mit Zugangsdaten in der Adresse" ;;
  https://*)     echo "Adresse-Art: HTTPS ohne Zugangsdaten (funktioniert nur bei öffentlichem Repo, oder mit credential.helper)" ;;
  *)             echo "Adresse-Art: unbekannt" ;;
esac
echo "SSH-Schlüssel (nur Dateinamen):"; ls "$HOME"/.ssh/*.pub 2>/dev/null || echo "  keine öffentlichen Schlüssel gefunden"
[ -f "$HOME/.netrc" ] && echo ".netrc vorhanden (Inhalt wird nicht angezeigt)" || echo ".netrc: nein"

section "Ist das Repository gerade ohne Anmeldung lesbar?"
anon=$(printf '%s' "$url" | sed -E 's#(https?://)[^/@]+@#\1#')
public=unbekannt
case "$anon" in
  https://*) if GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true git -c credential.helper= ls-remote --heads "$anon" deploy >/dev/null 2>&1
             then public=ja; echo "JA: Das Repository ist gerade öffentlich lesbar."
             else public=nein; echo "NEIN: ohne Anmeldung nicht lesbar (privat oder nicht erreichbar)."; fi ;;
  *) echo "übersprungen (keine HTTPS-Adresse)" ;;
esac

section "AUSWERTUNG: Übersteht der Abruf das Privatstellen des Repositories?"
has_auth=nein
case "$url" in git@*|ssh://*|https://*@*) has_auth=ja ;; esac
[ -n "$helper" ] && has_auth=ja
[ -f "$HOME/.netrc" ] && has_auth=ja
if [ "$has_auth" = ja ]; then
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

section "Cronjob (Zugangsdaten unkenntlich)"
crontab -l 2>&1 | grep -v '^[[:space:]]*#' | hide

if [ -n "$DATA_DIR" ]; then
  section "Datenbankordner: $DATA_DIR"
  ls -ld "$DATA_DIR" 2>&1
  du -sh "$DATA_DIR" 2>&1
  echo "zuletzt geändert: $(stat -c '%y' "$DATA_DIR" 2>/dev/null)"
  case "$(cd "$DATA_DIR" 2>/dev/null && pwd -P)/" in
    "$(cd "$APP" 2>/dev/null && pwd -P)"/*)
      echo "LIEGT IM PROGRAMMORDNER. Wird er von git verfolgt oder ignoriert?"
      git -C "$APP" ls-files --error-unmatch -- "$DATA_DIR" >/dev/null 2>&1 && echo "  ACHTUNG: von git verfolgt (ein Abruf könnte ihn überschreiben)" || echo "  nicht von git verfolgt (ein Abruf mit reset --hard lässt unverfolgte Dateien stehen)"
      git -C "$APP" check-ignore -q -- "$DATA_DIR" && echo "  von git ignoriert" || echo "  nicht ignoriert"
      ;;
    *) echo "liegt außerhalb des Programmordners (gut: ein Abruf berührt ihn nicht)" ;;
  esac
  echo "Freier Speicher dort:"; df -h "$DATA_DIR" 2>&1 | tail -n 1
  echo "Sicherungen in der Nähe (Namen mit backup/sicherung/dump):"
  find "$(dirname "$DATA_DIR")" -maxdepth 2 \( -iname '*backup*' -o -iname '*sicherung*' -o -iname '*dump*' \) 2>/dev/null | head -n 10
else
  section "Datenbankordner"
  echo "nicht angegeben. Aufruf: bash server-pruefung.sh /pfad/zum/datenbankordner"
fi

section "Laufende Prozesse der App (Anzahl)"
ps -u "$(id -un)" -o pid,etime,cmd 2>/dev/null | grep -E "node|passenger" | grep -v grep | hide | head -n 10
echo
echo "Fertig. Es wurde nichts verändert."
