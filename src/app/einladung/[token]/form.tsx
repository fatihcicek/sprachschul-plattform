"use client";

import { useActionState } from "react";
import { setPasswordAction } from "@/app/actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPasswordAction.bind(null, token), undefined);
  return (
    <form action={action} className="card">
      <label htmlFor="password">Neues Passwort</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
      <div className="muted" style={{ marginTop: 4 }}>Mindestens 10 Zeichen.</div>
      <label htmlFor="password2">Passwort wiederholen</label>
      <input id="password2" name="password2" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Speichern …" : "Passwort speichern"}</button>
      </div>
    </form>
  );
}
