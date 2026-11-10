// Testzeit und Sperre durchsetzen. Die Entscheidung trifft organizationAccess() in permissions.ts;
// hier wird sie an der Datenbank erzwungen: Bei abgelaufener Testzeit läuft die ganze Transaktion
// schreibgeschützt. So kann keine Serveraktion die Sperre vergessen, auch keine künftige.

import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { organizations } from "@/db/schema";
import { organizationAccess, type OrganizationAccess } from "@/domain/permissions";

export class ReadOnlyError extends Error {
  constructor() {
    super("Die Testzeit ist abgelaufen. Deine Daten bleiben sichtbar, Änderungen sind erst nach der Freischaltung möglich.");
  }
}

/** Zustand der Schule der laufenden Transaktion (die Zeilensicherheit zeigt nur die eigene Zeile). */
export async function loadAccess(tx: Tx, now: Date = new Date()): Promise<OrganizationAccess> {
  const [org] = await tx.select({ status: organizations.status, trialEndsAt: organizations.trialEndsAt }).from(organizations);
  // Eine Schule ohne lesbare Zeile gibt es nicht; im Zweifel gesperrt statt offen.
  if (!org) return { mode: "BLOCKED", trialDaysLeft: null };
  return organizationAccess(org, now);
}

/** Setzt bei abgelaufener Testzeit die Transaktion auf „nur lesen“ und gibt den Zustand zurück. */
export async function enforceAccess(tx: Tx, now: Date = new Date()): Promise<OrganizationAccess> {
  const access = await loadAccess(tx, now);
  if (access.mode === "READ_ONLY") await tx.execute(sql`set transaction read only`);
  return access;
}

/** Datenbankfehler „schreiben in nur-lesender Transaktion“ (SQLSTATE 25006), auch wenn der Treiber ihn verpackt. */
export function isReadOnlyViolation(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && typeof cur === "object" && i < 5; i++, cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === "25006") return true;
  }
  return false;
}

