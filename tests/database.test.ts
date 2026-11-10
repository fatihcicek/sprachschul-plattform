// Prüft gegen eine echte PostgreSQL-Datenbank, die pro Lauf neu angelegt und
// danach gelöscht wird: Mandantentrennung, unveränderliche Protokolle und den
// Anwesenheitsablauf von der Einwahl bis zur Korrektur.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { createPerson } from "@/server/people";
import { changeAttendanceStatus, confirmAttendance, NotAllowedError, proposeAttendance } from "@/server/attendance";

if (existsSync(".env")) process.loadEnvFile(".env");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL fehlt");

const testDbName = `kurswerk_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${testDbName}`;

let db: Db;
let pool: Pool;

type School = { orgId: string; teacher: string; otherTeacher: string; staff: string; learners: string[]; course: string; session: string };
let a: School;
let b: School;

const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+01:00`);

async function createSchool(name: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name, slug: name.toLowerCase() });
    const member = async (role: (typeof s.role.enumValues)[number], first: string) => {
      return (await createPerson(tx, orgId, { email: `${first}@${name}.test`.toLowerCase(), firstName: first, lastName: name, role })).membershipId;
    };
    const teacher = await member("TEACHER", "Lehrkraft");
    const otherTeacher = await member("TEACHER", "Vertretung");
    const staff = await member("STAFF", "Verwaltung");
    const learners = [await member("LEARNER", "Eins"), await member("LEARNER", "Zwei"), await member("LEARNER", "Drei")];
    const [course] = await tx
      .insert(s.courses)
      .values({ organizationId: orgId, name: `Kurs ${name}`, category: "BSK B2", status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26" })
      .returning();
    await tx.insert(s.teachingAssignments).values({ organizationId: orgId, courseId: course!.id, membershipId: teacher });
    await tx.insert(s.enrollments).values(learners.map((l) => ({ organizationId: orgId, courseId: course!.id, membershipId: l, startsOn: "2026-09-01" })));
    const [session] = await tx
      .insert(s.lessonSessions)
      .values({ organizationId: orgId, courseId: course!.id, startsAt: at("18:00"), endsAt: at("21:15"), plannedUe: 4, mode: "VIRTUAL", status: "ENDED" })
      .returning();
    return { orgId, teacher, otherTeacher, staff, learners, course: course!.id, session: session!.id };
  });
}

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${testDbName}`);
  await admin.end();
  ({ db, pool } = createDb(testUrl.toString()));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  a = await createSchool("Alpha");
  b = await createSchool("Beta");
}, 60_000);

