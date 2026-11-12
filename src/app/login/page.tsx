import Link from "next/link";
import { AuthFrame } from "@/app/auth-frame";
import { login } from "@/app/actions";
import { LoginForm } from "@/app/login/form";
import { registrationOpen } from "@/server/registration-config";
import { demoLoginEnabled, demoPeople } from "@/server/session";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { ADMIN: "Leitung", STAFF: "Verwaltung", TEACHER: "Lehrkräfte", LEARNER: "Teilnehmende" } as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neu?: string; schule?: string; gesperrt?: string }> }) {
  const { neu, schule, gesperrt } = await searchParams;
  const demo = demoLoginEnabled();
  const fromLink = schule && /^[a-z0-9-]{1,80}$/.test(schule) ? schule : null;
  const defaultSchool = fromLink ?? process.env.DEFAULT_ORG_SLUG ?? (demo ? (process.env.DEMO_ORG_SLUG ?? "beispielschule") : "");
  const { people } = demo ? await demoPeople() : { people: [] };
  const groups = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => ({ role: r, items: people.filter((p) => p.role === r) }));
  return (
    <AuthFrame>
          <h1>Anmelden</h1>
          <p className="muted">Mit Schule, E-Mail und Passwort.</p>
          {gesperrt && <div className="err" role="alert">Der Zugang dieser Schule ist gesperrt. Bitte wende dich an die Leitung deiner Schule oder an den Betreiber von Kurswerk.</div>}
          {neu && <div className="okbox" role="status">Dein Passwort ist gesetzt. Du kannst dich jetzt anmelden.</div>}
          <LoginForm defaultSchool={defaultSchool} />
          {registrationOpen() && (
            <p className="muted" style={{ marginTop: 16 }}>
              Neu hier? <Link href="/registrieren">Schule kostenlos 7 Tage testen</Link>
            </p>
          )}
          {demo && (
            <details className="auth-demo">
              <summary>Demo-Anmeldung (nur Testumgebung)</summary>
              <p className="muted">Schnelle Anmeldung mit erfundenen Beispielpersonen.</p>
              {groups.filter((g) => g.items.length).map((g) => (
                <div key={g.role} className="auth-demo-group">
                  <strong>{ROLE_LABEL[g.role]}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {g.items.map((p) => (
                      <form key={p.membershipId} action={login}>
                        <input type="hidden" name="membershipId" value={p.membershipId} />
                        <button type="submit" className="ghost">{p.firstName} {p.lastName}</button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
            </details>
          )}
    </AuthFrame>
  );
}
