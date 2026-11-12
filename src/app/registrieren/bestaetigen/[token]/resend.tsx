"use client";

import { useActionState } from "react";
import { resendPasswordLinkAction } from "@/app/registrieren/actions";

/** Für den Fall, dass die Mail mit dem Passwort-Link nicht ankam: noch einmal senden. */
export function ResendForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => resendPasswordLinkAction(token), undefined);
  if (state?.done) return <p role="status" style={{ marginBottom: 0 }}>Wir haben dir den Link noch einmal geschickt. Schau auch im Spam-Ordner nach.</p>;
  return (
    <form action={action} style={{ marginTop: 12 }}>
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <button type="submit" className="ghost" disabled={pending} style={{ marginTop: state?.error ? 12 : 0 }}>{pending ? "Wird gesendet …" : "Link erneut senden"}</button>
    </form>
  );
}
