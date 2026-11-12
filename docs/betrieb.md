# Betrieb: Auslieferung, Datenbank, Sicherung

Stand: 12.11.2026. Diese Seite trennt, was **am Code belegt** ist, von dem, was **nur auf dem Server** nachgeprüft werden kann (dort hat die Entwicklung keinen Zugriff). Nichts davon ist eine Freigabe: Änderungen an der Auslieferung, an Zugangsdaten und an Datenbanken brauchen Fatihs ausdrückliche Freigabe.

## 1. Wie ausgeliefert wird (belegt)

1. Pull Request wird gemergt, `main` ändert sich.
2. GitHub Actions (`.github/workflows/deploy.yml`) prüft, baut das Paket (`scripts/bundle.sh`) und legt es als **ein einziger Commit** auf den Zweig `deploy` (`git init` + `push -f`). Der Zweig hat deshalb immer genau einen Commit; frühere Pakete gehen verloren.
3. Auf Namecheap läuft per Cronjob alle 5 Minuten `namecheap-update.sh`: `git fetch origin deploy`, bei neuem Stand `git reset --hard origin/deploy`, danach `touch tmp/restart.txt` (Neustart über Passenger).
4. Beim Start öffnet die App die eingebettete Datenbank (`DATABASE_URL=pglite:/pfad`), **spielt dabei alle neuen Migrationen automatisch ein** und legt bei `DEMO_SEED=1` die Beispielschule an.

Das Skript im Repository (`deploy/namecheap-update.sh`) ist nur eine Vorlage: Auf dem Server liegt eine Kopie. Eine Änderung im Repository verändert den Server nicht.

## 2. Abhängigkeit vom öffentlichen Repository

**Belegt:** Das Repository ist öffentlich. Der Server holt `deploy` per `git fetch origin` aus `https://github.com/fatihcicek/sprachschul-plattform`. Mit einem öffentlichen Repository braucht er dafür keine Anmeldung. Ein privates Repository verlangt eine.

**Nicht belegt (nur auf dem Server sichtbar):** Mit welcher Adresse und welcher Anmeldung der Server abruft. Ist die Adresse eine einfache `https://github.com/…` ohne Zugangsdaten, **bricht der Abruf nach dem Privatstellen ab**: Das Testsystem läuft weiter, bekommt aber keine Updates mehr (das Skript hat `set -e` und schreibt nichts ins Protokoll). Genau das prüft `deploy/server-pruefung.sh`.

**Warum privat sinnvoll ist:** Das Paket auf `deploy` enthält die übersetzte Serverlogik und die von Next.js bei jedem Build zufällig erzeugten Schlüssel (Vorschau-Modus, Verschlüsselung der Serveraktionen). Die Geheimnissuche hat gezeigt: Im Quellcode steht nichts Geheimes, im öffentlichen Paket stehen diese Build-Schlüssel.

### Ablauf zum Privatstellen (nichts davon ist bisher passiert)

| Schritt | Wer | Was |
| --- | --- | --- |
| 1 | Fatih | `bash server-pruefung.sh <Datenbankordner>` auf dem Server ausführen, Ausgabe zurückgeben (keine Zugangsdaten enthalten) |
| 2 | Entwicklung | Auswertung: Wie ruft der Server ab, ist die Anmeldung ausreichend? |
| 3 | Fatih | Auf dem Server einen **Deploy-Key** erzeugen (nur Leserecht, nur dieses Repository): `ssh-keygen -t ed25519 -N "" -f ~/.ssh/kurswerk_deploy -C kurswerk-testserver`. Den **öffentlichen** Teil (`.pub`) zurückgeben. Der private Teil verlässt den Server nie. |
| 4 | Entwicklung (mit Freigabe, Zugangsdaten-Änderung) | Den öffentlichen Schlüssel als **Deploy-Key mit nur Leserecht** am Repository eintragen |
| 5 | Fatih | Auf dem Server `~/.ssh/config` mit Eintrag für `github.com` (Schlüssel `kurswerk_deploy`, `IdentitiesOnly yes`), `git remote set-url origin git@github.com:fatihcicek/sprachschul-plattform.git`. Falls Port 22 gesperrt ist: `ssh.github.com` auf Port 443 |
| 6 | Fatih | `git fetch origin deploy` von Hand testen. **Das funktioniert auch jetzt schon, solange das Repository noch öffentlich ist, und beweist, dass die Anmeldung geht, bevor etwas riskiert wird.** |
| 7 | beide | Einen echten Deploy abwarten (kleine Änderung mergen). Das Testsystem aktualisiert sich über den neuen Zugang. |
| 8 | Entwicklung | Erst dann das Repository auf privat stellen (Freigabe liegt vor). Danach den nächsten Deploy beobachten. |

