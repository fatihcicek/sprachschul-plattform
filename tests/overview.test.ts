// Startseite „Heute“ gegen eine echte Datenbank: Inhalt, Rechte, Schultrennung.

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
import { loadOnboarding, loadToday } from "@/server/overview";
import { createInvitation } from "@/server/auth";
import { onboardingFrom } from "@/domain/onboarding";
import { courseListMeta } from "@/domain/course-display";
import { attendanceIsOpen, phaseOf } from "@/domain/today";

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
type School = { orgId: string; admin: string; staff: string; teacher: string; learner: string; courseName: string; sessions: Record<string, string> };
let a: School;
let b: School;

// 10.11.2026, 12:00 Uhr in Berlin (MEZ = UTC+1)
const NOW = new Date("2026-11-10T11:00:00Z");
const at = (iso: string) => new Date(iso);

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: slug, slug });
    const p = async (role: (typeof s.role.enumValues)[number], first: string) =>
      (await createPerson(tx, orgId, { email: `${first}@${slug}.test`, firstName: first, lastName: slug, role })).membershipId;
    const admin = await p("ADMIN", "leitung");
    const staff = await p("STAFF", "verwaltung");
    const teacher = await p("TEACHER", "lehrkraft");
    const learner = await p("LEARNER", "eins");
    const courseName = `Kurs ${slug}`;
    const [course] = await tx
      .insert(s.courses)
      .values({ organizationId: orgId, name: courseName, category: "BSK B2", status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26" })
      .returning();
    await tx.insert(s.teachingAssignments).values({ organizationId: orgId, courseId: course!.id, membershipId: teacher });
    await tx.insert(s.enrollments).values({ organizationId: orgId, courseId: course!.id, membershipId: learner, startsOn: "2026-09-01" });
    const mk = async (key: string, start: string, end: string) => {
      const [row] = await tx
        .insert(s.lessonSessions)
        .values({ organizationId: orgId, courseId: course!.id, startsAt: at(start), endsAt: at(end), plannedUe: 4, mode: "VIRTUAL" })
        .returning();
      return [key, row!.id] as const;
    };
    const sessions = Object.fromEntries([
      await mk("morning", "2026-11-10T07:30:00Z", "2026-11-10T10:45:00Z"), // heute 8:30–11:45, vorbei
      await mk("evening", "2026-11-10T17:00:00Z", "2026-11-10T20:15:00Z"), // heute 18:00–21:15, kommt noch
      await mk("lastWeek", "2026-11-03T17:00:00Z", "2026-11-03T20:15:00Z"), // vergangen, erledigt
      await mk("lastWeekOpen", "2026-11-04T17:00:00Z", "2026-11-04T20:15:00Z"), // vergangen, offen
      await mk("tomorrow", "2026-11-11T17:00:00Z", "2026-11-11T20:15:00Z"),
      await mk("longAgo", "2026-06-01T17:00:00Z", "2026-06-01T20:15:00Z"), // außerhalb des Rückblicks
    ]);
    // lastWeek: bestätigt und mit Klassenbuch
    await tx.insert(s.attendanceRecords).values({ organizationId: orgId, sessionId: sessions.lastWeek!, membershipId: learner, status: "PRESENT", presentMinutes: 180, reviewState: "CONFIRMED", confirmedByMembershipId: teacher, confirmedAt: NOW });
    await tx.insert(s.classRegisterEntries).values({ organizationId: orgId, sessionId: sessions.lastWeek!, content: "Konjunktiv II", authorMembershipId: teacher });
    // lastWeekOpen: nur Vorschlag
    await tx.insert(s.attendanceRecords).values({ organizationId: orgId, sessionId: sessions.lastWeekOpen!, membershipId: learner, status: "PRESENT", presentMinutes: 170 });
    return { orgId, admin, staff, teacher, learner, courseName, sessions };
  });
}

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

