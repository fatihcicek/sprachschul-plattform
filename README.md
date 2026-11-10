# Sprachschul-Plattform (Arbeitstitel: Kurswerk)

Plattform für Sprachschulen und BAMF-Kursträger: Unterricht, Anwesenheit und Nachweise in einem System.

## Stand

Das Fundament: Datenmodell, Mandantentrennung, Rechte und Anwesenheitslogik, alles mit Tests. Es gibt noch keine Anmeldung und keine Oberflächen; der klickbare Prototyp liegt getrennt vor.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/db` | Datenmodell (`schema.ts`) und Datenbankzugriff (`client.ts`) |
| `drizzle` | SQL-Migrationen. `0001_sicherheit.sql` enthält die Regeln, die in der Datenbank selbst gelten |
| `src/domain` | Fachlogik ohne Datenbank: Anwesenheit, Terminplanung, Rechte |
| `src/server` | Abläufe mit Datenbank: Anwesenheit vorschlagen, bestätigen, korrigieren |
| `src/app` | Next.js-Anwendung (bisher nur Startseite und `/api/health`) |
| `tests` | Tests, darunter `database.test.ts` gegen eine echte PostgreSQL-Datenbank |
| `docs` | BAMF-Anforderungen mit Quellen und offenen Punkten |

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
