# M0-04 Umsetzungsanleitung für Fatih (ENTWURF, nichts davon ist aktiv)

Stand 13.11.2026. Grundlage: der geprüfte Zwei-Jobs-Entwurf in diesem Ordner (`deploy.yml.txt`, `deploy-ruleset.json`, `workflow-invariants.test.ts.txt`,
Begründungen in `EINRICHTUNG.md`). Die Architektur ist eingefroren. Geändert wird sie nur bei einem Sicherheitsfehler.

**Wichtig:** Diese Anleitung bittet Dich noch um nichts. Jeder Schritt unten braucht Deine eigene, ausdrückliche Freigabe für genau diesen Schritt.
Eine Freigabe für Schritt B erlaubt nie Schritt C. Claude richtet nichts ein, ändert keine GitHub-Einstellungen, legt keine Schlüssel an, merged und liefert nicht aus.

## 1. Was ist durch Tests belegt, was braucht GitHub live

| Schutz | Belegt durch | Status |
|---|---|---|
| Workflow-Datei hat nur Leserechte außer im Auslieferungsjob, kein Checkout/npm dort, Prüfsumme, Pins, `private == false`-Bedingung | `workflow-invariants.test.ts` (13 Tests, 12 Sabotage-Versuche erkannt), `tsc` | **lokal belegt** (Frühwarnung: ein PR kann den Test ändern) |
| Gebautes Paket kommt unverändert auf `deploy` (gleicher Git-Inhalt, Links ok) | Rundlauf mit echtem `bundle.sh` | **lokal belegt** |
| Pfad-/Link-Prüfung lehnt `..`, absolute Pfade, `.git`, `.github`, Hardlinks, absolute Symlinks ab | Funktionstest mit Probearchiven | **lokal belegt** |
| PR-Token kann nicht auf `deploy` schreiben | Regelsatz auf GitHub | **nur live prüfbar** (Probe A) |
| PR-Lauf bekommt den Schlüssel nicht | Umgebungsregel auf GitHub | **nur live prüfbar** (Probe B) |
| Auslieferung wartet auf Deine Freigabe | Umgebung mit Required reviewer | **nur live prüfbar** (Probe C/E) |
| Ein Agent mit Deinem Konto kann die Freigabe nicht selbst geben | getrennte Identität | **heute nicht erfüllbar** (siehe 4) |
| Server holt `deploy` nach dem ersten neuen Stand weiter | Namecheap-Cron | **nur live prüfbar** (Probe C) |

## 2. Welche Einstellung braucht welchen GitHub-Tarif
(Quelle: GitHub-Dokumentation, Stand der Recherche vom 13.11.2026; nichts davon an Deinem Konto geprüft. Schritt A klärt das.)
- Deploy-Keys: jeder Tarif.
- Regelsätze (Rulesets): öffentliche Repositories im Free-Tarif; private Repositories brauchen Pro/Team.
- Environments und Environment-Secrets: öffentlich in jedem Tarif; privat nur Pro/Team.
- Environment-„Required reviewers“ (Deine Freigabe) und Wartezeit: **nur öffentliche Repositories**; privat nur mit Enterprise.
- „Deployment branches“ (nur `main`): öffentlich jeder Tarif; privat Pro/Team.
- Stellst Du das Repository auf privat, werden Schutzregeln und Environment-Secrets ohne passenden Tarif **ignoriert**. Die Workflow-Datei hält dann an (Bedingung `private == false`).
Folge: Repository bleibt öffentlich, bis ein Plan für privat entschieden ist. Es liegen keine Zugangsdaten im Repository (Regel in `CLAUDE.md`).

## 3. Ablauf in sechs getrennt freigegebenen Schritten

Jeder Schritt hat: Zweck, wer handelt, Beleg, Abbruchbedingung, Rückweg. Freigabe-Satz je Schritt zum Kopieren steht in 6.

