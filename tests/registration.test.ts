// Selbstregistrierung gegen eine echte Datenbank: Anfrage, Bestätigung, Begrenzung, Trennung, Missbrauch.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { registrationBaseUrl, registrationOpen, showLinkOnPage } from "@/server/registration-config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, withRegistrationAccess, withSlugLookup, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { clientIpFrom, mailboxKey, confirmationMail, hashRegistrationToken, isRegistrationToken, newRegistrationToken, parseRegistration, rateKey, REGISTRATION_LIMITS, slugFromName } from "@/domain/registration";
import { invitationIsValid } from "@/server/auth";
import { isValidAddress, memoryMailer, type Mailer } from "@/server/mailer";
import { confirmRegistration, previewRegistration, requestRegistration } from "@/server/registration";

if (existsSync(".env")) process.loadEnvFile(".env");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL fehlt");
const name = `kurswerk_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${name}`;

let db: Db;
let pool: Pool;
const SECRET = "test-geheimnis-0123456789";
const BASE = "https://kurswerk.test";
// Weit in der Vergangenheit: Die Datenbank räumt nach ihrer eigenen Uhr auf, die muss der Testzeit voraus sein.
const T0 = new Date("2026-10-01T10:00:00Z");
const minutes = (m: number) => new Date(T0.getTime() + m * 60_000);

const input = (over: Partial<{ schoolName: string; firstName: string; lastName: string; email: string }> = {}) => ({
  schoolName: "Sprachschule Beispiel",
  firstName: "Sabine",
  lastName: "Brandt",
  email: `leitung-${randomUUID().slice(0, 8)}@beispielschule.test`,
  ...over,
});
const tokenFrom = (link: string) => link.split("/").pop()!;
const ask = (i = input(), ip = `ip-${randomUUID()}`, now = T0, mailer: Mailer = memoryMailer()) =>
  requestRegistration(db, i, { ip, secret: SECRET, baseUrl: BASE, mailer, now });

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  ({ db, pool } = createDb(testUrl.toString()));
  await migrate(db as never, { migrationsFolder: "drizzle" });
}, 60_000);

