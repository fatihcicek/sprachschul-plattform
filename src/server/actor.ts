// Wer handelt? Lädt Rolle und Kurszuordnung und prüft Rechte.

import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { enrollments, memberships, teachingAssignments } from "@/db/schema";
import { canInCourse, type Actor, type Permission } from "@/domain/permissions";

export class NotAllowedError extends Error {
  constructor(permission: Permission) {
    super(`Keine Berechtigung: ${permission}`);
  }
}

export async function loadActor(tx: Tx, membershipId: string): Promise<Actor & { organizationId: string; membershipId: string }> {
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!m) throw new Error("Unbekanntes Konto");
  const assigned =
    m.role === "LEARNER"
      ? await tx.select({ courseId: enrollments.courseId }).from(enrollments).where(eq(enrollments.membershipId, m.id))
      : await tx
          .select({ courseId: teachingAssignments.courseId })
          .from(teachingAssignments)
          .where(eq(teachingAssignments.membershipId, m.id));
  return { role: m.role, active: m.active, assignedCourseIds: assigned.map((a) => a.courseId), organizationId: m.organizationId, membershipId: m.id };
}

export async function requireInCourse(tx: Tx, actorMembershipId: string, permission: Permission, courseId: string) {
  const actor = await loadActor(tx, actorMembershipId);
  if (!canInCourse(actor, permission, courseId)) throw new NotAllowedError(permission);
  return actor;
}
