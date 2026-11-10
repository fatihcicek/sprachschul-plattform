"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, loginAs, setSession } from "@/server/session";
import { getDb } from "@/db";
import { authenticate, inviteAsActor, redeemInvitation } from "@/server/auth";
import { BusyError } from "@/domain/password";
import { headers } from "next/headers";
import { asSessionUser } from "@/server/context";
import * as svc from "@/server/assignments";
import * as courseSvc from "@/server/courses";
import * as teach from "@/server/teaching";
import { changeAttendanceStatus } from "@/server/attendance";
import { ReadOnlyError } from "@/server/access";

export async function login(formData: FormData) {
  await loginAs(String(formData.get("membershipId") ?? ""));
  redirect("/");
}

export type FormState = { error?: string } | undefined;

/** Anmeldung mit E-Mail und Passwort. Die Meldung verrät nie, ob Schule oder E-Mail existieren. */
export async function passwordLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  let r: Awaited<ReturnType<typeof authenticate>>;
  try {
    r = await authenticate(await getDb(), String(formData.get("school") ?? ""), String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (e) {
    if (e instanceof BusyError) return { error: e.message };
    throw e;
  }
  if (!r.ok) {
    return {
      error:
        r.reason === "locked"
          ? "Zu viele Versuche. Bitte warte 15 Minuten und versuche es dann erneut."
          : r.reason === "suspended"
            ? "Der Zugang dieser Schule ist gesperrt. Bitte wende dich an den Betreiber von Kurswerk."
            : "Schule, E-Mail oder Passwort stimmen nicht.",
    };
  }
  await setSession({ membershipId: r.membershipId, organizationId: r.organizationId, passwordVersion: r.passwordVersion });
  redirect("/");
}

/** Passwort über einen Einladungslink setzen und danach anmelden lassen. */
export async function setPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("password2") ?? "")) return { error: "Die beiden Passwörter sind nicht gleich." };
  let r: Awaited<ReturnType<typeof redeemInvitation>>;
  try {
    r = await redeemInvitation(await getDb(), token, password);
  } catch (e) {
    if (e instanceof BusyError) return { error: e.message };
    throw e;
  }
  if (!r.ok) return { error: r.message };
  redirect(`/login?neu=1&schule=${encodeURIComponent(r.slug)}`);
}

/** Erzeugt einen Einladungslink für eine Person der Schule. Der Link wird einmal angezeigt. */
export async function inviteAction(targetMembershipId: string): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; message: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetMembershipId)) return { ok: false, message: "Unbekannte Person." };
  try {
    const { token, expiresAt } = await asSessionUser((tx, me) => inviteAsActor(tx, me, targetMembershipId));
    revalidatePath("/verwaltung/personen");
    // Feste Adresse aus der Konfiguration, wenn gesetzt: Header kann man fälschen.
    let base = process.env.APP_URL?.replace(/\/+$/, "");
    if (!base) {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
      base = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
    }
    return { ok: true, link: `${base}/einladung/${token}`, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    if (e instanceof svc.NotAllowedError) return { ok: false, message: "Dafür fehlt dir die Berechtigung." };
    if (e instanceof ReadOnlyError) return { ok: false, message: e.message };
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
    if (e instanceof svc.SubmissionRuleError || e instanceof svc.NotAllowedError || e instanceof ReadOnlyError) return { ok: false, message: e.message };
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
  try {
    await asSessionUser((tx, me) =>
      svc.createAssignment(tx, me, {
        courseId: String(formData.get("courseId")),
        title: String(formData.get("title") ?? ""),
        instructions: String(formData.get("instructions") ?? ""),
        dueAt: dueRaw ? new Date(dueRaw) : null,
      }),
    );
  } catch (e) {
    // Abgelaufene Testzeit: zurück auf die Seite, deren Hinweisleiste den Grund nennt.
    if (!(e instanceof ReadOnlyError)) throw e;
  }
  revalidatePath("/lehrkraft");
}

export async function feedbackAction(submissionId: string, formData: FormData) {
  try {
    await asSessionUser((tx, me) => svc.giveFeedback(tx, me, submissionId, String(formData.get("comment") ?? "")));
  } catch (e) {
    if (!(e instanceof ReadOnlyError)) throw e;
  }
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
    if (e instanceof courseSvc.CourseInputError || e instanceof svc.NotAllowedError || e instanceof ReadOnlyError) return { ok: false, message: e.message };
    throw e;
  }
}


// ---- Unterricht: Kursraum ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["PRESENT", "PARTIAL", "ABSENT", "EXCUSED"] as const;
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

type RoomResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function room<T extends object = object>(sessionId: unknown, fn: (tx: Parameters<Parameters<typeof asSessionUser>[0]>[0], me: string) => Promise<T | void>): Promise<RoomResult<T>> {
  if (!isId(sessionId)) return { ok: false, message: "Unbekannter Termin." };
  try {
    const extra = await asSessionUser(fn);
    revalidatePath(`/unterricht/${sessionId}`);
    revalidatePath("/unterricht");
    revalidatePath("/verwaltung/heute");
    return { ok: true, ...((extra ?? {}) as T) };
  } catch (e) {
    if (e instanceof teach.NotAllowedError) return { ok: false, message: "Dafür fehlt dir die Berechtigung." };
    if (e instanceof teach.TeachingRuleError || e instanceof teach.AttendanceRuleError || e instanceof ReadOnlyError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function proposeAttendanceAction(sessionId: string): Promise<RoomResult> {
  return room(sessionId, async (tx, me) => { await teach.proposeAsActor(tx, me, sessionId); });
}
export async function confirmAttendanceAction(sessionId: string): Promise<RoomResult> {
  return room(sessionId, async (tx, me) => { await teach.confirmAllAsActor(tx, me, sessionId); });
}
export async function setStatusAction(sessionId: string, recordId: string, status: string, reason: string): Promise<RoomResult> {
  if (!isId(recordId) || typeof status !== "string" || !(STATUSES as readonly string[]).includes(status) || typeof reason !== "string") return { ok: false, message: "Ungültige Angabe." };
  return room(sessionId, async (tx, me) => { await changeAttendanceStatus(tx, me, recordId, status as (typeof STATUSES)[number], reason.slice(0, 500)); });
}
export async function saveRegisterAction(sessionId: string, content: string, basis: string | null): Promise<RoomResult<{ version: string }>> {
  if (typeof content !== "string" || (basis !== null && typeof basis !== "string")) return { ok: false, message: "Ungültige Angabe." };
  return room(sessionId, (tx, me) => teach.saveRegister(tx, me, sessionId, content.slice(0, teach.REGISTER_MAX + 1), new Date(), basis));
}
export async function closeSessionAction(sessionId: string): Promise<RoomResult> {
  return room(sessionId, async (tx, me) => { await teach.closeSession(tx, me, sessionId); });
}
