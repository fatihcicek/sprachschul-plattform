import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Passwort vergessen – Kurswerk", robots: { index: false } };

export default async function Seite({ searchParams }: { searchParams: Promise<{ schule?: string }> }) {
  const { schule } = await searchParams;
  const school = schule && /^[a-z0-9-]{1,80}$/.test(schule) ? schule : "";
  return (
    <main className="shell" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 4 }}>Passwort vergessen</h1>
      <p className="muted">Gib deine Schule und deine E-Mail-Adresse an. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
      <ResetForm defaultSchool={school} />
      <p className="muted" style={{ marginTop: 16 }}><Link href="/login">Zurück zur Anmeldung</Link></p>
    </main>
  );
}
