import request from "supertest";
import { createApp } from "../src/app";
import { getPool } from "../src/db/pool";

jest.setTimeout(30000);

const PASSWORD = "HkDuty!ChangeMe1";
const app = createApp();

function csrfFrom(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error("CSRF token not found in page");
  return match[1];
}

type Agent = ReturnType<typeof request.agent>;

async function loginPage(agent: Agent): Promise<string> {
  const res = await agent.get("/login");
  expect(res.status).toBe(200);
  return csrfFrom(res.text);
}

function setCookies(res: request.Response): string[] {
  return (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
}

function cookieNamed(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

describe("POST /login", () => {
  test("STUDENT logs in with school ID, gets secure session cookie, lands on their dashboard", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);

    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-001", password: PASSWORD, remember: "on", _csrf: token });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");

    const sid = cookieNamed(res, "hkduty.sid");
    expect(sid).toBeDefined();
    expect(sid!.toLowerCase()).toContain("httponly");
    expect(sid!.toLowerCase()).toContain("samesite=lax");

    // Remember me: identifier only, readable by the server on next visit, never the password.
    const remember = cookieNamed(res, "remember_id");
    expect(remember).toBeDefined();
    expect(remember!.toLowerCase()).not.toContain("httponly");
    expect(decodeURIComponent(remember!.split(";")[0].split("=").slice(1).join("="))).toBe("S-001");

    const allCookies = setCookies(res);
    expect(JSON.stringify(allCookies)).not.toContain(PASSWORD);
    expect(JSON.stringify(allCookies)).not.toContain("HkDuty");

    // Remembered ID prefills the form; password field is empty.
    const loginAgain = await agent.get("/login");
    expect(loginAgain.text).toContain('value="S-001"');
    expect(loginAgain.text).not.toMatch(/name="password"[^>]*value="/);

    // Role comes from the database, not from input.
    const dash = await agent.get("/dashboard?role=CSDL");
    expect(dash.status).toBe(200);
    expect(dash.text).toContain("Marco Cruz");
    expect(dash.text).toContain("STUDENT");
    expect(dash.text).not.toContain("CSDL-001");
  });

  test("login with an email address also works", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({
        identifier: "bea.santos@student.hkscholastics.edu.ph",
        password: PASSWORD,
        _csrf: token,
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  test("TEACHER logs in and reaches the TEACHER dashboard", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "T-001", password: PASSWORD, _csrf: token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");

    const dash = await agent.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.text).toContain("Luis Mendoza");
    expect(dash.text).toContain("TEACHER");
    expect(dash.text).toContain("Today&#39;s Assignments");
  });

  test("CSDL logs in and reaches the CSDL dashboard", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "CSDL-001", password: PASSWORD, _csrf: token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");

    const dash = await agent.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.text).toContain("Ana Reyes");
    expect(dash.text).toContain("CSDL");
    expect(dash.text).toContain("Monitor Completion");
  });

  test("wrong password returns generic 401 and establishes no session", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-002", password: "definitely-wrong", _csrf: token });

    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid credentials");
    expect(res.text).not.toContain("incorrect password");
    expect(cookieNamed(res, "hkduty.sid")).toBeUndefined();
  });

  test("unknown ID returns the same generic 401", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "no-such-user-xyz", password: PASSWORD, _csrf: token });

    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid credentials");
    expect(cookieNamed(res, "hkduty.sid")).toBeUndefined();
  });

  test("inactive account returns the same generic 401", async () => {
    const pool = getPool();
    await pool.query("UPDATE users SET is_active = false WHERE school_id = 'S-005'");
    try {
      const agent = request.agent(app);
      const token = await loginPage(agent);
      const res = await agent
        .post("/login")
        .type("form")
        .send({ identifier: "S-005", password: PASSWORD, _csrf: token });
      expect(res.status).toBe(401);
      expect(res.text).toContain("Invalid credentials");
      expect(cookieNamed(res, "hkduty.sid")).toBeUndefined();
    } finally {
      await pool.query("UPDATE users SET is_active = true WHERE school_id = 'S-005'");
    }
  });

  test("empty identifier is rejected with 422 and an inline field error", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: " ", password: PASSWORD, _csrf: token });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Username is required");
    expect(cookieNamed(res, "hkduty.sid")).toBeUndefined();
  });

  test("empty password is rejected with 422 and an inline field error", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-003", password: "", _csrf: token });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Password is required");
    expect(cookieNamed(res, "hkduty.sid")).toBeUndefined();
  });

  test("6 failures for the same IP+ID trigger a 429 lockout", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const identifier = "rate-limit-probe";

    let last: request.Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      last = await agent
        .post("/login")
        .type("form")
        .send({ identifier, password: "wrong", _csrf: token });
    }

    expect(last!.status).toBe(429);
    expect(last!.text).toContain("Too many failed attempts");
  });

  test("missing CSRF token is rejected before any side effect", async () => {
    const agent = request.agent(app);
    await loginPage(agent); // obtains the CSRF cookie but no token is submitted
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-001", password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.headers.location).toBeUndefined();
  });

  test("invalid CSRF token is rejected", async () => {
    const agent = request.agent(app);
    await loginPage(agent);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-001", password: PASSWORD, _csrf: "not-a-real-token" });

    expect(res.status).toBe(403);
  });

  test("a request with no session at all cannot mint a CSRF token", async () => {
    const res = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: "S-001", password: PASSWORD, _csrf: "x" });
    expect(res.status).toBe(403);
  });

  test("session id changes on every login (regeneration)", async () => {
    const agent = request.agent(app);

    const token1 = await loginPage(agent);
    const first = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-004", password: PASSWORD, _csrf: token1 });
    expect(first.status).toBe(302);
    const sid1 = (cookieNamed(first, "hkduty.sid") ?? "").split(";")[0];

    const token2 = await loginPage(agent);
    const second = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "S-004", password: PASSWORD, _csrf: token2 });
    expect(second.status).toBe(302);
    const sid2 = (cookieNamed(second, "hkduty.sid") ?? "").split(";")[0];

    expect(sid1).not.toEqual(sid2);
  });
});

