// Legt die Beispielschule in der Datenbank aus DATABASE_URL an.

import { createDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (siehe .env.example)");
const { db, pool } = createDb(url);
seedDemo(db)
  .then((created) => console.log(created ? "Beispielschule angelegt." : "Beispieldaten sind schon vorhanden."))
  .finally(() => pool.end());
