import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { PageHead } from "@/app/ui";
import { asSessionUser } from "@/server/context";
import { loadToday } from "@/server/overview";
import { NotAllowedError } from "@/server/actor";

export const dynamic = "force-dynamic";

const tz = "Europe/Berlin";
const fmtDay = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
const fmtShort = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: tz });
const fmtTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });

const PHASE = { UPCOMING: "kommt noch", RUNNING: "läuft jetzt", OVER: "vorbei" } as const;

export default async function Heute() {
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, today: await loadToday(tx, me) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  const { lessons, openAttendance, missingRegister } = data.today;
  const open = openAttendance.length + missingRegister.length;
  return (
    <Shell name={data.name} home="/verwaltung/heute" nav={ADMIN_NAV}>
      <PageHead title="Heute" lead={fmtDay.format(new Date())} />

      <h2 className="sect">Unterricht heute</h2>
      {lessons.length === 0 && <div className="card muted">Heute findet kein Unterricht statt.</div>}
      {lessons.map((l) => (
        <Link key={l.sessionId} href={`/unterricht/${l.sessionId}`} className={`card linkcard lesson${l.phase === "RUNNING" ? " running" : ""}`}>
          <div className="lesson-time">
            <b>{fmtTime.format(l.startsAt)}</b>
            <span>bis {fmtTime.format(l.endsAt)}</span>
          </div>
          <div className="lesson-body">
            <strong>{l.courseName}</strong>
            <div className="muted">{l.mode === "VIRTUAL" ? "online" : "Präsenz"} · {l.learners} Teilnehmende</div>
          </div>
          <span className={`badge phase-${l.phase}`}>{PHASE[l.phase]}</span>
        </Link>
      ))}

      <h2 className="sect">Offen</h2>
      {open === 0 && <div className="okbox">Alles erledigt: keine offenen Bestätigungen, kein fehlendes Klassenbuch.</div>}
      {openAttendance.length > 0 && (
        <div className="card">
          <strong>Anwesenheit noch nicht bestätigt</strong>
          <div className="muted">Die Bestätigung erfolgt durch die Lehrkraft.</div>
          {openAttendance.map((o) => (
            <Link key={o.sessionId} href={`/unterricht/${o.sessionId}`} className="person" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="grow">
                {o.courseName}
                <div className="muted">{fmtShort.format(o.startsAt)}, {fmtTime.format(o.startsAt)}–{fmtTime.format(o.endsAt)} Uhr</div>
              </div>
              <span className="badge open">{o.unconfirmed} offen</span>
            </Link>
          ))}
        </div>
      )}
      {missingRegister.length > 0 && (
        <div className="card">
          <strong>Klassenbuch ohne Eintrag</strong>
          {missingRegister.map((o) => (
            <Link key={o.sessionId} href={`/unterricht/${o.sessionId}`} className="person" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="grow">
                {o.courseName}
                <div className="muted">{fmtShort.format(o.startsAt)}, {fmtTime.format(o.startsAt)}–{fmtTime.format(o.endsAt)} Uhr</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <p><Link href="/verwaltung" className="muted">Alle Kurse ansehen</Link></p>
    </Shell>
  );
}
