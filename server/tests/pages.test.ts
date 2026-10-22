import { createApp } from "../src/app";
import { getPool } from "../src/db/pool";
import { hashPassword } from "../src/lib/password";
import { loginAs, csrfFrom, PASSWORD } from "./helpers";
import request from "supertest";
import { readFileSync } from "fs";
import path from "path";

jest.setTimeout(30000);

const app = createApp();

/** Extract the sidebar link labels from a rendered page. */
function sidebarLabels(html: string): string[] {
  const matches = [...html.matchAll(/class="nav-item-link[^"]*"[^>]*>[\s\S]*?class="nav-label">([^<]+)</g)];
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
      "Duty Management",
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
      // CSDL uses its own dashboard route; other roles use the legacy dashboard.
      const homepage = role === "CSDL" ? "/csdl/dashboard" : "/dashboard";
      const agent = await loginAs(app, accounts[role]);
      const dash = await agent.get(homepage);
      expect(dash.status).toBe(200);

      const labels = sidebarLabels(dash.text);
      // The regex already captures the Logout button in the sidebar footer.
      expect(labels).toEqual(EXPECTED[role]);

      // Top bar: avatar, name and role are laid out horizontally.
      expect(dash.text).toContain("user-avatar");
      expect(dash.text).toContain("user-info");
      expect(dash.text).toContain("user-name");
      expect(dash.text).toContain("user-role");
      expect(dash.text).toContain('action="/logout"');

      // Active item marked.
      expect(dash.text).toContain("aria-current");
    });
  }

  test("STUDENT sidebar never mentions CSDL/TEACHER features", async () => {
    const agent = await loginAs(app, "S-005");
    const dash = await agent.get("/dashboard");
    for (const label of [
      "Monitor Completion",
      "Duty Schedules",
      "Duty Management",
      "Verification",
      "Approvals",
      "Assignments",
    ]) {
      expect(dash.text).not.toContain(`>${label}<`);
    }
  });
});

