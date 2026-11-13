# Backlog Kurswerk (Entwurf zur Freigabe)

Stand: 13.11.2026. Gehört zu `ZIEL.md` (Produktumfang und Ist-Stand). **Nichts hiervon ist aktiv.** Es gibt noch keine autonome Ausführung. Fatih gibt **Meilensteine** frei, nicht einzelne Aufgaben.

## 1. So wird gelesen und freigegeben

**Meilenstein-Freigabe.** Wirksam ist eine Freigabe erst, wenn sie in `docs/produkt/FREIGABEN.md` steht und diese Änderung von Fatih gemergt wurde (AUTONOMIE.md §3; technisch prüfbar ist „von Fatih“ erst mit eigenem Agentenkonto, bis dahin gilt §3a); eine Zusage im Chat beauftragt nur den Eintrag. Mit einer wirksamen Freigabe „M1“ darf die Entwicklung den Meilenstein selbst in Aufgaben zerlegen, die Aufgaben umsetzen, prüfen, reviewen und in einem gemeinsamen Meilenstein-Zweig sammeln, ohne dass jemand „weiter“ sagen muss. Die Aufgabenlisten unten sind der Startpunkt und sind der Startpunkt. Unteraufgaben und Verfeinerungen innerhalb des Meilensteinziels stehen in `STATUS.md`. `BACKLOG.md`, `ZIEL.md` und `AUTONOMIE.md` ändert nur Fatih über einen Pull Request nach `main`; die Aufgabenwahl liest sie ausschließlich von `main`. Die Freigabe darf eine Startreihenfolge nennen (z. B. die Demonstrationsaufgaben M1-07, M1-08); ohne Nennung gilt die Reihenfolge unten. Aufgaben der Klasse A/B hinter einem Vorgänger der Klasse C warten, bis dieser fertig ist (betrifft z. B. M3-05, M5-03, M8-07, M8-09, M9-04).

**Meilenstein-Zweig.** Jeder Meilenstein bekommt einen Zweig `meilenstein/mN-…`. Aufgaben laufen auf eigenen Zweigen `task/mN-NN-…` und gehen per Pull Request in den Meilenstein-Zweig. Dort darf bei grüner CI und bestandenem unabhängigem Review ohne Rückfrage zusammengeführt werden. Ein Push auf einen Meilenstein- oder Task-Zweig löst **keinen Deploy** aus (belegt: `deploy.yml` legt das Paket nur bei Push auf `main` auf den Zweig `deploy`). **Aber:** `deploy.yml` läuft auch bei jedem Pull Request, ohne Zweigfilter und mit Schreibrecht auf das Repository, und nimmt die Workflow-Datei aus dem Stand des Pull Requests. Ein Pull Request, der `deploy.yml` ändert, könnte daher den Zweig `deploy` selbst überschreiben. **Darum gilt bis M0-04 erledigt ist:** Pull Requests mit Änderungen an `.github/` oder `deploy/` werden nie ohne Fatihs Freigabe zusammengeführt, und Läufe laufen höchstens beaufsichtigt. Am Ende steht **ein** Pull Request `meilenstein/mN → main` mit Zusammenfassung in einfacher Sprache, Bildschirmfotos, Testergebnissen, Review-Ergebnissen und offenen Risiken. **Fatih merged diesen einen Pull Request** (und löst damit den Deploy auf die Testumgebung aus).

**Was die Freigabe eines Meilensteins ausdrücklich mit abdeckt.** Nur das, was im Meilenstein unter „Freigegebene Rechte- und Datenbankänderungen“ steht. Das sind die einzigen Rechteänderungen und Migrationen, die ohne weitere Rückfrage gebaut werden dürfen. Alles Weitere ist ein Stopp-Punkt (Abschnitt 3).

**Risikoklassen.**
- **A:** Oberfläche, Fachlogik ohne Datenbankänderung, Tests, Doku. Wird gebaut und im Meilenstein-Zweig zusammengeführt.
- **B:** berührt Rechte, Anwesenheit/Nachweise, Authentifizierung oder die Datenbank (nur *additive* Migrationen: neue Tabellen mit Zeilensicherheit und Tests, neue optionale Spalten). Wird gebaut, braucht zusätzlich ein Sicherheitsreview durch einen frischen Agenten, und die Punkte stehen im Meilenstein-Pull Request gesondert.
- **C:** Stopp-Punkt, nie ohne ausdrückliche Freigabe: Zugangsdaten, Deploy-/Infrastrukturkonfiguration, Produktionsdaten, zerstörende oder datenverändernde Migrationen, Sicherheitsarchitektur, neue externe Dienste und Kosten, Rechtstexte, Versand an Dritte (z. B. BAMF).

**Aufgabenkopf.** `ID · Risiko · abhängig von · Akzeptanz`. „Akzeptanz“ ist prüfbar (Test, Browserablauf, Ausgabe). Jede Aufgabe gilt erst als fertig, wenn `npx tsc --noEmit`, `npx vitest run`, `npm run build` grün sind, Nutzerabläufe im Browser geprüft wurden und ein unabhängiger Review „BEREIT“ sagt.

## 2. Reihenfolge und Abhängigkeiten

```
M0 Fundament ──► M1 Verwaltung ──► M2 Kursraum & Lernen ──► M3 Material ──► M4 Übungen
                                         │
                                         └──► M5 Live-Raum (braucht Entscheidung zu LiveKit-Hosting)
                       M2 ──► M6 Kommunikation & Bescheinigungen
              M1, M5 ──► M7 BAMF-Baustein (optional je Schule)
   Pilot:  M0–M3 ──► M8 Pilotreife        Produktion: zusätzlich M4, M5, M6 ──► M9 Betreiber & Abo (erst nach Frage 1)
```

M0 ist die Bedingung für **jeden** unbeaufsichtigten Lauf. Die übrigen Meilensteine folgen Fatihs Prioritäten: erst vollständige Schulverwaltung und Unterrichtsablauf, dann Material, Übungen, Klassenraum.

---

## M0 Betriebs- und Sicherheitsfundament

**Ziel:** Ein Merge darf keine Daten gefährden, die Pipeline kann nicht missbraucht werden, es gibt Sicherungen, die Regeln sind technisch durchgesetzt wo möglich, und die autonome Ausführung ist an einem beaufsichtigten Meilenstein erprobt.
**Freigegebene Rechte- und Datenbankänderungen:** die unter M0-08 beschlossenen Änderungen der Rechtetabelle (nach Entscheidung durch Fatih); keine Migration.


**Steckbrief.**
- **Erlebnis:** Fatih sieht: Änderungen können nicht unbemerkt live gehen, die Daten sind gesichert, und die Entwicklungsmaschine arbeitet nachvollziehbar.
- **Umfang:** M0-01 bis M0-14.
- **Ausgeschlossen:** Keine neuen Funktionen für Schulen; kein Umzug der Datenbank (M8-01); kein Wechsel des Hosters.
- **Mandanten und Sicherheit:** Mandantentrennung unverändert; Rechte nur laut M0-08; keine Geheimnisse im Repository oder in Logs; jede Schutzmaßnahme wird durch einen Gegenversuch belegt, nicht nur beschrieben.
- **Fertig, wenn:** Alle Punkte des M0-Ausgangs erfüllt; je Punkt ein Beleg (Ausgabe, Einstellungsabfrage, Testlauf) im Pull Request.

