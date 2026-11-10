import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

/**
 * Der einzige vorgesehene Weg, Daten einer Schule zu lesen oder zu schreiben.
 * Setzt die Schule für genau diese Transaktion; die Zeilensicherheit der
 * Datenbank lässt danach nur deren Zeilen durch. Außerhalb davon liefert jede
 * Abfrage auf Schuldaten nichts.
 */
export function withOrganization<T>(db: Db, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
