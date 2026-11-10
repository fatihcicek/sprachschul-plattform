// Unterricht: Kursraum eines Termins mit Einwahlprotokoll, Anwesenheit und Klassenbuch.
// Alle Funktionen erwarten eine Transaktion aus withOrganization(). Rechte stehen
// in src/domain/permissions.ts und werden hier je Kurs geprüft.

import { and, asc, desc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  attendanceCorrections,
  attendanceRecords,
  auditEvents,
  classRegisterEntries,
  classRegisterVersions,
  connectionEvents,
  courses,
  enrollments,
  lessonSessions,
  memberships,
  organizations,
  users,
} from "@/db/schema";
import { computePresence, type AttendanceStatus, type Interval } from "@/domain/attendance";
import { canInCourse, evidenceAvailable, type Permission } from "@/domain/permissions";
import { loadBamfEnabled } from "@/server/features";
import { localDay } from "@/domain/schedule";
import { loadActor, NotAllowedError, requireInCourse } from "@/server/actor";
import { AttendanceRuleError, confirmAttendance, proposeAttendance } from "@/server/attendance";

export { NotAllowedError, AttendanceRuleError };
export class TeachingRuleError extends Error {}

export const REGISTER_MAX = 5000;

/** Wer den Kursraum eines Termins sehen darf: wer irgendetwas daran tun oder ausgeben darf. */
const VIEW: Permission[] = ["session.teach", "attendance.review", "attendance.correct", "register.write", "evidence.export"];

async function loadSession(tx: Tx, sessionId: string) {
  const [row] = await tx
    .select({ s: lessonSessions, c: courses })
    .from(lessonSessions)
    .innerJoin(courses, eq(courses.id, lessonSessions.courseId))
    .where(eq(lessonSessions.id, sessionId));
  if (!row) throw new TeachingRuleError("Termin nicht gefunden");
  return row;
}

async function requireView(tx: Tx, me: string, courseId: string) {
  const actor = await loadActor(tx, me);
  if (!VIEW.some((p) => canInCourse(actor, p, courseId))) throw new NotAllowedError("session.teach");
  return actor;
}

export type SessionListItem = { sessionId: string; courseName: string; startsAt: Date; endsAt: Date; status: "PLANNED" | "LIVE" | "ENDED" | "CLOSED"; mode: "PRESENCE" | "VIRTUAL" };

/** Termine der eigenen Kurse (Leitung und Verwaltung: aller Kurse): 30 Tage zurück, 14 Tage voraus; nicht abgeschlossene länger. */
export async function listMySessions(tx: Tx, me: string, now: Date = new Date()): Promise<SessionListItem[]> {
  const actor = await loadActor(tx, me);
  if (!actor.active || actor.role === "LEARNER") throw new NotAllowedError("session.teach");
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const until = new Date(now.getTime() + 14 * 86_400_000);
  const rows = await tx
    .select({ s: lessonSessions, name: courses.name })
    .from(lessonSessions)
    .innerJoin(courses, eq(courses.id, lessonSessions.courseId))
    .where(
      and(
        eq(courses.status, "ACTIVE"),
        lt(lessonSessions.startsAt, until),
        // Letzte 30 Tage; nicht abgeschlossene Termine bleiben bis zu einem Jahr zurück sichtbar.
        or(gte(lessonSessions.startsAt, from), and(ne(lessonSessions.status, "CLOSED"), gte(lessonSessions.startsAt, new Date(now.getTime() - 365 * 86_400_000)))),
      ),
    )
    .orderBy(asc(lessonSessions.startsAt));
  return rows
    .filter((r) => VIEW.some((p) => canInCourse(actor, p, r.s.courseId)))
    .map((r) => ({ sessionId: r.s.id, courseName: r.name, startsAt: r.s.startsAt, endsAt: r.s.endsAt, status: r.s.status, mode: r.s.mode }));
}

