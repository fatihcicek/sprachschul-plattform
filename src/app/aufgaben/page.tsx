import Link from "next/link";
import { eq } from "drizzle-orm";
import { users, memberships } from "@/db/schema";
import { LEARNER_NAV, Shell } from "@/app/shell";
import { Empty, PageHead } from "@/app/ui";
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
    <Shell name={name} home="/aufgaben" nav={LEARNER_NAV}>
      <PageHead title="Meine Aufgaben" />
      {items.length === 0 && <Empty title="Noch keine Aufgaben">Sobald deine Lehrkraft eine Aufgabe stellt, erscheint sie hier.</Empty>}
      {items.length > 0 && (
        <ul className="list">
          {items.map(({ assignment: a, status }) => (
            <li key={a.id}>
              <Link href={`/aufgaben/${a.id}`} className="list-row list-link">
                <div className="grow">
                  <strong>{a.title}</strong>
                  <div className="muted">{formatDue(a.dueAt)}</div>
                </div>
                <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
