# Autonome Entwicklung bei Kurswerk: Ausführungsarchitektur

Status: **ENTWURF zur Freigabe durch Fatih. Nichts davon ist aktiviert.** Stand 13.11.2026.
„Belegt“ heißt: in dieser Umgebung gesehen oder ausprobiert. „Laut Dokumentation“ heißt: nicht ausprobiert. „Ungeprüft“ heißt: unbekannt.

## 1. Grundsatz

Entwicklungsautonomie ist nicht Betriebsautonomie. Die Entwicklungsmaschine darf in einem freigegebenen Meilenstein planen, bauen, testen, prüfen lassen und Pull Requests auf einen **Meilenstein-Zweig** bringen. Sie darf nie: in geschützte Zweige mergen, ausliefern oder Auslieferung anstoßen, Auslieferungs- oder Infrastrukturkonfiguration ändern, Zugangsdaten oder Repository-Sichtbarkeit ändern, Produktivdatenbank oder echte Teilnehmerdaten anfassen, sensible Rechte- oder Sicherheitsarchitektur ändern, sensible Migrationen ausführen, kostenpflichtige Dienste einführen oder Personendaten an neue Dritte senden. Dafür braucht es je Fall eine eigene, ausdrückliche Freigabe für genau diese Aktion und dieses Ziel. Frühere Freigaben gelten nicht weiter. Zusätzlich darf der Agent nie selbst ändern: `CLAUDE.md`, `ZIEL.md`, `BACKLOG.md`, `AUTONOMIE.md`, `FREIGABEN.md`, `STOP`, `.github/`, `deploy/`, `scripts/`, `.githooks/`, `.claude/`, Test- und Build-Konfiguration, Rechtstexte; keine neuen Pakete oder CI-Schritte; kein Versand an Dritte; kein Force-Push, keine Verlaufsänderung, kein Löschen von Zweigen (vollständige Liste: BACKLOG.md §3). **Bis `CLAUDE.md` in M0-11 angepasst ist, gilt dessen Regel „Fatih merged“ unverändert: der Agent mergt nichts, auch nicht in Meilenstein-Zweige.** Die Meilenstein-Zweig-Regel wird erst mit M0-14 und einer wirksamen Freigabe aktiv.

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
- `docs/produkt/STATUS.md` (neu in M0-14): je Aufgabe Status (offen / begonnen / in Prüfung / fertig = im Meilenstein-Zweig / blockiert), Zweig, Pull-Request-Nummer, Datum, Nachweisverweis, nächster Schritt, Blockade in einfacher Sprache. Wird im Aufgabenzweig geändert und mit dem Task-Pull-Request in den Meilenstein-Zweig gebracht, nie direkt auf `main`. Die Aufgabenwahl liest den Stand des Meilenstein-Zweigs und Git; „begonnen“ ist allein durch Zweig plus Entwurfs-Pull-Request belegt, begonnene Aufgaben werden vor neuen fortgesetzt.
- `docs/produkt/FREIGABEN.md` (neu in M0-14): Freigaben von Fatih (Meilenstein, Datum, Umfang, ausgeschlossene Aktionen). Wirksam **nur**, wenn die Datei durch einen von Fatih gemergten Pull Request geändert wurde. Fatih legt die Datei an und committet jeden Eintrag selbst; ich bereite nur Wortlaut und Vorlage unter `docs/produkt/entwurf/` oder als Kommentar vor. Ein Eintrag zählt nur, wenn der Commit ausschließlich diese Datei ändert und per eigenem Pull Request von Fatih auf `main` kam; ein Eintrag, der mit einem Meilenstein-Pull-Request mitkommt, zählt nicht (die Vorprüfung prüft die Historie der Datei). Eine Freigabe im Chat ist nie die Freigabe.
- `docs/produkt/STOP`: Existiert die Datei auf `main`, startet kein Lauf. Weil das Ruleset auch Administratoren bindet, geht das Anlegen nur per Pull Request und Merge; schneller sind zwei Alternativen, die in M0-14 gewählt werden: das Beenden der geplanten Aufgabe oder eine Repository-Variable, die die Vorprüfung liest (ungeprüft).
- Nachweise je Aufgabe im Pull-Request-Text: Befehle mit echter Ausgabe, Browserbelege, Reviewer-Urteil, Anzahl Korrekturrunden.
- Meilenstein-Übersicht: ein Tracking-Ticket (GitHub-Issue) je Meilenstein mit Checkliste; wird beim Merge einer Aufgabe aktualisiert.

