// Anmeldung gegen eine echte Datenbank: Passwörter, Sperre, Einladungslinks, Rechte, Schultrennung.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { createPerson } from "@/server/people";
import { NotAllowedError } from "@/server/actor";
import { accessStates, authenticate, createInvitation, inviteAsActor, invitationIsValid, listAccounts, redeemInvitation } from "@/server/auth";
import { hashPassword, LOGIN_LIMITS, parseInvitationToken, passwordProblem, verifyPassword } from "@/domain/password";
import { canManageAccountOf } from "@/domain/permissions";

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
type School = { orgId: string; slug: string; admin: string; staff: string; teacher: string; learner: string };
let a: School;
let b: School;

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: slug, slug });
    const p = async (role: (typeof s.role.enumValues)[number], first: string) =>
      (await createPerson(tx, orgId, { email: `${first}@${slug}.test`, firstName: first, lastName: slug, role })).membershipId;
    return { orgId, slug, admin: await p("ADMIN", "leitung"), staff: await p("STAFF", "verwaltung"), teacher: await p("TEACHER", "lehrkraft"), learner: await p("LEARNER", "eins") };
  });
}

const run = <T>(sch: School, fn: (tx: Tx) => Promise<T>) => withOrganization(db, sch.orgId, fn);
const GOOD = "Sonnenblume-2026!";

/** Zugang einrichten wie im echten Ablauf: Link erzeugen und einlösen. */
async function setUp(sch: School, who: keyof Pick<School, "admin" | "staff" | "teacher" | "learner">, password = GOOD) {
  const { token } = await run(sch, (tx) => createInvitation(tx, sch.orgId, sch[who], sch.admin));
  const r = await redeemInvitation(db, token, password);
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  ({ db, pool } = createDb(testUrl.toString()));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  a = await school("alpha");
  b = await school("beta");
}, 60_000);

