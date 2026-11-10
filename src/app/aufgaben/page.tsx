import Link from "next/link";
import { eq } from "drizzle-orm";
import { users, memberships } from "@/db/schema";
import { Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { listForLearner } from "@/server/assignments";
import { STATUS_LABEL, formatDue } from "@/app/format";

export const dynamic = "force-dynamic";

export default async function Aufgaben() {
  const { name, items } = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    return { name: `${p!.f} ${p!.l}`, items: await listForLearner(tx, me) };
  });
  return (
    <Shell name={name} home="/aufgaben">
      <h1>Meine Aufgaben</h1>
      {items.length === 0 && <p className="muted">Noch keine Aufgaben.</p>}
      {items.map(({ assignment: a, status }) => (
        <Link key={a.id} href={`/aufgaben/${a.id}`} style={{ textDecoration: "none" }}>
          <div className="card row">
            <div>
              <strong>{a.title}</strong>
              <div className="muted">{formatDue(a.dueAt)}</div>
            </div>
            <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
          </div>
        </Link>
      ))}
    </Shell>
  );
}