**Rückweg:** Läuft der Abruf nach Schritt 8 nicht, Repository wieder öffentlich stellen. Das Testsystem läuft die ganze Zeit auf seinem letzten Stand weiter; es geht nichts verloren.

**Alternative, falls SSH auf dem Hoster nicht geht:** ein Zugriffstoken (fine-grained, nur dieses Repository, nur „Contents: lesen“) in der Abruf-Adresse. Nachteil: Er läuft ab (spätestens nach einem Jahr) und steht im Klartext in der Konfiguration des Servers. Deshalb nur zweite Wahl.

**Kosten privat:** GitHub Actions hat für private Repositories ein monatliches Freikontingent. Die bisherige Prüfung dauert wenige Minuten je Pull Request; der Verbrauch ist bei dieser Größe gering, aber das Kontingent hängt vom Tarif ab und ist nicht geprüft.

**Zweigschutz:** Auf dem kostenlosen GitHub-Tarif gibt es bei privaten Repositories keinen Zweigschutz. Ersatz bis zum Tarifwechsel: die Pflichtprüfungen laufen weiter, Fatiths Freigabe ist die Sperre, und es wird nur über Pull Requests gearbeitet.

## 3. Datenbank auf der Testumgebung (PGlite)

### Belegt am Code

- Die Testumgebung nutzt PGlite (PostgreSQL als WebAssembly im selben Prozess), die Entwicklung und CI nutzen PostgreSQL 16.
- Die Daten liegen in dem Ordner, der in `DATABASE_URL` hinter `pglite:` steht.
- Beim Start laufen alle Migrationen automatisch, **ohne vorherige Sicherung**.
- Ein Abruf (`git reset --hard`) ersetzt nur Dateien, die git verfolgt. Liegt der Datenordner **außerhalb** des Programmordners oder ist er dort unverfolgt, bleibt er erhalten. Das Paket enthält keinen Datenordner.
- Unterschied im Verhalten: PGlite läuft als Superuser. Die App wechselt in jeder Transaktion mit `SET LOCAL ROLE` auf eine eingeschränkte Rolle ohne Umgehung der Zeilensicherheit (`src/db/client.ts`, `src/db/embedded.ts`). Die Rechte der Rolle werden beim Start für alle Tabellen vergeben. Mit echtem PostgreSQL verbindet sich die App direkt mit einer Rolle ohne Superuser.
- Tests: Die vollständige Testsuite läuft gegen PostgreSQL 16. Gegen PGlite laufen nur **4 Tests** (`tests/embedded.test.ts`). Die Mandantentrennung ist dort geprüft, aber nicht annähernd so breit wie auf PostgreSQL.

### Nur auf dem Server prüfbar (offen)

| Frage | Prüfung |
| --- | --- |
| Liegt der Datenordner außerhalb des Programmordners? Bleibt er bei Deploys erhalten? | `server-pruefung.sh <Datenbankordner>`: zeigt Lage, Größe, Änderungszeit, ob git ihn verfolgt |
| Überlebt er Neustarts? | Änderungszeit vor/nach einem Deploy vergleichen, mit der Beispielschule einen Datensatz anlegen und nach dem nächsten Deploy suchen |
| Laufen beim Neustart zwei App-Prozesse gleichzeitig? PGlite verträgt nur einen. | Prozessliste am Ende der Ausgabe; Passenger-Einstellungen im cPanel (Prozesszahl) |
| Gibt es irgendeine Sicherung? | Die Prüfung sucht in der Nähe nach Sicherungsordnern; Hoster-Backups von Namecheap sind separat zu klären |
| Wo steht der Server (Standort, Auftragsverarbeitung)? | Vertrag und Rechenzentrum des Hosters, vor einem Pilot mit echten Personendaten klären |

### Risiken