export type RoomLearner = {
  membershipId: string;
  name: string;
  recordId: string | null;
  status: AttendanceStatus | null;
  reviewState: "PROPOSED" | "CONFIRMED" | null;
  presentMinutes: number | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  intervals: Interval[];
  openEnded: boolean;
  events: { type: "JOIN" | "LEAVE"; at: Date }[];
  corrections: { fromStatus: AttendanceStatus; toStatus: AttendanceStatus; reason: string; by: string; at: Date }[];
};

export type Room = {
  schoolName: string;
  session: { id: string; startsAt: Date; endsAt: Date; plannedUe: number; mode: "PRESENCE" | "VIRTUAL"; status: "PLANNED" | "LIVE" | "ENDED" | "CLOSED" };
  course: { id: string; name: string; category: string; bamfCourseNumber: string | null };
  learners: RoomLearner[];
  register: { content: string; updatedAt: Date; author: string } | null;
  over: boolean;
  can: { review: boolean; correct: boolean; write: boolean; export: boolean };
};

export async function loadRoom(tx: Tx, me: string, sessionId: string, now: Date = new Date()): Promise<Room> {
  const { s, c } = await loadSession(tx, sessionId);
  const actor = await requireView(tx, me, c.id);
  const day = localDay(s.startsAt);

  const enrolled = await tx
    .select({ membershipId: enrollments.membershipId, startsOn: enrollments.startsOn, endsOn: enrollments.endsOn, active: memberships.active })
    .from(enrollments)
    .innerJoin(memberships, eq(memberships.id, enrollments.membershipId))
    .where(eq(enrollments.courseId, c.id));
  const inCourse = new Set(enrolled.filter((e) => e.active && e.startsOn <= day && (e.endsOn === null || e.endsOn >= day)).map((e) => e.membershipId));

  const people = await tx.select({ id: memberships.id, f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId));
  const nameOf = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p ? `${p.f} ${p.l}` : "Unbekannt";
  };
  const records = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, s.id));
  // Wer einen Datensatz hat (z. B. bestätigt, später deaktiviert), bleibt im Protokoll sichtbar.
  const present = [...new Set([...inCourse, ...records.map((r) => r.membershipId)])].map((membershipId) => ({ membershipId }));
  const events = await tx.select().from(connectionEvents).where(eq(connectionEvents.sessionId, s.id)).orderBy(asc(connectionEvents.occurredAt));
  const recordIds = records.map((r) => r.id);
  const corrections = recordIds.length ? await tx.select().from(attendanceCorrections).where(inArray(attendanceCorrections.attendanceRecordId, recordIds)).orderBy(asc(attendanceCorrections.createdAt)) : [];
  const [reg] = await tx.select().from(classRegisterEntries).where(eq(classRegisterEntries.sessionId, s.id));
  const [org] = await tx.select({ name: organizations.name, bamf: organizations.bamfEnabled }).from(organizations).where(eq(organizations.id, actor.organizationId));

  const learners: RoomLearner[] = present
    .map((e) => {
      const rec = records.find((r) => r.membershipId === e.membershipId);
      const own = events.filter((ev) => ev.membershipId === e.membershipId).map((ev) => ({ type: ev.type, at: ev.occurredAt }));
      const p = computePresence(own, { start: s.startsAt, end: s.endsAt });
      return {
        membershipId: e.membershipId,
        name: nameOf(e.membershipId),
        recordId: rec?.id ?? null,
        status: rec?.status ?? null,
        reviewState: rec?.reviewState ?? null,
        presentMinutes: rec?.presentMinutes ?? null,
        confirmedBy: rec?.confirmedByMembershipId ? nameOf(rec.confirmedByMembershipId) : null,
        confirmedAt: rec?.confirmedAt ?? null,
        intervals: p.intervals,
        openEnded: p.openEnded,
        events: own,
        corrections: corrections
          .filter((k) => k.attendanceRecordId === rec?.id)
          .map((k) => ({ fromStatus: k.fromStatus, toStatus: k.toStatus, reason: k.reason, by: nameOf(k.actorMembershipId), at: k.createdAt })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return {
    schoolName: org?.name ?? "",
    session: { id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, plannedUe: s.plannedUe, mode: s.mode, status: s.status },
    course: { id: c.id, name: c.name, category: c.category, bamfCourseNumber: c.bamfCourseNumber },
    learners,
    register: reg ? { content: reg.content, updatedAt: reg.updatedAt, author: nameOf(reg.authorMembershipId) } : null,
    over: now >= s.endsAt,
    can: {
      review: canInCourse(actor, "attendance.review", c.id),
      correct: canInCourse(actor, "attendance.correct", c.id),
      write: canInCourse(actor, "register.write", c.id),
      // Das Einwahlprotokoll ist ein BAMF-Nachweis: ohne BAMF-Funktionen nur noch für Kurse mit BAMF-Bezug.
      export: evidenceAvailable(org?.bamf ?? true, c) && (canInCourse(actor, "evidence.export", c.id) || canInCourse(actor, "attendance.review", c.id)),
    },
  };
}

/** Berechnet den Anwesenheitsvorschlag aus dem Einwahlprotokoll. Erst nach Terminbeginn. */
export async function proposeAsActor(tx: Tx, me: string, sessionId: string, now: Date = new Date()) {
  const { s, c } = await loadSession(tx, sessionId);
  await requireInCourse(tx, me, "attendance.review", c.id);
  if (now < s.startsAt) throw new TeachingRuleError("Der Termin hat noch nicht begonnen.");
  if (s.status === "CLOSED") throw new TeachingRuleError("Der Termin ist abgeschlossen.");
  return proposeAttendance(tx, sessionId);
}

/** Bestätigt alle noch offenen Vorschläge des Termins. Erst nach Terminende. */
export async function confirmAllAsActor(tx: Tx, me: string, sessionId: string, now: Date = new Date()): Promise<number> {
  const { s, c } = await loadSession(tx, sessionId);
  await requireInCourse(tx, me, "attendance.review", c.id);
  if (now < s.endsAt) throw new TeachingRuleError("Bestätigen ist erst nach Ende des Termins möglich.");
  if (s.status === "CLOSED") throw new TeachingRuleError("Der Termin ist abgeschlossen.");
  // Vorher neu berechnen, falls Einwahldaten verspätet eingetroffen sind (Handänderungen bleiben unberührt).
  await proposeAttendance(tx, sessionId);
  const open = await tx
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.reviewState, "PROPOSED")));
  return confirmAttendance(tx, me, open.map((r) => r.id));
}

