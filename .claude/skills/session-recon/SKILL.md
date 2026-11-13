---
name: session-recon
description: Zu Beginn einer Arbeitssitzung, vor dem Planen einer Änderung und nach jedem Merge auf main ausführen. Erfasst den echten Ausgangszustand (Stand von main, Arbeitsordner, offene Zweige, nächste Migrationsnummer, Teststand) und schreibt einen Bericht nach reports/. Ändert keinen Code.
---

# session-recon: Ausgangslage prüfen

Vor jeder Planung zuerst den echten Stand erfassen, nicht den aus dem Gedächtnis oder einem alten Bericht.

## Wann

- Zu Beginn jeder Sitzung, bevor etwas über den Stand des Repositorys behauptet wird.
- Vor dem Planen einer Änderung (Schritt 2 „Untersuchen“ im Ablauf von `CLAUDE.md`).
- Nach jedem Merge auf `main`, weil sich damit der Ausgangspunkt für alle weiteren Zweige ändert.

## Aufruf

```
bash .claude/skills/session-recon/scripts/recon.sh              # mit Typprüfung und Tests
bash .claude/skills/session-recon/scripts/recon.sh --ohne-tests # nur Git-Stand (schnell)
```

Der Bericht liegt unter `reports/session-recon/<UTC-Zeit>.md` (nicht versioniert). Das Skript ändert keinen Code. Nebenwirkungen: `git fetch origin --prune` aktualisiert die bekannten Remote-Zweige, `tsc` schreibt `tsconfig.tsbuildinfo` (ignoriert), und die Tests legen auf dem Datenbankserver aus `DATABASE_URL` temporäre Testdatenbanken an und löschen sie wieder.

## Was erfasst wird

- Aktueller Zweig, Commit, Abstand zu `origin/main`.
- Arbeitsordner (`git status`): nicht eingecheckte Änderungen.
- Offene Zweige (`feature/`, `fix/`, `setup/`), die noch nicht in `main` sind, mit Abstand und letzter Änderung.
- Hinweis: Zweige, die per Squash-Merge in `main` gelandet sind, erscheinen weiter als „offen“, weil ihre Commits nicht in `main` stehen. Vor dem Aufräumen mit dem Pull-Request-Status abgleichen.
- Nächste freie Migrationsnummer aus `drizzle/meta/_journal.json`. Zwei Zweige mit derselben Nummer kollidieren später.
- Typprüfung (`npx tsc --noEmit`) und Tests (`npx vitest run`). Die Ergebniszeilen stehen wörtlich im Bericht, nie sinngemäß.

Der Rückgabewert ist 1, wenn der Arbeitsordner nicht sauber ist oder Typprüfung bzw. Tests scheitern. Ohne erreichbare Datenbank scheitern die Tests; das steht dann auch so im Bericht.

## Was das Skript nicht tut

Es ändert keinen Code, pusht nicht, merged nicht und startet keine Datenbank. Es läuft an den Grenzen der Arbeit, nicht mittendrin.
