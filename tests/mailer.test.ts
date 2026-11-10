import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import nodemailer from "nodemailer";
import { describe, expect, it, vi } from "vitest";
import { createMailer, fileMailer, MailError, memoryMailer, smtpConfigFromEnv, smtpMailer, validateMail } from "@/server/mailer";

const ok = { to: "leitung@beispielschule.test", subject: "Bitte bestätigen", text: "Hallo, hier ist dein Link." };

describe("validateMail", () => {
  it("lässt eine gültige Mail durch und schneidet Leerzeichen ab", () => {
    expect(validateMail({ ...ok, to: "  leitung@beispielschule.test " })).toEqual(ok);
  });
  it("lehnt ungültige Adressen ab", () => {
    for (const to of ["", "keine-adresse", "a@b", "a b@c.de", "a@c.de, b@c.de", "<a@c.de>", `${"x".repeat(250)}@c.de`]) {
      expect(() => validateMail({ ...ok, to })).toThrow(MailError);
    }
  });
  it("verhindert Einschleusen von Kopfzeilen über Zeilenumbrüche", () => {
    expect(() => validateMail({ ...ok, subject: "Hallo\r\nBcc: fremd@c.de" })).toThrow(/Zeilenumbruch/);
    expect(() => validateMail({ ...ok, to: "a@c.de\nBcc: fremd@c.de" })).toThrow(MailError);
  });
  it("lehnt Nicht-Texte und seltsame Adressformen ab", () => {
    const bad = [{ ...ok, text: { path: "/etc/passwd" } }, { ...ok, to: ["a@c.de"] }, { ...ok, subject: 5 }, null];
    for (const m of bad) expect(() => validateMail(m as never)).toThrow(MailError);
    for (const to of ["a@[127.0.0.1]", "a@x..de", "a%b@c.de", "a@-c.de", "a@c-.de"]) expect(() => validateMail({ ...ok, to })).toThrow(MailError);
    expect(validateMail({ ...ok, to: "jörg.müller@bücher.de" }).to).toBe("jörg.müller@bücher.de");
  });
  it("verlangt Betreff und Text in vernünftiger Länge", () => {
    expect(() => validateMail({ ...ok, subject: "  " })).toThrow(MailError);
    expect(() => validateMail({ ...ok, subject: "x".repeat(201) })).toThrow(MailError);
    expect(() => validateMail({ ...ok, text: "   " })).toThrow(MailError);
    expect(() => validateMail({ ...ok, text: "x".repeat(20_001) })).toThrow(MailError);
  });
});

describe("smtpConfigFromEnv", () => {
  const full = { SMTP_HOST: "smtp.beispiel.eu", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "Kurswerk <no-reply@beispiel.eu>" };
  it("gibt null zurück, wenn nichts gesetzt ist", () => {
    expect(smtpConfigFromEnv({})).toBeNull();
  });
  it("liest eine vollständige Konfiguration, Standardport 465", () => {
    expect(smtpConfigFromEnv(full)).toEqual({ host: "smtp.beispiel.eu", port: 465, user: "u", pass: "p", from: "Kurswerk <no-reply@beispiel.eu>" });
    expect(smtpConfigFromEnv({ ...full, SMTP_PORT: "587" })?.port).toBe(587);
  });
  it("wirft bei unvollständiger oder fehlerhafter Konfiguration, ohne Zugangsdaten zu nennen", () => {
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "smtp.beispiel.eu" })).toThrow(/unvollständig/);
    expect(() => smtpConfigFromEnv({ ...full, SMTP_PORT: "abc" })).toThrow(/Portnummer/);
    expect(() => smtpConfigFromEnv({ ...full, SMTP_PORT: "70000" })).toThrow(/Portnummer/);
    expect(() => smtpConfigFromEnv({ ...full, MAIL_FROM: "kaputt" })).toThrow(/Absender/);
    try {
      smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PASS: "geheim123" });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("geheim123");
    }
  });
});

