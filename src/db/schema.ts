// Datenmodell der Sprachschul-Plattform.
//
// Grundregel: Jeder Datensatz, der einer Schule gehört, trägt organization_id.
// Verknüpfungen zwischen solchen Datensätzen laufen über (id, organization_id),
// damit die Datenbank selbst verhindert, dass Daten zweier Schulen vermischt
// werden. Welche Zeilen eine Verbindung überhaupt sehen darf, regelt zusätzlich
// die Zeilensicherheit in drizzle/0001_*.sql.

import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const role = pgEnum("role", ["ADMIN", "STAFF", "TEACHER", "LEARNER"]);
export const courseStatus = pgEnum("course_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const deliveryMode = pgEnum("delivery_mode", ["PRESENCE", "VIRTUAL"]);
// ENDED: Unterricht vorbei, Nachbereitung offen. CLOSED: Anwesenheit bestätigt, Klassenbuch eingetragen.
export const sessionStatus = pgEnum("session_status", ["PLANNED", "LIVE", "ENDED", "CLOSED"]);
export const connectionEventType = pgEnum("connection_event_type", ["JOIN", "LEAVE"]);
export const attendanceStatus = pgEnum("attendance_status", ["PRESENT", "PARTIAL", "ABSENT", "EXCUSED"]);
// PROPOSED: Vorschlag des Systems aus dem Einwahlprotokoll. CONFIRMED: von einer Lehrkraft bestätigt.
export const reviewState = pgEnum("review_state", ["PROPOSED", "CONFIRMED"]);

// DRAFT: Entwurf, nur für die Person selbst. SUBMITTED: bei der Lehrkraft, nicht mehr änderbar.
// RETURNED: Rückmeldung liegt vor; die Person kann überarbeiten und erneut abgeben.
export const submissionStatus = pgEnum("submission_status", ["DRAFT", "SUBMITTED", "RETURNED"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

const organizationId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" });

// Eine Person gehört genau einer Schule. Ist jemand an zwei Schulen, gibt es ihn
// zweimal – so kann keine Schule Daten einer Person der anderen sehen oder ändern.
export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: organizationId(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.organizationId, t.email), unique().on(t.id, t.organizationId)],
);

// Zugehörigkeit einer Person zu einer Schule mit genau einer Rolle.
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid("user_id").notNull(),
    role: role("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.organizationId, t.userId),
    unique().on(t.id, t.organizationId),
    foreignKey({ columns: [t.userId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    category: text("category").notNull(), // z. B. "BSK B2"; der Kursartenkatalog folgt später
    bamfFunded: boolean("bamf_funded").notNull().default(false),
    bamfCourseNumber: text("bamf_course_number"), // Kursnummer des BAMF, z. B. "2026-06552"
    mode: deliveryMode("mode").notNull().default("VIRTUAL"),
    status: courseStatus("status").notNull().default("DRAFT"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.id, t.organizationId), index().on(t.organizationId, t.status)],
);

// Teilnahme an einem Kurs. Wird nie gelöscht, sondern mit ends_on beendet.
export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    organizationId: organizationId(),
    courseId: uuid("course_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    bamfFunded: boolean("bamf_funded").notNull().default(false), // Teilnahme vom BAMF gefördert
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.courseId, t.membershipId),
    foreignKey({ columns: [t.courseId, t.organizationId], foreignColumns: [courses.id, courses.organizationId] }),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

export const teachingAssignments = pgTable(
  "teaching_assignments",
  {
    id: id(),
    organizationId: organizationId(),
    courseId: uuid("course_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.courseId, t.membershipId),
    foreignKey({ columns: [t.courseId, t.organizationId], foreignColumns: [courses.id, courses.organizationId] }),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Ein geplanter Unterrichtstermin: der Bezugspunkt für Einwahl, Anwesenheit und Klassenbuch.
export const lessonSessions = pgTable(
  "lesson_sessions",
  {
    id: id(),
    organizationId: organizationId(),
    courseId: uuid("course_id").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    plannedUe: integer("planned_ue").notNull(), // Unterrichtseinheiten à 45 Minuten, ohne Pausen
    mode: deliveryMode("mode").notNull(),
    status: sessionStatus("status").notNull().default("PLANNED"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.id, t.organizationId),
    index().on(t.organizationId, t.courseId, t.startsAt),
    foreignKey({ columns: [t.courseId, t.organizationId], foreignColumns: [courses.id, courses.organizationId] }),
  ],
);

// Rohdaten des Einwahlprotokolls. Nur vom System geschrieben; eine
// Datenbankregel verbietet Ändern und Löschen.
export const connectionEvents = pgTable(
  "connection_events",
  {
    id: id(),
    organizationId: organizationId(),
    sessionId: uuid("session_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    type: connectionEventType("type").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    source: text("source").notNull(), // Herkunft, z. B. "bbb" für die Konferenz
    dedupKey: text("dedup_key").notNull(), // verhindert Dopplungen bei wiederholter Zustellung
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.dedupKey),
    index().on(t.sessionId, t.membershipId, t.occurredAt),
    foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [lessonSessions.id, lessonSessions.organizationId] }),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Bewertete Anwesenheit einer Person in einem Termin, getrennt von den Rohdaten.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    organizationId: organizationId(),
    sessionId: uuid("session_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    status: attendanceStatus("status").notNull(),
    presentMinutes: integer("present_minutes").notNull(),
    reviewState: reviewState("review_state").notNull().default("PROPOSED"),
    // true, sobald ein Mensch den Vorschlag geändert hat: eine Neuberechnung überschreibt ihn dann nicht mehr.
    manual: boolean("manual").notNull().default(false),
    confirmedByMembershipId: uuid("confirmed_by_membership_id"),
    confirmedAt: ts("confirmed_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.sessionId, t.membershipId),
    unique().on(t.id, t.organizationId),
    foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [lessonSessions.id, lessonSessions.organizationId] }),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
    foreignKey({ columns: [t.confirmedByMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Jede Änderung nach der Bestätigung: wer, wann, von was auf was, warum. Unveränderlich.
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: id(),
    organizationId: organizationId(),
    attendanceRecordId: uuid("attendance_record_id").notNull(),
    fromStatus: attendanceStatus("from_status").notNull(),
    toStatus: attendanceStatus("to_status").notNull(),
    reason: text("reason").notNull(),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.organizationId, t.attendanceRecordId),
    foreignKey({ columns: [t.attendanceRecordId, t.organizationId], foreignColumns: [attendanceRecords.id, attendanceRecords.organizationId] }),
    foreignKey({ columns: [t.actorMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

export const classRegisterEntries = pgTable(
  "class_register_entries",
  {
    id: id(),
    organizationId: organizationId(),
    sessionId: uuid("session_id").notNull().unique(),
    content: text("content").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [lessonSessions.id, lessonSessions.organizationId] }),
    foreignKey({ columns: [t.authorMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Protokoll wichtiger Vorgänge. Wie das Einwahlprotokoll unveränderlich.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: organizationId(),
    actorMembershipId: uuid("actor_membership_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.organizationId, t.entity, t.entityId),
    foreignKey({ columns: [t.actorMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Eine Aufgabe, die eine Lehrkraft einem Kurs stellt.
export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    organizationId: organizationId(),
    courseId: uuid("course_id").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    dueAt: ts("due_at"),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.id, t.organizationId),
    index().on(t.organizationId, t.courseId),
    foreignKey({ columns: [t.courseId, t.organizationId], foreignColumns: [courses.id, courses.organizationId] }),
    foreignKey({ columns: [t.createdByMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Die Bearbeitung einer Aufgabe durch eine Person: aktueller Entwurf und Stand.
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    organizationId: organizationId(),
    assignmentId: uuid("assignment_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    status: submissionStatus("status").notNull().default("DRAFT"),
    draftText: text("draft_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.assignmentId, t.membershipId),
    unique().on(t.id, t.organizationId),
    foreignKey({ columns: [t.assignmentId, t.organizationId], foreignColumns: [assignments.id, assignments.organizationId] }),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Jede Abgabe ist eine eigene, unveränderliche Version.
export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: id(),
    organizationId: organizationId(),
    submissionId: uuid("submission_id").notNull(),
    versionNo: integer("version_no").notNull(),
    text: text("text").notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.submissionId, t.versionNo),
    unique().on(t.id, t.organizationId),
    foreignKey({ columns: [t.submissionId, t.organizationId], foreignColumns: [submissions.id, submissions.organizationId] }),
  ],
);

// Rückmeldung der Lehrkraft zu genau einer Version. Unveränderlich.
export const feedbacks = pgTable(
  "feedbacks",
  {
    id: id(),
    organizationId: organizationId(),
    versionId: uuid("version_id").notNull().unique(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    comment: text("comment").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.versionId, t.organizationId], foreignColumns: [submissionVersions.id, submissionVersions.organizationId] }),
    foreignKey({ columns: [t.authorMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Passwort einer Person (nur der Hash, nie das Passwort). Eine Person hat höchstens eins.
export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    organizationId: organizationId(),
    membershipId: uuid("membership_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] })],
);

// Einladungslink zum Passwort-Setzen. Gespeichert wird nur der Hash des Links;
// der Link selbst wird einmal angezeigt. Einmalig verwendbar und befristet.
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: organizationId(),
    membershipId: uuid("membership_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.organizationId, t.tokenHash),
    index().on(t.organizationId, t.membershipId),
    foreignKey({ columns: [t.membershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
    foreignKey({ columns: [t.createdByMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);

// Anmeldeversuche für die Begrenzung gegen systematisches Raten.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    organizationId: organizationId(),
    emailKey: text("email_key").notNull(),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: ts("attempted_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.organizationId, t.emailKey, t.attemptedAt), index().on(t.organizationId, t.attemptedAt)],
);

// Jede gespeicherte Fassung des Klassenbucheintrags. Nur ergänzend, nie geändert (Datenbank-Trigger).
export const classRegisterVersions = pgTable(
  "class_register_versions",
  {
    id: id(),
    organizationId: organizationId(),
    sessionId: uuid("session_id").notNull(),
    content: text("content").notNull(),
    authorMembershipId: uuid("author_membership_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.organizationId, t.sessionId, t.createdAt),
    foreignKey({ columns: [t.sessionId, t.organizationId], foreignColumns: [lessonSessions.id, lessonSessions.organizationId] }),
    foreignKey({ columns: [t.authorMembershipId, t.organizationId], foreignColumns: [memberships.id, memberships.organizationId] }),
  ],
);
