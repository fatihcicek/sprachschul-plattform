// Aufgabenablauf gegen eine echte Datenbank: Entwurf, Abgabe, Rückmeldung,
// Überarbeitung, Rechte und Unveränderlichkeit der Versionen.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withOrganization, type Db } from "@/db/client";
import * as s from "@/db/schema";
import { createPerson } from "@/server/people";
import { isLate, prepareSubmit, assertCanReview, SubmissionRuleError, wordCount } from "@/domain/submission";
import * as svc from "@/server/assignments";

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
let orgId: string;
let teacher: string;
let otherTeacher: string;
let learner: string;
let outsider: string;
let courseId: string;
let assignmentId: string;

const run = <T>(fn: (tx: Parameters<Parameters<typeof withOrganization>[2]>[0]) => Promise<T>) => withOrganization(db, orgId, fn);

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  ({ db, pool } = createDb(testUrl.toString()));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  orgId = randomUUID();
  await run(async (tx) => {
    await tx.insert(s.organizations).values({ id: orgId, name: "Schule", slug: "schule" });
    const member = async (role: (typeof s.role.enumValues)[number], first: string) => {
      return (await createPerson(tx, orgId, { email: `${first}@schule.test`, firstName: first, lastName: "Test", role })).membershipId;
    };
    teacher = await member("TEACHER", "lehrkraft");
    otherTeacher = await member("TEACHER", "vertretung");
    learner = await member("LEARNER", "eins");
    outsider = await member("LEARNER", "zwei");
    const [course] = await tx.insert(s.courses).values({ organizationId: orgId, name: "K", category: "BSK B2", status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26" }).returning();
    const [other] = await tx.insert(s.courses).values({ organizationId: orgId, name: "K2", category: "BSK B2", status: "ACTIVE", startDate: "2026-09-01", endDate: "2027-02-26" }).returning();
    courseId = course!.id;
    await tx.insert(s.teachingAssignments).values([
      { organizationId: orgId, courseId, membershipId: teacher },
      { organizationId: orgId, courseId: other!.id, membershipId: otherTeacher },
    ]);
    await tx.insert(s.enrollments).values([
      { organizationId: orgId, courseId, membershipId: learner, startsOn: "2026-09-01" },
      { organizationId: orgId, courseId: other!.id, membershipId: outsider, startsOn: "2026-09-01" },
    ]);
  });
}, 60_000);

