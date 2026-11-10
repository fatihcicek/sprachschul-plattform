// Selbstregistrierung einer Schule: Anfrage (E-Mail mit Link) und Bestätigung (Schule anlegen).
// Eine Schule entsteht erst nach der Bestätigung, damit keine Karteileichen mit unbestätigten Adressen anfallen.

import { randomUUID } from "node:crypto";
import { and, count, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { INVITATION_DAYS } from "@/domain/password";
import { withRegistrationAccess, type Db } from "@/db/client";
import { auditEvents, organizations, registrationAttempts, registrations } from "@/db/schema";
import {
  CONFIRM_HOURS,
  confirmationMail,
  hashRegistrationToken,
  isRegistrationToken,
  newRegistrationToken,
  passwordLinkMail,
  rateKey,
  REGISTRATION_LIMITS,
  slugFromName,
  TERMS_VERSION,
  TRIAL_DAYS,
  type RegistrationInput,
  mailboxKey,
} from "@/domain/registration";
import type { Mailer } from "@/server/mailer";
import { createInvitation } from "@/server/auth";
import { createPerson } from "@/server/people";

export type RequestResult = { ok: true; link: string } | { ok: false; reason: "limited" | "mail" };

/**
 * Nimmt eine geprüfte Registrierungsanfrage an und verschickt den Bestätigungslink.
 * baseUrl kommt aus der Konfiguration (APP_URL), nie aus Anfrage-Kopfzeilen.
 */
export async function requestRegistration(
  db: Db,
  input: RegistrationInput,
  ctx: { ip: string; secret: string; baseUrl: string; mailer: Mailer; now?: Date },
): Promise<RequestResult> {
  const now = ctx.now ?? new Date();
  const keys = [rateKey(ctx.secret, "ip", ctx.ip), rateKey(ctx.secret, "email", mailboxKey(input.email)), rateKey(ctx.secret, "global", "all")];
  const [ipKey, emailKey, globalKey] = keys as [string, string, string];
  const { token, hash } = newRegistrationToken();
  const since = new Date(now.getTime() - REGISTRATION_LIMITS.windowMinutes * 60_000);

  const accepted = await withRegistrationAccess(db, { tokenHash: hash, keys, purgeExpired: true }, async (tx) => {
    // Eine Sperre für alle Anfragen: wenige Anfragen pro Stunde, dafür lückenlos gezählt.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('registration-limits'))`);
    await tx.delete(registrations).where(lt(registrations.expiresAt, now));
    await tx.delete(registrationAttempts).where(lt(registrationAttempts.attemptedAt, new Date(now.getTime() - 24 * 3_600_000)));
    const used = async (key: string) =>
      (await tx.select({ n: count() }).from(registrationAttempts).where(and(eq(registrationAttempts.keyHash, key), gte(registrationAttempts.attemptedAt, since))))[0]?.n ?? 0;
    if ((await used(ipKey)) >= REGISTRATION_LIMITS.perIp || (await used(emailKey)) >= REGISTRATION_LIMITS.perEmail || (await used(globalKey)) >= REGISTRATION_LIMITS.global) return false;
    await tx.insert(registrationAttempts).values(keys.map((keyHash) => ({ keyHash, attemptedAt: now })));
    await tx.insert(registrations).values({
      tokenHash: hash,
      ...input,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
      expiresAt: new Date(now.getTime() + CONFIRM_HOURS * 3_600_000),
      createdAt: now,
    });
    return true;
  });
  if (!accepted) return { ok: false, reason: "limited" };

  const link = `${ctx.baseUrl.replace(/\/+$/, "")}/registrieren/bestaetigen/${token}`;
  try {
    const mail = confirmationMail(link);
    await ctx.mailer.send({ to: input.email, subject: mail.subject, text: mail.text });
  } catch {
    // Link nicht liegen lassen, wenn keine Mail rausging.
    await withRegistrationAccess(db, { tokenHash: hash }, (tx) => tx.delete(registrations).where(eq(registrations.tokenHash, hash)));
    return { ok: false, reason: "mail" };
  }
  return { ok: true, link };
}

/** Für die Anzeige der Bestätigungsseite: gilt der Link noch? Verbraucht nichts. */
export async function previewRegistration(db: Db, token: string, now: Date = new Date()): Promise<{ schoolName: string } | null> {
  if (!isRegistrationToken(token)) return null;
  const hash = hashRegistrationToken(token);
  return withRegistrationAccess(db, { tokenHash: hash }, async (tx) => {
    const [row] = await tx
      .select({ schoolName: registrations.schoolName })
      .from(registrations)
      .where(and(eq(registrations.tokenHash, hash), isNull(registrations.usedAt), gt(registrations.expiresAt, now)));
    return row ?? null;
  });
}

/** Wurde dieser Link schon bestätigt (und ist noch nicht abgelaufen)? Nur zur freundlichen Meldung bei erneutem Öffnen. */
export async function wasConfirmed(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  if (!isRegistrationToken(token)) return false;
  const hash = hashRegistrationToken(token);
  return withRegistrationAccess(db, { tokenHash: hash }, async (tx) => {
    const [row] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.tokenHash, hash), sql`${registrations.usedAt} is not null`, gt(registrations.expiresAt, now)));
    return !!row;
  });
}

