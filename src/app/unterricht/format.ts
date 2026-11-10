// Anzeigeformate für den Unterricht (Zeiten in der Zeitzone der Schule).

const tz = "Europe/Berlin";
export const fmtDate = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
export const fmtShortDate = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: tz });
export const fmtTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
export const fmtTimeSec = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
export const fmtDateTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });

export const STATUS_DE = { PRESENT: "anwesend", PARTIAL: "teilweise anwesend", ABSENT: "abwesend", EXCUSED: "entschuldigt" } as const;
export const MODE_DE = { VIRTUAL: "online", PRESENCE: "Präsenz" } as const;