### 3a. Freigaben, bevor die Freigabe-Infrastruktur gemergt ist

Bis zum **ersten wirksamen Eintrag** in `FREIGABEN.md` auf `main` gilt dieses Verfahren (danach gilt für Meilensteine nur der Eintrag; Einzelfreigaben einer Klasse-C-Aktion mitten im Lauf erteilt Fatih per Kommentar im Task-Pull-Request mit dem Hash der Aktion, gültig nur für diese Aktion):
1. **Eine Chat-Nachricht ist nie eine Freigabe.** Sie ist ein Auftrag an mich, den Wortlaut vorzubereiten. Das gilt auch für „sieht gut aus“ oder „weiter“.
2. **Drei getrennte Entscheidungen, drei getrennte Aufzeichnungen,** jeweils bezogen auf einen festen Commit:
   - *Spezifikation genehmigt* (Inhalt von ZIEL, BACKLOG, AUTONOMIE),
   - *Merge erlaubt* (diesen Pull Request in `main` zusammenführen, mit dem Wissen, dass ein Merge auf `main` laut `deploy.yml` den Bau und die Veröffentlichung im Zweig `deploy` auslöst; Abholung durch den Server und Neustart sind laut Konfiguration vorgesehen, ihre Folgen für die Daten der Testumgebung ungeprüft),
   - *Meilenstein freigegeben* (Umfang, ausgeschlossene Aktionen).
3. **Form der Aufzeichnung:** ein Kommentar von Fatih in seinem Browser unter dem Pull Request, nach einer Vorlage, die ich ihm bereitstelle, z. B. `FREIGABE Spezifikation: ZIEL/BACKLOG/AUTONOMIE im Stand <voller Commit-Hash>. Merge: noch nicht erlaubt.` Gilt nur, wenn der Hash dem aktuellen Kopf des Pull Requests entspricht; jede weitere Änderung macht die Freigabe unwirksam.
4. **Ehrliche Grenze:** Mein Werkzeug handelt unter Fatihs Konto (§7a), ein Kommentar ist technisch also nicht fälschungssicher. Schutz bieten (a) meine feste Regel, nie einen Kommentar dieser Form zu schreiben und nie `merge`-Aufrufe der API auszuführen, (b) Fatihs Sichtkontrolle, (c) ab dem eigenen Agentenkonto die technische Trennung. Der Hash-Bezug stellt sicher, dass nach meinen Änderungen nichts als freigegeben durchgeht. Hinweis: Ein Ruleset mit Pflicht zu einem Review würde mit nur einem Konto auch Fatih selbst blockieren; bis zum Agentenkonto verlangt das Ruleset deshalb nur Pull Request und grüne Prüfungen, nicht die Freigabe durch eine zweite Person.
5. **Wirksam für Meilensteine** ist erst der Eintrag in `FREIGABEN.md`, der über einen von Fatih gemergten Pull Request auf `main` gelangt ist. Für M0 genügt bis zum ersten wirksamen Eintrag in `FREIGABEN.md` der Kommentar nach Punkt 3 plus Fatihs Anwesenheit; danach gilt nur noch der Eintrag.
6. **Warum PR #27 nicht zusammen mit der Genehmigung gemergt wird:** ein Merge löst auf `main` Bau und Veröffentlichung im Zweig `deploy` aus (belegt: `deploy.yml`, kein Pfadfilter, also auch bei reiner Dokumentation). Dass der Server den Zweig alle fünf Minuten abholt, steht laut Kommentar im Workflow und in der Cron-Beschreibung; ein Neustart und seine Folgen für die Daten der Testumgebung sind ungeprüft (M0-06). Eine Änderung von `deploy.yml`, die Dokumentationsänderungen ausnimmt, ist als Teil von M0-04 vorzuschlagen (Klasse C).

## 4. Ablauf einer Aufgabe (ein Lauf = eine Aufgabe)

