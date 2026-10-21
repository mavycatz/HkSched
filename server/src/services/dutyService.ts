/**
 * Duty data service — role-scoped reads over `duties` and `duty_assignments`.
 *
 * Scoping rules:
 *   CSDL    — every duty
 *   TEACHER — duties where `assigned_to` is the viewer
 *   STUDENT — duties the viewer is assigned to (EXISTS over duty_assignments)
 */
import { getPool } from "../db/pool";

export type DutyStatus = "ongoing" | "completed" | "pending" | "missed";

export const DUTY_STATUSES: DutyStatus[] = ["ongoing", "completed", "pending", "missed"];

export interface DutyViewer {
  id: number;
  role: "STUDENT" | "TEACHER" | "CSDL";
}

export interface DutyListItem {
  id: number;
  title: string;
  description: string | null;
  area: string;
  status: DutyStatus;
  start_time: Date;
  end_time: Date | null;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_school_id: string | null;
  student_count: number;
}

export interface DutyStatusCounts {
  all: number;
  ongoing: number;
  completed: number;
  pending: number;
  missed: number;
}

export interface DutyFilters {
  /** Restrict to a single status. */
  status?: DutyStatus | null;
  /** Case-insensitive match against the duty title or area. */
  search?: string | null;
  /** Inclusive lower bound on the duty date (YYYY-MM-DD). */
  from?: string | null;
  /** Inclusive upper bound on the duty date (YYYY-MM-DD). */
  to?: string | null;
}

export interface DutyListOptions extends DutyFilters {
  page?: number;
  pageSize?: number;
}

export interface DutyListResult {
  duties: DutyListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: DutyStatusCounts;
}

export interface DutyDayCell {
  /** YYYY-MM-DD in the Manila calendar. */
  date: string;
  count: number;
  /** One entry per duty on that day, in start-time order, so a calendar cell
   *  can show a dot for every duty it holds. */
  statuses: DutyStatus[];
}

export interface DutyMonthGrid {
  /** YYYY-MM in the Manila calendar. */
  month: string;
  days: DutyDayCell[];
}

/** The SQL fragment that restricts a duty query to what the viewer may see. */
function scopeClause(viewer: DutyViewer, params: unknown[]): string {
  if (viewer.role === "CSDL") return "TRUE";
  if (viewer.role === "TEACHER") {
    params.push(viewer.id);
    return `d.assigned_to = $${params.length}`;
  }
  params.push(viewer.id);
  return `EXISTS (
    SELECT 1 FROM duty_assignments da
    WHERE da.duty_id = d.id AND da.student_id = $${params.length}
  )`;
}

/** The SQL fragment that restricts a duty query to one status. */
function statusClause(status: DutyStatus | null | undefined, params: unknown[]): string {
  if (!status || !DUTY_STATUSES.includes(status)) return "TRUE";
  params.push(status);
  return `d.status = $${params.length}`;
}

/** The SQL fragment that restricts a duty query to a date window (Manila days). */
function dateClause(from: string | null | undefined, to: string | null | undefined, params: unknown[]): string {
  if (!from && !to) return "TRUE";
  const parts: string[] = [];
  if (from) {
    params.push(`${from}T00:00:00+08:00`);
    parts.push(`d.start_time >= $${params.length}`);
  }
  if (to) {
    params.push(`${to}T23:59:59.999+08:00`);
    parts.push(`d.start_time <= $${params.length}`);
  }
  return `(${parts.join(" AND ")})`;
}

/** The SQL fragment that restricts a duty query to a free-text search. */
function searchClause(search: string | null | undefined, params: unknown[]): string {
  if (!search || !search.trim()) return "TRUE";
  params.push(`%${search.trim()}%`);
  const index = params.length;
  return `(d.title ILIKE $${index} OR d.area ILIKE $${index} OR u.name ILIKE $${index})`;
}

const SELECT_DUTY = `
  SELECT d.id, d.title, d.description, d.area, d.status, d.start_time, d.end_time,
         d.assigned_to AS assignee_id,
         u.name AS assignee_name, u.school_id AS assignee_school_id,
         (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) AS student_count
  FROM duties d
  LEFT JOIN users u ON u.id = d.assigned_to`;

