import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
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
      <h1>Heute</h1>
      <p className="muted" style={{ marginTop: -12 }}>{fmtDay.format(new Date())}</p>

      <h2 className="sect">Unterricht heute</h2>
      {lessons.length === 0 && <div className="card muted">Heute findet kein Unterricht statt.</div>}
      {lessons.map((l) => (
        <div key={l.sessionId} className="card">
          <div className="row">
            <div>
              <strong>{l.courseName}</strong>
              <div className="muted">
                {fmtTime.format(l.startsAt)}–{fmtTime.format(l.endsAt)} Uhr · {l.mode === "VIRTUAL" ? "online" : "Präsenz"} · {l.learners} Teilnehmende
              </div>
            </div>
            <span className={`badge phase-${l.phase}`}>{PHASE[l.phase]}</span>
          </div>
        </div>
      ))}

      <h2 className="sect">Offen</h2>
      {open === 0 && <div className="okbox">Alles erledigt: keine offenen Bestätigungen, kein fehlendes Klassenbuch.</div>}
      {openAttendance.length > 0 && (
        <div className="card">
          <strong>Anwesenheit noch nicht bestätigt</strong>
          {openAttendance.map((o) => (
            <div key={o.sessionId} className="person">
              <div className="grow">
                {o.courseName}
                <div className="muted">{fmtShort.format(o.startsAt)}, {fmtTime.format(o.startsAt)}–{fmtTime.format(o.endsAt)} Uhr</div>
              </div>
              <span className="badge SUBMITTED">{o.unconfirmed} offen</span>
            </div>
          ))}
        </div>
      )}
      {missingRegister.length > 0 && (
        <div className="card">
          <strong>Klassenbuch ohne Eintrag</strong>
          {missingRegister.map((o) => (
            <div key={o.sessionId} className="person">
              <div className="grow">
                {o.courseName}
                <div className="muted">{fmtShort.format(o.startsAt)}, {fmtTime.format(o.startsAt)}–{fmtTime.format(o.endsAt)} Uhr</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p><Link href="/verwaltung" className="muted">Alle Kurse ansehen</Link></p>
    </Shell>
  );
}
