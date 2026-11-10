// Zustände einer Abgabe. Reine Regeln ohne Datenbank, damit sie einzeln prüfbar sind.
//
//   DRAFT ──abgeben──▶ SUBMITTED ──Rückmeldung──▶ RETURNED ──erneut abgeben──▶ SUBMITTED …
//
// Entwurf und Rückgabe sind bearbeitbar; liegt die Abgabe bei der Lehrkraft,
// ist sie gesperrt, damit der Text während des Lesens nicht wechselt.

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "RETURNED";

export class SubmissionRuleError extends Error {}

export function canEditDraft(status: SubmissionStatus): boolean {
  return status === "DRAFT" || status === "RETURNED";
}

export function assertCanEditDraft(status: SubmissionStatus): void {
  if (!canEditDraft(status)) throw new SubmissionRuleError("Die Abgabe liegt bei der Lehrkraft und kann nicht geändert werden.");
}

/** Prüft eine Abgabe und liefert den Text, der als neue Version gespeichert wird. */
export function prepareSubmit(status: SubmissionStatus, draftText: string): string {
  assertCanEditDraft(status);
  const text = draftText.trim();
  if (text.length === 0) throw new SubmissionRuleError("Ein leerer Text kann nicht abgegeben werden.");
  return text;
}

export function assertCanReview(status: SubmissionStatus, comment: string): string {
  if (status !== "SUBMITTED") throw new SubmissionRuleError("Es liegt keine Abgabe zur Rückmeldung vor.");
  const trimmed = comment.trim();
  if (trimmed.length === 0) throw new SubmissionRuleError("Die Rückmeldung darf nicht leer sein.");
  return trimmed;
}

export function isLate(dueAt: Date | null, submittedAt: Date): boolean {
  return dueAt !== null && submittedAt.getTime() > dueAt.getTime();
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}
