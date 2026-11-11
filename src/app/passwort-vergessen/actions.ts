"use server";

import { after } from "next/server";
import { getDb } from "@/db";
import { clientIp } from "@/server/client-ip";
import { createMailer } from "@/server/mailer";
import { requestPasswordReset } from "@/server/password-reset";
import { registrationBaseUrl } from "@/server/registration-config";

export type ResetState = { error?: string; done?: true } | undefined;

const UNAVAILABLE = "Das geht gerade nicht. Bitte versuche es später noch einmal.";

/** Antwortet immer gleich, ob es das Konto gibt oder nicht. Die Mail geht erst nach der Antwort raus. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const school = String(formData.get("school") ?? "");
  const email = String(formData.get("email") ?? "");
  const baseUrl = registrationBaseUrl();
  const secret = process.env.SESSION_SECRET;
  if (!baseUrl || !secret || secret.length < 16) return { error: UNAVAILABLE };
  let r;
  try {
    r = await requestPasswordReset(await getDb(), { school, email }, { ip: await clientIp(), secret, baseUrl });
  } catch (e) {
    console.error("Passwort vergessen fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    return { error: UNAVAILABLE };
  }
  if (r.limited) return { error: "Zu viele Versuche. Bitte versuche es in einer Stunde noch einmal." };
  // Alles, was vom Konto abhängt, läuft erst nach der Antwort (Antwortzeit und Fehler dürfen nichts verraten).
  const complete = r.complete;
  after(async () => {
    try {
      const mail = await complete();
      if (mail) await createMailer().send(mail);
    } catch (e) {
      console.error("Passwort vergessen: Link oder Mail fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    }
  });
  return { done: true };
}
