// Kursraum gegen eine echte Datenbank: Rechte je Kurs, Fristen, Bestätigen, Klassenbuch, Abschluss, Schultrennung.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { changeAttendanceStatus } from "@/server/attendance";
import { createPerson } from "@/server/people";
import {
  closeSession, confirmAllAsActor, listMySessions, loadRoom, NotAllowedError, proposeAsActor, recordExport, REGISTER_MAX, saveRegister, TeachingRuleError,
} from "@/server/teaching";

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
type School = { orgId: string; admin: string; staff: string; teacher: string; otherTeacher: string; l1: string; l2: string; courseId: string; past: string; future: string; other: string };
let a: School;
let b: School;

const NOW = new Date("2026-11-10T20:00:00Z");
const d = (iso: string) => new Date(iso);

async function school(slug: string): Promise<School> {
  const orgId = randomUUID();
  return withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: `Schule ${slug}`, slug });
    const p = async (role: (typeof s.role.enumValues)[number], first: string) =>
      (await createPerson(tx, orgId, { email: `${first}@${slug}.test`, firstName: first, lastName: slug, role })).membershipId;
    const admin = await p("ADMIN", "leitung"), staff = await p("STAFF", "verwaltung"), teacher = await p("TEACHER", "lehrkraft"), otherTeacher = await p("TEACHER", "anders");
    const l1 = await p("LEARNER", "eins"), l2 = await p("LEARNER", "zwei");
    const mkCourse = async (n: string) => (await tx.insert(s.courses).values({ organizationId: orgId, name: n, category: "BSK B2", status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26", bamfCourseNumber: "2026-1" }).returning())[0]!;
    const c1 = await mkCourse("Kurs eins"), c2 = await mkCourse("Kurs zwei");
    await tx.insert(s.teachingAssignments).values([{ organizationId: orgId, courseId: c1.id, membershipId: teacher }, { organizationId: orgId, courseId: c2.id, membershipId: otherTeacher }]);
    await tx.insert(s.enrollments).values([l1, l2].map((membershipId) => ({ organizationId: orgId, courseId: c1.id, membershipId, startsOn: "2026-09-01" })));
    const mk = async (courseId: string, st: string, en: string) => (await tx.insert(s.lessonSessions).values({ organizationId: orgId, courseId, startsAt: d(st), endsAt: d(en), plannedUe: 2, mode: "VIRTUAL" }).returning())[0]!.id;
    const past = await mk(c1.id, "2026-11-10T17:00:00Z", "2026-11-10T19:00:00Z");
    const future = await mk(c1.id, "2026-11-12T17:00:00Z", "2026-11-12T19:00:00Z");
    const other = await mk(c2.id, "2026-11-10T17:00:00Z", "2026-11-10T19:00:00Z");
    // l1 war ganz da, l2 gar nicht
    await tx.insert(s.connectionEvents).values(
      (["JOIN", "LEAVE"] as const).map((type) => ({ organizationId: orgId, sessionId: past, membershipId: l1, type, occurredAt: d(type === "JOIN" ? "2026-11-10T17:00:00Z" : "2026-11-10T19:00:00Z"), source: "test", dedupKey: `${past}:${type}` })),
    );
    return { orgId, admin, staff, teacher, otherTeacher, l1, l2, courseId: c1.id, past, future, other };
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

describe("Rechte", () => {
  it("Lehrkraft sieht nur Termine ihrer Kurse, Leitung und Verwaltung alle", async () => {
    const mine = await run(a, (tx) => listMySessions(tx, a.teacher, NOW));
    expect(mine.map((x) => x.sessionId).sort()).toEqual([a.past, a.future].sort());
    const all = await run(a, (tx) => listMySessions(tx, a.admin, NOW));
    expect(all.map((x) => x.sessionId)).toContain(a.other);
    const staff = await run(a, (tx) => listMySessions(tx, a.staff, NOW));
    expect(staff.length).toBeGreaterThan(0);
  });
  it("Teilnehmende sehen keine Kursräume, auch nicht die ihres eigenen Kurses", async () => {
    await expect(run(a, (tx) => listMySessions(tx, a.l1, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => loadRoom(tx, a.l1, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("Lehrkraft eines anderen Kurses kommt nicht hinein und kann nichts ändern", async () => {
    await expect(run(a, (tx) => loadRoom(tx, a.otherTeacher, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => proposeAsActor(tx, a.otherTeacher, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => confirmAllAsActor(tx, a.otherTeacher, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => saveRegister(tx, a.otherTeacher, a.past, "x", NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => closeSession(tx, a.otherTeacher, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => recordExport(tx, a.otherTeacher, a.past))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("Verwaltung darf ansehen, aber nicht bestätigen oder ins Klassenbuch schreiben", async () => {
    const room = await run(a, (tx) => loadRoom(tx, a.staff, a.past, NOW));
    expect(room.can).toEqual({ review: false, correct: true, write: false, export: true });
    await expect(run(a, (tx) => confirmAllAsActor(tx, a.staff, a.past, NOW))).rejects.toBeInstanceOf(NotAllowedError);
    await expect(run(a, (tx) => saveRegister(tx, a.staff, a.past, "x", NOW))).rejects.toBeInstanceOf(NotAllowedError);
  });
  it("Schule A sieht nichts von Schule B", async () => {
    await expect(run(a, (tx) => loadRoom(tx, a.admin, b.past, NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    await expect(run(a, (tx) => saveRegister(tx, a.admin, b.past, "x", NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    const list = await run(a, (tx) => listMySessions(tx, a.admin, NOW));
    expect(list.map((x) => x.sessionId)).not.toContain(b.past);
  });
});

describe("Ablauf eines Termins", () => {
  it("zeigt Einwahlen, aber noch keine Bewertung, bis der Vorschlag berechnet ist", async () => {
    const room = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    expect(room.learners.map((l) => l.status)).toEqual([null, null]);
    expect(room.learners.find((l) => l.membershipId === a.l1)!.intervals).toHaveLength(1);
    expect(room.over).toBe(true);
  });
  it("Vorschlag erst nach Terminbeginn", async () => {
    await expect(run(a, (tx) => proposeAsActor(tx, a.teacher, a.future, NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    await run(a, (tx) => proposeAsActor(tx, a.teacher, a.past, NOW));
    const room = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    expect(room.learners.map((l) => [l.status, l.reviewState]).sort()).toEqual([["ABSENT", "PROPOSED"], ["PRESENT", "PROPOSED"]]);
  });
  it("Bestätigen erst nach Terminende; danach sind alle bestätigt, mit Person und Zeit", async () => {
    await expect(run(a, (tx) => confirmAllAsActor(tx, a.teacher, a.past, d("2026-11-10T18:00:00Z")))).rejects.toBeInstanceOf(TeachingRuleError);
    expect(await run(a, (tx) => confirmAllAsActor(tx, a.teacher, a.past, NOW))).toBe(2);
    expect(await run(a, (tx) => confirmAllAsActor(tx, a.teacher, a.past, NOW))).toBe(0);
    const room = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    expect(room.learners.every((l) => l.reviewState === "CONFIRMED" && l.confirmedBy === "lehrkraft alpha" && l.confirmedAt)).toBe(true);
  });
  it("Abschließen verlangt Klassenbuch; Klassenbuch hat Grenzen und wird protokolliert", async () => {
    await expect(run(a, (tx) => closeSession(tx, a.teacher, a.past, NOW))).rejects.toThrow(/Klassenbucheintrag/);
    await expect(run(a, (tx) => saveRegister(tx, a.teacher, a.past, "   ", NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    await expect(run(a, (tx) => saveRegister(tx, a.teacher, a.past, "x".repeat(REGISTER_MAX + 1), NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    await expect(run(a, (tx) => saveRegister(tx, a.teacher, a.future, "Thema", NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    await run(a, (tx) => saveRegister(tx, a.teacher, a.past, "Konjunktiv II", NOW));
    await run(a, (tx) => saveRegister(tx, a.teacher, a.past, "Konjunktiv II, Übungen", NOW));
    const room = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    expect(room.register).toMatchObject({ content: "Konjunktiv II, Übungen", author: "lehrkraft alpha" });
    const ev = await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, a.past)));
    expect(ev.map((e) => e.action)).toEqual(expect.arrayContaining(["register.written", "register.changed"]));
  });
  it("Abschluss sperrt das Klassenbuch; Korrektur der Anwesenheit braucht danach Begründung und bleibt sichtbar", async () => {
    await run(a, (tx) => closeSession(tx, a.teacher, a.past, NOW));
    await expect(run(a, (tx) => saveRegister(tx, a.teacher, a.past, "Nachträglich", NOW))).rejects.toThrow(/gesperrt/);
    await expect(run(a, (tx) => proposeAsActor(tx, a.teacher, a.past, NOW))).rejects.toBeInstanceOf(TeachingRuleError);
    const room = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    const rec = room.learners.find((l) => l.membershipId === a.l2)!.recordId!;
    await expect(run(a, (tx) => changeAttendanceStatus(tx, a.teacher, rec, "EXCUSED"))).rejects.toThrow(/Begründung/);
    await run(a, (tx) => changeAttendanceStatus(tx, a.teacher, rec, "EXCUSED", "Arztbesuch, Attest liegt vor"));
    const after = await run(a, (tx) => loadRoom(tx, a.teacher, a.past, NOW));
    const l2 = after.learners.find((l) => l.membershipId === a.l2)!;
    expect(l2.status).toBe("EXCUSED");
    expect(l2.corrections).toMatchObject([{ fromStatus: "ABSENT", toStatus: "EXCUSED", reason: "Arztbesuch, Attest liegt vor", by: "lehrkraft alpha" }]);
    expect((await run(a, (tx) => listMySessions(tx, a.teacher, NOW))).find((x) => x.sessionId === a.past)!.status).toBe("CLOSED");
  });
  it("Abschließen geht nicht, solange etwas unbestätigt ist", async () => {
    const c = await school("gamma");
    await run(c, (tx) => saveRegister(tx, c.teacher, c.past, "Thema", NOW));
    await run(c, (tx) => proposeAsActor(tx, c.teacher, c.past, NOW));
    await expect(run(c, (tx) => closeSession(tx, c.teacher, c.past, NOW))).rejects.toThrow(/bestätigt/);
    await expect(run(c, (tx) => closeSession(tx, c.teacher, c.past, d("2026-11-10T18:00:00Z")))).rejects.toThrow(/läuft noch/);
  });
  it("Ausgabe des Einwahlprotokolls wird protokolliert", async () => {
    await run(a, (tx) => recordExport(tx, a.teacher, a.past));
    await run(a, (tx) => recordExport(tx, a.staff, a.past));
    const ev = await run(a, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "evidence.exported")));
    expect(ev).toHaveLength(2);
  });
});
