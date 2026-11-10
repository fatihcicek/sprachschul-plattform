// Optionale BAMF-Funktionen je Schule: Schalter, Rechte, Durchsetzung beim Kurs-Anlegen, Planhinweise.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, withRegistrationAccess, type Db, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { createPerson } from "@/server/people";
import { NotAllowedError } from "@/server/actor";
import { CourseInputError, createCourse, type CreateCourseInput } from "@/server/courses";
import { loadBamfEnabled, setBamfEnabled } from "@/server/features";
import { checkPlan, type WeeklyPlan } from "@/domain/course-plan";
import { evidenceAvailable } from "@/domain/permissions";
import { enforceAccess, isReadOnlyViolation } from "@/server/access";
import { sql } from "drizzle-orm";

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
type School = { orgId: string; admin: string; staff: string; teacher: string; learners: string[] };
let a: School;
let b: School;

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: slug, slug });
    const p = async (role: (typeof s.role.enumValues)[number], first: string) =>
      (await createPerson(tx, orgId, { email: `${first}@${slug}.test`, firstName: first, lastName: slug, role })).membershipId;
    return { orgId, admin: await p("ADMIN", "leitung"), staff: await p("STAFF", "verwaltung"), teacher: await p("TEACHER", "lehrkraft"), learners: [await p("LEARNER", "eins"), await p("LEARNER", "zwei")] };
  });
}

const input = (sch: School, over: Partial<CreateCourseInput> = {}): CreateCourseInput => ({
  name: "BSK B2 Vormittag",
  category: "Berufssprachkurs B2",
  bamfCourseNumber: "2026-06552",
  plan: { startDate: "2026-11-02", endDate: "2026-11-13", weekdays: [1, 2, 3, 4, 5], startTime: "08:30", endTime: "11:45", ue: 4, mode: "VIRTUAL" },
  excludedDays: ["2026-11-11"],
  teacherIds: [sch.teacher],
  learners: [{ membershipId: sch.learners[0]!, bamfFunded: true }],
  newLearners: [{ firstName: "Neu", lastName: "Person", email: "Neu.Person@Example.test", bamfFunded: false }],
  ...over,
});

const run = <T>(sch: School, fn: (tx: Tx) => Promise<T>) => withOrganization(db, sch.orgId, fn);

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


describe("BAMF-Funktionen ein- und ausschalten", () => {
  it("Bestandsschulen haben die BAMF-Funktionen an", async () => {
    expect(await run(a, (tx) => loadBamfEnabled(tx))).toBe(true);
  });

  it("nur die Leitung darf umschalten, und es wird protokolliert", async () => {
    for (const who of [a.staff, a.teacher, a.learners[0]!]) {
      await expect(run(a, (tx) => setBamfEnabled(tx, who, false))).rejects.toBeInstanceOf(NotAllowedError);
    }
    expect(await run(a, (tx) => loadBamfEnabled(tx))).toBe(true);
    await run(a, (tx) => setBamfEnabled(tx, a.admin, false));
    expect(await run(a, (tx) => loadBamfEnabled(tx))).toBe(false);
    const audit = await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "organization.bamf_changed")));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toEqual({ von: true, nach: false });
    await run(a, (tx) => setBamfEnabled(tx, a.admin, false)); // keine Änderung, kein zweiter Eintrag
    expect(await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "organization.bamf_changed")))).toHaveLength(1);
  });

  it("der Schalter einer Schule betrifft die andere nicht", async () => {
    expect(await run(a, (tx) => loadBamfEnabled(tx))).toBe(false);
    expect(await run(b, (tx) => loadBamfEnabled(tx))).toBe(true);
  });

  it("ohne BAMF-Funktionen nimmt der Server keine Kursnummer und keine Förderung an", async () => {
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a)))).rejects.toThrow(/BAMF/);
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { bamfCourseNumber: undefined, learners: [{ membershipId: a.learners[0]!, bamfFunded: true }], newLearners: [] })))).rejects.toThrow(/BAMF/);
    expect(await run(a, (tx) => tx.select().from(s.courses))).toHaveLength(0);
  });

  it("ohne BAMF-Angaben lässt sich ein Kurs ganz normal anlegen", async () => {
    const r = await run(a, (tx) =>
      createCourse(tx, a.staff, input(a, { name: "Englisch A2", category: "Englisch", bamfCourseNumber: undefined, learners: [{ membershipId: a.learners[0]!, bamfFunded: false }], newLearners: [] })),
    );
    expect(r.sessions).toBeGreaterThan(0);
    const [c] = await run(a, (tx) => tx.select().from(s.courses).where(eq(s.courses.id, r.courseId)));
    expect(c).toMatchObject({ bamfCourseNumber: null, bamfFunded: false });
  });

  it("mit BAMF-Funktionen geht es wie bisher, nach dem Wiedereinschalten auch", async () => {
    await run(a, (tx) => setBamfEnabled(tx, a.admin, true));
    const r = await run(a, (tx) => createCourse(tx, a.staff, input(a, { name: "BSK wieder" })));
    expect(r.sessions).toBe(9);
  });
});

