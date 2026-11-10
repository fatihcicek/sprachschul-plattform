// Teilnehmendenliste aus einer Tabelle lesen: CSV-Datei (Komma oder Semikolon,
// wie Excel sie speichert) oder direkt aus Excel kopiert (Tabulator).
// Reine Regeln ohne Datenbank; läuft im Browser.

export type ImportedPerson = { line: number; firstName: string; lastName: string; email: string; bamfFunded: boolean };
export type ImportProblem = { line: number; message: string };

export const MAX_IMPORT_ROWS = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADERS: Record<"firstName" | "lastName" | "email" | "bamf", string[]> = {
  firstName: ["vorname", "first name", "firstname", "given name"],
  lastName: ["nachname", "name", "familienname", "last name", "lastname", "surname"],
  email: ["e-mail", "email", "mail", "e-mail-adresse", "emailadresse"],
  bamf: ["bamf", "bamf-gefördert", "bamf gefördert", "gefördert", "bamf-teilnehmende"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function detectDelimiter(firstLine: string): string {
  const counts = ["\t", ";", ","].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

/** Zerlegt eine Zeile; berücksichtigt Anführungszeichen ("Müller; Anna"). */
function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === d && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const yes = (s: string) => ["ja", "j", "x", "yes", "y", "1", "true", "wahr"].includes(norm(s));

export function parsePeopleTable(text: string): { people: ImportedPerson[]; problems: ImportProblem[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const firstContent = lines.findIndex((l) => l.trim() !== "");
  if (firstContent < 0) return { people: [], problems: [{ line: 0, message: "Die Tabelle ist leer." }] };
  const d = detectDelimiter(lines[firstContent]!);

  // Kopfzeile erkennen; ohne Kopfzeile gilt die Reihenfolge Vorname, Nachname, E-Mail, BAMF.
  const head = splitLine(lines[firstContent]!, d).map(norm);
  const col = { firstName: 0, lastName: 1, email: 2, bamf: 3 } as Record<keyof typeof HEADERS, number>;
  let hasHeader = false;
  for (const key of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
    const idx = head.findIndex((h) => HEADERS[key].includes(h));
    if (idx >= 0) {
      col[key] = idx;
      hasHeader = true;
    }
  }
  if (hasHeader && !head.some((h) => HEADERS.bamf.includes(h))) col.bamf = -1;

  const people: ImportedPerson[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  for (let i = firstContent + (hasHeader ? 1 : 0); i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "" || splitLine(raw, d).every((c) => c === "")) continue;
    const line = i + 1;
    const cells = splitLine(raw, d);
    const get = (k: keyof typeof col) => (col[k] >= 0 ? (cells[col[k]] ?? "") : "");
    const firstName = get("firstName");
    const lastName = get("lastName");
    const email = get("email").toLowerCase();
    if (!firstName || !lastName) {
      problems.push({ line, message: "Vor- oder Nachname fehlt" });
      continue;
    }
    if (!EMAIL.test(email)) {
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
  return { people, problems };
}

/** Vorlage zum Herunterladen (Semikolon, wie deutsches Excel). */
export const IMPORT_TEMPLATE = "Vorname;Nachname;E-Mail;BAMF\nAnna;Beispiel;anna.beispiel@example.org;ja\n";