| Risiko | Schwere | Maßnahme |
| --- | --- | --- |
| Kein belegtes Backup und kein Wiederherstellungstest | hoch ab echten Daten, für erfundene Daten niedrig | Keine echten Personendaten auf PGlite (steht schon in `CLAUDE.md`). Sicherung erst auf PostgreSQL. |
| Zwei Prozesse auf demselben PGlite-Ordner (Neustart überlappt) | mittel, Datenbeschädigung möglich | Prozessanzahl prüfen, Neustart beobachten. Auf PostgreSQL entfällt das. |
| Migration beim Start ohne Sicherung; schlägt sie fehl, startet die App nicht | mittel | Migrationen abwärtsverträglich schreiben (erst ergänzen, später entfernen), vor Pilot Migration getrennt vom App-Start ausführen |
| Verhalten von PGlite weicht von PostgreSQL ab (Superuser + Rollenwechsel, nur 4 Tests) | mittel | Pilot nur auf echtem PostgreSQL. Danach PGlite nur für Demos. |
| Kein Rückweg auf eine ältere App-Version (`deploy` hat nur einen Commit) | mittel | Vorschlag (noch nicht umgesetzt, mittleres Risiko): Pakete je Stand aufbewahren, z. B. als Release-Anhang oder als Tags |
| Rollback der App nach einer Migration | mittel | Migrationen sind nur vorwärts. Alte App-Version muss mit dem neuen Datenbankstand laufen können. |

## 4. Echtes PostgreSQL vor dem Pilot (Empfehlung, noch nicht entschieden)

**Ja, vor der ersten Schule mit echten Personendaten.** Gründe: Sicherung und Wiederherstellung, kein Ein-Prozess-Zwang, identisches Verhalten zur Entwicklung und CI, Standort in der EU.

Offene Entscheidung für Fatih (Kosten und Datenschutz): verwaltetes PostgreSQL bei einem EU-Anbieter oder eigener Server mit PostgreSQL 16. Anforderungen in beiden Fällen: Standort EU, Auftragsverarbeitungsvertrag, verschlüsselte Verbindung, App-Rolle ohne Superuser und ohne `BYPASSRLS`, tägliche Sicherung mit zweiter Kopie an anderem Ort, **Wiederherstellung mindestens einmal wirklich geübt**.

### Sicherung (Sollzustand)

| Was | Wie | Wie oft | Beleg, dass es funktioniert |
| --- | --- | --- | --- |
| Datenbank | `pg_dump` (Format custom), verschlüsselt, auf zweiten Ort | täglich | Wiederherstellung in eine leere Datenbank, danach die Testsuite gegen diese Datenbank (Mandantentrennung!) |
| Datenbank, zeitgenau | fortlaufende Archivierung (PITR), falls der Anbieter sie bietet | laufend | Wiederherstellung auf einen Zeitpunkt, einmal pro Quartal |
| Konfiguration | Umgebungsvariablen im Passwortmanager, nicht im Repository | bei Änderung | Neuaufbau eines Testservers nur aus der Anleitung |

### Umzug von PGlite auf PostgreSQL

Auf der Testumgebung liegen nur erfundene Daten. Deshalb: **neue PostgreSQL-Datenbank, Migrationen einspielen, Beispielschule neu anlegen.** Ein Datenumzug ist nicht nötig und wird nicht vorbereitet, solange es keine Daten gibt, die erhalten bleiben müssen. Gäbe es sie: Tabellen mit `COPY` in der Reihenfolge der Fremdschlüssel übertragen, danach Zeilenzahlen vergleichen und die Testsuite gegen die Zieldatenbank laufen lassen, zuerst in einer Probe, dann mit Betriebspause. Der alte PGlite-Ordner bleibt schreibgeschützt als Rückweg erhalten.

## 5. Regeln

- Keine echten Personendaten in Entwicklung und Testumgebung.
- Migrationen: nur neue anhängen, bestehende nie ändern (die CI prüft das), im Zweifel abwärtsverträglich.
- Auslieferungen, Datenbank-Änderungen, Rechte- und Zugangsdaten-Änderungen: nur mit ausdrücklicher Freigabe durch Fatih.
- Zugangsdaten nie ins Repository, nie in Pull-Request-Texte, nie in Antworten.
