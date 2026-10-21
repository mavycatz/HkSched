import { createApp } from "../src/app";
import { loginAs, csrfFrom } from "./helpers";
import request from "supertest";

jest.setTimeout(30000);

const app = createApp();

/** Extract the sidebar link labels from a rendered page. */
function sidebarLabels(html: string): string[] {
  const matches = [...html.matchAll(/class="side-link[^"]*"[^>]*>([^<]+)</g)];
  return matches.map((m) => m[1].trim());
}

describe("sidebar filtering per role (6.2)", () => {
  const EXPECTED: Record<string, string[]> = {
    STUDENT: [
      "Dashboard",
      "My Duties",
      "Upcoming Duties",
      "Schedule",
      "Attendance Profile",
      "Applications",
      "Profile",
      "Settings",
      "Logout",
    ],
    TEACHER: [
      "Dashboard",
      "Today&#39;s Assignments",
      "Assignments",
      "Verification",
      "Approvals",
      "My Schedule",
      "Applications",
      "Profile",
      "Settings",
      "Logout",
    ],
    CSDL: [
      "Dashboard",
      "Today&#39;s Assignments",
      "Duty Schedules",
      "Create/Edit Schedule",
      "Assign Students &amp; Teachers",
      "Monitor Completion",
      "Applications",
      "Profile &amp; Settings",
      "Logout",
    ],
  };

  const accounts: Record<string, string> = {
    STUDENT: "S-004",
    TEACHER: "T-001",
    CSDL: "CSDL-001",
  };

  for (const role of ["STUDENT", "TEACHER", "CSDL"] as const) {
    test(`${role} sidebar shows exactly the permitted labels`, async () => {
      const agent = await loginAs(app, accounts[role]);
      const dash = await agent.get("/dashboard");
      expect(dash.status).toBe(200);

      const labels = sidebarLabels(dash.text);
      // Logout lives in the sidebar footer as a button, not a link.
      labels.push("Logout");
      expect(labels).toEqual(EXPECTED[role]);

      // Top bar: page title, avatar, role badge, logout form.
      expect(dash.text).toContain('class="topbar-title"');
      expect(dash.text).toContain('class="avatar"');
      expect(dash.text).toContain(`class="role-badge">${role}<`);
      expect(dash.text).toContain('action="/logout"');

      // Active item marked.
      expect(dash.text).toContain('aria-current="page"');
    });
  }

  test("STUDENT sidebar never mentions CSDL/TEACHER features", async () => {
    const agent = await loginAs(app, "S-005");
    const dash = await agent.get("/dashboard");
    for (const label of [
      "Monitor Completion",
      "Duty Schedules",
      "Verification",
      "Approvals",
      "Assign Students & Teachers",
      "Create/Edit Schedule",
      "Assignments",
    ]) {
      expect(dash.text).not.toContain(`>${label}<`);
    }
  });
});

describe("placeholder pages render per role (6.3-6.5)", () => {
  const pagesByRole: { role: string; account: string; pages: [string, string][] }[] = [
    {
      role: "CSDL",
      account: "CSDL-001",
      pages: [
        ["/todays-assignments", "Today&#39;s Assignments"],
        ["/duty-schedules", "Duty Schedules"],
        ["/create-edit-schedule", "Create/Edit Schedule"],
        ["/assign-students-teachers", "Assign Students &amp; Teachers"],
        ["/monitor-completion", "Monitor Completion"],
        ["/applications", "Applications"],
        ["/profile-settings", "Profile &amp; Settings"],
      ],
    },
    {
      role: "STUDENT",
      account: "S-001",
      pages: [
        ["/my-duties", "My Duties"],
        ["/upcoming-duties", "Upcoming Duties"],
        ["/schedule", "Schedule"],
        ["/attendance-profile", "Attendance Profile"],
        ["/applications", "Applications"],
        ["/profile", "Profile"],
        ["/settings", "Settings"],
      ],
    },
    {
      role: "TEACHER",
      account: "T-001",
      pages: [
        ["/todays-assignments", "Today&#39;s Assignments"],
        ["/assignments", "Assignments"],
        ["/verification", "Verification"],
        ["/approvals", "Approvals"],
        ["/my-schedule", "My Schedule"],
        ["/applications", "Applications"],
        ["/profile", "Profile"],
        ["/settings", "Settings"],
      ],
    },
  ];

  for (const { role, account, pages } of pagesByRole) {
    test(`${role} placeholder pages render with the feature title`, async () => {
      const agent = await loginAs(app, account);
      for (const [path, title] of pages) {
        const res = await agent.get(path);
        expect(res.status).toBe(200);
        expect(res.text).toContain(`<h1>${title}</h1>`);
        expect(res.text).toContain("coming soon");
        expect(res.text).toContain('class="sidebar"');
      }
    });
  }

  test("CSDL dashboard shows the CSDL name, badge, and nav preview", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const dash = await agent.get("/dashboard");
    expect(dash.text).toContain("Ana Reyes");
    expect(dash.text).toContain('class="role-badge">CSDL<');
    expect(dash.text).toContain("Monitor Completion");
    expect(dash.text).toContain("Logout");
  });
});

