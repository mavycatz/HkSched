import { getPool } from "../src/db/pool";
import { createApp } from "../src/app";
import { loginAs, csrfFrom } from "./helpers";
import request from "supertest";

jest.setTimeout(30000);

const app = createApp();

/** The duty ids rendered as cards, in the order they appear. */
function cardIds(html: string): number[] {
  const ids: number[] = [];
  const pattern = /<article class="dm-card dm-card--[a-z]+" data-duty-id="(\d+)"/g;
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
  const pattern = /<article class="dm-card dm-card--([a-z]+)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    statuses.push(match[1]);
    match = pattern.exec(html);
  }
  return statuses;
}

/** The duty id and title of every card, in the order the cards appear. */
function cardTitles(html: string): { id: number; title: string }[] {
  const found: { id: number; title: string }[] = [];
  const pattern = /data-duty-id="(\d+)"\s+data-duty-title="([^"]*)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    found.push({ id: Number(match[1]), title: match[2] });
    match = pattern.exec(html);
  }
  return found;
}

async function countDuties(): Promise<number> {
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM duties`,
  );
  return rows[0].n;
}

/** The duty ids scheduled on a Manila day. */
async function dutyIdsOn(day: string): Promise<number[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM duties
     WHERE (start_time AT TIME ZONE 'Asia/Manila')::date = $1::date
     ORDER BY id`,
    [day],
  );
  return rows.map((row) => Number(row.id));
}

/** A Manila day that actually holds duties. */
async function aDayWithDuties(): Promise<string> {
  const { rows } = await getPool().query<{ day: string }>(
    `SELECT to_char(start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day
     FROM duties GROUP BY day ORDER BY day LIMIT 1`,
  );
  return rows[0].day;
}

/**
 * Create a duty of the test's own, so a test that writes never touches the
 * seeded duties other tests may rely on. The id comes back with it.
 */
