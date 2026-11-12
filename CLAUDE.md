# Arbeitsregeln für dieses Projekt

Kurswerk ist eine Plattform für Sprachschulen und BAMF-Kursträger (mehrere Schulen,
streng getrennt). Product Owner und Freigebender ist Fatih. Claude arbeitet als
Senior Engineer (planen, prüfen), Coder (umsetzen) und – in getrennten,
frischen Agenten – als Reviewer.

## Ablauf für jede Änderung

1. **Spezifikation**: Ziel, Verhalten, Rechte, Fehlerfälle, Definition of Done. Bei Unklarheit Fatih fragen.
2. **Untersuchen**: bestehenden Code, Datenmodell und Tests lesen, bevor etwas vorgeschlagen wird.
3. **Plan**: Datenmodell, Serverlogik, Oberfläche, Rechte, Tests. Größere Pläne vor dem Bauen mit Fatih abstimmen.
4. **Umsetzen auf einem eigenen Zweig** (`feature/…`, `fix/…`, `setup/…`). Nie direkt auf `main`.
5. **Prüfen**: `npx tsc --noEmit`, `npx vitest run`, `npm run build`; Nutzerabläufe zusätzlich im echten Browser.
6. **Review** durch einen frischen Agenten, der den Code nicht geschrieben hat (Sicherheit, Architektur, Bedienung).
7. **Pull Request** mit Zusammenfassung in einfacher Sprache für Fatih: was sich ändert, Bildschirmfotos, Testergebnisse, offene Risiken.
8. **Fatih merged.** Danach geht der Stand automatisch auf die Testumgebung `schule.gold-code-academy.com`.

## Feste Regeln

- Keine Änderung direkt auf `main`, kein Merge und kein Ausliefern ohne Fatihs Freigabe.
- Kein „fertig" ohne Belege: echte Test- und Prüfausgaben, keine Behauptungen.
- Schemaänderungen nur über versionierte Migrationen in `drizzle/` (`npx drizzle-kit generate`, Sicherheitsregeln als eigene SQL-Migration).
- Bereits übernommene Migrationen werden nie verändert, gelöscht oder umbenannt; Korrekturen kommen als neue Migration. Die CI prüft das (`scripts/check-migrations-unchanged.sh`, `tests/migrations.test.ts`).
- Die CI prüft zusätzlich auf Geheimnisse (gitleaks) und verwundbare Pakete (`npm audit`). Meldungen werden behoben, nie weggeklickt; Ausnahmen in `.gitleaks.toml` nur einzeln mit Begründung.
- Änderungen an `.github/`, `deploy/`, `scripts/` und `CLAUDE.md` gelten mindestens als mittleres Risiko: Fatih gibt sie frei.
- Mandantentrennung ist nicht verhandelbar: jede Schultabelle mit `organization_id`, Zeilensicherheit (RLS) und Tests, dass Schule A nie Daten von Schule B sieht. Die App verbindet nie als Datenbank-Superuser.
- Protokolle, Abgabeversionen und Rückmeldungen sind unveränderlich (Datenbank-Trigger).
- Rechte stehen an genau einer Stelle: `src/domain/permissions.ts`. Jede Serveraktion prüft dort; die Oberfläche blendet nur aus.
- Keine echten Personendaten in Entwicklung oder Testumgebung, nur erfundene Beispieldaten.
- Keine Zugangsdaten im Code oder im Repository.
- Kleine, abgeschlossene Schritte statt großer Würfe. Code bleibt für menschliche Entwickler lesbar.
- Bei Berechtigungen, Anwesenheit, Nachweisen und später Zahlungen: strengere Tests und immer ein Sicherheitsreview.

## Technik

Next.js 15 (App Router, Server Actions), TypeScript, Drizzle ORM, PostgreSQL 16 (lokal/CI),
eingebettetes PGlite auf der Testumgebung, Vitest. Fachregeln ohne Datenbank in `src/domain/`,
Serverabläufe in `src/server/`, Oberflächen in `src/app/`.

## Befehle

```
npm run db:migrate && npm run db:seed   # lokale Datenbank
npm run dev                             # http://localhost:3000
npx tsc --noEmit && npx vitest run      # Prüfungen
./scripts/bundle.sh                     # Paket für die Testumgebung
```

## Fachliche Grundlagen

- BAMF-Anforderungen: `docs/bamf-anforderungen.md` (offene Punkte dort markiert).
- Erste Pilotschule: Sprachen Plus e.V.
