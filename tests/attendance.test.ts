import { describe, expect, it } from "vitest";
import { computePresence, planStatusChange, proposeStatus, timelineSegments, type ConnectionEvent } from "@/domain/attendance";

const t = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+01:00`);
const session = { start: t("18:00"), end: t("21:15") };
const join = (hhmm: string): ConnectionEvent => ({ type: "JOIN", at: t(hhmm) });
const leave = (hhmm: string): ConnectionEvent => ({ type: "LEAVE", at: t(hhmm) });

describe("computePresence", () => {
  it("zählt eine durchgehende Einwahl voll", () => {
    const p = computePresence([join("18:00"), leave("21:15")], session);
    expect(p.presentMinutes).toBe(195);
    expect(p.openEnded).toBe(false);
  });

  it("zählt Zeit vor Beginn und nach Ende nicht mit", () => {
    expect(computePresence([join("17:50"), leave("21:30")], session).presentMinutes).toBe(195);
  });

  it("zieht eine Unterbrechung ab", () => {
    const p = computePresence([join("18:01"), leave("19:10"), join("19:14"), leave("21:15")], session);
    expect(p.intervals).toHaveLength(2);
    expect(p.presentMinutes).toBe(69 + 121);
  });

  it("zählt ein zweites Gerät nicht doppelt", () => {
    const p = computePresence([join("18:00"), join("18:30"), leave("19:00"), leave("20:00")], session);
    expect(p.intervals).toHaveLength(1);
    expect(p.presentMinutes).toBe(120);
  });

  it("verbindet eine Wiedereinwahl im selben Moment ohne Lücke", () => {
    const p = computePresence([join("18:00"), leave("19:00"), join("19:00"), leave("20:00")], session);
    expect(p.intervals).toHaveLength(1);
    expect(p.presentMinutes).toBe(120);
  });

  it("ist unabhängig von der Reihenfolge der Zustellung", () => {
    const p = computePresence([leave("21:15"), join("19:14"), leave("19:10"), join("18:01")], session);
    expect(p.presentMinutes).toBe(190);
  });

  it("zählt eine fehlende Abmeldung bis Terminende und markiert sie", () => {
    const p = computePresence([join("18:22")], session);
    expect(p.presentMinutes).toBe(173);
    expect(p.openEnded).toBe(true);
  });

  it("ignoriert eine Abmeldung ohne Einwahl", () => {
    expect(computePresence([leave("19:00")], session).presentMinutes).toBe(0);
  });

  it("ergibt null Minuten ohne Ereignisse oder außerhalb des Termins", () => {
    expect(computePresence([], session).presentMinutes).toBe(0);
    expect(computePresence([join("16:00"), leave("17:00")], session).presentMinutes).toBe(0);
  });
});

describe("proposeStatus", () => {
  it("schlägt je nach Anteil anwesend, teilweise oder fehlt vor", () => {
    expect(proposeStatus(195, 195)).toBe("PRESENT");
    expect(proposeStatus(173, 195)).toBe("PRESENT");
    expect(proposeStatus(92, 195)).toBe("PARTIAL");
    expect(proposeStatus(0, 195)).toBe("ABSENT");
  });
});

describe("planStatusChange", () => {
  it("ändert einen Vorschlag ohne Begründung", () => {
    expect(planStatusChange({ status: "PRESENT", reviewState: "PROPOSED" }, "PARTIAL")).toEqual({ kind: "update" });
  });

  it("verlangt nach der Bestätigung eine Begründung", () => {
    const confirmed = { status: "ABSENT", reviewState: "CONFIRMED" } as const;
    expect(() => planStatusChange(confirmed, "EXCUSED")).toThrow(/Begründung/);
    expect(() => planStatusChange(confirmed, "EXCUSED", "   ")).toThrow(/Begründung/);
    expect(planStatusChange(confirmed, "EXCUSED", " Attest liegt vor ")).toEqual({
      kind: "correction",
      fromStatus: "ABSENT",
      toStatus: "EXCUSED",
      reason: "Attest liegt vor",
    });
  });

  it("tut nichts, wenn sich der Status nicht ändert", () => {
    expect(planStatusChange({ status: "PRESENT", reviewState: "CONFIRMED" }, "PRESENT")).toEqual({ kind: "none" });
  });
});

describe("timelineSegments", () => {
  const sum = (s: { widthPct: number }[]) => s.reduce((a, x) => a + x.widthPct, 0);

  it("füllt den Termin lückenlos aus (eingewählt, Pause, eingewählt)", () => {
    const p = computePresence([join("18:00"), leave("19:00"), join("19:30"), leave("21:15")], session);
    const seg = timelineSegments(p.intervals, session);
    expect(seg.map((s) => s.kind)).toEqual(["active", "idle", "active"]);
    expect(sum(seg)).toBeCloseTo(100, 6);
    expect(seg[1]?.from).toEqual(t("19:00"));
    expect(seg[1]?.to).toEqual(t("19:30"));
  });

  it("zeigt späte Einwahl als Leerlauf am Anfang", () => {
    const p = computePresence([join("18:45"), leave("21:15")], session);
    const seg = timelineSegments(p.intervals, session);
    expect(seg.map((s) => s.kind)).toEqual(["idle", "active"]);
    expect(seg[0]?.leftPct).toBe(0);
    expect(sum(seg)).toBeCloseTo(100, 6);
  });

  it("ohne Einwahl ein einziger Leerlauf-Abschnitt; ungültiger Termin ergibt nichts", () => {
    expect(timelineSegments([], session).map((s) => s.kind)).toEqual(["idle"]);
    expect(timelineSegments([], { start: t("10:00"), end: t("10:00") })).toEqual([]);
  });
});
