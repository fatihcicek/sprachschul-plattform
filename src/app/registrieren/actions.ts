"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { parseRegistration } from "@/domain/registration";
import { createMailer, isValidAddress } from "@/server/mailer";
import { confirmRegistration, requestRegistration } from "@/server/registration";
import { registrationBaseUrl, registrationOpen, showLinkOnPage } from "@/server/registration-config";

export type RegisterState = { error?: string; field?: string; done?: true; link?: string } | undefined;

/** Adresse des Aufrufers für die Begrenzung: der letzte Eintrag von x-forwarded-for stammt vom nächsten vertrauenswürdigen Vermittler. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? h.get("x-real-ip")?.trim() ?? "unbekannt";
}

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!registrationOpen()) return { error: "Die Registrierung ist noch nicht geöffnet." };
  // Köder-Feld für einfache Bots: Menschen sehen es nicht. Antwort wie bei Erfolg, damit Bots nichts lernen.
  if (String(formData.get("website") ?? "") !== "") return { done: true };
  if (formData.get("terms") !== "on") return { error: "Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu.", field: "terms" };
  const parsed = parseRegistration(Object.fromEntries(formData), isValidAddress);
  if (!parsed.ok) return { error: parsed.problem.message, field: parsed.problem.field };
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
      ? { error: "Zu viele Versuche. Bitte versuche es in einer Stunde noch einmal." }
      : { error: "Die E-Mail konnte nicht gesendet werden. Bitte prüfe die Adresse und versuche es später noch einmal." };
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
  redirect(`/einladung/${r.invitationToken}`);
}
