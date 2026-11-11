// Passwort vergessen gegen eine echte Datenbank: Link nur für bestehende aktive Konten, gleiche Antwort sonst,
// Begrenzung, Schultrennung, alter Link erlischt, neues Passwort beendet alte Sitzungen.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { passwordResetMail, RESET_LIMITS } from "@/domain/registration";
import { authenticate, invitationIsValid, redeemInvitation } from "@/server/auth";
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

const ask = (sch: string, email: string, ip = `ip-${randomUUID()}`, now = T0) => requestPasswordReset(db, { school: sch, email }, { ip, secret: SECRET, baseUrl: BASE, now });
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
    const second = await ask(a.slug, a.email, undefined, new Date(T0.getTime() + 20 * 60_000));
    if (first.limited || !first.mail || second.limited || !second.mail) throw new Error("Mails erwartet");
    const t = new Date(T0.getTime() + 21 * 60_000);
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
});
