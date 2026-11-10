import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Name der Rolle, unter der die eingebettete Datenbank Schuldaten liest und schreibt. */
export const APP_ROLE = "kurswerk_app";

// Verbindungen, die als Datenbank-Superuser laufen (eingebettete Datenbank).
// Superuser umgehen die Zeilensicherheit, deshalb wechseln sie pro Transaktion
// in die eingeschränkte Rolle.
const superuserDbs = new WeakSet<object>();

export function markSuperuser(db: Db) {
  superuserDbs.add(db);
}

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }) as unknown as Db, pool };
}

async function restrict(db: Db, tx: Tx) {
  if (superuserDbs.has(db)) await tx.execute(sql.raw(`set local role ${APP_ROLE}`));
}

/**
 * Der einzige vorgesehene Weg, Daten einer Schule zu lesen oder zu schreiben.
 * Setzt die Schule für genau diese Transaktion; die Zeilensicherheit der
 * Datenbank lässt danach nur deren Zeilen durch. Außerhalb davon liefert jede
 * Abfrage auf Schuldaten nichts.
 */
export function withOrganization<T>(db: Db, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await restrict(db, tx);
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}

/** Findet eine Schule über ihren Kurznamen, bevor jemand angemeldet ist. */
export function withSlugLookup<T>(db: Db, slug: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await restrict(db, tx);
    await tx.execute(sql`select set_config('app.lookup_slug', ${slug}, true)`);
    return fn(tx);
  });
}

/**
 * Zugriff auf Registrierungsdaten, die noch keiner Schule gehören. Die Datenbank zeigt nur Zeilen,
 * für die hier das Geheimnis angegeben wird: den Hash des Bestätigungslinks (tokenHash) bzw. die
 * Zählschlüssel (keys). organizationId wird nur beim Anlegen einer neuen Schule gesetzt.
 */
export function withRegistrationAccess<T>(
  db: Db,
  access: { tokenHash?: string; keys?: string[]; organizationId?: string; purgeExpired?: boolean },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await restrict(db, tx);
    if (access.tokenHash) await tx.execute(sql`select set_config('app.registration_token_hash', ${access.tokenHash}, true)`);
    if (access.keys?.length) await tx.execute(sql`select set_config('app.registration_keys', ${access.keys.join(",")}, true)`);
    if (access.organizationId) await tx.execute(sql`select set_config('app.organization_id', ${access.organizationId}, true)`);
    if (access.purgeExpired) await tx.execute(sql`select set_config('app.registration_purge', '1', true)`);
    return fn(tx);
  });
}
