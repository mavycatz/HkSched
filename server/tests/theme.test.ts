import { readFileSync, readdirSync } from "fs";
import path from "path";
import request from "supertest";
import { createApp } from "../src/app";
import { loginAs } from "./helpers";

jest.setTimeout(30000);

const app = createApp();
const publicDir = path.join(__dirname, "..", "public");
const themeCss = readFileSync(path.join(publicDir, "css", "theme.css"), "utf8");

/** Read a custom property's value out of the theme's :root block. */
function cssVar(name: string): string {
  const match = themeCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`custom property --${name} is not defined in theme.css`);
  return match[1].trim();
}

/** Relative luminance of a hex colour, per WCAG 2.1. */
function luminance(hex: string): number {
  const value = hex.trim().replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const channel = (raw: string): number => {
    const c = parseInt(raw, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(full.slice(0, 2)) +
    0.7152 * channel(full.slice(2, 4)) +
    0.0722 * channel(full.slice(4, 6))
  );
}

/** WCAG contrast ratio between two hex colours. */
function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

describe("design tokens", () => {
  test("theme.css defines the status, surface, shape and focus tokens", () => {
    const colourTokens = [
      "status-ongoing-bg",
      "status-ongoing-fg",
      "status-completed-bg",
      "status-completed-fg",
      "status-pending-bg",
      "status-pending-fg",
      "status-missed-bg",
      "status-missed-fg",
      "input-fill",
      "surface",
    ];
    const valueTokens = ["surface-shadow", "panel-radius", "focus-ring"];
    for (const name of colourTokens) {
      expect(cssVar(name)).toMatch(/^#[0-9a-f]{3,8}$/);
    }
    for (const name of valueTokens) {
      expect(cssVar(name).length).toBeGreaterThan(0);
    }
  });

  test("no page stylesheet hardcodes a colour", () => {
    const pagesDir = path.join(publicDir, "css", "pages");
    const files = readdirSync(pagesDir).filter((f) => f.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgb = /\brgba?\(|\bhsla?\(/;
    for (const file of files) {
      const content = readFileSync(path.join(pagesDir, file), "utf8");
      expect(`${file} hex: ${hex.test(content)}`).toBe(`${file} hex: false`);
      expect(`${file} rgb: ${rgb.test(content)}`).toBe(`${file} rgb: false`);
    }
  });
});

describe("duty status badges", () => {
  const statuses = ["ongoing", "completed", "pending", "missed"] as const;

  test("the base class and one modifier per status are defined", () => {
    expect(themeCss).toContain(".status-badge {");
    for (const status of statuses) {
      expect(themeCss).toContain(`.status-badge--${status} {`);
    }
  });

  test("each status has its own colour, distinct from the other three", () => {
    const backgrounds = statuses.map((s) => cssVar(`status-${s}-bg`));
    const foregrounds = statuses.map((s) => cssVar(`status-${s}-fg`));
    expect(new Set(backgrounds).size).toBe(statuses.length);
    expect(new Set(foregrounds).size).toBe(statuses.length);
  });

  test("each status label meets a 4.5:1 contrast ratio against its own background", () => {
    for (const status of statuses) {
      const ratio = contrastRatio(cssVar(`status-${status}-fg`), cssVar(`status-${status}-bg`));
      expect(`${status} ${ratio.toFixed(2)}`).toBe(`${status} ${ratio.toFixed(2)}`);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("page stylesheet plumbing", () => {
  test("a page with pageStyles links exactly that stylesheet, after the theme", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard");
    expect(res.status).toBe(200);
    expect(res.text).toContain("/css/pages/dashboard.css?v=");
    expect(res.text).not.toContain("/css/pages/duty-management.css");
    expect(res.text).not.toContain("/css/pages/profile.css");

    const themeAt = res.text.indexOf("/css/theme.css");
    const pageAt = res.text.indexOf("/css/pages/dashboard.css");
    expect(themeAt).toBeGreaterThan(-1);
    expect(pageAt).toBeGreaterThan(themeAt);
  });

  test("a page without pageStyles links no page stylesheet", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/applications");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("/css/pages/");
  });

  test("the duty management page links only its own page stylesheet", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.status).toBe(200);
    expect(res.text).toContain("/css/pages/duty-management.css?v=");
    expect(res.text).not.toContain("/css/pages/dashboard.css");
    expect(res.text).not.toContain("/css/pages/profile.css");
    expect(res.text).not.toContain("/css/pages/schedule.css");
  });

  test("the page stylesheet is served", async () => {
    const res = await request(app).get("/css/pages/dashboard.css");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/css/);
  });

  test("the schedule page links only its own page stylesheet", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/schedule");
    expect(res.status).toBe(200);
    expect(res.text).toContain("/css/pages/schedule.css?v=");
    expect(res.text).not.toContain("/css/pages/dashboard.css");
    expect(res.text).not.toContain("/css/pages/duty-management.css");
    expect(res.text).not.toContain("/css/pages/profile.css");
  });

  test("the calendar and the day panel share the app's surface treatment", () => {
    const scheduleCss = readFileSync(path.join(publicDir, "css", "pages", "schedule.css"), "utf8");
    for (const token of ["var(--surface)", "var(--surface-shadow)", "var(--panel-radius)"]) {
      expect(scheduleCss).toContain(token);
    }
  });
});

describe("page structure", () => {
  const pages: [string, string][] = [
    ["/dashboard", "S-001"],
    ["/csdl/dashboard", "CSDL-001"],
    ["/csdl/duty-management", "CSDL-001"],
    ["/my-schedule", "T-001"],
    ["/profile", "S-001"],
  ];

  for (const [page, account] of pages) {
    test(`${page} renders exactly one main element`, async () => {
      const agent = await loginAs(app, account);
      const res = await agent.get(page);
      expect(res.status).toBe(200);
      const mains = res.text.match(/<main\b/g) ?? [];
      expect(mains.length).toBe(1);
    });
  }

  test("the status page renders exactly one main element", async () => {
    const res = await request(app).get("/no-such-page");
    expect(res.status).toBe(404);
    const mains = res.text.match(/<main\b/g) ?? [];
    expect(mains.length).toBe(1);
  });
});

describe("dashboard rules live in the page stylesheet", () => {
  const movedSelectors = [
    ".greeting-row",
    ".dashboard-greeting",
    ".stats-grid",
    ".stat-card",
    ".stat-icon-tile",
    ".range-segment",
    ".range-btn",
    ".skeleton-row",
    ".skeleton-table",
    ".card.border-0.shadow-sm",
  ];

  test("theme.css no longer defines the dashboard-only selectors", () => {
    for (const selector of movedSelectors) {
      expect(themeCss).not.toContain(`${selector} {`);
    }
  });

  test("the dashboard page stylesheet defines them instead", () => {
    const dashboardCss = readFileSync(path.join(publicDir, "css", "pages", "dashboard.css"), "utf8");
    for (const selector of movedSelectors) {
      expect(dashboardCss).toContain(`${selector} {`);
    }
  });
});
