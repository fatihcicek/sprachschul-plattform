---
name: closing-discipline
description: Nach grünen Prüfungen und vor dem Pull Request ausführen. Sucht in den geänderten Dateien nach liegengebliebenen Resten (TODO, FIXME, vergessene .only, console.log) und führt durch den Abschlussbericht, in dem jede Aussage einen Beleg hat. Der Bericht liefert den Text für den Pull Request.
---

# closing-discipline: sauber abschließen

„Fertig“ heißt in diesem Projekt: mit Belegen. Dieser Skill läuft, wenn Typprüfung, Tests und Build grün sind, und bevor der Pull Request geöffnet wird.

## Schritt 1: Reste suchen

```
bash .claude/skills/closing-discipline/scripts/loose-ends-grep.sh
```

Das Skript prüft nur die Dateien, die sich gegenüber `origin/main` geändert haben, und meldet:

- `TODO`, `FIXME`, `XXX`, `HACK`
- `.only(`, `.skip(` und `fit(`/`fdescribe(` in Tests (ein vergessenes `.only` lässt andere Tests still ausfallen)
- `console.log` in `src/` (Server-Logs nur bewusst, nicht aus Versehen)
- `debugger`

Jeder Treffer wird entweder behoben oder im Bericht begründet (z. B. eine bewusst offene Frage an Fatih mit Verweis). Der Rückgabewert ist 1, wenn es Treffer gibt. Das Skript ist eine Hilfe, kein Ersatz für die Prüfungen.

## Schritt 2: Belege sammeln

Beim Abschluss gilt wie in `CLAUDE.md`: kein „fertig“ ohne echte Ausgaben.

- Typprüfung, Tests und Build mit den echten Ergebniszeilen. Zahlen wörtlich übernehmen, nie als „alle bestanden“ umschreiben.
- Bei Nutzerabläufen: im echten Browser durchgespielt, mit Bildschirmfotos.
- Bei Änderungen an Rechten, Mandantentrennung, Anmeldung oder Datenbank: die Tests, die genau das prüfen, einzeln benennen.

## Schritt 3: Abschlussbericht

Vorlage: `abschlussbericht.md` in diesem Ordner. Sie ist so aufgebaut wie die Pull-Request-Vorlage, damit der Bericht fast unverändert als PR-Text taugt. Die Datei im Ordner `reports/` ablegen (nicht versioniert) und den Text in den Pull Request übernehmen.

Regeln für den Bericht:

1. Jede Behauptung hat einen Beleg (Befehl und Ausgabe, Dateipfad, Testname). Eine Behauptung ohne Beleg ist nicht belegt.
2. Alles Geänderte steht drin, auch Nebenänderungen, die der eigene Code erzwungen hat, mit Grund. Nicht Genanntes darf nicht im Diff stehen.
3. Offene Punkte stehen unter „Offene Risiken“. Sie werden nicht verschwiegen und nicht als erledigt dargestellt.
4. Nichts über BAMF-Konformität behaupten. Der Stand steht in `docs/bamf-anforderungen.md`.
5. Keine Zugangsdaten, keine echten Personendaten, auch nicht in Bildschirmfotos.

## Danach

Review durch einen frischen Agenten (Skill `review-commit`), dann Pull Request. Merge und Auslieferung entscheidet Fatih.
