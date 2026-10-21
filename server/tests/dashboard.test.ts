import { getPool } from "../src/db/pool";
import { createApp } from "../src/app";
import { loginAs } from "./helpers";
import { readFileSync, readdirSync } from "fs";
import path from "path";

jest.setTimeout(30000);

const app = createApp();
const publicDir = path.join(__dirname, "..", "public");
const viewsDir = path.join(__dirname, "..", "views");

/** The four summary cards, in the order they are rendered. */
interface StatCard {
  classes: string;
  label: string;
  number: string;
  caption: string;
}

/** Read the four summary cards out of a rendered dashboard. */
function statCards(html: string): StatCard[] {
  const cards: StatCard[] = [];
  const pattern = /<a class="stat-card ([^"]+)"[\s\S]*?<\/a>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    const inner = match[0];
    const pick = (selector: string) => {
      const found = inner.match(new RegExp(`class="${selector}">([^<]*)<`));
      return found ? found[1].trim() : "";
    };
    cards.push({
      classes: match[1],
      label: pick("stat-label"),
      number: pick("stat-number"),
      caption: pick("stat-caption"),
    });
    match = pattern.exec(html);
  }
  return cards;
}

/** The heading of the assignments section. */
function sectionTitle(html: string): string {
  const match = html.match(/class="section-title[^"]*">([^<]+)</);
  return match ? decodeEntities(match[1].trim()) : "";
}

/** Decode the HTML entities the templates escape. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The status badge classes used in the assignments table. */
function tableBadgeClasses(html: string): string[] {
  const matches = [...html.matchAll(/class="(status-badge status-badge--[a-z]+)"/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/** Every file under a directory, recursively. */
function filesUnder(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

describe("dashboard summary cards (7.6)", () => {
  test("the four cards share one structure", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard");
    expect(res.status).toBe(200);

    const cards = statCards(res.text);
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.classes)).toEqual([
      "stat-blue",
      "stat-green",
      "stat-amber",
      "stat-purple",
    ]);
    for (const card of cards) {
      expect(card.label.length).toBeGreaterThan(0);
      expect(card.number).toMatch(/^\d+$/);
      expect(card.caption.length).toBeGreaterThan(0);
    }
    expect(cards.map((card) => card.label)).toEqual([
      "Total Students",
      "Completed",
      "Ongoing Duties",
      "Assignment",
    ]);
  });

  test("every caption is measured against a real denominator", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard");
    const cards = statCards(res.text);

    // The students caption counts against the student accounts in the school.
    const { rows } = await getPool().query<{ total: number }>(
      `SELECT count(*)::int AS total FROM users WHERE role = 'STUDENT'`,
    );
    const students = cards[0];
    expect(students.caption).toMatch(/^(\d+) of (\d+) students assigned$/);
    expect(Number(students.caption.match(/of (\d+) students/)?.[1])).toBe(rows[0].total);

    // The other captions count against the duties in the period.
    const assignments = Number(cards[3].number);
    for (const card of [cards[1], cards[2]]) {
      expect(card.caption).toMatch(/^(\d+) of (\d+) /);
      expect(Number(card.caption.match(/of (\d+) /)?.[1])).toBe(assignments);
    }
    expect(cards[3].caption).toBe(`${assignments} duties in this period`);
  });

  test("the card numbers agree with the seeded duties", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard?range=month");
    expect(res.status).toBe(200);
    const cards = statCards(res.text);

    const { rows } = await getPool().query<{ assignments: number; completed: number }>(
      `SELECT count(*)::int AS assignments,
              count(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM duties
       WHERE start_time >= date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
         AND start_time < (date_trunc('month', now() AT TIME ZONE 'Asia/Manila') + interval '1 month') AT TIME ZONE 'Asia/Manila'`,
    );

    expect(Number(cards[3].number)).toBe(rows[0].assignments);
    expect(Number(cards[1].number)).toBe(rows[0].completed);
    expect(Number(cards[1].caption.match(/of (\d+) completed/)?.[1])).toBe(rows[0].assignments);
  });

  test("the JSON endpoint returns the same totals and the range key", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/dashboard?range=week");
    const json = await agent.get("/csdl/dashboard.json?range=week");
    expect(json.status).toBe(200);

    const body = json.body as {
      rangeKey: string;
      rangeLabel: string;
      totals: { students: number; studentsTotal: number; assignments: number; completed: number };
    };
    expect(body.rangeKey).toBe("week");
    expect(body.rangeLabel.length).toBeGreaterThan(0);
    expect(body.totals.studentsTotal).toBeGreaterThan(0);
    expect(body.totals.students).toBeLessThanOrEqual(body.totals.studentsTotal);
    expect(body.totals.completed).toBeLessThanOrEqual(body.totals.assignments);

    const cards = statCards(page.text);
    expect(Number(cards[3].number)).toBe(body.totals.assignments);
  });
});

