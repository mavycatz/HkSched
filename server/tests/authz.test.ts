import request from "supertest";
import { createApp } from "../src/app";
import { loginAs } from "./helpers";

jest.setTimeout(30000);

const app = createApp();

describe("requireAuth (public vs protected)", () => {
  test("public pages respond without a session", async () => {
    await request(app).get("/login").expect(200);
    await request(app).get("/forgot-password").expect(200);
    await request(app).get("/health").expect(200);
  });

  test("protected pages redirect to /login when unauthenticated", async () => {
    for (const path of [
      "/dashboard",
      "/my-duties",
      "/verification",
      "/csdl/duty-management",
      "/attendance-profile",
      "/settings",
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    }
  });

  test("a remembered but destroyed session is sent back to login", async () => {
    const agent = await loginAs(app, "S-001");
    await agent.post("/logout").type("form").send({
      _csrf: (await agent.get("/dashboard")).text.match(
        /name="_csrf" value="([^"]+)"/,
      )![1],
    });
    const res = await agent.get("/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});

describe("requirePermission (cross-role denials render themed 403)", () => {
  test("STUDENT cannot open TEACHER or CSDL pages", async () => {
    const student = await loginAs(app, "S-001");

    const verification = await student.get("/verification");
    expect(verification.status).toBe(403);
    expect(verification.text).toContain("You don&#39;t have access to this page.");
    expect(verification.text).toContain("/css/theme.css");

    const dutySchedules = await student.get("/csdl/duty-management");
    expect(dutySchedules.status).toBe(403);
    expect(dutySchedules.text).toContain("You don&#39;t have access to this page.");

    const assignments = await student.get("/assignments");
    expect(assignments.status).toBe(403);
  });

  test("STUDENT cannot open other TEACHER-only pages", async () => {
    const student = await loginAs(app, "S-002");
    for (const path of ["/approvals", "/todays-assignments", "/assignments"]) {
      const res = await student.get(path);
      expect(res.status).toBe(403);
    }
  });

  test("TEACHER cannot open STUDENT or CSDL pages", async () => {
    const teacher = await loginAs(app, "T-001");
    for (const path of ["/my-duties", "/upcoming-duties", "/attendance-profile", "/csdl/duty-management"]) {
      const res = await teacher.get(path);
      expect(res.status).toBe(403);
      expect(res.text).toContain("You don&#39;t have access to this page.");
    }
  });

  test("CSDL cannot open role-scoped TEACHER pages", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    for (const path of ["/approvals", "/verification", "/my-duties"]) {
      const res = await csdl.get(path);
      expect(res.status).toBe(403);
    }
  });

  test("permitted pages still render for each role", async () => {
    const student = await loginAs(app, "S-003");
    await student.get("/my-duties").expect(200);

    const teacher = await loginAs(app, "T-002");
    await teacher.get("/verification").expect(200);

    const csdl = await loginAs(app, "CSDL-001");
    await csdl.get("/monitor-completion").expect(200);
  });
});

describe("record-level authorization (404, not 403)", () => {
  test("STUDENT sees their own attendance record", async () => {
    const student = await loginAs(app, "S-001");
    const own = await student.get("/attendance-profile");
    expect(own.status).toBe(200);
    expect(own.text).toContain("Attendance Profile");

    const explicitOwn = await student.get("/attendance-profile?student=S-001");
    expect(explicitOwn.status).toBe(200);
  });

  test("STUDENT requesting another student's record gets 404", async () => {
    const student = await loginAs(app, "S-001");
    const res = await student.get("/attendance-profile?student=S-002");
    expect(res.status).toBe(404);
    expect(res.text).toContain("could not be found");
    expect(res.text).not.toContain("have access");
  });

  test("a nonexistent record also returns 404", async () => {
    const student = await loginAs(app, "S-002");
    const res = await student.get("/attendance-profile?student=NOPE-999");
    expect(res.status).toBe(404);
  });

  test("cross-role access to the record page is a 403 (permission), not a 404", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get("/attendance-profile?student=S-001");
    expect(res.status).toBe(403);
    expect(res.text).toContain("You don&#39;t have access to this page.");
  });

  test("CSDL can view any student's record", async () => {
    // CSDL lacks attendance.own.view, so scope the check through a role that
    // can open the page: verify the helper directly instead.
    const { canViewStudentRecord } = await import("../src/lib/authorization");
    const csdlUser = {
      id: 1,
      school_id: "CSDL-001",
      full_name: "Ana Reyes",
      email: "ana@x",
      role: "CSDL" as const,
      is_active: true,
    };
    await expect(canViewStudentRecord(csdlUser, "S-004")).resolves.toBe(true);
  });
});
