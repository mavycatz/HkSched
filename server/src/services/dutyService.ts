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

/** The order the duty list is sorted in. */
export type DutySortOrder = "newest" | "oldest";

/**
 * How a duty status is presented. One status value drives the card accent,
 * the date tint and the badge, so they can never disagree.
 */
export interface DutyStatusView {
  /** The status as stored in the database. */
  status: DutyStatus;
  /** The word shown on the badge. */
  label: string;
  /** The strong colour used for the card's leading edge. */
  accent: string;
  /** The soft colour used for the date block. */
  tint: string;
  /** The badge text colour. */
  foreground: string;
}

const STATUS_VIEWS: Record<DutyStatus, DutyStatusView> = {
  ongoing: {
    status: "ongoing",
    label: "Ongoing",
    accent: "var(--status-ongoing-solid)",
    tint: "var(--status-ongoing-bg)",
    foreground: "var(--status-ongoing-fg)",
  },
  completed: {
    status: "completed",
    label: "Completed",
    accent: "var(--status-completed-solid)",
    tint: "var(--status-completed-bg)",
    foreground: "var(--status-completed-fg)",
  },
  pending: {
    status: "pending",
    label: "Pending",
    accent: "var(--status-pending-solid)",
    tint: "var(--status-pending-bg)",
    foreground: "var(--status-pending-fg)",
  },
  missed: {
    status: "missed",
    label: "Cancelled",
    accent: "var(--status-missed-solid)",
    tint: "var(--status-missed-bg)",
    foreground: "var(--status-missed-fg)",
  },
};

/** The presentation of a duty status; unknown values fall back to "pending". */
export function dutyStatusView(status: string | null | undefined): DutyStatusView {
  if (status && status in STATUS_VIEWS) return STATUS_VIEWS[status as DutyStatus];
  return STATUS_VIEWS.pending;
}

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
  class_group: string | null;
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
  /** A single Manila day (YYYY-MM-DD); narrows the list to that day. */
  date?: string | null;
}