describe("Hinweis zu Online-UE nur mit BAMF", () => {
  const plan = { startDate: "2026-11-02", endDate: "2026-11-13", weekdays: [1, 2, 3, 4, 5] as WeeklyPlan["weekdays"], startTime: "08:30", endTime: "13:30", ue: 6, mode: "VIRTUAL" as const };
  it("zeigt den Hinweis mit BAMF und lässt ihn ohne BAMF weg", () => {
    expect(checkPlan(plan, { bamf: true }).warnings.join(" ")).toMatch(/UE pro Tag/);
    expect(checkPlan(plan).warnings.join(" ")).toMatch(/UE pro Tag/);
    expect(checkPlan(plan, { bamf: false }).warnings.join(" ")).not.toMatch(/UE pro Tag/);
    expect(checkPlan(plan, { bamf: false }).errors).toEqual([]);
  });
});

describe("Nachweis (Einwahlprotokoll) und BAMF-Schalter", () => {
  it("mit BAMF der Schule immer, ohne nur für Kurse mit BAMF-Bezug", () => {
    expect(evidenceAvailable(true, { bamfCourseNumber: null, bamfFunded: false })).toBe(true);
    expect(evidenceAvailable(false, { bamfCourseNumber: null, bamfFunded: false })).toBe(false);
    expect(evidenceAvailable(false, { bamfCourseNumber: "2026-06552", bamfFunded: false })).toBe(true);
    expect(evidenceAvailable(false, { bamfCourseNumber: null, bamfFunded: true })).toBe(true);
    expect(evidenceAvailable(false, { bamfCourseNumber: "", bamfFunded: false })).toBe(false);
  });
});

describe("Schalter: Mandantentrennung, Nur-lesen, Trigger", () => {
  it("ein Update ohne WHERE aus Schule B ändert Schule A nicht", async () => {
    await run(a, (tx) => setBamfEnabled(tx, a.admin, true));
    await run(b, (tx) => tx.execute(sql`update organizations set bamf_enabled = false`));
    expect(await run(b, (tx) => loadBamfEnabled(tx))).toBe(false);
    expect(await run(a, (tx) => loadBamfEnabled(tx))).toBe(true);
    await run(b, (tx) => setBamfEnabled(tx, b.admin, true));
  });

  it("bei abgelaufener Testzeit lehnt die Datenbank das Umschalten ab", async () => {
    const id = randomUUID();
    const admin = await withOrganization(db, id, async (tx) => {
      await tx.insert(s.organizations).values({ id, name: "Abgelaufen", slug: `abgelaufen-${id.slice(0, 6)}`, status: "TRIAL", trialEndsAt: new Date("2026-10-01T00:00:00Z") });
      return (await createPerson(tx, id, { email: `l@${id.slice(0, 6)}.test`, firstName: "L", lastName: "L", role: "ADMIN" })).membershipId;
    });
    const err = await withOrganization(db, id, async (tx) => {
      await enforceAccess(tx, new Date("2026-11-01T00:00:00Z"));
      await setBamfEnabled(tx, admin, false);
    }).catch((e) => e);
    expect(isReadOnlyViolation(err)).toBe(true);
    expect(await withOrganization(db, id, (tx) => loadBamfEnabled(tx))).toBe(true);
  });

  it("die Wahl einer offenen Registrierung lässt sich nicht nachträglich ändern", async () => {
    const hash = `h-${randomUUID()}`;
    const err = await withRegistrationAccess(db, { tokenHash: hash }, async (tx) => {
      await tx.insert(s.registrations).values({ tokenHash: hash, schoolName: "X Schule", firstName: "A", lastName: "B", email: "x@y.test", termsVersion: "t", termsAcceptedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), bamfEnabled: false });
      await tx.update(s.registrations).set({ bamfEnabled: true });
    }).catch((e) => e);
    expect(String((err as { cause?: { message?: string } }).cause?.message)).toContain("unveränderlich");
  });
});