describe("Regeln", () => {
  const s1 = { id: "x", startsAt: at("2026-11-10T17:00:00Z"), endsAt: at("2026-11-10T20:15:00Z") };
  it("Phase eines Termins", () => {
    expect(phaseOf(s1, at("2026-11-10T16:59:00Z"))).toBe("UPCOMING");
    expect(phaseOf(s1, at("2026-11-10T17:00:00Z"))).toBe("RUNNING");
    expect(phaseOf(s1, at("2026-11-10T20:15:00Z"))).toBe("OVER");
  });
  it("Anwesenheit offen, bis jede Person bestätigt ist", () => {
    expect(attendanceIsOpen({ enrolled: 3, confirmed: 3 })).toBe(false);
    expect(attendanceIsOpen({ enrolled: 3, confirmed: 2 })).toBe(true);
    expect(attendanceIsOpen({ enrolled: 3, confirmed: 0 })).toBe(true);
    expect(attendanceIsOpen({ enrolled: 0, confirmed: 0 })).toBe(false);
  });
});

describe("Heute", () => {
  it("zeigt nur die Termine von heute, in der richtigen Phase", async () => {
    const t = await run(a, (tx) => loadToday(tx, a.admin, NOW));
    expect(t.lessons.map((l) => [l.sessionId, l.phase])).toEqual([
      [a.sessions.morning, "OVER"],
      [a.sessions.evening, "UPCOMING"],
    ]);
    expect(t.lessons[0]!.learners).toBe(1);
    expect(t.lessons[0]!.courseName).toBe("Kurs alpha");
  });

  it("meldet offene Anwesenheit und fehlendes Klassenbuch, nicht aber Erledigtes oder Altes", async () => {
    const t = await run(a, (tx) => loadToday(tx, a.admin, NOW));
    const openIds = t.openAttendance.map((o) => o.sessionId);
    expect(openIds).toContain(a.sessions.lastWeekOpen);
    expect(openIds).toContain(a.sessions.morning); // heute Vormittag vorbei, nichts bestätigt
    expect(openIds).not.toContain(a.sessions.lastWeek);
    expect(openIds).not.toContain(a.sessions.evening);
    expect(openIds).not.toContain(a.sessions.tomorrow);
    expect(openIds).not.toContain(a.sessions.longAgo);
    const regIds = t.missingRegister.map((o) => o.sessionId);
    expect(regIds).toContain(a.sessions.lastWeekOpen);
    expect(regIds).not.toContain(a.sessions.lastWeek);
    expect(regIds).not.toContain(a.sessions.longAgo);
  });

  it("Verwaltung darf, Lehrkraft und Teilnehmende nicht", async () => {
    await expect(run(a, (tx) => loadToday(tx, a.staff, NOW))).resolves.toBeDefined();
    await expect(run(a, (tx) => loadToday(tx, a.teacher, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => loadToday(tx, a.learner, NOW))).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("lässt Entwürfe, archivierte Kurse, abgeschlossene Termine und inaktive Personen außen vor", async () => {
    const c = await school("gamma");
    await run(c, async (tx) => {
      const [course] = await tx.select().from(s.courses);
      await tx.update(s.lessonSessions).set({ status: "CLOSED" }).where(eq(s.lessonSessions.id, c.sessions.lastWeekOpen!));
      const before = await loadToday(tx, c.admin, NOW);
      expect(before.openAttendance.map((o) => o.sessionId)).not.toContain(c.sessions.lastWeekOpen);
      await tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, c.learner));
      const noLearners = await loadToday(tx, c.admin, NOW);
      expect(noLearners.lessons[0]!.learners).toBe(0);
      expect(noLearners.openAttendance).toEqual([]);
      await tx.update(s.courses).set({ status: "ARCHIVED" }).where(eq(s.courses.id, course!.id));
      const archived = await loadToday(tx, c.admin, NOW);
      expect(archived.lessons).toEqual([]);
      await tx.update(s.courses).set({ status: "DRAFT" }).where(eq(s.courses.id, course!.id));
      expect((await loadToday(tx, c.admin, NOW)).missingRegister).toEqual([]);
    });
  });

  it("zeigt einen laufenden Termin als „läuft“ und zählt keine negativen offenen Anwesenheiten", async () => {
    const running = new Date("2026-11-10T18:00:00Z");
    const t = await run(a, (tx) => loadToday(tx, a.admin, running));
    expect(t.lessons.find((l) => l.sessionId === a.sessions.evening)!.phase).toBe("RUNNING");
    expect(t.openAttendance.every((o) => o.unconfirmed >= 0)).toBe(true);
  });

  it("Schule A sieht nie Termine von Schule B", async () => {
    const t = await run(a, (tx) => loadToday(tx, a.admin, NOW));
    const all = [...t.lessons.map((l) => l.sessionId), ...t.openAttendance.map((o) => o.sessionId), ...t.missingRegister.map((o) => o.sessionId)];
    for (const id of Object.values(b.sessions)) expect(all).not.toContain(id);
    expect(t.lessons.every((l) => l.courseName === "Kurs alpha")).toBe(true);
    // Mit dem Konto von B in der Sitzung von A kommt nichts durch.
    await expect(run(a, (tx) => loadToday(tx, b.admin, NOW))).rejects.toThrow("Unbekanntes Konto");
  });
});

describe("Erste Schritte", () => {
  it("leitet aus Zählwerten die Checkliste ab", () => {
    const none = onboardingFrom({ courses: 0, teachersWithAccess: 0, learnersWithAccess: 0 });
    expect(none.steps.map((x) => x.done)).toEqual([false, false, false]);
    expect(none.complete).toBe(false);
    const all = onboardingFrom({ courses: 2, teachersWithAccess: 1, learnersWithAccess: 5 });
    expect(all.doneCount).toBe(3);
    expect(all.complete).toBe(true);
  });

  it("zählt Kurs, eingeladene Lehrkraft und eingeladene Teilnehmende der eigenen Schule", async () => {
    const d = await school("delta");
    const e = await school("epsilon");
    const first = await run(d, (tx) => loadOnboarding(tx, d.admin, NOW));
    expect(first.steps.map((x) => [x.key, x.done])).toEqual([["course", true], ["teacher", false], ["learners", false]]);
    await run(d, (tx) => createInvitation(tx, d.orgId, d.teacher, d.admin, NOW));
    expect((await run(d, (tx) => loadOnboarding(tx, d.admin, NOW))).steps[1]!.done).toBe(true);
    await run(d, (tx) => createInvitation(tx, d.orgId, d.learner, d.admin, NOW));
    expect((await run(d, (tx) => loadOnboarding(tx, d.admin, NOW))).complete).toBe(true);
    // Schule E bleibt unberührt: Einladungen von D zählen dort nicht.
    expect((await run(e, (tx) => loadOnboarding(tx, e.admin, NOW))).steps.map((x) => x.done)).toEqual([true, false, false]);
  });

  it("abgelaufene Einladungen und deaktivierte Personen zählen nicht", async () => {
    const z = await school("zeta");
    await run(z, (tx) => createInvitation(tx, z.orgId, z.teacher, z.admin, new Date(NOW.getTime() - 30 * 86_400_000)));
    expect((await run(z, (tx) => loadOnboarding(tx, z.admin, NOW))).steps[1]!.done).toBe(false);
    await run(z, async (tx) => {
      await createInvitation(tx, z.orgId, z.learner, z.admin, NOW);
      await tx.update(s.memberships).set({ active: false }).where(eq(s.memberships.id, z.learner));
    });
    expect((await run(z, (tx) => loadOnboarding(tx, z.admin, NOW))).steps[2]!.done).toBe(false);
  });

  it("Verwaltung darf, Lehrkraft und Teilnehmende nicht", async () => {
    await expect(run(a, (tx) => loadOnboarding(tx, a.staff, NOW))).resolves.toBeDefined();
    await expect(run(a, (tx) => loadOnboarding(tx, a.teacher, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => loadOnboarding(tx, a.learner, NOW))).rejects.toBeInstanceOf(NotAllowedError);
  });
});

describe("Kursliste", () => {
  it("zeigt die BAMF-Kursnummer nur bei eingeschalteten BAMF-Funktionen", () => {
    const c = { category: "BSK B2", bamfCourseNumber: "2026-06552", mode: "VIRTUAL" as const };
    expect(courseListMeta(c, true)).toBe("BSK B2 · BAMF 2026-06552 · online");
    expect(courseListMeta(c, false)).toBe("BSK B2 · online");
    expect(courseListMeta({ ...c, bamfCourseNumber: null, mode: "PRESENCE" }, true)).toBe("BSK B2 · Präsenz");
  });
});