describe("production cookie flags", () => {
  test("login in production mode sets Secure, HttpOnly, SameSite=Lax session cookie", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const prodApp = createApp();

      // Secure cookies are only emitted over a secure connection; trust proxy
      // lets X-Forwarded-Proto mark the request as https (as Render does).
      const page = await request(prodApp)
        .get("/login")
        .set("X-Forwarded-Proto", "https");
      expect(page.status).toBe(200);
      const token = csrfFrom(page.text);
      const cookieHeader = setCookies(page)
        .map((c) => c.split(";")[0])
        .join("; ");
      expect(cookieHeader).toContain("hkduty.sid=");

      const res = await request(prodApp)
        .post("/login")
        .set("X-Forwarded-Proto", "https")
        .set("Cookie", cookieHeader)
        .type("form")
        .send({ identifier: "S-003", password: PASSWORD, _csrf: token });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/dashboard");

      const sid = cookieNamed(res, "hkduty.sid");
      expect(sid).toBeDefined();
      expect(sid!.toLowerCase()).toContain("secure");
      expect(sid!.toLowerCase()).toContain("httponly");
      expect(sid!.toLowerCase()).toContain("samesite=lax");
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });
});

describe("POST /logout", () => {
  test("destroys the session, clears cookies, and redirects to login", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    const loginRes = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "T-002", password: PASSWORD, remember: "on", _csrf: token });
    expect(loginRes.status).toBe(302);
    const sidCookie = cookieNamed(loginRes, "hkduty.sid")!.split(";")[0];
    expect(sidCookie).toBeTruthy();

    // Authenticated page works.
    const dash = await agent.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.text).toContain("Grace Lim");

    const logoutToken = csrfFrom(dash.text);
    const logoutRes = await agent
      .post("/logout")
      .type("form")
      .send({ _csrf: logoutToken });

    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.location).toBe("/login");

    const clearedSid = cookieNamed(logoutRes, "hkduty.sid");
    expect(clearedSid).toBeDefined();
    expect(clearedSid!.toLowerCase()).toContain("expires=thu, 01 jan 1970");

    // Remembered identifier is cleared on logout.
    const clearedRemember = cookieNamed(logoutRes, "remember_id");
    expect(clearedRemember).toBeDefined();
    expect(clearedRemember!.toLowerCase()).toContain("expires=thu, 01 jan 1970");

    // Replaying the old session cookie no longer authenticates.
    const replay = await request(app)
      .get("/dashboard")
      .set("Cookie", sidCookie);
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe("/login");
  });

  test("logout without a CSRF token is rejected", async () => {
    const agent = request.agent(app);
    const token = await loginPage(agent);
    await agent.post("/login").type("form").send({ identifier: "S-001", password: PASSWORD, _csrf: token });

    const res = await agent.post("/logout");
    expect(res.status).toBe(403);

    // Still logged in.
    const dash = await agent.get("/dashboard");
    expect(dash.status).toBe(200);
  });
});
