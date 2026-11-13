# M1-07 Personenliste: Abnahmetests und Zwei-Sitzungs-Ablauf (ENTWURF, kein Code, nichts aktiv)

Stand 13.11.2026. Aufgabe laut `BACKLOG.md` (M1-07, Klasse A): Suche, Filter, Sortierung, Seiten für `/verwaltung/personen`. Erste Probe für betreute, autonome Entwicklung.
Dieses Dokument ändert keinen Anwendungscode. Es legt fest, woran ein Ergebnis gemessen wird, bevor irgendetwas gebaut wird.

## 1. Festlegungen (damit die Tests eindeutig sind)
Aus dem Bestand gelesen: `listAccounts` (`src/server/auth.ts:205`) prüft `account.invite` (Leitung, Verwaltung) und liefert alle aktiven Personen der Schule (RLS), sortiert nach Nachname/Vorname.
Die Seite gruppiert heute nach Rolle (Leitung, Verwaltung, Lehrkräfte, Teilnehmende). Entscheidung für M1-07 (Produktfrage an Fatih, klein, Standard gilt ohne Widerspruch):
**eine einzige sortierte Liste statt Gruppen**, Rolle als Beschriftung in jeder Zeile; Standardsortierung „Rolle“ (Leitung, Verwaltung, Lehrkräfte, Teilnehmende), danach Nachname, Vorname. So sieht die Standardansicht wie bisher aus, ist aber seitenweise abrufbar.

Adressparameter (alle optional, Fehler werden ignoriert):
`q` (Suchtext, höchstens 100 Zeichen), `rolle` (mehrfach: ADMIN, STAFF, TEACHER, LEARNER), `zugang` (mehrfach: NONE, INVITED, ACTIVE), `sort` (rolle, nachname, vorname, email), `richtung` (auf, ab), `seite` (ab 1). 50 Personen je Seite.

