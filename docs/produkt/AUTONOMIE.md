# Autonome Entwicklung bei Kurswerk: Ausführungsarchitektur

Status: **ENTWURF zur Freigabe durch Fatih. Nichts davon ist aktiviert.** Stand 13.11.2026.
„Belegt“ heißt: in dieser Umgebung gesehen oder ausprobiert. „Laut Dokumentation“ heißt: nicht ausprobiert. „Ungeprüft“ heißt: unbekannt.

## 1. Grundsatz

Entwicklungsautonomie ist nicht Betriebsautonomie. Die Entwicklungsmaschine darf in einem freigegebenen Meilenstein planen, bauen, testen, prüfen lassen und Pull Requests auf einen **Meilenstein-Zweig** bringen. Sie darf nie: in geschützte Zweige mergen, ausliefern oder Auslieferung anstoßen, Auslieferungs- oder Infrastrukturkonfiguration ändern, Zugangsdaten oder Repository-Sichtbarkeit ändern, Produktivdatenbank oder echte Teilnehmerdaten anfassen, sensible Rechte- oder Sicherheitsarchitektur ändern, sensible Migrationen ausführen, kostenpflichtige Dienste einführen oder Personendaten an neue Dritte senden. Dafür braucht es je Fall eine eigene, ausdrückliche Freigabe für genau diese Aktion und dieses Ziel. Frühere Freigaben gelten nicht weiter. Zusätzlich darf der Agent nie selbst ändern: `CLAUDE.md`, `FREIGABEN.md`, `STOP`, `.github/`, `deploy/`, `scripts/`, Rechtstexte; keine neuen Pakete oder CI-Schritte; kein Versand an Dritte; kein Force-Push, keine Verlaufsänderung, kein Löschen von Zweigen (vollständige Liste: BACKLOG.md §3). **Bis `CLAUDE.md` in M0-11 angepasst ist, gilt dessen Regel „Fatih merged“ unverändert: der Agent mergt nichts, auch nicht in Meilenstein-Zweige.** Die Meilenstein-Zweig-Regel wird erst mit M0-14 und einer wirksamen Freigabe aktiv.

Zwei weitere Regeln: Tests werden nicht abgeschwächt, Sicherheitsprüfungen nicht umgangen, nicht verifizierte Ergebnisse gelten nie als bestanden. **CI bleibt maßgeblich.** Anweisungen an den Agenten sind keine technische Durchsetzung (siehe §7).

## 2. Welche Mechanismen es wirklich gibt

| Mechanismus | Status | Eignung |
| --- | --- | --- |
| Lange Unterhaltung | belegt: Kontext läuft über, nur Zusammenfassung bleibt | **ungeeignet** als Autonomie; nur zur Zusammenarbeit |
| `/goal` (Claude Code ≥ 2.1.139) | laut Dokumentation: ein Ziel je Sitzung, ein kleines Modell prüft nur das Gespräch (nicht Dateien/CI), bleibt bei Fortsetzung erhalten, geht auch mit `-p` | gut für **eine Aufgabe** mit prüfbarer Bedingung („CI grün, Reviewer BEREIT“); nicht als Meilenstein-Steuerung, weil die Prüfung nur das Gespräch sieht |
| `/loop` | laut Dokumentation: zeitgesteuert | Beobachter/Statusabfrage, nicht Arbeitssteuerung |
| Auto-Modus (`--permission-mode auto`) | laut Dokumentation: Klassifikator statt Rückfrage; pausiert nach wiederholten Sperren; breite Erlaubnisse werden entfernt | Erleichterung, **keine Sicherheitsgrenze**; Aktionen außerhalb des Repos bleiben gesperrt/zu prüfen |
| Hintergrundsitzungen (`--bg`, `claude agents/attach/logs/respawn`) | CLI 2.1.323 hat die Befehle (belegt); Verhalten ungeprüft | auf Fatihs Rechner: Sitzungen überleben, sichtbar, wieder aufnehmbar |
| Worktrees (`--worktree`) | CLI-Option vorhanden (belegt) | Isolation je Aufgabe; später Voraussetzung für Parallelität |
| Berechtigungsregeln und Sandbox in den Claude-Code-Einstellungen | laut Dokumentation, ungeprüft; Verbotsmuster für Befehle können umgehbar sein | Hilfsmittel; Grenzen setzen nur GitHub und CI |
| Hooks | laut Dokumentation | lokale Schutznetze; **fail-open** (CI ist maßgeblich); keine Durchsetzung gegen den Agenten selbst |
| Geplante Aufgaben (`create_trigger`) | Werkzeug vorhanden, **nicht ausprobiert**; jeder Lauf ist eine frische Sitzung in dieser Umgebung; Freigabemodus (auto/fragen) ungewiss | gut für „eine Aufgabe je Lauf“, weil frische Läufe Zustand aus dem Repository lesen müssen; Neustart-Sicherheit ist Entwurf (§4, §8) |
| `send_later` | Werkzeug vorhanden, nicht ausprobiert | Erinnerung in **diese** Sitzung; nützlich zum Wiederaufnehmen, kein Dauerbetrieb |
| Externer Orchestrator (Skript ruft `claude -p`) | in dieser Umgebung **nicht nutzbar**: nicht angemeldet, `claude -p` → Authentifizierungsfehler; Anmeldung wäre eine Zugangsdaten-Aktion | nur auf Fatihs Rechner mit seiner Anmeldung; erst später |

