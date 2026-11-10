// Legt eine neue Schule mit erster Leitung an und gibt den Einladungslink aus.
// Aufruf: npm run school:create -- <kurzname> "<Schulname>" <leitung@mail> "<Vorname>" "<Nachname>" [https://adresse]

import { randomUUID } from "node:crypto";
import { createDb, withOrganization, withSlugLookup } from "../src/db/client";
import * as s from "../src/db/schema";
import { createInvitation } from "../src/server/auth";
import { createPerson } from "../src/server/people";

const [slug, name, email, first, last, base = "http://localhost:3000"] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt");
if (!slug || !name || !email || !first || !last) throw new Error('Aufruf: school:create <kurzname> "<Schulname>" <email> "<Vorname>" "<Nachname>" [basis-url]');
if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw new Error("Kurzname: 3–40 Zeichen, nur a–z, 0–9 und Bindestrich");

const { db, pool } = createDb(url);
(async () => {
  const [existing] = await withSlugLookup(db, slug, (tx) => tx.select({ id: s.organizations.id }).from(s.organizations));
  if (existing) throw new Error(`Die Schule „${slug}“ gibt es schon.`);
  const orgId = randomUUID();
  const token = await withOrganization(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name, slug });
    const { membershipId } = await createPerson(tx, orgId, { email, firstName: first, lastName: last, role: "ADMIN" });
    return (await createInvitation(tx, orgId, membershipId, null)).token;
  });
  console.log(`Schule „${name}“ angelegt. Einladungslink für die Leitung (7 Tage, einmalig):\n${base}/einladung/${token}`);
})()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
