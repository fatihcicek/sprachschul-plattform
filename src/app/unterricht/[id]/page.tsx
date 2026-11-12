import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell, TEACHER_NAV } from "@/app/shell";
import { PageHead } from "@/app/ui";
import { asSessionUser } from "@/server/context";
import { loadRoom, NotAllowedError, TeachingRuleError } from "@/server/teaching";
import { CloseButton, Attendance, Register, type LearnerView } from "./room";
import { fmtDate, fmtDateTime, fmtTime, MODE_DE, STATUS_DE } from "../format";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Kursraum({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/unterricht");
  const now = new Date();
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, role: p!.role, room: await loadRoom(tx, me, id, now) };
    } catch (e) {
      if (e instanceof NotAllowedError || e instanceof TeachingRuleError) return null;
      throw e;
    }
  });
  if (!data) redirect("/unterricht");
  const { room } = data;
  const started = now >= room.session.startsAt;
  const closed = room.session.status === "CLOSED";
  const learners: LearnerView[] = room.learners.map((l) => ({
    membershipId: l.membershipId,
    name: l.name,
    recordId: l.recordId,
    status: l.status,
    reviewState: l.reviewState,
    presentMinutes: l.presentMinutes,
    confirmedLine: l.confirmedBy && l.confirmedAt ? `Bestätigt von ${l.confirmedBy}, ${fmtDateTime.format(l.confirmedAt)}` : null,
    intervals: l.intervals.map((i) => ({ start: fmtTime.format(i.start), end: fmtTime.format(i.end) })),
    openEnded: l.openEnded,
    corrections: l.corrections.map((c) => `${STATUS_DE[c.fromStatus]} → ${STATUS_DE[c.toStatus]} durch ${c.by}, ${fmtDateTime.format(c.at)}: „${c.reason}“`),
  }));
  const canClose = room.over && !closed && room.can.review && room.can.write;
  return (
    <Shell name={data.name} home="/unterricht" nav={data.role === "TEACHER" ? TEACHER_NAV : ADMIN_NAV} wide>
      <PageHead
        back={{ href: "/unterricht", label: "Alle Termine" }}
        title={room.course.name}
        status={<span className={`badge ${closed ? "RETURNED" : room.over ? "open" : ""}`}>{closed ? "abgeschlossen" : room.over ? "offen" : started ? "läuft" : "geplant"}</span>}
        lead={<>{fmtDate.format(room.session.startsAt)}, {fmtTime.format(room.session.startsAt)}–{fmtTime.format(room.session.endsAt)} Uhr · {room.session.plannedUe} UE · {MODE_DE[room.session.mode]}</>}
      />
      <Attendance sessionId={room.session.id} learners={learners} started={started} over={room.over} closed={closed} canReview={room.can.review} canCorrect={room.can.correct} />
      <Register
        sessionId={room.session.id}
        initial={room.register?.content ?? ""}
        version={room.register ? room.register.updatedAt.toISOString() : null}
        meta={room.register ? `Zuletzt bearbeitet von ${room.register.author}, ${fmtDateTime.format(room.register.updatedAt)}` : null}
        editable={room.can.write && started && !closed}
        reason={!room.can.write ? "Nur die Lehrkraft des Kurses trägt das Klassenbuch ein." : !started ? "Das Klassenbuch ist ab Beginn des Termins möglich." : closed ? "Der Termin ist abgeschlossen, das Klassenbuch ist gesperrt." : null}
      />
      {canClose && <CloseButton sessionId={room.session.id} />}
      {room.can.export && started && (
        <div className="card">
          <strong>Einwahlprotokoll</strong>
          <p className="muted">Zeiten, zu denen die Teilnehmenden im Unterricht waren (Ein- und Ausgang), mit Anwesenheit und Bestätigung. Zum Drucken oder Speichern als PDF.</p>
          <Link href={`/unterricht/${room.session.id}/protokoll`} prefetch={false} className="btn">Einwahlprotokoll öffnen</Link>
        </div>
      )}
    </Shell>
  );
}