describe("placeholder pages render per role (6.3-6.5)", () => {
  const pagesByRole: { role: string; account: string; pages: [string, string][] }[] = [
    {
      role: "STUDENT",
      account: "S-001",
      pages: [
        ["/my-duties", "My Duties"],
        ["/upcoming-duties", "Upcoming Duties"],
        ["/settings", "Settings"],
      ],
    },
    {
      role: "TEACHER",
      account: "T-001",
      pages: [
        ["/assignments", "Assignments"],
        ["/verification", "Verification"],
        ["/approvals", "Approvals"],
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

  test("the CSDL pages that replaced the placeholders are real pages", async () => {
    const agent = await loginAs(app, "CSDL-001");
    for (const path of [
      "/todays-assignments",
      "/monitor-completion",
      "/csdl/duty-management",
    ]) {
      const res = await agent.get(path);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("coming soon");
      expect(res.text).toContain('class="sidebar"');
    }
  });

  test("CSDL dashboard shows the CSDL name, role, and permission-driven nav", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const dash = await agent.get("/csdl/dashboard");
    expect(dash.text).toContain("Ana Reyes");
    expect(dash.text).toContain("CSDL Staff");
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
    const res = await agent.get("/monitor-completion");
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

/* ---------------------------------------------------------------------------
   Schedule page
   --------------------------------------------------------------------------- */

interface CalendarDay {
  date: string;
  classes: string;
  dots: string[];
  selected: boolean;
  today: boolean;
  label: string;
  number: string;
}

/** The calendar day cells rendered on the page. */
function calendarDays(html: string): CalendarDay[] {
  const days: CalendarDay[] = [];
  const pattern = /<a class="schedule-day([^"]*)"\s+href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    const classes = match[1];
    const href = match[2].replace(/&amp;/g, "&");
    const attrs = match[3];
    const inner = match[4];

    const dots: string[] = [];
    const dotPattern = /schedule-dot--([a-z]+)/g;
    let dotMatch = dotPattern.exec(inner);
    while (dotMatch !== null) {
      dots.push(dotMatch[1]);
      dotMatch = dotPattern.exec(inner);
    }

    const dateMatch = href.match(/[?&]date=(\d{4}-\d{2}-\d{2})/);
    const numberMatch = inner.match(/schedule-day-number">(\d+)</);
    const labelMatch = attrs.match(/aria-label="([^"]*)"/);

    days.push({
      date: dateMatch ? dateMatch[1] : "",
      classes,
      dots,
      selected: classes.includes("is-selected"),
      today: classes.includes("is-today"),
      label: labelMatch ? labelMatch[1] : "",
      number: numberMatch ? numberMatch[1] : "",
    });
    match = pattern.exec(html);
  }
  return days;
}

/** The duty cards rendered in the selected-day panel. */
function panelDuties(
  html: string,
): { title: string; status: string; time: string; area: string; students: string }[] {
  const cards: { title: string; status: string; time: string; area: string; students: string }[] =
    [];
  const pattern = /<li class="schedule-duty-card schedule-duty-card--([a-z]+)">([\s\S]*?)<\/li>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    const inner = match[2];
    const pick = (selector: string) => {
      const found = inner.match(new RegExp(`${selector}">[\\s\\S]*?<\\/i>\\s*([^<]*)<`));
      return found ? found[1].trim() : "";
    };
    const titleMatch = inner.match(/schedule-duty-title">([^<]*)</);
    const statusMatch = inner.match(/status-badge status-badge--([a-z]+)">([^<]*)</);
    cards.push({
      title: titleMatch ? titleMatch[1] : "",
      status: statusMatch ? statusMatch[1] : match[1],
      time: pick("schedule-duty-time"),
      area: pick("schedule-duty-area"),
      students: pick("schedule-duty-students"),
    });
    match = pattern.exec(html);
  }
  return cards;
}

/** The page stylesheets a rendered page links. */
function pageStylesheets(html: string): string[] {
  const matches = [...html.matchAll(/\/css\/pages\/([a-z-]+)\.css/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/** The block that starts at the first `{` after the given index, to its match. */
function cssBlock(css: string, index: number): string {
  if (index < 0) return "";
  const open = css.indexOf("{", index);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return "";
}

/** The Manila calendar month the tests run in, as YYYY-MM. */
function manilaMonth(): string {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return `${manila.getFullYear()}-${String(manila.getMonth() + 1).padStart(2, "0")}`;
}

/** The Manila calendar day the tests run in, as YYYY-MM-DD. */
function manilaToday(): string {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return `${manila.getFullYear()}-${String(manila.getMonth() + 1).padStart(2, "0")}-${String(
    manila.getDate(),
  ).padStart(2, "0")}`;
}

describe("schedule page renders the calendar and the duty panel (5.2-5.5)", () => {
  test("CSDL, teacher and student routes render the same structure", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const teacher = await loginAs(app, "T-001");
    const student = await loginAs(app, "S-001");

    const pages = await Promise.all([
      csdl.get("/csdl/schedule"),
      teacher.get("/my-schedule"),
      teacher.get("/schedule"),
      student.get("/schedule"),
    ]);

    for (const res of pages) {
      expect(res.status).toBe(200);
      expect(res.text).toContain('class="schedule-calendar"');
      expect(res.text).toContain('class="schedule-panel"');
      expect(res.text).toContain('class="schedule-legend"');
      expect(res.text).toContain('class="schedule-weekdays"');
      expect(res.text).toContain('class="schedule-calendar-nav"');
      expect(res.text).toContain("schedule-day-number");
      expect(pageStylesheets(res.text)).toEqual(["schedule"]);
    }
  });

  test("the calendar covers every day of the month and shows its number", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get(`/csdl/schedule?month=${manilaMonth()}`);
    expect(res.status).toBe(200);

    const days = calendarDays(res.text);
    const [year, month] = manilaMonth().split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    expect(days.length).toBe(daysInMonth);
    for (const day of days) {
      expect(Number(day.number)).toBeGreaterThan(0);
      expect(Number(day.number)).toBe(Number(day.date.slice(8, 10)));
    }
  });

  test("the CSDL calendar lists every duty and the others list only their own", async () => {
    const month = manilaMonth();
    const csdl = await loginAs(app, "CSDL-001");
    const teacher = await loginAs(app, "T-001");
    const student = await loginAs(app, "S-001");

    const [csdlRes, teacherRes, studentRes] = await Promise.all([
      csdl.get(`/csdl/schedule?month=${month}`),
      teacher.get(`/my-schedule?month=${month}`),
      student.get(`/schedule?month=${month}`),
    ]);

    const count = async (sql: string, params: unknown[]): Promise<number> => {
      const { rows } = await getPool().query<{ n: number }>(sql, params);
      return Number(rows[0].n);
    };

    const all = await count(
      `SELECT count(*)::int AS n FROM duties
       WHERE to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = $1`,
      [month],
    );
    const own = await count(
      `SELECT count(*)::int AS n FROM duties d JOIN users u ON u.id = d.assigned_to
       WHERE u.school_id = 'T-001'
         AND to_char(d.start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = $1`,
      [month],
    );
    const assigned = await count(
      `SELECT count(*)::int AS n FROM duties d
       JOIN duty_assignments da ON da.duty_id = d.id
       JOIN users u ON u.id = da.student_id
       WHERE u.school_id = 'S-001'
         AND to_char(d.start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = $1`,
      [month],
    );

    const dots = (html: string) =>
      calendarDays(html).reduce((sum, day) => sum + day.dots.length, 0);

    expect(dots(csdlRes.text)).toBe(all);
    expect(dots(teacherRes.text)).toBe(own);
    expect(dots(studentRes.text)).toBe(assigned);
    expect(own).toBeLessThan(all);
    expect(assigned).toBeLessThan(all);
  });

  test("each day's dots match the duties seeded for that day", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get(`/csdl/schedule?month=${manilaMonth()}`);
    const days = calendarDays(res.text);

    const busy = days.filter((day) => day.dots.length > 0);
    expect(busy.length).toBeGreaterThan(0);

    for (const day of busy) {
      const { rows } = await getPool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM duties
         WHERE to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') = $1`,
        [day.date],
      );
      expect(day.dots.length).toBe(Number(rows[0].n));
    }
  });

  test("the legend names every status with the dot colour the calendar uses", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get("/csdl/schedule");
    for (const status of ["ongoing", "completed", "pending", "missed"]) {
      expect(res.text).toContain(`schedule-dot--${status}`);
    }
    const legend = res.text.match(/<ul class="schedule-legend"[\s\S]*?<\/ul>/);
    expect(legend).not.toBeNull();
    for (const status of ["ongoing", "completed", "pending", "missed"]) {
      expect(legend![0]).toContain(`schedule-dot--${status}`);
    }
    expect(legend![0]).toContain("Ongoing");
    expect(legend![0]).toContain("Completed");
    expect(legend![0]).toContain("Pending");
    expect(legend![0]).toContain("Missed");
  });

  test("today and the selected day are marked, and the selection is programmatic", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get("/csdl/schedule");
    const days = calendarDays(res.text);

    const today = days.find((day) => day.date === manilaToday());
    expect(today).toBeDefined();
    expect(today!.today).toBe(true);
    expect(today!.selected).toBe(true);
    expect(res.text).toContain('aria-current="date"');
    expect(today!.label).toContain("Today");
    expect(today!.label).toContain("Selected");
  });

  test("month navigation moves between months and returns to today", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get("/csdl/schedule");

    const next = res.text.match(/href="([^"]*month=[^"]*)"[^>]*rel="next"/);
    expect(next).not.toBeNull();
    const nextUrl = next![1].replace(/&amp;/g, "&");
    expect(nextUrl).toContain("month=");
    expect(nextUrl).toContain("date=");

    const nextRes = await csdl.get(nextUrl);
    expect(nextRes.status).toBe(200);
    const [year, month] = manilaMonth().split("-").map(Number);
    const following = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    expect(nextRes.text).toContain(
      new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(
        new Date(Date.UTC(year, month, 12, 12)),
      ),
    );
    expect(nextUrl).toContain(following);

    const previous = res.text.match(/href="([^"]*month=[^"]*)"[^>]*rel="prev"/);
    expect(previous).not.toBeNull();
    const previousUrl = previous![1].replace(/&amp;/g, "&");
    const previousRes = await csdl.get(previousUrl);
    expect(previousRes.status).toBe(200);
    const preceding = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
    expect(previousUrl).toContain(preceding);

    const current = res.text.match(/href="([^"]*month=[^"]*)"[^>]*>Today</);
    expect(current).not.toBeNull();
    const currentRes = await csdl.get(current![1].replace(/&amp;/g, "&"));
    expect(currentRes.status).toBe(200);
    const currentDays = calendarDays(currentRes.text);
    const todayCell = currentDays.find((day) => day.date === manilaToday());
    expect(todayCell?.selected).toBe(true);
  });

  test("the day panel lists the duties of the selected day with their details", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const month = manilaMonth();

    const { rows } = await getPool().query<{ day: string }>(
      `SELECT to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day
       FROM duties
       WHERE to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = $1
       GROUP BY 1 ORDER BY 1 LIMIT 1`,
      [month],
    );
    const date = rows[0].day;

    const res = await csdl.get(`/csdl/schedule?month=${month}&date=${date}`);
    expect(res.status).toBe(200);

    const cards = panelDuties(res.text);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.time).toMatch(/\d{1,2}:\d{2}/);
      expect(card.area.length).toBeGreaterThan(0);
      expect(card.students).toMatch(/\d+ students?/);
      expect(["ongoing", "completed", "pending", "missed"]).toContain(card.status);
    }
  });

  test("a day without duties shows an empty state naming that day", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const res = await csdl.get("/csdl/schedule?month=2020-01&date=2020-01-15");
    expect(res.status).toBe(200);
    expect(res.text).toContain("schedule-empty");
    expect(res.text).toContain("No duties on January 15");
    expect(panelDuties(res.text)).toHaveLength(0);
    // The calendar stays usable.
    expect(calendarDays(res.text).length).toBe(31);
  });

  test("a role without the schedule permission is refused", async () => {
    const csdl = await loginAs(app, "CSDL-001");
    const teacher = await loginAs(app, "T-001");

    const denied = await csdl.get("/my-schedule");
    expect(denied.status).toBe(403);
    expect(denied.text).not.toContain("schedule-calendar");

    const deniedSchedule = await csdl.get("/schedule");
    expect(deniedSchedule.status).toBe(403);
    expect(deniedSchedule.text).not.toContain("schedule-calendar");

    const deniedCsdl = await teacher.get("/csdl/schedule");
    expect(deniedCsdl.status).toBe(403);
    expect(deniedCsdl.text).not.toContain("schedule-calendar");
  });

  test("the schedule stylesheet lays the calendar and the panel out in two columns", () => {
    const scheduleCss = readFileSync(
      path.join(__dirname, "..", "public", "css", "pages", "schedule.css"),
      "utf8",
    );
    // Two columns side by side on a wide viewport...
    const wide = cssBlock(scheduleCss, scheduleCss.indexOf(".schedule-layout"));
    expect(wide).toMatch(/grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\)/);
    // ...and one column on a narrow one.
    const media = cssBlock(scheduleCss, scheduleCss.indexOf("@media (max-width: 991.98px)"));
    const narrow = cssBlock(media, media.indexOf(".schedule-layout"));
    expect(narrow).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(narrow).not.toContain("0.85fr");
  });
});

