// Legt eine Beispielschule mit erfundenen Personen an. Nur für Entwicklung und Tests.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withOrganization, withSlugLookup, type Db, type Tx } from "./client";
import * as s from "./schema";
import { proposeAttendance } from "../server/attendance";
import { createPerson } from "../server/people";

const SLUG = "beispielschule";
const NAMES: [string, string][] = [
  ["Amina", "Yusuf"], ["Dmytro", "Kovalenko"], ["Layla", "Rahimi"], ["Carlos", "Mendes"],
  ["Thi", "Nguyen"], ["Ivan", "Petrov"], ["Fatima", "Al-Sayed"], ["Mehmet", "Kaya"],
];
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`);

// Einwahlen wie im Prototyp: Verspätung, Unterbrechung, vorzeitiges Gehen, Fehlen.
const LOG: [number, string, string][] = [
  [0, "17:58", "21:15"], [1, "18:00", "21:15"], [2, "18:22", "21:15"], [3, "18:01", "19:10"], [3, "19:14", "21:15"],
  [4, "18:00", "21:14"], [5, "18:00", "19:32"], [7, "18:03", "21:15"],
];
const logFor = (orgId: string, learners: string[], sessionId: string, day: string) =>
  LOG.flatMap(([i, from, to]) =>
    (["JOIN", "LEAVE"] as const).map((type) => {
      const hhmm = type === "JOIN" ? from : to;
      return { organizationId: orgId, sessionId, membershipId: learners[i]!, type, occurredAt: at(day, hhmm), source: "seed", dedupKey: `${sessionId}:${i}:${type}:${hhmm}` };
    }),
  );

/** Ein früherer Termin, an dem noch Bestätigung und Klassenbuch fehlen: so zeigt „Heute“ offene Punkte. */
async function addEarlierSession(tx: Tx, orgId: string, courseId: string, learners: string[]) {
  const [earlier] = await tx
    .insert(s.lessonSessions)
    .values({ organizationId: orgId, courseId, startsAt: at("2026-11-05", "18:00"), endsAt: at("2026-11-05", "21:15"), plannedUe: 4, mode: "VIRTUAL", status: "ENDED" })
    .returning();
  await tx.insert(s.connectionEvents).values(logFor(orgId, learners, earlier!.id, "2026-11-05"));
  await proposeAttendance(tx, earlier!.id);
}

/** Ergänzt Beispielschulen, die vor dem früheren Termin angelegt wurden (Testumgebung behält ihre Daten). */
async function topUpDemo(db: Db, orgId: string) {
  await withOrganization(db, orgId, async (tx) => {
    const [course] = await tx.select().from(s.courses).where(eq(s.courses.name, "BSK B2 – Abendkurs"));
    if (!course) return;
    const sessions = await tx.select().from(s.lessonSessions).where(eq(s.lessonSessions.courseId, course.id));
    if (sessions.some((x) => x.startsAt.getTime() === at("2026-11-05", "18:00").getTime())) return;
    const rows = await tx.select({ id: s.memberships.id, email: s.users.email }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId));
    const byEmail = new Map(rows.map((r) => [r.email, r.id]));
    const learners = NAMES.map(([f, l]) => byEmail.get(`${f}.${l}@beispielschule.test`.toLowerCase().replaceAll(" ", "-")));
    if (learners.some((x) => !x)) return;
    await addEarlierSession(tx, orgId, course.id, learners as string[]);
  });
}

export async function seedDemo(db: Db): Promise<boolean> {
  const [existing] = await withSlugLookup(db, SLUG, (tx) => tx.select({ id: s.organizations.id }).from(s.organizations));
  if (existing) {
    await topUpDemo(db, existing.id);
    return false;
  }
  const orgId = randomUUID();
  await withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: "Beispielschule", slug: SLUG });
    const member = async (role: (typeof s.role.enumValues)[number], firstName: string, lastName: string) => {
      const email = `${firstName}.${lastName}@beispielschule.test`.toLowerCase().replaceAll(" ", "-");
      return (await createPerson(tx, orgId, { email, firstName, lastName, role })).membershipId;
    };
    await member("ADMIN", "Sabine", "Brandt");
    const teacher = await member("TEACHER", "Jonas", "Weber");
    const learners: string[] = [];
    for (const [first, last] of NAMES) learners.push(await member("LEARNER", first, last));

    const [course] = await tx
      .insert(s.courses)
      .values({ organizationId: orgId, name: "BSK B2 – Abendkurs", category: "BSK B2", bamfFunded: true, status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26" })
      .returning();
    await tx.insert(s.teachingAssignments).values({ organizationId: orgId, courseId: course!.id, membershipId: teacher });
    await tx.insert(s.enrollments).values(learners.map((membershipId) => ({ organizationId: orgId, courseId: course!.id, membershipId, startsOn: "2026-09-01" })));

    const [session] = await tx
      .insert(s.lessonSessions)
      .values({ organizationId: orgId, courseId: course!.id, startsAt: at("2026-11-10", "18:00"), endsAt: at("2026-11-10", "21:15"), plannedUe: 4, mode: "VIRTUAL", status: "ENDED" })
      .returning();
    await tx.insert(s.lessonSessions).values({ organizationId: orgId, courseId: course!.id, startsAt: at("2026-11-12", "18:00"), endsAt: at("2026-11-12", "21:15"), plannedUe: 4, mode: "VIRTUAL" });

    await tx.insert(s.connectionEvents).values(logFor(orgId, learners, session!.id, "2026-11-10"));
    // Die Lehrkraft wählt sich kurz vor Beginn ein und bleibt bis zum Ende.
    await tx.insert(s.connectionEvents).values(
      (["JOIN", "LEAVE"] as const).map((type) => {
        const hhmm = type === "JOIN" ? "17:52" : "21:15";
        return { organizationId: orgId, sessionId: session!.id, membershipId: teacher, type, occurredAt: at("2026-11-10", hhmm), source: "seed", dedupKey: `${session!.id}:teacher:${type}:${hhmm}` };
      }),
    );

    await addEarlierSession(tx, orgId, course!.id, learners);
    await tx.insert(s.assignments).values([
      {
        organizationId: orgId,
        courseId: course!.id,
        title: "Beschwerdebrief an einen Online-Händler",
        instructions: "Sie haben ein Paket bestellt, das beschädigt angekommen ist. Schreiben Sie eine formelle Beschwerde (ca. 120 Wörter):\n– Was haben Sie bestellt und wann?\n– Was ist das Problem?\n– Was erwarten Sie vom Händler?",
        dueAt: at("2026-11-17", "18:00"),
        createdByMembershipId: teacher,
      },
      {
        organizationId: orgId,
        courseId: course!.id,
        title: "E-Mail an die Teamleitung: Urlaubsantrag",
        instructions: "Bitten Sie Ihre Teamleitung per E-Mail um zwei Wochen Urlaub im Januar. Begründen Sie kurz und schlagen Sie eine Vertretung vor (ca. 80 Wörter).",
        dueAt: null,
        createdByMembershipId: teacher,
      },
    ]);
    const result = await proposeAttendance(tx, session!.id);
    void result;
  });
  return true;
}