1. **Vorprüfung** (`scripts/preflight.sh`, neu): `STOP` fehlt; Freigabe für den Meilenstein in `FREIGABEN.md` auf `main` (vor dem ersten Eintrag prüft Fatih das von Hand nach §3a); „fertig“ wird aus gemergten Task-Pull-Requests im Meilenstein-Zweig abgeleitet, nicht allein aus dem Text von `STATUS.md`; Arbeitsbaum sauber; CI auf `main` und dem Meilenstein-Zweig grün; Branch-Schutz laut Abfrage aktiv; Aufgabenbudget nicht erschöpft. Fehlt etwas: Lauf endet mit Statusnotiz, nichts wird gebaut.
2. **Aufgabe wählen:** erste Aufgabe **des freigegebenen Meilensteins** in der Reihenfolge von `BACKLOG.md` mit Status „offen“, deren Abhängigkeiten alle „fertig“ sind (Aufgaben-IDs). Freitext-Bedingungen (z. B. „Fachperson“, „Rechtsprüfung“) gelten nur als erfüllt, wenn Fatih sie in `FREIGABEN.md` bestätigt hat. „Frage N“ gilt als erfüllt, wenn `ZIEL.md` §8 auf `main` sie als vorläufig oder endgültig entschieden oder als Arbeitsannahme führt und die Spezifikation genehmigt ist. Ausnahmen: Frage 6 (Pilot) und Frage 7 (Budget) gelten erst mit konkreten Werten, die Fatih in `FREIGABEN.md` bestätigt hat. M0-Aufgaben gelten als „fertig“, wenn sie auf `main` gemergt sind. Risikoklasse A oder B; Migrationen und Rechte, die im Meilenstein unter „Freigegebene Rechte- und Datenbankänderungen“ stehen, laufen ohne weitere Rückfrage, alles Nicht-Aufgeführte ist ein Stopp. `BACKLOG.md` und `ZIEL.md` werden nur von `main` gelesen. Eine Startreihenfolge in der Freigabe geht der Reihenfolge im Backlog vor. Gibt es keine, endet der Lauf mit dem Grund.
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
| Kein Merge in `main` ohne Fatih | GitHub-Ruleset auf `main` (Pull Request nötig, Prüfungen nötig, **Administratoren eingeschlossen**) | **nicht aktiv** (Branch ungeschützt; Plan-Verfügbarkeit bei privatem Repo ungeprüft). Auch nach M0-03 **gegen den Agenten wirkungslos**, solange er mit Fatihs Konto handelt: er könnte seinen Pull Request bei grüner CI selbst mergen. Wirksam erst mit Agentenkonto (§11, 3a) |
| Keine Auslieferung ohne Fatih | Ruleset auf Zweig `deploy` (nur wenn der Auslieferungsschritt davon ausgenommen werden kann, sonst nur `main`; ungeprüft); Workflow schreibt nur bei Push auf `main`; Pull-Request-Läufe ohne Schreibrecht (M0-04) | **nicht aktiv**; Pull-Request-Läufe haben heute Schreibrecht (belegt) |
| Kein Zugang zu Produktivdaten/Servern | Umgebung ohne Server- und Datenbankzugang | belegt: kein Server-/Datenbankzugang. **Nicht** belegt: keine Zugangsdaten überhaupt; die Sitzung hat ein GitHub-Token mit Schreibrecht |
| Agent-Identität auf GitHub | eigenes, eng begrenztes Token (nur dieses Repo, kein Admin) und Ruleset ohne Umgehungsrecht; `meilenstein/*` und `task/*` bleiben beschreibbar | nicht eingerichtet (M0-14, Klasse C) |
| Pull Request mit geänderter `deploy.yml` vor M0-04 | Workflow läuft mit Schreibrecht schon beim Öffnen des Pull Requests; bis M0-04 öffnet der Agent nur Pull Requests, deren Diff ausschließlich `docs/` betrifft ; geschützte Dateien (auch für M0-04) bereitet er als Diff unter `docs/produkt/entwurf/` oder als Patch im Kommentar vor, Fatih liest ihn mit einem frischen Reviewer, wendet ihn selbst an, öffnet den Pull Request und merged | Regel nur als Anweisung, bis M0-04 erledigt ist |
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
Dokumente (diese Datei, `STATUS.md`-Vorlage, `FREIGABEN.md`-Vorlage nur als Entwurf unter `docs/produkt/entwurf/`), Entwürfe der Skripte als Text unter `docs/produkt/entwurf/` (nicht unter `scripts/`, nicht ausführbar; Inkraftsetzen ist M0-14, Klasse C), Tests für Invarianten, Pull-Request-Vorlagen, Reviewer-Prompt.

