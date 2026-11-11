// Selbstregistrierung einer Schule: reine Regeln ohne Datenbank.

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/** Stand der Nutzungsbedingungen, dem bei der Registrierung zugestimmt wird. Bei Änderung neue Version eintragen. */
export const TERMS_VERSION = "entwurf-2026-11";
export const TRIAL_DAYS = 7;
export const CONFIRM_HOURS = 24;

/** Begrenzung je Stunde. Zählt jede angenommene Registrierungsanfrage, nicht erst die bestätigte. */
export const REGISTRATION_LIMITS = { windowMinutes: 60, perIp: 5, perEmail: 3, global: 100 };
/** Passwort vergessen: Jede Anfrage zählt, auch für unbekannte Adressen (sonst ließe sich damit Adressen abfragen). */
export const RESET_LIMITS = { windowMinutes: 60, perIp: 10, perEmail: 3, perSchool: 30, global: 200 };
/** Ein frischer Link wird nicht durch einen neuen ersetzt: Dritte sollen ihn nicht per Anfrage entwerten können. */
export const RESET_REUSE_MINUTES = 15;

// Auch unsichtbare Zeichen und Textrichtungs-Umschalter: Sie könnten dem Empfänger einen irreführenden Schulnamen vortäuschen.
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
// Zeichen, die in Namen nichts zu suchen haben, aber in Mails, Adressen oder HTML Ärger machen könnten.
const MARKUP = /[<>]/;

export type RegistrationInput = { schoolName: string; firstName: string; lastName: string; email: string; bamfEnabled: boolean };
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
  const bamfEnabled = raw.bamf === "on" || raw.bamf === true;
  return { ok: true, value: { schoolName, firstName, lastName, email, bamfEnabled } };
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
export const rateKey = (secret: string, kind: "ip" | "email" | "global" | "reset-ip" | "reset-email" | "reset-school" | "reset-global", value: string) => createHmac("sha256", secret).update(`${kind}:${value}`).digest("base64url");

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


/**
 * Mail nach der Bestätigung: Link zum Passwort-Setzen. So geht nichts verloren, wenn jemand den Tab schließt.
 * Fester Text; Kürzel und Link erzeugt das System selbst, nichts davon stammt aus Eingaben.
 */
export function passwordLinkMail(link: string, slug: string, invitationDays: number): { subject: string; text: string } {
  return {
    subject: "Dein Kurswerk-Zugang: Passwort festlegen",
    text: [
      "Hallo,",
      "",
      `deine Schule wurde bei Kurswerk angelegt, die ${TRIAL_DAYS}-tägige Testzeit läuft. Lege mit diesem Link dein Passwort fest:`,
      "",
      link,
      "",
      `Der Link gilt ${invitationDays} Tage und kann nur einmal verwendet werden. Gib ihn nicht weiter: Wer ihn zuerst öffnet, legt das Passwort fest.`,
      "",
      `Danach meldest du dich mit dieser E-Mail-Adresse und dem Schulkürzel ${slug} an.`,
      "Wenn du das nicht warst, ignoriere diese E-Mail.",
      "",
      "Kurswerk",
    ].join("\n"),
  };
}

/**
 * Schlüssel für die Begrenzung pro Postfach: Plus-Zusätze und bei Gmail die Punkte zählen nicht als andere Adresse,
 * sonst ließe sich ein Postfach über viele Varianten mit Mails fluten.
 */
export function mailboxKey(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  const base = (local.split("+")[0] ?? "").replace(gmail ? /\./g : /$^/, "");
  return `${base}@${gmail ? "gmail.com" : domain}`;
}

/**
 * Adresse des Aufrufers aus x-forwarded-for. `hops` ist die Zahl der vertrauenswürdigen Vermittler (Standard 1):
 * Gezählt wird von rechts, weil nur diese Einträge von uns kontrollierte Server angehängt haben.
 * IPv6 wird auf das /64-Präfix gekürzt, sonst wechselt jeder Nutzer kostenlos die Adresse.
 */
export function clientIpFrom(forwardedFor: string | null, hops = 1): string {
  const parts = (forwardedFor ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const ip = parts[parts.length - Math.max(1, hops)] ?? parts[0];
  if (!ip) return "unbekannt";
  if (!ip.includes(":")) return ip;
  const groups = ip.split("::")[0]!.split(":").slice(0, 4);
  return `v6:${groups.join(":")}`;
}

/** Mailtext für „Passwort vergessen“: fest, ohne Eingaben von außen. */
export function passwordResetMail(link: string, slug: string, invitationDays: number): { subject: string; text: string } {
  return {
    subject: "Kurswerk: Passwort neu festlegen",
    text: [
      "Hallo,",
      "",
      `für dein Konto bei Kurswerk (Schule: ${slug}) wurde ein neues Passwort angefordert. Lege es mit diesem Link fest:`,
      "",
      link,
      "",
      `Der Link gilt ${invitationDays} Tage und kann nur einmal verwendet werden. Gib ihn nicht weiter.`,
      "Frühere Links zu diesem Konto sind damit ungültig. Dein bisheriges Passwort bleibt gültig, bis du ein neues festlegst.",
      "Wenn du das nicht angefordert hast, ignoriere diese E-Mail.",
      "",
      "Kurswerk",
    ].join("\n"),
  };
}
