// Selbstregistrierung einer Schule: reine Regeln ohne Datenbank.

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/** Stand der Nutzungsbedingungen, dem bei der Registrierung zugestimmt wird. Bei Änderung neue Version eintragen. */
export const TERMS_VERSION = "entwurf-2026-11";
export const TRIAL_DAYS = 7;
export const CONFIRM_HOURS = 24;

/** Begrenzung je Stunde. Zählt jede angenommene Registrierungsanfrage, nicht erst die bestätigte. */
export const REGISTRATION_LIMITS = { windowMinutes: 60, perIp: 5, perEmail: 3, global: 100 };

const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;
// Zeichen, die in Namen nichts zu suchen haben, aber in Mails, Adressen oder HTML Ärger machen könnten.
const MARKUP = /[<>]/;

export type RegistrationInput = { schoolName: string; firstName: string; lastName: string; email: string };
export type RegistrationProblem = { field: keyof RegistrationInput | "terms"; message: string };

const clean = (v: unknown) => (typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim() : "");

/** Prüft und bereinigt die Angaben. E-Mail-Adresse wird klein geschrieben. Gibt entweder die Angaben oder das erste Problem zurück. */
export function parseRegistration(
  raw: Record<string, unknown>,
  isValidAddress: (a: string) => boolean,
): { ok: true; value: RegistrationInput } | { ok: false; problem: RegistrationProblem } {
  const schoolName = clean(raw.schoolName);
  const firstName = clean(raw.firstName);
  const lastName = clean(raw.lastName);
  const email = clean(raw.email).toLowerCase();
  const bad = (field: RegistrationProblem["field"], message: string) => ({ ok: false as const, problem: { field, message } });
  for (const [field, v, max] of [["schoolName", schoolName, 120], ["firstName", firstName, 80], ["lastName", lastName, 80]] as const) {
    if (CONTROL.test(String(raw[field] ?? "")) || MARKUP.test(v)) return bad(field, "Bitte nur normalen Text eingeben.");
    if (v.length > max) return bad(field, `Bitte höchstens ${max} Zeichen.`);
  }
  if (schoolName.length < 2) return bad("schoolName", "Bitte gib den Namen der Schule ein.");
  if (!firstName) return bad("firstName", "Bitte gib den Vornamen ein.");
  if (!lastName) return bad("lastName", "Bitte gib den Nachnamen ein.");
  if (!isValidAddress(email)) return bad("email", "Bitte gib eine gültige E-Mail-Adresse ein.");
  return { ok: true, value: { schoolName, firstName, lastName, email } };
}

/** Kürzel für den Login: aus dem Namen, nur a–z, 0–9 und Bindestrich, mit zufälligem Ende gegen Kollisionen und Erraten. */
export function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/g, "");
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const suffix = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${base || "schule"}-${suffix}`;
}

export const hashRegistrationToken = (token: string) => createHash("sha256").update(token).digest("base64url");

/** Bestätigungslink-Geheimnis: 32 Zufallsbytes. In der Datenbank steht nur der Hash. */
export function newRegistrationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRegistrationToken(token) };
}

export const isRegistrationToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

/** Schlüssel für die Zählung: HMAC, damit weder IP-Adressen noch E-Mail-Adressen im Klartext gespeichert werden. */
export const rateKey = (secret: string, kind: "ip" | "email" | "global", value: string) => createHmac("sha256", secret).update(`${kind}:${value}`).digest("base64url");

/** Mailtext: fest, ohne jede Eingabe der registrierenden Person (sonst Phishing unter unserem Absender möglich). */
export function confirmationMail(link: string): { subject: string; text: string } {
  return {
    subject: "Bitte bestätige deine Registrierung bei Kurswerk",
    text: [
      "Hallo,",
      "",
      `für diese E-Mail-Adresse wurde eine Schule bei Kurswerk registriert. Um die Registrierung abzuschließen und die ${TRIAL_DAYS}-tägige Testzeit zu starten, öffne diesen Link:`,
      "",
      link,
      "",
      `Der Link gilt ${CONFIRM_HOURS} Stunden und kann nur einmal verwendet werden.`,
      "Wenn du das nicht warst, ignoriere diese E-Mail. Dann wird nichts angelegt.",
      "",
      "Kurswerk",
    ].join("\n"),
  };
}
