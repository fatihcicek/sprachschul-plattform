// Rechte je Rolle. Diese Tabelle ist die eine Stelle, an der steht, wer was darf.
// Jede Serveraktion prüft hier; die Oberfläche blendet nur aus, sie schützt nicht.

export type Role = "ADMIN" | "STAFF" | "TEACHER" | "LEARNER";

export const PERMISSIONS = [
  "organization.manage", // Einstellungen der Schule, Rollen vergeben
  "course.configure", // Kurse anlegen, ändern, archivieren
  "enrollment.manage", // Teilnehmende und Lehrkräfte Kursen zuordnen
  "session.schedule", // Termine planen
  "session.teach", // Unterricht leiten, Material zeigen
  "attendance.review", // Anwesenheitsvorschläge bestätigen
  "attendance.correct", // bestätigte Anwesenheit mit Begründung korrigieren
  "register.write", // Klassenbuch eintragen
  "evidence.export", // Nachweise erzeugen
  "assignment.manage", // Aufgaben stellen
  "assignment.review", // Abgaben lesen und Rückmeldung geben
  "course.participate", // am Unterricht teilnehmen, Aufgaben abgeben
  "account.invite", // Einladungslink zum Passwort-Setzen erzeugen (auch zum Zurücksetzen)
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: ALL.filter((p) => p !== "course.participate"),
  STAFF: ["course.configure", "enrollment.manage", "session.schedule", "attendance.correct", "evidence.export", "account.invite"],
  // Lehrkräfte ändern weder Kursdaten noch die Kurszuordnung (bei Seconos war beides sichtbar).
  TEACHER: ["session.teach", "attendance.review", "attendance.correct", "register.write", "assignment.manage", "assignment.review"],
  LEARNER: ["course.participate"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

/** Rechte, die nur für Kurse gelten, denen die Lehrkraft zugeordnet ist. */
const COURSE_BOUND: readonly Permission[] = ["session.teach", "attendance.review", "attendance.correct", "register.write", "assignment.manage", "assignment.review"];

export type Actor = { role: Role; active: boolean; assignedCourseIds: readonly string[] };

/** Volle Prüfung für eine Aktion in einem bestimmten Kurs. */
export function canInCourse(actor: Actor, permission: Permission, courseId: string): boolean {
  if (!actor.active || !can(actor.role, permission)) return false;
  if (actor.role === "TEACHER" && COURSE_BOUND.includes(permission)) return actor.assignedCourseIds.includes(courseId);
  if (actor.role === "LEARNER") return actor.assignedCourseIds.includes(courseId);
  return true;
}

/**
 * Wessen Zugang darf jemand einrichten oder zurücksetzen? Die Leitung bei allen,
 * die Verwaltung nur bei Teilnehmenden. Die Verwaltung sieht den Link selbst; bei
 * Lehrkräften könnte sie sich damit deren Rechte (Klassenbuch, Anwesenheit,
 * Rückmeldungen) aneignen, bei Leitung und Verwaltung noch mehr.
 */
export function canManageAccountOf(actorRole: Role, targetRole: Role): boolean {
  if (!can(actorRole, "account.invite")) return false;
  if (actorRole === "ADMIN") return true;
  return targetRole === "LEARNER";
}

// ---- Zustand der Schule: Testzeit, Freischaltung, Sperre ----

export type OrganizationStatus = "TRIAL" | "ACTIVE" | "SUSPENDED";

/**
 * FULL: alles wie gewohnt. READ_ONLY: abgelaufene Testzeit, Daten bleiben sichtbar, nichts Neues.
 * BLOCKED: gesperrt, niemand kommt hinein.
 */
export type AccessMode = "FULL" | "READ_ONLY" | "BLOCKED";
export type OrganizationAccess = {
  mode: AccessMode;
  /** Volle Resttage der Testzeit (letzter Tag = 1), sonst null. */
  trialDaysLeft: number | null;
  /** Ende der Testzeit, solange die Schule im Teststatus ist. */
  trialEndsAt: Date | null;
};

const DAY_MS = 86_400_000;

/**
 * Die eine Stelle, die über Testzeit und Sperre entscheidet. Die Testzeit gilt bis einschließlich
 * trialEndsAt; ab der nächsten Millisekunde ist die Schule schreibgeschützt. Fehlt bei TRIAL das
 * Ende (darf die Datenbank nicht zulassen), gilt vorsichtshalber schreibgeschützt.
 */
export function organizationAccess(org: { status: OrganizationStatus; trialEndsAt: Date | null }, now: Date): OrganizationAccess {
  if (org.status === "SUSPENDED") return { mode: "BLOCKED", trialDaysLeft: null, trialEndsAt: null };
  if (org.status === "ACTIVE") return { mode: "FULL", trialDaysLeft: null, trialEndsAt: null };
  if (!org.trialEndsAt) return { mode: "READ_ONLY", trialDaysLeft: 0, trialEndsAt: null };
  const left = org.trialEndsAt.getTime() - now.getTime();
  if (left < 0) return { mode: "READ_ONLY", trialDaysLeft: 0, trialEndsAt: org.trialEndsAt };
  return { mode: "FULL", trialDaysLeft: Math.max(1, Math.ceil(left / DAY_MS)), trialEndsAt: org.trialEndsAt };
}

/** Darf in dieser Schule etwas geändert werden? */
export const canWriteInOrganization = (access: OrganizationAccess): boolean => access.mode === "FULL";

/**
 * Darf das Einwahlprotokoll (BAMF-Nachweis) ausgegeben werden? Mit BAMF-Funktionen der Schule ja; ohne sie nur für Kurse,
 * die schon BAMF-Bezug haben. Der Nachweis eines geführten BAMF-Kurses muss auch nach dem Ausschalten abrufbar bleiben
 * (Aufbewahrungspflicht), sonst ließe sich ein Nachweis durch Umschalten wegklicken.
 */
export const evidenceAvailable = (schoolBamf: boolean, course: { bamfCourseNumber: string | null; bamfFunded: boolean }): boolean =>
  schoolBamf || Boolean(course.bamfCourseNumber) || course.bamfFunded;

/** Prüft die Option so, dass nur ausdrückliches false die BAMF-Hinweise abschaltet. */
export const bamfHintsOn = (options: { bamf?: boolean } | undefined): boolean => options?.bamf !== false;
