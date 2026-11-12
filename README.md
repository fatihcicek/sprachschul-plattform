# Sprachschul-Plattform (Arbeitstitel: Kurswerk)

Plattform für Sprachschulen und BAMF-Kursträger: Unterricht, Anwesenheit und Nachweise in einem System.

## Stand

Lauffähige Testversion (nur erfundene Beispieldaten, noch kein Betrieb mit echten Personendaten): Selbstregistrierung für Schulen mit 7 Tagen Testzeit, Anmeldung, Personen anlegen (einzeln oder aus Tabelle), Kurse anlegen, Unterricht mit Einwahlprotokoll und Anwesenheit, Aufgaben und Abgaben, BAMF-Funktionen pro Schule zuschaltbar. Mandantentrennung und Unveränderlichkeit der Nachweise sind in der Datenbank erzwungen und getestet.

Noch nicht gebaut: Live-Unterricht, Kursmaterial, Übungen, Signaturliste, Zahlung. Die BAMF-Anforderungen mit offenen Punkten stehen in `docs/bamf-anforderungen.md`; es wird keine BAMF-Konformität behauptet. Auslieferung, Datenbank und Sicherung: `docs/betrieb.md`. Arbeitsablauf und Regeln: `CLAUDE.md`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/db` | Datenmodell (`schema.ts`) und Datenbankzugriff (`client.ts`) |
| `drizzle` | SQL-Migrationen. `0001_sicherheit.sql` enthält die Regeln, die in der Datenbank selbst gelten |
| `src/domain` | Fachlogik ohne Datenbank: Anwesenheit, Terminplanung, Rechte |
| `src/server` | Abläufe mit Datenbank: Anwesenheit vorschlagen, bestätigen, korrigieren |
| `src/app` | Next.js-Anwendung (Oberflächen und Serveraktionen) |
| `tests` | Tests, darunter `database.test.ts` gegen eine echte PostgreSQL-Datenbank |
| `docs` | BAMF-Anforderungen mit Quellen und offenen Punkten, Betrieb (`betrieb.md`) |
| `deploy`, `scripts` | Vorlage für den Abruf auf dem Server, Prüfskript für den Server, Betreiberwerkzeuge, Paketbau, Migrationsprüfung |

## Drei Grundregeln

1. **Jede Schule sieht nur ihre Daten.** Zugriff auf Schuldaten läuft immer über `withOrganization()`. Die Zeilensicherheit von PostgreSQL setzt das durch, auch wenn der Anwendungscode einen Fehler hat. Ohne gesetzte Schule liefert jede Abfrage nichts.
2. **Das Einwahlprotokoll ist unveränderlich.** `connection_events`, `attendance_corrections` und `audit_events` lassen sich nur ergänzen. Ändern und Löschen verhindert die Datenbank.
3. **Einwahl ist nicht Anwesenheit.** Aus dem Protokoll entsteht ein Vorschlag. Gültig wird er erst durch die Bestätigung der Lehrkraft; jede spätere Änderung braucht eine Begründung und wird festgehalten.

## Lokal starten

Voraussetzungen: Node.js 22, PostgreSQL 16.

```bash
createuser --createdb --pwprompt kurswerk   # Passwort: kurswerk
createdb --owner kurswerk kurswerk
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed      # Beispielschule mit erfundenen Personen
npm test
npm run dev
```

Die Datenbankrolle der Anwendung darf kein Superuser sein und kein `BYPASSRLS` haben, sonst greift die Mandantentrennung nicht.

Nach Änderungen an `src/db/schema.ts`: `npm run db:generate`, dann `npm run db:migrate`.

## Erste lauffähige Version: Anmeldung und Aufgaben

```
npm run db:migrate && npm run db:seed
npm run dev        # http://localhost:3000
```

- **Anmeldung:** vorerst eine Demo-Auswahl der Beispielpersonen (`DEMO_LOGIN=1`), gesichert über ein signiertes Cookie (`SESSION_SECRET`). Echte Konten ersetzen später nur `loginAs()` in `src/server/session.ts`.
- **Teilnehmende** (`/aufgaben`): Aufgabe öffnen, Text schreiben (speichert laufend als Entwurf), bei der Lehrkraft abgeben. Danach ist der Text gesperrt, bis die Rückmeldung da ist; dann überarbeiten und erneut abgeben.
- **Lehrkraft** (`/lehrkraft`): Aufgaben stellen, Abgaben der eigenen Kurse lesen, Rückmeldung geben.
- Jede Abgabe ist eine eigene, unveränderliche Version; Rückmeldungen ebenso (Datenbankregel).

Ohne `DEMO_LOGIN=1` ist keine Anmeldung möglich. Die Demo-Anmeldung gehört nicht in einen Betrieb mit echten Daten.

## Schulen freischalten (Betreiber)

Selbst registrierte Schulen testen 7 Tage und sind danach schreibgeschützt. Freischalten, sperren oder verlängern:

```
npm run school:status -- <kurzname> ACTIVE          # freischalten
npm run school:status -- <kurzname> SUSPENDED       # sperren
npm run school:status -- <kurzname> TRIAL 7         # Testzeit auf 7 Tage ab jetzt setzen
```

Jede Änderung wird protokolliert. Auf der Testumgebung läuft die eingebettete Datenbank, die nur einen Prozess verträgt: App dafür kurz anhalten.

## Testinstallation auf Namecheap

`https://schule.gold-code-academy.com` – nur erfundene Beispieldaten.

- GitHub Actions (`.github/workflows/deploy.yml`) prüft jeden Stand auf `main` (Typprüfung, Tests), baut das Paket (`scripts/bundle.sh`) und legt es auf den Zweig `deploy`.
- Auf dem Server holt ein Cronjob (`deploy/namecheap-update.sh`) alle 5 Minuten diesen Zweig und startet die App neu.
- Das Paket hat keinen Datenbankserver, weil das Hosting-Paket keinen bietet: `DATABASE_URL="pglite:/pfad"` nutzt die eingebettete Datenbank (PGlite) mit denselben Migrationen und derselben Zeilensicherheit. Für den echten Betrieb gehört ein richtiger PostgreSQL-Server dahin.
