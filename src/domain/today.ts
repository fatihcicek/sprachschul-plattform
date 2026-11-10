// Was heute ansteht: reine Regeln ohne Datenbank, damit sie leicht zu testen sind.

export type TodaySession = { id: string; startsAt: Date; endsAt: Date };

export type SessionPhase = "UPCOMING" | "RUNNING" | "OVER";

export function phaseOf(s: TodaySession, now: Date): SessionPhase {
  if (now < s.startsAt) return "UPCOMING";
  if (now < s.endsAt) return "RUNNING";
  return "OVER";
}

/** Wie weit zurück offene Punkte gezeigt werden. Ältere Termine gehören in die Auswertung, nicht auf die Startseite. */
export const LOOKBACK_DAYS = 60;

export type SessionCounts = { enrolled: number; confirmed: number };

/**
 * Anwesenheit eines vergangenen Termins gilt als offen, solange nicht jede
 * eingeschriebene Person bestätigt ist (auch wenn noch gar kein Vorschlag
 * existiert, z. B. weil das Einwahlprotokoll fehlt).
 */
export function attendanceIsOpen(c: SessionCounts): boolean {
  if (c.enrolled === 0) return false;
  return c.confirmed < c.enrolled;
}
