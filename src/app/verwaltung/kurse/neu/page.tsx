import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { listPeople } from "@/server/courses";
import { NotAllowedError } from "@/server/actor";
import { CourseWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function KursAnlegen() {
  const data = await asSessionUser(async (tx, me) => {
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    try {
      return { name: `${p!.f} ${p!.l}`, people: await listPeople(tx, me) };
    } catch (e) {
      if (e instanceof NotAllowedError) return null;
      throw e;
    }
  });
  if (!data) redirect("/");
  return (
    <Shell name={data.name} home="/verwaltung" nav={ADMIN_NAV} wide>
      <h1>Kurs anlegen</h1>
      <CourseWizard teachers={data.people.teachers} learners={data.people.learners} />
    </Shell>
  );
}
