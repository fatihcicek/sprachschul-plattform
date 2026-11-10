import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell, TEACHER_NAV } from "@/app/shell";
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
    <Shell name={data.name} home="/unterricht" nav={data.role === "TEACHER" ? TEACHER_NAV : ADMIN_NAV}>
      <h1>Unterricht</h1>
      {data.items.length === 0 && <div className="card muted">Keine Termine in den nächsten zwei Wochen oder den letzten 30 Tagen.</div>}
      {groups.filter(([, items]) => items.length > 0).map(([title, items]) => (
        <section key={title}>
          <h2 className="sect">{title}</h2>
          {items.map((i) => (
            <Link key={i.sessionId} href={`/unterricht/${i.sessionId}`} className="card linkcard">
              <div className="row">
                <div>
                  <strong>{i.courseName}</strong>
                  <div className="muted">{fmtShortDate.format(i.startsAt)}, {fmtTime.format(i.startsAt)}–{fmtTime.format(i.endsAt)} Uhr · {MODE_DE[i.mode]}</div>
                </div>
                <span className={`badge ${state(i) === "offen" ? "open" : state(i) === "läuft" ? "phase-RUNNING" : state(i) === "abgeschlossen" ? "RETURNED" : ""}`}>{state(i)}</span>
              </div>
            </Link>
          ))}
        </section>
      ))}
    </Shell>
  );
}
