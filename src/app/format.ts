import type { SubmissionStatus } from "@/domain/submission";

export const STATUS_LABEL: Record<SubmissionStatus, string> = { DRAFT: "Entwurf", SUBMITTED: "Abgegeben", RETURNED: "Rückmeldung da" };

const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export const formatDue = (d: Date | null) => (d ? `Fällig: ${fmt.format(d)}` : "Ohne Frist");
export const formatTime = (d: Date) => fmt.format(d);
