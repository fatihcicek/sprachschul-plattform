import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { navFor, Shell } from "@/app/shell";
import { PageHead } from "@/app/ui";
import { asSessionUser } from "@/server/context";
import { listPeople } from "@/server/courses";
import { loadBamfEnabled } from "@/server/features";
import { NotAllowedError } from "@/server/actor";
import { CourseWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function KursAnlegen() {
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, role: p!.role, people: await listPeople(tx, me), bamf: await loadBamfEnabled(tx) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  return (
    <Shell name={data.name} home="/verwaltung/heute" nav={navFor(data.role)} wide>
      <PageHead back={{ href: "/verwaltung", label: "Alle Kurse" }} title="Kurs anlegen" />
      <CourseWizard teachers={data.people.teachers} learners={data.people.learners} bamfEnabled={data.bamf} />
    </Shell>
  );
}