**Empfehlung:** Zuerst **betreute Sitzungen** (diese Umgebung, Fatih sieht zu), dann **eine geplante Aufgabe je Lauf** (frische Sitzung, Zustand aus dem Repository), nicht ein einziger Dauerlauf. `/goal` nur innerhalb einer Aufgabe. Ein externer Orchestrator ist ein späterer Schritt, falls die ersten beiden nicht tragen.

## 3. Zustand und Nachvollziehbarkeit

Wahrheit ist **Git**, nicht die Unterhaltung.

- `docs/produkt/BACKLOG.md`: Aufgaben, Abhängigkeiten, Risikoklassen (Quelle der Reihenfolge).
- `docs/produkt/STATUS.md` (neu in M0-14): je Aufgabe Status (offen / in Arbeit / im Review / auf Meilenstein-Zweig / blockiert), Zweig, Pull-Request-Nummer, Datum, Nachweisverweis, nächster Schritt, Blockade in einfacher Sprache. Wird nur im Aufgabenzweig geändert, nie direkt auf `main`.
- `docs/produkt/FREIGABEN.md` (neu in M0-14): Freigaben von Fatih (Meilenstein, Datum, Umfang, ausgeschlossene Aktionen). Wirksam **nur**, wenn die Datei durch einen von Fatih gemergten Pull Request geändert wurde. Eine Freigabe im Chat ist Auftrag an mich, die Datei zu ändern, nicht selbst die Freigabe.
- `docs/produkt/STOP`: Existiert die Datei auf `main`, startet kein Lauf. Weil das Ruleset auch Administratoren bindet, geht das Anlegen nur per Pull Request und Merge; schneller sind zwei Alternativen, die in M0-14 gewählt werden: das Beenden der geplanten Aufgabe oder eine Repository-Variable, die die Vorprüfung liest (ungeprüft).
- Nachweise je Aufgabe im Pull-Request-Text: Befehle mit echter Ausgabe, Browserbelege, Reviewer-Urteil, Anzahl Korrekturrunden.
- Meilenstein-Übersicht: ein Tracking-Ticket (GitHub-Issue) je Meilenstein mit Checkliste; wird beim Merge einer Aufgabe aktualisiert.

### 3a. Freigaben, bevor die Freigabe-Infrastruktur gemergt ist

Bis `FREIGABEN.md` auf `main` liegt, gilt:
1. **Eine Chat-Nachricht ist nie eine Freigabe.** Sie ist ein Auftrag an mich, den Wortlaut vorzubereiten. Das gilt auch für „sieht gut aus“ oder „weiter“.
2. **Drei getrennte Entscheidungen, drei getrennte Aufzeichnungen,** jeweils bezogen auf einen festen Commit:
   - *Spezifikation genehmigt* (Inhalt von ZIEL, BACKLOG, AUTONOMIE),
   - *Merge erlaubt* (diesen Pull Request in `main` zusammenführen, mit dem Wissen, dass `main` die Testumgebung neu baut und neu startet),
   - *Meilenstein freigegeben* (Umfang, ausgeschlossene Aktionen).