## 2. Tests der Fachfunktion (`tests/people-list.test.ts`, ohne Datenbank, 500 erfundene Personen)
Die Funktion bekommt die schon erlaubten Personen und die Adressparameter, nie Datenbank oder Rechte. Pflichttests (Name = Testtitel):
1. Suche findet Teilstring in Vorname, Nachname, E-Mail.
2. Suche ignoriert Groß-/Kleinschreibung.
3. „muller“ findet „Müller“, „mueller“ findet „Müller“, „strasse“ findet „Straße“, „cetin“ findet „Çetin“; „Muller“ findet nicht „Möller“.
4. Suche mit Leerzeichen trimmt; mehrere Wörter müssen alle vorkommen (UND).
5. `q` über 100 Zeichen wird gekürzt, nicht abgelehnt.
6. Sonderzeichen in `q` (`%`, `_`, `\`, `'`, `<script>`) werden als normaler Text behandelt.
7. Rollenfilter einzeln und mehrfach (ODER innerhalb Rolle), Zugangsfilter ebenso; beide kombiniert (UND); mit Suche kombiniert.
8. Unbekannte Rolle/Zugang/Sortierung/Richtung werden ignoriert (Standardverhalten).
9. Sortierung je Feld und Richtung; stabile Reihenfolge bei Gleichstand (danach Nachname, Vorname, E-Mail); deutsche Sortierung („Ärzt“ vor „Zeh“, nicht hinter „Z“).
10. Seiten: 500 Personen ergeben 10 Seiten; Seite 1 hat 50, Seite 10 die letzten 50; „x–y von n“ stimmt, auch bei 501 und 0 Personen.
11. Ungültige Seite („0“, „-3“, „abc“, „1e9“) wird zu 1; zu große Seite wird zur letzten gültigen.
12. Nach Filter, der Treffer auf nur eine Seite reduziert, wird eine zuvor hohe Seitenzahl auf die letzte gültige begrenzt.
13. Leere Trefferliste: Gesamtzahl 0, keine Seiten, Hinweisfall „Keine Treffer“.
14. Eingabeliste bleibt unverändert (keine Mutation); Ergebnis ist reproduzierbar (zweimal gleicher Aufruf = gleich).
15. Zeitverhalten: Verarbeitung von 5000 Personen unter 200 ms (Grobgrenze; Messwert im PR nennen, nicht als Leistungsversprechen).
16. Nur die übergebenen Personen können im Ergebnis vorkommen (Eigenschaftstest mit zufälligen Eingaben, feste Startzahl).
17. Adresse erzeugen und wieder lesen ergibt denselben Zustand (Rundlauf); Standardwerte erscheinen nicht in der Adresse.

## 3. Rechte unverändert (bestehende Tests müssen unverändert grün sein, nichts davon wird geändert oder gelockert)
- Lehrkraft und Teilnehmende werden von `listAccounts` weiterhin abgelehnt; die Seite leitet um.
- Schule B sieht nie Personen von Schule A (bestehender Test zu `listAccounts`/RLS); zusätzlich ein Test, dass die neue Funktion keine Datenbank importiert (Importprüfung im Test) und `src/server/auth.ts`, `permissions.ts`, `src/db/`, `drizzle/` im Diff fehlen (`coordinator check-diff`).
- Einladungsknöpfe erscheinen nach `canInvite` wie bisher, Seite 2 inklusive.
- Mutationsprobe: Rollenfilter, Zugangsfilter, Seitengrenze und Umlautvergleich werden je einzeln entfernt; jeweils mindestens ein Test wird rot (Ergebnis im PR).

## 4. Browserprüfung (echter Browser, erfundene Daten, Belege als Bildschirmfotos im PR)
Lokal mit `npm run db:seed` plus Probedaten von 500 Personen (nicht über `scripts/seed.ts` ändern).
- Suche tippen, Filter setzen, sortieren, blättern; Adresse kopieren und in neuem Tab öffnen: gleicher Zustand. Zurück-Taste springt zum vorigen Zustand.
- Tastatur: alles ohne Maus bedienbar, sichtbarer Fokus, sinnvolle Reihenfolge, Suchfeld mit Beschriftung, Filter als beschriftete Gruppen, Ergebnisanzahl wird per `aria-live="polite"` angesagt, Blätternavigation `nav` mit Beschriftung, aktuelle Seite `aria-current="page"`, deaktivierte Knöpfe richtig markiert.
- Sortierspalte nennt Richtung (`aria-sort` bei Tabelle oder Text im Knopf); Rollen und Zugang nie allein über Farbe.
- 360 px Breite: kein seitliches Scrollen, Bedienelemente mindestens 44 px hoch; 1280 px: Zeilen lesbar; Bildschirmfotos beider Breiten.
- Leerzustand „Keine Treffer“ mit Link „Filter zurücksetzen“; Fehlerzustand (kaputte Adresse) zeigt die normale Liste.
- Kontrast (Text/Hintergrund mindestens 4,5:1) mit Messwerkzeug geprüft, Wert im PR.
- Seitenzeit mit 500 Personen lokal gemessen (Messwert genannt).
- Die vorhandenen Funktionen „Personen anlegen“ und „Einladungslink“ arbeiten weiter.

## 5. Gesamtprüfung (alle müssen mit echter Ausgabe im PR stehen)
`npx tsc --noEmit`, `npx vitest run` (alle alten und neuen Tests), `npm run build`, `coordinator check-diff` ohne Befund. Erwartete Dateien im Diff, nur diese:
`src/domain/people-list.ts`, `src/app/verwaltung/personen/page.tsx`, ggf. `src/app/verwaltung/personen/people-filters.tsx` (Client-Teil, falls nötig), ggf. `src/app/globals.css`, `tests/people-list.test.ts`, `docs/produkt/STATUS.md`. Jede andere Datei = Abbruch und Meldung.

## 6. Zwei-Sitzungs-Ablauf
Voraussetzungen siehe 7. Betreut: Fatih startet beide Sitzungen selbst und sieht zu. Alle Belege kommen in den Pull Request.

**Sitzung A (Umsetzung)** startet frisch mit der Anweisung `run-task` (Entwurf: `coordinator/run-task.SKILL.md.txt`) und sonst nichts:
1. `coordinator preflight`: STOP-Datei fehlt, Freigabe für M1 in `FREIGABEN.md` auf `main`, sauberer Baum, Zweigschutz laut Anleitung aktiv. Ausgabe in den PR. Ein Fehler beendet die Sitzung ohne Änderung.
2. `coordinator next`: muss „NEU M1-07“ nennen (Startreihenfolge der Freigabe). Zweigliste vorher notieren.
3. Task-Zweig `task/m1-07-personenliste` von `meilenstein/m1-verwaltung`, Entwurfs-PR gegen den Meilenstein-Zweig **vor** dem ersten Code, `STATUS.md`: „begonnen“.
4. Test zuerst: `tests/people-list.test.ts` nach Abschnitt 2/3 schreiben, rot sehen, dann umsetzen.
5. Prüfungen nach Abschnitt 5. CI-Fehler: höchstens 3 Runden; danach „blockiert“ mit Befund in `STATUS.md`, kein viertes Raten.
6. **Frischer Reviewer-Agent** (ohne Gesprächsverlauf von A, nur Diff, Aufgabe, Abnahme): Sicherheit/Mandantentrennung, Architektur, Bedienung; führt Tests selbst aus; Urteil mit Datei und Zeile. Höchstens 2 Review-Runden; offene Befunde stehen im PR.
7. `STATUS.md`: „in Prüfung“, Zweig, PR, Versuche (CI x/3, Review y/2), Beleg-Links; pushen; PR auf „bereit“. Sitzung A endet. Danach: kein laufender Prozess, Baum sauber.
8. Fatih prüft und merged den Task-PR in `meilenstein/m1-verwaltung` (in der Demonstration nicht der Agent) und trägt den Stand ein.

**Sitzung B (Wiedererkennung)**: Neue Sitzung ohne Verlauf von A und ohne Zusammenfassung, nur `run-task`.
1. Zweigliste notieren. `coordinator preflight` → OK.
2. `coordinator next` muss M1-07 als **fertig** erkennen (Quelle: `STATUS.md` und gemergter Task-PR auf dem Meilenstein-Zweig, nicht Erinnerung) und **„NEU M1-08“** nennen. Auf Nachfrage „Warum nicht M1-01?“: Startreihenfolge M1-07, M1-08 in `FREIGABEN.md`.
3. Zweigliste nachher: **identisch** (kein zweiter Zweig für M1-07). Dann bricht B ab oder, wenn Fatih es freigibt, beginnt M1-08 als eigener Task. Für den Nachweis genügt die Entscheidung; M1-08 muss nicht fertig werden.
4. Probe mit STOP-Datei in einem Wegwerf-Klon: Start wird verweigert. Probe: unterbrochene Sitzung A (Status „begonnen“, Zweig vorhanden) wird von B **fortgesetzt**, nicht neu angelegt (die Aufgabenwahl-Tests belegen die Regel; der Ablauf wird einmal real gezeigt, wenn Fatih A absichtlich nach Schritt 3 beendet).

**Was im PR stehen muss:** Ausgaben von preflight/next (A und B), Zweiglisten vor/nach, Sitzungskennungen (verschieden), Reviewer-Urteile, Zähler, Testausgaben, Fotos, ehrliche Liste des Nichtbewiesenen (kein unbeaufsichtigter Betrieb, kein geplanter Lauf, kein Agentenkonto, falls nicht eingerichtet).
**Gilt nicht als Beweis:** Simulation im selben Gespräch, gestellte Freigabe im Testklon als Ersatz für Schritt A1, Selbstauskunft ohne Ausgabe.

## 7. Genaue Bedingung für den Beginn der betreuten Demonstration
Alle Punkte erfüllt **und** von Fatih bestätigt (ein Punkt offen = kein Start):
1. M0-04 live bewiesen: Schritte A bis E der Umsetzungsanleitung bestanden (Proben A, B, D gescheitert wie erwartet, C gelungen, E: kein Auslieferung ohne Klick).
2. Schutz für `main` und `meilenstein/*` aktiv und mit Probe-PR belegt (Schritt F, Teil Ruleset und `CODEOWNERS`).
3. Das Koordinator-Werkzeug (M0-14, Klasse C) ist von Fatih nach `scripts/` übernommen; `tests/coordinator.test.ts` grün; `preflight` und `next` laufen auf dem echten Stand wie in 6.
4. `docs/produkt/FREIGABEN.md` mit Eintrag für M1 (Startreihenfolge M1-07, M1-08) von Fatih in seinem eigenen PR gemerged; Meilenstein-Zweig `meilenstein/m1-verwaltung` von ihm angelegt; keine STOP-Datei.
5. Die weiteren Teile des M0-Ausgangs laut `BACKLOG.md` (M0-03, M0-08, M0-10, M0-11) sind erledigt **oder** Fatih hat schriftlich entschieden, die Demonstration davor zu erlauben. Begründung für einen Verzicht: M1-07 berührt weder Rechte noch Schema noch Auslieferung. Diese Entscheidung ist seine; Claude schlägt sie nicht eigenmächtig um.
6. Agent-Identität: Die Demonstration darf mit seinem Konto laufen (betreut), dann gilt der Schutz nur als Anweisung und das steht im PR. Unbeaufsichtigte Läufe bleiben bis zur getrennten Identität verboten.
7. Offene Auslieferungs-Blocker (M0-01, M0-05, M0-06, M0-07, M0-08) stehen als Zeilen im PR; sie hindern die Demo, nicht aber einen Merge nach `main` oder eine Auslieferung zu rechtfertigen (beides bleibt getrennt zu entscheiden).
8. Ein frischer Review der drei Dokumente (diese Abnahme, `run-task`, Koordinator) hat keinen hohen Befund.
