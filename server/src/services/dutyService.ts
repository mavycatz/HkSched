/**
 * Duty data service — role-scoped reads over `duties` and `duty_assignments`.
 *
 * Scoping rules:
 *   CSDL    — every duty
 *   TEACHER — duties where `assigned_to` is the viewer
 *   STUDENT — duties the viewer is assigned to (EXISTS over duty_assignments)
 *
 * A duty's status is never asserted: it is derived in SQL by `dutyStatusSql`
 * from the duty's own times and from the completion recorded on its
 * assignment rows. The stored column only ever records an explicit
 * cancellation.
 */
import { getPool } from "../db/pool";

export type DutyStatus = "pending" | "ongoing" | "completed" | "cancelled";

export const DUTY_STATUSES: DutyStatus[] = ["pending", "ongoing", "completed", "cancelled"];

/** The kind of place a duty is held at. */
export type DutyLocationKind = "classroom" | "office" | "laboratory" | "facility" | "area";

export const DUTY_LOCATION_KINDS: DutyLocationKind[] = [
  "classroom",
  "office",
  "laboratory",
  "facility",
  "area",
];

/**
 * The derived status of a duty, as SQL.
 *
 * This is the only copy of the expression: the status filter, the status
 * counts, the rows, the calendar and the dashboard all read it, so they can
 * never disagree.
 *
 *   cancelled  — the cancellation was recorded on the duty
 *   completed  — it has students and every one of them is recorded complete
 *   pending    — it has not started yet
 *   ongoing    — everything else, including a duty whose window has passed
 */
export const dutyStatusSql = `CASE
  WHEN d.status = 'cancelled' THEN 'cancelled'
  WHEN EXISTS (SELECT 1 FROM duty_assignments a WHERE a.duty_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM duty_assignments a
                   WHERE a.duty_id = d.id AND COALESCE(a.status, 'assigned') <> 'completed')
    THEN 'completed'
  WHEN now() < d.start_time THEN 'pending'
  ELSE 'ongoing'
END`;

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
  cancelled: {
    status: "cancelled",
    label: "Cancelled",
    accent: "var(--status-cancelled-solid)",
    tint: "var(--status-cancelled-bg)",
    foreground: "var(--status-cancelled-fg)",
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
  completed_count: number;
  class_group: string | null;
  location_id: number | null;
  location_name: string | null;
  location_kind: DutyLocationKind | null;
  requires_exclusive_location: boolean;
}

export interface DutyStatusCounts {
  all: number;
  ongoing: number;
  completed: number;
  pending: number;
  cancelled: number;
}

export interface DutyFilters {
  /** Restrict to a single status. */
  status?: DutyStatus | null;
  /** Case-insensitive match against the duty title, location or student name. */
  search?: string | null;
  /** Inclusive lower bound on the duty date (YYYY-MM-DD). */
  from?: string | null;
  /** Inclusive upper bound on the duty date (YYYY-MM-DD). */
  to?: string | null;
  /** A single Manila day (YYYY-MM-DD); narrows the list to that day. */
  date?: string | null;
  /** Only the duties held at this location. */
  locationId?: number | null;
  /** Only the duties this teacher supervises. */
  teacherId?: number | null;
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

/* ---------------------------------------------------------------------------
   Errors
   --------------------------------------------------------------------------- */

/** A write that clashes with a duty that already exists. */
export class ConflictError extends Error {
  readonly conflicts: DutyConflict[];

