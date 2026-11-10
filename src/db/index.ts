import path from "node:path";
import { createDb, type Db } from "./client";

let cached: Promise<Db> | undefined;

/**
 * Datenbankverbindung der laufenden Anwendung.
 * DATABASE_URL="postgresql://…" verbindet mit einem PostgreSQL-Server.
 * DATABASE_URL="pglite:/pfad/zum/ordner" öffnet die eingebettete Datenbank,
 * spielt die Migrationen ein und legt bei DEMO_SEED=1 die Beispielschule an.
 */
export function getDb(): Promise<Db> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");
    if (url.startsWith("pglite:")) {
      cached = import("./embedded").then((m) =>
        m.openEmbeddedDb(url.slice("pglite:".length), {
          migrationsFolder: process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle"),
          seed: process.env.DEMO_SEED === "1",
        }),
      );
      cached.catch(() => (cached = undefined));
    } else {
      cached = Promise.resolve(createDb(url).db);
    }
  }
  return cached;
}
