// Eingebettete Datenbank (PGlite: PostgreSQL als WebAssembly im selben Prozess).
// Für Testinstallationen ohne eigenen Datenbankserver, z. B. auf Shared Hosting.
// Gleiche Migrationen, gleiche Zeilensicherheit; nur ein Prozess darf sie öffnen.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { APP_ROLE, markSuperuser, type Db } from "./client";
import * as schema from "./schema";
import { seedDemo } from "./seed";

export async function openEmbeddedDb(dataDir: string, options: { migrationsFolder: string; seed: boolean }): Promise<Db> {
  const client = await PGlite.create(dataDir);
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: options.migrationsFolder });
  await client.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then create role ${APP_ROLE} nologin; end if;
    end $$;
    grant usage on schema public to ${APP_ROLE};
    grant select, insert, update, delete on all tables in schema public to ${APP_ROLE};
  `);
  markSuperuser(db);
  if (options.seed) await seedDemo(db);
  return db;
}
