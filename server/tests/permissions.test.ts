import { ROLES, PERMISSIONS, can, permissionsFor } from "../config/permissions";
import { navFor } from "../src/config/navigation";

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
    "completion.record",
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
    "locations.manage",
    "completion.record",
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
    expect(can("STUDENT", "completion.record")).toBe(false);
    expect(can("STUDENT", "locations.manage")).toBe(false);
    expect(can("TEACHER", "duty.verify")).toBe(true);
    expect(can("TEACHER", "schedules.view")).toBe(false);
    expect(can("TEACHER", "completion.record")).toBe(true);
    expect(can("TEACHER", "locations.manage")).toBe(false);
    expect(can("CSDL", "schedules.manage")).toBe(true);
    expect(can("CSDL", "completion.record")).toBe(true);
    expect(can("CSDL", "locations.manage")).toBe(true);
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

describe("config/navigation", () => {
  test("the CSDL sidebar lists exactly five entries, in order", () => {
    expect(navFor("CSDL").map((item) => item.label)).toEqual([
      "Dashboard",
      "Duty Schedules",
      "Duty Management",
      "Applications",
      "Profile & Settings",
    ]);
  });

  test("the CSDL sidebar points at the duty pages", () => {
    expect(navFor("CSDL").map((item) => item.path)).toEqual([
      "/csdl/dashboard",
      "/csdl/schedule",
      "/csdl/duty-management",
      "/csdl/applications",
      "/csdl/profile",
    ]);
  });

  test("the teacher's Today's Assignments entry is unchanged", () => {
    const teacher = navFor("TEACHER");
    const todays = teacher.filter((item) => item.label === "Today's Assignments");
    expect(todays).toHaveLength(1);
    expect(todays[0].path).toBe("/todays-assignments");
    expect(todays[0].permission).toBe("assignments.today.view");
  });
});
