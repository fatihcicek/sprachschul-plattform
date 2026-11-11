// Passwort vergessen gegen eine echte Datenbank: Link nur für bestehende aktive Konten, gleiche Antwort sonst,
// Begrenzung, Schultrennung, alter Link erlischt, neues Passwort beendet alte Sitzungen.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, withRegistrationAccess, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { passwordResetMail, RESET_LIMITS } from "@/domain/registration";
import { authenticate, currentPasswordVersion, invitationIsValid, redeemInvitation } from "@/server/auth";
import { MailError, validateMail } from "@/server/mailer";
import { createPerson } from "@/server/people";
import { requestPasswordReset } from "@/server/password-reset";

if (existsSync(".env")) process.loadEnvFile(".env");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL fehlt");
const name = `kurswerk_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${name}`;

let db: Db;
let pool: Pool;
const SECRET = "test-geheimnis-0123456789";
const BASE = "https://kurswerk.test";
const T0 = new Date("2026-10-01T10:00:00Z");
const PW = "Sonnenblume-2026!";

type School = { orgId: string; slug: string; email: string; inactiveEmail: string };
let a: School;
let b: School;

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: `Schule ${slug}`, slug });
    const email = `leitung@${slug}.test`;
    await createPerson(tx, orgId, { email, firstName: "Lea", lastName: slug, role: "ADMIN" });
    const inactiveEmail = `weg@${slug}.test`;
    const gone = await createPerson(tx, orgId, { email: inactiveEmail, firstName: "Ex", lastName: slug, role: "TEACHER" });
    await tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, gone.membershipId));
    return { orgId, slug, email, inactiveEmail };
  });
}

const askRaw = (sch: string, email: string, ip = `ip-${randomUUID()}`, now = T0) => requestPasswordReset(db, { school: sch, email }, { ip, secret: SECRET, baseUrl: BASE, now });
/** Wie die Seite: erst zählen (vor der Antwort), dann Konto und Link (danach). */
const ask = async (sch: string, email: string, ip?: string, now?: Date) => {
  const r = await askRaw(sch, email, ip, now);
  return r.limited ? r : { limited: false as const, mail: await r.complete() };
};
const tokenOf = (mail: { text: string }) => /\/einladung\/(\S+)/.exec(mail.text)![1]!;

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  ({ db, pool } = createDb(testUrl.toString()));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  a = await school(`alpha-${randomUUID().slice(0, 6)}`);
  b = await school(`beta-${randomUUID().slice(0, 6)}`);
}, 60_000);