async function createTestDuty(
  agent: ReturnType<typeof request.agent>,
  title: string,
  startTime = "2030-01-05T08:00",
): Promise<number> {
  // A duty left behind by an earlier run would make the count wrong.
  await getPool().query(`DELETE FROM duties WHERE title = $1`, [title]);
  const page = await agent.get("/csdl/duty-management");
  const post = await agent
    .post("/csdl/duty-management/duties")
    .type("form")
    .send({
      _csrf: csrfFrom(page.text),
      title,
      area: "Test Wing",
      description: "Created by the test.",
      start_time: startTime,
      status: "pending",
    });
  expect(post.status).toBe(303);
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT id FROM duties WHERE title = $1`,
    [title],
  );
  expect(rows).toHaveLength(1);
  return rows[0].id;
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

    // The card carries the duty's details: the day, the person, the place,
    // the task, the time and how many students are on it.
    expect(res.text).toContain("dm-card-date");
    expect(res.text).toContain("dm-avatar");
    expect(res.text).toContain("dm-name");
    expect(res.text).toContain("dm-meta-item");
    expect(res.text).toContain("dm-card-actions");
    expect(res.text).toContain("dm-icon-btn");
    expect(res.text).toMatch(/students?<\/span>/);

    // The list says how much of it is on the page.
    expect(res.text).toMatch(/Showing \d+-\d+ of \d+ duties/);
  });

  test("every card carries a status accent and a status badge", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");

    const statuses = cardStatuses(res.text);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(["ongoing", "completed", "pending", "missed"]).toContain(status);
      expect(res.text).toContain(`dm-status dm-status--${status}`);
    }
  });

  test("the page links only its own stylesheet and script", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management");
    expect(res.text).toContain("/css/pages/duty-management.css?v=");
    expect(res.text).toContain("/js/duty-management.js?v=");
    expect(res.text).not.toContain("/css/pages/dashboard.css");
    expect(res.text).not.toContain("/css/pages/profile.css");
    expect(res.text).not.toContain("/css/pages/schedule.css");
  });

  test("a status filter returns only that status and stays in the form", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const res = await agent.get("/csdl/duty-management?status=missed");
    expect(res.status).toBe(200);

    const statuses = cardStatuses(res.text);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status).toBe("missed");

    // The filter form shows the applied status.
    expect(res.text).toContain('<option value="missed" selected>');
  });

  test("the search filter narrows the list and keeps the term", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/duty-management?q=Library");
    expect(res.status).toBe(200);

    const cards = cardTitles(res.text);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.title.toLowerCase()).toContain("library");

    // The search term is kept in the input.
    expect(res.text).toContain('value="Library"');
  });

  test("the date filter narrows the list to that day", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const day = await aDayWithDuties();
    const expected = await dutyIdsOn(day);

    const res = await agent.get(`/csdl/duty-management?date=${day}`);
    expect(res.status).toBe(200);

    const ids = cardIds(res.text);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(expected).toContain(id);
    expect(res.text).toContain(`value="${day}"`);
  });

  test("the list is paginated and the current page is marked", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const first = await agent.get("/csdl/duty-management");
    expect(first.status).toBe(200);
    expect(first.text).toContain("dm-pager");
    expect(first.text).toContain('aria-current="page"');

    const second = await agent.get("/csdl/duty-management?page=2");
    expect(second.status).toBe(200);

    // The second page lists different duties.
    const firstIds = cardIds(first.text);
    const secondIds = cardIds(second.text);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);

    // The control for the current page is marked as current.
    expect(second.text).toMatch(/class="dm-pager-btn is-current"[^>]*aria-current="page"/);
  });

  test("the newest duty comes first, and the oldest when the sort says so", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const { rows } = await getPool().query<{ id: string }>(
      `SELECT id FROM duties ORDER BY start_time DESC, id DESC LIMIT 1`,
    );
    const newest = Number(rows[0].id);
    const oldest = await getPool().query<{ id: string }>(
      `SELECT id FROM duties ORDER BY start_time ASC, id ASC LIMIT 1`,
    );

    const first = await agent.get("/csdl/duty-management");
    expect(cardIds(first.text)[0]).toBe(newest);

    const flipped = await agent.get("/csdl/duty-management?sort=oldest");
    expect(cardIds(flipped.text)[0]).toBe(Number(oldest.rows[0].id));
  });

  test("the empty state explains that nothing matches the filters", async () => {
    const agent = await loginAs(app, "CSDL-001");

    const res = await agent.get("/csdl/duty-management?q=zzzzznomatch");
    expect(res.status).toBe(200);
    expect(res.text).toContain("No duty matches the current filters");
    expect(res.text).toContain('id="dm-clear-filters"');
    expect(cardIds(res.text)).toHaveLength(0);
  });

  test("a new duty is created, stored and listed", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/duty-management");
    const token = csrfFrom(page.text);
    const title = "Test Patrol Route";

    // A duty left behind by an earlier run would make the count wrong.
    await getPool().query(`DELETE FROM duties WHERE title = $1`, [title]);

    const before = await countDuties();
    const post = await agent
      .post("/csdl/duty-management/duties")
      .type("form")
      .send({
        _csrf: token,
        title,
        area: "Test Wing",
        description: "Created by the test.",
        start_time: "2030-01-05T08:00",
        end_time: "2030-01-05T09:30",
        status: "pending",
      });

    // The post redirects back to the list, with the notice that it worked.
    expect(post.status).toBe(303);
    expect(post.headers.location).toContain("/csdl/duty-management");
    expect(post.headers.location).toContain("msg=created");
    expect(await countDuties()).toBe(before + 1);

    const { rows } = await getPool().query<{
      id: number;
      title: string;
      area: string;
      status: string;
      start_time: Date;
    }>(
      `SELECT id, title, area, status, start_time FROM duties WHERE title = $1`,
      [title],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].area).toBe("Test Wing");
    expect(rows[0].status).toBe("pending");

    // The time was stored as the Manila wall clock the form asked for.
    const stored = new Date(rows[0].start_time);
    expect(stored.toISOString()).toBe("2030-01-05T00:00:00.000Z");

    // The new duty is on the list, with the notice that it was created.
    const listed = await agent.get(post.headers.location as string);
    expect(listed.text).toContain(title);
    expect(listed.text).toContain("The schedule was created");

    await getPool().query(`DELETE FROM duties WHERE id = $1`, [rows[0].id]);
  });

  test("a duty can be edited and the change is stored", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/duty-management");
    const token = csrfFrom(page.text);

    const id = await createTestDuty(agent, "Duty To Edit");

    const post = await agent
      .post(`/csdl/duty-management/duties/${id}`)
      .type("form")
      .send({
        _csrf: token,
        id: String(id),
        title: "Edited Duty",
        area: "Edited Area",
        start_time: "2030-02-02T10:00",
        status: "ongoing",
      });

    expect(post.status).toBe(303);
    expect(post.headers.location).toContain("msg=updated");

    const { rows: updated } = await getPool().query<{
      title: string;
      area: string;
      status: string;
    }>(`SELECT title, area, status FROM duties WHERE id = $1`, [id]);
    expect(updated[0].title).toBe("Edited Duty");
    expect(updated[0].area).toBe("Edited Area");
    expect(updated[0].status).toBe("ongoing");

    // The edited duty is listed with its new title.
    const listed = await agent.get("/csdl/duty-management?q=Edited%20Duty");
    expect(listed.text).toContain("Edited Duty");

    await getPool().query(`DELETE FROM duties WHERE id = $1`, [id]);
  });

  test("a duty can be deleted", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/duty-management");
    const token = csrfFrom(page.text);

    const id = await createTestDuty(agent, "Duty To Delete");

    const post = await agent
      .post(`/csdl/duty-management/duties/${id}/delete`)
      .type("form")
      .send({ _csrf: token, id: String(id) });

    expect(post.status).toBe(303);
    expect(post.headers.location).toContain("msg=deleted");

    const { rows: after } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duties WHERE id = $1`,
      [id],
    );
    expect(after[0].n).toBe(0);
  });

  test("students can be assigned to a duty and the list shows the count", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/duty-management");
    const token = csrfFrom(page.text);

    const { rows: students } = await getPool().query<{ id: number }>(
      `SELECT id FROM users WHERE role = 'STUDENT' ORDER BY id LIMIT 2`,
    );
    const dutyId = await createTestDuty(agent, "Duty To Assign");

    const post = await agent
      .post(`/csdl/duty-management/duties/${dutyId}/assign`)
      .type("form")
      .send({
        _csrf: token,
        id: String(dutyId),
        student_ids: students.map((student) => String(student.id)),
      });

    expect(post.status).toBe(303);
    expect(post.headers.location).toContain("msg=assigned");

    const { rows: assigned } = await getPool().query<{ student_id: number }>(
      `SELECT student_id FROM duty_assignments WHERE duty_id = $1 ORDER BY student_id`,
      [dutyId],
    );
    expect(assigned.map((row) => row.student_id)).toEqual(
      students.map((student) => student.id),
    );

    // The list shows how many students are on the duty.
    const listed = await agent.get("/csdl/duty-management?q=Duty%20To%20Assign");
    expect(listed.text).toContain("2 students");

    await getPool().query(`DELETE FROM duties WHERE id = $1`, [dutyId]);
  });

  test("the filters survive a write, so the list comes back the same", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const page = await agent.get("/csdl/duty-management?status=pending");
    const token = csrfFrom(page.text);

    const post = await agent
      .post("/csdl/duty-management/duties")
      .type("form")
      .send({
        _csrf: token,
        title: "Filter Keeping Duty",
        area: "Somewhere",
        start_time: "2030-03-03T07:00",
        status: "pending",
        f_status: "pending",
        f_q: "library",
        f_sort: "oldest",
      });

    expect(post.status).toBe(303);
    expect(post.headers.location).toContain("status=pending");
    expect(post.headers.location).toContain("q=library");
    expect(post.headers.location).toContain("sort=oldest");

    const { rows } = await getPool().query<{ id: number }>(
      `SELECT id FROM duties WHERE title = $1`,
      ["Filter Keeping Duty"],
    );
    await getPool().query(`DELETE FROM duties WHERE id = $1`, [rows[0].id]);
  });

  test("a post without a valid token is refused and writes nothing", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const before = await countDuties();

    const post = await agent.post("/csdl/duty-management/duties").type("form").send({
      title: "Should not exist",
      area: "Nowhere",
      start_time: "2030-04-04T08:00",
    });

    expect(post.status).toBe(403);
    expect(await countDuties()).toBe(before);
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
    expect(res.text).not.toContain("dm-card");
  });
});
