import { describe, expect, it } from "vitest";
import { checkPlan, expandPlan, localTimeToDate, type WeeklyPlan } from "@/domain/course-plan";

const base: WeeklyPlan = { startDate: "2026-11-02", endDate: "2026-11-15", weekdays: [1, 2, 3, 4, 5], startTime: "08:30", endTime: "12:35", ue: 5, mode: "PRESENCE" };

describe("Kursplanung aus dem Wochenmuster", () => {
  it("erzeugt nur die gewählten Wochentage im Zeitraum", () => {
    const dates = expandPlan(base, []);
    expect(dates).toHaveLength(10);
    expect(dates[0]!.day).toBe("2026-11-02");
    expect(dates.at(-1)!.day).toBe("2026-11-13");
  });

  it("lässt ausgenommene Tage weg", () => {
    expect(expandPlan(base, ["2026-11-04", "2026-11-11"]).map((d) => d.day)).not.toContain("2026-11-04");
    expect(expandPlan(base, ["2026-11-04", "2026-11-11"])).toHaveLength(8);
  });

  it("rechnet Ortszeit richtig, auch über die Zeitumstellung", () => {
    expect(localTimeToDate("2026-11-02", "08:30").toISOString()).toBe("2026-11-02T07:30:00.000Z"); // Winterzeit
    expect(localTimeToDate("2026-07-01", "08:30").toISOString()).toBe("2026-07-01T06:30:00.000Z"); // Sommerzeit
    expect(localTimeToDate("2027-03-28", "08:30").toISOString()).toBe("2027-03-28T06:30:00.000Z"); // Tag der Umstellung
  });

  it("blockiert unmögliche Angaben", () => {
    expect(checkPlan({ ...base, endDate: "2026-10-01" }).errors).toContain("Das Kursende liegt vor dem Kursbeginn.");
    expect(checkPlan({ ...base, weekdays: [] }).errors.length).toBeGreaterThan(0);
    expect(checkPlan({ ...base, ue: 6 }).errors[0]).toMatch(/6 UE brauchen 270 Minuten/);
    expect(checkPlan({ ...base, startDate: "2026-11-07", endDate: "2026-11-08" }).errors).toContain("Im gewählten Zeitraum liegt kein Unterrichtstag.");
    expect(checkPlan({ ...base, endDate: "2029-12-31" }).errors[0]).toMatch(/höchstens 400/);
  });

  it("warnt bei mehr als 4 UE online, blockiert aber nicht", () => {
    const r = checkPlan({ ...base, mode: "VIRTUAL" });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/höchstens 4 UE/);
    expect(checkPlan({ ...base, mode: "VIRTUAL", ue: 4 }).warnings).toEqual([]);
  });
});
