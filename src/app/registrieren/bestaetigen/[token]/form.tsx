"use client";

import { useActionState } from "react";
import { confirmRegistrationAction } from "@/app/registrieren/actions";

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => confirmRegistrationAction(token), undefined);
  return (
    <form action={action}>
      {state?.error && <div className="err" role="alert">{state.error}</div>}
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Wird angelegt …" : "Schule jetzt anlegen"}</button>
      </div>
    </form>
  );
}