  constructor(conflicts: DutyConflict[]) {
    super("The schedule clashes with an existing duty.");
    this.name = "ConflictError";
    this.conflicts = conflicts;
  }
}

/** A write that was refused because a field was wrong. */
export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] || "The details given are not valid.");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** A write that was refused because the actor may not make it. */
export class ForbiddenError extends Error {
  constructor(message = "You are not allowed to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** A location that already exists in the catalogue. */
export class DuplicateLocationError extends Error {
  readonly location: DutyLocation;

  constructor(location: DutyLocation) {
    super(`The location "${location.name}" is already in the catalogue.`);
    this.name = "DuplicateLocationError";
    this.location = location;
  }
}

/* ---------------------------------------------------------------------------
   Locations
   --------------------------------------------------------------------------- */

export interface DutyLocation {
  id: number;
  name: string;
  kind: DutyLocationKind;
  building: string | null;
  is_active: boolean;
  created_at: Date;
}

/** The catalogue, newest last. Only the active ones are offered. */
export async function listDutyLocations(
  options: { activeOnly?: boolean; search?: string | null } = {},
): Promise<DutyLocation[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (options.activeOnly) clauses.push("is_active = TRUE");
  if (options.search && options.search.trim()) {
    params.push(`%${options.search.trim()}%`);
    clauses.push(`(name ILIKE $${params.length} OR kind ILIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await getPool().query<DutyLocation>(
    `SELECT id, name, kind, building, is_active, created_at FROM duty_locations ${where} ORDER BY name ASC`,
    params,
  );
  return rows;
}

/** One location, whether it is active or not. */
export async function getDutyLocation(id: number): Promise<DutyLocation | null> {
  const { rows } = await getPool().query<DutyLocation>(
    `SELECT id, name, kind, building, is_active, created_at FROM duty_locations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Add a location to the catalogue. A name that is already there is refused
 * and the location that holds it is reported back.
 */
export async function createDutyLocation(input: {
  name: string;
  kind: DutyLocationKind;
  building?: string | null;
}): Promise<DutyLocation> {
  const name = input.name.trim();
  const kind = input.kind;
  if (!name) {
    throw new ValidationError({ name: "A location needs a name." });
  }
  if (!DUTY_LOCATION_KINDS.includes(kind)) {
    throw new ValidationError({ kind: "Choose one of the listed kinds." });
  }
  const existing = await getPool().query<DutyLocation>(
    `SELECT id, name, kind, building, is_active, created_at FROM duty_locations WHERE lower(name) = lower($1)`,
    [name],
  );
  if (existing.rows[0]) {
    throw new DuplicateLocationError(existing.rows[0]);
  }
  const { rows } = await getPool().query<DutyLocation>(
    `INSERT INTO duty_locations (name, kind, building)
     VALUES ($1, $2, $3)
     RETURNING id, name, kind, building, is_active, created_at`,
    [name, kind, input.building?.trim() || null],
  );
  return rows[0];
}

/**
 * Take a location out of circulation. It stays readable and the duties that
 * already point at it still show it, but it is no longer offered.
 */
export async function deactivateDutyLocation(id: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    "UPDATE duty_locations SET is_active = FALSE WHERE id = $1",
    [id],
  );
  return (rowCount || 0) > 0;
}

/* ---------------------------------------------------------------------------
   Students and teachers
   --------------------------------------------------------------------------- */

/** A student, as the search offers them. */
export interface StudentMatch {
  id: number;
  name: string;
  /** The Student ID the staff member knows them by. */
  student_id: string;
}

/**
 * Find students by their Student ID. Only student accounts are ever offered:
 * no teacher and no CSDL account comes back from this search.
 */
export async function searchStudents(query: string, limit = 10): Promise<StudentMatch[]> {
  const text = (query || "").trim();
  if (!text) return [];
  const { rows } = await getPool().query<StudentMatch>(
    `SELECT id, name, school_id AS student_id
     FROM users
     WHERE role = 'STUDENT' AND is_active = TRUE AND school_id ILIKE $1
     ORDER BY school_id ASC
     LIMIT $2`,
    [`${text}%`, Math.min(Math.max(limit, 1), 25)],
  );
  return rows;
}

/** A user who can be assigned to a duty. */
export interface AssignableUser {
  id: number;
  name: string;
  school_id: string;
  role: "STUDENT" | "TEACHER";
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

/* ---------------------------------------------------------------------------
   Reading duties
   --------------------------------------------------------------------------- */

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
  return `(${dutyStatusSql}) = $${params.length}`;
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

/** The SQL fragment that restricts a duty query to one location. */
function locationClause(
  locationId: number | null | undefined,
  params: unknown[],
): string {
  if (!locationId || !Number.isInteger(locationId) || locationId <= 0) return "TRUE";
  params.push(locationId);
  return `d.location_id = $${params.length}`;
}

/** The SQL fragment that restricts a duty query to one supervising teacher. */
function teacherClause(teacherId: number | null | undefined, params: unknown[]): string {
  if (!teacherId || !Number.isInteger(teacherId) || teacherId <= 0) return "TRUE";
  params.push(teacherId);
  return `d.assigned_to = $${params.length}`;
}

/** The SQL fragment that restricts a duty query to a free-text search. */
function searchClause(search: string | null | undefined, params: unknown[]): string {
  if (!search || !search.trim()) return "TRUE";
  params.push(`%${search.trim()}%`);
  const index = params.length;
  return `(d.title ILIKE $${index}
       OR d.area ILIKE $${index}
       OR l.name ILIKE $${index}
       OR u.name ILIKE $${index}
       OR EXISTS (SELECT 1 FROM duty_assignments da
                    JOIN users su ON su.id = da.student_id
                   WHERE da.duty_id = d.id
                     AND (su.name ILIKE $${index} OR su.school_id ILIKE $${index})))`;
}

const SELECT_DUTY = `
  SELECT d.id, d.title, d.description, d.area, (${dutyStatusSql}) AS status,
         d.start_time, d.end_time,
         d.assigned_to AS assignee_id, d.class_group,
         d.location_id, d.requires_exclusive_location,
         u.name AS assignee_name, u.school_id AS assignee_school_id,
         l.name AS location_name, l.kind AS location_kind,
         (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) AS student_count,
         (SELECT count(*)::int FROM duty_assignments da
           WHERE da.duty_id = d.id AND COALESCE(da.status, 'assigned') = 'completed') AS completed_count
  FROM duties d
  LEFT JOIN users u ON u.id = d.assigned_to
  LEFT JOIN duty_locations l ON l.id = d.location_id`;

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
    locationClause(filters.locationId, params),
    teacherClause(filters.teacherId, params),
    searchClause(filters.search, params),
  ].join(" AND ");

  const { rows } = await getPool().query<Record<string, number>>(
    `SELECT
       count(*)::int AS all,
       count(*) FILTER (WHERE (${dutyStatusSql}) = 'ongoing')::int AS ongoing,
       count(*) FILTER (WHERE (${dutyStatusSql}) = 'completed')::int AS completed,
       count(*) FILTER (WHERE (${dutyStatusSql}) = 'pending')::int AS pending,
       count(*) FILTER (WHERE (${dutyStatusSql}) = 'cancelled')::int AS cancelled
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     LEFT JOIN duty_locations l ON l.id = d.location_id
     WHERE ${where}`,
    params,
  );

  const row = rows[0] ?? { all: 0, ongoing: 0, completed: 0, pending: 0, cancelled: 0 };
  return {
    all: Number(row.all),
    ongoing: Number(row.ongoing),
    completed: Number(row.completed),
    pending: Number(row.pending),
    cancelled: Number(row.cancelled),
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
    locationClause(options.locationId, countParams),
    teacherClause(options.teacherId, countParams),
    searchClause(options.search, countParams),
  ].join(" AND ");

  const { rows: countRows } = await getPool().query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     LEFT JOIN duty_locations l ON l.id = d.location_id
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
    locationClause(options.locationId, params),
    teacherClause(options.teacherId, params),
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
            (${dutyStatusSql}) AS status
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
  created_at: Date;
  updated_at: Date;
}

/** The fields a duty can be created or updated with. */
export interface DutyWrite {
  title: string;
  /** The catalogue location the duty is held at. */
  locationId: number;
  description?: string | null;
  status?: DutyStatus;
  /** An ISO timestamp; the controller sends Manila local time with an offset. */
  startTime: string;
  endTime?: string | null;
  /** The teacher responsible for the duty. */
  assignedTo?: number | null;
  classGroup?: string | null;
  requiredHeadcount?: number | null;
  /** True when the location cannot be held by two duties at the same time. */
  requiresExclusiveLocation?: boolean;
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
  completed_at: Date | null;
  completed_by: number | null;
}

const SELECT_DUTY_RECORD = `
  SELECT d.id, d.title, d.description, d.area, (${dutyStatusSql}) AS status,
         d.start_time, d.end_time,
         d.assigned_to AS assignee_id, d.assigned_by, d.required_headcount, d.class_group,
         d.created_at, d.updated_at,
         d.location_id, d.requires_exclusive_location,
         u.name AS assignee_name, u.school_id AS assignee_school_id,
         l.name AS location_name, l.kind AS location_kind,
         (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) AS student_count,
         (SELECT count(*)::int FROM duty_assignments da
           WHERE da.duty_id = d.id AND COALESCE(da.status, 'assigned') = 'completed') AS completed_count
  FROM duties d
  LEFT JOIN users u ON u.id = d.assigned_to
  LEFT JOIN duty_locations l ON l.id = d.location_id`;

/** One duty, with every field, or null when it does not exist. */
export async function getDuty(id: number): Promise<DutyRecord | null> {
  const { rows } = await getPool().query<DutyRecord>(
    `${SELECT_DUTY_RECORD} WHERE d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/* ---------------------------------------------------------------------------
   Conflicts
   --------------------------------------------------------------------------- */

/** One clash: a person or a place that is already booked. */
export interface DutyConflict {
  kind: "student" | "teacher" | "location";
  /** The name of the student, the teacher or the location. */
  name: string;
  /** The Student ID of the student, when there is one. */
  detail?: string | null;
  /** The duty that clashes. */
  dutyId: number;
  dutyTitle: string;
  startTime: Date;
  endTime: Date | null;
}

/**
 * How a clash is read to the person who would cause it: who is already
 * booked, for which duty.
 */
export function describeConflict(conflict: DutyConflict): string {
  const who =
    conflict.kind === "student"
      ? `${conflict.name}${conflict.detail ? ` (${conflict.detail})` : ""}`
      : conflict.kind === "teacher"
        ? `the teacher ${conflict.name}`
        : `the location ${conflict.name}`;
  return `${who} is already booked for "${conflict.dutyTitle}".`;
}

/** What is being checked for clashes. */
export interface ConflictCheck {
  /** The duty being written; it never clashes with itself. */
  dutyId?: number | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  locationId?: number | null;
  requiresExclusiveLocation?: boolean;
  studentIds?: number[];
  teacherId?: number | null;
}

interface OverlappingDuty {
  id: number;
  title: string;
  start_time: Date;
  end_time: Date | null;
  assigned_to: number | null;
  teacher_name: string | null;
  location_id: number | null;
  location_name: string | null;
  requires_exclusive_location: boolean;
}

/** A duty with no end time is compared as if it ran for four hours. */
const LEGACY_DUTY_LENGTH = "4 hours";

/**
 * The clashes a proposed schedule would create.
 *
 * The overlap predicate is `a.start < b.end AND b.start < a.end`, with a
 * missing end time read as four hours after the start. Three rules are
 * applied to the duties that overlap: a student may not be in two places at
 * once, a teacher may not supervise two duties at once, and a location that
 * needs exclusive use may not be booked twice.
 */
export async function detectConflicts(check: ConflictCheck): Promise<DutyConflict[]> {
  const conflicts: DutyConflict[] = [];

  const start = new Date(check.startTime);
  if (Number.isNaN(start.getTime())) return conflicts;
  const end = check.endTime ? new Date(check.endTime) : new Date(start.getTime() + 4 * 60 * 60 * 1000);
  if (Number.isNaN(end.getTime())) return conflicts;

  const { rows: overlapping } = await getPool().query<OverlappingDuty>(
    `SELECT d.id, d.title, d.start_time, d.end_time, d.assigned_to,
            d.location_id, d.requires_exclusive_location,
            u.name AS teacher_name, l.name AS location_name
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     LEFT JOIN duty_locations l ON l.id = d.location_id
     WHERE ($1::bigint IS NULL OR d.id <> $1::bigint)
       AND d.start_time < $3::timestamptz
       AND $2::timestamptz < COALESCE(d.end_time, d.start_time + interval '${LEGACY_DUTY_LENGTH}')
     ORDER BY d.start_time ASC`,
    [check.dutyId ?? null, start.toISOString(), end.toISOString()],
  );

  if (overlapping.length === 0) return conflicts;

  const overlapIds = overlapping.map((row) => row.id);

  // The students of the proposed duty and of the duties that overlap.
  const studentIds = [...new Set(check.studentIds ?? [])];
  if (studentIds.length > 0) {
    const { rows } = await getPool().query<{
      duty_id: number;
      student_id: number;
      student_name: string;
      student_school_id: string;
    }>(
      `SELECT da.duty_id, da.student_id, u.name AS student_name, u.school_id AS student_school_id
       FROM duty_assignments da
       JOIN users u ON u.id = da.student_id
       WHERE da.duty_id = ANY($1::bigint[])
         AND da.student_id = ANY($2::bigint[])
       ORDER BY u.name ASC`,
      [overlapIds, studentIds],
    );
    for (const row of rows) {
      const clash = overlapping.find((duty) => duty.id === row.duty_id);
      conflicts.push({
        kind: "student",
        name: row.student_name,
        detail: row.student_school_id,
        dutyId: row.duty_id,
        dutyTitle: clash?.title ?? "",
        startTime: clash?.start_time ?? start,
        endTime: clash?.end_time ?? null,
      });
    }
  }

  // The teacher of the proposed duty.
  if (check.teacherId) {
    for (const clash of overlapping) {
      if (clash.assigned_to !== check.teacherId) continue;
      conflicts.push({
        kind: "teacher",
        name: clash.teacher_name ?? "",
        dutyId: clash.id,
        dutyTitle: clash.title,
        startTime: clash.start_time,
        endTime: clash.end_time,
      });
    }
  }

  // The location of the proposed duty.
  if (check.locationId) {
    for (const clash of overlapping) {
      if (clash.location_id !== check.locationId) continue;
      if (!check.requiresExclusiveLocation && !clash.requires_exclusive_location) continue;
      conflicts.push({
        kind: "location",
        name: clash.location_name ?? "",
        dutyId: clash.id,
        dutyTitle: clash.title,
        startTime: clash.start_time,
        endTime: clash.end_time,
      });
    }
  }

  return conflicts;
}

/* ---------------------------------------------------------------------------
   The authoring writes
   --------------------------------------------------------------------------- */

function parseTime(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The checks every duty write makes before it touches the database. */
async function validateDutyWrite(
  input: Partial<DutyWrite> & { title?: string; locationId?: number; startTime?: string; endTime?: string | null },
): Promise<{ fieldErrors: Record<string, string>; location: DutyLocation | null; start: Date | null; end: Date | null }> {
  const fieldErrors: Record<string, string> = {};

  const title = input.title?.trim();
  if (title !== undefined && !title) {
    fieldErrors.title = "A schedule needs a title.";
  }

  let location: DutyLocation | null = null;
  if (input.locationId !== undefined) {
    if (!input.locationId || !Number.isInteger(input.locationId)) {
      fieldErrors.location = "Choose where the schedule is held.";
    } else {
      location = await getDutyLocation(input.locationId);
      if (!location) {
        fieldErrors.location = "That location is not in the catalogue.";
      } else if (!location.is_active) {
        fieldErrors.location = "That location is no longer offered.";
      }
    }
  }

  const start = parseTime(input.startTime);
  const end = parseTime(input.endTime);
  if (input.startTime !== undefined && !start) {
    fieldErrors.start_time = "A schedule needs a start time.";
  }
  if (input.endTime !== undefined && !end) {
    fieldErrors.end_time = "A schedule needs an end time.";
  }
  if (start && end && end.getTime() <= start.getTime()) {
    fieldErrors.end_time = "The end time must be after the start time.";
  }

  return { fieldErrors, location, start, end };
}

/** Create a duty. The location and the times are required. */
export async function createDuty(input: DutyWrite, actorId: number): Promise<DutyRecord> {
  const { fieldErrors, location, start, end } = await validateDutyWrite(input);
  if (Object.keys(fieldErrors).length > 0) throw new ValidationError(fieldErrors);
  if (!start) throw new ValidationError({ start_time: "A schedule needs a start time." });
  if (!end) throw new ValidationError({ end_time: "A schedule needs an end time." });

  const conflicts = await detectConflicts({
    startTime: start,
    endTime: end,
    locationId: input.locationId,
    requiresExclusiveLocation: input.requiresExclusiveLocation,
    studentIds: input.studentIds,
    teacherId: input.assignedTo ?? null,
  });
  if (conflicts.length > 0) throw new ConflictError(conflicts);

  const { rows } = await getPool().query<DutyRecord>(
    `INSERT INTO duties (title, description, area, status, start_time, end_time,
                         assigned_to, assigned_by, required_headcount, class_group,
                         location_id, requires_exclusive_location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,1),$10,$11,$12)
     RETURNING id`,
    [
      input.title.trim(),
      input.description ?? null,
      location?.name ?? input.title.trim(),
      input.status && DUTY_STATUSES.includes(input.status) ? input.status : "pending",
      input.startTime,
      input.endTime ?? null,
      input.assignedTo ?? null,
      actorId,
      input.requiredHeadcount ?? null,
      input.classGroup ?? null,
      input.locationId,
      input.requiresExclusiveLocation ?? false,
    ],
  );
  const created = rows[0];
  if (input.studentIds && input.studentIds.length > 0) {
    await setDutyStudents(created.id, input.studentIds);
  }
  const duty = await getDuty(created.id);
  return duty ?? ({ ...created, title: input.title, area: location?.name ?? "" } as DutyRecord);
}

/** Update a duty. The location and the times are required. */
export async function updateDuty(
  id: number,
  input: Partial<DutyWrite>,
): Promise<DutyRecord | null> {
  const existing = await getDuty(id);
  if (!existing) return null;

  const { fieldErrors, location } = await validateDutyWrite(input);
  if (Object.keys(fieldErrors).length > 0) throw new ValidationError(fieldErrors);

  const startTime = input.startTime ?? existing.start_time.toISOString();
  const endTime = input.endTime === undefined ? existing.end_time : input.endTime;
  const locationId = input.locationId ?? existing.location_id;
  const requiresExclusive =
    input.requiresExclusiveLocation ?? existing.requires_exclusive_location;
  const teacherId = input.assignedTo === undefined ? existing.assignee_id : input.assignedTo;
  const studentIds =
    input.studentIds === undefined ? undefined : [...new Set(input.studentIds)];

  if (input.startTime !== undefined || input.endTime !== undefined) {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (!start) throw new ValidationError({ start_time: "A schedule needs a start time." });
    if (!end) throw new ValidationError({ end_time: "A schedule needs an end time." });
    if (end.getTime() <= start.getTime()) {
      throw new ValidationError({ end_time: "The end time must be after the start time." });
    }
  }

  const conflicts = await detectConflicts({
    dutyId: id,
    startTime,
    endTime,
    locationId,
    requiresExclusiveLocation: requiresExclusive,
    studentIds,
    teacherId: teacherId ?? null,
  });
  if (conflicts.length > 0) throw new ConflictError(conflicts);

  const fields: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  const push = (column: string, value: unknown): void => {
    fields.push(`${column} = $${index++}`);
    params.push(value);
  };

  if (input.title !== undefined) push("title", input.title.trim());
  if (input.description !== undefined) push("description", input.description || null);
  if (input.status !== undefined && DUTY_STATUSES.includes(input.status)) push("status", input.status);
  if (input.startTime !== undefined) push("start_time", input.startTime);
  if (input.endTime !== undefined) push("end_time", input.endTime || null);
  if (input.assignedTo !== undefined) push("assigned_to", input.assignedTo || null);
  if (input.classGroup !== undefined) push("class_group", input.classGroup || null);
  if (input.requiredHeadcount !== undefined) {
    push("required_headcount", input.requiredHeadcount || 1);
  }
  if (input.locationId !== undefined) {
    push("location_id", input.locationId);
    if (location) push("area", location.name);
  }
  if (input.requiresExclusiveLocation !== undefined) {
    push("requires_exclusive_location", input.requiresExclusiveLocation);
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

/**
 * Cancel a duty. The cancellation is recorded on the duty and takes
 * precedence over the derived status.
 */
export async function cancelDuty(id: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    "UPDATE duties SET status = 'cancelled', updated_at = now() WHERE id = $1",
    [id],
  );
  return (rowCount || 0) > 0;
}

/** The students assigned to a duty. */
export async function listDutyAssignments(dutyId: number): Promise<DutyAssignment[]> {
  const { rows } = await getPool().query<DutyAssignment>(
    `SELECT da.id, da.duty_id, da.student_id, da.status, da.completed_at, da.completed_by,
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

/** The students of each of the given duties, with their names, keyed by duty id. */
export async function listStudentsForDuties(
  dutyIds: number[],
): Promise<Record<number, { id: number; name: string; student_id: string }[]>> {
  const grouped: Record<number, { id: number; name: string; student_id: string }[]> = {};
  if (dutyIds.length === 0) return grouped;
  const { rows } = await getPool().query<{
    duty_id: number;
    id: number;
    name: string;
    student_id: string;
  }>(
    `SELECT da.duty_id, u.id, u.name, u.school_id AS student_id
     FROM duty_assignments da
     JOIN users u ON u.id = da.student_id
     WHERE da.duty_id = ANY($1::bigint[])
     ORDER BY u.name ASC`,
    [dutyIds],
  );
  for (const row of rows) {
    const bucket = grouped[row.duty_id] ?? (grouped[row.duty_id] = []);
    bucket.push({ id: row.id, name: row.name, student_id: row.student_id });
  }
  return grouped;
}

/**
 * Replace the students assigned to a duty with exactly the given ids.
 *
 * The same student named twice in one submission is refused and the duty's
 * student list is left as it was. A student who is already on the duty is
 * never added a second time.
 */
export async function setDutyStudents(dutyId: number, studentIds: number[]): Promise<void> {
  const ids = (studentIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw new ValidationError({
      student_ids: "The same student was named twice.",
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM duty_assignments WHERE duty_id = $1", [dutyId]);
    for (const studentId of unique) {
      await client.query(
        `INSERT INTO duty_assignments (duty_id, student_id, status)
         SELECT $1, u.id, 'assigned' FROM users u
         WHERE u.id = $2 AND u.role = 'STUDENT' AND u.is_active = TRUE
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

/**
 * Give a duty its supervising teacher, or take the teacher away.
 * Only active teachers are offered, and a teacher who is already busy at
 * that time is refused.
 */
export async function assignDutyTeacher(
  dutyId: number,
  teacherId: number | null,
): Promise<DutyRecord | null> {
  const duty = await getDuty(dutyId);
  if (!duty) return null;

  if (teacherId !== null && teacherId !== undefined) {
    const { rows } = await getPool().query<{ id: number; role: string; is_active: boolean }>(
      "SELECT id, role, is_active FROM users WHERE id = $1",
      [teacherId],
    );
    const teacher = rows[0];
    if (!teacher || teacher.role !== "TEACHER" || !teacher.is_active) {
      throw new ValidationError({ assigned_to: "That teacher is not an active teacher account." });
    }
    const conflicts = await detectConflicts({
      dutyId,
      startTime: duty.start_time,
      endTime: duty.end_time,
      locationId: duty.location_id,
      requiresExclusiveLocation: duty.requires_exclusive_location,
      teacherId,
    });
    if (conflicts.length > 0) throw new ConflictError(conflicts);
  }

  await getPool().query(
    "UPDATE duties SET assigned_to = $2, updated_at = now() WHERE id = $1",
    [dutyId, teacherId ?? null],
  );
  return getDuty(dutyId);
}

/** What an assignment write changes. */
export interface DutyAssignmentWrite {
  /** The students the duty now has; the whole set is replaced. */
  studentIds?: number[];
  /** The teacher who supervises the duty; null takes the teacher away. */
  teacherId?: number | null;
}

/**
 * Change who is on a duty and who supervises it.
 *
 * The clashes are checked first, so a write that would double-book a student,
 * a teacher or an exclusive location is refused and nothing is written.
 */
export async function assignDuty(
  dutyId: number,
  input: DutyAssignmentWrite,
): Promise<DutyRecord | null> {
  const duty = await getDuty(dutyId);
  if (!duty) return null;

  const studentIds =
    input.studentIds === undefined ? undefined : [...new Set(input.studentIds)];
  if (input.studentIds !== undefined) {
    const ids = input.studentIds.filter((id) => Number.isInteger(id) && id > 0);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError({ student_ids: "The same student was named twice." });
    }
  }
  const teacherId = input.teacherId === undefined ? duty.assignee_id : input.teacherId;

  if (teacherId !== null && teacherId !== undefined) {
    const { rows } = await getPool().query<{ id: number; role: string; is_active: boolean }>(
      "SELECT id, role, is_active FROM users WHERE id = $1",
      [teacherId],
    );
    const teacher = rows[0];
    if (!teacher || teacher.role !== "TEACHER" || !teacher.is_active) {
      throw new ValidationError({ assigned_to: "That teacher is not an active teacher account." });
    }
  }

  const conflicts = await detectConflicts({
    dutyId,
    startTime: duty.start_time,
    endTime: duty.end_time,
    locationId: duty.location_id,
    requiresExclusiveLocation: duty.requires_exclusive_location,
    studentIds,
    teacherId: teacherId ?? null,
  });
  if (conflicts.length > 0) throw new ConflictError(conflicts);

  if (studentIds !== undefined) await setDutyStudents(dutyId, studentIds);
  if (input.teacherId !== undefined) {
    await getPool().query(
      "UPDATE duties SET assigned_to = $2, updated_at = now() WHERE id = $1",
      [dutyId, input.teacherId ?? null],
    );
  }
  return getDuty(dutyId);
}

/* ---------------------------------------------------------------------------
   Completion
   --------------------------------------------------------------------------- */

/** Who is recording a completion. */
export interface CompletionActor {
  id: number;
  role: "STUDENT" | "TEACHER" | "CSDL";
}

/**
 * Only the teacher supervising the duty and CSDL may record a completion.
 */
async function assertMayComplete(dutyId: number, actor: CompletionActor): Promise<void> {
  const { rows } = await getPool().query<{ assigned_to: number | null }>(
    "SELECT assigned_to FROM duties WHERE id = $1",
    [dutyId],
  );
  const duty = rows[0];
  if (!duty) throw new ForbiddenError("That duty no longer exists.");
  if (actor.role === "CSDL") return;
  if (actor.role === "TEACHER" && duty.assigned_to === actor.id) return;
  throw new ForbiddenError("Only the supervising teacher or CSDL may record a completion.");
}

/**
 * Record a duty as complete: every assignment of the duty carries the
 * completion, its recorder and the time, in one transaction.
 */
export async function recordCompletion(
  dutyId: number,
  actor: CompletionActor,
): Promise<number> {
  await assertMayComplete(dutyId, actor);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE duty_assignments
       SET status = 'completed', completed_at = now(), completed_by = $2
       WHERE duty_id = $1`,
      [dutyId, actor.id],
    );
    await client.query("COMMIT");
    return rowCount || 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Record one student's completion. The other students of the duty are left
 * as they are.
 */
export async function recordStudentCompletion(
  assignmentId: number,
  actor: CompletionActor,
): Promise<boolean> {
  const { rows } = await getPool().query<{ id: number; duty_id: number }>(
    "SELECT id, duty_id FROM duty_assignments WHERE id = $1",
    [assignmentId],
  );
  const assignment = rows[0];
  if (!assignment) return false;
  await assertMayComplete(assignment.duty_id, actor);
  const { rowCount } = await getPool().query(
    `UPDATE duty_assignments
     SET status = 'completed', completed_at = now(), completed_by = $2
     WHERE id = $1`,
    [assignmentId, actor.id],
  );
  return (rowCount || 0) > 0;
}
