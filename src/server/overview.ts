// Startseite „Heute“ für die Verwaltung: Termine von heute, offene
// Anwesenheitsbestätigungen und fehlende Klassenbucheinträge.
// Erwartet eine Transaktion aus withOrganization().

import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { attendanceRecords, classRegisterEntries, courses, enrollments, lessonSessions } from "@/db/schema";
import { can } from "@/domain/permissions";
import { localDay } from "@/domain/schedule";
import { attendanceIsOpen, LOOKBACK_DAYS, phaseOf, type SessionPhase } from "@/domain/today";
import { loadActor, NotAllowedError } from "@/server/actor";

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
  const rows = await tx
    .select({ s: lessonSessions, courseName: courses.name })
    .from(lessonSessions)
    .innerJoin(courses, eq(courses.id, lessonSessions.courseId))
    .where(and(gte(lessonSessions.startsAt, from), lt(lessonSessions.startsAt, until)))
    .orderBy(asc(lessonSessions.startsAt));

  const ids = rows.map((r) => r.s.id);
  const courseIds = [...new Set(rows.map((r) => r.s.courseId))];
  const records = ids.length ? await tx.select().from(attendanceRecords).where(inArray(attendanceRecords.sessionId, ids)) : [];
  const entries = ids.length ? await tx.select({ sessionId: classRegisterEntries.sessionId }).from(classRegisterEntries).where(inArray(classRegisterEntries.sessionId, ids)) : [];
  const enrolled = courseIds.length ? await tx.select().from(enrollments).where(inArray(enrollments.courseId, courseIds)) : [];
  const withEntry = new Set(entries.map((e) => e.sessionId));

  const today = localDay(now);
  const lessons: TodayLesson[] = [];
  const openAttendance: TodayOverview["openAttendance"] = [];
  const missingRegister: OpenItem[] = [];

  for (const { s, courseName } of rows) {
    const day = localDay(s.startsAt);
    const learners = enrolled.filter((e) => e.courseId === s.courseId && e.startsOn <= day && (e.endsOn === null || e.endsOn >= day)).length;
    const item: OpenItem = { sessionId: s.id, courseId: s.courseId, courseName, startsAt: s.startsAt, endsAt: s.endsAt };
    const phase = phaseOf(s, now);
    if (day === today) lessons.push({ ...item, sessionId: s.id, phase, mode: s.mode, learners });
    if (phase !== "OVER") continue;
    const confirmed = records.filter((r) => r.sessionId === s.id && r.reviewState === "CONFIRMED").length;
    const proposed = records.filter((r) => r.sessionId === s.id && r.reviewState === "PROPOSED").length;
    if (attendanceIsOpen({ enrolled: learners, confirmed, proposed })) openAttendance.push({ ...item, unconfirmed: learners - confirmed });
    if (!withEntry.has(s.id)) missingRegister.push(item);
  }
  // Älteste offene Punkte zuerst: sie sind am dringendsten.
  return { lessons, openAttendance, missingRegister };
}
