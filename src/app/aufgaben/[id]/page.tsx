import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { LEARNER_NAV, Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { getForLearner } from "@/server/assignments";
import { formatDue, formatTime, STATUS_LABEL } from "@/app/format";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

export default async function Aufgabe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, ...(await getForLearner(tx, me, id)) };
    } catch {
      return null;
    }
  });
  if (!data) notFound();
  const { assignment, submission, versions, name } = data;
  const status = submission?.status ?? "DRAFT";
  return (
    <Shell name={name} home="/aufgaben" nav={LEARNER_NAV}>
      <p><Link href="/aufgaben" className="pagehead-back">‹ Alle Aufgaben</Link></p>
      <div className="card">
        <div className="row">
          <h1 style={{ margin: 0 }}>{assignment.title}</h1>
          <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p className="muted">{formatDue(assignment.dueAt)}</p>
        <pre className="text">{assignment.instructions}</pre>
      </div>
      <div className="card">
        <Editor assignmentId={assignment.id} initialText={submission?.draftText ?? ""} locked={status === "SUBMITTED"} />
      </div>
      {versions.length > 0 && (
        <div className="card">
          <strong>Abgaben und Rückmeldungen</strong>
          {versions.map(({ version, feedback }) => (
            <div key={version.id} style={{ marginTop: 16 }}>
              <div className="muted">Version {version.versionNo} · {formatTime(version.submittedAt)}</div>
              <pre className="text">{version.text}</pre>
              {feedback && <div className="feedback"><strong>Rückmeldung der Lehrkraft</strong><br />{feedback.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
