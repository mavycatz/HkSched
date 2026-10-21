import request from "supertest";
import { createApp } from "../src/app";
import { getPool } from "../src/db/pool";
import { loginAs, PASSWORD, cookieNamed } from "./helpers";

jest.setTimeout(30000);

const app = createApp();

async function latestAudit(action: string) {
  const { rows } = await getPool().query(
    `SELECT id, user_id, action, ip, user_agent, metadata, created_at
     FROM audit_logs WHERE action = $1 ORDER BY id DESC LIMIT 1`,
    [action],
  );
  return rows[0];
}

describe("audit logging", () => {
  test("successful login writes a login_success row with IP and user agent", async () => {
    const before = (await getPool().query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n;
    await loginAs(app, "T-001");
    const after = (await getPool().query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n;
    expect(after).toBeGreaterThan(before);

    const row = await latestAudit("login_success");
    expect(row).toBeDefined();
    expect(row.user_id).not.toBeNull();
    expect(row.ip).toBeTruthy();
    expect(row.user_agent).toBeTruthy();
    expect(row.metadata).toMatchObject({ role: "TEACHER" });
  });

  test("failed login writes a login_failure row", async () => {
    const agent = request.agent(app);
    const page = await agent.get("/login");
    const token = page.text.match(/name="_csrf" value="([^"]+)"/)![1];
    await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-004", password: "wrong-password-here", _csrf: token });

    const row = await latestAudit("login_failure");
    expect(row).toBeDefined();
    expect(row.user_id).not.toBeNull();
    expect(row.metadata).toMatchObject({ identifier: "S-004" });
    // Never any secret material in the audit row.
    expect(JSON.stringify(row)).not.toContain("wrong-password-here");
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
  });

  test("logout writes a logout row", async () => {
    const agent = await loginAs(app, "S-004");
    const dash = await agent.get("/dashboard");
    const token = dash.text.match(/name="_csrf" value="([^"]+)"/)![1];
    await agent.post("/logout").type("form").send({ _csrf: token });

    const row = await latestAudit("logout");
    expect(row).toBeDefined();
    expect(row.user_id).not.toBeNull();
  });

  test("permission denial writes a permission_denied row with the permission key", async () => {
    const agent = await loginAs(app, "S-005");
    await agent.get("/verification").expect(403);

    const row = await latestAudit("permission_denied");
    expect(row).toBeDefined();
    expect(row.metadata).toMatchObject({ permission: "duty.verify" });
  });

  test("captured logs never contain passwords or session ids", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const agent = request.agent(app);
      const page = await agent.get("/login");
      const token = page.text.match(/name="_csrf" value="([^"]+)"/)![1];
      const loginRes = await agent
        .post("/login")
        .type("form")
        .send({ identifier: "S-003", password: PASSWORD, _csrf: token });
      expect(loginRes.status).toBe(302);
      const sidCookie = cookieNamed(loginRes, "hkduty.sid")!.split(";")[0];
      const sidValue = decodeURIComponent(sidCookie.split("=").slice(1).join("="));

      const dash = await agent.get("/dashboard");
      const logoutToken = dash.text.match(/name="_csrf" value="([^"]+)"/)![1];
      await agent.post("/logout").type("form").send({ _csrf: logoutToken });

      // A failing login too.
      const anon = request.agent(app);
      const anonPage = await anon.get("/login");
      await anon
        .post("/login")
        .type("form")
        .send({
          identifier: "S-003",
          password: "nope-not-the-password",
          _csrf: anonPage.text.match(/name="_csrf" value="([^"]+)"/)![1],
        });

      const captured = [...logSpy.mock.calls, ...errSpy.mock.calls]
        .flat()
        .map(String)
        .join("\n");
      expect(captured).not.toContain(PASSWORD);
      expect(captured).not.toContain("HkDuty");
      expect(captured).not.toContain("nope-not-the-password");
      expect(captured).not.toContain(sidValue);
      expect(captured).not.toContain(sidCookie);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
