/**
 * Stub dashboard data service.
 * Returns zeroed totals and an empty assignments-today list so the template
 * can render without any real backend. Wiring the real backend later means
 * changing only this service.
 */

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

export function getDashboardData(): DashboardData {
  return {
    totals: {
      students: 0,
      completed: 0,
      ongoing: 0,
      assignments: 0,
      pendingApplications: 0,
      missed: 0,
    },
    assignmentsToday: [],
  };
}
