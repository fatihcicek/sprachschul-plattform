---
name: cross-branch-recon
description: Vor einem Merge, vor dem Start paralleler Arbeit oder bei der Frage nach der Merge-Reihenfolge ausführen. Zeigt, welche offenen Zweige dieselben Dateien ändern, und warnt besonders bei Migrationen, Rechten und CLAUDE.md. Ändert keinen Code (schreibt nur den Bericht, `git fetch --prune` aktualisiert die Remote-Zweige).
---

# cross-branch-recon: Kollisionen zwischen Zweigen

Arbeiten mehrere Zweige gleichzeitig, kollidieren sie meist an denselben Dateien. Dieser Skill zeigt das, bevor jemand mergt.

## Wann

- Bevor ein Zweig gemergt wird (Fatih entscheidet über die Reihenfolge).
- Bevor parallele Agenten gestartet werden, deren Arbeit dieselben Dateien berühren könnte.
- Bevor eine neue Migration angelegt wird.

## Aufruf

```
bash .claude/skills/cross-branch-recon/scripts/recon.sh                    # alle offenen Zweige
bash .claude/skills/cross-branch-recon/scripts/recon.sh fix/a feature/b   # nur diese
```

Offen heißt: `feature/`, `fix/` oder `setup/` auf `origin`, mit mindestens einem Commit, der nicht in `origin/main` ist. Bericht: `reports/cross-branch-recon/<UTC-Zeit>.md`.

## Was er zeigt

- Je Zweig: Abstand zu `origin/main` und geänderte Dateien.
- Dateien, die von mindestens zwei Zweigen geändert werden.
- **Eigene Warnungen** für Stellen, an denen ein stiller Konflikt teuer ist: `drizzle/` (zwei Zweige mit derselben Migrationsnummer), `src/domain/permissions.ts` (Rechte), `CLAUDE.md`, `.github/` und `deploy/`.

Hinweis: Alte, per Squash gemergte Zweige erscheinen weiter als offen und erzeugen Scheinüberschneidungen. Bei Zweigen, deren Pull Request gemergt ist, nicht mitzählen.

Eine Überschneidung ist kein sicherer Konflikt, aber die Voraussetzung dafür. Dann Reihenfolge festlegen oder den zweiten Zweig auf den ersten aufsetzen. Bei Migrationen: der spätere Zweig bekommt eine neue Nummer, bestehende Migrationen werden nie geändert.

## Grenzen

Führt nie einen Merge aus und ändert nichts.
