// Die eingebettete Datenbank (für Testinstallationen auf Shared Hosting) muss
// dieselben Schutzregeln einhalten wie der PostgreSQL-Server, obwohl sie
// intern als Superuser läuft.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrganization, withSlugLookup, type Db } from "@/db/client";
import { openEmbeddedDb } from "@/db/embedded";
import * as s from "@/db/schema";
import * as svc from "@/server/assignments";

let db: Db;

beforeAll(async () => {
  db = await openEmbeddedDb(mkdtempSync(path.join(tmpdir(), "kw-pglite-")), { migrationsFolder: "drizzle", seed: true });
}, 60_000);

describe("Eingebettete Datenbank", () => {
  it("legt die Beispielschule genau einmal an", async () => {
    const { seedDemo } = await import("@/db/seed");
    expect(await seedDemo(db)).toBe(false);
  });

  it("findet die Schule nur über ihren Kurznamen und sieht sonst nichts", async () => {
    const found = await withSlugLookup(db, "beispielschule", (tx) => tx.select().from(s.organizations));
    expect(found).toHaveLength(1);
    const none = await withSlugLookup(db, "gibtsnicht", (tx) => tx.select().from(s.memberships));
    expect(none).toEqual([]);
  });

  it("trennt Schulen auch hier über die Zeilensicherheit", async () => {
    const [org] = await withSlugLookup(db, "beispielschule", (tx) => tx.select().from(s.organizations));
    const own = await withOrganization(db, org!.id, (tx) => tx.select().from(s.memberships));
    expect(own.length).toBe(10);
    const foreign = await withOrganization(db, "00000000-0000-0000-0000-000000000000", (tx) => tx.select().from(s.memberships));
    expect(foreign).toEqual([]);
  });

  it("führt den Aufgabenablauf durch und schützt Versionen", async () => {
    const [org] = await withSlugLookup(db, "beispielschule", (tx) => tx.select().from(s.organizations));
    const run = <T>(fn: Parameters<typeof withOrganization<T>>[2]) => withOrganization(db, org!.id, fn);
    const people = await run((tx) => tx.select().from(s.memberships));
    const learner = people.find((p) => p.role === "LEARNER")!;
    const teacher = people.find((p) => p.role === "TEACHER")!;
    const [task] = await run((tx) => svc.listForLearner(tx, learner.id));
    await run((tx) => svc.saveDraft(tx, learner.id, task!.assignment.id, "Sehr geehrte Damen und Herren,"));
    await run((tx) => svc.submitAssignment(tx, learner.id, task!.assignment.id));
    const sub = (await run((tx) => svc.listForTeacher(tx, teacher.id))).flatMap((x) => x.submissions)[0]!;
    await run((tx) => svc.giveFeedback(tx, teacher.id, sub.id, "Gut."));
    await expect(run((tx) => tx.update(s.submissionVersions).set({ text: "x" }).where(eq(s.submissionVersions.submissionId, sub.id)))).rejects.toThrow();
  });
});
