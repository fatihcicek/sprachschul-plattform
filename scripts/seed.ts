// Legt eine Beispielschule mit erfundenen Personen an. Nur für die Entwicklung.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, withOrganization } from "../src/db/client";
import * as s from "../src/db/schema";
import { proposeAttendance } from "../src/server/attendance";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");
const { db, pool } = createDb(url);

const SLUG = "beispielschule";
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`);

async function main() {
  const [existingUser] = await db.select().from(s.users).where(eq(s.users.email, "sabine.brandt@beispielschule.test"));
  if (existingUser) {
    console.log("Beispieldaten sind schon vorhanden.");
    return;
  }
  const orgId = randomUUID();
  await withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: "Beispielschule", slug: SLUG });
    const member = async (role: (typeof s.role.enumValues)[number], firstName: string, lastName: string) => {
      const email = `${firstName}.${lastName}@beispielschule.test`.toLowerCase().replaceAll(" ", "-");
      const [u] = await tx.insert(s.users).values({ email, firstName, lastName }).returning();
      const [m] = await tx.insert(s.memberships).values({ organizationId: orgId, userId: u!.id, role }).returning();
      return m!.id;
    };
    await member("ADMIN", "Sabine", "Brandt");
    const teacher = await member("TEACHER", "Jonas", "Weber");
    const names: [string, string][] = [
      ["Amina", "Yusuf"], ["Dmytro", "Kovalenko"], ["Layla", "Rahimi"], ["Carlos", "Mendes"],
      ["Thi", "Nguyen"], ["Ivan", "Petrov"], ["Fatima", "Al-Sayed"], ["Mehmet", "Kaya"],
    ];
    const learners: string[] = [];
    for (const [first, last] of names) learners.push(await member("LEARNER", first, last));

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

    // Einwahlen wie im Prototyp: Verspätung, Unterbrechung, vorzeitiges Gehen, Fehlen.
    const log: [number, string, string][] = [
      [0, "17:58", "21:15"], [1, "18:00", "21:15"], [2, "18:22", "21:15"], [3, "18:01", "19:10"], [3, "19:14", "21:15"],
      [4, "18:00", "21:14"], [5, "18:00", "19:32"], [7, "18:03", "21:15"],
    ];
    await tx.insert(s.connectionEvents).values(
      log.flatMap(([i, from, to]) =>
        (["JOIN", "LEAVE"] as const).map((type) => {
          const hhmm = type === "JOIN" ? from : to;
          return { organizationId: orgId, sessionId: session!.id, membershipId: learners[i]!, type, occurredAt: at("2026-11-10", hhmm), source: "seed", dedupKey: `${session!.id}:${i}:${type}:${hhmm}` };
        }),
      ),
    );
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
    console.log(`Beispielschule angelegt: 8 Teilnehmende, 2 Termine, ${result.proposed} Anwesenheitsvorschläge.`);
  });
}

main().finally(() => pool.end());
