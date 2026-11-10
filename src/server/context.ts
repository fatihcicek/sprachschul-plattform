import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withOrganization, type Tx } from "@/db/client";
import { getDb } from "@/db";
import { memberships } from "@/db/schema";
import { currentPasswordVersion } from "@/server/auth";
import { enforceAccess, isReadOnlyViolation, loadAccess, ReadOnlyError } from "@/server/access";
import { requireSession } from "@/server/session";

/**
 * Führt eine Abfrage im Namen der angemeldeten Person und ihrer Schule aus.
 * Prüft bei jeder Anfrage, dass die Person noch aktiv ist und ihr Passwort seit
 * der Anmeldung nicht geändert wurde; sonst muss sie sich neu anmelden.
 */
export async function asSessionUser<T>(
  fn: (tx: Tx, membershipId: string) => Promise<T>,
  // Nur für das Protokollieren (Audit) von Lesezugriffen, z. B. der Ausgabe eines Nachweises: erzwingt „nur lesen“ nicht.
  // Gesperrte Schulen bleiben auch dann draußen.
  options: { auditOnly?: boolean } = {},
): Promise<T> {
  const s = await requireSession();
  let readOnly = false;
  try {
    return await withOrganization(await getDb(), s.organizationId, async (tx) => {
      const [m] = await tx.select({ active: memberships.active }).from(memberships).where(eq(memberships.id, s.membershipId));
      if (!m || !m.active || (await currentPasswordVersion(tx, s.membershipId)) !== s.passwordVersion) redirect("/login");
      // Gesperrte Schule: raus. Abgelaufene Testzeit: ab hier nur lesen (die Datenbank erzwingt es).
      const access = options.auditOnly ? await loadAccess(tx) : await enforceAccess(tx);
      if (access.mode === "BLOCKED") redirect("/login?gesperrt=1");
      readOnly = access.mode === "READ_ONLY" && !options.auditOnly;
      return await fn(tx, s.membershipId);
    });
  } catch (e) {
    // Nur dann „Testzeit abgelaufen“ melden, wenn wir die Transaktion selbst auf „nur lesen“ gesetzt haben.
    if (readOnly && isReadOnlyViolation(e)) throw new ReadOnlyError();
    throw e;
  }
}
