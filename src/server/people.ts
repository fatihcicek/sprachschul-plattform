// Personen anlegen. Eine Person gehört genau einer Schule; die Mitgliedschaft
// (Rolle) entsteht in derselben Transaktion.

import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { auditEvents, memberships, users } from "@/db/schema";
import { MAX_IMPORT_ROWS, MAX_NAME_LENGTH } from "@/domain/people-import";
import { ADDABLE_ROLES, canAddPerson, type Role } from "@/domain/permissions";
import { loadActor, NotAllowedError } from "@/server/actor";

export type NewPerson = { email: string; firstName: string; lastName: string; role: Role };

export async function createPerson(tx: Tx, organizationId: string, p: NewPerson): Promise<{ userId: string; membershipId: string }> {
  const [u] = await tx
    .insert(users)
    .values({ organizationId, email: p.email.trim().toLowerCase(), firstName: p.firstName.trim(), lastName: p.lastName.trim() })
    .returning({ id: users.id });
  const [m] = await tx.insert(memberships).values({ organizationId, userId: u!.id, role: p.role }).returning({ id: memberships.id });
  return { userId: u!.id, membershipId: m!.id };
}

/** Eingabe passt nicht (Pflichtfeld fehlt, E-Mail doppelt …). Die Meldung ist für die Person am Bildschirm gedacht. */
export class PeopleInputError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

const peopleSchema = z
  .array(
    z.object({
      firstName: z.string().max(MAX_NAME_LENGTH * 2),
      lastName: z.string().max(MAX_NAME_LENGTH * 2),
      email: z.string().max(400),
      role: z.enum(ADDABLE_ROLES),
    }),
  )
  .min(1)
  .max(MAX_IMPORT_ROWS);

export type AddPeopleResult = { created: number };

/**
 * Legt Personen an der Schule an (einzeln oder aus einer Tabelle). Alles oder nichts: Bei einem Fehler entsteht niemand.
 * Rechte: Leitung alle anlegbaren Rollen, Verwaltung nur Teilnehmende. Ein Zugang entsteht hier nicht;
 * dafür gibt es danach den Einladungslink.
 */
export async function addPeople(tx: Tx, actorMembershipId: string, raw: unknown): Promise<AddPeopleResult> {
  const actor = await loadActor(tx, actorMembershipId);
  if (!actor.active) throw new NotAllowedError("account.invite");
  const parsed = peopleSchema.safeParse(raw);
  if (!parsed.success) throw new PeopleInputError(`Bitte 1 bis ${MAX_IMPORT_ROWS} Personen mit Vorname, Nachname, E-Mail und Rolle angeben.`);
  const people = parsed.data.map((p) => ({ firstName: p.firstName.trim(), lastName: p.lastName.trim(), email: p.email.trim().toLowerCase(), role: p.role }));
  // Erst die Rechte, dann die Inhalte: Wer nicht darf, erfährt nichts über vorhandene Adressen.
  if (people.some((p) => !canAddPerson(actor.role, p.role))) throw new NotAllowedError("account.invite");

  const errors: string[] = [];
  const seen = new Set<string>();
  people.forEach((p, i) => {
    const row = people.length > 1 ? `Zeile ${i + 1}: ` : "";
    if (!p.firstName || !p.lastName) errors.push(`${row}Vor- oder Nachname fehlt.`);
    else if (p.firstName.length > MAX_NAME_LENGTH || p.lastName.length > MAX_NAME_LENGTH || CONTROL.test(p.firstName) || CONTROL.test(p.lastName)) errors.push(`${row}Name ungültig oder zu lang.`);
    if (!EMAIL.test(p.email) || p.email.length > 254 || CONTROL.test(p.email)) errors.push(`${row}E-Mail ungültig: ${p.email.slice(0, 80) || "(leer)"}`);
    else if (seen.has(p.email)) errors.push(`${row}E-Mail doppelt eingetragen: ${p.email}`);
    seen.add(p.email);
  });
  if (errors.length) throw new PeopleInputError(errors.slice(0, 10).join(" "));

  const taken = await tx.select({ email: users.email }).from(users).where(inArray(users.email, people.map((p) => p.email)));
  if (taken.length) throw new PeopleInputError(`Diese E-Mail gibt es an der Schule schon: ${taken.map((t) => t.email).slice(0, 10).join(", ")}.`);

  for (const p of people) await createPerson(tx, actor.organizationId, p);
  const count = (role: Role) => people.filter((p) => p.role === role).length;
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId,
    action: "person.created",
    entity: "organization",
    entityId: actor.organizationId,
    meta: { anzahl: people.length, teilnehmende: count("LEARNER"), lehrkraefte: count("TEACHER"), verwaltung: count("STAFF") },
  });
  return { created: people.length };
}
