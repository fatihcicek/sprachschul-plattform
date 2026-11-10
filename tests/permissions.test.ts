import { describe, expect, it } from "vitest";
import { can, canInCourse, PERMISSIONS, type Actor } from "@/domain/permissions";

describe("Rechte je Rolle", () => {
  it("gibt Teilnehmenden nur die Teilnahme", () => {
    expect(PERMISSIONS.filter((p) => can("LEARNER", p))).toEqual(["course.participate"]);
  });

  it("lässt Lehrkräfte weder Kursdaten noch Zuordnungen ändern", () => {
    expect(can("TEACHER", "course.configure")).toBe(false);
    expect(can("TEACHER", "enrollment.manage")).toBe(false);
    expect(can("TEACHER", "attendance.review")).toBe(true);
  });

  it("lässt die Verwaltung exportieren, aber keine Anwesenheit bestätigen", () => {
    expect(can("STAFF", "evidence.export")).toBe(true);
    expect(can("STAFF", "attendance.review")).toBe(false);
    expect(can("STAFF", "organization.manage")).toBe(false);
  });

  it("bindet Lehrkräfte an ihre zugeordneten Kurse", () => {
    const teacher: Actor = { role: "TEACHER", active: true, assignedCourseIds: ["k1"] };
    expect(canInCourse(teacher, "attendance.review", "k1")).toBe(true);
    expect(canInCourse(teacher, "attendance.review", "k2")).toBe(false);
  });

  it("verweigert deaktivierten Konten alles", () => {
    const admin: Actor = { role: "ADMIN", active: false, assignedCourseIds: [] };
    expect(PERMISSIONS.some((p) => canInCourse(admin, p, "k1"))).toBe(false);
  });

  it("lässt Teilnehmende nur in eigene Kurse", () => {
    const learner: Actor = { role: "LEARNER", active: true, assignedCourseIds: ["k1"] };
    expect(canInCourse(learner, "course.participate", "k1")).toBe(true);
    expect(canInCourse(learner, "course.participate", "k2")).toBe(false);
  });
});