/**
 * Schreibt oder ändert den Klassenbucheintrag. Jede Fassung bleibt als eigene Version erhalten.
 * `basis` ist der Stand (updatedAt), den die Person beim Öffnen gesehen hat: Hat inzwischen jemand
 * anders gespeichert, wird nicht still überschrieben. Nach Abschluss des Termins gesperrt.
 */
export async function saveRegister(tx: Tx, me: string, sessionId: string, contentRaw: string, now: Date = new Date(), basis: string | null = null): Promise<{ version: string }> {
  // Termin sperren: gleichzeitiges Abschließen und Speichern laufen nacheinander.
  const [locked] = await tx.select({ id: lessonSessions.id }).from(lessonSessions).where(eq(lessonSessions.id, sessionId)).for("update");
  if (!locked) throw new TeachingRuleError("Termin nicht gefunden");
  const { s, c } = await loadSession(tx, sessionId);
  const actor = await requireInCourse(tx, me, "register.write", c.id);
  if (now < s.startsAt) throw new TeachingRuleError("Der Termin hat noch nicht begonnen.");
  if (s.status === "CLOSED") throw new TeachingRuleError("Der Termin ist abgeschlossen. Das Klassenbuch ist gesperrt.");
  const content = contentRaw.trim();
  if (!content) throw new TeachingRuleError("Bitte trage ein, was im Unterricht behandelt wurde.");
  if (content.length > REGISTER_MAX) throw new TeachingRuleError(`Der Eintrag darf höchstens ${REGISTER_MAX} Zeichen haben.`);
  const [existing] = await tx.select().from(classRegisterEntries).where(eq(classRegisterEntries.sessionId, sessionId)).for("update");
  if (existing && existing.updatedAt.toISOString() !== basis) {
    throw new TeachingRuleError("Das Klassenbuch wurde inzwischen geändert (von dir in einem anderen Fenster oder von jemand anderem). Bitte lade die Seite neu.");
  }
  if (!existing && basis) throw new TeachingRuleError("Das Klassenbuch hat sich geändert. Bitte lade die Seite neu.");
  await tx
    .insert(classRegisterEntries)
    .values({ organizationId: actor.organizationId, sessionId, content, authorMembershipId: me, updatedAt: now })
    .onConflictDoUpdate({ target: classRegisterEntries.sessionId, set: { content, authorMembershipId: me, updatedAt: now } });
  await tx.insert(classRegisterVersions).values({ organizationId: actor.organizationId, sessionId, content, authorMembershipId: me, createdAt: now });
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: me,
    action: existing ? "register.changed" : "register.written",
    entity: "lesson_session",
    entityId: sessionId,
    meta: { length: content.length, previousLength: existing?.content.length ?? 0 },
  });
  return { version: now.toISOString() };
}

