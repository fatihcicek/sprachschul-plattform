# M0-04: Einrichtung und Nachweis (ENTWURF, nichts davon ist aktiv)

Stand: 13.11.2026. Basis: Commit `3e39fe7`. Autor: Claude (Senior Engineer). Freigabe: ausstehend, durch Fatih.

## 1. Die Lücke
`deploy.yml` setzt `permissions: contents: write` für den ganzen Workflow, auch bei `pull_request`. Ein Pull Request im selben
Repository läuft mit **seiner eigenen** Workflow-Datei. Wer einen PR öffnet, kann dort einen Schritt ergänzen, der mit dem
mitgelieferten Token auf den Zweig `deploy` schreibt. Der Server holt `deploy` alle 5 Minuten. Ein bloßes Umstellen auf
`contents: read` in der Datei reicht nicht, denn der PR darf die Zeile wieder ändern.

## 2. Die Korrektur (drei Teile, alle drei nötig)
1. **Datei** (`deploy.yml.txt`): Prüfen (`build`) nur lesend. Schreiben nur im Job `ausliefern`, nur bei Push auf `main`,
   mit einem Deploy-Key statt `GITHUB_TOKEN`. Kein Token-Push mehr.
2. **Umgebung `auslieferung`**: enthält das Geheimnis `DEPLOY_KEY` und ist nur für den Zweig `main` freigegeben. Ein PR-Lauf
   (Ref `refs/pull/N/merge`) bekommt die Umgebung und damit den Schlüssel nicht, auch wenn er die Datei ändert.
3. **Regelsatz `deploy-nur-deploy-key`** (`deploy-ruleset.json`): auf `deploy` sind Aktualisieren, Löschen und Überschreiben
   verboten, ausgenommen der Deploy-Key. `GITHUB_TOKEN` wird dort abgewiesen, selbst mit `contents: write`.

Warum nicht weniger: Ohne Teil 3 genügt dem PR ein `contents: write` in seiner Datei. Ohne Teil 2 könnte ein PR den Schlüssel
lesen und ausgeben. Ohne Teil 1 gibt es keinen legitimen Weg für den Schlüssel.

## 3. Was Fatih selbst tun muss (nichts davon tut Claude)
Reihenfolge: Teile 2 und 3, dann die Datei. Sobald der Regelsatz aktiv ist, wird der alte Token-Push abgewiesen; bis die neue Datei auf `main` ist, liefert nichts aus (Fenster einplanen, kein Fehler im Server). Zusätzlich empfohlen: Settings → Actions → Workflow permissions auf „Read“ und Freigabe für PRs neuer Beitragender verlangen (nur Zusatzschichten, keine Sperre).
1. Unter Settings → Billing den Tarif prüfen. Regelsätze und Umgebungs-Zweigregeln gibt es für öffentliche Repositories im
   Free-Tarif. Wird das Repository privat, braucht es dafür einen bezahlten Tarif (laut GitHub-Dokumentation, hier nicht getestet).
2. Auf dem eigenen Rechner ein Schlüsselpaar erzeugen: `ssh-keygen -t ed25519 -N "" -C kurswerk-deploy -f kurswerk-deploy`.
3. Settings → Deploy keys → „Add deploy key“, öffentlichen Teil einfügen, **„Allow write access“** anhaken.
4. Settings → Environments → neu `auslieferung` → „Deployment branches: Selected branches“ → nur `main`.
   Dort Environment secret `DEPLOY_KEY` = privater Schlüssel. Danach die lokale Schlüsseldatei löschen.
5. Settings → Rules → Rulesets → Import: `deploy-ruleset.json`. Prüfen, dass der Deploy-Key als Bypass-Eintrag erscheint.
   Falls die Oberfläche „DeployKey“ nicht anbietet, Import stoppen und mir melden (siehe Abschnitt 6).
