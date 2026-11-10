import Link from "next/link";
import { getDb } from "@/db";
import { previewRegistration, wasConfirmed } from "@/server/registration";
import { registrationOpen } from "@/server/registration-config";
import { ConfirmForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Bestaetigen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = registrationOpen();
  const reg = open ? await previewRegistration(await getDb(), token) : null;
  const done = open && !reg ? await wasConfirmed(await getDb(), token) : false;
  return (
    <main className="shell" style={{ maxWidth: 520 }}>
      <h1 style={{ marginBottom: 4 }}>Registrierung bestätigen</h1>
      {reg ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>Du bist dabei, die Schule <strong>{reg.schoolName}</strong> bei Kurswerk anzulegen. Danach legst du dein Passwort fest und die 7 Tage Testzeit beginnen.</p>
          <ConfirmForm token={token} />
        </div>
      ) : done ? (
        <div className="okbox" role="status">
          Diese Registrierung hast du schon bestätigt. Wir haben dir den Link zum Festlegen deines Passworts per E-Mail geschickt. Schau auch im Spam-Ordner nach. <Link href="/login">Zur Anmeldung</Link>
        </div>
      ) : (
        <div className="err" role="alert">
          {open ? "Dieser Link ist ungültig oder abgelaufen." : "Die Registrierung ist noch nicht geöffnet."} <Link href="/registrieren">Neu registrieren</Link>
        </div>
      )}
    </main>
  );
}
