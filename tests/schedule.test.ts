import { describe, expect, it } from "vitest";
import { findVirtualUeViolations, localDay, validateSession, type PlannedSession } from "@/domain/schedule";

const s = (id: string, day: string, from: string, to: string, ue: number, mode: "VIRTUAL" | "PRESENCE" = "VIRTUAL"): PlannedSession => ({
  id,
  startsAt: new Date(`${day}T${from}:00+01:00`),
  endsAt: new Date(`${day}T${to}:00+01:00`),
  plannedUe: ue,
  mode,
});

describe("validateSession", () => {
  it("akzeptiert 4 UE in 195 Minuten mit Pause", () => {
    expect(validateSession(s("a", "2026-11-10", "18:00", "21:15", 4))).toEqual([]);
  });
  it("meldet zu viele UE für die Dauer und vertauschte Zeiten", () => {
    expect(validateSession(s("a", "2026-11-10", "18:00", "20:00", 4))).toHaveLength(1);
    expect(validateSession(s("a", "2026-11-10", "20:00", "18:00", 2))[0]).toMatch(/Ende/);
    expect(validateSession(s("a", "2026-11-10", "18:00", "20:00", 0))[0]).toMatch(/UE/);
  });
});

describe("findVirtualUeViolations", () => {
  it("erlaubt 4 virtuelle UE pro Tag an mehreren Tagen", () => {
    const plan = [s("di", "2026-11-10", "18:00", "21:15", 4), s("do", "2026-11-12", "18:00", "21:15", 4)];
    expect(findVirtualUeViolations(plan)).toEqual([]);
  });

  it("meldet 5 UE, wenn es mehrere virtuelle Tage in der Woche gibt", () => {
    const plan = [s("di", "2026-11-10", "17:00", "21:15", 5), s("do", "2026-11-12", "18:00", "21:15", 4)];
    expect(findVirtualUeViolations(plan)).toEqual([{ day: "2026-11-10", plannedUe: 5, allowedUe: 4, sessionIds: ["di"] }]);
  });

  it("erlaubt 5 UE bei nur einem virtuellen Tag in der Woche, 6 aber nicht", () => {
    const presence = s("sa", "2026-11-14", "09:00", "12:15", 4, "PRESENCE");
    expect(findVirtualUeViolations([s("di", "2026-11-10", "17:00", "21:15", 5), presence])).toEqual([]);
    expect(findVirtualUeViolations([s("di", "2026-11-10", "16:00", "21:15", 6), presence])[0]?.allowedUe).toBe(5);
  });

  it("zählt mehrere Termine am selben Tag zusammen und Präsenz nicht mit", () => {
    const plan = [
      s("vm", "2026-11-10", "09:00", "11:30", 3),
      s("ab", "2026-11-10", "18:00", "20:00", 2),
      s("pr", "2026-11-10", "13:00", "16:15", 4, "PRESENCE"),
      s("do", "2026-11-12", "18:00", "21:15", 4),
    ];
    expect(findVirtualUeViolations(plan)).toEqual([{ day: "2026-11-10", plannedUe: 5, allowedUe: 4, sessionIds: ["vm", "ab"] }]);
  });

  it("ordnet einen Termin kurz nach Mitternacht dem richtigen Tag in deutscher Zeit zu", () => {
    expect(localDay(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-11");
    expect(localDay(new Date("2026-07-10T22:30:00Z"))).toBe("2026-07-11");
  });
});
