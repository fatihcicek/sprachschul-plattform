import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { Empty, PageHead } from "@/app/ui";
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
      <PageHead title="Kurse" lead={data.items.length > 0 ? `${data.items.length} ${data.items.length === 1 ? "Kurs" : "Kurse"}` : undefined} action={<Link href="/verwaltung/kurse/neu" className="btn">Kurs anlegen</Link>} />
      {data.items.length === 0 && (
        <Empty title="Noch keine Kurse" action={<Link href="/verwaltung/kurse/neu" className="btn">Ersten Kurs anlegen</Link>}>
          Ein Kurs bündelt Termine, Lehrkraft und Teilnehmende. Der Assistent führt dich in vier Schritten durch.
        </Empty>
      )}
      {data.items.length > 0 && (
        <ul className="list">
          {data.items.map(({ course: c, sessions, learners, teachers, firstStartsAt, lastEndsAt }) => (
            <li key={c.id} className="list-row course-row">
              <div className="grow">
                <strong className="list-title">{c.name}</strong>
                <div className="muted">
                  {c.category}
                  {c.bamfCourseNumber ? ` · BAMF ${c.bamfCourseNumber}` : ""} · {c.mode === "VIRTUAL" ? "online" : "Präsenz"}
                </div>
              </div>
              <dl className="facts">
                <div><dt>Zeitraum</dt><dd>{fmtDay.format(new Date(`${c.startDate}T12:00:00Z`))} – {fmtDay.format(new Date(`${c.endDate}T12:00:00Z`))}</dd></div>
                <div><dt>Termine</dt><dd>{sessions}{firstStartsAt && lastEndsAt ? `, ${fmtTime.format(firstStartsAt)}–${fmtTime.format(lastEndsAt)} Uhr` : ""}</dd></div>
                <div><dt>Teilnehmende</dt><dd>{learners}</dd></div>
                <div><dt>Lehrkraft</dt><dd>{teachers.join(", ") || "keine"}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
