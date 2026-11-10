// Terminplanung: Unterrichtseinheiten und Tagesgrenzen im virtuellen Klassenzimmer.

export const UE_MINUTES = 45;
export const SCHOOL_TIME_ZONE = "Europe/Berlin";

export type PlannedSession = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  plannedUe: number;
  mode: "PRESENCE" | "VIRTUAL";
};

/** Prüft, ob die geplanten UE in den Termin passen (Pausen dürfen übrig bleiben). */
export function validateSession(s: Omit<PlannedSession, "id">): string[] {
  const problems: string[] = [];
  const minutes = (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000;
  if (minutes <= 0) problems.push("Das Ende liegt nicht nach dem Beginn.");
  if (!Number.isInteger(s.plannedUe) || s.plannedUe <= 0) problems.push("Die Anzahl der UE muss eine positive ganze Zahl sein.");
  else if (minutes > 0 && s.plannedUe * UE_MINUTES > minutes)
    problems.push(`${s.plannedUe} UE brauchen ${s.plannedUe * UE_MINUTES} Minuten, der Termin hat nur ${Math.round(minutes)}.`);
  return problems;
}

export type VirtualUeRule = {
  maxUePerDay: number;
  /** Höhere Grenze, wenn in der Woche nur an einem Tag virtuell unterrichtet wird. */
  maxUePerDayIfSingleVirtualDayInWeek: number;
  source: string;
  /** false, solange die Regel nicht gegen die aktuell gültige BAMF-Fassung geprüft ist. */
  verified: boolean;
};

/**
 * Berufssprachkurse: höchstens 4 UE pro Tag im virtuellen Klassenzimmer, bei
 * nur einem virtuellen Kurstag pro Woche 5 UE. Stand der Quelle ist 2022;
 * Ausnahmen (z. B. akademische Heilberufe) sind hier noch nicht abgebildet.
 */
export const BSK_VIRTUAL_UE_RULE: VirtualUeRule = {
  maxUePerDay: 4,
  maxUePerDayIfSingleVirtualDayInWeek: 5,
  source: "Anlage 2 zum Trägerrundschreiben Berufssprachkurse 06/22",
  verified: false,
};

export type UeLimitViolation = { day: string; plannedUe: number; allowedUe: number; sessionIds: string[] };

/** Kalendertag (JJJJ-MM-TT) in der Zeitzone der Schule. */
export function localDay(at: Date, timeZone: string = SCHOOL_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Montag der Kalenderwoche, in der der Tag liegt. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** Findet Tage, an denen mehr virtuelle UE geplant sind als erlaubt. */
export function findVirtualUeViolations(
  sessions: PlannedSession[],
  rule: VirtualUeRule = BSK_VIRTUAL_UE_RULE,
  timeZone: string = SCHOOL_TIME_ZONE,
): UeLimitViolation[] {
  const byDay = new Map<string, { ue: number; ids: string[] }>();
  for (const s of sessions) {
    if (s.mode !== "VIRTUAL") continue;
    const day = localDay(s.startsAt, timeZone);
    const entry = byDay.get(day) ?? { ue: 0, ids: [] };
    entry.ue += s.plannedUe;
    entry.ids.push(s.id);
    byDay.set(day, entry);
  }

  const virtualDaysPerWeek = new Map<string, number>();
  for (const day of byDay.keys()) {
    const week = weekStart(day);
    virtualDaysPerWeek.set(week, (virtualDaysPerWeek.get(week) ?? 0) + 1);
  }

  const violations: UeLimitViolation[] = [];
  for (const [day, entry] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const single = virtualDaysPerWeek.get(weekStart(day)) === 1;
    const allowedUe = single ? rule.maxUePerDayIfSingleVirtualDayInWeek : rule.maxUePerDay;
    if (entry.ue > allowedUe) violations.push({ day, plannedUe: entry.ue, allowedUe, sessionIds: entry.ids });
  }
  return violations;
}
