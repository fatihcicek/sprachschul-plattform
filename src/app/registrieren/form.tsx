"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/app/registrieren/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  if (state?.done) {
    return (
      <div className="card" role="status">
        <strong>Fast geschafft.</strong>
        <p style={{ marginBottom: 0 }}>Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Er gilt 24 Stunden. Schau auch im Spam-Ordner nach.</p>
        {state.link && (
          <div className="warn">
            Nur Testumgebung: Es geht keine E-Mail raus. Dein Bestätigungslink: <br />
            <a href={state.link}>{state.link}</a>
          </div>
        )}
      </div>
    );
  }
  const bad = (f: string) => (state?.field === f ? { "aria-invalid": true } : {});
  return (
    <form action={action} className="card">
      <label htmlFor="schoolName">Name der Schule</label>
      <input id="schoolName" name="schoolName" required minLength={2} maxLength={120} autoComplete="organization" {...bad("schoolName")} />
      <div className="grid2">
        <div>
          <label htmlFor="firstName">Vorname (Leitung)</label>
          <input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" {...bad("firstName")} />
        </div>
        <div>
          <label htmlFor="lastName">Nachname</label>
          <input id="lastName" name="lastName" required maxLength={80} autoComplete="family-name" {...bad("lastName")} />
        </div>
      </div>
      <label htmlFor="email">E-Mail-Adresse</label>
      <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" {...bad("email")} />
      {/* Köder gegen Bots: für Menschen unsichtbar und nicht per Tab erreichbar. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999, height: 0, overflow: "hidden" }}>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, fontSize: 15 }}>
        <input type="checkbox" name="terms" required style={{ marginTop: 4 }} />
        <span>
          Ich stimme den <Link href="/nutzungsbedingungen" target="_blank">Nutzungsbedingungen</Link> zu und habe die <Link href="/datenschutz" target="_blank">Datenschutzerklärung</Link> gelesen.
        </span>
      </label>
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Wird gesendet …" : "Registrieren und 7 Tage testen"}</button>
      </div>
    </form>
  );
}
