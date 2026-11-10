import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withOrganization, type Tx } from "@/db/client";
import { getDb } from "@/db";
import { memberships } from "@/db/schema";
import { currentPasswordVersion } from "@/server/auth";
import { enforceAccess, isReadOnlyViolation, ReadOnlyError } from "@/server/access";
import { requireSession } from "@/server/session";

/**
 * Führt eine Abfrage im Namen der angemeldeten Person und ihrer Schule aus.
 * Prüft bei jeder Anfrage, dass die Person noch aktiv ist und ihr Passwort seit
 * der Anmeldung nicht geändert wurde; sonst muss sie sich neu anmelden.
 */
export async function asSessionUser<T>(fn: (tx: Tx, membershipId: string) => Promise<T>): Promise<T> {
  const s = await requireSession();
  try {
    return await withOrganization(await getDb(), s.organizationId, async (tx) => {
      const [m] = await tx.select({ active: memberships.active }).from(memberships).where(eq(memberships.id, s.membershipId));
      if (!m || !m.active || (await currentPasswordVersion(tx, s.membershipId)) !== s.passwordVersion) redirect("/login");
      // Gesperrte Schule: raus. Abgelaufene Testzeit: ab hier nur lesen (die Datenbank erzwingt es).
      if ((await enforceAccess(tx)).mode === "BLOCKED") redirect("/login");
      return await fn(tx, s.membershipId);
    });
  } catch (e) {
    if (isReadOnlyViolation(e)) throw new ReadOnlyError();
    throw e;
  }
}
