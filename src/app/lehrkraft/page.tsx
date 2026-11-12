import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { courses, memberships, users } from "@/db/schema";
import { navFor, Shell } from "@/app/shell";
import { Empty, Initials, PageHead } from "@/app/ui";
import { createAssignmentAction } from "@/app/actions";
import { asSessionUser } from "@/server/context";
import { listForTeacher, NotAllowedError } from "@/server/assignments";
import { loadActor } from "@/server/actor";
import { getCurrentAccess } from "@/server/current-access";
import { STATUS_LABEL, formatDue } from "@/app/format";

export const dynamic = "force-dynamic";

export default async function Lehrkraft() {
  const readOnly = (await getCurrentAccess())?.access.mode === "READ_ONLY";
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    const actor = await loadActor(tx, me);
    // Erst die Rechteprüfung, dann alles Weitere.
    let items;
    try {
      items = await listForTeacher(tx, me);
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
    const all = await tx.select().from(courses);
    const myCourses = actor.role === "ADMIN" ? all : all.filter((c) => actor.assignedCourseIds.includes(c.id));
    const learnerNames = await tx.select({ id: memberships.id, f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId));
    return { name: `${p!.f} ${p!.l}`, role: actor.role, myCourses, learnerNames, items };
  });
  if (!data) redirect("/");
  const nameOf = (id: string) => {
    const n = data.learnerNames.find((x) => x.id === id);
    return n ? `${n.f} ${n.l}` : "Unbekannt";
  };
  return (
    <Shell name={data.name} home={data.role === "TEACHER" ? "/unterricht" : "/verwaltung/heute"} nav={navFor(data.role)}>
      <PageHead title="Aufgaben und Abgaben" lead="Gestellte Aufgaben mit den Abgaben der Teilnehmenden. Unten stellst du eine neue Aufgabe." />
      {data.items.length === 0 && <Empty title="Noch keine Aufgaben">Stelle unten die erste Aufgabe. Die Teilnehmenden des Kurses sehen sie sofort.</Empty>}
      {data.items.map(({ assignment: a, submissions }) => (
        <section key={a.id} className="group" aria-labelledby={`a-${a.id}`}>
          <div className="group-head">
            <h2 id={`a-${a.id}`}>{a.title}</h2>
            <span className="muted">{formatDue(a.dueAt)} · {submissions.length} {submissions.length === 1 ? "Abgabe" : "Abgaben"}</span>
          </div>
          {submissions.length === 0 && <p className="muted group-empty">Noch keine Abgaben.</p>}
          {submissions.length > 0 && (
            <ul className="list flat">
              {submissions.map((s) => (
                <li key={s.id}>
                  <Link href={`/lehrkraft/abgaben/${s.id}`} className="list-row list-link">
                    <Initials name={nameOf(s.membershipId)} />
                    <span className="grow">{nameOf(s.membershipId)}</span>
                    <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <form action={createAssignmentAction} className="card">
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <strong>Neue Aufgabe stellen</strong>
        <label htmlFor="courseId">Kurs</label>
        <select id="courseId" name="courseId" required>{data.myCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label htmlFor="title">Titel</label>
        <input id="title" name="title" required />
        <label htmlFor="instructions">Aufgabenstellung</label>
        <textarea id="instructions" name="instructions" style={{ minHeight: 100 }} />
        <label htmlFor="dueAt">Frist (optional)</label>
        <input id="dueAt" name="dueAt" type="datetime-local" />
        <p><button type="submit">Aufgabe stellen</button></p>
        {readOnly && <p className="muted">Nur lesen: Die Testzeit ist abgelaufen.</p>}
        </fieldset>
      </form>
    </Shell>
  );
}
