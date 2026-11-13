# Betrieb: Auslieferung, Datenbank, Sicherung

Stand: 12.11.2026. Diese Seite trennt drei Dinge: was **am Code belegt** ist, was **nur eine Annahme** ist und was **nur auf dem Server** nachgeprüft werden kann (dort hat die Entwicklung keinen Zugriff). Nichts davon ist eine Freigabe: Änderungen an der Auslieferung, an Zugangsdaten und an Datenbanken brauchen Fatihs ausdrückliche Freigabe.

## Kurzfassung für Fatih

- **Das Repository kann erst privat werden, wenn der Server sich bei GitHub anmeldet.** Ob er das tut, sagt dir ein einmaliger Lese-Test auf dem Server (Abschnitt 2, Schritt 1). Bis dahin bleibt alles wie es ist.
- **Auf der Testumgebung liegen nur erfundene Daten.** Dort ist eine Sicherung nicht nötig. **Vor der ersten Schule mit echten Personendaten** brauchen wir eine echte PostgreSQL-Datenbank in der EU mit Sicherung und geübter Wiederherstellung (Abschnitt 4).
- **Ein Zurück auf eine ältere App-Version gibt es heute nicht.** Vorschlag in Abschnitt 3, wartet auf deine Entscheidung.

## 1. Wie ausgeliefert wird

**Am Code belegt:**
1. Ein Pull Request wird gemergt, `main` ändert sich.
2. GitHub Actions (`.github/workflows/deploy.yml`) prüft, baut das Paket (`scripts/bundle.sh`) und legt es als **ein einziger Commit** auf den Zweig `deploy` (`git init` + `push -f`). `git rev-list --count origin/deploy` ergibt 1: frühere Pakete gehen verloren.
3. `deploy/namecheap-update.sh` macht `git fetch origin deploy`, bei neuem Stand `git reset --hard origin/deploy` und `touch tmp/restart.txt`. Das Skript hat `set -e`: Scheitert der Abruf, endet es lautlos und schreibt nichts ins Protokoll.
4. Die App öffnet die eingebettete Datenbank (`DATABASE_URL=pglite:/pfad`) **bei der ersten Anfrage, die eine Datenbank braucht**, nicht beim Prozessstart (`src/db/index.ts`). Dabei laufen alle neuen Migrationen, ohne vorherige Sicherung. Bei `DEMO_SEED=1` entsteht die Beispielschule.

**Annahmen, nicht am Code belegt (nur auf dem Server prüfbar):** dass der Cronjob alle 5 Minuten läuft (steht nur als Kommentar in `deploy.yml`), dass der Neustart über Passenger geschieht, dass auf dem Server eine Kopie von `namecheap-update.sh` liegt. Das Skript im Repository ist nur eine Vorlage; eine Änderung dort verändert den Server nicht.

## 2. Abhängigkeit vom öffentlichen Repository

**Belegt:** Das Repository ist öffentlich (`private: false`). Mit einem öffentlichen Repository braucht der Abruf keine Anmeldung, mit einem privaten schon.

**Nicht belegt:** Mit welcher Adresse und Anmeldung der Server abruft. Ist es eine einfache `https://github.com/…`-Adresse ohne Zugangsdaten, **bricht der Abruf nach dem Privatstellen ab**: Das Testsystem läuft auf dem alten Stand weiter und bekommt keine Updates mehr; Daten gehen dabei nicht verloren.

