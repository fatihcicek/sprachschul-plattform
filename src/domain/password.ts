// Passwörter und Einladungslinks: reine Regeln ohne Datenbank.
// Kein Passwort wird je gespeichert, nur ein salzbehafteter Hash (scrypt, in Node eingebaut).

import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const SCRYPT = { N: 2 ** 15, r: 8, p: 2, keylen: 32, maxmem: 128 * 1024 * 1024 };

const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keylen, options, (e, key) => (e ? reject(e) : resolve(key))));

/**
 * Das Hashen ist absichtlich teuer. Es läuft außerhalb des Hauptprozesses
 * (blockiert den Server nicht) und höchstens zwei zugleich; wartet schon eine
 * lange Schlange, wird abgewiesen, statt dass ein Ansturm den Server auslastet.
 */
export class BusyError extends Error {
  constructor() {
    super("Gerade zu viele Anmeldungen. Bitte versuche es gleich noch einmal.");
  }
}
const MAX_PARALLEL = 2;
const MAX_QUEUE = 20;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) {
    if (waiting.length >= MAX_QUEUE) throw new BusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else running += 1;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

/** Erzeugt einen Hash der Form scrypt$N$r$p$salt$hash; die Parameter stehen mit drin, damit sie später erhöht werden können. */
export function hashPassword(password: string): Promise<string> {
  if (password.length > PASSWORD_MAX) throw new Error("Passwort zu lang");
  return limited(async () => {
    const salt = randomBytes(16);
    const key = await scryptAsync(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
    return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX) return false;
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  try {
    const key = await limited(() =>
      scryptAsync(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem }),
    );
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch (e) {
    if (e instanceof BusyError) throw e;
    return false;
  }
}

/** Hash, gegen den bei unbekannter Person geprüft wird, damit die Antwortzeit nichts verrät. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  // Einmal berechnet und gemerkt, aber nie ein Fehler: scheitert die Berechnung, wird sie beim nächsten Mal neu versucht.
  dummy ??= (async () => {
    const salt = randomBytes(16);
    const key = await scryptAsync("kein-echtes-konto", salt, SCRYPT.keylen, SCRYPT);
    return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
  })().catch((e) => {
    dummy = undefined;
    throw e;
  });
  return dummy;
}

const COMMON = new Set(
  (
    "passwort123 password123 passwort1234 password1234 passwort12345 password12345 1234567890 12345678910 0123456789 qwertzuiop qwertyuiop " +
    "passwortpasswort willkommen1 willkommen123 willkommen12 kurswerk123 kurswerk2026 kurswerk1234 sprachschule sprachschule1 deutschkurs1 " +
    "deutsch12345 iloveyou123 sommer2026 winter2026 herbst2026 fruehling2026 sommer12345 fussball123 fußball123 hallo123456 hallo12345 " +
    "master12345 admin12345 administrator letmein1234 changeme123 welcome1234 trustno1234 passw0rd123 p@ssw0rd123 p@ssword123 qwertz12345 " +
    "asdfghjkl1 asdfghjklö 1q2w3e4r5t 1qaz2wsx3edc abcdefghij abcd123456 zaq12wsxcde"
  ).split(" "),
);

/** Gibt eine verständliche Meldung zurück oder null, wenn das Passwort ausreicht. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
  if (password.length > PASSWORD_MAX) return `Das Passwort darf höchstens ${PASSWORD_MAX} Zeichen haben.`;
  const lower = password.toLowerCase();
  if (lower === email.toLowerCase() || COMMON.has(lower)) return "Dieses Passwort ist zu leicht zu erraten. Bitte wähle ein anderes.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Das Passwort darf deine E-Mail-Adresse nicht enthalten.";
  if (new Set(password).size < 4) return "Das Passwort ist zu eintönig. Bitte nutze mehr verschiedene Zeichen.";
  return null;
}

export const INVITATION_DAYS = 7;

/** Einladungslink: <Schul-ID>.<Geheimnis>. Nur das Geheimnis wird als Hash gespeichert. */
export function newInvitationToken(organizationId: string): { token: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { token: `${organizationId}.${secret}`, hash: hashSecret(secret) };
}

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("base64url");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseInvitationToken(token: string): { organizationId: string; hash: string } | null {
  const [org, secret, ...rest] = token.split(".");
  if (!org || !secret || rest.length > 0 || !UUID.test(org) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  return { organizationId: org.toLowerCase(), hash: hashSecret(secret) };
}

/** Anmeldebegrenzung: Fehlversuche je E-Mail und je Schule im Zeitfenster. */
export const LOGIN_LIMITS = { windowMinutes: 15, perEmail: 8, perSchool: 5000 };
