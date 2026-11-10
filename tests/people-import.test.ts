import { describe, expect, it } from "vitest";
import { parsePeopleTable } from "@/domain/people-import";

describe("Teilnehmendenliste aus einer Tabelle", () => {
  it("liest deutsches Excel-CSV mit Semikolon, Kopfzeile und BOM", () => {
    const r = parsePeopleTable("﻿Vorname;Nachname;E-Mail;BAMF\r\nAnna;Müller;Anna.Mueller@Example.org;ja\r\nBen;Öztürk;ben@example.org;nein\r\n");
    expect(r.problems).toEqual([]);
    expect(r.people).toEqual([
      { line: 2, firstName: "Anna", lastName: "Müller", email: "anna.mueller@example.org", bamfFunded: true },
      { line: 3, firstName: "Ben", lastName: "Öztürk", email: "ben@example.org", bamfFunded: false },
    ]);
  });

  it("liest aus Excel kopierte Zeilen (Tabulator) und Spalten in anderer Reihenfolge", () => {
    const r = parsePeopleTable("E-Mail\tNachname\tVorname\nx@y.de\tKaya\tMehmet\n");
    expect(r.people[0]).toMatchObject({ firstName: "Mehmet", lastName: "Kaya", email: "x@y.de", bamfFunded: false });
  });

  it("kommt ohne Kopfzeile aus und versteht Anführungszeichen", () => {
    const r = parsePeopleTable('Thi,"Nguyen, Van",thi@example.org,x\n');
    expect(r.people[0]).toMatchObject({ firstName: "Thi", lastName: "Nguyen, Van", bamfFunded: true });
  });

  it("meldet fehlerhafte Zeilen mit Zeilennummer und übernimmt den Rest", () => {
    const r = parsePeopleTable("Vorname;Nachname;E-Mail\nAnna;;a@b.de\nBen;Kim;kaputt\nCem;Er;c@d.de\nDora;Ek;C@D.de\n\n");
    expect(r.people.map((p) => p.firstName)).toEqual(["Cem"]);
    expect(r.problems).toEqual([
      { line: 2, message: "Vor- oder Nachname fehlt" },
      { line: 3, message: "E-Mail ungültig: kaputt" },
      { line: 5, message: "E-Mail doppelt in der Tabelle: c@d.de" },
    ]);
  });

  it("begrenzt die Menge und meldet leere Eingaben", () => {
    const many = "Vorname;Nachname;E-Mail\n" + Array.from({ length: 205 }, (_, i) => `A;B;p${i}@x.de`).join("\n");
    const r = parsePeopleTable(many);
    expect(r.people).toHaveLength(200);
    expect(r.problems[0]!.message).toMatch(/Mehr als 200/);
    expect(parsePeopleTable("  \n").problems[0]!.message).toBe("Die Tabelle ist leer.");
  });
});
