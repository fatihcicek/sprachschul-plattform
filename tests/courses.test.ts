// Kurs in einem Ablauf anlegen, gegen eine echte Datenbank: Rechte,
// Schultrennung, alles-oder-nichts und das Ergebnis.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { createPerson } from "@/server/people";
import { NotAllowedError } from "@/server/actor";
import { CourseInputError, createCourse, listCourses, listPeople, type CreateCourseInput } from "@/server/courses";

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

describe("Kurs in einem Ablauf anlegen", () => {
  it("lässt nur Verwaltung und Leitung Kurse anlegen", async () => {
    await expect(run(a, (tx) => createCourse(tx, a.teacher, input(a)))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => createCourse(tx, a.learners[0]!, input(a)))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => listPeople(tx, a.teacher))).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("legt Kurs, Termine, Lehrkraft, Teilnehmende und neue Personen zusammen an", async () => {
    const r = await run(a, (tx) => createCourse(tx, a.staff, input(a)));
    expect(r).toMatchObject({ sessions: 9, teachers: 1, learners: 2 });
    const [course] = await run(a, (tx) => tx.select().from(s.courses).where(eq(s.courses.id, r.courseId)));
    expect(course).toMatchObject({ bamfCourseNumber: "2026-06552", mode: "VIRTUAL", status: "ACTIVE", bamfFunded: true });
    const sessions = await run(a, (tx) => tx.select().from(s.lessonSessions).where(eq(s.lessonSessions.courseId, r.courseId)));
    expect(sessions.map((x) => x.startsAt.toISOString())).not.toContain("2026-11-11T07:30:00.000Z");
    expect(sessions[0]!.plannedUe).toBe(4);
    const people = await run(a, (tx) => listPeople(tx, a.admin));
    expect(people.learners.map((l) => l.email)).toContain("neu.person@example.test");
    const overview = await run(a, (tx) => listCourses(tx, a.admin));
    expect(overview[0]).toMatchObject({ sessions: 9, learners: 2, teachers: ["lehrkraft alpha"] });
    const audit = await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, r.courseId)));
    expect(audit[0]!.action).toBe("course.created");
  });

  it("nimmt keine Personen einer anderen Schule an", async () => {
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { teacherIds: [b.teacher] })))).rejects.toBeInstanceOf(CourseInputError);
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { learners: [{ membershipId: b.learners[0]!, bamfFunded: false }], newLearners: [] })))).rejects.toBeInstanceOf(CourseInputError);
    expect(await run(b, (tx) => listCourses(tx, b.admin))).toEqual([]);
  });

  it("verlangt die richtige Rolle: keine Teilnehmenden als Lehrkraft", async () => {
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { teacherIds: [a.learners[1]!], newLearners: [] })))).rejects.toThrow(/Lehrkraft/);
  });

  it("schreibt bei einem Fehler gar nichts (alles oder nichts)", async () => {
    const before = await run(a, (tx) => tx.select().from(s.courses));
    await expect(
      run(a, (tx) => createCourse(tx, a.staff, input(a, { name: "Doppelte E-Mail", newLearners: [{ firstName: "X", lastName: "Y", email: "eins@alpha.test", bamfFunded: false }] }))),
    ).rejects.toThrow(/gibt es an der Schule schon/);
    expect(await run(a, (tx) => tx.select().from(s.courses))).toHaveLength(before.length);
  });

  it("prüft Pflichtangaben vor dem Schreiben", async () => {
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { teacherIds: [] })))).rejects.toThrow(/mindestens eine Lehrkraft/);
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { name: " " })))).rejects.toThrow(/Kursnamen/);
    await expect(
      run(a, (tx) => createCourse(tx, a.staff, input(a, { newLearners: [{ firstName: "A", lastName: "B", email: "kaputt", bamfFunded: false }] }))),
    ).rejects.toThrow(/Ungültige E-Mail/);
  });

  it("weist manipulierte Anfragen mit klarer Meldung ab, statt abzustürzen oder hängenzubleiben", async () => {
    const bad = [
      input(a, { plan: { ...input(a).plan, endDate: "9999-12-31", weekdays: [8 as never] } }),
      input(a, { plan: { ...input(a).plan, weekdays: ["1" as never] } }),
      input(a, { plan: { ...input(a).plan, startDate: "2026-13-01" } }),
      input(a, { plan: { ...input(a).plan, startDate: "2026-02-30" } }),
      input(a, { plan: { ...input(a).plan, mode: "FOO" as never } }),
      input(a, { plan: { ...input(a).plan, endDate: "2035-01-01" } }),
      input(a, { newLearners: [{ firstName: "A", lastName: "B", email: 5 as never, bamfFunded: false }] }),
      input(a, { name: "x".repeat(500) }),
      input(a, { newLearners: Array.from({ length: 201 }, (_, i) => ({ firstName: "A", lastName: "B", email: `p${i}@alpha.test`, bamfFunded: false })) }),
      { ...input(a), extra: true },
      null,
    ];
    for (const raw of bad) await expect(run(a, (tx) => createCourse(tx, a.staff, raw))).rejects.toBeInstanceOf(CourseInputError);
  }, 10_000);

  it("meldet doppelt ausgewählte Personen verständlich", async () => {
    const twice = [{ membershipId: a.learners[0]!, bamfFunded: false }, { membershipId: a.learners[0]!, bamfFunded: true }];
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { learners: twice, newLearners: [] })))).rejects.toThrow(/doppelt/);
  });

  it("nimmt alles zurück, wenn nach dem Schreiben noch etwas schiefgeht", async () => {
    const count = async () => (await run(a, (tx) => tx.select().from(s.courses))).length;
    const before = await count();
    await expect(
      run(a, async (tx) => {
        await createCourse(tx, a.staff, input(a, { name: "Wird zurückgenommen", newLearners: [{ firstName: "Z", lastName: "Z", email: "z@alpha.test", bamfFunded: false }] }));
        throw new Error("Absturz nach dem Schreiben");
      }),
    ).rejects.toThrow("Absturz");
    expect(await count()).toBe(before);
    expect(await run(a, (tx) => tx.select().from(s.users).where(eq(s.users.email, "z@alpha.test")))).toEqual([]);
  });

  it("verweigert deaktivierten Konten das Anlegen und nimmt keine deaktivierten Personen auf", async () => {
    await run(a, (tx) => tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, a.learners[1]!)));
    await expect(run(a, (tx) => createCourse(tx, a.staff, input(a, { learners: [{ membershipId: a.learners[1]!, bamfFunded: false }], newLearners: [] })))).rejects.toThrow(/Teilnehmende/);
    await run(a, (tx) => tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, a.admin)));
    await expect(run(a, (tx) => createCourse(tx, a.admin, input(a)))).rejects.toBeInstanceOf(NotAllowedError);
  });
});
