// Aufgaben: stellen, bearbeiten, abgeben, Rückmeldung geben.
// Alle Funktionen erwarten eine Transaktion aus withOrganization().

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assignments, auditEvents, feedbacks, memberships, submissions, submissionVersions, users } from "@/db/schema";
import { assertCanEditDraft, assertCanReview, prepareSubmit, SubmissionRuleError } from "@/domain/submission";
import { loadActor, NotAllowedError, requireInCourse } from "@/server/actor";

export { NotAllowedError, SubmissionRuleError };

export async function createAssignment(
  tx: Tx,
  actorMembershipId: string,
  input: { courseId: string; title: string; instructions: string; dueAt?: Date | null },
) {
  const actor = await requireInCourse(tx, actorMembershipId, "assignment.manage", input.courseId);
  const title = input.title.trim();
  if (!title) throw new SubmissionRuleError("Die Aufgabe braucht einen Titel.");
  const [row] = await tx
    .insert(assignments)
    .values({
      organizationId: actor.organizationId,
      courseId: input.courseId,
      title,
      instructions: input.instructions.trim(),
      dueAt: input.dueAt ?? null,
      createdByMembershipId: actorMembershipId,
    })
    .returning();
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId, action: "assignment.created", entity: "assignment", entityId: row!.id });
  return row!;
}

async function loadAssignment(tx: Tx, assignmentId: string) {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId));
  if (!a) throw new Error("Aufgabe nicht gefunden");
  return a;
}

/** Aufgaben der eigenen Kurse mit dem eigenen Stand. */
export async function listForLearner(tx: Tx, actorMembershipId: string) {
  const actor = await loadActor(tx, actorMembershipId);
  if (actor.role !== "LEARNER" || actor.assignedCourseIds.length === 0) return [];
  const rows = await tx.select().from(assignments).where(inArray(assignments.courseId, [...actor.assignedCourseIds])).orderBy(asc(assignments.dueAt));
  const mine = await tx.select().from(submissions).where(eq(submissions.membershipId, actorMembershipId));
  return rows.map((a) => ({ assignment: a, status: mine.find((s) => s.assignmentId === a.id)?.status ?? ("DRAFT" as const) }));
}

/** Aufgabe mit eigenem Entwurf, Abgabeversionen und Rückmeldungen. */
export async function getForLearner(tx: Tx, actorMembershipId: string, assignmentId: string) {
  const assignment = await loadAssignment(tx, assignmentId);
  await requireInCourse(tx, actorMembershipId, "course.participate", assignment.courseId);
  const [submission] = await tx
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.membershipId, actorMembershipId)));
  const versions = submission ? await versionsWithFeedback(tx, submission.id) : [];
  return { assignment, submission: submission ?? null, versions };
}

async function versionsWithFeedback(tx: Tx, submissionId: string) {
  const rows = await tx.select().from(submissionVersions).where(eq(submissionVersions.submissionId, submissionId)).orderBy(desc(submissionVersions.versionNo));
  const fb = rows.length ? await tx.select().from(feedbacks).where(inArray(feedbacks.versionId, rows.map((r) => r.id))) : [];
  return rows.map((v) => ({ version: v, feedback: fb.find((f) => f.versionId === v.id) ?? null }));
}

async function ensureSubmission(tx: Tx, actorMembershipId: string, assignmentId: string) {
  const assignment = await loadAssignment(tx, assignmentId);
  const actor = await requireInCourse(tx, actorMembershipId, "course.participate", assignment.courseId);
  const [existing] = await tx
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.membershipId, actorMembershipId)));
  if (existing) return existing;
  const [created] = await tx
    .insert(submissions)
    .values({ organizationId: actor.organizationId, assignmentId, membershipId: actorMembershipId })
    .returning();
  return created!;
}