describe("smtpMailer", () => {
  const cfg = { host: "h", port: 465, user: "u", pass: "p", from: "Kurswerk <no-reply@beispiel.eu>" };
  it("übergibt eine geprüfte Mail an den Transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await smtpMailer(cfg, { sendMail }).send(ok);
    expect(sendMail).toHaveBeenCalledWith({ from: cfg.from, ...ok });
  });
  it("sendet nichts bei ungültiger Mail", async () => {
    const sendMail = vi.fn();
    await expect(smtpMailer(cfg, { sendMail }).send({ ...ok, subject: "a\nb" })).rejects.toBeInstanceOf(MailError);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("gibt Serverfehler nicht nach außen und protokolliert nur Codes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error("535 Auth failed for user u password p at 10.0.0.1"), { code: "EAUTH", responseCode: 535 }));
    const err = await smtpMailer(cfg, { sendMail }).send(ok).catch((e) => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.message).toBe("Die E-Mail konnte nicht gesendet werden.");
    expect((err as { cause?: unknown }).cause).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/password|10\.0\.0\.1|leitung@/);
    expect(log).toHaveBeenCalledWith("E-Mail-Versand fehlgeschlagen", { code: "EAUTH", responseCode: 535 });
    log.mockRestore();
  });
});

describe("fileMailer und memoryMailer", () => {
  it("schreibt eine Mail als private Textdatei", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mail-"));
    await fileMailer(dir).send(ok);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const text = await readFile(path.join(dir, files[0]!), "utf8");
    expect(text).toContain("An: leitung@beispielschule.test");
    expect(text).toContain("Bitte bestätigen");
    expect((await stat(path.join(dir, files[0]!))).mode & 0o077).toBe(0);
  });
  it("sammelt Mails im Speicher", async () => {
    const m = memoryMailer();
    await m.send(ok);
    expect(m.sent).toEqual([ok]);
  });
});

describe("createMailer", () => {
  it("setzt TLS und sperrt Dateizugriffe im Transport", async () => {
    const spy = vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail: vi.fn() } as never);
    smtpMailer({ host: "h", port: 465, user: "u", pass: "p", from: "a@b.de" });
    smtpMailer({ host: "h", port: 587, user: "u", pass: "p", from: "a@b.de" });
    const [a, b] = spy.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(a).toMatchObject({ secure: true, requireTLS: false, disableFileAccess: true, disableUrlAccess: true });
    expect(b).toMatchObject({ secure: false, requireTLS: true, disableFileAccess: true, disableUrlAccess: true });
    expect(JSON.stringify([a, b])).not.toMatch(/rejectUnauthorized|ignoreTLS/);
    spy.mockRestore();
  });
  it("nimmt SMTP, wenn eingerichtet", async () => {
    const env = { SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "a@b.de" };
    // Verbindung scheitert (Port 1), aber der Fehler ist der geglättete Versandfehler, nicht ein Dateiweg.
    await expect(createMailer(env).send(ok)).rejects.toThrow("Die E-Mail konnte nicht gesendet werden.");
  });
  it("schreibt in Produktion ohne Einrichtung nie still in eine Datei", async () => {
    await expect(createMailer({ NODE_ENV: "production" }).send(ok)).rejects.toThrow("nicht eingerichtet");
  });
  it("erlaubt den Dateiweg in Produktion nur ausdrücklich", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mail-"));
    await createMailer({ NODE_ENV: "production", MAIL_TRANSPORT: "file", MAIL_OUTBOX: dir }).send(ok);
    expect(await readdir(dir)).toHaveLength(1);
  });
  it("fällt bei unbekanntem NODE_ENV nicht still auf die Datei zurück", async () => {
    await expect(createMailer({ NODE_ENV: "staging" }).send(ok)).rejects.toThrow("nicht eingerichtet");
    await expect(createMailer({}).send(ok)).rejects.toThrow("nicht eingerichtet");
  });
  it("nutzt in development den Dateiweg", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mail-"));
    await createMailer({ NODE_ENV: "development", MAIL_OUTBOX: dir }).send(ok);
    expect(await readdir(dir)).toHaveLength(1);
  });
});
