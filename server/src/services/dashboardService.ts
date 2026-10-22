/**
 * Dashboard data service — queries the real database.
 * Tables used: users, duties (created by migrations 003/004).
 */
import { getPool } from "../db/pool";
import { dutyStatusSql } from "./dutyService";

export interface DashboardTotals {
  /** Students assigned to at least one duty in the period. */
  students: number;
  /** Every student account in the school — the denominator for the caption. */
  studentsTotal: number;
  completed: number;
  ongoing: number;
  assignments: number;
  pendingApplications: number;
  cancelled: number;
}

export interface AssignmentToday {
  id: number;
  date: string;
  time: string;
  /** The duty's location: the catalogue name, or the area text of a legacy duty. */
  area: string;
  tasks: string;
  status: string;
  /** The supervising teacher, or null when the duty has none. */
  teacher: string | null;
  /** The students on the duty. */
  students: { id: number; name: string; student_id: string }[];
  /** How many students are on the duty. */
  studentCount: number;
  /** How many of them are recorded complete. */
  completedCount: number;
}

export interface DashboardData {
  totals: DashboardTotals;
  assignmentsToday: AssignmentToday[];
}

/** Compute Manila (Asia/Manila, UTC+8) start/end of day for a given UTC date. */
function manilaDayBounds(utcDate: Date): { from: Date; to: Date } {
  // Get the date components in Manila timezone
  const manilaString = utcDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const manilaDate = new Date(manilaString);

  const from = new Date(manilaDate);
  from.setHours(0, 0, 0, 0);

  const to = new Date(manilaDate);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

/** Compute the start/end of the Manila week (Sunday-Saturday) containing the date. */
function manilaWeekBounds(utcDate: Date): { from: Date; to: Date } {
  const manilaString = utcDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const manilaDate = new Date(manilaString);

  const day = manilaDate.getDay(); // 0 = Sunday
  const from = new Date(manilaDate);
  from.setDate(manilaDate.getDate() - day);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

/** Compute the start/end of the Manila month containing the date. */
function manilaMonthBounds(utcDate: Date): { from: Date; to: Date } {
  const manilaString = utcDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const manilaDate = new Date(manilaString);

  const from = new Date(manilaDate.getFullYear(), manilaDate.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(manilaDate.getFullYear(), manilaDate.getMonth() + 1, 0, 23, 59, 59, 999);

  return { from, to };
}

/** Format a date as "Wednesday, October 21, 2026" in Manila. */
function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format a date range label, e.g. "Oct 19 - Oct 25, 2026". */
function formatRangeLabel(from: Date, to: Date): string {
  const fromStr = from.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const toStr = to.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fromStr} - ${toStr}`;
}

/** Parse range params from the request query. Returns { from, to, rangeLabel, rangeKey }. */
export function computeRange(query: Record<string, string>): {
  from: Date;
  to: Date;
  rangeLabel: string;
  rangeKey: string;
} {
  const range = query.range || "today";
  const fromParam = query.from;
  const toParam = query.to;
  const now = new Date();

  let from: Date;
  let to: Date;
  let rangeLabel: string;
  let rangeKey: string;

  if (range === "today") {
    const b = manilaDayBounds(now);
    from = b.from;
    to = b.to;
    rangeKey = "today";
    rangeLabel = formatLongDate(from);
  } else if (range === "week") {
    const b = manilaWeekBounds(now);
    from = b.from;
    to = b.to;
    rangeKey = "week";
    rangeLabel = formatRangeLabel(from, to);
  } else if (range === "month") {
    const b = manilaMonthBounds(now);
    from = b.from;
    to = b.to;
    rangeKey = "month";
    rangeLabel = formatRangeLabel(from, to);
  } else if (range === "custom" && fromParam && toParam) {
    const parsedFrom = new Date(fromParam + "T00:00:00+08:00");
    const parsedTo = new Date(toParam + "T23:59:59+08:00");
    if (!isNaN(parsedFrom.getTime()) && !isNaN(parsedTo.getTime()) && parsedTo >= parsedFrom) {
      from = parsedFrom;
      to = parsedTo;
      rangeKey = "custom";
      rangeLabel = formatRangeLabel(from, to);
    } else {
      // Invalid custom range, fall back to today
      const b = manilaDayBounds(now);
      from = b.from;
      to = b.to;
      rangeKey = "today";
      rangeLabel = formatLongDate(from);
    }
  } else {
    const b = manilaDayBounds(now);
    from = b.from;
    to = b.to;
    rangeKey = "today";
    rangeLabel = formatLongDate(from);
  }

  return { from, to, rangeLabel, rangeKey };
}

/**
 * Dashboard summary for a given date range.
 * Computes all 4 KPIs and the assignments table from the duties table.
 */
export async function getDashboardSummary(
  actor: { role: string; school_id: string; full_name: string },
  range: { from: Date; to: Date },
): Promise<DashboardData> {
  const pool = getPool();

  // All duties in the range, with their derived status, their location and
  // their supervising teacher.
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.area, (${dutyStatusSql}) AS status, d.start_time, d.end_time,
            COALESCE(l.name, d.area) AS location,
            u.id AS assigned_to_id, u.school_id, u.name AS full_name, u.role,
            (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) AS student_count,
            (SELECT count(*)::int FROM duty_assignments da
              WHERE da.duty_id = d.id AND COALESCE(da.status, 'assigned') = 'completed') AS completed_count
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     LEFT JOIN duty_locations l ON l.id = d.location_id
     WHERE d.start_time >= $1 AND d.start_time <= $2
     ORDER BY d.start_time ASC`,
    [range.from, range.to],
  );

  // The students of every duty in the range, so the table can name them.
  const { rows: studentRows } = await pool.query(
    `SELECT da.duty_id, u.id, u.name, u.school_id AS student_id
     FROM duty_assignments da
     JOIN users u ON u.id = da.student_id
     JOIN duties d ON d.id = da.duty_id
     WHERE d.start_time >= $1 AND d.start_time <= $2
     ORDER BY u.name ASC`,
    [range.from, range.to],
  );
  const studentsByDuty = new Map<number, { id: number; name: string; student_id: string }[]>();
  for (const row of studentRows) {
    const bucket = studentsByDuty.get(row.duty_id) ?? [];
    bucket.push({ id: row.id, name: row.name, student_id: row.student_id });
    studentsByDuty.set(row.duty_id, bucket);
  }

  // Total students: the distinct students assigned to a duty in the period.
  // A duty's `assigned_to` is the staff member in charge of it, so the
  // students come from the assignment rows, not from that column.
  const { rows: distinctStudents } = await pool.query(
    `SELECT count(DISTINCT da.student_id)::int AS assigned
     FROM duty_assignments da
     JOIN duties d ON d.id = da.duty_id
     WHERE d.start_time >= $1 AND d.start_time <= $2`,
    [range.from, range.to],
  );
  const students = Number(distinctStudents[0]?.assigned ?? 0);

  // The denominator of the "Total Students" caption: every student account.
  const { rows: studentTotalRows } = await pool.query(
    `SELECT count(*)::int AS total FROM users WHERE role = 'STUDENT'`,
  );
  const studentsTotal = Number(studentTotalRows[0]?.total ?? 0);

  // Completed and ongoing follow the derived status, so the counts and the
  // rows always agree.
  const completed = rows.filter((r) => r.status === "completed").length;
  const ongoing = rows.filter((r) => r.status === "ongoing").length;

  // Assignment: every duty in the period.
  const assignments = rows.length;

  // Assignments table detail
  const assignmentsToday: AssignmentToday[] = rows.map((r) => ({
    id: r.id,
    date: new Date(r.start_time).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: new Date(r.start_time).toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    area: r.location || "",
    tasks: r.title || "",
    status: (r.status || "ongoing")
      .charAt(0)
      .toUpperCase() + (r.status || "ongoing").slice(1),
    teacher: r.full_name || null,
    students: studentsByDuty.get(r.id) ?? [],
    studentCount: Number(r.student_count) || 0,
    completedCount: Number(r.completed_count) || 0,
  }));

  return {
    totals: {
      students,
      studentsTotal,
      completed,
      ongoing,
      assignments,
      pendingApplications: 0, // applications table not yet in schema
      cancelled: rows.filter((r) => r.status === "cancelled").length,
    },
    assignmentsToday,
  };
}
