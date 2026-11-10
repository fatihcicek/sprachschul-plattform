// Echte Anmeldung: Passwort prüfen, Fehlversuche begrenzen, Einladungslinks.
// Vor der Anmeldung ist nur der Kurzname der Schule bekannt: erst die Schule
// finden (withSlugLookup), dann alles innerhalb dieser Schule (withOrganization).

import { and, asc, count, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { withOrganization, withSlugLookup } from "@/db/client";
import { auditEvents, credentials, invitations, loginAttempts, memberships, organizations, users } from "@/db/schema";
import { can, canManageAccountOf, type Role } from "@/domain/permissions";
import {
  dummyHash,
  hashPassword,
  PASSWORD_MAX,
  INVITATION_DAYS,
  LOGIN_LIMITS,
  newInvitationToken,
  parseInvitationToken,
  passwordProblem,
  verifyPassword,
} from "@/domain/password";
import { loadActor, NotAllowedError } from "@/server/actor";

export type LoginResult =
  | { ok: true; membershipId: string; organizationId: string; passwordVersion: number }
  | { ok: false; reason: "invalid" | "locked" };

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000);
const CONTROL = /[\u0000-\u001f\u007f]/;
const INVALID: LoginResult = { ok: false, reason: "invalid" };

/** Stand eines Passworts als Zahl; steckt im Cookie, damit ein neues Passwort alte Sitzungen beendet. 0 = noch kein Passwort. */
export async function currentPasswordVersion(tx: Tx, membershipId: string): Promise<number> {
  const [c] = await tx.select({ at: credentials.updatedAt }).from(credentials).where(eq(credentials.membershipId, membershipId));
  return c ? c.at.getTime() : 0;
}

/**
 * Gleiche Meldung für „Schule unbekannt“, „E-Mail unbekannt“ und „Passwort falsch“.
 * Der Versuch wird vor dem teuren Hashen eingetragen (unter einer Sperre je E-Mail),
 * damit gleichzeitige Anfragen die Begrenzung nicht umgehen.
 */
export async function authenticate(db: Db, slugRaw: string, emailRaw: string, password: string, now: Date = new Date()): Promise<LoginResult> {
  const slug = slugRaw.trim().toLowerCase();
  const email = emailRaw.trim().toLowerCase();
  if (CONTROL.test(slug) || CONTROL.test(email) || slug.length > 80 || email.length > 254 || password.length > PASSWORD_MAX) {
    await verifyPassword("x", await dummyHash());
    return INVALID;
  }
  const [org] = await withSlugLookup(db, slug, (tx) => tx.select({ id: organizations.id }).from(organizations));
  if (!org) {
    await verifyPassword(password, await dummyHash()); // gleiche Antwortzeit
    return INVALID;
  }

  const step = await withOrganization(db, org.id, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${org.id}:${email}`}))`);
    await tx.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, minutesAgo(now, 24 * 60)));
    const since = minutesAgo(now, LOGIN_LIMITS.windowMinutes);
    const [perEmail] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.emailKey, email), eq(loginAttempts.succeeded, false), gte(loginAttempts.attemptedAt, since)));
    const [perSchool] = await tx.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.succeeded, false), gte(loginAttempts.attemptedAt, since)));
    if ((perEmail?.n ?? 0) >= LOGIN_LIMITS.perEmail || (perSchool?.n ?? 0) >= LOGIN_LIMITS.perSchool) return { locked: true as const };

    // Als Fehlversuch vormerken; bei Erfolg wird der Eintrag unten umgestellt.
    const [attempt] = await tx.insert(loginAttempts).values({ organizationId: org.id, emailKey: email, succeeded: false, attemptedAt: now }).returning({ id: loginAttempts.id });
    const [row] = await tx
      .select({ membershipId: memberships.id, active: memberships.active, hash: credentials.passwordHash, pv: credentials.updatedAt })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(credentials, eq(credentials.membershipId, memberships.id))
      .where(eq(users.email, email));
    return { locked: false as const, attemptId: attempt!.id, row };
  });
  if (step.locked) return { ok: false, reason: "locked" };

  const { row, attemptId } = step;
  const passwordOk = await verifyPassword(password, row?.hash ?? (await dummyHash()));
  if (!passwordOk || !row?.hash || !row.active) return INVALID;

  await withOrganization(db, org.id, async (tx) => {
    await tx.update(loginAttempts).set({ succeeded: true }).where(eq(loginAttempts.id, attemptId));
    // Nach erfolgreicher Anmeldung beginnt die Zählung für diese E-Mail neu.
    await tx.delete(loginAttempts).where(and(eq(loginAttempts.emailKey, email), eq(loginAttempts.succeeded, false)));
  });
  return { ok: true, membershipId: row.membershipId, organizationId: org.id, passwordVersion: row.pv!.getTime() };
}

/** Legt einen Einladungslink an. Vorherige offene Links derselben Person werden ungültig. */
export async function createInvitation(
  tx: Tx,
  organizationId: string,
  targetMembershipId: string,
  createdBy: string | null,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const [target] = await tx.select().from(memberships).where(eq(memberships.id, targetMembershipId));
  if (!target || !target.active) throw new Error("Person nicht gefunden");
  await tx.update(invitations).set({ usedAt: now }).where(and(eq(invitations.membershipId, targetMembershipId), isNull(invitations.usedAt)));
  const { token, hash } = newInvitationToken(organizationId);
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 86_400_000);
  await tx.insert(invitations).values({ organizationId, membershipId: targetMembershipId, tokenHash: hash, expiresAt, createdByMembershipId: createdBy, createdAt: now });
  await tx.insert(auditEvents).values({
    organizationId,
    actorMembershipId: createdBy ?? targetMembershipId,
    action: "account.invitation_created",
    entity: "membership",
    entityId: targetMembershipId,
  });
  return { token, expiresAt };
}