6. Host-Schlüssel in `deploy.yml.txt` mit dem von GitHub veröffentlichten abgleichen. Erwarteter Fingerabdruck für ed25519:
   `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (aus dem eingetragenen Schlüssel berechnet, die GitHub-Seite
   war in dieser Sitzung nicht abrufbar). Abgleich unter docs.github.com → „GitHub's SSH key fingerprints“.
7. Erst jetzt die Datei als `.github/workflows/deploy.yml` und `tests/workflow-invariants.test.ts` (plus devDependency `yaml`)
   in einem eigenen PR einbringen. Dieser PR ändert `.github/`: Fatih liest den Diff selbst, bevor er mergt.

## 4. Nachweis, dass Schreiben blockiert ist
Bereits erbracht (lokal, Wegwerf-Worktree auf `3e39fe7`, danach entfernt), nach unabhängigem Review nachgeschärft:
- `workflow-invariants.test.ts`: gegen den Entwurf **10 von 10 grün**, `npx tsc --noEmit` Exit 0 (der erste Stand brach `tsc` wegen
  `noUncheckedIndexedAccess`; behoben). Gegen die heutige `deploy.yml` waren es 7 von 10 rot (Stand vor der Schärfung).
- Mutationstests am Entwurf, jeweils vom Test erkannt: `permissions: write-all` im Job (YAML wegen Doppelschlüssel nicht ladbar, Lauf bricht ab),
  `|| always()` an der Bedingung (1 rot), `pull_request_target` unter `on` (2 rot), `git  push` mit Doppel-Leerzeichen im Prüfjob (1 rot),
  `github.token` im Prüfjob (1 rot), lokale Action `uses: ./x` (1 rot). Das sind Stichproben, keine Vollständigkeit.
- Grenze: Ein PR kann diesen Test selbst verändern (CODEOWNERS schützt ihn nur mit getrennter Agenten-Identität). Er beweist nicht die Sperre.

Noch zu erbringen **nach** Einrichtung, ohne `deploy` anzufassen (Wegwerf-Zweig `deploy-test` ist im Regelsatz mit aufgeführt):
- Vorbereitung: `deploy-test` einmal mit dem Deploy-Key anlegen (der Regelsatz sperrt auch das Anlegen, `creation`).
- Probe A (muss scheitern): auf einem Wegwerf-PR-Zweig einen Workflow mit `permissions: contents: write` und
  `git push -f origin HEAD:refs/heads/deploy-test` mit `GITHUB_TOKEN` (Aktualisierung eines vorhandenen Zweigs). Erwartet: abgewiesen („ruleset“).
- Probe B (muss scheitern): derselbe PR-Lauf liest `secrets.DEPLOY_KEY` in einem Job mit `environment: auslieferung`.
  Erwartet: Job wird wegen der Zweigregel nicht gestartet.
- Probe C (muss gelingen): Push auf `main` überschreibt `deploy` per Force-Push; Server-Log zeigt neuen Stand.
- Probe D (muss scheitern): Wegwerf-Zweig, dessen Datei die Bedingung `if` von `ausliefern` entfernt, dann `workflow_dispatch`. Erwartet: Umgebung verweigert den Job.
Die Proben A, B und D sind PRs mit unsicherem Workflow. Claude öffnet sie **nicht**; Fatih startet sie nach eigener Freigabe,
oder gibt sie ausdrücklich frei. Bis dahin gilt Teil 3 als **nicht belegt**.

## 5. Wechselwirkung mit PR #23
`sicherheit.yml` (nur lesend, SHA-gepinnt, `persist-credentials: false`) erfüllt die Invarianten bereits. PR #23 ändert
`deploy.yml` nicht. Sie lassen sich in beliebiger Reihenfolge mergen. Die Prüfnamen („Geheimnissuche (gitleaks)“,
„Abhängigkeiten (npm audit)“, „Prüfen“) stehen in `main-ruleset.json` und müssen nach dem ersten Lauf auf Schreibweise geprüft werden.

## 6. Restrisiken und Nicht verifiziert (ehrlich)
- Lieferkette: `npm ci` und `bundle.sh` laufen im Job `ausliefern` neben dem Schlüssel. Ein bösartiges npm-Paket könnte ihn lesen. Das ist kein PR-Umweg.
  Gegenmaßnahme (Folgeschritt): Bauen und Schlüssel in zwei Jobs trennen; braucht `upload/download-artifact` mit SHA-Pin, den diese Sitzung nicht prüfen konnte.
- Reichweite des Deploy-Keys: gilt für das ganze Repository (Schreibrecht); der Bypass `DeployKey` gilt für alle Deploy-Keys. Darum: nur diesen einen
  Schreib-Deploy-Key anlegen und `DEPLOY_KEY` **nur** als Environment-Secret `auslieferung`, nie als Repository- oder Organisations-Secret.
- Dass der Regelsatz-Bypass-Typ `DeployKey` in Deinem Tarif/UI verfügbar ist: nur aus Dokumentationsquellen, nicht getestet.
- Dass `GITHUB_TOKEN`-Pushes auf `deploy` vom Regelsatz abgewiesen werden: Dokumentation sagt ja, Probe A fehlt.
- Dass der Server mit der neuen Art Commit (SSH-Push, gleiche Zweigform) unverändert weiter zieht: Probe C.
- Der Host-Schlüssel-Abgleich (Schritt 6) und Action-SHA-Pins (aus `sicherheit.yml` übernommen, nicht neu geprüft).
- Fallback, falls Regelsätze nicht möglich sind: Zweig `deploy` entfällt als Schreibziel für Actions; stattdessen Auslieferung
  durch Fatih von Hand. Dann ist die Lücke nur mit Teil 1+2 nicht geschlossen, Details auf Anfrage.

## 7. Getrennt von M0-04: Regelsatz für `main`, CODEOWNERS, Agenten-Identität (vorbereitet, nicht aktiv)
Diese Teile gehören nicht zur Korrektur der Lücke und werden **nicht** mit ihr eingerichtet. `main-ruleset.json` verlangt Prüfnamen aus PR #23
(„Geheimnissuche (gitleaks)“, „Abhängigkeiten (npm audit)“); wer ihn vor dem Merge von #23 importiert, blockiert alle Merges. Danach:
Prüfnamen nach dem ersten Lauf abgleichen, dann importieren; `CODEOWNERS.txt` als `.github/CODEOWNERS` einbringen.
Echte Sperre gegen einen PR des Agenten ist die Code-Owner-Freigabe und nur wirksam mit einer vom Agenten getrennten GitHub-Identität.
Vorgesehen: eigene GitHub App nur für dieses Repository, Rechte Contents R/W, Pull requests R/W, Issues R/W, Metadata R; **nicht**
Administration, Workflows, Secrets, Environments, Actions; kein Bypass. Nur die Repo-Admin-Rolle darf „für Pull Requests“ umgehen, damit
Fatih eigene PRs mergen kann. Ob diese Cloud-Sitzung mit einem eigenen App-Token arbeiten kann, ist **unverifiziert**.

## 8. Stoppbedingungen und Aufgabenzustand
Bereits in `AUTONOMIE.md` §3, §4, §12 und `coordinator/` beschrieben und mit 16 grünen Tests geprüft; hier keine Änderung.
