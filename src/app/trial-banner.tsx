import { getDb } from "@/db";
import { withOrganization } from "@/db/client";
import { loadAccess } from "@/server/access";
import { getSession } from "@/server/session";

/** Hinweisleiste über allen angemeldeten Seiten: Resttage der Testzeit bzw. „nur lesen“ nach Ablauf. */
export async function TrialBanner() {
  const s = await getSession();
  if (!s) return null;
  const access = await withOrganization(await getDb(), s.organizationId, (tx) => loadAccess(tx));
  if (access.mode === "READ_ONLY") {
    return (
      <div className="warn" role="status">
        <strong>Die Testzeit ist abgelaufen.</strong> Deine Daten bleiben sichtbar, Änderungen sind gesperrt, bis die Schule freigeschaltet ist.
      </div>
    );
  }
  if (access.mode === "FULL" && access.trialDaysLeft !== null) {
    const d = access.trialDaysLeft;
    return (
      <div className="warn" role="status">
        <strong>Testzeit:</strong> {d === 1 ? "heute der letzte Tag" : `noch ${d} Tage`}. Danach kannst du deine Daten nur noch ansehen.
      </div>
    );
  }
  return null;
}
