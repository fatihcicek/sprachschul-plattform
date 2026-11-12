import Link from "next/link";
import { AuthFrame } from "@/app/auth-frame";
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
    <AuthFrame wide>
      <h1>Registrierung bestätigen</h1>
      {reg ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>Du bist dabei, die Schule <strong>{reg.schoolName}</strong> bei Kurswerk anzulegen. Danach legst du dein Passwort fest und die 7 Tage Testzeit beginnen.</p>
          <ConfirmForm token={token} />
        </div>
      ) : done ? (
        <div className="okbox" role="status">
          Diese Registrierung hast du schon bestätigt. Der Link zum Festlegen deines Passworts sollte per E-Mail bei dir sein, schau auch im Spam-Ordner nach. Ist keine Mail angekommen, wende dich bitte an den Betreiber von Kurswerk. <Link href="/login">Zur Anmeldung</Link>
        </div>
      ) : (
        <div className="err" role="alert">
          {open ? "Dieser Link ist ungültig oder abgelaufen." : "Die Registrierung ist noch nicht geöffnet."} <Link href="/registrieren">Neu registrieren</Link>
        </div>
      )}
    </AuthFrame>
  );
}
