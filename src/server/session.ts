// Anmeldung über ein signiertes Cookie. Vorläufig mit Demo-Auswahl (DEMO_LOGIN=1);
// echte Konten ersetzen später nur loginAs(), nicht den Rest.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, organizations, users } from "@/db/schema";
import { withOrganization, withSlugLookup } from "@/db/client";
import { getDb } from "@/db";

const COOKIE = "kw_session";
const MAX_AGE = 60 * 60 * 12;

export type Session = { membershipId: string; organizationId: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET fehlt oder ist zu kurz");
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
    return { membershipId: data.membershipId, organizationId: data.organizationId };
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
  (await cookies()).set(COOKIE, encodeSession(session), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export const demoLoginEnabled = () => process.env.DEMO_LOGIN === "1";

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
  await setSession({ membershipId, organizationId });
}
