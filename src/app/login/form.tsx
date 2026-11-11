"use client";

import Link from "next/link";
import { useActionState } from "react";
import { passwordLogin } from "@/app/actions";

export function LoginForm({ defaultSchool }: { defaultSchool: string }) {
  const [state, action, pending] = useActionState(passwordLogin, undefined);
  return (
    <form action={action} className="card">
      <label htmlFor="school">Schule</label>
      <input id="school" name="school" defaultValue={defaultSchool} autoCapitalize="none" autoCorrect="off" required maxLength={80} />
      <label htmlFor="email">E-Mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
      <label htmlFor="password">Passwort</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Anmelden …" : "Anmelden"}</button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}><Link href="/passwort-vergessen">Passwort vergessen?</Link></p>
    </form>
  );
}