describe("Forgot password and status pages (6.7)", () => {
  test("forgot-password placeholder renders themed", async () => {
    const res = await request(app).get("/forgot-password");
    expect(res.status).toBe(200);
    expect(res.text).toContain("contact your school administrator");
    expect(res.text).toContain("/css/theme.css");
  });

  test("unknown URL renders themed 404", async () => {
    const res = await request(app).get("/no-such-page");
    expect(res.status).toBe(404);
    expect(res.text).toContain("404");
    expect(res.text).toContain("/css/theme.css");
  });

  test("cross-role denial renders themed 403", async () => {
    const agent = await loginAs(app, "S-002");
    const res = await agent.get("/create-edit-schedule");
    expect(res.status).toBe(403);
    expect(res.text).toContain("403");
    expect(res.text).toContain("/css/theme.css");
  });
});

describe("login page structure (6.1 programmatic checks)", () => {
  test("form posts to /login with CSRF, labels, aria, and required fields", async () => {
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain('method="post"');
    expect(res.text).toContain('action="/login"');
    expect(res.text).toContain('name="_csrf"');
    expect(res.text).toContain('for="identifier"');
    expect(res.text).toContain('for="password"');
    expect(res.text).toContain('id="identifier"');
    expect(res.text).toContain('id="password"');
    expect(res.text).toContain('autocomplete="username"');
    expect(res.text).toContain('autocomplete="current-password"');
    expect(res.text).toContain('aria-label="Show password"');
    expect(res.text).toContain("HK Scholastics");
    expect(res.text).toContain("Duty Scheduling Management System");
    expect(res.text).toContain("Welcome Back!");
    expect(res.text).toContain("Log in to your account");
    expect(res.text).toContain("Remember me");
    expect(res.text).toContain("Forgot Password?");
    expect(res.text).toContain('<label class="form-label" for="identifier">Username</label>');
    expect(res.text).toContain('type="text"');
    expect(res.text).toContain('placeholder="Username"');
    expect(res.text).toContain("/img/bg.png");
    expect(res.text).toContain("/img/logo.png");
    // Spinner + waking notice driven by external script (no inline JS).
    expect(res.text).toContain("/js/login.js");
    expect(res.text).toContain('id="waking-notice"');
    expect(res.text).toContain("Server is waking up, please wait...");
  });

  test("no hex colors appear in templates or client scripts", async () => {
    const { readFileSync, readdirSync } = await import("fs");
    const path = await import("path");
    const hex = /#[0-9a-fA-F]{3,8}\b/;

    const viewDir = path.join(__dirname, "..", "views");
    for (const file of readdirSync(viewDir, { recursive: true }) as string[]) {
      if (!file.endsWith(".ejs")) continue;
      const content = readFileSync(path.join(viewDir, file), "utf8");
      expect(`${file}: ${hex.test(content)}`).toBe(`${file}: false`);
    }

    const jsDir = path.join(__dirname, "..", "public", "js");
    for (const file of readdirSync(jsDir)) {
      if (!file.endsWith(".js")) continue;
      const content = readFileSync(path.join(jsDir, file), "utf8");
      expect(`${file}: ${hex.test(content)}`).toBe(`${file}: false`);
    }
  });
});
