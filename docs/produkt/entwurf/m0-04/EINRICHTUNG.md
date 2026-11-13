# M0-04: Einrichtung und Nachweis (ENTWURF, nichts davon ist aktiv)

Stand: 13.11.2026, nach zweitem Review-Durchgang. Autor: Claude (Senior Engineer). Freigabe: ausstehend, durch Fatih.
Dieses Dokument ändert nichts an GitHub, Zugangsdaten, Server oder Code. Jeder Schritt unter 4 ist eine eigene geschützte Handlung.

## 1. Die Lücke
`deploy.yml` setzt `permissions: contents: write` für den ganzen Workflow, auch bei `pull_request`. Ein Pull Request im selben
Repository läuft mit **seiner eigenen** Workflow-Datei und kann dort selbst auf den Zweig `deploy` schreiben. Der Server holt `deploy`
alle 5 Minuten. Die Zeile nur auf `read` zu stellen reicht nicht, ein PR darf sie wieder ändern.
Außerdem gilt heute: **Jeder** Merge in `main` (auch reine Doku) baut und legt das Paket automatisch auf `deploy`, also auf die
Testumgebung `schule.gold-code-academy.com`. Ein Merge ist damit heute zugleich eine Auslieferung (belegt in `deploy.yml`, Auslöser `push` auf `main`).

## 2. Die Korrektur: vier Teile
1. **Datei** (`deploy.yml.txt`), zwei getrennte Jobs:
   - `build` (Prüfen): nur Leserechte, kennt keinen Schlüssel. Führt `npm ci`, `tsc`, `vitest`, `bundle.sh` aus. Nur bei Push auf `main` verpackt er `dist/`
     als `paket.tgz`, merkt sich die Prüfsumme (SHA-256) als Job-Ausgabe und lädt die Datei hoch.
   - `ausliefern`: bekommt den Schlüssel erst nach Freigabe. Kein Checkout, kein Node, kein npm, kein Projekt-Skript. Er lädt die Datei,
     prüft die Prüfsumme gegen die Ausgabe von `build`, prüft Pfade und Links (kein `..`, kein absoluter Pfad, kein `.git`/`.github`, keine Hardlinks, keine Symlinks auf absolute Ziele), entpackt und legt sie per `git push` auf `deploy`.
     Ausgeführt werden nur `tar`, `sha256sum`, `git`, `ssh` der GitHub-Runner. Git läuft ohne System-/Nutzer-Konfiguration, ohne Hooks und mit `* -filter -text -ident`.
   Die Prüfsumme schützt den Transport zwischen den Jobs, **nicht** gegen einen kompromittierten Prüfjob (der erzeugt Paket und Summe selbst).
   `.github/` im Paket ist verboten: Ein Push per Deploy-Key löst Workflows aus dem gepushten Stand aus, ein eingeschmuggelter Workflow bekäme sonst ein Schreib-Token.
2. **Umgebung `auslieferung`**: enthält das Geheimnis `DEPLOY_KEY`, nur für den Zweig `main` freigegeben, **mit Pflicht-Freigabe durch Fatih** („Required reviewer“).
3. **Regelsatz `deploy-nur-deploy-key`**: auf `deploy` sind Anlegen, Aktualisieren, Löschen, Überschreiben verboten, ausgenommen der Deploy-Key.
   Das `GITHUB_TOKEN` eines PR wird abgewiesen, selbst mit `contents: write`.
4. **Tests** (`workflow-invariants.test.ts`): Frühwarnung gegen Rückfall in die Lücke.

Warum alle vier: Ohne Teil 3 reicht dem PR ein eigenes `contents: write`. Ohne Teil 2 könnte er den Schlüssel auslesen. Ohne die Trennung in Teil 1
läuft fremder Paketcode neben dem Schlüssel. Ohne die Freigabe in Teil 2 löst jeder Merge eine Auslieferung aus.