afterAll(async () => {
  await pool.end();
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE)`);
  await admin.end();
});

describe("Mandantentrennung in der Datenbank", () => {
  it("läuft ohne Superuser-Rechte, weil diese die Zeilensicherheit umgehen", async () => {
    const r = await db.execute(sql`select current_setting('is_superuser') as su`);
    expect((r as unknown as { rows: unknown[] }).rows[0]).toEqual({ su: "off" });
  });

  it("zeigt ohne gesetzte Schule keine Schuldaten", async () => {
    expect(await db.select().from(s.courses)).toEqual([]);
    expect(await db.select().from(s.memberships)).toEqual([]);
    expect(await db.select().from(s.organizations)).toEqual([]);
  });

  it("zeigt jeder Schule nur die eigenen Personen", async () => {
    const own = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.users));
    expect(own.length).toBe(6);
    expect(own.every((u) => u.email.endsWith("@alpha.test"))).toBe(true);
    expect(await db.select().from(s.users)).toEqual([]);
  });

  it("lässt keine Schule Personen der anderen lesen, ändern oder übernehmen", async () => {
    const [foreign] = await withOrganization(db, b.orgId, (tx) => tx.select().from(s.users));
    const seen = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.users).where(eq(s.users.id, foreign!.id)));
    expect(seen).toEqual([]);
    const changed = await withOrganization(db, a.orgId, (tx) => tx.update(s.users).set({ email: "x@evil.test" }).where(eq(s.users.id, foreign!.id)).returning());
    expect(changed).toEqual([]);
    await expect(
      withOrganization(db, a.orgId, (tx) => tx.insert(s.memberships).values({ organizationId: a.orgId, userId: foreign!.id, role: "LEARNER" })),
    ).rejects.toThrow();
    await expect(
      withOrganization(db, a.orgId, (tx) => tx.insert(s.users).values({ organizationId: b.orgId, email: "y@beta.test", firstName: "Y", lastName: "Z" })),
    ).rejects.toThrow();
  });

  it("erlaubt dieselbe E-Mail an zwei Schulen als zwei getrennte Personen", async () => {
    const email = "eins@alpha.test";
    await withOrganization(db, b.orgId, (tx) => createPerson(tx, b.orgId, { email, firstName: "Eins", lastName: "Beta", role: "LEARNER" }));
    const inA = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.users).where(eq(s.users.email, email)));
    expect(inA).toHaveLength(1);
    expect(inA[0]!.lastName).toBe("Alpha");
  });

  it("zeigt jeder Schule nur die eigenen Daten", async () => {
    const seenByA = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.courses));
    expect(seenByA.map((c) => c.id)).toEqual([a.course]);
    const bCourseSeenByA = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.courses).where(eq(s.courses.id, b.course)));
    expect(bCourseSeenByA).toEqual([]);
  });

  it("lässt eine Schule fremde Daten weder ändern noch löschen", async () => {
    const changed = await withOrganization(db, a.orgId, (tx) =>
      tx.update(s.courses).set({ name: "gekapert" }).where(eq(s.courses.id, b.course)).returning(),
    );
    expect(changed).toEqual([]);
    const [still] = await withOrganization(db, b.orgId, (tx) => tx.select().from(s.courses).where(eq(s.courses.id, b.course)));
    expect(still?.name).toBe("Kurs Beta");
  });

  it("verweigert das Schreiben unter fremder Schule", async () => {
    await expect(
      withOrganization(db, a.orgId, (tx) =>
        tx.insert(s.courses).values({ organizationId: b.orgId, name: "x", category: "x", startDate: "2026-01-01", endDate: "2026-02-01" }),
      ),
    ).rejects.toThrow();
  });

  it("verweigert Verknüpfungen über Schulgrenzen", async () => {
    // Teilnehmer der Schule Alpha in einen Kurs der Schule Beta einschreiben.
    await expect(
      withOrganization(db, a.orgId, (tx) =>
        tx.insert(s.enrollments).values({ organizationId: a.orgId, courseId: b.course, membershipId: a.learners[0]!, startsOn: "2026-09-01" }),
      ),
    ).rejects.toThrow();
  });
});

describe("Regeln für Termine", () => {
  it("lehnt Termine ab, in die die UE nicht passen", async () => {
    await expect(
      withOrganization(db, a.orgId, (tx) =>
        tx.insert(s.lessonSessions).values({ organizationId: a.orgId, courseId: a.course, startsAt: at("18:00"), endsAt: at("19:00"), plannedUe: 4, mode: "VIRTUAL" }),
      ),
    ).rejects.toThrow();
  });
});

describe("Einwahlprotokoll", () => {
  it("nimmt Ereignisse an und verwirft doppelte Zustellung", async () => {
    const [one, two, three] = a.learners as [string, string, string];
    const ev = (membershipId: string, type: "JOIN" | "LEAVE", hhmm: string) => ({
      organizationId: a.orgId,
      sessionId: a.session,
      membershipId,
      type,
      occurredAt: at(hhmm),
      source: "test",
      dedupKey: `${a.session}:${membershipId}:${type}:${hhmm}`,
    });
    const events = [
      ev(one, "JOIN", "17:58"), ev(one, "LEAVE", "21:15"),
      ev(two, "JOIN", "18:01"), ev(two, "LEAVE", "19:10"), ev(two, "JOIN", "19:14"), ev(two, "LEAVE", "19:32"),
    ];
    void three; // Person drei wählt sich nie ein.
    await withOrganization(db, a.orgId, (tx) => tx.insert(s.connectionEvents).values(events));
    await withOrganization(db, a.orgId, (tx) => tx.insert(s.connectionEvents).values(events).onConflictDoNothing());
    const stored = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.connectionEvents));
    expect(stored).toHaveLength(6);
  });

  it("lässt sich weder ändern noch löschen noch leeren", async () => {
    await expect(withOrganization(db, a.orgId, (tx) => tx.update(s.connectionEvents).set({ occurredAt: at("18:00") }))).rejects.toThrow();
    await expect(withOrganization(db, a.orgId, (tx) => tx.delete(s.connectionEvents))).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE connection_events CASCADE`)).rejects.toThrow();
  });
});

