import { createDb, type Db } from "./client";

let cached: Db | undefined;

/** Datenbankverbindung der laufenden Anwendung. */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");
    cached = createDb(url).db;
  }
  return cached;
}
