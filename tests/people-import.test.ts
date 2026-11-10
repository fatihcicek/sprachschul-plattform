import { describe, expect, it } from "vitest";
import { decodeTableFile, parsePeopleTable } from "@/domain/people-import";

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

  it("liest Umlaute aus Excel-Dateien im Windows-Zeichensatz", () => {
    const win1252 = new Uint8Array([...Buffer.from("Vorname;Nachname;E-Mail\r\nJ"), 0xfc, ...Buffer.from("rgen;M"), 0xfc, ...Buffer.from("ller;j@m.de\r\n")]);
    expect(parsePeopleTable(decodeTableFile(win1252)).people[0]).toMatchObject({ firstName: "Jürgen", lastName: "Müller" });
    expect(decodeTableFile(new TextEncoder().encode("Öztürk"))).toBe("Öztürk");
  });

  it("verlangt Vor- und Nachnamen in getrennten Spalten", () => {
    const r = parsePeopleTable("Name;E-Mail;BAMF\nAnna Müller;a@b.de;ja\n");
    expect(r.people).toEqual([]);
    expect(r.problems[0]!.message).toMatch(/Spalte fehlt: Vorname/);
  });

  it("erkennt BAMF-Spalten mit anderer Überschrift und meldet, ob es eine gibt", () => {
    const r = parsePeopleTable("Vorname;Nachname;E-Mail;BAMF-gefördert (ja/nein)\nA;B;a@b.de;ja\n");
    expect(r.people[0]!.bamfFunded).toBe(true);
    expect(r.hasBamfColumn).toBe(true);
    expect(parsePeopleTable("Vorname;Nachname;E-Mail\nA;B;a@b.de\n").hasBamfColumn).toBe(false);
  });

  it("überspringt die Excel-Zeile sep=; und versteht Zeilenumbrüche in Anführungszeichen", () => {
    const r = parsePeopleTable('sep=;\r\nVorname;Nachname;E-Mail\r\n"Anna\r\nMaria";Kurz;a@b.de;\r\nBen;Lang;b@c.de;;\r\n');
    expect(r.problems).toEqual([]);
    expect(r.people.map((p) => [p.firstName, p.line])).toEqual([["Anna Maria", 3], ["Ben", 5]]);
  });

  it("verliert bei einem einzelnen Anführungszeichen keine Zeilen", () => {
    const r = parsePeopleTable('Vorname;Nachname;E-Mail\nA"x;B;a@b.de\nC;D;c@d.de\nE;F;e@f.de\n');
    expect(r.people.map((p) => p.firstName)).toEqual(['A"x', "C", "E"]);
    const broken = parsePeopleTable('Vorname;Nachname;E-Mail\n"Anna;B;a@b.de\nC;D;c@d.de\n');
    expect(broken.problems[0]!.message).toMatch(/Anführungszeichen nicht geschlossen/);
  });
});
