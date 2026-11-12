// Anzeigeregeln für Kurse, ohne Datenbank.

/** Unterzeile in der Kursliste. Die BAMF-Kursnummer erscheint nur, wenn die Schule BAMF-Funktionen eingeschaltet hat. */
export function courseListMeta(c: { category: string; bamfCourseNumber: string | null; mode: "PRESENCE" | "VIRTUAL" }, bamfEnabled: boolean): string {
  return [c.category, bamfEnabled && c.bamfCourseNumber ? `BAMF ${c.bamfCourseNumber}` : null, c.mode === "VIRTUAL" ? "online" : "Präsenz"].filter(Boolean).join(" · ");
}
