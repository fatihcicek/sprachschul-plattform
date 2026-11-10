// Anwesenheit: Vorschlag aus dem Einwahlprotokoll, Bestätigung, Korrektur.
// Alle Funktionen erwarten eine Transaktion aus withOrganization().

import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  attendanceCorrections,
  attendanceRecords,
  auditEvents,
  connectionEvents,
  enrollments,
  lessonSessions,
  memberships,
  teachingAssignments,
} from "@/db/schema";
import { computePresence, planStatusChange, proposeStatus, type AttendanceStatus } from "@/domain/attendance";
import { localDay } from "@/domain/schedule";
import { canInCourse, type Actor, type Permission } from "@/domain/permissions";

export class NotAllowedError extends Error {
  constructor(permission: Permission) {
    super(`Keine Berechtigung: ${permission}`);
  }
}

async function loadActor(tx: Tx, membershipId: string): Promise<Actor & { organizationId: string }> {
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!m) throw new Error("Unbekanntes Konto");
  const assigned =
    m.role === "LEARNER"
      ? await tx.select({ courseId: enrollments.courseId }).from(enrollments).where(eq(enrollments.membershipId, m.id))
      : await tx
          .select({ courseId: teachingAssignments.courseId })
          .from(teachingAssignments)
          .where(eq(teachingAssignments.membershipId, m.id));
  return { role: m.role, active: m.active, assignedCourseIds: assigned.map((a) => a.courseId), organizationId: m.organizationId };
}

async function requireInCourse(tx: Tx, actorMembershipId: string, permission: Permission, courseId: string) {
  const actor = await loadActor(tx, actorMembershipId);
  if (!canInCourse(actor, permission, courseId)) throw new NotAllowedError(permission);
  return actor;
}

async function loadSession(tx: Tx, sessionId: string) {
  const [session] = await tx.select().from(lessonSessions).where(eq(lessonSessions.id, sessionId));
  if (!session) throw new Error("Termin nicht gefunden");
  return session;
}

/**
 * Berechnet für alle Teilnehmenden des Kurses einen Vorschlag aus dem
 * Einwahlprotokoll. Bereits bestätigte Einträge bleiben unberührt; die Funktion
 * kann beliebig oft laufen (z. B. wenn Konferenzdaten verspätet eintreffen).
 */
export async function proposeAttendance(tx: Tx, sessionId: string): Promise<{ proposed: number; keptConfirmed: number }> {
  const session = await loadSession(tx, sessionId);
  const day = localDay(session.startsAt);
  const enrolled = (await tx.select().from(enrollments).where(eq(enrollments.courseId, session.courseId))).filter(
    (e) => e.startsOn <= day && (e.endsOn === null || e.endsOn >= day),
  );
  const events = await tx.select().from(connectionEvents).where(eq(connectionEvents.sessionId, sessionId));
  const existing = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
  const confirmed = new Set(existing.filter((r) => r.reviewState === "CONFIRMED").map((r) => r.membershipId));

  const window = { start: session.startsAt, end: session.endsAt };
  const sessionMinutes = Math.floor((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000);
  let proposed = 0;
  for (const e of enrolled) {
    if (confirmed.has(e.membershipId)) continue;
    const own = events.filter((ev) => ev.membershipId === e.membershipId).map((ev) => ({ type: ev.type, at: ev.occurredAt }));
    const { presentMinutes } = computePresence(own, window);
    const status = proposeStatus(presentMinutes, sessionMinutes);
    await tx
      .insert(attendanceRecords)
      .values({ organizationId: session.organizationId, sessionId, membershipId: e.membershipId, status, presentMinutes })
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.membershipId],
        set: { status, presentMinutes, updatedAt: new Date() },
      });
    proposed += 1;
  }
  return { proposed, keptConfirmed: confirmed.size };
}

/** Eine Lehrkraft des Kurses bestätigt Vorschläge. Erst danach gilt die Anwesenheit. */
export async function confirmAttendance(tx: Tx, actorMembershipId: string, recordIds: string[]): Promise<number> {
  if (recordIds.length === 0) return 0;
  const records = await tx.select().from(attendanceRecords).where(inArray(attendanceRecords.id, recordIds));
  if (records.length !== new Set(recordIds).size) throw new Error("Anwesenheitseintrag nicht gefunden");
  const sessionIds = [...new Set(records.map((r) => r.sessionId))];
  for (const sessionId of sessionIds) {
    const session = await loadSession(tx, sessionId);
    await requireInCourse(tx, actorMembershipId, "attendance.review", session.courseId);
  }
  const now = new Date();
  const updated = await tx
    .update(attendanceRecords)
    .set({ reviewState: "CONFIRMED", confirmedByMembershipId: actorMembershipId, confirmedAt: now, updatedAt: now })
    .where(and(inArray(attendanceRecords.id, recordIds), eq(attendanceRecords.reviewState, "PROPOSED")))
    .returning({ id: attendanceRecords.id, organizationId: attendanceRecords.organizationId });
  if (updated.length > 0) {
    await tx.insert(auditEvents).values(
      updated.map((u) => ({
        organizationId: u.organizationId,
        actorMembershipId,
        action: "attendance.confirmed",
        entity: "attendance_record",
        entityId: u.id,
      })),
    );
  }
  return updated.length;
}

/**
 * Ändert die Bewertung. Vor der Bestätigung eine einfache Änderung durch die
 * Lehrkraft; danach eine Korrektur mit Pflichtbegründung, die dauerhaft
 * festgehalten wird.
 */
export async function changeAttendanceStatus(
  tx: Tx,
  actorMembershipId: string,
  recordId: string,
  toStatus: AttendanceStatus,
  reason?: string,
): Promise<"none" | "update" | "correction"> {
  const [record] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId));
  if (!record) throw new Error("Anwesenheitseintrag nicht gefunden");
  const session = await loadSession(tx, record.sessionId);
  const permission: Permission = record.reviewState === "CONFIRMED" ? "attendance.correct" : "attendance.review";
  await requireInCourse(tx, actorMembershipId, permission, session.courseId);

  const plan = planStatusChange(record, toStatus, reason);
  if (plan.kind === "none") return "none";

  await tx.update(attendanceRecords).set({ status: toStatus, updatedAt: new Date() }).where(eq(attendanceRecords.id, recordId));
  if (plan.kind === "correction") {
    await tx.insert(attendanceCorrections).values({
      organizationId: record.organizationId,
      attendanceRecordId: recordId,
      fromStatus: plan.fromStatus,
      toStatus: plan.toStatus,
      reason: plan.reason,
      actorMembershipId,
    });
    await tx.insert(auditEvents).values({
      organizationId: record.organizationId,
      actorMembershipId,
      action: "attendance.corrected",
      entity: "attendance_record",
      entityId: recordId,
      meta: { from: plan.fromStatus, to: plan.toStatus },
    });
  }
  return plan.kind;
}