describe("Anwesenheit vom Vorschlag bis zur Korrektur", () => {
  const records = () => withOrganization(db, a.orgId, (tx) => tx.select().from(s.attendanceRecords));
  const of = async (membershipId: string) => (await records()).find((r) => r.membershipId === membershipId)!;

  it("schlägt aus dem Protokoll vor, ohne zu bestätigen", async () => {
    const result = await withOrganization(db, a.orgId, (tx) => proposeAttendance(tx, a.session));
    expect(result).toEqual({ proposed: 3, keptConfirmed: 0 });
    const [one, two, three] = a.learners as [string, string, string];
    expect(await of(one)).toMatchObject({ status: "PRESENT", presentMinutes: 195, reviewState: "PROPOSED" });
    expect(await of(two)).toMatchObject({ status: "PARTIAL", presentMinutes: 69 + 18, reviewState: "PROPOSED" });
    expect(await of(three)).toMatchObject({ status: "ABSENT", presentMinutes: 0, reviewState: "PROPOSED" });
  });

  it("lässt nur die Lehrkraft des Kurses bestätigen", async () => {
    const ids = (await records()).map((r) => r.id);
    await expect(withOrganization(db, a.orgId, (tx) => confirmAttendance(tx, a.otherTeacher, ids))).rejects.toThrow(NotAllowedError);
    await expect(withOrganization(db, a.orgId, (tx) => confirmAttendance(tx, a.learners[0]!, ids))).rejects.toThrow(NotAllowedError);
    await expect(withOrganization(db, a.orgId, (tx) => confirmAttendance(tx, a.staff, ids))).rejects.toThrow(NotAllowedError);
    expect(await withOrganization(db, a.orgId, (tx) => confirmAttendance(tx, a.teacher, ids))).toBe(3);
    expect((await records()).every((r) => r.reviewState === "CONFIRMED" && r.confirmedByMembershipId === a.teacher)).toBe(true);
  });

  it("überschreibt Bestätigtes bei erneuter Berechnung nicht", async () => {
    const result = await withOrganization(db, a.orgId, (tx) => proposeAttendance(tx, a.session));
    expect(result).toEqual({ proposed: 0, keptConfirmed: 3 });
  });

  it("verlangt für Korrekturen eine Begründung und hält sie fest", async () => {
    const absent = await of(a.learners[2]!);
    await expect(withOrganization(db, a.orgId, (tx) => changeAttendanceStatus(tx, a.staff, absent.id, "EXCUSED"))).rejects.toThrow(/Begründung/);
    expect((await of(a.learners[2]!)).status).toBe("ABSENT");

    const kind = await withOrganization(db, a.orgId, (tx) => changeAttendanceStatus(tx, a.staff, absent.id, "EXCUSED", "Attest liegt vor"));
    expect(kind).toBe("correction");
    expect((await of(a.learners[2]!)).status).toBe("EXCUSED");

    const corrections = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.attendanceCorrections));
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ fromStatus: "ABSENT", toStatus: "EXCUSED", reason: "Attest liegt vor", actorMembershipId: a.staff });
    await expect(withOrganization(db, a.orgId, (tx) => tx.delete(s.attendanceCorrections))).rejects.toThrow();
  });

  it("führt ein Vorgangsprotokoll, das die andere Schule nicht sieht", async () => {
    const own = await withOrganization(db, a.orgId, (tx) => tx.select().from(s.auditEvents));
    expect(own.map((e) => e.action).sort()).toEqual(["attendance.confirmed", "attendance.confirmed", "attendance.confirmed", "attendance.corrected"]);
    expect(await withOrganization(db, b.orgId, (tx) => tx.select().from(s.auditEvents))).toEqual([]);
  });

  it("verhindert, dass eine Schule Anwesenheit einer anderen bestätigt", async () => {
    await withOrganization(db, b.orgId, (tx) => proposeAttendance(tx, b.session));
    const bIds = (await withOrganization(db, b.orgId, (tx) => tx.select().from(s.attendanceRecords))).map((r) => r.id);
    await expect(withOrganization(db, a.orgId, (tx) => confirmAttendance(tx, a.teacher, bIds))).rejects.toThrow();
  });
});
