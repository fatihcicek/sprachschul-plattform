import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/db/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");

const { db, pool } = createDb(url);
migrate(db as never, { migrationsFolder: "drizzle" })
  .then(() => console.log("Migrationen angewendet."))
  .finally(() => pool.end());