afterAll(async () => {
  await pool.end();
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  for (let i = 0; i < 50; i++) {
    const { rows } = await admin.query("select count(*)::int as n from pg_stat_activity where datname = $1", [name]);
    if (rows[0].n === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

const minutes = (m: number) => new Date(T0.getTime() + m * 60_000);

describe("Passwort vergessen", () => {
  it("schickt für ein bestehendes Konto einen Link, der zur Person passt und ein neues Passwort erlaubt", async () => {
    const r = await ask(a.slug, a.email);
    expect(r.limited).toBe(false);
    if (r.limited || !r.mail) throw new Error("Mail erwartet");
    expect(r.mail.to).toBe(a.email);
    expect(r.mail.text).toContain(`${BASE}/einladung/`);
    expect(await invitationIsValid(db, tokenOf(r.mail), T0)).toMatchObject({ email: a.email });
    // Link einlösen: danach gilt das neue Passwort, ein zweites Einlösen scheitert.
    expect((await redeemInvitation(db, tokenOf(r.mail), PW, T0)).ok).toBe(true);
    expect((await authenticate(db, a.slug, a.email, PW, T0)).ok).toBe(true);
    expect((await redeemInvitation(db, tokenOf(r.mail), "Anderes-Passwort-77!", T0)).ok).toBe(false);
  });

  it("antwortet für unbekannte Schule, unbekannte Adresse und deaktivierte Person gleich (keine Mail, kein Fehler)", async () => {
    for (const [slug, email] of [["gibt-es-nicht", a.email], [a.slug, "niemand@nirgendwo.test"], [a.slug, a.inactiveEmail], ["", ""], ["x\u0000y", a.email]] as const) {
      expect(await ask(slug, email)).toEqual({ limited: false, mail: null });
    }
  });

  it("Schule B bekommt für eine Adresse von Schule A nichts", async () => {
    expect(await ask(b.slug, a.email)).toEqual({ limited: false, mail: null });
  });

  it("ein neuer Link macht den vorherigen ungültig", async () => {
    const first = await ask(a.slug, a.email, undefined, new Date(T0.getTime() + 10 * 60_000));
    const second = await ask(a.slug, a.email, undefined, new Date(T0.getTime() + 30 * 60_000));
    if (first.limited || !first.mail || second.limited || !second.mail) throw new Error("Mails erwartet");
    const t = new Date(T0.getTime() + 31 * 60_000);
    expect(await invitationIsValid(db, tokenOf(first.mail), t)).toBeNull();
    expect(await invitationIsValid(db, tokenOf(second.mail), t)).not.toBeNull();
  });

  it("begrenzt Anfragen je Adresse, auch für unbekannte, ohne zu verraten, ob es sie gibt", async () => {
    const t = new Date(T0.getTime() + 3 * 3_600_000);
    for (const email of [b.email, "unbekannt@nirgendwo.test"]) {
      for (let i = 0; i < RESET_LIMITS.perEmail; i++) expect((await ask(b.slug, email, undefined, t)).limited).toBe(false);
      expect((await ask(b.slug, email, undefined, t)).limited).toBe(true);
    }
    // Eine Stunde später geht es wieder.
    expect((await ask(b.slug, b.email, undefined, new Date(t.getTime() + 61 * 60_000))).limited).toBe(false);
  });

  it("begrenzt Anfragen je IP-Adresse", async () => {
    const t = new Date(T0.getTime() + 6 * 3_600_000);
    const ip = "ip-fest";
    for (let i = 0; i < RESET_LIMITS.perIp; i++) expect((await ask(a.slug, `zufall${i}@nirgendwo.test`, ip, t)).limited).toBe(false);
    expect((await ask(a.slug, "noch-eins@nirgendwo.test", ip, t)).limited).toBe(true);
  });

  it("Mailtext ist fest und enthält Link und Schule, keine fremden Eingaben", () => {
    const m = passwordResetMail("https://kurswerk.test/einladung/abc", "meine-schule", 7);
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain("https://kurswerk.test/einladung/abc");
    expect(m.text).toContain("meine-schule");
    expect(m.text).toContain("ignoriere diese E-Mail");
  });

  it("vor der Antwort geschieht für bekannte und unbekannte Konten nur das Zählen: Link und Konto-Suche stecken in complete()", async () => {
    const t = minutes(24 * 60);
    const before = async () => withOrganization(db, a.orgId, (tx) => tx.select().from(s.invitations));
    const n0 = (await before()).length;
    const known = await askRaw(a.slug, a.email, undefined, t);
    const unknown = await askRaw(a.slug, "jemand-anderes@nirgendwo.test", undefined, t);
    expect(known.limited).toBe(false);
    expect(unknown.limited).toBe(false);
    expect((await before()).length).toBe(n0); // noch kein Link angelegt
    if (known.limited) throw new Error("unerwartet");
    expect(await known.complete()).not.toBeNull();
    expect((await before()).length).toBe(n0 + 1);
  });

  it("ein frischer Link wird nicht durch eine weitere Anfrage ersetzt (Dritte können ihn nicht entwerten)", async () => {
    const t = minutes(2 * 24 * 60);
    const first = await ask(a.slug, a.email, undefined, t);
    if (first.limited || !first.mail) throw new Error("Mail erwartet");
    expect(await ask(a.slug, a.email, undefined, minutes(2 * 24 * 60 + 5))).toEqual({ limited: false, mail: null });
    expect(await invitationIsValid(db, tokenOf(first.mail), minutes(2 * 24 * 60 + 6))).not.toBeNull();
    // Nach 15 Minuten gibt es wieder einen neuen.
    const later = await ask(a.slug, a.email, undefined, minutes(2 * 24 * 60 + 20));
    expect(later.limited === false && later.mail !== null).toBe(true);
  });

  it("protokolliert die Anfrage im Vorgangsprotokoll der Schule", async () => {
    const events = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "account.password_reset_requested")));
    expect(events.length).toBeGreaterThan(0);
  });

  it("begrenzt Anfragen je Schule, damit eine Welle gegen eine Schule nicht alle trifft", async () => {
    const t = minutes(9 * 3_600_000 / 60_000);
    const c = await school(`gamma-${randomUUID().slice(0, 6)}`);
    for (let i = 0; i < RESET_LIMITS.perSchool; i++) expect((await askRaw(c.slug, `x${i}@nirgendwo.test`, undefined, t)).limited).toBe(false);
    expect((await askRaw(c.slug, "y@nirgendwo.test", undefined, t)).limited).toBe(true);
    // Eine andere Schule ist nicht betroffen.
    expect((await askRaw(a.slug, "z@nirgendwo.test", undefined, t)).limited).toBe(false);
  });

  it("neues Passwort beendet alte Sitzungen (Passwortversion ändert sich) und hebt die Login-Sperre auf", async () => {
    const t = minutes(4 * 24 * 60);
    const before = await withOrganization(db, a.orgId, async (tx) => {
      const [m] = await tx.select({ id: s.memberships.id }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(eq(s.users.email, a.email));
      return currentPasswordVersion(tx, m!.id);
    });
    // Konto sperren: mehr Fehlversuche als erlaubt.
    for (let i = 0; i < 8; i++) await authenticate(db, a.slug, a.email, "falsch-falsch-1", t);
    expect((await authenticate(db, a.slug, a.email, PW, t))).toEqual({ ok: false, reason: "locked" });
    const r = await ask(a.slug, a.email, undefined, t);
    if (r.limited || !r.mail) throw new Error("Mail erwartet");
    expect((await redeemInvitation(db, tokenOf(r.mail), "Neues-Passwort-88!", new Date(t.getTime() + 1000))).ok).toBe(true);
    const after = await withOrganization(db, a.orgId, async (tx) => {
      const [m] = await tx.select({ id: s.memberships.id }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(eq(s.users.email, a.email));
      return currentPasswordVersion(tx, m!.id);
    });
    expect(after).toBeGreaterThan(before);
    const login = await authenticate(db, a.slug, a.email, "Neues-Passwort-88!", new Date(t.getTime() + 2000));
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.passwordVersion).toBe(after);
  });

  it("der Link läuft nach 7 Tagen ab, und eine danach deaktivierte Person kann ihn nicht mehr einlösen", async () => {
    const t = minutes(10 * 24 * 60);
    const r = await ask(b.slug, b.email, undefined, t);
    if (r.limited || !r.mail) throw new Error("Mail erwartet");
    expect(await invitationIsValid(db, tokenOf(r.mail), new Date(t.getTime() + 8 * 86_400_000))).toBeNull();
    await withOrganization(db, b.orgId, async (tx) => {
      const [m] = await tx.select({ id: s.memberships.id }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(eq(s.users.email, b.email));
      await tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, m!.id));
    });
    expect((await redeemInvitation(db, tokenOf(r.mail), "Wieder-ein-Passwort-5!", new Date(t.getTime() + 1000))).ok).toBe(false);
  });

  it("Zählschlüssel sind ohne Kenntnis der Schlüssel nicht lesbar", async () => {
    const rows = await withRegistrationAccess(db, {}, (tx) => tx.select().from(s.registrationAttempts));
    expect(rows).toEqual([]);
  });

  it("eine Adresse mit Zeilenumbruch kommt nie bis in eine Mail", () => {
    expect(() => validateMail({ to: "a@b.de\r\nBcc: x@y.de", subject: "s", text: "t" })).toThrow(MailError);
    expect(() => validateMail({ to: "a@b.de", subject: "s\r\nBcc: x@y.de", text: "t" })).toThrow(MailError);
  });
});
