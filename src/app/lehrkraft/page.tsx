import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { courses, memberships, users } from "@/db/schema";
import { Shell, TEACHER_NAV } from "@/app/shell";
import { createAssignmentAction } from "@/app/actions";
import { asSessionUser } from "@/server/context";
import { listForTeacher, NotAllowedError } from "@/server/assignments";
import { loadActor } from "@/server/actor";
import { STATUS_LABEL, formatDue } from "@/app/format";

export const dynamic = "force-dynamic";

export default async function Lehrkraft() {
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
    return { name: `${p!.f} ${p!.l}`, myCourses, learnerNames, items };
  });
  if (!data) redirect("/");
  const nameOf = (id: string) => {
    const n = data.learnerNames.find((x) => x.id === id);
    return n ? `${n.f} ${n.l}` : "Unbekannt";
  };
  return (
    <Shell name={data.name} home="/unterricht" nav={TEACHER_NAV}>
      <h1>Aufgaben und Abgaben</h1>
      {data.items.map(({ assignment: a, submissions }) => (
        <div key={a.id} className="card">
          <div className="row"><strong>{a.title}</strong><span className="muted">{formatDue(a.dueAt)}</span></div>
          {submissions.length === 0 && <p className="muted">Noch keine Abgaben.</p>}
          {submissions.map((s) => (
            <Link key={s.id} href={`/lehrkraft/abgaben/${s.id}`} style={{ textDecoration: "none" }}>
              <div className="row" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <span>{nameOf(s.membershipId)}</span>
                <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
              </div>
            </Link>
          ))}
        </div>
      ))}
      <form action={createAssignmentAction} className="card">
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
      </form>
    </Shell>
  );
}
