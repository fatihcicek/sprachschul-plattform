// E-Mail-Versand. Eine kleine Schnittstelle mit drei Wegen:
//   smtp   echter Versand (Produktion), Zugangsdaten nur aus Umgebungsvariablen
//   file   schreibt jede Mail als Textdatei nach .mail-outbox/ (Entwicklung, Testumgebung ohne Konto)
//   memory sammelt Mails im Speicher (Tests)
// Es gibt bewusst keinen stillen Ausweg: Ist in Produktion nichts eingerichtet, schlägt das Senden
// mit einer klaren Meldung fehl. Aufrufer dürfen dann nicht behaupten, eine Mail sei unterwegs.

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class MailError extends Error {}

const ADDRESS = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]{2,}$/;
const MAX_SUBJECT = 200;
const MAX_TEXT = 20_000;

/** Prüft eine Mail, bevor sie irgendwohin geht. Verhindert vor allem Kopfzeilen-Einschleusung per Zeilenumbruch. */
export function validateMail(mail: Mail): Mail {
  const to = (mail.to ?? "").trim();
  if (to.length > 254 || !ADDRESS.test(to)) throw new MailError("Ungültige Empfängeradresse.");
  if (/[\r\n]/.test(mail.subject ?? "")) throw new MailError("Der Betreff darf keinen Zeilenumbruch enthalten.");
  const subject = (mail.subject ?? "").trim();
  if (!subject || subject.length > MAX_SUBJECT) throw new MailError("Der Betreff fehlt oder ist zu lang.");
  const text = mail.text ?? "";
  if (!text.trim() || text.length > MAX_TEXT) throw new MailError("Der Text fehlt oder ist zu lang.");
  return { to, subject, text };
}

export type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

/** Liest die SMTP-Einstellungen. Gibt null zurück, wenn gar nichts gesetzt ist, und wirft, wenn sie unvollständig sind. */
export function smtpConfigFromEnv(env: Record<string, string | undefined>): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host && !env.SMTP_USER && !env.SMTP_PASS && !env.MAIL_FROM) return null;
  const port = Number(env.SMTP_PORT ?? "465");
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = env.MAIL_FROM?.trim();
  if (!host || !user || !pass || !from) throw new MailError("E-Mail-Versand ist unvollständig eingerichtet (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM).");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new MailError("SMTP_PORT ist keine gültige Portnummer.");
  if (!ADDRESS.test(from.replace(/^.*<(.+)>$/, "$1"))) throw new MailError("MAIL_FROM ist keine gültige Absenderadresse.");
  return { host, port, user, pass, from };
}

type Transporter = { sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown> };

export function smtpMailer(config: SmtpConfig, transporter?: Transporter): Mailer {
  // Port 465 spricht von Anfang an verschlüsselt, alle anderen Ports verlangen STARTTLS. Unverschlüsselt geht nie.
  const t: Transporter =
    transporter ??
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  return {
    async send(mail) {
      const m = validateMail(mail);
      try {
        await t.sendMail({ from: config.from, to: m.to, subject: m.subject, text: m.text });
      } catch {
        // Keine Details nach außen: Fehlermeldungen von Mailservern können Adressen und Zugangsdaten verraten.
        throw new MailError("Die E-Mail konnte nicht gesendet werden.");
      }
    },
  };
}

export function fileMailer(dir: string): Mailer {
  return {
    async send(mail) {
      const m = validateMail(mail);
      await mkdir(dir, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.txt`;
      await writeFile(path.join(dir, name), `An: ${m.to}\nBetreff: ${m.subject}\n\n${m.text}\n`, { mode: 0o600 });
    },
  };
}

export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(validateMail(mail));
    },
  };
}

/**
 * Wählt den Versandweg: SMTP, wenn eingerichtet. Sonst Datei, aber nur außerhalb der Produktion
 * oder wenn ausdrücklich MAIL_TRANSPORT=file gesetzt ist (Testumgebung mit erfundenen Daten).
 */
export function createMailer(env: Record<string, string | undefined> = process.env): Mailer {
  const smtp = smtpConfigFromEnv(env);
  if (smtp) return smtpMailer(smtp);
  if (env.MAIL_TRANSPORT === "file" || env.NODE_ENV !== "production") return fileMailer(env.MAIL_OUTBOX ?? path.join(process.cwd(), ".mail-outbox"));
  return {
    async send() {
      throw new MailError("E-Mail-Versand ist nicht eingerichtet.");
    },
  };
}
