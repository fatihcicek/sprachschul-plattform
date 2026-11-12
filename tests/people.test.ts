// Personen anlegen gegen eine echte Datenbank: Rechte je Rolle, Eingabeprüfung, alles oder nichts, Schultrennung.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { canAddPerson } from "@/domain/permissions";
import { NotAllowedError } from "@/server/actor";
import { addPeople, createPerson, PeopleInputError } from "@/server/people";

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
type School = { orgId: string; admin: string; staff: string; teacher: string; learner: string };
let a: School;
let b: School;

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: slug, slug });
    const p = async (role: (typeof s.role.enumValues)[number], first: string) =>
      (await createPerson(tx, orgId, { email: `${first}@${slug}.test`, firstName: first, lastName: slug, role })).membershipId;
    return { orgId, admin: await p("ADMIN", "leitung"), staff: await p("STAFF", "verwaltung"), teacher: await p("TEACHER", "lehrkraft"), learner: await p("LEARNER", "eins") };
  });
}

const run = <T>(sch: School, fn: (tx: Tx) => Promise<T>) => withOrganization(db, sch.orgId, fn);
const person = (email: string, role = "LEARNER", firstName = "Neu", lastName = "Person") => ({ firstName, lastName, email, role });
const emails = (sch: School) => run(sch, async (tx) => (await tx.select({ email: s.users.email }).from(s.users)).map((u) => u.email).sort());

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
  for (let i = 0; i < 50; i++) {
    const { rows } = await admin.query("select count(*)::int as n from pg_stat_activity where datname = $1", [name]);
    if (rows[0].n === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe("Rechte (Fachregel)", () => {
  it("Leitung legt Teilnehmende, Lehrkräfte und Verwaltung an, aber keine weitere Leitung; Verwaltung nur Teilnehmende", () => {
    expect((["LEARNER", "TEACHER", "STAFF", "ADMIN"] as const).map((r) => canAddPerson("ADMIN", r))).toEqual([true, true, true, false]);
    expect((["LEARNER", "TEACHER", "STAFF", "ADMIN"] as const).map((r) => canAddPerson("STAFF", r))).toEqual([true, false, false, false]);
    for (const actor of ["TEACHER", "LEARNER"] as const) expect((["LEARNER", "TEACHER", "STAFF", "ADMIN"] as const).some((r) => canAddPerson(actor, r))).toBe(false);
  });
});

describe("Personen anlegen", () => {
  it("Leitung legt mehrere Personen mit Rollen an, E-Mail wird vereinheitlicht, Vorgang wird protokolliert", async () => {
    const r = await run(a, (tx) => addPeople(tx, a.admin, [person("  Neue.Lehrkraft@Alpha.test ", "TEACHER", " Nora ", " Neu "), person("tn1@alpha.test"), person("buero@alpha.test", "STAFF")]));
    expect(r.created).toBe(3);
    const rows = await run(a, (tx) => tx.select({ email: s.users.email, first: s.users.firstName, role: s.memberships.role }).from(s.users).innerJoin(s.memberships, eq(s.memberships.userId, s.users.id)));
    expect(rows.find((x) => x.email === "neue.lehrkraft@alpha.test")).toMatchObject({ first: "Nora", role: "TEACHER" });
    expect(rows.find((x) => x.email === "buero@alpha.test")!.role).toBe("STAFF");
    const audit = await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "person.created")));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.meta).toMatchObject({ anzahl: 3, teilnehmende: 1, lehrkraefte: 1, verwaltung: 1 });
    // Kein Zugang entsteht automatisch.
    expect(await run(a, (tx) => tx.select().from(s.credentials))).toEqual([]);
  });

  it("Verwaltung darf Teilnehmende anlegen, aber keine Lehrkraft; Lehrkraft und Teilnehmende dürfen gar nicht", async () => {
    await expect(run(a, (tx) => addPeople(tx, a.staff, [person("tn2@alpha.test")]))).resolves.toEqual({ created: 1 });
    await expect(run(a, (tx) => addPeople(tx, a.staff, [person("tn3@alpha.test"), person("lk2@alpha.test", "TEACHER")]))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => addPeople(tx, a.teacher, [person("tn4@alpha.test")]))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => addPeople(tx, a.learner, [person("tn5@alpha.test")]))).rejects.toBeInstanceOf(NotAllowedError);
    const all = await emails(a);
    for (const e of ["tn3@alpha.test", "lk2@alpha.test", "tn4@alpha.test", "tn5@alpha.test"]) expect(all).not.toContain(e);
  });

  it("eine weitere Leitung oder unbekannte Rolle wird abgelehnt, auch für die Leitung", async () => {
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("chef2@alpha.test", "ADMIN")]))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("x@alpha.test", "ROOT")]))).rejects.toBeInstanceOf(PeopleInputError);
  });

  it("alles oder nichts: bei einem Fehler entsteht niemand", async () => {
    const before = await emails(a);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("gut@alpha.test"), person("kaputt")]))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("doppelt@alpha.test"), person("DOPPELT@alpha.test")]))).rejects.toThrow(/doppelt/);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("neu9@alpha.test"), person("eins@alpha.test")]))).rejects.toThrow(/gibt es an der Schule schon/);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("ohne-name@alpha.test", "LEARNER", " ", "X")]))).rejects.toBeInstanceOf(PeopleInputError);
    expect(await emails(a)).toEqual(before);
  });

  it("lehnt leere Listen, zu große Listen, Steuerzeichen und Unsinn ab", async () => {
    await expect(run(a, (tx) => addPeople(tx, a.admin, []))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, Array.from({ length: 201 }, (_, i) => person(`m${i}@alpha.test`))))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [person("bidi@alpha.test", "LEARNER", "Ev‮il", "X")]))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, "kein-array"))).rejects.toBeInstanceOf(PeopleInputError);
    await expect(run(a, (tx) => addPeople(tx, a.admin, [{ email: "nur@alpha.test" }]))).rejects.toBeInstanceOf(PeopleInputError);
  });

  it("Schultrennung: dieselbe E-Mail geht an Schule B, und B sieht die Personen von A nicht", async () => {
    await expect(run(b, (tx) => addPeople(tx, b.admin, [person("tn1@alpha.test")]))).resolves.toEqual({ created: 1 });
    const inB = await emails(b);
    expect(inB).toContain("tn1@alpha.test");
    expect(inB).not.toContain("buero@alpha.test");
    // Die Leitung von A kann in Schule B nichts anlegen: Ihre Mitgliedschaft gibt es dort nicht.
    await expect(run(b, (tx) => addPeople(tx, a.admin, [person("fremd@beta.test")]))).rejects.toThrow();
    expect(await emails(b)).not.toContain("fremd@beta.test");
  });

  it("eine deaktivierte Leitung darf nichts anlegen", async () => {
    const c = await school("gamma");
    await run(c, (tx) => tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, c.admin)));
    await expect(run(c, (tx) => addPeople(tx, c.admin, [person("z@gamma.test")]))).rejects.toBeInstanceOf(NotAllowedError);
  });
});
