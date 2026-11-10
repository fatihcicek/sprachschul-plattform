// Optionale Teile der Plattform je Schule. Heute: BAMF-Funktionen.

import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { auditEvents, organizations } from "@/db/schema";
import { can } from "@/domain/permissions";
import { loadActor, NotAllowedError } from "@/server/actor";

/** Sind die BAMF-Funktionen für die Schule der laufenden Transaktion eingeschaltet? Im Zweifel ja (Bestandsschulen). */
export async function loadBamfEnabled(tx: Tx): Promise<boolean> {
  const [org] = await tx.select({ on: organizations.bamfEnabled }).from(organizations);
  return org?.on ?? true;
}

/** Nur die Leitung schaltet die BAMF-Funktionen um. Es ändert nichts an bestehenden Daten, nur was angezeigt und neu angelegt werden kann. */
export async function setBamfEnabled(tx: Tx, me: string, enabled: boolean): Promise<void> {
  const actor = await loadActor(tx, me);
  if (!actor.active || !can(actor.role, "organization.manage")) throw new NotAllowedError("organization.manage");
  const [before] = await tx.select({ on: organizations.bamfEnabled }).from(organizations).where(eq(organizations.id, actor.organizationId));
  if (before?.on === enabled) return;
  await tx.update(organizations).set({ bamfEnabled: enabled }).where(eq(organizations.id, actor.organizationId));
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: me,
    action: "organization.bamf_changed",
    entity: "organization",
    entityId: actor.organizationId,
    meta: { von: before?.on ?? null, nach: enabled },
  });
}
