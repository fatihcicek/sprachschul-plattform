// Passwörter und Einladungslinks: reine Regeln ohne Datenbank.
// Kein Passwort wird je gespeichert, nur ein salzbehafteter Hash (scrypt, in Node eingebaut).

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const SCRYPT = { N: 2 ** 15, r: 8, p: 2, keylen: 32, maxmem: 128 * 1024 * 1024 };

/** Erzeugt einen Hash der Form scrypt$N$r$p$salt$hash; die Parameter stehen mit drin, damit sie später erhöht werden können. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  let key: Buffer;
  try {
    key = scryptSync(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash, gegen den bei unbekannter Person geprüft wird, damit die Antwortzeit nichts verrät. */
export const DUMMY_HASH = hashPassword("kein-echtes-konto");

const COMMON = new Set(["passwort123", "password123", "1234567890", "qwertzuiop", "passwortpasswort", "willkommen1", "willkommen123", "kurswerk123"]);

/** Gibt eine verständliche Meldung zurück oder null, wenn das Passwort ausreicht. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
  if (password.length > PASSWORD_MAX) return `Das Passwort darf höchstens ${PASSWORD_MAX} Zeichen haben.`;
  const lower = password.toLowerCase();
  if (lower === email.toLowerCase() || COMMON.has(lower)) return "Dieses Passwort ist zu leicht zu erraten. Bitte wähle ein anderes.";
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
export const LOGIN_LIMITS = { windowMinutes: 15, perEmail: 8, perSchool: 1000 };
