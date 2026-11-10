import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import { can } from "@/domain/permissions";
import { ADMIN_NAV, Shell } from "@/app/shell";
import { asSessionUser } from "@/server/context";
import { loadActor } from "@/server/actor";
import { getCurrentAccess } from "@/server/current-access";
import { loadBamfEnabled } from "@/server/features";
import { BamfSwitch } from "./switch";

export const dynamic = "force-dynamic";

export default async function Einstellungen() {
  const data = await asSessionUser(async (tx, me) => {
    const actor = await loadActor(tx, me);
    // Einstellungen sehen nur Leitung und Verwaltung; ändern darf nur die Leitung.
    if (!actor.active || !can(actor.role, "course.configure")) return null;
    const [p] = await tx.select({ f: users.firstName, l: users.lastName }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, me));
    return { name: `${p!.f} ${p!.l}`, bamf: await loadBamfEnabled(tx), canChange: can(actor.role, "organization.manage") };
  });
  if (!data) redirect("/");
  const readOnly = (await getCurrentAccess())?.access.mode === "READ_ONLY";
  return (
    <Shell name={data.name} home="/verwaltung" nav={ADMIN_NAV}>
      <h1>Einstellungen</h1>
      <BamfSwitch enabled={data.bamf} canChange={data.canChange} readOnly={readOnly} />
    </Shell>
  );
}