**Braucht Fatihs Freigabe (Klasse C):**
Ruleset/Branch-Schutz auf `main` und `deploy`; Änderung an `deploy.yml`; Dateien in `scripts/`, `.github/`, `deploy/` aktiv schalten; Hooks aktivieren; Anlage geplanter Aufgaben; Anmeldung von Claude Code auf seinem Rechner; privates Repository; Entscheidungen zu `permissions.ts`; jede Zahlung/jeder neue Dienst.

## 11. Priorisierter Plan

| Nr. | Schritt | Wer | Klasse | Hart für unbeaufsichtigte Entwicklung? |
| --- | --- | --- | --- | --- |
| 1 | PR #27: Spezifikation genehmigen (Kommentar nach §3a), **Merge getrennt davon** erlauben | Fatih | – | ja |
| 2 | M0-04 `deploy.yml`: Schreibrecht für Pull-Request-Läufe entfernen (zuerst, unabhängig von Schritt 3) | Maschine bereitet vor, Fatih gibt frei | C | **ja** |
| 3 | M0-03 Ruleset auf `main` (+ `deploy`): Pull Request und grüne Prüfungen verlangt, kein Direkt-Push, kein Force-Push, Administratoren eingeschlossen; Review-Pflicht erst mit Agentenkonto (3a); danach Gegenversuch | Fatih setzt, Maschine prüft | C | **ja** |
| 3a | Eigenes GitHub-Konto (oder App) für den Agenten mit eng begrenztem Token, Rechte nur dieses Repository, kein Admin (§7a) | Fatih legt an, Maschine prüft die Wirkung | C (Zugangsdaten) | **ja für unbeaufsichtigte Läufe**; für betreute Läufe empfohlen |
| 3b | M0-08 (Entscheidungen zu `permissions.ts`), M0-10 (Invarianten als Tests), M0-11 (`CLAUDE.md`) | Fatih entscheidet, Maschine bereitet vor | B/C | **ja** (Bedingungen von M0-14) |
| 4 | M0-14 Statusdateien, Vorprüfung, Testintegrität, Stopp-Datei | Maschine bereitet vor, Fatih gibt frei | C | **ja** |
| 5 | Ausführungsfläche wählen (Cloud-Sitzung betreut vs. Fatihs Rechner mit Anmeldung) | Fatih | C | ja |
| 6 | Erster betreuter Lauf auf M1 (supervised) | Maschine + Fatih | – | – |
| 7 | Serverprüfung (M0-01, read-only), Merge von #23–#26 (M0-02), privates Repo mit lesender Servermethode und Schlüsselrotation (M0-05), PGlite-Befund (M0-06), Sicherung und Wiederherstellung (M0-07) | Fatih + Maschine | C | **nein**: nur für Merge/Auslieferung |

Unbeaufsichtigte Entwicklung ohne Schritte 2 bis 5 (einschließlich 3a und 3b) wäre Vertrauen auf Anweisungen statt auf Technik. Der Merge von PR #27 und der M0-Konfigurations-Pull-Requests läuft einzeln nach §3a (Deploy bewusst in Kauf genommen). Meilenstein-Pull-Requests mit Produktcode nach `main`, Auslieferung für echte Nutzung und Pilot brauchen zusätzlich Schritt 7.

## 12. Kleinste lauffähige Umsetzung

### 12.1 Bausteine (alle noch nicht gebaut)