describe("dashboard range filter (7.1, 7.6)", () => {
  test("each range names its own section", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const today = await agent.get("/csdl/dashboard?range=today");
    expect(sectionTitle(today.text)).toBe("Today's Assignment");

    const week = await agent.get("/csdl/dashboard?range=week");
    expect(sectionTitle(week.text)).toBe("This Week's Assignments");

    const month = await agent.get("/csdl/dashboard?range=month");
    expect(sectionTitle(month.text)).toBe("This Month's Assignments");

    const custom = await agent.get("/csdl/dashboard?range=custom&from=2026-01-05&to=2026-01-09");
    expect(sectionTitle(custom.text)).toMatch(/^Assignments: /);
  });

  test("the active range button is marked", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard?range=week");
    const active = res.text.match(/class="range-btn active"[^>]*>\s*([^<]+)</);
    expect(active).not.toBeNull();
    expect(active![1].trim()).toBe("This Week");
  });

  test("the client keys the heading and the empty state off the range key", () => {
    const shellJs = readFileSync(path.join(publicDir, "js", "shell.js"), "utf8");
    // The range label is a human date string, so it cannot be used as a key.
    expect(shellJs).toContain("titles[rangeKey]");
    expect(shellJs).not.toContain("titles[rangeLabel]");
    expect(shellJs).toContain('rangeKey === "today"');
  });
});

describe("dashboard status badges (7.2)", () => {
  test("the table renders the theme's status badge classes", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard?range=month");
    expect(res.status).toBe(200);
    for (const badge of tableBadgeClasses(res.text)) {
      expect(badge).toMatch(/^status-badge status-badge--(ongoing|completed|pending|missed)$/);
    }
  });

  test("no template or client script uses the removed badge-bg classes", () => {
    const files = [
      ...filesUnder(viewsDir, ".ejs"),
      ...filesUnder(path.join(publicDir, "js"), ".js"),
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(`${file}: ${content.includes("badge-bg-")}`).toBe(`${file}: false`);
    }
  });

  test("the rows the client builds carry the same badge classes", () => {
    const shellJs = readFileSync(path.join(publicDir, "js", "shell.js"), "utf8");
    expect(shellJs).toContain("status-badge status-badge--");
    expect(shellJs).not.toContain("badge-bg-");
  });
});

describe("dashboard layout (7.4, 7.5)", () => {
  test("the identity block keeps the avatar, name and role on one row", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard");
    expect(res.status).toBe(200);

    const block = res.text.match(/<a class="nav-link profile-block[^"]*"[\s\S]*?<\/a>/);
    expect(block).not.toBeNull();
    const markup = block![0];
    expect(markup).toContain("user-avatar");
    expect(markup).toContain("user-name");
    expect(markup).toContain("user-role");
    // One flex row, no wrapping, and the name is not hidden on small screens.
    expect(markup).toContain("d-flex");
    expect(markup).toContain("align-items-center");
    expect(markup).toContain("flex-nowrap");
    expect(markup).not.toContain("d-none");
  });

  test("the summary cards share one height, padding and rhythm", () => {
    const dashboardCss = readFileSync(path.join(publicDir, "css", "pages", "dashboard.css"), "utf8");

    // One card rule for all four, so the padding cannot drift apart.
    const cardRule = dashboardCss.match(/\.stat-card \{[^}]*\}/);
    expect(cardRule).not.toBeNull();
    expect(cardRule![0]).toContain("padding: 18px 20px");
    expect(cardRule![0]).toContain("height: 100%");

    // The grid stretches every card to the height of the tallest one.
    expect(dashboardCss).toMatch(/\.stats-grid \{[^}]*align-items: stretch/);

    // The label and the number take a fixed line each, so the numbers of the
    // four cards sit on the same baseline.
    expect(dashboardCss).toMatch(/\.stat-card \.stat-label \{[^}]*min-height: 21px/);
    expect(dashboardCss).toMatch(/\.stat-card \.stat-number \{[^}]*min-height: 31px/);
  });

  test("the assignments table fills the width of its card", () => {
    const dashboardCss = readFileSync(path.join(publicDir, "css", "pages", "dashboard.css"), "utf8");
    expect(dashboardCss).toMatch(/\.table \{[^}]*width: 100%/);
    expect(dashboardCss).toMatch(/\.card-body > \.table-responsive \{[^}]*width: 100%/);
  });
});
