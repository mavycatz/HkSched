import { getPool } from "../src/db/pool";
import {
  getDutiesForDay,
  getDutyStatusCounts,
  getMonthGrid,
  listDuties,
  type DutyViewer,
} from "../src/services/dutyService";

jest.setTimeout(30000);

async function viewerFor(schoolId: string): Promise<DutyViewer> {
  const { rows } = await getPool().query<{ id: number; role: DutyViewer["role"] }>(
    `SELECT id, role FROM users WHERE school_id = $1`,
    [schoolId],
  );
  if (!rows[0]) throw new Error(`no seeded user ${schoolId}`);
  return { id: rows[0].id, role: rows[0].role };
}

describe("duty service", () => {
  let csdl: DutyViewer;
  let teacher: DutyViewer;
  let otherTeacher: DutyViewer;
  let student: DutyViewer;

  beforeAll(async () => {
    csdl = await viewerFor("CSDL-001");
    teacher = await viewerFor("T-001");
    otherTeacher = await viewerFor("T-002");
    student = await viewerFor("S-001");
  });

  test("the seed created duties and assignments", async () => {
    const { rows: duties } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duties`,
    );
    const { rows: assignments } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duty_assignments`,
    );
    expect(duties[0].n).toBeGreaterThan(0);
    expect(assignments[0].n).toBeGreaterThan(0);
  });

  test("CSDL sees every duty", async () => {
    const { rows } = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM duties`);
    const result = await listDuties(csdl, { pageSize: 50 });
    expect(result.total).toBe(rows[0].n);
  });

  test("a teacher sees only the duties assigned to them", async () => {
    const result = await listDuties(teacher, { pageSize: 50 });
    expect(result.total).toBeGreaterThan(0);
    for (const duty of result.duties) {
      expect(duty.assignee_id).toBe(teacher.id);
    }

    const { rows } = await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM duties WHERE assigned_to = $1`,
      [teacher.id],
    );
    expect(result.total).toBe(rows[0].n);
  });

  test("two teachers see different duty sets", async () => {
    const mine = await listDuties(teacher, { pageSize: 50 });
    const theirs = await listDuties(otherTeacher, { pageSize: 50 });
    const mineIds = mine.duties.map((d) => d.id);
    const theirIds = theirs.duties.map((d) => d.id);
    expect(mineIds.some((id) => theirIds.includes(id))).toBe(false);
  });

  test("a student sees only the duties they are assigned to", async () => {
    const result = await listDuties(student, { pageSize: 50 });
    expect(result.total).toBeGreaterThan(0);

    const { rows: expected } = await getPool().query<{ n: number }>(
      `SELECT count(DISTINCT d.id)::int AS n
       FROM duties d
       JOIN duty_assignments da ON da.duty_id = d.id
       WHERE da.student_id = $1`,
      [student.id],
    );
    expect(result.total).toBe(expected[0].n);

    for (const duty of result.duties) {
      const { rows } = await getPool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM duty_assignments WHERE duty_id = $1 AND student_id = $2`,
        [duty.id, student.id],
      );
      expect(rows[0].n).toBe(1);
    }
  });

  test("the status counts match the duties that are listed", async () => {
    const result = await listDuties(csdl, { pageSize: 50 });
    const counts = await getDutyStatusCounts(csdl);
    expect(counts.all).toBe(result.total);
    expect(counts.ongoing + counts.completed + counts.pending + counts.missed).toBe(counts.all);
  });

  test("a status filter returns only that status", async () => {
    const result = await listDuties(csdl, { status: "missed", pageSize: 50 });
    expect(result.total).toBeGreaterThan(0);
    for (const duty of result.duties) {
      expect(duty.status).toBe("missed");
    }
    expect(result.counts.missed).toBe(result.total);
  });

  test("a search filter matches the title or the area", async () => {
    const result = await listDuties(csdl, { search: "library", pageSize: 50 });
    expect(result.total).toBeGreaterThan(0);
    for (const duty of result.duties) {
      const haystack = `${duty.title} ${duty.area}`.toLowerCase();
      expect(haystack).toContain("library");
    }
  });

  test("pagination splits the duties into pages without losing any", async () => {
    const all = await listDuties(csdl, { pageSize: 50 });
    const first = await listDuties(csdl, { pageSize: 9, page: 1 });
    expect(first.duties.length).toBe(9);
    expect(first.pageCount).toBe(Math.ceil(all.total / 9));

    const seen = new Set<number>();
    for (let page = 1; page <= first.pageCount; page += 1) {
      const result = await listDuties(csdl, { pageSize: 9, page });
      for (const duty of result.duties) seen.add(duty.id);
    }
    expect(seen.size).toBe(all.total);
  });

  test("a page beyond the last one clamps to the last page", async () => {
    const result = await listDuties(csdl, { pageSize: 9, page: 999 });
    expect(result.page).toBe(result.pageCount);
  });

  test("each listed duty reports its student count", async () => {
    const result = await listDuties(csdl, { pageSize: 10 });
    for (const duty of result.duties) {
      expect(duty.student_count).toBeGreaterThan(0);
    }
  });

  test("the month grid covers every day of the month with its duty dots", async () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const grid = await getMonthGrid(csdl, manila.getFullYear(), manila.getMonth() + 1);
    const daysInMonth = new Date(Date.UTC(manila.getFullYear(), manila.getMonth() + 1, 0)).getUTCDate();
    expect(grid.days.length).toBe(daysInMonth);
    expect(grid.days[0].date.endsWith("-01")).toBe(true);

    const total = grid.days.reduce((sum, day) => sum + day.count, 0);
    expect(total).toBeGreaterThan(0);

    for (const day of grid.days) {
      for (const status of day.statuses) {
        expect(["ongoing", "completed", "pending", "missed"]).toContain(status);
      }
    }
  });

  test("the duties for a day match the grid's count for that day", async () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const grid = await getMonthGrid(csdl, manila.getFullYear(), manila.getMonth() + 1);
    const busy = grid.days.find((day) => day.count > 0);
    expect(busy).toBeDefined();

    const duties = await getDutiesForDay(csdl, busy!.date);
    expect(duties.length).toBe(busy!.count);
  });

  test("a student only sees their own duties for a day", async () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const grid = await getMonthGrid(student, manila.getFullYear(), manila.getMonth() + 1);
    const busy = grid.days.find((day) => day.count > 0);
    expect(busy).toBeDefined();

    const duties = await getDutiesForDay(student, busy!.date);
    for (const duty of duties) {
      const { rows } = await getPool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM duty_assignments WHERE duty_id = $1 AND student_id = $2`,
        [duty.id, student.id],
      );
      expect(rows[0].n).toBe(1);
    }
  });
});
