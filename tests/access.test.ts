// Testzeit und Sperre: Regeln ohne Datenbank, Durchsetzung gegen eine echte Datenbank.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { canWriteInOrganization, organizationAccess } from "@/domain/permissions";
import { enforceAccess, isReadOnlyViolation, loadAccess } from "@/server/access";

if (existsSync(".env")) process.loadEnvFile(".env");
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL fehlt");
const name = `kurswerk_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${name}`;

let db: Db;
let pool: Pool;
const END = new Date("2026-10-08T10:00:00Z"); // Ende der Testzeit
const at = (offsetMs: number) => new Date(END.getTime() + offsetMs);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("Zugriffsmodus (ohne Datenbank)", () => {
  const trial = { status: "TRIAL" as const, trialEndsAt: END };
  it("zählt die Resttage, am letzten Tag ist es 1", () => {
    expect(organizationAccess(trial, at(-7 * DAY))).toMatchObject({ mode: "FULL", trialDaysLeft: 7 });
    expect(organizationAccess(trial, at(-6 * DAY - HOUR))).toMatchObject({ mode: "FULL", trialDaysLeft: 7 });
    expect(organizationAccess(trial, at(-6 * DAY))).toMatchObject({ mode: "FULL", trialDaysLeft: 6 });
    expect(organizationAccess(trial, at(-HOUR))).toMatchObject({ mode: "FULL", trialDaysLeft: 1 });
  });
  it("erlaubt Schreiben bis zur letzten Millisekunde, danach nur lesen", () => {
    expect(organizationAccess(trial, END).mode).toBe("FULL");
    expect(organizationAccess(trial, at(1)).mode).toBe("READ_ONLY");
    expect(organizationAccess(trial, at(30 * DAY))).toMatchObject({ mode: "READ_ONLY", trialDaysLeft: 0 });
  });
  it("lässt freigeschaltete Schulen voll arbeiten, auch lange nach dem alten Testende", () => {
    expect(organizationAccess({ status: "ACTIVE", trialEndsAt: END }, at(400 * DAY))).toMatchObject({ mode: "FULL", trialDaysLeft: null });
    expect(organizationAccess({ status: "ACTIVE", trialEndsAt: null }, END).mode).toBe("FULL");
  });
  it("sperrt gesperrte Schulen ganz, auch innerhalb der Testzeit", () => {
    expect(organizationAccess({ status: "SUSPENDED", trialEndsAt: END }, at(-DAY)).mode).toBe("BLOCKED");
  });
  it("behandelt eine Testschule ohne Ende vorsichtshalber als schreibgeschützt", () => {
    expect(organizationAccess({ status: "TRIAL", trialEndsAt: null }, END).mode).toBe("READ_ONLY");
  });
  it("canWriteInOrganization ist nur bei FULL wahr", () => {
    expect(canWriteInOrganization({ mode: "FULL", trialDaysLeft: null, trialEndsAt: null })).toBe(true);
    expect(canWriteInOrganization({ mode: "READ_ONLY", trialDaysLeft: 0, trialEndsAt: null })).toBe(false);
    expect(canWriteInOrganization({ mode: "BLOCKED", trialDaysLeft: null, trialEndsAt: null })).toBe(false);
  });
  it("erkennt den Datenbankfehler für Schreiben in nur-lesender Transaktion, auch verpackt", () => {
    expect(isReadOnlyViolation({ code: "25006" })).toBe(true);
    expect(isReadOnlyViolation(new Error("x", { cause: { code: "25006" } }))).toBe(true);
    expect(isReadOnlyViolation({ code: "23505" })).toBe(false);
    expect(isReadOnlyViolation(null)).toBe(false);
  });
});

