import Link from "next/link";
import { redirect } from "next/navigation";
import { asSessionUser } from "@/server/context";
import { firstJoin, timelineSegments } from "@/domain/attendance";
import { loadRoom, NotAllowedError, recordExport, TeachingRuleError } from "@/server/teaching";
import { fmtDate, fmtDateTime, fmtTime, fmtTimeSec, MODE_DE, STATUS_DE } from "../../format";
import { PrintButton } from "./print";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Einwahlprotokoll eines Termins als druckbare Seite (Browser: „Als PDF speichern“). */
export default async function Protokoll({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/unterricht");
  const now = new Date();
  const room = await asSessionUser(async (tx, me) => {
    try {
      const r = await loadRoom(tx, me, id, now);
      if (!r.can.export || now < r.session.startsAt) return null;
      return r;
    } catch (e) {
      if (e instanceof NotAllowedError || e instanceof TeachingRuleError) return null;
      throw e;
    }
  });
  if (!room) redirect(`/unterricht/${id}`);
  // Jede Ausgabe wird festgehalten. Das ist ein Protokolleintrag, keine Änderung der Schuldaten: Er muss auch nach
  // Ablauf der Testzeit möglich sein, denn gerade dann soll der Nachweis abrufbar bleiben.
  await asSessionUser(
    (tx, me) => recordExport(tx, me, id, { confirmed: room.learners.filter((l) => l.reviewState === "CONFIRMED").length, unconfirmed: room.learners.filter((l) => l.reviewState !== "CONFIRMED").length }),
    { auditOnly: true },
  );
  const termin = { start: room.session.startsAt, end: room.session.endsAt };
  const unconfirmed = room.learners.some((l) => l.reviewState !== "CONFIRMED");
  return (
    <main className="shell wide protocol">
      <div className="noprint row" style={{ marginBottom: 16 }}>
        <Link href={`/unterricht/${id}`} className="muted">← Zurück zum Kursraum</Link>
        <PrintButton />
      </div>
      <h1 style={{ marginBottom: 4 }}>Einwahlprotokoll</h1>
      <p className="muted" style={{ marginTop: 0 }}>{room.schoolName}</p>
      <dl className="summary">
        <dt>Kurs</dt>
        <dd>{room.course.name} ({room.course.category}){room.course.bamfCourseNumber ? `, BAMF-Kursnummer ${room.course.bamfCourseNumber}` : ""}</dd>
        <dt>Termin</dt>
        <dd>{fmtDate.format(room.session.startsAt)}, {fmtTime.format(room.session.startsAt)}–{fmtTime.format(room.session.endsAt)} Uhr · {room.session.plannedUe} UE · {MODE_DE[room.session.mode]}</dd>
      </dl>
      {unconfirmed && <div className="warn">Nicht alle Anwesenheiten sind bestätigt. Vorschläge sind als „Vorschlag“ gekennzeichnet und noch kein Nachweis.</div>}
      <h2 className="sect">Zeitleiste</h2>
      <p className="muted">Blau: eingewählt. Grau: nicht eingewählt. Die Leiste zeigt die Terminzeit von {fmtTime.format(termin.start)} bis {fmtTime.format(termin.end)} Uhr.</p>
      <table className="ptable timeline">
        <thead><tr><th>Nr.</th><th>Person</th><th>Erste Einwahl</th><th className="tl-col">Aktivität</th></tr></thead>
        <tbody>
          {[...room.teachers.map((p) => ({ ...p, teacher: true })), ...room.learners.map((p) => ({ ...p, teacher: false }))].map((l, n) => {
            const first = firstJoin(l.events, termin);
            return (
              <tr key={l.membershipId}>
                <td>{n + 1}.</td>
                <td>{l.name}{l.teacher && <div className="muted">Lehrkraft</div>}</td>
                <td>{first ? <>{fmtTimeSec.format(first.at)}{first.position !== "DURING" && <div className="muted">{first.position === "BEFORE" ? "vor dem Termin" : "nach dem Termin"}</div>}</> : "–"}</td>
                <td className="tl-col">
                  <div className="tl-bar" role="img" aria-label={l.intervals.length === 0 ? "nicht eingewählt" : `eingewählt ${l.intervals.map((i) => `${fmtTime.format(i.start)} bis ${fmtTime.format(i.end)}`).join(", ")}`}>
                    {timelineSegments(l.intervals, termin).map((seg, k) => (
                      <span key={k} className={`tl-seg ${seg.kind}`} style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }} title={`${seg.kind === "active" ? "eingewählt" : "nicht eingewählt"} ${fmtTime.format(seg.from)}–${fmtTime.format(seg.to)}`} />
                    ))}
                  </div>
                  <div className="tl-times muted">
                    {l.intervals.length === 0 ? "keine Einwahl im Termin" : l.intervals.map((i) => `${fmtTime.format(i.start)}–${fmtTime.format(i.end)}`).join(" · ")}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="sect">Auswertung</h2>
      <table className="ptable">
        <thead>
          <tr><th>Teilnehmende</th><th>Einwahlzeiten</th><th>Minuten</th><th>Anwesenheit</th><th>Bestätigung</th></tr>
        </thead>
        <tbody>
          {room.learners.map((l) => (
            <tr key={l.membershipId}>
              <td>{l.name}</td>
              <td>
                {l.intervals.length === 0 ? "keine Einwahl" : l.intervals.map((i, n) => <div key={n}>{fmtTime.format(i.start)}–{fmtTime.format(i.end)}</div>)}
                {l.openEnded && <div className="muted">letzte Einwahl ohne Abmeldung</div>}
              </td>
              <td>{l.presentMinutes ?? "–"}</td>
              <td>
                {l.status ? STATUS_DE[l.status] : "nicht berechnet"}
                {l.corrections.map((c, n) => (
                  <div key={n} className="muted">korrigiert von {STATUS_DE[c.fromStatus]} auf {STATUS_DE[c.toStatus]}: „{c.reason}“ ({c.by}, {fmtDateTime.format(c.at)})</div>
                ))}
              </td>
              <td>{l.reviewState === "CONFIRMED" && l.confirmedBy && l.confirmedAt ? `${l.confirmedBy}, ${fmtDateTime.format(l.confirmedAt)}` : "Vorschlag"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="sect">Rohereignisse (Ein- und Ausgang, auf die Sekunde)</h2>
      <p className="muted">Alle aufgezeichneten Ereignisse dieses Termins, auch außerhalb der Terminzeit. Die Anwesenheit oben wird daraus berechnet und auf die Terminzeit beschränkt.</p>
      <table className="ptable">
        <thead><tr><th>Teilnehmende</th><th>Ereignisse</th></tr></thead>
        <tbody>
          {[...room.teachers, ...room.learners].map((l) => (
            <tr key={l.membershipId}>
              <td>{l.name}</td>
              <td>{l.events.length === 0 ? "keine" : l.events.map((e, n) => <span key={n} style={{ marginRight: 14, whiteSpace: "nowrap" }}>{e.type === "JOIN" ? "ein" : "aus"} {fmtTimeSec.format(e.at)}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {room.register && (
        <>
          <h2 className="sect">Klassenbuch</h2>
          <pre className="text">{room.register.content}</pre>
          <p className="muted">Eingetragen von {room.register.author}, {fmtDateTime.format(room.register.updatedAt)}</p>
        </>
      )}
      <div className="signline"><span>Unterschrift Lehrkraft</span></div>
      <p className="muted" style={{ marginTop: 24 }}>
        Erstellt am {fmtDateTime.format(now)}. Quelle: Einwahlprotokoll der Plattform; die Bewertung (anwesend/teilweise) ist ein Vorschlag nach einer vorläufigen Regel, gültig erst nach Bestätigung durch die Lehrkraft.
      </p>
    </main>
  );
}