afterAll(async () => {
  await pool.end();
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe("Passwort-Regeln", () => {
  it("hasht mit Salz und prüft richtig", () => {
    const h1 = hashPassword(GOOD);
    const h2 = hashPassword(GOOD);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain(GOOD);
    expect(verifyPassword(GOOD, h1)).toBe(true);
    expect(verifyPassword("falsch", h1)).toBe(false);
    expect(verifyPassword(GOOD, "kaputt")).toBe(false);
    expect(verifyPassword(GOOD, "scrypt$x$y$z$a$b")).toBe(false);
  });
  it("lehnt zu kurze, zu leichte und zu lange Passwörter ab", () => {
    expect(passwordProblem("kurz", "x@y.de")).toMatch(/mindestens/);
    expect(passwordProblem("aaaaaaaaaaaa", "x@y.de")).toBeTruthy();
    expect(passwordProblem("passwort123", "x@y.de")).toBeTruthy();
    expect(passwordProblem("x@y.de-x@y.de".slice(0, 6) + "xxxxxxxx", "q@y.de")).toBeDefined();
    expect(passwordProblem("a".repeat(201), "x@y.de")).toMatch(/höchstens/);
    expect(passwordProblem(GOOD, "x@y.de")).toBeNull();
  });
  it("erkennt nur wohlgeformte Einladungslinks", () => {
    expect(parseInvitationToken("quatsch")).toBeNull();
    expect(parseInvitationToken(`${randomUUID()}.kurz`)).toBeNull();
    expect(parseInvitationToken(`${randomUUID()}.${"a".repeat(43)}.x`)).toBeNull();
    expect(parseInvitationToken(`${randomUUID()}.${"a".repeat(43)}`)).not.toBeNull();
  });
  it("Leitung darf alle einladen, Verwaltung nur Lehrkräfte und Teilnehmende", () => {
    expect(canManageAccountOf("ADMIN", "ADMIN")).toBe(true);
    expect(canManageAccountOf("STAFF", "ADMIN")).toBe(false);
    expect(canManageAccountOf("STAFF", "STAFF")).toBe(false);
    expect(canManageAccountOf("STAFF", "TEACHER")).toBe(true);
    expect(canManageAccountOf("STAFF", "LEARNER")).toBe(true);
    expect(canManageAccountOf("TEACHER", "LEARNER")).toBe(false);
    expect(canManageAccountOf("LEARNER", "LEARNER")).toBe(false);
  });
});

describe("Einladung und Anmeldung", () => {
  it("ohne Passwort ist keine Anmeldung möglich", async () => {
    expect(await authenticate(db, a.slug, "leitung@alpha.test", GOOD)).toEqual({ ok: false, reason: "invalid" });
  });

  it("Link setzt das Passwort, danach gelingt die Anmeldung (E-Mail ohne Groß-/Kleinschreibung)", async () => {
    await setUp(a, "admin");
    const r = await authenticate(db, a.slug, " Leitung@Alpha.test ", GOOD);
    expect(r).toEqual({ ok: true, membershipId: a.admin, organizationId: a.orgId });
    expect(await authenticate(db, a.slug, "leitung@alpha.test", "falsches-Passwort")).toEqual({ ok: false, reason: "invalid" });
  });

  it("speichert nie das Passwort oder den Link im Klartext", async () => {
    const { token } = await run(a, (tx) => createInvitation(tx, a.orgId, a.teacher, a.admin));
    const secret = token.split(".")[1]!;
    const inv = await run(a, (tx) => tx.select().from(s.invitations));
    const creds = await run(a, (tx) => tx.select().from(s.credentials));
    expect(JSON.stringify(inv)).not.toContain(secret);
    expect(JSON.stringify(creds)).not.toContain(GOOD);
  });

  it("Link gilt genau einmal, auch bei gleichzeitigen Aufrufen", async () => {
    const { token } = await run(a, (tx) => createInvitation(tx, a.orgId, a.learner, a.admin));
    const results = await Promise.all([redeemInvitation(db, token, GOOD), redeemInvitation(db, token, "Anderes-Passwort-77"), redeemInvitation(db, token, "Drittes-Passwort-88")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await redeemInvitation(db, token, GOOD)).ok).toBe(false);
    expect(await invitationIsValid(db, token)).toBeNull();
  });

  it("abgelaufene und neu ersetzte Links sind ungültig", async () => {
    const old = new Date(Date.now() - 8 * 86_400_000);
    const { token: expired } = await run(a, (tx) => createInvitation(tx, a.orgId, a.staff, a.admin, old));
    expect((await redeemInvitation(db, expired, GOOD)).ok).toBe(false);
    const first = await run(a, (tx) => createInvitation(tx, a.orgId, a.staff, a.admin));
    const second = await run(a, (tx) => createInvitation(tx, a.orgId, a.staff, a.admin));
    expect((await redeemInvitation(db, first.token, GOOD)).ok).toBe(false);
    expect((await redeemInvitation(db, second.token, GOOD)).ok).toBe(true);
  });

  it("schwaches Passwort verbraucht den Link nicht", async () => {
    const { token } = await run(a, (tx) => createInvitation(tx, a.orgId, a.teacher, a.admin));
    const weak = await redeemInvitation(db, token, "kurz");
    expect(weak).toMatchObject({ ok: false, reason: "weak" });
    expect((await redeemInvitation(db, token, GOOD)).ok).toBe(true);
  });

  it("Link einer Schule funktioniert nicht mit der Schul-ID einer anderen", async () => {
    const { token } = await run(a, (tx) => createInvitation(tx, a.orgId, a.admin, a.admin));
    const secret = token.split(".")[1]!;
    expect((await redeemInvitation(db, `${b.orgId}.${secret}`, GOOD)).ok).toBe(false);
    expect(await invitationIsValid(db, `${b.orgId}.${secret}`)).toBeNull();
  });

  it("gleiche E-Mail an zwei Schulen: jede Anmeldung bleibt in ihrer Schule", async () => {
    const c = await school("gamma");
    const d = await school("delta");
    await run(c, (tx) => tx.update(s.users).set({ email: "gleich@beispiel.test" }).where(eq(s.users.email, "leitung@gamma.test")));
    await run(d, (tx) => tx.update(s.users).set({ email: "gleich@beispiel.test" }).where(eq(s.users.email, "leitung@delta.test")));
    await setUp(c, "admin", "Passwort-nur-gamma-1");
    expect(await authenticate(db, d.slug, "gleich@beispiel.test", "Passwort-nur-gamma-1")).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate(db, c.slug, "gleich@beispiel.test", "Passwort-nur-gamma-1")).toMatchObject({ ok: true, organizationId: c.orgId });
  });

  it("unbekannte Schule, unbekannte E-Mail und falsches Passwort sehen gleich aus", async () => {
    const r1 = await authenticate(db, "gibt-es-nicht", "x@y.de", GOOD);
    const r2 = await authenticate(db, a.slug, "niemand@alpha.test", GOOD);
    const r3 = await authenticate(db, a.slug, "leitung@alpha.test", "falsch");
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("inaktive Personen können sich nicht anmelden", async () => {
    const e = await school("epsilon");
    await setUp(e, "teacher");
    await run(e, (tx) => tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, e.teacher)));
    expect(await authenticate(db, e.slug, "lehrkraft@epsilon.test", GOOD)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("Sperre nach Fehlversuchen", () => {
  it("sperrt eine E-Mail nach zu vielen Fehlversuchen, auch mit richtigem Passwort, und gibt sie nach der Wartezeit frei", async () => {
    const f = await school("zeta");
    await setUp(f, "admin");
    const t0 = new Date("2026-11-10T10:00:00Z");
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) expect((await authenticate(db, f.slug, "leitung@zeta.test", "falsch", t0)).ok).toBe(false);
    expect(await authenticate(db, f.slug, "leitung@zeta.test", GOOD, t0)).toEqual({ ok: false, reason: "locked" });
    // andere Person derselben Schule ist nicht betroffen
    expect(await authenticate(db, f.slug, "lehrkraft@zeta.test", "falsch", t0)).toEqual({ ok: false, reason: "invalid" });
    const later = new Date(t0.getTime() + (LOGIN_LIMITS.windowMinutes + 1) * 60_000);
    expect(await authenticate(db, f.slug, "leitung@zeta.test", GOOD, later)).toMatchObject({ ok: true });
  });

  it("zählt auch Versuche mit unbekannter E-Mail", async () => {
    const g = await school("eta");
    const t0 = new Date("2026-11-10T10:00:00Z");
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) await authenticate(db, g.slug, "geraten@eta.test", "x", t0);
    expect(await authenticate(db, g.slug, "geraten@eta.test", "x", t0)).toEqual({ ok: false, reason: "locked" });
  });

  it("ein neues Passwort über Link hebt die Sperre dieser Person auf", async () => {
    const h = await school("theta");
    await setUp(h, "admin");
    const t0 = new Date();
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) await authenticate(db, h.slug, "leitung@theta.test", "falsch", t0);
    expect(await authenticate(db, h.slug, "leitung@theta.test", GOOD, t0)).toMatchObject({ reason: "locked" });
    await setUp(h, "admin", "Neues-Passwort-2026");
    expect(await authenticate(db, h.slug, "leitung@theta.test", "Neues-Passwort-2026")).toMatchObject({ ok: true });
  });
});

describe("Rechte beim Einladen", () => {
  it("Verwaltung darf Lehrkraft einladen, aber nie Leitung oder Verwaltung", async () => {
    await expect(run(a, (tx) => inviteAsActor(tx, a.staff, a.teacher))).resolves.toHaveProperty("token");
    await expect(run(a, (tx) => inviteAsActor(tx, a.staff, a.admin))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => inviteAsActor(tx, a.staff, a.staff))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("Leitung darf alle einladen", async () => {
    await expect(run(a, (tx) => inviteAsActor(tx, a.admin, a.staff))).resolves.toHaveProperty("token");
  });
  it("Lehrkräfte und Teilnehmende dürfen niemanden einladen oder die Liste sehen", async () => {
    await expect(run(a, (tx) => inviteAsActor(tx, a.teacher, a.learner))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => inviteAsActor(tx, a.learner, a.learner))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => listAccounts(tx, a.teacher))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("Person einer anderen Schule ist nicht einladbar", async () => {
    await expect(run(a, (tx) => inviteAsActor(tx, a.admin, b.teacher))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("protokolliert Einrichtung und Passwort-Setzen", async () => {
    const k = await school("iota");
    await setUp(k, "teacher");
    const events = await run(k, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, k.teacher)));
    expect(events.map((e) => e.action).sort()).toEqual(["account.invitation_created", "account.password_set"]);
  });
  it("Zugangsstatus und Liste zeigen nie Passwort-Hashes", async () => {
    const l = await school("kappa");
    await setUp(l, "teacher");
    await run(l, (tx) => createInvitation(tx, l.orgId, l.learner, l.admin));
    const rows = await run(l, (tx) => listAccounts(tx, l.admin));
    expect(rows.find((r) => r.membershipId === l.teacher)!.access).toBe("ACTIVE");
    expect(rows.find((r) => r.membershipId === l.learner)!.access).toBe("INVITED");
    expect(rows.find((r) => r.membershipId === l.admin)!.access).toBe("NONE");
    expect(JSON.stringify(rows)).not.toContain("scrypt");
    expect((await run(l, (tx) => accessStates(tx))).size).toBe(2);
  });
});

describe("Schultrennung der Anmeldedaten (Datenbank)", () => {
  it("Schule A sieht weder Passwörter, Einladungen noch Versuche von Schule B", async () => {
    await setUp(b, "admin", "Passwort-schule-b-1");
    await authenticate(db, b.slug, "leitung@beta.test", "falsch");
    expect(await run(a, (tx) => tx.select().from(s.credentials).where(eq(s.credentials.membershipId, b.admin)))).toEqual([]);
    expect(await run(a, (tx) => tx.select().from(s.invitations).where(eq(s.invitations.membershipId, b.admin)))).toEqual([]);
    expect(await run(a, (tx) => tx.select().from(s.loginAttempts).where(eq(s.loginAttempts.emailKey, "leitung@beta.test")))).toEqual([]);
  });
  it("Schule A kann keine Anmeldedaten für Schule B schreiben", async () => {
    await expect(run(a, (tx) => tx.insert(s.credentials).values({ organizationId: b.orgId, membershipId: b.teacher, passwordHash: "x" }))).rejects.toThrow();
    await expect(run(a, (tx) => tx.insert(s.loginAttempts).values({ organizationId: b.orgId, emailKey: "x", succeeded: false }))).rejects.toThrow();
    await expect(run(a, (tx) => tx.update(s.credentials).set({ passwordHash: "x" }).where(and(eq(s.credentials.membershipId, b.admin))).returning())).resolves.toEqual([]);
  });
});
