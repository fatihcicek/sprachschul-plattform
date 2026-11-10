import Link from "next/link";
import { getDb } from "@/db";
import { previewRegistration } from "@/server/registration";
import { registrationOpen } from "@/server/registration-config";
import { ConfirmForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Bestaetigen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = registrationOpen();
  const reg = open ? await previewRegistration(await getDb(), token) : null;
  return (
    <main className="shell" style={{ maxWidth: 520 }}>
      <h1 style={{ marginBottom: 4 }}>Registrierung bestätigen</h1>
      {reg ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>Du bist dabei, die Schule <strong>{reg.schoolName}</strong> bei Kurswerk anzulegen. Danach legst du dein Passwort fest und die 7 Tage Testzeit beginnen.</p>
          <ConfirmForm token={token} />
        </div>
      ) : (
        <div className="err" role="alert">
          {open ? "Dieser Link ist ungültig oder abgelaufen." : "Die Registrierung ist noch nicht geöffnet."} <Link href="/registrieren">Neu registrieren</Link>
        </div>
      )}
    </main>
  );
}