### Schritt A: Tarif und verfügbare Schutzfunktionen prüfen (nur ansehen)
Du: Settings → Billing and plans (Tarif notieren). Settings → Rules → Rulesets: ist „New ruleset“ benutzbar? Settings → Environments: ist „New environment“ benutzbar,
und gibt es später im Environment die Optionen „Required reviewers“ und „Deployment branches“? Settings → Deploy keys: gibt es schon Schreib-Keys? Notiere außerdem die aktuelle
Auslieferungsversion: auf Deinem Rechner `git ls-remote https://github.com/fatihcicek/sprachschul-plattform deploy` (die lange Nummer aufheben, siehe Rückweg).
Beleg: Du schickst mir Tarifname und „ja/nein“ je Funktion. Abbruch: fehlt „Required reviewers“ oder „Rulesets“, geht es nicht weiter (Rückfrage an Dich, kein Fallback mit schwächerem Schutz ohne Deine Entscheidung).

### Schritt B: Mindestschutz einrichten und testen (Einstellungen, noch keine Dateiänderung)
Du, in dieser Reihenfolge:
1. Schlüsselpaar auf Deinem Rechner: `ssh-keygen -t ed25519 -N "" -C kurswerk-deploy -f kurswerk-deploy`.
2. Settings → Deploy keys → Add: öffentlichen Teil (`kurswerk-deploy.pub`), **Allow write access** anhaken.
3. Settings → Environments → New → Name genau `auslieferung`. Required reviewers: Du. Deployment branches: „Selected branches“, nur `main`. Admin-Umgehung ausschalten, falls angeboten.
   Environment secret `DEPLOY_KEY` = Inhalt der privaten Datei `kurswerk-deploy`. Danach private und öffentliche Datei auf Deinem Rechner löschen. Das Secret nur hier, nie als Repository-Secret.
4. Settings → Rules → Rulesets → Import `deploy-ruleset.json`. **Auf „Disabled“ stellen, nicht „Active“.** Prüfen: Deploy-Key erscheint als Bypass.
5. Settings → Actions → General: Workflow permissions „Read“; PRs neuer Beitragender genehmigen lassen.
6. Host-Schlüssel in `deploy.yml.txt` mit GitHubs veröffentlichtem Fingerabdruck abgleichen (erwartet `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`).
Beleg: Bildschirmfotos der Einstellungen (Schlüssel und Secret-Inhalte nie fotografieren). Abbruch: Bypass-Eintrag „Deploy key“ nicht auswählbar → stoppen. Rückweg: Umgebung, Key und Ruleset löschen; nichts anderes hing daran.
Hinweis: Dieser Schritt allein schließt die Lücke noch nicht.

### Schritt C: Den geprüften Workflow einspielen (geschützte Änderung)
Ein eigener Pull Request, der nur dies ändert: `.github/workflows/deploy.yml` (aus `deploy.yml.txt`), `tests/workflow-invariants.test.ts`, devDependency `yaml` samt `package-lock.json`, `CODEOWNERS`-Zeile für den Test.
Du liest den Diff der `.github/`-Datei selbst Zeile für Zeile; Claude öffnet diesen PR nur, wenn Du es für genau diesen PR freigibst. Der PR-Lauf zeigt grüne Prüfung (kein Auslieferungsjob läuft bei PRs).
Merge: Du. Mit dem Merge startet der **neue** Workflow auf `main`: `build` läuft, `ausliefern` wartet auf Deine Freigabe (Beleg Probe C unten).
Wichtig: Vorher gilt der **alte** Workflow, der bei jedem Merge sofort ausliefert. Merge Dich vorher bitte nirgends sonst in `main`.
Abbruch: Prüfung rot, Diff enthält mehr als genannt, oder Schritt B ist nicht abgeschlossen. Rückweg: siehe 5.

