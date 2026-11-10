import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { listAccounts } from "@/server/auth";
import { NotAllowedError } from "@/server/actor";
import { InviteButton } from "./invite";

export const dynamic = "force-dynamic";

const ROLE = { ADMIN: "Leitung", STAFF: "Verwaltung", TEACHER: "Lehrkraft", LEARNER: "Teilnehmende/r" } as const;
const ACCESS = { NONE: "kein Zugang", INVITED: "eingeladen", ACTIVE: "hat Zugang" } as const;

export default async function Personen() {
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, rows: await listAccounts(tx, me) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  return (
    <Shell name={data.name} home="/verwaltung/heute" nav={ADMIN_NAV}>
      <h1>Personen</h1>
      <p className="muted" style={{ marginTop: -12 }}>Hier richtest du den Zugang ein. Du erzeugst einen Link, die Person legt damit ihr eigenes Passwort fest.</p>
      {data.rows.map((r) => (
        <div key={r.membershipId} className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong>{r.name}</strong>
            <div className="muted">{ROLE[r.role]} · {r.email}</div>
          </div>
          <span className={r.access === "ACTIVE" ? "badge RETURNED" : r.access === "INVITED" ? "badge open" : "badge"}>{ACCESS[r.access]}</span>
          {r.canInvite && <InviteButton membershipId={r.membershipId} label={r.access === "NONE" ? "Einladungslink erzeugen" : "Neuen Link erzeugen (Passwort zurücksetzen)"} />}
        </div>
      ))}
    </Shell>
  );
}
