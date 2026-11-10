import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships } from "@/db/schema";
import { getSession } from "@/server/session";
import { asSessionUser } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await getSession())) redirect("/login");
  const role = await asSessionUser(async (tx, me) => (await tx.select().from(memberships).where(eq(memberships.id, me)))[0]?.role);
  redirect(role === "LEARNER" ? "/aufgaben" : role === "TEACHER" ? "/lehrkraft" : role === "ADMIN" || role === "STAFF" ? "/verwaltung" : "/login");
}
