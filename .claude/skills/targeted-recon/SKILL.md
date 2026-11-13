---
name: targeted-recon
description: Vor einem Plan oder Arbeitsauftrag ausführen, der vom aktuellen Inhalt bestimmter Dateien, Symbole, Zweige oder Muster abhängt. Liest nur die genannten Gegenstände und schreibt einen Bericht nach reports/.
---

# targeted-recon: gezielt nachsehen

Wo `session-recon` den Gesamtzustand erfasst, liest dieser Skill nur das, was genannt wird. Er ersetzt das Raten über den Code durch einen Beleg.

## Wann

Bevor ein Plan oder Arbeitsauftrag auf dem aktuellen Inhalt bestimmter Stellen beruht: Wo wird eine Funktion benutzt? Welche Tabellen haben `organization_id`? Was steht in einer Datei, die ein anderer Zweig geändert hat?

## Aufruf

```
bash .claude/skills/targeted-recon/scripts/recon.sh <gegenstand> [<gegenstand> ...]
```

Gegenstände:

- `file:PFAD` oder `file:PFAD:VON-BIS`: Datei oder Zeilenbereich mit Zeilennummern.
- `symbol:NAME`: wörtliche Suche im ganzen Repository, mit Kontext.
- `regex:MUSTER`: Suche mit erweitertem regulärem Ausdruck.
- `branch:NAME`: Abstand zu `origin/main`, letzte Commits, geänderte Dateien.

Beispiele: `symbol:withOrganization`, `regex:SET LOCAL ROLE`, `file:src/domain/permissions.ts`, `branch:feature/bamf-schalter`.

Bericht: `reports/targeted-recon/<UTC-Zeit>.md`.

## Grenzen

Ändert keinen Code, pusht nicht, merged nicht. `file:` liest nur versionierte Dateien des Repositorys und lehnt `.env*` ab. Ein Suchfehler (z. B. ungültiger regulärer Ausdruck) wird als Fehler gemeldet, nicht als „keine Treffer“, und setzt den Rückgabewert 1. Treffer sind auf 200 Zeilen je Gegenstand begrenzt; bei mehr Treffern das Muster enger fassen.
