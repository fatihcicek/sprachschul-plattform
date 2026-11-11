// Anwesenheit aus dem Einwahlprotokoll berechnen.
//
// Das Protokoll (JOIN/LEAVE-Ereignisse) ist die unveränderliche Quelle. Daraus
// entsteht ein Vorschlag; gültig wird die Anwesenheit erst durch die Bestätigung
// einer Lehrkraft. Eine Einwahl allein ist nie eine bestätigte Anwesenheit.

export type ConnectionEvent = { type: "JOIN" | "LEAVE"; at: Date };
export type Interval = { start: Date; end: Date };
export type AttendanceStatus = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";

export type Presence = {
  intervals: Interval[];
  presentMinutes: number;
  /** Letzte Einwahl ohne Abmeldung: bis Terminende gezählt, sollte geprüft werden. */
  openEnded: boolean;
};

/**
 * Fasst Einwahlereignisse einer Person zu Anwesenheitszeiten innerhalb des
 * Termins zusammen. Parallele Einwahlen (zweites Gerät, Wiederverbindung vor
 * der Abmeldung) zählen nicht doppelt; Zeiten vor Beginn und nach Ende des
 * Termins zählen nicht.
 */
export function computePresence(events: ConnectionEvent[], session: Interval): Presence {
  // Bei gleichem Zeitpunkt zuerst JOIN, damit ein nahtloser Gerätewechsel keine Lücke reißt.
  const sorted = [...events].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || (a.type === b.type ? 0 : a.type === "JOIN" ? -1 : 1),
  );

  const raw: Interval[] = [];
  let depth = 0;
  let openedAt: Date | null = null;
  for (const e of sorted) {
    if (e.type === "JOIN") {
      if (depth === 0) openedAt = e.at;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && openedAt) {
        raw.push({ start: openedAt, end: e.at });
        openedAt = null;
      }
    }
    // Ein LEAVE ohne vorheriges JOIN wird ignoriert.
  }
  const openEnded = openedAt !== null && openedAt.getTime() < session.end.getTime();
  if (openedAt) raw.push({ start: openedAt, end: session.end });

  const intervals: Interval[] = [];
  for (const r of raw) {
    const start = new Date(Math.max(r.start.getTime(), session.start.getTime()));
    const end = new Date(Math.min(r.end.getTime(), session.end.getTime()));
    if (end.getTime() <= start.getTime()) continue;
    const last = intervals[intervals.length - 1];
    if (last && start.getTime() <= last.end.getTime()) {
      if (end.getTime() > last.end.getTime()) last.end = end;
    } else {
      intervals.push({ start, end });
    }
  }

  const ms = intervals.reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()), 0);
  return { intervals, presentMinutes: Math.floor(ms / 60_000), openEnded };
}

export type ProposalPolicy = {
  /** Ab diesem Anteil der Terminzeit lautet der Vorschlag "anwesend". */
  presentFromShare: number;
};

/**
 * VORLÄUFIG: Der Schwellenwert ist eine Arbeitsannahme und keine BAMF-Regel.
 * Wie Teilanwesenheit abrechnungsrelevant zu werten ist, muss mit einem Träger
 * geklärt werden (siehe docs/bamf-anforderungen.md, offene Punkte).
 */
export const DEFAULT_PROPOSAL_POLICY: ProposalPolicy = { presentFromShare: 0.85 };

/** Vorschlag für die Bewertung. EXCUSED vergibt nie das System, nur ein Mensch. */
export function proposeStatus(
  presentMinutes: number,
  sessionMinutes: number,
  policy: ProposalPolicy = DEFAULT_PROPOSAL_POLICY,
): Exclude<AttendanceStatus, "EXCUSED"> {
  if (sessionMinutes <= 0) throw new Error("Termin ohne Dauer");
  if (presentMinutes <= 0) return "ABSENT";
  return presentMinutes / sessionMinutes >= policy.presentFromShare ? "PRESENT" : "PARTIAL";
}

export type ReviewedRecord = {
  status: AttendanceStatus;
  reviewState: "PROPOSED" | "CONFIRMED";
};

export type StatusChange =
  | { kind: "none" }
  | { kind: "update" }
  | { kind: "correction"; fromStatus: AttendanceStatus; toStatus: AttendanceStatus; reason: string };

/**
 * Entscheidet, wie eine Statusänderung zu behandeln ist. Vor der Bestätigung
 * ist sie eine einfache Änderung. Danach ist sie eine Korrektur, die eine
 * Begründung braucht und mit Person und Zeit festgehalten wird.
 */
export function planStatusChange(record: ReviewedRecord, toStatus: AttendanceStatus, reason?: string): StatusChange {
  if (record.status === toStatus) return { kind: "none" };
  if (record.reviewState === "PROPOSED") return { kind: "update" };
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) throw new Error("Korrektur nach Bestätigung braucht eine Begründung");
  return { kind: "correction", fromStatus: record.status, toStatus, reason: trimmed };
}

export type TimelineSegment = { kind: "active" | "idle"; from: Date; to: Date; leftPct: number; widthPct: number };

/**
 * Zerlegt die Terminzeit in aufeinanderfolgende Abschnitte „eingewählt“ und „nicht eingewählt“
 * für die Zeitleiste im Einwahlprotokoll. Die Abschnitte füllen den ganzen Termin lückenlos aus.
 * Erwartet Zeiträume aus computePresence (sortiert, innerhalb des Termins, ohne Überlappung).
 */
export function timelineSegments(intervals: Interval[], session: Interval): TimelineSegment[] {
  const total = session.end.getTime() - session.start.getTime();
  if (total <= 0) return [];
  const out: TimelineSegment[] = [];
  const push = (kind: "active" | "idle", from: number, to: number) => {
    if (to <= from) return;
    out.push({ kind, from: new Date(from), to: new Date(to), leftPct: ((from - session.start.getTime()) / total) * 100, widthPct: ((to - from) / total) * 100 });
  };
  let cursor = session.start.getTime();
  for (const i of intervals) {
    push("idle", cursor, i.start.getTime());
    push("active", i.start.getTime(), i.end.getTime());
    cursor = i.end.getTime();
  }
  push("idle", cursor, session.end.getTime());
  return out;
}
