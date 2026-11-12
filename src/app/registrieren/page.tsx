import Link from "next/link";
import { AuthFrame } from "@/app/auth-frame";
import { registrationOpen } from "@/server/registration-config";
import { RegisterForm } from "./form";

export const dynamic = "force-dynamic";

export default function Registrieren() {
  return (
    <AuthFrame wide>
      <h1>Kurswerk testen</h1>
      {registrationOpen() ? (
        <>
          <p className="muted">Lege deine Schule an und probiere Kurswerk 7 Tage lang aus. Du bekommst einen Bestätigungslink per E-Mail. Es ist keine Zahlungsart nötig.</p>
          <RegisterForm />
        </>
      ) : (
        <div className="card">Die Registrierung ist noch nicht geöffnet. Bitte komm bald wieder.</div>
      )}
      <p className="muted"><Link href="/login">Zur Anmeldung</Link></p>
    </AuthFrame>
  );
}