/** Speichert den Entwurf. Wird beim Tippen laufend aufgerufen. */
export async function saveDraft(tx: Tx, actorMembershipId: string, assignmentId: string, text: string) {
  const sub = await ensureSubmission(tx, actorMembershipId, assignmentId);
  assertCanEditDraft(sub.status);
  await tx.update(submissions).set({ draftText: text, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
  return { savedAt: new Date() };
}

/** Gibt den aktuellen Entwurf als neue, unveränderliche Version bei der Lehrkraft ab. */
export async function submitAssignment(tx: Tx, actorMembershipId: string, assignmentId: string, finalText?: string) {
  const sub = await ensureSubmission(tx, actorMembershipId, assignmentId);
  const text = prepareSubmit(sub.status, finalText ?? sub.draftText);
  const previous = await tx.select().from(submissionVersions).where(eq(submissionVersions.submissionId, sub.id));
  const versionNo = previous.length + 1;
  const [version] = await tx
    .insert(submissionVersions)
    .values({ organizationId: sub.organizationId, submissionId: sub.id, versionNo, text })
    .returning();
  await tx.update(submissions).set({ status: "SUBMITTED", draftText: text, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
  await tx.insert(auditEvents).values({ organizationId: sub.organizationId, actorMembershipId, action: "submission.submitted", entity: "submission", entityId: sub.id, meta: { versionNo } });
  return version!;
}

/** Abgaben zu den Aufgaben, die die Lehrkraft sehen darf. */
export async function listForTeacher(tx: Tx, actorMembershipId: string) {
  const actor = await loadActor(tx, actorMembershipId);
  if (!actor.active || (actor.role !== "TEACHER" && actor.role !== "ADMIN")) throw new NotAllowedError("assignment.review");
  const rows = await tx.select().from(assignments).orderBy(desc(assignments.createdAt));
  const visible = actor.role === "ADMIN" ? rows : rows.filter((a) => actor.assignedCourseIds.includes(a.courseId));
  const subs = visible.length ? await tx.select().from(submissions).where(inArray(submissions.assignmentId, visible.map((a) => a.id))) : [];
  return visible.map((a) => ({ assignment: a, submissions: subs.filter((s) => s.assignmentId === a.id) }));
}

export async function getForTeacher(tx: Tx, actorMembershipId: string, submissionId: string) {
  const [sub] = await tx.select().from(submissions).where(eq(submissions.id, submissionId));
  if (!sub) throw new Error("Abgabe nicht gefunden");
  const assignment = await loadAssignment(tx, sub.assignmentId);
  await requireInCourse(tx, actorMembershipId, "assignment.review", assignment.courseId);
  const [person] = await tx
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.id, sub.membershipId));
  return { assignment, submission: sub, learner: person!, versions: await versionsWithFeedback(tx, sub.id) };
}

/** Rückmeldung zur aktuellen Abgabe; danach kann die Person überarbeiten. */
export async function giveFeedback(tx: Tx, actorMembershipId: string, submissionId: string, comment: string) {
  const [sub] = await tx.select().from(submissions).where(eq(submissions.id, submissionId));
  if (!sub) throw new Error("Abgabe nicht gefunden");
  const assignment = await loadAssignment(tx, sub.assignmentId);
  const actor = await requireInCourse(tx, actorMembershipId, "assignment.review", assignment.courseId);
  const text = assertCanReview(sub.status, comment);
  const [latest] = await tx.select().from(submissionVersions).where(eq(submissionVersions.submissionId, sub.id)).orderBy(desc(submissionVersions.versionNo)).limit(1);
  if (!latest) throw new SubmissionRuleError("Es liegt keine Abgabe zur Rückmeldung vor.");
  const [fb] = await tx
    .insert(feedbacks)
    .values({ organizationId: actor.organizationId, versionId: latest.id, authorMembershipId: actorMembershipId, comment: text })
    .returning();
  await tx.update(submissions).set({ status: "RETURNED", updatedAt: new Date() }).where(eq(submissions.id, sub.id));
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId, action: "submission.returned", entity: "submission", entityId: sub.id, meta: { versionNo: latest.versionNo } });
  return fb!;
}
