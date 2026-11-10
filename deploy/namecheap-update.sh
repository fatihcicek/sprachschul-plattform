#!/usr/bin/env bash
# Läuft auf dem Namecheap-Server per Cronjob. Holt den Zweig "deploy" und
# startet die App neu, wenn es einen neuen Stand gibt.
set -euo pipefail
APP="$HOME/schule_app"
cd "$APP"
git fetch -q origin deploy
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/deploy)" ]; then
  git reset -q --hard origin/deploy
  mkdir -p tmp && touch tmp/restart.txt
  echo "$(date -Is) aktualisiert auf $(git log -1 --format=%s)" >> "$HOME/schule_deploy.log"
fi
