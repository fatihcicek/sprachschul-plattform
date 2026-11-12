import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { navFor, Shell } from "@/app/shell";
import { Empty, PageHead } from "@/app/ui";
import { asSessionUser } from "@/server/context";
import { listMySessions, NotAllowedError, type SessionListItem } from "@/server/teaching";
import { localDay } from "@/domain/schedule";
import { fmtShortDate, fmtTime, MODE_DE } from "./format";

export const dynamic = "force-dynamic";

export default async function Unterricht() {
  const now = new Date();
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, role: p!.role, items: await listMySessions(tx, me, now) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  const today = localDay(now);
  const state = (i: SessionListItem) => (i.status === "CLOSED" ? "abgeschlossen" : now < i.startsAt ? "geplant" : now < i.endsAt ? "läuft" : "offen");
  const groups: [string, SessionListItem[]][] = [
    ["Heute", data.items.filter((i) => localDay(i.startsAt) === today)],
    ["Als Nächstes", data.items.filter((i) => localDay(i.startsAt) > today)],
    ["Zurückliegend", data.items.filter((i) => localDay(i.startsAt) < today).reverse()],
  ];
  return (
    <Shell name={data.name} home="/unterricht" nav={navFor(data.role)}>
      <PageHead title="Unterricht" lead="Termine der nächsten zwei Wochen und der letzten 30 Tage." />
      {data.items.length === 0 && <Empty title="Keine Termine in diesem Zeitraum">Termine entstehen beim Anlegen eines Kurses.</Empty>}
      {groups.filter(([, items]) => items.length > 0).map(([title, items]) => (
        <section key={title}>
          <h2 className="sect">{title}</h2>
          <ul className="list">
            {items.map((i) => (
              <li key={i.sessionId}>
                <Link href={`/unterricht/${i.sessionId}`} className="list-row list-link lesson">
                  <div className="lesson-time">
                    <b>{fmtTime.format(i.startsAt)}</b>
                    <span>bis {fmtTime.format(i.endsAt)}</span>
                  </div>
                  <div className="lesson-body">
                    <strong>{i.courseName}</strong>
                    <div className="muted">{fmtShortDate.format(i.startsAt)} · {MODE_DE[i.mode]}</div>
                  </div>
                  <span className={`badge ${state(i) === "offen" ? "open" : state(i) === "läuft" ? "phase-RUNNING" : state(i) === "abgeschlossen" ? "RETURNED" : ""}`}>{state(i)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}