export interface DutyListOptions extends DutyFilters {
  page?: number;
  pageSize?: number;
  /** "newest" (default) lists the most recent duty first. */
  sort?: DutySortOrder;
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
function dateClause(
  from: string | null | undefined,
  to: string | null | undefined,
  params: unknown[],
  date?: string | null,
): string {
  const lower = date || from;
  const upper = date || to;
  if (!lower && !upper) return "TRUE";
  const parts: string[] = [];
  if (lower) {
    params.push(`${lower}T00:00:00+08:00`);
    parts.push(`d.start_time >= $${params.length}`);
  }
  if (upper) {
    params.push(`${upper}T23:59:59.999+08:00`);
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
         d.assigned_to AS assignee_id, d.class_group,
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
    dateClause(filters.from, filters.to, params, filters.date),
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
  const orderBy =
    options.sort === "oldest" ? "d.start_time ASC, d.id ASC" : "d.start_time DESC, d.id DESC";

  const countParams: unknown[] = [];
  const where = [
    scopeClause(viewer, countParams),
    statusClause(options.status, countParams),
    dateClause(options.from, options.to, countParams, options.date),
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
    dateClause(options.from, options.to, params, options.date),
    searchClause(options.search, params),
  ].join(" AND ");
  params.push(pageSize);
  const limitIndex = params.length;
  params.push((page - 1) * pageSize);
  const offsetIndex = params.length;

  const { rows } = await getPool().query<DutyListItem>(
    `${SELECT_DUTY}
     WHERE ${listWhere}
     ORDER BY ${orderBy}
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

/* ---------------------------------------------------------------------------
   Writing duties
   --------------------------------------------------------------------------- */

/** A duty as it is stored, including the fields the list view does not show. */
export interface DutyRecord extends DutyListItem {
  assigned_by: number | null;
  required_headcount: number | null;
  class_group: string | null;
  created_at: Date;
  updated_at: Date;
}

/** The fields a duty can be created or updated with. */
export interface DutyWrite {
  title: string;
  area: string;
  description?: string | null;
  status?: DutyStatus;
  /** An ISO timestamp; the controller sends Manila local time with an offset. */
  startTime: string;
  endTime?: string | null;
  /** The teacher responsible for the duty. */
  assignedTo?: number | null;
  classGroup?: string | null;
  requiredHeadcount?: number | null;
  /** The students assigned to the duty. */
  studentIds?: number[];
}

/** One assignment row, with the student's name. */
export interface DutyAssignment {
  id: number;
  duty_id: number;
  student_id: number;
  student_name: string | null;
  student_school_id: string | null;
  status: string | null;
}

/** A user who can be assigned to a duty. */
export interface AssignableUser {
  id: number;
  name: string;
  school_id: string;
  role: "STUDENT" | "TEACHER";
}

const SELECT_DUTY_RECORD = `
  SELECT d.id, d.title, d.description, d.area, d.status, d.start_time, d.end_time,
         d.assigned_to AS assignee_id, d.assigned_by, d.required_headcount, d.class_group,
         d.created_at, d.updated_at,
         u.name AS assignee_name, u.school_id AS assignee_school_id,
         (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) AS student_count
  FROM duties d
  LEFT JOIN users u ON u.id = d.assigned_to`;

/** One duty, with every field, or null when it does not exist. */
export async function getDuty(id: number): Promise<DutyRecord | null> {
  const { rows } = await getPool().query<DutyRecord>(
    `${SELECT_DUTY_RECORD} WHERE d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Create a duty and, when given, its student assignments. */
export async function createDuty(input: DutyWrite, actorId: number): Promise<DutyRecord> {
  const status = input.status && DUTY_STATUSES.includes(input.status) ? input.status : "pending";
  const { rows } = await getPool().query<DutyRecord>(
    `INSERT INTO duties (title, description, area, status, start_time, end_time,
                         assigned_to, assigned_by, required_headcount, class_group)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,1),$10)
     RETURNING id`,
    [
      input.title,
      input.description ?? null,
      input.area,
      status,
      input.startTime,
      input.endTime ?? null,
      input.assignedTo ?? null,
      actorId,
      input.requiredHeadcount ?? null,
      input.classGroup ?? null,
    ],
  );
  const created = rows[0];
  if (input.studentIds && input.studentIds.length > 0) {
    await setDutyStudents(created.id, input.studentIds);
  }
  const duty = await getDuty(created.id);
  return duty ?? ({ ...created, title: input.title, area: input.area } as DutyRecord);
}

/** Update a duty and, when given, replace its student assignments. */
export async function updateDuty(
  id: number,
  input: Partial<DutyWrite>,
): Promise<DutyRecord | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  const push = (column: string, value: unknown): void => {
    fields.push(`${column} = $${index++}`);
    params.push(value);
  };

  if (input.title !== undefined) push("title", input.title);
  if (input.area !== undefined) push("area", input.area);
  if (input.description !== undefined) push("description", input.description || null);
  if (input.status !== undefined && DUTY_STATUSES.includes(input.status)) push("status", input.status);
  if (input.startTime !== undefined) push("start_time", input.startTime);
  if (input.endTime !== undefined) push("end_time", input.endTime || null);
  if (input.assignedTo !== undefined) push("assigned_to", input.assignedTo || null);
  if (input.classGroup !== undefined) push("class_group", input.classGroup || null);
  if (input.requiredHeadcount !== undefined) {
    push("required_headcount", input.requiredHeadcount || 1);
  }

  if (fields.length > 0) {
    fields.push("updated_at = now()");
    params.push(id);
    await getPool().query(`UPDATE duties SET ${fields.join(", ")} WHERE id = $${index}`, params);
  }
  if (input.studentIds) {
    await setDutyStudents(id, input.studentIds);
  }
  return getDuty(id);
}

/** Delete a duty; its assignments go with it. */
export async function deleteDuty(id: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM duties WHERE id = $1", [id]);
  return (rowCount || 0) > 0;
}

/** The students assigned to a duty. */
export async function listDutyAssignments(dutyId: number): Promise<DutyAssignment[]> {
  const { rows } = await getPool().query<DutyAssignment>(
    `SELECT da.id, da.duty_id, da.student_id, da.status,
            u.name AS student_name, u.school_id AS student_school_id
     FROM duty_assignments da
     JOIN users u ON u.id = da.student_id
     WHERE da.duty_id = $1
     ORDER BY u.name ASC`,
    [dutyId],
  );
  return rows;
}

/** The student ids assigned to each of the given duties, keyed by duty id. */
export async function listStudentIdsForDuties(
  dutyIds: number[],
): Promise<Record<number, number[]>> {
  const grouped: Record<number, number[]> = {};
  if (dutyIds.length === 0) return grouped;
  const { rows } = await getPool().query<{ duty_id: number; student_id: number }>(
    `SELECT duty_id, student_id FROM duty_assignments
     WHERE duty_id = ANY($1::bigint[])
     ORDER BY student_id ASC`,
    [dutyIds],
  );
  for (const row of rows) {
    const bucket = grouped[row.duty_id] ?? (grouped[row.duty_id] = []);
    bucket.push(row.student_id);
  }
  return grouped;
}

/** Replace the students assigned to a duty with exactly the given ids. */
export async function setDutyStudents(dutyId: number, studentIds: number[]): Promise<void> {
  const unique = [...new Set(studentIds.filter((id) => Number.isInteger(id) && id > 0))];
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM duty_assignments WHERE duty_id = $1", [dutyId]);
    for (const studentId of unique) {
      await client.query(
        `INSERT INTO duty_assignments (duty_id, student_id, status)
         SELECT $1, u.id, 'assigned' FROM users u
         WHERE u.id = $2 AND u.role = 'STUDENT'
         ON CONFLICT DO NOTHING`,
        [dutyId, studentId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** The students or teachers who can be assigned to a duty. */
export async function listAssignableUsers(
  role: "STUDENT" | "TEACHER",
  search?: string | null,
): Promise<AssignableUser[]> {
  const params: unknown[] = [role];
  let where = `is_active = TRUE AND role = $1`;
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    where += ` AND (name ILIKE $${params.length} OR school_id ILIKE $${params.length})`;
  }
  const { rows } = await getPool().query<AssignableUser>(
    `SELECT id, name, school_id, role FROM users WHERE ${where} ORDER BY name ASC`,
    params,
  );
  return rows;
}
