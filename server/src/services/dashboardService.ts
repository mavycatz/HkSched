/**
 * Dashboard data service — queries the real database.
 * Tables used: users, duties, duty_assignments (created by migrations 003/004).
 */
import { getPool } from "../db/pool";

export interface DashboardTotals {
  students: number;
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

export async function getDashboardData(): Promise<DashboardData> {
  const pool = getPool();

  // Total students
  const { rows: studentRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE role = 'STUDENT' AND is_active = true`
  );
  const students = studentRows[0].n;

  // Duty status counts
  const { rows: dutyRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM duties GROUP BY status`
  );
  const dutyCounts: Record<string, number> = {};
  for (const r of dutyRows) {
    dutyCounts[r.status] = r.n;
  }

  // Total assignments today (duty_assignments joined with duties starting today)
  const { rows: assignmentRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM duty_assignments da
     JOIN duties d ON d.id = da.duty_id
     WHERE d.start_time::date = CURRENT_DATE`
  );
  const assignmentsTodayCount = assignmentRows[0].n;

  // Today's assignments detail
  const { rows: todayRows } = await pool.query(
    `SELECT d.start_time::date AS date,
            to_char(d.start_time, 'HH12:MI AM') AS time,
            d.area AS area,
            d.title AS tasks,
            d.status AS status
     FROM duties d
     WHERE d.start_time::date = CURRENT_DATE
     ORDER BY d.start_time ASC`
  );
  const assignmentsToday: AssignmentToday[] = todayRows.map((r) => ({
    date: r.date ? new Date(r.date).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) : "",
    time: r.time || "",
    area: r.area || "",
    tasks: r.tasks || "",
    status: (r.status || "ongoing").charAt(0).toUpperCase() + (r.status || "ongoing").slice(1),
  }));

  return {
    totals: {
      students,
      completed: dutyCounts.completed || 0,
      ongoing: dutyCounts.ongoing || 0,
      assignments: assignmentsTodayCount,
      pendingApplications: 0, // applications table not yet in schema
      missed: dutyCounts.missed || 0,
    },
    assignmentsToday,
  };
}
