"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "./actions";

export function ResetForm({ defaultSchool }: { defaultSchool: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  if (state?.done) {
    return (
      <div className="okbox" role="status">
        <p style={{ marginTop: 0 }}>Wenn es dieses Konto gibt, haben wir dir eine E-Mail mit einem Link geschickt. Der Link gilt 7 Tage. Schau auch im Spam-Ordner nach.</p>
        <p style={{ marginBottom: 0 }}><Link href="/login">Zurück zur Anmeldung</Link></p>
      </div>
    );
  }
  return (
    <form action={action} className="card">
      <label htmlFor="school">Schule</label>
      <input id="school" name="school" defaultValue={defaultSchool} autoCapitalize="none" autoCorrect="off" required maxLength={80} />
      <label htmlFor="email">E-Mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <div className="actions" style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Wird gesendet …" : "Link per E-Mail senden"}</button>
      </div>
    </form>
  );
}