| Baustein | Aufgabe | Klasse | Prüfbar durch |
| --- | --- | --- | --- |
| `docs/produkt/STATUS.md` und `FREIGABEN.md` (Vorlagen) | je Aufgabe Status, Zweig, Pull Request, Versuche, Beleg | A | Format wird von der Aufgabenwahl gelesen |
| `scripts/next-task.sh` (oder TypeScript-Werkzeug): liest BACKLOG, STATUS, Git und gibt genau eine Aufgabe oder den Grund für „keine“ aus | Aufgabenwahl ohne KI-Urteil | C (`scripts/`) | Tests mit Probedaten: Abhängigkeiten, Risikoklasse, belegte Aufgaben, Zyklen, Wiederaufnahme |
| `scripts/preflight.sh` | STOP, Freigabe, sauberer Baum, grüne CI, Schutz aktiv, Budgets | C | Probeläufe mit jeder Fehlbedingung |
| `scripts/test-integrity.sh` | entfernte/übersprungene/gelockerte Tests melden | C | Probe-Diffs |
| Skill `run-task` (Arbeitsanweisung für einen Lauf: Schritte aus §4) und Reviewer-Anweisung | Ablauf und Prüfauftrag | B | Probelauf |
| `scripts/check-protected-paths.sh` als Pflichtprüfung in der CI, ausgeführt aus dem Stand von `main` (nicht aus dem Stand des Pull Requests; Machbarkeit wird in M0-14 belegt): lehnt Diffs auf geschützte Pfade ab, außer bei Pull Requests, die Fatih selbst eröffnet hat | C | Probe-Diffs für jeden geschützten Pfad |
| Tracking-Issue je Meilenstein | Übersicht für Fatih | A | sichtbar in GitHub |

Bereits geprüft: Das Aufgabenformat in `BACKLOG.md` (`- **ID Titel** · Klasse · Abhängigkeiten · Text`) lässt sich nach Vereinheitlichung (ein Strich-Zeichen „—“, nur Aufgaben-IDs, „Frage N“ oder ein Freitext-Tag im Abhängigkeitsfeld) maschinell lesen; ein Parser-Test, der Abweichungen meldet, gehört zur Abnahme von M0-14. Am 13.11.2026 wurden alle Aufgaben bis auf drei fehlerhaft formatierte (M7-07, M7-08, M7-09; inzwischen korrigiert) erkannt; ein Test dafür gehört zu `next-task`.

### 12.2 Testplan: was die erste betreute Ausführung beweisen muss

| Nr. | Prüfung | Nachweis |
| --- | --- | --- |
| T1 | Aufgabenwahl: wählt mit der in der Freigabe genannten Startreihenfolge M1-07; Gegenproben: ohne Startreihenfolge wäre M1-01 die erste; M1-02 wird nicht gewählt (Vorgänger M1-01 nicht fertig); keine Aufgabe aus M0 oder Klasse C | Ausgabe von `next-task`, Probe mit Gegenbeispielen |
| T2 | Umsetzung auf eigenem Zweig `task/m1-07-…`, Entwurfs-PR als Anspruch | Zweig, PR |
| T3 | `tsc`, `vitest`, `build` und Browserdurchgang | echte Ausgaben, Bildschirmfotos |
| T4 | Unabhängiger Review durch frischen Agenten, mindestens eine absichtlich eingebaute Probe-Schwäche wird gefunden (z. B. fehlender Schultrennungs-Test) | Reviewer-Bericht |
| T5 | Korrektur im Budget (höchstens 3/2 Runden); Überschreitung führt zu „blockiert“ | Zähler in STATUS |
| T6 | PR mit Belegen, Stand in `STATUS.md`, Sitzung endet | PR-Text, STATUS |
| T7 | Neue, frische Sitzung: erkennt M1-07 als „fertig“ (im Meilenstein-Zweig), erzeugt keinen zweiten Zweig, wählt nach der Startreihenfolge M1-08 | Ausgabe von `next-task`, Git-Zustand unverändert |
| T8 | Gegenprobe: gesetzte `STOP`-Datei verhindert den Start; der Pfadprüfer (`check-protected-paths`, §12.1) lehnt einen Probe-Diff in `.github/` und in `FREIGABEN.md` ab | Probeläufe |

### 12.3 Technische Schutzmaßnahmen vor der ersten betreuten Ausführung

