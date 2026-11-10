import { getDb } from "@/db";
import { invitationIsValid } from "@/server/auth";
import { SetPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Einladung({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await invitationIsValid(await getDb(), token);
  return (
    <main className="shell" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 4 }}>Kurswerk</h1>
      {who ? (
        <>
          <p className="muted">Willkommen, {who.name}. Lege ein Passwort fest. Danach meldest du dich mit {who.email} an.</p>
          <SetPasswordForm token={token} />
        </>
      ) : (
        <div className="err" role="alert">Dieser Link ist ungültig oder abgelaufen. Bitte die Schule um einen neuen Link.</div>
      )}
    </main>
  );
}