3. **Form der Aufzeichnung:** ein Kommentar von Fatih in seinem Browser unter dem Pull Request, nach einer Vorlage, die ich ihm bereitstelle, z. B. `FREIGABE Spezifikation: ZIEL/BACKLOG/AUTONOMIE im Stand <voller Commit-Hash>. Merge: noch nicht erlaubt.` Gilt nur, wenn der Hash dem aktuellen Kopf des Pull Requests entspricht; jede weitere Änderung macht die Freigabe unwirksam.
4. **Ehrliche Grenze:** Mein Werkzeug handelt unter Fatihs Konto (§7a), ein Kommentar ist technisch also nicht fälschungssicher. Schutz bieten (a) meine feste Regel, nie einen Kommentar dieser Form zu schreiben und nie `merge`-Aufrufe der API auszuführen, (b) Fatihs Sichtkontrolle, (c) ab dem eigenen Agentenkonto die technische Trennung. Der Hash-Bezug stellt sicher, dass nach meinen Änderungen nichts als freigegeben durchgeht.
5. **Wirksam für Meilensteine** ist erst der Eintrag in `FREIGABEN.md`, der über einen von Fatih gemergten Pull Request auf `main` gelangt ist. Für die erste betreute Ausführung genügt, solange das noch nicht möglich ist, der Kommentar nach Punkt 3 plus Fatihs Anwesenheit.
6. **Warum PR #27 nicht zusammen mit der Genehmigung gemergt wird:** ein Merge löst auf `main` Bau, Veröffentlichung im Zweig `deploy` und Neustart der Testumgebung aus (belegt, `deploy.yml`). Auch reine Dokumentation löst das aus. Eine Änderung von `deploy.yml`, die Dokumentationsänderungen ausnimmt, ist als Teil von M0-04 vorzuschlagen (Klasse C).

## 4. Ablauf einer Aufgabe (ein Lauf = eine Aufgabe)

