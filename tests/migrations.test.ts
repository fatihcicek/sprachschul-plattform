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

/** Zählt SQL-Anweisungen (Semikolons außerhalb von Kommentaren, Texten und Dollar-Blöcken). */
function countStatements(sql: string): number {
  let count = 0;
  let pending = false; // seit dem letzten Semikolon kam echter Inhalt
  for (let i = 0; i < sql.length; ) {
    const rest = sql.slice(i);
    let m: RegExpMatchArray | null;
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (rest[0] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      i = j + 1;
      pending = true;
    } else if ((m = rest.match(/^\$([A-Za-z_]*)\$/))) {
      const close = sql.indexOf(m[0], i + m[0].length);
      i = close === -1 ? sql.length : close + m[0].length;
      pending = true;
    } else if (rest[0] === ";") {
      if (pending) count++;
      pending = false;
      i++;
    } else {
      if (!/\s/.test(rest[0]!)) pending = true;
      i++;
    }
  }
  return count + (pending ? 1 : 0);
}

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

  it("die Migrationen liegen dort, wo die Prüfungen sie suchen (drizzle.config.ts)", () => {
    const config = readFileSync(path.resolve(__dirname, "..", "drizzle.config.ts"), "utf8");
    expect(config).toMatch(/out:\s*["']\.\/drizzle["']/);
  });

  it("mehrere Anweisungen in einer Datei sind durch Markierungen getrennt", () => {
    // Fehlt die Markierung, geht die Datei als eine einzige Anweisung an die Datenbank: Ein Fehler lässt sich
    // dann nicht der einzelnen Anweisung zuordnen, und nichts wird einzeln zurückgerollt.
    // Falscher Alarm bei ungewöhnlicher SQL-Schreibweise? Dann hier die Datei mit Begründung ausnehmen.
    for (const f of sqlFiles) {
      const text = readFileSync(path.join(dir, f), "utf8");
      const statements = countStatements(text);
      const markers = (text.match(/-->\s*statement-breakpoint/g) ?? []).length;
      expect(markers, `${f}: ${statements} Anweisungen brauchen mindestens ${statements - 1} Markierungen`).toBeGreaterThanOrEqual(statements - 1);
    }
  });

  it("der Anweisungszähler versteht Kommentare, Texte mit Semikolon und Dollar-Blöcke", () => {
    expect(countStatements("select 1;")).toBe(1);
    expect(countStatements("select 1;\n--> statement-breakpoint\nselect 2;")).toBe(2);
    expect(countStatements("comment on table t is 'a; b';")).toBe(1);
    expect(countStatements("select 'it''s; fine';")).toBe(1);
    expect(countStatements("select 1; -- don't; split\nselect 2;")).toBe(2);
    expect(countStatements("/* a; b */ select 1;")).toBe(1);
    expect(countStatements("create function f() returns int as $fn$ begin select 1; select 2; end $fn$ language sql;")).toBe(1);
    expect(countStatements("create function f() returns trigger as $$ begin return new; end $$ language plpgsql;")).toBe(1);
  });
});
