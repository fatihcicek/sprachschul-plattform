// Teilnehmendenliste aus einer Tabelle lesen: CSV-Datei (Komma oder Semikolon,
// wie Excel sie speichert, auch im alten Windows-Zeichensatz) oder direkt aus
// Excel kopiert (Tabulator). Reine Regeln ohne Datenbank; läuft im Browser.

export type ImportedPerson = { line: number; firstName: string; lastName: string; email: string; bamfFunded: boolean };
export type ImportProblem = { line: number; message: string };
export type ImportResult = { people: ImportedPerson[]; problems: ImportProblem[]; hasBamfColumn: boolean };

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_NAME_LENGTH = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "firstName" | "lastName" | "email" | "bamf";
const HEADERS: Record<Exclude<Field, "bamf">, string[]> = {
  firstName: ["vorname", "vornamen", "first name", "firstname", "given name"],
  lastName: ["nachname", "familienname", "last name", "lastname", "surname", "name"],
  email: ["e-mail", "email", "mail", "e-mail-adresse", "emailadresse", "e-mail adresse"],
};
const isBamfHeader = (h: string) => h.includes("bamf") || h.includes("förder") || h.includes("foerder");

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Dateiinhalt in Text umwandeln. Excel speichert „CSV (Trennzeichen-getrennt)"
 * im Windows-Zeichensatz; ohne diese Prüfung würde aus „Müller" „M�ller".
 */
export function decodeTableFile(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

let unclosedFrom = 0;

/** Zerlegt den ganzen Text in Zeilen und Zellen; Anführungszeichen dürfen Trennzeichen und Zeilenumbrüche enthalten. */
function records(text: string, d: string): { line: number; cells: string[] }[] {
  unclosedFrom = 0;
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        if (c !== "\r") cur += c === "\n" ? " " : c;
      }
    } else if (c === '"' && cur.trim() === "") quoted = true; // nur am Zellanfang öffnet ein Anführungszeichen
    else if (c === d) {
      cells.push(cur.trim());
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cells.push(cur.trim());
      out.push({ line: start, cells });
      cells = [];
      cur = "";
      line++;
      start = line;
    } else cur += c;
  }
  cells.push(cur.trim());
  out.push({ line: start, cells });
  if (quoted) unclosedFrom = start;
  return out.filter((r) => r.cells.some((c) => c !== ""));
}

function detectDelimiter(firstLine: string): string {
  const counts = ["\t", ";", ","].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

const yes = (s: string) => ["ja", "j", "x", "yes", "y", "1", "true", "wahr"].includes(norm(s));

export function parsePeopleTable(input: string): ImportResult {
  let text = input.replace(/^﻿/, "");
  let d: string | null = null;
  const sep = /^sep=(.)\r?\n/i.exec(text); // Excel-Hinweiszeile „sep=;"
  if (sep) {
    d = sep[1]!;
    text = text.slice(sep[0].length);
  }
  const offset = sep ? 1 : 0;
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!firstLine) return { people: [], problems: [{ line: 0, message: "Die Tabelle ist leer." }], hasBamfColumn: false };
  d ??= detectDelimiter(firstLine);

  const rows = records(text, d).map((r) => ({ ...r, line: r.line + offset }));
  if (unclosedFrom)
    return { people: [], problems: [{ line: unclosedFrom + offset, message: "Anführungszeichen nicht geschlossen; bitte die Zeile prüfen" }], hasBamfColumn: false };
  const head = rows[0]!.cells.map(norm);
  const find = (names: string[]) => head.findIndex((h) => names.includes(h));
  const fn = find(HEADERS.firstName);
  const ln = head.findIndex((h, i) => i !== fn && HEADERS.lastName.includes(h));
  const em = find(HEADERS.email);
  const bf = head.findIndex(isBamfHeader);
  const hasHeader = [fn, ln, em, bf].some((i) => i >= 0);

  if (hasHeader && (fn < 0 || ln < 0 || em < 0)) {
    const missing = [fn < 0 && "Vorname", ln < 0 && "Nachname", em < 0 && "E-Mail"].filter(Boolean).join(", ");
    return {
      people: [],
      problems: [{ line: rows[0]!.line, message: `Spalte fehlt: ${missing}. Bitte Vorname und Nachname in getrennten Spalten (Vorlage herunterladen).` }],
      hasBamfColumn: false,
    };
  }
  const col = hasHeader ? { firstName: fn, lastName: ln, email: em, bamf: bf } : { firstName: 0, lastName: 1, email: 2, bamf: 3 };
  const body = hasHeader ? rows.slice(1) : rows;
  const hasBamfColumn = hasHeader ? bf >= 0 : body.some((r) => (r.cells[3] ?? "") !== "");

  const people: ImportedPerson[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  for (const { line, cells } of body) {
    const get = (k: Field) => (col[k] >= 0 ? (cells[col[k]] ?? "") : "");
    const firstName = get("firstName");
    const lastName = get("lastName");
    const email = get("email").toLowerCase();
    if (!firstName || !lastName) {
      problems.push({ line, message: "Vor- oder Nachname fehlt" });
      continue;
    }
    if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
      problems.push({ line, message: "Name zu lang" });
      continue;
    }
    if (!EMAIL.test(email) || email.length > 254) {
      problems.push({ line, message: email ? `E-Mail ungültig: ${email}` : "E-Mail fehlt" });
      continue;
    }
    if (seen.has(email)) {
      problems.push({ line, message: `E-Mail doppelt in der Tabelle: ${email}` });
      continue;
    }
    if (people.length >= MAX_IMPORT_ROWS) {
      problems.push({ line, message: `Mehr als ${MAX_IMPORT_ROWS} Personen; Rest nicht übernommen` });
      break;
    }
    seen.add(email);
    people.push({ line, firstName, lastName, email, bamfFunded: yes(get("bamf")) });
  }
  if (!people.length && !problems.length) problems.push({ line: 0, message: "Keine Personen gefunden." });
  return { people, problems, hasBamfColumn };
}

/** Vorlage zum Herunterladen (Semikolon, wie deutsches Excel). */
export const IMPORT_TEMPLATE = "Vorname;Nachname;E-Mail;BAMF\nAnna;Beispiel;anna.beispiel@example.org;ja\n";