1. **Vorprüfung** (`scripts/preflight.sh`, neu): `STOP` fehlt; Freigabe für den Meilenstein in `FREIGABEN.md` auf `main`; Arbeitsbaum sauber; CI auf `main` und dem Meilenstein-Zweig grün; Branch-Schutz laut Abfrage aktiv; Aufgabenbudget nicht erschöpft. Fehlt etwas: Lauf endet mit Statusnotiz, nichts wird gebaut.
2. **Aufgabe wählen:** erste offene Aufgabe in Reihenfolge, deren Abhängigkeiten erledigt sind, Risikoklasse A oder B, und die nicht in `STATUS.md` belegt ist.
3. **Beanspruchen:** Aufgabenzweig `task/mN-NN-…` und Entwurfs-Pull-Request anlegen. Existiert der Zweig schon, wird **fortgesetzt**, nicht neu begonnen (kein Doppelbau).
4. **Untersuchen** (Code, Datenmodell, Tests), **bauen** im eigenen Zweig/Worktree, kleine Commits.
5. **Prüfen:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`; Mandanten-, Rechte- und Sicherheitstests; Browserdurchgang bei Nutzerabläufen.
6. **Unabhängiges Review:** frischer Agent, hat den Code nicht geschrieben, bekommt Aufgabe, Diff und Prüfausgaben, prüft Sicherheit, Architektur, Bedienung, Testintegrität.
7. **Korrektur begrenzt:** höchstens 3 Runden CI-Reparatur und 2 Review-Runden. Danach Stopp: Aufgabe „blockiert“, Befund in einfacher Sprache.
8. **Integration:** bei grüner CI und Urteil BEREIT darf der Agent den Task-Pull-Request in den **Meilenstein-Zweig** mergen (nur dorthin). Keine Auslieferung, kein `main`.
9. **Festhalten:** `STATUS.md`, Tracking-Ticket, nächster Schritt. Dann endet der Lauf; der nächste Lauf wählt die nächste Aufgabe.
10. **Meilensteinende:** ein Pull Request Meilenstein-Zweig → `main` mit Zusammenfassung, Belegen, Risiken. **Fatih merged.** Erst danach Auslieferung über den bestehenden Weg.

Wiederaufnahme: Jeder Lauf beginnt mit der Vorprüfung und liest `STATUS.md`, offene Pull Requests und Zweige; Aufgaben mit Zweig, aber ohne laufenden Lauf, werden fortgesetzt, nie dupliziert.

## 5. Prüfer und Testintegrität

- Genau **ein** Coding-Agent und **ein** unabhängiger Reviewer. Parallelität erst, wenn mindestens ein Meilenstein sequenziell ohne Eingriff lief und Worktree-Isolation erprobt ist.
- Das Skript `scripts/test-integrity.sh` (neu, Klasse C, da `scripts/`) schlägt an, wenn ein Pull Request Tests löscht, auf `skip/only` setzt, Erwartungen lockert oder Prüfschritte der CI entfernt. Treffer verlangen Fatihs Zustimmung. Zusätzlich muss das Review Testintegrität ausdrücklich bestätigen.
- Nicht ausgeführte Prüfung = nicht bestanden. Flaky-Tests werden nicht wiederholt, bis sie grün sind; sie bekommen eine eigene Aufgabe.

## 6. Grenzen und Ausstiege

- Budgets je Aufgabe: Anzahl Korrekturrunden (3/2), Obergrenze an Läufen je Tag, harte Zeitgrenze je Lauf. Geldbudget in Claude Code: laut Dokumentation `--max-budget-usd` nur im Headless-Modus; ungeprüft.
- Annahme: zu jeder Zeit läuft höchstens ein Lauf; der Anspruch über Zweig und Entwurfs-PR ist nicht atomar und schützt nur dann. Eskalation: nur bei Blockaden mit Entscheidung, die Fatih treffen muss (in einfacher Sprache: Frage, Grund, Empfehlung). Technische Routinefragen entscheidet die Maschine.
- Notbremse: `STOP`-Datei, Beenden der geplanten Aufgabe, Branch-Schutz bleibt unabhängig davon bestehen.

## 7. Durchsetzung statt Versprechen

| Regel | Wodurch technisch durchgesetzt | Heute |
| --- | --- | --- |
| Kein Merge in `main` ohne Fatih | GitHub-Ruleset auf `main` (Pull Request nötig, Prüfungen nötig, **Administratoren eingeschlossen**) | **nicht aktiv** (Branch ungeschützt; Plan-Verfügbarkeit bei privatem Repo ungeprüft) |
| Keine Auslieferung ohne Fatih | Ruleset auf Zweig `deploy`; Workflow schreibt nur bei Push auf `main`; Pull-Request-Läufe ohne Schreibrecht (M0-04) | **nicht aktiv**; Pull-Request-Läufe haben heute Schreibrecht (belegt) |
| Kein Zugang zu Produktivdaten/Servern | Umgebung ohne Server- und Datenbankzugang | belegt: kein Server-/Datenbankzugang. **Nicht** belegt: keine Zugangsdaten überhaupt; die Sitzung hat ein GitHub-Token mit Schreibrecht |
| Agent-Identität auf GitHub | eigenes, eng begrenztes Token (nur dieses Repo, kein Admin) und Ruleset ohne Umgehungsrecht; `meilenstein/*` und `task/*` bleiben beschreibbar | nicht eingerichtet (M0-14, Klasse C) |
| Pull Request mit geänderter `deploy.yml` vor M0-04 | Workflow läuft mit Schreibrecht schon beim Öffnen des Pull Requests; bis M0-04 öffnet der Agent keinen Pull Request, dessen Diff `.github/`, `deploy/` oder `scripts/` berührt (lokale Diff-Prüfung vorher); gilt auch für den Meilenstein-Pull-Request | Regel nur als Anweisung, bis M0-04 erledigt ist |
| Tests nicht abschwächen | CI + `test-integrity.sh` + Review | nicht vorhanden |
| Freigaben echt | `FREIGABEN.md` nur über Fatihs Merge | nicht vorhanden |
| Anweisungen im Agenten (CLAUDE.md, Hooks, Auto-Modus) | **keine Durchsetzung**, nur Hilfe | – |

### 7a. Befund zur Identität (belegt am 13.11.2026)

Die Sitzung arbeitet mit Fatihs eigenem GitHub-Konto (`gh api user` liefert `fatihcicek`, Autor von PR #27 ist dasselbe Konto, Rechte: admin). Folgen:
- Für GitHub ist jede meiner Aktionen eine Aktion von Fatih. Ein Ruleset mit „Administratoren eingeschlossen“ hilft nicht gegen mich, solange ich mit diesem Konto handle.
- Fatih kann einen von seinem eigenen Konto eröffneten Pull Request nicht per Review freigeben (GitHub zählt Selbstfreigaben nicht). PR #27 hat heute 0 Reviews.
- **Technisch durchsetzbar wird die Trennung erst mit einer eigenen Identität für den Agenten:** ein zweites GitHub-Konto (oder eine GitHub-App) mit Schreibrecht nur auf dieses Repository, ohne Admin, ohne Umgehungsrecht, mit eigenem eng begrenztem Token. Pull Requests des Agenten gibt dann Fatihs Konto frei; Rulesets binden den Agenten wirklich. Das Anlegen ist eine Zugangsdaten-Aktion und braucht Fatihs ausdrückliche Freigabe (§11, Schritt 3a).
- Bis dahin ist jede Grenze für mich eine Selbstverpflichtung, die Fatih beim Zuschauen kontrolliert. Das reicht für betreute Ausführung, nicht für unbeaufsichtigte.

## 8. Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| Lauf bricht mitten in der Arbeit ab | nächster Lauf setzt am Zweig fort; Entwurfs-Pull-Request zeigt Stand |
| Zwei Läufe gleichzeitig | zweiter Lauf sieht Anspruch (Zweig/Entwurfs-PR) und beendet sich; Parallelität ist ohnehin aus |
| CI-Flackern | eine Wiederholung erlaubt und im Pull-Request vermerkt; häufig → eigene Aufgabe |
| Reviewer sagt NICHT SICHER | zählt als Review-Runde; nach 2 Runden Stopp |
| Aufgabe braucht Klasse C | Lauf bereitet vor (Vorschlag, Text), stoppt, meldet Fatih |
| Zugangsdaten fehlen/abgelaufen | Stopp mit Hinweis; Maschine meldet sich nicht selbst an |

## 9. Einführung in Stufen

0. **Jetzt:** nur Vorbereitung (§10 „Jetzt vorbereiten“). Nichts aktiv.
1. **Betreut:** M0-Aufgaben und M1 in Sitzungen mit Fatih; alle Schritte von §4 von Hand ausgeführt, Statusdateien gepflegt.
2. **Betreut mit Plan:** erster Meilenstein (M1) als überwachter Lauf; Fatih sieht Läufe und Pull Requests.
3. **Geplante Läufe:** eine Aufgabe je Lauf, tagsüber, mit Benachrichtigung; verlängerte Dauer erst nach störungsfreien Läufen.
4. **Mehr Autonomie:** längere Zeiträume, ggf. zweite Parallelspur. Nur nach Review der bisherigen Läufe.

## 10. Vorbereiten oder freigeben?

**Jetzt vorbereiten (Klasse A/B, im Pull Request #27 oder Folge-PR, ohne Freigabe für Betrieb):**
Dokumente (diese Datei, `STATUS.md`-Vorlage, `FREIGABEN.md`-Vorlage), Skripte als Entwurf (`preflight.sh`, `test-integrity.sh`) als nicht aktive Dateien, Tests für Invarianten, Pull-Request-Vorlagen, Reviewer-Prompt.

**Braucht Fatihs Freigabe (Klasse C):**
Ruleset/Branch-Schutz auf `main` und `deploy`; Änderung an `deploy.yml`; Dateien in `scripts/`, `.github/`, `deploy/` aktiv schalten; Hooks aktivieren; Anlage geplanter Aufgaben; Anmeldung von Claude Code auf seinem Rechner; privates Repository; Entscheidungen zu `permissions.ts`; jede Zahlung/jeder neue Dienst.

## 11. Priorisierter Plan

| Nr. | Schritt | Wer | Klasse | Hart für unbeaufsichtigte Entwicklung? |
| --- | --- | --- | --- | --- |
| 1 | PR #27: Spezifikation genehmigen (Kommentar nach §3a), **Merge getrennt davon** erlauben | Fatih | – | ja |
| 2 | M0-04 `deploy.yml`: Schreibrecht für Pull-Request-Läufe entfernen (zuerst, unabhängig von Schritt 3) | Maschine bereitet vor, Fatih gibt frei | C | **ja** |
| 3 | M0-03 Ruleset auf `main` (+ `deploy`), Administratoren eingeschlossen, danach Gegenversuch | Fatih setzt, Maschine prüft | C | **ja** |
| 3a | Eigenes GitHub-Konto (oder App) für den Agenten mit eng begrenztem Token, Rechte nur dieses Repository, kein Admin (§7a) | Fatih legt an, Maschine prüft die Wirkung | C (Zugangsdaten) | **ja für unbeaufsichtigte Läufe**; für betreute Läufe empfohlen |
| 4 | M0-14 Statusdateien, Vorprüfung, Testintegrität, Stopp-Datei | Maschine | B/C | **ja** |
| 5 | Ausführungsfläche wählen (Cloud-Sitzung betreut vs. Fatihs Rechner mit Anmeldung) | Fatih | C | ja |
| 6 | Erster betreuter Lauf auf M1 (supervised) | Maschine + Fatih | – | – |
| 7 | #23–#26 mergen, wenn Fatih bereit | Fatih | – | nein (nur Komfort/Stabilität) |
| 8 | Serverprüfung (M0-01, M0-05 bis M0-07) (read-only), PGlite-Befund, Sicherungen, privates Repo mit lesender Servermethode, Schlüsselrotation, `permissions.ts`-Entscheidungen | Fatih + Maschine | C | **nein**: nur für Merge/Auslieferung |

Unbeaufsichtigte Entwicklung ohne Schritte 2 bis 5 wäre Vertrauen auf Anweisungen statt auf Technik. Merge/Auslieferung brauchen zusätzlich Schritt 8.

## 12. Kleinste lauffähige Umsetzung

### 12.1 Bausteine (alle noch nicht gebaut)

| Baustein | Aufgabe | Klasse | Prüfbar durch |
| --- | --- | --- | --- |
| `docs/produkt/STATUS.md` und `FREIGABEN.md` (Vorlagen) | je Aufgabe Status, Zweig, Pull Request, Versuche, Beleg | A | Format wird von der Aufgabenwahl gelesen |
| `scripts/next-task.sh` (oder TypeScript-Werkzeug): liest BACKLOG, STATUS, Git und gibt genau eine Aufgabe oder den Grund für „keine“ aus | Aufgabenwahl ohne KI-Urteil | C (`scripts/`) | Tests mit Probedaten: Abhängigkeiten, Risikoklasse, belegte Aufgaben, Zyklen, Wiederaufnahme |
| `scripts/preflight.sh` | STOP, Freigabe, sauberer Baum, grüne CI, Schutz aktiv, Budgets | C | Probeläufe mit jeder Fehlbedingung |
| `scripts/test-integrity.sh` | entfernte/übersprungene/gelockerte Tests melden | C | Probe-Diffs |
| Skill `run-task` (Arbeitsanweisung für einen Lauf: Schritte aus §4) und Reviewer-Anweisung | Ablauf und Prüfauftrag | B | Probelauf |
| Tracking-Issue je Meilenstein | Übersicht für Fatih | A | sichtbar in GitHub |

Bereits geprüft: Das Aufgabenformat in `BACKLOG.md` (`- **ID Titel** · Klasse · Abhängigkeiten · Text`) lässt sich vollständig maschinell lesen. Am 13.11.2026 wurden alle Aufgaben bis auf drei fehlerhaft formatierte (M7-07, M7-08, M7-09; inzwischen korrigiert) erkannt; ein Test dafür gehört zu `next-task`.

### 12.2 Testplan: was die erste betreute Ausführung beweisen muss

| Nr. | Prüfung | Nachweis |
| --- | --- | --- |
| T1 | Aufgabenwahl: wählt M1-07, nicht M1-01 (offene Abhängigkeit M0-13), keine Klasse C | Ausgabe von `next-task`, Probe mit Gegenbeispielen |
| T2 | Umsetzung auf eigenem Zweig `task/m1-07-…`, Entwurfs-PR als Anspruch | Zweig, PR |
| T3 | `tsc`, `vitest`, `build` und Browserdurchgang | echte Ausgaben, Bildschirmfotos |
| T4 | Unabhängiger Review durch frischen Agenten, mindestens eine absichtlich eingebaute Probe-Schwäche wird gefunden (z. B. fehlender Schultrennungs-Test) | Reviewer-Bericht |
| T5 | Korrektur im Budget (höchstens 3/2 Runden); Überschreitung führt zu „blockiert“ | Zähler in STATUS |
| T6 | PR mit Belegen, Stand in `STATUS.md`, Sitzung endet | PR-Text, STATUS |
| T7 | Neue, frische Sitzung: erkennt M1-07 als erledigt, erzeugt keinen zweiten Zweig, wählt M1-08 | Ausgabe von `next-task`, Git-Zustand unverändert |
| T8 | Gegenprobe: gesetzte `STOP`-Datei verhindert den Start; ein Diff in `.github/` verhindert das Öffnen des PR | Probeläufe |

### 12.3 Technische Schutzmaßnahmen vor der ersten betreuten Ausführung

Betreut heißt: Fatih sieht zu und kann abbrechen. Mindestens nötig:
1. M0-04 erledigt (Pull-Request-Läufe ohne Schreibrecht), sonst gilt die lokale Diff-Prüfung als einzige Sperre.
2. Ruleset auf `main` und `deploy` (M0-03), mit Gegenprobe. Hinweis §7a: gegen mein eigenes Konto wirkt es nur teilweise.
3. Meilenstein-Zweig `meilenstein/m1-verwaltung` angelegt; Freigabe nach §3a vorhanden; `STOP`-Mechanismus und `preflight.sh` getestet.
4. `test-integrity.sh` und Review-Anweisung vorhanden.
5. Weder Produktions-Zugangsdaten noch Serverzugang in der Sitzung (belegt für diese Umgebung).

Zusätzlich nötig **vor unbeaufsichtigten Läufen:** eigenes Agentenkonto mit eng begrenztem Token (§7a), Ruleset ohne Umgehungsrecht, getestete geplante Ausführung samt Benachrichtigung, mindestens ein vollständig bestandener Durchgang T1–T8 und das Urteil von Fatih darüber.

### 12.4 Was belegt, was nur dokumentiert ist

| Fähigkeit | Stand |
| --- | --- |
| GitHub-REST-Zugriff, PRs, Kommentare, Pull-Request-Läufe, Zweige | **getestet** (diese Sitzung) |
| Identität der Sitzung ist Fatihs Konto | **getestet** |
| Unabhängige Reviewer als frische Agenten | **getestet** (mehrere Durchgänge) |
| Backlog maschinell lesbar | **getestet** (Skript, 13.11.) |
| `claude -p` / externe Schleife | **getestet: nicht nutzbar** (nicht angemeldet) |
| Claude-Code-Befehle `--bg`, `agents`, `--worktree`, `--permission-mode` vorhanden | **getestet** (nur Hilfeausgabe; Verhalten ungeprüft) |
| `/goal`, `/loop`, Auto-Modus, Hooks, Berechtigungsregeln | nur **laut Dokumentation** |
| Geplante Aufgaben (`create_trigger`), `send_later` | Werkzeuge vorhanden, **nicht erprobt**; Erprobung nur mit unschädlicher Probeaufgabe und Fatihs Freigabe |

### 12.5 Sofort vorbereitbar ohne Merge, Auslieferung, Produktionszugriff oder sicherheitskritischen Code

Kriterium: Klasse A (oder B ohne Migration und ohne Rechteänderung), kein Eingriff in `permissions.ts`, Authentifizierung, Sitzungen, RLS, `.github/`, `deploy/`, `scripts/`, `CLAUDE.md`, keine neue Abhängigkeit, nur erfundene Daten. Die Arbeit läuft auf einem Task-Zweig mit Entwurfs-PR, ohne Merge.

- Sofort geeignet: **M1-07** (Personenliste), **M1-08** (Import), **M1-10** (E-Mail-Texte, nach M1-01), **M1-13** (Stundenplan, nach M1-11), **M2-01/02/03/05/07/08** (Oberfläche, Texte), **M3-03/04**, **M4-01/02/04–08** (Bewertungslogik ohne Datenbank, Editor, Ansichten), **M6-04**, **M7-07/09** (Dokumente).
- Erst nach Meilenstein-Freigabe mit Stopp-Punkt: Klasse-B-Aufgaben mit Migration oder Recht (M1-02, M1-03, M1-05, M1-06, M1-09, M1-11, M2-04, M2-06, M3-02, M3-05, M3-06, M4-03).
- Nur mit Fatihs Einzelfreigabe: alle Klasse C.

**Sichtbare Auslieferungs-Blocker (bleiben offen, werden nicht übergangen):** M0-01 Serverprüfung, M0-06 Datenbeständigkeit, M0-07 Sicherung und Wiederherstellung, M0-08 Befunde zu `permissions.ts`, M0-05 privates Repo mit lesendem Server-Zugang. Sie hindern keinen Task-Zweig, aber **jeden Merge nach `main`, jede Auslieferung und jeden Pilot mit echten Daten.** Jeder Meilenstein-Pull-Request nach `main` enthält eine Zeile je Blocker mit aktuellem Stand.