afterAll(async () => {
  await pool.end();
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  // Erst warten, bis der Server die geschlossenen Verbindungen wirklich beendet hat; sonst kappt FORCE sie mit einem Fehler.
  for (let i = 0; i < 50; i++) {
    const { rows } = await admin.query("select count(*)::int as n from pg_stat_activity where datname = $1", [name]);
    if (rows[0].n === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe("Regeln ohne Datenbank", () => {
  it("prüft und bereinigt die Angaben", () => {
    const r = parseRegistration({ schoolName: "  Sprachschule   Müller ", firstName: " Eva", lastName: "Müller ", email: " EVA@Mueller.DE " }, isValidAddress);
    expect(r).toEqual({ ok: true, value: { schoolName: "Sprachschule Müller", firstName: "Eva", lastName: "Müller", email: "eva@mueller.de" } });
  });
  it("lehnt unbrauchbare Angaben ab", () => {
    const base = { schoolName: "Schule", firstName: "Eva", lastName: "Müller", email: "eva@mueller.de" };
    const bad = [
      { ...base, schoolName: "A" },
      { ...base, schoolName: "x".repeat(121) },
      { ...base, schoolName: "<b>Schule</b>" },
      { ...base, firstName: "" },
      { ...base, lastName: "Mül\nler" },
      { ...base, email: "keine-adresse" },
      { ...base, email: "a@c.de, b@c.de" },
      { ...base, schoolName: { toString: () => "x" } },
    ];
    for (const b of bad) expect(parseRegistration(b as never, isValidAddress).ok).toBe(false);
  });
  it("macht aus dem Namen ein sicheres Kürzel mit Zufallsende", () => {
    const slug = slugFromName("Sprachen Plus e.V. – Äußere Straße");
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{4}$/);
    expect(slug.startsWith("sprachen-plus-e-v-aeussere-s-")).toBe(true); // auf 28 Zeichen gekürzt
    expect(slugFromName("!!!")).toMatch(/^schule-[a-z0-9]{4}$/);
    expect(slugFromName("x".repeat(200)).length).toBeLessThanOrEqual(33);
    expect(slugFromName("Gleich")).not.toBe(slugFromName("Gleich"));
  });
  it("Linkgeheimnis ist zufällig, 43 Zeichen, nur als Hash gespeichert", () => {
    const a = newRegistrationToken();
    expect(isRegistrationToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashRegistrationToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(newRegistrationToken().token).not.toBe(a.token);
    for (const t of ["", "kurz", `${a.token}x`, `${a.token.slice(0, 42)}!`, null, 5]) expect(isRegistrationToken(t)).toBe(false);
  });
  it("Zählschlüssel enthalten keine Klartext-Adressen", () => {
    const k = rateKey(SECRET, "email", "eva@mueller.de");
    expect(k).not.toContain("eva");
    expect(rateKey(SECRET, "email", "eva@mueller.de")).toBe(k);
    expect(rateKey("anderes-geheimnis-0123", "email", "eva@mueller.de")).not.toBe(k);
    expect(rateKey(SECRET, "ip", "eva@mueller.de")).not.toBe(k);
  });
  it("Mailtext ist fest: enthält nur den Link, nie Eingaben der Person", () => {
    const m = confirmationMail("https://kurswerk.test/registrieren/bestaetigen/abc");
    expect(m.text).toContain("https://kurswerk.test/registrieren/bestaetigen/abc");
    expect(m.text).toMatch(/7-tägige Testzeit/);
    expect(confirmationMail("x").text.replace("x", "")).toBe(m.text.replace("https://kurswerk.test/registrieren/bestaetigen/abc", ""));
  });
});

describe("Anfrage", () => {
  it("schickt den Link per Mail und speichert nur den Hash", async () => {
    const mailer = memoryMailer();
    const i = input();
    const r = await ask(i, "ip-a", T0, mailer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe(i.email);
    expect(mailer.sent[0]!.text).toContain(r.link);
    expect(r.link.startsWith(`${BASE}/registrieren/bestaetigen/`)).toBe(true);
    const token = tokenFrom(r.link);
    const stored = await withRegistrationAccess(db, { tokenHash: hashRegistrationToken(token) }, (tx) => tx.select().from(s.registrations));
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0]!.expiresAt.getTime() - T0.getTime()).toBe(24 * 3_600_000);
    expect(stored[0]!.termsVersion).toBeTruthy();
  });
  it("legt keine Schule an, bevor bestätigt wurde", async () => {
    const i = input({ schoolName: "Unbestätigte Schule" });
    await ask(i);
    const found = await withSlugLookup(db, "unbestaetigte-schule", (tx) => tx.select().from(s.organizations));
    expect(found).toHaveLength(0);
  });
  it("Registrierungsdaten sind ohne Linkgeheimnis nicht lesbar, auch nicht mit fremdem", async () => {
    await ask();
    expect(await db.select().from(s.registrations)).toHaveLength(0);
    expect(await withRegistrationAccess(db, { tokenHash: hashRegistrationToken(newRegistrationToken().token) }, (tx) => tx.select().from(s.registrations))).toHaveLength(0);
    expect(await db.select().from(s.registrationAttempts)).toHaveLength(0);
  });
  it("begrenzt je E-Mail-Adresse", async () => {
    const i = input();
    const t = minutes(1000);
    for (let n = 0; n < REGISTRATION_LIMITS.perEmail; n++) expect((await ask(i, `ip-${n}`, t)).ok).toBe(true);
    expect(await ask(i, "ip-neu", t)).toEqual({ ok: false, reason: "limited" });
    expect((await ask(i, "ip-neu", minutes(1000 + 61))).ok).toBe(true); // nach dem Zeitfenster wieder möglich
  });
  it("begrenzt je IP", async () => {
    const t = minutes(2000);
    for (let n = 0; n < REGISTRATION_LIMITS.perIp; n++) expect((await ask(input(), "ip-gleich", t)).ok).toBe(true);
    expect(await ask(input(), "ip-gleich", t)).toEqual({ ok: false, reason: "limited" });
    expect((await ask(input(), "ip-andere", t)).ok).toBe(true);
  });
  it("begrenzt insgesamt", async () => {
    const t = minutes(3000);
    const key = rateKey(SECRET, "global", "all");
    await withRegistrationAccess(db, { keys: [key] }, (tx) => tx.insert(s.registrationAttempts).values(Array.from({ length: REGISTRATION_LIMITS.global }, () => ({ keyHash: key, attemptedAt: t }))));
    expect(await ask(input(), `ip-${randomUUID()}`, t)).toEqual({ ok: false, reason: "limited" });
  });
  it("gleichzeitige Anfragen umgehen die Begrenzung nicht", async () => {
    const i = input();
    const t = minutes(4000);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, n) => ask(i, `ip-par-${n}`, t)));
    expect(rs.filter((r) => r.ok)).toHaveLength(REGISTRATION_LIMITS.perEmail);
  });
  it("Mailfehler: kein Link bleibt liegen, die Antwort sagt nur 'mail'", async () => {
    const failing: Mailer = { send: async () => Promise.reject(new Error("smtp kaputt")) };
    const r = await ask(input(), "ip-mail", minutes(9000), failing);
    expect(r).toEqual({ ok: false, reason: "mail" });
  });
  it("räumt abgelaufene Registrierungen bei der nächsten Anfrage auf", async () => {
    const r = await ask(input(), "ip-alt", minutes(5000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = hashRegistrationToken(tokenFrom(r.link));
    expect((await ask(input(), "ip-neu2", minutes(5000 + 24 * 60 + 1))).ok).toBe(true);
    const left = await withRegistrationAccess(db, { tokenHash: h }, (tx) => tx.select().from(s.registrations));
    expect(left).toHaveLength(0);
  });
});

describe("Bestätigung", () => {
  const register = async (i = input(), t = minutes(6000)) => {
    const r = await ask(i, `ip-${randomUUID()}`, t);
    if (!r.ok) throw new Error("Anfrage abgelehnt");
    return tokenFrom(r.link);
  };

  it("zeigt vor dem Bestätigen den Schulnamen, ändert aber nichts", async () => {
    const token = await register(input({ schoolName: "Vorschau Schule" }));
    expect(await previewRegistration(db, token, minutes(6001))).toEqual({ schoolName: "Vorschau Schule" });
    expect(await previewRegistration(db, token, minutes(6001))).not.toBeNull();
    expect(await previewRegistration(db, "kaputt", minutes(6001))).toBeNull();
  });

  it("legt Schule mit Testzeit, Leitung und Einladungslink an", async () => {
    const i = input({ schoolName: "Neue Testschule" });
    const token = await register(i);
    const t = minutes(6010);
    const r = await confirmRegistration(db, token, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slug).toMatch(/^neue-testschule-[a-z0-9]{4}$/);

    const [org] = await withSlugLookup(db, r.slug, (tx) => tx.select().from(s.organizations));
    expect(org).toMatchObject({ name: "Neue Testschule", status: "TRIAL", termsVersion: expect.any(String) });
    expect(org!.trialEndsAt!.getTime()).toBe(t.getTime() + 7 * 86_400_000);
    expect(org!.termsAcceptedAt).toBeTruthy();

    const people = await withOrganization(db, org!.id, (tx) =>
      tx.select({ email: s.users.email, role: s.memberships.role }).from(s.users).innerJoin(s.memberships, eq(s.memberships.userId, s.users.id)),
    );
    expect(people).toEqual([{ email: i.email, role: "ADMIN" }]);
    expect(await invitationIsValid(db, r.invitationToken, t)).toMatchObject({ email: i.email, name: "Sabine Brandt" });

    const audit = await withOrganization(db, org!.id, (tx) => tx.select().from(s.auditEvents).where(eq(s.auditEvents.action, "organization.registered")));
    expect(audit).toHaveLength(1);
  });

  it("der Link gilt genau einmal", async () => {
    const token = await register();
    expect((await confirmRegistration(db, token, minutes(6020))).ok).toBe(true);
    expect(await confirmRegistration(db, token, minutes(6021))).toEqual({ ok: false });
    expect(await previewRegistration(db, token, minutes(6021))).toBeNull();
  });

  it("gleichzeitiges Bestätigen legt genau eine Schule an", async () => {
    const i = input({ schoolName: "Doppelklick Schule" });
    const token = await register(i);
    const rs = await Promise.all(Array.from({ length: 6 }, () => confirmRegistration(db, token, minutes(6030))));
    const ok = rs.filter((r) => r.ok);
    expect(ok).toHaveLength(1);
    // Die eine Schule gibt es; die übrigen Versuche haben nichts angelegt (sie fanden den Link schon verbraucht).
    const slug = (ok[0] as { slug: string }).slug;
    const [org] = await withSlugLookup(db, slug, (tx) => tx.select().from(s.organizations));
    expect(org!.name).toBe("Doppelklick Schule");
    const users = await withOrganization(db, org!.id, (tx) => tx.select().from(s.users));
    expect(users).toHaveLength(1);
  });

  it("abgelaufener, unbekannter und fehlerhafter Link legt nichts an", async () => {
    const token = await register(input({ schoolName: "Abgelaufene Schule" }));
    expect(await confirmRegistration(db, token, minutes(6000 + 24 * 60 + 1))).toEqual({ ok: false });
    expect(await confirmRegistration(db, newRegistrationToken().token)).toEqual({ ok: false });
    for (const bad of ["", "x", "../etc/passwd", "a".repeat(43) + "."]) expect(await confirmRegistration(db, bad)).toEqual({ ok: false });
    // Auch der abgelaufene Link ist danach nicht mehr einlösbar und zeigt nichts an.
    expect(await previewRegistration(db, token, minutes(6001))).toEqual({ schoolName: "Abgelaufene Schule" });
    expect(await previewRegistration(db, token, minutes(6000 + 24 * 60 + 1))).toBeNull();
  });

  it("zwei Schulen mit gleichem Namen bekommen verschiedene Kürzel und sehen nichts voneinander", async () => {
    const i1 = input({ schoolName: "Gleicher Name", email: "eins@beispielschule.test" });
    const i2 = input({ schoolName: "Gleicher Name", email: "zwei@beispielschule.test" });
    const r1 = await confirmRegistration(db, await register(i1), minutes(6040));
    const r2 = await confirmRegistration(db, await register(i2), minutes(6040));
    if (!r1.ok || !r2.ok) throw new Error("Bestätigung fehlgeschlagen");
    expect(r1.slug).not.toBe(r2.slug);
    const [o1] = await withSlugLookup(db, r1.slug, (tx) => tx.select().from(s.organizations));
    const [o2] = await withSlugLookup(db, r2.slug, (tx) => tx.select().from(s.organizations));
    const emails = (id: string) => withOrganization(db, id, (tx) => tx.select({ e: s.users.email }).from(s.users));
    expect((await emails(o1!.id)).map((x) => x.e)).toEqual(["eins@beispielschule.test"]);
    expect((await emails(o2!.id)).map((x) => x.e)).toEqual(["zwei@beispielschule.test"]);
  });

  it("von Hand angelegte Schulen sind sofort aktiv, ohne Testzeit", async () => {
    const id = randomUUID();
    await withOrganization(db, id, (tx) => tx.insert(s.organizations).values({ id, name: "Manuell", slug: "manuell-test" }));
    const [o] = await withOrganization(db, id, (tx) => tx.select().from(s.organizations));
    expect(o).toMatchObject({ status: "ACTIVE", trialEndsAt: null });
  });
});

describe("Schutz in der Datenbank", () => {
  it("Angaben einer Registrierung sind unveränderlich, verbraucht ist endgültig", async () => {
    const r = await ask(input(), `ip-${randomUUID()}`, minutes(7000));
    if (!r.ok) throw new Error("Anfrage abgelehnt");
    const h = hashRegistrationToken(tokenFrom(r.link));
    const upd = (set: Partial<typeof s.registrations.$inferInsert>) =>
      withRegistrationAccess(db, { tokenHash: h }, (tx) => tx.update(s.registrations).set(set).where(eq(s.registrations.tokenHash, h)));
    await expect(upd({ email: "fremd@beispielschule.test" })).rejects.toThrow();
    await expect(upd({ expiresAt: new Date("2099-01-01") })).rejects.toThrow();
    await upd({ usedAt: minutes(7001) });
    await expect(upd({ usedAt: null })).rejects.toThrow();
    await expect(upd({ usedAt: minutes(7002) })).rejects.toThrow();
  });
  it("der Aufräum-Schalter gibt nur abgelaufene Registrierungen frei, nie gültige", async () => {
    const fresh = await ask(input(), `ip-${randomUUID()}`, new Date(Date.now() - 3_600_000));
    if (!fresh.ok) throw new Error("Anfrage abgelehnt");
    const h = hashRegistrationToken(tokenFrom(fresh.link));
    const seen = await withRegistrationAccess(db, { purgeExpired: true }, (tx) => tx.select().from(s.registrations).where(eq(s.registrations.tokenHash, h)));
    expect(seen).toHaveLength(0); // läuft erst in 23 Stunden ab
  });
  it("Zählung ist nur mit dem eigenen Schlüssel sichtbar und nicht änderbar", async () => {
    const key = rateKey(SECRET, "ip", "geheim");
    await withRegistrationAccess(db, { keys: [key] }, (tx) => tx.insert(s.registrationAttempts).values({ keyHash: key }));
    expect(await withRegistrationAccess(db, { keys: [rateKey(SECRET, "ip", "anderer")] }, (tx) => tx.select().from(s.registrationAttempts).where(eq(s.registrationAttempts.keyHash, key)))).toHaveLength(0);
    await withRegistrationAccess(db, { keys: [rateKey(SECRET, "ip", "anderer")] }, (tx) => tx.update(s.registrationAttempts).set({ keyHash: "x" }));
    expect(await withRegistrationAccess(db, { keys: [key] }, (tx) => tx.select().from(s.registrationAttempts).where(eq(s.registrationAttempts.keyHash, key)))).toHaveLength(1);
  });
  it("eine Testschule ohne Testende wird abgelehnt", async () => {
    const id = randomUUID();
    await expect(withOrganization(db, id, (tx) => tx.insert(s.organizations).values({ id, name: "X", slug: "ohne-ende", status: "TRIAL" }))).rejects.toThrow();
  });
  it("normale Schulabfragen sehen keine Registrierungen", async () => {
    const id = randomUUID();
    await withOrganization(db, id, (tx) => tx.insert(s.organizations).values({ id, name: "Y", slug: "ohne-zugriff" }));
    const rows = await withOrganization(db, id, (tx) => tx.select().from(s.registrations));
    expect(rows).toHaveLength(0);
  });
});

describe("Schutz vor Missbrauch (ohne Datenbank)", () => {
  it("zählt Plus-Varianten und Gmail-Punkte als dasselbe Postfach", () => {
    expect(mailboxKey("Opfer+1@example.org")).toBe(mailboxKey("opfer+zwei@example.org"));
    expect(mailboxKey("o.pfer@gmail.com")).toBe(mailboxKey("opfer+x@googlemail.com"));
    expect(mailboxKey("o.pfer@example.org")).not.toBe(mailboxKey("opfer@example.org"));
  });
  it("liest die Adresse von rechts und kürzt IPv6", () => {
    expect(clientIpFrom("6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
    expect(clientIpFrom("6.6.6.6, 203.0.113.9, 10.0.0.1", 2)).toBe("203.0.113.9");
    expect(clientIpFrom("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(clientIpFrom("2001:db8:1:2:1::9"));
    expect(clientIpFrom(null)).toBe("unbekannt");
    expect(clientIpFrom("")).toBe("unbekannt");
  });
  it("lehnt unsichtbare und Textrichtungs-Zeichen im Schulnamen ab", () => {
    for (const ch of ["\u202e", "\u200b", "\u2066", "\ufeff"]) {
      const r = parseRegistration({ schoolName: `Bank${ch}Konto`, firstName: "A", lastName: "B", email: "a@b.de" }, () => true);
      expect(r.ok).toBe(false);
    }
  });
  it("zeigt den Testlink nur bei Dateiversand ohne SMTP und mit ausdrücklichem Schalter", () => {
    const base = { MAIL_TRANSPORT: "file", REGISTRATION_SHOW_LINK: "1" };
    expect(showLinkOnPage(base)).toBe(true);
    expect(showLinkOnPage({ ...base, SMTP_HOST: "mail.example.org" })).toBe(false);
    expect(showLinkOnPage({ ...base, MAIL_TRANSPORT: "smtp" })).toBe(false);
    expect(showLinkOnPage({ MAIL_TRANSPORT: "file" })).toBe(false);
    expect(showLinkOnPage({})).toBe(false);
  });
  it("hält die Registrierung ohne Schalter geschlossen und nimmt nur feste Adressen", () => {
    expect(registrationOpen({})).toBe(false);
    expect(registrationOpen({ REGISTRATION_OPEN: "true" })).toBe(false);
    expect(registrationOpen({ REGISTRATION_OPEN: "1" })).toBe(true);
    expect(registrationBaseUrl({ APP_URL: "https://schule.example.org/" })).toBe("https://schule.example.org");
    expect(registrationBaseUrl({ APP_URL: "http://evil.example.org" })).toBeNull();
    expect(registrationBaseUrl({ APP_URL: "https://x.org/pfad" })).toBeNull();
    expect(registrationBaseUrl({ NODE_ENV: "production" })).toBeNull();
    expect(registrationBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});