/* ---------------------------------------------------------------------------
   Profile page
   --------------------------------------------------------------------------- */

describe("profile page renders the shared profile (6.1-6.3, 6.6)", () => {
  test("/profile and /csdl/profile render the same page with the user's own id", async () => {
    const student = await loginAs(app, "S-001");
    const csdl = await loginAs(app, "CSDL-001");

    const own = await student.get("/profile");
    expect(own.status).toBe(200);
    expect(own.text).toContain('id="profile-identifier"');
    expect(own.text).toContain('value="S-001"');

    const shared = await csdl.get("/csdl/profile");
    expect(shared.status).toBe(200);
    expect(shared.text).toContain('id="profile-identifier"');
    expect(shared.text).toContain('value="CSDL-001"');

    for (const res of [own, shared]) {
      expect(res.text).toContain('class="profile-tabs"');
      expect(res.text).toContain('role="tablist"');
      expect(res.text).toContain('class="profile-content"');
      expect(res.text).toContain('class="profile-identity"');
      expect(res.text).toContain('id="profile-panel-password"');
      expect(res.text).toContain('id="profile-panel-notifications"');
      expect(res.text).toContain("/css/pages/profile.css");
      expect(pageStylesheets(res.text)).toEqual(["profile"]);
    }
  });

  test("the identifier field is read-only and marked as such", async () => {
    const student = await loginAs(app, "S-001");
    const res = await student.get("/profile");
    const field = res.text.match(/<input[^>]*id="profile-identifier"[^>]*>/);
    expect(field).not.toBeNull();
    expect(field![0]).toContain('readonly');
    expect(field![0]).toContain('aria-readonly="true"');
    expect(field![0]).toContain('class="form-control profile-readonly"');
  });

  test("the tabs mark the active one visually and programmatically", async () => {
    const student = await loginAs(app, "S-001");
    const res = await student.get("/profile");
    const tabs = res.text.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(tabs.length).toBe(3);
    const active = tabs.filter((tab) => tab.includes('aria-selected="true"'));
    expect(active.length).toBe(1);
    expect(active[0]).toContain("is-active");
    expect(active[0]).toContain('aria-controls="profile-panel-details"');
  });

  test("the profile-picture action has an accessible name", async () => {
    const student = await loginAs(app, "S-001");
    const res = await student.get("/profile");
    const action = res.text.match(/<button[^>]*profile-picture-btn[^>]*>([\s\S]*?)<\/button>/);
    expect(action).not.toBeNull();
    expect(action![1]).toContain("Change profile picture");
  });

  test("the notification section is separate and persists nothing", async () => {
    const student = await loginAs(app, "S-001");
    const res = await student.get("/profile");
    expect(res.text).toContain("Notification preferences are shown for review only");
    const switches = res.text.match(/data-notification-id="[^"]+"/g) ?? [];
    expect(switches.length).toBeGreaterThan(0);

    // No preference storage was introduced.
    const { rows } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name ILIKE '%notification%'`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("password change (6.4, 6.6)", () => {
  const NEW_PASSWORD = "HkDuty!Rotated9";

  async function setPassword(schoolId: string, plain: string): Promise<void> {
    const hash = await hashPassword(plain);
    await getPool().query(`UPDATE users SET password_hash = $2 WHERE school_id = $1`, [
      schoolId,
      hash,
    ]);
  }

  afterAll(async () => {
    // Leave the seeded account exactly as the seed created it.
    await setPassword("S-003", PASSWORD);
  });

  beforeEach(async () => {
    // Each test starts from the seeded credential.
    await setPassword("S-003", PASSWORD);
  });

  test("a correct change replaces the credential and keeps the session", async () => {
    const agent = await loginAs(app, "S-003");
    const page = await agent.get("/profile");
    const token = csrfFrom(page.text);

    const res = await agent
      .post("/profile/password")
      .type("form")
      .send({
        _csrf: token,
        current_password: PASSWORD,
        new_password: NEW_PASSWORD,
        confirm_password: NEW_PASSWORD,
      });
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("/profile");

    // The session survives the change.
    const after = await agent.get(res.headers["location"] as string);
    expect(after.status).toBe(200);
    expect(after.text).toContain("Your password has been changed");

    // The new password works and the old one no longer does.
    const fresh = request.agent(app);
    const loginPage = await fresh.get("/login");
    const good = await fresh
      .post("/login")
      .type("form")
      .send({ identifier: "S-003", password: NEW_PASSWORD, _csrf: csrfFrom(loginPage.text) });
    expect(good.status).toBe(302);

    const other = request.agent(app);
    const otherPage = await other.get("/login");
    const bad = await other
      .post("/login")
      .type("form")
      .send({ identifier: "S-003", password: PASSWORD, _csrf: csrfFrom(otherPage.text) });
    expect(bad.status).toBe(401);

    // The change is audited without the secret.
    const { rows } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs
       WHERE action = 'password_changed' AND metadata::text NOT LIKE '%${NEW_PASSWORD}%'`,
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });

  test("a wrong current password is refused and the credential is unchanged", async () => {
    const agent = await loginAs(app, "S-003");
    const page = await agent.get("/profile");
    const res = await agent
      .post("/profile/password")
      .type("form")
      .send({
        _csrf: csrfFrom(page.text),
        current_password: "definitely-not-the-password",
        new_password: NEW_PASSWORD,
        confirm_password: NEW_PASSWORD,
      });
    expect(res.status).toBe(400);
    expect(res.text).toContain("The current password is incorrect.");

    // The old password still works.
    const fresh = request.agent(app);
    const loginPage = await fresh.get("/login");
    const good = await fresh
      .post("/login")
      .type("form")
      .send({ identifier: "S-003", password: PASSWORD, _csrf: csrfFrom(loginPage.text) });
    expect(good.status).toBe(302);
  });

  test("a weak new password is refused with the requirement named", async () => {
    const agent = await loginAs(app, "S-003");
    const page = await agent.get("/profile");
    const res = await agent
      .post("/profile/password")
      .type("form")
      .send({
        _csrf: csrfFrom(page.text),
        current_password: PASSWORD,
        new_password: "short",
        confirm_password: "short",
      });
    expect(res.status).toBe(400);
    expect(res.text).toContain("at least 8 characters");
  });

  test("a request without a valid CSRF token is rejected", async () => {
    const agent = await loginAs(app, "S-003");
    const res = await agent
      .post("/profile/password")
      .type("form")
      .send({
        current_password: PASSWORD,
        new_password: NEW_PASSWORD,
        confirm_password: NEW_PASSWORD,
      });
    expect(res.status).toBe(403);
  });
});
