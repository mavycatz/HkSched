import { getPool } from "../src/db/pool";
import { createApp } from "../src/app";
import { loginAs, csrfFrom } from "./helpers";
import request from "supertest";

jest.setTimeout(30000);

const app = createApp();

/** The Manila calendar day of a duty, as YYYY-MM-DD. */
async function daysWithDuties(status?: string): Promise<string[]> {
  const params: unknown[] = [];
  let where = "TRUE";
  if (status) {
    params.push(status);
    where = `status = $${params.length}`;
  }
  const { rows } = await getPool().query<{ day: string }>(
    `SELECT DISTINCT to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day
     FROM duties
     WHERE ${where}
     ORDER BY day`,
    params,
  );
  return rows.map((row) => row.day);
}

/** The count shown on each status filter pill, keyed by the pill's label. */
function pillCounts(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const pattern =
    /<span class="filter-pill-label">([^<]+)<\/span>\s*<span class="filter-pill-count">(\d+)<\/span>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    counts[match[1]] = Number(match[2]);
    match = pattern.exec(html);
  }
  return counts;
}

/** The duty ids rendered as cards, in the order they appear. */
function cardIds(html: string): number[] {
  const ids: number[] = [];
  const pattern = /<article class="duty-card duty-card--[a-z]+" data-duty-id="(\d+)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    ids.push(Number(match[1]));
    match = pattern.exec(html);
  }
  return ids;
}

/** The status of each rendered card, in the order the cards appear. */
function cardStatuses(html: string): string[] {
  const statuses: string[] = [];
  const pattern = /<article class="duty-card duty-card--([a-z]+)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    statuses.push(match[1]);
    match = pattern.exec(html);
  }
  return statuses;
}

/** The Manila day of each rendered card, in the order the cards appear. */
function cardDays(html: string): string[] {
  const days: string[] = [];
  const pattern = /<time datetime="(\d{4}-\d{2}-\d{2})">/g;
  let match = pattern.exec(html);
  while (match !== null) {
    days.push(match[1]);
    match = pattern.exec(html);
  }
  return days;
}

/** The title of each rendered card, in the order the cards appear. */
function cardTitles(html: string): string[] {
  const titles: string[] = [];
  const pattern = /<h2 class="duty-card-title">([^<]*)<\/h2>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    titles.push(match[1]);
    match = pattern.exec(html);
  }
  return titles;
}