afterAll(async () => {
  await pool.end();
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

describe("Regeln einer Abgabe", () => {
  it("lehnt leere Abgaben und leere Rückmeldungen ab", () => {
    expect(() => prepareSubmit("DRAFT", "   ")).toThrow(SubmissionRuleError);
    expect(() => assertCanReview("SUBMITTED", " ")).toThrow(SubmissionRuleError);
  });
  it("sperrt abgegebene Texte und verlangt eine Abgabe für die Rückmeldung", () => {
    expect(() => prepareSubmit("SUBMITTED", "Text")).toThrow(SubmissionRuleError);
    expect(() => assertCanReview("DRAFT", "gut")).toThrow(SubmissionRuleError);
    expect(prepareSubmit("RETURNED", " Text ")).toBe("Text");
  });
  it("erkennt verspätete Abgaben und zählt Wörter", () => {
    expect(isLate(new Date("2026-11-10T10:00:00Z"), new Date("2026-11-10T10:00:01Z"))).toBe(true);
    expect(isLate(null, new Date())).toBe(false);
    expect(wordCount("  Ich  wohne in Berlin ")).toBe(4);
  });
});

describe("Aufgabenablauf", () => {
  it("lässt nur zugeordnete Lehrkräfte Aufgaben stellen", async () => {
    await expect(run((tx) => svc.createAssignment(tx, otherTeacher, { courseId, title: "X", instructions: "" }))).rejects.toBeInstanceOf(svc.NotAllowedError);
    await expect(run((tx) => svc.createAssignment(tx, learner, { courseId, title: "X", instructions: "" }))).rejects.toBeInstanceOf(svc.NotAllowedError);
    const a = await run((tx) => svc.createAssignment(tx, teacher, { courseId, title: "Beschwerdebrief", instructions: "Schreiben Sie 120 Wörter." }));
    assignmentId = a.id;
  });

  it("zeigt Aufgaben nur den Teilnehmenden des Kurses", async () => {
    expect(await run((tx) => svc.listForLearner(tx, learner))).toHaveLength(1);
    expect(await run((tx) => svc.listForLearner(tx, outsider))).toHaveLength(0);
    await expect(run((tx) => svc.getForLearner(tx, outsider, assignmentId))).rejects.toBeInstanceOf(svc.NotAllowedError);
    await expect(run((tx) => svc.saveDraft(tx, outsider, assignmentId, "x"))).rejects.toBeInstanceOf(svc.NotAllowedError);
  });

  it("speichert Entwürfe und gibt als Version 1 ab", async () => {
    await run((tx) => svc.saveDraft(tx, learner, assignmentId, "Sehr geehrte Damen"));
    await run((tx) => svc.saveDraft(tx, learner, assignmentId, "Sehr geehrte Damen und Herren,"));
    const v = await run((tx) => svc.submitAssignment(tx, learner, assignmentId));
    expect(v.versionNo).toBe(1);
    expect(v.text).toBe("Sehr geehrte Damen und Herren,");
  });

  it("sperrt die Bearbeitung, solange die Abgabe bei der Lehrkraft liegt", async () => {
    await expect(run((tx) => svc.saveDraft(tx, learner, assignmentId, "geändert"))).rejects.toBeInstanceOf(SubmissionRuleError);
    await expect(run((tx) => svc.submitAssignment(tx, learner, assignmentId))).rejects.toBeInstanceOf(SubmissionRuleError);
  });

  it("zeigt die Abgabe nur der Lehrkraft des Kurses", async () => {
    const list = await run((tx) => svc.listForTeacher(tx, teacher));
    expect(list[0]!.submissions).toHaveLength(1);
    expect(await run((tx) => svc.listForTeacher(tx, otherTeacher))).toEqual([]);
    const sub = list[0]!.submissions[0]!;
    await expect(run((tx) => svc.getForTeacher(tx, otherTeacher, sub.id))).rejects.toBeInstanceOf(svc.NotAllowedError);
    await expect(run((tx) => svc.giveFeedback(tx, otherTeacher, sub.id, "Hallo"))).rejects.toBeInstanceOf(svc.NotAllowedError);
  });

  it("gibt Rückmeldung, danach Überarbeitung und Version 2", async () => {
    const sub = (await run((tx) => svc.listForTeacher(tx, teacher)))[0]!.submissions[0]!;
    await run((tx) => svc.giveFeedback(tx, teacher, sub.id, "Gute Anrede. Bitte den Grund der Beschwerde ergänzen."));
    await expect(run((tx) => svc.giveFeedback(tx, teacher, sub.id, "nochmal"))).rejects.toBeInstanceOf(SubmissionRuleError);

    const mine = await run((tx) => svc.getForLearner(tx, learner, assignmentId));
    expect(mine.submission!.status).toBe("RETURNED");
    expect(mine.versions[0]!.feedback!.comment).toContain("Grund der Beschwerde");

    await run((tx) => svc.saveDraft(tx, learner, assignmentId, "Sehr geehrte Damen und Herren, mein Paket kam kaputt an."));
    const v2 = await run((tx) => svc.submitAssignment(tx, learner, assignmentId));
    expect(v2.versionNo).toBe(2);
    const after = await run((tx) => svc.getForLearner(tx, learner, assignmentId));
    expect(after.versions.map((x) => x.version.versionNo)).toEqual([2, 1]);
    expect(after.versions[1]!.feedback).not.toBeNull();
    expect(after.versions[0]!.feedback).toBeNull();
  });
});

describe("Unveränderlichkeit", () => {
  it("verbietet das Ändern und Löschen von Versionen und Rückmeldungen", async () => {
    await expect(run((tx) => tx.update(s.submissionVersions).set({ text: "gefälscht" }))).rejects.toThrow();
    await expect(run((tx) => tx.delete(s.submissionVersions))).rejects.toThrow();
    await expect(run((tx) => tx.update(s.feedbacks).set({ comment: "gefälscht" }))).rejects.toThrow();
    await expect(run((tx) => tx.delete(s.feedbacks))).rejects.toThrow();
  });
});
