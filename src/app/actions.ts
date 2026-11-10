"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, loginAs, setSession } from "@/server/session";
import { getDb } from "@/db";
import { authenticate, inviteAsActor, redeemInvitation } from "@/server/auth";
import { headers } from "next/headers";
import { asSessionUser } from "@/server/context";
import * as svc from "@/server/assignments";
import * as courseSvc from "@/server/courses";

export async function login(formData: FormData) {
  await loginAs(String(formData.get("membershipId") ?? ""));
  redirect("/");
}

export type FormState = { error?: string } | undefined;

/** Anmeldung mit E-Mail und Passwort. Die Meldung verrät nie, ob Schule oder E-Mail existieren. */
export async function passwordLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const r = await authenticate(
    await getDb(),
    String(formData.get("school") ?? ""),
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!r.ok) {
    return { error: r.reason === "locked" ? "Zu viele Versuche. Bitte warte 15 Minuten und versuche es dann erneut." : "Schule, E-Mail oder Passwort stimmen nicht." };
  }
  await setSession({ membershipId: r.membershipId, organizationId: r.organizationId });
  redirect("/");
}

/** Passwort über einen Einladungslink setzen und danach anmelden lassen. */
export async function setPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("password2") ?? "")) return { error: "Die beiden Passwörter sind nicht gleich." };
  const r = await redeemInvitation(await getDb(), token, password);
  if (!r.ok) return { error: r.message };
  redirect("/login?neu=1");
}

/** Erzeugt einen Einladungslink für eine Person der Schule. Der Link wird einmal angezeigt. */
export async function inviteAction(targetMembershipId: string): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; message: string }> {
  try {
    const { token, expiresAt } = await asSessionUser((tx, me) => inviteAsActor(tx, me, targetMembershipId));
    revalidatePath("/verwaltung/personen");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return { ok: true, link: `${proto}://${host}/einladung/${token}`, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    if (e instanceof svc.NotAllowedError) return { ok: false, message: "Dafür fehlt dir die Berechtigung." };
    throw e;
  }
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

type Result = { ok: true } | { ok: false; message: string };

async function guarded(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof svc.SubmissionRuleError || e instanceof svc.NotAllowedError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function saveDraftAction(assignmentId: string, text: string): Promise<Result> {
  return guarded(() => asSessionUser((tx, me) => svc.saveDraft(tx, me, assignmentId, text)));
}

export async function submitAction(assignmentId: string, text: string): Promise<Result> {
  const r = await guarded(() => asSessionUser((tx, me) => svc.submitAssignment(tx, me, assignmentId, text)));
  revalidatePath("/aufgaben");
  return r;
}

export async function createAssignmentAction(formData: FormData) {
  const dueRaw = String(formData.get("dueAt") ?? "");
  await asSessionUser((tx, me) =>
    svc.createAssignment(tx, me, {
      courseId: String(formData.get("courseId")),
      title: String(formData.get("title") ?? ""),
      instructions: String(formData.get("instructions") ?? ""),
      dueAt: dueRaw ? new Date(dueRaw) : null,
    }),
  );
  revalidatePath("/lehrkraft");
}

export async function feedbackAction(submissionId: string, formData: FormData) {
  await asSessionUser((tx, me) => svc.giveFeedback(tx, me, submissionId, String(formData.get("comment") ?? "")));
  redirect("/lehrkraft");
}

// ---- Verwaltung: Kurs anlegen ----


export type CreateCourseResult = { ok: true; courseId: string; sessions: number; learners: number } | { ok: false; message: string };

export async function createCourseAction(input: unknown): Promise<CreateCourseResult> {
  try {
    const r = await asSessionUser((tx, me) => courseSvc.createCourse(tx, me, input));
    revalidatePath("/verwaltung");
    return { ok: true, courseId: r.courseId, sessions: r.sessions, learners: r.learners };
  } catch (e) {
    if (e instanceof courseSvc.CourseInputError || e instanceof svc.NotAllowedError) return { ok: false, message: e.message };
    throw e;
  }
}
