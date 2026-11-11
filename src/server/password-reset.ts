// Passwort vergessen: Die Person gibt Schule und E-Mail an und bekommt, wenn es das Konto gibt, einen Link zum Festlegen
// eines neuen Passworts. Der Link ist ein normaler Einladungslink (einmal gültig, 7 Tage).
//
// Die Antwort an die Person ist immer gleich, egal ob Schule oder Adresse existieren. Jede Anfrage zählt gegen die Begrenzung,
// auch für unbekannte Adressen. Vor der Antwort geschieht für alle Anfragen nur dasselbe: das Zählen. Alles Weitere (Konto
// suchen, Link anlegen) steckt in complete() und läuft nach der Antwort, zusammen mit dem Mailversand. So verrät weder die
// Antwortzeit noch ein Fehler, ob es das Konto gibt.

import { and, count, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { withOrganization, withRegistrationAccess, withSlugLookup, type Db } from "@/db/client";
import { auditEvents, invitations, memberships, organizations, registrationAttempts, users } from "@/db/schema";
import { INVITATION_DAYS } from "@/domain/password";
import { passwordResetMail, rateKey, RESET_LIMITS, RESET_REUSE_MINUTES } from "@/domain/registration";
import { createInvitation } from "@/server/auth";
import type { Mail } from "@/server/mailer";

const CONTROL = /[\u0000-\u001f\u007f]/;

export type ResetOutcome = { limited: true } | { limited: false; complete: () => Promise<Mail | null> };

export async function requestPasswordReset(
  db: Db,
  input: { school: string; email: string },
  ctx: { ip: string; secret: string; baseUrl: string; now?: Date },
): Promise<ResetOutcome> {
  const now = ctx.now ?? new Date();
  const slug = input.school.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();

  // Jede Anfrage zählt, auch ungültige Eingaben.
  const keys = [
    rateKey(ctx.secret, "reset-ip", ctx.ip),
    rateKey(ctx.secret, "reset-email", `${slug}:${email}`.slice(0, 400)),
    rateKey(ctx.secret, "reset-school", slug.slice(0, 200)),
    rateKey(ctx.secret, "reset-global", "all"),
  ];
  const [ipKey, emailKey, schoolKey, globalKey] = keys as [string, string, string, string];
  const since = new Date(now.getTime() - RESET_LIMITS.windowMinutes * 60_000);
  const allowed = await withRegistrationAccess(db, { keys }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reset-limits'))`);
    await tx.delete(registrationAttempts).where(lt(registrationAttempts.attemptedAt, new Date(now.getTime() - 24 * 3_600_000)));
    const used = async (key: string) =>
      (await tx.select({ n: count() }).from(registrationAttempts).where(and(eq(registrationAttempts.keyHash, key), gte(registrationAttempts.attemptedAt, since))))[0]?.n ?? 0;
    if ((await used(ipKey)) >= RESET_LIMITS.perIp || (await used(emailKey)) >= RESET_LIMITS.perEmail || (await used(schoolKey)) >= RESET_LIMITS.perSchool || (await used(globalKey)) >= RESET_LIMITS.global) return false;
    await tx.insert(registrationAttempts).values(keys.map((keyHash) => ({ keyHash, attemptedAt: now })));
    return true;
  });
  if (!allowed) return { limited: true };

  return { limited: false, complete: () => createLink(db, slug, email, ctx.baseUrl, now) };
}

/** Sucht das Konto und legt den Link an. Läuft nach der Antwort; gibt die Mail zurück oder nichts. */
async function createLink(db: Db, slug: string, email: string, baseUrl: string, now: Date): Promise<Mail | null> {
  if (!slug || !email || slug.length > 80 || email.length > 254 || CONTROL.test(slug) || CONTROL.test(email)) return null;
  const [org] = await withSlugLookup(db, slug, (tx) => tx.select({ id: organizations.id }).from(organizations));
  if (!org) return null;

  const token = await withOrganization(db, org.id, async (tx) => {
    const [m] = await tx
      .select({ id: memberships.id, active: memberships.active })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(users.email, email));
    if (!m || !m.active) return null;
    // Gibt es schon einen frischen offenen Link, schicken wir keinen neuen: Sonst könnten Dritte ihn immer wieder entwerten.
    const [fresh] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.membershipId, m.id), isNull(invitations.usedAt), gt(invitations.expiresAt, now), gt(invitations.createdAt, new Date(now.getTime() - RESET_REUSE_MINUTES * 60_000))));
    if (fresh) return null;
    const { token } = await createInvitation(tx, org.id, m.id, null, now);
    await tx.insert(auditEvents).values({ organizationId: org.id, actorMembershipId: m.id, action: "account.password_reset_requested", entity: "membership", entityId: m.id });
    return token;
  });
  if (!token) return null;

  const m = passwordResetMail(`${baseUrl.replace(/\/+$/, "")}/einladung/${token}`, slug, INVITATION_DAYS);
  return { to: email, subject: m.subject, text: m.text };
}
