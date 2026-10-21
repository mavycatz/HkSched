import { ROLES, PERMISSIONS, can, permissionsFor } from "../config/permissions";

const EXPECTED: Record<string, string[]> = {
  STUDENT: [
    "dashboard.view",
    "duties.upcoming.view",
    "duties.own.view",
    "duties.details.view",
    "schedule.own.view",
    "attendance.own.view",
    "applications.submit",
    "applications.own.view",
    "settings.manage",
    "profile.own",
  ],
  TEACHER: [
    "dashboard.view",
    "assignments.today.view",
    "assignments.manage",
    "duty.verify",
    "approvals.review",
    "schedule.own.view",
    "applications.submit",
    "applications.own.view",
    "settings.manage",
    "profile.own",
  ],
  CSDL: [
    "dashboard.view",
    "assignments.today.view",
    "schedules.view",
    "schedules.manage",
    "assign.students_teachers",
    "completion.monitor",
    "applications.manage",
    "profile.own",
    "settings.manage",
  ],
};

describe("config/permissions", () => {
  test("exposes exactly the three roles", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(["CSDL", "STUDENT", "TEACHER"]);
    expect(ROLES).toEqual({ STUDENT: "STUDENT", TEACHER: "TEACHER", CSDL: "CSDL" });
  });

  for (const role of ["STUDENT", "TEACHER", "CSDL"] as const) {
    test(`${role} permission set matches the spec exactly`, () => {
      expect([...PERMISSIONS[role]].sort()).toEqual([...EXPECTED[role]].sort());
    });
  }

  test("can() grants and denies per the map", () => {
    expect(can("STUDENT", "duties.own.view")).toBe(true);
    expect(can("STUDENT", "schedules.manage")).toBe(false);
    expect(can("STUDENT", "duty.verify")).toBe(false);
    expect(can("TEACHER", "duty.verify")).toBe(true);
    expect(can("TEACHER", "schedules.view")).toBe(false);
    expect(can("CSDL", "schedules.manage")).toBe(true);
    expect(can("CSDL", "applications.submit")).toBe(false);
    expect(can("UNKNOWN", "dashboard.view")).toBe(false);
  });

  test("permissionsFor returns a copy of the set", () => {
    const perms = permissionsFor("CSDL");
    expect(perms.sort()).toEqual([...EXPECTED.CSDL].sort());
    perms.push("injected.permission");
    expect(can("CSDL", "injected.permission")).toBe(false);
  });
});
