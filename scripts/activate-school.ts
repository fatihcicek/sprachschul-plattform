// Betreiber-Werkzeug: schaltet eine Schule nach der Testzeit frei, sperrt sie oder verlängert die Testzeit.
// Aufruf: npm run school:status -- <kurzname> ACTIVE|SUSPENDED
//         npm run school:status -- <kurzname> TRIAL <tage ab jetzt>

import { sql } from "drizzle-orm";
import { createDb, withOrganization, withSlugLookup } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { eq } from "drizzle-orm";

const [slug, status, daysRaw] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt");
if (!slug || !["ACTIVE", "SUSPENDED", "TRIAL"].includes(status ?? "")) throw new Error("Aufruf: school:status <kurzname> ACTIVE|SUSPENDED|TRIAL [tage]");
const days = Number(daysRaw);
if (status === "TRIAL" && !(Number.isInteger(days) && days >= 1 && days <= 90)) throw new Error("TRIAL braucht eine Zahl Tage von 1 bis 90.");

const { db, pool } = createDb(url);
(async () => {
  const [org] = await withSlugLookup(db, slug, (tx) => tx.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.slug, slug)));
  const done = org
    ? await withOrganization(db, org.id, async (tx) => {
        // Nur dieses Werkzeug setzt den Betreiber-Schalter; die App ändert Status und Testende nie selbst.
        await tx.execute(sql`select set_config('app.operator', 'on', true)`);
        const trialEndsAt = status === "TRIAL" ? new Date(Date.now() + days * 86_400_000) : null;
        await tx.update(organizations).set({ status: status as "ACTIVE" | "SUSPENDED" | "TRIAL", trialEndsAt }).where(eq(organizations.id, org.id));
        return org.name;
      })
    : undefined;
  console.log(done ? `Schule „${done}“ steht jetzt auf ${status}${status === "TRIAL" ? ` (noch ${days} Tage)` : ""}.` : `Die Schule „${slug}“ gibt es nicht.`);
})()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
