// Kursplanung: aus einem Wochenmuster (gleiche Tage, gleiche Uhrzeit) alle
// Termine erzeugen und prüfen. Reine Regeln ohne Datenbank; läuft auch im
// Browser für die Vorschau.

import { findVirtualUeViolations, SCHOOL_TIME_ZONE, UE_MINUTES, validateSession } from "./schedule";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Montag … 7 = Sonntag

export const WEEKDAY_LABELS: Record<Weekday, string> = { 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr", 6: "Sa", 7: "So" };

export type WeeklyPlan = {
  startDate: string; // JJJJ-MM-TT
  endDate: string;
  weekdays: Weekday[];
  startTime: string; // HH:MM, Ortszeit der Schule
  endTime: string;
  ue: number; // Unterrichtseinheiten je Termin
  mode: "PRESENCE" | "VIRTUAL";
};

export type PlannedDate = { day: string; startsAt: Date; endsAt: Date };

/** Höchstzahl Termine je Kurs; schützt vor versehentlich riesigen Zeiträumen. */
export const MAX_SESSIONS = 400;
/** Längster erlaubter Kurszeitraum in Tagen (etwa drei Jahre). */
export const MAX_SPAN_DAYS = 3 * 366;

/** Echtes Kalenderdatum im Format JJJJ-MM-TT (kein 30. Februar). */
export function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function weekdayOf(day: string): Weekday {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (d === 0 ? 7 : d) as Weekday;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Abstand der Zeitzone zu UTC in Minuten zu einem Zeitpunkt (Sommerzeit beachtet). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Ortszeit der Schule (Tag + HH:MM) als Zeitpunkt. */
export function localTimeToDate(day: string, time: string, timeZone: string = SCHOOL_TIME_ZONE): Date {
  const [h, m] = time.split(":").map(Number);
  const naive = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m);
  let result = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  result = naive - offsetMinutes(new Date(result), timeZone) * 60_000; // zweiter Schritt für den Tag der Zeitumstellung
  return new Date(result);
}

/** Prüft das Wochenmuster. Liefert Fehler (blockieren) und Hinweise (nur anzeigen). */
export function checkPlan(plan: WeeklyPlan, options: { bamf?: boolean } = { bamf: true }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isCalendarDay(plan.startDate) || !isCalendarDay(plan.endDate)) errors.push("Bitte Beginn und Ende des Kurses angeben.");
  else if (plan.endDate < plan.startDate) errors.push("Das Kursende liegt vor dem Kursbeginn.");
  else if (spanDays(plan.startDate, plan.endDate) > MAX_SPAN_DAYS) errors.push("Ein Kurs kann höchstens drei Jahre dauern.");
  if (plan.weekdays.length === 0) errors.push("Bitte mindestens einen Unterrichtstag wählen.");
  else if (plan.weekdays.some((w) => !Number.isInteger(w) || w < 1 || w > 7)) errors.push("Ungültiger Wochentag.");
  if (!TIME.test(plan.startTime) || !TIME.test(plan.endTime)) errors.push("Bitte Uhrzeiten im Format HH:MM angeben.");
  if (errors.length) return { errors, warnings };

  const sample = { startsAt: localTimeToDate(plan.startDate, plan.startTime), endsAt: localTimeToDate(plan.startDate, plan.endTime), plannedUe: plan.ue, mode: plan.mode };
  errors.push(...validateSession(sample));
  if (errors.length) return { errors, warnings };

  const dates = expandPlan(plan, []);
  if (dates.length === 0) errors.push("Im gewählten Zeitraum liegt kein Unterrichtstag.");
  if (dates.length > MAX_SESSIONS) errors.push(`Das wären ${dates.length} Termine; höchstens ${MAX_SESSIONS} sind möglich.`);

  if (plan.mode === "VIRTUAL" && options.bamf) {
    const violations = findVirtualUeViolations(dates.map((d, i) => ({ id: String(i), startsAt: d.startsAt, endsAt: d.endsAt, plannedUe: plan.ue, mode: "VIRTUAL" })));
    if (violations.length)
      warnings.push(
        `${plan.ue} UE pro Tag im Onlineunterricht: Für Berufssprachkurse gelten meist höchstens ${violations[0]!.allowedUe} UE pro Tag (Regel noch nicht abschließend geprüft, Ausnahmen z. B. für akademische Heilberufe).`,
      );
  }
  const pause = (sample.endsAt.getTime() - sample.startsAt.getTime()) / 60_000 - plan.ue * UE_MINUTES;
  if (pause > 90) warnings.push(`Pro Termin bleiben ${pause} Minuten ohne Unterrichtseinheit.`);
  return { errors, warnings };
}

/** Alle Termine des Musters, ohne die ausgenommenen Tage. Setzt ein gültiges Muster voraus. */
export function expandPlan(plan: WeeklyPlan, excludedDays: readonly string[]): PlannedDate[] {
  const excluded = new Set(excludedDays);
  const out: PlannedDate[] = [];
  // Begrenzt durch die Zahl der Tage, nicht nur durch gefundene Termine: so endet
  // die Schleife auch bei ungültigen Eingaben sicher.
  const days = Math.min(spanDays(plan.startDate, plan.endDate), MAX_SPAN_DAYS);
  for (let i = 0, day = plan.startDate; i <= days && out.length <= MAX_SESSIONS; i++, day = addDays(day, 1)) {
    if (!plan.weekdays.includes(weekdayOf(day)) || excluded.has(day)) continue;
    out.push({ day, startsAt: localTimeToDate(day, plan.startTime), endsAt: localTimeToDate(day, plan.endTime) });
  }
  return out;
}

/** Vorlagen für die Kursart; frei überschreibbar. */
export const COURSE_TYPE_SUGGESTIONS = [
  "Integrationskurs",
  "Integrationskurs mit Alphabetisierung",
  "Berufssprachkurs B1",
  "Berufssprachkurs B2",
  "Berufssprachkurs C1",
  "Berufssprachkurs Akademische Heilberufe",
  "Fachsprachkurs",
  "Prüfungsvorbereitung",
];
