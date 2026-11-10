// Einstellungen der Selbstregistrierung aus der Umgebung. Bewusst standardmäßig GESCHLOSSEN:
// Erst wenn E-Mail-Versand und Rechtstexte stehen, setzt der Betreiber REGISTRATION_OPEN=1.

export const registrationOpen = (env: Record<string, string | undefined> = process.env): boolean => env.REGISTRATION_OPEN === "1";

/** Feste Basisadresse für Links in E-Mails (nie aus Anfrage-Kopfzeilen ableiten: die kann man fälschen). */
export function registrationBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.APP_URL?.trim().replace(/\/+$/, "");
  if (url) return /^https:\/\/[^\s/]+$|^http:\/\/localhost(:\d+)?$/.test(url) ? url : null;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? "http://localhost:3000" : null;
}

/**
 * Nur für die Testumgebung mit erfundenen Daten: Ist der Versand ausdrücklich auf „Datei“ gestellt und
 * REGISTRATION_SHOW_LINK=1 gesetzt, zeigt die Seite den Bestätigungslink selbst an, weil keine Mail rausgeht.
 * Das hebelt die E-Mail-Prüfung aus und darf nie in einer Umgebung mit echten Daten an sein.
 */
export const showLinkOnPage = (env: Record<string, string | undefined> = process.env): boolean =>
  env.MAIL_TRANSPORT === "file" && env.REGISTRATION_SHOW_LINK === "1" && !env.SMTP_HOST;
