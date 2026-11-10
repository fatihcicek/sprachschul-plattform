import { getCurrentAccess } from "@/server/current-access";

const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

/** Hinweisleiste über allen angemeldeten Seiten: Resttage der Testzeit bzw. „nur lesen“ nach Ablauf. */
export async function TrialBanner() {
  const cur = await getCurrentAccess();
  if (!cur) return null;
  const { access, role } = cur;
  const who = role === "ADMIN" ? "Bitte wende dich an den Betreiber von Kurswerk." : "Bitte wende dich an die Leitung deiner Schule.";
  if (access.mode === "READ_ONLY") {
    return (
      <div className="warn" role="status">
        <strong>Die Testzeit ist abgelaufen.</strong> Deine Daten bleiben sichtbar, Änderungen sind gesperrt, bis die Schule freigeschaltet ist. {who}
      </div>
    );
  }
  if (access.mode === "FULL" && access.trialDaysLeft !== null && access.trialEndsAt) {
    const d = access.trialDaysLeft;
    return (
      <div className="warn" role="status">
        <strong>Testzeit:</strong> {d === 1 ? "heute der letzte Tag" : `noch ${d} Tage`} (bis {fmt.format(access.trialEndsAt)} Uhr). Danach kannst du deine Daten nur noch ansehen.
      </div>
    );
  }
  return null;
}