- **M0-01 Server-Prüfung durchführen** · C · — · Fatih führt `deploy/server-pruefung.sh` im cPanel-Terminal aus (Pull Request #24, Befehl mit Prüfsumme dort). Akzeptanz: Ausgabe liegt vor; Auswertung steht in `docs/betrieb.md`: Abrufweg, Anmeldung, Datenordner-Lage, Prozessanzahl, Sicherungen.
- **M0-02 Offene Pull Requests #23–#26 abschließen** · C (Merge durch Fatih) · M0-01 · Akzeptanz: #23 (Geheimnissuche, Paketprüfung, Migrationsprüfung), #24 (Betriebsdoku, Prüfskript), #25 (Skills), #26 (Datenbank-Pool-Fix) gemergt oder bewusst verworfen; nach jedem Merge Deploy-Folge geprüft.
- **M0-03 Zweigschutz für `main`** · C · — · Tarif in GitHub Settings > Billing prüfen (laut GitHub-Dokumentation gibt es Schutz bei Free nur für öffentliche Repos; der Tarif selbst ist noch nicht bestätigt). Die Entscheidung zwischen (a) und (b) fällt vor Beginn von M0-03 und wird in M0-05 umgesetzt: (a) Schutz jetzt einschalten, solange das Repo öffentlich ist, und erst mit bezahltem Tarif privat stellen; (b) Pro-Tarif zuerst. Die Regel muss **auch für Administratoren gelten**, sonst bindet sie ein Agent mit Fatihs Zugang nicht. **Ein Ruleset auf `deploy` darf den Auslieferungsschritt nicht blockieren:** `deploy.yml` schreibt dort per Force-Push; ob eine Ausnahme für GitHub Actions möglich ist, ist ungeprüft und wird in M0-03 mit Gegenprobe des Auslieferungsschritts geklärt, sonst schützt das Ruleset nur `main`. **Gegen mein eigenes Konto wirkt das Ruleset erst mit eigenem Agentenkonto** (AUTONOMIE.md §7a). Akzeptanz: Direkt-Push und Force-Push auf `main` werden von GitHub abgelehnt; Pull Request mit grünen Prüfungen verpflichtend; Nachweis per Abfrage der Schutzregeln und einem abgelehnten Test-Push auf einen geschützten Wegwerfzweig. **Ohne diesen Schutz sind alle Aussagen „darf nicht mergen“ nur Absprache.**
- **M0-04 Rechte der Auslieferung begrenzen** · C · — · Wird zuerst ausgeführt, unabhängig von M0-03. `deploy.yml` läuft bei Pull Requests mit Schreibrecht. Akzeptanz: Pull-Request-Läufe haben nur Leserecht; Schreibrecht nur im Auslieferungsschritt nach Merge auf `main`; nachgewiesen durch Lesen der Konfiguration und einen Probe-Pull-Request.
- **M0-05 Privates Repo mit lesendem Server-Zugang** · C · M0-01, M0-03, M0-04 · Lesender Zugang (Deploy-Schlüssel oder eng begrenztes Token) vorbereitet und **vor** dem Umstellen getestet; kein Geheimnis im Repo, in Logs oder im Paket. Danach Repo privat und Neubau, damit die Next.js-Schlüssel im öffentlichen Zweig `deploy` ersetzt sind. Akzeptanz: Abruf läuft mit Anmeldung nach dem Privatstellen; alter `deploy`-Verlauf nicht mehr öffentlich.
- **M0-06 Datenbeständigkeit belegen** · C · M0-01 · Akzeptanz: Datenordner liegt außerhalb des Programmordners und wird von keinem Abruf berührt; Testdatensatz überlebt Deploy und Neustart; Überlappung zweier Prozesse beim Neustart geprüft und gelöst.
- **M0-07 Sicherung und Wiederherstellung** · C · M0-06 · Sicherungsverfahren (ruhende Kopie der PGlite-Daten, später `pg_dump`), Aufbewahrung, Zeitplan. Akzeptanz: Wiederherstellung auf einer **Kopie** erfolgreich getestet; Ablauf dokumentiert; Wiederherstellungszeit gemessen.
- **M0-08 Befunde zu `permissions.ts` entscheiden und beheben** · B (Rechteänderung, Entscheidung durch Fatih) · – · Teile: (a) Verwaltung sieht Einladungslinks von Teilnehmenden (bisher bewusste Entscheidung, weil damit ein Konto übernommen werden könnte: bestätigen oder ändern); (b) Verwaltung kann bestätigte Anwesenheit in allen Kursen korrigieren; (c) `startsOn/endsOn` der Einschreibung wird bei Aufgaben ignoriert; (d) Startprüfung, dass die Datenbankrolle weder Superuser noch `BYPASSRLS` ist; (e) Fehlerabbildung in `createAssignmentAction` und `feedbackAction`. Akzeptanz: je Teil Entscheidung dokumentiert, Test erst rot dann grün, Rechte-Matrix als Test festgeschrieben, Sicherheitsreview BEREIT.
- **M0-09 Lokale Sicherheits-Hooks (Stufe 3)** · C (neue Dateien in `.githooks/` und `scripts/`) · M0-02 · Hooks blockieren nie, wenn Werkzeuge fehlen; CI ist verbindlich. Akzeptanz: Test in frischem Klon mit und ohne gitleaks.
- **M0-10 Unveränderliche Regeln als Tests (Stufe 4)** · B · M0-08 · Rechte-Matrix, `canManageAccountOf`/`canAddPerson`, Mandantentrennung je Tabelle (Meta-Test), Datenbankrolle, Unveränderlichkeit. Akzeptanz: Mutationsprobe zeigt, dass jede Regel einen Test bricht.
- **M0-11 Freigabematrix und Abschlussbericht in `CLAUDE.md` (Stufe 5)** · C (Arbeitsregeln) · — · Bestehende Anweisungen bleiben erhalten; Zweigpräfixe `task/` und `meilenstein/` und der Ablauf mit Meilenstein-Zweig werden ergänzt; die Regel „kein Merge durch den Agenten“ gilt weiter, bis M0-14 und eine wirksame Freigabe vorliegen; veraltete Angaben (z. B. „Next.js 15“, tatsächlich 16) werden korrigiert. Akzeptanz: Fatih hat den Wortlaut freigegeben (festgehalten nach AUTONOMIE.md §3a, sonst Freigabe nicht wirksam); Pilotschule als „vorgeschlagen, nicht bestätigt“ geführt.
- **M0-12 README und Betriebsdoku aktualisieren** · A · — · README beschreibt den realen Stand; Befehle stimmen. Akzeptanz: frischer Klon folgt dem README bis zur laufenden App.
- **M0-13 Browser-Testgerüst** · C (neue CI-Schritte in `.github/`, neue Abhängigkeit) · M0-04 · **Nicht Bedingung für Läufe**; bis dahin liefern Browserdurchgänge per Browserwerkzeug mit Bildschirmfotos den Beleg.  Grundablauf (Registrieren, Anmelden, Person anlegen, Kurs anlegen, Aufgabe abgeben) automatisiert im Browser. Akzeptanz: läuft lokal und in der CI; Bildschirmfotos als Beleg; falls in der Umgebung nicht möglich, ist das Ergebnis eine dokumentierte Ersatzlösung mit Fatihs Kenntnisnahme.
- **M0-14 Ausführungssystem einrichten** · C · M0-03, M0-04, M0-08, M0-10, M0-11 · Einstellungen, Sperren, Budgets, Zustandsdateien, Meilenstein-Zweig-Ablauf konfiguriert (Abschnitt 4). Akzeptanz: Konfiguration getestet an einer Probeaufgabe ohne Auswirkung; Sperren nachweislich wirksam (ein verbotener Befehl wird abgelehnt). **Sonderregel:** M1 läuft als erster, **beaufsichtigter** Meilenstein; erst wenn Fatih dessen Ergebnis gesehen hat, gibt er längere unbeaufsichtigte Läufe frei (festgehalten in `FREIGABEN.md` über seinen Merge). Zu M0-14 gehören auch `next-task`, `preflight`, `test-integrity`, Statusdateien und Reviewer-Anweisung (AUTONOMIE.md §12.1).

**M0-Ausgang (Bedingung für Läufe überhaupt):** M0-04 (zuerst), M0-03, M0-08, M0-10, M0-11, M0-14 erledigt (die Kette ist ohne M0-01, M0-02 und M0-13 erfüllbar) (Entwicklung auf dem Meilenstein-Zweig). **Merge-Regel:** PR #27 und die Konfigurations-Pull-Requests von M0 (M0-03, M0-04, M0-11, M0-14) werden einzeln mit einer Entscheidung „Merge erlaubt“ nach AUTONOMIE.md §3a gemergt; der dadurch ausgelöste Bau und die Veröffentlichung im Zweig `deploy` werden bewusst in Kauf genommen. **Zusätzlich vor dem Merge eines Meilenstein-Pull-Requests mit Produktcode nach `main`, vor jeder Auslieferung für echte Nutzung und vor dem Pilot:** M0-01, M0-02, M0-05, M0-06, M0-07. **Bedingung für unbeaufsichtigte Läufe:** zusätzlich M1 beaufsichtigt abgeschlossen und von Fatih gesehen. Bis dahin arbeitet die Entwicklung höchstens an Aufgaben, die keinen Server-, Deploy- oder Rechtekontakt haben, und nur beaufsichtigt.

---

## M1 Schulverwaltung vollständig

**Ziel:** Eine Schule kann Personen, Kurse, Zuordnungen und Termine im Alltag vollständig selbst verwalten, ohne Datenbankzugriff oder Betreiber.
**Freigegebene Rechte- und Datenbankänderungen:** neue Rechte `person.manage` (Leitung: Rolle ändern, deaktivieren; Verwaltung: Stammdaten von Teilnehmenden ändern) und `session.reschedule` (Leitung, Verwaltung). **Migrationen:** nur additiv, soweit nötig: Absagegrund an Terminen; Tabelle `rooms` mit Raumzuordnung an Kursen/Terminen (M1-11, Frage 10 ist vorläufig entschieden); Leserecht `activity.read` (Leitung) für das Aktivitätsprotokoll (M1-12); Erweiterung der Unterrichtsform um `HYBRID`; neue optionale Spalten an `organizations` für Kontakt, Zeitzone und Standard-UE-Länge.


**Steckbrief.**
- **Erlebnis:** Leitung und Verwaltung richten eine Schule vollständig ein und pflegen sie im Alltag: Personen, Kurse, Einschreibungen, Termine, ohne Betreiber oder Datenbankzugriff.
- **Umfang:** M1-01 bis M1-13.
- **Ausgeschlossen:** Interessenten/Anmeldeformular, Warteliste, Anmeldeformular für Präsenz, persönlicher Stundenplan für Lehrkräfte und Teilnehmende (M6-06), Abrechnung gegenüber Teilnehmenden, Logo, Betreiberbereich.
- **Mandanten und Sicherheit:** Jede neue Abfrage hat einen Test „Schule A sieht nie Daten von Schule B“; Rechte-Matrix-Test; deaktivierte Personen haben keinen Zugang; jede Änderung im Audit; Nachweise werden nie gelöscht.
- **Fertig, wenn:** Browserdurchgang für alle vier Rollen ohne offenen Fehler; tsc, vitest, build grün; Reviews BEREIT; Pull Request mit Bildschirmfotos.

- **M1-01 Bestand im Browser prüfen** · A · — · Ablauf Registrieren → Bestätigen → Einladen → Personen → Kurs → Heute für alle vier Rollen durchgespielt. Akzeptanz: Fehlerliste als Unteraufgaben in `STATUS.md` (nicht in `BACKLOG.md`); Bildschirmfotos.
- **M1-02 Personen bearbeiten und deaktivieren** · B · M1-01 · Name, E-Mail, Rolle ändern (nur Leitung, nur zwischen Teilnehmende, Lehrkraft, Verwaltung; **keine weitere Leitung**, wie in `ADDABLE_ROLES` bewusst festgelegt), deaktivieren und wieder aktivieren. Die letzte Leitung kann sich weder herabstufen noch deaktivieren. Akzeptanz: deaktivierte Person kann sich nicht anmelden und erscheint in Listen als inaktiv; Rolle ändert Rechte sofort; Verlauf bleibt im Audit; Tests für Schul-übergreifenden Zugriff und Rechte-Matrix.
- **M1-03 Kurs bearbeiten und archivieren** · B · M1-01 · Name, Beschreibung, Niveau, Modus, Zeitraum ändern; Archivieren und Wiederherstellen. Akzeptanz: Änderung an Terminen mit bestätigter Anwesenheit wird verhindert oder begründet; archivierte Kurse sind schreibgeschützt.
- **M1-04 Kursdetail** · A · M1-03 · Seite mit Teilnehmenden, Lehrkräften, Terminen, Verlauf. Akzeptanz: Verwaltung und Leitung sehen alles, Lehrkräfte nur eigene Kurse.
- **M1-05 Einschreibungen und Lehrkräfte verwalten** · B · M1-03, M0-08 · Teilnehmende hinzufügen/entfernen, Eintritts- und Austrittsdatum, Kurswechsel, Lehrkraft wechseln. Akzeptanz: Daten wirken auf Aufgaben, Anwesenheit und Sichtbarkeit; keine Löschung von Nachweisen; Tests für Mandantentrennung.
- **M1-06 Termine verwalten** · B · M1-03 · Termin verschieben, absagen (mit Grund), nachholen, einzeln hinzufügen. Akzeptanz: beendete/bestätigte Termine unveränderlich; Absage sichtbar für Betroffene; UE-Regeln (BAMF-Schalter) weiter geprüft.
- **M1-07 Personenliste: Suche, Filter, Sortierung, Seiten** · A · — · Reine Lese-Ansicht: neue Fachfunktion ohne Datenbank in `src/domain/` (Suche in Name/E-Mail, Filter nach Rolle und Zugangsstatus, Sortierung, Seiten) und Anbindung in `src/app/verwaltung/personen/page.tsx` über Adressparameter; keine Änderung an `permissions.ts`, `auth.ts`, Schema oder Migrationen. Akzeptanz: 500 Personen sind bedienbar; Tests der Fachfunktion (Umlaute, Groß-/Kleinschreibung, leere Treffer, Seitengrenzen); Test, dass nur die vom bestehenden Recht gelieferten Personen erscheinen (Schule B sieht nie Personen von Schule A); Browser: Suche, Filter und Blättern auf Desktop und 360 px. **Vorgesehene Demonstrationsaufgabe der ersten betreuten Ausführung** (AUTONOMIE.md §12).
- **M1-08 Import verbessern** · A · M1-07 · **Zweite Demonstrationsaufgabe** (Abhängigkeit nur der Reihenfolge wegen: gleiche Dateien). Vorschau, Fehlerliste mit Zeilen, Dublettenerkennung. Akzeptanz: fehlerhafte Datei ändert nichts; Fehlermeldungen in einfacher Sprache.
- **M1-09 Schulprofil und Einstellungen** · B (Migration) · M1-01 · Schulname, Kontakt, Zeitzone, Standard-UE-Länge; das Logo folgt in M3-07. Akzeptanz: Änderungen protokolliert; nur Leitung.
- **M1-10 E-Mail-Texte und Zustellfehler** · A · M1-01 · Vorlagen für Einladung, Passwort, Absage; sichtbare Fehler bei Zustellproblemen. Akzeptanz: Texte geprüft; echter Versand bleibt Stopp-Punkt (M8-03).
- **M1-11 Räume und Kapazität für Präsenz- und Mischkurse** · B (Migration) · M1-03, Frage 10 · Raum mit Name und Plätzen je Schule; Unterrichtsform Präsenz, Online **oder Mischform** (Erweiterung der Auswahl `delivery_mode` um `HYBRID`, additive Migration); Kurs/Termin kann einen Raum haben; Kapazität gegen Einschreibungen geprüft; Doppelbelegung von Raum und Lehrkraft wird beim Anlegen und Verschieben von Terminen **verhindert** (nicht nur gewarnt), mit klarer Meldung. Die Unterrichtsform ist an allen Stellen berücksichtigt, an denen sie heute fest verdrahtet ist (`courses.ts`, `teaching.ts`, `overview.ts`, Seite „Heute“, Anzeigetexte). Annahme, bis M7-04 geprüft ist: Mischform zählt nicht als virtueller Unterricht für die BAMF-Zählung und ist so gekennzeichnet. Akzeptanz: Mandanten- und Rechte-Test; Konflikt-Tests (Raum, Lehrkraft, Randzeiten, Kapazität voll); Meldung im Browser sichtbar. Selbstanmeldung und Warteliste folgen später, falls der Pilot sie nicht verlangt.
- **M1-12 Aktivitätsprotokoll für die Leitung** · A · M1-02 · Wer hat wann was geändert (Personen, Kurse, Einschreibungen), nur lesbar, nur für Leitung. Akzeptanz: jede Verwaltungsaktion aus M1-02 bis M1-06 erscheint; Rechte-Test; kein Zugriff über Schulgrenzen.
- **M1-13 Stundenplan für Verwaltung** · A · M1-11, M1-06 · Wochenansicht je Raum, Lehrkraft und Kurs für Leitung und Verwaltung (nur Lesen), mit sichtbaren Konflikten. Akzeptanz: 20 Termine in 3 Räumen korrekt dargestellt; Lehrkräfte sehen nur ihre eigenen Termine (Rechte-Test); Schule B sieht nichts von A.

---

## M2 Kursraum und Lernablauf

**Ziel:** Teilnehmende und Lehrkräfte arbeiten im Alltag in einem Kursraum: sehen, was als Nächstes ansteht, bearbeiten Aufgaben, finden Informationen. Die Oberfläche bekommt ein einheitliches Designsystem als Grundlage.
**Freigegebene Rechte- und Datenbankänderungen:** keine neuen Rechte (bestehende `course.participate`, `session.teach`, `assignment.*` genügen). **Migrationen:** additiv: neue Tabelle für Benachrichtigungen, Erinnerungszustand an Aufgaben. (Fristen selbst gibt es schon.)


**Steckbrief.**
- **Erlebnis:** Teilnehmende öffnen „Mein Lernen“ und sehen sofort, was als Nächstes ansteht; Lehrkräfte arbeiten in einem Kursraum mit allem Nötigen.
- **Umfang:** M2-01 bis M2-08.
- **Ausgeschlossen:** Material, Übungen, Live-Raum, Nachrichten, Zertifikate.
- **Mandanten und Sicherheit:** Kursraum nur für zugeordnete Personen (Test mit Fremd- und Nachbarschule); Benachrichtigungen nur für Betroffene; Lösungen und fremde Abgaben nie sichtbar; keine neuen Rechte.
- **Fertig, wenn:** Reiter, Startseiten und Handyansicht (360 px) im Browser geprüft; Kontrastprüfung bestanden; Tests und Reviews grün.

- **M2-01 Designsystem-Grundlage** · A · M1-01 · Farben, Schrift, Abstände, Komponenten (Knöpfe, Formulare, Tabellen, Karten, Hinweise, Reiter) als gemeinsame Bausteine; keine Einzel-Stile mehr in neuen Seiten. Akzeptanz: Bildschirmfotos aller Seiten vor/nach; Kontrastprüfung bestanden.
- **M2-02 App-Rahmen und Startseiten je Rolle** · A · M2-01 · Teilnehmende: „Mein Lernen“ (nächster Termin, fällige Aufgaben, Neues). Lehrkraft: „Heute und Offenes“. Verwaltung/Leitung: wie „Heute“. Akzeptanz: Browserablauf je Rolle.
- **M2-03 Kursraum mit Reitern** · A · M2-02 · Reiter Übersicht, Aufgaben, Teilnehmende, später Material/Live; Reiter „Anwesenheit“ nur bei aktivem BAMF-Schalter. Akzeptanz: nicht zugeordnete Personen sehen den Raum nicht (Test).
- **M2-04 Aufgaben ausbauen** · B · M2-03 · Frist nachträglich ändern, Status je Person, Liste je Kurs, Aufgabe bearbeiten/zurückziehen, Hinweise für Lehrkraft. Akzeptanz: Abgaben und Rückmeldungen bleiben unveränderlich; Tests; Rechte unverändert.
- **M2-05 Lehrkraft-Arbeitsplatz** · A · M2-03 · offene Abgaben, Kursübersicht, Termin vorbereiten. Akzeptanz: Browserablauf mit Beispieldaten.
- **M2-06 Benachrichtigungen in der App** · B · M2-04 · Hinweise für neue Aufgabe, Rückmeldung, abgesagten Termin. Akzeptanz: nur Betroffene sehen sie; als gelesen markierbar; Tests.
- **M2-07 Handy-Tauglichkeit** · A · M2-02 · alle Teilnehmenden-Seiten bis 360 px bedienbar. Akzeptanz: Bildschirmfotos bei 360/768/1280 px.
- **M2-08 Texte für Mehrsprachigkeit vorbereiten** · A · M2-01 · Texte zentral statt verstreut (Frage 8). Akzeptanz: eine Sprache vollständig, Wechsel technisch möglich.

---

## M3 Kursmaterial und Dateien

**Ziel:** Lehrkräfte stellen Material strukturiert bereit; Teilnehmende finden es im Kursraum. Dateien (auch in Abgaben) sind sicher abgelegt.
**Freigegebene Rechte- und Datenbankänderungen:** neues Recht `material.manage` (Lehrkraft eigener Kurs, Verwaltung, Leitung). **Migrationen:** additiv: Material, Abschnitte, Dateien, Anhänge an Abgaben (jede Tabelle mit `organization_id`, Zeilensicherheit, Mandantentest).


**Steckbrief.**
- **Erlebnis:** Lehrkräfte legen Material strukturiert an, Teilnehmende finden es im Kursraum und geben Dateien oder Sprachaufnahmen ab.
- **Umfang:** M3-01 bis M3-07.
- **Ausgeschlossen:** Eigenes Video-Hosting oder Streaming, Aufnahmen des Live-Raums, Virenscanner-Betrieb (wird als offene Frage geführt, falls der Speicher es verlangt).
- **Mandanten und Sicherheit:** Dateien nur über eine Rechte-Prüfung abrufbar, nie über öffentliche Links; pro Schule getrennte Ablage; Größen- und Typgrenzen; bösartige Dateinamen getestet.
- **Fertig, wenn:** Speicherentscheidung von Fatih liegt vor; Browserablauf Hochladen, Ansehen, Abgeben bestanden; Mandanten- und Rechte-Tests grün.

- **M3-01 Entscheidung zur Dateiablage** · C · Frage 7 · Optionen mit Kosten, Standort EU, Größenlimits, Datenschutz; empfohlene Variante. Akzeptanz: Fatih hat gewählt (festgehalten nach AUTONOMIE.md §3a). Davor: nur Datenmodell und Oberfläche mit lokaler Testablage.
- **M3-02 Datenmodell Material** · B · M2-03 · Abschnitt/Lektion → Einträge (Text, Datei, Link, Audio, Video-Link), Reihenfolge, Sichtbarkeit (Entwurf/veröffentlicht, ab Datum). Akzeptanz: Mandanten- und Rechtetests.
- **M3-03 Editor für Lehrkräfte** · A · M3-02 · Anlegen, ordnen, verbergen, löschen (weich). Akzeptanz: Browserablauf.
- **M3-04 Ansicht für Teilnehmende** · A · M3-02 · Reiter „Material“ im Kursraum, Suche. Akzeptanz: Entwurf und fremder Kurs nicht sichtbar (Test).
- **M3-05 Dateiverarbeitung** · B · M3-01 · Größen-/Typprüfung, Namen bereinigen, Download nur mit Rechte-Prüfung, kein öffentlicher Link. Akzeptanz: Tests mit bösartigen Dateinamen/Typen.
- **M3-06 Anhänge und Sprachaufnahmen in Abgaben** · B · M3-05, M2-04 · Frage 9. Akzeptanz: Aufnahme im Browser möglich; Version unveränderlich; Größenlimit.
- **M3-07 Schul-Logo und Profilbilder** · A · M3-05, M1-09 · Akzeptanz: Bild erscheint in Kopfzeile und auf Bescheinigungen; falsche Typen/Größen abgelehnt (Test).

---

## M4 Übungen mit automatischer Auswertung

**Ziel:** Lehrkräfte erstellen Übungen; Teilnehmende bearbeiten sie, bekommen sofort Ergebnis und Rückmeldung; Lehrkräfte sehen den Lernstand.
**Freigegebene Rechte- und Datenbankänderungen:** neues Recht `exercise.manage` (wie Material). **Migrationen:** additiv: Übungen, Aufgabenpunkte, Versuche, Antworten.


**Steckbrief.**
- **Erlebnis:** Teilnehmende üben, sehen sofort ihr Ergebnis und eine Rückmeldung; Lehrkräfte sehen den Lernstand ihrer Kurse.
- **Umfang:** M4-01 bis M4-08.
- **Ausgeschlossen:** Automatische Bewertung freier Texte oder Sprache durch KI, adaptive Lernpfade, Prüfungsmodus, gemeinsame Übungsbibliothek für alle Schulen (späterer Meilenstein nach M9, eigener Entwurf).
- **Mandanten und Sicherheit:** Bewertung ausschließlich auf dem Server; Musterlösungen gelangen nie vor der Abgabe in den Browser; fremde Antworten nie sichtbar.
- **Fertig, wenn:** Fatih hat die Beispiele je Übungstyp fachlich bestätigt; Tabellentests der Bewertung inklusive Randfälle grün; Browserdurchgang als Lernende und Lehrkraft.

- **M4-01 Fachliche Spezifikation der Übungstypen** · A · Frage 2 · (vorläufig entschieden) je Typ: Aufbau, Bewertungsregeln, Teilpunkte, Umgang mit Tippfehlern/Groß-Kleinschreibung/Umlauten, Beispiele. Akzeptanz: **Fatih prüft die Beispiele inhaltlich** (das ist der eine fachliche Prüfpunkt des Meilensteins).
- **M4-02 Bewertungslogik ohne Datenbank** · A · M4-01 · reine Funktionen in `src/domain/`. Akzeptanz: Tabellentests je Typ inklusive Randfälle.
- **M4-03 Datenmodell** · B · M4-02 · Akzeptanz: Mandanten- und Rechtetests; Migration additiv, zweimal ausführbar auf frischer und gefüllter Datenbank.
- **M4-04 Editor** · A · M4-03, M2-01 · Vorschau, Duplizieren, Entwurf/Veröffentlichung. Akzeptanz: Browserablauf: Übung je Typ anlegen, Vorschau, veröffentlichen.
- **M4-05 Bearbeiten durch Teilnehmende** · A · M4-03 · Sofortergebnis, Wiederholen, Fortschritt. Akzeptanz: Antworten anderer nie sichtbar (Test); Versuche begrenzbar.
- **M4-06 Ergebnisse für Lehrkräfte** · A · M4-05 · je Person und Übung, häufige Fehler. Akzeptanz: nur eigene Kurse.
- **M4-07 Lernfortschritt im Kursraum** · A · M4-05, M2-03 · Akzeptanz: Teilnehmende sehen nur eigenen Fortschritt, Lehrkräfte den ihrer Kurse (Test).
- **M4-08 Übungen aus Vorlage/CSV importieren** · A · M4-04 · optional, nur wenn Zeit bleibt · Akzeptanz: fehlerhafte Datei ändert nichts; Fehlerliste mit Zeilen.

---

## M5 Live-Klassenraum

**Ziel:** Kurse treffen sich in einem eigenen Raum in Kurswerk, ohne Fremdanbieter.
**Freigegebene Rechte- und Datenbankänderungen:** keine neuen Rechte (Raum nutzt `session.teach` / `course.participate`). **Migrationen:** additiv, soweit für Raumzustand nötig.


**Steckbrief.**
- **Erlebnis:** Ein Kurs trifft sich im eigenen Klassenraum in Kurswerk, ohne Fremdanbieter.
- **Umfang:** M5-01 bis M5-07.
- **Ausgeschlossen:** Aufnahme, Streaming an Dritte, Whiteboard und Gruppenräume (Frage 4: vorläufig ausgeschlossen), Telefoneinwahl.
- **Mandanten und Sicherheit:** Zugangsberechtigung kurzlebig, serverseitig, nur für zugeordnete Personen und nur zum Termin; Schlüssel nie im Browser, Repository oder Log; Einwahlprotokoll nur vom System geschrieben.
- **Fertig, wenn:** Bericht zur LiveKit-Prüfung und Entscheidung von Fatih; Test mit mindestens zwei Browsern; Lasttest mit der Pilotgröße; Datenfluss-Skizze von Fatih gesehen.

- **M5-01 Technische Prüfung LiveKit** · C · Frage 4, Frage 7 · Kosten, Hosting (Namecheap Shared kann keinen Medienserver betreiben), Standort EU, Teilnehmerzahl, Alternativen. Akzeptanz: Bericht mit Empfehlung; Fatih entscheidet (festgehalten nach AUTONOMIE.md §3a).
- **M5-02 Isolierter Prototyp** · C (Testserver, Schlüssel, Kosten) · M5-01 · nur mit Testserver und erfundenen Daten. Akzeptanz: zwei Browser verbinden sich, Ton und Bild laufen.
- **M5-03 Raum im Kursraum** · B (Code; echte Schlüssel und Server: C, legt Fatih an) · M5-02, M2-03 · Zugangsberechtigung wird serverseitig vergeben (kurzlebig, nur für zugeordnete Personen, nur zum Termin). Akzeptanz: Fremde und nicht zugeordnete Personen bekommen keinen Zugang (Test); kein Schlüssel im Repository.
- **M5-04 Einwahl wird ins Protokoll geschrieben** · B · M5-03 · nur bei aktivem BAMF-Schalter; Ereignisse nur vom System (A1, A2, A3). Akzeptanz: Protokoll-Tests, Dublettenschutz, Verbindungsabbruch.
- **M5-05 Funktionen im Raum** · A · M5-03 · Bildschirm teilen, Chat, Hand heben, Lehrkraft kann stummschalten/entfernen. Akzeptanz: Browserablauf mit mehreren Personen.
- **M5-06 Fehlerfälle und Qualität** · A · M5-03, Frage 6 · Verbindungsabbruch, schwache Leitung, Geräteauswahl, Lasttest mit Zielgröße aus Frage 6. Akzeptanz: Wiedereinwahl nach Abbruch klappt; Lasttest mit der Zielzahl von Personen läuft ohne Abbrüche; Ergebnisse im Bericht.
- **M5-07 Datenschutz des Raums** · C · M5-03 · keine Aufnahme ohne Einwilligungskonzept. Akzeptanz: Datenfluss-Skizze (welche Daten gehen an welchen Server) liegt vor; Fatih hat sie gesehen.

---

## M6 Kommunikation, Kalender, Bescheinigungen

**Ziel:** Informationsfluss und Dokumente, die Schulen im Alltag brauchen.
**Freigegebene Rechte- und Datenbankänderungen:** neue Rechte `announcement.write` (Lehrkraft eigener Kurs, Verwaltung, Leitung) und `certificate.issue` (Verwaltung, Leitung). `message.send` ist **nicht** freigegeben, bis Frage 3 beantwortet ist. Das Vertretungsrecht aus M6-06 ist **nicht** freigegeben (Stopp-Punkt, Fatih entscheidet gesondert). **Migrationen:** additiv: Ankündigungen, Bescheinigungen (Nachrichten erst nach Frage 3).


**Steckbrief.**
- **Erlebnis:** Lehrkräfte informieren ihre Kurse, alle sehen ihre Termine im Kalender, Schulen stellen Teilnahmebescheinigungen aus.
- **Umfang:** M6-01 bis M6-06.
- **Ausgeschlossen:** Nachrichten zwischen Teilnehmenden (bis Frage 3 entschieden ist), Push-Benachrichtigungen einer App, SMS.
- **Mandanten und Sicherheit:** Sichtbarkeit nur im Kurs; Kalender-Links nicht erratbar; Bescheinigungen nur für Berechtigte, nur aus belegten Daten; echter Mailversand erst mit M8-03.
- **Fertig, wenn:** Browserablauf je Funktion; Rechte- und Mandantentests; PDF-Beispiele von Fatih gesehen.

- **M6-01 Ankündigungen je Kurs** · B · M2-06 · Akzeptanz: nur zugeordnete Personen sehen sie (Test); Lehrkraft nur im eigenen Kurs.
- **M6-02 Nachrichten** · B · Frage 3 · Umfang je Antwort; Missbrauchsschutz (Melden, Sperren). Akzeptanz: Nachrichten nur im erlaubten Kreis; Meldung erreicht die Leitung; Rechte-Test.
- **M6-03 E-Mail-Benachrichtigungen** · B · M6-01 · Einstellungen je Person; Abmelden möglich. Akzeptanz: Test mit dem Datei-/Speicher-Versand; der echte Versand wird erst mit M8-03 eingeschaltet (C).
- **M6-04 Kalender** · A · M1-06 · Ansicht und iCal-Export je Person. Akzeptanz: Export öffnet in einem Standard-Kalenderprogramm; Link nicht erratbar; abgesagte Termine entfallen.
- **M6-05 Teilnahmebescheinigung (PDF)** · B · Frage 5, M1-05 · Vorlage mit Schulname/Logo, Zeitraum, Stunden. Datengrundlage: Einschreibung und Termine; Anwesenheitsstunden nur, wenn der BAMF-Baustein aktiv ist und bestätigte Anwesenheit vorliegt. Akzeptanz: PDF je Beispielperson geprüft; keine BAMF-Aussage; nur Berechtigte können sie erzeugen (Test).
- **M6-06 Vertretung und Stundenplan für Lehrkräfte und Teilnehmende** · C (neues Recht für Vertretung) · M6-04, M1-13 · Persönliche Wochenansicht; Vertretung benennen und Betroffene informieren. Akzeptanz: Änderung eines Termins erreicht nur die Betroffenen (Test); Vertretung bekommt temporär nur Zugriff auf den Termin.

---

## M7 BAMF-Baustein (optional je Schule)

**Ziel:** Träger mit BAMF-Pflichten bekommen prüffähige Nachweise. Es werden keine Aussagen wie „BAMF-konform“ gemacht (siehe `docs/bamf-anforderungen.md`).
**Freigegebene Rechte- und Datenbankänderungen:** keine neuen Rechte; **Migrationen** additiv (Status, Einwilligungen, Aufbewahrungsfristen).


**Steckbrief.**
- **Erlebnis:** Träger mit BAMF-Pflichten bekommen prüffähige Listen und Exporte; Schulen ohne den Schalter sehen davon nichts.
- **Umfang:** M7-01 bis M7-09.
- **Ausgeschlossen:** Anbindung an BerD und InGe Online, Prüfungen und Einstufungstests, jede Aussage „BAMF-konform“.
- **Mandanten und Sicherheit:** Nachweise unveränderlich; Exporte vermerken unbestätigte Daten und werden protokolliert; BAMF-Daten nur bei aktivem Schalter; Einwilligungen nachweisbar.
- **Fertig, wenn:** Jede Anforderung A1–A13 hat einen Status mit Beleg; Umsetzung entweder gegen Primärquelle geprüft oder als Annahme gekennzeichnet; Aussagen-Prüfung ohne offene Funde.

- **M7-01 Anwesenheits-Statusmodell nach Signaturlisten-Vorlage (A10)** · B · M1-06 · Online-Anwesenheit, entschuldigt, Kurswechsel. Akzeptanz: jeder Fall der Vorlage Stand 02.11.2026 ist abbildbar. Die Primärquelle (Leitlinien) war bisher nicht lesbar (`bamf-anforderungen.md`, Quellenfrage 1 in `bamf-anforderungen.md`): Ist sie es weiterhin nicht, gilt die Umsetzung als Annahme und wird so gekennzeichnet; Bestätigung durch einen Träger ist Voraussetzung für jede Aussage nach außen.
- **M7-02 Export (Signaturliste, Einwahlprotokoll)** · B · M7-01 · Akzeptanz: Export enthält nur bestätigte Daten, kennzeichnet unbestätigte, wird im Protokoll vermerkt; Beispiel-Datei geprüft.
- **M7-03 IK und BSK getrennt (A11)** · B · M7-01 · Akzeptanz: Kurs hat Typ IK/BSK; Regeln und Exporte je Typ getrennt, getestet.
- **M7-04 UE-Grenzen gegen aktuelle Fassung prüfen (A5)** · B (ändert eine Anwesenheitsregel) · — · Quelle lesen, Regel belegen oder korrigieren. Akzeptanz: Quelle zitiert (kurz, mit Fundstelle) oder als „nicht prüfbar“ markiert; Tests passen zur Regel.
- **M7-05 Einwilligungen und Einführungsveranstaltung (A6, A7)** · C (Rechtstext) · Rechtsprüfung · Akzeptanz: Texte von einer fachkundigen Person freigegeben; Einwilligung je Person speicher- und nachweisbar.
- **M7-06 Aufbewahrung und Löschkonzept (A4)** · C · Datenschutz-Konzept durch Fachperson · Akzeptanz: Konzept liegt vor und ist freigegeben; Umsetzung erst danach.
- **M7-07 Nachweispaket für die Online-Zulassung (A9)** · A · M7-02, M5-04 · Zusammenstellung der Nachweise für die Online-Zulassung. Akzeptanz: Paket enthält nur belegte Angaben; Lücken sind benannt.
- **M7-08 Anfrage an das BAMF (BerD, InGe)** · C · — · Anfrage formulieren ja, versenden nie ohne Freigabe. Akzeptanz: Entwurf liegt vor; Versand nur durch Fatih.
- **M7-09 Aussagen-Prüfung** · A · — · Texte, Startseite, Werbung gegen die Regel „keine Konformitätsbehauptung“ prüfen. Akzeptanz: Suchlauf über alle Texte; Fundliste abgearbeitet.

---

## M8 Pilotreife

**Ziel:** Eine Pilotschule kann mit echten Personen arbeiten. Dieser Meilenstein enthält die meisten Stopp-Punkte.
**Freigegebene Rechte- und Datenbankänderungen:** Migration der Betriebsdatenbank ist ein eigener, beaufsichtigter Schritt (C).


**Steckbrief.**
- **Erlebnis:** Eine Pilotschule arbeitet mit echten Personen; Fatih kann den Betrieb überblicken und im Notfall zurückgehen.
- **Umfang:** M8-01 bis M8-09 (inkl. M8-05a).
- **Ausgeschlossen:** Bezahlung, aktive Werbung für weitere Schulen, BAMF-Anbindungen.
- **Mandanten und Sicherheit:** Datenschutz von Fachperson freigegeben; Sicherung wiederhergestellt getestet; Sicherheitsreview der Gesamtanwendung ohne offene hohe Funde; Zugang zu echten Daten nur nach Fatihs Freigabe.
- **Fertig, wenn:** Pilot-Checkliste (Betrieb, Recht, Sicherheit, Schulung, Rückfallplan) vollständig und von Fatih bestätigt.

- **M8-01 Datenbank in der EU (PostgreSQL)** · C · M0-07, Frage 7 · Umzug von PGlite, Start-Prüfung der Datenbankrolle, Sicherung automatisiert. Akzeptanz: Umzug auf Kopie erprobt, Datenvergleich vorher/nachher, Rückweg beschrieben, Wiederherstellung getestet.
- **M8-02 Überwachung und Alarme** · C · M8-01 · Fehlerprotokoll ohne Personendaten, Verfügbarkeitsprüfung, Benachrichtigung. Akzeptanz: absichtlicher Testfehler löst Alarm aus; Protokolle enthalten keine Passwörter oder Personendaten (Stichprobe).
- **M8-03 Echter E-Mail-Versand** · C · Frage 7 · Anbieter in der EU, Absenderdomain (SPF/DKIM/DMARC). Zugangsdaten legt Fatih selbst an. Akzeptanz: Testmail kommt an, nicht im Spam; SPF/DKIM/DMARC bestehen die Prüfung.
- **M8-04 Datenschutz und Recht** · C · Fachperson · Impressum, Datenschutzerklärung, Nutzungsbedingungen, Auftragsverarbeitungsvertrag, Verzeichnis der Verarbeitungen; Platzhalter ersetzt. Akzeptanz: schriftliche Freigabe der Fachperson liegt vor; Texte im Produkt entsprechen ihr.
- **M8-05 DSGVO-Funktionen** · C (berührt die Unveränderlichkeit der Nachweise) · M8-04 · Auskunft/Export einer Person, Löschung/Anonymisierung ohne Bruch der unveränderlichen Nachweise (Konzept zuerst).
- **M8-05a Datenexport einer Schule** · C · M8-05 · Vollständiger Export der eigenen Schule für die Leitung (Wechselmöglichkeit). Akzeptanz: Export enthält nur die eigene Schule (Mandantentest); Protokoll des Exports.
- **M8-06 Designpolitur und Barrierefreiheit** · A · M2-03, M3-04 · Prüfung nach WCAG 2.2 AA mit Werkzeug und von Hand; Tastatur, Screenreader, Kontrast. Akzeptanz: Bericht mit Behebungen.
- **M8-07 Last- und Sicherheitstest** · B · M8-01, Frage 6 · Zielgröße aus Frage 6; Sicherheitsreview der Gesamtanwendung durch frischen Agenten und Checkliste; Abhängigkeitsprüfung grün.
- **M8-08 Pilot-Einführung** · C · Frage 6 · Anleitung, Schulung, Supportweg, Rückfallplan, Freigabe für echte Personendaten **nur durch Fatih**.
- **M8-09 Supportweg für Schulen** · A · M8-04, M8-03 · Kontaktweg und Fehlermeldung aus der Anwendung ohne Personendaten im Text. Akzeptanz: Meldung kommt an; kein Personenbezug im Protokoll.

---

## M9 Betreiber und Abo (erst nach Frage 1)

**Ziel:** Schulen können Kurswerk dauerhaft buchen; der Betreiber verwaltet sie ohne Kommandozeile.
**Freigegebene Rechte- und Datenbankänderungen:** keine; neue Rolle „Betreiber“ ist eine Änderung der Sicherheitsarchitektur (C).


**Steckbrief.**
- **Erlebnis:** Schulen buchen und kündigen selbst; Fatih verwaltet Schulen in einer Oberfläche statt per Kommandozeile.
- **Umfang:** M9-01 bis M9-04.
- **Ausgeschlossen:** Marktplatz, Partnerprogramme, eigene Zahlungsabwicklung (Karten- oder Kontodaten werden nie selbst gespeichert).
- **Mandanten und Sicherheit:** Neue Rolle „Betreiber“ getrennt von Schulrollen; zusätzliche Absicherung der Anmeldung; jede Betreiberaktion im Audit; Zahlungsdaten nur beim Zahlungsanbieter.
- **Fertig, wenn:** Preismodell entschieden; Ablauf Buchen, Zahlen, Kündigen, Datenexport im Browser mit Testzahlung durchgespielt; Sicherheitsreview BEREIT.

- **M9-01 Betreiberbereich** · C · M8-08 · Schulen freischalten/sperren/verlängern per Oberfläche; getrennte Anmeldung, zusätzliche Absicherung.
- **M9-02 Preismodell festlegen** · C · Frage 1 · Akzeptanz: Preismodell schriftlich entschieden.
- **M9-03 Abrechnung** · C · M9-02 · Anbieter, Rechnungen, Steuer; Zugangsdaten durch Fatih.
- **M9-04 Kündigung und Datenexport für Schulen** · B · M9-03 · Akzeptanz: Schule kann kündigen und ihre Daten exportieren; Export enthält nur eigene Daten (Test).

---

## 3. Stopp-Punkte (immer Rückfrage, auch innerhalb eines freigegebenen Meilensteins)

- Produktions-Deploy, Merge auf `main` und jede Änderung an geschützten Zweigen oder deren Schutzregeln.
- Zugangsdaten, Schlüssel, Tokens: anlegen, ändern, drehen, im Code oder in Dateien ablegen.
- Änderungen an `.github/`, `deploy/`, `scripts/` (jede bestehende und neue Datei; Aufgaben, die Seeds ändern müssen, sind ein Stopp-Punkt oder nutzen Testdaten unter `tests/`), `.githooks/`, `.claude/` (Skills, Einstellungen), Testkonfiguration und Build-Konfiguration (`vitest.config.ts`, `tsconfig.json`, `next.config.mjs`, `drizzle.config.ts`, `.gitignore`, `.env.example`, `.mcp.json`), geschachtelte `CLAUDE.md`, `CLAUDE.local.md`, `docs/produkt/entwurf/`, `CLAUDE.md`, `docs/produkt/ZIEL.md`, `BACKLOG.md`, `AUTONOMIE.md`, `FREIGABEN.md`, `STOP`, Hosting, Domains, DNS.
- Rechteänderungen **außerhalb** der im Meilenstein aufgeführten; jede Lockerung bestehender Rechte.
- Migrationen, die Daten verändern oder löschen, Umbenennungen, Änderungen bereits übernommener Migrationen, Eingriffe in Produktionsdaten.
- Neue externe Dienste oder Kosten; Abonnements.
- Neue Abhängigkeiten oder Pakete, jede Änderung an `package.json` oder `package-lock.json`, neue oder entfernte CI-Schritte.
- Seeds, Testdaten oder Beispiele mit echten Personendaten.
- Force-Push, Verlaufsänderung, Löschen von Zweigen.
- Rechtstexte und rechtliche Zusagen; jede Aussage über BAMF-Konformität.
- Versand an Dritte (E-Mail, BAMF, Kunden).
- Echte Personendaten in irgendeiner Umgebung.
- Produktfragen, die weder aus `ZIEL.md` noch aus dem Code beantwortbar sind.

## 4. Ausführungsregeln (Entwurf, noch nicht aktiv)

Die Einrichtung folgt nach der Freigabe dieser Dokumente und wird in M0-14 an einem beaufsichtigten Meilenstein erprobt.

- **Zustand im Repository.** `docs/produkt/STATUS.md` (geändert im Aufgabenzweig, mit dem Task-Pull-Request in den Meilenstein-Zweig; gelesen wird der Stand des Meilenstein-Zweigs) führt je Aufgabe: Status (offen, begonnen, in Prüfung, fertig = im Meilenstein-Zweig, blockiert), Zweig, Pull Request, Versuche, letzter Prüfstand, Blockergrund. Der Git-Stand (Zweige, Pull Requests) ist die Wahrheit; bei Abweichung gewinnt Git. Zu Beginn jeder Sitzung liest der Lauf Git und `STATUS.md` (Skill `session-recon`, verfügbar nach Merge von PR #25).
- **Aufgabenauswahl.** Nächste Aufgabe **im freigegebenen Meilenstein** (nie aus einem anderen), deren Abhängigkeiten fertig sind und die kein Stopp-Punkt ist; bei Gleichstand die mit der höchsten Priorität nach Reihenfolge oben. Eine Aufgabe ist „beansprucht“, sobald ihr Zweig existiert (Schutz gegen doppelte Arbeit).
- **Parallelität.** Maßgeblich ist `AUTONOMIE.md` §5: zunächst genau ein Umsetzer und ein Reviewer. Erst nach einem störungsfreien sequenziellen Meilenstein sind zwei Umsetzer an Aufgaben ohne gemeinsame Dateien denkbar. Aufgaben an `schema.ts`, `permissions.ts` und Migrationen laufen nacheinander; Migrationsnummern vergibt die Leitung des Laufs.
- **Ablauf je Aufgabe.** Erkunden → umsetzen auf `task/…` → `tsc`, `vitest`, `build` → Browserablauf mit Bildschirmfotos → unabhängiger Review → Korrektur → Pull Request in den Meilenstein-Zweig.
- **Wiederholungsbudget.** Höchstens 3 Korrekturrunden nach roten Prüfungen und 2 nach Review-Befunden. Danach: Aufgabe als blockiert markieren und Blockerbericht schreiben (Was versucht, was gescheitert, Vorschlag); der Lauf endet, der nächste Lauf wählt die nächste unabhängige Aufgabe (AUTONOMIE.md §4).
- **Testintegrität.** Bestehende Tests werden nicht abgeschwächt, übersprungen oder gelöscht, um grün zu werden. Eine Änderung bestehender Erwartungen braucht eine Begründung im Pull Request und die Zustimmung des Reviews. „Begonnen“ ist allein durch Zweig plus Entwurfs-Pull-Request belegt; begonnene Aufgaben werden vor neuen fortgesetzt. Ein Prüfskript meldet entfernte oder geänderte Prüfungen.
- **Budgets.** Je Aufgabe und je Lauf wird eine Obergrenze für Zeit und Aufwand gesetzt (Werte bei der Einrichtung festlegen). Überschreitung beendet den Lauf mit Bericht.
- **Eskalation.** Nur echte Produktfragen, Stopp-Punkte und Blocker, die innerhalb der Grenzen nicht lösbar sind. Meldung in einfacher Sprache mit Empfehlung und Standard-Annahme.
- **Meilenstein-Abschluss.** Gesamtprüfung auf dem Meilenstein-Zweig (alle Prüfungen, Browserdurchgang), Sicherheitsreview für alle B-Aufgaben, ein Pull Request nach `main`. Danach wartet der Lauf auf Fatihs Merge und fährt mit dem nächsten freigegebenen Meilenstein fort.
- **Vor M0-04:** Der Agent öffnet nur Pull Requests, deren Diff ausschließlich `docs/` betrifft (Pull-Request-Läufe führen Repository-Code mit Schreibrecht aus). Meilenstein-Läufe mit Produktcode beginnen erst nach M0-04 und M0-Ausgang. Geschützte Dateien (unten) bereitet der Agent als Diff vor; Fatih prüft ihn und merged selbst im Browser nach AUTONOMIE.md §3a. M0-04 ist die einzige Ausnahme, bei der der Agent den Pull Request öffnet: Der Diff ist auf den Rechte-Block und eine Pfad-Ausnahme beschränkt und wird von einem frischen Reviewer und Fatih gelesen.
- **Was technisch erzwungen wird.** Lokale Sperrregeln in den Claude-Code-Einstellungen (kein Merge auf `main`, kein Push auf `main`, keine Änderungen an geschützten Pfaden), CI-Prüfungen und, sobald M0-03 erledigt ist, GitHub-Zweigschutz. **Bis dahin ist „kein Merge auf `main`“ eine Absprache plus lokale Sperre, nicht ein Schutz auf GitHub-Seite.**