Betreut heißt: Fatih sieht zu und kann abbrechen. Maßgeblich ist der M0-Ausgang in `BACKLOG.md` (M0-04, M0-03, M0-08, M0-10, M0-11, M0-14); die Liste hier ist die Kurzfassung der technischen Seite, wobei Vorprüfung, Testintegrität und Reviewer-Anweisung zu M0-14 gehören. Mindestens nötig:
1. **M0-04 erledigt (zwingend):** `deploy.yml` hat Schreibrecht und führt bei jedem Pull Request Repository-Code aus (`npm ci`, Tests, Paketbau). Jeder Pull Request eines Agenten, auch ohne Änderung an `.github/`, könnte das Token im Lauf missbrauchen (nicht ausprobiert). Eine lokale Diff-Prüfung genügt dafür nicht. Bis M0-04 öffnet der Agent daher nur Pull Requests, deren Diff ausschließlich `docs/` betrifft.
2. Ruleset auf `main` und `deploy` (M0-03), mit Gegenprobe. Hinweis §7a: gegen mein eigenes Konto wirkt es nur teilweise.
3. Entscheidungen zu `permissions.ts` (M0-08), Invarianten-Tests (M0-10) und angepasste `CLAUDE.md` (M0-11) liegen vor; Meilenstein-Zweig `meilenstein/m1-verwaltung` angelegt; Freigabe nach §3a vorhanden; `STOP`-Mechanismus und `preflight.sh` getestet.
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

- **Beginn von Meilenstein-Läufen frühestens nach M0-04 und M0-Ausgang;** bis M0-04 nur Pull Requests, die ausschließlich `docs/` ändern; danach dürfen M0-08, M0-10 und M0-12 als Agent-Pull-Requests laufen (keine geschützten Pfade), einzeln von Fatih gemergt. Sofort geeignet (per Skript aus den Abhängigkeiten ermittelt, 13.11.2026: Klasse A, Kette der Vorgänger besteht nur aus Klasse A): **M1-07** und **M1-01** ohne Vorgänger; danach **M1-08** (nach M1-07), **M1-10** (nach M1-01); **M4-01** und danach **M4-02** (Bewertungslogik ohne Datenbank); **M7-09** (Aussagen-Prüfung, sinnvoll erst spät) sowie **M2-01**, dann **M2-02, M2-03, M2-05, M2-07, M2-08** (Oberfläche, jeweils in dieser Reihenfolge gestapelt, nach M1-01) sowie **M0-12** (README, Klasse A ohne Vorgänger). Diese Aufgaben dürfen erst beginnen, wenn ihr Meilenstein freigegeben ist (§3a); Heute ist **kein** Meilenstein freigegeben (kein `FREIGABEN.md`); M0-12 braucht als Teil von M0 ebenfalls eine Freigabe.
- Nicht sofort, obwohl Klasse A: Aufgaben mit Vorgängern der Klasse B oder C (z. B. M1-13 hinter M1-11 und M1-06, M3-03/04 hinter M3-02, M4-04 bis M4-08 hinter M4-03, M6-04 hinter M1-06, M7-07 hinter M7-02 und M5-04).
- Klasse-B-Aufgaben mit Migration oder Recht laufen nur, soweit die Änderung im Meilenstein unter „Freigegebene Rechte- und Datenbankänderungen“ steht; alles Weitere ist ein Stopp (M1-02, M1-03, M1-05, M1-06, M1-09, M1-11, M2-04, M2-06, M3-02, M3-05, M3-06, M4-03).
- Nur mit Fatihs Einzelfreigabe: alle Klasse C.

**Sichtbare Auslieferungs-Blocker (bleiben offen, werden nicht übergangen):** M0-01 Serverprüfung, M0-06 Datenbeständigkeit, M0-07 Sicherung und Wiederherstellung, M0-08 Befunde zu `permissions.ts`, M0-05 privates Repo mit lesendem Server-Zugang. Sie hindern keinen Task-Zweig, aber **jeden Meilenstein-Merge mit Produktcode nach `main`, jede Auslieferung für echte Nutzung und jeden Pilot mit echten Daten.** Jeder Meilenstein-Pull-Request nach `main` enthält eine Zeile je Blocker mit aktuellem Stand.
