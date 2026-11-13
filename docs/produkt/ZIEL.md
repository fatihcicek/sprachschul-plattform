# Produktziel Kurswerk

**Status: ENTWURF zur Freigabe durch Fatih.** Stand: 13.11.2026, Basis: `main` bei Commit 8225a07 (PR #22).
Dieses Dokument beschreibt, was Kurswerk werden soll und was heute davon wirklich da ist. Es ist die einzige Quelle für den Produktumfang. Der Plan dazu steht in `BACKLOG.md`.

Beleg für den Ist-Stand: `npx tsc --noEmit` ohne Fehler, `npx vitest run` 18 Dateien / 267 Tests bestanden (13.11.2026, `main`). Der Stand wurde durch Lesen von Code, Datenmodell, Tests, Docs und Pull Requests erhoben, **nicht** durch einen vollständigen Durchgang im Browser. Wo das einen Unterschied macht, steht „ungeprüft“.

## 1. Vision

Kurswerk ist eine Lernplattform für Sprachschulen und Bildungsträger. Teilnehmende lernen, üben und geben Aufgaben ab; Lehrkräfte unterrichten, stellen Material und Aufgaben bereit und geben Rückmeldung; die Schulverwaltung organisiert Personen, Kurse und Termine. Der Live-Unterricht findet in einem eigenen Klassenraum statt, nicht über Zoom, Teams oder BigBlueButton.

Anwesenheit, Einwahlprotokoll und Klassenbuch sind ein **optionaler Baustein** für Träger mit BAMF-Pflichten (Schalter je Schule), nicht der Kern. Der Kern ist das Unterrichten und Lernen.

Kurswerk soll für Schulen einfacher, schöner und günstiger sein als Seconos. Es richtet sich an alle Sprachschulen, auch ohne BAMF und ohne Deutschkurse.

## 2. Wer nutzt es

| Rolle | Aufgabe | Heutige Rechte (`src/domain/permissions.ts`) |
| --- | --- | --- |
| Leitung (ADMIN) | Schule einrichten, Rollen vergeben, alles verwalten | alles außer „teilnehmen“ |
| Verwaltung (STAFF) | Kurse, Zuordnung, Termine, Nachweise, Zugänge für Teilnehmende | Kurse konfigurieren, zuordnen, planen, Anwesenheit korrigieren, Nachweise, Einladung |
| Lehrkraft (TEACHER) | Unterrichten in den eigenen Kursen | unterrichten, Anwesenheit bestätigen und korrigieren, Klassenbuch, Aufgaben stellen und beurteilen (nur eigene Kurse) |
| Teilnehmende (LEARNER) | Lernen, Aufgaben abgeben | teilnehmen (nur eigene Kurse) |
| Betreiber (Fatih) | Schulen freischalten, sperren, Testzeit | derzeit nur per Skript (`npm run school:status`) |

## 3. Grundsätze (gelten für jede Funktion)

1. **Lernen zuerst.** Die Oberfläche stellt Unterricht, Material und Aufgaben in den Vordergrund, nicht Protokolle.
2. **Eine Schule sieht nie Daten einer anderen.** Mandantentrennung in der Datenbank, mit Tests, ohne Ausnahme.
3. **Einfach statt vollgepackt.** Jede Rolle hat eine klare Startseite und erledigt die häufigsten Dinge in wenigen Klicks.
4. **Einheitlich und hochwertig.** Ein gemeinsames Designsystem statt einzelner Seiten-Stile.
5. **Ehrlich.** Keine Aussage wie „BAMF-zertifiziert“ oder „BAMF-konform“ ohne Angabe von Schnittstelle, Funktion und Version.
6. **Nachweise sind unveränderlich.** Protokolle, Abgabeversionen und Rückmeldungen werden nur ergänzt, nie überschrieben.
7. **Keine echten Personendaten, bis der Pilot freigegeben ist.** Entwicklung und Testumgebung nutzen erfundene Daten.
8. **Kosten niedrig.** Open Source und günstige Dienste, wo sie reichen (z. B. LiveKit statt eines bezahlten Videoanbieters).

## 4. Nicht-Ziele (vorerst)

- Anbindung an BerD und InGe Online (nur nach Abnahme durch das BAMF; vorher nur Vorbereitung und Anfrage).
- Offizielle Prüfungen und digitale Einstufungstests (DTB und ähnliche).
- Native Apps für iOS und Android (zuerst eine gut bedienbare Web-App, auch am Handy).
- Eigener Videokonferenz-Anbieter für Dritte; der Klassenraum dient nur den Kursen in Kurswerk.
- Bezahlfunktion im Produkt, solange kein Preismodell entschieden ist (siehe Frage 1).

## 5. Ist-Stand je Funktionsbereich

Legende: **UMGESETZT** = Code und Tests vorhanden. **TEILWEISE** = Grundlage da, wichtiger Teil fehlt. **FEHLT** = nichts vorhanden. **UNGEPRÜFT** = Code da, aber nie auf dem Server, im Browser oder mit echtem Dienst geprüft.

### F1 Schule, Konten, Zugang

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Schule registriert sich selbst, E-Mail-Bestätigung, 7 Tage Test, danach nur lesend | UMGESETZT | `src/server/registration.ts`, `tests/registration.test.ts`, `tests/access.test.ts` |
| Anmeldung mit Passwort, Einladungslink zum Passwort-Setzen, „Passwort vergessen“ | UMGESETZT | `auth.ts`, `password-reset.ts`, Tests; Begrenzung der Versuche (`login_attempts`) |
| Echter E-Mail-Versand (SMTP) | UNGEPRÜFT | Code und Konfiguration vorhanden (`mailer.ts`), im Betrieb nie mit einem Mailserver geprüft; Testumgebung nutzt Datei-/Seitenanzeige |
| Schule per Skript anlegen (`npm run school:create`), Testzeit-Hinweis in der App | UMGESETZT | `scripts/create-school.ts`, `trial-banner.tsx` |
| Demo-Anmeldung (Auswahl erfundener Personen) | UMGESETZT, nur Test | gehört nicht in den Betrieb mit echten Daten (`DEMO_LOGIN`) |
| Schulprofil (Name, Logo, Kontakt, Sprache) | FEHLT | nur ein BAMF-Schalter in den Einstellungen |
| Betreiberbereich zum Freischalten, Sperren, Verlängern | TEILWEISE | nur per Kommandozeile |
| Abo, Preise, Rechnungen | FEHLT | Entscheidung offen (Frage 1) |

### F2 Verwaltung: Personen, Kurse, Termine

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Personen anlegen (einzeln und per Liste/CSV), Einladungslink erneut senden | UMGESETZT | `people.ts`, `people-import.ts`, Tests |
| Person bearbeiten, Rolle ändern, deaktivieren, Daten korrigieren | FEHLT | im Code gibt es keine Änderungsfunktion für Personen oder Zugehörigkeiten; das Datenmodell kennt „aktiv“ |
| Kurs anlegen (Assistent: Zeitplan, Lehrkräfte, Teilnehmende, Termine werden erzeugt) | UMGESETZT | `courses.ts`, `domain/course-plan.ts`, Tests |
| Kurs ändern, archivieren, Teilnehmende ab-/zuordnen, Lehrkraft wechseln | FEHLT | Recht `course.configure` nennt „ändern, archivieren“, es gibt aber keine Funktion dafür |
| Einzelne Termine verschieben, absagen, nachholen | FEHLT | |
| „Heute“-Übersicht und „Erste Schritte“ | UMGESETZT | `overview.ts`, Test |
| Kursliste und Kursdetail für die Verwaltung | TEILWEISE | Liste vorhanden, kein Detail/Verlauf |

### F3 Kursraum (Lernen und Unterrichten)

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Raum für einen Termin (Lehrkraft): Teilnehmende, Klassenbuch, Abschluss | UMGESETZT | `teaching.ts`, `unterricht/[id]` |
| Kursraum als Lernort mit Reitern (Live, Material, Aufgaben, Teilnehmende, Anwesenheit) | FEHLT | entschieden am 12.11.2026, nicht gebaut |
| Startseite für Teilnehmende mit „Was ist als Nächstes dran?“ | TEILWEISE | Teilnehmende landen bei der Aufgabenliste |
| Lernfortschritt je Person und Kurs | FEHLT | |

### F4 Material

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Materialbibliothek je Kurs (Texte, Dateien, Links, Gliederung nach Terminen/Lektionen) | FEHLT | kein Datenmodell, keine Dateiablage |

### F5 Aufgaben und Rückmeldung

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Aufgabe stellen, Text schreiben (Entwurf), abgeben, Rückmeldung, Überarbeitung; jede Version unveränderlich | UMGESETZT | `assignments.ts`, Tests |
| Fristen (optional) mit Anzeige „verspätet“ | UMGESETZT | `assignments.due_at`, `domain/submission.ts`, Eingabe in `lehrkraft/page.tsx` |
| Anhänge, Audio-/Sprachaufnahmen, Bilder in Abgaben | FEHLT | nur Text |
| Erinnerungen, Benotung/Punkte, Aufgaben an einzelne Personen | FEHLT | |
| Aufgabe bearbeiten oder zurückziehen | FEHLT | |
| Offene Befunde: Fehlerabbildung in `createAssignmentAction`/`feedbackAction`; Einschreibedaten (`startsOn/endsOn`) werden bei Aufgaben ignoriert | OFFEN | siehe M0 |

### F6 Übungen mit automatischer Auswertung

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Übungstypen (Auswahl, Lückentext, Zuordnen, Reihenfolge, Kurzantwort …), Editor, Auto-Bewertung, Wiederholung | FEHLT | Umfang hängt an Frage 2 |

### F7 Live-Unterricht

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Eigener Klassenraum mit Video, Audio, Bildschirm teilen, Chat | FEHLT | Entscheidung für LiveKit (Open Source; kostenlos ist nur die Software, ein Server zum Selbsthosting oder ein Cloud-Tarif kostet Geld); technische Prüfung von Kosten und Hosting steht aus, Vorlage ist der Videoraum der GCA-App |
| Einwahl wird automatisch ins Protokoll geschrieben | FEHLT | heute nur Beispieldaten; Protokoll selbst ist umgesetzt (F8) |

### F8 Anwesenheit, Protokoll, Klassenbuch (BAMF-Baustein, optional je Schule)

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Einwahlprotokoll unveränderlich, Zeitleiste je Person, Lehrkraft-Zeile | UMGESETZT | `connection_events`, Datenbanksperre, Tests |
| Anwesenheit: Vorschlag, Bestätigung, begründete Korrektur, Klassenbuch mit Versionen, Terminabschluss | UMGESETZT | `attendance.ts`, `teaching.ts`, Tests |
| Schalter „BAMF-Funktionen“ je Schule | UMGESETZT | `features.ts`, `tests/bamf-schalter.test.ts` |
| Prüfung der UE-Grenzen im virtuellen Unterricht | TEILWEISE | Regel umgesetzt, nicht gegen die aktuelle BAMF-Fassung geprüft (A5) |
| Signaturliste/Export im aktuellen BAMF-Format (Stand 02.11.2026), Statusmodell Online-Anwesenheit/entschuldigt/Kurswechsel | FEHLT | A10; heute nur Druckansicht und Protokolleintrag über den Export |
| IK und BSK als getrennte Abläufe | FEHLT | A11 |
| Einwilligungen (Bildaufnahme, Übermittlung), Einführungsveranstaltung | FEHLT | A6, A7 |
| Aufbewahrung fünf Jahre, Löschkonzept | FEHLT | A4 |
| Nachweispaket für die Online-Zulassung der Schule | FEHLT | A9 |
| BerD, InGe Online | NICHT GEPLANT | erst nach BAMF-Abnahme (A8, A12) |

### F9 Kommunikation und Organisation

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Ankündigungen, Nachrichten Lehrkraft ↔ Teilnehmende, Benachrichtigungen | FEHLT | Umfang hängt an Frage 3 |
| Kalender (Ansicht und Export) | FEHLT | |
| Teilnahmebescheinigungen/Zertifikate | FEHLT | Frage 5 |

### F10 Betrieb, Sicherheit, Datenschutz

| Funktion | Status | Beleg / Anmerkung |
| --- | --- | --- |
| Mandantentrennung (22 Tabellen mit Zeilensicherheit, FORCE), Tests | UMGESETZT | `drizzle/*.sql`; vollständig gegen PostgreSQL getestet, gegen PGlite nur 4 Tests; ein Test, der jede Tabelle automatisch prüft, kommt in M0-10 |
| Rechtetabelle an einer Stelle, Prüfung in jeder Serveraktion | UMGESETZT | `permissions.ts`; offene Befunde siehe M0 |
| CI: Typprüfung, Tests, Paketbau | UMGESETZT | `deploy.yml` |
| CI: Geheimnissuche, Paketprüfung, Migrationsprüfung | OFFEN | Pull Request #23, nicht gemergt |
| Automatische Auslieferung auf `schule.gold-code-academy.com` | UMGESETZT, **Risiken offen** | **Belegt:** `deploy.yml` läuft auch bei Pull Requests mit Schreibrecht auf das Repository (Deploy selbst nur nach Push auf `main`). **Ungeprüft** (Server-Prüfung steht aus): Daten-Persistenz, Sicherungen, Zugangsdaten auf dem Server |
| Datenbank im Betrieb (PGlite auf Namecheap) | UNGEPRÜFT | nur ein Prozess zulässig; Verhalten bei Neustart/Deploy ungeprüft |
| Sicherung und Wiederherstellung | FEHLT | |
| Überwachung, Fehlerprotokolle, Alarm | FEHLT | |
| Datenschutz: Auskunft, Löschung, Auftragsverarbeitung, Datenschutzerklärung, Impressum | TEILWEISE | Texte sind Platzhalter, nicht rechtsgültig |
| Barrierefreiheit | UNGEPRÜFT | Teilbeachtung (Kontrast, Screenreader-Texte), keine Prüfung |
| Browsertests der Abläufe | FEHLT | nur manuelle Prüfung im Browser; keine automatisierte Browser-Testsuite im Repository |
| README beschreibt den aktuellen Stand | FEHLT | README sagt, es gebe noch keine Anmeldung und keine Oberflächen (veraltet) |

## 6. Was „pilotreif“ und „produktionsreif“ heißt

**Pilotreif** (kontrollierter Test mit einer Schule und echten Personen, nur nach ausdrücklicher Freigabe) heißt: M0, M1, M2, M3 und die Pilot-Aufgaben aus M8 sind erledigt, also:
- Betriebs- und Sicherheitsfundament (M0) erledigt, inklusive getesteter Sicherung/Wiederherstellung.
- Verwaltung, Kursraum, Material und Aufgaben (M1, M2, M3) für den Alltag einer Schule vollständig.
- Echte Datenbank in der EU, Überwachung, E-Mail-Versand über einen echten Dienst in der EU, rechtsgültige Texte (Impressum, Datenschutz, Auftragsverarbeitung) von einer fachkundigen Person geprüft, Datenschutzfunktionen, Barrierefreiheitsprüfung (alles M8).
- Einführung der Pilotschule ist geplant (Wer, wie viele Personen, wann: Frage 6).

**Produktionsreif** (mehrere Schulen, Bezahlung):
- Zusätzlich: Übungen (M4), Live-Raum (M5), Überwachung, Alarme, geprüfte Barrierefreiheit, Lasttest, Datenschutzkonzept mit Löschfristen, Preismodell und Abrechnung, Support-Prozess.
- BAMF-Funktionen werden nur so beworben, wie sie belegt sind.

## 7. Bereits getroffene Entscheidungen

- Mehrere Schulen mit getrennten Bereichen; Abo-Modell; Pilotschule Sprachen Plus e.V.
- Selbstregistrierung der Schulen, 7 Tage Test, danach nur lesend.
- Fokus auf Lernen (Unterricht, Kursraum), Anwesenheit/Protokoll als optionaler Baustein.
- Eigener Live-Raum mit LiveKit; Reihenfolge: erst Kursraum mit Material und Aufgaben, dann Live-Raum; vorher technische Prüfung von Kosten und Hosting.
- Design später vereinheitlichen und „premium“ machen.
- Arbeitsablauf laut `CLAUDE.md`: Zweig, Prüfung, unabhängiges Review, Pull Request, Fatih gibt frei.
- Keine echten Personendaten in Entwicklung/Test; kein Deploy, keine Änderung der Produktionsdaten ohne Freigabe.
- Repository soll privat werden, aber erst nach einem getesteten, lesenden Zugang für den Server.

## 8. Produktfragen

Nur fünf Fragen verändern die Planung wesentlich und brauchen deine Entscheidung. Alle anderen sind als Arbeitsannahme geführt: Es wird damit gebaut, du kannst sie jederzeit ändern, und eine Änderung kostet nur dann viel, wenn sie nach dem Bau der betroffenen Funktion kommt (dann steht es in der Spalte „Kosten einer späteren Änderung“).

### 8.1 Entscheidungen, die du treffen musst

| Nr. | Frage | Arbeitsannahme | Blockiert | Empfehlung |
| --- | --- | --- | --- | --- |
| 2 | Welche Übungstypen zuerst, und wer schreibt die Übungen (nur Lehrkräfte der Schule, oder auch eine gemeinsame Bibliothek von dir)? | Lehrkräfte schreiben eigene Übungen; fünf Typen: Auswahl, Lückentext, Zuordnen, Reihenfolge, Kurzantwort | M4 | Mit fünf Typen und Schul-eigenen Übungen starten; gemeinsame Bibliothek erst nach dem Pilot |
| 4 | Was muss der Live-Raum zuerst können? | Video, Ton, Bildschirm teilen, Chat; keine Aufnahme (Einwilligungen nötig), keine Gruppenräume | M5 | So lassen; Gruppenräume sind eine zweite Ausbaustufe |
| 6 | Pilot: Welche Schule, welche Kurse, wie viele Personen, ab wann, BAMF-Kurse ja/nein? | Sprachen Plus e.V., wenige Kurse, zunächst ohne BAMF-Funktionen | M5 (Lasttest), M8 | Erst nach M3 festlegen; bis dahin gilt die Annahme |
| 7 | Welches Monatsbudget gilt für Hosting (Datenbank in der EU, Dateiablage, Videoserver, E-Mail)? | Nur Kosten, die du vorher freigibst; bis dahin Testumgebung wie heute | M0, M3, M5, M6, M8 | Ein Betrag je Posten, damit Entscheidungen ohne Rückfrage möglich sind, sobald ein Posten unter dem Betrag bleibt |
| 10 | Soll Kurswerk auch Präsenz- und Mischkurse verwalten (Räume, Anmeldung, Warteliste, Stundenplan), oder zunächst nur Online-Kurse? | Ja: Verwaltung für beides; Anmeldeformular und Warteliste in einer späteren Stufe von M1 | M1-11, M6-06 | Raum und Kapazität in M1, Anmeldeformular erst nach dem Pilot, falls der Pilot es nicht verlangt |

### 8.2 Arbeitsannahmen (du kannst widersprechen, ohne dass etwas blockiert)

| Nr. | Thema | Annahme | Betrifft | Kosten einer späteren Änderung |
| --- | --- | --- | --- | --- |
| 1 | Bezahlung | Pilot ohne Bezahlfunktion, Abrechnung von Hand; Preismodell entscheidest du vor M9 | M9 | keine, solange M9 nicht begonnen hat |
| 3 | Nachrichten | nur Lehrkraft ↔ Teilnehmende und Ankündigungen je Kurs; keine Nachrichten zwischen Teilnehmenden | M6 | gering; später erweiterbar |
| 5 | Dokumente | Teilnahmebescheinigung als PDF; weitere Dokumente nach dem Pilot | M6 | gering |
| 8 | Oberflächensprache | Deutsch; Texte so bauen, dass weitere Sprachen möglich sind | M2 | gering, wenn Texte zentral liegen |
| 9 | Abgaben | Teilnehmende geben Dateien, Bilder und Sprachaufnahmen ab | M3 | mittel (Speicher, Größengrenzen) |

## 8a. Abgleich mit dem tatsächlichen Stand (13.11.2026)

Diese Spezifikation wurde gegen Code, Datenbank-Migrationen, Tests und GitHub geprüft. Belegt heißt: Ausgabe oder Datei gesehen; ungeprüft heißt: nicht nachgesehen.

- **Belegt:** 22 mandantengebundene Tabellen mit RLS und FORCE RLS; Rechte-Tabelle in `src/domain/permissions.ts`; Aufgaben mit Fristen; Anwesenheit, Protokoll, Klassenbuch; Hauptzweig ohne Branch-Schutz; Deploy-Workflow mit Schreibrecht für Pull-Request-Läufe.
- **Widersprüche, die behoben oder in M0 eingeplant sind:** README veraltet (M0-12); `CLAUDE.md` nennt Next.js 15, installiert ist 16 (M0-11); frühere Fassung behauptete fehlende Fristen (korrigiert).
- **Bisher fehlende Funktionen, jetzt im Plan:** Präsenzkurse, Räume, Anmeldung, Warteliste (Frage 10, M1); Stundenplan und Vertretung (M6); Noten und Zeugnisse (nur falls Frage 5 sie verlangt); Aktivitätsprotokoll sichtbar für Leitung (M1); Suche und Filter (M1, M2); Datenexport einer Schule (M8); Support-Weg für Schulen (M8).
- **Ungeprüft:** Serverzustand, Datenablage der Testumgebung, Sicherungen, Dauer des Pilot-Betriebs (siehe §9).

## 9. Ungeprüftes, das früh geklärt werden muss

1. Wo liegt die PGlite-Datenbank auf dem Server, und überlebt sie Deploys und Neustarts?
2. Laufen beim Neustart kurz zwei App-Prozesse auf demselben Datenordner?
3. Wie holt der Cronjob das Paket (mit oder ohne Anmeldung), und funktioniert das nach dem Privatstellen?
4. Gibt es irgendeine Sicherung, und lässt sie sich wiederherstellen?
5. Sind die zufälligen Next.js-Schlüssel im öffentlichen Zweig `deploy` sicherheitsrelevant für uns (Server-Aktionen)? Plan: privat stellen und neu bauen.
6. Wo steht der Hoster, gibt es einen Auftragsverarbeitungsvertrag?
7. Funktioniert der E-Mail-Versand mit einem echten Server? (Auf der Testumgebung zeigt `REGISTRATION_SHOW_LINK` den Bestätigungslink auf der Seite an; das ist nur dort zulässig.)
8. Welche Rechte hat die Auslieferungs-Pipeline (`deploy.yml` läuft bei Pull Requests mit Schreibrecht)?

## 10. Begriffe

- **Zeilensicherheit (RLS):** Die Datenbank selbst erlaubt jeder Schule nur ihre eigenen Zeilen, auch wenn der Programmcode einen Fehler hätte.
- **PGlite:** eine kleine eingebettete Datenbank, die auf der Testumgebung läuft, weil das Hosting-Paket keinen Datenbankserver hat. Sie verträgt nur einen Prozess. Für den echten Betrieb ist PostgreSQL vorgesehen.
- **Migration:** eine versionierte Änderung am Aufbau der Datenbank. *Additiv* heißt: nur Neues kommt hinzu, nichts wird verändert oder gelöscht.
- **CI:** die automatische Prüfung auf GitHub bei jeder Änderung (Typprüfung, Tests, Paketbau, später Geheimnissuche).
- **Zweigschutz:** eine GitHub-Einstellung, die Direktänderungen an `main` technisch verbietet. Derzeit nicht aktiv.
- **Deploy:** das Ausliefern eines Stands auf die Testumgebung. Passiert automatisch nach einem Merge auf `main`.
- **UE:** Unterrichtseinheit (45 Minuten).
