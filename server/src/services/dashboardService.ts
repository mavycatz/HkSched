/**
 * Dashboard data service — queries the real database.
 * Tables used: users, duties (created by migrations 003/004).
 */
import { getPool } from "../db/pool";

export interface DashboardTotals {
  /** Students assigned to at least one duty in the period. */
  students: number;
  /** Every student account in the school — the denominator for the caption. */
  studentsTotal: number;
  completed: number;
  ongoing: number;
  assignments: number;
  pendingApplications: number;
  missed: number;
}

export interface AssignmentToday {
  date: string;
  time: string;
  area: string;
  tasks: string;
  status: string;
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

  // All duties in the range, joined with assignee info
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.area, d.status, d.start_time, d.end_time,
            u.id AS assigned_to_id, u.school_id, u.name AS full_name, u.role
     FROM duties d
     LEFT JOIN users u ON u.id = d.assigned_to
     WHERE d.start_time >= $1 AND d.start_time <= $2
     ORDER BY d.start_time ASC`,
    [range.from, range.to],
  );

  // Total students: the distinct students assigned to a duty in the period.
  // A duty's `assigned_to` is the staff member in charge of it, so the
  // students come from the assignment rows, not from that column.
  const { rows: studentRows } = await pool.query(
    `SELECT count(DISTINCT da.student_id)::int AS assigned
     FROM duty_assignments da
     JOIN duties d ON d.id = da.duty_id
     WHERE d.start_time >= $1 AND d.start_time <= $2`,
    [range.from, range.to],
  );
  const students = Number(studentRows[0]?.assigned ?? 0);

  // The denominator of the "Total Students" caption: every student account.
  const { rows: studentTotalRows } = await pool.query(
    `SELECT count(*)::int AS total FROM users WHERE role = 'STUDENT'`,
  );
  const studentsTotal = Number(studentTotalRows[0]?.total ?? 0);

  // Completed: duties with status 'completed' in the period
  const completed = rows.filter((r) => r.status === "completed").length;

  // Ongoing: duties with status 'ongoing' in the period. `duties.status` is
  // constrained to ongoing, completed, pending and missed, so there is no
  // other status to exclude.
  const ongoing = rows.filter((r) => r.status === "ongoing").length;

  // Assignment: every duty in the period.
  const assignments = rows.length;

  // Assignments table detail
  const assignmentsToday: AssignmentToday[] = rows.map((r) => ({
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
    area: r.area || "",
    tasks: r.title || "",
    status: (r.status || "ongoing")
      .charAt(0)
      .toUpperCase() + (r.status || "ongoing").slice(1),
  }));

  return {
    totals: {
      students,
      studentsTotal,
      completed,
      ongoing,
      assignments,
      pendingApplications: 0, // applications table not yet in schema
      missed: rows.filter((r) => r.status === "missed").length,
    },
    assignmentsToday,
  };
}