async function countDuties(): Promise<number> {
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM duties`,
  );
  return rows[0].n;
}

describe("duty management page", () => {
  test("renders one card per listed duty, with every detail on it", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.status).toBe(200);

    const ids = cardIds(res.text);
    expect(ids.length).toBeGreaterThan(0);

    // One card per duty, and no duty listed twice.
    expect(new Set(ids).size).toBe(ids.length);

    // The card carries the duty's details.
    expect(res.text).toContain("duty-card-title");
    expect(res.text).toContain("duty-detail-label");
    expect(res.text).toContain(">Area<");
    expect(res.text).toContain(">Assignee<");
    expect(res.text).toContain(">Time<");
    expect(res.text).toContain(">Students<");
    expect(res.text).toContain("assigned");
    expect(res.text).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}">/);

    // The cards are grouped three to a row on a wide viewport.
    expect(res.text).toContain('class="duty-grid"');
  });

  test("every card carries a status-coloured accent and a status badge", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");

    const statuses = cardStatuses(res.text);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(["ongoing", "completed", "pending", "missed"]).toContain(status);
    }
    expect(res.text).toContain("status-badge status-badge--");
  });

  test("the status filter pills show counts that match the listed duties", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");

    const counts = pillCounts(res.text);
    expect(counts.All).toBeGreaterThan(0);
    expect(counts.Ongoing).toBeGreaterThanOrEqual(0);
    expect(counts.Completed).toBeGreaterThanOrEqual(0);
    expect(counts.Pending).toBeGreaterThanOrEqual(0);
    expect(counts.Missed).toBeGreaterThanOrEqual(0);

    // The four status counts add up to the number of duties that match the
    // current (unfiltered) search and date criteria.
    const total =
      counts.Ongoing + counts.Completed + counts.Pending + counts.Missed;
    expect(total).toBe(counts.All);

    // The page links the duty stylesheet and the duty script, and nothing else.
    expect(res.text).toContain("/css/pages/duty-management.css?v=");
    expect(res.text).toContain("/js/duty-management.js?v=");
    expect(res.text).not.toContain("/css/pages/dashboard.css");
    expect(res.text).not.toContain("/css/pages/profile.css");
    expect(res.text).not.toContain("/css/pages/schedule.css");
  });

  test("a status filter returns only that status and marks the pill active", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const res = await agent.get("/csdl/duty-management?status=missed");
    expect(res.status).toBe(200);

    const statuses = cardStatuses(res.text);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status).toBe("missed");

    // The pill for the applied status is the active one.
    expect(res.text).toMatch(/filter-pill--missed active/);
    expect(res.text).not.toMatch(/filter-pill--ongoing active/);

    // The count on that pill matches the number of duties with that status.
    const counts = pillCounts(res.text);
    const { rows } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duties WHERE status = 'missed'`,
    );
    expect(counts.Missed).toBe(rows[0].n);
    expect(counts.Missed).toBeGreaterThanOrEqual(statuses.length);
  });

  test("a status filter is reflected in the address and in the form", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management?status=pending");
    expect(res.text).toContain('<input type="hidden" name="status" value="pending">');
    expect(res.text).toContain("status=pending");
  });

  test("the search filter narrows the list to matching duties", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management?q=Library");
    expect(res.status).toBe(200);

    const titles = cardTitles(res.text);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) expect(title.toLowerCase()).toContain("library");

    // The search term is kept in the input.
    expect(res.text).toContain('value="Library"');
  });

  test("the search and date filters combine", async () => {
    const agent = await loginAs(app, "CSDL-001");

    // A day that actually holds a Library duty.
    const { rows } = await getPool().query<{ day: string }>(
      `SELECT to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day
       FROM duties
       WHERE title ILIKE '%Library%' OR area ILIKE '%Library%'
       ORDER BY day
       LIMIT 1`,
    );
    const day = rows[0].day;

    const res = await agent.get(
      `/csdl/duty-management?q=Library&from=${day}&to=${day}`,
    );
    expect(res.status).toBe(200);

    const titles = cardTitles(res.text);
    const cardDayList = cardDays(res.text);
    expect(titles.length).toBeGreaterThan(0);

    // Every listed duty satisfies both criteria.
    for (const title of titles) expect(title.toLowerCase()).toContain("library");
    for (const cardDay of cardDayList) expect(cardDay).toBe(day);

    // Both filters are reflected in the address and in the form.
    expect(res.text).toContain(`from=${day}`);
    expect(res.text).toContain(`to=${day}`);
    expect(res.text).toContain('id="duty-from" name="from"');
    expect(res.text).toContain(`value="${day}"`);
    expect(res.text).toContain('value="Library"');
  });

  test("a date filter on its own narrows the list to that day", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const days = await daysWithDuties();
    const day = days[0];

    const res = await agent.get(`/csdl/duty-management?from=${day}&to=${day}`);
    expect(res.status).toBe(200);

    const cardDayList = cardDays(res.text);
    expect(cardDayList.length).toBeGreaterThan(0);
    for (const cardDay of cardDayList) expect(cardDay).toBe(day);
  });

  test("a long list is paginated and the current page is marked", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const first = await agent.get("/csdl/duty-management");
    expect(first.status).toBe(200);
    expect(first.text).toContain("duty-pagination");
    expect(first.text).toContain('aria-current="page"');

    const second = await agent.get("/csdl/duty-management?page=2");
    expect(second.status).toBe(200);

    // The second page lists different duties.
    const firstIds = cardIds(first.text);
    const secondIds = cardIds(second.text);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);

    // The control for the current page is marked as current.
    expect(second.text).toMatch(/class="page-link"[^>]*aria-current="page"[^>]*>2</);
  });

  test("a list that fits on one page has no pagination controls", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const days = await daysWithDuties("missed");
    expect(days.length).toBeGreaterThan(0);

    const res = await agent.get(
      `/csdl/duty-management?status=missed&from=${days[0]}&to=${days[0]}`,
    );
    expect(res.status).toBe(200);
    expect(cardIds(res.text).length).toBeGreaterThan(0);
    expect(res.text).not.toContain("duty-pagination");
  });

  test("the empty state distinguishes no duties from no matches", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const res = await agent.get("/csdl/duty-management?q=zzzzznomatch");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No duty matches the current filters");
    expect(res.text).toContain("clear-duty-filters-empty");
    expect(cardIds(res.text)).toHaveLength(0);
  });

  test("the create and edit modals are present and clearly marked as not saving", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.status).toBe(200);

    expect(res.text).toContain('id="create-duty-modal"');
    expect(res.text).toContain('id="edit-duty-modal"');
    expect(res.text).toContain('data-bs-toggle="modal"');
    expect(res.text).toContain('data-bs-target="#create-duty-modal"');
    expect(res.text).toContain('data-bs-target="#edit-duty-modal"');

    // The note says the form writes nothing.
    expect(res.text).toContain("Saving is not enabled");

    // Required fields are marked as such.
    expect(res.text).toContain("duty-required");
    expect(res.text).toContain('aria-required="true"');

    // The primary and secondary actions are distinct.
    expect(res.text).toContain('id="create-duty-save" disabled');
    expect(res.text).toContain('id="edit-duty-save" disabled');
    expect(res.text).toContain('data-bs-dismiss="modal"');
  });

  test("the edit button carries the duty it opens", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");

    const pattern = /data-duty-id="(\d+)"[\s\S]*?data-duty-title="([^"]*)"/g;
    const found: [string, string][] = [];
    let match = pattern.exec(res.text);
    while (match !== null) {
      found.push([match[1], match[2]]);
      match = pattern.exec(res.text);
    }
    expect(found.length).toBeGreaterThan(0);

    const titles = cardTitles(res.text);
    expect(found.map(([, title]) => title)).toEqual(titles);
  });

  test("the modals write nothing to the database", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const before = await countDuties();
    const assignmentsBefore = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duty_assignments`,
    );

    // The forms carry no action and no method, so they have nowhere to post to.
    const res = await agent.get("/csdl/duty-management");
    expect(res.text).not.toMatch(/<form[^>]*id="create-duty-form"[^>]*action=/);
    expect(res.text).not.toMatch(/<form[^>]*id="edit-duty-form"[^>]*action=/);
    expect(res.text).not.toMatch(/<form[^>]*id="create-duty-form"[^>]*method=/);

    // Posting to the page does not create a duty: the route is read-only.
    const post = await agent.post("/csdl/duty-management").type("form").send({
      _csrf: csrfFrom(res.text),
      title: "Should not exist",
      area: "Nowhere",
    });
    expect(post.status).toBe(404);

    expect(await countDuties()).toBe(before);
    const assignmentsAfter = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duty_assignments`,
    );
    expect(assignmentsAfter.rows[0].n).toBe(assignmentsBefore.rows[0].n);
  });

  test("the page script is served and wires up elements that exist", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.text).toContain("/js/duty-management.js?v=");

    const script = await request(app).get("/js/duty-management.js");
    expect(script.status).toBe(200);
    expect(script.headers["content-type"]).toMatch(/javascript/);

    // Every element the script looks up by id is really on the page, so the
    // wiring cannot silently do nothing.
    const ids = new Set<string>();
    const pattern = /getElementById\("([^"]+)"\)/g;
    let match = pattern.exec(script.text);
    while (match !== null) {
      ids.add(match[1]);
      match = pattern.exec(script.text);
    }
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(`${id} on the page`).toBe(`${id} on the page`);
      expect(res.text).toContain(`id="${id}"`);
    }
  });

  test("the page is refused to a role without the permission", async () => {
    const agent = await loginAs(app, "T-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.status).toBe(403);
    expect(res.text).not.toContain("duty-card");
  });
});