### Schritt D: Beweisen, dass unerlaubte Auslieferung scheitert
D1 (Probe C, muss gelingen, **Ruleset noch Disabled**): Der Merge aus C hat den Lauf gestartet. In GitHub → Actions → Lauf → „Review deployments“ → `auslieferung` → Approve. Erwartet: `deploy` bekommt einen neuen Commit „Paket aus <Commit>“,
nach höchstens 5 Minuten zeigt `schule.gold-code-academy.com` den Stand, das Serverprotokoll `schule_deploy.log` nennt ihn (Namecheap-Zugang: Du). Erst bei Erfolg weiter.
D2: Zuerst den Wegwerf-Zweig `deploy-test` anlegen (GitHub-Oberfläche → Branches → New branch von `main`), denn das Ruleset sperrt danach auch das Anlegen. Dann Ruleset `deploy-nur-deploy-key` auf **Active** stellen.
D3 (Proben mit unsicherem Workflow, nur auf Wegwerf-Zweigen, nur mit Deiner Freigabe je Probe): A (PR-Token mit `contents: write` pusht auf `deploy-test`: muss abgewiesen werden), B (PR-Lauf liest `DEPLOY_KEY` über `environment: auslieferung`: Job startet nicht), D (Wegwerf-Zweig ohne `if`-Bedingung, `workflow_dispatch`: Umgebung verweigert).
Beleg: Lauf-Seiten und Fehlermeldungen. Abbruch: **jede Probe, die gelingt, ist ein Sicherheitsfehler** → Ruleset und Umgebung nicht als Schutz werten, Merge-Stopp, Meldung an Dich; Claude ändert nichts selbst.
Rückweg: Probezweige löschen.

### Schritt E: Gewöhnlicher Merge braucht eigene Auslieferungsfreigabe
Eine harmlose Doku-Änderung (z. B. Tippfehler) per PR nach `main`. Erwartet: `build` grün, `ausliefern` steht auf „Waiting“, `deploy` ändert sich nicht, bis Du freigibst. Dann ablehnen („Reject“) und prüfen, dass nichts ausgeliefert wurde.
E2 (Agententest): Solange ein Lauf wartet, versucht die Sitzung des Agenten mit ihrem Zugang, die Freigabe zu geben (`pending_deployments`-Endpunkt). Heute (gleiches Konto) wird das **wahrscheinlich gelingen**: dann ist die Freigabe ein Bremsklotz für Versehen, aber **keine** Sperre gegen den Agenten. Das ist zu dokumentieren, nicht zu verstecken.
Abbruch: Auslieferung ohne Klick → Fehler.

