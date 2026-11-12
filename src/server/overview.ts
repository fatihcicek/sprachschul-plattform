// Startseite „Heute“ für die Verwaltung: Termine von heute, offene
// Anwesenheitsbestätigungen und fehlende Klassenbucheinträge.
// Erwartet eine Transaktion aus withOrganization().

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { attendanceRecords, classRegisterEntries, courses, enrollments, lessonSessions, memberships } from "@/db/schema";
import { can } from "@/domain/permissions";
import { localDay } from "@/domain/schedule";
import { attendanceIsOpen, LOOKBACK_DAYS, phaseOf, type SessionPhase } from "@/domain/today";
import { onboardingFrom, type Onboarding } from "@/domain/onboarding";
import { loadActor, NotAllowedError } from "@/server/actor";
import { accessStates } from "@/server/auth";

export type TodayLesson = {
  sessionId: string;
  courseId: string;
  courseName: string;
  startsAt: Date;
  endsAt: Date;
  phase: SessionPhase;
  mode: "PRESENCE" | "VIRTUAL";
  learners: number;
};

export type OpenItem = {
  sessionId: string;
  courseId: string;
  courseName: string;
  startsAt: Date;
  endsAt: Date;
};

export type TodayOverview = {
  lessons: TodayLesson[];
  /** Vergangene Termine, bei denen noch nicht jede Anwesenheit bestätigt ist. */
  openAttendance: (OpenItem & { unconfirmed: number })[];
  /** Vergangene Termine ohne Klassenbucheintrag. */
  missingRegister: OpenItem[];
};

export async function loadToday(tx: Tx, actorMembershipId: string, now: Date = new Date()): Promise<TodayOverview> {
  const actor = await loadActor(tx, actorMembershipId);
  // Überblick über alle Kurse der Schule: nur Leitung und Verwaltung.
  if (!actor.active || !can(actor.role, "course.configure")) throw new NotAllowedError("course.configure");

  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const until = new Date(now.getTime() + 2 * 86_400_000);
  // Nur laufende Kurse: Entwürfe und archivierte Kurse gehören nicht auf die Startseite.
  const rows = await tx
    .select({ s: lessonSessions, courseName: courses.name })
    .from(lessonSessions)
    .innerJoin(courses, eq(courses.id, lessonSessions.courseId))
    .where(and(eq(courses.status, "ACTIVE"), gte(lessonSessions.startsAt, from), lt(lessonSessions.startsAt, until)))
    .orderBy(asc(lessonSessions.startsAt));

  const ids = rows.map((r) => r.s.id);
  const courseIds = [...new Set(rows.map((r) => r.s.courseId))];
  const records = ids.length ? await tx.select().from(attendanceRecords).where(inArray(attendanceRecords.sessionId, ids)) : [];
  const entries = ids.length ? await tx.select({ sessionId: classRegisterEntries.sessionId }).from(classRegisterEntries).where(inArray(classRegisterEntries.sessionId, ids)) : [];
  // Nur aktive Personen zählen mit.
  const enrolled = courseIds.length
    ? await tx
        .select({ courseId: enrollments.courseId, membershipId: enrollments.membershipId, startsOn: enrollments.startsOn, endsOn: enrollments.endsOn })
        .from(enrollments)
        .innerJoin(memberships, eq(memberships.id, enrollments.membershipId))
        .where(and(inArray(enrollments.courseId, courseIds), eq(memberships.active, true)))
    : [];
  const withEntry = new Set(entries.map((e) => e.sessionId));
  const enrolledByCourse = new Map<string, typeof enrolled>();
  for (const e of enrolled) enrolledByCourse.set(e.courseId, [...(enrolledByCourse.get(e.courseId) ?? []), e]);
  const confirmedBySession = new Map<string, Set<string>>();
  for (const r of records) {
    if (r.reviewState !== "CONFIRMED") continue;
    const set = confirmedBySession.get(r.sessionId) ?? new Set<string>();
    set.add(r.membershipId);
    confirmedBySession.set(r.sessionId, set);
  }

  const today = localDay(now);
  const lessons: TodayLesson[] = [];
  const openAttendance: TodayOverview["openAttendance"] = [];
  const missingRegister: OpenItem[] = [];

  for (const { s, courseName } of rows) {
    const day = localDay(s.startsAt);
    const present = (enrolledByCourse.get(s.courseId) ?? []).filter((e) => e.startsOn <= day && (e.endsOn === null || e.endsOn >= day));
    const item: OpenItem = { sessionId: s.id, courseId: s.courseId, courseName, startsAt: s.startsAt, endsAt: s.endsAt };
    const phase = phaseOf(s, now);
    if (day === today) lessons.push({ ...item, phase, mode: s.mode, learners: present.length });
    // Abgeschlossene Termine (Anwesenheit bestätigt, Klassenbuch geführt) sind nie offen.
    if (phase !== "OVER" || s.status === "CLOSED") continue;
    const confirmedSet = confirmedBySession.get(s.id) ?? new Set<string>();
    const confirmed = present.filter((e) => confirmedSet.has(e.membershipId)).length;
    if (attendanceIsOpen({ enrolled: present.length, confirmed })) openAttendance.push({ ...item, unconfirmed: Math.max(0, present.length - confirmed) });
    if (!withEntry.has(s.id)) missingRegister.push(item);
  }
  return { lessons, openAttendance, missingRegister };
}

/** Einstiegs-Checkliste für die Verwaltung: was bis zum ersten Unterricht noch fehlt. Nur Leitung und Verwaltung. */
export async function loadOnboarding(tx: Tx, actorMembershipId: string, now: Date = new Date()): Promise<Onboarding> {
  const actor = await loadActor(tx, actorMembershipId);
  if (!actor.active || !can(actor.role, "course.configure")) throw new NotAllowedError("course.configure");
  const courseRows = await tx.select({ id: courses.id }).from(courses);
  const people = await tx.select({ id: memberships.id, role: memberships.role }).from(memberships).where(eq(memberships.active, true));
  const states = await accessStates(tx, now);
  const withAccess = (role: "TEACHER" | "LEARNER") => people.filter((p) => p.role === role && states.has(p.id)).length;
  return onboardingFrom({ courses: courseRows.length, teachersWithAccess: withAccess("TEACHER"), learnersWithAccess: withAccess("LEARNER") });
}
