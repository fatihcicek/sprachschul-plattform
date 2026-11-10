// Echte Anmeldung: Passwort prüfen, Fehlversuche begrenzen, Einladungslinks.
// Vor der Anmeldung ist nur der Kurzname der Schule bekannt: erst die Schule
// finden (withSlugLookup), dann alles innerhalb dieser Schule (withOrganization).

import { and, asc, count, eq, gt, gte, isNull, lt } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { withOrganization, withSlugLookup } from "@/db/client";
import { auditEvents, credentials, invitations, loginAttempts, memberships, organizations, users } from "@/db/schema";
import { can, canManageAccountOf, type Role } from "@/domain/permissions";
import {
  DUMMY_HASH,
  hashPassword,
  INVITATION_DAYS,
  LOGIN_LIMITS,
  newInvitationToken,
  parseInvitationToken,
  passwordProblem,
  verifyPassword,
} from "@/domain/password";
import { loadActor, NotAllowedError } from "@/server/actor";

export type LoginResult =
  | { ok: true; membershipId: string; organizationId: string }
  | { ok: false; reason: "invalid" | "locked" };

const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000);

/** Gleiche Meldung für „Schule unbekannt“, „E-Mail unbekannt“ und „Passwort falsch“. */
export async function authenticate(db: Db, slug: string, emailRaw: string, password: string, now: Date = new Date()): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase().slice(0, 254);
  const [org] = await withSlugLookup(db, slug.trim().toLowerCase().slice(0, 80), (tx) => tx.select({ id: organizations.id, slug: organizations.slug }).from(organizations));
  if (!org || org.slug !== slug.trim().toLowerCase()) {
    verifyPassword(password, DUMMY_HASH); // gleiche Antwortzeit
    return { ok: false, reason: "invalid" };
  }

  const known = await withOrganization(db, org.id, async (tx) => {
    const since = minutesAgo(now, LOGIN_LIMITS.windowMinutes);
    const [perEmail] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.emailKey, email), eq(loginAttempts.succeeded, false), gte(loginAttempts.attemptedAt, since)));
    const [perSchool] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.succeeded, false), gte(loginAttempts.attemptedAt, since)));
    if ((perEmail?.n ?? 0) >= LOGIN_LIMITS.perEmail || (perSchool?.n ?? 0) >= LOGIN_LIMITS.perSchool) return "locked" as const;

    const [row] = await tx
      .select({ membershipId: memberships.id, active: memberships.active, hash: credentials.passwordHash })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(credentials, eq(credentials.membershipId, memberships.id))
      .where(eq(users.email, email));
    return row ?? null;
  });
  if (known === "locked") return { ok: false, reason: "locked" };

  const good = verifyPassword(password, known?.hash ?? DUMMY_HASH) && !!known?.hash && known.active;
  await withOrganization(db, org.id, async (tx) => {
    await tx.insert(loginAttempts).values({ organizationId: org.id, emailKey: email, succeeded: good, attemptedAt: now });
    // Alte Einträge aufräumen, damit die Tabelle nicht wächst.
    await tx.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, minutesAgo(now, 24 * 60)));
  });
  return good && known ? { ok: true, membershipId: known.membershipId, organizationId: org.id } : { ok: false, reason: "invalid" };
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

export type RedeemResult = { ok: true } | { ok: false; reason: "invalid" | "weak"; message: string };

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
  return withOrganization(db, t.organizationId, async (tx) => {
    const [inv] = await tx
      .select({ id: invitations.id, membershipId: invitations.membershipId, email: users.email, active: memberships.active })
      .from(invitations)
      .innerJoin(memberships, eq(memberships.id, invitations.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(invitations.tokenHash, t.hash), isNull(invitations.usedAt), gt(invitations.expiresAt, now)));
    if (!inv || !inv.active) return invalid;
    const problem = passwordProblem(password, inv.email);
    if (problem) return { ok: false, reason: "weak", message: problem };

    // Atomar einlösen: nur die erste Anfrage setzt usedAt, jede weitere findet keine Zeile.
    const claimed = await tx
      .update(invitations)
      .set({ usedAt: now })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.usedAt)))
      .returning({ id: invitations.id });
    if (claimed.length === 0) return invalid;

    const passwordHash = hashPassword(password);
    await tx
      .insert(credentials)
      .values({ organizationId: t.organizationId, membershipId: inv.membershipId, passwordHash, updatedAt: now })
      .onConflictDoUpdate({ target: credentials.membershipId, set: { passwordHash, updatedAt: now } });
    // Fehlversuche für diese E-Mail zählen nach einem neuen Passwort nicht mehr.
    await tx.delete(loginAttempts).where(and(eq(loginAttempts.emailKey, inv.email), eq(loginAttempts.succeeded, false)));
    await tx.insert(auditEvents).values({
      organizationId: t.organizationId,
      actorMembershipId: inv.membershipId,
      action: "account.password_set",
      entity: "membership",
      entityId: inv.membershipId,
    });
    return { ok: true } as const;
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