### Schritt F: Danach erst Branch-Schutz und Agenten-Identität
(`main-ruleset.json` nach Abgleich der Prüfnamen von PR #23, `CODEOWNERS`, eigene GitHub App ohne Bypass, danach E2 wiederholen: jetzt muss die App-Freigabe abgewiesen werden.)
„Prevent self-review“ (siehe 4) wird erst hier entschieden. Jeder Teil ist eine eigene Freigabe.

## 4. Freigabeklick, Agent und „Prevent self-review“
- Die Freigabe schützt gegen Versehen sofort. Gegen einen Agenten, der **als Du** auftritt, schützt sie nicht, weil dasselbe Konto die Freigabe geben könnte. Belegt wird das erst mit Schritt E2.
- Echte Trennung braucht ein Agentenkonto/eine App, die weder Reviewer noch Admin ist (Schritt F). Dann kann der Agent Pull Requests öffnen, aber die Auslieferung nicht freigeben.
- „Prevent self-review“ verbietet, dass die Person, die den Lauf **ausgelöst** hat, ihn auch freigibt. Du löst durch Deinen Merge den Lauf aus; mit der Option an könntest Du Deinen eigenen Lauf nicht freigeben, und es gäbe keinen zweiten Reviewer.
  Darum **jetzt aus lassen**. Einschalten erst, wenn der Merge von einem anderen Konto (z. B. App) kommt und nur Du Reviewer bist (Schritt F). Wirkung vor Einschalten in einem Test prüfen; die Doku dazu ist hier nicht verifiziert.
- „Allow administrators to bypass“ (bzw. „Start all waiting jobs“): ausschalten, soweit das Repository es anbietet.

## 5. Übergang und Rückweg
**Reihenfolge, die keine Auslieferungslücke erzeugt:** Umgebung/Key (B, Ruleset noch aus) → neuer Workflow (C) → erste Auslieferung auf neuem Weg (D1) → erst dann Ruleset aktiv (D2).
Würde das Ruleset vor C aktiv, würde der alte Workflow beim nächsten Merge am `deploy`-Push scheitern (Server bleibt auf altem Stand, nichts geht kaputt, aber nichts wird ausgeliefert).
**Risiken:** Tippfehler im Secret-Namen oder Umgebungsnamen; Schreibrecht am Deploy-Key vergessen; falscher Host-Schlüssel; Prüfsumme/Pfadprüfung lehnt das Paket ab (Hinweis im Log); Cache-/Versionsunterschiede der Runner; Server-Cron holt den neuen Stand nicht.
**Wenn die erste Auslieferung scheitert:** Der Server ändert sich nur, wenn `deploy` sich ändert; ein gescheiterter Lauf lässt die Testumgebung auf dem alten Stand.
1. Log lesen (Actions → Lauf → Job `ausliefern`). Häufige Meldungen: „Permission denied (publickey)“ → Key/Schreibrecht/Secret; „Host key verification failed“ → Host-Schlüssel; „sha256sum: FAILED“ → Paket verändert, nicht erzwingen; Job steht „Waiting“ → noch nicht freigegeben.
2. Behebbar in Einstellungen → Lauf mit „Re-run“ wiederholen (nach erneuter Freigabe).
3. Sonst: Workflow-PR zurücknehmen („Revert“, Merge durch Dich). Ist das Ruleset schon aktiv, zuerst auf „Disabled“ stellen, sonst scheitert der alte Workflow beim Push.
4. Alten Stand wiederherstellen: nicht nötig, solange `deploy` unverändert blieb; ist `deploy` fehlerhaft überschrieben, mit der in Schritt A notierten Nummer: Ruleset aus, `git push -f origin <alte-nummer>:deploy` von Deinem Rechner (eigene Anmeldung), Ruleset wieder an. Alte Objekte bleiben bei GitHub nur begrenzt abrufbar; darum die Nummer notieren.
5. Testumgebung auf Beständigkeit: die Datenbank liegt (PGlite) im Anwendungsordner. Ob ein Neustart sie behält, ist **nicht geprüft** (M0-06). Vor Schritt D1 nur erfundene Daten.

## 6. Freigabe-Sätze (Vorschlag; jeder gilt nur für seinen Schritt)
- A: „Ich genehmige Schritt A: Ich sehe selbst Tarif und Schutzfunktionen nach und melde sie.“
- B: „Ich genehmige Schritt B: Ich richte Deploy-Key, Umgebung `auslieferung` und das deaktivierte Ruleset selbst ein.“
- C: „Ich genehmige Schritt C: PR mit diesen drei Dateien, ich lese den Diff und merge selbst.“ (ob Claude den PR öffnet oder Du: im Satz benennen)
- D: je Probe: „Ich genehmige Probe A/B/D auf Wegwerf-Zweigen.“
- E: „Ich genehmige Schritt E mit einer Doku-Änderung als Test.“
- F: je Teil einzeln.

## 7. Offene Punkte, die nichts mit M0-04 zu tun haben und sichtbar bleiben
Namecheap-Prüfung (M0-01), Datenbeständigkeit (M0-06), Sicherung/Wiederherstellung (M0-07), privater Serverzugang (M0-05), Befunde zu `permissions.ts` (M0-08).
Sie sind kein Argument für einen Merge oder eine Auslieferung.