/**
 * The status counts for everything the viewer may see.
 *
 * The status filter is deliberately NOT applied: the filter pills show how
 * many duties each status holds for the current search and date filters, so
 * a visitor can always see what switching to another status would give.
 */
export async function getDutyStatusCounts(
  viewer: DutyViewer,
  filters: DutyFilters = {},
): Promise<DutyStatusCounts> {
  const params: unknown[] = [];
  const where = [
    scopeClause(viewer, params),
    dateClause(filters.from, filters.to, params),
    searchClause(filters.search, params),
  ].join(" AND ");

  const { rows } = await getPool().query<Record<string, number>>(
    `SELECT
       count(*)::int AS all,
       count(*) FILTER (WHERE d.status = 'ongoing')::int AS ongoing,
       count(*) FILTER (WHERE d.status = 'completed')::int AS completed,
       count(*) FILTER (WHERE d.status = 'pending')::int AS pending,
       count(*) FILTER (WHERE d.status = 'missed')::int AS missed
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     WHERE ${where}`,
    params,
  );

  const row = rows[0] ?? { all: 0, ongoing: 0, completed: 0, pending: 0, missed: 0 };
  return {
    all: Number(row.all),
    ongoing: Number(row.ongoing),
    completed: Number(row.completed),
    pending: Number(row.pending),
    missed: Number(row.missed),
  };
}

/** A filtered, paginated list of the duties the viewer may see. */
export async function listDuties(
  viewer: DutyViewer,
  options: DutyListOptions = {},
): Promise<DutyListResult> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 9, 1), 50);
  const requestedPage = Math.max(options.page ?? 1, 1);

  const countParams: unknown[] = [];
  const where = [
    scopeClause(viewer, countParams),
    statusClause(options.status, countParams),
    dateClause(options.from, options.to, countParams),
    searchClause(options.search, countParams),
  ].join(" AND ");

  const { rows: countRows } = await getPool().query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     WHERE ${where}`,
    countParams,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);

  const params: unknown[] = [];
  const listWhere = [
    scopeClause(viewer, params),
    statusClause(options.status, params),
    dateClause(options.from, options.to, params),
    searchClause(options.search, params),
  ].join(" AND ");
  params.push(pageSize);
  const limitIndex = params.length;
  params.push((page - 1) * pageSize);
  const offsetIndex = params.length;

  const { rows } = await getPool().query<DutyListItem>(
    `${SELECT_DUTY}
     WHERE ${listWhere}
     ORDER BY d.start_time ASC, d.id ASC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params,
  );

  return {
    duties: rows,
    total,
    page,
    pageSize,
    pageCount,
    counts: await getDutyStatusCounts(viewer, options),
  };
}

/** The duties for one calendar day, in the viewer's scope. */
export async function getDutiesForDay(
  viewer: DutyViewer,
  date: string,
): Promise<DutyListItem[]> {
  const params: unknown[] = [];
  const where = [scopeClause(viewer, params), dateClause(date, date, params)].join(" AND ");
  const { rows } = await getPool().query<DutyListItem>(
    `${SELECT_DUTY}
     WHERE ${where}
     ORDER BY d.start_time ASC, d.id ASC`,
    params,
  );
  return rows;
}

/** A per-day summary of the duties in one month, for the calendar grid. */
export async function getMonthGrid(
  viewer: DutyViewer,
  year: number,
  month: number,
): Promise<DutyMonthGrid> {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const params: unknown[] = [];
  const where = [scopeClause(viewer, params), dateClause(first, last, params)].join(" AND ");
  const { rows } = await getPool().query<{ day: string; status: DutyStatus }>(
    `SELECT to_char(d.start_time AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day,
            d.status
     FROM duties d
     WHERE ${where}
     ORDER BY d.start_time ASC`,
    params,
  );

  const byDay = new Map<string, { count: number; statuses: DutyStatus[] }>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { count: 0, statuses: [] };
    entry.count += 1;
    // One status per duty, not one per distinct status: the calendar draws a
    // dot for every duty.
    entry.statuses.push(row.status);
    byDay.set(row.day, entry);
  }

  const days: DutyDayCell[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = byDay.get(date);
    days.push({ date, count: entry?.count ?? 0, statuses: entry?.statuses ?? [] });
  }

  return { month: `${year}-${String(month).padStart(2, "0")}`, days };
}
