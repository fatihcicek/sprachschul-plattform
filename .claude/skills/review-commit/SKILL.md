---
name: review-commit
description: Für das unabhängige Review eines fertigen Zweigs durch einen frischen Agenten, der den Code nicht geschrieben hat. Liefert ein klares Urteil (BEREIT oder ZURÜCK) je Commit mit Prüfliste für Mandantentrennung, Rechte, Anmeldung, Migrationen und Belege. Vor dem Pull Request und vor Fatihs Merge.
---

# review-commit: unabhängiges Review

Wer etwas gebaut hat, prüft es nicht selbst. Dieser Skill gehört dem frischen Agenten, der einen fertigen Zweig bekommt und den Auftrag hat, ihn auseinanderzunehmen. Er prüft gegen echten Code und echte Ausgaben, nicht gegen die Beschreibung des Autors.

## So wird das Review gestartet

Der bauende Agent startet einen **frischen** Agenten (keine geteilte Vorgeschichte) mit diesem Auftrag:

> Prüfe den Zweig `<zweig>` gegen `origin/main` nach dem Skill `review-commit`. Du hast den Code nicht geschrieben. Dein Auftrag ist, Fehler zu finden, nicht zu bestätigen. Lies den Diff selbst, führe die Prüfungen selbst aus und melde Urteil und Befunde. Ändere nichts am Code.

Dazu: Zweigname, Abschlussbericht (Skill `closing-discipline`) und bei Rechten, Anmeldung, Datenbank, Anwesenheit oder Nachweisen der ausdrückliche Hinweis auf **Sicherheitsreview**. Bei Pflichtfällen (siehe `CLAUDE.md`) ist ein Review ohne Sicherheitsblick nicht ausreichend.

## Urteil

Es gibt nur zwei Urteile, kein „bereit mit Bedenken“:

- **BEREIT**: nichts gefunden, das gegen einen Merge spricht. Die Entscheidung zum Merge trifft trotzdem Fatih.
- **ZURÜCK**: mindestens ein Befund, der behoben werden muss. Der Zweig geht zurück, wird repariert und kommt erneut zum Review.

## Prüfliste

1. **Diff gegen Bericht.** Jede Änderung im Diff steht im Abschlussbericht, jede Aussage im Bericht ist im Diff und durch eine Ausgabe belegt. Nicht erklärte Änderungen: ZURÜCK.
2. **Selbst ausführen.** `npx tsc --noEmit`, `npx vitest run`, `npm run build` selbst laufen lassen und die Zahlen mit dem Bericht vergleichen. Abweichung oder nicht ausgeführte Tests: ZURÜCK.
3. **Mandantentrennung.** Jede neue Schultabelle hat `organization_id`, RLS und FORCE RLS, Richtlinien und einen Test, dass Schule A nie Daten von Schule B sieht. Zugriff nur über `withOrganization`, `withSlugLookup` oder `withRegistrationAccess`. Keine Verbindung als Datenbank-Superuser, kein Umgehen der Rolle.
4. **Rechte.** Entscheidungen stehen nur in `src/domain/permissions.ts`. Jede Serveraktion prüft dort, die Oberfläche blendet nur aus. Neue Aktion ohne Prüfung: ZURÜCK. Gibt es einen Test für „nicht berechtigt“, nicht nur für „berechtigt“?
5. **Anmeldung und Sitzungen.** Keine Zugangsdaten, Token oder Passwörter im Code, in Logs, Fehlermeldungen oder Tests. Einmal-Links laufen ab und sind nur einmal nutzbar. Fehlermeldungen verraten nicht, ob ein Konto existiert.
6. **Migrationen.** Nur neue Dateien in `drizzle/`, bestehende unverändert (Journal und Snapshots eingeschlossen). Sicherheitsregeln als eigene SQL-Migration. Nummer nicht doppelt belegt (Skill `cross-branch-recon`). Migration läuft auf einer leeren und auf einer bestehenden Datenbank.
7. **Unveränderliches.** Protokolle, Abgabeversionen und Rückmeldungen bleiben durch Datenbank-Trigger unveränderlich. Kein Weg, sie zu ändern oder zu löschen.
8. **Daten.** Keine echten Personendaten in Beispielen, Tests oder Bildschirmfotos.
9. **Auslieferung.** Änderungen an `.github/`, `deploy/`, `scripts/` oder `CLAUDE.md` gelten mindestens als mittleres Risiko. Prüfen, dass sie nur das tun, was der Bericht sagt, und keine Prüfung abschwächen.
10. **Lesbarkeit und Umfang.** Ein abgeschlossener, kleiner Schritt. Code für Menschen lesbar. Keine versteckten Nebenänderungen.
11. **Browser.** Bei Oberflächenänderungen: im Bericht belegter Durchlauf im echten Browser, auch mobil.

## Ausgabe je Commit

```
### <Commit-Titel> (`<kurzer Hash>`)
BEREIT / ZURÜCK: <ein Satz, was stimmt oder was falsch ist>
Für Fatih: <zwei bis vier Sätze in einfacher Sprache>
```

Danach eine Tabelle über alle Commits und ein Gesamturteil. Befunde mit Datei und Zeile, nach Schwere sortiert. Keine Push- oder Merge-Befehle: Merge und Auslieferung entscheidet Fatih.

## Grenzen

Das Review ändert keinen Code und gibt keine Freigabe zur Auslieferung. Es behauptet keine BAMF-Konformität.
