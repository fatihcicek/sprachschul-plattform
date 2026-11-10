import { withOrganization, type Tx } from "@/db/client";
import { getDb } from "@/db";
import { requireSession } from "@/server/session";

/** Führt eine Abfrage im Namen der angemeldeten Person und ihrer Schule aus. */
export async function asSessionUser<T>(fn: (tx: Tx, membershipId: string) => Promise<T>): Promise<T> {
  const s = await requireSession();
  return withOrganization(getDb(), s.organizationId, (tx) => fn(tx, s.membershipId));
}