export type ConfirmResult = { ok: true; slug: string; invitationToken: string; email: string } | { ok: false };

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } } | undefined;
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/**
 * Bestätigt eine Registrierung: legt die Schule (Testzeit), die Leitung und deren Einladungslink an.
 * Alles in einer Transaktion unter einer Zeilensperre: Der Link gilt genau einmal, auch bei gleichzeitigen Aufrufen,
 * und bei einem Fehler entsteht nichts und der Link bleibt gültig.
 */
export async function confirmRegistration(db: Db, token: string, now: Date = new Date()): Promise<ConfirmResult> {
  if (!isRegistrationToken(token)) return { ok: false };
  const hash = hashRegistrationToken(token);
  const organizationId = randomUUID();
  return withRegistrationAccess(db, { tokenHash: hash, organizationId }, async (tx) => {
    const [row] = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.tokenHash, hash), isNull(registrations.usedAt), gt(registrations.expiresAt, now)))
      .for("update");
    if (!row) return { ok: false } as const;
    await tx.update(registrations).set({ usedAt: now }).where(eq(registrations.id, row.id));

    // Kürzel mit Zufallsende; bei der seltenen Kollision neu würfeln (Teilvorgang, damit die Transaktion lebt).
    let slug = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      slug = slugFromName(row.schoolName);
      try {
        await tx.transaction((sp) =>
          sp.insert(organizations).values({
            id: organizationId,
            name: row.schoolName,
            slug,
            status: "TRIAL",
            trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
            termsAcceptedAt: row.termsAcceptedAt,
            termsVersion: row.termsVersion,
            createdAt: now,
          }),
        );
        break;
      } catch (e) {
        if (!isUniqueViolation(e) || attempt === 5) throw e;
      }
    }
    const { membershipId } = await createPerson(tx, organizationId, { email: row.email, firstName: row.firstName, lastName: row.lastName, role: "ADMIN" });
    const { token: invitationToken } = await createInvitation(tx, organizationId, membershipId, null, now);
    await tx.insert(auditEvents).values({
      organizationId,
      actorMembershipId: membershipId,
      action: "organization.registered",
      entity: "organization",
      entityId: organizationId,
      meta: { termsVersion: row.termsVersion },
    });
    return { ok: true, slug, invitationToken, email: row.email } as const;
  });
}

/**
 * Schickt nach der Bestätigung den Link zum Passwort-Setzen an die Adresse der Registrierung. Best effort mit Zeitlimit:
 * Die Person landet ohnehin gleich auf der Passwortseite, ein hängender Mailserver darf sie nicht aufhalten
 * und die Bestätigung nicht rückgängig machen. Gibt zurück, ob die Mail rausging.
 */
export async function sendPasswordLinkMail(
  mailer: Mailer,
  baseUrl: string | null,
  confirmed: { email: string; slug: string; invitationToken: string },
  timeoutMs = 5000,
): Promise<boolean> {
  if (!baseUrl) {
    console.error("Passwort-Link-Mail nicht gesendet: APP_URL fehlt oder ist ungültig");
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const mail = passwordLinkMail(`${baseUrl.replace(/\/+$/, "")}/einladung/${confirmed.invitationToken}`, confirmed.slug, INVITATION_DAYS);
    await Promise.race([
      mailer.send({ to: confirmed.email, subject: mail.subject, text: mail.text }),
      new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("Zeitüberschreitung")), timeoutMs))),
    ]);
    return true;
  } catch (e) {
    console.error("Passwort-Link-Mail fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