/** Einladungslink erzeugen, mit Rechteprüfung: Leitung bei allen, Verwaltung nur bei Lehrkräften und Teilnehmenden. */
export async function inviteAsActor(tx: Tx, actorMembershipId: string, targetMembershipId: string, now: Date = new Date()) {
  const actor = await loadActor(tx, actorMembershipId);
  const [target] = await tx.select().from(memberships).where(eq(memberships.id, targetMembershipId));
  if (!actor.active || !target || !canManageAccountOf(actor.role, target.role)) throw new NotAllowedError("account.invite");
  return createInvitation(tx, actor.organizationId, targetMembershipId, actor.membershipId, now);
}

export type RedeemResult = { ok: true; slug: string } | { ok: false; reason: "invalid" | "weak"; message: string };

/** Prüft nur, ob ein Link noch gilt (für die Anzeige der Seite). Verbraucht nichts. */
export async function invitationIsValid(db: Db, token: string, now: Date = new Date()): Promise<{ name: string; email: string } | null> {
  const t = parseInvitationToken(token);
  if (!t) return null;
  return withOrganization(db, t.organizationId, async (tx) => {
    const [row] = await tx
      .select({ f: users.firstName, l: users.lastName, email: users.email, active: memberships.active })
      .from(invitations)
      .innerJoin(memberships, eq(memberships.id, invitations.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(invitations.tokenHash, t.hash), isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
    return row && row.active ? { name: `${row.f} ${row.l}`, email: row.email } : null;
  });
}

/** Löst einen Einladungslink ein: setzt das Passwort. Der Link gilt genau einmal, auch bei gleichzeitigen Aufrufen. */
export async function redeemInvitation(db: Db, token: string, password: string, now: Date = new Date()): Promise<RedeemResult> {
  const t = parseInvitationToken(token);
  const invalid: RedeemResult = { ok: false, reason: "invalid", message: "Dieser Link ist ungültig oder abgelaufen. Bitte die Schule um einen neuen." };
  if (!t) return invalid;
  const open = await withOrganization(db, t.organizationId, async (tx) => {
    const [inv] = await tx
      .select({ id: invitations.id, membershipId: invitations.membershipId, email: users.email, active: memberships.active })
      .from(invitations)
      .innerJoin(memberships, eq(memberships.id, invitations.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(invitations.tokenHash, t.hash), isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
    return inv && inv.active ? inv : null;
  });
  if (!open) return invalid;
  const problem = passwordProblem(password, open.email);
  if (problem) return { ok: false, reason: "weak", message: problem };

  // Das teure Hashen geschieht außerhalb der Datenbank-Transaktion.
  const passwordHash = await hashPassword(password);
  return withOrganization(db, t.organizationId, async (tx) => {
    // Atomar einlösen: nur die erste Anfrage setzt usedAt, jede weitere findet keine Zeile.
    const claimed = await tx
      .update(invitations)
      .set({ usedAt: now })
      .where(and(eq(invitations.id, open.id), isNull(invitations.usedAt), gt(invitations.expiresAt, now)))
      .returning({ id: invitations.id });
    if (claimed.length === 0) return invalid;
    await tx
      .insert(credentials)
      .values({ organizationId: t.organizationId, membershipId: open.membershipId, passwordHash, updatedAt: now })
      .onConflictDoUpdate({ target: credentials.membershipId, set: { passwordHash, updatedAt: now } });
    // Fehlversuche für diese E-Mail zählen nach einem neuen Passwort nicht mehr.
    await tx.delete(loginAttempts).where(and(eq(loginAttempts.emailKey, open.email), eq(loginAttempts.succeeded, false)));
    await tx.insert(auditEvents).values({
      organizationId: t.organizationId,
      actorMembershipId: open.membershipId,
      action: "account.password_set",
      entity: "membership",
      entityId: open.membershipId,
    });
    const [org] = await tx.select({ slug: organizations.slug }).from(organizations);
    return { ok: true, slug: org!.slug } as const;
  });
}

/** Zugangsstatus je Person für die Verwaltung: kein Zugang, eingeladen oder aktiv. */
export type AccessState = "NONE" | "INVITED" | "ACTIVE";

export async function accessStates(tx: Tx, now: Date = new Date()): Promise<Map<string, AccessState>> {
  const creds = await tx.select({ m: credentials.membershipId }).from(credentials);
  const open = await tx.select({ m: invitations.membershipId }).from(invitations).where(and(isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
  const map = new Map<string, AccessState>();
  for (const o of open) map.set(o.m, "INVITED");
  for (const c of creds) map.set(c.m, "ACTIVE");
  return map;
}


export type AccountRow = { membershipId: string; name: string; email: string; role: Role; access: AccessState; canInvite: boolean };

/** Personen der Schule mit Zugangsstatus, für die Verwaltung. */
export async function listAccounts(tx: Tx, actorMembershipId: string, now: Date = new Date()): Promise<AccountRow[]> {
  const actor = await loadActor(tx, actorMembershipId);
  if (!actor.active || !can(actor.role, "account.invite")) throw new NotAllowedError("account.invite");
  const states = await accessStates(tx, now);
  const rows = await tx
    .select({ membershipId: memberships.id, f: users.firstName, l: users.lastName, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.active, true))
    .orderBy(asc(users.lastName), asc(users.firstName));
  return rows.map((r) => ({
    membershipId: r.membershipId,
    name: `${r.f} ${r.l}`,
    email: r.email,
    role: r.role,
    access: states.get(r.membershipId) ?? "NONE",
    canInvite: canManageAccountOf(actor.role, r.role),
  }));
}