**Warum privat sinnvoll ist:** Das Paket auf `deploy` enthält die übersetzte Serverlogik und die von Next.js bei jedem Build zufällig erzeugten Schlüssel (Vorschau-Modus, Verschlüsselung der Serveraktionen). Die einmalige Prüfung der gesamten Historie (Ergebnis in Pull Request #23) fand im Quellcode keine Geheimnisse, aber diese Build-Schlüssel im öffentlichen Paket.

### Ablauf zum Privatstellen (bisher ist nichts davon passiert)

Der Server wird erst umgestellt, **nachdem** der neue Zugang von Hand getestet wurde, und das Repository wird erst privat, nachdem ein echter Deploy darüber lief.

**Schritt 1: Prüfen (Fatih, nur lesend).** In cPanel das **Terminal** öffnen und die Prüfdatei auf den Server bringen. Zwei Wege, beide ändern nichts:

- *Herunterladen:* Der Befehl mit Adresse **und Prüfsumme** steht im Pull-Request #24 (festgenagelt auf einen Stand, nicht auf `main`, damit niemand etwas Untergeschobenes bekommt). Nach dem Herunterladen `sha256sum server-pruefung.sh` ausführen und mit der Prüfsumme im PR vergleichen. Erst nach dem Merge von #24 liegt die Datei auch unter `main`; das Herunterladen geht nur, solange das Repository öffentlich ist.
- *Per Dateimanager:* Datei in cPanel > Dateimanager hochladen (oder neue Datei anlegen und den Text einfügen).

Dann ausführen:

```
bash server-pruefung.sh /voller/pfad/zum/datenbankordner
```

Den Datenbankordner findest du in cPanel unter *Node.js-App* bei den Umgebungsvariablen: der Wert von `DATABASE_URL` hinter `pglite:`, zum Beispiel `/home/benutzer/schule_daten`. Nur diesen Pfad angeben, nie die ganze Variable (sieht das Skript eine Adresse oder Zugangsdaten, gibt es die Angabe nicht aus und bricht diesen Teil ab).

Das Skript gibt nur aus, was es selbst formuliert, und streng geprüfte Werte. Rohe Zeilen aus Cronjob, Protokoll, Konfiguration oder Fehlermeldungen kommen nie vor, ein letzter Filter entfernt zusätzlich verdächtige Zeilen. **Das ist keine Garantie, deshalb die Ausgabe vor dem Weitergeben kurz überfliegen.** Sie kann enthalten: Repository-Adresse (Rechner und Name, ohne Zugangsdaten), Namen des Datenbankordners und gefundener Sicherungsdateien, Zeitpunkte, Commit-Nummern, Ordnerrechte, Anzahl der Prozesse. Nicht enthalten sind Benutzername, vollständige Pfade und Cron-Befehle. Fehlt auf dem Server ein Programm, steht „nicht ermittelbar“ in der Ausgabe statt einer stillen Lücke.

**Schritt 2: Auswertung (Entwicklung).** Wie ruft der Server ab, ist SSH nach außen offen (Port 22 oder 443), wo liegen die Daten?

**Schritt 3: Schlüssel erzeugen (Fatih, im Terminal).**

```
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -N "" -f ~/.ssh/kurswerk_deploy -C kurswerk-testserver
chmod 600 ~/.ssh/kurswerk_deploy
cat ~/.ssh/kurswerk_deploy.pub
```

Die letzte Zeile zeigt den **öffentlichen** Schlüssel (beginnt mit `ssh-ed25519`). Nur den zurückgeben. Die Datei `kurswerk_deploy` ohne `.pub` ist der private Schlüssel und verlässt den Server nie.

**Schritt 4: Schlüssel eintragen (Entwicklung, mit Freigabe, denn es ist eine Änderung an Zugangsdaten).** Der öffentliche Schlüssel wird am Repository als **Deploy-Key mit nur Leserecht** eingetragen. Er gilt nur für dieses Repository.

**Schritt 5: Testen, ohne etwas umzustellen (Fatih).**

```
GIT_SSH_COMMAND='ssh -i ~/.ssh/kurswerk_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
  git ls-remote git@github.com:fatihcicek/sprachschul-plattform.git deploy
```

Klappt es, erscheint eine Zeile mit einer langen Kennung und `refs/heads/deploy`. Beim ersten Mal wird der Server von GitHub notiert (ohne Rückfrage; der Cronjob kann keine Rückfrage beantworten). Dieser Test funktioniert **schon jetzt**, solange das Repository noch öffentlich ist, und ändert den laufenden Abruf nicht. Meldet er „Permission denied“, ist der Schlüssel noch nicht eingetragen oder falsch; „Connection timed out“ heißt, Port 22 ist gesperrt (dann Variante mit Port 443 unten).

**Schritt 6: Server umstellen (Fatih, erst nach Erfolg von Schritt 5).** Zuerst die alte Adresse für den Rückweg sichern (die Datei bleibt auf dem Server und wird nirgends geteilt, sie kann Zugangsdaten enthalten):

```
git -C ~/schule_app config --get remote.origin.url > ~/schule_app_alte_adresse.txt
chmod 600 ~/schule_app_alte_adresse.txt
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/kurswerk_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config
git -C ~/schule_app remote set-url origin git@github.com:fatihcicek/sprachschul-plattform.git
git -C ~/schule_app fetch origin deploy && echo "Abruf klappt"
```

Ist Port 22 gesperrt, im Eintrag `HostName ssh.github.com` und eine Zeile `Port 443` verwenden.

**Rückweg für Schritt 6:** `git -C ~/schule_app remote set-url origin "$(cat ~/schule_app_alte_adresse.txt)"`.

**Schritt 7: Einen echten Deploy abwarten (beide).** Eine kleine Änderung mergen und prüfen, dass das Testsystem sie über den neuen Zugang bekommt (Protokoll `~/schule_deploy.log`).

**Schritt 8: Privat stellen (Entwicklung, Freigabe liegt vor).** Danach den nächsten Deploy beobachten. Läuft er nicht, Repository wieder öffentlich stellen; das Testsystem läuft die ganze Zeit auf seinem letzten Stand weiter.

**Schritt 9: Schlüssel erneuern.** Die zufälligen Build-Schlüssel im bisher öffentlichen Paket gelten für den gerade laufenden Stand. Nach dem Privatstellen einen neuen Deploy auslösen (jeder Build erzeugt neue Schlüssel), damit die veröffentlichten Schlüssel nicht mehr zum laufenden System gehören.

**Alternative zu SSH, falls beides gesperrt ist:** ein fine-grained Zugriffstoken (nur dieses Repository, nur „Contents: lesen“) in der Abrufadresse. Nachteil: Er steht im Klartext in der Konfiguration des Servers, und ohne Ablaufdatum bliebe er bei Verlust dauerhaft gültig. Wenn Ablaufdatum, dann höchstens ein Jahr und im Kalender erneuern. Deshalb nur zweite Wahl.

**Kosten privat (nicht geprüft):** GitHub Actions hat für private Repositories ein monatliches Freikontingent, das vom Tarif abhängt. Die bisherige Prüfung dauert wenige Minuten je Pull Request.

**Zweigschutz:** Auf dem kostenlosen GitHub-Tarif gibt es bei privaten Repositories keinen Zweigschutz. Ersatz bis zum Tarifwechsel: die Prüfungen laufen weiter, Fatiths Freigabe ist die Sperre, es wird nur über Pull Requests gearbeitet. Eine Einschränkung bleibt: Ein Pull Request kann seine eigene Prüfung ändern; deshalb gelten Änderungen an `.github/`, `scripts/`, `deploy/` und `CLAUDE.md` als mittleres Risiko mit Freigabe.

## 3. Datenbank auf der Testumgebung (PGlite)

### Belegt am Code

- Die Testumgebung nutzt PGlite (PostgreSQL als WebAssembly im selben Prozess); Entwicklung und CI nutzen PostgreSQL 16.
- Die Daten liegen in dem Ordner, der in `DATABASE_URL` hinter `pglite:` steht.
- Ein Abruf (`git reset --hard`) ersetzt nur Dateien, die git verfolgt. Das Paket enthält keinen Datenordner (`scripts/bundle.sh`). Liegt der Datenordner außerhalb des Programmordners oder dort unverfolgt, bleibt er erhalten.
- PGlite läuft als Superuser. Die App wechselt in den drei Zugriffsfunktionen `withOrganization`, `withSlugLookup` und `withRegistrationAccess` mit `SET LOCAL ROLE` auf eine eingeschränkte Rolle (`src/db/client.ts`, `src/db/embedded.ts`). Die Rechte dieser Rolle werden beim Öffnen für die dann vorhandenen Tabellen vergeben. Direkte Zugriffe am Datenbank-Handle außerhalb dieser Funktionen liefen als Superuser (bisher nur `select 1` im Health-Check).
- Gegen PostgreSQL nutzt die App die Rolle aus `DATABASE_URL`. **Dass diese kein Superuser ist und `BYPASSRLS` nicht hat, ist eine Betriebsvorgabe**, die nur die CI per Skript sicherstellt (`deploy.yml`) und ein Test prüft (`tests/database.test.ts`). Zur Laufzeit prüft die App es nicht. Vorschlag für den Umzug auf echtes PostgreSQL: Start-Check, der bei `rolsuper` oder `rolbypassrls` abbricht.
- Tests: Die vollständige Suite läuft gegen PostgreSQL 16, gegen PGlite nur **4 Tests** (`tests/embedded.test.ts`). Die Mandantentrennung ist dort geprüft, aber bei Weitem nicht so breit.

### Nur auf dem Server prüfbar (offen)

| Frage | Prüfung |
| --- | --- |
| Liegt der Datenordner außerhalb des Programmordners? | `server-pruefung.sh <Datenbankordner>` zeigt Lage, Größe, Änderungszeit und ob git ihn verfolgt |
| Überlebt er Neustarts und Deploys? | Änderungszeit vor/nach einem Deploy vergleichen; einen Datensatz der Beispielschule anlegen und nach dem nächsten Deploy suchen |
| Laufen beim Neustart zwei App-Prozesse zugleich? Laut Code-Kommentar darf nur ein Prozess den Ordner öffnen; was bei zwei Prozessen passiert, ist **nicht geprüft** | Prozessliste am Ende der Skript-Ausgabe, Passenger-Einstellungen im cPanel |
| Gibt es irgendeine Sicherung? | Skript sucht in der Nähe; Hoster-Backups von Namecheap sind separat zu klären |
| Standort und Auftragsverarbeitung des Hosters | Vertrag und Rechenzentrum klären, vor einem Pilot mit echten Personendaten |

### Risiken

| Risiko | Schwere | Maßnahme |
| --- | --- | --- |
| Kein belegtes Backup, kein Wiederherstellungstest | hoch ab echten Daten, bei erfundenen Daten niedrig | Keine echten Personendaten auf PGlite (steht in `CLAUDE.md`). Sicherung erst auf PostgreSQL. |
| Zwei Prozesse auf demselben PGlite-Ordner | mittel, Folgen ungeprüft | Prozessanzahl prüfen, Neustart beobachten. Auf PostgreSQL entfällt das. |
| Migration läuft bei der ersten Datenbank-Anfrage ohne Sicherung. Schlägt sie fehl, läuft die App weiter, Seiten mit Datenbank liefern Fehler, und bei jeder Anfrage wird neu versucht (`cached` wird zurückgesetzt) | mittel | Migrationen abwärtsverträglich schreiben (erst ergänzen, später entfernen). Vor dem Pilot Migration getrennt vom App-Betrieb ausführen. |
| Verhalten von PGlite weicht von PostgreSQL ab (Superuser + Rollenwechsel, nur 4 Tests) | mittel | Pilot nur auf echtem PostgreSQL. PGlite danach nur für Demos. |
| Kein Rückweg auf eine ältere App-Version (`deploy` hat einen Commit) | mittel | Vorschlag, **nicht umgesetzt** (Änderung an `deploy.yml`, mittleres Risiko): Pakete je Stand aufbewahren, etwa als Release-Anhang oder Tag. Migrationen sind nur vorwärts: Eine ältere App-Version muss mit dem neueren Datenbankstand laufen können. |

## 4. Echtes PostgreSQL vor dem Pilot (Empfehlung, noch nicht entschieden)

**Ja, vor der ersten Schule mit echten Personendaten.** Gründe: Sicherung und Wiederherstellung, kein Ein-Prozess-Zwang, gleiches Verhalten wie Entwicklung und CI, Standort in der EU.

**Offene Entscheidung für Fatih** (Kosten und Datenschutz): verwaltetes PostgreSQL bei einem EU-Anbieter oder eigener Server mit PostgreSQL 16. Anforderungen in beiden Fällen: Standort EU, Auftragsverarbeitungsvertrag, verschlüsselte Verbindung, App-Rolle ohne Superuser und ohne `BYPASSRLS`, tägliche Sicherung mit zweiter Kopie an anderem Ort, **Wiederherstellung mindestens einmal wirklich geübt**.

### Sicherung (Sollzustand)

| Was | Wie | Wie oft | Beleg, dass es funktioniert |
| --- | --- | --- | --- |
| Datenbank | `pg_dump` (Format custom), verschlüsselt, auf zweiten Ort | täglich | Wiederherstellung in eine leere Datenbank, danach die Testsuite gegen diese Datenbank (Mandantentrennung!) |
| Datenbank, zeitgenau | fortlaufende Archivierung, falls der Anbieter sie bietet | laufend | Wiederherstellung auf einen Zeitpunkt, einmal pro Quartal |
| Konfiguration | Umgebungsvariablen im Passwortmanager, nicht im Repository | bei Änderung | Neuaufbau eines Testservers nur aus der Anleitung |

### Umzug von PGlite auf PostgreSQL

Auf der Testumgebung liegen nur erfundene Daten. Deshalb: **neue PostgreSQL-Datenbank, Migrationen einspielen, Beispielschule neu anlegen.** Ein Datenumzug ist nicht nötig, solange nichts erhalten bleiben muss. Müsste doch etwas erhalten bleiben: Tabellen mit `COPY` in der Reihenfolge der Fremdschlüssel übertragen, danach Zeilenzahlen vergleichen und die Testsuite gegen die Zieldatenbank laufen lassen, erst als Probe, dann mit Betriebspause. Der alte Ordner bleibt schreibgeschützt als Rückweg.

## 5. Regeln

- Keine echten Personendaten in Entwicklung und Testumgebung.
- Migrationen: nur neue anhängen, bestehende nie ändern. Eine automatische Prüfung dafür (`scripts/check-migrations-unchanged.sh`, `tests/migrations.test.ts`) kommt mit Pull Request #23; bis dahin ist es eine Regel für Menschen.
- Auslieferungen, Datenbank-Änderungen, Rechte- und Zugangsdaten-Änderungen: nur mit ausdrücklicher Freigabe durch Fatih.
- Zugangsdaten nie ins Repository, nie in Pull-Request-Texte, nie in Antworten.
