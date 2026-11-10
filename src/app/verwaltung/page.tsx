import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { listCourses } from "@/server/courses";
import { NotAllowedError } from "@/server/actor";

export const dynamic = "force-dynamic";

const fmtDay = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const fmtTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export default async function Verwaltung({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  const { neu } = await searchParams;
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, items: await listCourses(tx, me) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  const created = data.items.find((i) => i.course.id === neu);
  return (
    <Shell name={data.name} home="/verwaltung" nav={ADMIN_NAV}>
      {created && (
        <div className="okbox" role="status">
          Kurs „{created.course.name}“ angelegt: {created.sessions} Termine, {created.learners} Teilnehmende.
        </div>
      )}
      <div className="row">
        <h1>Kurse</h1>
        <Link href="/verwaltung/kurse/neu" className="btn">Kurs anlegen</Link>
      </div>
      {data.items.length === 0 && <div className="card muted">Noch keine Kurse. Lege den ersten Kurs an.</div>}
      {data.items.map(({ course: c, sessions, learners, teachers, firstStartsAt, lastEndsAt }) => (
        <div key={c.id} className="card">
          <div className="row">
            <div>
              <strong style={{ fontSize: 18 }}>{c.name}</strong>
              <div className="muted">
                {c.category}
                {c.bamfCourseNumber ? ` · BAMF ${c.bamfCourseNumber}` : ""} · {c.mode === "VIRTUAL" ? "online" : "Präsenz"}
              </div>
            </div>
            <span className="badge">{fmtDay.format(new Date(`${c.startDate}T12:00:00Z`))} – {fmtDay.format(new Date(`${c.endDate}T12:00:00Z`))}</span>
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-start", gap: 28 }}>
            <span className="stat"><b>{sessions}</b> Termine{firstStartsAt && lastEndsAt ? `, ${fmtTime.format(firstStartsAt)}–${fmtTime.format(lastEndsAt)} Uhr` : ""}</span>
            <span className="stat"><b>{learners}</b> Teilnehmende</span>
            <span className="stat">Lehrkraft: <b>{teachers.join(", ") || "keine"}</b></span>
          </div>
        </div>
      ))}
    </Shell>
  );
}
