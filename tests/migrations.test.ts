// Migrationen sind der Weg, auf dem sich jede Datenbank (lokal, CI, Testumgebung, später Betrieb) verändert.
// Diese Prüfung braucht keine Datenbank und fängt typische Fehler ab, bevor sie eine Umgebung treffen:
// Datei ohne Journal-Eintrag, falscher Name, fehlender Schnappschuss, falsche Reihenfolge.
//
// Wichtig ist die Reihenfolge der Zeitstempel: Drizzle wendet nur Migrationen an, deren Zeitstempel
// neuer ist als die zuletzt eingespielte. Eine Migration mit zu altem Zeitstempel würde auf einer
// bestehenden Datenbank stillschweigend übersprungen und nur auf frischen Datenbanken laufen.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "..", "drizzle");
type Entry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
const journal = JSON.parse(readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")) as { entries: Entry[] };
const sqlFiles = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const number = (tag: string) => Number(tag.slice(0, 4));

describe("Migrationen sind konsistent", () => {
  it("es gibt Migrationen und ein Journal", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it("jeder Journal-Eintrag hat Nummer 0000, 0001, … lückenlos und passend zu seinem Namen", () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx, `Eintrag ${e.tag}`).toBe(i);
      expect(e.tag, `Name von Eintrag ${i}`).toMatch(/^\d{4}_[a-z0-9_]+$/);
      expect(number(e.tag), `Nummer im Namen von ${e.tag}`).toBe(i);
    });
  });

  it("Journal und SQL-Dateien gehören genau zusammen (keine Datei ohne Eintrag, kein Eintrag ohne Datei)", () => {
    const fromJournal = journal.entries.map((e) => `${e.tag}.sql`).sort();
    expect(sqlFiles).toEqual(fromJournal);
  });

  it("jede Migration hat ihren Schnappschuss", () => {
    for (const e of journal.entries) {
      const snap = path.join(dir, "meta", `${e.tag.slice(0, 4)}_snapshot.json`);
      expect(existsSync(snap), `Schnappschuss fehlt für ${e.tag}`).toBe(true);
      expect(() => JSON.parse(readFileSync(snap, "utf8")), `Schnappschuss von ${e.tag} ist kein gültiges JSON`).not.toThrow();
    }
  });

  it("Zeitstempel steigen streng an, sonst würde eine Migration auf bestehenden Datenbanken übersprungen", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1]!;
      const cur = journal.entries[i]!;
      expect(cur.when, `${cur.tag} muss einen neueren Zeitstempel haben als ${prev.tag}`).toBeGreaterThan(prev.when);
    }
  });

  it("keine Migration ist leer", () => {
    for (const f of sqlFiles) {
      expect(readFileSync(path.join(dir, f), "utf8").trim().length, `${f} ist leer`).toBeGreaterThan(0);
    }
  });

  it("jede Migration mit mehreren Anweisungen trennt sie mit einer Markierung", () => {
    // Drizzle schickt eine Datei ohne Markierung als eine einzige Anweisung. Mehrere Anweisungen
    // gehen dann in manchen Treibern schief und lassen sich nicht einzeln zurückrollen.
    for (const f of sqlFiles) {
      const text = readFileSync(path.join(dir, f), "utf8");
      const body = text
        .replace(/\$\$[\s\S]*?\$\$/g, "$$$$") // Funktionskörper zählen als Teil einer Anweisung
        .replace(/--[^\n]*/g, "");
      const statements = body.split(";").map((s) => s.trim()).filter(Boolean).length;
      const markers = (text.match(/-->\s*statement-breakpoint/g) ?? []).length;
      expect(markers, `${f}: ${statements} Anweisungen brauchen ${statements - 1} Markierungen`).toBeGreaterThanOrEqual(statements - 1);
    }
  });
});
