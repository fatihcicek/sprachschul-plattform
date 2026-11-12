#!/usr/bin/env bash
# Prüft in einem Pull Request, dass bereits übernommene Migrationen nie verändert werden.
# Eine Migration, die schon irgendwo eingespielt wurde (Testumgebung, später Betrieb), darf nicht
# nachträglich geändert, gelöscht oder umbenannt werden: Dort wird sie nicht noch einmal ausgeführt,
# die Datenbanken würden auseinanderlaufen. Korrekturen kommen immer als neue Migration.
#
# Erlaubt: neue Migrationsdateien, neue Schnappschüsse, neue Einträge am Ende des Journals.
# Aufruf: scripts/check-migrations-unchanged.sh [Basis, Standard origin/main]
set -euo pipefail

base="${1:-origin/main}"
git rev-parse --verify --quiet "$base" >/dev/null || { echo "Basis $base nicht gefunden (vollständige Historie holen: fetch-depth 0)."; exit 2; }

fail=0

# 1. SQL-Dateien und Schnappschüsse: nur hinzufügen.
bad=$(git diff --name-status --no-renames "$base"...HEAD -- 'drizzle/*.sql' 'drizzle/meta/*_snapshot.json' | grep -v '^A' || true)
if [ -n "$bad" ]; then
  echo "Bereits übernommene Migrationen wurden verändert, gelöscht oder umbenannt:"
  echo "$bad" | sed 's/^/  /'
  fail=1
fi

# 2. Journal: die bisherigen Einträge müssen unverändert vorn stehen bleiben.
if git cat-file -e "$base:drizzle/meta/_journal.json" 2>/dev/null; then
  git show "$base:drizzle/meta/_journal.json" > "${TMPDIR:-/tmp}/journal-base.json"
  node - "${TMPDIR:-/tmp}/journal-base.json" drizzle/meta/_journal.json <<'EOF' || fail=1
const fs = require("fs");
const [basePath, headPath] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(basePath, "utf8")).entries;
const head = JSON.parse(fs.readFileSync(headPath, "utf8")).entries;
let ok = head.length >= base.length;
if (!ok) console.log(`Das Journal ist kürzer geworden (${base.length} → ${head.length}).`);
for (let i = 0; ok && i < base.length; i++) {
  if (JSON.stringify(base[i]) !== JSON.stringify(head[i])) {
    console.log(`Journal-Eintrag ${i} (${base[i].tag}) wurde verändert.`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
EOF
fi

if [ "$fail" -ne 0 ]; then
  echo "Bitte stattdessen eine neue Migration anlegen (npx drizzle-kit generate)."
  exit 1
fi
echo "Migrationen: nur Neues hinzugefügt, nichts Bestehendes verändert."
