import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { withOrganization } from "@/db/client";
import { memberships } from "@/db/schema";
import type { OrganizationAccess, Role } from "@/domain/permissions";
import { loadAccess } from "@/server/access";
import { getSession } from "@/server/session";

/** Zugriffszustand der Schule und Rolle der angemeldeten Person, für Hinweise und gesperrte Formulare. Ohne Sitzung: null. */
export async function getCurrentAccess(): Promise<{ access: OrganizationAccess; role: Role | null } | null> {
  const s = await getSession();
  if (!s) return null;
  return withOrganization(await getDb(), s.organizationId, async (tx) => {
    const [m] = await tx.select({ role: memberships.role }).from(memberships).where(eq(memberships.id, s.membershipId));
    return { access: await loadAccess(tx), role: m?.role ?? null };
  });
}
