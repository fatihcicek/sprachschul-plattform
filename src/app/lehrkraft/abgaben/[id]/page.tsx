import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { Shell } from "@/app/shell";
import { feedbackAction } from "@/app/actions";
import { asSessionUser } from "@/server/context";
import { getForTeacher } from "@/server/assignments";
import { formatTime, STATUS_LABEL } from "@/app/format";

export const dynamic = "force-dynamic";

export default async function Abgabe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, ...(await getForTeacher(tx, me, id)) };
    } catch {
      return null;
    }
  });
  if (!data) notFound();
  const { assignment, submission, learner, versions } = data;
  return (
    <Shell name={data.name} home="/lehrkraft">
      <p><Link href="/lehrkraft" className="muted">← Zurück</Link></p>
      <div className="card">
        <div className="row"><h1 style={{ margin: 0 }}>{assignment.title}</h1><span className={`badge ${submission.status}`}>{STATUS_LABEL[submission.status]}</span></div>
        <p className="muted">{learner.firstName} {learner.lastName}</p>
      </div>
      {versions.map(({ version, feedback }) => (
        <div key={version.id} className="card">
          <div className="muted">Version {version.versionNo} · {formatTime(version.submittedAt)}</div>
          <pre className="text">{version.text}</pre>
          {feedback && <div className="feedback"><strong>Deine Rückmeldung</strong><br />{feedback.comment}</div>}
        </div>
      ))}
      {submission.status === "SUBMITTED" && (
        <form action={feedbackAction.bind(null, submission.id)} className="card">
          <label htmlFor="comment">Rückmeldung an {learner.firstName}</label>
          <textarea id="comment" name="comment" required style={{ minHeight: 120 }} />
          <p><button type="submit">Rückmeldung senden</button></p>
        </form>
      )}
    </Shell>
  );
}
