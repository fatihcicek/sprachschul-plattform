import { login } from "@/app/actions";
import { demoLoginEnabled, demoPeople } from "@/server/session";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { ADMIN: "Leitung", STAFF: "Verwaltung", TEACHER: "Lehrkräfte", LEARNER: "Teilnehmende" } as const;

export default async function LoginPage() {
  if (!demoLoginEnabled()) {
    return (
      <main className="shell">
        <h1>Kurswerk</h1>
        <p className="muted">Die Anmeldung mit echten Konten folgt. Für Tests DEMO_LOGIN=1 setzen.</p>
      </main>
    );
  }
  const { people } = await demoPeople();
  const groups = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => ({ role: r, items: people.filter((p) => p.role === r) }));
  return (
    <main className="shell">
      <h1 style={{ marginBottom: 4 }}>Kurswerk</h1>
      <p className="muted">Demo-Anmeldung: Wähle eine Beispielperson. Echte Konten folgen später.</p>
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
    </main>
  );
}
