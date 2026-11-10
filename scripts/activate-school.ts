// Betreiber-Werkzeug: schaltet eine Schule nach der Testzeit frei, sperrt sie oder verlängert die Testzeit.
// Aufruf: npm run school:status -- <kurzname> ACTIVE|SUSPENDED
//         npm run school:status -- <kurzname> TRIAL <tage ab jetzt>
//
// Nutzt dieselbe Datenbankverbindung wie die App (DATABASE_URL), also auch die eingebettete Datenbank der
// Testumgebung (pglite:…). Die eingebettete Datenbank verträgt nur einen Prozess zugleich: Auf der
// Testumgebung die App für diesen Moment nicht gleichzeitig laufen lassen.

import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { withOrganization, withSlugLookup } from "../src/db/client";
import { auditEvents, organizations } from "../src/db/schema";

const [slug, status, daysRaw] = process.argv.slice(2);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
if (!slug || !["ACTIVE", "SUSPENDED", "TRIAL"].includes(status ?? "")) throw new Error("Aufruf: school:status <kurzname> ACTIVE|SUSPENDED|TRIAL [tage]");
const days = Number(daysRaw);
if (status === "TRIAL" && !(Number.isInteger(days) && days >= 1 && days <= 90)) throw new Error("TRIAL braucht eine Zahl Tage von 1 bis 90.");

(async () => {
  const db = await getDb();
  const [org] = await withSlugLookup(db, slug, (tx) => tx.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.slug, slug)));
  if (!org) {
    console.log(`Die Schule „${slug}“ gibt es nicht.`);
    return;
  }
  const before = await withOrganization(db, org.id, async (tx) => {
    const [o] = await tx.select({ status: organizations.status, trialEndsAt: organizations.trialEndsAt }).from(organizations).where(eq(organizations.id, org.id));
    // Nur dieses Werkzeug setzt den Betreiber-Schalter; die App ändert Status und Testende nie selbst.
    await tx.execute(sql`select set_config('app.operator', 'on', true)`);
    const trialEndsAt = status === "TRIAL" ? new Date(Date.now() + days * 86_400_000) : null;
    await tx.update(organizations).set({ status: status as "ACTIVE" | "SUSPENDED" | "TRIAL", trialEndsAt }).where(eq(organizations.id, org.id));
    await tx.insert(auditEvents).values({
      organizationId: org.id,
      actorMembershipId: null,
      action: "organization.status_changed",
      entity: "organization",
      entityId: org.id,
      meta: { von: o?.status ?? null, nach: status, tage: status === "TRIAL" ? days : null, durch: "betreiber-skript" },
    });
    return o?.status ?? "unbekannt";
  });
  console.log(`Schule „${org.name}“: ${before} → ${status}${status === "TRIAL" ? ` (noch ${days} Tage)` : ""}.`);
})()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
