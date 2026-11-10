// Kurse anlegen und auflisten. Alle Funktionen erwarten eine Transaktion aus
// withOrganization(); ein Fehler mitten im Anlegen rollt alles zurück.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { auditEvents, courses, enrollments, lessonSessions, memberships, teachingAssignments, users } from "@/db/schema";
import { checkPlan, expandPlan, type WeeklyPlan } from "@/domain/course-plan";
import { can } from "@/domain/permissions";
import { loadActor, NotAllowedError } from "@/server/actor";
import { createPerson } from "@/server/people";

export class CourseInputError extends Error {}

export type NewLearner = { firstName: string; lastName: string; email: string; bamfFunded: boolean };

export type CreateCourseInput = {
  name: string;
  category: string;
  bamfCourseNumber?: string;
  plan: WeeklyPlan;
  excludedDays: string[];
  teacherIds: string[];
  learners: { membershipId: string; bamfFunded: boolean }[];
  newLearners: NewLearner[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Grenzen für eine Eingabe; schützt den Server vor übergroßen oder kaputten Anfragen. */
export const LIMITS = { text: 200, people: 200, excludedDays: 400 };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().uuid();
const text = z.string().max(LIMITS.text);

/** Form der Eingabe. Die Serveraktion bekommt ein Objekt vom Browser und darf ihm nichts glauben. */
export const createCourseSchema = z
  .object({
    name: text,
    category: text,
    bamfCourseNumber: z.string().max(40).optional(),
    plan: z
      .object({
        startDate: day,
        endDate: day,
        weekdays: z.array(z.number().int().min(1).max(7)).max(7),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        ue: z.number().int().min(1).max(12),
        mode: z.enum(["PRESENCE", "VIRTUAL"]),
      })
      .strict(),
    excludedDays: z.array(day).max(LIMITS.excludedDays),
    teacherIds: z.array(id).max(20),
    learners: z.array(z.object({ membershipId: id, bamfFunded: z.boolean() }).strict()).max(LIMITS.people),
    newLearners: z
      .array(z.object({ firstName: text, lastName: text, email: z.string().max(254), bamfFunded: z.boolean() }).strict())
      .max(LIMITS.people),
  })
  .strict();

/** Liest die Eingabe streng ein oder meldet einen verständlichen Fehler. */
export function parseCourseInput(raw: unknown): CreateCourseInput {
  const r = createCourseSchema.safeParse(raw);
  if (!r.success) throw new CourseInputError("Die Angaben sind unvollständig oder ungültig. Bitte prüfe die Eingaben.");
  const v = r.data;
  return { ...v, plan: { ...v.plan, weekdays: v.plan.weekdays as WeeklyPlan["weekdays"] } };
}

async function requireCourseAdmin(tx: Tx, actorMembershipId: string) {
  const actor = await loadActor(tx, actorMembershipId);
  for (const p of ["course.configure", "enrollment.manage", "session.schedule"] as const) {
    if (!actor.active || !can(actor.role, p)) throw new NotAllowedError(p);
  }
  return actor;
}

/** Personen der Schule für die Auswahl im Kursablauf. */
export async function listPeople(tx: Tx, actorMembershipId: string) {
  await requireCourseAdmin(tx, actorMembershipId);
  const rows = await tx
    .select({ membershipId: memberships.id, role: memberships.role, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.active, true))
    .orderBy(asc(users.lastName), asc(users.firstName));
  return { teachers: rows.filter((r) => r.role === "TEACHER"), learners: rows.filter((r) => r.role === "LEARNER") };
}

const NAME_MISSING = "Neue Teilnehmende brauchen Vor- und Nachnamen.";

/** Prüft alle Eingaben, bevor irgendetwas geschrieben wird. */
export function validateCourseInput(input: CreateCourseInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Bitte einen Kursnamen angeben.");
  if (!input.category.trim()) errors.push("Bitte eine Kursart angeben.");
  errors.push(...checkPlan(input.plan).errors);
  if (input.teacherIds.length === 0) errors.push("Bitte mindestens eine Lehrkraft zuordnen.");
  const emails = new Set<string>();
  for (const l of input.newLearners) {
    const email = l.email.trim().toLowerCase();
    if ((!l.firstName.trim() || !l.lastName.trim()) && !errors.includes(NAME_MISSING)) errors.push(NAME_MISSING);
    if (!EMAIL.test(email)) errors.push(`Ungültige E-Mail-Adresse: ${l.email || "(leer)"}`);
    if (emails.has(email)) errors.push(`E-Mail doppelt eingetragen: ${email}`);
    emails.add(email);
  }
  if (!errors.length && expandPlan(input.plan, input.excludedDays).length === 0) errors.push("Alle Termine wurden entfernt.");
  return errors;
}

export async function createCourse(tx: Tx, actorMembershipId: string, raw: unknown) {
  const actor = await requireCourseAdmin(tx, actorMembershipId);
  const input = parseCourseInput(raw);
  if (input.learners.length + input.newLearners.length > LIMITS.people) throw new CourseInputError(`Höchstens ${LIMITS.people} Teilnehmende je Kurs.`);
  const learnerIds = input.learners.map((l) => l.membershipId);
  if (new Set(learnerIds).size !== learnerIds.length) throw new CourseInputError("Eine Person ist doppelt ausgewählt.");
  const errors = validateCourseInput(input);
  if (errors.length) throw new CourseInputError(errors.join(" "));

  // Ausgewählte Personen müssen in dieser Schule die passende Rolle haben.
  // Die Zeilensicherheit lässt Personen anderer Schulen gar nicht erst durch.
  const wanted = [...new Set([...input.teacherIds, ...input.learners.map((l) => l.membershipId)])];
  const found = wanted.length ? await tx.select({ id: memberships.id, role: memberships.role, active: memberships.active }).from(memberships).where(inArray(memberships.id, wanted)) : [];
  const roleOf = new Map(found.filter((m) => m.active).map((m) => [m.id, m.role]));
  if (input.teacherIds.some((id) => roleOf.get(id) !== "TEACHER")) throw new CourseInputError("Eine gewählte Lehrkraft gibt es an dieser Schule nicht.");
  if (input.learners.some((l) => roleOf.get(l.membershipId) !== "LEARNER")) throw new CourseInputError("Eine gewählte Person ist an dieser Schule nicht als Teilnehmende geführt.");

  if (input.newLearners.length) {
    const emails = input.newLearners.map((l) => l.email.trim().toLowerCase());
    const taken = await tx.select({ email: users.email }).from(users).where(inArray(users.email, emails));
    if (taken.length)
      throw new CourseInputError(
        `Diese E-Mail gibt es an der Schule schon: ${taken.map((t) => t.email).join(", ")}. Ist die Person Teilnehmende, bitte aus der Liste wählen; sonst eine andere E-Mail verwenden.`,
      );
  }

  const org = actor.organizationId;
  const plan = input.plan;
  const [course] = await tx
    .insert(courses)
    .values({
      organizationId: org,
      name: input.name.trim(),
      category: input.category.trim(),
      bamfCourseNumber: input.bamfCourseNumber?.trim() || null,
      bamfFunded: input.learners.some((l) => l.bamfFunded) || input.newLearners.some((l) => l.bamfFunded),
      mode: plan.mode,
      status: "ACTIVE",
      startDate: plan.startDate,
      endDate: plan.endDate,
    })
    .returning();
  const courseId = course!.id;

  const dates = expandPlan(plan, input.excludedDays);
  await tx.insert(lessonSessions).values(dates.map((d) => ({ organizationId: org, courseId, startsAt: d.startsAt, endsAt: d.endsAt, plannedUe: plan.ue, mode: plan.mode })));
  await tx.insert(teachingAssignments).values([...new Set(input.teacherIds)].map((membershipId) => ({ organizationId: org, courseId, membershipId })));

  const enrolled: { membershipId: string; bamfFunded: boolean }[] = [...input.learners];
  for (const l of input.newLearners) {
    const { membershipId } = await createPerson(tx, org, { firstName: l.firstName, lastName: l.lastName, email: l.email, role: "LEARNER" });
    enrolled.push({ membershipId, bamfFunded: l.bamfFunded });
  }
  if (enrolled.length)
    await tx.insert(enrollments).values(enrolled.map((e) => ({ organizationId: org, courseId, membershipId: e.membershipId, startsOn: plan.startDate, bamfFunded: e.bamfFunded })));

  await tx.insert(auditEvents).values({
    organizationId: org,
    actorMembershipId,
    action: "course.created",
    entity: "course",
    entityId: courseId,
    meta: { sessions: dates.length, teachers: input.teacherIds.length, learners: enrolled.length, newPersons: input.newLearners.length },
  });
  return { courseId, sessions: dates.length, teachers: new Set(input.teacherIds).size, learners: enrolled.length };
}

/** Kursübersicht für die Verwaltung. */
export async function listCourses(tx: Tx, actorMembershipId: string) {
  await requireCourseAdmin(tx, actorMembershipId);
  const rows = await tx.select().from(courses).orderBy(asc(courses.startDate));
  if (!rows.length) return [];
  const ids = rows.map((c) => c.id);
  const sessionCounts = await tx
    .select({ courseId: lessonSessions.courseId, n: sql<number>`count(*)::int`, first: sql<Date>`min(${lessonSessions.startsAt})`, last: sql<Date>`max(${lessonSessions.endsAt})` })
    .from(lessonSessions)
    .where(inArray(lessonSessions.courseId, ids))
    .groupBy(lessonSessions.courseId);
  const learnerCounts = await tx
    .select({ courseId: enrollments.courseId, n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(inArray(enrollments.courseId, ids))
    .groupBy(enrollments.courseId);
  const teacherRows = await tx
    .select({ courseId: teachingAssignments.courseId, firstName: users.firstName, lastName: users.lastName })
    .from(teachingAssignments)
    .innerJoin(memberships, and(eq(memberships.id, teachingAssignments.membershipId)))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(teachingAssignments.courseId, ids));
  return rows.map((c) => {
    const s = sessionCounts.find((x) => x.courseId === c.id);
    return {
      course: c,
      sessions: s?.n ?? 0,
      firstStartsAt: s?.first ? new Date(s.first) : null,
      lastEndsAt: s?.last ? new Date(s.last) : null,
      learners: learnerCounts.find((x) => x.courseId === c.id)?.n ?? 0,
      teachers: teacherRows.filter((t) => t.courseId === c.id).map((t) => `${t.firstName} ${t.lastName}`),
    };
  });
}
