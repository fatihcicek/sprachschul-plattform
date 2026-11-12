"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { parseRegistration } from "@/domain/registration";
import { clientIp } from "@/server/client-ip";
import { createMailer, isValidAddress } from "@/server/mailer";
import { after } from "next/server";
import { confirmRegistration, requestRegistration, resendPasswordLink, sendPasswordLinkMail } from "@/server/registration";
import { registrationBaseUrl, registrationOpen, showLinkOnPage } from "@/server/registration-config";

export type RegisterState = { error?: string; field?: string; done?: true; link?: string; values?: Record<string, string> } | undefined;

/** Eingaben nach einem Fehler zurückgeben, damit das Formular nicht leer wird. */
const keep = (f: FormData) => Object.fromEntries(["schoolName", "firstName", "lastName", "email"].map((k) => [k, String(f.get(k) ?? "")]).concat([["terms", f.get("terms") === "on" ? "on" : ""], ["bamf", f.get("bamf") === "on" ? "on" : ""]]));

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!registrationOpen()) return { error: "Die Registrierung ist noch nicht geöffnet." };
  // Köder-Feld für einfache Bots: Menschen sehen es nicht. Antwort wie bei Erfolg, damit Bots nichts lernen.
  if (String(formData.get("hp_kontakt") ?? "") !== "") return { done: true };
  if (formData.get("terms") !== "on") return { error: "Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu.", field: "terms", values: keep(formData) };
  const parsed = parseRegistration(Object.fromEntries(formData), isValidAddress);
  if (!parsed.ok) return { error: parsed.problem.message, field: parsed.problem.field, values: keep(formData) };
  const baseUrl = registrationBaseUrl();
  if (!baseUrl) return { error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später noch einmal." };
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return { error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später noch einmal." };

  let r;
  try {
    r = await requestRegistration(await getDb(), parsed.value, { ip: await clientIp(), secret, baseUrl, mailer: createMailer() });
  } catch (e) {
    console.error("Registrierung fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    return { error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später noch einmal." };
  }
  if (!r.ok) {
    return r.reason === "limited"
      ? { error: "Zu viele Versuche. Bitte versuche es in einer Stunde noch einmal.", values: keep(formData) }
      : { error: "Die Registrierung ist gerade nicht möglich. Bitte versuche es später noch einmal.", values: keep(formData) };
  }
  return showLinkOnPage() ? { done: true, link: r.link } : { done: true };
}

/** Bestätigt per Klick (nicht schon beim Öffnen des Links: Mail-Programme rufen Links vorab auf). */
export async function confirmRegistrationAction(token: string): Promise<{ error: string } | undefined> {
  if (!registrationOpen()) return { error: "Die Registrierung ist noch nicht geöffnet." };
  let r;
  try {
    r = await confirmRegistration(await getDb(), token);
  } catch (e) {
    console.error("Bestätigung fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    return { error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }
  if (!r.ok) return { error: "Dieser Link ist ungültig oder abgelaufen. Bitte registriere dich noch einmal." };
  // Zusätzlich per Mail, damit nichts verloren geht, wenn die Person den Tab schließt. Scheitert der Versand, geht es trotzdem weiter.
  await sendPasswordLinkMail(createMailer(), registrationBaseUrl(), r);
  redirect(`/einladung/${r.invitationToken}`);
}

export type ResendState = { error?: string; done?: true } | undefined;

/** Passwort-Link erneut per E-Mail senden (für die Seite „schon bestätigt“). Der Link erscheint nie auf der Seite. */
export async function resendPasswordLinkAction(token: string): Promise<ResendState> {
  const failed = { error: "Das geht gerade nicht. Bitte versuche es später noch einmal." };
  if (!registrationOpen()) return { error: "Die Registrierung ist noch nicht geöffnet." };
  const baseUrl = registrationBaseUrl();
  const secret = process.env.SESSION_SECRET;
  if (!baseUrl || !secret || secret.length < 16) return failed;
  let r;
  try {
    r = await resendPasswordLink(await getDb(), token, { ip: await clientIp(), secret, baseUrl });
  } catch (e) {
    console.error("Link erneut senden fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    return failed;
  }
  if ("unknown" in r) return { error: "Dieser Link ist ungültig oder abgelaufen. Nutze „Passwort vergessen“ auf der Anmeldeseite." };
  if (r.limited) return { error: "Zu viele Versuche. Bitte versuche es in einer Stunde noch einmal." };
  const complete = r.complete;
  after(async () => {
    try {
      const mail = await complete();
      if (mail) await createMailer().send(mail);
    } catch (e) {
      console.error("Link erneut senden: Mail fehlgeschlagen", e instanceof Error ? e.name : "Fehler");
    }
  });
  return { done: true };
}
