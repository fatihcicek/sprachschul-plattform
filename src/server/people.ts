// Personen anlegen. Eine Person gehört genau einer Schule; die Mitgliedschaft
// (Rolle) entsteht in derselben Transaktion.

import type { Tx } from "@/db/client";
import { memberships, users } from "@/db/schema";
import type { Role } from "@/domain/permissions";

export type NewPerson = { email: string; firstName: string; lastName: string; role: Role };

export async function createPerson(tx: Tx, organizationId: string, p: NewPerson): Promise<{ userId: string; membershipId: string }> {
  const [u] = await tx
    .insert(users)
    .values({ organizationId, email: p.email.trim().toLowerCase(), firstName: p.firstName.trim(), lastName: p.lastName.trim() })
    .returning({ id: users.id });
  const [m] = await tx.insert(memberships).values({ organizationId, userId: u!.id, role: p.role }).returning({ id: memberships.id });
  return { userId: u!.id, membershipId: m!.id };
}
