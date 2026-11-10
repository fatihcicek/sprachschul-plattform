"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, loginAs } from "@/server/session";
import { asSessionUser } from "@/server/context";
import * as svc from "@/server/assignments";

export async function login(formData: FormData) {
  await loginAs(String(formData.get("membershipId") ?? ""));
  redirect("/");
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
