import Link from "next/link";
import { login } from "@/app/actions";
import { LoginForm } from "@/app/login/form";
import { registrationOpen } from "@/server/registration-config";
import { demoLoginEnabled, demoPeople } from "@/server/session";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { ADMIN: "Leitung", STAFF: "Verwaltung", TEACHER: "Lehrkräfte", LEARNER: "Teilnehmende" } as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neu?: string; schule?: string }> }) {
  const { neu, schule } = await searchParams;
  const demo = demoLoginEnabled();
  const fromLink = schule && /^[a-z0-9-]{1,80}$/.test(schule) ? schule : null;
  const defaultSchool = fromLink ?? process.env.DEFAULT_ORG_SLUG ?? (demo ? (process.env.DEMO_ORG_SLUG ?? "beispielschule") : "");
  const { people } = demo ? await demoPeople() : { people: [] };
  const groups = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => ({ role: r, items: people.filter((p) => p.role === r) }));
  return (
    <main className="shell" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 4 }}>Kurswerk</h1>
      <p className="muted">Melde dich an.</p>
      {neu && <div className="okbox" role="status">Dein Passwort ist gesetzt. Du kannst dich jetzt anmelden.</div>}
      <LoginForm defaultSchool={defaultSchool} />
      {registrationOpen() && (
        <p className="muted" style={{ marginTop: 16 }}>
          Neu hier? <Link href="/registrieren">Schule kostenlos 7 Tage testen</Link>
        </p>
      )}
      {demo && (
        <>
          <p className="muted" style={{ marginTop: 28 }}>Nur Testumgebung: schnelle Demo-Anmeldung mit Beispielpersonen.</p>
          {groups.filter((g) => g.items.length).map((g) => (
            <section key={g.role} className="card">
              <strong>{ROLE_LABEL[g.role]}</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {g.items.map((p) => (
                  <form key={p.membershipId} action={login}>
                    <input type="hidden" name="membershipId" value={p.membershipId} />
                    <button type="submit" className="ghost">{p.firstName} {p.lastName}</button>
                  </form>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
