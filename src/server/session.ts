// Anmeldung über ein signiertes Cookie. Vorläufig mit Demo-Auswahl (DEMO_LOGIN=1);
// echte Konten ersetzen später nur loginAs(), nicht den Rest.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, organizations, users } from "@/db/schema";
import { withOrganization, withSlugLookup } from "@/db/client";
import { getDb } from "@/db";
import { currentPasswordVersion } from "@/server/auth";

const COOKIE = "kw_session";
const MAX_AGE = 60 * 60 * 12;

/** passwordVersion: Stand des Passworts beim Anmelden. Ändert es sich, ist die Sitzung ungültig. */
export type Session = { membershipId: string; organizationId: string; passwordVersion: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET fehlt oder ist zu kurz");
  if (process.env.NODE_ENV === "production" && s === "entwicklung-nur-lokal-bitte-ersetzen") throw new Error("SESSION_SECRET ist noch der Beispielwert");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(session: Session, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: now + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session & { exp: number };
    if (typeof data.exp !== "number" || data.exp < now) return null;
    return { membershipId: data.membershipId, organizationId: data.organizationId, passwordVersion: typeof data.passwordVersion === "number" ? data.passwordVersion : 0 };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return decodeSession((await cookies()).get(COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function setSession(session: Session) {
  // "secure" nur, wenn die Seite wirklich über HTTPS kommt; sonst würde der
  // Browser das Cookie auf einer Testadresse ohne Zertifikat verwerfen.
  const h = await headers();
  const https = h.get("x-forwarded-proto") === "https" || h.get("x-forwarded-ssl") === "on";
  (await cookies()).set(COOKIE, encodeSession(session), { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge: MAX_AGE });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/**
 * Die Demo-Anmeldung umgeht Passwörter. Sie läuft nur außerhalb der Produktion
 * oder zusammen mit den Beispieldaten (DEMO_SEED=1, also einer Testumgebung).
 */
export const demoLoginEnabled = () => process.env.DEMO_LOGIN === "1" && (process.env.NODE_ENV !== "production" || process.env.DEMO_SEED === "1");

/** Findet die Demo-Schule und ihre Personen für die Auswahl auf der Anmeldeseite. */
export async function demoPeople() {
  if (!demoLoginEnabled()) return { organizationId: null, people: [] };
  const slug = process.env.DEMO_ORG_SLUG ?? "beispielschule";
  const db = await getDb();
  const [org] = await withSlugLookup(db, slug, (tx) => tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)));
  if (!org) return { organizationId: null, people: [] };
  const people = await withOrganization(db, org.id, (tx) =>
    tx
      .select({ membershipId: memberships.id, role: memberships.role, firstName: users.firstName, lastName: users.lastName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.active, true)),
  );
  return { organizationId: org.id, people };
}

/** Meldet als eine Person der Demo-Schule an. Prüft, dass sie wirklich dort Mitglied ist. */
export async function loginAs(membershipId: string) {
  const { organizationId, people } = await demoPeople();
  if (!organizationId || !people.some((p) => p.membershipId === membershipId)) throw new Error("Unbekannte Person");
  const db = await getDb();
  const passwordVersion = await withOrganization(db, organizationId, (tx) => currentPasswordVersion(tx, membershipId));
  await setSession({ membershipId, organizationId, passwordVersion });
}