describe("Durchsetzung in der Datenbank", () => {
  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    ({ db, pool } = createDb(testUrl.toString()));
    await migrate(db as never, { migrationsFolder: "drizzle" });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    for (let i = 0; i < 50; i++) {
      const { rows } = await admin.query("select count(*)::int as n from pg_stat_activity where datname = $1", [name]);
      if (rows[0].n === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  async function school(status: "TRIAL" | "ACTIVE" | "SUSPENDED", trialEndsAt: Date | null) {
    const id = randomUUID();
    await withOrganization(db, id, (tx) => tx.insert(s.organizations).values({ id, name: "Schule", slug: `t-${id.slice(0, 8)}`, status, trialEndsAt }));
    return id;
  }
  /** Wie asSessionUser: Zugriff durchsetzen, dann etwas ändern und lesen. */
  const tryWrite = (id: string, now: Date) =>
    withOrganization(db, id, async (tx) => {
      const access = await enforceAccess(tx, now);
      await tx.update(s.organizations).set({ name: "Neu" });
      return access;
    });
  const read = (id: string, now: Date) =>
    withOrganization(db, id, async (tx) => {
      await enforceAccess(tx, now);
      return (await tx.select({ name: s.organizations.name }).from(s.organizations))[0]?.name;
    });

  it("lässt in der Testzeit Änderungen zu, auch am letzten Tag", async () => {
    const id = await school("TRIAL", END);
    expect((await tryWrite(id, at(-3 * DAY))).mode).toBe("FULL");
    expect((await tryWrite(id, at(-HOUR))).trialDaysLeft).toBe(1);
    expect(await read(id, at(-HOUR))).toBe("Neu");
  });

  it("verweigert nach Ablauf jede Änderung, zeigt aber die Daten weiter an", async () => {
    const id = await school("TRIAL", END);
    await tryWrite(id, at(-DAY));
    const err = await tryWrite(id, at(1)).catch((e) => e);
    expect(isReadOnlyViolation(err)).toBe(true);
    expect(await read(id, at(1))).toBe("Neu");
    expect(await read(id, at(60 * DAY))).toBe("Neu");
  });

  it("verweigert auch Einfügen und Löschen, nicht nur Ändern", async () => {
    const id = await school("TRIAL", END);
    const insert = withOrganization(db, id, async (tx) => {
      await enforceAccess(tx, at(1));
      await tx.insert(s.auditEvents).values({ organizationId: id, action: "TEST", entityType: "x", entityId: randomUUID() } as never);
    });
    expect(isReadOnlyViolation(await insert.catch((e) => e))).toBe(true);
    const del = withOrganization(db, id, async (tx) => {
      await enforceAccess(tx, at(1));
      await tx.delete(s.auditEvents);
    });
    expect(isReadOnlyViolation(await del.catch((e) => e))).toBe(true);
  });

  it("nach der Freischaltung geht Schreiben wieder, ohne Datenverlust", async () => {
    const id = await school("TRIAL", END);
    await tryWrite(id, at(-DAY));
    await withOrganization(db, id, async (tx) => {
      await tx.execute(sql`select set_config('app.operator', 'on', true)`);
      await tx.update(s.organizations).set({ status: "ACTIVE", trialEndsAt: null });
    });
    expect((await tryWrite(id, at(90 * DAY))).mode).toBe("FULL");
    expect(await read(id, at(90 * DAY))).toBe("Neu");
  });

  it("meldet gesperrte Schulen als BLOCKED", async () => {
    const id = await school("SUSPENDED", null);
    expect((await withOrganization(db, id, (tx) => loadAccess(tx, END))).mode).toBe("BLOCKED");
  });

  it("die App kann Status und Testende nicht selbst ändern", async () => {
    const id = await school("TRIAL", END);
    for (const patch of [{ status: "ACTIVE" as const, trialEndsAt: null }, { trialEndsAt: at(365 * DAY) }]) {
      const err = await withOrganization(db, id, (tx) => tx.update(s.organizations).set(patch)).catch((e: unknown) => e as { cause?: unknown });
      const inner = (err as { cause?: unknown }).cause ?? err;
      expect(JSON.stringify(inner, Object.getOwnPropertyNames(inner as object))).toContain("Betreiber");
    }
    const [o] = await withOrganization(db, id, (tx) => tx.select().from(s.organizations).where(eq(s.organizations.id, id)));
    expect(o?.status).toBe("TRIAL");
    expect(o?.trialEndsAt?.getTime()).toBe(END.getTime());
  });

  it("die Testzeit einer Schule beeinflusst andere Schulen nicht", async () => {
    const expired = await school("TRIAL", at(-DAY));
    const active = await school("ACTIVE", null);
    expect(isReadOnlyViolation(await tryWrite(expired, END).catch((e) => e))).toBe(true);
    expect((await tryWrite(active, END)).mode).toBe("FULL");
  });
});
