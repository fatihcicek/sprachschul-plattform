import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { navFor, Shell } from "@/app/shell";
import { Empty, Initials, PageHead } from "@/app/ui";
import { asSessionUser } from "@/server/context";
import { listAccounts } from "@/server/auth";
import { NotAllowedError } from "@/server/actor";
import { ADDABLE_ROLES, canAddPerson } from "@/domain/permissions";
import { AddPeople } from "./add-people";
import { InviteButton } from "./invite";

export const dynamic = "force-dynamic";

const GROUP = { ADMIN: "Leitung", STAFF: "Verwaltung", TEACHER: "Lehrkräfte", LEARNER: "Teilnehmende" } as const;
const ACCESS = { NONE: "kein Zugang", INVITED: "eingeladen", ACTIVE: "hat Zugang" } as const;

export default async function Personen() {
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, role: p!.role, rows: await listAccounts(tx, me) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  // Gruppen in fester Reihenfolge, damit Leitung und Lehrkräfte nicht zwischen Teilnehmenden untergehen.
  const groups = (["ADMIN", "STAFF", "TEACHER", "LEARNER"] as const)
    .map((role) => ({ role, rows: data.rows.filter((r) => r.role === role) }))
    .filter((g) => g.rows.length > 0);
  return (
    <Shell name={data.name} home="/verwaltung/heute" nav={navFor(data.role)}>
      <PageHead title="Personen" lead="Hier richtest du den Zugang ein. Du erzeugst einen Link, die Person legt damit ihr eigenes Passwort fest." />
      <AddPeople roles={ADDABLE_ROLES.filter((r) => canAddPerson(data.role, r))} />
      {data.rows.length === 0 && <Empty title="Noch keine Personen">Personen kommen beim Anlegen eines Kurses dazu.</Empty>}
      {groups.map((g) => (
        <section key={g.role} aria-labelledby={`grp-${g.role}`}>
          <h2 className="sect" id={`grp-${g.role}`}>{GROUP[g.role]} ({g.rows.length})</h2>
          <ul className="list">
            {g.rows.map((r) => (
              <li key={r.membershipId} className="list-row">
                <Initials name={r.name} />
                <div className="grow">
                  <strong>{r.name}</strong>
                  <div className="muted">{r.email}</div>
                </div>
                <span className={r.access === "ACTIVE" ? "badge RETURNED" : r.access === "INVITED" ? "badge open" : "badge"}>{ACCESS[r.access]}</span>
                {r.canInvite && <InviteButton membershipId={r.membershipId} label={r.access === "NONE" ? "Einladungslink erzeugen" : "Neuen Link erzeugen (Passwort zurücksetzen)"} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}
