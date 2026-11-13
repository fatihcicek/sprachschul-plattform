// Eine im Leerlauf gekappte Datenbankverbindung (Datenbank-Neustart, DROP DATABASE
// ... WITH (FORCE) beim Aufräumen) darf den Prozess nicht abstürzen lassen.
// Ohne Fehlerbehandlung am Pool wirft pg dabei einen unbehandelten Fehler.

import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt");

const { db, pool } = createDb(url);
afterAll(() => pool.end());

describe("Leerlaufverbindung wird gekappt", () => {
  it("löst keinen unbehandelten Fehler aus und der Pool verbindet sich neu", async () => {
    const res = (await db.execute(sql`select pg_backend_pid() as pid`)) as unknown as { rows: { pid: number }[] };
    const pid = res.rows[0]!.pid;

    const admin = new Client({ connectionString: url });
    await admin.connect();
    try {
      await admin.query("select pg_terminate_backend($1)", [pid]);
    } finally {
      await admin.end();
    }
    // Der Fehler trifft die Leerlaufverbindung asynchron; kurz warten, damit er ankommt.
    await new Promise((r) => setTimeout(r, 300));

    const again = (await db.execute(sql`select 1 as ok`)) as unknown as { rows: { ok: number }[] };
    const ok = again.rows[0]!.ok;
    expect(ok).toBe(1);
  });
});