Pins (mit `git ls-remote` gegen die öffentlichen Original-Repositories geprüft):
checkout v4.3.1 `34e1148…`, setup-node v4.4.0 `49933ea…` (beide wie in PR #23), upload-artifact v4.6.2 `ea165f8…`, download-artifact v4.3.0 `d3f86a1…`.
Nach Anwendung zeigt Dependabot neue Versionen an (PR #23).

## 3. Entscheidungen
### 3.1 Deploy-Key oder GitHub App für den Schreibzugriff auf `deploy`
Belegt (GitHub-REST-Doku, Suchtreffer): `DeployKey` ist ein Bypass-Typ im Regelsatz, `actor_id` ist `null`. Laut GraphQL-Schema ist für Deploy-Keys nur der Modus „always“ erlaubt (Changelog April 2024; Doku nennt allgemein always/pull_request/exempt, `pull_request` gilt für Deploy-Keys nicht).
Folge (aus `actor_id: null` abgeleitet, von GitHub nicht ausdrücklich so formuliert): Der Bypass gilt für **jeden** Deploy-Key des Repositories mit Schreibrecht, nicht für einen bestimmten.
Das ist für uns kleiner, als es klingt, solange die Regeln unten gelten.

| | Deploy-Key (empfohlen) | GitHub App nur für `deploy` |
|---|---|---|
| Bypass-Genauigkeit | alle Schreib-Deploy-Keys des Repos | genau diese App (Integration mit fester ID) |
| Reichweite des Schlüssels | ganzes Repo, aber alle anderen Zweige sind durch die `main`-Regeln geschützt, sobald `main-ruleset.json` aktiv ist | Token kurzlebig (1 Stunde), auf Repo und Rechte begrenzt |
| Aufwand | 1 Schlüsselpaar, 1 Eintrag, 1 Secret | App anlegen, installieren, Privatschlüssel als Secret, zusätzlicher Schritt/Action zum Token-Erzeugen (eine weitere Fremd-Action mit Pin) |
| Neue Fehlerquellen | wenige | Ablauf des Schlüssels, App-Rechte, Action-Pflege |
| Tarif | Regelsatz + Umgebung: wie unten | gleich; zusätzlich Integration als Bypass-Actor |

Empfehlung: **Deploy-Key**, mit drei Regeln: (a) genau ein Schreib-Deploy-Key im Repository, (b) `DEPLOY_KEY` nur als Environment-Secret, nie als Repository- oder
Organisations-Secret, (c) `main-ruleset.json` ohne Bypass für den Key, sobald aktiv (bis dahin kann ein gestohlener Key theoretisch auch `main` beschreiben; er liegt aber
nur in der geschützten Umgebung). Die GitHub App bleibt vorgesehen für die **Agenten-Identität** (Abschnitt 6), nicht für die Auslieferung. Eine App mit Schreibrecht
auf Inhalte für beides zu nutzen würde Agent und Auslieferung vermischen.
Wer später mehr Genauigkeit braucht, wechselt auf die App; die Datei ändert sich dann nur im Schritt „Schlüssel schreiben“.

### 3.2 Merge ist keine Auslieferung
Nach dem Patch baut ein Merge in `main` nur noch. Der Job `ausliefern` **pausiert**, bis Fatih in GitHub („Review deployments“) freigibt. Der Schlüssel bleibt bis dahin unsichtbar.
Grenzen, ehrlich:
- Gilt nur bei **öffentlichem** Repository. Für Environments mit Pflicht-Freigabe in privaten Repositories braucht es laut GitHub-Doku GitHub Enterprise; Environment-Secrets in privaten
  Repositories brauchen Pro/Team. Wird ein Repository von öffentlich auf privat gestellt, werden Schutzregeln und Environment-Secrets **ignoriert**.
  Die Datei ist deshalb **fail-closed**: `ausliefern` läuft nur, wenn `github.event.repository.private == false`. Wird das Repository privat, bleibt die Auslieferung stehen, statt ohne Klick zu laufen
  (auch mit Team-Tarif, wo Secrets bleiben, aber Pflicht-Freigaben ignoriert würden). Ein Fallback mit Repository-Secret und manuellem `workflow_dispatch` würde den Schlüssel für PR-Läufe lesbar machen und wird **nicht** empfohlen.
  Darum: **Repository nicht privat stellen, bevor diese Frage gelöst ist.**
- Fehlt die Umgebung oder ist sie umbenannt, legt GitHub beim Lauf eine neue ohne Regeln und ohne Secrets an. Das bleibt sicher, solange `DEPLOY_KEY` **nur** als Environment-Secret `auslieferung` existiert.
- Eine weitere Workflow-Datei auf `main` mit `environment: auslieferung` bräuchte ebenfalls die Freigabe; beim Klick siehst Du aber nicht, was der Job tut. Freigabe nur nach Blick auf den Commit. Der Test verbietet `environment:` in anderen Dateien nur als Frühwarnung.
- Solange Agent und Fatih dasselbe GitHub-Konto nutzen, könnte der Agent die Freigabe technisch selbst geben. Die Sperre bindet erst mit getrennter Identität (Abschnitt 6).
  Bis dahin gilt die Anweisung, nicht Technik.
- „Prevent self-review“ bleibt aus (einzige Person); „Allow administrators to bypass“ ausschalten, falls angeboten.
- Fatih sieht beim Freigeben nicht den Paketinhalt, nur dass ein Lauf auf `main` wartet. Freigeben nur nach Blick auf Commit und grünen Prüflauf.
- Lücke bis Schritt 10: `main` hat keinen Schutz (heute 404 „not protected“). Jedes Token mit Schreibrecht kann dort direkt pushen, bis Teil 6 aktiv ist. M0-04 schließt nur den Weg über `deploy`.
- Bis M0-04 auf `main` ist, löst jeder Merge (auch PR #27) die alte, automatische Auslieferung aus. Deshalb Merges bis dahin nur nach Deiner ausdrücklichen Entscheidung.

## 4. Was Fatih selbst tun muss (nichts davon tut Claude)
Reihenfolge: 1 bis 7 einrichten, dann Datei einbringen (8), dann Proben (9).
1. Settings → Billing: Tarif ansehen. Repository öffentlich lassen.
2. Auf dem eigenen Rechner: `ssh-keygen -t ed25519 -N "" -C kurswerk-deploy -f kurswerk-deploy`. Zwei Dateien entstehen (privat und `.pub`).
3. Settings → Deploy keys → Add deploy key: Inhalt von `kurswerk-deploy.pub`, **Allow write access** anhaken. Prüfen, dass es keinen weiteren Schreib-Key gibt.
4. Settings → Environments → New environment `auslieferung`: *Required reviewers* = Du; *Deployment branches and tags* = Selected branches → nur `main`;
   *Prevent self-review* aus; Admin-Umgehung aus (falls angeboten). Environment secret `DEPLOY_KEY` = Inhalt der privaten Datei. Danach die private Datei löschen.
5. Settings → Rules → Rulesets → New → Import: `deploy-ruleset.json`. Der Deploy-Key muss als Bypass erscheinen. Fehlt er: stoppen und melden.
6. Host-Schlüssel in `deploy.yml.txt` gegen die GitHub-Seite „GitHub's SSH key fingerprints“ abgleichen. Erwartet: `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (aus dem eingetragenen Schlüssel berechnet).
7. Settings → Actions → General → Workflow permissions: **Read**; Genehmigung für PRs von neuen Beitragenden verlangen (Zusatzschichten).
8. Datei als `.github/workflows/deploy.yml`, Test als `tests/workflow-invariants.test.ts` (plus devDependency `yaml`, `CODEOWNERS`-Zeile für `/tests/workflow-invariants.test.ts`) in einem **eigenen PR**. Du liest den `.github/`-Diff selbst. Zwischen Schritt 5 und dem Merge liefert nichts aus (erwartet).
9. Proben (Abschnitt 5) nach eigener Freigabe.
10. Erst danach, getrennt: `main`-Regelsatz, `CODEOWNERS`, Agenten-Identität (Abschnitt 6).

## 5. Nachweise
Erbracht (lokal, Wegwerf-Worktree auf `d2c11f2`/`b2f05ee`, danach entfernt; nichts gepusht außer den Doku-Entwürfen):
- **Tests:** `workflow-invariants.test.ts` gegen den Zwei-Jobs-Entwurf (Stand nach Review 2) **13 von 13 grün**, `npx tsc --noEmit` Exit 0. Gegen die heutige `deploy.yml` waren in einer früheren, schwächeren Fassung 7 von 10 rot.
- **Mutationen, jeweils erkannt (nach Review 2 zusätzlich):** Prüfsumme mit `|| true`, `StrictHostKeyChecking=no`, `hooksPath`-Zeile weg, `set -euo pipefail` weg, `curl|sh` im Auslieferungsjob, `private == false` weg, `GIT_CONFIG_NOSYSTEM` weg, `run-id` am Download (je 1 rot). Außerdem: Checkout im Auslieferungsjob (2 rot), `npm ci` dort (1), Prüfsummenprüfung entfernt (1), Download ohne SHA-Pin (2), Upload auch bei PR (1);
  früher: `write-all`, `|| always()`, `pull_request_target`, `git  push`, `github.token`, lokale Action.
- **Build-Verhalten unverändert (Rundlauf):** `bundle.sh` (ohne `DATABASE_URL`, Paket 55M) → `tar` → Prüfsumme → Pfadprüfung → entpackt → `git add -A -f`:
  Git-Baum des entpackten Pakets **identisch** mit dem Baum direkt aus `dist/` (`3acde40…`, 2028 Dateien, 3 Symlinks, 0 ausführbare Dateien). Ein verändertes Paket wird von der Prüfsumme abgelehnt.
  Damit ist der Inhalt des Zweigs `deploy` wie bisher. Der Server (`deploy/namecheap-update.sh`) bleibt unverändert.
- **Pfad-/Link-Prüfung funktional:** erlaubt ein Archiv mit relativem Symlink, lehnt ab: absoluter Symlink, Hardlink, `.github/`. Das echte Paket (3 relative Symlinks) wird akzeptiert. tar blockiert gefährliche Links zusätzlich selbst (Reviewer-Messung, GNU tar 1.35; Version auf `ubuntu-latest` nicht prüfbar).
- **Grenze der Tests:** Ein PR kann den Test selbst ändern; er beweist nicht die Sperre. Er ist eine Strukturprüfung des Auslieferungsjobs (Schritte, `with`-Schlüssel, Pflichtzeilen, Verbotsmuster), keine vollständige Allowlist; neue Verschlechterungen außerhalb dieser Muster erkennt er nicht. Nicht lokal prüfbar: `actionlint` (nicht installierbar, Netz), das echte Verhalten von upload/download-artifact auf GitHub.

Noch zu erbringen **nach** Einrichtung (ohne `deploy` anzufassen; `deploy-test` ist im Regelsatz mit aufgeführt, vorher einmal mit dem Deploy-Key anlegen):
- A (muss scheitern): Wegwerf-PR-Zweig mit `permissions: contents: write` und `git push -f origin HEAD:refs/heads/deploy-test` per `GITHUB_TOKEN`. Erwartet: abgewiesen.
- B (muss scheitern): derselbe PR-Lauf liest `secrets.DEPLOY_KEY` in einem Job mit `environment: auslieferung`. Erwartet: Job startet nicht.
- C (muss gelingen): Merge auf `main`, Lauf pausiert, Freigabe, `deploy` wird überschrieben, Server-Log zeigt neuen Stand. Dabei prüfen: ohne Freigabe geschieht nichts.
- D (muss scheitern): Wegwerf-Zweig ohne die `if`-Bedingung von `ausliefern`, dann `workflow_dispatch`. Erwartet: Umgebung verweigert.
A, B, D sind PRs mit unsicherem Workflow. Claude öffnet sie nicht. Bis sie laufen, gilt Teil 3 als **nicht belegt**.

## 6. Nicht Teil von M0-04: `main`-Regelsatz, CODEOWNERS, Agenten-Identität (vorbereitet, nicht aktiv)
`main-ruleset.json` verlangt Prüfnamen aus PR #23; vorher importiert blockiert er alle Merges. Danach Prüfnamen abgleichen, importieren, `CODEOWNERS.txt` als `.github/CODEOWNERS`.
Agenten-Identität: eigene GitHub App nur für dieses Repository (Contents, Pull requests, Issues: R/W; Metadata: R; **nicht** Administration, Workflows, Secrets, Environments, Actions), kein Bypass.
Nur die Repo-Admin-Rolle darf „für Pull Requests“ umgehen, damit Fatih eigene PRs mergen kann. Ob diese Cloud-Sitzung einen eigenen App-Token nutzen kann, ist **unverifiziert**.

## 7. Restrisiken (ehrlich)
- Ein kompromittiertes npm-Paket kann im Prüfjob das Paket verändern und so schädlichen Code ausliefern. Den Schlüssel erreicht es nicht. Gegenmaßnahmen sind Abhängigkeitsprüfung (PR #23) und Review von `package-lock.json`.
- Der Bypass `DeployKey` gilt für alle Deploy-Keys (3.1). Der Regelsatz-Import mit handgeschriebenem JSON ist ungeprüft; die Oberfläche kann Felder ablehnen.
- Nicht belegt, bis die Proben liefen: Abweisung des `GITHUB_TOKEN`, Verweigerung der Umgebung für PR-Läufe, SSH-Push-Verhalten, Verhalten des Servers nach dem ersten neuen Stand.
- Das Pausieren hängt an einem öffentlichen Repository und an getrennter Identität (3.2).

## 8. Stoppbedingungen und Aufgabenzustand
Unverändert in `AUTONOMIE.md` §3, §4, §12 und `coordinator/` (16 grüne Tests); keine Änderung.