/** Schließt den Termin ab: alles bestätigt und Klassenbuch geführt. Danach nur noch Korrekturen mit Begründung. */
export async function closeSession(tx: Tx, me: string, sessionId: string, now: Date = new Date()) {
  await tx.select({ id: lessonSessions.id }).from(lessonSessions).where(eq(lessonSessions.id, sessionId)).for("update");
  const { s, c } = await loadSession(tx, sessionId);
  const actor = await requireInCourse(tx, me, "attendance.review", c.id);
  await requireInCourse(tx, me, "register.write", c.id);
  if (s.status === "CLOSED") return;
  if (now < s.endsAt) throw new TeachingRuleError("Der Termin läuft noch.");
  const room = await loadRoom(tx, me, sessionId, now);
  if (room.learners.some((l) => l.reviewState !== "CONFIRMED")) throw new TeachingRuleError("Es sind noch nicht alle Anwesenheiten bestätigt.");
  if (!room.register) throw new TeachingRuleError("Es fehlt noch der Klassenbucheintrag.");
  await tx.update(lessonSessions).set({ status: "CLOSED" }).where(eq(lessonSessions.id, sessionId));
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: me, action: "session.closed", entity: "lesson_session", entityId: sessionId });
}

/** Protokolliert die Ausgabe des Einwahlprotokolls (Nachweis). Wiederholte Aufrufe innerhalb einer Minute zählen einmal. */
export async function recordExport(tx: Tx, me: string, sessionId: string, meta: { confirmed: number; unconfirmed: number }, now: Date = new Date()) {
  const { c } = await loadSession(tx, sessionId);
  const actor = await loadActor(tx, me);
  if (!(canInCourse(actor, "evidence.export", c.id) || canInCourse(actor, "attendance.review", c.id))) throw new NotAllowedError("evidence.export");
  if (!evidenceAvailable(await loadBamfEnabled(tx), c)) throw new NotAllowedError("evidence.export");
  const [recent] = await tx
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, "evidence.exported"), eq(auditEvents.entityId, sessionId), eq(auditEvents.actorMembershipId, me), gte(auditEvents.createdAt, new Date(now.getTime() - 60_000))))
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  if (recent) return;
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: me, action: "evidence.exported", entity: "lesson_session", entityId: sessionId, meta, createdAt: now });
}
