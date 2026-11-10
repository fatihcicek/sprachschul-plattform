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

// Eine Person. Gehört keiner Schule; die Zugehörigkeit steht in memberships.
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: createdAt(),
});

// Zugehörigkeit einer Person zu einer Schule mit genau einer Rolle.
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: role("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.organizationId, t.userId), unique().on(t.id, t.organizationId)],
);

export const courses = pgTable(
  "courses",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    category: text("category").notNull(), // z. B. "BSK B2"; der Kursartenkatalog folgt später
    bamfFunded: boolean("bamf_funded").notNull().default(false),
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
